// Sunset Beach's rules (docs/beach-design.md): the ground and the water, the seats, and A Shift at the
// Bar (shared/barshift.ts). `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRINKS,
  DRINK_IDS,
  DRINK_PRICE,
  BARTENDER_SHARE,
  POUR_FULL_S,
  POUR_LINE,
  TIPS_PER_HOUR,
  barTitles,
  beatsLanded,
  emptyBarBook,
  judgeBuild,
  judgeDrink,
  judgePour,
  menuOf,
  minShiftMs,
  noteDrink,
  sanitizeBarBook,
  shakeBeats,
  tipFor,
  type Drink,
  type DrinkId,
} from "../shared/barshift";
import { isBlocked, walkY } from "../shared/collision";
import { sanitizeFishingProfile } from "../shared/fishing";
import { MAP_CHAIRS, MAP_TOGGLEABLES } from "../shared/props";
import { BALL_HOME, BALL_RANGE, kickBall, stepBall } from "../shared/volleyball";
import { BALL_COURT, BAR, BEACH_ARRIVAL, PIER, PIER_LENGTH, WADE_DEPTH, at, beachBlocked, beachGroundY, beachWading, onPierAt, shoreD } from "../shared/worlds/beach";
import { TARGETS } from "../scripts/economy-sim";

const perfectLog = (id: DrinkId) => {
  const d = DRINKS[id] as Drink;
  return { picks: [...d.recipe], pourMs: POUR_FULL_S * 1000 * POUR_LINE, taps: shakeBeats(d.band) };
};

test("the beach: sand above the waterline, the shallows waded, deep water closed", () => {
  // (in the coast's frame: metres inland, metres along)
  const dry = at(6, 0);
  const shallow = at(-1.2, 4);
  const deep = at(-9, 4);
  assert.ok(shoreD(dry.x, dry.z) > 5.9 && beachGroundY(dry.x, dry.z) > 0.3);
  assert.ok(!beachBlocked(dry.x, dry.z) && !beachWading(dry.x, dry.z));
  assert.ok(beachWading(shallow.x, shallow.z) && !beachBlocked(shallow.x, shallow.z), "the shallows are waded");
  assert.ok(beachGroundY(shallow.x, shallow.z) > -WADE_DEPTH);
  assert.ok(beachBlocked(deep.x, deep.z) && isBlocked(deep.x, deep.z, "sunset_beach"), "deep water stops you");
  assert.ok(!isBlocked(BEACH_ARRIVAL.x, BEACH_ARRIVAL.z, "sunset_beach"));
});

test("the pier: its deck is walked out over deep water, at the deck's height", () => {
  const end = onPierAt(PIER_LENGTH - 0.8, 0);
  assert.ok(beachGroundY(end.x, end.z) < -WADE_DEPTH, "the pier's head stands over deep water");
  assert.ok(!isBlocked(end.x, end.z, "sunset_beach"));
  assert.equal(walkY("sunset_beach", end.x, end.z), PIER.deck);
  const beside = onPierAt(PIER_LENGTH - 0.8, PIER.headHalf + 1.5);
  assert.ok(isBlocked(beside.x, beside.z, "sunset_beach"));
});

test("the beach's seats and props: six stools, four logs, the loungers, two hammocks; Mango and three stations", () => {
  const seats = MAP_CHAIRS.sunset_beach;
  assert.equal(seats.filter((s) => s.propId.startsWith("seat_bar_")).length, 6);
  assert.equal(seats.filter((s) => s.propId.startsWith("seat_beachfire_")).length, 4);
  assert.equal(seats.filter((s) => s.propId.startsWith("seat_beach_hammock_")).length, 2);
  assert.ok(seats.filter((s) => s.propId.startsWith("seat_lounger_")).every((s) => s.style === "blanket"));
  assert.equal(new Set(seats.map((s) => s.propId)).size, seats.length);
  const props = MAP_TOGGLEABLES.sunset_beach;
  assert.equal(props.filter((p) => p.kind === "barshift").length, 3);
  assert.equal(props.filter((p) => p.kind === "bartender").length, 1);
  assert.equal(BAR.stations.length, 3);
});

test("the ball stays on its flat stretch of sand", () => {
  const ball = { ...BALL_HOME };
  kickBall(ball, 1, 0.3);
  for (let i = 0; i < 2000; i++) stepBall(ball, 1 / 60);
  assert.ok(Math.hypot(ball.x - BALL_COURT.x, ball.z - BALL_COURT.z) <= BALL_RANGE + 1e-6);
  // kicked hard at the rim again and again, it never leaves
  for (let k = 0; k < 20; k++) {
    kickBall(ball, Math.cos(k), Math.sin(k));
    for (let i = 0; i < 240; i++) stepBall(ball, 1 / 60);
    assert.ok(Math.hypot(ball.x - BALL_COURT.x, ball.z - BALL_COURT.z) <= BALL_RANGE + 1e-6);
  }
});

