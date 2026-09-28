import type { BoxMove, DashSide } from "@shared/boxing";

// The Velvet Ring's animation feed and its screen juice, kept OUT of React state (like liveMotion):
// the avatars read it in their frame loops, the camera and the HUD in theirs.
//
//   the fight anims   per fighter, the move being played (a punch, a feint, a dash, a Perfect
//                     Dodge's spring-load, a push-up off the canvas, a victory) and the hit reaction
//                     on top of it (a flinch, a whiplash, a punch into the shell, a Guard Break).
//                     The room's boxEvents start them for everyone (BoxingWorld); your own punches
//                     and dashes start the moment you press (combatInput's prediction), and the
//                     server's echo of the same move is not played twice.
//   the combat clock  the time the fight anims run on: it stops for a hitstop (a clean M1 3 frames,
//                     an M2 6) and crawls through a Perfect Dodge's slow-mo pulse, so every fighter
//                     on the canvas freezes on the impact together.
//   the juice         the action camera's shake (a directional nudge for an M1, a radial shudder
//                     for an M2) and its punch-in zoom, read by IsometricCanvas's camera rig; the
//                     screen flashes are the HUD's (onRingFx).
//   drawn positions   where each fighter is drawn right now (the remote ones eased a little behind
//                     the server): the action camera frames the two of them.

export type FightMove = BoxMove | "feint" | `dash${DashSide}` | "perfect" | "getup" | "victory";
export type FightReact = "flinch" | "whiplash" | "blockhit" | "guardbreak" | "knockdown";

export interface FightAnim<K extends string> {
  kind: K;
  /** When it started, on the combat clock (s). */
  at: number;
  /** How long it plays (s, on the combat clock). */
  dur: number;
  /** A punch's wind-up (s): when it lands. */
  windup?: number;
  /** Started by the local prediction (the server's echo is skipped). */
  predicted?: boolean;
  /** Which way a reaction throws the head (+1 / -1). */
  side?: number;
}

interface Feed {
  move: FightAnim<FightMove> | null;
  react: FightAnim<FightReact> | null;
}

const feeds = new Map<string, Feed>();
function feed(sessionId: string): Feed {
  let f = feeds.get(sessionId);
  if (!f) feeds.set(sessionId, (f = { move: null, react: null }));
  return f;
}

// --- the combat clock -------------------------------------------------------------------------------

let combatTime = 0;
/** Real time (performance.now ms) until which the clock stands still, and a slow-mo pulse. */
let freezeUntil = 0;
let slowUntil = 0;
let slowFactor = 1;

/** The combat clock now (s). */
export function combatNow(): number {
  return combatTime;
}

/** Advanced once a frame by the ring's scene (BoxingWorld), by the real frame time. */
export function advanceCombatClock(delta: number) {
  const now = performance.now();
  if (now < freezeUntil) return;
  combatTime += delta * (now < slowUntil ? slowFactor : 1);
}

/** Freeze every fighter's pose for `seconds` (real time): the impact's hitstop. */
export function hitstop(seconds: number) {
  freezeUntil = Math.max(freezeUntil, performance.now() + seconds * 1000);
}

/** Everything in the ring at `factor` speed for `seconds` (real time). */
export function slowMo(seconds: number, factor: number) {
  slowUntil = performance.now() + seconds * 1000;
  slowFactor = factor;
}

// --- the anims ---------------------------------------------------------------------------------------

/** How long each non-punch move plays (s). */
const MOVE_DUR: Record<Exclude<FightMove, BoxMove>, number> = { feint: 0.2, dashF: 0.22, dashL: 0.26, dashR: 0.26, dashB: 0.3, perfect: 0.9, getup: 0.95, victory: 2.4 };
const REACT_DUR: Record<FightReact, number> = { flinch: 0.26, whiplash: 0.62, blockhit: 0.2, guardbreak: 1.2, knockdown: 1.0 };

/** A move starts on a fighter. A punch carries its wind-up and whole length (from the server's
 *  swing, or the prediction's). */
