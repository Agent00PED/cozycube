// The Velvet Casino's rules: the Velvet Chip economy, and the three games played with chips
// (roulette, slots, blackjack). Where things stand (the tables, the slot row, Vance's cage) is the
// floor plan's business: shared/worlds/casino.ts.
//
// Shared between client and server — framework-agnostic (no THREE/Colyseus imports).

// --- Velvet Chips 🟡 ---------------------------------------------------------------------------
//
// A second balance, saved in the player record beside the coins. Coins buy chips at Vance's cage
// and chips cash back into coins there, at par; every casino game stakes and pays chips only.
// Nothing converts on its own: leaving the casino (or the Activity) keeps your chips for next time.
//
// A strictly virtual, free-to-play economy: neither coins nor chips can be bought with, or cashed
// out for, real money.

/** Coins per Velvet Chip, both ways: the cage takes no cut. */
export const COINS_PER_CHIP = 1;
/** The amounts the cashier modal offers, each way (with "all" beside them). */
export const CASHIER_AMOUNTS = [10, 50, 100, 500] as const;
/** The most chips anyone can hold (the same ceiling as coins, shared/types COIN_CAP). */
export const CHIP_CAP = 99_999;

/** The casino's slice of the player record (stats JSON "casino"). */
export interface CasinoProfile {
  chips: number;
}

export function emptyCasinoProfile(): CasinoProfile {
  return { chips: 0 };
}

/** A saved profile read back from the database: anything malformed becomes an empty one, so a
 *  player saved before the casino opened simply has no chips. */
export function sanitizeCasinoProfile(raw: unknown): CasinoProfile {
  const chips = (raw as { chips?: unknown } | null | undefined)?.chips;
  return { chips: typeof chips === "number" && Number.isFinite(chips) && chips > 0 ? Math.min(CHIP_CAP, Math.floor(chips)) : 0 };
}

/** What a player is worth: coins and chips together. The allowance (topped up only below a
 *  threshold) and the leaderboard read this, so parking coins as chips hides nothing. */
export function netWorth(coins: number, chips: number): number {
  return coins + chips * COINS_PER_CHIP;
}

/** Client -> server, at the cage window: "buyChips" (coins into chips) or "cashOut" (chips back
 *  into coins), `amount` in chips, or "all" of what the balance drawn on holds. */
export interface CashierRequest {
  amount: number | "all";
}

/** Server -> client ("cashierResult"), after an exchange: the balances it left. */
export interface CashierResult {
  ok: boolean;
  kind: "buy" | "cashout";
  /** Chips bought or cashed out (0 when refused). */
  amount: number;
  coins: number;
  chips: number;
  /** Why it was refused: too far from the window, nothing to exchange, or a malformed amount. */
  reason?: "far" | "funds" | "amount";
}

/** How many chips an exchange moves: `requested` ("all", or a whole number of at least 1), no
 *  more than `available` (what the balance drawn on holds, less any room left under the other's
 *  cap). null when the request is malformed; 0 when there is nothing to move. */
export function exchangeAmount(requested: unknown, available: number): number | null {
  const room = Math.max(0, Math.floor(available));
  if (requested === "all") return room;
  const n = Number(requested);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(Math.floor(n), room);
}

// --- roulette -------------------------------------------------------------------------------

export type RoulettePhase = "betting" | "spinning" | "payout";
export const ROULETTE_PHASE_SECONDS: Record<RoulettePhase, number> = { betting: 25, spinning: 6, payout: 4 };
/** European wheel order, clockwise. */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export function pocketColor(n: number): "green" | "red" | "black" {
  return n === 0 ? "green" : RED_NUMBERS.has(n) ? "red" : "black";
}
/** A bet target: "red" | "black" | "odd" | "even" | "n<0-36>". */
export type BetKind = string;
/** The roulette chip denominations, in Velvet Chips. */
export const CHIP_VALUES = [5, 10, 25] as const;
export const MAX_BET_TOTAL = 200;
export function isBetKind(kind: unknown): kind is BetKind {
  if (typeof kind !== "string") return false;
  if (kind === "red" || kind === "black" || kind === "odd" || kind === "even") return true;
  const m = /^n(\d{1,2})$/.exec(kind);
  return !!m && Number(m[1]) <= 36;
}
/** Total returned (stake included) for a winning bet, or 0. */
export function betReturn(kind: BetKind, amount: number, result: number): number {
  if (kind === "red" || kind === "black") return pocketColor(result) === kind ? amount * 2 : 0;
  if (kind === "odd") return result !== 0 && result % 2 === 1 ? amount * 2 : 0;
  if (kind === "even") return result !== 0 && result % 2 === 0 ? amount * 2 : 0;
  return kind === `n${result}` ? amount * 36 : 0;
}
/** Bets travel as "kind:amount,kind:amount". */
export function parseBets(raw: string): Record<BetKind, number> {
  const out: Record<BetKind, number> = {};
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const [k, n] = part.split(":");
    if (isBetKind(k) && Number(n) > 0) out[k] = Math.floor(Number(n));
  }
  return out;
}
export function encodeBets(bets: Record<BetKind, number>): string {
  return Object.entries(bets)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(",");
}
export interface RouletteSyncState {
  phase: RoulettePhase;
  timeLeft: number;
  result: number;
  spinId: number;
}
export interface RouletteResultBroadcast {
  result: number;
  winners: { sessionId: string; username: string; amount: number }[];
}

// --- slots ----------------------------------------------------------------------------------

export const SLOT_COST = 5;
/** Stakes the slot modal offers; a win scales with the stake. */
export const SLOT_BETS = [5, 10, 25] as const;
export const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "🍀", "💎", "7"] as const;
/** Payout multipliers (of the stake) for three of a kind, by symbol index. With the reels'
 *  weights (server/src/rooms/casino.ts: cherries common, sevens scarce) and a pair handing the
 *  stake back, the machines return about 96% of what goes in; 2x pairs used to make it 135%, a
 *  coin faucet once chips cash out 1:1. */
export const SLOT_TRIPLE = [6, 10, 15, 25, 40, 75];
/** Any pair (not three of a kind) returns the stake: a push. */
export const SLOT_PAIR = 1;
export interface SlotBroadcast {
  propId: string;
  sessionId: string;
  reels: [number, number, number];
  win: number;
  bet: number;
}

// --- blackjack ------------------------------------------------------------------------------

export const BLACKJACK_BETS = [10, 25, 50, 100] as const;
export interface BlackjackCard {
  rank: string; // "A", "2".."10", "J", "Q", "K"
  suit: string; // "♠" "♥" "♦" "♣"
}
export type BlackjackPhase = "idle" | "player" | "dealer" | "done";
export type BlackjackOutcome = "" | "blackjack" | "win" | "push" | "lose" | "bust";
/** What the player sees: the dealer's hole card stays hidden until the dealer plays. */
export interface BlackjackView {
  phase: BlackjackPhase;
  bet: number;
  player: BlackjackCard[];
  dealer: BlackjackCard[];
  holeHidden: boolean;
  playerTotal: number;
  dealerTotal: number;
  outcome: BlackjackOutcome;
  payout: number;
  canDouble: boolean;
}
export type BlackjackAction = "deal" | "hit" | "stand" | "double";
/** Best total with aces as 11 where that does not bust, else 1. */
export function blackjackTotal(cards: BlackjackCard[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces++;
      total += 11;
    } else if (c.rank === "J" || c.rank === "Q" || c.rank === "K") total += 10;
    else total += Number(c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}
