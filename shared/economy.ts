// The calibrated economy, in one table: every base price the camp's traders pay and ask, sized so
// that a fresh player (STARTING_COINS) earns their first upgrade in an evening, and each next tier
// of a carrier or a creel costs about twice the last, as its capacity grows.
//
// The modules that own each thing read their numbers from here: shared/fishing.ts (the species,
// creels, rods and bait), shared/chop.ts (the wood, the axes, the wood carriers), shared/crafting.ts
// (the carved pieces), shared/gear.ts (Buster's kit) and shared/types.ts (the wardrobe). What a
// trader actually pays today moves with the hourly market (shared/market.ts).

/** A fresh account's wallet (the Phase 3 wipe put everyone back on it): 50 coins, 0 chips. */
export const START_COINS = 50;
export const START_CHIPS = 0;

// --- the river ------------------------------------------------------------------------------------

/** Barnaby's base price for an average one-star fish of each kind (the day's fifteen and the
 *  night's fifteen, shared/fishing.ts FISH), by rarity, calibrated to real time at the river: a
 *  common 4 (the AFK line's fodder), an uncommon 18, a rare 70, a legendary 380-420 (a hard fight on
 *  the reel), a mythic 1,500 (the pinnacle trophy). A hand-reeled line on a starter rod earns about
 *  18-45 coins a minute; an AFK line about 4-6 (AFK_CATCH_S paces it). */
export const FISH_TIER_PRICE = { common: 4, uncommon: 18, rare: 70, legendary: 400, mythic: 1500 } as const;
export const FISH_PRICES = {
  // by day
  minnow: 4,
  perch: 4,
  bluegill: 4,
  dace: 4,
  chub: 4,
  trout: 18,
  smallmouth_bass: 18,
  grayling: 18,
  pike: 18,
  salmon: 70,
  golden_trout: 70,
  muskellunge: 70,
  golden_arowana: 400,
  dawn_paddlefish: 420,
  sunfire_koi: 1500,
  // by night
  bullhead: 4,
  moon_shiner: 4,
  stone_loach: 4,
  sculpin: 4,
  glass_eel: 4,
  catfish: 18,
  burbot: 18,
  walleye: 18,
  lantern_perch: 18,
  sturgeon: 70,
  ghost_carp: 70,
  silver_gar: 70,
  abyssal_koi: 410,
  starlight_eel: 380,
  moonveil_leviathan: 1500,
} as const;

/** What bites, by the rod's tier (T1 to T5): the odds of each rarity. A hand-reeled line (the
 *  angler working the reel and the line's tension) reaches the rare end far more than an AFK one;
 *  an AFK line without bait brings in only commons, and an AFK line never lands a mythic (one that
 *  bites snaps the line). The bait, the rapids and the Cozy Aura tip a hand-reeled line's odds
 *  further toward the rare end; an AFK line's odds are exactly these. (The legendaries and mythics
 *  swim only in the Whispering Woods' rapids: elsewhere a roll that high lands the rarest fish that
 *  swims there.) */
export interface TierOdds {
  common: number;
  uncommon: number;
  rare: number;
  legendary: number;
  mythic: number;
}
export const ACTIVE_TIER_ODDS: readonly TierOdds[] = [
  { common: 0.85, uncommon: 0.15, rare: 0, legendary: 0, mythic: 0 },
  { common: 0.6, uncommon: 0.33, rare: 0.07, legendary: 0, mythic: 0 },
  { common: 0.38, uncommon: 0.42, rare: 0.18, legendary: 0.02, mythic: 0 },
  { common: 0.24, uncommon: 0.38, rare: 0.3, legendary: 0.07, mythic: 0.01 },
  { common: 0.15, uncommon: 0.32, rare: 0.38, legendary: 0.12, mythic: 0.03 },
];
export const AFK_BAITED_TIER_ODDS: readonly TierOdds[] = [
  { common: 0.94, uncommon: 0.06, rare: 0, legendary: 0, mythic: 0 },
  { common: 0.75, uncommon: 0.23, rare: 0.02, legendary: 0, mythic: 0 },
  { common: 0.55, uncommon: 0.34, rare: 0.105, legendary: 0.005, mythic: 0 },
  { common: 0.42, uncommon: 0.38, rare: 0.188, legendary: 0.012, mythic: 0 },
  { common: 0.3, uncommon: 0.42, rare: 0.26, legendary: 0.02, mythic: 0 },
];
export const AFK_UNBAITED_TIER_ODDS: TierOdds = { common: 1, uncommon: 0, rare: 0, legendary: 0, mythic: 0 };

