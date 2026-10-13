// The daily orders (shared/types.ts DAILY_TASKS, server/src/rooms/games.ts): one from each board, the
// craft board by what a player can reach, the same for everyone with the same access, each paid once.
import assert from "node:assert/strict";
import test from "node:test";
import { DAILY_BONUS, DAILY_COINS, DAILY_REWARD, DAILY_SLOTS, DAILY_TASKS, parseDaily, type DailyAccess } from "../shared/types";
import { progressDaily, rollDaily } from "../server/src/rooms/games";

const days = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));

test("a day's draw: one order from each board, the same for everyone with the same access", () => {
  for (const day of days) {
    const list = rollDaily([], day);
    assert.deepEqual(list.tasks.map((t) => DAILY_TASKS[t.id].slot), [...DAILY_SLOTS], day);
    assert.deepEqual(rollDaily([], day), list);
    assert.ok(list.tasks.every((t) => t.progress === 0) && !list.claimed);
  }
});

test("a newcomer is never sent where they cannot go; the woods and the caverns open their orders", () => {
  const seen = (access: DailyAccess[]) => new Set(days.map((d) => rollDaily(access, d).tasks[2].id));
  for (const id of seen([])) assert.equal(DAILY_TASKS[id].needs, undefined, id);
  for (const id of seen(["woods"])) assert.notEqual(DAILY_TASKS[id].needs, "cave", id);
  assert.ok([...seen(["woods"])].some((id) => DAILY_TASKS[id].needs === "woods"));
  assert.ok([...seen(["woods", "cave"])].some((id) => DAILY_TASKS[id].needs === "cave"));
  // (the home and town boards do not depend on access: a call's players share them)
  for (const d of days.slice(0, 30)) assert.deepEqual(rollDaily(["woods", "cave"], d).tasks.slice(0, 2), rollDaily([], d).tasks.slice(0, 2));
  // every order comes up on some day
  const all = new Set(days.flatMap((d) => rollDaily(["woods", "cave"], d).tasks.map((t) => t.id)));
  for (const id of Object.keys(DAILY_TASKS)) assert.ok(all.has(id as keyof typeof DAILY_TASKS), `${id} is drawn`);
});

test("an order is met once, and the three together once", () => {
  const list = rollDaily([], "2026-10-14");
  const [a, b, c] = list.tasks.map((t) => t.id);
  const other = (Object.keys(DAILY_TASKS) as (keyof typeof DAILY_TASKS)[]).find((id) => !list.tasks.some((t) => t.id === id))!;
  assert.deepEqual(progressDaily(list, other), { met: false, all: false }, "an order not on the list counts for nothing");
  for (let i = 1; i < DAILY_TASKS[a].goal; i++) assert.deepEqual(progressDaily(list, a), { met: false, all: false });
  assert.deepEqual(progressDaily(list, a), { met: true, all: false });
  assert.deepEqual(progressDaily(list, a), { met: false, all: false }, "never twice");
  assert.equal(progressDaily(list, b, 99).met, true);
  assert.deepEqual(progressDaily(list, c, 99), { met: true, all: true });
  assert.ok(list.claimed);
  assert.deepEqual(parseDaily(JSON.stringify(list)), list);
});

test("the day's whole worth is modest, and an old checklist is dropped", () => {
  assert.equal(DAILY_REWARD, DAILY_COINS.home + DAILY_COINS.town + DAILY_COINS.craft + DAILY_BONUS);
  assert.ok(DAILY_REWARD <= 300, "about ten minutes of a starter's income");
  assert.equal(parseDaily(JSON.stringify({ date: "2026-10-14", tasks: [{ id: "make_wish", progress: 0 }], claimed: false })), null);
});
