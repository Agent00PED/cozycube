import { TREES, type TreeKind } from "../chop";
import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";

// The Whispering Woods (the map "whispering_woods"): a 24 x 24 wood behind the Starlight Campfire's
// fence, reached only through the branch archway at the fence's west end, with a Day Trip Permit (one
// way in) or the Ranger's Badge (for good) from Buster. It shares the campfire's 24-minute day
// (shared/daynight.ts) and, like every world, the one room: walking through the archway is a trip,
// not a new connection.
//
//   The Border          the way in from the archway, meadow and four Soft Pines (T1) with a birch
//                       among them, and the trail on to Bramble's with birches and cedars along
//                       its margins (none within 5 m of his counter or workbench)
//   The Birch Grove     the west, eight Silver Birches (T2) spaced as they grow (3.5-4.5 m apart,
//                       no rows), and the rabbits
//   The Cedar Ridge     the middle east, five Highland Cedars (T3) on their stony ridge, and a
//                       clearing where a Colossal Titan can rise
//   The Golden Glen     the back west, three Autumn Maples (T4) in gold leaves, and the deer
//   The Elderwood Shrine the back, one Whispering Elderwood (T5) inside a ring of mossy stones
//
// Round them: a meandering river (in off the north edge, out off the east, its banks strewn with
// pebbles and rocks; four fishing spots on its bank, two of them a log and a rock to sit on: the wild
// fish, the legendaries and mythics among them), Finley the River Otter on his boulder by the lower
// river (the woods' angler: fish, rods, livewells, bait), Bramble the Bear's trading post in the
// south-east (the woods' forester: logs and by-products, axes, carriers), its cabin flush against
// the eastern tree line and an open clearing before his counter, his advanced workbench right beside
// it, birds on the vista pines' lower boughs, and twenty-five vista pines along the back and side
// edges (not for felling). Behind the Golden Glen's Autumn Maples, set into a mossy outcrop on the
// western cliff and half hidden by ferns and vines, an old mine adit: the way down to the Glimmering
// Caverns, kept by Old Flint the Badger (his lantern helmet, his leather apron): meeting him hands
// you the Rusted Pickaxe, and the adit is open to you for good. The layout below is plain JSON between the markers, read as-is by
// scripts/blender/build_forest.py, which builds forest.glb (the diorama, and each tree kind's four
// looks, stump to mature, for the client to place at its node).

type Pt = { x: number; z: number };

