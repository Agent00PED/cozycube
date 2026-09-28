// The camp's market: supply and demand, room by room. Every good Barnaby, Finley, Buster and Bramble
// buy (every river fish, every kind of split wood, every carved piece) sells at its base price
// (shared/economy.ts) times its multiplier M, kept between 70% and 130% (and a log's size on top):
//
//   CurrentPrice = Math.round(BasePrice x M x SizeMultiplier)
//
//   oversupply   past OVERSUPPLY_AT (30) sold in the room this hour, each further sale knocks
//                OVERSUPPLY_DROP (2 points) off M, down to 70%
//   scarcity     a good nobody sold this hour, or one burned or carved (the bonfire, the stew, the
//                workbench), opens the next hour SCARCITY_RISE (3 points) higher, up to 130%
//
// The room keeps the market (MarketState, synced as JSON, saved with its scene); the server prices
// every sale with priceRun and the shops quote with it, so the two agree. The next hour's opening is
// known from this hour's trade (nextHourTrend): the chalkboards' forecast. The hour turns on the
// wall clock (UTC), and a room that slept through some catches up when it wakes (rollMarket).

import { fishOf } from "./fishing";
import { WOOD_KINDS, type WoodKind } from "./chop";
import { CRAFT_IDS, CRAFTS, type CraftId } from "./crafting";
import type { FishId } from "./fishing";

export type MarketGood = `fish:${FishId}` | `wood:${WoodKind}` | `craft:${CraftId}`;
export const fishGood = (id: FishId): MarketGood => `fish:${id}`;
export const woodGood = (k: WoodKind): MarketGood => `wood:${k}`;
export const craftGood = (c: CraftId): MarketGood => `craft:${c}`;

export const MARKET_MIN = 0.7;
export const MARKET_MAX = 1.3;
/** Sales of a good in the room in an hour past which each further one knocks OVERSUPPLY_DROP off. */
export const OVERSUPPLY_AT = 30;
export const OVERSUPPLY_DROP = 0.02;
/** A good unsold (or used up) through an hour opens the next this much higher. */
export const SCARCITY_RISE = 0.03;
export const MARKET_HOUR_MS = 3_600_000;
/** The most hours a sleeping room's market catches up on waking (after that it simply sits). */
const MAX_CATCH_UP_HOURS = 48;

/** Every good the market prices: the river's fish, the woods, and the pieces the bench sells. */
export const MARKET_GOODS: MarketGood[] = [
  ...fishOf("freshwater").map(fishGood),
  ...WOOD_KINDS.map(woodGood),
  ...CRAFT_IDS.filter((c) => CRAFTS[c].price > 0).map(craftGood),
];

/** The room's market: the hour it is on, each good's multiplier as the hour opened (a good not
 *  listed opens at 1) and as the hour before opened (for the arrows), and the hour's trade: sold,
 *  and used (burned or carved). */
export interface MarketState {
  hour: number;
  open: Partial<Record<MarketGood, number>>;
  prev: Partial<Record<MarketGood, number>>;
  sold: Partial<Record<MarketGood, number>>;
  used: Partial<Record<MarketGood, number>>;
}
export const emptyMarket = (now = Date.now()): MarketState => ({ hour: marketHour(now), open: {}, prev: {}, sold: {}, used: {} });

const clamp = (m: number) => Math.round(Math.max(MARKET_MIN, Math.min(MARKET_MAX, m)) * 1000) / 1000;
const numbers = (v: unknown): Partial<Record<MarketGood, number>> => {
  const out: Partial<Record<MarketGood, number>> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[k as MarketGood] = n;
  return out;
};

/** A market read back from the room's state or its saved scene (anything broken: a fresh one),
 *  rolled on to this hour. */
