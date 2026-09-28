import type { AABB } from "../collision";
import type { CushionId } from "../seats";
import type { BoardSide, CasinoPropKind, RingPropKind } from "../types";

// The Loft: the cozy lounge's whole floor plan, authored once.
//
// The server, the layout validator, the seat anchors and the client scene ALL read this file:
// LoungeWorld.tsx draws exactly these numbers, collision.ts turns them into obstacles and props.ts
// turns them into seats. Move a piece of furniture here and the picture, the collider and the
// seat anchor move together.
//
// An intimate 12.8x12.8 penthouse (a quarter smaller than it was, so the middle is lived in, not
// empty). Two solid back walls (x = -6.4 and z = -6.4, inner faces at -6.2), the front (+X and +Z)
// open to the camera behind a low balustrade. Avatars walk within +-NAV_LIMIT of the centre, and
// never through furniture.
//
// Proportions follow the ~1.3-unit avatar: counters 0.7 (its waist), seats 0.36, stools 0.48,
// bistro and games tables 0.58 / 0.68, the mantel 1.1.
//
// Zones, as the camera sees them (x runs right-and-down, z left-and-down):
//   back-left    THE HEARTH: brick chimney breast in the back wall with the firebox, flanked by
//                built-in shelves and a log basket; a closed L-shaped corner sofa snug in front of
//                it faces the fire across a round coffee table on the hearth rug
//   left wall    the reading nook (wingback, floor lamp), the chaise, three tall windows
//   back-right   THE KITCHEN: counter run on the back wall, an island with three stools under
//                two pendants, a bistro table for two, an olive tree in the railing corner
//   front-left   the games table (two chairs)
//   front-right  the pouf circle round a low table, a floor lamp, plants
//   front-left   by the last window, the Velvet Boutique: Chloe the cat maid beside her gilded
//                cheval mirror (she opens the wardrobe), nothing within 2 m in front of either
//
// Walkways: 1.8 or more between the sofa and the island's stools (2.8), between the stools and
// the pouf circle (2.9), between the games table and the poufs (2.0), and between the games table
// and Chloe's corner (1.9); 1.7 between the counter and the island, 1.0 or more everywhere else:
// nothing is narrower than the avatar (0.6) needs.

type Box = { x0: number; x1: number; z0: number; z1: number };
type Pt = { x: number; z: number };

const FACE_NEG_Z = Math.PI; // heading 0 is +z; a heading of pi faces the back wall
const FACE_POS_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;
const FACE_POS_Z = 0;

export const LOFT_HALF = 6.4;
/** The walls' thickness: their inner faces stand at +-(LOFT_HALF - WALL_T). */
export const WALL_T = 0.2;
export const WALL_HEIGHT = 3.2;
/** Avatars are kept within this of the centre on both axes. */
export const NAV_LIMIT = 5.9;
/** The camera holds this frame in the lounge: centre and world-units it fits across. */
export const LOFT_FRAME = { x: 0, z: 0, size: LOFT_HALF * 2 + 0.8 };
/** How close to a seat (or its approach point) you stand before the dock offers to sit you. */
export const SEAT_REACH = 1.5;
/** How close to Mochi you stand before the dock offers to pet her. */
export const MOCHI_REACH = 2.4;
/** How close to the games table (or where you stand to use it) the dock offers a board game. */
export const BOARD_REACH = 2.2;

// --- the hearth ---
export const HEARTH = {
  /** The chimney breast in the back wall: brick to the ceiling, a firebox cut into its face. */
  breast: { x0: -5.0, x1: -2.6, z0: -6.2, z1: -5.4 } as Box,
  fireX: -3.8,
  fireW: 1.1,
  fireH: 0.85,
  mantelY: 1.12,
  /** The stone hearth slab in front of the firebox (flat, walkable). */
  stone: { x0: -4.9, x1: -2.7, z0: -5.4, z1: -4.8 } as Box,
  /** The rug the coffee table and Mochi's spot share, between the fire and the sofa. */
  rug: { x: -3.55, z: -3.7, rx: 1.85, rz: 1.25 },
  /** A woven basket of split logs beside the fire. */
  logBasket: { x: -5.6, z: -5.15, r: 0.3 },
  bookcaseL: { x0: -6.2, x1: -5.0, z0: -6.2, z1: -5.8, height: 2.3 },
  bookcaseR: { x0: -2.6, x1: -1.6, z0: -6.2, z1: -5.8, height: 2.3 },
};

