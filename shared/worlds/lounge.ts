import type { AABB } from "../collision";
import type { ChairConfig, MochiWaypoint, ToggleableConfig } from "../props";

// The Loft: the cozy lounge's whole floor plan in one place.
//
// Everything the server, the validator and the client need to agree on about this room is
// authored HERE and only here: the room's size, the sunken pit, every seat, every interactive
// prop, every collider, the spawns, Mochi's walk and the camera frame. `shared/props.ts`,
// `shared/collision.ts` and `shared/types.ts` read from this file for the cozy_lounge
// entries; `client/src/scene/LoungeWorld.tsx` draws the same numbers. Move a piece of
// furniture here and the picture, the collider and the seat anchor move together.
//
// The room is an intimate 15x15 penthouse: two solid walls along x = -7.5 and z = -7.5 (inner
// faces at -7.3), open toward +X and +Z where the camera stands, with a low balustrade along
// the open edges. Walking is clamped to worldLimit (MAP_HALF - 0.6 = 6.9), so nobody steps
// through a wall or over the rail.
//
// Proportions follow the avatar (about 1.3 units tall): counters at 0.68 (its waist), seats at
// 0.36, stools at 0.48, tables at 0.58, the mantel at 1.05.
//
// Zones, left to right as the camera sees them:
//   back-left    the hearth: brick chimney breast with the TV over the mantel, a built-in
//                bookcase beside it, Mochi's hearthrug in front
//   left wall    the reading nook (wingback, lamp behind it, side table), three tall windows
//                with a chaise in the sun and the games table under the last one
//   centre       the conversation pit: a closed corner sofa round the fire, a round table
//   back-right   the kitchen: counter run on the back wall with a window over the sink, the
//                island with three stools, a bistro table for two beside it
//   front-right  the lounge corner: loveseat, armchair, lamp behind, a rug; the record console
//
// Walkways: 1.8 between the island and the bistro table, 1.5 between the counter and the
// island, 1.3 beside the pit; nothing narrower (the avatar is 0.6 wide).

type SeatSpec = Omit<ChairConfig, "sitY">;

const FACE_NEG_Z = Math.PI;
const FACE_POS_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;
const FACE_POS_Z = 0;

/** Half the room's width: the slab spans -7.5..7.5 and the walls stand at -7.5. */
export const LOFT_HALF = 7.5;
/** The walls' height; pendant cords drop from this plane. */
export const LOFT_WALL_HEIGHT = 3.2;
/** The camera holds this frame in the lounge (centre and the world-units it fits across). */
export const LOFT_FRAME = { x: 0, z: 0, size: LOFT_HALF * 2 + 0.8 };
/** How close to a seat you stand before the dock offers to sit you on it. */
export const LOFT_SEAT_REACH = 1.5;

/** The sunken conversation pit: a step down, eased over its rim by walkY. */
export const LOFT_PIT = { x0: -4.7, x1: -0.1, z0: -4.4, z1: -0.7, depth: 0.2 };

// --- the hearth ---
export const HEARTH = {
  /** The chimney breast on the back wall (its full footprint is a collider). */
  x0: -4.4,
  x1: -2.0,
  z0: -7.5,
  z1: -6.5,
  fireY: 0.5,
  mantelY: 1.05,
  rug: { x: -3.5, z: -5.5, radius: 0.95 },
};

/** The built-in bookcase left of the chimney. */
export const BOOKCASE = { x0: -7.1, x1: -4.7, z0: -7.3, z1: -6.9, height: 2.3 };

// --- the kitchen ---
export const KITCHEN = {
  /** The counter run along the back wall, right of the fridge. */
  counter: { x0: -0.4, x1: 6.4, z0: -7.3, z1: -6.4, height: 0.68 },
  /** The fridge, tucked between the chimney and the counter. */
  fridge: { x0: -1.5, x1: -0.6, z0: -7.3, z1: -6.4, height: 1.5 },
  /** The window over the sink, on the back wall. */
  window: { x0: 0.4, x1: 2.2, y0: 1.2, y1: 2.4 },
  sinkX: 1.3,
  hobX: 5.0,
  /** The island; the stools sit along its +Z side. */
  island: { x0: 1.4, x1: 4.0, z0: -4.9, z1: -3.8, height: 0.68 },
  stoolXs: [1.9, 2.7, 3.5],
  stoolZ: -3.0,
  /** The mat between the counter and the island (Mochi's kitchen spot is on its right end). */
  mat: { x0: 0.2, x1: 5.8, z0: -6.2, z1: -5.1 },
  /** A bistro table for two, an 1.8 corridor from the island. */
  bistro: { x: 6.3, z: -2.8, radius: 0.5, height: 0.58 },
  bistroChairZs: { north: -3.9, south: -1.7 },
  /** The espresso machine's spot on the counter. */
  espresso: { x: 3.4, z: -6.85 },
};

