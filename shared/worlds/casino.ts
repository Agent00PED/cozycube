import type { AABB } from "../collision";
import type { SeatStyle } from "../types";
import type { PropSpec, SeatSpec } from "./lounge";

// The Velvet Casino: a mid-century Art-Deco hall on a 26x26 slab, run by and for dapper animals.
// Two tall back walls (x = -13 and z = -13, inner faces at -12.8), the front (+x and +z) open to
// the camera. Authored ONCE, here:
//
//   CASINO_LAYOUT     where everything is (plain JSON between the markers: scripts/blender/
//                     build_casino.py reads the very same text to build casino.glb, so the model
//                     and the walkable floor can never disagree)
//   CASINO_SEATS      stools, chairs, the ottoman and the piano bench
//   CASINO_PROPS      the slot row, Mr. Vance's cage window, the exit doors
//   CASINO_OBSTACLES  what you walk round;  CASINO_SPAWNS  where you arrive (inside the doors)
//   CASINO_NPCS       where the staff and regulars stand (Mr. Vance in 1a; the rest in 1b)
//
// The zones, as the camera sees them (the camera looks from +x +z, so the tall things stand along
// the back walls and only low ones out front):
//
//   back-right   1 THE GRAND FOYER: marble; the exit doors in the back wall, flanked by palms;
//                a round tufted ottoman under a chandelier; Mr. Vance's golden cashier cage in
//                the corner by the front edge, a raised teller's platform behind its counter (`floor`)
//                so he stands at the window with his paws on the counter
//   centre       2 THE MAIN GAMING FLOOR: burgundy velvet carpet; the roulette table (Madame
//                Vivienne at the wheel) and two half-moon blackjack tables to its right
//   left wall    3 NEON ALLEY: a row of six vintage slot machines against the wall, Jasper at a
//                seventh of his own
//   back corner  4 THE HIGH-ROLLER PIT: behind a velvet rope (open at its corner), a mahogany
//                poker table, Boris dealing from the wall side
//   front-left   5 THE VELVET LOUNGE & JAZZ BAR: the bar along the wall (Pippin behind it, on a
//                duckboard step, `floor`) with five stools, two cocktail tables, and a grand piano
//                by the front edge
//
// The floor is flat everywhere (the pit is set apart by its carpet and rope, not raised), so
// nobody's walking height changes. Proportions follow the ~1.3-unit avatar and the Loft: the bar
// counter 0.72 with 0.48 stools, the card tables 0.74 (blackjack, stools) and 0.68 (poker, chairs).
//
// Coordinates are the game's: x right, z toward the camera's side, heights in y; headings about y
// with 0 facing +z (so pi/2 faces +x).

