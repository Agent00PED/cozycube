import type { AABB } from "../collision";
import { CUSHIONS, napPose } from "../seats";
import type { SeatStyle } from "../types";
import type { PropSpec, SeatSpec } from "./lounge";

// The Starlight Campfire: a floating island of midnight forest soil and moss, a bonfire ringed by
// four fallen-log benches (two seats each) in the middle, a river winding down the east side with
// a wide boardwalk dock out over it (three fishing spots side by side), a canvas tipi on the
// north-west, a hammock slung between two pines on the open west side, a woodpile on the north,
// pines along the back edges and a rustic fence along the front. Authored ONCE, here:
//
//   CAMPFIRE_LAYOUT   where everything is (plain JSON between the markers: scripts/blender/
//                     build_campfire.py reads the very same text to build campfire.glb, so the
//                     model and the walkable floor can never disagree)
//   riverSpan         the river's banks at any z, from its spline (build_campfire.py has the same
//                     function, line for line)
//   CAMP_SEATS        the logs (sit, facing the fire), the hammock and the tent (lie, eyes shut)
//   CAMP_PROPS        the bonfire (roast and grill) and the dock's three fishing spots
//   CAMP_OBSTACLES    what you walk round; CAMP_SPAWNS  where you arrive (the path facing the fire)
//
// Coordinates are the game's: x right, z toward the camera's side, heights in y; the island is
// 2 * half across, its top at y = 0. The camera looks from +x +z, so the tall things (pines, the
// tipi) stand along the back edges (-x, -z) and only low ones (a fence, rocks) along the front.

