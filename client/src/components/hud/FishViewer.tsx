import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { modelUrl } from "../../assetVersion";
import { ModelBoundary } from "../../entities/ModelBoundary";

// The landed fish on a turntable: its model from client/public/models/fish.glb (one node per
// species, `Fish_<id>`, nose along +x, about a metre long, every colour a vertex colour), turning
// slowly under a warm key light. A small canvas of its own, alive only while the reveal shows.

export const FISH_URL = modelUrl("fish.glb");

function FishModel({ species }: { species: string }) {
  const { scene } = useGLTF(FISH_URL);
  const node = useMemo(() => {
    const src = scene.getObjectByName(`Fish_${species}`);
    if (!src) return null;
    // a clone of the one node, centred and scaled to fit the stand (its geometry stays shared)
    const copy = src.clone(true);
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(copy);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const fit = 1.9 / Math.max(0.001, size.x, size.y * 1.6);
    const group = new THREE.Group();
    copy.position.sub(centre);
    group.add(copy);
    group.scale.setScalar(fit);
    return group;
  }, [scene, species]);
  const spin = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (!spin.current) return;
    spin.current.rotation.y += dt * 0.9;
    spin.current.position.y = Math.sin(state.clock.elapsedTime * 1.6) * 0.04;
    spin.current.rotation.z = Math.sin(state.clock.elapsedTime * 2.1) * 0.05;
  });
  if (!node) return null;
  return (
    <group ref={spin}>
      <primitive object={node} />
    </group>
  );
}

export default function FishViewer({ species, fallback }: { species: string; fallback: string }) {
  const placeholder = <div className="flex h-full items-center justify-center text-6xl">{fallback}</div>;
  return (
    <ModelBoundary what="fish.glb" fallback={placeholder}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0.35, 2.6], fov: 32 }} gl={{ alpha: true, antialias: true }} style={{ background: "transparent" }}>
        <ambientLight intensity={0.9} color="#fff1dc" />
        <directionalLight position={[2, 3, 2]} intensity={1.6} color="#ffd9a6" />
        <directionalLight position={[-2, 1, -1.5]} intensity={0.6} color="#9ecbff" />
        <Suspense fallback={null}>
          <FishModel species={species} />
        </Suspense>
      </Canvas>
    </ModelBoundary>
  );
}
