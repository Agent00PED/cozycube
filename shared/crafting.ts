// The workbenches (Buster's by the tipi, Bramble's advanced one in the woods): logs, Firewood, resin
// and the by-products (the felling's, the Colossal trees', the river's) carved and joined into
// seventeen recipes under four tabs:
//
//   🎣 Tackles      active equipment, made once and yours for good: at work whenever you fish or
//                   fell (the Whittled Otter Float, the Resin-Weighted Sinker, the Braided Silk Line,
//                   the Wedge & Mallet Kit, the Titan Felling Lever: TOOLS)
//   🧪 Consumables  carved as often as you like, into the craft stash, and used from the wood drawer
//                   for a buff a while (BUFFS: a S'more's quicker step, Amber Grip Wax's wider gold,
//                   Silverwood Sap Ointment's slower ring, Glow-Spore Chum's livelier river, the
//                   Aromatic Pine Pouch's quick commons). Three more are made in the drawers
//                   themselves, not at the bench (`drawer`): Feller's Pine Pitch in the Forester's,
//                   Phosphor Glow Bait in the Fish drawer, Miner's Stout in the Ore Satchel's
//   🧿 Relics       carved once, then worn in a gear slot to work (shared/gear.ts: the Carved
//                   Lumberjack Belt, the Deepriver Fisherman Ring, the Heartwood Compass)
//   🪑 Furniture    the trade goods, pure profit on a healthy margin over what goes into them, sold to
//                   Buster or Bramble at the hour's market (shared/market.ts: 50%-130%)
//
// Every carve of a piece of furniture is one of two modes, with its recipe's own odds (they scale
// with its tier):
//
//   Safe Carve        low risk, a modest chance of a Masterwork
//   Masterwork Push   a much better chance of a Masterwork ✨ (+70% value), and a real chance the
//                     piece breaks
//
// A broken carving isn't a total loss: half its logs come back (rounded up, per kind), and a pile of
// Sawdust to throw on the bonfire. The tackles, relics and consumables always come out right. The
// server rolls every carve (HangoutRoom's WORKBENCH) and keeps it all in the camp profile.
//
// The recipes of the bench before (its pieces to sell, the old relics, the things made for good) are
// LEGACY now: off the bench, still defined, so what a returning player holds keeps its worth. A legacy
// piece in the stash, or a legacy relic, is traded in at Buster's or Bramble's for a full refund (a
// piece's whole listed price in coins, never the market's; a relic's materials back); the old things
// made for good (the roasting stick, the pack frame, the tackle box) were refunded their materials by
// the migration (shared/migrate.ts). The marshmallow on a log is everyone's now.
//
// The Adhesive Slot: one Pine Resin brushed on before a carve, either way it is spent:
//
//   Resin Bond      glued fast: the piece cannot break (its break chance goes to a plain success)
//   Resin Gilding   +25 points of Masterwork chance (taken from a plain success first)

import type { ByproductId, WoodKind } from "./chop";
import type { OreItemId } from "./caverns_mining";
import { CARVED_PRICE, RESIN_BUY_PRICE } from "./economy";
import type { BuffKey } from "./fishing";

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

/** A recipe's main material (for its card's colour), and its tab on the bench. */
export type CraftMaterial = "pine" | "birch" | "cedar" | "maple" | "elderwood" | "resins" | "river";
export type CraftCategory = "tackles" | "consumables" | "relics" | "furniture" | "legacy";
export type CraftFilter = Exclude<CraftCategory, "legacy">;
/** The bench's four tabs. */
export const CRAFT_FILTERS: { id: CraftFilter; emoji: string; label: string }[] = [
  { id: "tackles", emoji: "🎣", label: "Tackles" },
  { id: "consumables", emoji: "🧪", label: "Consumables" },
  { id: "furniture", emoji: "🪑", label: "Furniture" },
];

/** What a recipe takes: logs by kind, Firewood bundles, Pine Resin, Sawdust, the by-products, and
 *  (the Ore Satchel's own) the satchel's ores. */
export interface CraftNeeds {
  wood?: Partial<Record<WoodKind, number>>;
  firewood?: number;
  resin?: number;
  sawdust?: number;
  byproducts?: Partial<Record<ByproductId, number>>;
  ore?: Partial<Record<OreItemId, number>>;
}

