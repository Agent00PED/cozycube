// The angler's world, as both sides see it: what swims in each water, how big it runs and how
// long it takes to bite; the rods and baits Barnaby the Angler sells; the Fish Creel every angler
// carries (what they caught, and their best of each kind), and what he pays for it.
//
// The server rolls every catch (rollFish, rollCatch) and keeps each angler's FishingProfile in
// their player record (it survives room switches, reconnects and restarts); the client draws the
// same tables in the reel, the creel and Barnaby's shop.

import type { SwimPattern } from "./types";
import { BYPRODUCT_IDS, TREE_KINDS, WOOD_CARRIER_TIERS, WOOD_KINDS, carrierCapacity, isAxeId, type AxeId, type ByproductId, type TreeKind, type WoodKind } from "./chop";
import { PACK_FRAME_SLOTS, TACKLE_BOX_SLOTS, isCraftId, type CraftItem } from "./crafting";
import { carrierBonus, fitWorn, isGearId, livewellBonus, type GearId } from "./gear";
import { CREEL_CAPACITY, CREEL_PRICES, FISH_PRICES, MAX_DAY_PERMITS, TACKLE_PRICES } from "./economy";

export type Water = "freshwater" | "saltwater";
/** The five rarities, and the rod tier each needs (a rod lands its own rarity and below). */
export type FishTier = "common" | "uncommon" | "rare" | "legendary" | "mythic";
export const FISH_TIER_RANK: Record<FishTier, number> = { common: 1, uncommon: 2, rare: 3, legendary: 4, mythic: 5 };

export interface FishSpecies {
  name: string;
  emoji: string;
  water: Water;
  tier: FishTier;
  /** How often it bites, against the rest of its water. */
  weight: number;
  /** Seconds from the cast to its bite: bigger fish take their time. */
  bite: readonly [number, number];
  /** How long it runs, in cm. */
  cm: readonly [number, number];
  /** What Barnaby pays for an average one-star fish. */
  value: number;
  /** How it fights in the reel: how often and how fast it darts, how hard it pulls, the green bar's height (1 full). */
  speed: number;
  size: number;
  pattern: SwimPattern;
  barScale: number;
  /** When it bites: by day or by night (shared/daynight.ts). */
  time: "day" | "night";
  /** Only in the Whispering Woods' rapids (the legendaries and the mythics). */
  rapids?: boolean;
  /** Its heft: kilograms for a fish a metre long (a weight goes with the cube of its length). */
  mass: number;
}

