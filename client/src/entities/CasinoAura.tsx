import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { casinoDrinkOf, type CasinoDrinkId } from "@shared/casino";
import { noRaycast } from "../scene/kit";

// The glow a drink from Pippin's bar leaves round whoever drank it (PlayerState.aura "casino:<id>"),
// for as long as it lasts: everyone sees it.
//
//   Velvet Fizz    rose-pink bubbles rising round them, wobbling as they go
//   Lucky Martini  a ring of little gold glints circling at the chest, twinkling
//   Espresso       wisps of steam off the shoulders (they walk 20% quicker, too)
//
// One instanced mesh of tiny opaque shapes (a single draw call), shrinking away to nothing instead
// of fading, so nothing needs to be transparent.

const BUBBLE = new THREE.SphereGeometry(1, 8, 6);
const GLINT = new THREE.OctahedronGeometry(1, 0);
const LOOKS: Record<CasinoDrinkId, { count: number; geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial }> = {
  fizz: { count: 10, geo: BUBBLE, mat: new THREE.MeshBasicMaterial({ color: "#ff9ccf", toneMapped: false }) },
  martini: { count: 8, geo: GLINT, mat: new THREE.MeshBasicMaterial({ color: "#ffd76a", toneMapped: false }) },
  espresso: { count: 6, geo: BUBBLE, mat: new THREE.MeshBasicMaterial({ color: "#f4efe6" }) },
};
const dummy = new THREE.Object3D();

export function CasinoAura({ aura }: { aura: string }) {
  const drink = casinoDrinkOf(aura);
  return drink ? <AuraParticles key={drink} drink={drink} /> : null;
}

function AuraParticles({ drink }: { drink: CasinoDrinkId }) {
  const look = LOOKS[drink];
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: look.count }, (_, i) => ({ a: (i / look.count) * Math.PI * 2 + Math.random() * 0.6, r: 0.22 + Math.random() * 0.18, sp: 0.35 + Math.random() * 0.35, ph: Math.random() })), [look.count]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const f = (t * s.sp + s.ph) % 1;
      if (drink === "fizz") {
        const a = s.a + t * 0.6;
        dummy.position.set(Math.cos(a) * s.r + Math.sin(t * 3 + i) * 0.03, 0.25 + f * 1.45, Math.sin(a) * s.r);
        dummy.scale.setScalar(0.028 * (1 - f) + 0.008);
      } else if (drink === "martini") {
        const a = s.a + t * 1.3;
        dummy.position.set(Math.cos(a) * 0.42, 0.85 + 0.12 * Math.sin(t * 2 + s.ph * 6), Math.sin(a) * 0.42);
        dummy.rotation.set(t * 2 + i, t * 3, 0);
        dummy.scale.setScalar(0.026 * (0.55 + 0.45 * Math.sin(t * 6 + s.ph * 9)));
      } else {
        const side = i % 2 ? 1 : -1;
        dummy.position.set(side * 0.18 + Math.sin(t + i) * 0.05 * f, 1.0 + f * 0.7, -0.05 - f * 0.15);
        dummy.scale.setScalar(0.07 * Math.sin(Math.PI * f) + 0.005);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[look.geo, look.mat, look.count]} raycast={noRaycast} frustumCulled={false} />;
}
