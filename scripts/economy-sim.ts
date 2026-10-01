// The income simulator (docs/economy-plan.md phase 0): `npm run economy-sim`.
//
// Plays each gathering craft at each tool tier from the game's own rules and tables (the fish that
// bite and what they are worth, the trees that stand and when they grow back, the nodes and how they
// break, the walks between them over the real walk grid) and reports what a minute of active play
// earns, at an even market. Every price in the game is to be derived from these numbers, so they are
// pinned: `npm run economy-sim -- --write` saves the table to tests/economy-baseline.json, and
// tests/economy-sim.test.ts fails when a change moves it (a price changed on purpose is re-saved).
//
// The player it plays is a steady one, by hand, alone, with the storage of the tool's own tier and no
// accessories, bait or buffs (STEADY below says how steady). Not a bot at its best: a person who
// knows the game.

import { writeFileSync } from "node:fs";
import { CAVERNS_LAYOUT, FINNEGAN_FRONT, GUS_FRONT, ORE_NODES } from "../shared/worlds/caverns";
import { BARNABY_FRONT, BUSTER_FRONT, FISHING_SPOTS } from "../shared/worlds/campfire";
import { BRAMBLE_FRONT, FINLEY_FRONT, FOREST_FISHING } from "../shared/worlds/forest";
import { FELL_TREES } from "../shared/worlds/trees";
import { findPath } from "../shared/pathfinding";
import type { MapId } from "../shared/types";
import { AXES, AXES_BY_TIER, TREES, rollTreeScale, woodPrice, logMultiplier } from "../shared/chop";
import { AXE_PRICES, BYPRODUCT_PRICES, CARRIER_CAPACITY, CREEL_CAPACITY, ORE_PRICES, PICKAXE_PRICES, TACKLE_PRICES } from "../shared/economy";
import { OVERSUPPLY_AT, OVERSUPPLY_DROP, RECOVER_SOLD, SUPPLY_MAX } from "../shared/market";
import { FISH, biteSeconds, fishValue, rollCatch, rollFish } from "../shared/fishing";
import { fishRate, woodRate, type Counter } from "../shared/keepers";
import { CHASE_MAX, CLEAN_BREAK_BONUS, GLINT_CHANCE, ORE_KINDS, PERFECT_DAMAGE, PICKAXES, chaseBonus, oreRule, rollYield, streakBonus, type OreItemId, type OreKind, type PickaxeId } from "../shared/caverns_mining";
import { MASTERY_ORE } from "../shared/caverns_mastery";
import { SATCHEL_TIERS, stackOf } from "../shared/satchel";
import {
  DRYAD_GROWTH,
  GEAR,
  GEAR_FAMILIES,
  NO_GEAR,
  RING_BAND_IDS,
  RING_GEM_IDS,
  biteHaste,
  bonusLogChance,
  bonusOreChance,
  byproductBonus,
  carrierBonus,
  cleanBreakBonus,
  dryadChance,
  gearOfFamily,
  gearPace,
  gearRareLuck,
  geodeFind,
  glintBonus,
  goldStarBonus,
  heftBonus,
  kingBonus,
  livewellBonus,
  lodestoneSweet,
  noCeiling,
  perfectWindow,
  quickRegrow,
  ringId,
  satchelBonus,
  sellBonus,
  swingHaste,
  type GearFamily,
  type GearId,
  type Loadout,
  type RingId,
} from "../shared/gear";

/** How steady the player is. */
export const STEADY = {
  /** Walking pace (m/s): client/src/systems/useLocalPlayerMovement.ts MOVE_SPEED. */
  pace: 3,
  /** A sale at a keeper's counter (s). */
  sellS: 6,
  fish: {
    /** The reel, and the cast, the reveal and the recast between two catches (s). */
    reelS: 9,
    betweenS: 4,
    /** A boss fight: longer, and not always won. */
    bossReelS: 16,
    landed: { legendary: 0.75, mythic: 0.55 } as Record<string, number>,
  },
  wood: {
    /** A swing lands on the sweet spot this often (a miss costs another turn of the ring). */
    hit: 0.85,
    /** The pause between rounds, and getting set at a tree (s). */
    pauseS: 0.4,
    setS: 1.0,
  },
  ore: {
    /** A blow's verdicts, and how many of the direct ones come as the ring closes. (A wider sweet spot
     *  shrinks what is not direct with the square of its radius; a wider Perfect window catches that
     *  many more.) */
    direct: 0.8,
    near: 0.15,
    perfect: 0.3,
    /** Seconds a blow, at the quickest (a person's taps), and the close-up in and out. */
    tapS: 0.6,
    openS: 1.5,
  },
};