export const FOREST_LAYOUT = /* layout:begin */ {
  "half": 12,
  "zones": [
    { "id": "border", "name": "The Border", "x0": -12, "x1": 4, "z0": 6.2, "z1": 12, "floor": "meadow" },
    { "id": "birch", "name": "The Birch Grove", "x0": -12, "x1": -2.2, "z0": -5.9, "z1": 6.2, "floor": "birch" },
    { "id": "cedar", "name": "The Cedar Ridge", "x0": -2.2, "x1": 9.2, "z0": -5.6, "z1": 6.2, "floor": "ridge" },
    { "id": "glen", "name": "The Golden Glen", "x0": -12, "x1": -0.6, "z0": -12, "z1": -5.9, "floor": "glen" },
    { "id": "shrine", "name": "The Elderwood Shrine", "x0": -0.6, "x1": 9.2, "z0": -12, "z1": -5.6, "floor": "shrine" }
  ],
  "archway": { "x": -9.0, "z": 11.5, "w": 1.9, "h": 2.7 },
  "arrival": { "x": -9.0, "z": 9.7 },
  "trees": [
    { "id": "border_1", "kind": "soft_pine", "x": -6.3, "z": 10.3 },
    { "id": "border_2", "kind": "soft_pine", "x": -3.0, "z": 9.5 },
    { "id": "border_3", "kind": "soft_pine", "x": 0.2, "z": 8.1 },
    { "id": "border_4", "kind": "soft_pine", "x": -10.0, "z": 7.2 },
    { "id": "birch_1", "kind": "birch", "x": -9.9, "z": 4.4 },
    { "id": "birch_2", "kind": "birch", "x": -6.6, "z": 2.0 },
    { "id": "birch_3", "kind": "birch", "x": -9.9, "z": -0.4 },
    { "id": "birch_4", "kind": "birch", "x": -6.6, "z": -1.6 },
    { "id": "birch_5", "kind": "birch", "x": -3.0, "z": 1.1 },
    { "id": "birch_6", "kind": "birch", "x": -9.0, "z": -4.6 },
    { "id": "birch_7", "kind": "birch", "x": -3.6, "z": -3.7 },
    { "id": "birch_8", "kind": "birch", "x": -5.1, "z": 5.3 },
    { "id": "cedar_1", "kind": "cedar", "x": 3.0, "z": 3.1 },
    { "id": "cedar_2", "kind": "cedar", "x": 5.8, "z": 1.6 },
    { "id": "cedar_3", "kind": "cedar", "x": 2.6, "z": -0.8 },
    { "id": "cedar_4", "kind": "cedar", "x": 6.2, "z": -2.2 },
    { "id": "cedar_5", "kind": "cedar", "x": 3.9, "z": -4.0 },
    { "id": "maple_1", "kind": "maple", "x": -8.6, "z": -8.4 },
    { "id": "maple_2", "kind": "maple", "x": -5.6, "z": -9.8 },
    { "id": "maple_3", "kind": "maple", "x": -3.0, "z": -7.4 },
    { "id": "elder_1", "kind": "elderwood", "x": 3.2, "z": -9.0 },
    { "id": "birch_9", "kind": "birch", "x": 4.0, "z": 9.9 },
    { "id": "birch_10", "kind": "birch", "x": -7.6, "z": 6.2 },
    { "id": "birch_11", "kind": "birch", "x": 9.2, "z": 1.2 },
    { "id": "cedar_6", "kind": "cedar", "x": 2.6, "z": 6.0 },
    { "id": "cedar_7", "kind": "cedar", "x": -0.5, "z": 10.5 }
  ],

  "shrine": { "x": 3.2, "z": -9.0, "r": 1.9, "stones": 7 },
  "river": {
    "points": [[7.4, -13.2, 0.8], [7.9, -10.5, 0.85], [7.0, -8.2, 1.0], [8.3, -6.0, 1.1], [9.8, -4.4, 1.2], [11.0, -2.2, 1.0], [13.4, -1.2, 0.9]],
    "water": -0.2,
    "depth": 0.55,
    "rocks": [[7.3, -11.6, 0.45], [6.6, -7.4, 0.4], [8.9, -5.1, 0.5], [10.9, -3.4, 0.45], [10.2, -1.6, 0.4], [8.6, -9.6, 0.35]]
  },
  "fishing": [
    { "stand": { "x": 5.65, "z": -8.6 }, "bobber": { "x": 7.0, "z": -8.5 } },
    { "stand": { "x": 6.55, "z": -5.78 }, "bobber": { "x": 7.77, "z": -6.69 }, "seat": "log", "face": [0.8, -0.6] },
    { "stand": { "x": 8.58, "z": -3.24 }, "bobber": { "x": 10.0, "z": -4.05 }, "seat": "rock", "face": [0.87, -0.5] },
    { "stand": { "x": 10.66, "z": -0.71 }, "bobber": { "x": 11.4, "z": -1.95 } }
  ],
  "cabin": { "x": 9.85, "z": 5.35, "w": 3.2, "d": 2.4, "h": 2.6 },
  "counter": { "x": 9.85, "z": 7.7, "len": 2.0, "w": 0.55, "top": 0.7 },
  "bramble": { "x": 9.85, "z": 7.0, "yaw": 0 },
  "workbench": { "x": 7.45, "z": 7.75, "len": 1.6, "w": 0.72, "top": 0.9 },
  "finley": { "x": 9.3, "z": -1.9, "yaw": 2.45 },
  "birds": [[-11.4, 5.8], [-11.3, -5.0], [-9.3, -11.4], [2.0, -11.5], [8.9, 2.95]],
  "titanSpots": [[-6.7, -6.6], [0.8, 3.6], [0.8, -3.4]],
  "animals": [
    { "id": "deer", "kind": "deer", "x": -1.8, "z": -4.9 },
    { "id": "rabbits", "kind": "rabbits", "x": -2.6, "z": 5.4 }
  ],
  "vista": [
    [-11.2, -11.3, 1.2], [-9.3, -11.4, 1.0], [-7.4, -11.3, 1.15], [-5.5, -11.4, 0.95], [-3.6, -11.3, 1.1], [-1.7, -11.4, 1.0], [0.2, -11.4, 1.2],
    [2.0, -11.5, 0.95], [5.1, -11.4, 1.1], [9.9, -11.2, 1.0], [8.9, 2.95, 1.0], [11.3, 2.7, 1.05],
    [-11.4, -9.2, 1.1], [-11.5, -6.35, 0.95], [-11.3, -5.0, 1.15], [-11.4, -2.8, 1.0], [-11.5, -0.6, 1.1], [-11.3, 1.6, 0.95], [-11.4, 5.8, 1.05], [-11.5, 7.9, 1.0],
    [-11.3, 10.9, 0.9], [-11.4, 3.7, 1.0], [3.6, -11.6, 1.0], [11.7, -10.8, 1.1], [11.8, -8.2, 0.95]
  ],
  "paths": [
    { "points": [[-9.0, 10.8, 1.6], [-7.4, 8.9, 1.5], [-4.6, 7.4, 1.4], [-1.6, 7.0, 1.4], [1.8, 7.5, 1.4], [5.0, 8.3, 1.3], [7.6, 8.85, 1.3], [9.85, 9.0, 1.5]] },
    { "points": [[-1.6, 7.0, 1.3], [-1.9, 3.2, 1.2], [-1.4, 0.0, 1.2], [-1.2, -3.2, 1.2], [-0.4, -5.8, 1.2], [1.8, -7.9, 1.2]] },
    { "points": [[-1.4, 0.0, 1.1], [-3.2, -0.2, 1.0], [-6.2, 0.4, 1.0]] },
    { "points": [[-0.9, -3.8, 1.0], [-3.4, -5.4, 1.0], [-6.0, -6.8, 1.0]] },
    { "points": [[1.2, 1.2, 1.0], [4.2, 0.4, 1.0], [6.4, -1.4, 1.0], [7.7, -2.6, 1.0]] },
    { "points": [[-6.0, -6.8, 0.8], [-8.0, -7.3, 0.7], [-10.2, -7.85, 0.7]] }
  ],
  "adit": { "x": -11.55, "z": -7.85, "w": 1.3, "h": 2.2, "outcrop": { "x0": -12.3, "x1": -11.0, "z0": -8.9, "z1": -6.85, "h": 2.9 } },
  "flint": { "x": -10.45, "z": -9.2, "yaw": 1.2 },
  "spawns": [{ "x": -9.0, "z": 9.7 }, { "x": -8.2, "z": 9.2 }, { "x": -9.6, "z": 9.0 }]
} /* layout:end */;

