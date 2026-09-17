import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerformanceMonitor } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { cameraFocus } from "./cameraFocus";
import * as THREE from "three";

const ISO_ANGLE = Math.atan(1 / Math.sqrt(2)); // ~35.264 deg
// Orthographic, so this distance never changes how big anything looks — it only has to keep
// the whole world in FRONT of the camera. With a follow-cam over a 28x28 world, the focus can be
// in one corner while the opposite corner is ~30 units nearer the camera along the view axis.
// At the old distance of 20 that corner fell behind the near plane and was clipped away.
const DISTANCE = 60;
const CAMERA_FAR = 250;

// Framing for a follow-cam: a comfortable neighbourhood around the player rather than the
// whole island. Zooming all the way out (MIN_ZOOM) still shows the entire 28x28 diorama.
const BASE_ZOOM = 40;
const BASE_WIDTH = 900; // reference viewport width at which BASE_ZOOM applies
const MIN_ZOOM = 13;
const DEFAULT_ZOOM_FLOOR = 32;
const MAX_ZOOM = 85;
const PAN_LIMIT = 7; // world units of right-drag look-around, relative to the followed player

// Per-60fps-frame blend toward the focus point. Kept low so the camera trails the player
// gently instead of feeling glued to them; converted to a frame-rate-independent factor below.
const FOLLOW_LERP = 0.065;
const ZOOM_LERP = 0.15;
const MAX_DPR = 1.5;

const ISO_DIR = new THREE.Vector3(
  DISTANCE * Math.cos(ISO_ANGLE) * Math.cos(Math.PI / 4),
  DISTANCE * Math.sin(ISO_ANGLE),
  DISTANCE * Math.cos(ISO_ANGLE) * Math.sin(Math.PI / 4)
);

/** Turns a "per 60fps frame" lerp factor into the equivalent for an arbitrary frame delta. */
function frameLerp(factor: number, delta: number): number {
  return 1 - Math.pow(1 - factor, delta * 60);
}

export function IsometricCanvas({ children }: { children: React.ReactNode }) {
  const [glLostMessage, setGlLostMessage] = useState<string | null>(null);
  // Start sharp on capable screens; PerformanceMonitor below backs off if a device can't keep up.
  const [dpr, setDpr] = useState(() => Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, MAX_DPR));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows="soft"
        dpr={dpr}
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
        {/* Adaptive quality for "runs on every device": the fully zoomed-out 28x28 lounge peaks
            around 530 draw calls (the shadow pass redraws every caster). If the frame rate sags,
            drop to 1x resolution — the single biggest fill-rate saving, and invisible on most
            phones — and restore it when there's headroom again. After repeated flip-flopping it
            settles on the safe setting rather than oscillating. */}
        <PerformanceMonitor
          onDecline={() => setDpr(1)}
          onIncline={() => setDpr(Math.min(window.devicePixelRatio, MAX_DPR))}
          flipflops={3}
          onFallback={() => setDpr(1)}
        />
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
      far={CAMERA_FAR}
    />
  );
}

// Screen-space drag -> ground-plane pan, so the world follows the pointer ("grab" feel).
// In this isometric view, screen-right is the ground diagonal (+x, -z) and screen-down is
// (+x, +z) — foreshortened by sin(ISO_ANGLE), because the ground plane is tilted away from the
// camera. Mapping screen X/Y straight onto world X/Z (as this used to) drags diagonally.
const SCREEN_RIGHT = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);
const SCREEN_DOWN = new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2).multiplyScalar(1 / Math.sin(ISO_ANGLE));

function applyScreenPan(pan: { x: number; z: number }, dx: number, dy: number, zoom: number) {
  const worldPerPixel = 1 / zoom; // orthographic: zoom is pixels per world unit
  pan.x = THREE.MathUtils.clamp(pan.x - (dx * SCREEN_RIGHT.x + dy * SCREEN_DOWN.x) * worldPerPixel, -PAN_LIMIT, PAN_LIMIT);
  pan.z = THREE.MathUtils.clamp(pan.z - (dx * SCREEN_RIGHT.y + dy * SCREEN_DOWN.y) * worldPerPixel, -PAN_LIMIT, PAN_LIMIT);
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
    // The camera follows the player, so a narrow phone screen doesn't need to fit the whole room
    // the way the old fixed camera did. Floor the default so characters stay readable on phones;
    // pinch-out still reaches MIN_ZOOM for the full-island overview.
    const scaledBase = THREE.MathUtils.clamp(BASE_ZOOM * (size.width / BASE_WIDTH), DEFAULT_ZOOM_FLOOR, MAX_ZOOM);
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
      applyScreenPan(panRef.current, dx, dy, targetZoomRef.current);
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
        applyScreenPan(panRef.current, dx, dy, targetZoomRef.current);
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

  // The smoothed point the camera is actually centred on (before the user's pan offset).
  const centerRef = useRef(new THREE.Vector3());
  const snappedRef = useRef(false);

  useFrame((_, delta) => {
    if ("zoom" in camera) {
      const cam = camera as THREE.OrthographicCamera;
      cam.zoom = THREE.MathUtils.lerp(cam.zoom, targetZoomRef.current, frameLerp(ZOOM_LERP, delta));
      cam.updateProjectionMatrix();
    }

    const override = cameraFocus.override;
    if (override && performance.now() > override.until) cameraFocus.override = null;
    const goalX = cameraFocus.override?.x ?? cameraFocus.x;
    const goalZ = cameraFocus.override?.z ?? cameraFocus.z;

    const center = centerRef.current;
    if (cameraFocus.hasTarget && !snappedRef.current) {
      // First known player position: start there instead of gliding in from the world origin.
      center.set(goalX, 0, goalZ);
      snappedRef.current = true;
    } else {
      const t = frameLerp(FOLLOW_LERP, delta);
      center.x = THREE.MathUtils.lerp(center.x, goalX, t);
      center.z = THREE.MathUtils.lerp(center.z, goalZ, t);
    }

    // Same isometric angle as ever — only the point it orbits moves.
    const lookX = center.x + panRef.current.x;
    const lookZ = center.z + panRef.current.z;
    camera.position.set(ISO_DIR.x + lookX, ISO_DIR.y, ISO_DIR.z + lookZ);
    camera.lookAt(lookX, 0, lookZ);
  });

  return null;
}