export const CASINO_LAYOUT = /* layout:begin */ {
  "half": 13,
  "walls": { "t": 0.2, "h": 4.2 },
  "zones": [
    { "id": "floor", "name": "Main Gaming Floor", "x0": -13, "x1": 13, "z0": -13, "z1": 13, "floor": "carpet" },
    { "id": "foyer", "name": "Grand Foyer", "x0": 1.2, "x1": 13, "z0": -13, "z1": -5.2, "floor": "marble" },
    { "id": "alley", "name": "Neon Alley", "x0": -13, "x1": -9.6, "z0": -5.6, "z1": 3.2, "floor": "neon" },
    { "id": "pit", "name": "High-Roller Pit", "x0": -13, "x1": -6.2, "z0": -13, "z1": -6.2, "floor": "pit" },
    { "id": "lounge", "name": "Velvet Lounge", "x0": -13, "x1": -3.4, "z0": 3.2, "z1": 13, "floor": "lounge" }
  ],
  "doors": { "x": 4.5, "w": 2.4, "h": 2.9 },
  "palms": [{ "x": 2.3, "z": -12.1 }, { "x": 6.7, "z": -12.1 }],
  "ottoman": { "x": 4.5, "z": -7.6, "r": 0.95, "seatR": 0.8 },
  "cage": { "x0": 7.6, "x1": 13, "z0": -13, "z1": -10.4, "window": 10.2, "counter": 1.05, "h": 2.6, "floor": 0.55 },
  "roulette": { "x": 1.0, "z": 0.5, "len": 3.2, "w": 1.5, "top": 0.78, "wheel": -1.15, "reach": 3.4 },
  "blackjack": {
    "tables": [{ "x": 7.6, "z": -1.2 }, { "x": 7.6, "z": 5.2 }],
    "r": 1.1,
    "top": 0.74,
    "stoolR": 1.55,
    "stoolAngles": [-60, -20, 20, 60],
    "reach": 2.4
  },
  "slots": { "x": -12.25, "zs": [-4.8, -3.6, -2.4, -1.2, 0.0, 1.2], "jasper": 2.4, "w": 0.9, "d": 0.8, "h": 1.75 },
  "poker": {
    "x": -9.6,
    "z": -9.6,
    "len": 2.8,
    "w": 1.6,
    "top": 0.68,
    "chairs": [
      { "x": -10.6, "z": -8.35, "yaw": 3.1416 },
      { "x": -9.6, "z": -8.35, "yaw": 3.1416 },
      { "x": -8.6, "z": -8.35, "yaw": 3.1416 },
      { "x": -11.45, "z": -9.6, "yaw": 1.5708 },
      { "x": -7.75, "z": -9.6, "yaw": -1.5708 }
    ]
  },
  "ropes": [
    { "a": [-6.2, -12.8], "b": [-6.2, -7.6] },
    { "a": [-12.8, -6.2], "b": [-7.6, -6.2] }
  ],
  "bar": { "x0": -13, "x1": -10.4, "z0": 3.8, "z1": 10.0, "top": 0.72, "floor": 0.3, "stoolX": -9.9, "stools": [4.6, 5.8, 7.0, 8.2, 9.4] },
  "cocktails": [{ "x": -11.0, "z": 11.6 }, { "x": -7.6, "z": 11.6 }],
  "piano": { "x": -4.6, "z": 10.9, "len": 1.5, "w": 1.45, "top": 1.0, "bench": 9.75 },
  "planters": [{ "x": 12.1, "z": 12.1 }, { "x": 12.1, "z": -4.4 }, { "x": -2.4, "z": 12.1 }],
  "chandeliers": [[1.0, 3.5, 0.5], [7.6, 3.5, 2.0], [4.5, 3.7, -7.6], [-9.6, 3.3, -9.6]],
  "sconces": { "y": 2.3, "onBackZ": [-11.0, -8.0, -3.5, 0.0, 2.3, 6.7], "onBackX": [-11.0, -8.0, -5.8, -1.8, 3.3, 10.6, 12.0] },
  "npcs": {
    "vance": { "x": 9.75, "z": -11.15, "yaw": 0 },
    "boris": { "x": -9.6, "z": -10.75, "yaw": 0 },
    "vivienne": { "x": -1.05, "z": 0.5, "yaw": 1.5708 },
    "jasper": { "x": -11.45, "z": 2.4, "yaw": -1.5708 },
    "pippin": { "x": -11.35, "z": 6.9, "yaw": 1.5708 }
  },
  "spawns": [
    { "x": 4.5, "z": -10.5 },
    { "x": 3.4, "z": -10.0 },
    { "x": 5.6, "z": -10.0 },
    { "x": 2.4, "z": -9.3 },
    { "x": 6.6, "z": -9.3 }
  ]
} /* layout:end */;

const L = CASINO_LAYOUT;
type Pt = { x: number; z: number };

export const CASINO_HALF = L.half;
/** The camera fits the slab with a margin, like the lounge (LOFT_FRAME). */
export const CASINO_FRAME = { x: 0, z: 0, size: L.half * 2 + 0.8 };

const DEG = Math.PI / 180;
const FACE_POS_Z = 0;
const FACE_POS_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;
/** The heading that faces from (x, z) toward `to` (heading 0 faces +z). */
const facing = (x: number, z: number, to: Pt) => Math.atan2(to.x - x, to.z - z);
const unit = (x: number, z: number) => {
  const d = Math.hypot(x, z) || 1;
  return { x: x / d, z: z / d };
};

