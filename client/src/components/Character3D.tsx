import { forwardRef, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface Character3DProps {
  color: string; // "#rrggbb"
  username: string;
  sitting: boolean;
}

const COLOR_LERP_FACTOR = 0.15;

// Visual body only — the parent (LocalPlayerAvatar / RemotePlayerAvatar in WorldScene)
// owns the forwarded group ref and drives its position every frame (prediction or lerp).
export const Character3D = forwardRef<THREE.Group, Character3DProps>(
  ({ color, username, sitting }, ref) => {
    const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null);
    const headMatRef = useRef<THREE.MeshStandardMaterial>(null);
    const targetColor = useRef(new THREE.Color(color));

    useEffect(() => {
      targetColor.current.set(color);
    }, [color]);

    useFrame(() => {
      bodyMatRef.current?.color.lerp(targetColor.current, COLOR_LERP_FACTOR);
      headMatRef.current?.color.lerp(targetColor.current, COLOR_LERP_FACTOR);
    });

    return (
      <group ref={ref} scale={sitting ? [1, 0.8, 1] : [1, 1, 1]}>
        <mesh castShadow position={[0, 0.6, 0]}>
          <capsuleGeometry args={[0.35, 0.5, 4, 8]} />
          <meshStandardMaterial ref={bodyMatRef} roughness={0.6} metalness={0.1} />
        </mesh>
        <mesh castShadow position={[0, 1.15, 0]}>
          <sphereGeometry args={[0.28, 16, 16]} />
          <meshStandardMaterial ref={headMatRef} roughness={0.6} metalness={0.1} />
        </mesh>
        {/* TEMP: disabled while isolating the keyboard-movement bug — bare floor + capsule
            only, per the current debugging focus. Not a re-opened isolation test; restore
            once WASD movement is confirmed working in real Discord. */}
        {/* <Text
          position={[0, 1.7, 0]}
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
        </Text> */}
      </group>
    );
  }
);

Character3D.displayName = "Character3D";
