// The market: an hourly economic drift and the room's own supply and demand. Every good the shops
// buy (every fish, every kind of split wood, every piece of the bench's furniture, everything Gus the
// Mole takes) sells at its base price (shared/economy.ts) times its multiplier M (and a log's size on
// top):
//
//   CurrentPrice = Math.round(BasePrice x M x SizeMultiplier)
//   M            = (1 + drift) x (1 - supply), kept between MARKET_MIN (50%) and MARKET_MAX (130%)
//
//   drift        every real-world hour each good's baseline shifts: DRIFT_MIN to DRIFT_MAX (10% to 25%)
//                up or down, rolled from the hour itself (the same everywhere, and known an hour ahead:
//                the chalkboards' forecast)
//   supply       the room's own trade: past OVERSUPPLY_AT (30) sold in the room this hour, each further
//                sale knocks OVERSUPPLY_DROP (2 points) more off, up to SUPPLY_MAX (30%) below the
//                baseline; the depression carries into the next hours, and a good nobody sold (or one
//                burned or carved: the bonfire, the stew, the workbench) recovers RECOVER_UNSOLD a
//                quiet hour toward its full price (RECOVER_SOLD while it still sells, in moderation)
//
// The room keeps the market (MarketState, synced as JSON, saved with its scene); the server prices
// every sale with priceRun and the shops quote with it, so the two agree. The shops and drawers show
// each price's percentage against its base with an arrow against the hour before (+18% ▲, 0% ▬,
// -15% ▼). The hour turns on the wall clock (UTC), and a room that slept through some catches up when
// it wakes (rollMarket).

import { fishOf } from "./fishing";
import { ORE_ITEM_IDS, type OreItemId } from "./caverns_mining";
import { WOOD_KINDS, type WoodKind } from "./chop";
import { CRAFT_IDS, CRAFTS, type CraftId } from "./crafting";
import type { FishId } from "./fishing";

export type MarketGood = `fish:${FishId}` | `wood:${WoodKind}` | `craft:${CraftId}` | `ore:${OreItemId}`;
export const fishGood = (id: FishId): MarketGood => `fish:${id}`;
export const woodGood = (k: WoodKind): MarketGood => `wood:${k}`;
export const craftGood = (c: CraftId): MarketGood => `craft:${c}`;
export const oreGood = (id: OreItemId): MarketGood => `ore:${id}`;

export const MARKET_MIN = 0.5;
export const MARKET_MAX = 1.3;
/** The hourly drift's reach: each good's baseline this far off its base price, up or down. */
export const DRIFT_MIN = 0.1;
export const DRIFT_MAX = 0.25;
/** Sales of a good in the room in an hour past which each further one deepens its supply depression
 *  by OVERSUPPLY_DROP, up to SUPPLY_MAX. */
export const OVERSUPPLY_AT = 30;
export const OVERSUPPLY_DROP = 0.02;
export const SUPPLY_MAX = 0.3;
/** How much of its supply depression a good wins back over an hour: unsold (or burned, or carved),
 *  and sold in moderation (no more than OVERSUPPLY_AT). */
export const RECOVER_UNSOLD = 0.06;
export const RECOVER_SOLD = 0.03;
export const MARKET_HOUR_MS = 3_600_000;
/** The most hours a sleeping room's market catches up on waking (after that it simply sits). */
const MAX_CATCH_UP_HOURS = 48;

/** Every good the market prices: the river's fish and the Cenote's, the woods, the pieces the bench
 *  sells, and everything Gus the Mole buys (the ores, the ingots, the geodes, the gems). */
export const MARKET_GOODS: MarketGood[] = [
  ...fishOf("freshwater").map(fishGood),
  ...fishOf("cavewater").map(fishGood),
  ...ORE_ITEM_IDS.map(oreGood),
  ...WOOD_KINDS.map(woodGood),
  // (the bench's furniture: a legacy piece is traded in at its full price, never on the market)
  ...CRAFT_IDS.filter((c) => CRAFTS[c].price > 0 && !CRAFTS[c].legacy).map(craftGood),
];

