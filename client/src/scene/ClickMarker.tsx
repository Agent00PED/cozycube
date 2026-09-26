import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshBasicMaterial } from "three";
import type { MapId } from "@shared/types";
import { walkY } from "@shared/collision";
import type { MoveTarget } from "../systems/useLocalPlayerMovement";

interface ClickMarkerProps {
  /** The world: the rings lie on its floor (the casino's stages and steps too). */
  mapId: MapId;
  targetRef: React.RefObject<MoveTarget | null>;
  /** Bumped by the scene on every click so the ripple can retrigger even on the same spot. */
  rippleRef: React.RefObject<{ x: number; z: number; id: number }>;
}

const RIPPLE_DURATION = 0.35;
const RIPPLE_MAX_SCALE = 2.6;

// Two pieces of feedback for click-to-move: a destination ring that pulses while you walk there,
// and a ripple that fires the instant the click lands, so the tap is acknowledged immediately.
// Both are driven imperatively in useFrame, so neither needs a React re-render.
export function ClickMarker({ mapId, targetRef, rippleRef }: ClickMarkerProps) {
  const ringRef = useRef<Mesh>(null);
  const pulse = useRef(0);
  const rippleMesh = useRef<Mesh>(null);
  const rippleAge = useRef(Infinity);
  const lastRippleId = useRef(-1);

  useFrame((_, delta) => {
    const ring = ringRef.current;
    if (ring) {
      const target = targetRef.current;
      if (target) {
        ring.visible = true;
        ring.position.set(target.x, walkY(mapId, target.x, target.z) + 0.06, target.z);
        pulse.current += delta;
        const k = 1 + Math.sin(pulse.current * 6) * 0.15;
        ring.scale.set(k, k, k);
      } else {
        ring.visible = false;
        pulse.current = 0;
      }
    }
    const ripple = rippleMesh.current;
    const trigger = rippleRef.current;
    if (ripple && trigger) {
      if (trigger.id !== lastRippleId.current) {
        lastRippleId.current = trigger.id;
        rippleAge.current = 0;
        ripple.position.set(trigger.x, walkY(mapId, trigger.x, trigger.z) + 0.065, trigger.z);
      }
      rippleAge.current += delta;
      const t = rippleAge.current / RIPPLE_DURATION;
      if (t >= 1) ripple.visible = false;
      else {
        ripple.visible = true;
        const k = 0.4 + t * RIPPLE_MAX_SCALE;
        ripple.scale.set(k, k, k);
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
      <mesh ref={rippleMesh} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
        <ringGeometry args={[0.3, 0.42, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} />
      </mesh>
    </>
  );
}
