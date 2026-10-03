import { openApproach } from "./approach";
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
//   The pier            from the west shore out to deep water, walked at the deck's height and
//                       fished from anywhere along it (beachCast: the float lands ahead of you,
//                       on open water); Dune the sea turtle's shack at its foot (he buys every
//                       fish), the captain's boat moored at its head
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
    [8.6, -16.4, 1.05], [9.8, -13.8, 0.95], [11.2, -12.6, 1.08], [9.2, -11.9, 0.90], [12.4, -11.2, 1.00],
    [15.4, -5.2, 1.08], [16.6, -2.6, 0.95], [15.8, 0.6, 1.10], [17.6, 2.4, 0.92], [18.2, -4.6, 1.00], [14.8, 3.4, 1.02],
    [20.6, -1.4, 1.06], [21.8, 1.6, 0.94], [23.2, -0.4, 1.08], [20.2, 3.6, 0.90],
    [15.4, 6.0, 1.04], [17.0, 5.6, 0.92], [14.6, 9.4, 1.06],
    [6.8, -17.8, 1.10], [8.6, 15.4, 1.00]
  ],
  "reef": [[3.2, 14.9], [4.6, 15.9], [3.0, 16.9], [4.4, 19.2], [3.0, 20.4], [4.8, 21.6]],
  "shrubs": [
    [9.2, -15.2, 0.75], [11.0, -13.6, 0.65], [11.8, -10.2, 0.70],
    [14.6, -3.8, 0.80], [16.2, -0.8, 0.70], [17.0, -5.6, 0.66], [16.6, 3.6, 0.72], [13.6, 1.6, 0.78],
    [21.4, 0.2, 0.80], [22.2, -2.0, 0.66], [19.2, 1.8, 0.70],
    [16.0, 7.6, 0.74], [14.0, 11.0, 0.70], [13.8, 4.6, 0.68],
    [7.6, 18.6, 0.72], [8.4, 13.6, 0.66]
  ],
  "rocks": [
    [6.4, 18.0, 1.5], [7.0, 20.4, 1.3], [6.2, 22.2, 1.1], [7.6, 16.2, 0.9], [3.8, 17.9, 0.8],
    [0.4, 17.4, 1.0], [-0.4, 19.6, 1.2], [-1.4, 18.2, 0.9], [-0.6, 15.2, 0.8], [-0.9, 16.4, 0.7],
    [1.2, -17.6, 0.9], [0.4, -19.0, 0.7], [-0.5, -18.2, 0.6], [2.0, -19.6, 0.8]
  ],
  "torches": [[8.2, -4.6], [8.2, 0.6], [5.6, 2.0], [5.8, 5.4], [3.0, -7.7], [3.0, -4.3]],
  "driftwood": [{ "d": 2.2, "v": 6.2, "yaw": 0.7, "len": 1.5 }, { "d": 1.8, "v": -16.4, "yaw": 2.2, "len": 1.3 }, { "d": 1.5, "v": 12.2, "yaw": 1.9, "len": 1.2 }]
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

const SHACK_C = at(L.shack.d, L.shack.v);

/** The trader's shack at the pier's landward foot (its door faces the sea), its four corners. */
export const SHACK = (() => {
  const c = SHACK_C;
  return { ...c, w: L.shack.w, dp: L.shack.dp, yaw: SEA_YAW, corners: ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => step(c, (b * L.shack.dp) / 2, (a * L.shack.w) / 2)) };
})();
/** The captain's boat, moored beside the pier's head (out of reach: deep water). */
export const BOAT = { ...onPierAt(PIER_LENGTH + L.boat.along, L.boat.side), yaw: SEA_YAW };
export const PALMS = L.palms.map(([d, v, s]) => ({ ...at(d, v), s }));
export const SHRUBS = L.shrubs.map(([d, v, s]) => ({ ...at(d, v), s }));
export const ROCKS = L.rocks.map(([d, v, s]) => ({ ...at(d, v), s }));
/** The tiki torches (bamboo poles, lit from dusk): by the bar, the firepit and the pier's foot. */
export const TORCHES = L.torches.map(([d, v]) => at(d, v));
export const DRIFTWOOD = L.driftwood.map((w) => ({ ...at(w.d, w.v), yaw: w.yaw, len: w.len }));
/** Where a traveller arrives, and the spawns round it. */
export const BEACH_ARRIVAL = at(L.arrival.d, L.arrival.v);
export const BEACH_SPAWNS: Pt[] = [BEACH_ARRIVAL, step(BEACH_ARRIVAL, 0.6, 0.9), step(BEACH_ARRIVAL, -0.5, -0.9), step(BEACH_ARRIVAL, 0.9, -0.5)];


