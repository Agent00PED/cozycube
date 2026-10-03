import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";
import { ORE_KINDS, type OreKind } from "../caverns_mining";
import type { MapId } from "../types";
import { REEF_NODES } from "./beach";

// The Glimmering Caverns (the map "glimmering_caverns"): a 45 x 45 karst cavern after Hang Son Doong,
// reached only through the old mine adit behind the Whispering Woods' Autumn Maples (Old Flint the
// Badger keeps it: meeting him hands you the Rusted Pickaxe and opens it to you for good). Like every
// world, it is the one room's: going down the adit is a trip. The design it follows is written down in
// docs/caverns-design.md.
//
// The camera always looks north-west from the south-east, so the cavern is high in the north-west and
// low in the south-east: every level steps down toward the camera, and every cliff between two levels
// faces it (you see it as a cliff). A level change is either such a cliff or a ramp carved across it,
// never a soft slope that secretly blocks. One zone per ore, in the order you go down:
//
//   The Expedition Basecamp  the north shelf (6 m): the adit (you arrive here), Gus the Mole's camp,
//                            the Basalt Crucible Forge in the north wall and the Geode Anvil
//   The Doline Jungle        the shelf's west (6.5 m), under the collapsed roof: T1 copper; a waterfall
//                            drops through the collapse into a plunge pool and a stream runs south
//   The Coal Breakdown       the shelf's east (5.5 m), the collapse's fallen blocks: T1 coal; the winch
//                            lift at its south edge down to the rift
//   The Iron Mudflats        the west (4.5 m) under the jungle's cliff, down its rope descent: T2 iron;
//                            the stream crosses it (two fords)
//   The Pearl Terraces       three rimstone steps down the south-west (3.6, 2.4, 1.2 m), each with a
//                            warm pool (the soak: the Deep Warmth, seven seats), the stream spilling
//                            through them and over the last step into the lake: T3 silver
//   The Hound's Overlook     a plateau (3 m) under the basecamp's cliff with the Hound's Hand, a giant
//                            stalagmite; the switchback comes down to it, and ramps go on to the lake
//                            and the rift
//   The Glimmer Rift         the low east (1 m) under the breakdown's cliff, crystals in its face: T4
//                            glimmer; the winch goes back up from here
//   The Great Lake           the south (its water at 0 m): the islet under a second skylight with the
//                            T5 Titan Monolith, a stepping-stone causeway out to it, Finnegan the Grotto
//                            Angler on the north shore; it drains east over the rim into the dark
//
// The ground is one function (cavernsHeight), sampled on a 0.5 m grid: that grid, triangulated one way
// (see cavernsFloorY), IS the floor, where the room walks you, where the avatar's feet land, and the
// client's click collider; the Blender builder builds the diorama's ground from the very same grid
// (scripts/blender/data/caverns_terrain.json, written by `npm run caverns-terrain`, kept in step by
// `npm run check-layout`). Where you can stand is a 0.25 m mask over it (cavernsWalkable): nowhere
// steeper than STEEPEST_WALK, never in the water, the pools or the stream (but at its fords), never in
// a rock.

type Pt = { x: number; z: number };

export const CAVERNS_LAYOUT = /* layout:begin */ {
  "half": 22.5,
  "walls": {"north": -22.5, "west": -22.5, "height": 11.0, "margin": 0.75},
  "low": 0.4,
  "zones": [
    {"id": "basecamp", "name": "The Expedition Basecamp", "x0": -9.0, "x1": 9.0, "z0": -22.5, "z1": -12.25},
    {"id": "jungle", "name": "The Doline Jungle", "x0": -22.5, "x1": -9.0, "z0": -22.5, "z1": -12.25},
    {"id": "breakdown", "name": "The Coal Breakdown", "x0": 9.0, "x1": 22.5, "z0": -22.5, "z1": -12.25},
    {"id": "overlook", "name": "The Hound's Overlook", "x0": -8.5, "x1": 11.0, "z0": -12.25, "z1": -3.0},
    {"id": "mudflats", "name": "The Iron Mudflats", "x0": -22.5, "x1": -6.5, "z0": -12.25, "z1": 1.5},
    {"id": "rift", "name": "The Glimmer Rift", "x0": 11.0, "x1": 22.5, "z0": -12.25, "z1": 5.5},
    {"id": "terraces", "name": "The Pearl Terraces", "x0": -22.5, "x1": -5.5, "z0": 1.5, "z1": 22.5},
    {"id": "lake", "name": "The Great Lake", "x0": -22.5, "x1": 22.5, "z0": -12.25, "z1": 22.5}
  ],
  "shelf": {
    "h": 6.0,
    "west": 0.5,
    "east": -0.5,
    "edge": [
      [-22.5, -10.4],
      [-19.5, -10.0],
      [-16.5, -10.6],
      [-13.5, -10.2],
      [-11.0, -11.2],
      [-9.0, -12.2],
      [-6.5, -12.8],
      [-4.0, -12.4],
      [-1.5, -12.9],
      [1.5, -13.2],
      [4.5, -12.7],
      [7.5, -12.9],
      [10.0, -12.4],
      [12.5, -12.7],
      [15.0, -12.2],
      [17.5, -12.8],
      [20.0, -12.4],
      [22.5, -12.7]
    ],
    "cliff": 0.45
  },
  "levels": [
    {"id": "rift", "h": 1.0, "cliff": 1.7, "mouth": {"z0": 0.0, "z1": 4.0, "cliff": 3.0, "drop": 0.6}, "wob": 0.45, "poly": [[8.0, -16.0], [23.5, -16.0], [23.5, 5.6], [19.8, 5.0], [16.6, 4.7], [14.2, 4.5], [13.3, 3.2], [13.0, 1.0], [12.4, -1.6], [10.2, -3.4], [8.0, -4.2]]},
    {"id": "terraceC", "h": 1.2, "cliff": 0.16, "wob": 0.3, "poly": [[-23.5, 2.0], [-6.4, 2.0], [-6.6, 8.0], [-6.9, 12.0], [-7.8, 14.8], [-9.8, 16.2], [-12.4, 15.8], [-14.8, 16.8], [-17.4, 16.4], [-20.0, 17.2], [-23.5, 16.6]]},
    {"id": "terraceB", "h": 2.4, "cliff": 0.16, "wob": 0.3, "poly": [[-23.5, 1.0], [-6.0, 1.0], [-5.6, 4.8], [-6.8, 7.6], [-8.8, 9.8], [-11.2, 10.6], [-13.6, 11.6], [-16.2, 11.2], [-18.4, 12.0], [-20.8, 11.4], [-23.5, 12.0]]},
    {"id": "terraceA", "h": 3.6, "cliff": 0.16, "wob": 0.3, "poly": [[-23.5, 0.0], [-6.8, 0.0], [-6.2, 2.2], [-7.4, 4.0], [-9.6, 5.3], [-11.6, 5.75], [-13.8, 6.95], [-16.4, 6.9], [-18.6, 7.6], [-21.0, 7.0], [-23.5, 7.4]]},
    {"id": "overlook", "h": 3.0, "cliff": 0.42, "wob": 0.4, "poly": [[-9.2, -13.6], [11.6, -13.6], [11.4, -10.8], [10.4, -8.6], [10.9, -6.4], [9.6, -4.8], [7.4, -3.8], [4.6, -3.5], [1.8, -4.1], [-1.2, -3.4], [-4.2, -3.9], [-6.4, -4.8], [-8.2, -3.6], [-8.8, -6.0], [-8.4, -9.2]]},
    {"id": "mudflats", "h": 4.5, "cliff": 0.42, "wob": 0.4, "poly": [[-23.5, -13.5], [-8.2, -13.5], [-8.6, -11.2], [-7.6, -9.4], [-8.4, -7.2], [-7.0, -5.4], [-7.6, -3.4], [-6.4, -1.6], [-7.4, 0.2], [-9.4, 0.6], [-11.4, 1.6], [-13.6, 0.9], [-15.8, 1.9], [-18.2, 1.1], [-20.4, 2.0], [-23.5, 1.4]]}
  ],
  "paths": [
    {"id": "ropeDescent", "half": 1.1, "points": [[-8.8, -13.9, 6.02], [-11.0, -10.0, 4.5]]},
    {"id": "switchback", "half": 1.2, "points": [[-3.0, -14.0, 6.0], [8.0, -10.4, 3.0]]},
    {"id": "lakeRamp", "half": 1.1, "points": [[10.0, -6.9, 3.0], [3.8, -1.4, 0.4]]},
    {"id": "pearlTrail", "half": 1.1, "points": [[-10.8, -1.0, 4.5], [-8.7, 4.5, 3.3], [-8.1, 9.5, 2.05], [-7.6, 15.2, 0.55], [-7.3, 16.6, 0.4]]}
  ],
  "river": {
    "half": 0.55,
    "depth": 0.28,
    "segments": [
      [[-16.8, -19.4], [-16.4, -17.2], [-17.0, -15.0], [-16.2, -12.6], [-14.9, -10.2], [-15.2, -7.8], [-16.8, -5.6], [-17.6, -3.2], [-17.0, -0.8], [-16.8, 1.4], [-16.9, 3.4]],
      [[-15.4, 14.2], [-13.0, 14.8], [-10.0, 15.0], [-8.0, 14.6], [-6.4, 14.2], [-4.8, 13.8], [-3.2, 13.5], [-2.2, 13.3]]
    ],
    "fords": [[-16.7, -16.1, 1.2], [-16.0, -6.7, 1.2], [-7.8, 14.6, 1.3]],
    "plunge": {"x": -16.8, "z": -19.9, "r": 1.3, "fall": [-16.9, -22.3], "level": 6.44}
  },
  "lake": {"x": 6.5, "z": 10.0, "rx": 10.4, "rz": 8.0, "water": 0.0, "depth": 1.5, "shelfDepth": 0.45, "beach": 1.35, "wade": 1.0},
  "islet": {"x": 7.5, "z": 11.0, "r": 3.2, "top": 0.35},
  "causeway": {
    "points": [[16.4, 7.9], [12.8, 9.6], [9.0, 10.9]],
    "half": 1.0,
    "y": -0.12
  },
  "skylight": {"x": 7.5, "z": 11.0, "r": 3.2},
  "hearth": {"x": -3.2, "z": -7.7, "r": 0.5},
  "hearthSeats": [
    {"id": "hearth_1", "x": -4.73, "z": -7.43, "face": 1.745, "exit": {"x": -5.51, "z": -7.29}},
    {"id": "hearth_2", "x": -3.86, "z": -6.30, "face": 2.705, "exit": {"x": -4.19, "z": -5.57}},
    {"id": "hearth_3", "x": -2.42, "z": -6.36, "face": -2.618, "exit": {"x": -2.02, "z": -5.66}},
    {"id": "hearth_4", "x": -1.67, "z": -7.43, "face": -1.745, "exit": {"x": -0.89, "z": -7.29}}
  ],
  "photo": {"x": -0.3, "z": -7.4, "face": 1.571},
  "pages": [[-11.6, -16.2], [20.4, -13.2], [-17.6, -9.4], [0.4, -8.4], [18.0, -6.4], [-1.0, 17.0]],
  "terraces": {
    "x0": -21.67,
    "x1": -11.27,
    "pools": [
      {"x": -16.9, "z": 4.15, "rx": 3.0, "rz": 1.3, "rot": 0.12, "y": 3.48},
      {"x": -13.8, "z": 8.5, "rx": 2.4, "rz": 1.05, "rot": -0.22, "y": 2.28},
      {"x": -18.4, "z": 14.0, "rx": 3.2, "rz": 1.5, "rot": 0.1, "y": 1.08}
    ]
  },
  "thermalSeats": [
    {"id": "thermal_1", "x": -15.02, "z": 4.25, "face": 1.5951, "exit": {"x": -12.98, "z": 4.2}},
    {"id": "thermal_2", "x": -15.9, "z": 3.47, "face": 2.1369, "exit": {"x": -14.38, "z": 2.51}},
    {"id": "thermal_3", "x": -12.53, "z": 8.98, "face": 1.4748, "exit": {"x": -10.61, "z": 9.17}},
    {"id": "thermal_4", "x": -12.42, "z": 7.86, "face": 2.0126, "exit": {"x": -10.74, "z": 7.07}},
    {"id": "thermal_5", "x": -14.8, "z": 3.7, "face": 1.78, "exit": {"x": -12.95, "z": 3.3}},
    {"id": "thermal_6", "x": -16.2, "z": 13.6, "face": 1.7506, "exit": {"x": -13.97, "z": 13.19}},
    {"id": "thermal_7", "x": -17.3, "z": 13.17, "face": 2.2151, "exit": {"x": -15.91, "z": 12.13}}
  ],
  "capybara": {"x": -18.8, "z": 4.2, "yaw": 1.4},
  "adit": {"x": 0.0, "z": -22.1, "w": 2.0, "h": 2.6},
  "aditYard": {"cart": [1.85, -20.45], "spoil": [2.35, -21.2], "tools": [1.45, -21.45], "sign": [-1.4, -20.5]},
  "arrival": {"x": 0.0, "z": -19.5},
  "gus": {"x": -5.2, "z": -20.55, "yaw": 0},
  "workstation": {"x": -5.2, "z": -19.7, "len": 2.4, "w": 0.7, "top": 0.78},
  "camp": {
    "posts": [[-7.5, -20.2], [-2.9, -20.2]],
    "wall": -22.05,
    "ridge": 3.25,
    "eave": 2.5,
    "crates": [-6.85, -21.2],
    "bins": [-3.75, -21.2],
    "rack": [-5.2, -21.95],
    "transit": [-8.45, -18.9]
  },
  "forge": {"x": 6.8, "z": -21.3, "w": 3.0, "d": 1.8, "h": 3.2},
  "anvil": {"x": 3.7, "z": -19.9, "outcrop": 0.62},
  "crate": {"x": 4.65, "z": -20.75, "w": 0.9, "d": 0.6, "h": 0.55},
  "winch": {"x": 13.2, "top": -13.4, "bottom": -11.5, "upper": -14.4, "lower": -10.6, "deck": [[14.5, -11.5], [14.95, -12.25], [14.95, -13.15]], "upperAt": [15.05, -13.7]},
  "raft": {"north": [6.5, 0.75], "islet": [5.9, 12.0], "via": [[6.5, 2.2], [5.9, 5.0], [4.8, 8.4], [4.7, 11.5]]},
  "monolithRing": {"r": 2.2, "circle": 1.5, "stones": [[48, 1.35, 0], [95, 1.05, 0], [130, 0, 1], [215, 1.5, 0], [300, 1.15, 0]]},
  "finnegan": {"x": -1.33, "z": 2.15, "yaw": 0.25, "log": 1.5},
  "nodes": [
    {"id": "copper_1", "kind": "copper", "x": -11.8, "z": -21.35, "face": [0, 1]},
    {"id": "copper_2", "kind": "copper", "x": -13.4, "z": -17.4, "face": [0.6, 0.8]},
    {"id": "copper_3", "kind": "copper", "x": -13.2, "z": -15.0, "face": [0.3, 1]},
    {"id": "copper_4", "kind": "copper", "x": -21.35, "z": -18.0, "face": [1, 0]},
    {"id": "copper_5", "kind": "copper", "x": -19.4, "z": -14.5, "face": [0.6, 0.8]},
    {"id": "coal_1", "kind": "coal", "x": 11.8, "z": -21.35, "face": [0, 1]},
    {"id": "coal_2", "kind": "coal", "x": 15.6, "z": -21.35, "face": [0, 1]},
    {"id": "coal_3", "kind": "coal", "x": 12.6, "z": -17.2, "face": [-0.5, 0.87]},
    {"id": "coal_4", "kind": "coal", "x": 17.8, "z": -18.2, "face": [0, 1]},
    {"id": "coal_5", "kind": "coal", "x": 19.8, "z": -15.0, "face": [-0.6, 0.8]},
    {"id": "iron_1", "kind": "iron", "x": -21.35, "z": -7.6, "face": [1, 0]},
    {"id": "iron_2", "kind": "iron", "x": -21.35, "z": -4.2, "face": [1, 0.1]},
    {"id": "iron_3", "kind": "iron", "x": -20.0, "z": -1.9, "face": [0.6, 0.8]},
    {"id": "iron_4", "kind": "iron", "x": -12.9, "z": -8.0, "face": [-0.3, 0.95]},
    {"id": "iron_5", "kind": "iron", "x": -10.9, "z": -5.6, "face": [-0.7, 0.7]},
    {"id": "iron_6", "kind": "iron", "x": -13.3, "z": -2.3, "face": [0.3, 0.95]},
    {"id": "silver_1", "kind": "silver", "x": -10.2, "z": 3.4, "face": [1, 0]},
    {"id": "silver_2", "kind": "silver", "x": -9.4, "z": 10.4, "face": [1, 0.3]},
    {"id": "silver_3", "kind": "silver", "x": -10.8, "z": 12.8, "face": [1, 0]},
    {"id": "silver_4", "kind": "silver", "x": -12.4, "z": 17.8, "face": [1, 0]},
    {"id": "silver_5", "kind": "silver", "x": -8.4, "z": 18.9, "face": [0.6, -0.8]},
    {"id": "glimmer_1", "kind": "glimmer", "x": 16.0, "z": -11.35, "face": [0, 1]},
    {"id": "glimmer_2", "kind": "glimmer", "x": 19.6, "z": -11.35, "face": [0, 1]},
    {"id": "glimmer_3", "kind": "glimmer", "x": 20.4, "z": -7.9, "face": [0, 1]},
    {"id": "glimmer_4", "kind": "glimmer", "x": 18.8, "z": -8.9, "face": [0, 1]},
    {"id": "monolith", "kind": "monolith", "x": 7.6, "z": 11.2, "face": [-0.3, -0.95]},
    {"id": "rockfall", "kind": "rockfall", "x": 16.6, "z": -15.0, "face": [1, -0.3]}
  ],
  "boulders": [[10.9, -10.1, 0.5], [17.9, -16.3, 0.8], [18.6, -20.4, 0.7], [21.0, -18.6, 0.6], [-14.6, -21.0, 0.7], [-10.4, -18.8, 0.55]],
  "trees": [[-20.6, -21.0, 9.5, 0.4], [-18.6, -21.1, 8.0, 1.9], [-21.0, -15.6, 8.5, 3.1], [-9.9, -21.1, 7.0, 4.4], [-18.8, -16.4, 6.5, 5.3], [-12.2, -19.4, 6.0, 0.9], [-20.2, -11.6, 7.5, 2.4]],
  "slabs": [[15.4, -17.0, 1.1, 0.4], [20.8, -20.8, 0.9, 1.1], [17.6, -13.5, 0.8, 2.0], [10.9, -18.6, 0.8, 2.6]],
  "campProps": [[-8.35, -21.0, "barrels", 0.3], [-2.05, -21.25, "crates", 0.0], [-6.4, -14.5, "board", 0.6], [-4.6, -13.2, "post", 0], [9.6, -19.6, "post", 0], [-7.6, -19.9, "sacks", 0], [-5.0, -9.8, "tent", 0.7], [-1.5, -10.0, "tent", -0.65], [-5.0, -9.8, "bedroll", 0.7], [-1.5, -10.0, "bedroll", -0.65], [-6.6, -10.4, "crates", 0.2], [0.3, -9.4, "barrels", 0.4], [-6.5, -6.0, "sacks", 0], [-2.2, -10.6, "post", 0], [-5.9, -5.6, "post", 0], [-1.0, -5.9, "firewood", 0.3], [-5.1, -4.9, "rack", 0.0]],
  "stubs": [[13.6, -9.0, 0.6], [20.6, -4.8, 0.6], [14.6, -1.0, 0.5], [19.0, 2.8, 0.5]],
  "stalagmites": [[-7.2, -11.4, 0.35, 1.5], [-6.2, -5.6, 0.3, 1.1], [8.8, -7.2, 0.3, 1.0], [10.1, -9.3, 0.36, 1.9], [9.3, -9.8, 0.26, 1.2], [10.7, -8.6, 0.22, 0.8]],
  "crag": [5.4, 13.6, 1.0, 2.2],
  "pearls": [[-19.0, 17.4, 0.7], [-15.5, 19.6, 0.6], [-11.0, 20.4, 0.55], [-20.2, 20.6, 0.5], [-5.5, 19.8, 0.5]],
  "crystals": [[14.4, -11.8, 1.0], [17.8, -11.9, 1.1], [20.6, -11.2, 0.9], [20.4, -4.2, 0.8], [15.0, -5.4, 0.7]],
  "shrooms": [[15.2, -9.8, 0.8], [20.9, -1.6, 0.7], [13.6, -3.6, 0.6], [18.8, 2.2, 0.7]],
  "fractures": [[14.0, -12.2, 0], [17.6, -12.2, 0], [20.4, -12.2, 0]],
  "beams": [[-13.0, -18.6, 1.8], [-19.4, -15.4, 1.3], [-11.2, -13.8, 1.2], [-15.2, -13.6, 1.0], [-20.2, -20.4, 1.1]],
  "sun": {"from": [-10.0, 21.0, -14.0], "at": [-15.0, 6.5, -17.0]},
  "lights": {"forge": [6.8, 0.85, -20.1], "thermal": [-15.8, 1.2, 8.6], "cenote": [7.5, 1.4, 11.0]},
  "spawns": [
    {"x": 0.0, "z": -19.5},
    {"x": 0.9, "z": -18.8},
    {"x": -0.9, "z": -18.8}
  ]
} /* layout:end */;

