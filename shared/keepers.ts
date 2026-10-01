// What each map's keepers can afford (docs/economy-plan.md section 7). A keeper pays the same base
// price for the same good on every map (no hauling trick); what changes is the ceiling of what each
// can afford. Past it, a keeper pays CEILING_RATE of the hour's price:
//
//   the campfire (Barnaby, Buster)   full for common and uncommon fish, Soft Pine and Silver Birch
//   the woods (Finley, Bramble)      full for fish up to legendary, and every wood
//   the caverns (Finnegan, Gus)      full for everything
//
// Sell All at a counter passes by what it would pay less for (as it passes a locked fish): a finer
// catch is sold there one by one, on purpose, or carried to a keeper who pays in full.
//
// And the Expedition Licence (section 8): what Old Flint asks before he opens the adit.

import type { WoodKind } from "./chop";
import { FISH, type CreelFish, type FishId, type FishTier, type FishingProfile } from "./fishing";

export type Counter = "campfire" | "woods" | "caverns";
/** What a keeper pays for a good past their ceiling: this share of the hour's price. */
export const CEILING_RATE = 0.6;

const FISH_RANK: Record<FishTier, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4 };
/** The finest fish each counter pays in full for. */
export const FISH_CEILING: Record<Counter, FishTier> = { campfire: "uncommon", woods: "legendary", caverns: "mythic" };
/** The woods the campfire's stall pays in full for (the woods' and the caverns' keepers: every wood). */
export const CAMPFIRE_WOODS: readonly WoodKind[] = ["pine", "oak", "charcoal", "birch"];

/** The share of the hour's price a counter pays for a fish, or a log: 1, or CEILING_RATE. */
export function fishRate(counter: Counter, fish: FishId): number {
  return FISH_RANK[(FISH[fish] as { tier: FishTier }).tier] <= FISH_RANK[FISH_CEILING[counter]] ? 1 : CEILING_RATE;
}
export function woodRate(counter: Counter, wood: WoodKind): number {
  return counter !== "campfire" || CAMPFIRE_WOODS.includes(wood) ? 1 : CEILING_RATE;
}
/** Who pays in full for what a counter can't afford. */
export const FULL_PRICE_AT = {
  fish: { campfire: "Finley, on the woods' river", woods: "Finnegan, by the caverns' lake", caverns: "" },
  wood: { campfire: "Bramble, in the woods", woods: "", caverns: "" },
} as const satisfies Record<string, Record<Counter, string>>;

// --- the Expedition Licence ----------------------------------------------------------------------------

/** What Old Flint asks for the way down, once (whoever has it keeps it): coins, and a supply list from
 *  the other two crafts, a T3 axe's wood and a T2-T3 rod's catch (the first lesson of "the crafts feed
 *  each other"). It comes with his Rusted Pickaxe. */
export const LICENCE = { coins: 4000, wood: "cedar" as WoodKind, logs: 12, fishTier: "rare" as FishTier, fish: 3 } as const;
/** A fish that counts toward the licence: of the tier asked, and not locked. */
const licenceFish = (f: CreelFish) => !f.l && (FISH[f.s] as { tier: FishTier }).tier === LICENCE.fishTier;
/** The creel slots the licence would take (the smallest of them first: the cheapest to part with). */
export function licenceSlots(p: Pick<FishingProfile, "creel">): number[] {
  return p.creel
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => licenceFish(f))
    .sort((a, b) => a.f.q - b.f.q || a.f.cm - b.f.cm)
    .slice(0, LICENCE.fish)
    .map(({ i }) => i);
}
/** How the supply list stands: each line's count against what it takes. */
export function licenceProgress(p: Pick<FishingProfile, "creel" | "wood">, coins: number): { coins: number; logs: number; fish: number; ready: boolean } {
  const logs = p.wood[LICENCE.wood] ?? 0;
  const fish = p.creel.filter(licenceFish).length;
  return { coins, logs, fish, ready: coins >= LICENCE.coins && logs >= LICENCE.logs && fish >= LICENCE.fish };
}
