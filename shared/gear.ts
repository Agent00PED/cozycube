// The accessories, rebuilt (docs/economy-plan.md section 9): sixteen pieces in four families, each
// worn in one of four slots (hands, waist, a charm, the back) and RAISED, never replaced, rank 1 to 5.
//
//   families   the Angler's (fishing), the Forester's (woodcutting), the Prospector's (mining) and the
//              Wayfarer's (everything: pace, room, trade). One piece a slot in each
//   strength   a piece's main trait grows with its rank (STRENGTH: 5 / 8 / 12 / 16 / 20%); at rank 3 it
//              gains a second trait
//   sets       two worn pieces of a family, and all four, each give the family's set bonus
//   a rank     is earned, never bought (RANK_STEPS): attunement (worn while its craft is done by hand,
//              counted in seconds of active play), from rank 3 a trial (one deed, of two on offer, done
//              wearing a piece of the family), the makings, and a small fee, paid where the work is
//              done (the campfire's stalls, the woods' keepers, the woods' workbench, the forge; the
//              Prospector's start at Gus's)
//   a late     piece gains attunement at double rate until it reaches the rank of its family's best
//   piece
//
// They live in the camp profile (FishingProfile: `gear` owned, `worn` on, `gearRank`, `attune`, the
// `trials` passed and the `deeds` ledger); the server applies every effect and counts every deed
// (`reportDeed`), the client draws them from the same functions. The pieces of before (the shops'
// twelve, the workbench's five relics, the forge's four) were paid back in full by the profile's
// migration (shared/migrate.ts v7).
//
// And the rings (RING_BANDS, RING_GEMS): forged at the forge from a band's ingots and a cut gem, worn
// on two fingers, never raised (the band is its strength: 4 / 7 / 10 / 13%; the gem is what it does, for
// whichever craft is in hand: Luck, Tempo, Bounty, Fortune). The back pieces drawn on the avatar come
// next.

import type { ByproductId, TreeKind, WoodKind } from "./chop";
import type { OreItemId, OreKind } from "./caverns_mining";
import { RETIRED_GEAR_PRICES } from "./economy";
import type { FishTier } from "./fishing";

export type GearSlot = "hands" | "waist" | "charm" | "back";
export const SLOT_CAP: Record<GearSlot, number> = { hands: 1, waist: 1, charm: 1, back: 1 };
export const GEAR_SLOTS: GearSlot[] = ["hands", "waist", "charm", "back"];
export const SLOT_LABEL: Record<GearSlot, string> = { hands: "Hands", waist: "Waist", charm: "Charm", back: "Back" };

export type GearFamily = "angler" | "forester" | "prospector" | "wayfarer";
export const GEAR_FAMILIES: GearFamily[] = ["angler", "forester", "prospector", "wayfarer"];
export const FAMILY: Record<GearFamily, { name: string; emoji: string; craft: string }> = {
  angler: { name: "Angler", emoji: "🎣", craft: "fishing" },
  forester: { name: "Forester", emoji: "🪓", craft: "felling" },
  prospector: { name: "Prospector", emoji: "⛏️", craft: "mining" },
  wayfarer: { name: "Wayfarer", emoji: "🧭", craft: "any craft" },
};
/** Whose drawer lists a family's pieces (the Wayfarer's show in all three). */
export type GearDiscipline = "wood" | "fish" | "ore";
const FAMILY_OF_DISC: Record<GearDiscipline, GearFamily> = { fish: "angler", wood: "forester", ore: "prospector" };

export type GearId =
  | "ang_gloves"
  | "ang_holster"
  | "ang_bell"
  | "ang_creel"
  | "for_gloves"
  | "for_belt"
  | "for_sprout"
  | "for_frame"
  | "pro_guards"
  | "pro_strap"
  | "pro_lodestone"
  | "pro_lamp"
  | "way_mitts"
  | "way_sash"
  | "way_charm"
  | "way_pack";

export const MAX_RANK = 5;
/** A piece's strength by its rank (index 0: not worn). Ranks 6 and 7 (25%, 30%) come with the beach. */
export const STRENGTH = [0, 0.05, 0.08, 0.12, 0.16, 0.2] as const;
/** The rank a piece's second trait wakes at. */
export const TRAIT_RANK = 3;
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** A value that steps with the rank (index 0: not worn). */
type Steps = readonly [0, number, number, number, number, number];
const HOLSTER_SLOTS: Steps = [0, 2, 3, 5, 6, 8];
const BELT_SLOTS: Steps = [0, 3, 4, 6, 8, 10];
const STRAP_SLOTS: Steps = [0, 1, 2, 3, 4, 5];
const PACK_SLOTS: Steps = [0, 1, 1, 2, 2, 3];
const MITTS_PAY: Steps = [0, 0.01, 0.02, 0.03, 0.04, 0.05];
const SASH_PACE: Steps = [0, 0.03, 0.05, 0.08, 0.1, 0.12];