const L = CAVERNS_LAYOUT;

// --- the ground -------------------------------------------------------------------------------------------

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth01 = (t: number) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};
const smoothstep = (e0: number, e1: number, x: number) => smooth01((x - e0) / (e1 - e0));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** A soft wavy field in about -1..1 (a few crossed sines: the same on every machine). */
function wave(x: number, z: number, seed: number): number {
  return 0.5 * Math.sin(x * 0.61 + seed * 1.7 + Math.sin(z * 0.43 + seed) * 1.3) + 0.35 * Math.sin(z * 0.83 - seed * 0.9 + Math.sin(x * 0.57) * 1.1) + 0.15 * Math.sin((x + z) * 1.9 + seed * 2.3);
}

/** Signed distance to a polygon (negative inside). */
function polygonDistance(x: number, z: number, poly: readonly (readonly number[])[]): number {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const vx = bx - ax;
    const vz = bz - az;
    const t = clamp01(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz));
    d = Math.min(d, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
    if (bz > z !== az > z && x < ((ax - bx) * (z - bz)) / (az - bz) + bx) inside = !inside;
  }
  return inside ? -d : d;
}
/** The nearest point of a polyline ([x, z, ...] points) to (x, z): how far, and how far along its
 *  nearest stretch (0..1) and which stretch. */
function polylineNear(x: number, z: number, pts: readonly (readonly number[])[]): { d: number; i: number; t: number } {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const t = clamp01(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz));
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    if (d < best.d) best = { d, i, t };
  }
  return best;
}

/** How far out on the lake a point is, against its shore: under 1 the water (0 its middle), 1 the
 *  waterline, above it the beach and the land (a wobbly ellipse, never a clean one). */
export function lakeFactor(x: number, z: number): number {
  const dx = (x - L.lake.x) / L.lake.rx;
  const dz = (z - L.lake.z) / L.lake.rz;
  const a = Math.atan2(dz, dx);
  // (a shore of coves and points, never a clean ellipse)
  const wob = 1 + 0.08 * Math.sin(2 * a + 0.4) + 0.06 * Math.sin(3 * a + 0.7) + 0.04 * Math.sin(5 * a + 2.1) + 0.025 * Math.sin(9 * a + 1.3);
  return Math.hypot(dx, dz) / wob;
}
/** How far from the islet's middle, against its rocky shore (under 1: the islet). */
export function isletFactor(x: number, z: number): number {
  const dx = x - L.islet.x;
  const dz = z - L.islet.z;
  const a = Math.atan2(dz, dx);
  const r = L.islet.r * (1 + 0.1 * Math.sin(3 * a + 1.0) + 0.05 * Math.sin(7 * a + 0.4));
  return Math.hypot(dx, dz) / r;
}
/** How far a point is from the causeway's spine (m): the stepping stones out to the islet. */
export function causewayDistance(x: number, z: number): number {
  return polylineNear(x, z, L.causeway.points).d;
}
export const onCauseway = (x: number, z: number) => causewayDistance(x, z) <= L.causeway.half;
/** Whether (x, z) is the lake's water (the islet's top and the causeway are not). */
export function inLakeWater(x: number, z: number): boolean {
  return lakeFactor(x, z) < L.lake.wade && isletFactor(x, z) >= 0.8 && !onCauseway(x, z);
}

/** How far a point is from the stream (m), over all its reaches, and from the plunge pool's rim. */
export function riverDistance(x: number, z: number): number {
  let d = Infinity;
  for (const seg of L.river.segments) d = Math.min(d, polylineNear(x, z, seg).d);
  return d;
}
/** How much of a ford (x, z) is: 1 across its middle, 0 outside it. */
function fordAt(x: number, z: number): number {
  let k = 0;
  for (const [fx, fz, r] of L.river.fords) k = Math.max(k, 1 - smoothstep(r * 0.6, r, Math.hypot(x - fx, z - fz)));
  return k;
}
const plungeDistance = (x: number, z: number) => Math.hypot(x - L.river.plunge.x, z - L.river.plunge.z) - L.river.plunge.r;

