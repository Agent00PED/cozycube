// The Expedition tier (T5), forged: the finest rod, axe and pickaxe and the largest livewell and wood
// carrier are not sold at any counter. They are made at the caverns' Thermal Bellows Forge, for coins
// and makings: ingots, and the top material of the tool's own craft (docs/economy-plan.md section 6:
// from T5 up an old fortune alone buys nothing, the crafts feed each other).
//
//   🌙 Mythril Moonlight Rod     12,500 🪙, 6 Iron Ingots, 4 Fine Fish Bones
//   🪄 Runic Elderwood Axe       12,500 🪙, 6 Iron Ingots, 6 Golden Leaf Amber
//   🌀 Deep Core Drill           31,500 🪙, 6 Silver Ingots, 4 Glimmer Shards
//   ✨ Starlight Deep Livewell    6,250 🪙, 3 Iron Ingots, 12 Fish Scales        (after the tier-4 livewell)
//   🧰 Forester Heavy Frame       6,250 🪙, 3 Iron Ingots, 6 Amber Resin         (after the tier-4 carrier)
//
// The same makings' check and spending serve Gus's satchel tiers (shared/satchel.ts `needs`). The
// tiers beyond (T6, T7: the beach) will be forged the same way, from this table.

import { AXES, BYPRODUCTS, takeLogs, WOOD, WOOD_CARRIER_TIERS, type ByproductId, type WoodKind } from "./chop";
import { ORE_ITEMS, PICKAXES, type OreItemId } from "./caverns_mining";
import { CREEL_TIERS, RODS, creelTier, materialCount, takeMaterial, type FishingProfile } from "./fishing";
import { satchelCountFor, satchelTakeFor, type SatchelTier } from "./satchel";

/** The highest tool and storage tier each map's counters sell for coins alone: the campfire's stalls
 *  (Barnaby, Buster) T2, the woods' and the caverns' keepers (Bramble, Finley, Finnegan, Gus) T4. */
export const SHOP_TIER_CAP = { campfire: 2, woods: 4 } as const;
/** The first forged tier. */
export const FORGED_TIER = 5;
/** Where a tool or a storage tier a counter doesn't stock comes from (null: this counter sells it). */
export function soldElsewhere(tier: number, cap: number, woodsKeeper: string): string | null {
  // (T6, Tidewater: made at Dune's shack on Sunset Beach)
  if (tier > FORGED_TIER + 1) return "🌊 Made far out at sea";
  if (tier > FORGED_TIER) return "🐢 Made at Dune's shack on Sunset Beach";
  if (tier >= FORGED_TIER) return "🔥 Forged at the caverns' forge";
  return tier > cap ? woodsKeeper : null;
}

/** What a forged thing or a satchel tier takes besides coins. */
export type Makings = SatchelTier["needs"];

export type ForgedToolId = "rod" | "axe" | "pickaxe" | "livewell" | "carrier" | "tideRod" | "tideLivewell" | "deepRod";
export interface ForgedTool {
  name: string;
  emoji: string;
  blurb: string;
  coins: number;
  needs: Makings;
  /** Where it is made: the caverns' forge (T5), Dune's shack on Sunset Beach (T6: Tidewater), or the
   *  old shipwright's bench in the Hidden Cove (T7: Deep Tide). */
  place: "forge" | "dune" | "cove";
}
const LIVEWELL = CREEL_TIERS[FORGED_TIER - 1];
const CARRIER = WOOD_CARRIER_TIERS[FORGED_TIER - 1];
const TIDE_LIVEWELL = CREEL_TIERS[FORGED_TIER];
export const FORGED_TOOLS: Record<ForgedToolId, ForgedTool> = {
  rod: { name: RODS.moonlight.name, emoji: RODS.moonlight.emoji, blurb: RODS.moonlight.blurb, coins: RODS.moonlight.price, needs: { ore: { iron_ingot: 6 }, byproducts: { fishBone: 4 } }, place: "forge" },
  axe: { name: AXES.runic.name, emoji: AXES.runic.emoji, blurb: AXES.runic.blurb, coins: AXES.runic.price, needs: { ore: { iron_ingot: 6 }, byproducts: { leafAmber: 6 } }, place: "forge" },
  pickaxe: { name: PICKAXES.drill.name, emoji: PICKAXES.drill.emoji, blurb: PICKAXES.drill.blurb, coins: PICKAXES.drill.price, needs: { ore: { silver_ingot: 6, glimmer_shard: 4 } }, place: "forge" },
  livewell: { name: LIVEWELL.name, emoji: LIVEWELL.icon, blurb: `The largest livewell: ${LIVEWELL.capacity} fish.`, coins: LIVEWELL.price, needs: { ore: { iron_ingot: 3 }, byproducts: { scales: 12 } }, place: "forge" },
  carrier: { name: CARRIER.name, emoji: CARRIER.icon, blurb: `The largest wood carrier: ${CARRIER.capacity} logs.`, coins: CARRIER.price, needs: { ore: { iron_ingot: 3 }, byproducts: { amber: 6 } }, place: "forge" },
  // T6, Tidewater: made at Dune's shack, from all three crafts (ingots from the caverns, Golden Leaf
  // Amber from the woods' maples, Fine Fish Bones and scales from the water)
  tideRod: { name: RODS.tidewater.name, emoji: RODS.tidewater.emoji, blurb: RODS.tidewater.blurb, coins: RODS.tidewater.price, needs: { ore: { silver_ingot: 6 }, byproducts: { leafAmber: 6, fishBone: 6 } }, place: "dune" },
  tideLivewell: { name: TIDE_LIVEWELL.name, emoji: TIDE_LIVEWELL.icon, blurb: `A hold for a day at sea: ${TIDE_LIVEWELL.capacity} fish.`, coins: TIDE_LIVEWELL.price, needs: { ore: { iron_ingot: 6 }, byproducts: { scales: 20, amber: 6 } }, place: "dune" },
  // T7, Deep Tide: made at the Hidden Cove's bench, from pearls and the crafts' rarest drops
  deepRod: { name: RODS.deeptide.name, emoji: RODS.deeptide.emoji, blurb: RODS.deeptide.blurb, coins: RODS.deeptide.price, needs: { ore: { glimmer_shard: 6 }, byproducts: { pearl: 12, prismScale: 3, heartwood: 2 } }, place: "cove" },
};
export const FORGED_TOOL_IDS = Object.keys(FORGED_TOOLS) as ForgedToolId[];
export function isForgedToolId(v: unknown): v is ForgedToolId {
  return typeof v === "string" && v in FORGED_TOOLS;
}

