// Buster's workbench: split wood carved and joined into artisan pieces, worth far more than the
// wood that went into them. Each piece takes a slot in the wood carrier like a log does. Every
// carve is one of two modes, with its recipe's own odds (they scale with its tier):
//
//   Safe Carve        low risk, a modest chance of a Masterwork
//   Masterwork Push   a much better chance of a Masterwork ✨ (+70% value), and a real chance the
//                     piece breaks
//
// A broken carving isn't a total loss: half its wood comes back (rounded up, per kind), and a pile
// of Sawdust to throw on the bonfire (+15% fuel). The server rolls every carve (HangoutRoom's WORKBENCH) and
// keeps the pieces in the player's camp profile (FishingProfile.crafts); Buster buys them.
//
// The Adhesive Slot: one Pine Resin brushed on before a carve, either way it is spent:
//
//   Resin Bond      glued fast: the piece cannot break (its break chance goes to a plain success)
//   Resin Gilding   +25 points of Masterwork chance (taken from a plain success first)

import type { WoodKind } from "./chop";
import { CARVED_PRICE, RESIN_BUY_PRICE } from "./economy";

export type CraftMode = "safe" | "push";
export interface CraftOutcomeOdds {
  normal: number;
  masterwork: number;
  breakChance: number;
}
export interface CraftOdds {
  safe: CraftOutcomeOdds;
  push: CraftOutcomeOdds;
}

/** A recipe, as the registry below writes it (`gold` is Golden Charcoal). */
export interface WoodRecipe {
  id: string;
  name: string;
  tier: "common" | "uncommon" | "rare" | "epic" | "legendary";
  ingredients: { pine?: number; oak?: number; gold?: number };
  baseSellPrice: number;
  /** What Buster pays for a Masterwork ✨ (+70%). */
  masterworkPrice: number;
  odds: CraftOdds;
  description: string;
  icon: string;
}

export const WOOD_RECIPES: WoodRecipe[] = [
  {
    id: "craft_totem",
    name: "Carved Chibi Totem",
    tier: "common",
    ingredients: { pine: 2 },
    baseSellPrice: CARVED_PRICE,
    masterworkPrice: 14,
    odds: { safe: { normal: 0.95, masterwork: 0.05, breakChance: 0.0 }, push: { normal: 0.65, masterwork: 0.25, breakChance: 0.1 } },
    description: "Hand-carved pocket bear charm",
    icon: "🧸",
  },
  {
    id: "craft_plank",
    name: "Polished Oak Plank",
    tier: "uncommon",
    ingredients: { oak: 1 },
    baseSellPrice: CARVED_PRICE,
    masterworkPrice: 14,
    odds: { safe: { normal: 0.92, masterwork: 0.06, breakChance: 0.02 }, push: { normal: 0.55, masterwork: 0.3, breakChance: 0.15 } },
    description: "Sanded smooth furniture timber",
    // (not 🪵: that is Soft Pine's own mark in the carrier)
    icon: "🟫",
  },
  {
    id: "craft_birdhouse",
    name: "Rustic Birdhouse",
    tier: "rare",
    ingredients: { pine: 2, oak: 1 },
    baseSellPrice: 18,
    masterworkPrice: 31,
    odds: { safe: { normal: 0.88, masterwork: 0.07, breakChance: 0.05 }, push: { normal: 0.45, masterwork: 0.35, breakChance: 0.2 } },
    description: "Cozy nesting box for forest birds",
    icon: "🏡",
  },
  {
    id: "craft_briquette",
    name: "Aromatic Pine Briquette",
    tier: "epic",
    ingredients: { pine: 1, gold: 1 },
    baseSellPrice: 28,
    masterworkPrice: 48,
    odds: { safe: { normal: 0.84, masterwork: 0.08, breakChance: 0.08 }, push: { normal: 0.35, masterwork: 0.4, breakChance: 0.25 } },
    description: "Slow-burning scented camp briquette",
    // (not ✨: that marks Golden Charcoal, and a Masterwork)
    icon: "🧱",
  },
  {
    id: "craft_mask",
    name: "Forest Guardian Mask",
    tier: "legendary",
    ingredients: { oak: 2, gold: 1 },
    baseSellPrice: 45,
    masterworkPrice: 77,
    odds: { safe: { normal: 0.78, masterwork: 0.1, breakChance: 0.12 }, push: { normal: 0.25, masterwork: 0.45, breakChance: 0.3 } },
    description: "Intricate tribal spirit mask",
    icon: "🎭",
  },
];

/** A piece's id in the camp profile (the recipe's id without "craft_": kept short, and stable). */
export type CraftId = "totem" | "plank" | "birdhouse" | "briquette" | "mask";