test("a shift at the bar: Perfect with every stage right, Good with two stages' worth, else Sloppy", () => {
  for (const id of DRINK_IDS) {
    const d = DRINKS[id] as Drink;
    const log = perfectLog(id);
    assert.equal(judgeDrink(id, log).grade, "perfect", `${id} made right`);
    // the right things out of order: a half for the build
    assert.equal(judgeBuild(d.recipe, [...d.recipe].reverse()), d.recipe.length > 1 && [...d.recipe].reverse().join() !== d.recipe.join() ? 0.5 : 1);
    assert.equal(judgeDrink(id, { ...log, picks: [...d.recipe].reverse() }).grade, "good");
    // the wrong drink entirely
    assert.equal(judgeDrink(id, { ...log, picks: ["ice"] }).grade, "sloppy");
    // spilt: over the brim
    assert.equal(judgePour(d.band, POUR_FULL_S * 1000 * 1.05), 0);
    assert.equal(judgeDrink(id, { ...log, pourMs: 100, taps: [] }).grade, "sloppy");
    // a beat a quarter-second late misses; four taps on one beat land one
    assert.equal(beatsLanded(d.band, shakeBeats(d.band).map((b) => b + 260)), 0);
    assert.equal(beatsLanded(d.band, [shakeBeats(d.band)[0], shakeBeats(d.band)[0], shakeBeats(d.band)[0], shakeBeats(d.band)[0]]), 1);
    // garbage in: never a throw, never better than Sloppy
    assert.equal(judgeDrink(id, { picks: null as unknown as string[], pourMs: NaN, taps: [Infinity] as number[] }).grade, "sloppy");
    assert.ok(minShiftMs(id) > 3000 && minShiftMs(id) < 9000);
  }
  // a finer drink's pour is a narrower band
  assert.equal(judgePour(1, POUR_FULL_S * 1000 * (POUR_LINE + 0.06)), 1);
  assert.equal(judgePour(3, POUR_FULL_S * 1000 * (POUR_LINE + 0.06)), 0.5);
});

test("the bar is never the best way to earn: an hour's tips are under a fifth of a starter's hour", () => {
  const best = Math.max(...DRINK_IDS.map((id) => tipFor(id, "perfect")));
  assert.ok(TIPS_PER_HOUR * best <= (TARGETS.river[0] * 60) / 5, `${TIPS_PER_HOUR} tipped drinks of ${best} coins an hour`);
  assert.ok(BARTENDER_SHARE < DRINK_PRICE, "a player's order is a small coin sink");
  for (const id of DRINK_IDS) assert.ok(tipFor(id, "sloppy") < tipFor(id, "good") && tipFor(id, "good") < tipFor(id, "perfect"));
});

test("the Bar Book: counts, best stars, the run of Perfects, the titles; kept in the camp profile", () => {
  const book = emptyBarBook();
  assert.deepEqual(barTitles(book, false), []);
  for (const id of menuOf(false)) noteDrink(book, id, "perfect");
  assert.equal(book.streak, menuOf(false).length);
  // (the secret drink is not on the menu: every band's title, but not the master's)
  assert.equal(barTitles(book, false).length, 3);
  noteDrink(book, "sunset_punch", "good");
  assert.equal(book.streak, 0);
  assert.equal(book.made.sunset_punch?.best, 3);
  assert.equal(book.made.sunset_punch?.n, 2);
  noteDrink(book, "midnight_pearl", "perfect");
  assert.equal(barTitles(book, true).length, 4);
  assert.ok(!menuOf(false).includes("midnight_pearl") && menuOf(true).includes("midnight_pearl"));
  // through the profile: sanitized, and an old profile reads as an empty book
  const p = sanitizeFishingProfile({ bar: JSON.parse(JSON.stringify(book)) });
  assert.equal(p.bar.made.midnight_pearl?.best, 3);
  assert.deepEqual(sanitizeFishingProfile({}).bar, emptyBarBook());
  assert.deepEqual(sanitizeBarBook({ made: { nonsense: { n: 5, best: 9 } }, streak: -4, bestStreak: "x" }), emptyBarBook());
});

// --- the salt water (shared/sea_fishing.ts; docs/beach-design.md section 3) ---------------------------
import { FISH as FISH7, gradeOf as gradeOf7, rollFish as rollFish7, type FishId as FishId7, type FishSpecies as Species7 } from "../shared/fishing";
import { SEA_FISH_IDS, SEA_MIN_ROD, zoneOf } from "../shared/sea_fishing";
import { fishRate as fishRate7 } from "../shared/keepers";
import { BOAT, DUNE, DUNE_FRONT, beachCast } from "../shared/worlds/beach";

