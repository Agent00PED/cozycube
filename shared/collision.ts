import type { MapId } from "./types";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The diorama slab spans -10..10 on both axes; players are kept a little inside its lip. */
export const WORLD_LIMIT = 9.4;

// Static furniture obstacles per map, on the X-Z floor plane.
//
// Long runs of furniture are deliberately ONE box each (a whole kitchen counter, both arcade
// cabinets) rather than one box per unit. Nobody needs to walk into the gap between two
// cabinets, and isBlocked is a linear scan run on every validated move report, so fewer,
// larger boxes is directly less server work.
//
// Seats are intentionally NOT obstacles (you have to be able to reach them), and purely
// decorative meshes (books, mugs, shells) never appear here at all.
export const MAP_OBSTACLES: Record<MapId, AABB[]> = {
  cozy_lounge: [
    // --- Living room ---
    { minX: -6.0, maxX: -2.4, minZ: -9.8, maxZ: -9.0 }, // media console under the TV
    { minX: -6.4, maxX: -2.0, minZ: -5.2, maxZ: -4.0 }, // L-sofa, long run
    { minX: -7.6, maxX: -6.4, minZ: -7.2, maxZ: -5.2 }, // L-sofa, return leg
    { minX: -5.6, maxX: -3.0, minZ: -7.4, maxZ: -6.4 }, // coffee table
    { minX: -1.5, maxX: -1.1, minZ: -5.1, maxZ: -4.7 }, // floor lamp
    { minX: -6.3, maxX: -2.3, minZ: -3.95, maxZ: -3.5 }, // low bookshelf behind the sofa
    // --- Kitchen ---
    { minX: 0.8, maxX: 9.4, minZ: -9.8, maxZ: -8.8 }, // back counter run, sink and fridge grouped
    { minX: 3.3, maxX: 6.9, minZ: -6.8, maxZ: -5.6 }, // bar island
    // --- Dining set ---
    { minX: -4.5, maxX: -2.7, minZ: -1.8, maxZ: -0.2 }, // table (chairs tuck under, so they are not boxes)
    // --- Gamer corner ---
    { minX: -9.8, maxX: -8.4, minZ: -8.7, maxZ: -5.7 }, // streamer desk against the left wall
    { minX: -8.1, maxX: -5.4, minZ: -9.8, maxZ: -8.7 }, // both arcade cabinets, grouped
    { minX: -9.6, maxX: -8.8, minZ: -9.6, maxZ: -8.8 }, // corner plant
    // --- Vinyl nook ---
    { minX: -9.8, maxX: -8.9, minZ: 2.4, maxZ: 5.2 }, // record shelf against the left wall
    { minX: -8.7, maxX: -8.1, minZ: 5.7, maxZ: 6.3 }, // floor lamp
    { minX: -6.6, maxX: -5.8, minZ: 2.7, maxZ: 3.5 }, // guitar on its stand
    { minX: -7.95, maxX: -7.25, minZ: 2.85, maxZ: 3.55 }, // round side table by the armchair
    // --- Balcony deck ---
    { minX: 8.6, maxX: 9.2, minZ: 5.1, maxZ: 5.7 }, // floor lantern
    { minX: 5.2, maxX: 5.8, minZ: 0.7, maxZ: 1.3 }, // potted fig by the deck step
    { minX: 8.5, maxX: 9.2, minZ: 1.4, maxZ: 2.1 }, // olive tree
    { minX: 6.0, maxX: 7.0, minZ: -3.6, maxZ: -2.6 }, // console table by the entry
  ],

  campfire_night: [
    { minX: -0.9, maxX: 0.9, minZ: -0.9, maxZ: 0.9 }, // fire pit and its tripod
    { minX: -6.6, maxX: -4.6, minZ: -5.6, maxZ: -3.6 }, // tent 1, out on the open grass
    { minX: 4.4, maxX: 6.4, minZ: -6.0, maxZ: -4.0 }, // tent 2
    { minX: -7.2, maxX: -5.2, minZ: 1.6, maxZ: 3.6 }, // tent 3
    { minX: 4.1, maxX: 4.7, minZ: -2.5, maxZ: -1.9 }, // lantern stump east
    { minX: -4.7, maxX: -4.1, minZ: 1.9, maxZ: 2.5 }, // lantern stump west
    { minX: -3.4, maxX: -2.4, minZ: -4.8, maxZ: -3.8 }, // firewood stack
    { minX: 7.0, maxX: 7.6, minZ: -3.0, maxZ: -2.4 }, // telescope
    { minX: 1.6, maxX: 3.0, minZ: -6.4, maxZ: -5.6 }, // camp table and cooler
    { minX: 6.1, maxX: 6.7, minZ: 1.9, maxZ: 2.5 }, // Ranger Oak
    { minX: -7.15, maxX: -6.45, minZ: -1.55, maxZ: -0.85 }, // berry bush west
    { minX: -1.35, maxX: -0.65, minZ: -7.55, maxZ: -6.85 }, // berry bush north
    { minX: 6.45, maxX: 7.15, minZ: -0.35, maxZ: 0.35 }, // berry bush east
  ],

  sunset_beach: [
    { minX: -3.6, maxX: 2.4, minZ: -6.6, maxZ: -5.3 }, // tiki bar counter and its back shelf
    { minX: -8.3, maxX: -7.7, minZ: -1.9, maxZ: -1.3 }, // west tiki torch
    { minX: 7.1, maxX: 7.7, minZ: 2.7, maxZ: 3.3 }, // east tiki torch
    { minX: 4.1, maxX: 5.9, minZ: -1.9, maxZ: -0.1 }, // bonfire and its stone ring
    { minX: -7.3, maxX: -6.7, minZ: 1.8, maxZ: 2.4 }, // parasol post between the loungers
    { minX: -8.6, maxX: -7.8, minZ: -7.4, maxZ: -6.6 }, // palm by the bar
    { minX: 7.4, maxX: 8.2, minZ: -6.2, maxZ: -5.4 }, // palm at the top of the beach
    { minX: -5.2, maxX: -4.6, minZ: -3.9, maxZ: -3.3 }, // volleyball post
    { minX: -5.2, maxX: -4.6, minZ: -0.3, maxZ: 0.3 }, // volleyball post
    { minX: -3.7, maxX: -1.5, minZ: -0.1, maxZ: 2.1 }, // rowboat pulled up on the sand
    { minX: 8.5, maxX: 9.3, minZ: -3.2, maxZ: -2.4 }, // palm, moved well clear of the bonfire
    { minX: 3.5, maxX: 5.4, minZ: 3.5, maxZ: 4.6 }, // Fisherman Bob and his bait stall beside him
  ],

  // A 20x20 retro casino: walls on x = -10 and z = -10 like the lounge, open toward the camera.
  velvet_casino: [
    { minX: -1.3, maxX: 2.5, minZ: -0.9, maxZ: 1.7 }, // the grand roulette table
    { minX: -9.8, maxX: -3.0, minZ: -9.8, maxZ: -8.8 }, // bar counter along the back wall
    { minX: 0.9, maxX: 5.7, minZ: -9.8, maxZ: -8.9 }, // three slot machines
    { minX: 6.4, maxX: 9.8, minZ: -9.8, maxZ: -7.6 }, // cashier cage
    { minX: 8.1, maxX: 9.3, minZ: -6.4, maxZ: -5.2 }, // High Roller leaderboard easel
    { minX: -6.9, maxX: -4.1, minZ: -5.3, maxZ: -3.9 }, // blackjack table
    { minX: -9.8, maxX: -8.8, minZ: 2.8, maxZ: 7.2 }, // VIP chesterfield against the left wall
    { minX: -8.2, maxX: -6.8, minZ: 4.3, maxZ: 5.7 }, // VIP coffee table
    { minX: -5.9, maxX: -5.1, minZ: 2.9, maxZ: 3.7 }, // VIP armchair
    { minX: -5.9, maxX: -5.1, minZ: 6.3, maxZ: 7.1 }, // VIP armchair
    { minX: -4.6, maxX: -4.2, minZ: 1.8, maxZ: 8.2 }, // velvet rope round the VIP lounge
    { minX: 8.8, maxX: 9.6, minZ: -2.6, maxZ: -1.8 }, // potted palm
    { minX: -9.6, maxX: -8.8, minZ: -2.4, maxZ: -1.6 }, // potted palm
  ],
};