export const FISH = {
  // freshwater: the Starlight Campfire's river and the Whispering Woods' rapids, fifteen kinds by day
  // and fifteen by night. Of every bite, commons are 70%, uncommons 20%, rares 7.5%, legendaries 2%
  // and mythics 0.5% (shared/economy.ts FISH_TIER_ODDS, split by the weights); the legendaries and
  // mythics bite only in the rapids. `cm` is the usual span (the bell curve's middle 95%: a fish longer
  // than its top is King Size), `value` Barnaby's base price (shared/economy.ts FISH_PRICES).
  // by day
  minnow: { name: "Minnow", emoji: "🐟", water: "freshwater", tier: "common", weight: 14, bite: [3, 5], cm: [5, 11], value: FISH_PRICES.minnow, speed: 0.5, size: 0.5, pattern: "sine", barScale: 1, time: "day", mass: 9 },
  perch: { name: "Perch", emoji: "🐠", water: "freshwater", tier: "common", weight: 14, bite: [3, 6], cm: [15, 30], value: FISH_PRICES.perch, speed: 0.6, size: 0.55, pattern: "erratic", barScale: 1, time: "day", mass: 13 },
  bluegill: { name: "Bluegill Sunfish", emoji: "🐠", water: "freshwater", tier: "common", weight: 14, bite: [3, 5], cm: [12, 24], value: FISH_PRICES.bluegill, speed: 0.55, size: 0.5, pattern: "sine", barScale: 1, time: "day", mass: 25 },
  dace: { name: "Silver Dace", emoji: "🐟", water: "freshwater", tier: "common", weight: 14, bite: [3, 5], cm: [10, 20], value: FISH_PRICES.dace, speed: 0.55, size: 0.5, pattern: "sine", barScale: 1, time: "day", mass: 10 },
  chub: { name: "Creek Chub", emoji: "🐟", water: "freshwater", tier: "common", weight: 14, bite: [3, 6], cm: [20, 40], value: FISH_PRICES.chub, speed: 0.6, size: 0.6, pattern: "erratic", barScale: 1, time: "day", mass: 12 },
  trout: { name: "Trout", emoji: "🐟", water: "freshwater", tier: "uncommon", weight: 5, bite: [4, 7], cm: [25, 50], value: FISH_PRICES.trout, speed: 0.8, size: 0.7, pattern: "erratic", barScale: 0.95, time: "day", mass: 10 },
  smallmouth_bass: { name: "Smallmouth Bass", emoji: "🐟", water: "freshwater", tier: "uncommon", weight: 5, bite: [4, 7], cm: [25, 50], value: FISH_PRICES.smallmouth_bass, speed: 0.85, size: 0.75, pattern: "plunge", barScale: 0.95, time: "day", mass: 14 },
  grayling: { name: "Arctic Grayling", emoji: "🐟", water: "freshwater", tier: "uncommon", weight: 5, bite: [4, 7], cm: [25, 45], value: FISH_PRICES.grayling, speed: 0.8, size: 0.7, pattern: "sine", barScale: 0.95, time: "day", mass: 9 },
  pike: { name: "Northern Pike", emoji: "🐊", water: "freshwater", tier: "uncommon", weight: 5, bite: [5, 8], cm: [45, 100], value: FISH_PRICES.pike, speed: 0.9, size: 0.8, pattern: "plunge", barScale: 0.92, time: "day", mass: 7 },
  salmon: { name: "Salmon", emoji: "🐟", water: "freshwater", tier: "rare", weight: 2.5, bite: [6, 10], cm: [50, 85], value: FISH_PRICES.salmon, speed: 1.05, size: 0.85, pattern: "plunge", barScale: 0.9, time: "day", mass: 11 },
  golden_trout: { name: "Golden Trout", emoji: "🐟", water: "freshwater", tier: "rare", weight: 2.5, bite: [6, 10], cm: [25, 50], value: FISH_PRICES.golden_trout, speed: 1.1, size: 0.8, pattern: "erratic", barScale: 0.88, time: "day", mass: 10 },
  muskellunge: { name: "Muskellunge", emoji: "🐊", water: "freshwater", tier: "rare", weight: 2.5, bite: [7, 11], cm: [80, 140], value: FISH_PRICES.muskellunge, speed: 1.1, size: 0.95, pattern: "plunge", barScale: 0.85, time: "day", mass: 7 },
  golden_arowana: { name: "Golden Arowana", emoji: "🐉", water: "freshwater", tier: "legendary", weight: 1, bite: [8, 13], cm: [60, 95], value: FISH_PRICES.golden_arowana, speed: 1.35, size: 0.95, pattern: "erratic", barScale: 0.75, time: "day", rapids: true, mass: 8 },
  dawn_paddlefish: { name: "Dawn Paddlefish", emoji: "🦈", water: "freshwater", tier: "legendary", weight: 1, bite: [8, 13], cm: [100, 180], value: FISH_PRICES.dawn_paddlefish, speed: 1.3, size: 1.0, pattern: "plunge", barScale: 0.75, time: "day", rapids: true, mass: 7 },
  sunfire_koi: { name: "Sunfire Koi", emoji: "🎏", water: "freshwater", tier: "mythic", weight: 0.5, bite: [10, 15], cm: [60, 100], value: FISH_PRICES.sunfire_koi, speed: 1.55, size: 1.0, pattern: "koi", barScale: 0.65, time: "day", rapids: true, mass: 14 },
  // by night
  bullhead: { name: "Brown Bullhead", emoji: "🐡", water: "freshwater", tier: "common", weight: 14, bite: [3, 5], cm: [15, 30], value: FISH_PRICES.bullhead, speed: 0.55, size: 0.55, pattern: "plunge", barScale: 1, time: "night", mass: 13 },
  moon_shiner: { name: "Moon Shiner", emoji: "🐟", water: "freshwater", tier: "common", weight: 14, bite: [3, 5], cm: [6, 12], value: FISH_PRICES.moon_shiner, speed: 0.5, size: 0.45, pattern: "sine", barScale: 1, time: "night", mass: 8 },
  stone_loach: { name: "Stone Loach", emoji: "🐟", water: "freshwater", tier: "common", weight: 14, bite: [3, 6], cm: [8, 14], value: FISH_PRICES.stone_loach, speed: 0.55, size: 0.45, pattern: "erratic", barScale: 1, time: "night", mass: 7 },
  sculpin: { name: "Slimy Sculpin", emoji: "🐡", water: "freshwater", tier: "common", weight: 14, bite: [3, 5], cm: [8, 16], value: FISH_PRICES.sculpin, speed: 0.6, size: 0.5, pattern: "erratic", barScale: 1, time: "night", mass: 12 },
  glass_eel: { name: "Glass Eel", emoji: "🐍", water: "freshwater", tier: "common", weight: 14, bite: [3, 6], cm: [20, 40], value: FISH_PRICES.glass_eel, speed: 0.6, size: 0.5, pattern: "sine", barScale: 1, time: "night", mass: 3 },
  catfish: { name: "Catfish", emoji: "🐡", water: "freshwater", tier: "uncommon", weight: 5, bite: [5, 8], cm: [35, 75], value: FISH_PRICES.catfish, speed: 0.85, size: 0.8, pattern: "plunge", barScale: 0.95, time: "night", mass: 12 },
  burbot: { name: "Burbot", emoji: "🐍", water: "freshwater", tier: "uncommon", weight: 5, bite: [5, 8], cm: [30, 60], value: FISH_PRICES.burbot, speed: 0.8, size: 0.75, pattern: "plunge", barScale: 0.95, time: "night", mass: 8 },
  walleye: { name: "Walleye", emoji: "🐟", water: "freshwater", tier: "uncommon", weight: 5, bite: [5, 8], cm: [35, 65], value: FISH_PRICES.walleye, speed: 0.85, size: 0.75, pattern: "erratic", barScale: 0.95, time: "night", mass: 10 },
  lantern_perch: { name: "Lantern Perch", emoji: "🏮", water: "freshwater", tier: "uncommon", weight: 5, bite: [4, 7], cm: [18, 32], value: FISH_PRICES.lantern_perch, speed: 0.8, size: 0.6, pattern: "sine", barScale: 0.95, time: "night", mass: 14 },
  sturgeon: { name: "Sturgeon", emoji: "🦈", water: "freshwater", tier: "rare", weight: 2.5, bite: [7, 11], cm: [90, 180], value: FISH_PRICES.sturgeon, speed: 1.1, size: 0.95, pattern: "plunge", barScale: 0.85, time: "night", mass: 9 },
  ghost_carp: { name: "Ghost Carp", emoji: "👻", water: "freshwater", tier: "rare", weight: 2.5, bite: [6, 10], cm: [45, 80], value: FISH_PRICES.ghost_carp, speed: 1.05, size: 0.9, pattern: "koi", barScale: 0.88, time: "night", mass: 16 },
  silver_gar: { name: "Silver Gar", emoji: "🐊", water: "freshwater", tier: "rare", weight: 2.5, bite: [6, 10], cm: [60, 110], value: FISH_PRICES.silver_gar, speed: 1.1, size: 0.85, pattern: "erratic", barScale: 0.86, time: "night", mass: 5 },
  abyssal_koi: { name: "Abyssal Koi", emoji: "🎏", water: "freshwater", tier: "legendary", weight: 1, bite: [9, 14], cm: [55, 90], value: FISH_PRICES.abyssal_koi, speed: 1.45, size: 1.0, pattern: "koi", barScale: 0.7, time: "night", rapids: true, mass: 15 },
  starlight_eel: { name: "Starlight Eel", emoji: "🐍", water: "freshwater", tier: "legendary", weight: 1, bite: [9, 14], cm: [80, 150], value: FISH_PRICES.starlight_eel, speed: 1.4, size: 0.95, pattern: "sine", barScale: 0.72, time: "night", rapids: true, mass: 3 },
  moonveil_leviathan: { name: "Moonveil Leviathan", emoji: "🐋", water: "freshwater", tier: "mythic", weight: 0.5, bite: [11, 16], cm: [150, 260], value: FISH_PRICES.moonveil_leviathan, speed: 1.6, size: 1.0, pattern: "plunge", barScale: 0.62, time: "night", rapids: true, mass: 10 },
  // saltwater: the Sunset Beach Bar's pier (registered for when it opens its waters)
  sand_sardine: { name: "Sand Sardine", emoji: "🐟", water: "saltwater", tier: "common", weight: 42, bite: [3, 5], cm: [8, 18], value: 2, speed: 0.55, size: 0.5, pattern: "sine", barScale: 1, time: "day", mass: 8 },
  sunset_clownfish: { name: "Sunset Clownfish", emoji: "🐠", water: "saltwater", tier: "uncommon", weight: 30, bite: [4, 7], cm: [7, 14], value: 6, speed: 0.85, size: 0.6, pattern: "erratic", barScale: 1, time: "day", mass: 15 },
  prism_jellyfish: { name: "Prism Jellyfish", emoji: "🪼", water: "saltwater", tier: "rare", weight: 18, bite: [6, 10], cm: [15, 40], value: 14, speed: 0.75, size: 0.85, pattern: "sine", barScale: 0.9, time: "night", mass: 4 },
  pearl_whale: { name: "Abyssal Pearl Whale", emoji: "🐳", water: "saltwater", tier: "legendary", weight: 4, bite: [9, 14], cm: [120, 260], value: 120, speed: 1.35, size: 1.0, pattern: "plunge", barScale: 0.7, time: "night", mass: 10 },
} as const satisfies Record<string, FishSpecies>;
export type FishId = keyof typeof FISH;
export const FISH_IDS = Object.keys(FISH) as FishId[];
export function isFishId(v: unknown): v is FishId {
  return typeof v === "string" && v in FISH;
}
export function fishOf(water: Water): FishId[] {
  return FISH_IDS.filter((id) => FISH[id].water === water);
}

