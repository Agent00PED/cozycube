import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";
import { ORE_KINDS, type OreKind } from "../caverns_mining";

// The Glimmering Caverns (the map "glimmering_caverns"): a monumental 45 x 45 natural karst cavern,
// reached only through the old mine adit set deep in a cliff alcove behind the Whispering Woods'
// Autumn Maples (Old Flint the Badger keeps it: meeting him hands you the Rusted Pickaxe and opens it
// to you for good). Like every world, it is the one room's: going down the adit is a trip.
//
// No tabletops, no stairs: one continuous organic ground (0 to 3.8 m), walked on exactly where it is
// drawn. From the north down:
//
//   The Sunlit Doline          the high ground (about 3.4 m, undulating, rising in its back corners)
//                              under the ceiling's collapse, sunlight pouring down it: mossy loam,
//                              ferns, tumbled limestone; the adit in the north wall (you arrive facing
//                              south, over the lake); the Expedition Outpost (Gus the Mole at his log
//                              workstation, the Thermal Bellows Forge in a basalt fissure of the north
//                              wall, the meteorite Geode Anvil on a low outcrop); the Amber Fault's
//                              eight Coal Seams and Copper Veins set in its boulders and the wall
//   The Wet Slate Shelf        the doline's lower west (about 2.7 m), dark damp slate: six Iron Lodes
//                              in the mossy seams of the walls and its outcrops
//   The Limestone Overlook     a natural plateau half way down (1.8 m) looking out over the lake. One
//                              trail meanders down to it from the doline, switching back round the
//                              hillside's outcrops; from it two trails split, west down to the
//                              Travertine Terraces and south down to the sandy shore
//   The Travertine Terraces    three rimstone pools of warm mineral water cascading down the west
//                              slope, six stone seats in them (a soak: the Deep Warmth)
//   The Abyssal Cenote Lake    south-centre (26 x 18 m): clear aquamarine over sand that slopes into
//                              it all round (fish from anywhere on its shore); a limestone islet under
//                              a skylight, weeping aerial roots over the Titan Monolith (a sandbar
//                              wades out to it); Finnegan the Grotto Angler on his driftwood log
//   The Abyssal Chasm          the deep east wing below the doline's east cliff: five Silver Seams
//                              and four Glimmerstone Clusters in its crystal alcoves
//
// The ground is one function (cavernsHeight), sampled on a 0.5 m grid: that grid, triangulated one way
// (see cavernsFloorY), IS the floor, where the room walks you, where the avatar's feet land, and the
// client's click collider; the Blender builder builds the diorama's ground from the very same grid
// (scripts/blender/data/caverns_terrain.json, written by `npm run caverns-terrain`, kept in step by
// `npm run check-layout`). Where you can stand is a 0.25 m mask over it (cavernsWalkable): the
// plateaus, the trails, the shore and the floors walkable, the slopes between them, the walls, the
// water, the pools and every rock not. The camera looks from +x +z, close: the north and west are
// the cavern's tall shell, the south and east its open rim.

type Pt = { x: number; z: number };