/** What a finished recipe is: a piece to sell (into the stash), a tackle (made once, yours for
 *  good), a relic (made once, worn in a gear slot), a consumable (into the stash, used for a buff);
 *  and, legacy, the old things made for good. */
export type CraftUse = "sell" | "tool" | "relic" | "consumable" | "roastingStick" | "packFrame" | "tackleBox";
/** Whether a recipe is carved once (a tackle, a relic, an old thing made for good). */
export const isOnce = (use: CraftUse) => use !== "sell" && use !== "consumable";

/** The tackles: what each does while you fish or fell. */
export type ToolId = "otter_float" | "resin_sinker" | "silk_line" | "wedge_mallet" | "titan_lever";
/** The Whittled Otter Float: bites (and an AFK line's waits) this much sooner. */
export const FLOAT_HASTE = 1 / 0.85;
/** The Resin-Weighted Sinker: the reel's green this much bigger. */
export const SINKER_ZONE = 0.15;
/** The Braided Silk Line: the line's tension builds this much slower. */
export const SILK_TENSION = 0.15;

/** The consumables' buffs: what each does, and for how long. */
export const BUFFS: Record<BuffKey, { name: string; emoji: string; ms: number; blurb: string }> = {
  smore: { name: "S'more Sugar Rush", emoji: "🍫", ms: 15 * 60_000, blurb: "+15% walking pace" },
  wax: { name: "Amber Grip", emoji: "🕯️", ms: 10 * 60_000, blurb: "+20% gold sweet spot (felling and splitting)" },
  scent: { name: "Aromatic Pine", emoji: "🌿", ms: 15 * 60_000, blurb: "Common fish bite within 5 s of a cast" },
  sap: { name: "Silverwood Sap", emoji: "🧴", ms: 10 * 60_000, blurb: "The felling ring and the splitting gauge 15% slower" },
  chum: { name: "Glow-Spore Chum", emoji: "🫧", ms: 10 * 60_000, blurb: "Bites 20% sooner, rare fish 25% likelier" },
  pitch: { name: "Feller's Pine Pitch", emoji: "🍯", ms: 10 * 60_000, blurb: "Every landed round 25% likelier to drop a log" },
  glowbait: { name: "Phosphor Glow Bait", emoji: "🪱", ms: 10 * 60_000, blurb: "Rare fish and better 30% likelier by night and underground" },
  stout: { name: "Miner's Stout", emoji: "🍺", ms: 10 * 60_000, blurb: "Your pickaxe strikes 25% harder" },
};
/** Feller's Pine Pitch's lift to a round's log chance, and Phosphor Glow Bait's rare luck in the dark
 *  (Miner's Stout's harder strike: shared/caverns_mining.ts STOUT_DAMAGE). */
export const PITCH_LOG = 0.25;
export const GLOWBAIT_LUCK = 0.3;
/** A S'more's step, Grip Wax's gold, a Pine Pouch's quickest common bite (s), the Sap Ointment's
 *  slower ring and gauge, the Chum's quicker bites and rarer fish. */
export const SMORE_PACE = 1.15;
export const WAX_GOLD = 1.2;
export const SCENT_BITE_S = 5;
export const SAP_SLOW = 0.15;
export const CHUM_HASTE = 1 / 0.8;
export const CHUM_LUCK = 0.25;
/** The old things made for good (legacy: refunded by the migration). */
export const PACK_FRAME_SLOTS = 5;
export const TACKLE_BOX_SLOTS = 3;
/** A Resin Amber Torch carried (legacy, still carried by some): this much quicker on foot at the camp
 *  by night. */
export const TORCH_NIGHT_PACE = 1.1;
/** Forest Whisper Incense (legacy, still burned by those who hold some) at the bonfire: rare luck for
 *  everyone in the room, this long. */
export const INCENSE_LUCK = 0.2;
export const INCENSE_MS = 10 * 60_000;