export const TIER_LABEL: Record<FishTier, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary ✨", mythic: "Mythic 🌌" };
/** Each tier's colour on a chip (the reveal, the Nature Logbook). */
export const TIER_COLOR: Record<FishTier, string> = { common: "#C9BDB5", uncommon: "#8fd3b6", rare: "#9ecbff", legendary: "#F5A623", mythic: "#ec7fa3" };
const RARE_TIERS: ReadonlySet<FishTier> = new Set(["rare", "legendary", "mythic"]);
/** A fish's weight (kg) from its length: its kind's heft, with the cube of its length. */
export function fishKg(f: Pick<CreelFish, "s" | "cm">): number {
  const m = f.cm / 100;
  return Math.max(0.01, Math.round(FISH[f.s].mass * m * m * m * 100) / 100);
}

// --- rods and baits -----------------------------------------------------------------------------

export interface Rod {
  name: string;
  emoji: string;
  /** T1 to T5: the rarest fish it can land (a rod holds its own rarity and below: FISH_TIER_RANK). */
  tier: number;
  price: number;
  /** The reel's green bar grows by this (0.2: +20%). */
  barBonus: number;
  /** Line tension builds this much slower (0.35: 35% slower). */
  tensionResist: number;
  /** A starry shimmer about the angler while it is in hand. */
  aura: boolean;
  blurb: string;
}
export const RODS = {
  bamboo: { name: "Basic Bamboo Rod", emoji: "🎋", tier: 1, price: 0, barBonus: 0, tensionResist: 0, aura: false, blurb: "T1: common fish. Light, springy and everyone's first." },
  willow: { name: "Pro Carbon Rod", emoji: "🎣", tier: 2, price: TACKLE_PRICES.proRod, barBonus: 0.2, tensionResist: 0, aura: false, blurb: "T2: lands uncommon fish. +20% green reel bar." },
  heron: { name: "Heron Fiberglass Rod", emoji: "🪶", tier: 3, price: TACKLE_PRICES.heronRod, barBonus: 0.2, tensionResist: 0.15, aura: false, blurb: "T3: lands rare fish. +20% bar, the line holds 15% longer." },
  starlight: { name: "Starlight Master Rod", emoji: "🌠", tier: 4, price: TACKLE_PRICES.masterRod, barBonus: 0.2, tensionResist: 0.35, aura: true, blurb: "T4: lands legendary fish. +20% bar, the line holds 35% longer, and a star aura." },
  moonlight: { name: "Mythril Moonlight Rod", emoji: "🌙", tier: 5, price: TACKLE_PRICES.moonlightRod, barBonus: 0.3, tensionResist: 0.45, aura: true, blurb: "T5: lands mythic fish. +30% bar, the line holds 45% longer, and a moonlit aura." },
} as const satisfies Record<string, Rod>;
export type RodId = keyof typeof RODS;
export const ROD_IDS = Object.keys(RODS) as RodId[];
export function isRodId(v: unknown): v is RodId {
  return typeof v === "string" && v in RODS;
}
/** The rods in tier order. */
export const RODS_BY_TIER: RodId[] = [...ROD_IDS].sort((a, b) => RODS[a].tier - RODS[b].tier);
/** Whether a rod can land a fish of this rarity. */
export const rodLands = (rod: RodId, tier: FishTier) => RODS[rod].tier >= FISH_TIER_RANK[tier];

