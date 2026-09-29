import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import {
  BELT_MS,
  BELT_STREAK,
  BENCH_AFTER_S,
  BET_MAX,
  BET_MIN,
  BOUT_PURSE,
  BUFFER_S,
  CHAIN_WINDOW_S,
  CORNER_NAME,
  COUNTER_WINDOW_S,
  COUNT_STEP_S,
  COUNT_TO,
  DASH,
  FEINT_WINDOW_S,
  FIGHTER_GAP,
  FORFEIT_GRACE_S,
  GLOVES,
  GUARD,
  GUARD_MAX,
  HEALTH_MAX,
  JIMMY_ID,
  JIMMY_NAME,
  KNOCKDOWN_POINTS,
  KNOCKDOWNS_TKO,
  M1_CHAIN,
  MAX_TAPS_PER_S,
  METHOD_LABEL,
  MIN_COUNT_UP,
  MOVES,
  PURSES_PER_HOUR,
  QUEUE_MAX,
  RECOVER_HEALTH,
  RECOVER_TAPS,
  REST_S,
  RESULT_S,
  RINGOUT_HEALTH,
  ROPE_BOUNCE,
  ROPE_STUN_S,
  ROUNDS,
  ROUNDS_TO_WIN,
  ROUND_S,
  SPAR_TIERS,
  SPAR_WARMUP_S,
  STAMINA,
  STAMINA_MAX,
  STRIKE_SLACK,
  TAP_DECAY_PER_S,
  WARMUP_S,
  WHIFF_STAGGER_S,
  boutCounts,
  cardScore,
  dashSide,
  encodeBet,
  isBotTier,
  isCorner,
  isGloveId,
  judgeStrike,
  moveCost,
  moveTiming,
  otherCorner,
  parseBet,
  poolsOf,
  settleBets,
  type BotTier,
  type BoutMethod,
  type BoutPhase,
  type BoutResult,
  type BoxEvent,
  type BoxMove,
  type BoxingPacket,
  type BoxingProfile,
  type Corner,
  type FighterState,
  type GloveId,
  type RopeSide,
  type RoundWinner,
} from "../../../shared/boxing";
import { CHALKBOARD_FRONT, CHALKBOARD_REACH, COACH_FRONT, COACH_REACH, CORNER_REACH, GYM_REACH, HEAVY_BAG_FRONT, JIMMY, JIMMY_FRONT, JIMMY_REACH, NEUTRAL_CORNERS, RING, RING_CORNERS, RING_INNER, SPEED_BAG_FRONT, WEIGH_SCALE_FRONT, clampToRing, onRing, ringOutLanding } from "../../../shared/worlds/boxing_ring";
import { hashString, type Gesture } from "../../../shared/types";

// The Velvet Ring on the server: one bout at a time for the room, judged here and only here (the
// `BoardTable` / `CasinoFloor` pattern: the room hands it its players and a few ways to reach them).
// shared/boxing.ts has the rules; this runs them on the room's clock.
//
// King of the Hill: the corner steps are a queue (`queue`, first in line first). In an open ring
// the first two in line fill the corners and the countdown starts; when a bout ends the winner stays
// in their corner, the loser is walked to the bleachers (the room seats them), and the next in line
// steps in against the winner.
//
// Best of three: a round goes to whoever wins it by K.O. (the ten-count), T.K.O. (a third knockdown
// in it), Ring-Out, or at its bell on the judges' round card (`roundOver`); between rounds both
// fighters go back to their corners patched up to full; the first to ROUNDS_TO_WIN takes the bout.
//
// No cooldowns: a fighter acts whenever they are free (standing, or guarding), and a press in the
// last BUFFER_S of a move, a dash or a hitstun is kept and thrown the moment it ends. Every punch is
// a wind-up, a landing and an endlag: the button starts the wind-up (everyone sees it: a `swing`
// event), the punch is judged the moment it lands (judgeStrike: a Perfect Dodge, out of reach,
// blocked or clean) against where the two fighters stand on the server then, and the fighter is
// free again at the end of its endlag. A guard stays up as long as its button is held (and comes
// back up by itself after a punch, a hitstun or a spell of exhaustion). Landings and endings are
// timed to the millisecond (the host's `later`), and the room's tick settles anything a timer
// missed. The server moves fighters itself (their corner, a knockback, the ropes' bounce, a dash, a
// neutral corner for the count, a ring-out onto the floor) with `place`, which also has the room
// ignore their own position reports for a moment so the move sticks.
//
// Sparring: Jimmy the Slugger (JIMMY_ID) is a fighter with no player behind him: he keeps his own
// position here (`Bot`), and his hands are `botThink` (moving in, circling, strings, the Heavy
// Smash, a feint) and `botReact` (a guard, or a Perfect Dodge, at a reaction time of his setting),
// through the very same moves as anyone. A sparring bout pays no purse, touches no record, takes no
// bets, and whoever sparred him keeps the ring after it; Jimmy goes back to his spot.
//
// Fair play: a fighter whose connection drops has FORFEIT_GRACE_S to come back, the bout frozen
// meanwhile; a bout decided in under NO_CONTEST_S, or whose loser never threw a punch, is a No
// Contest (every bet back, nothing paid, no record touched); a bettor who leaves the room gets their
// stake back at once. Bets are 50 to 300 coins, one ticket a bout, placed during the countdown at
// the ringside chalkboard; the house keeps 5% of the winnings.

/** One fighter, as the room's state carries it (shared/boxing.ts FighterView). */
export class FighterSchema extends Schema {
  @type("string") sessionId = "";
  @type("string") name = "";
  @type("number") health = HEALTH_MAX;
  @type("number") stamina = STAMINA_MAX;
  @type("number") guard = GUARD_MAX;
  @type("string") state: FighterState = "";
  @type("boolean") exhausted = false;
  @type("boolean") counter = false;
  @type("number") knockdowns = 0;
  @type("number") taps = 0;
  @type("number") need = 0;
  @type("number") dealt = 0;
  @type("string") gloves: GloveId = "red";
  @type("boolean") away = false;
  @type("number") reign = 0;
  @type("number") wins = 0;
  /** A sparring bot's setting ("" for a player) and where he stands (a player's position is the
   *  room's own). */
  @type("string") bot = "";
  @type("number") x = 0;
  @type("number") z = 0;
}

/** The bout, as the room's state carries it (shared/boxing.ts BoutView). */
export class BoutSchema extends Schema {
  @type("string") phase: BoutPhase = "open";
  @type("number") round = 0;
  /** Whole seconds left on the phase's clock (the round's while a count runs). */
  @type("number") clock = 0;
  @type("number") count = 0;
  @type(FighterSchema) red = new FighterSchema();
  @type(FighterSchema) blue = new FighterSchema();
  /** Bets on the bout by session id (shared/boxing.ts encodeBet). */
  @type({ map: "string" }) bets = new MapSchema<string>();
  @type("number") poolRed = 0;
  @type("number") poolBlue = 0;
  /** The last bout's BoutResult as JSON, for the chalkboard ("" before the first). */
  @type("string") result = "";
  /** Who is waiting for the ring (session ids), first in line first. */
  @type(["string"]) queue = new ArraySchema<string>();
  /** Who took each round so far ("red,draw,..."). */
  @type("string") rounds = "";
  /** A sparring bout's setting ("" for a real bout). */
  @type("string") spar = "";
}

/** What the ring needs of a player. */
export interface RingPlayer {
  userId: string;
  username: string;
  map: string;
  x: number;
  z: number;
  sitting: boolean;
  action: string;
  coins: number;
  connected: boolean;
  corner: string;
  gloves: string;
  holding: string;
}

export interface RingHost {
  player(sessionId: string): RingPlayer | undefined;
  /** To everyone on the Velvet Ring's map. */
  toMap(type: string, payload: unknown): void;
  /** To everyone in the room, whatever world (a belt won). */
  shout(type: string, payload: unknown): void;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  /** Put a player at (x, z) (a corner, a knockback, a dash) and ignore their own position reports
   *  for `holdMs`, so the move sticks. */
  place(sessionId: string, x: number, z: number, holdMs: number): void;
  gesture(sessionId: string, gesture: Gesture): void;
  emote(sessionId: string, emoji: string): void;
  addCoins(sessionId: string, amount: number): void;
  /** Their fighter's record (kept with the account), and a word that it changed (mirror it to the
   *  player and save it now). */
  profile(sessionId: string): BoxingProfile | undefined;
  saveProfile(sessionId: string): void;
  /** A bout won: the stats (a knockout's), the day's checklist. */
  tally(sessionId: string, knockout: boolean): void;
  /** Run `fn` in `ms` (a punch landing, a move's end): the room's clock. */
  later(ms: number, fn: () => void): void;
  /** Stand a seated player up (called into the ring from the bleachers). */
  unseat(sessionId: string): void;
  /** Walk a beaten fighter off to the ringside bleachers (a free seat there, or the floor in
   *  front of them). */
  bench(sessionId: string): void;
}

/** A press kept for the moment the fighter is free again. */
type Buffered = { kind: "m1" } | { kind: "m2" } | { kind: "dash"; dx: number; dz: number };

/** A sparring bot's body and mind: where he stands, and what he means to do next. */
interface Bot {
  tier: BotTier;
  x: number;
  z: number;
  /** The next moment he may start something of his own (ms). */
  next: number;
  /** M1s still to throw of the string he started. */
  combo: number;
  /** The way he circles (+1 / -1), and until when. */
  circle: number;
  circleUntil: number;
  /** His next tap on the canvas, while down (ms). */
  mashNext: number;
  /** When his own M2's wind-up is to be pulled back (a feint), 0 for none. */
  feintAt: number;
  /** Until when his hands wait (a dodge or a guard planned against a punch on its way), ms. */
  holdUntil: number;
}

/** How each of Jimmy's settings fights: his pace (m/s), how long he thinks between openings (s),
 *  the length of his strings, how often he reaches for the M2 (and feints it), his guard and his
 *  reaction time (s), how often he Perfect Dodges a punch slow enough to see, when he backs off to
 *  breathe (stamina), and his taps a second on the canvas. */