const L = FOREST_LAYOUT;

/** The woods' zones (which part of the wood a point is in: the Logbook's and the HUD's name for it). */
export function forestZoneAt(x: number, z: number): (typeof L.zones)[number] | null {
  return L.zones.find((zn) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) ?? null;
}

/** How close you stand to a tree to fell it (and the client's smart target: the nearest one within). */
export const TREE_REACH = 2.5;
/** A tree's trunk (you walk round it, stump or mature). */
const TRUNK = 0.42;

/** The twenty-six trees you can fell: their node ids, kinds and places, and the spot you fell from
 *  (a step toward the middle of the wood). */
export const FOREST_TREES = L.trees.map((t) => {
  const d = Math.hypot(t.x, t.z) || 1;
  return { ...t, kind: t.kind as TreeKind, tier: TREES[t.kind as TreeKind].tier, approachX: t.x - (t.x / d) * 1.05, approachZ: t.z - (t.z / d) * 1.05 };
});
export type ForestTree = (typeof FOREST_TREES)[number];
export const FOREST_TREE_AT = new Map(FOREST_TREES.map((t) => [t.id, t]));
/** The tree within reach of (x, z), the nearest one (null: none). */
export function treeNear(x: number, z: number, reach = TREE_REACH): ForestTree | null {
  let best: ForestTree | null = null;
  let d = reach;
  for (const t of FOREST_TREES) {
    const e = Math.hypot(t.x - x, t.z - z);
    if (e <= d) {
      d = e;
      best = t;
    }
  }
  return best;
}

