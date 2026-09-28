// Felling trees, as both sides see it: the server rolls each swing's radial timing ring
// (rollFellSwing) and judges a swing on its own clock (judgeFell); the client draws the very same
// ring from the same functions, so what you see is what is judged.
//
// Precision Radial Felling: on the trunk's cross-section a timing ring contracts from the bark toward
// the heart, looping, over a golden sweet-spot ring. A swing (Space, a click, or the CHOP button)
// is judged by where the contracting ring was at that moment:
//
//   gold   on the golden sweet spot's centre: a critical, crisp chop (now and then a coin or a Pine
//          Resin); it counts as a hit
//   hit    within the sweet spot's band
//   miss   anywhere else: the notch doesn't deepen, swing again
//
// A tree takes several rounds (a hit each) to come down, rolled when it grows to maturity (T1 1-2,
// T2 2-3, T3 2-4, T4 3-4, T5 3-5, the Colossal Titan 5-6). Its damage stays in the tree (the room's
// state) if the feller walks off. Each round that lands drops something: a log (every time on a T1,
// less often up the tiers) or the tier's by-product (bark, resin, amber, shavings), so the rare woods
// never flood the market. A felled tree leaves a stump as wide as its trunk, and grows back through a
// sprout and a sapling to a new mature tree of a newly rolled size (0.85x to 1.35x): the bigger the
// tree, the more its logs are worth (the log's value scales with its tree's size squared).

import { AXE_PRICES, BYPRODUCT_PRICES, CARRIER_CAPACITY, CARRIER_PRICES, SHAVINGS_FUEL, TITAN_YIELD, WOOD_PRICES } from "./economy";

// --- the wood: what a felled tree yields, kept (with the axe) in the camp profile ---
export type WoodKind = "pine" | "oak" | "charcoal" | "birch" | "cedar" | "maple" | "elderwood";
export const WOOD_KINDS: WoodKind[] = ["pine", "oak", "charcoal", "birch", "cedar", "maple", "elderwood"];
/** Each kind: what Buster pays for one, how much it feeds the bonfire as it is, and the bundles of
 *  Firewood it splits into at the splitting block (FIREWOOD_FUEL each: splitting first burns longer). */
export const WOOD: Record<WoodKind, { name: string; emoji: string; sell: number; fuel: number; firewood: number }> = {
  pine: { name: "Raw Softwood", emoji: "🪵", sell: WOOD_PRICES.pine, fuel: 25, firewood: 3 },
  oak: { name: "Hardwood", emoji: "🌳", sell: WOOD_PRICES.oak, fuel: 30, firewood: 4 },
  charcoal: { name: "Golden Charcoal", emoji: "✨", sell: WOOD_PRICES.charcoal, fuel: 50, firewood: 7 },
  birch: { name: "Silver Birch Log", emoji: "🤍", sell: WOOD_PRICES.birch, fuel: 30, firewood: 4 },
  cedar: { name: "Highland Cedar Log", emoji: "🟫", sell: WOOD_PRICES.cedar, fuel: 35, firewood: 5 },
  maple: { name: "Autumn Maple Log", emoji: "🍁", sell: WOOD_PRICES.maple, fuel: 40, firewood: 6 },
  elderwood: { name: "Whispering Elderwood", emoji: "🌌", sell: WOOD_PRICES.elderwood, fuel: 60, firewood: 9 },
};
/** A bundle of Firewood (split at the splitting block) on the bonfire. */
export const FIREWOOD_FUEL = 10;
/** What Buster pays for one of `kind` at the hour's market multiplier (shared/market.ts). */
/** A log's price: its wood's, at the hour's market, times its size's worth (a tree's scale squared,
 *  logMultiplier; a held stack's average, woodAverage): Math.round(base x scale^2). */
export function woodPrice(kind: WoodKind, market = 1, size = 1): number {
  return Math.max(1, Math.round(WOOD[kind].sell * market * size));
}
export function isWoodKind(v: unknown): v is WoodKind {
  return typeof v === "string" && (WOOD_KINDS as string[]).includes(v);
}