type Pool = (typeof L.terraces.pools)[number];
/** A pool's rim, in and out round it (`i` its index): a rimstone basin's scallops, never an oval. The
 *  builder draws the same rim (build_caverns.py pool_outline). */
export function poolWobble(i: number, a: number): number {
  return 1 + 0.07 * Math.sin(3 * a + 1.3 * i + 0.4) + 0.045 * Math.sin(5 * a + 2.1 * i + 1.1);
}
/** A pool's signed distance (m, negative inside): its turned ellipse, scalloped (about true near the
 *  rim, which is all that is asked of it). */
function poolDistance(x: number, z: number, p: Pool, i: number): number {
  const dx = x - p.x;
  const dz = z - p.z;
  const c = Math.cos(p.rot);
  const sn = Math.sin(p.rot);
  const u = (dx * c + dz * sn) / p.rx;
  const v = (-dx * sn + dz * c) / p.rz;
  const q = Math.hypot(u, v);
  const a = Math.atan2(v, u);
  return (q / poolWobble(i, a) - 1) * Math.min(p.rx, p.rz);
}
/** A pool's outline as the builder draws it (waters.py pool_outline): `segs` points round it, grown by
 *  `grow` metres. */
function poolOutline(p: Pool, i: number, grow: number, segs: number): [number, number][] {
  const k = 1 + grow / Math.min(p.rx, p.rz);
  const c = Math.cos(p.rot);
  const sn = Math.sin(p.rot);
  const out: [number, number][] = [];
  for (let j = 0; j < segs; j++) {
    const a = (2 * Math.PI * j) / segs;
    const w = poolWobble(i, a) * k;
    const u = p.rx * w * Math.cos(a);
    const v = p.rz * w * Math.sin(a);
    out.push([p.x + u * c - v * sn, p.z + u * sn + v * c]);
  }
  return out;
}
/** Each pool's overflow into the next (docs/caverns-roadmap.md R8.5): from its rim where it faces the
 *  next pool to the nearest point of the next one's rim (the builder's rivulet: rims.py pool_ends), and
 *  the two pools' water heights. */
export const POOL_OVERFLOWS = L.terraces.pools.slice(0, -1).map((a, i) => {
  const b = L.terraces.pools[i + 1];
  const aOut = Math.atan2(b.z - a.z, b.x - a.x);
  const adiff = (u: number) => Math.abs(((u - aOut + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  const pa = poolOutline(a, i, 0.02, 56).reduce((best, q) => (adiff(Math.atan2(q[1] - a.z, q[0] - a.x)) < adiff(Math.atan2(best[1] - a.z, best[0] - a.x)) ? q : best));
  const pb = poolOutline(b, i + 1, 0.02, 56).reduce((best, q) => (Math.hypot(q[0] - pa[0], q[1] - pa[1]) < Math.hypot(best[0] - pa[0], best[1] - pa[1]) ? q : best));
  return { ax: pa[0], az: pa[1], ay: a.y, bx: pb[0], bz: pb[1], by: b.y };
});
/** The pool (x, z) lies in, or -1. */
function poolAt(x: number, z: number, pad = 0): number {
  return L.terraces.pools.findIndex((p, i) => poolDistance(x, z, p, i) < pad);
}

/** A trail's hold on the ground at (x, z): how much (1 on its tread, easing to 0 over its shoulders,
 *  SHOULDER m wide) and the height it asks for there. Each of its stretches asks for its own height,
 *  the nearer ones far louder (a high power of their holds), so where two stretches pass close the
 *  ground between them banks from one down to the other, never a step. */
const SHOULDER = 1.6;
function pathHeight(x: number, z: number, p: (typeof L.paths)[number]): { w: number; h: number } {
  const pts = p.points;
  let w = 0;
  let sum = 0;
  let sumW = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az, ah] = pts[i];
    const [bx, bz, bh] = pts[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const t = clamp01(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz));
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    const wi = 1 - smoothstep(p.half, p.half + SHOULDER, d);
    if (wi <= 0) continue;
    const k = wi ** 8;
    sum += k * mix(ah, bh, t);
    sumW += k;
    w = Math.max(w, wi);
  }
  return { w, h: sumW > 0 ? sum / sumW : 0 };
}

type Level = (typeof L.levels)[number];
const LEVEL_SEED: Record<string, number> = { rift: 3, terraceC: 5, terraceB: 7, terraceA: 9, overlook: 11, mudflats: 13 };
/** A level's signed distance to its rim (negative on it): its outline, wobbling (a rimstone dam, a
 *  bluff's edge: never a line drawn with a ruler). */
function levelDistance(lv: Level, x: number, z: number): number {
  const s = LEVEL_SEED[lv.id] ?? 1;
  return polygonDistance(x, z, lv.poly) + lv.wob * wave(x * 0.9, z * 0.9, s) + 0.35 * lv.wob * wave(x * 2.3, z * 2.3, s + 17);
}
/** How much of a level a point is (1 on it, 0 at the foot of its cliff). */
function levelWeight(lv: Level, x: number, z: number): number {
  // (the rift's mouth onto the lake's shore a broad slope walked down, never a bank too steep to stand
  // on with nothing drawn on it: docs/caverns-roadmap.md R8.7)
  const m = "mouth" in lv ? lv.mouth : undefined;
  const c = m ? mix(lv.cliff, m.cliff, smoothstep(m.z0, m.z1, z)) : lv.cliff;
  return 1 - smoothstep(-c, c, levelDistance(lv, x, z));
}
/** The north shelf's south edge at x: through its points (eased from one to the next), wobbling. The
 *  builder traces the same line (build_caverns.py shelf_rim_z). */
export function shelfEdgeZ(x: number): number {
  const e = L.shelf.edge;
  let z = e[e.length - 1][1];
  if (x <= e[0][0]) z = e[0][1];
  else {
    for (let i = 0; i + 1 < e.length; i++) {
      if (x > e[i + 1][0]) continue;
      z = mix(e[i][1], e[i + 1][1], smooth01((x - e[i][0]) / (e[i + 1][0] - e[i][0])));
      break;
    }
  }
  return z + 0.35 * wave(x * 0.7, 0.3, 21) + 0.12 * wave(x * 2.1, 1.7, 23);
}
/** The north shelf's rim (negative on it). */
function shelfDistance(x: number, z: number): number {
  return z - shelfEdgeZ(x);
}
function shelfWeight(x: number, z: number): number {
  return 1 - smoothstep(-L.shelf.cliff, L.shelf.cliff, shelfDistance(x, z));
}
/** The shelf's height: the basecamp's 6 m, the jungle a little higher in the west, the breakdown a
 *  little lower in the east (a gentle tilt, walked). */
function shelfLevel(x: number, z: number): number {
  return L.shelf.h + L.shelf.west * (1 - smoothstep(-15, -9, x)) + L.shelf.east * smoothstep(9, 15, x) + 0.05 * wave(x * 0.5, z * 0.5, 31);
}

/** The ground's height at (x, z) as the builder models it and the grid samples it (the walk surface is
 *  the grid: cavernsFloorY). */
export function cavernsHeight(x: number, z: number): number {
  let h = L.low + 0.05 * wave(x * 0.6, z * 0.6, 3);
  // the levels, lowest first, each over the ground before it with a cliff at its rim; the shelf last
  for (const lv of L.levels) {
    const w = levelWeight(lv, x, z);
    // (the rift's floor easing down to its mouth on the lake's shore: a gentle beach, never a bank too
    // steep to stand on: docs/caverns-roadmap.md R8.7)
    const mo = "mouth" in lv ? lv.mouth : undefined;
    const drop = mo ? mo.drop * smoothstep(mo.z0, mo.z1, z) : 0;
    if (w > 0) h = mix(h, lv.h - drop + 0.05 * wave(x * 0.7, z * 0.7, (LEVEL_SEED[lv.id] ?? 1) + 2), w);
  }
  const ws = shelfWeight(x, z);
  if (ws > 0) h = mix(h, shelfLevel(x, z), ws);
  // the trails, carved (and banked) across the cliffs, their shoulders soft
  for (const p of L.paths) {
    const n = pathHeight(x, z, p);
    if (n.w > 0) h = mix(h, n.h, n.w);
  }
  // the terraces' warm pools, sunk into their steps: the drop all under the water, the ground round
  // each flat to its rim (docs/caverns-roadmap.md R4.1: sunk over a metre, each pool wore a ring of
  // ground too steep to stand on, shutting off the terraces' west ledges)
  L.terraces.pools.forEach((p, i) => {
    const d = poolDistance(x, z, p, i);
    if (d < 0.08) h = mix(h, p.y - 0.55, 1 - smoothstep(-0.4, 0.08, d));
  });
  // (each pool's overflow cut a groove down to the next: its bed under the water running in it, so the
  // pool spills through a gap in its rim at its own level; docs/caverns-roadmap.md R8.5)
  for (const o of POOL_OVERFLOWS) {
    const vx = o.bx - o.ax;
    const vz = o.bz - o.az;
    const ln2 = vx * vx + vz * vz || 1;
    const t = Math.max(-0.12, Math.min(1.12, ((x - o.ax) * vx + (z - o.az) * vz) / ln2));
    const d = Math.hypot(x - (o.ax + vx * t), z - (o.az + vz * t));
    if (d > 0.75) continue;
    const bed = mix(o.ay, o.by, smoothstep(0.05, 0.95, t)) - 0.05;
    h = mix(h, Math.min(h, bed), 1 - smoothstep(0.3, 0.75, d));
  }
  // the lake: its bank sloping down into it, its bed shelving off to the deep; the islet and the
  // causeway out to it
  const f = lakeFactor(x, z);
  if (f < L.lake.beach) {
    const bank = smooth01((f - 1) / (L.lake.beach - 1));
    const bed = f < 1 ? -L.lake.shelfDepth - (L.lake.depth - L.lake.shelfDepth) * smooth01((1 - f) / 0.45) : -0.12;
    h = mix(bed, h, bank);
    const c = causewayDistance(x, z);
    if (c < L.causeway.half + 0.9) h = Math.max(h, mix(L.causeway.y, h, smooth01((c - L.causeway.half) / 0.9)));
    const g = isletFactor(x, z);
    if (g < 1.3) h = Math.max(h, mix(L.islet.top, h, smooth01((g - 0.72) / 0.5)));
  }
  // the stream's channel, cut into whatever it crosses (shallow at its fords), and the plunge pool
  const rd = riverDistance(x, z);
  if (rd < L.river.half + 0.5) h -= L.river.depth * (1 - smoothstep(L.river.half - 0.15, L.river.half + 0.5, rd)) * (1 - 0.8 * fordAt(x, z));
  const pd = plungeDistance(x, z);
  // (the plunge pool a real basin, deep green under the fall, its sides dropping steeply under its
  // water: docs/caverns-roadmap.md R5.2; at 14 cm it read as a pale slab of shallows)
  // (its bed rising gently toward its outlet, so the stream leaves over a shallow lip, never off a
  // drop: docs/caverns-roadmap.md R10.2)
  if (pd < 0.6) {
    const toOutlet = 1 - smoothstep(L.river.half, L.river.half + 0.9, polylineNear(x, z, L.river.segments[0]).d);
    const lip = toOutlet * smoothstep(-1.0, 0.0, pd);
    h -= (0.4 * (1 - smoothstep(-0.2, 0.6, pd)) + 0.75 * (1 - smoothstep(-1.1, 0.05, pd))) * (1 - 0.75 * lip);
  }
  // (its bank: the ground round it a hand over its water, so it holds its level, but where the stream
  // leaves it: docs/caverns-roadmap.md R6.3, the stream never running back into it)
  if (pd > -0.05 && pd < 1.0) {
    const outlet = polylineNear(x, z, L.river.segments[0]).d < L.river.half + 0.04;
    if (!outlet) h = Math.max(h, L.river.plunge.level + 0.12 - 0.5 * smoothstep(0.25, 1.0, pd));
  }
  // the open edges (the south, and the east past the rift): the ground falls away over a wandering
  // rim into the dark under the cavern, never cut off along a ruler line; the rift walled in on the
  // east by a lip of basalt
  const fall = Math.max(openEdgeFall(x, z), 0);
  if (fall > 0) h = mix(h, EDGE_DEPTH, fall);
  const lip = riftLip(x, z);
  if (lip > 0) h += RIFT_LIP * lip;
  return h;
}
/** How deep the ground falls at the open edges (m), and the rift's east lip over its floor. */
const EDGE_DEPTH = -2.6;
const RIFT_LIP = 1.7;
/** How far into its fall (x, z) is at the open south and east edges (0 before the rim, 1 at the foot). */
export function openEdgeFall(x: number, z: number): number {
  const south = z + 0.55 * wave(x * 0.45, 0.7, 41) + 0.2 * wave(x * 1.3, 2.1, 43);
  const east = x + 0.55 * wave(0.3, z * 0.45, 45) + 0.2 * wave(1.9, z * 1.3, 47);
  const k = Math.max(smoothstep(21.0, 22.4, south), smoothstep(21.3, 22.4, east) * smoothstep(11.0, 12.5, z));
  return k;
}
/** The basalt lip along the east edge (0 .. 1): up against the map's edge from the rift down past its
 *  mouth, ending where the lake's outflow spills over the rim. */
function riftLip(x: number, z: number): number {
  const east = x + 0.45 * wave(0.9, z * 0.6, 49) + 0.2 * wave(2.3, z * 1.7, 51);
  return smoothstep(21.1, 22.2, east) * (1 - smoothstep(9.5, 11.0, z));
}

// --- the grids: the floor (0.5 m) and where you can stand (0.25 m) ------------------------------------------

/** The floor's grid: a vertex every 0.5 m over the whole cavern, its heights rounded to 0.1 mm. */
export const TERRAIN_CELL = 0.5;
export const TERRAIN_N = Math.round((L.half * 2) / TERRAIN_CELL) + 1;
const TERRAIN_X0 = -L.half;
/** Whether (x, z) is the lake's beach, sloping into the water (where a trail's foot may end). */
export const onBeach = (x: number, z: number) => lakeFactor(x, z) < 1.2;
/** The steepest the explorer's trails' tread ever gets (degrees). */
export const TRAIL_STEEPEST = 20;
/** How much of a trail's tread a floor vertex is (1 on it, easing to 0 half a metre past its edge:
 *  the shoulders and the cliffs beyond are never touched). */
function trailCorridor(x: number, z: number): number {
  let w = 0;
  for (const p of L.paths) w = Math.max(w, 1 - smoothstep(p.half - 0.1, p.half + 0.4, polylineNear(x, z, p.points).d));
  return w;
}
export const TERRAIN_HEIGHTS: Float64Array = (() => {
  const out = new Float64Array(TERRAIN_N * TERRAIN_N);
  for (let k = 0; k < TERRAIN_N; k++) {
    for (let i = 0; i < TERRAIN_N; i++) out[k * TERRAIN_N + i] = cavernsHeight(TERRAIN_X0 + i * TERRAIN_CELL, TERRAIN_X0 + k * TERRAIN_CELL);
  }
  // the trails smoothed: where a step on the tread is steeper than TRAIL_STEEPEST (a kink where it
  // crosses a cliff, a crease at its shoulder) it is relaxed toward its neighbours; nothing else is
  // touched
  const corridor = new Float64Array(TERRAIN_N * TERRAIN_N);
  for (let k = 0; k < TERRAIN_N; k++) for (let i = 0; i < TERRAIN_N; i++) corridor[k * TERRAIN_N + i] = trailCorridor(TERRAIN_X0 + i * TERRAIN_CELL, TERRAIN_X0 + k * TERRAIN_CELL);
  const limit = Math.tan(((TRAIL_STEEPEST - 1.5) * Math.PI) / 180) * TERRAIN_CELL;
  for (let pass = 0; pass < 30; pass++) {
    let worst = 0;
    const next = out.slice();
    for (let k = 1; k + 1 < TERRAIN_N; k++) {
      for (let i = 1; i + 1 < TERRAIN_N; i++) {
        const q = k * TERRAIN_N + i;
        const c = corridor[q];
        if (c <= 0) continue;
        const n4 = [out[q - 1], out[q + 1], out[q - TERRAIN_N], out[q + TERRAIN_N]];
        // (the steepest of the four quarters round the vertex: its fall along x and along z at once)
        const h = out[q];
        const steep = Math.max(Math.hypot(n4[0] - h, n4[2] - h), Math.hypot(n4[0] - h, n4[3] - h), Math.hypot(n4[1] - h, n4[2] - h), Math.hypot(n4[1] - h, n4[3] - h));
        worst = Math.max(worst, c >= 1 ? steep : 0);
        const avg = (n4[0] + n4[1] + n4[2] + n4[3]) / 4;
        if (steep > limit) next[q] = out[q] + (avg - out[q]) * 0.5 * c;
      }
    }
    out.set(next);
    if (worst <= limit) break;
  }
  for (let q = 0; q < out.length; q++) out[q] = Math.round(out[q] * 1e4) / 1e4;
  return out;
})();

/** The floor's height at (x, z): the grid, each cell split along the diagonal from its (-x, -z) corner
 *  to its (+x, +z) corner (the builder's collider mesh, triangle for triangle). */
export function cavernsFloorY(x: number, z: number): number {
  const fx = Math.max(0, Math.min(TERRAIN_N - 1.000001, (x - TERRAIN_X0) / TERRAIN_CELL));
  const fz = Math.max(0, Math.min(TERRAIN_N - 1.000001, (z - TERRAIN_X0) / TERRAIN_CELL));
  const i = Math.floor(fx);
  const k = Math.floor(fz);
  const u = fx - i;
  const v = fz - k;
  const H = TERRAIN_HEIGHTS;
  const h00 = H[k * TERRAIN_N + i];
  const h10 = H[k * TERRAIN_N + i + 1];
  const h01 = H[(k + 1) * TERRAIN_N + i];
  const h11 = H[(k + 1) * TERRAIN_N + i + 1];
  return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01);
}