export const CAVERNS_LAYOUT = /* layout:begin */ {
  "half": 22.5,
  "walls": { "north": -22.5, "west": -22.5, "height": 11.0, "margin": 1.25 },
  "levels": { "upper": 3.42, "shelf": 2.72, "overlook": 1.8, "low": 0.42 },
  "zones": [
    { "id": "shelf", "name": "The Wet Slate Shelf", "x0": -22.5, "x1": -13.5, "z0": -22.5, "z1": -9.0 },
    { "id": "doline", "name": "The Sunlit Doline", "x0": -13.5, "x1": 13.5, "z0": -22.5, "z1": -10.0 },
    { "id": "overlook", "name": "The Limestone Overlook", "x0": -8.0, "x1": 10.0, "z0": -10.8, "z1": -3.4 },
    { "id": "terraces", "name": "The Travertine Terraces", "x0": -22.5, "x1": -11.5, "z0": -9.0, "z1": 6.5 },
    { "id": "chasm", "name": "The Abyssal Chasm", "x0": 13.5, "x1": 22.5, "z0": -22.5, "z1": 3.0 },
    { "id": "cenote", "name": "The Abyssal Cenote Lake", "x0": -22.5, "x1": 22.5, "z0": -10.0, "z1": 22.5 }
  ],
  "upper": [[-23.5, -23.5], [13.2, -23.5], [13.4, -18.5], [12.9, -14.8], [11.6, -12.2], [9.2, -11.3], [5.8, -11.8], [2.4, -10.9], [-1.2, -11.2], [-4.6, -10.5], [-8.0, -10.9], [-11.2, -10.1], [-14.6, -9.5], [-18.0, -9.1], [-23.5, -9.4]],
  "overlook": [[-8.6, -10.9], [-7.6, -8.0], [-7.0, -5.3], [-5.0, -3.8], [-2.2, -3.5], [0.9, -4.1], [3.6, -5.2], [6.4, -6.4], [8.2, -8.0], [9.4, -10.6], [9.6, -12.0]],
  "overlookRise": 0.35,
  "paths": [
    { "id": "descent", "half": 1.3, "points": [[4.0, -12.9, 3.42], [7.3, -11.9, 3.12], [8.9, -10.3, 2.8], [7.1, -8.6, 2.45], [4.2, -8.1, 2.2], [1.6, -7.9, 2.1]] },
    { "id": "terraceTrail", "half": 1.2, "points": [[-5.9, -7.4, 2.0], [-8.0, -5.9, 1.4], [-9.3, -4.5, 0.95], [-10.8, -3.3, 0.9]] },
    { "id": "shoreTrail", "half": 1.2, "points": [[-1.6, -5.0, 1.84], [-0.3, -3.3, 1.42], [1.3, -2.0, 0.96], [2.9, -0.9, 0.54]] }
  ],
  "adit": { "x": 0.0, "z": -22.1, "w": 2.0, "h": 2.6 },
  "arrival": { "x": 0.0, "z": -19.5 },
  "gus": { "x": -6.2, "z": -16.6, "yaw": 0 },
  "workstation": { "x": -6.2, "z": -15.6, "len": 2.4, "w": 0.75, "top": 0.78 },
  "forge": { "x": 6.8, "z": -21.3, "w": 2.6, "d": 1.8, "h": 3.2 },
  "anvil": { "x": 3.2, "z": -15.2, "outcrop": 0.62 },
  "crate": { "x": 4.55, "z": -15.7, "w": 0.9, "d": 0.6, "h": 0.55 },
  "lake": { "x": 1.0, "z": 10.8, "rx": 13.0, "rz": 9.0, "water": -0.06, "depth": 2.4, "beach": 1.28, "wade": 1.04 },
  "islet": { "x": 2.2, "z": 12.2, "r": 3.1, "top": 0.32 },
  "sandbar": { "points": [[0.4, 1.0], [0.9, 4.2], [1.5, 7.2], [2.0, 9.6]], "half": 1.1, "y": -0.02 },
  "skylight": { "x": 1.8, "z": 12.0, "r": 3.4 },
  "tower": { "x": 0.0, "z": 11.4, "r": 0.9, "h": 5.2 },
  "finnegan": { "x": 6.8, "z": 0.8, "yaw": 0.25, "log": 1.5 },
  "terraces": {
    "x0": -20.8, "x1": -14.7,
    "pools": [{ "z0": -6.6, "z1": -3.0 }, { "z0": -2.6, "z1": 1.0 }, { "z0": 1.4, "z1": 5.0 }]
  },
  "thermalSeats": [
    { "id": "thermal_1", "x": -15.7, "z": -5.6, "face": 1.5708, "exit": { "x": -13.4, "z": -5.6 } },
    { "id": "thermal_2", "x": -15.7, "z": -4.0, "face": 1.5708, "exit": { "x": -13.4, "z": -4.0 } },
    { "id": "thermal_3", "x": -15.7, "z": -1.7, "face": 1.5708, "exit": { "x": -13.4, "z": -1.7 } },
    { "id": "thermal_4", "x": -15.7, "z": 0.0, "face": 1.5708, "exit": { "x": -13.4, "z": 0.0 } },
    { "id": "thermal_5", "x": -15.7, "z": 2.3, "face": 1.5708, "exit": { "x": -13.4, "z": 2.3 } },
    { "id": "thermal_6", "x": -15.7, "z": 3.9, "face": 1.5708, "exit": { "x": -13.4, "z": 3.9 } }
  ],
  "nodes": [
    { "id": "coal_1", "kind": "coal", "x": -11.6, "z": -19.4, "face": [0.55, 0.85] },
    { "id": "copper_1", "kind": "copper", "x": -8.6, "z": -21.35, "face": [0, 1] },
    { "id": "coal_2", "kind": "coal", "x": -10.8, "z": -13.2, "face": [0.75, 0.66] },
    { "id": "copper_2", "kind": "copper", "x": -2.6, "z": -13.0, "face": [0.1, 1] },
    { "id": "coal_3", "kind": "coal", "x": 10.8, "z": -21.35, "face": [0, 1] },
    { "id": "copper_3", "kind": "copper", "x": 10.9, "z": -16.2, "face": [-0.6, 0.8] },
    { "id": "coal_4", "kind": "coal", "x": 7.4, "z": -13.5, "face": [0.25, 1] },
    { "id": "copper_4", "kind": "copper", "x": -4.8, "z": -21.35, "face": [0, 1] },
    { "id": "iron_1", "kind": "iron", "x": -21.35, "z": -18.6, "face": [1, 0] },
    { "id": "iron_2", "kind": "iron", "x": -21.35, "z": -14.2, "face": [1, 0.1] },
    { "id": "iron_3", "kind": "iron", "x": -17.2, "z": -21.35, "face": [0, 1] },
    { "id": "iron_4", "kind": "iron", "x": -13.8, "z": -21.35, "face": [0.1, 1] },
    { "id": "iron_5", "kind": "iron", "x": -16.4, "z": -12.8, "face": [0.4, 1] },
    { "id": "iron_6", "kind": "iron", "x": -19.6, "z": -11.6, "face": [0.8, 0.6] },
    { "id": "silver_1", "kind": "silver", "x": 15.7, "z": -18.4, "face": [1, 0.15] },
    { "id": "silver_2", "kind": "silver", "x": 18.4, "z": -21.35, "face": [0, 1] },
    { "id": "silver_3", "kind": "silver", "x": 15.9, "z": -13.4, "face": [1, 0.35] },
    { "id": "silver_4", "kind": "silver", "x": 20.8, "z": -8.2, "face": [-0.8, 0.6] },
    { "id": "silver_5", "kind": "silver", "x": 17.2, "z": -1.6, "face": [-0.3, 1] },
    { "id": "glimmer_1", "kind": "glimmer", "x": 21.2, "z": -21.1, "face": [-0.55, 0.85] },
    { "id": "glimmer_2", "kind": "glimmer", "x": 16.0, "z": -15.8, "face": [1, 0.2] },
    { "id": "glimmer_3", "kind": "glimmer", "x": 21.1, "z": -14.4, "face": [-1, 0.25] },
    { "id": "glimmer_4", "kind": "glimmer", "x": 16.4, "z": -6.4, "face": [0.35, 0.94] },
    { "id": "monolith", "kind": "monolith", "x": 2.4, "z": 12.4, "face": [0.2, -0.98] }
  ],
  "boulders": [[-9.0, -18.0, 0.9], [5.4, -17.8, 0.7], [-1.6, -15.2, 0.5], [9.0, -14.6, 0.8], [-12.8, -16.4, 0.8], [1.8, -19.2, 0.45], [9.0, -19.6, 0.6], [-17.6, -16.4, 0.75], [-14.4, -13.4, 0.6], [5.6, -8.9, 0.9], [3.8, -9.8, 0.6], [9.4, -8.0, 0.8], [-6.8, -0.9, 0.7], [10.2, -1.6, 0.9], [12.4, 1.6, 0.8], [16.0, 9.6, 0.9], [18.2, 16.8, 1.0], [-10.8, 17.6, 0.9], [8.8, 20.6, 0.8], [-17.8, 9.6, 0.9], [-8.6, -8.6, 0.8]],
  "fins": [[19.6, -3.4, 0.5, 1.6, 2.6, 0.4], [20.2, -10.8, 0.6, 1.6, 3.0, -0.2], [19.8, -17.8, 0.5, 1.5, 2.8, 0.4]],
  "stalagmites": [[-20.4, -20.4, 0.75, 5.6], [-15.0, -20.9, 0.5, 4.2], [12.6, -21.0, 0.6, 5.0], [21.2, -18.4, 0.6, 4.6], [-20.9, -7.2, 0.6, 4.0], [21.3, -1.2, 0.5, 3.4], [-20.9, 8.2, 0.7, 4.8], [-6.2, -8.6, 0.32, 2.2], [0.6, -8.0, 0.28, 1.6], [13.6, -5.6, 0.45, 3.2]],
  "crystals": [[16.9, -20.9, 1.1], [21.5, -12.0, 1.2], [16.6, -10.8, 0.8], [21.3, -4.8, 1.0], [15.2, -7.4, 0.7], [-21.3, -2.2, 0.8], [-21.0, 14.0, 0.9]],
  "shrooms": [[19.5, -19.6, 0.9], [16.6, -12.4, 0.7], [20.9, -6.6, 0.8], [-20.8, 1.6, 0.7], [-19.6, 12.6, 0.9], [15.0, 4.6, 0.7]],
  "beams": [[-4.2, -17.4, 1.7], [1.6, -18.6, 2.0], [7.8, -15.6, 1.4], [-9.4, -13.4, 1.2], [-0.4, -13.6, 1.0]],
  "lights": { "forge": [6.8, 4.2, -20.1], "thermal": [-17.6, 2.4, -1.0], "cenote": [2.2, 1.4, 12.0] },
  "spawns": [{ "x": 0.0, "z": -19.5 }, { "x": 0.9, "z": -18.8 }, { "x": -0.9, "z": -18.8 }]
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
/** The nearest point of a trail to (x, z): how far, and the trail's height there. */
function pathNear(x: number, z: number, pts: readonly (readonly number[])[]): { d: number; h: number } {
  let best = { d: Infinity, h: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az, ah] = pts[i];
    const [bx, bz, bh] = pts[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const t = clamp01(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz));
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    if (d < best.d) best = { d, h: mix(ah, bh, t) };
  }
  return best;
}