const BOT_SKILL: Record<BotTier, { speed: number; think: [number, number]; string: [number, number]; smash: number; feint: number; guard: number; reaction: number; dodge: number; breathe: number; mash: number; idle: number }> = {
  rookie: { speed: 1.4, think: [1.1, 1.9], string: [1, 1], smash: 0, feint: 0, guard: 0.12, reaction: 0.34, dodge: 0, breathe: 0, mash: 6, idle: 0.3 },
  contender: { speed: 2.1, think: [0.55, 0.95], string: [2, 3], smash: 0.14, feint: 0, guard: 0.45, reaction: 0.22, dodge: 0, breathe: 25, mash: 9, idle: 0.1 },
  champion: { speed: 2.5, think: [0.35, 0.6], string: [2, 3], smash: 0.2, feint: 0.35, guard: 0.5, reaction: 0.16, dodge: 0.5, breathe: 30, mash: 11, idle: 0 },
};

interface Fighter {
  sessionId: string;
  corner: Corner;
  name: string;
  health: number;
  stamina: number;
  guard: number;
  state: FighterState;
  /** When a timed state (a punch's endlag, a dash, a hitstun, a daze, a stagger) is over (ms). */
  stateUntil: number;
  /** The punch on its way: when it was thrown and when it lands (ms). */
  pending: { move: BoxMove; started: number; at: number; counter: boolean } | null;
  /** The next punch of the M1 string (0..2), while the string's window is open (ms). */
  chain: number;
  chainUntil: number;
  buffered: Buffered | null;
  /** The guard button is held (a guard goes back up by itself after a punch, a hitstun, a daze or
   *  a spell of exhaustion). */
  guardHeld: boolean;
  exhausted: boolean;
  /** The last punch, dash or second of guarding (ms): stamina comes back STAMINA.idle after it. */
  actedAt: number;
  /** The last punch into the guard (ms): the meter refills GUARD.regenDelay after it. */
  guardHitAt: number;
  dashAt: number;
  /** A Perfect Dodge's Counter is ready until then (ms). */
  counterUntil: number;
  /** Shadowboxing in the countdown: the next swing or dash waits till then (ms). */
  shadowUntil: number;
  /** Knockdowns this round (KNOCKDOWNS_TKO is a T.K.O.), and over the whole bout (the card). */
  knockdowns: number;
  knockdownsBout: number;
  taps: number;
  tapTimes: number[];
  /** Damage dealt over the bout (the card), and this round (the round's card). */
  dealt: number;
  roundDealt: number;
  /** Rounds won this bout. */
  wins: number;
  /** Punches thrown this bout (a loser with none: a No Contest). */
  strikes: number;
  gloves: GloveId;
  away: boolean;
  awayAt: number;
  /** Bouts won in a row on this hill. */
  reign: number;
  /** A sparring bot's body and mind (null: a player). */
  bot: Bot | null;
}

/** A server-authored move holds this long against the fighter's own reports. */
const PLACE_MS = { corner: 800, knock: 280, dash: 220 };
/** How far past a prop's reach the server allows, for lag. */
const REACH_SLACK = 1.2;
/** Between two goes on a gym fixture (per player). */
const GYM_COOLDOWN_MS = 2600;
const HOUR_MS = 60 * 60 * 1000;
const NEVER = -1e15;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function newFighter(sessionId: string, corner: Corner, name: string, gloves: GloveId): Fighter {
  return {
    sessionId,
    corner,
    name,
    health: HEALTH_MAX,
    stamina: STAMINA_MAX,
    guard: GUARD_MAX,
    state: "",
    stateUntil: 0,
    pending: null,
    chain: 0,
    chainUntil: 0,
    buffered: null,
    guardHeld: false,
    exhausted: false,
    actedAt: 0,
    guardHitAt: 0,
    dashAt: NEVER,
    counterUntil: 0,
    shadowUntil: 0,
    knockdowns: 0,
    knockdownsBout: 0,
    taps: 0,
    tapTimes: [],
    dealt: 0,
    roundDealt: 0,
    wins: 0,
    strikes: 0,
    gloves,
    away: false,
    awayAt: 0,
    reign: 0,
    bot: null,
  };
}

/** A fighter fresh for a moment of the bout (the bell, a count beaten): full stamina and guard,
 *  nothing in hand (the guard back up if its button is held). */
function freshen(f: Fighter, now: number) {
  f.stamina = STAMINA_MAX;
  f.guard = GUARD_MAX;
  f.exhausted = false;
  f.state = f.guardHeld ? "block" : "";
  f.stateUntil = 0;
  f.pending = null;
  f.chain = 0;
  f.chainUntil = 0;
  f.buffered = null;
  f.actedAt = now;
  f.guardHitAt = 0;
  f.dashAt = NEVER;
  f.counterUntil = 0;
  f.taps = 0;
  f.tapTimes = [];
}

/** A fighter fresh for a round: patched up to full, the round's knockdowns and card cleared. */
function freshRound(f: Fighter, now: number) {
  freshen(f, now);
  f.health = HEALTH_MAX;
  f.knockdowns = 0;
  f.roundDealt = 0;
}

/** A fighter fresh for a whole bout. */
function freshBout(f: Fighter, now: number) {
  freshRound(f, now);
  f.wins = 0;
  f.dealt = 0;
  f.strikes = 0;
  f.knockdownsBout = 0;
}

/** Weight classes for the balance-beam scale. */
const WEIGHT_CLASSES: [number, string][] = [
  [57, "Featherweight"],
  [61, "Lightweight"],
  [67, "Welterweight"],
  [73, "Middleweight"],
  [80, "Light Heavyweight"],
  [Infinity, "Heavyweight"],
];

const BUSY: ReadonlySet<FighterState> = new Set<FighterState>(["attack", "dash", "hurt", "stun", "stagger"]);

export class BoxingRing {
  private phase: BoutPhase = "open";
  private round = 0;
  /** When the phase's clock runs out (ms); the round's time left while a count runs. */
  private phaseEnd = 0;
  private roundLeft = 0;
  private firstBell = 0;
  private countAt = 0;
  private count = 0;
  private downed: Corner | null = null;
  private readonly fighters: Partial<Record<Corner, Fighter>> = {};
  /** Who took each round of this bout. */
  private readonly roundLog: RoundWinner[] = [];
  /** Waiting for the ring, first in line first, each with the corner whose steps they joined at. */
  private readonly queue: { sessionId: string; corner: Corner }[] = [];
  /** The result on the board: the corner that holds the ring after it (null: both step down), and
   *  the beaten fighter to walk to the bleachers at `benchAt`. */
  private stayer: Corner | null = null;
  private loserId: string | null = null;
  /** The corner that threw in the towel (this bout's result): out of the ring after it, even in a spar. */
  private conceded: Corner | null = null;
  private benchAt = 0;
  /** The tickets on this bout: sessionId -> encodeBet, and the bettors' names (for the payouts). */
  private readonly bets = new Map<string, string>();
  private readonly betNames = new Map<string, string>();
  private readonly gymAt = new Map<string, number>();

  constructor(
    private readonly bout: BoutSchema,
    private readonly host: RingHost
  ) {}

  // --- who is where -------------------------------------------------------------------------------

  /** The corner a session fights from (in the ring, or just launched out of it). */
  cornerOf(sessionId: string): Corner | null {
    for (const c of ["red", "blue"] as const) if (this.fighters[c]?.sessionId === sessionId) return c;
    return null;
  }

  private fighterOf(sessionId: string): Fighter | undefined {
    const c = this.cornerOf(sessionId);
    return c ? this.fighters[c] : undefined;
  }

  /** Whether a fighter's own position reports are to be ignored (down on the canvas, out). */
  pinned(sessionId: string): boolean {
    const f = this.fighterOf(sessionId);
    return !!f && (f.state === "down" || f.state === "out");
  }

  /** Where a fighter stands: a player's own position, or a bot's. */
  private at(f: Fighter): { x: number; z: number } | null {
    if (f.bot) return { x: f.bot.x, z: f.bot.z };
    const p = this.host.player(f.sessionId);
    return p ? { x: p.x, z: p.z } : null;
  }

  /** Move a fighter (a player through the room, a bot here). */
  private put(f: Fighter, x: number, z: number, holdMs: number) {
    if (f.bot) {
      f.bot.x = x;
      f.bot.z = z;
    } else this.host.place(f.sessionId, x, z, holdMs);
  }

  /** The sparring bout's setting, while Jimmy is one of the fighters. */
  private sparTier(): BotTier | null {
    return this.fighters.red?.bot?.tier ?? this.fighters.blue?.bot?.tier ?? null;
  }

  // --- the props --------------------------------------------------------------------------------------

  /** A Velvet Ring prop used (the room has checked the map and the reach). */
  useProp(sessionId: string, propId: string) {
    const p = this.host.player(sessionId);
    if (!p || p.map !== "boxing_ring") return;
    if (p.corner) return; // in the ring, only the ring
    switch (propId) {
      case "ring_red":
      case "ring_blue":
        this.queueUp(sessionId, propId === "ring_red" ? "red" : "blue");
        return;
      case "ring_chalkboard":
        this.host.sendTo(sessionId, "openPanel", { kind: "ringside", propId });
        return;
      case "coach_bruno":
        this.host.sendTo(sessionId, "openPanel", { kind: "proshop", propId });
        this.host.toMap("ringProp", { kind: "coach", sessionId });
        return;
      case "ring_jimmy":
        this.host.sendTo(sessionId, "openPanel", { kind: "spar", propId });
        return;
      case "heavy_bag":
      case "speed_bag":
      case "weigh_scale":
        this.gym(sessionId, p, propId);
        return;
    }
  }

