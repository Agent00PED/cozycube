import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { modelUrl } from "../../assetVersion";
import { ModelBoundary } from "../../entities/ModelBoundary";

// The landed fish on a turntable: its model from client/public/models/fish.glb (one node per
// species, `Fish_<id>`, nose along +x, about a metre long, every colour a vertex colour), turning
// slowly under a warm key light. A small canvas of its own, alive only while the reveal shows. The
// Cenote's cave fish have fins in a second material, FI_Glow: glTF can't say "glow in your own vertex
// colour", so its emission is patched here to be exactly that, breathing.

export const FISH_URL = modelUrl("fish.glb");

const GLOW_TIME = { value: 0 };
/** A cave fish's fins: the emission its own vertex colour, pulsing softly (once per material). */
function glowingFins(m: THREE.MeshStandardMaterial) {
  if (m.userData.finGlow) return;
  m.userData.finGlow = true;
  m.vertexColors = true;
  m.emissive = new THREE.Color(1, 1, 1);
  m.emissiveIntensity = 1.3;
  m.toneMapped = false;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFinTime = GLOW_TIME;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uFinTime;").replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        totalEmissiveRadiance *= vColor.rgb * (0.75 + 0.25 * sin(uFinTime * 2.4));
      #endif`
    );
  };
  m.customProgramCacheKey = () => "fish-fin-glow";
  m.needsUpdate = true;
}

function FishModel({ species }: { species: string }) {
  const { scene } = useGLTF(FISH_URL);
  const node = useMemo(() => {
    const src = scene.getObjectByName(`Fish_${species}`);
    if (!src) return null;
    // a clone of the one node, centred and scaled to fit the stand (its geometry stays shared)
    const copy = src.clone(true);
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m.name === "FI_Glow") glowingFins(m as THREE.MeshStandardMaterial);
    });
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
    GLOW_TIME.value = state.clock.elapsedTime;
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
