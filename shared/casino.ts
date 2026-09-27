// The Velvet Casino's rules: the Velvet Chip economy, every table's limits (the betting matrix and
// its ALL IN), and the games played with chips: roulette, slots (the Golden Vault too), the
// blackjack tables' rounds, Texas Hold'em's limits (its rules: shared/holdem.ts), baccarat (the
// hall's table and the penthouse's), the Big Six wheel, craps, the Mechanical Turf Club's derby and
// the coin pushers' shelves; the one-player machines' occupants (players and patrons), and the
// house's extras (the baby grand's pieces, Pippin's bar, Madame Zara, the capsule machine, the VIP
// pass: shared/items.ts). Where things stand is the floor plans' business: shared/worlds/casino.ts
// and casino_vip.ts (the Big Six's wheel is laid out there).
//
// Shared between client and server — framework-agnostic (no THREE/Colyseus imports).

import { BIG_SIX_WHEEL, type PusherId } from "./worlds/casino";
import type { HoldemMove } from "./holdem";

// --- Velvet Chips ---------------------------------------------------------------------------
//
// A second balance, saved in the player record beside the coins. Coins buy chips at Vance's cage
// and chips cash back into coins there, at par; every casino game stakes and pays chips only.
// Nothing converts on its own: leaving the casino (or the Activity) keeps your chips for next time.
//
// A strictly virtual, free-to-play economy: neither coins nor chips can be bought with, or cashed
// out for, real money.

/** The emote (over an avatar, in a toast) drawn as the Velvet Chip itself, not an emoji. */
export const CHIP_EMOTE = "velvet-chip";
/** Coins per Velvet Chip, both ways: the cage takes no cut. */
export const COINS_PER_CHIP = 1;
/** The cashier modal's quick amounts, each way: each adds to the amount (with "All" beside them). */
export const CASHIER_AMOUNTS = [50, 100, 500] as const;
/** The most chips anyone can hold: the penthouse's tables take 100,000 a bet and the Golden Vault
 *  pays six figures, so chips go far past the coin purse's ceiling (shared/types COIN_CAP). */
export const CHIP_CAP = 9_999_999;

/** The casino's slice of the player record (stats JSON "casino"). */
export interface CasinoProfile {
  chips: number;
  /** The capsule title worn over the name ("" for none; it must be owned: title_<id>). */
  title: string;
  /** The day (todayKey, UTC) Madame Zara last read this player's fortune, and which one it was. */
  fortuneDay: string;
  fortune: number;
  /** The Black Velvet VIP Pass (shared/items.ts), held for good once bought (until pawned). */
  vipPass: boolean;
}

export function emptyCasinoProfile(): CasinoProfile {
  return { chips: 0, title: "", fortuneDay: "", fortune: -1, vipPass: false };
}

/** A saved profile read back from the database: anything malformed becomes an empty one, so a
 *  player saved before the casino opened simply has no chips (and one saved before the expansion
 *  no title, and no fortune told). */
export function sanitizeCasinoProfile(raw: unknown): CasinoProfile {
  const r = (raw ?? {}) as { chips?: unknown; title?: unknown; fortuneDay?: unknown; fortune?: unknown; vipPass?: unknown };
  const chips = r.chips;
  return {
    chips: typeof chips === "number" && Number.isFinite(chips) && chips > 0 ? Math.min(CHIP_CAP, Math.floor(chips)) : 0,
    title: typeof r.title === "string" && isCasinoTitle(r.title) ? r.title : "",
    fortuneDay: typeof r.fortuneDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.fortuneDay) ? r.fortuneDay : "",
    fortune: typeof r.fortune === "number" && Number.isInteger(r.fortune) && r.fortune >= 0 && r.fortune < ZARA_FORTUNES.length ? r.fortune : -1,
    vipPass: r.vipPass === true,
  };
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

// --- the betting matrix -----------------------------------------------------------------------
//
// Every game has a table minimum, a row of preset stakes and a cap. [ ALL IN ] stakes everything
// you hold, up to the cap: min(chips, max). The server checks every stake against the same table,
// so a stake outside it is refused whatever the client sends. A brass placard on each game's panel
// reads "MIN: 25 | MAX ALL-IN: 1,000".

export type TableId = "blackjack_casual" | "blackjack_high" | "poker" | "poker_vip" | "slots" | "slots_vault" | "baccarat" | "baccarat_hall" | "bigsix" | "roulette_inside" | "roulette_outside" | "craps" | "derby" | "pusher" | "pusher_high" | "pinball";
export interface TableLimit {
  name: string;
  min: number;
  max: number;
  presets: readonly number[];
}
export const TABLE_LIMITS: Record<TableId, TableLimit> = {
  blackjack_casual: { name: "Blackjack · Table 1 (Casual)", min: 25, max: 1000, presets: [25, 50, 100, 250, 500] },
  blackjack_high: { name: "Blackjack · Table 2 (High Stakes)", min: 100, max: 5000, presets: [100, 250, 500, 1000, 2500] },
  // Hold'em's buy-in for a hand (every seat starts with as much; blinds 5/10)
  poker: { name: "Texas Hold'em · No Limit", min: 100, max: 2000, presets: [100, 250, 500, 1000, 2000] },
  // the penthouse's high-limit table (blinds 250/500)
  poker_vip: { name: "High-Limit Hold'em", min: 5000, max: 50000, presets: [5000, 10000, 25000, 50000] },
  slots: { name: "Neon Alley Slots", min: 10, max: 500, presets: [10, 25, 50, 100, 250] },
  slots_vault: { name: "The Golden Vault", min: 500, max: 10000, presets: [500, 1000, 2500, 5000] },
  baccarat: { name: "High-Limit Baccarat", min: 2500, max: 100000, presets: [2500, 5000, 10000, 25000, 50000] },
  baccarat_hall: { name: "Baccarat · Punto Banco", min: 25, max: 2500, presets: [25, 50, 100, 250, 500] },
  bigsix: { name: "The Big Six Wheel", min: 10, max: 1000, presets: [10, 25, 50, 100, 250] },
  // per spot: a straight-up number pays 35:1, red/black/odd/even 1:1
  roulette_inside: { name: "Roulette · Inside (straight up)", min: 10, max: 500, presets: [10, 25, 50, 100] },
  roulette_outside: { name: "Roulette · Outside (even money)", min: 25, max: 2500, presets: [25, 50, 100, 250, 500] },
  craps: { name: "Craps", min: 25, max: 1000, presets: [25, 50, 100, 250, 500] },
  derby: { name: "The Mechanical Turf Club", min: 10, max: 250, presets: [10, 25, 50, 100] },
  pusher: { name: "The Coin Pusher", min: 2, max: 25, presets: [2, 5, 10] },
  pusher_high: { name: "The High-Roller Pusher", min: 25, max: 250, presets: [25, 50, 100] },
  pinball: { name: "Velvet Nights Pinball", min: 10, max: 100, presets: [10, 25, 50, 100] },
};