// --- fishing: a cast from where you stand ----------------------------------------------------------

/** How far out the float lands (m), and how deep the water must be there. */
export const BEACH_CAST = 1.9;
export const BEACH_CAST_DEPTH = 0.3;
/** Open water for a float at (x, z): the sea, deep enough, and not under the pier's deck. */
/** Under the captain's boat, moored at the pier's head (no float lands on its deck). */
const underBoat = (x: number, z: number) => {
  const dx = x - BOAT.x;
  const dz = z - BOAT.z;
  return Math.abs(dx * SEAWARD.x + dz * SEAWARD.z) < 4.7 && Math.abs(dx * ALONG.x + dz * ALONG.z) < 1.9;
};
const floats = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) < L.half - 0.3 && beachGroundY(x, z) < SEA_Y - BEACH_CAST_DEPTH && pierInside(x, z) < -0.15 && !underBoat(x, z);
/** A cast from (x, z) facing (fx, fz): where the float lands, straight ahead or a little to either
 *  side (never behind or beside the angler), or null where there is no water for it. From the pier's
 *  edge or its head, or from the waterline (wade in a step and the surf is in reach). */
export function beachCast(x: number, z: number, fx: number, fz: number): Pt | null {
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-6) return null;
  const f = { x: fx / fl, z: fz / fl };
  for (const turn of [0, 0.35, -0.35, 0.7, -0.7]) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const d = { x: f.x * c - f.z * s, z: f.x * s + f.z * c };
    for (const reach of [BEACH_CAST, BEACH_CAST + 0.6, BEACH_CAST - 0.5]) {
      const p = { x: x + d.x * reach, z: z + d.z * reach };
      if (floats(p.x, p.z)) return { x: round(p.x), z: round(p.z) };
    }
  }
  return null;
}

// --- the captain -----------------------------------------------------------------------------------

/** Captain Brine the walrus at the pier's head, beside his boat (he faces up the pier, toward whoever
 *  comes); where you stand to talk to him, and where the boat sets you down when it brings you back. */
const BRINE_AT = onPierAt(PIER_LENGTH - 0.85, PIER.headHalf - 0.75);
export const BRINE_FRONT: Pt = onPierAt(PIER_LENGTH - 1.75, PIER.headHalf - 1.55);
export const BRINE = { ...BRINE_AT, yaw: yawOf(BRINE_FRONT.x - BRINE_AT.x, BRINE_FRONT.z - BRINE_AT.z) };
export const BRINE_REACH = 2.0;
export const PIER_RETURN: Pt = onPierAt(PIER_LENGTH - 2.4, 0.2);

// --- the trader ------------------------------------------------------------------------------------

/** Dune the old sea turtle, at his shack's counter window (it faces the sea), and where you stand
 *  to trade with him. */
export const DUNE = { ...step(SHACK_C, L.shack.dp / 2 - 0.3, 0), yaw: SEA_YAW };
export const DUNE_FRONT: Pt = step(SHACK_C, L.shack.dp / 2 + 1.0, 0);
export const DUNE_REACH = 2.0;

