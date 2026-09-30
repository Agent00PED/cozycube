import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";
import { ORE_KINDS, type OreKind } from "../caverns_mining";

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
  "walls": { "north": -22.5, "west": -22.5, "height": 11.0, "margin": 0.75 },
  "low": 0.4,
  "zones": [
    { "id": "basecamp", "name": "The Expedition Basecamp", "x0": -9.0, "x1": 9.0, "z0": -22.5, "z1": -12.25 },
    { "id": "jungle", "name": "The Doline Jungle", "x0": -22.5, "x1": -9.0, "z0": -22.5, "z1": -12.25 },
    { "id": "breakdown", "name": "The Coal Breakdown", "x0": 9.0, "x1": 22.5, "z0": -22.5, "z1": -12.25 },
    { "id": "overlook", "name": "The Hound's Overlook", "x0": -8.5, "x1": 11.0, "z0": -12.25, "z1": -3.0 },
    { "id": "mudflats", "name": "The Iron Mudflats", "x0": -22.5, "x1": -6.5, "z0": -12.25, "z1": 1.5 },
    { "id": "rift", "name": "The Glimmer Rift", "x0": 11.0, "x1": 22.5, "z0": -12.25, "z1": 5.5 },
    { "id": "terraces", "name": "The Pearl Terraces", "x0": -22.5, "x1": -5.5, "z0": 1.5, "z1": 22.5 },
    { "id": "lake", "name": "The Great Lake", "x0": -22.5, "x1": 22.5, "z0": -12.25, "z1": 22.5 }
  ],
  "shelf": { "h": 6.0, "west": 0.5, "east": -0.5, "edge": -12.25, "cliff": 0.45 },
  "levels": [
    { "id": "rift", "h": 1.0, "cliff": 1.7, "wob": 0.3, "poly": [[8.0, -16.0], [23.5, -16.0], [23.5, 5.5], [11.0, 5.5], [11.0, -3.0], [8.0, -3.0]] },
    { "id": "terraceC", "h": 1.2, "cliff": 0.32, "wob": 0.35, "poly": [[-23.5, 3.0], [-5.5, 3.0], [-5.5, 15.2], [-23.5, 15.2]] },
    { "id": "terraceB", "h": 2.4, "cliff": 0.32, "wob": 0.35, "poly": [[-23.5, 2.0], [-5.5, 2.0], [-5.5, 10.6], [-23.5, 10.6]] },
    { "id": "terraceA", "h": 3.6, "cliff": 0.32, "wob": 0.35, "poly": [[-23.5, 0.5], [-5.5, 0.5], [-5.5, 6.2], [-23.5, 6.2]] },
    { "id": "overlook", "h": 3.0, "cliff": 0.42, "wob": 0.3, "poly": [[-9.0, -13.0], [11.0, -13.0], [11.0, -3.0], [-9.0, -3.0]] },
    { "id": "mudflats", "h": 4.5, "cliff": 0.42, "wob": 0.3, "poly": [[-23.5, -13.0], [-8.5, -13.0], [-8.5, -3.2], [-6.5, -3.2], [-6.5, 1.5], [-23.5, 1.5]] }
  ],
  "paths": [
    { "id": "ropeDescent", "half": 1.1, "points": [[-9.5, -13.7, 6.01], [-14.0, -10.5, 4.5]] },
    { "id": "switchback", "half": 1.2, "points": [[-3.0, -14.0, 6.0], [8.0, -10.4, 3.0]] },
    { "id": "riftRamp", "half": 1.1, "points": [[8.6, -8.0, 3.0], [16.0, -5.6, 1.0]] },
    { "id": "lakeRamp", "half": 1.1, "points": [[9.0, -5.0, 3.0], [1.2, 0.4, 0.3]] },
    { "id": "pearlTrail", "half": 1.1, "points": [[-10.8, -1.0, 4.5], [-8.7, 4.5, 3.3], [-8.1, 9.5, 2.05], [-7.6, 15.2, 0.55], [-7.3, 16.6, 0.4]] }
  ],
  "river": {
    "half": 0.55,
    "depth": 0.28,
    "segments": [
      [[-16.8, -19.4], [-16.5, -17.0], [-16.3, -14.2], [-16.4, -11.5], [-16.6, -8.0], [-16.7, -4.0], [-16.8, -0.5], [-16.8, 2.2]],
      [[-13.3, 14.2], [-10.0, 14.1], [-8.0, 13.95], [-6.6, 13.7], [-5.0, 13.4], [-3.2, 13.2]],
      [[17.4, 11.3], [19.2, 12.0], [20.6, 12.5], [23.2, 12.9]]
    ],
    "fords": [[-16.35, -15.6, 1.2], [-16.7, -5.5, 1.2], [-8.0, 13.95, 1.3], [20.6, 12.5, 1.3]],
    "plunge": { "x": -16.8, "z": -19.9, "r": 1.3, "fall": [-16.9, -22.3] }
  },
  "lake": { "x": 6.5, "z": 10.0, "rx": 11.0, "rz": 8.0, "water": 0.0, "depth": 1.5, "shelfDepth": 0.45, "beach": 1.35, "wade": 1.0 },
  "islet": { "x": 7.5, "z": 11.0, "r": 3.2, "top": 0.35 },
  "causeway": { "points": [[5.2, 0.4], [6.0, 4.5], [7.0, 8.4]], "half": 0.75, "y": 0.08 },
  "skylight": { "x": 7.5, "z": 11.0, "r": 3.2 },
  "tower": { "x": -3.5, "z": -7.6, "r": 1.1, "h": 9.0 },
  "terraces": {
    "x0": -21.0, "x1": -13.0,
    "pools": [{ "z0": 1.9, "z1": 5.6, "y": 3.48 }, { "z0": 6.9, "z1": 10.0, "y": 2.28 }, { "z0": 11.2, "z1": 14.6, "y": 1.08 }]
  },
  "thermalSeats": [
    { "id": "thermal_1", "x": -13.6, "z": 2.9, "face": 1.5708, "exit": { "x": -11.4, "z": 2.9 } },
    { "id": "thermal_2", "x": -13.6, "z": 4.6, "face": 1.5708, "exit": { "x": -11.4, "z": 4.6 } },
    { "id": "thermal_3", "x": -13.6, "z": 7.6, "face": 1.5708, "exit": { "x": -11.4, "z": 7.6 } },
    { "id": "thermal_4", "x": -13.6, "z": 9.2, "face": 1.5708, "exit": { "x": -11.4, "z": 9.2 } },
    { "id": "thermal_5", "x": -13.6, "z": 11.7, "face": 1.5708, "exit": { "x": -11.4, "z": 11.7 } },
    { "id": "thermal_6", "x": -13.6, "z": 12.6, "face": 1.5708, "exit": { "x": -11.4, "z": 12.6 } },
    { "id": "thermal_7", "x": -14.3, "z": 8.4, "face": 1.5708, "exit": { "x": -12.0, "z": 8.4 } }
  ],
  "capybara": { "x": -18.0, "z": 3.8, "yaw": 1.4 },
  "adit": { "x": 0.0, "z": -22.1, "w": 2.0, "h": 2.6 },
  "arrival": { "x": 0.0, "z": -19.5 },
  "gus": { "x": -4.7, "z": -16.6, "yaw": 0 },
  "workstation": { "x": -4.7, "z": -15.6, "len": 2.4, "w": 0.75, "top": 0.78 },
  "camp": { "posts": [[-6.5, -15.1], [-2.9, -15.1], [-6.5, -18.3], [-2.9, -18.3]], "ridge": 2.7, "eave": 1.85, "crates": [-5.75, -17.75], "transit": [-3.65, -17.85] },
  "forge": { "x": 6.8, "z": -21.3, "w": 3.0, "d": 1.8, "h": 3.2 },
  "anvil": { "x": 3.7, "z": -19.9, "outcrop": 0.62 },
  "crate": { "x": 4.65, "z": -20.75, "w": 0.9, "d": 0.6, "h": 0.55 },
  "winch": { "x": 13.2, "top": -13.4, "bottom": -11.5, "upper": -14.6, "lower": -10.6 },
  "finnegan": { "x": -1.8, "z": 0.3, "yaw": 0.25, "log": 1.5 },
  "nodes": [
    { "id": "copper_1", "kind": "copper", "x": -11.8, "z": -21.35, "face": [0, 1] },
    { "id": "copper_2", "kind": "copper", "x": -13.4, "z": -17.4, "face": [0.6, 0.8] },
    { "id": "copper_3", "kind": "copper", "x": -10.6, "z": -16.2, "face": [0.2, 1] },
    { "id": "copper_4", "kind": "copper", "x": -21.35, "z": -18.0, "face": [1, 0] },
    { "id": "copper_5", "kind": "copper", "x": -19.4, "z": -14.5, "face": [0.6, 0.8] },
    { "id": "coal_1", "kind": "coal", "x": 11.8, "z": -21.35, "face": [0, 1] },
    { "id": "coal_2", "kind": "coal", "x": 15.6, "z": -21.35, "face": [0, 1] },
    { "id": "coal_3", "kind": "coal", "x": 12.6, "z": -17.2, "face": [-0.5, 0.87] },
    { "id": "coal_4", "kind": "coal", "x": 17.8, "z": -18.2, "face": [0, 1] },
    { "id": "coal_5", "kind": "coal", "x": 19.8, "z": -15.0, "face": [-0.6, 0.8] },
    { "id": "iron_1", "kind": "iron", "x": -21.35, "z": -9.0, "face": [1, 0] },
    { "id": "iron_2", "kind": "iron", "x": -21.35, "z": -4.2, "face": [1, 0.1] },
    { "id": "iron_3", "kind": "iron", "x": -19.4, "z": -0.6, "face": [0.6, 0.8] },
    { "id": "iron_4", "kind": "iron", "x": -12.4, "z": -8.9, "face": [-0.3, 0.95] },
    { "id": "iron_5", "kind": "iron", "x": -10.9, "z": -5.6, "face": [-0.7, 0.7] },
    { "id": "iron_6", "kind": "iron", "x": -13.3, "z": -2.3, "face": [0.3, 0.95] },
    { "id": "silver_1", "kind": "silver", "x": -6.8, "z": 3.4, "face": [-1, 0] },
    { "id": "silver_2", "kind": "silver", "x": -7.9, "z": 8.0, "face": [-1, 0] },
    { "id": "silver_3", "kind": "silver", "x": -6.8, "z": 12.2, "face": [-1, 0] },
    { "id": "silver_4", "kind": "silver", "x": -12.4, "z": 17.8, "face": [1, 0] },
    { "id": "silver_5", "kind": "silver", "x": -7.8, "z": 20.3, "face": [0, -1] },
    { "id": "glimmer_1", "kind": "glimmer", "x": 16.0, "z": -11.35, "face": [0, 1] },
    { "id": "glimmer_2", "kind": "glimmer", "x": 19.6, "z": -11.35, "face": [0, 1] },
    { "id": "glimmer_3", "kind": "glimmer", "x": 21.3, "z": -7.2, "face": [-1, 0.2] },
    { "id": "glimmer_4", "kind": "glimmer", "x": 17.4, "z": -2.4, "face": [-0.4, 0.92] },
    { "id": "monolith", "kind": "monolith", "x": 7.6, "z": 11.2, "face": [-0.3, -0.95] }
  ],
  "boulders": [[14.8, -14.4, 0.8], [18.6, -20.4, 0.7], [21.0, -18.6, 0.6], [-14.6, -21.0, 0.7], [-10.4, -18.8, 0.55]],
  "crystals": [[14.4, -11.8, 1.0], [17.8, -11.9, 1.1], [20.6, -11.2, 0.9], [20.4, -4.2, 0.8], [15.0, -5.4, 0.7]],
  "shrooms": [[15.2, -9.8, 0.8], [20.9, -1.6, 0.7], [13.6, -3.6, 0.6], [18.8, 2.2, 0.7]],
  "fractures": [[14.0, -12.2, 0], [17.6, -12.2, 0], [20.4, -12.2, 0]],
  "beams": [[-13.0, -18.6, 1.8], [-19.4, -15.4, 1.3], [-11.2, -13.8, 1.2], [-15.2, -13.6, 1.0], [-20.2, -20.4, 1.1]],
  "sun": { "from": [-10.0, 21.0, -14.0], "at": [-15.0, 6.5, -17.0] },
  "lights": { "forge": [6.8, 0.85, -20.1], "thermal": [-16.5, 1.2, 8.0], "cenote": [7.5, 1.4, 11.0] },
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