const HOURS = 6;

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

type Pt = { x: number; z: number };
const walkCache = new Map<string, number>();
/** Seconds to walk from `a` to `b` on `map`, over the game's own walk grid. */
export function walkS(map: MapId, a: Pt, b: Pt): number {
  const key = `${map}:${a.x.toFixed(1)},${a.z.toFixed(1)}>${b.x.toFixed(1)},${b.z.toFixed(1)}`;
  const hit = walkCache.get(key);
  if (hit !== undefined) return hit;
  const path = findPath(map, a, b);
  let len = 0;
  if (!path) len = Math.hypot(b.x - a.x, b.z - a.z) * 1.6;
  else {
    let at = a;
    for (const p of path) {
      len += Math.hypot(p.x - at.x, p.z - at.z);
      at = p;
    }
  }
  const s = len / STEADY.pace;
  walkCache.set(key, s);
  return s;
}

export interface Line {
  craft: "fish" | "wood" | "ore";
  tier: number;
  where: string;
  /** Coins a minute of active play, at an even market. */
  perMin: number;
  /** The same with the room's market answering this one player's own selling, hour after hour
   *  (shared/market.ts: past OVERSUPPLY_AT of a good in an hour each further sale knocks
   *  OVERSUPPLY_DROP off it, down to SUPPLY_MAX, and a good still being sold recovers RECOVER_SOLD an
   *  hour): what a player who sells everything in one room really gets. */
  perMinSold: number;
  /** What it sold, a good to how many an hour. */
  soldPerHour: Record<string, number>;
}

/** The average price multiplier over an hour's `n` sales of one good, in the steady state of selling
 *  that many every hour. */
export function soloMarket(n: number): number {
  if (n <= OVERSUPPLY_AT) return 1;
  // (the depression carried into the hour: what last hour ended on, less the hour's recovery)
  let carried = 0;
  for (let hour = 0; hour < 12; hour++) carried = Math.max(0, Math.min(SUPPLY_MAX, carried + OVERSUPPLY_DROP * (n - OVERSUPPLY_AT)) - RECOVER_SOLD);
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += 1 - Math.min(SUPPLY_MAX, carried + OVERSUPPLY_DROP * Math.max(0, i - OVERSUPPLY_AT));
  return sum / n;
}
/** A line's income with the solo market on it: each good's coins at its own hour's multiplier. */
function withMarket(value: Record<string, number>, count: Record<string, number>, t: number, extra = 0): number {
  let coins = extra;
  for (const [g, v] of Object.entries(value)) coins += v * soloMarket(Math.round(((count[g] ?? 0) / t) * 3600));
  return (coins / t) * 60;
}

/** The counter a map's keeper stands at. */
const counterOf = (map: MapId): Counter => (map === "campfire_night" ? "campfire" : map === "whispering_woods" ? "woods" : "caverns");

// --- the angler ----------------------------------------------------------------------------------------

const WATERS = [
  { where: "campfire river", water: "freshwater" as const, rapids: false, map: "campfire_night" as MapId, spot: FISHING_SPOTS[0].stand, keeper: BARNABY_FRONT },
  { where: "woods river", water: "freshwater" as const, rapids: true, map: "whispering_woods" as MapId, spot: FOREST_FISHING[0].stand, keeper: FINLEY_FRONT },
  { where: "cenote", water: "cavewater" as const, rapids: false, map: "glimmering_caverns" as MapId, spot: { x: FINNEGAN_FRONT.x + 3, z: FINNEGAN_FRONT.z }, keeper: FINNEGAN_FRONT },
];

