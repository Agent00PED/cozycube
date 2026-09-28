// The workbenches (Buster's by the tipi, Bramble's advanced one in the woods): logs, Firewood, resin
// and the felling's by-products carved and joined into artisan pieces worth more than what went into
// them, or into a few things for good (a roasting stick, a pack frame, a tackle box). Recipes sort by
// their main material, T1 Soft Pine to T5 Elderwood, and the resins and by-products; the bench's
// filter narrows the list to one. Every carve of a piece to sell is one of two modes, with its
// recipe's own odds (they scale with its tier):
//
//   Safe Carve        low risk, a modest chance of a Masterwork
//   Masterwork Push   a much better chance of a Masterwork ✨ (+70% value), and a real chance the
//                     piece breaks
//
// A broken carving isn't a total loss: half its logs come back (rounded up, per kind), and a pile of
// Sawdust to throw on the bonfire. The pieces stack in their own crate (up to 99 of a kind), not in
// the wood carrier's slots. The things made for good always come out right, once each. The server
// rolls every carve (HangoutRoom's WORKBENCH) and keeps it all in the camp profile.
//
// The Adhesive Slot: one Pine Resin brushed on before a carve, either way it is spent:
//
//   Resin Bond      glued fast: the piece cannot break (its break chance goes to a plain success)
//   Resin Gilding   +25 points of Masterwork chance (taken from a plain success first)

import type { ByproductId, WoodKind } from "./chop";
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
export type CraftTier = "common" | "uncommon" | "rare" | "epic" | "legendary";
/** Each tier's odds: the finer the wood, the likelier a Masterwork, and a break. */
const ODDS: Record<CraftTier, CraftOdds> = {
  common: { safe: { normal: 0.95, masterwork: 0.05, breakChance: 0.0 }, push: { normal: 0.65, masterwork: 0.25, breakChance: 0.1 } },
  uncommon: { safe: { normal: 0.92, masterwork: 0.06, breakChance: 0.02 }, push: { normal: 0.55, masterwork: 0.3, breakChance: 0.15 } },
  rare: { safe: { normal: 0.88, masterwork: 0.07, breakChance: 0.05 }, push: { normal: 0.45, masterwork: 0.35, breakChance: 0.2 } },
  epic: { safe: { normal: 0.84, masterwork: 0.08, breakChance: 0.08 }, push: { normal: 0.35, masterwork: 0.4, breakChance: 0.25 } },
  legendary: { safe: { normal: 0.78, masterwork: 0.1, breakChance: 0.12 }, push: { normal: 0.25, masterwork: 0.45, breakChance: 0.3 } },
};

/** A recipe's main material: the bench's filter. */
export type CraftMaterial = "pine" | "birch" | "cedar" | "maple" | "elderwood" | "resins";
export const CRAFT_FILTERS: { id: CraftMaterial | "all"; emoji: string; label: string }[] = [
  { id: "all", emoji: "✨", label: "All" },
  { id: "pine", emoji: "🌲", label: "Soft Pine" },
  { id: "birch", emoji: "🪵", label: "Birch" },
  { id: "cedar", emoji: "🌲", label: "Cedar" },
  { id: "maple", emoji: "🍁", label: "Maple" },
  { id: "elderwood", emoji: "🌌", label: "Elderwood" },
  { id: "resins", emoji: "🍯", label: "Resins & Byproducts" },
];

/** What a recipe takes: logs by kind, Firewood bundles, Pine Resin, and the felling's by-products. */
export interface CraftNeeds {
  wood?: Partial<Record<WoodKind, number>>;
  firewood?: number;
  resin?: number;
  byproducts?: Partial<Record<ByproductId, number>>;
}

/** What a finished recipe is: a piece to sell (into the crate), or a thing made once, for good. */
export type CraftUse = "sell" | "roastingStick" | "packFrame" | "tackleBox";
/** The things made for good, and what each gives. */
export const PACK_FRAME_SLOTS = 5;
export const TACKLE_BOX_SLOTS = 3;
/** A Resin Amber Torch carried (one is enough): this much quicker on foot at the camp by night. */
export const TORCH_NIGHT_PACE = 1.1;
/** Forest Whisper Incense burned at the bonfire: rare luck for everyone in the room, this long. */
export const INCENSE_LUCK = 0.2;
export const INCENSE_MS = 10 * 60_000;

export interface Craft {
  name: string;
  emoji: string;
  tier: CraftTier;
  material: CraftMaterial;
  description: string;
  needs: CraftNeeds;
  /** What Buster (or Bramble) pays for one, and for a Masterwork ✨ (0: a thing made for good). */
  price: number;
  master: number;
  odds: CraftOdds;
  use: CraftUse;
  /** A piece with a use of its own while you carry it (a torch) or burn it (incense). */
  special?: "torch" | "incense";
  /** Off the bench now (the old camp woods' pieces): still in some crates, still bought. */
  retired?: boolean;
}

