import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { MoveTarget } from "../systems/useLocalPlayerMovement";

interface ClickMarkerProps {
  targetRef: React.RefObject<MoveTarget | null>;
}

// Visual feedback for click-to-move: a flat ring at the clicked floor position, gently
// pulsing, visible for as long as targetRef.current is set (cleared by useLocalPlayerMovement
// on arrival). Position/visibility are driven imperatively via useFrame — same pattern as the
// character avatars — so this never needs a React re-render to track the shared ref.
export function ClickMarker({ targetRef }: ClickMarkerProps) {
  const ringRef = useRef<Mesh>(null);
  const pulseRef = useRef(0);

  useFrame((_, delta) => {
    const ring = ringRef.current;
    if (!ring) return;
    const target = targetRef.current;

    if (target) {
      ring.visible = true;
      ring.position.set(target.x, 0.03, target.z);
      pulseRef.current += delta;
      const scale = 1 + Math.sin(pulseRef.current * 6) * 0.15;
      ring.scale.set(scale, scale, scale);
    } else {
      ring.visible = false;
      pulseRef.current = 0;
    }
  });

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.25, 0.35, 32]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}
