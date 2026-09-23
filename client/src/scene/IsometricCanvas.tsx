import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerformanceMonitor } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { cameraFocus, isFreeLook, setFreeLook } from "./cameraFocus";
import { HIT_LAYER } from "./kit";
import * as THREE from "three";

const ISO_ANGLE = Math.atan(1 / Math.sqrt(2)); // ~35.264 deg
// Orthographic, so this distance never changes how big anything looks — it only has to keep
// the whole world in FRONT of the camera. With a follow-cam over a 28x28 world, the focus can be
// in one corner while the opposite corner is ~30 units nearer the camera along the view axis.
// At the old distance of 20 that corner fell behind the near plane and was clipped away.
const DISTANCE = 52;
const CAMERA_FAR = 200;

// Framing for an 18x18 diorama: the default sits just inside the whole island, so you can see
// the room you are in AND who is coming. MIN_ZOOM frames all 18x18 with margin on a phone;
// MAX_ZOOM goes right down to a character portrait.
const BASE_ZOOM = 46;
const BASE_WIDTH = 900; // reference viewport width at which BASE_ZOOM applies
// 20 units across map to (20 + 20)/sqrt(2) ~= 28 screen units per zoom step, so ~32 fits the
// whole island in a 900px viewport; MIN_ZOOM leaves a margin round it even on a phone.
const MIN_ZOOM = 20;
const DEFAULT_ZOOM_FLOOR = 34;
const MAX_ZOOM = 160;
// Free look roams the whole diorama (a bit past its lip, so corner furniture can be centred)
// rather than a small window around the player.
const FREE_LOOK_LIMIT = 15; // the campfire valley is 28 across

// Per-60fps-frame blend toward the focus point. Kept low so the camera trails the player
// gently instead of feeling glued to them; converted to a frame-rate-independent factor below.
const FOLLOW_LERP = 0.065;
const ZOOM_LERP = 0.15;
// Discord's webview reports the device pixel ratio of a Retina laptop or a modern phone (2-3),
// and rendering this scene at 3x is 9x the fill of 1x — the single biggest cause of the lag
// inside Discord. r3f treats a [min, max] dpr as a range it may adapt within, and
// PerformanceMonitor below drives it: it never exceeds 1.5, whatever the display claims.
const DPR_CEILING = 1.5;
// ...and never above what the display actually has, or a 1.25x screen would be rendered at
// 1.5x for nothing.
const DPR_RANGE: [number, number] = [1, Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, DPR_CEILING)];

const ISO_DIR = new THREE.Vector3(
  DISTANCE * Math.cos(ISO_ANGLE) * Math.cos(Math.PI / 4),
  DISTANCE * Math.sin(ISO_ANGLE),
  DISTANCE * Math.cos(ISO_ANGLE) * Math.sin(Math.PI / 4)
);

/**
 * The orthographic zoom (pixels per world unit) at which a square of `size` world units,
 * seen from the isometric angle, fills the viewport with a small margin: its diagonal spans
 * size*sqrt(2) across, and its depth foreshortens to size*sqrt(2)*sin(ISO_ANGLE) tall, plus
 * the height of a wall standing on its far side.
 */
function fitZoom(size: number, width: number, height: number): number {
  const across = size * Math.SQRT2;
  const tall = across * Math.sin(ISO_ANGLE) + 3.4 * Math.cos(ISO_ANGLE);
  return Math.min(width / across, height / tall) * 0.97;
}

/** Turns a "per 60fps frame" lerp factor into the equivalent for an arbitrary frame delta. */
function frameLerp(factor: number, delta: number): number {
  return 1 - Math.pow(1 - factor, delta * 60);
}

