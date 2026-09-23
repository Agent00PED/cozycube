import { BLUFF, BOXING_RING, LOUNGE_PIT, MAP_HALF, ONSEN_POOL, VIP_PLATFORM, type MapId } from "./types";
import { LOFT_OBSTACLES, LOFT_SPAWNS } from "./worlds/lounge";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The default slab spans -10..10 on both axes; players are kept a little inside its lip. */
export const WORLD_LIMIT = 9.4;
/** Each map's own limit: the campfire valley is 28x28, the rest 20x20 (see MAP_HALF). */
export function worldLimit(mapId: MapId): number {
  return MAP_HALF[mapId] - 0.6;
}
/** The largest limit of any map: the pathfinding grid is sized to it. */
export const GRID_LIMIT = Math.max(...Object.values(MAP_HALF)) - 0.6;

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
  // the Loft is authored in shared/worlds/lounge.ts
  cozy_lounge: LOFT_OBSTACLES,

  campfire_night: [
    { minX: -0.9, maxX: 0.9, minZ: -0.9, maxZ: 0.9 }, // fire pit and its tripod
    { minX: -0.3, maxX: 0.5, minZ: -2.4, maxZ: -1.6 }, // the stew pot on its stand, in the gap between two logs
    { minX: -6.6, maxX: -4.6, minZ: -5.6, maxZ: -3.6 }, // tent 1, out on the open grass
    { minX: 4.4, maxX: 6.4, minZ: -6.0, maxZ: -4.0 }, // tent 2
    { minX: -7.2, maxX: -5.2, minZ: 1.6, maxZ: 3.6 }, // tent 3
    { minX: -11.2, maxX: -9.2, minZ: -5.4, maxZ: -3.4 }, // tent 4, the glamping clearing
    { minX: -9.8, maxX: -9.4, minZ: -8.8, maxZ: -8.4 }, // hammock post, west
    { minX: -7.2, maxX: -6.8, minZ: -8.8, maxZ: -8.4 }, // hammock post, east
    { minX: -8.3, maxX: -7.7, minZ: -6.9, maxZ: -6.3 }, // glamping lantern stump
    { minX: 4.1, maxX: 4.7, minZ: -2.5, maxZ: -1.9 }, // lantern stump east
    { minX: -4.7, maxX: -4.1, minZ: 1.9, maxZ: 2.5 }, // lantern stump west
    { minX: -3.4, maxX: -2.4, minZ: -4.8, maxZ: -3.8 }, // firewood stack
    { minX: 9.6, maxX: 10.2, minZ: -10.6, maxZ: -10.0 }, // telescope, up on the stargazing bluff
    { minX: 11.0, maxX: 11.8, minZ: -9.2, maxZ: -8.4 }, // boulder on the bluff's rim
    { minX: 1.6, maxX: 3.0, minZ: -6.4, maxZ: -5.6 }, // camp table and cooler
    { minX: 6.1, maxX: 6.7, minZ: 1.9, maxZ: 2.5 }, // Ranger Oak
    { minX: -7.15, maxX: -6.45, minZ: -1.55, maxZ: -0.85 }, // berry bush west
    { minX: -1.35, maxX: -0.65, minZ: -7.55, maxZ: -6.85 }, // berry bush north
    { minX: 6.45, maxX: 7.15, minZ: -0.35, maxZ: 0.35 }, // berry bush east
  ],

  sunset_beach: [
    { minX: -3.6, maxX: 2.4, minZ: -6.6, maxZ: -5.3 }, // tiki bar counter and its back shelf
    // --- The wider beach: dunes to the north, rock pools west, more palms east ---
    { minX: -7.6, maxX: -6.0, minZ: -13.2, maxZ: -11.6 }, // lifeguard tower
    { minX: -13.4, maxX: -10.6, minZ: -7.2, maxZ: -5.0 }, // the shell shack
    { minX: -13.2, maxX: -10.8, minZ: 0.4, maxZ: 3.2 }, // the rock pool
    { minX: 11.6, maxX: 12.4, minZ: -4.4, maxZ: -3.6 }, // palm, east
    { minX: 12.0, maxX: 12.8, minZ: 1.6, maxZ: 2.4 }, // palm, east
    { minX: 2.2, maxX: 3.0, minZ: -12.6, maxZ: -11.8 }, // palm on the dune
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
    { minX: 7.05, maxX: 7.35, minZ: 0.55, maxZ: 0.85 }, // cabana post
    { minX: 9.05, maxX: 9.35, minZ: 0.55, maxZ: 0.85 }, // cabana post
    { minX: 7.05, maxX: 7.35, minZ: 2.25, maxZ: 2.55 }, // cabana post
    { minX: 9.05, maxX: 9.35, minZ: 2.25, maxZ: 2.55 }, // cabana post
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
    // --- The foyer beyond the doormat and the east corridor ---
    { minX: 1.0, maxX: 3.6, minZ: 11.4, maxZ: 12.6 }, // coat-check counter
    { minX: -4.6, maxX: -2.6, minZ: 10.8, maxZ: 12.8 }, // the foyer fountain
    { minX: 11.8, maxX: 12.8, minZ: -8.2, maxZ: -5.4 }, // trophy case along the east wall
    { minX: 11.8, maxX: 12.8, minZ: 2.2, maxZ: 4.6 }, // brass mirror console
  ],

  // A 24x24 gym: the ring in the middle (its own height, see walkY), bleachers north and west,
  // a drink rail east, the doors and the spectator floor south.
  boxing_ring: [
    { minX: -3.5, maxX: -3.1, minZ: -3.5, maxZ: 3.5 }, // ropes, west
    { minX: 3.1, maxX: 3.5, minZ: -3.5, maxZ: 3.5 }, // ropes, east
    { minX: -3.5, maxX: 3.5, minZ: -3.5, maxZ: -3.1 }, // ropes, north
    { minX: -3.5, maxX: -0.9, minZ: 3.1, maxZ: 3.5 }, // ropes, south (a gap for the steps)
    { minX: 0.9, maxX: 3.5, minZ: 3.1, maxZ: 3.5 },
    { minX: -9.8, maxX: -6.4, minZ: -6.4, maxZ: 6.4 }, // west bleachers (the benches are seats)
    { minX: -6.4, maxX: 6.4, minZ: -9.8, maxZ: -6.4 }, // north bleachers
    { minX: 7.6, maxX: 8.4, minZ: -4.4, maxZ: 4.4 }, // the drink rail (stools sit in front of it)
    { minX: 7.2, maxX: 9.4, minZ: -9.6, maxZ: -7.2 }, // corner: the ring bell podium and buckets
    { minX: -9.6, maxX: -7.2, minZ: 7.4, maxZ: 9.6 }, // corner: the towel and water station
    { minX: 3.4, maxX: 5.0, minZ: 7.8, maxZ: 9.6 }, // the trainer's desk by the doors
  ],

  // A 26x26 mountain bathhouse: the hot spring in the middle (a basin, see walkY), rocks round
  // it with a gap for the steps on the south side, bamboo north and west, the tea house and the
  // wishing well on either side, the changing hut by the entrance.
  japanese_onsen: [
    { minX: -4.3, maxX: -3.4, minZ: -3.4, maxZ: 3.4 }, // rocks, west rim
    { minX: 3.4, maxX: 4.3, minZ: -3.4, maxZ: 3.4 }, // rocks, east rim
    { minX: -4.3, maxX: 4.3, minZ: -3.5, maxZ: -2.6 }, // rocks, north rim
    { minX: -4.3, maxX: -1.2, minZ: 2.6, maxZ: 3.5 }, // rocks, south rim (steps in the gap)
    { minX: 1.2, maxX: 4.3, minZ: 2.6, maxZ: 3.5 },
    { minX: -9.2, maxX: -5.4, minZ: -9.0, maxZ: -5.2 }, // the tea house
    { minX: 5.6, maxX: 7.4, minZ: -6.6, maxZ: -4.8 }, // the wishing well
    { minX: -6.6, maxX: -5.4, minZ: 0.0, maxZ: 1.0 }, // the shishi-odoshi and its basin
    { minX: 6.8, maxX: 9.6, minZ: 4.4, maxZ: 7.4 }, // the changing hut
    { minX: -7.4, maxX: -6.6, minZ: 5.2, maxZ: 6.0 }, // stone lantern
    { minX: 6.4, maxX: 7.2, minZ: -1.2, maxZ: -0.4 }, // stone lantern
    { minX: -3.0, maxX: -2.2, minZ: 6.6, maxZ: 7.4 }, // cherry tree
    { minX: 8.4, maxX: 9.2, minZ: -9.2, maxZ: -8.4 }, // cherry tree
    { minX: -10.4, maxX: -9.6, minZ: 3.4, maxZ: 4.2 }, // cherry tree
  ],

  // A 24x24 arcade: cabinets along the north wall, gachapon along the west wall, the claw and
  // the prize counter in the north-east, the snack bar east, the dance floor in the middle.
  retro_arcade: [
    { minX: -9.2, maxX: 2.2, minZ: -11.8, maxZ: -10.4 }, // the row of cabinets
    { minX: -11.8, maxX: -10.4, minZ: -5.2, maxZ: 1.2 }, // three gachapon machines
    { minX: 3.0, maxX: 5.0, minZ: -11.8, maxZ: -10.0 }, // the claw machine
    { minX: 6.4, maxX: 11.6, minZ: -11.8, maxZ: -10.4 }, // prize counter
    { minX: 8.8, maxX: 10.4, minZ: -3.4, maxZ: 3.4 }, // the snack bar (stools in front)
    { minX: -11.8, maxX: -10.6, minZ: 4.0, maxZ: 8.0 }, // pinball machines along the west wall
    { minX: -6.0, maxX: -4.4, minZ: 8.8, maxZ: 10.2 }, // the photo booth
    { minX: 8.2, maxX: 9.4, minZ: 7.6, maxZ: 8.8 }, // a vending machine by the doors
  ],
};

