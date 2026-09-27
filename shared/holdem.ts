// No-Limit Texas Hold'em at the Velvet Casino: your own hand at the table, against the house's
// players. Boris deals and plays a hand of his own, and one or two of the hall's regulars sit in
// (upstairs, Boris and Baron von Fox, and a high roller now and then). Two hole cards each, five on
// the board over the pre-flop, the flop, the turn and the river; fold, check, call, raise (any size
// from the minimum raise to all you have) or all in; the best five of seven cards takes the pot.
//
// You buy in for the hand (within the table's limits: TABLE_LIMITS.poker, poker_vip) and every seat
// starts with as much; the blinds go round with the button. What is left of your stack when the hand
// is over comes back to you, with anything you won (less the house's rake: 5% of a pot that saw a
// flop, no more than three big blinds). The house's players think for themselves (botDecision): how
// often their cards win against the hands still in (a quick Monte-Carlo run over the unseen cards),
// the price of a call, and a temperament apiece (loose or tight, bold or cautious, a bluff now and
// then).
//
// Pure rules, shared by the server (which deals, and plays the house's seats) and the client (the
// table's view, the hands' names). Framework-agnostic: no THREE or Colyseus imports.

import type { Card } from "./casino";

export type HoldemTable = "poker" | "poker_vip";
export type HoldemStreet = "preflop" | "flop" | "turn" | "river" | "showdown";

/** The hands, weakest to strongest (a hand's category is its index here). */
export const HOLDEM_HANDS = ["High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush", "Royal Flush"] as const;
export type HoldemHandName = (typeof HOLDEM_HANDS)[number];

/** Each table's blinds: small and big. */
export const HOLDEM_BLINDS: Record<HoldemTable, { sb: number; bb: number }> = {
  poker: { sb: 5, bb: 10 },
  poker_vip: { sb: 250, bb: 500 },
};
/** The house's cut of a pot you win once the flop is out, and its cap in big blinds. */
export const HOLDEM_RAKE = 0.05;
export const HOLDEM_RAKE_CAP_BB = 3;

const VALUE: Record<string, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
export const holdemValue = (c: Card) => VALUE[c.rank] ?? 0;

// --- the best five of seven ---------------------------------------------------------------------

const BASE = 15;
function pack(cat: number, vals: number[]): number {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * BASE + (vals[i] ?? 0);
  return s;
}
/** The category of a packed score. */
export const scoreCategory = (score: number) => Math.floor(score / BASE ** 5);

/** The highest straight in a set of values (an ace plays low too), or 0. */
function straightHigh(present: boolean[]): number {
  for (let h = 14; h >= 5; h--) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      const v = h - k === 1 ? 14 : h - k;
      if (!present[v]) {
        ok = false;
        break;
      }
    }
    if (ok) return h;
  }
  return 0;
}

/** The strength of the best five cards among 5 to 7: a number that orders hands (higher wins; equal
 *  splits the pot). */
export function evaluate(cards: Card[]): number {
  const counts = new Array<number>(15).fill(0);
  const bySuit: Record<string, number[]> = {};
  for (const c of cards) {
    const v = holdemValue(c);
    counts[v]++;
    (bySuit[c.suit] ??= []).push(v);
  }
  let flush: number[] | null = null;
  for (const s in bySuit) if (bySuit[s].length >= 5) flush = bySuit[s].sort((a, b) => b - a);
  if (flush) {
    const present = new Array<boolean>(15).fill(false);
    for (const v of flush) present[v] = true;
    const sf = straightHigh(present);
    if (sf) return pack(sf === 14 ? 9 : 8, [sf]);
  }
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let v = 14; v >= 2; v--) {
    if (counts[v] === 4) quads.push(v);
    else if (counts[v] === 3) trips.push(v);
    else if (counts[v] === 2) pairs.push(v);
    else if (counts[v] === 1) singles.push(v);
  }
  /** The best `n` cards left once `used` values are out. */
  const kickers = (used: number[], n: number) => {
    const out: number[] = [];
    for (let v = 14; v >= 2 && out.length < n; v--) {
      if (used.includes(v)) continue;
      for (let k = 0; k < counts[v] && out.length < n; k++) out.push(v);
    }
    return out;
  };
  if (quads.length) return pack(7, [quads[0], ...kickers([quads[0]], 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) return pack(6, [trips[0], Math.max(trips[1] ?? 0, pairs[0] ?? 0)]);
  if (flush) return pack(5, flush.slice(0, 5));
  const present = counts.map((c) => c > 0);
  const st = straightHigh(present);
  if (st) return pack(4, [st]);
  if (trips.length) return pack(3, [trips[0], ...kickers([trips[0]], 2)]);
  if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1], ...kickers([pairs[0], pairs[1]], 1)]);
  if (pairs.length === 1) return pack(1, [pairs[0], ...kickers([pairs[0]], 3)]);
  return pack(0, singles.slice(0, 5));
}