// --- the zones ------------------------------------------------------------------------------

export type CasinoZoneId = "floor" | "foyer" | "alley" | "pit" | "lounge";
export type CasinoZone = { id: CasinoZoneId; name: string; x0: number; x1: number; z0: number; z1: number; floor: string };
/** The five zones, in paint order: the main floor's carpet is the whole slab, the others lie on it. */
export const CASINO_ZONES = L.zones as readonly CasinoZone[];
/** The zone at (x, z): the topmost one there. */
export function casinoZoneAt(x: number, z: number): CasinoZone {
  for (let i = CASINO_ZONES.length - 1; i > 0; i--) {
    const zone = CASINO_ZONES[i];
    if (x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1) return zone;
  }
  return CASINO_ZONES[0];
}

// --- the staff and the regulars -----------------------------------------------------------------

export type CasinoNpcId = keyof typeof L.npcs;
/** Who stands where (scripts/blender/build_vance.py and build_casino_staff.py pose each one at
 *  their spot: paws on the counter or the felt, Jasper on the stool at his own machine). `phase`:
 *  the build that brought them (1a: Mr. Vance; 1b: the other four). Mr. Vance stands a little left
 *  of his window's middle: the camera looks down along (1, 1, 1), so the line from his face to it
 *  crosses the bars about 0.5 further along +x, in the window's middle. */
export const CASINO_NPCS: Record<CasinoNpcId, { x: number; z: number; yaw: number; name: string; role: string; phase: "1a" | "1b" }> = {
  vance: { ...L.npcs.vance, name: "Mr. Vance", role: "the fox cashier at the Golden Cage", phase: "1a" },
  boris: { ...L.npcs.boris, name: "Boris", role: "the polar bear dealer in the High-Roller Pit", phase: "1b" },
  vivienne: { ...L.npcs.vivienne, name: "Madame Vivienne", role: "the poodle croupier at the roulette wheel", phase: "1b" },
  jasper: { ...L.npcs.jasper, name: "Jasper", role: "the tuxedo cat at his favourite slot", phase: "1b" },
  pippin: { ...L.npcs.pippin, name: "Pippin", role: "the penguin mixologist behind the bar", phase: "1b" },
};

// --- the games' tables ------------------------------------------------------------------------

/** The roulette table's middle, and how close you must stand to it to bet (and see the panel). */
export const ROULETTE_CENTER = { x: L.roulette.x, z: L.roulette.z };
export const ROULETTE_BET_RADIUS = L.roulette.reach;

/** The half-moon blackjack tables: the dealer's flat side toward the back wall (-z), the players'
 *  curve toward the camera. You play within `reach` of one's middle. */
export const BLACKJACK_TABLES = L.blackjack.tables.map((t, i) => ({ id: `blackjack_0${i + 1}`, x: t.x, z: t.z, r: L.blackjack.r, reach: L.blackjack.reach }));
/** The blackjack table within reach of (x, z) (plus `slack`: the server allows a little more than
 *  the client shows, for lag), if any. */
export function blackjackTableNear(x: number, z: number, slack = 0) {
  return BLACKJACK_TABLES.find((t) => Math.hypot(x - t.x, z - t.z) < t.reach + slack);
}

/** Neon Alley's slot machines against the left wall, facing +x; you play standing at the front. */
export const SLOT_MACHINES = L.slots.zs.map((z, i) => ({ propId: `slot_0${i + 1}`, x: L.slots.x, z, approachX: L.slots.x + L.slots.d / 2 + 0.85, approachZ: z }));

// --- Mr. Vance's cage and the exit doors --------------------------------------------------------

/** Where you stand at the cage's window to trade coins and chips, and how close to that spot is
 *  close enough (Mr. Vance stands behind the counter, out of reach of a hand). */
export const CASHIER_FRONT = { x: L.cage.window, z: L.cage.z1 + 0.7 };
export const CASHIER_REACH = 1.8;
/** The exit doors in the back wall (the portal home), and where you stand to use them. */
export const EXIT_DOORS = { x: L.doors.x, z: -L.half + 0.45 };
export const EXIT_FRONT = { x: L.doors.x, z: -L.half + 1.65 };

