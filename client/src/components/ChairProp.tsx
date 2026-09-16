import type { ChairSyncState } from "@shared/types";

interface ChairPropProps {
  chair: ChairSyncState;
}

// Never receives pointer events, so a click near/on a chair still reaches the floor beneath
// it for click-to-move.
const noRaycast = () => null;

export function ChairProp({ chair }: ChairPropProps) {
  const occupied = chair.occupiedBy !== "";

  if (chair.propId === "gaming_chair") {
    return <GamingChair occupied={occupied} x={chair.x} z={chair.z} rotationY={chair.rotationY} />;
  }
  if (chair.propId === "log_seat") {
    return <LogSeat occupied={occupied} x={chair.x} z={chair.z} rotationY={chair.rotationY} />;
  }

  return (
    <group position={[chair.x, 0, chair.z]} rotation={[0, chair.rotationY, 0]} raycast={noRaycast}>
      <mesh castShadow receiveShadow position={[0, 0.25, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.6, 0.5, 0.6]} />
        <meshStandardMaterial color={occupied ? "#7a4a2a" : "#a87858"} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.65, -0.28]} raycast={noRaycast}>
        <boxGeometry args={[0.6, 0.5, 0.08]} />
        <meshStandardMaterial color="#7a4a2a" roughness={0.8} />
      </mesh>
    </group>
  );
}

function GamingChair({
  occupied,
  x,
  z,
  rotationY,
}: {
  occupied: boolean;
  x: number;
  z: number;
  rotationY: number;
}) {
  const seatColor = occupied ? "#2a2a30" : "#38383f";
  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]} raycast={noRaycast}>
      {/* base + central column (office chair) */}
      <mesh castShadow position={[0, 0.05, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.28, 0.32, 0.06, 12]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.3, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* seat */}
      <mesh castShadow receiveShadow position={[0, 0.58, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.5, 0.12, 0.5]} />
        <meshStandardMaterial color={seatColor} roughness={0.6} />
      </mesh>
      {/* backrest */}
      <mesh castShadow position={[0, 0.95, -0.24]} rotation={[0.15, 0, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.5, 0.7, 0.1]} />
        <meshStandardMaterial color={seatColor} roughness={0.6} />
      </mesh>
      {/* neon accent strip */}
      <mesh position={[0, 1.05, -0.19]} rotation={[0.15, 0, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.4, 0.05, 0.02]} />
        <meshStandardMaterial color="#7a2ee6" emissive="#7a2ee6" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

function LogSeat({ occupied, x, z, rotationY }: { occupied: boolean; x: number; z: number; rotationY: number }) {
  return (
    <mesh
      castShadow
      receiveShadow
      position={[x, 0.16, z]}
      rotation={[0, rotationY, Math.PI / 2]}
      raycast={noRaycast}
    >
      <cylinderGeometry args={[0.18, 0.18, 0.9, 10]} />
      <meshStandardMaterial color={occupied ? "#3a2717" : "#4a3320"} roughness={0.9} />
    </mesh>
  );
}