// --- the conversation pit's furniture (all relative to the PIT FLOOR, a step down) ---
export const PIT_SOFA = {
  /** The south run, its back along the pit's +Z rim. */
  south: { x0: LOFT_PIT.x0, x1: LOFT_PIT.x1, z0: -1.8, z1: LOFT_PIT.z1 },
  /** The east run, its back along the +X rim, turned in for conversation. */
  east: { x0: -0.9, x1: LOFT_PIT.x1, z0: LOFT_PIT.z0, z1: -1.8 },
  /** The closed corner where the two runs meet (a seat of its own). */
  corner: { x: -0.5, z: -1.25 },
  seatZ: -1.25,
  seatXs: [-3.9, -2.7, -1.5],
  eastSeatX: -0.5,
  eastSeatZs: [-3.7, -2.6],
  table: { x: -2.7, z: -3.4, radius: 0.45, height: 0.34 },
};

// --- the left wall ---
export const READING = { chair: { x: -6.5, z: -4.9 }, lamp: { x: -6.9, z: -5.9 }, sideTable: { x: -6.9, z: -3.9 } };
/** Three tall windows on the left wall; the frames are embedded a little into the wall. */
export const WINDOWS = [
  { z0: -1.6, z1: 0.4 },
  { z0: 0.9, z1: 2.9 },
  { z0: 3.6, z1: 5.6 },
] as const;
export const WINDOW_Y = { y0: 0.6, y1: 2.4 };
export const CHAISE = { x: -6.6, z: 2.0, w: 0.9, d: 2.2 };
export const SUNNY_RUG = { x: -6.3, z: -0.6, radius: 0.7 };

// --- the front corners ---
export const LOUNGE_CORNER = {
  loveseat: { x0: 3.4, x1: 5.8, z0: 4.4, z1: 5.2 },
  loveSeatXs: [4.0, 5.2],
  loveSeatZ: 4.7,
  armchair: { x: 2.0, z: 4.6 },
  lamp: { x: 6.3, z: 5.6 },
  rug: { x: 4.2, z: 3.7, radius: 1.3 },
  sideTable: { x: 6.4, z: 4.7 },
};
export const GAMES = {
  table: { x: -4.6, z: 5.4, radius: 0.6, height: 0.68 },
  chairA: { x: -4.6, z: 4.2 },
  chairB: { x: -3.4, z: 5.4 },
};
export const CONSOLE = { x0: 6.5, x1: 7.3, z0: -0.2, z1: 1.0, height: 0.62 };

/** The plants that stand about the room (each a small collider). */
export const PLANTS = [
  { x: 6.8, z: 1.8, kind: "fig" },
  { x: -6.9, z: -2.3, kind: "monstera" },
  { x: -2.9, z: 6.4, kind: "olive" },
  { x: -6.9, z: 6.6, kind: "olive" },
] as const;

// ---------------------------------------------------------------------------------------
// The shared tables: seats, props, colliders, spawns and Mochi's walk
// ---------------------------------------------------------------------------------------

