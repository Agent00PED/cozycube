// The splitting block's rhythm, as both sides see it: the server rolls each swing's gauge
// (rollSplitSwing) and judges a strike on its own clock (judgeSplit); the client draws the same
// gauge from the same functions, so what you see is what is judged.
//
// "The Clean Split": beside the upright log a vertical gauge, a marker gliding up and down it, over
// a golden sweet spot. Strike (Space, or a tap) as the marker crosses it:
//
//   gold   on the sweet spot's bright centre: a thunderous clean split, a batch of 3-5 logs at once
//          and a bonus bundle of Firewood
//   hit    within the sweet spot: the axe goes through, two logs split
//   miss   anywhere else: a glancing blow, strike again
//
// Every log splits into its wood's bundles (shared/chop.ts WOOD firewood; half as many again with
// the Forester's Toolbelt). With a big stack (more than BULK_MIN_LOGS logs) the whole carrier can be
// split at once instead, at the plain yield (Bulk Process All: no bonus bundles).

/** A swing's gauge: one glide bottom to top (s: it ping-pongs), the sweet spot's place on it
 *  (0 bottom, 1 top), its band's half-height and its gold centre's. */
export interface SplitSwing {
  period: number;
  sweet: number;
  band: number;
  gold: number;
}
export type SplitVerdict = "gold" | "hit" | "miss";

/** Logs split by a gold strike (rolled), by a plain hit, and the gold strike's bonus bundles. */
export const SPLIT_GOLD_BATCH: readonly [number, number] = [3, 5];
export const SPLIT_HIT_BATCH = 2;
export const SPLIT_GOLD_BONUS = 1;
/** The pause after a strike that lands before the next swing's marker sets off (s). */
export const SPLIT_PAUSE_S = 0.5;
/** A splitter who stops striking lets the block go after this long (s). */
export const SPLIT_IDLE_S = 25;
/** More logs than this and Bulk Process All is offered (the plain yield, no minigame). */
export const BULK_MIN_LOGS = 15;

/** The marker's height on the gauge `t` seconds into the swing: 0 to 1 and back, eased at the ends. */
export function splitGauge(s: SplitSwing, t: number): number {
  const u = (Math.max(0, t) / s.period) % 2;
  const lin = u <= 1 ? u : 2 - u;
  return 0.5 - 0.5 * Math.cos(lin * Math.PI);
}
/** A strike `t` seconds into the swing: on the gold, in the sweet band, or a glance. */
export function judgeSplit(s: SplitSwing, t: number): SplitVerdict {
  const d = Math.abs(splitGauge(s, t) - s.sweet);
  return d <= s.gold ? "gold" : d <= s.band ? "hit" : "miss";
}
/** A fresh swing's gauge (the server rolls it): the sweet spot somewhere in the middle half, the
 *  marker a touch quicker as the rhythm builds (`streak`: clean strikes in a row, up to 6), slowed by
 *  the Lumberjack's Carved Belt (`slow`), its gold widened by Pine Pitch Grip Wax (`goldMul`). */
export function rollSplitSwing(streak = 0, rand: () => number = Math.random, slow = 0, goldMul = 1): SplitSwing {
  const period = (1.05 * (1 + slow)) / (1 + 0.04 * Math.min(6, Math.max(0, streak)));
  return { period, sweet: 0.3 + rand() * 0.4, band: 0.11, gold: Math.min(0.11, 0.04 * goldMul) };
}
/** How many logs a gold strike splits (3-5). */
export function rollGoldBatch(rand: () => number = Math.random): number {
  return SPLIT_GOLD_BATCH[0] + Math.floor(rand() * (SPLIT_GOLD_BATCH[1] - SPLIT_GOLD_BATCH[0] + 1));
}
