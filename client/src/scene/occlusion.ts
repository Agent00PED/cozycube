import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { cameraFocus } from "./cameraFocus";

// Camera-occlusion fade.
//
// The isometric camera looks along (1, 1, 1), so in world terms an object hides the player when
// it sits FURTHER along the (x + z) diagonal than they do (nearer the camera) while being close
// to them across that diagonal. That is the whole test — no raycasting, no render targets.
const FADE_NEAR = 1.4; // how far along the diagonal an occluder must be in front to count
const FADE_DEPTH = 7.0; // and how far in front it stops mattering
const FADED = 0.32;
const LERP = 0.16;

export function isOccludingLocalPlayer(x: number, z: number, halfWidth: number): boolean {
  const px = cameraFocus.x;
  const pz = cameraFocus.z;
  if (!cameraFocus.hasTarget) return false;
  const depth = x + z - (px + pz); // > 0 means the object is nearer the camera than the player
  if (depth < FADE_NEAR || depth > FADE_DEPTH) return false;
  const across = Math.abs(x - z - (px - pz)) / Math.SQRT2;
  return across < halfWidth;
}

/**
 * Drives `materials`' opacity between 1 and FADED depending on whether this prop is standing
 * between the camera and the local player. The materials must be instance-owned (never shared)
 * and already have transparent: true.
 */
export function useOcclusionFade(x: number, z: number, halfWidth: number, materials: { opacity: number }[]) {
  const opacityRef = useRef(1);
  useFrame(() => {
    const goal = isOccludingLocalPlayer(x, z, halfWidth) ? FADED : 1;
    opacityRef.current += (goal - opacityRef.current) * LERP;
    for (const m of materials) m.opacity = opacityRef.current;
  });
}
