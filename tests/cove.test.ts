// The Hidden Cove (shared/worlds/cove.ts, shared/voyage.ts, server/src/rooms/beachSea.ts): the torn
// chart, the way in, the clams, the Deep Tide rod, and what it earns: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BeachSea, type SeaHost, type SeaPlayer } from "../server/src/rooms/beachSea";
import { isBlocked, walkY } from "../shared/collision";
import { MATERIAL_CAP, TACKLE_PRICES, WATER_ODDS } from "../shared/economy";
import { FORGED_TOOLS, forgedOwned } from "../shared/expedition";
import { RODS, sanitizeFishingProfile, type FishingProfile } from "../shared/fishing";
import { satchelAdd } from "../shared/satchel";
import { findPath } from "../shared/pathfinding";
import { MAP_TOGGLEABLES } from "../shared/props";
import { HIDDEN_MAPS, isFishingMap, isShoreCastMap, type MapId } from "../shared/types";
import { CHART_PIECES, CHART_SURE, CLAM_SHUT_MS, chartChance, isSeaMap } from "../shared/voyage";
import { BRINE_FRONT, PIER_RETURN } from "../shared/worlds/beach";
import { COVE_ARRIVAL, COVE_BENCH_FRONT, COVE_CAPTAIN, COVE_CAPTAIN_FRONT, COVE_CLAMS, COVE_LAYOUT, COVE_SPAWNS, COVE_WATER_Y, coveAt, coveCast, coveFloorY, coveWading } from "../shared/worlds/cove";
import { SEA_CAPTAIN_FRONT } from "../shared/worlds/sea";
import { COVE_TARGET, SEA_TARGET, simulate } from "../scripts/economy-sim";

function world(coins = 1000) {
  const player: SeaPlayer = { map: "sunset_beach", x: BRINE_FRONT.x, z: BRINE_FRONT.z, sitting: false, coins, action: "" };
  const profile: FishingProfile = sanitizeFishingProfile({});
  const sent: [string, any][] = [];
  const room: [string, any][] = [];
  const host: SeaHost = {
    player: () => player,
    profile: () => profile,
    saveProfile: () => {},
    sendTo: (_id, type, payload) => sent.push([type, payload]),
    addCoins: (_id, n) => {
      player.coins += n;
    },
    travel: (_id, map: MapId, at) => {
      player.map = map;
      player.x = at.x;
      player.z = at.z;
    },
    emote: () => {},
    count: () => 0,
    toCove: (type, payload) => room.push([type, payload]),
  };
  const stand = (p: { x: number; z: number }) => {
    player.x = p.x;
    player.z = p.z;
  };
  return { sea: new BeachSea(host), player, profile, sent, room, stand };
}

test("the cove's ground: every spawn, front and clam walked to from the arrival; the lagoon waded at its rim and closed beyond", () => {
  assert.ok(HIDDEN_MAPS.has("hidden_cove") && isFishingMap("hidden_cove") && isShoreCastMap("hidden_cove") && isSeaMap("hidden_cove"));
  for (const p of COVE_SPAWNS) assert.ok(!isBlocked(p.x, p.z, "hidden_cove"), "a spawn on open sand");
  const reach = (to: { x: number; z: number }, what: string) => {
    const path = findPath("hidden_cove", COVE_ARRIVAL, to);
    assert.ok(path && path.length > 0, `${what} is walked to from the arrival`);
  };
  reach(COVE_CAPTAIN_FRONT, "the captain");
  reach(COVE_BENCH_FRONT, "the bench");
  assert.ok(isBlocked(COVE_CAPTAIN.x, COVE_CAPTAIN.z, "hidden_cove", 0.05), "the captain is a collider");
  assert.ok(COVE_CLAMS.length >= 4);
  for (const c of COVE_CLAMS) {
    assert.ok(isBlocked(c.x, c.z, "hidden_cove", 0.05), `${c.id} is a collider`);
    const prop = MAP_TOGGLEABLES.hidden_cove.find((p) => p.propId === c.propId)!;
    assert.ok(prop && !isBlocked(prop.approachX!, prop.approachZ!, "hidden_cove"), `${c.id}'s approach is open`);
    reach({ x: prop.approachX!, z: prop.approachZ! }, c.id);
  }
  // the middle of the lagoon is deep water: closed; the sand stands above it
  const mid = COVE_LAYOUT.lagoon;
  assert.ok(isBlocked(mid.x, mid.z, "hidden_cove") && coveFloorY(mid.x, mid.z) < COVE_WATER_Y - 0.5);
  assert.ok(walkY("hidden_cove", COVE_ARRIVAL.x, COVE_ARRIVAL.z) > COVE_WATER_Y && !coveWading(COVE_ARRIVAL.x, COVE_ARRIVAL.z));
});