/** ALL IN: everything you hold up to the table's cap, or 0 when that is under its minimum.
 *  `share`: the part of the chips one stake may take. */
export function allInBet(chips: number, limit: TableLimit, share = 1): number {
  const n = Math.min(Math.floor(Math.max(0, chips) * share), limit.max);
  return n >= limit.min ? n : 0;
}
/** A stake the table takes: a whole number of chips within its limits, or null. */
export function tableStake(amount: unknown, limit: TableLimit): number | null {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < limit.min || n > limit.max) return null;
  return n;
}
/** "MIN: 25 | MAX ALL-IN: 1,000" */
export function limitPlacard(limit: TableLimit): string {
  return `MIN: ${limit.min.toLocaleString("en-US")} | MAX ALL-IN: ${limit.max.toLocaleString("en-US")}`;
}
/** Chips shown the casino's way: 1,250. */
export const chipText = (n: number) => Math.floor(n).toLocaleString("en-US");
/** Chips shown short where room is tight: 950, 12.5K, 1.2M. */
export function chipShort(n: number): string {
  const v = Math.floor(n);
  if (v >= 1_000_000) return `${Math.floor(v / 100_000) / 10}M`;
  if (v >= 10_000) return `${Math.floor(v / 100) / 10}K`;
  return v.toLocaleString("en-US");
}

/** What Mr. Vance says to a player with no chips and no coins. */
export const VANCE_BROKE_LINE = "Down on your luck, friend? Head to the Campfire to fish or chop wood, or claim your daily allowance!";

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
/** The chip rack under the wheel: every denomination either kind of spot takes. */
export const CHIP_VALUES = [10, 25, 50, 100, 250, 500] as const;
/** The most one player may have on the wheel in a round, all spots together. */
export const MAX_BET_TOTAL = 5000;
/** A straight-up number is an inside bet; red, black, odd and even are outside bets. */
export const isInsideBet = (kind: BetKind) => kind.startsWith("n");
export const rouletteLimit = (kind: BetKind) => TABLE_LIMITS[isInsideBet(kind) ? "roulette_inside" : "roulette_outside"];
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

/** The slot machine's limits: the penthouse's Golden Vault has its own. */
export const slotLimit = (propId: string) => TABLE_LIMITS[propId === VAULT_SLOT_ID ? "slots_vault" : "slots"];
/** The penthouse's Golden Vault (the same reels and paytable, 500 to 10,000 a pull: three sevens at
 *  the top stake pay 750,000). */
export const VAULT_SLOT_ID = "slot_vault";
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

/** A playing card (blackjack, Hold'em and baccarat deal from the same 52). */
export interface Card {
  rank: string; // "A", "2".."10", "J", "Q", "K"
  suit: string; // "♠" "♥" "♦" "♣"
}
export type BlackjackCard = Card;
export type BlackjackOutcome = "" | "blackjack" | "win" | "push" | "lose" | "bust";

// Each table runs its own rounds for the players on its stools (nobody bets standing up). The first
// bet opens the betting window (BLACKJACK_BET_SECONDS; it closes early once everyone seated has
// bet), then two cards to every hand and two to the dealer, one face down. Everyone plays their own
// hands at once: hit, stand, double down on two cards, split a pair (up to BLACKJACK_MAX_HANDS
// hands; split aces take one card each, and 21 after a split is not a blackjack). When every hand is
// done, or the turn clock runs out (the rest stand), the dealer draws to 17 and the table settles.
export const BLACKJACK_BET_SECONDS = 10;
export const BLACKJACK_TURN_SECONDS = 30;
export const BLACKJACK_SETTLE_SECONDS = 5;
export const BLACKJACK_MAX_HANDS = 4;
export type BlackjackTier = "blackjack_casual" | "blackjack_high";
export type BlackjackTablePhase = "betting" | "playing" | "settled";
export type BlackjackHandStatus = "playing" | "stood" | "bust" | "blackjack";
export interface BlackjackHandView {
  cards: Card[];
  bet: number;
  total: number;
  status: BlackjackHandStatus;
  doubled: boolean;
  outcome: BlackjackOutcome;
  payout: number;
}
export interface BlackjackSeatView {
  sessionId: string;
  username: string;
  /** The stool (its seat propId). */
  stool: string;
  /** The bet put down for the next deal (betting), or 0. */
  bet: number;
  hands: BlackjackHandView[];
}
/** Server -> everyone ("blackjackTable"): one table's round, as all can see it. */
export interface BlackjackTableView {
  tableId: string;
  tier: BlackjackTier;
  phase: BlackjackTablePhase;
  /** Whole seconds left on the betting window or the turn clock (0: waiting for a first bet). */
  timeLeft: number;
  round: number;
  dealer: Card[];
  holeHidden: boolean;
  dealerTotal: number;
  seats: BlackjackSeatView[];
}
export type BlackjackAction = "bet" | "hit" | "stand" | "double" | "split";
/** A pair to split: two cards of one rank. */
export const canSplit = (cards: Card[]) => cards.length === 2 && cards[0].rank === cards[1].rank;
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
/** Server -> everyone ("blackjackResult"): a hand settled at a table (its dealer knocks the felt for
 *  a natural). */
