import { Text } from "@react-three/drei";
import type { NearbyInteractable } from "../systems/useLocalPlayerMovement";

interface InteractPromptProps {
  nearby: NearbyInteractable;
  sitting: boolean;
}

// A real 3D mesh, not <Html> — this used to use <Html distanceFactor>, the exact pattern
// that caused the giant black/white glyph under our OrthographicCamera (distanceFactor's CSS
// scale math assumes a perspective camera's FOV, meaningless for orthographic). <Text> has no
// such camera-dependent scaling, same fix already applied to Character3D's nametag.
export function InteractPrompt({ nearby, sitting }: InteractPromptProps) {
  const label =
    nearby.kind === "chair" ? (sitting ? "Press E to stand up" : "Press E to sit") : "Press E to toggle";

  return (
    <Text
      position={[nearby.x, 1.5, nearby.z]}
      scale={[1, 1, 1]}
      font="/fonts/kenpixel.ttf"
      fontSize={0.18}
      maxWidth={3}
      overflowWrap="break-word"
      textAlign="center"
      color="#0e0e16"
      anchorX="center"
      anchorY="middle"
      outlineColor="#ffffff"
      outlineWidth={0.03}
    >
      {label}
    </Text>
  );
}
