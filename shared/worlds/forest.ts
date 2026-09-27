import { TREES, type TreeKind } from "../chop";
import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";

// The Whispering Woods (the map "whispering_woods"): a 24 x 24 wood behind the Starlight Campfire's
// fence, reached only through the branch archway at the fence's west end, with a Day Trip Permit (one
// way in) or the Ranger's Badge (for good) from Buster. It shares the campfire's 24-minute day
// (shared/daynight.ts) and, like every world, the one room: walking through the archway is a trip,
// not a new connection.
//
//   The Border          the way in from the archway, meadow and three Soft Pines (T1)
//   The Birch Grove     the west, eight Silver Birches (T2), and the rabbits
//   The Cedar Ridge     the middle east, five Highland Cedars (T3) on their stony ridge
//   The Golden Glen     the back west, three Autumn Maples (T4) in gold leaves, and the deer
//   The Elderwood Shrine the back, one Whispering Elderwood (T5) inside a ring of mossy stones
//
// Round them: the rapids down the east edge (three fishing spots on the bank: the wild fish, the
// legendaries and mythics among them), Bramble the Bear's cabin at the front (him in front of it,
// facing out over his store counter) and his advanced workbench beside it, a splitting block for
// Firewood, and twenty-five vista pines along the back and side edges (not for felling). The layout below is plain JSON between the markers, read as-is by
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
    { "id": "border_1", "kind": "soft_pine", "x": -6.2, "z": 8.3 },
    { "id": "border_2", "kind": "soft_pine", "x": -3.0, "z": 9.5 },
    { "id": "border_3", "kind": "soft_pine", "x": 0.2, "z": 8.1 },
    { "id": "birch_1", "kind": "birch", "x": -10.0, "z": 3.9 },
    { "id": "birch_2", "kind": "birch", "x": -7.8, "z": 2.4 },
    { "id": "birch_3", "kind": "birch", "x": -10.2, "z": -0.2 },
    { "id": "birch_4", "kind": "birch", "x": -7.4, "z": -1.5 },
    { "id": "birch_5", "kind": "birch", "x": -4.9, "z": 1.3 },
    { "id": "birch_6", "kind": "birch", "x": -9.4, "z": -3.6 },
    { "id": "birch_7", "kind": "birch", "x": -6.4, "z": -4.5 },
    { "id": "birch_8", "kind": "birch", "x": -4.2, "z": -2.6 },
    { "id": "cedar_1", "kind": "cedar", "x": 3.0, "z": 3.1 },
    { "id": "cedar_2", "kind": "cedar", "x": 5.8, "z": 1.6 },
    { "id": "cedar_3", "kind": "cedar", "x": 2.6, "z": -0.8 },
    { "id": "cedar_4", "kind": "cedar", "x": 6.2, "z": -2.2 },
    { "id": "cedar_5", "kind": "cedar", "x": 3.9, "z": -4.0 },
    { "id": "maple_1", "kind": "maple", "x": -8.6, "z": -8.4 },
    { "id": "maple_2", "kind": "maple", "x": -5.6, "z": -9.8 },
    { "id": "maple_3", "kind": "maple", "x": -3.0, "z": -7.4 },
    { "id": "elder_1", "kind": "elderwood", "x": 3.2, "z": -9.0 }
  ],
  "shrine": { "x": 3.2, "z": -9.0, "r": 1.9, "stones": 7 },
  "rapids": { "x0": 9.3, "x1": 12, "water": -0.2, "rocks": [[10.2, -9.5, 0.5], [11.1, -6.8, 0.45], [10.0, -4.4, 0.4], [11.2, -1.2, 0.55], [10.4, 2.0, 0.4], [11.0, 5.2, 0.5], [10.1, 8.4, 0.45], [11.3, 10.6, 0.4]] },
  "fishing": [
    { "stand": { "x": 8.55, "z": -3.2 }, "bobber": { "x": 10.4, "z": -3.2 } },
    { "stand": { "x": 8.55, "z": 0.6 }, "bobber": { "x": 10.5, "z": 0.6 } },
    { "stand": { "x": 8.55, "z": 4.2 }, "bobber": { "x": 10.4, "z": 4.2 } }
  ],
  "cabin": { "x": 6.2, "z": 6.9, "w": 3.6, "d": 2.5, "h": 2.6 },
  "counter": { "x": 6.2, "z": 9.35, "len": 2.0, "w": 0.55, "top": 0.7 },
  "bramble": { "x": 6.2, "z": 8.65, "yaw": 0 },
  "workbench": { "x": 1.4, "z": 9.4, "len": 1.6, "w": 0.72, "top": 0.9 },
  "splitblock": { "x": -0.9, "z": 5.6 },
  "animals": [
    { "id": "deer", "kind": "deer", "x": -1.8, "z": -4.9 },
    { "id": "rabbits", "kind": "rabbits", "x": -2.6, "z": 5.4 }
  ],
  "vista": [
    [-11.2, -11.3, 1.2], [-9.3, -11.4, 1.0], [-7.4, -11.3, 1.15], [-5.5, -11.4, 0.95], [-3.6, -11.3, 1.1], [-1.7, -11.4, 1.0], [0.2, -11.4, 1.2],
    [2.0, -11.5, 0.95], [5.1, -11.4, 1.1], [7.0, -11.3, 1.0], [8.6, -11.5, 1.05],
    [-11.4, -9.2, 1.1], [-11.5, -7.1, 0.95], [-11.3, -5.0, 1.15], [-11.4, -2.8, 1.0], [-11.5, -0.6, 1.1], [-11.3, 1.6, 0.95], [-11.4, 5.8, 1.05], [-11.5, 7.9, 1.0],
    [-11.3, 10.9, 0.9], [-11.4, 3.7, 1.0], [3.6, -11.6, 1.0], [-10.2, -10.2, 0.95], [11.7, -10.8, 1.1], [11.8, -8.2, 0.95]
  ],
  "paths": [
    { "points": [[-9.0, 10.8, 1.6], [-7.4, 8.9, 1.5], [-4.6, 7.1, 1.4], [-1.6, 6.4, 1.4], [1.6, 6.2, 1.4], [3.8, 9.0, 1.3], [5.4, 10.4, 1.3]] },
    { "points": [[-1.6, 6.4, 1.3], [-1.9, 3.2, 1.2], [-1.4, 0.0, 1.2], [-1.2, -3.2, 1.2], [-0.4, -5.8, 1.2], [1.8, -7.9, 1.2]] },
    { "points": [[-1.4, 0.0, 1.1], [-3.2, -0.2, 1.0], [-6.2, 0.4, 1.0]] },
    { "points": [[-0.9, -3.8, 1.0], [-3.4, -5.4, 1.0], [-6.0, -6.8, 1.0]] },
    { "points": [[1.2, 1.2, 1.0], [4.4, 0.4, 1.0], [7.6, 0.6, 1.0]] }
  ],
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

