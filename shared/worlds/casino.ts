import type { AABB } from "../collision";
import type { SeatStyle } from "../types";
import type { PropSpec, SeatSpec } from "./lounge";
import { VIP_OBSTACLES, VIP_POKER, VIP_BACCARAT, VIP_PROPS, VIP_REGION, VIP_SEATS } from "./casino_vip";

// The Velvet Casino: a compact mid-century Art-Deco hall on a 20x20 slab, run by and for dapper
// animals. Two tall back walls (x = -10 and z = -10, inner faces at -9.8), the front (+x and +z)
// open to the camera. Authored ONCE, here:
//
//   CASINO_LAYOUT     where everything is (plain JSON between the markers: scripts/blender/
//                     build_casino.py reads the very same text to build casino.glb, so the model
//                     and the walkable floor can never disagree)
//   casinoFloorY      how high the floor is anywhere: the raised High-Roller Stage and Velvet
//                     Lounge, and the steps up to them (the game stands avatars, seats and staff on it)
//   CASINO_SEATS      stools, chairs, the Chesterfield, the piano bench, the VIP room's loveseat
//   CASINO_PROPS      everything you walk up to and use (the tables, the slots, the cage, the
//                     doors, Madame Zara, the capsule machine, the tip jars, the bar, the piano...)
//   CASINO_OBSTACLES  what you walk round;  CASINO_SPAWNS  where you arrive (inside the doors)
//   CASINO_NPCS       where the staff and regulars stand;  PATRON_SPOTS  where the crowd wanders
//
// The zones, by the screen's compass (the camera looks from +x +z: north is the back corner, east
// the right-hand one, west the left-hand one):
//
//   south-east   1 THE GRAND FOYER: marble; the double doors in the right-hand back wall, a red
//                runner in from them; Mr. Vance's Golden Cage to the right of the doors (a raised
//                teller's platform behind its counter, `cage.floor`); Madame Zara's fortune booth
//                and the capsule machine tucked into the nook to their left
//   centre       2 THE MAIN GAMING FLOOR: burgundy velvet carpet; Madame Vivienne's roulette in a
//                gold sunburst; the craps table beside it; two half-moon blackjack tables, their
//                players' curves toward the floor and their dealers behind the flat side (Table 1
//                casual with Cedric the badger, Table 2 high stakes with Gideon the greyhound)
//   north-east   3 THE HIGH-ROLLER STAGE: raised 0.35 behind brass stanchions and velvet ropes, a
//                double step up at its middle; Boris's poker table with five chairs in a row; the
//                gilded double doors to the Velvet Penthouse in the back wall (shared/worlds/
//                casino_vip.ts), a red carpet up to them, Bruno the bulldog beside them: he sells
//                the Black Velvet VIP Pass, and takes the ones who show it up
//   north-west   4 THE VELVET LOUNGE: a dais raised 0.25, steps all along its open sides; Pippin's
//                bar along the wall (him behind it on a duckboard, `bar.floor`) with five stools,
//                a Chesterfield nook against the back wall with The Velvet Gazette on its coffee
//                table, the 8-ball table, and the baby grand tucked into the dais's far-left corner
//                so the way from the steps to the bar stays wide open
//   west         5 NEON ALLEY: five vintage slots against the wall (Jasper at his own machine at the
//                end of the row) under the neon, the Mechanical Turf Club and the coin pusher
//
// Coordinates are the game's: x right, z toward the camera's side, heights in y; headings about y
// with 0 facing +z (so pi/2 faces +x).

