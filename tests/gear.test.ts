// The accessories' rules (docs/economy-plan.md section 9, shared/gear.ts): `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makingsMissing, spendMakings } from "../shared/expedition";
import { sanitizeFishingProfile, livewellCap, carrierCap } from "../shared/fishing";
import {
  ATTUNE_GAP_S,
  GEAR,
  GEAR_FAMILIES,
  GEAR_IDS,
  GEAR_SLOTS,
  MAX_RANK,
  RANK_ATTUNE,
  STRENGTH,
  TRIALS,
  biteHaste,
  feltRingSlow,
  gearOfFamily,
  gearPace,
  goldStarBonus,
  hasCompass,
  heftBonus,
  newGearRun,
  noCeiling,
  rankLacks,
  rankStep,
  reportDeed,
  sellBonus,
  tensionCut,
  tensionWindowBonus,
  wearGear,
  RING_BANDS,
  bonusLogChance,
  bonusOreChance,
  byproductBonus,
  fitRings,
  gearRareLuck,
  gemPower,
  geodeFind,
  isRingId,
  kingBonus,
  masterworkBonus,
  ringMakings,
  ringName,
  swingHaste,
  wearRing,
  type GearId,
  type RingId,
} from "../shared/gear";
import { craftOdds } from "../shared/crafting";
import { PROFILE_VERSION } from "../shared/migrate";

const fresh = (extra: Record<string, unknown> = {}) => sanitizeFishingProfile({ v: PROFILE_VERSION, ...extra });
const own = (ids: GearId[], rank = 1) => fresh({ gear: ids, worn: ids, gearRank: Object.fromEntries(ids.map((id) => [id, rank])) });

test("sixteen pieces: four families, one piece a slot in each", () => {
  assert.equal(GEAR_IDS.length, 16);
  for (const family of GEAR_FAMILIES) assert.deepEqual(gearOfFamily(family).map((id) => GEAR[id].slot), GEAR_SLOTS);
});

test("a piece's strength grows with its rank; its second trait wakes at rank 3; nothing works unworn", () => {
  for (let r = 1; r <= MAX_RANK; r++) assert.equal(tensionCut(own(["ang_gloves"], r)), STRENGTH[r]);
  assert.equal(tensionWindowBonus(own(["ang_gloves"], 2)), 0);
  assert.equal(tensionWindowBonus(own(["ang_gloves"], 3)), 0.2);
  const off = fresh({ gear: ["ang_gloves"], worn: [], gearRank: { ang_gloves: 5 } });
  assert.equal(tensionCut(off), 0);
  assert.equal(heftBonus(own(["ang_creel"], 5)), 0.2);
  assert.equal(goldStarBonus(own(["ang_creel"], 3)), 0.15);
  assert.equal(livewellCap(own(["ang_holster", "way_pack"], 5)), 12 + 8 + 3);
  assert.equal(carrierCap(own(["for_belt"], 1)), 15 + 3);
  assert.ok(Math.abs(sellBonus(own(["way_mitts"], 5)) - 1.05) < 1e-9);
});

test("one piece a slot: a second pair of gloves takes the first one's place", () => {
  const { worn, removed } = wearGear(["ang_gloves", "ang_bell"], "for_gloves");
  assert.deepEqual(worn, ["ang_bell", "for_gloves"]);
  assert.deepEqual(removed, ["ang_gloves"]);
});

test("the set bonuses: two worn pieces of a family, and all four", () => {
  assert.equal(biteHaste(own(["ang_gloves"])), 1);
  assert.equal(biteHaste(own(["ang_gloves", "ang_bell"])), 1.1);
  assert.equal(hasCompass(own(["for_gloves", "for_belt", "for_sprout"])), false);
  assert.equal(hasCompass(own(gearOfFamily("forester"))), true);
  assert.equal(noCeiling(own(gearOfFamily("wayfarer"))), true);
  assert.ok(Math.abs(gearPace(own(["way_sash", "way_mitts"], 5)) - 1.17) < 1e-9);
  assert.equal(feltRingSlow(own(gearOfFamily("angler"))), 0);
});