export interface Gear {
  name: string;
  emoji: string;
  slot: GearSlot;
  family: GearFamily;
  /** Its main trait at a rank, in words. */
  main: (rank: number) => string;
  /** Its second trait (from TRAIT_RANK). */
  trait: string;
}

export const GEAR: Record<GearId, Gear> = {
  // the Angler's
  ang_gloves: { name: "Wader Gloves", emoji: "🧤", slot: "hands", family: "angler", main: (r) => `The line's tension builds ${pct(STRENGTH[r])} slower`, trait: "+0.2 s tension window" },
  ang_holster: { name: "Tackle Holster", emoji: "🎒", slot: "waist", family: "angler", main: (r) => `+${HOLSTER_SLOTS[r]} livewell slots`, trait: "Bait lasts 20% longer" },
  ang_bell: { name: "Lucky Bell", emoji: "🔔", slot: "charm", family: "angler", main: (r) => `Rare fish ${pct(STRENGTH[r])} likelier`, trait: "Chimes 30 s before a King-Size Surge, and its catches are King Size 5 in 10" },
  ang_creel: { name: "Creel Pack", emoji: "🧺", slot: "back", family: "angler", main: (r) => `Fish ${pct(STRENGTH[r])} heavier (worth more)`, trait: "+15% chance of a ★★★ fish" },
  // the Forester's
  for_gloves: { name: "Felling Gloves", emoji: "🧤", slot: "hands", family: "forester", main: (r) => `The felling ring closes ${pct(STRENGTH[r])} slower`, trait: "A 10% chance of a bonus log a round" },
  for_belt: { name: "Toolbelt", emoji: "🪢", slot: "waist", family: "forester", main: (r) => `+${BELT_SLOTS[r]} carrier slots`, trait: "+50% Firewood from every log you split" },
  for_sprout: { name: "Dryad's Sprout", emoji: "🌱", slot: "charm", family: "forester", main: (r) => `Trees you fell grow back ${pct(STRENGTH[r])} sooner`, trait: "A 15% chance a tree grows +0.15x as you start on it" },
  for_frame: { name: "Timber Frame", emoji: "🪵", slot: "back", family: "forester", main: (r) => `A log round sheds its by-product too, ${pct(STRENGTH[r])} of the time`, trait: "The gold sweet spot 15% wider" },
  // the Prospector's
  pro_guards: { name: "Knuckle Guards", emoji: "✊", slot: "hands", family: "prospector", main: (r) => `Your pickaxe swings ${pct(STRENGTH[r])} quicker`, trait: "The vein chase's window 0.4 s longer" },
  pro_strap: { name: "Satchel Strap", emoji: "🧷", slot: "waist", family: "prospector", main: (r) => `+${STRAP_SLOTS[r]} satchel slots`, trait: "+50% Fine Stone Dust" },
  pro_lodestone: { name: "Lodestone Pendant", emoji: "🧲", slot: "charm", family: "prospector", main: (r) => `The weak spot's sweet radius ${pct(STRENGTH[r])} wider`, trait: "A Lucky Glint pops one more ore" },
  pro_lamp: { name: "Lamp Pack", emoji: "🏮", slot: "back", family: "prospector", main: (r) => `Geodes ${pct(STRENGTH[r] / 2)} likelier off iron, silver and glimmer`, trait: "A brighter glow round you in the dark zones" },
  // the Wayfarer's
  way_mitts: { name: "Trader's Mitts", emoji: "🤝", slot: "hands", family: "wayfarer", main: (r) => `Every keeper pays ${pct(MITTS_PAY[r])} more`, trait: "The next hour's best price is shown at every counter" },
  way_sash: { name: "Traveller's Sash", emoji: "🎗️", slot: "waist", family: "wayfarer", main: (r) => `+${pct(SASH_PACE[r])} walking pace`, trait: "Wading no longer slows you" },
  way_charm: { name: "Hearth Charm", emoji: "🔥", slot: "charm", family: "wayfarer", main: (r) => `Consumable buffs last ${pct(STRENGTH[r])} longer`, trait: "A 15% chance a consumable is not used up" },
  way_pack: { name: "Explorer's Pack", emoji: "🎒", slot: "back", family: "wayfarer", main: (r) => `+${PACK_SLOTS[r]} slots in the livewell, the carrier and the satchel`, trait: "+3 craft stash slots" },
};
export const GEAR_IDS = Object.keys(GEAR) as GearId[];
export function isGearId(v: unknown): v is GearId {
  return typeof v === "string" && v in GEAR;
}
/** A family's four pieces, slot by slot. */
export const gearOfFamily = (family: GearFamily): GearId[] => GEAR_IDS.filter((id) => GEAR[id].family === family);
/** A drawer's pieces: its own family's and the Wayfarer's. */
export const gearOfDiscipline = (disc: GearDiscipline): GearId[] => [...gearOfFamily(FAMILY_OF_DISC[disc]), ...gearOfFamily("wayfarer")];
export const familyOfDiscipline = (disc: GearDiscipline) => FAMILY_OF_DISC[disc];