export const LOFT_SEATS: SeatSpec[] = [
  // the pit: south run facing the fire, east run turned in, and the corner between them
  ...PIT_SOFA.seatXs.map((x, i) => ({ propId: `pit_s${i + 1}`, x, z: PIT_SOFA.seatZ, rotationY: FACE_NEG_Z, style: "pad" as const, cushion: "loftSofa" as const, approachX: x, approachZ: -2.6 })),
  ...PIT_SOFA.eastSeatZs.map((z, i) => ({ propId: `pit_e${i + 1}`, x: PIT_SOFA.eastSeatX, z, rotationY: FACE_NEG_X, style: "pad" as const, cushion: "loftSofa" as const, approachX: -1.6, approachZ: z })),
  { propId: "pit_c", x: PIT_SOFA.corner.x, z: PIT_SOFA.corner.z, rotationY: (-3 * Math.PI) / 4, style: "pad", cushion: "loftSofa", approachX: -1.6, approachZ: -2.4 },
  // the reading nook, beside the hearth
  { propId: "read_1", x: READING.chair.x, z: READING.chair.z, rotationY: FACE_POS_X, style: "pad", cushion: "loftWingback", approachX: -5.4, approachZ: READING.chair.z },
  // the chaise in the window light
  { propId: "chaise_1", x: CHAISE.x, z: CHAISE.z, rotationY: FACE_POS_X, style: "pad", cushion: "chaise", approachX: -5.5, approachZ: CHAISE.z },
  // the island: three stools facing the counter
  ...KITCHEN.stoolXs.map((x, i) => ({ propId: `stool_${i + 1}`, x, z: KITCHEN.stoolZ, rotationY: FACE_NEG_Z, style: "pad" as const, cushion: "loftStool" as const, approachX: x, approachZ: -2.1 })),
  // the bistro table: a chair each side
  { propId: "bistro_n", x: KITCHEN.bistro.x, z: KITCHEN.bistroChairZs.north, rotationY: FACE_POS_Z, style: "pad", cushion: "loftDining", approachX: KITCHEN.bistro.x, approachZ: -4.9 },
  { propId: "bistro_s", x: KITCHEN.bistro.x, z: KITCHEN.bistroChairZs.south, rotationY: FACE_NEG_Z, style: "pad", cushion: "loftDining", approachX: KITCHEN.bistro.x, approachZ: -0.7 },
  // the lounge corner: a loveseat for two and an armchair
  ...LOUNGE_CORNER.loveSeatXs.map((x, i) => ({ propId: `love_${i + 1}`, x, z: LOUNGE_CORNER.loveSeatZ, rotationY: FACE_NEG_Z, style: "pad" as const, cushion: "loveseat" as const, approachX: x, approachZ: 3.6 })),
  { propId: "arm_1", x: LOUNGE_CORNER.armchair.x, z: LOUNGE_CORNER.armchair.z, rotationY: FACE_POS_X, style: "pad", cushion: "loftArmchair", approachX: 1.0, approachZ: LOUNGE_CORNER.armchair.z },
  // the games table under the last window: two chairs
  { propId: "game_1", x: GAMES.chairA.x, z: GAMES.chairA.z, rotationY: FACE_POS_Z, style: "pad", cushion: "loftDining", approachX: GAMES.chairA.x, approachZ: 3.2 },
  { propId: "game_2", x: GAMES.chairB.x, z: GAMES.chairB.z, rotationY: FACE_NEG_X, style: "pad", cushion: "loftDining", approachX: -2.4, approachZ: GAMES.chairB.z },
];

export const LOFT_PROPS: ToggleableConfig[] = [
  // the TV over the mantel (the WallTV faces +Z, into the room; its bracket touches the brick)
  { propId: "loft_tv", x: (HEARTH.x0 + HEARTH.x1) / 2, y: 1.95, z: HEARTH.z1 + 0.13, kind: "tv", color: "#9ad1e8", defaultOn: true },
  // floor lamps stand BEHIND their chairs, never in front of a seat
  { propId: "loft_lamp_read", x: READING.lamp.x, z: READING.lamp.z, kind: "lamp", color: "#ffc47a", defaultOn: true },
  { propId: "loft_lamp_lounge", x: LOUNGE_CORNER.lamp.x, z: LOUNGE_CORNER.lamp.z, kind: "lamp", color: "#ffcf8a", defaultOn: true },
  // pendants over the island and the bistro table (LoungeWorld drops their cords from the ceiling plane)
  { propId: "loft_pendant_island", x: (KITCHEN.island.x0 + KITCHEN.island.x1) / 2, y: 1.85, z: (KITCHEN.island.z0 + KITCHEN.island.z1) / 2, kind: "pendant", color: "#ffd08a", defaultOn: true },
  { propId: "loft_pendant_bistro", x: KITCHEN.bistro.x, y: 1.8, z: KITCHEN.bistro.z, kind: "pendant", color: "#ffd08a", defaultOn: true, intensity: 0.8 },
  // the espresso machine on the back counter
  { propId: "loft_espresso", x: KITCHEN.espresso.x, y: KITCHEN.counter.height + 0.03, z: KITCHEN.espresso.z, kind: "espresso", color: "#ffb36b", defaultOn: true, approachX: KITCHEN.espresso.x, approachZ: -5.6 },
  // the turntable on the record console by the open edge
  { propId: "loft_turntable", x: (CONSOLE.x0 + CONSOLE.x1) / 2, y: CONSOLE.height, z: (CONSOLE.z0 + CONSOLE.z1) / 2, kind: "turntable", color: "#e0a93b", defaultOn: true },
  { propId: "loft_boardgame", x: GAMES.table.x, y: GAMES.table.height + 0.04, z: GAMES.table.z, kind: "boardgame", color: "#f0e6d2", defaultOn: true, approachX: GAMES.table.x, approachZ: 6.5 },
  // Mochi sleeps on the hearthrug and wanders from there (LOFT_MOCHI)
  { propId: "mochi_loft", x: -4.2, z: -5.8, kind: "cat", color: "#f0a860", defaultOn: true, approachX: -4.2, approachZ: -4.8 },
];

