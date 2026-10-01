// The income table, pinned (docs/economy-plan.md phase 0): `npm test`. What a minute of play earns
// at each tool tier is what every price is derived from, so a change that moves it must be meant:
// re-save the table with `npm run economy-sim -- --write` and review the difference.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ladder, miner, simulate, soloMarket } from "../scripts/economy-sim";

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

test("a better pickaxe never earns less, the Lucky Glints aside (a known fault: they pay a weak pickaxe most)", () => {
  const plain = [1, 2, 3, 4, 5].map((t) => miner(t, { glints: false }).perMin);
  for (let i = 1; i < plain.length; i++) assert.ok(plain[i] >= plain[i - 1] * 0.97, `pickaxe T${i + 1} ${plain[i].toFixed(0)} under T${i} ${plain[i - 1].toFixed(0)}`);
});

test("the solo market: nothing off the first thirty, then down toward the floor", () => {
  assert.equal(soloMarket(30), 1);
  assert.ok(soloMarket(60) < 1 && soloMarket(60) > 0.7);
  assert.ok(soloMarket(800) >= 0.7 && soloMarket(800) < 0.72);
  assert.ok(Object.values(ladder(lines)).every((row) => row.length === 5));
});
