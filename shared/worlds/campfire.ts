import type { AABB } from "../collision";
import { CUSHIONS, napPose } from "../seats";
import type { SeatStyle } from "../types";
import type { PropSpec, SeatSpec } from "./lounge";
import { gridData, gridY, makeGrid, moundAt, smoothstep } from "../terrain";

// The Starlight Campfire (docs/campfire-design.md): a floating island of forest soil and moss, 28 m
// across, on gentle ground: the Hearth in the middle (the bonfire in its horseshoe of log benches, on
// the flat), the Tipi Knoll in the north-west (the tipi on a shoulder of the hill, the telescope on
// its top), Traders' Row on a low terrace along the north (the archway into the Whispering Woods,
// Buster, the workbench, the woodpile, the camper van and the splitting block), the River down the
// east side (a fall off a rock step into a plunge pool, a pond at the boardwalk dock with its three
// fishing spots, Barnaby's stall, the canoe, and out over the island's south edge), the South Meadow
// (the slingshot gallery, the picnic table, the birch grove), eight Soft Pines between them that you
// fell (they grow back), pines along the back edges and a rustic fence along the front. Authored
// ONCE, here:
//
//   CAMPFIRE_LAYOUT   where everything is (plain JSON between the markers: scripts/blender/
//                     build_campfire.py reads the very same text to build campfire.glb, so the
//                     model and the walkable floor can never disagree)
//   riverSpan         the river's banks at any z, from its spline (build_campfire.py has the same
//                     function, line for line)
//   campLand          the ground's height at any (x, z): the mounds and the terrace (`terrain`);
//   campHeight        the same with the river's channel cut into it; CAMP_GROUND samples it on a
//                     grid (scripts/campfire-terrain.ts writes that grid for the builder, which
//                     models the ground from it triangle for triangle), and campFloorY is where
//                     feet go: that grid's own triangles, and the dock's deck
//   CAMP_SEATS        the logs (sit, facing the fire), and the tents (lie, eyes shut)
//   places            the places to stop on the open ground (docs/maps-fill-plan.md part 2): the
//                     Hammock Grove, the Stargazers' Slope's blankets, the Music Glade's ring, the
//                     Swing Garden, the River's End (HAMMOCKS, BLANKETS, GLADE, SWING, RIVER_END)
//   CAMP_PROPS        the bonfire (roast and grill) and the dock's three fishing spots
//   CAMP_OBSTACLES    what you walk round; CAMP_SPAWNS  where you arrive (the path facing the fire)
//
// Coordinates are the game's: x right, z toward the camera's side, heights in y; the island is
// 2 * half across, its flat ground at y = 0. The camera looks from +x +z, so the high ground and the
// tall things (the knoll, the pines, the tipi) stand along the back edges (-x, -z), the river lies low
// in front, and only low things (a fence, rocks) stand along the front. A height in the layout (a
// string's end, the owl's branch) is measured from the ground under it.

