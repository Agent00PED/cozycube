import { memo, useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { MapId } from "@shared/types";
import { ROOM_THEMES, type RoomTheme } from "./roomThemes";
import { GEO, Instanced, noRaycast, seeded, useSharedMaterials, type InstanceSpec, type Materials } from "./kit";
import { HALF, LoungeWorld } from "./LoungeWorld";
import { CampfireWorld } from "./CampfireWorld";

const SLAB_HEIGHT = 1.45; // a chunky island — the diorama base reads as a model on a table

interface ProceduralRoomProps {
  mapId: MapId;
  onFloorClick: (x: number, z: number) => void;
}

// The diorama: a floating slab, the clickable floor on top, and the map's world.
//
// memo matters here more than anywhere else in the app. WorldScene re-renders on every player
// state patch (roughly 20 per second per moving player), and without memo React would
// re-reconcile the entire furnished 28x28 world each time. onFloorClick must therefore be a
// stable callback (it is — see WorldScene).
export const ProceduralRoom = memo(function ProceduralRoom({ mapId, onFloorClick }: ProceduralRoomProps) {
  const theme = ROOM_THEMES[mapId];
  const mats = useSharedMaterials();

  const floorMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.9 }),
    [theme.floor]
  );
  useEffect(() => () => floorMaterial.dispose(), [floorMaterial]);

  const handleFloorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 2) return; // right-drag is camera panning, not a walk order
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };

  return (
    <group>
      {/* The floor is its own thin single-sided plane rather than the top face of the slab box:
          it is the ONLY click target for walking, and a box would also return hits on its sides
          and underside, which would send the character to nonsensical places. */}
      <mesh
        geometry={GEO.plane}
        material={floorMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[HALF * 2, HALF * 2, 1]}
        receiveShadow
        onPointerDown={handleFloorClick}
      />

      <DioramaSlab theme={theme} mats={mats} outdoor={mapId === "campfire_night"} />

      {mapId === "cozy_lounge" ? <LoungeWorld mats={mats} wallColor={theme.wall} /> : <CampfireWorld mats={mats} />}
    </group>
  );
});

function DioramaSlab({ theme, mats, outdoor }: { theme: RoomTheme; mats: Materials; outdoor: boolean }) {
  const edgeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.95 }), [theme.edge]);
  const edgeTopMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: theme.edgeTop, roughness: 1 }), [theme.edgeTop]);
  useEffect(
    () => () => {
      edgeMaterial.dispose();
      edgeTopMaterial.dispose();
    },
    [edgeMaterial, edgeTopMaterial]
  );

  // Stones embedded in the cut face of the earth, so the outdoor edge reads as a soil
  // cross-section rather than a painted box. Indoors, a second walnut trim band instead.
  const pebbles = useMemo<InstanceSpec[]>(() => {
    if (!outdoor) return [];
    const rand = seeded(5);
    const out: InstanceSpec[] = [];
    const edge = HALF - 0.02;
    for (let i = 0; i < 90; i++) {
      const side = i % 4;
      const f = (rand() * 2 - 1) * (HALF - 0.3);
      const y = -0.25 - rand() * (SLAB_HEIGHT - 0.4);
      const p: [number, number, number] =
        side === 0 ? [f, y, edge] : side === 1 ? [edge, y, f] : side === 2 ? [f, y, -edge] : [-edge, y, f];
      const s = 0.14 + rand() * 0.22;
      out.push({ p, s: [s, s * 0.75, s], r: [rand(), rand(), rand()] });
    }
    return out;
  }, [outdoor]);

  return (
    <group raycast={noRaycast}>
      {/* main block, tucked a hair below y=0 so it never z-fights with the floor plane */}
      <mesh
        geometry={GEO.box}
        material={edgeMaterial}
        position={[0, -SLAB_HEIGHT / 2 - 0.005, 0]}
        scale={[HALF * 2, SLAB_HEIGHT, HALF * 2]}
        castShadow
        receiveShadow
        raycast={noRaycast}
      />
      {/* top band: topsoil outdoors, a lighter wood lip indoors — slightly proud of the block */}
      <mesh
        geometry={GEO.box}
        material={edgeTopMaterial}
        position={[0, -0.09, 0]}
        scale={[HALF * 2 + 0.03, 0.16, HALF * 2 + 0.03]}
        raycast={noRaycast}
      />
      {!outdoor && (
        <mesh
          geometry={GEO.box}
          material={edgeTopMaterial}
          position={[0, -SLAB_HEIGHT + 0.12, 0]}
          scale={[HALF * 2 + 0.03, 0.1, HALF * 2 + 0.03]}
          raycast={noRaycast}
        />
      )}
      <Instanced geo={GEO.sphereLow} m={mats.stone} items={pebbles} />
    </group>
  );
}
