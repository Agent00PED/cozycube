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

// Decorative meshes never receive pointer events, so click-to-move always reaches the floor
// underneath/behind them regardless of how much furniture is scattered around the room.
const noRaycast = () => null;

interface ProceduralRoomProps {
  mapId: MapId;
  onFloorClick: (x: number, z: number) => void;
}

// Placeholder geometry for the diorama room shell — a chamfered-corner floor, swapped per
// theme between an enclosed indoor shell (walls) and an open-air clearing (tree/rock ring).
// Swap either out for a real Blender .glb by registering a MAP_MODEL_URLS entry in DioramaRoom.tsx.
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
        <meshStandardMaterial color={theme.floor} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>

      {mapId === "cozy_lounge" ? <CozyLoungeShell wallColor={theme.wall} /> : <CampfireClearingBoundary />}
      {mapId === "cozy_lounge" ? <CozyLoungeFurniture /> : <CampfireFurniture />}
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
    <mesh
      position={[midX, height / 2, midZ]}
      rotation={[0, angle, 0]}
      receiveShadow
      castShadow
      raycast={noRaycast}
    >
      <planeGeometry args={[length, height]} />
      <meshStandardMaterial color={color} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CozyLoungeShell({ wallColor }: { wallColor: string }) {
  return (
    <>
      <WallSegment from={CORNER_A} to={CORNER_B} color={wallColor} />
      <WallSegment from={CORNER_B} to={CORNER_C} color={wallColor} />
      <WallSegment from={CORNER_C} to={CORNER_D} color={wallColor} />
      {/* window on the straight back wall, warm daylight glow */}
      <mesh position={[2.2, 1.9, -4.97]} raycast={noRaycast}>
        <planeGeometry args={[1.4, 1.1]} />
        <meshStandardMaterial color="#fff6d9" emissive="#fff1c2" emissiveIntensity={0.6} />
      </mesh>
    </>
  );
}

// No walls outdoors — a loose ring of pine trees and rocks marks the edge of the clearing.
function CampfireClearingBoundary() {
  const perimeterPoints = useMemo(() => {
    const points: { x: number; z: number; scale: number; kind: "tree" | "rock" }[] = [];
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 4.4 + (i % 2) * 0.3;
      points.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        scale: 0.8 + ((i * 37) % 5) * 0.08,
        kind: i % 3 === 0 ? "rock" : "tree",
      });
    }
    return points;
  }, []);

  return (
    <>
      {perimeterPoints.map((p, i) =>
        p.kind === "tree" ? (
          <PineTree key={i} x={p.x} z={p.z} scale={p.scale} />
        ) : (
          <Rock key={i} x={p.x} z={p.z} scale={p.scale} />
        )
      )}
    </>
  );
}

function PineTree({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0, z]} scale={scale} raycast={noRaycast}>
      <mesh castShadow position={[0, 0.4, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.1, 0.14, 0.8, 8]} />
        <meshStandardMaterial color="#4a3524" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 1.2, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.55, 1.1, 8]} />
        <meshStandardMaterial color="#1f4a34" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 1.75, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.4, 0.9, 8]} />
        <meshStandardMaterial color="#255c40" roughness={0.85} />
      </mesh>
    </group>
  );
}

function Rock({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <mesh castShadow receiveShadow position={[x, 0.18 * scale, z]} scale={scale} raycast={noRaycast}>
      <sphereGeometry args={[0.3, 8, 6]} />
      <meshStandardMaterial color="#5a5a5a" roughness={1} flatShading />
    </mesh>
  );
}

