// The Glimmering Caverns' Bioluminescent Grotto Pool: its six cave fish (Common to Mythic, far richer
// than the river's), its weathered pier, and the stalactites' lucky drip.
//
// The cave fish are fished like the river's (shared/fishing.ts: the same reel, the same rods and
// baits, the same livewell, AFK too), from the pier's three spots (shared/worlds/caverns.ts
// CAVE_FISHING). Underground there is no day and no night: every one of them bites at any hour. What
// rarity bites follows the rod and the line as on the river (shared/economy.ts ACTIVE_TIER_ODDS);
// the pool is deep all over, so its legendaries and its mythic bite anywhere on it.
//
// The lucky drip: every DRIP_EVERY_S seconds a drop falls from the stalactites over the pool and a
// cyan ripple opens round one of the pier's floats for DRIP_S seconds. A cast landed in it (a fresh
// cast, or a recast, while the ripple is on your float) hooks nothing common, and its reel's green is
// DRIP_ZONE times the size.

import type { FishSpecies } from "./fishing";
import { CAVE_FISH_PRICES } from "./economy";

/** The cave fish, as the river's are described (shared/fishing.ts FishSpecies). */
export const CAVE_FISH = {
  cave_tetra: { name: "Blind Cave Tetra", emoji: "🐟", water: "cavewater", tier: "common", weight: 14, bite: [3, 5], cm: [6, 11], value: CAVE_FISH_PRICES.cave_tetra, speed: 0.55, size: 0.5, pattern: "sine", barScale: 1, time: "any", mass: 11 },
  glassfin_loach: { name: "Glassfin Cave Loach", emoji: "🐠", water: "cavewater", tier: "uncommon", weight: 5, bite: [4, 7], cm: [14, 26], value: CAVE_FISH_PRICES.glassfin_loach, speed: 0.85, size: 0.7, pattern: "erratic", barScale: 0.95, time: "any", mass: 6 },
  glow_axolotl: { name: "Bioluminescent Axolotl", emoji: "🦎", water: "cavewater", tier: "rare", weight: 2.5, bite: [6, 10], cm: [18, 32], value: CAVE_FISH_PRICES.glow_axolotl, speed: 1.05, size: 0.8, pattern: "koi", barScale: 0.88, time: "any", mass: 12 },
  sporecat: { name: "Glow-Spore Catfish", emoji: "🐡", water: "cavewater", tier: "legendary", weight: 1.2, bite: [8, 13], cm: [60, 120], value: CAVE_FISH_PRICES.sporecat, speed: 1.3, size: 1.0, pattern: "plunge", barScale: 0.75, time: "any", mass: 11 },
  crystal_fin: { name: "Abyssal Crystal Fin", emoji: "💎", water: "cavewater", tier: "legendary", weight: 0.5, bite: [9, 14], cm: [45, 85], value: CAVE_FISH_PRICES.crystal_fin, speed: 1.45, size: 0.95, pattern: "erratic", barScale: 0.7, time: "any", mass: 9 },
  elder_olm: { name: "Elder Olm of the Rift", emoji: "🐉", water: "cavewater", tier: "mythic", weight: 0.5, bite: [11, 16], cm: [90, 180], value: CAVE_FISH_PRICES.elder_olm, speed: 1.6, size: 1.0, pattern: "koi", barScale: 0.6, time: "any", mass: 4 },
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
/** Server -> the caverns ("caveDrip"): a drop fell, a ripple opens round a float until `until`. */
export interface CaveDrip {
  spot: string;
  x: number;
  z: number;
  until: number;
}
