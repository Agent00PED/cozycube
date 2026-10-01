// The income table, pinned (docs/economy-plan.md phase 0): `npm test`. What a minute of play earns
// at each tool tier is what every price is derived from, so a change that moves it must be meant:
// re-save the table with `npm run economy-sim -- --write` and review the difference.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CENOTE_OVER_RIVER, ladder, miner, simulate, soldLadder, soloMarket, TARGETS, TOOL_MINUTES, TOOL_PRICES } from "../scripts/economy-sim";
import { CARRIER_PRICES, CREEL_PRICES } from "../shared/economy";
import { FORGED_TOOLS, FORGED_TOOL_IDS, forgedBlocked, forgedOwned, grantForged, makingsMissing, spendMakings } from "../shared/expedition";
import { FISH, sanitizeFishingProfile } from "../shared/fishing";
import { PROFILE_VERSION } from "../shared/migrate";

const lines = simulate();
const baseline = JSON.parse(readFileSync("tests/economy-baseline.json", "utf8")) as { lines: { craft: string; tier: number; where: string; perMin: number; perMinSold: number }[] };

test("the income table is the one on record (re-save it on purpose: npm run economy-sim -- --write)", () => {
  assert.equal(lines.length, baseline.lines.length);
  for (const b of baseline.lines) {
    const l = lines.find((x) => x.craft === b.craft && x.tier === b.tier && x.where === b.where);
    assert.ok(l, `${b.craft} T${b.tier} ${b.where} is simulated`);
    assert.ok(Math.abs(l.perMin - b.perMin) <= Math.max(0.5, b.perMin * 0.01), `${b.craft} T${b.tier} ${b.where}: ${l.perMin.toFixed(1)} coins a minute, on record ${b.perMin}`);
  }
});

test("a better rod or axe never earns less at the same spot", () => {
  for (const craft of ["fish", "wood"]) {
    for (const where of new Set(lines.filter((l) => l.craft === craft).map((l) => l.where))) {
      const at = lines.filter((l) => l.craft === craft && l.where === where).sort((a, b) => a.tier - b.tier);
      // (the campfire's pines are all an axe finds there: a better axe changes nothing, within noise)
      for (let i = 1; i < at.length; i++) assert.ok(at[i].perMin >= at[i - 1].perMin * 0.93, `${craft} at ${where}: T${at[i].tier} ${at[i].perMin.toFixed(0)} under T${at[i - 1].tier} ${at[i - 1].perMin.toFixed(0)}`);
    }
  }
});

test("a better pickaxe never earns less, Lucky Glints and all (one a rock: phase 1)", () => {
  for (const glints of [true, false]) {
    const row = [1, 2, 3, 4, 5].map((t) => miner(t, { glints }).perMin);
    for (let i = 1; i < row.length; i++) assert.ok(row[i] >= row[i - 1] * 0.97, `pickaxe T${i + 1} ${row[i].toFixed(0)} under T${i} ${row[i - 1].toFixed(0)}`);
  }
});

test("every tool tier earns its target as sold, within a fifth (docs/economy-plan.md section 4)", () => {
  const sold = soldLadder(lines);
  for (const craft of ["river", "wood", "ore"] as const) {
    sold[craft].forEach((v, i) => assert.ok(Math.abs(v / TARGETS[craft][i] - 1) <= 0.2, `${craft} T${i + 1}: ${v.toFixed(0)} a minute, target ${TARGETS[craft][i]}`));
  }
  // the river and the woods pay alike on tools of a tier; the cenote about CENOTE_OVER_RIVER times the river
  sold.river.forEach((v, i) => assert.ok(Math.abs(sold.wood[i] / v - 1) <= 0.2, `T${i + 1}: wood ${sold.wood[i].toFixed(0)} against the river's ${v.toFixed(0)}`));
  sold.cenote.forEach((v, i) => assert.ok(Math.abs(v / sold.river[i] / CENOTE_OVER_RIVER - 1) <= 0.15, `T${i + 1}: the cenote ${(v / sold.river[i]).toFixed(2)}x the river`));
});

