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
//   casinoFloorY      how high the floor is anywhere: the raised High-Roller Pit and Velvet Lounge,
//                     and the steps up to them (the game stands avatars, seats and staff on it)
//   CASINO_SEATS      stools, chairs, the ottoman, the piano bench, the Chesterfield
//   CASINO_PROPS      everything you walk up to and use (the tables, the slots, the cage, the
//                     doors, Madame Zara, the capsule machine, the tip jars, the bar, the piano...)
//   CASINO_OBSTACLES  what you walk round;  CASINO_SPAWNS  where you arrive (inside the doors)
//   CASINO_NPCS       where the staff and regulars stand;  PATRON_SPOTS  where the crowd wanders
//
// The zones, as the camera sees them (the camera looks from +x +z, so the tall things stand along
// the back walls, and what stands on the floor stays low: the pillars are torch columns, not
// ceiling posts, and there is no ceiling to hang anything from):
//
//   back-right   1 THE GRAND FOYER: marble; the exit doors in the back wall, flanked by palms; a
//                round tufted ottoman under a chandelier; Madame Zara's fortune booth and the
//                capsule machine by the main floor; Mr. Vance's Golden Cage in the corner (a
//                raised teller's platform behind its counter, `cage.floor`)
//   centre       2 THE MAIN GAMING FLOOR: burgundy velvet carpet; the roulette table (Madame
//                Vivienne at the wheel, her tip jar on the rail) in a gold sunburst; three
//                half-moon blackjack tables in a crescent round a pit boss's podium; the craps
//                table between the roulette and Neon Alley
//   left wall    3 NEON ALLEY: six vintage slot machines against the wall (Jasper at a seventh of
//                his own), the Turf Club derby table and a coin pusher in front of them
//   back corner  4 THE HIGH-ROLLER PIT: raised 0.35 behind a velvet rope, two brass steps up at its
//                open corner; the mahogany poker table (Boris dealing, his tip jar at his elbow);
//                the locked VIP room's doors in the wall, Bruno the bulldog bouncer beside them
//   front-left   5 THE VELVET LOUNGE & JAZZ BAR: a dais raised 0.25, two steps up all along its open
//                sides; the bar along the wall (Pippin behind it on a duckboard, `bar.floor`) with
//                five stools, a billiards table under its brass lamp, a Chesterfield nook with The
//                Velvet Gazette on its coffee table, two cocktail tables, and the baby grand
//
// Four fluted torch columns mark the corners where the foyer, the floor, the alley and the lounge
// meet; brass divider strips run where one floor meets another; paintings of the house's ancestors,
// sunburst mirrors and the Big-Win marquee hang on the walls' upper spans.
//
// Coordinates are the game's: x right, z toward the camera's side, heights in y; headings about y
// with 0 facing +z (so pi/2 faces +x).

