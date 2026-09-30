import { PICKAXES, type PickaxeId } from "@shared/caverns_mining";
import type { BoxPose } from "./boxingAnimations";

// The Glimmering Caverns' activity suite (docs/caverns-roadmap.md phase 3): the whole body at work,
// worked out procedurally on the avatar's own rig the way the Velvet Ring's boxing suite is
// (boxingAnimations.ts: the same pose, the same parts; Avatar.tsx eases its parts toward it). The
// chibi's head is big and its arms short: a tool raised straight up vanishes behind the head, so
// every tool is drawn back out to the side instead, where it shows.
//
//   mine     the pick cocked over the right shoulder, both hands on the haft, the front foot
//            forward; a blow drives it down through the rock (the body folding into it, the knees
//            giving), holds on the impact and swings back up; a pick that skids off jars the arms
//            back up and the miner rocks back; a heavier pick swings slower and bigger
//   forge    the bellows: both hands on the handles, pumped down with the whole body; the hammer:
//            the tongs held out low in the left hand, the hammer raised high and brought down on
//            each beat
//   chisel   crouched over the anvil: both hands turning the geode, then the chisel set on it and
//            the mallet drawn back as the power builds (trembling near the top), and the blow
//   soak     sunk to the chest in a warm pool, leaning back, the arms spread along the rim, the
//            head tipped back, eyes closed, breathing slow; settling in as it starts
//   winch    a hand up on the rope, the other on the cage's bar, the feet together, swaying with it
//
// The local player's beats come from the moment they happen (systems/activityStore.ts); everyone
// else's forge and chisel run on a loop of their own (forgeBeat, chiselBeat), which the sparks off
// the anvil follow too (scene/caveFx.ts), so a hammer and its sparks always land together.

export type Activity = "mine" | "forge" | "chisel" | "soak" | "winch";

export interface ActivityInput {
  kind: Activity;
  /** The avatar's own clock (s) for idle motion, and how long the activity has gone on (s). */
  t: number;
  age: number;
  seed: number;
  /** Mining: the last blow's age (s; Infinity none), how it rang, the pick's weight (1 .. 1.5). */
  blowAge: number;
  deflect: boolean;
  weight: number;
  /** The forge: its half, the bellows pumping (and the pump's age), the last hammer blow's age. */
  forge: "bellows" | "hammer";
  pumping: boolean;
  pumpAge: number;
  hammerAge: number;
  /** The chisel: turning the geode, or winding the mallet (its power 0..1); the blow's age. */
  geode: "aim" | "gauge";
  power: number;
  chiselAge: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v: number) => {
  const k = clamp01(v);
  return k * k * (3 - 2 * k);
};
const snap = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** A pick's weight: 1 for the Rusted Pickaxe, up to 1.5 for the heaviest. */
export function pickWeight(id: PickaxeId | undefined): number {
  const tier = id ? (PICKAXES[id]?.tier ?? 1) : 1;
  return 1 + (tier - 1) * 0.12;
}
/** The pick in a player's synced camp profile (its JSON), for how heavily they swing. */
export function pickWeightOf(profileJson: string): number {
  const m = /"pickaxeId":"([a-zA-Z0-9_]+)"/.exec(profileJson);
  return pickWeight((m?.[1] as PickaxeId | undefined) ?? undefined);
}

/** A mining blow's timing: down onto the rock, held on it, and back up (a heavier pick slower). */
export const BLOW = { down: 0.09, hold: 0.07, back: 0.34 };
export const blowLength = (weight: number) => BLOW.down + BLOW.hold + BLOW.back * weight;

/** Everyone else's forge, on a loop: the bellows for FORGE_BELLOWS_S, then three hammer blows. */
export const FORGE_LOOP_S = 7;
const FORGE_BELLOWS_S = 4;
const FORGE_BLOWS = [4.45, 5.3, 6.15];
const PUMP_S = 0.5;
export function forgeBeat(now: number, seed: number): { forge: "bellows" | "hammer"; pumpAge: number; hammerAge: number; blowAt: number | null } {
  const at = (now + seed * 1.7) % FORGE_LOOP_S;
  if (at < FORGE_BELLOWS_S) return { forge: "bellows", pumpAge: at % PUMP_S, hammerAge: Infinity, blowAt: null };
  let last = -Infinity;
  for (const b of FORGE_BLOWS) if (at >= b) last = b;
  return { forge: "hammer", pumpAge: Infinity, hammerAge: at - last, blowAt: last === -Infinity ? null : now - (at - last) };
}