export const CAMPFIRE_LAYOUT = /* layout:begin */ {
  "half": 14,
  "terrain": {
    "step": 0.35,
    "bank": 0.5,
    "mounds": [
      { "id": "knoll", "x": -10.4, "z": -10.2, "top": 1.7, "flat": 1.7, "skirt": 6.0 },
      { "id": "shoulder", "x": -9.2, "z": -2.6, "top": 0.8, "flat": 2.5, "skirt": 3.6 },
      { "id": "swell", "x": -10.8, "z": 6.4, "top": 0.4, "flat": 0.8, "skirt": 3.6 },
      { "id": "swell", "x": 6.0, "z": 11.6, "top": 0.3, "flat": 0.6, "skirt": 3.0 },
      { "id": "hummock", "x": 4.3, "z": 3.6, "top": 0.22, "flat": 0.4, "skirt": 1.7 },
      { "id": "hummock", "x": 4.7, "z": -2.7, "top": 0.2, "flat": 0.3, "skirt": 1.6 },
      { "id": "hummock", "x": 2.5, "z": 7.5, "top": 0.2, "flat": 0.4, "skirt": 1.7 },
      { "id": "hummock", "x": -2.5, "z": 6.1, "top": 0.18, "flat": 0.3, "skirt": 1.5 },
      { "id": "hummock", "x": -6.4, "z": 7.0, "top": 0.2, "flat": 0.3, "skirt": 1.6 }
    ],
    "terrace": { "x0": -4.2, "x1": 8.4, "z1": -9.4, "top": 0.45, "skirt": 2.4 }
  },
  "fire": { "x": 0, "z": 0, "ring": 0.62, "collider": 0.45 },
  "clearing": { "x": 0, "z": 0, "r": 4.4 },
  "firepit": {
    "r": 2.35,
    "pieces": [
      { "id": "Long", "kind": "log", "angle": 90, "r": 2.45, "len": 2.9, "seats": ["L1", "L2", "L3"] },
      { "id": "Medium", "kind": "log", "angle": 20, "r": 2.3, "len": 1.9, "seats": ["M1", "M2"] },
      { "id": "Curved", "kind": "curved", "angle": 160, "r": 2.45, "arc": 38, "seats": ["C1", "C2"] },
      { "id": "Stump", "kind": "stump", "angle": 330, "r": 2.2, "seats": ["01"] },
      { "id": "Boulder", "kind": "boulder", "angle": 210, "r": 2.3, "seats": ["01"] }
    ]
  },
  "tripod": { "legs": 0.9, "apex": 1.95, "potY": 1.0, "potR": 0.27 },
  "barnaby": { "x": 6.8, "z": -0.6, "yaw": -0.35 },
  "barnabyBoard": { "x": -0.8, "z": 0.2, "yaw": 0.35 },
  "busterBoard": { "x": -0.83, "z": -11.23, "yaw": 0.44 },
  "buster": { "x": -0.5, "z": -10.1, "yaw": 0.25 },
  "picnicPlates": [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
  "river": {
    "points": [[-15.0, 10.9, 1.05], [-12.6, 10.75, 1.15], [-10.4, 10.6, 1.3], [-8.0, 10.9, 1.1], [-5.5, 11.1, 1.25], [-3.0, 10.8, 1.5], [-0.5, 10.4, 1.9], [2.0, 10.3, 2.3], [4.5, 10.7, 2.1], [7.0, 11.2, 1.6], [9.5, 11.3, 1.25], [12.0, 11.1, 1.1], [14.6, 10.9, 1.0]],
    "depth": 0.5,
    "water": -0.18
  },
  "dock": { "x0": 7.3, "x1": 9.4, "z0": 0.1, "z1": 3.9, "deck": 0.03 },
  "fishing": [
    { "stand": { "x": 8.95, "z": 0.75 }, "bobber": { "x": 10.3, "z": 0.75 } },
    { "stand": { "x": 8.95, "z": 2.0 }, "bobber": { "x": 10.35, "z": 2.0 } },
    { "stand": { "x": 8.95, "z": 3.25 }, "bobber": { "x": 10.3, "z": 3.25 } }
  ],
  "lanterns": [{ "x": 9.22, "z": 0.28 }, { "x": 9.22, "z": 3.72 }],
  "tent": { "x": -9.2, "z": -2.6, "r": 1.35, "h": 3.0, "opening": 70 },
  "woodpile": { "x": 3.1, "z": -10.2 },
  "trees": [
    { "x": -12.8, "z": -12.9, "s": 1.3 },
    { "x": -8.4, "z": -13.1, "s": 1.1 },
    { "x": -5.4, "z": -13.0, "s": 0.95 },
    { "x": 3.4, "z": -13.2, "s": 0.95 },
    { "x": 8.6, "z": -13.1, "s": 0.9 },
    { "x": 12.6, "z": -12.8, "s": 1.0 },
    { "x": -12.9, "z": -9.6, "s": 1.15, "yaw": 1.7 },
    { "x": -13.0, "z": -6.8, "s": 1.2, "yaw": 0.4 },
    { "x": -11.2, "z": -5.6, "s": 1.1, "yaw": 2.9 },
    { "x": -13.0, "z": -4.4, "s": 0.85, "yaw": 2.2 },
    { "x": -12.6, "z": -1.0, "s": 1.05, "yaw": 3.3 },
    { "x": -13.2, "z": 1.6, "s": 0.8, "yaw": 5.0 },
    { "x": -12.9, "z": 3.4, "s": 1.25, "yaw": 1.1 },
    { "x": -13.1, "z": 8.2, "s": 1.0, "yaw": 4.1 },
    { "x": 4.9, "z": -4.7, "s": 1.0, "yaw": 0.6, "bare": 1.15 },
    { "x": 6.7, "z": -6.4, "s": 0.9, "yaw": 2.4, "bare": 1.15 },
    { "x": 8.4, "z": -7.9, "s": 0.95, "yaw": 4.4, "bare": 1.15 },
    { "x": -10.4, "z": -0.2, "s": 0.85, "yaw": 1.9 },
    { "x": -3.4, "z": 8.1, "s": 0.82, "yaw": 0.6, "kind": "spruce" },
    { "x": -9.8, "z": 12.3, "s": 0.78, "yaw": 0.6, "kind": "spruce" },
    { "x": 2.5, "z": -8.3, "s": 0.9, "yaw": 2, "kind": "spruce" },
    { "x": -8.1, "z": 8.5, "s": 0.8, "yaw": 5.8, "kind": "spruce" },
    { "x": 8.5, "z": 7.5, "s": 0.63, "yaw": 1.6, "kind": "spruce" },
    { "x": -7.5, "z": 1.2, "s": 0.99, "yaw": 2.3, "kind": "spruce" },
    { "x": -3.3, "z": 5.2, "s": 0.84, "yaw": 5.9, "kind": "spruce" }
  ],
  "fellTrees": [
    { "x": -4.6, "z": 2.6 },
    { "x": -4.7, "z": -0.35 },
    { "x": -3.0, "z": -4.6 },
    { "x": -6.5, "z": -6.2 },
    { "x": -2.4, "z": -8.0 },
    { "x": 4.6, "z": 5.6 },
    { "x": 5.0, "z": 8.4 },
    { "x": -7.6, "z": 4.4 }
  ],
  "fellBirches": [],
  "rocks": [
    { "x": 8.2, "z": -4.4, "s": 0.7 },
    { "x": 7.9, "z": 5.6, "s": 0.8 },
    { "x": 13.2, "z": -2.0, "s": 0.55 },
    { "x": 13.1, "z": 3.4, "s": 0.5 },
    { "x": 12.9, "z": -7.6, "s": 0.6 },
    { "x": -13.2, "z": 6.4, "s": 0.8 },
    { "x": -7.6, "z": -8.6, "s": 0.8 },
    { "x": -8.6, "z": -11.9, "s": 0.6 },
    { "x": -12.2, "z": -11.4, "s": 0.7 },
    { "x": 5.2, "z": 12.8, "s": 0.5 },
    { "x": 9.0, "z": 11.6, "s": 0.5 },
    { "x": 12.8, "z": 9.0, "s": 0.45 },
    { "x": 8.6, "z": -7.0, "s": 0.55 },
    { "x": 12.9, "z": 12.6, "s": 0.6 },
    { "x": -12.3, "z": 10.4, "s": 0.55 },
    { "x": -9.7, "z": -6.3, "s": 0.5 },
    { "x": -7.3, "z": -11.5, "s": 0.55 }
  ],
  "dressing": {
    "lanternPosts": [{ "x": -11.4, "z": -10.6 }],
    "crates": [{ "x": -2.1, "z": -12.1, "yaw": 0.3 }],
    "barrels": [],
    "fallen": [{ "x": -11.7, "z": 11.3, "yaw": 2.0, "len": 1.6 }],
    "stumps": [],
    "snags": [[-13.35, -11.3, 2.7], [-13.4, 12.3, 2.2]],
    "birches": [],
    "shrubs": [[-7.55, -9.35, 0.8], [-4.7, -12.5, 0.7], [-8.6, 0.2, 0.8], [-12.0, 4.9, 0.7], [7.6, 12.4, 0.8], [-7.0, -5.9, 0.75], [-2.3, -5.9, 0.7]],
    "meadows": [[6.2, -5.6, 2.6], [-6.0, -10.2, 2.4], [4.6, 5.0, 3.0], [-1.2, 10.4, 2.6], [6.2, 11.4, 2.4]],
    "wood": [[-4.6, -5.4, 2.8], [-5.8, 2.2, 3.2], [-10.2, 5.2, 3.6], [-11.6, -2.4, 3.0], [-9.0, 8.4, 2.6]]
  },
  "places": {
    "hammocks": [
      { "a": [4.9, -4.7], "b": [6.7, -6.4], "head": "a", "approach": [6.32, -5.0] },
      { "a": [6.7, -6.4], "b": [8.4, -7.9], "head": "a", "approach": [8.05, -6.59] }
    ],
    "hammockLantern": { "x": 6.7, "z": -6.4, "tip": [7.12, -5.98], "y": 1.6 },
    "blankets": [],
    "glade": { "x": -10.8, "z": 4.4, "r": 1.2, "log": { "angle": 20, "len": 1.4 }, "stumps": [-85, 100, 175] },
    "swing": { "x": -0.9, "z": 9.8, "beam": 2.05, "span": 1.0, "seat": 0.33 },
    "riverEnd": {
      "rock": { "x": 9.35, "z": 12.5, "yaw": 1.03 },
      "log": { "x": 9.4, "z": 11.0, "len": 1.3 },
      "willow": { "x": 7.1, "z": 11.3, "s": 1.0 }
    }
  },
  "fence": { "at": 13.55, "xFrom": -13.3, "xTo": 9.3, "post": 1.25 },
  "picnic": { "x": 1.5, "z": 11.2 },
  "telescope": { "x": -10.4, "z": -10.2 },
  "archway": { "x": 2.0, "z": -13.15, "w": 1.8, "h": 2.6 },
  "gallery": { "x": -5.5, "z": 10.6, "len": 3.4, "rails": [11.45, 12.05, 12.65], "back": 13.15 },
  "splitblock": { "x": 7.8, "z": -9.7 },
  "van": { "x": 6.0, "z": -12.1, "len": 3.0, "w": 1.45, "awning": 1.25 },
  "campChair": { "x": 6.6, "z": -10.65 },
  "workbench": { "x": -3.6, "z": -10.7, "len": 1.4, "w": 0.62, "top": 0.86 },
  "critter": { "x": 5.5, "z": -9.7 },
  "canoe": { "x": 10.1, "z": 4.62, "len": 2.0 },
  "cleat": { "x": 9.05, "z": 3.8 },
  "owl": { "x": -12.35, "y": 1.2, "z": -3.75, "tree": { "x": -13.0, "z": -4.4 } },
  "ducks": [
    { "z": -5.6, "rx": 0.6, "rz": 1.3, "speed": 0.09 },
    { "z": 7.4, "rx": 0.5, "rz": 1.0, "speed": 0.12 }
  ],
  "forage": [
    { "kind": "mushroom", "x": -6.6, "z": -12.4 },
    { "kind": "berries", "x": -12.6, "z": -0.1 },
    { "kind": "mushroom", "x": -12.6, "z": 7.2 },
    { "kind": "berries", "x": -5.0, "z": -9.2 }
  ],
  "stringPole": { "x": -6.6, "z": -0.4, "h": 2.2 },
  "pegs": [{ "x": 3.4, "z": -13.2, "y": 1.75, "tip": [3.55, -12.787] }],
  "strings": [
    { "a": [-9.2, 2.65, -2.6], "b": [-10.92, 1.6, -5.2], "sag": 0.45 },
    { "a": [-9.2, 2.65, -2.6], "b": [-12.2, 1.6, -1.2], "sag": 0.45 },
    { "a": [-9.2, 2.65, -2.6], "b": [-6.6, 2.15, -0.4], "sag": 0.4 },
    { "a": [3.55, 1.745, -12.787], "b": [5.15, 1.55, -10.125], "sag": 0.35 },
    { "a": [5.15, 1.55, -10.125], "b": [7.25, 1.55, -10.125], "sag": 0.22 }
  ],
  "fenceLights": { "y": 0.78, "sag": 0.2, "every": 2 },
  "fireflies": { "x": -11.2, "z": 1.2 },
  "signpost": {
    "x": 0.85,
    "z": 6.75,
    "arms": [
      { "label": "Campfire", "to": [0, 0] },
      { "label": "Pier", "to": [8.3, 2.0] },
      { "label": "Overlook", "to": [-10.4, -10.2] }
    ]
  },
  "guitarCase": { "x": -11.4, "z": 3.0, "yaw": 1.35 },
  "groundLantern": { "x": -10.8, "z": 2.5 },
  "paths": [],
  "formerPaths": [
    { "points": [[-2.5, -1.4, 1.15], [-4.4, -2.3, 1.15], [-6.2, -2.8, 1.1], [-7.3, -3.6, 1.0], [-7.6, -5.2, 0.95], [-8.1, -7.0, 0.95], [-9.0, -8.6, 0.95], [-9.8, -9.5, 1.0]] },
    { "points": [[0.15, 2.6, 1.15], [0.1, 4.6, 1.15], [0.1, 6.0, 1.15], [0.3, 7.4, 1.15], [0.7, 8.8, 1.15], [1.0, 9.8, 1.15]] },
    { "points": [[0.1, 6.2, 1.0], [-1.5, 7.3, 0.95], [-3.4, 8.6, 0.95], [-5.2, 9.6, 1.0]] },
    { "points": [[0.15, -2.6, 1.2], [0.45, -5.0, 1.2], [0.9, -7.4, 1.2], [1.4, -9.4, 1.2], [1.9, -11.4, 1.2], [2.0, -12.5, 1.3]] },
    { "points": [[2.6, 0.4, 1.15], [4.4, 1.0, 1.15], [6.0, 1.7, 1.15], [7.4, 2.0, 1.2]] },
    { "points": [[-3.5, -9.75, 0.95], [-2.0, -9.3, 0.95], [-0.4, -9.1, 0.95], [1.4, -9.2, 0.95], [3.4, -8.6, 0.95], [5.4, -8.5, 0.95], [7.0, -8.9, 0.95]] }
  ],
  "undergrowth": [
    { "kind": "stones", "x": -10.9, "z": 0.2 },
    { "kind": "stones", "x": -7.4, "z": 2.4 },
    { "kind": "stones", "x": -10.6, "z": 7.9 },
    { "kind": "stones", "x": 5.9, "z": -3.2 },
    { "kind": "stones", "x": 2.9, "z": 6.0 },
    { "kind": "mushrooms", "x": -11.9, "z": -6.9 },
    { "kind": "mushrooms", "x": -6.2, "z": 6.4 },
    { "kind": "mushrooms", "x": -10.2, "z": -12.6 },
    { "kind": "mushrooms", "x": -7.0, "z": -12.2 },
    { "kind": "mushrooms", "x": 8.9, "z": -8.2 },
    { "kind": "berries", "x": -7.0, "z": -1.2 },
    { "kind": "berries", "x": -12.9, "z": 9.0 },
    { "kind": "berries", "x": -12.8, "z": -8.2 },
    { "kind": "berries", "x": -13.3, "z": -2.9 },
    { "kind": "berries", "x": -13.2, "z": 0.3 },
    { "kind": "berries", "x": -13.3, "z": 5.0 },
    { "kind": "berries", "x": -8.1, "z": 13.0 },
    { "kind": "berries", "x": 8.8, "z": 12.9 },
    { "kind": "mossy", "x": -11.9, "z": 5.6 },
    { "kind": "mossy", "x": -11.6, "z": -7.9 },
    { "kind": "mossy", "x": -7.2, "z": 1.2 },
    { "kind": "mossy", "x": -10.9, "z": 8.9 },
    { "kind": "mossy", "x": 8.3, "z": 6.9 },
    { "kind": "mossy", "x": 8.7, "z": -2.6 },
    { "kind": "flowers", "x": 3.6, "z": 13.0 },
    { "kind": "flowers", "x": 5.0, "z": 12.9 },
    { "kind": "flowers", "x": 6.4, "z": 12.6 },
    { "kind": "flowers", "x": -1.5, "z": 12.9 },
    { "kind": "flowers", "x": -2.8, "z": 13.0 },
    { "kind": "flowers", "x": -9.2, "z": -11.2 },
    { "kind": "flowers", "x": -11.5, "z": -9.2 },
    { "kind": "flowers", "x": -3.6, "z": 6.0 },
    { "kind": "flowers", "x": 2.6, "z": -7.9 }
  ],
  "spawns": [
    { "x": 0, "z": 5.0 },
    { "x": -0.9, "z": 5.6 },
    { "x": 0.9, "z": 5.6 },
    { "x": 0, "z": 6.3 },
    { "x": -1.6, "z": 6.6 },
    { "x": 1.6, "z": 6.6 }
  ]
} /* layout:end */;

const L = CAMPFIRE_LAYOUT;
type Pt = { x: number; z: number };

export const CAMPFIRE_HALF = L.half;
/** The camera fits the island with a margin, like the lounge (LOFT_FRAME). */
export const CAMPFIRE_FRAME = { x: 0, z: 0, size: L.half * 2 + 0.8 };

/** Close enough to the fire to hold a skewer over it (the log benches are well inside). */
export const BONFIRE_REACH = 4.0;
/** Close enough to a fishing spot on the dock to cast from it. */
export const FISHING_REACH = 1.1;
/** Players seated within this of someone playing the guitar sway along. */
export const GUITAR_LISTEN = 5;

/** The heading that faces from (x, z) toward `to` (heading 0 faces +z). */
const facing = (x: number, z: number, to: Pt) => Math.atan2(to.x - x, to.z - z);
const unit = (x: number, z: number) => {
  const d = Math.hypot(x, z) || 1;
  return { x: x / d, z: z / d };
};

// --- the river ----------------------------------------------------------------------------------
//
// Its centre line and half-width are a Catmull-Rom spline through `river.points` ([z, x, halfW],
// running north to south), with a round end past the first and last point. riverSpan gives its
// banks at any z; build_campfire.py digs and fills the river with the very same function.

const catmull = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);

