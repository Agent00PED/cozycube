// The camp's hourly market. At the top of every hour (UTC) each thing Barnaby and Buster buy (every
// river fish, every kind of split wood, every carved piece) gets a fresh trend between 50% and 200%
// of its base price (shared/economy.ts), seeded by the hour, so the server and every client work out
// the same number with nothing sent. Every one sold that hour knocks 2% off its price (never under
// 50%); the next hour starts it fresh. Barnaby's chalkboard by his stall shows the hour's prices, an
// arrow against the hour before.
//
// The room keeps only the hour's sales (MarketState, synced as JSON); the server prices every sale
// from it, one piece at a time.

import { hashString } from "./types";
import type { FishId } from "./fishing";
import type { WoodKind } from "./chop";
import type { CraftId } from "./crafting";

export type MarketGood = `fish:${FishId}` | `wood:${WoodKind}` | `craft:${CraftId}`;
export const fishGood = (id: FishId): MarketGood => `fish:${id}`;
export const woodGood = (k: WoodKind): MarketGood => `wood:${k}`;
export const craftGood = (c: CraftId): MarketGood => `craft:${c}`;

export const MARKET_MIN = 0.5;
export const MARKET_MAX = 2;
/** What each sale knocks off the price, compounding. */
export const MARKET_SALE_DROP = 0.02;
export const MARKET_HOUR_MS = 3_600_000;

/** The room's record of the hour's sales. */
export interface MarketState {
  hour: number;
  sold: Partial<Record<MarketGood, number>>;
}
export const emptyMarket = (now = Date.now()): MarketState => ({ hour: marketHour(now), sold: {} });
export function parseMarket(raw: string | null | undefined, now = Date.now()): MarketState {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object" && Number.isInteger(v.hour) && v.sold && typeof v.sold === "object" && v.hour === marketHour(now)) return v as MarketState;
  } catch {
    // a broken record is a fresh hour
  }
  return emptyMarket(now);
}

export function marketHour(now = Date.now()): number {
  return Math.floor(now / MARKET_HOUR_MS);
}
/** How long until the next hour's prices. */
export function msUntilNextHour(now = Date.now()): number {
  return MARKET_HOUR_MS - (now % MARKET_HOUR_MS);
}

/** The hour's trend for a good: log-uniform between half and double, so as often up as down. */
export function marketTrend(good: MarketGood, hour: number): number {
  const u = (hashString(`${good}@${hour}`) % 100_000) / 100_000;
  return Math.pow(MARKET_MAX, u * 2 - 1);
}

/** What a good sells for right now, as a share of its base price: the hour's trend less 2% for
 *  every one already sold this hour. */
export function marketMultiplier(good: MarketGood, market: MarketState, now = Date.now()): number {
  const hour = marketHour(now);
  const sold = market.hour === hour ? (market.sold[good] ?? 0) : 0;
  return Math.max(MARKET_MIN, Math.min(MARKET_MAX, marketTrend(good, hour) * Math.pow(1 - MARKET_SALE_DROP, sold)));
}

/** Up or down against the hour before (as it opened), for the chalkboard's arrows. */
export function marketDirection(good: MarketGood, market: MarketState, now = Date.now()): "up" | "down" | "flat" {
  const was = marketTrend(good, marketHour(now) - 1);
  const is = marketMultiplier(good, market, now);
  return is > was * 1.02 ? "up" : is < was * 0.98 ? "down" : "flat";
}

/** The next hour's opening trend for a good: the trends are seeded by the hour, so it is known
 *  ahead (the chalkboards' forecast: worth holding, or locking, until then). */
export function nextHourTrend(good: MarketGood, now = Date.now()): number {
  return marketTrend(good, marketHour(now) + 1);
}
/** Of these goods, the one most in demand next hour, and how far above (or below) its base it
 *  opens (a whole percent). */
export function forecast(goods: readonly MarketGood[], now = Date.now()): { good: MarketGood; pct: number } | null {
  let best: { good: MarketGood; pct: number } | null = null;
  for (const good of goods) {
    const pct = Math.round((nextHourTrend(good, now) - 1) * 100);
    if (!best || pct > best.pct) best = { good, pct };
  }
  return best;
}

/** Counts one sale of a good (the next one sells 2% lower). */
export function recordSale(market: MarketState, good: MarketGood, now = Date.now()): MarketState {
  const hour = marketHour(now);
  const m = market.hour === hour ? market : emptyMarket(now);
  m.sold[good] = (m.sold[good] ?? 0) + 1;
  return m;
}

/**
 * A run of sales priced one at a time, each at the price the ones before it left (every sale of a
 * good knocks 2% off the next of that good): what each piece fetches, the total, and the market
 * after. The server settles every sale with it, and the shops quote with it, so the two agree.
 */
export function priceRun<T>(items: readonly T[], goodOf: (item: T) => MarketGood, priceAt: (item: T, mult: number) => number, market: MarketState, now = Date.now()): { prices: number[]; total: number; after: MarketState } {
  let m: MarketState = { hour: market.hour, sold: { ...market.sold } };
  const prices = items.map((item) => {
    const good = goodOf(item);
    const price = priceAt(item, marketMultiplier(good, m, now));
    m = recordSale(m, good, now);
    return price;
  });
  return { prices, total: prices.reduce((a, b) => a + b, 0), after: m };
}
