import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { CAMPFIRE_LAYOUT as L } from "@shared/worlds/campfire";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { cameraFocus } from "../scene/cameraFocus";
import { matte, GEO, noRaycast } from "../scene/kit";
import { ModelBoundary } from "./ModelBoundary";

// Barnaby the Angler, at his tackle stall by the Campfire's dock: a pure loader for barnaby.glb
// (scripts/blender/build_barnaby.py). He breathes, sways his tail, turns his head to whoever walks
// up, and waves when someone opens his shop (barnabyWave: everyone sees it). His stall is part of
// the model; where he stands (and his collider) is CAMPFIRE_LAYOUT.barnaby.

export const BARNABY_URL = modelUrl("barnaby.glb");

/** How near the local player comes before he looks their way. */
const NOTICE = 4.5;
const WAVE_S = 1.8;

export function Barnaby({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  return (
    <group position={[L.barnaby.x, 0, L.barnaby.z]} rotation={[0, L.barnaby.yaw, 0]}>
      <ModelBoundary what="barnaby.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <BarnabyModel subscribeMessages={subscribeMessages} />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}

const STAND_IN = matte("#9c7148", 0.85);
/** While he loads (or if he cannot): his crate, plain. */
function StandIn() {
  return <mesh geometry={GEO.box} material={STAND_IN} position={[0.62, 0.15, 0.05]} scale={[0.48, 0.3, 0.34]} raycast={noRaycast} />;
}

function BarnabyModel({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const { scene } = useGLTF(BARNABY_URL);
  const model = useMemo(() => scene.clone(true), [scene]);
  const parts = useMemo(() => {
    const get = (name: string) => model.getObjectByName(name) ?? null;
    model.traverse((o) => {
      o.raycast = noRaycast;
    });
    const armR = get("Barnaby_ArmR");
    return { body: get("Barnaby_Body"), head: get("Barnaby_Head"), armR, tail: get("Barnaby_Tail"), armRest: armR ? armR.rotation.clone() : new THREE.Euler() };
  }, [model]);
  const waveAt = useRef(-99);
  const look = useRef(0);
  useEffect(
    () =>
      subscribeMessages((type) => {
        if (type === "barnabyWave") waveAt.current = performance.now() / 1000;
      }),
    [subscribeMessages]
  );

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const { body, head, armR, tail, armRest } = parts;
    if (body) body.scale.set(1 + 0.01 * Math.sin(t * 2.1), 1 + 0.018 * Math.sin(t * 2.1 + 0.4), 1);
    if (tail) tail.rotation.y = 0.35 * Math.sin(t * 1.7);
    // his head turns to you as you come near (relative to his own facing), and idly looks about
    if (head) {
      const dx = cameraFocus.x - L.barnaby.x;
      const dz = cameraFocus.z - L.barnaby.z;
      const near = Math.hypot(dx, dz) < NOTICE;
      const toward = Math.atan2(dx, dz) - L.barnaby.yaw;
      const wrapped = Math.atan2(Math.sin(toward), Math.cos(toward));
      const want = near ? Math.max(-0.75, Math.min(0.75, wrapped)) : 0.35 * Math.sin(t * 0.4);
      look.current += (want - look.current) * Math.min(1, dt * 3);
      head.rotation.y = look.current;
      head.rotation.z = 0.04 * Math.sin(t * 0.9);
    }
    // a wave: his right arm up and waggling
    if (armR) {
      const w = performance.now() / 1000 - waveAt.current;
      const k = w >= 0 && w < WAVE_S ? Math.sin((Math.PI * w) / WAVE_S) : 0;
      armR.rotation.set(armRest.x - 0.3 * k, armRest.y, armRest.z - 2.3 * k + 0.35 * k * Math.sin(w * 14));
    }
  });

  return <primitive object={model} />;
}

useGLTF.preload(BARNABY_URL);
