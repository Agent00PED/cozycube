import { useContext, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { instanced, template } from "./faunaKit";
import { CampDaylightContext } from "./campDay";

// Butterflies drifting over a world's meadows by day, from its model's templates
// (`prefix`_Body, _WingL, _WingR): three instanced draws for all of them. Each keeps to its
// own meadow in a lazy loop, flapping as it goes; gone by night.

const FLY_TINTS = ["#ffe066", "#ff9ec4", "#9fd4ff", "#d4b0ff", "#ffb56b", "#b8f0a0"];

export function Butterflies({ scene, spots, landY, prefix = "Fauna_Butterfly", tints = FLY_TINTS, size = 2.8, pace = 1, lift = 0.75 }: { /** Their colours, how big they are drawn, how quick they fly and how high over `landY` (dragonflies over the water: blue, small, quick, low). */ tints?: string[]; size?: number; pace?: number; lift?: number; scene: THREE.Object3D; /** The templates' name in this world's model (`<prefix>_Body`, `_WingL`, `_WingR`). */ prefix?: string; /** Each one's meadow (x, z). */ spots: readonly (readonly [number, number])[]; /** The ground's height. */ landY: (x: number, z: number) => number }) {
  const daylight = useContext(CampDaylightContext) ?? 1;
  const parts = useMemo(() => ["Body", "WingL", "WingR"].map((n) => instanced(template(scene, `${prefix}_${n}`), spots.length, tints)), [scene, spots, prefix, tints]);
  useEffect(
    () => () => {
      for (const p of parts) p?.mesh.dispose();
    },
    [parts]
  );
  const flies = useMemo(() => spots.map(([x, z], i) => ({ x, z, p: i * 1.7 + Math.random(), a: 0.18 + Math.random() * 0.1, b: 0.23 + Math.random() * 0.1 })), [spots]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1), rot: new THREE.Matrix4() }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * pace;
    const day = daylight > 0.3;
    for (const p of parts) if (p) p.mesh.visible = day;
    if (!day) return;
    const { m, w, q, pos, scl, up, fwd, rot } = tmp;
    flies.forEach((f, i) => {
      const x = f.x + Math.sin(t * f.a + f.p) * 1.9 + Math.sin(t * f.a * 2.3 + f.p) * 0.5;
      const z = f.z + Math.cos(t * f.b + f.p * 1.3) * 1.5;
      const y = landY(x, z) + lift + 0.35 * Math.min(1, lift / 0.75) * Math.sin(t * 0.9 + f.p) + 0.08 * Math.sin(t * 7 + f.p);
      const vx = Math.cos(t * f.a + f.p) * 1.9 * f.a;
      const vz = -Math.sin(t * f.b + f.p * 1.3) * 1.5 * f.b;
      q.setFromAxisAngle(up, Math.atan2(vx, vz));
      m.compose(pos.set(x, y, z), q, scl.set(size, size, size));
      const flap = 0.2 + Math.abs(Math.sin(t * 14 + f.p)) * 1.15;
      parts[0]?.mesh.setMatrixAt(i, w.copy(m).multiply(parts[0].t.matrix));
      if (parts[1]) parts[1].mesh.setMatrixAt(i, w.copy(m).multiply(parts[1].t.matrix).multiply(rot.makeRotationAxis(fwd, flap)));
      if (parts[2]) parts[2].mesh.setMatrixAt(i, w.copy(m).multiply(parts[2].t.matrix).multiply(rot.makeRotationAxis(fwd, -flap)));
    });
    for (const p of parts) if (p) p.mesh.instanceMatrix.needsUpdate = true;
  });

  return <>{parts.map((p, i) => (p ? <primitive key={i} object={p.mesh} /> : null))}</>;
}