test("a cast from the lagoon's edge lands on its water; with your back to it, or far from it, nothing", () => {
  let casts = 0;
  for (let deg = 0; deg < 360; deg += 10) {
    // (walk in from the wall toward the lagoon until the ground gives out: the water's edge on this bearing)
    const mid = COVE_LAYOUT.lagoon;
    for (let d = 10; d > 0; d -= 0.25) {
      const p = { x: mid.x + Math.cos((deg * Math.PI) / 180) * d, z: mid.z + Math.sin((deg * Math.PI) / 180) * d };
      if (isBlocked(p.x, p.z, "hidden_cove") || coveWading(p.x, p.z)) continue;
      const out = coveCast(p.x, p.z, mid.x - p.x, mid.z - p.z);
      if (Math.hypot(p.x - mid.x, p.z - mid.z) < COVE_LAYOUT.lagoon.r + 1.2 && out) {
        casts++;
        assert.ok(coveFloorY(out.x, out.z) < COVE_WATER_Y - 0.3, "the float is on water deep enough to float it");
        assert.equal(coveCast(p.x, p.z, p.x - mid.x, p.z - mid.z), null, "never with your back to the lagoon");
      }
      break;
    }
  }
  assert.ok(casts >= 6, `the lagoon is fished from round its shore (${casts} bearings)`);
  const far = coveAt(COVE_LAYOUT.bench.deg, COVE_LAYOUT.bench.d - 0.95);
  assert.equal(coveCast(far.x, far.z, 0, -1) && coveCast(far.x, far.z, 0, 1) && coveCast(far.x, far.z, 1, 0) && coveCast(far.x, far.z, -1, 0), null);
});

test("the torn chart: a bottle now and then on a catch at sea, certain by the 300th dry one, three pieces and no more", () => {
  assert.ok(chartChance(0) > 0 && chartChance(100) > chartChance(0) && chartChance(CHART_SURE) === 1);
  const w = world();
  // ashore, a catch brings nothing
  w.sea.bottle("s", () => 0);
  assert.equal(w.profile.chart, 0);
  w.player.map = "open_sea";
  // an unlucky angler: nothing until the pity's end, then a piece for certain
  for (let i = 0; i < CHART_SURE; i++) w.sea.bottle("s", () => 0.999);
  assert.equal(w.profile.chart, 0);
  assert.equal(w.profile.chartDry, CHART_SURE);
  w.sea.bottle("s", () => 0.999);
  assert.equal(w.profile.chart, 1);
  assert.equal(w.profile.chartDry, 0);
  assert.deepEqual(w.sent.at(-1), ["chartPiece", { piece: 1, of: CHART_PIECES }]);
  for (let i = 0; i < 10; i++) w.sea.bottle("s", () => 0);
  assert.equal(w.profile.chart, CHART_PIECES);
  // a steady hand finds a piece in about half an hour of catches (some 90 an hour out there)
  let dry = 0;
  let expect = 0;
  let alive = 1;
  for (; dry <= CHART_SURE; dry++) {
    const p = chartChance(dry);
    expect += alive * p * (dry + 1);
    alive *= 1 - p;
  }
  assert.ok(expect > 50 && expect < 140, `a piece every ${expect.toFixed(0)} catches`);
});

