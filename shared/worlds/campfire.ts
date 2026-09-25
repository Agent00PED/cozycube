import type { AABB } from "../collision";
import { CUSHIONS, napPose } from "../seats";
import type { PropSpec, SeatSpec } from "./lounge";

// The Starlight Campfire: a floating island of midnight forest soil and moss, a bonfire ringed by
// four fallen-log benches in the middle, a pond with a little fishing pier on the east, a canvas
// tipi on the north-west, a hammock slung between two pines on the open west side, a woodpile on
// the north, pines along the back edges and a rustic fence along the front ones. Authored ONCE, here:
//
//   CAMPFIRE_LAYOUT   where everything is (plain JSON between the markers: scripts/blender/
//                     build_campfire.py reads the very same text to build campfire.glb, so the
//                     model and the walkable floor can never disagree)
//   CAMP_SEATS        the logs (sit, facing the fire), the hammock and the tent (lie, eyes shut)
//   CAMP_PROPS        the bonfire (roast and grill) and the fishing spot at the end of the pier
//   CAMP_OBSTACLES    what you walk round; CAMP_SPAWNS  where you arrive (the path facing the fire)
//
// Coordinates are the game's: x right, z toward the camera's side, heights in y; the island is
// 2 * half across, its top at y = 0. The camera looks from +x +z, so the tall things (pines, the
// tipi) stand along the back edges (-x, -z) and only low ones (a fence, rocks) along the front.

export const CAMPFIRE_LAYOUT = /* layout:begin */ {
  "half": 8,
  "fire": { "x": 0, "z": 0, "ring": 0.62 },
  "clearing": { "x": 0, "z": 0, "r": 3.4 },
  "logs": [
    { "x": -1.66, "z": -1.66 },
    { "x": 1.66, "z": -1.66 },
    { "x": -1.66, "z": 1.66 },
    { "x": 1.66, "z": 1.66 }
  ],
  "logLength": 1.5,
  "pond": { "x0": 4.0, "x1": 7.4, "z0": -3.8, "z1": 2.4, "round": 1.3, "depth": 0.5, "water": -0.18 },
  "pier": { "x0": 3.2, "x1": 5.9, "z": -0.7, "half": 0.55, "deck": 0.03 },
  "fishing": { "stand": { "x": 5.5, "z": -0.7 }, "bobber": { "x": 6.75, "z": -0.7 } },
  "lantern": { "x": 5.82, "z": -1.2 },
  "tent": { "x": -4.7, "z": -3.7, "r": 1.35, "h": 3.0, "opening": 70 },
  "hammock": { "a": { "x": -6.4, "z": 5.4 }, "b": { "x": -3.9, "z": 2.9 }, "top": 1.25 },
  "woodpile": { "x": 0.6, "z": -5.3 },
  "trees": [
    { "x": -6.8, "z": -7.0, "s": 1.1 },
    { "x": -4.4, "z": -7.1, "s": 0.9 },
    { "x": -2.6, "z": -7.1, "s": 1.15 },
    { "x": -0.2, "z": -7.2, "s": 0.85 },
    { "x": 3.6, "z": -7.0, "s": 1.0 },
    { "x": 5.6, "z": -7.1, "s": 1.2 },
    { "x": 7.1, "z": -5.0, "s": 0.8 },
    { "x": -7.1, "z": -4.8, "s": 1.0 },
    { "x": -7.0, "z": -1.9, "s": 1.15 },
    { "x": -7.1, "z": 0.6, "s": 0.9 },
    { "x": 4.9, "z": 5.9, "s": 0.6 },
    { "x": 6.6, "z": 4.2, "s": 0.55 },
    { "x": -5.0, "z": 6.8, "s": 0.55 }
  ],
  "rocks": [
    { "x": 3.9, "z": -3.4, "s": 0.7 },
    { "x": 3.95, "z": 1.9, "s": 0.8 },
    { "x": 7.55, "z": -3.3, "s": 0.6 },
    { "x": 7.55, "z": 2.0, "s": 0.55 },
    { "x": -3.2, "z": 5.8, "s": 0.9 },
    { "x": 5.8, "z": -5.9, "s": 0.7 },
    { "x": -5.9, "z": 2.1, "s": 0.6 },
    { "x": 2.8, "z": 6.4, "s": 0.5 },
    { "x": -6.2, "z": -6.2, "s": 0.8 }
  ],
  "fence": { "at": 7.7, "zFrom": 3.0, "xFrom": -7.5, "to": 7.5, "post": 1.25 },
  "paths": [
    { "points": [[0, 7.4], [0, 3.2]], "w": 1.3 },
    { "points": [[-2.5, -2.1], [-3.1, -2.45]], "w": 1.0 },
    { "points": [[-0.8, 4.9], [-3.9, 5.0]], "w": 0.9 }
  ],
  "spawns": [
    { "x": 0, "z": 3.3 },
    { "x": -0.9, "z": 3.9 },
    { "x": 0.9, "z": 3.9 },
    { "x": 0, "z": 4.6 },
    { "x": -1.6, "z": 4.8 },
    { "x": 1.6, "z": 4.8 }
  ]
} /* layout:end */;

