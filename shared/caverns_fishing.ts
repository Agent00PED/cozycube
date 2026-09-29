// The Glimmering Caverns' Abyssal Cenote Lake: its eleven cave fish (Common to Mythic, far richer
// than the river's), Finnegan the Grotto Angler's weathered driftwood outcrop, and the stalactites'
// lucky drip.
//
// The cave fish are fished like the river's (shared/fishing.ts: the same reel, the same rods and
// baits, the same livewell, AFK too), from the outcrop's three spots (shared/worlds/caverns.ts
// CAVE_FISHING). Underground there is no day and no night: every one of them bites at any hour. What
// rarity bites follows the rod and the line as on the river (shared/economy.ts ACTIVE_TIER_ODDS);
// the lake is deep all over, so its legendaries and its mythic bite anywhere on it. Two of each grade:
// the Epic pair (the Glow-Spore Catfish, the Subterranean Needlefish) are the rare rarity's prizes,
// the rarest of it (their `grade` shows "Epic"; they fight hard, but no boss fight).
//
// The lucky drip: every DRIP_EVERY_S seconds a drop falls from the stalactites over the lake and a
// cyan ripple opens round one of the outcrop's floats for DRIP_S seconds. A cast landed in it (a fresh
// cast, or a recast, while the ripple is on your float) hooks nothing common, and its reel's green is
// DRIP_ZONE times the size.

import type { FishSpecies } from "./fishing";
import { CAVE_FISH_PRICES, CAVE_TACKLE_PRICES } from "./economy";
import type { ByproductId } from "./chop";
import type { OreItemId } from "./caverns_mining";

/** The cave fish, as the river's are described (shared/fishing.ts FishSpecies). */
export const CAVE_FISH = {
  cave_tetra: { name: "Blind Cave Tetra", emoji: "🐟", water: "cavewater", tier: "common", weight: 14, bite: [3, 5], cm: [6, 11], value: CAVE_FISH_PRICES.cave_tetra, speed: 0.55, size: 0.5, pattern: "sine", barScale: 1, time: "any", mass: 11 },
  slate_minnow: { name: "Pale Slate Minnow", emoji: "🐟", water: "cavewater", tier: "common", weight: 12, bite: [3, 6], cm: [8, 14], value: CAVE_FISH_PRICES.slate_minnow, speed: 0.6, size: 0.55, pattern: "erratic", barScale: 1, time: "any", mass: 10 },
  glassfin_loach: { name: "Glassfin Cave Loach", emoji: "🐠", water: "cavewater", tier: "uncommon", weight: 6, bite: [4, 7], cm: [14, 26], value: CAVE_FISH_PRICES.glassfin_loach, speed: 0.85, size: 0.7, pattern: "erratic", barScale: 0.95, time: "any", mass: 6 },
  phosphor_guppy: { name: "Phosphor Guppy", emoji: "🐠", water: "cavewater", tier: "uncommon", weight: 5, bite: [4, 7], cm: [9, 16], value: CAVE_FISH_PRICES.phosphor_guppy, speed: 0.95, size: 0.6, pattern: "sine", barScale: 0.93, time: "any", mass: 12 },
  glow_axolotl: { name: "Bioluminescent Axolotl", emoji: "🦎", water: "cavewater", tier: "rare", weight: 3, bite: [6, 10], cm: [18, 32], value: CAVE_FISH_PRICES.glow_axolotl, speed: 1.05, size: 0.8, pattern: "koi", barScale: 0.88, time: "any", mass: 12 },
  opal_gudgeon: { name: "Opal Gudgeon", emoji: "🐟", water: "cavewater", tier: "rare", weight: 2.4, bite: [6, 10], cm: [20, 34], value: CAVE_FISH_PRICES.opal_gudgeon, speed: 1.1, size: 0.8, pattern: "erratic", barScale: 0.86, time: "any", mass: 13 },
  sporecat: { name: "Glow-Spore Catfish", emoji: "🐡", water: "cavewater", tier: "rare", grade: "epic", weight: 0.9, bite: [8, 12], cm: [60, 120], value: CAVE_FISH_PRICES.sporecat, speed: 1.25, size: 0.95, pattern: "plunge", barScale: 0.8, time: "any", mass: 11 },
  needlefish: { name: "Subterranean Needlefish", emoji: "🐍", water: "cavewater", tier: "rare", grade: "epic", weight: 0.7, bite: [8, 12], cm: [70, 130], value: CAVE_FISH_PRICES.needlefish, speed: 1.35, size: 0.85, pattern: "sine", barScale: 0.78, time: "any", mass: 3 },
  crystal_fin: { name: "Abyssal Crystal Fin", emoji: "💎", water: "cavewater", tier: "legendary", weight: 1, bite: [9, 14], cm: [45, 85], value: CAVE_FISH_PRICES.crystal_fin, speed: 1.45, size: 0.95, pattern: "erratic", barScale: 0.7, time: "any", mass: 9 },
  voidfang: { name: "Voidfang Prowler", emoji: "🦈", water: "cavewater", tier: "legendary", weight: 0.7, bite: [10, 15], cm: [90, 160], value: CAVE_FISH_PRICES.voidfang, speed: 1.5, size: 1.0, pattern: "plunge", barScale: 0.68, time: "any", mass: 7 },
  elder_olm: { name: "Elder Olm of the Rift", emoji: "🐉", water: "cavewater", tier: "mythic", weight: 1, bite: [11, 16], cm: [90, 180], value: CAVE_FISH_PRICES.elder_olm, speed: 1.6, size: 1.0, pattern: "koi", barScale: 0.6, time: "any", mass: 4 },
} as const satisfies Record<string, FishSpecies>;
export type CaveFishId = keyof typeof CAVE_FISH;
export const CAVE_FISH_IDS = Object.keys(CAVE_FISH) as CaveFishId[];

