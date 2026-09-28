import type { FighterState } from "@shared/boxing";
import type { FightAnim, FightMove, FightReact } from "../systems/fightAnim";

// The Velvet Ring's boxing animation suite, after Roblox's Untitled Boxing Game: every pose a
// fighter strikes, worked out procedurally on the avatar's own rig (rig.ts: the Body pivots at the
// soles, the arms at the shoulders, the legs at the hips, the Head at the neck; nothing else bends).
// Avatar.tsx asks boxerPose() for this frame's pose and eases its parts toward it.
//
//   stance      Peek-a-boo: a heel-toe bounce, shoulders hunched forward, chin tucked, both gloves
//               high by the cheeks, the torso weaving; on the move, a low Ring Shuffle (short,
//               dragged steps, the guard kept up, no arm swing)
//   M1 string   the Snap Jab (a hip twitch, the lead hand out with the wrist turned over, snapped
//               back to the chin), the Corkscrew Straight (the rear foot pivots, the torso turns 45
//               degrees, the rear hand drives through the middle, the glove corkscrewing), the
//               Leaping Lead Hook (a compact crouch, then the lead arm swept level across, the
//               body torquing through and off the canvas a touch)
//   M2          the Heavy Smash: the rear arm drawn deep back and up, the torso coiled (the air
//               shimmering round the fist: `aura`), then a crushing overhand lunge, and a sluggish
//               way back; a Feint yanks both gloves back to the chin
//   defence     the High Shell (forearms clamped over the face, trembling under each punch), the
//               slips (a dip under the punch to the left or right, a deep sway back, a step in),
//               a Perfect Dodge's spring-load (crouched, the rear glove cocked low for the counter)
//   reactions   an M1's flinch (the head snapped aside), an M2's whiplash (the neck thrown back,
//               two stumbling steps), a Guard Break (the gloves flung wide, a daze), a whiff's
//               stagger (overreached, off balance)
//   the canvas  knees buckling, down on hands and knees, then a sprawl face down (the stars are
//               Avatar's); the count beaten, a push-up back to the feet; a win, both gloves up

export interface Arm {
  /** About the shoulder: forward and up (negative) or back (positive). */
  x: number;
  /** The forearm's turn (a corkscrew). */
  y: number;
  /** Across the body (positive: in toward the middle; negative: out wide). */
  in: number;
}

export interface BoxPose {
  armL: Arm;
  armR: Arm;
  /** The legs' swing (forward negative), how far apart (the hips' splay) and the rear foot's pivot. */
  legL: number;
  legR: number;
  legSpread: number;
  pivotR: number;
  /** The body about its soles: forward (+) or back, turned (the right shoulder forward +), rolled
   *  (to the right +); lifted or lowered and shifted forward (m). */
  lean: number;
  twist: number;
  roll: number;
  lift: number;
  shift: number;
  head: { x: number; y: number; z: number };
  /** A tremble on top of everything (a punch into the shell). */
  tremble: number;
  /** The M2's air distortion round the rear fist (0..1). */
  aura: number;
  eyesShut: boolean;
  /** Down on the canvas face first (the stars lie there). */
  floored: boolean;
}