// Where players arrive: the lounge deck, the end of the campfire trail, the top of the beach.
export const MAP_SPAWN_POINTS: Record<MapId, { x: number; z: number }[]> = {
  cozy_lounge: LOFT_SPAWNS,
  campfire_night: [
    { x: 0, z: 12.2 },
    { x: 1.4, z: 12.7 },
    { x: -1.4, z: 12.7 },
    { x: 0.7, z: 13.0 },
    { x: -0.7, z: 13.0 },
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
  boxing_ring: [
    { x: 0, z: 8.6 },
    { x: 1.4, z: 9.2 },
    { x: -1.4, z: 9.2 },
    { x: 0.8, z: 10.2 },
    { x: -0.8, z: 10.2 },
  ],
  japanese_onsen: [
    { x: 0, z: 9.4 },
    { x: 1.4, z: 10.0 },
    { x: -1.4, z: 10.0 },
    { x: 0.7, z: 11.0 },
    { x: -0.7, z: 11.0 },
  ],
  retro_arcade: [
    { x: 1.0, z: 9.0 },
    { x: 2.4, z: 9.6 },
    { x: -0.4, z: 9.6 },
    { x: 1.6, z: 10.4 },
    { x: 0.2, z: 10.4 },
  ],
};

// The outdoor maps are ringed by scenery rather than walls: pines round the campfire clearing,
// open sea past the beach. Enumerating the seeded trees as boxes would be absurd, so each is
// one rule instead — with the ways in (the stone trail, the pier) carved out of it.
/** The valley: pines close in past this radius (the bluff in the NE corner is carved out). */
export const FOREST_RADIUS = 12.4;
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
  if (mapId === "campfire_night") {
    // the stargazing bluff: a knoll with gentle sides all round
    const d = Math.hypot(x - BLUFF.x, z - BLUFF.z);
    if (d < BLUFF.radius + 0.9) return BLUFF.height * smooth(BLUFF.radius + 0.9, BLUFF.radius - 0.4, d);
    if (Math.abs(x) > BRIDGE_HALF + 0.3) return 0;
    const along = Math.abs(z - streamZ(x));
    if (along >= BRIDGE_HALF_LENGTH + BRIDGE_RAMP) return 0;
    if (along <= BRIDGE_HALF_LENGTH) return BRIDGE_DECK_Y;
    return BRIDGE_DECK_Y * smooth(BRIDGE_HALF_LENGTH + BRIDGE_RAMP, BRIDGE_HALF_LENGTH, along);
  }
  if (mapId === "cozy_lounge") {
    // the sunken conversation pit: a step down, eased over the rim
    const p = LOUNGE_PIT;
    const inset = Math.min(x - p.x0, p.x1 - x, z - p.z0, p.z1 - z);
    if (inset <= 0) return 0;
    return -p.depth * smooth(0, 0.35, inset);
  }
  if (mapId === "velvet_casino") {
    // the raised VIP lounge: a ramp along its open edge (z0), walls or the rope everywhere else
    const v = VIP_PLATFORM;
    if (x < v.x0 - 0.2 || x > v.x1 + 0.2 || z > v.z1 || z < v.z0 - 0.5) return 0;
    return v.height * smooth(v.z0 - 0.5, v.z0 + 0.05, z);
  }
  if (mapId === "boxing_ring") {
    // the ring stands on its platform; the steps on the south side climb up to it
    const r = BOXING_RING;
    const inside = Math.abs(x - r.x) <= r.half && Math.abs(z - r.z) <= r.half;
    if (inside) return r.height;
    if (Math.abs(x - r.x) < 0.9 && z > r.z + r.half && z < r.z + r.half + 0.9) return r.height * smooth(r.z + r.half + 0.9, r.z + r.half, z);
    return 0;
  }
  if (mapId === "japanese_onsen") {
    // the hot spring basin: a step down into the water, the steps on the south side
    const p = ONSEN_POOL;
    const inside = x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1;
    if (inside) return -p.depth;
    if (Math.abs(x) < 1.2 && z >= p.z1 && z < p.z1 + 0.9) return -p.depth * smooth(p.z1 + 0.9, p.z1, z);
    return 0;
  }
  return 0;
}