export interface BlackjackResult {
  sessionId: string;
  tableId: string;
  outcome: BlackjackOutcome;
}

// --- Texas Hold'em: the rules live in shared/holdem.ts ----------------------------------------------

/** Server -> everyone ("pokerResult"): a hand of Hold'em over (Boris has a word for it). */
export interface PokerResult {
  sessionId: string;
  table: "poker" | "poker_vip";
  /** "win" (you took a pot), "lose", "fold", "split". */
  outcome: "win" | "lose" | "fold" | "split";
  /** Your hand's name at the showdown ("" if it never came to one). */
  hand: string;
  net: number;
}

// --- craps: your own dice at the table ----------------------------------------------------------
//
// Every roll settles the one-roll bets (the Field and Any 7); the Pass Line rides until it is
// decided: on the come-out a 7 or 11 wins and a 2, 3 or 12 loses, any other total sets the point,
// and the shooter rolls on until the point comes again (a win) or a 7 (a loss). A Pass bet goes down
// only on a come-out.

export type CrapsBet = "pass" | "field" | "any7";
export const CRAPS_BETS: CrapsBet[] = ["pass", "field", "any7"];
export const CRAPS_INFO: Record<CrapsBet, { name: string; pays: string }> = {
  pass: { name: "Pass Line", pays: "1:1" },
  field: { name: "Field", pays: "2·3·4·9·10·11·12 — 1:1, 2:1 on 2 and 12" },
  any7: { name: "Any 7", pays: "4:1" },
};
const FIELD_WINS = [3, 4, 9, 10, 11];
const POINTS = [4, 5, 6, 8, 9, 10];
/** What a bet brings back on a roll (the stake included): 0 when lost, null while the pass line
 *  still rides on its point. */
export function crapsReturn(bet: CrapsBet, amount: number, total: number, point: number): number | null {
  if (bet === "field") return total === 2 || total === 12 ? amount * 3 : FIELD_WINS.includes(total) ? amount * 2 : 0;
  if (bet === "any7") return total === 7 ? amount * 5 : 0;
  if (point === 0) return total === 7 || total === 11 ? amount * 2 : total === 2 || total === 3 || total === 12 ? 0 : null;
  return total === point ? amount * 2 : total === 7 ? 0 : null;
}
/** The point a roll leaves: set by a come-out 4, 5, 6, 8, 9 or 10; gone once it is decided. */
export function crapsPoint(total: number, point: number): number {
  if (point === 0) return POINTS.includes(total) ? total : 0;
  return total === point || total === 7 ? 0 : point;
}
/** New stakes going down with a roll (0: none on that bet). */
export type CrapsStakes = Record<CrapsBet, number>;
export interface CrapsView {
  point: number;
  /** What rides on the pass line between rolls. */
  pass: number;
  dice: [number, number] | null;
  rollId: number;
  /** The last roll's bets: what each staked and brought back (null: still riding). */
  results: { bet: CrapsBet; amount: number; returned: number | null }[];
  payout: number;
}

// --- the Mechanical Turf Club -------------------------------------------------------------------
//
// Four clockwork horses on a felt track, one race for the whole room: the first ticket bought opens
// a short betting window (anyone at the table can buy one, on one horse), then they're off. A
// winning ticket returns `pays` times its stake (the favourite's "2 for 1" hands back double); the
// weights make every ticket worth about 88% of its stake over time, so no horse is a sure thing.

export interface DerbyRacer {
  name: string;
  pays: number;
  weight: number;
  color: string;
}
export const DERBY_RACERS: DerbyRacer[] = [
  { name: "Velvet Thunder", pays: 2, weight: 441, color: "#c8323c" },
  { name: "Lucky Buttons", pays: 3, weight: 294, color: "#3a78d8" },
  { name: "Midnight Mocha", pays: 5, weight: 176, color: "#8e5a2b" },
  { name: "Clover Dash", pays: 10, weight: 89, color: "#2e9e5b" },
];
export const DERBY_LANES = DERBY_RACERS.length;
export const DERBY_HORSES = DERBY_RACERS.map((r) => r.name);
/** How long the window stays open after the first ticket, and how long a race runs. */
export const DERBY_BET_SECONDS = 12;
export const DERBY_RACE_MS = 7000;
/** The winning lane for a roll in [0, 1). */
export function rollDerby(roll: number): number {
  const total = DERBY_RACERS.reduce((a, r) => a + r.weight, 0);
  let left = roll * total;
  for (let i = 0; i < DERBY_RACERS.length; i++) {
    left -= DERBY_RACERS[i].weight;
    if (left < 0) return i;
  }
  return 0;
}
/** A small deterministic generator (mulberry32): the race's paces come out the same on every
 *  client from the one seed. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
/** Each horse's pace over the race's four stretches; the winner's made the quickest overall. */
export function derbyPaces(seed: number, winner: number): number[][] {
  const r = seededRandom(seed);
  const pace = Array.from({ length: DERBY_LANES }, () => Array.from({ length: 4 }, () => 0.7 + r() * 0.6));
  const total = (k: number) => pace[k].reduce((a, b) => a + b, 0);
  const best = Math.max(...pace.map((_, k) => total(k)));
  if (total(winner) < best + 0.2) pace[winner][3] += best + 0.2 - total(winner);
  return pace;
}
/** How far down the track (0 to 1) lane `k` is `ms` into the race: the winner reaches the post a
 *  little before the race's end, the rest just short of it. */