export const CAMPFIRE_LAYOUT = /* layout:begin */ {
  "half": 10.8,
  "fire": { "x": 0, "z": 0, "ring": 0.62, "collider": 0.45 },
  "clearing": { "x": 0, "z": 0, "r": 4.4 },
  "firepit": {
    "r": 3.0,
    "pieces": [
      { "id": "Long", "kind": "log", "angle": 288, "r": 3.05, "len": 2.9, "seats": ["L1", "L2", "L3"] },
      { "id": "Medium", "kind": "log", "angle": 40, "r": 2.8, "len": 1.9, "seats": ["M1", "M2"] },
      { "id": "Curved", "kind": "curved", "angle": 158, "r": 3.15, "arc": 38, "seats": ["C1", "C2"] },
      { "id": "Stump", "kind": "stump", "angle": 116, "r": 2.7, "seats": ["01"] },
      { "id": "Boulder", "kind": "boulder", "angle": 197, "r": 2.95, "seats": ["01"] }
    ]
  },
  "tripod": { "legs": 0.9, "apex": 1.95, "potY": 1.0, "potR": 0.27 },
  "barnaby": { "x": 4.7, "z": -2.6, "yaw": -0.35 },
  "buster": { "x": -1.35, "z": -6.35, "yaw": 0.25 },
  "picnicPlates": [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
  "river": {
    "points": [[-8.6, 7.2, 1.0], [-6.4, 7.9, 1.3], [-4.2, 8.2, 1.5], [-2.0, 7.9, 1.6], [0.2, 7.7, 1.65], [2.4, 7.9, 1.5], [4.6, 8.4, 1.3], [6.8, 8.1, 1.0]],
    "depth": 0.5,
    "water": -0.18
  },
  "dock": { "x0": 5.2, "x1": 7.3, "z0": -1.9, "z1": 1.9, "deck": 0.03 },
  "fishing": [
    { "stand": { "x": 6.85, "z": -1.25 }, "bobber": { "x": 8.2, "z": -1.25 } },
    { "stand": { "x": 6.85, "z": 0.0 }, "bobber": { "x": 8.25, "z": 0.0 } },
    { "stand": { "x": 6.85, "z": 1.25 }, "bobber": { "x": 8.2, "z": 1.25 } }
  ],
  "lanterns": [{ "x": 7.12, "z": -1.72 }, { "x": 7.12, "z": 1.72 }],
  "tent": { "x": -6.3, "z": -5.0, "r": 1.35, "h": 3.0, "opening": 70 },
  "tent2": { "x": -7.8, "z": -2.35, "len": 1.9, "w": 1.55, "h": 1.25 },
  "hammock": { "a": { "x": -9.0, "z": 7.0 }, "b": { "x": -6.5, "z": 4.5 }, "top": 1.25 },
  "woodpile": { "x": 1.0, "z": -7.0 },
  "trees": [
    { "x": -9.2, "z": -9.5, "s": 1.1 },
    { "x": -5.9, "z": -9.6, "s": 0.9 },
    { "x": -3.5, "z": -9.6, "s": 1.15 },
    { "x": -0.3, "z": -9.7, "s": 0.85 },
    { "x": 1.3, "z": -10.0, "s": 0.95 },
    { "x": 9.5, "z": -9.4, "s": 0.9 },
    { "x": -9.6, "z": -6.5, "s": 1.0 },
    { "x": -10.0, "z": -4.0, "s": 0.85 },
    { "x": -9.5, "z": -1.8, "s": 1.15 },
    { "x": -9.6, "z": 0.9, "s": 0.9 },
    { "x": 5.0, "z": 8.4, "s": 0.6 },
    { "x": 4.6, "z": 5.6, "s": 0.55 },
    { "x": -6.8, "z": 9.2, "s": 0.55 }
  ],
  "rocks": [
    { "x": 6.1, "z": -5.2, "s": 0.7 },
    { "x": 6.0, "z": 3.4, "s": 0.8 },
    { "x": 10.0, "z": -1.2, "s": 0.55 },
    { "x": 9.95, "z": 2.6, "s": 0.5 },
    { "x": 9.8, "z": -7.6, "s": 0.6 },
    { "x": -4.3, "z": 7.8, "s": 0.9 },
    { "x": -8.0, "z": 2.8, "s": 0.6 },
    { "x": 3.8, "z": 8.6, "s": 0.5 },
    { "x": -8.4, "z": -8.4, "s": 0.8 },
    { "x": 5.8, "z": -7.4, "s": 0.55 },
    { "x": 6.55, "z": -9.55, "s": 0.55 },
    { "x": 7.85, "z": -9.55, "s": 0.5 },
    { "x": 7.2, "z": -10.1, "s": 0.7 },
    { "x": 7.3, "z": 7.65, "s": 0.5 },
    { "x": 8.9, "z": 7.55, "s": 0.45 },
    { "x": 8.15, "z": 8.2, "s": 0.6 }
  ],
  "fence": { "at": 10.35, "zFrom": 8.3, "xFrom": -10.1, "post": 1.25 },
  "picnic": { "x": 0, "z": 8.85 },
  "telescope": { "x": -2.4, "z": 9.35 },
  "van": { "x": 3.9, "z": -8.9, "len": 3.0, "w": 1.45, "awning": 1.25 },
  "campChair": { "x": 4.5, "z": -7.45 },
  "chops": [{ "x": -9.5, "z": 3.3 }, { "x": -8.7, "z": -4.6 }, { "x": -6.5, "z": -8.1 }, { "x": 1.75, "z": -6.65 }],
  "workbench": { "x": -4.2, "z": -6.1, "len": 1.4, "w": 0.62, "top": 0.86 },
  "critter": { "x": 3.4, "z": -6.2 },
  "canoe": { "x": 8.0, "z": 2.62, "len": 2.0 },
  "cleat": { "x": 6.95, "z": 1.8 },
  "owl": { "x": -9.35, "y": 1.2, "z": -3.35, "tree": { "x": -10.0, "z": -4.0 } },
  "ducks": [
    { "z": -4.4, "rx": 0.6, "rz": 1.3, "speed": 0.09 },
    { "z": 5.2, "rx": 0.45, "rz": 0.95, "speed": 0.12 }
  ],
  "forage": [
    { "kind": "mushroom", "x": -5.2, "z": -8.8 },
    { "kind": "berries", "x": -8.6, "z": -1.1 },
    { "kind": "mushroom", "x": -8.7, "z": 1.7 },
    { "kind": "berries", "x": 0.5, "z": -8.9 }
  ],
  "stringPole": { "x": -4.0, "z": -1.2, "h": 2.2 },
  "strings": [
    { "a": [-6.3, 2.65, -5.0], "b": [-3.76, 1.6, -9.18], "sag": 0.45 },
    { "a": [-6.3, 2.65, -5.0], "b": [-9.15, 1.6, -2.15], "sag": 0.45 },
    { "a": [-6.3, 2.65, -5.0], "b": [-4.0, 2.15, -1.2], "sag": 0.4 },
    { "a": [-4.0, 2.15, -1.2], "b": [-6.3, 1.5, 4.04], "sag": 0.5 },
    { "a": [0.05, 1.25, -9.42], "b": [3.05, 1.55, -6.925], "sag": 0.35 },
    { "a": [3.05, 1.55, -6.925], "b": [5.15, 1.55, -6.925], "sag": 0.22 }
  ],
  "fenceLights": { "y": 0.78, "sag": 0.2, "every": 2 },
  "fireflies": { "x": -7.6, "z": 0.2 },
  "stumpSeat": { "x": 0.7, "z": -5.65 },
  "signpost": {
    "x": 0.85,
    "z": 6.75,
    "arms": [
      { "label": "Campfire", "to": [0, 0] },
      { "label": "Pier", "to": [5.5, 0] },
      { "label": "Overlook", "to": [-2.4, 9.35] }
    ]
  },
  "guitarCase": { "x": -7.4, "z": 3.3, "yaw": 0.5 },
  "groundLantern": { "x": -6.95, "z": 2.9 },
  "paths": [
    { "points": [[-2.9, -2.35, 2.2], [-3.45, -2.75, 1.5], [-4.0, -3.2, 1.05], [-4.6, -3.6, 1.0]] },
    { "points": [[0.15, 3.8, 2.2], [0.1, 4.5, 1.5], [0.05, 5.3, 1.2], [-0.2, 6.4, 1.3], [-0.3, 7.0, 1.35], [-0.35, 7.5, 1.3], [-0.3, 7.95, 1.6]] },
    { "points": [[-0.05, 6.5, 1.5], [-0.7, 7.05, 1.0], [-1.5, 7.65, 0.85], [-2.4, 8.45, 0.9]] }
  ],
  "cascade": { "x": 7.2, "z": -9.95, "top": 0.5 },
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

const RIVER_FIRST = L.river.points[0];
const RIVER_LAST = L.river.points[L.river.points.length - 1];
/** The river's north and south ends (its round caps included). */
export const RIVER_Z = { from: RIVER_FIRST[0] - RIVER_FIRST[2], to: RIVER_LAST[0] + RIVER_LAST[2] };

// --- the fishing spots ----------------------------------------------------------------------------

/** Where you can fish from: the dock's three spots (you sit on its edge) and the canoe (you sit in
 *  it). Each has its seat, where you stand to take it, where you fish from, and where your float
 *  lands out in the river. */
export const FISHING_SPOTS = [
  ...L.fishing.map((f, i) => ({ propId: `fishing_spot_0${i + 1}`, seat: `seat_dock_0${i + 1}`, stand: f.stand, approach: f.stand, bobber: f.bobber })),
  // the canoe, sitting facing out across the water: the float lands out in front of you
  { propId: "fishing_canoe", seat: "seat_canoe", stand: { x: L.canoe.x - 0.45, z: L.canoe.z }, approach: { x: 6.6, z: 1.5 }, bobber: { x: L.canoe.x - 0.45, z: L.canoe.z + 1.25 } },
];

/** The spot an angler standing at (x, z) is fishing from: the nearest one. */
export function nearestFishingSpot(x: number, z: number) {
  let best = FISHING_SPOTS[0];
  for (const s of FISHING_SPOTS) if (Math.hypot(s.stand.x - x, s.stand.z - z) < Math.hypot(best.stand.x - x, best.stand.z - z)) best = s;
  return best;
}

// --- the living camp: the telescope, the chopping block, foraging, lights and wildlife ----------

/** The Northern Timber Trail: four chopping stations spread across the camp's whole width, none of
 *  them behind Buster's stall: far left in the pines by the hammock, between the A-frame tent and the
 *  tipi, deep in the north pines behind the tipi, and far right at the woodpile by the camper. Each
 *  block yields a few logs (CHOP_YIELD), then waits CHOP_RESPAWN_S for fresh ones; you step up to it
 *  from the fire's side. */
export const CHOP_STATIONS = L.chops.map((c, i) => {
  const toFire = unit(L.fire.x - c.x, L.fire.z - c.z);
  return { propId: `woodchop_0${i + 1}`, x: c.x, z: c.z, approachX: c.x + toFire.x * 0.9, approachZ: c.z + toFire.z * 0.9 };
});
/** The chopping station nearest a point. */
export function nearestChopStation(x: number, z: number) {
  return CHOP_STATIONS.reduce((best, s) => (Math.hypot(s.x - x, s.z - z) < Math.hypot(best.x - x, best.z - z) ? s : best));
}

/** Close enough to the telescope's eyepiece to look through it. */
export const STARGAZE_REACH = 1.4;
/** Close enough to the chopping block to swing at it. */
export const CHOP_REACH = 1.4;
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

/** The fence's posts along the front edge (as build_campfire.py spaces them). */
export const FENCE_POSTS: number[] = (() => {
  const f = L.fence;
  const len = f.at - f.xFrom;
  const n = Math.max(1, Math.round(len / f.post));
  return Array.from({ length: n + 1 }, (_, k) => f.xFrom + (len * k) / n);
})();

/** Every string of lights: the ones slung between the tipi, the pole, the pines and the awning
 *  (each its own node in campfire.glb, StringLight_01.., swaying about its two ends), then the
 *  swags along the front fence (one node, StringLight_Fence, swaying as one). */
export const LIGHT_STRINGS = L.strings.map((s, i) => ({ id: `StringLight_0${i + 1}`, a: s.a as Vec3, b: s.b as Vec3, sag: s.sag }));
export const FENCE_SWAGS = (() => {
  const { y, sag, every } = L.fenceLights;
  const out: { a: Vec3; b: Vec3; sag: number }[] = [];
  for (let k = 0; k + every < FENCE_POSTS.length; k += every) out.push({ a: [FENCE_POSTS[k], y, L.fence.at], b: [FENCE_POSTS[k + every], y, L.fence.at], sag });
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
/** The hammock hangs from pine a to pine b (across the screen, so neither pine hides it): its
 *  middle, the way along it, and the side facing the camera (you climb in from there). */
const HAMMOCK = (() => {
  const { a, b } = L.hammock;
  const along = unit(b.x - a.x, b.z - a.z);
  const across = along.x + along.z >= 0 ? { x: along.z, z: -along.x } : { x: -along.z, z: along.x };
  const front = across.x + across.z >= 0 ? across : { x: -across.x, z: -across.z };
  return { mid: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, along, front, length: Math.hypot(b.x - a.x, b.z - a.z) };
})();

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

/**
 * A seat you lie down on: where your head rests, and the way it points (toward the back of the
 * tent, along the hammock). The server lies you down there with your eyes shut.
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

/** The second tent: a small A-frame on the upper-left lawn, its door toward the fire (`open`), its
 *  ridge along that way; `across` is the way its two canvas sides slope down. */
export const TENT2 = (() => {
  const t = L.tent2;
  const open = unit(L.fire.x - t.x, L.fire.z - t.z);
  return { ...t, open, across: { x: -open.z, z: open.x } };
})();

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
  // the hammock, along its length, head toward pine b; climb in from the camera's side
  {
    propId: "seat_hammock",
    x: HAMMOCK.mid.x,
    z: HAMMOCK.mid.z,
    rotationY: 0,
    cushion: "hammock",
    approachX: HAMMOCK.mid.x + HAMMOCK.front.x * 1.1,
    approachZ: HAMMOCK.mid.z + HAMMOCK.front.z * 1.1,
    lie: { head: { x: HAMMOCK.mid.x + HAMMOCK.along.x * 0.6, z: HAMMOCK.mid.z + HAMMOCK.along.z * 0.6 }, dir: HAMMOCK.along },
  },
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
  // the A-frame: lie on its mat, head to the back, feet to the door
  {
    propId: "seat_tent_02",
    x: TENT2.x,
    z: TENT2.z,
    rotationY: 0,
    cushion: "tentMat",
    approachX: TENT2.x + TENT2.open.x * (TENT2.len / 2 + 0.75),
    approachZ: TENT2.z + TENT2.open.z * (TENT2.len / 2 + 0.75),
    lie: { head: { x: TENT2.x - TENT2.open.x * 0.35, z: TENT2.z - TENT2.open.z * 0.35 }, dir: { x: -TENT2.open.x, z: -TENT2.open.z } },
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
  { propId: "seat_canoe", x: L.canoe.x - 0.45, z: L.canoe.z, rotationY: 0, cushion: "canoe", style: "wood", approachX: 6.6, approachZ: 1.5 },
  // the sitting stump beside the chopping block, facing the fire
  (() => {
    const toFire = unit(L.fire.x - L.stumpSeat.x, L.fire.z - L.stumpSeat.z);
    return { propId: "seat_chop_stump", x: L.stumpSeat.x, z: L.stumpSeat.z, rotationY: facing(L.stumpSeat.x, L.stumpSeat.z, L.fire), cushion: "stump", style: "wood", approachX: L.stumpSeat.x + toFire.x * 0.85, approachZ: L.stumpSeat.z + toFire.z * 0.85 } satisfies CampSeat;
  })(),
];

/** What the action dock offers for a seat you lie in: you rest in the tent and nap in the hammock. */
export const CAMP_SEAT_LABELS: Record<string, string> = {
  seat_tent: "⛺ Rest",
  seat_tent_02: "⛺ Rest",
  seat_hammock: "🛌 Nap",
  ...Object.fromEntries(FISHING_SPOTS.filter((s) => s.seat.startsWith("seat_dock_")).map((s) => [s.seat, "🌊 Sit on the dock"])),
  seat_canoe: "🛶 Sit in the canoe",
};

/** Where a lie seat puts the avatar (its soles, heading and height), derived from its cushion. */
export function lieSeatPose(seat: CampSeat) {
  return seat.lie ? napPose(CUSHIONS[seat.cushion], seat.lie.head, seat.lie.dir) : null;
}

/** Where you stand to talk to Barnaby: in front of him. */
export const BARNABY_FRONT = { x: L.barnaby.x + Math.sin(L.barnaby.yaw) * 0.95, z: L.barnaby.z + Math.cos(L.barnaby.yaw) * 0.95 };
/** Close enough to Barnaby to trade. */
export const BARNABY_REACH = 1.8;
/** Where you stand to talk to Buster the Lumberjack (in front of him), and how close is close enough. */
export const BUSTER_FRONT = { x: L.buster.x + Math.sin(L.buster.yaw) * 0.95, z: L.buster.z + Math.cos(L.buster.yaw) * 0.95 };
export const BUSTER_REACH = 1.8;
/** The carpenter's workbench on the grass between the tipi and Buster's stall (well clear of him:
 *  walking up to one never offers the other), its front toward the fire: `front` the way it faces,
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

export const CAMP_PROPS: PropSpec[] = [
  // the bonfire: walk up (or sit on a log) and roast a marshmallow or grill a skewer
  { propId: "bonfire", x: L.fire.x, z: L.fire.z, kind: "bonfire", color: "#ff8c32", defaultOn: true, approachX: L.fire.x, approachZ: L.fire.z + 1.35 },
  // the dock's fishing spots, side by side along its river edge: cast a line from each
  ...FISHING_SPOTS.map((s): PropSpec => ({ propId: s.propId, x: s.stand.x + (s.seat === "seat_canoe" ? 0 : 0.25), z: s.stand.z, kind: "fishing", color: "#7fb7d6", defaultOn: true, approachX: s.approach.x, approachZ: s.approach.z })),
  // the brass telescope by the front fence: look up and catch shooting stars
  { propId: "telescope", x: L.telescope.x, z: L.telescope.z, kind: "telescope", color: "#d9a441", defaultOn: true, approachX: L.telescope.x, approachZ: L.telescope.z - 0.85 },
  // the chopping stations (the woodpile, the grove, the fork): split a log to feed the fire; `on`
  // while a log waits on the block
  ...CHOP_STATIONS.map((s): PropSpec => ({ propId: s.propId, x: s.x, z: s.z, kind: "woodchop", color: "#c98b4f", defaultOn: true, approachX: s.approachX, approachZ: s.approachZ })),
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
  // the dark grove between the hammock and the tipi, alive with fireflies: catch some in a jar
  (() => {
    const toFire = unit(L.fire.x - L.fireflies.x, L.fire.z - L.fireflies.z);
    return { propId: "fireflies", x: L.fireflies.x, z: L.fireflies.z, kind: "fireflies", color: "#e8ff8a", defaultOn: true, approachX: L.fireflies.x + toFire.x * 0.9, approachZ: L.fireflies.z + toFire.z * 0.9 } satisfies PropSpec;
  })(),
];

// --- what you walk round ----------------------------------------------------------------------

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });

/** The two pines the hammock hangs between, at its ends. */
export const HAMMOCK_PINES: Pt[] = [L.hammock.a, L.hammock.b];

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
  // the tipi (you lie down inside it: the seat is within its box, as a sofa's is), and the A-frame
  around(L.tent, L.tent.r - 0.15),
  {
    minX: TENT2.x - (Math.abs(TENT2.open.x) * TENT2.len + Math.abs(TENT2.across.x) * TENT2.w) / 2 + 0.12,
    maxX: TENT2.x + (Math.abs(TENT2.open.x) * TENT2.len + Math.abs(TENT2.across.x) * TENT2.w) / 2 - 0.12,
    minZ: TENT2.z - (Math.abs(TENT2.open.z) * TENT2.len + Math.abs(TENT2.across.z) * TENT2.w) / 2 + 0.12,
    maxZ: TENT2.z + (Math.abs(TENT2.open.z) * TENT2.len + Math.abs(TENT2.across.z) * TENT2.w) / 2 - 0.12,
  },
  // the woodpile (its chopping stump inside its box), and the trail's other chopping stumps
  { minX: L.woodpile.x - 0.6, maxX: L.woodpile.x + 1.0, minZ: L.woodpile.z - 0.5, maxZ: L.woodpile.z + 0.6 },
  ...CHOP_STATIONS.slice(0, 3).map((s) => around(s, 0.3)),
  // the hammock (it hangs across a diagonal: small boxes along it) and its two pines
  ...Array.from({ length: 6 }, (_, k) => {
    const t = (k + 0.5) / 6 - 0.5;
    return around({ x: HAMMOCK.mid.x + HAMMOCK.along.x * t * HAMMOCK.length, z: HAMMOCK.mid.z + HAMMOCK.along.z * t * HAMMOCK.length }, 0.36);
  }),
  ...HAMMOCK_PINES.map((p) => around(p, 0.42)),
  // the pines' trunks and the boulders
  ...L.trees.map((t) => around(t, 0.42 * Math.max(0.8, t.s))),
  ...L.rocks.map((r) => around(r, 0.45 * r.s)),
  // the picnic table, its benches and the cooler at its end; the telescope's tripod
  { minX: L.picnic.x - 0.92, maxX: L.picnic.x + 1.5, minZ: L.picnic.z - 0.78, maxZ: L.picnic.z + 0.78 },
  around(L.telescope, 0.3),
  // the camper van, its awning's two front poles and the camp chair under it, the critter
  { minX: L.van.x - L.van.len / 2 - 0.05, maxX: L.van.x + L.van.len / 2 + 0.05, minZ: L.van.z - L.van.w / 2 - 0.05, maxZ: L.van.z + L.van.w / 2 + 0.05 },
  ...AWNING_POLES.map((p) => around(p, 0.08)),
  around(L.campChair, 0.3),
  around(L.critter, 0.22),
  // the pole the lights are strung from, the sitting stump, the signpost
  around(L.stringPole, 0.1),
  around(L.stumpSeat, 0.22),
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
];

export const CAMP_SPAWNS: Pt[] = L.spawns;
