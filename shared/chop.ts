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
// Each sweet spot is green with a gold centre (a third of it; gloves from Buster widen the gold),
// and a swing lands in one of five places, judged at the needle's place when it was made (the
// client samples it at the click, and the server checks that time is one the connection could have
// given: see HangoutRoom's CHOP_STOP):
//
//   gold    the centre: a critical, crisp chop (a burst of chips, and now and then +3 coins or a
//           Pine Resin); it counts as green too
//   green   a normal hit
//   edge    just outside the green (CHOP_GRACE): a glancing blow
//   miss    anywhere else
//   knot    the red knot: the axe is stunned and the combo is lost
//
// A glancing blow or a miss doesn't end the combo: the chopping carries on to the next stroke at a
// baseline pace. At the end, the log splits (one log, as the wood carrier holds) if at least
// CHOP_GREENS_TO_SPLIT of its three strokes landed green or gold.
//
// Each stroke has a wood knot too, a red patch on the meter: swinging into it stuns the axe (the
// combo is lost, and the block needs a moment before the next try). And the log on the block is
// one of three (rolled once per combo):
//
//   Soft Pine    a wider sweet spot: one Firewood
//   Hard Oak     the knots creep along the meter: two Firewood
//   Golden Log   one in ten: a Golden Charcoal (double the fuel) and a bonus

import { AXE_PRICES, CARRIER_CAPACITY, CARRIER_PRICES, WOOD_PRICES } from "./economy";

export type ChopStrokeNo = 1 | 2 | 3;
export type ChopLog = "pine" | "oak" | "golden";

// --- the wood: what a clean split or a felled tree yields, kept (with the axe) in the camp profile ---
// The Timber Trail's three (a split log on its blocks) and the Whispering Woods' four (a felled tree:
// its logs); a Soft Pine in the woods gives softwood like the trail's. All of it rides in the wood
// carrier, sells to Buster, goes on the bonfire, or splits into Firewood at the chopping block.
export type WoodKind = "pine" | "oak" | "charcoal" | "birch" | "cedar" | "maple" | "elderwood";
export const WOOD_KINDS: WoodKind[] = ["pine", "oak", "charcoal", "birch", "cedar", "maple", "elderwood"];
/** Each kind: what Buster pays for one, how much it feeds the bonfire as it is, and the bundles of
 *  Firewood it splits into at the chopping block (FIREWOOD_FUEL each: splitting first burns longer). */
export const WOOD: Record<WoodKind, { name: string; emoji: string; sell: number; fuel: number; firewood: number }> = {
  pine: { name: "Raw Softwood", emoji: "🪵", sell: WOOD_PRICES.pine, fuel: 25, firewood: 3 },
  oak: { name: "Hardwood", emoji: "🌳", sell: WOOD_PRICES.oak, fuel: 30, firewood: 4 },
  charcoal: { name: "Golden Charcoal", emoji: "✨", sell: WOOD_PRICES.charcoal, fuel: 50, firewood: 7 },
  birch: { name: "Silver Birch Log", emoji: "🤍", sell: WOOD_PRICES.birch, fuel: 30, firewood: 4 },
  cedar: { name: "Highland Cedar Log", emoji: "🟫", sell: WOOD_PRICES.cedar, fuel: 35, firewood: 5 },
  maple: { name: "Autumn Maple Log", emoji: "🍁", sell: WOOD_PRICES.maple, fuel: 40, firewood: 6 },
  elderwood: { name: "Whispering Elderwood", emoji: "🌌", sell: WOOD_PRICES.elderwood, fuel: 60, firewood: 9 },
};
/** A bundle of Firewood (split at the chopping block) on the bonfire. */
export const FIREWOOD_FUEL = 10;
/** What Buster pays for one of `kind` at the hour's market multiplier (shared/market.ts). */
export function woodPrice(kind: WoodKind, market = 1): number {
  return Math.max(1, Math.round(WOOD[kind].sell * market));
}
export function isWoodKind(v: unknown): v is WoodKind {
  return typeof v === "string" && (WOOD_KINDS as string[]).includes(v);
}