/**
 * Mochi's day: the hearthrug, the sunlit window bay, back past the hearth, the kitchen mat.
 * Each leg is a straight walk, and the hearth sits between the other two so no leg has to
 * cross the pit.
 */
const MOCHI_HEARTH: MochiWaypoint = { x: -4.2, z: -5.8, ax: -4.2, az: -4.8 };
export const LOFT_MOCHI: MochiWaypoint[] = [
  MOCHI_HEARTH, // the hearthrug, in front of the fire
  { x: SUNNY_RUG.x, z: SUNNY_RUG.z, ax: -5.2, az: SUNNY_RUG.z }, // the sunlit window bay
  MOCHI_HEARTH,
  { x: 5.4, z: -5.6, ax: 5.4, az: -4.6 }, // the kitchen mat, by the hob
];

const around = (p: { x: number; z: number }, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });

export const LOFT_OBSTACLES: AABB[] = [
  // the hearth and the bookcase
  { minX: HEARTH.x0, maxX: HEARTH.x1, minZ: HEARTH.z0, maxZ: HEARTH.z1 },
  { minX: BOOKCASE.x0, maxX: BOOKCASE.x1, minZ: BOOKCASE.z0, maxZ: BOOKCASE.z1 },
  // the pit's sofa and table (their tops are seats; the runs themselves are solid)
  { minX: PIT_SOFA.south.x0, maxX: PIT_SOFA.south.x1, minZ: PIT_SOFA.south.z0, maxZ: PIT_SOFA.south.z1 },
  { minX: PIT_SOFA.east.x0, maxX: PIT_SOFA.east.x1, minZ: PIT_SOFA.east.z0, maxZ: PIT_SOFA.east.z1 },
  around(PIT_SOFA.table, PIT_SOFA.table.radius),
  // the reading nook and the chaise
  around(READING.lamp, 0.3),
  around(READING.sideTable, 0.3),
  { minX: CHAISE.x - CHAISE.w / 2, maxX: CHAISE.x + CHAISE.w / 2, minZ: CHAISE.z - CHAISE.d / 2, maxZ: CHAISE.z + CHAISE.d / 2 },
  // the kitchen
  { minX: KITCHEN.counter.x0, maxX: KITCHEN.counter.x1, minZ: KITCHEN.counter.z0, maxZ: KITCHEN.counter.z1 },
  { minX: KITCHEN.fridge.x0, maxX: KITCHEN.fridge.x1, minZ: KITCHEN.fridge.z0, maxZ: KITCHEN.fridge.z1 },
  { minX: KITCHEN.island.x0, maxX: KITCHEN.island.x1, minZ: KITCHEN.island.z0, maxZ: KITCHEN.island.z1 },
  around(KITCHEN.bistro, KITCHEN.bistro.radius),
  // the lounge corner
  { minX: LOUNGE_CORNER.loveseat.x0, maxX: LOUNGE_CORNER.loveseat.x1, minZ: LOUNGE_CORNER.loveseat.z0, maxZ: LOUNGE_CORNER.loveseat.z1 },
  around(LOUNGE_CORNER.lamp, 0.3),
  around(LOUNGE_CORNER.sideTable, 0.3),
  // the games table
  around(GAMES.table, GAMES.table.radius),
  // the record console by the open edge
  { minX: CONSOLE.x0, maxX: CONSOLE.x1, minZ: CONSOLE.z0, maxZ: CONSOLE.z1 },
  // the plants
  ...PLANTS.map((p) => around(p, 0.35)),
];

/** Everyone arrives along the open front and walks in. */
export const LOFT_SPAWNS = [
  { x: 0.5, z: 6.3 },
  { x: -0.7, z: 6.5 },
  { x: 1.7, z: 6.4 },
  { x: -1.9, z: 6.2 },
  { x: 2.9, z: 6.5 },
];
