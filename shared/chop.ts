// The campfire's 3-hit wood-chopping combo, as both sides see it: the server rolls each stroke's
// meter (rollChopStroke) and judges a swing on its own clock (judgeChop); the client draws the very
// same meter from the same functions, so what you see is what is judged.
//
// On every stroke the needle ping-pongs across the meter, bouncing off each end (it never runs out
// at the right edge: the stroke only ends when you swing, or after a few passes).
//
//   Stroke 1  Notch Cut      the slowest needle (x1.0), a wide (30%) sweet spot that holds still,
//                            and no knots
//   Stroke 2  Wedge Split    quicker (x1.35): a 20% sweet spot patrolling slowly back and forth,
//                            and one knot that stays put
//   Stroke 3  Clean Cleave   the quickest (x1.6): a narrow (12%) golden sweet spot patrolling a
//                            little quicker, and a knot that moves too: the real test
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

// --- the wood: what a clean split yields, kept (with the axe) in the player's camp profile ---
export type WoodKind = "pine" | "oak" | "charcoal";
export const WOOD_KINDS: WoodKind[] = ["pine", "oak", "charcoal"];
/** Each kind: what Buster pays for one, and how much it feeds the bonfire. */
export const WOOD: Record<WoodKind, { name: string; emoji: string; sell: number; fuel: number }> = {
  pine: { name: "Soft Pine", emoji: "🪵", sell: 8, fuel: 25 },
  oak: { name: "Hard Oak", emoji: "🌳", sell: 18, fuel: 30 },
  charcoal: { name: "Golden Charcoal", emoji: "✨", sell: 45, fuel: 50 },
};
export function isWoodKind(v: unknown): v is WoodKind {
  return v === "pine" || v === "oak" || v === "charcoal";
}

/** What each log splits into. */
export const CHOP_LOGS: Record<ChopLog, { name: string; emoji: string; wood: WoodKind; bonus: number; blurb: string }> = {
  pine: { name: "Soft Pine", emoji: "🌲", wood: "pine", bonus: 0, blurb: "Soft wood: a wide sweet spot" },
  oak: { name: "Hard Oak", emoji: "🌳", wood: "oak", bonus: 5, blurb: "Hard wood: its knots move" },
  golden: { name: "Golden Log", emoji: "✨", wood: "charcoal", bonus: 15, blurb: "A rare golden log: Golden Charcoal burns twice as long" },
};

// --- the axes: Buster the Lumberjack sells them ---
export type AxeId = "rusty" | "steel" | "golden";
export const AXES: Record<AxeId, { name: string; emoji: string; price: number; zoneBonus: number; slow: number; doubleChance: number; blurb: string }> = {
  rusty: { name: "Rusty Hatchet", emoji: "🪓", price: 0, zoneBonus: 0, slow: 0, doubleChance: 0, blurb: "It gets the job done. Mostly." },
  steel: { name: "Steel Camp Axe", emoji: "⚒️", price: 300, zoneBonus: 0.25, slow: 0, doubleChance: 0, blurb: "+25% green zone on every stroke." },
  golden: { name: "Golden Lumberjack Axe", emoji: "🌟", price: 900, zoneBonus: 0.25, slow: 0.2, doubleChance: 0.3, blurb: "+25% green zone, a 20% slower needle, and a 30% chance of double wood." },
};
export const AXE_IDS = Object.keys(AXES) as AxeId[];

// --- the wood carrier: what you carry your wood and crafted pieces in; Buster sells each next one ---
export interface WoodCarrierTier {
  id: string;
  name: string;
  capacity: number;
  price: number;
  icon: string;
}
export const WOOD_CARRIER_TIERS: WoodCarrierTier[] = [
  { id: "carrier_tier_1", name: "Twine Wood Strap", capacity: 10, price: 0, icon: "🪢" },
  { id: "carrier_tier_2", name: "Canvas Timber Bag", capacity: 15, price: 180, icon: "🎒" },
  { id: "carrier_tier_3", name: "Reinforced Wood Rig", capacity: 20, price: 450, icon: "🪵" },
  { id: "carrier_tier_4", name: "Lumberjack Pack", capacity: 35, price: 1200, icon: "📦" },
  { id: "carrier_tier_5", name: "Forester Heavy Frame", capacity: 50, price: 2600, icon: "🧰" },
  { id: "carrier_tier_6", name: "Ironbound Hauling Sled", capacity: 75, price: 4800, icon: "🛷" },
  { id: "carrier_tier_7", name: "Starlight Beaver Rig", capacity: 100, price: 8500, icon: "✨" },
];
/** A carrier tier (1-based, clamped), the next one up (null at the top), and a tier's capacity. */
export function carrierTier(tier: number): WoodCarrierTier {
  return WOOD_CARRIER_TIERS[Math.max(1, Math.min(WOOD_CARRIER_TIERS.length, Math.round(tier) || 1)) - 1];
}
export function nextCarrierTier(tier: number): WoodCarrierTier | null {
  return WOOD_CARRIER_TIERS[Math.round(tier)] ?? null;
}
export function carrierCapacity(tier: number): number {
  return carrierTier(tier).capacity;
}
export function isAxeId(v: unknown): v is AxeId {
  return typeof v === "string" && v in AXES;
}

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
export const CHOP_SPEED: Record<ChopStrokeNo, number> = { 1: 1.0, 2: 1.35, 3: 1.6 };
/** How fast each stroke's sweet spot patrols, against its needle (0: it holds still). */
const PATROL: Record<ChopStrokeNo, number> = { 1: 0, 2: 0.35, 3: 0.5 };
/** A chopping station holds this many logs each time it is stocked; once they are split its block
 *  rests CHOP_COOLDOWN_S (a whole number of seconds, rolled each time) before fresh ones arrive. */
