// A short-lived "turn to face this" for an avatar standing still, kept out of React state like
// liveMotion: watering a plant turns the waterer toward it for the pour, whichever way they were
// facing when they asked. The frame loops (useLocalPlayerMovement for you, Players.tsx for everyone
// else) read it while the avatar is not walking. Work in the Glimmering Caverns turns them to it too
// (workHeading), for as long as it lasts.

import { ANVIL, FORGE, oreNodeNear } from "@shared/worlds/caverns";

interface FaceTarget {
  x: number;
  z: number;
  /** performance.now() ms after which it no longer applies. */
  until: number;
}

const targets = new Map<string, FaceTarget>();

/** Turn `sessionId` toward (x, z) for the next `seconds`. */
export function faceToward(sessionId: string, x: number, z: number, seconds: number) {
  targets.set(sessionId, { x, z, until: performance.now() + seconds * 1000 });
}

/** The heading (atan2(dx, dz), as the avatars face) from (fromX, fromZ) toward the target, or null. */
export function faceHeading(sessionId: string, fromX: number, fromZ: number): number | null {
  const t = targets.get(sessionId);
  if (!t) return null;
  if (performance.now() > t.until) {
    targets.delete(sessionId);
    return null;
  }
  const dx = t.x - fromX;
  const dz = t.z - fromZ;
  return Math.hypot(dx, dz) < 1e-3 ? null : Math.atan2(dx, dz);
}

/** At work in the Glimmering Caverns, standing still: the heading toward what is being worked (the
 *  rock being mined, the one they stand at; the forge; the geode anvil), or null. */
export function workHeading(map: string, action: string, fromX: number, fromZ: number): number | null {
  if (map !== "glimmering_caverns") return null;
  let to: { x: number; z: number } | null = null;
  if (action === "mine") to = oreNodeNear(fromX, fromZ);
  else if (action === "forge") to = FORGE;
  else if (action === "chisel") to = ANVIL;
  if (!to) return null;
  const dx = to.x - fromX;
  const dz = to.z - fromZ;
  return Math.hypot(dx, dz) < 1e-3 ? null : Math.atan2(dx, dz);
}
