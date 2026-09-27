import type { AABB } from "../collision";
import type { CushionId } from "../seats";
import type { BoardSide, CasinoPropKind } from "../types";

// The Loft: the cozy lounge's whole floor plan, authored once.
//
// The server, the layout validator, the seat anchors and the client scene ALL read this file:
// LoungeWorld.tsx draws exactly these numbers, collision.ts turns them into obstacles and props.ts
// turns them into seats. Move a piece of furniture here and the picture, the collider and the
// seat anchor move together.
//
// An intimate 15x15 penthouse. Two solid back walls (x = -7.5 and z = -7.5, inner faces at
// -7.3), the front (+X and +Z) open to the camera behind a low balustrade. Avatars walk
// within +-NAV_LIMIT of the centre, and never through furniture.
//
// Proportions follow the ~1.3-unit avatar: counters 0.7 (its waist), seats 0.36, stools 0.48,
// bistro and games tables 0.58 / 0.68, the mantel 1.1.
//
// Zones, as the camera sees them (x runs right-and-down, z left-and-down):
//   back-left    THE HEARTH: brick chimney breast in the back wall with the firebox, flanked by
//                built-in shelves, Mochi's hearth mat and the log basket in front of it
//   centre       THE SUNKEN LIVING NOOK: a conversation pit a step down (NOOK) in the middle of
//                the loft, the L-shaped sectional's backs along its back and left edges, facing
//                the room over a round coffee table on the big wool rug (everyone arrives here)
//   left wall    the reading nook (wingback, floor lamp), the chaise, three tall windows
//   back-right   THE KITCHEN: counter run on the back wall, an island with three stools under
//                two pendants, a bistro table for two
//   front-left   the games table (two chairs)
//   front-right  the pouf circle round a low table, a floor lamp, plants
//   front-left   by the last window, the Velvet Boutique: Chloe the cat maid beside her gilded
//                cheval mirror (she opens the wardrobe)
//
// Walkways: 1.9 between the counter and the island, 2.2 between the island and the bistro
// table, 2.1 between the nook and the reading nook and chaise, 1.6 between the nook and the games
// table, 1.0 or more everywhere else: the entry, Chloe's corner, the kitchen counter and the chess
// nook all join round the pit's rim, and nothing is narrower than the avatar (0.6) needs.

type Box = { x0: number; x1: number; z0: number; z1: number };
type Pt = { x: number; z: number };

const FACE_NEG_Z = Math.PI; // heading 0 is +z; a heading of pi faces the back wall
const FACE_POS_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;
const FACE_POS_Z = 0;

export const LOFT_HALF = 7.5;
/** The walls' thickness: their inner faces stand at +-(LOFT_HALF - WALL_T). */
export const WALL_T = 0.2;
export const WALL_HEIGHT = 3.2;
/** Avatars are kept within this of the centre on both axes. */
export const NAV_LIMIT = 7.0;
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
  breast: { x0: -6.0, x1: -3.4, z0: -7.3, z1: -6.5 } as Box,
  fireX: -4.7,
  fireW: 1.1,
  fireH: 0.85,
  mantelY: 1.12,
  /** The stone hearth slab in front of the firebox (flat, walkable). */
  stone: { x0: -5.9, x1: -3.5, z0: -6.5, z1: -5.9 } as Box,
  /** Mochi's hearth mat, in front of the fire. */
  rug: { x: -4.7, z: -5.2, rx: 1.35, rz: 0.7 },
  /** A woven basket of split logs beside the fire. */
  logBasket: { x: -6.55, z: -6.2, r: 0.3 },
  bookcaseL: { x0: -7.3, x1: -6.0, z0: -7.3, z1: -6.9, height: 2.3 },
  bookcaseR: { x0: -3.4, x1: -2.3, z0: -7.3, z1: -6.9, height: 2.3 },
};

/**
 * The Sunken Living Nook: a conversation pit in the middle of the loft, `depth` below the floor.
 * The sectional's backs run along its back (z0) and left (x0) edges; its front and right edges are
 * open, a single step down all along. Everything in it (the sofa, the coffee table, the rug) stands
 * on the pit's floor; walking in, you go down the step (loungeFloorY).
 */
export const NOOK = {
  pit: { x0: -4.2, x1: 0.8, z0: -2.4, z1: 1.6 } as Box,
  depth: 0.15,
  /** The big wool rug on the pit's floor, under the coffee table and the sofa's front. */
  rug: { x: -1.6, z: -0.5, rx: 2.1, rz: 1.8 },
};