export function derbyProgress(pace: number[][], k: number, ms: number): number {
  const totals = pace.map((row) => row.reduce((a, b) => a + b, 0));
  const best = Math.max(...totals);
  const u = Math.max(0, ms) / (DERBY_RACE_MS - 800);
  let dist = 0;
  for (let j = 0; j < 4; j++) dist += pace[k][j] * Math.max(0, Math.min(1, u * 4 - j));
  return Math.min(1, (dist / best) * (totals[k] >= best - 1e-6 ? 1 : 0.985));
}
export type DerbyPhase = "idle" | "betting" | "racing";
export interface DerbyTicket {
  sessionId: string;
  username: string;
  horse: number;
  amount: number;
}
/** Server -> everyone ("derbyState"). */
export interface DerbyState {
  phase: DerbyPhase;
  /** Whole seconds until the gates open (betting) or the race ends (racing). */
  timeLeft: number;
  raceId: number;
  /** The last race's winner (-1 before any), and what it paid whom. */
  winner: number;
  tickets: DerbyTicket[];
  paid: { sessionId: string; username: string; amount: number }[];
  seed: number;
}

// --- the coin pushers ---------------------------------------------------------------------------
//
// Two machines side by side in Neon Alley: the house's (2 to 25 chips a coin) and the gold-trimmed
// High-Roller Pusher (25 to 250). Each has a real shelf of coins (shared/pusherSim.ts, run by the
// server and kept with the room's scene): a brass dropper sweeps across the top; drop a coin and it
// rattles down the pegs onto the shelf (an outer lane sends it down a side chute, to the house), the
// motorised plate shoves, and what goes over the front edge into the tray is yours for a while
// after your last coin (a coin going over hugging the left rail finds the house's gutter). Over time
// a well-aimed coin brings back about 92% of what it costs, a wild one about 79%; what one coin brings
// depends on the coins the last players (and the patrons, who drop real chips on them) left behind.
// Now and then a Bonus Token drops: a free coin at the same stake.

export const PUSHER_SWEEP_MS = 1600;
/** The dropper's place along the shelf (0 to 1) at `ms`: a steady sweep, there and back. */
export function pusherBarPos(ms: number): number {
  const t = (((ms % (PUSHER_SWEEP_MS * 2)) + PUSHER_SWEEP_MS * 2) % (PUSHER_SWEEP_MS * 2)) / PUSHER_SWEEP_MS;
  return t <= 1 ? t : 2 - t;
}
/** 1 dead centre, 0 at either end. */
export const pusherAccuracy = (pos: number) => 1 - Math.min(1, Math.abs(Math.max(0, Math.min(1, pos)) - 0.5) * 2);
/** Each pusher: its name, its stakes, and the shelf the house lays out when it is new (coins of the
 *  table minimum, so a fresh shelf is no windfall). */
export const PUSHER_MACHINES: Record<PusherId, { name: string; limit: "pusher" | "pusher_high"; seedCoins: number; seedValue: number }> = {
  coin_pusher: { name: "The Coin Pusher", limit: "pusher", seedCoins: 63, seedValue: 2 },
  coin_pusher_high: { name: "The High-Roller Pusher", limit: "pusher_high", seedCoins: 63, seedValue: 25 },
};
/** A coin's chance of dropping a Bonus Token (a free coin at the same stake). */
export const PUSHER_TOKEN_CHANCE = 0.02;
/** Coins going over the edge are the last dropper's this long after their last coin (then the house's). */
export const PUSHER_CREDIT_MS = 10_000;
/** Server -> the player at a pusher ("pusherView"), about ten times a second: the shelf now (its
 *  simulated time, for the plate, and its coins: shared/pusherSim.ts packShelf). */
export interface PusherView {
  propId: PusherId;
  t: number;
  coins: number[];
}
/** Server -> the player at a pusher ("pusherEvent"): a coin dropped (its path down the pegs, and
 *  whether it made the shelf or went down a chute), or coins over the edge (and what that paid you). */
export type PusherEvent =
  | { propId: PusherId; kind: "drop"; path: number[]; landed: boolean; id: number; v: number }
  | { propId: PusherId; kind: "fall"; falls: { id: number; x: number; v: number; gutter: boolean }[]; paid: number };
/** Server -> the player ("pusherPurse"): their chips and free coins at a pusher, after a drop or a
 *  payout. */
export interface PusherPurse {
  propId: PusherId;
  chips: number;
  /** Free coins held at this pusher (their stakes). */
  tokens: number[];
  /** Chips just paid out, and whether a free coin was just spent. */
  paid?: number;
  free?: boolean;
}

// --- the pinball machines ------------------------------------------------------------------------
//
// Velvet Nights, played for chips: a credit (10 to 100) buys three balls, taken as the first ball is
// launched; when the game is over the score is paid by its tier (the stake times the multiple, the
// stake itself back at 1x). The score paid on is the server's own: it replays the game from the
// player's inputs (shared/pinball.ts), so a game can't be claimed, only played. Closing the panel
// mid-game ends it there, paid on the score so far. The tiers and the table's points are
// calibrated together (a steady player about breaks even, a good one comes out ahead).

/** The score tiers, best first: at or over `score` pays the stake times `mult`. */
export const PINBALL_TIERS: readonly { score: number; mult: number; label: string }[] = [
  { score: 20000, mult: 5, label: "Jackpot" },
  { score: 10000, mult: 2.5, label: "Wizard" },
  { score: 5000, mult: 1.5, label: "Hot Streak" },
  { score: 3000, mult: 1, label: "Replay" },
];
/** A score's tier (null: under the lowest). */
export const pinballTier = (score: number) => PINBALL_TIERS.find((t) => score >= t.score) ?? null;
/** Server -> the player: their credit is in (its game id, what it cost, their chips now). */
export interface PinballStarted {
  propId: string;
  gameId: number;
  stake: number;
  chips: number;
}
/** Server -> the player: the game as the server replayed it, and what it paid. */
export interface PinballResult {
  propId: string;
  gameId: number;
  score: number;
  mult: number;
  payout: number;
  chips: number;
}

// --- the baby grand -----------------------------------------------------------------------------

/** What the piano plays by itself (shared/pianoPieces.ts holds the notes): public-domain pieces and
 *  the house's own. */