/** How far out on the lake a point is, against its shore: under 1 the water (0 its middle), 1 the
 *  waterline, above it the beach and the land (a wobbly ellipse, never a clean one). */
export function lakeFactor(x: number, z: number): number {
  const dx = (x - L.lake.x) / L.lake.rx;
  const dz = (z - L.lake.z) / L.lake.rz;
  const a = Math.atan2(dz, dx);
  const wob = 1 + 0.05 * Math.sin(3 * a + 0.7) + 0.035 * Math.sin(5 * a + 2.1);
  return Math.hypot(dx, dz) / wob;
}
/** How far from the islet's middle, against its rocky shore (under 1: the islet). */
export function isletFactor(x: number, z: number): number {
  const dx = x - L.islet.x;
  const dz = z - L.islet.z;
  const a = Math.atan2(dz, dx);
  const r = L.islet.r * (1 + 0.12 * Math.sin(3 * a + 1.0) + 0.06 * Math.sin(7 * a + 0.4));
  return Math.hypot(dx, dz) / r;
}
/** How far a point is from the sandbar's spine (m). */
export function sandbarDistance(x: number, z: number): number {
  let best = Infinity;
  const P = L.sandbar.points;
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, az] = P[i];
    const [bx, bz] = P[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const t = clamp01(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz));
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}
export const onSandbar = (x: number, z: number) => sandbarDistance(x, z) <= L.sandbar.half;
/** Whether (x, z) is the lake's water (the islet's top and the sandbar are not). */
export function inLakeWater(x: number, z: number): boolean {
  return lakeFactor(x, z) < L.lake.wade && isletFactor(x, z) >= 0.8 && !onSandbar(x, z);
}

