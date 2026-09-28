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
  REST_HEALTH,
  REST_S,
  RESULT_S,
  RINGOUT_HEALTH,
  ROPE_BOUNCE,
  ROPE_STUN_S,
  ROUNDS,
  ROUND_S,
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
  isCorner,
  isGloveId,
  judgeStrike,
  moveCost,
  moveTiming,
  otherCorner,
  parseBet,
  poolsOf,
  settleBets,
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
} from "../../../shared/boxing";
import { CHALKBOARD_FRONT, CHALKBOARD_REACH, COACH_FRONT, COACH_REACH, CORNER_REACH, GYM_REACH, HEAVY_BAG_FRONT, NEUTRAL_CORNERS, RING, RING_CORNERS, RING_INNER, SPEED_BAG_FRONT, WEIGH_SCALE_FRONT, clampToRing, onRing, ringOutLanding } from "../../../shared/worlds/boxing_ring";
import { hashString, type Gesture } from "../../../shared/types";

// The Velvet Ring on the server: one bout at a time for the room, judged here and only here (the
// `BoardTable` / `CasinoFloor` pattern: the room hands it its players and a few ways to reach them).
// shared/boxing.ts has the rules; this runs them on the room's clock.
//
// King of the Hill: the corner steps are a queue (`queue`, first in line first). In an open ring
// the first two in line fill the corners and the countdown starts; when a bout ends the winner stays
// in their corner, patched up to full, the loser is walked to the bleachers (the room seats them),
// and the next in line steps in against the winner.
//
// No cooldowns: a fighter acts whenever they are free (standing, or guarding), and a press in the
// last BUFFER_S of a move, a dash or a hitstun is kept and thrown the moment it ends. Every punch is
// a wind-up, a landing and an endlag: the button starts the wind-up (everyone sees it: a `swing`
// event), the punch is judged the moment it lands (judgeStrike: a Perfect Dodge, out of reach,
// blocked or clean) against where the two fighters stand on the server then, and the fighter is
// free again at the end of its endlag. Landings and endings are timed to the millisecond (the host's
// `later`), and the room's tick settles anything a timer missed. The server moves fighters itself
// (their corner, a knockback, the ropes' bounce, a dash, a neutral corner for the count, a ring-out
// onto the floor) with `place`, which also has the room ignore their own position reports for a
// moment so the move sticks.
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
  /** The guard button is held (a guard goes back up by itself after a punch or a hitstun). */
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
  knockdowns: number;
  taps: number;
  tapTimes: number[];
  dealt: number;
  /** Punches thrown this bout (a loser with none: a No Contest). */
  strikes: number;
  gloves: GloveId;
  away: boolean;
  awayAt: number;
  /** Bouts won in a row on this hill. */
  reign: number;
}

/** A server-authored move holds this long against the fighter's own reports. */
const PLACE_MS = { corner: 800, knock: 280, dash: 220 };
/** How far past a prop's reach the server allows, for lag. */
const REACH_SLACK = 1.2;
/** Between two goes on a gym fixture (per player). */
const GYM_COOLDOWN_MS = 2600;
const HOUR_MS = 60 * 60 * 1000;
const NEVER = -1e15;

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
    taps: 0,
    tapTimes: [],
    dealt: 0,
    strikes: 0,
    gloves,
    away: false,
    awayAt: 0,
    reign: 0,
  };
}