/** The set bonuses: two worn pieces of a family, and all four. */
export const SET_BONUS: Record<GearFamily, { two: string; four: string }> = {
  angler: { two: "Bites 10% sooner", four: "A boss fish's fake runs are telegraphed 0.15 s earlier" },
  forester: { two: "Once a tree, a miss still deepens the notch", four: "Your share of a Colossal x1.25, and its way and distance under the header" },
  prospector: { two: "The Perfect window 25% wider", four: "A Clean Break's bonus 35% (from 25%)" },
  wayfarer: { two: "+5% walking pace", four: "Every keeper pays you in full (no buying ceiling)" },
};

/** What is worn, and at what rank: the camp profile's own fields (the rings on the two fingers too). */
export interface Loadout {
  worn: readonly GearId[];
  gearRank: Partial<Record<GearId, number>>;
  ringsWorn?: readonly RingId[];
}

// --- the rings: a band and a gem -------------------------------------------------------------------------

export type RingBand = "copper" | "iron" | "silver" | "glimmer";
export type RingGem = "amethyst" | "topaz" | "opal" | "star_shard";
export type RingId = `${RingBand}:${RingGem}`;
/** A band: its strength, and what forging it takes besides the gem (ingots, a fee). */
export const RING_BANDS: Record<RingBand, { name: string; strength: number; ore: Partial<Record<OreItemId, number>>; fee: number }> = {
  copper: { name: "Copper", strength: 0.04, ore: { copper_ingot: 3 }, fee: 150 },
  iron: { name: "Iron", strength: 0.07, ore: { iron_ingot: 3 }, fee: 400 },
  silver: { name: "Silver", strength: 0.1, ore: { silver_ingot: 3 }, fee: 1000 },
  glimmer: { name: "Glimmer-set", strength: 0.13, ore: { silver_ingot: 3, glimmer_shard: 3 }, fee: 2000 },
};
/** A gem: what the ring does, at its band's strength, for whichever craft is in hand. */
export const RING_GEMS: Record<RingGem, { name: string; emoji: string; power: string; does: (s: number) => string }> = {
  amethyst: { name: "Amethyst", emoji: "🟣", power: "Luck", does: (s) => `Rare fish and by-products ${pct(s)} likelier, geodes ${pct(s / 2)}` },
  topaz: { name: "Topaz", emoji: "🟡", power: "Tempo", does: (s) => `Bites ${pct(s)} sooner, the felling ring ${pct(s)} slower, the pickaxe ${pct(s)} quicker` },
  opal: { name: "Opal", emoji: "⚪", power: "Bounty", does: (s) => `A ${pct(s)} chance of one more log or ore, and fish ${pct(s)} heavier` },
  star_shard: { name: "Star Shard", emoji: "🌟", power: "Fortune", does: (s) => `Masterwork carvings ${pct(s)} likelier, King Size fish ${pct(s / 4)} likelier (one Star Shard ring at a time)` },
};
export const RING_BAND_IDS = Object.keys(RING_BANDS) as RingBand[];
export const RING_GEM_IDS = Object.keys(RING_GEMS) as RingGem[];
/** The two fingers. */
export const RING_CAP = 2;
export const ringId = (band: RingBand, gem: RingGem): RingId => `${band}:${gem}`;
export function isRingId(v: unknown): v is RingId {
  if (typeof v !== "string") return false;
  const [band, gem, more] = v.split(":");
  return more === undefined && band in RING_BANDS && gem in RING_GEMS;
}
export const ringParts = (id: RingId) => {
  const [band, gem] = id.split(":") as [RingBand, RingGem];
  return { band, gem };
};
export const ringName = (id: RingId) => `${RING_BANDS[ringParts(id).band].name} ${RING_GEMS[ringParts(id).gem].name} Ring`;
/** What forging a ring takes: its band's ingots and its cut gem, out of the satchel; and its fee. */
export const ringMakings = (id: RingId): GearMakings => ({ ore: { ...RING_BANDS[ringParts(id).band].ore, [ringParts(id).gem]: 1 } });
/** Putting a ring on: a second Star Shard takes the first one's place, a third ring the oldest's. */
export function wearRing(worn: readonly RingId[], id: RingId): { worn: RingId[]; removed: RingId[] } {
  if (worn.includes(id)) return { worn: [...worn], removed: [] };
  const star = ringParts(id).gem === "star_shard" ? worn.filter((w) => ringParts(w).gem === "star_shard") : [];
  let kept = worn.filter((w) => !star.includes(w));
  const over = kept.length >= RING_CAP ? kept.slice(0, kept.length - RING_CAP + 1) : [];
  kept = kept.filter((w) => !over.includes(w));
  return { worn: [...kept, id], removed: [...star, ...over] };
}
/** The worn rings made valid: owned ones only, within the fingers and the Star Shard's rule. */
export function fitRings(worn: readonly RingId[], owned: readonly RingId[]): RingId[] {
  let out: RingId[] = [];
  for (const id of worn) if (owned.includes(id) && !out.includes(id)) out = wearRing(out, id).worn;
  return out;
}
/** A gem's power from the rings worn: its band's strength; the same gem on both fingers counts once
 *  and a half (the stronger band whole, the other half). */
