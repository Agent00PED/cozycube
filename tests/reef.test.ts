// Sunset Beach's fossil reef rock (shared/worlds/beach.ts REEF_NODES, shared/caverns_mining.ts): the
// caverns' prospecting on the beach, the Tidewater Pickaxe and Ore Crate made at Dune's, Dune buying
// ore, and what a miner earns there. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BeachSea, type SeaHost, type SeaPlayer } from "../server/src/rooms/beachSea";
import { ORE_ITEMS, ORE_KINDS, PICKAXES, PICKAXES_BY_TIER, oreRule, rollYield } from "../shared/caverns_mining";
import { MASTERY_AT } from "../shared/caverns_mastery";
import { isBlocked } from "../shared/collision";
import { PICKAXE_PRICES, SATCHEL_PRICES } from "../shared/economy";
import { FORGED_TOOLS, forgedBlocked, forgedOwned } from "../shared/expedition";
import { sanitizeFishingProfile, type FishingProfile } from "../shared/fishing";
import { findPath } from "../shared/pathfinding";
import { MAP_TOGGLEABLES } from "../shared/props";
import { GUS_SATCHEL_TIER, SATCHEL_TIERS, satchelAdd } from "../shared/satchel";
import { BEACH_ARRIVAL, BEACH_TREES, DUNE_FRONT, REEF_NODES } from "../shared/worlds/beach";
import { ALL_ORE_NODES, ORE_NODES, ORE_NODE_AT, oreNodeNear, oreNodeOf, oreReach } from "../shared/worlds/caverns";
import { TARGETS, simulate, soldLadder } from "../scripts/economy-sim";

test("the reef rock is the sixth ore tier: only a Tidewater pickaxe mines it whole, the Drill bites at 60%, the rest skid off", () => {
  const reef = ORE_KINDS.reef;
  assert.equal(reef.tier, 6);
  assert.deepEqual(PICKAXES_BY_TIER.map((id) => PICKAXES[id].tier), [1, 2, 3, 4, 5, 6]);
  assert.equal(oreRule(6, "reef"), "mine");
  assert.equal(oreRule(5, "reef"), "under");
  assert.equal(oreRule(4, "reef"), "deflect");
  // the Tidewater pickaxe breaks the caverns' rocks at a blow, never the Monolith
  for (const kind of ["coal", "copper", "iron", "silver", "glimmer"] as const) assert.equal(oreRule(6, kind), "oneshot");
  assert.equal(oreRule(6, "monolith"), "mine");
  assert.equal(oreRule(5, "monolith"), "mine");
  // its haul: reef stone, sea glass now and then, never a geode
  const seen = new Set<string>();
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const haul = rollYield("reef", "tidewater", Math.random, 0.5);
    for (const [id, k] of Object.entries(haul)) {
      seen.add(id);
      if (id === "reef_stone") n += k;
    }
  }
  assert.deepEqual([...seen].sort(), ["reef_stone", "sea_glass"]);
  assert.ok(n >= 400);
  assert.ok(ORE_ITEMS.reef_stone.price > 0 && ORE_ITEMS.sea_glass.price > ORE_ITEMS.reef_stone.price);
  assert.equal(MASTERY_AT.reef.length, 5);
});

