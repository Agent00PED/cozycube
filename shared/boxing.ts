// The Velvet Ring's rules: a social brawler for two fighters on the canvas, the room at ringside,
// tuned after Roblox's Untitled Boxing Game. Shared by the server (server/src/rooms/boxing.ts, which
// runs every bout and is the only judge of a strike) and the client (the HUD's gauges, the moves'
// timings it predicts and animates, the ringside chalkboard's odds). Pure functions and numbers
// only: no Colyseus, no three.js.
//
//   The hill    King of the Hill: the ring's steps are a queue. The first two in line fill the
//               corners, a 15 s countdown opens the ringside betting, then the bell: best of three
//               rounds. A round is won by a K.O. (the ten-count), a T.K.O. (a third knockdown in it),
//               a Ring-Out (launched through the ropes) or, at its 90 s bell, on the judges' round
//               card; between rounds both fighters go back to their corners patched up to full, and
//               the first to two rounds takes the bout. The winner stays on the canvas in their
//               corner, and the next in line steps in against them; the loser is walked to the
//               bleachers. A fighter who leaves or drops mid-bout forfeits it.
//   Sparring    Jimmy the Slugger, by the Blue Corner's steps, spars anyone in a free ring (or the
//               champion waiting in it): Rookie, Contender or Champion, a whole bout with no purse,
//               no record and no bets, fought by the server's own hands (the same moves and rules).
//   No cooldowns. Every move is gated by Stamina, its own frames (a wind-up, then endlag) and an
//               input buffer (a button pressed in the last BUFFER_S of a move comes out the moment
//               it ends).
//   Health      100: what a clean punch takes; it does not come back during a round. At 0 the
//               fighter goes down and Coach Bruno counts: getting up takes a flurry of taps (the
//               first easy, the second harder), and a third knockdown is a T.K.O.
//   Stamina     100: every punch, dash and second of guarding spends it; after STAMINA.idle s without
//               one it comes back at 35 a second. Run dry and you're Exhausted until it is back to
//               25: no dash, no guard, and every punch half as quick.
//   Guard       100: a raised guard (held) takes 80% off a punch, and the punch chips the meter (an
//               M1 10, the M2 45). At 0: a Guard Break (the gloves flung wide, dazed 1.2 s, knocked
//               back). It refills while the gloves are down.
//   The moves   M1, a three-punch string with a rhythm (the Snap Jab, the Corkscrew Straight, the
//               Leaping Lead Hook: each one's hitstun carries into the next, so a string on time is
//               a true combo); M2, the Heavy Smash (a big telegraphed wind-up, heavy knockback, 45
//               off a guard; guarding in its first 0.15 s feints it); Dash (Space and a direction:
//               a slip left or right, a sway back, a step in). A dash in the last PD window before a
//               punch lands is a Perfect Dodge: the puncher whiffs and staggers, and the dodger's
//               next punch is a Counter (x1.4, an M1 thrown as a rising uppercut).
//   The ropes   an M2 that drives someone into the ropes bounces them off, stunned a moment; one
//               that lands on a fighter at half health or less launches them through: Ring-Out.
//   Fair play   a bout over in under 15 s, or one whose loser never threw a punch, is a No Contest:
//               every bet comes back, nothing is paid, no record touched. A fighter who drops has
//               5 s to come back. Spectators never set foot on the canvas.
//   Betting     spectators back Red or Blue during the countdown, 50 to 300 coins, pari-mutuel: the
//               winners share the losers' pool (the house keeps 5% of the winnings).
//   The belt    three wins in a row: the Velvet Championship Belt over your name for 24 hours.

export type Corner = "red" | "blue";
export const CORNERS: readonly Corner[] = ["red", "blue"];
export const CORNER_NAME: Record<Corner, string> = { red: "Red Corner", blue: "Blue Corner" };
export const CORNER_COLOR: Record<Corner, string> = { red: "#d8383a", blue: "#3a6fd8" };
export function isCorner(v: unknown): v is Corner {
  return v === "red" || v === "blue";
}
export function otherCorner(c: Corner): Corner {
  return c === "red" ? "blue" : "red";
}

/** Where the bout is: waiting for a challenger, the countdown (bets open), a round, a knockdown's
 *  count, the rest between rounds, the result on the board. */