/** The river's west and east banks at `z`, or null north or south of it. */
export function riverSpan(z: number): { x0: number; x1: number } | null {
  const P = L.river.points;
  const n = P.length;
  const [zFirst, xFirst, wFirst] = P[0];
  const [zLast, xLast, wLast] = P[n - 1];
  if (z < zFirst) {
    const d = zFirst - z;
    if (d >= wFirst) return null;
    const w = Math.sqrt(wFirst * wFirst - d * d);
    return { x0: xFirst - w, x1: xFirst + w };
  }
  if (z > zLast) {
    const d = z - zLast;
    if (d >= wLast) return null;
    const w = Math.sqrt(wLast * wLast - d * d);
    return { x0: xLast - w, x1: xLast + w };
  }
  let i = 0;
  while (i < n - 2 && z > P[i + 1][0]) i++;
  const u = (z - P[i][0]) / (P[i + 1][0] - P[i][0]);
  const at = (k: number) => P[Math.max(0, Math.min(n - 1, k))];
  const x = catmull(at(i - 1)[1], at(i)[1], at(i + 1)[1], at(i + 2)[1], u);
  const w = catmull(at(i - 1)[2], at(i)[2], at(i + 1)[2], at(i + 2)[2], u);
  return { x0: x - w, x1: x + w };
}

// --- the ground -------------------------------------------------------------------------------------
//
// Gentle, and all of it walked: a few round mounds (a flat top, then a smooth skirt down: the knoll,
// the tipi's shoulder, two low swells) and the north terrace, blended where they meet; nothing
// steeper than about 23 degrees. The hearth, the dock and the meadow's furniture stand on the flat.

/** The ground's height at (x, z), the river's channel not cut in: where things stand. */
export function campLand(x: number, z: number): number {
  const T = L.terrain;
  // (blended as a 4-norm: the higher one where one stands alone, a soft join where two meet, and
  // flat ground stays exactly flat)
  let sum = 0;
  for (const m of T.mounds) {
    const h = moundAt(m, x, z);
    sum += h * h * h * h;
  }
  const t = T.terrace;
  const d = Math.hypot(Math.max(t.x0 - x, 0, x - t.x1), Math.max(z - t.z1, 0));
  const h = t.top * (1 - smoothstep(0, t.skirt, d));
  sum += h * h * h * h;
  return Math.sqrt(Math.sqrt(sum));
}

/** The ground as drawn: campLand with the river's channel cut down to its bed between its banks. */
export function campHeight(x: number, z: number): number {
  const land = campLand(x, z);
  const span = riverSpan(z);
  if (!span) return land;
  const inside = Math.min(x - span.x0, span.x1 - x);
  if (inside <= 0) return land;
  return land + (-L.river.depth - land) * smoothstep(0, L.terrain.bank, inside);
}

