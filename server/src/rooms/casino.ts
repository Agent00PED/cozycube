import { Schema, type, type MapSchema } from "@colyseus/schema";
import {
  BACCARAT_BET_SECONDS,
  BACCARAT_DEAL_SECONDS,
  BACCARAT_SETTLE_SECONDS,
  BACCARAT_TABLES,
  BAR_SNACK,
  BIG_SIX_BET_SECONDS,
  BIG_SIX_SEGMENTS,
  BIG_SIX_SETTLE_SECONDS,
  BIG_SIX_SPIN_MS,
  BLACKJACK_BET_SECONDS,
  BLACKJACK_MAX_HANDS,
  BLACKJACK_SETTLE_SECONDS,
  BLACKJACK_TURN_SECONDS,
  CAPSULE_COST,
  CAPSULE_DUP_REFUND,
  CASINO_DRINKS,
  CELEBRATE_SLOT_MULTIPLIER,
  CHIP_CAP,
  CHIP_EMOTE,
  DEALER_TIP,
  DERBY_BET_SECONDS,
  DERBY_RACERS,
  DERBY_RACE_MS,
  EXCUSE_ME_HOLD_SECONDS,
  EXCUSE_ME_SECONDS,
  FORTUNE_LUCKY_CHIPS,
  MARQUEE_MIN_WIN,
  MAX_BET_TOTAL,
  NPC_MACHINE_SECONDS,
  NPC_PREFIX,
  PATRON_KINDS,
  PIANO_HIGH,
  PIANO_LOW,
  PLAYER_MACHINE_HOLD_SECONDS,
  PUSHER_CREDIT_MS,
  PUSHER_MACHINES,
  PUSHER_TOKEN_CHANCE,
  ROULETTE_PHASE_SECONDS,
  SLOT_PAIR,
  SLOT_SYMBOLS,
  SLOT_TRIPLE,
  TABLE_LIMITS,
  ZARA_FORTUNES,
  baccaratCoup,
  baccaratReturn,
  betReturn,
  blackjackTotal,
  canSplit,
  capsuleUnlock,
  bigSixReturn,
  crapsReturn,
  drinkAura,
  encodeBets,
  exchangeAmount,
  fortuneFor,
  isBetKind,
  isBigSixBet,
  isCasinoDrink,
  isCasinoTitle,
  isNpcOccupant,
  parseBets,
  pocketColor,
  rollCapsule,
  rollDerby,
  rouletteLimit,
  slotLimit,
  tableStake,
  type BaccaratBet,
  type BaccaratPhase,
  type BaccaratStake,
  type BaccaratState,
  type BaccaratTable,
  type BigSixBet,
  type BigSixPhase,
  type BigSixStake,
  type BigSixState,
  type BlackjackAction,
  type BlackjackHandStatus,
  type BlackjackOutcome,
  type BlackjackResult,
  type BlackjackTablePhase,
  type BlackjackTableView,
  type BlackjackTier,
  type CapsuleResult,
  type Card,
  type CashierResult,
  type CasinoGame,
  type CasinoNotice,
  type CasinoPacket,
  type CasinoProfile,
  type CasinoPropEvent,
  type CasinoWin,
  type CrapsBet,
  type CrapsStakes,
  type CrapsView,
  type DerbyPhase,
  type DerbyState,
  type DerbyTicket,
  type FortuneResult,
  type PianoNote,
  type PianoRecital,
  type PokerResult,
  type PusherEvent,
  type PusherPurse,
  type PusherView,
  type PinballResult,
  type PinballStarted,
  type RoulettePhase,
  type VipPassResult,
  pinballTier,
} from "../../../shared/casino";
import { PINBALL_MAX_STEPS, PINBALL_STEPS_PER_S, replayPinball, validPinballInputs } from "../../../shared/pinball";
import { VIP_PASS } from "../../../shared/items";
import { HOLDEM_BARON, HOLDEM_BORIS, HOLDEM_HIGH_ROLLERS, HOLDEM_REGULARS, holdemAct, holdemView, newHoldemHand, runHouse, type HoldemGame, type HoldemMove, type HoldemTable } from "../../../shared/holdem";
import { PIANO_PIECES, isPianoPiece } from "../../../shared/pianoPieces";
import { POOL_H, POOL_W, emptyPoolMatch, poolCueSpotFree, poolRack, ruleOnShot, type PoolBall, type PoolMatch, type PoolShotEvent } from "../../../shared/pool";
import { PUSHER_MAX_COINS, SHELF_STEP_S, landCoin, landsOnShelf, loadShelf, packShelf, pegPath, saveShelf, seedShelf, shelfAwake, stepShelf, type Shelf, type ShelfFall } from "../../../shared/pusherSim";
import {
  BAR_REACH,
  BLACKJACK_TABLES,
  CASHIER_FRONT,
  CASHIER_REACH,
  CASINO_PROPS,
  COIN_PUSHERS,
  GACHAPON_FRONT,
  GAZETTE_REACH,
  MACHINE_REACH,
  PINBALL_MACHINES,
  PIANO_REACH,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  SINGLE_MACHINES,
  TIP_JARS,
  VIP_DOORS_FRONT,
  ZARA_FRONT,
  barDistance,
  nearGameTable,
  type CasinoGameTable,
  type PusherId,
  type TipDealer,
} from "../../../shared/worlds/casino";
import { VIP_ARRIVAL } from "../../../shared/worlds/casino_vip";
import { COIN_CAP, INTERACT_RADIUS, isCasinoMap, type MapId } from "../../../shared/types";
import { specialTitle } from "../../../shared/items";
import { todayKey } from "./games";

// The Velvet Casino's tables: the shared roulette wheel, the two blackjack tables' rounds (up to four
// seated players each, one dealer hand, splits and doubles), the slot machines (the penthouse's
// Golden Vault too), No-Limit Texas Hold'em (your own hand against Boris and the house's regulars,
// in the hall and at the penthouse's high-limit table with Baron von Fox: shared/holdem.ts), the two
// baccarat tables (the hall's and the penthouse's), the Big Six wheel's one spin for the room, your
// own dice at the craps table, the Mechanical Turf Club's one race for the room, the two coin
// pushers' shelves of real coins (simulated here: shared/pusherSim.ts; kept between sessions, the
// patrons who play them feed them too), the pinball cabinets' panel, the floor's two-player 8-ball
// match, and Mr. Vance's cage, where coins become Velvet Chips and back and the Black
// Velvet VIP Pass is bought and pawned. Every stake is within its
// table's limits (shared/casino TABLE_LIMITS), and the seated games are played seated. The room owns
// the synced state (the wheel and its bets, who is at the one-player machines) and the side effects
// (messages, timers, stats); this owns the rules, the money and the hands, the way BoardTable owns a
// board game.
//
// And the house's extras: the patrons who take turns at the one-player machines, the baby grand's
// recitals and the notes played on it, Madame Zara's daily fortune, the capsule machine, the
// dealers' tip jars, Pippin's bar (and his free pretzels), Bruno's doors to the penthouse, and the
// Big-Win marquee's news (a win worth shouting about, and whether the hall celebrates it).

// The shared roulette wheel. One loop for the whole room: 25 s of betting, a 6 s spin everyone
// watches together, then 4 s of payouts. Only the phase, a whole-second countdown and the result
// are synced; the wheel's motion is animated client-side from spinId + result.
export class RouletteSchema extends Schema {
  @type("string") phase: RoulettePhase = "betting";
  @type("number") timeLeft = ROULETTE_PHASE_SECONDS.betting;
  @type("number") result = -1;
  @type("number") spinId = 0;
}

/** What the casino needs of a player: who and where they are, their two balances, and what they
 *  wear (a capsule title), drink (an aura) and hold (the VIP pass). */
export interface Patron {
  userId: string;
  username: string;
  /** The world they are in: the casino's rules only ever apply on its two floors. */
  map: string;
  x: number;
  z: number;
  coins: number;
  chips: number;
  sitting: boolean;
  title: string;
  aura: string;
  vipPass: boolean;
}

/** The room state the casino reads and writes. */
export interface CasinoState {
  roulette: RouletteSchema;
  /** Roulette bets on the table this round, per sessionId, as encodeBets() strings. */
  bets: MapSchema<string>;
  /** Who is at each one-player machine (shared/casino: "" free, a sessionId, or a patron). */
  machines: MapSchema<string>;
  players: { get(sessionId: string): Patron | undefined; forEach(fn: (p: Patron, sessionId: string) => void): void };
}

/** A casino prop, as the room's props hold it. */
export interface SlotProp {
  propId: string;
  kind: string;
  x: number;
  z: number;
}

/** What the casino asks of the room. */
export interface CasinoHost {
  /** To everyone on the casino's floors (the hall and the penthouse). */
  broadcast(type: string, payload: unknown): void;
  /** To everyone in the guild, whatever world they are in (a jackpot is news everywhere). */
  shout(type: string, payload: unknown): void;
  /** To everyone but the one who did it (a note they already heard). */
  broadcastExcept(sessionId: string, type: string, payload: unknown): void;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  /** Moves a standing player on their floor: their client snaps to it. */
  teleport(sessionId: string, x: number, z: number): void;
  /** Takes a standing player to another world (Bruno's doors, the elevator), set down at `at`. */
  travel(sessionId: string, map: MapId, at: { x: number; z: number }): void;
  /** The seat (a chair's propId) the player sits on, or "". */
  seatOf(sessionId: string): string;
  /** Runs `fn` after `ms` on the room's clock. */
  later(ms: number, fn: () => void): void;
  /** Counts a spin, a win or a capsule toward the player's stats and today's checklist. */
  tally(sessionId: string, event: "slots_spin" | "roulette_win" | "blackjack_win" | "capsule_pull"): void;
  /** Saves the player at once (an exchange moves money between two balances). */
  persistNow(sessionId: string): void;
  /** The player's saved casino profile (Madame Zara notes the day's reading on it). */
  profile(sessionId: string): CasinoProfile | undefined;
  /** The player's unlocks (capsule titles and emotes live with the hats and outfits). */
  owns(sessionId: string, id: string): boolean;
  grant(sessionId: string, id: string): void;
  /** A drink's glow (and, for an espresso, its quicker step) for `seconds`. */
  aura(sessionId: string, aura: string, seconds: number): void;
}

// --- a blackjack table's round ---
interface BjHand {
  cards: Card[];
  bet: number;
  status: BlackjackHandStatus;
  doubled: boolean;
  outcome: BlackjackOutcome;
  payout: number;
  /** A hand from a split: 21 on two cards is only 21. */
  split: boolean;
}
interface BjSeat {
  sessionId: string;
  username: string;
  stool: string;
  bet: number;
  hands: BjHand[];
}
interface BjTable {
  id: string;
  tier: BlackjackTier;
  stools: string[];
  dealerName: string;
  phase: BlackjackTablePhase;
  /** Seconds left in this phase (0 while waiting for a first bet). */
  clock: number;
  round: number;
  deck: Card[];
  dealer: Card[];
  seats: BjSeat[];
}
// --- a baccarat table's coup ---
interface BaccTable {
  table: BaccaratTable;
  seats: readonly string[];
  phase: BaccaratPhase;
  clock: number;
  round: number;
  stakes: BaccaratStake[];
  player: Card[];
  banker: Card[];
  winner: BaccaratBet | "";
  paid: BaccaratState["paid"];
  history: BaccaratBet[];
  shoe: Card[];
}
// --- craps: each player's own point and pass line ---
interface CrapsGame {
  point: number;
  pass: number;
  rollId: number;
  dice: [number, number] | null;
  results: CrapsView["results"];
  payout: number;
}

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];
function freshDeck(decks = 1): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Weighted so jackpots stay rare: cherries common, sevens scarce. */
const SYMBOL_WEIGHTS = [30, 24, 18, 13, 9, 6];
function rollSymbol(): number {
  let roll = Math.random() * SYMBOL_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    roll -= SYMBOL_WEIGHTS[i];
    if (roll <= 0) return i;
  }
  return 0;
}

const sum = (bets: Record<string, number>) => Object.values(bets).reduce((a, b) => a + b, 0);
const seed = () => Math.floor(Math.random() * 0x7fffffff);
const die = () => 1 + Math.floor(Math.random() * 6);
const near = (p: { x: number; z: number }, q: { x: number; z: number }, reach: number) => Math.hypot(p.x - q.x, p.z - q.z) <= reach;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** How much further than the client's reach the server allows, for lag. */
const ROULETTE_SLACK = 0.6;
const SLOT_SLACK = 0.8;
const CASHIER_SLACK = 0.6;
const EXTRA_SLACK = 0.6;
const GAME_SLACK = 0.8;
/** The reels spin for ~1.6 s on screen; a win is paid when they land. */
const SLOT_LAND_MS = 1700;
/** How often one player may roll the dice, drop a coin, break the rack, try the doors, tip, ask
 *  Zara, take a pretzel or excuse a patron (a click storm is not a storm of broadcasts). */