test("the way in: the captain takes no one without the whole chart, then knows the way for good; back to sea, or to the pier", () => {
  const w = world();
  w.sea.handle("s", { op: "sail" });
  w.stand(SEA_CAPTAIN_FRONT);
  w.profile.chart = CHART_PIECES - 1;
  w.sea.handle("s", { op: "cove" });
  assert.equal(w.player.map, "open_sea");
  w.profile.chart = CHART_PIECES;
  // from the far rail: not within his hearing
  w.stand({ x: SEA_CAPTAIN_FRONT.x + 6, z: SEA_CAPTAIN_FRONT.z + 6 });
  w.sea.handle("s", { op: "cove" });
  assert.equal(w.player.map, "open_sea");
  w.stand(SEA_CAPTAIN_FRONT);
  w.sea.handle("s", { op: "cove" });
  assert.equal(w.player.map, "hidden_cove");
  assert.equal(w.profile.coveAccess, true);
  assert.ok(w.sent.some(([t]) => t === "coveClams"));
  // back out to sea on the same ticket
  w.stand(COVE_CAPTAIN_FRONT);
  w.sea.handle("s", { op: "tosea" });
  assert.equal(w.player.map, "open_sea");
  assert.equal(w.profile.seaTrip, true);
  // and in again, the chart long since handed over
  w.profile.chart = 0;
  w.stand(SEA_CAPTAIN_FRONT);
  w.sea.handle("s", { op: "cove" });
  assert.equal(w.player.map, "hidden_cove");
  // straight to the pier from the cove: the trip ends
  w.stand(COVE_CAPTAIN_FRONT);
  w.sea.handle("s", { op: "home" });
  assert.equal(w.player.map, "sunset_beach");
  assert.deepEqual({ x: w.player.x, z: w.player.z }, PIER_RETURN);
  assert.equal(w.profile.seaTrip, false);
  // no bottle for whoever has found the cove
  w.player.map = "open_sea";
  w.sea.bottle("s", () => 0);
  assert.equal(w.profile.chart, 0);
});

test("the clams: a pearl or two from beside one, then shut for everyone for a while; never past what the pouch holds", () => {
  const w = world();
  w.player.map = "hidden_cove";
  const clam = COVE_CLAMS[0];
  const prop = MAP_TOGGLEABLES.hidden_cove.find((p) => p.propId === clam.propId)!;
  // from across the cave: nothing
  w.stand(COVE_ARRIVAL);
  if (Math.hypot(COVE_ARRIVAL.x - clam.x, COVE_ARRIVAL.z - clam.z) > 3) {
    w.sea.handle("s", { op: "pry", clam: clam.id });
    assert.equal(w.profile.byproducts.pearl ?? 0, 0);
  }
  w.stand({ x: prop.approachX!, z: prop.approachZ! });
  w.sea.handle("s", { op: "pry", clam: clam.id });
  const got = w.profile.byproducts.pearl ?? 0;
  assert.ok(got === 1 || got === 2);
  const sync = w.room.at(-1)!;
  assert.equal(sync[0], "coveClams");
  assert.ok(sync[1][clam.id] > Date.now() + CLAM_SHUT_MS - 5000);
  // shut: a second pull brings nothing
  w.sea.handle("s", { op: "pry", clam: clam.id });
  assert.equal(w.profile.byproducts.pearl, got);
  // a full pouch: the clam is left as it is
  const other = COVE_CLAMS[1];
  const otherProp = MAP_TOGGLEABLES.hidden_cove.find((p) => p.propId === other.propId)!;
  w.profile.byproducts.pearl = MATERIAL_CAP;
  w.stand({ x: otherProp.approachX!, z: otherProp.approachZ! });
  w.sea.handle("s", { op: "pry", clam: other.id });
  assert.equal(w.profile.byproducts.pearl, MATERIAL_CAP);
  assert.ok(!(other.id in (w.room.at(-1)![1] as object)));
  // not in the cove: nothing
  const away = world();
  away.sea.handle("s", { op: "pry", clam: clam.id });
  assert.equal(away.profile.byproducts.pearl ?? 0, 0);
});

