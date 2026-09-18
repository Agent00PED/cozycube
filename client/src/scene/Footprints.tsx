import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GEO, noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";

// Little prints left in the sand behind the local player, alternating left and right foot and
// fading as the tide smooths them over. One instanced mesh, a fixed-size ring buffer: walking
// the whole beach costs the same as standing still.
const MAX_PRINTS = 26;
const STRIDE = 0.42; // world units between prints
const LIFETIME = 7; // seconds before a print has smoothed away completely

export function Footprints({ color = "#cbb083" }: { color?: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }),
    [color]
  );
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const prints = useMemo(
    () => Array.from({ length: MAX_PRINTS }, () => ({ x: 0, z: 0, angle: 0, age: Infinity })),
    []
  );
  const state = useRef({ next: 0, lastX: cameraFocus.x, lastZ: cameraFocus.z, side: 1, primed: false });

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const s = state.current;

    if (!s.primed && cameraFocus.hasTarget) {
      s.lastX = cameraFocus.x;
      s.lastZ = cameraFocus.z;
      s.primed = true;
    }

    const dx = cameraFocus.x - s.lastX;
    const dz = cameraFocus.z - s.lastZ;
    const travelled = Math.hypot(dx, dz);
    if (s.primed && travelled >= STRIDE) {
      const angle = Math.atan2(dx, dz);
      // step to the side of the line of travel, so the trail reads as two feet not one
      const side = s.side * 0.12;
      const print = prints[s.next];
      print.x = cameraFocus.x + Math.cos(angle) * side;
      print.z = cameraFocus.z - Math.sin(angle) * side;
      print.angle = angle;
      print.age = 0;
      s.next = (s.next + 1) % MAX_PRINTS;
      s.side *= -1;
      s.lastX = cameraFocus.x;
      s.lastZ = cameraFocus.z;
    }

    for (let i = 0; i < prints.length; i++) {
      const print = prints[i];
      print.age += delta;
      const t = print.age / LIFETIME;
      if (t >= 1) {
        tmp.scale.setScalar(0.0001);
      } else {
        tmp.position.set(print.x, 0.012, print.z);
        tmp.rotation.set(-Math.PI / 2, 0, -print.angle);
        tmp.scale.set(0.16, 0.26 * (1 - t * 0.25), 1);
      }
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    material.opacity = 0.5;
  });

  return (
    <instancedMesh ref={meshRef} args={[GEO.plane, material, MAX_PRINTS]} frustumCulled={false} raycast={noRaycast} />
  );
}