/** The ground's grid (shared/terrain.ts): campHeight (and campLand) at every corner of its cells.
 *  The builder models the ground from it, each cell cut along the same diagonal campGroundY reads it by. */
export const CAMP_GRID = makeGrid(L.half, L.terrain.step, campHeight, campLand);

/** The drawn ground's height at (x, z): the grid's own triangles. */
export const campGroundY = (x: number, z: number): number => gridY(CAMP_GRID, CAMP_GRID.ground, x, z);

/** Where feet go at (x, z): the drawn ground, and the dock's deck over the water. */
export function campFloorY(x: number, z: number): number {
  const d = L.dock;
  const y = campGroundY(x, z);
  return x >= d.x0 - 0.02 && x <= d.x1 + 0.02 && z >= d.z0 - 0.02 && z <= d.z1 + 0.02 ? Math.max(y, d.deck) : y;
}

/** The grid for the builder (scripts/campfire-terrain.ts writes it to scripts/blender/data/
 *  campfire_terrain.json). */
export const campTerrainData = () => gridData(CAMP_GRID);

const RIVER_FIRST = L.river.points[0];
const RIVER_LAST = L.river.points[L.river.points.length - 1];
/** The river's north and south ends (its round caps included). */
export const RIVER_Z = { from: RIVER_FIRST[0] - RIVER_FIRST[2], to: RIVER_LAST[0] + RIVER_LAST[2] };

// --- the fishing spots ----------------------------------------------------------------------------

/** Where you can fish from: the dock's three spots (you sit on its edge) and the canoe (you sit in
 *  it). Each has its seat, where you stand to take it, where you fish from, and where your float
 *  lands out in the river. */
/** Where you step into the canoe from: the dock's corner by its cleat. */
const CANOE_APPROACH: Pt = { x: L.dock.x1 - 0.7, z: L.dock.z1 - 0.4 };
export const FISHING_SPOTS = [
  ...L.fishing.map((f, i) => ({ propId: `fishing_spot_0${i + 1}`, seat: `seat_dock_0${i + 1}`, stand: f.stand, approach: f.stand, bobber: f.bobber })),
  // the canoe, sitting facing out across the water: the float lands out in front of you
  { propId: "fishing_canoe", seat: "seat_canoe", stand: { x: L.canoe.x - 0.45, z: L.canoe.z }, approach: CANOE_APPROACH, bobber: { x: L.canoe.x - 0.45, z: L.canoe.z + 1.25 } },
];

/** The spot an angler standing at (x, z) is fishing from: the nearest one. */
export function nearestFishingSpot(x: number, z: number) {
  let best = FISHING_SPOTS[0];
  for (const s of FISHING_SPOTS) if (Math.hypot(s.stand.x - x, s.stand.z - z) < Math.hypot(best.stand.x - x, best.stand.z - z)) best = s;
  return best;
}

// --- the living camp: the telescope, the chopping block, foraging, lights and wildlife ----------

/** The Soft Pines round the clearing that you fell (the radial felling, shared/chop.ts): each one's
 *  node id, and where you stand to fell it (a step toward the fire). They grow back from their
 *  stumps, a new size each time. */
const campTree = (id: string, kind: "soft_pine" | "birch", t: { x: number; z: number }) => {
  const toFire = unit(L.fire.x - t.x, L.fire.z - t.z);
  return { id, kind, x: t.x, z: t.z, approachX: t.x + toFire.x * 1.05, approachZ: t.z + toFire.z * 1.05 };
};
/** (And the stand of Silver Birches on the south-west lawn: what the campfire's T2 axe is for.) */
export const CAMP_TREES = [...L.fellTrees.map((t, i) => campTree(`camp_pine_${i + 1}`, "soft_pine", t)), ...L.fellBirches.map((t, i) => campTree(`camp_birch_${i + 1}`, "birch", t))];

/** Close enough to the telescope's eyepiece to look through it. */
export const STARGAZE_REACH = 1.4;
/** Close enough to a mushroom patch or a berry bush to pick it. */
export const FORAGE_REACH = 1.3;
/** Close enough to the grove's fireflies to sweep the net through them. */
export const FIREFLY_REACH = 1.6;
/** Close enough to the raccoon to toss it a treat. */
export const CRITTER_REACH = 1.4;
/** A critter this close to someone carrying a roasted snack hopes for a bite (hearts). */
export const CRITTER_NOTICE = 2.0;

export type Vec3 = [number, number, number];

/** Where the bulbs hang on a light string from a to b sagging `sag` in the middle: one every
 *  ~0.38 along it (a parabola: the build script hangs the very same bulbs). */
export function stringBulbs(a: Vec3, b: Vec3, sag: number): Vec3[] {
  const n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.38));
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t] as Vec3;
  });
}

/** The fence's posts along the front edge, from the west corner to the river's bank (as
 *  build_campfire.py spaces them). */
export const FENCE_POSTS: number[] = (() => {
  const f = L.fence;
  const len = f.xTo - f.xFrom;
  const n = Math.max(1, Math.round(len / f.post));
  return Array.from({ length: n + 1 }, (_, k) => f.xFrom + (len * k) / n);
})();

/** Every string of lights: the ones slung between the tipi, the pole, the pines and the awning
 *  (each its own node in campfire.glb, StringLight_01.., swaying about its two ends), then the
 *  swags along the front fence (one node, StringLight_Fence, swaying as one). */
const overGround = (p: number[]): Vec3 => [p[0], p[1] + campLand(p[0], p[2]), p[2]];
export const LIGHT_STRINGS = L.strings.map((s, i) => ({ id: `StringLight_0${i + 1}`, a: overGround(s.a), b: overGround(s.b), sag: s.sag }));
export const FENCE_SWAGS = (() => {
  const { y, sag, every } = L.fenceLights;
  const out: { a: Vec3; b: Vec3; sag: number }[] = [];
  for (let k = 0; k + every < FENCE_POSTS.length; k += every) out.push({ a: overGround([FENCE_POSTS[k], y, L.fence.at]), b: overGround([FENCE_POSTS[k + every], y, L.fence.at]), sag });
  return out;
})();

/** The ducks' lazy ovals on the river, each centred mid-stream at its z. */
export const DUCK_PATHS = L.ducks.map((d) => {
  const span = riverSpan(d.z) ?? { x0: 7, x1: 8 };
  return { cx: (span.x0 + span.x1) / 2, cz: d.z, rx: d.rx, rz: d.rz, speed: d.speed };
});

/** The camper van's awning: its canvas runs out from the van's front (camera) side to two poles. */
export const AWNING_POLES: Pt[] = (() => {
  const zFront = L.van.z + L.van.w / 2 + L.van.awning;
  return [
    { x: L.van.x - 0.85, z: zFront },
    { x: L.van.x + 1.25, z: zFront },
  ];
})();

/** The dock's pilings standing in the river (foam rings round them). */
export const DOCK_PILINGS: Pt[] = [...L.lanterns, { x: L.dock.x1 - 0.08, z: (L.dock.z0 + L.dock.z1) / 2 - 0.62 }, { x: L.dock.x1 - 0.08, z: (L.dock.z0 + L.dock.z1) / 2 + 0.62 }];

/** The foraging spots under the pines: spotted red mushrooms and glowing night berries. */
export const FORAGE_SPOTS = L.forage.map((f, i) => {
  const toFire = unit(L.fire.x - f.x, L.fire.z - f.z);
  return { propId: `forage_0${i + 1}`, kind: f.kind as "mushroom" | "berries", x: f.x, z: f.z, approachX: f.x + toFire.x * 0.8, approachZ: f.z + toFire.z * 0.8 };
});

/** The way the tipi opens: toward the fire (and so toward the camera). */
export const TENT_OPENS = unit(L.fire.x - L.tent.x, L.fire.z - L.tent.z);

/** Each log bench round the fire: its middle, the way along it (tangent to the fire), and its two
 *  seats, L and R as the sitter sees them facing the fire. */
/** How far in front of a firepit seat (toward the fire) you step up to it and get up from it. */
export const FRONT_MOUNT = 0.85;

