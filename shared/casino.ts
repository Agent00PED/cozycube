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

// --- the house's extras -----------------------------------------------------------------------
//
// Nothing here is a game with a stake beyond the capsule machine's: the dice, the Turf Club's race,
// the coin pusher, the billiards and the piano are for the fun of it; a tip is a thank-you; Pippin's
// drinks are a glow (and the espresso a quicker step); Madame Zara reads one fortune a day, now and
// then with a few chips of luck in it.

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
export type CasinoGame = "slots" | "roulette" | "blackjack";
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

/** Server -> everyone ("casinoProp"): someone rolled the dice, started a race, pushed a coin, broke
 *  the rack, played the piano, tried the VIP doors, got a reading, tipped a dealer or was served a
 *  drink. `seed` makes every client play it the same way; the dice are the server's roll. */
export interface CasinoPropEvent {
  kind: "craps" | "derby" | "pusher" | "billiards" | "piano" | "vipdoor" | "fortune" | "tipjar" | "barmenu";
  propId: string;
  sessionId: string;
  seed: number;
  dice?: [number, number];
  /** The race's winning lane (0 to DERBY_LANES - 1). */
  winner?: number;
  /** A tip: which dealer. A drink: which one. */
  dealer?: "boris" | "vivienne";
  drink?: CasinoDrinkId;
}
/** How long a Turf Club race runs, and how many horses race. */
export const DERBY_RACE_MS = 7000;
export const DERBY_LANES = 5;
export const DERBY_HORSES = ["Velvet Thunder", "Lucky Buttons", "Midnight Mocha", "Sir Gallops", "Clover Dash"];

/** Client -> server ("casino"): the capsule machine, wearing a title, Pippin's bar menu. */
export type CasinoPacket = { type: "CAPSULE_PULL" } | { type: "EQUIP_TITLE"; id: string } | { type: "BAR_ORDER"; drink: CasinoDrinkId };
/** Server -> client ("casinoNotice"): why an extra was refused (short of chips, or too far away). */
export interface CasinoNotice {
  reason: "chips" | "far";
}
