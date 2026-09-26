import { Schema, type, type MapSchema } from "@colyseus/schema";
import {
  BLACKJACK_BETS,
  CHIP_CAP,
  CHIP_VALUES,
  MAX_BET_TOTAL,
  ROULETTE_PHASE_SECONDS,
  SLOT_BETS,
  SLOT_PAIR,
  SLOT_SYMBOLS,
  SLOT_TRIPLE,
  betReturn,
  blackjackTotal,
  encodeBets,
  exchangeAmount,
  isBetKind,
  parseBets,
  type BlackjackAction,
  type BlackjackCard,
  type BlackjackOutcome,
  type BlackjackPhase,
  type BlackjackView,
  type CashierResult,
  type RoulettePhase,
} from "../../../shared/casino";
import { CASHIER_FRONT, CASHIER_REACH, ROULETTE_BET_RADIUS, ROULETTE_CENTER, blackjackTableNear } from "../../../shared/worlds/casino";
import { COIN_CAP, INTERACT_RADIUS } from "../../../shared/types";

// The Velvet Casino's tables: the shared roulette wheel, one blackjack hand per player, the slot
// machines, and Mr. Vance's cage, where coins become Velvet Chips and back. Every stake and every
// payout is in chips. The room owns the synced state (the wheel and the bets on it live in its
// schema) and the side effects (messages, timers, stats); this owns the rules, the money and the
// hands, the way BoardTable owns a board game.

// The shared roulette wheel. One loop for the whole room: 25 s of betting, a 6 s spin everyone
// watches together, then 4 s of payouts. Only the phase, a whole-second countdown and the result
// are synced; the wheel's motion is animated client-side from spinId + result.
export class RouletteSchema extends Schema {
  @type("string") phase: RoulettePhase = "betting";
  @type("number") timeLeft = ROULETTE_PHASE_SECONDS.betting;
  @type("number") result = -1;
  @type("number") spinId = 0;
}

/** What the casino needs of a player: where they stand, and their two balances. */
export interface Patron {
  username: string;
  x: number;
  z: number;
  coins: number;
  chips: number;
}

/** The room state the casino reads and writes. */
export interface CasinoState {
  currentMap: string;
  roulette: RouletteSchema;
  /** Roulette bets on the table this round, per sessionId, as encodeBets() strings. */
  bets: MapSchema<string>;
  players: { get(sessionId: string): Patron | undefined; forEach(fn: (p: Patron, sessionId: string) => void): void };
}

/** A slot machine, as the room's props hold it. */
export interface SlotProp {
  propId: string;
  kind: string;
  x: number;
  z: number;
}

/** What the casino asks of the room. */
export interface CasinoHost {
  broadcast(type: string, payload: unknown): void;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  /** Runs `fn` after `ms` on the room's clock. */
  later(ms: number, fn: () => void): void;
  /** Counts a spin or a win toward the player's stats and today's checklist. */
  tally(sessionId: string, event: "slots_spin" | "roulette_win" | "blackjack_win"): void;
  /** Saves the player at once (an exchange moves money between two balances). */
  persistNow(sessionId: string): void;
}