/** The twenty trees you can fell: their node ids, kinds and places, and the spot you fell from
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

/** The rapids' fishing spots on the bank: where you stand and where the bobber lands. */
export const FOREST_FISHING = L.fishing.map((f, i) => ({ propId: `woods_fishing_${i + 1}`, stand: f.stand, bobber: f.bobber, approach: { x: f.stand.x - 0.55, z: f.stand.z } }));

/** Bramble the Bear behind his counter, and where you stand to trade with him. */
export const BRAMBLE = L.bramble;
export const BRAMBLE_FRONT: Pt = { x: L.counter.x, z: L.counter.z + L.counter.w / 2 + 0.7 };
export const BRAMBLE_REACH = 1.9;
/** The advanced workbench beside the cabin, and where you stand at it. */
export const FOREST_WORKBENCH = L.workbench;
export const FOREST_WORKBENCH_FRONT: Pt = { x: L.workbench.x, z: L.workbench.z - L.workbench.w / 2 - 0.65 };
/** The splitting block (logs into Firewood), and its front. */
export const FOREST_SPLITBLOCK = L.splitblock;
export const FOREST_SPLITBLOCK_FRONT: Pt = { x: L.splitblock.x, z: L.splitblock.z - 0.85 };
/** The branch archway back to the campfire, and where you stand at it. */
export const WOODS_ARCHWAY = L.archway;
export const WOODS_ARCHWAY_FRONT: Pt = { x: L.archway.x, z: L.archway.z - 1.05 };
/** Where a traveller arrives from the campfire (just inside the archway). */
export const WOODS_ARRIVAL: Pt = L.arrival;
/** The deer and the rabbits: fed from the forage bag (a berry or a mushroom). */
export const FOREST_ANIMALS = L.animals.map((a) => ({ ...a, propId: `animal_${a.id}`, approachX: a.x + 0.95, approachZ: a.z + 0.25 }));
export const ANIMAL_REACH = 1.8;