export type PianoPieceId = "fur_elise" | "gymnopedie" | "velvet_hour";
/** Server -> everyone ("pianoRecital"): a recital starting (or `piece` "" when it stops). */
export interface PianoRecital {
  sessionId: string;
  piece: PianoPieceId | "";
}
/** Server -> everyone but the player ("pianoNote"): a key pressed at the baby grand. */
export interface PianoNote {
  sessionId: string;
  midi: number;
}
/** The keys you can play yourself: two octaves up from C4. */
export const PIANO_LOW = 60;
export const PIANO_HIGH = 84;

// --- baccarat (Punto Banco): the hall's kidney table and the Velvet Penthouse's ------------------------
//
// Each table runs one coup at a time for its seated players: the first bet opens a betting window
// (BACCARAT_BET_SECONDS), then the shoe deals Player and Banker two cards each and the tableau
// decides any third card. A winning Player bet pays 1:1, Banker 0.95:1 (the house's 5%), Tie 8:1;
// on a tie, Player and Banker bets come back. Scarlett the red panda deals the hall's table, at its
// own limits (baccarat_hall); upstairs, Duchess Penelope bets every coup too.

export type BaccaratTable = "baccarat" | "baccarat_hall";
/** Each table's seated game (shared/worlds SEATED_GAMES) and its dealer. */
export const BACCARAT_TABLES: Record<BaccaratTable, { propId: string; dealer: string; seatPrefix: string }> = {
  baccarat: { propId: "baccarat_table", dealer: "Duchess Penelope's table", seatPrefix: "seat_bacc_" },
  baccarat_hall: { propId: "hall_baccarat_table", dealer: "Scarlett", seatPrefix: "seat_hbacc_" },
};

export type BaccaratBet = "player" | "banker" | "tie";
export const BACCARAT_BETS: BaccaratBet[] = ["player", "banker", "tie"];
export const BACCARAT_INFO: Record<BaccaratBet, { name: string; pays: string }> = {
  player: { name: "Player", pays: "1:1" },
  banker: { name: "Banker", pays: "0.95:1" },
  tie: { name: "Tie", pays: "8:1" },
};
export const BACCARAT_BET_SECONDS = 12;
/** How long the cards take to come out, and the result stays up. */
export const BACCARAT_DEAL_SECONDS = 5;
export const BACCARAT_SETTLE_SECONDS = 5;
/** A card's worth: aces 1, tens and faces 0. */
export const baccaratValue = (c: Card) => (c.rank === "A" ? 1 : c.rank === "10" || c.rank === "J" || c.rank === "Q" || c.rank === "K" ? 0 : Number(c.rank));
export const baccaratTotal = (cards: Card[]) => cards.reduce((t, c) => t + baccaratValue(c), 0) % 10;
/** The banker's third card by the tableau: on `total`, given the player's third card (null: the
 *  player stood). */
export function bankerDraws(total: number, playerThird: Card | null): boolean {
  if (playerThird === null) return total <= 5;
  const p = baccaratValue(playerThird);
  if (total <= 2) return true;
  if (total === 3) return p !== 8;
  if (total === 4) return p >= 2 && p <= 7;
  if (total === 5) return p >= 4 && p <= 7;
  if (total === 6) return p === 6 || p === 7;
  return false;
}
/** One coup dealt from `draw` by the rules. */
export function baccaratCoup(draw: () => Card): { player: Card[]; banker: Card[]; winner: BaccaratBet; natural: boolean } {
  const player = [draw()];
  const banker = [draw()];
  player.push(draw());
  banker.push(draw());
  const pt = baccaratTotal(player);
  const bt = baccaratTotal(banker);
  const natural = pt >= 8 || bt >= 8;
  if (!natural) {
    let third: Card | null = null;
    if (pt <= 5) {
      third = draw();
      player.push(third);
    }
    if (bankerDraws(bt, third)) banker.push(draw());
  }
  const p = baccaratTotal(player);
  const b = baccaratTotal(banker);
  return { player, banker, winner: p > b ? "player" : b > p ? "banker" : "tie", natural };
}
/** What a bet brings back on a coup (the stake included): a tie hands Player and Banker bets back. */
export function baccaratReturn(bet: BaccaratBet, amount: number, winner: BaccaratBet): number {
  if (winner === "tie") return bet === "tie" ? amount * 9 : amount;
  if (bet !== winner) return 0;
  return bet === "banker" ? Math.floor(amount * 1.95) : amount * 2;
}
export type BaccaratPhase = "betting" | "dealing" | "settled";
export interface BaccaratStake {
  sessionId: string;
  username: string;
  bet: BaccaratBet;
  amount: number;
}
/** Server -> everyone ("baccaratState"): one table's coup. */
export interface BaccaratState {
  table: BaccaratTable;
  phase: BaccaratPhase;
  /** Whole seconds left in this phase (0 while waiting for a first bet). */
  timeLeft: number;
  round: number;
  stakes: BaccaratStake[];
  player: Card[];
  banker: Card[];
  winner: BaccaratBet | "";
  paid: { sessionId: string; username: string; amount: number }[];
  /** The last coups' winners, newest first (the scoreboard). */
  history: BaccaratBet[];
}

// --- the Big Six wheel ------------------------------------------------------------------------------
//
// An upright wheel of 53 segments where the foyer meets the floor: 24 pay 1x, 15 2x, 7 5x, 4 10x, 2
// 20x and one Joker 40x (a winning bet pays that many times the stake, and the stake back). One wheel
// for the room: the first bet opens the betting window, then the croupier's hand sends it round, its
// leather flapper clicking over the pegs, and it settles on the segment the server drew (every client
// turns it the same way from spinId and result). Bets are placed standing at its ledge.

