import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Room } from "colyseus.js";
import type { Group } from "three";
import type { MapId, PlayerState } from "@shared/types";
import { clampToWorld, isBlocked, walkY } from "@shared/collision";
import { auraPace } from "@shared/casino";
import { findPath, type Point } from "@shared/pathfinding";
import { cameraFocus } from "../scene/cameraFocus";
import { consumeStandPress, worldMoveDirection } from "./input";
import { faceHeading } from "./faceTargets";
import { liveMotion } from "./liveMotion";
import { Reconciler } from "./reconcile";
import { WELL_FED_SPEED, carrierLoad, sanitizeFishingProfile } from "@shared/fishing";
import { gearPace } from "@shared/gear";

// The local player's locomotion. Three inputs, one controller:
//   - click-to-move: the scene sets `targetRef` from a floor raycast, and the shared pathfinder
//     routes round the furniture
//   - WASD / arrow keys and the on-screen joystick, both through worldMoveDirection()
//   - arriving on a target sits on its seat or uses its prop
//
// The CLIENT is the authority on where you are: every step is collided here with the SAME test
// the server runs (shared/collision.ts), inside the strict floor bounds (NAV_LIMIT), and the
// server only validates and relays the reports. Reports go out at a fixed 16 Hz, numbered; the
// server echoes the number it applied, and reconcile.ts compares each echo with what was reported
// under that number, so latency is never mistaken for an error (the old rubberbanding).

