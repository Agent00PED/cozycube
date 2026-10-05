// Felling trees, as both sides see it: the server rolls each swing's radial timing ring
// (rollFellSwing) and judges a swing on its own clock (judgeFell); the client draws the very same
// ring from the same functions, so what you see is what is judged.
//
// Precision Radial Felling: on the trunk's cross-section a timing ring sweeps from the bark toward
// the heart over a golden sweet-spot ring (the notch). A swing (Space, a click, or a tap) is judged
// by where the ring was at that moment:
//
//   gold   on the golden sweet spot's centre: a critical, crisp chop (now and then a coin or a Pine
//          Resin); it counts as a hit
//   hit    within the sweet spot's band
//   knot   on a Wood Knot (a red band in a T4 or T5 trunk): the axe glances off, and it takes 0.4 s
//          to recover before the next swing (a T5 axe or the Wedge & Mallet Kit bites straight
//          through: a plain miss)
//   miss   anywhere else: the notch doesn't deepen, swing again
//
// The finer the tree, the narrower its notch and the trickier its ring (NOTCH_DEG, TreeInfo.motion):
// T1 Soft Pine 60 degrees of the sweep, T2 Silver Birch 45, T3 Highland Cedar 30 on a pendulum (in
// and back out), T4 Autumn Maple 20 on an accelerating ring with a Wood Knot, T5 Whispering
// Elderwood 14 on a pulsing ring with two. (An axe's zone widens the notch; the finer trees' rings
// are slower to give it a fair window.)
//
// A tree takes several rounds (a hit each) to come down, rolled when it grows to maturity (T1 1-2,
// T2 2-3, T3 2-4, T4 3-4, T5 3-5, the Colossal Titan 5-6). Its damage stays in the tree (the room's
// state) if the feller walks off. Each round that lands drops something: a log (every time on a T1,
// less often up the tiers) or the tier's by-product (bark, resin, amber, shavings), so the rare woods
// never flood the market. A felled tree leaves a stump as wide as its trunk, and grows back through a
// sprout and a sapling to a new mature tree of a newly rolled size (0.85x to 1.35x): the bigger the
// tree, the more its logs are worth (the log's value scales with its tree's size squared).

import { AXE_PRICES, BYPRODUCT_PRICES, CARRIER_CAPACITY, CARRIER_PRICES, COLOSSAL_YIELD, SHAVINGS_FUEL, WOOD_PRICES } from "./economy";

// --- the wood: what a felled tree yields, kept (with the axe) in the camp profile ---
export type WoodKind = "pine" | "oak" | "charcoal" | "birch" | "cedar" | "maple" | "elderwood" | "palm" | "ironwood";
export const WOOD_KINDS: WoodKind[] = ["pine", "oak", "charcoal", "birch", "cedar", "maple", "elderwood", "palm", "ironwood"];
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
  palm: { name: "Coconut Palm Log", emoji: "🌴", sell: WOOD_PRICES.palm, fuel: 35, firewood: 5 },
  ironwood: { name: "Ironwood Log", emoji: "🖤", sell: WOOD_PRICES.ironwood, fuel: 60, firewood: 9 },
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
export type AxeId = "rusty" | "steel" | "tempered" | "golden" | "runic" | "tidewater" | "deeptide";
export const AXES: Record<AxeId, { name: string; emoji: string; tier: number; price: number; zoneBonus: number; slow: number; blurb: string }> = {
  rusty: { name: "Basic Flint Axe", emoji: "🪓", tier: 1, price: 0, zoneBonus: 0, slow: 0, blurb: "T1: Soft Pine. It gets the job done. Mostly." },
  steel: { name: "Iron Timber Axe", emoji: "⚒️", tier: 2, price: AXE_PRICES.iron, zoneBonus: 0.2, slow: 0, blurb: "T2: fells the woods' Silver Birch. A 20% wider sweet spot." },
  tempered: { name: "Tempered Steel Axe", emoji: "🔨", tier: 3, price: AXE_PRICES.tempered, zoneBonus: 0.2, slow: 0.1, blurb: "T3: fells Highland Cedar. A 20% wider sweet spot, the ring 10% slower." },
  golden: { name: "Golden Felling Axe", emoji: "🌟", tier: 4, price: AXE_PRICES.golden, zoneBonus: 0.25, slow: 0.15, blurb: "T4: fells Autumn Maple. A 25% wider sweet spot, the ring 15% slower." },
  runic: { name: "Runic Elderwood Axe", emoji: "🪄", tier: 5, price: AXE_PRICES.runic, zoneBonus: 0.3, slow: 0.2, blurb: "T5: fells the Whispering Elderwood. A 30% wider sweet spot, the ring 20% slower." },
  tidewater: { name: "Tidewater Axe", emoji: "🌴", tier: 6, price: AXE_PRICES.tidewater, zoneBonus: 0.35, slow: 0.25, blurb: "T6: fells Sunset Beach's Coconut Palms. A 35% wider sweet spot, the ring 25% slower." },
  deeptide: { name: "Deep Tide Axe", emoji: "🔱", tier: 7, price: AXE_PRICES.deeptide, zoneBonus: 0.45, slow: 0.25, blurb: "T7: fells the Drowned Ironwood. A 45% wider sweet spot, the ring 25% slower." },
};
export const AXE_IDS = Object.keys(AXES) as AxeId[];
/** The axes in tier order. */
export const AXES_BY_TIER: AxeId[] = [...AXE_IDS].sort((a, b) => AXES[a].tier - AXES[b].tier);
export function isAxeId(v: unknown): v is AxeId {
  return typeof v === "string" && v in AXES;
}