export function playMove(sessionId: string, kind: FightMove, opts: { windup?: number; total?: number; predicted?: boolean } = {}) {
  const f = feed(sessionId);
  const now = combatTime;
  // the server's echo of a move you already see: not twice
  if (!opts.predicted && f.move?.predicted && f.move.kind === kind && now - f.move.at < 0.4) {
    f.move.predicted = false;
    return;
  }
  const dur = opts.total ?? (kind in MOVE_DUR ? MOVE_DUR[kind as keyof typeof MOVE_DUR] : 0.4);
  f.move = { kind, at: now, dur, windup: opts.windup, predicted: opts.predicted };
  // a new punch or dash ends whatever reaction was still settling (never a knockdown's)
  if (f.react && f.react.kind !== "knockdown" && kind !== "perfect") f.react = null;
}

/** A reaction starts on a fighter (a clean hit, a blocked one, a Guard Break, a knockdown): a hit
 *  knocks the move they were making out of them. */
export function playReact(sessionId: string, kind: FightReact, side = 1) {
  const f = feed(sessionId);
  f.react = { kind, at: combatTime, dur: REACT_DUR[kind], side };
  if (kind !== "blockhit" && f.move && f.move.kind !== "victory") f.move = null;
}

/** A fighter's moves and reactions stopped (out of the ring, a fresh round). */
export function clearFight(sessionId: string) {
  feeds.delete(sessionId);
}

/** What a fighter is playing now (and how far in, s): null where nothing is. */
export function fightAnimOf(sessionId: string): { move: FightAnim<FightMove> | null; moveAge: number; react: FightAnim<FightReact> | null; reactAge: number } {
  const f = feeds.get(sessionId);
  const now = combatTime;
  const move = f?.move && now - f.move.at < f.move.dur ? f.move : null;
  const react = f?.react && now - f.react.at < f.react.dur ? f.react : null;
  return { move, moveAge: move ? now - move.at : 0, react, reactAge: react ? now - react.at : 0 };
}

// --- the camera's juice ---------------------------------------------------------------------------------

export const ringJuice = {
  /** A shake: its size (m), how long (s) and when it started (performance.now ms); a directional
   *  one has a way (screen space x, y), a radial one none. */
  shakeAmp: 0,
  shakeDur: 0,
  shakeAt: 0,
  shakeDir: null as { x: number; y: number } | null,
  /** The camera's punch-in (a Perfect Dodge): when it started. */
  punchAt: -1e9,
};

export function shake(amp: number, seconds: number, dir: { x: number; y: number } | null = null) {
  ringJuice.shakeAmp = amp;
  ringJuice.shakeDur = seconds;
  ringJuice.shakeAt = performance.now();
  ringJuice.shakeDir = dir;
}

export function punchIn() {
  ringJuice.punchAt = performance.now();
}

/** The shake's offset right now, in the camera's own right and up (m). */
export function shakeOffset(): { x: number; y: number } {
  const age = (performance.now() - ringJuice.shakeAt) / 1000;
  if (age >= ringJuice.shakeDur || ringJuice.shakeAmp <= 0) return { x: 0, y: 0 };
  const k = ringJuice.shakeAmp * (1 - age / ringJuice.shakeDur);
  const d = ringJuice.shakeDir;
  if (d) {
    // a nudge the punch's way and back, twice
    const s = Math.sin(age * 90) * k;
    return { x: d.x * s, y: d.y * s };
  }
  return { x: Math.sin(age * 97) * k, y: Math.cos(age * 83) * k * 0.8 };
}

/** The punch-in zoom's factor right now (1: none). */
export function punchZoom(): number {
  const age = (performance.now() - ringJuice.punchAt) / 1000;
  if (age < 0 || age > 0.45) return 1;
  return 1 + 0.14 * Math.sin(Math.PI * Math.min(1, age / 0.45)) * (age < 0.12 ? age / 0.12 : 1);
}

// --- the screen's flashes (the HUD's) ---------------------------------------------------------------------

export type RingFx = { kind: "flash"; tone: "white" | "red" | "gold" } | { kind: "mono" } | { kind: "badge"; text: string; tone: "gold" | "cyan" | "red" | "white" };
const fxListeners = new Set<(fx: RingFx) => void>();
export function onRingFx(listener: (fx: RingFx) => void) {
  fxListeners.add(listener);
  return () => {
    fxListeners.delete(listener);
  };
}
export function ringFx(fx: RingFx) {
  fxListeners.forEach((l) => l(fx));
}

// --- where the fighters are drawn --------------------------------------------------------------------------

/** Each player's drawn position (the remote ones' interpolated spot; your own is cameraFocus). */
export const drawnAt = new Map<string, { x: number; z: number }>();
