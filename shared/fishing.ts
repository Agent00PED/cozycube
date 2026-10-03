// The angler's world, as both sides see it: what swims in each water, how big it runs and how
// long it takes to bite; the rods and baits Barnaby the Angler sells; the Fish Creel every angler
// carries (what they caught, and their best of each kind), and what he pays for it.
//
// The server rolls every catch (rollFish, rollCatch) and keeps each angler's FishingProfile in
// their player record (it survives room switches, reconnects and restarts); the client draws the
// same tables in the reel, the creel and Barnaby's shop.

import { isCodexId } from "./caverns_codex";
import type { SwimPattern } from "./types";
import { BYPRODUCT_IDS, TREE_KINDS, WOOD_CARRIER_TIERS, WOOD_KINDS, carrierCapacity, isAxeId, type AxeId, type ByproductId, type TreeKind, type WoodKind } from "./chop";
import { CRAFTS, isCraftId, type CraftId, type CraftItem } from "./crafting";
import { MAIL_MAX, PROFILE_VERSION, migratePlayerInventory } from "./migrate";
import { MAX_RANK, RANK_ATTUNE, carrierBonus, fitRings, fitWorn, isGearId, isRingId, livewellBonus, type GearId, type RingId } from "./gear";
import { CAVE_FISH, isCaveTackleId, type CaveTackleId } from "./caverns_fishing";
import { isPickaxeId, isIngotId, isOreItemId, isOreKind, FORGE_QUEUE_MAX, ORE_ITEMS, type IngotId, type OreItemId, type OreKind, type PickaxeId } from "./caverns_mining";
import { sanitizeSatchel, type SatchelStack } from "./satchel";
import { AFK_BAITED_TIER_ODDS, AFK_UNBAITED_TIER_ODDS, CRAFT_SLOT_STACK, CRAFT_STASH_SLOTS, CREEL_CAPACITY, CREEL_PRICES, FISH_PRICES, MATERIAL_CAP, MAX_DAY_PERMITS, TACKLE_PRICES, WATER_ODDS, type OddsWater, type TierOdds } from "./economy";

/** The waters: the camp's rivers, the beach's sea (registered), and the Glimmering Caverns' Grotto
 *  Pool (shared/caverns_fishing.ts). */
export type Water = "freshwater" | "saltwater" | "cavewater";
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
  /** When it bites: by day or by night (shared/daynight.ts); underground, at any hour. */
  time: "day" | "night" | "any";
  /** Only in the Whispering Woods' rapids (the legendaries and the mythics). */
  rapids?: boolean;
  /** Its heft: kilograms for a fish a metre long (a weight goes with the cube of its length). */
  mass: number;
  /** Shown as a grade of its own (the Cenote's Epic pair: the rare rarity's rarest, drawn and priced
   *  apart, fought like a rare one). */
  grade?: "epic";
}

export const FISH = {
  // freshwater: the Starlight Campfire's river and the Whispering Woods' rapids, fifteen kinds by day
  // and fifteen by night. What rarity bites follows the rod's tier and the line (hand-reeled or AFK:
  // shared/economy.ts WATER_ODDS, AFK_BAITED_TIER_ODDS), split between a rarity's kinds by
  // their weights; the legendaries and mythics bite only in the rapids. `cm` is the usual span (the bell curve's middle 95%: a fish longer
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
  // cavewater: the Glimmering Caverns' cenote lake, eleven kinds biting at any hour (shared/caverns_fishing.ts)
  ...CAVE_FISH,
} as const satisfies Record<string, FishSpecies>;
export type FishId = keyof typeof FISH;
export const FISH_IDS = Object.keys(FISH) as FishId[];
export function isFishId(v: unknown): v is FishId {
  return typeof v === "string" && v in FISH;
}
export function fishOf(water: Water): FishId[] {
  return FISH_IDS.filter((id) => FISH[id].water === water);
}

/** A fish's grade as shown: its rarity, or Epic for the Cenote's rarest rare pair. */
export type FishGrade = FishTier | "epic";
export const gradeOf = (id: FishId): FishGrade => (FISH[id] as FishSpecies).grade ?? FISH[id].tier;
export const TIER_LABEL: Record<FishGrade, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic 💫", legendary: "Legendary ✨", mythic: "Mythic 🌌" };
/** Each grade's colour on a chip (the reveal, the Nature Logbook). */
export const TIER_COLOR: Record<FishGrade, string> = { common: "#C9BDB5", uncommon: "#8fd3b6", rare: "#9ecbff", epic: "#c39bff", legendary: "#F5A623", mythic: "#ec7fa3" };
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
  /** How long the fish can run out of the green before the line's tension starts to climb (s):
   *  the higher the rod, the more forgiving. */
  tensionWindow: number;
  /** A starry shimmer about the angler while it is in hand. */
  aura: boolean;
  /** The finest rods' own passive on a boss fish (RodPerk). */
  perk?: RodPerk;
  blurb: string;
}
/** A rod's passive against a boss fish (a legendary or a mythic): its darts this much slower, its fake
 *  runs this much rarer, and this many snaps forgiven a fight (the line holds once at breaking point). */