// --- blackjack: one hand per player, dealt and settled entirely here ---
interface BlackjackGame {
  deck: BlackjackCard[];
  player: BlackjackCard[];
  dealer: BlackjackCard[];
  bet: number;
  phase: BlackjackPhase;
  outcome: BlackjackOutcome;
  payout: number;
}
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];
function freshDeck(): BlackjackCard[] {
  const deck: BlackjackCard[] = [];
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

/** How much further than the client's reach the server allows, for lag. */
const ROULETTE_SLACK = 0.6;
const BLACKJACK_SLACK = 0.8;
const SLOT_SLACK = 0.8;
const CASHIER_SLACK = 0.6;
/** The reels spin for ~1.6 s on screen; a win is paid when they land. */
const SLOT_LAND_MS = 1700;

export class CasinoFloor {
  private phaseClock = ROULETTE_PHASE_SECONDS.betting;
  private readonly hands = new Map<string, BlackjackGame>();

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
    this.host.broadcast("emote", { sessionId, emoji: kind === "buy" ? "🟡" : "🪙" });
    reply(true, amount);
  }

  // --- roulette -------------------------------------------------------------------------------

  /** Runs the wheel's loop (the room calls this every tick while the casino is the map). */
  tick(dt: number) {
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
      let won = 0;
      for (const [kind, amount] of Object.entries(parseBets(raw))) won += betReturn(kind, amount, result);
      if (won > 0) {
        this.addChips(p, won);
        this.host.tally(sessionId, "roulette_win");
        winners.push({ sessionId, username: p.username, amount: won });
        this.host.broadcast("emote", { sessionId, emoji: won >= 100 ? "💰" : "🟡" });
      }
    });
    this.host.broadcast("rouletteResult", { result, winners });
  }

  placeBet(sessionId: string, msg: { kind: string; amount: number }) {
    if (!this.open || this.state.roulette.phase !== "betting") return;
    const p = this.state.players.get(sessionId);
    if (!p || !isBetKind(msg?.kind)) return;
    const amount = Number(msg.amount);
    if (!(CHIP_VALUES as readonly number[]).includes(amount)) return;
    if (Math.hypot(p.x - ROULETTE_CENTER.x, p.z - ROULETTE_CENTER.z) > ROULETTE_BET_RADIUS + ROULETTE_SLACK) return;
    if (p.chips < amount) return;
    const bets = parseBets(this.state.bets.get(sessionId) ?? "");
    if (sum(bets) + amount > MAX_BET_TOTAL) return;
    bets[msg.kind] = (bets[msg.kind] ?? 0) + amount;
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

  /** One pull of a machine you stand at: the stake (5, 10 or 25 chips) goes in, the reels are
   *  broadcast, and a win is paid when they land. */
  spinSlot(sessionId: string, prop: SlotProp | undefined, bet: number) {
    const p = this.state.players.get(sessionId);
    if (!p || !prop || prop.kind !== "slot" || !this.open) return;
    if (!(SLOT_BETS as readonly number[]).includes(bet) || p.chips < bet) return;
    if (Math.hypot(p.x - prop.x, p.z - prop.z) > INTERACT_RADIUS + SLOT_SLACK) return;
    p.chips -= bet;
    this.host.tally(sessionId, "slots_spin");
    const reels: [number, number, number] = [rollSymbol(), rollSymbol(), rollSymbol()];
    let win = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) win = bet * SLOT_TRIPLE[reels[0]];
    else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) win = bet * SLOT_PAIR;
    this.host.broadcast("slotSpin", { propId: prop.propId, sessionId, reels, win, bet });
    if (win > 0) {
      this.host.later(SLOT_LAND_MS, () => {
        const now = this.state.players.get(sessionId);
        if (!now) return;
        this.addChips(now, win);
        // a pair only hands the stake back: nothing to cheer
        if (win > bet) this.host.broadcast("emote", { sessionId, emoji: win >= bet * 12 ? "💰" : "🟡" });
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
    };
  }

  blackjack(sessionId: string, msg: { action: BlackjackAction; bet?: number }) {
    const p = this.state.players.get(sessionId);
    if (!p || !this.open) return;
    if (!blackjackTableNear(p.x, p.z, BLACKJACK_SLACK)) return;
    const action = msg?.action;
    let game = this.hands.get(sessionId);

    if (action === "deal") {
      if (game && (game.phase === "player" || game.phase === "dealer")) return; // hand in progress
      const bet = Number(msg.bet);
      if (!(BLACKJACK_BETS as readonly number[]).includes(bet) || p.chips < bet) return;
      p.chips -= bet;
      const deck = freshDeck();
      game = { deck, player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], bet, phase: "player", outcome: "", payout: 0 };
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
      if (game.player.length !== 2 || p.chips < game.bet) return;
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
    if (outcome === "win" || outcome === "blackjack") {
      this.host.tally(sessionId, "blackjack_win");
      this.host.broadcast("emote", { sessionId, emoji: outcome === "blackjack" ? "💰" : "🟡" });
    }
  }

  /** An unfinished hand is abandoned: its stake comes back. */
  private abandonHand(sessionId: string) {
    const game = this.hands.get(sessionId);
    const p = this.state.players.get(sessionId);
    if (game && game.phase === "player" && p) this.addChips(p, game.bet);
    this.hands.delete(sessionId);
  }

  // --- comings and goings ---------------------------------------------------------------------

  /** A player leaving the room: their bets on the wheel and an unfinished hand come back to them
   *  (the room saves them straight after). */
  release(sessionId: string) {
    this.refundBets(sessionId);
    this.abandonHand(sessionId);
  }

  /** The room moving to another map: every stake on the wheel and every unfinished hand is handed
   *  back, and the wheel waits for bets when the casino opens again. */
  closeTables() {
    this.state.players.forEach((_p, sessionId) => this.release(sessionId));
    this.state.bets.clear();
    this.hands.clear();
    this.setPhase("betting");
  }

  /** The same player back on a new session (their old connection's token was lost): their bets
   *  and their hand move with them, so nothing staked is lost with the old session. */
  transfer(fromId: string, toId: string) {
    const raw = this.state.bets.get(fromId);
    if (raw !== undefined) {
      this.state.bets.delete(fromId);
      this.state.bets.set(toId, raw);
    }
    const game = this.hands.get(fromId);
    if (game) {
      this.hands.delete(fromId);
      this.hands.set(toId, game);
    }
  }
}
