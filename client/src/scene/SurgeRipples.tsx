import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MapId, WorldEvent } from "@shared/types";
import { noRaycast } from "./kit";

// A King-Size Fish Surge (a living wonder, in the room's state for everyone): golden ripples
// spreading on the water where it rises, and bubbles breaking the surface, until it ends. Drawn on
// the surge's own map, at the water's height there.

const RING_GEO = new THREE.RingGeometry(0.86, 1, 40, 1);
RING_GEO.rotateX(-Math.PI / 2);
const BUBBLE_GEO = new THREE.SphereGeometry(0.05, 8, 6);
const RINGS = 4;
const BUBBLES = 18;

export function SurgeRipples({ event, mapId, waterY }: { event: WorldEvent | null; mapId: MapId; waterY: number }) {
  if (!event || event.kind !== "surge" || event.map !== mapId) return null;
  return <Surge x={event.x} z={event.z} r={event.r} y={waterY} />;
}

function Surge({ x, z, r, y }: { x: number; z: number; r: number; y: number }) {
  const rings = useMemo(
    () =>
      Array.from({ length: RINGS }, () => {
        const mat = new THREE.MeshBasicMaterial({ color: "#ffd35a", transparent: true, depthWrite: false, toneMapped: false });
        const mesh = new THREE.Mesh(RING_GEO, mat);
        mesh.raycast = noRaycast;
        mesh.renderOrder = 3;
        return mesh;
      }),
    []
  );
  const bubbles = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({ color: "#fff1b8", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const m = new THREE.InstancedMesh(BUBBLE_GEO, mat, BUBBLES);
    m.frustumCulled = false;
    m.raycast = noRaycast;
    return m;
  }, []);
  useEffect(
    () => () => {
      rings.forEach((m) => (m.material as THREE.Material).dispose());
      (bubbles.material as THREE.Material).dispose();
      bubbles.dispose();
    },
    [rings, bubbles]
  );
  const seeds = useMemo(() => Array.from({ length: BUBBLES }, () => ({ a: Math.random() * Math.PI * 2, d: Math.sqrt(Math.random()) * r * 0.8, p: Math.random(), s: 0.5 + Math.random() * 0.7 })), [r]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    rings.forEach((ring, i) => {
      // each ring spreads from the middle out to the surge's edge, fading as it goes
      const u = (t * 0.45 + i / RINGS) % 1;
      const s = 0.15 + u * r;
      ring.scale.set(s, 1, s);
      ring.position.set(x, y + 0.03, z);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - u) * Math.min(1, u * 6);
    });
    seeds.forEach((b, i) => {
      // a bubble rises to the surface, swells, pops, and comes up again somewhere else
      const u = (b.p + t * b.s) % 1;
      const sc = u < 0.85 ? 0.4 + u : Math.max(0, (1 - u) / 0.15) * 1.25;
      m.makeScale(sc, sc * 0.7, sc).setPosition(x + Math.cos(b.a + Math.floor(b.p + t * b.s) * 2.4) * b.d, y + 0.02, z + Math.sin(b.a + Math.floor(b.p + t * b.s) * 2.4) * b.d);
      bubbles.setMatrixAt(i, m);
    });
    bubbles.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      {rings.map((ring, i) => (
        <primitive key={i} object={ring} />
      ))}
      <primitive object={bubbles} />
      <pointLight color="#ffc94a" intensity={1.2} distance={r * 3} decay={1.6} position={[x, y + 0.6, z]} castShadow={false} />
    </group>
  );
}