/** How much of a big rock's size you walk round: a little over half (you slide past its flanks,
 *  never snag on them). */
const SLIM = 0.56;
/** Everything natural you walk round, as discs: the boulders, the jungle's trunks, the breakdown's
 *  fallen slabs, the rift's basalt stubs, the overlook's stalagmites. The small things (crystals,
 *  mushrooms, ferns, reeds, pebbles, the pearl basins, the mud's plates) are walked through. */
const ROCK_DISCS: { x: number; z: number; r: number }[] = [
  ...L.boulders.map(([x, z, r]) => ({ x, z, r: r * SLIM })),
  ...L.trees.map(([x, z]) => ({ x, z, r: 0.32 })),
  ...L.slabs.map(([x, z, r]) => ({ x, z, r: r * 0.75 })),
  ...L.stubs.map(([x, z, r]) => ({ x, z, r: r * 0.9 })),
  ...L.stalagmites.map(([x, z, r]) => ({ x, z, r: r * 0.62 })),
];

/** How steep the floor is at (x, z), in degrees (its fall over half a metre across, both ways at once). */
export function trailSlope(x: number, z: number): number {
  const e = 0.25;
  const gx = (cavernsFloorY(x + e, z) - cavernsFloorY(x - e, z)) / (2 * e);
  const gz = (cavernsFloorY(x, z + e) - cavernsFloorY(x, z - e)) / (2 * e);
  return (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
}

/** The steepest ground anyone walks on (degrees), measured over half a metre (trailSlope): nowhere a
 *  scramble (docs/caverns-roadmap.md R4.1: 24, the gentle banks under every cliff walked; the cliffs
 *  themselves are far steeper). */
export const STEEPEST_WALK = 24;
/** The steepest single step a mask cell long (degrees): a lip of a hand's height or so, the ground's
 *  own bumps and hummocks, is stepped over (docs/caverns-roadmap.md R4.1: judged cell by cell at 20
 *  degrees, the floor's bumps shut little patches of open ground nobody could see). */
export const STEEPEST_STEP = 30;
const STEP = Math.tan((STEEPEST_STEP * Math.PI) / 180);
/** Whether the floor at (x, z) climbs or drops more than a step toward any of its neighbours a mask
 *  cell away (a cliff, a trail's shoulder, the causeway's flank). */
function tooSteep(x: number, z: number): boolean {
  const s = 0.25;
  const h = cavernsFloorY(x, z);
  return Math.max(Math.abs(cavernsFloorY(x + s, z) - h), Math.abs(cavernsFloorY(x - s, z) - h), Math.abs(cavernsFloorY(x, z + s) - h), Math.abs(cavernsFloorY(x, z - s) - h)) > STEP * s;
}
/** Whether (x, z) is in the stream's water as it is drawn (its fords aside) or its plunge pool: its
 *  channel's banks beyond are shut by their own steepness, never by a margin nobody sees. */
function inStream(x: number, z: number): boolean {
  if (plungeDistance(x, z) < 0.2) return true;
  return riverDistance(x, z) <= L.river.half * 0.82 && fordAt(x, z) < 0.5;
}

/** Whether an avatar may stand at (x, z) (its centre): clear of the walls, the water, the pools, the
 *  stream and the rocks, and never on ground steeper than STEEPEST_WALK (every cliff between two
 *  levels is; every trail across one is not). */
export function cavernsWalkable(x: number, z: number): boolean {
  const m = L.walls.margin;
  if (x < L.walls.west + m || z < L.walls.north + m || x > L.half - 0.6 || z > L.half - 0.6) return false;
  if (inLakeWater(x, z)) return false;
  if (poolAt(x, z, 0.06) >= 0) return false;
  if (inStream(x, z)) return false;
  // (steep toward any neighbour, or across the diagonal: a ramp's edge where it crosses a cliff)
  if (tooSteep(x, z) || trailSlope(x, z) > STEEPEST_WALK) return false;
  for (const r of ROCK_DISCS) if ((x - r.x) ** 2 + (z - r.z) ** 2 < r.r * r.r) return false;
  return true;
}

/** The mask of where you can stand: a 0.25 m cell each, 1 where its middle is walkable. */
export const MASK_CELL = 0.25;
export const MASK_N = Math.round((L.half * 2) / MASK_CELL);
export const CAVERNS_MASK: Uint8Array = (() => {
  const out = new Uint8Array(MASK_N * MASK_N);
  for (let k = 0; k < MASK_N; k++) {
    for (let i = 0; i < MASK_N; i++) out[k * MASK_N + i] = cavernsWalkable(-L.half + (i + 0.5) * MASK_CELL, -L.half + (k + 0.5) * MASK_CELL) ? 1 : 0;
  }
  // (little islands of cells shut only by their steepness in open ground, a few cells each and open
  // all round: the floor's hummocks, a walker catching on them for nothing; opened, never water, a
  // pool, the stream or a rock, never ground steeper than a step)
  const cellX = (i: number) => -L.half + (i + 0.5) * MASK_CELL;
  const shutByGround = (i: number, k: number) => {
    const x = cellX(i);
    const z = cellX(k);
    return !(inLakeWater(x, z) || poolAt(x, z, 0.06) >= 0 || inStream(x, z) || ROCK_DISCS.some((r) => (x - r.x) ** 2 + (z - r.z) ** 2 < r.r * r.r));
  };
  const seen = new Uint8Array(MASK_N * MASK_N);
  for (let k0 = 1; k0 < MASK_N - 1; k0++) {
    for (let i0 = 1; i0 < MASK_N - 1; i0++) {
      const q0 = k0 * MASK_N + i0;
      if (out[q0] || seen[q0]) continue;
      const comp: number[] = [];
      const stack = [q0];
      seen[q0] = 1;
      let ok = true;
      while (stack.length) {
        const q = stack.pop()!;
        comp.push(q);
        if (comp.length > 10) ok = false;
        const i = q % MASK_N;
        const k = (q - i) / MASK_N;
        if (i === 0 || k === 0 || i === MASK_N - 1 || k === MASK_N - 1) {
          ok = false;
          continue;
        }
        for (const n of [q - 1, q + 1, q - MASK_N, q + MASK_N]) if (!out[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (!ok) continue;
      if (comp.every((q) => shutByGround(q % MASK_N, Math.floor(q / MASK_N)) && trailSlope(cellX(q % MASK_N), cellX(Math.floor(q / MASK_N))) <= STEEPEST_STEP)) for (const q of comp) out[q] = 1;
    }
  }
  return out;
})();
/** Whether the mask's cell (i, k) is shut by the ground alone (too steep: a cliff, a bank, a trail's
 *  shoulder), never by the water, a pool, the stream, a rock or the walls: the floor paints exactly
 *  these as bare rock, so you stop where the rock visibly begins (docs/caverns-roadmap.md R4.1). */
export function maskShutByGround(i: number, k: number): boolean {
  if (CAVERNS_MASK[k * MASK_N + i]) return false;
  if (maskUnreached(i, k)) return true;
  const x = -L.half + (i + 0.5) * MASK_CELL;
  const z = -L.half + (k + 0.5) * MASK_CELL;
  const m = L.walls.margin;
  if (x < L.walls.west + m || z < L.walls.north + m || x > L.half - 0.6 || z > L.half - 0.6) return false;
  if (inLakeWater(x, z) || poolAt(x, z, 0.06) >= 0 || inStream(x, z)) return false;
  return !ROCK_DISCS.some((r) => (x - r.x) ** 2 + (z - r.z) ** 2 < r.r * r.r);
}
/** Whether a disc of `radius` at (x, z) touches a cell you cannot stand in (collision.ts's isBlocked). */
export function cavernsBlocked(x: number, z: number, radius: number): boolean {
  const i0 = Math.floor((x - radius + L.half) / MASK_CELL);
  const i1 = Math.floor((x + radius + L.half) / MASK_CELL);
  const k0 = Math.floor((z - radius + L.half) / MASK_CELL);
  const k1 = Math.floor((z + radius + L.half) / MASK_CELL);
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      if (i < 0 || k < 0 || i >= MASK_N || k >= MASK_N) return true;
      if (CAVERNS_MASK[k * MASK_N + i]) continue;
      // (the nearest point of that cell to the disc's middle)
      const cx = Math.max(-L.half + i * MASK_CELL, Math.min(x, -L.half + (i + 1) * MASK_CELL));
      const cz = Math.max(-L.half + k * MASK_CELL, Math.min(z, -L.half + (k + 1) * MASK_CELL));
      if ((cx - x) ** 2 + (cz - z) ** 2 < radius * radius) return true;
    }
  }
  return false;
}

/** What each floor vertex is (the builder paints it so): each zone's ground, the trails, the stream's
 *  and the pools' beds, the lake's bed and its bank. */
export const SURFACE = { basecamp: 0, jungle: 1, breakdown: 2, mudflats: 3, overlook: 4, travertine: 5, rift: 6, shore: 7, bed: 8, trail: 9, stream: 10, pool: 11 } as const;
/** The level whose ground (x, z) is (the top-most one holding it), or "low". */
function levelOf(x: number, z: number): string {
  if (shelfWeight(x, z) >= 0.5) return "shelf";
  for (let i = L.levels.length - 1; i >= 0; i--) if (levelWeight(L.levels[i], x, z) >= 0.5) return L.levels[i].id;
  return "low";
}
export function cavernsSurface(x: number, z: number, trails = true): number {
  if (poolAt(x, z) >= 0) return SURFACE.pool;
  if (plungeDistance(x, z) < 0.1 || riverDistance(x, z) <= L.river.half) return SURFACE.stream;
  const f = lakeFactor(x, z);
  if (f < 1 && isletFactor(x, z) > 0.9 && !onCauseway(x, z)) return SURFACE.bed;
  if (trails) for (const p of L.paths) if (polylineNear(x, z, p.points).d <= p.half + 0.15 * wave(x * 1.3, z * 1.3, 29)) return SURFACE.trail;
  // (the zones' edges wander a little: never a seam drawn with a ruler)
  const wob = 1.2 * wave(x * 0.5, z * 0.5, 17);
  switch (levelOf(x, z)) {
    case "shelf":
      return x < -9 + wob ? SURFACE.jungle : x > 9 + wob ? SURFACE.breakdown : SURFACE.basecamp;
    case "mudflats":
      return SURFACE.mudflats;
    case "overlook":
      return SURFACE.overlook;
    case "rift":
      return SURFACE.rift;
    case "terraceA":
    case "terraceB":
    case "terraceC":
      return SURFACE.travertine;
  }
  if (f < L.lake.beach + 0.12 || isletFactor(x, z) < 1.2 || causewayDistance(x, z) < L.causeway.half + 0.6) return SURFACE.shore;
  if (x < -4 + wob && z > 14) return SURFACE.travertine;
  if (x > 13 + wob && z < 8) return SURFACE.rift;
  return SURFACE.shore;
}

/** The floor as the builder reads it (scripts/caverns-terrain.ts writes it to
 *  scripts/blender/data/caverns_terrain.json): the heights and surfaces of every vertex (and, under a
 *  trail, the ground it is cut into: `ground`), and the mask. */
export function cavernsTerrainData() {
  const surface: number[] = [];
  const ground: number[] = [];
  for (let k = 0; k < TERRAIN_N; k++) {
    for (let i = 0; i < TERRAIN_N; i++) {
      const s = cavernsSurface(TERRAIN_X0 + i * TERRAIN_CELL, TERRAIN_X0 + k * TERRAIN_CELL);
      surface.push(s);
      ground.push(s === SURFACE.trail ? cavernsSurface(TERRAIN_X0 + i * TERRAIN_CELL, TERRAIN_X0 + k * TERRAIN_CELL, false) : s);
    }
  }
  return {
    cell: TERRAIN_CELL,
    n: TERRAIN_N,
    x0: TERRAIN_X0,
    heights: Array.from(TERRAIN_HEIGHTS),
    surface,
    ground,
    maskCell: MASK_CELL,
    maskN: MASK_N,
    mask: Array.from(CAVERNS_MASK).join(""),
    pools: TERRACES.pools,
    stream: STREAM_REACHES.map((r) => r.map((q) => [q.x, q.z, q.y, q.w, q.tx, q.tz, q.kind === "fall" ? 2 : q.kind === "riffle" ? 1 : 0])),
    unreached: unreachedCells(),
    falls: STREAM_FALLS,
  };
}

const ZONE_BY_ID = new Map(L.zones.map((zn) => [zn.id, zn]));
/** The caverns' zones (the Logbook's and the HUD's name for where you are), read off the ground itself
 *  (the level under you, the shelf split into the jungle, the basecamp and the breakdown), so a zone
 *  ends where its ground does. */
export function cavernsZoneAt(x: number, z: number): (typeof L.zones)[number] | null {
  const wob = 1.2 * wave(x * 0.5, z * 0.5, 17);
  let id = "lake";
  switch (levelOf(x, z)) {
    case "shelf":
      id = x < -9 + wob ? "jungle" : x > 9 + wob ? "breakdown" : "basecamp";
      break;
    case "mudflats":
    case "overlook":
    case "rift":
      id = levelOf(x, z);
      break;
    case "terraceA":
    case "terraceB":
    case "terraceC":
      id = "terraces";
      break;
    default:
      id = x < -4 + wob && z > 12 ? "terraces" : x > 12 + wob && z < 8 ? "rift" : "lake";
  }
  return ZONE_BY_ID.get(id) ?? null;
}

// --- the trails ---------------------------------------------------------------------------------------------

/** The trails: the rope descent from the jungle to the mudflats, the switchback from the basecamp to the
 *  overlook, the ramps on from it to the rift and to the lake, the pearl trail down the terraces. */
export const CAVE_TRAILS = L.paths;
/** The north shelf (the basecamp's height) and the overlook's. */
export const DOLINE = { y: L.shelf.h };
export const OVERLOOK = { y: L.levels.find((l) => l.id === "overlook")!.h };

// --- the Expedition Basecamp, the adit ---------------------------------------------------------------------

/** The adit's tunnel back up to the Whispering Woods, and where you stand at it. */
export const CAVE_ADIT = L.adit;
export const CAVE_ADIT_FRONT: Pt = { x: L.adit.x, z: L.adit.z + 1.3 };
/** Where a traveller arrives from the woods (on the basecamp's shelf, before the adit). */
export const CAVE_ARRIVAL: Pt = L.arrival;
/** Gus the Mole behind the counter of his trading post against the north wall (docs/caverns-roadmap.md
 *  R3.2: out of the shelf's way), and where you stand to trade with him. */
export const GUS = L.gus;
export const GUS_FRONT: Pt = { x: L.workstation.x, z: L.workstation.z + L.workstation.w / 2 + 0.7 };
export const GUS_REACH = 1.9;
/** The Basalt Crucible Forge in the north wall, and the meteorite Geode Anvil on its low outcrop beside
 *  the antique tool crate. */
export const FORGE = L.forge;
export const FORGE_FRONT: Pt = { x: L.forge.x, z: L.forge.z + L.forge.d / 2 + 0.8 };
export const FORGE_REACH = 2.0;
export const ANVIL = L.anvil;
export const ANVIL_FRONT: Pt = { x: L.anvil.x, z: L.anvil.z + 1.05 };
export const ANVIL_REACH = 1.8;

/** Gus's winch lift between the glimmer rift's floor and the coal breakdown's edge, both ways
 *  (docs/caverns-roadmap.md R5.3: up, and now down too, the empty cage wound up to fetch you first). Where its gantry stands on the
 *  shelf (`top`), where its cage hangs (`bottom`), where you stand to ride it (`lower`) and the ledge
 *  it sets you down on (`upper`). */
export const CAVE_WINCH = {
  top: { x: L.winch.x, z: L.winch.top },
  bottom: { x: L.winch.x, z: L.winch.bottom },
  upper: { x: L.winch.upperAt[0], z: L.winch.upperAt[1] } as Pt,
  lower: { x: L.winch.x, z: L.winch.lower } as Pt,
  /** The explorers' landing at the top (docs/caverns-roadmap.md R9.2): a timber deck out from the ledge
   *  beside the cage, walked from the cage to the ledge (and back), never through the gantry. */
  deck: L.winch.deck.map(([x, z]) => ({ x, z })),
  /** The landing's head on the ledge: where the winch is used from up there. */
  head: { x: L.winch.deck[L.winch.deck.length - 1][0], z: L.winch.deck[L.winch.deck.length - 1][1] } as Pt,
};
/** The way between the cage at the top and the ledge: across the landing. */
const DECK_PATH = (): Pt[] => [{ x: L.winch.x, z: L.winch.bottom }, ...CAVE_WINCH.deck, CAVE_WINCH.upper];
/** The ride, end to end (s): a step into the cage, the climb, a step off onto the ledge. */
export const WINCH_RIDE_S = 3.6;
/** The cage going back down empty afterwards (s): the winch takes no one until it is down. */
export const WINCH_RETURN_S = 2.2;
export const WINCH_REACH = 1.8;
/** The ride's three legs (s). */
const RIDE_IN_S = 0.4;
const RIDE_OFF_S = 0.5;
/** The walk across the landing at the top (s). */
const DECK_S = 1.1;
const easeInOut = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** Where a rider is `t` seconds into the ride (from `from`, where they stood), and how far the cage
 *  has climbed (0 at the rift's floor .. `lift` at the top): the same on every client. */
export function winchRidePose(t: number, from: Pt): { x: number; z: number; y: number; cage: number; facing: number; walking: boolean } {
  const cx = L.winch.x;
  const cz = L.winch.bottom;
  const low = cavernsFloorY(cx, cz);
  const lift = winchLift();
  const climb = WINCH_RIDE_S - RIDE_IN_S - DECK_S;
  const facing = Math.PI;
  if (t < RIDE_IN_S) {
    const k = easeInOut(t / RIDE_IN_S);
    return { x: from.x + (cx - from.x) * k, z: from.z + (cz - from.z) * k, y: low, cage: 0, facing, walking: true };
  }
  if (t < RIDE_IN_S + climb) {
    const up = lift * easeInOut((t - RIDE_IN_S) / climb);
    return { x: cx, z: cz, y: low + up, cage: up, facing, walking: false };
  }
  // (off the cage onto the landing beside it, and along it to the ledge)
  const k = easeInOut(Math.min(1, (t - RIDE_IN_S - climb) / DECK_S));
  const p = along(DECK_PATH(), k);
  const u = CAVE_WINCH.upper;
  const end = Math.max(0, (k - 0.85) / 0.15);
  return { x: p.x, z: p.z, y: low + lift + (cavernsFloorY(u.x, u.z) - low - lift) * end, cage: lift, facing: Math.atan2(p.dx, p.dz), walking: k < 0.98 };
}
/** The raft (docs/caverns-roadmap.md R2.10): one raft on the Great Lake between the north shore and the
 *  Monolith's islet, resting at whichever side it last went to. Aboard, a ride across of RAFT_RIDE_S
 *  (a step aboard, poled over the water, a step off), set down on the far side at once by the server
 *  and drawn by every client (raftRidePose); called from the other side, it drifts over empty first
 *  (RAFT_EMPTY_S). */
export type RaftSide = "north" | "islet";
export const RAFT = {
  north: { x: L.raft.north[0], z: L.raft.north[1] },
  islet: { x: L.raft.islet[0], z: L.raft.islet[1] },
  via: L.raft.via.map(([x, z]) => ({ x, z })),
};
export const RAFT_RIDE_S = 7;
export const RAFT_EMPTY_S = 5;
export const RAFT_REACH = 1.3;
const RAFT_STEP_S = 0.7;
/** The water's route from one side to the other (the landings aside). */
function raftRoute(to: RaftSide): Pt[] {
  return to === "islet" ? RAFT.via : [...RAFT.via].reverse();
}
function along(pts: Pt[], k: number): { x: number; z: number; dx: number; dz: number } {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.z - pts[i].z));
  const total = lens.reduce((a, b) => a + b, 0);
  let d = Math.max(0, Math.min(1, k)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const u = lens[i] > 0 ? Math.min(1, d / lens[i]) : 0;
      const a = pts[i];
      const b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, dx: b.x - a.x, dz: b.z - a.z };
    }
    d -= lens[i];
  }
  return { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z, dx: 0, dz: 1 };
}
/** Where the raft floats `t` seconds into a crossing toward `to` (the whole crossing, an empty one
 *  too, over RAFT_RIDE_S - 2 steps), and its heading. */