/** The closed L-shaped corner sofa, snug in the back-left corner facing the hearth. */
export const SOFA = {
  /** The long run (facing the fire) and the return leg along the left wall. */
  run: { x0: -6.2, x1: -1.95, z0: -2.3, z1: -1.3 } as Box,
  leg: { x0: -6.2, x1: -5.2, z0: -4.55, z1: -2.3 } as Box,
  /** Seat cushion centres: three along the run, the corner cell, two down the return leg. */
  runXs: [-4.7, -3.7, -2.7],
  runZ: -1.8,
  corner: { x: -5.7, z: -1.8 },
  legZs: [-2.8, -3.8],
  legX: -5.7,
  seatH: 0.36,
  backH: 0.85,
  armH: 0.62,
};
export const COFFEE_TABLE = { x: -3.55, z: -3.8, radius: 0.5, height: 0.34 };

// --- the kitchen ---
export const KITCHEN = {
  /** The counter run along the back wall (waist-height), the fridge to its left. */
  counter: { x0: -0.6, x1: 6.2, z0: -6.2, z1: -5.4, height: 0.7 } as Box & { height: number },
  fridge: { x0: -1.5, x1: -0.6, z0: -6.2, z1: -5.3, height: 1.6 } as Box & { height: number },
  /** The window over the sink. */
  window: { x0: 0.6, x1: 2.3, y0: 1.2, y1: 2.4 },
  sinkX: 1.45,
  hobX: 4.6,
  /** Wall cabinets over the counter to the right of the window. */
  uppers: { x0: 2.9, x1: 6.2, y0: 1.55, y1: 2.35, depth: 0.38 },
  island: { x0: 0.6, x1: 3.4, z0: -3.7, z1: -2.7, height: 0.7 } as Box & { height: number },
  stoolXs: [1.1, 2.0, 2.9],
  stoolZ: -2.15,
  pendantXs: [1.3, 2.7],
  pendantZ: -3.2,
  pendantY: 2.0,
  mat: { x0: 2.3, x1: 4.7, z0: -5.3, z1: -4.2 } as Box,
  tile: { x0: -0.6, x1: 6.4, z0: -6.4, z1: -4.1 } as Box,
  bistro: { x: 5.25, z: -2.2, radius: 0.5, height: 0.58 },
  bistroChairZs: { north: -3.3, south: -1.1 },
};

// --- the left wall ---
export const READING = { chair: { x: -5.65, z: 0.1 }, box: { x0: -6.2, x1: -5.2, z0: -0.4, z1: 0.6 } as Box, lamp: { x: -5.85, z: 1.2 } };
export const CHAISE = { x: -5.7, z: 2.5, box: { x0: -6.15, x1: -5.25, z0: 1.6, z1: 3.5 } as Box };
export const SUN_PATCH = { x: -4.35, z: 1.3, rx: 0.95, rz: 0.75 };
/** Tall windows on the left wall (z ranges) and their height band. */
export const WINDOWS = [
  { z0: -0.9, z1: 0.9 },
  { z0: 1.5, z1: 3.3 },
  { z0: 3.9, z1: 5.5 },
] as const;
export const WINDOW_Y = { y0: 0.7, y1: 2.5 };

// --- the front ---
export const GAMES = { table: { x: -1.9, z: 4.1, radius: 0.6, height: 0.68 }, chairA: { x: -3.0, z: 4.1 }, chairB: { x: -0.8, z: 4.1 } };
/**
 * The board game's two seats ARE the games table's two chairs: seat 1 (white) the west chair,
 * seat 2 (black) the east one. One lock each: a seat is held by whoever sits on its chair (the
 * server's chair occupancy, ChairState.occupiedBy), so two players can never share one.
 */
