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
  /** Temporary "look over there" (e.g. clicking a friend in the roster), then back to the player. */
  override: null as { x: number; z: number; until: number } | null,
};

export function lookAtTemporarily(x: number, z: number, ms = 2600) {
  cameraFocus.override = { x, z, until: performance.now() + ms };
}