test("attunement is active play: a deed counts the seconds since the last, a pause only so much", () => {
  const p = own(["ang_gloves", "way_sash", "for_gloves"]);
  // (three hands pieces can't all be worn: the gloves' slot keeps the last)
  assert.deepEqual(p.worn.sort(), ["for_gloves", "way_sash"]);
  const q = own(["ang_gloves", "way_sash"]);
  const run = newGearRun();
  let now = 1_000_000;
  reportDeed(q, run, { kind: "catch", tier: "common", stars: 1 }, now);
  now += 20_000;
  reportDeed(q, run, { kind: "catch", tier: "common", stars: 1 }, now);
  assert.equal(q.attune.ang_gloves, 10 + 20);
  assert.equal(q.attune.way_sash, 10 + 20);
  now += 10 * 60_000;
  reportDeed(q, run, { kind: "catch", tier: "common", stars: 1 }, now);
  assert.equal(q.attune.ang_gloves, 30 + ATTUNE_GAP_S);
  // (a felling deed does nothing for the Angler's gloves, but the Wayfarer's sash counts every craft)
  reportDeed(q, run, { kind: "swing", tree: "t", verdict: "hit" }, now);
  assert.equal(q.attune.ang_gloves, 30 + ATTUNE_GAP_S);
  assert.equal(q.attune.way_sash, 30 + ATTUNE_GAP_S + 10);
  // (a miss earns nothing)
  reportDeed(q, run, { kind: "swing", tree: "t", verdict: "miss" }, now + 5000);
  assert.equal(q.attune.way_sash, 30 + ATTUNE_GAP_S + 10);
});

test("a piece bought late catches up at double rate", () => {
  const p = fresh({ gear: ["ang_gloves", "ang_bell"], worn: ["ang_gloves", "ang_bell"], gearRank: { ang_gloves: 3, ang_bell: 1 } });
  const run = newGearRun();
  reportDeed(p, run, { kind: "catch", tier: "common", stars: 1 }, 1000);
  reportDeed(p, run, { kind: "catch", tier: "common", stars: 1 }, 31_000);
  assert.equal(p.attune.ang_gloves, 10 + 30);
  assert.equal(p.attune.ang_bell, 2 * (10 + 30));
});

test("trials: each of the two on offer passes, only with a piece of the family on, once", () => {
  for (const family of GEAR_FAMILIES) for (const rank of [3, 4, 5] as const) assert.equal(TRIALS[family][rank].length, 2);
  // the Angler's rank 3 by skill: eight fish in a row
  const p = own(["ang_gloves"]);
  const run = newGearRun();
  let passed: string[] = [];
  for (let i = 0; i < 7; i++) passed = reportDeed(p, run, { kind: "catch", tier: "common", stars: 1 }, 1000 * i);
  assert.deepEqual(passed, []);
  reportDeed(p, run, { kind: "lost", boss: false }, 8000);
  for (let i = 0; i < 8; i++) passed = reportDeed(p, run, { kind: "catch", tier: "common", stars: 1 }, 9000 + 1000 * i);
  assert.deepEqual(passed, ["angler3"]);
  assert.deepEqual(reportDeed(p, run, { kind: "catch", tier: "rare", stars: 1 }, 99_000), []);
  // by luck: a legendary is rank 4, a mythic ranks 4 and 5 at once
  assert.deepEqual(reportDeed(p, run, { kind: "catch", tier: "legendary", stars: 1 }, 100_000), ["angler4"]);
  assert.deepEqual(reportDeed(p, run, { kind: "catch", tier: "mythic", stars: 1 }, 101_000), ["angler5"]);
  // no piece of the family on: nothing passes
  const bare = fresh();
  assert.deepEqual(reportDeed(bare, newGearRun(), { kind: "catch", tier: "mythic", stars: 3 }, 1), []);
  // the Forester's: a tree all on gold; a maple all on gold; a knot spoils the elderwood
  const f = own(["for_gloves"]);
  const fr = newGearRun();
  reportDeed(f, fr, { kind: "swing", tree: "a", verdict: "gold" }, 1);
  reportDeed(f, fr, { kind: "swing", tree: "a", verdict: "gold" }, 2);
  assert.deepEqual(reportDeed(f, fr, { kind: "felled", tree: "a", treeKind: "maple" }, 3), ["forester3", "forester4"]);
  reportDeed(f, fr, { kind: "swing", tree: "e", verdict: "knot" }, 4);
  reportDeed(f, fr, { kind: "swing", tree: "e", verdict: "hit" }, 5);
  assert.deepEqual(reportDeed(f, fr, { kind: "felled", tree: "e", treeKind: "elderwood" }, 6), []);
  reportDeed(f, fr, { kind: "colossal" }, 7);
  reportDeed(f, fr, { kind: "colossal" }, 8);
  assert.deepEqual(reportDeed(f, fr, { kind: "colossal" }, 9), ["forester5"]);
  // the Prospector's
  const m = own(["pro_guards"]);
  assert.deepEqual(reportDeed(m, newGearRun(), { kind: "strike", landed: true, chase: 5, streak: 2, glint: false }, 1), ["prospector3"]);
  assert.deepEqual(reportDeed(m, newGearRun(), { kind: "broke", ore: "glimmer", clean: true, motherlode: true }, 2), ["prospector4", "prospector5"]);
  // the Wayfarer's: all three maps in a day; all six keepers and a Masterwork
  const w = own(["way_sash"]);
  const wr = newGearRun();
  const day = 86_400_000 * 20_000;
  assert.deepEqual(reportDeed(w, wr, { kind: "sale", counter: 0, keeper: 0, masterwork: false }, day + 1), []);
  assert.deepEqual(reportDeed(w, wr, { kind: "sale", counter: 1, keeper: 2, masterwork: false }, day + 2), []);
  assert.deepEqual(reportDeed(w, wr, { kind: "sale", counter: 2, keeper: 5, masterwork: true }, day + 3), ["wayfarer3"]);
  for (const [counter, keeper] of [[0, 1], [1, 3]] as const) reportDeed(w, wr, { kind: "sale", counter, keeper, masterwork: false }, day + 4);
  assert.deepEqual(reportDeed(w, wr, { kind: "sale", counter: 2, keeper: 4, masterwork: false }, day + 5), ["wayfarer5"]);
  // (a new day starts the count again)
  const w2 = own(["way_sash"]);
  reportDeed(w2, wr, { kind: "sale", counter: 0, keeper: 0, masterwork: false }, day + 1);
  reportDeed(w2, wr, { kind: "sale", counter: 1, keeper: 2, masterwork: false }, day + 2);
  assert.deepEqual(reportDeed(w2, wr, { kind: "sale", counter: 2, keeper: 5, masterwork: false }, day + 86_400_000 + 3), []);
  assert.deepEqual(reportDeed(w2, wr, { kind: "weekly" }, day), ["wayfarer4"]);
});