test("the Deep Tide Rod: made only at the cove's bench, of pearls and each craft's rarest, once", () => {
  const t = FORGED_TOOLS.deepRod;
  assert.equal(t.place, "cove");
  assert.equal(t.coins, TACKLE_PRICES.deepTideRod);
  assert.equal(RODS.deeptide.tier, 7);
  const w = world(200_000);
  w.profile.byproducts.pearl = 12;
  w.profile.byproducts.prismScale = 3;
  w.profile.byproducts.heartwood = 2;
  w.profile.satchelTier = 5;
  w.profile.satchelSlots = 20;
  satchelAdd(w.profile, "glimmer_shard", 6);
  // at Dune's shack, or anywhere but the bench: no
  w.sea.handle("s", { op: "make", tool: "deepRod" });
  assert.ok(!forgedOwned(w.profile, "deepRod"));
  w.player.map = "hidden_cove";
  w.stand(COVE_ARRIVAL);
  if (Math.hypot(COVE_ARRIVAL.x - COVE_BENCH_FRONT.x, COVE_ARRIVAL.z - COVE_BENCH_FRONT.z) > 3) {
    w.sea.handle("s", { op: "make", tool: "deepRod" });
    assert.ok(!forgedOwned(w.profile, "deepRod"));
  }
  w.stand(COVE_BENCH_FRONT);
  // a pearl short: no
  w.profile.byproducts.pearl = 11;
  w.sea.handle("s", { op: "make", tool: "deepRod" });
  assert.ok(!forgedOwned(w.profile, "deepRod"));
  w.profile.byproducts.pearl = 12;
  w.sea.handle("s", { op: "make", tool: "deepRod" });
  assert.ok(forgedOwned(w.profile, "deepRod"));
  assert.equal(w.profile.rod, "deeptide");
  assert.equal(w.player.coins, 200_000 - t.coins);
  assert.equal(w.profile.byproducts.pearl ?? 0, 0);
  // twice: no
  w.profile.byproducts.pearl = 12;
  w.sea.handle("s", { op: "make", tool: "deepRod" });
  assert.equal(w.player.coins, 200_000 - t.coins);
});

test("deeper water, longer odds: on the same rod each grade above common is rarer in the cove than at sea, and only the cove's T7 row holds a mythic", () => {
  for (const tier of [5, 6, 7]) {
    const sea = WATER_ODDS.sea[tier - 1];
    const cove = WATER_ODDS.cove[tier - 1];
    assert.ok(cove.rare <= sea.rare && cove.legendary <= sea.legendary, `T${tier}`);
  }
  for (const water of ["pier", "sea", "cove"] as const) WATER_ODDS[water].forEach((row, i) => assert.equal(row.mythic > 0, water === "cove" && i === 6, `${water} T${i + 1}`));
});

