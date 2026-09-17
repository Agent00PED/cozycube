import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Room } from "colyseus.js";
import type { Group } from "three";
import type { ChairSyncState, PlayerState, ToggleableSyncState } from "@shared/types";

const MOVE_SPEED = 3; // units/sec — must match MOVE_SPEED_PER_SEC in server/src/rooms/HangoutRoom.ts
const SEND_INTERVAL = 0.048; // ~48ms network throttle (plus an immediate send on direction change)
const DIR_CHANGE_EPSILON = 0.2; // how much the heading must change to justify an off-schedule send
// Only a genuinely broken desync snaps. Normal prediction drift is left alone and converges on
// its own; snapping on small deltas is what made walking look like it was stuttering backwards.
const DESYNC_SNAP_THRESHOLD = 1.2;
const ARRIVE_THRESHOLD = 0.06; // world units from target counted as "arrived"
const TURN_LERP = 0.25; // eases the facing direction instead of snapping it on a new click
const INTERACT_RADIUS = 1.5;
const NEARBY_CHECK_INTERVAL = 1 / 10;

export interface NearbyInteractable {
  kind: "chair" | "toggleable";
  propId: string;
  x: number;
  z: number;
}

export interface MoveTarget {
  x: number;
  z: number;
  /** When set, the player sits on this seat once they arrive. */
  seatId?: string;
  /** Guard against re-sending the sit every frame while standing on the arrival spot. Lives on
   *  the target object (not a ref) so a fresh click always gets a fresh attempt — a latched ref
   *  would make a seat permanently unclickable after a single failed sit. */
  sitSent?: boolean;
}

function findNearest(
  x: number,
  z: number,
  mySessionId: string,
  chairs: Record<string, ChairSyncState>,
  toggleables: Record<string, ToggleableSyncState>
): NearbyInteractable | null {
  let best: NearbyInteractable | null = null;
  let bestDist = INTERACT_RADIUS;

  for (const chair of Object.values(chairs)) {
    if (chair.occupiedBy !== "" && chair.occupiedBy !== mySessionId) continue; // taken by someone else
    const dist = Math.hypot(x - chair.x, z - chair.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = { kind: "chair", propId: chair.propId, x: chair.x, z: chair.z };
    }
  }
  for (const prop of Object.values(toggleables)) {
    const dist = Math.hypot(x - prop.x, z - prop.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = { kind: "toggleable", propId: prop.propId, x: prop.x, z: prop.z };
    }
  }
  return best;
}

