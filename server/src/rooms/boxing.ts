import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  BELT_MS,
  BELT_STREAK,
  BET_MAX,
  BET_MIN,
  BOUT_PURSE,
  COMPOSURE_MAX,
  CORNER_NAME,
  COUNT_STEP_S,
  COUNT_TO,
  FORFEIT_GRACE_S,
  GLOVES,
  GUARD,
  GUARD_BREAK_S,
  INTERRUPT_STUN_S,
  KNOCKDOWNS_TKO,
  MAX_TAPS_PER_S,
  METHOD_LABEL,
  MIN_COUNT_UP,
  MOVES,
  PARRY_STAGGER_S,
  PURSES_PER_HOUR,
  RECOVER_COMPOSURE,
  RECOVER_TAPS,
  REST_COMPOSURE,
  REST_S,
  RESULT_S,
  RINGOUT_COMPOSURE,
  ROPE_BOUNCE,
  ROPE_STUN_S,
  ROUNDS,
  ROUND_S,
  STAMINA_MAX,
  STAMINA_REGEN,
  SWAY,
  TAP_DECAY_PER_S,
  TIRED_SPEED,
  WARMUP_S,
  boutCounts,
  cardScore,
  encodeBet,
  isCorner,
  isGloveId,
  judgeStrike,
  moveCost,
  otherCorner,
  parseBet,
  poolsOf,
  settleBets,
  swaySide,
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
// Every punch is a wind-up and a landing: the button starts the wind-up (the gesture everyone sees)
// and the punch is judged the moment it lands (judgeStrike: slipped, out of reach, parried, blocked
// or clean), against where the two fighters stand on the server then. The server moves fighters
// itself (their corner, a knockback, the ropes' bounce, a slip, a neutral corner for the count, a
// ring-out onto the floor) with `place`, which also has the room ignore their own position reports
// for a moment so the move sticks.
//
// Fair play (Pillar 4): a fighter whose connection drops has FORFEIT_GRACE_S to come back, the
// bout frozen meanwhile; a bout decided in under NO_CONTEST_S, or whose loser never threw a punch,
// guarded or slipped, is a No Contest (every bet back, nothing paid, no record touched); a bettor who
// leaves the room gets their stake back at once. Bets are 50 to 300 coins, one ticket a bout, placed
// during the warm-up at the ringside chalkboard; the house keeps 5% of the winnings.

/** One fighter, as the room's state carries it (shared/boxing.ts FighterView). */
export class FighterSchema extends Schema {
  @type("string") sessionId = "";
  @type("string") name = "";
  @type("number") stamina = STAMINA_MAX;
  @type("number") composure = COMPOSURE_MAX;
  @type("string") state: FighterState = "";
  @type("number") knockdowns = 0;
  @type("number") taps = 0;
  @type("number") need = 0;
  @type("number") dealt = 0;
  @type("string") gloves: GloveId = "red";
  @type("boolean") away = false;
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
  /** Put a player at (x, z) (a corner, a knockback, a slip) and ignore their own position reports
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
}

interface Fighter {
  sessionId: string;
  corner: Corner;
  name: string;
  stamina: number;
  composure: number;
  state: FighterState;
  /** When a timed state (a slip, a stun, a stagger) is over (ms). */
  stateUntil: number;
  /** The punch on its way, and when it lands (ms). */
  pending: { move: BoxMove; at: number; tired: boolean } | null;
  guardSince: number;
  guardReady: number;
  jabReady: number;
  hookReady: number;
  swayReady: number;
  slipUntil: number;
  /** A Perfect Parry's free Counter Uppercut is on until then (ms). */
  counterUntil: number;
  knockdowns: number;
  taps: number;
  tapTimes: number[];
  dealt: number;
  /** Punches, guards and slips thrown this bout (a loser with none: a No Contest). */
  actions: number;
  gloves: GloveId;
  away: boolean;
  awayAt: number;
}

