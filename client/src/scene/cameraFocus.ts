// Where the camera should be looking, shared between the scene (which knows where the local
// player is) and the camera rig (which lives outside WorldScene, as a sibling in the Canvas).
//
// A plain mutable module object rather than React state or context on purpose: it is written
// every frame and read every frame, and routing a 60 Hz value through React would re-render the
// scene 60 times a second for nothing.
export const cameraFocus = {
  /** Where the local player is right now. */
  x: 0,
  z: 0,
  hasTarget: false,
  /** The local player's current walking direction (0,0 when standing) — the volleyball uses it
   *  to decide which way a bump sends the ball. */
  dirX: 0,
  dirZ: 0,
  /** Temporary "look over there" (e.g. clicking a friend in the roster), then back to the player. */
  override: null as { x: number; z: number; until: number } | null,
  /**
   * A frame the camera holds instead of following the player: its centre and how many world
   * units it fits across the viewport. The intimate lounge asks for one (it fills the screen
   * from a fixed point); the bigger worlds leave it null and follow.
   */
  frame: null as { x: number; z: number; size: number } | null,
};

export function setCameraFrame(frame: { x: number; z: number; size: number } | null) {
  cameraFocus.frame = frame;
}

export function lookAtTemporarily(x: number, z: number, ms = 2600) {
  cameraFocus.override = { x, z, until: performance.now() + ms };
  setFreeLook(false); // glancing at a friend takes the camera back off free look
}

// --- free look ----------------------------------------------------------------------------
//
// Right-drag (or a two-finger drag) releases the camera from the player so you can go and watch
// what your friends are doing in the kitchen. The HUD needs to know about that to show the
// recenter button, and the HUD is outside the Canvas, so this is a tiny subscribable store
// rather than part of the per-frame object above — it changes on gestures, not every frame.
let freeLook = false;
const listeners = new Set<(free: boolean) => void>();

export function isFreeLook(): boolean {
  return freeLook;
}

export function setFreeLook(value: boolean) {
  if (freeLook === value) return;
  freeLook = value;
  listeners.forEach((l) => l(value));
}

/** Snap back to following the player (the recenter button, or starting a new walk). */
export function requestRecenter() {
  cameraFocus.override = null;
  setFreeLook(false);
}

export function subscribeFreeLook(listener: (free: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