/** The firepit's seating, an organic ring with open walkways toward the tipi (west-north-west),
 *  the picnic table (south) and the dock (east): a long log (3 seats) behind the fire, a medium
 *  log (2) and a curved one (2) to the sides, a stump and a boulder (1 each). Each piece: where it
 *  sits (its angle round the fire, x right and z toward the camera), the way along it, and its seats. */
const DEG = Math.PI / 180;
interface FirepitPiece {
  id: string;
  kind: "log" | "curved" | "stump" | "boulder";
  angle: number;
  len?: number;
  arc?: number;
  r?: number;
  seats: readonly string[];
}
export const FIREPIT = (L.firepit.pieces as readonly FirepitPiece[]).map((p) => {
  const r = p.r ?? L.firepit.r;
  const a = p.angle * DEG;
  const at = { x: L.fire.x + Math.cos(a) * r, z: L.fire.z + Math.sin(a) * r };
  // facing the fire, a sitter's left hand is along (-out.z, out.x)
  const along = { x: -Math.sin(a), z: Math.cos(a) };
  let seats: Pt[];
  if (p.kind === "log") {
    const spacing = p.seats.length === 3 ? 0.95 : 1.0;
    seats = p.seats.map((_, k) => {
      const t = (k - (p.seats.length - 1) / 2) * spacing;
      return { x: at.x + along.x * t, z: at.z + along.z * t };
    });
  } else if (p.kind === "curved") {
    const arc = (p.arc ?? 40) * DEG;
    seats = p.seats.map((_, k) => {
      const b = a + (k - (p.seats.length - 1) / 2) * (arc / 2);
      return { x: L.fire.x + Math.cos(b) * r, z: L.fire.z + Math.sin(b) * r };
    });
  } else {
    seats = [at];
  }
  const cushion = p.kind === "stump" ? ("stump" as const) : p.kind === "boulder" ? ("boulder" as const) : ("log" as const);
  const seatId = (name: string) => (p.kind === "stump" || p.kind === "boulder" ? `seat_${p.kind}_${name}` : `seat_log_${name.toLowerCase()}`);
  return { id: p.id, kind: p.kind, angle: a, r, at, along, len: p.len ?? 0, arc: (p.arc ?? 0) * DEG, cushion, seats: seats.map((pt, k) => ({ ...pt, propId: seatId(p.seats[k]) })) };
});

// --- the places to stop on the open ground (docs/maps-fill-plan.md part 2; no coins in any) ---
const PL = L.places;
/** Half of a lying body: the head rests this far one way from its middle, the soles the other. */
const HALF_BODY = 0.41;

/** The Hammock Grove: each hammock slung between two of the meadow's pines (`a`, `b`: their
 *  trunks), its middle, the way along it and the way the head points. The three pines stand in a
 *  row across the camera's view with bare trunks under their boughs (`bare`), so no crown stands
 *  between the camera and whoever lies there. */
export const HAMMOCKS = PL.hammocks.map((h, i) => {
  const a = { x: h.a[0], z: h.a[1] };
  const b = { x: h.b[0], z: h.b[1] };
  const along = unit(b.x - a.x, b.z - a.z);
  const head = h.head === "a" ? { x: -along.x, z: -along.z } : along;
  return { propId: `seat_hammock_0${i + 1}`, a, b, mid: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, along, head, approach: { x: h.approach[0], z: h.approach[1] } };
});

/** Picnic blankets laid to a slope, two places each side by side, heads uphill (`up`). A place's
 *  soles are where its seat stands (the client tilts whoever lies there to the slope: `lieTilt`).
 *  The layout has none since the Stargazers' Slope was cleared (patch 0.7.55). */
export const BLANKETS = (PL.blankets as readonly { x: number; z: number; up: readonly number[]; tone: string }[]).map((b, i) => {
  const up = unit(b.up[0], b.up[1]);
  const side = { x: -up.z, z: up.x };
  const places = ([-1, 1] as const).map((s, k) => {
    const mid = { x: b.x + side.x * s * 0.33, z: b.z + side.z * s * 0.33 };
    return {
      propId: `seat_blanket_0${i * 2 + k + 1}`,
      head: { x: mid.x + up.x * HALF_BODY, z: mid.z + up.z * HALF_BODY },
      soles: { x: mid.x - up.x * HALF_BODY, z: mid.z - up.z * HALF_BODY },
      approach: { x: mid.x - up.x * 1.15, z: mid.z - up.z * 1.15 },
    };
  });
  return { x: b.x, z: b.z, up, side, places };
});
/** A seat on a picnic blanket (whoever lies there is tilted to the slope). */
export const isBlanketSeat = (propId: string) => propId.startsWith("seat_blanket_");

/** How far in front of a glade seat (toward its middle) you step up to it. */
const GLADE_MOUNT = 0.62;
/** The Music Glade: a short log and three stumps in a ring round a cold stone circle, by the
 *  guitar case. Log seats: the guitar is played from them. */
export const GLADE = (() => {
  const g = PL.glade;
  const at = (deg: number) => ({ x: g.x + Math.cos(deg * DEG) * g.r, z: g.z + Math.sin(deg * DEG) * g.r });
  const logAt = at(g.log.angle);
  const along = { x: -Math.sin(g.log.angle * DEG), z: Math.cos(g.log.angle * DEG) };
  return {
    x: g.x,
    z: g.z,
    r: g.r,
    log: { at: logAt, along, len: g.log.len, seats: ([-1, 1] as const).map((s, k) => ({ propId: `seat_glade_log_0${k + 1}`, x: logAt.x + along.x * s * 0.36, z: logAt.z + along.z * s * 0.36 })) },
    stumps: g.stumps.map((deg, k) => ({ propId: `seat_glade_stump_0${k + 1}`, ...at(deg) })),
  };
})();

/** The Swing Garden's bench swing: its beam runs along z, its two sitters face +x (the river and
 *  the sunset). `beam`: the beam's height; the bench hangs from it and sways (client: swingMotion). */
export const SWING = {
  ...PL.swing,
  seats: ([-1, 1] as const).map((s, k) => ({ propId: `seat_swing_0${k + 1}`, x: PL.swing.x, z: PL.swing.z + s * PL.swing.seat })),
};
export const SWING_SEAT_IDS: ReadonlySet<string> = new Set(SWING.seats.map((s) => s.propId));

/** The River's End: a flat rock and a driftwood log on the bank where the river leaves the island. */
export const RIVER_END = PL.riverEnd;

/**
 * A seat you lie down on: where your head rests, and the way it points (toward the back of the
 * tent). The server lies you down there with your eyes shut.
 */
export interface LieSpec {
  head: Pt;
  dir: Pt;
}

/** A campfire seat: a lie seat is a ChairConfig "blanket" (shared/props.ts); `style` otherwise
 *  (a log bench unless it says). */
export type CampSeat = SeatSpec & { lie?: LieSpec; style?: SeatStyle };

/** The seat at a fishing spot (the dock's edge, or the canoe): casting from it fishes. */
export const dockSeatOf = (spotPropId: string) => FISHING_SPOTS.find((f) => f.propId === spotPropId)?.seat ?? spotPropId.replace("fishing_spot_", "seat_dock_");
/** The fishing spot of a seat, if it is one. */
export const spotOfSeat = (seatId: string) => FISHING_SPOTS.find((f) => f.seat === seatId)?.propId;

