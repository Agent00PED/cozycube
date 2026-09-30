import * as THREE from "three";
import { ORE_NODE_AT } from "@shared/worlds/caverns";
import { ORE_KINDS, oreCenterY } from "@shared/caverns_mining";
import { cameraFocus } from "./cameraFocus";

// The Glimmering Caverns' close-up for prospecting: walking up to a node and using it frames the rock
// against the cavern wall behind it (IsometricCanvas's camera rig blends into it over BLEND_S, and
// back out when you step away; the wheel, a pinch and a drag leave it alone while it is on).
//
//   framing   the rock's centre over the miner's shoulder: from SIDE off the line between the rock
//             and where you stand (so you swing at its side, never standing in front of it), on the
//             side nearer the usual view, and for a wall-mounted node never more than FACE_LIMIT off
//             the way it faces out of its wall; lower than the isometric view (ELEVATION); chosen as
//             the close-up opens and held while it lasts
//   zoom      the rock (or the Titan Monolith, taller) about FILL of the screen's height
//   juice     a strike's shake (prospectShake), bigger for a deflected blow or a shatter
//
// The same close-up frames the other work down there (`spot`: the forge at its bellows and hammer,
// the anvil at its geode), you and it together, set high on the screen: the work's sheet sits at
// the foot (components/hud/WorkSheet.tsx).

export interface WorkSpot {
  /** What to frame: its middle, its half-width and its height (m), the way it faces out (on the
   *  ground; the camera never comes from behind it). */
  x: number;
  y: number;
  z: number;
  r: number;
  tall: number;
  face: { x: number; z: number } | null;
}

export const prospectCam = {
  /** The node framed ("" none), and the blend (0 the usual camera .. 1 the close-up). */
  node: "",
  blend: 0,
  /** A work spot framed instead (null none). */
  spot: null as WorkSpot | null,
};
/** Whether a close-up is on (a node or a work spot): the wheel, a pinch and a drag leave it alone. */
export const closeUpOn = () => !!prospectCam.node || !!prospectCam.spot;

const BLEND_S = 0.55;
const ELEVATION = THREE.MathUtils.degToRad(27);
const ISO_AZ = Math.PI / 4;
const SIDE = THREE.MathUtils.degToRad(55);
const FACE_LIMIT = THREE.MathUtils.degToRad(75);
const FILL = 0.46;
const DISTANCE = 30;

const shake = { amp: 0, at: 0 };
/** A strike's jolt (metres of wobble, fading in a quarter second). */
export function prospectShake(amp: number) {
  shake.amp = Math.max(shake.amp * 0.5, amp);
  shake.at = performance.now();
}

/** Moves the blend on by a frame; true while any of the close-up shows. */
export function stepProspectBlend(delta: number): boolean {
  const goal = closeUpOn() ? 1 : 0;
  if (prospectCam.blend !== goal) prospectCam.blend = goal > prospectCam.blend ? Math.min(1, prospectCam.blend + delta / BLEND_S) : Math.max(0, prospectCam.blend - delta / BLEND_S);
  // (all the way out: the next close-up picks its angle afresh, from wherever you stand then)
  if (prospectCam.blend === 0 && !closeUpOn()) last.node = "";
  return prospectCam.blend > 0;
}

export function prospectEase(): number {
  const k = prospectCam.blend;
  return k * k * (3 - 2 * k);
}

const last = { node: "", az: ISO_AZ, look: new THREE.Vector3(), r: 0.5, tall: 1, lift: 0 };

/** Where the close-up is this frame: its position, what it looks at, and the zoom (pixels a metre). */
export function prospectPose(size: { width: number; height: number }, out: { pos: THREE.Vector3; look: THREE.Vector3; zoom: number }) {
  const node = prospectCam.node ? ORE_NODE_AT.get(prospectCam.node) : undefined;
  const spot = !node ? prospectCam.spot : null;
  if (spot) {
    const key = `spot:${spot.x.toFixed(2)}:${spot.z.toFixed(2)}`;
    if (last.node !== key) {
      // from the usual view's side, never from behind the thing (its face)
      const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
      let az = ISO_AZ;
      if (spot.face) {
        const fa = Math.atan2(spot.face.z, spot.face.x);
        az = fa + THREE.MathUtils.clamp(wrap(az - fa), -FACE_LIMIT * 0.7, FACE_LIMIT * 0.7);
      }
      last.az = az;
    }
    last.node = key;
    last.look.set(spot.x, spot.y, spot.z);
    last.r = spot.r;
    last.tall = spot.tall;
    last.lift = 1;
  }
  if (node) {
    last.lift = 0;
    const info = ORE_KINDS[node.kind];
    if (last.node !== node.id) {
      // over the shoulder: SIDE off the line from the rock to the miner, the side nearer the usual view
      const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
      const pa = Math.atan2(cameraFocus.z - node.z, cameraFocus.x - node.x);
      const a = pa + SIDE;
      const b = pa - SIDE;
      let az = Math.abs(wrap(a - ISO_AZ)) <= Math.abs(wrap(b - ISO_AZ)) ? a : b;
      // (a wall's node: never from behind its wall)
      if (node.face) {
        const fa = Math.atan2(node.face.z, node.face.x);
        az = fa + THREE.MathUtils.clamp(wrap(az - fa), -FACE_LIMIT, FACE_LIMIT);
      }
      last.az = az;
    }
    last.node = node.id;
    last.look.set(node.x, node.y + oreCenterY(node.kind), node.z);
    last.r = info.radius;
    last.tall = node.kind === "monolith" ? 3.4 : info.radius * 2.2;
  }
  // (blending out after the node is gone: the last framing, held)
  const t = (performance.now() - shake.at) / 1000;
  const k = shake.amp * Math.max(0, 1 - t / 0.25);
  const jx = k * Math.sin(t * 90);
  const jy = k * Math.cos(t * 77);
  const bx = Math.cos(last.az);
  const bz = Math.sin(last.az);
  out.look.set(last.look.x + jx * bz, last.look.y + jy, last.look.z - jx * bx);
  out.pos.set(out.look.x + bx * Math.cos(ELEVATION) * DISTANCE, out.look.y + Math.sin(ELEVATION) * DISTANCE, out.look.z + bz * Math.cos(ELEVATION) * DISTANCE);
  out.zoom = Math.min((size.height * FILL) / last.tall, (size.width * 0.6) / (last.r * 2.4));
  // (a work spot set high on the screen: its sheet takes the foot)
  if (last.lift > 0) {
    const down = (0.2 * size.height) / out.zoom;
    out.look.y -= down;
    out.pos.y -= down;
  }
}