/** The livewells' prices, tier 1 (the Wooden Pail, everyone's) to tier 5: the storage tiers' sinks
 *  (300, 950, 2,600, 6,500), the same as the wood carriers'. */
export const CREEL_PRICES = [0, 300, 950, 2600, 6500] as const;
/** What each livewell tier holds (fish). A player already holding more keeps it all: only new
 *  catches wait for room (the soft clamp). */
export const CREEL_CAPACITY = [5, 12, 25, 45, 70] as const;

/** The tackle: bait by the pack (five kinds, from Barnaby or Finley); the rods, T2 and T3 from
 *  Barnaby, every tier from Finley on the Whispering Woods' river (the tool tiers' sinks: 250, 850,
 *  2,400, 6,000, the same as the axes'). */
export const TACKLE_PRICES = {
  basicBait: 15, // Earthworms x5
  cornDough: 20, // Sweet Corn Dough x5
  glowCricket: 35, // Glow-Crickets x4
  dragonflyLarva: 45, // Dragonfly Larva x3
  luckyChum: 50, // Stardust Pellets x3
  proRod: 250,
  heronRod: 850,
  masterRod: 2400,
  moonlightRod: 6000,
} as const;

// --- the woodpile -----------------------------------------------------------------------------------

/** Buster's base price for a 1x log (a log's worth scales with its tree's size squared), calibrated
 *  to a tree's labour: the camp's Soft Pine 4 (9-12 a tree), the old hardwood and golden charcoal,
 *  and the Whispering Woods' birch 9 (20-30 a tree), cedar 20 (50-70), maple 48 (150-190) and
 *  elderwood 120 (480-600). */
export const WOOD_PRICES = { pine: 4, oak: 5, charcoal: 12, birch: 9, cedar: 20, maple: 48, elderwood: 120 } as const;
/** A Colossal Titan's heavy logs are worth this much together at an even market (whatever their
 *  number): a big day, not a fortune. */
export const TITAN_YIELD = 750;
/** A plain carved piece or a plank off the workbench. */
export const CARVED_PRICE = 8;
/** What Buster pays for a Pine Resin (from a critical chop): worth keeping for the workbench's
 *  Adhesive Slot, worth selling when the carrier is full. */
export const RESIN_BUY_PRICE = 10;
/** The axes (the flint one, T1, is everyone's): T2 and T3 from Buster, T4 and T5 from Bramble. */
export const AXE_PRICES = { iron: 250, tempered: 850, golden: 2400, runic: 6000 } as const;
/** The wood carriers' prices, tier 1 (the Twine Wood Strap, everyone's) to tier 5, what each holds
 *  (logs), and the room its pouches have beside it (the by-products, Pine Resin and Sawdust
 *  together): the pouches grow with the carrier, never bought apart. A player already carrying more
 *  keeps it all: only new wood (or a new by-product) waits for room (the soft clamp). */
export const CARRIER_PRICES = [0, 300, 950, 2600, 6500] as const;
export const CARRIER_CAPACITY = [8, 18, 35, 60, 100] as const;
export const POUCH_CAPACITY = [30, 60, 100, 160, 250] as const;
/** The craft stash beside the carrier: this many slots, each a stack of up to CRAFT_SLOT_STACK of a
 *  kind (carved pieces, consumables, trade goods; never logs). */
export const CRAFT_STASH_SLOTS = 12;
export const CRAFT_SLOT_STACK = 99;
/** What Buster pays for a bundle of split Firewood, fixed (the hour's market never moves it): a Soft
 *  Pine log's three bundles fetch 6, the finer woods' far less than their logs (Firewood is for the
 *  bonfire). */
