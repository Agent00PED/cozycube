import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cameraFocus } from "./cameraFocus";

// Dithered occlusion: a tree (or a cabin's wall) standing between the camera and you thins to a
// screen-door 35% where it covers you, so you are never lost behind the pines. A material patch
// (it chains after any patch already on the material, the pines' wind sway): each fragment of it
// that is nearer the camera than you, above ankle height, and within a metre of the line from you
// to the camera, is kept on a 4x4 Bayer pattern (35% of it, easing up to all of it at the rim).
// No transparency, no sorting: it stays one opaque draw.

const U = {
  uOccPlayer: { value: new THREE.Vector3(0, -100, 0) },
  uOccToCam: { value: new THREE.Vector3(1, 1, 1).normalize() },
  uOccOn: { value: 0 },
};
/** How much of an occluder stays over you (35%), and how wide the clear window is round you. */
const KEEP = 0.35;
const RADIUS = 1.05;

export function ditherOccluder(m: THREE.Material) {
  if (m.userData.occDither) return;
  m.userData.occDither = true;
  const prev = m.onBeforeCompile;
  const prevKey = prev.toString();
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uOccPlayer = U.uOccPlayer;
    shader.uniforms.uOccToCam = U.uOccToCam;
    shader.uniforms.uOccOn = U.uOccOn;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vOccWorld;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 occWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        occWorld = instanceMatrix * occWorld;
      #endif
      vOccWorld = (modelMatrix * occWorld).xyz;`
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vOccWorld;
        uniform vec3 uOccPlayer;
        uniform vec3 uOccToCam;
        uniform float uOccOn;
        const float OCC_BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);`
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if (uOccOn > 0.5 && vOccWorld.y > 0.3) {
          vec3 occD = vOccWorld - uOccPlayer;
          float occAlong = dot(occD, uOccToCam);
          float occR = length(occD - uOccToCam * occAlong);
          if (occAlong > 0.35 && occR < ${RADIUS.toFixed(2)}) {
            float occKeep = mix(${KEEP.toFixed(2)}, 1.0, smoothstep(${(RADIUS * 0.6).toFixed(2)}, ${RADIUS.toFixed(2)}, occR));
            int occI = int(mod(gl_FragCoord.x, 4.0)) + int(mod(gl_FragCoord.y, 4.0)) * 4;
            if ((OCC_BAYER[occI] + 0.5) / 16.0 > occKeep) discard;
          }
        }`
      );
  };
  m.customProgramCacheKey = () => prevKey + "|occ-dither";
  m.needsUpdate = true;
}

/** Keeps the dither's view of you and the camera current (mount it once in a world that dithers). */
export function OcclusionDriver() {
  const dir = new THREE.Vector3();
  useFrame(({ camera }) => {
    U.uOccPlayer.value.set(cameraFocus.x, cameraFocus.y + 0.75, cameraFocus.z);
    camera.getWorldDirection(dir);
    U.uOccToCam.value.copy(dir).negate();
    U.uOccOn.value = 1;
  });
  return null;
}
