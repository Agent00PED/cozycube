// The angler's world, as both sides see it: what swims in each water, how big it runs and how
// long it takes to bite; the rods and baits Barnaby the Angler sells; the Fish Creel every angler
// carries (what they caught, and their best of each kind), and what he pays for it.
//
// The server rolls every catch (rollFish, rollCatch) and keeps each angler's FishingProfile in
// their player record (it survives room switches, reconnects and restarts); the client draws the
// same tables in the reel, the creel and Barnaby's shop.

import type { SwimPattern } from "./types";

export type Water = "freshwater" | "saltwater";
export type FishTier = "common" | "uncommon" | "rare" | "epic" | "legendary";

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
}

export const FISH = {
  // freshwater: the Starlight Campfire's river
  chibi_minnow: { name: "Chibi Minnow", emoji: "🐡", water: "freshwater", tier: "common", weight: 40, bite: [3, 5], cm: [5, 12], value: 6, speed: 0.5, size: 0.5, pattern: "sine", barScale: 1 },
  mud_carp: { name: "Mud Carp", emoji: "🐟", water: "freshwater", tier: "uncommon", weight: 28, bite: [4, 7], cm: [22, 48], value: 12, speed: 0.7, size: 0.7, pattern: "plunge", barScale: 1 },
  midnight_trout: { name: "Midnight Trout", emoji: "🐠", water: "freshwater", tier: "rare", weight: 18, bite: [5, 9], cm: [25, 55], value: 22, speed: 0.95, size: 0.8, pattern: "erratic", barScale: 0.95 },
  golden_catfish: { name: "Golden Catfish", emoji: "🐈", water: "freshwater", tier: "epic", weight: 9, bite: [7, 11], cm: [45, 95], value: 45, speed: 1.15, size: 0.95, pattern: "plunge", barScale: 0.85 },
  star_koi: { name: "Cosmic Star-Koi", emoji: "🎏", water: "freshwater", tier: "legendary", weight: 5, bite: [8, 14], cm: [50, 85], value: 90, speed: 1.45, size: 1.0, pattern: "koi", barScale: 0.72 },
  // saltwater: the Sunset Beach Bar's pier (registered for when it opens its waters)
  sand_sardine: { name: "Sand Sardine", emoji: "🐟", water: "saltwater", tier: "common", weight: 42, bite: [3, 5], cm: [8, 18], value: 6, speed: 0.55, size: 0.5, pattern: "sine", barScale: 1 },
  sunset_clownfish: { name: "Sunset Clownfish", emoji: "🐠", water: "saltwater", tier: "uncommon", weight: 30, bite: [4, 7], cm: [7, 14], value: 14, speed: 0.85, size: 0.6, pattern: "erratic", barScale: 1 },
  prism_jellyfish: { name: "Prism Jellyfish", emoji: "🪼", water: "saltwater", tier: "rare", weight: 18, bite: [6, 10], cm: [15, 40], value: 28, speed: 0.75, size: 0.85, pattern: "sine", barScale: 0.9 },
  pearl_whale: { name: "Abyssal Pearl Whale", emoji: "🐳", water: "saltwater", tier: "legendary", weight: 4, bite: [9, 14], cm: [120, 260], value: 120, speed: 1.35, size: 1.0, pattern: "plunge", barScale: 0.7 },
} as const satisfies Record<string, FishSpecies>;
export type FishId = keyof typeof FISH;
export const FISH_IDS = Object.keys(FISH) as FishId[];
export function isFishId(v: unknown): v is FishId {
  return typeof v === "string" && v in FISH;
}
export function fishOf(water: Water): FishId[] {
  return FISH_IDS.filter((id) => FISH[id].water === water);
}

export const TIER_LABEL: Record<FishTier, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary ✨" };
const RARE_TIERS: ReadonlySet<FishTier> = new Set(["rare", "epic", "legendary"]);

// --- rods and baits -----------------------------------------------------------------------------

export interface Rod {
  name: string;
  emoji: string;
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
  bamboo: { name: "Bamboo Rod", emoji: "🎋", price: 0, barBonus: 0, tensionResist: 0, aura: false, blurb: "Light, springy and everyone's first." },
  willow: { name: "Willow Creek Rod", emoji: "🌿", price: 350, barBonus: 0.2, tensionResist: 0, aura: false, blurb: "+20% green reel bar." },
  starlight: { name: "Starlight Composite", emoji: "🌠", price: 1200, barBonus: 0.2, tensionResist: 0.35, aura: true, blurb: "+20% bar, the line holds 35% longer, and a star aura." },
} as const satisfies Record<string, Rod>;
export type RodId = keyof typeof RODS;
export const ROD_IDS = Object.keys(RODS) as RodId[];
export function isRodId(v: unknown): v is RodId {
  return typeof v === "string" && v in RODS;
}

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
  blurb: string;
}
export const BAITS = {
  glowworm: { name: "Glowworms", emoji: "🪱", price: 30, pack: 5, biteMul: 0.6, rareMul: 1, blurb: "Bites come 40% sooner." },
  stardrop: { name: "Star Droplets", emoji: "💧", price: 75, pack: 3, biteMul: 1, rareMul: 2.5, blurb: "Rare fish bite 2.5x as often." },
} as const satisfies Record<string, Bait>;
export type BaitId = keyof typeof BAITS;
export const BAIT_IDS = Object.keys(BAITS) as BaitId[];
export function isBaitId(v: unknown): v is BaitId {
  return typeof v === "string" && v in BAITS;
}

// --- the creel ----------------------------------------------------------------------------------