/** The name of the best hand in these cards ("Two Pair", "Royal Flush"). */
export function handName(cards: Card[]): HoldemHandName {
  return HOLDEM_HANDS[scoreCategory(evaluate(cards))];
}

// --- how often a hand wins -------------------------------------------------------------------------

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♠", "♥", "♦", "♣"];
const key = (c: Card) => `${c.rank}${c.suit}`;

/** A share of the pot this hand can expect against `opponents` unknown hands, by `trials` random
 *  run-outs of the unseen cards (a tie counts its share). */
export function equity(hole: Card[], board: Card[], opponents: number, trials = 160, rng: () => number = Math.random): number {
  const known = new Set([...hole, ...board].map(key));
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) if (!known.has(`${rank}${suit}`)) deck.push({ rank, suit });
  const need = opponents * 2 + (5 - board.length);
  let total = 0;
  for (let t = 0; t < trials; t++) {
    // a partial shuffle: just the cards this run-out needs
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    const full = board.concat(deck.slice(opponents * 2, need));
    const mine = evaluate(hole.concat(full));
    let best = true;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const theirs = evaluate([deck[o * 2], deck[o * 2 + 1], ...full]);
      if (theirs > mine) {
        best = false;
        break;
      }
      if (theirs === mine) ties++;
    }
    if (best) total += 1 / (ties + 1);
  }
  return trials ? total / trials : 0;
}

// --- the table --------------------------------------------------------------------------------------

/** A player at the table: you, or one of the house's. */
export interface HoldemSeat {
  name: string;
  emoji: string;
  human: boolean;
  stack: number;
  /** Put in on this street, and in the whole hand. */
  bet: number;
  total: number;
  cards: Card[];
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last bet or raise on this street. */
  acted: boolean;
  /** Their last move, as the table hears it ("Raises to 120", "Checks"). */
  last: string;
  /** A house player's temperament: loose (plays more hands), aggro (raises more), bluff. */
  style: { loose: number; aggro: number; bluff: number };
  /** What they won at the end (pots, after any rake), and their hand's name at the showdown. */
  won: number;
  hand: string;
}
export interface HoldemLogEntry {
  seat: number;
  text: string;
  street: HoldemStreet;
}
export interface HoldemGame {
  table: HoldemTable;
  seats: HoldemSeat[];
  button: number;
  deck: Card[];
  board: Card[];
  street: HoldemStreet;
  /** Whose move (an index into seats), or -1. */
  toAct: number;
  /** The street's bet to match, and the least a raise must add to it. */
  currentBet: number;
  minRaise: number;
  sb: number;
  bb: number;
  buyIn: number;
  log: HoldemLogEntry[];
  over: boolean;
  /** The house's cut of your winnings. */
  rake: number;
}

