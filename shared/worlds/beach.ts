import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";
import { gridData, gridY, makeGrid, moundAt, smoothstep } from "../terrain";

// Sunset Beach (the map "sunset_beach", docs/beach-design.md): 36 x 36 m, open to everyone from the
// world list. The camera looks north-west from the south-east, so the coast runs across the view:
// the sea in front (the south and the east), the sand rising away from it, the bar on its dune and
// the palms at the back. Nothing tall stands between a player and the camera.
//
// The coast is a wandering line across the square's diagonal, so the layout is written in the
// coast's own frame: `d`, metres inland from the waterline (negative: out to sea), and `v`, metres
// along the coast (north-east positive, 0 at the middle). `at(d, v)` is the game's (x, z).
//
//   The arrival         west, on the sand below the bar: the first thing seen is the bar, lit
//   The Beach Bar       on the dune: a horseshoe counter open to the back, six stools round its
//                       front, three places behind it for players on shift (A Shift at the Bar),
//                       Mango the toucan at the back shelf under a thatched lean-to
//   The firepit         beside the bar: a ring of stones and four driftwood logs (the one worn
//                       place); a marshmallow on a stick as you sit
//   The sand            loungers and parasols in loose groups, two hammocks between three palms
//   The ball            a flat stretch of sand in the middle, no net (shared/volleyball.ts)
//   The pier            from the west shore out to deep water, walked at the deck's height; the
//                       trader's shack at its foot, the captain's boat moored at its head
//   The Palm Grove      along the back and the east, 3 to 4 m apart, no rows
//   The headland        north-east: a rise with rock in its seaward face
//
// One height function (beachLand: the sand, the dune, the headland, the ball's flat; beachHeight: the
// same, it has no channel to cut). The seabed falls away from the waterline; the shallows are waded
// and deep water stops you (beachBlocked: the ground under WADE_DEPTH, but on the pier's deck).
// `npm run beach-terrain` writes the grid and every thing's place to
// scripts/blender/data/beach_terrain.json for scripts/blender/build_beach.py (`check-layout` fails
// while it is stale).

type Pt = { x: number; z: number };