export function parseMarket(raw: string | null | undefined, now = Date.now()): MarketState {
  let m = emptyMarket(now);
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object" && Number.isInteger(v.hour)) m = { hour: v.hour, open: numbers(v.open), prev: numbers(v.prev), sold: numbers(v.sold), used: numbers(v.used) };
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

/** A good's multiplier right now in a market on its hour: the hour's opening, less the oversupply. */
function current(good: MarketGood, m: MarketState): number {
  const sold = m.sold[good] ?? 0;
  return clamp((m.open[good] ?? 1) - OVERSUPPLY_DROP * Math.max(0, sold - OVERSUPPLY_AT));
}
/** Where a good opens the hour after a market's: where it closed, and 3 points up if it went unsold
 *  (and wasn't oversupplied) or was burned or carved. */
function nextOpen(good: MarketGood, m: MarketState): number {
  const sold = m.sold[good] ?? 0;
  const scarce = sold <= OVERSUPPLY_AT && (sold === 0 || (m.used[good] ?? 0) > 0);
  return clamp(current(good, m) + (scarce ? SCARCITY_RISE : 0));
}

/** The market carried on to this hour: each hour it missed turned in turn. */
export function rollMarket(market: MarketState, now = Date.now()): MarketState {
  const hour = marketHour(now);
  if (market.hour >= hour) return market;
  let m = market;
  const steps = Math.min(MAX_CATCH_UP_HOURS, hour - market.hour);
  for (let i = 0; i < steps; i++) {
    const open: Partial<Record<MarketGood, number>> = {};
    for (const g of MARKET_GOODS) {
      const o = nextOpen(g, m);
      if (o !== 1) open[g] = o;
    }
    const prev: Partial<Record<MarketGood, number>> = {};
    for (const g of MARKET_GOODS) if ((m.open[g] ?? 1) !== 1) prev[g] = m.open[g]!;
    m = { hour: m.hour + 1, open, prev, sold: {}, used: {} };
  }
  return { ...m, hour };
}

/** What a good sells for right now, as a share of its base price. */
export function marketMultiplier(good: MarketGood, market: MarketState, now = Date.now()): number {
  return current(good, rollMarket(market, now));
}

/** Up or down against where the hour before opened, for the chalkboards' arrows. */
export function marketDirection(good: MarketGood, market: MarketState, now = Date.now()): "up" | "down" | "flat" {
  const m = rollMarket(market, now);
  const was = m.prev[good] ?? 1;
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

/** Counts one sale of a good (past the hour's 30th, the next sells 2 points lower). */
export function recordSale(market: MarketState, good: MarketGood, now = Date.now()): MarketState {
  const m = rollMarket(market, now);
  m.sold[good] = (m.sold[good] ?? 0) + 1;
  return m;
}
/** Counts `n` of a good burned or carved this hour (it opens the next hour higher). */
export function recordUse(market: MarketState, good: MarketGood, n = 1, now = Date.now()): MarketState {
  const m = rollMarket(market, now);
  if (n > 0) m.used[good] = (m.used[good] ?? 0) + n;
  return m;
}

/**
 * A run of sales priced one at a time, each at the price the ones before it left (past the hour's
 * 30th sale of a good, each knocks 2 points off the next of that good): what each piece fetches, the
 * total, and the market after. The server settles every sale with it, and the shops quote with it,
 * so the two agree.
 */
export function priceRun<T>(items: readonly T[], goodOf: (item: T) => MarketGood, priceAt: (item: T, mult: number) => number, market: MarketState, now = Date.now()): { prices: number[]; total: number; after: MarketState } {
  const start = rollMarket(market, now);
  let m: MarketState = { hour: start.hour, open: start.open, prev: start.prev, sold: { ...start.sold }, used: start.used };
  const prices = items.map((item) => {
    const good = goodOf(item);
    const price = priceAt(item, marketMultiplier(good, m, now));
    m = recordSale(m, good, now);
    return price;
  });
  return { prices, total: prices.reduce((a, b) => a + b, 0), after: m };
}
