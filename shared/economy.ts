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
 *  night's fifteen, shared/fishing.ts FISH). */
export const FISH_PRICES = {
  // by day
  minnow: 3,
  perch: 5,
  bluegill: 4,
  dace: 3,
  chub: 6,
  trout: 12,
  smallmouth_bass: 16,
  grayling: 14,
  pike: 20,
  salmon: 40,
  golden_trout: 55,
  muskellunge: 70,
  golden_arowana: 170,
  dawn_paddlefish: 210,
  sunfire_koi: 720,
  // by night
  bullhead: 4,
  moon_shiner: 3,
  stone_loach: 5,
  sculpin: 4,
  glass_eel: 6,
  catfish: 18,
  burbot: 15,
  walleye: 20,
  lantern_perch: 13,
  sturgeon: 65,
  ghost_carp: 48,
  silver_gar: 58,
  abyssal_koi: 250,
  starlight_eel: 190,
  moonveil_leviathan: 850,
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

/** Buster's base price for wood: the Timber Trail's softwood, hardwood and golden charcoal, and the
 *  Whispering Woods' birch, cedar, maple and elderwood. */
export const WOOD_PRICES = { pine: 2, oak: 5, charcoal: 12, birch: 8, cedar: 16, maple: 30, elderwood: 70 } as const;
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
/** What Buster pays for a bundle of split Firewood. */
export const FIREWOOD_PRICE = 5;
/** The felling's by-products (a round on a T2-T5 tree that drops no log): what Bramble and Buster
 *  pay for each, and how much of the bonfire a handful of Ancient Wood Shavings feeds (%). */
export const BYPRODUCT_PRICES = { bark: 2, amber: 5, leafAmber: 12, shavings: 30 } as const;
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
export const WARDROBE_TIER_LABEL: Record<WardrobeTier, string> = { common: "Common", rare: "Rare", prestige: "Prestige" };