export interface Craft {
  name: string;
  emoji: string;
  tier: CraftTier;
  material: CraftMaterial;
  category: CraftCategory;
  description: string;
  needs: CraftNeeds;
  /** What Buster (or Bramble) pays for one, and for a Masterwork ✨ (0: not a piece to sell). A
   *  legacy piece's is its trade-in, paid in full. */
  price: number;
  master: number;
  odds: CraftOdds;
  use: CraftUse;
  /** A tackle's effect (use "tool"), a relic's gear piece (use "relic"), a consumable's buff. */
  tool?: ToolId;
  gear?: string;
  buff?: BuffKey;
  /** A piece with a use of its own while you carry it (a torch) or burn it (incense): legacy. */
  special?: "torch" | "incense";
  /** Off the bench (the recipes before this one): still defined, traded in at Buster's or Bramble's. */
  legacy?: boolean;
  /** Fine work: carved only at Bramble's advanced bench in the woods (the campfire's bench carves the
   *  simple goods: docs/economy-plan.md section 10). */
  advanced?: boolean;
  /** Made in a drawer, not at the bench: the Forester's ("wood"), the Fish ("fish"), the Ore
   *  Satchel's ("ore"). */
  drawer?: "wood" | "fish" | "ore";
}
/** A recipe's tab on the bench. */
export const craftCategory = (c: Craft): CraftCategory => c.category;
/** Whether a recipe shows under a tab (the bench's: never a drawer's own). */
export const craftMatches = (c: Craft, f: CraftFilter) => !c.legacy && !c.drawer && c.category === f;

const make = (name: string, emoji: string, tier: CraftTier, material: CraftMaterial, category: CraftCategory, use: CraftUse, needs: CraftNeeds, price: number, description: string, extra: Partial<Craft> = {}): Craft => ({
  name,
  emoji,
  tier,
  material,
  category,
  needs,
  price,
  master: price > 0 ? Math.round(price * 1.7) : 0,
  odds: ODDS[tier],
  use,
  description,
  ...extra,
});
const tackle = (name: string, emoji: string, tier: CraftTier, material: CraftMaterial, needs: CraftNeeds, tool: ToolId, description: string) => make(name, emoji, tier, material, "tackles", "tool", needs, 0, description, { tool });
const consumable = (name: string, emoji: string, material: CraftMaterial, needs: CraftNeeds, buff: BuffKey, description: string) => make(name, emoji, "common", material, "consumables", "consumable", needs, 0, description, { buff });
const relic = (name: string, emoji: string, tier: CraftTier, material: CraftMaterial, needs: CraftNeeds, gear: string, description: string) => make(name, emoji, tier, material, "relics", "relic", needs, 0, description, { gear });
const furniture = (name: string, emoji: string, tier: CraftTier, material: CraftMaterial, needs: CraftNeeds, price: number, description: string, extra: Partial<Craft> = {}) => make(name, emoji, tier, material, "furniture", "sell", needs, price, description, extra);
/** A recipe of the bench before: its piece (or thing, or relic) still what it was, off the bench. */
const legacy = (c: Craft): Craft => ({ ...c, category: "legacy", legacy: true });

/** A piece's id in the camp profile (kept short, and stable: the legacy ids keep what they were). */
export type CraftId =
  // 🎣 the tackles
  | "otter_float"
  | "resin_sinker"
  | "silk_line"
  | "wedge_mallet"
  | "titan_lever"
  // 🪑 the simple goods (any bench) and the fine ones (the woods' bench)
  | "plank_bundle"
  | "kindling_crate"
  | "birch_tray"
  | "otter_figurine"
  | "music_box"
  // 🧪 the consumables
  | "smore"
  | "grip_wax"
  | "sap_ointment"
  | "glow_chum"
  | "scent_pouch"
  // 🧪 the drawers' own consumables
  | "pine_pitch"
  | "glow_bait"
  | "miners_stout"
  // 🧿 the relics
  | "carved_belt"
  | "deepriver_ring"
  | "heartwood_compass"
  // 🪑 the furniture
  | "birch_stool"
  | "keepsake_box"
  | "autumn_chair"
  | "elder_clock"
  // legacy: the bench before
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
  | "hook_charm"
  | "bark_bangle"
  | "forest_diorama"
  | "cedar_clock"
  | "rocking_chair"
  | "runic_totem"
  // legacy: the old camp woods
  | "totem"
  | "plank"
  | "birdhouse"
  | "briquette"
  | "mask";