/** The lucky drip: how often a drop falls, how long its ripple stays open, and how much bigger it
 *  makes the reel's green (the cast in it hooks nothing common). */
export const DRIP_EVERY_S = 20;
export const DRIP_S = 6;
export const DRIP_ZONE = 1.3;
/** How far from the float a ripple still counts as on it (m). */
export const DRIP_REACH = 0.9;
/** The Cenote Glow Lure's grace: the drip still counts on your float this long after it fades (s). */
export const GLOW_LURE_GRACE_S = 3;
/** Server -> the caverns ("caveDrip"): a drop fell, a ripple opens round a float until `until`. */
export interface CaveDrip {
  spot: string;
  x: number;
  z: number;
  until: number;
}

// --- Finnegan the Grotto Angler's advanced tackle -------------------------------------------------

/** Tackle made once and at work for good (the camp profile's `tools`, like the workbench's), sold by
 *  Finnegan on the Cenote's driftwood outcrop for coins and a barter of makings: silver and iron off
 *  the forge, glimmer and a core fragment out of the rock, the fish's bones and prismatic scales. */
export type CaveTackleId = "silver_spinner" | "glow_lure" | "abyssal_swivel";
export interface CaveTackle {
  name: string;
  emoji: string;
  price: number;
  /** The barter: what else it takes, from the satchel (ore) and the materials' store (by-products). */
  ore: Partial<Record<OreItemId, number>>;
  byproducts: Partial<Record<ByproductId, number>>;
  blurb: string;
}
export const CAVE_TACKLES: Record<CaveTackleId, CaveTackle> = {
  silver_spinner: { name: "Silverline Spinner", emoji: "🥄", price: CAVE_TACKLE_PRICES.silverSpinner, ore: { silver_ingot: 4 }, byproducts: { fishBone: 2 }, blurb: "Rare fish and better 12% likelier on every line you cast" },
  glow_lure: { name: "Cenote Glow Lure", emoji: "🪼", price: CAVE_TACKLE_PRICES.glowLure, ore: { glimmer_shard: 2 }, byproducts: { fishBone: 3, prismScale: 1 }, blurb: "Cave fish bite 15% sooner, and the lucky drip still counts 3 s after its ripple fades" },
  abyssal_swivel: { name: "Abyssal Swivel", emoji: "🪝", price: CAVE_TACKLE_PRICES.abyssalSwivel, ore: { iron_ingot: 4, core_fragment: 1 }, byproducts: { prismScale: 2 }, blurb: "The line's tension window 0.3 s longer on every fish" },
};
export const CAVE_TACKLE_IDS = Object.keys(CAVE_TACKLES) as CaveTackleId[];
export function isCaveTackleId(v: unknown): v is CaveTackleId {
  return typeof v === "string" && v in CAVE_TACKLES;
}
/** The Silverline Spinner's rare luck, the Glow Lure's quicker cave bites, the Abyssal Swivel's
 *  longer tension window (s). */
export const SPINNER_LUCK = 0.12;
export const GLOW_LURE_HASTE = 1.15;
export const SWIVEL_WINDOW_S = 0.3;