export type BoutPhase = "open" | "warmup" | "fight" | "count" | "rest" | "result";
/** What a fighter is doing, as the server has it: throwing a punch (its wind-up and endlag),
 *  guarding, dashing, reeling from a clean hit (hitstun), dazed by a Guard Break, staggered by a
 *  whiff into a Perfect Dodge, down (the count), or out. */
export type FighterState = "" | "attack" | "block" | "dash" | "hurt" | "stun" | "stagger" | "down" | "out";
/** The punches: M1's three-punch string, the M2, and the Counter's uppercut (an M1 after a Perfect Dodge). */
export type BoxMove = "jab" | "straight" | "leadhook" | "smash" | "uppercut";
export const M1_CHAIN: readonly BoxMove[] = ["jab", "straight", "leadhook"];
export function isM1(move: BoxMove): boolean {
  return move !== "smash";
}
/** A round's winner as the bout keeps it ("draw": the judges could not split them). */
export type RoundWinner = Corner | "draw";
/** Rounds to win to take the bout (best of ROUNDS). */
export const ROUNDS_TO_WIN = 2;
/** How a bout (or a round) ended. */
export type BoutMethod = "ko" | "tko" | "ringout" | "decision" | "forfeit" | "draw" | "nocontest";
export const METHOD_LABEL: Record<BoutMethod, string> = {
  ko: "K.O.",
  tko: "T.K.O.",
  ringout: "Ring-Out K.O.",
  decision: "Decision",
  forfeit: "T.K.O. (Forfeit)",
  draw: "Draw",
  nocontest: "No Contest",
};

// --- the fighters' pools ------------------------------------------------------------------------

export const HEALTH_MAX = 100;
export const STAMINA_MAX = 100;
export const GUARD_MAX = 100;

export const STAMINA = {
  /** Back each second, once `idle` s have passed without a punch, a dash or a guard. */
  regen: 35,
  idle: 0.4,
  /** Run dry: Exhausted (no dash, no guard, punches at half speed) until it is back to this. */
  recover: 25,
  /** Punches thrown Exhausted take this much longer (their wind-up and their endlag). */
  tiredSlow: 2,
} as const;

export interface MoveSpec {
  name: string;
  emoji: string;
  /** Seconds from the button to the punch landing (the wind-up). */
  windup: number;
  /** Seconds the whole move takes (the wind-up, the strike, the endlag back to guard). */
  total: number;
  stamina: number;
  /** Health taken by a clean hit, and what it chips off a raised guard's meter. */
  damage: number;
  guard: number;
  /** How far apart (m, centre to centre) it still reaches. */
  reach: number;
  /** How far a clean hit drives the other fighter back (m). */
  knockback: number;
  /** How long a clean hit leaves the other fighter unable to act (s). */
  hitstun: number;
}
export const MOVES: Record<BoxMove, MoveSpec> = {
  // M1: snap, pivot, leap. Each lands inside the last one's hitstun when thrown on time (or
  // buffered), so the string is a true combo; late, the other fighter gets a moment to guard or dash
  jab: { name: "Snap Jab", emoji: "👊", windup: 0.08, total: 0.18, stamina: 8, damage: 5, guard: 10, reach: 1.35, knockback: 0.12, hitstun: 0.3 },
  straight: { name: "Corkscrew Straight", emoji: "👊", windup: 0.11, total: 0.24, stamina: 8, damage: 7, guard: 10, reach: 1.4, knockback: 0.18, hitstun: 0.32 },
  leadhook: { name: "Leaping Lead Hook", emoji: "🥊", windup: 0.16, total: 0.32, stamina: 8, damage: 10, guard: 10, reach: 1.45, knockback: 0.55, hitstun: 0.36 },
  // M2: a big telegraph, a crushing overhand, a sluggish recovery (0.28 s in, 0.22 s back)
  smash: { name: "Heavy Smash", emoji: "💥", windup: 0.28, total: 0.5, stamina: 20, damage: 18, guard: 45, reach: 1.6, knockback: 1.1, hitstun: 0.55 },
  // the Counter's M1, after a Perfect Dodge
  uppercut: { name: "Counter Uppercut", emoji: "💥", windup: 0.1, total: 0.3, stamina: 8, damage: 10, guard: 10, reach: 1.45, knockback: 0.5, hitstun: 0.45 },
};