export function IsometricCanvas({ children }: { children: React.ReactNode }) {
  const [glLostMessage, setGlLostMessage] = useState<string | null>(null);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows="soft"
        dpr={DPR_RANGE}
        // "low-power" was a plausible contributor to a black screen with zero errors: on a
        // multi-GPU machine (very common — laptop with integrated + discrete graphics) inside
        // a sandboxed iframe, requesting only the low-power context can fail silently or
        // route to a GPU that can't actually satisfy it. "default" lets the browser pick
        // whatever context it can actually create.
        gl={{ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
        onCreated={(state) => {
          const { gl, raycaster } = state;
          // Dev builds only: expose the r3f state for debugging and automated checks from the
          // console (draw calls, camera, projecting world points). Stripped from production.
          if (import.meta.env.DEV) (window as unknown as { __r3f?: unknown }).__r3f = state;
          // Seat and prop click pads are on HIT_LAYER only (see kit.tsx): raycast, never drawn.
          raycaster.layers.enable(HIT_LAYER);
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
        {/* Adaptive quality on top of the clamp above: if the frame rate sags, fall to the
            bottom of DPR_RANGE — the single biggest fill-rate saving, and barely visible on a
            phone — and climb back when there is headroom. After repeated flip-flopping it
            settles on the safe setting rather than oscillating. */}
        <AdaptiveResolution />
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

// drei's PerformanceMonitor has to live INSIDE the Canvas to reach r3f's setDpr, which is what
// actually re-sizes the drawing buffer within the dpr range the Canvas was given.
function AdaptiveResolution() {
  const setDpr = useThree((state) => state.setDpr);
  return (
    <PerformanceMonitor
      onDecline={() => setDpr(DPR_RANGE[0])}
      onIncline={() => setDpr(DPR_RANGE[1])}
      flipflops={3}
      onFallback={() => setDpr(DPR_RANGE[0])}
    />
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

// Dragging moves the CAMERA's own look-at point around the world (absolute), not an offset from
// the player: the whole point of free look is that it stops depending on where the player is.
function applyScreenPan(center: THREE.Vector3, dx: number, dy: number, zoom: number) {
  const worldPerPixel = 1 / zoom; // orthographic: zoom is pixels per world unit
  center.x = THREE.MathUtils.clamp(center.x - (dx * SCREEN_RIGHT.x + dy * SCREEN_DOWN.x) * worldPerPixel, -FREE_LOOK_LIMIT, FREE_LOOK_LIMIT);
  center.z = THREE.MathUtils.clamp(center.z - (dx * SCREEN_RIGHT.y + dy * SCREEN_DOWN.y) * worldPerPixel, -FREE_LOOK_LIMIT, FREE_LOOK_LIMIT);
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
  // The smoothed point the camera is centred on. While following it chases the player; while
  // free-looking the drag writes straight into it and the follow code leaves it alone.
  const centerRef = useRef(new THREE.Vector3());
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastPanTouchRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(BASE_ZOOM);

  // Which fixed frame (if any) the default zoom was last fitted to, so a world that asks for
  // one gets fitted once when it appears and again when the viewport changes, not every frame.
  const fittedFrameRef = useRef<string | null>(null);
  useEffect(() => {
    // The camera follows the player, so a narrow phone screen doesn't need to fit the whole room
    // the way the old fixed camera did. Floor the default so characters stay readable on phones;
    // pinch-out still reaches MIN_ZOOM for the full-island overview.
    const scaledBase = THREE.MathUtils.clamp(BASE_ZOOM * (size.width / BASE_WIDTH), DEFAULT_ZOOM_FLOOR, MAX_ZOOM);
    targetZoomRef.current = scaledBase;
    fittedFrameRef.current = null; // a resize refits a held frame on the next frame
  }, [size.width, size.height]);

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
      setFreeLook(true); // a drag releases the camera from the player until you recenter
      applyScreenPan(centerRef.current, dx, dy, targetZoomRef.current);
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
        if (Math.hypot(dx, dy) > 0.5) setFreeLook(true);
        applyScreenPan(centerRef.current, dx, dy, targetZoomRef.current);
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

  const snappedRef = useRef(false);

  useFrame((_, delta) => {
    if ("zoom" in camera) {
      const cam = camera as THREE.OrthographicCamera;
      cam.zoom = THREE.MathUtils.lerp(cam.zoom, targetZoomRef.current, frameLerp(ZOOM_LERP, delta));
      cam.updateProjectionMatrix();
    }

    const override = cameraFocus.override;
    if (override && performance.now() > override.until) cameraFocus.override = null;
    // A world holding a fixed frame (the intimate lounge) is centred on that frame and fitted
    // to the viewport; the wheel and pinch can still zoom in from there, and a drag still pans.
    const frame = cameraFocus.frame;
    const frameKey = frame ? `${frame.x},${frame.z},${frame.size}` : null;
    if (frameKey !== fittedFrameRef.current) {
      fittedFrameRef.current = frameKey;
      if (frame) targetZoomRef.current = THREE.MathUtils.clamp(fitZoom(frame.size, size.width, size.height), MIN_ZOOM, MAX_ZOOM);
      else targetZoomRef.current = THREE.MathUtils.clamp(BASE_ZOOM * (size.width / BASE_WIDTH), DEFAULT_ZOOM_FLOOR, MAX_ZOOM);
    }
    const goalX = cameraFocus.override?.x ?? frame?.x ?? cameraFocus.x;
    const goalZ = cameraFocus.override?.z ?? frame?.z ?? cameraFocus.z;

    const center = centerRef.current;
    if ((cameraFocus.hasTarget || frame) && !snappedRef.current) {
      // First known player position: start there instead of gliding in from the world origin.
      center.set(goalX, 0, goalZ);
      snappedRef.current = true;
    } else if (!isFreeLook()) {
      // Following: ease toward the player (or whoever is being glanced at). Free look skips
      // this entirely, so the view stays exactly where it was dragged, and recentring is just
      // this same lerp taking over again — which is what makes the snap-back smooth.
      const t = frameLerp(FOLLOW_LERP, delta);
      center.x = THREE.MathUtils.lerp(center.x, goalX, t);
      center.z = THREE.MathUtils.lerp(center.z, goalZ, t);
    }

    // Same isometric angle as ever — only the point it orbits moves.
    const lookX = center.x;
    const lookZ = center.z;
    camera.position.set(ISO_DIR.x + lookX, ISO_DIR.y, ISO_DIR.z + lookZ);
    camera.lookAt(lookX, 0, lookZ);
  });

  return null;
}
