import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Room } from "colyseus.js";
import type { Group } from "three";
import type { MapId, PlayerState } from "@shared/types";
import { isBlocked, walkY } from "@shared/collision";
import { findPath, type Point } from "@shared/pathfinding";
import { cameraFocus } from "../scene/cameraFocus";

// --- Movement feel ---
const MOVE_SPEED = 3; // units/sec — must match MOVE_SPEED_PER_SEC in server/src/rooms/HangoutRoom.ts
const ACCELERATION = 14; // units/sec^2: ~0.2s to full speed, so starts feel soft, not robotic
const ARRIVE_RADIUS = 0.7; // start easing off this far from the final waypoint
const ARRIVE_THRESHOLD = 0.05; // world units from the final waypoint counted as "arrived"
const WAYPOINT_THRESHOLD = 0.2; // how close counts as reaching an intermediate waypoint
const TURN_LERP = 0.22;
const SEAT_HEIGHT_LERP = 0.2;
const GROUND_LERP = 0.35; // stepping onto the bridge deck / down its ramps
const SIT_CONFIRM_TIMEOUT = 1.5;
// A backgrounded tab or a GC pause can deliver one frame spanning whole seconds; integrating
// that raw would move the player many units in a single step.
const MAX_FRAME_DELTA = 0.1;

// --- Networking ---
// ~16 Hz. Remote players interpolate between these (see RemotePlayerAvatar), so the report
// rate only sets how much latency their view carries, not how smooth it looks.
const SEND_INTERVAL = 1 / 16;
const DIR_CHANGE_EPSILON = 0.2;

// --- Reconciliation ---
// The client is the authority on where you are. The server only ever overrides that for a
// real teleport (a map change, a stand-up to the approach point) or when it has refused an
// impossible report. There is NO hard snap for ordinary drift: small differences are ignored,
// and a genuine correction is blended in over a fraction of a second instead of popping.
const CORRECTION_THRESHOLD = 0.9; // server disagreement worth acting on
const TELEPORT_THRESHOLD = 4; // beyond this it IS a teleport — adopt it instantly
const CORRECTION_BLEND = 0.25; // seconds to glide onto a corrected position

// Collision: the SAME test the server runs, with long steps split so a corner can't be skipped.
const COLLIDE_SUBSTEP = 0.12;
const PLAYER_RADIUS = 0.3;

export interface MoveTarget {
  x: number;
  z: number;
  /** When set, the player sits on this seat once they arrive. */
  seatId?: string;
  /** When set, the player uses this walk-up prop (espresso machine, arcade) once they arrive. */
  propId?: string;
  /** Guard against re-sending on arrival. Lives on the target object (not a ref) so a fresh
   *  click always gets a fresh attempt. */
  sent?: boolean;
  /** Waypoints to walk, filled in by the pathfinder the first frame the target is seen. */
  path?: Point[];
}

function lerpAngle(from: number, to: number, t: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

/** Axis-separated so brushing a wall slides along it, like the server does. */
function slideStep(pos: Point, dx: number, dz: number, mapId: MapId) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / COLLIDE_SUBSTEP));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    const nx = pos.x + sx;
    if (!isBlocked(nx, pos.z, mapId, PLAYER_RADIUS)) pos.x = nx;
    const nz = pos.z + sz;
    if (!isBlocked(pos.x, nz, mapId, PLAYER_RADIUS)) pos.z = nz;
  }
}