/** Whether a profile has a forged thing already. */
export function forgedOwned(p: FishingProfile, id: ForgedToolId): boolean {
  if (id === "rod") return p.rods.includes("moonlight");
  if (id === "axe") return p.axes.includes("runic");
  if (id === "pickaxe") return p.pickaxes.includes("drill");
  if (id === "livewell") return p.creelTier >= FORGED_TIER;
  if (id === "tideRod") return p.rods.includes("tidewater");
  if (id === "deepRod") return p.rods.includes("deeptide");
  if (id === "tideLivewell") return p.creelTier >= FORGED_TIER + 1;
  return p.carrierTier >= FORGED_TIER;
}
/** What must come first, in words (the storage tiers go in turn), or null. */
export function forgedBlocked(p: FishingProfile, id: ForgedToolId): string | null {
  if (id === "livewell" && p.creelTier < FORGED_TIER - 1) return `the ${CREEL_TIERS[FORGED_TIER - 2].name} first (Finley's or Finnegan's)`;
  if (id === "tideLivewell" && p.creelTier < FORGED_TIER) return `the ${CREEL_TIERS[FORGED_TIER - 1].name} first (forged in the caverns)`;
  if (id === "carrier" && p.carrierTier < FORGED_TIER - 1) return `the ${WOOD_CARRIER_TIERS[FORGED_TIER - 2].name} first (Bramble's)`;
  return null;
}
/** A forged thing given to a profile (and put in hand, or in use). */
export function grantForged(p: FishingProfile, id: ForgedToolId) {
  if (id === "rod") {
    if (!p.rods.includes("moonlight")) p.rods.push("moonlight");
    p.rod = "moonlight";
  } else if (id === "axe") {
    if (!p.axes.includes("runic")) p.axes.push("runic");
    p.axe = "runic";
  } else if (id === "pickaxe") {
    if (!p.pickaxes.includes("drill")) p.pickaxes.push("drill");
    p.pickaxeId = "drill";
  } else if (id === "livewell") {
    p.creelTier = FORGED_TIER;
    p.slots = creelTier(p.creelTier).capacity;
  } else if (id === "tideRod") {
    if (!p.rods.includes("tidewater")) p.rods.push("tidewater");
    p.rod = "tidewater";
  } else if (id === "deepRod") {
    if (!p.rods.includes("deeptide")) p.rods.push("deeptide");
    p.rod = "deeptide";
  } else if (id === "tideLivewell") {
    p.creelTier = FORGED_TIER + 1;
    p.slots = creelTier(p.creelTier).capacity;
  } else {
    p.carrierTier = FORGED_TIER;
  }
}

/** Each of some makings: its name, how many it takes and how many the profile holds (a Masterwork
 *  ingot standing in for a plain one). */
export function makingsList(p: FishingProfile, needs: Makings): { name: string; need: number; have: number }[] {
  const out: { name: string; need: number; have: number }[] = [];
  for (const [id, n] of Object.entries(needs.ore ?? {}) as [OreItemId, number][]) out.push({ name: ORE_ITEMS[id].name, need: n, have: satchelCountFor(p, id) });
  if (needs.sawdust) out.push({ name: "Sawdust", need: needs.sawdust, have: p.sawdust });
  if (needs.resin) out.push({ name: "Pine Resin", need: needs.resin, have: p.resin });
  for (const [k, n] of Object.entries(needs.byproducts ?? {}) as [ByproductId, number][]) out.push({ name: BYPRODUCTS[k].name, need: n, have: materialCount(p, k) });
  for (const [k, n] of Object.entries(needs.wood ?? {}) as [WoodKind, number][]) out.push({ name: WOOD[k].name, need: n, have: p.wood[k] ?? 0 });
  return out;
}
/** What some makings still lack, in words ([]: nothing). */
export function makingsMissing(p: FishingProfile, needs: Makings): string[] {
  return makingsList(p, needs)
    .filter((m) => m.have < m.need)
    .map((m) => `${m.need - m.have} ${m.name}`);
}
/** The makings taken: out of the satchel, the materials' store and the carrier. */
export function spendMakings(p: FishingProfile, needs: Makings) {
  for (const [id, n] of Object.entries(needs.ore ?? {}) as [OreItemId, number][]) satchelTakeFor(p, id, n);
  takeMaterial(p, "sawdust", needs.sawdust ?? 0);
  takeMaterial(p, "resin", needs.resin ?? 0);
  for (const [k, n] of Object.entries(needs.byproducts ?? {}) as [ByproductId, number][]) takeMaterial(p, k, n);
  for (const [k, n] of Object.entries(needs.wood ?? {}) as [WoodKind, number][]) takeLogs(p, k, n);
}