export function raftAt(t: number, to: RaftSide, secs = RAFT_RIDE_S - 2 * RAFT_STEP_S): { x: number; z: number; yaw: number } {
  const p = along(raftRoute(to), easeInOut(Math.max(0, Math.min(1, t / secs))));
  return { x: p.x, z: p.z, yaw: Math.atan2(p.dx, p.dz) };
}
/** Where the raft rests at a side (at the water's edge by its landing). */
export function raftRest(side: RaftSide): { x: number; z: number; yaw: number } {
  const r = side === "islet" ? RAFT.via[RAFT.via.length - 1] : RAFT.via[0];
  const n = side === "islet" ? RAFT.via[RAFT.via.length - 2] : RAFT.via[1];
  return { x: r.x, z: r.z, yaw: Math.atan2(n.x - r.x, n.z - r.z) };
}
/** A rider `t` seconds into a crossing toward `to`: a step aboard, the crossing (standing on the
 *  raft), a step off onto the far landing; the raft's own place with it. */
export function raftRidePose(t: number, to: RaftSide): { x: number; z: number; y: number; facing: number; raft: { x: number; z: number; yaw: number } } {
  const from = to === "islet" ? RAFT.north : RAFT.islet;
  const land = to === "islet" ? RAFT.islet : RAFT.north;
  const start = raftRest(to === "islet" ? "north" : "islet");
  const deck = CAVE_WATER_Y + 0.12;
  if (t < RAFT_STEP_S) {
    const k = easeInOut(t / RAFT_STEP_S);
    const y0 = cavernsFloorY(from.x, from.z);
    return { x: from.x + (start.x - from.x) * k, z: from.z + (start.z - from.z) * k, y: y0 + (deck - y0) * k, facing: start.yaw, raft: start };
  }
  const cross = RAFT_RIDE_S - 2 * RAFT_STEP_S;
  if (t < RAFT_STEP_S + cross) {
    const r = raftAt(t - RAFT_STEP_S, to, cross);
    return { x: r.x, z: r.z, y: deck, facing: r.yaw, raft: r };
  }
  const end = raftRest(to);
  const k = easeInOut(Math.min(1, (t - RAFT_STEP_S - cross) / RAFT_STEP_S));
  const y1 = cavernsFloorY(land.x, land.z);
  return { x: end.x + (land.x - end.x) * k, z: end.z + (land.z - end.z) * k, y: deck + (y1 - deck) * k, facing: end.yaw, raft: end };
}

