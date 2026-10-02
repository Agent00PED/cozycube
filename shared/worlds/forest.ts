import { TREES, type TreeKind } from "../chop";
import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";
import { gridData, gridY, makeGrid, moundAt, smoothstep } from "../terrain";

// The Whispering Woods (the map "whispering_woods", docs/woods-design.md): a 34 x 34 hillside wood
// behind the Starlight Campfire's fence: the ground rises from the river along the east (-0.2 m) to
// the Mine Ledge in the north-west (3.2 m), each tier's trees further in and higher up than the last
// (`terrain`: wide steps added one on another: forestLand; the river's channel cut in: forestHeight;
// FOREST_GRID for the builder and for feet: forestFloorY). The groves stand as they did, the whole
// constellation moved to the south and west of the bigger island, so every walk between trees and
// to Bramble is as long as it was (the simulator holds the income); the Golden Glen and the shrine
// moved up the hill. Once a 24 x 24 wood behind the Starlight Campfire's
// fence, reached only through the branch archway at the fence's west end, with a Day Trip Permit (one
// way in) or the Ranger's Badge (for good) from Buster. It shares the campfire's 24-minute day
// (shared/daynight.ts) and, like every world, the one room: walking through the archway is a trip,
// not a new connection.
//
// The wood is full (patch 0.7.55): a grove of each kind, its trees 2.7 to 4 m apart (no tight clumps,
// no rows), the middle wooded too, the great tree at the top of the hill over them all; what is not
// a grove is filled with things that are not felled (the dressing's small pines, shrubs, boulders).
//
//   The Border          the way in from the archway: meadow and four Soft Pines (T1), and the trail
//                       east along the south to Bramble's. No trail is drawn (`formerPaths` keeps
//                       the courses last drawn, read by nothing) but one faint way in to Bramble's
//                       counter (`paths`: a few metres, fading in from nothing: `s`, `fade`)
//   The Birch Grove     the west, eleven Silver Birches (T2) and the rabbits
//   The Heart Glade     the middle: the trails' crossroads and a small clearing where a Colossal
//                       can rise
//   The Cedar Ridge     the middle and the east, seven Highland Cedars (T3), each far enough in
//                       front of the shrine that it hides none of it
//   The Golden Glen     the north-west, up the hill: three Autumn Maples (T4) in gold leaves
//   The Elderwood Shrine the top of the hill, on a mound of its own: the one Whispering Elderwood
//                       (T5), twice a birch's height, in a ring of nine standing stones whose gate
//                       opens toward the glade. Nothing tall stands between it and the camera.
//   The Hidden Hollow   the Mine Ledge in the north-west corner: the adit, screened from the camera
//                       by three spruces; no trail leads to it, and the way in is round their
//                       north end
//   The Old Growth      the north-east: tall pines and ancient cedars (never felled)
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
  "half": 17,
  "core": { "x": -2, "z": 5 },
  "terrain": {
    "step": 0.4,
    "bank": 0.5,
    "steps": [
      {"id": "lower", "top": 1.1, "lobes": [{"x": -5, "z": -12, "flat": 13.5, "skirt": 6}]},
      {"id": "upper", "top": 1.0, "lobes": [{"x": -3, "z": -11.5, "flat": 9.3, "skirt": 5.2}, {"x": -12, "z": -12.5, "flat": 7.2, "skirt": 5.2}]},
      {"id": "glen", "top": 0.7, "lobes": [{"x": -12.5, "z": -12.5, "flat": 4.6, "skirt": 2.6}]},
      {"id": "crown", "top": 0.5, "lobes": [{"x": -2.2, "z": -9.2, "flat": 3.7, "skirt": 3.0}]},
      {"id": "hummocks", "top": 0.22, "lobes": [{"x": -3.2, "z": 9.9, "flat": 0.4, "skirt": 1.8}, {"x": 3.5, "z": 10.3, "flat": 0.4, "skirt": 1.7}, {"x": -13.6, "z": 7.8, "flat": 0.3, "skirt": 1.6}, {"x": 5.8, "z": 3.8, "flat": 0.3, "skirt": 1.6}, {"x": -7.4, "z": 13.4, "flat": 0.3, "skirt": 1.5}, {"x": 9.4, "z": -0.2, "flat": 0.3, "skirt": 1.4}]}
    ]
  },
  "zones": [
    { "id": "border", "name": "The Border", "x": -6, "z": 14, "r": 6, "floor": "meadow" },
    { "id": "birch", "name": "The Birch Grove", "x": -9.8, "z": 5.0, "r": 6.0, "floor": "birch" },
    { "id": "glade", "name": "The Heart Glade", "x": -1.0, "z": 2.4, "r": 2.8, "floor": "meadow" },
    { "id": "cedar", "name": "The Cedar Ridge", "x": 4.8, "z": 2.4, "r": 5.0, "floor": "ridge" },
    { "id": "post", "name": "Bramble's Post", "x": 7, "z": 12.5, "r": 4, "floor": "meadow" },
    { "id": "glen", "name": "The Golden Glen", "x": -10.0, "z": -3.8, "r": 4.4, "floor": "glen" },
    { "id": "shrine", "name": "The Elderwood Shrine", "x": -2.2, "z": -9.2, "r": 5.4, "floor": "shrine" },
    { "id": "ledge", "name": "The Hidden Hollow", "x": -14.2, "z": -10.8, "r": 3.2, "floor": "needles" },
    { "id": "oldgrowth", "name": "The Old Growth", "x": 6.4, "z": -10.6, "r": 5.6, "floor": "needles" }
  ],
  "archway": { "x": -11.0, "z": 16.5, "w": 1.9, "h": 2.7 },
  "arrival": { "x": -11.0, "z": 14.7 },
  "trees": [
    { "id": "border_1", "kind": "soft_pine", "x": -8.3, "z": 15.3 },
    { "id": "border_2", "kind": "soft_pine", "x": -5.0, "z": 14.5 },
    { "id": "border_3", "kind": "soft_pine", "x": -1.8, "z": 13.1 },
    { "id": "border_4", "kind": "soft_pine", "x": -12.0, "z": 12.2 },
    { "id": "birch_1", "kind": "birch", "x": -13.0, "z": 8.6 },
    { "id": "birch_2", "kind": "birch", "x": -10.2, "z": 9.8 },
    { "id": "birch_3", "kind": "birch", "x": -12.4, "z": 5.2 },
    { "id": "birch_4", "kind": "birch", "x": -11.6, "z": 2.4 },
    { "id": "birch_5", "kind": "birch", "x": -13.4, "z": 0.8 },
    { "id": "birch_6", "kind": "birch", "x": -7.4, "z": 9.0 },
    { "id": "birch_7", "kind": "birch", "x": -6.4, "z": 6.4 },
    { "id": "birch_8", "kind": "birch", "x": -9.9, "z": 6.4 },
    { "id": "cedar_1", "kind": "cedar", "x": 1.0, "z": 4.0 },
    { "id": "cedar_2", "kind": "cedar", "x": 3.6, "z": 1.4 },
    { "id": "cedar_3", "kind": "cedar", "x": 6.2, "z": 0.4 },
    { "id": "cedar_4", "kind": "cedar", "x": 5.4, "z": 3.4 },
    { "id": "cedar_5", "kind": "cedar", "x": 8.4, "z": -1.6 },
    { "id": "maple_1", "kind": "maple", "x": -12.4, "z": -1.4 },
    { "id": "maple_2", "kind": "maple", "x": -8.8, "z": -3.8 },
    { "id": "maple_3", "kind": "maple", "x": -11.4, "z": -6.6 },
    { "id": "elder_1", "kind": "elderwood", "x": -2.2, "z": -9.2 },
    { "id": "birch_9", "kind": "birch", "x": -7.4, "z": 2.8 },
    { "id": "birch_10", "kind": "birch", "x": -5.8, "z": 1.4 },
    { "id": "birch_11", "kind": "birch", "x": -8.2, "z": 0.2 },
    { "id": "cedar_6", "kind": "cedar", "x": 1.6, "z": 8.0 },
    { "id": "cedar_7", "kind": "cedar", "x": 4.2, "z": 8.8 }
  ],

  "shrine": { "x": -2.2, "z": -9.2, "r": 3.3, "stones": 9 },
  "river": {
    "points": [[13.1, -18.0, 1.0], [13.3, -15.2, 1.1], [13.4, -12.6, 1.2], [13.7, -9.6, 0.9], [13.4, -6.5, 1.0], [13.2, -3.5, 1.15], [12.6, -0.5, 1.3], [12.2, 2.5, 1.9], [12.6, 5.0, 2.2], [13.2, 7.5, 1.7], [13.6, 10.5, 1.2], [13.2, 13.5, 1.1], [12.8, 16.0, 1.0], [12.6, 18.6, 1.0]],
    "water": -0.2,
    "depth": 0.55,
    "rocks": [[13.2, -10.9, 0.45], [13.9, -8.0, 0.4], [13.6, -5.0, 0.5], [12.5, -1.6, 0.45], [13.9, 1.2, 0.4], [14.3, 8.6, 0.45], [12.7, 12.0, 0.4]]
  },
  "dressing": {
    "boulders": [
      [6.4, -11.2, 0.9], [4.6, -13.6, 0.75], [10.6, -13.6, 0.8],
      [-14.9, -8.4, 1.0], [-15.6, -14.6, 1.1], [-13.0, -14.6, 0.8], [-15.0, 3.4, 0.6], [-14.2, 11.4, 0.7], [9.6, 15.2, 0.6],
      [-6.0, -8.2, 0.6], [5.6, -2.4, 0.7], [-2.0, 8.8, 0.5], [-8.6, -11.6, 0.7]
    ],
    "greatTrees": [
      { "x": 5.0, "z": -11.8, "s": 1.3, "kind": "cedar" },
      { "x": 7.6, "z": -12.2, "s": 1.3, "kind": "pine" },
      { "x": 3.4, "z": -13.2, "s": 1.3, "kind": "pine" },
      { "x": 9.9, "z": -14.8, "s": 1.25, "kind": "pine" },
      { "x": 6.2, "z": -14.5, "s": 1.3, "kind": "cedar" },
      { "x": 10.7, "z": -12.9, "s": 1.2, "kind": "pine" },
      { "x": 2.4, "z": -14.6, "s": 1.1, "kind": "pine" },
      { "x": 8.6, "z": -13.2, "s": 1.25, "kind": "cedar" },
      { "x": 10.2, "z": -11.0, "s": 1.0, "kind": "pine" },
      { "x": -13.8, "z": -10.9, "s": 1.35, "kind": "spruce" },
      { "x": -14.6, "z": -9.7, "s": 1.3, "kind": "spruce" },
      { "x": -12.4, "z": -9.2, "s": 1.2, "kind": "spruce" },
      { "x": -9.2, "z": -9.8, "s": 1.0, "kind": "pine" },
      { "x": -6.8, "z": -12.9, "s": 1.15, "kind": "spruce" },
      { "x": -0.6, "z": 9.6, "s": 0.7, "kind": "pine" },
      { "x": -14.6, "z": 14.4, "s": 0.75, "kind": "pine" },
      { "x": 7.3, "z": 2.6, "s": 0.65, "kind": "pine" }
    ],
    "birches": [],
    "shrubs": [[10.6, 12.6, 0.8], [10.4, 14.9, 0.7], [8.4, 1.6, 0.7], [3.0, 16.3, 0.8], [1.4, 16.4, 0.7], [4.8, 16.4, 0.75], [-0.4, 16.3, 0.7], [6.2, 16.3, 0.7], [10.0, 9.4, 0.7],
      [0.6, -3.2, 0.7], [2.6, -4.4, 0.75], [4.6, -5.6, 0.7], [1.2, -0.6, 0.65], [-5.4, -3.2, 0.7], [-1.2, -1.6, 0.7], [2.8, 10.6, 0.7], [-6.0, 10.2, 0.7], [-10.2, 12.4, 0.7],
      [6.6, -3.0, 0.7], [-8.4, -8.2, 0.75], [0.4, -13.6, 0.7], [-14.4, -1.6, 0.7], [-14.6, 8.8, 0.7]],
    "lanternPosts": [[-4.6, 9.6], [-4.4, 0.4], [9.2, 6.6], [6.6, 14.6]],
    "fallen": [
      { "x": -13.6, "z": 6.4, "yaw": 0.2, "len": 1.8 },
      { "x": 3.6, "z": -11.4, "yaw": 2.3, "len": 1.7 },
      { "x": 1.8, "z": -2.6, "yaw": 0.9, "len": 1.6 }
    ],
    "stumps": [[10.4, 9.6]],
    "snags": [[-15.9, -9.0, 3.4], [15.9, -3.2, 2.8], [-16.1, 13.6, 2.6], [1.5, -16.2, 3.6]]
  },
  "places": {
    "lookout": { "x": 8.9, "z": -8.7, "face": [0.9, -0.44] },
    "camp": { "x": 5.8, "z": -8.0, "r": 1.1, "leanTo": { "x": 4.6, "z": -7.9 }, "logs": [0, 100] },
    "jetty": { "x0": 10.0, "x1": 11.5, "z": 3.8, "w": 1.1 },
    "rodRack": { "x": 9.9, "z": 6.7 },
    "nets": { "x": 10.2, "z": 7.6, "len": 1.3 },
    "hives": [[9.5, 8.2], [10.1, 8.3], [10.7, 8.2]],
    "patch": { "x": 10.8, "z": 11.0, "w": 1.6, "d": 1.6 },
    "wheelbarrow": { "x": 11.6, "z": 12.5 },
    "washing": { "a": [9.8, 15.9], "b": [11.5, 15.7] },
    "ropeSwing": { "tree": [11.5, 13.4], "x": 11.95, "z": 14.1, "branch": 2.5 },
    "timber": { "x": 4.4, "z": 15.3, "w": 1.6, "d": 0.8 }
  },
  "life": {
    "owl": { "tree": [7.6, -12.2] },
    "kingfisher": { "x": 10.55, "z": 1.3, "y": 0.72 },
    "shafts": [[5.9, -9.4, 0.8], [7.8, -10.1, 0.75], [4.0, -8.9, 0.7], [6.7, -7.4, 0.8], [9.7, -9.7, 0.7], [3.0, -11.2, 0.65]]
  },
  "fishing": [
    { "stand": { "x": 11.55, "z": -2.3 }, "bobber": { "x": 12.9, "z": -2.6 } },
    { "stand": { "x": 12.0, "z": -6.2 }, "bobber": { "x": 13.3, "z": -6.6 }, "seat": "log", "face": [0.9, -0.3] },
    { "stand": { "x": 11.85, "z": -11.9 }, "bobber": { "x": 13.2, "z": -12.4 }, "seat": "rock", "face": [0.9, -0.35] },
    { "stand": { "x": 9.95, "z": 2.4 }, "bobber": { "x": 11.4, "z": 2.5 } }
  ],
  "cabin": { "x": 7.85, "z": 10.35, "w": 3.2, "d": 2.4, "h": 2.6 },
  "counter": { "x": 7.85, "z": 12.7, "len": 2.0, "w": 0.55, "top": 0.7 },
  "bramble": { "x": 7.85, "z": 12.0, "yaw": 0 },
  "workbench": { "x": 5.45, "z": 12.75, "len": 1.6, "w": 0.72, "top": 0.9 },
  "finley": { "x": 10.0, "z": 5.3, "yaw": 1.75 },
  "birds": [[-16.2, 6.6], [-16.2, -4.6], [-13.2, -16.2], [2.6, -16.2], [5.8, -13.6]],
  "titanSpots": [[-13.6, -4.0], [-0.6, 1.0], [8.8, -4.6]],
  "animals": [
    { "id": "deer", "kind": "deer", "x": -0.6, "z": 3.2 },
    { "id": "rabbits", "kind": "rabbits", "x": -11.2, "z": 7.4 }
  ],
  "vista": [
    [-15.9, -16.3, 1.3], [-13.2, -16.2, 1.0], [-11.4, -15.7, 0.75], [-9.8, -16.4, 1.2], [-6.9, -16.3, 0.85], [-5.6, -15.8, 1.25], [-2.6, -16.4, 0.9], [-0.9, -16.1, 1.3],
    [2.6, -16.2, 0.95], [4.4, -16.4, 1.25], [8.4, -16.3, 0.8], [10.9, -16.3, 1.1], [-16.2, 15.2, 0.95],
    [-16.4, -7.9, 0.8], [-16.2, -4.6, 1.15], [-15.7, -3.2, 0.75], [-16.3, 0.3, 1.25], [-16.4, 2.2, 0.85], [-16.2, 6.6, 1.05], [-15.8, 8.0, 0.8], [-16.4, 11.9, 1.2],
    [-16.1, -15.0, 1.1], [5.8, -13.6, 1.0], [-14.4, -7.4, 1.0]
  ],
  "paths": [
    { "s": 0.8, "fade": 3.2, "points": [[1.4, 14.5, 0.7], [3.2, 14.45, 0.85], [4.8, 14.2, 0.95], [6.4, 13.9, 1.05], [7.85, 13.65, 1.5]] }
  ],
  "formerPaths": [
    { "points": [[-11.0, 15.8, 1.3], [-9.4, 13.9, 1.3], [-6.6, 12.5, 1.3], [-3.6, 12.1, 1.3], [-0.2, 12.5, 1.3], [3.0, 13.3, 1.3], [5.6, 13.85, 1.3], [7.85, 14.0, 1.3]] },
    { "points": [[-3.6, 12.1, 1.15], [-3.9, 8.2, 1.15], [-3.5, 5.0, 1.15], [-3.2, 1.8, 1.15], [-3.0, -1.2, 1.15], [-2.6, -3.4, 1.15], [-2.4, -5.3, 1.15]] },
    { "points": [[-8.4, 13.3, 1.0], [-9.0, 11.0, 1.0], [-8.8, 8.8, 1.0], [-8.1, 6.9, 1.0], [-8.0, 5.0, 1.0], [-9.2, 3.2, 1.0], [-9.9, 1.2, 1.0], [-10.3, -0.8, 1.0], [-10.4, -2.8, 1.0], [-10.0, -4.8, 1.0], [-8.8, -6.2, 1.0], [-7.0, -6.4, 1.0], [-5.4, -5.7, 1.0], [-3.8, -4.7, 1.0], [-2.7, -4.1, 1.0]] },
    { "points": [[-3.5, 6.0, 1.0], [-0.8, 6.1, 1.0], [2.2, 5.5, 1.0], [5.6, 5.2, 1.0], [8.4, 5.5, 1.1]] },
    { "points": [[8.6, 5.0, 0.95], [9.8, 1.6, 0.95], [10.7, -2.0, 0.95], [11.1, -6.0, 0.95], [11.2, -10.2, 0.95]] },
    { "points": [[-1.8, -4.7, 0.95], [0.6, -5.2, 0.95], [2.3, -6.7, 0.95], [3.4, -8.7, 0.95], [5.0, -9.8, 0.95], [7.0, -10.3, 0.95], [9.2, -10.1, 0.95], [11.0, -10.2, 0.95]] }
  ],
  "adit": { "x": -16.55, "z": -11.5, "w": 1.3, "h": 2.2, "outcrop": { "x0": -17.3, "x1": -16.0, "z0": -13.6, "z1": -9.4, "h": 2.9 }, "alcove": { "depth": 1.5, "half": 1.2 } },
  "flint": { "x": -15.62, "z": -12.37, "yaw": 1.2646 },
  "spawns": [{ "x": -11.0, "z": 14.7 }, { "x": -10.2, "z": 14.2 }, { "x": -11.6, "z": 14.0 }]
} /* layout:end */;