export interface Bait {
  name: string;
  emoji: string;
  /** A pack of `pack` baits costs `price`; one goes on each cast. */
  price: number;
  pack: number;
  /** Bites come this much sooner (0.6: 60% of the wait). */
  biteMul: number;
  /** Rare, epic and legendary fish bite this many times as often. */
  rareMul: number;
  /** After dark it works differently (the Glow-Crickets shine by night). */
  night?: { biteMul: number; rareMul: number };
  blurb: string;
}
/** Finley's (and Barnaby's) bait packs, humblest first. The first and last keep their old ids (a
 *  pack bought before is the same pack). Stardust Pellets are the premium bait: an AFK line on them
 *  waits a quarter less. */
export const BAITS = {
  glowworm: { name: "Earthworms", emoji: "🪱", price: TACKLE_PRICES.basicBait, pack: 5, biteMul: 0.6, rareMul: 1, blurb: "Bites come 40% sooner." },
  corn: { name: "Sweet Corn Dough", emoji: "🌽", price: TACKLE_PRICES.cornDough, pack: 5, biteMul: 0.75, rareMul: 1.3, blurb: "Bites 25% sooner, and rarer fish a little more often." },
  cricket: { name: "Glow-Crickets", emoji: "🦗", price: TACKLE_PRICES.glowCricket, pack: 4, biteMul: 0.85, rareMul: 1.1, night: { biteMul: 0.5, rareMul: 1.8 }, blurb: "By night: bites twice as fast and rare fish 1.8x as often." },
  larva: { name: "Dragonfly Larva", emoji: "🐛", price: TACKLE_PRICES.dragonflyLarva, pack: 3, biteMul: 0.9, rareMul: 2, blurb: "Rare fish bite twice as often." },
  stardrop: { name: "Stardust Pellets", emoji: "🌟", price: TACKLE_PRICES.luckyChum, pack: 3, biteMul: 1, rareMul: 2.5, blurb: "Rare and legendary fish bite 2.5x as often; AFK lines wait a quarter less." },
} as const satisfies Record<string, Bait>;
/** A bait's pull right now (the Glow-Crickets' by night). */
export function baitEffect(bait: BaitId, night: boolean): { biteMul: number; rareMul: number } {
  const b: Bait = BAITS[bait];
  return night && b.night ? b.night : { biteMul: b.biteMul, rareMul: b.rareMul };
}
export type BaitId = keyof typeof BAITS;
export const BAIT_IDS = Object.keys(BAITS) as BaitId[];
export function isBaitId(v: unknown): v is BaitId {
  return typeof v === "string" && v in BAITS;
}

// --- the creel ----------------------------------------------------------------------------------

/** A fish in the creel: its kind, its length and its quality (1-3 stars); `l` a fish locked as a
 *  favourite (no sale takes it, one at a time or all at once, and it stays out of the stew). */
export interface CreelFish {
  s: FishId;
  cm: number;
  q: 1 | 2 | 3;
  l?: true;
}
/** The creel progression: what the angler keeps their catch in, from a starter pail to a livewell.
 *  Barnaby sells each next one in turn (tier 1 is everyone's to start). */
