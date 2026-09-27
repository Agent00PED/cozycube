import type { Sfx } from "../../audio/sfx";

// "Velvet Nights", the pinball machines' table and its physics, apart from the panel that draws it
// (PinballModal): a steel ball under gravity on a 1 x 1.8 table (x across, y down toward the
// flippers), stepped many times a frame so the fastest flipper never lets it through. Walls and
// guides, three pop bumpers that kick, two slingshots, a bank of four drop targets (all four down:
// a bonus, and they spring back), three rollover lanes at the top (all lit: the multiplier climbs),
// the plunger in its lane on the right. Three balls a game.

export type V = { x: number; y: number };
type Seg = { a: V; b: V; r: number; e: number; kick?: number };
type Bumper = { c: V; r: number; flash: number };
type Target = { a: V; b: V; down: boolean; flash: number };
type Lane = { x: number; lit: boolean };
export type Flipper = { p: V; len: number; rest: number; up: number; angle: number; w: number; on: boolean; side: -1 | 1 };

export const TABLE_W = 1;
export const TABLE_H = 1.8;
export const BALL_R = 0.022;
export const LANE_X = 0.88;
export const BALLS = 3;
/** The steps a frame is cut into. */
export const SUBSTEPS = 12;
const GRAVITY = 2.3;
const MAX_SPEED = 4.6;
const FLIP_UP_W = 26;
const FLIP_DOWN_W = 14;
/** Where the ball sits on the plunger's tip, and how far a full pull draws it back. */
const PLUNGER_Y = 1.7;
const PLUNGER_DRAW = 0.06;
const START: V = { x: 0.92, y: PLUNGER_Y };

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
    const th = (Math.PI * k) / 18;
    arch.push(v(0.5 + 0.46 * Math.cos(th), 0.5 - 0.46 * Math.sin(th)));
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
  return {
    segs,
    bumpers: [
      { c: v(0.3, 0.46), r: 0.055, flash: 0 },
      { c: v(0.58, 0.46), r: 0.055, flash: 0 },
      { c: v(0.44, 0.64), r: 0.055, flash: 0 },
    ],
    targets: [0, 1, 2, 3].map((k) => ({ a: v(0.25 + k * 0.09, 0.92), b: v(0.31 + k * 0.09, 0.92), down: false, flash: 0 })),
    lanes: [0.34, 0.46, 0.58].map((x) => ({ x, lit: false })),
    flippers: [
      // at rest their tips stand a ball and a half apart: an unplayed ball drains between them
      { p: v(0.27, 1.53), len: 0.15, rest: 0.52, up: -0.5, angle: 0.52, w: 0, on: false, side: -1 },
      { p: v(0.63, 1.53), len: 0.15, rest: Math.PI - 0.52, up: Math.PI + 0.5, angle: Math.PI - 0.52, w: 0, on: false, side: 1 },
    ],
  };
}

export interface PinballGame {
  table: PinballTable;
  pos: V;
  vel: V;
  /** In the plunger lane (a launch only works from there). */
  inLane: boolean;
  /** How far the plunger is drawn back (0 to 1), and whether it is being pulled. */
  plunger: number;
  pulling: boolean;
  score: number;
  mult: number;
  ball: number;
  over: boolean;
  /** Game seconds, and when the drop targets and the lane lights reset. */
  t: number;
  targetsBackAt: number;
  lanesOffAt: number;
  /** Sounds to play, taken by the panel each frame. */
  sounds: [Sfx, number][];
}

export function newPinballGame(): PinballGame {
  return { table: buildTable(), pos: { ...START }, vel: v(0, 0), inLane: true, plunger: 0, pulling: false, score: 0, mult: 1, ball: 1, over: false, t: 0, targetsBackAt: 0, lanesOffAt: 0, sounds: [] };
}

export const flipperTip = (f: Flipper): V => v(f.p.x + Math.cos(f.angle) * f.len, f.p.y + Math.sin(f.angle) * f.len);
/** The plunger's tip, where the ball rests in the lane. */
export const plungerY = (g: PinballGame) => PLUNGER_Y - g.plunger * PLUNGER_DRAW;

export function setFlipper(g: PinballGame, side: -1 | 1, on: boolean) {
  const f = g.table.flippers.find((q) => q.side === side)!;
  if (on && !f.on) g.sounds.push(["flipper", 0.6]);
  f.on = on;
}

/** Whether the ball sits on the plunger, ready to launch. */
export const onPlunger = (g: PinballGame) => g.pos.x > LANE_X && Math.abs(g.pos.y - plungerY(g)) < 0.004 && Math.hypot(g.vel.x, g.vel.y) < 0.05;

/** Lets the plunger go: the ball on it is fired up the lane as hard as it was drawn. */
export function launch(g: PinballGame) {
  const strength = g.plunger;
  const ready = onPlunger(g);
  g.plunger = 0;
  g.pulling = false;
  if (g.over || !ready || strength < 0.05) return;
  g.pos.y = PLUNGER_Y;
  g.vel = v(0, -(1.9 + 2.5 * strength));
  g.sounds.push(["plunger", 0.7]);
}

