// Sunset Beach's Coconut Palms (shared/chop.ts, shared/worlds/beach.ts, shared/expedition.ts): the sixth
// tree tier, the Tidewater axe and sled made at Dune's, a coconut for a drink, and what a woodcutter
// earns there. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BeachBar, type BarHost, type BarPlayer } from "../server/src/rooms/beachBar";
import { BeachSea, type SeaHost, type SeaPlayer } from "../server/src/rooms/beachSea";
import { AXES, AXES_BY_TIER, BYPRODUCTS, BYPRODUCT_IDS, COCONUT_CHANCE, NOTCH_DEG, SELL_ALL_BYPRODUCTS, TREES, WOOD, WOOD_CARRIER_TIERS, carrierCapacity } from "../shared/chop";
import { isBlocked } from "../shared/collision";
import { AXE_PRICES, CARRIER_PRICES } from "../shared/economy";
import { FORGED_TOOLS, FORGED_TOOL_IDS, forgedBlocked, forgedOwned } from "../shared/expedition";
import { DRINK_IDS, DRINK_PRICE } from "../shared/barshift";
import { sanitizeFishingProfile, type FishingProfile } from "../shared/fishing";
import { woodRate } from "../shared/keepers";
import { findPath } from "../shared/pathfinding";
import { MAP_TOGGLEABLES } from "../shared/props";
import { satchelAdd } from "../shared/satchel";
import { BEACH_ARRIVAL, BEACH_TREES, DUNE_FRONT, HAMMOCK_PALMS, MANGO_FRONT, PALMS } from "../shared/worlds/beach";
import { FELL_TREES, fellReach } from "../shared/worlds/trees";
import { TARGETS, simulate, soldLadder } from "../scripts/economy-sim";

