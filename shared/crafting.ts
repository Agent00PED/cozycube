// Buster's workbench: split wood carved and joined into artisan pieces, worth far more than the
// wood that went into them. Each piece takes a slot in the wood carrier like a log does. Every
// carve is one of two modes, with its recipe's own odds (they scale with its tier):
//
//   Safe Carve        low risk, a modest chance of a Masterwork
//   Masterwork Push   a much better chance of a Masterwork ✨ (+70% value), and a real chance the
//                     piece breaks
//
// A broken carving isn't a total loss: half its wood comes back (rounded up, per kind; 75% with the
// Artisan Leather Apron, which also takes 10 points off every break chance), and a pile of Sawdust
// to throw on the bonfire (+15% fuel). The server rolls every carve (HangoutRoom's WORKBENCH) and
// keeps the pieces in the player's camp profile (FishingProfile.crafts); Buster buys them.

import type { WoodKind } from "./chop";
import { APRON_BREAK_CUT, salvageRate, type GearId } from "./gear";

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
    baseSellPrice: 18,
    masterworkPrice: 31,
    odds: { safe: { normal: 0.95, masterwork: 0.05, breakChance: 0.0 }, push: { normal: 0.65, masterwork: 0.25, breakChance: 0.1 } },
    description: "Hand-carved pocket bear charm",
    icon: "🧸",
  },
  {
    id: "craft_plank",
    name: "Polished Oak Plank",
    tier: "uncommon",
    ingredients: { oak: 2 },
    baseSellPrice: 40,
    masterworkPrice: 68,
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
    baseSellPrice: 65,
    masterworkPrice: 110,
    odds: { safe: { normal: 0.88, masterwork: 0.07, breakChance: 0.05 }, push: { normal: 0.45, masterwork: 0.35, breakChance: 0.2 } },
    description: "Cozy nesting box for forest birds",
    icon: "🏡",
  },
  {
    id: "craft_briquette",
    name: "Aromatic Pine Briquette",
    tier: "epic",
    ingredients: { pine: 1, gold: 1 },
    baseSellPrice: 95,
    masterworkPrice: 162,
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
    baseSellPrice: 160,
    masterworkPrice: 272,
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

/** Whether the wood at hand covers a recipe. */
export function canCraft(wood: Record<WoodKind, number>, id: CraftId): boolean {
  return (Object.entries(CRAFTS[id].needs) as [WoodKind, number][]).every(([k, n]) => (wood[k] ?? 0) >= n);
}

/** A carve's odds in a mode, with the gear on: the Artisan Leather Apron moves 10 points of the
 *  break chance to a normal success. */
export function craftOdds(id: CraftId, mode: CraftMode, gear: readonly GearId[]): CraftOutcomeOdds {
  const o = CRAFTS[id].odds[mode];
  const cut = gear.includes("leather_apron") ? Math.min(o.breakChance, APRON_BREAK_CUT) : 0;
  return { normal: o.normal + cut, masterwork: o.masterwork, breakChance: o.breakChance - cut };
}

export type CraftOutcome = "normal" | "masterwork" | "broken";
/** How a carve comes out, from one roll in [0, 1). */
export function rollCraft(odds: CraftOutcomeOdds, r: number): CraftOutcome {
  if (r < odds.breakChance) return "broken";
  if (r < odds.breakChance + odds.masterwork) return "masterwork";
  return "normal";
}

/** What a broken carving gives back: half of each kind of its wood, rounded up (75% with the apron). */
export function craftSalvage(id: CraftId, gear: readonly GearId[]): Partial<Record<WoodKind, number>> {
  const rate = salvageRate(gear);
  const back: Partial<Record<WoodKind, number>> = {};
  for (const [k, n] of Object.entries(CRAFTS[id].needs) as [WoodKind, number][]) back[k] = Math.ceil(n * rate);
  return back;
}

/** Sawdust, from a broken carving: a handful on the bonfire is worth this much fuel. */
export const SAWDUST_FUEL = 15;
/** Pine Resin, from a critical chop: Buster buys it at this (less than a log: a keepsake, not a living). */
export const RESIN_PRICE = 3;