/** The M1 string: the next M1 continues it if thrown within this long of the last one ending;
 *  the third punch's endlag is this much longer (the string's full stop). */
export const CHAIN_WINDOW_S = 0.45;
export const CHAIN_END_LAG_S = 0.2;
/** A button pressed this close to the end of a move (or a hitstun) comes out the moment it ends. */
export const BUFFER_S = 0.25;
/** Guarding this soon into an M2's wind-up pulls it back: a Feint (half its stamina back). */
export const FEINT_WINDOW_S = 0.15;

export const GUARD = {
  /** What a raised guard takes off a punch. */
  mitigate: 0.8,
  /** Stamina a second, while it is held. */
  drain: 4,
  /** The meter refills this fast (a second) once the gloves have been down this long. */
  regen: 20,
  regenDelay: 1.0,
  /** A Guard Break: dazed this long, knocked back this far (the meter full again after). */
  breakStun: 1.2,
  breakKnockback: 0.6,
} as const;

export const DASH = {
  /** How far a dash carries you (m), what it costs, and how long it takes. */
  distance: 0.9,
  stamina: 15,
  time: 0.16,
  /** A punch landing within this long of a dash starting is a Perfect Dodge... */
  perfect: 0.1,
  /** ...with this much more allowed for the connection (the dasher's press travels to the server). */
  grace: 0.06,
} as const;

/** A Perfect Dodge: the puncher whiffs and staggers this long; the dodger's next punch within
 *  COUNTER_WINDOW_S is a Counter, this much harder. */
export const WHIFF_STAGGER_S = 0.5;
export const COUNTER_WINDOW_S = 0.9;
export const COUNTER_BONUS = 1.4;

/** How close two fighters' origins come (their bodies just touch): nobody walks or dashes through
 *  the other. */
export const FIGHTER_GAP = 0.72;
/** How much further than a punch's reach the server still counts it (the two fighters' positions
 *  there trail what each of them saw by a report or so). */
export const STRIKE_SLACK = 0.1;

/** Bounced off the ropes by an M2: stunned this long, sent back this far. */
export const ROPE_STUN_S = 0.4;
export const ROPE_BOUNCE = 0.45;
/** An M2 into the ropes on a fighter with this much health or less (after the hit) sends them
 *  through: Ring-Out. */
export const RINGOUT_HEALTH = 50;

// --- knockdowns and the count -----------------------------------------------------------------

/** Coach Bruno counts one a second, to ten. */
export const COUNT_TO = 10;
export const COUNT_STEP_S = 1;
/** Taps to get up from the first and second knockdowns (a third is a T.K.O.); they fade away at
 *  TAP_DECAY_PER_S, so it takes a flurry: the first is easy, the second moderate. */
export const RECOVER_TAPS = [10, 22] as const;
export const TAP_DECAY_PER_S = 2;
/** Health back on getting up from the first and second knockdowns. */
export const RECOVER_HEALTH = [50, 30] as const;
export const KNOCKDOWNS_TKO = 3;
/** Taps a second the count believes (a macro gets no further). */
export const MAX_TAPS_PER_S = 12;
/** Nobody gets up before this count. */
export const MIN_COUNT_UP = 2;

// --- the bout ---------------------------------------------------------------------------------

/** The countdown between two fighters meeting in the corners and the first bell (bets open). */
export const WARMUP_S = 15;
export const ROUNDS = 3;
export const ROUND_S = 90;
export const REST_S = 5;
/** A sparring bout's countdown (there is nothing to bet on). */
export const SPAR_WARMUP_S = 6;
/** The result on the board this long; the loser is walked to the bleachers after BENCH_AFTER_S. */
export const RESULT_S = 6;
export const BENCH_AFTER_S = 2.5;
/** The most waiting in line for the ring. */
export const QUEUE_MAX = 8;
/** A bout decided sooner than this is a No Contest (nothing paid, every bet back). */
export const NO_CONTEST_S = 15;
/** A fighter whose connection drops mid-bout has this long to come back before it is a forfeit. */
export const FORFEIT_GRACE_S = 5;
/** The judges' card: damage dealt, plus this much a knockdown scored. */
export const KNOCKDOWN_POINTS = 20;

// --- the sparring partner ----------------------------------------------------------------------

