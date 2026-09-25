import {
  DAILY_TASKS,
  FISH_TABLES,
  GACHA_COST,
  OUTFITS,
  PREMIUM_HATS,
  hashString,
  type DailyChecklist,
  type DailyTaskId,
  type FishOnLine,
  type FishingWater,
  type GachaPrize,
  type OutfitId,
  type PremiumHat,
} from "../../../shared/types";

// Pure game logic the room calls into: no Colyseus, no schema, easy to test.

// --- fishing ---------------------------------------------------------------------------------

export function rollFish(water: FishingWater): FishOnLine {
  const table = FISH_TABLES[water];
  const total = table.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of table) {
    roll -= c.weight;
    if (roll <= 0) return { item: c.item, speed: c.speed, size: c.size, water };
  }
  const last = table[table.length - 1];
  return { item: last.item, speed: last.speed, size: last.size, water };
}

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

/** Three tasks for the day, the same three for a player however often they reconnect. */
export function rollDaily(userId: string, date = todayKey()): DailyChecklist {
  const ids = Object.keys(DAILY_TASKS) as DailyTaskId[];
  const seed = hashString(`${userId}:${date}`);
  const picked: DailyTaskId[] = [];
  let s = seed;
  while (picked.length < 3) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const id = ids[s % ids.length];
    if (!picked.includes(id)) picked.push(id);
  }
  return { date, tasks: picked.map((id) => ({ id, progress: 0 })), claimed: false };
}

/** Advances a task; returns true when this call completed the whole list. */
export function progressDaily(list: DailyChecklist, id: DailyTaskId, by = 1): boolean {
  const task = list.tasks.find((t) => t.id === id);
  if (!task) return false;
  const goal = DAILY_TASKS[id].goal;
  if (task.progress >= goal) return false;
  task.progress = Math.min(goal, task.progress + by);
  const done = list.tasks.every((t) => t.progress >= DAILY_TASKS[t.id].goal);
  if (done && !list.claimed) {
    list.claimed = true;
    return true;
  }
  return false;
}