export const CASINO_LAYOUT = /* layout:begin */ {
  "half": 10,
  "walls": { "t": 0.2, "h": 4.0 },
  "zones": [
    { "id": "floor", "name": "Main Gaming Floor", "x0": -10, "x1": 10, "z0": -10, "z1": 10, "floor": "carpet" },
    { "id": "foyer", "name": "Grand Foyer", "x0": 3.0, "x1": 10, "z0": -10, "z1": -4.6, "floor": "marble" },
    { "id": "alley", "name": "Neon Alley", "x0": -10, "x1": -5.0, "z0": 0.4, "z1": 8.6, "floor": "neon" },
    { "id": "pit", "name": "High-Roller Stage", "x0": -4.2, "x1": 3.0, "z0": -10, "z1": -4.6, "floor": "pit" },
    { "id": "lounge", "name": "Velvet Lounge", "x0": -10, "x1": -4.2, "z0": -10, "z1": -0.2, "floor": "lounge" }
  ],
  "stages": [
    { "id": "pit", "x0": -4.2, "x1": 3.0, "z0": -10, "z1": -4.6, "h": 0.35, "depth": 0.7, "count": 2, "open": [{ "edge": "z1", "from": -1.0, "to": 1.2 }] },
    { "id": "lounge", "x0": -10, "x1": -4.2, "z0": -10, "z1": -0.2, "h": 0.25, "depth": 0.6, "count": 2, "open": [{ "edge": "x1", "from": -4.6, "to": -0.2 }, { "edge": "z1", "from": -10, "to": -4.2 }] }
  ],
  "doors": { "x": 6.6, "w": 2.2, "h": 2.9 },
  "runner": { "x": 6.6, "w": 1.2, "z1": -4.8 },
  "cage": { "x0": 8.2, "x1": 10, "z0": -10, "z1": -7.9, "window": 9.1, "counter": 1.05, "h": 2.6, "floor": 0.55 },
  "zara": { "x": 4.55, "z": -9.0, "w": 1.1, "d": 0.9, "h": 2.35, "yaw": 0.7854 },
  "gachapon": { "x": 3.5, "z": -7.7, "r": 0.34, "h": 1.5 },
  "roulette": { "x": 0.4, "z": 0.8, "len": 3.2, "w": 1.5, "top": 0.78, "wheel": -1.15, "reach": 3.4, "sunburst": 3.0 },
  "blackjack": {
    "tables": [
      { "x": 7.9, "z": -0.3, "tier": "blackjack_casual", "felt": "green", "dealer": "cedric" },
      { "x": 7.9, "z": 3.7, "tier": "blackjack_high", "felt": "blue", "dealer": "gideon" }
    ],
    "yaw": -1.5708,
    "r": 1.1,
    "top": 0.74,
    "stoolR": 1.55,
    "stoolAngles": [-60, -20, 20, 60],
    "reach": 2.4
  },
  "craps": { "x": 0.4, "z": 5.4, "len": 3.4, "w": 1.7, "top": 0.88, "felt": 0.66, "reach": 2.9 },
  "slots": { "x": -9.25, "zs": [1.3, 2.5, 3.7, 4.9, 6.1], "jasper": 7.3, "w": 0.9, "d": 0.8, "h": 1.75 },
  "neon": { "from": 0.8, "to": 7.8, "y": 2.6 },
  "derby": { "x": -6.3, "z": 2.9, "len": 2.4, "w": 1.0, "top": 0.9, "reach": 2.3 },
  "pusher": { "x": -6.3, "z": 6.3, "w": 0.9, "d": 0.8, "h": 1.8, "reach": 1.9 },
  "pillars": { "at": [[3.25, -4.35], [-4.6, 0.8]], "r": 0.26, "h": 2.6 },
  "poker": {
    "x": 0.9,
    "z": -7.75,
    "len": 3.4,
    "w": 1.3,
    "top": 0.68,
    "reach": 2.4,
    "chairZ": -6.5,
    "chairs": [-0.6, 0.15, 0.9, 1.65, 2.4]
  },
  "ropes": [
    { "a": [-4.2, -4.6], "b": [-1.0, -4.6] },
    { "a": [1.2, -4.6], "b": [3.0, -4.6] },
    { "a": [3.0, -4.6], "b": [3.0, -9.8] }
  ],
  "balustrade": { "x": -4.2, "z0": -9.8, "z1": -4.6 },
  "vipDoors": { "x": -2.7, "w": 1.6, "h": 2.6, "runner": 0.8, "posts": [-3.75, -1.65] },
  "tipJars": { "boris": [2.45, -7.25], "vivienne": [-0.9, 1.4] },
  "bar": { "x0": -10, "x1": -8.4, "z0": -10, "z1": -4.2, "top": 0.72, "floor": 0.3, "stoolX": -7.9, "stools": [-8.8, -7.8, -6.8, -5.8, -4.8] },
  "billiards": { "x": -6.2, "z": -2.2, "len": 2.5, "w": 1.4, "top": 0.8, "lamp": 1.75 },
  "sofa": { "x": -5.5, "z": -9.1, "len": 2.0, "seats": [-6.1, -5.5, -4.9] },
  "coffee": { "x": -5.5, "z": -7.6, "lx": 1.0, "lz": 0.6, "top": 0.45 },
  "piano": { "x": -8.9, "z": -1.45, "len": 1.5, "w": 1.45, "top": 1.0, "bench": -2.6, "benchSide": 1 },
  "planters": [{ "x": 9.3, "z": 9.3 }, { "x": -4.4, "z": 9.4 }, { "x": 9.4, "z": -3.6 }],
  "chandeliers": [[0.4, 3.4, 0.8], [6.9, 3.4, 1.7], [6.6, 3.5, -6.9], [0.9, 3.4, -7.4]],
  "sconces": { "y": 2.3, "onBackZ": [-8.2, -6.4, -0.7, 2.5], "onBackX": [-3.4, 0.0, 8.6] },
  "marquee": { "x": 0.9, "y": 3.05, "w": 2.3, "h": 0.8 },
  "paintings": [
    { "wall": "z", "at": -7.3, "y": 3.05, "subject": "poodle" },
    { "wall": "z", "at": 9.1, "y": 3.35, "subject": "fox" },
    { "wall": "x", "at": -1.7, "y": 3.0, "subject": "owl" },
    { "wall": "x", "at": 9.1, "y": 3.0, "subject": "cat" }
  ],
  "mirrors": [{ "wall": "z", "at": 4.2, "y": 3.15 }],
  "npcs": {
    "vance": { "x": 8.75, "z": -8.65, "yaw": 0 },
    "boris": { "x": 0.9, "z": -8.75, "yaw": 0 },
    "vivienne": { "x": -1.65, "z": 0.8, "yaw": 1.5708 },
    "jasper": { "x": -8.45, "z": 7.3, "yaw": -1.5708 },
    "pippin": { "x": -9.25, "z": -6.8, "yaw": 1.5708 },
    "bruno": { "x": -1.2, "z": -9.15, "yaw": 0 },
    "cedric": { "x": 8.5, "z": -0.3, "yaw": -1.5708 },
    "gideon": { "x": 8.5, "z": 3.7, "yaw": -1.5708 }
  },
  "spawns": [
    { "x": 6.6, "z": -7.2 },
    { "x": 5.7, "z": -6.6 },
    { "x": 7.5, "z": -6.6 },
    { "x": 6.6, "z": -5.9 },
    { "x": 5.2, "z": -5.6 }
  ]
} /* layout:end */;