export interface RodPerk {
  name: string;
  dart: number;
  feints: number;
  shields: number;
  blurb: string;
}
/** Every rod's tension window grew by this (the boss fish's spikes softened). */
export const TENSION_WINDOW_BONUS = 0.3;
export const RODS = {
  bamboo: { name: "Basic Bamboo Rod", emoji: "🎋", tier: 1, price: 0, barBonus: 0, tensionResist: 0, tensionWindow: 1.1, aura: false, blurb: "T1: commons, now and then an uncommon. Light, springy and everyone's first. A 1.1 s tension window." },
  willow: { name: "Pro Carbon Rod", emoji: "🎣", tier: 2, price: TACKLE_PRICES.proRod, barBonus: 0.2, tensionResist: 0, tensionWindow: 1.3, aura: false, blurb: "T2: up to rare fish. +20% green reel bar, a 1.3 s tension window." },
  heron: { name: "Heron Fiberglass Rod", emoji: "🪶", tier: 3, price: TACKLE_PRICES.heronRod, barBonus: 0.2, tensionResist: 0.15, tensionWindow: 1.5, aura: false, blurb: "T3: up to legendary fish. +20% bar, the line holds 15% longer, a 1.5 s tension window." },
  starlight: { name: "Starlight Master Rod", emoji: "🌠", tier: 4, price: TACKLE_PRICES.masterRod, barBonus: 0.2, tensionResist: 0.35, tensionWindow: 1.8, aura: true, perk: { name: "Starlight Dampener", dart: 0.25, feints: 0, shields: 0, blurb: "a boss fish darts 25% slower" }, blurb: "T4: up to mythic fish. +20% bar, the line holds 35% longer, a 1.8 s tension window, a star aura, and the Starlight Dampener (a boss fish darts 25% slower)." },
  moonlight: { name: "Mythril Moonlight Rod", emoji: "🌙", tier: 5, price: TACKLE_PRICES.moonlightRod, barBonus: 0.3, tensionResist: 0.45, tensionWindow: 2.1, aura: true, perk: { name: "Abyssal Tether", dart: 0.35, feints: 0.4, shields: 1, blurb: "a boss fish darts 35% slower and fakes 40% less, and one snap a fight is forgiven" }, blurb: "T5: the best odds of the rare end. +30% bar, the line holds 45% longer, a 2.1 s tension window, a moonlit aura, and the Abyssal Tether (a boss fish darts 35% slower, fakes 40% less, and one snap a fight is forgiven)." },
} as const satisfies Record<string, Rod>;
export type RodId = keyof typeof RODS;
export const ROD_IDS = Object.keys(RODS) as RodId[];
export function isRodId(v: unknown): v is RodId {
  return typeof v === "string" && v in RODS;
}
/** The rods in tier order. */
export const RODS_BY_TIER: RodId[] = [...ROD_IDS].sort((a, b) => RODS[a].tier - RODS[b].tier);
/** Whether a rod's odds reach a fish of this rarity at all (on a hand-reeled line, in any water). */
export const rodLands = (rod: RodId, tier: FishTier) => Object.values(WATER_ODDS).some((rows) => (rows[RODS[rod].tier - 1]?.[tier] ?? 0) > 0);

/** A boss fish (a legendary or a mythic) on the reel: its green sweet spot smaller (a legendary's 35%
 *  smaller, a mythic's 40%: a share of the bar's full height), and its fake runs (a feint to one end,
 *  snapping back, each telegraphed 0.3 s ahead) and thrashing. The better rods hold the line longer
 *  (the finest two with a passive of their own, RodPerk), but it still takes a steady hand. */