const piece = (name: string, emoji: string, tier: CraftTier, material: CraftMaterial, needs: CraftNeeds, price: number, description: string, extra: Partial<Craft> = {}): Craft => ({
  name,
  emoji,
  tier,
  material,
  needs,
  price,
  master: Math.round(price * 1.7),
  odds: ODDS[tier],
  use: "sell",
  description,
  ...extra,
});
const forGood = (name: string, emoji: string, tier: CraftTier, material: CraftMaterial, needs: CraftNeeds, use: Exclude<CraftUse, "sell">, description: string): Craft => ({ name, emoji, tier, material, needs, price: 0, master: 0, odds: ODDS[tier], use, description });

/** A piece's id in the camp profile (kept short, and stable). */
export type CraftId =
  | "roasting_stick"
  | "camp_stool"
  | "pine_birdhouse"
  | "songbird"
  | "bark_lantern"
  | "pack_frame"
  | "amber_torch"
  | "salmon_totem"
  | "tackle_box"
  | "maple_bear"
  | "wind_chimes"
  | "smoker_box"
  | "rune_tablet"
  | "grand_clock"
  | "whisper_incense"
  // retired
  | "totem"
  | "plank"
  | "birdhouse"
  | "briquette"
  | "mask";

export const CRAFTS: Record<CraftId, Craft> = {
  // T1 Soft Pine
  roasting_stick: forGood("Marshmallow Roasting Stick", "🍡", "common", "pine", { wood: { pine: 3 }, firewood: 1 }, "roastingStick", "Yours for good: sit on a log bench by the fire and there's a marshmallow on it, toasting"),
  camp_stool: piece("Rustic Camp Stool", "🪑", "common", "pine", { wood: { pine: 4 }, firewood: 2 }, 35, "A sturdy three-legged stool for the fireside"),
  pine_birdhouse: piece("Carved Pine Birdhouse", "🐤", "common", "pine", { wood: { pine: 5 }, resin: 2 }, 55, "Resin-sealed against the rain, for the camp's songbirds"),
  // T2 Silver Birch
  songbird: piece("Whittled Songbird", "🐦", "uncommon", "birch", { wood: { birch: 4 }, byproducts: { bark: 3 } }, 85, "A little birch warbler, bark-feathered"),
  bark_lantern: piece("Birch Bark Lantern", "🏮", "uncommon", "birch", { wood: { birch: 3 }, byproducts: { bark: 4 }, firewood: 1 }, 75, "Paper-white bark round a warm glow"),
  pack_frame: forGood("Lumberjack Pack Frame", "🎒", "uncommon", "birch", { wood: { birch: 6 }, byproducts: { bark: 5 } }, "packFrame", `Yours for good: +${PACK_FRAME_SLOTS} slots in the wood carrier`),
  // T3 Highland Cedar
  amber_torch: piece("Resin Amber Torch", "🔥", "rare", "cedar", { firewood: 2, byproducts: { amber: 3 }, wood: { cedar: 2 } }, 125, `Carried, it lights your way: ${Math.round((TORCH_NIGHT_PACE - 1) * 100)}% quicker on foot at the camp by night`, { special: "torch" }),
  salmon_totem: piece("Carved Salmon Totem", "🗿", "rare", "cedar", { wood: { cedar: 4 }, byproducts: { amber: 4 } }, 225, "A leaping salmon, amber-eyed"),
  tackle_box: forGood("Reinforced Tackle Box", "🧰", "rare", "cedar", { wood: { cedar: 5 }, byproducts: { amber: 4 } }, "tackleBox", `Yours for good: +${TACKLE_BOX_SLOTS} livewell slots`),
  // T4 Autumn Maple
  maple_bear: piece("Carved Maple Bear", "🐻", "epic", "maple", { wood: { maple: 3 }, byproducts: { leafAmber: 3 } }, 480, "A round maple bear with leaf-amber eyes"),
  wind_chimes: piece("Gilded Wind Chimes", "🎐", "epic", "maple", { wood: { maple: 4 }, byproducts: { leafAmber: 4 } }, 650, "Maple rods and golden amber that sing in the breeze"),
  smoker_box: piece("Maple Smoker Box", "📦", "epic", "maple", { wood: { maple: 5 }, firewood: 2 }, 720, "Sweet maple smoke for the finest fish"),
  // T5 Whispering Elderwood
  rune_tablet: piece("Ancient Rune Tablet", "🪧", "legendary", "elderwood", { wood: { elderwood: 2 }, byproducts: { shavings: 4 } }, 850, "Old words carved in humming wood"),
  grand_clock: piece("Elderwood Grand Clock", "🕰️", "legendary", "elderwood", { wood: { elderwood: 4 }, byproducts: { shavings: 6 } }, 1650, "The masterpiece: it keeps the forest's own time"),
  // resins and by-products
  whisper_incense: piece("Forest Whisper Incense", "🪔", "uncommon", "resins", { resin: 5, byproducts: { shavings: 3 } }, 210, `Burn it at the bonfire: ${INCENSE_MS / 60_000} minutes of rare-fish luck for everyone in the room`, { special: "incense" }),
  // retired from the bench (the old camp woods): still bought
  totem: piece("Carved Chibi Totem", "🧸", "common", "pine", { wood: { pine: 2 } }, CARVED_PRICE, "Hand-carved pocket bear charm", { master: 14, retired: true }),
  plank: piece("Polished Oak Plank", "🟫", "uncommon", "pine", { wood: { oak: 1 } }, CARVED_PRICE, "Sanded smooth furniture timber", { master: 14, retired: true }),
  birdhouse: piece("Rustic Birdhouse", "🏡", "rare", "pine", { wood: { pine: 2, oak: 1 } }, 18, "Cozy nesting box for forest birds", { master: 31, retired: true }),
  briquette: piece("Aromatic Pine Briquette", "🧱", "epic", "pine", { wood: { pine: 1, charcoal: 1 } }, 28, "Slow-burning scented camp briquette", { master: 48, retired: true }),
  mask: piece("Forest Guardian Mask", "🎭", "legendary", "pine", { wood: { oak: 2, charcoal: 1 } }, 45, "Intricate tribal spirit mask", { master: 77, retired: true }),
};
export const CRAFT_IDS = Object.keys(CRAFTS) as CraftId[];
/** What the bench carves now (the retired pieces are only bought). */
export const BENCH_IDS = CRAFT_IDS.filter((id) => !CRAFTS[id].retired);
export function isCraftId(v: unknown): v is CraftId {
  return typeof v === "string" && v in CRAFTS;
}
export function isCraftMode(v: unknown): v is CraftMode {
  return v === "safe" || v === "push";
}