const COOLDOWN_MS: Record<string, number> = { craps: 1500, pusher: 900, billiards: 2500, vipdoor: 1500, tipjar: 1200, fortune: 2500, snack: BAR_SNACK.cooldownMs, excuse: 4000 };
/** Notes played on the baby grand: a bucket of 16, refilled at 12 a second. */
const NOTE_BURST = 16;
const NOTES_PER_SECOND = 12;
const PIANO_KEYS = CASINO_PROPS.find((p) => p.propId === "piano_keys")!;
const PROP_AT = new Map(CASINO_PROPS.map((p) => [p.propId, p]));
/** At most this many of the one-player machines are the patrons' at once (the rest stay open). */
const MAX_NPC_MACHINES = 3;
/** A pool shot not reported back in this long (the shooter's client gone quiet): the turn passes. */
const POOL_SHOT_TIMEOUT_MS = 25_000;
const POOL_OVER_MS = 8000;
/** The seats of each seated table. */
const HALL_POKER_SEATS = ["seat_poker_1", "seat_poker_2", "seat_poker_3", "seat_poker_4", "seat_poker_5"];
const VIP_POKER_SEATS = ["seat_vpoker_1", "seat_vpoker_2", "seat_vpoker_3"];
const BACCARAT_SEATS: Record<BaccaratTable, string[]> = {
  baccarat: ["seat_bacc_1", "seat_bacc_2", "seat_bacc_3"],
  baccarat_hall: ["seat_hbacc_1", "seat_hbacc_2", "seat_hbacc_3", "seat_hbacc_4", "seat_hbacc_5"],
};
/** The patrons at a coin pusher drop a coin (the table minimum) about this often (seconds). */
const NPC_PUSHER_DROP_S: [number, number] = [4, 8];
/** How often the player at a pusher is sent its shelf. */
const PUSHER_VIEW_MS = 100;
/** A pusher's run of payouts this big (times the last stake, and at least MARQUEE_MIN_WIN) within
 *  PUSHER_BURST_MS makes the marquee. */
const PUSHER_BURST_X = 20;
const PUSHER_BURST_MS = 6000;
const pusherGame = (id: PusherId): CasinoGameTable => (id === "coin_pusher_high" ? "pusher_high" : "pusher");
const newShelf = (id: PusherId) => seedShelf(PUSHER_MACHINES[id].seedCoins, PUSHER_MACHINES[id].seedValue, Math.random);

export class CasinoFloor {
  private phaseClock = ROULETTE_PHASE_SECONDS.betting;
  private readonly tables: BjTable[] = BLACKJACK_TABLES.map((t) => ({ id: t.id, tier: t.tier, stools: t.stools, dealerName: t.dealer === "gideon" ? "Gideon" : "Cedric", phase: "betting", clock: 0, round: 0, deck: freshDeck(4), dealer: [], seats: [] }));
  /** Each player's hand of Hold'em (their own, against the house), and where the button sits for
   *  their next one. */
  private readonly holdem = new Map<string, HoldemGame>();
  private readonly holdemButton = new Map<string, number>();
  private readonly crapsGames = new Map<string, CrapsGame>();
  /** Each player's last use of each prop kind (the cooldowns above). */
  private readonly lastUse = new Map<string, number>();
  /** The Turf Club's one race: its window, the tickets on it, and (once they're off) what the
   *  winning tickets are owed at the finish line. */
  private derby: { phase: DerbyPhase; clock: number; raceId: number; winner: number; seed: number; tickets: DerbyTicket[]; paid: DerbyState["paid"] } = { phase: "idle", clock: 0, raceId: 0, winner: -1, seed: 0, tickets: [], paid: [] };
  private readonly derbyOwed = new Map<string, number>();
  /** The two baccarat tables (the hall's, the penthouse's): one coup at a time each. */
  private readonly baccs: Record<BaccaratTable, BaccTable> = {
    baccarat: { table: "baccarat", seats: BACCARAT_SEATS.baccarat, phase: "betting", clock: 0, round: 0, stakes: [], player: [], banker: [], winner: "", paid: [], history: [], shoe: freshDeck(6) },
    baccarat_hall: { table: "baccarat_hall", seats: BACCARAT_SEATS.baccarat_hall, phase: "betting", clock: 0, round: 0, stakes: [], player: [], banker: [], winner: "", paid: [], history: [], shoe: freshDeck(6) },
  };
  /** The Big Six wheel: one spin at a time for the room. */
  private six: { phase: BigSixPhase; clock: number; spinId: number; result: number; prevResult: number; stakes: BigSixStake[]; paid: BigSixState["paid"]; history: BigSixBet[] } = { phase: "betting", clock: 0, spinId: 0, result: -1, prevResult: -1, stakes: [], paid: [], history: [] };
  /** When the patron at each coin pusher next drops a coin. */
  private readonly npcPusherAt = new Map<PusherId, number>();
  /** Each coin pusher's shelf of coins (kept with the room's scene), and the simulated time owed it. */
  private readonly shelves = new Map<PusherId, Shelf>(COIN_PUSHERS.map((m) => [m.propId, newShelf(m.propId)]));
  private readonly shelfLag = new Map<PusherId, number>();
  /** Whose the coins going over each pusher's edge are now (the last dropper's, for a while). */
  private readonly pusherCredit = new Map<PusherId, { sessionId: string; until: number; stake: number }>();
  /** Who has a pusher's panel open (sent its shelf ten times a second), and when they last were. */
  private readonly pusherWatch = new Map<string, PusherId>();
  private pusherViewAt = 0;
  /** A player's run of pusher payouts (the marquee's). */
  private readonly pusherBurst = new Map<string, { amount: number; at: number; stake: number; told: boolean }>();
  /** Free coins (their stakes), per player, per pusher. */
  private readonly pusherTokens = new Map<string, Partial<Record<PusherId, number[]>>>();
  /** The one-player machines: when each occupant's time is up, when a patron may next come, and a
   *  machine kept for the player who asked a patron to finish up. */
  private readonly machineUntil = new Map<string, number>();
  private readonly nextPatronAt = new Map<string, number>();
  private readonly reserved = new Map<string, { sessionId: string; until: number }>();
  /** The lounge's two-player 8-ball match (solo practice is the client's own). */
  private pool: PoolMatch = emptyPoolMatch();
  private poolShotAt = 0;
  private poolOverAt = 0;
  /** The baby grand's recital (one at a time), and each pianist's note bucket. */
  private recital: { sessionId: string; until: number } | null = null;
  private readonly noteBucket = new Map<string, { level: number; at: number }>();

  constructor(
    private readonly state: CasinoState,
    private readonly host: CasinoHost
  ) {
    const now = Date.now();
    for (const id of SINGLE_MACHINES) this.nextPatronAt.set(id, now + rand(4, 30) * 1000);
  }

  /** Whether a player is on one of the casino's floors (nothing here is played from anywhere else). */
  private inCasino(p: Patron | undefined): p is Patron {
    return !!p && isCasinoMap(p.map);
  }

  private addChips(p: Patron, amount: number) {
    p.chips = Math.max(0, Math.min(CHIP_CAP, p.chips + amount));
  }

  /** A win for the marquee (big enough), and the hall's celebration (a jackpot, a number hit). */
  private announce(sessionId: string, p: Patron, amount: number, game: CasinoGame, detail: string, celebrate: boolean) {
    if (!celebrate && amount < MARQUEE_MIN_WIN) return;
    this.host.shout("casinoWin", { sessionId, username: p.username, amount, game, detail, celebrate } satisfies CasinoWin);
  }

  /** Why something was refused, to the one who tried. */
  private refuse(sessionId: string, reason: CasinoNotice["reason"]) {
    this.host.sendTo(sessionId, "casinoNotice", { reason } satisfies CasinoNotice);
  }

  /** Whether `kind` is off its cooldown for this player (and starts it again if so). */
  private ready(sessionId: string, kind: string): boolean {
    const wait = COOLDOWN_MS[kind] ?? 0;
    const key = `${sessionId}:${kind}`;
    const now = Date.now();
    if (now - (this.lastUse.get(key) ?? 0) < wait) return false;
    this.lastUse.set(key, now);
    return true;
  }

  /** The player, if they are in the casino within reach of `game`'s table (else a "far" notice). */
  private atTable(sessionId: string, game: CasinoGameTable): Patron | undefined {
    const p = this.state.players.get(sessionId);
    if (!this.inCasino(p)) return undefined;
    if (!nearGameTable(game, p.x, p.z, GAME_SLACK)) {
      this.refuse(sessionId, "far");
      return undefined;
    }
    return p;
  }

  /** The player, if seated on one of `seats` (else a "seat" notice). */
  private seatedAt(sessionId: string, seats: readonly string[]): Patron | undefined {
    const p = this.state.players.get(sessionId);
    if (!this.inCasino(p)) return undefined;
    if (!seats.includes(this.host.seatOf(sessionId))) {
      this.refuse(sessionId, "seat");
      return undefined;
    }
    return p;
  }

  // --- Mr. Vance's cage ------------------------------------------------------------------------

  /** Buys chips with coins ("buy") or cashes chips back into coins ("cashout"), 1:1, at the cage
   *  window. The result (with the balances it left) goes back to the player either way. */
  exchange(sessionId: string, kind: "buy" | "cashout", requested: unknown) {
    const p = this.state.players.get(sessionId);
    if (!p) return;
    const reply = (ok: boolean, amount: number, reason?: CashierResult["reason"]) => this.host.sendTo(sessionId, "cashierResult", { ok, kind, amount, coins: p.coins, chips: p.chips, reason } satisfies CashierResult);
    if (p.map !== "velvet_casino" || Math.hypot(p.x - CASHIER_FRONT.x, p.z - CASHIER_FRONT.z) > CASHIER_REACH + CASHIER_SLACK) return reply(false, 0, "far");
    // what can move: what the balance drawn on holds, and no more than the other has room for
    const available = kind === "buy" ? Math.min(p.coins, CHIP_CAP - p.chips) : Math.min(p.chips, COIN_CAP - p.coins);
    const amount = exchangeAmount(requested, available);
    if (amount === null) return reply(false, 0, "amount");
    if (amount === 0) return reply(false, 0, "funds");
    if (kind === "buy") {
      p.coins -= amount;
      p.chips += amount;
    } else {
      p.chips -= amount;
      p.coins += amount;
    }
    this.host.persistNow(sessionId);
    this.host.broadcast("emote", { sessionId, emoji: kind === "buy" ? CHIP_EMOTE : "🪙" });
    reply(true, amount);
  }

  /** The Black Velvet VIP Pass: bought at the cage or from Bruno, pawned back only at the cage. */
  private vipPass(sessionId: string, p: Patron, kind: "buy" | "pawn") {
    const reply = (ok: boolean, reason?: VipPassResult["reason"]) => this.host.sendTo(sessionId, "vipPassResult", { ok, kind, chips: p.chips, hasPass: p.vipPass, reason } satisfies VipPassResult);
    const atCage = near(p, CASHIER_FRONT, CASHIER_REACH + CASHIER_SLACK);
    const atBruno = near(p, VIP_DOORS_FRONT, MACHINE_REACH + EXTRA_SLACK);
    if (kind === "buy") {
      if (!atCage && !atBruno) return reply(false, "far");
      if (p.vipPass) return reply(false, "have");
      if (p.chips < VIP_PASS.price) return reply(false, "chips");
      p.chips -= VIP_PASS.price;
      p.vipPass = true;
    } else {
      if (!atCage) return reply(false, "far");
      if (!p.vipPass) return reply(false, "none");
      p.vipPass = false;
      this.addChips(p, VIP_PASS.pawn);
    }
    this.host.persistNow(sessionId);
    this.host.broadcast("emote", { sessionId, emoji: kind === "buy" ? VIP_PASS.emoji : CHIP_EMOTE });
    reply(true);
  }

  // --- roulette -------------------------------------------------------------------------------

