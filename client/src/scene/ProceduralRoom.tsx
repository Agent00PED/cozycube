import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { MapId } from "@shared/types";
import { ROOM_THEMES } from "./roomThemes";

const HALF = 5; // room spans -5..5 on both X and Z
const CHAMFER = 1.5; // corner cut size, on the two back corners
const WALL_HEIGHT = 3;

// The four points that trace the back edge of the chamfered floor, left to right:
// leftWall corner -> backLeft chamfer -> backRight chamfer -> rightWall corner.
const CORNER_A: [number, number] = [-HALF, -HALF + CHAMFER];
const CORNER_B: [number, number] = [-HALF + CHAMFER, -HALF];
const CORNER_C: [number, number] = [HALF - CHAMFER, -HALF];
const CORNER_D: [number, number] = [HALF, -HALF + CHAMFER];

interface ProceduralRoomProps {
  mapId: MapId;
  onFloorClick: (x: number, z: number) => void;
}

// Placeholder geometry for the diorama room shell — a chamfered-corner floor with two angled
// back-corner walls plus one straight back wall, in the "isometric dollhouse" style. Swap this
// out for a real Blender .glb by registering a MAP_MODEL_URLS entry in DioramaRoom.tsx.
export function ProceduralRoom({ mapId, onFloorClick }: ProceduralRoomProps) {
  const theme = ROOM_THEMES[mapId];

  const floorGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(...CORNER_A);
    shape.lineTo(...CORNER_B);
    shape.lineTo(...CORNER_C);
    shape.lineTo(...CORNER_D);
    shape.lineTo(HALF, HALF);
    shape.lineTo(-HALF, HALF);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  const handleFloorClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };

  return (
    <group>
      <mesh
        geometry={floorGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onPointerDown={handleFloorClick}
      >
        <meshStandardMaterial color={theme.floor} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* TEMP: disabled while isolating the keyboard-movement bug — floor only. */}
      {/* <WallSegment from={CORNER_A} to={CORNER_B} color={theme.wall} />
      <WallSegment from={CORNER_B} to={CORNER_C} color={theme.wall} />
      <WallSegment from={CORNER_C} to={CORNER_D} color={theme.wall} />

      <ThemeFurniture mapId={mapId} /> */}
    </group>
  );
}

function WallSegment({
  from,
  to,
  color,
  height = WALL_HEIGHT,
}: {
  from: [number, number];
  to: [number, number];
  color: string;
  height?: number;
}) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const midX = (from[0] + to[0]) / 2;
  const midZ = (from[1] + to[1]) / 2;
  const angle = Math.atan2(dx, dz);

  return (
    <mesh position={[midX, height / 2, midZ]} rotation={[0, angle, 0]} receiveShadow castShadow>
      <planeGeometry args={[length, height]} />
      <meshStandardMaterial color={color} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Purely decorative furniture silhouettes — distinct from the interactive chairs/toggleables,
// which render themselves via ChairProp/ToggleableProp using live server state.
function ThemeFurniture({ mapId }: { mapId: MapId }) {
  switch (mapId) {
    case "cozy_bedroom":
      return (
        <>
          {/* bed */}
          <mesh castShadow receiveShadow position={[0, 0.3, -3.5]}>
            <boxGeometry args={[3, 0.6, 1.6]} />
            <meshStandardMaterial color="#8a6a4a" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, 0.7, -4.15]}>
            <boxGeometry args={[3, 0.8, 0.15]} />
            <meshStandardMaterial color="#6a4a32" roughness={0.8} />
          </mesh>
          {/* side table */}
          <mesh castShadow receiveShadow position={[3.6, 0.4, 1.6]}>
            <boxGeometry args={[1.2, 0.8, 1.2]} />
            <meshStandardMaterial color="#6a4a32" roughness={0.8} />
          </mesh>
        </>
      );
    case "cyber_lounge":
      return (
        <>
          {/* center pillar */}
          <mesh castShadow receiveShadow position={[0, 1, 0]}>
            <boxGeometry args={[0.7, 2, 0.7]} />
            <meshStandardMaterial color="#1a1a2e" roughness={0.4} metalness={0.4} />
          </mesh>
          {/* tv stand */}
          <mesh castShadow receiveShadow position={[0, 0.35, -3.55]}>
            <boxGeometry args={[1.8, 0.7, 0.5]} />
            <meshStandardMaterial color="#0d0d18" roughness={0.5} metalness={0.3} />
          </mesh>
        </>
      );
    case "chill_lounge":
      return (
        <>
          {/* bar counter */}
          <mesh castShadow receiveShadow position={[-3, 0.6, 0]}>
            <boxGeometry args={[1.6, 1.2, 3.6]} />
            <meshStandardMaterial color="#3a2438" roughness={0.6} />
          </mesh>
        </>
      );
    default:
      return null;
  }
}
