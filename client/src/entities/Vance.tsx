import { useGLTF } from "@react-three/drei";
import { CASINO_LAYOUT as L, CASINO_NPCS } from "@shared/worlds/casino";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "../scene/kit";
import { CampNpc } from "./CampNpc";

// Mr. Vance, the Velvet Casino's fox cashier: a pure loader for his Blender model (vance.glb,
// scripts/blender/build_vance.py) through CampNpc. He stands at the Golden Cage's teller window on
// the platform behind its counter (CASINO_LAYOUT.cage.floor), his paws on the counter; he looks up
// at whoever comes to the window and waves when they open the cage ("vanceWave").

export const VANCE_URL = modelUrl("vance.glb");

const STAND_IN = matte("#c8612b", 0.85);
/** While he loads (or if he cannot): a plain rust-orange figure at the window. */
function StandIn() {
  return <mesh geometry={GEO.round} material={STAND_IN} position={[0, 0.5, 0]} scale={[0.4, 1.0, 0.36]} raycast={noRaycast} />;
}

export function Vance({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  return <CampNpc url={VANCE_URL} what="vance.glb" prefix="Vance" at={CASINO_NPCS.vance} y={L.cage.floor} waveEvent="vanceWave" standIn={<StandIn />} subscribeMessages={subscribeMessages} />;
}

useGLTF.preload(VANCE_URL);