// Click-to-move with the CLIENT as the authority: the pathfinder routes round furniture, the
// walk accelerates and eases into its stop, and every step is collided locally, all with zero
// input latency. The server validates the reports for sanity and relays them to everyone else.
export function useLocalPlayerMovement(
  groupRef: React.RefObject<Group>,
  room: Room | null,
  player: PlayerState,
  targetPosRef: React.MutableRefObject<MoveTarget | null>,
  // Read by Character3D's gait animation — 0 when stationary, 1 at full walking speed.
  speedRef: React.MutableRefObject<number>,
  mapId: MapId
) {
  const posRef = useRef({ x: player.x, z: player.z });
  const velocityRef = useRef(0);
  const facingRef = useRef(0);
  const sendTimerRef = useRef(0);
  const lastSentDirRef = useRef({ x: 0, z: 0 });
  const seqRef = useRef(0);
  const initializedRef = useRef(false);
  const sitWaitRef = useRef(0);
  const seatYRef = useRef(0);
  const groundYRef = useRef(0);
  // A server correction being blended in: the offset still to apply, and time left to apply it.
  const correctionRef = useRef({ x: 0, z: 0, remaining: 0 });

  // Reconcile with the server's view of us — see the constants above for the rules.
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
    const dx = player.x - posRef.current.x;
    const dz = player.z - posRef.current.z;
    const drift = Math.hypot(dx, dz);
    if (drift > TELEPORT_THRESHOLD) {
      posRef.current = { x: player.x, z: player.z }; // map change or the like: adopt outright
      targetPosRef.current = null;
      correctionRef.current.remaining = 0;
    } else if (drift > CORRECTION_THRESHOLD) {
      correctionRef.current = { x: dx, z: dz, remaining: CORRECTION_BLEND };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.x, player.z, player.sitting]);

  // Sitting down and standing up are server-authored teleports (onto the seat, and back out
  // to its approach point); adopt the server position verbatim on either transition.
  const prevSittingRef = useRef(player.sitting);
  useEffect(() => {
    if (prevSittingRef.current !== player.sitting) {
      prevSittingRef.current = player.sitting;
      posRef.current = { x: player.x, z: player.z };
      velocityRef.current = 0;
      correctionRef.current.remaining = 0;
      // Standing up must NOT clear the target: it is normally triggered BY a click that has
      // already queued the walk the player wants.
      if (player.sitting) targetPosRef.current = null;
      sitWaitRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.sitting]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);
    const pos = posRef.current;
    let dirX = 0;
    let dirZ = 0;

    // Blend in any pending server correction.
    const correction = correctionRef.current;
    if (correction.remaining > 0) {
      const share = Math.min(1, delta / correction.remaining);
      pos.x += correction.x * share;
      pos.z += correction.z * share;
      correction.x *= 1 - share;
      correction.z *= 1 - share;
      correction.remaining -= delta;
    }

    if (!player.sitting) {
      const target = targetPosRef.current;
      if (target) {
        // Route once per click, the first frame the target is seen.
        if (!target.path) target.path = findPath(mapId, pos, { x: target.x, z: target.z }) ?? [];

        const path = target.path;
        const waypoint = path[0];
        if (waypoint) {
          const dx = waypoint.x - pos.x;
          const dz = waypoint.z - pos.z;
          const distance = Math.hypot(dx, dz);
          const isFinal = path.length === 1;

          if (distance > (isFinal ? ARRIVE_THRESHOLD : WAYPOINT_THRESHOLD)) {
            dirX = dx / distance;
            dirZ = dz / distance;
            // Accelerate toward full speed, and ease off approaching the last waypoint only.
            const remaining = isFinal ? distance : Infinity;
            const cap = remaining < ARRIVE_RADIUS ? MOVE_SPEED * Math.max(0.35, remaining / ARRIVE_RADIUS) : MOVE_SPEED;
            velocityRef.current = Math.min(cap, velocityRef.current + ACCELERATION * delta);
            const step = Math.min(velocityRef.current * delta, distance);
            const before = { x: pos.x, z: pos.z };
            slideStep(pos, dirX * step, dirZ * step, mapId);
            // Wedged against something the path didn't expect (another route change, a
            // corrected position): re-plan from here rather than grinding.
            if (Math.hypot(pos.x - before.x, pos.z - before.z) < step * 0.05) {
              target.path = findPath(mapId, pos, { x: target.x, z: target.z }) ?? [];
              if (target.path.length === 0) targetPosRef.current = null;
            }
            facingRef.current = lerpAngle(facingRef.current, Math.atan2(dirX, dirZ), TURN_LERP);
          } else if (!isFinal) {
            path.shift(); // on to the next waypoint
          } else {
            path.shift();
          }
        } else {
          // Path finished: this is arrival.
          velocityRef.current = 0;
          if (target.propId && room) {
            // The arrival position rides along with the request: the server's copy of our
            // position is only as fresh as the last throttled report.
            room.send("useProp", { propId: target.propId, x: pos.x, z: pos.z });
            targetPosRef.current = null;
          } else if (target.seatId && room && !target.sent) {
            target.sent = true;
            room.send("interactChair", { chairId: target.seatId, x: pos.x, z: pos.z });
          } else if (!target.seatId) {
            targetPosRef.current = null;
          } else {
            // Sit already requested; if the server never confirms (seat taken meanwhile), give up.
            sitWaitRef.current += delta;
            if (sitWaitRef.current > SIT_CONFIRM_TIMEOUT) {
              sitWaitRef.current = 0;
              targetPosRef.current = null;
            }
          }
        }
      } else {
        velocityRef.current = 0;
      }

      if (room) {
        sendTimerRef.current += delta;
        const last = lastSentDirRef.current;
        const dirChanged = Math.abs(dirX - last.x) > DIR_CHANGE_EPSILON || Math.abs(dirZ - last.z) > DIR_CHANGE_EPSILON;
        const moving = dirX !== 0 || dirZ !== 0;
        if (dirChanged || (moving && sendTimerRef.current >= SEND_INTERVAL)) {
          sendTimerRef.current = 0;
          lastSentDirRef.current = { x: dirX, z: dirZ };
          room.send("move", { dirX, dirZ, x: pos.x, z: pos.z, seq: seqRef.current++ });
        }
      }
    }

    speedRef.current = player.sitting ? 0 : velocityRef.current / MOVE_SPEED;
    seatYRef.current += ((player.sitting ? player.sitY : 0) - seatYRef.current) * SEAT_HEIGHT_LERP;
    // Elevated walkways (the campfire's plank bridge) lift the feet onto their deck.
    groundYRef.current += ((player.sitting ? 0 : walkY(mapId, pos.x, pos.z)) - groundYRef.current) * GROUND_LERP;
    if (player.sitting) facingRef.current = player.sitRotationY;

    if (groupRef.current) {
      groupRef.current.position.set(pos.x, seatYRef.current + groundYRef.current, pos.z);
      groupRef.current.rotation.y = facingRef.current;
    }

    // Hand the camera (and the sand footprints, occlusion fade, volleyball) the predicted
    // position — what you SEE, not what the server last heard.
    cameraFocus.x = pos.x;
    cameraFocus.z = pos.z;
    cameraFocus.dirX = dirX;
    cameraFocus.dirZ = dirZ;
    cameraFocus.hasTarget = true;
  });
}
