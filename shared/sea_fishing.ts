// The salt water's fish (docs/beach-design.md): Sunset Beach's pier, the Open Sea and the Hidden Cove.
//
// What bites follows the water and the rod together (shared/economy.ts WATER_ODDS: `pier`, `sea`,
// `cove`), and in salt water the rod decides the rarest fish it may land at all: T1 to T3 only
// common, T4 uncommon, T5 rare, T6 the Epic kinds and the legendaries (the Epic kinds are the rare
// rarity's rarest, as in the cenote: `grade`, gated here by `minRod`), T7 the mythic.
//
//   the pier   sixteen reef and surf fish, eight by day and eight by night (`zone` "pier", the
//              default): any rod fishes it, by hand or AFK
//   the sea    eight deep-water fish, at any hour (`zone` "sea": from the captain's boat, and in the
//              cove)
//   the cove   three of its own (`zone` "cove"), the Abyssal Pearl Whale the mythic
import { SEA_FISH_PRICES as P } from "./economy";
import type { FishSpecies } from "./fishing";

/** Where a salt-water fish swims: off the pier, out at sea (and in the cove), or only in the cove. */
export type SeaZone = "pier" | "sea" | "cove";

export const SEA_FISH = {
  // the pier, by day
  sand_sardine: { name: "Sand Sardine", emoji: "🐟", water: "saltwater", tier: "common", weight: 14, bite: [3, 5], cm: [8, 18], value: P.sand_sardine, speed: 0.55, size: 0.5, pattern: "sine", barScale: 1, time: "day", mass: 8 },
  striped_mullet: { name: "Striped Mullet", emoji: "🐟", water: "saltwater", tier: "common", weight: 14, bite: [3, 6], cm: [20, 40], value: P.striped_mullet, speed: 0.6, size: 0.55, pattern: "erratic", barScale: 1, time: "day", mass: 11 },
  butterfly_fish: { name: "Butterfly Fish", emoji: "🐠", water: "saltwater", tier: "common", weight: 12, bite: [3, 5], cm: [10, 18], value: P.butterfly_fish, speed: 0.6, size: 0.5, pattern: "sine", barScale: 1, time: "day", mass: 20 },
  sunset_clownfish: { name: "Sunset Clownfish", emoji: "🐠", water: "saltwater", tier: "uncommon", weight: 6, bite: [4, 7], cm: [7, 14], value: P.sunset_clownfish, speed: 0.85, size: 0.6, pattern: "erratic", barScale: 0.95, time: "day", mass: 15 },
  yellowtail_snapper: { name: "Yellowtail Snapper", emoji: "🐟", water: "saltwater", tier: "uncommon", weight: 5, bite: [4, 7], cm: [25, 50], value: P.yellowtail_snapper, speed: 0.9, size: 0.7, pattern: "erratic", barScale: 0.95, time: "day", mass: 13 },
  blue_parrotfish: { name: "Blue Parrotfish", emoji: "🐠", water: "saltwater", tier: "rare", weight: 3, bite: [6, 10], cm: [30, 60], value: P.blue_parrotfish, speed: 1.05, size: 0.8, pattern: "koi", barScale: 0.88, time: "day", mass: 16 },
  coral_grouper: { name: "Coral Grouper", emoji: "🐡", water: "saltwater", tier: "rare", weight: 2.4, bite: [6, 10], cm: [40, 90], value: P.coral_grouper, speed: 1.1, size: 0.85, pattern: "plunge", barScale: 0.86, time: "day", mass: 17 },
  sailfin_dorado: { name: "Sailfin Dorado", emoji: "🐬", water: "saltwater", tier: "rare", grade: "epic", minRod: 6, weight: 2.6, bite: [8, 12], cm: [70, 140], value: P.sailfin_dorado, speed: 1.3, size: 0.9, pattern: "erratic", barScale: 0.8, time: "day", mass: 9 },
  golden_tarpon: { name: "Golden Tarpon", emoji: "🐟", water: "saltwater", tier: "legendary", weight: 1, bite: [9, 14], cm: [100, 200], value: P.golden_tarpon, speed: 1.45, size: 1.0, pattern: "plunge", barScale: 0.7, time: "day", mass: 10 },
  // the pier, by night
  moon_anchovy: { name: "Moon Anchovy", emoji: "🐟", water: "saltwater", tier: "common", weight: 14, bite: [3, 5], cm: [7, 15], value: P.moon_anchovy, speed: 0.55, size: 0.5, pattern: "sine", barScale: 1, time: "night", mass: 8 },
  silver_pomfret: { name: "Silver Pomfret", emoji: "🐟", water: "saltwater", tier: "common", weight: 14, bite: [3, 6], cm: [18, 34], value: P.silver_pomfret, speed: 0.6, size: 0.55, pattern: "erratic", barScale: 1, time: "night", mass: 22 },
  lantern_squid: { name: "Lantern Squid", emoji: "🦑", water: "saltwater", tier: "uncommon", weight: 6, bite: [4, 7], cm: [15, 35], value: P.lantern_squid, speed: 0.8, size: 0.65, pattern: "sine", barScale: 0.95, time: "night", mass: 6 },
  spotted_moray: { name: "Spotted Moray", emoji: "🐍", water: "saltwater", tier: "uncommon", weight: 5, bite: [4, 7], cm: [50, 110], value: P.spotted_moray, speed: 0.95, size: 0.7, pattern: "erratic", barScale: 0.93, time: "night", mass: 4 },
  prism_jellyfish: { name: "Prism Jellyfish", emoji: "🪼", water: "saltwater", tier: "rare", weight: 3, bite: [6, 10], cm: [15, 40], value: P.prism_jellyfish, speed: 0.75, size: 0.85, pattern: "sine", barScale: 0.9, time: "night", mass: 4 },
  moonlit_ray: { name: "Moonlit Ray", emoji: "🐟", water: "saltwater", tier: "rare", weight: 2.4, bite: [6, 10], cm: [50, 120], value: P.moonlit_ray, speed: 1.1, size: 0.9, pattern: "plunge", barScale: 0.86, time: "night", mass: 9 },
  abyss_lionfish: { name: "Abyss Lionfish", emoji: "🐡", water: "saltwater", tier: "rare", grade: "epic", minRod: 6, weight: 2.6, bite: [8, 12], cm: [25, 45], value: P.abyss_lionfish, speed: 1.3, size: 0.85, pattern: "koi", barScale: 0.8, time: "night", mass: 18 },
  phantom_swordfish: { name: "Phantom Swordfish", emoji: "🗡️", water: "saltwater", tier: "legendary", weight: 1, bite: [9, 14], cm: [150, 300], value: P.phantom_swordfish, speed: 1.5, size: 1.0, pattern: "erratic", barScale: 0.68, time: "night", mass: 6 },
  // the Open Sea, at any hour (and in the cove)
  flying_fish: { name: "Flying Fish", emoji: "🐟", water: "saltwater", zone: "sea", tier: "common", weight: 14, bite: [3, 5], cm: [15, 30], value: P.flying_fish, speed: 0.7, size: 0.55, pattern: "erratic", barScale: 1, time: "any", mass: 9 },
  bonito: { name: "Striped Bonito", emoji: "🐟", water: "saltwater", zone: "sea", tier: "common", weight: 12, bite: [3, 6], cm: [30, 60], value: P.bonito, speed: 0.75, size: 0.6, pattern: "sine", barScale: 1, time: "any", mass: 14 },
  skipjack_tuna: { name: "Skipjack Tuna", emoji: "🐟", water: "saltwater", zone: "sea", tier: "uncommon", weight: 6, bite: [4, 7], cm: [40, 80], value: P.skipjack_tuna, speed: 0.95, size: 0.7, pattern: "erratic", barScale: 0.95, time: "any", mass: 16 },
  barracuda: { name: "Great Barracuda", emoji: "🐟", water: "saltwater", zone: "sea", tier: "uncommon", weight: 5, bite: [4, 7], cm: [60, 130], value: P.barracuda, speed: 1.0, size: 0.75, pattern: "plunge", barScale: 0.93, time: "any", mass: 6 },
  wahoo: { name: "Wahoo", emoji: "🐟", water: "saltwater", zone: "sea", tier: "rare", weight: 3, bite: [6, 10], cm: [80, 160], value: P.wahoo, speed: 1.15, size: 0.85, pattern: "erratic", barScale: 0.88, time: "any", mass: 8 },
  giant_trevally: { name: "Giant Trevally", emoji: "🐟", water: "saltwater", zone: "sea", tier: "rare", weight: 2.4, bite: [6, 10], cm: [60, 120], value: P.giant_trevally, speed: 1.2, size: 0.9, pattern: "plunge", barScale: 0.86, time: "any", mass: 18 },
  sunfish_mola: { name: "Ocean Sunfish", emoji: "🐡", water: "saltwater", zone: "sea", tier: "rare", grade: "epic", minRod: 6, weight: 2.6, bite: [8, 12], cm: [100, 220], value: P.sunfish_mola, speed: 1.25, size: 1.0, pattern: "sine", barScale: 0.8, time: "any", mass: 40 },
  blue_marlin: { name: "Blue Marlin", emoji: "🗡️", water: "saltwater", zone: "sea", tier: "legendary", weight: 1, bite: [9, 14], cm: [200, 380], value: P.blue_marlin, speed: 1.55, size: 1.0, pattern: "plunge", barScale: 0.66, time: "any", mass: 7 },
  // the Hidden Cove's own
  glass_octopus: { name: "Glass Octopus", emoji: "🐙", water: "saltwater", zone: "cove", tier: "rare", grade: "epic", minRod: 6, weight: 2.6, bite: [8, 12], cm: [20, 45], value: P.glass_octopus, speed: 1.3, size: 0.85, pattern: "koi", barScale: 0.78, time: "any", mass: 12 },
  abyssal_oarfish: { name: "Abyssal Oarfish", emoji: "🐉", water: "saltwater", zone: "cove", tier: "legendary", weight: 1, bite: [10, 15], cm: [300, 600], value: P.abyssal_oarfish, speed: 1.5, size: 1.0, pattern: "sine", barScale: 0.66, time: "any", mass: 1 },
  pearl_whale: { name: "Abyssal Pearl Whale", emoji: "🐳", water: "saltwater", zone: "cove", tier: "mythic", weight: 1, bite: [11, 16], cm: [120, 260], value: P.pearl_whale, speed: 1.6, size: 1.0, pattern: "plunge", barScale: 0.6, time: "any", mass: 10 },
} as const satisfies Record<string, FishSpecies>;
export type SeaFishId = keyof typeof SEA_FISH;
export const SEA_FISH_IDS = Object.keys(SEA_FISH) as SeaFishId[];

/** The zone a salt-water fish swims in (the pier's, where it names none). */
export const zoneOf = (id: SeaFishId): SeaZone => (SEA_FISH[id] as FishSpecies).zone ?? "pier";
/** Whether a fish of `zone` bites where the line is: the pier's off the pier, the sea's at sea and in
 *  the cove, the cove's own only there. */
export const swimsIn = (zone: SeaZone, where: SeaZone): boolean => (zone === "pier" ? where === "pier" : zone === "sea" ? where !== "pier" : where === "cove");
/** The least rod that lands each salt-water rarity (the owner's ladder: docs/beach-design.md). */
export const SEA_MIN_ROD = { common: 1, uncommon: 4, rare: 5, epic: 6, legendary: 6, mythic: 7 } as const;
/** The least rod that may cast from the boat (the Open Sea, the cove). */
export const SEA_CAST_ROD = 5;