// --- seats ------------------------------------------------------------------------------------

/** A casino seat: every one is drawn by casino.glb, so `style` only sets the pose and the pad. */
export type CasinoSeat = SeatSpec & { style: SeatStyle };

const BAR_STOOL_APPROACH = 0.85;
const OTTOMAN_ANGLES = [45, 135, 225, 315];

export const CASINO_SEATS: CasinoSeat[] = [
  // the blackjack tables: four stools round each curve, facing the dealer; you step up from behind
  ...BLACKJACK_TABLES.flatMap((t, ti) =>
    L.blackjack.stoolAngles.map((deg, k): CasinoSeat => {
      const out = { x: Math.sin(deg * DEG), z: Math.cos(deg * DEG) };
      const x = t.x + out.x * L.blackjack.stoolR;
      const z = t.z + out.z * L.blackjack.stoolR;
      return { propId: `seat_bj${ti + 1}_${k + 1}`, x, z, rotationY: facing(x, z, t), cushion: "barStool", style: "stool", approachX: x + out.x * 0.8, approachZ: z + out.z * 0.8 };
    })
  ),
  // the High-Roller Pit's poker table: its chairs, each stepped into from behind
  ...L.poker.chairs.map((c, i): CasinoSeat => {
    const out = unit(c.x - L.poker.x, c.z - L.poker.z);
    return { propId: `seat_poker_${i + 1}`, x: c.x, z: c.z, rotationY: c.yaw, cushion: "pokerChair", style: "armchair", approachX: c.x + out.x * 0.85, approachZ: c.z + out.z * 0.85 };
  }),
  // the bar: stools along the counter, facing Pippin
  ...L.bar.stools.map((z, i): CasinoSeat => ({ propId: `seat_bar_${i + 1}`, x: L.bar.stoolX, z, rotationY: FACE_NEG_X, cushion: "barStool", style: "stool", approachX: L.bar.stoolX + BAR_STOOL_APPROACH, approachZ: z })),
  // the lounge's cocktail tables: a club chair either side, facing across; step in from the bar's side
  ...L.cocktails.flatMap((t, ti) =>
    ([-1, 1] as const).map((side, k): CasinoSeat => ({ propId: `seat_club_${ti * 2 + k + 1}`, x: t.x + side * 0.85, z: t.z, rotationY: side < 0 ? FACE_POS_X : FACE_NEG_X, cushion: "clubChair", style: "armchair", approachX: t.x + side * 0.85, approachZ: t.z - 0.85 }))
  ),
  // the grand piano's bench: facing the keys (the piano's back side is toward the camera)
  { propId: "seat_piano", x: L.piano.x, z: L.piano.bench, rotationY: FACE_POS_Z, cushion: "pianoBench", style: "pad", approachX: L.piano.x, approachZ: L.piano.bench - 0.85 },
  // the foyer's round ottoman: four seats round its rim, facing out (its collider is square, so
  // the diagonal approaches stand well clear of the box's corners)
  ...OTTOMAN_ANGLES.map((deg, i): CasinoSeat => {
    const out = { x: Math.cos(deg * DEG), z: Math.sin(deg * DEG) };
    const o = L.ottoman;
    const x = o.x + out.x * o.seatR;
    const z = o.z + out.z * o.seatR;
    return { propId: `seat_ottoman_${i + 1}`, x, z, rotationY: Math.atan2(out.x, out.z), cushion: "ottoman", style: "pad", approachX: o.x + out.x * (o.r + 0.95), approachZ: o.z + out.z * (o.r + 0.95) };
  }),
];

// --- props ------------------------------------------------------------------------------------

