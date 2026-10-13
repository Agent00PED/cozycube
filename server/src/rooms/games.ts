import {
  DAILY_SLOTS,
  DAILY_TASKS,
  GACHA_COST,
  OUTFITS,
  PREMIUM_HATS,
  hashString,
  type DailyAccess,
  type DailyChecklist,
  type DailyTaskId,
  type GachaPrize,
  type OutfitId,
  type PremiumHat,
} from "../../../shared/types";

// Pure game logic the room calls into: no Colyseus, no schema, easy to test.

// --- gachapon ---------------------------------------------------------------------------------

/** One turn of the crank: hats, the arcade-only jumpsuit, or coins; dupes refund most of the cost. */
export function rollGacha(owned: Set<string>): GachaPrize {
  const roll = Math.random();
  if (roll < 0.05) return owned.has("outfit_cyber") ? { kind: "dupe", refund: 15, id: "outfit_cyber" } : { kind: "outfit", id: "outfit_cyber" as OutfitId };
  if (roll < 0.12) return owned.has("mochiears") ? { kind: "dupe", refund: 15, id: "mochiears" } : { kind: "hat", id: "mochiears" as PremiumHat };
  if (roll < 0.35) {
    const hats = (Object.keys(PREMIUM_HATS) as PremiumHat[]).filter((h) => !PREMIUM_HATS[h].gachaOnly);
    const hat = hats[Math.floor(Math.random() * hats.length)];
    return owned.has(hat) ? { kind: "dupe", refund: Math.min(GACHA_COST - 5, Math.floor(PREMIUM_HATS[hat].price / 8)), id: hat } : { kind: "hat", id: hat };
  }
  if (roll < 0.45) return { kind: "coins", amount: 40 };
  if (roll < 0.75) return { kind: "coins", amount: 10 };
  return { kind: "coins", amount: 5 };
}

export function outfitPrice(id: OutfitId): number {
  return OUTFITS[id].price;
}

// --- the daily checklist ------------------------------------------------------------------------

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The day's three orders, one from each board: the same for everyone with the same access. */
export function rollDaily(access: readonly DailyAccess[] = [], date = todayKey()): DailyChecklist {
  const ids = Object.keys(DAILY_TASKS) as DailyTaskId[];
  let s = hashString(`orders:${date}`);
  const tasks = DAILY_SLOTS.map((slot) => {
    const pool = ids.filter((id) => DAILY_TASKS[id].slot === slot && (!DAILY_TASKS[id].needs || access.includes(DAILY_TASKS[id].needs!)));
    s = (s * 1664525 + 1013904223) >>> 0;
    return { id: pool[(s >>> 8) % pool.length], progress: 0 };
  });
  return { date, tasks, claimed: false };
}

/** Advances an order: whether this call met it, and whether that made the day's three. */
export function progressDaily(list: DailyChecklist, id: DailyTaskId, by = 1): { met: boolean; all: boolean } {
  const task = list.tasks.find((t) => t.id === id);
  if (!task) return { met: false, all: false };
  const goal = DAILY_TASKS[id].goal;
  if (task.progress >= goal) return { met: false, all: false };
  task.progress = Math.min(goal, task.progress + by);
  if (task.progress < goal) return { met: false, all: false };
  const all = !list.claimed && list.tasks.every((t) => t.progress >= DAILY_TASKS[t.id].goal);
  if (all) list.claimed = true;
  return { met: true, all };
}