/** What a rod lands in a salt water, over many casts: the grades seen. */
function grades(where: "pier" | "sea" | "cove", rodTier: number, afk = false, time: "day" | "night" = "day") {
  let seed = 12345 + rodTier * 31 + where.length;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const seen = new Set<string>();
  const ids = new Set<FishId7>();
  for (let i = 0; i < 6000; i++) {
    const id = rollFish7("saltwater", { rodTier, where, time, afk, bait: afk ? "stardrop" : "" }, rand);
    seen.add(gradeOf7(id));
    ids.add(id);
  }
  return { seen, ids };
}

test("the salt water's ladder: T1 to T3 common, T4 uncommon, T5 rare, T6 epic and legendary, the mythic only on T7 in the cove", () => {
  for (const tier of [1, 2, 3]) assert.deepEqual([...grades("pier", tier).seen], ["common"], `a T${tier} rod at the pier`);
  assert.deepEqual([...grades("pier", 4).seen].sort(), ["common", "uncommon"]);
  assert.deepEqual([...grades("pier", 5).seen].sort(), ["common", "rare", "uncommon"]);
  assert.deepEqual([...grades("pier", 6).seen].sort(), ["common", "epic", "legendary", "rare", "uncommon"]);
  assert.ok(!grades("pier", 7).seen.has("mythic") && !grades("sea", 7).seen.has("mythic"), "no mythic off the pier or at sea");
  assert.deepEqual([...grades("sea", 5).seen].sort(), ["common", "rare", "uncommon"]);
  assert.ok(grades("cove", 7).seen.has("mythic") && !grades("cove", 6).seen.has("mythic"));
  // an AFK line keeps the ladder too, whatever its bait (and never a mythic)
  assert.deepEqual([...grades("pier", 3, true).seen], ["common"]);
  assert.deepEqual([...grades("pier", 5, true).seen].sort(), ["common", "rare", "uncommon"]);
  assert.ok(!grades("pier", 5, true).seen.has("epic"));
});

test("each salt-water fish swims in its own water, and by its own hour off the pier", () => {
  const pierDay = grades("pier", 7, false, "day").ids;
  const pierNight = grades("pier", 7, false, "night").ids;
  const sea = grades("sea", 7).ids;
  const cove = grades("cove", 7).ids;
  for (const id of pierDay) assert.ok(zoneOf(id as (typeof SEA_FISH_IDS)[number]) === "pier" && FISH7[id].time === "day", `${id} off the pier by day`);
  for (const id of pierNight) assert.ok(zoneOf(id as (typeof SEA_FISH_IDS)[number]) === "pier" && FISH7[id].time === "night", `${id} off the pier by night`);
  for (const id of sea) assert.equal(zoneOf(id as (typeof SEA_FISH_IDS)[number]), "sea");
  assert.ok([...cove].some((id) => zoneOf(id as (typeof SEA_FISH_IDS)[number]) === "cove") && [...cove].some((id) => zoneOf(id as (typeof SEA_FISH_IDS)[number]) === "sea"), "the cove holds its own and the sea's");
  // every species is landed by some rod somewhere, and its grade is one a rod of its least tier lands
  const all = new Set([...pierDay, ...pierNight, ...sea, ...cove]);
  for (const id of SEA_FISH_IDS) {
    assert.ok(all.has(id), `${id} bites somewhere`);
    const sp = FISH7[id] as Species7;
    assert.ok((sp.minRod ?? 1) <= SEA_MIN_ROD[gradeOf7(id)], `${id}: its least rod`);
    assert.equal(fishRate7("beach", id), 1, "Dune pays in full for it");
  }
});

test("a cast on Sunset Beach lands on open water: from the pier's edge, never onto the sand or under the deck", () => {
  // facing out over the pier's south-west side: straight ahead, on deep water
  const edge = onPierAt(PIER_LENGTH - 1.5, -PIER.headHalf + 0.3);
  const out = beachCast(edge.x, edge.z, -0.7071, 0.7071);
  assert.ok(out && beachGroundY(out.x, out.z) < -0.3);
  // facing the captain's boat on the other side: the float never lands on its deck
  const boatSide = onPierAt(PIER_LENGTH - 1.5, PIER.headHalf - 0.3);
  const toBoat = beachCast(boatSide.x, boatSide.z, 0.7071, -0.7071);
  assert.ok(!toBoat || Math.hypot(toBoat.x - BOAT.x, toBoat.z - BOAT.z) > 1.9, "not onto the boat");
  const inland = at(9, 0);
  assert.equal(beachCast(inland.x, inland.z, -0.7071, -0.7071), null, "no water in reach of the bar");
  // Dune stands inside his shack; you stand in front of it
  assert.ok(isBlocked(DUNE.x, DUNE.z, "sunset_beach", 0.05) && !isBlocked(DUNE_FRONT.x, DUNE_FRONT.z, "sunset_beach"));
});
