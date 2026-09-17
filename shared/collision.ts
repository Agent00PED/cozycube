import type { MapId } from "./types";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The diorama slab spans -9..9 on both axes; players are kept a little inside its lip. */
export const WORLD_LIMIT = 8.4;

// Static furniture obstacles per map, on the X-Z floor plane.
//
// Long runs of furniture are deliberately ONE box each (a whole kitchen counter, both arcade
// cabinets) rather than one box per unit. Nobody needs to walk into the gap between two
// cabinets, and isBlocked is a linear scan run on every validated move report, so fewer,
// larger boxes is directly less server work.
//
// Seats are intentionally NOT obstacles (you have to be able to reach them), and purely
// decorative meshes (books, mugs, plants, shells) never appear here at all.
export const MAP_OBSTACLES: Record<MapId, AABB[]> = {
  cozy_lounge: [
    // --- Zone 1: Living room ---
    { minX: -3.9, maxX: -0.3, minZ: -8.95, maxZ: -8.15 }, // media console under the TV
    { minX: -4.3, maxX: 0.1, minZ: -4.8, maxZ: -3.6 }, // L-sofa, long run
    { minX: -5.3, maxX: -4.1, minZ: -6.9, maxZ: -4.8 }, // L-sofa, return leg
    { minX: -3.3, maxX: -0.9, minZ: -6.8, maxZ: -5.8 }, // coffee table
    { minX: 0.6, maxX: 1.0, minZ: -4.6, maxZ: -4.2 }, // floor lamp
    // --- Zone 2: Kitchen bar ---
    { minX: 0.9, maxX: 8.4, minZ: -9, maxZ: -8.0 }, // back counter run, sink and fridge grouped
    { minX: 3.0, maxX: 6.6, minZ: -6.3, maxZ: -5.1 }, // bar island
    // --- Zone 3: Gamer corner ---
    { minX: -9, maxX: -7.7, minZ: -7.9, maxZ: -4.9 }, // streamer desk against the left wall
    { minX: -7.3, maxX: -4.5, minZ: -9, maxZ: -7.7 }, // both arcade cabinets, grouped
    { minX: -8.8, maxX: -8.0, minZ: -8.8, maxZ: -8.0 }, // corner plant
    // --- Zone 4: Balcony deck ---
    { minX: 8.1, maxX: 9, minZ: -0.6, maxZ: 8.4 }, // glass railing along the deck edge
    { minX: 7.6, maxX: 8.2, minZ: 4.3, maxZ: 4.9 }, // floor lantern
    { minX: 4.6, maxX: 5.2, minZ: -0.4, maxZ: 0.2 }, // potted fig by the deck step
    { minX: 7.4, maxX: 8.1, minZ: 0.2, maxZ: 0.9 }, // olive tree
    // --- Shared middle ---
    { minX: -3.95, maxX: -2.85, minZ: 3.05, maxZ: 4.15 }, // pouf table in the cushion circle
    { minX: 6.4, maxX: 7.4, minZ: -3.2, maxZ: -2.2 }, // console table by the entry
  ],

  campfire_night: [
    { minX: -0.9, maxX: 0.9, minZ: -0.9, maxZ: 0.9 }, // fire pit
    { minX: -6.6, maxX: -4.8, minZ: -6.2, maxZ: -4.4 }, // tent 1
    { minX: 4.8, maxX: 6.6, minZ: -6.4, maxZ: -4.6 }, // tent 2
    { minX: -7.4, maxX: -5.6, minZ: 1.2, maxZ: 3.0 }, // tent 3
    { minX: 3.7, maxX: 4.3, minZ: -2.3, maxZ: -1.7 }, // lantern stump east
    { minX: -4.3, maxX: -3.7, minZ: 1.7, maxZ: 2.3 }, // lantern stump west
    { minX: -3.3, maxX: -2.3, minZ: -4.6, maxZ: -3.6 }, // firewood stack
    { minX: 6.2, maxX: 6.8, minZ: 2.6, maxZ: 3.2 }, // telescope
  ],

  sunset_beach: [
    { minX: -3.6, maxX: 2.4, minZ: -6.0, maxZ: -4.7 }, // tiki bar counter and its back shelf
    { minX: -7.5, maxX: -6.9, minZ: -1.7, maxZ: -1.1 }, // west tiki torch
    { minX: 6.1, maxX: 6.7, minZ: 3.1, maxZ: 3.7 }, // east tiki torch
    { minX: 3.5, maxX: 5.3, minZ: -1.5, maxZ: 0.3 }, // bonfire and its stone ring
    { minX: -6.5, maxX: -5.9, minZ: 2.0, maxZ: 2.6 }, // parasol post between the loungers
    { minX: -8.2, maxX: -7.4, minZ: -7.0, maxZ: -6.2 }, // palm by the bar
    { minX: 6.8, maxX: 7.6, minZ: -5.6, maxZ: -4.8 }, // palm at the top of the beach
    { minX: -1.6, maxX: -0.8, minZ: 3.4, maxZ: 4.2 }, // surfboard rack at the head of the pier
  ],
};

// Where players arrive: the lounge entry, the end of the campfire trail, the top of the beach.
export const MAP_SPAWN_POINTS: Record<MapId, { x: number; z: number }[]> = {
  cozy_lounge: [
    { x: 6.2, z: 7.2 },
    { x: 5.0, z: 7.8 },
    { x: 7.0, z: 6.2 },
    { x: 4.2, z: 6.8 },
    { x: 6.6, z: 8.0 },
  ],
  campfire_night: [
    { x: 0, z: 7.4 },
    { x: 1.4, z: 7.9 },
    { x: -1.4, z: 7.9 },
    { x: 0.7, z: 8.2 },
    { x: -0.7, z: 8.2 },
  ],
  sunset_beach: [
    { x: -3.4, z: -2.0 },
    { x: -2.2, z: -1.4 },
    { x: -4.4, z: -1.2 },
    { x: -1.2, z: -2.2 },
    { x: -3.0, z: -0.6 },
  ],
};

// The outdoor maps are ringed by scenery rather than walls: dense pines round the campfire
// clearing, open sea past the beach. Enumerating the seeded trees as boxes would be absurd, so
// each is one rule instead — with the ways in (the stone trail, the pier) carved out of it.
const FOREST_RADIUS = 7.2;
const TRAIL_HALF_WIDTH = 2.4;
const TRAIL_START_Z = 4.6;
/** Past this the beach becomes sea; the pier is the only way out over the water. */
const SHORELINE_Z = 4.4;
const PIER_MIN_X = 1.0;
const PIER_MAX_X = 3.4;
const PIER_END_Z = 7.2;

function inScenery(mapId: MapId, x: number, z: number): boolean {
  if (mapId === "campfire_night") {
    if (Math.abs(x) < TRAIL_HALF_WIDTH && z > TRAIL_START_Z) return false; // the stone trail
    return Math.hypot(x, z) > FOREST_RADIUS;
  }
  if (mapId === "sunset_beach") {
    if (z <= SHORELINE_Z) return false;
    return !(x > PIER_MIN_X && x < PIER_MAX_X && z < PIER_END_Z);
  }
  return false;
}

export function isBlocked(x: number, z: number, mapId: MapId, radius = 0.3): boolean {
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return true;
  if (inScenery(mapId, x, z)) return true;
  for (const box of MAP_OBSTACLES[mapId]) {
    if (x + radius > box.minX && x - radius < box.maxX && z + radius > box.minZ && z - radius < box.maxZ) {
      return true;
    }
  }
  return false;
}

export function clampToWorld(v: number): number {
  return Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, v));
}
