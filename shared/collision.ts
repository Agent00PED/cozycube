import type { MapId } from "./types";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The diorama slab spans -14..14 on both axes; players are kept a little inside its lip. */
export const WORLD_LIMIT = 13;

// Static furniture obstacles per map, on the X-Z floor plane.
//
// Long runs of furniture are deliberately ONE box each (the whole kitchen back counter, a wall
// of bookshelves, both streamer desks) rather than one box per cabinet or shelf unit. Nobody
// needs to walk into the gap between two shelf units, and isBlocked is a linear scan run on
// every validated move report, so fewer, larger boxes is directly less server work.
//
// Seats are intentionally NOT obstacles (you have to be able to reach them), and purely
// decorative meshes (books, mugs, trees, rocks, flowers) never appear here at all.
export const MAP_OBSTACLES: Record<MapId, AABB[]> = {
  cozy_lounge: [
    // --- Zone 1: Grand Living ---
    { minX: -5.9, maxX: 1.2, minZ: -6.1, maxZ: -4.9 }, // L-sofa, long run
    { minX: -5.9, maxX: -4.7, minZ: -9.8, maxZ: -6.1 }, // L-sofa, return leg
    { minX: -2.7, maxX: -0.3, minZ: -9.1, maxZ: -7.9 }, // coffee table
    { minX: -3.7, maxX: 0.7, minZ: -14, maxZ: -13.1 }, // media console under the TV
    { minX: 2.0, maxX: 2.4, minZ: -5.7, maxZ: -5.3 }, // floor lamp
    // --- Zone 2: Cafe kitchen (back counter, sink and fridge grouped) ---
    { minX: 3.9, maxX: 12.9, minZ: -14, maxZ: -12.8 },
    { minX: 6.0, maxX: 10.4, minZ: -9.35, maxZ: -7.85 }, // kitchen island
    // --- Zone 3: Gamer den ---
    { minX: -14, maxX: -12.6, minZ: -10.85, maxZ: -3.95 }, // both streamer desks, grouped
    { minX: -11.7, maxX: -8.3, minZ: -14, maxZ: -12.7 }, // both arcade cabinets, grouped
    { minX: -13.7, maxX: -12.9, minZ: -13.7, maxZ: -12.9 }, // corner plant
    // --- Zone 4: Library ---
    { minX: -14, maxX: -13.35, minZ: 3.45, maxZ: 12.35 }, // floor-to-ceiling shelving, grouped
    { minX: -11.95, maxX: -11.25, minZ: 6.55, maxZ: 7.25 }, // side table between the armchairs
    { minX: -13.0, maxX: -12.6, minZ: 6.7, maxZ: 7.1 }, // reading lamp
    { minX: -9.7, maxX: -7.5, minZ: 11.1, maxZ: 12.1 }, // study desk
    // --- Zone 5: Balcony garden ---
    { minX: 9.3, maxX: 9.9, minZ: 2.2, maxZ: 2.8 }, // side table between deck chairs
    { minX: 5.65, maxX: 6.35, minZ: -2.15, maxZ: -1.45 }, // fiddle-leaf fig
    { minX: 12.05, maxX: 12.75, minZ: -1.95, maxZ: -1.25 }, // snake plant
    { minX: 12.0, maxX: 12.8, minZ: 6.8, maxZ: 7.6 }, // olive tree
    { minX: 5.45, maxX: 6.15, minZ: 7.05, maxZ: 7.75 }, // fern
    { minX: 10.7, maxX: 11.3, minZ: 5.9, maxZ: 6.5 }, // plant stand
    { minX: 12.15, maxX: 12.65, minZ: 2.25, maxZ: 2.75 }, // floor lantern
    // --- Social circle ---
    { minX: -0.6, maxX: 0.6, minZ: 5.4, maxZ: 6.6 }, // pouf table
    // --- Zone 6: Foyer ---
    { minX: 7.9, maxX: 10.3, minZ: 12.7, maxZ: 13.4 }, // shoe rack
    { minX: 12.6, maxX: 13.2, minZ: 9.6, maxZ: 10.4 }, // standing mirror
    { minX: 12.45, maxX: 12.95, minZ: 12.35, maxZ: 12.85 }, // coat stand
  ],
  campfire_night: [
    { minX: -0.9, maxX: 0.9, minZ: -0.9, maxZ: 0.9 }, // fire pit
    { minX: -8.5, maxX: -6.5, minZ: -8.5, maxZ: -6.5 }, // tent 1
    { minX: 6.5, maxX: 8.5, minZ: -9.0, maxZ: -7.0 }, // tent 2
    { minX: -10.5, maxX: -8.5, minZ: 0.0, maxZ: 2.0 }, // tent 3
    { minX: 8.5, maxX: 10.5, minZ: -2.5, maxZ: -0.5 }, // tent 4
    { minX: 4.85, maxX: 5.55, minZ: -2.75, maxZ: -2.05 }, // lantern stump east
    { minX: -5.55, maxX: -4.85, minZ: 2.05, maxZ: 2.75 }, // lantern stump west
    { minX: 7.9, maxX: 8.5, minZ: 3.1, maxZ: 3.7 }, // telescope
  ],
};

// Lounge players arrive through the foyer; campers arrive at the end of the stone trail.
export const MAP_SPAWN_POINTS: Record<MapId, { x: number; z: number }[]> = {
  cozy_lounge: [
    { x: 10.2, z: 10.8 },
    { x: 9.0, z: 11.6 },
    { x: 11.4, z: 9.8 },
    { x: 8.4, z: 10.2 },
    { x: 10.6, z: 12.2 },
  ],
  campfire_night: [
    { x: 0, z: 11.6 },
    { x: 1.6, z: 12.1 },
    { x: -1.6, z: 12.1 },
    { x: 0.8, z: 12.8 },
    { x: -0.8, z: 12.8 },
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