/** Jimmy the Slugger's three settings: how he fights, and what the panel says of it. */
export type BotTier = "rookie" | "contender" | "champion";
export const BOT_TIERS: readonly BotTier[] = ["rookie", "contender", "champion"];
export function isBotTier(v: unknown): v is BotTier {
  return v === "rookie" || v === "contender" || v === "champion";
}
export const SPAR_TIERS: Record<BotTier, { name: string; emoji: string; blurb: string }> = {
  rookie: { name: "Rookie", emoji: "🥉", blurb: "Slow single jabs, hardly guards. Learn the string, the guard and the dash." },
  contender: { name: "Contender", emoji: "🥈", blurb: "Throws full strings, raises the shell, breaks guards with the Heavy Smash." },
  champion: { name: "Champion", emoji: "🥇", blurb: "Feints the Smash, Perfect Dodges yours and counters hard. Bring your best." },
};
/** The sparring partner's session in the bout (a bot never has a player of its own). */
export const JIMMY_ID = "bot:jimmy";
export const JIMMY_NAME = "Jimmy the Slugger";
export function isBotId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("bot:");
}

// --- the purse, the bets, the belt ------------------------------------------------------------

/** Coins to the winner of a bout that counts. */
export const BOUT_PURSE = 30;
/** Purses paid an account an hour (a bout past them is still won, the streak still counts). */
export const PURSES_PER_HOUR = 6;
export const BET_MIN = 50;
export const BET_MAX = 300;
/** The house's cut of the winnings (the losers' pool shared out). */
export const HOUSE_RAKE = 0.05;
/** Wins in a row for the Velvet Championship Belt, and how long it is worn over the name. */
export const BELT_STREAK = 3;
export const BELT_MS = 24 * 60 * 60 * 1000;
export const BELT_TITLE = "[ 🏆 VELVET CHAMPION ]";

/** The pools on either corner. */
export type Pools = Record<Corner, number>;

/** What one coin on `side` returns if it wins (1 + its share of the other pool, less the rake), or
 *  null while nobody has backed it. */
export function odds(pools: Pools, side: Corner): number | null {
  const mine = pools[side];
  if (mine <= 0) return null;
  return 1 + (pools[otherCorner(side)] * (1 - HOUSE_RAKE)) / mine;
}

/** "2.35x", or "—" with nothing on that side yet. */
export function oddsText(pools: Pools, side: Corner): string {
  const o = odds(pools, side);
  return o === null ? "—" : `${o.toFixed(2)}x`;
}

/** A bet as kept in the room (the bout's `bets` map): "red:150". */
export function encodeBet(side: Corner, amount: number): string {
  return `${side}:${Math.floor(amount)}`;
}
export function parseBet(raw: string | undefined | null): { side: Corner; amount: number } | null {
  const [side, n] = String(raw ?? "").split(":");
  const amount = Math.floor(Number(n));
  return isCorner(side) && amount > 0 ? { side, amount } : null;
}
export function poolsOf(bets: Iterable<string>): Pools {
  const pools: Pools = { red: 0, blue: 0 };
  for (const raw of bets) {
    const b = parseBet(raw);
    if (b) pools[b.side] += b.amount;
  }
  return pools;
}

/** What each bettor gets back when `winner` wins (null: a draw or a No Contest, every stake back).
 *  A winner gets the stake and a share of the losers' pool pro rata, less HOUSE_RAKE of that share
 *  (floored); a loser gets nothing. With nobody on the winning side, the losers' pool is the house's. */
export function settleBets(bets: ReadonlyMap<string, string>, winner: Corner | null): Map<string, number> {
  const out = new Map<string, number>();
  const pools = poolsOf(bets.values());
  for (const [who, raw] of bets) {
    const b = parseBet(raw);
    if (!b) continue;
    if (winner === null) out.set(who, b.amount);
    else if (b.side === winner) out.set(who, b.amount + Math.floor((b.amount / pools[winner]) * pools[otherCorner(winner)] * (1 - HOUSE_RAKE)));
    else out.set(who, 0);
  }
  return out;
}

/** Whether a bout ending this way counts at all (the guard against a fixed fight): it lasted
 *  NO_CONTEST_S, and the loser threw at least one punch. */
export function boutCounts(foughtS: number, loserStrikes: number): boolean {
  return foughtS >= NO_CONTEST_S && loserStrikes > 0;
}

// --- the gloves -------------------------------------------------------------------------------