export function gemPower(l: Loadout, gem: RingGem): number {
  const s = (l.ringsWorn ?? [])
    .filter((id) => ringParts(id).gem === gem)
    .map((id) => RING_BANDS[ringParts(id).band].strength)
    .sort((a, b) => b - a);
  return (s[0] ?? 0) + (s[1] ?? 0) / 2;
}
/** Bounty: the chance of one more of a rock's own ore as it breaks. Fortune: a King Size this much
 *  likelier on a hand-reeled catch, a Masterwork this much likelier off the workbench. (Luck, Tempo and
 *  Bounty's other halves ride in the effects below.) */
export const bonusOreChance = (l: Loadout) => gemPower(l, "opal");
export const kingBonus = (l: Loadout) => gemPower(l, "star_shard") / 4;
export const masterworkBonus = (l: Loadout) => gemPower(l, "star_shard");
export const NO_GEAR: Loadout = { worn: [], gearRank: {} };

/** A piece's rank as it works (0 when it is not worn). */
export const wornRank = (l: Loadout, id: GearId) => (l.worn.includes(id) ? Math.max(1, Math.min(MAX_RANK, l.gearRank[id] ?? 1)) : 0);
const strength = (l: Loadout, id: GearId) => STRENGTH[wornRank(l, id)];
const trait = (l: Loadout, id: GearId) => wornRank(l, id) >= TRAIT_RANK;
/** How many of a family's pieces are worn. */
export const setCount = (l: Loadout, family: GearFamily) => l.worn.filter((id) => GEAR[id].family === family).length;
const two = (l: Loadout, family: GearFamily) => setCount(l, family) >= 2;
const four = (l: Loadout, family: GearFamily) => setCount(l, family) >= 4;

/** Putting a piece on: the slot's piece comes off. The new worn list and what came off. */
export function wearGear(worn: readonly GearId[], id: GearId): { worn: GearId[]; removed: GearId[] } {
  if (worn.includes(id)) return { worn: [...worn], removed: [] };
  const removed = worn.filter((w) => GEAR[w].slot === GEAR[id].slot);
  return { worn: [...worn.filter((w) => !removed.includes(w)), id], removed };
}
/** The worn list made valid: owned pieces only, one a slot (the newest kept). */
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

// the Angler's
/** The Wader Gloves: the line's tension builds this much slower; from rank 3, the tension window longer (s). */
export const tensionCut = (l: Loadout) => strength(l, "ang_gloves");
export const tensionWindowBonus = (l: Loadout) => (trait(l, "ang_gloves") ? 0.2 : 0);
/** The Tackle Holster (and the Explorer's Pack): more livewell slots; from rank 3, a cast's chance to
 *  keep its bait (a bait lasting 20% longer: one cast in six free). */
export const livewellBonus = (l: Loadout) => HOLSTER_SLOTS[wornRank(l, "ang_holster")] + PACK_SLOTS[wornRank(l, "way_pack")];
export const baitSaveChance = (l: Loadout) => (trait(l, "ang_holster") ? 1 - 1 / 1.2 : 0);
/** The Lucky Bell: rare luck; from rank 3, its warning ahead of a surge (s) and a surge's King Size
 *  chance with it. */
export const gearRareLuck = (l: Loadout) => strength(l, "ang_bell") + gemPower(l, "amethyst");
export const hasLuckyBell = (l: Loadout) => trait(l, "ang_bell");
export const LUCKY_BELL_WARN_S = 30;
export const LUCKY_BELL_KING = 0.5;
/** The Creel Pack: every fish this much heavier; from rank 3, a gold star this much likelier. */
export const heftBonus = (l: Loadout) => strength(l, "ang_creel") + gemPower(l, "opal");
export const goldStarBonus = (l: Loadout) => (trait(l, "ang_creel") ? 0.15 : 0);
/** The Angler's set: two, bites (and an AFK line's waits) this much sooner; four, a boss's fake runs
 *  telegraphed this much earlier (s). */
export const biteHaste = (l: Loadout) => (two(l, "angler") ? 1.1 : 1) * (1 + gemPower(l, "topaz"));
export const bossTelegraphBonus = (l: Loadout) => (four(l, "angler") ? 0.15 : 0);

// the Forester's
/** The Felling Gloves: the felling ring's contraction this much slower; from rank 3, a round's chance
 *  of a second log. */