test("the cove's income: a Deep Tide rod earns its target there, more than anywhere else; a Tidewater rod a little more than at sea", () => {
  const lines = simulate("fish");
  const at = (tier: number, where: string) => lines.find((l) => l.tier === tier && l.where === where)!.perMinSold;
  const cove = at(COVE_TARGET.tier, "cove");
  assert.ok(Math.abs(cove / COVE_TARGET.cove - 1) <= 0.2, `a T7 rod in the cove: ${cove.toFixed(0)} a minute, target ${COVE_TARGET.cove}`);
  for (const where of ["campfire river", "woods river", "cenote", "pier", "sea"]) assert.ok(at(7, where) < cove, `${where} under the cove on a T7 rod`);
  const t6 = at(SEA_TARGET.tier, "cove");
  assert.ok(t6 >= at(6, "sea") && t6 <= at(6, "sea") * 1.2 && t6 < cove, `a T6 rod in the cove: ${t6.toFixed(0)}`);
  // a better rod never earns less on any salt water
  for (const where of ["pier", "sea", "cove"]) for (const tier of [6, 7]) assert.ok(at(tier, where) >= at(tier - 1, where), `${where} T${tier}`);
  // the rod costs about 600 minutes of a Tidewater rod's play at sea
  const minutes = TACKLE_PRICES.deepTideRod / at(6, "sea");
  assert.ok(Math.abs(minutes / 600 - 1) <= 0.2, `the Deep Tide rod: ${minutes.toFixed(0)} minutes`);
});

// --- the cove's own gathering (T7): the Drowned Ironwood and the pearl rock ----------------------------
import { AXES as AXES7, TREES as TREES7, WOOD as WOOD7 } from "../shared/chop";
import { FORGE_WARES as WARES7, ORE_ITEMS as ITEMS7, ORE_KINDS as KINDS7, PICKAXES as PICKS7, oreRule as rule7, rollYield as yield7 } from "../shared/caverns_mining";
import { AXE_PRICES as AXE7, PICKAXE_PRICES as PICK7 } from "../shared/economy";
import { RING_BANDS as BANDS7 } from "../shared/gear";
import { COVE_NODES as NODES7, COVE_TREES as TREES_AT7 } from "../shared/worlds/cove";
import { ORE_NODE_AT as NODE_AT7, oreReach as reach7 } from "../shared/worlds/caverns";
import { FELL_TREES as FELL7, fellReach as fellReach7 } from "../shared/worlds/trees";
import { TARGETS as TARGETS7 } from "../scripts/economy-sim";

test("the seventh tier: the Drowned Ironwood and the pearl rock, each bitten only by its own Deep Tide tool", () => {
  assert.equal(TREES7.ironwood.tier, 7);
  assert.equal(AXES7.deeptide.tier, 7);
  assert.ok(WOOD7.ironwood.sell > WOOD7.palm.sell);
  assert.equal(KINDS7.pearl.tier, 7);
  assert.equal(PICKS7.deeptide.tier, 7);
  assert.equal(rule7(7, "pearl"), "mine");
  assert.equal(rule7(6, "pearl"), "under");
  assert.equal(rule7(5, "pearl"), "deflect");
  assert.equal(rule7(7, "monolith"), "mine", "never the Monolith at a blow");
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) for (const id of Object.keys(yield7("pearl", "deeptide", Math.random, 0.5))) seen.add(id);
  assert.deepEqual([...seen].sort(), ["black_pearl", "nacre"]);
  // the Deep Tide axe and pickaxe are the cove bench's, at their listed prices
  assert.equal(FORGED_TOOLS.deepAxe.place, "cove");
  assert.equal(FORGED_TOOLS.deepPickaxe.place, "cove");
  assert.equal(FORGED_TOOLS.deepAxe.coins, AXE7.deeptide);
  assert.equal(FORGED_TOOLS.deepPickaxe.coins, PICK7.deeptide);
  // pearl jewellery: each about a fifth over its makings; the Pearl-set band is the Glimmer-set's strength
  for (const id of ["nacre_comb", "pearl_necklace", "black_pearl_brooch"] as const) {
    const makings = Object.entries(WARES7[id]).reduce((sum, [k, n]) => sum + ITEMS7[k as keyof typeof ITEMS7].price * (n as number), 0);
    const over = ITEMS7[id].price / makings - 1;
    assert.ok(over >= 0.15 && over <= 0.3, `${id}: ${(over * 100).toFixed(0)}% over its makings`);
  }
  assert.equal(BANDS7.pearl.strength, BANDS7.glimmer.strength);
});