export const BEACH_LAYOUT = /* layout:begin */ {
  "half": 18,
  "terrain": {
    "step": 0.4,
    "sand": { "top": 0.8, "run": 10 },
    "seabed": { "depth": 1.3, "run": 14 },
    "coast": { "base": 1.5, "waves": [[1.5, 0.21, 0.5], [0.7, 0.47, 1.9]], "cape": { "v": 20.5, "out": 3.6, "w": 7.5 } },
    "mounds": [
      { "id": "dune", "d": 11, "v": -2, "top": 0.45, "flat": 3.8, "skirt": 4.5 },
      { "id": "headland", "d": 5.0, "v": 20.0, "top": 1.2, "flat": 2.0, "skirt": 7.5 },
      { "id": "backdune", "d": 19, "v": 6, "top": 0.5, "flat": 2.5, "skirt": 5.5 },
      { "id": "westdune", "d": 17, "v": -12, "top": 0.4, "flat": 2.0, "skirt": 5.0 },
      { "id": "swell1", "d": 14.5, "v": 15, "top": 0.25, "flat": 0.8, "skirt": 3.2 },
      { "id": "swell2", "d": 24, "v": -3, "top": 0.3, "flat": 1.2, "skirt": 3.6 }
    ]
  },
  "wadeDepth": 0.42,
  "arrival": { "d": 6.4, "v": -14.6 },
  "bar": { "d": 11, "v": -2, "counter": 1.9, "arc": 100, "top": 1.0, "stools": [-80, -48, -16, 16, 48, 80], "stoolAt": 2.6, "stations": [-45, 0, 45], "stationAt": 1.15, "shelfAt": 1.75, "shelf": [160, 180, 200], "posts": [-104, 104], "postAt": 2.2 },
  "firepit": { "d": 6.8, "v": 3.6, "r": 0.5, "logs": [100, 190, 280, 10], "logAt": 1.3 },
  "court": { "d": 5.4, "v": 8.6, "r": 3.6, "blend": 3.6 },
  "pier": { "v": -6, "half": 1.2, "from": 2.4, "to": -11, "head": { "len": 3.2, "half": 2.4 }, "deck": 0.34 },
  "shack": { "d": 7.4, "v": -10.4, "w": 3.0, "dp": 2.3 },
  "boat": { "along": -1.6, "side": 4.4 },
  "loungers": [
    { "d": 3.4, "v": -1.6, "turn": 0.1 }, { "d": 3.2, "v": 0.1, "turn": -0.08 },
    { "d": 3.6, "v": 11.6, "turn": 0.05 }, { "d": 3.4, "v": 13.3, "turn": -0.12 }, { "d": 5.0, "v": 12.6, "turn": 0.2 },
    { "d": 3.3, "v": -12.2, "turn": -0.05 }, { "d": 3.5, "v": -14.0, "turn": 0.12 }
  ],
  "parasols": [{ "d": 4.9, "v": -0.75 }, { "d": 5.4, "v": 13.6 }, { "d": 4.8, "v": -13.1 }],
  "hammockPalms": [{ "d": 12.6, "v": 6.6 }, { "d": 13.0, "v": 9.8 }, { "d": 12.6, "v": 13.0 }],
  "palms": [
    [16.2, 7.2, 0.90], [21.1, -0.1, 1.03], [15.1, 3.6, 1.09], [8.7, -16.2, 1.06], [20.0, 3.7, 0.95], [21.8, -2.9, 1.06], [12.5, -6.5, 1.00],
    [8.8, 14.7, 1.08], [15.8, -6.4, 1.07], [10.9, 3.4, 0.98], [17.3, 0.0, 1.03], [15.7, -3.7, 0.90], [25.2, -0.6, 1.05], [11.6, -10.3, 0.96],
    [23.6, 2.5, 1.07], [8.3, 17.9, 0.91], [9.0, 6.1, 1.06], [8.7, -7.0, 1.06], [19.1, 6.6, 1.06]
  ],
  "shrubs": [
    [23.1, -0.5, 0.65], [19.5, 1.8, 0.78], [18.5, -1.0, 0.66], [7.1, -17.5, 0.83], [13.0, -9.1, 0.68], [22.1, 3.8, 0.68], [7.2, 16.5, 0.70],
    [17.2, 5.2, 0.74], [19.1, -3.5, 0.68], [12.6, 3.5, 0.79], [15.6, 0.8, 0.77]
  ],
  "rocks": [
    [1.6, 17.2, 1.1], [0.9, 19.4, 1.3], [1.4, 21.6, 1.0], [-0.6, 20.6, 0.9], [2.6, 23.0, 0.8], [-1.4, 18.4, 0.7],
    [1.2, -17.6, 0.7], [0.4, -19.0, 0.6]
  ],
  "driftwood": [{ "d": 2.2, "v": 6.2, "yaw": 0.7, "len": 1.5 }, { "d": 1.8, "v": -16.4, "yaw": 2.2, "len": 1.3 }]
} /* layout:end */;

const L = BEACH_LAYOUT;
const S = Math.SQRT1_2;
const rad = (deg: number) => (deg * Math.PI) / 180;
const round = (v: number) => Math.round(v * 1000) / 1000;

// --- the coast's frame ---------------------------------------------------------------------------