/** What each log splits into. */
export const CHOP_LOGS: Record<ChopLog, { name: string; emoji: string; wood: WoodKind; bonus: number; blurb: string }> = {
  pine: { name: "Soft Pine", emoji: "🌲", wood: "pine", bonus: 0, blurb: "Soft wood: a wide sweet spot" },
  oak: { name: "Hard Oak", emoji: "🌳", wood: "oak", bonus: 1, blurb: "Hard wood: its knots move" },
  golden: { name: "Golden Log", emoji: "✨", wood: "charcoal", bonus: 4, blurb: "A rare golden log: Golden Charcoal burns twice as long" },
};

// --- the axes, T1 to T5: an axe fells trees of its own tier and below (the Timber Trail's logs take
// any); Buster sells T2 and T3, Bramble in the Whispering Woods T4 and T5 ---
export type AxeId = "rusty" | "steel" | "tempered" | "golden" | "runic";
export const AXES: Record<AxeId, { name: string; emoji: string; tier: number; price: number; zoneBonus: number; slow: number; doubleChance: number; blurb: string }> = {
  rusty: { name: "Basic Flint Axe", emoji: "🪓", tier: 1, price: 0, zoneBonus: 0, slow: 0, doubleChance: 0, blurb: "T1: Soft Pine. It gets the job done. Mostly." },
  steel: { name: "Iron Timber Axe", emoji: "⚒️", tier: 2, price: AXE_PRICES.iron, zoneBonus: 0.25, slow: 0, doubleChance: 0, blurb: "T2: fells Silver Birch. +25% green zone on every stroke." },
  tempered: { name: "Tempered Steel Axe", emoji: "🔨", tier: 3, price: AXE_PRICES.tempered, zoneBonus: 0.25, slow: 0.1, doubleChance: 0.1, blurb: "T3: fells Highland Cedar. +25% green, a 10% slower needle, a 10% chance of double wood." },
  golden: { name: "Golden Felling Axe", emoji: "🌟", tier: 4, price: AXE_PRICES.golden, zoneBonus: 0.25, slow: 0.2, doubleChance: 0.3, blurb: "T4: fells Autumn Maple. +25% green, a 20% slower needle, a 30% chance of double wood." },
  runic: { name: "Runic Elderwood Axe", emoji: "🪄", tier: 5, price: AXE_PRICES.runic, zoneBonus: 0.35, slow: 0.25, doubleChance: 0.35, blurb: "T5: fells the Whispering Elderwood. +35% green, a 25% slower needle, a 35% chance of double wood." },
};
export const AXE_IDS = Object.keys(AXES) as AxeId[];
/** The axes in tier order. */
export const AXES_BY_TIER: AxeId[] = [...AXE_IDS].sort((a, b) => AXES[a].tier - AXES[b].tier);
/** The best tier among the axes owned. */
export function bestAxeTier(axes: readonly AxeId[]): number {
  return axes.reduce((t, a) => Math.max(t, AXES[a]?.tier ?? 1), 1);
}

