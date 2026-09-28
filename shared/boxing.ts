// The Velvet Ring's rules: a social brawler for two fighters on the canvas, the room at ringside.
// Shared by the server (server/src/rooms/boxing.ts, which runs every bout and is the only judge of
// a strike) and the client (the HUD's gauges and cooldowns, the ringside chalkboard's odds). Pure
// functions and numbers only: no Colyseus, no three.js.
//
//   A bout      two players step in through the corner steps (Red, Blue); the moment both corners
//               are filled a 20 s warm-up opens the ringside betting; then the bell and up to three
//               45 s rounds. It ends by K.O. (the ten-count), T.K.O. (a third knockdown, a
//               forfeit), Ring-Out (launched through the ropes) or the judges' decision.
//   Stamina     100: swinging and blocking spend it, it comes back at 15 a second. A swing with too
//               little left is a tired one: half as quick, half as hard. Holding the guard until it
//               runs dry is a Guard Break (stunned 1.5 s).
//   Composure   100: what a clean punch takes away; it does not come back during a round. At 0 the
//               fighter goes down and Coach Bruno counts.
//   The moves   Jab (a quick 0.15 s wind-up, cheap, and it knocks a Heavy Hook's wind-up out),
//               Heavy Hook (0.35 s, hard, knocks the other back toward the ropes; 3.5 s cooldown),
//               Guard (75% less damage, 1 s at most, 2 s cooldown; raised within 0.15 s of a punch
//               landing it is a Perfect Parry: the puncher staggers 0.6 s and your next jab is a
//               free Counter Uppercut), Sway (a slip with 0.2 s of invulnerability, 2.5 s cooldown).
//   The ropes   a hook that drives someone into the ropes bounces them off, stunned a moment; one
//               that lands on a fighter with little composure left launches them through: Ring-Out.
//   Fair play   a bout over in under 15 s, or one whose loser never threw a thing, is a No Contest:
//               every bet comes back, nothing is paid. A fighter who drops has 5 s to come back.
//   Betting     spectators back Red or Blue during the warm-up, 50 to 300 coins, pari-mutuel: the
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

/** Where the bout is: waiting for two fighters, the warm-up (bets open), a round, a knockdown's
 *  count, the rest between rounds, the result on the board. */
export type BoutPhase = "open" | "warmup" | "fight" | "count" | "rest" | "result";
/** What a fighter is doing: winding up a punch, guarding, slipping, stunned (a guard break, the
 *  ropes), staggered (parried), down (the count), or out. */
export type FighterState = "" | "windup" | "block" | "sway" | "stun" | "stagger" | "down" | "out";
export type BoxMove = "jab" | "hook" | "uppercut";
/** How a bout ended. */
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

// --- the fighters' gauges ---------------------------------------------------------------------

export const STAMINA_MAX = 100;
/** Stamina back each second (not while guarding or winding up). */
export const STAMINA_REGEN = 15;
export const COMPOSURE_MAX = 100;
/** A swing with less stamina than it costs: this much slower (its wind-up doubled) and this much weaker. */
export const TIRED_SPEED = 0.5;
export const TIRED_DAMAGE = 0.5;

export interface MoveSpec {
  name: string;
  emoji: string;
  /** Seconds from the button to the punch landing. */
  windup: number;
  stamina: number;
  /** Composure taken by a clean hit. */
  damage: number;
  /** How far apart (m, centre to centre) it still reaches. */
  reach: number;
  /** Seconds from one throw to the next. */
  cooldown: number;
  /** How far a clean hit pushes the other fighter back (m). */
  knockback: number;
}
export const MOVES: Record<BoxMove, MoveSpec> = {
  jab: { name: "Jab", emoji: "👊", windup: 0.15, stamina: 8, damage: 6, reach: 1.35, cooldown: 0.35, knockback: 0.15 },
  hook: { name: "Heavy Hook", emoji: "🥊", windup: 0.35, stamina: 18, damage: 15, reach: 1.5, cooldown: 3.5, knockback: 1.1 },
  // the free counter after a Perfect Parry: thrown in place of a jab while the puncher staggers
  uppercut: { name: "Counter Uppercut", emoji: "💥", windup: 0.1, stamina: 0, damage: 18, reach: 1.5, cooldown: 0.35, knockback: 0.5 },
};

export const GUARD = {
  /** Seconds between one guard coming down and the next going up. */
  cooldown: 2.0,
  /** The longest a guard is held (it drops by itself). */
  maxHold: 1.0,
  /** Stamina to raise it, and to hold it (a second). */
  raise: 5,
  drain: 18,
  /** Damage it takes off a punch. */
  mitigate: 0.75,
  /** Stamina a blocked punch knocks out of the guard, per point of the punch's damage. */
  absorb: 1.2,
  /** Raised this soon before a punch lands: a Perfect Parry. */
  parry: 0.15,
} as const;