export const feltRingSlow = (l: Loadout) => strength(l, "for_gloves") + gemPower(l, "topaz");
export const bonusLogChance = (l: Loadout) => (trait(l, "for_gloves") ? 0.1 : 0) + gemPower(l, "opal");
/** The Toolbelt (and the Explorer's Pack): more carrier slots; from rank 3, more Firewood from a split. */
export const carrierBonus = (l: Loadout) => BELT_SLOTS[wornRank(l, "for_belt")] + PACK_SLOTS[wornRank(l, "way_pack")];
export const splitYield = (l: Loadout) => (trait(l, "for_belt") ? 1.5 : 1);
/** The Dryad's Sprout: a tree its wearer fells starts this far back toward grown; from rank 3, the
 *  chance a tree grows as you start on it (by DRYAD_GROWTH). */
export const quickRegrow = (l: Loadout) => strength(l, "for_sprout");
export const dryadChance = (l: Loadout) => (trait(l, "for_sprout") ? 0.15 : 0);
export const DRYAD_GROWTH = 0.15;
/** The Timber Frame: a round that drops a log also sheds its tree's by-product this often; from rank
 *  3, the gold sweet spot this much wider. */
export const byproductBonus = (l: Loadout) => strength(l, "for_frame") + gemPower(l, "amethyst");
export const goldBonus = (l: Loadout) => (trait(l, "for_frame") ? 0.15 : 0);
/** The Forester's set: two, once a tree a miss still deepens the notch (it drops nothing); four, a
 *  Colossal's rounds count this much more toward the share, and its pulse shows (its way and distance). */
export const missDeepensOnce = (l: Loadout) => two(l, "forester");
export const colossalShare = (l: Loadout) => (four(l, "forester") ? 1.25 : 1);
export const hasCompass = (l: Loadout) => four(l, "forester");

// the Prospector's
/** The Knuckle Guards: the pickaxe's swing this much quicker (its time between strikes divided by it);
 *  from rank 3, the vein chase's window longer (s). */
export const swingHaste = (l: Loadout) => 1 + strength(l, "pro_guards") + gemPower(l, "topaz");
export const chaseWindowBonus = (l: Loadout) => (trait(l, "pro_guards") ? 0.4 : 0);
/** The Satchel Strap (and the Explorer's Pack): more satchel slots; from rank 3, more stone dust. */
export const satchelBonus = (l: Loadout) => STRAP_SLOTS[wornRank(l, "pro_strap")] + PACK_SLOTS[wornRank(l, "way_pack")];
export const dustYield = (l: Loadout) => (trait(l, "pro_strap") ? 1.5 : 1);
/** The Lodestone Pendant: the weak spot's sweet radius this much wider; from rank 3, a Lucky Glint
 *  pops this many more ore. */
export const lodestoneSweet = (l: Loadout) => strength(l, "pro_lodestone");
export const glintBonus = (l: Loadout) => (trait(l, "pro_lodestone") ? 1 : 0);
/** The Lamp Pack: a Mystery Geode this much likelier off an iron, silver or glimmer node; from rank 3,
 *  the glow round its wearer in the dark zones this much brighter. */
export const geodeFind = (l: Loadout) => strength(l, "pro_lamp") / 2 + gemPower(l, "amethyst") / 2;
export const lampGlow = (l: Loadout) => (trait(l, "pro_lamp") ? 1.4 : 1);
/** The Prospector's set: two, the Perfect window this much wider; four, a Clean Break's bonus. */
export const perfectWindow = (l: Loadout) => (two(l, "prospector") ? 1.25 : 1);
export const cleanBreakBonus = (l: Loadout, plain: number) => (four(l, "prospector") ? 1.35 : plain);

// the Wayfarer's
/** The Trader's Mitts: every sale this much more; from rank 3, the next hour's best price at every
 *  counter. */
export const sellBonus = (l: Loadout) => 1 + MITTS_PAY[wornRank(l, "way_mitts")];
export const hasForesight = (l: Loadout) => trait(l, "way_mitts");
/** The Traveller's Sash (and the Wayfarer's two): walking pace; from rank 3, no slowing in water. */
export const gearPace = (l: Loadout) => 1 + SASH_PACE[wornRank(l, "way_sash")] + (two(l, "wayfarer") ? 0.05 : 0);
export const wadesFreely = (l: Loadout) => trait(l, "way_sash");
/** The Hearth Charm: a consumable's buff this much longer; from rank 3, its chance not to be used up. */
export const buffStretch = (l: Loadout) => 1 + strength(l, "way_charm");
export const consumableSave = (l: Loadout) => (trait(l, "way_charm") ? 0.15 : 0);
/** The Explorer's Pack, from rank 3: more craft stash slots (its store slots are in the three bonuses above). */
export const stashBonus = (l: Loadout) => (trait(l, "way_pack") ? 3 : 0);
/** The Wayfarer's four: every keeper pays in full (shared/keepers.ts: no buying ceiling). */
export const noCeiling = (l: Loadout) => four(l, "wayfarer");

// --- raising a rank ------------------------------------------------------------------------------------

