// The Newcomer's Guide (shared/guide.ts): one step at a time, flags kept as they happen, an older
// account walked past what it has done, and a reward small enough never to skip a tool.
import assert from "node:assert/strict";
import test from "node:test";
import { emptyFishingProfile, sanitizeFishingProfile } from "../shared/fishing";
import { GUIDE, GUIDE_BONUS, GUIDE_MAPS, advanceGuide, guideFinished, guideProgress, guideStep, noteGuideFlag, sanitizeGuide } from "../shared/guide";
import { TACKLE_PRICES } from "../shared/economy";

test("a fresh account starts on the first step, and nothing is met", () => {
  const p = emptyFishingProfile();
  assert.equal(guideStep(p.guide)?.id, GUIDE[0].id);
  assert.deepEqual(advanceGuide(p), { steps: [], coins: 0, finished: false });
});

test("steps fall one at a time, in order, each paid once", () => {
  const p = emptyFishingProfile();
  assert.ok(noteGuideFlag(p.guide, "at:campfire_night"));
  assert.ok(!noteGuideFlag(p.guide, "at:campfire_night"), "a flag is kept once");
  assert.deepEqual(advanceGuide(p).steps, ["campfire"]);
  assert.deepEqual(advanceGuide(p).steps, [], "never paid twice");
  p.caught.minnow = 1;
  assert.deepEqual(advanceGuide(p), { steps: ["fish"], coins: 15, finished: false });
  assert.equal(guideStep(p.guide)?.id, "sellFish");
});

test("what is done early is kept for its step", () => {
  const p = emptyFishingProfile();
  noteGuideFlag(p.guide, "sat");
  noteGuideFlag(p.guide, "at:campfire_night");
  p.caught.minnow = 1;
  p.best.minnow = 4;
  p.felled.soft_pine = 1;
  p.bestLog.pine = 2;
  const a = advanceGuide(p);
  assert.deepEqual(a.steps, ["campfire", "fish", "sellFish", "fell", "sellWood", "fire"]);
  assert.equal(guideStep(p.guide)?.id, "tool");
});

test("a veteran is walked through all but what only a flag can show", () => {
  const p = emptyFishingProfile();
  p.caught.minnow = 9;
  p.best.minnow = 4;
  p.felled.soft_pine = 3;
  p.bestLog.pine = 2;
  p.rods.push("willow");
  p.ranger = true;
  p.caveAccess = true;
  p.gear.push("ang_gloves");
  assert.equal(advanceGuide(p).steps.length, 5, "up to the seat by the fire");
  noteGuideFlag(p.guide, "sat");
  assert.equal(guideStep(p.guide)?.id, "fire");
  const a = advanceGuide(p);
  assert.equal(guideStep(p.guide)?.id, "explore");
  noteGuideFlag(p.guide, "at:sunset_beach");
  const b = advanceGuide(p);
  assert.ok(b.finished && guideFinished(p.guide));
  assert.equal(a.coins + b.coins, GUIDE.slice(5).reduce((n, s) => n + s.coins, 0) + GUIDE_BONUS);
  assert.deepEqual(p.guide.flags, [], "flags are dropped once the chain is done");
  assert.ok(!noteGuideFlag(p.guide, "flint"), "and no more are kept");
});

test("the whole guide pays less than the first tool costs", () => {
  const all = GUIDE.reduce((n, s) => n + s.coins, 0) + GUIDE_BONUS;
  assert.ok(all < TACKLE_PRICES.proRod, `${all} coins`);
  assert.ok(GUIDE.slice(0, 7).reduce((n, s) => n + s.coins, 0) <= TACKLE_PRICES.proRod / 4, "before the tool step, a quarter of it at most");
  assert.equal(new Set(GUIDE.map((s) => s.id)).size, GUIDE.length);
});

test("the guide's state survives the profile's sanitizer, and junk does not", () => {
  const p = emptyFishingProfile();
  noteGuideFlag(p.guide, "at:campfire_night");
  advanceGuide(p);
  noteGuideFlag(p.guide, "sat");
  const back = sanitizeFishingProfile(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(back.guide, p.guide);
  assert.deepEqual(guideProgress(back.guide), { done: 1, all: GUIDE.length });
  assert.deepEqual(sanitizeGuide({ done: ["nope", "fish", 3], flags: ["sat", "x", "at:../etc", "sat"] }), { done: ["fish"], flags: ["sat"] });
  assert.deepEqual(sanitizeFishingProfile({}).guide, { done: [], flags: [] });
  for (const m of GUIDE_MAPS) assert.ok(noteGuideFlag(emptyFishingProfile().guide, `at:${m}`));
});
