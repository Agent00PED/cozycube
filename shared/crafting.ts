// Buster's workbench: split wood carved and joined into artisan pieces, worth far more than the
// wood that went into them. Each piece takes a slot in the wood carrier like a log does, and now
// and then one comes out a Masterwork ✨ (worth half again). The server rolls the masterwork and
// keeps the pieces in the player's camp profile (FishingProfile.crafts); Buster buys them.

import type { WoodKind } from "./chop";

export type CraftId = "totem" | "plank" | "birdhouse" | "briquette" | "mask";

export interface Craft {
  name: string;
  emoji: string;
  /** The wood it takes. */
  needs: Partial<Record<WoodKind, number>>;
  /** What Buster pays for one, and for a Masterwork ✨. */
  price: number;
  master: number;
}

export const CRAFTS: Record<CraftId, Craft> = {
  totem: { name: "Carved Chibi Totem", emoji: "🗿", needs: { pine: 2 }, price: 35, master: 52 },
  plank: { name: "Polished Oak Plank", emoji: "🟫", needs: { oak: 2 }, price: 75, master: 112 },
  birdhouse: { name: "Rustic Birdhouse", emoji: "🏠", needs: { pine: 2, oak: 1 }, price: 95, master: 142 },
  briquette: { name: "Aromatic Pine Briquette", emoji: "🧱", needs: { pine: 1, charcoal: 1 }, price: 160, master: 240 },
  mask: { name: "Forest Guardian Mask", emoji: "🎭", needs: { oak: 2, charcoal: 1 }, price: 230, master: 345 },
};
export const CRAFT_IDS = Object.keys(CRAFTS) as CraftId[];
export function isCraftId(v: unknown): v is CraftId {
  return typeof v === "string" && v in CRAFTS;
}

/** A finished piece in the carrier: its kind, and whether it came out a Masterwork. */
export interface CraftItem {
  c: CraftId;
  m: boolean;
}

/** How likely a piece is to come out a Masterwork ✨, by the axe in hand (a finer edge, finer work). */
export const MASTERWORK_CHANCE = { rusty: 0.12, steel: 0.18, golden: 0.25 } as const;

export function craftPrice(item: CraftItem): number {
  return item.m ? CRAFTS[item.c].master : CRAFTS[item.c].price;
}

/** Whether the wood at hand covers a recipe. */
export function canCraft(wood: Record<WoodKind, number>, id: CraftId): boolean {
  return (Object.entries(CRAFTS[id].needs) as [WoodKind, number][]).every(([k, n]) => (wood[k] ?? 0) >= n);
}

/** How many slots a recipe frees in the carrier (its wood goes, one piece comes in). */
export function craftSlotsFreed(id: CraftId): number {
  return (Object.values(CRAFTS[id].needs) as number[]).reduce((a, n) => a + n, 0) - 1;
}
