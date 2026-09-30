import { ANVIL, ANVIL_FRONT, FORGE, FORGE_FRONT, cavernsFloorY } from "@shared/worlds/caverns";
import { prospectCam, type WorkSpot } from "./prospectCamera";

// Where the close-up camera frames the caverns' work (prospectCamera.ts `spot`): the forge and the
// one working it, the anvil and the one at it.

function between(a: { x: number; z: number }, b: { x: number; z: number }, y: number, r: number, tall: number): WorkSpot {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: (a.x + b.x) / 2, y: cavernsFloorY(b.x, b.z) + y, z: (a.z + b.z) / 2, r, tall, face: { x: dx / l, z: dz / l } };
}
export const FORGE_SPOT: WorkSpot = between(FORGE, FORGE_FRONT, 0.85, 1.5, 2.5);
export const ANVIL_SPOT: WorkSpot = between(ANVIL, ANVIL_FRONT, 0.6, 1.0, 1.9);

/** Frames a work spot (null: back to the usual camera). */
export function frameWork(spot: WorkSpot | null) {
  prospectCam.spot = spot;
}
