import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { noRaycast } from "./kit";

const SPRAY_GEO = new THREE.SphereGeometry(1, 6, 4);
const SPRAY_MAT = new THREE.MeshBasicMaterial({ color: "#eaf6f8", transparent: true, opacity: 0.55, depthWrite: false });
const dummy = new THREE.Object3D();

/** Where water lands: a point at the water's height, `w` half as wide as the fall, and the way the
 *  spray is thrown (a unit vector on the ground). */
export interface SprayAt {
  x: number;
  y: number;
  z: number;
  w: number;
  out: { x: number; z: number };
}

/** The spray where falling water lands (the foot of a fall, the foot of the sheet over an island's
 *  edge): little puffs thrown up and out, falling back and thinning away. One instanced draw. */
export function FallsSpray({ spots, each = 13 }: { spots: SprayAt[]; each?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = spots.length * each;
  const seeds = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ at: i % spots.length, phase: Math.random(), rate: 0.7 + Math.random() * 0.6, fan: Math.random() * 1.6 - 0.8, out: 0.15 + Math.random() * 0.35, up: 0.25 + Math.random() * 0.35, side: Math.random() * 2 - 1, size: 0.04 + Math.random() * 0.05 })),
    [count, spots.length]
  );
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const at = spots[s.at];
      const u = (t * s.rate + s.phase) % 1;
      // (across the fall's width, thrown up and out on an arc, swelling as it thins)
      const cx = at.out.x * Math.cos(s.fan) - at.out.z * Math.sin(s.fan);
      const cz = at.out.x * Math.sin(s.fan) + at.out.z * Math.cos(s.fan);
      dummy.position.set(at.x - at.out.z * s.side * at.w + cx * s.out * u, at.y + 0.03 + s.up * 4 * u * (1 - u), at.z + at.out.x * s.side * at.w + cz * s.out * u);
      dummy.scale.setScalar(s.size * (0.5 + u) * (1 - u * u));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[SPRAY_GEO, SPRAY_MAT, count]} raycast={noRaycast} frustumCulled={false} />;
}
