import { memo, useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { BLUFF, BOXING_RING, LOUNGE_PIT, MAP_HALF, ONSEN_POOL, VIP_PLATFORM, type MapId } from "@shared/types";
import { SHORELINE_Z } from "@shared/collision";
import { ROOM_THEMES, type RoomTheme } from "./roomThemes";
import { GEO, HALF, StaticBatch, noRaycast, useSharedMaterials, type Materials } from "./kit";
import { LoungeWorld } from "./LoungeWorld";
import { CampfireWorld } from "./CampfireWorld";
import { BASIN_Y, BeachWorld } from "./BeachWorld";
import { CasinoWorld } from "./CasinoWorld";
import { BoxingWorld } from "./BoxingWorld";
import { OnsenWorld } from "./OnsenWorld";
import { ArcadeWorld } from "./ArcadeWorld";

/** Worlds with walls and a ceiling: the sun comes from the open corner and the slab gets a wood lip. */
export const INDOOR_MAPS: ReadonlySet<MapId> = new Set<MapId>(["cozy_lounge", "velvet_casino", "boxing_ring", "retro_arcade"]);

const SLAB_HEIGHT = 1.3; // a chunky island — the diorama base reads as a model on a table

// The hidden click target over the beach's water. Walking there is refused by collision, but
// the pier runs over it, and without a target the pier would be unclickable.
const CLICK_CATCHER = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, visible: false });

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
  const half = MAP_HALF[mapId];

  const floorMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.9 }),
    [theme.floor]
  );
  useEffect(() => () => floorMaterial.dispose(), [floorMaterial]);

  // The lounge floor has the conversation pit cut out of it, so the pit floor (a step down)
  // can be its own click target instead of a hole clicks fall through.
  const loungeFloor = useMemo(() => {
    if (mapId !== "cozy_lounge") return null;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -half);
    shape.lineTo(half, -half);
    shape.lineTo(half, half);
    shape.lineTo(-half, half);
    shape.closePath();
    // ShapeGeometry lies in XY; rotated -90deg about X a shape point (x, y) lands at world (x, -y)
    const p = LOUNGE_PIT;
    const hole = new THREE.Path();
    hole.moveTo(p.x0, -p.z1);
    hole.lineTo(p.x1, -p.z1);
    hole.lineTo(p.x1, -p.z0);
    hole.lineTo(p.x0, -p.z0);
    hole.closePath();
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape);
  }, [mapId, half]);
  useEffect(() => () => loungeFloor?.dispose(), [loungeFloor]);

  const handleFloorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 2) return; // right-drag is camera panning, not a walk order
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };

  // On the beach the visible floor stops at the shoreline — past it the slab is moulded into a
  // basin that the sea sits in — so the walkable floor is split into a sand plane and an
  // invisible catcher over the water.
  const sandDepth = isBeach ? SHORELINE_Z + half : half * 2;
  const sandCenter = isBeach ? (SHORELINE_Z - half) / 2 : 0;

  return (
    <group>
      {/* The floor is its own thin single-sided plane rather than the top face of the slab box:
          it is the ONLY click target for walking, and a box would also return hits on its sides
          and underside, which would send the character to nonsensical places. */}
      {loungeFloor ? (
        <mesh geometry={loungeFloor} material={floorMaterial} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onPointerDown={handleFloorClick} />
      ) : (
        <mesh
          geometry={GEO.plane}
          material={floorMaterial}
          position={[0, 0, sandCenter]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[half * 2, sandDepth, 1]}
          receiveShadow
          onPointerDown={handleFloorClick}
        />
      )}
      {/* Walk surfaces that are not at y = 0 get their own click targets at their real height,
          so a tap lands where it looks like it lands (walkY in shared/collision.ts). */}
      {mapId === "cozy_lounge" && (
        <mesh
          geometry={GEO.plane}
          material={floorMaterial}
          position={[(LOUNGE_PIT.x0 + LOUNGE_PIT.x1) / 2, -LOUNGE_PIT.depth, (LOUNGE_PIT.z0 + LOUNGE_PIT.z1) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[LOUNGE_PIT.x1 - LOUNGE_PIT.x0, LOUNGE_PIT.z1 - LOUNGE_PIT.z0, 1]}
          receiveShadow
          onPointerDown={handleFloorClick}
        />
      )}
      {mapId === "velvet_casino" && (
        <mesh
          geometry={GEO.plane}
          material={CLICK_CATCHER}
          position={[(VIP_PLATFORM.x0 + VIP_PLATFORM.x1) / 2, VIP_PLATFORM.height + 0.005, (VIP_PLATFORM.z0 + VIP_PLATFORM.z1) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[VIP_PLATFORM.x1 - VIP_PLATFORM.x0, VIP_PLATFORM.z1 - VIP_PLATFORM.z0, 1]}
          onPointerDown={handleFloorClick}
        />
      )}
      {mapId === "campfire_night" && (
        <mesh
          geometry={GEO.circle}
          material={CLICK_CATCHER}
          position={[BLUFF.x, BLUFF.height + 0.01, BLUFF.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[(BLUFF.radius - 0.2) * 2, (BLUFF.radius - 0.2) * 2, 1]}
          onPointerDown={handleFloorClick}
        />
      )}
      {mapId === "boxing_ring" && (
        <mesh
          geometry={GEO.plane}
          material={CLICK_CATCHER}
          position={[BOXING_RING.x, BOXING_RING.height + 0.02, BOXING_RING.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[BOXING_RING.half * 2 + 0.5, BOXING_RING.half * 2 + 0.5, 1]}
          onPointerDown={handleFloorClick}
        />
      )}
      {mapId === "japanese_onsen" && (
        <mesh
          geometry={GEO.plane}
          material={CLICK_CATCHER}
          position={[(ONSEN_POOL.x0 + ONSEN_POOL.x1) / 2, -ONSEN_POOL.depth + 0.01, (ONSEN_POOL.z0 + ONSEN_POOL.z1) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[ONSEN_POOL.x1 - ONSEN_POOL.x0, ONSEN_POOL.z1 - ONSEN_POOL.z0, 1]}
          onPointerDown={handleFloorClick}
        />
      )}
      {isBeach && (
        <mesh
          geometry={GEO.plane}
          material={CLICK_CATCHER}
          position={[0, 0, (SHORELINE_Z + half) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[half * 2, half - SHORELINE_Z, 1]}
          onPointerDown={handleFloorClick}
        />
      )}

      <DioramaSlab theme={theme} mats={mats} mapId={mapId} half={half} />

      {/* Everything inside a world is static after mount, so it is baked down to a handful of
          merged draw calls. Animated pieces opt out with userData={noMerge}. */}
      <StaticBatch>
        {mapId === "cozy_lounge" && <LoungeWorld mats={mats} wallColor={theme.wall} />}
        {mapId === "campfire_night" && <CampfireWorld mats={mats} />}
        {isBeach && <BeachWorld mats={mats} />}
        {mapId === "velvet_casino" && <CasinoWorld mats={mats} wallColor={theme.wall} />}
        {mapId === "boxing_ring" && <BoxingWorld mats={mats} wallColor={theme.wall} />}
        {mapId === "japanese_onsen" && <OnsenWorld mats={mats} />}
        {mapId === "retro_arcade" && <ArcadeWorld mats={mats} />}
      </StaticBatch>
    </group>
  );
});

// A solid 20x20 cube with clean edges. Nothing is scattered along the cut face any more: the
// pebbles that used to be embedded there stuck out past the sides and gave the island a
// serrated, chewed-looking rim.
function DioramaSlab({ theme, mats, mapId, half }: { theme: RoomTheme; mats: Materials; mapId: MapId; half: number }) {
  const HALF = half; // the slab spans -half..half on both axes
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
  const indoor = INDOOR_MAPS.has(mapId);

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