// --- the trees, T1 to T5 (the campfire's Soft Pines round its clearing; the Whispering Woods' all
// five), and the Colossal Titan a world event raises in the woods ---
export type TreeKind = "soft_pine" | "birch" | "cedar" | "maple" | "elderwood" | "palm" | "ironwood" | "sea_pine";
export const TREE_KINDS: TreeKind[] = ["soft_pine", "birch", "cedar", "maple", "elderwood", "palm", "ironwood", "sea_pine"];
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
  /** The notch: its share of the ring's sweep (NOTCH_DEG / 360: the sweet spot's width, a share of
   *  the radius), and how long one sweep takes (s). */
  sweet: number;
  period: number;
  /** How its ring moves (FellMotion), and how many Wood Knots its trunk has. */
  motion: FellMotion;
  knots: number;
  lore: string;
}
/** How a felling ring moves: a steady loop (bark to heart, again), a pendulum (in and back out,
 *  slowing at each end), an accelerating sweep (slow at the bark, quick at the heart), a pulsing one
 *  (surging and easing three times a sweep). */
export type FellMotion = "loop" | "pendulum" | "accel" | "pulse";
/** Each tier's notch, in degrees of the sweep: T1 60, T2 45, T3 30, T4 20, T5 14, T6 12, T7 10. */
export const NOTCH_DEG = [60, 45, 30, 20, 14, 12, 10] as const;
const notch = (tier: number) => NOTCH_DEG[tier - 1] / 360;
/** The by-products, the crafting materials' store's (no carrier, livewell or satchel slots: up to
 *  MATERIAL_CAP, 99, of each kind): the felling's, one per tier from T2 (a round that lands but drops
 *  no log); the Colossal trees' rare ones (Silver Bark, Titan Heartwood); the river's and the Cenote's
 *  (Fish Scales off any landed fish, a Fine Fish Bone off a rare or better, a Prismatic Scale off a
 *  legendary or a mythic); and the caverns' Fine Stone Dust. Bramble and Buster buy them all (Gus the
 *  stone dust too). Ancient Wood Shavings also feed the bonfire. */