function closest(p: V, a: V, b: V): V {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
  return v(a.x + abx * t, a.y + aby * t);
}

/** Pushes the ball out of a circle of radius `min` round q; its normal, or null if not touching. */
function separate(p: V, q: V, min: number): V | null {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  const d = Math.hypot(dx, dy);
  if (d >= min || d === 0) return null;
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

/** One small step of the machine. */
export function stepPinball(g: PinballGame, dt: number) {
  const T = g.table;
  g.t += dt;
  if (g.pulling) g.plunger = Math.min(1, g.plunger + dt * 1.2);
  if (g.targetsBackAt && g.t >= g.targetsBackAt) {
    g.targetsBackAt = 0;
    for (const q of T.targets) q.down = false;
  }
  if (g.lanesOffAt && g.t >= g.lanesOffAt) {
    g.lanesOffAt = 0;
    for (const l of T.lanes) l.lit = false;
  }
  for (const f of T.flippers) {
    const target = f.on ? f.up : f.rest;
    const before = f.angle;
    const dir = Math.sign(target - f.angle);
    f.angle += dir * (f.on ? FLIP_UP_W : FLIP_DOWN_W) * dt;
    if (Math.sign(target - f.angle) !== dir) f.angle = target;
    f.w = (f.angle - before) / dt;
  }
  if (g.over) return;
  const p = g.pos;
  const vel = g.vel;
  vel.y += GRAVITY * dt;
  const sp = Math.hypot(vel.x, vel.y);
  if (sp > MAX_SPEED) {
    vel.x *= MAX_SPEED / sp;
    vel.y *= MAX_SPEED / sp;
  }
  p.x += vel.x * dt;
  p.y += vel.y * dt;
  if (p.x < LANE_X - 0.02 || p.y < 0.5) g.inLane = false;
  if (p.x > LANE_X && p.y > 0.6) g.inLane = true;
  // the plunger's tip is the lane's floor: a ball falling back down the lane stops on it
  if (p.x > LANE_X && p.y >= plungerY(g)) {
    p.y = plungerY(g);
    vel.x = 0;
    vel.y = 0;
  }
  // walls, guides, slingshots
  for (const s of T.segs) {
    const n = separate(p, closest(p, s.a, s.b), BALL_R + s.r);
    if (!n) continue;
    const vn = bounce(vel, n, 1 + s.e);
    if (s.kick && -vn > 0.25) {
      vel.x += n.x * s.kick;
      vel.y += n.y * s.kick;
      addScore(g, 10);
      g.sounds.push(["bumper", 0.35]);
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
    addScore(g, 100);
    g.sounds.push(["bumper", 0.5]);
  }
  // the drop targets
  for (const t of T.targets) {
    if (t.down) continue;
    const n = separate(p, closest(p, t.a, t.b), BALL_R + 0.012);
    if (!n) continue;
    bounce(vel, n, 1.5);
    t.down = true;
    t.flash = 1;
    addScore(g, 500);
    g.sounds.push(["clack", 0.6]);
    if (T.targets.every((q) => q.down)) {
      addScore(g, 2000);
      g.sounds.push(["sparkle", 1]);
      g.targetsBackAt = g.t + 1.2;
    }
  }
  // the rollover lanes at the top
  for (const lane of T.lanes) {
    if (!lane.lit && Math.abs(p.x - lane.x) < 0.05 && p.y > 0.12 && p.y < 0.22) {
      lane.lit = true;
      addScore(g, 250);
      g.sounds.push(["chime", 0.5]);
      if (T.lanes.every((l) => l.lit)) {
        g.mult = Math.min(5, g.mult + 1);
        g.lanesOffAt = g.t + 0.9;
      }
    }
  }
  // the flippers: a moving capsule, thicker at the pivot, gives the ball its surface's speed
  for (const f of T.flippers) {
    const q = closest(p, f.p, flipperTip(f));
    const along = Math.hypot(q.x - f.p.x, q.y - f.p.y) / f.len;
    const n = separate(p, q, BALL_R + 0.022 - 0.01 * along);
    if (!n) continue;
    const svx = -f.w * (q.y - f.p.y);
    const svy = f.w * (q.x - f.p.x);
    const rel = v(vel.x - svx, vel.y - svy);
    bounce(rel, n, 1.3);
    vel.x = svx + rel.x;
    vel.y = svy + rel.y;
  }
  // down the drain
  if (p.y > TABLE_H + 0.05) {
    g.ball += 1;
    g.sounds.push(["drain", 0.7]);
    if (g.ball > BALLS) g.over = true;
    g.pos = { ...START };
    g.vel = v(0, 0);
    g.inLane = true;
  }
}