/** Toward the sea (the camera's side), and along the coast to the north-east. */
export const SEAWARD: Pt = { x: S, z: S };
export const ALONG: Pt = { x: S, z: -S };
/** Where the waterline lies along the coast: metres out along SEAWARD at `v` along it. */
export function coastU(v: number): number {
  const c = L.terrain.coast;
  let u = c.base;
  for (const [amp, freq, phase] of c.waves) u += amp * Math.sin(freq * v + phase);
  return u + c.cape.out * Math.exp(-(((v - c.cape.v) / c.cape.w) ** 2));
}
/** (x, z) in the coast's frame: `d` metres inland of the waterline (negative: at sea), `v` along it. */
export function shoreOf(x: number, z: number): { d: number; v: number } {
  const v = (x - z) * S;
  return { d: coastU(v) - (x + z) * S, v };
}
/** How far inland (x, z) is (negative: out to sea). */
export const shoreD = (x: number, z: number): number => shoreOf(x, z).d;
/** The game's (x, z) of a point `d` inland at `v` along the coast. */
export function at(d: number, v: number): Pt {
  const u = coastU(v) - d;
  return { x: round((u + v) * S), z: round((u - v) * S) };
}
/** A step from `p`: `sea` metres toward the sea and `along` metres up the coast. */
const step = (p: Pt, sea: number, along: number): Pt => ({ x: round(p.x + SEAWARD.x * sea + ALONG.x * along), z: round(p.z + SEAWARD.z * sea + ALONG.z * along) });
/** The heading that faces (dx, dz). */
const yawOf = (dx: number, dz: number) => round(Math.atan2(dx, dz));
/** Facing the sea, and facing inland. */
export const SEA_YAW = yawOf(SEAWARD.x, SEAWARD.z);

// --- the pier ------------------------------------------------------------------------------------

/** The pier: a deck along SEAWARD from the sand out to deep water, a wider head at its end. */
export const PIER = (() => {
  const p = L.pier;
  const u0 = coastU(p.v);
  return { v: p.v, half: p.half, uFrom: u0 - p.from, uTo: u0 - p.to, headFrom: u0 - p.to - p.head.len, headHalf: p.head.half, deck: p.deck };
})();
/** How far inside the pier's deck (x, z) is (negative: off it). */
export function pierInside(x: number, z: number): number {
  const u = (x + z) * S;
  const v = (x - z) * S;
  const half = u >= PIER.headFrom ? PIER.headHalf : PIER.half;
  return Math.min(half - Math.abs(v - PIER.v), u - PIER.uFrom, PIER.uTo - u);
}
/** A point on the pier: `along` metres from its landward end, `side` metres to the north-east. */
export const onPierAt = (along: number, side: number): Pt => ({ x: round((PIER.uFrom + along + PIER.v + side) * S), z: round((PIER.uFrom + along - PIER.v - side) * S) });
export const PIER_LENGTH = PIER.uTo - PIER.uFrom;

// --- the ground (shared/terrain.ts) ----------------------------------------------------------------

const T = L.terrain;
const MOUNDS = T.mounds.map((m) => ({ ...at(m.d, m.v), top: m.top, flat: m.flat, skirt: m.skirt }));
const COURT = { ...at(L.court.d, L.court.v), r: L.court.r, blend: L.court.blend };
/** The sand's rise from the waterline, and the seabed's fall. */
// (each eased out from the waterline, where it is steepest: the water's edge is a clean line, and a
// wave lapping a hand's height up it runs a stride up the sand)
const easeOut = (t: number) => 1 - (1 - Math.min(1, t)) ** 2;
const profile = (d: number) => (d >= 0 ? T.sand.top * easeOut(d / T.sand.run) : -T.seabed.depth * easeOut(-d / T.seabed.run));
const rawLand = (x: number, z: number) => {
  const d = shoreD(x, z);
  let h = profile(d);
  // (the dune, the headland and the swells: land only, eased in from the waterline)
  const dry = smoothstep(1, 6, d);
  if (dry > 0) for (const m of MOUNDS) h += dry * moundAt(m, x, z);
  return h;
};
const COURT_Y = rawLand(COURT.x, COURT.z);
/** The ground's height at (x, z): the sand, the dunes, the seabed, and the ball's flat stretch. */
export function beachLand(x: number, z: number): number {
  const h = rawLand(x, z);
  const k = 1 - smoothstep(COURT.r, COURT.r + COURT.blend, Math.hypot(x - COURT.x, z - COURT.z));
  return k > 0 ? h + (COURT_Y - h) * k : h;
}
export const BEACH_GRID = makeGrid(L.half, T.step, beachLand, beachLand);
/** The ground under (x, z): the grid's own triangles. */
export const beachGroundY = (x: number, z: number): number => gridY(BEACH_GRID, BEACH_GRID.ground, x, z);
/** Where feet go at (x, z): the pier's deck over the ground, else the ground. */
export const beachFloorY = (x: number, z: number): number => (pierInside(x, z) >= 0 ? Math.max(PIER.deck, beachGroundY(x, z)) : beachGroundY(x, z));
/** The sea's surface. */
export const SEA_Y = 0;
/** How deep you wade before the water stops you (m). */
export const WADE_DEPTH = L.wadeDepth;
/** Standing in the sea (off the pier): the shallows are waded. */
export const beachWading = (x: number, z: number): boolean => pierInside(x, z) < 0 && beachGroundY(x, z) < SEA_Y - 0.04;
/** Where no one stands: deep water, and the strip beside the pier where its deck is too high to
 *  step onto (you walk onto it from its landward end, or over its foot on the sand). */