export const BOARD_SEAT_CHAIRS: Readonly<Record<BoardSide, string>> = { w: "games_west", b: "games_east" };
/** The board seat a chair is, or "" for any other chair. */
export function boardSeatOfChair(chairId: string): BoardSide | "" {
  return chairId === BOARD_SEAT_CHAIRS.w ? "w" : chairId === BOARD_SEAT_CHAIRS.b ? "b" : "";
}
export const POUF_CIRCLE = {
  table: { x: 3.0, z: 2.5, radius: 0.5, height: 0.34 },
  rug: { x: 3.0, z: 2.5, r: 2.0 },
  /** Pouf centres, each facing the table. */
  poufs: [
    { x: 4.1, z: 2.5, heading: FACE_NEG_X },
    { x: 1.9, z: 2.5, heading: FACE_POS_X },
    { x: 3.0, z: 1.4, heading: FACE_POS_Z },
    { x: 3.0, z: 3.6, heading: FACE_NEG_Z },
  ],
  radius: 0.36,
};
export const PLANTS: (Pt & { kind: "fig" | "monstera" | "olive" })[] = [
  { x: -5.8, z: -0.9, kind: "fig" },
  { x: 5.75, z: -4.98, kind: "olive" }, // in the kitchen's railing corner: Chloe's corner stays open
  { x: -0.1, z: 5.7, kind: "monstera" },
  { x: 5.65, z: 0.9, kind: "fig" },
  { x: 5.65, z: 5.65, kind: "olive" },
];
/** Where you stand to water each plant (PLANTS, same order): just in front of its pot. */
export const PLANT_APPROACH: Pt[] = [
  { x: -4.95, z: -0.9 },
  { x: 4.95, z: -4.9 },
  { x: -0.1, z: 4.95 },
  { x: 4.85, z: 0.9 },
  { x: 4.85, z: 5.35 },
];
/** The retro radio on the green rug's low table, and where you stand to tune it (between two poufs). */
export const RADIO = { x: 3.0, z: 2.5, approach: { x: 3.8, z: 3.3 } };
/** The coffee machine on the kitchen counter, and where you stand to brew. */
export const COFFEE_MACHINE = { x: 2.6, z: -5.88, approach: { x: 2.6, z: -4.7 } };
/** How close the dock offers each of them: brew a drink, tune the radio, water a plant. */
export const KITCHEN_REACH = 1.8;
export const RADIO_REACH = 2.2;
export const PLANT_REACH = 1.6;
/** The Velvet Boutique by the left wall's front window: Chloe the cat maid, and her gilded cheval
 *  mirror angled to the room (chloe_maid.glb: scripts/blender/build_staff.py). Talking to either
 *  opens the wardrobe. */
export const BOUTIQUE = {
  chloe: { x: -5.45, z: 4.35, yaw: Math.PI / 3 },
  mirror: { x: -5.75, z: 5.4, yaw: FACE_POS_X - 0.3 },
  /** Where you stand to be served. */
  approach: { x: -4.5, z: 5.0 },
};
export const BOUTIQUE_REACH = 2.2;
export const FLOOR_LAMPS = [
  { propId: "lamp_read", ...READING.lamp, color: "#ffc47a" },
  { propId: "lamp_pouf", x: 5.4, z: 4.2, color: "#ffe0b2" },
];

// ---------------------------------------------------------------------------------------
// The shared tables
// ---------------------------------------------------------------------------------------

export interface SeatSpec {
  propId: string;
  x: number;
  z: number;
  /** The way the avatar faces: outward, away from the backrest. */
  rotationY: number;
  cushion: CushionId;
  /** Where you stand to sit, and where you land when you get up. */
  approachX: number;
  approachZ: number;
  /**
   * A long seat you can nap on: going AFK there, you lie down along it, your head resting at
   * `head` (just inside an arm, or against the chaise's bolster) and pointing `dir` along the
   * cushion. Seats without one (armchairs, stools, the sofa's corner cell) keep you sitting,
   * dozing where you are.
   */
  nap?: { head: Pt; dir: Pt };
}