// --- a log's worth: its tree's size squared. The carrier counts logs by kind, and keeps beside each
// count the sum of its logs' value multipliers (`woodValue`), so a big tree's logs sell for more
// (a profile from before carries its logs at 1x). ---
export interface WoodHold {
  wood: Record<WoodKind, number>;
  woodValue: Partial<Record<WoodKind, number>>;
}
/** A log's value multiplier from its tree's size: `Math.round(basePrice * scale^2)` a log. */
export const logMultiplier = (treeScale: number) => treeScale * treeScale;
/** The value units held of a kind (its logs' multipliers, summed). */
export function woodUnits(p: WoodHold, kind: WoodKind): number {
  const n = p.wood[kind] ?? 0;
  const v = p.woodValue[kind];
  return n <= 0 ? 0 : v === undefined || !Number.isFinite(v) || v <= 0 ? n : v;
}
/** The average multiplier of the logs held of a kind (1 with none). */
export function woodAverage(p: WoodHold, kind: WoodKind): number {
  const n = p.wood[kind] ?? 0;
  return n > 0 ? woodUnits(p, kind) / n : 1;
}
/** `n` logs of `kind`, each worth `mult`, into the carrier. */
export function addLogs(p: WoodHold, kind: WoodKind, n: number, mult = 1) {
  if (n <= 0) return;
  const units = woodUnits(p, kind);
  p.wood[kind] = (p.wood[kind] ?? 0) + n;
  p.woodValue[kind] = Math.round((units + n * mult) * 1000) / 1000;
}
/** `n` logs of `kind` out of the carrier (at their average worth): the value units they carried. */
export function takeLogs(p: WoodHold, kind: WoodKind, n: number): number {
  const have = p.wood[kind] ?? 0;
  const take = Math.max(0, Math.min(have, n));
  if (take <= 0) return 0;
  const avg = woodAverage(p, kind);
  p.wood[kind] = have - take;
  if (p.wood[kind] <= 0) delete p.woodValue[kind];
  else p.woodValue[kind] = Math.round(avg * (have - take) * 1000) / 1000;
  return avg * take;
}

// --- the axes, T1 to T5: an axe fells trees of its own tier and below; Buster sells T2 and T3,
// Bramble in the Whispering Woods T4 and T5 ---
export type AxeId = "rusty" | "steel" | "tempered" | "golden" | "runic";
export const AXES: Record<AxeId, { name: string; emoji: string; tier: number; price: number; zoneBonus: number; slow: number; blurb: string }> = {
  rusty: { name: "Basic Flint Axe", emoji: "🪓", tier: 1, price: 0, zoneBonus: 0, slow: 0, blurb: "T1: Soft Pine. It gets the job done. Mostly." },
  steel: { name: "Iron Timber Axe", emoji: "⚒️", tier: 2, price: AXE_PRICES.iron, zoneBonus: 0.2, slow: 0, blurb: "T2: fells Silver Birch. A 20% wider sweet spot." },
  tempered: { name: "Tempered Steel Axe", emoji: "🔨", tier: 3, price: AXE_PRICES.tempered, zoneBonus: 0.2, slow: 0.1, blurb: "T3: fells Highland Cedar. A 20% wider sweet spot, the ring 10% slower." },
  golden: { name: "Golden Felling Axe", emoji: "🌟", tier: 4, price: AXE_PRICES.golden, zoneBonus: 0.25, slow: 0.15, blurb: "T4: fells Autumn Maple. A 25% wider sweet spot, the ring 15% slower." },
  runic: { name: "Runic Elderwood Axe", emoji: "🪄", tier: 5, price: AXE_PRICES.runic, zoneBonus: 0.3, slow: 0.2, blurb: "T5: fells the Whispering Elderwood. A 30% wider sweet spot, the ring 20% slower." },
};
export const AXE_IDS = Object.keys(AXES) as AxeId[];
/** The axes in tier order. */
export const AXES_BY_TIER: AxeId[] = [...AXE_IDS].sort((a, b) => AXES[a].tier - AXES[b].tier);
export function isAxeId(v: unknown): v is AxeId {
  return typeof v === "string" && v in AXES;
}