export function beachBlocked(x: number, z: number): boolean {
  const inside = pierInside(x, z);
  if (inside >= 0.12) return false;
  const y = beachGroundY(x, z);
  if (y < -WADE_DEPTH) return true;
  return inside > -0.4 && PIER.deck - y > 0.3;
}
/** The flat stretch the ball is kicked about on: its middle, radius and height. */
export const BALL_COURT = { x: COURT.x, z: COURT.z, r: COURT.r, y: round(COURT_Y) };

// --- the bar -------------------------------------------------------------------------------------

/** The bar's frame: its middle, and a point `r` out at `deg` round it (0: the front, toward the
 *  sea and the camera; 90: to the north-east; 180: the back). */
const BAR_C = at(L.bar.d, L.bar.v);
const barAt = (r: number, deg: number): Pt => step(BAR_C, r * Math.cos(rad(deg)), r * Math.sin(rad(deg)));
/** The heading at the bar that faces `deg` round it. */
const barYaw = (deg: number) => yawOf(SEAWARD.x * Math.cos(rad(deg)) + ALONG.x * Math.sin(rad(deg)), SEAWARD.z * Math.cos(rad(deg)) + ALONG.z * Math.sin(rad(deg)));
export const BAR = {
  x: BAR_C.x,
  z: BAR_C.z,
  yaw: SEA_YAW,
  counter: L.bar.counter,
  arc: L.bar.arc,
  top: L.bar.top,
  /** The six stools round the front, each facing the counter. */
  stools: L.bar.stools.map((deg, i) => ({ propId: `seat_bar_0${i + 1}`, deg, ...barAt(L.bar.stoolAt, deg), rotationY: barYaw(deg + 180), approach: barAt(L.bar.stoolAt + 0.7, deg), counter: barAt(L.bar.counter, deg) })),
  /** The three places behind the counter for a player on shift, each facing out over it. */
  stations: L.bar.stations.map((deg, i) => ({ propId: `bar_shift_${i + 1}`, deg, ...barAt(L.bar.stationAt, deg), yaw: barYaw(deg), work: barAt(L.bar.counter, deg) })),
  /** The back shelf under the lean-to (its bottles), and Mango in front of it. */
  shelf: L.bar.shelf.map((deg) => barAt(L.bar.shelfAt, deg)),
  posts: L.bar.posts.map((deg) => barAt(L.bar.postAt, deg)),
  /** The lean-to's two posts, behind the shelf. */
  roofPosts: [-1.5, 1.5].map((side) => step(BAR_C, -2.45, side)),
};
/** Mango the toucan, behind the counter at the back, facing the sea; where you stand to order (at
 *  the counter's front), and how close is close enough. */
export const MANGO = { ...barAt(0.55, 180), yaw: SEA_YAW };
export const MANGO_FRONT: Pt = barAt(L.bar.counter + 0.75, 0);
export const MANGO_REACH = 2.2;
/** How close to a station you stand to take a shift there. */
export const SHIFT_REACH = 1.2;

// --- the firepit, the loungers, the hammocks -------------------------------------------------------