function CozyLoungeFurniture() {
  return (
    <>
      {/* --- Living zone (back-left): sofa, coffee table, rug --- */}
      <group position={[-3, 0, -3.9]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.35, 0]} raycast={noRaycast}>
          <boxGeometry args={[3, 0.5, 1.1]} />
          <meshStandardMaterial color="#c17a4d" roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0, 0.75, -0.45]} raycast={noRaycast}>
          <boxGeometry args={[3, 0.6, 0.2]} />
          <meshStandardMaterial color="#a8632f" roughness={0.85} />
        </mesh>
        {[-1, 0, 1].map((cx) => (
          <mesh key={cx} castShadow position={[cx * 0.85, 0.68, -0.15]} raycast={noRaycast}>
            <sphereGeometry args={[0.22, 10, 8]} />
            <meshStandardMaterial color="#e8b568" roughness={0.9} />
          </mesh>
        ))}
      </group>

      <mesh position={[-3, 0.02, -2.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRaycast}>
        <circleGeometry args={[1.4, 24]} />
        <meshStandardMaterial color="#f2e2c4" roughness={0.95} />
      </mesh>

      <group position={[-3, 0, -2.1]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.32, 0]} raycast={noRaycast}>
          <boxGeometry args={[1.4, 0.08, 0.8]} />
          <meshStandardMaterial color="#8a5a3a" roughness={0.7} />
        </mesh>
        {[
          [-0.6, -0.35],
          [0.6, -0.35],
          [-0.6, 0.35],
          [0.6, 0.35],
        ].map(([lx, lz], i) => (
          <mesh key={i} castShadow position={[lx, 0.14, lz]} raycast={noRaycast}>
            <cylinderGeometry args={[0.04, 0.04, 0.28, 6]} />
            <meshStandardMaterial color="#5a3a24" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* floor lamp */}
      <group position={[4.6, 0, 1.7]} raycast={noRaycast}>
        <mesh castShadow position={[0, 0.75, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.04, 0.04, 1.5, 8]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <mesh position={[0, 1.55, 0]} raycast={noRaycast}>
          <coneGeometry args={[0.26, 0.35, 12, 1, true]} />
          <meshStandardMaterial
            color="#fff3d6"
            emissive="#ffdb8a"
            emissiveIntensity={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
        <pointLight position={[0, 1.5, 0]} intensity={1} color="#ffdb8a" distance={4} decay={2} />
      </group>

      {/* monstera plant */}
      <group position={[-4.5, 0, 3.8]} raycast={noRaycast}>
        <mesh castShadow position={[0, 0.25, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.28, 0.22, 0.5, 12]} />
          <meshStandardMaterial color="#8a5a3a" roughness={0.8} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            castShadow
            position={[Math.sin(i) * 0.15, 0.9 + i * 0.15, Math.cos(i) * 0.15]}
            rotation={[0.3, i, 0.2]}
            scale={[0.5, 0.7, 0.15]}
            raycast={noRaycast}
          >
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshStandardMaterial color="#2f6b3f" roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* --- Battlestation zone (back-right): desk, monitors, PC --- */}
      <group position={[3.2, 0, -3.9]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.45, 0]} raycast={noRaycast}>
          <boxGeometry args={[2.4, 0.08, 0.9]} />
          <meshStandardMaterial color="#2b2b30" roughness={0.5} />
        </mesh>
        {[-1.1, 1.1].map((lx) => (
          <mesh key={lx} castShadow position={[lx, 0.22, 0.3]} raycast={noRaycast}>
            <boxGeometry args={[0.08, 0.44, 0.08]} />
            <meshStandardMaterial color="#1a1a1e" roughness={0.5} />
          </mesh>
        ))}
        {[-0.5, 0.5].map((mx) => (
          <mesh key={mx} castShadow position={[mx, 0.75, -0.25]} raycast={noRaycast}>
            <boxGeometry args={[0.6, 0.36, 0.04]} />
            <meshStandardMaterial color="#0d0d10" emissive="#3a6ea8" emissiveIntensity={0.4} />
          </mesh>
        ))}
        <mesh castShadow position={[1, 0.28, -0.3]} raycast={noRaycast}>
          <boxGeometry args={[0.35, 0.55, 0.5]} />
          <meshStandardMaterial color="#111114" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[1, 0.28, -0.06]} raycast={noRaycast}>
          <boxGeometry args={[0.02, 0.5, 0.02]} />
          <meshStandardMaterial color="#7a2ee6" emissive="#7a2ee6" emissiveIntensity={1.5} />
        </mesh>
      </group>
    </>
  );
}

function CampfireFurniture() {
  const decorativeLogs = useMemo(() => {
    const positions: { x: number; z: number; angle: number }[] = [];
    const seatOccupiedAngle = Math.PI / 2; // matches log_seat chair at (0, 1.6) — south side
    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      if (Math.abs(angle - seatOccupiedAngle) < 0.4) continue; // leave room for the interactive seat
      positions.push({ x: Math.cos(angle) * 1.7, z: Math.sin(angle) * 1.7, angle });
    }
    return positions;
  }, []);

  return (
    <>
      {/* fire pit: ring of stones + crossed logs (the flame/glow itself is the "campfire" ToggleableProp) */}
      <group position={[0, 0, 0]} raycast={noRaycast}>
        {Array.from({ length: 10 }).map((_, i) => {
          const angle = (i / 10) * Math.PI * 2;
          return (
            <mesh
              key={i}
              castShadow
              position={[Math.cos(angle) * 0.55, 0.08, Math.sin(angle) * 0.55]}
              scale={0.7}
              raycast={noRaycast}
            >
              <sphereGeometry args={[0.14, 6, 6]} />
              <meshStandardMaterial color="#6b6b6b" roughness={1} flatShading />
            </mesh>
          );
        })}
        <mesh castShadow position={[0, 0.1, 0]} rotation={[0, 0.5, Math.PI / 2.5]} raycast={noRaycast}>
          <cylinderGeometry args={[0.05, 0.06, 0.7, 6]} />
          <meshStandardMaterial color="#3a2a1a" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 0.1, 0]} rotation={[0, -0.5, Math.PI / 2.5]} raycast={noRaycast}>
          <cylinderGeometry args={[0.05, 0.06, 0.7, 6]} />
          <meshStandardMaterial color="#3a2a1a" roughness={0.9} />
        </mesh>
      </group>

      {/* decorative log benches around the fire (the interactive log_seat renders via ChairProp) */}
      {decorativeLogs.map((log, i) => (
        <mesh
          key={i}
          castShadow
          receiveShadow
          position={[log.x, 0.16, log.z]}
          rotation={[0, log.angle, Math.PI / 2]}
          raycast={noRaycast}
        >
          <cylinderGeometry args={[0.16, 0.16, 0.8, 10]} />
          <meshStandardMaterial color="#4a3320" roughness={0.9} />
        </mesh>
      ))}

      {/* two tents */}
      <Tent x={-3.1} z={-3.5} color="#d97a4a" />
      <Tent x={3.1} z={-3.5} color="#4a8ad9" />
    </>
  );
}

function Tent({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]} raycast={noRaycast}>
      <mesh castShadow receiveShadow position={[0, 0.55, 0]} rotation={[0, Math.PI / 4, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.95, 1.1, 4]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.35, 0.68]} raycast={noRaycast}>
        <planeGeometry args={[0.45, 0.6]} />
        <meshStandardMaterial color="#1a1410" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
