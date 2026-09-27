// "Velvet Nights", the pinball machines' table and its physics, shared by the panel that plays it
// (client PinballModal) and the server, which replays a finished game from its inputs to find the
// score it pays on (server/src/rooms/casino.ts): the same inputs make the same game everywhere.
//
// A steel ball under gravity on a 1 x 1.8 table (x across, y down toward the flippers): walls and
// guides, three pop bumpers that kick, two slingshots, a bank of four drop targets (all four down: a
// bonus, and they spring back), three rollover lanes at the top (all lit: the multiplier climbs),
// the plunger in its lane on the right. Three balls a game.
//
// Determinism: the table steps at a fixed PINBALL_STEP_S, and at run time uses only + - * / and
// sqrt, which every JavaScript engine rounds alike (never Math.hypot, sin or cos); the few
// trigonometric constants (the arch, the flippers' limits and their turn per step) are worked out
// once and rounded to a billionth, which every engine agrees on. The flippers turn a direction
// vector by that fixed rotation instead of integrating an angle.
//
// Inputs, as a game records them for the replay: [step, code] pairs in the order they happened,
// each applied just before that step runs. Codes: 0 / 1 the left flipper up / down, 2 / 3 the right
// one's, and 1000 + permille a launch at that strength (the plunger let go of).

/** The sounds the table asks for (each one of the client's effects, audio/sfx.ts). */
export type PinballSound = "flipper" | "bumper" | "plunger" | "drain" | "clack" | "sparkle" | "chime";

export type V = { x: number; y: number };
type Seg = { a: V; b: V; r: number; e: number; kick?: number };
type Bumper = { c: V; r: number; flash: number };
type Target = { a: V; b: V; down: boolean; flash: number };
type Lane = { x: number; lit: boolean };
export type Flipper = { p: V; len: number; d: V; rest: V; up: V; w: number; on: boolean; side: -1 | 1 };

export const TABLE_W = 1;
export const TABLE_H = 1.8;
export const BALL_R = 0.022;
export const LANE_X = 0.88;
export const BALLS = 3;
/** The fixed step the table runs at, and so the steps in a second. */
export const PINBALL_STEPS_PER_S = 360;
export const PINBALL_STEP_S = 1 / PINBALL_STEPS_PER_S;
/** The longest game the server replays (then it is over, whatever is left). */
export const PINBALL_MAX_STEPS = PINBALL_STEPS_PER_S * 60 * 20;
/** The most inputs a game may bring (each flip is two). */
export const PINBALL_MAX_INPUTS = 40_000;
export const PIN_LEFT_UP = 0;
export const PIN_LEFT_DOWN = 1;
export const PIN_RIGHT_UP = 2;
export const PIN_RIGHT_DOWN = 3;
export const PIN_LAUNCH = 1000;

/** What the table's targets are worth (times the multiplier). */
export const PINBALL_POINTS = { sling: 3, bumper: 25, target: 125, bank: 500, lane: 60 } as const;

const GRAVITY = 2.3;
const MAX_SPEED = 4.6;
const FLIP_UP_W = 26;
const FLIP_DOWN_W = 14;
/** Where the ball sits on the plunger's tip (the panel draws it drawn back while pulled). */
export const PLUNGER_Y = 1.7;
export const PLUNGER_DRAW = 0.06;
const START_X = 0.92;

/** A trigonometric constant rounded to a billionth: the same in every engine. */
const q = (n: number) => Math.round(n * 1e9) / 1e9;
const dirOf = (a: number): V => ({ x: q(Math.cos(a)), y: q(Math.sin(a)) });
const UP_ROT = { c: q(Math.cos(FLIP_UP_W * PINBALL_STEP_S)), s: q(Math.sin(FLIP_UP_W * PINBALL_STEP_S)) };
const DOWN_ROT = { c: q(Math.cos(FLIP_DOWN_W * PINBALL_STEP_S)), s: q(Math.sin(FLIP_DOWN_W * PINBALL_STEP_S)) };

const v = (x: number, y: number): V => ({ x, y });

export interface PinballTable {
  segs: Seg[];
  bumpers: Bumper[];
  targets: Target[];
  lanes: Lane[];
  flippers: Flipper[];
}