export type BigSixBet = "1" | "2" | "5" | "10" | "20" | "joker";
export const BIG_SIX_BETS: BigSixBet[] = ["1", "2", "5", "10", "20", "joker"];
export const BIG_SIX_INFO: Record<BigSixBet, { name: string; pays: number; colour: string; ink: string }> = {
  "1": { name: "1x", pays: 1, colour: "#f2e8d5", ink: "#3a2206" },
  "2": { name: "2x", pays: 2, colour: "#4f9fd8", ink: "#ffffff" },
  "5": { name: "5x", pays: 5, colour: "#2e8a57", ink: "#ffffff" },
  "10": { name: "10x", pays: 10, colour: "#7b4fc4", ink: "#ffffff" },
  "20": { name: "20x", pays: 20, colour: "#e0842c", ink: "#ffffff" },
  joker: { name: "Joker", pays: 40, colour: "#161214", ink: "#f6dc8f" },
};
/** The wheel's segments in order (shared/worlds/casino.ts lays it out; casino.glb paints it). */
export const BIG_SIX_SEGMENTS = BIG_SIX_WHEEL as readonly BigSixBet[];
export const isBigSixBet = (v: unknown): v is BigSixBet => typeof v === "string" && (BIG_SIX_BETS as readonly string[]).includes(v);
export const BIG_SIX_BET_SECONDS = 18;
/** The spin, from the croupier's pull to the flapper's last click. */
export const BIG_SIX_SPIN_MS = 7500;
export const BIG_SIX_SETTLE_SECONDS = 5;
/** What a bet brings back (the stake included) when the wheel stops on `landed`. */
export const bigSixReturn = (bet: BigSixBet, amount: number, landed: BigSixBet) => (bet === landed ? amount * (BIG_SIX_INFO[bet].pays + 1) : 0);
const TAU = Math.PI * 2;
/** The wheel's turn (radians, anticlockwise as you face it: the segments pass the flapper at the top
 *  in their order) at which segment `k` sits under the flapper; 0 before any spin. */
export function bigSixRest(k: number): number {
  return k < 0 ? 0 : ((k + 0.5) / BIG_SIX_SEGMENTS.length) * TAU;
}
/** Where the wheel stands `ms` into the spin from `from` (the last result) to `to`: six turns and a
 *  little, a quick start and a long slow ease to rest (every client turns it the same way). */
export function bigSixSpinAngle(from: number, to: number, ms: number): number {
  const a = bigSixRest(from);
  const b = a + 6 * TAU + ((((bigSixRest(to) - a) % TAU) + TAU) % TAU);
  const t = Math.max(0, Math.min(1, ms / BIG_SIX_SPIN_MS));
  return a + (b - a) * (1 - Math.pow(1 - t, 3.2));
}
/** The segment under the flapper at turn `angle`. */
export const bigSixUnder = (angle: number) => {
  const n = BIG_SIX_SEGMENTS.length;
  return ((Math.floor((angle / TAU) * n) % n) + n) % n;
};
export type BigSixPhase = "betting" | "spinning" | "settled";
export interface BigSixStake {
  sessionId: string;
  username: string;
  bet: BigSixBet;
  amount: number;
}
/** Server -> everyone ("bigSixState"). */
export interface BigSixState {
  phase: BigSixPhase;
  /** Whole seconds left in this phase (0 while waiting for a first bet). */
  timeLeft: number;
  spinId: number;
  /** The segment the wheel stops on (an index into BIG_SIX_SEGMENTS), -1 before the first spin, and
   *  the one it stood on before this spin (where it turns from). */
  result: number;
  prevResult: number;
  stakes: BigSixStake[];
  paid: { sessionId: string; username: string; amount: number }[];
  /** The last spins' results, newest first. */
  history: BigSixBet[];
}

// --- the one-player machines: who is at them ----------------------------------------------------
//
// The slot row and the coin pushers are one player's at a time: a player playing one, or a patron
// (the crowd takes a machine for a while now and then). The room syncs who (state.machines):
// "" free, a player's sessionId, or a patron "npc:<Kind>:<tint>". Anyone else is refused with a
// friendly word; a player may ask a patron to finish up ("Excuse me").

export const NPC_PREFIX = "npc:";
export const isNpcOccupant = (who: string) => who.startsWith(NPC_PREFIX);
/** The crowd's figures (patrons.glb): an evening-gowned rabbit, a raccoon in a tailored suit, a chic
 *  feline, a dapper fox in a cream dinner jacket, a round panda in a tweed overcoat, a gentleman owl
 *  in a top hat and monocle, a tall greyhound in a pinstripe double-breasted suit, and an otter in a
 *  fringed flapper dress. */
export const PATRON_KINDS = ["Rabbit", "Raccoon", "Feline", "Fox", "Panda", "Owl", "Greyhound", "Otter"] as const;
export type PatronKind = (typeof PATRON_KINDS)[number];
/** A patron at a machine: its figure and its outfit's tint index. */
export function npcOccupant(who: string): { kind: PatronKind; tint: number } | null {
  if (!isNpcOccupant(who)) return null;
  const [, kind, tint] = who.split(":");
  return (PATRON_KINDS as readonly string[]).includes(kind) ? { kind: kind as PatronKind, tint: Number(tint) || 0 } : null;
}
export const OCCUPIED_LINE = "Someone is currently playing here! Please wait a moment or find an open machine.";
/** How long a patron plays a machine, and how long a player keeps one without playing it. */
export const NPC_MACHINE_SECONDS: [number, number] = [30, 60];
export const PLAYER_MACHINE_HOLD_SECONDS = 20;
/** A patron asked to finish up leaves after this spin (seconds), and the machine waits this long for
 *  the one who asked. */
export const EXCUSE_ME_SECONDS = 3;
export const EXCUSE_ME_HOLD_SECONDS = 12;

// --- the house's extras -----------------------------------------------------------------------
//
// A tip is a thank-you; Pippin's drinks are a glow (and the espresso a quicker step), his Fish
// Pretzels are on the house; Madame Zara reads one fortune a day, now and then with a few chips of
// luck in it; the capsule machine hands out titles and emotes.

/** A tip in a dealer's jar: Boris's at the poker table, Madame Vivienne's on the roulette rail. */
export const DEALER_TIP = 5;