test("the cove's four ironwoods and four pearl rocks: on its floor, reached from the arrival, worked from open sand", () => {
  assert.equal(TREES_AT7.length, 4);
  assert.equal(NODES7.length, 4);
  for (const t of FELL7.filter((f) => f.map === "hidden_cove")) {
    assert.equal(t.kind, "ironwood");
    assert.ok(isBlocked(t.x, t.z, "hidden_cove", 0.05) && !isBlocked(t.approachX, t.approachZ, "hidden_cove"), `${t.id}`);
    assert.ok(Math.hypot(t.approachX - t.x, t.approachZ - t.z) <= fellReach7(t));
    assert.ok(findPath("hidden_cove", COVE_ARRIVAL, { x: t.approachX, z: t.approachZ }), `${t.id} is walked to`);
  }
  for (const n of NODES7) {
    const node = NODE_AT7.get(n.id)!;
    assert.equal(node.map, "hidden_cove");
    assert.ok(!isBlocked(n.approach.x, n.approach.z, "hidden_cove") && Math.hypot(n.approach.x - n.x, n.approach.z - n.z) <= reach7(node), `${n.id}`);
    assert.ok(findPath("hidden_cove", COVE_ARRIVAL, n.approach), `${n.id} is walked to`);
    assert.ok(MAP_TOGGLEABLES.hidden_cove.some((p) => p.propId === `ore_${n.id}` && p.kind === "ore"));
  }
});

test("the Deep Tide axe and pickaxe are made at the cove's bench, of pearls and the rarest drops", () => {
  const w = world(400_000);
  w.player.map = "hidden_cove";
  w.stand(COVE_BENCH_FRONT);
  w.sea.handle("s", { op: "make", tool: "deepAxe" });
  assert.ok(!forgedOwned(w.profile, "deepAxe"));
  w.profile.satchelTier = 5;
  w.profile.satchelSlots = 20;
  satchelAdd(w.profile, "core_fragment", 5);
  satchelAdd(w.profile, "star_shard", 1);
  w.profile.byproducts = { pearl: 24, heartwood: 2, shavings: 8, prismScale: 2 };
  w.sea.handle("s", { op: "make", tool: "deepAxe" });
  assert.ok(forgedOwned(w.profile, "deepAxe"));
  assert.equal(w.profile.axe, "deeptide");
  w.sea.handle("s", { op: "make", tool: "deepPickaxe" });
  assert.ok(forgedOwned(w.profile, "deepPickaxe"));
  assert.equal(w.profile.pickaxeId, "deeptide");
  assert.equal(w.player.coins, 400_000 - AXE7.deeptide - PICK7.deeptide);
  assert.equal(w.profile.byproducts.pearl ?? 0, 0);
});

test("the cove's T7 income: ironwood and pearl rock each earn their target there, more than the same tool does anywhere else", () => {
  const wood = simulate("wood");
  const ore = simulate("ore");
  const at = (lines: typeof wood, where: string) => lines.find((l) => l.tier === 7 && l.where === where)!.perMinSold;
  const iron = at(wood, "cove");
  const pearl = at(ore, "cove");
  assert.ok(Math.abs(iron / TARGETS7.wood[6] - 1) <= 0.2, `a T7 axe in the cove: ${iron.toFixed(0)} a minute, target ${TARGETS7.wood[6]}`);
  assert.ok(Math.abs(pearl / TARGETS7.ore[6] - 1) <= 0.2, `a T7 pickaxe in the cove: ${pearl.toFixed(0)} a minute, target ${TARGETS7.ore[6]}`);
  for (const where of ["campfire", "woods", "beach"]) assert.ok(at(wood, where) < iron, `wood: ${where} under the cove`);
  for (const where of ["caverns", "beach"]) assert.ok(at(ore, where) < pearl, `ore: ${where} under the cove`);
  assert.ok(!wood.some((l) => l.where === "cove" && l.tier < 7), "no lesser axe fells an ironwood");
});
