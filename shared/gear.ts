// The accessories: kit bought once and worn in four slots (two hands' worth of gloves is one pair,
// a belt at the waist, a ring on each of two fingers, a charm about the neck). The woodcutter's are
// sold by Buster (T1-T3) and Bramble (T1-T5), the angler's by Barnaby (T1-T3) and Finley (T1-T5);
// the workbench's three relics are carved once, never sold (`craft` "bench": the Carved Lumberjack
// Belt, the Deepriver Fisherman Ring, the Heartwood Compass; the two before them, the Otter-Carved
// Hook Charm and the Amber Bark Bangle, are `legacy`: still worn and working by whoever carved one,
// and traded in at Buster's or Bramble's for their materials back); any of them
// goes in any slot of its kind, so a loadout mixes the crafts. They live in the camp
// profile (FishingProfile.gear owned, .worn on, oldest first); the server applies every effect and
// the client draws them from the same functions.

import { GEAR_PRICES, RETIRED_GEAR_PRICES } from "./economy";

export type GearSlot = "hands" | "waist" | "finger" | "charm";
/** How many of each slot can be worn at once (a third ring takes the oldest one's place). */
export const SLOT_CAP: Record<GearSlot, number> = { hands: 1, waist: 1, finger: 2, charm: 1 };
export const GEAR_SLOTS: GearSlot[] = ["hands", "waist", "finger", "charm"];
export const SLOT_LABEL: Record<GearSlot, string> = { hands: "Hands", waist: "Waist", finger: "Finger", charm: "Charm" };

export type GearId =
  | "deerskin_gloves"
  | "titan_gauntlets"
  | "forester_belt"
  | "resin_band"
  | "oak_ring"
  | "dryad_amulet"
  | "wader_gloves"
  | "tackle_holster"
  | "sunburst_band"
  | "moonlit_ring"
  | "golden_scale_ring"
  | "lucky_bell"
  // the workbench's relics
  | "carved_belt"
  | "deepriver_ring"
  | "heartwood_compass"
  // legacy relics
  | "hook_charm"
  | "bark_bangle";

export interface Gear {
  name: string;
  emoji: string;
  slot: GearSlot;
  /** Whose shops sell it: the woodcutter's or the angler's; "bench": carved at the workbench. */
  craft: "wood" | "fish" | "bench";
  /** T1-T3 at the campfire's stalls; T4-T5 only in the woods (Bramble, Finley). */
  tier: number;
  price: number;
  blurb: string;
  /** A relic off the bench now: still worn and working, traded in for its materials. */
  legacy?: boolean;
}