const FIRE_C = at(L.firepit.d, L.firepit.v);
/** The firepit: a ring of stones and four driftwood logs round it, each seat facing the fire. */
export const FIREPIT = {
  x: FIRE_C.x,
  z: FIRE_C.z,
  r: L.firepit.r,
  logs: L.firepit.logs.map((deg, i) => {
    const p = barAtFrom(FIRE_C, L.firepit.logAt, deg);
    return { propId: `seat_beachfire_0${i + 1}`, ...p, rotationY: yawOf(FIRE_C.x - p.x, FIRE_C.z - p.z), approach: barAtFrom(FIRE_C, L.firepit.logAt + 0.7, deg) };
  }),
};
function barAtFrom(c: Pt, r: number, deg: number): Pt {
  return step(c, r * Math.cos(rad(deg)), r * Math.sin(rad(deg)));
}
/** How near the firepit a log seat puts a marshmallow in your hands. */
export const BEACH_FIRE_SEAT_IDS = new Set(FIREPIT.logs.map((l) => l.propId));

const HALF_BODY = 0.41;
/** The loungers: you lie on one, feet to the sea, head inland (each turned a little its own way). */
export const LOUNGERS = L.loungers.map((l, i) => {
  const p = at(l.d, l.v);
  // (the way the head points: inland, turned by `turn`)
  const head = { x: -(SEAWARD.x * Math.cos(l.turn) + ALONG.x * Math.sin(l.turn)), z: -(SEAWARD.z * Math.cos(l.turn) + ALONG.z * Math.sin(l.turn)) };
  return { propId: `seat_lounger_0${i + 1}`, ...p, head, yaw: yawOf(-head.x, -head.z), approach: step(p, 0, i % 2 ? -0.8 : 0.8) };
});
export const PARASOLS = L.parasols.map((p) => at(p.d, p.v));
/** The hammocks' three palms (the only palms that are never felled) and the two hammocks between. */
export const HAMMOCK_PALMS = L.hammockPalms.map((p) => at(p.d, p.v));
export const BEACH_HAMMOCKS = [0, 1].map((i) => {
  const a = HAMMOCK_PALMS[i];
  const b = HAMMOCK_PALMS[i + 1];
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const along = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  const mid = { x: round((a.x + b.x) / 2), z: round((a.z + b.z) / 2) };
  const head = i === 0 ? along : { x: -along.x, z: -along.z };
  return { propId: `seat_beach_hammock_0${i + 1}`, a, b, mid, along, head, approach: step(mid, 0.85, 0) };
});

/** A seat on the beach: what it is drawn from, where its avatar goes, where you step up from. */
export interface BeachSeat {
  propId: string;
  x: number;
  z: number;
  rotationY: number;
  cushion: "stool" | "log" | "lounger" | "hammock";
  style: "stool" | "log" | "blanket";
  approachX: number;
  approachZ: number;
  lie?: { head: Pt; dir: Pt };
}
export const BEACH_SEATS: BeachSeat[] = [
  ...BAR.stools.map((s): BeachSeat => ({ propId: s.propId, x: s.x, z: s.z, rotationY: s.rotationY, cushion: "stool", style: "stool", approachX: s.approach.x, approachZ: s.approach.z })),
  ...FIREPIT.logs.map((s): BeachSeat => ({ propId: s.propId, x: s.x, z: s.z, rotationY: s.rotationY, cushion: "log", style: "log", approachX: s.approach.x, approachZ: s.approach.z })),
  ...LOUNGERS.map((s): BeachSeat => ({ propId: s.propId, x: s.x, z: s.z, rotationY: 0, cushion: "lounger", style: "blanket", approachX: s.approach.x, approachZ: s.approach.z, lie: { head: { x: s.x + s.head.x * HALF_BODY, z: s.z + s.head.z * HALF_BODY }, dir: s.head } })),
  ...BEACH_HAMMOCKS.map((h): BeachSeat => ({ propId: h.propId, x: h.mid.x, z: h.mid.z, rotationY: 0, cushion: "hammock", style: "blanket", approachX: h.approach.x, approachZ: h.approach.z, lie: { head: { x: h.mid.x + h.head.x * HALF_BODY, z: h.mid.z + h.head.z * HALF_BODY }, dir: h.head } })),
];
/** What the action dock offers for them. */
export const BEACH_SEAT_LABELS: Record<string, string> = {
  ...Object.fromEntries(BAR.stools.map((s) => [s.propId, "🍹 Sit at the bar"])),
  ...Object.fromEntries(FIREPIT.logs.map((s) => [s.propId, "🔥 Sit by the fire"])),
  ...Object.fromEntries(LOUNGERS.map((s) => [s.propId, "🏖️ Lie on a lounger"])),
  ...Object.fromEntries(BEACH_HAMMOCKS.map((s) => [s.propId, "😴 Nap in the hammock"])),
};