test("a rank is earned: attunement, from rank 3 a trial, the makings and a fee; coins alone raise nothing", () => {
  const p = own(["ang_gloves"]);
  assert.equal(rankStep("ang_gloves", 2).attune, 20 * 60);
  assert.equal(rankStep("pro_guards", 1).place, "gus");
  assert.equal(rankStep("ang_gloves", 4).place, "bench");
  let at = rankLacks(p, "ang_gloves", 1_000_000);
  assert.equal(at.step?.rank, 2);
  assert.equal(at.lacks.length, 1);
  p.attune.ang_gloves = RANK_ATTUNE[2];
  assert.deepEqual(rankLacks(p, "ang_gloves", 1_000_000).lacks, []);
  assert.deepEqual(makingsMissing(p, at.step!.needs), ["10 Fish Scales"]);
  p.byproducts.scales = 10;
  spendMakings(p, at.step!.needs);
  assert.equal(p.byproducts.scales ?? 0, 0);
  p.gearRank.ang_gloves = 2;
  p.attune.ang_gloves = RANK_ATTUNE[3];
  at = rankLacks(p, "ang_gloves", 1_000_000);
  assert.deepEqual(at.lacks, ["its trial"]);
  p.trials.push("angler3");
  assert.deepEqual(rankLacks(p, "ang_gloves", 1_000_000).lacks, []);
  p.gearRank.ang_gloves = MAX_RANK;
  assert.equal(rankLacks(p, "ang_gloves", 0).step, null);
});

test("the old gear is paid back in full (shared/migrate.ts v7): coins for the shops', materials for the relics", () => {
  const p = sanitizeFishingProfile({
    v: 6,
    gear: ["wader_gloves", "lucky_bell", "carved_belt", "knuckle_guards", "lodestone_pendant"],
    worn: ["wader_gloves", "lucky_bell", "carved_belt", "knuckle_guards"],
    satchelContents: [{ id: "iron_ingot", n: 1 }],
  });
  assert.equal(p.v, PROFILE_VERSION);
  assert.deepEqual(p.gear, []);
  assert.deepEqual(p.worn, []);
  assert.equal(p.owed, 450 + 1900);
  // the Carved Lumberjack Belt: 6 cedar and 8 resin; the forge's two: 4 iron ingots and 6 dust, 2 silver ingots and 3 glimmer shards
  assert.equal(p.wood.cedar, 6);
  assert.equal(p.resin, 8);
  assert.equal(p.satchelContents.find((s) => s.id === "iron_ingot")?.n, 5);
  assert.equal(p.satchelContents.find((s) => s.id === "silver_ingot")?.n, 2);
  assert.equal(p.satchelContents.find((s) => s.id === "glimmer_shard")?.n, 3);
  assert.equal(p.byproducts.stoneDust, 6);
  assert.equal(p.mail.length, 1);
  // (and a profile that never had any is told nothing, owed nothing)
  const q = sanitizeFishingProfile({ v: 6 });
  assert.equal(q.owed, 0);
  assert.equal(q.mail.length, 0);
  // (once migrated, the new ids are kept as they are)
  const again = sanitizeFishingProfile({ v: PROFILE_VERSION, gear: ["ang_gloves"], worn: ["ang_gloves"], gearRank: { ang_gloves: 9 }, attune: { ang_gloves: 123.4 }, trials: ["angler3", "bogus!"], deeds: { colossals: 2 } });
  assert.deepEqual(again.gear, ["ang_gloves"]);
  assert.equal(again.gearRank.ang_gloves, MAX_RANK);
  assert.equal(again.attune.ang_gloves, 123.4);
  assert.deepEqual(again.trials, ["angler3"]);
  assert.equal(again.deeds.colossals, 2);
});

