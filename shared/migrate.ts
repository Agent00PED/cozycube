// The legacy data migration: a stored camp profile from before this schema brought up to it as it is
// read (sanitizeFishingProfile runs it on every read: a session's login, the server's startup pass
// over the stored players, the network), once, with nothing lost on the way.
//
//   v0 / v1 -> v2   (the ecosystem rebalance)
//     rods and axes    keep their ids: what they do now comes from their tables (every rod's tension
//                      window +0.3 s; the Starlight Master Rod's Starlight Dampener; the Mythril
//                      Moonlight Rod's Abyssal Tether), so an old rod simply has them
//     things made      the Marshmallow Roasting Stick, the Lumberjack Pack Frame and the Reinforced
//     for good         Tackle Box (off the bench: the marshmallow is everyone's, the belt and the new
//                      Deepriver Fisherman Ring do the other two's work while worn) come back as their
//                      materials, in full, into the carrier and the pouches (the soft clamp keeps any
//                      over their room)
//     legacy pieces    the old bench's pieces in the stash and its two old relics stay exactly where
//     and relics       they are (still held, still worn and working), to trade in at Buster's or
//                      Bramble's for a full refund whenever the player likes
//     missing fields   read as zero, false or empty (the plain read already defaults every one), so a
//                      returning player's profile never trips the room's state
//
//   v2 -> v3   (the Glimmering Caverns)
//     the satchel      satchelTier 0 (the Coat Pockets), satchelSlots its tier's, satchelContents []
//     the pickaxe      pickaxeId "rusted" (Old Flint hands it over when you meet him), caveAccess
//                      false until then
//     the onsen        deepWarmthUntil 0
//     the forge        an empty queue and tray
//     (injected field by field only where missing: a profile that already has them keeps them)
//
//   v3 -> v4   (the Grand Karst rebuild and the storage rebalance)
//     stone dust       Fine Stone Dust leaves the satchel for the crafting materials' store (every
//                      grain of it: nothing is cut to the store's 99, the soft clamp keeps it)
//     the capacities   carriers, livewells and satchels hold less now (a 5-10 minute outing each):
//                      nothing is taken away; anything over its room stays, Overburdened (selling,
//                      splitting, smelting and crafting work; gathering waits until it is back under)
//
//   v4 -> v5   (the economy's first rebalance: docs/economy-plan.md phase 1)
//     the prices       wood, the rarer fish, glimmer, geodes, gems, Firewood and the workbench's
//                      furniture sell for less now (every tool tier earns what its tier should)
//     what was held    nothing held loses its worth: the difference between the old price and the
//                      new, on every log (by its size), fish (by its size and stars), shard, geode,
//                      gem, Firewood bundle and piece of furniture held that day, goes into `owed`,
//                      paid in coins as the player next comes in
//
// Each migration leaves a word in the profile's mail: told to the player the next time they come in.

import { addLogs, BYPRODUCTS, WOOD, woodUnits, type ByproductId, type WoodKind } from "./chop";
import { CRAFTS, type CraftId, type CraftNeeds } from "./crafting";
import { CAVE_FISH_PRICES, FIREWOOD_PRICE, FISH_PRICES, ORE_PRICES, PRE_PHASE1 } from "./economy";
import type { CreelFish, FishingProfile } from "./fishing";
import { GEAR } from "./gear";
import { SATCHEL_TIERS } from "./satchel";

/** The camp profile's schema now. */
export const PROFILE_VERSION = 5;
/** A letter in the profile's mail: at most this long (a longer one is cut short as it is read). */
export const MAIL_MAX = 1200;

/** A recipe's materials back into a profile: its logs (at 1x each), Firewood, Pine Resin, Sawdust
 *  and by-products. The words for what came back. */
export function refundMaterials(p: FishingProfile, needs: CraftNeeds): string {
  const said: string[] = [];
  for (const [k, n] of Object.entries(needs.wood ?? {}) as [WoodKind, number][]) {
    if (n <= 0) continue;
    addLogs(p, k, n, 1);
    said.push(`${n} ${WOOD[k].name}`);
  }
  if (needs.firewood) {
    p.firewood = Math.min(9999, p.firewood + needs.firewood);
    said.push(`${needs.firewood} Firewood`);
  }
  if (needs.resin) {
    p.resin = Math.min(999, p.resin + needs.resin);
    said.push(`${needs.resin} Pine Resin`);
  }
  if (needs.sawdust) {
    p.sawdust = Math.min(999, p.sawdust + needs.sawdust);
    said.push(`${needs.sawdust} Sawdust`);
  }
  for (const [k, n] of Object.entries(needs.byproducts ?? {}) as [ByproductId, number][]) {
    if (n <= 0) continue;
    p.byproducts[k] = Math.min(999, (p.byproducts[k] ?? 0) + n);
    said.push(`${n} ${BYPRODUCTS[k].name}`);
  }
  return said.join(", ");
}

