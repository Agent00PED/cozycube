import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const ISO_ANGLE = Math.atan(1 / Math.sqrt(2)); // ~35.264 deg
const DISTANCE = 20;
const BASE_ZOOM = 27;
const BASE_WIDTH = 1280;
const MIN_ZOOM = 18;
const MAX_ZOOM = 50;
const PAN_LIMIT = 3.5; // world units — keeps the look-around confined near the room, not infinite

const ISO_DIR = new THREE.Vector3(
  DISTANCE * Math.cos(ISO_ANGLE) * Math.cos(Math.PI / 4),
  DISTANCE * Math.sin(ISO_ANGLE),
  DISTANCE * Math.cos(ISO_ANGLE) * Math.sin(Math.PI / 4)
);

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
        <CameraRig />
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
  return (
    <OrthographicCamera
      ref={camRef}
      makeDefault
      position={[ISO_DIR.x, ISO_DIR.y, ISO_DIR.z]}
      zoom={BASE_ZOOM}
      near={0.1}
      far={100}
    />
  );
}

function touchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

// The Sims-style camera: mouse wheel / pinch to zoom (damped, clamped), right-click-drag or
// two-finger drag to pan a little around the room. Owns the camera's position/zoom every
// frame — IsoCamera above only supplies the initial values before the first frame runs.
function CameraRig() {
  const { camera, gl, size } = useThree();
  const targetZoomRef = useRef(BASE_ZOOM);
  const panRef = useRef({ x: 0, z: 0 });
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastPanTouchRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(BASE_ZOOM);

  useEffect(() => {
    const scaledBase = THREE.MathUtils.clamp(BASE_ZOOM * (size.width / BASE_WIDTH), MIN_ZOOM, MAX_ZOOM);
    targetZoomRef.current = scaledBase;
  }, [size.width]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetZoomRef.current = THREE.MathUtils.clamp(targetZoomRef.current - e.deltaY * 0.05, MIN_ZOOM, MAX_ZOOM);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault(); // allow right-drag panning without the browser menu

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) {
        isPanningRef.current = true;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isPanningRef.current || !lastPointerRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      const scale = 1.2 / targetZoomRef.current;
      panRef.current.x = THREE.MathUtils.clamp(panRef.current.x - dx * scale, -PAN_LIMIT, PAN_LIMIT);
      panRef.current.z = THREE.MathUtils.clamp(panRef.current.z - dy * scale, -PAN_LIMIT, PAN_LIMIT);
    };
    const onPointerUp = () => {
      isPanningRef.current = false;
      lastPointerRef.current = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStartDistRef.current = touchDistance(e.touches);
        pinchStartZoomRef.current = targetZoomRef.current;
        lastPanTouchRef.current = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();

      if (pinchStartDistRef.current) {
        const ratio = touchDistance(e.touches) / pinchStartDistRef.current;
        targetZoomRef.current = THREE.MathUtils.clamp(pinchStartZoomRef.current * ratio, MIN_ZOOM, MAX_ZOOM);
      }

      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (lastPanTouchRef.current) {
        const dx = midX - lastPanTouchRef.current.x;
        const dy = midY - lastPanTouchRef.current.y;
        const scale = 1.2 / targetZoomRef.current;
        panRef.current.x = THREE.MathUtils.clamp(panRef.current.x - dx * scale, -PAN_LIMIT, PAN_LIMIT);
        panRef.current.z = THREE.MathUtils.clamp(panRef.current.z - dy * scale, -PAN_LIMIT, PAN_LIMIT);
      }
      lastPanTouchRef.current = { x: midX, y: midY };
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDistRef.current = null;
        lastPanTouchRef.current = null;
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [gl]);

  useFrame(() => {
    if ("zoom" in camera) {
      const cam = camera as THREE.OrthographicCamera;
      cam.zoom = THREE.MathUtils.lerp(cam.zoom, targetZoomRef.current, 0.15);
      cam.updateProjectionMatrix();
    }
    camera.position.set(ISO_DIR.x + panRef.current.x, ISO_DIR.y, ISO_DIR.z + panRef.current.z);
    camera.lookAt(panRef.current.x, 0, panRef.current.z);
  });

  return null;
}