export const BOSS_TIERS: ReadonlySet<FishTier> = new Set(["legendary", "mythic"]);
export const BOSS_ZONE_BY_TIER: Partial<Record<FishTier, number>> = { legendary: 0.65, mythic: 0.6 };
/** The legendary's (the old single figure, for anything that asks). */
export const BOSS_ZONE = 0.65;
/** A boss fish's warning before each erratic run: the ❗ and the reel's red pulse (s). */
export const BOSS_TELEGRAPH_S = 0.3;

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
/** The livewell's room: its tier's slots, and while worn the Tackle Holster's and the Explorer's Pack's. */
export function livewellCap(p: Pick<FishingProfile, "slots" | "worn" | "gearRank">): number {
  return p.slots + livewellBonus(p);
}
/** Whether the creel has no room for another fish. */
export function creelFull(p: Pick<FishingProfile, "creel" | "slots" | "worn" | "gearRank">): boolean {
  return p.creel.length >= livewellCap(p);
}
/** A full creel: a fresh common catch goes back in the river, and this is paid for letting it go. */
export const CREEL_RELEASE_COINS = 1;
/** A landed fish sheds a Fish Scale into the pouches this often (a hand-reeled one; an AFK one far
 *  less): the Whittled Otter Float's, the Deepriver ring's and the Glow-Spore Chum's makings. */
export const SCALE_CHANCE = { active: 0.35, afk: 0.1 } as const;

/** Everything the angler carries between visits: the creel, their rods and baits, their records
 *  (the longest of each kind), and how long they have left being Well-Fed. */
export interface FishingProfile {
  /** The profile's schema (PROFILE_VERSION): an older one is migrated as it is read (shared/migrate.ts). */
  v: number;
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
  /** The craft stash: carved pieces, consumables and trade goods from the workbenches, in
   *  CRAFT_STASH_SLOTS stacks of up to CRAFT_SLOT_STACK a kind (no carrier slots). */
  crafts: CraftItem[];
  /** The tackles carved at the workbench (made once, yours for good: shared/crafting.ts TOOLS). */
  tools: CraftId[];
  /** Finnegan's advanced tackle, bartered for on the Cenote's outcrop (made once, at work for good:
   *  shared/caverns_fishing.ts CAVE_TACKLES). */
  caveTackles: CaveTackleId[];
  /** Legacy (the things once made for good, refunded their materials by the migration): read from an
   *  older profile, never set again. */
  roastingStick: boolean;
  packFrame: boolean;
  tackleBox: boolean;
  /** Word for the player the next time they come in (a migration's refunds): told once, then cleared. */
  mail: string[];
  /** Coins a migration owes the player (a rebalance's compensation for what they held): paid as they
   *  next come in, then zero. */
  owed: number;
  /** The accessories owned (shared/gear.ts), and those worn (oldest first: a third ring takes the
   *  oldest one's place); only what is worn works. */
  gear: GearId[];
  worn: GearId[];
  /** Each owned piece's rank (1 to 5) and its attunement (seconds of its craft done by hand with it
   *  on); the trials passed (`<family><rank>`); the deeds ledger the trials read (shared/gear.ts). */
  gearRank: Partial<Record<GearId, number>>;
  /** The rings forged (a band and a gem: shared/gear.ts RingId) and the two worn. */
  rings: RingId[];
  ringsWorn: RingId[];
  attune: Partial<Record<GearId, number>>;
  trials: string[];
  deeds: Record<string, number>;
  /** Pine Resin (from critical chops: it glues a carving at the workbench's Adhesive Slot, and Buster
   *  buys it) and Sawdust (from broken carvings; +15% on the bonfire): crafting materials, in the
   *  materials' store with the by-products (no carrier slots: up to MATERIAL_CAP, 99, of each). */
  resin: number;
  sawdust: number;
  /** The by-products (the felling's, the river's and the Cenote's, the caverns' stone dust): the
   *  materials' store, up to MATERIAL_CAP of each kind (materialRoom). */
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
  /** Harvesting fatigue (anti server-hopping): when this player last felled an Autumn Maple (T4), a
   *  Whispering Elderwood (T5) and a Colossal Titan (epoch ms, the server's clock), and in which
   *  lounge. The same class can't be felled in another lounge until its rest is over. */
  lastFelledT4At: number;
  lastFelledT5At: number;
  lastFelledTitanAt: number;
  felledIn: Partial<Record<FatigueClass, string>>;
  /** The workbench's consumables in effect: each buff until (epoch ms, the server's clock). */
  buffs: Partial<Record<BuffKey, number>>;
  /** The Glimmering Caverns: the Prospector's Satchel's tier, its slots (always its tier's:
   *  shared/satchel.ts) and what it holds (a stack a kind: ores, ingots, geodes, gems). */
  satchelTier: number;
  satchelSlots: number;
  satchelContents: SatchelStack[];
  /** The pickaxe in hand and those owned (the Rusted Pickaxe everyone's), and whether Old Flint has
   *  met you (his gift: the Rusted Pickaxe, and the adit open to you for good). */
  pickaxeId: PickaxeId;
  pickaxes: PickaxeId[];
  caveAccess: boolean;
  /** The onsen's Deep Warmth until (epoch ms, the server's clock): a quicker step everywhere, a wider
   *  fracture, the ring's stamina back sooner. */
  deepWarmthUntil: number;
  /** The Thermal Bellows Forge's queue (ingots still to come, in order), when its next one is done (epoch
   *  ms), and its tray (ingots done that found no room in the satchel: collected at the forge). */
  forgeQueue: { i: IngotId; n: number }[];
  forgeAt: number;
  forgeTray: Partial<Record<OreItemId, number>>;
  /** The nodes broken, by kind (the drawer's tally). */
  mined: Partial<Record<OreKind, number>>;
  /** The Cave Codex's entries found (shared/caverns_codex.ts ids: the zones stamped, the fauna met, the
   *  pearls and fossils, Flint's journal pages, the living wonders witnessed). */
  codex: string[];
  /** The Prospector's Ledger (docs/caverns-roadmap.md R2.10): a miner's lifetime marks, shown in the ore
   *  satchel's Mastery tab. */
  ledger: CaveLedger;
  /** The Expedition's weekly orders (shared/caverns_weekly.ts): the week, where you stood when it began,
   *  the orders met. */
  weekly: { week: string; base: Record<string, number>; done: string[] };
}
/** The Prospector's Ledger's marks: Perfect strikes, the best run of them, geodes cracked, Star Shards
 *  cut, Masterwork ingots forged, Motherlodes broken. */