/** What a rank's work takes besides coins: from the satchel (`ore`), the materials' store and the carrier. */
export interface GearMakings {
  ore?: Partial<Record<OreItemId, number>>;
  sawdust?: number;
  resin?: number;
  byproducts?: Partial<Record<ByproductId, number>>;
  wood?: Partial<Record<WoodKind, number>>;
}
/** Where a rank's work is done: a campfire stall, a woods keeper, the woods' workbench, the forge, Gus. */
export type GearPlace = "campfire" | "woods" | "bench" | "forge" | "gus";
export const PLACE_LABEL: Record<GearPlace, string> = { campfire: "a campfire stall", woods: "a woods keeper", bench: "the woods' workbench", forge: "the caverns' forge", gus: "Gus's post" };
/** The piece itself (rank 1). */
export const GEAR_PRICE = 150;
/** Attunement (seconds of active play in its craft, cumulative) each rank asks, and its fee. */
export const RANK_ATTUNE = [0, 0, 20 * 60, 65 * 60, 150 * 60, 330 * 60] as const;
export const RANK_FEE = [0, GEAR_PRICE, 100, 300, 800, 2000] as const;
/** The longest stretch between two deeds that still counts as play (s): a pause longer than this earns
 *  only this much. */
export const ATTUNE_GAP_S = 45;
/** The first rank that asks a trial. */
export const TRIAL_RANK = 3;

const PLACES: Record<GearFamily, readonly GearPlace[]> = {
  angler: ["campfire", "campfire", "woods", "bench", "forge"],
  forester: ["campfire", "campfire", "woods", "bench", "forge"],
  prospector: ["gus", "gus", "forge", "forge", "forge"],
  wayfarer: ["campfire", "campfire", "woods", "bench", "forge"],
};
const MAKINGS: Record<GearFamily, readonly GearMakings[]> = {
  angler: [{}, { byproducts: { scales: 10 } }, { byproducts: { bark: 6 }, resin: 2 }, { wood: { cedar: 6 }, byproducts: { fishBone: 3, amber: 3 } }, { ore: { silver_ingot: 3, iron_ingot_mw: 1 }, byproducts: { prismScale: 1 } }],
  forester: [{}, { byproducts: { bark: 10 } }, { byproducts: { scales: 12, fishBone: 1 } }, { wood: { maple: 8 }, byproducts: { leafAmber: 3, fishBone: 2 } }, { ore: { silver_ingot: 3, iron_ingot_mw: 1 }, byproducts: { shavings: 4 } }],
  prospector: [{}, { ore: { coal: 10 } }, { ore: { copper_ingot: 4 }, byproducts: { bark: 4 } }, { ore: { iron_ingot: 4, amethyst: 1 }, byproducts: { scales: 8 } }, { ore: { silver_ingot: 3, iron_ingot_mw: 1, opal: 1 } }],
  wayfarer: [{}, { byproducts: { scales: 5, bark: 5 } }, { byproducts: { scales: 8, bark: 6 }, resin: 2 }, { wood: { cedar: 6 }, byproducts: { fishBone: 2 }, ore: { copper_ingot: 2 } }, { ore: { silver_ingot: 3, iron_ingot_mw: 1, topaz: 1 } }],
};
export interface RankStep {
  rank: number;
  attune: number;
  fee: number;
  place: GearPlace;
  needs: GearMakings;
  /** The trial it asks (a key in the profile's `trials`), or "". */
  trial: string;
}
/** What it takes to bring a piece to `rank` (1: buying it). */
export function rankStep(id: GearId, rank: number): RankStep {
  const family = GEAR[id].family;
  return { rank, attune: RANK_ATTUNE[rank], fee: RANK_FEE[rank], place: PLACES[family][rank - 1], needs: MAKINGS[family][rank - 1], trial: rank >= TRIAL_RANK ? trialKey(family, rank) : "" };
}
/** The places that can do a rank's work: its own, and any further along the same road (a woods keeper
 *  does a campfire stall's work, the workbench never a keeper's). */
export function placeDoes(here: GearPlace, wanted: GearPlace): boolean {
  return here === wanted || (wanted === "campfire" && here === "woods");
}

export const trialKey = (family: GearFamily, rank: number) => `${family}${rank}`;
/** Each family's trials, rank 3 to 5: two on offer, either one passes (the first hangs on luck, the
 *  second on skill). */