export const FOREST_PROPS: PropSpec[] = [
  { propId: "woods_exit", x: L.archway.x, z: L.archway.z, kind: "archway", color: "#8a6a3f", defaultOn: true, approachX: WOODS_ARCHWAY_FRONT.x, approachZ: WOODS_ARCHWAY_FRONT.z },
  ...FOREST_TREES.map((t): PropSpec => ({ propId: `tree_${t.id}`, x: t.x, z: t.z, kind: "tree", color: "#4f7a3a", defaultOn: true, approachX: t.approachX, approachZ: t.approachZ })),
  ...FOREST_FISHING.map((f): PropSpec => ({ propId: f.propId, x: f.stand.x + 0.25, z: f.stand.z, kind: "fishing", color: "#7fb7d6", defaultOn: true, approachX: f.approach.x, approachZ: f.approach.z })),
  { propId: "bramble", x: L.bramble.x, z: L.bramble.z, kind: "ranger", color: "#7a4e2d", defaultOn: true, approachX: BRAMBLE_FRONT.x, approachZ: BRAMBLE_FRONT.z },
  { propId: "workbench_adv", x: L.workbench.x, z: L.workbench.z, kind: "workbench", color: "#c98b4f", defaultOn: true, approachX: FOREST_WORKBENCH_FRONT.x, approachZ: FOREST_WORKBENCH_FRONT.z },
  { propId: "splitblock_woods", x: L.splitblock.x, z: L.splitblock.z, kind: "splitblock", color: "#a8743d", defaultOn: true, approachX: FOREST_SPLITBLOCK_FRONT.x, approachZ: FOREST_SPLITBLOCK_FRONT.z },
  ...FOREST_ANIMALS.map((a): PropSpec => ({ propId: a.propId, x: a.x, z: a.z, kind: "animal", color: "#b88a5a", defaultOn: true, approachX: a.approachX, approachZ: a.approachZ })),
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
  // the rapids, bank to edge
  { minX: L.rapids.x0, maxX: L.half + 1, minZ: -L.half - 1, maxZ: L.half + 1 },
  // Bramble's cabin, his counter and him behind it; the workbench, the splitting block
  { minX: L.cabin.x - L.cabin.w / 2, maxX: L.cabin.x + L.cabin.w / 2, minZ: L.cabin.z - L.cabin.d / 2, maxZ: L.cabin.z + L.cabin.d / 2 },
  { minX: L.counter.x - L.counter.len / 2, maxX: L.counter.x + L.counter.len / 2, minZ: L.bramble.z - 0.35, maxZ: L.counter.z + L.counter.w / 2 },
  { minX: L.workbench.x - L.workbench.len / 2, maxX: L.workbench.x + L.workbench.len / 2, minZ: L.workbench.z - L.workbench.w / 2, maxZ: L.workbench.z + L.workbench.w / 2 },
  around(L.splitblock, 0.35),
  // the archway's posts either side of its opening
  around({ x: L.archway.x - L.archway.w / 2 - 0.1, z: L.archway.z }, 0.18),
  around({ x: L.archway.x + L.archway.w / 2 + 0.1, z: L.archway.z }, 0.18),
  // the shrine's standing stones (the ring round the elderwood, open toward the middle of the wood)
  ...SHRINE_STONES.map((p) => around(p, 0.22)),
  // the deer and the rabbits
  ...L.animals.map((a) => around(a, 0.35)),
];
export const FOREST_SPAWNS: Pt[] = L.spawns;
