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
 *  night's fifteen, shared/fishing.ts FISH), by rarity: a common 5-8, an uncommon 28-40, a rare
 *  75-110, a legendary 380-480 (a hard fight on the reel), a mythic 1,500-1,800. */
export const FISH_PRICES = {
  // by day
  minnow: 5,
  perch: 7,
  bluegill: 6,
  dace: 5,
  chub: 8,
  trout: 30,
  smallmouth_bass: 34,
  grayling: 32,
  pike: 38,
  salmon: 80,
  golden_trout: 95,
  muskellunge: 110,
  golden_arowana: 400,
  dawn_paddlefish: 440,
  sunfire_koi: 1500,
  // by night
  bullhead: 6,
  moon_shiner: 5,
  stone_loach: 7,
  sculpin: 6,
  glass_eel: 8,
  catfish: 36,
  burbot: 33,
  walleye: 40,
  lantern_perch: 28,
  sturgeon: 105,
  ghost_carp: 85,
  silver_gar: 100,
  abyssal_koi: 480,
  starlight_eel: 380,
  moonveil_leviathan: 1800,
} as const;
/** How often each rarity bites, of every bite (the weights split it between the kinds). */
export const FISH_TIER_ODDS = { common: 0.7, uncommon: 0.2, rare: 0.075, legendary: 0.02, mythic: 0.005 } as const;

/** The livewells' prices, tier 1 (the Wooden Pail, everyone's) to tier 5. */
export const CREEL_PRICES = [0, 80, 180, 400, 850] as const;
/** What each livewell tier holds (fish). A player already holding more keeps it all: only new
 *  catches wait for room (the soft clamp). */
export const CREEL_CAPACITY = [5, 12, 25, 45, 70] as const;

/** The tackle: bait by the pack (five kinds, from Barnaby or Finley); the rods, T2 and T3 from
 *  Barnaby, every tier from Finley on the Whispering Woods' river. */
export const TACKLE_PRICES = {
  basicBait: 15, // Earthworms x5
  cornDough: 20, // Sweet Corn Dough x5
  glowCricket: 35, // Glow-Crickets x4
  dragonflyLarva: 45, // Dragonfly Larva x3
  luckyChum: 50, // Stardust Pellets x3
  proRod: 250,
  heronRod: 650,
  masterRod: 1600,
  moonlightRod: 3400,
} as const;

// --- the woodpile -----------------------------------------------------------------------------------

/** Buster's base price for a 1x log (a log's worth scales with its tree's size squared): the camp's
 *  Soft Pine (3-5 a log), the old hardwood and golden charcoal, and the Whispering Woods' birch
 *  (10-16), cedar (28-42), maple (60-120) and elderwood (250-400). */
export const WOOD_PRICES = { pine: 4, oak: 5, charcoal: 12, birch: 12, cedar: 32, maple: 80, elderwood: 290 } as const;
/** A plain carved piece or a plank off the workbench. */
export const CARVED_PRICE = 8;
/** What Buster pays for a Pine Resin (from a critical chop): worth keeping for the workbench's
 *  Adhesive Slot, worth selling when the carrier is full. */
export const RESIN_BUY_PRICE = 10;
/** The axes (the flint one, T1, is everyone's): T2 and T3 from Buster, T4 and T5 from Bramble. */
export const AXE_PRICES = { iron: 250, tempered: 700, golden: 1600, runic: 3400 } as const;
/** The wood carriers' prices, tier 1 (the Twine Wood Strap, everyone's) to tier 5, and what each
 *  holds (logs and carved pieces). A player already carrying more keeps it all: only new wood
 *  waits for room (the soft clamp). */
export const CARRIER_PRICES = [0, 80, 180, 400, 850] as const;
export const CARRIER_CAPACITY = [8, 18, 35, 60, 100] as const;
/** What Buster pays for a bundle of split Firewood: a Soft Pine log's three bundles are worth about
 *  the log (no profit in splitting to sell: Firewood is for the bonfire). */
export const FIREWOOD_PRICE = 2;
/** The felling's by-products (a round on a T2-T5 tree that drops no log): what Bramble and Buster
 *  pay for each, and how much of the bonfire a handful of Ancient Wood Shavings feeds (%). */
export const BYPRODUCT_PRICES = { bark: 2, amber: 5, leafAmber: 15, shavings: 35 } as const;
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
  common: [120, 280],
  rare: [450, 800],
  prestige: [1500, 3200],
};
/** The outfits (whole sets) sit higher, the wardrobe's big sinks: an everyday or rare set 1,200 to
 *  2,500, a prestige set 3,500 to 6,000. The bands above are the hats' and the hair's. */
export const OUTFIT_BANDS: Record<WardrobeTier, readonly [number, number]> = {
  common: [1200, 1500],
  rare: [1600, 2500],
  prestige: [3500, 6000],
};
export const WARDROBE_TIER_LABEL: Record<WardrobeTier, string> = { common: "Common", rare: "Rare", prestige: "Prestige" };