export const TRIALS: Record<GearFamily, Record<3 | 4 | 5, readonly [string, string]>> = {
  angler: {
    3: ["Land 3 rare fish (or finer) within 20 minutes", "Land 8 fish in a row without losing one"],
    4: ["Land a legendary fish", "Land 5 three-star fish within 20 minutes"],
    5: ["Land a mythic fish", "Land 3 boss fish in a row without losing one"],
  },
  forester: {
    3: ["Fell a tree with every swing on gold", "Fell 5 trees in a row without a miss"],
    4: ["Take a share in a Colossal", "Fell an Autumn Maple with every swing on gold"],
    5: ["Share in 3 Colossals", "Fell the Whispering Elderwood without striking a knot"],
  },
  prospector: {
    3: ["Run a vein chase to 5 links", "Strike 10 Perfects in a row"],
    4: ["Strike a Lucky Glint", "Break a Glimmerstone with a Clean Break"],
    5: ["Break a Motherlode", "Take a share in the Titan Monolith"],
  },
  wayfarer: {
    3: ["Sell on all three maps in one day", "Sell on all three maps in one day"],
    4: ["Meet a week's three Expedition orders", "Meet a week's three Expedition orders"],
    5: ["Trade with all six keepers in one day, a Masterwork among the sales", "Trade with all six keepers in one day, a Masterwork among the sales"],
  },
};

/** The gear's fields in the camp profile. */
export interface GearState extends Loadout {
  gear: GearId[];
  worn: GearId[];
  rings: RingId[];
  ringsWorn: RingId[];
  attune: Partial<Record<GearId, number>>;
  trials: string[];
  /** The deeds ledger: counters the trials read (and, later, anything else that counts deeds). */
  deeds: Record<string, number>;
}
/** A piece's rank as owned (0: not owned). */
export const ownedRank = (p: Pick<GearState, "gear" | "gearRank">, id: GearId) => (p.gear.includes(id) ? Math.max(1, Math.min(MAX_RANK, p.gearRank[id] ?? 1)) : 0);
/** The best rank among a family's owned pieces. */
export const familyBest = (p: Pick<GearState, "gear" | "gearRank">, family: GearFamily) => Math.max(0, ...gearOfFamily(family).map((id) => ownedRank(p, id)));

// --- the deeds: attunement and trials ---------------------------------------------------------------

/** A countable act, reported once by the server where it is judged. */
export type Deed =
  /** A fish landed by hand (never an AFK line's). */
  | { kind: "catch"; tier: FishTier; stars: number }
  | { kind: "lost"; boss: boolean }
  | { kind: "swing"; tree: string; verdict: "gold" | "hit" | "miss" | "knot" }
  | { kind: "felled"; tree: string; treeKind: TreeKind }
  | { kind: "colossal" }
  | { kind: "split" }
  | { kind: "strike"; landed: boolean; chase: number; streak: number; glint: boolean }
  | { kind: "broke"; ore: OreKind; clean: boolean; motherlode: boolean }
  /** A sale at a keeper: the map's counter (0 campfire, 1 woods, 2 caverns), the keeper (0-5), a Masterwork in it. */
  | { kind: "sale"; counter: 0 | 1 | 2; keeper: number; masterwork: boolean }
  | { kind: "weekly" };
/** The keepers a sale is made to (the Wayfarer's rank-5 trial counts them). */
export const KEEPERS = ["barnaby", "buster", "finley", "bramble", "finnegan", "gus"] as const;
export type KeeperId = (typeof KEEPERS)[number];

/** What a session remembers between deeds (never saved: an outing's runs). */
export interface GearRun {
  last: Partial<Record<GearFamily, number>>;
  rares: number[];
  stars: number[];
  landed: number;
  bosses: number;
  tree: string;
  treeGold: boolean;
  treeClean: boolean;
  treeKnot: boolean;
  cleanTrees: number;
}
export const newGearRun = (): GearRun => ({ last: {}, rares: [], stars: [], landed: 0, bosses: 0, tree: "", treeGold: true, treeClean: true, treeKnot: false, cleanTrees: 0 });
const OUTING_MS = 20 * 60 * 1000;
const DEED_FAMILY: Partial<Record<Deed["kind"], GearFamily>> = { catch: "angler", swing: "forester", split: "forester", strike: "prospector" };

/** A deed counted: the worn pieces of its craft (and the Wayfarer's) gain attunement, the run and the
 *  ledger are updated, and any trial it passes is noted. Returns the trials passed just now (their keys). */