/** The room's market: the hour it is on, each good's supply depression as the hour opened (a good
 *  not listed: none), each good's multiplier as the hour before opened (for the arrows), and the
 *  hour's trade: sold, and used (burned or carved). */
export interface MarketState {
  hour: number;
  dep: Partial<Record<MarketGood, number>>;
  prev: Partial<Record<MarketGood, number>>;
  sold: Partial<Record<MarketGood, number>>;
  used: Partial<Record<MarketGood, number>>;
}
export const emptyMarket = (now = Date.now()): MarketState => ({ hour: marketHour(now), dep: {}, prev: {}, sold: {}, used: {} });

const clamp = (m: number) => Math.round(Math.max(MARKET_MIN, Math.min(MARKET_MAX, m)) * 1000) / 1000;
const numbers = (v: unknown, max = Infinity): Partial<Record<MarketGood, number>> => {
  const out: Partial<Record<MarketGood, number>> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[k as MarketGood] = Math.min(max, n);
  return out;
};

/** A market read back from the room's state or its saved scene (anything broken: a fresh one),
 *  rolled on to this hour. (One saved before the hourly drift starts with no supply depression.) */
export function parseMarket(raw: string | null | undefined, now = Date.now()): MarketState {
  let m = emptyMarket(now);
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object" && Number.isInteger(v.hour)) m = { hour: v.hour, dep: numbers(v.dep, SUPPLY_MAX), prev: numbers(v.prev), sold: numbers(v.sold), used: numbers(v.used) };
  } catch {
    // a broken record is a fresh market
  }
  return rollMarket(m, now);
}

export function marketHour(now = Date.now()): number {
  return Math.floor(now / MARKET_HOUR_MS);
}
/** How long until the next hour's prices. */
export function msUntilNextHour(now = Date.now()): number {
  return MARKET_HOUR_MS - (now % MARKET_HOUR_MS);
}

/** A good's drift in an hour: DRIFT_MIN to DRIFT_MAX, up or down, rolled from the hour and the good
 *  (the same in every room, and known ahead). */
