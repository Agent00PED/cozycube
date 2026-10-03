import { Suspense, useContext, useMemo } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { daylight } from "@shared/daynight";
import { DECK_Y, SEA_CAPTAIN, SEA_LAYOUT as L, halfBeam, onDeck } from "@shared/worlds/sea";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { CampNpc, type NpcTalk } from "../entities/CampNpc";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "./kit";
import { CampDaylightContext } from "./campDay";
import { seaWater } from "./seaWater";

// The Open Sea (map "open_sea", docs/beach-design.md section 4): the captain's boat at anchor, the
// sea out on every side. One Blender model, sea.glb (scripts/blender/build_sea.py, from
// shared/worlds/sea.ts). The deck never moves; the water does (seaWater: here all of it deep).
//
//   the deck     a click lands on its plane (the boat's own outline), at the deck's height
//   the captain  Brine at the wheel: the way back to the pier
//   the lights   the wheelhouse's lantern and the masthead's come up as the sun goes down

export const SEA_URL = modelUrl("sea.glb");
export const BRINE_URL = modelUrl("brine.glb");

const SEA_TIME = { value: 0 };
const SEA_NIGHT = { value: 0 };
const SEA_DUSK = { value: 0 };
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
/** The deck a click is tested against: the boat's outline, at the deck's height. Never drawn. */
const CLICK_DECK = (() => {
  const B = L.boat;
  const pos: number[] = [];
  const index: number[] = [];
  const steps = 22;
  for (let k = 0; k <= steps; k++) {
    const a = B.stern + ((B.bow - B.stern) * k) / steps;
    for (const side of [-1, 1]) {
      const p = onDeck(a, side * halfBeam(a));
      pos.push(p.x, DECK_Y, p.z);
    }
    if (k > 0) {
      const at = (k - 1) * 2;
      index.push(at, at + 1, at + 2, at + 1, at + 3, at + 2, at, at + 2, at + 1, at + 1, at + 2, at + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
})();

export const BRINE_TALK: NpcTalk = {
  height: 1.7,
  clicked: ["She's a good boat. Mind the rail", "The big ones run deep out here", "Say the word and I'll take you back to the pier", "Bottles come up on the line now and then. Odd things in them"],
  greet: {
    inside: (x, z) => Math.hypot(x - SEA_CAPTAIN.x, z - SEA_CAPTAIN.z) < 3.0,
    lines: ["Welcome aboard", "Fair seas today", "Cast from either rail: there's water enough for everyone"],
  },
};

export function SeaWorld({ onFloorClick, subscribeMessages }: { onFloorClick: (x: number, z: number) => void; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  useFrame((_, dt) => {
    SEA_TIME.value += dt;
    const d = daylight(Date.now());
    SEA_NIGHT.value = 1 - d;
    SEA_DUSK.value = Math.max(0, 1 - Math.abs(d - 0.45) / 0.4);
  });
  return (
    <group>
      <mesh geometry={CLICK_DECK} material={CLICK_MAT} onPointerDown={floorClick} />
      <ModelBoundary what="sea.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <SeaModel />
        </Suspense>
      </ModelBoundary>
      <CampNpc url={BRINE_URL} what="brine.glb" prefix="Brine" at={SEA_CAPTAIN} y={DECK_Y} waveEvent="brineWave" standIn={<BrineStandIn />} subscribeMessages={subscribeMessages} talk={BRINE_TALK} />
      <SeaLights />
    </group>
  );
}

const STAND_IN_SEA = matte("#1f6ea0", 0.4);
const STAND_IN_DECK = matte("#c79a66", 0.85);
function StandIn() {
  return (
    <group>
      <mesh geometry={GEO.plane} material={STAND_IN_SEA} rotation={[-Math.PI / 2, 0, 0]} scale={[140, 140, 1]} raycast={noRaycast} />
      <mesh geometry={CLICK_DECK} material={STAND_IN_DECK} raycast={noRaycast} />
    </group>
  );
}
const BRINE_STAND_IN = matte("#27405f", 0.85);
export function BrineStandIn() {
  return <mesh geometry={GEO.box} material={BRINE_STAND_IN} position={[0, 0.65, 0]} scale={[0.8, 1.3, 0.7]} raycast={noRaycast} />;
}

function SeaModel() {
  const { scene } = useGLTF(SEA_URL);
  useMemo(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      if (o.name === "Sea_Water") o.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.emissive && m.emissive.getHex() !== 0) m.toneMapped = false;
        if (m.name === "BC_Sea" && !m.userData.flowing) {
          m.userData.flowing = true;
          seaWater(m, SEA_TIME, SEA_NIGHT, SEA_DUSK);
        }
      }
    });
  }, [scene]);
  return <primitive object={scene} />;
}

function SeaLights() {
  const d = useContext(CampDaylightContext) ?? 1;
  const dark = 1 - d;
  const house = onDeck(L.wheelhouse.a1 + 0.1, 0);
  const mast = onDeck(L.mast.a, L.mast.b);
  return (
    <>
      <pointLight position={[house.x, DECK_Y + 2.1, house.z]} color="#ffe2a6" intensity={dark * 2.6} distance={8} decay={1.6} />
      <pointLight position={[mast.x, DECK_Y + 3.6, mast.z]} color="#ffd9a0" intensity={dark * 2.2} distance={10} decay={1.6} />
    </>
  );
}