export type CasinoDrinkId = "fizz" | "martini" | "espresso";
export const CASINO_DRINK_IDS: CasinoDrinkId[] = ["fizz", "martini", "espresso"];
/** Pippin's bar menu, in chips; each leaves an aura for `seconds` (PlayerState.aura "casino:<id>"). */
export const CASINO_DRINKS: Record<CasinoDrinkId, { name: string; emoji: string; price: number; seconds: number; blurb: string; line: string }> = {
  fizz: { name: "Velvet Fizz", emoji: "🥂", price: 15, seconds: 90, blurb: "Rose-pink bubbles rise round you for a minute and a half", line: "One Velvet Fizz, extra sparkle!" },
  martini: { name: "Lucky Martini", emoji: "🍸", price: 20, seconds: 90, blurb: "Stirred with a four-leaf clover: a golden glimmer (purely for show)", line: "A Lucky Martini: stirred, never shaken. Well, shaken a little." },
  espresso: { name: "Espresso", emoji: "☕", price: 10, seconds: 60, blurb: "A double shot: +20% walking pace for a minute", line: "Espresso! Mind your step, it's a quick one." },
};
export function isCasinoDrink(v: unknown): v is CasinoDrinkId {
  return typeof v === "string" && (CASINO_DRINK_IDS as string[]).includes(v);
}
/** Pippin's complimentary bar snack: free, once every `cooldownMs`. */
export const BAR_SNACK = { name: "Complimentary Fish Pretzels", emoji: "🥨", line: "Fish Pretzels, on the house! 🥨", cooldownMs: 20_000 };
/** The walking pace an espresso gives (the server and the client both apply it). */
export const ESPRESSO_PACE = 1.2;
const DRINK_AURA = "casino:";
export const drinkAura = (id: CasinoDrinkId) => `${DRINK_AURA}${id}`;
/** The casino drink an aura is, or null (a blended drink's colour, or none). */
export function casinoDrinkOf(aura: string): CasinoDrinkId | null {
  if (!aura.startsWith(DRINK_AURA)) return null;
  const id = aura.slice(DRINK_AURA.length);
  return isCasinoDrink(id) ? id : null;
}
/** The pace multiplier an aura gives. */
export function auraPace(aura: string): number {
  return casinoDrinkOf(aura) === "espresso" ? ESPRESSO_PACE : 1;
}

// --- Madame Zara ---