const L = CASINO_LAYOUT;
type Pt = { x: number; z: number };

export const CASINO_HALF = L.half;
/** The camera fits the slab with a margin, like the lounge (LOFT_FRAME). */
export const CASINO_FRAME = { x: 0, z: 0, size: L.half * 2 + 0.8 };

const DEG = Math.PI / 180;
const FACE_POS_Z = 0;
const FACE_NEG_Z = Math.PI;
const FACE_NEG_X = -Math.PI / 2;
/** The heading that faces from (x, z) toward `to` (heading 0 faces +z). */
const facing = (x: number, z: number, to: Pt) => Math.atan2(to.x - x, to.z - z);
const heading = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
const near = (p: Pt, q: Pt, reach: number) => Math.hypot(p.x - q.x, p.z - q.z) <= reach;

// --- the zones ------------------------------------------------------------------------------

export type CasinoZoneId = "floor" | "foyer" | "alley" | "pit" | "lounge" | "vip";
export type CasinoZone = { id: CasinoZoneId; name: string; x0: number; x1: number; z0: number; z1: number; floor: string };
/** The zones, in paint order: the main floor's carpet is the whole slab, the others lie on it. */
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
// runs of its edges listed in `open`; its other edges meet a wall, a velvet rope or a balustrade, so
// nobody walks off them. Its `count + 1` risers are equal (h / (count + 1) each), so the treads
// stand at h * count / (count + 1) (the one against the stage) down to h / (count + 1): feet land on
// a tread, and the avatar's height eases from one to the next as it climbs. build_casino.py builds
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
/** The top of the High-Roller Stage and of the lounge's dais. */
export const PIT_Y = stage("pit").h;
export const LOUNGE_Y = stage("lounge").h;

// --- the staff and the regulars -----------------------------------------------------------------