const L = FOREST_LAYOUT;

/** The woods' zones (which part of the wood a point is in: the Logbook's and the HUD's name for it):
 *  each a round patch; where two overlap, the one whose middle is nearer. */
export function forestZoneAt(x: number, z: number): (typeof L.zones)[number] | null {
  let best: (typeof L.zones)[number] | null = null;
  let score = 1;
  for (const zn of L.zones) {
    const d = Math.hypot(x - zn.x, z - zn.z) / zn.r;
    if (d < score) (score = d), (best = zn);
  }
  return best;
}

/** How close you stand to a tree to fell it (and the client's smart target: the nearest one within). */
export const TREE_REACH = 2.5;
/** A tree's trunk (you walk round it, stump or mature): the Elderwood's is a great one. */
const TRUNK = 0.42;
const ELDER_TRUNK = 1.0;
const trunkOf = (kind: string) => (kind === "elderwood" ? ELDER_TRUNK : TRUNK);

/** The twenty-six trees you can fell: their node ids, kinds and places, and the spot you fell from
 *  (a step toward the middle of the wood, `core`). */
export const FOREST_TREES = L.trees.map((t) => {
  const d = Math.hypot(t.x - L.core.x, t.z - L.core.z) || 1;
  return { ...t, kind: t.kind as TreeKind, tier: TREES[t.kind as TreeKind].tier, approachX: t.x - ((t.x - L.core.x) / d) * (trunkOf(t.kind) + 0.63), approachZ: t.z - ((t.z - L.core.z) / d) * (trunkOf(t.kind) + 0.63) };
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
/** A spline through `P` ([x, z, halfWidth] each), sampled `per` times a span. */
function splineOf(P: readonly (readonly number[])[], per: number): [number, number, number][] {
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
/** The river's centre line sampled `per` times a span: [x, z, halfWidth] each. */
export const forestRiver = (per = 6) => splineOf(L.river.points, per);
// --- the ground (shared/terrain.ts) ----------------------------------------------------------------
//
// A hillside, all of it walked: wide steps added one on another (the lower and the upper hill, the
// Glen's shelf, the shrine's crown), each one or more round lobes at one height with a skirt gentle
// enough to walk, and no two steps' skirts meeting where their slopes would add past the limit
// (`check-layout` measures it).

const RIVER_LINE = forestRiver(10);
/** How far (x, z) is from the river's centre line, and the river's half-width there. */
export function forestRiverAt(x: number, z: number): { d: number; w: number } {
  let best = Infinity;
  let w = 0;
  for (let i = 0; i + 1 < RIVER_LINE.length; i++) {
    const [ax, az, aw] = RIVER_LINE[i];
    const [bx, bz, bw] = RIVER_LINE[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) (best = d), (w = aw + (bw - aw) * t);
  }
  return { d: best, w };
}

/** The ground's height at (x, z), the river's channel not cut in: where things stand. */
export function forestLand(x: number, z: number): number {
  let h = 0;
  for (const st of L.terrain.steps) {
    // (a step's lobes are one level: the higher of them at any point)
    let top = 0;
    for (const lobe of st.lobes) top = Math.max(top, moundAt({ ...lobe, top: st.top }, x, z));
    h += top;
  }
  return h;
}

/** The ground as drawn: forestLand with the river's channel cut down to its bed between its banks. */
export function forestHeight(x: number, z: number): number {
  const land = forestLand(x, z);
  const r = forestRiverAt(x, z);
  const inside = r.w - r.d;
  if (inside <= 0) return land;
  return land + (-L.river.depth - land) * smoothstep(0, L.terrain.bank, inside);
}

/** The ground's grid: the builder models the ground from it, feet and clicks read its triangles. */
export const FOREST_GRID = makeGrid(L.half, L.terrain.step, forestHeight, forestLand);
/** Where feet go at (x, z): the drawn ground. */
export const forestFloorY = (x: number, z: number): number => gridY(FOREST_GRID, FOREST_GRID.ground, x, z);
/** The grid for the builder (scripts/forest-terrain.ts writes it to scripts/blender/data/). */
export const forestTerrainData = () => gridData(FOREST_GRID);

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
// --- the places to stop (docs/maps-fill-plan.md part 3; no coins in any) ---
const PL = L.places;
const unitOf = (x: number, z: number) => {
  const d = Math.hypot(x, z) || 1;
  return { x: x / d, z: z / d };
};
/** A seat at one of the woods' places: a cushion, a style, and where you step up from. */
export interface ForestPlaceSeat {
  propId: string;
  x: number;
  z: number;
  rotationY: number;
  cushion: "picnicBench" | "log" | "boulder" | "dock" | "swing";
  style: "wood" | "log" | "dock";
  approachX: number;
  approachZ: number;
}
/** The Ranger's Lookout: a bench for two on the hillside above the river, looking out at the falls. */
export const LOOKOUT = (() => {
  const face = unitOf(PL.lookout.face[0], PL.lookout.face[1]);
  return { x: PL.lookout.x, z: PL.lookout.z, face, side: { x: -face.z, z: face.x }, yaw: Math.atan2(face.x, face.z) };
})();
/** The cold camp in the Old Growth: a lean-to, a ring of stones, two log seats facing it (log
 *  seats: the guitar is played from them). */
export const WOODS_CAMP = {
  ...PL.camp,
  logs: PL.camp.logs.map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: PL.camp.x + Math.cos(a) * PL.camp.r, z: PL.camp.z + Math.sin(a) * PL.camp.r, along: { x: -Math.sin(a), z: Math.cos(a) } };
  }),
};
/** The rope swing by Bramble's garden: its plank hangs from a leaning tree's branch out over the
 *  bank and sways toward the river (+x); `branch`: the branch's height over the ground there. */