// --- the shack, the boat, the trees, the rocks -----------------------------------------------------

/** The trader's shack at the pier's landward foot (its door faces the sea), its four corners. */
export const SHACK = (() => {
  const c = at(L.shack.d, L.shack.v);
  return { ...c, w: L.shack.w, dp: L.shack.dp, yaw: SEA_YAW, corners: ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => step(c, (b * L.shack.dp) / 2, (a * L.shack.w) / 2)) };
})();
/** The captain's boat, moored beside the pier's head (out of reach: deep water). */
export const BOAT = { ...onPierAt(PIER_LENGTH + L.boat.along, L.boat.side), yaw: SEA_YAW };
export const PALMS = L.palms.map(([d, v, s]) => ({ ...at(d, v), s }));
export const SHRUBS = L.shrubs.map(([d, v, s]) => ({ ...at(d, v), s }));
export const ROCKS = L.rocks.map(([d, v, s]) => ({ ...at(d, v), s }));
export const DRIFTWOOD = L.driftwood.map((w) => ({ ...at(w.d, w.v), yaw: w.yaw, len: w.len }));
/** Where a traveller arrives, and the spawns round it. */
export const BEACH_ARRIVAL = at(L.arrival.d, L.arrival.v);
export const BEACH_SPAWNS: Pt[] = [BEACH_ARRIVAL, step(BEACH_ARRIVAL, 0.6, 0.9), step(BEACH_ARRIVAL, -0.5, -0.9), step(BEACH_ARRIVAL, 0.9, -0.5)];

export const BEACH_PROPS: PropSpec[] = [
  // (Mango: his pad stands over the bar's middle, a step in front of him, in reach from the counter's front)
  { propId: "mango", x: BAR.x, z: BAR.z, kind: "bartender", color: "#f2a53a", defaultOn: true, approachX: MANGO_FRONT.x, approachZ: MANGO_FRONT.z },
  ...BAR.stations.map((s): PropSpec => ({ propId: s.propId, x: s.work.x, z: s.work.z, kind: "barshift", color: "#e8c27a", defaultOn: true, approachX: s.x, approachZ: s.z })),
];