/** A trail's hold on the ground at (x, z): how much (1 on its tread, easing to 0 over its shoulders,
 *  SHOULDER m wide) and the height it asks for there. Each of its stretches asks for its own height,
 *  the nearer ones far louder (a high power of their holds), so where two legs of a switchback pass
 *  close the ground between them banks steeply from one down to the other, never a step. */
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

/** The doline's (and the shelf's) plateau: signed distance to its rim. */
const upperDistance = (x: number, z: number) => polygonDistance(x, z, L.upper);
/** How much of the plateau a point is (1 on it, 0 at the foot of its rim's rugged slope, 2.6 m out). */
function upperWeight(x: number, z: number): number {
  return 1 - smoothstep(-0.6, 2.6, upperDistance(x, z));
}
/** The Limestone Overlook: the terrace under the doline's south rim (signed distance to its edge), and
 *  how much of it a point is (its bluff down to the low ground 2.4 m wide). */
const overlookDistance = (x: number, z: number) => polygonDistance(x, z, L.overlook);
function overlookWeight(x: number, z: number): number {
  return 1 - smoothstep(-0.5, 2.4, overlookDistance(x, z));
}
function overlookLevel(x: number, z: number): number {
  return L.levels.overlook + L.overlookRise * smoothstep(-4.5, -9.5, z) + 0.05 * wave(x, z, 5);
}
/** The terraces' slope down the west: how much higher the low ground stands there. */
function terraceRise(x: number, z: number): number {
  return 0.95 * smooth01((6 - z) / 14) * smoothstep(-8.5, -11.5, x);
}
/** The low ground: the shore's backlands, the terraces' slope, the chasm's floor, the south sand. */
function lowLevel(x: number, z: number): number {
  const chasm = 0.3 * smoothstep(12.5, 16.0, x) * (1 - smoothstep(-2.0, 4.0, z));
  return L.levels.low + 0.07 * wave(x, z, 3) + terraceRise(x, z) + chasm + 0.1 * wave(x * 0.7, z * 0.7, 9) * smoothstep(12.5, 16.0, x);
}
function upperLevel(x: number, z: number): number {
  const shelf = mix(L.levels.shelf, L.levels.upper, smoothstep(-15.0, -10.0, x));
  const corner = 0.2 * smoothstep(-15, -21, z) * smoothstep(6, 12, x);
  return shelf + 0.14 * wave(x, z, 1) + corner;
}

/** The ground's height at (x, z) as the builder models it and the grid samples it (the walk surface is
 *  the grid: cavernsFloorY). */
export function cavernsHeight(x: number, z: number): number {
  let h = lowLevel(x, z);
  // the overlook's terrace, then the doline's plateau over it (every rim's slope rugged)
  const wo = overlookWeight(x, z);
  h = mix(h, overlookLevel(x, z), wo);
  const wu = upperWeight(x, z);
  h = mix(h, upperLevel(x, z), wu);
  const rugged = 4 * wu * (1 - wu) + 4 * wo * (1 - wo);
  h += 0.32 * rugged * wave(x * 2.1, z * 2.1, 7);
  // the trails, carved (and banked) into the slopes, their shoulders soft
  for (const p of L.paths) {
    const n = pathHeight(x, z, p);
    if (n.w > 0) h = mix(h, n.h, n.w);
  }
  // the lake: the sand sloping down into it, its bed falling away to the deep; the sandbar and the islet
  const f = lakeFactor(x, z);
  if (f < L.lake.beach) {
    const shore = -0.22 + 0.62 * smooth01((f - 1) / (L.lake.beach - 1));
    const bed = f < 1 ? -0.22 - (L.lake.depth - 0.22) * smooth01((1 - f) / 0.55) : shore;
    h = mix(bed, h, smooth01((f - 1) / (L.lake.beach - 1)));
    const sb = sandbarDistance(x, z);
    if (sb < L.sandbar.half + 1.2) h = Math.max(h, mix(L.sandbar.y, h, smooth01((sb - L.sandbar.half * 0.6) / 1.6)));
    const g = isletFactor(x, z);
    if (g < 1.4) h = Math.max(h, L.sandbar.y + (L.islet.top - L.sandbar.y) * smooth01((1.0 - g) / 0.45) - 0.6 * smooth01((g - 1) / 0.4));
  }
  return h;
}