// --- the river: a Catmull-Rom spline through `river.points` ([x, z, halfWidth], from off the north
// edge to off the east); build_forest.py digs and fills it from the very same function ---
const catmull = (p0: number, p1: number, p2: number, p3: number, u: number) => 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
/** The river's centre line sampled `per` times a span: [x, z, halfWidth] each. */
export function forestRiver(per = 6): [number, number, number][] {
  const P = L.river.points;
  const at = (k: number) => P[Math.max(0, Math.min(P.length - 1, k))];
  const out: [number, number, number][] = [];
  for (let i = 0; i < P.length - 1; i++) {
    for (let k = 0; k < per; k++) {
      const u = k / per;
      out.push([0, 1, 2].map((d) => catmull(at(i - 1)[d], at(i)[d], at(i + 1)[d], at(i + 2)[d], u)) as [number, number, number]);
    }
  }
  out.push([...P[P.length - 1]] as [number, number, number]);
  return out;
}

/** The river's fishing spots on the bank: where you stand (or the seat: a log or a rock to sit on,
 *  facing the water), where the float lands, and where you step up from. */
export const FOREST_FISHING = L.fishing.map((f, i) => {
  const seatKind = (f as { seat?: string }).seat;
  const seat = seatKind ? `seat_woods_${seatKind}` : "";
  const faced = (f as { face?: number[] }).face;
  const face = faced ? { x: faced[0], z: faced[1] } : { x: f.bobber.x - f.stand.x, z: f.bobber.z - f.stand.z };
  const d = Math.hypot(face.x, face.z) || 1;
  return { propId: `woods_fishing_${i + 1}`, seat, stand: f.stand, bobber: f.bobber, face: { x: face.x / d, z: face.z / d }, approach: { x: f.stand.x - (face.x / d) * 0.75, z: f.stand.z - (face.z / d) * 0.75 } };
});
/** The woods' fishing seats (the log and the rock on the bank): you sit facing the water, and fish
 *  (by hand, or AFK) from there. */
export const FOREST_SEATS = FOREST_FISHING.filter((f) => f.seat).map((f) => ({
  propId: f.seat,
  x: f.stand.x,
  z: f.stand.z,
  rotationY: Math.atan2(f.face.x, f.face.z),
  cushion: (f.seat === "seat_woods_rock" ? "boulder" : "log") as "boulder" | "log",
  approachX: f.approach.x,
  approachZ: f.approach.z,
}));
/** The woods' fishing spot a seat belongs to. */
export const woodsSpotOfSeat = (seat: string) => (seat ? FOREST_FISHING.find((f) => f.seat === seat)?.propId : undefined);
/** Where the Colossal Titan can sprout (a world event: one of these clearings). */
export const TITAN_SPOTS: Pt[] = L.titanSpots.map(([x, z]) => ({ x, z }));
/** The Titan's trunk, and where you fell it from (a step toward the middle of the wood). */
export const TITAN_TRUNK = 0.8;
export function titanApproach(p: Pt): Pt {
  const d = Math.hypot(p.x, p.z) || 1;
  return { x: p.x - (p.x / d) * 1.7, z: p.z - (p.z / d) * 1.7 };
}

/** Bramble the Bear behind his counter, and where you stand to trade with him. */
export const BRAMBLE = L.bramble;
export const BRAMBLE_FRONT: Pt = { x: L.counter.x, z: L.counter.z + L.counter.w / 2 + 0.7 };
export const BRAMBLE_REACH = 1.9;
/** The advanced workbench right beside Bramble's counter, and where you stand at it (on the trail,
 *  as at the counter). */
export const FOREST_WORKBENCH = L.workbench;
export const FOREST_WORKBENCH_FRONT: Pt = { x: L.workbench.x, z: L.workbench.z + L.workbench.w / 2 + 0.65 };
/** Finley the River Otter on his boulder by the lower river (facing the water: `yaw`), and where
 *  you stand to trade with him (behind him, off the end of the ridge's path). */