export const GEAR: Record<GearId, Gear> = {
  // the woodcutter's
  resin_band: { name: "Amber Resin Band", emoji: "💍", slot: "finger", craft: "wood", tier: 1, price: GEAR_PRICES.resin_band, blurb: "+15% by-products: a round that drops a log sometimes sheds its tree's by-product too" },
  deerskin_gloves: { name: "Deerskin Felling Gloves", emoji: "🧤", slot: "hands", craft: "wood", tier: 1, price: GEAR_PRICES.deerskin_gloves, blurb: "The felling ring closes 15% slower, and a 10% chance of a bonus log a round" },
  forester_belt: { name: "Forester's Toolbelt", emoji: "🪢", slot: "waist", craft: "wood", tier: 2, price: GEAR_PRICES.forester_belt, blurb: "+5 carrier slots, and +50% Firewood from every log you split" },
  oak_ring: { name: "Ancient Ring of Oak", emoji: "🌰", slot: "finger", craft: "wood", tier: 3, price: GEAR_PRICES.oak_ring, blurb: "A gold swing on a tree has it grow back 20% sooner" },
  dryad_amulet: { name: "Dryad's Sprout Amulet", emoji: "🌱", slot: "charm", craft: "wood", tier: 4, price: GEAR_PRICES.dryad_amulet, blurb: "A 15% chance the tree you start felling grows +0.15x bigger (its logs worth more)" },
  titan_gauntlets: { name: "Titan-Grip Gauntlets", emoji: "🦾", slot: "hands", craft: "wood", tier: 5, price: GEAR_PRICES.titan_gauntlets, blurb: "The gold sweet spot 25% wider, and a miss still deepens the notch (no drop)" },
  // the angler's
  sunburst_band: { name: "Sunburst River Band", emoji: "🌞", slot: "finger", craft: "fish", tier: 1, price: GEAR_PRICES.sunburst_band, blurb: "By day, fish bite 20% sooner" },
  wader_gloves: { name: "Neoprene Wader Gloves", emoji: "🧤", slot: "hands", craft: "fish", tier: 1, price: GEAR_PRICES.wader_gloves, blurb: "The line's tension builds 20% slower while you reel" },
  tackle_holster: { name: "Tackle Master's Holster", emoji: "🎒", slot: "waist", craft: "fish", tier: 2, price: GEAR_PRICES.tackle_holster, blurb: "+4 livewell slots, and bait lasts 20% longer" },
  moonlit_ring: { name: "Moonlit Abyssal Ring", emoji: "🌙", slot: "finger", craft: "fish", tier: 3, price: GEAR_PRICES.moonlit_ring, blurb: "By night, rare and nocturnal fish 25% likelier" },
  golden_scale_ring: { name: "Golden Scale Ring", emoji: "🪙", slot: "finger", craft: "fish", tier: 4, price: GEAR_PRICES.golden_scale_ring, blurb: "+15% chance of a ★★★ fish, and every fish 15% heavier" },
  lucky_bell: { name: "Finley's Lucky Bell", emoji: "🔔", slot: "charm", craft: "fish", tier: 5, price: GEAR_PRICES.lucky_bell, blurb: "Chimes 30 s before a King-Size Surge, and a surge's catches are King Size 5 in 10" },
  // the workbench's relics (carved once: shared/crafting.ts), working while worn
  carved_belt: { name: "Carved Lumberjack Belt", emoji: "🎗️", slot: "waist", craft: "bench", tier: 3, price: 0, blurb: "+8 carrier slots, and the splitting block's gauge runs 15% slower" },
  deepriver_ring: { name: "Deepriver Fisherman Ring", emoji: "💍", slot: "finger", craft: "bench", tier: 3, price: 0, blurb: "+6 livewell slots" },
  heartwood_compass: { name: "Heartwood Compass", emoji: "🧭", slot: "charm", craft: "bench", tier: 4, price: 0, blurb: "Pulses toward a standing Colossal tree (its name, its way and how far), and chimes when one rises" },
  // legacy relics: still working for whoever carved one; traded in for their materials
  hook_charm: { name: "Otter-Carved Hook Charm", emoji: "🦦", slot: "charm", craft: "bench", tier: 2, price: 0, legacy: true, blurb: "On a legendary or mythic fish: the line holds 0.5 s longer before its tension climbs, and the green is 25% bigger" },
  bark_bangle: { name: "Amber Bark Bangle", emoji: "📿", slot: "finger", craft: "bench", tier: 4, price: 0, legacy: true, blurb: "+20% by-products while felling: a round that drops a log sheds its tree's by-product too" },
};
export const GEAR_IDS = Object.keys(GEAR) as GearId[];
export function isGearId(v: unknown): v is GearId {
  return typeof v === "string" && v in GEAR;
}
/** One craft's gear, humblest first. */
export const gearOf = (craft: "wood" | "fish" | "bench"): GearId[] => GEAR_IDS.filter((id) => GEAR[id].craft === craft).sort((a, b) => GEAR[a].tier - GEAR[b].tier || GEAR[a].price - GEAR[b].price);

/** Putting a piece on: whatever it displaces comes off (the slot's one piece, or the oldest of two
 *  rings). Returns the new worn list (oldest first) and what came off. */
export function wearGear(worn: readonly GearId[], id: GearId): { worn: GearId[]; removed: GearId[] } {
  if (worn.includes(id)) return { worn: [...worn], removed: [] };
  const slot = GEAR[id].slot;
  const same = worn.filter((w) => GEAR[w].slot === slot);
  const removed = same.length >= SLOT_CAP[slot] ? same.slice(0, same.length - SLOT_CAP[slot] + 1) : [];
  return { worn: [...worn.filter((w) => !removed.includes(w)), id], removed };
}
/** The worn list made valid: owned pieces only, each slot within its cap (the newest kept). */
export function fitWorn(worn: readonly GearId[], owned: readonly GearId[]): GearId[] {
  let out: GearId[] = [];
  for (const id of worn) if (owned.includes(id) && !out.includes(id)) out = wearGear(out, id).worn;
  return out;
}
/** What the retired gear (the slot system's predecessors) in a stored profile is paid back. */
export function retiredGearRefund(rawGear: unknown): number {
  return Array.isArray(rawGear) ? rawGear.reduce((sum: number, id) => sum + (typeof id === "string" ? (RETIRED_GEAR_PRICES[id] ?? 0) : 0), 0) : 0;
}

