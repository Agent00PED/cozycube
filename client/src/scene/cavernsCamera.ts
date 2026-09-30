import * as THREE from "three";
import { cameraFocus, frame } from "./cameraFocus";

// The Glimmering Caverns' close camera: down in the karst the view is locked in tight behind you,
// never the whole cavern at once (IsometricCanvas's camera rig blends into it over BLEND_S as you
// arrive, from wherever the usual view was).
//
//   distance  DEFAULT metres to start, the wheel or a pinch free to move it anywhere between MIN and MAX
//             (close in over your shoulder, or out over the whole karst). The camera is orthographic
//             like the rest of the game, so the
//             distance sets what the view holds (what a FOV lens would see from there, TALLER top to
//             bottom) and where the camera stands: anything nearer the lens than that (the vault's
//             overhang, a rim of rock) is cut away by the near plane instead of hiding you
//   angle     from the south-east like the usual view (the screen's axes are the same), PITCH down
//   tracking  always on you (whatever the camera mode): its look LOOK_UP over your feet, eased after
//             you on every axis (down the switchbacks the view comes down with you), a jump (the
//             arrival) cut straight to

export const CAVERN_CAM = {
  MIN: 3.5,
  MAX: 16.0,
  DEFAULT: 7.0,
  PITCH: THREE.MathUtils.degToRad(34),
  BLEND_S: 1.2,
  LOOK_UP: 0.8,
};

const FOV = 45;
const TALLER = 1.18;
/** The least the view holds across, as a share of what it holds top to bottom (a 5:4 screen's). */
const MIN_WIDE = 1.25;
const ISO_AZ = Math.PI / 4;
const TRACK_DAMPING = 0.1;
const DIST_DAMPING = 0.15;
const SNAP = 6;

export const cavernCam = {
  /** Whether you are in the caverns (WorldScene sets it). */
  on: false,
  /** The blend (0 the usual camera .. 1 the close one). */
  blend: 0,
  /** The distance the wheel or a pinch asks for, and the one shown (eased toward it). */
  want: CAVERN_CAM.DEFAULT,
  dist: CAVERN_CAM.DEFAULT,
};

/** The wheel or a pinch: a step closer or further, kept between MIN and MAX. */
export function cavernZoomBy(factor: number) {
  cavernCam.want = THREE.MathUtils.clamp(cavernCam.want * factor, CAVERN_CAM.MIN, CAVERN_CAM.MAX);
}

const frameLerp = (factor: number, delta: number) => 1 - Math.pow(1 - factor, delta * 60);
const track = { look: new THREE.Vector3(), ready: false };

/** Moves the blend on by a frame (in over BLEND_S; out at once: leaving is a trip, and the camera cuts
 *  to the next world); true while any of the close camera shows. */
export function stepCavernBlend(delta: number): boolean {
  if (!cavernCam.on) {
    cavernCam.blend = 0;
    track.ready = false;
    return false;
  }
  if (cavernCam.blend === 0) {
    // an arrival: the view comes in from the usual framing to the default distance
    cavernCam.want = CAVERN_CAM.DEFAULT;
    cavernCam.dist = CAVERN_CAM.DEFAULT;
  }
  cavernCam.blend = Math.min(1, cavernCam.blend + delta / CAVERN_CAM.BLEND_S);
  return true;
}

export function cavernEase(): number {
  const k = cavernCam.blend;
  return k * k * (3 - 2 * k);
}

/** Where the close camera is this frame: its position, what it looks at and the zoom (pixels a metre).
 *  `cut`: the player has just been placed (an arrival): no easing after them. */
export function cavernPose(delta: number, size: { width: number; height: number }, cut: boolean, out: { pos: THREE.Vector3; look: THREE.Vector3; zoom: number }) {
  const gx = cameraFocus.x;
  const gy = cameraFocus.y + CAVERN_CAM.LOOK_UP;
  const gz = cameraFocus.z;
  const t = track.look;
  if (cut || !track.ready || Math.hypot(gx - t.x, gz - t.z) > SNAP) t.set(gx, gy, gz);
  else {
    const k = frameLerp(TRACK_DAMPING, delta);
    t.x += (gx - t.x) * k;
    t.y += (gy - t.y) * k;
    t.z += (gz - t.z) * k;
  }
  track.ready = true;
  const b = frame.bounds;
  if (b) {
    t.x = THREE.MathUtils.clamp(t.x, b.x0, b.x1);
    t.z = THREE.MathUtils.clamp(t.z, b.z0, b.z1);
  }
  cavernCam.dist += (cavernCam.want - cavernCam.dist) * frameLerp(DIST_DAMPING, delta);
  const d = THREE.MathUtils.clamp(cavernCam.dist, CAVERN_CAM.MIN, CAVERN_CAM.MAX);
  const flat = d * Math.cos(CAVERN_CAM.PITCH);
  out.look.copy(t);
  out.pos.set(t.x + Math.cos(ISO_AZ) * flat, t.y + d * Math.sin(CAVERN_CAM.PITCH), t.z + Math.sin(ISO_AZ) * flat);
  const tall = 2 * d * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * TALLER;
  // (a narrow screen, a phone or a tablet in portrait, still holds at least MIN_WIDE of that across:
  // the view widens with the screen's height rather than closing in to a strip round your feet)
  out.zoom = Math.min(size.height / tall, size.width / (tall * MIN_WIDE));
  // (the camera orthographic, standing further back changes nothing of the framing: a view widened
  // for a narrow screen stands back with it, so its near plane never cuts the ground in front)
  const back = size.height / out.zoom / tall;
  if (back > 1) {
    const db = d * back;
    const fb = db * Math.cos(CAVERN_CAM.PITCH);
    out.pos.set(t.x + Math.cos(ISO_AZ) * fb, t.y + db * Math.sin(CAVERN_CAM.PITCH), t.z + Math.sin(ISO_AZ) * fb);
  }
}
