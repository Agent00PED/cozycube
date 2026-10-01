// The caverns' economy against the river's (docs/caverns-roadmap.md R2.2): `npm test`. The caverns
// pay more than the river on tools of the same tier, but not so much that they buy out the game.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FISH, rollFish } from "../shared/fishing";
import { ORE_PRICES } from "../shared/economy";
import { FORGE_RECIPES, GEODE_ODDS, INGOT_IDS, ORE_ITEMS } from "../shared/caverns_mining";

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Expected coins a minute on a hand-reeled line: a catch's worth over its bite, a 9 s reel and 4 s
 *  between. */
function perMinute(water: "freshwater" | "cavewater", rodTier: number, time?: "day" | "night") {
  const rand = seeded(rodTier * 31 + (water === "cavewater" ? 7 : 3));
  let coins = 0;
  let secs = 0;
  const N = 20_000;
  for (let i = 0; i < N; i++) {
    const id = rollFish(water, { rodTier, afk: false, time }, rand);
    const f = FISH[id] as { value: number; bite: readonly [number, number] };
    coins += f.value;
    secs += (f.bite[0] + f.bite[1]) / 2 + 13;
  }
  return (coins / secs) * 60;
}

test("the cenote pays 1.6-3.2x the river on the same rod (T1-T3)", () => {
  for (const tier of [1, 2, 3]) {
    const river = perMinute("freshwater", tier, "day");
    const cave = perMinute("cavewater", tier);
    const ratio = cave / river;
    assert.ok(ratio >= 1.6 && ratio <= 3.2, `rod T${tier}: cenote ${cave.toFixed(0)} vs river ${river.toFixed(0)} coins a minute (x${ratio.toFixed(2)})`);
  }
});

test("every ingot is worth its ores and coal, by 10-25%", () => {
  for (const id of INGOT_IDS) {
    const cost = Object.entries(FORGE_RECIPES[id]).reduce((a, [ore, n]) => a + (ORE_PRICES as Record<string, number>)[ore] * (n ?? 0), 0);
    const margin = ORE_PRICES[id] / cost - 1;
    assert.ok(margin >= 0.1 && margin <= 0.25, `${id}: ${ORE_PRICES[id]} for ${cost} of makings (${(margin * 100).toFixed(0)}%)`);
  }
});

test("an uncracked geode sells for a fair share of what cracking one pays (never a trap, never better)", () => {
  for (const geode of ["mystery_geode", "pristine_geode"] as const) {
    const ev = Object.entries(GEODE_ODDS[geode]).reduce((a, [gem, p]) => a + ORE_ITEMS[gem as keyof typeof ORE_ITEMS].price * p, 0);
    const raw = ORE_ITEMS[geode].price;
    assert.ok(raw >= 0.55 * ev && raw < ev, `${geode}: ${raw} uncracked against ${ev.toFixed(0)} cracked rough`);
  }
});

test("the stream's catch: the cave's fish, never a legendary or a mythic", () => {
  const rand = seeded(99);
  for (let i = 0; i < 5000; i++) {
    const id = rollFish("cavewater", { rodTier: 5, afk: false, shallow: true }, rand);
    const tier = (FISH[id] as { tier: string }).tier;
    assert.ok(tier !== "legendary" && tier !== "mythic", `${id} (${tier}) up the stream`);
  }
});