export const FIREWOOD_PRICE = 2;
/** The felling's by-products (a round on a T2-T5 tree that drops no log): what Bramble and Buster
 *  pay for each, and how much of the bonfire a handful of Ancient Wood Shavings feeds (%). */
export const BYPRODUCT_PRICES = { bark: 2, amber: 5, leafAmber: 15, shavings: 35, scales: 1 } as const;
export const SHAVINGS_FUEL = 15;
/** Buster's forest permits: a Day Trip (one way in through the archway, used on entering) and the
 *  Ranger's Badge (the Whispering Woods for good). */
export const PERMIT_PRICES = { dayTrip: 200, rangerBadge: 3800 } as const;
/** The most Day Trip Permits one pocket holds. */
export const MAX_DAY_PERMITS = 10;

// --- the Whispering Pines Slingshot Gallery ---------------------------------------------------------

/** A round's prize by its score: the tiers (the best one also brings the Eagle Eye), kept within
 *  easy reach on a phone. */
export const SLINGSHOT_PRIZES = [
  { score: 3000, coins: 60, eagle: true },
  { score: 1800, coins: 28, eagle: false },
  { score: 800, coins: 12, eagle: false },
] as const;
/** A Golden Acorn hit: coins at once. */
export const GOLDEN_ACORN_COINS = 15;
/** How many rounds a player may play for coins an hour (after that, for fun). */
export const SLINGSHOT_PAID_ROUNDS_PER_HOUR = 6;
/** The Eagle Eye (the gallery's top prize): how long it lasts, and how much wider it makes the
 *  felling ring's golden sweet band (a share of the trunk's radius). */
export const EAGLE_EYE_MS = 10 * 60_000;
export const EAGLE_EYE_ZONE = 0.04;
/** The rapids' richer water: added to the rare luck of every cast there. */
export const RAPIDS_LUCK = 0.35;
/** Bramble's advanced workbench: a Masterwork's chance, raised by this share. */
export const ADVANCED_BENCH_MASTER = 0.08;
/** The accessories (shared/gear.ts): the woodcutter's at Buster's (T1-T3) and Bramble's (T1-T5),
 *  the angler's at Barnaby's (T1-T3) and Finley's (T1-T5). */
export const GEAR_PRICES = {
  deerskin_gloves: 450,
  titan_gauntlets: 2200,
  forester_belt: 650,
  resin_band: 350,
  oak_ring: 1200,
  dryad_amulet: 1800,
  wader_gloves: 450,
  tackle_holster: 650,
  sunburst_band: 350,
  moonlit_ring: 850,
  golden_scale_ring: 1500,
  lucky_bell: 1900,
} as const;
/** The gear retired with the slot system: what each sold for, paid back to whoever owned it (the
 *  Deerskin Grip Gloves carry over as the Deerskin Felling Gloves). */
export const RETIRED_GEAR_PRICES: Record<string, number> = { canvas_gloves: 120, traction_boots: 260, leather_apron: 420 };

// --- the wardrobe -------------------------------------------------------------------------------------

/** Every item in the wardrobe sits in one of three bands: an everyday piece, a rare one, a prestige
 *  one. (Starter pieces are free; the gachapon's and the Pioneer set are never sold.) */
export type WardrobeTier = "common" | "rare" | "prestige";
export const WARDROBE_BANDS: Record<WardrobeTier, readonly [number, number]> = {
  common: [800, 950],
  rare: [1800, 3200],
  prestige: [4000, 8000],
};
/** The outfits (whole sets) are the wardrobe's big sinks: an everyday set about 2,200 (the overalls),
 *  a rare archetype about 5,500, a prestige one up to 8,000. The bands above are the hats' and the
 *  hair's (a cozy hat 800). */
export const OUTFIT_BANDS: Record<WardrobeTier, readonly [number, number]> = {
  common: [2000, 2400],
  rare: [4800, 6000],
  prestige: [7000, 8000],
};
export const WARDROBE_TIER_LABEL: Record<WardrobeTier, string> = { common: "Common", rare: "Rare", prestige: "Prestige" };
