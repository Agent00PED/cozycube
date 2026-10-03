// The captain's boat (shared/voyage.ts, server/src/rooms/beachSea.ts, shared/worlds/sea.ts) and the
// Tidewater tools (shared/expedition.ts, place "dune"): `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BeachSea, type SeaHost, type SeaPlayer } from "../server/src/rooms/beachSea";
import { isBlocked, walkY } from "../shared/collision";
import { CREEL_PRICES, TACKLE_PRICES } from "../shared/economy";
import { FORGED_TOOLS, FORGED_TOOL_IDS, forgedOwned, makingsMissing } from "../shared/expedition";
import { RODS, sanitizeFishingProfile, type FishingProfile } from "../shared/fishing";
import { MAP_CHAIRS, MAP_TOGGLEABLES } from "../shared/props";
import { HIDDEN_MAPS, isFishingMap, isShoreCastMap, type MapId } from "../shared/types";
import { TICKET_PRICE, isSeaMap } from "../shared/voyage";
import { BRINE, BRINE_FRONT, DUNE_FRONT, PIER, PIER_RETURN } from "../shared/worlds/beach";
import { DECK_Y, SEA_CAPTAIN, SEA_CAPTAIN_FRONT, SEA_LAYOUT, SEA_SPAWNS, STARBOARD, deckInside, onDeck, seaCast } from "../shared/worlds/sea";
import { SEA_TARGET, simulate, soldLadder } from "../scripts/economy-sim";

function world(coins = 1000) {
  const player: SeaPlayer = { map: "sunset_beach", x: BRINE_FRONT.x, z: BRINE_FRONT.z, sitting: false, coins, action: "" };
  const profile: FishingProfile = sanitizeFishingProfile({});
  const sent: [string, any][] = [];
  const trips: [MapId, { x: number; z: number }][] = [];
  const host: SeaHost = {
    player: () => player,
    profile: () => profile,
    saveProfile: () => {},
    sendTo: (_id, type, payload) => sent.push([type, payload]),
    addCoins: (_id, n) => {
      player.coins += n;
    },
    travel: (_id, map, at) => {
      trips.push([map, at]);
      player.map = map;
      player.x = at.x;
      player.z = at.z;
    },
    emote: () => {},
    count: () => 0,
    toCove: () => {},
  };
  return { sea: new BeachSea(host), player, profile, sent, trips };
}

test("the boat's deck: walked from stern to bow at its height, the water all round closed", () => {
  for (const p of SEA_SPAWNS) assert.ok(!isBlocked(p.x, p.z, "open_sea") && walkY("open_sea", p.x, p.z) === DECK_Y);
  const over = onDeck(0, SEA_LAYOUT.boat.beam + 0.6);
  assert.ok(deckInside(over.x, over.z) < 0 && isBlocked(over.x, over.z, "open_sea"));
  assert.ok(isBlocked(SEA_CAPTAIN.x, SEA_CAPTAIN.z, "open_sea", 0.05) && !isBlocked(SEA_CAPTAIN_FRONT.x, SEA_CAPTAIN_FRONT.z, "open_sea"));
  assert.equal(MAP_CHAIRS.open_sea.length, 4);
  assert.equal(MAP_TOGGLEABLES.open_sea.filter((p) => p.kind === "captain").length, 1);
  assert.ok(HIDDEN_MAPS.has("open_sea") && isFishingMap("open_sea") && isShoreCastMap("open_sea") && isSeaMap("open_sea") && !isSeaMap("sunset_beach"));
});

test("a cast from the rail lands out on the water beyond it; from the middle of the deck, along it, nothing", () => {
  const rail = onDeck(1.0, 1.1);
  const out = seaCast(rail.x, rail.z, STARBOARD.x, STARBOARD.z);
  assert.ok(out && deckInside(out.x, out.z) <= -1.5, "the float is clear of the hull");
  // facing the other rail from the same spot: the float goes out over that side instead
  const port = seaCast(rail.x, rail.z, -STARBOARD.x, -STARBOARD.z);
  assert.ok(port && deckInside(port.x, port.z) <= -1.5);
  // off the boat: no cast
  assert.equal(seaCast(20, 20, 1, 0), null);
});

test("the ticket: paid once as you step aboard, good until you ask for the pier", () => {
  const w = world(1000);
  w.sea.handle("s", { op: "sail" });
  assert.equal(w.player.coins, 1000 - TICKET_PRICE);
  assert.equal(w.player.map, "open_sea");
  assert.equal(w.profile.seaTrip, true);
  // a dropped connection leaves you ashore with the trip still yours: aboard again for nothing
  w.player.map = "sunset_beach";
  w.player.x = BRINE_FRONT.x;
  w.player.z = BRINE_FRONT.z;
  w.sea.handle("s", { op: "sail" });
  assert.equal(w.player.coins, 1000 - TICKET_PRICE);
  // back to the pier: the trip ends, and the next one is another ticket
  w.player.x = SEA_CAPTAIN_FRONT.x;
  w.player.z = SEA_CAPTAIN_FRONT.z;
  w.sea.handle("s", { op: "home" });
  assert.deepEqual([w.player.map, w.player.x, w.player.z], ["sunset_beach", PIER_RETURN.x, PIER_RETURN.z]);
  assert.equal(w.profile.seaTrip, false);
  w.player.x = BRINE_FRONT.x;
  w.player.z = BRINE_FRONT.z;
  w.sea.handle("s", { op: "sail" });
  assert.equal(w.player.coins, 1000 - 2 * TICKET_PRICE);
  // leaving by the world list ends it too
  w.sea.endTrip("s");
  assert.equal(w.profile.seaTrip, false);
});