/** The campfire's seats. */
export const CAMP_SEATS: CampSeat[] = [
  // the firepit's nine seats, each facing the fire (all "log" seats: play the guitar, roast from
  // them). Front-mounted: you walk up to a seat from the fire's side, turn and sit back onto it,
  // and get up the same way; nobody is ever routed round behind the logs
  ...FIREPIT.flatMap((piece) =>
    piece.seats.map((at): CampSeat => {
      const out = unit(at.x - L.fire.x, at.z - L.fire.z);
      return { propId: at.propId, x: at.x, z: at.z, rotationY: facing(at.x, at.z, L.fire), cushion: piece.cushion, style: "log", approachX: at.x - out.x * FRONT_MOUNT, approachZ: at.z - out.z * FRONT_MOUNT };
    })
  ),
  // the tipi: lie on the mat inside, head to the back, feet to the open flap
  {
    propId: "seat_tent",
    x: L.tent.x,
    z: L.tent.z,
    rotationY: 0,
    cushion: "tentMat",
    approachX: L.tent.x + TENT_OPENS.x * 2.1,
    approachZ: L.tent.z + TENT_OPENS.z * 2.1,
    lie: { head: { x: L.tent.x - TENT_OPENS.x * 0.35, z: L.tent.z - TENT_OPENS.z * 0.35 }, dir: { x: -TENT_OPENS.x, z: -TENT_OPENS.z } },
  },
  // the dock's river edge at each fishing spot: sit with your legs over the water, rod out
  ...FISHING_SPOTS.filter((s) => s.seat.startsWith("seat_dock_")).map((s): CampSeat => ({ propId: s.seat, x: L.dock.x1 - 0.12, z: s.stand.z, rotationY: Math.PI / 2, cushion: "dock", style: "dock", approachX: s.stand.x, approachZ: s.stand.z })),
  // the picnic table: two to each bench, facing each other across the gingham
  ...([-1, 1] as const).flatMap((side, b) =>
    ([-1, 1] as const).map((sx, k): CampSeat => ({
      propId: `seat_picnic_0${b * 2 + k + 1}`,
      x: L.picnic.x + sx * 0.42,
      z: L.picnic.z + side * 0.68,
      rotationY: side < 0 ? 0 : Math.PI,
      cushion: "picnicBench",
      style: "wood",
      approachX: L.picnic.x + sx * 0.42,
      approachZ: L.picnic.z + side * 1.2,
    }))
  ),
  // the camper's folding chair under the awning, looking out toward the fire
  { propId: "seat_camper_chair", x: L.campChair.x, z: L.campChair.z, rotationY: 0, cushion: "campChair", style: "deckchair", approachX: L.campChair.x, approachZ: L.campChair.z + 0.9 },
  // the canoe's stern seat, facing out across the river (you fish from it): it rocks with the boat
  { propId: "seat_canoe", x: L.canoe.x - 0.45, z: L.canoe.z, rotationY: 0, cushion: "canoe", style: "wood", approachX: CANOE_APPROACH.x, approachZ: CANOE_APPROACH.z },
  // and its bow seat, for a second paddler (a passenger: the stern is the one who fishes)
  { propId: "seat_canoe_bow", x: L.canoe.x + 0.42, z: L.canoe.z, rotationY: 0, cushion: "canoe", style: "wood", approachX: CANOE_APPROACH.x, approachZ: CANOE_APPROACH.z },
  // the Hammock Grove: lie in a hammock between the meadow's pines
  ...HAMMOCKS.map((h): CampSeat => ({
    propId: h.propId,
    x: h.mid.x,
    z: h.mid.z,
    rotationY: 0,
    cushion: "hammock",
    approachX: h.approach.x,
    approachZ: h.approach.z,
    lie: { head: { x: h.mid.x + h.head.x * HALF_BODY, z: h.mid.z + h.head.z * HALF_BODY }, dir: h.head },
  })),
  // the Stargazers' Slope: lie back on a blanket, head uphill (the seat stands where the soles go)
  ...BLANKETS.flatMap((b) => b.places.map((p): CampSeat => ({ propId: p.propId, x: p.soles.x, z: p.soles.z, rotationY: 0, cushion: "picnicBlanket", approachX: p.approach.x, approachZ: p.approach.z, lie: { head: p.head, dir: b.up } }))),
  // the Music Glade: the log's two seats and the three stumps, each facing the ring's middle
  ...[...GLADE.log.seats.map((s) => ({ ...s, cushion: "log" as const })), ...GLADE.stumps.map((s) => ({ ...s, cushion: "stump" as const }))].map((s): CampSeat => {
    const out = unit(s.x - GLADE.x, s.z - GLADE.z);
    return { propId: s.propId, x: s.x, z: s.z, rotationY: facing(s.x, s.z, GLADE), cushion: s.cushion, style: "log", approachX: s.x - out.x * GLADE_MOUNT, approachZ: s.z - out.z * GLADE_MOUNT };
  }),
  // the Swing Garden's bench swing: two side by side, facing the river
  ...SWING.seats.map((s): CampSeat => ({ propId: s.propId, x: s.x, z: s.z, rotationY: Math.PI / 2, cushion: "swing", style: "wood", approachX: s.x + 0.85, approachZ: s.z })),
  // the River's End: the flat rock and the driftwood log, looking out where the river leaves
  { propId: "seat_riverend_rock", x: RIVER_END.rock.x, z: RIVER_END.rock.z, rotationY: RIVER_END.rock.yaw, cushion: "boulder", style: "wood", approachX: RIVER_END.rock.x - 0.75, approachZ: RIVER_END.rock.z },
  { propId: "seat_riverend_log", x: RIVER_END.log.x, z: RIVER_END.log.z, rotationY: Math.PI / 2, cushion: "log", style: "wood", approachX: RIVER_END.log.x - 0.75, approachZ: RIVER_END.log.z },
];

/** What the action dock offers for a seat you lie in (you rest in the tents), and the fishing seats. */
export const CAMP_SEAT_LABELS: Record<string, string> = {
  seat_tent: "⛺ Rest",
  seat_tent_02: "⛺ Rest",
  ...Object.fromEntries(FISHING_SPOTS.filter((s) => s.seat.startsWith("seat_dock_")).map((s) => [s.seat, "🌊 Sit on the dock"])),
  seat_canoe: "🛶 Sit in the canoe",
  seat_canoe_bow: "🛶 Ride in the bow",
  ...Object.fromEntries(HAMMOCKS.map((h) => [h.propId, "😴 Nap in the hammock"])),
  ...Object.fromEntries(BLANKETS.flatMap((b) => b.places.map((p) => [p.propId, "🌌 Lie back and stargaze"]))),
  ...Object.fromEntries(SWING.seats.map((s) => [s.propId, "🌅 Sit on the swing"])),
  seat_riverend_rock: "🌊 Sit by the river",
  seat_riverend_log: "🌊 Sit by the river",
};

/** Where a lie seat puts the avatar (its soles, heading and height), derived from its cushion. */
export function lieSeatPose(seat: CampSeat) {
  return seat.lie ? napPose(CUSHIONS[seat.cushion], seat.lie.head, seat.lie.dir) : null;
}

/** Where you stand to talk to Barnaby: in front of him. */
/** Barnaby's outdoor chalkboard (the hour's prices), where it stands in the world: its place in his
 *  own frame (CAMPFIRE_LAYOUT.barnabyBoard, which build_barnaby.py reads too), turned with him. */
/** Buster's chalkboard (the same easel as Barnaby's, from barnaby.glb): the timber's prices, behind
 *  his stall beside his log rack, against the pine line, turned to the path to the archway (the
 *  way to the workbench and to him kept open). */
export const BUSTER_BOARD = L.busterBoard;
export const BARNABY_BOARD = {
  x: L.barnaby.x + L.barnabyBoard.x * Math.cos(L.barnaby.yaw) + L.barnabyBoard.z * Math.sin(L.barnaby.yaw),
  z: L.barnaby.z - L.barnabyBoard.x * Math.sin(L.barnaby.yaw) + L.barnabyBoard.z * Math.cos(L.barnaby.yaw),
  yaw: L.barnaby.yaw + L.barnabyBoard.yaw,
};
export const BARNABY_FRONT = { x: L.barnaby.x + Math.sin(L.barnaby.yaw) * 0.95, z: L.barnaby.z + Math.cos(L.barnaby.yaw) * 0.95 };
/** Close enough to Barnaby to trade. */
export const BARNABY_REACH = 1.8;
/** Where you stand to talk to Buster the Lumberjack (in front of him), and how close is close enough. */
export const BUSTER_FRONT = { x: L.buster.x + Math.sin(L.buster.yaw) * 0.95, z: L.buster.z + Math.cos(L.buster.yaw) * 0.95 };
export const BUSTER_REACH = 1.8;
/** The carpenter's workbench on the grass between the tipi and Buster's stall, back by the north
 *  pines (clear of him: walking up to one never offers the other), its front toward the fire: `front` the way it faces,
 *  `along` its length, `yaw` its heading. You carve Buster's artisan pieces here. */
