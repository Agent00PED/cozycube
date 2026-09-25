// The campfire's 3-hit wood-chopping combo, as both sides see it: the server rolls each stroke's
// meter (rollChopStroke) and judges a swing on its own clock (judgeChop); the client draws the very
// same meter from the same functions, so what you see is what is judged.
//
// On every stroke the needle ping-pongs across the meter, bouncing off each end (it never runs out
// at the right edge: the stroke only ends when you swing, or after a few passes).
//
//   Stroke 1  Notch Cut      the slowest needle (x1.0), a wide sweet spot swinging back and forth
//   Stroke 2  Wedge Split    quicker (x1.4); the sweet spot holds still
//   Stroke 3  Clean Cleave   the quickest (x1.85), at a narrow golden sweet spot: the real test
//
// A swing is judged a little generously (CHOP_GRACE either side of the green), at the needle's
// place when it was made: the client samples it at the click, and the server checks that time is
// one the connection could have given (see HangoutRoom's CHOP_STOP).
//
// Each stroke has a wood knot too, a red patch on the meter: swinging into it stuns the axe (the
// combo is lost, and the block needs a moment before the next try). And the log on the block is
// one of three (rolled once per combo):
//
//   Soft Pine    a wider sweet spot: one Firewood
//   Hard Oak     the knots creep along the meter: two Firewood
//   Golden Log   one in ten: a Golden Charcoal (double the fuel) and a bonus

export type ChopStrokeNo = 1 | 2 | 3;
export type ChopLog = "pine" | "oak" | "golden";

export const CHOP_LOGS: Record<ChopLog, { name: string; emoji: string; firewood: number; charcoal: number; bonus: number; blurb: string }> = {
  pine: { name: "Soft Pine", emoji: "🌲", firewood: 1, charcoal: 0, bonus: 0, blurb: "Soft wood: a wide sweet spot" },
  oak: { name: "Hard Oak", emoji: "🌳", firewood: 2, charcoal: 0, bonus: 5, blurb: "Hard wood: its knots move" },
  golden: { name: "Golden Log", emoji: "✨", firewood: 0, charcoal: 1, bonus: 15, blurb: "A rare golden log: Golden Charcoal burns twice as long" },
};

export interface ChopStroke {
  stroke: ChopStrokeNo;
  log: ChopLog;
  /** How long the stroke waits for a swing before it counts as a miss. */
  duration: number;
  /** The sweet spot: its centre and width (fractions of the meter), and its swing (amplitude and period in s; 0: still). */
  zoneCenter: number;
  zoneWidth: number;
  zoneSwing: number;
  zonePeriod: number;
  /** The needle's round trip, end to end and back (s). */
  needlePeriod: number;
  /** The wood knot: where it starts, how wide it is, and (Hard Oak) how far and how fast it creeps. */
  knotFrom: number;
  knotWidth: number;
  knotSwing: number;
  knotPeriod: number;
}

export const CHOP_STROKE_NAMES: Record<ChopStrokeNo, string> = { 1: "Notch Cut", 2: "Wedge Split", 3: "Clean Cleave" };
/** How far outside the green a swing still counts (a fraction of the meter: 5%). */
export const CHOP_GRACE = 0.05;
/** The needle's round trip on the first stroke (s), and each stroke's speed on it. */
const BASE_PERIOD = 3.2;
export const CHOP_SPEED: Record<ChopStrokeNo, number> = { 1: 1.0, 2: 1.4, 3: 1.85 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Where the needle is, `t` seconds into the stroke: a ping-pong from 0 to 1 and back. */
export function chopMarker(s: ChopStroke, t: number): number {
  const phase = (t / s.needlePeriod) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/** The sweet spot, `t` seconds into the stroke: [from, to]. */
export function chopZone(s: ChopStroke, t: number): [number, number] {
  const c = s.zoneCenter + (s.zonePeriod > 0 ? s.zoneSwing * Math.sin((2 * Math.PI * t) / s.zonePeriod) : 0);
  return [clamp01(c - s.zoneWidth / 2), clamp01(c + s.zoneWidth / 2)];
}

/** The knot, `t` seconds into the stroke: [from, to]. */
export function chopKnot(s: ChopStroke, t: number): [number, number] {
  const from = s.knotFrom + (s.knotPeriod > 0 ? s.knotSwing * Math.sin((2 * Math.PI * t) / s.knotPeriod) : 0);
  return [clamp01(from), clamp01(from + s.knotWidth)];
}

/** A swing `t` seconds into the stroke: into the sweet spot (a little grace either side), into the knot, or neither. */
export function judgeChop(s: ChopStroke, t: number): "hit" | "knot" | "miss" {
  const m = chopMarker(s, t);
  const [a, b] = chopZone(s, t);
  // the sweet spot wins where the two touch: a creeping knot never steals a clean swing
  if (m >= a - CHOP_GRACE && m <= b + CHOP_GRACE) return "hit";
  const [k0, k1] = chopKnot(s, t);
  return m >= k0 && m <= k1 ? "knot" : "miss";
}

/** Which log goes on the block for a combo. */
export function rollChopLog(rand: () => number = Math.random): ChopLog {
  const r = rand();
  return r < 0.1 ? "golden" : r < 0.45 ? "oak" : "pine";
}

/** A fresh stroke's meter (the server rolls it; `rand` is Math.random there). */
export function rollChopStroke(stroke: ChopStrokeNo, log: ChopLog, rand: () => number = Math.random): ChopStroke {
  const wide = log === "pine" ? 1.3 : log === "golden" ? 0.9 : 1;
  const creep = log === "oak" ? { knotSwing: 0.12, knotPeriod: 2.2 + rand() * 0.8 } : { knotSwing: 0, knotPeriod: 0 };
  // the stroke waits three round trips of the needle for a swing
  const make = (m: Omit<ChopStroke, "stroke" | "log" | "duration" | "knotSwing" | "knotPeriod">): ChopStroke => ({ stroke, log, duration: m.needlePeriod * 3, ...m, ...creep });
  if (stroke === 1) {
    // a wide sweet spot swinging about the middle; the knot waits at one end
    const zoneCenter = 0.45 + rand() * 0.1;
    const early = rand() < 0.5;
    return make({ zoneCenter, zoneWidth: 0.22 * wide, zoneSwing: 0.17, zonePeriod: 1.6, needlePeriod: BASE_PERIOD / CHOP_SPEED[1], knotFrom: early ? 0.02 : 0.9, knotWidth: 0.07 });
  }
  if (stroke === 2) {
    // a still sweet spot, the knot beside it (clear of the grace either side)
    const zoneCenter = 0.28 + rand() * 0.44;
    const side = zoneCenter < 0.5 ? 1 : -1;
    return make({ zoneCenter, zoneWidth: 0.2 * wide, zoneSwing: 0, zonePeriod: 0, needlePeriod: BASE_PERIOD / CHOP_SPEED[2], knotFrom: clamp01(zoneCenter + side * 0.24 - 0.035), knotWidth: 0.07 });
  }
  // a narrow golden sweet spot with the knot just before it, the needle at its quickest
  const zoneCenter = 0.58 + rand() * 0.22;
  return make({ zoneCenter, zoneWidth: 0.09 * wide, zoneSwing: 0, zonePeriod: 0, needlePeriod: BASE_PERIOD / CHOP_SPEED[3], knotFrom: zoneCenter - 0.18, knotWidth: 0.07 });
}