  /** Runs the wheel's loop and every table's clock (the room calls this every tick while the casino
   *  is the map). */
  tick(dt: number) {
    this.tickDerby(dt);
    this.tickBlackjack(dt);
    this.tickBaccarat(dt);
    this.tickBigSix(dt);
    this.tickMachines();
    this.tickPool();
    this.tickPushers(dt);
    const r = this.state.roulette;
    this.phaseClock -= dt;
    const shown = Math.max(0, Math.ceil(this.phaseClock));
    if (r.timeLeft !== shown) r.timeLeft = shown;
    if (this.phaseClock > 0) return;

    if (r.phase === "betting") {
      r.result = Math.floor(Math.random() * 37);
      r.spinId += 1;
      this.setPhase("spinning");
    } else if (r.phase === "spinning") {
      this.payRoulette(r.result);
      this.setPhase("payout");
    } else {
      this.state.bets.clear();
      this.setPhase("betting");
    }
  }

  private setPhase(phase: RoulettePhase) {
    this.state.roulette.phase = phase;
    this.phaseClock = ROULETTE_PHASE_SECONDS[phase];
    this.state.roulette.timeLeft = ROULETTE_PHASE_SECONDS[phase];
  }

  private payRoulette(result: number) {
    const winners: { sessionId: string; username: string; amount: number }[] = [];
    this.state.bets.forEach((raw, sessionId) => {
      const p = this.state.players.get(sessionId);
      if (!p) return;
      const bets = parseBets(raw);
      let won = 0;
      for (const [kind, amount] of Object.entries(bets)) won += betReturn(kind, amount, result);
      if (won > 0) {
        this.addChips(p, won);
        this.host.tally(sessionId, "roulette_win");
        winners.push({ sessionId, username: p.username, amount: won });
        this.host.broadcast("emote", { sessionId, emoji: won >= 100 ? "💰" : CHIP_EMOTE });
        // a number hit straight up sets the hall off; any big win makes the marquee
        const straight = (bets[`n${result}`] ?? 0) > 0;
        this.announce(sessionId, p, won, "roulette", straight ? `${result} straight up` : `${result} ${pocketColor(result)}`, straight);
      }
    });
    this.host.broadcast("rouletteResult", { result, winners });
  }

  /** Chips on a spot: any whole number, as long as the spot's total stays within its limits (a
   *  straight-up number 10 to 500, an even-money spot 25 to 2,500) and the round's within
   *  MAX_BET_TOTAL. */
  placeBet(sessionId: string, msg: { kind: string; amount: number }) {
    const p = this.state.players.get(sessionId);
    if (!this.inCasino(p) || this.state.roulette.phase !== "betting" || !isBetKind(msg?.kind)) return;
    const amount = Number(msg.amount);
    if (!Number.isInteger(amount) || amount < 1) return;
    if (Math.hypot(p.x - ROULETTE_CENTER.x, p.z - ROULETTE_CENTER.z) > ROULETTE_BET_RADIUS + ROULETTE_SLACK) return;
    const bets = parseBets(this.state.bets.get(sessionId) ?? "");
    const limit = rouletteLimit(msg.kind);
    const onSpot = (bets[msg.kind] ?? 0) + amount;
    if (onSpot < limit.min || onSpot > limit.max || sum(bets) + amount > MAX_BET_TOTAL) return this.refuse(sessionId, "limits");
    if (p.chips < amount) return this.refuse(sessionId, "chips");
    bets[msg.kind] = onSpot;
    p.chips -= amount;
    this.state.bets.set(sessionId, encodeBets(bets));
  }

  clearBets(sessionId: string) {
    if (this.state.roulette.phase !== "betting") return;
    this.refundBets(sessionId);
  }

  private refundBets(sessionId: string) {
    const raw = this.state.bets.get(sessionId);
    if (raw === undefined) return;
    const p = this.state.players.get(sessionId);
    if (p) this.addChips(p, sum(parseBets(raw)));
    this.state.bets.delete(sessionId);
  }

  // --- the pinball machines ----------------------------------------------------------------------

  private pinballs = new Map<string, { gameId: number; propId: string; stake: number; startedAt: number }>();
  private pinballSeq = 0;

  /** A credit into a pinball cabinet you stand at (the stake within its limits), taken as the first
   *  ball is launched: the game's id comes back. A new credit ends any game left open. */
  pinballStart(sessionId: string, propId: unknown, stake: unknown) {
    const m = PINBALL_MACHINES.find((q) => q.propId === propId);
    if (!m) return;
    const p = this.atTable(sessionId, "pinball");
    if (!p) return;
    const n = tableStake(stake, TABLE_LIMITS.pinball);
    if (n === null) return this.refuse(sessionId, "limits");
    if (p.chips < n) return this.refuse(sessionId, "chips");
    if (!this.claimMachine(sessionId, m.propId)) return;
    p.chips -= n;
    const gameId = ++this.pinballSeq;
    this.pinballs.set(sessionId, { gameId, propId: m.propId, stake: n, startedAt: Date.now() });
    this.host.sendTo(sessionId, "pinballStarted", { propId: m.propId, gameId, stake: n, chips: p.chips } satisfies PinballStarted);
  }

  /**
   * A game's end (the last ball drained, or the panel closed mid-game): the server plays it again
   * from its inputs (shared/pinball.ts, in slices so the room never stalls) and pays the score it
   * finds, by its tier. The game can't have run longer than the time since its credit went in.
   */
  async pinballEnd(sessionId: string, gameId: unknown, steps: unknown, inputs: unknown) {
    const game = this.pinballs.get(sessionId);
    if (!game || game.gameId !== gameId) return;
    this.pinballs.delete(sessionId);
    if (!validPinballInputs(inputs) || !Number.isInteger(steps) || (steps as number) < 0) return;
    const elapsedS = (Date.now() - game.startedAt) / 1000;
    const allowed = Math.min(PINBALL_MAX_STEPS, Math.ceil((elapsedS + 3) * PINBALL_STEPS_PER_S));
    const played = await replayPinball(inputs, Math.min(steps as number, allowed), 20_000);
    const tier = pinballTier(played.score);
    const mult = tier?.mult ?? 0;
    const payout = Math.floor(game.stake * mult);
    const p = this.state.players.get(sessionId);
    if (p && payout > 0) this.addChips(p, payout);
    this.host.sendTo(sessionId, "pinballResult", { propId: game.propId, gameId: game.gameId, score: played.score, mult, payout, chips: p?.chips ?? 0 } satisfies PinballResult);
    if (p && mult >= 5) this.announce(sessionId, p, payout, "pinball", `a ${played.score.toLocaleString("en-US")} Jackpot on Velvet Nights`, true);
  }

  // --- the one-player machines -----------------------------------------------------------------

  /** Whether the player may use a one-player machine now (free, theirs, or kept for them), taking it
   *  if so; a refusal says someone is at it. Other props are always free. */
  claimMachine(sessionId: string, propId: string): boolean {
    if (!SINGLE_MACHINES.includes(propId)) return true;
    const who = this.state.machines.get(propId) ?? "";
    const keep = this.reserved.get(propId);
    const now = Date.now();
    if ((who && who !== sessionId) || (!who && keep && keep.until > now && keep.sessionId !== sessionId)) {
      this.refuse(sessionId, "occupied");
      return false;
    }
    if (keep?.sessionId === sessionId) this.reserved.delete(propId);
    this.state.machines.set(propId, sessionId);
    this.machineUntil.set(propId, now + PLAYER_MACHINE_HOLD_SECONDS * 1000);
    return true;
  }

  /** The patrons' comings and goings at the machines, and players' machines let go once they walk
   *  off (or stop playing). */
  private tickMachines() {
    const now = Date.now();
    let npcs = 0;
    for (const id of SINGLE_MACHINES) if (isNpcOccupant(this.state.machines.get(id) ?? "")) npcs++;
    for (const id of SINGLE_MACHINES) {
      const who = this.state.machines.get(id) ?? "";
      const until = this.machineUntil.get(id) ?? 0;
      if (isNpcOccupant(who)) {
        if (now >= until) {
          this.state.machines.set(id, "");
          this.nextPatronAt.set(id, now + rand(15, 45) * 1000);
          npcs--;
        } else if (this.shelves.has(id as PusherId) && now >= (this.npcPusherAt.get(id as PusherId) ?? 0)) {
          // a patron at a coin pusher: a real coin (the table minimum) down the pegs onto the shelf
          // (it's there for the next player to push over), the plate sliding for everyone to see
          const pid = id as PusherId;
          this.npcPusherAt.set(pid, now + rand(NPC_PUSHER_DROP_S[0], NPC_PUSHER_DROP_S[1]) * 1000);
          const path = pegPath(0.5 + (Math.random() - 0.5) * 0.3, Math.random);
          const at = path[path.length - 1];
          if (landsOnShelf(at)) landCoin(this.shelves.get(pid)!, at, PUSHER_MACHINES[pid].seedValue);
          this.host.broadcast("casinoProp", { kind: "pusher", propId: pid, sessionId: who, seed: 0 } satisfies CasinoPropEvent);
        }
        continue;
      }
      if (who) {
        const p = this.state.players.get(who);
        const prop = PROP_AT.get(id);
        const gone = !p || !prop || Math.hypot(p.x - prop.x, p.z - prop.z) > INTERACT_RADIUS + 1;
        // (a pinball game in progress keeps its cabinet, however long it runs)
        const playing = this.pinballs.get(who)?.propId === id;
        if (gone || (now >= until && !playing)) {
          this.state.machines.set(id, "");
          this.nextPatronAt.set(id, now + rand(10, 30) * 1000);
        }
        continue;
      }
      // free: a patron wanders over now and then (never onto a machine kept for someone)
      const keep = this.reserved.get(id);
      if (keep && keep.until > now) continue;
      if (keep) this.reserved.delete(id);
      if (npcs >= MAX_NPC_MACHINES || now < (this.nextPatronAt.get(id) ?? 0)) continue;
      this.state.machines.set(id, `${NPC_PREFIX}${pick(PATRON_KINDS)}:${Math.floor(Math.random() * 5)}`);
      this.machineUntil.set(id, now + rand(NPC_MACHINE_SECONDS[0], NPC_MACHINE_SECONDS[1]) * 1000);
      npcs++;
    }
  }

  /** "Excuse me": the patron at a machine finishes this spin and goes, and the machine waits for the
   *  one who asked. */
  private excuseMe(sessionId: string, p: Patron, propId: unknown) {
    const id = String(propId ?? "");
    const prop = PROP_AT.get(id);
    if (!prop || !SINGLE_MACHINES.includes(id)) return;
    if (Math.hypot(p.x - prop.x, p.z - prop.z) > INTERACT_RADIUS + EXTRA_SLACK) return this.refuse(sessionId, "far");
    if (!isNpcOccupant(this.state.machines.get(id) ?? "") || !this.ready(sessionId, "excuse")) return;
    const now = Date.now();
    this.machineUntil.set(id, Math.min(this.machineUntil.get(id) ?? now, now + EXCUSE_ME_SECONDS * 1000));
    this.reserved.set(id, { sessionId, until: now + (EXCUSE_ME_SECONDS + EXCUSE_ME_HOLD_SECONDS) * 1000 });
    this.host.broadcast("casinoProp", { kind: "machine", propId: id, sessionId, seed: seed(), excused: true } satisfies CasinoPropEvent);
  }

  // --- slots ----------------------------------------------------------------------------------