/** Everyone else's chisel, on a loop: turning the geode, winding the mallet, the blow. */
export const CHISEL_LOOP_S = 4.6;
const CHISEL_AIM_S = 2.4;
const CHISEL_BLOW_AT = 3.4;
export function chiselBeat(now: number, seed: number): { geode: "aim" | "gauge"; power: number; chiselAge: number; blowAt: number } {
  const at = (now + seed * 1.3) % CHISEL_LOOP_S;
  const blowAt = now - (at >= CHISEL_BLOW_AT ? at - CHISEL_BLOW_AT : at + CHISEL_LOOP_S - CHISEL_BLOW_AT);
  if (at < CHISEL_AIM_S) return { geode: "aim", power: 0, chiselAge: at + CHISEL_LOOP_S - CHISEL_BLOW_AT, blowAt };
  if (at < CHISEL_BLOW_AT) return { geode: "gauge", power: 0.75 * ease((at - CHISEL_AIM_S) / (CHISEL_BLOW_AT - CHISEL_AIM_S)), chiselAge: Infinity, blowAt };
  return { geode: "gauge", power: 0, chiselAge: at - CHISEL_BLOW_AT, blowAt };
}

function base(p: BoxPose) {
  p.armL.x = 0;
  p.armL.y = 0;
  p.armL.in = -0.2;
  p.armR.x = 0;
  p.armR.y = 0;
  p.armR.in = -0.2;
  p.legL = 0;
  p.legR = 0;
  p.legSpread = 0.06;
  p.sideL = 0;
  p.sideR = 0;
  p.pivotR = 0;
  p.lean = 0;
  p.twist = 0;
  p.roll = 0;
  p.lift = 0;
  p.shift = 0;
  p.head.x = 0;
  p.head.y = 0;
  p.head.z = 0;
  p.tremble = 0;
  p.aura = 0;
  p.eyesShut = false;
  p.floored = false;
}