// --- the grids: the floor (0.5 m) and where you can stand (0.25 m) ------------------------------------------

/** The floor's grid: a vertex every 0.5 m over the whole cavern, its heights rounded to 0.1 mm. */
export const TERRAIN_CELL = 0.5;
export const TERRAIN_N = Math.round((L.half * 2) / TERRAIN_CELL) + 1;
const TERRAIN_X0 = -L.half;
export const TERRAIN_HEIGHTS: Float64Array = (() => {
  const out = new Float64Array(TERRAIN_N * TERRAIN_N);
  for (let k = 0; k < TERRAIN_N; k++) {
    for (let i = 0; i < TERRAIN_N; i++) out[k * TERRAIN_N + i] = Math.round(cavernsHeight(TERRAIN_X0 + i * TERRAIN_CELL, TERRAIN_X0 + k * TERRAIN_CELL) * 1e4) / 1e4;
  }
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

/** Every natural rock you walk round (the boulders, the fins, the stalagmites, the crystals and the
 *  mushrooms), as discs. */
const ROCK_DISCS: { x: number; z: number; r: number }[] = [
  ...L.boulders.map(([x, z, r]) => ({ x, z, r: r * 0.92 })),
  ...L.fins.flatMap(([x, z, rx, rz, , yaw]) => {
    // (a fin is a long rock turned `yaw`: a row of discs down its length)
    const len = Math.max(rx, rz);
    const w = Math.min(rx, rz);
    const along = rx >= rz ? { x: Math.cos(yaw), z: -Math.sin(yaw) } : { x: Math.sin(yaw), z: Math.cos(yaw) };
    const n = Math.max(2, Math.ceil(len / 0.4));
    return Array.from({ length: n + 1 }, (_, k) => {
      const t = -len + (2 * len * k) / n;
      return { x: x + along.x * t, z: z + along.z * t, r: w * 1.05 };
    });
  }),
  ...L.stalagmites.map(([x, z, r]) => ({ x, z, r: r * 1.1 })),
  ...L.crystals.map(([x, z, s]) => ({ x, z, r: 0.34 * s })),
  ...L.shrooms.map(([x, z, s]) => ({ x, z, r: 0.3 * s })),
];

/** The steepest ground anyone walks on (degrees): nowhere a step, nowhere a scramble. */
export const STEEPEST_WALK = 28;
const STEEP = Math.tan((STEEPEST_WALK * Math.PI) / 180);
/** Whether the floor at (x, z) climbs or drops more steeply than STEEPEST_WALK toward any of its
 *  neighbours a mask cell away (a trail's shoulder, a sandbar's flank, a bank between two legs). */
function tooSteep(x: number, z: number): boolean {
  const s = 0.25;
  const h = cavernsFloorY(x, z);
  return Math.max(Math.abs(cavernsFloorY(x + s, z) - h), Math.abs(cavernsFloorY(x - s, z) - h), Math.abs(cavernsFloorY(x, z + s) - h), Math.abs(cavernsFloorY(x, z - s) - h)) > STEEP * s;
}

/** Whether an avatar may stand at (x, z) (its centre): on a plateau, a trail, the overlook or the low
 *  ground, clear of the walls, the slopes, the water, the pools and the rocks, and never on ground
 *  steeper than STEEPEST_WALK. */
export function cavernsWalkable(x: number, z: number): boolean {
  const m = L.walls.margin;
  if (x < L.walls.west + m || z < L.walls.north + m || x > L.half - 0.6 || z > L.half - 0.6) return false;
  if (inLakeWater(x, z)) return false;
  if (tooSteep(x, z)) return false;
  // the terraces' pools (bathers are seated in them)
  const T = L.terraces;
  if (x > T.x0 - 0.5 && x < T.x1 && z > T.pools[0].z0 - 0.3 && z < T.pools[T.pools.length - 1].z1 + 0.3) return false;
  for (const r of ROCK_DISCS) if ((x - r.x) ** 2 + (z - r.z) ** 2 < r.r * r.r) return false;
  let onTrail = false;
  for (const p of L.paths) if (pathNear(x, z, p.points).d <= p.half) onTrail = true;
  if (onTrail) return true;
  if (upperDistance(x, z) < -0.6) return true;
  const wu = upperWeight(x, z);
  // the overlook's terrace (below the doline's rim), and the low ground (below every slope)
  if (overlookDistance(x, z) < -0.5 && wu < 0.06) return true;
  return wu < 0.06 && overlookWeight(x, z) < 0.06;
}

/** The mask of where you can stand: a 0.25 m cell each, 1 where its middle is walkable. */
export const MASK_CELL = 0.25;
export const MASK_N = Math.round((L.half * 2) / MASK_CELL);
export const CAVERNS_MASK: Uint8Array = (() => {
  const out = new Uint8Array(MASK_N * MASK_N);
  for (let k = 0; k < MASK_N; k++) {
    for (let i = 0; i < MASK_N; i++) out[k * MASK_N + i] = cavernsWalkable(-L.half + (i + 0.5) * MASK_CELL, -L.half + (k + 0.5) * MASK_CELL) ? 1 : 0;
  }
  return out;
})();
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

/** What each floor vertex is (the builder paints it so): 0 rock, 1 mossy loam, 2 trail scree, 3 sand,
 *  4 wet slate, 5 the chasm's dark floor, 6 travertine, 7 the lake's bed, 8 the overlook's limestone,
 *  9 the low ground's packed earth. */
export const SURFACE = { rock: 0, loam: 1, scree: 2, sand: 3, slate: 4, chasm: 5, travertine: 6, bed: 7, limestone: 8, earth: 9 } as const;
export function cavernsSurface(x: number, z: number): number {
  const f = lakeFactor(x, z);
  if (f < 1 && isletFactor(x, z) > 0.9 && sandbarDistance(x, z) > L.sandbar.half) return SURFACE.bed;
  const wob = wave(x * 1.3, z * 1.3, 17);
  for (const p of L.paths) if (pathNear(x, z, p.points).d <= p.half + 0.3 + 0.2 * wob) return SURFACE.scree;
  // the travertine round the terraces' pools (an organic apron, not a slab)
  const T = L.terraces;
  const tx = (T.x0 + T.x1) / 2;
  for (const pool of T.pools) {
    const u = (x - tx) / ((T.x1 - T.x0) / 2 + 1.0);
    const v = (z - (pool.z0 + pool.z1) / 2) / ((pool.z1 - pool.z0) / 2 + 0.9);
    if (Math.hypot(u, v) < 1 + 0.12 * wob) return SURFACE.travertine;
  }
  if (upperDistance(x, z) < -0.3) return x < -13.5 ? SURFACE.slate : SURFACE.loam;
  const wu = upperWeight(x, z);
  if (wu >= 0.06) return SURFACE.rock;
  if (overlookDistance(x, z) < -0.3) return SURFACE.limestone;
  if (overlookWeight(x, z) >= 0.06) return SURFACE.rock;
  const edge = wave(x * 0.45, z * 0.45, 21);
  if (f < L.lake.beach + 0.22 + 0.08 * wob || isletFactor(x, z) < 1.2 || sandbarDistance(x, z) < L.sandbar.half + 0.8 || z > 15.5 + 1.4 * edge || (x > 13.5 + 1.2 * edge && z > 1.5 + 1.6 * wob)) return SURFACE.sand;
  if (x > 13.5 + 1.2 * edge) return SURFACE.chasm;
  return SURFACE.earth;
}

/** The floor as the builder reads it (scripts/caverns-terrain.ts writes it to
 *  scripts/blender/data/caverns_terrain.json): the heights and surfaces of every vertex, and the mask. */
export function cavernsTerrainData() {
  const surface: number[] = [];
  for (let k = 0; k < TERRAIN_N; k++) for (let i = 0; i < TERRAIN_N; i++) surface.push(cavernsSurface(TERRAIN_X0 + i * TERRAIN_CELL, TERRAIN_X0 + k * TERRAIN_CELL));
  return {
    cell: TERRAIN_CELL,
    n: TERRAIN_N,
    x0: TERRAIN_X0,
    heights: Array.from(TERRAIN_HEIGHTS),
    surface,
    maskCell: MASK_CELL,
    maskN: MASK_N,
    mask: Array.from(CAVERNS_MASK).join(""),
    pools: TERRACES.pools,
  };
}

/** The caverns' zones (the Logbook's and the HUD's name for where you are). */
export function cavernsZoneAt(x: number, z: number): (typeof L.zones)[number] | null {
  return L.zones.find((zn) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) ?? null;
}

// --- the trails ---------------------------------------------------------------------------------------------

/** The trails: the meandering descent from the doline to the overlook, and the two down from it. */
export const CAVE_TRAILS = L.paths;
/** The doline, and its overlook half way down. */
export const DOLINE = { y: L.levels.upper };
export const OVERLOOK = { y: L.levels.overlook };

// --- the Expedition Outpost, the adit ------------------------------------------------------------------

/** The adit's tunnel back up to the Whispering Woods, and where you stand at it. */
export const CAVE_ADIT = L.adit;
export const CAVE_ADIT_FRONT: Pt = { x: L.adit.x, z: L.adit.z + 1.3 };
/** Where a traveller arrives from the woods (in the doline, facing south over the lake). */
export const CAVE_ARRIVAL: Pt = L.arrival;
/** Gus the Mole at his log workstation, and where you stand to trade with him. */
export const GUS = L.gus;
export const GUS_FRONT: Pt = { x: L.workstation.x, z: L.workstation.z + L.workstation.w / 2 + 0.7 };
export const GUS_REACH = 1.9;
/** The Thermal Bellows Forge in the north wall's basalt fissure, and the meteorite Geode Anvil on its
 *  low outcrop beside the antique tool crate. */
export const FORGE = L.forge;
export const FORGE_FRONT: Pt = { x: L.forge.x, z: L.forge.z + L.forge.d / 2 + 0.8 };
export const FORGE_REACH = 2.0;
export const ANVIL = L.anvil;
export const ANVIL_FRONT: Pt = { x: L.anvil.x, z: L.anvil.z + 1.05 };
export const ANVIL_REACH = 1.8;

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
}
export const ORE_NODES: OreNode[] = L.nodes.map((n) => {
  const face = n.face ? { x: n.face[0], z: n.face[1] } : null;
  const r = ORE_KINDS[n.kind as OreKind].radius + 0.75;
  const d = Math.hypot(n.x, n.z) || 1;
  const out = face ?? { x: (-n.x / d) * 0.6 + 0.4, z: (-n.z / d) * 0.6 + 0.4 };
  const ol = Math.hypot(out.x, out.z) || 1;
  const wall = n.x <= L.walls.west + 1.3 || n.z <= L.walls.north + 1.3;
  return { id: n.id, kind: n.kind as OreKind, x: n.x, z: n.z, y: cavernsFloorY(n.x, n.z), face, approach: { x: n.x + (out.x / ol) * r, z: n.z + (out.z / ol) * r }, wall };
});
export const ORE_NODE_AT = new Map(ORE_NODES.map((n) => [n.id, n]));
/** The prop id of a node, and the node of a prop id. */
export const orePropId = (id: string) => `ore_${id}`;
export const oreNodeOf = (propId: string) => (propId.startsWith("ore_") ? ORE_NODE_AT.get(propId.slice(4)) : undefined);
/** How near a node you mine it from (the Monolith is bigger). */
export function oreReach(node: OreNode): number {
  return ORE_KINDS[node.kind].radius + 1.7;
}
/** The node within reach of (x, z), the nearest (null: none). */
export function oreNodeNear(x: number, z: number): OreNode | null {
  let best: OreNode | null = null;
  let d = Infinity;
  for (const n of ORE_NODES) {
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
  if (n.wall || n.kind === "monolith" || !n.face) return null;
  const fl = Math.hypot(n.face.x, n.face.z) || 1;
  const r = ORE_KINDS[n.kind].radius;
  return { x: n.x - (n.face.x / fl) * (r + 0.45), z: n.z - (n.face.z / fl) * (r + 0.45), r: r + 0.35 };
}
export const MONOLITH = ORE_NODE_AT.get("monolith")!;

// --- the Travertine Thermal Terraces ---------------------------------------------------------------------

/** The terraces' three rimstone pools down the west slope (their water's height: each pool's south
 *  rim's), and their six seats in the warm water, each with its dry landing on the walk beside it
 *  (where you are set down getting out, or dropping out of the game). */
export const TERRACES = {
  x0: L.terraces.x0,
  x1: L.terraces.x1,
  pools: L.terraces.pools.map((p) => ({ z0: p.z0, z1: p.z1, y: Math.round((lowLevel((L.terraces.x0 + L.terraces.x1) / 2, p.z1) - 0.06) * 1000) / 1000 })),
};
export const THERMAL_SEATS = L.thermalSeats.map((s) => ({ propId: s.id, x: s.x, z: s.z, rotationY: s.face, approachX: s.exit.x, approachZ: s.exit.z, exit: s.exit }));
export const THERMAL_SEAT_IDS: ReadonlySet<string> = new Set(THERMAL_SEATS.map((s) => s.propId));
/** The water's height in the pool a seat sits in. */
export function thermalPoolY(z: number): number {
  return (TERRACES.pools.find((p) => z >= p.z0 - 0.1 && z <= p.z1 + 0.1) ?? TERRACES.pools[TERRACES.pools.length - 1]).y;
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

// --- the Abyssal Cenote Lake -------------------------------------------------------------------------------

export const CAVE_LAKE = L.lake;
export const CAVE_ISLET = L.islet;
/** The water's height (the float's, the drip's ripple). */
export const CAVE_WATER_Y = L.lake.water;
/** Finnegan the Grotto Angler on his driftwood log on the north shore (facing the lake: `yaw`), and
 *  where you stand to trade with him. */
export const FINNEGAN = L.finnegan;
export const FINNEGAN_FRONT: Pt = { x: L.finnegan.x + Math.sin(L.finnegan.yaw) * 1.05, z: L.finnegan.z + Math.cos(L.finnegan.yaw) * 1.05 };
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
    if (lakeFactor(px, pz) <= 0.985 && L.lake.water - cavernsFloorY(px, pz) >= CAST_DEPTH) return { x: Math.round(px * 100) / 100, z: Math.round(pz * 100) / 100 };
  }
  return null;
}
export function shoreCast(x: number, z: number, fx: number, fz: number): { x: number; z: number } | null {
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-6) return null;
  const f = { x: fx / fl, z: fz / fl };
  const w = nearestWater(x, z);
  if (!w || f.x * w.x + f.z * w.z <= SHORE_FACING) return null;
  return castAlong(x, z, f) ?? castAlong(x, z, w);
}