/** A house player to seat: a name, a face, a temperament. */
export interface HoldemBot {
  name: string;
  emoji: string;
  style: HoldemSeat["style"];
}
export const HOLDEM_BORIS: HoldemBot = { name: "Boris", emoji: "🐻‍❄️", style: { loose: 0.15, aggro: 0.5, bluff: 0.08 } };
export const HOLDEM_BARON: HoldemBot = { name: "Baron von Fox", emoji: "🦊", style: { loose: 0.35, aggro: 0.75, bluff: 0.16 } };
/** The hall's regulars who sit in (one or two a hand). */
export const HOLDEM_REGULARS: HoldemBot[] = [
  { name: "Sir Reginald", emoji: "🦉", style: { loose: 0.0, aggro: 0.55, bluff: 0.05 } },
  { name: "Fitz", emoji: "🦊", style: { loose: 0.4, aggro: 0.7, bluff: 0.18 } },
  { name: "Big Tobias", emoji: "🐼", style: { loose: 0.5, aggro: 0.2, bluff: 0.04 } },
  { name: "Lady Otterly", emoji: "🦦", style: { loose: 0.3, aggro: 0.45, bluff: 0.22 } },
  { name: "Colonel Whippet", emoji: "🐕", style: { loose: 0.05, aggro: 0.3, bluff: 0.06 } },
];
/** The penthouse's high rollers (one sits in beside the Baron now and then). */
export const HOLDEM_HIGH_ROLLERS: HoldemBot[] = [
  { name: "Countess Mink", emoji: "🦦", style: { loose: 0.25, aggro: 0.6, bluff: 0.12 } },
  { name: "Admiral Walrus", emoji: "🦭", style: { loose: 0.2, aggro: 0.35, bluff: 0.06 } },
];

const next = (g: HoldemGame, i: number) => (i + 1) % g.seats.length;
const pot = (g: HoldemGame) => g.seats.reduce((a, s) => a + s.total, 0);
export const holdemPot = pot;
const say = (g: HoldemGame, seat: number, text: string) => {
  g.seats[seat].last = text;
  g.log.push({ seat, text, street: g.street });
};
const inHand = (g: HoldemGame) => g.seats.filter((s) => !s.folded);
/** Seats that can still act (in the hand, not all in). */
const canAct = (s: HoldemSeat) => !s.folded && !s.allIn;

function put(g: HoldemGame, i: number, amount: number) {
  const s = g.seats[i];
  const n = Math.min(amount, s.stack);
  s.stack -= n;
  s.bet += n;
  s.total += n;
  if (s.stack === 0) s.allIn = true;
}

function draw(g: HoldemGame): Card {
  return g.deck.pop()!;
}

/** A fresh hand: `you` (and the house's `bots`, Boris first) each with `buyIn`; the button on seat
 *  `button`, the blinds posted, two cards each, and the move with the player after the big blind. The
 *  deck is the caller's, shuffled. */
export function newHoldemHand(table: HoldemTable, you: { name: string; emoji: string }, bots: HoldemBot[], buyIn: number, button: number, deck: Card[]): HoldemGame {
  const { sb, bb } = HOLDEM_BLINDS[table];
  const seat = (b: { name: string; emoji: string }, human: boolean, style: HoldemSeat["style"]): HoldemSeat => ({ name: b.name, emoji: b.emoji, human, stack: buyIn, bet: 0, total: 0, cards: [], folded: false, allIn: false, acted: false, last: "", style, won: 0, hand: "" });
  const seats = [seat(you, true, { loose: 0, aggro: 0, bluff: 0 }), ...bots.map((b) => seat(b, false, b.style))];
  const g: HoldemGame = { table, seats, button: button % seats.length, deck, board: [], street: "preflop", toAct: -1, currentBet: bb, minRaise: bb, sb, bb, buyIn, log: [], over: false, rake: 0 };
  const sbSeat = next(g, g.button);
  const bbSeat = next(g, sbSeat);
  put(g, sbSeat, sb);
  say(g, sbSeat, `Small blind ${sb}`);
  put(g, bbSeat, bb);
  say(g, bbSeat, `Big blind ${bb}`);
  for (let round = 0; round < 2; round++) for (let k = 1; k <= seats.length; k++) seats[(g.button + k) % seats.length].cards.push(draw(g));
  g.toAct = firstToAct(g, next(g, bbSeat));
  if (g.toAct < 0) runOut(g);
  return g;
}

