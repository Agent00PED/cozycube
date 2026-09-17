import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Room } from "colyseus.js";
import type { Group } from "three";
import type { PlayerState } from "@shared/types";
import { cameraFocus } from "../scene/cameraFocus";

const MOVE_SPEED = 3; // units/sec — must match MOVE_SPEED_PER_SEC in server/src/rooms/HangoutRoom.ts
const SEND_INTERVAL = 0.048; // ~48ms network throttle (plus an immediate send on direction change)
const DIR_CHANGE_EPSILON = 0.2; // how much the heading must change to justify an off-schedule send
// Only a genuinely broken desync snaps. Normal prediction drift is left alone and converges on
// its own; snapping on small deltas is what made walking look like it was stuttering backwards.
const DESYNC_SNAP_THRESHOLD = 1.2;
const ARRIVE_THRESHOLD = 0.06; // world units from target counted as "arrived"
const TURN_LERP = 0.25; // eases the facing direction instead of snapping it on a new click
const SIT_CONFIRM_TIMEOUT = 1.5; // seconds to wait for the server to confirm a sit
const SEAT_HEIGHT_LERP = 0.2;
// A backgrounded tab, a GC pause or a slow phone can deliver one frame spanning whole seconds.
// Integrating that raw would move the player many units in a single step and send one huge,
// implausible report. Capping the step means a hitch just pauses the walk briefly instead.
const MAX_FRAME_DELTA = 0.1;

export interface MoveTarget {
  x: number;
  z: number;
  /** When set, the player sits on this seat once they arrive. */
  seatId?: string;
  /** When set, the player uses this walk-up prop (espresso machine, arcade) once they arrive. */
  propId?: string;
  /** Guard against re-sending on arrival. Lives on the target object (not a ref) so a fresh
   *  click always gets a fresh attempt — a latched ref would make a seat permanently unclickable
   *  after a single failed sit. */
  sent?: boolean;
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
  // Written by floor, seat and prop clicks (see WorldScene) — the shared "walk here" target,
  // lifted up so the click marker can read the same state.
  targetPosRef: React.MutableRefObject<MoveTarget | null>,
  // Read by Character3D's gait animation — 0 when stationary, 1 when moving.
  speedRef: React.MutableRefObject<number>
) {
  const posRef = useRef({ x: player.x, z: player.z });
  const facingRef = useRef(0);
  const sendTimerRef = useRef(0);
  const lastSentDirRef = useRef({ x: 0, z: 0 });
  const seqRef = useRef(0);
  const initializedRef = useRef(false);
  const sitWaitRef = useRef(0);
  const seatYRef = useRef(0);

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
      // Standing up must NOT clear the target: it is normally triggered BY a click that has
      // already queued the walk the player wants. Clearing it would eat that click.
      if (player.sitting) targetPosRef.current = null; // seated — nothing left to walk to
      sitWaitRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.sitting]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);
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
        } else if (target.propId && room) {
          // Arrived at a walk-up prop. The arrival position rides along with the request: the
          // server's copy of our position is only as fresh as the last throttled report.
          room.send("useProp", { propId: target.propId, x: posRef.current.x, z: posRef.current.z });
          targetPosRef.current = null;
        } else if (target.seatId && room && !target.sent) {
          // Same race for seats. Keep the target alive until the server confirms `sitting`.
          target.sent = true;
          room.send("interactChair", { chairId: target.seatId, x: posRef.current.x, z: posRef.current.z });
        } else if (!target.seatId) {
          targetPosRef.current = null; // plain walk finished; dirX/dirZ stay 0, sent as the stop below
        } else {
          // Sit already requested. If the server never confirms (seat taken meanwhile, request
          // dropped), give up rather than pulsing the destination marker forever.
          sitWaitRef.current += delta;
          if (sitWaitRef.current > SIT_CONFIRM_TIMEOUT) {
            sitWaitRef.current = 0;
            targetPosRef.current = null;
          }
        }
      }

      if (room) {
        sendTimerRef.current += delta;
        const last = lastSentDirRef.current;
        const dirChanged = Math.abs(dirX - last.x) > DIR_CHANGE_EPSILON || Math.abs(dirZ - last.z) > DIR_CHANGE_EPSILON;
        // Send on the throttle tick while actually moving, or immediately when the heading
        // changes (including the stop at the end of a walk) so remote players see turns without
        // a throttle delay. A standing-still player sends the stop once and then goes quiet.
        const moving = dirX !== 0 || dirZ !== 0;
        if (dirChanged || (moving && sendTimerRef.current >= SEND_INTERVAL)) {
          sendTimerRef.current = 0;
          lastSentDirRef.current = { x: dirX, z: dirZ };
          room.send("move", { dirX, dirZ, x: posRef.current.x, z: posRef.current.z, seq: seqRef.current++ });
        }
      }
    }

    speedRef.current = Math.hypot(dirX, dirZ);
    seatYRef.current += ((player.sitting ? player.sitY : 0) - seatYRef.current) * SEAT_HEIGHT_LERP;

    // While seated, keep the walking heading in sync with the seat's facing, so standing up
    // turns smoothly from where you were looking instead of snapping back to the old heading.
    if (player.sitting) facingRef.current = player.sitRotationY;

    if (groupRef.current) {
      groupRef.current.position.set(posRef.current.x, seatYRef.current, posRef.current.z);
      groupRef.current.rotation.y = facingRef.current;
    }

    // Hand the camera the predicted position (not the server's), so it follows what you SEE.
    cameraFocus.x = posRef.current.x;
    cameraFocus.z = posRef.current.z;
    cameraFocus.hasTarget = true;
  });
}