export const ROPE_SWING = { ...PL.ropeSwing, propId: "seat_woods_ropeswing" };
export const FOREST_PLACE_SEATS: ForestPlaceSeat[] = [
  ...([-1, 1] as const).map((s, k): ForestPlaceSeat => {
    const x = LOOKOUT.x + LOOKOUT.side.x * s * 0.33;
    const z = LOOKOUT.z + LOOKOUT.side.z * s * 0.33;
    return { propId: `seat_woods_lookout_0${k + 1}`, x, z, rotationY: LOOKOUT.yaw, cushion: "picnicBench", style: "wood", approachX: x + LOOKOUT.face.x * 0.75, approachZ: z + LOOKOUT.face.z * 0.75 };
  }),
  ...WOODS_CAMP.logs.map((g, k): ForestPlaceSeat => {
    const out = unitOf(g.x - WOODS_CAMP.x, g.z - WOODS_CAMP.z);
    return { propId: `seat_woods_camp_0${k + 1}`, x: g.x, z: g.z, rotationY: Math.atan2(-out.x, -out.z), cushion: "log", style: "log", approachX: g.x - out.x * 0.62, approachZ: g.z - out.z * 0.62 };
  }),
  ...([-1, 1] as const).map((s, k): ForestPlaceSeat => ({ propId: `seat_woods_jetty_0${k + 1}`, x: PL.jetty.x1 - 0.12, z: PL.jetty.z + s * 0.3, rotationY: Math.PI / 2, cushion: "dock", style: "dock", approachX: PL.jetty.x0 - 0.1, approachZ: PL.jetty.z + s * 0.3 })),
  { propId: ROPE_SWING.propId, x: ROPE_SWING.x, z: ROPE_SWING.z, rotationY: Math.PI / 2, cushion: "swing", style: "wood", approachX: ROPE_SWING.x - 0.75, approachZ: ROPE_SWING.z },
];
/** What the action dock offers for them. */
export const FOREST_SEAT_LABELS: Record<string, string> = {
  seat_woods_lookout_01: "🔭 Sit at the lookout",
  seat_woods_lookout_02: "🔭 Sit at the lookout",
  seat_woods_jetty_01: "🌊 Sit on the jetty",
  seat_woods_jetty_02: "🌊 Sit on the jetty",
  seat_woods_ropeswing: "🌳 Sit on the rope swing",
};