/** A finished piece in the crate: its kind, and whether it came out a Masterwork. */
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
/** The crate's stacks: each kind (and Masterworks apart), with how many. */
export function craftStacks(items: readonly CraftItem[]): { item: CraftItem; n: number }[] {
  const out: { item: CraftItem; n: number }[] = [];
  for (const it of items) {
    const s = out.find((o) => o.item.c === it.c && o.item.m === it.m);
    if (s) s.n += 1;
    else out.push({ item: { c: it.c, m: it.m }, n: 1 });
  }
  return out;
}

/** What a craft's maker holds (the camp profile's parts a recipe draws on). */
export interface CraftStock {
  wood: Record<WoodKind, number>;
  firewood: number;
  resin: number;
  byproducts: Partial<Record<ByproductId, number>>;
}
/** Whether the stock at hand covers a recipe. */
export function canCraft(stock: CraftStock, id: CraftId): boolean {
  const n = CRAFTS[id].needs;
  return (
    (Object.entries(n.wood ?? {}) as [WoodKind, number][]).every(([k, c]) => (stock.wood[k] ?? 0) >= c) &&
    stock.firewood >= (n.firewood ?? 0) &&
    stock.resin >= (n.resin ?? 0) &&
    (Object.entries(n.byproducts ?? {}) as [ByproductId, number][]).every(([k, c]) => (stock.byproducts[k] ?? 0) >= c)
  );
}
/** A recipe's needs in words ("4 Soft Pine + 2 Firewood"): `names` gives each log's and by-product's. */
export function needsList(id: CraftId): { key: string; n: number }[] {
  const n = CRAFTS[id].needs;
  return [
    ...(Object.entries(n.wood ?? {}) as [WoodKind, number][]).map(([k, c]) => ({ key: `wood:${k}`, n: c })),
    ...(n.firewood ? [{ key: "firewood", n: n.firewood }] : []),
    ...(n.resin ? [{ key: "resin", n: n.resin }] : []),
    ...(Object.entries(n.byproducts ?? {}) as [ByproductId, number][]).map(([k, c]) => ({ key: `by:${k}`, n: c })),
  ];
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

/** How much of a broken carving's logs comes back. */
export const SALVAGE_RATE = 0.5;
/** What a broken carving gives back: half of each kind of its logs, rounded up. */
export function craftSalvage(id: CraftId): Partial<Record<WoodKind, number>> {
  const back: Partial<Record<WoodKind, number>> = {};
  for (const [k, n] of Object.entries(CRAFTS[id].needs.wood ?? {}) as [WoodKind, number][]) back[k] = Math.ceil(n * SALVAGE_RATE);
  return back;
}

/** Sawdust, from a broken carving: a handful on the bonfire is worth this much fuel. */
export const SAWDUST_FUEL = 15;
/** Pine Resin, from a critical chop: Buster buys a spare one at this (shared/economy.ts). */
export const RESIN_PRICE = RESIN_BUY_PRICE;