export function hourDrift(good: MarketGood, hour: number): number {
  // (FNV-1a over the good's name and the hour, then a final mix)
  let h = 0x811c9dc5 ^ (hour & 0xffffffff) ^ Math.floor(hour / 0x100000000);
  for (let i = 0; i < good.length; i++) h = Math.imul(h ^ good.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  const u = (h >>> 1) / 0x80000000;
  const size = DRIFT_MIN + (DRIFT_MAX - DRIFT_MIN) * ((u * 2) % 1);
  return Math.round((u < 0.5 ? -size : size) * 1000) / 1000;
}

/** A good's supply depression right now: as the hour opened, deepened by this hour's oversupply. */
function supplyNow(good: MarketGood, m: MarketState): number {
  const sold = m.sold[good] ?? 0;
  return Math.min(SUPPLY_MAX, (m.dep[good] ?? 0) + OVERSUPPLY_DROP * Math.max(0, sold - OVERSUPPLY_AT));
}
/** A good's multiplier right now in a market on its hour. */
function current(good: MarketGood, m: MarketState): number {
  return clamp((1 + hourDrift(good, m.hour)) * (1 - supplyNow(good, m)));
}
/** Its supply depression as the next hour opens: where this hour leaves it, less the hour's
 *  recovery (a quiet or used-up good wins back RECOVER_UNSOLD, a moderately sold one RECOVER_SOLD,
 *  an oversupplied one nothing). */
function nextDep(good: MarketGood, m: MarketState): number {
  const sold = m.sold[good] ?? 0;
  const now = supplyNow(good, m);
  const back = sold > OVERSUPPLY_AT ? 0 : sold === 0 || (m.used[good] ?? 0) > 0 ? RECOVER_UNSOLD : RECOVER_SOLD;
  return Math.max(0, Math.round((now - back) * 1000) / 1000);
}
/** Where a good opens the hour after a market's. */
function nextOpen(good: MarketGood, m: MarketState): number {
  return clamp((1 + hourDrift(good, m.hour + 1)) * (1 - nextDep(good, m)));
}

/** The market carried on to this hour: each hour it missed turned in turn. */
export function rollMarket(market: MarketState, now = Date.now()): MarketState {
  const hour = marketHour(now);
  if (market.hour >= hour) return market;
  let m = market;
  const steps = Math.min(MAX_CATCH_UP_HOURS, hour - market.hour);
  for (let i = 0; i < steps; i++) {
    const dep: Partial<Record<MarketGood, number>> = {};
    const prev: Partial<Record<MarketGood, number>> = {};
    for (const g of MARKET_GOODS) {
      const d = nextDep(g, m);
      if (d > 0) dep[g] = d;
      prev[g] = clamp((1 + hourDrift(g, m.hour)) * (1 - (m.dep[g] ?? 0)));
    }
    m = { hour: m.hour + 1, dep, prev, sold: {}, used: {} };
  }
  return { ...m, hour };
}

/** What a good sells for right now, as a share of its base price. */
export function marketMultiplier(good: MarketGood, market: MarketState, now = Date.now()): number {
  return current(good, rollMarket(market, now));
}

/** Up or down against where the hour before opened, for the arrows. */
export function marketDirection(good: MarketGood, market: MarketState, now = Date.now()): "up" | "down" | "flat" {
  const m = rollMarket(market, now);
  const was = m.prev[good] ?? clamp(1 + hourDrift(good, m.hour - 1));
  const is = current(good, m);
  return is > was + 0.005 ? "up" : is < was - 0.005 ? "down" : "flat";
}

/** Where a good opens next hour, from this hour's trade so far (the chalkboards' forecast). */
export function nextHourTrend(good: MarketGood, market: MarketState, now = Date.now()): number {
  return nextOpen(good, rollMarket(market, now));
}
/** Of these goods, the one opening highest next hour, and how far above (or below) its base (a
 *  whole percent). */
export function forecast(goods: readonly MarketGood[], market: MarketState, now = Date.now()): { good: MarketGood; pct: number } | null {
  let best: { good: MarketGood; pct: number } | null = null;
  for (const good of goods) {
    const pct = Math.round((nextHourTrend(good, market, now) - 1) * 100);
    if (!best || pct > best.pct) best = { good, pct };
  }
  return best;
}

/** Counts one sale of a good (past the hour's 30th, each further one deepens its supply depression). */
export function recordSale(market: MarketState, good: MarketGood, now = Date.now()): MarketState {
  const m = rollMarket(market, now);
  m.sold[good] = (m.sold[good] ?? 0) + 1;
  return m;
}
/** Counts `n` of a good burned or carved this hour (it recovers as an unsold one does). */
export function recordUse(market: MarketState, good: MarketGood, n = 1, now = Date.now()): MarketState {
  const m = rollMarket(market, now);
  if (n > 0) m.used[good] = (m.used[good] ?? 0) + n;
  return m;
}

/**
 * A run of sales priced one at a time, each at the price the ones before it left (past the hour's
 * 30th sale of a good, each deepens its supply depression 2 points): what each piece fetches, the
 * total, and the market after. The server settles every sale with it, and the shops quote with it,
 * so the two agree.
 */
export function priceRun<T>(items: readonly T[], goodOf: (item: T) => MarketGood, priceAt: (item: T, mult: number) => number, market: MarketState, now = Date.now()): { prices: number[]; total: number; after: MarketState } {
  const start = rollMarket(market, now);
  let m: MarketState = { hour: start.hour, dep: start.dep, prev: start.prev, sold: { ...start.sold }, used: start.used };
  const prices = items.map((item) => {
    const good = goodOf(item);
    const price = priceAt(item, marketMultiplier(good, m, now));
    m = recordSale(m, good, now);
    return price;
  });
  return { prices, total: prices.reduce((a, b) => a + b, 0), after: m };
}