/** The woods' fishing spot a seat belongs to. */
export const woodsSpotOfSeat = (seat: string) => (seat ? FOREST_FISHING.find((f) => f.seat === seat)?.propId : undefined);
/** Where the Colossal Titan can sprout (a world event: one of these clearings). */
export const TITAN_SPOTS: Pt[] = L.titanSpots.map(([x, z]) => ({ x, z }));
/** The Titan's trunk, and where you fell it from (a step toward the middle of the wood). */
export const TITAN_TRUNK = 0.8;
export function titanApproach(p: Pt): Pt {
  const d = Math.hypot(p.x - L.core.x, p.z - L.core.z) || 1;
  return { x: p.x - ((p.x - L.core.x) / d) * 1.7, z: p.z - ((p.z - L.core.z) / d) * 1.7 };
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
/** (`tint`: a songbird of its own colour, as linear RGB: brighter than white where it must lift the
 *  template's brown.) */
export const FOREST_BIRDS: { id: number; x: number; z: number; y: number; yaw: number; tint?: [number, number, number] }[] = [
  ...L.birds.map(([px, pz], i) => {
    const pine = L.vista.find(([x, z]) => x === px && z === pz) ?? [px, pz, 1];
    const S = pine[2] * 1.55;
    const d = Math.hypot(px, pz) || 1;
    // (on the lowest boughs, a little in from their tips: nature_kit.py's pine)
    const r = 0.8 * S;
    // (its height over the ground its pine stands on)
    return { id: i, x: px - (px / d) * r, z: pz - (pz / d) * r, y: forestLand(px, pz) + 0.76 * S, yaw: Math.atan2(-px, -pz) };
  }),
  // the kingfisher: on a dead branch over the river's pool, watching the water (it scatters as they do)
  { id: L.birds.length, x: L.life.kingfisher.x, z: L.life.kingfisher.z, y: forestLand(L.life.kingfisher.x, L.life.kingfisher.z) + L.life.kingfisher.y, yaw: 1.4, tint: [0.5, 2.4, 4.2] },
];
/** The Old Growth's owl, by night: on a great pine's lowest bough, on the camera's side of it. */
export const FOREST_OWL = (() => {
  const [tx, tz] = L.life.owl.tree;
  const S = (L.dressing.greatTrees.find((t) => t.x === tx && t.z === tz)?.s ?? 1) * 1.55;
  const r = 0.8 * S * Math.SQRT1_2;
  return { x: tx + r, z: tz + r, y: forestLand(tx, tz) + 0.76 * S, yaw: Math.PI / 4 };
})();
/** Bramble's hives (the bees circle them by day), and where the daylight falls through the Old
 *  Growth's canopy ([x, z, radius]). */
export const FOREST_HIVES = L.places.hives.map(([x, z]) => ({ x, z }));
export const FOREST_SHAFTS = L.life.shafts.map(([x, z, r]) => ({ x, z, r }));
/** The branch archway back to the campfire, and where you stand at it. */
export const WOODS_ARCHWAY = L.archway;
export const WOODS_ARCHWAY_FRONT: Pt = { x: L.archway.x, z: L.archway.z - 1.05 };
/** Where a traveller arrives from the campfire (just inside the archway). */
export const WOODS_ARRIVAL: Pt = L.arrival;
/** The old mine adit down to the Glimmering Caverns (recessed 1.5 m into an alcove of its mossy
 *  outcrop, facing into the wood from behind the Autumn Maples), where you stand at it, and where a
 *  traveller back up from the caverns arrives (in the alcove, facing east into the wood). */
export const FOREST_ADIT = L.adit;
export const FOREST_ADIT_FRONT: Pt = { x: L.adit.x + 1.15, z: L.adit.z };
export const WOODS_FROM_CAVERNS: Pt = { x: L.adit.x + 1.5, z: L.adit.z + 0.2 };
/** Old Flint the Badger leaning on the cliff by the portal's north post (the right-hand side as you
 *  face it, and on screen), his brass lantern lit (facing out of the alcove: `yaw`), and where you
 *  stand to talk to him. */
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
  const open = Math.atan2(L.core.z - L.shrine.z, L.core.x - L.shrine.x);
  const n = L.shrine.stones;
  return Array.from({ length: n }, (_, k) => {
    const a = open + SHRINE_GAP / 2 + (k / (n - 1)) * (2 * Math.PI - SHRINE_GAP);
    return { x: L.shrine.x + Math.cos(a) * L.shrine.r, z: L.shrine.z + Math.sin(a) * L.shrine.r };
  });
})();

