// The Velvet Lounge's 8-ball table: its physics and its rules, shared so a two-player match replays
// every shot identically on every client (the same code, fixed steps, and only +, -, *, / and sqrt,
// which JavaScript computes the same everywhere), and so the server can rule on each shot.
//
// The table is drawn top-down in its own units (W x H, the cushions RAIL in from the edge). A shot
// is an angle and a power; the simulation runs in fixed steps of 1/120 s until every ball rests.
//
// Shared between client and server — framework-agnostic (no THREE/Colyseus imports).

export const POOL_W = 800;
export const POOL_H = 420;
export const POOL_RAIL = 26;
export const POOL_R = 10.5;
export const POOL_POCKET = 19;
export const POOL_STEP = 1 / 120;
const FRICTION = 0.985; // per step
const STOP = 3;
const CUSHION = 0.78;
const RESTITUTION = 0.96;
export const POOL_MAX_POWER = 1150;

export const POOL_POCKETS: [number, number][] = [
  [POOL_RAIL, POOL_RAIL],
  [POOL_W / 2, POOL_RAIL - 4],
  [POOL_W - POOL_RAIL, POOL_RAIL],
  [POOL_RAIL, POOL_H - POOL_RAIL],
  [POOL_W / 2, POOL_H - POOL_RAIL + 4],
  [POOL_W - POOL_RAIL, POOL_H - POOL_RAIL],
];
export const POOL_HEAD = { x: POOL_RAIL + (POOL_W - 2 * POOL_RAIL) * 0.25, y: POOL_H / 2 };

export interface PoolBall {
  n: number;
  x: number;
  y: number;
  in: boolean;
}
export type PoolGroup = "solids" | "stripes";
export const poolGroupOf = (n: number): PoolGroup | null => (n >= 1 && n <= 7 ? "solids" : n >= 9 ? "stripes" : null);

/** A fresh rack: the 8 in the middle of the third row, the cue ball on the head spot. */
export function poolRack(): PoolBall[] {
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const balls: PoolBall[] = [{ n: 0, x: POOL_HEAD.x, y: POOL_HEAD.y, in: false }];
  const fx = POOL_RAIL + (POOL_W - 2 * POOL_RAIL) * 0.72;
  let k = 0;
  for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) balls.push({ n: order[k++], x: fx + row * POOL_R * 1.76, y: POOL_H / 2 + (i - row / 2) * (POOL_R * 2 + 0.6), in: false });
  return balls;
}

/** Whether the cue ball may be put down at (x, y) (ball in hand): on the cloth, clear of every ball. */
export function poolCueSpotFree(balls: PoolBall[], x: number, y: number): boolean {
  if (x < POOL_RAIL + POOL_R || x > POOL_W - POOL_RAIL - POOL_R || y < POOL_RAIL + POOL_R || y > POOL_H - POOL_RAIL - POOL_R) return false;
  return balls.every((b) => b.n === 0 || b.in || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) > 4 * POOL_R * POOL_R);
}

interface SimBall extends PoolBall {
  vx: number;
  vy: number;
}

/** One shot, stepped: `step()` advances 1/120 s and says what happened in it (for the sounds). */
export class PoolSim {
  balls: SimBall[];
  /** The balls pocketed, in order. */
  potted: number[] = [];
  /** The first ball the cue ball touched (-1: none). */
  firstHit = -1;

  constructor(balls: PoolBall[]) {
    this.balls = balls.map((b) => ({ ...b, vx: 0, vy: 0 }));
  }

  /** Strikes the cue ball (placing it first, for a ball in hand). */
  shoot(angle: number, power: number, cue: { x: number; y: number } | null = null) {
    const c = this.balls[0];
    if (cue) {
      c.x = cue.x;
      c.y = cue.y;
      c.in = false;
    }
    const p = Math.max(0, Math.min(1, power)) * POOL_MAX_POWER;
    c.vx = Math.cos(angle) * p;
    c.vy = Math.sin(angle) * p;
  }

  get moving(): boolean {
    return this.balls.some((b) => !b.in && (b.vx !== 0 || b.vy !== 0));
  }

  step(): { clacks: number[]; pots: number[] } {
    const dt = POOL_STEP;
    const clacks: number[] = [];
    const pots: number[] = [];
    const bs = this.balls;
    for (const b of bs) {
      if (b.in) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      if (b.vx * b.vx + b.vy * b.vy < STOP * STOP) b.vx = b.vy = 0;
      for (const [px, py] of POOL_POCKETS) {
        if ((b.x - px) * (b.x - px) + (b.y - py) * (b.y - py) < POOL_POCKET * POOL_POCKET) {
          b.in = true;
          b.vx = b.vy = 0;
          this.potted.push(b.n);
          pots.push(b.n);
          break;
        }
      }
      if (b.in) continue;
      if (b.x < POOL_RAIL + POOL_R) (b.x = POOL_RAIL + POOL_R), (b.vx = Math.abs(b.vx) * CUSHION);
      if (b.x > POOL_W - POOL_RAIL - POOL_R) (b.x = POOL_W - POOL_RAIL - POOL_R), (b.vx = -Math.abs(b.vx) * CUSHION);
      if (b.y < POOL_RAIL + POOL_R) (b.y = POOL_RAIL + POOL_R), (b.vy = Math.abs(b.vy) * CUSHION);
      if (b.y > POOL_H - POOL_RAIL - POOL_R) (b.y = POOL_H - POOL_RAIL - POOL_R), (b.vy = -Math.abs(b.vy) * CUSHION);
    }
    // ball on ball: equal masses, nearly elastic; the pair is pushed apart first so they never stick
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        if (a.in || b.in) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * POOL_R * POOL_R || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = POOL_R * 2 - d;
        a.x -= (nx * overlap) / 2;
        a.y -= (ny * overlap) / 2;
        b.x += (nx * overlap) / 2;
        b.y += (ny * overlap) / 2;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        if (this.firstHit < 0 && (a.n === 0 || b.n === 0)) this.firstHit = a.n === 0 ? b.n : a.n;
        const imp = rel * RESTITUTION;
        a.vx -= imp * nx;
        a.vy -= imp * ny;
        b.vx += imp * nx;
        b.vy += imp * ny;
        clacks.push(rel);
      }
    return { clacks, pots };
  }

  /** Runs to rest (a cap of 60 s of table time, which no shot needs). */
  run(): this {
    for (let i = 0; i < 7200 && this.moving; i++) this.step();
    return this;
  }

  snapshot(): PoolBall[] {
    return this.balls.map((b) => ({ n: b.n, x: b.x, y: b.y, in: b.in }));
  }
}

