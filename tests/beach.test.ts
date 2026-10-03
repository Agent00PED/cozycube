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