function buildTable(): PinballTable {
  const segs: Seg[] = [];
  const wall = (a: V, b: V, e = 0.45) => segs.push({ a, b, r: 0.008, e });
  // the arch across the top, its centre (0.5, 0.5)
  const arch: V[] = [];
  for (let k = 0; k <= 18; k++) {
    const d = dirOf((Math.PI * k) / 18);
    arch.push(v(q(0.5 + 0.46 * d.x), q(0.5 - 0.46 * d.y)));
  }
  for (let k = 0; k < arch.length - 1; k++) wall(arch[k], arch[k + 1]);
  wall(v(0.04, 0.5), v(0.04, 1.28));
  wall(v(0.96, 0.5), v(0.96, TABLE_H));
  // the plunger lane's inner wall
  wall(v(LANE_X, 0.56), v(LANE_X, TABLE_H));
  // the inlane guides down to the flippers
  wall(v(0.04, 1.28), v(0.27, 1.5));
  wall(v(LANE_X, 1.28), v(0.63, 1.5));
  // the slingshots, triangles standing clear of the guides (the inlane runs round them and under
  // them to the flipper, never narrower than a ball and a half): their inner faces kick
  segs.push({ a: v(0.13, 1.08), b: v(0.23, 1.36), r: 0.01, e: 0.6, kick: 1.3 });
  wall(v(0.13, 1.08), v(0.13, 1.27));
  wall(v(0.13, 1.27), v(0.23, 1.36));
  segs.push({ a: v(0.77, 1.08), b: v(0.67, 1.36), r: 0.01, e: 0.6, kick: 1.3 });
  wall(v(0.77, 1.08), v(0.77, 1.27));
  wall(v(0.77, 1.27), v(0.67, 1.36));
  // the posts between the rollover lanes
  for (const x of [0.28, 0.4, 0.52, 0.64]) wall(v(x, 0.12), v(x, 0.22), 0.3);
  const flipper = (px: number, rest: number, up: number, side: -1 | 1): Flipper => {
    const r = dirOf(rest);
    return { p: v(px, 1.53), len: 0.15, d: { ...r }, rest: r, up: dirOf(up), w: 0, on: false, side };
  };
  return {
    segs,
    bumpers: [
      { c: v(0.3, 0.46), r: 0.055, flash: 0 },
      { c: v(0.58, 0.46), r: 0.055, flash: 0 },
      { c: v(0.44, 0.64), r: 0.055, flash: 0 },
    ],
    targets: [0, 1, 2, 3].map((k) => ({ a: v(q(0.25 + k * 0.09), 0.92), b: v(q(0.31 + k * 0.09), 0.92), down: false, flash: 0 })),
    lanes: [0.34, 0.46, 0.58].map((x) => ({ x, lit: false })),
    // at rest their tips stand a ball and a half apart: an unplayed ball drains between them
    flippers: [flipper(0.27, 0.52, -0.5, -1), flipper(0.63, Math.PI - 0.52, Math.PI + 0.5, 1)],
  };
}

export interface PinballGame {
  table: PinballTable;
  pos: V;
  vel: V;
  /** The ball sits on the plunger's tip (a launch only works then). */
  resting: boolean;
  score: number;
  mult: number;
  ball: number;
  over: boolean;
  /** Steps run, the game's seconds, and when the drop targets and the lane lights reset. */
  steps: number;
  t: number;
  targetsBackAt: number;
  lanesOffAt: number;
  /** Sounds to play, taken by the panel each frame (none kept while `quiet`: the server's replay). */
  sounds: [PinballSound, number][];
  quiet: boolean;
}

export function newPinballGame(quiet = false): PinballGame {
  return { table: buildTable(), pos: v(START_X, PLUNGER_Y), vel: v(0, 0), resting: true, score: 0, mult: 1, ball: 1, over: false, steps: 0, t: 0, targetsBackAt: 0, lanesOffAt: 0, sounds: [], quiet };
}

export const flipperTip = (f: Flipper): V => v(f.p.x + f.d.x * f.len, f.p.y + f.d.y * f.len);

function sound(g: PinballGame, kind: PinballSound, vol: number) {
  if (!g.quiet) g.sounds.push([kind, vol]);
}