  private gym(sessionId: string, p: RingPlayer, propId: string) {
    const front = propId === "heavy_bag" ? HEAVY_BAG_FRONT : propId === "speed_bag" ? SPEED_BAG_FRONT : WEIGH_SCALE_FRONT;
    if (p.sitting || Math.hypot(p.x - front.x, p.z - front.z) > GYM_REACH + REACH_SLACK) return;
    const now = Date.now();
    if (now - (this.gymAt.get(sessionId) ?? 0) < GYM_COOLDOWN_MS) return;
    this.gymAt.set(sessionId, now);
    if (propId === "weigh_scale") {
      // a weigh-in: the balance beam settles on a weight of your own (always the same one) and the
      // record the hall knows you by
      const kg = 52 + (hashString(p.userId || p.username) % 380) / 10;
      const cls = WEIGHT_CLASSES.find(([under]) => kg < under)![1];
      const r = this.host.profile(sessionId);
      const record = r ? `${r.wins}-${r.losses}${r.streak > 1 ? `, ${r.streak} wins in a row` : ""}` : "0-0";
      this.host.toMap("ringProp", { kind: "scale", sessionId });
      this.host.emote(sessionId, "⚖️");
      this.host.sendTo(sessionId, "boxNotice", { message: `You weigh in at ${kg.toFixed(1)} kg: ${cls}. Record ${record}`, emoji: "⚖️" });
      return;
    }
    this.host.gesture(sessionId, "bag");
    this.host.toMap("ringProp", { kind: propId === "heavy_bag" ? "heavybag" : "speedbag", sessionId });
  }

  // --- the queue, stepping in and out --------------------------------------------------------------

  /** At a corner's steps: into the line for the ring (out of it again, already in it). In an open
   *  ring the line moves at once: a free corner is yours straight away. */
  private queueUp(sessionId: string, corner: Corner) {
    const p = this.host.player(sessionId);
    if (!p || this.cornerOf(sessionId)) return;
    const steps = RING_CORNERS[corner];
    if (Math.min(Math.hypot(p.x - steps.foot.x, p.z - steps.foot.z), Math.hypot(p.x - steps.steps.x, p.z - steps.steps.z)) > CORNER_REACH + REACH_SLACK) return;
    const at = this.queue.findIndex((q) => q.sessionId === sessionId);
    if (at >= 0) {
      this.queue.splice(at, 1);
      this.notice(sessionId, "You stepped out of the line for the ring", "🚶");
      this.sync();
      return;
    }
    if (p.sitting || p.action !== "") return this.notice(sessionId, "Finish what you're doing first", "🥊");
    if (this.queue.length >= QUEUE_MAX) return this.notice(sessionId, `The line for the ring is full (${QUEUE_MAX}): grab a seat and watch one`, "🎟️");
    this.queue.push({ sessionId, corner });
    if (this.phase === "open") this.fill(Date.now());
    const place = this.queue.findIndex((q) => q.sessionId === sessionId);
    if (place >= 0) this.host.sendTo(sessionId, "boxNotice", { message: `You're #${place + 1} in line for the ring: the winner stays on, the next one steps in`, emoji: "🎟️", ok: true });
    this.sync();
  }

  /** Out of the line (`tell`: they asked). */
  private unqueue(sessionId: string, tell: boolean) {
    const at = this.queue.findIndex((q) => q.sessionId === sessionId);
    if (at < 0) return;
    this.queue.splice(at, 1);
    if (tell) this.notice(sessionId, "You stepped out of the line for the ring", "🚶");
    this.sync();
  }

  /** An open ring takes the next in line into each free corner (their own corner if it is free);
   *  both corners filled, the countdown starts and the betting opens. */
  private fill(now: number) {
    if (this.phase !== "open") return;
    while (this.queue.length > 0 && (!this.fighters.red || !this.fighters.blue)) {
      const q = this.queue.shift()!;
      const p = this.host.player(q.sessionId);
      if (!p || !p.connected || p.map !== "boxing_ring" || this.cornerOf(q.sessionId)) continue;
      this.stepIn(q.sessionId, p, this.fighters[q.corner] ? otherCorner(q.corner) : q.corner, now);
    }
    if (this.fighters.red && this.fighters.blue) this.countdown(now, WARMUP_S);
    this.sync();
  }

  /** Both corners filled: the countdown to the first bell (the betting open, a real bout's only). */
  private countdown(now: number, seconds: number) {
    this.phase = "warmup";
    this.round = 0;
    this.phaseEnd = now + seconds * 1000;
    this.roundLog.length = 0;
    this.clearBets();
    for (const f of [this.fighters.red, this.fighters.blue]) {
      if (!f) continue;
      freshBout(f, now);
      const at = RING_CORNERS[f.corner].inside;
      this.put(f, at.x, at.z, PLACE_MS.corner);
    }
  }

  /** Up the steps into `corner`: the gloves on (their own pair, in the corner's colour if Classic). */
  private stepIn(sessionId: string, p: RingPlayer, corner: Corner, now: number, quiet = false) {
    if (p.sitting) this.host.unseat(sessionId);
    const profile = this.host.profile(sessionId);
    const gloves: GloveId = profile && isGloveId(profile.worn) ? profile.worn : "red";
    const f = newFighter(sessionId, corner, p.username, gloves);
    f.actedAt = now;
    this.fighters[corner] = f;
    p.corner = corner;
    p.gloves = gloves;
    p.holding = "";
    const at = RING_CORNERS[corner].inside;
    this.host.place(sessionId, at.x, at.z, PLACE_MS.corner);
    this.event({ kind: "enter", by: sessionId, corner });
    const foe = this.fighters[otherCorner(corner)];
    if (!quiet) this.host.sendTo(sessionId, "boxNotice", { message: foe ? `You're up! Into the ${CORNER_NAME[corner]} against ${foe.name}` : `Into the ${CORNER_NAME[corner]}: waiting for a challenger`, emoji: "🥊", ok: true });
  }

  /** Jimmy the Slugger called in (from beside him, or by the fighter waiting alone in the ring): he
   *  climbs into the free corner and a sparring bout's short countdown starts. */
  private spar(sessionId: string, tier: unknown, now: number) {
    if (!isBotTier(tier)) return;
    const p = this.host.player(sessionId);
    if (!p || p.map !== "boxing_ring") return;
    if (this.cornerOf(JIMMY_ID)) return this.notice(sessionId, `${JIMMY_NAME} is already in the ring`, "🥊");
    const mine = this.cornerOf(sessionId);
    if (mine) {
      if (this.phase !== "open" || this.fighters[otherCorner(mine)]) return this.notice(sessionId, "Jimmy spars when the ring is yours alone", "🥊");
      if (this.queue.length > 0) return this.notice(sessionId, "Someone's waiting in line: they step in first", "🎟️");
    } else {
      if (Math.hypot(p.x - JIMMY_FRONT.x, p.z - JIMMY_FRONT.z) > JIMMY_REACH + REACH_SLACK) return;
      if (this.phase !== "open" || this.fighters.red || this.fighters.blue || this.queue.length > 0) return this.notice(sessionId, "The ring's busy: Jimmy spars when it's free (or get in line at a corner)", "🥊");
      if (p.sitting || p.action !== "") return this.notice(sessionId, "Finish what you're doing first", "🥊");
      this.unqueue(sessionId, false);
      this.stepIn(sessionId, p, "red", now, true); // (Jimmy's own notice follows)
    }
    const corner = otherCorner(this.cornerOf(sessionId)!);
    const jimmy = newFighter(JIMMY_ID, corner, JIMMY_NAME, "red");
    jimmy.bot = { tier, x: JIMMY.x, z: JIMMY.z, next: 0, combo: 0, circle: Math.random() < 0.5 ? 1 : -1, circleUntil: 0, mashNext: 0, feintAt: 0, holdUntil: 0 };
    this.fighters[corner] = jimmy;
    this.event({ kind: "enter", by: JIMMY_ID, corner });
    this.countdown(now, SPAR_WARMUP_S);
    this.host.sendTo(sessionId, "boxNotice", { message: `${JIMMY_NAME} (${SPAR_TIERS[tier].name}) climbs in: best of three, no purse, no record`, emoji: SPAR_TIERS[tier].emoji, ok: true });
    this.sync();
  }

  /**
   * A fighter going (back down the steps, off to another world, gone from the room): before the
   * bell the bets come back and the other waits on for the next in line; mid-bout it is a forfeit
   * (the one who stays holds the ring). A bettor gone from the room gets their stake back; anyone
   * in line gives up their place. Jimmy never holds the ring alone: whoever sparred him leaving,
   * he goes too.
   */
  leave(sessionId: string, why: "ring" | "travel" | "gone") {
    this.unqueue(sessionId, false);
    if (why === "gone") this.refundBet(sessionId);
    const corner = this.cornerOf(sessionId);
    if (!corner) return;
    const now = Date.now();
    if (this.phase === "open" || this.phase === "warmup") {
      if (this.phase === "warmup") {
        this.refundAll();
        this.phase = "open";
      }
      delete this.fighters[corner];
      this.release(sessionId, corner);
      this.event({ kind: "leave", by: sessionId, corner });
      this.sendJimmyHome();
      this.fill(now);
    } else if (this.phase === "result") {
      if (this.stayer === corner) this.stayer = null;
      if (this.loserId === sessionId) this.loserId = null;
      delete this.fighters[corner];
      this.release(sessionId, corner);
      this.event({ kind: "leave", by: sessionId, corner });
    } else {
      // mid-bout: a forfeit (a T.K.O. for the one who stays); they walk down the steps themselves
      this.fighters[corner]!.away = false;
      this.end("forfeit", otherCorner(corner), now);
      if (this.loserId === sessionId) this.loserId = null;
      if (this.stayer === corner) this.stayer = null;
      delete this.fighters[corner];
      this.release(sessionId, corner);
      this.event({ kind: "leave", by: sessionId, corner });
    }
    this.sync();
  }

  /** Thrown in the towel: mid-bout (a round, a count, the rest between rounds), a T.K.O. conceded on
   *  the spot, the round and the bout to the other corner, and the one who threw it walks out after
   *  the result (benched like any loser; in a spar, down the steps, Jimmy home). Before the bell it
   *  is a plain step down; after the result, the same. */
  private towel(sessionId: string, now: number) {
    const corner = this.cornerOf(sessionId);
    if (!corner) return;
    if (this.phase !== "fight" && this.phase !== "count" && this.phase !== "rest") return this.leave(sessionId, "ring");
    const other = otherCorner(corner);
    const winner = this.fighters[other];
    if (!winner) return this.leave(sessionId, "ring");
    this.conceded = corner;
    this.roundLog.push(other);
    winner.wins++;
    this.event({ kind: "towel", by: sessionId, corner });
    this.event({ kind: "round", round: Math.max(1, this.round), winner: other, method: "tko" });
    this.event({ kind: "bell", round: Math.max(1, this.round), ring: "end" });
    this.end("tko", other, now);
    this.sync();
  }

