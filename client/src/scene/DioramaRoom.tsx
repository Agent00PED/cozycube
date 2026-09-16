import { Suspense } from "react";
import { useGLTF } from "@react-three/drei";
import type { MapId } from "@shared/types";
import { ProceduralRoom } from "./ProceduralRoom";

// Drop a Blender-exported .glb into client/public/models/ (Draco-compressed — see the
// gltf-transform pipeline in the Phase-3 write-up), then register it here. DioramaRoom will
// load it (with the Draco decoder at /draco/, copied per client/public/draco/README.md)
// instead of the procedural placeholder — no other code needs to change.
const MAP_MODEL_URLS: Partial<Record<MapId, string>> = {
  // cozy_lounge: "/models/cozy_lounge.glb",
  // campfire_night: "/models/campfire_night.glb",
};

interface DioramaRoomProps {
  mapId: MapId;
  onFloorClick: (x: number, z: number) => void;
}

export function DioramaRoom({ mapId, onFloorClick }: DioramaRoomProps) {
  const modelUrl = MAP_MODEL_URLS[mapId];

  if (!modelUrl) {
    return <ProceduralRoom mapId={mapId} onFloorClick={onFloorClick} />;
  }

  return (
    <Suspense fallback={<ProceduralRoom mapId={mapId} onFloorClick={onFloorClick} />}>
      <GltfRoomModel url={modelUrl} />
    </Suspense>
  );
}

function GltfRoomModel({ url }: { url: string }) {
  const { scene } = useGLTF(url, "/draco/");
  return <primitive object={scene} />;
}