/** Hermite ease from 0 at `a` to 1 at `b` (either order). */
function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function inScenery(mapId: MapId, x: number, z: number, radius: number): boolean {
  if (mapId === "campfire_night") {
    // The stream is a wall except on the bridge deck, and the rails keep you on the deck.
    if (Math.abs(z - streamZ(x)) < STREAM_HALF + radius && Math.abs(x) + radius > BRIDGE_HALF) return true;
    if (Math.abs(x) < TRAIL_HALF_WIDTH && z > TRAIL_START_Z) return false; // the stone trail
    if (Math.hypot(x - BLUFF.x, z - BLUFF.z) < BLUFF.radius + 0.4) return false; // the stargazing bluff
    return Math.hypot(x, z) > FOREST_RADIUS;
  }
  if (mapId === "sunset_beach") {
    if (z <= SHORELINE_Z) return false;
    return !(x > PIER_MIN_X && x < PIER_MAX_X && z < PIER_END_Z);
  }
  return false;
}

export function isBlocked(x: number, z: number, mapId: MapId, radius = 0.3): boolean {
  const limit = worldLimit(mapId);
  if (Math.abs(x) > limit || Math.abs(z) > limit) return true;
  if (inScenery(mapId, x, z, radius)) return true;
  for (const box of MAP_OBSTACLES[mapId]) {
    if (x + radius > box.minX && x - radius < box.maxX && z + radius > box.minZ && z - radius < box.maxZ) {
      return true;
    }
  }
  return false;
}

/**
 * The DRAWN floor height at (x, z). Like walkY, except the lounge pit is the hard step it is
 * drawn as (walkY eases avatars over its rim). For checks against geometry, not for walking.
 */
export function floorY(mapId: MapId, x: number, z: number): number {
  if (mapId === "cozy_lounge") {
    const p = LOUNGE_PIT;
    return x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1 ? -p.depth : 0;
  }
  return walkY(mapId, x, z);
}

export function clampToWorld(v: number, mapId: MapId = "cozy_lounge"): number {
  const limit = worldLimit(mapId);
  return Math.max(-limit, Math.min(limit, v));
}
