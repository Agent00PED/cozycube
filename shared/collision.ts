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
// toggleable props get a small obstacle box of their own below so players can't walk through a TV/lamp.
export const MAP_OBSTACLES: Record<MapId, AABB[]> = {
  cozy_bedroom: [
    { minX: -1.5, maxX: 1.5, minZ: -4, maxZ: -3 }, // bed
    { minX: 3, maxX: 4.2, minZ: 1, maxZ: 2.2 }, // side table
    { minX: -3.9, maxX: -3.3, minZ: 1.3, maxZ: 1.9 }, // bedside_lamp footprint
  ],
  cyber_lounge: [
    { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 }, // center pillar
    { minX: -1, maxX: 1, minZ: -3.8, maxZ: -3.3 }, // wall_tv stand
  ],
  chill_lounge: [
    { minX: -4, maxX: -2, minZ: -2, maxZ: 2 }, // bar counter
    { minX: 2.7, maxX: 3.3, minZ: -2.3, maxZ: -1.7 }, // hanging_lamp footprint
  ],
};

export const MAP_SPAWN_POINTS: Record<MapId, { x: number; z: number }[]> = {
  cozy_bedroom: [{ x: 0, z: 2 }, { x: 1, z: 2 }, { x: -1, z: 2 }],
  cyber_lounge: [{ x: 2, z: 0 }, { x: -2, z: 0 }, { x: 0, z: 2.5 }],
  chill_lounge: [{ x: 0, z: 0 }, { x: 1, z: 1 }],
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