/** A fighter fresh for a round (or a bout): full stamina and guard, nothing in hand. */
function freshen(f: Fighter, now: number) {
  f.stamina = STAMINA_MAX;
  f.guard = GUARD_MAX;
  f.exhausted = false;
  f.state = "";
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
  /** Waiting for the ring, first in line first, each with the corner whose steps they joined at. */
  private readonly queue: { sessionId: string; corner: Corner }[] = [];
  /** The result on the board: the corner that holds the ring after it (null: both step down), and
   *  the beaten fighter to walk to the bleachers at `benchAt`. */
  private stayer: Corner | null = null;
  private loserId: string | null = null;
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
    if (this.fighters.red && this.fighters.blue) {
      this.phase = "warmup";
      this.round = 0;
      this.phaseEnd = now + WARMUP_S * 1000;
      this.clearBets();
      for (const f of [this.fighters.red, this.fighters.blue]) {
        freshen(f, now);
        f.health = HEALTH_MAX;
        f.knockdowns = 0;
        f.dealt = 0;
        f.strikes = 0;
        const at = RING_CORNERS[f.corner].inside;
        this.host.place(f.sessionId, at.x, at.z, PLACE_MS.corner);
      }
    }
    this.sync();
  }

  /** Up the steps into `corner`: the gloves on (their own pair, in the corner's colour if Classic). */
  private stepIn(sessionId: string, p: RingPlayer, corner: Corner, now: number) {
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
    this.host.sendTo(sessionId, "boxNotice", { message: foe ? `You're up! Into the ${CORNER_NAME[corner]} against ${foe.name}` : `Into the ${CORNER_NAME[corner]}: waiting for a challenger`, emoji: "🥊", ok: true });
  }

  /**
   * A fighter going (back down the steps, off to another world, gone from the room): before the
   * bell the bets come back and the other waits on for the next in line; mid-bout it is a forfeit
   * (the one who stays holds the ring). A bettor gone from the room gets their stake back; anyone
   * in line gives up their place.
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
      delete this.fighters[corner];
      this.release(sessionId, corner);
      this.event({ kind: "leave", by: sessionId, corner });
    }
    this.sync();
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
    if (!f) return;
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

  private guard(sessionId: string, on: boolean, now: number) {
    const f = this.fighterOf(sessionId);
    if (!f || f.away) return;
    if (this.phase !== "fight" && this.phase !== "warmup") return;
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
    const me = this.host.player(f.sessionId);
    if (!me) return;
    const foe = this.fighters[otherCorner(f.corner)];
    const them = foe ? this.host.player(foe.sessionId) : undefined;
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
    this.host.place(f.sessionId, to.x, to.z, PLACE_MS.dash);
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
        if (now >= this.phaseEnd) this.startRound(1, now);
        break;
      case "fight":
        this.step(now);
        if (this.phase === "fight") this.pools(dt, now);
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
   *  a lost session). */
  private prune() {
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f) continue;
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
      const held = f.guardHeld;
      freshen(f, now);
      f.guardHeld = held;
      if (held) f.state = "block";
      if (round === 1) f.health = HEALTH_MAX;
      const at = RING_CORNERS[c].inside;
      this.host.place(f.sessionId, at.x, at.z, PLACE_MS.corner);
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
      if (f.exhausted && f.stamina >= STAMINA.recover) f.exhausted = false;
      if (f.state !== "block" && f.state !== "stun" && now - f.guardHitAt >= GUARD.regenDelay * 1000) f.guard = Math.min(GUARD_MAX, f.guard + GUARD.regen * dt);
    }
  }

  /** `f`'s punch lands: judged against the other fighter as they stand now. */
  private land(f: Fighter, now: number) {
    const shot = f.pending!;
    f.pending = null;
    const foe = this.fighters[otherCorner(f.corner)];
    const me = this.host.player(f.sessionId);
    const them = foe ? this.host.player(foe.sessionId) : undefined;
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
        return;
      case "block":
        foe.health = Math.max(0, foe.health - outcome.damage);
        foe.guard = Math.max(0, foe.guard - outcome.guard);
        foe.guardHitAt = now;
        f.dealt += outcome.damage;
        this.event({ kind: "block", by: f.sessionId, to: foe.sessionId, move: shot.move, damage: outcome.damage, dir: [dir.x, dir.z] });
        if (outcome.guardBreak) this.guardBreak(f, foe, them, dir, now);
        else this.push(foe, them, dir, spec.knockback * 0.35, false, now);
        if (foe.health <= 0 && this.phase === "fight") this.knockDown(f, foe, now);
        return;
      case "hit": {
        foe.health = Math.max(0, foe.health - outcome.damage);
        f.dealt += outcome.damage;
        // a clean hit knocks whatever they were doing out of them: a hitstun
        foe.pending = null;
        foe.buffered = null;
        foe.chain = 0;
        foe.state = "hurt";
        foe.stateUntil = now + spec.hitstun * 1000;
        this.wake(spec.hitstun * 1000);
        this.event({ kind: "hit", by: f.sessionId, to: foe.sessionId, move: shot.move, damage: outcome.damage, counter: shot.counter, interrupt: outcome.interrupt, dir: [dir.x, dir.z] });
        const out = this.push(foe, them, dir, spec.knockback, heavy, now);
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
    this.push(foe, at, dir, GUARD.breakKnockback, false, now);
  }

  /**
   * Knocks `foe` (standing at `at`) back along `dir` by `by`. Into the ropes: an M2 on a fighter
   * at half health or less sends them through (Ring-Out: returns true, the bout over); otherwise
   * they bounce back off them, stunned a moment after an M2.
   */
  private push(foe: Fighter, at: { x: number; z: number }, dir: { x: number; z: number }, by: number, heavy: boolean, now: number): boolean {
    if (by <= 0) return false;
    const tx = at.x + dir.x * by;
    const tz = at.z + dir.z * by;
    const overX = tx > RING_INNER.x1 ? tx - RING_INNER.x1 : tx < RING_INNER.x0 ? tx - RING_INNER.x0 : 0;
    const overZ = tz > RING_INNER.z1 ? tz - RING_INNER.z1 : tz < RING_INNER.z0 ? tz - RING_INNER.z0 : 0;
    if (overX === 0 && overZ === 0) {
      this.host.place(foe.sessionId, tx, tz, PLACE_MS.knock);
      return false;
    }
    const side: RopeSide = Math.abs(overX) >= Math.abs(overZ) ? (overX > 0 ? "e" : "w") : overZ > 0 ? "s" : "n";
    if (heavy && foe.health <= RINGOUT_HEALTH) {
      // launched through the ropes onto the floor: Ring-Out
      const land = ringOutLanding(side, side === "e" || side === "w" ? tz - RING.z : tx - RING.x);
      foe.state = "out";
      foe.pending = null;
      foe.buffered = null;
      this.host.place(foe.sessionId, land.x, land.z, PLACE_MS.corner);
      const p = this.host.player(foe.sessionId);
      if (p) {
        p.corner = "";
        p.gloves = "";
      }
      this.event({ kind: "ringout", to: foe.sessionId, side });
      this.end("ringout", otherCorner(foe.corner), now);
      return true;
    }
    // off the ropes: back in from them
    const kept = clampToRing(tx, tz);
    const bounce = heavy ? ROPE_BOUNCE : 0;
    const back = clampToRing(kept.x - (side === "e" ? bounce : side === "w" ? -bounce : 0), kept.z - (side === "s" ? bounce : side === "n" ? -bounce : 0));
    this.host.place(foe.sessionId, back.x, back.z, PLACE_MS.knock);
    if (heavy && (foe.state === "hurt" || foe.state === "")) {
      foe.state = "hurt";
      foe.stateUntil = Math.max(foe.stateUntil, now + ROPE_STUN_S * 1000);
      foe.pending = null;
      this.wake(foe.stateUntil - now);
    }
    this.event({ kind: "ropes", to: foe.sessionId, side });
    return false;
  }

  /** `foe` goes down: a third time is a T.K.O.; otherwise Coach Bruno counts, and `by` waits in a
   *  neutral corner. */
  private knockDown(by: Fighter, foe: Fighter, now: number) {
    foe.knockdowns++;
    foe.pending = null;
    foe.buffered = null;
    by.pending = null;
    by.buffered = null;
    if (BUSY.has(by.state) || by.state === "block") by.state = "";
    this.event({ kind: "knockdown", to: foe.sessionId, knockdowns: foe.knockdowns });
    foe.state = "down";
    if (foe.knockdowns >= KNOCKDOWNS_TKO) {
      this.end("tko", by.corner, now);
      return;
    }
    foe.taps = 0;
    foe.tapTimes = [];
    this.phase = "count";
    this.roundLeft = Math.max(0, this.phaseEnd - now);
    this.countAt = now;
    this.count = 0;
    this.downed = foe.corner;
    // the standing fighter to the neutral corner further from the one down
    const down = this.host.player(foe.sessionId);
    const corner = down ? NEUTRAL_CORNERS.reduce((a, b) => (Math.hypot(b.x - down.x, b.z - down.z) > Math.hypot(a.x - down.x, a.z - down.z) ? b : a)) : NEUTRAL_CORNERS[0];
    this.host.place(by.sessionId, corner.x, corner.z, PLACE_MS.corner);
  }

  private tickCount(dt: number, now: number) {
    const f = this.downed ? this.fighters[this.downed] : undefined;
    const other = this.downed ? this.fighters[otherCorner(this.downed)] : undefined;
    if (!f || !other) return;
    // the taps fade: getting up takes a flurry, not a patient tap now and then
    f.taps = Math.max(0, f.taps - TAP_DECAY_PER_S * dt);
    const need = RECOVER_TAPS[Math.min(RECOVER_TAPS.length - 1, f.knockdowns - 1)];
    if (f.taps >= need && this.count >= MIN_COUNT_UP) {
      // up before ten (a push-up off the canvas): back to it, with a little health found
      const held = f.guardHeld;
      freshen(f, now);
      f.guardHeld = held;
      f.health = RECOVER_HEALTH[Math.min(RECOVER_HEALTH.length - 1, f.knockdowns - 1)];
      f.stamina = Math.max(60, f.stamina);
      other.state = "";
      other.pending = null;
      this.phase = "fight";
      this.phaseEnd = now + this.roundLeft;
      this.downed = null;
      this.count = 0;
      this.event({ kind: "up", to: f.sessionId });
      return;
    }
    const n = Math.floor((now - this.countAt) / (COUNT_STEP_S * 1000)) + 1;
    if (n > this.count) {
      this.count = Math.min(COUNT_TO, n);
      this.event({ kind: "count", n: this.count, to: f.sessionId });
      if (this.count >= COUNT_TO) this.end("ko", other.corner, now);
    }
  }

  private endRound(now: number) {
    this.event({ kind: "bell", round: this.round, ring: "end" });
    if (this.round < ROUNDS) {
      this.phase = "rest";
      this.phaseEnd = now + REST_S * 1000;
      for (const c of ["red", "blue"] as const) {
        const f = this.fighters[c];
        if (!f) continue;
        freshen(f, now);
        f.health = Math.min(HEALTH_MAX, f.health + REST_HEALTH);
        const at = RING_CORNERS[c].inside;
        this.host.place(f.sessionId, at.x, at.z, PLACE_MS.corner);
      }
      return;
    }
    // the final bell: the judges' cards
    const red = this.fighters.red!;
    const blue = this.fighters.blue!;
    const r = cardScore(red.dealt, blue.knockdowns);
    const b = cardScore(blue.dealt, red.knockdowns);
    if (r === b) this.end("draw", null, now);
    else this.end("decision", r > b ? "red" : "blue", now);
  }

  /** The bout is over: the records, the purse, the belt, the bets; the result on the board. The
   *  winner holds the ring (patched up to full), and the loser is walked to the bleachers a moment
   *  later; a draw (or a stop with no winner) clears the ring. */
  private end(method: BoutMethod, winner: Corner | null, now: number) {
    if (this.phase === "result" || this.phase === "open") return;
    const seconds = this.firstBell ? Math.max(0, (now - this.firstBell) / 1000) : 0;
    const w = winner ? this.fighters[winner] : undefined;
    const l = winner ? this.fighters[otherCorner(winner)] : undefined;
    // a fixed fight pays nobody: too quick, or a loser who never threw a punch (the one standing
    // still holds the ring)
    let counted = !!(winner && w);
    if (winner && (!w || !boutCounts(seconds, l ? l.strikes : 1))) {
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
    // King of the Hill: the winner stays on, patched up to full
    const stays = !!(winner && w);
    if (stays && w) {
      if (counted) w.reign++;
      const held = w.guardHeld;
      freshen(w, now);
      w.guardHeld = held;
      w.health = HEALTH_MAX;
      this.host.gesture(w.sessionId, "trophy");
    }
    const result: BoutResult = {
      winner,
      winnerName: winner && w ? w.name : "",
      loserName: winner && l ? l.name : "",
      method,
      purse,
      belt,
      stays,
      reign: stays && w ? w.reign : 0,
      payouts,
      round: Math.max(1, this.round),
      seconds: Math.round(seconds),
    };
    this.bout.result = JSON.stringify(result);
    this.host.toMap("boxResult", result);
    this.phase = "result";
    this.phaseEnd = now + RESULT_S * 1000;
    this.benchAt = now + BENCH_AFTER_S * 1000;
    this.stayer = stays ? winner : null;
    this.loserId = stays && l ? l.sessionId : null;
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
    console.log(`[ring] ${METHOD_LABEL[method]}${winner ? `: ${result.winnerName} over ${result.loserName}` : ""} (round ${result.round}, ${result.seconds}s, purse ${purse}${stays ? `, stays on (${result.reign})` : ""})`);
  }

  /** The result has been read: the winner back in their corner waiting for the next in line (a
   *  draw: both down the steps), the ring open again. */
  private afterResult(now: number) {
    if (this.loserId) this.benchLoser();
    const stay = this.stayer ? this.fighters[this.stayer] : undefined;
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f || f === stay) continue;
      delete this.fighters[c];
      this.release(f.sessionId, c);
    }
    if (stay) {
      freshen(stay, now);
      stay.health = HEALTH_MAX;
      stay.knockdowns = 0;
      stay.dealt = 0;
      stay.strikes = 0;
      const at = RING_CORNERS[stay.corner].inside;
      this.host.place(stay.sessionId, at.x, at.z, PLACE_MS.corner);
    }
    this.stayer = null;
    this.phase = "open";
    this.round = 0;
    this.firstBell = 0;
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
      this.release(f.sessionId, c);
    }
    this.phase = "open";
    this.round = 0;
    this.firstBell = 0;
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
    }
    const line = this.queue.map((q) => q.sessionId);
    if (b.queue.length !== line.length || line.some((id, i) => b.queue[i] !== id)) {
      b.queue.clear();
      for (const id of line) b.queue.push(id);
    }
    for (const id of [...b.bets.keys()]) if (!this.bets.has(id)) b.bets.delete(id);
    for (const [id, v] of this.bets) if (b.bets.get(id) !== v) b.bets.set(id, v);
    const pools = poolsOf(this.bets.values());
    if (b.poolRed !== pools.red) b.poolRed = pools.red;
    if (b.poolBlue !== pools.blue) b.poolBlue = pools.blue;
  }
}