/** The first seat from `from` round that can still act, or -1. */
function firstToAct(g: HoldemGame, from: number): number {
  for (let k = 0; k < g.seats.length; k++) {
    const i = (from + k) % g.seats.length;
    if (canAct(g.seats[i])) return i;
  }
  return -1;
}

/** What the seat to act may do: check or call (and how much), and the range a raise can go to. */
export function holdemOptions(g: HoldemGame, i = g.toAct) {
  const s = g.seats[i];
  if (!s || g.over || i !== g.toAct) return { canCheck: false, toCall: 0, minRaiseTo: 0, maxRaiseTo: 0, canRaise: false };
  const toCall = Math.max(0, Math.min(g.currentBet - s.bet, s.stack));
  const maxRaiseTo = s.bet + s.stack;
  const minRaiseTo = Math.min(maxRaiseTo, g.currentBet + g.minRaise);
  // a raise needs chips beyond the call, and someone else still able to answer it
  const others = g.seats.some((o, k) => k !== i && canAct(o));
  return { canCheck: toCall === 0, toCall, minRaiseTo, maxRaiseTo, canRaise: maxRaiseTo > g.currentBet && others };
}

export type HoldemMove = { action: "fold" } | { action: "check" } | { action: "call" } | { action: "raise"; to: number } | { action: "allin" };

/** Seat `i` makes `move` (the bots' and yours alike). Returns false if it wasn't theirs to make. */
export function holdemAct(g: HoldemGame, i: number, move: HoldemMove): boolean {
  if (g.over || i !== g.toAct) return false;
  const s = g.seats[i];
  const o = holdemOptions(g, i);
  switch (move.action) {
    case "fold":
      s.folded = true;
      say(g, i, "Folds");
      break;
    case "check":
      if (!o.canCheck) return false;
      say(g, i, "Checks");
      break;
    case "call":
      if (o.toCall <= 0) return false;
      put(g, i, o.toCall);
      say(g, i, s.allIn ? `Calls ${o.toCall}, all in` : `Calls ${o.toCall}`);
      break;
    case "raise":
    case "allin": {
      const to = move.action === "allin" ? o.maxRaiseTo : Math.floor(Number(move.to));
      if (!Number.isFinite(to) || s.stack <= 0) return false;
      if (move.action === "raise" && (!o.canRaise || to < o.minRaiseTo || to > o.maxRaiseTo)) return false;
      if (to <= g.currentBet) {
        // all in for no more than a call: it is a call
        put(g, i, to - s.bet);
        say(g, i, `Calls ${to}, all in`);
        break;
      }
      const raise = to - g.currentBet;
      const opening = g.currentBet === 0;
      put(g, i, to - s.bet);
      g.currentBet = to;
      // a full raise reopens the betting for everyone and sets the next minimum; a short all-in
      // only has to be matched
      if (raise >= g.minRaise) {
        g.minRaise = raise;
        for (const [k, other] of g.seats.entries()) if (k !== i) other.acted = false;
      }
      say(g, i, s.allIn ? `All in (${to})` : opening ? `Bets ${to}` : `Raises to ${to}`);
      break;
    }
    default:
      return false;
  }
  s.acted = true;
  advance(g, i);
  return true;
}

/** After a move: the next to act, or the street over (the next one dealt), or the hand over. */
function advance(g: HoldemGame, from: number) {
  const live = inHand(g);
  if (live.length === 1) return finish(g);
  const pending = g.seats.findIndex((s) => canAct(s) && (!s.acted || s.bet < g.currentBet));
  if (pending >= 0) {
    // the next one round from the last mover who still has to act
    for (let k = 1; k <= g.seats.length; k++) {
      const i = (from + k) % g.seats.length;
      const s = g.seats[i];
      if (canAct(s) && (!s.acted || s.bet < g.currentBet)) {
        g.toAct = i;
        return;
      }
    }
  }
  // the street is done: with fewer than two able to bet, the rest of the board just comes out
  if (live.filter(canAct).length < 2) return runOut(g);
  nextStreet(g);
}