/** One input (see the codes above). */
export function applyPinballInput(g: PinballGame, code: number) {
  if (code >= PIN_LAUNCH) return launch(g, Math.max(0, Math.min(1000, code - PIN_LAUNCH)) / 1000);
  const f = g.table.flippers[code === PIN_LEFT_UP || code === PIN_LEFT_DOWN ? 0 : 1];
  const on = code === PIN_LEFT_UP || code === PIN_RIGHT_UP;
  if (on && !f.on) sound(g, "flipper", 0.6);
  f.on = on;
}

/** The plunger let go at `strength` (0 to 1): the ball on it is fired up the lane. */
function launch(g: PinballGame, strength: number) {
  if (g.over || !g.resting || strength < 0.05) return;
  g.pos = v(START_X, PLUNGER_Y);
  g.vel = v(0, -(1.9 + 2.5 * strength));
  g.resting = false;
  sound(g, "plunger", 0.7);
}

function closest(p: V, a: V, b: V): V {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
  return v(a.x + abx * t, a.y + aby * t);
}

/** Pushes the ball out of a circle of radius `min` round q; its normal, or null if not touching. */
function separate(p: V, qp: V, min: number): V | null {
  const dx = p.x - qp.x;
  const dy = p.y - qp.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return null;
  const d = Math.sqrt(d2);
  const n = v(dx / d, dy / d);
  p.x += n.x * (min - d);
  p.y += n.y * (min - d);
  return n;
}

/** Bounces a velocity off a surface with normal n: `k` is 1 + restitution. */
function bounce(vel: V, n: V, k: number) {
  const vn = vel.x * n.x + vel.y * n.y;
  if (vn < 0) {
    vel.x -= k * vn * n.x;
    vel.y -= k * vn * n.y;
  }
  return vn;
}

function addScore(g: PinballGame, n: number) {
  g.score += n * g.mult;
}

/** A flipper turned one step toward where it is held (up) or falls (rest). */
function turnFlipper(f: Flipper) {
  const target = f.on ? f.up : f.rest;
  const rot = f.on ? UP_ROT : DOWN_ROT;
  const cross = f.d.x * target.y - f.d.y * target.x;
  const dot = f.d.x * target.x + f.d.y * target.y;
  if (dot >= rot.c) {
    // within a step of it: there
    f.d = { ...target };
    f.w = 0;
    return;
  }
  const sgn = cross >= 0 ? 1 : -1;
  const s = rot.s * sgn;
  const nx = f.d.x * rot.c - f.d.y * s;
  const ny = f.d.x * s + f.d.y * rot.c;
  const n = Math.sqrt(nx * nx + ny * ny);
  f.d = v(nx / n, ny / n);
  f.w = sgn * (f.on ? FLIP_UP_W : FLIP_DOWN_W);
}