const L = CAMPFIRE_LAYOUT;
type Pt = { x: number; z: number };

export const CAMPFIRE_HALF = L.half;
/** The camera fits the island with a margin, like the lounge (LOFT_FRAME). */
export const CAMPFIRE_FRAME = { x: 0, z: 0, size: L.half * 2 + 0.8 };

/** Close enough to the fire to hold a skewer over it (the log benches are well inside). */
export const BONFIRE_REACH = 2.9;
/** Close enough to the end of the pier to cast. */
export const FISHING_REACH = 1.1;
/** Players seated within this of someone playing the guitar sway along. */
export const GUITAR_LISTEN = 5;

/** The heading that faces from (x, z) toward `to` (heading 0 faces +z). */
const facing = (x: number, z: number, to: Pt) => Math.atan2(to.x - x, to.z - z);
const unit = (x: number, z: number) => {
  const d = Math.hypot(x, z) || 1;
  return { x: x / d, z: z / d };
};

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
  // the four log benches round the fire, each facing it; you get up on the far side from it
  ...L.logs.map((log, i): SeatSpec => {
    const out = unit(log.x - L.fire.x, log.z - L.fire.z);
    return { propId: `seat_log_0${i + 1}`, x: log.x, z: log.z, rotationY: facing(log.x, log.z, L.fire), cushion: "log", approachX: log.x + out.x * 1.25, approachZ: log.z + out.z * 1.25 };
  }),
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

/** Where a lie seat puts the avatar (its soles, heading and height), derived from its cushion. */
export function lieSeatPose(seat: SeatSpec & { lie?: LieSpec }) {
  return seat.lie ? napPose(CUSHIONS[seat.cushion], seat.lie.head, seat.lie.dir) : null;
}

export const CAMP_PROPS: PropSpec[] = [
  // the bonfire: walk up (or sit on a log) and roast a marshmallow or grill a skewer
  { propId: "bonfire", x: L.fire.x, z: L.fire.z, kind: "bonfire", color: "#ff8c32", defaultOn: true, approachX: L.fire.x, approachZ: L.fire.z + 1.35 },
  // the end of the pier: cast a line into the pond
  { propId: "fishing_spot", x: L.pier.x1, z: L.pier.z, kind: "fishing", color: "#7fb7d6", defaultOn: true, approachX: L.fishing.stand.x, approachZ: L.fishing.stand.z },
];

// --- what you walk round ----------------------------------------------------------------------

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });

/** The two pines the hammock hangs between, at its ends. */
export const HAMMOCK_PINES: Pt[] = [L.hammock.a, L.hammock.b];

export const CAMP_OBSTACLES: AABB[] = [
  // the fire and its stone ring
  around(L.fire, L.fire.ring + 0.1),
  // the log benches (each lies across a diagonal: its box is its footprint's)
  ...L.logs.map((log) => around(log, (L.logLength / 2) * Math.SQRT1_2 + 0.02)),
  // the pond, less the pier: north of it, south of it, and off its end
  { minX: L.pond.x0, maxX: L.pond.x1, minZ: L.pond.z0, maxZ: L.pier.z - L.pier.half },
  { minX: L.pond.x0, maxX: L.pond.x1, minZ: L.pier.z + L.pier.half, maxZ: L.pond.z1 },
  { minX: L.pier.x1, maxX: L.pond.x1, minZ: L.pier.z - L.pier.half, maxZ: L.pier.z + L.pier.half },
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
];

export const CAMP_SPAWNS: Pt[] = L.spawns;