// --- the Whispering Woods' trees, T1 to T5 ---
// A tree is felled with the three-strike notch (the same meter as the Timber Trail's blocks, harder
// the higher its tier: a narrower sweet spot, a quicker needle); it drops its logs (into the carrier)
// and leaves a stump that grows back through a sprout and a sapling to a mature tree.
export type TreeKind = "soft_pine" | "birch" | "cedar" | "maple" | "elderwood";
export const TREE_KINDS: TreeKind[] = ["soft_pine", "birch", "cedar", "maple", "elderwood"];
export const TREES: Record<TreeKind, { name: string; emoji: string; tier: number; wood: WoodKind; logs: number; respawnS: number; wide: number; speed: number }> = {
  soft_pine: { name: "Soft Pine", emoji: "🌲", tier: 1, wood: "pine", logs: 3, respawnS: 35, wide: 1.2, speed: 1 },
  birch: { name: "Silver Birch", emoji: "🌳", tier: 2, wood: "birch", logs: 3, respawnS: 80, wide: 1.0, speed: 1.08 },
  cedar: { name: "Highland Cedar", emoji: "🌲", tier: 3, wood: "cedar", logs: 3, respawnS: 160, wide: 0.86, speed: 1.16 },
  maple: { name: "Autumn Maple", emoji: "🍁", tier: 4, wood: "maple", logs: 3, respawnS: 320, wide: 0.74, speed: 1.24 },
  elderwood: { name: "Whispering Elderwood", emoji: "🌌", tier: 5, wood: "elderwood", logs: 3, respawnS: 650, wide: 0.62, speed: 1.32 },
};
export function isTreeKind(v: unknown): v is TreeKind {
  return typeof v === "string" && (TREE_KINDS as string[]).includes(v);
}
/** A felled tree's growth back (0 a fresh stump, 1 mature again), `sinceS` seconds after the fall. */
export function regrowth(kind: TreeKind, sinceS: number): number {
  return Math.max(0, Math.min(1, sinceS / TREES[kind].respawnS));
}
/** Which of its four looks a tree shows at a growth: a stump (under 50%), a sprout (under 80%), a
 *  sapling (under 100%), or mature (fellable). */
export type TreeStage = "stump" | "sprout" | "sapling" | "mature";
export function treeStage(growth: number): TreeStage {
  return growth >= 1 ? "mature" : growth >= 0.8 ? "sapling" : growth >= 0.5 ? "sprout" : "stump";
}