export const CRAFTS: Record<CraftId, Craft> = {
  // --- 🎣 the tackles: made once, at work whenever you fish or fell -----------------------------
  otter_float: tackle("Whittled Otter Float", "🦦", "uncommon", "birch", { wood: { birch: 4 }, resin: 2, byproducts: { scales: 6 } }, "otter_float", "Tackle: bites come 15% sooner (a hand-reeled line and an AFK one)"),
  resin_sinker: tackle("Resin-Weighted Sinker", "🪨", "rare", "cedar", { wood: { cedar: 3 }, resin: 3, byproducts: { amber: 4 } }, "resin_sinker", "Tackle: the reel's green catch bar 15% bigger"),
  silk_line: tackle("Braided Silk Line", "🧵", "rare", "river", { resin: 2, byproducts: { silverBark: 3, fishBone: 2 } }, "silk_line", "Tackle: the line's tension builds 15% slower"),
  wedge_mallet: tackle("Wedge & Mallet Kit", "🔨", "epic", "maple", { wood: { maple: 3, cedar: 4 }, firewood: 4 }, "wedge_mallet", "Tackle: Wood Knots never deflect your axe (no 0.4 s recovery)"),
  titan_lever: tackle("Titan Felling Lever", "🪝", "legendary", "elderwood", { wood: { elderwood: 2, maple: 4 }, byproducts: { leafAmber: 4 } }, "titan_lever", "Tackle: every round you land on a Colossal tree counts 1.5x toward your share of its haul"),
  // --- 🧪 the consumables: into the stash, used from the wood drawer ------------------------------
  smore: consumable("Toasted Campfire S'more", "🍫", "pine", { wood: { pine: 2 }, firewood: 1 }, "smore", "Eat it: +15% walking pace for 15 minutes"),
  grip_wax: consumable("Amber Grip Wax", "🕯️", "resins", { resin: 3, byproducts: { amber: 3 } }, "wax", "Rub it on: the gold sweet spot 20% bigger (felling and splitting) for 10 minutes"),
  sap_ointment: consumable("Silverwood Sap Ointment", "🧴", "resins", { resin: 2, byproducts: { silverBark: 2 } }, "sap", "Rub it in: the felling ring and the splitting gauge 15% slower for 10 minutes"),
  glow_chum: consumable("Glow-Spore Chum", "🫧", "river", { byproducts: { scales: 8, fishBone: 1 } }, "chum", "Scatter it: bites 20% sooner and rare fish 25% likelier for 10 minutes"),
  scent_pouch: consumable("Aromatic Pine Pouch", "🌿", "pine", { wood: { pine: 2 }, resin: 1, byproducts: { bark: 2 } }, "scent", "Hang it on your line: common fish bite within 5 seconds of a cast for 15 minutes"),
  // --- 🧪 the drawers' own: made in the Forester's, the Fish and the Ore Satchel's drawers -------------
  pine_pitch: { ...consumable("Feller's Pine Pitch", "🍯", "resins", { resin: 3, sawdust: 4 }, "pitch", "Smear it on the axe: every landed round 25% likelier to drop a log for 10 minutes"), drawer: "wood" },
  glow_bait: { ...consumable("Phosphor Glow Bait", "🪱", "river", { byproducts: { scales: 6, fishBone: 1, stoneDust: 2 } }, "glowbait", "Glowing in the dark: rare fish and better 30% likelier by night and underground for 10 minutes"), drawer: "fish" },
  miners_stout: { ...consumable("Miner's Stout", "🍺", "resins", { ore: { coal: 2 }, byproducts: { stoneDust: 4 } }, "stout", "A dark cave brew: your pickaxe strikes 25% harder for 10 minutes"), drawer: "ore" },
  // --- 🧿 the relics: carved once, worn in a gear slot to work -----------------------------------
  carved_belt: legacy(relic("Carved Lumberjack Belt", "🎗️", "rare", "cedar", { wood: { cedar: 6 }, resin: 8 }, "carved_belt", "Waist relic (wear it): +8 carrier slots, and the splitting gauge 15% slower")),
  deepriver_ring: legacy(relic("Deepriver Fisherman Ring", "💍", "rare", "river", { wood: { cedar: 3 }, byproducts: { fishBone: 2, scales: 10 } }, "deepriver_ring", "Finger relic (wear it): +6 livewell slots")),
  heartwood_compass: legacy(relic("Heartwood Compass", "🧭", "epic", "elderwood", { wood: { elderwood: 1 }, byproducts: { silverBark: 3, leafAmber: 2 } }, "heartwood_compass", "Charm relic (wear it): pulses toward a standing Colossal tree, and chimes when it rises")),
  // --- 🪑 the furniture: trade goods, at the hour's market ---------------------------------------
  // (the simple goods, at either bench: each a little over its makings' worth, docs/economy-plan.md
  // section 10; Firewood is worth more in a crate than by the bundle)
  kindling_crate: furniture("Kindling Crate", "🧺", "common", "pine", { firewood: 12, wood: { pine: 2 } }, 14, "Split kindling, crated dry for a cold camp"),
  plank_bundle: furniture("Pine Plank Bundle", "🪵", "common", "pine", { wood: { pine: 8 } }, 24, "Eight pine boards, planed and tied"),
  birch_tray: furniture("Birch Serving Tray", "🍽️", "common", "birch", { wood: { birch: 3 }, byproducts: { bark: 1 } }, 16, "A pale birch tray with a bark rim"),
  birch_stool: furniture("Rustic Birch Stool", "🪑", "uncommon", "birch", { wood: { birch: 4 }, byproducts: { bark: 2 } }, 28, "A sturdy three-legged birch stool, bark-trimmed"),
  // (the fine goods: Bramble's advanced bench only)
  otter_figurine: furniture("Carved Otter Figurine", "🦦", "rare", "cedar", { wood: { cedar: 3 }, byproducts: { scales: 6, fishBone: 1 } }, 70, "A cedar otter with a fish-bone whisker and scales for its coat", { advanced: true }),
  keepsake_box: furniture("Cedar Keepsake Box", "🗃️", "rare", "cedar", { wood: { cedar: 4 }, resin: 1, byproducts: { amber: 3 } }, 80, "Red cedar, amber-inlaid: it keeps the moths out and the memories in", { advanced: true }),
  music_box: furniture("Maple Music Box", "🎶", "epic", "maple", { wood: { maple: 3 }, resin: 2, byproducts: { leafAmber: 2 } }, 140, "A maple box that plays the woods' evening song", { advanced: true }),
  autumn_chair: furniture("Autumn Rocking Chair", "🛋️", "epic", "maple", { wood: { maple: 5 }, byproducts: { leafAmber: 3 } }, 230, "Golden maple that rocks like a slow breeze", { advanced: true }),
  elder_clock: furniture("Grand Elderwood Clock", "🕰️", "legendary", "elderwood", { wood: { elderwood: 4 }, byproducts: { shavings: 4 } }, 950, "The masterpiece: it keeps the forest's own time", { advanced: true }),
  // --- legacy: the bench before (traded in at Buster's or Bramble's) ------------------------------
  roasting_stick: legacy(make("Marshmallow Roasting Stick", "🍡", "common", "pine", "legacy", "roastingStick", { wood: { pine: 3 }, firewood: 1 }, 0, "Legacy: the marshmallow on a log is everyone's now")),
  camp_stool: legacy(furniture("Rustic Camp Stool", "🪑", "common", "pine", { wood: { pine: 4 }, firewood: 2 }, 35, "A sturdy three-legged stool for the fireside")),
  pine_birdhouse: legacy(furniture("Carved Pine Birdhouse", "🐤", "common", "pine", { wood: { pine: 5 }, resin: 2 }, 55, "Resin-sealed against the rain, for the camp's songbirds")),
  songbird: legacy(furniture("Whittled Songbird", "🐦", "uncommon", "birch", { wood: { birch: 4 }, byproducts: { bark: 3 } }, 85, "A little birch warbler, bark-feathered")),
  bark_lantern: legacy(furniture("Birch Bark Lantern", "🏮", "uncommon", "birch", { wood: { birch: 3 }, byproducts: { bark: 4 }, firewood: 1 }, 75, "Paper-white bark round a warm glow")),
  pack_frame: legacy(make("Lumberjack Pack Frame", "🎒", "uncommon", "birch", "legacy", "packFrame", { wood: { birch: 6 }, byproducts: { bark: 5 } }, 0, `Legacy: +${PACK_FRAME_SLOTS} carrier slots (now the Carved Lumberjack Belt's work)`)),
  amber_torch: legacy(furniture("Resin Amber Torch", "🔥", "rare", "cedar", { firewood: 2, byproducts: { amber: 3 }, wood: { cedar: 2 } }, 125, `Carried, it lights your way: ${Math.round((TORCH_NIGHT_PACE - 1) * 100)}% quicker on foot at the camp by night`, { special: "torch" })),
  salmon_totem: legacy(furniture("Carved Salmon Totem", "🗿", "rare", "cedar", { wood: { cedar: 4 }, byproducts: { amber: 4 } }, 225, "A leaping salmon, amber-eyed")),
  tackle_box: legacy(make("Reinforced Tackle Box", "🧰", "rare", "cedar", "legacy", "tackleBox", { wood: { cedar: 5 }, byproducts: { amber: 4 } }, 0, `Legacy: +${TACKLE_BOX_SLOTS} livewell slots (now the Deepriver Fisherman Ring's work)`)),
  maple_bear: legacy(furniture("Carved Maple Bear", "🐻", "epic", "maple", { wood: { maple: 3 }, byproducts: { leafAmber: 3 } }, 480, "A round maple bear with leaf-amber eyes")),
  wind_chimes: legacy(furniture("Gilded Wind Chimes", "🎐", "epic", "maple", { wood: { maple: 4 }, byproducts: { leafAmber: 4 } }, 650, "Maple rods and golden amber that sing in the breeze")),
  smoker_box: legacy(furniture("Maple Smoker Box", "📦", "epic", "maple", { wood: { maple: 5 }, firewood: 2 }, 720, "Sweet maple smoke for the finest fish")),
  rune_tablet: legacy(furniture("Ancient Rune Tablet", "🪧", "legendary", "elderwood", { wood: { elderwood: 2 }, byproducts: { shavings: 4 } }, 850, "Old words carved in humming wood")),
  grand_clock: legacy(furniture("Elderwood Grand Clock", "🕰️", "legendary", "elderwood", { wood: { elderwood: 4 }, byproducts: { shavings: 6 } }, 1650, "The old masterpiece: it keeps the forest's own time")),
  whisper_incense: legacy(furniture("Forest Whisper Incense", "🪔", "uncommon", "resins", { resin: 5, byproducts: { shavings: 3 } }, 210, `Burn it at the bonfire: ${INCENSE_MS / 60_000} minutes of rare-fish luck for everyone in the room`, { special: "incense" })),
  hook_charm: legacy(relic("Otter-Carved Hook Charm", "🦦", "uncommon", "birch", { wood: { birch: 8 }, byproducts: { scales: 4 } }, "hook_charm", "Charm relic: a steadier line on legendary and mythic fish")),
  bark_bangle: legacy(relic("Amber Bark Bangle", "📿", "epic", "pine", { wood: { pine: 10 }, byproducts: { leafAmber: 4 } }, "bark_bangle", "Finger relic: +20% by-product drops while felling")),
  forest_diorama: legacy(furniture("Whittled Forest Diorama", "🏞️", "uncommon", "birch", { wood: { birch: 5 }, byproducts: { bark: 4 } }, 105, "A tiny birch grove under glass, bark-roofed")),
  cedar_clock: legacy(furniture("Carved Cedar Wall Clock", "⏰", "rare", "cedar", { wood: { cedar: 6 }, byproducts: { amber: 4 } }, 280, "Red cedar, amber numerals, a steady tick")),
  rocking_chair: legacy(furniture("Grand Maple Rocking Chair", "🛋️", "epic", "maple", { wood: { maple: 5 }, byproducts: { leafAmber: 3 } }, 620, "Golden maple that rocks like a slow breeze")),
  runic_totem: legacy(furniture("Elder Runic Totem", "🪬", "legendary", "elderwood", { wood: { elderwood: 3 }, byproducts: { shavings: 4 } }, 1250, "Its runes glow faintly when the woods are quiet")),
  totem: legacy(furniture("Carved Chibi Totem", "🧸", "common", "pine", { wood: { pine: 2 } }, CARVED_PRICE, "Hand-carved pocket bear charm")),
  plank: legacy(furniture("Polished Oak Plank", "🟫", "uncommon", "pine", { wood: { oak: 1 } }, CARVED_PRICE, "Sanded smooth furniture timber")),
  birdhouse: legacy({ ...furniture("Rustic Birdhouse", "🏡", "rare", "pine", { wood: { pine: 2, oak: 1 } }, 18, "Cozy nesting box for forest birds"), master: 31 }),
  briquette: legacy({ ...furniture("Aromatic Pine Briquette", "🧱", "epic", "pine", { wood: { pine: 1, charcoal: 1 } }, 28, "Slow-burning scented camp briquette"), master: 48 }),
  mask: legacy({ ...furniture("Forest Guardian Mask", "🎭", "legendary", "pine", { wood: { oak: 2, charcoal: 1 } }, 45, "Intricate tribal spirit mask"), master: 77 }),
};
export const CRAFT_IDS = Object.keys(CRAFTS) as CraftId[];
/** What the bench carves now: the seventeen (the legacy recipes are only traded in; the drawers make
 *  their own three). */