export const SWAY = {
  cooldown: 2.5,
  /** Seconds of invulnerability from the slip's start. */
  iframes: 0.2,
  /** How far the slip carries you (m). */
  distance: 0.7,
  stamina: 6,
} as const;

/** A guard held until the stamina runs out: stunned this long. */
export const GUARD_BREAK_S = 1.5;
/** Parried: the puncher staggers this long (and the parrier's next jab is a Counter Uppercut). */
export const PARRY_STAGGER_S = 0.6;
/** Bounced off the ropes by a hook: stunned this long, sent back this far. */
export const ROPE_STUN_S = 0.4;
export const ROPE_BOUNCE = 0.45;
/** A hook into the ropes on a fighter with this much composure or less (after the hit) sends them
 *  through: Ring-Out. */
export const RINGOUT_COMPOSURE = 35;
/** A hook's wind-up interrupted by a jab: the hooker is left stunned this long. */
export const INTERRUPT_STUN_S = 0.3;

// --- knockdowns and the count -----------------------------------------------------------------

/** Coach Bruno counts one a second, to ten. */
export const COUNT_TO = 10;
export const COUNT_STEP_S = 1;
/** Taps to get up from the first and second knockdowns (a third is a T.K.O.); they fade away at
 *  TAP_DECAY_PER_S, so it takes a flurry: the first is easy, the second hard. */
export const RECOVER_TAPS = [10, 30] as const;
export const TAP_DECAY_PER_S = 2;
/** Composure back on getting up from the first and second knockdowns. */
export const RECOVER_COMPOSURE = [40, 25] as const;
export const KNOCKDOWNS_TKO = 3;
/** Taps a second the count believes (a macro gets no further). */
export const MAX_TAPS_PER_S = 12;
/** Nobody gets up before this count. */
export const MIN_COUNT_UP = 2;

// --- the bout ---------------------------------------------------------------------------------

export const WARMUP_S = 20;
export const ROUNDS = 3;
export const ROUND_S = 45;
export const REST_S = 6;
/** Composure back between rounds. */
export const REST_COMPOSURE = 15;
export const RESULT_S = 7;
/** A bout decided sooner than this is a No Contest (nothing paid, every bet back). */
export const NO_CONTEST_S = 15;
/** A fighter whose connection drops mid-bout has this long to come back before it is a forfeit. */
export const FORFEIT_GRACE_S = 5;
/** The judges' card: damage dealt, plus this much a knockdown scored. */
export const KNOCKDOWN_POINTS = 20;

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

/** Whether a bout ending this way counts at all (Pillar 4's guard against a fixed fight): it lasted
 *  NO_CONTEST_S, and the loser threw something. */
export function boutCounts(foughtS: number, loserActions: number): boolean {
  return foughtS >= NO_CONTEST_S && loserActions > 0;
}

// --- the gloves -------------------------------------------------------------------------------

export type GloveId = "red" | "tiger";
export const GLOVES: Record<GloveId, { name: string; emoji: string; price: number; note: string; jabCost: number }> = {
  red: { name: "Classic Red Gloves", emoji: "🥊", price: 0, note: "Every fighter's first pair: laced, padded, lucky.", jabCost: 1 },
  tiger: { name: "Tiger Stripe Mitts", emoji: "🐯", price: 850, note: "Orange and black, stitched by hand: jabs cost 10% less stamina.", jabCost: 0.9 },
};
export const GLOVE_IDS = Object.keys(GLOVES) as GloveId[];
export function isGloveId(v: unknown): v is GloveId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(GLOVES, v);
}

