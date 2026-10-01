// The Glimmering Caverns' rules, pinned (docs/caverns-roadmap.md R2.9): `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHASE_MAX,
  CHASE_STEP,
  chaseBonus,
  rollVeinStep,
  CLEAN_BREAK_BONUS,
  GLINT_CHANCE,
  CHISEL_PULVERIZE,
  CHISEL_SWEET,
  ORE_KINDS,
  PERFECT_WINDOW_S,
  PULSE_S,
  STREAK_MAX,
  STREAK_STEP,
  bandAt,
  coopShares,
  forgeHeatAt,
  hammerBeats,
  judgeChisel,
  judgeForge,
  judgeStrike,
  mohs,
  onPulse,
  rollYield,
  streakBonus,
  type ForgeBatch,
} from "../shared/caverns_mining";
import { GRANDMASTER_TITLE, MASTERY_AT, MASTERY_TITLES, masteryOf, masteryRank, masteryTitles } from "../shared/caverns_mastery";
import { CODEX, CODEX_SECTIONS, CODEX_TITLE, codexTitles } from "../shared/caverns_codex";

/** A seeded random (the tests never flake). */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test("the Mohs rule: a pickaxe a tier up one-shots, level mines, one under bites, two under skids", () => {
  assert.equal(mohs(3, 2), "oneshot");
  assert.equal(mohs(2, 2), "mine");
  assert.equal(mohs(1, 2), "under");
  assert.equal(mohs(1, 3), "deflect");
});

test("a strike on the weak spot is direct, off it near, far off it bedrock; damage falls with it", () => {
  const weak: [number, number, number] = [0, 0.6, 0.8];
  // (the hit walked away from the weak spot round the rock: direct, then near, then bedrock, the
  // damage never rising)
  const seen: string[] = [];
  let last = Infinity;
  for (let a = 0; a <= Math.PI; a += Math.PI / 60) {
    const j = judgeStrike("iron", "copper", weak, [Math.sin(a) * 0.8, 0.6, Math.cos(a) * 0.8]);
    if (seen[seen.length - 1] !== j.verdict) seen.push(j.verdict);
    assert.ok(j.damage <= last);
    last = j.damage;
  }
  assert.deepEqual(seen, ["direct", "near", "bedrock"]);
  assert.equal(judgeStrike("coal", "reinforced", weak, [0, 0.3, -0.5]).damage, ORE_KINDS.coal.hp, "a one-shot takes the whole node wherever it lands");
  assert.equal(judgeStrike("glimmer", "rusted", weak, weak).verdict, "deflect");
});

test("the pulse: a Perfect only as the ring closes, never before the first close", () => {
  assert.equal(onPulse(0.02), false);
  assert.equal(onPulse(PULSE_S), true);
  assert.equal(onPulse(PULSE_S * 3 + PERFECT_WINDOW_S * 0.9), true);
  assert.equal(onPulse(PULSE_S * 3 + PERFECT_WINDOW_S * 1.5), false);
  assert.equal(streakBonus(0), 1);
  assert.equal(streakBonus(99), 1 + STREAK_STEP * STREAK_MAX);
});

test("a crew's shares: over 15% of the damage each, +40% a member, four at most", () => {
  assert.deepEqual(coopShares(new Map([["a", 100]])), { crew: ["a"], mult: 1 });
  const two = coopShares(new Map([["a", 60], ["b", 40], ["c", 5]]));
  assert.deepEqual(two.crew, ["a", "b"]);
  assert.ok(Math.abs(two.mult - 1.4) < 1e-9);
  const many = coopShares(new Map(["a", "b", "c", "d", "e", "f"].map((k) => [k, 10] as [string, number])));
  assert.ok(Math.abs(many.mult - 2.2) < 1e-9);
});

test("every node's haul is its own ore; the Monolith a core and a pristine geode", () => {
  const rand = seeded(7);
  for (const kind of ["coal", "copper", "iron", "silver", "glimmer"] as const) {
    for (let i = 0; i < 50; i++) {
      const y = rollYield(kind, "drill", rand);
      assert.ok(Object.values(y).every((n) => (n ?? 0) > 0));
      assert.ok(Object.keys(y).length > 0, `${kind} yields something`);
    }
  }
  assert.deepEqual(rollYield("monolith", "drill", rand), { core_fragment: 1, pristine_geode: 1 });
});