// Napping on the sectional: along the run the head points to the free end's arm (+x), down the
// leg to its arm (-z), each head a quarter-cushion from its seat's centre toward that arm and
// forward of the back cushions (the throw pillows lean against them); on the chaise, toward the
// bolster at its head end.
const RUN_NAP_Z = SOFA.runZ - 0.28;
const LEG_NAP_X = SOFA.legX + 0.2;
/** Where you stand to sit on the run (and the corner), and on the leg: in front, clear of the coffee table. */
const RUN_APPROACH_Z = SOFA.run.z0 - 0.65;
const LEG_APPROACH_X = SOFA.leg.x1 + 0.7;

export const LOFT_SEATS: SeatSpec[] = [
  // the corner sofa, facing the hearth: three along the run, the corner cell, two down the return leg
  ...SOFA.runXs.map((x, i): SeatSpec => ({ propId: `sofa_run_${i + 1}`, x, z: SOFA.runZ, rotationY: FACE_NEG_Z, cushion: "sofa", approachX: x, approachZ: RUN_APPROACH_Z, nap: { head: { x: x + 0.25, z: RUN_NAP_Z }, dir: { x: 1, z: 0 } } })),
  { propId: "sofa_corner", x: SOFA.corner.x, z: SOFA.corner.z, rotationY: (3 * Math.PI) / 4, cushion: "sofa", approachX: SOFA.runXs[0], approachZ: RUN_APPROACH_Z },
  ...SOFA.legZs.map((z, i): SeatSpec => ({ propId: `sofa_leg_${i + 1}`, x: SOFA.legX, z, rotationY: FACE_POS_X, cushion: "sofa", approachX: LEG_APPROACH_X, approachZ: z, nap: { head: { x: LEG_NAP_X, z: z - 0.25 }, dir: { x: 0, z: -1 } } })),
  // the reading nook and the chaise, on the left wall
  { propId: "nook_wingback", x: READING.chair.x, z: READING.chair.z, rotationY: FACE_POS_X, cushion: "wingback", approachX: READING.box.x1 + 0.7, approachZ: READING.chair.z },
  { propId: "chaise", x: CHAISE.x, z: CHAISE.z, rotationY: FACE_POS_X, cushion: "chaise", approachX: CHAISE.box.x1 + 0.7, approachZ: CHAISE.z, nap: { head: { x: CHAISE.x + 0.08, z: CHAISE.z + 0.3 }, dir: { x: 0, z: 1 } } },
  // the island: three stools facing the counter
  ...KITCHEN.stoolXs.map((x, i): SeatSpec => ({ propId: `stool_${i + 1}`, x, z: KITCHEN.stoolZ, rotationY: FACE_NEG_Z, cushion: "stool", approachX: x, approachZ: KITCHEN.stoolZ + 0.95 })),
  // the bistro table: a chair each side
  { propId: "bistro_north", x: KITCHEN.bistro.x, z: KITCHEN.bistroChairZs.north, rotationY: FACE_POS_Z, cushion: "dining", approachX: KITCHEN.bistro.x, approachZ: KITCHEN.bistroChairZs.north - 0.9 },
  { propId: "bistro_south", x: KITCHEN.bistro.x, z: KITCHEN.bistroChairZs.south, rotationY: FACE_NEG_Z, cushion: "dining", approachX: KITCHEN.bistro.x, approachZ: KITCHEN.bistroChairZs.south + 0.9 },
  // the games table
  { propId: "games_west", x: GAMES.chairA.x, z: GAMES.chairA.z, rotationY: FACE_POS_X, cushion: "dining", approachX: GAMES.chairA.x, approachZ: GAMES.table.z + 1.1 },
  { propId: "games_east", x: GAMES.chairB.x, z: GAMES.chairB.z, rotationY: FACE_NEG_X, cushion: "dining", approachX: GAMES.chairB.x, approachZ: GAMES.table.z + 1.1 },
  // the pouf circle: each faces the low table, and you step in from outside the ring
  ...POUF_CIRCLE.poufs.map((p, i): SeatSpec => {
    const dx = p.x - POUF_CIRCLE.table.x;
    const dz = p.z - POUF_CIRCLE.table.z;
    const d = Math.hypot(dx, dz);
    return { propId: `pouf_${i + 1}`, x: p.x, z: p.z, rotationY: p.heading, cushion: "pouf", approachX: p.x + (dx / d) * 0.95, approachZ: p.z + (dz / d) * 0.95 };
  }),
];

