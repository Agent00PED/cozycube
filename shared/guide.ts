// The Newcomer's Guide: a fresh account's first hour as a chain of twelve small goals, one at a time,
// from the first fish to Old Flint's offer. Each pays a few coins once (a coin is a minute: the whole
// chain pays about a quarter of an hour of a starter's income, never enough to skip a tool).
//
// A step is met either by what the camp profile already says (a fish landed, a second rod owned) or
// by a flag the server sets where the thing happens (a map walked into, a seat by the fire taken).
// Flags are kept as they happen, whatever the step in hand, so nothing done early has to be done
// twice; and an account from before the guide walks through every step it has long since met the
// first time it is looked at (`advanceGuide`), paid for each.
import type { FishingProfile } from "./fishing";
import type { MapId } from "./types";

/** What is kept in the camp profile: the steps met (their ids, in order) and the flags seen. */
export interface GuideState {
  done: string[];
  flags: string[];
}
export const emptyGuide = (): GuideState => ({ done: [], flags: [] });

/** The flags the server sets: a world walked into (`at:<map>`), a log seat taken by a fire, a sale to
 *  one of the woods' keepers, a word with Old Flint. */
export type GuideFlag = `at:${MapId}` | "sat" | "soldWoods" | "flint";
const FLAG_IDS = new Set<string>(["sat", "soldWoods", "flint"]);
export const isGuideFlag = (f: unknown): f is GuideFlag => typeof f === "string" && (FLAG_IDS.has(f) || /^at:[a-z_]{4,24}$/.test(f));

type Facts = Pick<FishingProfile, "caught" | "best" | "felled" | "bestLog" | "rods" | "axes" | "gear" | "ranger" | "caveAccess">;
const any = (r: Partial<Record<string, number>>) => Object.values(r).some((n) => (n ?? 0) > 0);

export interface GuideStep {
  id: string;
  emoji: string;
  title: string;
  /** How to do it, for someone who has never played. */
  hint: string;
  coins: number;
  met(p: Facts, flags: ReadonlySet<string>): boolean;
}
export const GUIDE: readonly GuideStep[] = [
  {
    id: "campfire",
    emoji: "🏕️",
    title: "Travel to the Starlight Campfire",
    hint: "Open the world list in the header and pick the Starlight Campfire. Everything you earn starts there.",
    coins: 10,
    met: (p, f) => f.has("at:campfire_night") || any(p.caught) || any(p.felled),
  },
  {
    id: "fish",
    emoji: "🎣",
    title: "Catch your first fish",
    hint: "Walk to the dock on the river and press E (or tap the dock), then Manual Reel. When it bites, keep the fish inside the green until the bar fills.",
    coins: 15,
    met: (p) => any(p.caught),
  },
  {
    id: "sellFish",
    emoji: "🦦",
    title: "Sell your catch to Barnaby",
    hint: "Barnaby the otter keeps the stall by the river. Talk to him and use Sell All. His chalkboard shows which fish pay more this hour.",
    coins: 15,
    met: (p) => any(p.best),
  },
  {
    id: "fell",
    emoji: "🪓",
    title: "Fell a Soft Pine",
    hint: "Walk up to any pine at the campfire and press E. Strike as the ring closes onto the golden band; each round you land drops a log.",
    coins: 15,
    met: (p) => any(p.felled),
  },
  {
    id: "sellWood",
    emoji: "🦫",
    title: "Sell your logs to Buster",
    hint: "Buster the beaver keeps the stall by the woodpile on the north side. Sell All Logs is at the foot of his Trade tab.",
    coins: 15,
    met: (p) => any(p.bestLog),
  },
  {
    id: "fire",
    emoji: "🔥",
    title: "Sit down by the bonfire",
    hint: "Tap one of the log benches round the fire. While it burns, a marshmallow comes to hand: roast it and eat it for a quicker step.",
    coins: 10,
    met: (_p, f) => f.has("sat"),
  },
  {
    id: "tool",
    emoji: "🛠️",
    title: "Buy a better rod or axe",
    hint: "The Pro Carbon Rod at Barnaby's or the Iron Timber Axe at Buster's, 500 coins each (their Tools tab). The rod lands finer fish; the axe is for the woods' birches.",
    coins: 40,
    met: (p) => p.rods.length > 1 || p.axes.length > 1,
  },
  {
    id: "woods",
    emoji: "🌲",
    title: "Walk into the Whispering Woods",
    hint: "The branch archway stands at the head of the north path, beside Buster. A Day Trip Permit is 200 coins a visit; the woods' trees and fish are worth far more.",
    coins: 30,
    met: (p, f) => f.has("at:whispering_woods") || p.ranger || p.caveAccess,
  },
  {
    id: "woodsTrade",
    emoji: "🐻",
    title: "Sell something to Bramble or Finley",
    hint: "In the woods, Bramble the bear buys wood at his cabin and Finley the otter buys fish from his boulder on the river. They pay in full for goods the campfire's stalls cannot afford.",
    coins: 30,
    met: (p, f) => f.has("soldWoods") || p.caveAccess,
  },
  {
    id: "gear",
    emoji: "🧤",
    title: "Buy your first piece of gear",
    hint: "Every keeper has a Gear tab. A piece costs a few hundred coins, works while you wear it, and grows stronger the more you use it.",
    coins: 40,
    met: (p) => p.gear.length > 0,
  },
  {
    id: "explore",
    emoji: "🎰",
    title: "Visit the Velvet Casino, the Velvet Ring or Sunset Beach",
    hint: "The world list again: the casino's tables, a boxing bout to fight or bet on, or the beach with its bar and its pier. Any one of the three.",
    coins: 20,
    met: (_p, f) => f.has("at:velvet_casino") || f.has("at:boxing_ring") || f.has("at:sunset_beach"),
  },
  {
    id: "flint",
    emoji: "🦡",
    title: "Find Old Flint at the old mine",
    hint: "In the woods, behind the Autumn Maples on the western cliff, a badger with a lantern leans by a mine entrance. Hear what his Expedition Licence costs: that is your next big goal.",
    coins: 40,
    met: (p, f) => f.has("flint") || p.caveAccess,
  },
];
/** On top of the last step's coins, for the whole chain. */
export const GUIDE_BONUS = 50;
export const GUIDE_BY_ID: Readonly<Record<string, GuideStep>> = Object.fromEntries(GUIDE.map((s) => [s.id, s]));