export const FINLEY = L.finley;
export const FINLEY_FRONT: Pt = { x: L.finley.x - Math.sin(L.finley.yaw) * 1.1, z: L.finley.z - Math.cos(L.finley.yaw) * 1.1 };
export const FINLEY_REACH = 1.9;
/** The songbirds on the vista pines' lower boughs (the side toward the middle of the wood): each
 *  perch's place, its height on the bough (the pine's lowest tier, as build_forest.py grows it) and
 *  the way the bird faces. They fly off when someone comes near, and back later; by day only. */
export const FOREST_BIRDS = L.birds.map(([px, pz], i) => {
  const pine = L.vista.find(([x, z]) => x === px && z === pz) ?? [px, pz, 1];
  const S = pine[2] * 1.55;
  const d = Math.hypot(px, pz) || 1;
  const r = 0.9 * 1.05 * S;
  return { id: i, x: px - (px / d) * r, z: pz - (pz / d) * r, y: 0.729 * S, yaw: Math.atan2(-px, -pz) };
});
/** The branch archway back to the campfire, and where you stand at it. */
export const WOODS_ARCHWAY = L.archway;
export const WOODS_ARCHWAY_FRONT: Pt = { x: L.archway.x, z: L.archway.z - 1.05 };
/** Where a traveller arrives from the campfire (just inside the archway). */
export const WOODS_ARRIVAL: Pt = L.arrival;
/** The old mine adit down to the Glimmering Caverns (set into its outcrop, facing into the wood),
 *  where you stand at it, and where a traveller back up from the caverns arrives. */
export const FOREST_ADIT = L.adit;
export const FOREST_ADIT_FRONT: Pt = { x: L.adit.x + 1.15, z: L.adit.z };
export const WOODS_FROM_CAVERNS: Pt = { x: L.adit.x + 1.5, z: L.adit.z + 0.2 };
/** Old Flint the Badger beside it (facing the path in: `yaw`), and where you stand to talk to him. */
export const OLD_FLINT = L.flint;
export const OLD_FLINT_FRONT: Pt = { x: L.flint.x + Math.sin(L.flint.yaw) * 1.0, z: L.flint.z + Math.cos(L.flint.yaw) * 1.0 };
export const OLD_FLINT_REACH = 1.9;
/** The deer and the rabbits: fed from the forage bag (a berry or a mushroom). */
export const FOREST_ANIMALS = L.animals.map((a) => ({ ...a, propId: `animal_${a.id}`, approachX: a.x + 0.95, approachZ: a.z + 0.25 }));
export const ANIMAL_REACH = 1.8;

export const FOREST_PROPS: PropSpec[] = [
  { propId: "woods_exit", x: L.archway.x, z: L.archway.z, kind: "archway", color: "#8a6a3f", defaultOn: true, approachX: WOODS_ARCHWAY_FRONT.x, approachZ: WOODS_ARCHWAY_FRONT.z },
  ...FOREST_TREES.map((t): PropSpec => ({ propId: `tree_${t.id}`, x: t.x, z: t.z, kind: "tree", color: "#4f7a3a", defaultOn: true, approachX: t.approachX, approachZ: t.approachZ })),
  ...FOREST_FISHING.map((f): PropSpec => ({ propId: f.propId, x: f.stand.x + 0.25, z: f.stand.z, kind: "fishing", color: "#7fb7d6", defaultOn: true, approachX: f.approach.x, approachZ: f.approach.z })),
  { propId: "bramble", x: L.bramble.x, z: L.bramble.z, kind: "ranger", color: "#7a4e2d", defaultOn: true, approachX: BRAMBLE_FRONT.x, approachZ: BRAMBLE_FRONT.z },
  { propId: "workbench_adv", x: L.workbench.x, z: L.workbench.z, kind: "workbench", color: "#c98b4f", defaultOn: true, approachX: FOREST_WORKBENCH_FRONT.x, approachZ: FOREST_WORKBENCH_FRONT.z },
  { propId: "finley", x: L.finley.x, z: L.finley.z, kind: "angler", color: "#8a5a34", defaultOn: true, approachX: FINLEY_FRONT.x, approachZ: FINLEY_FRONT.z },
  { propId: "woods_adit", x: L.adit.x + 0.5, z: L.adit.z, kind: "adit", color: "#6f5a3f", defaultOn: true, approachX: FOREST_ADIT_FRONT.x, approachZ: FOREST_ADIT_FRONT.z },
  { propId: "old_flint", x: L.flint.x, z: L.flint.z, kind: "miner", color: "#ffb347", defaultOn: true, approachX: OLD_FLINT_FRONT.x, approachZ: OLD_FLINT_FRONT.z },
  ...FOREST_ANIMALS.map((a): PropSpec => ({ propId: a.propId, x: a.x, z: a.z, kind: "animal", color: "#b88a5a", defaultOn: true, approachX: a.approachX, approachZ: a.approachZ })),
  // the clearings where a Colossal Titan can sprout: `on` only while one stands there
  ...TITAN_SPOTS.map((p, i): PropSpec => {
    const a = titanApproach(p);
    return { propId: `tree_titan_${i + 1}`, x: p.x, z: p.z, kind: "tree", color: "#e8a93a", defaultOn: false, approachX: a.x, approachZ: a.z };
  }),
];