export type ByproductId = "bark" | "amber" | "leafAmber" | "shavings" | "scales" | "silverBark" | "heartwood" | "fishBone" | "prismScale" | "stoneDust" | "pearl" | "husk" | "coconut" | "ironbark";
export const BYPRODUCT_IDS: ByproductId[] = ["bark", "amber", "leafAmber", "shavings", "silverBark", "heartwood", "scales", "fishBone", "prismScale", "stoneDust", "pearl", "husk", "coconut", "ironbark"];
export const BYPRODUCTS: Record<ByproductId, { name: string; emoji: string; price: number; fuel?: number; blurb: string }> = {
  bark: { name: "Birch Bark", emoji: "📜", price: BYPRODUCT_PRICES.bark, blurb: "Paper-white curls off a Silver Birch" },
  amber: { name: "Amber Resin", emoji: "🍯", price: BYPRODUCT_PRICES.amber, blurb: "Fragrant red sap from a Highland Cedar" },
  leafAmber: { name: "Golden Leaf Amber", emoji: "🍂", price: BYPRODUCT_PRICES.leafAmber, blurb: "An Autumn Maple's leaf caught in golden sap" },
  shavings: { name: "Ancient Wood Shavings", emoji: "✨", price: BYPRODUCT_PRICES.shavings, fuel: SHAVINGS_FUEL, blurb: `Elderwood curls that hum: +${SHAVINGS_FUEL}% on the bonfire` },
  silverBark: { name: "Silver Bark", emoji: "🥈", price: BYPRODUCT_PRICES.silverBark, blurb: "Shimmering bark off a Colossal Silver Birch" },
  heartwood: { name: "Titan Heartwood", emoji: "💎", price: BYPRODUCT_PRICES.heartwood, blurb: "The deep blue heart of a Colossal Primordial Elderwood" },
  scales: { name: "Fish Scales", emoji: "💠", price: BYPRODUCT_PRICES.scales, blurb: "Shed by a landed fish" },
  fishBone: { name: "Fine Fish Bone", emoji: "🦴", price: BYPRODUCT_PRICES.fishBone, blurb: "A clean, strong bone off a rare fish or better" },
  prismScale: { name: "Prismatic Scale", emoji: "🌈", price: BYPRODUCT_PRICES.prismScale, blurb: "A rainbow scale off a legendary or a mythic fish" },
  pearl: { name: "Sea Pearl", emoji: "🫧", price: BYPRODUCT_PRICES.pearl, blurb: "From a giant clam, far out at sea" },
  husk: { name: "Coconut Husk", emoji: "🟤", price: BYPRODUCT_PRICES.husk, blurb: "Coarse brown fibre off a Coconut Palm: rope, matting, kindling" },
  ironbark: { name: "Ironwood Bark", emoji: "🟫", price: BYPRODUCT_PRICES.ironbark, blurb: "Black bark off a Drowned Ironwood: it sinks in water and turns an axe" },
  coconut: { name: "Coconut", emoji: "🥥", price: BYPRODUCT_PRICES.coconut, blurb: "Shaken down from a Coconut Palm: Mango mixes you a drink for one" },
  stoneDust: { name: "Fine Stone Dust", emoji: "🌫️", price: BYPRODUCT_PRICES.stoneDust, blurb: "Silver's powdery by-product, and what a clumsy chisel leaves of a geode: masons and brewers pay for it" },
};
/** Which craft a by-product comes from (the drawer that shows it): the felling's and the Colossal
 *  trees', the river's and the Cenote's, the caverns'. */
export const BYPRODUCT_CRAFT: Record<ByproductId, "wood" | "fish" | "ore"> = { bark: "wood", amber: "wood", leafAmber: "wood", shavings: "wood", silverBark: "wood", heartwood: "wood", scales: "fish", fishBone: "fish", prismScale: "fish", stoneDust: "ore", pearl: "fish", husk: "wood", coconut: "wood", ironbark: "wood" };
/** The river's by-products off a landed fish, by its rarity: a Fine Fish Bone's chance (a rare 15%,
 *  a legendary always, a mythic always), and a Prismatic Scale's (a legendary 35%, a mythic always). */
export const FISH_BONE_CHANCE = { common: 0, uncommon: 0, rare: 0.15, legendary: 1, mythic: 1 } as const;
export const PRISM_SCALE_CHANCE = { common: 0, uncommon: 0, rare: 0, legendary: 0.35, mythic: 1 } as const;
/** What a shop's Sell All takes: every by-product but the ones kept for something better (the cove's
 *  pearls for its bench, coconuts for Mango's bar). Each still sells on its own. */