/** The floor's height at (x, z): the loft's floor, or the nook's pit a step down. */
export function loungeFloorY(x: number, z: number): number {
  const p = NOOK.pit;
  return x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1 ? -NOOK.depth : 0;
}

/** The closed L-shaped sectional in the nook: its backs on the pit's back and left edges, facing the room. */
export const SOFA = {
  /** The long run along the pit's back edge (facing +z) and the return leg down its left edge (facing +x). */
  run: { x0: -4.2, x1: 0.05, z0: -2.4, z1: -1.4 } as Box,
  leg: { x0: -4.2, x1: -3.2, z0: -1.4, z1: 0.85 } as Box,
  /** Seat cushion centres: three along the run, the corner cell, two down the return leg. */
  runXs: [-2.7, -1.7, -0.7],
  runZ: -1.9,
  corner: { x: -3.7, z: -1.9 },
  legZs: [-0.9, 0.1],
  legX: -3.7,
  seatH: 0.36,
  backH: 0.85,
  armH: 0.62,
};
export const COFFEE_TABLE = { x: -1.35, z: 0.15, radius: 0.5, height: 0.34 };

// --- the kitchen ---
export const KITCHEN = {
  /** The counter run along the back wall (waist-height), the fridge to its left. */
  counter: { x0: -1.3, x1: 7.3, z0: -7.3, z1: -6.5, height: 0.7 } as Box & { height: number },
  fridge: { x0: -2.2, x1: -1.3, z0: -7.3, z1: -6.4, height: 1.6 } as Box & { height: number },
  /** The window over the sink. */
  window: { x0: 0.2, x1: 1.9, y0: 1.2, y1: 2.4 },
  sinkX: 1.05,
  hobX: 5.2,
  /** Wall cabinets over the counter to the right of the window. */
  uppers: { x0: 2.5, x1: 7.3, y0: 1.55, y1: 2.35, depth: 0.38 },
  island: { x0: 0.4, x1: 3.2, z0: -4.6, z1: -3.6, height: 0.7 } as Box & { height: number },
  stoolXs: [0.9, 1.8, 2.7],
  stoolZ: -3.05,
  pendantXs: [1.1, 2.5],
  pendantZ: -4.1,
  pendantY: 2.0,
  mat: { x0: 2.2, x1: 4.8, z0: -6.2, z1: -5.0 } as Box,
  tile: { x0: -1.3, x1: 7.5, z0: -7.5, z1: -4.9 } as Box,
  bistro: { x: 6.4, z: -2.6, radius: 0.5, height: 0.58 },
  bistroChairZs: { north: -3.7, south: -1.5 },
};

// --- the left wall ---
export const READING = { chair: { x: -6.75, z: -0.4 }, box: { x0: -7.3, x1: -6.3, z0: -0.9, z1: 0.1 } as Box, lamp: { x: -6.9, z: 1.2 } };
export const CHAISE = { x: -6.8, z: 2.9, box: { x0: -7.25, x1: -6.35, z0: 2.0, z1: 3.9 } as Box };
export const SUN_PATCH = { x: -5.3, z: 1.1, rx: 0.95, rz: 0.75 };
/** Tall windows on the left wall (z ranges) and their height band. */
export const WINDOWS = [
  { z0: -1.6, z1: 0.4 },
  { z0: 1.0, z1: 3.0 },
  { z0: 3.7, z1: 5.7 },
] as const;
export const WINDOW_Y = { y0: 0.7, y1: 2.5 };

