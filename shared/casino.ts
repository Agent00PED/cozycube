// The Velvet Casino's rules: the Velvet Chip economy, every table's limits (the betting matrix and
// its ALL IN), and the games played with chips: roulette, slots, blackjack, Boris's Three-Card
// Poker, craps, the Mechanical Turf Club's derby and the coin pusher; and the house's extras (the
// baby grand's pieces, Pippin's bar, Madame Zara, the capsule machine, the VIP room's door). Where
// things stand (the tables, the slot row, Vance's cage) is the floor plan's business:
// shared/worlds/casino.ts.
//
// Shared between client and server — framework-agnostic (no THREE/Colyseus imports).

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
/** The most chips anyone can hold (the same ceiling as coins, shared/types COIN_CAP). */
export const CHIP_CAP = 99_999;

/** The casino's slice of the player record (stats JSON "casino"). */
export interface CasinoProfile {
  chips: number;
  /** The capsule title worn over the name ("" for none; it must be owned: title_<id>). */
  title: string;
  /** The day (todayKey, UTC) Madame Zara last read this player's fortune, and which one it was. */
  fortuneDay: string;
  fortune: number;
}

export function emptyCasinoProfile(): CasinoProfile {
  return { chips: 0, title: "", fortuneDay: "", fortune: -1 };
}

/** A saved profile read back from the database: anything malformed becomes an empty one, so a
 *  player saved before the casino opened simply has no chips (and one saved before the expansion
 *  no title, and no fortune told). */