/** The pairs a fighter can own. The Classic gloves come in their corner's colour (red or blue). */
export type GloveId = "red" | "tiger";
export const GLOVES: Record<GloveId, { name: string; emoji: string; price: number; note: string; lightCost: number }> = {
  red: { name: "Classic Gloves", emoji: "🥊", price: 0, note: "Every fighter's first pair, laced in their corner's colour: padded, lucky.", lightCost: 1 },
  tiger: { name: "Tiger Stripe Mitts", emoji: "🐯", price: 850, note: "Orange and black, stitched by hand: every M1 costs 10% less stamina.", lightCost: 0.9 },
};
export const GLOVE_IDS = Object.keys(GLOVES) as GloveId[];
export function isGloveId(v: unknown): v is GloveId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(GLOVES, v);
}

/** The gloves' look on the canvas (boxing_gloves.glb's Glove_<look>_L/R): a Classic pair takes
 *  its corner's colour, the Tiger Stripes are their own. */
export function gloveLook(gloves: string, corner: string): "red" | "blue" | "tiger" {
  if (gloves === "tiger") return "tiger";
  return corner === "blue" ? "blue" : "red";
}

/** A move's stamina in these gloves. */
export function moveCost(move: BoxMove, gloves: GloveId): number {
  return isM1(move) ? MOVES[move].stamina * GLOVES[gloves].lightCost : MOVES[move].stamina;
}

// --- a fighter's record, kept with the account --------------------------------------------------

export interface BoxingProfile {
  wins: number;
  losses: number;
  kos: number;
  /** Wins in a row now, and the best run ever. */
  streak: number;
  best: number;
  /** The Velvet Championship Belt is worn until then (epoch ms; 0: never won). */
  beltUntil: number;
  /** Gloves bought (the Classic pair is everyone's), and the pair worn into the ring. */
  gloves: GloveId[];
  worn: GloveId;
  /** When the purses of the last hour were paid (epoch ms): PURSES_PER_HOUR at most. */
  purses: number[];
}