/** The ride down, end to end (s): the empty cage wound up to the ledge, a step in, the descent, a step
 *  off onto the rift's floor. */
export const WINCH_DOWN_S = WINCH_RETURN_S + WINCH_RIDE_S;
/** Where a rider going down is `t` seconds into the ride (from the ledge, `upper`), and how far up the
 *  cage is: the same on every client. */
export function winchDownPose(t: number): { x: number; z: number; y: number; cage: number; facing: number; walking: boolean } {
  const cx = L.winch.x;
  const cz = L.winch.bottom;
  const low = cavernsFloorY(cx, cz);
  const lift = winchLift();
  const u = CAVE_WINCH.upper;
  const top = cavernsFloorY(u.x, u.z);
  const facing = 0;
  const back = [...DECK_PATH()].reverse();
  // (waiting on the ledge while the cage comes up for you, facing the landing)
  if (t < WINCH_RETURN_S) return { x: u.x, z: u.z, y: top, cage: lift * easeInOut(t / WINCH_RETURN_S), facing: Math.atan2(back[1].x - u.x, back[1].z - u.z), walking: false };
  const s = t - WINCH_RETURN_S;
  const drop = WINCH_RIDE_S - DECK_S - RIDE_OFF_S;
  // (along the landing into the cage)
  if (s < DECK_S) {
    const k = easeInOut(s / DECK_S);
    const p = along(back, k);
    const start = Math.min(1, k / 0.15);
    return { x: p.x, z: p.z, y: top + (low + lift - top) * start, cage: lift, facing: Math.atan2(p.dx, p.dz), walking: true };
  }
  const s2 = s - DECK_S + RIDE_IN_S;
  if (s2 < RIDE_IN_S + drop) {
    const up = lift * (1 - easeInOut((s2 - RIDE_IN_S) / drop));
    return { x: cx, z: cz, y: low + up, cage: up, facing, walking: false };
  }
  const k = easeInOut(Math.min(1, (s2 - RIDE_IN_S - drop) / RIDE_OFF_S));
  const lx = L.winch.x;
  const lz = L.winch.lower;
  return { x: cx + (lx - cx) * k, z: cz + (lz - cz) * k, y: low + (cavernsFloorY(lx, lz) - low) * k, cage: 0, facing, walking: k < 0.98 };
}

/** How far the cage climbs: from the rift's floor to the shelf's. */
export function winchLift(): number {
  // (to the landing's deck, flush with the ledge it is built out from)
  return cavernsFloorY(L.winch.upperAt[0], L.winch.upperAt[1]) - cavernsFloorY(L.winch.x, L.winch.bottom);
}
/** The empty cage going back down, `t` seconds after its rider stepped off (the lift left). */
export function winchReturn(t: number): number {
  return winchLift() * (1 - easeInOut(t / WINCH_RETURN_S));
}

// --- the nodes -----------------------------------------------------------------------------------------

/** A node's spot, its kind, the floor it stands on, the way it faces out of its wall or rock, and
 *  where you stand to mine it (a step out from its face). */
export interface OreNode {
  id: string;
  kind: OreKind;
  x: number;
  z: number;
  /** Its floor's height. */
  y: number;
  face: Pt | null;
  approach: Pt;
  /** Set in the cavern's shell (the north or west wall), not in a rock of its own. */
  wall: boolean;
  /** The map it stands on (the caverns' own, or Sunset Beach's reef rock). */
  map: MapId;
}
export const ORE_NODES: OreNode[] = L.nodes.map((n) => {
  const face = n.face ? { x: n.face[0], z: n.face[1] } : null;
  const r = ORE_KINDS[n.kind as OreKind].radius + 0.75;
  const d = Math.hypot(n.x, n.z) || 1;
  const out = face ?? { x: (-n.x / d) * 0.6 + 0.4, z: (-n.z / d) * 0.6 + 0.4 };
  const ol = Math.hypot(out.x, out.z) || 1;
  const wall = n.x <= L.walls.west + 1.3 || n.z <= L.walls.north + 1.3;
  return { id: n.id, kind: n.kind as OreKind, x: n.x, z: n.z, y: cavernsFloorY(n.x, n.z), face, approach: { x: n.x + (out.x / ol) * r, z: n.z + (out.z / ol) * r }, wall, map: "glimmering_caverns" };
});
/** Every node there is to prospect: the caverns' (ORE_NODES) and Sunset Beach's fossil reef rock
 *  (shared/worlds/beach.ts REEF_NODES). ORE_NODE_AT finds either by id. */
export const ALL_ORE_NODES: OreNode[] = [...ORE_NODES, ...REEF_NODES];
export const ORE_NODE_AT = new Map(ALL_ORE_NODES.map((n) => [n.id, n]));
/** The prop id of a node, and the node of a prop id. */
export const orePropId = (id: string) => `ore_${id}`;
export const oreNodeOf = (propId: string) => (propId.startsWith("ore_") ? ORE_NODE_AT.get(propId.slice(4)) : undefined);
/** How near a node you mine it from (the Monolith is bigger). */
export function oreReach(node: OreNode): number {
  return ORE_KINDS[node.kind].radius + 1.7;
}
/** The node within reach of (x, z), the nearest (null: none). */
export function oreNodeNear(x: number, z: number, map: MapId = "glimmering_caverns"): OreNode | null {
  let best: OreNode | null = null;
  let d = Infinity;
  for (const n of ALL_ORE_NODES) {
    if (n.map !== map) continue;
    const e = Math.hypot(n.x - x, n.z - z);
    if (e <= oreReach(n) && e < d) {
      d = e;
      best = n;
    }
  }
  return best;
}
/** The host rock a node away from the walls is set in (behind it, against its face): the builder's
 *  rock, and the collider round it. */
export function nodeBackRock(n: OreNode): { x: number; z: number; r: number } | null {
  if (n.wall || n.kind === "monolith" || n.kind === "rockfall" || !n.face) return null;
  const fl = Math.hypot(n.face.x, n.face.z) || 1;
  const r = ORE_KINDS[n.kind].radius;
  return { x: n.x - (n.face.x / fl) * (r + 0.45), z: n.z - (n.face.z / fl) * (r + 0.45), r: r + 0.35 };
}
export const MONOLITH = ORE_NODE_AT.get("monolith")!;

// --- the Pearl Terraces' warm pools ----------------------------------------------------------------------

/** The terraces' three rimstone pools, one on each step (their water's height the layout's), and their
 *  seven seats in the warm water, each with its dry landing on the step's rim beside it (where you are
 *  set down getting out, or dropping out of the game). */
export const TERRACES = {
  x0: L.terraces.x0,
  x1: L.terraces.x1,
  pools: L.terraces.pools.map((p) => {
    const r = Math.max(p.rx, p.rz) * 1.12;
    return { x: p.x, z: p.z, rx: p.rx, rz: p.rz, rot: p.rot, y: p.y, x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r };
  }),
};
export const THERMAL_SEATS = L.thermalSeats.map((s) => ({ propId: s.id, x: s.x, z: s.z, rotationY: s.face, approachX: s.exit.x, approachZ: s.exit.z, exit: s.exit }));

// --- the overlook's hearth, the photo spot, the codex's finds --------------------------------------------

/** The Hound's Overlook's campfire: a ring of river stones round a fire that never goes out, and four
 *  log benches round it facing in (sitting on one puts a marshmallow on a stick in your hands), each
 *  stepped off onto its own landing. */
export const HEARTH = { x: L.hearth.x, z: L.hearth.z, r: L.hearth.r, y: cavernsFloorY(L.hearth.x, L.hearth.z) };
/** The capybara's spot in the upper warm pool (its codex entry is met near it). */
export const CAPYBARA = L.capybara;
export const HEARTH_SEATS = L.hearthSeats.map((s) => ({ propId: s.id, x: s.x, z: s.z, rotationY: s.face, approachX: s.exit.x, approachZ: s.exit.z, exit: s.exit }));
export const HEARTH_SEAT_IDS: ReadonlySet<string> = new Set(HEARTH_SEATS.map((s) => s.propId));
/** Where you stand for a photo with the Hound's Hand behind you (facing the camera), and its reach. */
export const PHOTO_SPOT = { x: L.photo.x, z: L.photo.z, face: L.photo.face };
export const PHOTO_REACH = 1.4;
/** Old Flint's six journal pages, dropped round the cave (codex `page_1`..`page_6`), and the cave pearls
 *  in the terraces' dry basins (`pearl_1`..`pearl_5`, each at its basin); how near you pick one up. */
export const JOURNAL_PAGES = L.pages.map(([x, z], i) => ({ id: `page_${i + 1}`, x, z }));
export const CAVE_PEARLS = L.pearls.map(([x, z], i) => ({ id: `pearl_${i + 1}`, x, z }));
export const FIND_REACH = 1.8;
export const THERMAL_SEAT_IDS: ReadonlySet<string> = new Set(THERMAL_SEATS.map((s) => s.propId));
/** The water's height in the pool (x, z) is in (a seat's, a bather's): the nearest pool's. */
export function thermalPoolY(x: number, z: number): number {
  let best = 0;
  L.terraces.pools.forEach((p, i) => {
    if (poolDistance(x, z, p, i) < poolDistance(x, z, L.terraces.pools[best], best)) best = i;
  });
  return L.terraces.pools[best].y;
}
/** How near a seat's landing you step into its pool from (the soak toggle). */
export const THERMAL_REACH = 2.2;
/** The thermal seat nearest (x, z) among these. */
export function nearestThermalSeat(x: number, z: number, ids: readonly string[] = THERMAL_SEATS.map((s) => s.propId)) {
  let best: (typeof THERMAL_SEATS)[number] | null = null;
  for (const s of THERMAL_SEATS) {
    if (!ids.includes(s.propId)) continue;
    if (!best || Math.hypot(s.exit.x - x, s.exit.z - z) < Math.hypot(best.exit.x - x, best.exit.z - z)) best = s;
  }
  return best;
}

// --- the Great Lake -----------------------------------------------------------------------------------

export const CAVE_LAKE = L.lake;
export const CAVE_ISLET = L.islet;
/** The water's height (the float's, the drip's ripple). */
export const CAVE_WATER_Y = L.lake.water;
/** Finnegan the Grotto Angler on his driftwood log on the north shore (facing the lake: `yaw`), and
 *  where you stand to trade with him. */