export const SELL_ALL_BYPRODUCTS: ByproductId[] = BYPRODUCT_IDS.filter((k) => k !== "pearl" && k !== "coconut");
export function isByproductId(v: unknown): v is ByproductId {
  return typeof v === "string" && (BYPRODUCT_IDS as string[]).includes(v);
}
export const TREES: Record<TreeKind, TreeInfo> = {
  // (the beach forest's casuarina: a first-tier tree like the Soft Pine, its wood sold as pine)
  sea_pine: { name: "Sea Pine", emoji: "🌲", tier: 1, wood: "pine", respawnS: 45, rounds: [1, 2], logChance: 1, byproduct: null, trunkCm: 36, sweet: notch(1), period: 1.6, motion: "loop", knots: 0, lore: "Casuarina: not a pine at all, though its drooping green twigs pass for needles. It holds the sand behind every tropical beach and sighs in the sea wind." },
  soft_pine: { name: "Soft Pine", emoji: "🌲", tier: 1, wood: "pine", respawnS: 35, rounds: [1, 2], logChance: 1, byproduct: null, trunkCm: 32, sweet: notch(1), period: 1.6, motion: "loop", knots: 0, lore: "Quick to grow and quick to fall: the camp's everyday firewood, sticky with sap." },
  birch: { name: "Silver Birch", emoji: "🌳", tier: 2, wood: "birch", respawnS: 80, rounds: [2, 3], logChance: 0.8, byproduct: "bark", trunkCm: 28, sweet: notch(2), period: 1.65, motion: "loop", knots: 0, lore: "Its paper-white bark peels in curls: the best kindling in the woods." },
  cedar: { name: "Highland Cedar", emoji: "🌲", tier: 3, wood: "cedar", respawnS: 160, rounds: [2, 4], logChance: 0.7, byproduct: "amber", trunkCm: 46, sweet: notch(3), period: 1.8, motion: "pendulum", knots: 0, lore: "Fragrant red heartwood that keeps the moths away and the rain out." },
  maple: { name: "Autumn Maple", emoji: "🍁", tier: 4, wood: "maple", respawnS: 440, rounds: [3, 4], logChance: 0.6, byproduct: "leafAmber", trunkCm: 55, sweet: notch(4), period: 2.0, motion: "accel", knots: 1, lore: "Forever golden: its leaves never quite fall, and its sap turns to amber." },
  elderwood: { name: "Whispering Elderwood", emoji: "🌌", tier: 5, wood: "elderwood", respawnS: 650, rounds: [3, 5], logChance: 0.5, byproduct: "shavings", trunkCm: 92, sweet: notch(5), period: 2.2, motion: "pulse", knots: 2, lore: "Older than the stones round it. They say it hums to itself on quiet nights." },
  palm: { name: "Coconut Palm", emoji: "🌴", tier: 6, wood: "palm", respawnS: 195, rounds: [3, 5], logChance: 0.6, byproduct: "husk", trunkCm: 38, sweet: notch(6), period: 2.3, motion: "pulse", knots: 2, lore: "It leans to the sea wind and gives the same way it grows: slowly, and all at once." },
  ironwood: { name: "Drowned Ironwood", emoji: "🖤", tier: 7, wood: "ironwood", respawnS: 130, rounds: [4, 6], logChance: 0.5, byproduct: "ironbark", trunkCm: 60, sweet: notch(7), period: 2.4, motion: "pulse", knots: 2, lore: "It grew in the dark with its feet in the sea. Its wood sinks; its bark rings like a bell." },
};
export function isTreeKind(v: unknown): v is TreeKind {
  return typeof v === "string" && (TREE_KINDS as string[]).includes(v);
}
/** The Colossal trees a world event raises in one of the woods' clearings (2x, any axe, a steady ring
 *  with a generous notch, 5-6 rounds, felled together: TITAN is their common swing): the Colossal
 *  Silver Birch, Ancient Cedar, Autumn Maple (the Titan of old, and a save's default) and Primordial
 *  Elderwood. The notch is shared, so several can fell one at once: when it comes down its logs and
 *  its rare by-products are split between everyone who landed a round on it, by the rounds landed
 *  (the Titan Felling Lever's count 1.5x). */