// --- the trees, T1 to T5 (the campfire's Soft Pines round its clearing; the Whispering Woods' all
// five), and the Colossal Titan a world event raises in the woods ---
export type TreeKind = "soft_pine" | "birch" | "cedar" | "maple" | "elderwood";
export const TREE_KINDS: TreeKind[] = ["soft_pine", "birch", "cedar", "maple", "elderwood"];
export interface TreeInfo {
  name: string;
  emoji: string;
  tier: number;
  wood: WoodKind;
  respawnS: number;
  /** The rounds (hits) it takes to fell one, rolled per tree: [least, most]. */
  rounds: [number, number];
  /** How often a round that lands drops a log (else the tier's by-product). */
  logChance: number;
  /** What a round that lands drops when it isn't a log (none on a T1 tree: always a log). */
  byproduct: ByproductId | null;
  /** Its trunk's diameter at 1x (cm): the Logbook's record, and the stump's width. */
  trunkCm: number;
  /** The sweet spot's width on its ring (a share of the radius), and how long one contraction takes (s). */
  sweet: number;
  period: number;
  lore: string;
}
/** The felling's by-products, one per tier from T2 (a round that lands but drops no log), and the
 *  Fish Scales a landed fish sheds: they ride beside the carrier in the pouches (no log slots; their
 *  room grows with the carrier), and Bramble (or Buster) buys them. Ancient Wood Shavings also feed
 *  the bonfire. */
export type ByproductId = "bark" | "amber" | "leafAmber" | "shavings" | "scales";
export const BYPRODUCT_IDS: ByproductId[] = ["bark", "amber", "leafAmber", "shavings", "scales"];
export const BYPRODUCTS: Record<ByproductId, { name: string; emoji: string; price: number; fuel?: number; blurb: string }> = {
  bark: { name: "Birch Bark", emoji: "📜", price: BYPRODUCT_PRICES.bark, blurb: "Paper-white curls off a Silver Birch" },
  amber: { name: "Amber Resin", emoji: "🍯", price: BYPRODUCT_PRICES.amber, blurb: "Fragrant red sap from a Highland Cedar" },
  leafAmber: { name: "Golden Leaf Amber", emoji: "🍂", price: BYPRODUCT_PRICES.leafAmber, blurb: "An Autumn Maple's leaf caught in golden sap" },
  shavings: { name: "Ancient Wood Shavings", emoji: "✨", price: BYPRODUCT_PRICES.shavings, fuel: SHAVINGS_FUEL, blurb: `Elderwood curls that hum: +${SHAVINGS_FUEL}% on the bonfire` },
  scales: { name: "Fish Scales", emoji: "💠", price: BYPRODUCT_PRICES.scales, blurb: "Shed by a landed fish: the Otter-Carved Hook Charm's inlay" },
};
export function isByproductId(v: unknown): v is ByproductId {
  return typeof v === "string" && (BYPRODUCT_IDS as string[]).includes(v);
}
export const TREES: Record<TreeKind, TreeInfo> = {
  soft_pine: { name: "Soft Pine", emoji: "🌲", tier: 1, wood: "pine", respawnS: 35, rounds: [1, 2], logChance: 1, byproduct: null, trunkCm: 32, sweet: 0.16, period: 1.7, lore: "Quick to grow and quick to fall: the camp's everyday firewood, sticky with sap." },
  birch: { name: "Silver Birch", emoji: "🌳", tier: 2, wood: "birch", respawnS: 80, rounds: [2, 3], logChance: 0.8, byproduct: "bark", trunkCm: 28, sweet: 0.14, period: 1.55, lore: "Its paper-white bark peels in curls: the best kindling in the woods." },
  cedar: { name: "Highland Cedar", emoji: "🌲", tier: 3, wood: "cedar", respawnS: 160, rounds: [2, 4], logChance: 0.7, byproduct: "amber", trunkCm: 46, sweet: 0.12, period: 1.4, lore: "Fragrant red heartwood that keeps the moths away and the rain out." },
  maple: { name: "Autumn Maple", emoji: "🍁", tier: 4, wood: "maple", respawnS: 320, rounds: [3, 4], logChance: 0.6, byproduct: "leafAmber", trunkCm: 55, sweet: 0.105, period: 1.28, lore: "Forever golden: its leaves never quite fall, and its sap turns to amber." },
  elderwood: { name: "Whispering Elderwood", emoji: "🌌", tier: 5, wood: "elderwood", respawnS: 650, rounds: [3, 5], logChance: 0.5, byproduct: "shavings", trunkCm: 92, sweet: 0.09, period: 1.15, lore: "Older than the stones round it. They say it hums to itself on quiet nights." },
};
export function isTreeKind(v: unknown): v is TreeKind {
  return typeof v === "string" && (TREE_KINDS as string[]).includes(v);
}
/** The Colossal Titan: a 2x Autumn Maple a world event raises in the woods, 5-6 rounds, any axe;
 *  it comes down in 4-6 heavy logs worth TITAN_YIELD (750) together at an even market. */
