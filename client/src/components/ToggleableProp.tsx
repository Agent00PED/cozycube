import type { ToggleableSyncState } from "@shared/types";

interface ToggleablePropProps {
  prop: ToggleableSyncState;
}

export function ToggleableProp({ prop }: ToggleablePropProps) {
  if (prop.kind === "tv") {
    return (
      <group position={[prop.x, 0, prop.z]}>
        <mesh castShadow position={[0, 1.2, 0]}>
          <boxGeometry args={[1.6, 1, 0.1]} />
          <meshStandardMaterial color="#111318" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.2, 0.06]}>
          <planeGeometry args={[1.4, 0.8]} />
          <meshStandardMaterial
            color={prop.on ? prop.color : "#050505"}
            emissive={prop.on ? prop.color : "#000000"}
            emissiveIntensity={prop.on ? 1.5 : 0}
          />
        </mesh>
        {prop.on && <pointLight position={[0, 1.2, 0.6]} intensity={1.2} color={prop.color} distance={4} decay={2} />}
      </group>
    );
  }

  // lamp
  return (
    <group position={[prop.x, 0, prop.z]}>
      <mesh castShadow position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.5, 8]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial
          color={prop.on ? prop.color : "#222222"}
          emissive={prop.on ? prop.color : "#000000"}
          emissiveIntensity={prop.on ? 1.8 : 0}
        />
      </mesh>
      {prop.on && <pointLight position={[0, 1.5, 0]} intensity={1.5} color={prop.color} distance={5} decay={2} />}
    </group>
  );
}