export interface CreelTier {
  id: string;
  name: string;
  capacity: number;
  price: number;
  icon: string;
}
export const CREEL_TIERS: CreelTier[] = [
  { id: "creel_tier_1", name: "Wooden Pail", capacity: CREEL_CAPACITY[0], price: CREEL_PRICES[0], icon: "🪵" },
  { id: "creel_tier_2", name: "Woven Reed Livewell", capacity: CREEL_CAPACITY[1], price: CREEL_PRICES[1], icon: "🧺" },
  { id: "creel_tier_3", name: "Canvas Livewell", capacity: CREEL_CAPACITY[2], price: CREEL_PRICES[2], icon: "🎒" },
  { id: "creel_tier_4", name: "Ice Cooler Livewell", capacity: CREEL_CAPACITY[3], price: CREEL_PRICES[3], icon: "🧊" },
  { id: "creel_tier_5", name: "Starlight Deep Livewell", capacity: CREEL_CAPACITY[4], price: CREEL_PRICES[4], icon: "✨" },
];
/** A creel tier (1-based, clamped), and the next one up (null at the top). */
export function creelTier(tier: number): CreelTier {
  return CREEL_TIERS[Math.max(1, Math.min(CREEL_TIERS.length, Math.round(tier) || 1)) - 1];
}
export function nextCreelTier(tier: number): CreelTier | null {
  return CREEL_TIERS[Math.round(tier)] ?? null;
}
/** The livewell's room: its tier's slots, the Tackle Master's Holster's four more, and the
 *  Reinforced Tackle Box's three (carved once, for good). */
export function livewellCap(p: Pick<FishingProfile, "slots" | "worn" | "tackleBox">): number {
  return p.slots + livewellBonus(p.worn) + (p.tackleBox ? TACKLE_BOX_SLOTS : 0);
}
/** Whether the creel has no room for another fish. */
export function creelFull(p: Pick<FishingProfile, "creel" | "slots" | "worn" | "tackleBox">): boolean {
  return p.creel.length >= livewellCap(p);
}
/** A full creel: a fresh common catch goes back in the river, and this is paid for letting it go. */
export const CREEL_RELEASE_COINS = 1;

/** Everything the angler carries between visits: the creel, their rods and baits, their records
 *  (the longest of each kind), and how long they have left being Well-Fed. */
export interface FishingProfile {
  creel: CreelFish[];
  /** The livewell's tier (1-5, CREEL_TIERS), and its capacity (always that tier's; a creel from
   *  before the downsizing may hold more: it keeps them, and takes no more until it is under). */
  creelTier: number;
  slots: number;
  rod: RodId;
  rods: RodId[];
  baits: Partial<Record<BaitId, number>>;
  /** The bait on the hook ("" none): one goes on each cast while any are left. */
  bait: BaitId | "";
  records: Partial<Record<FishId, number>>;
  /** The Field Guide's ledger: the most Barnaby ever paid for one of each kind, and how many of
   *  each have been landed. */
  best: Partial<Record<FishId, number>>;
  caught: Partial<Record<FishId, number>>;
  /** Well-Fed until (epoch ms, the server's clock). */
  fedUntil: number;
  /** The camp's other kit: split wood by kind (to burn or sell to Buster), and the axe in hand and those owned. */
  wood: Record<WoodKind, number>;
  /** Beside each count, the sum of its logs' value multipliers (a big tree's logs are worth more:
   *  shared/chop.ts logMultiplier; missing: 1x each). */
  woodValue: Partial<Record<WoodKind, number>>;
  axe: AxeId;
  axes: AxeId[];
  /** The wood carrier's tier (1-5, shared/chop.ts WOOD_CARRIER_TIERS): how many slots it has for
   *  logs and crafted pieces together (the soft clamp: a load from before stays, new wood waits). */
  carrierTier: number;
  /** Carved pieces from the workbenches, stacked in their own crate (shared/crafting.ts: no carrier
   *  slots, up to MAX_CRAFT_STACK of a kind). */
  crafts: CraftItem[];
  /** The things carved once, for good: the Marshmallow Roasting Stick, the Lumberjack Pack Frame
   *  (+5 carrier slots), the Reinforced Tackle Box (+3 livewell slots). */
  roastingStick: boolean;
  packFrame: boolean;
  tackleBox: boolean;
  /** The accessories owned (shared/gear.ts), and those worn (oldest first: a third ring takes the
   *  oldest one's place); only what is worn works. */
  gear: GearId[];
  worn: GearId[];
  /** Pine Resin (from critical chops): sap, not wood, so it rides in its own jar beside the carrier
   *  (no slots, no limit); it glues a carving at the workbench's Adhesive Slot, and Buster buys it.
   *  Sawdust (from broken carvings; +15% on the bonfire) rides in a pouch, no slots either. */
  resin: number;
  sawdust: number;
  /** The felling's by-products, each in its own pouch beside the carrier (no slots). */
  byproducts: Partial<Record<ByproductId, number>>;
  /** Firewood bundles split at the chopping block (shared/chop.ts WOOD firewood): tied beside the
   *  carrier, no slots; each feeds the bonfire FIREWOOD_FUEL. */
  firewood: number;
  /** The Whispering Woods: Day Trip Permits held (one used on each way in) and the Ranger's Badge
   *  (in for good). */
  dayPermits: number;
  ranger: boolean;
  /** The Eagle Eye (the slingshot gallery's best prize) until (epoch ms): wider green zones. */
  eagleUntil: number;
  /** The Nature Logbook's trees: how many of each kind this player has felled. */
  felled: Partial<Record<TreeKind, number>>;
  /** The slingshot gallery's best score. */
  slingBest: number;
  /** The Logbook's Timber Collection: the widest trunk felled of each kind (cm), and the most a
   *  single log of each wood ever sold for. */
  trunkRecord: Partial<Record<TreeKind, number>>;
  bestLog: Partial<Record<WoodKind, number>>;
}
export function emptyFishingProfile(): FishingProfile {
  const wood = Object.fromEntries(WOOD_KINDS.map((k) => [k, 0])) as Record<WoodKind, number>;
  return { creel: [], creelTier: 1, slots: CREEL_TIERS[0].capacity, rod: "bamboo", rods: ["bamboo"], baits: {}, bait: "", records: {}, best: {}, caught: {}, fedUntil: 0, wood, woodValue: {}, axe: "rusty", axes: ["rusty"], carrierTier: 1, crafts: [], roastingStick: false, packFrame: false, tackleBox: false, gear: [], worn: [], resin: 0, sawdust: 0, byproducts: {}, firewood: 0, dayPermits: 0, ranger: false, eagleUntil: 0, felled: {}, slingBest: 0, trunkRecord: {}, bestLog: {} };
}
/** How much split wood the profile holds, all kinds together. */
export function woodCount(p: Pick<FishingProfile, "wood">): number {
  return WOOD_KINDS.reduce((sum, k) => sum + (p.wood[k] ?? 0), 0);
}
/** How full the wood carrier is: every log takes a slot (the carved pieces stack in their own
 *  crate, up to MAX_CRAFT_STACK of a kind; Pine Resin, Sawdust, the by-products and Firewood ride
 *  beside it: none take a slot). */