export const FINNEGAN = L.finnegan;
// (at his side on the wet sand, his line out over the water ahead of him clear: docs/caverns-roadmap.md R6.2)
export const FINNEGAN_FRONT: Pt = { x: L.finnegan.x + Math.cos(L.finnegan.yaw) * 1.25 + Math.sin(L.finnegan.yaw) * 0.35, z: L.finnegan.z - Math.sin(L.finnegan.yaw) * 1.25 + Math.cos(L.finnegan.yaw) * 0.35 };
export const FINNEGAN_REACH = 1.9;

/** Shore fishing: anywhere within SHORE_REACH of the water, facing it (the facing's dot with the way to
 *  the water over SHORE_FACING), the float landing out on the water ahead. */
export const SHORE_REACH = 1.5;
export const SHORE_FACING = 0.3;
const WATER_DIRS = Array.from({ length: 24 }, (_, k) => ({ x: Math.sin((k / 24) * Math.PI * 2), z: Math.cos((k / 24) * Math.PI * 2) }));
/** The nearest water to (x, z) within `reach` (searched along 24 headings, 0.1 m at a time): how far,
 *  and the way to it (null: none that near). */
export function nearestWater(x: number, z: number, reach = SHORE_REACH): { d: number; x: number; z: number } | null {
  let best: { d: number; x: number; z: number } | null = null;
  for (const dir of WATER_DIRS) {
    for (let d = 0.1; d <= reach + 1e-9; d += 0.1) {
      if (best && d >= best.d) break;
      if (inLakeWater(x + dir.x * d, z + dir.z * d)) {
        best = { d, x: dir.x, z: dir.z };
        break;
      }
    }
  }
  return best;
}
/** A cast from the shore at (x, z) facing (fx, fz): where its float lands, or null when the water is
 *  not within SHORE_REACH or the angler doesn't face it (the facing's dot with the way to the nearest
 *  water no more than SHORE_FACING). The float goes out along the facing when that meets the water,
 *  else straight out from the shore (a glancing cast along a curving beach), as far as it takes to
 *  float over CAST_DEPTH of water, at most CAST_OUT m past the edge, never back on land. */
export const CAST_DEPTH = 0.3;
const CAST_OUT = 4.0;
function castAlong(x: number, z: number, d: { x: number; z: number }): { x: number; z: number } | null {
  let edge = -1;
  for (let t = 0.1; t <= SHORE_REACH + 1.6; t += 0.1) {
    if (inLakeWater(x + d.x * t, z + d.z * t)) {
      edge = t;
      break;
    }
  }
  if (edge < 0) return null;
  for (let t = edge; t <= edge + CAST_OUT + 1e-9; t += 0.1) {
    const px = x + d.x * t;
    const pz = z + d.z * t;
    if (!inLakeWater(px, pz)) return null;
    // (a little clear of the waterline: the spot is rounded to the centimetre after)
    if (lakeFactor(px, pz) <= 0.98 && L.lake.water - cavernsFloorY(px, pz) >= CAST_DEPTH) return { x: Math.round(px * 100) / 100, z: Math.round(pz * 100) / 100 };
  }
  return null;
}
export function shoreCast(x: number, z: number, fx: number, fz: number): { x: number; z: number } | null {
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-6) return null;
  const f = { x: fx / fl, z: fz / fl };
  const w = nearestWater(x, z);
  if (!w || f.x * w.x + f.z * w.z <= SHORE_FACING) return null;
  const straight = castAlong(x, z, f) ?? castAlong(x, z, w);
  if (straight) return straight;
  // (shallows straight ahead, the causeway's flank: the float goes a little to either side instead,
  // still out in front of the angler, never behind or beside them)
  for (const turn of [0.35, -0.35, 0.7, -0.7]) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const d = { x: f.x * c - f.z * s, z: f.x * s + f.z * c };
    if (d.x * w.x + d.z * w.z <= SHORE_FACING) continue;
    const cast = castAlong(x, z, d);
    if (cast) return cast;
  }
  return null;
}

/** Stream fishing (docs/caverns-roadmap.md R2.10): the stream's own water, wherever it runs clear of
 *  its fords, the plunge pool, the pools and the lake: an angler on its bank facing it casts into it
 *  (streamCast), the float on the stream's surface (streamSurfaceY: its channel's floor and a little,
 *  as the builder draws the ribbon). The cave's own fish, the small ones: nothing legendary swims up a
 *  stream this shallow (CatchLuck.shallow). */
export const STREAM_REACH = 1.4;
export function inStreamWater(x: number, z: number): boolean {
  return riverDistance(x, z) <= L.river.half * 0.9 && fordAt(x, z) < 0.5 && plungeDistance(x, z) > 0.1 && lakeFactor(x, z) >= 0.99 && poolAt(x, z, 0.1) < 0;
}
/** The stream as its water runs (docs/caverns-roadmap.md R3.3): each reach sampled every 0.3 m, its
 *  surface the channel's floor smoothed and only ever falling downstream (never under the floor: a
 *  shallow where the bed rises), its width breathing along it, and where the water drops fast a fall
 *  (a curtain off the lip into a splash at its foot, drawn by the builder, sprayed by the client) or a
 *  riffle (white water over stones). The builder draws the stream from this very profile
 *  (cavernsTerrainData's `stream`), the float rides on it. */
export type StreamSample = { x: number; z: number; y: number; w: number; tx: number; tz: number; kind: "run" | "riffle" | "fall" };
export type StreamFall = { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; tx: number; tz: number; w: number };
const STREAM_STEP = 0.3;
const FALL_DROP = 0.12;
const RIFFLE_DROP = 0.05;
function streamProfile(): { reaches: StreamSample[][]; falls: StreamFall[] } {
  const reaches: StreamSample[][] = [];
  const falls: StreamFall[] = [];
  L.river.segments.forEach((seg, si) => {
    const pts: { x: number; z: number; tx: number; tz: number; s: number }[] = [];
    let s = 0;
    for (let i = 0; i + 1 < seg.length; i++) {
      const [ax, az] = seg[i];
      const [bx, bz] = seg[i + 1];
      const ln = Math.hypot(bx - ax, bz - az);
      const m = Math.max(1, Math.round(ln / STREAM_STEP));
      for (let j = 0; j < m; j++) pts.push({ x: ax + ((bx - ax) * j) / m, z: az + ((bz - az) * j) / m, tx: (bx - ax) / ln, tz: (bz - az) / ln, s: s + (ln * j) / m });
      s += ln;
    }
    const [lx, lz] = seg[seg.length - 1];
    pts.push({ x: lx, z: lz, tx: pts[pts.length - 1].tx, tz: pts[pts.length - 1].tz, s });
    const floor = pts.map((q) => cavernsFloorY(q.x, q.z));
    // (the floor smoothed over a metre or so, then only ever falling: the water finds its level)
    const y: number[] = floor.map((_, i) => {
      let a = 0;
      let n = 0;
      for (let k = -3; k <= 3; k++) {
        const f = floor[Math.max(0, Math.min(floor.length - 1, i + k))];
        a += f;
        n++;
      }
      return a / n + 0.2;
    });
    // (the first reach leaves the plunge pool at the pool's own level)
    if (si === 0) for (let i = 0; i < y.length; i++) if (Math.hypot(pts[i].x - L.river.plunge.x, pts[i].z - L.river.plunge.z) < L.river.plunge.r + 0.25) y[i] = L.river.plunge.level;
    for (let i = 1; i < y.length; i++) y[i] = Math.max(Math.min(y[i], y[i - 1]), floor[i] + 0.05);
    // (a rise the floor forces carried back upstream a little: the water pooling behind it, never a
    // lump in it)
    for (let i = y.length - 2; i >= 0; i--) y[i] = Math.max(y[i], Math.min(y[i + 1], floor[i] + 0.25));
    // (a reach running into the lake never sinks under the lake's own level: it meets it at its shore)
    if (lakeFactor(pts[pts.length - 1].x, pts[pts.length - 1].z) < 1) {
      // (and runs down shallow over its delta to the lake's level by its waterline: no step down from
      // the stream onto the lake's surface; docs/caverns-roadmap.md R9.4)
      for (let i = 0; i < y.length; i++) if (lakeFactor(pts[i].x, pts[i].z) < 1.6) y[i] = Math.min(y[i], Math.max(L.lake.water + 0.015, floor[i] + 0.05));
      for (let i = 0; i < y.length; i++) y[i] = Math.max(y[i], L.lake.water + 0.015);
    }
    // (a reach out of the lake runs at the lake's own level until its lip, never over it)
    if (lakeFactor(pts[0].x, pts[0].z) < 1) for (let i = 0; i < y.length; i++) y[i] = Math.max(floor[i] + 0.03, Math.min(y[i], L.lake.water));
    // (a reach running into a warm pool meets it at the pool's own water, never under its rim:
    // docs/caverns-roadmap.md R8.5)
    const end = pts[pts.length - 1];
    L.terraces.pools.forEach((pool, pi) => {
      if (poolDistance(end.x, end.z, pool, pi) > 0.3) return;
      for (let i = 0; i < y.length; i++) if (poolDistance(pts[i].x, pts[i].z, pool, pi) < 1.2) y[i] = Math.max(y[i], pool.y + 0.005);
    });
    const reach: StreamSample[] = pts.map((q, i) => {
      const drop = i + 1 < y.length ? y[i] - y[i + 1] : 0;
      const w = 0.86 + 0.16 * Math.sin(q.s * 0.9 + si * 1.7) + 0.1 * Math.sin(q.s * 2.3 + si);
      return { x: q.x, z: q.z, y: y[i], w, tx: q.tx, tz: q.tz, kind: drop > FALL_DROP ? "fall" : drop > RIFFLE_DROP ? "riffle" : "run" };
    });
    // (each run of fall samples one fall: off the lip before it, into the foot after it)
    for (let i = 0; i < reach.length; i++) {
      if (reach[i].kind !== "fall") continue;
      let j = i;
      while (j + 1 < reach.length && reach[j + 1].kind === "fall") j++;
      const a = reach[i];
      const b = reach[Math.min(reach.length - 1, j + 1)];
      falls.push({ x0: a.x, z0: a.z, y0: a.y, x1: b.x, z1: b.z, y1: b.y, tx: a.tx, tz: a.tz, w: a.w });
      i = j;
    }
    reaches.push(reach);
  });
  return { reaches, falls };
}
const STREAM = streamProfile();
export const STREAM_REACHES = STREAM.reaches;
/** Where the stream falls (the jungle's own waterfall off the collapse's lip is `L.river.plunge`). */
export const STREAM_FALLS = STREAM.falls;
export function streamSurfaceY(x: number, z: number): number {
  let best = Infinity;
  let y = cavernsFloorY(x, z) + 0.2;
  for (const reach of STREAM_REACHES) {
    for (const q of reach) {
      const d = (q.x - x) ** 2 + (q.z - z) ** 2;
      if (d < best) {
        best = d;
        y = q.y;
      }
    }
  }
  return y;
}
export function streamCast(x: number, z: number, fx: number, fz: number): { x: number; z: number } | null {
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-6 || inStreamWater(x, z)) return null;
  const f = { x: fx / fl, z: fz / fl };
  for (let t = 0.2; t <= STREAM_REACH + 0.6 + 1e-9; t += 0.1) {
    const px = x + f.x * t;
    const pz = z + f.z * t;
    if (t > STREAM_REACH && !inStreamWater(px, pz)) break;
    if (inStreamWater(px, pz) && riverDistance(px, pz) <= L.river.half * 0.5) return { x: Math.round(px * 100) / 100, z: Math.round(pz * 100) / 100 };
  }
  return null;
}
/** Where a cast float sits: on the lake at its waterline, or on the stream's surface. */
export function floatY(x: number, z: number): number {
  return inLakeWater(x, z) ? CAVE_WATER_Y : streamSurfaceY(x, z);
}

/** The three lights that move (the forge's mouth, the warm pools, the lake's heart), each its height
 *  over what it stands on; the jungle's sunbeams, the islet's skylight and the sun over the collapse. */
export const CAVE_LIGHTS = {
  forge: [L.lights.forge[0], cavernsFloorY(L.lights.forge[0], L.lights.forge[2]) + L.lights.forge[1], L.lights.forge[2]],
  thermal: [L.lights.thermal[0], thermalPoolY(L.lights.thermal[0], L.lights.thermal[2]) + L.lights.thermal[1], L.lights.thermal[2]],
  cenote: [L.lights.cenote[0], L.lake.water + L.lights.cenote[1], L.lights.cenote[2]],
} as const;
export const DOLINE_BEAMS = L.beams;
export const CAVE_SKYLIGHT = L.skylight;
export const CAVE_SUN = L.sun;
/** The camera's bounds while you are down here: its look-at point is kept inside them (the shell
 *  round it: no void to see past). */
