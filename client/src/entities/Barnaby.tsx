import { useGLTF } from "@react-three/drei";
import { CAMPFIRE_LAYOUT as L } from "@shared/worlds/campfire";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { matte, GEO, noRaycast } from "../scene/kit";
import { CampNpc } from "./CampNpc";

// The Campfire's two shopkeepers, each a pure loader for their Blender model (CampNpc):
//
//   Barnaby the Angler    the otter at his tackle stall by the dock (barnaby.glb,
//                         scripts/blender/build_barnaby.py): he buys the creel, sells rods and bait
//   Buster the Lumberjack the beaver at his firewood stall by the woodpile (buster.glb,
//                         scripts/blender/build_buster.py): he buys split wood, sells axes
//
// Their stalls are part of their models; where they stand (and their colliders) is CAMPFIRE_LAYOUT.

export const BARNABY_URL = modelUrl("barnaby.glb");
export const BUSTER_URL = modelUrl("buster.glb");

const STAND_IN = matte("#9c7148", 0.85);
/** While a shopkeeper loads (or if they cannot): their stall's crate, plain. */
function Crate({ x }: { x: number }) {
  return <mesh geometry={GEO.box} material={STAND_IN} position={[x, 0.15, 0.05]} scale={[0.48, 0.3, 0.34]} raycast={noRaycast} />;
}

export function Barnaby({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  return <CampNpc url={BARNABY_URL} what="barnaby.glb" prefix="Barnaby" at={L.barnaby} waveEvent="barnabyWave" standIn={<Crate x={0.62} />} subscribeMessages={subscribeMessages} />;
}

export function Buster({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  return <CampNpc url={BUSTER_URL} what="buster.glb" prefix="Buster" at={L.buster} waveEvent="busterWave" standIn={<Crate x={-0.7} />} subscribeMessages={subscribeMessages} />;
}

useGLTF.preload(BARNABY_URL);
useGLTF.preload(BUSTER_URL);