/** A lucky reading hands over this many chips (once a day, like every reading). */
export const FORTUNE_LUCKY_CHIPS = 15;
export const ZARA_FORTUNES: { text: string; lucky: boolean }[] = [
  { text: "The wheel remembers kindness. Tip your croupier, and the felt will warm to you.", lucky: false },
  { text: "A seven walks beside you tonight. It will not introduce itself.", lucky: true },
  { text: "Beware the dealer who smiles on sixteen. Stand firm, little one.", lucky: false },
  { text: "Your pockets feel lighter? The owl sees a small fortune finding its way back to you.", lucky: true },
  { text: "Red and black are both rivers. Tonight, swim in neither: order a fizz instead.", lucky: false },
  { text: "The cards whisper your name. Listen, but do not believe everything they say.", lucky: false },
  { text: "A stranger will cheer your win before you notice it. Cheer theirs back.", lucky: false },
  { text: "Clover in the martini, silver in the palm. Luck has already taken your coat.", lucky: true },
  { text: "The piano knows a song about you. Sit, and let it play.", lucky: false },
  { text: "Great patience at the table; greater still at the bar. Pippin is doing his best.", lucky: false },
  { text: "Tonight the stars line up over Neon Alley. Something gold rolls your way.", lucky: true },
  { text: "Mr. Vance counts every chip twice. Count your blessings once, and you will be richer.", lucky: false },
];
/** Today's reading for a player: the same all day, a different one tomorrow. */
export function fortuneFor(userId: string, day: string): number {
  let h = 2166136261;
  for (const ch of `${userId}|${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % ZARA_FORTUNES.length;
}
/** Server -> client ("fortuneResult"): the reading, and what it brought (chips only the first time). */
export interface FortuneResult {
  text: string;
  lucky: boolean;
  chips: number;
  /** Already read today: the same reading again, nothing more. */
  again: boolean;
}

// --- the capsule machine: titles and emotes ---

/** A pull of the capsule machine, in chips; a prize already owned hands some back. */
export const CAPSULE_COST = 30;
export const CAPSULE_DUP_REFUND = 10;
export type CapsuleRarity = "common" | "rare" | "legendary";
export interface CapsulePrize {
  kind: "title" | "emote";
  id: string;
  name: string;
  /** The emote itself, or the title's badge. */
  emoji: string;
  rarity: CapsuleRarity;
}
export const CAPSULE_PRIZES: CapsulePrize[] = [
  { kind: "title", id: "night_owl", name: "Night Owl", emoji: "🦉", rarity: "common" },
  { kind: "title", id: "card_shark", name: "Card Shark", emoji: "🦈", rarity: "common" },
  { kind: "title", id: "jazz_cat", name: "Jazz Cat", emoji: "🎷", rarity: "common" },
  { kind: "title", id: "lady_luck", name: "Lady Luck", emoji: "🍀", rarity: "rare" },
  { kind: "title", id: "high_roller", name: "High Roller", emoji: "🎩", rarity: "rare" },
  { kind: "title", id: "velvet_royalty", name: "Velvet Royalty", emoji: "👑", rarity: "legendary" },
  { kind: "emote", id: "dice", name: "Lucky Dice", emoji: "🎲", rarity: "common" },
  { kind: "emote", id: "cards", name: "Wild Card", emoji: "🃏", rarity: "common" },
  { kind: "emote", id: "martini", name: "Cheers, Darling", emoji: "🍸", rarity: "common" },
  { kind: "emote", id: "rose", name: "Rose Toss", emoji: "🌹", rarity: "rare" },
  { kind: "emote", id: "diamond", name: "Diamond Wink", emoji: "💎", rarity: "rare" },
  { kind: "emote", id: "moneybags", name: "Jackpot Grin", emoji: "🤑", rarity: "legendary" },
];
export const CAPSULE_WEIGHTS: Record<CapsuleRarity, number> = { common: 10, rare: 4, legendary: 1 };
/** The unlock id a prize is kept under with the rest (PlayerState.owned): title_<id>, emote_<id>. */
export const capsuleUnlock = (p: Pick<CapsulePrize, "kind" | "id">) => `${p.kind}_${p.id}`;
export function capsuleTitle(id: string): CapsulePrize | undefined {
  return CAPSULE_PRIZES.find((p) => p.kind === "title" && p.id === id);
}
export function isCasinoTitle(id: string): boolean {
  return !!capsuleTitle(id);
}
/** The emotes the capsule machine gives, by emoji: sent like the six everyone has, once owned. */
export const CASINO_EMOTES: ReadonlyMap<string, CapsulePrize> = new Map(CAPSULE_PRIZES.filter((p) => p.kind === "emote").map((p) => [p.emoji, p]));
/** A random prize, weighted by rarity (`roll` in [0, 1)). */
export function rollCapsule(roll: number): CapsulePrize {
  const total = CAPSULE_PRIZES.reduce((sum, p) => sum + CAPSULE_WEIGHTS[p.rarity], 0);
  let left = roll * total;
  for (const p of CAPSULE_PRIZES) {
    left -= CAPSULE_WEIGHTS[p.rarity];
    if (left < 0) return p;
  }
  return CAPSULE_PRIZES[0];
}
/** Server -> client ("capsuleResult"): what came out, and whether it was a duplicate. */
export interface CapsuleResult {
  prize: CapsulePrize;
  duplicate: boolean;
  refund: number;
}

// --- wins worth shouting about ---

/** A slot jackpot (three of a kind, paying at least this many times the stake: every triple) sets
 *  the hall off: a brass fanfare, the chandeliers flaring, confetti over the winner. So does a
 *  straight-up roulette number. */
export const CELEBRATE_SLOT_MULTIPLIER = Math.min(...SLOT_TRIPLE);
/** Wins this big (in chips) make the Big-Win marquee. */
export const MARQUEE_MIN_WIN = 50;
export type CasinoGame = "slots" | "roulette" | "blackjack" | "poker" | "baccarat" | "bigsix" | "craps" | "derby" | "pusher" | "pinball";
/** Server -> everyone ("casinoWin"): a win for the marquee, and whether the hall celebrates it. */
export interface CasinoWin {
  sessionId: string;
  username: string;
  amount: number;
  game: CasinoGame;
  /** "🍀🍀🍀", "17 straight up", "Blackjack!" */
  detail: string;
  celebrate: boolean;
}

// --- the set dressing's broadcasts ---

/** Server -> everyone ("casinoProp"): the table's dice rolled, the Turf Club's race off, a coin
 *  pushed, the rack broken, the VIP room's door answered, a reading given, a dealer tipped, a drink
 *  (or the house's pretzels) served. `seed` makes every client play it the same way; the dice and
 *  the race's winner are the server's. */
export interface CasinoPropEvent {
  kind: "craps" | "derby" | "pusher" | "billiards" | "vipdoor" | "fortune" | "tipjar" | "barmenu" | "machine";
  propId: string;
  sessionId: string;
  seed: number;
  dice?: [number, number];
  /** The race's winning lane (0 to DERBY_LANES - 1). */
  winner?: number;
  /** A tip: which dealer. A drink: which one (or the snack). */
  dealer?: "boris" | "vivienne";
  drink?: CasinoDrinkId;
  snack?: boolean;
  /** The penthouse's doors: Bruno letting the player up (or back down), or turning them away. */
  vip?: "in" | "out" | "refused";
  /** A patron asked to finish up at a machine. */
  excused?: boolean;
}

/** Client -> server ("casino"): the capsule machine, wearing a title, Pippin's bar, and the games
 *  that are not the wheel, the slots or blackjack. */
export type CasinoPacket =
  | { type: "CAPSULE_PULL" }
  | { type: "EQUIP_TITLE"; id: string }
  | { type: "BAR_ORDER"; drink: CasinoDrinkId }
  | { type: "BAR_SNACK" }
  | { type: "HOLDEM_DEAL"; buyIn: number }
  | { type: "HOLDEM_MOVE"; move: HoldemMove }
  | { type: "BIGSIX_BET"; bet: BigSixBet; amount: number }
  | { type: "CRAPS_ROLL"; stakes: CrapsStakes }
  | { type: "DERBY_BET"; horse: number; amount: number }
  | { type: "PUSHER_DROP"; propId: PusherId; stake: number; pos: number }
  | { type: "PUSHER_CLOSE" }
  | { type: "PINBALL_START"; propId: string; stake: number }
  | { type: "PINBALL_END"; propId: string; gameId: number; steps: number; inputs: number[] }
  | { type: "POOL_BREAK" }
  | { type: "POOL_JOIN" }
  | { type: "POOL_LEAVE" }
  | { type: "POOL_SHOT"; shotId: number; angle: number; power: number; cue: { x: number; y: number } | null }
  | { type: "POOL_SETTLE"; shotId: number; balls: { n: number; x: number; y: number; in: boolean }[]; potted: number[]; firstHit: number }
  | { type: "BACCARAT_BET"; bet: BaccaratBet; amount: number }
  | { type: "VIP_PASS_BUY" }
  | { type: "VIP_PASS_PAWN" }
  | { type: "EXCUSE_ME"; propId: string }
  | { type: "PIANO_RECITAL"; piece: PianoPieceId }
  | { type: "PIANO_STOP" }
  | { type: "PIANO_NOTE"; midi: number };
/** Server -> client ("casinoNotice"): why something was refused (short of chips, too far away, a
 *  stake off the table's limits, the moment passed (the betting closed, a hand in play), not seated
 *  at the table, a machine someone else is at, or no VIP pass). */
export interface CasinoNotice {
  reason: "chips" | "far" | "limits" | "busy" | "seat" | "occupied" | "pass";
}
/** Server -> client ("vipPassResult"): a pass bought or pawned (or why not). */
export interface VipPassResult {
  ok: boolean;
  kind: "buy" | "pawn";
  chips: number;
  hasPass: boolean;
  reason?: "chips" | "far" | "have" | "none";
}
