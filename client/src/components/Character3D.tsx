import { forwardRef, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface Character3DProps {
  color: string; // "#rrggbb"
  username: string;
  sitting: boolean;
  speedRef: React.MutableRefObject<number>; // 0 = stationary, 1 = walking — drives the wobble/bob
}

const COLOR_LERP_FACTOR = 0.15;
const WALK_CYCLE_SPEED = 9; // radians/sec of the bob/wobble phase while moving
const BOB_HEIGHT = 0.05;
const WOBBLE_TILT = 0.09;

// Minimal "clay doll" figure — rounded sphere head, capsule torso, cylinder arms/legs, all
// sharing one matte material so a single color-lerp/tint drives the whole body. Visual body
// only — the parent (LocalPlayerAvatar / RemotePlayerAvatar in WorldScene) owns the forwarded
// outer group and drives its logical (x, z) position every frame (prediction or lerp); this
// component owns only the inner cosmetic wobble offset and the color/name.
export const Character3D = forwardRef<THREE.Group, Character3DProps>(
  ({ color, username, sitting, speedRef }, ref) => {
    const innerRef = useRef<THREE.Group>(null);
    const targetColor = useRef(new THREE.Color(color));
    const walkPhaseRef = useRef(0);

    const material = useMemo(
      () => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );
    useEffect(() => () => material.dispose(), [material]);

    const legGeometry = useMemo(() => new THREE.CylinderGeometry(0.09, 0.11, 0.5, 12), []);
    const armGeometry = useMemo(() => new THREE.CylinderGeometry(0.07, 0.08, 0.48, 12), []);
    const torsoGeometry = useMemo(() => new THREE.CapsuleGeometry(0.26, 0.38, 4, 14), []);
    const headGeometry = useMemo(() => new THREE.SphereGeometry(0.27, 20, 20), []);

    useEffect(() => {
      targetColor.current.set(color);
    }, [color]);

    useFrame((_, delta) => {
      material.color.lerp(targetColor.current, COLOR_LERP_FACTOR);

      const speed = speedRef.current;
      if (speed > 0.01) {
        walkPhaseRef.current += delta * WALK_CYCLE_SPEED;
      } else {
        walkPhaseRef.current = 0;
      }

      if (innerRef.current) {
        const bob = speed > 0.01 ? Math.abs(Math.sin(walkPhaseRef.current)) * BOB_HEIGHT : 0;
        const tilt = speed > 0.01 ? Math.sin(walkPhaseRef.current) * WOBBLE_TILT : 0;
        innerRef.current.position.y = bob;
        innerRef.current.rotation.z = THREE.MathUtils.lerp(innerRef.current.rotation.z, tilt, 0.3);
      }
    });

    return (
      <group ref={ref} scale={sitting ? [1, 0.8, 1] : [1, 1, 1]}>
        <group ref={innerRef}>
          {/* legs */}
          <mesh castShadow position={[-0.13, 0.28, 0]} geometry={legGeometry} material={material} />
          <mesh castShadow position={[0.13, 0.28, 0]} geometry={legGeometry} material={material} />
          {/* torso */}
          <mesh castShadow position={[0, 0.83, 0]} geometry={torsoGeometry} material={material} />
          {/* arms — angled slightly outward from the body */}
          <mesh
            castShadow
            position={[-0.36, 0.78, 0]}
            rotation={[0, 0, 0.18]}
            geometry={armGeometry}
            material={material}
          />
          <mesh
            castShadow
            position={[0.36, 0.78, 0]}
            rotation={[0, 0, -0.18]}
            geometry={armGeometry}
            material={material}
          />
          {/* head */}
          <mesh castShadow position={[0, 1.32, 0]} geometry={headGeometry} material={material} />
        </group>

        {/* `font` MUST stay set: without it, troika-three-text calls out to a CDN font resolver
            blocked by Discord's Activity iframe CSP, which silently broke rendering entirely. */}
        <Text
          position={[0, 1.85, 0]}
          scale={[1, 1, 1]}
          font="/fonts/kenpixel.ttf"
          fontSize={0.2}
          maxWidth={2}
          overflowWrap="break-word"
          textAlign="center"
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineColor="#000000"
          outlineWidth={0.02}
        >
          {username}
        </Text>
      </group>
    );
  }
);

Character3D.displayName = "Character3D";