function nextStreet(g: HoldemGame) {
  for (const s of g.seats) {
    s.bet = 0;
    s.acted = false;
  }
  g.currentBet = 0;
  g.minRaise = g.bb;
  if (g.street === "preflop") {
    g.street = "flop";
    g.board.push(draw(g), draw(g), draw(g));
  } else if (g.street === "flop") {
    g.street = "turn";
    g.board.push(draw(g));
  } else if (g.street === "turn") {
    g.street = "river";
    g.board.push(draw(g));
  } else return showdown(g);
  g.log.push({ seat: -1, text: g.street === "flop" ? "The flop" : g.street === "turn" ? "The turn" : "The river", street: g.street });
  g.toAct = firstToAct(g, next(g, g.button));
  if (g.toAct < 0 || inHand(g).filter(canAct).length < 2) runOut(g);
}

/** Everyone left is all in (or but one): the board comes out to the showdown. */
function runOut(g: HoldemGame) {
  g.toAct = -1;
  while (g.board.length < 5) g.board.push(draw(g));
  showdown(g);
}

function showdown(g: HoldemGame) {
  g.street = "showdown";
  g.toAct = -1;
  const scores = g.seats.map((s) => (s.folded ? -1 : evaluate(s.cards.concat(g.board))));
  g.seats.forEach((s, i) => {
    if (!s.folded) s.hand = HOLDEM_HANDS[scoreCategory(scores[i])];
  });
  award(g, scores);
}

/** One left in the hand: the pot is theirs, no cards shown. */
function finish(g: HoldemGame) {
  g.toAct = -1;
  const scores = g.seats.map((s) => (s.folded ? -1 : 1));
  award(g, scores);
}

/** The pots (a side pot for each all-in level) to the best hands that are in them; the rake off your
 *  share of a pot that saw a flop. */
function award(g: HoldemGame, scores: number[]) {
  const levels = [...new Set(g.seats.filter((s) => !s.folded).map((s) => s.total))].sort((a, b) => a - b);
  let prev = 0;
  levels.forEach((level, li) => {
    let amount = 0;
    for (const s of g.seats) amount += Math.max(0, Math.min(s.total, level) - Math.min(s.total, prev));
    // anything put in over the top level (a folded raiser's) goes to the last pot
    if (li === levels.length - 1) for (const s of g.seats) amount += Math.max(0, s.total - level);
    prev = level;
    const eligible = g.seats.map((s, i) => i).filter((i) => !g.seats[i].folded && g.seats[i].total >= level);
    if (!eligible.length || amount <= 0) return;
    const best = Math.max(...eligible.map((i) => scores[i]));
    const winners = eligible.filter((i) => scores[i] === best);
    const share = Math.floor(amount / winners.length);
    let odd = amount - share * winners.length;
    for (const w of winners) {
      let got = share + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
      const s = g.seats[w];
      if (s.human && g.board.length >= 3 && got > s.total) {
        const cut = Math.min(Math.floor(got * HOLDEM_RAKE), HOLDEM_RAKE_CAP_BB * g.bb);
        got -= cut;
        g.rake += cut;
      }
      s.stack += got;
      s.won += got;
    }
  });
  for (const [i, s] of g.seats.entries()) if (s.won > 0) g.log.push({ seat: i, text: s.hand ? `Wins ${s.won} with ${s.hand}` : `Wins ${s.won}`, street: g.street });
  g.over = true;
}

/** A house player's move: how often their cards win against the hands still in, against the price
 *  of the call, coloured by their temperament. */
