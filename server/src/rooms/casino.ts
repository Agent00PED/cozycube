import { Schema, type, type MapSchema } from "@colyseus/schema";
import {
  BLACKJACK_BETS,
  CAPSULE_COST,
  CAPSULE_DUP_REFUND,
  CASINO_DRINKS,
  CELEBRATE_SLOT_MULTIPLIER,
  CHIP_CAP,
  CHIP_VALUES,
  DEALER_TIP,
  DERBY_LANES,
  DERBY_RACE_MS,
  FORTUNE_LUCKY_CHIPS,
  MARQUEE_MIN_WIN,
  MAX_BET_TOTAL,
  ROULETTE_PHASE_SECONDS,
  SLOT_BETS,
  SLOT_PAIR,
  SLOT_SYMBOLS,
  SLOT_TRIPLE,
  ZARA_FORTUNES,
  betReturn,
  blackjackTotal,
  capsuleUnlock,
  drinkAura,
  encodeBets,
  exchangeAmount,
  fortuneFor,
  isBetKind,
  isCasinoDrink,
  isCasinoTitle,
  parseBets,
  pocketColor,
  rollCapsule,
  type BlackjackAction,
  type BlackjackCard,
  type BlackjackOutcome,
  type BlackjackPhase,
  type BlackjackView,
  type CapsuleResult,
  type CashierResult,
  type CasinoGame,
  type CasinoPacket,
  type CasinoNotice,
  type CasinoProfile,
  type CasinoPropEvent,
  type CasinoWin,
  type FortuneResult,
  type RoulettePhase,
} from "../../../shared/casino";
import {
  BAR_REACH,
  CASHIER_FRONT,
  CASHIER_REACH,
  GACHAPON_FRONT,
  GAZETTE_REACH,
  MACHINE_REACH,
  PIANO_REACH,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  TIP_JARS,
  ZARA_FRONT,
  barDistance,
  blackjackTableNear,
  type TipDealer,
} from "../../../shared/worlds/casino";
import { COIN_CAP, INTERACT_RADIUS } from "../../../shared/types";
import { todayKey } from "./games";

// The Velvet Casino's tables: the shared roulette wheel, one blackjack hand per player, the slot
// machines, and Mr. Vance's cage, where coins become Velvet Chips and back. Every stake and every
// payout is in chips. The room owns the synced state (the wheel and the bets on it live in its
// schema) and the side effects (messages, timers, stats); this owns the rules, the money and the
// hands, the way BoardTable owns a board game.
//
// And the house's extras: the dice, the Turf Club's race, the coin pusher, the billiards and the
// baby grand (for the fun of it: every client plays the same roll, race or tune from the one
// broadcast), Madame Zara's daily fortune, the capsule machine's titles and emotes, the dealers' tip
// jars, Pippin's bar, and the Big-Win marquee's news (a win worth shouting about, and whether the
// hall celebrates it).

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
  sendTo(sessionId: string, type: string, payload: unknown): void;
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
const seed = () => Math.floor(Math.random() * 0x7fffffff);
const die = () => 1 + Math.floor(Math.random() * 6);
const near = (p: { x: number; z: number }, q: { x: number; z: number }, reach: number) => Math.hypot(p.x - q.x, p.z - q.z) <= reach;

/** How much further than the client's reach the server allows, for lag. */
const ROULETTE_SLACK = 0.6;
const BLACKJACK_SLACK = 0.8;
const SLOT_SLACK = 0.8;
const CASHIER_SLACK = 0.6;
const EXTRA_SLACK = 0.6;
/** The reels spin for ~1.6 s on screen; a win is paid when they land. */
const SLOT_LAND_MS = 1700;
/** How often one player may roll the dice, push a coin, break the rack, play the piano, try the VIP
 *  doors or tip (a click storm is not a storm of broadcasts). */
const PROP_COOLDOWN_MS: Partial<Record<CasinoPropEvent["kind"], number>> = { craps: 2500, pusher: 1500, billiards: 2500, piano: 2200, vipdoor: 3000, tipjar: 1200, fortune: 2500 };

export class CasinoFloor {
  private phaseClock = ROULETTE_PHASE_SECONDS.betting;
  private readonly hands = new Map<string, BlackjackGame>();
  /** Each player's last use of each prop kind (the cooldowns above). */
  private readonly lastUse = new Map<string, number>();
  /** The Turf Club runs one race at a time. */
  private raceUntil = 0;

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

  /** Why an extra was refused, to the one who tried. */
  private refuse(sessionId: string, reason: CasinoNotice["reason"]) {
    this.host.sendTo(sessionId, "casinoNotice", { reason } satisfies CasinoNotice);
  }