export function emptyBoxingProfile(): BoxingProfile {
  return { wins: 0, losses: 0, kos: 0, streak: 0, best: 0, beltUntil: 0, gloves: ["red"], worn: "red", purses: [] };
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** A saved record read back: anything malformed becomes the empty record's. */
export function sanitizeBoxingProfile(raw: unknown): BoxingProfile {
  const r = (raw ?? {}) as Partial<Record<keyof BoxingProfile, unknown>>;
  const gloves = Array.isArray(r.gloves) ? [...new Set(r.gloves.filter(isGloveId))] : [];
  if (!gloves.includes("red")) gloves.unshift("red");
  const worn = isGloveId(r.worn) && gloves.includes(r.worn) ? r.worn : "red";
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return {
    wins: count(r.wins),
    losses: count(r.losses),
    kos: count(r.kos),
    streak: count(r.streak),
    best: count(r.best),
    beltUntil: count(r.beltUntil),
    gloves,
    worn,
    purses: Array.isArray(r.purses) ? r.purses.filter((t): t is number => typeof t === "number" && t > hourAgo).slice(-PURSES_PER_HOUR) : [],
  };
}

export function parseBoxingProfile(raw: string | null | undefined): BoxingProfile {
  try {
    return sanitizeBoxingProfile(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyBoxingProfile();
  }
}

/** Whether the belt is on (at `now`). */
export function wearsBelt(profile: Pick<BoxingProfile, "beltUntil">, now = Date.now()): boolean {
  return profile.beltUntil > now;
}

/** The belt's clock out of a synced profile (PlayerState.boxing JSON), without parsing all of it. */
export function beltUntilOf(raw: string | null | undefined): number {
  const m = /"beltUntil":(\d+)/.exec(raw ?? "");
  return m ? Number(m[1]) : 0;
}

// --- the wire ---------------------------------------------------------------------------------

/** Client -> server, on the "boxing" channel. `DASH`'s (dx, dz) is the way to go, in the world
 *  (none: straight back from the other fighter). `LEAVE_RING` steps down (a forfeit mid-bout);
 *  `LEAVE_QUEUE` gives up a place in line (the corner steps join it: the ring's props); `SPAR` calls
 *  Jimmy the Slugger in (from beside him, or waiting alone in the ring). */
export type BoxingPacket =
  | { type: "M1" }
  | { type: "M2" }
  | { type: "GUARD"; on: boolean }
  | { type: "DASH"; dx?: number; dz?: number }
  | { type: "MASH" }
  | { type: "BET"; side: Corner; amount: number }
  | { type: "BUY_GLOVES"; id: GloveId }
  | { type: "WEAR_GLOVES"; id: GloveId }
  | { type: "LEAVE_RING" }
  | { type: "LEAVE_QUEUE" }
  | { type: "SPAR"; tier: BotTier };

/** One fighter as the room's state carries it (mirrors the server's FighterSchema). */
export interface FighterView {
  sessionId: string;
  name: string;
  health: number;
  stamina: number;
  guard: number;
  state: FighterState;
  /** Out of stamina (no dash, no guard, slow punches) until it is back to STAMINA.recover. */
  exhausted: boolean;
  /** A Perfect Dodge's Counter is ready (the next punch hits x1.4). */
  counter: boolean;
  knockdowns: number;
  /** Taps toward getting up (while down), and how many it takes. */
  taps: number;
  need: number;
  /** Damage dealt this bout (the judges' card). */
  dealt: number;
  gloves: GloveId;
  /** Connection dropped: the bout waits (FORFEIT_GRACE_S). */
  away: boolean;
  /** Bouts won in a row on this hill (the King of the Hill's count). */
  reign: number;
  /** Rounds won in this bout (ROUNDS_TO_WIN takes it). `knockdowns` are this round's. */
  wins: number;
  /** The sparring partner's setting ("" for a player), and where he stands (a player's position is
   *  their own, in the room's players). */
  bot: BotTier | "";
  x: number;
  z: number;
}

/** The bout as the room's state carries it (mirrors the server's BoutSchema). */
export interface BoutView {
  phase: BoutPhase;
  round: number;
  /** Where the ten-count is (1..10) while someone is down. */
  count: number;
  red: FighterView;
  blue: FighterView;
  /** Bets on the bout, by session id (encodeBet), and the pools they make. */
  bets: Record<string, string>;
  pools: Pools;
  /** The last bout's result, for the board (a BoutResult as JSON), "" before the first. */
  result: string;
  /** Who is waiting for the ring, first in line first (session ids). */
  queue: string[];
  /** Each round fought so far: who took it. */
  rounds: RoundWinner[];
  /** A sparring bout against Jimmy: his setting ("" for a real bout). */
  spar: BotTier | "";
  /** The client's clock when this snapshot arrived. */
  now: number;
}

/** The end of a bout, told to the whole map ("boxResult") and kept on the board. */
export interface BoutResult {
  winner: Corner | null;
  winnerName: string;
  loserName: string;
  method: BoutMethod;
  /** Coins to the winner (0: no purse this time, or none left this hour). */
  purse: number;
  /** Won the belt with this bout. */
  belt: boolean;
  /** The winner holds the ring for the next challenger (King of the Hill), and their run there. */
  stays: boolean;
  reign: number;
  /** Who took each round. */
  rounds: RoundWinner[];
  /** A sparring bout's setting (no purse, no record, no bets). */
  spar?: BotTier;
  /** How the pools paid out: each bettor's return, by name. */
  payouts: { name: string; side: Corner; stake: number; paid: number }[];
  round: number;
  /** Seconds fought. */
  seconds: number;
}

/** The way a dash goes, seen from the fighter facing the other one: in, left, right or back. */
export type DashSide = "F" | "L" | "R" | "B";

/** What happened in the ring, told to everyone on the map ("boxEvent") for its animations, its
 *  sounds and its screen juice. `dir` is the way a punch drove its target (x, z). */
export type BoxEvent =
  | { kind: "swing"; by: string; move: BoxMove; tired: boolean; counter: boolean; windup: number; total: number; shadow: boolean }
  | { kind: "feint"; by: string }
  | { kind: "hit"; by: string; to: string; move: BoxMove; damage: number; counter: boolean; interrupt: boolean; dir: [number, number] }
  | { kind: "block"; by: string; to: string; move: BoxMove; damage: number; dir: [number, number] }
  | { kind: "whiff"; by: string; to: string; move: BoxMove }
  | { kind: "perfect"; by: string; to: string; move: BoxMove }
  | { kind: "guardbreak"; by: string; to: string }
  | { kind: "dash"; by: string; side: DashSide; shadow: boolean }
  | { kind: "exhausted"; to: string }
  | { kind: "ropes"; to: string; side: RopeSide }
  | { kind: "ringout"; to: string; side: RopeSide }
  | { kind: "knockdown"; to: string; knockdowns: number }
  | { kind: "count"; n: number; to: string }
  | { kind: "up"; to: string; beat: boolean }
  | { kind: "round"; round: number; winner: Corner | null; method: BoutMethod }
  | { kind: "bell"; round: number; ring: "start" | "end" }
  | { kind: "enter"; by: string; corner: Corner }
  | { kind: "leave"; by: string; corner: Corner }
  | { kind: "away"; by: string; back: boolean };

/** The ring's four sides, by the way out of them (-x: west, +x: east, -z: north, +z: south). */
export type RopeSide = "w" | "e" | "n" | "s";

// --- the strike, judged -------------------------------------------------------------------------

/** What a punch meets when it lands (the server fills it in at the moment of impact). */
export interface Defence {
  /** The defender's state at the moment the punch lands. */
  state: FighterState;
  /** When their last dash started (s, the same clock as `at`; -Infinity: never). */
  dashAt: number;
  /** Their guard's meter. */
  guard: number;
}

export type StrikeOutcome =
  | { kind: "whiff" }
  | { kind: "perfect" }
  | { kind: "block"; damage: number; guard: number; guardBreak: boolean }
  | { kind: "hit"; damage: number; interrupt: boolean };

/**
 * A punch landing at `at` (s) from `distance` (m) away (a Counter's `counter`) on a defender: a
 * Perfect Dodge (they dashed within DASH.perfect of the landing, plus the connection's grace, and
 * it would have reached them from where they started), out of reach, blocked (80% less, the
 * guard's meter chipped, maybe broken) or a clean hit (an attack of theirs knocked out of its
 * wind-up or endlag).
 */
export function judgeStrike(move: BoxMove, distance: number, at: number, counter: boolean, d: Defence): StrikeOutcome {
  const spec = MOVES[move];
  if (d.state === "down" || d.state === "out") return { kind: "whiff" };
  const since = at - d.dashAt;
  if (since >= 0 && since <= DASH.perfect + DASH.grace && distance <= spec.reach + DASH.distance) return { kind: "perfect" };
  if (distance > spec.reach) return { kind: "whiff" };
  const raw = spec.damage * (counter ? COUNTER_BONUS : 1);
  if (d.state === "block") {
    const chip = spec.guard * (counter ? COUNTER_BONUS : 1);
    return { kind: "block", damage: Math.max(1, Math.round(raw * (1 - GUARD.mitigate))), guard: chip, guardBreak: d.guard - chip <= 0 };
  }
  return { kind: "hit", damage: Math.round(raw), interrupt: d.state === "attack" };
}

/** Which way a dash goes, seen from the fighter facing the other one: in, left, right or back. */
export function dashSide(facing: { x: number; z: number }, dir: { x: number; z: number }): DashSide {
  const len = Math.hypot(dir.x, dir.z);
  if (len < 1e-3) return "B";
  const fl = Math.hypot(facing.x, facing.z) || 1;
  const fx = facing.x / fl;
  const fz = facing.z / fl;
  const along = (dir.x * fx + dir.z * fz) / len;
  // an avatar facing +z has its left hand at +x (Avatar.tsx), so facing (fx, fz) its right is (-fz, fx)
  const across = (-dir.x * fz + dir.z * fx) / len;
  if (along < -0.6) return "B";
  if (along > 0.6) return "F";
  return across >= 0 ? "R" : "L";
}

/** The judges' card: damage dealt plus KNOCKDOWN_POINTS for every knockdown scored. */
export function cardScore(dealt: number, knockdownsScored: number): number {
  return dealt + knockdownsScored * KNOCKDOWN_POINTS;
}

/** A move's wind-up and whole length, thrown Exhausted or not (s). The third punch of the string
 *  carries the string's full stop. */
export function moveTiming(move: BoxMove, tired: boolean): { windup: number; total: number } {
  const k = tired ? STAMINA.tiredSlow : 1;
  const spec = MOVES[move];
  return { windup: spec.windup * k, total: spec.total * k + (move === "leadhook" ? CHAIN_END_LAG_S : 0) };
}