export const CAVERNS_CAMERA = { x0: -21, x1: 21, z0: -21, z1: 21 };

export const CAVERNS_PROPS: PropSpec[] = ([
  { propId: "cave_adit", x: L.adit.x, z: L.adit.z + 0.4, kind: "adit", color: "#8a6a3f", defaultOn: true, approachX: CAVE_ADIT_FRONT.x, approachZ: CAVE_ADIT_FRONT.z },
  { propId: "gus", x: L.gus.x, z: L.gus.z, kind: "prospector", color: "#6b5a4a", defaultOn: true, approachX: GUS_FRONT.x, approachZ: GUS_FRONT.z },
  { propId: "ancient_forge", x: L.forge.x, z: L.forge.z, kind: "forge", color: "#ff7a2f", defaultOn: true, approachX: FORGE_FRONT.x, approachZ: FORGE_FRONT.z },
  { propId: "geode_anvil", x: L.anvil.x, z: L.anvil.z, kind: "anvil", color: "#8a8f9a", defaultOn: true, approachX: ANVIL_FRONT.x, approachZ: ANVIL_FRONT.z },
  { propId: "finnegan", x: L.finnegan.x, z: L.finnegan.z, kind: "angler", color: "#e8a6b8", defaultOn: true, approachX: FINNEGAN_FRONT.x, approachZ: FINNEGAN_FRONT.z },
  { propId: "winch_bottom", x: CAVE_WINCH.bottom.x, z: CAVE_WINCH.bottom.z, kind: "winch", color: "#8a6a3f", defaultOn: true, approachX: CAVE_WINCH.lower.x, approachZ: CAVE_WINCH.lower.z },
  { propId: "winch_top", x: CAVE_WINCH.head.x, z: CAVE_WINCH.head.z, kind: "winch", color: "#8a6a3f", defaultOn: true, approachX: CAVE_WINCH.upper.x, approachZ: CAVE_WINCH.upper.z },
  // (the raft's two landings: a ride across, the travel kind as the winch)
  { propId: "raft_north", x: RAFT.via[0].x, z: RAFT.via[0].z, kind: "winch", color: "#8a6a3f", defaultOn: true, approachX: RAFT.north.x, approachZ: RAFT.north.z },
  { propId: "raft_islet", x: RAFT.via[RAFT.via.length - 1].x, z: RAFT.via[RAFT.via.length - 1].z, kind: "winch", color: "#8a6a3f", defaultOn: true, approachX: RAFT.islet.x, approachZ: RAFT.islet.z },
  ...ORE_NODES.map((n): PropSpec => ({ propId: orePropId(n.id), x: n.x, z: n.z, kind: "ore", color: ORE_KINDS[n.kind].glow, defaultOn: true, approachX: n.approach.x, approachZ: n.approach.z })),
] satisfies PropSpec[]).map((p) => ({ ...p, y: cavernsFloorY(p.x, p.z) }));

// (round things are discs: shared/collision.ts `disc`)
const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r, r });
const square = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
const box = (x0: number, x1: number, z0: number, z1: number): AABB => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });

const MONO = ORE_NODE_AT.get("monolith")!;
const MONO_R = ORE_KINDS.monolith.radius * 0.8;
const FN = L.finnegan;
/** What you walk round besides the ground's own mask (cavernsBlocked: the cliffs, the walls, the
 *  water, the pools, the stream, the rocks): the basecamp, the adit's timbers, the winch's frame, the
 *  nodes and their host rocks, the Hound's Hand, Finnegan and his log. */
export const CAVERNS_OBSTACLES: AABB[] = [
  // Gus's trading post: the counter, and everything under the lean-to behind it back to the rock
  box(L.workstation.x - L.workstation.len / 2, L.workstation.x + L.workstation.len / 2, L.walls.north, L.workstation.z + L.workstation.w / 2),
  box(L.camp.posts[0][0] + 0.1, L.camp.posts[1][0] - 0.1, L.walls.north, L.workstation.z - L.workstation.w / 2),
  // (the forge: its hearth and chamber, a little over half its width; the mould and the trough at
  // its flanks walked past)
  box(L.forge.x - L.forge.w * 0.31, L.forge.x + L.forge.w * 0.31, L.walls.north, L.forge.z + L.forge.d * 0.3),
  around(L.anvil, 0.32),
  // the lean-to's two front posts (the survey transit, a standing tripod, is walked past)
  ...L.camp.posts.map(([x, z]) => around({ x, z }, 0.1)),
  box(L.crate.x - L.crate.w * 0.3, L.crate.x + L.crate.w * 0.3, L.crate.z - L.crate.d * 0.3, L.crate.z + L.crate.d * 0.3),
  // the adit's yard (docs/caverns-roadmap.md R3.6): the tipped ore cart, the spoil heap, the tool box,
  // the signpost
  around({ x: L.aditYard.cart[0], z: L.aditYard.cart[1] }, 0.45),
  around({ x: L.aditYard.spoil[0], z: L.aditYard.spoil[1] }, 0.5),
  around({ x: L.aditYard.tools[0], z: L.aditYard.tools[1] }, 0.3),
  around({ x: L.aditYard.sign[0], z: L.aditYard.sign[1] }, 0.07),
  around({ x: L.adit.x - L.adit.w / 2 - 0.14, z: L.adit.z + 0.25 }, 0.14),
  around({ x: L.adit.x + L.adit.w / 2 + 0.14, z: L.adit.z + 0.25 }, 0.14),
  // the winch's gantry at the breakdown's edge (its two legs)
  around({ x: L.winch.x - 0.7, z: L.winch.top }, 0.12),
  around({ x: L.winch.x + 0.7, z: L.winch.top }, 0.12),
  ...ORE_NODES.filter((n) => n.kind !== "monolith").map((n) => around(n, ORE_KINDS[n.kind].radius * 0.6)),
  // (the Monolith rounder: a cross of two boxes, so the walk round it on the islet stays open)
  box(MONO.x - MONO_R, MONO.x + MONO_R, MONO.z - MONO_R * 0.62, MONO.z + MONO_R * 0.62),
  box(MONO.x - MONO_R * 0.62, MONO.x + MONO_R * 0.62, MONO.z - MONO_R, MONO.z + MONO_R),
  // the ring of standing stones about the islet's edge (docs/caverns-roadmap.md R3.5), the fallen one
  // lying low
  ...L.monolithRing.stones.map(([deg, , fallen]) => around({ x: MONO.x + Math.cos((deg * Math.PI) / 180) * L.monolithRing.r, z: MONO.z + Math.sin((deg * Math.PI) / 180) * L.monolithRing.r }, fallen ? 0.3 : 0.24)),
  ...ORE_NODES.flatMap((n) => {
    const b = nodeBackRock(n);
    return b ? [around(b, b.r * 0.5)] : [];
  }),
  // the overlook's hearth: its ring of stones round the fire, and the four log benches round it
  around(L.hearth, L.hearth.r + 0.12),
  ...L.hearthSeats.map((s) => around(s, 0.26)),
  // the basecamp's gear: the barrels, the crate stack, the survey board, the lantern posts (the
  // bedroll is walked over)
  ...L.campProps.flatMap(([x, z, kind]) => (kind === "bedroll" ? [] : [around({ x: x as number, z: z as number }, kind === "post" ? 0.1 : kind === "board" ? 0.25 : kind === "tent" ? 0.95 : kind === "sacks" ? 0.35 : 0.42)])),
  // Finnegan on his log (the log lies across him, east-west)
  box(FN.x - FN.log / 2, FN.x + FN.log / 2, FN.z - 0.35, FN.z + 0.35),
];
export const CAVERNS_SPAWNS: Pt[] = L.spawns;

/** Ground no one can walk to never looks like floor (docs/caverns-roadmap.md R4.1): the walk mask
 *  flooded from the arrival for a body (its feet on the ground, its body clear of everything standing
 *  there); any open ground that flood never comes within half a metre of (the terraces' west ledges
 *  behind their pools, a sliver walled in by stones) is shut, and the floor paints it rock with the
 *  rest of the ground you cannot stand on (maskShutByGround). */
const UNREACHED = new Uint8Array(MASK_N * MASK_N);
{
  const cell = (i: number) => -L.half + (i + 0.5) * MASK_CELL;
  const bodyOpen = (x: number, z: number) =>
    !cavernsBlocked(x, z, 0.18) &&
    !CAVERNS_OBSTACLES.some((b) => {
      if (!(x + 0.3 > b.minX && x - 0.3 < b.maxX && z + 0.3 > b.minZ && z - 0.3 < b.maxZ)) return false;
      if (b.r === undefined) return true;
      return (x - (b.minX + b.maxX) / 2) ** 2 + (z - (b.minZ + b.maxZ) / 2) ** 2 < (b.r + 0.3) ** 2;
    });
  const reached = new Uint8Array(MASK_N * MASK_N);
  const start = Math.floor((L.arrival.z + L.half) / MASK_CELL) * MASK_N + Math.floor((L.arrival.x + L.half) / MASK_CELL);
  const stack = [start];
  reached[start] = 1;
  while (stack.length) {
    const q = stack.pop()!;
    const i = q % MASK_N;
    const k = (q - i) / MASK_N;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ii = i + di;
      const kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= MASK_N || kk >= MASK_N) continue;
      const n = kk * MASK_N + ii;
      if (reached[n] || !CAVERNS_MASK[n] || !bodyOpen(cell(ii), cell(kk))) continue;
      // (a diagonal step only where the body passes the corner too)
      if (di && dk && !(bodyOpen(cell(i + di), cell(k)) || bodyOpen(cell(i), cell(k + dk)))) continue;
      reached[n] = 1;
      stack.push(n);
    }
  }
  // (the pockets: ground a body stands on that the flood never reached, six cells or more; and the
  // open cells a cell round them clear of anything standing there)
  const underSomething = (x: number, z: number) => CAVERNS_OBSTACLES.some((o) => x > o.minX - 0.05 && x < o.maxX + 0.05 && z > o.minZ - 0.05 && z < o.maxZ + 0.05);
  const pocket = new Uint8Array(MASK_N * MASK_N);
  const seen = new Uint8Array(MASK_N * MASK_N);
  for (let q0 = 0; q0 < CAVERNS_MASK.length; q0++) {
    if (seen[q0] || reached[q0] || !CAVERNS_MASK[q0]) continue;
    const i0 = q0 % MASK_N;
    const k0 = (q0 - i0) / MASK_N;
    if (!bodyOpen(cell(i0), cell(k0))) continue;
    const comp: number[] = [];
    const st = [q0];
    seen[q0] = 1;
    while (st.length) {
      const q = st.pop()!;
      comp.push(q);
      const i = q % MASK_N;
      const k = (q - i) / MASK_N;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di;
        const kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= MASK_N || kk >= MASK_N) continue;
        const n = kk * MASK_N + ii;
        if (seen[n] || reached[n] || !CAVERNS_MASK[n] || !bodyOpen(cell(ii), cell(kk))) continue;
        seen[n] = 1;
        st.push(n);
      }
    }
    // (the ring inside the hearth's benches is the fire's, never a ledge)
    const inHearth = comp.some((q) => Math.hypot(cell(q % MASK_N) - L.hearth.x, cell(Math.floor(q / MASK_N)) - L.hearth.z) < 2.2);
    if (comp.length >= 6 && !inHearth) for (const q of comp) pocket[q] = 1;
  }
  for (let q = 0; q < CAVERNS_MASK.length; q++) {
    if (!pocket[q]) continue;
    const i = q % MASK_N;
    const k = (q - i) / MASK_N;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const ii = i + di;
      const kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= MASK_N || kk >= MASK_N) continue;
      const n = kk * MASK_N + ii;
      if (!CAVERNS_MASK[n] || reached[n] || underSomething(cell(ii), cell(kk))) continue;
      UNREACHED[n] = 1;
    }
  }
  for (let q = 0; q < CAVERNS_MASK.length; q++) if (UNREACHED[q]) CAVERNS_MASK[q] = 0;
}
/** Every cell of ground no one reaches, as [x, z] of its middle (the builder dresses them). */
function unreachedCells(): [number, number][] {
  const out: [number, number][] = [];
  for (let q = 0; q < UNREACHED.length; q++) if (UNREACHED[q]) out.push([-L.half + ((q % MASK_N) + 0.5) * MASK_CELL, -L.half + (Math.floor(q / MASK_N) + 0.5) * MASK_CELL]);
  return out;
}
/** Whether the mask's cell (i, k) is ground no one reaches (shut and painted rock for it). */
export function maskUnreached(i: number, k: number): boolean {
  return UNREACHED[k * MASK_N + i] === 1;
}