export const MAX_CHOP_YIELD = 3;
export const CHOP_COOLDOWN_S = [20, 25] as const;
export function rollChopYield(): number {
  return MAX_CHOP_YIELD;
}
export function rollChopCooldown(rand: () => number = Math.random): number {
  return CHOP_COOLDOWN_S[0] + Math.floor(rand() * (CHOP_COOLDOWN_S[1] - CHOP_COOLDOWN_S[0] + 1));
}

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
  if (s.knotWidth <= 0) return "miss"; // (the Notch Cut has no knot)
  const [k0, k1] = chopKnot(s, t);
  return m >= k0 && m <= k1 ? "knot" : "miss";
}

/** Which log goes on the block for a combo. */
export function rollChopLog(rand: () => number = Math.random): ChopLog {
  const r = rand();
  return r < 0.1 ? "golden" : r < 0.45 ? "oak" : "pine";
}

/** A fresh stroke's meter (the server rolls it; `rand` is Math.random there). */
export function rollChopStroke(stroke: ChopStrokeNo, log: ChopLog, rand: () => number = Math.random, axe: AxeId = "rusty"): ChopStroke {
  const wide = (log === "pine" ? 1.2 : log === "golden" ? 0.9 : 1) * (1 + AXES[axe].zoneBonus);
  const slow = 1 / (1 - AXES[axe].slow);
  const needlePeriod = BASE_PERIOD / CHOP_SPEED[stroke];
  // the sweet spot patrols at PATROL x the needle's pace: one sweep of its range per needle pass, slowed
  const zonePeriod = PATROL[stroke] > 0 ? (needlePeriod * slow) / PATROL[stroke] : 0;
  // Hard Oak's knots creep on every stroke that has one; the Clean Cleave's knot always moves
  const creep = log === "oak" || stroke === 3 ? { knotSwing: stroke === 3 ? 0.16 : 0.1, knotPeriod: (stroke === 3 ? 2.6 : 2.2) + rand() * 0.8 } : { knotSwing: 0, knotPeriod: 0 };
  // the stroke waits three round trips of the needle for a swing
  const make = (m: Omit<ChopStroke, "stroke" | "log" | "duration" | "knotSwing" | "knotPeriod">): ChopStroke => ({ stroke, log, ...m, needlePeriod: m.needlePeriod * slow, duration: m.needlePeriod * slow * 3, ...creep });
  if (stroke === 1) {
    // a wide sweet spot holding still somewhere near the middle, and no knots at all
    const zoneCenter = 0.35 + rand() * 0.3;
    return { ...make({ zoneCenter, zoneWidth: 0.3 * wide, zoneSwing: 0, zonePeriod: 0, needlePeriod, knotFrom: 0, knotWidth: 0 }), knotSwing: 0, knotPeriod: 0 };
  }
  if (stroke === 2) {
    // a 20% sweet spot patrolling the middle; one knot out near an end, clear of its patrol
    const early = rand() < 0.5;
    return make({ zoneCenter: 0.5, zoneWidth: 0.2 * wide, zoneSwing: 0.2, zonePeriod, needlePeriod, knotFrom: early ? 0.02 : 0.9, knotWidth: 0.07 });
  }
  // a narrow golden sweet spot patrolling a little quicker, and a knot roaming the other half
  const right = rand() < 0.5;
  return make({ zoneCenter: right ? 0.64 : 0.36, zoneWidth: 0.12 * wide, zoneSwing: 0.16, zonePeriod, needlePeriod, knotFrom: right ? 0.18 : 0.75, knotWidth: 0.07 });
}