// --- the front ---
export const GAMES = { table: { x: -3.6, z: 4.6, radius: 0.6, height: 0.68 }, chairA: { x: -4.7, z: 4.6 }, chairB: { x: -2.5, z: 4.6 } };
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
  table: { x: 3.2, z: 2.6, radius: 0.5, height: 0.34 },
  rug: { x: 3.2, z: 2.6, r: 2.0 },
  /** Pouf centres, each facing the table. */
  poufs: [
    { x: 4.3, z: 2.6, heading: FACE_NEG_X },
    { x: 2.1, z: 2.6, heading: FACE_POS_X },
    { x: 3.2, z: 1.5, heading: FACE_POS_Z },
    { x: 3.2, z: 3.7, heading: FACE_NEG_Z },
  ],
  radius: 0.36,
};
export const PLANTS: (Pt & { kind: "fig" | "monstera" | "olive" })[] = [
  { x: -6.8, z: -1.5, kind: "fig" },
  { x: -6.9, z: 6.3, kind: "olive" },
  { x: -2.5, z: 6.6, kind: "monstera" },
  { x: 6.8, z: 0.8, kind: "fig" },
  { x: 6.7, z: 6.4, kind: "olive" },
];
/** Where you stand to water each plant (PLANTS, same order): just in front of its pot. */
export const PLANT_APPROACH: Pt[] = [
  { x: -6.0, z: -1.5 },
  { x: -6.1, z: 6.0 },
  { x: -2.5, z: 5.9 },
  { x: 6.0, z: 0.8 },
  { x: 6.0, z: 6.0 },
];
/** The retro radio on the green rug's low table, and where you stand to tune it (between two poufs). */
export const RADIO = { x: 3.2, z: 2.6, approach: { x: 4.0, z: 3.4 } };
/** The coffee machine on the kitchen counter, and where you stand to brew. */
export const COFFEE_MACHINE = { x: 2.25, z: -6.98, approach: { x: 2.25, z: -5.9 } };
/** How close the dock offers each of them: brew a drink, tune the radio, water a plant. */
export const KITCHEN_REACH = 1.8;
export const RADIO_REACH = 2.2;
export const PLANT_REACH = 1.6;
/** The Velvet Boutique by the left wall's front window: Chloe the cat maid, and her gilded cheval
 *  mirror angled to the room (chloe_maid.glb: scripts/blender/build_staff.py). Talking to either
 *  opens the wardrobe. */
export const BOUTIQUE = {
  chloe: { x: -6.5, z: 4.25, yaw: Math.PI / 3 },
  mirror: { x: -6.8, z: 5.3, yaw: FACE_POS_X - 0.3 },
  /** Where you stand to be served. */
  approach: { x: -5.55, z: 4.95 },
};
export const BOUTIQUE_REACH = 2.2;
export const FLOOR_LAMPS = [
  { propId: "lamp_read", ...READING.lamp, color: "#ffc47a" },
  { propId: "lamp_pouf", x: 6.4, z: 4.2, color: "#ffe0b2" },
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
  /** The floor under the seat, when it is not the loft's (the nook's pit: -NOOK.depth). */
  floor?: number;
  /**
   * A long seat you can nap on: going AFK there, you lie down along it, your head resting at
   * `head` (just inside an arm, or against the chaise's bolster) and pointing `dir` along the
   * cushion. Seats without one (armchairs, stools, the sofa's corner cell) keep you sitting,
   * dozing where you are.
   */
  nap?: { head: Pt; dir: Pt };
}

// Napping on the sectional: along the run the head points to the free end's arm (+x), down the
// leg to its arm (+z), each head a quarter-cushion from its seat's centre toward that arm and
// forward of the back cushions (the throw pillows lean against them); on the chaise, toward the
// bolster at its head end.
const RUN_NAP_Z = SOFA.runZ + 0.28;
const LEG_NAP_X = SOFA.legX + 0.2;
/** Where you stand to sit on the run (and the corner), and on the leg: on the pit's floor, clear of the coffee table. */
const RUN_APPROACH_Z = -0.75;
const LEG_APPROACH_X = -2.55;
const PIT = -NOOK.depth;