export interface PropSpec {
  propId: string;
  x: number;
  y?: number;
  z: number;
  kind: "lamp" | "cat" | "boardgame" | "kitchen" | "radio" | "plant" | "bonfire" | "fishing" | "telescope" | "foraging" | "fireflies" | "critter" | "angler" | "lumberjack" | "workbench" | "boutique" | "archway" | "slingshot" | "splitblock" | "tree" | "ranger" | "animal" | RingPropKind | CasinoPropKind;
  color: string;
  defaultOn: boolean;
  approachX?: number;
  approachZ?: number;
  /** A potted plant players water once a day (shared/props.ts isWaterable). */
  waterable?: boolean;
}

/** Mochi's home: the hearth rug, beside the coffee table. */
const MOCHI_HEARTH = { x: -2.3, z: -4.4, ax: -2.3, az: -3.4 };

export const LOFT_PROPS: PropSpec[] = [
  // floor lamps stand BEHIND their seats, never in front of one
  ...FLOOR_LAMPS.map((l): PropSpec => ({ propId: l.propId, x: l.x, z: l.z, kind: "lamp", color: l.color, defaultOn: true })),
  // the games table on the pink rug: walk up to it (or sit at it) to play chess or checkers
  { propId: "board_table", x: GAMES.table.x, z: GAMES.table.z, kind: "boardgame", color: "#c98a80", defaultOn: true, approachX: GAMES.table.x, approachZ: GAMES.table.z + 1.0 },
  // the coffee machine on the counter (brew a drink), the radio on the green rug's low table (tune
  // it for the room), and the potted plants (water each once a day)
  { propId: "kitchen_brew", x: COFFEE_MACHINE.x, z: COFFEE_MACHINE.z, kind: "kitchen", color: "#c4714a", defaultOn: true, approachX: COFFEE_MACHINE.approach.x, approachZ: COFFEE_MACHINE.approach.z },
  { propId: "radio", x: RADIO.x, y: POUF_CIRCLE.table.height, z: RADIO.z, kind: "radio", color: "#9cc9b4", defaultOn: false, approachX: RADIO.approach.x, approachZ: RADIO.approach.z },
  ...PLANTS.map((p, i): PropSpec => ({ propId: `plant_${i + 1}`, x: p.x, z: p.z, kind: "plant", color: "#6d9a5e", defaultOn: true, approachX: PLANT_APPROACH[i].x, approachZ: PLANT_APPROACH[i].z, waterable: true })),
  // Mochi sleeps on the hearth rug and wanders from there (LOFT_MOCHI)
  { propId: "mochi", x: MOCHI_HEARTH.x, z: MOCHI_HEARTH.z, kind: "cat", color: "#f0a860", defaultOn: true, approachX: MOCHI_HEARTH.ax, approachZ: MOCHI_HEARTH.az },
  // the Velvet Boutique: Chloe and her mirror (either one opens the wardrobe)
  { propId: "boutique_chloe", x: BOUTIQUE.chloe.x, z: BOUTIQUE.chloe.z, kind: "boutique", color: "#b3263a", defaultOn: true, approachX: BOUTIQUE.approach.x, approachZ: BOUTIQUE.approach.z },
  { propId: "boutique_mirror", x: BOUTIQUE.mirror.x, z: BOUTIQUE.mirror.z, kind: "boutique", color: "#e0b44a", defaultOn: true, approachX: BOUTIQUE.approach.x, approachZ: BOUTIQUE.approach.z },
];