export const TITAN = { kind: "maple" as TreeKind, scale: 2, rounds: [5, 6] as [number, number], logs: [4, 6] as [number, number], sweet: 0.12, period: 1.35, name: "Colossal Titan Maple" };
/** Each of a Titan's `n` heavy logs' value multiplier (on a maple log's price): together worth
 *  TITAN_YIELD at an even market. */
export const titanLogMult = (n: number) => Math.round((TITAN_YIELD / Math.max(1, n) / WOOD_PRICES.maple) * 1000) / 1000;
/** A tree's size: rolled each time it grows to maturity. */
export const TREE_SCALE: [number, number] = [0.85, 1.35];
export function rollTreeScale(rand: () => number = Math.random): number {
  return Math.round((TREE_SCALE[0] + rand() * (TREE_SCALE[1] - TREE_SCALE[0])) * 100) / 100;
}
export function rollTreeRounds(range: [number, number], rand: () => number = Math.random): number {
  return range[0] + Math.floor(rand() * (range[1] - range[0] + 1));
}
/** A tree's trunk diameter (cm) at its size. */
export const trunkCm = (kind: TreeKind, scale: number) => Math.round(TREES[kind].trunkCm * scale);

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
/** A tree as the room syncs it (state.trees, by node id): its stage, its size, the rounds landed on
 *  it and the rounds it takes. */
export interface TreeSync {
  stage: TreeStage;
  scale: number;
  dmg: number;
  rounds: number;
}
export function parseTrees(raw: string): Record<string, TreeSync> {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Record<string, TreeSync>) : {};
  } catch {
    return {};
  }
}

// --- the swing: a timing ring contracting over the trunk's cross-section toward a sweet-spot ring ---
export interface FellSwing {
  /** The tree's node, its kind (the Titan: a maple), the round under way and the rounds it takes. */
  tree: string;
  kind: TreeKind;
  round: number;
  rounds: number;
  /** The sweet spot's ring: its radius (a share of the trunk's), its band's half-width, and its gold centre's. */
  sweet: number;
  band: number;
  gold: number;
  /** One contraction of the timing ring, bark to heart (s); it loops. */
  period: number;
}
export type FellVerdict = "gold" | "hit" | "miss";
/** A gold swing: its chance of a bonus, and the bonus (coins, or else a Pine Resin). */
export const FELL_CRIT_CHANCE = 0.4;
export const FELL_CRIT_COINS = 2;
/** The pause after a round that lands before the next swing's ring (s): the chips fly. */
export const FELL_ROUND_PAUSE_S = 0.4;

/** The timing ring's radius `t` seconds into the swing: from the bark (1) to the heart (0), looping. */
export function fellRing(s: FellSwing, t: number): number {
  const phase = (Math.max(0, t) / s.period) % 1;
  return 1 - phase;
}
/** A swing `t` seconds into it: on the gold centre, in the sweet band, or a miss. */
export function judgeFell(s: FellSwing, t: number): FellVerdict {
  const d = Math.abs(fellRing(s, t) - s.sweet);
  return d <= s.gold ? "gold" : d <= s.band ? "hit" : "miss";
}
/** A fresh swing's ring (the server rolls it): the sweet spot somewhere in the trunk's middle, its
 *  band widened by the axe (and the Eagle Eye, `zoneBonus`), its gold by the Titan-Grip Gauntlets
 *  (`goldBonus`), the ring slowed by the axe and the Deerskin Felling Gloves (`slowBonus`). The
 *  heavier rounds come a touch quicker. */
export function rollFellSwing(tree: string, kind: TreeKind, round: number, rounds: number, axe: AxeId, rand: () => number = Math.random, goldBonus = 0, zoneBonus = 0, titan = false, slowBonus = 0): FellSwing {
  const info = TREES[kind];
  const sweetW = (titan ? TITAN.sweet : info.sweet) * (1 + AXES[axe].zoneBonus) * (1 + zoneBonus);
  const period = (titan ? TITAN.period : info.period) / (1 - AXES[axe].slow) / (1 - slowBonus) / (1 + 0.04 * (round - 1));
  const sweet = 0.3 + rand() * 0.35;
  return { tree, kind, round, rounds, sweet, band: sweetW / 2, gold: Math.min(sweetW / 2, (sweetW / 2) * 0.38 * (1 + goldBonus)), period };
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