export interface CaveLedger {
  perfects: number;
  bestStreak: number;
  geodes: number;
  stars: number;
  masterworks: number;
  lodes: number;
}
export const LEDGER_KEYS: (keyof CaveLedger)[] = ["perfects", "bestStreak", "geodes", "stars", "masterworks", "lodes"];
/** The consumables' buffs (shared/crafting.ts BUFFS): kept here by key (the workbench's, and the
 *  drawers' own: Feller's Pine Pitch, Phosphor Glow Bait, Miner's Stout). Using one again while it
 *  lasts starts its time afresh: the same buff never stacks. */
export type BuffKey = "smore" | "wax" | "scent" | "sap" | "chum" | "pitch" | "glowbait" | "stout";
export const BUFF_KEYS: BuffKey[] = ["smore", "wax", "scent", "sap", "chum", "pitch", "glowbait", "stout"];
/** Whether a buff is on (at the server's clock, or near enough on the client's). */
export const buffOn = (p: Pick<FishingProfile, "buffs">, key: BuffKey, now = Date.now()) => (p.buffs[key] ?? 0) > now;

/** Harvesting fatigue: the trees whose felling tires a player's arms (a T4, a T5, a Titan), and how
 *  long before another of the same can be felled in a different lounge. In the lounge where it was
 *  felled nothing changes (its own trees grow back on their own clock). */