export function angler(rodTier: number, w: (typeof WATERS)[number], gear: Loadout = NO_GEAR): Line {
  const rand = seeded(rodTier * 97 + w.where.length);
  const cap = CREEL_CAPACITY[rodTier - 1] + livewellBonus(gear);
  const trip = (2 * walkS(w.map, w.spot, w.keeper)) / gearPace(gear) + STEADY.sellS;
  const pays = sellBonus(gear);
  let t = 0;
  let coins = 0;
  let held = 0;
  let heldCoins = 0;
  const sold: Record<string, number> = {};
  const count: Record<string, number> = {};
  const value: Record<string, number> = {};
  const end = HOURS * 3600;
  let day = true;
  while (t < end) {
    // (the camp's day: twelve minutes of sun, twelve of stars)
    day = Math.floor(t / 720) % 2 === 0;
    const id = rollFish(w.water, { rodTier, afk: false, time: w.water === "cavewater" ? undefined : day ? "day" : "night", rapids: w.rapids, rareLuck: gearRareLuck(gear) }, rand);
    const sp = FISH[id] as { tier: string };
    const boss = sp.tier === "legendary" || sp.tier === "mythic";
    t += biteSeconds(id, { haste: biteHaste(gear) }, rand) + (boss ? STEADY.fish.bossReelS : STEADY.fish.reelS) + STEADY.fish.betweenS;
    if (boss && rand() > STEADY.fish.landed[sp.tier]) continue;
    const fish = rollCatch(id, { rodTier, rareLuck: gearRareLuck(gear), king: kingBonus(gear), goldStar: goldStarBonus(gear), heft: heftBonus(gear) }, rand);
    // (sold at the water's own keeper, who pays less past what they can afford: shared/keepers.ts)
    const v = fishValue(fish) * (noCeiling(gear) ? 1 : fishRate(counterOf(w.map), id)) * pays;
    heldCoins += v;
    held++;
    sold[sp.tier] = (sold[sp.tier] ?? 0) + 1;
    count[id] = (count[id] ?? 0) + 1;
    value[id] = (value[id] ?? 0) + v;
    if (held >= cap) {
      t += trip;
      coins += heldCoins;
      held = 0;
      heldCoins = 0;
    }
  }
  coins += heldCoins;
  return { craft: "fish", tier: rodTier, where: w.where, perMin: (coins / t) * 60, perMinSold: withMarket(value, count, t), soldPerHour: perHour(sold, t) };
}

const perHour = (sold: Record<string, number>, t: number) => Object.fromEntries(Object.entries(sold).map(([k, n]) => [k, Math.round((n / t) * 3600)]));

// --- the woodcutter ------------------------------------------------------------------------------------

export function woodcutter(axeTier: number, map: MapId, where: string, keeper: Pt, gear: Loadout = NO_GEAR): Line {
  const pace = gearPace(gear);
  const pays = sellBonus(gear);
  const hit = STEADY.wood.hit;
  const rand = seeded(axeTier * 131 + where.length);
  const axe = AXES[AXES_BY_TIER[axeTier - 1]];
  const trees = FELL_TREES.filter((tr) => tr.map === map && !tr.titan && TREES[tr.kind].tier <= axeTier).map((tr) => ({ ...tr, readyAt: 0, at: { x: tr.approachX, z: tr.approachZ } }));
  const cap = CARRIER_CAPACITY[axeTier - 1] + carrierBonus(gear);
  const sold: Record<string, number> = {};
  if (!trees.length) return { craft: "wood", tier: axeTier, where, perMin: 0, perMinSold: 0, soldPerHour: {} };
  /** A tree's turns of the ring, and what it is worth, on average. */
  const expect = (kind: keyof typeof TREES) => {
    const info = TREES[kind];
    const rounds = (info.rounds[0] + info.rounds[1]) / 2;
    const period = info.period / (1 - axe.slow);
    const secs = STEADY.wood.setS + rounds * (period / hit + STEADY.wood.pauseS);
    const by = info.byproduct ? (BYPRODUCT_PRICES as Record<string, number>)[info.byproduct] : 0;
    const worth = rounds * (info.logChance * (1 + bonusLogChance(gear)) * woodPrice(info.wood, 1, 1.23) + (1 - info.logChance + info.logChance * byproductBonus(gear)) * by);
    return { secs, worth };
  };
  let t = 0;
  let coins = 0;
  let logs = 0;
  let heldCoins = 0;
  let flat = 0;
  const value: Record<string, number> = {};
  let pos: Pt = keeper;
  const end = HOURS * 3600;
  while (t < end) {
    // the best tree standing (or standing by the time we walk there): worth over the time it takes
    let best: { tree: (typeof trees)[number]; rate: number; walk: number } | null = null;
    for (const tree of trees) {
      const walk = walkS(map, pos, tree.at) / pace;
      if (tree.readyAt > t + walk) continue;
      const e = expect(tree.kind);
      const rate = e.worth / (walk + e.secs);
      if (!best || rate > best.rate) best = { tree, rate, walk };
    }
    if (!best) {
      // nothing standing: wait for the next one to grow back
      t = Math.min(...trees.map((tree) => tree.readyAt));
      continue;
    }
    const { tree, walk } = best;
    const info = TREES[tree.kind];
    t += walk;
    pos = tree.at;
    const rounds = info.rounds[0] + Math.floor(rand() * (info.rounds[1] - info.rounds[0] + 1));
    const period = info.period / (1 - axe.slow);
    // (the Dryad's Sprout, from rank 3: now and then the tree grows as the axe is set to it)
    // (no roll the bare player would not make: their table stays as it was)
    const scale = rollTreeScale(rand) + (dryadChance(gear) > 0 && rand() < dryadChance(gear) ? DRYAD_GROWTH : 0);
    t += STEADY.wood.setS;
    for (let r = 0; r < rounds; r++) {
      do t += period;
      while (rand() > hit);
      t += STEADY.wood.pauseS;
      if (rand() < info.logChance) {
        const n = bonusLogChance(gear) > 0 && rand() < bonusLogChance(gear) ? 2 : 1;
        for (let k = 0; k < n && logs < cap; k++) {
          logs++;
          const v = woodPrice(info.wood, 1, logMultiplier(scale)) * (noCeiling(gear) ? 1 : woodRate(counterOf(map), info.wood)) * pays;
          heldCoins += v;
          sold[info.wood] = (sold[info.wood] ?? 0) + 1;
          value[info.wood] = (value[info.wood] ?? 0) + v;
        }
        if (info.byproduct && byproductBonus(gear) > 0 && rand() < byproductBonus(gear)) {
          heldCoins += (BYPRODUCT_PRICES as Record<string, number>)[info.byproduct];
          flat += (BYPRODUCT_PRICES as Record<string, number>)[info.byproduct];
        }
      } else if (info.byproduct) {
        // (the by-products sell at their own flat prices: Firewood's and theirs never move)
        heldCoins += (BYPRODUCT_PRICES as Record<string, number>)[info.byproduct];
        flat += (BYPRODUCT_PRICES as Record<string, number>)[info.byproduct];
      }
    }
    tree.readyAt = t + info.respawnS * (1 - quickRegrow(gear));
    if (logs >= cap) {
      t += walkS(map, pos, keeper) / pace + STEADY.sellS;
      pos = keeper;
      coins += heldCoins;
      logs = 0;
      heldCoins = 0;
    }
  }
  coins += heldCoins;
  return { craft: "wood", tier: axeTier, where, perMin: (coins / t) * 60, perMinSold: withMarket(value, sold, t, flat), soldPerHour: perHour(sold, t) };
}