export function sanitizeCasinoProfile(raw: unknown): CasinoProfile {
  const r = (raw ?? {}) as { chips?: unknown; title?: unknown; fortuneDay?: unknown; fortune?: unknown };
  const chips = r.chips;
  return {
    chips: typeof chips === "number" && Number.isFinite(chips) && chips > 0 ? Math.min(CHIP_CAP, Math.floor(chips)) : 0,
    title: typeof r.title === "string" && isCasinoTitle(r.title) ? r.title : "",
    fortuneDay: typeof r.fortuneDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.fortuneDay) ? r.fortuneDay : "",
    fortune: typeof r.fortune === "number" && Number.isInteger(r.fortune) && r.fortune >= 0 && r.fortune < ZARA_FORTUNES.length ? r.fortune : -1,
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

export type TableId = "blackjack_casual" | "blackjack_high" | "poker" | "slots" | "slots_vip" | "roulette_inside" | "roulette_outside" | "craps" | "derby" | "pusher";
export interface TableLimit {
  name: string;
  min: number;
  max: number;
  presets: readonly number[];
}
export const TABLE_LIMITS: Record<TableId, TableLimit> = {
  blackjack_casual: { name: "Blackjack · Table 1 (Casual)", min: 25, max: 1000, presets: [25, 50, 100, 250, 500] },
  blackjack_high: { name: "Blackjack · Table 2 (High Stakes)", min: 100, max: 5000, presets: [100, 250, 500, 1000, 2500] },
  // the ante: the Play bet matches it, so an ante of 2,000 risks 4,000 in all
  poker: { name: "Three-Card Poker", min: 50, max: 2000, presets: [50, 100, 200, 500, 1000] },
  slots: { name: "Neon Alley Slots", min: 10, max: 500, presets: [10, 25, 50, 100, 250] },
  slots_vip: { name: "The VIP High-Stakes Slot", min: 100, max: 1000, presets: [100, 250, 500] },
  // per spot: a straight-up number pays 35:1, red/black/odd/even 1:1
  roulette_inside: { name: "Roulette · Inside (straight up)", min: 10, max: 500, presets: [10, 25, 50, 100] },
  roulette_outside: { name: "Roulette · Outside (even money)", min: 25, max: 2500, presets: [25, 50, 100, 250, 500] },
  craps: { name: "Craps", min: 25, max: 1000, presets: [25, 50, 100, 250, 500] },
  derby: { name: "The Mechanical Turf Club", min: 10, max: 250, presets: [10, 25, 50, 100] },
  pusher: { name: "The Coin Pusher", min: 2, max: 25, presets: [2, 5, 10] },
};

/** ALL IN: everything you hold up to the table's cap, or 0 when that is under its minimum.
 *  `share`: the part of the chips one stake may take (Three-Card Poker's ante keeps half back for
 *  the Play bet that matches it). */
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

/** The slot machine's limits: the VIP room's high-stakes machine has its own. */
export const slotLimit = (propId: string) => TABLE_LIMITS[propId === VIP_SLOT_ID ? "slots_vip" : "slots"];
/** The VIP room's machine. */
export const VIP_SLOT_ID = "slot_vip";
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

/** A playing card (blackjack and Three-Card Poker deal from the same 52). */
export interface Card {
  rank: string; // "A", "2".."10", "J", "Q", "K"
  suit: string; // "♠" "♥" "♦" "♣"
}
export type BlackjackCard = Card;
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
  /** The table the hand is dealt at (its limits). */
  table: "blackjack_casual" | "blackjack_high";
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
/** Server -> everyone ("blackjackResult"): a hand settled at a table (Cedric knocks the felt for a
 *  natural). */
export interface BlackjackResult {
  sessionId: string;
  tableId: string;
  outcome: BlackjackOutcome;
}

// --- Three-Card Poker, against Boris ------------------------------------------------------------
//
// An ante within the table's limits; three cards each, yours face up, Boris's face down. Fold (the
// ante is lost) or Play (a second bet the size of the ante). Boris plays with a queen high or
// better: when he doesn't, the ante pays 1:1 and the Play bet comes back; when he does, the better
// hand takes both bets 1:1 (a tie pushes both). A straight or better also pays an ante bonus,
// whatever Boris holds. Three cards rank straight flush, three of a kind, straight, flush, pair,
// high card (a straight is rarer than a flush with three cards).

export const POKER_RANKS = ["High Card", "Pair", "Flush", "Straight", "Three of a Kind", "Straight Flush"] as const;
export type PokerRank = 0 | 1 | 2 | 3 | 4 | 5;
/** The ante bonus, in antes, on a played hand of this rank (on top of the rest). */
export const POKER_ANTE_BONUS: Partial<Record<PokerRank, number>> = { 3: 1, 4: 4, 5: 5 };
const RANK_VALUE: Record<string, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
export const cardValue = (c: Card) => RANK_VALUE[c.rank] ?? 0;
export interface PokerHand {
  rank: PokerRank;
  name: string;
  /** What breaks a tie, highest first. */
  values: number[];
}
export function pokerHand(cards: Card[]): PokerHand {
  const v = cards.map(cardValue).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  let straightHigh = 0;
  if (v[0] - v[1] === 1 && v[1] - v[2] === 1) straightHigh = v[0];
  else if (v[0] === 14 && v[1] === 3 && v[2] === 2) straightHigh = 3; // A-2-3, the lowest straight
  const trips = v[0] === v[2];
  let rank: PokerRank = 0;
  let values = v;
  if (straightHigh && flush) (rank = 5), (values = [straightHigh]);
  else if (trips) (rank = 4), (values = [v[0]]);
  else if (straightHigh) (rank = 3), (values = [straightHigh]);
  else if (flush) rank = 2;
  else if (v[0] === v[1] || v[1] === v[2]) (rank = 1), (values = [v[1], v[0] === v[1] ? v[2] : v[0]]);
  return { rank, name: POKER_RANKS[rank], values };
}
/** Above 0 when `a` beats `b`, 0 on a tie. */
export function comparePoker(a: PokerHand, b: PokerHand): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
    const d = (a.values[i] ?? 0) - (b.values[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
/** Boris plays with a queen high or better. */
export const dealerQualifies = (h: PokerHand) => h.rank > 0 || h.values[0] >= 12;
export type PokerPhase = "idle" | "decide" | "done";
export type PokerOutcome = "" | "fold" | "win" | "lose" | "push" | "noqualify";
export interface PokerView {
  phase: PokerPhase;
  ante: number;
  play: number;
  player: Card[];
  /** Boris's cards: face down (empty) until you play or fold. */
  dealer: Card[];
  playerHand: string;
  dealerHand: string;
  qualifies: boolean;
  outcome: PokerOutcome;
  /** Everything handed back (the stakes included), the ante bonus with it. */
  payout: number;
  bonus: number;
}
export type PokerMove = { action: "deal"; ante: number } | { action: "play" } | { action: "fold" };
/** A played hand settled: what comes back (the stakes included), and the bonus in it. */
export function pokerSettle(ante: number, player: PokerHand, dealer: PokerHand): { outcome: PokerOutcome; payout: number; bonus: number } {
  const bonus = ante * (POKER_ANTE_BONUS[player.rank] ?? 0);
  if (!dealerQualifies(dealer)) return { outcome: "noqualify", payout: ante * 3 + bonus, bonus };
  const c = comparePoker(player, dealer);
  if (c > 0) return { outcome: "win", payout: ante * 4 + bonus, bonus };
  if (c === 0) return { outcome: "push", payout: ante * 2 + bonus, bonus };
  return { outcome: "lose", payout: bonus, bonus };
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

// --- the coin pusher ----------------------------------------------------------------------------
//
// A brass dropper sweeps side to side over the shelf; drop a coin (2 to 25 chips) and where it lands
// decides how well it pushes: dead centre sends the most over the edge. What falls is rolled with
// odds that grow with the drop's accuracy: even a perfect drop returns about 95% over time, a wild
// one under 60%. Now and then a Bonus Token drops instead: a free drop at the same stake.

export const PUSHER_SWEEP_MS = 1600;
/** The dropper's place along the shelf (0 to 1) at `ms`: a steady sweep, there and back. */
export function pusherBarPos(ms: number): number {
  const t = (((ms % (PUSHER_SWEEP_MS * 2)) + PUSHER_SWEEP_MS * 2) % (PUSHER_SWEEP_MS * 2)) / PUSHER_SWEEP_MS;
  return t <= 1 ? t : 2 - t;
}
/** 1 dead centre, 0 at either end. */
export const pusherAccuracy = (pos: number) => 1 - Math.min(1, Math.abs(Math.max(0, Math.min(1, pos)) - 0.5) * 2);
export type PusherOutcomeId = "none" | "trickle" | "push" | "shove" | "token" | "avalanche";
export const PUSHER_OUTCOMES: { id: PusherOutcomeId; name: string; mult: number }[] = [
  { id: "none", name: "The coins settle", mult: 0 },
  { id: "trickle", name: "A trickle", mult: 1 },
  { id: "push", name: "A good push", mult: 2 },
  { id: "shove", name: "A great shove", mult: 3 },
  { id: "token", name: "Bonus Token!", mult: 0 },
  { id: "avalanche", name: "AVALANCHE!", mult: 10 },
];
const PUSHER_WILD = [0.62, 0.22, 0.1, 0.035, 0.02, 0.005];
const PUSHER_TRUE = [0.44, 0.28, 0.17, 0.065, 0.035, 0.01];
/** The odds of each outcome for a drop this accurate. */
export const pusherWeights = (accuracy: number) => PUSHER_WILD.map((w, i) => w + (PUSHER_TRUE[i] - w) * Math.max(0, Math.min(1, accuracy)));
export function rollPusher(accuracy: number, roll: number): number {
  const w = pusherWeights(accuracy);
  let left = roll * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    left -= w[i];
    if (left < 0) return i;
  }
  return 0;
}
/** Server -> the dropper ("pusherResult"). */
export interface PusherResult {
  stake: number;
  pos: number;
  outcome: PusherOutcomeId;
  payout: number;
  /** A free drop was spent on this one. */
  free: boolean;
  /** Free drops still held (their stakes). */
  tokens: number[];
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

// --- the VIP room -------------------------------------------------------------------------------

/** Bruno opens the VIP room's doors to a player holding this many chips, or wearing the right title. */
export const VIP_MIN_CHIPS = 500;
export const VIP_PASS_TITLE = "card_shark";
export function vipWelcome(chips: number, ownsPassTitle: boolean): boolean {
  return chips >= VIP_MIN_CHIPS || ownsPassTitle;
}

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
export type CasinoGame = "slots" | "roulette" | "blackjack" | "poker" | "craps" | "derby" | "pusher";
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
  kind: "craps" | "derby" | "pusher" | "billiards" | "vipdoor" | "fortune" | "tipjar" | "barmenu";
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
  /** The VIP room's door: whether Bruno let the player through (or out), or turned them away. */
  vip?: "in" | "out" | "refused";
}

/** Client -> server ("casino"): the capsule machine, wearing a title, Pippin's bar, and the games
 *  that are not the wheel, the slots or blackjack. */
export type CasinoPacket =
  | { type: "CAPSULE_PULL" }
  | { type: "EQUIP_TITLE"; id: string }
  | { type: "BAR_ORDER"; drink: CasinoDrinkId }
  | { type: "BAR_SNACK" }
  | { type: "POKER"; move: PokerMove }
  | { type: "CRAPS_ROLL"; stakes: CrapsStakes }
  | { type: "DERBY_BET"; horse: number; amount: number }
  | { type: "PUSHER_DROP"; stake: number; pos: number }
  | { type: "POOL_BREAK" }
  | { type: "PIANO_RECITAL"; piece: PianoPieceId }
  | { type: "PIANO_STOP" }
  | { type: "PIANO_NOTE"; midi: number };
/** Server -> client ("casinoNotice"): why something was refused (short of chips, too far away, a
 *  stake off the table's limits, or the moment has passed: the betting closed, a hand in play). */
export interface CasinoNotice {
  reason: "chips" | "far" | "limits" | "busy";
}