/** The old things made for good, by their profile flag (and a short name, and what does their work now). */
const MADE_FOR_GOOD: [flag: "roastingStick" | "packFrame" | "tackleBox", id: CraftId, short: string, now: string][] = [
  ["roastingStick", "roasting_stick", "Roasting Stick", "roasting on a log is everyone's"],
  ["packFrame", "pack_frame", "Pack Frame", "the Carved Lumberjack Belt carries +8"],
  ["tackleBox", "tackle_box", "Tackle Box", "the Deepriver Fisherman Ring holds +6"],
];
/** A list in words: "a", "a and b", "a, b and c". */
const inWords = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The caverns' fields a profile from before them is given (the plain read defaults them already;
 *  this writes them in, so the stored JSON carries them from its next save). */
const CAVERNS_DEFAULTS = { satchelTier: 0, satchelSlots: SATCHEL_TIERS[0].slots, satchelContents: [], pickaxeId: "rusted", pickaxes: ["rusted"], caveAccess: false, deepWarmthUntil: 0, forgeQueue: [], forgeAt: 0, forgeTray: {}, mined: {} } as const;

/** Brings a read profile (`p`, from the stored `raw`) up to PROFILE_VERSION; a current one is left as
 *  it is. Pure: the room saves the result with its next write. */
export function migratePlayerInventory(raw: unknown, p: FishingProfile, fishValue: (f: CreelFish) => number): FishingProfile {
  if (p.v >= PROFILE_VERSION) return p;
  const words: string[] = [];
  if (p.v < 2) migrateV2(p, words);
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (p.v < 3) {
    // v3: the Glimmering Caverns' fields, injected where the stored JSON has none
    for (const [k, v] of Object.entries(CAVERNS_DEFAULTS)) {
      if (stored[k] === undefined) (p as unknown as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(v));
    }
    if (!p.caveAccess) words.push("⛏️ Word from the woods: an old badger with a lantern on his helmet has been seen by the Autumn Maples, on the Whispering Woods' western cliff. They say he guards a way down.");
  }
  if (p.v < 4) migrateV4(stored, p, words);
  if (p.v < 5) migrateV5(p, words, fishValue);
  if (words.length) p.mail = [...p.mail, ...words.map((w) => w.slice(0, MAIL_MAX))].slice(-8);
  p.v = PROFILE_VERSION;
  return p;
}

/** What the economy's first rebalance took off the worth of everything `p` holds, at an even market:
 *  each log by its size, each fish by its size and stars (`fishValue`: what it sells for now), the
 *  satchel's shards, geodes and gems, the Firewood and the furniture in the stash. */
export function phase1Compensation(p: FishingProfile, fishValue: (f: CreelFish) => number): number {
  let owed = 0;
  for (const [k, was] of Object.entries(PRE_PHASE1.wood) as [WoodKind, number][]) owed += woodUnits(p, k) * Math.max(0, was - WOOD[k].sell);
  const fishWas: Record<string, number> = PRE_PHASE1.fish;
  const fishNow: Record<string, number> = { ...FISH_PRICES, ...CAVE_FISH_PRICES };
  const oreNow: Record<string, number> = ORE_PRICES;
  for (const f of p.creel) {
    const was = fishWas[f.s];
    if (was === undefined) continue;
    // (what it sells for now, by its size and stars, scaled by its old base over its new one)
    const base = fishNow[f.s];
    if (base > 0 && was > base) owed += fishValue(f) * (was / base - 1);
  }
  const oreWas: Record<string, number> = PRE_PHASE1.ore;
  for (const e of p.satchelContents) {
    const was = oreWas[e.id];
    if (was !== undefined) owed += e.n * Math.max(0, was - (oreNow[e.id] ?? was));
  }
  owed += p.firewood * Math.max(0, PRE_PHASE1.firewood - FIREWOOD_PRICE);
  const madeWas: Record<string, number> = PRE_PHASE1.furniture;
  for (const c of p.crafts) {
    const was = madeWas[c.c];
    if (was === undefined) continue;
    const craft = CRAFTS[c.c];
    owed += Math.max(0, was - craft.price) * (c.m ? craft.master / craft.price : 1);
  }
  return Math.round(owed);
}