export function carrierLoad(p: Pick<FishingProfile, "wood">): number {
  return woodCount(p);
}
/** The most carved pieces of one kind the crate stacks. */
export const MAX_CRAFT_STACK = 99;
/** The carrier's room: its tier's slots, the Forester's Toolbelt's five more, and the Lumberjack
 *  Pack Frame's five (carved once, for good). */
export function carrierCap(p: Pick<FishingProfile, "carrierTier" | "worn" | "packFrame">): number {
  return carrierCapacity(p.carrierTier) + carrierBonus(p.worn) + (p.packFrame ? PACK_FRAME_SLOTS : 0);
}
/** A profile read back from storage (or the network), with anything unknown or broken dropped. */
export function sanitizeFishingProfile(raw: unknown): FishingProfile {
  const p = emptyFishingProfile();
  if (!raw || typeof raw !== "object") return p;
  const r = raw as Record<string, unknown>;
  // the creel's tier; a profile from before the tiers (a creel of 6-12 slots) moves up to the
  // smallest tier that holds all it held, so nothing is ever lost in the move
  const legacy = Math.max(Number(r.slots) || 0, Array.isArray(r.creel) ? r.creel.length : 0);
  const tier = Number(r.creelTier) >= 1 ? Math.round(Number(r.creelTier)) : legacy > 0 ? CREEL_TIERS.findIndex((t) => t.capacity >= legacy) + 1 || CREEL_TIERS.length : 1;
  p.creelTier = Math.max(1, Math.min(CREEL_TIERS.length, tier));
  p.slots = creelTier(p.creelTier).capacity;
  if (Array.isArray(r.creel)) {
    for (const f of r.creel) {
      const fish = f as Record<string, unknown>;
      if (!isFishId(fish?.s)) continue;
      const q = Number(fish.q);
      p.creel.push({ s: fish.s, cm: Math.max(1, Math.round(Number(fish.cm) || 1)), q: q === 3 ? 3 : q === 2 ? 2 : 1, ...(fish.l === true ? { l: true as const } : {}) });
      // (the soft clamp: a creel over its tier's slots keeps every fish; only new catches wait)
      if (p.creel.length >= 999) break;
    }
  }
  if (Array.isArray(r.rods)) p.rods = Array.from(new Set(["bamboo" as RodId, ...r.rods.filter(isRodId)]));
  p.rod = isRodId(r.rod) && p.rods.includes(r.rod) ? r.rod : "bamboo";
  if (r.baits && typeof r.baits === "object") {
    for (const id of BAIT_IDS) {
      const n = Math.max(0, Math.min(99, Math.round(Number((r.baits as Record<string, unknown>)[id]) || 0)));
      if (n > 0) p.baits[id] = n;
    }
  }
  p.bait = isBaitId(r.bait) ? r.bait : "";
  if (r.records && typeof r.records === "object") {
    for (const id of FISH_IDS) {
      const cm = Number((r.records as Record<string, unknown>)[id]);
      if (cm > 0) p.records[id] = Math.round(cm);
    }
  }
  for (const [key, into] of [["best", p.best], ["caught", p.caught]] as const) {
    const src = r[key];
    if (!src || typeof src !== "object") continue;
    for (const id of FISH_IDS) {
      const n = Math.round(Number((src as Record<string, unknown>)[id]));
      if (n > 0) into[id] = Math.min(999_999, n);
    }
  }
  p.fedUntil = Math.max(0, Number(r.fedUntil) || 0);
  if (r.wood && typeof r.wood === "object") {
    for (const k of WOOD_KINDS) p.wood[k] = Math.max(0, Math.min(999, Math.round(Number((r.wood as Record<string, unknown>)[k]) || 0)));
  }
  if (r.woodValue && typeof r.woodValue === "object") {
    for (const k of WOOD_KINDS) {
      const v = Number((r.woodValue as Record<string, unknown>)[k]);
      // at most 9x a log (a Titan's are 3x, a 1.35x tree's 1.8x)
      if (p.wood[k] > 0 && v > 0 && Number.isFinite(v)) p.woodValue[k] = Math.min(v, p.wood[k] * 9);
    }
  }
  if (Array.isArray(r.axes)) p.axes = Array.from(new Set(["rusty" as AxeId, ...r.axes.filter(isAxeId)]));
  p.axe = isAxeId(r.axe) && p.axes.includes(r.axe) ? r.axe : "rusty";
  if (Array.isArray(r.crafts)) {
    for (const it of r.crafts) {
      const item = it as Record<string, unknown>;
      if (isCraftId(item?.c)) p.crafts.push({ c: item.c, m: item.m === true });
      if (p.crafts.length >= 999) break;
    }
  }
  p.roastingStick = r.roastingStick === true;
  p.packFrame = r.packFrame === true;
  p.tackleBox = r.tackleBox === true;
  if (Array.isArray(r.gear)) p.gear = Array.from(new Set(r.gear.filter(isGearId)));
  // what is worn (a profile from before the slots: everything owned that fits goes on)
  p.worn = fitWorn(Array.isArray(r.worn) ? r.worn.filter(isGearId) : p.gear, p.gear);
  p.resin = Math.max(0, Math.min(999, Math.round(Number(r.resin) || 0)));
  p.sawdust = Math.max(0, Math.min(999, Math.round(Number(r.sawdust) || 0)));
  if (r.byproducts && typeof r.byproducts === "object") {
    for (const k of BYPRODUCT_IDS) {
      const n = Math.max(0, Math.min(999, Math.round(Number((r.byproducts as Record<string, unknown>)[k]) || 0)));
      if (n > 0) p.byproducts[k] = n;
    }
  }
  p.firewood = Math.max(0, Math.min(9999, Math.round(Number(r.firewood) || 0)));
  p.dayPermits = Math.max(0, Math.min(MAX_DAY_PERMITS, Math.round(Number(r.dayPermits) || 0)));
  p.ranger = r.ranger === true;
  p.eagleUntil = Math.max(0, Number(r.eagleUntil) || 0);
  p.slingBest = Math.max(0, Math.min(1_000_000, Math.round(Number(r.slingBest) || 0)));
  if (r.trunkRecord && typeof r.trunkRecord === "object") {
    for (const k of TREE_KINDS) {
      const cm = Math.round(Number((r.trunkRecord as Record<string, unknown>)[k]) || 0);
      if (cm > 0) p.trunkRecord[k] = Math.min(999, cm);
    }
  }
  if (r.bestLog && typeof r.bestLog === "object") {
    for (const k of WOOD_KINDS) {
      const c = Math.round(Number((r.bestLog as Record<string, unknown>)[k]) || 0);
      if (c > 0) p.bestLog[k] = Math.min(99_999, c);
    }
  }
  if (r.felled && typeof r.felled === "object") {
    for (const k of TREE_KINDS) {
      const n = Math.round(Number((r.felled as Record<string, unknown>)[k]) || 0);
      if (n > 0) p.felled[k] = Math.min(999_999, n);
    }
  }
  // the carrier's tier; one from before the tiers (levels 1-3: 6, 12, 20 logs) moves up to the
  // smallest tier that holds all it held, so nothing is lost in the move
  if (Number(r.carrierTier) >= 1) p.carrierTier = Math.min(WOOD_CARRIER_TIERS.length, Math.round(Number(r.carrierTier)));
  else {
    const legacy = Math.max([0, 6, 12, 20][Math.round(Number(r.carrier) || 0)] ?? 0, carrierLoad(p));
    p.carrierTier = WOOD_CARRIER_TIERS.findIndex((t) => t.capacity >= legacy) + 1 || WOOD_CARRIER_TIERS.length;
  }
  return p;
}