export function reportDeed(p: GearState, run: GearRun, deed: Deed, now: number): string[] {
  // attunement: the seconds since the craft's last deed (a pause counts ATTUNE_GAP_S at most), to every
  // worn piece of the craft's family and of the Wayfarer's; a piece behind its family's best, double
  const family = DEED_FAMILY[deed.kind];
  const active = deed.kind !== "swing" || deed.verdict === "gold" || deed.verdict === "hit";
  if (family && active && (deed.kind !== "strike" || deed.landed)) {
    const since = run.last[family];
    const dt = since === undefined ? 10 : Math.max(0, Math.min(ATTUNE_GAP_S, (now - since) / 1000));
    run.last[family] = now;
    for (const id of p.worn) {
      const f = GEAR[id].family;
      if (f !== family && f !== "wayfarer") continue;
      const behind = ownedRank(p, id) < familyBest(p, f);
      p.attune[id] = Math.min(RANK_ATTUNE[MAX_RANK], Math.round(((p.attune[id] ?? 0) + dt * (behind ? 2 : 1)) * 10) / 10);
    }
  }
  // the runs and the ledger
  const passed: string[] = [];
  const pass = (f: GearFamily, rank: number, ok: boolean) => {
    const key = trialKey(f, rank);
    if (ok && setCount(p, f) > 0 && !p.trials.includes(key)) {
      p.trials.push(key);
      passed.push(key);
    }
  };
  if (deed.kind === "catch") {
    const boss = deed.tier === "legendary" || deed.tier === "mythic";
    run.landed += 1;
    run.bosses = boss ? run.bosses + 1 : run.bosses;
    if (deed.tier !== "common" && deed.tier !== "uncommon") run.rares.push(now);
    if (deed.stars >= 3) run.stars.push(now);
    run.rares = run.rares.filter((t) => now - t <= OUTING_MS);
    run.stars = run.stars.filter((t) => now - t <= OUTING_MS);
    pass("angler", 3, run.rares.length >= 3 || run.landed >= 8);
    pass("angler", 4, boss || run.stars.length >= 5);
    pass("angler", 5, deed.tier === "mythic" || run.bosses >= 3);
  } else if (deed.kind === "lost") {
    run.landed = 0;
    if (deed.boss) run.bosses = 0;
  } else if (deed.kind === "swing") {
    if (run.tree !== deed.tree) Object.assign(run, { tree: deed.tree, treeGold: true, treeClean: true, treeKnot: false });
    if (deed.verdict !== "gold") run.treeGold = false;
    if (deed.verdict === "miss" || deed.verdict === "knot") run.treeClean = false;
    if (deed.verdict === "knot") run.treeKnot = true;
  } else if (deed.kind === "felled") {
    const mine = run.tree === deed.tree;
    run.cleanTrees = mine && run.treeClean ? run.cleanTrees + 1 : 0;
    pass("forester", 3, (mine && run.treeGold) || run.cleanTrees >= 5);
    pass("forester", 4, mine && run.treeGold && deed.treeKind === "maple");
    pass("forester", 5, mine && !run.treeKnot && deed.treeKind === "elderwood");
    run.tree = "";
  } else if (deed.kind === "colossal") {
    p.deeds.colossals = (p.deeds.colossals ?? 0) + 1;
    pass("forester", 4, true);
    pass("forester", 5, p.deeds.colossals >= 3);
  } else if (deed.kind === "strike") {
    pass("prospector", 3, deed.chase >= 5 || deed.streak >= 10);
    pass("prospector", 4, deed.glint);
  } else if (deed.kind === "broke") {
    pass("prospector", 4, deed.clean && deed.ore === "glimmer");
    pass("prospector", 5, deed.motherlode || deed.ore === "monolith");
  } else if (deed.kind === "sale") {
    const day = Math.floor(now / 86_400_000);
    if (p.deeds.tradeDay !== day) Object.assign(p.deeds, { tradeDay: day, tradeMaps: 0, tradeKeepers: 0, tradeMw: 0 });
    p.deeds.tradeMaps = (p.deeds.tradeMaps ?? 0) | (1 << deed.counter);
    p.deeds.tradeKeepers = (p.deeds.tradeKeepers ?? 0) | (1 << deed.keeper);
    if (deed.masterwork) p.deeds.tradeMw = 1;
    pass("wayfarer", 3, p.deeds.tradeMaps === 7);
    pass("wayfarer", 5, p.deeds.tradeKeepers === (1 << KEEPERS.length) - 1 && p.deeds.tradeMw === 1);
  } else if (deed.kind === "weekly") {
    pass("wayfarer", 4, true);
  }
  return passed;
}
/** A passed trial, in words (for its toast). */
export function trialWords(key: string): string {
  const family = GEAR_FAMILIES.find((f) => key.startsWith(f));
  const rank = Number(key.slice(family?.length ?? 0));
  return family ? `${FAMILY[family].emoji} ${FAMILY[family].name}'s rank-${rank} trial passed: your ${FAMILY[family].name}'s pieces can be raised to rank ${rank}` : "";
}

/** How a piece stands against its next rank: what it still lacks ([]: ready), leaving the makings and
 *  the place to the caller (shared/expedition.ts makingsMissing; where the player stands). */
export function rankLacks(p: GearState, id: GearId, coins: number): { step: RankStep | null; lacks: string[] } {
  const rank = ownedRank(p, id);
  if (rank >= MAX_RANK) return { step: null, lacks: [] };
  const step = rankStep(id, rank + 1);
  const lacks: string[] = [];
  const have = p.attune[id] ?? 0;
  if (have < step.attune) lacks.push(`${Math.ceil((step.attune - have) / 60)} more minutes of ${FAMILY[GEAR[id].family].craft} with it on`);
  if (step.trial && !p.trials.includes(step.trial)) lacks.push("its trial");
  if (coins < step.fee) lacks.push(`${(step.fee - coins).toLocaleString("en-US")} 🪙`);
  return { step, lacks };
}