/** v4 -> v5: the economy's first rebalance. What it took off the player's stock goes into `owed`. */
function migrateV5(p: FishingProfile, out: string[], fishValue: (f: CreelFish) => number) {
  const owed = phase1Compensation(p, fishValue);
  const played = p.creel.length > 0 || p.rods.length > 1 || p.axes.length > 1 || p.caveAccess || Object.values(p.wood).some((n) => n > 0);
  if (owed > 0) p.owed = Math.min(9_999_999, p.owed + owed);
  if (!played && owed <= 0) return;
  out.push(
    `⚖️ The market's great rebalance: timber, the rarer fish, glimmer, geodes, gems and furniture sell for less now, so that every rod, axe and pickaxe earns what its tier should (a better tool is always a better hour).${owed > 0 ? ` Nothing you held lost its worth: the traders paid you ${owed.toLocaleString("en-US")} 🪙 for the difference on your stock.` : ""} Silver and glimmer grow back slower and are worth the wait; a rock shows at most one Lucky Glint.`,
  );
}

/** v3 -> v4: the stone dust out of the satchel into the materials' store (all of it), and a word on
 *  the new capacities (nothing is taken: anything over its room stays, Overburdened). */
function migrateV4(stored: Record<string, unknown>, p: FishingProfile, out: string[]) {
  let dust = 0;
  if (Array.isArray(stored.satchelContents)) {
    for (const e of stored.satchelContents as Record<string, unknown>[]) if (e && e.id === "stone_dust") dust += Math.max(0, Math.round(Number(e.n) || 0));
  }
  if (dust > 0) p.byproducts.stoneDust = Math.min(9999, (p.byproducts.stoneDust ?? 0) + dust);
  const played = p.creel.length > 0 || p.rods.length > 1 || p.axes.length > 1 || p.caveAccess || Object.values(p.wood).some((n) => n > 0);
  if (!played && dust === 0) return;
  out.push(
    `🎒 Storage rebalance: the wood carriers hold 15 to 70 logs, the livewells 12 to 60 fish, and the satchel 2 to 20 slots of 10 (a 5-10 minute outing, then a trip to the stall). Nothing was taken: anything over its room stays with you, marked Overburdened, until you sell it down. Crafting materials (resin, sawdust, bark, scales, bones, stone dust...) have a store of their own now, 99 of each.${dust > 0 ? ` Your ${dust} Fine Stone Dust moved there from the satchel.` : ""}`
  );
}

/** v0 / v1 -> v2: the ecosystem rebalance (the things made for good refunded, the legacy pieces kept
 *  to trade in); its word goes in `words`. */
function migrateV2(p: FishingProfile, out: string[]) {
  const words: string[] = [];
  // the things made for good off the bench: their materials back, in full
  const made: string[] = [];
  const back: string[] = [];
  const now: string[] = [];
  for (const [flag, id, short, instead] of MADE_FOR_GOOD) {
    if (!p[flag]) continue;
    back.push(refundMaterials(p, CRAFTS[id].needs));
    p[flag] = false;
    made.push(short);
    now.push(instead);
  }
  if (made.length) words.push(`your ${inWords(made)} came back as ${made.length > 1 ? "their" : "its"} materials (${back.join(", ")}): ${inWords(now)} now.`);
  // the legacy pieces and relics: kept (still working), and a word that they trade in
  const pieces = p.crafts.filter((c) => CRAFTS[c.c].legacy).length;
  const relics = p.gear.filter((g) => GEAR[g].legacy).map((g) => GEAR[g].name);
  if (pieces > 0 || relics.length > 0) {
    const what = inWords([pieces > 0 ? `${pieces} old bench piece${pieces > 1 ? "s" : ""}` : "", ...relics.map((r) => `your ${r}`)].filter(Boolean));
    words.push(`${what[0].toUpperCase()}${what.slice(1)} trade${pieces + relics.length > 1 ? "" : "s"} in at Buster's or Bramble's for a full refund.`);
  }
  if (words.length) out.push(`🔧 Workshop retrofit: ${words.join(" ")}`);
}
