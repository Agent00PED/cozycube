import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";

// The Open Sea (the map "open_sea", docs/beach-design.md section 4): a map of its own under Sunset
// Beach, reached only with a ticket from Captain Brine at the pier's head. The map IS the captain's
// boat: a sturdy wooden fishing boat, 11 m long, anchored in open water, the sea running out on every
// side. Its deck never moves (seats, colliders and casts stay simple); the swell moves round it.
//
// The boat lies across the camera's view (its bow to the north-east), so its whole length shows.
// Written in the boat's own frame: `a` metres toward the bow, `b` metres to starboard (the camera's
// side); `onDeck(a, b)` is the game's (x, z).
//
//   the deck        flat, at DECK_Y over the water, inside the bulwarks: walked from stern to bow
//   the wheelhouse  aft; Captain Brine at the wheel in front of it (the way back to the pier)
//   the rails       fished from anywhere along them (seaCast: the float lands out on the water
//                   beyond the rail you face), by hand only, with an Expedition rod (T5) or better
//   the bench       along the port side, and a seat at the bow, for whoever rides along

type Pt = { x: number; z: number };
const S = Math.SQRT1_2;
const round = (v: number) => Math.round(v * 1000) / 1000;

export const SEA_LAYOUT = /* layout:begin */ {
  "half": 7,
  "deckY": 0.6,
  "boat": { "stern": -5.4, "bow": 5.6, "beam": 1.6, "taperFrom": 1.8, "bowBeam": 0.35 },
  "wheelhouse": { "a0": -4.5, "a1": -2.6, "half": 0.95 },
  "captain": { "a": -2.05, "b": 0.0 },
  "mast": { "a": 0.3, "b": 0.0 },
  "arrival": { "a": -0.9, "b": 0.6 },
  "benches": [{ "a": 0.9, "b": -1.12 }, { "a": 1.7, "b": -1.12 }, { "a": 2.5, "b": -1.12 }],
  "bowSeat": { "a": 4.7, "b": 0.0 },
  "crates": [{ "a": -1.3, "b": -1.05 }, { "a": 3.4, "b": 0.75 }],
  "stacks": [[-8.5, -8.5, 2.0], [-13, -2, 1.4], [-1.5, -13.5, 1.7], [12.5, -6.5, 1.1]]
} /* layout:end */;

const L = SEA_LAYOUT;
/** Toward the bow (the north-east), and to starboard (the camera's side). */
export const BOW: Pt = { x: S, z: -S };
export const STARBOARD: Pt = { x: S, z: S };
/** The game's (x, z) of a point `a` toward the bow and `b` to starboard of the boat's middle. */
export const onDeck = (a: number, b: number): Pt => ({ x: round(BOW.x * a + STARBOARD.x * b), z: round(BOW.z * a + STARBOARD.z * b) });
/** (x, z) in the boat's frame. */
export const boatOf = (x: number, z: number) => ({ a: x * BOW.x + z * BOW.z, b: x * STARBOARD.x + z * STARBOARD.z });
/** The heading that faces the bow. */
export const BOW_YAW = round(Math.atan2(BOW.x, BOW.z));

/** The deck's half-beam at `a` (full amidships and aft, narrowing to the bow). */
export function halfBeam(a: number): number {
  const B = L.boat;
  if (a <= B.taperFrom) return B.beam;
  const t = Math.min(1, (a - B.taperFrom) / (B.bow - B.taperFrom));
  return B.beam + (B.bowBeam - B.beam) * t * t;
}
/** How far inside the deck (x, z) is (negative: over the water). */
export function deckInside(x: number, z: number): number {
  const { a, b } = boatOf(x, z);
  return Math.min(halfBeam(a) - Math.abs(b), a - L.boat.stern, L.boat.bow - a);
}
export const DECK_Y = L.deckY;
/** Where feet go: the deck. */
export const seaFloorY = (x: number, z: number): number => (deckInside(x, z) >= 0 ? DECK_Y : 0);
/** Off the deck (the bulwarks keep you aboard). */
export const seaBlocked = (x: number, z: number): boolean => deckInside(x, z) < 0.22;

/** How far out beyond the rail the float lands, and how near the rail you stand to cast. */
export const SEA_CAST_OUT = 1.6;
export const SEA_RAIL_REACH = 1.5;
/** A cast from the deck at (x, z) facing (fx, fz): the float out on the water beyond the rail that
 *  way, or null (too far from a rail, or facing along the deck). */
