// The caverns' endgame (docs/caverns-roadmap.md R2.8): something to mine for past the Deep Core Drill.
//
//   mastery      each kind of node its own five ranks, by how many of them you have broken (the camp
//                profile's `mined`): Novice, Apprentice, Journeyman, Expert, Master. Each rank a better
//                chance of one more ore off every break of that kind (MASTERY_EXTRA a rank), a Master's
//                strikes a wider sweet spot on it (MASTER_SWEET), and a Master's gold title (the six
//                of them together, the Grandmaster's)
//   Motherlode   now and then, while anyone is down there, one standing node glitters gold for a few
//                minutes: whoever breaks it takes MOTHERLODE_YIELD times the haul (one break, then it
//                is an ordinary node again)
//   awakening    the Titan Monolith, surfacing, is awake for AWAKEN_S: broken while it is, every one
//                of its crew takes a second Ancient Core Fragment
import type { OreItemId, OreKind } from "./caverns_mining";

export const RANK_NAMES = ["Novice", "Apprentice", "Journeyman", "Expert", "Master"] as const;
export type MasteryRank = 0 | 1 | 2 | 3 | 4;
/** The breaks each rank takes, kind by kind (the deeper, the fewer: they are slower and fewer). */
export const MASTERY_AT: Record<OreKind, readonly [number, number, number, number, number]> = {
  coal: [0, 25, 100, 300, 750],
  copper: [0, 25, 100, 300, 750],
  iron: [0, 20, 80, 240, 600],
  // (silver and glimmer grow back in minutes, not seconds: fewer breaks to a rank, the same hours)
  silver: [0, 8, 25, 70, 160],
  glimmer: [0, 5, 15, 40, 90],
  monolith: [0, 1, 4, 10, 25],
  rockfall: [0, 1, 3, 6, 12],
  reef: [0, 8, 25, 70, 160],
  pearl: [0, 8, 25, 70, 160],
};
/** The chance, a rank, of one more of a kind's own ore off a break (a Master's 20%). */
export const MASTERY_EXTRA = 0.05;
/** A Master's sweet spot on their kind: this much wider. */
export const MASTER_SWEET = 0.1;
/** The ore a kind's extra is. */
export const MASTERY_ORE: Record<OreKind, OreItemId> = { coal: "coal", copper: "copper_ore", iron: "iron_ore", silver: "silver_ore", glimmer: "glimmer_shard", monolith: "core_fragment", rockfall: "coal", reef: "reef_stone", pearl: "nacre" };
/** The kinds with a Master's title (shared/items.ts SPECIAL_TITLES), and the Grandmaster's. */
export const MASTERY_TITLES: Partial<Record<OreKind, string>> = { coal: "master_collier", copper: "copper_master", iron: "iron_master", silver: "silver_master", glimmer: "glimmer_master", monolith: "titan_breaker" };
export const GRANDMASTER_TITLE = "grandmaster_prospector";

export function masteryRank(kind: OreKind, mined: number): MasteryRank {
  const at = MASTERY_AT[kind];
  let r = 0;
  for (let i = 1; i < at.length; i++) if (mined >= at[i]) r = i;
  return r as MasteryRank;
}
/** A kind's rank, its breaks, and how many the next rank takes (null at Master). */
export function masteryOf(kind: OreKind, mined: number): { rank: MasteryRank; mined: number; next: number | null; from: number } {
  const rank = masteryRank(kind, mined);
  const at = MASTERY_AT[kind];
  return { rank, mined, next: rank < 4 ? at[rank + 1] : null, from: at[rank] };
}
/** The mastery titles earned from a profile's breaks. */
export function masteryTitles(mined: Partial<Record<OreKind, number>>): string[] {
  const out: string[] = [];
  for (const [kind, title] of Object.entries(MASTERY_TITLES) as [OreKind, string][]) if (masteryRank(kind, mined[kind] ?? 0) === 4) out.push(title);
  if (out.length === Object.keys(MASTERY_TITLES).length) out.push(GRANDMASTER_TITLE);
  return out;
}

/** The Motherlode: how often one rises (s, while anyone is down there), how long it glitters, and
 *  how much bigger its haul is; the kinds it can be. */
export const MOTHERLODE_EVERY_S: readonly [number, number] = [360, 600];
export const MOTHERLODE_S = 180;
export const MOTHERLODE_YIELD = 3;
export const MOTHERLODE_KINDS: readonly OreKind[] = ["coal", "copper", "iron", "silver", "glimmer"];

/** The Monolith awake after it surfaces (s): a second core fragment for its crew. */
export const AWAKEN_S = 300;