// --- the miner -----------------------------------------------------------------------------------------

const PICK_BY_TIER = (Object.keys(PICKAXES) as PickaxeId[]).sort((a, b) => PICKAXES[a].tier - PICKAXES[b].tier);

export function miner(pickTier: number, opts: { glints?: boolean; chase?: boolean; gear?: Loadout } = {}): Line {
  const glints = opts.glints !== false;
  const chasing = opts.chase !== false;
  const gear = opts.gear ?? NO_GEAR;
  const pace = gearPace(gear);
  const pays = sellBonus(gear);
  // (a wider sweet spot: what is not a direct blow shrinks with the square of its radius; a wider
  // Perfect window catches that many more of the direct ones)
  const wider = (1 + lodestoneSweet(gear)) ** 2;
  const pDirect = 1 - (1 - STEADY.ore.direct) / wider;
  const pNear = STEADY.ore.near / wider;
  const pPerfect = Math.min(0.9, STEADY.ore.perfect * perfectWindow(gear));
  const rand = seeded(pickTier * 211);
  const pickId = PICK_BY_TIER[pickTier - 1];
  const pick = PICKAXES[pickId];
  const map: MapId = "glimmering_caverns";
  const nodes = ORE_NODES.filter((n) => !ORE_KINDS[n.kind].crew && oreRule(pick.tier, n.kind) !== "deflect").map((n) => ({ ...n, readyAt: 0, at: n.approach }));
  const slots = SATCHEL_TIERS[Math.min(SATCHEL_TIERS.length - 1, pickTier)].slots + satchelBonus(gear);
  const sold: Record<string, number> = {};
  const value: Record<string, number> = {};
  const hold: Partial<Record<OreItemId, number>> = {};
  const used = () => (Object.entries(hold) as [OreItemId, number][]).reduce((a, [id, n]) => a + Math.ceil(n / stackOf(id)), 0);
  const blowS = Math.max(pick.swing / swingHaste(gear), STEADY.ore.tapS);
  /** A node's blows and its worth, on average. */
  const expect = (kind: OreKind) => {
    const info = ORE_KINDS[kind];
    const rule = oreRule(pick.tier, kind);
    const per = pick.damage * (rule === "under" ? 0.6 : 1) * (pDirect * (1 + pPerfect * (PERFECT_DAMAGE - 1)) * 1.15 + pNear * 0.5 + 0.0075);
    const blows = rule === "oneshot" ? 1 : Math.ceil(info.hp / per);
    const y = rollYieldMean(kind, pickId);
    return { secs: STEADY.ore.openS + blows * blowS, worth: y };
  };
  let t = 0;
  let coins = 0;
  let pos: Pt = GUS_FRONT;
  let streak = 0;
  const end = HOURS * 3600;
  const sell = () => {
    for (const [id, n] of Object.entries(hold) as [OreItemId, number][]) {
      coins += ORE_PRICES[id] * n * pays;
      sold[id] = (sold[id] ?? 0) + n;
      value[id] = (value[id] ?? 0) + ORE_PRICES[id] * n * pays;
      delete hold[id];
    }
  };
  while (t < end) {
    let best: { node: (typeof nodes)[number]; rate: number; walk: number } | null = null;
    for (const node of nodes) {
      const walk = walkS(map, pos, node.at) / pace;
      if (node.readyAt > t + walk) continue;
      const e = expect(node.kind);
      const rate = e.worth / (walk + e.secs);
      if (!best || rate > best.rate) best = { node, rate, walk };
    }
    if (!best) {
      t = Math.min(...nodes.map((n) => n.readyAt));
      continue;
    }
    const { node, walk } = best;
    const info = ORE_KINDS[node.kind];
    const rule = oreRule(pick.tier, node.kind);
    t += walk + STEADY.ore.openS;
    pos = node.at;
    let dmg = 0;
    let chase = 0;
    let chaseOn = false;
    let glint = glints && rand() < GLINT_CHANCE && node.kind !== "monolith";
    let clean = false;
    while (dmg < info.hp) {
      t += blowS;
      const r = rand();
      const direct = r < pDirect;
      const near = !direct && r < pDirect + pNear;
      const perfect = direct && rand() < pPerfect;
      if (direct) {
        chase = chaseOn ? Math.min(CHASE_MAX, chase + 1) : 0;
        chaseOn = true;
      } else {
        chase = 0;
        chaseOn = false;
      }
      if (perfect) streak++;
      else if (!direct) streak = 0;
      if (rule === "oneshot") {
        dmg = info.hp;
        clean = perfect;
        if (perfect && glint) hold[MASTERY_ORE[node.kind]] = (hold[MASTERY_ORE[node.kind]] ?? 0) + 1 + glintBonus(gear);
        break;
      }
      const base = pick.damage * (rule === "under" ? 0.6 : 1) * (direct ? 1 : near ? 0.5 : 0.15);
      dmg += Math.round(base * (perfect ? PERFECT_DAMAGE : 1) * (chasing ? chaseBonus(chase) : 1));
      clean = perfect;
      // (one glint a rock, on its weak spot until a Perfect claims it)
      if (perfect && glint) {
        hold[MASTERY_ORE[node.kind]] = (hold[MASTERY_ORE[node.kind]] ?? 0) + 1 + glintBonus(gear);
        glint = false;
      }
    }
    const share = streakBonus(streak) * (clean ? cleanBreakBonus(gear, CLEAN_BREAK_BONUS) : 1);
    const haul = rollYield(node.kind, pickId, rand, geodeFind(gear));
    // (an Opal ring's Bounty: a chance of one more of the rock's own ore)
    if (bonusOreChance(gear) > 0 && rand() < bonusOreChance(gear)) haul[MASTERY_ORE[node.kind]] = (haul[MASTERY_ORE[node.kind]] ?? 0) + 1;
    for (const [id, n] of Object.entries(haul) as [OreItemId, number][]) {
      const want = Math.floor(n * share) + (rand() < (n * share) % 1 ? 1 : 0);
      hold[id] = (hold[id] ?? 0) + want;
    }
    const [lo, hi] = info.respawnS;
    node.readyAt = t + lo + rand() * (hi - lo);
    if (used() >= slots) {
      t += walkS(map, pos, GUS_FRONT) / pace + STEADY.sellS;
      pos = GUS_FRONT;
      sell();
    }
  }
  sell();
  return { craft: "ore", tier: pickTier, where: "caverns", perMin: (coins / t) * 60, perMinSold: withMarket(value, sold, t), soldPerHour: perHour(sold, t) };
}