export const WORKBENCH = (() => {
  const b = L.workbench;
  const front = unit(L.fire.x - b.x, L.fire.z - b.z);
  return { ...b, front, along: { x: front.z, z: -front.x }, yaw: Math.atan2(front.x, front.z) };
})();
/** Where you stand to work at the bench (in front of it), and how close is close enough. */
export const WORKBENCH_FRONT = { x: WORKBENCH.x + WORKBENCH.front.x * (WORKBENCH.w / 2 + 0.55), z: WORKBENCH.z + WORKBENCH.front.z * (WORKBENCH.w / 2 + 0.55) };
export const WORKBENCH_REACH = 1.5;
/** The Dutch oven's tripod legs round the fire. */
export const TRIPOD_LEGS: Pt[] = [30, 150, 270].map((deg) => ({ x: L.fire.x + Math.cos(deg * DEG) * L.tripod.legs, z: L.fire.z + Math.sin(deg * DEG) * L.tripod.legs }));
/** The plates on the picnic table where skewers are left for friends (table-relative offsets). */
export const PICNIC_PLATE_SPOTS: Pt[] = L.picnicPlates.map(([dx, dz]) => ({ x: L.picnic.x + dx, z: L.picnic.z + dz }));
/** Close enough to the picnic table to leave a skewer or take one. */
export const PICNIC_REACH = 2.0;

/** The archway into the Whispering Woods: a forest trailhead at the head of the north path, beside
 *  Buster's stall, opening south onto the camp; where you stand at it, and where a traveller back
 *  from the woods arrives (just in front of it). */
export const CAMP_ARCHWAY = L.archway;
export const CAMP_ARCHWAY_FRONT: Pt = { x: L.archway.x, z: L.archway.z + 1.05 };
export const CAMP_FROM_WOODS: Pt = { x: L.archway.x + 0.3, z: L.archway.z + 1.6 };
/** The slingshot gallery: its counter (along x), its three target rails and its backstop, and where
 *  you stand to shoot (in front of the counter, facing the fence). */
export const GALLERY = L.gallery;
export const GALLERY_FRONT: Pt = { x: L.gallery.x, z: L.gallery.z - 0.7 };
/** The splitting block (logs into Firewood), and its front. */
export const SPLITBLOCK = L.splitblock;
export const SPLITBLOCK_FRONT: Pt = { x: L.splitblock.x - 0.8, z: L.splitblock.z };

/** Where you stand at the telescope: on the knoll's top, on the fire's side of it. */
export const TELESCOPE_FRONT: Pt = (() => {
  const toFire = unit(L.fire.x - L.telescope.x, L.fire.z - L.telescope.z);
  return { x: L.telescope.x + toFire.x * 0.85, z: L.telescope.z + toFire.z * 0.85 };
})();

export const CAMP_PROPS: PropSpec[] = [
  // the bonfire: walk up (or sit on a log) and roast a marshmallow or grill a skewer
  { propId: "bonfire", x: L.fire.x, z: L.fire.z, kind: "bonfire", color: "#ff8c32", defaultOn: true, approachX: L.fire.x, approachZ: L.fire.z + 1.35 },
  // the dock's fishing spots, side by side along its river edge: cast a line from each
  ...FISHING_SPOTS.map((s): PropSpec => ({ propId: s.propId, x: s.stand.x + (s.seat === "seat_canoe" ? 0 : 0.25), z: s.stand.z, kind: "fishing", color: "#7fb7d6", defaultOn: true, approachX: s.approach.x, approachZ: s.approach.z })),
  // the brass telescope on the knoll's top, the Overlook: look up and catch shooting stars
  { propId: "telescope", x: L.telescope.x, z: L.telescope.z, kind: "telescope", color: "#d9a441", defaultOn: true, approachX: TELESCOPE_FRONT.x, approachZ: TELESCOPE_FRONT.z },
  // the Soft Pines round the clearing: fell them (E, a click or a tap), they grow back
  ...CAMP_TREES.map((t): PropSpec => ({ propId: `tree_${t.id}`, x: t.x, z: t.z, kind: "tree", color: "#4f7a3a", defaultOn: true, approachX: t.approachX, approachZ: t.approachZ })),
  // mushrooms and berries under the pines; `on` while there is something to pick
  ...FORAGE_SPOTS.map((f): PropSpec => ({ propId: f.propId, x: f.x, z: f.z, kind: "foraging", color: f.kind === "berries" ? "#8f7bff" : "#d9483b", defaultOn: true, approachX: f.approachX, approachZ: f.approachZ })),
  // the raccoon by the camper van: toss it a treat
  (() => {
    const toFire = unit(L.fire.x - L.critter.x, L.fire.z - L.critter.z);
    return { propId: "critter", x: L.critter.x, z: L.critter.z, kind: "critter", color: "#8c8a91", defaultOn: true, approachX: L.critter.x + toFire.x * 0.9, approachZ: L.critter.z + toFire.z * 0.9 } satisfies PropSpec;
  })(),
  // Barnaby the Angler, at his tackle stall by the dock: sell your creel, buy rods and bait
  { propId: "barnaby", x: L.barnaby.x, z: L.barnaby.z, kind: "angler", color: "#6b8fb5", defaultOn: true, approachX: BARNABY_FRONT.x, approachZ: BARNABY_FRONT.z },
  // Buster the Lumberjack, by the woodpile: buys split wood and carved pieces, sells axes and carriers
  { propId: "buster", x: L.buster.x, z: L.buster.z, kind: "lumberjack", color: "#b3403a", defaultOn: true, approachX: BUSTER_FRONT.x, approachZ: BUSTER_FRONT.z },
  // the carpenter's workbench: carve split wood into artisan pieces
  { propId: "workbench", x: WORKBENCH.x, z: WORKBENCH.z, kind: "workbench", color: "#c98b4f", defaultOn: true, approachX: WORKBENCH_FRONT.x, approachZ: WORKBENCH_FRONT.z },
  // the branch archway at the head of the north path, beside Buster: the trailhead into the
  // Whispering Woods (a Day Trip Permit or the Ranger's Badge from Buster)
  { propId: "woods_gate", x: L.archway.x, z: L.archway.z, kind: "archway", color: "#8a6a3f", defaultOn: true, approachX: CAMP_ARCHWAY_FRONT.x, approachZ: CAMP_ARCHWAY_FRONT.z },
  // the Whispering Pines Slingshot Gallery on the grass by the fence: its counter
  { propId: "slingshot_gallery", x: L.gallery.x, z: L.gallery.z, kind: "slingshot", color: "#c98b4f", defaultOn: true, approachX: GALLERY_FRONT.x, approachZ: GALLERY_FRONT.z },
  // the splitting block on the open grass in front of the camper van: logs into Firewood
  { propId: "splitblock_camp", x: L.splitblock.x, z: L.splitblock.z, kind: "splitblock", color: "#a8743d", defaultOn: true, approachX: SPLITBLOCK_FRONT.x, approachZ: SPLITBLOCK_FRONT.z },
  // the dark grove west of the tipi, alive with fireflies: catch some in a jar
  (() => {
    const toFire = unit(L.fire.x - L.fireflies.x, L.fire.z - L.fireflies.z);
    return { propId: "fireflies", x: L.fireflies.x, z: L.fireflies.z, kind: "fireflies", color: "#e8ff8a", defaultOn: true, approachX: L.fireflies.x + toFire.x * 0.9, approachZ: L.fireflies.z + toFire.z * 0.9 } satisfies PropSpec;
  })(),
];

// --- what you walk round ----------------------------------------------------------------------

// (round things are discs: shared/collision.ts `disc`)
const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r, r });
const square = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });


/** The river as boxes: thin slices down its length, each spanning its banks there (a little in
 *  from them, so you can walk to the water's edge), with the dock left open. */
function riverBoxes(): AABB[] {
  const INSET = 0.12;
  const STEP = 0.35;
  const d = L.dock;
  const cuts = [RIVER_Z.from, d.z0, d.z1, RIVER_Z.to];
  const boxes: AABB[] = [];
  for (let c = 0; c < cuts.length - 1; c++) {
    const [a, b] = [cuts[c], cuts[c + 1]];
    const n = Math.max(1, Math.ceil((b - a) / STEP));
    for (let k = 0; k < n; k++) {
      const z0 = a + ((b - a) * k) / n;
      const z1 = a + ((b - a) * (k + 1)) / n;
      const spans = [z0, (z0 + z1) / 2, z1].map(riverSpan).filter((s): s is { x0: number; x1: number } => !!s);
      if (!spans.length) continue;
      let minX = Math.min(...spans.map((s) => s.x0)) + INSET;
      const maxX = Math.max(...spans.map((s) => s.x1)) - INSET;
      // alongside the dock: only the water off its end
      if (z0 >= d.z0 && z1 <= d.z1) minX = Math.max(minX, d.x1);
      if (maxX > minX) boxes.push({ minX, maxX, minZ: z0, maxZ: z1 });
    }
  }
  return boxes;
}