export const BEACH_PROPS: PropSpec[] = [
  { propId: "brine", x: BRINE.x, z: BRINE.z, kind: "captain", color: "#27405f", defaultOn: true, approachX: BRINE_FRONT.x, approachZ: BRINE_FRONT.z },
  { propId: "dune", x: DUNE.x, z: DUNE.z, kind: "angler", color: "#7fa86b", defaultOn: true, approachX: DUNE_FRONT.x, approachZ: DUNE_FRONT.z },
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
/** A reef node's rock (shared/caverns_mining.ts ORE_KINDS.reef.radius: kept here so the layout stands alone). */
export const REEF_RADIUS = 0.6;
export const BEACH_OBSTACLES: AABB[] = [
  // the bar: its counter (an arc of discs), the back shelf, the two light posts at the counter's ends
  ...Array.from({ length: Math.floor((2 * L.bar.arc) / 14) + 1 }, (_, k) => around(barAt(L.bar.counter, -L.bar.arc + k * 14), 0.3)),
  ...BAR.shelf.map((p) => around(p, 0.36)),
  ...BAR.posts.map((p) => around(p, 0.12)),
  ...BAR.roofPosts.map((p) => around(p, 0.12)),
  around(MANGO, 0.3),
  // Captain Brine at the pier's head
  around(BRINE_AT, 0.36),
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
  ...TORCHES.map((p) => around(p, 0.07)),
  // the fossil reef rock's six nodes
  ...L.reef.map(([d, v]) => around(at(d, v), REEF_RADIUS * 0.6)),
  ...DRIFTWOOD.flatMap((w) => along({ x: w.x - Math.sin(w.yaw) * (w.len / 2 - 0.15), z: w.z - Math.cos(w.yaw) * (w.len / 2 - 0.15) }, { x: w.x + Math.sin(w.yaw) * (w.len / 2 - 0.15), z: w.z + Math.cos(w.yaw) * (w.len / 2 - 0.15) }, 0.17)),
];

// --- the Coconut Palms you fell (shared/worlds/trees.ts; the hammocks' three are never felled) ---------
/** A palm's trunk as a collider, at its size. */
export const palmTrunk = (s: number) => 0.24 * s;
/** Open sand for a feller to stand on: clear of the water, the map's rim and everything that stands. */
function beachOpen(x: number, z: number): boolean {
  const body = 0.34;
  if (Math.max(Math.abs(x), Math.abs(z)) > L.half - 0.9 || beachBlocked(x, z)) return false;
  return BEACH_OBSTACLES.every((o) => {
    const cx = (o.minX + o.maxX) / 2;
    const cz = (o.minZ + o.maxZ) / 2;
    return Math.hypot(x - cx, z - cz) > (o.r ?? Math.max(o.maxX - o.minX, o.maxZ - o.minZ) / 2) + body;
  });
}
/** Every palm of the grove, felled from the seaward side (or the nearest open turn off it): ids
 *  `palm_<n>` by the layout's order (a palm added in the middle renames the ones after it, which only
 *  resets their saved stage). */
export const BEACH_TREES = PALMS.map((p, i) => {
  const a = openApproach(p, palmTrunk(p.s) + 0.63, { x: p.x + SEAWARD.x * 6, z: p.z + SEAWARD.z * 6 }, beachOpen);
  return { id: `palm_${i + 1}`, kind: "palm" as const, x: p.x, z: p.z, approachX: a.x, approachZ: a.z, size: p.s };
});
BEACH_PROPS.push(...BEACH_TREES.map((t): PropSpec => ({ propId: `tree_${t.id}`, x: t.x, z: t.z, kind: "tree", color: "#4f9a5a", defaultOn: true, approachX: t.approachX, approachZ: t.approachZ })));

// --- the fossil reef rock in the headland's seaward face (prospected as the caverns' nodes are) ------
/** A reef node: the caverns' OreNode shape, on this map (shared/worlds/caverns.ts spreads them into
 *  its registry, `ORE_NODE_AT`, so the prospecting works here as it does down there). */
export const REEF_NODES = L.reef.map(([d, v], i) => {
  const p = at(d, v);
  const a = openApproach(p, REEF_RADIUS + 0.75, { x: p.x + SEAWARD.x * 6, z: p.z + SEAWARD.z * 6 }, beachOpen);
  return { id: `reef_${i + 1}`, kind: "reef" as const, map: "sunset_beach" as const, x: p.x, z: p.z, y: round(beachLand(p.x, p.z)), face: { x: SEAWARD.x, z: SEAWARD.z }, approach: a, wall: false };
});
BEACH_PROPS.push(...REEF_NODES.map((n): PropSpec => ({ propId: `ore_${n.id}`, x: n.x, z: n.z, kind: "ore", color: "#ffd9a0", defaultOn: true, approachX: n.approach.x, approachZ: n.approach.z })));

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
      dune: DUNE,
      boat: BOAT,
      loungers: LOUNGERS.map((l) => ({ x: l.x, z: l.z, yaw: l.yaw })),
      parasols: PARASOLS,
      hammockPalms: HAMMOCK_PALMS,
      hammocks: BEACH_HAMMOCKS.map((h) => ({ a: h.a, b: h.b })),
      palms: PALMS,
      shrubs: SHRUBS,
      rocks: ROCKS,
      reef: REEF_NODES.map((n) => ({ x: n.x, z: n.z })),
      driftwood: DRIFTWOOD,
      torches: TORCHES,
    },
  };
}