const yieldMeans = new Map<string, number>();
/** A node's haul in coins, on average (raw, uncracked, unsmelted). */
function rollYieldMean(kind: OreKind, pick: PickaxeId): number {
  const key = `${kind}:${pick}`;
  const hit = yieldMeans.get(key);
  if (hit !== undefined) return hit;
  const rand = seeded(kind.length * 7 + pick.length);
  let sum = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) for (const [id, n] of Object.entries(rollYield(kind, pick, rand)) as [OreItemId, number][]) sum += ORE_PRICES[id] * n;
  yieldMeans.set(key, sum / N);
  return sum / N;
}

// --- the table -----------------------------------------------------------------------------------------

export function simulate(only = process.env.ONLY ?? ""): Line[] {
  const out: Line[] = [];
  if (only) return only === "fish" ? [1, 2, 3, 4, 5].flatMap((t) => WATERS.map((w) => angler(t, w))) : only === "wood" ? [1, 2, 3, 4, 5].flatMap((t) => [woodcutter(t, "campfire_night", "campfire", BUSTER_FRONT), woodcutter(t, "whispering_woods", "woods", BRAMBLE_FRONT)]) : [1, 2, 3, 4, 5].map((t) => miner(t));
  for (let tier = 1; tier <= 5; tier++) for (const w of WATERS) out.push(angler(tier, w));
  for (let tier = 1; tier <= 5; tier++) {
    out.push(woodcutter(tier, "campfire_night", "campfire", BUSTER_FRONT));
    out.push(woodcutter(tier, "whispering_woods", "woods", BRAMBLE_FRONT));
  }
  for (let tier = 1; tier <= 5; tier++) out.push(miner(tier));
  return out;
}

