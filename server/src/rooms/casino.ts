import { Schema, type, type MapSchema } from "@colyseus/schema";
import {
  BAR_SNACK,
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
  FORTUNE_LUCKY_CHIPS,
  MARQUEE_MIN_WIN,
  MAX_BET_TOTAL,
  PIANO_HIGH,
  PIANO_LOW,
  PUSHER_OUTCOMES,
  ROULETTE_PHASE_SECONDS,
  SLOT_PAIR,
  SLOT_SYMBOLS,
  SLOT_TRIPLE,
  TABLE_LIMITS,
  VIP_PASS_TITLE,
  VIP_SLOT_ID,
  ZARA_FORTUNES,
  betReturn,
  blackjackTotal,
  capsuleUnlock,
  crapsReturn,
  drinkAura,
  encodeBets,
  exchangeAmount,
  fortuneFor,
  isBetKind,
  isCasinoDrink,
  isCasinoTitle,
  parseBets,
  pocketColor,
  pokerHand,
  pokerSettle,
  pusherAccuracy,
  rollCapsule,
  rollDerby,
  rollPusher,
  rouletteLimit,
  slotLimit,
  tableStake,
  vipWelcome,
  type BlackjackAction,
  type BlackjackOutcome,
  type BlackjackPhase,
  type BlackjackResult,
  type BlackjackView,
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
  type PokerMove,
  type PokerOutcome,
  type PokerPhase,
  type PokerView,
  type PusherResult,
  type RoulettePhase,
} from "../../../shared/casino";
import { PIANO_PIECES, isPianoPiece } from "../../../shared/pianoPieces";
import {
  BAR_REACH,
  CASHIER_FRONT,
  CASHIER_REACH,
  CASINO_PROPS,
  GACHAPON_FRONT,
  GAZETTE_REACH,
  MACHINE_REACH,
  PIANO_REACH,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  TIP_JARS,
  VIP_INSIDE,
  VIP_OUTSIDE,
  ZARA_FRONT,
  barDistance,
  blackjackTableNear,
  inVipRoom,
  nearGameTable,
  type BlackjackTier,
  type CasinoGameTable,
  type TipDealer,
} from "../../../shared/worlds/casino";
import { COIN_CAP, INTERACT_RADIUS } from "../../../shared/types";
import { todayKey } from "./games";

// The Velvet Casino's tables: the shared roulette wheel, one blackjack hand per player, the slot
// machines (the VIP room's too), Boris's Three-Card Poker, your own dice at the craps table, the
// Mechanical Turf Club's one race for the room, the coin pusher, and Mr. Vance's cage, where coins
// become Velvet Chips and back. Every stake and every payout is in chips, every stake within its
// table's limits (shared/casino TABLE_LIMITS). The room owns the synced state (the wheel and the
// bets on it live in its schema) and the side effects (messages, timers, stats); this owns the
// rules, the money and the hands, the way BoardTable owns a board game.
//
// And the house's extras: the baby grand's recitals and the notes played on it, the billiards'
// break, Madame Zara's daily fortune, the capsule machine's titles and emotes, the dealers' tip jars,
// Pippin's bar (and his free pretzels), the VIP room's doors, and the Big-Win marquee's news (a win
// worth shouting about, and whether the hall celebrates it).

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
 *  wear (a capsule title) and drink (an aura). */
export interface Patron {
  userId: string;
  username: string;
  x: number;
  z: number;
  coins: number;
  chips: number;
  sitting: boolean;
  title: string;
  aura: string;
}

