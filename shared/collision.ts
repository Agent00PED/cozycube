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
    // --- Living room (the middle of the floor) ---
    { minX: -5.5, maxX: -0.5, minZ: -4.1, maxZ: -3.2 }, // slatted screen with the media console and TV
    { minX: -5.3, maxX: -0.6, minZ: 0.5, maxZ: 1.6 }, // L-sofa, long run
    { minX: -6.2, maxX: -5.0, minZ: -1.75, maxZ: 1.6 }, // L-sofa, return leg
    { minX: -4.1, maxX: -1.9, minZ: -1.75, maxZ: -0.85 }, // coffee table
    { minX: 0.3, maxX: 0.9, minZ: 0.05, maxZ: 0.65 }, // side table by the armchair
    { minX: 0.6, maxX: 1.2, minZ: 1.2, maxZ: 1.8 }, // floor lamp
    { minX: -5.2, maxX: -0.8, minZ: 1.7, maxZ: 2.2 }, // low bookshelf behind the sofa
    { minX: -6.75, maxX: -6.05, minZ: -3.85, maxZ: -3.15 }, // monstera at the screen's end
    { minX: -0.55, maxX: 0.15, minZ: 1.85, maxZ: 2.55 }, // olive tree by the sofa
    // --- Kitchen ---
    { minX: 0.8, maxX: 9.4, minZ: -9.8, maxZ: -8.8 }, // back counter run, sink and fridge grouped
    { minX: 3.3, maxX: 6.9, minZ: -6.8, maxZ: -5.6 }, // bar island
    // --- Dining set ---
    { minX: -0.1, maxX: 2.7, minZ: -6.9, maxZ: -5.5 }, // farmhouse table (chairs tuck under, so they are not boxes)
    // --- Gamer corner ---
    { minX: -9.8, maxX: -8.4, minZ: -8.7, maxZ: -5.7 }, // streamer desk against the left wall
    { minX: -7.5, maxX: -5.1, minZ: -9.8, maxZ: -9.0 }, // both arcade cabinets on the back wall
    { minX: -3.7, maxX: -0.9, minZ: -9.8, maxZ: -9.3 }, // tall bookcase
    { minX: -2.75, maxX: -2.15, minZ: -8.1, maxZ: -7.5 }, // snack table between the beanbags
    { minX: -9.6, maxX: -8.8, minZ: -9.6, maxZ: -8.8 }, // corner plant
    // --- Reading & tea lounge (front-left wing), everything gathered round the tea table ---
    { minX: -9.8, maxX: -8.9, minZ: 2.4, maxZ: 5.2 }, // record shelf against the left wall
    { minX: -8.4, maxX: -7.8, minZ: 6.7, maxZ: 7.3 }, // reading lamp behind the armchair
    { minX: -9.1, maxX: -8.3, minZ: 7.6, maxZ: 8.4 }, // guitar on its stand, in the corner by the wall
    { minX: -6.65, maxX: -5.95, minZ: 6.35, maxZ: 7.05 }, // round side table beside the armchair
    { minX: -5.1, maxX: -3.7, minZ: 4.7, maxZ: 6.1 }, // the low tea table
    { minX: 2.2, maxX: 2.8, minZ: 6.1, maxZ: 6.7 }, // fig, clear of the cushions
    { minX: -2.3, maxX: -1.7, minZ: 7.4, maxZ: 8.0 }, // snake plant
    { minX: 1.5, maxX: 2.1, minZ: 3.0, maxZ: 3.6 }, // fern
    // --- Balcony deck ---
    { minX: 8.6, maxX: 9.2, minZ: 5.1, maxZ: 5.7 }, // floor lantern
    { minX: 5.2, maxX: 5.8, minZ: 0.7, maxZ: 1.3 }, // potted fig by the deck step
    { minX: 8.5, maxX: 9.2, minZ: 1.4, maxZ: 2.1 }, // olive tree
    { minX: 8.75, maxX: 9.45, minZ: 6.85, maxZ: 7.55 }, // monstera on the deck
    { minX: 8.8, maxX: 9.4, minZ: 2.9, maxZ: 3.5 }, // fern on its plant stool
  ],

  campfire_night: [
    { minX: -0.9, maxX: 0.9, minZ: -0.9, maxZ: 0.9 }, // fire pit and its tripod
    { minX: -6.6, maxX: -4.6, minZ: -5.6, maxZ: -3.6 }, // tent 1, out on the open grass
    { minX: 4.4, maxX: 6.4, minZ: -6.0, maxZ: -4.0 }, // tent 2
    { minX: -7.2, maxX: -5.2, minZ: 1.6, maxZ: 3.6 }, // tent 3
    { minX: 4.1, maxX: 4.7, minZ: -2.5, maxZ: -1.9 }, // lantern stump east
    { minX: -4.7, maxX: -4.1, minZ: 1.9, maxZ: 2.5 }, // lantern stump west
    { minX: -3.4, maxX: -2.4, minZ: -4.8, maxZ: -3.8 }, // firewood stack
    { minX: 7.7, maxX: 8.3, minZ: -3.3, maxZ: -2.7 }, // telescope, in the back corner
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
    { minX: 7.05, maxX: 7.75, minZ: -3.75, maxZ: -3.05 }, // cooler, clear of the driftwood logs
    { minX: -7.3, maxX: -6.7, minZ: 1.3, maxZ: 1.9 }, // parasol post between the loungers
    { minX: -8.6, maxX: -7.8, minZ: -7.4, maxZ: -6.6 }, // palm by the bar
    { minX: 7.4, maxX: 8.2, minZ: -6.2, maxZ: -5.4 }, // palm at the top of the beach
    { minX: -8.8, maxX: -8.0, minZ: -0.8, maxZ: 0.0 }, // palm with the surfboards leaning on it
    { minX: 3.0, maxX: 3.8, minZ: -8.6, maxZ: -7.8 }, // palm behind the bar
    { minX: -9.4, maxX: -8.6, minZ: 3.6, maxZ: 4.4 }, // palm shading the loungers from the west
    { minX: -5.2, maxX: -4.6, minZ: -3.9, maxZ: -3.3 }, // volleyball post
    { minX: -5.2, maxX: -4.6, minZ: -0.3, maxZ: 0.3 }, // volleyball post
    { minX: -3.7, maxX: -1.5, minZ: -0.1, maxZ: 2.1 }, // rowboat pulled up on the sand
    { minX: 8.8, maxX: 9.6, minZ: -9.2, maxZ: -8.4 }, // palm, up in the back corner of the beach
    { minX: 3.5, maxX: 5.4, minZ: 3.5, maxZ: 4.6 }, // Fisherman Bob and his bait stall beside him
  ],

  // A 20x20 retro casino: walls on x = -10 and z = -10 like the lounge, open toward the camera.
  velvet_casino: [
    { minX: -1.3, maxX: 2.5, minZ: -0.9, maxZ: 1.7 }, // the grand roulette table
    { minX: -9.8, maxX: -3.0, minZ: -9.8, maxZ: -8.8 }, // bar counter along the back wall
    { minX: 0.9, maxX: 5.7, minZ: -9.8, maxZ: -8.9 }, // three slot machines
    { minX: 6.4, maxX: 9.8, minZ: -9.8, maxZ: -7.6 }, // cashier cage
    { minX: 7.3, maxX: 8.7, minZ: -5.4, maxZ: -4.0 }, // High Roller leaderboard easel
    { minX: 2.05, maxX: 2.75, minZ: -1.65, maxZ: -0.95 }, // roulette dealer, at the far end of the layout
    { minX: 3.85, maxX: 4.75, minZ: 1.95, maxZ: 2.85 }, // cocktail high-top, front-right of the wheel
    { minX: -2.65, maxX: -1.75, minZ: 2.75, maxZ: 3.65 }, // cocktail high-top, front-left
    { minX: 3.65, maxX: 4.55, minZ: -2.85, maxZ: -1.95 }, // cocktail high-top, behind the dealer
    { minX: -6.95, maxX: -4.05, minZ: -5.3, maxZ: -3.75 }, // blackjack table, to the edge of its curve
    { minX: -7.0, maxX: -4.0, minZ: -6.1, maxZ: -5.3 }, // the dealer's side behind it: no walking into the counter
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

/** The campfire stream's centre line (shared with CampfireWorld, which draws it). */
export function streamZ(x: number): number {
  return 6.4 + Math.sin(x * 0.34) * 0.9;
}
/** Half-width of the stream and its muddy banks: nobody wades in. */
const STREAM_HALF = 1.0;
/** The plank bridge: walkable between its rails (at x = +/-0.85). */
const BRIDGE_HALF = 0.62;
/** The bridge deck: its plank tops stand this high, and it spans this far either side of the stream. */
export const BRIDGE_DECK_Y = 0.26;
export const BRIDGE_HALF_LENGTH = 1.77;
/** The little ramps at each end climb over this distance. */
const BRIDGE_RAMP = 0.5;

/**
 * The height of the ground under a player's feet. Flat everywhere except the campfire's plank
 * bridge, which lifts the walk plane onto its deck (with a short ramp at each end) so legs
 * never sink through the planks. Client-side only: it is where the avatar is DRAWN.
 */
export function walkY(mapId: MapId, x: number, z: number): number {
  if (mapId !== "campfire_night") return 0;
  if (Math.abs(x) > BRIDGE_HALF + 0.3) return 0;
  const along = Math.abs(z - streamZ(x));
  if (along >= BRIDGE_HALF_LENGTH + BRIDGE_RAMP) return 0;
  if (along <= BRIDGE_HALF_LENGTH) return BRIDGE_DECK_Y;
  const t = 1 - (along - BRIDGE_HALF_LENGTH) / BRIDGE_RAMP;
  return BRIDGE_DECK_Y * t * t * (3 - 2 * t);
}

function inScenery(mapId: MapId, x: number, z: number, radius: number): boolean {
  if (mapId === "campfire_night") {
    // The stream is a wall except on the bridge deck, and the rails keep you on the deck.
    if (Math.abs(z - streamZ(x)) < STREAM_HALF + radius && Math.abs(x) + radius > BRIDGE_HALF) return true;
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
  if (inScenery(mapId, x, z, radius)) return true;
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