test("six nodes in the headland: each a collider, mined from open sand within reach, walked to from the arrival, and found by its id like any node", () => {
  assert.equal(REEF_NODES.length, 6);
  assert.equal(ALL_ORE_NODES.length, ORE_NODES.length + REEF_NODES.length);
  assert.ok(ORE_NODES.every((n) => n.map === "glimmering_caverns"), "the caverns' list is the caverns' alone");
  for (const n of REEF_NODES) {
    assert.equal(ORE_NODE_AT.get(n.id)?.map, "sunset_beach");
    assert.equal(oreNodeOf(`ore_${n.id}`)?.id, n.id);
    assert.ok(isBlocked(n.x, n.z, "sunset_beach", 0.05), `${n.id} is a collider`);
    assert.ok(!isBlocked(n.approach.x, n.approach.z, "sunset_beach"), `${n.id} is mined from open sand`);
    assert.ok(Math.hypot(n.approach.x - n.x, n.approach.z - n.z) <= oreReach(ORE_NODE_AT.get(n.id)!), `${n.id}'s spot is in reach`);
    assert.ok(findPath("sunset_beach", BEACH_ARRIVAL, n.approach), `${n.id} is walked to`);
    assert.ok(MAP_TOGGLEABLES.sunset_beach.some((p) => p.propId === `ore_${n.id}` && p.kind === "ore"));
    assert.equal(oreNodeNear(n.approach.x, n.approach.z, "sunset_beach")?.map, "sunset_beach");
    // no palm stands in a rock, and none is felled from inside one
    for (const t of BEACH_TREES) assert.ok(Math.hypot(t.x - n.x, t.z - n.z) > 0.9 && Math.hypot(t.approachX - n.x, t.approachZ - n.z) > 0.6);
  }
  // down in the caverns the nearest node is still one of the caverns' own
  const cave = ORE_NODES[0];
  assert.equal(oreNodeNear(cave.approach.x, cave.approach.z)?.map, "glimmering_caverns");
  assert.equal(oreNodeNear(REEF_NODES[0].approach.x, REEF_NODES[0].approach.z), null, "a beach spot names no cavern node");
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

test("the Tidewater Pickaxe and the Ore Crate are made at Dune's; the crate after Gus's last satchel, which is the last he sells", () => {
  assert.equal(FORGED_TOOLS.tidePickaxe.place, "dune");
  assert.equal(FORGED_TOOLS.tidePickaxe.coins, PICKAXE_PRICES.tidewater);
  assert.equal(FORGED_TOOLS.tideSatchel.coins, SATCHEL_PRICES[6]);
  assert.equal(SATCHEL_PRICES[6], PICKAXE_PRICES.tidewater / 2, "storage costs half its tool");
  assert.equal(SATCHEL_TIERS.length, 7);
  assert.equal(GUS_SATCHEL_TIER, 5);
  assert.ok(SATCHEL_TIERS[6].slots > SATCHEL_TIERS[5].slots);
  const w = seaWorld(200_000);
  w.sea.handle("s", { op: "make", tool: "tidePickaxe" });
  assert.ok(!forgedOwned(w.profile, "tidePickaxe"), "no makings, no pickaxe");
  w.profile.satchelTier = 5;
  w.profile.satchelSlots = 20;
  satchelAdd(w.profile, "silver_ingot", 8);
  satchelAdd(w.profile, "glimmer_shard", 4);
  satchelAdd(w.profile, "iron_ingot", 6);
  w.profile.byproducts = { leafAmber: 6, fishBone: 6, amber: 6, scales: 20 };
  w.sea.handle("s", { op: "make", tool: "tidePickaxe" });
  assert.ok(forgedOwned(w.profile, "tidePickaxe"));
  assert.equal(w.profile.pickaxeId, "tidewater");
  assert.equal(w.player.coins, 200_000 - PICKAXE_PRICES.tidewater);
  // the crate: Gus's Titan Core Vault comes first
  w.profile.satchelTier = 4;
  assert.ok(forgedBlocked(w.profile, "tideSatchel"));
  w.sea.handle("s", { op: "make", tool: "tideSatchel" });
  assert.equal(w.profile.satchelTier, 4);
  w.profile.satchelTier = 5;
  w.sea.handle("s", { op: "make", tool: "tideSatchel" });
  assert.equal(w.profile.satchelTier, 6);
  assert.equal(w.profile.satchelSlots, SATCHEL_TIERS[6].slots);
  assert.equal(w.player.coins, 200_000 - PICKAXE_PRICES.tidewater - SATCHEL_PRICES[6]);
  // a profile read back keeps the crate
  const back = sanitizeFishingProfile(JSON.parse(JSON.stringify(w.profile)));
  assert.equal(back.satchelTier, 6);
  assert.ok(back.pickaxes.includes("tidewater"));
});

test("the reef's income: a Tidewater pickaxe earns its target there and more than in the caverns; the Drill earns less on the reef than below", () => {
  const lines = simulate("ore");
  const at = (tier: number, where: string) => lines.find((l) => l.tier === tier && l.where === where)!.perMinSold;
  const reef = at(6, "beach");
  assert.ok(Math.abs(reef / TARGETS.ore[5] - 1) <= 0.2, `a T6 pickaxe on the reef: ${reef.toFixed(0)} a minute, target ${TARGETS.ore[5]}`);
  assert.ok(reef > at(6, "caverns"), "the reef is where a Tidewater pickaxe earns most");
  assert.ok(at(5, "beach") < at(5, "caverns"), "a Drill does better in the caverns");
  assert.ok(!lines.some((l) => l.where === "beach" && l.tier < 5), "nothing under a Drill bites the reef");
  // the pickaxe costs about 360 minutes of a Drill's play
  const minutes = PICKAXE_PRICES.tidewater / soldLadder(lines).ore[4];
  assert.ok(Math.abs(minutes / 360 - 1) <= 0.15, `the Tidewater Pickaxe: ${minutes.toFixed(0)} minutes of a T5 pickaxe's play`);
});
