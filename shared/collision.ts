import type { MapId } from "./types";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The diorama slab spans -7..7 on both axes; players are kept a little inside its lip. */
export const WORLD_LIMIT = 6.3;

// Static (non-interactive) furniture obstacles per map, on the X-Z floor plane.
// Interactive props (chairs, toggleables — see shared/props.ts) are handled separately:
// seats are intentionally NOT obstacles (players must be able to walk onto them to sit), and
// toggleable props get a small obstacle box of their own below so players can't walk through
// a TV/campfire. Purely decorative meshes (logs, rocks, trees, cushions, monitors...) are not
// listed here at all — client-side they're also excluded from raycasting entirely
// (see ProceduralRoom.tsx), so they never block click-to-move even without a collision box.
export const MAP_OBSTACLES: Record<MapId, AABB[]> = {
  cozy_lounge: [
    // --- Zone 1: living area (back-centre) ---
    { minX: -4.6, maxX: -1.3, minZ: -3.6, maxZ: -2.4 }, // L-sofa, long run
    { minX: -5.5, maxX: -4.6, minZ: -3.6, maxZ: -1.3 }, // L-sofa, return leg
    { minX: -3.7, maxX: -1.9, minZ: -4.9, maxZ: -3.9 }, // coffee table
    { minX: -3.7, maxX: -2.1, minZ: -7, maxZ: -6.6 }, // wall TV footprint
    // --- Zone 2: battlestation (back-left wall) ---
    { minX: -6.7, maxX: -5.5, minZ: 0.4, maxZ: 3.2 }, // gaming desk
    // --- Zone 3: kitchenette & coffee bar (back-right) ---
    { minX: 1.8, maxX: 5.6, minZ: -7, maxZ: -6 }, // counter run
    { minX: 5.8, maxX: 6.7, minZ: -6.9, maxZ: -5.7 }, // mini fridge
    // --- ambience ---
    { minX: 6, maxX: 6.5, minZ: -3.6, maxZ: -3.1 }, // floor lamp
    { minX: -6.8, maxX: -6.2, minZ: -6.8, maxZ: -6.2 }, // monstera pot
    { minX: -0.6, maxX: 1.2, minZ: -7, maxZ: -6.5 }, // low bookshelf
    { minX: -1.0, maxX: -0.6, minZ: -3.0, maxZ: -2.6 }, // reading lamp base
  ],
  campfire_night: [
    { minX: -0.75, maxX: 0.75, minZ: -0.75, maxZ: 0.75 }, // campfire pit
    { minX: -5.6, maxX: -3.4, minZ: -5.6, maxZ: -3.4 }, // tent 1
    { minX: 3.4, maxX: 5.6, minZ: -5.3, maxZ: -3.1 }, // tent 2
    { minX: 3.0, maxX: 3.7, minZ: -2.2, maxZ: -1.5 }, // lantern stump
  ],
};

export const MAP_SPAWN_POINTS: Record<MapId, { x: number; z: number }[]> = {
  cozy_lounge: [
    { x: 0, z: 3 },
    { x: 1.8, z: 3.6 },
    { x: -1.8, z: 3.6 },
  ],
  campfire_night: [
    { x: 0, z: 4.6 },
    { x: 1.8, z: 5 },
    { x: -1.8, z: 5 },
  ],
};

export function isBlocked(x: number, z: number, obstacles: AABB[], radius = 0.3): boolean {
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return true;
  for (const box of obstacles) {
    if (x + radius > box.minX && x - radius < box.maxX && z + radius > box.minZ && z - radius < box.maxZ) {
      return true;
    }
  }
  return false;
}

export function clampToWorld(v: number): number {
  return Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, v));
}
