import { useContext, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { noRaycast } from "./kit";
import { CampDaylightContext } from "./campDay";

// Shafts of daylight falling through a canopy (the Whispering Woods' Old Growth): one instanced open
// cylinder, additive, its edges and its ends fading (no depth write: never a hard edge), a slow
// breath in it. By day only: they fade out through dusk.

const U = { uTime: { value: 0 }, uDay: { value: 1 } };
const TOP = 7.5;
const TILT = 0.22;
const GEO = (() => {
  const g = new THREE.CylinderGeometry(0.7, 1.15, 1, 20, 1, true);
  g.translate(0, 0.5, 0);
  return g;
})();
const MAT = new THREE.ShaderMaterial({
  uniforms: U,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: `
    varying float vUp;
    varying float vFace;
    varying vec3 vAt;
    void main() {
      vec4 p = vec4(position, 1.0);
      vec3 n = normal;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        n = mat3(instanceMatrix) * n;
      #endif
      vUp = position.y;
      vAt = p.xyz;
      vFace = abs(normalize(normalMatrix * n).z);
      gl_Position = projectionMatrix * modelViewMatrix * p;
    }`,
  fragmentShader: `
    uniform float uTime;
    uniform float uDay;
    varying float vUp;
    varying float vFace;
    varying vec3 vAt;
    void main() {
      float ends = smoothstep(0.0, 0.18, vUp) * (1.0 - smoothstep(0.35, 1.0, vUp));
      float core = pow(vFace, 1.3) * smoothstep(0.0, 0.35, vFace);
      float breath = 0.8 + 0.2 * sin(uTime * 0.4 + vAt.x * 0.7 + vAt.z * 0.5);
      float a = ends * core * breath * 0.17 * uDay;
      // (additive: the colour is already weighted by its alpha)
      gl_FragColor = vec4(vec3(1.0, 0.93, 0.7), a);
    }`,
});

export function LightShafts({ shafts, landY }: { /** Where each shaft lands, and how wide. */ shafts: readonly { x: number; z: number; r: number }[]; landY: (x: number, z: number) => number }) {
  const daylight = useContext(CampDaylightContext) ?? 1;
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(GEO, MAT, shafts.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    im.renderOrder = 2;
    const m = new THREE.Matrix4();
    // (leaning toward the north-west, where the sun stands behind the hill)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-TILT, 0, TILT));
    shafts.forEach((s, i) => {
      const y = landY(s.x, s.z) - 0.05;
      m.compose(new THREE.Vector3(s.x, y, s.z), q, new THREE.Vector3(s.r, TOP, s.r));
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [shafts, landY]);
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh]
  );
  useFrame(({ clock }) => {
    U.uTime.value = clock.elapsedTime;
    U.uDay.value = THREE.MathUtils.smoothstep(daylight, 0.35, 0.9);
    mesh.visible = U.uDay.value > 0.01;
  });
  return <primitive object={mesh} />;
}