/** A steady hand at the bellows: a pump whenever the heat is a little under the band's middle (at most
 *  ten a second), then both hammer strikes on their beats. */
function playForge(batch: ForgeBatch, seed: number) {
  const pumps: number[] = [];
  let doneAt: number | null = null;
  for (let i = 1; i <= 20 * 60 && doneAt === null; i++) {
    const t = i / 60;
    const now = forgeHeatAt(batch, seed, pumps, t);
    doneAt = now.doneAt;
    if (doneAt !== null) break;
    // (a pump a little before the middle: a pump's heat is nearly the tightest band's whole half)
    if (now.heat < bandAt(batch, seed, t).mid - 0.03 && (pumps.length === 0 || t - pumps[pumps.length - 1] >= 0.1 - 1e-9)) pumps.push(t);
  }
  assert.ok(doneAt !== null, `batch ${batch} (seed ${seed}) held by a steady hand`);
  return { pumps, strikes: hammerBeats(doneAt!), elapsed: doneAt! + 4 };
}

test("the forge: a steady hand makes a Masterwork at every batch size; a miss is Fine; a bad log refused", () => {
  for (const batch of [1, 3, 5] as ForgeBatch[]) {
    for (const seed of [11, 407, 993]) {
      const { pumps, strikes, elapsed } = playForge(batch, seed);
      const j = judgeForge(batch, seed, pumps, strikes, elapsed);
      assert.equal(j.valid, true);
      assert.equal(j.masterwork, true, `batch ${batch} seed ${seed}`);
      const off = judgeForge(batch, seed, pumps, [strikes[0], strikes[1] + 0.6], elapsed);
      assert.equal(off.held && !off.masterwork, true, "a strike off its beat: held, not a Masterwork");
      // (the same log, the same verdict: the server replays what the client played)
      assert.deepEqual(judgeForge(batch, seed, pumps, strikes, elapsed), j);
    }
  }
  assert.equal(judgeForge(1, 1, [2, 1], [], 10).valid, false, "an unsorted log");
  assert.equal(judgeForge(1, 1, [], [], 30).held, false, "no pumps: never held");
  assert.equal(judgeForge(1, 1, [1, 2, 3], [], 0.5).valid, false, "a log longer than the time gone by");
});

test("the chisel's gauge: bounce, rough, perfect, pulverized", () => {
  assert.equal(judgeChisel(0.2), "bounce");
  assert.equal(judgeChisel(0.5), "rough");
  assert.equal(judgeChisel((CHISEL_SWEET[0] + CHISEL_SWEET[1]) / 2), "perfect");
  assert.equal(judgeChisel(CHISEL_PULVERIZE + 0.05), "pulverize");
});

test("mastery: ranks by breaks, the Master's titles, the Grandmaster's for all six", () => {
  assert.equal(masteryRank("coal", 0), 0);
  assert.equal(masteryRank("coal", MASTERY_AT.coal[1]), 1);
  assert.equal(masteryRank("glimmer", MASTERY_AT.glimmer[4] + 1), 4);
  assert.deepEqual(masteryOf("iron", MASTERY_AT.iron[4]).next, null);
  for (const kind of Object.keys(MASTERY_AT) as (keyof typeof MASTERY_AT)[]) {
    const at = MASTERY_AT[kind];
    assert.ok(at.every((v, i) => i === 0 || v > at[i - 1]), `${kind}'s ranks climb`);
  }
  assert.deepEqual(masteryTitles({ coal: 10_000 }), [MASTERY_TITLES.coal]);
  const all = Object.fromEntries((Object.keys(MASTERY_TITLES) as (keyof typeof MASTERY_AT)[]).map((k) => [k, MASTERY_AT[k][4]]));
  assert.ok(masteryTitles(all).includes(GRANDMASTER_TITLE));
});