export const LOFT_SEATS: SeatSpec[] = [
  // the sectional in the nook, facing the room: three along the run, the corner cell, two down the return leg
  ...SOFA.runXs.map((x, i): SeatSpec => ({ propId: `sofa_run_${i + 1}`, x, z: SOFA.runZ, rotationY: FACE_POS_Z, cushion: "sofa", approachX: x, approachZ: RUN_APPROACH_Z, floor: PIT, nap: { head: { x: x + 0.25, z: RUN_NAP_Z }, dir: { x: 1, z: 0 } } })),
  { propId: "sofa_corner", x: SOFA.corner.x, z: SOFA.corner.z, rotationY: Math.PI / 4, cushion: "sofa", approachX: SOFA.corner.x + 0.95, approachZ: RUN_APPROACH_Z, floor: PIT },
  ...SOFA.legZs.map((z, i): SeatSpec => ({ propId: `sofa_leg_${i + 1}`, x: SOFA.legX, z, rotationY: FACE_POS_X, cushion: "sofa", approachX: LEG_APPROACH_X, approachZ: z, floor: PIT, nap: { head: { x: LEG_NAP_X, z: z + 0.25 }, dir: { x: 0, z: 1 } } })),
  // the reading nook and the chaise, on the left wall
  { propId: "nook_wingback", x: READING.chair.x, z: READING.chair.z, rotationY: FACE_POS_X, cushion: "wingback", approachX: -5.6, approachZ: READING.chair.z },
  { propId: "chaise", x: CHAISE.x, z: CHAISE.z, rotationY: FACE_POS_X, cushion: "chaise", approachX: -5.6, approachZ: CHAISE.z, nap: { head: { x: CHAISE.x + 0.08, z: CHAISE.z + 0.3 }, dir: { x: 0, z: 1 } } },
  // the island: three stools facing the counter
  ...KITCHEN.stoolXs.map((x, i): SeatSpec => ({ propId: `stool_${i + 1}`, x, z: KITCHEN.stoolZ, rotationY: FACE_NEG_Z, cushion: "stool", approachX: x, approachZ: -2.1 })),
  // the bistro table: a chair each side
  { propId: "bistro_north", x: KITCHEN.bistro.x, z: KITCHEN.bistroChairZs.north, rotationY: FACE_POS_Z, cushion: "dining", approachX: KITCHEN.bistro.x, approachZ: -4.6 },
  { propId: "bistro_south", x: KITCHEN.bistro.x, z: KITCHEN.bistroChairZs.south, rotationY: FACE_NEG_Z, cushion: "dining", approachX: KITCHEN.bistro.x, approachZ: -0.5 },
  // the games table
  { propId: "games_west", x: GAMES.chairA.x, z: GAMES.chairA.z, rotationY: FACE_POS_X, cushion: "dining", approachX: GAMES.chairA.x, approachZ: 5.7 },
  { propId: "games_east", x: GAMES.chairB.x, z: GAMES.chairB.z, rotationY: FACE_NEG_X, cushion: "dining", approachX: GAMES.chairB.x, approachZ: 5.7 },
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
  kind: "lamp" | "cat" | "boardgame" | "kitchen" | "radio" | "plant" | "bonfire" | "fishing" | "telescope" | "woodchop" | "foraging" | "fireflies" | "critter" | "angler" | "lumberjack" | "workbench" | "boutique" | CasinoPropKind;
  color: string;
  defaultOn: boolean;
  approachX?: number;
  approachZ?: number;
  /** A potted plant players water once a day (shared/props.ts isWaterable). */
  waterable?: boolean;
}

/** Mochi's home: her mat by the hearth. */
const MOCHI_HEARTH = { x: -3.7, z: -5.8, ax: -3.7, az: -4.9 };

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
  // Mochi sleeps on her hearth mat and wanders from there (LOFT_MOCHI)
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
 * Mochi's day: her hearth mat (facing the fire), the sunlit window bay, the kitchen mat by the
 * hob, and home again. She keeps to the loft's floor, round the nook's rim (never down in the pit),
 * so each leg is routed through `pass` corners behind the sofa and along the left wall: the
 * validator samples every straight leg against the colliders.
 */
const MOCHI_BEHIND_SOFA: MochiStop = { x: -5.0, z: -3.0, ax: -5.0, az: -3.0, pass: true };
export const LOFT_MOCHI: MochiStop[] = [
  { ...MOCHI_HEARTH, face: FACE_NEG_Z },
  MOCHI_BEHIND_SOFA,
  { x: SUN_PATCH.x, z: SUN_PATCH.z, ax: -4.6, az: SUN_PATCH.z, face: FACE_NEG_X }, // the window bay, facing the glass
  MOCHI_BEHIND_SOFA,
  { x: -0.6, z: -3.2, ax: -0.6, az: -3.2, pass: true },
  { x: -0.3, z: -5.2, ax: -0.3, az: -5.2, pass: true },
  { x: 3.4, z: -5.6, ax: 3.4, az: -5.05, face: FACE_NEG_Z }, // the kitchen mat, by the hob
];

const box = (b: Box): AABB => ({ minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 });
const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });

export const LOFT_OBSTACLES: AABB[] = [
  // the hearth, its shelves and the log basket
  box(HEARTH.breast),
  box(HEARTH.bookcaseL),
  box(HEARTH.bookcaseR),
  around(HEARTH.logBasket, HEARTH.logBasket.r),
  // the sectional in the nook (the seat cells on it are seats; the furniture itself is solid) and its table
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

/** Everyone arrives on the nook's rug in the middle of the loft (the centre first), on the pit's
 *  floor: the server places you here on every trip in (MAP_SPAWN_POINTS). */
export const LOFT_SPAWNS: Pt[] = [
  { x: 0, z: 0 },
  { x: 0.3, z: 0.95 },
  { x: -0.85, z: 1.15 },
  { x: 0.45, z: -0.7 },
  { x: -0.2, z: -0.95 },
];