/** What Barnaby pays for a fish: its kind's value, more for a long one, far more for stars, half as
 *  much again for a King Size one; `market` is the hour's price for its kind (shared/market.ts). */
export const STAR_VALUE = [1, 1.5, 2.2] as const;
export const KING_SIZE_VALUE = 2.5;
export function fishValue(f: CreelFish, market = 1): number {
  const sp = FISH[f.s];
  const [lo, hi] = sp.cm;
  const frac = hi > lo ? Math.max(0, Math.min(1, (f.cm - lo) / (hi - lo))) : 0.5;
  return Math.max(1, Math.round(sp.value * (0.8 + 0.4 * frac) * STAR_VALUE[f.q - 1] * (isKingSize(f) ? KING_SIZE_VALUE : 1) * market));
}
/** Longer than its kind's usual span: a King Size fish (about one in fifty on a hand-reeled line,
 *  four in ten in a King-Size Surge's golden ripples, never on an AFK line), worth 2.5x and crowned
 *  in gold in the Logbook. */
export function isKingSize(f: Pick<CreelFish, "s" | "cm">): boolean {
  return f.cm > FISH[f.s].cm[1];
}
export function stars(q: number): string {
  return "★".repeat(q) + "☆".repeat(3 - q);
}

// --- rolling a catch ----------------------------------------------------------------------------

export interface CatchLuck {
  /** Extra weight on rare, legendary and mythic fish (0.15: +15%), from the Cozy Aura and the rapids. */
  rareLuck?: number;
  bait?: BaitId | "";
  /** Only the commons. */
  commonOnly?: boolean;
  /** An AFK line: never a King Size fish. */
  afk?: boolean;
  /** The chance a hand-reeled catch is King Size (a King-Size Surge's golden ripples: 0.4). */
  king?: number;
  /** The hour's light (shared/daynight.ts): only its fish bite. Omitted: either. */
  time?: "day" | "night";
  /** Fishing the Whispering Woods' rapids (its own legendaries and mythics bite there only). */
  rapids?: boolean;
  /** The rod's tier: nothing rarer than it can land bites. */
  rodTier?: number;
  /** The Golden Scale Ring: a gold star this much likelier, and the fish this much heavier. */
  goldStar?: number;
  heft?: number;
}

