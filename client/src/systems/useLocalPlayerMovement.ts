import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Room } from "colyseus.js";
import type { Group } from "three";
import type { MapId, PlayerState } from "@shared/types";
import { clampToWorld, isBlocked } from "@shared/collision";
import { findPath, type Point } from "@shared/pathfinding";
import { cameraFocus } from "../scene/cameraFocus";
import { worldMoveDirection } from "./input";

// The local player's locomotion. Three inputs, one controller:
//   - click-to-move: the scene sets `targetRef` from a floor raycast, and the shared pathfinder
//     routes round the furniture
//   - WASD / arrow keys and the on-screen joystick, both through worldMoveDirection()
//   - arriving on a target sits on its seat or uses its prop
//
// The CLIENT is the authority on where you are: every step is collided here with the SAME test
// the server runs (shared/collision.ts), inside the strict floor bounds (NAV_LIMIT), and the
// server only validates and relays the reports.

const MOVE_SPEED = 3; // units/sec; the server's MOVE_SPEED_PER_SEC must match
const ACCELERATION = 14;
const ARRIVE_RADIUS = 0.7; // ease off this far from the final waypoint
const ARRIVE_THRESHOLD = 0.05;
const WAYPOINT_THRESHOLD = 0.2;
const TURN_LERP = 0.22;
const SEAT_HEIGHT_LERP = 0.2;
const SIT_CONFIRM_TIMEOUT = 1.5;
const MAX_FRAME_DELTA = 0.1; // a backgrounded tab must not integrate seconds in one step
const SEND_INTERVAL = 1 / 16;
const DIR_CHANGE_EPSILON = 0.2;
// server reconciliation: small differences are ignored, real corrections glide, teleports snap
const CORRECTION_THRESHOLD = 0.9;
const TELEPORT_THRESHOLD = 4;
const CORRECTION_BLEND = 0.25;
const COLLIDE_SUBSTEP = 0.12; // long steps are split so a corner can't be skipped
const PLAYER_RADIUS = 0.3;

export interface MoveTarget {
  x: number;
  z: number;
  /** Sit on this seat on arrival. */
  seatId?: string;
  /** Use this walk-up prop on arrival (Mochi opens her playroom). */
  propId?: string;
  /** Guards against re-sending the sit request. */
  sent?: boolean;
  /** Waypoints, filled in by the pathfinder the first frame the target is seen. */
  path?: Point[];
}

function lerpAngle(from: number, to: number, t: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

/** Axis-separated, so brushing a wall or a table slides along it. */
function slideStep(pos: Point, dx: number, dz: number, mapId: MapId) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / COLLIDE_SUBSTEP));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    const nx = clampToWorld(pos.x + sx, mapId);
    if (!isBlocked(nx, pos.z, mapId, PLAYER_RADIUS)) pos.x = nx;
    const nz = clampToWorld(pos.z + sz, mapId);
    if (!isBlocked(pos.x, nz, mapId, PLAYER_RADIUS)) pos.z = nz;
  }
}

