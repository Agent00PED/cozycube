import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";
import { gridData, gridY, makeGrid } from "../terrain";

// The Hidden Cove (the map "hidden_cove", docs/beach-design.md section 5): a sea cave behind the rock
// stacks, reached only on the captain's boat, and only once the torn sea chart is whole. Nothing on
// any other map names it.
//
// The cave opens to the south-east (the camera's side, so nothing stands in front of the player): a
// round lagoon of still water there, the boat lying in it; a crescent of pale sand round its back;
// the cave's wall behind the sand, all round the north and the west.
//
//   the lagoon     fished from the sand (coveCast: the float lands ahead of you on the water), by hand
//                  only, an Expedition rod or better: the sea's fish and three of the cove's own
//   the clams      giant clams in the wet sand, pried open for pearls (they close again in a while)
//   the bench      an old shipwright's bench left in the cave: the Deep Tide tools are made here
//   the captain    on the sand by his boat: back to the Open Sea, or straight to the pier

type Pt = { x: number; z: number };
const round = (v: number) => Math.round(v * 1000) / 1000;
const S = Math.SQRT1_2;

export const COVE_LAYOUT = /* layout:begin */ {
  "half": 12,
  "floor": 10.4,
  "lagoon": { "x": 3.0, "z": 3.0, "r": 7.2 },
  "terrain": { "step": 0.4, "sand": { "top": 0.75, "run": 7 }, "bed": { "depth": 1.4, "run": 6 } },
  "wadeDepth": 0.42,
  "arrival": { "deg": 0, "d": 1.9 },
  "captain": { "deg": 24, "d": 1.3 },
  "boat": { "deg": 24, "d": -3.3 },
  "bench": { "deg": -34, "d": 4.6 },
  "logs": [{ "deg": -8, "d": 3.2 }, { "deg": 44, "d": 3.4 }],
  "clams": [{ "deg": -46, "d": 0.5 }, { "deg": -22, "d": 0.2 }, { "deg": 6, "d": 0.4 }, { "deg": 48, "d": 0.25 }, { "deg": 70, "d": 0.6 }],
  "crystals": [[-9.2, -1.5, 1.0], [-7.4, -6.6, 1.3], [-2.2, -9.6, 1.1], [3.4, -9.4, 0.9], [-9.6, 3.4, 0.8]],
  "skylight": { "x": -3.4, "z": -3.6 }
} /* layout:end */;

const L = COVE_LAYOUT;
/** From the lagoon's middle toward the back of the cave (the north-west). */
const BACK: Pt = { x: -S, z: -S };
/** A point `d` metres up the sand from the waterline (negative: out on the lagoon), `deg` round the
 *  lagoon from the middle of the crescent (positive: toward the north-east). */
export function coveAt(deg: number, d: number): Pt {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  // (turned from BACK: positive degrees swing toward +x, the north-east end of the crescent)
  const u = { x: BACK.x * c - BACK.z * s, z: BACK.x * s + BACK.z * c };
  const r = L.lagoon.r + d;
  return { x: round(L.lagoon.x + u.x * r), z: round(L.lagoon.z + u.z * r) };
}
/** How far up the sand (x, z) is from the lagoon's waterline (negative: on the water). */
export const coveShoreD = (x: number, z: number): number => Math.hypot(x - L.lagoon.x, z - L.lagoon.z) - L.lagoon.r;

const T = L.terrain;
const easeOut = (t: number) => 1 - (1 - Math.min(1, t)) ** 2;
/** The ground: the sand eased up from the waterline, the lagoon's bed falling away. */
export function coveLand(x: number, z: number): number {
  const d = coveShoreD(x, z);
  return d >= 0 ? T.sand.top * easeOut(d / T.sand.run) : -T.bed.depth * easeOut(-d / T.bed.run);
}
export const COVE_GRID = makeGrid(L.half, T.step, coveLand, coveLand);
export const coveFloorY = (x: number, z: number): number => gridY(COVE_GRID, COVE_GRID.ground, x, z);
export const COVE_WATER_Y = 0;
export const COVE_WADE_DEPTH = L.wadeDepth;
/** Standing in the lagoon's shallows. */
export const coveWading = (x: number, z: number): boolean => coveFloorY(x, z) < COVE_WATER_Y - 0.04;
/** Where no one stands: deep water, and beyond the cave's floor (its wall). */
export const coveBlocked = (x: number, z: number): boolean => Math.hypot(x, z) > L.floor || coveFloorY(x, z) < -COVE_WADE_DEPTH;

const facing = (from: Pt, to: Pt) => round(Math.atan2(to.x - from.x, to.z - from.z));
const LAGOON: Pt = { x: L.lagoon.x, z: L.lagoon.z };

