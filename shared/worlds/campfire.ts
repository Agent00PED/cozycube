import type { AABB } from "../collision";
import { CUSHIONS, napPose } from "../seats";
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
  "clearing": { "x": 0, "z": 0, "r": 4.3 },
  "logs": [
    { "x": -1.945, "z": -1.945 },
    { "x": 1.945, "z": -1.945 },
    { "x": -1.945, "z": 1.945 },
    { "x": 1.945, "z": 1.945 }
  ],
  "logLength": 2.2,
  "logSeatSpread": 0.52,
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
    { "x": 5.8, "z": -7.4, "s": 0.55 }
  ],
  "fence": { "at": 10.35, "zFrom": 8.3, "xFrom": -10.1, "post": 1.25 },
  "picnic": { "x": 0, "z": 8.85 },
  "telescope": { "x": -2.4, "z": 9.35 },
  "van": { "x": 3.9, "z": -8.9, "len": 3.0, "w": 1.45, "awning": 1.25 },
  "campChair": { "x": 4.5, "z": -7.45 },
  "chop": { "x": 1.75, "z": -6.65 },
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
  "paths": [
    { "points": [[0, 7.9], [0, 4.1]], "w": 1.4 },
    { "points": [[3.9, 0], [5.6, 0]], "w": 1.3 },
    { "points": [[-3.2, -2.6], [-4.6, -3.7]], "w": 1.0 },
    { "points": [[-0.9, 6.6], [-5.6, 6.9]], "w": 0.9 }
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
export const BONFIRE_REACH = 3.2;
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

/** The dock's three fishing spots: where you stand, and where your float lands out in the river. */
export const FISHING_SPOTS = L.fishing.map((f, i) => ({ propId: `fishing_spot_0${i + 1}`, stand: f.stand, bobber: f.bobber }));

/** The spot an angler standing at (x, z) is fishing from: the nearest one. */
export function nearestFishingSpot(x: number, z: number) {
  let best = FISHING_SPOTS[0];
  for (const s of FISHING_SPOTS) if (Math.hypot(s.stand.x - x, s.stand.z - z) < Math.hypot(best.stand.x - x, best.stand.z - z)) best = s;
  return best;
}

// --- the living camp: the telescope, the chopping block, foraging, lights and wildlife ----------

/** Close enough to the telescope's eyepiece to look through it. */
export const STARGAZE_REACH = 1.4;
/** Close enough to the chopping block to swing at it. */
export const CHOP_REACH = 1.4;
/** Close enough to a mushroom patch or a berry bush to pick it. */
export const FORAGE_REACH = 1.3;
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
export const LOG_BENCHES = L.logs.map((log, i) => {
  const out = unit(log.x - L.fire.x, log.z - L.fire.z);
  // facing the fire (-out), a sitter's left hand is along (-out.z, out.x)
  const left = { x: -out.z, z: out.x };
  const seat = (side: 1 | -1) => ({ x: log.x + left.x * side * L.logSeatSpread, z: log.z + left.z * side * L.logSeatSpread });
  return { id: `0${i + 1}`, x: log.x, z: log.z, along: left, seats: { l: seat(1), r: seat(-1) } };
});

/**
 * A seat you lie down on: where your head rests, and the way it points (toward the back of the
 * tent, along the hammock). The server lies you down there with your eyes shut.
 */
export interface LieSpec {
  head: Pt;
  dir: Pt;
}

/** The campfire's seats. `lie` seats are ChairConfig "blanket"s (shared/props.ts). */
export const CAMP_SEATS: (SeatSpec & { lie?: LieSpec })[] = [
  // the four log benches round the fire, two to a log, each seat facing the fire; you get up on
  // the far side of the log from it
  ...LOG_BENCHES.flatMap((log) =>
    (["l", "r"] as const).map((side): SeatSpec => {
      const at = log.seats[side];
      const out = unit(at.x - L.fire.x, at.z - L.fire.z);
      return { propId: `seat_log_${log.id}_${side}`, x: at.x, z: at.z, rotationY: facing(at.x, at.z, L.fire), cushion: "log", approachX: at.x + out.x * 1.2, approachZ: at.z + out.z * 1.2 };
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
];

/** What the action dock offers for a seat you lie in: you rest in the tent and nap in the hammock. */
export const CAMP_SEAT_LABELS: Record<string, string> = { seat_tent: "⛺ Rest", seat_hammock: "🛌 Nap" };

/** Where a lie seat puts the avatar (its soles, heading and height), derived from its cushion. */
export function lieSeatPose(seat: SeatSpec & { lie?: LieSpec }) {
  return seat.lie ? napPose(CUSHIONS[seat.cushion], seat.lie.head, seat.lie.dir) : null;
}

export const CAMP_PROPS: PropSpec[] = [
  // the bonfire: walk up (or sit on a log) and roast a marshmallow or grill a skewer
  { propId: "bonfire", x: L.fire.x, z: L.fire.z, kind: "bonfire", color: "#ff8c32", defaultOn: true, approachX: L.fire.x, approachZ: L.fire.z + 1.35 },
  // the dock's fishing spots, side by side along its river edge: cast a line from each
  ...FISHING_SPOTS.map((s): PropSpec => ({ propId: s.propId, x: s.stand.x + 0.25, z: s.stand.z, kind: "fishing", color: "#7fb7d6", defaultOn: true, approachX: s.stand.x, approachZ: s.stand.z })),
  // the brass telescope by the front fence: look up and catch shooting stars
  { propId: "telescope", x: L.telescope.x, z: L.telescope.z, kind: "telescope", color: "#d9a441", defaultOn: true, approachX: L.telescope.x, approachZ: L.telescope.z - 0.85 },
  // the chopping block by the woodpile: split a log to feed the fire
  { propId: "woodchop", x: L.chop.x, z: L.chop.z, kind: "woodchop", color: "#c98b4f", defaultOn: true, approachX: L.chop.x, approachZ: L.chop.z + 0.9 },
  // mushrooms and berries under the pines; `on` while there is something to pick
  ...FORAGE_SPOTS.map((f): PropSpec => ({ propId: f.propId, x: f.x, z: f.z, kind: "foraging", color: f.kind === "berries" ? "#8f7bff" : "#d9483b", defaultOn: true, approachX: f.approachX, approachZ: f.approachZ })),
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
  // the fire: only its logs, inside the stones' inner edge, so you can walk right round it
  around(L.fire, L.fire.collider),
  // the log benches, each lying tangent to the fire: small boxes along it, so the ring between the
  // benches and the gaps between them stay open
  ...LOG_BENCHES.flatMap((log) =>
    Array.from({ length: 7 }, (_, k) => {
      const t = (k / 6 - 0.5) * (L.logLength - 0.3);
      return around({ x: log.x + log.along.x * t, z: log.z + log.along.z * t }, 0.2);
    })
  ),
  // the river, less the dock
  ...riverBoxes(),
  // the dock's lantern posts
  ...L.lanterns.map((p) => around(p, 0.12)),
  // the tipi (you lie down inside it: the seat is within its box, as a sofa's is)
  around(L.tent, L.tent.r - 0.15),
  // the woodpile and its chopping stump
  { minX: L.woodpile.x - 0.6, maxX: L.woodpile.x + 1.0, minZ: L.woodpile.z - 0.5, maxZ: L.woodpile.z + 0.6 },
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
  // the pole the lights are strung from
  around(L.stringPole, 0.1),
];

export const CAMP_SPAWNS: Pt[] = L.spawns;
