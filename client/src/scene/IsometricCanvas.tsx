import { Canvas, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const ISO_ANGLE = Math.atan(1 / Math.sqrt(2)); // ~35.264 deg
const DISTANCE = 20;
const BASE_ZOOM = 27; // ~1.5x the previous 18 — room was too small relative to the surrounding black frame
const BASE_WIDTH = 1280;

export function IsometricCanvas({ children }: { children: React.ReactNode }) {
  const [glLostMessage, setGlLostMessage] = useState<string | null>(null);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        // "low-power" was a plausible contributor to a black screen with zero errors: on a
        // multi-GPU machine (very common — laptop with integrated + discrete graphics) inside
        // a sandboxed iframe, requesting only the low-power context can fail silently or
        // route to a GPU that can't actually satisfy it. "default" lets the browser pick
        // whatever context it can actually create.
        gl={{ antialias: true, powerPreference: "default", failIfMajorPerformanceCaveat: false }}
        onCreated={({ gl }) => {
          console.log("[IsometricCanvas] WebGL context created:", gl.getContextAttributes());
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            console.error("[IsometricCanvas] WebGL context lost", e);
            setGlLostMessage("3D renderer lost its GPU context (webglcontextlost). Try reloading the Activity.");
          });
          canvas.addEventListener("webglcontextrestored", () => {
            console.log("[IsometricCanvas] WebGL context restored");
            setGlLostMessage(null);
          });
        }}
      >
        <IsoCamera />
        <ResponsiveZoom />
        {children}
      </Canvas>

      {glLostMessage && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10, 10, 16, 0.9)",
            color: "#ff6b6b",
            fontFamily: "sans-serif",
            fontSize: 14,
            padding: 24,
            textAlign: "center",
            zIndex: 30,
          }}
        >
          {glLostMessage}
        </div>
      )}
    </div>
  );
}

function IsoCamera() {
  const camRef = useRef<THREE.OrthographicCamera>(null);
  const x = DISTANCE * Math.cos(ISO_ANGLE) * Math.cos(Math.PI / 4);
  const y = DISTANCE * Math.sin(ISO_ANGLE);
  const z = DISTANCE * Math.cos(ISO_ANGLE) * Math.sin(Math.PI / 4);

  return (
    <OrthographicCamera
      ref={camRef}
      makeDefault
      position={[x, y, z]}
      zoom={BASE_ZOOM}
      near={0.1}
      far={100}
      onUpdate={(cam) => cam.lookAt(0, 0, 0)}
    />
  );
}

function ResponsiveZoom() {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!("zoom" in camera)) return;
    const scaledZoom = BASE_ZOOM * (size.width / BASE_WIDTH);
    (camera as THREE.OrthographicCamera).zoom = Math.max(18, Math.min(42, scaledZoom));
    camera.updateProjectionMatrix();
  }, [size, camera]);

  return null;
}