  /** Jimmy left alone in the ring (whoever sparred him gone): back to his spot. */
  private sendJimmyHome() {
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f?.bot || this.fighters[otherCorner(c)]) continue;
      delete this.fighters[c];
      this.event({ kind: "leave", by: f.sessionId, corner: c });
      if (this.phase === "warmup") this.phase = "open";
    }
  }

  /** Out of the ring: the gloves come off, and anyone still standing on it (in the hall) is set
   *  down at the foot of their corner's steps (a spectator never stands on the ring). */
  private release(sessionId: string, corner: Corner) {
    const p = this.host.player(sessionId);
    if (!p) return;
    p.corner = "";
    p.gloves = "";
    if (p.map === "boxing_ring" && onRing(p.x, p.z)) {
      const foot = RING_CORNERS[corner].foot;
      this.host.place(sessionId, foot.x, foot.z, PLACE_MS.corner);
    }
  }

  /** The beaten fighter, walked off to the ringside bleachers (the ring is the winner's). */
  private benchLoser() {
    const id = this.loserId;
    this.loserId = null;
    if (!id) return;
    const corner = this.cornerOf(id);
    if (corner) delete this.fighters[corner];
    const p = this.host.player(id);
    if (!p) return;
    p.corner = "";
    p.gloves = "";
    if (p.map === "boxing_ring") this.host.bench(id);
    if (corner) this.event({ kind: "leave", by: id, corner });
  }

  /** The server is going down (a deploy, a restart): whatever bout is on stops as a No Contest (no
   *  record touched, every ticket back in coins), before anyone is let go and counted a forfeit. */
  abandon() {
    this.queue.length = 0;
    if (this.phase === "open" || this.phase === "result") {
      if (this.phase === "result") this.clearRing();
      return;
    }
    const now = Date.now();
    if (this.phase === "warmup") this.refundAll();
    // (no winner: every ticket comes back)
    else this.end("nocontest", null, now);
    this.clearRing();
    this.sync();
  }

  /** A fighter's connection dropped: mid-bout the bout waits FORFEIT_GRACE_S for them; otherwise
   *  they give up their corner at once. */
  dropped(sessionId: string) {
    const f = this.fighterOf(sessionId);
    if (!f || f.bot) return;
    if (this.phase === "fight" || this.phase === "count" || this.phase === "rest") {
      f.away = true;
      f.awayAt = Date.now();
      f.pending = null;
      f.buffered = null;
      f.guardHeld = false;
      if (f.state === "block" || f.state === "attack" || f.state === "dash") f.state = "";
      this.event({ kind: "away", by: sessionId, back: false });
      this.sync();
    } else this.leave(sessionId, "ring");
  }

  /** Back in time: the bout goes on. */
  back(sessionId: string) {
    const f = this.fighterOf(sessionId);
    if (!f || !f.away) return;
    f.away = false;
    this.event({ kind: "away", by: sessionId, back: true });
    this.sync();
  }

  /** The same person back on a new session (the room's takeOver): their corner, place in line and
   *  ticket move over. */
  transfer(oldId: string, newId: string) {
    const f = this.fighterOf(oldId);
    if (f) {
      f.sessionId = newId;
      f.away = false;
      const p = this.host.player(newId);
      if (p) {
        p.corner = f.corner;
        p.gloves = f.gloves;
      }
    }
    if (this.loserId === oldId) this.loserId = newId;
    for (const q of this.queue) if (q.sessionId === oldId) q.sessionId = newId;
    const bet = this.bets.get(oldId);
    if (bet) {
      this.bets.delete(oldId);
      this.bets.set(newId, bet);
      const name = this.betNames.get(oldId);
      this.betNames.delete(oldId);
      if (name) this.betNames.set(newId, name);
    }
    this.sync();
  }

  // --- the fighters' and the bettors' packets ----------------------------------------------------------

  packet(sessionId: string, packet: BoxingPacket) {
    if (!packet || typeof packet !== "object" || typeof packet.type !== "string") return;
    const now = Date.now();
    switch (packet.type) {
      case "M1":
      case "M2":
        return this.attack(sessionId, packet.type === "M2" ? "m2" : "m1", now);
      case "GUARD":
        return this.guard(sessionId, packet.on === true, now);
      case "DASH":
        return this.dash(sessionId, Number(packet.dx) || 0, Number(packet.dz) || 0, now);
      case "MASH":
        return this.mash(sessionId, now);
      case "BET":
        return this.bet(sessionId, packet.side, packet.amount);
      case "BUY_GLOVES":
        return this.buyGloves(sessionId, packet.id);
      case "WEAR_GLOVES":
        return this.wearGloves(sessionId, packet.id);
      case "LEAVE_RING":
        return this.leave(sessionId, "ring");
      case "LEAVE_QUEUE":
        return this.unqueue(sessionId, true);
      case "SPAR":
        return this.spar(sessionId, packet.tier, now);
      case "TOWEL":
        return this.towel(sessionId, now);
    }
  }

  /** Free to act: standing, or guarding (a punch or a dash drops the guard). */
  private free(f: Fighter): boolean {
    return !f.away && (f.state === "" || f.state === "block");
  }

  /** A press while busy: kept for the moment the move (or the hitstun) ends, if that is near. */
  private buffer(f: Fighter, press: Buffered, now: number) {
    if (BUSY.has(f.state) && f.stateUntil - now <= BUFFER_S * 1000) f.buffered = press;
  }

  private attack(sessionId: string, kind: "m1" | "m2", now: number) {
    const f = this.fighterOf(sessionId);
    if (!f || f.away) return;
    if (this.phase === "warmup") return this.shadow(f, kind, now);
    if (this.phase !== "fight") return;
    this.step(now);
    if (!this.free(f)) return this.buffer(f, { kind }, now);
    this.throwPunch(f, kind, now);
    this.sync();
  }

  /** The countdown's shadowboxing: everyone sees the punch, nothing lands, nothing is spent. */
  private shadow(f: Fighter, kind: "m1" | "m2", now: number) {
    if (now < f.shadowUntil) return;
    const step = now <= f.chainUntil ? f.chain : 0;
    const move: BoxMove = kind === "m2" ? "smash" : M1_CHAIN[step];
    const { windup, total } = moveTiming(move, false);
    f.shadowUntil = now + total * 1000;
    f.chain = kind === "m2" ? 0 : (step + 1) % M1_CHAIN.length;
    f.chainUntil = f.shadowUntil + CHAIN_WINDOW_S * 1000;
    this.event({ kind: "swing", by: f.sessionId, move, tired: false, counter: false, windup, total, shadow: true });
  }

  /** The punch: the next of the M1 string (a Counter's uppercut after a Perfect Dodge), or the M2. */
  private throwPunch(f: Fighter, kind: "m1" | "m2", now: number) {
    const counter = now < f.counterUntil;
    let move: BoxMove;
    let step = 0;
    if (kind === "m2") move = "smash";
    else if (counter) move = "uppercut";
    else {
      step = now <= f.chainUntil ? f.chain : 0;
      move = M1_CHAIN[step];
    }
    const tired = f.exhausted;
    const { windup, total } = moveTiming(move, tired);
    this.spend(f, moveCost(move, f.gloves), now);
    f.pending = { move, started: now, at: now + windup * 1000, counter };
    f.state = "attack";
    f.stateUntil = now + total * 1000;
    f.actedAt = now;
    f.strikes++;
    if (counter) f.counterUntil = 0;
    if (M1_CHAIN.includes(move)) {
      f.chain = (step + 1) % M1_CHAIN.length;
      f.chainUntil = f.stateUntil + CHAIN_WINDOW_S * 1000;
    } else {
      f.chain = 0;
      f.chainUntil = 0;
    }
    this.event({ kind: "swing", by: f.sessionId, move, tired, counter, windup, total, shadow: false });
    this.wake(windup * 1000);
    this.wake(total * 1000);
    // Jimmy sees it coming (at his reaction time)
    const foe = this.fighters[otherCorner(f.corner)];
    if (foe?.bot) this.botReact(foe, f.pending.at, now);
  }

  /** Stamina spent: run dry, Exhausted (the guard drops). */
  private spend(f: Fighter, cost: number, now: number) {
    f.stamina = Math.max(0, f.stamina - cost);
    f.actedAt = now;
    if (f.stamina <= 0 && !f.exhausted) {
      f.exhausted = true;
      if (f.state === "block") f.state = "";
      this.event({ kind: "exhausted", to: f.sessionId });
    }
  }

  /** The guard's button: held, the guard stays up (for as long as it is held: only a Guard Break or
   *  running dry takes it down); let go, it drops. Early in an M2's wind-up it is the Feint. */
  private guard(sessionId: string, on: boolean, now: number) {
    const f = this.fighterOf(sessionId);
    if (!f || f.away) return;
    if (this.phase !== "fight" && this.phase !== "warmup") {
      f.guardHeld = on;
      return;
    }
    f.guardHeld = on;
    if (this.phase === "fight") this.step(now);
    if (on) {
      // guarding early in the M2's wind-up pulls it back: a Feint (half its stamina back)
      if (this.phase === "fight" && f.state === "attack" && f.pending?.move === "smash" && now - f.pending.started <= FEINT_WINDOW_S * 1000) {
        f.pending = null;
        f.state = "";
        f.stateUntil = 0;
        f.buffered = null;
        f.stamina = Math.min(STAMINA_MAX, f.stamina + MOVES.smash.stamina / 2);
        if (f.exhausted && f.stamina >= STAMINA.recover) f.exhausted = false;
        this.event({ kind: "feint", by: sessionId });
        this.sync();
        return;
      }
      if (f.state === "" && !f.exhausted) {
        f.state = "block";
        f.actedAt = now;
      }
    } else if (f.state === "block") {
      f.state = "";
      f.actedAt = now;
    }
    this.sync();
  }

  private dash(sessionId: string, dx: number, dz: number, now: number) {
    const f = this.fighterOf(sessionId);
    if (!f || f.away) return;
    if (this.phase === "warmup") {
      if (now < f.shadowUntil) return;
      f.shadowUntil = now + DASH.time * 1000 + 120;
      this.slide(f, dx, dz, now, true);
      return;
    }
    if (this.phase !== "fight") return;
    this.step(now);
    if (!this.free(f)) return this.buffer(f, { kind: "dash", dx, dz }, now);
    if (f.exhausted) return;
    this.slide(f, dx, dz, now, false);
    this.sync();
  }

  /** The dash itself: DASH.distance the way asked (straight back from the other fighter, asked
   *  none), never through them, inside the ropes. */
  private slide(f: Fighter, dx: number, dz: number, now: number, shadow: boolean) {
    const me = this.at(f);
    if (!me) return;
    const foe = this.fighters[otherCorner(f.corner)];
    const them = foe ? this.at(foe) : null;
    const facing = them ? { x: them.x - me.x, z: them.z - me.z } : { x: 0, z: -1 };
    let dir = { x: dx, z: dz };
    const len = Math.hypot(dir.x, dir.z);
    if (!Number.isFinite(len) || len < 0.05) {
      const fl = Math.hypot(facing.x, facing.z) || 1;
      dir = { x: -facing.x / fl, z: -facing.z / fl };
    } else dir = { x: dir.x / len, z: dir.z / len };
    const side = dashSide(facing, dir);
    let to = clampToRing(me.x + dir.x * DASH.distance, me.z + dir.z * DASH.distance);
    if (them) {
      // never into (or through) the other fighter: stopped at arm's length
      const ox = to.x - them.x;
      const oz = to.z - them.z;
      const d = Math.hypot(ox, oz);
      if (d < FIGHTER_GAP) {
        const along = Math.hypot(them.x - me.x, them.z - me.z) - FIGHTER_GAP;
        to = side === "F" ? clampToRing(me.x + dir.x * Math.max(0, along), me.z + dir.z * Math.max(0, along)) : d > 1e-3 ? clampToRing(them.x + (ox / d) * FIGHTER_GAP, them.z + (oz / d) * FIGHTER_GAP) : { x: me.x, z: me.z };
      }
    }
    this.put(f, to.x, to.z, PLACE_MS.dash);
    if (!shadow) {
      if (f.state === "block") f.state = "";
      this.spend(f, DASH.stamina, now);
      f.state = "dash";
      f.stateUntil = now + DASH.time * 1000;
      f.dashAt = now;
      this.wake(DASH.time * 1000);
    }
    this.event({ kind: "dash", by: f.sessionId, side, shadow });
  }

  private mash(sessionId: string, now: number) {
    if (this.phase !== "count") return;
    const corner = this.cornerOf(sessionId);
    if (!corner || corner !== this.downed) return;
    const f = this.fighters[corner]!;
    f.tapTimes = f.tapTimes.filter((t) => now - t < 1000);
    if (f.tapTimes.length >= MAX_TAPS_PER_S) return;
    f.tapTimes.push(now);
    f.taps = Math.min(f.taps + 1, 99);
    this.sync();
  }

  private bet(sessionId: string, side: unknown, raw: unknown) {
    const p = this.host.player(sessionId);
    if (!p || p.map !== "boxing_ring") return;
    if (this.sparTier()) return this.notice(sessionId, "A sparring bout takes no bets", "🎟️");
    if (this.phase !== "warmup") return this.notice(sessionId, "Bets are taken during the countdown, before the bell", "🎟️");
    if (this.cornerOf(sessionId)) return this.notice(sessionId, "Fighters can't bet on their own bout", "🥊");
    if (!isCorner(side)) return;
    if (Math.hypot(p.x - CHALKBOARD_FRONT.x, p.z - CHALKBOARD_FRONT.z) > CHALKBOARD_REACH + REACH_SLACK) return this.notice(sessionId, "Bets go on at the ringside chalkboard", "🎟️");
    if (this.bets.has(sessionId)) return this.notice(sessionId, "Your ticket is already in for this bout", "🎟️");
    const amount = Math.floor(Number(raw));
    if (!Number.isFinite(amount) || amount < BET_MIN || amount > BET_MAX) return this.notice(sessionId, `Bets are ${BET_MIN} to ${BET_MAX} coins`, "🎟️");
    if (p.coins < amount) return this.notice(sessionId, "Not enough coins for that ticket", "🪙");
    this.host.addCoins(sessionId, -amount);
    this.bets.set(sessionId, encodeBet(side, amount));
    this.betNames.set(sessionId, p.username);
    this.host.emote(sessionId, "🎟️");
    this.host.sendTo(sessionId, "boxNotice", { message: `${amount} coins on the ${CORNER_NAME[side]}: good luck!`, emoji: "🎟️", ok: true });
    this.sync();
  }

  private buyGloves(sessionId: string, id: unknown) {
    const p = this.host.player(sessionId);
    const profile = this.host.profile(sessionId);
    if (!p || !profile || !isGloveId(id) || p.map !== "boxing_ring") return;
    if (Math.hypot(p.x - COACH_FRONT.x, p.z - COACH_FRONT.z) > COACH_REACH + REACH_SLACK) return this.notice(sessionId, "Coach Bruno sells gloves at his counter", "🐶");
    if (profile.gloves.includes(id)) return this.notice(sessionId, "They're already yours", "🥊");
    const price = GLOVES[id].price;
    if (p.coins < price) return this.notice(sessionId, `The ${GLOVES[id].name} are ${price} coins`, "🪙");
    this.host.addCoins(sessionId, -price);
    profile.gloves.push(id);
    profile.worn = id;
    this.host.saveProfile(sessionId);
    this.host.toMap("ringProp", { kind: "coach", sessionId });
    this.host.sendTo(sessionId, "boxNotice", { message: `The ${GLOVES[id].name} are yours, and laced on for your next bout`, emoji: GLOVES[id].emoji, ok: true });
  }

  private wearGloves(sessionId: string, id: unknown) {
    const p = this.host.player(sessionId);
    const profile = this.host.profile(sessionId);
    if (!p || !profile || !isGloveId(id) || !profile.gloves.includes(id)) return;
    if (p.corner) return this.notice(sessionId, "Gloves are laced before you step in", "🥊");
    profile.worn = id;
    this.host.saveProfile(sessionId);
  }

  // --- the clock --------------------------------------------------------------------------------------

  /** A punch lands or a move ends in `ms`: settle the ring then (the tick catches anything missed). */
  private wake(ms: number) {
    this.host.later(Math.max(0, Math.ceil(ms)), () => {
      if (this.phase !== "fight") return;
      this.step(Date.now());
      this.sync();
    });
  }

  tick(dt: number) {
    const now = Date.now();
    this.prune();
    if (this.phase === "fight" || this.phase === "count" || this.phase === "rest") {
      // a fighter's connection is down: the bout waits for them (every clock shifted on), and gives
      // up after FORFEIT_GRACE_S
      const away = (["red", "blue"] as const).map((c) => this.fighters[c]).find((f) => f?.away);
      if (away) {
        if (now - away.awayAt >= FORFEIT_GRACE_S * 1000) {
          const gone = away.sessionId;
          this.end("forfeit", otherCorner(away.corner), now);
          if (this.loserId === gone) this.loserId = null;
          if (this.stayer === away.corner) this.stayer = null;
          delete this.fighters[away.corner];
          this.release(gone, away.corner);
        } else this.shift(dt * 1000);
        this.sync();
        return;
      }
    }
    switch (this.phase) {
      case "open":
        if (this.queue.length > 0) this.fill(now);
        break;
      case "warmup":
        this.botWarmup(now);
        if (now >= this.phaseEnd) this.startRound(1, now);
        break;
      case "fight":
        this.step(now);
        if (this.phase === "fight") this.pools(dt, now);
        if (this.phase === "fight") this.bots(dt, now);
        if (this.phase === "fight" && now >= this.phaseEnd) this.endRound(now);
        break;
      case "count":
        this.tickCount(dt, now);
        break;
      case "rest":
        if (now >= this.phaseEnd) this.startRound(this.round + 1, now);
        break;
      case "result":
        if (this.loserId && now >= this.benchAt) this.benchLoser();
        if (now >= this.phaseEnd) this.afterResult(now);
        break;
    }
    this.sync();
  }

  /** Fighters and people in line who are no longer on the map (a trip the room didn't tell us of,
   *  a lost session). A bot has no player: he goes when whoever he spars does. */
  private prune() {
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f || f.bot) continue;
      const p = this.host.player(f.sessionId);
      if (!p) {
        if (this.phase === "fight" || this.phase === "count" || this.phase === "rest") this.end("forfeit", otherCorner(c), Date.now());
        if (this.loserId === f.sessionId) this.loserId = null;
        if (this.stayer === c) this.stayer = null;
        delete this.fighters[c];
        if (this.phase === "warmup") {
          this.refundAll();
          this.phase = "open";
        }
        if (this.phase === "open") this.sendJimmyHome();
      } else if (p.map !== "boxing_ring") this.leave(f.sessionId, "travel");
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const p = this.host.player(this.queue[i].sessionId);
      if (!p || p.map !== "boxing_ring") this.queue.splice(i, 1);
    }
  }

  /** Every clock the bout keeps moved on by `ms` (a pause). */
  private shift(ms: number) {
    this.phaseEnd += ms;
    this.countAt += ms;
    // (a pause is not time fought: the No Contest clock stops too)
    if (this.firstBell) this.firstBell += ms;
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f) continue;
      f.stateUntil += ms;
      f.chainUntil += ms;
      f.actedAt += ms;
      f.guardHitAt += ms;
      f.dashAt += ms;
      f.counterUntil += ms;
      if (f.pending) {
        f.pending.at += ms;
        f.pending.started += ms;
      }
      if (f.bot) {
        f.bot.next += ms;
        f.bot.circleUntil += ms;
      }
    }
  }

  private startRound(round: number, now: number) {
    this.round = round;
    this.phase = "fight";
    this.phaseEnd = now + ROUND_S * 1000;
    if (round === 1) this.firstBell = now;
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f) continue;
      freshRound(f, now);
      if (f.bot) f.bot.next = now + rand(400, 900);
      const at = RING_CORNERS[c].inside;
      this.put(f, at.x, at.z, PLACE_MS.corner);
    }
    this.event({ kind: "bell", round, ring: "start" });
  }

  /** The ring on the clock: the punches landing now (the earliest first; two landing together both
   *  land), then every timed state that is over (a press kept for it thrown the moment it ends). */
  private step(now: number) {
    if (this.phase !== "fight") return;
    const red = this.fighters.red;
    const blue = this.fighters.blue;
    if (!red || !blue) return;
    const due = [red, blue].filter((f) => f.pending && now >= f.pending.at).sort((a, b) => a.pending!.at - b.pending!.at);
    for (const f of due) {
      if (this.phase !== "fight") return;
      if (f.pending) this.land(f, now);
    }
    for (const f of [red, blue]) {
      if (this.phase !== "fight") return;
      this.settle(f, now);
    }
  }

  /** A timed state over: free again (the guard back up if its button is still held, the meter
   *  full again after a Guard Break), and a kept press thrown at once. */
  private settle(f: Fighter, now: number) {
    if (!BUSY.has(f.state) || now < f.stateUntil || f.pending) return;
    const was = f.state;
    f.state = "";
    f.stateUntil = 0;
    if (was === "stun") f.guard = GUARD_MAX;
    const press = f.buffered;
    f.buffered = null;
    if (press && !f.away) {
      if (press.kind === "dash") {
        if (!f.exhausted) this.slide(f, press.dx, press.dz, now, false);
      } else this.throwPunch(f, press.kind, now);
      return;
    }
    if (f.guardHeld && !f.exhausted) f.state = "block";
  }

  /** Stamina and the guard's meter, a tick's worth. */
  private pools(dt: number, now: number) {
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f || f.away) continue;
      if (f.state === "block") {
        f.stamina -= GUARD.drain * dt;
        f.actedAt = now;
        if (f.stamina <= 0) {
          f.stamina = 0;
          f.state = "";
          if (!f.exhausted) {
            f.exhausted = true;
            this.event({ kind: "exhausted", to: f.sessionId });
          }
        }
      } else if (f.state !== "attack" && f.state !== "dash" && now - f.actedAt >= STAMINA.idle * 1000) {
        f.stamina = Math.min(STAMINA_MAX, f.stamina + STAMINA.regen * dt);
      }
      if (f.exhausted && f.stamina >= STAMINA.recover) {
        f.exhausted = false;
        // (the guard's button still held: back up it goes)
        if (f.guardHeld && f.state === "") f.state = "block";
      }
      if (f.state !== "block" && f.state !== "stun" && now - f.guardHitAt >= GUARD.regenDelay * 1000) f.guard = Math.min(GUARD_MAX, f.guard + GUARD.regen * dt);
    }
  }

  /** `f`'s punch lands: judged against the other fighter as they stand now. */
  private land(f: Fighter, now: number) {
    const shot = f.pending!;
    f.pending = null;
    const foe = this.fighters[otherCorner(f.corner)];
    const me = this.at(f);
    const them = foe ? this.at(foe) : null;
    if (!foe || !me || !them) return;
    const dx = them.x - me.x;
    const dz = them.z - me.z;
    const distance = Math.hypot(dx, dz);
    const outcome = judgeStrike(shot.move, Math.max(0, distance - STRIKE_SLACK), now / 1000, shot.counter, { state: foe.state, dashAt: foe.dashAt / 1000, guard: foe.guard });
    // the way a punch drives: from the puncher to the punched (straight at them, standing on them)
    const dir = distance > 0.05 ? { x: dx / distance, z: dz / distance } : { x: Math.sign(them.x - RING.x) || 1, z: 0 };
    const spec = MOVES[shot.move];
    const heavy = shot.move === "smash";
    switch (outcome.kind) {
      case "whiff":
        this.event({ kind: "whiff", by: f.sessionId, to: foe.sessionId, move: shot.move });
        return;
      case "perfect":
        // a Perfect Dodge: the puncher staggers off balance; the dodger's next punch is a Counter
        f.state = "stagger";
        f.stateUntil = now + WHIFF_STAGGER_S * 1000;
        f.buffered = null;
        f.chain = 0;
        foe.counterUntil = now + COUNTER_WINDOW_S * 1000;
        this.wake(WHIFF_STAGGER_S * 1000);
        this.event({ kind: "perfect", by: foe.sessionId, to: f.sessionId, move: shot.move });
        // (Jimmy never wastes a Counter)
        if (foe.bot) this.botLater(foe, rand(70, 130), () => this.attack(foe.sessionId, "m1", Date.now()));
        return;
      case "block":
        foe.health = Math.max(0, foe.health - outcome.damage);
        foe.guard = Math.max(0, foe.guard - outcome.guard);
        foe.guardHitAt = now;
        f.dealt += outcome.damage;
        f.roundDealt += outcome.damage;
        this.event({ kind: "block", by: f.sessionId, to: foe.sessionId, move: shot.move, damage: outcome.damage, dir: [dir.x, dir.z] });
        if (outcome.guardBreak) this.guardBreak(f, foe, them, dir, now);
        else this.push(f, foe, them, dir, spec.knockback * 0.35, false, now);
        if (foe.health <= 0 && this.phase === "fight") this.knockDown(f, foe, now);
        return;
      case "hit": {
        foe.health = Math.max(0, foe.health - outcome.damage);
        f.dealt += outcome.damage;
        f.roundDealt += outcome.damage;
        // a clean hit knocks whatever they were doing out of them: a hitstun
        foe.pending = null;
        foe.buffered = null;
        foe.chain = 0;
        foe.state = "hurt";
        foe.stateUntil = now + spec.hitstun * 1000;
        this.wake(spec.hitstun * 1000);
        this.event({ kind: "hit", by: f.sessionId, to: foe.sessionId, move: shot.move, damage: outcome.damage, counter: shot.counter, interrupt: outcome.interrupt, dir: [dir.x, dir.z] });
        const out = this.push(f, foe, them, dir, spec.knockback, heavy, now);
        if (out) return;
        if (foe.health <= 0) this.knockDown(f, foe, now);
        return;
      }
    }
  }

  /** The guard's meter run out: the gloves flung wide, dazed, knocked back (the meter full again
   *  once the daze is over). */
  private guardBreak(by: Fighter, foe: Fighter, at: { x: number; z: number }, dir: { x: number; z: number }, now: number) {
    foe.state = "stun";
    foe.stateUntil = now + GUARD.breakStun * 1000;
    foe.guard = 0;
    foe.pending = null;
    foe.buffered = null;
    foe.chain = 0;
    this.wake(GUARD.breakStun * 1000);
    this.event({ kind: "guardbreak", by: by.sessionId, to: foe.sessionId });
    this.push(by, foe, at, dir, GUARD.breakKnockback, false, now);
  }

  /**
   * Knocks `foe` (standing at `at`) back along `dir` by `by`. Into the ropes: an M2 on a fighter
   * at half health or less sends them through (Ring-Out: the round is `puncher`'s; returns true);
   * otherwise they bounce back off them, stunned a moment after an M2.
   */
  private push(puncher: Fighter, foe: Fighter, at: { x: number; z: number }, dir: { x: number; z: number }, by: number, heavy: boolean, now: number): boolean {
    if (by <= 0) return false;
    const tx = at.x + dir.x * by;
    const tz = at.z + dir.z * by;
    const overX = tx > RING_INNER.x1 ? tx - RING_INNER.x1 : tx < RING_INNER.x0 ? tx - RING_INNER.x0 : 0;
    const overZ = tz > RING_INNER.z1 ? tz - RING_INNER.z1 : tz < RING_INNER.z0 ? tz - RING_INNER.z0 : 0;
    if (overX === 0 && overZ === 0) {
      this.put(foe, tx, tz, PLACE_MS.knock);
      return false;
    }
    const side: RopeSide = Math.abs(overX) >= Math.abs(overZ) ? (overX > 0 ? "e" : "w") : overZ > 0 ? "s" : "n";
    if (heavy && foe.health <= RINGOUT_HEALTH) {
      // launched through the ropes onto the floor: Ring-Out, the round over (the next one, if there
      // is one, starts back in their corner)
      const land = ringOutLanding(side, side === "e" || side === "w" ? tz - RING.z : tx - RING.x);
      foe.state = "out";
      foe.pending = null;
      foe.buffered = null;
      this.put(foe, land.x, land.z, PLACE_MS.corner);
      this.event({ kind: "ringout", to: foe.sessionId, side });
      this.roundOver(puncher.corner, "ringout", now);
      return true;
    }
    // off the ropes: back in from them
    const kept = clampToRing(tx, tz);
    const bounce = heavy ? ROPE_BOUNCE : 0;
    const back = clampToRing(kept.x - (side === "e" ? bounce : side === "w" ? -bounce : 0), kept.z - (side === "s" ? bounce : side === "n" ? -bounce : 0));
    this.put(foe, back.x, back.z, PLACE_MS.knock);
    if (heavy && (foe.state === "hurt" || foe.state === "")) {
      foe.state = "hurt";
      foe.stateUntil = Math.max(foe.stateUntil, now + ROPE_STUN_S * 1000);
      foe.pending = null;
      this.wake(foe.stateUntil - now);
    }
    this.event({ kind: "ropes", to: foe.sessionId, side });
    return false;
  }

  /** `foe` goes down: a third time this round is a T.K.O. (the round is `by`'s); otherwise Coach
   *  Bruno counts, and `by` waits in a neutral corner. */
  private knockDown(by: Fighter, foe: Fighter, now: number) {
    foe.knockdowns++;
    foe.knockdownsBout++;
    foe.pending = null;
    foe.buffered = null;
    by.pending = null;
    by.buffered = null;
    if (BUSY.has(by.state) || by.state === "block") by.state = "";
    this.event({ kind: "knockdown", to: foe.sessionId, knockdowns: foe.knockdowns });
    foe.state = "down";
    if (foe.knockdowns >= KNOCKDOWNS_TKO) {
      this.roundOver(by.corner, "tko", now);
      return;
    }
    foe.taps = 0;
    foe.tapTimes = [];
    if (foe.bot) foe.bot.mashNext = now + rand(500, 900);
    this.phase = "count";
    this.roundLeft = Math.max(0, this.phaseEnd - now);
    this.countAt = now;
    this.count = 0;
    this.downed = foe.corner;
    // the standing fighter to the neutral corner further from the one down
    const down = this.at(foe);
    const corner = down ? NEUTRAL_CORNERS.reduce((a, b) => (Math.hypot(b.x - down.x, b.z - down.z) > Math.hypot(a.x - down.x, a.z - down.z) ? b : a)) : NEUTRAL_CORNERS[0];
    this.put(by, corner.x, corner.z, PLACE_MS.corner);
  }

  private tickCount(dt: number, now: number) {
    const f = this.downed ? this.fighters[this.downed] : undefined;
    const other = this.downed ? this.fighters[otherCorner(this.downed)] : undefined;
    if (!f || !other) return;
    // Jimmy mashes at his setting's pace
    if (f.bot && now >= f.bot.mashNext) {
      f.bot.mashNext = now + 1000 / BOT_SKILL[f.bot.tier].mash;
      this.mash(f.sessionId, now);
    }
    // the taps fade: getting up takes a flurry, not a patient tap now and then
    f.taps = Math.max(0, f.taps - TAP_DECAY_PER_S * dt);
    const need = RECOVER_TAPS[Math.min(RECOVER_TAPS.length - 1, f.knockdowns - 1)];
    if (f.taps >= need && this.count >= MIN_COUNT_UP) {
      // up before ten (a push-up off the canvas): back to it, with a little health found
      freshen(f, now);
      f.health = RECOVER_HEALTH[Math.min(RECOVER_HEALTH.length - 1, f.knockdowns - 1)];
      f.stamina = Math.max(60, f.stamina);
      other.state = other.guardHeld ? "block" : "";
      other.pending = null;
      this.phase = "fight";
      this.phaseEnd = now + this.roundLeft;
      this.downed = null;
      this.count = 0;
      this.event({ kind: "up", to: f.sessionId, beat: true });
      return;
    }
    const n = Math.floor((now - this.countAt) / (COUNT_STEP_S * 1000)) + 1;
    if (n > this.count) {
      this.count = Math.min(COUNT_TO, n);
      this.event({ kind: "count", n: this.count, to: f.sessionId });
      // counted out: the round (not yet the bout) is the other's
      if (this.count >= COUNT_TO) this.roundOver(other.corner, "ko", now);
    }
  }

  /** The round's bell: the judges' round card (damage dealt this round, and the knockdowns scored in
   *  it) decides it; level, it is drawn. */
  private endRound(now: number) {
    const red = this.fighters.red!;
    const blue = this.fighters.blue!;
    const r = red.roundDealt + blue.knockdowns * KNOCKDOWN_POINTS;
    const b = blue.roundDealt + red.knockdowns * KNOCKDOWN_POINTS;
    this.roundOver(r === b ? null : r > b ? "red" : "blue", "decision", now);
  }

  /** A round decided (`winner` null: drawn): its point, then the rest before the next, or the bout's
   *  end (two rounds won; or three fought: the rounds won, then the judges' cards over the bout). */
  private roundOver(winner: Corner | null, method: BoutMethod, now: number) {
    if (this.phase !== "fight" && this.phase !== "count") return;
    const red = this.fighters.red;
    const blue = this.fighters.blue;
    if (!red || !blue) return;
    this.roundLog.push(winner ?? "draw");
    if (winner) this.fighters[winner]!.wins++;
    this.event({ kind: "round", round: this.round, winner, method });
    this.event({ kind: "bell", round: this.round, ring: "end" });
    this.downed = null;
    this.count = 0;
    const decided: Corner | null = red.wins >= ROUNDS_TO_WIN ? "red" : blue.wins >= ROUNDS_TO_WIN ? "blue" : null;
    if (decided) return this.end(method, decided, now);
    if (this.round >= ROUNDS) {
      if (red.wins !== blue.wins) return this.end("decision", red.wins > blue.wins ? "red" : "blue", now);
      const r = cardScore(red.dealt, blue.knockdownsBout);
      const b = cardScore(blue.dealt, red.knockdownsBout);
      return r === b ? this.end("draw", null, now) : this.end("decision", r > b ? "red" : "blue", now);
    }
    // the rest: both back to their corners, patched up to full (a fighter down or out gets up)
    this.phase = "rest";
    this.phaseEnd = now + REST_S * 1000;
    for (const f of [red, blue]) {
      if (f.state === "down" || f.state === "out") this.event({ kind: "up", to: f.sessionId, beat: false });
      freshRound(f, now);
      const at = RING_CORNERS[f.corner].inside;
      this.put(f, at.x, at.z, PLACE_MS.corner);
    }
  }

  /** The bout is over: the records, the purse, the belt, the bets; the result on the board. The
   *  winner holds the ring, and the loser is walked to the bleachers a moment later; a draw (or a
   *  stop with no winner) clears the ring. A sparring bout pays and records nothing: whoever
   *  sparred Jimmy keeps the ring either way, and he goes home. */
  private end(method: BoutMethod, winner: Corner | null, now: number) {
    if (this.phase === "result" || this.phase === "open") return;
    const seconds = this.firstBell ? Math.max(0, (now - this.firstBell) / 1000) : 0;
    const w = winner ? this.fighters[winner] : undefined;
    const l = winner ? this.fighters[otherCorner(winner)] : undefined;
    const spar = this.sparTier();
    // a fixed fight pays nobody: too quick, or a loser who never threw a punch (the one standing
    // still holds the ring)
    let counted = !!(winner && w) && !spar;
    if (winner && !spar && (!w || !boutCounts(seconds, l ? l.strikes : 1))) {
      method = "nocontest";
      counted = false;
    }
    const paid = settleBets(this.bets, counted ? winner : null);
    const payouts: BoutResult["payouts"] = [];
    for (const [who, amount] of paid) {
      const b = parseBet(this.bets.get(who));
      if (!b) continue;
      if (amount > 0) this.host.addCoins(who, amount);
      payouts.push({ name: this.betNames.get(who) ?? "Someone", side: b.side, stake: b.amount, paid: amount });
      if (amount > b.amount) this.host.sendTo(who, "boxNotice", { message: `Your ticket on the ${CORNER_NAME[b.side]} paid ${amount} coins!`, emoji: "🎟️", ok: true });
    }
    let purse = 0;
    let belt = false;
    if (counted && winner && w && l) {
      const knockout = method === "ko" || method === "tko" || method === "ringout";
      const wp = this.host.profile(w.sessionId);
      if (wp) {
        wp.wins++;
        wp.streak++;
        wp.best = Math.max(wp.best, wp.streak);
        if (knockout) wp.kos++;
        wp.purses = wp.purses.filter((t) => now - t < HOUR_MS);
        if (wp.purses.length < PURSES_PER_HOUR) {
          purse = BOUT_PURSE;
          wp.purses.push(now);
          this.host.addCoins(w.sessionId, purse);
        }
        if (wp.streak % BELT_STREAK === 0) {
          wp.beltUntil = now + BELT_MS;
          belt = true;
        }
        this.host.saveProfile(w.sessionId);
      }
      const lp = this.host.profile(l.sessionId);
      if (lp) {
        lp.losses++;
        lp.streak = 0;
        this.host.saveProfile(l.sessionId);
      }
      this.host.tally(w.sessionId, knockout);
      if (belt) this.host.shout("boxBelt", { name: w.name, sessionId: w.sessionId });
    }
    // King of the Hill: the winner stays on (a spar: whoever sparred Jimmy, won or lost)
    const human = spar ? (["red", "blue"] as const).find((c) => this.fighters[c] && !this.fighters[c]!.bot) ?? null : null;
    const stayCorner: Corner | null = spar ? (this.conceded ? null : human) : winner && w ? winner : null;
    const stay = stayCorner ? this.fighters[stayCorner] : undefined;
    if (stay) {
      if (counted && stay === w) stay.reign++;
      freshRound(stay, now);
      if (!spar || stay === w) this.host.gesture(stay.sessionId, "trophy");
    }
    const result: BoutResult = {
      winner,
      winnerName: winner && w ? w.name : "",
      loserName: winner && l ? l.name : "",
      method,
      purse,
      belt,
      stays: !spar && !!stay,
      reign: !spar && stay ? stay.reign : 0,
      rounds: [...this.roundLog],
      ...(spar ? { spar } : {}),
      ...(this.conceded ? { towel: true } : {}),
      payouts,
      round: Math.max(1, this.round),
      seconds: Math.round(seconds),
    };
    this.bout.result = JSON.stringify(result);
    this.host.toMap("boxResult", result);
    this.phase = "result";
    this.phaseEnd = now + RESULT_S * 1000;
    this.benchAt = now + BENCH_AFTER_S * 1000;
    this.stayer = stayCorner;
    // (Jimmy is never walked to the bleachers: he goes home when the result has been read)
    this.loserId = !spar && stay && l && l !== stay ? l.sessionId : null;
    this.conceded = null;
    this.downed = null;
    this.count = 0;
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f) continue;
      f.pending = null;
      f.buffered = null;
      f.away = false;
      if (f.state !== "down" && f.state !== "out") f.state = "";
    }
    this.clearBets(false);
    console.log(`[ring] ${spar ? `spar (${spar}) ` : ""}${METHOD_LABEL[method]}${winner ? `: ${result.winnerName} over ${result.loserName}` : ""} (rounds ${this.roundLog.join("-") || "none"}, ${result.seconds}s, purse ${purse}${result.stays ? `, stays on (${result.reign})` : ""})`);
  }

  /** The result has been read: the winner back in their corner waiting for the next in line (a
   *  draw: both down the steps; Jimmy home), the ring open again. */
  private afterResult(now: number) {
    if (this.loserId) this.benchLoser();
    const stay = this.stayer ? this.fighters[this.stayer] : undefined;
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f || f === stay) continue;
      delete this.fighters[c];
      if (f.bot) this.event({ kind: "leave", by: f.sessionId, corner: c });
      else this.release(f.sessionId, c);
    }
    if (stay) {
      freshBout(stay, now);
      const at = RING_CORNERS[stay.corner].inside;
      this.put(stay, at.x, at.z, PLACE_MS.corner);
    }
    this.stayer = null;
    this.phase = "open";
    this.round = 0;
    this.firstBell = 0;
    this.roundLog.length = 0;
    this.fill(now);
  }

  /** Everyone down the steps, the ring open. */
  private clearRing() {
    this.loserId = null;
    this.stayer = null;
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f) continue;
      delete this.fighters[c];
      if (!f.bot) this.release(f.sessionId, c);
    }
    this.phase = "open";
    this.round = 0;
    this.firstBell = 0;
    this.roundLog.length = 0;
  }

  // --- Jimmy the Slugger's hands -------------------------------------------------------------------------

  /** Run a bot's move in `ms`, if he is still in this bout's fight then. */
  private botLater(f: Fighter, ms: number, act: () => void) {
    this.host.later(Math.max(0, Math.round(ms)), () => {
      if (this.phase !== "fight" || this.fighters[f.corner] !== f) return;
      act();
      this.sync();
    });
  }

  /** The other fighter's punch coming at Jimmy, landing at `landAt` (ms): at his reaction time, a
   *  guard (let go again once it has landed), or, the Champion, a Perfect Dodge of a punch slow
   *  enough to see coming (never a snap jab). */
  private botReact(f: Fighter, landAt: number, now: number) {
    const b = f.bot!;
    const skill = BOT_SKILL[b.tier];
    if (f.exhausted || !(f.state === "" || f.state === "block" || f.state === "attack")) return;
    const react = now + skill.reaction * 1000 * rand(0.85, 1.2);
    const dodgeAt = landAt - rand(20, 60);
    // (mid-punch, he can only dodge or guard if that punch is done by then)
    const freeBy = f.state === "attack" ? f.stateUntil : now;
    if (skill.dodge > 0 && Math.random() < skill.dodge && dodgeAt >= Math.max(react, freeBy)) {
      // the read: the rest of his string dropped, his hands held until the punch is past
      b.combo = 0;
      f.buffered = null;
      b.holdUntil = landAt + 60;
      const me = this.at(f);
      const foe = this.fighters[otherCorner(f.corner)];
      const them = foe ? this.at(foe) : null;
      const side = Math.random() < 0.5 ? 1 : -1;
      const fx = them && me ? them.x - me.x : 1;
      const fz = them && me ? them.z - me.z : 0;
      const fl = Math.hypot(fx, fz) || 1;
      this.botLater(f, dodgeAt - now, () => this.dash(f.sessionId, (-fz / fl) * side, (fx / fl) * side, Date.now()));
      return;
    }
    if (f.state === "block") {
      this.botLater(f, landAt - now + rand(200, 400), () => this.guard(f.sessionId, false, Date.now()));
      return;
    }
    if (Math.random() < skill.guard && Math.max(react, freeBy) < landAt - 10) {
      b.combo = 0;
      f.buffered = null;
      b.holdUntil = landAt + 60;
      this.botLater(f, Math.max(react, freeBy) - now, () => this.guard(f.sessionId, true, Date.now()));
      this.botLater(f, landAt - now + rand(220, 420), () => this.guard(f.sessionId, false, Date.now()));
    }
  }

  /** The countdown: Jimmy bounces in his corner and shadowboxes now and then. */
  private botWarmup(now: number) {
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f?.bot || now < f.bot.next) continue;
      f.bot.next = now + rand(1400, 2600);
      this.shadow(f, Math.random() < 0.2 ? "m2" : "m1", now);
    }
  }

  /** A tick of each bot's bout: in to punching range (or back out of it to breathe), circling,
   *  his strings and his Heavy Smash (a feint of it now and then). */
  private bots(dt: number, now: number) {
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      const foe = this.fighters[otherCorner(c)];
      if (!f?.bot || !foe) continue;
      const b = f.bot;
      const skill = BOT_SKILL[b.tier];
      const me = this.at(f);
      const them = this.at(foe);
      if (!me || !them) continue;
      const dx = them.x - me.x;
      const dz = them.z - me.z;
      const dist = Math.hypot(dx, dz) || 1e-3;
      const ux = dx / dist;
      const uz = dz / dist;
      // his feet: in to arm's length, or back off to breathe; circling between (not while busy)
      const pace = f.state === "block" ? 0.5 : f.state === "attack" ? 0.6 : f.state === "" ? 1 : 0;
      if (pace > 0) {
        const tired = f.exhausted || f.stamina < skill.breathe;
        const want = tired ? 2.3 : 1.02;
        const radial = Math.max(-1, Math.min(1, (dist - want) * 2.5));
        if (now >= b.circleUntil) {
          b.circle = Math.random() < 0.5 ? 1 : -1;
          b.circleUntil = now + rand(1400, 3000);
        }
        const lateral = b.tier === "rookie" ? 0 : b.circle * 0.45;
        const vx = (ux * radial + -uz * lateral) * skill.speed * pace;
        const vz = (uz * radial + ux * lateral) * skill.speed * pace;
        let nx = me.x + vx * dt;
        let nz = me.z + vz * dt;
        const gx = nx - them.x;
        const gz = nz - them.z;
        const gap = Math.hypot(gx, gz);
        if (gap < FIGHTER_GAP) {
          nx = them.x + (gx / (gap || 1)) * FIGHTER_GAP;
          nz = them.z + (gz / (gap || 1)) * FIGHTER_GAP;
        }
        const kept = clampToRing(nx, nz);
        b.x = kept.x;
        b.z = kept.z;
      }
      // a feint: his own M2 pulled back early, and a jab thrown in its place
      if (b.feintAt && now >= b.feintAt) {
        b.feintAt = 0;
        this.guard(f.sessionId, true, now);
        this.guard(f.sessionId, false, now);
        this.botLater(f, rand(60, 120), () => this.attack(f.sessionId, "m1", Date.now()));
        continue;
      }
      // his hands: the rest of a string (pressed into the buffer as each punch ends), or an opening
      const inReach = dist <= MOVES.jab.reach + 0.05;
      if (now < b.holdUntil) continue;
      if (b.combo > 0 && !f.buffered && (this.free(f) || (f.state === "attack" && !f.pending && f.stateUntil - now <= BUFFER_S * 1000))) {
        if (inReach) {
          b.combo--;
          this.attack(f.sessionId, "m1", now);
        } else b.combo = 0;
        continue;
      }
      if (now < b.next || !this.free(f) || !inReach || f.exhausted) continue;
      b.next = now + rand(skill.think[0], skill.think[1]) * 1000;
      if (Math.random() < skill.idle) continue;
      if (f.state === "block") this.guard(f.sessionId, false, now);
      const smash = foe.state === "block" ? skill.smash * 2 : skill.smash;
      if (Math.random() < smash) {
        this.attack(f.sessionId, "m2", now);
        if (Math.random() < skill.feint) b.feintAt = now + rand(50, 110);
      } else {
        b.combo = Math.round(rand(skill.string[0], skill.string[1])) - 1;
        this.attack(f.sessionId, "m1", now);
      }
    }
  }

  // --- the bets -----------------------------------------------------------------------------------------

  private refundBet(sessionId: string) {
    const b = parseBet(this.bets.get(sessionId));
    if (!b) return;
    this.bets.delete(sessionId);
    this.betNames.delete(sessionId);
    this.host.addCoins(sessionId, b.amount);
  }

  private refundAll() {
    for (const who of [...this.bets.keys()]) this.refundBet(who);
    this.clearBets();
  }

  private clearBets(names = true) {
    this.bets.clear();
    if (names) this.betNames.clear();
  }

  // --- the room's state and messages ---------------------------------------------------------------------

  private event(ev: BoxEvent) {
    this.host.toMap("boxEvent", ev);
  }

  private notice(sessionId: string, message: string, emoji: string) {
    this.host.sendTo(sessionId, "boxNotice", { message, emoji });
  }

  /** The bout into the room's state (only what changed goes out). */
  private sync() {
    const b = this.bout;
    const now = Date.now();
    if (b.phase !== this.phase) b.phase = this.phase;
    if (b.round !== this.round) b.round = this.round;
    const left = this.phase === "count" ? this.roundLeft : this.phase === "open" ? 0 : Math.max(0, this.phaseEnd - now);
    const clock = Math.ceil(left / 1000);
    if (b.clock !== clock) b.clock = clock;
    const count = this.phase === "count" ? this.count : 0;
    if (b.count !== count) b.count = count;
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      const s = c === "red" ? b.red : b.blue;
      const set = <K extends keyof FighterSchema>(k: K, v: FighterSchema[K]) => {
        if (s[k] !== v) s[k] = v;
      };
      set("sessionId", f?.sessionId ?? "");
      set("name", f?.name ?? "");
      set("health", f ? Math.round(f.health) : HEALTH_MAX);
      set("stamina", f ? Math.round(f.stamina) : STAMINA_MAX);
      set("guard", f ? Math.round(f.guard) : GUARD_MAX);
      set("state", f?.state ?? "");
      set("exhausted", f?.exhausted ?? false);
      set("counter", !!f && now < f.counterUntil);
      set("knockdowns", f?.knockdowns ?? 0);
      set("taps", f ? Math.floor(f.taps) : 0);
      set("need", f && this.phase === "count" && this.downed === c ? RECOVER_TAPS[Math.min(RECOVER_TAPS.length - 1, f.knockdowns - 1)] : 0);
      set("dealt", f?.dealt ?? 0);
      set("gloves", f?.gloves ?? "red");
      set("away", f?.away ?? false);
      set("reign", f?.reign ?? 0);
      set("wins", f?.wins ?? 0);
      set("bot", f?.bot?.tier ?? "");
      set("x", f?.bot ? Math.round(f.bot.x * 100) / 100 : 0);
      set("z", f?.bot ? Math.round(f.bot.z * 100) / 100 : 0);
    }
    const line = this.queue.map((q) => q.sessionId);
    if (b.queue.length !== line.length || line.some((id, i) => b.queue[i] !== id)) {
      b.queue.clear();
      for (const id of line) b.queue.push(id);
    }
    const rounds = this.roundLog.join(",");
    if (b.rounds !== rounds) b.rounds = rounds;
    const spar = this.sparTier() ?? "";
    if (b.spar !== spar) b.spar = spar;
    for (const id of [...b.bets.keys()]) if (!this.bets.has(id)) b.bets.delete(id);
    for (const [id, v] of this.bets) if (b.bets.get(id) !== v) b.bets.set(id, v);
    const pools = poolsOf(this.bets.values());
    if (b.poolRed !== pools.red) b.poolRed = pools.red;
    if (b.poolBlue !== pools.blue) b.poolBlue = pools.blue;
  }
}
