import type { ChairSyncState } from "@shared/types";

interface ChairPropProps {
  chair: ChairSyncState;
}

export function ChairProp({ chair }: ChairPropProps) {
  const occupied = chair.occupiedBy !== "";

  return (
    <group position={[chair.x, 0, chair.z]} rotation={[0, chair.rotationY, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.6, 0.5, 0.6]} />
        <meshStandardMaterial color={occupied ? "#7a4a2a" : "#a87858"} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.65, -0.28]}>
        <boxGeometry args={[0.6, 0.5, 0.08]} />
        <meshStandardMaterial color="#7a4a2a" roughness={0.8} />
      </mesh>
    </group>
  );
}