/** A pool's signed distance (negative inside): its rectangle with rounded corners. */
function poolDistance(x: number, z: number, p: { z0: number; z1: number }): number {
  const T = L.terraces;
  const r = 0.9;
  const cx = (T.x0 + T.x1) / 2;
  const cz = (p.z0 + p.z1) / 2;
  const hx = (T.x1 - T.x0) / 2 - r;
  const hz = (p.z1 - p.z0) / 2 - r;
  const qx = Math.abs(x - cx) - hx;
  const qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
/** The pool (x, z) lies in, or -1. */
function poolAt(x: number, z: number, pad = 0): number {
  return L.terraces.pools.findIndex((p) => poolDistance(x, z, p) < pad);
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
  return 1 - smoothstep(-lv.cliff, lv.cliff, levelDistance(lv, x, z));
}
/** The north shelf's rim (negative on it): its south edge, wobbling. */
function shelfDistance(x: number, z: number): number {
  return z - (L.shelf.edge + 0.35 * wave(x * 0.7, 0.3, 21) + 0.12 * wave(x * 2.1, 1.7, 23));
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
    if (w > 0) h = mix(h, lv.h + 0.05 * wave(x * 0.7, z * 0.7, (LEVEL_SEED[lv.id] ?? 1) + 2), w);
  }
  const ws = shelfWeight(x, z);
  if (ws > 0) h = mix(h, shelfLevel(x, z), ws);
  // the trails, carved (and banked) across the cliffs, their shoulders soft
  for (const p of L.paths) {
    const n = pathHeight(x, z, p);
    if (n.w > 0) h = mix(h, n.h, n.w);
  }
  // the terraces' warm pools, sunk into their steps
  for (const p of L.terraces.pools) {
    const d = poolDistance(x, z, p);
    if (d < 0.3) h = mix(h, p.y - 0.55, 1 - smoothstep(-0.3, 0.3, d));
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
  if (pd < 0.6) h -= 0.55 * (1 - smoothstep(-0.3, 0.6, pd));
  return h;
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
/** Every natural rock you walk round, as discs. The small things (crystals, mushrooms, ferns) are
 *  walked through. */
const ROCK_DISCS: { x: number; z: number; r: number }[] = L.boulders.map(([x, z, r]) => ({ x, z, r: r * SLIM }));

/** How steep the floor is at (x, z), in degrees (its fall over half a metre across, both ways at once). */
export function trailSlope(x: number, z: number): number {
  const e = 0.25;
  const gx = (cavernsFloorY(x + e, z) - cavernsFloorY(x - e, z)) / (2 * e);
  const gz = (cavernsFloorY(x, z + e) - cavernsFloorY(x, z - e)) / (2 * e);
  return (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
}

/** The steepest ground anyone walks on (degrees): nowhere a step, nowhere a scramble. */
export const STEEPEST_WALK = 20;
const STEEP = Math.tan((STEEPEST_WALK * Math.PI) / 180);
/** Whether the floor at (x, z) climbs or drops more steeply than STEEPEST_WALK toward any of its
 *  neighbours a mask cell away (a cliff, a trail's shoulder, the causeway's flank). */
function tooSteep(x: number, z: number): boolean {
  const s = 0.25;
  const h = cavernsFloorY(x, z);
  return Math.max(Math.abs(cavernsFloorY(x + s, z) - h), Math.abs(cavernsFloorY(x - s, z) - h), Math.abs(cavernsFloorY(x, z + s) - h), Math.abs(cavernsFloorY(x, z - s) - h)) > STEEP * s;
}
/** Whether (x, z) is in the stream (its fords aside) or its plunge pool. */
function inStream(x: number, z: number): boolean {
  if (plungeDistance(x, z) < 0.2) return true;
  return riverDistance(x, z) <= L.river.half + 0.15 && fordAt(x, z) < 0.5;
}

/** Whether an avatar may stand at (x, z) (its centre): clear of the walls, the water, the pools, the
 *  stream and the rocks, and never on ground steeper than STEEPEST_WALK (every cliff between two
 *  levels is; every trail across one is not). */
export function cavernsWalkable(x: number, z: number): boolean {
  const m = L.walls.margin;
  if (x < L.walls.west + m || z < L.walls.north + m || x > L.half - 0.6 || z > L.half - 0.6) return false;
  if (inLakeWater(x, z)) return false;
  if (poolAt(x, z, 0.3) >= 0) return false;
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

/** What each floor vertex is (the builder paints it so): each zone's ground, the trails, the stream's
 *  and the pools' beds, the lake's bed and its bank. */
export const SURFACE = { basecamp: 0, jungle: 1, breakdown: 2, mudflats: 3, overlook: 4, travertine: 5, rift: 6, shore: 7, bed: 8, trail: 9, stream: 10, pool: 11 } as const;
/** The level whose ground (x, z) is (the top-most one holding it), or "low". */
function levelOf(x: number, z: number): string {
  if (shelfWeight(x, z) >= 0.5) return "shelf";
  for (let i = L.levels.length - 1; i >= 0; i--) if (levelWeight(L.levels[i], x, z) >= 0.5) return L.levels[i].id;
  return "low";
}
export function cavernsSurface(x: number, z: number): number {
  if (poolAt(x, z) >= 0) return SURFACE.pool;
  if (plungeDistance(x, z) < 0.1 || riverDistance(x, z) <= L.river.half) return SURFACE.stream;
  const f = lakeFactor(x, z);
  if (f < 1 && isletFactor(x, z) > 0.9 && !onCauseway(x, z)) return SURFACE.bed;
  for (const p of L.paths) if (polylineNear(x, z, p.points).d <= p.half + 0.15 * wave(x * 1.3, z * 1.3, 29)) return SURFACE.trail;
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
/** Gus the Mole at his log workstation, and where you stand to trade with him. */
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

/** The winch lift between the coal breakdown's edge and the glimmer rift under it: where its frame
 *  stands at each end, and where you stand to ride it (and are set down). */
export const CAVE_WINCH = {
  top: { x: L.winch.x, z: L.winch.top },
  bottom: { x: L.winch.x, z: L.winch.bottom },
  upper: { x: L.winch.x, z: L.winch.upper } as Pt,
  lower: { x: L.winch.x, z: L.winch.lower } as Pt,
};
/** How long the ride takes (s): the client's rope creaks that long. */
export const WINCH_RIDE_S = 2.5;
export const WINCH_REACH = 1.8;

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

// --- the Pearl Terraces' warm pools ----------------------------------------------------------------------

/** The terraces' three rimstone pools, one on each step (their water's height the layout's), and their
 *  seven seats in the warm water, each with its dry landing on the step's rim beside it (where you are
 *  set down getting out, or dropping out of the game). */
export const TERRACES = {
  x0: L.terraces.x0,
  x1: L.terraces.x1,
  pools: L.terraces.pools.map((p) => ({ z0: p.z0, z1: p.z1, y: p.y })),
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

// --- the Great Lake -----------------------------------------------------------------------------------

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

/** The three lights that move (the forge's mouth, the warm pools, the lake's heart), each its height
 *  over what it stands on; the jungle's sunbeams, the islet's skylight and the sun over the collapse. */
export const CAVE_LIGHTS = {
  forge: [L.lights.forge[0], cavernsFloorY(L.lights.forge[0], L.lights.forge[2]) + L.lights.forge[1], L.lights.forge[2]],
  thermal: [L.lights.thermal[0], thermalPoolY(L.lights.thermal[2]) + L.lights.thermal[1], L.lights.thermal[2]],
  cenote: [L.lights.cenote[0], L.lake.water + L.lights.cenote[1], L.lights.cenote[2]],
} as const;
export const DOLINE_BEAMS = L.beams;
export const CAVE_SKYLIGHT = L.skylight;
export const CAVE_SUN = L.sun;
/** The Hound's Hand, the giant stalagmite on the overlook (a landmark: dithered as it stands between
 *  you and the camera). */
export const HOUNDS_HAND = L.tower;
/** The camera's bounds while you are down here: its look-at point is kept inside them (the shell
 *  round it: no void to see past). */
export const CAVERNS_CAMERA = { x0: -21, x1: 21, z0: -21, z1: 21 };

export const CAVERNS_PROPS: PropSpec[] = ([
  { propId: "cave_adit", x: L.adit.x, z: L.adit.z + 0.4, kind: "adit", color: "#8a6a3f", defaultOn: true, approachX: CAVE_ADIT_FRONT.x, approachZ: CAVE_ADIT_FRONT.z },
  { propId: "gus", x: L.gus.x, z: L.gus.z, kind: "prospector", color: "#6b5a4a", defaultOn: true, approachX: GUS_FRONT.x, approachZ: GUS_FRONT.z },
  { propId: "ancient_forge", x: L.forge.x, z: L.forge.z, kind: "forge", color: "#ff7a2f", defaultOn: true, approachX: FORGE_FRONT.x, approachZ: FORGE_FRONT.z },
  { propId: "geode_anvil", x: L.anvil.x, z: L.anvil.z, kind: "anvil", color: "#8a8f9a", defaultOn: true, approachX: ANVIL_FRONT.x, approachZ: ANVIL_FRONT.z },
  { propId: "finnegan", x: L.finnegan.x, z: L.finnegan.z, kind: "angler", color: "#e8a6b8", defaultOn: true, approachX: FINNEGAN_FRONT.x, approachZ: FINNEGAN_FRONT.z },
  { propId: "winch_top", x: CAVE_WINCH.top.x, z: CAVE_WINCH.top.z, kind: "winch", color: "#8a6a3f", defaultOn: true, approachX: CAVE_WINCH.upper.x, approachZ: CAVE_WINCH.upper.z },
  { propId: "winch_bottom", x: CAVE_WINCH.bottom.x, z: CAVE_WINCH.bottom.z, kind: "winch", color: "#8a6a3f", defaultOn: true, approachX: CAVE_WINCH.lower.x, approachZ: CAVE_WINCH.lower.z },
  ...ORE_NODES.map((n): PropSpec => ({ propId: orePropId(n.id), x: n.x, z: n.z, kind: "ore", color: ORE_KINDS[n.kind].glow, defaultOn: true, approachX: n.approach.x, approachZ: n.approach.z })),
] satisfies PropSpec[]).map((p) => ({ ...p, y: cavernsFloorY(p.x, p.z) }));

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
const box = (x0: number, x1: number, z0: number, z1: number): AABB => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });

const MONO = ORE_NODE_AT.get("monolith")!;
const MONO_R = ORE_KINDS.monolith.radius * 0.8;
const FN = L.finnegan;
/** What you walk round besides the ground's own mask (cavernsBlocked: the cliffs, the walls, the
 *  water, the pools, the stream, the rocks): the basecamp, the adit's timbers, the winch's frame, the
 *  nodes and their host rocks, the Hound's Hand, Finnegan and his log. */
export const CAVERNS_OBSTACLES: AABB[] = [
  box(L.workstation.x - L.workstation.len / 2, L.workstation.x + L.workstation.len / 2, L.gus.z - 0.4, L.workstation.z + L.workstation.w / 2),
  // (the forge: its hearth and chamber, a little over half its width; the mould and the trough at
  // its flanks walked past)
  box(L.forge.x - L.forge.w * 0.31, L.forge.x + L.forge.w * 0.31, L.walls.north, L.forge.z + L.forge.d * 0.3),
  around(L.anvil, 0.32),
  // Gus's expedition camp: the tarp's four timber posts, the crate stack (the survey transit, a
  // standing tripod, is walked past)
  ...L.camp.posts.map(([x, z]) => around({ x, z }, 0.08)),
  box(L.camp.crates[0] - 0.3, L.camp.crates[0] + 0.3, L.camp.crates[1] - 0.22, L.camp.crates[1] + 0.22),
  box(L.crate.x - L.crate.w * 0.3, L.crate.x + L.crate.w * 0.3, L.crate.z - L.crate.d * 0.3, L.crate.z + L.crate.d * 0.3),
  around({ x: L.adit.x - L.adit.w / 2 - 0.14, z: L.adit.z + 0.25 }, 0.14),
  around({ x: L.adit.x + L.adit.w / 2 + 0.14, z: L.adit.z + 0.25 }, 0.14),
  // the winch's gantry at the breakdown's edge (its two legs)
  around({ x: L.winch.x - 0.7, z: L.winch.top }, 0.12),
  around({ x: L.winch.x + 0.7, z: L.winch.top }, 0.12),
  ...ORE_NODES.filter((n) => n.kind !== "monolith").map((n) => around(n, ORE_KINDS[n.kind].radius * 0.6)),
  // (the Monolith rounder: a cross of two boxes, so the walk round it on the islet stays open)
  box(MONO.x - MONO_R, MONO.x + MONO_R, MONO.z - MONO_R * 0.62, MONO.z + MONO_R * 0.62),
  box(MONO.x - MONO_R * 0.62, MONO.x + MONO_R * 0.62, MONO.z - MONO_R, MONO.z + MONO_R),
  ...ORE_NODES.flatMap((n) => {
    const b = nodeBackRock(n);
    return b ? [around(b, b.r * 0.5)] : [];
  }),
  around(L.tower, L.tower.r * 0.62),
  // Finnegan on his log (the log lies across him, east-west)
  box(FN.x - FN.log / 2, FN.x + FN.log / 2, FN.z - 0.35, FN.z + 0.35),
];
export const CAVERNS_SPAWNS: Pt[] = L.spawns;