export const CASINO_LAYOUT = /* layout:begin */ {
  "half": 13,
  "walls": { "t": 0.2, "h": 4.2 },
  "zones": [
    { "id": "floor", "name": "Main Gaming Floor", "x0": -13, "x1": 13, "z0": -13, "z1": 13, "floor": "carpet" },
    { "id": "foyer", "name": "Grand Foyer", "x0": 1.2, "x1": 13, "z0": -13, "z1": -5.2, "floor": "marble" },
    { "id": "alley", "name": "Neon Alley", "x0": -13, "x1": -8.2, "z0": -5.6, "z1": 3.2, "floor": "neon" },
    { "id": "pit", "name": "High-Roller Pit", "x0": -13, "x1": -6.2, "z0": -13, "z1": -6.2, "floor": "pit" },
    { "id": "lounge", "name": "Velvet Lounge", "x0": -13, "x1": -3.4, "z0": 3.2, "z1": 13, "floor": "lounge" }
  ],
  "stages": [
    { "id": "pit", "x0": -13, "x1": -6.2, "z0": -13, "z1": -6.2, "h": 0.35, "depth": 0.7, "count": 2, "open": [{ "edge": "x1", "from": -7.6, "to": -6.2 }, { "edge": "z1", "from": -7.6, "to": -6.2 }] },
    { "id": "lounge", "x0": -13, "x1": -4.0, "z0": 3.8, "z1": 13, "h": 0.25, "depth": 0.6, "count": 2, "open": [{ "edge": "x1", "from": 3.8, "to": 13 }, { "edge": "z0", "from": -13, "to": -4.0 }] }
  ],
  "doors": { "x": 4.5, "w": 2.4, "h": 2.9 },
  "palms": [{ "x": 2.3, "z": -12.1 }, { "x": 6.7, "z": -12.1 }],
  "ottoman": { "x": 4.5, "z": -7.6, "r": 0.95, "seatR": 0.8 },
  "cage": { "x0": 7.6, "x1": 13, "z0": -13, "z1": -10.4, "window": 10.2, "counter": 1.05, "h": 2.6, "floor": 0.55 },
  "zara": { "x": 2.0, "z": -6.4, "w": 1.1, "d": 0.9, "h": 2.35, "yaw": 0.7854 },
  "gachapon": { "x": 8.4, "z": -6.1, "r": 0.34, "h": 1.5 },
  "roulette": { "x": 1.0, "z": 0.5, "len": 3.2, "w": 1.5, "top": 0.78, "wheel": -1.15, "reach": 3.4 },
  "blackjack": {
    "centre": [11.4, 2.3],
    "radius": 4.6,
    "angles": [-50, 0, 50],
    "r": 1.1,
    "top": 0.74,
    "stoolR": 1.55,
    "stoolAngles": [-60, -20, 20, 60],
    "reach": 2.4,
    "podium": 0.32
  },
  "craps": { "x": -5.0, "z": 0.3, "len": 3.4, "w": 1.7, "top": 0.88, "felt": 0.66 },
  "slots": { "x": -12.25, "zs": [-4.8, -3.6, -2.4, -1.2, 0.0, 1.2], "jasper": 2.4, "w": 0.9, "d": 0.8, "h": 1.75 },
  "derby": { "x": -9.1, "z": -2.2, "len": 2.4, "w": 1.0, "top": 0.9 },
  "pusher": { "x": -8.95, "z": 1.5, "w": 0.9, "d": 0.8, "h": 1.8 },
  "pillars": { "at": [[1.2, -5.2], [-8.2, -5.6], [-8.2, 2.9], [-3.1, 2.9]], "r": 0.26, "h": 2.6 },
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
    { "a": [-6.32, -12.8], "b": [-6.32, -7.6] },
    { "a": [-12.8, -6.32], "b": [-7.6, -6.32] }
  ],
  "vipDoor": { "z": -8.3, "w": 1.4, "h": 2.5 },
  "tipJars": { "boris": [-8.55, -9.95], "vivienne": [-0.3, 1.1] },
  "bar": { "x0": -13, "x1": -10.4, "z0": 3.8, "z1": 10.0, "top": 0.72, "floor": 0.3, "stoolX": -9.9, "stools": [4.6, 5.8, 7.0, 8.2, 9.4] },
  "billiards": { "x": -6.4, "z": 5.6, "len": 2.5, "w": 1.4, "top": 0.8, "lamp": 2.0 },
  "sofa": { "x": -4.75, "z": 7.4, "len": 2.0, "seats": [6.8, 7.4, 8.0] },
  "coffee": { "x": -6.25, "z": 7.4, "w": 0.6, "len": 1.0, "top": 0.45 },
  "cocktails": [{ "x": -11.0, "z": 11.6 }, { "x": -7.6, "z": 11.6 }],
  "piano": { "x": -5.0, "z": 10.9, "len": 1.5, "w": 1.45, "top": 1.0, "bench": 9.75 },
  "planters": [{ "x": 12.1, "z": 12.1 }, { "x": 12.1, "z": -4.4 }, { "x": -2.4, "z": 12.1 }],
  "chandeliers": [[1.0, 3.5, 0.5], [8.4, 3.5, 2.3], [4.5, 3.7, -7.6], [-9.6, 3.6, -9.6]],
  "sconces": { "y": 2.3, "onBackZ": [-11.0, -8.0, -3.5, 0.0, 2.3, 6.7], "onBackX": [-11.0, -5.8, -1.8, 3.3, 10.6, 12.0] },
  "marquee": { "x": -0.3, "y": 3.1, "w": 2.3, "h": 0.8 },
  "paintings": [
    { "wall": "z", "at": -11.0, "y": 3.05, "subject": "fox" },
    { "wall": "z", "at": -8.0, "y": 3.05, "subject": "bear" },
    { "wall": "z", "at": 2.3, "y": 3.05, "subject": "owl" },
    { "wall": "z", "at": 12.0, "y": 3.35, "subject": "poodle" },
    { "wall": "x", "at": -11.0, "y": 3.05, "subject": "cat" }
  ],
  "mirrors": [{ "wall": "z", "at": -3.5, "y": 3.15 }, { "wall": "x", "at": 12.1, "y": 3.15 }],
  "npcs": {
    "vance": { "x": 9.75, "z": -11.15, "yaw": 0 },
    "boris": { "x": -9.6, "z": -10.75, "yaw": 0 },
    "vivienne": { "x": -1.05, "z": 0.5, "yaw": 1.5708 },
    "jasper": { "x": -11.45, "z": 2.4, "yaw": -1.5708 },
    "pippin": { "x": -11.35, "z": 6.9, "yaw": 1.5708 },
    "bruno": { "x": -12.1, "z": -7.1, "yaw": 1.5708 }
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
const heading = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

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

// --- the raised stages and their steps --------------------------------------------------------
//
// A stage is a rectangle raised `h`, with steps (`count` treads, `depth` deep in all) down from the
// runs of its edges listed in `open`; its other edges meet a wall or a velvet rope, so nobody walks
// off them. Its `count + 1` risers are equal (h / (count + 1) each), so the treads stand at
// h * count / (count + 1) (the one against the stage) down to h / (count + 1): feet land on a
// tread, and the avatar's height eases from one to the next as it climbs. build_casino.py builds
// the very same stages and steps from this.

export interface Stage {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  depth: number;
  count: number;
  open: { edge: "x0" | "x1" | "z0" | "z1"; from: number; to: number }[];
}
export const CASINO_STAGES = L.stages as readonly Stage[];

const within = (v: number, a: number, b: number) => v >= Math.min(a, b) - 1e-6 && v <= Math.max(a, b) + 1e-6;

/** How high one stage (or its steps) raises the floor at (x, z): 0 off it. */
function stageY(s: Stage, x: number, z: number): number {
  if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s.h;
  const cx = Math.max(s.x0, Math.min(s.x1, x));
  const cz = Math.max(s.z0, Math.min(s.z1, z));
  const dx = Math.abs(x - cx);
  const dz = Math.abs(z - cz);
  const d = Math.max(dx, dz);
  if (d > s.depth) return 0;
  // the edge (or the two, at a corner) this point stands off: every one must be an open run
  const edges: { edge: Stage["open"][number]["edge"]; along: number }[] = [];
  if (x > s.x1) edges.push({ edge: "x1", along: cz });
  if (x < s.x0) edges.push({ edge: "x0", along: cz });
  if (z > s.z1) edges.push({ edge: "z1", along: cx });
  if (z < s.z0) edges.push({ edge: "z0", along: cx });
  if (!edges.every((e) => s.open.some((o) => o.edge === e.edge && within(e.along, o.from, o.to)))) return 0;
  // which tread (0: the one against the stage)
  const k = Math.min(s.count - 1, Math.floor((d / s.depth) * s.count));
  return (s.h * (s.count - k)) / (s.count + 1);
}

/** The floor's height at (x, z): the stages, their steps, or the hall's floor (0). */
export function casinoFloorY(x: number, z: number): number {
  let y = 0;
  for (const s of CASINO_STAGES) y = Math.max(y, stageY(s, x, z));
  return y;
}

const stage = (id: string) => CASINO_STAGES.find((s) => s.id === id)!;
/** The top of the pit and of the lounge's dais. */
export const PIT_Y = stage("pit").h;
export const LOUNGE_Y = stage("lounge").h;

// --- the staff and the regulars -----------------------------------------------------------------

export type CasinoNpcId = keyof typeof L.npcs;
/** Who stands where (scripts/blender/build_vance.py and build_casino_staff.py pose each one at
 *  their spot: paws on the counter or the felt, Jasper on the stool at his own machine), and how
 *  high (the floor under them, and Mr. Vance's and Pippin's platforms). `phase`: the build that
 *  brought them. Mr. Vance stands a little left of his window's middle: the camera looks down along
 *  (1, 1, 1), so the line from his face to it crosses the bars about 0.5 further along +x, in the
 *  window's middle. */
export const CASINO_NPCS: Record<CasinoNpcId, { x: number; z: number; yaw: number; y: number; name: string; role: string; phase: "1a" | "1b" | "2" }> = {
  vance: { ...L.npcs.vance, y: L.cage.floor, name: "Mr. Vance", role: "the fox cashier at the Golden Cage", phase: "1a" },
  boris: { ...L.npcs.boris, y: PIT_Y, name: "Boris", role: "the polar bear dealer in the High-Roller Pit", phase: "1b" },
  vivienne: { ...L.npcs.vivienne, y: 0, name: "Madame Vivienne", role: "the poodle croupier at the roulette wheel", phase: "1b" },
  jasper: { ...L.npcs.jasper, y: 0, name: "Jasper", role: "the tuxedo cat at his favourite slot", phase: "1b" },
  pippin: { ...L.npcs.pippin, y: LOUNGE_Y + L.bar.floor, name: "Pippin", role: "the penguin mixologist behind the bar", phase: "1b" },
  bruno: { ...L.npcs.bruno, y: PIT_Y, name: "Bruno", role: "the bulldog bouncer at the VIP room's doors", phase: "2" },
};

// --- the games' tables ------------------------------------------------------------------------

/** The roulette table's middle, and how close you must stand to it to bet. */
export const ROULETTE_CENTER = { x: L.roulette.x, z: L.roulette.z };
export const ROULETTE_BET_RADIUS = L.roulette.reach;

/** The half-moon blackjack tables, in a crescent round the pit boss's podium (`centre`): each
 *  one's flat dealer side toward the podium, its players' curve out toward the room (`yaw`: the
 *  way the curve faces). You play within `reach` of one's middle. */
export const BLACKJACK_TABLES = L.blackjack.angles.map((deg, i) => {
  const [cx, cz] = L.blackjack.centre;
  const a = deg * DEG;
  const out = { x: -Math.cos(a), z: Math.sin(a) };
  return { id: `blackjack_0${i + 1}`, x: cx + out.x * L.blackjack.radius, z: cz + out.z * L.blackjack.radius, yaw: Math.atan2(out.x, out.z), r: L.blackjack.r, reach: L.blackjack.reach };
});
/** The nearest blackjack table within reach of (x, z) (plus `slack`: the server allows a little
 *  more than the client shows, for lag), if any. The crescent's reaches overlap between tables: the
 *  nearer one is yours. */
export function blackjackTableNear(x: number, z: number, slack = 0) {
  let best: (typeof BLACKJACK_TABLES)[number] | undefined;
  let bestD = Infinity;
  for (const t of BLACKJACK_TABLES) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < t.reach + slack && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}
/** Where you stand to walk up to a blackjack table: out from the middle of its curve. */
const blackjackFront = (t: (typeof BLACKJACK_TABLES)[number]) => {
  const d = heading(t.yaw);
  return { x: t.x + d.x * (L.blackjack.stoolR + 0.6), z: t.z + d.z * (L.blackjack.stoolR + 0.6) };
};

/** Neon Alley's slot machines against the left wall, facing +x; you play standing at the front. */
export const SLOT_MACHINES = L.slots.zs.map((z, i) => ({ propId: `slot_0${i + 1}`, x: L.slots.x, z, approachX: L.slots.x + L.slots.d / 2 + 0.85, approachZ: z }));

// --- Mr. Vance's cage, the exit doors, the foyer's machines -------------------------------------

/** Where you stand at the cage's window to trade coins and chips, and how close to that spot is
 *  close enough (Mr. Vance stands behind the counter, out of reach of a hand). */
export const CASHIER_FRONT = { x: L.cage.window, z: L.cage.z1 + 0.7 };
export const CASHIER_REACH = 1.8;
/** The exit doors in the back wall (the portal home), and where you stand to use them. */
export const EXIT_DOORS = { x: L.doors.x, z: -L.half + 0.45 };
export const EXIT_FRONT = { x: L.doors.x, z: -L.half + 1.65 };
/** Madame Zara's booth (turned to face the camera's way, so her cabinet's inside shows) and the
 *  capsule machine: where you stand. */
export const ZARA_FRONT = { x: L.zara.x + Math.sin(L.zara.yaw) * 1.44, z: L.zara.z + Math.cos(L.zara.yaw) * 1.44 };
export const GACHAPON_FRONT = { x: L.gachapon.x, z: L.gachapon.z + L.gachapon.r + 0.6 };
/** Close enough to a machine or a jar to use it (the server allows a little more, for lag). */
export const MACHINE_REACH = 1.6;
/** Close enough to read The Velvet Gazette (from the Chesterfield too), and to play the baby grand
 *  (from its bench too). */
export const GAZETTE_REACH = 2.0;
export const PIANO_REACH = 2.0;

/** The dealers' tip jars, on their tables' rails (y: the jar's foot), and where you stand to tip. */
export const TIP_JARS = {
  boris: { x: L.tipJars.boris[0], z: L.tipJars.boris[1], y: PIT_Y + L.poker.top, front: { x: -7.3, z: -10.3 } },
  vivienne: { x: L.tipJars.vivienne[0], z: L.tipJars.vivienne[1], y: L.roulette.top, front: { x: -0.3, z: 1.95 } },
} as const;
export type TipDealer = keyof typeof TIP_JARS;

/** The bar's counter front (Pippin takes orders across it): where you stand, and how near to it. */
export const BAR_FRONT = { x: L.bar.stoolX + 0.85, z: 6.4 };
export const BAR_REACH = 2.2;
/** Distance from (x, z) to the bar counter's front edge. */
export function barDistance(x: number, z: number): number {
  const fx = L.bar.x1;
  const cz = Math.max(L.bar.z0, Math.min(L.bar.z1, z));
  return Math.hypot(Math.max(0, x - fx), z - cz);
}

// --- seats ------------------------------------------------------------------------------------

/** A casino seat: every one is drawn by casino.glb, so `style` only sets the pose and the pad;
 *  `floor` is the floor under it (a seat on a stage sits that much higher). */
export type CasinoSeat = SeatSpec & { style: SeatStyle; floor: number };

const BAR_STOOL_APPROACH = 0.85;
const OTTOMAN_ANGLES = [45, 135, 225, 315];
const onFloor = (s: Omit<CasinoSeat, "floor">): CasinoSeat => ({ ...s, floor: casinoFloorY(s.x, s.z) });

export const CASINO_SEATS: CasinoSeat[] = [
  // the blackjack tables: four stools round each curve, facing the dealer; you step up from behind
  ...BLACKJACK_TABLES.flatMap((t, ti) =>
    L.blackjack.stoolAngles.map((deg, k): CasinoSeat => {
      const out = heading(t.yaw + deg * DEG);
      const x = t.x + out.x * L.blackjack.stoolR;
      const z = t.z + out.z * L.blackjack.stoolR;
      return onFloor({ propId: `seat_bj${ti + 1}_${k + 1}`, x, z, rotationY: facing(x, z, t), cushion: "barStool", style: "stool", approachX: x + out.x * 0.8, approachZ: z + out.z * 0.8 });
    })
  ),
  // the High-Roller Pit's poker table: its chairs, each stepped into from behind
  ...L.poker.chairs.map((c, i): CasinoSeat => {
    const out = unit(c.x - L.poker.x, c.z - L.poker.z);
    return onFloor({ propId: `seat_poker_${i + 1}`, x: c.x, z: c.z, rotationY: c.yaw, cushion: "pokerChair", style: "armchair", approachX: c.x + out.x * 0.85, approachZ: c.z + out.z * 0.85 });
  }),
  // the bar: stools along the counter, facing Pippin
  ...L.bar.stools.map((z, i): CasinoSeat => onFloor({ propId: `seat_bar_${i + 1}`, x: L.bar.stoolX, z, rotationY: FACE_NEG_X, cushion: "barStool", style: "stool", approachX: L.bar.stoolX + BAR_STOOL_APPROACH, approachZ: z })),
  // the lounge's cocktail tables: a club chair either side, facing across; step in from the bar's side
  ...L.cocktails.flatMap((t, ti) =>
    ([-1, 1] as const).map((side, k): CasinoSeat => onFloor({ propId: `seat_club_${ti * 2 + k + 1}`, x: t.x + side * 0.85, z: t.z, rotationY: side < 0 ? FACE_POS_X : FACE_NEG_X, cushion: "clubChair", style: "armchair", approachX: t.x + side * 0.85, approachZ: t.z - 0.85 }))
  ),
  // the Chesterfield: three places along it, facing the coffee table (and the billiards beyond)
  ...L.sofa.seats.map((z, i): CasinoSeat => onFloor({ propId: `seat_sofa_${i + 1}`, x: L.sofa.x, z, rotationY: FACE_NEG_X, cushion: "chesterfield", style: "armchair", approachX: L.sofa.x - 0.75, approachZ: z })),
  // the grand piano's bench: facing the keys (the piano's back side is toward the camera)
  onFloor({ propId: "seat_piano", x: L.piano.x, z: L.piano.bench, rotationY: FACE_POS_Z, cushion: "pianoBench", style: "pad", approachX: L.piano.x, approachZ: L.piano.bench - 0.85 }),
  // the foyer's round ottoman: four seats round its rim, facing out (its collider is square, so
  // the diagonal approaches stand well clear of the box's corners)
  ...OTTOMAN_ANGLES.map((deg, i): CasinoSeat => {
    const out = { x: Math.cos(deg * DEG), z: Math.sin(deg * DEG) };
    const o = L.ottoman;
    const x = o.x + out.x * o.seatR;
    const z = o.z + out.z * o.seatR;
    return onFloor({ propId: `seat_ottoman_${i + 1}`, x, z, rotationY: Math.atan2(out.x, out.z), cushion: "ottoman", style: "pad", approachX: o.x + out.x * (o.r + 0.95), approachZ: o.z + out.z * (o.r + 0.95) });
  }),
];

// --- props ------------------------------------------------------------------------------------

const prop = (propId: string, at: Pt, kind: PropSpec["kind"], color: string, front: Pt, y?: number): PropSpec => ({ propId, x: at.x, z: at.z, y: y ?? casinoFloorY(at.x, at.z), kind, color, defaultOn: true, approachX: front.x, approachZ: front.z });

export const CASINO_PROPS: PropSpec[] = [
  // Neon Alley: spin a slot machine (chips)
  ...SLOT_MACHINES.map((s): PropSpec => prop(s.propId, s, "slot", "#ff4fa3", { x: s.approachX, z: s.approachZ })),
  // the tables: walking up to one (or clicking it) opens its board; nothing ever opens by itself
  prop("roulette_table", ROULETTE_CENTER, "roulette", "#1f6b45", { x: L.roulette.x, z: L.roulette.z + L.roulette.w / 2 + 0.95 }),
  ...BLACKJACK_TABLES.map((t): PropSpec => prop(t.id, t, "blackjack", "#1f6b45", blackjackFront(t))),
  // the dice, the Turf Club, the coin pusher and the billiards: set dressing with a word for a click
  prop("craps_table", L.craps, "craps", "#1f6b45", { x: L.craps.x, z: L.craps.z + L.craps.w / 2 + 0.75 }),
  prop("derby_table", L.derby, "derby", "#2f6b3f", { x: L.derby.x + L.derby.w / 2 + 0.7, z: L.derby.z }),
  prop("coin_pusher", L.pusher, "pusher", "#ffd98a", { x: L.pusher.x + L.pusher.d / 2 + 0.7, z: L.pusher.z }),
  prop("billiards_table", L.billiards, "billiards", "#1f6b45", { x: L.billiards.x, z: L.billiards.z - L.billiards.w / 2 - 0.65 }),
  // The Velvet Gazette on the coffee table, and the baby grand's keys
  prop("velvet_gazette", L.coffee, "gazette", "#f2e8d5", { x: L.sofa.x - 0.75, z: L.coffee.z }, LOUNGE_Y + L.coffee.top),
  prop("piano_keys", { x: L.piano.x, z: L.piano.z - L.piano.w / 2 }, "piano", "#161214", { x: L.piano.x, z: L.piano.bench - 0.85 }),
  // Mr. Vance at the cage window: buy chips with coins, cash chips back into coins
  prop("cashier_cage_window", CASINO_NPCS.vance, "cashier", "#e0b04a", CASHIER_FRONT, 0),
  // Madame Zara's fortunes, and the capsule machine
  prop("zara_booth", L.zara, "fortune", "#7a4fd1", ZARA_FRONT),
  prop("capsule_machine", L.gachapon, "gachapon", "#d4a93c", GACHAPON_FRONT),
  // the dealers' tip jars
  prop("tipjar_boris", TIP_JARS.boris, "tipjar", "#d4a93c", TIP_JARS.boris.front, TIP_JARS.boris.y),
  prop("tipjar_vivienne", TIP_JARS.vivienne, "tipjar", "#d4a93c", TIP_JARS.vivienne.front, TIP_JARS.vivienne.y),
  // Pippin's bar menu, ordered across the counter
  prop("bar_menu", CASINO_NPCS.pippin, "barmenu", "#7a1e2e", BAR_FRONT, CASINO_NPCS.pippin.y),
  // the VIP room's doors (locked: Bruno sees to it)
  prop("vip_door", { x: -L.half + L.walls.t + 0.1, z: L.vipDoor.z }, "vipdoor", "#7a1e2e", { x: -11.6, z: L.vipDoor.z }),
  // the exit doors: back to the Lounge (or anywhere, through the world drawer)
  prop("casino_exit", EXIT_DOORS, "portal", "#d4a93c", EXIT_FRONT, 0),
];

// --- where the crowd wanders (client-side only: entities/AmbientPatrons.tsx) ----------------------

/** The spots the ambient patrons drift between: watching the slots, at the bar, round the roulette
 *  and the craps table; they come in and leave by the doors. None is anyone's seat or approach. */
export const PATRON_SPOTS = {
  doors: EXIT_FRONT,
  slots: [-4.2, -3.0, -1.8, -0.6, 0.6].map((z) => ({ x: -10.15, z })),
  bar: [5.2, 6.4, 7.6, 8.8].map((z) => ({ x: -9.2, z })),
  roulette: [150, 115, 80, 45, 10, -25].map((deg) => ({ x: L.roulette.x + Math.cos(deg * DEG) * 2.35, z: L.roulette.z + Math.sin(deg * DEG) * 1.95 })),
  craps: [{ x: -6.2, z: 1.9 }, { x: -3.9, z: 1.9 }, { x: -2.7, z: 0.3 }],
  lounge: [{ x: -7.8, z: 4.35 }, { x: -5.0, z: 4.35 }, { x: -8.2, z: 6.9 }],
};

// --- what you walk round ----------------------------------------------------------------------

type Box = { x0: number; x1: number; z0: number; z1: number };
const box = (b: Box): AABB => ({ minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 });
const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
const centred = (c: Pt, hx: number, hz: number): AABB => ({ minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz });

/** A velvet rope between brass stanchions: a thin box along it (axis-aligned ropes only). */
function ropeBox(a: number[], b: number[]): AABB {
  const R = 0.08;
  return { minX: Math.min(a[0], b[0]) - R, maxX: Math.max(a[0], b[0]) + R, minZ: Math.min(a[1], b[1]) - R, maxZ: Math.max(a[1], b[1]) + R };
}

/** A turned half-moon table: small boxes over its half disc (a box round it would be far too big
 *  once it is turned). */
function halfMoonBoxes(t: (typeof BLACKJACK_TABLES)[number]): AABB[] {
  const out: AABB[] = [around({ x: t.x + Math.sin(t.yaw) * 0.25, z: t.z + Math.cos(t.yaw) * 0.25 }, 0.5)];
  for (let k = -2; k <= 2; k++) {
    const d = heading(t.yaw + k * 40 * DEG);
    out.push(around({ x: t.x + d.x * 0.72, z: t.z + d.z * 0.72 }, 0.4));
  }
  return out;
}

/** The pit's steps have brass cheeks where they meet the ropes: you go up the steps, not their ends. */
function stepCheeks(s: Stage): AABB[] {
  const out: AABB[] = [];
  const R = 0.08;
  for (const o of s.open) {
    const lo = Math.min(o.from, o.to);
    if (o.edge === "x1" && lo > s.z0) out.push({ minX: s.x1, maxX: s.x1 + s.depth, minZ: lo - R, maxZ: lo + R });
    if (o.edge === "z1" && lo > s.x0) out.push({ minX: lo - R, maxX: lo + R, minZ: s.z1, maxZ: s.z1 + s.depth });
  }
  return out;
}

const seatBox = (propIdPrefix: string, r: number) => CASINO_SEATS.filter((s) => s.propId.startsWith(propIdPrefix)).map((s) => around(s, r));

export const CASINO_OBSTACLES: AABB[] = [
  // 1 the foyer: the palms flanking the doors, the ottoman (its seats within its box, as a sofa's
  // are), Mr. Vance's cage (him inside it), Madame Zara's booth and the capsule machine
  ...L.palms.map((p) => around(p, 0.45)),
  around(L.ottoman, L.ottoman.r),
  box(L.cage),
  around(L.zara, 0.62),
  around(L.gachapon, L.gachapon.r),
  // the torch columns at the zones' corners
  ...L.pillars.at.map(([x, z]) => around({ x, z }, L.pillars.r)),
  // 2 the main floor: the roulette table and Madame Vivienne at its wheel; the blackjack crescent,
  // its stools and the pit boss's podium; the craps table
  centred(L.roulette, L.roulette.len / 2, L.roulette.w / 2),
  around(L.npcs.vivienne, 0.32),
  ...BLACKJACK_TABLES.flatMap(halfMoonBoxes),
  ...seatBox("seat_bj", 0.22),
  around({ x: L.blackjack.centre[0], z: L.blackjack.centre[1] }, L.blackjack.podium),
  centred(L.craps, L.craps.len / 2, L.craps.w / 2),
  // 3 Neon Alley: the whole row of cabinets against the wall (Jasper's too), Jasper on his stool,
  // the derby table and the coin pusher
  box({ x0: -L.half, x1: L.slots.x + L.slots.d / 2, z0: L.slots.zs[0] - L.slots.w / 2, z1: L.slots.jasper + L.slots.w / 2 }),
  around(L.npcs.jasper, 0.3),
  centred(L.derby, L.derby.w / 2, L.derby.len / 2),
  centred(L.pusher, L.pusher.d / 2, L.pusher.w / 2),
  // 4 the pit: its ropes and the steps' cheeks, the poker table, Boris behind it, the chairs round
  // it, Bruno at the VIP doors
  ...L.ropes.map((r) => ropeBox(r.a, r.b)),
  ...stepCheeks(stage("pit")),
  centred(L.poker, L.poker.len / 2, L.poker.w / 2),
  around(L.npcs.boris, 0.36),
  ...seatBox("seat_poker", 0.25),
  around(L.npcs.bruno, 0.36),
  // 5 the lounge: the bar and the back bar behind it (Pippin inside), its stools, the billiards
  // table, the Chesterfield and its coffee table, the cocktail tables and their club chairs, the
  // grand piano and its bench
  box(L.bar),
  ...seatBox("seat_bar", 0.22),
  centred(L.billiards, L.billiards.len / 2, L.billiards.w / 2),
  centred({ x: L.sofa.x + 0.05, z: L.sofa.z }, 0.4, L.sofa.len / 2 + 0.05),
  centred(L.coffee, L.coffee.w / 2, L.coffee.len / 2),
  ...L.cocktails.map((t) => around(t, 0.3)),
  ...seatBox("seat_club", 0.3),
  centred(L.piano, L.piano.len / 2, L.piano.w / 2),
  box({ x0: L.piano.x - 0.45, x1: L.piano.x + 0.45, z0: L.piano.bench - 0.18, z1: L.piano.bench + 0.18 }),
  // the planters out front
  ...L.planters.map((p) => around(p, 0.4)),
];

export const CASINO_SPAWNS: Pt[] = L.spawns;