/** What bites, weighted, with luck tipping it toward the rare end. */
export function rollFish(water: Water, luck: CatchLuck = {}, rand: () => number = Math.random): FishId {
  const rareMul = (1 + (luck.rareLuck ?? 0)) * (luck.bait ? baitEffect(luck.bait, luck.time === "night").rareMul : 1);
  const reach = luck.rodTier ?? 5;
  const pool = fishOf(water).filter(
    (id) =>
      (!luck.commonOnly || FISH[id].tier === "common") &&
      (!luck.afk || AFK_CATCH_S[FISH[id].tier] !== null) &&
      (!luck.time || FISH[id].time === luck.time) &&
      (!(FISH[id] as FishSpecies).rapids || luck.rapids === true) &&
      FISH_TIER_RANK[FISH[id].tier] <= reach
  );
  if (!pool.length) return fishOf(water)[0];
  const weightOf = (id: FishId) => FISH[id].weight * (RARE_TIERS.has(FISH[id].tier) ? rareMul : 1);
  let roll = rand() * pool.reduce((a, id) => a + weightOf(id), 0);
  for (const id of pool) {
    roll -= weightOf(id);
    if (roll <= 0) return id;
  }
  return pool[0];
}

/** A standard normal draw (Box-Muller). */
function gauss(rand: () => number): number {
  const u = 1 - rand();
  return Math.sqrt(-2 * Math.log(Math.max(u, 1e-9))) * Math.cos(2 * Math.PI * rand());
}

/** How big it came up, and its stars. Lengths fall on a bell curve round the middle of the kind's
 *  span (its ends two standard deviations out), so most fish are ordinary and a King Size one, past
 *  the span's top, is rare; a long one leans silver, and luck can make it gold. */
export function rollCatch(species: FishId, luck: CatchLuck = {}, rand: () => number = Math.random): CreelFish {
  const [lo, hi] = FISH[species].cm;
  let z = Math.max(-3, Math.min(3.5, gauss(rand)));
  // a surge's King Size (beyond the usual span); an AFK line never lands one
  if (!luck.afk && luck.king && rand() < luck.king) z = 2.15 + rand() * 1.3;
  if (luck.afk) z = Math.min(z, 1.95);
  let cm = Math.max(1, Math.round((lo + hi) / 2 + (z * (hi - lo)) / 4));
  // a heavier fish (the weight goes with the cube of the length), never made King Size by it
  if (luck.heft) {
    const heavy = Math.round(cm * Math.cbrt(1 + luck.heft));
    cm = cm > hi ? heavy : Math.min(hi, heavy);
  }
  const gold = 0.06 + (luck.rareLuck ?? 0) * 0.2 + (z > 1.2 ? 0.1 : 0) + (luck.goldStar ?? 0);
  const silver = 0.22 + (z > 0.5 ? 0.15 : 0);
  const r = rand();
  const q: 1 | 2 | 3 = r < gold ? 3 : r < gold + silver ? 2 : 1;
  return { s: species, cm, q };
}

/** Seconds from the cast to the bite: the kind's own range, sooner with bait (and the Sunburst
 *  River Band by day: `haste`), two seconds sooner while Well-Fed, never under a second and a half. */
export function biteSeconds(species: FishId, opts: { fed?: boolean; bait?: BaitId | ""; night?: boolean; haste?: number } = {}, rand: () => number = Math.random): number {
  const [lo, hi] = FISH[species].bite;
  let s = (lo + (hi - lo) * rand()) / (opts.haste ?? 1);
  if (opts.bait) s *= baitEffect(opts.bait, !!opts.night).biteMul;
  if (opts.fed) s -= WELL_FED_BITE_BONUS_S;
  return Math.max(1.5, s);
}

// --- Well-Fed ------------------------------------------------------------------------------------

/** Eating at the campfire (a roasted skewer, a bowl of stew, a skewer from the picnic table). */
export const WELL_FED_S = 8 * 60;
/** Walking pace while Well-Fed (with a little bounce in the step). */
export const WELL_FED_SPEED = 1.15;
/** Bites come this much sooner while Well-Fed. */
export const WELL_FED_BITE_BONUS_S = 2;

// --- AFK fishing at the campfire ------------------------------------------------------------------

/** Line in, feet up (at the campfire's dock and canoe, or the woods' river bank): a fish into the
 *  livewell every so often, the rarer the longer the wait (seconds, min and max). */
export const AFK_CATCH_S: Record<FishTier, readonly [number, number] | null> = {
  common: [12, 16],
  uncommon: [20, 26],
  rare: [35, 45],
  legendary: [55, 65],
  mythic: [75, 90],
};
/** Premium bait (the Lucky Chum) on an AFK line: every wait this much shorter. */
export const AFK_PREMIUM_BAIT = 0.75;
/** How long an AFK line waits for this fish (`haste`: the Sunburst River Band by day). */
export function afkSeconds(species: FishId, rand: () => number = Math.random, bait: BaitId | "" = "", haste = 1): number {
  const [lo, hi] = AFK_CATCH_S[FISH[species].tier] ?? [45, 45];
  return ((lo + (hi - lo) * rand()) * (bait === "stardrop" ? AFK_PREMIUM_BAIT : 1)) / haste;
}
