// The campfire's 3-hit wood-chopping combo, as both sides see it: the server rolls each stroke's
// meter (rollChopStroke) and judges a swing on its own clock (judgeChop); the client draws the very
// same meter from the same functions, so what you see is what is judged.
//
//   Stroke 1  Notch Cut      the marker runs the meter once; a wide sweet spot swings back and forth
//   Stroke 2  Wedge Split    the needle swings to and fro, fast; the sweet spot holds still
//   Stroke 3  Clean Cleave   the marker runs once, quicker; a narrow golden sweet spot
//
// Each stroke has a wood knot too, a red patch on the meter: swinging into it stuns the axe (the
// combo is lost, and the block needs a moment before the next try).

export type ChopStrokeNo = 1 | 2 | 3;

export interface ChopStroke {
  stroke: ChopStrokeNo;
  /** How long the stroke's meter runs before the swing is a miss. */
  duration: number;
  /** The sweet spot: its centre and width (fractions of the meter), and its swing (amplitude and period in s; 0: still). */
  zoneCenter: number;
  zoneWidth: number;
  zoneSwing: number;
  zonePeriod: number;
  /** The needle: 0 runs it once across the meter over `duration`; otherwise it swings to and fro with this period (s). */
  needlePeriod: number;
  /** The wood knot: where it starts and how wide it is. */
  knotFrom: number;
  knotWidth: number;
}

export const CHOP_STROKE_NAMES: Record<ChopStrokeNo, string> = { 1: "Notch Cut", 2: "Wedge Split", 3: "Clean Cleave" };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Where the needle is, `t` seconds into the stroke. */
export function chopMarker(s: ChopStroke, t: number): number {
  if (s.needlePeriod > 0) return 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / s.needlePeriod);
  return clamp01(t / s.duration);
}

/** The sweet spot, `t` seconds into the stroke: [from, to]. */
export function chopZone(s: ChopStroke, t: number): [number, number] {
  const c = s.zoneCenter + (s.zonePeriod > 0 ? s.zoneSwing * Math.sin((2 * Math.PI * t) / s.zonePeriod) : 0);
  return [clamp01(c - s.zoneWidth / 2), clamp01(c + s.zoneWidth / 2)];
}

/** A swing `t` seconds into the stroke: into the sweet spot (a little grace either side), into the knot, or neither. */
export function judgeChop(s: ChopStroke, t: number): "hit" | "knot" | "miss" {
  const m = chopMarker(s, t);
  if (m >= s.knotFrom && m <= s.knotFrom + s.knotWidth) return "knot";
  const [a, b] = chopZone(s, t);
  return m >= a - 0.012 && m <= b + 0.012 ? "hit" : "miss";
}

/** A fresh stroke's meter (the server rolls it; `rand` is Math.random there). */
export function rollChopStroke(stroke: ChopStrokeNo, rand: () => number = Math.random): ChopStroke {
  if (stroke === 1) {
    // a wide sweet spot swinging about the middle; the knot waits at one end
    const zoneCenter = 0.45 + rand() * 0.1;
    const early = rand() < 0.5;
    return { stroke, duration: 1.9, zoneCenter, zoneWidth: 0.22, zoneSwing: 0.17, zonePeriod: 1.25, needlePeriod: 0, knotFrom: early ? 0.05 : 0.86, knotWidth: 0.08 };
  }
  if (stroke === 2) {
    // a fast swinging needle over a still sweet spot, the knot right beside it
    const zoneCenter = 0.28 + rand() * 0.44;
    const side = zoneCenter < 0.5 ? 1 : -1;
    return { stroke, duration: 3.6, zoneCenter, zoneWidth: 0.2, zoneSwing: 0, zonePeriod: 0, needlePeriod: 1.6, knotFrom: clamp01(zoneCenter + side * 0.19 - 0.035), knotWidth: 0.07 };
  }
  // a quick run at a narrow golden sweet spot, with the knot just before it (don't swing early)
  const zoneCenter = 0.58 + rand() * 0.22;
  return { stroke, duration: 1.45, zoneCenter, zoneWidth: 0.085, zoneSwing: 0, zonePeriod: 0, needlePeriod: 0, knotFrom: zoneCenter - 0.15, knotWidth: 0.07 };
}