test("the rebalance pays the difference on what was held (shared/migrate.ts v5)", () => {
  const stored = {
    v: 4,
    creel: [{ s: "salmon", cm: FISH.salmon.cm[0], q: 1 }, { s: "minnow", cm: FISH.minnow.cm[0], q: 1 }],
    wood: { pine: 10, maple: 2 },
    woodValue: { pine: 10, maple: 2 },
    firewood: 4,
    satchelTier: 0,
    satchelContents: [{ id: "star_shard", n: 1 }, { id: "coal", n: 5 }],
    crafts: [{ c: "birch_stool", m: false }],
  };
  const p = sanitizeFishingProfile(stored);
  assert.equal(p.v, PROFILE_VERSION);
  // 10 pine x (4 - 2), 2 maple x (48 - 18), a small salmon (0.8 x 70 against 0.8 x 50), a star shard,
  // four bundles at 1.5 each, a stool (60 - 28); the minnow and the coal never moved
  assert.equal(p.owed, 20 + 60 + 16 + 300 + 6 + 32);
  assert.ok(p.mail.some((m) => m.includes(p.owed.toLocaleString("en-US"))));
  // a profile already there is owed nothing more
  const again = sanitizeFishingProfile(JSON.parse(JSON.stringify(p)));
  assert.equal(again.owed, p.owed);
  assert.equal(sanitizeFishingProfile({ v: 4 }).owed, 0);
  assert.equal(sanitizeFishingProfile({ v: 4 }).mail.length, 0);
});

test("the solo market: nothing off the first thirty, then down toward the floor", () => {
  assert.equal(soloMarket(30), 1);
  assert.ok(soloMarket(60) < 1 && soloMarket(60) > 0.7);
  assert.ok(soloMarket(800) >= 0.7 && soloMarket(800) < 0.72);
  assert.ok(Object.values(ladder(lines)).every((row) => row.length === 5));
});

test("a tool costs its minutes of the step before it, storage half its tool (docs/economy-plan.md section 6)", () => {
  const income = { rod: TARGETS.river, axe: TARGETS.wood, pickaxe: TARGETS.ore };
  for (const craft of ["rod", "axe", "pickaxe"] as const) {
    TOOL_PRICES[craft].forEach((price, i) => {
      const minutes = price / income[craft][i];
      assert.ok(Math.abs(minutes / TOOL_MINUTES[craft][i] - 1) <= 0.1, `${craft} T${i + 2}: ${minutes.toFixed(0)} minutes, meant ${TOOL_MINUTES[craft][i]}`);
    });
  }
  TOOL_PRICES.rod.forEach((price, i) => {
    assert.equal(CREEL_PRICES[i + 1], price / 2);
    assert.equal(CARRIER_PRICES[i + 1], price / 2);
  });
});

test("the Expedition tools are forged: coins, ingots and the craft's own makings, once each", () => {
  for (const id of FORGED_TOOL_IDS) assert.ok(Object.keys(FORGED_TOOLS[id].needs.ore ?? {}).length > 0, `${id} takes something from the caverns`);
  const p = sanitizeFishingProfile({ v: PROFILE_VERSION, satchelTier: 3, satchelContents: [{ id: "iron_ingot_mw", n: 9 }], byproducts: { fishBone: 4, scales: 12 }, creelTier: 3 });
  assert.equal(forgedOwned(p, "rod"), false);
  assert.deepEqual(makingsMissing(p, FORGED_TOOLS.rod.needs), []);
  assert.deepEqual(makingsMissing(p, FORGED_TOOLS.axe.needs), ["6 Golden Leaf Amber"]);
  spendMakings(p, FORGED_TOOLS.rod.needs);
  grantForged(p, "rod");
  assert.equal(p.rod, "moonlight");
  assert.equal(forgedOwned(p, "rod"), true);
  assert.equal(p.byproducts.fishBone ?? 0, 0);
  // (a Masterwork ingot stood in for a plain one: three are left, enough for the livewell)
  assert.ok(forgedBlocked(p, "livewell"), "the tier-4 livewell comes first");
  p.creelTier = 4;
  assert.equal(forgedBlocked(p, "livewell"), null);
  assert.deepEqual(makingsMissing(p, FORGED_TOOLS.livewell.needs), []);
  grantForged(p, "livewell");
  assert.equal(p.slots, 60);
});

test("the cheaper satchels pay their owners the difference (shared/migrate.ts v6)", () => {
  const p = sanitizeFishingProfile({ v: 5, satchelTier: 3, caveAccess: true });
  assert.equal(p.owed, 300 + 1900);
  assert.equal(sanitizeFishingProfile({ v: 5, satchelTier: 5 }).owed, 300 + 1900 + 5250 + 16250);
  assert.equal(sanitizeFishingProfile({ v: 5 }).owed, 0);
  assert.equal(sanitizeFishingProfile({ v: 5 }).mail.length, 0);
  assert.equal(p.mail.length, 1);
});