// --- the gear: what a loadout adds --------------------------------------------------------------------------

/** A family's four pieces, worn, all at `rank` (and `rings` on the fingers). */
export function loadout(family: GearFamily | null, rank: number, rings: RingId[] = []): Loadout {
  const worn = family ? gearOfFamily(family) : [];
  return { worn, gearRank: Object.fromEntries(worn.map((id) => [id, rank])) as Partial<Record<GearId, number>>, ringsWorn: rings };
}
/** Any pieces at one rank. */
export function wearing(ids: GearId[], rank: number, rings: RingId[] = []): Loadout {
  return { worn: ids, gearRank: Object.fromEntries(ids.map((id) => [id, rank])) as Partial<Record<GearId, number>>, ringsWorn: rings };
}
const CRAFT_FAMILY = { fish: "angler", wood: "forester", ore: "prospector" } as const;
/** A craft at a tier, at its usual spot (the woods' river and trees from T3, the campfire before; the
 *  caverns), wearing `gear`: coins a minute as sold. */
export function withGear(craft: "fish" | "wood" | "ore", tier: number, gear: Loadout): number {
  if (craft === "fish") return angler(tier, WATERS[tier >= 3 ? 1 : 0], gear).perMinSold;
  if (craft === "wood") return (tier >= 2 ? woodcutter(tier, "whispering_woods", "woods", BRAMBLE_FRONT, gear) : woodcutter(tier, "campfire_night", "campfire", BUSTER_FRONT, gear)).perMinSold;
  return miner(tier, { gear }).perMinSold;
}
/** Every pair of rings worth wearing (two different gems, or one gem twice on two bands), all on the
 *  best band a tier could have forged. */
function ringPairs(band: (typeof RING_BAND_IDS)[number]): RingId[][] {
  const out: RingId[][] = [];
  for (let a = 0; a < RING_GEM_IDS.length; a++) for (let b = a + 1; b < RING_GEM_IDS.length; b++) out.push([ringId(band, RING_GEM_IDS[a]), ringId(band, RING_GEM_IDS[b])]);
  return out;
}
/** The gear's budget (docs/economy-plan.md section 9): what it may add to a minute's income, as sold.
 *  A full kit worn at its tier (the family at the tier's rank, the two best rings of the tier's band)
 *  adds between a tenth and a little under a tool tier's step (about 35%); the set alone at rank 5 at
 *  most a quarter, two rings an eighth, any one piece an eighth. */
export const GEAR_BUDGET = { kit: [0.1, 0.35], set: 0.26, rings: 0.15, piece: 0.125 } as const;