// (round things are discs: shared/collision.ts `disc`)
const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r, r });
/** Discs along the segment a..b, `r` each. */
const along = (a: Pt, b: Pt, r: number): AABB[] => {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (r * 1.4)));
  return Array.from({ length: n + 1 }, (_, k) => around({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n }, r));
};
export const BEACH_OBSTACLES: AABB[] = [
  // the bar: its counter (an arc of discs), the back shelf, the two light posts at the counter's ends
  ...Array.from({ length: Math.floor((2 * L.bar.arc) / 14) + 1 }, (_, k) => around(barAt(L.bar.counter, -L.bar.arc + k * 14), 0.3)),
  ...BAR.shelf.map((p) => around(p, 0.36)),
  ...BAR.posts.map((p) => around(p, 0.12)),
  ...BAR.roofPosts.map((p) => around(p, 0.12)),
  around(MANGO, 0.3),
  // its stools (you sit on them: a stool's seat is within)
  ...BAR.stools.map((s) => around(s, 0.18)),
  // the firepit's stones and its logs
  around(FIRE_C, L.firepit.r + 0.12),
  ...FIREPIT.logs.map((s) => around(s, 0.24)),
  // the loungers (small discs along each), the parasols' poles
  ...LOUNGERS.flatMap((l) => [-0.5, 0, 0.5].map((t) => around({ x: l.x + l.head.x * t, z: l.z + l.head.z * t }, 0.3))),
  ...PARASOLS.map((p) => around(p, 0.07)),
  // the hammocks and their three palms
  ...HAMMOCK_PALMS.map((p) => around(p, 0.24)),
  ...BEACH_HAMMOCKS.flatMap((h) => [-0.5, 0, 0.5].map((t) => around({ x: h.mid.x + h.along.x * t, z: h.mid.z + h.along.z * t }, 0.28))),
  // the trader's shack (discs round its walls: it stands turned to the coast)
  ...SHACK.corners.flatMap((c, i) => along(c, SHACK.corners[(i + 1) % 4], 0.3)),
  around(SHACK, 0.9),
  // the palms, the shrubs, the headland's rocks, the driftwood
  ...PALMS.map((p) => around(p, 0.24 * p.s)),
  ...SHRUBS.map((p) => around(p, 0.34 * p.s)),
  ...ROCKS.map((p) => around(p, 0.48 * p.s)),
  ...DRIFTWOOD.flatMap((w) => along({ x: w.x - Math.sin(w.yaw) * (w.len / 2 - 0.15), z: w.z - Math.cos(w.yaw) * (w.len / 2 - 0.15) }, { x: w.x + Math.sin(w.yaw) * (w.len / 2 - 0.15), z: w.z + Math.cos(w.yaw) * (w.len / 2 - 0.15) }, 0.17)),
];

/** Everything the builder needs, resolved to the game's (x, z): the grid, how far inland each of its
 *  corners is (the water's shader reads it), and every thing's place. */
export function beachTerrainData() {
  const g = BEACH_GRID;
  const shore: number[] = [];
  for (let k = 0; k <= g.n; k++) for (let i = 0; i <= g.n; i++) shore.push(Math.round(shoreD(-g.half + i * g.cell, -g.half + k * g.cell) * 100) / 100);
  const corner = (along: number, side: number) => onPierAt(along, side);
  return {
    ...gridData(g),
    shore,
    scene: {
      seaward: SEAWARD,
      along: ALONG,
      seaYaw: SEA_YAW,
      wadeDepth: WADE_DEPTH,
      arrival: BEACH_ARRIVAL,
      bar: { x: BAR.x, z: BAR.z, yaw: BAR.yaw, counter: BAR.counter, arc: BAR.arc, top: BAR.top, stools: BAR.stools.map((s) => ({ x: s.x, z: s.z, yaw: s.rotationY })), stations: BAR.stations.map((s) => ({ x: s.x, z: s.z })), shelf: BAR.shelf, posts: BAR.posts, roofPosts: BAR.roofPosts, mango: MANGO },
      firepit: { x: FIREPIT.x, z: FIREPIT.z, r: FIREPIT.r, logs: FIREPIT.logs.map((l) => ({ x: l.x, z: l.z, yaw: l.rotationY })) },
      court: BALL_COURT,
      pier: { deck: PIER.deck, half: PIER.half, headHalf: PIER.headHalf, length: round(PIER_LENGTH), headLen: L.pier.head.len, start: corner(0, 0), end: corner(PIER_LENGTH, 0) },
      shack: SHACK,
      boat: BOAT,
      loungers: LOUNGERS.map((l) => ({ x: l.x, z: l.z, yaw: l.yaw })),
      parasols: PARASOLS,
      hammockPalms: HAMMOCK_PALMS,
      hammocks: BEACH_HAMMOCKS.map((h) => ({ a: h.a, b: h.b })),
      palms: PALMS,
      shrubs: SHRUBS,
      rocks: ROCKS,
      driftwood: DRIFTWOOD,
    },
  };
}