export const CAMP_OBSTACLES: AABB[] = [
  // the fire: only its logs, inside the stones' inner edge, so you can walk right round it; and
  // the Dutch oven's three tripod legs
  around(L.fire, L.fire.collider),
  ...TRIPOD_LEGS.map((p) => around(p, 0.09)),
  // the firepit's seating: small boxes along each log (straight or curved), so the ring inside it
  // and the walkways between the pieces stay open; the stump and the boulder
  ...FIREPIT.flatMap((piece) => {
    if (piece.kind === "log") {
      const n = Math.max(3, Math.ceil(piece.len / 0.35));
      return Array.from({ length: n + 1 }, (_, k) => {
        const t = (k / n - 0.5) * (piece.len - 0.3);
        return around({ x: piece.at.x + piece.along.x * t, z: piece.at.z + piece.along.z * t }, 0.2);
      });
    }
    if (piece.kind === "curved") {
      const n = 8;
      return Array.from({ length: n + 1 }, (_, k) => {
        const b = piece.angle + (k / n - 0.5) * (piece.arc - 0.12);
        return around({ x: L.fire.x + Math.cos(b) * piece.r, z: L.fire.z + Math.sin(b) * piece.r }, 0.2);
      });
    }
    return [around(piece.at, piece.kind === "boulder" ? 0.36 : 0.24)];
  }),
  // the river, less the dock
  ...riverBoxes(),
  // the dock's lantern posts
  ...L.lanterns.map((p) => around(p, 0.12)),
  // the tipi (you lie down inside it: the seat is within its box, as a sofa's is)
  around(L.tent, L.tent.r - 0.15),
  // the woodpile
  { minX: L.woodpile.x - 0.6, maxX: L.woodpile.x + 1.0, minZ: L.woodpile.z - 0.5, maxZ: L.woodpile.z + 0.6 },
  // the pines' trunks (the Soft Pines you fell too: a stump is in the way as well) and the boulders
  ...L.trees.map((t) => around(t, 0.42 * Math.max(0.8, t.s))),
  ...CAMP_TREES.map((t) => around(t, 0.36)),
  ...L.rocks.map((r) => around(r, 0.45 * r.s)),
  // the picnic table, its benches and the cooler at its end; the telescope's tripod
  { minX: L.picnic.x - 0.92, maxX: L.picnic.x + 1.5, minZ: L.picnic.z - 0.78, maxZ: L.picnic.z + 0.78 },
  around(L.telescope, 0.3),
  // the camper van, its awning's two front poles and the camp chair under it, the critter
  { minX: L.van.x - L.van.len / 2 - 0.05, maxX: L.van.x + L.van.len / 2 + 0.05, minZ: L.van.z - L.van.w / 2 - 0.05, maxZ: L.van.z + L.van.w / 2 + 0.05 },
  ...AWNING_POLES.map((p) => around(p, 0.08)),
  around(L.campChair, 0.3),
  around(L.critter, 0.22),
  // the slingshot gallery: its counter, the posts of its three rails and its hay-bale backstop
  { minX: L.gallery.x - L.gallery.len / 2, maxX: L.gallery.x + L.gallery.len / 2, minZ: L.gallery.z - 0.28, maxZ: L.gallery.z + 0.28 },
  { minX: L.gallery.x - L.gallery.len / 2 - 0.1, maxX: L.gallery.x + L.gallery.len / 2 + 0.1, minZ: L.gallery.rails[0] - 0.12, maxZ: L.gallery.back + 0.3 },
  // the archway's two posts either side of its opening, and the splitting block
  around({ x: L.archway.x - L.archway.w / 2 - 0.1, z: L.archway.z }, 0.18),
  around({ x: L.archway.x + L.archway.w / 2 + 0.1, z: L.archway.z }, 0.18),
  around(L.splitblock, 0.33),
  // the dressing you walk round: lantern posts, Buster's crates, the barrels, fallen logs (small
  // boxes along each), stumps
  ...L.dressing.lanternPosts.map((p) => around(p, 0.1)),
  ...L.dressing.crates.map((p) => square(p, 0.42)),
  ...L.dressing.barrels.map((p) => around(p, 0.27)),
  ...L.dressing.fallen.flatMap((f) => {
    const n = Math.max(2, Math.ceil(f.len / 0.4));
    return Array.from({ length: n + 1 }, (_, k) => around({ x: f.x + Math.sin(f.yaw) * (k / n - 0.5) * (f.len - 0.3), z: f.z + Math.cos(f.yaw) * (k / n - 0.5) * (f.len - 0.3) }, 0.2));
  }),
  ...L.dressing.stumps.map((p) => around(p, 0.24)),
  // the birches that are not felled (none since patch 0.7.55), and the waist-high shrubs
  ...(L.dressing.birches as readonly (readonly number[])[]).map(([x, z, s]) => around({ x, z }, 0.3 * s)),
  // the dead standing trees at the rims
  ...L.dressing.snags.map(([x, z]) => around({ x, z }, 0.2)),
  ...L.dressing.shrubs.map(([x, z, s]) => around({ x, z }, 0.34 * s)),
  // the pole the lights are strung from, the signpost
  around(L.stringPole, 0.1),
  around(L.signpost, 0.12),
  // the guitar case lying open in the grove, and the lantern on the grass beside it
  around(L.guitarCase, 0.5),
  around(L.groundLantern, 0.15),
  // Buster and his sawhorse of logs (to his right, the camera's left)
  around(L.buster, 0.34),
  around({ x: L.buster.x - Math.cos(L.buster.yaw) * 0.7, z: L.buster.z + Math.sin(L.buster.yaw) * 0.7 }, 0.3),
  // the workbench (and its tool rack at the back): three boxes along its length
  ...[-0.45, 0, 0.45].map((t) => around({ x: WORKBENCH.x + WORKBENCH.along.x * t, z: WORKBENCH.z + WORKBENCH.along.z * t }, 0.32)),
  // Barnaby and his tackle crate
  around(L.barnaby, 0.34),
  around({ x: L.barnaby.x + Math.cos(L.barnaby.yaw) * 0.62, z: L.barnaby.z - Math.sin(L.barnaby.yaw) * 0.62 }, 0.26),
  // his chalkboard, beside him (its easel's feet)
  around(BARNABY_BOARD, 0.32),
  around(BUSTER_BOARD, 0.32),
  // --- the places (all inside the open areas, off the walks between trees and stalls) ---
  // the hammocks (you lie in one: its seat is within, as the tipi's is)
  ...HAMMOCKS.flatMap((h) => [-0.5, 0, 0.5].map((t) => around({ x: h.mid.x + h.along.x * t, z: h.mid.z + h.along.z * t }, 0.28))),
  // the glade's log and stumps
  ...[-0.5, 0, 0.5].map((t) => around({ x: GLADE.log.at.x + GLADE.log.along.x * t, z: GLADE.log.at.z + GLADE.log.along.z * t }, 0.2)),
  ...GLADE.stumps.map((s) => around(s, 0.22)),
  // the swing: its bench, and the A-frame at each end of the beam
  { minX: SWING.x - 0.28, maxX: SWING.x + 0.28, minZ: SWING.z - 0.68, maxZ: SWING.z + 0.68 },
  ...([-1, 1] as const).map((s) => ({ minX: SWING.x - 0.55, maxX: SWING.x + 0.55, minZ: SWING.z + s * SWING.span - 0.1, maxZ: SWING.z + s * SWING.span + 0.1 })),
  // the River's End: the flat rock, the driftwood log, the willow's trunk
  around(RIVER_END.rock, 0.32),
  ...[-0.35, 0.35].map((t) => around({ x: RIVER_END.log.x, z: RIVER_END.log.z + t }, 0.2)),
  around(RIVER_END.willow, 0.28),
];

export const CAMP_SPAWNS: Pt[] = L.spawns;