/** One fixed step of the machine. */
export function stepPinball(g: PinballGame) {
  const T = g.table;
  const dt = PINBALL_STEP_S;
  g.steps++;
  g.t += dt;
  if (g.targetsBackAt && g.t >= g.targetsBackAt) {
    g.targetsBackAt = 0;
    for (const tg of T.targets) tg.down = false;
  }
  if (g.lanesOffAt && g.t >= g.lanesOffAt) {
    g.lanesOffAt = 0;
    for (const l of T.lanes) l.lit = false;
  }
  for (const f of T.flippers) turnFlipper(f);
  if (g.over) return;
  const p = g.pos;
  const vel = g.vel;
  vel.y += GRAVITY * dt;
  const sp2 = vel.x * vel.x + vel.y * vel.y;
  if (sp2 > MAX_SPEED * MAX_SPEED) {
    const k = MAX_SPEED / Math.sqrt(sp2);
    vel.x *= k;
    vel.y *= k;
  }
  p.x += vel.x * dt;
  p.y += vel.y * dt;
  // the plunger's tip is the lane's floor: a ball falling back down the lane stops on it
  if (p.x > LANE_X && p.y >= PLUNGER_Y) {
    p.y = PLUNGER_Y;
    vel.x = 0;
    vel.y = 0;
    g.resting = true;
  } else g.resting = false;
  // walls, guides, slingshots
  for (const s of T.segs) {
    const n = separate(p, closest(p, s.a, s.b), BALL_R + s.r);
    if (!n) continue;
    const vn = bounce(vel, n, 1 + s.e);
    if (s.kick && -vn > 0.25) {
      vel.x += n.x * s.kick;
      vel.y += n.y * s.kick;
      addScore(g, PINBALL_POINTS.sling);
      sound(g, "bumper", 0.35);
    }
  }
  // pop bumpers
  for (const b of T.bumpers) {
    const n = separate(p, b.c, BALL_R + b.r);
    if (!n) continue;
    bounce(vel, n, 1.6);
    vel.x += n.x * 1.1;
    vel.y += n.y * 1.1;
    b.flash = 1;
    addScore(g, PINBALL_POINTS.bumper);
    sound(g, "bumper", 0.5);
  }
  // the drop targets
  for (const tg of T.targets) {
    if (tg.down) continue;
    const n = separate(p, closest(p, tg.a, tg.b), BALL_R + 0.012);
    if (!n) continue;
    bounce(vel, n, 1.5);
    tg.down = true;
    tg.flash = 1;
    addScore(g, PINBALL_POINTS.target);
    sound(g, "clack", 0.6);
    if (T.targets.every((x) => x.down)) {
      addScore(g, PINBALL_POINTS.bank);
      sound(g, "sparkle", 1);
      g.targetsBackAt = g.t + 1.2;
    }
  }
  // the rollover lanes at the top
  for (const lane of T.lanes) {
    const dx = p.x - lane.x;
    if (!lane.lit && dx < 0.05 && dx > -0.05 && p.y > 0.12 && p.y < 0.22) {
      lane.lit = true;
      addScore(g, PINBALL_POINTS.lane);
      sound(g, "chime", 0.5);
      if (T.lanes.every((l) => l.lit)) {
        g.mult = Math.min(5, g.mult + 1);
        g.lanesOffAt = g.t + 0.9;
      }
    }
  }
  // the flippers: a moving capsule, thicker at the pivot, gives the ball its surface's speed
  for (const f of T.flippers) {
    const c = closest(p, f.p, flipperTip(f));
    const ax = c.x - f.p.x;
    const ay = c.y - f.p.y;
    const along = Math.sqrt(ax * ax + ay * ay) / f.len;
    const n = separate(p, c, BALL_R + 0.022 - 0.01 * along);
    if (!n) continue;
    const svx = -f.w * ay;
    const svy = f.w * ax;
    const rel = v(vel.x - svx, vel.y - svy);
    bounce(rel, n, 1.3);
    vel.x = svx + rel.x;
    vel.y = svy + rel.y;
  }
  // down the drain
  if (p.y > TABLE_H + 0.05) {
    g.ball += 1;
    sound(g, "drain", 0.7);
    if (g.ball > BALLS) g.over = true;
    g.pos = v(START_X, PLUNGER_Y);
    g.vel = v(0, 0);
    g.resting = true;
  }
}

/** Whether an input log is well formed: [step, code] pairs, steps never going back, known codes. */
export function validPinballInputs(inputs: unknown): inputs is number[] {
  if (!Array.isArray(inputs) || inputs.length % 2 !== 0 || inputs.length > PINBALL_MAX_INPUTS * 2) return false;
  let last = 0;
  for (let i = 0; i < inputs.length; i += 2) {
    const step = inputs[i];
    const code = inputs[i + 1];
    if (!Number.isInteger(step) || step < last || step > PINBALL_MAX_STEPS) return false;
    if (!Number.isInteger(code) || !((code >= 0 && code <= 3) || (code >= PIN_LAUNCH && code <= PIN_LAUNCH + 1000))) return false;
    last = step;
  }
  return true;
}

/** A game played again from its inputs for `steps` steps (or until it is over); `yieldEvery`: a
 *  step count after which to hand the event loop back (the server's replay), or 0 to run straight. */
export async function replayPinball(inputs: number[], steps: number, yieldEvery = 0): Promise<PinballGame> {
  const g = newPinballGame(true);
  let i = 0;
  const last = Math.min(steps, PINBALL_MAX_STEPS);
  while (g.steps < last && !g.over) {
    while (i < inputs.length && inputs[i] === g.steps) {
      applyPinballInput(g, inputs[i + 1]);
      i += 2;
    }
    stepPinball(g);
    if (yieldEvery && g.steps % yieldEvery === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return g;
}