/** Where the boat sets you down, and the spawns round it. */
export const COVE_ARRIVAL = coveAt(L.arrival.deg, L.arrival.d);
export const COVE_SPAWNS: Pt[] = [COVE_ARRIVAL, coveAt(L.arrival.deg - 8, L.arrival.d + 0.6), coveAt(L.arrival.deg + 7, L.arrival.d + 0.9), coveAt(L.arrival.deg - 4, L.arrival.d + 1.5)];
/** Captain Brine on the sand by his boat (he faces up the beach), where you stand to talk to him. */
const CAPTAIN_AT = coveAt(L.captain.deg, L.captain.d);
export const COVE_CAPTAIN_FRONT: Pt = coveAt(L.captain.deg - 7, L.captain.d + 0.9);
export const COVE_CAPTAIN = { ...CAPTAIN_AT, yaw: facing(CAPTAIN_AT, COVE_CAPTAIN_FRONT) };
/** His boat, lying in the lagoon bow to the sand. */
const BOAT_AT = coveAt(L.boat.deg, L.boat.d);
export const COVE_BOAT = { ...BOAT_AT, yaw: facing(BOAT_AT, CAPTAIN_AT) };
/** The shipwright's bench (it faces the lagoon), and where you stand at it. */
const BENCH_AT = coveAt(L.bench.deg, L.bench.d);
export const COVE_BENCH = { ...BENCH_AT, yaw: facing(BENCH_AT, LAGOON) };
export const COVE_BENCH_FRONT: Pt = coveAt(L.bench.deg, L.bench.d - 0.95);
export const COVE_BENCH_REACH = 1.9;
/** The giant clams in the wet sand: each one's place and where you stand to pry it open. */
export const COVE_CLAMS = L.clams.map((c, i) => {
  const p = coveAt(c.deg, c.d);
  return { id: `clam_${i + 1}`, propId: `cove_clam_${i + 1}`, ...p, yaw: facing(p, LAGOON), approach: coveAt(c.deg, c.d + 0.85) };
});
export const CLAM_REACH = 1.6;
/** Two driftwood logs on the sand, facing the lagoon. */
export const COVE_LOGS = L.logs.map((g, i) => {
  const p = coveAt(g.deg, g.d);
  return { propId: `seat_cove_log_0${i + 1}`, ...p, rotationY: facing(p, LAGOON), approach: coveAt(g.deg, g.d - 0.7) };
});

/** How far out the float lands, and how deep the water must be there. */
export const COVE_CAST = 1.9;
const underBoat = (x: number, z: number) => Math.hypot(x - COVE_BOAT.x, z - COVE_BOAT.z) < 4.4 && Math.abs((x - COVE_BOAT.x) * Math.cos(COVE_BOAT.yaw) - (z - COVE_BOAT.z) * Math.sin(COVE_BOAT.yaw)) < 1.8;
const floats = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) < L.half - 0.3 && coveFloorY(x, z) < COVE_WATER_Y - 0.3 && !underBoat(x, z);
/** A cast from (x, z) facing (fx, fz): where the float lands on the lagoon, or null. */
export function coveCast(x: number, z: number, fx: number, fz: number): Pt | null {
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-6) return null;
  const f = { x: fx / fl, z: fz / fl };
  for (const turn of [0, 0.35, -0.35, 0.7, -0.7]) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const d = { x: f.x * c - f.z * s, z: f.x * s + f.z * c };
    for (const reach of [COVE_CAST, COVE_CAST + 0.6, COVE_CAST - 0.5]) {
      const p = { x: x + d.x * reach, z: z + d.z * reach };
      if (floats(p.x, p.z)) return { x: round(p.x), z: round(p.z) };
    }
  }
  return null;
}

export const COVE_PROPS: PropSpec[] = [
  { propId: "brine_cove", x: COVE_CAPTAIN.x, z: COVE_CAPTAIN.z, kind: "captain", color: "#27405f", defaultOn: true, approachX: COVE_CAPTAIN_FRONT.x, approachZ: COVE_CAPTAIN_FRONT.z },
  { propId: "cove_bench", x: COVE_BENCH.x, z: COVE_BENCH.z, kind: "covebench", color: "#b88a5a", defaultOn: true, approachX: COVE_BENCH_FRONT.x, approachZ: COVE_BENCH_FRONT.z },
  ...COVE_CLAMS.map((c): PropSpec => ({ propId: c.propId, x: c.x, z: c.z, kind: "clam", color: "#e8d9c8", defaultOn: true, approachX: c.approach.x, approachZ: c.approach.z })),
];

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r, r });
export const COVE_OBSTACLES: AABB[] = [
  around(COVE_CAPTAIN, 0.36),
  around(COVE_BENCH, 0.62),
  ...COVE_CLAMS.map((c) => around(c, 0.42)),
  ...COVE_LOGS.map((g) => around(g, 0.24)),
  ...L.crystals.map(([x, z, s]) => around({ x, z }, 0.55 * s)),
];

/** The grid, how far up the sand each of its corners is, and every thing's place, for the builder
 *  (scripts/blender/build_cove.py; `npm run beach-terrain` writes it). */
export function coveTerrainData() {
  const g = COVE_GRID;
  const shore: number[] = [];
  for (let k = 0; k <= g.n; k++) for (let i = 0; i <= g.n; i++) shore.push(Math.round(coveShoreD(-g.half + i * g.cell, -g.half + k * g.cell) * 100) / 100);
  return {
    ...gridData(g),
    shore,
    scene: {
      floor: L.floor,
      lagoon: L.lagoon,
      arrival: COVE_ARRIVAL,
      captain: COVE_CAPTAIN,
      boat: COVE_BOAT,
      bench: COVE_BENCH,
      clams: COVE_CLAMS.map((c) => ({ x: c.x, z: c.z, yaw: c.yaw })),
      logs: COVE_LOGS.map((g2) => ({ x: g2.x, z: g2.z, yaw: g2.rotationY })),
      crystals: L.crystals,
      skylight: L.skylight,
    },
  };
}