export type CasinoNpcId = keyof typeof L.npcs;
/** Who stands where (scripts/blender/build_vance.py and build_casino_staff.py pose each one at
 *  their spot: paws on the counter or the felt, Jasper on the stool at his own machine), and how
 *  high (the floor under them, and Mr. Vance's and Pippin's platforms). `phase`: the build that
 *  brought them. Mr. Vance stands a little left of his window's middle: the camera looks down along
 *  (1, 1, 1), so the line from his face to it crosses the bars further along +x, in the window's
 *  middle. */
export const CASINO_NPCS: Record<CasinoNpcId, { x: number; z: number; yaw: number; y: number; name: string; role: string; phase: "1a" | "1b" | "2" | "3" | "4" }> = {
  vance: { ...L.npcs.vance, y: L.cage.floor, name: "Mr. Vance", role: "the fox cashier at the Golden Cage", phase: "1a" },
  boris: { ...L.npcs.boris, y: PIT_Y, name: "Boris", role: "the polar bear dealing Three-Card Poker on the High-Roller Stage", phase: "1b" },
  vivienne: { ...L.npcs.vivienne, y: 0, name: "Madame Vivienne", role: "the poodle croupier at the roulette wheel", phase: "1b" },
  jasper: { ...L.npcs.jasper, y: 0, name: "Jasper", role: "the tuxedo cat at his favourite slot", phase: "1b" },
  pippin: { ...L.npcs.pippin, y: LOUNGE_Y + L.bar.floor, name: "Pippin", role: "the penguin mixologist behind the bar", phase: "1b" },
  bruno: { ...L.npcs.bruno, y: PIT_Y, name: "Bruno", role: "the bulldog bouncer at the penthouse's doors", phase: "2" },
  cedric: { ...L.npcs.cedric, y: 0, name: "Cedric", role: "the badger dealing blackjack Table 1", phase: "3" },
  gideon: { ...L.npcs.gideon, y: 0, name: "Gideon", role: "the greyhound dealing blackjack Table 2", phase: "4" },
};

// --- the games' tables ------------------------------------------------------------------------

/** The roulette table's middle, and how close you must stand to it to bet. */
export const ROULETTE_CENTER = { x: L.roulette.x, z: L.roulette.z };
export const ROULETTE_BET_RADIUS = L.roulette.reach;

export type BlackjackTier = "blackjack_casual" | "blackjack_high";
/** The two half-moon blackjack tables, side by side: each one's players' curve toward the floor
 *  (`yaw`: the way the curve faces), its dealer behind the flat side (`dealer`). You play seated on
 *  one of its stools, at its limits (`tier`); `reach` is how near its middle counts as at it. */
export const BLACKJACK_TABLES = L.blackjack.tables.map((t, i) => ({
  id: `blackjack_0${i + 1}`,
  x: t.x,
  z: t.z,
  yaw: L.blackjack.yaw,
  r: L.blackjack.r,
  reach: L.blackjack.reach,
  tier: t.tier as BlackjackTier,
  label: `Table ${i + 1}`,
  dealer: t.dealer as "cedric" | "gideon",
  /** The stools' seat propIds. */
  stools: L.blackjack.stoolAngles.map((_, k) => `seat_bj${i + 1}_${k + 1}`),
}));
/** The nearest blackjack table within reach of (x, z) (plus `slack`: the server allows a little
 *  more than the client shows, for lag), if any: where two reaches overlap, the nearer is yours. */
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

/** The tables played from a panel beside them (not the wheel or blackjack): where each one is, and
 *  how near to it you must be to play (the server allows a little more, for lag). */
export type CasinoGameTable = "poker" | "poker_vip" | "baccarat" | "craps" | "derby" | "pusher" | "billiards";
export const CASINO_GAME_TABLES: Record<CasinoGameTable, Pt & { reach: number }> = {
  poker: { x: L.poker.x, z: L.poker.z, reach: L.poker.reach },
  poker_vip: VIP_POKER,
  baccarat: VIP_BACCARAT,
  craps: { x: L.craps.x, z: L.craps.z, reach: L.craps.reach },
  derby: { x: L.derby.x, z: L.derby.z, reach: L.derby.reach },
  pusher: { x: L.pusher.x, z: L.pusher.z, reach: L.pusher.reach },
  billiards: { x: L.billiards.x, z: L.billiards.z, reach: 2.4 },
};
export function nearGameTable(game: CasinoGameTable, x: number, z: number, slack = 0): boolean {
  const t = CASINO_GAME_TABLES[game];
  return near({ x, z }, t, t.reach + slack);
}