// Where players arrive: the lounge deck, the end of the campfire trail, the top of the beach.
export const MAP_SPAWN_POINTS: Record<MapId, { x: number; z: number }[]> = {
  cozy_lounge: [
    { x: 7.0, z: 8.4 },
    { x: 5.8, z: 8.8 },
    { x: 8.0, z: 7.6 },
    { x: 5.2, z: 7.6 },
    { x: 7.4, z: 9.0 },
  ],
  campfire_night: [
    { x: 0, z: 8.4 },
    { x: 1.4, z: 8.9 },
    { x: -1.4, z: 8.9 },
    { x: 0.7, z: 9.2 },
    { x: -0.7, z: 9.2 },
  ],
  velvet_casino: [
    { x: 6.6, z: 7.6 },
    { x: 5.4, z: 8.2 },
    { x: 7.6, z: 6.6 },
    { x: 4.6, z: 7.0 },
    { x: 7.0, z: 8.8 },
  ],
  sunset_beach: [
    { x: -3.4, z: -2.4 },
    { x: -2.2, z: -1.6 },
    { x: -4.6, z: -1.4 },
    { x: -1.2, z: -2.6 },
    { x: -3.0, z: -0.6 },
  ],
};

// The outdoor maps are ringed by scenery rather than walls: pines round the campfire clearing,
// open sea past the beach. Enumerating the seeded trees as boxes would be absurd, so each is
// one rule instead — with the ways in (the stone trail, the pier) carved out of it.
const FOREST_RADIUS = 8.3;
const TRAIL_HALF_WIDTH = 2.6;
const TRAIL_START_Z = 5.0;
/** Past this the beach becomes sea; the pier is the only way out over the water. */
export const SHORELINE_Z = 4.8;
export const PIER_MIN_X = 1.0;
export const PIER_MAX_X = 3.4;
export const PIER_END_Z = 8.0;

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