  /** One pull of a machine you stand at: the stake (within the machine's limits; the penthouse's
   *  Golden Vault takes 500 to 10,000) goes in, the reels are broadcast, and a win is paid when they
   *  land. A machine someone else is at refuses you. */
  spinSlot(sessionId: string, prop: SlotProp | undefined, bet: number) {
    const p = this.state.players.get(sessionId);
    if (!this.inCasino(p) || !prop || prop.kind !== "slot") return;
    if (tableStake(bet, slotLimit(prop.propId)) === null) return this.refuse(sessionId, "limits");
    if (p.chips < bet) return this.refuse(sessionId, "chips");
    if (Math.hypot(p.x - prop.x, p.z - prop.z) > INTERACT_RADIUS + SLOT_SLACK) return;
    if (!this.claimMachine(sessionId, prop.propId)) return;
    p.chips -= bet;
    this.host.tally(sessionId, "slots_spin");
    const reels: [number, number, number] = [rollSymbol(), rollSymbol(), rollSymbol()];
    const triple = reels[0] === reels[1] && reels[1] === reels[2];
    let win = 0;
    if (triple) win = bet * SLOT_TRIPLE[reels[0]];
    else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) win = bet * SLOT_PAIR;
    this.host.broadcast("slotSpin", { propId: prop.propId, sessionId, reels, win, bet });
    if (win > 0) {
      this.host.later(SLOT_LAND_MS, () => {
        const now = this.state.players.get(sessionId);
        if (!now) return;
        this.addChips(now, win);
        // a pair only hands the stake back: nothing to cheer
        if (win > bet) this.host.broadcast("emote", { sessionId, emoji: win >= bet * 12 ? "💰" : CHIP_EMOTE });
        if (triple) this.announce(sessionId, now, win, "slots", `${SLOT_SYMBOLS[reels[0]]}${SLOT_SYMBOLS[reels[0]]}${SLOT_SYMBOLS[reels[0]]}`, SLOT_TRIPLE[reels[0]] >= CELEBRATE_SLOT_MULTIPLIER);
      });
    }
  }

  // --- blackjack: the tables' rounds ------------------------------------------------------------

  private bjView(t: BjTable): BlackjackTableView {
    const holeHidden = t.phase === "playing";
    const dealer = holeHidden ? t.dealer.slice(0, 1) : t.dealer;
    return {
      tableId: t.id,
      tier: t.tier,
      phase: t.phase,
      timeLeft: Math.max(0, Math.ceil(t.clock)),
      round: t.round,
      dealer,
      holeHidden,
      dealerTotal: dealer.length ? blackjackTotal(dealer) : 0,
      seats: t.seats.map((s) => ({ sessionId: s.sessionId, username: s.username, stool: s.stool, bet: s.bet, hands: s.hands.map((h) => ({ cards: h.cards, bet: h.bet, total: blackjackTotal(h.cards), status: h.status, doubled: h.doubled, outcome: h.outcome, payout: h.payout })) })),
    };
  }

  private bjSend(t: BjTable) {
    this.host.broadcast("blackjackTable", this.bjView(t));
  }

  private bjDraw(t: BjTable): Card {
    if (t.deck.length < 15) t.deck = freshDeck(4);
    return t.deck.pop()!;
  }

  /** The table view for someone sitting down or looking on. */
  blackjackFor(sessionId: string, tableId: string) {
    const t = this.tables.find((x) => x.id === tableId);
    if (t) this.host.sendTo(sessionId, "blackjackTable", this.bjView(t));
  }

  /** A move at the table your stool belongs to: a bet while the window is open, then hit, stand,
   *  double or split on a hand of yours in play (`hand`: which, once you've split: each plays on its
   *  own; the first still in play when none is named). */
  blackjack(sessionId: string, msg: { action: BlackjackAction; bet?: number; hand?: number }) {
    const stool = this.host.seatOf(sessionId);
    const t = this.tables.find((x) => x.stools.includes(stool));
    const p = this.state.players.get(sessionId);
    if (!this.inCasino(p)) return;
    if (!t) return this.refuse(sessionId, "seat");
    const action = msg?.action;
    let seat = t.seats.find((s) => s.sessionId === sessionId);

    if (action === "bet") {
      if (t.phase !== "betting") return this.refuse(sessionId, "busy");
      const bet = tableStake(msg.bet, TABLE_LIMITS[t.tier]);
      if (bet === null) return this.refuse(sessionId, "limits");
      // a new bet replaces the one down (its chips come back first)
      const back = seat?.bet ?? 0;
      if (p.chips + back < bet) return this.refuse(sessionId, "chips");
      if (!seat) {
        seat = { sessionId, username: p.username, stool, bet: 0, hands: [] };
        t.seats.push(seat);
      }
      this.addChips(p, back);
      p.chips -= bet;
      seat.bet = bet;
      seat.stool = stool;
      if (t.clock <= 0) t.clock = BLACKJACK_BET_SECONDS;
      // everyone seated has bet: no need to wait out the window
      const seated = t.stools.filter((id) => this.stoolSitter(id)).length;
      if (t.seats.filter((s) => s.bet > 0).length >= seated) t.clock = Math.min(t.clock, 1.2);
      return this.bjSend(t);
    }
    if (t.phase !== "playing" || !seat) return;
    const named = Number.isInteger(msg.hand) ? seat.hands[msg.hand as number] : undefined;
    const hand = named && named.status === "playing" ? named : seat.hands.find((h) => h.status === "playing");
    if (!hand) return;
    if (action === "hit") {
      hand.cards.push(this.bjDraw(t));
      const total = blackjackTotal(hand.cards);
      if (total > 21) hand.status = "bust";
      else if (total === 21) hand.status = "stood";
    } else if (action === "stand") {
      hand.status = "stood";
    } else if (action === "double") {
      if (hand.cards.length !== 2) return;
      if (p.chips < hand.bet) return this.refuse(sessionId, "chips");
      p.chips -= hand.bet;
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(this.bjDraw(t));
      hand.status = blackjackTotal(hand.cards) > 21 ? "bust" : "stood";
    } else if (action === "split") {
      if (!canSplit(hand.cards) || seat.hands.length >= BLACKJACK_MAX_HANDS) return;
      if (p.chips < hand.bet) return this.refuse(sessionId, "chips");
      p.chips -= hand.bet;
      const aces = hand.cards[0].rank === "A";
      const second: BjHand = { cards: [hand.cards.pop()!, this.bjDraw(t)], bet: hand.bet, status: "playing", doubled: false, outcome: "", payout: 0, split: true };
      hand.cards.push(this.bjDraw(t));
      hand.split = true;
      seat.hands.splice(seat.hands.indexOf(hand) + 1, 0, second);
      for (const h of [hand, second]) {
        // split aces take one card each; a 21 on two cards after a split simply stands
        if (aces || blackjackTotal(h.cards) === 21) h.status = "stood";
      }
    } else {
      return;
    }
    if (this.bjAllDone(t)) this.bjFinish(t);
    else this.bjSend(t);
  }

  /** The player on a stool, if any. */
  private stoolSitter(stool: string): string {
    let who = "";
    this.state.players.forEach((_p, id) => {
      if (!who && this.host.seatOf(id) === stool) who = id;
    });
    return who;
  }

  private bjAllDone(t: BjTable) {
    return t.seats.every((s) => s.hands.every((h) => h.status !== "playing"));
  }

  private tickBlackjack(dt: number) {
    for (const t of this.tables) {
      // a player who stood up from the table before the deal takes their bet back
      if (t.phase === "betting") {
        const left = t.seats.filter((s) => this.host.seatOf(s.sessionId) !== s.stool);
        if (left.length) {
          for (const s of left) {
            const p = this.state.players.get(s.sessionId);
            if (p) this.addChips(p, s.bet);
          }
          t.seats = t.seats.filter((s) => !left.includes(s));
          if (!t.seats.some((s) => s.bet > 0)) t.clock = 0;
          this.bjSend(t);
        }
      }
      if (t.clock <= 0) continue;
      const before = Math.ceil(t.clock);
      t.clock -= dt;
      if (t.clock > 0) {
        if (Math.ceil(t.clock) !== before && t.phase === "playing" && Math.ceil(t.clock) % 5 === 0) this.bjSend(t);
        continue;
      }
      if (t.phase === "betting") this.bjDeal(t);
      else if (t.phase === "playing") {
        // the turn clock ran out: every hand still in play stands
        for (const s of t.seats) for (const h of s.hands) if (h.status === "playing") h.status = "stood";
        this.bjFinish(t);
      } else {
        // a fresh round: the seats stay, the cards go
        t.phase = "betting";
        t.clock = 0;
        t.dealer = [];
        t.seats = t.seats.filter((s) => this.host.seatOf(s.sessionId) === s.stool);
        for (const s of t.seats) (s.hands = []), (s.bet = 0);
        this.bjSend(t);
      }
    }
  }

  private bjDeal(t: BjTable) {
    t.seats = t.seats.filter((s) => s.bet > 0);
    if (!t.seats.length) {
      t.clock = 0;
      return this.bjSend(t);
    }
    t.round += 1;
    for (const s of t.seats) {
      s.hands = [{ cards: [this.bjDraw(t), this.bjDraw(t)], bet: s.bet, status: "playing", doubled: false, outcome: "", payout: 0, split: false }];
      s.bet = 0;
    }
    t.dealer = [this.bjDraw(t), this.bjDraw(t)];
    for (const s of t.seats) for (const h of s.hands) if (blackjackTotal(h.cards) === 21) h.status = "blackjack";
    // the dealer's natural ends it at once (a player's natural pushes)
    if (blackjackTotal(t.dealer) === 21 || this.bjAllDone(t)) return this.bjFinish(t);
    t.phase = "playing";
    t.clock = BLACKJACK_TURN_SECONDS;
    this.bjSend(t);
  }

  /** The dealer draws to 17 (unless every hand is already bust or a natural), and the table settles. */
  private bjFinish(t: BjTable) {
    const dealerNatural = t.dealer.length === 2 && blackjackTotal(t.dealer) === 21;
    const live = t.seats.some((s) => s.hands.some((h) => h.status === "stood"));
    if (!dealerNatural && live) while (blackjackTotal(t.dealer) < 17) t.dealer.push(this.bjDraw(t));
    const theirs = blackjackTotal(t.dealer);
    for (const s of t.seats) {
      const p = this.state.players.get(s.sessionId);
      for (const h of s.hands) {
        const mine = blackjackTotal(h.cards);
        let outcome: BlackjackOutcome;
        if (h.status === "bust") outcome = "bust";
        else if (h.status === "blackjack") outcome = dealerNatural ? "push" : "blackjack";
        else if (dealerNatural) outcome = "lose";
        else outcome = theirs > 21 || mine > theirs ? "win" : mine === theirs ? "push" : "lose";
        h.outcome = outcome;
        h.payout = outcome === "blackjack" ? Math.floor(h.bet * 2.5) : outcome === "win" ? h.bet * 2 : outcome === "push" ? h.bet : 0;
        if (!p) continue;
        if (h.payout > 0) this.addChips(p, h.payout);
        this.host.broadcast("blackjackResult", { sessionId: s.sessionId, tableId: t.id, outcome } satisfies BlackjackResult);
        if (outcome === "win" || outcome === "blackjack") {
          this.host.tally(s.sessionId, "blackjack_win");
          this.announce(s.sessionId, p, h.payout, "blackjack", outcome === "blackjack" ? "Blackjack!" : `${mine} beats the dealer`, false);
        }
      }
      if (p && s.hands.some((h) => h.outcome === "win" || h.outcome === "blackjack")) this.host.broadcast("emote", { sessionId: s.sessionId, emoji: s.hands.some((h) => h.outcome === "blackjack") ? "💰" : CHIP_EMOTE });
    }
    t.phase = "settled";
    t.clock = BLACKJACK_SETTLE_SECONDS;
    this.bjSend(t);
  }

  // --- Texas Hold'em ------------------------------------------------------------------------------

  /** The table a chair belongs to (the hall's or the penthouse's), if it is a poker chair. */
  private pokerTableOf(sessionId: string): HoldemTable | null {
    const chair = this.host.seatOf(sessionId);
    return HALL_POKER_SEATS.includes(chair) ? "poker" : VIP_POKER_SEATS.includes(chair) ? "poker_vip" : null;
  }

  private holdemSend(sessionId: string, table: HoldemTable) {
    this.host.sendTo(sessionId, "holdemState", holdemView(this.holdem.get(sessionId) ?? null, table));
  }

  /** The table's view for someone sitting down (their hand in play, if any). */
  holdemFor(sessionId: string) {
    const game = this.holdem.get(sessionId);
    const table = game?.table ?? this.pokerTableOf(sessionId) ?? "poker";
    this.holdemSend(sessionId, table);
  }

  /** A new hand at the table your chair belongs to: the buy-in (within the table's limits) comes off
   *  your chips, and Boris and the house's players sit in with as much. */
  private holdemDeal(sessionId: string, buyIn: unknown) {
    const table = this.pokerTableOf(sessionId);
    const p = this.state.players.get(sessionId);
    if (!this.inCasino(p)) return;
    if (!table) return this.refuse(sessionId, "seat");
    const current = this.holdem.get(sessionId);
    if (current && !current.over) return this.refuse(sessionId, "busy");
    const stake = tableStake(buyIn, TABLE_LIMITS[table]);
    if (stake === null) return this.refuse(sessionId, "limits");
    if (p.chips < stake) return this.refuse(sessionId, "chips");
    p.chips -= stake;
    // the house's players: Boris, and one or two of the hall's regulars (upstairs, the Baron, and a
    // high roller now and then)
    const pool = [...(table === "poker" ? HOLDEM_REGULARS : HOLDEM_HIGH_ROLLERS)].sort(() => Math.random() - 0.5);
    const bots = table === "poker" ? [HOLDEM_BORIS, ...pool.slice(0, Math.random() < 0.5 ? 1 : 2)] : [HOLDEM_BORIS, HOLDEM_BARON, ...(Math.random() < 0.5 ? pool.slice(0, 1) : [])];
    const button = ((this.holdemButton.get(sessionId) ?? Math.floor(Math.random() * 3)) + 1) % (bots.length + 1);
    this.holdemButton.set(sessionId, button);
    const game = newHoldemHand(table, { name: p.username, emoji: "🎩" }, bots, stake, button, freshDeck());
    runHouse(game);
    this.holdem.set(sessionId, game);
    this.holdemSettle(sessionId, p, game);
    this.holdemSend(sessionId, table);
  }

  /** Your move in your hand (fold, check, call, raise to, all in); the house answers at once. */
  private holdemMove(sessionId: string, move: HoldemMove) {
    const p = this.state.players.get(sessionId);
    const game = this.holdem.get(sessionId);
    if (!this.inCasino(p) || !game || game.over || !move || typeof move !== "object") return;
    const you = game.seats.findIndex((q) => q.human);
    if (game.toAct !== you) return;
    if (!holdemAct(game, you, move)) return this.refuse(sessionId, "limits");
    runHouse(game);
    this.holdemSettle(sessionId, p, game);
    this.holdemSend(sessionId, game.table);
  }

  /** A hand over: your stack (and what you won in it) comes back to your chips, once; Boris has a
   *  word for it. */
  private holdemSettle(sessionId: string, p: Patron, game: HoldemGame) {
    if (!game.over || (game as HoldemGame & { paid?: boolean }).paid) return;
    (game as HoldemGame & { paid?: boolean }).paid = true;
    const you = game.seats.find((q) => q.human)!;
    this.addChips(p, you.stack);
    const net = you.stack - game.buyIn;
    const winners = game.seats.filter((q) => q.won > 0);
    const outcome: PokerResult["outcome"] = you.folded ? "fold" : you.won > 0 ? (winners.length > 1 ? "split" : "win") : "lose";
    this.host.broadcast("pokerResult", { sessionId, table: game.table, outcome, hand: you.hand, net } satisfies PokerResult);
    if (net > 0) {
      this.host.broadcast("emote", { sessionId, emoji: net >= game.buyIn ? "💰" : CHIP_EMOTE });
      this.announce(sessionId, p, you.won, "poker", you.hand ? `${you.hand} at Hold'em` : "takes the pot", you.hand === "Royal Flush" || you.hand === "Straight Flush" || you.hand === "Four of a Kind");
    }
  }

  /** A hand still in play ended without you (you stood up, left the casino, or lost the line): it is
   *  folded, and what is left of your stack comes back. */
  private holdemFold(sessionId: string) {
    const game = this.holdem.get(sessionId);
    const p = this.state.players.get(sessionId);
    if (!game) return;
    if (!game.over && p) {
      const you = game.seats.find((q) => q.human)!;
      // the chips in the pot stay there, as at any table; the rest of the stack is yours
      this.addChips(p, you.stack);
      (game as HoldemGame & { paid?: boolean }).paid = true;
    }
    this.holdem.delete(sessionId);
  }

  // --- baccarat ---------------------------------------------------------------------------------

  private baccState(b: BaccTable): BaccaratState {
    return { table: b.table, phase: b.phase, timeLeft: Math.max(0, Math.ceil(b.clock)), round: b.round, stakes: b.stakes, player: b.player, banker: b.banker, winner: b.winner, paid: b.paid, history: b.history };
  }

  /** The table a baccarat prop is (the hall's kidney table, or the penthouse's). */
  private baccOf(propId: string): BaccTable {
    return propId === BACCARAT_TABLES.baccarat_hall.propId ? this.baccs.baccarat_hall : this.baccs.baccarat;
  }

  baccaratFor(sessionId: string, propId: string) {
    this.host.sendTo(sessionId, "baccaratState", this.baccState(this.baccOf(propId)));
  }

  /** A stake on Player, Banker or Tie from a stool at either table, while its window is open. */
  private baccaratBet(sessionId: string, bet: unknown, amount: unknown) {
    const seat = this.host.seatOf(sessionId);
    const b = Object.values(this.baccs).find((t) => t.seats.includes(seat));
    if (!b) return this.refuse(sessionId, "seat");
    const p = this.seatedAt(sessionId, b.seats);
    if (!p) return;
    if (b.phase !== "betting") return this.refuse(sessionId, "busy");
    if (bet !== "player" && bet !== "banker" && bet !== "tie") return;
    const limit = TABLE_LIMITS[b.table];
    const stake = tableStake(amount, limit);
    if (stake === null) return this.refuse(sessionId, "limits");
    if (p.chips < stake) return this.refuse(sessionId, "chips");
    p.chips -= stake;
    const mine = b.stakes.find((s) => s.sessionId === sessionId && s.bet === bet);
    if (mine && mine.amount + stake <= limit.max) mine.amount += stake;
    else if (mine) {
      this.addChips(p, stake);
      return this.refuse(sessionId, "limits");
    } else b.stakes.push({ sessionId, username: p.username, bet, amount: stake });
    if (b.clock <= 0) {
      b.clock = BACCARAT_BET_SECONDS;
      // upstairs, the Duchess never lets a coup go by without a wager of her own
      if (b.table === "baccarat") b.stakes.push({ sessionId: "npc:duchess", username: "Duchess Penelope", bet: Math.random() < 0.7 ? "banker" : Math.random() < 0.8 ? "player" : "tie", amount: pick(TABLE_LIMITS.baccarat.presets) });
    }
    this.host.broadcast("baccaratState", this.baccState(b));
  }

  private tickBaccarat(dt: number) {
    for (const b of Object.values(this.baccs)) {
      if (b.clock <= 0) continue;
      b.clock -= dt;
      if (b.clock > 0) continue;
      if (b.phase === "betting") {
        if (b.shoe.length < 20) b.shoe = freshDeck(6);
        const coup = baccaratCoup(() => b.shoe.pop()!);
        b.round += 1;
        b.player = coup.player;
        b.banker = coup.banker;
        b.winner = coup.winner;
        b.phase = "dealing";
        b.clock = BACCARAT_DEAL_SECONDS;
      } else if (b.phase === "dealing") {
        // the cards are all out: the table settles
        const winner = b.winner as BaccaratBet;
        const owed = new Map<string, number>();
        for (const s of b.stakes) {
          if (s.sessionId.startsWith("npc:")) continue;
          owed.set(s.sessionId, (owed.get(s.sessionId) ?? 0) + baccaratReturn(s.bet, s.amount, winner));
        }
        b.paid = [];
        for (const [sessionId, amount] of owed) {
          const p = this.state.players.get(sessionId);
          if (!p || amount <= 0) continue;
          this.addChips(p, amount);
          b.paid.push({ sessionId, username: p.username, amount });
          const staked = b.stakes.filter((s) => s.sessionId === sessionId).reduce((a, s) => a + s.amount, 0);
          if (amount > staked) {
            this.host.broadcast("emote", { sessionId, emoji: CHIP_EMOTE });
            this.announce(sessionId, p, amount, "baccarat", `${winner === "tie" ? "a tie" : winner} wins`, winner === "tie");
          }
        }
        b.history = [winner, ...b.history].slice(0, 12);
        b.phase = "settled";
        b.clock = BACCARAT_SETTLE_SECONDS;
      } else {
        b.phase = "betting";
        b.clock = 0;
        b.stakes = [];
        b.player = [];
        b.banker = [];
        b.winner = "";
        b.paid = [];
      }
      this.host.broadcast("baccaratState", this.baccState(b));
    }
  }

  // --- the Big Six wheel ------------------------------------------------------------------------------

  private sixState(): BigSixState {
    const w = this.six;
    return { phase: w.phase, timeLeft: Math.max(0, Math.ceil(w.clock)), spinId: w.spinId, result: w.result, prevResult: w.prevResult, stakes: w.stakes, paid: w.paid, history: w.history };
  }

  bigSixFor(sessionId: string) {
    this.host.sendTo(sessionId, "bigSixState", this.sixState());
  }

  /** A stake on a segment, standing at the wheel's ledge while bets are open (the first opens them). */
  private bigSixBet(sessionId: string, bet: unknown, amount: unknown) {
    const p = this.atTable(sessionId, "bigsix");
    if (!p) return;
    const w = this.six;
    if (w.phase !== "betting") return this.refuse(sessionId, "busy");
    if (!isBigSixBet(bet)) return;
    const limit = TABLE_LIMITS.bigsix;
    const stake = tableStake(amount, limit);
    if (stake === null) return this.refuse(sessionId, "limits");
    if (p.chips < stake) return this.refuse(sessionId, "chips");
    const mine = w.stakes.find((s) => s.sessionId === sessionId && s.bet === bet);
    if (mine && mine.amount + stake > limit.max) return this.refuse(sessionId, "limits");
    p.chips -= stake;
    if (mine) mine.amount += stake;
    else w.stakes.push({ sessionId, username: p.username, bet, amount: stake });
    if (w.clock <= 0) w.clock = BIG_SIX_BET_SECONDS;
    this.host.broadcast("bigSixState", this.sixState());
  }

  private tickBigSix(dt: number) {
    const w = this.six;
    if (w.clock <= 0) return;
    const before = Math.ceil(w.clock);
    w.clock -= dt;
    if (w.clock > 0) {
      // a whole-second countdown while bets are open, every few seconds
      if (w.phase === "betting" && Math.ceil(w.clock) !== before && Math.ceil(w.clock) % 3 === 0) this.host.broadcast("bigSixState", this.sixState());
      return;
    }
    if (w.phase === "betting") {
      w.prevResult = w.result;
      w.result = Math.floor(Math.random() * BIG_SIX_SEGMENTS.length);
      w.spinId += 1;
      w.phase = "spinning";
      w.clock = BIG_SIX_SPIN_MS / 1000 + 0.4;
    } else if (w.phase === "spinning") {
      const landed = BIG_SIX_SEGMENTS[w.result];
      const owed = new Map<string, number>();
      for (const s of w.stakes) owed.set(s.sessionId, (owed.get(s.sessionId) ?? 0) + bigSixReturn(s.bet, s.amount, landed));
      w.paid = [];
      for (const [sessionId, amount] of owed) {
        const p = this.state.players.get(sessionId);
        if (!p || amount <= 0) continue;
        this.addChips(p, amount);
        w.paid.push({ sessionId, username: p.username, amount });
        this.host.broadcast("emote", { sessionId, emoji: landed === "joker" || landed === "20" ? "💰" : CHIP_EMOTE });
        this.announce(sessionId, p, amount, "bigsix", landed === "joker" ? "the Joker on the Big Six" : `${landed}x on the Big Six`, landed === "joker");
      }
      w.history = [landed, ...w.history].slice(0, 14);
      w.phase = "settled";
      w.clock = BIG_SIX_SETTLE_SECONDS;
    } else {
      w.phase = "betting";
      w.clock = 0;
      w.stakes = [];
      w.paid = [];
    }
    this.host.broadcast("bigSixState", this.sixState());
  }

  // --- craps ------------------------------------------------------------------------------------

  private crapsGame(sessionId: string): CrapsGame {
    let game = this.crapsGames.get(sessionId);
    if (!game) {
      game = { point: 0, pass: 0, rollId: 0, dice: null, results: [], payout: 0 };
      this.crapsGames.set(sessionId, game);
    }
    return game;
  }

  private crapsView(game: CrapsGame): CrapsView {
    return { point: game.point, pass: game.pass, dice: game.dice, rollId: game.rollId, results: game.results, payout: game.payout };
  }

  /** Your own roll: the new stakes go down (a Pass bet only on a come-out), the dice are thrown for
   *  the whole hall to see, and every bet they decide is settled. */
  craps(sessionId: string, stakes: CrapsStakes) {
    const p = this.atTable(sessionId, "craps");
    if (!p || !stakes || typeof stakes !== "object") return;
    const game = this.crapsGame(sessionId);
    const limit = TABLE_LIMITS.craps;
    const fresh: Record<CrapsBet, number> = { pass: 0, field: 0, any7: 0 };
    for (const bet of ["pass", "field", "any7"] as CrapsBet[]) {
      const raw = Number(stakes[bet] ?? 0);
      if (raw === 0) continue;
      const n = tableStake(raw, limit);
      if (n === null) return this.refuse(sessionId, "limits");
      fresh[bet] = n;
    }
    if (fresh.pass > 0 && game.point > 0) return this.refuse(sessionId, "busy"); // the pass line rides already
    const total = fresh.pass + fresh.field + fresh.any7;
    if (total === 0 && game.pass === 0) return this.refuse(sessionId, "limits");
    if (p.chips < total) return this.refuse(sessionId, "chips");
    if (!this.ready(sessionId, "craps")) return;
    p.chips -= total;
    game.pass += fresh.pass;

    const dice: [number, number] = [die(), die()];
    const rolled = dice[0] + dice[1];
    const results: CrapsView["results"] = [];
    let payout = 0;
    for (const bet of ["field", "any7"] as const) {
      if (!fresh[bet]) continue;
      const back = crapsReturn(bet, fresh[bet], rolled, 0) ?? 0;
      payout += back;
      results.push({ bet, amount: fresh[bet], returned: back });
    }
    if (game.pass > 0) {
      const back = crapsReturn("pass", game.pass, rolled, game.point);
      results.push({ bet: "pass", amount: game.pass, returned: back });
      if (back === null) {
        if (game.point === 0) game.point = rolled; // the come-out set the point
      } else {
        payout += back;
        game.pass = 0;
        game.point = 0;
      }
    }
    game.dice = dice;
    game.rollId += 1;
    game.results = results;
    game.payout = payout;
    if (payout > 0) this.addChips(p, payout);
    this.host.broadcast("casinoProp", { kind: "craps", propId: "craps_table", sessionId, seed: seed(), dice } satisfies CasinoPropEvent);
    this.host.sendTo(sessionId, "crapsState", this.crapsView(game));
    const staked = results.reduce((a, r) => a + r.amount, 0);
    if (payout > staked) {
      this.host.broadcast("emote", { sessionId, emoji: CHIP_EMOTE });
      this.announce(sessionId, p, payout, "craps", `rolled ${rolled}`, false);
    }
  }

  // --- the Mechanical Turf Club -----------------------------------------------------------------

  private derbyState(): DerbyState {
    const d = this.derby;
    return { phase: d.phase, timeLeft: Math.max(0, Math.ceil(d.clock)), raceId: d.raceId, winner: d.winner, tickets: d.tickets, paid: d.paid, seed: d.seed };
  }

  /** A ticket on one horse (one per player per race): the first opens the betting window. */
  derbyBet(sessionId: string, horse: unknown, amount: unknown) {
    const p = this.atTable(sessionId, "derby");
    if (!p) return;
    const d = this.derby;
    if (d.phase === "racing") return this.refuse(sessionId, "busy");
    const lane = Number(horse);
    if (!Number.isInteger(lane) || lane < 0 || lane >= DERBY_RACERS.length) return;
    const stake = tableStake(amount, TABLE_LIMITS.derby);
    if (stake === null) return this.refuse(sessionId, "limits");
    if (d.tickets.some((t) => t.sessionId === sessionId)) return this.refuse(sessionId, "busy");
    if (p.chips < stake) return this.refuse(sessionId, "chips");
    p.chips -= stake;
    d.tickets.push({ sessionId, username: p.username, horse: lane, amount: stake });
    if (d.phase === "idle") {
      d.phase = "betting";
      d.clock = DERBY_BET_SECONDS;
      d.paid = [];
    }
    this.host.broadcast("derbyState", this.derbyState());
  }

  private tickDerby(dt: number) {
    const d = this.derby;
    if (d.phase === "idle") return;
    d.clock -= dt;
    if (d.clock > 0) return;
    if (d.phase === "betting") {
      // they're off: the winner is decided now, and what the winning tickets are owed with it (so a
      // player who leaves mid-race is paid all the same)
      d.phase = "racing";
      d.clock = DERBY_RACE_MS / 1000;
      d.raceId += 1;
      d.seed = seed();
      d.winner = rollDerby(Math.random());
      for (const t of d.tickets) if (t.horse === d.winner) this.derbyOwed.set(t.sessionId, (this.derbyOwed.get(t.sessionId) ?? 0) + t.amount * DERBY_RACERS[d.winner].pays);
      this.host.broadcast("casinoProp", { kind: "derby", propId: "derby_table", sessionId: d.tickets[0]?.sessionId ?? "", seed: d.seed, winner: d.winner } satisfies CasinoPropEvent);
      this.host.broadcast("derbyState", this.derbyState());
    } else {
      // past the post: the winning tickets are paid
      d.paid = [];
      for (const [sessionId, owed] of this.derbyOwed) {
        const p = this.state.players.get(sessionId);
        if (!p) continue;
        this.addChips(p, owed);
        d.paid.push({ sessionId, username: p.username, amount: owed });
        this.host.broadcast("emote", { sessionId, emoji: "🏇" });
        this.announce(sessionId, p, owed, "derby", `${DERBY_RACERS[d.winner].name} wins`, DERBY_RACERS[d.winner].pays >= 10);
      }
      this.derbyOwed.clear();
      d.phase = "idle";
      d.clock = 0;
      d.tickets = [];
      this.host.broadcast("derbyState", this.derbyState());
    }
  }

  /** What the Turf Club shows someone walking up to it. */
  derbyFor(sessionId: string) {
    this.host.sendTo(sessionId, "derbyState", this.derbyState());
  }

  // --- the coin pushers --------------------------------------------------------------------------

  /** A coin dropped at a pusher where its dropper was (`pos`, 0 to 1): a free coin if one is held
   *  there, else the stake within that pusher's limits. It rattles down the pegs (the server's roll)
   *  onto the shelf, or down a side chute to the house; what goes over the edge from now on is the
   *  dropper's for PUSHER_CREDIT_MS after this coin. */
  pusherDrop(sessionId: string, propId: unknown, stake: unknown, pos: unknown) {
    const m = COIN_PUSHERS.find((q) => q.propId === propId);
    if (!m) return;
    const p = this.atTable(sessionId, pusherGame(m.propId));
    if (!p) return;
    if (!this.ready(sessionId, "pusher")) return;
    const mine = this.pusherTokens.get(sessionId) ?? {};
    const held = mine[m.propId] ?? [];
    const free = held.length > 0;
    let s: number;
    if (!free) {
      const n = tableStake(stake, TABLE_LIMITS[PUSHER_MACHINES[m.propId].limit]);
      if (n === null) return this.refuse(sessionId, "limits");
      if (p.chips < n) return this.refuse(sessionId, "chips");
      s = n;
    } else s = held[0];
    const shelf = this.shelves.get(m.propId)!;
    if (shelf.coins.length >= PUSHER_MAX_COINS) return this.refuse(sessionId, "busy");
    if (!this.claimMachine(sessionId, m.propId)) return;
    if (free) held.shift();
    else p.chips -= s;
    const path = pegPath(Math.max(0, Math.min(1, Number(pos) || 0)), Math.random);
    const landing = path[path.length - 1];
    const landed = landsOnShelf(landing);
    const coin = landed ? landCoin(shelf, landing, s) : null;
    if (Math.random() < PUSHER_TOKEN_CHANCE) held.push(s);
    mine[m.propId] = held;
    this.pusherTokens.set(sessionId, mine);
    this.pusherCredit.set(m.propId, { sessionId, until: Date.now() + PUSHER_CREDIT_MS, stake: s });
    this.pusherWatch.set(sessionId, m.propId);
    this.host.sendTo(sessionId, "pusherEvent", { propId: m.propId, kind: "drop", path, landed, id: coin?.id ?? 0, v: s } satisfies PusherEvent);
    this.host.sendTo(sessionId, "pusherPurse", { propId: m.propId, chips: p.chips, tokens: held, free } satisfies PusherPurse);
    this.host.broadcast("casinoProp", { kind: "pusher", propId: m.propId, sessionId, seed: s } satisfies CasinoPropEvent);
  }

  /** Opening a pusher's panel: its shelf and the player's purse there, and the shelf ten times a
   *  second from then on. */
  pusherOpen(sessionId: string, p: Patron, propId: PusherId) {
    this.pusherWatch.set(sessionId, propId);
    const shelf = this.shelves.get(propId)!;
    this.host.sendTo(sessionId, "pusherView", { propId, t: shelf.t, coins: packShelf(shelf) } satisfies PusherView);
    this.host.sendTo(sessionId, "pusherPurse", { propId, chips: p.chips, tokens: this.pusherTokens.get(sessionId)?.[propId] ?? [] } satisfies PusherPurse);
  }

  /** The shelves at a fixed step while anything on one moves (or someone is watching it), what goes
   *  over the edges paid out, and the shelves sent to the players at them. */
  private tickPushers(dt: number) {
    const now = Date.now();
    for (const [sid, id] of this.pusherWatch) {
      const p = this.state.players.get(sid);
      if (!p || !this.inCasino(p) || !nearGameTable(pusherGame(id), p.x, p.z, GAME_SLACK + 0.5)) this.pusherWatch.delete(sid);
    }
    const watched = new Set(this.pusherWatch.values());
    for (const m of COIN_PUSHERS) {
      const shelf = this.shelves.get(m.propId)!;
      if (!watched.has(m.propId) && !shelfAwake(shelf)) {
        this.shelfLag.set(m.propId, 0);
        continue;
      }
      let lag = (this.shelfLag.get(m.propId) ?? 0) + dt;
      const falls: ShelfFall[] = [];
      for (let k = 0; lag >= SHELF_STEP_S && k < 12; k++) {
        falls.push(...stepShelf(shelf));
        lag -= SHELF_STEP_S;
      }
      this.shelfLag.set(m.propId, Math.min(lag, SHELF_STEP_S));
      if (falls.length) this.pusherFalls(m.propId, falls, now);
    }
    if (this.pusherWatch.size && now - this.pusherViewAt >= PUSHER_VIEW_MS) {
      this.pusherViewAt = now;
      for (const [sid, id] of this.pusherWatch) {
        const shelf = this.shelves.get(id)!;
        this.host.sendTo(sid, "pusherView", { propId: id, t: shelf.t, coins: packShelf(shelf) } satisfies PusherView);
      }
    }
  }

  /** Coins over a pusher's edge: those into the tray paid to whoever's they are now (the last
   *  dropper, while their credit runs; the house's otherwise), the gutter's the house's. */
  private pusherFalls(propId: PusherId, falls: ShelfFall[], now: number) {
    const credit = this.pusherCredit.get(propId);
    const owner = credit && credit.until > now ? credit.sessionId : "";
    const to = owner ? this.state.players.get(owner) : undefined;
    let paid = 0;
    if (to) for (const f of falls) if (!f.gutter) paid += f.v;
    if (to && paid > 0) {
      this.addChips(to, paid);
      this.host.sendTo(owner, "pusherPurse", { propId, chips: to.chips, tokens: this.pusherTokens.get(owner)?.[propId] ?? [], paid } satisfies PusherPurse);
      let burst = this.pusherBurst.get(owner);
      if (!burst || now - burst.at > PUSHER_BURST_MS) burst = { amount: 0, at: now, stake: credit!.stake, told: false };
      burst.amount += paid;
      burst.at = now;
      this.pusherBurst.set(owner, burst);
      if (!burst.told && burst.amount >= Math.max(MARQUEE_MIN_WIN, burst.stake * PUSHER_BURST_X)) {
        burst.told = true;
        this.announce(owner, to, burst.amount, "pusher", "a cascade of coins", true);
      }
    }
    for (const [sid, id] of this.pusherWatch) {
      if (id === propId) this.host.sendTo(sid, "pusherEvent", { propId, kind: "fall", falls: falls.map((f) => ({ id: f.id, x: f.x, v: f.v, gutter: f.gutter })), paid: sid === owner ? paid : 0 } satisfies PusherEvent);
    }
    this.host.broadcast("casinoProp", { kind: "pusher", propId, sessionId: owner, seed: falls.length } satisfies CasinoPropEvent);
  }

  /** The shelves as the room saves them (shared/pusherSim.ts saveShelf). */
  saveShelves(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const [id, shelf] of this.shelves) out[id] = saveShelf(shelf);
    return out;
  }

  /** The shelves a saved scene brings back (a shelf it has none for, or an unreadable one, is laid
   *  out new). */
  restoreShelves(v: unknown) {
    const saved = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    for (const m of COIN_PUSHERS) this.shelves.set(m.propId, loadShelf(saved[m.propId]) ?? newShelf(m.propId));
  }

  // --- the lounge's 8-ball match -----------------------------------------------------------------

  private poolSend() {
    this.host.broadcast("poolState", this.pool);
  }

  poolFor(sessionId: string) {
    this.host.sendTo(sessionId, "poolState", this.pool);
  }

  private poolJoin(sessionId: string, p: Patron) {
    if (!nearGameTable("billiards", p.x, p.z, GAME_SLACK)) return this.refuse(sessionId, "far");
    const m = this.pool;
    if (m.phase === "over") this.pool = emptyPoolMatch();
    if (this.pool.phase !== "waiting" || this.pool.players.some((q) => q.sessionId === sessionId) || this.pool.players.length >= 2) return this.poolFor(sessionId);
    this.pool.players.push({ sessionId, username: p.username, group: null });
    if (this.pool.players.length === 2) {
      const breaker = Math.random() < 0.5 ? 0 : 1;
      this.pool = { ...this.pool, phase: "playing", turn: breaker, balls: poolRack(), breakShot: true, ballInHand: false, shotId: 0, pending: false, winner: "", say: `${this.pool.players[breaker].username} breaks` };
    } else this.pool.say = `${p.username} is waiting for a challenger`;
    this.poolSend();
  }

  private poolLeave(sessionId: string) {
    const m = this.pool;
    const i = m.players.findIndex((q) => q.sessionId === sessionId);
    if (i < 0) return;
    if (m.phase === "playing") {
      const other = m.players[1 - i];
      this.pool = { ...m, phase: "over", pending: false, winner: other.sessionId, say: `${m.players[i].username} left the table: ${other.username} wins` };
      this.poolOverAt = Date.now();
    } else this.pool = { ...m, players: m.players.filter((q) => q.sessionId !== sessionId), say: "Join the table for a game of 8-ball" };
    this.poolSend();
  }

  private poolShot(sessionId: string, packet: Extract<CasinoPacket, { type: "POOL_SHOT" }>) {
    const m = this.pool;
    if (m.phase !== "playing" || m.pending || m.players[m.turn]?.sessionId !== sessionId) return;
    const angle = Number(packet.angle);
    const power = Number(packet.power);
    if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0 || power > 1) return;
    let cue: { x: number; y: number } | null = null;
    if (packet.cue && m.ballInHand) {
      const x = Number(packet.cue.x);
      const y = Number(packet.cue.y);
      if (Number.isFinite(x) && Number.isFinite(y) && poolCueSpotFree(m.balls, x, y)) cue = { x, y };
    }
    m.shotId += 1;
    m.pending = true;
    this.poolShotAt = Date.now();
    this.host.broadcast("poolShot", { shotId: m.shotId, by: sessionId, angle, power, cue } satisfies PoolShotEvent);
    this.poolSend();
  }

  /** The shooter's client reports where the shot left the balls (every client replayed the same
   *  shot); the server rules on it. */
  private poolSettle(sessionId: string, packet: Extract<CasinoPacket, { type: "POOL_SETTLE" }>) {
    const m = this.pool;
    if (!m.pending || packet.shotId !== m.shotId || m.players[m.turn]?.sessionId !== sessionId) return;
    const balls = Array.isArray(packet.balls) ? packet.balls : [];
    const clean: PoolBall[] = [];
    for (let n = 0; n <= 15; n++) {
      const b = balls.find((q) => q && q.n === n);
      if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < 0 || b.x > POOL_W || b.y < 0 || b.y > POOL_H) return;
      clean.push({ n, x: b.x, y: b.y, in: !!b.in });
    }
    const potted = (Array.isArray(packet.potted) ? packet.potted : []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 15 && clean[n].in);
    const firstHit = Number.isInteger(packet.firstHit) && packet.firstHit >= -1 && packet.firstHit <= 15 ? packet.firstHit : -1;
    this.pool = ruleOnShot(m, m.balls, clean, potted, firstHit);
    if (this.pool.phase === "over") this.poolOverAt = Date.now();
    this.poolSend();
  }

  private tickPool() {
    const m = this.pool;
    const now = Date.now();
    if (m.phase === "playing" && m.pending && now - this.poolShotAt > POOL_SHOT_TIMEOUT_MS) {
      // the shot never came back: the balls stay as they were, and the turn passes
      this.pool = { ...m, pending: false, turn: 1 - m.turn, say: `That shot got lost: ${m.players[1 - m.turn].username} to shoot` };
      this.poolSend();
    } else if (m.phase === "over" && now - this.poolOverAt > POOL_OVER_MS) {
      this.pool = emptyPoolMatch();
      this.poolSend();
    }
  }

  // --- the baby grand ---------------------------------------------------------------------------

  /** At the piano: seated on its bench. */
  private atPiano(sessionId: string, p: Patron) {
    return this.host.seatOf(sessionId) === "seat_piano" && near(p, PIANO_KEYS, PIANO_REACH + EXTRA_SLACK);
  }

  private pianoRecital(sessionId: string, p: Patron, piece: unknown) {
    if (!isPianoPiece(piece)) return;
    if (!this.atPiano(sessionId, p)) return this.refuse(sessionId, "seat");
    const now = Date.now();
    if (this.recital && this.recital.until > now && this.recital.sessionId !== sessionId) return this.refuse(sessionId, "busy");
    this.recital = { sessionId, until: now + PIANO_PIECES[piece].seconds * 1000 };
    this.host.broadcast("pianoRecital", { sessionId, piece } satisfies PianoRecital);
  }

  private pianoStop(sessionId: string) {
    if (this.recital?.sessionId !== sessionId) return;
    this.recital = null;
    this.host.broadcast("pianoRecital", { sessionId, piece: "" } satisfies PianoRecital);
  }

  /** A key played by hand: heard by everyone else in the hall (the pianist hears it at once). */
  private pianoNote(sessionId: string, p: Patron, midi: unknown) {
    const n = Number(midi);
    if (!Number.isInteger(n) || n < PIANO_LOW || n > PIANO_HIGH || !this.atPiano(sessionId, p)) return;
    const now = Date.now();
    const b = this.noteBucket.get(sessionId) ?? { level: NOTE_BURST, at: now };
    b.level = Math.min(NOTE_BURST, b.level + ((now - b.at) / 1000) * NOTES_PER_SECOND);
    b.at = now;
    this.noteBucket.set(sessionId, b);
    if (b.level < 1) return;
    b.level -= 1;
    this.host.broadcastExcept(sessionId, "pianoNote", { sessionId, midi: n } satisfies PianoNote);
  }

  // --- the house's extras -----------------------------------------------------------------------

  /** A casino prop walked up to (or, for the ones you can use from a seat, clicked from it). The
   *  room has already checked the general reach (INTERACT_RADIUS); the finer ones are here. */
  useProp(sessionId: string, prop: SlotProp) {
    const p = this.state.players.get(sessionId);
    if (!this.inCasino(p)) return;
    const event = (kind: CasinoPropEvent["kind"], extra: Partial<CasinoPropEvent> = {}) => ({ kind, propId: prop.propId, sessionId, seed: seed(), ...extra }) satisfies CasinoPropEvent;
    const panel = (kind: string) => this.host.sendTo(sessionId, "openPanel", { kind, propId: prop.propId });
    switch (prop.kind) {
      // the game tables: walking up to one opens its panel (nothing ever opens by itself)
      case "roulette":
        panel("roulette");
        break;
      case "blackjack": {
        // its panel, to play from a stool or to look on standing (its rounds are everyone's to see)
        const t = BLACKJACK_TABLES.find((x) => x.id === prop.propId);
        if (!t) break;
        panel("blackjack");
        this.blackjackFor(sessionId, t.id);
        break;
      }
      case "poker":
        if (nearGameTable(prop.propId === "vip_poker_table" ? "poker_vip" : "poker", p.x, p.z, GAME_SLACK)) {
          panel("poker");
          this.holdemFor(sessionId);
        }
        break;
      case "baccarat": {
        const hall = prop.propId === BACCARAT_TABLES.baccarat_hall.propId;
        if (nearGameTable(hall ? "baccarat_hall" : "baccarat", p.x, p.z, GAME_SLACK)) {
          panel("baccarat");
          this.baccaratFor(sessionId, prop.propId);
        }
        break;
      }
      case "bigsix":
        if (nearGameTable("bigsix", p.x, p.z, GAME_SLACK)) {
          panel("bigsix");
          this.bigSixFor(sessionId);
        }
        break;
      case "craps":
        if (nearGameTable("craps", p.x, p.z, GAME_SLACK)) {
          panel("craps");
          this.host.sendTo(sessionId, "crapsState", this.crapsView(this.crapsGame(sessionId)));
        }
        break;
      case "derby":
        if (nearGameTable("derby", p.x, p.z, GAME_SLACK)) {
          panel("derby");
          this.derbyFor(sessionId);
        }
        break;
      case "pusher": {
        const m = COIN_PUSHERS.find((q) => q.propId === prop.propId);
        if (!m || !nearGameTable(pusherGame(m.propId), p.x, p.z, GAME_SLACK)) break;
        if (!this.claimMachine(sessionId, prop.propId)) break;
        panel("pusher");
        this.pusherOpen(sessionId, p, m.propId);
        break;
      }
      case "pinball":
        // the panel; a credit goes in with the first ball (PINBALL_START)
        if (!nearGameTable("pinball", p.x, p.z, GAME_SLACK)) break;
        if (!this.claimMachine(sessionId, prop.propId)) break;
        panel("pinball");
        break;
      case "billiards":
        if (nearGameTable("billiards", p.x, p.z, GAME_SLACK)) {
          panel("pool");
          this.poolFor(sessionId);
        }
        break;
      case "piano":
        if (near(p, PIANO_KEYS, PIANO_REACH + EXTRA_SLACK)) panel("piano");
        break;
      // what you read, order and pull: their panels
      case "gazette":
        if (near(p, prop, GAZETTE_REACH + EXTRA_SLACK)) panel("gazette");
        break;
      case "barmenu":
        if (barDistance(p.x, p.z) <= BAR_REACH + EXTRA_SLACK) panel("barmenu");
        break;
      case "gachapon":
        if (near(p, GACHAPON_FRONT, MACHINE_REACH + EXTRA_SLACK)) panel("capsule");
        break;
      case "fortune":
        if (near(p, ZARA_FRONT, MACHINE_REACH + EXTRA_SLACK) && this.ready(sessionId, "fortune")) this.fortune(sessionId, p, event("fortune"));
        break;
      case "tipjar":
        this.tip(sessionId, p, prop.propId === "tipjar_boris" ? "boris" : "vivienne", event);
        break;
      case "vipdoor":
        this.vipDoor(sessionId, p, prop.propId === "vip_exit", event);
        break;
    }
  }

  /** Bruno's doors: a VIP pass takes you up to the penthouse (no pass: he offers you one); the
   *  elevator brings you back down to the stage. */
  private vipDoor(sessionId: string, p: Patron, leaving: boolean, event: (kind: CasinoPropEvent["kind"], extra?: Partial<CasinoPropEvent>) => CasinoPropEvent) {
    if (p.sitting || !this.ready(sessionId, "vipdoor")) return;
    if (leaving || p.map === "casino_vip") {
      this.host.broadcast("casinoProp", event("vipdoor", { vip: "out" }));
      this.host.travel(sessionId, "velvet_casino", VIP_DOORS_FRONT);
      return;
    }
    if (!near(p, VIP_DOORS_FRONT, MACHINE_REACH + EXTRA_SLACK)) return this.refuse(sessionId, "far");
    if (!p.vipPass) {
      this.host.sendTo(sessionId, "casinoProp", event("vipdoor", { vip: "refused" }));
      this.host.sendTo(sessionId, "openPanel", { kind: "vippass", propId: "vip_door" });
      return;
    }
    this.host.broadcast("casinoProp", event("vipdoor", { vip: "in" }));
    this.host.travel(sessionId, "casino_vip", VIP_ARRIVAL);
  }

  /** Madame Zara: one reading a day (the same one if you ask again), a lucky one with chips in it. */
  private fortune(sessionId: string, p: Patron, ev: CasinoPropEvent) {
    const profile = this.host.profile(sessionId);
    if (!profile) return;
    const day = todayKey();
    const again = profile.fortuneDay === day && profile.fortune >= 0;
    const index = again ? profile.fortune : fortuneFor(p.userId, day);
    const reading = ZARA_FORTUNES[index];
    let chips = 0;
    if (!again) {
      profile.fortuneDay = day;
      profile.fortune = index;
      if (reading.lucky) {
        chips = FORTUNE_LUCKY_CHIPS;
        this.addChips(p, chips);
      }
      this.host.persistNow(sessionId);
    }
    this.host.sendTo(sessionId, "fortuneResult", { text: reading.text, lucky: reading.lucky, chips, again } satisfies FortuneResult);
    // the owl on the booth hoots and spreads its wings, for everyone
    this.host.broadcast("casinoProp", ev);
  }

  /** A tip in a dealer's jar: from the spot in front of it (or a chair beside it). */
  private tip(sessionId: string, p: Patron, dealer: TipDealer, event: (kind: CasinoPropEvent["kind"], extra?: Partial<CasinoPropEvent>) => CasinoPropEvent) {
    const jar = TIP_JARS[dealer];
    if (!near(p, jar, MACHINE_REACH + EXTRA_SLACK) && !near(p, jar.front, MACHINE_REACH)) return;
    if (!this.ready(sessionId, "tipjar")) return;
    if (p.chips < DEALER_TIP) return this.refuse(sessionId, "chips");
    p.chips -= DEALER_TIP;
    this.host.broadcast("casinoProp", event("tipjar", { dealer }));
    this.host.broadcast("emote", { sessionId, emoji: "🪙" });
  }

  /** The capsule machine, Pippin's bar, the VIP pass, the title you wear, and the games played from
   *  a panel. */
  packet(sessionId: string, packet: CasinoPacket) {
    const p = this.state.players.get(sessionId);
    if (!p || !packet || typeof packet !== "object") return;
    if (packet.type === "EQUIP_TITLE") {
      // a title is worn everywhere, once won: "" takes it off
      const id = String(packet.id ?? "");
      if (id === "") p.title = "";
      else if ((isCasinoTitle(id) || specialTitle(id)) && this.host.owns(sessionId, capsuleUnlock({ kind: "title", id }))) p.title = id;
      else return;
      this.host.persistNow(sessionId);
      return;
    }
    if (!this.inCasino(p)) return;
    switch (packet.type) {
      case "CAPSULE_PULL": {
        if (!near(p, GACHAPON_FRONT, MACHINE_REACH + EXTRA_SLACK)) return this.refuse(sessionId, "far");
        if (p.chips < CAPSULE_COST) return this.refuse(sessionId, "chips");
        p.chips -= CAPSULE_COST;
        const prize = rollCapsule(Math.random());
        const unlock = capsuleUnlock(prize);
        const duplicate = this.host.owns(sessionId, unlock);
        if (duplicate) this.addChips(p, CAPSULE_DUP_REFUND);
        else this.host.grant(sessionId, unlock);
        this.host.tally(sessionId, "capsule_pull");
        this.host.persistNow(sessionId);
        this.host.sendTo(sessionId, "capsuleResult", { prize, duplicate, refund: duplicate ? CAPSULE_DUP_REFUND : 0 } satisfies CapsuleResult);
        if (!duplicate) this.host.broadcast("emote", { sessionId, emoji: prize.rarity === "legendary" ? "💰" : "✨" });
        return;
      }
      case "BAR_ORDER": {
        if (!isCasinoDrink(packet.drink)) return;
        if (barDistance(p.x, p.z) > BAR_REACH + EXTRA_SLACK) return this.refuse(sessionId, "far");
        const drink = CASINO_DRINKS[packet.drink];
        if (p.chips < drink.price) return this.refuse(sessionId, "chips");
        p.chips -= drink.price;
        this.host.aura(sessionId, drinkAura(packet.drink), drink.seconds);
        this.host.broadcast("casinoProp", { kind: "barmenu", propId: "bar_menu", sessionId, seed: seed(), drink: packet.drink } satisfies CasinoPropEvent);
        return;
      }
      case "BAR_SNACK":
        // Pippin's Fish Pretzels: on the house, one basket every little while
        if (barDistance(p.x, p.z) > BAR_REACH + EXTRA_SLACK) return this.refuse(sessionId, "far");
        if (!this.ready(sessionId, "snack")) return this.refuse(sessionId, "busy");
        this.host.broadcast("casinoProp", { kind: "barmenu", propId: "bar_menu", sessionId, seed: seed(), snack: true } satisfies CasinoPropEvent);
        this.host.broadcast("emote", { sessionId, emoji: BAR_SNACK.emoji });
        return;
      case "VIP_PASS_BUY":
        return this.vipPass(sessionId, p, "buy");
      case "VIP_PASS_PAWN":
        return this.vipPass(sessionId, p, "pawn");
      case "HOLDEM_DEAL":
        return this.holdemDeal(sessionId, packet.buyIn);
      case "HOLDEM_MOVE":
        return this.holdemMove(sessionId, packet.move);
      case "BIGSIX_BET":
        return this.bigSixBet(sessionId, packet.bet, packet.amount);
      case "BACCARAT_BET":
        return this.baccaratBet(sessionId, packet.bet, packet.amount);
      case "CRAPS_ROLL":
        return this.craps(sessionId, packet.stakes);
      case "DERBY_BET":
        return this.derbyBet(sessionId, packet.horse, packet.amount);
      case "PUSHER_DROP":
        return this.pusherDrop(sessionId, packet.propId, packet.stake, packet.pos);
      case "PUSHER_CLOSE":
        this.pusherWatch.delete(sessionId);
        return;
      case "PINBALL_START":
        return this.pinballStart(sessionId, packet.propId, packet.stake);
      case "PINBALL_END":
        return void this.pinballEnd(sessionId, packet.gameId, packet.steps, packet.inputs);
      case "EXCUSE_ME":
        return this.excuseMe(sessionId, p, packet.propId);
      case "POOL_BREAK":
        if (nearGameTable("billiards", p.x, p.z, GAME_SLACK) && this.ready(sessionId, "billiards")) this.host.broadcast("casinoProp", { kind: "billiards", propId: "billiards_table", sessionId, seed: seed() } satisfies CasinoPropEvent);
        return;
      case "POOL_JOIN":
        return this.poolJoin(sessionId, p);
      case "POOL_LEAVE":
        return this.poolLeave(sessionId);
      case "POOL_SHOT":
        return this.poolShot(sessionId, packet);
      case "POOL_SETTLE":
        return this.poolSettle(sessionId, packet);
      case "PIANO_RECITAL":
        return this.pianoRecital(sessionId, p, packet.piece);
      case "PIANO_STOP":
        return this.pianoStop(sessionId);
      case "PIANO_NOTE":
        return this.pianoNote(sessionId, p, packet.midi);
    }
  }

  // --- comings and goings ---------------------------------------------------------------------

  /** A player leaving the room: their bets on the wheel, a blackjack bet, a baccarat stake or a Big
   *  Six stake put down before the deal or the spin, and a ticket bought before the off come back to
   *  them; a derby win already decided is paid; hands in play are stood and settled without them, a
   *  Hold'em hand in play is folded (what is left of the stack comes back) and a pass line on its
   *  point is forfeit, as at any table (the room saves them straight after). */
  release(sessionId: string) {
    this.refundBets(sessionId);
    const p = this.state.players.get(sessionId);
    for (const t of this.tables) {
      const s = t.seats.find((q) => q.sessionId === sessionId);
      if (!s) continue;
      if (t.phase === "betting") {
        if (p) this.addChips(p, s.bet);
        t.seats = t.seats.filter((q) => q !== s);
      } else {
        for (const h of s.hands) if (h.status === "playing") h.status = "stood";
        if (t.phase === "playing" && this.bjAllDone(t)) this.bjFinish(t);
      }
      this.bjSend(t);
    }
    for (const b of Object.values(this.baccs)) {
      if (b.phase !== "betting") continue;
      const mine = b.stakes.filter((s) => s.sessionId === sessionId);
      if (!mine.length) continue;
      if (p) this.addChips(p, mine.reduce((a, s) => a + s.amount, 0));
      b.stakes = b.stakes.filter((s) => s.sessionId !== sessionId);
      this.host.broadcast("baccaratState", this.baccState(b));
    }
    if (this.six.phase === "betting") {
      const mine = this.six.stakes.filter((s) => s.sessionId === sessionId);
      if (mine.length) {
        if (p) this.addChips(p, mine.reduce((a, s) => a + s.amount, 0));
        this.six.stakes = this.six.stakes.filter((s) => s.sessionId !== sessionId);
        this.host.broadcast("bigSixState", this.sixState());
      }
    }
    this.holdemFold(sessionId);
    this.holdemButton.delete(sessionId);
    this.crapsGames.delete(sessionId);
    const d = this.derby;
    if (d.phase === "betting") {
      for (const t of d.tickets.filter((t) => t.sessionId === sessionId)) if (p) this.addChips(p, t.amount);
      d.tickets = d.tickets.filter((t) => t.sessionId !== sessionId);
    }
    const owed = this.derbyOwed.get(sessionId);
    if (owed && p) this.addChips(p, owed);
    this.derbyOwed.delete(sessionId);
    this.pusherTokens.delete(sessionId);
    this.pusherWatch.delete(sessionId);
    this.pusherBurst.delete(sessionId);
    for (const id of SINGLE_MACHINES) if (this.state.machines.get(id) === sessionId) this.state.machines.set(id, "");
    this.poolLeave(sessionId);
    this.pianoStop(sessionId);
    this.noteBucket.delete(sessionId);
    for (const key of this.lastUse.keys()) if (key.startsWith(`${sessionId}:`)) this.lastUse.delete(key);
  }

  /** A player off the casino's floors (to another world, or from the hall to the penthouse and
   *  back): every stake they have open comes back, in chips, and they are off every table. */
  leaveFloor(sessionId: string) {
    const p = this.state.players.get(sessionId);
    if (!p) return;
    const dice = this.crapsGames.get(sessionId);
    if (dice?.pass) this.addChips(p, dice.pass);
    for (const t of this.tables) {
      const s = t.seats.find((q) => q.sessionId === sessionId);
      if (!s) continue;
      this.addChips(p, s.bet + (t.phase === "playing" ? s.hands.reduce((a, h) => a + h.bet, 0) : 0));
      t.seats = t.seats.filter((q) => q !== s);
      this.bjSend(t);
    }
    for (const b of Object.values(this.baccs)) {
      if (b.phase !== "settled") this.addChips(p, b.stakes.filter((s) => s.sessionId === sessionId).reduce((a, s) => a + s.amount, 0));
      b.stakes = b.stakes.filter((s) => s.sessionId !== sessionId);
    }
    if (this.six.phase !== "settled") this.addChips(p, this.six.stakes.filter((s) => s.sessionId === sessionId).reduce((a, s) => a + s.amount, 0));
    this.six.stakes = this.six.stakes.filter((s) => s.sessionId !== sessionId);
    this.crapsGames.delete(sessionId);
    // a pinball game left on the floor is over where it stands (nothing more to pay without its end)
    this.pinballs.delete(sessionId);
    this.release(sessionId);
  }

  closeTables() {
    this.state.players.forEach((_p, sessionId) => this.leaveFloor(sessionId));
    // (release has handed every ticket bought before the off back, and paid every race won)
    this.state.bets.clear();
    this.holdem.clear();
    this.crapsGames.clear();
    this.derbyOwed.clear();
    this.derby = { phase: "idle", clock: 0, raceId: this.derby.raceId, winner: -1, seed: 0, tickets: [], paid: [] };
    for (const t of this.tables) Object.assign(t, { phase: "betting", clock: 0, dealer: [], seats: [] });
    for (const b of Object.values(this.baccs)) Object.assign(b, { phase: "betting", clock: 0, stakes: [], player: [], banker: [], winner: "", paid: [] });
    this.six = { ...this.six, phase: "betting", clock: 0, stakes: [], paid: [] };
    this.pool = emptyPoolMatch();
    this.recital = null;
    for (const id of SINGLE_MACHINES) this.state.machines.set(id, "");
    this.reserved.clear();
    this.setPhase("betting");
  }

  /** The same player back on a new session (their old connection's token was lost): their bets,
   *  hands, tickets, free drops and machine move with them, so nothing staked is lost with the old
   *  session. */
  transfer(fromId: string, toId: string) {
    const raw = this.state.bets.get(fromId);
    if (raw !== undefined) {
      this.state.bets.delete(fromId);
      this.state.bets.set(toId, raw);
    }
    const move = <T>(map: Map<string, T>) => {
      const v = map.get(fromId);
      if (v === undefined) return;
      map.delete(fromId);
      map.set(toId, v);
    };
    move(this.holdem);
    move(this.holdemButton);
    move(this.crapsGames);
    move(this.derbyOwed);
    move(this.pusherTokens);
    move(this.pusherWatch);
    move(this.pusherBurst);
    for (const credit of this.pusherCredit.values()) if (credit.sessionId === fromId) credit.sessionId = toId;
    for (const t of this.tables) for (const s of t.seats) if (s.sessionId === fromId) s.sessionId = toId;
    for (const b of Object.values(this.baccs)) for (const s of b.stakes) if (s.sessionId === fromId) s.sessionId = toId;
    for (const s of this.six.stakes) if (s.sessionId === fromId) s.sessionId = toId;
    for (const t of this.derby.tickets) if (t.sessionId === fromId) t.sessionId = toId;
    for (const q of this.pool.players) if (q.sessionId === fromId) q.sessionId = toId;
    for (const id of SINGLE_MACHINES) if (this.state.machines.get(id) === fromId) this.state.machines.set(id, toId);
    if (this.recital?.sessionId === fromId) this.recital.sessionId = toId;
  }
}