/** The tables you play standing, from any side: each one's middle and half-size. */
export type StandingTable = "roulette" | "craps" | "derby" | "billiards";
const STANDING: Record<StandingTable, Pt & { hx: number; hz: number }> = {
  roulette: { x: L.roulette.x, z: L.roulette.z, hx: L.roulette.len / 2, hz: L.roulette.w / 2 },
  craps: { x: L.craps.x, z: L.craps.z, hx: L.craps.len / 2, hz: L.craps.w / 2 },
  derby: { x: L.derby.x, z: L.derby.z, hx: L.derby.w / 2, hz: L.derby.len / 2 },
  billiards: { x: L.billiards.x, z: L.billiards.z, hx: L.billiards.len / 2, hz: L.billiards.w / 2 },
};
/** Spots all round a standing table's rim, `gap` out from it, about every half metre: you walk up
 *  to the nearest open one, whichever side you come from (some fall on the dealer or a wall: the
 *  walker skips the blocked ones). */
export function tablePerimeter(table: StandingTable, gap = 0.55): Pt[] {
  const t = STANDING[table];
  const hx = t.hx + gap;
  const hz = t.hz + gap;
  const out: Pt[] = [];
  const along = (ax: number, az: number, bx: number, bz: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let k = 0; k < n; k++) out.push({ x: t.x + ax + ((bx - ax) * k) / n, z: t.z + az + ((bz - az) * k) / n });
  };
  along(-hx, -hz, hx, -hz);
  along(hx, -hz, hx, hz);
  along(hx, hz, -hx, hz);
  along(-hx, hz, -hx, -hz);
  return out;
}

/** Neon Alley's slot machines against the left wall, facing +x; you play standing at the front. */
export const SLOT_MACHINES = L.slots.zs.map((z, i) => ({ propId: `slot_0${i + 1}`, x: L.slots.x, z, approachX: L.slots.x + L.slots.d / 2 + 0.85, approachZ: z, y: 0 }));
/** The one-player machines the crowd takes turns at too (shared/casino.ts: occupants). */
export const SINGLE_MACHINES = [...SLOT_MACHINES.map((s) => s.propId), "coin_pusher"];

// --- the penthouse's doors --------------------------------------------------------------------------
//
// Gilded double doors in the High-Roller Stage's back wall, a red carpet up to them, Bruno beside
// them. Shown a Black Velvet VIP Pass, he takes you up (the server moves you to the penthouse's
// elevator: shared/worlds/casino_vip.ts); the elevator brings you back down here.

export const VIP_DOORS = { x: L.vipDoors.x, z: -L.half + L.walls.t + 0.15 };
/** Where you stand to ask Bruno, and where the elevator sets you down again. */
export const VIP_DOORS_FRONT = { x: L.vipDoors.x, z: -L.half + 1.55 };

// --- the walkable floor: the hall and the penthouse -------------------------------------------------

/** The casino's floor: the hall, and the penthouse off to its side (each a rectangle you walk in,
 *  its edges a margin in from the walls). */
export const CASINO_REGIONS = [
  { x0: -L.half + 0.6, x1: L.half - 0.6, z0: -L.half + 0.6, z1: L.half - 0.6 },
  VIP_REGION,
];

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
  boris: { x: L.tipJars.boris[0], z: L.tipJars.boris[1], y: PIT_Y + L.poker.top, front: { x: 2.45, z: -5.75 } },
  vivienne: { x: L.tipJars.vivienne[0], z: L.tipJars.vivienne[1], y: L.roulette.top, front: { x: -0.9, z: 2.25 } },
} as const;
export type TipDealer = keyof typeof TIP_JARS;