/** A fish in the creel: its kind, its length and its quality (1-3 stars). */
export interface CreelFish {
  s: FishId;
  cm: number;
  q: 1 | 2 | 3;
}
export const CREEL_BASE_SLOTS = 6;
export const CREEL_MAX_SLOTS = 12;
/** Barnaby stitches on two more slots at a time, for these (6 -> 8 -> 10 -> 12). */
export const CREEL_UPGRADE_COSTS = [150, 250, 400];
export function creelUpgradeCost(slots: number): number | null {
  const step = Math.round((slots - CREEL_BASE_SLOTS) / 2);
  return CREEL_UPGRADE_COSTS[step] ?? null;
}
/** A full creel: a fresh common catch goes back in the river, and this is paid for letting it go. */
export const CREEL_RELEASE_COINS = 5;

/** Everything the angler carries between visits: the creel, their rods and baits, their records
 *  (the longest of each kind), and how long they have left being Well-Fed. */
export interface FishingProfile {
  creel: CreelFish[];
  slots: number;
  rod: RodId;
  rods: RodId[];
  baits: Partial<Record<BaitId, number>>;
  /** The bait on the hook ("" none): one goes on each cast while any are left. */
  bait: BaitId | "";
  records: Partial<Record<FishId, number>>;
  /** Well-Fed until (epoch ms, the server's clock). */
  fedUntil: number;
}
export function emptyFishingProfile(): FishingProfile {
  return { creel: [], slots: CREEL_BASE_SLOTS, rod: "bamboo", rods: ["bamboo"], baits: {}, bait: "", records: {}, fedUntil: 0 };
}
/** A profile read back from storage (or the network), with anything unknown or broken dropped. */
export function sanitizeFishingProfile(raw: unknown): FishingProfile {
  const p = emptyFishingProfile();
  if (!raw || typeof raw !== "object") return p;
  const r = raw as Record<string, unknown>;
  p.slots = Math.max(CREEL_BASE_SLOTS, Math.min(CREEL_MAX_SLOTS, Math.round(Number(r.slots) || CREEL_BASE_SLOTS)));
  if (Array.isArray(r.creel)) {
    for (const f of r.creel) {
      const fish = f as Record<string, unknown>;
      if (!isFishId(fish?.s)) continue;
      const q = Number(fish.q);
      p.creel.push({ s: fish.s, cm: Math.max(1, Math.round(Number(fish.cm) || 1)), q: q === 3 ? 3 : q === 2 ? 2 : 1 });
      if (p.creel.length >= p.slots) break;
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
  p.fedUntil = Math.max(0, Number(r.fedUntil) || 0);
  return p;
}

/** What Barnaby pays for a fish: its kind's value, more for a long one, far more for stars. */
export const STAR_VALUE = [1, 1.5, 2.2] as const;
export function fishValue(f: CreelFish): number {
  const sp = FISH[f.s];
  const [lo, hi] = sp.cm;
  const frac = hi > lo ? Math.max(0, Math.min(1, (f.cm - lo) / (hi - lo))) : 0.5;
  return Math.max(1, Math.round(sp.value * (0.8 + 0.4 * frac) * STAR_VALUE[f.q - 1]));
}
export function stars(q: number): string {
  return "★".repeat(q) + "☆".repeat(3 - q);
}

// --- rolling a catch ----------------------------------------------------------------------------

export interface CatchLuck {
  /** Extra weight on rare, epic and legendary fish (0.15: +15%), from the Cozy Aura. */
  rareLuck?: number;
  bait?: BaitId | "";
  /** Only the commons (AFK fishing). */
  commonOnly?: boolean;
}

/** What bites, weighted, with luck tipping it toward the rare end. */
export function rollFish(water: Water, luck: CatchLuck = {}, rand: () => number = Math.random): FishId {
  const rareMul = (1 + (luck.rareLuck ?? 0)) * (luck.bait ? BAITS[luck.bait].rareMul : 1);
  const pool = fishOf(water).filter((id) => !luck.commonOnly || FISH[id].tier === "common");
  const weightOf = (id: FishId) => FISH[id].weight * (RARE_TIERS.has(FISH[id].tier) ? rareMul : 1);
  let roll = rand() * pool.reduce((a, id) => a + weightOf(id), 0);
  for (const id of pool) {
    roll -= weightOf(id);
    if (roll <= 0) return id;
  }
  return pool[0];
}

/** How big it came up, and its stars: a long one leans silver, and luck can make it gold. */
export function rollCatch(species: FishId, luck: CatchLuck = {}, rand: () => number = Math.random): CreelFish {
  const [lo, hi] = FISH[species].cm;
  // lengths bunch toward the middle; the extremes are rarer
  const frac = (rand() + rand() + rand()) / 3;
  const cm = Math.round(lo + (hi - lo) * frac);
  const gold = 0.06 + (luck.rareLuck ?? 0) * 0.2 + (frac > 0.8 ? 0.1 : 0);
  const silver = 0.22 + (frac > 0.6 ? 0.15 : 0);
  const r = rand();
  const q: 1 | 2 | 3 = r < gold ? 3 : r < gold + silver ? 2 : 1;
  return { s: species, cm, q };
}

/** Seconds from the cast to the bite: the kind's own range, sooner with glowworms, two seconds
 *  sooner while Well-Fed, never under a second and a half. */
export function biteSeconds(species: FishId, opts: { fed?: boolean; bait?: BaitId | "" } = {}, rand: () => number = Math.random): number {
  const [lo, hi] = FISH[species].bite;
  let s = lo + (hi - lo) * rand();
  if (opts.bait) s *= BAITS[opts.bait].biteMul;
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

/** Line in, feet up: a common fish into the creel every so often. */
export const CAMP_AFK_S = { min: 15, max: 20 };