test("the Coconut Palm is the sixth tier: a narrower notch than the Elderwood's, its own log, husk and coconut", () => {
  const p = TREES.palm;
  assert.equal(p.tier, 6);
  assert.equal(p.wood, "palm");
  assert.equal(p.byproduct, "husk");
  assert.ok(p.sweet < TREES.elderwood.sweet && NOTCH_DEG.length === 7);
  assert.ok(WOOD.palm.sell > 0 && BYPRODUCTS.husk.price > 0 && BYPRODUCTS.coconut.price > 0);
  assert.ok(COCONUT_CHANCE > 0 && COCONUT_CHANCE < 0.5);
  assert.equal(woodRate("beach", "palm"), 1, "Dune pays in full");
  // the axes go one a tier, and only the Tidewater bites a palm
  assert.deepEqual(AXES_BY_TIER.map((id) => AXES[id].tier), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(AXES.tidewater.tier, 6);
});

test("the grove: every palm but the hammocks' three is felled, from open sand within reach, walked to from the arrival", () => {
  assert.equal(BEACH_TREES.length, PALMS.length);
  assert.ok(BEACH_TREES.length >= 15);
  const all = FELL_TREES.filter((t) => t.map === "sunset_beach");
  const nodes = all.filter((t) => t.kind === "palm");
  assert.equal(nodes.length, BEACH_TREES.length);
  // (the beach forest behind: Sea Pines, first-tier trees any axe fells)
  const pines = all.filter((t) => t.kind === "sea_pine");
  assert.equal(pines.length + nodes.length, all.length);
  assert.ok(pines.length >= 12);
  for (const t of pines) {
    assert.ok(!isBlocked(t.approachX, t.approachZ, "sunset_beach"), `${t.id} is felled from open ground`);
    assert.ok(Math.hypot(t.approachX - t.x, t.approachZ - t.z) <= fellReach(t), `${t.id}'s spot is in reach`);
    assert.ok(findPath("sunset_beach", BEACH_ARRIVAL, { x: t.approachX, z: t.approachZ }), `${t.id} is walked to`);
  }
  for (const t of nodes) {
    assert.equal(t.kind, "palm");
    assert.ok(isBlocked(t.x, t.z, "sunset_beach", 0.05), `${t.id}'s trunk is a collider`);
    assert.ok(!isBlocked(t.approachX, t.approachZ, "sunset_beach"), `${t.id} is felled from open sand`);
    assert.ok(Math.hypot(t.approachX - t.x, t.approachZ - t.z) <= fellReach(t), `${t.id}'s spot is in reach`);
    assert.ok(findPath("sunset_beach", BEACH_ARRIVAL, { x: t.approachX, z: t.approachZ }), `${t.id} is walked to`);
    assert.ok(MAP_TOGGLEABLES.sunset_beach.some((p) => p.propId === `tree_${t.id}` && p.kind === "tree"), `${t.id} is a prop`);
    for (const h of HAMMOCK_PALMS) assert.ok(Math.hypot(h.x - t.x, h.z - t.z) > 1, "never a hammock's palm");
  }
});

function seaWorld(coins: number) {
  const player: SeaPlayer = { map: "sunset_beach", x: DUNE_FRONT.x, z: DUNE_FRONT.z, sitting: false, coins, action: "" };
  const profile: FishingProfile = sanitizeFishingProfile({});
  const host: SeaHost = {
    player: () => player,
    profile: () => profile,
    saveProfile: () => {},
    sendTo: () => {},
    addCoins: (_id, n) => {
      player.coins += n;
    },
    travel: () => {},
    emote: () => {},
    count: () => 0,
    toCove: () => {},
  };
  return { sea: new BeachSea(host), player, profile };
}

test("the Tidewater Axe and the Timber Sled are made at Dune's: coins and makings from all three crafts, the sled after the forged frame", () => {
  assert.ok(FORGED_TOOL_IDS.includes("tideAxe") && FORGED_TOOL_IDS.includes("tideCarrier"));
  assert.equal(FORGED_TOOLS.tideAxe.place, "dune");
  assert.equal(FORGED_TOOLS.tideAxe.coins, AXE_PRICES.tidewater);
  assert.equal(FORGED_TOOLS.tideCarrier.coins, CARRIER_PRICES[5]);
  assert.equal(CARRIER_PRICES[5], AXE_PRICES.tidewater / 2, "storage costs half its tool");
  assert.equal(WOOD_CARRIER_TIERS.length, 7);
  assert.ok(carrierCapacity(6) > carrierCapacity(5));
  for (const id of ["tideAxe", "tideCarrier"] as const) {
    const n = FORGED_TOOLS[id].needs;
    assert.ok(Object.keys(n.ore ?? {}).length > 0 && Object.keys(n.byproducts ?? {}).length >= 2, `${id}: ingots, a wood's by-product and a fish's`);
  }
  const w = seaWorld(100_000);
  // no makings: nothing
  w.sea.handle("s", { op: "make", tool: "tideAxe" });
  assert.ok(!forgedOwned(w.profile, "tideAxe"));
  w.profile.satchelTier = 5;
  w.profile.satchelSlots = 20;
  satchelAdd(w.profile, "iron_ingot", 14);
  w.profile.byproducts = { shavings: 6, fishBone: 4, amber: 10, scales: 20 };
  w.sea.handle("s", { op: "make", tool: "tideAxe" });
  assert.ok(forgedOwned(w.profile, "tideAxe"));
  assert.equal(w.profile.axe, "tidewater");
  assert.equal(w.player.coins, 100_000 - AXE_PRICES.tidewater);
  // the sled: the forged frame comes first
  w.profile.carrierTier = 4;
  assert.ok(forgedBlocked(w.profile, "tideCarrier"));
  w.sea.handle("s", { op: "make", tool: "tideCarrier" });
  assert.equal(w.profile.carrierTier, 4);
  w.profile.carrierTier = 5;
  w.sea.handle("s", { op: "make", tool: "tideCarrier" });
  assert.equal(w.profile.carrierTier, 6);
  assert.ok(forgedOwned(w.profile, "tideCarrier"));
  assert.equal(w.player.coins, 100_000 - AXE_PRICES.tidewater - CARRIER_PRICES[5]);
  // a forged carrier alone is not the sled
  const fresh = sanitizeFishingProfile({ carrierTier: 5 });
  assert.ok(forgedOwned(fresh, "carrier") && !forgedOwned(fresh, "tideCarrier"));
});

test("a shop's Sell All leaves the pearls and the coconuts: each sells only on its own", () => {
  assert.ok(!SELL_ALL_BYPRODUCTS.includes("pearl") && !SELL_ALL_BYPRODUCTS.includes("coconut"));
  assert.ok(SELL_ALL_BYPRODUCTS.includes("husk"));
  assert.equal(SELL_ALL_BYPRODUCTS.length, BYPRODUCT_IDS.length - 2);
});

function barWorld() {
  const players = new Map<string, BarPlayer>();
  const profiles = new Map<string, FishingProfile>();
  const beach: [string, any][] = [];
  const sent: [string, string, any][] = [];
  const host: BarHost = {
    player: (id) => players.get(id),
    profile: (id) => profiles.get(id),
    saveProfile: () => {},
    sendTo: (id, type, payload) => sent.push([id, type, payload]),
    toBeach: (type, payload) => beach.push([type, payload]),
    addCoins: (id, n) => {
      const p = players.get(id);
      if (p) p.coins += n;
    },
    seatOf: () => "",
    hand: () => {},
    grantTitle: () => {},
    emote: () => {},
  };
  const join = (id: string, coins: number) => {
    players.set(id, { map: "sunset_beach", x: MANGO_FRONT.x, z: MANGO_FRONT.z, sitting: false, username: id, userId: "u-" + id, coins, action: "", actionProgress: 0 });
    profiles.set(id, sanitizeFishingProfile({}));
  };
  return { bar: new BeachBar(host), players, profiles, beach, sent, join };
}

test("a coconut pays for a drink: Mango makes it at once, no coins change hands, and without one nothing is served", () => {
  const w = barWorld();
  w.join("amy", 0);
  const drink = DRINK_IDS[0];
  // no coconut, no coins: nothing
  w.bar.handle("amy", { op: "order", drink, coconut: true });
  assert.equal(w.beach.filter(([t]) => t === "drinkServed").length, 0);
  w.profiles.get("amy")!.byproducts.coconut = 2;
  w.bar.handle("amy", { op: "order", drink, coconut: true });
  assert.equal(w.beach.filter(([t]) => t === "drinkServed").length, 1);
  assert.equal(w.profiles.get("amy")!.byproducts.coconut, 1);
  assert.equal(w.players.get("amy")!.coins, 0);
  // with a bartender on shift, a coconut order is still Mango's (no share is paid out of a coconut)
  w.join("bob", 0);
  const station = (w.bar as unknown as { shifts: Map<string, unknown> }).shifts;
  station.set("bob", { station: "x", ticket: null });
  w.bar.handle("amy", { op: "order", drink, coconut: true });
  assert.equal(w.beach.filter(([t]) => t === "drinkServed").length, 2);
  assert.equal(w.profiles.get("amy")!.byproducts.coconut ?? 0, 0);
  assert.equal(w.players.get("bob")!.coins, 0);
  // a coconut is never worth more sold than the drink it buys
  assert.ok(BYPRODUCTS.coconut.price <= DRINK_PRICE);
});

test("the palms' income: a Tidewater axe earns its target on the beach, more than it does anywhere else", () => {
  const lines = simulate("wood");
  const at = (tier: number, where: string) => lines.find((l) => l.tier === tier && l.where === where)!.perMinSold;
  const beach = at(6, "beach");
  assert.ok(Math.abs(beach / TARGETS.wood[5] - 1) <= 0.2, `a T6 axe on the beach: ${beach.toFixed(0)} a minute, target ${TARGETS.wood[5]}`);
  assert.ok(beach > at(6, "woods") && beach > at(6, "campfire"));
  assert.ok(!lines.some((l) => l.where === "beach" && l.tier < 6), "no lesser axe fells a palm");
  // the axe costs about 360 minutes of the Elderwood axe's play
  const minutes = AXE_PRICES.tidewater / soldLadder(lines).wood[4];
  assert.ok(Math.abs(minutes / 360 - 1) <= 0.15, `the Tidewater Axe: ${minutes.toFixed(0)} minutes of a T5 axe's play`);
});