/** A move's stamina in these gloves. */
export function moveCost(move: BoxMove, gloves: GloveId): number {
  return move === "jab" ? MOVES.jab.stamina * GLOVES[gloves].jabCost : MOVES[move].stamina;
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
  /** Gloves bought (the Classic Reds are everyone's), and the pair worn into the ring. */
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

/** Client -> server, on the "boxing" channel. `SWAY`'s (dx, dz) is the way to slip, in the world
 *  (none: straight back from the other fighter). */
export type BoxingPacket =
  | { type: "JAB" }
  | { type: "HOOK" }
  | { type: "GUARD"; on: boolean }
  | { type: "SWAY"; dx?: number; dz?: number }
  | { type: "MASH" }
  | { type: "BET"; side: Corner; amount: number }
  | { type: "BUY_GLOVES"; id: GloveId }
  | { type: "WEAR_GLOVES"; id: GloveId }
  | { type: "LEAVE_RING" };

/** One fighter as the room's state carries it (mirrors the server's FighterSchema). */
export interface FighterView {
  sessionId: string;
  name: string;
  stamina: number;
  composure: number;
  state: FighterState;
  knockdowns: number;
  /** Taps toward getting up (while down), and how many it takes. */
  taps: number;
  need: number;
  /** Damage dealt this bout (the judges' card). */
  dealt: number;
  /** The server's clock (epoch ms) when each cooldown is over. */
  hookReady: number;
  guardReady: number;
  swayReady: number;
  /** A Perfect Parry's free counter is on until then (epoch ms). */
  counterUntil: number;
  gloves: GloveId;
  /** Connection dropped: the bout waits (FORFEIT_GRACE_S). */
  away: boolean;
}

/** The bout as the room's state carries it (mirrors the server's BoutSchema). */
export interface BoutView {
  phase: BoutPhase;
  round: number;
  /** When the phase's clock runs out (epoch ms, the server's): the warm-up, the round, the rest,
   *  the result on the board. 0: no clock. */
  until: number;
  /** Where the ten-count is (1..10) while someone is down. */
  count: number;
  red: FighterView;
  blue: FighterView;
  /** Bets on the bout, by session id (encodeBet), and the pools they make. */
  bets: Record<string, string>;
  pools: Pools;
  /** The last bout's result, for the board (a BoutResult as JSON), "" before the first. */
  result: string;
  /** The server's clock (epoch ms) at the last patch: the client measures its skew against it. */
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
  /** How the pools paid out: each bettor's return, by name. */
  payouts: { name: string; side: Corner; stake: number; paid: number }[];
  round: number;
  /** Seconds fought. */
  seconds: number;
}

/** What happened in the ring, told to everyone on the map ("boxEvent") for its effects. */
export type BoxEvent =
  | { kind: "swing"; by: string; move: BoxMove; tired: boolean; windup: number }
  | { kind: "hit"; by: string; to: string; move: BoxMove; damage: number; tired: boolean }
  | { kind: "block"; by: string; to: string; move: BoxMove; damage: number }
  | { kind: "parry"; by: string; to: string }
  | { kind: "whiff"; by: string; to: string; move: BoxMove; slipped: boolean }
  | { kind: "interrupt"; by: string; to: string }
  | { kind: "guardbreak"; to: string }
  | { kind: "sway"; by: string; side: "L" | "R" | "B" }
  | { kind: "ropes"; to: string; side: RopeSide }
  | { kind: "ringout"; to: string; side: RopeSide }
  | { kind: "knockdown"; to: string; knockdowns: number }
  | { kind: "count"; n: number; to: string }
  | { kind: "up"; to: string }
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
  /** When the guard went up (s, the same clock as `at`), while guarding. */
  guardSince: number;
  /** Invulnerable until (s): a slip. */
  slipUntil: number;
  /** Winding up a Heavy Hook of their own. */
  hookWindup: boolean;
  stamina: number;
}

export type StrikeOutcome =
  | { kind: "whiff"; slipped: boolean }
  | { kind: "parry" }
  | { kind: "block"; damage: number; stamina: number; guardBreak: boolean }
  | { kind: "hit"; damage: number; interrupt: boolean };

/**
 * A punch landing at `at` (s) from `distance` (m) away, `tired` or not, on a defender: slipped past,
 * out of reach, parried (the guard went up within GUARD.parry of the landing), blocked (75% less,
 * the guard's stamina knocked down, maybe broken), or a clean hit (a jab on a Heavy Hook's wind-up
 * knocks it out).
 */
export function judgeStrike(move: BoxMove, tired: boolean, distance: number, at: number, d: Defence): StrikeOutcome {
  const spec = MOVES[move];
  if (d.state === "down" || d.state === "out") return { kind: "whiff", slipped: false };
  if (at < d.slipUntil) return { kind: "whiff", slipped: true };
  if (distance > spec.reach) return { kind: "whiff", slipped: false };
  const raw = spec.damage * (tired ? TIRED_DAMAGE : 1);
  if (d.state === "block") {
    if (at - d.guardSince <= GUARD.parry && move !== "uppercut") return { kind: "parry" };
    const stamina = raw * GUARD.absorb;
    return { kind: "block", damage: Math.max(1, Math.round(raw * (1 - GUARD.mitigate))), stamina, guardBreak: d.stamina - stamina <= 0 };
  }
  return { kind: "hit", damage: Math.round(raw), interrupt: move === "jab" && d.hookWindup };
}

/** Which way a slip goes, seen from the fighter facing the other one: left, right or back. */
export function swaySide(facing: { x: number; z: number }, dir: { x: number; z: number }): "L" | "R" | "B" {
  const len = Math.hypot(dir.x, dir.z);
  if (len < 1e-3) return "B";
  const fx = facing.x / (Math.hypot(facing.x, facing.z) || 1);
  const fz = facing.z / (Math.hypot(facing.x, facing.z) || 1);
  const along = (dir.x * fx + dir.z * fz) / len;
  // an avatar facing +z has its left hand at +x (Avatar.tsx), so facing (fx, fz) its right is (-fz, fx)
  const across = (-dir.x * fz + dir.z * fx) / len;
  if (along < -0.5) return "B";
  return across >= 0 ? "R" : "L";
}

/** The judges' card: damage dealt plus KNOCKDOWN_POINTS for every knockdown scored. */
export function cardScore(dealt: number, knockdownsScored: number): number {
  return dealt + knockdownsScored * KNOCKDOWN_POINTS;
}