/** The bar's counter front (Pippin takes orders across it): where you stand, and how near to it. */
export const BAR_FRONT = { x: L.bar.stoolX + 0.85, z: -6.3 };
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
  // Boris's poker table: five chairs in a row along its front, facing him; stepped into from behind
  ...L.poker.chairs.map((x, i): CasinoSeat => onFloor({ propId: `seat_poker_${i + 1}`, x, z: L.poker.chairZ, rotationY: FACE_NEG_Z, cushion: "pokerChair", style: "armchair", approachX: x, approachZ: L.poker.chairZ + 0.85 })),
  // the bar: stools along the counter, facing Pippin
  ...L.bar.stools.map((z, i): CasinoSeat => onFloor({ propId: `seat_bar_${i + 1}`, x: L.bar.stoolX, z, rotationY: FACE_NEG_X, cushion: "barStool", style: "stool", approachX: L.bar.stoolX + BAR_STOOL_APPROACH, approachZ: z })),
  // the Chesterfield against the back wall: three places along it, facing the coffee table and the room
  ...L.sofa.seats.map((x, i): CasinoSeat => onFloor({ propId: `seat_sofa_${i + 1}`, x, z: L.sofa.z, rotationY: FACE_POS_Z, cushion: "chesterfield", style: "armchair", approachX: x, approachZ: L.sofa.z + 0.75 })),
  // the grand piano's bench: facing the keys (the piano's tail toward the camera); in from its open side
  onFloor({ propId: "seat_piano", x: L.piano.x, z: L.piano.bench, rotationY: FACE_POS_Z, cushion: "pianoBench", style: "pad", approachX: L.piano.x + L.piano.benchSide, approachZ: L.piano.bench }),
  // the penthouse's high-limit poker and baccarat seats (shared/worlds/casino_vip.ts)
  ...VIP_SEATS,
];

// --- props ------------------------------------------------------------------------------------

const prop = (propId: string, at: Pt, kind: PropSpec["kind"], color: string, front: Pt, y?: number): PropSpec => ({ propId, x: at.x, z: at.z, y: y ?? casinoFloorY(at.x, at.z), kind, color, defaultOn: true, approachX: front.x, approachZ: front.z });

export const CASINO_PROPS: PropSpec[] = [
  // Neon Alley's slots and the VIP room's high-stakes machine (chips)
  ...SLOT_MACHINES.map((s): PropSpec => prop(s.propId, s, "slot", "#ff4fa3", { x: s.approachX, z: s.approachZ }, s.y)),
  // the tables: walking up to one (or clicking it) opens its panel; nothing ever opens by itself
  prop("roulette_table", ROULETTE_CENTER, "roulette", "#1f6b45", { x: L.roulette.x, z: L.roulette.z + L.roulette.w / 2 + 0.95 }),
  ...BLACKJACK_TABLES.map((t): PropSpec => prop(t.id, t, "blackjack", "#1f6b45", blackjackFront(t))),
  prop("poker_table", L.poker, "poker", "#1f6b45", { x: L.poker.x, z: L.poker.chairZ + 0.85 }),
  prop("craps_table", L.craps, "craps", "#1f6b45", { x: L.craps.x, z: L.craps.z + L.craps.w / 2 + 0.75 }),
  prop("derby_table", L.derby, "derby", "#2f6b3f", { x: L.derby.x + L.derby.w / 2 + 0.7, z: L.derby.z }),
  prop("coin_pusher", L.pusher, "pusher", "#ffd98a", { x: L.pusher.x + L.pusher.d / 2 + 0.7, z: L.pusher.z }),
  prop("billiards_table", L.billiards, "billiards", "#1f6b45", { x: L.billiards.x, z: L.billiards.z - L.billiards.w / 2 - 0.65 }),
  // The Velvet Gazette on the coffee table, and the baby grand's keys
  prop("velvet_gazette", L.coffee, "gazette", "#f2e8d5", { x: L.sofa.x, z: L.sofa.z + 0.75 }, LOUNGE_Y + L.coffee.top),
  prop("piano_keys", { x: L.piano.x, z: L.piano.z - L.piano.w / 2 }, "piano", "#161214", { x: L.piano.x + L.piano.benchSide, z: L.piano.bench }),
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
  // the penthouse's doors, Bruno beside them
  prop("vip_door", VIP_DOORS, "vipdoor", "#7a1e2e", VIP_DOORS_FRONT, PIT_Y),
  // the exit doors: back to the Lounge (or anywhere, through the world drawer)
  prop("casino_exit", EXIT_DOORS, "portal", "#d4a93c", EXIT_FRONT, 0),
  // the Velvet Penthouse's tables, its Golden Vault and its elevator
  ...VIP_PROPS,
];

// --- the games played sitting down --------------------------------------------------------------