test("no ticket without the coins, nor from away down the pier", () => {
  const poor = world(TICKET_PRICE - 1);
  poor.sea.handle("s", { op: "sail" });
  assert.equal(poor.player.map, "sunset_beach");
  assert.equal(poor.player.coins, TICKET_PRICE - 1);
  const far = world(1000);
  far.player.x = DUNE_FRONT.x;
  far.player.z = DUNE_FRONT.z;
  far.sea.handle("s", { op: "sail" });
  assert.equal(far.player.map, "sunset_beach");
  // Brine stands on the pier's deck
  assert.equal(walkY("sunset_beach", BRINE.x, BRINE.z), PIER.deck);
});

test("the Tidewater tools are made at Dune's, from all three crafts, and nowhere else", () => {
  const tide = FORGED_TOOL_IDS.filter((id) => FORGED_TOOLS[id].place === "dune");
  assert.deepEqual(tide, ["tideRod", "tideLivewell"]);
  assert.equal(RODS.tidewater.tier, 6);
  assert.equal(FORGED_TOOLS.tideRod.coins, TACKLE_PRICES.tidewaterRod);
  assert.equal(FORGED_TOOLS.tideLivewell.coins, CREEL_PRICES[5]);
  assert.equal(CREEL_PRICES[5], TACKLE_PRICES.tidewaterRod / 2, "storage costs half its tool");
  const needs = FORGED_TOOLS.tideRod.needs;
  assert.ok(Object.keys(needs.ore ?? {}).length > 0 && Object.keys(needs.byproducts ?? {}).length >= 2, "ingots, a wood's by-product and a fish's");

  const w = world(100_000);
  w.player.x = DUNE_FRONT.x;
  w.player.z = DUNE_FRONT.z;
  // nothing to make it from yet
  w.sea.handle("s", { op: "make", tool: "tideRod" });
  assert.equal(forgedOwned(w.profile, "tideRod"), false);
  assert.ok(makingsMissing(w.profile, needs).length > 0);
  // with the makings: made, paid for, and in hand
  Object.assign(w.profile, sanitizeFishingProfile({ satchelTier: 5, satchelContents: [{ id: "silver_ingot", n: 6 }, { id: "iron_ingot", n: 6 }], byproducts: { leafAmber: 6, fishBone: 6, scales: 20, amber: 6 }, creelTier: 5 }));
  w.sea.handle("s", { op: "make", tool: "tideRod" });
  assert.equal(w.profile.rod, "tidewater");
  assert.equal(w.player.coins, 100_000 - TACKLE_PRICES.tidewaterRod);
  w.sea.handle("s", { op: "make", tool: "tideLivewell" });
  assert.equal(w.profile.creelTier, 6);
  assert.equal(w.profile.slots, 80);
  // the forge's own tools are not Dune's to make
  const before = w.player.coins;
  w.sea.handle("s", { op: "make", tool: "axe" });
  assert.equal(w.player.coins, before);
});

test("the salt water's income: a Tidewater rod earns its target at sea, less off the pier, and an Expedition rod at sea what it earns at the cenote", () => {
  const lines = simulate("fish");
  const at = (tier: number, where: string) => lines.find((l) => l.tier === tier && l.where === where)!.perMinSold;
  const sea = at(SEA_TARGET.tier, "sea");
  assert.ok(Math.abs(sea / SEA_TARGET.sea - 1) <= 0.2, `a T6 rod at sea: ${sea.toFixed(0)} a minute, target ${SEA_TARGET.sea}`);
  const pier = at(SEA_TARGET.tier, "pier");
  assert.ok(pier / sea >= 0.6 && pier / sea <= 0.9, `the pier ${(pier / sea).toFixed(2)} of the sea`);
  assert.ok(Math.abs(at(5, "sea") / at(5, "cenote") - 1) <= 0.2, `a T5 rod: ${at(5, "sea").toFixed(0)} at sea, ${at(5, "cenote").toFixed(0)} at the cenote`);
  // no fresh water pays a Tidewater rod what the sea does, and no one below T5 casts there
  for (const where of ["campfire river", "woods river", "cenote"]) assert.ok(at(6, where) < sea, `${where} under the sea`);
  assert.ok(!lines.some((l) => l.where === "sea" && l.tier < 5));
  // the rod costs 360 minutes of what the rod before it earns at its best water (the cenote)
  const minutes = TACKLE_PRICES.tidewaterRod / soldLadder(lines).cenote[4];
  assert.ok(Math.abs(minutes / 360 - 1) <= 0.15, `the Tidewater rod: ${minutes.toFixed(0)} minutes of an Expedition rod's play`);
});
