// The Expedition's weekly orders (docs/caverns-roadmap.md R2.10): three goals a week down in the
// Glimmering Caverns, the same three for everyone (picked by the week), each paying when it is met and
// the three together a bonus. Progress is counted from where you stood when the week began (a snapshot
// of your breaks and your Prospector's Ledger, shared/fishing.ts CaveLedger), so nothing has to be
// counted twice: a week's orders measure what you did that week.
import type { CaveLedger } from "./fishing";
import type { OreKind } from "./caverns_mining";

export interface WeeklyGoal {
  id: string;
  emoji: string;
  label: string;
  need: number;
  coins: number;
  /** What it counts: breaks of a kind of node, or one of the ledger's marks. */
  of: { ore: OreKind } | { ledger: keyof CaveLedger };
}
export const WEEKLY_POOL: readonly WeeklyGoal[] = [
  { id: "coal", emoji: "⚫", label: "Break 40 Coal Seams", need: 40, coins: 350, of: { ore: "coal" } },
  { id: "copper", emoji: "🟠", label: "Break 40 Copper Veins", need: 40, coins: 400, of: { ore: "copper" } },
  { id: "iron", emoji: "🔩", label: "Break 30 Iron Lodes", need: 30, coins: 700, of: { ore: "iron" } },
  { id: "silver", emoji: "⚪", label: "Break 20 Silver Seams", need: 20, coins: 900, of: { ore: "silver" } },
  { id: "glimmer", emoji: "💠", label: "Break 12 Glimmerstone Clusters", need: 12, coins: 1200, of: { ore: "glimmer" } },
  { id: "monolith", emoji: "🗿", label: "Break the Titan Monolith", need: 1, coins: 900, of: { ore: "monolith" } },
  { id: "perfects", emoji: "⚡", label: "Land 60 Perfect strikes", need: 60, coins: 500, of: { ledger: "perfects" } },
  { id: "geodes", emoji: "💎", label: "Crack 8 geodes", need: 8, coins: 600, of: { ledger: "geodes" } },
  { id: "masterworks", emoji: "✨", label: "Forge 10 Masterwork ingots", need: 10, coins: 700, of: { ledger: "masterworks" } },
  { id: "lodes", emoji: "🪙", label: "Break a Motherlode", need: 1, coins: 600, of: { ledger: "lodes" } },
];
/** All three met in a week: this on top. */
export const WEEKLY_BONUS = 1000;
export const WEEKLY_COUNT = 3;

/** The week (UTC, weeks start on Monday) as a key: "2026-W40". */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
/** When the week in progress ends (ms: the next Monday, 00:00 UTC). */
export function weekEnds(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 7);
}
/** The week's three orders: the same for everyone, from the week's key. */
export function weeklyGoals(week: string): WeeklyGoal[] {
  let h = 2166136261;
  for (let i = 0; i < week.length; i++) h = Math.imul(h ^ week.charCodeAt(i), 16777619) >>> 0;
  const pool = [...WEEKLY_POOL];
  const out: WeeklyGoal[] = [];
  while (out.length < WEEKLY_COUNT && pool.length) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

/** A miner's week: its key, where they stood when it began, and the orders met. */
export interface WeeklyState {
  week: string;
  base: Record<string, number>;
  done: string[];
}
/** What a goal counts, now. */
export function weeklyCount(goal: WeeklyGoal, mined: Partial<Record<OreKind, number>>, ledger: CaveLedger): number {
  return "ore" in goal.of ? (mined[goal.of.ore] ?? 0) : ledger[goal.of.ledger];
}
/** Where a miner stands now, for a week's snapshot. */
export function weeklySnapshot(week: string, mined: Partial<Record<OreKind, number>>, ledger: CaveLedger): Record<string, number> {
  return Object.fromEntries(weeklyGoals(week).map((g) => [g.id, weeklyCount(g, mined, ledger)]));
}
/** A goal's progress this week (0 .. need). */
export function weeklyProgress(goal: WeeklyGoal, state: WeeklyState, mined: Partial<Record<OreKind, number>>, ledger: CaveLedger): number {
  return Math.max(0, Math.min(goal.need, weeklyCount(goal, mined, ledger) - (state.base[goal.id] ?? 0)));
}