/** The tables played from a seat (blackjack's stools, the poker tables' chairs, the baccarat stools,
 *  the piano's bench): walking up to one takes you to its nearest free seat, and sitting down opens
 *  its panel. `spectate`: a full table can still be watched (its rounds are everyone's to see). The
 *  standing tables (the wheel, craps, the Turf Club, pool) are played from anywhere round their rims
 *  (tablePerimeter). */
export interface SeatedGame {
  propId: string;
  kind: "blackjack" | "poker" | "baccarat" | "piano";
  seats: string[];
  spectate: boolean;
}
const seatsLike = (prefix: string) => CASINO_SEATS.filter((s) => s.propId.startsWith(prefix)).map((s) => s.propId);
export const SEATED_GAMES: SeatedGame[] = [
  ...BLACKJACK_TABLES.map((t): SeatedGame => ({ propId: t.id, kind: "blackjack", seats: t.stools, spectate: true })),
  { propId: "poker_table", kind: "poker", seats: seatsLike("seat_poker_"), spectate: false },
  { propId: "vip_poker_table", kind: "poker", seats: seatsLike("seat_vpoker_"), spectate: false },
  { propId: "baccarat_table", kind: "baccarat", seats: seatsLike("seat_bacc_"), spectate: true },
  { propId: "piano_keys", kind: "piano", seats: ["seat_piano"], spectate: false },
];
export const seatedGameOf = (propId: string) => SEATED_GAMES.find((g) => g.propId === propId);
/** The game a seat belongs to, if any. */
export const seatedGameAt = (seatId: string) => SEATED_GAMES.find((g) => g.seats.includes(seatId));
export const TABLE_FULL_LINE = "Table is full — please wait or spectate";

// --- where the crowd wanders (client-side only: entities/AmbientPatrons.tsx) ----------------------

/** The spots the ambient patrons drift between: watching the slots, chatting at the bar, round the
 *  roulette and the craps table, watching the blackjack tables, strolling the front of the floor, in
 *  the lounge; they come in and leave by the doors. None is anyone's seat or approach. `bella`: the
 *  cocktail waitress's round between the tables. (The patrons playing the one-player machines stand
 *  at the machines' own fronts: SINGLE_MACHINES.) */
export const PATRON_SPOTS = {
  doors: EXIT_FRONT,
  slots: [1.9, 3.1, 4.3, 5.5].map((z) => ({ x: -7.7, z })),
  bar: [-8.3, -7.3, -5.3, -4.3].map((z) => ({ x: -7.1, z })),
  roulette: [150, 115, 80, 45, 10, -25].map((deg) => ({ x: L.roulette.x + Math.cos(deg * DEG) * 2.35, z: L.roulette.z + Math.sin(deg * DEG) * 1.95 })),
  craps: [{ x: -0.9, z: 6.95 }, { x: 1.7, z: 6.95 }, { x: 2.75, z: 5.4 }, { x: -1.95, z: 5.4 }],
  blackjack: [{ x: 5.0, z: -1.3 }, { x: 4.9, z: 1.7 }, { x: 5.0, z: 4.7 }],
  promenade: [{ x: -2.4, z: 8.7 }, { x: 3.4, z: 8.5 }, { x: 6.2, z: 7.4 }, { x: -3.4, z: 6.0 }],
  lounge: [{ x: -6.2, z: -5.6 }, { x: -5.2, z: -6.2 }, { x: -6.6, z: -0.9 }],
  bella: [{ x: 3.4, z: -2.9 }, { x: 4.5, z: 1.7 }, { x: 3.4, z: 6.6 }, { x: -2.4, z: 7.9 }, { x: -3.5, z: 3.3 }, { x: -2.9, z: -2.8 }],
};

// --- what you walk round ----------------------------------------------------------------------

type Box = { x0: number; x1: number; z0: number; z1: number };
const box = (b: Box): AABB => ({ minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 });
const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
const centred = (c: Pt, hx: number, hz: number): AABB => ({ minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz });

/** A velvet rope (or a rail) along an axis-aligned line: a thin box along it. */
function railBox(a: number[], b: number[]): AABB {
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

/** Steps have brass cheeks where a run ends short of the stage's corner: you go up the steps, not
 *  over their ends. */
function stepCheeks(s: Stage): AABB[] {
  const out: AABB[] = [];
  const R = 0.08;
  for (const o of s.open) {
    const horizontal = o.edge === "z0" || o.edge === "z1";
    const [lo, hi] = horizontal ? [s.x0, s.x1] : [s.z0, s.z1];
    const sign = o.edge === "x1" || o.edge === "z1" ? 1 : -1;
    const base = o.edge === "x0" ? s.x0 : o.edge === "x1" ? s.x1 : o.edge === "z0" ? s.z0 : s.z1;
    const [a, b] = [base, base + sign * s.depth].sort((p, q) => p - q);
    for (const end of [Math.min(o.from, o.to), Math.max(o.from, o.to)]) {
      if (end <= lo + 1e-6 || end >= hi - 1e-6) continue; // at a corner (or a wall): nothing to guard
      out.push(horizontal ? { minX: end - R, maxX: end + R, minZ: a, maxZ: b } : { minX: a, maxX: b, minZ: end - R, maxZ: end + R });
    }
  }
  return out;
}

const seatBox = (propIdPrefix: string, r: number) => CASINO_SEATS.filter((s) => s.propId.startsWith(propIdPrefix)).map((s) => around(s, r));

export const CASINO_OBSTACLES: AABB[] = [
  // 1 the foyer: Mr. Vance's cage (him inside it), Madame Zara's booth and the capsule machine
  box(L.cage),
  around(L.zara, 0.62),
  around(L.gachapon, L.gachapon.r),
  // the torch columns at the zones' corners
  ...L.pillars.at.map(([x, z]) => around({ x, z }, L.pillars.r)),
  // 2 the main floor: the roulette table and Madame Vivienne at its wheel; the blackjack tables,
  // their stools and Cedric between them; the craps table
  centred(L.roulette, L.roulette.len / 2, L.roulette.w / 2),
  around(L.npcs.vivienne, 0.32),
  ...BLACKJACK_TABLES.flatMap(halfMoonBoxes),
  ...seatBox("seat_bj", 0.22),
  around(L.npcs.cedric, 0.34),
  around(L.npcs.gideon, 0.34),
  centred(L.craps, L.craps.len / 2, L.craps.w / 2),
  // 3 the High-Roller Stage: its ropes and the steps' cheeks, the balustrade to the lounge, the
  // poker table, Boris behind it, the chairs along it; Bruno and the brass posts at the penthouse's
  // doors
  ...L.ropes.map((r) => railBox(r.a, r.b)),
  ...CASINO_STAGES.flatMap(stepCheeks),
  railBox([L.balustrade.x, L.balustrade.z0], [L.balustrade.x, L.balustrade.z1]),
  centred(L.poker, L.poker.len / 2, L.poker.w / 2),
  around(L.npcs.boris, 0.36),
  ...seatBox("seat_poker_", 0.25),
  around(L.npcs.bruno, 0.36),
  ...L.vipDoors.posts.map((x) => around({ x, z: -9.1 }, 0.14)),
  // 4 the lounge: the bar and the back bar behind it (Pippin inside), its stools, the billiards
  // table, the Chesterfield and its coffee table, the grand piano and its bench
  box(L.bar),
  ...seatBox("seat_bar", 0.22),
  centred(L.billiards, L.billiards.len / 2, L.billiards.w / 2),
  centred({ x: L.sofa.x, z: L.sofa.z - 0.05 }, L.sofa.len / 2 + 0.05, 0.4),
  centred(L.coffee, L.coffee.lx / 2, L.coffee.lz / 2),
  centred(L.piano, L.piano.len / 2, L.piano.w / 2),
  box({ x0: L.piano.x - 0.45, x1: L.piano.x + 0.45, z0: L.piano.bench - 0.18, z1: L.piano.bench + 0.18 }),
  // 5 Neon Alley: the whole row of cabinets against the wall (Jasper's too), Jasper on his stool,
  // the derby table and the coin pusher
  box({ x0: -L.half, x1: L.slots.x + L.slots.d / 2, z0: L.slots.zs[0] - L.slots.w / 2, z1: L.slots.jasper + L.slots.w / 2 }),
  around(L.npcs.jasper, 0.3),
  centred(L.derby, L.derby.w / 2, L.derby.len / 2),
  centred(L.pusher, L.pusher.d / 2, L.pusher.w / 2),
  // the planters out front
  ...L.planters.map((p) => around(p, 0.4)),
  // the Velvet Penthouse, off to the side
  ...VIP_OBSTACLES,
];

export const CASINO_SPAWNS: Pt[] = L.spawns;
