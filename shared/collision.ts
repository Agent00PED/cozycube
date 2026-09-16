import type { MapId } from "./types";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Static (non-interactive) furniture obstacles per map, on the X-Z floor plane.
// Interactive props (chairs, toggleables — see shared/props.ts) are handled separately:
// chairs are intentionally NOT obstacles (players must be able to walk up to sit), and
// toggleable props get a small obstacle box of their own below so players can't walk through
// a TV/campfire. Purely decorative meshes (logs, rocks, trees, cushions, monitors...) are not
// listed here at all — client-side they're also excluded from raycasting entirely
// (see ProceduralRoom.tsx), so they never block click-to-move even without a collision box.
export const MAP_OBSTACLES: Record<MapId, AABB[]> = {
  cozy_lounge: [
    { minX: -4.6, maxX: -1.6, minZ: -4.6, maxZ: -3.2 }, // sofa (living zone, back-left)
    { minX: -3.6, maxX: -2, minZ: -2.6, maxZ: -1.6 }, // coffee table
    { minX: -3.2, maxX: -1.8, minZ: -4.9, maxZ: -4.5 }, // wall_tv stand footprint
    { minX: 1.8, maxX: 4.6, minZ: -4.6, maxZ: -3.4 }, // gaming desk (battlestation zone, back-right)
    { minX: 4.3, maxX: 4.8, minZ: 1.5, maxZ: 2 }, // floor lamp
    { minX: -4.8, maxX: -4.2, minZ: 3.5, maxZ: 4.1 }, // monstera plant pot
  ],
  campfire_night: [
    { minX: -0.7, maxX: 0.7, minZ: -0.7, maxZ: 0.7 }, // campfire pit
    { minX: -4.2, maxX: -2, minZ: -4.5, maxZ: -2.6 }, // tent 1
    { minX: 2, maxX: 4.2, minZ: -4.5, maxZ: -2.6 }, // tent 2
  ],
};

export const MAP_SPAWN_POINTS: Record<MapId, { x: number; z: number }[]> = {
  cozy_lounge: [{ x: 0, z: 2 }, { x: 1, z: 2.5 }, { x: -1, z: 2.5 }],
  campfire_night: [{ x: 0, z: 3 }, { x: 1.5, z: 3 }, { x: -1.5, z: 3 }],
};

export function isBlocked(x: number, z: number, obstacles: AABB[], radius = 0.3): boolean {
  for (const box of obstacles) {
    if (
      x + radius > box.minX &&
      x - radius < box.maxX &&
      z + radius > box.minZ &&
      z - radius < box.maxZ
    ) {
      return true;
    }
  }
  return false;
}
