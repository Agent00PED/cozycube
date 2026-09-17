import type { ThreeEvent } from "@react-three/fiber";
import type { ChairSyncState } from "@shared/types";

interface ChairPropProps {
  chair: ChairSyncState;
  onSeatClick: (chair: ChairSyncState) => void;
}

// Decorative sub-meshes never receive pointer events; only the seat's own hit pad does, so a
// click either sits you down or falls through to the floor for click-to-move.
const noRaycast = () => null;

export function ChairProp({ chair, onSeatClick }: ChairPropProps) {
  const occupied = chair.occupiedBy !== "";

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation(); // don't also register as a floor click behind the seat
    onSeatClick(chair);
  };

  return (
    <group position={[chair.x, 0, chair.z]} rotation={[0, chair.rotationY, 0]}>
      {/* Hit pad — one consistent, generous click target for every seat style, including "pad"
          seats whose visible furniture is drawn by ProceduralRoom.
          It must stay `visible` and be hidden with a fully transparent material instead:
          three.js skips objects with visible === false during raycasting, so an invisible pad
          would silently receive no clicks and every seat click would fall through to the floor. */}
      <mesh position={[0, 0.45, 0]} onPointerDown={handleClick}>
        <boxGeometry args={[0.95, 0.9, 0.95]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {chair.style === "gaming" && <GamingChair occupied={occupied} />}
      {chair.style === "log" && <LogSeat occupied={occupied} />}
    </group>
  );
}

function GamingChair({ occupied }: { occupied: boolean }) {
  const seatColor = occupied ? "#2a2a30" : "#38383f";
  return (
    <group raycast={noRaycast}>
      {/* base + central column (office chair) */}
      <mesh castShadow position={[0, 0.04, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.24, 0.27, 0.05, 12]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.22, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.035, 0.035, 0.36, 8]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* seat — top surface at ~0.42, matching the character's scaled hip height */}
      <mesh castShadow receiveShadow position={[0, 0.37, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.44, 0.1, 0.44]} />
        <meshStandardMaterial color={seatColor} roughness={0.6} />
      </mesh>
      {/* backrest */}
      <mesh castShadow position={[0, 0.7, -0.2]} rotation={[0.15, 0, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.44, 0.58, 0.09]} />
        <meshStandardMaterial color={seatColor} roughness={0.6} />
      </mesh>
      {/* neon accent strip */}
      <mesh position={[0, 0.79, -0.16]} rotation={[0.15, 0, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.34, 0.04, 0.02]} />
        <meshStandardMaterial color="#7a2ee6" emissive="#7a2ee6" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

function LogSeat({ occupied }: { occupied: boolean }) {
  return (
    <mesh castShadow receiveShadow position={[0, 0.19, 0]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
      <cylinderGeometry args={[0.2, 0.2, 1.05, 12]} />
      <meshStandardMaterial color={occupied ? "#3a2717" : "#4a3320"} roughness={0.9} />
    </mesh>
  );
}