export function useLocalPlayerMovement(
  groupRef: React.RefObject<Group>,
  room: Room | null,
  player: PlayerState,
  targetRef: React.MutableRefObject<MoveTarget | null>,
  /** Read by the avatar's gait: 0 standing, 1 at full walking speed. */
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
  const standRequestedRef = useRef(false);
  const correctionRef = useRef({ x: 0, z: 0, remaining: 0 });

  // reconcile with the server's view of us
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
      posRef.current = { x: player.x, z: player.z };
      targetRef.current = null;
      correctionRef.current.remaining = 0;
    } else if (drift > CORRECTION_THRESHOLD) {
      correctionRef.current = { x: dx, z: dz, remaining: CORRECTION_BLEND };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.x, player.z, player.sitting]);

  // sitting down and standing up are server-authored teleports: adopt the server position
  const prevSittingRef = useRef(player.sitting);
  useEffect(() => {
    if (prevSittingRef.current !== player.sitting) {
      prevSittingRef.current = player.sitting;
      posRef.current = { x: player.x, z: player.z };
      velocityRef.current = 0;
      correctionRef.current.remaining = 0;
      standRequestedRef.current = false;
      if (player.sitting) targetRef.current = null; // standing up must NOT clear a queued walk
      sitWaitRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.sitting]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);
    const pos = posRef.current;
    let dirX = 0;
    let dirZ = 0;

    const correction = correctionRef.current;
    if (correction.remaining > 0) {
      const share = Math.min(1, delta / correction.remaining);
      pos.x += correction.x * share;
      pos.z += correction.z * share;
      correction.x *= 1 - share;
      correction.z *= 1 - share;
      correction.remaining -= delta;
    }

    const steer = worldMoveDirection();

    if (player.sitting) {
      // steering from a seat gets you up; a click does the same through the scene
      if (steer && room && !standRequestedRef.current) {
        standRequestedRef.current = true;
        room.send("standUp");
      }
    } else {
      // held keys or the joystick take over from any click-to-move target
      if (steer && targetRef.current) targetRef.current = null;
      const target = targetRef.current;
      if (steer) {
        dirX = steer.x;
        dirZ = steer.z;
        const cap = MOVE_SPEED * (0.35 + 0.65 * steer.strength);
        velocityRef.current = Math.min(cap, velocityRef.current + ACCELERATION * delta);
        slideStep(pos, dirX * velocityRef.current * delta, dirZ * velocityRef.current * delta, mapId);
        facingRef.current = lerpAngle(facingRef.current, Math.atan2(dirX, dirZ), TURN_LERP);
      } else if (target) {
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
            const cap = isFinal && distance < ARRIVE_RADIUS ? MOVE_SPEED * Math.max(0.35, distance / ARRIVE_RADIUS) : MOVE_SPEED;
            velocityRef.current = Math.min(cap, velocityRef.current + ACCELERATION * delta);
            const step = Math.min(velocityRef.current * delta, distance);
            const before = { x: pos.x, z: pos.z };
            slideStep(pos, dirX * step, dirZ * step, mapId);
            // wedged against something the path didn't expect: re-plan from here
            if (Math.hypot(pos.x - before.x, pos.z - before.z) < step * 0.05) {
              target.path = findPath(mapId, pos, { x: target.x, z: target.z }) ?? [];
              if (target.path.length === 0) targetRef.current = null;
            }
            facingRef.current = lerpAngle(facingRef.current, Math.atan2(dirX, dirZ), TURN_LERP);
          } else {
            path.shift(); // on to the next waypoint, or arrived
          }
        } else {
          // path finished: arrival
          velocityRef.current = 0;
          if (target.propId && room) {
            // the arrival position rides along: the server's copy is only as fresh as the last report
            room.send("useProp", { propId: target.propId, x: pos.x, z: pos.z });
            targetRef.current = null;
          } else if (target.seatId && room && !target.sent) {
            target.sent = true;
            room.send("interactChair", { chairId: target.seatId, x: pos.x, z: pos.z });
          } else if (!target.seatId) {
            targetRef.current = null;
          } else {
            // sit already requested; if the server never confirms (someone got there first), give up
            sitWaitRef.current += delta;
            if (sitWaitRef.current > SIT_CONFIRM_TIMEOUT) {
              sitWaitRef.current = 0;
              targetRef.current = null;
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
    if (player.sitting) facingRef.current = player.sitRotationY;

    if (groupRef.current) {
      groupRef.current.position.set(pos.x, seatYRef.current, pos.z);
      groupRef.current.rotation.y = facingRef.current;
    }

    // hand the action dock the predicted position: what you SEE, not what the server last heard
    cameraFocus.x = pos.x;
    cameraFocus.z = pos.z;
    cameraFocus.dirX = dirX;
    cameraFocus.dirZ = dirZ;
    cameraFocus.hasTarget = true;
  });
}
