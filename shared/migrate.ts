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
// Each migration leaves a word in the profile's mail: told to the player the next time they come in.

import { addLogs, BYPRODUCTS, WOOD, type ByproductId, type WoodKind } from "./chop";
import { CRAFTS, type CraftId, type CraftNeeds } from "./crafting";
import type { FishingProfile } from "./fishing";
import { GEAR } from "./gear";
import { SATCHEL_TIERS } from "./satchel";

/** The camp profile's schema now. */
export const PROFILE_VERSION = 3;
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
export function migratePlayerInventory(raw: unknown, p: FishingProfile): FishingProfile {
  if (p.v >= PROFILE_VERSION) return p;
  const words: string[] = [];
  if (p.v < 2) migrateV2(p, words);
  // v3: the Glimmering Caverns' fields, injected where the stored JSON has none
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(CAVERNS_DEFAULTS)) {
    if (stored[k] === undefined) (p as unknown as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(v));
  }
  if (!p.caveAccess) words.push("⛏️ Word from the woods: an old badger with a lantern on his helmet has been seen by the Autumn Maples, on the Whispering Woods' western cliff. They say he guards a way down.");
  if (words.length) p.mail = [...p.mail, ...words.map((w) => w.slice(0, MAIL_MAX))].slice(-8);
  p.v = PROFILE_VERSION;
  return p;
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