// (round things are discs: shared/collision.ts `disc`)
const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r, r });
const square = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
export const FOREST_OBSTACLES: AABB[] = [
  // the trunks (felled or not: a stump is in the way too)
  ...FOREST_TREES.map((t) => around(t, trunkOf(t.kind))),
  // the vista pines on the cliff edges
  ...L.vista.map(([x, z, s]) => around({ x, z }, 0.45 * s)),
  // the river: small boxes down its length, a little in from its banks (you walk to the water's edge)
  ...forestRiver(10).map(([x, z, w]) => square({ x, z }, Math.max(0.2, w - 0.22))),
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
  ...SHRINE_STONES.map((p) => around(p, 0.28)),
  // the deer and the rabbits
  ...L.animals.map((a) => around(a, 0.35)),
  // the dressing you walk round: boulders on the hillside, lantern posts along the trails, fallen
  // logs (small boxes along each), stumps
  ...L.dressing.boulders.map(([x, z, s]) => around({ x, z }, 0.45 * s)),
  ...L.dressing.lanternPosts.map(([x, z]) => around({ x, z }, 0.1)),
  ...L.dressing.fallen.flatMap((f) => {
    const n = Math.max(2, Math.ceil(f.len / 0.4));
    return Array.from({ length: n + 1 }, (_, k) => around({ x: f.x + Math.sin(f.yaw) * (k / n - 0.5) * (f.len - 0.3), z: f.z + Math.cos(f.yaw) * (k / n - 0.5) * (f.len - 0.3) }, 0.2));
  }),
  ...L.dressing.stumps.map(([x, z]) => around({ x, z }, 0.24)),
  // the dead standing trees at the rims
  ...L.dressing.snags.map(([x, z]) => around({ x, z }, 0.2)),
  // the trees that are not felled (the Old Growth's great pines and cedars, the North Ridge's birches)
  // and the waist-high shrubs
  ...L.dressing.greatTrees.map((t) => around(t, 0.42 * t.s)),
  ...(L.dressing.birches as readonly (readonly number[])[]).map(([x, z, s]) => around({ x, z }, 0.3 * s)),
  ...L.dressing.shrubs.map(([x, z, s]) => around({ x, z }, 0.34 * s)),
  // --- the places (off the walks between the groves, Bramble and Finley) ---
  // the lookout's bench, the camp's lean-to and logs
  ...[-0.4, 0.4].map((t) => around({ x: LOOKOUT.x + LOOKOUT.side.x * t, z: LOOKOUT.z + LOOKOUT.side.z * t }, 0.3)),
  { minX: PL.camp.leanTo.x - 0.5, maxX: PL.camp.leanTo.x + 0.5, minZ: PL.camp.leanTo.z - 0.55, maxZ: PL.camp.leanTo.z + 0.55 },
  ...WOODS_CAMP.logs.flatMap((g) => [-0.3, 0.3].map((t) => around({ x: g.x + g.along.x * t, z: g.z + g.along.z * t }, 0.2))),
  // Finley's rod rack and drying nets; Bramble's hives, vegetable patch, wheelbarrow, washing poles,
  // the rope swing's leaning tree; the timber stack on the south verge
  around(PL.rodRack, 0.3),
  { minX: PL.nets.x - 0.15, maxX: PL.nets.x + 0.15, minZ: PL.nets.z - PL.nets.len / 2, maxZ: PL.nets.z + PL.nets.len / 2 },
  ...PL.hives.map(([x, z]) => around({ x, z }, 0.28)),
  { minX: PL.patch.x - PL.patch.w / 2, maxX: PL.patch.x + PL.patch.w / 2, minZ: PL.patch.z - PL.patch.d / 2, maxZ: PL.patch.z + PL.patch.d / 2 },
  around(PL.wheelbarrow, 0.35),
  around({ x: PL.washing.a[0], z: PL.washing.a[1] }, 0.1),
  around({ x: PL.washing.b[0], z: PL.washing.b[1] }, 0.1),
  around({ x: PL.ropeSwing.tree[0], z: PL.ropeSwing.tree[1] }, 0.3),
  { minX: PL.timber.x - PL.timber.w / 2, maxX: PL.timber.x + PL.timber.w / 2, minZ: PL.timber.z - PL.timber.d / 2, maxZ: PL.timber.z + PL.timber.d / 2 },
  // the adit's mossy outcrop on the western cliff (its back, and the alcove's two wings either side of
  // the portal), and Old Flint on its south post
  { minX: L.adit.outcrop.x0, maxX: L.adit.outcrop.x1, minZ: L.adit.outcrop.z0, maxZ: L.adit.outcrop.z1 },
  { minX: L.adit.outcrop.x1, maxX: L.adit.outcrop.x1 + L.adit.alcove.depth, minZ: L.adit.outcrop.z0, maxZ: L.adit.z - L.adit.alcove.half },
  { minX: L.adit.outcrop.x1, maxX: L.adit.outcrop.x1 + L.adit.alcove.depth, minZ: L.adit.z + L.adit.alcove.half, maxZ: L.adit.outcrop.z1 },
  around(L.flint, 0.3),
];
export const FOREST_SPAWNS: Pt[] = L.spawns;