/** The three lights that move (the forge's mouth, the terraces' steam, the cenote's heart), the
 *  doline's sunbeams and the islet's skylight. */
export const CAVE_LIGHTS = L.lights;
export const DOLINE_BEAMS = L.beams;
export const CAVE_SKYLIGHT = L.skylight;
/** The camera's bounds while you are down here: its look-at point is kept inside them (the shell
 *  round it: no void to see past). */
export const CAVERNS_CAMERA = { x0: -21, x1: 21, z0: -21, z1: 21 };

export const CAVERNS_PROPS: PropSpec[] = ([
  { propId: "cave_adit", x: L.adit.x, z: L.adit.z + 0.4, kind: "adit", color: "#8a6a3f", defaultOn: true, approachX: CAVE_ADIT_FRONT.x, approachZ: CAVE_ADIT_FRONT.z },
  { propId: "gus", x: L.gus.x, z: L.gus.z, kind: "prospector", color: "#6b5a4a", defaultOn: true, approachX: GUS_FRONT.x, approachZ: GUS_FRONT.z },
  { propId: "ancient_forge", x: L.forge.x, z: L.forge.z, kind: "forge", color: "#ff7a2f", defaultOn: true, approachX: FORGE_FRONT.x, approachZ: FORGE_FRONT.z },
  { propId: "geode_anvil", x: L.anvil.x, z: L.anvil.z, kind: "anvil", color: "#8a8f9a", defaultOn: true, approachX: ANVIL_FRONT.x, approachZ: ANVIL_FRONT.z },
  { propId: "finnegan", x: L.finnegan.x, z: L.finnegan.z, kind: "angler", color: "#e8a6b8", defaultOn: true, approachX: FINNEGAN_FRONT.x, approachZ: FINNEGAN_FRONT.z },
  ...ORE_NODES.map((n): PropSpec => ({ propId: orePropId(n.id), x: n.x, z: n.z, kind: "ore", color: ORE_KINDS[n.kind].glow, defaultOn: true, approachX: n.approach.x, approachZ: n.approach.z })),
] satisfies PropSpec[]).map((p) => ({ ...p, y: cavernsFloorY(p.x, p.z) }));

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
const box = (x0: number, x1: number, z0: number, z1: number): AABB => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });

const MONO = ORE_NODE_AT.get("monolith")!;
const MONO_R = ORE_KINDS.monolith.radius * 0.8;
const FN = L.finnegan;
/** What you walk round besides the ground's own mask (cavernsBlocked: the slopes, the walls, the
 *  water, the pools, the rocks): the outpost, the adit's timbers, the nodes and their host rocks, the
 *  islet's karst tower, Finnegan and his log. */
export const CAVERNS_OBSTACLES: AABB[] = [
  box(L.workstation.x - L.workstation.len / 2, L.workstation.x + L.workstation.len / 2, L.gus.z - 0.4, L.workstation.z + L.workstation.w / 2),
  box(L.forge.x - L.forge.w / 2 - 0.1, L.forge.x + L.forge.w / 2 + 0.1, L.walls.north, L.forge.z + L.forge.d / 2 + 0.1),
  around(L.anvil, 0.55),
  box(L.crate.x - L.crate.w / 2, L.crate.x + L.crate.w / 2, L.crate.z - L.crate.d / 2, L.crate.z + L.crate.d / 2),
  around({ x: L.adit.x - L.adit.w / 2 - 0.14, z: L.adit.z + 0.25 }, 0.24),
  around({ x: L.adit.x + L.adit.w / 2 + 0.14, z: L.adit.z + 0.25 }, 0.24),
  ...ORE_NODES.filter((n) => n.kind !== "monolith").map((n) => around(n, ORE_KINDS[n.kind].radius * 0.95)),
  // (the Monolith rounder: a cross of two boxes, so the walk round it on the islet stays open)
  box(MONO.x - MONO_R, MONO.x + MONO_R, MONO.z - MONO_R * 0.62, MONO.z + MONO_R * 0.62),
  box(MONO.x - MONO_R * 0.62, MONO.x + MONO_R * 0.62, MONO.z - MONO_R, MONO.z + MONO_R),
  ...ORE_NODES.flatMap((n) => {
    const b = nodeBackRock(n);
    return b ? [around(b, b.r * 0.85)] : [];
  }),
  around(L.tower, L.tower.r),
  // Finnegan on his log (the log lies across him, east-west)
  box(FN.x - FN.log / 2, FN.x + FN.log / 2, FN.z - 0.35, FN.z + 0.35),
];
export const CAVERNS_SPAWNS: Pt[] = L.spawns;