export interface Craft {
  name: string;
  emoji: string;
  tier: WoodRecipe["tier"];
  description: string;
  /** The wood it takes, by kind. */
  needs: Partial<Record<WoodKind, number>>;
  /** What Buster pays for one, and for a Masterwork ✨. */
  price: number;
  master: number;
  odds: CraftOdds;
}

export const CRAFTS = Object.fromEntries(
  WOOD_RECIPES.map((r): [CraftId, Craft] => {
    const needs: Partial<Record<WoodKind, number>> = {};
    if (r.ingredients.pine) needs.pine = r.ingredients.pine;
    if (r.ingredients.oak) needs.oak = r.ingredients.oak;
    if (r.ingredients.gold) needs.charcoal = r.ingredients.gold;
    return [r.id.replace("craft_", "") as CraftId, { name: r.name, emoji: r.icon, tier: r.tier, description: r.description, needs, price: r.baseSellPrice, master: r.masterworkPrice, odds: r.odds }];
  })
) as Record<CraftId, Craft>;
export const CRAFT_IDS = Object.keys(CRAFTS) as CraftId[];
export function isCraftId(v: unknown): v is CraftId {
  return typeof v === "string" && v in CRAFTS;
}
export function isCraftMode(v: unknown): v is CraftMode {
  return v === "safe" || v === "push";
}

/** A finished piece in the carrier: its kind, and whether it came out a Masterwork. */
export interface CraftItem {
  c: CraftId;
  m: boolean;
}

export function craftPrice(item: CraftItem): number {
  return item.m ? CRAFTS[item.c].master : CRAFTS[item.c].price;
}
/** What Buster pays for a piece at the hour's market multiplier (shared/market.ts). */
export function craftSalePrice(item: CraftItem, market = 1): number {
  return Math.max(1, Math.round(craftPrice(item) * market));
}

/** Whether the wood at hand covers a recipe. */
export function canCraft(wood: Record<WoodKind, number>, id: CraftId): boolean {
  return (Object.entries(CRAFTS[id].needs) as [WoodKind, number][]).every(([k, n]) => (wood[k] ?? 0) >= n);
}

/** The Adhesive Slot's two uses of a Pine Resin ("" for none). */
export type Adhesive = "" | "bond" | "gild";
export const ADHESIVES: Record<Exclude<Adhesive, "">, { name: string; emoji: string; blurb: string }> = {
  bond: { name: "Resin Bond", emoji: "🛡️", blurb: "Glued fast: it can't break" },
  gild: { name: "Resin Gilding", emoji: "✨", blurb: "+25% Masterwork chance" },
};
/** Resin Gilding's lift to the Masterwork chance. */
export const GILD_MASTERWORK_BONUS = 0.25;
export function isAdhesive(v: unknown): v is Adhesive {
  return v === "" || v === "bond" || v === "gild";
}

/** A carve's odds in a mode, with a resin in the Adhesive Slot: a Resin Bond moves all of the break
 *  chance to a normal success; a Resin Gilding adds 25 points of Masterwork chance (from a normal
 *  success first). */
export function craftOdds(id: CraftId, mode: CraftMode, adhesive: Adhesive = ""): CraftOutcomeOdds {
  const odds = { ...CRAFTS[id].odds[mode] };
  if (adhesive === "bond") return { normal: odds.normal + odds.breakChance, masterwork: odds.masterwork, breakChance: 0 };
  if (adhesive === "gild") {
    const fromNormal = Math.min(odds.normal, GILD_MASTERWORK_BONUS);
    const fromBreak = Math.min(odds.breakChance, GILD_MASTERWORK_BONUS - fromNormal);
    return { normal: odds.normal - fromNormal, masterwork: odds.masterwork + fromNormal + fromBreak, breakChance: odds.breakChance - fromBreak };
  }
  return odds;
}

export type CraftOutcome = "normal" | "masterwork" | "broken";
/** How a carve comes out, from one roll in [0, 1). */
export function rollCraft(odds: CraftOutcomeOdds, r: number): CraftOutcome {
  if (r < odds.breakChance) return "broken";
  if (r < odds.breakChance + odds.masterwork) return "masterwork";
  return "normal";
}

/** How much of a broken carving's wood comes back. */
export const SALVAGE_RATE = 0.5;
/** What a broken carving gives back: half of each kind of its wood, rounded up. */
export function craftSalvage(id: CraftId): Partial<Record<WoodKind, number>> {
  const back: Partial<Record<WoodKind, number>> = {};
  for (const [k, n] of Object.entries(CRAFTS[id].needs) as [WoodKind, number][]) back[k] = Math.ceil(n * SALVAGE_RATE);
  return back;
}

/** Sawdust, from a broken carving: a handful on the bonfire is worth this much fuel. */
export const SAWDUST_FUEL = 15;
/** Pine Resin, from a critical chop: Buster buys a spare one at this (shared/economy.ts). */
export const RESIN_PRICE = RESIN_BUY_PRICE;