/** One stop on Mochi's day. `pass` stops are just corners on the way: she doesn't rest there. */
export interface MochiStop {
  x: number;
  z: number;
  /** A spot beside her a player can stand on. */
  ax: number;
  az: number;
  /** The way she settles: heading about y (0 = +z). Omitted, she faces the next stop. */
  face?: number;
  pass?: boolean;
}

/**
 * Mochi's day: the hearth rug (facing the fire), the sunlit window bay, the kitchen mat by the
 * hob, and home again. The sofa stands between the hearth and the windows, so each leg between
 * them is routed through `pass` corners past the sofa's free end: the validator samples every
 * straight leg against the colliders.
 */
const MOCHI_PAST_SOFA: MochiStop = { x: -1.2, z: -0.7, ax: -1.2, az: -0.7, pass: true };
export const LOFT_MOCHI: MochiStop[] = [
  { ...MOCHI_HEARTH, face: FACE_NEG_Z },
  { x: -1.2, z: -4.0, ax: -1.2, az: -4.0, pass: true },
  MOCHI_PAST_SOFA,
  { x: SUN_PATCH.x, z: SUN_PATCH.z, ax: -3.45, az: SUN_PATCH.z, face: FACE_NEG_X }, // the window bay, facing the glass
  MOCHI_PAST_SOFA,
  { x: -0.1, z: -4.6, ax: -0.1, az: -4.6, pass: true },
  { x: 3.4, z: -4.75, ax: 3.4, az: -4.25, face: FACE_NEG_Z }, // the kitchen mat, by the hob
];

const box = (b: Box): AABB => ({ minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 });
const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });

export const LOFT_OBSTACLES: AABB[] = [
  // the hearth, its shelves and the log basket
  box(HEARTH.breast),
  box(HEARTH.bookcaseL),
  box(HEARTH.bookcaseR),
  around(HEARTH.logBasket, HEARTH.logBasket.r),
  // the sectional (the seat cells on it are seats; the furniture itself is solid) and its table
  box(SOFA.run),
  box(SOFA.leg),
  around(COFFEE_TABLE, COFFEE_TABLE.radius),
  // the reading nook and the chaise
  box(READING.box),
  around(READING.lamp, 0.25),
  box(CHAISE.box),
  // the kitchen
  box(KITCHEN.counter),
  box(KITCHEN.fridge),
  box(KITCHEN.island),
  ...KITCHEN.stoolXs.map((x) => around({ x, z: KITCHEN.stoolZ }, 0.25)),
  around(KITCHEN.bistro, KITCHEN.bistro.radius),
  around({ x: KITCHEN.bistro.x, z: KITCHEN.bistroChairZs.north }, 0.28),
  around({ x: KITCHEN.bistro.x, z: KITCHEN.bistroChairZs.south }, 0.28),
  // the games table
  around(GAMES.table, GAMES.table.radius),
  around(GAMES.chairA, 0.28),
  around(GAMES.chairB, 0.28),
  // the pouf circle
  around(POUF_CIRCLE.table, POUF_CIRCLE.table.radius),
  ...POUF_CIRCLE.poufs.map((p) => around(p, POUF_CIRCLE.radius)),
  around({ x: FLOOR_LAMPS[1].x, z: FLOOR_LAMPS[1].z }, 0.25),
  // the plants
  ...PLANTS.map((p) => around(p, 0.32)),
  // the boutique: Chloe, and the mirror's feet
  around(BOUTIQUE.chloe, 0.3),
  around(BOUTIQUE.mirror, 0.38),
];

/** Everyone arrives in the middle of the loft (the centre first): the server places you here on
 *  every trip in (MAP_SPAWN_POINTS). */
export const LOFT_SPAWNS: Pt[] = [
  { x: -0.4, z: 0.8 },
  { x: 0.3, z: 1.6 },
  { x: -1.4, z: 1.7 },
  { x: 0.2, z: 0.2 },
  { x: -1.1, z: 0.2 },
];
