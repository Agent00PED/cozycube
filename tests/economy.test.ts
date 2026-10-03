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

// --- phase 5: things to make and sell (docs/economy-plan.md section 10) ---------------------------------
import { readFileSync as readFile5 } from "node:fs";
import { BENCH_IDS as BENCH5, CRAFTS as CRAFTS5 } from "../shared/crafting";
import { BYPRODUCT_PRICES as BY5, FIREWOOD_PRICE as FW5, ORE_PRICES as ORE5, RESIN_BUY_PRICE as RESIN5, WOOD_PRICES as WOOD5 } from "../shared/economy";
import { FORGE_WARES as WARES5, ORE_ITEMS as ITEMS5, WARE_IDS as WARE_IDS5 } from "../shared/caverns_mining";
import { OUTFITS as OUTFITS5, OUTFIT_FABRICS as FABRICS5, PANTS_COLORS as PANTS5, SHIRT_COLORS as SHIRTS5 } from "../shared/types";

test("the forge's wares: each a sixth to a quarter over its makings' worth", () => {
  for (const id of WARE_IDS5) {
    const makings = Object.entries(WARES5[id]).reduce((sum, [k, n]) => sum + (ORE5 as Record<string, number>)[k] * (n as number), 0);
    const over = ITEMS5[id].price / makings - 1;
    assert.ok(over >= 0.15 && over <= 0.25, `${id}: ${ITEMS5[id].price} against makings worth ${makings} (${Math.round(over * 100)}%)`);
    assert.equal(ITEMS5[id].cat, "ware");
  }
});

test("the workbench's new goods: a little over their makings; the fine ones only at the woods' bench", () => {
  // (a log at the average tree's size, 1.2x; Pine Resin at what Buster pays)
  const worth = (id: keyof typeof CRAFTS5) => {
    const n = CRAFTS5[id].needs;
    let sum = (n.firewood ?? 0) * FW5 + (n.resin ?? 0) * RESIN5;
    for (const [k, c] of Object.entries(n.wood ?? {})) sum += (WOOD5 as Record<string, number>)[k] * 1.2 * (c as number);
    for (const [k, c] of Object.entries(n.byproducts ?? {})) sum += (BY5 as Record<string, number>)[k] * (c as number);
    return sum;
  };
  for (const id of ["kindling_crate", "plank_bundle", "birch_tray", "otter_figurine", "music_box"] as const) {
    const over = CRAFTS5[id].price / worth(id) - 1;
    assert.ok(over >= 0.15 && over <= 0.3, `${id}: ${CRAFTS5[id].price} against makings worth ${worth(id).toFixed(1)} (${Math.round(over * 100)}%)`);
    assert.ok(BENCH5.includes(id));
  }
  const fine = BENCH5.filter((id) => CRAFTS5[id].advanced);
  assert.deepEqual([...fine].sort(), ["autumn_chair", "elder_clock", "keepsake_box", "music_box", "otter_figurine"]);
  for (const id of ["kindling_crate", "plank_bundle", "birch_tray", "birch_stool"] as const) assert.ok(!CRAFTS5[id].advanced, `${id} is carved at either bench`);
});

test("the maps' own outfits: a keeper each, fabrics off the palettes, parts the avatar has", () => {
  const rig = readFile5("client/src/entities/rig.ts", "utf8");
  for (const [id, keeper] of [["outfit_forester", "bramble"], ["outfit_miner", "gus"]] as const) {
    assert.equal(OUTFITS5[id].keeper, keeper);
    assert.ok(OUTFITS5[id].price > 0);
    assert.ok(SHIRTS5.includes(FABRICS5[id].shirt) && PANTS5.includes(FABRICS5[id].pants), `${id}'s fabrics are palette colours`);
    assert.ok(new RegExp(`${id}: \{ top: "[a-z]+", bottom: "[a-z]+" \}`).test(rig), `${id} has its parts in rig.ts`);
  }
  assert.equal(Object.values(OUTFITS5).filter((o) => o.keeper).length, 2);
});

// --- the odds by water (shared/economy.ts WATER_ODDS) ---------------------------------------------------
import { WATER_ODDS as ODDS6 } from "../shared/economy";
import { HIDDEN_MAPS as HIDDEN6, MAP_IDS as MAPS6, isGatheringMap as gathering6 } from "../shared/types";

test("the odds by water: each row whole, a better rod never poorer, deeper water never kinder", () => {
  const fine = (o: (typeof ODDS6)["campfire"][number]) => o.rare + o.legendary + o.mythic;
  for (const [water, rows] of Object.entries(ODDS6)) {
    assert.equal(rows.length, 7, `${water} has a row for every tier, T1 to T7`);
    rows.forEach((o, i) => {
      assert.ok(Math.abs(o.common + o.uncommon + o.rare + o.legendary + o.mythic - 1) < 1e-9, `${water} T${i + 1} adds up to 1`);
      if (i > 0) {
        assert.ok(o.common <= rows[i - 1].common, `${water} T${i + 1}: fewer commons than T${i}`);
        assert.ok(fine(o) >= fine(rows[i - 1]), `${water} T${i + 1}: no fewer fine fish than T${i}`);
      }
    });
  }
  // (the same rod: the campfire the kindest, then the woods, then the cenote)
  for (let i = 0; i < 7; i++) {
    assert.ok(ODDS6.campfire[i].common <= ODDS6.woods[i].common && ODDS6.woods[i].common <= ODDS6.cenote[i].common, `T${i + 1}: commons grow with depth`);
    assert.ok(ODDS6.campfire[i].rare >= ODDS6.woods[i].rare && ODDS6.woods[i].rare >= ODDS6.cenote[i].rare, `T${i + 1}: rare fish thin with depth`);
    assert.equal(ODDS6.campfire[i].legendary + ODDS6.campfire[i].mythic, 0, "nothing above rare swims at the campfire");
  }
});

test("the beach's two maps are registered, hidden from the world list, and gathered in", () => {
  for (const id of ["open_sea", "hidden_cove"] as const) {
    assert.ok(MAPS6.includes(id) && HIDDEN6.has(id) && gathering6(id));
  }
  assert.equal(gathering6("ocean"), false);
});