export const CASINO_PROPS: PropSpec[] = [
  // Neon Alley: spin a slot machine (chips)
  ...SLOT_MACHINES.map((s): PropSpec => ({ propId: s.propId, x: s.x, z: s.z, kind: "slot", color: "#ff4fa3", defaultOn: true, approachX: s.approachX, approachZ: s.approachZ })),
  // Mr. Vance at the cage window: buy chips with coins, cash chips back into coins
  { propId: "cashier_cage_window", x: CASINO_NPCS.vance.x, z: CASINO_NPCS.vance.z, kind: "cashier", color: "#e0b04a", defaultOn: true, approachX: CASHIER_FRONT.x, approachZ: CASHIER_FRONT.z },
  // the exit doors: back to the Lounge (or anywhere, through the world drawer)
  { propId: "casino_exit", x: EXIT_DOORS.x, z: EXIT_DOORS.z, kind: "portal", color: "#d4a93c", defaultOn: true, approachX: EXIT_FRONT.x, approachZ: EXIT_FRONT.z },
];

// --- what you walk round ----------------------------------------------------------------------

type Box = { x0: number; x1: number; z0: number; z1: number };
const box = (b: Box): AABB => ({ minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 });
const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });

/** A velvet rope between brass stanchions: a thin box along it (axis-aligned ropes only). */
function ropeBox(a: number[], b: number[]): AABB {
  const R = 0.08;
  return { minX: Math.min(a[0], b[0]) - R, maxX: Math.max(a[0], b[0]) + R, minZ: Math.min(a[1], b[1]) - R, maxZ: Math.max(a[1], b[1]) + R };
}

const seatBox = (propIdPrefix: string, r: number) => CASINO_SEATS.filter((s) => s.propId.startsWith(propIdPrefix)).map((s) => around(s, r));

export const CASINO_OBSTACLES: AABB[] = [
  // 1 the foyer: the palms flanking the doors, the ottoman (its seats within its box, as a sofa's
  // are), and Mr. Vance's cage (him inside it)
  ...L.palms.map((p) => around(p, 0.45)),
  around(L.ottoman, L.ottoman.r),
  box(L.cage),
  // 2 the main floor: the roulette table and Madame Vivienne at its wheel; the blackjack tables
  // (from just behind the dealer's flat edge to the rim of the curve) and their stools
  box({ x0: L.roulette.x - L.roulette.len / 2, x1: L.roulette.x + L.roulette.len / 2, z0: L.roulette.z - L.roulette.w / 2, z1: L.roulette.z + L.roulette.w / 2 }),
  around(L.npcs.vivienne, 0.32),
  ...BLACKJACK_TABLES.map((t) => box({ x0: t.x - t.r, x1: t.x + t.r, z0: t.z - 0.15, z1: t.z + t.r })),
  ...seatBox("seat_bj", 0.22),
  // 3 Neon Alley: the whole row of cabinets against the wall (Jasper's too), and Jasper
  box({ x0: -L.half, x1: L.slots.x + L.slots.d / 2, z0: L.slots.zs[0] - L.slots.w / 2, z1: L.slots.jasper + L.slots.w / 2 }),
  around(L.npcs.jasper, 0.3),
  // 4 the pit: its ropes, the poker table, Boris behind it, and the chairs round it
  ...L.ropes.map((r) => ropeBox(r.a, r.b)),
  box({ x0: L.poker.x - L.poker.len / 2, x1: L.poker.x + L.poker.len / 2, z0: L.poker.z - L.poker.w / 2, z1: L.poker.z + L.poker.w / 2 }),
  around(L.npcs.boris, 0.36),
  ...seatBox("seat_poker", 0.25),
  // 5 the lounge: the bar and the back bar behind it (Pippin inside), its stools, the cocktail
  // tables and their club chairs, the grand piano and its bench
  box(L.bar),
  ...seatBox("seat_bar", 0.22),
  ...L.cocktails.map((t) => around(t, 0.3)),
  ...seatBox("seat_club", 0.3),
  box({ x0: L.piano.x - L.piano.len / 2, x1: L.piano.x + L.piano.len / 2, z0: L.piano.z - L.piano.w / 2, z1: L.piano.z + L.piano.w / 2 }),
  box({ x0: L.piano.x - 0.45, x1: L.piano.x + 0.45, z0: L.piano.bench - 0.18, z1: L.piano.bench + 0.18 }),
  // the planters out front
  ...L.planters.map((p) => around(p, 0.4)),
];

export const CASINO_SPAWNS: Pt[] = L.spawns;
