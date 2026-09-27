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

/** Barnaby's base price for an average one-star fish of each kind. */
export const FISH_PRICES = {
  minnow: 3,
  perch: 5,
  trout: 12,
  catfish: 18,
  salmon: 40,
  sturgeon: 65,
  golden_arowana: 150,
  abyssal_koi: 250,
} as const;
/** How often each tier bites, of every bite in the river (the weights split it between the kinds). */
export const FISH_TIER_ODDS = { common: 0.7, uncommon: 0.2, rare: 0.08, legendary: 0.02 } as const;

/** The creels' prices, tier 1 (the Wooden Pail, everyone's) to tier 6. */
export const CREEL_PRICES = [0, 80, 180, 400, 850, 1600] as const;

/** Barnaby's tackle: rods, and bait by the pack. */
export const TACKLE_PRICES = {
  basicBait: 15, // x5
  luckyChum: 50, // x3
  proRod: 250,
  masterRod: 950,
} as const;

// --- the woodpile -----------------------------------------------------------------------------------

/** Buster's base price for split wood: raw softwood, hardwood, and the rare golden charcoal. */
export const WOOD_PRICES = { pine: 2, oak: 5, charcoal: 12 } as const;
/** A plain carved piece or a plank off the workbench. */
export const CARVED_PRICE = 8;
/** What Buster pays for a Pine Resin (from a critical chop): worth keeping for the workbench's
 *  Adhesive Slot, worth selling when the carrier is full. */
export const RESIN_BUY_PRICE = 10;
/** The axes (the flint one is everyone's). */
export const AXE_PRICES = { iron: 250, golden: 950 } as const;
/** The wood carriers' prices, tier 1 (the Twine Wood Strap, everyone's) to tier 7. */
export const CARRIER_PRICES = [0, 80, 180, 400, 850, 1600, 2800] as const;
/** Buster's utility gear. */
export const GEAR_PRICES = { canvas_gloves: 120, deerskin_gloves: 380, traction_boots: 260, leather_apron: 420 } as const;

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