// --- the wood carrier: what you carry your wood and crafted pieces in; Buster sells each next one ---
export interface WoodCarrierTier {
  id: string;
  name: string;
  capacity: number;
  price: number;
  icon: string;
}
export const WOOD_CARRIER_TIERS: WoodCarrierTier[] = [
  { id: "carrier_tier_1", name: "Twine Wood Strap", capacity: CARRIER_CAPACITY[0], price: CARRIER_PRICES[0], icon: "🪢" },
  { id: "carrier_tier_2", name: "Canvas Bag", capacity: CARRIER_CAPACITY[1], price: CARRIER_PRICES[1], icon: "🎒" },
  { id: "carrier_tier_3", name: "Reinforced Rig", capacity: CARRIER_CAPACITY[2], price: CARRIER_PRICES[2], icon: "🪵" },
  { id: "carrier_tier_4", name: "Lumberjack Pack", capacity: CARRIER_CAPACITY[3], price: CARRIER_PRICES[3], icon: "📦" },
  { id: "carrier_tier_5", name: "Forester Heavy Frame", capacity: CARRIER_CAPACITY[4], price: CARRIER_PRICES[4], icon: "🧰" },
  { id: "carrier_tier_6", name: "Ironbound Hauling Sled", capacity: CARRIER_CAPACITY[5], price: CARRIER_PRICES[5], icon: "🛷" },
  { id: "carrier_tier_7", name: "Starlight Beaver Rig", capacity: CARRIER_CAPACITY[6], price: CARRIER_PRICES[6], icon: "✨" },
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
  /** The gold centre of the sweet spot (a critical chop): its width, centred in it. */
  goldWidth: number;
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
/** How far outside the green a swing is a glancing blow, not a miss (a fraction of the meter: 5%). */
export const CHOP_GRACE = 0.05;
/** The sweet spot's gold centre: this share of it (before gloves widen it). */
export const CHOP_GOLD_SHARE = 0.34;
/** A log splits if at least this many of its three strokes land green or gold. */
export const CHOP_GREENS_TO_SPLIT = 2;
/** A gold (critical) swing: its chance of a bonus, and the bonus (coins, or else a Pine Resin). */
export const CHOP_CRIT_CHANCE = 0.5;
export const CHOP_CRIT_COINS = 3;
export type ChopVerdict = "gold" | "hit" | "edge" | "knot" | "miss";
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

/** The sweet spot's gold centre, `t` seconds into the stroke: [from, to]. */
export function chopGold(s: ChopStroke, t: number): [number, number] {
  const [a, b] = chopZone(s, t);
  const c = (a + b) / 2;
  const w = Math.min(b - a, s.goldWidth);
  return [clamp01(c - w / 2), clamp01(c + w / 2)];
}

/** A swing `t` seconds into the stroke: into the gold centre, the green, its glancing edge, the
 *  knot, or nowhere. */
export function judgeChop(s: ChopStroke, t: number): ChopVerdict {
  const m = chopMarker(s, t);
  const [a, b] = chopZone(s, t);
  const [g0, g1] = chopGold(s, t);
  // the sweet spot wins where the two touch: a creeping knot never steals a clean swing
  if (m >= g0 && m <= g1) return "gold";
  if (m >= a && m <= b) return "hit";
  if (m >= a - CHOP_GRACE && m <= b + CHOP_GRACE) return "edge";
  if (s.knotWidth <= 0) return "miss"; // (the Notch Cut has no knot)
  const [k0, k1] = chopKnot(s, t);
  return m >= k0 && m <= k1 ? "knot" : "miss";
}
/** Whether a swing counts toward the split (green, or its gold centre). */
export const isGreen = (v: ChopVerdict) => v === "gold" || v === "hit";

/** Which log goes on the block for a combo. */
export function rollChopLog(rand: () => number = Math.random): ChopLog {
  const r = rand();
  return r < 0.1 ? "golden" : r < 0.45 ? "oak" : "pine";
}

/** A fresh stroke's meter (the server rolls it; `rand` is Math.random there). `goldBonus`: how much
 *  wider gloves make its gold centre (shared/gear.ts gloveSweetBonus). `tree`: a Whispering Woods tree
 *  being felled (its tier narrows the sweet spot and quickens the needle); `zoneBonus`: extra green
 *  (the Eagle Eye). */
export function rollChopStroke(stroke: ChopStrokeNo, log: ChopLog, rand: () => number = Math.random, axe: AxeId = "rusty", goldBonus = 0, tree?: TreeKind, zoneBonus = 0): ChopStroke {
  const wide = (tree ? TREES[tree].wide : log === "pine" ? 1.2 : log === "golden" ? 0.9 : 1) * (1 + AXES[axe].zoneBonus) * (1 + zoneBonus);
  const slow = 1 / (1 - AXES[axe].slow);
  const needlePeriod = BASE_PERIOD / CHOP_SPEED[stroke] / (tree ? TREES[tree].speed : 1);
  // the sweet spot patrols at PATROL x the needle's pace: one sweep of its range per needle pass, slowed
  const zonePeriod = PATROL[stroke] > 0 ? (needlePeriod * slow) / PATROL[stroke] : 0;
  // Hard Oak's knots creep on every stroke that has one; the Clean Cleave's knot always moves
  const creep = log === "oak" || stroke === 3 ? { knotSwing: stroke === 3 ? 0.16 : 0.1, knotPeriod: (stroke === 3 ? 2.6 : 2.2) + rand() * 0.8 } : { knotSwing: 0, knotPeriod: 0 };
  // the stroke waits three round trips of the needle for a swing
  const make = (m: Omit<ChopStroke, "stroke" | "log" | "duration" | "knotSwing" | "knotPeriod" | "goldWidth">): ChopStroke => ({ stroke, log, ...m, goldWidth: Math.min(m.zoneWidth, m.zoneWidth * CHOP_GOLD_SHARE * (1 + goldBonus)), needlePeriod: m.needlePeriod * slow, duration: m.needlePeriod * slow * 3, ...creep });
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