export type FatigueClass = "t4" | "t5" | "titan";
export const FATIGUE_MS: Record<FatigueClass, number> = { t4: 8 * 60_000, t5: 15 * 60_000, titan: 45 * 60_000 };
const FATIGUE_FIELD: Record<FatigueClass, "lastFelledT4At" | "lastFelledT5At" | "lastFelledTitanAt"> = { t4: "lastFelledT4At", t5: "lastFelledT5At", titan: "lastFelledTitanAt" };
/** A tree's fatigue class (none for T1-T3). */
export function fatigueClass(tier: number, titan: boolean): FatigueClass | null {
  return titan ? "titan" : tier === 5 ? "t5" : tier === 4 ? "t4" : null;
}
/** How long (ms) this player must rest before felling a tree of this class in `lounge` (0: free). */
export function fatigueLeft(p: Pick<FishingProfile, "lastFelledT4At" | "lastFelledT5At" | "lastFelledTitanAt" | "felledIn">, cls: FatigueClass, lounge: string, now = Date.now()): number {
  const at = p[FATIGUE_FIELD[cls]];
  const where = p.felledIn[cls];
  if (!at || !where || where === lounge) return 0;
  return Math.max(0, at + FATIGUE_MS[cls] - now);
}
/** A felling of this class noted (the time and the lounge). */
export function noteFelled(p: Pick<FishingProfile, "lastFelledT4At" | "lastFelledT5At" | "lastFelledTitanAt" | "felledIn">, cls: FatigueClass, lounge: string, now = Date.now()) {
  p[FATIGUE_FIELD[cls]] = now;
  p.felledIn[cls] = lounge;
}
/** "7m 12s" for the fatigue toast. */
export function restText(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** The crafting materials' store: Pine Resin, Sawdust and every by-product, each kind up to
 *  MATERIAL_CAP (99) of its own, apart from every carrier, livewell and satchel. */
export type MaterialKey = ByproductId | "resin" | "sawdust";
export function materialCount(p: Pick<FishingProfile, "byproducts" | "resin" | "sawdust">, key: MaterialKey): number {
  return key === "resin" ? p.resin : key === "sawdust" ? p.sawdust : (p.byproducts[key] ?? 0);
}
/** Room for more of a material (the soft clamp: a store over 99 of a kind keeps it all; only new ones
 *  wait until it is under). */
export function materialRoom(p: Pick<FishingProfile, "byproducts" | "resin" | "sawdust">, key: MaterialKey): number {
  return Math.max(0, MATERIAL_CAP - materialCount(p, key));
}
/** Up to `n` of a material into the store (as its room allows): how many went in. */
export function addMaterial(p: Pick<FishingProfile, "byproducts" | "resin" | "sawdust">, key: MaterialKey, n: number): number {
  const take = Math.max(0, Math.min(Math.floor(n), materialRoom(p, key)));
  if (take <= 0) return 0;
  if (key === "resin") p.resin += take;
  else if (key === "sawdust") p.sawdust += take;
  else p.byproducts[key] = (p.byproducts[key] ?? 0) + take;
  return take;
}
/** Up to `n` of a material out of the store: how many came out. */
export function takeMaterial(p: Pick<FishingProfile, "byproducts" | "resin" | "sawdust">, key: MaterialKey, n: number): number {
  const take = Math.max(0, Math.min(materialCount(p, key), Math.floor(n)));
  if (key === "resin") p.resin -= take;
  else if (key === "sawdust") p.sawdust -= take;
  else {
    const left = (p.byproducts[key] ?? 0) - take;
    if (left > 0) p.byproducts[key] = left;
    else delete p.byproducts[key];
  }
  return take;
}
/** A store, carrier, livewell or satchel holding more than its room (from before a rebalance):
 *  Overburdened. Selling, splitting, smelting and crafting all work; gathering waits until it is
 *  back under. */
export const overburdened = (load: number, cap: number) => load > cap;

/** The craft stash: its slots in use (each kind, Masterworks apart, a slot per CRAFT_SLOT_STACK),
 *  and whether one more of a kind fits (the soft clamp: a stash over its slots keeps everything). */
export function stashSlots(items: readonly CraftItem[]): number {
  const n = new Map<string, number>();
  for (const it of items) n.set(`${it.c}${it.m ? "*" : ""}`, (n.get(`${it.c}${it.m ? "*" : ""}`) ?? 0) + 1);
  let slots = 0;
  for (const c of n.values()) slots += Math.ceil(c / CRAFT_SLOT_STACK);
  return slots;
}
export function stashFits(items: readonly CraftItem[], add: CraftItem, bonus = 0): boolean {
  return stashSlots([...items, add]) <= CRAFT_STASH_SLOTS + bonus;
}
export function emptyFishingProfile(): FishingProfile {
  const wood = Object.fromEntries(WOOD_KINDS.map((k) => [k, 0])) as Record<WoodKind, number>;
  return { v: PROFILE_VERSION, creel: [], creelTier: 1, slots: CREEL_TIERS[0].capacity, rod: "bamboo", rods: ["bamboo"], baits: {}, bait: "", records: {}, best: {}, caught: {}, fedUntil: 0, wood, woodValue: {}, axe: "rusty", axes: ["rusty"], carrierTier: 1, crafts: [], tools: [], caveTackles: [], roastingStick: false, packFrame: false, tackleBox: false, mail: [], owed: 0, gear: [], worn: [], gearRank: {}, rings: [], ringsWorn: [], attune: {}, trials: [], deeds: {}, resin: 0, sawdust: 0, byproducts: {}, firewood: 0, dayPermits: 0, ranger: false, eagleUntil: 0, felled: {}, slingBest: 0, trunkRecord: {}, bestLog: {}, lastFelledT4At: 0, lastFelledT5At: 0, lastFelledTitanAt: 0, felledIn: {}, buffs: {}, satchelTier: 0, satchelSlots: 2, satchelContents: [], pickaxeId: "rusted", pickaxes: ["rusted"], caveAccess: false, deepWarmthUntil: 0, forgeQueue: [], forgeAt: 0, forgeTray: {}, mined: {}, codex: [], ledger: { perfects: 0, bestStreak: 0, geodes: 0, stars: 0, masterworks: 0, lodes: 0 }, weekly: { week: "", base: {}, done: [] } };
}
/** How much split wood the profile holds, all kinds together. */
export function woodCount(p: Pick<FishingProfile, "wood">): number {
  return WOOD_KINDS.reduce((sum, k) => sum + (p.wood[k] ?? 0), 0);
}
/** How full the wood carrier is: every log takes a slot (the workbench's pieces sit in the craft
 *  stash; Pine Resin, Sawdust and the by-products in the pouches; Firewood ties on beside it). */
export function carrierLoad(p: Pick<FishingProfile, "wood">): number {
  return woodCount(p);
}
/** The most of one kind a stash slot stacks (a kind past it takes a second slot). */
export const MAX_CRAFT_STACK = CRAFT_SLOT_STACK;
/** The carrier's room: its tier's slots, and while worn the Toolbelt's and the Explorer's Pack's. */
export function carrierCap(p: Pick<FishingProfile, "carrierTier" | "worn" | "gearRank">): number {
  return carrierCapacity(p.carrierTier) + carrierBonus(p);
}
/** Whether a tackle is the player's (made at the workbench). */
export const hasTool = (p: Pick<FishingProfile, "tools">, id: CraftId) => p.tools.includes(id);
/** A profile read back from storage (or the network), with anything unknown or broken dropped, and
 *  an older one migrated to this schema (migratePlayerInventory: nothing lost on the way). */
export function sanitizeFishingProfile(raw: unknown): FishingProfile {
  const p = readFishingProfile(raw);
  return migratePlayerInventory(raw, p, fishValue);
}
/** The plain read of a stored profile: every field checked, defaulted where missing (a returning
 *  player's missing fields read as zero, false or empty). */
function readFishingProfile(raw: unknown): FishingProfile {
  const p = emptyFishingProfile();
  if (!raw || typeof raw !== "object") return p;
  const r = raw as Record<string, unknown>;
  p.v = Math.max(0, Math.round(Number(r.v) || 0));
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
  if (Array.isArray(r.tools)) p.tools = Array.from(new Set(r.tools.filter((t): t is CraftId => isCraftId(t) && CRAFTS[t].use === "tool")));
  if (Array.isArray(r.caveTackles)) p.caveTackles = Array.from(new Set(r.caveTackles.filter(isCaveTackleId)));
  p.roastingStick = r.roastingStick === true;
  p.packFrame = r.packFrame === true;
  p.tackleBox = r.tackleBox === true;
  // (a long letter is cut short, never dropped: a retrofit letter lists everything it gave back)
  if (Array.isArray(r.mail)) p.mail = r.mail.filter((m): m is string => typeof m === "string" && m.length > 0).map((m) => (m.length > MAIL_MAX ? `${m.slice(0, MAIL_MAX - 1)}…` : m)).slice(-8);
  p.owed = Math.max(0, Math.min(9_999_999, Math.round(Number(r.owed) || 0)));
  if (Array.isArray(r.gear)) p.gear = Array.from(new Set(r.gear.filter(isGearId)));
  // what is worn (a profile from before the slots: everything owned that fits goes on)
  p.worn = fitWorn(Array.isArray(r.worn) ? r.worn.filter(isGearId) : [], p.gear);
  if (Array.isArray(r.rings)) p.rings = Array.from(new Set(r.rings.filter(isRingId)));
  p.ringsWorn = fitRings(Array.isArray(r.ringsWorn) ? r.ringsWorn.filter(isRingId) : [], p.rings);
  for (const id of p.gear) {
    p.gearRank[id] = Math.max(1, Math.min(MAX_RANK, Math.round(Number((r.gearRank as Record<string, unknown> | undefined)?.[id]) || 1)));
    p.attune[id] = Math.max(0, Math.min(RANK_ATTUNE[MAX_RANK], Number((r.attune as Record<string, unknown> | undefined)?.[id]) || 0));
  }
  if (Array.isArray(r.trials)) p.trials = Array.from(new Set(r.trials.filter((t): t is string => typeof t === "string" && /^[a-z]+[3-9]$/.test(t)))).slice(0, 40);
  if (r.deeds && typeof r.deeds === "object") {
    for (const [k, v] of Object.entries(r.deeds as Record<string, unknown>).slice(0, 40)) {
      const n = Math.floor(Number(v));
      if (/^[a-zA-Z]{1,24}$/.test(k) && Number.isFinite(n) && n >= 0) p.deeds[k] = Math.min(n, 1e9);
    }
  }
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
  p.lastFelledT4At = Math.max(0, Number(r.lastFelledT4At) || 0);
  p.lastFelledT5At = Math.max(0, Number(r.lastFelledT5At) || 0);
  p.lastFelledTitanAt = Math.max(0, Number(r.lastFelledTitanAt) || 0);
  if (r.felledIn && typeof r.felledIn === "object") {
    for (const k of ["t4", "t5", "titan"] as const) {
      const v = (r.felledIn as Record<string, unknown>)[k];
      if (typeof v === "string" && v.length <= 64) p.felledIn[k] = v;
    }
  }
  if (r.buffs && typeof r.buffs === "object") {
    for (const k of BUFF_KEYS) {
      const until = Number((r.buffs as Record<string, unknown>)[k]) || 0;
      if (until > 0) p.buffs[k] = until;
    }
  }
  // the Glimmering Caverns: the satchel (its slots its tier's), the pickaxes, Old Flint's welcome, the
  // Deep Warmth, the forge's queue and tray, the nodes broken
  Object.assign(p, sanitizeSatchel(r));
  if (Array.isArray(r.pickaxes)) p.pickaxes = Array.from(new Set(["rusted" as PickaxeId, ...r.pickaxes.filter(isPickaxeId)]));
  p.pickaxeId = isPickaxeId(r.pickaxeId) && p.pickaxes.includes(r.pickaxeId) ? r.pickaxeId : "rusted";
  p.caveAccess = r.caveAccess === true;
  p.deepWarmthUntil = Math.max(0, Number(r.deepWarmthUntil) || 0);
  if (Array.isArray(r.forgeQueue)) {
    for (const j of r.forgeQueue) {
      const job = j as Record<string, unknown>;
      const n = Math.max(0, Math.min(FORGE_QUEUE_MAX, Math.round(Number(job?.n) || 0)));
      if (isIngotId(job?.i) && n > 0) p.forgeQueue.push({ i: job.i, n });
      if (p.forgeQueue.length >= 8) break;
    }
  }
  p.forgeAt = p.forgeQueue.length ? Math.max(0, Number(r.forgeAt) || 0) : 0;
  if (r.forgeTray && typeof r.forgeTray === "object") {
    for (const [k, v] of Object.entries(r.forgeTray as Record<string, unknown>)) {
      const n = Math.max(0, Math.min(999, Math.round(Number(v) || 0)));
      if (isOreItemId(k) && ORE_ITEMS[k].cat === "ingot" && n > 0) p.forgeTray[k] = n;
    }
  }
  if (r.mined && typeof r.mined === "object") {
    for (const [k, v] of Object.entries(r.mined as Record<string, unknown>)) {
      const n = Math.max(0, Math.min(999_999, Math.round(Number(v) || 0)));
      if (isOreKind(k) && n > 0) p.mined[k] = n;
    }
  }
  if (Array.isArray(r.codex)) p.codex = Array.from(new Set(r.codex.filter(isCodexId)));
  if (r.ledger && typeof r.ledger === "object") {
    for (const k of LEDGER_KEYS) {
      const n = Math.floor(Number((r.ledger as Record<string, unknown>)[k]));
      if (Number.isFinite(n) && n > 0) p.ledger[k] = Math.min(99_999_999, n);
    }
  }
  if (r.weekly && typeof r.weekly === "object") {
    const w = r.weekly as { week?: unknown; base?: unknown; done?: unknown };
    if (typeof w.week === "string" && /^\d{4}-W\d{2}$/.test(w.week)) p.weekly.week = w.week;
    if (w.base && typeof w.base === "object") for (const [k, v] of Object.entries(w.base as Record<string, unknown>)) if (Number.isFinite(Number(v)) && Number(v) >= 0 && k.length < 24) p.weekly.base[k] = Math.floor(Number(v));
    if (Array.isArray(w.done)) p.weekly.done = w.done.filter((d): d is string => typeof d === "string" && d.length < 24).slice(0, 8);
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
  /** Extra weight on rare, legendary and mythic fish (0.15: +15%), from the Cozy Aura and the gear. */
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
  /** A cast landed in the cenote's lucky drip: nothing common bites. */
  noCommon?: boolean;
  /** A line in the caverns' stream (shared/worlds/caverns.ts streamCast): too shallow for anything
   *  legendary or mythic. */
  shallow?: boolean;
}

export const FISH_TIERS: FishTier[] = ["common", "uncommon", "rare", "legendary", "mythic"];
/** Which odds a line fishes by (shared/economy.ts WATER_ODDS): the cenote underground, the woods'
 *  rapids, else the campfire's river. */
export const oddsWater = (water: Water, rapids: boolean): OddsWater => (water === "cavewater" ? "cenote" : rapids ? "woods" : "campfire");
/** The odds of each rarity on a line: the water's row for the rod's tier (1-5) on a hand-reeled
 *  line (a rod finer than the table's last row fishes by that row); on an AFK line, the baited
 *  odds by rod (or commons only, unbaited). A hand-reeled line's
 *  rare end is tipped by `rareMul` (the bait, the Cozy Aura, the incense, the gear); an AFK line's
 *  odds are as given. */
export function tierOdds(rodTier: number, afk: boolean, baited: boolean, rareMul = 1, where: OddsWater = "campfire"): TierOdds {
  const row = <T,>(rows: readonly T[]) => rows[Math.max(1, Math.min(rows.length, Math.round(rodTier) || 1)) - 1];
  if (afk) return baited ? row(AFK_BAITED_TIER_ODDS) : AFK_UNBAITED_TIER_ODDS;
  const base = row(WATER_ODDS[where]);
  if (rareMul === 1) return base;
  const tipped = { ...base, rare: base.rare * rareMul, legendary: base.legendary * rareMul, mythic: base.mythic * rareMul };
  const sum = FISH_TIERS.reduce((a, k) => a + tipped[k], 0);
  return { common: tipped.common / sum, uncommon: tipped.uncommon / sum, rare: tipped.rare / sum, legendary: tipped.legendary / sum, mythic: tipped.mythic / sum };
}

/** What bites: a rarity by the odds of the rod and the line (tierOdds), then one of that rarity's
 *  kinds, weighted. A rarity with nothing of it in this water at this hour (the legendaries and
 *  mythics off the rapids) is left out, its share spread over the rest in proportion. An AFK line's
 *  odds hold no mythic (should one ever bite, the server snaps the line: the colossal fish
 *  escapes). */
export function rollFish(water: Water, luck: CatchLuck = {}, rand: () => number = Math.random): FishId {
  const rareMul = (1 + (luck.rareLuck ?? 0)) * (luck.bait ? baitEffect(luck.bait, luck.time === "night").rareMul : 1);
  const odds = luck.commonOnly ? AFK_UNBAITED_TIER_ODDS : tierOdds(luck.rodTier ?? 1, !!luck.afk, !!luck.bait, rareMul, oddsWater(water, luck.rapids === true));
  // (a cast in the lucky drip: the commons' share goes to the rest; an uncommon at worst)
  const floor = luck.noCommon && odds.common > 0 ? { ...odds, common: 0, uncommon: Math.max(odds.uncommon, 0.0001) } : odds;
  const swims = (id: FishId) => (!luck.time || FISH[id].time === luck.time || FISH[id].time === "any") && (!(FISH[id] as FishSpecies).rapids || luck.rapids === true) && !(luck.noCommon && FISH[id].tier === "common") && !(luck.shallow && (FISH[id].tier === "legendary" || FISH[id].tier === "mythic"));
  // (only the rarities that swim here: the rest of the odds shared out among them in proportion)
  const here = FISH_TIERS.filter((k) => floor[k] > 0 && fishOf(water).some((id) => FISH[id].tier === k && swims(id)));
  const total = here.reduce((a, k) => a + floor[k], 0);
  let roll = rand() * total;
  let tier: FishTier = here[0] ?? "common";
  for (const k of here) {
    roll -= floor[k];
    if (roll < 0) {
      tier = k;
      break;
    }
  }
  const pool = fishOf(water).filter((id) => FISH[id].tier === tier && swims(id));
  if (!pool.length) return fishOf(water)[0];
  let pick = rand() * pool.reduce((a, id) => a + FISH[id].weight, 0);
  for (const id of pool) {
    pick -= FISH[id].weight;
    if (pick <= 0) return id;
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
 *  livewell every so often, the rarer the longer the wait (seconds, min and max), paced so an AFK
 *  line earns about 4-6 coins a minute on a starter rod (a hand-reeled one several times that). An
 *  AFK line never lands a mythic. */
export const AFK_CATCH_S: Record<FishTier, readonly [number, number] | null> = {
  common: [44, 58],
  uncommon: [62, 82],
  rare: [100, 130],
  legendary: [150, 180],
  mythic: null,
};
/** Premium bait (the Lucky Chum) on an AFK line: every wait this much shorter. */
export const AFK_PREMIUM_BAIT = 0.75;
/** How long an AFK line waits for this fish (`haste`: the Sunburst River Band by day). */
export function afkSeconds(species: FishId, rand: () => number = Math.random, bait: BaitId | "" = "", haste = 1): number {
  const [lo, hi] = AFK_CATCH_S[FISH[species].tier] ?? [45, 45];
  return ((lo + (hi - lo) * rand()) * (bait === "stardrop" ? AFK_PREMIUM_BAIT : 1)) / haste;
}