export function seaCast(x: number, z: number, fx: number, fz: number): Pt | null {
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-6 || deckInside(x, z) < 0 || deckInside(x, z) > SEA_RAIL_REACH) return null;
  const f = { x: fx / fl, z: fz / fl };
  for (const turn of [0, 0.35, -0.35, 0.7, -0.7]) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const d = { x: f.x * c - f.z * s, z: f.x * s + f.z * c };
    for (let t = 0.3; t <= 4.6; t += 0.15) {
      const p = { x: x + d.x * t, z: z + d.z * t };
      if (deckInside(p.x, p.z) <= -SEA_CAST_OUT) return Math.max(Math.abs(p.x), Math.abs(p.z)) < L.half + 2 ? { x: round(p.x), z: round(p.z) } : null;
    }
  }
  return null;
}

/** Captain Brine at the wheel, facing the bow; where you stand to talk to him. */
export const SEA_CAPTAIN = { ...onDeck(L.captain.a, L.captain.b), yaw: BOW_YAW };
export const SEA_CAPTAIN_FRONT: Pt = onDeck(L.captain.a + 1.0, L.captain.b + 0.2);
export const CAPTAIN_REACH = 2.0;
/** Where a traveller comes aboard. */
export const SEA_ARRIVAL = onDeck(L.arrival.a, L.arrival.b);
export const SEA_SPAWNS: Pt[] = [SEA_ARRIVAL, onDeck(-0.6, -0.7), onDeck(1.2, 0.5), onDeck(1.5, -0.3)];

/** The seats aboard: three on the port bench (facing the camera's side), one at the bow (facing
 *  ahead). */
export interface SeaSeat {
  propId: string;
  x: number;
  z: number;
  rotationY: number;
  approachX: number;
  approachZ: number;
}
const yawOf = (d: Pt) => round(Math.atan2(d.x, d.z));
export const SEA_SEATS: SeaSeat[] = [
  ...L.benches.map((s, i): SeaSeat => {
    const p = onDeck(s.a, s.b);
    const stern = s.a < -4;
    const ap = stern ? onDeck(s.a + 0.75, s.b) : onDeck(s.a, s.b + 0.75);
    return { propId: `seat_boat_0${i + 1}`, ...p, rotationY: yawOf(stern ? BOW : STARBOARD), approachX: ap.x, approachZ: ap.z };
  }),
  (() => {
    const p = onDeck(L.bowSeat.a, L.bowSeat.b);
    const ap = onDeck(L.bowSeat.a - 0.75, L.bowSeat.b);
    return { propId: "seat_boat_bow", ...p, rotationY: BOW_YAW, approachX: ap.x, approachZ: ap.z };
  })(),
];
export const SEA_SEAT_LABELS: Record<string, string> = Object.fromEntries(SEA_SEATS.map((s) => [s.propId, s.propId === "seat_boat_bow" ? "🌊 Sit at the bow" : "⛵ Sit on the bench"]));

export const SEA_PROPS: PropSpec[] = [{ propId: "brine_sea", x: SEA_CAPTAIN.x, z: SEA_CAPTAIN.z, kind: "captain", color: "#27405f", defaultOn: true, approachX: SEA_CAPTAIN_FRONT.x, approachZ: SEA_CAPTAIN_FRONT.z }];

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r, r });
export const SEA_OBSTACLES: AABB[] = [
  // the wheelhouse (discs over its floor: it lies across the map's axes)
  ...[-4.05, -3.55, -3.05].flatMap((a) => [-0.45, 0.45].map((b) => around(onDeck(a, b), 0.62))),
  around(SEA_CAPTAIN, 0.34),
  around(onDeck(L.mast.a, L.mast.b), 0.14),
  ...L.crates.map((c) => around(onDeck(c.a, c.b), 0.34)),
  ...SEA_SEATS.map((s) => around(s, 0.2)),
];

/** Everything the builder needs (scripts/blender/build_sea.py), resolved: the deck's outline, the
 *  boat's frame, what stands on it, the far rock stacks. */
export function seaSceneData() {
  const outline: Pt[] = [];
  const B = L.boat;
  const steps = 22;
  for (let k = 0; k <= steps; k++) {
    const a = B.stern + ((B.bow - B.stern) * k) / steps;
    outline.push({ x: a, z: halfBeam(a) });
  }
  return {
    half: L.half,
    deckY: DECK_Y,
    bow: BOW,
    starboard: STARBOARD,
    bowYaw: BOW_YAW,
    boat: B,
    /** The starboard edge from stern to bow, in the boat's frame ([a, half-beam]); port mirrors it. */
    outline: outline.map((p) => [round(p.x), round(p.z)]),
    wheelhouse: L.wheelhouse,
    captain: L.captain,
    mast: L.mast,
    benches: L.benches,
    bowSeat: L.bowSeat,
    crates: L.crates,
    stacks: L.stacks,
  };
}