export interface GearLine {
  craft: "fish" | "wood" | "ore";
  tier: number;
  base: number;
  /** Its own family's four at ranks 1, 3 and 5; the Wayfarer's four at rank 5; the best two rings alone;
   *  and the most a player of this tier could wear (the family at its rank, the best rings). */
  rank1: number;
  rank3: number;
  rank5: number;
  wayfarer: number;
  rings: number;
  ringsWorn: string;
  all: number;
}
/** A piece is raised a rank a tool tier, a ring's band is its tier's metal: what a T`tier` player wears. */
const RANK_AT_TIER = [1, 1, 2, 3, 4, 5];
const BAND_AT_TIER = ["copper", "copper", "copper", "iron", "silver", "glimmer"] as const;
export function gearTable(tiers = [1, 3, 5]): GearLine[] {
  const out: GearLine[] = [];
  for (const craft of ["fish", "wood", "ore"] as const) {
    for (const tier of tiers) {
      const family = CRAFT_FAMILY[craft];
      const base = withGear(craft, tier, NO_GEAR);
      const band = BAND_AT_TIER[tier];
      let best = { pair: [] as RingId[], v: base };
      for (const pair of ringPairs(band)) {
        const v = withGear(craft, tier, loadout(null, 0, pair));
        if (v > best.v) best = { pair, v };
      }
      out.push({
        craft,
        tier,
        base,
        rank1: withGear(craft, tier, loadout(family, 1)),
        rank3: withGear(craft, tier, loadout(family, 3)),
        rank5: withGear(craft, tier, loadout(family, 5)),
        wayfarer: withGear(craft, tier, loadout("wayfarer", 5)),
        rings: best.v,
        ringsWorn: best.pair.join(" + "),
        all: withGear(craft, tier, loadout(family, RANK_AT_TIER[tier], best.pair)),
      });
    }
  }
  return out;
}
/** Each piece alone at rank 5, on the craft it is for (the Wayfarer's on fishing): how much it adds. */
export function pieceTable(tier = 5): { id: GearId; craft: string; gain: number }[] {
  const out: { id: GearId; craft: string; gain: number }[] = [];
  for (const family of GEAR_FAMILIES) {
    const craft = family === "angler" ? "fish" : family === "forester" ? "wood" : family === "prospector" ? "ore" : "fish";
    const base = withGear(craft, tier, NO_GEAR);
    for (const id of gearOfFamily(family)) out.push({ id, craft, gain: withGear(craft, tier, wearing([id], 5)) / base - 1 });
  }
  return out;
}

/** The best spot's income for each craft's tier. */
export function ladder(lines: Line[]): Record<string, number[]> {
  const best: Record<string, number[]> = { fish: [], riverFish: [], wood: [], ore: [] };
  for (let tier = 1; tier <= 5; tier++) {
    const of = (craft: string, f: (l: Line) => boolean = () => true) => Math.round(Math.max(0, ...lines.filter((l) => l.craft === craft && l.tier === tier && f(l)).map((l) => l.perMin)));
    best.fish.push(of("fish"));
    best.riverFish.push(of("fish", (l) => l.where !== "cenote"));
    best.wood.push(of("wood"));
    best.ore.push(of("ore"));
  }
  return best;
}

/** The income ladder (docs/economy-plan.md section 4): what a minute should earn at each tool tier,
 *  once the room's market has answered the player's own selling (`perMinSold`). The river's rods and
 *  the axes climb it through the campfire and the woods; the pickaxes start above them, in the
 *  caverns; the cenote pays about CENOTE_OVER_RIVER times the river on the same rod. */
export const TARGETS = { river: [25, 35, 50, 70, 95], wood: [25, 35, 50, 70, 95], ore: [100, 120, 145, 175, 210] };
export const CENOTE_OVER_RIVER = 1.7;
/** Each craft's best spot, tier by tier, as sold. */
export function soldLadder(lines: Line[]): { river: number[]; cenote: number[]; wood: number[]; ore: number[] } {
  const best = (f: (l: Line) => boolean) => [1, 2, 3, 4, 5].map((tier) => Math.max(0, ...lines.filter((l) => l.tier === tier && f(l)).map((l) => l.perMinSold)));
  return { river: best((l) => l.craft === "fish" && l.where !== "cenote"), cenote: best((l) => l.craft === "fish" && l.where === "cenote"), wood: best((l) => l.craft === "wood"), ore: best((l) => l.craft === "ore") };
}

/** What each tool costs today, tier 2 to 5. */
export const TOOL_PRICES = {
  rod: [TACKLE_PRICES.proRod, TACKLE_PRICES.heronRod, TACKLE_PRICES.masterRod, TACKLE_PRICES.moonlightRod],
  axe: [AXE_PRICES.iron, AXE_PRICES.tempered, AXE_PRICES.golden, AXE_PRICES.runic],
  pickaxe: [PICKAXE_PRICES.copper, PICKAXE_PRICES.reinforced, PICKAXE_PRICES.glimmer, PICKAXE_PRICES.drill],
};

/** The minutes of play each tool is meant to cost, tier 2 to 5, at its craft's target income of the
 *  step before it (docs/economy-plan.md section 6). */
