import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, PointLight } from "three";
import type { ToggleableSyncState } from "@shared/types";

interface ToggleablePropProps {
  prop: ToggleableSyncState;
}

// Never receives pointer events, so a click near/on a prop still reaches the floor beneath
// it for click-to-move.
const noRaycast = () => null;

export function ToggleableProp({ prop }: ToggleablePropProps) {
  if (prop.kind === "campfire") {
    return <Campfire prop={prop} />;
  }

  if (prop.kind === "tv") {
    return (
      <group position={[prop.x, 0, prop.z]} raycast={noRaycast}>
        <mesh castShadow position={[0, 1.2, 0]} raycast={noRaycast}>
          <boxGeometry args={[1.6, 1, 0.1]} />
          <meshStandardMaterial color="#111318" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.2, 0.06]} raycast={noRaycast}>
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
    <group position={[prop.x, 0, prop.z]} raycast={noRaycast}>
      <mesh castShadow position={[0, 0.75, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.05, 0.05, 1.5, 8]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      <mesh position={[0, 1.5, 0]} raycast={noRaycast}>
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

const EMBERS = Array.from({ length: 6 }, (_, i) => ({
  angle: (i / 6) * Math.PI * 2,
  radius: 0.05 + (i % 3) * 0.05,
  speed: 0.6 + (i % 4) * 0.15,
  offset: i * 1.3,
}));

function Campfire({ prop }: { prop: ToggleableSyncState }) {
  const lightRef = useRef<PointLight>(null);
  const flameRef = useRef<Group>(null);
  const emberRefs = useRef<(Mesh | null)[]>([]);
  const clockRef = useRef(0);

  useFrame((_, delta) => {
    clockRef.current += delta;
    if (!prop.on) return;

    // gentle flicker: base intensity plus small randomized wobble
    if (lightRef.current) {
      lightRef.current.intensity = 1.6 + Math.sin(clockRef.current * 14) * 0.25 + Math.sin(clockRef.current * 31) * 0.15;
    }
    if (flameRef.current) {
      const s = 1 + Math.sin(clockRef.current * 16) * 0.08;
      flameRef.current.scale.set(s, 1 + Math.sin(clockRef.current * 11) * 0.12, s);
    }
    emberRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const e = EMBERS[i];
      const t = (clockRef.current * e.speed + e.offset) % 2;
      mesh.position.set(Math.cos(e.angle) * e.radius, t * 0.9, Math.sin(e.angle) * e.radius);
      mesh.visible = t < 1.6;
    });
  });

  return (
    <group position={[prop.x, 0, prop.z]} raycast={noRaycast}>
      {prop.on && (
        <group ref={flameRef} position={[0, 0.15, 0]} raycast={noRaycast}>
          <mesh raycast={noRaycast}>
            <coneGeometry args={[0.16, 0.4, 8]} />
            <meshStandardMaterial color="#ffcf5c" emissive={prop.color} emissiveIntensity={2} />
          </mesh>
          <mesh position={[0, 0.15, 0]} raycast={noRaycast}>
            <coneGeometry args={[0.09, 0.25, 8]} />
            <meshStandardMaterial color="#fff3c4" emissive="#fff3c4" emissiveIntensity={2.2} />
          </mesh>
        </group>
      )}
      {prop.on &&
        EMBERS.map((_, i) => (
          <mesh key={i} ref={(m) => (emberRefs.current[i] = m)} raycast={noRaycast}>
            <sphereGeometry args={[0.02, 4, 4]} />
            <meshStandardMaterial color="#ff8a3d" emissive="#ff8a3d" emissiveIntensity={2} />
          </mesh>
        ))}
      {prop.on && (
        <pointLight ref={lightRef} position={[0, 0.5, 0]} intensity={1.6} color={prop.color} distance={6} decay={2} />
      )}
    </group>
  );
}