// --- the rules of a match (the server rules on every shot the shooter reports) -------------------

export interface PoolPlayer {
  sessionId: string;
  username: string;
  group: PoolGroup | null;
}
export type PoolPhase = "waiting" | "playing" | "over";
/** Server -> everyone ("poolState"): the lounge table's two-player match. */
export interface PoolMatch {
  phase: PoolPhase;
  players: PoolPlayer[];
  /** Whose shot (an index into players). */
  turn: number;
  /** The shooter may place the cue ball anywhere first (after a foul). */
  ballInHand: boolean;
  /** The next shot opens the rack. */
  breakShot: boolean;
  balls: PoolBall[];
  shotId: number;
  /** A shot in the air (everyone is replaying it): the next state waits for its result. */
  pending: boolean;
  winner: string;
  say: string;
}
/** Server -> everyone ("poolShot"): a shot to replay from the last state's balls. */
export interface PoolShotEvent {
  shotId: number;
  by: string;
  angle: number;
  power: number;
  cue: { x: number; y: number } | null;
}

export function emptyPoolMatch(): PoolMatch {
  return { phase: "waiting", players: [], turn: 0, ballInHand: false, breakShot: true, balls: poolRack(), shotId: 0, pending: false, winner: "", say: "Join the table for a game of 8-ball" };
}

const left = (balls: PoolBall[], group: PoolGroup | null) => (group ? balls.filter((b) => !b.in && poolGroupOf(b.n) === group).length : 7);

/** The match after a shot: fouls (a scratch, no ball hit, the wrong ball first), groups taken, the
 *  turn kept or passed with ball in hand, the 8 won or lost. `before` is the table as the shot
 *  began, `after` where the balls came to rest. */
export function ruleOnShot(m: PoolMatch, before: PoolBall[], after: PoolBall[], potted: number[], firstHit: number): PoolMatch {
  const next: PoolMatch = { ...m, players: m.players.map((p) => ({ ...p })), pending: false, ballInHand: false, breakShot: false };
  const me = next.players[m.turn];
  const other = next.players[1 - m.turn];
  const mineBefore = left(before, me.group);
  const scratch = potted.includes(0);
  const eight = potted.includes(8);
  const onEight = me.group !== null && mineBefore === 0;
  let foul = scratch || firstHit < 0;
  if (!foul && me.group) foul = onEight ? firstHit !== 8 : poolGroupOf(firstHit) !== me.group;
  else if (!foul && !m.breakShot && firstHit === 8) foul = true;
  // the cue ball back on the table after a scratch (the next shooter places it)
  const balls = after.map((b) => (b.n === 0 && b.in ? { ...b, in: false, x: POOL_HEAD.x, y: POOL_HEAD.y } : { ...b }));
  next.balls = balls;

  if (eight) {
    if (m.breakShot) {
      // the 8 on the break: a fresh rack, the same player breaks again
      return { ...next, balls: poolRack(), breakShot: true, say: `The 8 dropped on the break: ${me.username} re-racks and breaks again` };
    }
    const won = !foul && onEight;
    const winner = won ? me : other;
    return { ...next, phase: "over", winner: winner.sessionId, say: won ? `${me.username} sinks the 8 and wins! 🎱` : `${me.username} ${foul ? "fouls on" : "sinks"} the 8 too soon: ${other.username} wins!` };
  }
  // an open table: the first ball legally pocketed (not on the break) sets the groups
  const legal = potted.filter((n) => n !== 0 && n !== 8);
  if (!me.group && !m.breakShot && !foul && legal.length > 0) {
    me.group = poolGroupOf(legal[0]);
    other.group = me.group === "solids" ? "stripes" : "solids";
  }
  const pottedMine = me.group ? legal.some((n) => poolGroupOf(n) === me.group) : legal.length > 0;
  if (foul) {
    next.turn = 1 - m.turn;
    next.ballInHand = true;
    const why = scratch ? "scratched" : firstHit < 0 ? "hit nothing" : "hit the wrong ball first";
    return { ...next, say: `Foul: ${me.username} ${why}. Ball in hand for ${other.username}` };
  }
  if (pottedMine) return { ...next, say: `${me.username} pots and shoots again${me.group ? ` (${left(balls, me.group)} ${me.group} left)` : ""}` };
  next.turn = 1 - m.turn;
  return { ...next, say: `${other.username} to shoot${other.group ? ` (${left(balls, other.group)} ${other.group} left)` : ""}` };
}
