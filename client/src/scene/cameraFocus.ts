// Where the local player is right now, shared between the movement hook (which knows), the
// action dock and the scene. A plain mutable module object rather than React state on purpose:
// it is written every frame and read every frame, and routing a 60 Hz value through React would
// re-render the scene 60 times a second for nothing.
export const cameraFocus = {
  x: 0,
  z: 0,
  hasTarget: false,
  /** The local player's walking direction (0, 0 when standing). */
  dirX: 0,
  dirZ: 0,
  /** The way the local player faces (radians; heading 0 faces +z): a ground sit keeps it. */
  facing: 0,
};

/** How many world units the camera fits across the viewport: the current world sets it (its floor plus a margin). */
export const frame = { size: 15.8 };

// Free look: dragging with the right or middle mouse button (or two fingers) releases the camera
// from the player so you can look round the room. It snaps back to following the moment the
// player moves. The HUD does not need it, so it is a plain flag like the rest of this module.
export const cameraView = { freeLook: false };

/** Return to following the player (called whenever a walk starts). */
export function requestRecenter() {
  cameraView.freeLook = false;
}