// --- the effects, from what is worn --------------------------------------------------------------
type Worn = readonly GearId[];
const on = (worn: Worn, id: GearId) => worn.includes(id);

/** The Deerskin Felling Gloves: the felling ring's contraction this much slower. */
export const feltRingSlow = (worn: Worn) => (on(worn, "deerskin_gloves") ? 0.15 : 0);
/** The Deerskin Felling Gloves: a round's chance of a second log. */
export const bonusLogChance = (worn: Worn) => (on(worn, "deerskin_gloves") ? 0.1 : 0);
/** The Titan-Grip Gauntlets: the gold sweet spot this much wider. */
export const goldBonus = (worn: Worn) => (on(worn, "titan_gauntlets") ? 0.25 : 0);
/** The Titan-Grip Gauntlets: a miss still deepens the notch (it drops nothing). */
export const missDeepens = (worn: Worn) => on(worn, "titan_gauntlets");
/** The Forester's Toolbelt (or the Carved Lumberjack Belt): more carrier slots, and more Firewood
 *  from a split. */
export const carrierBonus = (worn: Worn) => (on(worn, "forester_belt") ? 5 : 0) + (on(worn, "carved_belt") ? 8 : 0);
export const splitYield = (worn: Worn) => (on(worn, "forester_belt") ? 1.5 : 1);
/** The Carved Lumberjack Belt: the splitting block's gauge this much slower. */
export const splitSlow = (worn: Worn) => (on(worn, "carved_belt") ? 0.15 : 0);
/** The Amber Resin Band and the Amber Bark Bangle: a round that drops a log also sheds its tree's
 *  by-product this often. */
export const byproductBonus = (worn: Worn) => (on(worn, "resin_band") ? 0.15 : 0) + (on(worn, "bark_bangle") ? 0.2 : 0);
/** The Otter-Carved Hook Charm, on a legendary or mythic fish: the tension window this much longer
 *  (s), and the green this much bigger. */
export const giantGrip = (worn: Worn) => (on(worn, "hook_charm") ? { window: 0.5, zone: 0.25 } : { window: 0, zone: 0 });
/** The Ancient Ring of Oak: a tree struck gold grows back this much sooner. */
export const quickRegrow = (worn: Worn) => (on(worn, "oak_ring") ? 0.2 : 0);
/** The Dryad's Sprout Amulet: the chance a tree grows as you start on it, and by how much. */
export const dryadChance = (worn: Worn) => (on(worn, "dryad_amulet") ? 0.15 : 0);
export const DRYAD_GROWTH = 0.15;
/** The Neoprene Wader Gloves: the line's tension builds this much slower. */
export const tensionCut = (worn: Worn) => (on(worn, "wader_gloves") ? 0.2 : 0);
/** The Tackle Master's Holster (and the Deepriver Fisherman Ring): more livewell slots; the holster, a
 *  cast's chance to keep its bait (a bait lasting 20% longer: one cast in six free). */
export const livewellBonus = (worn: Worn) => (on(worn, "tackle_holster") ? 4 : 0) + (on(worn, "deepriver_ring") ? 6 : 0);
export const baitSaveChance = (worn: Worn) => (on(worn, "tackle_holster") ? 1 - 1 / 1.2 : 0);
/** The Sunburst River Band: by day, bites (and an AFK line's waits) this much sooner. */
export const biteHaste = (worn: Worn, day: boolean) => (day && on(worn, "sunburst_band") ? 1.2 : 1);
/** The Moonlit Abyssal Ring: by night, rare luck (the rare and nocturnal fish) this much more. */
export const nightRareLuck = (worn: Worn, night: boolean) => (night && on(worn, "moonlit_ring") ? 0.25 : 0);
/** The Golden Scale Ring: a gold star this much likelier, and every fish this much heavier. */
export const goldStarBonus = (worn: Worn) => (on(worn, "golden_scale_ring") ? 0.15 : 0);
export const heftBonus = (worn: Worn) => (on(worn, "golden_scale_ring") ? 0.15 : 0);
/** The Heartwood Compass: a Colossal tree's pulse (its way and distance) while one stands. */
export const hasCompass = (worn: Worn) => on(worn, "heartwood_compass");
/** Finley's Lucky Bell: its warning ahead of a surge (s), and a surge's King Size chance with it. */
export const hasLuckyBell = (worn: Worn) => on(worn, "lucky_bell");
export const LUCKY_BELL_WARN_S = 30;
export const LUCKY_BELL_KING = 0.5;