/** The shrine's standing stones: a ring round the elderwood with a gap (SHRINE_GAP) toward the
 *  middle of the wood, where the way in is (the builder lays them out the same way). */
export const SHRINE_GAP = 0.26 * Math.PI;
export const SHRINE_STONES: Pt[] = (() => {
  const open = Math.atan2(-L.shrine.z, -L.shrine.x);
  const n = L.shrine.stones;
  return Array.from({ length: n }, (_, k) => {
    const a = open + SHRINE_GAP / 2 + (k / (n - 1)) * (2 * Math.PI - SHRINE_GAP);
    return { x: L.shrine.x + Math.cos(a) * L.shrine.r, z: L.shrine.z + Math.sin(a) * L.shrine.r };
  });
})();

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
export const FOREST_OBSTACLES: AABB[] = [
  // the trunks (felled or not: a stump is in the way too)
  ...FOREST_TREES.map((t) => around(t, TRUNK)),
  // the vista pines on the cliff edges
  ...L.vista.map(([x, z, s]) => around({ x, z }, 0.45 * s)),
  // the river: small boxes down its length, a little in from its banks (you walk to the water's edge)
  ...forestRiver(10).map(([x, z, w]) => around({ x, z }, Math.max(0.2, w - 0.22))),
  // the rocks in and by it, and the fishing seats (a log, a rock)
  ...L.river.rocks.map(([x, z, s]) => around({ x, z }, 0.4 * s)),
  ...FOREST_SEATS.map((st) => around(st, 0.2)),
  // Bramble's cabin, his counter and him behind it; the workbench beside it; Finley's boulder
  { minX: L.cabin.x - L.cabin.w / 2, maxX: L.cabin.x + L.cabin.w / 2, minZ: L.cabin.z - L.cabin.d / 2, maxZ: L.cabin.z + L.cabin.d / 2 },
  { minX: L.counter.x - L.counter.len / 2, maxX: L.counter.x + L.counter.len / 2, minZ: L.bramble.z - 0.35, maxZ: L.counter.z + L.counter.w / 2 },
  { minX: L.workbench.x - L.workbench.len / 2, maxX: L.workbench.x + L.workbench.len / 2, minZ: L.workbench.z - L.workbench.w / 2, maxZ: L.workbench.z + L.workbench.w / 2 },
  around(L.finley, 0.42),
  // the archway's posts either side of its opening
  around({ x: L.archway.x - L.archway.w / 2 - 0.1, z: L.archway.z }, 0.18),
  around({ x: L.archway.x + L.archway.w / 2 + 0.1, z: L.archway.z }, 0.18),
  // the shrine's standing stones (the ring round the elderwood, open toward the middle of the wood)
  ...SHRINE_STONES.map((p) => around(p, 0.22)),
  // the deer and the rabbits
  ...L.animals.map((a) => around(a, 0.35)),
  // the adit's mossy outcrop on the western cliff, and Old Flint beside it
  { minX: L.adit.outcrop.x0, maxX: L.adit.outcrop.x1, minZ: L.adit.outcrop.z0, maxZ: L.adit.outcrop.z1 },
  around(L.flint, 0.35),
];
export const FOREST_SPAWNS: Pt[] = L.spawns;