export const TITAN = { kind: "maple" as TreeKind, scale: 2, rounds: [5, 6] as [number, number], logs: [4, 6] as [number, number], sweet: 0.12, period: 1.35, name: "Colossal Titan Maple" };
export type ColossalKind = "birch" | "cedar" | "maple" | "elderwood";
export const COLOSSAL_KINDS: ColossalKind[] = ["birch", "cedar", "maple", "elderwood"];
export function isColossalKind(v: unknown): v is ColossalKind {
  return typeof v === "string" && (COLOSSAL_KINDS as string[]).includes(v);
}
export interface ColossalInfo {
  name: string;
  emoji: string;
  /** The event's colour: the motes and the glow round its trunk (silver, moss, gold, azure). */
  fx: string;
  /** How many logs it comes down in (split between its fellers), and how often it rises (weights). */
  logs: [number, number];
  weight: number;
  /** Each round's shed (into the pouches), and what it gives up when it falls, split like the logs:
   *  a by-product or Pine Resin (`resin`), [least, most]. */
  roundDrop: ByproductId | null;
  haul: { id: ByproductId | "resin"; n: [number, number] } | null;
  blurb: string;
}
export const COLOSSAL: Record<ColossalKind, ColossalInfo> = {
  birch: { name: "Colossal Silver Birch", emoji: "🤍", fx: "#e8f1ff", logs: [15, 20], weight: 0.34, roundDrop: "bark", haul: { id: "silverBark", n: [4, 6] }, blurb: "Silvery-white bark shimmering in the light: 15-20 birch logs and 4-6 Silver Bark" },
  cedar: { name: "Colossal Ancient Cedar", emoji: "🌲", fx: "#8fcf78", logs: [14, 18], weight: 0.3, roundDrop: "amber", haul: { id: "resin", n: [3, 5] }, blurb: "Moss to its crown: 14-18 cedar logs and 3-5 Pine Resin" },
  maple: { name: "Colossal Autumn Maple", emoji: "🍁", fx: "#ffb347", logs: TITAN.logs, weight: 0.23, roundDrop: "leafAmber", haul: null, blurb: "A storm of golden leaves: heavy maple logs, and Golden Leaf Amber off every round" },
  elderwood: { name: "Colossal Primordial Elderwood", emoji: "🌌", fx: "#3d7bff", logs: [6, 8], weight: 0.13, roundDrop: "shavings", haul: { id: "heartwood", n: [1, 2] }, blurb: "A deep azure aura: elderwood logs and 1-2 Titan Heartwood" },
};
/** A Colossal's kind for its next rising (the finer, the rarer). */
export function rollColossal(rand: () => number = Math.random): ColossalKind {
  let r = rand() * COLOSSAL_KINDS.reduce((sum, k) => sum + COLOSSAL[k].weight, 0);
  for (const k of COLOSSAL_KINDS) {
    r -= COLOSSAL[k].weight;
    if (r < 0) return k;
  }
  return "maple";
}
/** Each of a Colossal's `n` logs' value multiplier (on its wood's price): together worth its
 *  COLOSSAL_YIELD at an even market. */
export const colossalLogMult = (kind: ColossalKind, n: number) => Math.round((COLOSSAL_YIELD[kind] / Math.max(1, n) / WOOD_PRICES[TREES[kind].wood]) * 1000) / 1000;
/** The Titan's (the Colossal Autumn Maple's) heavy logs: the old name. */
export const titanLogMult = (n: number) => colossalLogMult("maple", n);
/** A Colossal's haul split between its fellers by their weights (each one's rounds landed): the
 *  largest remainders get the odd ones out, so nothing is lost and nobody gets more than their due. */
export function splitShares(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (Math.max(0, w) / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}
/** The Titan Felling Lever: a landed round on a Colossal counts this much toward its owner's share. */
export const LEVER_SHARE = 1.5;
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
 *  it and the rounds it takes; a Colossal's kind (a clearing's tree is whichever Colossal rose there),
 *  and how many are felling it together. */
export interface TreeSync {
  stage: TreeStage;
  scale: number;
  dmg: number;
  rounds: number;
  kind?: TreeKind;
  crew?: number;
}
export function parseTrees(raw: string): Record<string, TreeSync> {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Record<string, TreeSync>) : {};
  } catch {
    return {};
  }
}

// --- the swing: a timing ring sweeping over the trunk's cross-section toward a sweet-spot ring ---
/** A Wood Knot in a T4 or T5 trunk: a red band on the ring (its radius, a share of the trunk's, and
 *  its half-width): a swing on it glances off. */
export interface WoodKnot {
  r: number;
  w: number;
}
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
  /** One sweep of the timing ring, bark to heart (s), and how it moves (a pendulum's full swing, in
   *  and back out, takes two). */
  period: number;
  motion: FellMotion;
  /** The trunk's Wood Knots (none below T4), and whether this feller's axe bites straight through
   *  them (a T5 axe, the Wedge & Mallet Kit): drawn faint, a plain miss. */
  knots: WoodKnot[];
  knotProof: boolean;
}
export type FellVerdict = "gold" | "hit" | "knot" | "miss";
/** A Wood Knot's deflection: the next swing waits this long (s). */
export const KNOT_RECOVER_S = 0.4;
/** A gold swing: its chance of a bonus, and the bonus (coins, or else a Pine Resin). */
export const FELL_CRIT_CHANCE = 0.4;
export const FELL_CRIT_COINS = 2;
/** The pause after a round that lands before the next swing's ring (s): the chips fly. */
export const FELL_ROUND_PAUSE_S = 0.4;

/** The timing ring's radius `t` seconds into the swing, from the bark (1) to the heart (0), as its
 *  motion moves it: a loop (steady, bark to heart again and again), a pendulum (in and back out,
 *  easing at each end), an accelerating sweep (slow at the bark, quick at the heart), a pulsing one
 *  (surging and easing three times a sweep, never turning back). */