const MOVE_SPEED = 3; // units/sec; the server's MOVE_SPEED_PER_SEC must match
const ACCELERATION = 14;
const ARRIVE_RADIUS = 0.7; // ease off this far from the final waypoint
const ARRIVE_THRESHOLD = 0.05;
const WAYPOINT_THRESHOLD = 0.2;
const TURN_LERP = 0.22;
/** Still seated this long after asking to get up: the request was lost (a dropping connection, say), so ask again. */
const STAND_RETRY_MS = 1200;
const SEAT_HEIGHT_LERP = 0.2;
const SIT_CONFIRM_TIMEOUT = 1.5;
// a frame hitch or a backgrounded tab must not integrate one giant step (a slow frame walks a
// little slower instead of leaping, and never trips the server's speed check)
const MAX_FRAME_DELTA = 0.05;
// reports go out at this fixed rate (16 Hz) while moving or when the direction changed, never
// faster: a turn waits for the next slot instead of adding a packet
const SEND_INTERVAL = 1 / 16;
const DIR_CHANGE_EPSILON = 0.2;
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
  // Well-Fed walks 15% quicker (the server allows for it)
  const fedRef = useRef(false);
  fedRef.current = player.fed > 0;
  // and the Forester Traction Boots 15% quicker again while the wood carrier holds anything (the
  // server allows for that too)
  const gearPaceRef = useRef(1);
  gearPaceRef.current = useMemo(() => {
    try {
      const kit = sanitizeFishingProfile(JSON.parse(player.fishing || "{}"));
      return gearPace(kit.gear, carrierLoad(kit) > 0);
    } catch {
      return 1;
    }
  }, [player.fishing]);
  // an espresso from the casino's bar: 20% quicker for a minute (the server allows for it)
  const auraPaceRef = useRef(1);
  auraPaceRef.current = auraPace(player.aura);
  const velocityRef = useRef(0);
  const facingRef = useRef(0);
  const sendTimerRef = useRef(0);
  const lastSentDirRef = useRef({ x: 0, z: 0 });
  const initializedRef = useRef(false);
  const sitWaitRef = useRef(0);
  const seatYRef = useRef(0);
  /** When we last asked the server to stand us up (-Infinity: not since sitting down). */
  const standRequestedAtRef = useRef(-Infinity);
  const reconcilerRef = useRef(new Reconciler());
  const seenVersionRef = useRef(0);

  // the first position is the server's
  useEffect(() => {
    if (initializedRef.current) return;
    posRef.current = { x: player.x, z: player.z };
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sitting down and standing up are server-authored teleports: adopt the server position
  const prevSittingRef = useRef(player.sitting);
  useEffect(() => {
    if (prevSittingRef.current !== player.sitting) {
      prevSittingRef.current = player.sitting;
      posRef.current = { x: player.x, z: player.z };
      velocityRef.current = 0;
      reconcilerRef.current.reset();
      seenVersionRef.current = liveMotion.get(player.sessionId)?.version ?? 0;
      standRequestedAtRef.current = -Infinity;
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

    // reconcile with the server's copy of us: only a real error moves us, eased; a teleport snaps
    const reconciler = reconcilerRef.current;
    const live = liveMotion.get(player.sessionId);
    if (player.sitting) {
      pos.x = player.x; // seated, the server places us
      pos.z = player.z;
    } else {
      if (live && live.version !== seenVersionRef.current) {
        seenVersionRef.current = live.version;
        const jump = reconciler.onServer(live.seq, live.x, live.z, pos);
        if (jump) {
          pos.x += jump.x;
          pos.z += jump.z;
          targetRef.current = null;
        }
      }
      const ease = reconciler.step(delta);
      pos.x += ease.x;
      pos.z += ease.z;
    }

    const steer = worldMoveDirection();

    // Space, like steering, gets you up from a seat (a click does the same through the scene)
    const standPressed = consumeStandPress();
    if (player.sitting) {
      // Never stuck on a seat: while you keep asking and are still seated, the request is sent
      // again every STAND_RETRY_MS, so one lost on a dropping connection is simply repeated
      // (and the server stands a seated player up if they report walking, too).
      const now = performance.now();
      if ((steer || standPressed) && room && now - standRequestedAtRef.current > STAND_RETRY_MS) {
        standRequestedAtRef.current = now;
        room.send("standUp");
      }
    } else {
      // held keys or the joystick take over from any click-to-move target
      if (steer && targetRef.current) targetRef.current = null;
      const target = targetRef.current;
      const pace = MOVE_SPEED * (fedRef.current ? WELL_FED_SPEED : 1) * gearPaceRef.current * auraPaceRef.current;
      if (steer) {
        dirX = steer.x;
        dirZ = steer.z;
        const cap = pace * (0.35 + 0.65 * steer.strength);
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
            const cap = isFinal && distance < ARRIVE_RADIUS ? pace * Math.max(0.35, distance / ARRIVE_RADIUS) : pace;
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
        // real time, not the clamped delta: the cadence must hold even through slow frames
        sendTimerRef.current += rawDelta;
        const last = lastSentDirRef.current;
        const dirChanged = Math.abs(dirX - last.x) > DIR_CHANGE_EPSILON || Math.abs(dirZ - last.z) > DIR_CHANGE_EPSILON;
        const moving = dirX !== 0 || dirZ !== 0;
        if ((dirChanged || moving) && sendTimerRef.current >= SEND_INTERVAL) {
          sendTimerRef.current = 0;
          lastSentDirRef.current = { x: dirX, z: dirZ };
          room.send("move", { dirX, dirZ, x: pos.x, z: pos.z, seq: reconciler.report(pos.x, pos.z) });
        }
      }
    }

    speedRef.current = player.sitting ? 0 : Math.min(1, velocityRef.current / MOVE_SPEED);
    // seated, the seat's height; standing, the floor's (the casino's raised pit and lounge, their steps)
    seatYRef.current += ((player.sitting ? player.sitY : walkY(mapId, pos.x, pos.z)) - seatYRef.current) * SEAT_HEIGHT_LERP;
    if (player.sitting) facingRef.current = player.sitRotationY;
    else if (dirX === 0 && dirZ === 0) {
      // standing still with something to face (the plant being watered): turn to it
      const heading = faceHeading(player.sessionId, pos.x, pos.z);
      if (heading !== null) facingRef.current = lerpAngle(facingRef.current, heading, TURN_LERP);
    }

    if (groupRef.current) {
      groupRef.current.position.set(pos.x, seatYRef.current, pos.z);
      groupRef.current.rotation.y = facingRef.current;
    }

    // hand the action dock the predicted position: what you SEE, not what the server last heard
    cameraFocus.x = pos.x;
    cameraFocus.z = pos.z;
    cameraFocus.dirX = dirX;
    cameraFocus.dirZ = dirZ;
    cameraFocus.facing = facingRef.current;
    cameraFocus.y = seatYRef.current;
    cameraFocus.hasTarget = true;
  });
}