export const BENCH_IDS = CRAFT_IDS.filter((id) => !CRAFTS[id].legacy && !CRAFTS[id].drawer);
/** A drawer's own consumables. */
export const drawerCrafts = (drawer: "wood" | "fish" | "ore") => CRAFT_IDS.filter((id) => CRAFTS[id].drawer === drawer);
/** The tackles, by their effect. */
export const TOOL_CRAFT: Record<ToolId, CraftId> = { otter_float: "otter_float", resin_sinker: "resin_sinker", silk_line: "silk_line", wedge_mallet: "wedge_mallet", titan_lever: "titan_lever" };
export function isCraftId(v: unknown): v is CraftId {
  return typeof v === "string" && v in CRAFTS;
}
export function isCraftMode(v: unknown): v is CraftMode {
  return v === "safe" || v === "push";
}
/** A legacy piece's trade-in (its whole listed price, a Masterwork's for one: never the market's). */
export function tradeInValue(item: CraftItem): number {
  return CRAFTS[item.c].legacy ? craftPrice(item) : 0;
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

/** What a craft's maker holds (the camp profile's parts a recipe draws on; `ore`, the satchel's
 *  counts, for the Ore Satchel's own). */
export interface CraftStock {
  wood: Record<WoodKind, number>;
  firewood: number;
  resin: number;
  sawdust: number;
  byproducts: Partial<Record<ByproductId, number>>;
  ore?: Partial<Record<OreItemId, number>>;
}
/** Whether the stock at hand covers a recipe. */
export function canCraft(stock: CraftStock, id: CraftId): boolean {
  const n = CRAFTS[id].needs;
  return (
    (Object.entries(n.wood ?? {}) as [WoodKind, number][]).every(([k, c]) => (stock.wood[k] ?? 0) >= c) &&
    stock.firewood >= (n.firewood ?? 0) &&
    stock.resin >= (n.resin ?? 0) &&
    stock.sawdust >= (n.sawdust ?? 0) &&
    (Object.entries(n.byproducts ?? {}) as [ByproductId, number][]).every(([k, c]) => (stock.byproducts[k] ?? 0) >= c) &&
    (Object.entries(n.ore ?? {}) as [OreItemId, number][]).every(([k, c]) => (stock.ore?.[k] ?? 0) >= c)
  );
}
/** A recipe's needs in words ("4 Soft Pine + 2 Firewood"): `names` gives each log's and by-product's. */
export function needsList(id: CraftId): { key: string; n: number }[] {
  const n = CRAFTS[id].needs;
  return [
    ...(Object.entries(n.wood ?? {}) as [WoodKind, number][]).map(([k, c]) => ({ key: `wood:${k}`, n: c })),
    ...(n.firewood ? [{ key: "firewood", n: n.firewood }] : []),
    ...(n.resin ? [{ key: "resin", n: n.resin }] : []),
    ...(n.sawdust ? [{ key: "sawdust", n: n.sawdust }] : []),
    ...(Object.entries(n.byproducts ?? {}) as [ByproductId, number][]).map(([k, c]) => ({ key: `by:${k}`, n: c })),
    ...(Object.entries(n.ore ?? {}) as [OreItemId, number][]).map(([k, c]) => ({ key: `ore:${k}`, n: c })),
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
export function craftOdds(id: CraftId, mode: CraftMode, adhesive: Adhesive = "", fortune = 0): CraftOutcomeOdds {
  const odds = { ...CRAFTS[id].odds[mode] };
  // (a Star Shard ring's Fortune: that much of the plain outcome becomes a Masterwork, where one is possible)
  if (fortune > 0 && odds.masterwork > 0) {
    const shift = Math.min(odds.normal, fortune);
    odds.normal -= shift;
    odds.masterwork += shift;
  }
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