export function fellRing(s: Pick<FellSwing, "period" | "motion">, t: number): number {
  const time = Math.max(0, t);
  if (s.motion === "pendulum") return 0.5 + 0.5 * Math.cos((Math.PI * time) / s.period);
  const u = (time / s.period) % 1;
  if (s.motion === "accel") return 1 - Math.pow(u, 1.7);
  if (s.motion === "pulse") return 1 - Math.min(1, u + (0.55 * Math.sin(2 * Math.PI * 3 * u)) / (2 * Math.PI * 3));
  return 1 - u;
}
/** A swing `t` seconds into it: on the gold centre, in the sweet band, on a Wood Knot, or a miss. */
export function judgeFell(s: FellSwing, t: number): FellVerdict {
  const r = fellRing(s, t);
  const d = Math.abs(r - s.sweet);
  if (d <= s.gold) return "gold";
  if (d <= s.band) return "hit";
  if (s.knots.some((k) => Math.abs(r - k.r) <= k.w)) return "knot";
  return "miss";
}
/** The Wood Knots' half-width (a share of the trunk's radius). */
export const KNOT_W = 0.045;
export interface FellSwingOpts {
  /** The Titan-Grip Gauntlets' (and Grip Wax's) wider gold, the Eagle Eye's wider notch, the ring
   *  slowed (the Deerskin Felling Gloves, Silverwood Sap Ointment). */
  goldBonus?: number;
  zoneBonus?: number;
  slowBonus?: number;
  /** A Colossal (the common Colossal swing, whatever its kind). */
  colossal?: boolean;
  /** The Wood Knots bitten straight through (a T5 axe, the Wedge & Mallet Kit). */
  knotProof?: boolean;
}
/** A fresh swing's ring (the server rolls it): the notch (the sweet spot) somewhere in the trunk's
 *  middle, its tier's width widened by the axe (and the Eagle Eye), its gold by the Titan-Grip
 *  Gauntlets and Grip Wax, the ring slowed by the axe (and the gloves, the ointment), moving its
 *  tier's way; a T4 or T5 trunk's Wood Knots kept clear of the notch. The heavier rounds come a touch
 *  quicker. */
export function rollFellSwing(tree: string, kind: TreeKind, round: number, rounds: number, axe: AxeId, rand: () => number = Math.random, opts: FellSwingOpts = {}): FellSwing {
  const info = TREES[kind];
  const colossal = !!opts.colossal;
  const sweetW = (colossal ? TITAN.sweet : info.sweet) * (1 + AXES[axe].zoneBonus) * (1 + (opts.zoneBonus ?? 0));
  const period = (colossal ? TITAN.period : info.period) / (1 - AXES[axe].slow) / (1 - Math.min(0.6, opts.slowBonus ?? 0)) / (1 + 0.04 * (round - 1));
  const sweet = 0.3 + rand() * 0.35;
  const band = sweetW / 2;
  const knots: WoodKnot[] = [];
  const count = colossal ? 0 : info.knots;
  for (let k = 0; k < count; k++) {
    // a knot somewhere in the wood, clear of the notch (and of any knot already placed)
    for (let tries = 0; tries < 12; tries++) {
      const r = 0.14 + rand() * 0.78;
      if (Math.abs(r - sweet) < band + KNOT_W + 0.05) continue;
      if (knots.some((o) => Math.abs(o.r - r) < 2 * KNOT_W + 0.03)) continue;
      knots.push({ r: Math.round(r * 1000) / 1000, w: KNOT_W });
      break;
    }
  }
  return { tree, kind, round, rounds, sweet, band, gold: Math.min(band, band * 0.38 * (1 + (opts.goldBonus ?? 0))), period, motion: colossal ? "loop" : info.motion, knots, knotProof: !!opts.knotProof };
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
  { id: "carrier_tier_6", name: "Tidewater Timber Sled", capacity: CARRIER_CAPACITY[5], price: CARRIER_PRICES[5], icon: "🛷" },
  { id: "carrier_tier_7", name: "Deep Tide Timber Barrow", capacity: CARRIER_CAPACITY[6], price: CARRIER_PRICES[6], icon: "🛞" },
];
/** A Coconut Palm's landed round now and then shakes a coconut down as well (into the materials). */
export const COCONUT_CHANCE = 0.15;
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
