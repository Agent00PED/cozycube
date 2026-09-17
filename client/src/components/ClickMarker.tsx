import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshBasicMaterial } from "three";
import type { MoveTarget } from "../systems/useLocalPlayerMovement";

interface ClickMarkerProps {
  targetRef: React.RefObject<MoveTarget | null>;
  /** Bumped by WorldScene on every click so the ripple can retrigger even on the same spot. */
  rippleRef: React.RefObject<{ x: number; z: number; id: number }>;
}

const RIPPLE_DURATION = 0.35; // seconds
const RIPPLE_MAX_SCALE = 2.6;

// Two pieces of feedback for click-to-move:
//  - a persistent destination ring that pulses while the player is still walking there
//  - a one-shot ripple that fires the instant the click lands, so the tap feels acknowledged
//    immediately rather than only once the character starts moving.
// Both are driven imperatively in useFrame (same pattern as the avatars) so neither needs a
// React re-render to follow the shared refs.
export function ClickMarker({ targetRef, rippleRef }: ClickMarkerProps) {
  const ringRef = useRef<Mesh>(null);
  const pulseRef = useRef(0);

  const rippleMeshRef = useRef<Mesh>(null);
  const rippleAgeRef = useRef(Infinity);
  const lastRippleIdRef = useRef(-1);

  useFrame((_, delta) => {
    const ring = ringRef.current;
    if (ring) {
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
    }

    const ripple = rippleMeshRef.current;
    const trigger = rippleRef.current;
    if (ripple && trigger) {
      if (trigger.id !== lastRippleIdRef.current) {
        lastRippleIdRef.current = trigger.id;
        rippleAgeRef.current = 0;
        ripple.position.set(trigger.x, 0.035, trigger.z);
      }

      rippleAgeRef.current += delta;
      const t = rippleAgeRef.current / RIPPLE_DURATION;
      if (t >= 1) {
        ripple.visible = false;
      } else {
        ripple.visible = true;
        const scale = 0.4 + t * RIPPLE_MAX_SCALE;
        ripple.scale.set(scale, scale, scale);
        (ripple.material as MeshBasicMaterial).opacity = (1 - t) * 0.7;
      }
    }
  });

  return (
    <>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
        <ringGeometry args={[0.25, 0.35, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} />
      </mesh>

      <mesh ref={rippleMeshRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
        <ringGeometry args={[0.3, 0.42, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} />
      </mesh>
    </>
  );
}