/** The room state the casino reads and writes. */
export interface CasinoState {
  currentMap: string;
  roulette: RouletteSchema;
  /** Roulette bets on the table this round, per sessionId, as encodeBets() strings. */
  bets: MapSchema<string>;
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
  broadcast(type: string, payload: unknown): void;
  /** To everyone but the one who did it (a note they already heard). */
  broadcastExcept(sessionId: string, type: string, payload: unknown): void;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  /** Moves a standing player (through the VIP room's doors): their client snaps to it. */
  teleport(sessionId: string, x: number, z: number): void;
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

// --- blackjack: one hand per player, dealt and settled entirely here ---
interface BlackjackGame {
  deck: Card[];
  player: Card[];
  dealer: Card[];
  bet: number;
  phase: BlackjackPhase;
  outcome: BlackjackOutcome;
  payout: number;
  table: BlackjackTier;
  tableId: string;
}
// --- Three-Card Poker: one hand per player, against Boris ---
interface PokerGame {
  player: Card[];
  dealer: Card[];
  ante: number;
  play: number;
  phase: PokerPhase;
  outcome: PokerOutcome;
  payout: number;
  bonus: number;
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
function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
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

/** How much further than the client's reach the server allows, for lag. */
const ROULETTE_SLACK = 0.6;
const BLACKJACK_SLACK = 0.8;
const SLOT_SLACK = 0.8;
const CASHIER_SLACK = 0.6;
const EXTRA_SLACK = 0.6;
const GAME_SLACK = 0.8;
/** The reels spin for ~1.6 s on screen; a win is paid when they land. */
const SLOT_LAND_MS = 1700;
/** How often one player may roll the dice, drop a coin, break the rack, try the VIP doors, tip, ask
 *  Zara or take a pretzel (a click storm is not a storm of broadcasts). */
const COOLDOWN_MS: Record<string, number> = { craps: 1500, pusher: 900, billiards: 2500, vipdoor: 1500, tipjar: 1200, fortune: 2500, snack: BAR_SNACK.cooldownMs };
/** Notes played on the baby grand: a bucket of 16, refilled at 12 a second. */
const NOTE_BURST = 16;
const NOTES_PER_SECOND = 12;
const PIANO_KEYS = CASINO_PROPS.find((p) => p.propId === "piano_keys")!;

export class CasinoFloor {
  private phaseClock = ROULETTE_PHASE_SECONDS.betting;
  private readonly hands = new Map<string, BlackjackGame>();
  private readonly pokerHands = new Map<string, PokerGame>();
  private readonly crapsGames = new Map<string, CrapsGame>();
  /** Each player's last use of each prop kind (the cooldowns above). */
  private readonly lastUse = new Map<string, number>();
  /** The Turf Club's one race: its window, the tickets on it, and (once they're off) what the
   *  winning tickets are owed at the finish line. */
  private derby: { phase: DerbyPhase; clock: number; raceId: number; winner: number; seed: number; tickets: DerbyTicket[]; paid: DerbyState["paid"] } = { phase: "idle", clock: 0, raceId: 0, winner: -1, seed: 0, tickets: [], paid: [] };
  private readonly derbyOwed = new Map<string, number>();
  /** Free drops at the coin pusher (their stakes), per player. */
  private readonly pusherTokens = new Map<string, number[]>();
  /** The baby grand's recital (one at a time), and each pianist's note bucket. */
  private recital: { sessionId: string; until: number } | null = null;
  private readonly noteBucket = new Map<string, { level: number; at: number }>();
  /** The players Bruno has let into the VIP room. */
  private readonly vipGuests = new Set<string>();

  constructor(
    private readonly state: CasinoState,
    private readonly host: CasinoHost
  ) {}

  private get open() {
    return this.state.currentMap === "velvet_casino";
  }

  private addChips(p: Patron, amount: number) {
    p.chips = Math.max(0, Math.min(CHIP_CAP, p.chips + amount));
  }

