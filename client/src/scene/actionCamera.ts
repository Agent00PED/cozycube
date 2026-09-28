import * as THREE from "three";
import { RING_FLOOR_Y } from "@shared/worlds/boxing_ring";
import { cameraFocus } from "./cameraFocus";
import { drawnAt, punchZoom, shakeOffset } from "../systems/fightAnim";
import { liveMotion } from "../systems/liveMotion";

// The Velvet Ring's action camera, for a fighter in a live bout (the countdown, the rounds, a count,
// the rest between rounds). IsometricCanvas's camera rig blends into it over BLEND_S and back out
// the same way when the bout is over or they leave the ring; while it is on, the wheel, a pinch
// and a drag do nothing (the view is the fight's).
//
//   framing    the midpoint of the two fighters (where they are drawn), seen side on (square to
//              the line between them, from the diorama's open south-east side, never more than
//              AZ_LIMIT off the usual view: the hall's walls stay behind them), the camera HEIGHT
//              over the canvas and tilted TILT down onto their chests
//   distance   clamp(gap * 1.35 + 3.8, 4.8, 8.5) m: tight in an exchange, wider as they part. The
//              camera is orthographic like the rest of the game, so the distance sets how much the
//              view holds: what a FOV lens would see from there
//   juice      the hits' shake and the Perfect Dodge's punch-in (systems/fightAnim.ts)

export const actionCam = {
  /** The local fighter's bout wants the camera (set by the ring's HUD), and the one they face. */
  want: false,
  foe: "",
  /** 0 (the usual camera) .. 1 (the action camera), eased over BLEND_S. */
  blend: 0,
};

const BLEND_S = 0.8;
const TILT = THREE.MathUtils.degToRad(26);
/** The camera's height over the canvas, and the chest height it looks at (m). */
const HEIGHT = 2.2;
const CHEST = 0.5;
/** The lens it stands in for (vertical field of view, degrees). */
const FOV = 45;
/** The usual camera looks from the south-east: the side view keeps within this of it. */
const ISO_AZ = Math.PI / 4;
const AZ_LIMIT = THREE.MathUtils.degToRad(42);

const view = { az: ISO_AZ, dist: 6, mid: new THREE.Vector2(), ready: false };
const frameLerp = (factor: number, delta: number) => 1 - Math.pow(1 - factor, delta * 60);

/** Moves the blend on by a frame; true while any of the action camera shows. */
export function stepActionBlend(delta: number): boolean {
  const goal = actionCam.want ? 1 : 0;
  if (actionCam.blend !== goal) actionCam.blend = goal > actionCam.blend ? Math.min(1, actionCam.blend + delta / BLEND_S) : Math.max(0, actionCam.blend - delta / BLEND_S);
  if (actionCam.blend === 0) view.ready = false;
  return actionCam.blend > 0;
}

/** The blend as eased (smoothstep). */
export function actionEase(): number {
  const k = actionCam.blend;
  return k * k * (3 - 2 * k);
}

/** Where the action camera is this frame: its position, the point it looks at, and the zoom
 *  (pixels a metre) for a viewport of `size`. */
export function actionPose(delta: number, size: { width: number; height: number }, out: { pos: THREE.Vector3; look: THREE.Vector3; zoom: number }) {
  const me = { x: cameraFocus.x, z: cameraFocus.z };
  const seen = actionCam.foe ? (drawnAt.get(actionCam.foe) ?? liveMotion.get(actionCam.foe)) : undefined;
  const foe = seen ? { x: seen.x, z: seen.z } : me;
  const gap = Math.hypot(foe.x - me.x, foe.z - me.z);
  const mx = (me.x + foe.x) / 2;
  const mz = (me.z + foe.z) / 2;
  // side on: square to the line between them, from the side nearer the usual view, kept within
  // AZ_LIMIT of it (the walls behind them, never the open edge of the diorama)
  let goalAz = view.az;
  if (gap > 0.05) {
    const lx = (foe.x - me.x) / gap;
    const lz = (foe.z - me.z) / gap;
    let px = -lz;
    let pz = lx;
    if (px * Math.cos(ISO_AZ) + pz * Math.sin(ISO_AZ) < 0) {
      px = -px;
      pz = -pz;
    }
    goalAz = THREE.MathUtils.clamp(Math.atan2(pz, px), ISO_AZ - AZ_LIMIT, ISO_AZ + AZ_LIMIT);
  }
  const goalDist = THREE.MathUtils.clamp(gap * 1.35 + 3.8, 4.8, 8.5);
  if (!view.ready) {
    view.az = goalAz;
    view.dist = goalDist;
    view.mid.set(mx, mz);
    view.ready = true;
  } else {
    view.az += (goalAz - view.az) * frameLerp(0.05, delta);
    view.dist += (goalDist - view.dist) * frameLerp(0.08, delta);
    view.mid.x += (mx - view.mid.x) * frameLerp(0.14, delta);
    view.mid.y += (mz - view.mid.y) * frameLerp(0.14, delta);
  }
  const bx = Math.cos(view.az);
  const bz = Math.sin(view.az);
  // the screen's right along the ground, and up (the camera tilted TILT down)
  const rx = bz;
  const rz = -bx;
  const along = (HEIGHT - CHEST) / Math.tan(TILT);
  const sh = shakeOffset();
  const upX = -bx * Math.sin(TILT);
  const upY = Math.cos(TILT);
  const upZ = -bz * Math.sin(TILT);
  const ox = rx * sh.x + upX * sh.y;
  const oy = upY * sh.y;
  const oz = rz * sh.x + upZ * sh.y;
  out.look.set(view.mid.x + ox, RING_FLOOR_Y + CHEST + oy, view.mid.y + oz);
  out.pos.set(out.look.x + bx * along, RING_FLOOR_Y + HEIGHT + oy, out.look.z + bz * along);
  // what the lens would hold from `dist`: its height, and the two fighters side by side with room
  const tall = 2 * view.dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const across = Math.abs((foe.x - me.x) * rx + (foe.z - me.z) * rz) + 2.6;
  out.zoom = Math.min(size.height / tall, size.width / Math.max(across, tall * 0.8)) * punchZoom();
}