export interface BoxerInput {
  t: number;
  seed: number;
  /** Moving (0..1 of full speed) and the step's phase. */
  speed: number;
  phase: number;
  state: FighterState | null;
  exhausted: boolean;
  move: FightAnim<FightMove> | null;
  moveAge: number;
  react: FightAnim<FightReact> | null;
  reactAge: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** A smooth 0 -> 1 as `v` runs 0 -> 1. */
const ease = (v: number) => {
  const k = clamp01(v);
  return k * k * (3 - 2 * k);
};
/** A snap 0 -> 1 (fast out, soft landing). */
const snap = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0 -> 1 over [a0, a1], held, then 1 -> 0 over [b0, b1]. */
const bump = (x: number, a0: number, a1: number, b0: number, b1: number) => ease((x - a0) / Math.max(1e-3, a1 - a0)) * (1 - ease((x - b0) / Math.max(1e-3, b1 - b0)));

// peek-a-boo: the gloves up at the chin (the chibi's arms are short and its head is big: any
// higher and the gloves sink into it), the lead (left) a touch higher and further out
const STANCE_L: Arm = { x: -1.88, y: 0, in: 0.42 };
const STANCE_R: Arm = { x: -1.78, y: 0, in: 0.48 };
const SHELL: Arm = { x: -2.08, y: 0.1, in: 0.8 };
const REACH_OUT = -1.52;

export function emptyPose(): BoxPose {
  return { armL: { ...STANCE_L }, armR: { ...STANCE_R }, legL: 0, legR: 0, legSpread: 0, pivotR: 0, lean: 0, twist: 0, roll: 0, lift: 0, shift: 0, head: { x: 0, y: 0, z: 0 }, tremble: 0, aura: 0, eyesShut: false, floored: false };
}

/** This frame's pose for a fighter (written into `p`). */
export function boxerPose(p: BoxPose, i: BoxerInput): BoxPose {
  const { t, seed } = i;
  // --- the stance: peek-a-boo, bouncing on the balls of the feet, the torso weaving ---
  const hop = Math.abs(Math.sin(t * 7.2 + seed));
  p.armL.x = STANCE_L.x + Math.sin(t * 7.2 + seed) * 0.04;
  p.armL.y = 0;
  p.armL.in = STANCE_L.in;
  p.armR.x = STANCE_R.x + Math.sin(t * 7.2 + seed + 0.6) * 0.04;
  p.armR.y = 0;
  p.armR.in = STANCE_R.in;
  p.legL = Math.sin(t * 7.2 + seed) * 0.05;
  p.legR = -Math.sin(t * 7.2 + seed) * 0.05;
  p.legSpread = 0.12;
  p.pivotR = 0;
  p.lean = 0.1;
  p.twist = Math.sin(t * 1.3 + seed) * 0.1 - 0.12;
  p.roll = Math.sin(t * 1.9 + seed) * 0.06;
  p.lift = hop * 0.022;
  p.shift = 0;
  p.head.x = 0.08;
  p.head.y = Math.sin(t * 1.3 + seed) * -0.06;
  p.head.z = -p.roll * 0.5;
  p.tremble = 0;
  p.aura = 0;
  p.eyesShut = false;
  p.floored = false;

  // --- the Ring Shuffle: low, short dragged steps, the guard kept up ---
  if (i.speed > 0.05) {
    const s = Math.min(1, i.speed * 1.4);
    const drag = Math.sign(Math.sin(i.phase)) * Math.pow(Math.abs(Math.sin(i.phase)), 0.55);
    p.legL = mix(p.legL, drag * 0.3, s);
    p.legR = mix(p.legR, -drag * 0.3, s);
    p.lift = mix(p.lift, -0.025 + Math.abs(Math.sin(i.phase)) * 0.018, s);
    p.lean = mix(p.lean, 0.16, s);
    p.roll = mix(p.roll, Math.sin(i.phase) * 0.04, s);
  }

  // --- worn out: the gloves sag, the shoulders heave ---
  if (i.exhausted) {
    p.armL.x += 0.35;
    p.armR.x += 0.35;
    p.lean += 0.1;
    p.lift += Math.sin(t * 5) * 0.012 - 0.01;
    p.head.x += 0.12 + Math.sin(t * 5) * 0.05;
  }

  // --- the High Shell ---
  if (i.state === "block") {
    p.armL.x = SHELL.x;
    p.armL.y = -SHELL.y;
    p.armL.in = SHELL.in;
    p.armR.x = SHELL.x + 0.04;
    p.armR.y = SHELL.y;
    p.armR.in = SHELL.in;
    p.lean = 0.18;
    p.head.x = 0.16;
    p.lift -= 0.015;
    p.twist *= 0.3;
  }

  // --- the move being played ---
  const m = i.move;
  if (m) strike(p, m.kind, i.moveAge, m.windup ?? 0.1, m.dur, t);

  // --- the states the server holds ---
  if (i.state === "stun") daze(p, t, i.react?.kind === "guardbreak" ? i.reactAge : 1);
  if (i.state === "stagger") {
    // a whiff into a Perfect Dodge: overreached and off balance
    p.lean = 0.38 + Math.sin(t * 9) * 0.05;
    p.shift = 0.1;
    p.roll = Math.sin(t * 7) * 0.16;
    p.armL.x = -1.25;
    p.armL.in = -0.1;
    p.armR.x = -1.1;
    p.armR.in = -0.05;
    p.head.x = 0.3;
  }

  // --- a reaction on top ---
  const r = i.react;
  if (r && r.kind !== "knockdown" && r.kind !== "guardbreak") react(p, r.kind, i.reactAge, r.side ?? 1, t);

  // --- the canvas: the knees buckle, hands and knees, a sprawl face down; up with a push-up ---
  if (i.state === "down" || i.state === "out") floored(p, r?.kind === "knockdown" ? i.reactAge : 9, t);
  else if (m?.kind === "getup") getUp(p, i.moveAge, m.dur);
  return p;
}

/** A punch, a feint, a dash, a spring-load or a win, `a` s in. */
function strike(p: BoxPose, kind: FightMove, a: number, w: number, T: number, t: number) {
  switch (kind) {
    case "jab": {
      // the hip twitches, the lead hand snaps straight out, the wrist turned over, and straight back
      const twitch = bump(a, 0, w * 0.6, w * 0.6, w);
      const hit = snap((a - (w - 0.045)) / 0.045) * (1 - ease((a - (w + 0.02)) / (T - w - 0.02)));
      p.twist += 0.12 * twitch - 0.34 * hit;
      p.armL.x = mix(p.armL.x + 0.14 * twitch, REACH_OUT, hit);
      p.armL.in = mix(p.armL.in, 0.04, hit);
      p.armL.y = -1.35 * hit;
      p.lean += 0.1 * hit;
      p.shift += 0.05 * hit;
      p.head.x -= 0.05 * hit;
      return;
    }
    case "straight": {
      // the rear foot pivots, the torso turns 45 degrees, the rear hand drives through the middle
      const load = bump(a, 0, w * 0.7, w * 0.7, w);
      const hit = snap((a - (w - 0.06)) / 0.06) * (1 - ease((a - (w + 0.03)) / (T - w - 0.03)));
      p.pivotR = 0.55 * hit;
      p.twist = mix(p.twist - 0.15 * load, 0.785, hit);
      p.armR.x = mix(p.armR.x + 0.22 * load, REACH_OUT, hit);
      p.armR.in = mix(p.armR.in, 0.16, hit);
      p.armR.y = 1.4 * hit;
      p.lean += 0.14 * hit;
      p.shift += 0.08 * hit;
      p.armL.x -= 0.1 * hit;
      return;
    }
    case "leadhook": {
      // a compact crouch, then the lead arm swept level across, the body torquing through
      const crouch = bump(a, 0, w * 0.75, w * 0.75, w + 0.04);
      const sweep = ease((a - (w - 0.07)) / 0.11);
      const back = ease((a - (w + 0.08)) / Math.max(0.05, T - w - 0.08));
      const on = sweep * (1 - back);
      p.lift += -0.045 * crouch + 0.05 * on * (1 - sweep * 0.4);
      p.lean += 0.14 * crouch + 0.08 * on;
      p.twist = mix(p.twist + 0.3 * crouch, mix(0.35, -0.42, sweep), on);
      p.armL.x = mix(p.armL.x, -1.55, Math.max(crouch * 0.4, on));
      p.armL.in = mix(p.armL.in, mix(-0.8, 0.62, sweep), on);
      p.armL.y = -0.4 * on;
      p.shift += 0.12 * on;
      return;
    }
    case "smash": {
      // the telegraph: the rear arm drawn deep back and up, the torso coiled, the air shimmering;
      // then the overhand crashing down with a lunge, and a slow way back
      const coil = ease(a / (w * 0.9));
      const hit = snap((a - (w - 0.05)) / 0.06);
      const back = ease((a - (w + 0.07)) / Math.max(0.05, T - w - 0.07));
      const on = hit * (1 - back);
      const wind = coil * (1 - hit);
      p.aura = coil * (1 - ease((a - w) / 0.08));
      p.armR.x = mix(mix(p.armR.x, -3.05, wind), -0.95, on);
      p.armR.in = mix(mix(p.armR.in, -0.4, wind), 0.22, on);
      p.armR.y = 0.5 * wind;
      p.twist = mix(p.twist - 0.55 * wind, 0.6, on);
      p.lean = mix(p.lean - 0.3 * wind, 0.4, on);
      p.lift += 0.02 * wind - 0.035 * on;
      p.shift += 0.18 * on;
      p.armL.x = mix(p.armL.x, -2.0, on * 0.6);
      p.pivotR = 0.4 * on;
      return;
    }
    case "uppercut": {
      // the Counter: a dip, then the rear hand driven up through the chin, rising with it
      const dip = bump(a, 0, w * 0.8, w * 0.8, w + 0.03);
      const hit = snap((a - (w - 0.05)) / 0.06) * (1 - ease((a - (w + 0.06)) / Math.max(0.05, T - w - 0.06)));
      p.lift += -0.06 * dip + 0.07 * hit;
      p.lean += 0.12 * dip - 0.3 * hit;
      p.armR.x = mix(mix(p.armR.x, -0.45, dip), -2.95, hit);
      p.armR.in = mix(p.armR.in, 0.3, hit);
      p.twist = mix(p.twist - 0.2 * dip, 0.45, hit);
      p.head.x -= 0.15 * hit;
      return;
    }
    case "feint": {
      // yanked back to the chin: a sharp overshoot into the shell, then the stance
      const k = bump(a, 0, 0.05, 0.08, T);
      p.armL.x = mix(p.armL.x, SHELL.x - 0.12, k);
      p.armR.x = mix(p.armR.x, SHELL.x - 0.12, k);
      p.armL.in = mix(p.armL.in, 0.9, k);
      p.armR.in = mix(p.armR.in, 0.9, k);
      p.lean -= 0.08 * k;
      return;
    }
    case "dashF": {
      const k = bump(a, 0, 0.05, 0.1, T);
      p.lean += 0.32 * k;
      p.shift += 0.12 * k;
      p.lift -= 0.03 * k;
      p.legL = mix(p.legL, -0.5, k);
      p.legR = mix(p.legR, 0.35, k);
      return;
    }
    case "dashL":
    case "dashR": {
      // a snappy dip under the punch's arc
      const k = bump(a, 0, 0.06, 0.12, T);
      const s = kind === "dashL" ? -1 : 1;
      p.roll = mix(p.roll, 0.52 * s, k);
      p.lift -= 0.08 * k;
      p.lean += 0.14 * k;
      p.head.z -= 0.2 * s * k;
      p.legL = mix(p.legL, 0.2 * s, k);
      p.legR = mix(p.legR, -0.2 * s, k);
      return;
    }
    case "dashB": {
      // a deep sway back from the waist
      const k = bump(a, 0, 0.07, 0.14, T);
      p.lean = mix(p.lean, -0.5, k);
      p.head.x -= 0.25 * k;
      p.shift -= 0.06 * k;
      return;
    }
    case "perfect": {
      // a Perfect Dodge: crouched and springing, the rear glove cocked low for the counter
      const k = bump(a, 0, 0.1, T - 0.2, T);
      p.lift -= 0.06 * k;
      p.lean += 0.12 * k;
      p.twist = mix(p.twist, -0.3, k);
      p.armR.x = mix(p.armR.x, -0.75, k);
      p.armR.in = mix(p.armR.in, 0.35, k);
      p.roll += Math.sin(t * 16) * 0.03 * k;
      return;
    }
    case "victory": {
      // both gloves up high, bouncing
      const k = bump(a, 0, 0.18, T - 0.3, T);
      const pump = Math.abs(Math.sin(a * 7)) * 0.2;
      p.armL.x = mix(p.armL.x, -2.95 - pump, k);
      p.armR.x = mix(p.armR.x, -2.95 - pump, k);
      p.armL.in = mix(p.armL.in, -0.25, k);
      p.armR.in = mix(p.armR.in, -0.25, k);
      p.lean = mix(p.lean, -0.12, k);
      p.head.x = mix(p.head.x, -0.3, k);
      p.lift += Math.abs(Math.sin(a * 7)) * 0.05 * k;
      return;
    }
    case "getup":
      return;
  }
}

/** A Guard Break's daze, `a` s after it: the gloves flung wide, then reeling. */
function daze(p: BoxPose, a: number, t: number) {
  const fling = bump(a, 0, 0.08, 0.4, 1.0);
  p.armL.x = mix(-1.0, -1.7, fling);
  p.armR.x = mix(-1.0, -1.7, fling);
  p.armL.in = mix(-0.2, -1.35, fling);
  p.armR.in = mix(-0.2, -1.35, fling);
  p.armL.y = 0;
  p.armR.y = 0;
  p.lean = mix(0.12, -0.3, fling) + Math.sin(t * 4.5) * 0.06;
  p.roll = Math.sin(t * 4.5) * 0.14;
  p.twist = Math.cos(t * 3.1) * 0.12;
  p.head.x = mix(0.22, -0.45, fling) + Math.sin(t * 4.5) * 0.08;
  p.head.z = Math.cos(t * 4.5) * 0.18;
  p.lift = -0.02;
}

/** A reaction `a` s in (`side`: which way the head goes). */
function react(p: BoxPose, kind: FightReact, a: number, side: number, t: number) {
  switch (kind) {
    case "flinch": {
      // an M1: the head snapped aside and back, quickly recovered
      const k = snap(a / 0.05) * (1 - ease((a - 0.07) / 0.19));
      p.head.y += 0.45 * side * k;
      p.head.x -= 0.28 * k;
      p.head.z += 0.18 * side * k;
      p.lean -= 0.12 * k;
      p.twist += 0.1 * side * k;
      return;
    }
    case "whiplash": {
      // an M2: the neck thrown back, then two stumbling steps back, sweat flying (BoxingWorld)
      const k = snap(a / 0.06) * (1 - ease((a - 0.25) / 0.37));
      const stumble = bump(a, 0.08, 0.14, 0.45, 0.62);
      p.head.x -= 0.95 * k;
      p.head.y += 0.25 * side * k;
      p.lean -= 0.42 * k;
      p.shift -= 0.1 * k;
      p.armL.x = mix(p.armL.x, -1.15, k);
      p.armR.x = mix(p.armR.x, -1.2, k);
      p.armL.in = mix(p.armL.in, -0.35, k);
      p.armR.in = mix(p.armR.in, -0.35, k);
      p.legL = mix(p.legL, Math.sin(a * 26) * 0.55, stumble);
      p.legR = mix(p.legR, -Math.sin(a * 26) * 0.55, stumble);
      p.roll += Math.sin(a * 26) * 0.12 * stumble;
      return;
    }
    case "blockhit": {
      // a punch into the shell: a heavy tremble, the posture kept
      const k = 1 - ease(a / 0.2);
      p.tremble = 0.07 * k;
      p.lean -= 0.07 * k;
      p.lift -= 0.012 * k;
      p.head.x -= 0.06 * k * Math.abs(Math.sin(t * 60));
      return;
    }
  }
}

/** Down: the knees buckle (0 - 0.22 s), hands and knees (0.22 - 0.55 s), then a sprawl face down. */
function floored(p: BoxPose, a: number, t: number) {
  const buckle = ease(a / 0.22);
  const fours = ease((a - 0.22) / 0.3);
  const sprawl = ease((a - 0.58) / 0.35);
  p.aura = 0;
  p.tremble = 0;
  p.pivotR = 0;
  p.twist = 0;
  p.roll = mix(0, 0.08, buckle) * (1 - sprawl) + sprawl * 0.12;
  // the lean: a stagger forward, onto all fours, flat on the canvas
  p.lean = mix(mix(mix(0.2, 0.42, buckle), 1.18, fours), Math.PI / 2, sprawl);
  p.lift = mix(mix(mix(0, -0.07, buckle), 0.07, fours), 0.2, sprawl);
  p.shift = mix(0, -0.04, fours);
  // arms: dropping, then straight down to the canvas, then flung out ahead
  const armDown = -p.lean * 0.95;
  p.armL.x = mix(mix(mix(p.armL.x, -0.7, buckle), armDown, fours), -2.85, sprawl);
  p.armR.x = mix(mix(mix(p.armR.x, -0.65, buckle), armDown, fours), -2.6, sprawl);
  p.armL.in = mix(mix(p.armL.in, 0.1, buckle), -0.9, sprawl);
  p.armR.in = mix(mix(p.armR.in, 0.05, buckle), -1.1, sprawl);
  p.armL.y = 0;
  p.armR.y = 0;
  // legs: the knees folding under, then out straight behind
  p.legL = mix(mix(-0.35 * buckle, -0.75, fours), 0.05, sprawl);
  p.legR = mix(mix(-0.3 * buckle, -0.8, fours), -0.05, sprawl);
  p.legSpread = mix(0.12, 0.3, sprawl);
  p.head.x = mix(mix(0.4 * buckle, -0.55, fours), -0.2, sprawl);
  p.head.y = sprawl * 0.5;
  p.head.z = Math.sin(t * 2) * 0.05 * (1 - sprawl);
  p.eyesShut = sprawl > 0.5;
  p.floored = sprawl > 0.5;
}

/** The count beaten: a push-up off the canvas and back to the feet (the sprawl run backwards). */
function getUp(p: BoxPose, a: number, T: number) {
  const k = clamp01(a / T);
  // the arms press first (the push-up), then the legs come under
  const press = ease(k / 0.35);
  const fours = ease((k - 0.25) / 0.35);
  const rise = ease((k - 0.62) / 0.38);
  const lean = mix(mix(Math.PI / 2, 1.18, press), mix(1.18, 0.2, rise), fours);
  p.lean = lean;
  p.lift = mix(mix(0.2, 0.12, press), mix(0.07, p.lift, rise), fours);
  const armDown = -lean * 0.95;
  p.armL.x = mix(mix(-2.2, armDown, press), p.armL.x, rise);
  p.armR.x = mix(mix(-2.2, armDown, press), p.armR.x, rise);
  p.armL.in = mix(mix(-0.5, 0.15, press), p.armL.in, rise);
  p.armR.in = mix(mix(-0.5, 0.15, press), p.armR.in, rise);
  p.legL = mix(mix(0.05, -0.75, fours), p.legL, rise);
  p.legR = mix(mix(-0.05, -0.8, fours), p.legR, rise);
  p.head.x = mix(mix(-0.3, -0.5, press), p.head.x, rise);
  p.twist *= rise;
  p.roll *= rise;
  p.shift = 0;
}