  /** A win for the marquee (big enough), and the hall's celebration (a jackpot, a number hit). */
  private announce(sessionId: string, p: Patron, amount: number, game: CasinoGame, detail: string, celebrate: boolean) {
    if (!celebrate && amount < MARQUEE_MIN_WIN) return;
    this.host.broadcast("casinoWin", { sessionId, username: p.username, amount, game, detail, celebrate } satisfies CasinoWin);
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
    if (!p || !this.open) return undefined;
    if (!nearGameTable(game, p.x, p.z, GAME_SLACK)) {
      this.refuse(sessionId, "far");
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
    if (!this.open || Math.hypot(p.x - CASHIER_FRONT.x, p.z - CASHIER_FRONT.z) > CASHIER_REACH + CASHIER_SLACK) return reply(false, 0, "far");
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

  // --- roulette -------------------------------------------------------------------------------

  /** Runs the wheel's loop and the Turf Club's race (the room calls this every tick while the
   *  casino is the map). */
  tick(dt: number) {
    this.tickDerby(dt);
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
    if (!this.open || this.state.roulette.phase !== "betting") return;
    const p = this.state.players.get(sessionId);
    if (!p || !isBetKind(msg?.kind)) return;
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

  // --- slots ----------------------------------------------------------------------------------

  /** One pull of a machine you stand at: the stake (within the machine's limits; the VIP room's is
   *  the high-stakes one, played only by Bruno's guests) goes in, the reels are broadcast, and a
   *  win is paid when they land. */
  spinSlot(sessionId: string, prop: SlotProp | undefined, bet: number) {
    const p = this.state.players.get(sessionId);
    if (!p || !prop || prop.kind !== "slot" || !this.open) return;
    if (prop.propId === VIP_SLOT_ID && !(this.vipGuests.has(sessionId) && inVipRoom(p.x, p.z))) return this.refuse(sessionId, "far");
    if (tableStake(bet, slotLimit(prop.propId)) === null) return this.refuse(sessionId, "limits");
    if (p.chips < bet) return this.refuse(sessionId, "chips");
    if (Math.hypot(p.x - prop.x, p.z - prop.z) > INTERACT_RADIUS + SLOT_SLACK) return;
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

  // --- blackjack ------------------------------------------------------------------------------

  private view(game: BlackjackGame): BlackjackView {
    const holeHidden = game.phase === "player";
    const dealerShown = holeHidden ? game.dealer.slice(0, 1) : game.dealer;
    return {
      phase: game.phase,
      bet: game.bet,
      player: game.player,
      dealer: dealerShown,
      holeHidden,
      playerTotal: blackjackTotal(game.player),
      dealerTotal: blackjackTotal(dealerShown),
      outcome: game.outcome,
      payout: game.payout,
      canDouble: game.phase === "player" && game.player.length === 2,
      table: game.table,
    };
  }

  /** A hand at the table you stand (or sit) at, within its limits: Table 1 casual, Table 2 high
   *  stakes. */
  blackjack(sessionId: string, msg: { action: BlackjackAction; bet?: number }) {
    const p = this.state.players.get(sessionId);
    if (!p || !this.open) return;
    const table = blackjackTableNear(p.x, p.z, BLACKJACK_SLACK);
    if (!table) return;
    const action = msg?.action;
    let game = this.hands.get(sessionId);

    if (action === "deal") {
      if (game && (game.phase === "player" || game.phase === "dealer")) return; // hand in progress
      const bet = tableStake(msg.bet, TABLE_LIMITS[table.tier]);
      if (bet === null) return this.refuse(sessionId, "limits");
      if (p.chips < bet) return this.refuse(sessionId, "chips");
      p.chips -= bet;
      const deck = freshDeck();
      game = { deck, player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], bet, phase: "player", outcome: "", payout: 0, table: table.tier, tableId: table.id };
      this.hands.set(sessionId, game);
      const natural = blackjackTotal(game.player) === 21;
      const dealerNatural = blackjackTotal(game.dealer) === 21;
      if (natural || dealerNatural) this.settle(sessionId, p, game, natural && !dealerNatural ? "blackjack" : natural ? "push" : "lose");
    } else if (!game || game.phase !== "player") {
      return;
    } else if (action === "hit") {
      game.player.push(game.deck.pop()!);
      const total = blackjackTotal(game.player);
      if (total > 21) this.settle(sessionId, p, game, "bust");
      else if (total === 21) this.dealerPlays(sessionId, p, game);
    } else if (action === "double") {
      if (game.player.length !== 2) return;
      if (p.chips < game.bet) return this.refuse(sessionId, "chips");
      p.chips -= game.bet;
      game.bet *= 2;
      game.player.push(game.deck.pop()!);
      if (blackjackTotal(game.player) > 21) this.settle(sessionId, p, game, "bust");
      else this.dealerPlays(sessionId, p, game);
    } else if (action === "stand") {
      this.dealerPlays(sessionId, p, game);
    } else {
      return;
    }
    this.host.sendTo(sessionId, "blackjackState", this.view(this.hands.get(sessionId)!));
  }

  /** Dealer draws to 17 (hits 16 and below, stands on any 17), then the hand is compared. */
  private dealerPlays(sessionId: string, p: Patron, game: BlackjackGame) {
    game.phase = "dealer";
    while (blackjackTotal(game.dealer) < 17) game.dealer.push(game.deck.pop()!);
    const mine = blackjackTotal(game.player);
    const theirs = blackjackTotal(game.dealer);
    this.settle(sessionId, p, game, theirs > 21 || mine > theirs ? "win" : mine === theirs ? "push" : "lose");
  }

  private settle(sessionId: string, p: Patron, game: BlackjackGame, outcome: BlackjackOutcome) {
    game.phase = "done";
    game.outcome = outcome;
    game.payout = outcome === "blackjack" ? Math.floor(game.bet * 2.5) : outcome === "win" ? game.bet * 2 : outcome === "push" ? game.bet : 0;
    if (game.payout > 0) this.addChips(p, game.payout);
    // Cedric sees every hand settled (and knocks the felt for a natural)
    this.host.broadcast("blackjackResult", { sessionId, tableId: game.tableId, outcome } satisfies BlackjackResult);
    if (outcome === "win" || outcome === "blackjack") {
      this.host.tally(sessionId, "blackjack_win");
      this.host.broadcast("emote", { sessionId, emoji: outcome === "blackjack" ? "💰" : CHIP_EMOTE });
      this.announce(sessionId, p, game.payout, "blackjack", outcome === "blackjack" ? "Blackjack!" : `${blackjackTotal(game.player)} beats the dealer`, false);
    }
  }

  /** An unfinished hand is abandoned: its stake comes back. */
  private abandonHand(sessionId: string) {
    const game = this.hands.get(sessionId);
    const p = this.state.players.get(sessionId);
    if (game && game.phase === "player" && p) this.addChips(p, game.bet);
    this.hands.delete(sessionId);
  }

  // --- Three-Card Poker ------------------------------------------------------------------------

  private pokerView(game: PokerGame): PokerView {
    const done = game.phase === "done";
    const dealer = done ? pokerHand(game.dealer) : null;
    return {
      phase: game.phase,
      ante: game.ante,
      play: game.play,
      player: game.player,
      dealer: done ? game.dealer : [],
      playerHand: game.player.length ? pokerHand(game.player).name : "",
      dealerHand: dealer?.name ?? "",
      qualifies: !!dealer && (dealer.rank > 0 || dealer.values[0] >= 12),
      outcome: game.outcome,
      payout: game.payout,
      bonus: game.bonus,
    };
  }

  /** A hand against Boris: deal (the ante goes down, and you must hold as much again for the Play
   *  bet), then play or fold. */
  poker(sessionId: string, move: PokerMove) {
    const p = this.atTable(sessionId, "poker");
    if (!p || !move || typeof move !== "object") return;
    let game = this.pokerHands.get(sessionId);
    if (move.action === "deal") {
      if (game?.phase === "decide") return this.refuse(sessionId, "busy");
      const ante = tableStake(move.ante, TABLE_LIMITS.poker);
      if (ante === null) return this.refuse(sessionId, "limits");
      if (p.chips < ante * 2) return this.refuse(sessionId, "chips");
      p.chips -= ante;
      const deck = freshDeck();
      game = { player: [deck.pop()!, deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!, deck.pop()!], ante, play: 0, phase: "decide", outcome: "", payout: 0, bonus: 0 };
      this.pokerHands.set(sessionId, game);
    } else if (!game || game.phase !== "decide") {
      return;
    } else if (move.action === "fold") {
      game.phase = "done";
      game.outcome = "fold";
      this.host.broadcast("pokerResult", { sessionId, outcome: "fold", hand: pokerHand(game.player).name });
    } else if (move.action === "play") {
      if (p.chips < game.ante) return this.refuse(sessionId, "chips");
      p.chips -= game.ante;
      game.play = game.ante;
      const mine = pokerHand(game.player);
      const settled = pokerSettle(game.ante, mine, pokerHand(game.dealer));
      game.phase = "done";
      game.outcome = settled.outcome;
      game.payout = settled.payout;
      game.bonus = settled.bonus;
      if (settled.payout > 0) this.addChips(p, settled.payout);
      this.host.broadcast("pokerResult", { sessionId, outcome: settled.outcome, hand: mine.name });
      const profit = settled.payout - game.ante * 2;
      if (profit > 0) {
        this.host.broadcast("emote", { sessionId, emoji: mine.rank >= 4 ? "💰" : CHIP_EMOTE });
        this.announce(sessionId, p, settled.payout, "poker", mine.rank >= 3 ? `${mine.name} vs Boris` : "beats Boris", mine.rank >= 4);
      }
    } else {
      return;
    }
    this.host.sendTo(sessionId, "pokerState", this.pokerView(game));
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

  // --- the coin pusher --------------------------------------------------------------------------

  /** A coin dropped where the dropper was (`pos`, 0 to 1): a free drop if one is held, else the
   *  stake within the pusher's limits. What it pushes over the edge is rolled on its accuracy. */
  pusherDrop(sessionId: string, stake: unknown, pos: unknown) {
    const p = this.atTable(sessionId, "pusher");
    if (!p) return;
    if (!this.ready(sessionId, "pusher")) return;
    const tokens = this.pusherTokens.get(sessionId) ?? [];
    let s: number;
    const free = tokens.length > 0;
    if (free) s = tokens.shift()!;
    else {
      const n = tableStake(stake, TABLE_LIMITS.pusher);
      if (n === null) return this.refuse(sessionId, "limits");
      if (p.chips < n) return this.refuse(sessionId, "chips");
      s = n;
      p.chips -= s;
    }
    const at = Math.max(0, Math.min(1, Number(pos) || 0));
    const outcome = PUSHER_OUTCOMES[rollPusher(pusherAccuracy(at), Math.random())];
    const payout = s * outcome.mult;
    if (outcome.id === "token") tokens.push(s);
    this.pusherTokens.set(sessionId, tokens);
    if (payout > 0) this.addChips(p, payout);
    this.host.sendTo(sessionId, "pusherResult", { stake: s, pos: at, outcome: outcome.id, payout, free, tokens, chips: p.chips } satisfies PusherResult);
    this.host.broadcast("casinoProp", { kind: "pusher", propId: "coin_pusher", sessionId, seed: seed() } satisfies CasinoPropEvent);
    if (outcome.id === "avalanche") this.announce(sessionId, p, payout, "pusher", "an avalanche of chips", true);
  }

  // --- the baby grand ---------------------------------------------------------------------------

  private atPiano(p: Patron) {
    return near(p, PIANO_KEYS, PIANO_REACH + EXTRA_SLACK);
  }

  private pianoRecital(sessionId: string, p: Patron, piece: unknown) {
    if (!this.atPiano(p) || !isPianoPiece(piece)) return;
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
    if (!Number.isInteger(n) || n < PIANO_LOW || n > PIANO_HIGH || !this.atPiano(p)) return;
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
    if (!p || !this.open) return;
    const event = (kind: CasinoPropEvent["kind"], extra: Partial<CasinoPropEvent> = {}) => ({ kind, propId: prop.propId, sessionId, seed: seed(), ...extra }) satisfies CasinoPropEvent;
    const panel = (kind: string) => this.host.sendTo(sessionId, "openPanel", { kind, propId: prop.propId });
    switch (prop.kind) {
      // the game tables: walking up to one opens its panel (nothing ever opens by itself)
      case "roulette":
        panel("roulette");
        break;
      case "blackjack":
        if (blackjackTableNear(p.x, p.z, BLACKJACK_SLACK)) panel("blackjack");
        break;
      case "poker":
        if (nearGameTable("poker", p.x, p.z, GAME_SLACK)) panel("poker");
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
      case "pusher":
        if (nearGameTable("pusher", p.x, p.z, GAME_SLACK)) panel("pusher");
        break;
      case "billiards":
        if (nearGameTable("billiards", p.x, p.z, GAME_SLACK)) panel("pool");
        break;
      case "piano":
        if (this.atPiano(p)) panel("piano");
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

  /** The VIP room's doors: Bruno lets a welcome player in (and anyone back out); the rest he turns
   *  away with a word only they hear. */
  private vipDoor(sessionId: string, p: Patron, leaving: boolean, event: (kind: CasinoPropEvent["kind"], extra?: Partial<CasinoPropEvent>) => CasinoPropEvent) {
    if (p.sitting || !this.ready(sessionId, "vipdoor")) return;
    if (leaving || inVipRoom(p.x, p.z)) {
      this.vipGuests.delete(sessionId);
      this.host.teleport(sessionId, VIP_OUTSIDE.x, VIP_OUTSIDE.z);
      this.host.broadcast("casinoProp", event("vipdoor", { vip: "out" }));
      return;
    }
    if (!near(p, VIP_OUTSIDE, MACHINE_REACH + EXTRA_SLACK)) return this.refuse(sessionId, "far");
    if (!vipWelcome(p.chips, this.host.owns(sessionId, capsuleUnlock({ kind: "title", id: VIP_PASS_TITLE })))) {
      this.host.sendTo(sessionId, "casinoProp", event("vipdoor", { vip: "refused" }));
      return;
    }
    this.vipGuests.add(sessionId);
    this.host.teleport(sessionId, VIP_INSIDE.x, VIP_INSIDE.z);
    this.host.broadcast("casinoProp", event("vipdoor", { vip: "in" }));
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

  /** The capsule machine, Pippin's bar, the title you wear, and the games played from a panel. */
  packet(sessionId: string, packet: CasinoPacket) {
    const p = this.state.players.get(sessionId);
    if (!p || !packet || typeof packet !== "object") return;
    if (packet.type === "EQUIP_TITLE") {
      // a title is worn everywhere, once won: "" takes it off
      const id = String(packet.id ?? "");
      if (id === "") p.title = "";
      else if (isCasinoTitle(id) && this.host.owns(sessionId, capsuleUnlock({ kind: "title", id }))) p.title = id;
      else return;
      this.host.persistNow(sessionId);
      return;
    }
    if (!this.open) return;
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
      case "POKER":
        return this.poker(sessionId, packet.move);
      case "CRAPS_ROLL":
        return this.craps(sessionId, packet.stakes);
      case "DERBY_BET":
        return this.derbyBet(sessionId, packet.horse, packet.amount);
      case "PUSHER_DROP":
        return this.pusherDrop(sessionId, packet.stake, packet.pos);
      case "POOL_BREAK":
        if (nearGameTable("billiards", p.x, p.z, GAME_SLACK) && this.ready(sessionId, "billiards")) this.host.broadcast("casinoProp", { kind: "billiards", propId: "billiards_table", sessionId, seed: seed() } satisfies CasinoPropEvent);
        return;
      case "PIANO_RECITAL":
        return this.pianoRecital(sessionId, p, packet.piece);
      case "PIANO_STOP":
        return this.pianoStop(sessionId);
      case "PIANO_NOTE":
        return this.pianoNote(sessionId, p, packet.midi);
    }
  }

  // --- comings and goings ---------------------------------------------------------------------

  /** A player leaving the room: their bets on the wheel, an unfinished blackjack hand and a ticket
   *  bought before the off come back to them; a derby win already decided is paid; a poker hand in
   *  play is folded and a pass line on its point is forfeit, as at any table (the room saves them
   *  straight after). */
  release(sessionId: string) {
    this.refundBets(sessionId);
    this.abandonHand(sessionId);
    this.pokerHands.delete(sessionId);
    this.crapsGames.delete(sessionId);
    const p = this.state.players.get(sessionId);
    const d = this.derby;
    if (d.phase === "betting") {
      for (const t of d.tickets.filter((t) => t.sessionId === sessionId)) if (p) this.addChips(p, t.amount);
      d.tickets = d.tickets.filter((t) => t.sessionId !== sessionId);
    }
    const owed = this.derbyOwed.get(sessionId);
    if (owed && p) this.addChips(p, owed);
    this.derbyOwed.delete(sessionId);
    this.pusherTokens.delete(sessionId);
    this.pianoStop(sessionId);
    this.noteBucket.delete(sessionId);
    this.vipGuests.delete(sessionId);
    for (const key of this.lastUse.keys()) if (key.startsWith(`${sessionId}:`)) this.lastUse.delete(key);
  }

  /** The room moving to another map: every stake still in play is handed back (a poker ante, a
   *  pass line, a ticket before the off; a race already run is paid), and the tables wait for the
   *  casino to open again. */
  closeTables() {
    this.state.players.forEach((p, sessionId) => {
      const poker = this.pokerHands.get(sessionId);
      if (poker?.phase === "decide") this.addChips(p, poker.ante);
      const dice = this.crapsGames.get(sessionId);
      if (dice?.pass) this.addChips(p, dice.pass);
      this.pokerHands.delete(sessionId);
      this.crapsGames.delete(sessionId);
      this.release(sessionId);
    });
    // (release has handed every ticket bought before the off back, and paid every race won)
    this.state.bets.clear();
    this.hands.clear();
    this.pokerHands.clear();
    this.crapsGames.clear();
    this.derbyOwed.clear();
    this.derby = { phase: "idle", clock: 0, raceId: this.derby.raceId, winner: -1, seed: 0, tickets: [], paid: [] };
    this.recital = null;
    this.vipGuests.clear();
    this.setPhase("betting");
  }

  /** The same player back on a new session (their old connection's token was lost): their bets,
   *  hands, tickets, free drops and VIP welcome move with them, so nothing staked is lost with the
   *  old session. */
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
    move(this.hands);
    move(this.pokerHands);
    move(this.crapsGames);
    move(this.derbyOwed);
    move(this.pusherTokens);
    for (const t of this.derby.tickets) if (t.sessionId === fromId) t.sessionId = toId;
    if (this.recital?.sessionId === fromId) this.recital.sessionId = toId;
    if (this.vipGuests.delete(fromId)) this.vipGuests.add(toId);
  }
}