/** The step in hand (null: the guide is finished). */
export function guideStep(g: GuideState): GuideStep | null {
  return GUIDE.find((s) => !g.done.includes(s.id)) ?? null;
}
export const guideFinished = (g: GuideState) => guideStep(g) === null;
/** How far along: steps met, and of how many. */
export const guideProgress = (g: GuideState) => ({ done: GUIDE.filter((s) => g.done.includes(s.id)).length, all: GUIDE.length });

/** A flag seen (false: already known, or the guide is over and nothing more is kept). */
export function noteGuideFlag(g: GuideState, flag: GuideFlag): boolean {
  if (guideFinished(g) || g.flags.includes(flag)) return false;
  g.flags.push(flag);
  return true;
}

/** What `advanceGuide` found: the steps just met, in order, and the coins they pay together. */
export interface GuideAdvance {
  steps: string[];
  coins: number;
  finished: boolean;
}
/** Walks the chain on from the step in hand for as long as each next step is already met, marking
 *  them done. The caller pays `coins` (the chain's bonus in it when the last step falls). */
export function advanceGuide(p: Facts & { guide: GuideState }): GuideAdvance {
  const flags = new Set(p.guide.flags);
  const out: GuideAdvance = { steps: [], coins: 0, finished: false };
  for (let step = guideStep(p.guide); step && step.met(p, flags); step = guideStep(p.guide)) {
    p.guide.done.push(step.id);
    out.steps.push(step.id);
    out.coins += step.coins;
  }
  if (out.steps.length && guideFinished(p.guide)) {
    out.coins += GUIDE_BONUS;
    out.finished = true;
    p.guide.flags = []; // (nothing reads them once the chain is done)
  }
  return out;
}

/** The `guideStep` message: what was just met, what it paid, and where the chain stands. */
export interface GuideNews extends GuideAdvance {
  /** Told as the player comes in (steps long since met, on an account older than the guide). */
  catchUp: boolean;
}

export function sanitizeGuide(raw: unknown): GuideState {
  const g = emptyGuide();
  if (!raw || typeof raw !== "object") return g;
  const r = raw as { done?: unknown; flags?: unknown };
  if (Array.isArray(r.done)) g.done = GUIDE.filter((s) => (r.done as unknown[]).includes(s.id)).map((s) => s.id);
  if (Array.isArray(r.flags)) g.flags = Array.from(new Set(r.flags.filter(isGuideFlag))).slice(0, 24);
  return g;
}

/** The worlds whose first visit the guide reads (the only `at:` flags worth keeping). */
export const GUIDE_MAPS: ReadonlySet<MapId> = new Set<MapId>(["campfire_night", "whispering_woods", "velvet_casino", "boxing_ring", "sunset_beach"]);