  /** Whether `kind` is off its cooldown for this player (and starts it again if so). */
  private ready(sessionId: string, kind: CasinoPropEvent["kind"]): boolean {
    const wait = PROP_COOLDOWN_MS[kind] ?? 0;
    const key = `${sessionId}:${kind}`;
    const now = Date.now();
    if (now - (this.lastUse.get(key) ?? 0) < wait) return false;
    this.lastUse.set(key, now);
    return true;
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
      const bets = parseBets(raw);
      let won = 0;
      for (const [kind, amount] of Object.entries(bets)) won += betReturn(kind, amount, result);
      if (won > 0) {
        this.addChips(p, won);
        this.host.tally(sessionId, "roulette_win");
        winners.push({ sessionId, username: p.username, amount: won });
        this.host.broadcast("emote", { sessionId, emoji: won >= 100 ? "💰" : "🟡" });
        // a number hit straight up sets the hall off; any big win makes the marquee
        const straight = (bets[`n${result}`] ?? 0) > 0;
        this.announce(sessionId, p, won, "roulette", straight ? `${result} straight up` : `${result} ${pocketColor(result)}`, straight);
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
        if (win > bet) this.host.broadcast("emote", { sessionId, emoji: win >= bet * 12 ? "💰" : "🟡" });
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

  // --- the house's extras -----------------------------------------------------------------------

  /** A casino prop walked up to (or, for the ones you can use from a seat, clicked from it). The
   *  room has already checked the general reach (INTERACT_RADIUS); the finer ones are here. */
  useProp(sessionId: string, prop: SlotProp) {
    const p = this.state.players.get(sessionId);
    if (!p || !this.open) return;
    const event = (kind: CasinoPropEvent["kind"], extra: Partial<CasinoPropEvent> = {}) => ({ kind, propId: prop.propId, sessionId, seed: seed(), ...extra }) satisfies CasinoPropEvent;
    switch (prop.kind) {
      // the game tables: walking up to one opens its board (nothing ever opens by itself)
      case "roulette":
        this.host.sendTo(sessionId, "openPanel", { kind: "roulette", propId: prop.propId });
        break;
      case "blackjack":
        if (blackjackTableNear(p.x, p.z, BLACKJACK_SLACK)) this.host.sendTo(sessionId, "openPanel", { kind: "blackjack", propId: prop.propId });
        break;
      // what you read, order and pull: their panels
      case "gazette":
        if (near(p, prop, GAZETTE_REACH + EXTRA_SLACK)) this.host.sendTo(sessionId, "openPanel", { kind: "gazette", propId: prop.propId });
        break;
      case "barmenu":
        if (barDistance(p.x, p.z) <= BAR_REACH + EXTRA_SLACK) this.host.sendTo(sessionId, "openPanel", { kind: "barmenu", propId: prop.propId });
        break;
      case "gachapon":
        if (near(p, GACHAPON_FRONT, MACHINE_REACH + EXTRA_SLACK)) this.host.sendTo(sessionId, "openPanel", { kind: "capsule", propId: prop.propId });
        break;
      case "fortune":
        if (near(p, ZARA_FRONT, MACHINE_REACH + EXTRA_SLACK) && this.ready(sessionId, "fortune")) this.fortune(sessionId, p, event("fortune"));
        break;
      case "tipjar":
        this.tip(sessionId, p, prop.propId === "tipjar_boris" ? "boris" : "vivienne", event);
        break;
      // the set dressing: everyone sees (and hears) the same roll, race, push, break and tune
      case "craps":
        if (this.ready(sessionId, "craps")) this.host.broadcast("casinoProp", event("craps", { dice: [die(), die()] }));
        break;
      case "derby": {
        const now = Date.now();
        if (now < this.raceUntil) return; // they're off already: watch this one
        this.raceUntil = now + DERBY_RACE_MS + 1500;
        this.host.broadcast("casinoProp", event("derby", { winner: Math.floor(Math.random() * DERBY_LANES) }));
        break;
      }
      case "pusher":
        if (this.ready(sessionId, "pusher")) this.host.broadcast("casinoProp", event("pusher"));
        break;
      case "billiards":
        if (this.ready(sessionId, "billiards")) this.host.broadcast("casinoProp", event("billiards"));
        break;
      case "piano":
        if (near(p, prop, PIANO_REACH + EXTRA_SLACK) && this.ready(sessionId, "piano")) this.host.broadcast("casinoProp", event("piano"));
        break;
      case "vipdoor":
        // locked: Bruno sees to it (his word is for the one who tried the handle)
        if (this.ready(sessionId, "vipdoor")) this.host.sendTo(sessionId, "casinoProp", event("vipdoor"));
        break;
    }
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

  /** The capsule machine, Pippin's bar menu and the title you wear. */
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
    if (packet.type === "CAPSULE_PULL") {
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
    } else if (packet.type === "BAR_ORDER") {
      if (!isCasinoDrink(packet.drink)) return;
      if (barDistance(p.x, p.z) > BAR_REACH + EXTRA_SLACK) return this.refuse(sessionId, "far");
      const drink = CASINO_DRINKS[packet.drink];
      if (p.chips < drink.price) return this.refuse(sessionId, "chips");
      p.chips -= drink.price;
      this.host.aura(sessionId, drinkAura(packet.drink), drink.seconds);
      this.host.broadcast("casinoProp", { kind: "barmenu", propId: "bar_menu", sessionId, seed: seed(), drink: packet.drink } satisfies CasinoPropEvent);
    }
  }

  // --- comings and goings ---------------------------------------------------------------------

  /** A player leaving the room: their bets on the wheel and an unfinished hand come back to them
   *  (the room saves them straight after). */
  release(sessionId: string) {
    this.refundBets(sessionId);
    this.abandonHand(sessionId);
    for (const key of this.lastUse.keys()) if (key.startsWith(`${sessionId}:`)) this.lastUse.delete(key);
  }

  /** The room moving to another map: every stake on the wheel and every unfinished hand is handed
   *  back, and the wheel waits for bets when the casino opens again. */
  closeTables() {
    this.state.players.forEach((_p, sessionId) => this.release(sessionId));
    this.state.bets.clear();
    this.hands.clear();
    this.raceUntil = 0;
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