export function botDecision(g: HoldemGame, i: number, rng: () => number = Math.random): HoldemMove {
  const s = g.seats[i];
  const o = holdemOptions(g, i);
  const opponents = g.seats.filter((q, k) => k !== i && !q.folded).length;
  const eq = equity(s.cards, g.board, Math.max(1, opponents), g.street === "preflop" ? 80 : g.street === "river" ? 160 : 110, rng);
  const fair = 1 / (opponents + 1);
  const rel = eq / fair + (rng() - 0.5) * 0.25 + s.style.loose * 0.25;
  const thePot = pot(g);
  const sized = (frac: number) => {
    const to = g.currentBet + Math.max(o.minRaiseTo - g.currentBet, Math.round((thePot * frac) / g.bb) * g.bb);
    return to >= o.maxRaiseTo ? ({ action: "allin" } as HoldemMove) : ({ action: "raise", to } as HoldemMove);
  };
  if (o.canCheck) {
    if (o.canRaise && (rel > 1.55 - s.style.aggro * 0.2 || rng() < s.style.bluff * 0.4)) return sized(0.45 + rng() * 0.45);
    return { action: "check" };
  }
  const potOdds = o.toCall / (thePot + o.toCall);
  // a big bet is respected: it takes more to call it
  const respect = o.toCall > thePot * 0.6 ? 0.07 : 0;
  if (o.canRaise && rel > 1.9 - s.style.aggro * 0.3 && rng() < 0.3 + s.style.aggro * 0.45) return sized(0.7 + rng() * 0.5);
  if (eq >= potOdds * (1 - s.style.loose * 0.3) + respect) return { action: "call" };
  if (g.street === "preflop" && o.toCall <= g.bb * 2 && rel > 0.85) return { action: "call" };
  if (o.toCall <= s.stack * 0.15 && rng() < s.style.bluff * 0.3) return { action: "call" };
  return { action: "fold" };
}

/** Plays the house's seats until it is yours to move (or the hand is over). */
export function runHouse(g: HoldemGame, rng: () => number = Math.random) {
  let guard = 0;
  while (!g.over && g.toAct >= 0 && !g.seats[g.toAct].human && guard++ < 200) {
    const i = g.toAct;
    if (!holdemAct(g, i, botDecision(g, i, rng))) holdemAct(g, i, holdemOptions(g, i).canCheck ? { action: "check" } : { action: "fold" });
  }
}

/** Server -> the player ("holdemState"): the table as they may see it (the house's cards face down
 *  until the showdown), what they may do, and what has happened so far this hand. */
export interface HoldemView {
  table: HoldemTable;
  phase: "idle" | "playing" | "done";
  street: HoldemStreet;
  board: Card[];
  pot: number;
  sb: number;
  bb: number;
  buyIn: number;
  button: number;
  toAct: number;
  seats: { name: string; emoji: string; human: boolean; stack: number; bet: number; total: number; folded: boolean; allIn: boolean; cards: Card[]; last: string; won: number; hand: string }[];
  options: ReturnType<typeof holdemOptions>;
  log: HoldemLogEntry[];
  /** Your hand's name so far (the best of your cards and the board). */
  yourHand: string;
  /** At the end: your net result (what came back less the buy-in) and the rake. */
  net: number;
  rake: number;
}

export function holdemView(g: HoldemGame | null, table: HoldemTable): HoldemView {
  if (!g) {
    const { sb, bb } = HOLDEM_BLINDS[table];
    return { table, phase: "idle", street: "preflop", board: [], pot: 0, sb, bb, buyIn: 0, button: 0, toAct: -1, seats: [], options: { canCheck: false, toCall: 0, minRaiseTo: 0, maxRaiseTo: 0, canRaise: false }, log: [], yourHand: "", net: 0, rake: 0 };
  }
  const shown = g.over && g.street === "showdown";
  const you = g.seats.find((s) => s.human)!;
  return {
    table: g.table,
    phase: g.over ? "done" : "playing",
    street: g.street,
    board: g.board,
    pot: pot(g),
    sb: g.sb,
    bb: g.bb,
    buyIn: g.buyIn,
    button: g.button,
    toAct: g.toAct,
    seats: g.seats.map((s) => ({ name: s.name, emoji: s.emoji, human: s.human, stack: s.stack, bet: s.bet, total: s.total, folded: s.folded, allIn: s.allIn, cards: s.human || (shown && !s.folded) ? s.cards : [], last: s.last, won: s.won, hand: s.human || (shown && !s.folded) ? s.hand : "" })),
    options: holdemOptions(g),
    log: g.log,
    yourHand: you.cards.length ? handName(you.cards.concat(g.board)) : "",
    net: g.over ? you.stack - g.buyIn : 0,
    rake: g.rake,
  };
}