/** How far past the client's reach the server allows, for lag. */
const REACH_SLACK = 1.2;
/** A server-authored move holds this long against the fighter's own reports. */
const PLACE_MS = { corner: 800, knock: 280, slip: 240 };
/** Between two goes on a gym fixture (per player). */
const GYM_COOLDOWN_MS = 2600;
const HOUR_MS = 60 * 60 * 1000;

function newFighter(sessionId: string, corner: Corner, name: string, gloves: GloveId): Fighter {
  return { sessionId, corner, name, stamina: STAMINA_MAX, composure: COMPOSURE_MAX, state: "", stateUntil: 0, pending: null, guardSince: 0, guardReady: 0, jabReady: 0, hookReady: 0, swayReady: 0, slipUntil: 0, counterUntil: 0, knockdowns: 0, taps: 0, tapTimes: [], dealt: 0, actions: 0, gloves, away: false, awayAt: 0 };
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
  /** The tickets on this bout: sessionId -> encodeBet, and the bettors' names (for the payouts). */
  private readonly bets = new Map<string, string>();
  private readonly betNames = new Map<string, string>();
  private readonly gymAt = new Map<string, number>();

  constructor(
    private readonly bout: BoutSchema,
    private readonly host: RingHost
  ) {}

  // --- who is where -------------------------------------------------------------------------------

  /** The corner a session fights from in this bout (in the ring or just launched out of it). */
  cornerOf(sessionId: string): Corner | null {
    for (const c of ["red", "blue"] as const) if (this.fighters[c]?.sessionId === sessionId) return c;
    return null;
  }

  /** Whether a fighter's own position reports are to be ignored (down on the canvas, out). */
  pinned(sessionId: string): boolean {
    const c = this.cornerOf(sessionId);
    const f = c ? this.fighters[c] : undefined;
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
        this.enter(sessionId, propId === "ring_red" ? "red" : "blue");
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

  // --- stepping in and out -----------------------------------------------------------------------------

  private enter(sessionId: string, corner: Corner) {
    const p = this.host.player(sessionId);
    if (!p || p.sitting || p.action !== "") return this.notice(sessionId, "Finish what you're doing first", "🥊");
    const steps = RING_CORNERS[corner];
    if (Math.min(Math.hypot(p.x - steps.foot.x, p.z - steps.foot.z), Math.hypot(p.x - steps.steps.x, p.z - steps.steps.z)) > CORNER_REACH + REACH_SLACK) return;
    if (this.phase !== "open") return this.notice(sessionId, this.phase === "result" ? "Coach Bruno is clearing the ring: one moment" : "A bout is on: grab a seat, or a ticket at the chalkboard", "🔔");
    if (this.fighters[corner]) return this.notice(sessionId, `The ${CORNER_NAME[corner]} is taken: try the other one`, "🥊");
    if (this.cornerOf(sessionId)) return;
    const profile = this.host.profile(sessionId);
    const gloves: GloveId = profile && isGloveId(profile.worn) ? profile.worn : "red";
    const f = newFighter(sessionId, corner, p.username, gloves);
    this.fighters[corner] = f;
    p.corner = corner;
    p.gloves = gloves;
    p.holding = "";
    const at = RING_CORNERS[corner].inside;
    this.host.place(sessionId, at.x, at.z, PLACE_MS.corner);
    this.event({ kind: "enter", by: sessionId, corner });
    // both corners filled: the warm-up, and the betting window with it
    if (this.fighters.red && this.fighters.blue) {
      this.phase = "warmup";
      this.round = 0;
      this.phaseEnd = Date.now() + WARMUP_S * 1000;
      this.clearBets();
    }
    this.sync();
  }

  /** A fighter going (back down the steps, off to another world, gone from the room): during the
   *  warm-up the bets come back and the other waits on; mid-bout it is a forfeit. A bettor gone
   *  from the room gets their stake back. */
  leave(sessionId: string, why: "ring" | "travel" | "gone") {
    const corner = this.cornerOf(sessionId);
    if (why === "gone") this.refundBet(sessionId);
    if (!corner) return;
    const f = this.fighters[corner]!;
    const now = Date.now();
    if (this.phase === "open" || this.phase === "warmup") {
      if (this.phase === "warmup") {
        this.refundAll();
        this.phase = "open";
      }
      delete this.fighters[corner];
      this.release(sessionId, corner);
      this.event({ kind: "leave", by: sessionId, corner });
    } else if (this.phase === "result") {
      delete this.fighters[corner];
      this.release(sessionId, corner);
    } else {
      // mid-bout: a forfeit (a T.K.O. for the one who stays)
      f.away = false;
      this.end("forfeit", otherCorner(corner), now);
      delete this.fighters[corner];
      this.release(sessionId, corner);
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

  /** The server is going down (a deploy, a restart): whatever bout is on stops as a No Contest (no
   *  record touched, every ticket back in coins), before anyone is let go and counted a forfeit. */
  abandon() {
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
    const corner = this.cornerOf(sessionId);
    if (!corner) return;
    const f = this.fighters[corner]!;
    if (this.phase === "fight" || this.phase === "count" || this.phase === "rest") {
      f.away = true;
      f.awayAt = Date.now();
      f.pending = null;
      if (f.state === "block" || f.state === "windup") f.state = "";
      this.event({ kind: "away", by: sessionId, back: false });
      this.sync();
    } else this.leave(sessionId, "ring");
  }

  /** Back in time: the bout goes on. */
  back(sessionId: string) {
    const corner = this.cornerOf(sessionId);
    const f = corner ? this.fighters[corner] : undefined;
    if (!f || !f.away) return;
    f.away = false;
    this.event({ kind: "away", by: sessionId, back: true });
    this.sync();
  }

  /** The same person back on a new session (the room's takeOver): their corner and ticket move over. */
  transfer(oldId: string, newId: string) {
    const corner = this.cornerOf(oldId);
    if (corner) {
      const f = this.fighters[corner]!;
      f.sessionId = newId;
      f.away = false;
      const p = this.host.player(newId);
      if (p) {
        p.corner = corner;
        p.gloves = f.gloves;
      }
    }
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
      case "JAB":
      case "HOOK":
        return this.swing(sessionId, packet.type === "HOOK" ? "hook" : "jab", now);
      case "GUARD":
        return this.guard(sessionId, packet.on === true, now);
      case "SWAY":
        return this.sway(sessionId, Number(packet.dx) || 0, Number(packet.dz) || 0, now);
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
    }
  }

  /** The fighter `sessionId` is, ready to act (not stunned, staggered, down or away), in a round. */
  private ready(sessionId: string): Fighter | null {
    const corner = this.cornerOf(sessionId);
    const f = corner ? this.fighters[corner] : undefined;
    if (!f || f.away) return null;
    if (f.state === "windup" || f.state === "stun" || f.state === "stagger" || f.state === "down" || f.state === "out") return null;
    return f;
  }

  private swing(sessionId: string, wanted: BoxMove, now: number) {
    // the warm-up: shadowboxing (everyone sees it, nothing lands)
    if (this.phase === "warmup") {
      const corner = this.cornerOf(sessionId);
      const f = corner ? this.fighters[corner] : undefined;
      if (f && now >= (wanted === "hook" ? f.hookReady : f.jabReady)) {
        if (wanted === "hook") f.hookReady = now + MOVES.hook.cooldown * 1000;
        else f.jabReady = now + MOVES.jab.cooldown * 1000;
        this.host.gesture(sessionId, wanted);
      }
      return;
    }
    if (this.phase !== "fight") return;
    const f = this.ready(sessionId);
    if (!f) return;
    // a Perfect Parry's counter: the next jab is a free Counter Uppercut
    const move: BoxMove = wanted === "jab" && now < f.counterUntil ? "uppercut" : wanted;
    if (move === "hook" ? now < f.hookReady : now < f.jabReady) return;
    if (f.state === "block") f.guardReady = now + GUARD.cooldown * 1000;
    const cost = move === "uppercut" ? 0 : moveCost(move, f.gloves);
    const tired = cost > 0 && f.stamina < cost;
    f.stamina = tired ? 0 : f.stamina - cost;
    const windup = MOVES[move].windup / (tired ? TIRED_SPEED : 1);
    f.pending = { move, at: now + windup * 1000, tired };
    f.state = "windup";
    if (move === "uppercut") f.counterUntil = 0;
    f.jabReady = now + MOVES.jab.cooldown * 1000;
    if (move === "hook") f.hookReady = now + MOVES.hook.cooldown * 1000;
    f.actions++;
    this.host.gesture(sessionId, move);
    this.event({ kind: "swing", by: sessionId, move, tired, windup });
    this.sync();
  }

  private guard(sessionId: string, on: boolean, now: number) {
    if (this.phase !== "fight") return;
    const corner = this.cornerOf(sessionId);
    const f = corner ? this.fighters[corner] : undefined;
    if (!f) return;
    if (!on) {
      if (f.state === "block") this.dropGuard(f, now);
      this.sync();
      return;
    }
    if (!this.ready(sessionId) || f.state === "block" || now < f.guardReady) return;
    f.state = "block";
    f.guardSince = now;
    f.stamina = Math.max(0, f.stamina - GUARD.raise);
    f.actions++;
    if (f.stamina <= 0) this.guardBreak(f, now);
    this.sync();
  }

  private dropGuard(f: Fighter, now: number) {
    f.state = "";
    f.guardReady = now + GUARD.cooldown * 1000;
  }

  private guardBreak(f: Fighter, now: number) {
    f.state = "stun";
    f.stateUntil = now + GUARD_BREAK_S * 1000;
    f.stamina = 0;
    f.guardReady = now + GUARD.cooldown * 1000;
    this.event({ kind: "guardbreak", to: f.sessionId });
  }

  private sway(sessionId: string, dx: number, dz: number, now: number) {
    if (this.phase !== "fight") return;
    const f = this.ready(sessionId);
    if (!f || now < f.swayReady) return;
    const me = this.host.player(sessionId);
    const foe = this.fighters[otherCorner(f.corner)];
    const them = foe ? this.host.player(foe.sessionId) : undefined;
    if (!me) return;
    const facing = them ? { x: them.x - me.x, z: them.z - me.z } : { x: 0, z: -1 };
    let dir = { x: dx, z: dz };
    const len = Math.hypot(dir.x, dir.z);
    if (!Number.isFinite(len) || len < 0.05) {
      // no direction: straight back, away from the other fighter
      const fl = Math.hypot(facing.x, facing.z) || 1;
      dir = { x: -facing.x / fl, z: -facing.z / fl };
    } else dir = { x: dir.x / len, z: dir.z / len };
    if (f.state === "block") f.guardReady = now + GUARD.cooldown * 1000;
    const to = clampToRing(me.x + dir.x * SWAY.distance, me.z + dir.z * SWAY.distance);
    this.host.place(sessionId, to.x, to.z, PLACE_MS.slip);
    f.slipUntil = now + SWAY.iframes * 1000;
    f.state = "sway";
    f.stateUntil = now + 350;
    f.swayReady = now + SWAY.cooldown * 1000;
    f.stamina = Math.max(0, f.stamina - SWAY.stamina);
    f.actions++;
    const side = swaySide(facing, dir);
    this.host.gesture(sessionId, side === "L" ? "slipL" : side === "R" ? "slipR" : "slipB");
    this.event({ kind: "sway", by: sessionId, side });
    this.sync();
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
    if (this.phase !== "warmup") return this.notice(sessionId, "Bets are taken during the warm-up, before the bell", "🎟️");
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

  tick(dt: number) {
    const now = Date.now();
    this.prune();
    if (this.phase === "fight" || this.phase === "count" || this.phase === "rest") {
      // a fighter's connection is down: the bout waits for them (every clock shifted on), and gives
      // up after FORFEIT_GRACE_S
      const away = (["red", "blue"] as const).map((c) => this.fighters[c]).find((f) => f?.away);
      if (away) {
        if (now - away.awayAt >= FORFEIT_GRACE_S * 1000) {
          this.end("forfeit", otherCorner(away.corner), now);
          const gone = away.sessionId;
          delete this.fighters[away.corner];
          this.release(gone, away.corner);
        } else this.shift(dt * 1000);
        this.sync();
        return;
      }
    }
    switch (this.phase) {
      case "warmup":
        if (now >= this.phaseEnd) this.startRound(1, now);
        break;
      case "fight":
        this.fight(dt, now);
        break;
      case "count":
        this.tickCount(dt, now);
        break;
      case "rest":
        if (now >= this.phaseEnd) this.startRound(this.round + 1, now);
        break;
      case "result":
        if (now >= this.phaseEnd) this.clearRing();
        break;
    }
    this.sync();
  }

  /** Fighters who are no longer on the map (a trip the room didn't tell us of, a lost session). */
  private prune() {
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f) continue;
      const p = this.host.player(f.sessionId);
      if (!p) {
        if (this.phase === "fight" || this.phase === "count" || this.phase === "rest") this.end("forfeit", otherCorner(c), Date.now());
        delete this.fighters[c];
        if (this.phase === "warmup") {
          this.refundAll();
          this.phase = "open";
        }
      } else if (p.map !== "boxing_ring" && this.phase !== "result") this.leave(f.sessionId, "travel");
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
      f.guardSince += ms;
      f.guardReady += ms;
      f.jabReady += ms;
      f.hookReady += ms;
      f.swayReady += ms;
      f.slipUntil += ms;
      f.counterUntil += ms;
      if (f.pending) f.pending.at += ms;
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
      f.stamina = STAMINA_MAX;
      if (round === 1) f.composure = COMPOSURE_MAX;
      f.state = "";
      f.pending = null;
      f.guardReady = f.jabReady = f.hookReady = f.swayReady = now;
      f.counterUntil = 0;
      const at = RING_CORNERS[c].inside;
      this.host.place(f.sessionId, at.x, at.z, PLACE_MS.corner);
    }
    this.event({ kind: "bell", round, ring: "start" });
  }

  private fight(dt: number, now: number) {
    const red = this.fighters.red;
    const blue = this.fighters.blue;
    if (!red || !blue) return;
    // the punches landing now, the earliest first (two landing together both land)
    const due = [red, blue].filter((f) => f.pending && now >= f.pending.at).sort((a, b) => a.pending!.at - b.pending!.at);
    for (const f of due) {
      if (this.phase !== "fight") break;
      this.land(f, now);
    }
    if (this.phase !== "fight") return;
    for (const f of [red, blue]) {
      // timed states wear off; a guard drops by itself after its longest hold, and drains stamina
      if ((f.state === "sway" || f.state === "stun" || f.state === "stagger") && now >= f.stateUntil) f.state = "";
      if (f.state === "block") {
        f.stamina -= GUARD.drain * dt;
        if (f.stamina <= 0) this.guardBreak(f, now);
        else if (now - f.guardSince >= GUARD.maxHold * 1000) this.dropGuard(f, now);
      } else if (f.state !== "windup") f.stamina = Math.min(STAMINA_MAX, f.stamina + STAMINA_REGEN * dt);
    }
    if (now >= this.phaseEnd) this.endRound(now);
  }

  /** `f`'s punch lands: judged against the other fighter as they stand now. */
  private land(f: Fighter, now: number) {
    const shot = f.pending!;
    f.pending = null;
    if (f.state === "windup") f.state = "";
    const foe = this.fighters[otherCorner(f.corner)];
    const me = this.host.player(f.sessionId);
    const them = foe ? this.host.player(foe.sessionId) : undefined;
    if (!foe || !me || !them) return;
    const dx = them.x - me.x;
    const dz = them.z - me.z;
    const distance = Math.hypot(dx, dz);
    const outcome = judgeStrike(shot.move, shot.tired, distance, now / 1000, { state: foe.state, guardSince: foe.guardSince / 1000, slipUntil: foe.slipUntil / 1000, hookWindup: foe.pending?.move === "hook", stamina: foe.stamina });
    // the way a punch pushes: from the puncher to the punched (straight at them, standing on them)
    const dir = distance > 0.05 ? { x: dx / distance, z: dz / distance } : { x: Math.sign(them.x - RING.x) || 1, z: 0 };
    switch (outcome.kind) {
      case "whiff":
        this.event({ kind: "whiff", by: f.sessionId, to: foe.sessionId, move: shot.move, slipped: outcome.slipped });
        return;
      case "parry":
        // the puncher staggers; the parrier's guard is ready again, and their next jab is a counter
        f.state = "stagger";
        f.stateUntil = now + PARRY_STAGGER_S * 1000;
        foe.state = "";
        foe.guardReady = now;
        foe.counterUntil = now + (PARRY_STAGGER_S + 0.25) * 1000;
        this.event({ kind: "parry", by: foe.sessionId, to: f.sessionId });
        return;
      case "block":
        foe.composure = Math.max(0, foe.composure - outcome.damage);
        foe.stamina = Math.max(0, foe.stamina - outcome.stamina);
        f.dealt += outcome.damage;
        this.event({ kind: "block", by: f.sessionId, to: foe.sessionId, move: shot.move, damage: outcome.damage });
        if (outcome.guardBreak) this.guardBreak(foe, now);
        this.push(foe, them, dir, MOVES[shot.move].knockback * 0.4, false, now);
        if (foe.composure <= 0) this.knockDown(f, foe, now);
        return;
      case "hit": {
        foe.composure = Math.max(0, foe.composure - outcome.damage);
        f.dealt += outcome.damage;
        if (outcome.interrupt) {
          // a jab into a Heavy Hook's wind-up knocks it out
          foe.pending = null;
          foe.state = "stun";
          foe.stateUntil = now + INTERRUPT_STUN_S * 1000;
          this.event({ kind: "interrupt", by: f.sessionId, to: foe.sessionId });
        }
        if (foe.state === "sway") foe.state = "";
        this.event({ kind: "hit", by: f.sessionId, to: foe.sessionId, move: shot.move, damage: outcome.damage, tired: shot.tired });
        const out = this.push(foe, them, dir, MOVES[shot.move].knockback, shot.move === "hook", now);
        if (out) return;
        if (foe.composure <= 0) this.knockDown(f, foe, now);
        return;
      }
    }
  }

  /**
   * Knocks `foe` (standing at `at`) back along `dir` by `by`. Into the ropes: a Heavy Hook on a
   * fighter with little composure left sends them through them (Ring-Out: returns true, the bout
   * over); otherwise they bounce back off them, stunned a moment after a hook.
   */
  private push(foe: Fighter, at: { x: number; z: number }, dir: { x: number; z: number }, by: number, hook: boolean, now: number): boolean {
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
    if (hook && foe.composure <= RINGOUT_COMPOSURE) {
      // launched through the ropes onto the floor: Ring-Out
      const land = ringOutLanding(side, side === "e" || side === "w" ? tz - RING.z : tx - RING.x);
      foe.state = "out";
      foe.pending = null;
      this.host.place(foe.sessionId, land.x, land.z, PLACE_MS.corner);
      const p = this.host.player(foe.sessionId);
      if (p) p.corner = "";
      this.event({ kind: "ringout", to: foe.sessionId, side });
      this.end("ringout", otherCorner(foe.corner), now);
      return true;
    }
    // off the ropes: back in from them
    const kept = clampToRing(tx, tz);
    const bounce = hook ? ROPE_BOUNCE : 0;
    const back = clampToRing(kept.x - (side === "e" ? bounce : side === "w" ? -bounce : 0), kept.z - (side === "s" ? bounce : side === "n" ? -bounce : 0));
    this.host.place(foe.sessionId, back.x, back.z, PLACE_MS.knock);
    if (hook && foe.state !== "stun") {
      foe.state = "stun";
      foe.stateUntil = now + ROPE_STUN_S * 1000;
      foe.pending = null;
    }
    this.event({ kind: "ropes", to: foe.sessionId, side });
    return false;
  }

  /** `foe` goes down: a third time is a T.K.O.; otherwise Coach Bruno counts, and `by` waits in a
   *  neutral corner. */
  private knockDown(by: Fighter, foe: Fighter, now: number) {
    foe.knockdowns++;
    foe.pending = null;
    by.pending = null;
    if (by.state === "windup" || by.state === "block") by.state = "";
    this.event({ kind: "knockdown", to: foe.sessionId, knockdowns: foe.knockdowns });
    if (foe.knockdowns >= KNOCKDOWNS_TKO) {
      foe.state = "down";
      this.end("tko", by.corner, now);
      return;
    }
    foe.state = "down";
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
      // up before ten: back to it, with a little composure found
      f.state = "";
      f.composure = RECOVER_COMPOSURE[Math.min(RECOVER_COMPOSURE.length - 1, f.knockdowns - 1)];
      f.stamina = Math.max(f.stamina, 60);
      f.taps = 0;
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
        f.state = "";
        f.pending = null;
        f.stamina = STAMINA_MAX;
        f.composure = Math.min(COMPOSURE_MAX, f.composure + REST_COMPOSURE);
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

  /** The bout is over: the records, the purse, the belt, the bets; the result on the board. */
  private end(method: BoutMethod, winner: Corner | null, now: number) {
    if (this.phase === "result" || this.phase === "open") return;
    const seconds = this.firstBell ? Math.max(0, (now - this.firstBell) / 1000) : 0;
    const w = winner ? this.fighters[winner] : undefined;
    const l = winner ? this.fighters[otherCorner(winner)] : undefined;
    // a fixed fight pays nobody: too quick, or a loser who never threw a thing
    if (winner && (!w || !l || !boutCounts(seconds, l.actions))) {
      method = "nocontest";
      winner = null;
    }
    const paid = settleBets(this.bets, winner);
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
    if (winner && w && l) {
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
      this.host.gesture(w.sessionId, "trophy");
      if (belt) this.host.shout("boxBelt", { name: w.name, sessionId: w.sessionId });
    }
    const result: BoutResult = {
      winner,
      winnerName: winner && w ? w.name : "",
      loserName: winner && l ? l.name : "",
      method,
      purse,
      belt,
      payouts,
      round: Math.max(1, this.round),
      seconds: Math.round(seconds),
    };
    this.bout.result = JSON.stringify(result);
    this.host.toMap("boxResult", result);
    this.phase = "result";
    this.phaseEnd = now + RESULT_S * 1000;
    this.downed = null;
    this.count = 0;
    for (const c of ["red", "blue"] as const) {
      const f = this.fighters[c];
      if (!f) continue;
      f.pending = null;
      f.away = false;
      if (f.state !== "down" && f.state !== "out") f.state = "";
    }
    this.clearBets(false);
    console.log(`[ring] ${METHOD_LABEL[method]}${winner ? `: ${result.winnerName} over ${result.loserName}` : ""} (round ${result.round}, ${result.seconds}s, purse ${purse})`);
  }

  /** The result has been read: both fighters down the steps, the ring open again. */
  private clearRing() {
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
      set("stamina", f ? Math.round(f.stamina) : STAMINA_MAX);
      set("composure", f ? Math.round(f.composure) : COMPOSURE_MAX);
      set("state", f?.state ?? "");
      set("knockdowns", f?.knockdowns ?? 0);
      set("taps", f ? Math.floor(f.taps) : 0);
      set("need", f && this.phase === "count" && this.downed === c ? RECOVER_TAPS[Math.min(RECOVER_TAPS.length - 1, f.knockdowns - 1)] : 0);
      set("dealt", f?.dealt ?? 0);
      set("gloves", f?.gloves ?? "red");
      set("away", f?.away ?? false);
    }
    for (const id of [...b.bets.keys()]) if (!this.bets.has(id)) b.bets.delete(id);
    for (const [id, v] of this.bets) if (b.bets.get(id) !== v) b.bets.set(id, v);
    const pools = poolsOf(this.bets.values());
    if (b.poolRed !== pools.red) b.poolRed = pools.red;
    if (b.poolBlue !== pools.blue) b.poolBlue = pools.blue;
  }
}
