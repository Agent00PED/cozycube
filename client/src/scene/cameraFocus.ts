import { useSyncExternalStore } from "react";

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
  /** How high the local player's feet are (a raised stage, a seat). */
  y: 0,
};

/** How many world units the camera fits across the viewport: the current world sets it (its floor plus a margin). */
export const frame = { size: 15.8 };

// Free look: in the Free Pan camera mode, dragging with the right or middle mouse button (or two
// fingers) releases the camera from the player so you can look round the room. It snaps back to
// following the moment the player moves. The HUD does not need it, so it is a plain flag like the
// rest of this module.
export const cameraView = { freeLook: false };

/** Return to following the player (called whenever a walk starts). */
export function requestRecenter() {
  cameraView.freeLook = false;
}

// The camera mode, a setting kept in this browser (the HUD's top bar and the Settings panel both
// switch it):
//   follow     the default: the camera stays locked on you, gliding after you wherever you go (to
//              every edge of the room), and zooming in and out round you
//   free_pan   the classic view: the camera leans toward you, and a right- or middle-drag pans it
//              anywhere over the room until you move again

export type CameraMode = "follow" | "free_pan";
const CAMERA_KEY = "cozy-camera-mode";

function loadCameraMode(): CameraMode {
  try {
    return localStorage.getItem(CAMERA_KEY) === "free_pan" ? "free_pan" : "follow";
  } catch {
    return "follow";
  }
}

export const cameraSettings = { mode: loadCameraMode() };
const cameraListeners = new Set<() => void>();

export function setCameraMode(mode: CameraMode) {
  if (cameraSettings.mode === mode) return;
  cameraSettings.mode = mode;
  cameraView.freeLook = false;
  try {
    localStorage.setItem(CAMERA_KEY, mode);
  } catch {
    // storage blocked: the mode holds for this visit
  }
  cameraListeners.forEach((l) => l());
}

function subscribeCameraMode(listener: () => void) {
  cameraListeners.add(listener);
  return () => {
    cameraListeners.delete(listener);
  };
}

export function useCameraMode(): CameraMode {
  return useSyncExternalStore(subscribeCameraMode, () => cameraSettings.mode);
}