export const TOOL_MINUTES = { rod: [20, 45, 90, 180], axe: [20, 45, 90, 180], pickaxe: [30, 60, 120, 180] };

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/economy-sim.ts")) {
  const lines = simulate();
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  console.log(`\nCoins a minute, active, solo, even market (${HOURS} simulated hours each; layout ${CAVERNS_LAYOUT.half * 2} m caverns)\n`);
  console.log(pad("craft", 6), pad("tier", 5), pad("where", 16), pad("even", 8), pad("sold solo", 10), "sold an hour");
  for (const l of lines) console.log(pad(l.craft, 6), pad("T" + l.tier, 5), pad(l.where, 16), pad(l.perMin.toFixed(1), 8), pad(l.perMinSold.toFixed(1), 10), JSON.stringify(l.soldPerHour));
  const lad = ladder(lines);
  console.log("\nThe ladder (each craft's best spot):");
  for (const [k, v] of Object.entries(lad)) console.log(pad(k, 10), v.map((n) => pad(n, 6)).join(""));
  const sl = soldLadder(lines);
  console.log("\nAs sold, against the target (coins a minute, and how far off):");
  const off = (v: number, t: number) => `${v.toFixed(0)} (${v >= t ? "+" : ""}${Math.round((v / t - 1) * 100)}%)`;
  console.log(pad("river", 10), sl.river.map((v, i) => pad(off(v, TARGETS.river[i]), 13)).join(""));
  console.log(pad("wood", 10), sl.wood.map((v, i) => pad(off(v, TARGETS.wood[i]), 13)).join(""));
  console.log(pad("ore", 10), sl.ore.map((v, i) => pad(off(v, TARGETS.ore[i]), 13)).join(""));
  console.log(pad("cenote", 10), sl.cenote.map((v, i) => pad(`${v.toFixed(0)} (x${(v / sl.river[i]).toFixed(2)})`, 13)).join(""));
  if (process.argv.includes("--gear")) {
    const pctOf = (v: number, b: number) => `${v.toFixed(0)} (${v >= b ? "+" : ""}${Math.round((v / b - 1) * 100)}%)`;
    console.log("\nThe gear (coins a minute as sold; each craft at its usual spot):");
    console.log(pad("craft", 6), pad("tier", 5), pad("bare", 6), pad("set R1", 12), pad("set R3", 12), pad("set R5", 12), pad("Wayfarer R5", 13), pad("2 rings", 12), pad("worn at tier", 13), "rings");
    for (const g of gearTable()) console.log(pad(g.craft, 6), pad("T" + g.tier, 5), pad(g.base.toFixed(0), 6), pad(pctOf(g.rank1, g.base), 12), pad(pctOf(g.rank3, g.base), 12), pad(pctOf(g.rank5, g.base), 12), pad(pctOf(g.wayfarer, g.base), 13), pad(pctOf(g.rings, g.base), 12), pad(pctOf(g.all, g.base), 13), g.ringsWorn);
    console.log("\nEach piece alone at rank 5, on a T5 tool:");
    for (const p of pieceTable()) console.log(pad(GEAR[p.id].name, 20), pad(p.craft, 6), `${p.gain >= 0 ? "+" : ""}${(p.gain * 100).toFixed(1)}%`);
  }
  console.log("\nMinutes of play to afford the next tool (at the income of the tier before it):");
  const rows: [string, number[], number[]][] = [["rod", TOOL_PRICES.rod, lad.riverFish], ["axe", TOOL_PRICES.axe, lad.wood], ["pickaxe", TOOL_PRICES.pickaxe, lad.ore]];
  for (const [name, prices, income] of rows) {
    const mins = prices.map((p, i) => p / Math.max(1, income[i]));
    console.log(pad(name, 10), mins.map((m) => pad(m.toFixed(0), 6)).join(""), "total", (mins.reduce((a, b) => a + b, 0) / 60).toFixed(1), "h");
  }
  console.log("\nMining, what the newest rules add (coins a minute, even market):");
  console.log(pad("pickaxe", 10), pad("as is", 8), pad("no glints", 11), "no glints, no chase");
  for (let tier = 1; tier <= 5; tier++) console.log(pad("T" + tier, 10), pad(miner(tier).perMin.toFixed(0), 8), pad(miner(tier, { glints: false }).perMin.toFixed(0), 11), miner(tier, { glints: false, chase: false }).perMin.toFixed(0));
  if (process.argv.includes("--write")) {
    writeFileSync("tests/economy-baseline.json", JSON.stringify({ lines: lines.map((l) => ({ craft: l.craft, tier: l.tier, where: l.where, perMin: Math.round(l.perMin * 10) / 10, perMinSold: Math.round(l.perMinSold * 10) / 10 })) }, null, 1) + "\n");
    console.log("\nwrote tests/economy-baseline.json");
  }
}
