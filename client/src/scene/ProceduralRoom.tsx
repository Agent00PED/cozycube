import { memo, useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { MapId } from "@shared/types";
import { SHORELINE_Z } from "@shared/collision";
import { ROOM_THEMES, type RoomTheme } from "./roomThemes";
import { GEO, HALF, StaticBatch, noRaycast, useSharedMaterials, type Materials } from "./kit";
import { LoungeWorld } from "./LoungeWorld";
import { CampfireWorld } from "./CampfireWorld";
import { BASIN_Y, BeachWorld } from "./BeachWorld";
import { CasinoWorld } from "./CasinoWorld";

const SLAB_HEIGHT = 1.3; // a chunky island — the diorama base reads as a model on a table

// The hidden click target over the beach's water. Walking there is refused by collision, but
// the pier runs over it, and without a target the pier would be unclickable.
const CLICK_CATCHER = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

interface ProceduralRoomProps {
  mapId: MapId;
  onFloorClick: (x: number, z: number) => void;
}

// The diorama: a solid slab, the clickable floor on top, and the map's world.
//
// memo matters here more than anywhere else in the app. WorldScene re-renders on every player
// state patch (roughly 20 per second per moving player), and without memo React would
// re-reconcile the entire furnished world each time. onFloorClick must therefore be a stable
// callback (it is — see WorldScene).
export const ProceduralRoom = memo(function ProceduralRoom({ mapId, onFloorClick }: ProceduralRoomProps) {
  const theme = ROOM_THEMES[mapId];
  const mats = useSharedMaterials();
  const isBeach = mapId === "sunset_beach";

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

  // On the beach the visible floor stops at the shoreline — past it the slab is moulded into a
  // basin that the sea sits in — so the walkable floor is split into a sand plane and an
  // invisible catcher over the water.
  const sandDepth = isBeach ? SHORELINE_Z + HALF : HALF * 2;
  const sandCenter = isBeach ? (SHORELINE_Z - HALF) / 2 : 0;

  return (
    <group>
      {/* The floor is its own thin single-sided plane rather than the top face of the slab box:
          it is the ONLY click target for walking, and a box would also return hits on its sides
          and underside, which would send the character to nonsensical places. */}
      <mesh
        geometry={GEO.plane}
        material={floorMaterial}
        position={[0, 0, sandCenter]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[HALF * 2, sandDepth, 1]}
        receiveShadow
        onPointerDown={handleFloorClick}
      />
      {isBeach && (
        <mesh
          geometry={GEO.plane}
          material={CLICK_CATCHER}
          position={[0, 0, (SHORELINE_Z + HALF) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[HALF * 2, HALF - SHORELINE_Z, 1]}
          onPointerDown={handleFloorClick}
        />
      )}

      <DioramaSlab theme={theme} mats={mats} mapId={mapId} />

      {/* Everything inside a world is static after mount, so it is baked down to a handful of
          merged draw calls. Animated pieces opt out with userData={noMerge}. */}
      <StaticBatch>
        {mapId === "cozy_lounge" && <LoungeWorld mats={mats} wallColor={theme.wall} />}
        {mapId === "campfire_night" && <CampfireWorld mats={mats} />}
        {isBeach && <BeachWorld mats={mats} />}
        {mapId === "velvet_casino" && <CasinoWorld mats={mats} wallColor={theme.wall} />}
      </StaticBatch>
    </group>
  );
});

// A solid 20x20 cube with clean edges. Nothing is scattered along the cut face any more: the
// pebbles that used to be embedded there stuck out past the sides and gave the island a
// serrated, chewed-looking rim.
function DioramaSlab({ theme, mats, mapId }: { theme: RoomTheme; mats: Materials; mapId: MapId }) {
  const edgeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.95 }), [theme.edge]);
  const edgeTopMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: theme.edgeTop, roughness: 1 }), [theme.edgeTop]);
  useEffect(
    () => () => {
      edgeMaterial.dispose();
      edgeTopMaterial.dispose();
    },
    [edgeMaterial, edgeTopMaterial]
  );

  const isBeach = mapId === "sunset_beach";
  const indoor = mapId === "cozy_lounge" || mapId === "velvet_casino";

  // The beach slab is built in two blocks so the sea sits in a real recess with solid walls all
  // round it: the sand block runs up to y=0, the sea block stops at BASIN_Y. Underneath, one
  // full-size block keeps the island solid, so there is no hollow to see beneath the pier.
  const seaDepth = HALF - SHORELINE_Z;
  const sandDepth = HALF + SHORELINE_Z;

  return (
    <group raycast={noRaycast}>
      {isBeach ? (
        <>
          {/* the body of the island, below the basin floor */}
          <mesh
            geometry={GEO.box}
            material={edgeMaterial}
            position={[0, BASIN_Y - (SLAB_HEIGHT - Math.abs(BASIN_Y)) / 2, 0]}
            scale={[HALF * 2, SLAB_HEIGHT - Math.abs(BASIN_Y), HALF * 2]}
            castShadow
            receiveShadow
            raycast={noRaycast}
          />
          {/* the sand shelf, which stands BASIN_Y proud of the basin floor */}
          <mesh
            geometry={GEO.box}
            material={edgeMaterial}
            position={[0, BASIN_Y / 2 - 0.003, (SHORELINE_Z - HALF) / 2]}
            scale={[HALF * 2, Math.abs(BASIN_Y), sandDepth]}
            castShadow
            receiveShadow
            raycast={noRaycast}
          />
          {/* the basin floor: wet sand you can see through the water */}
          <mesh
            geometry={GEO.plane}
            material={mats.wetSand}
            position={[0, BASIN_Y + 0.002, SHORELINE_Z + seaDepth / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[HALF * 2, seaDepth, 1]}
            receiveShadow
            raycast={noRaycast}
          />
          {/* the shore wall of the basin, so the sand shelf reads as a cut bank */}
          <mesh
            geometry={GEO.box}
            material={edgeTopMaterial}
            position={[0, BASIN_Y / 2, SHORELINE_Z]}
            scale={[HALF * 2, Math.abs(BASIN_Y), 0.12]}
            raycast={noRaycast}
          />
        </>
      ) : (
        <mesh
          geometry={GEO.box}
          material={edgeMaterial}
          position={[0, -SLAB_HEIGHT / 2 - 0.005, 0]}
          scale={[HALF * 2, SLAB_HEIGHT, HALF * 2]}
          castShadow
          receiveShadow
          raycast={noRaycast}
        />
      )}

      {/* A clean band around the top of the cut — topsoil outdoors, a wood lip indoors. */}
      {!isBeach && (
        <mesh
          geometry={GEO.box}
          material={edgeTopMaterial}
          position={[0, -0.1, 0]}
          scale={[HALF * 2 + 0.02, 0.18, HALF * 2 + 0.02]}
          raycast={noRaycast}
        />
      )}
      {indoor && (
        <mesh
          geometry={GEO.box}
          material={edgeTopMaterial}
          position={[0, -SLAB_HEIGHT + 0.12, 0]}
          scale={[HALF * 2 + 0.02, 0.1, HALF * 2 + 0.02]}
          raycast={noRaycast}
        />
      )}
    </group>
  );
}