/** This frame's pose for an avatar at work (written into `p`). */
export function activityPose(p: BoxPose, i: ActivityInput): BoxPose {
  base(p);
  const { t, seed } = i;
  const breath = Math.sin(t * 2.2 + seed);
  switch (i.kind) {
    case "mine": {
      // cocked: the pick up by the right shoulder (the haft straight out of the fist: the arm held
      // level stands it upright), the left hand lower on the haft, the front (left) foot forward,
      // the right shoulder drawn back; a bigger draw for a heavier pick
      const w = i.weight;
      const cockR = -1.55 - 0.3 * (w - 1);
      p.armR.x = cockR + breath * 0.035;
      p.armR.in = -0.4;
      p.armL.x = cockR + 0.35 + breath * 0.03;
      p.armL.in = 0.42;
      p.legL = -0.2;
      p.legR = 0.12;
      p.legSpread = 0.12;
      p.lean = 0.04;
      p.twist = -0.26 - 0.08 * (w - 1);
      p.head.x = 0.14;
      p.head.y = 0.12;
      const a = i.blowAge;
      if (a < blowLength(w)) {
        // the blow: down onto the rock (the body folding into it, the knees giving), held on the
        // impact, then back up to the cock
        const down = snap(a / BLOW.down);
        const back = ease((a - BLOW.down - BLOW.hold) / (BLOW.back * w));
        const k = down * (1 - back);
        if (i.deflect) {
          // skidded off: the arms jarred back up, the miner rocked back on the heels, shaking
          const jar = ease((a - BLOW.down) / 0.08) * (1 - back);
          p.armR.x = mix(p.armR.x, -0.55, down * (1 - jar)) + (cockR - 0.3 - p.armR.x) * jar * 0.6;
          p.armL.x = p.armR.x + 0.3;
          p.lean = mix(p.lean, 0.28, down * (1 - jar)) - 0.16 * jar;
          p.roll = 0.08 * jar * Math.sin(a * 40);
          p.tremble = 0.9 * jar;
        } else {
          p.armR.x = mix(p.armR.x, -0.35, k);
          p.armR.in = mix(p.armR.in, 0.22, k);
          p.armL.x = mix(p.armL.x, -0.5, k);
          p.lean = mix(p.lean, 0.34 + 0.04 * (w - 1), k);
          p.twist = mix(p.twist, 0.12, k);
          p.lift = -0.035 * k;
          p.legSpread = mix(p.legSpread, 0.17, k);
          p.head.x = mix(p.head.x, 0.3, k);
          p.tremble = a > BLOW.down && a < BLOW.down + BLOW.hold ? 0.35 : 0;
        }
      }
      break;
    }
    case "forge": {
      if (i.forge === "bellows") {
        // both hands on the bellows' handles, pumped down with the whole body
        const pump = i.pumping || i.pumpAge < PUMP_S ? Math.sin(clamp01(i.pumpAge / PUMP_S) * Math.PI) : 0;
        p.armL.x = mix(-1.3, -0.72, pump);
        p.armR.x = mix(-1.3, -0.72, pump);
        p.armL.in = 0.36;
        p.armR.in = 0.36;
        p.lean = mix(0.2, 0.4, pump);
        p.lift = -0.03 * pump;
        p.legL = -0.16;
        p.legR = 0.1;
        p.legSpread = 0.12;
        p.head.x = 0.18;
      } else {
        // the tongs out low in the left hand, the hammer raised and brought down on the beat
        p.armL.x = -1.05 + breath * 0.02;
        p.armL.in = 0.42;
        const h = i.hammerAge;
        const down = h < 0.07 ? snap(h / 0.07) : 1 - ease((h - 0.15) / 0.3);
        const raised = -2.1 + breath * 0.04;
        p.armR.x = h < 0.45 ? mix(raised, -0.95, down) : raised;
        p.armR.in = h < 0.45 ? mix(-0.6, 0.22, down) : -0.6;
        p.lean = 0.2 + 0.14 * (h < 0.45 ? down : 0);
        p.twist = -0.12 + 0.2 * (h < 0.45 ? down : 0);
        p.lift = h < 0.45 ? -0.025 * down : 0;
        p.legL = -0.18;
        p.legR = 0.12;
        p.legSpread = 0.13;
        p.head.x = 0.3;
        p.tremble = h > 0.07 && h < 0.13 ? 0.4 : 0;
      }
      break;
    }
    case "chisel": {
      // crouched over the anvil, the head down over the geode
      p.lean = 0.4;
      p.lift = -0.06;
      p.legL = -0.28;
      p.legR = 0.14;
      p.legSpread = 0.16;
      p.head.x = 0.36;
      if (i.geode === "aim") {
        // both hands round the geode, turning it to find the seam
        p.armL.x = -1.12;
        p.armR.x = -1.12;
        p.armL.in = 0.55;
        p.armR.in = 0.55;
        p.armL.y = 0.35 * Math.sin(t * 2.6 + seed);
        p.armR.y = 0.35 * Math.sin(t * 2.6 + seed);
        p.twist = 0.05 * Math.sin(t * 2.6 + seed);
      } else {
        // the chisel set on the seam, the mallet drawn back as the power builds; the blow
        p.armL.x = -1.2;
        p.armL.in = 0.5;
        const drawn = -1.55 - 0.6 * i.power;
        const b = i.chiselAge;
        const down = b < 0.06 ? snap(b / 0.06) : 1 - ease((b - 0.14) / 0.35);
        p.armR.x = b < 0.5 ? mix(drawn, -1.15, down) : drawn;
        p.armR.in = b < 0.5 ? mix(0.3 - 0.8 * i.power, 0.34, down) : 0.3 - 0.8 * i.power;
        p.twist = -0.1 * i.power + (b < 0.5 ? 0.12 * down : 0);
        p.tremble = i.power > 0.6 && !(b < 0.5) ? (i.power - 0.6) * 1.2 : b > 0.06 && b < 0.12 ? 0.5 : 0;
      }
      break;
    }
    case "soak": {
      // settling in: sinking to the chest, then leaning back with the arms spread along the rim
      const inn = ease(i.age / 1.4);
      const slow = Math.sin(t * 0.9 + seed);
      p.legL = mix(-1.57, -1.25, inn) + 0.04 * Math.sin(t * 0.7 + seed);
      p.legR = mix(-1.57, -1.25, inn) + 0.04 * Math.sin(t * 0.7 + seed + 1.3);
      p.legSpread = 0.14;
      p.armL.x = mix(-0.5, 0.28, inn);
      p.armR.x = mix(-0.5, 0.28, inn);
      p.armL.in = mix(0.1, -1.2, inn);
      p.armR.in = mix(0.1, -1.2, inn);
      p.lean = mix(0, -0.3, inn);
      p.lift = mix(0.1, 0, inn) + 0.012 * slow;
      p.head.x = mix(0, -0.3, inn) + 0.03 * slow;
      p.head.z = 0.06 * Math.sin(t * 0.35 + seed);
      p.eyesShut = inn > 0.8;
      break;
    }
    case "winch": {
      // a hand up on the rope, the other out on the cage's bar, the feet together, swaying with
      // the cage, looking up
      const sway = Math.sin(t * 2.2 + seed);
      p.armR.x = -2.78 + sway * 0.03;
      p.armL.x = -1.45 - sway * 0.03;
      p.armR.in = 0.34;
      p.armL.in = -0.75;
      p.legSpread = 0.02;
      p.lean = -0.04;
      p.roll = sway * 0.035;
      p.head.x = -0.24;
      p.head.y = 0.1 * Math.sin(t * 0.6 + seed);
      break;
    }
  }
  return p;
}