// Shortest-path angle lerp — without the wrap, turning across the -PI/+PI seam spins the
// character the long way round.
function lerpAngle(from: number, to: number, t: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

// Click-to-move with the CLIENT as the visual authority. Local prediction runs every frame and
// is what you see; the server validates the reported position and only ever yanks it back if
// the two have diverged past DESYNC_SNAP_THRESHOLD (a real desync, e.g. a map change or a
// rejected move), never for ordinary drift.
export function useLocalPlayerMovement(
  groupRef: React.RefObject<Group>,
  room: Room | null,
  player: PlayerState,
  chairs: Record<string, ChairSyncState>,
  toggleables: Record<string, ToggleableSyncState>,
  onNearbyChange: (nearby: NearbyInteractable | null) => void,
  // Written to by the floor's onPointerDown handler (see ProceduralRoom.tsx) and by seat
  // clicks — the shared "walk here" target, lifted up to WorldScene so the click marker can
  // read the same state.
  targetPosRef: React.MutableRefObject<MoveTarget | null>,
  // Read by Character3D's walk-cycle wobble/bob animation — 0 when stationary, 1 when moving.
  speedRef: React.MutableRefObject<number>
) {
  const posRef = useRef({ x: player.x, z: player.z });
  const facingRef = useRef(0);
  const sendTimerRef = useRef(0);
  const lastSentDirRef = useRef({ x: 0, z: 0 });
  const nearbyTimerRef = useRef(0);
  const seqRef = useRef(0);
  const initializedRef = useRef(false);
  const sitWaitRef = useRef(0);

  useEffect(() => {
    if (player.sitting) {
      posRef.current = { x: player.x, z: player.z };
      return;
    }
    if (!initializedRef.current) {
      posRef.current = { x: player.x, z: player.z };
      initializedRef.current = true;
      return;
    }
    const drift = Math.hypot(player.x - posRef.current.x, player.z - posRef.current.z);
    if (drift > DESYNC_SNAP_THRESHOLD) {
      posRef.current = { x: player.x, z: player.z }; // real desync (map change, rejected move) -> snap
    }
    // Anything smaller is deliberately ignored: the client's own prediction stays on screen.
  }, [player.x, player.z, player.sitting]);

  // Sitting down and standing up are both server-authored teleports (onto the seat, and back
  // out to the seat's approach point — see handleStandUp, which exists because seats live
  // inside their furniture's collision box). Adopt the server position verbatim on either
  // transition; the usual drift tolerance must NOT swallow these, or the client would keep
  // walking out of a spot the server has already vacated.
  const prevSittingRef = useRef(player.sitting);
  useEffect(() => {
    if (prevSittingRef.current !== player.sitting) {
      prevSittingRef.current = player.sitting;
      posRef.current = { x: player.x, z: player.z };
      // Standing up must NOT clear the target: it is normally triggered BY a floor click that
      // has already queued the walk the player wants, and clearing it would eat that click.
      if (player.sitting) targetPosRef.current = null; // seated — nothing left to walk to
      sitWaitRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.sitting]);

  useFrame((_, delta) => {
    let dirX = 0;
    let dirZ = 0;

    if (!player.sitting) {
      const target = targetPosRef.current;
      if (target) {
        const dx = target.x - posRef.current.x;
        const dz = target.z - posRef.current.z;
        const distance = Math.hypot(dx, dz);

        if (distance > ARRIVE_THRESHOLD) {
          dirX = dx / distance;
          dirZ = dz / distance;
          // Never overshoot the target on a long frame.
          const step = Math.min(MOVE_SPEED * delta, distance);
          posRef.current.x += dirX * step;
          posRef.current.z += dirZ * step;
          facingRef.current = lerpAngle(facingRef.current, Math.atan2(dirX, dirZ), TURN_LERP);
        } else if (target.seatId && room && !target.sitSent) {
          // Arrived at a seat's approach point. Send the arrival position WITH the sit request:
          // the server's copy of our position is only as fresh as the last throttled report, and
          // proximity is checked against it, so relying on that alone loses the race and the sit
          // is silently rejected. Keep the target alive until the server confirms `sitting`.
          target.sitSent = true;
          room.send("interactChair", {
            chairId: target.seatId,
            x: posRef.current.x,
            z: posRef.current.z,
          });
        } else if (!target.seatId) {
          targetPosRef.current = null; // plain walk finished; dirX/dirZ stay 0, sent as the stop below
        } else {
          // Sit already requested; give the server a moment to confirm. If it never does (seat
          // taken in the meantime, request dropped) give up rather than pulsing the marker
          // forever.
          sitWaitRef.current += delta;
          if (sitWaitRef.current > 1.5) {
            sitWaitRef.current = 0;
            targetPosRef.current = null;
          }
        }
      }

      if (room) {
        sendTimerRef.current += delta;
        const last = lastSentDirRef.current;
        const dirChanged =
          Math.abs(dirX - last.x) > DIR_CHANGE_EPSILON || Math.abs(dirZ - last.z) > DIR_CHANGE_EPSILON;
        // Send on the throttle tick while actually moving, or immediately when the heading
        // changes (including the stop at the end of a walk) so remote players see turns without
        // a throttle delay. A standing-still player sends the stop once and then goes quiet
        // instead of heartbeating an unchanged position forever.
        const moving = dirX !== 0 || dirZ !== 0;
        if (dirChanged || (moving && sendTimerRef.current >= SEND_INTERVAL)) {
          sendTimerRef.current = 0;
          lastSentDirRef.current = { x: dirX, z: dirZ };
          room.send("move", {
            dirX,
            dirZ,
            x: posRef.current.x,
            z: posRef.current.z,
            seq: seqRef.current++,
          });
        }
      }
    }

    speedRef.current = Math.hypot(dirX, dirZ);

    if (groupRef.current) {
      groupRef.current.position.set(posRef.current.x, 0, posRef.current.z);
      groupRef.current.rotation.y = player.sitting ? player.sitRotationY : facingRef.current;
    }

    nearbyTimerRef.current += delta;
    if (nearbyTimerRef.current >= NEARBY_CHECK_INTERVAL) {
      nearbyTimerRef.current -= NEARBY_CHECK_INTERVAL;
      onNearbyChange(findNearest(posRef.current.x, posRef.current.z, player.sessionId, chairs, toggleables));
    }
  });
}