test("rings: a band's strength, a gem's power; the same gem twice counts once and a half", () => {
  const worn = (ringsWorn: RingId[]) => fresh({ rings: ringsWorn, ringsWorn });
  assert.equal(isRingId("silver:opal"), true);
  assert.equal(isRingId("gold:opal"), false);
  assert.equal(isRingId("silver:opal:x"), false);
  assert.equal(ringName("glimmer:star_shard"), "Glimmer-set Star Shard Ring");
  assert.deepEqual(ringMakings("glimmer:topaz"), { ore: { silver_ingot: 3, glimmer_shard: 3, topaz: 1 } });
  assert.equal(gemPower(worn(["copper:amethyst"]), "amethyst"), RING_BANDS.copper.strength);
  assert.ok(Math.abs(gemPower(worn(["copper:amethyst", "silver:amethyst"]), "amethyst") - (0.1 + 0.02)) < 1e-9);
  // Luck, Tempo, Bounty, Fortune, each for whichever craft is in hand
  const luck = worn(["silver:amethyst"]);
  assert.deepEqual([gearRareLuck(luck), byproductBonus(luck), geodeFind(luck)], [0.1, 0.1, 0.05]);
  const tempo = worn(["iron:topaz"]);
  assert.ok(Math.abs(biteHaste(tempo) - 1.07) < 1e-9 && Math.abs(feltRingSlow(tempo) - 0.07) < 1e-9 && Math.abs(swingHaste(tempo) - 1.07) < 1e-9);
  const bounty = worn(["glimmer:opal"]);
  assert.deepEqual([bonusLogChance(bounty), bonusOreChance(bounty), heftBonus(bounty)], [0.13, 0.13, 0.13]);
  const fortune = worn(["silver:star_shard"]);
  assert.equal(masterworkBonus(fortune), 0.1);
  assert.equal(kingBonus(fortune), 0.025);
  // (a ring owned but off does nothing; a ring stacks with a piece)
  assert.equal(gearRareLuck(fresh({ rings: ["silver:amethyst"], ringsWorn: [] })), 0);
  const both = fresh({ gear: ["ang_bell"], worn: ["ang_bell"], gearRank: { ang_bell: 5 }, rings: ["silver:amethyst"], ringsWorn: ["silver:amethyst"] });
  assert.ok(Math.abs(gearRareLuck(both) - 0.3) < 1e-9);
});

test("two fingers: a third ring takes the oldest one's place, a second Star Shard the first one's", () => {
  assert.deepEqual(wearRing(["copper:amethyst", "iron:topaz"], "silver:opal"), { worn: ["iron:topaz", "silver:opal"], removed: ["copper:amethyst"] });
  assert.deepEqual(wearRing(["copper:star_shard", "iron:topaz"], "silver:star_shard"), { worn: ["iron:topaz", "silver:star_shard"], removed: ["copper:star_shard"] });
  assert.deepEqual(fitRings(["copper:star_shard", "silver:star_shard", "iron:topaz", "copper:opal"], ["copper:star_shard", "silver:star_shard", "iron:topaz"]), ["silver:star_shard", "iron:topaz"]);
  const p = sanitizeFishingProfile({ v: PROFILE_VERSION, rings: ["copper:opal", "nope", "copper:opal"], ringsWorn: ["copper:opal", "silver:opal"] });
  assert.deepEqual(p.rings, ["copper:opal"]);
  assert.deepEqual(p.ringsWorn, ["copper:opal"]);
});

test("Fortune moves the workbench's plain outcomes toward a Masterwork", () => {
  const plain = craftOdds("birch_stool", "push");
  const lucky = craftOdds("birch_stool", "push", "", 0.1);
  assert.ok(Math.abs(lucky.masterwork - plain.masterwork - Math.min(plain.normal, 0.1)) < 1e-9);
  assert.equal(lucky.breakChance, plain.breakChance);
  assert.ok(Math.abs(lucky.normal + lucky.masterwork + lucky.breakChance - 1) < 1e-9);
});