test("the codex's titles: a section each when it is full, the whole codex's last", () => {
  assert.deepEqual(codexTitles([]), []);
  const zones = CODEX.filter((e) => e.section === "zones").map((e) => e.id);
  assert.deepEqual(codexTitles(zones), [CODEX_SECTIONS.find((s) => s.id === "zones")!.title]);
  const every = codexTitles(CODEX.map((e) => e.id));
  assert.equal(every.length, CODEX_SECTIONS.length + 1);
  assert.equal(every[every.length - 1], CODEX_TITLE);
});

test("the week's orders: three, the same for everyone, counted from the week's start", async () => {
  const { weekKey, weekEnds, weeklyGoals, weeklyProgress, weeklySnapshot, WEEKLY_COUNT } = await import("../shared/caverns_weekly");
  assert.equal(weekKey(Date.UTC(2026, 9, 1)), "2026-W40");
  assert.equal(weekKey(Date.UTC(2026, 0, 1)), "2026-W01");
  assert.equal(new Date(weekEnds(Date.UTC(2026, 9, 1, 12))).getUTCDay(), 1, "a week ends on a Monday");
  const goals = weeklyGoals("2026-W40");
  assert.equal(goals.length, WEEKLY_COUNT);
  assert.equal(new Set(goals.map((g) => g.id)).size, WEEKLY_COUNT);
  assert.deepEqual(weeklyGoals("2026-W40"), goals, "the same three for everyone");
  const ledger = { perfects: 10, bestStreak: 2, geodes: 1, stars: 0, masterworks: 0, lodes: 0 };
  const mined = { coal: 5, copper: 5, iron: 5, silver: 5, glimmer: 5, monolith: 0 };
  const state = { week: "2026-W40", base: weeklySnapshot("2026-W40", mined, ledger), done: [] as string[] };
  for (const g of goals) assert.equal(weeklyProgress(g, state, mined, ledger), 0, `${g.id} starts at nought`);
});

test("the weak spot is rolled on the miner's side of the rock (docs/caverns-roadmap.md R6.5)", async () => {
  const { rollWeakSpot } = await import("../shared/caverns_mining");
  let seed = 11;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const toward of [{ x: 1, z: 0 }, { x: -0.6, z: 0.8 }, { x: 0, z: -2 }]) {
    const l = Math.hypot(toward.x, toward.z);
    for (let i = 0; i < 200; i++) {
      const w = rollWeakSpot(null, rand, toward);
      const flat = Math.hypot(w[0], w[2]) || 1;
      assert.ok((w[0] * toward.x + w[2] * toward.z) / l / flat > 0.3, `weak spot ${w} not toward ${JSON.stringify(toward)}`);
    }
  }
});

test("prospecting's bonuses stay modest: a clean break and a lucky glint", () => {
  assert.ok(CLEAN_BREAK_BONUS > 1 && CLEAN_BREAK_BONUS <= 1.3);
  assert.ok(GLINT_CHANCE > 0.1 && GLINT_CHANCE <= 0.3);
});

test("the vein chase: the next spot a step along the rock on the side the close-up sees; links capped", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const view = { x: 0.6, z: 0.8 };
  let at: [number, number, number] = [0.6, 0.3, 0.74];
  for (let i = 0; i < 300; i++) {
    const next = rollVeinStep(at, rand, view);
    const l = Math.hypot(next[0], next[1], next[2]);
    assert.ok(Math.abs(l - 1) < 0.01, "a unit direction");
    assert.ok(next[1] >= 0 && next[1] <= 0.7, "never under the rock nor on its crown");
    assert.ok(next[0] * view.x + next[2] * view.z >= 0.6 * Math.hypot(next[0], next[2]), "on the side the close-up sees");
    const pl = Math.hypot(at[0], at[1], at[2]);
    const ang = Math.acos(Math.max(-1, Math.min(1, (next[0] * at[0] + next[1] * at[1] + next[2] * at[2]) / (l * pl))));
    assert.ok(ang < 1.9, "a step along the rock, never across it");
    at = next;
  }
  assert.equal(chaseBonus(0), 1);
  assert.ok(Math.abs(chaseBonus(3) - (1 + 3 * CHASE_STEP)) < 1e-9);
  assert.equal(chaseBonus(99), chaseBonus(CHASE_MAX));
});
