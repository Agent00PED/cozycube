import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { WALL_HEIGHT } from "@shared/worlds/lounge";
import { cameraFocus, cameraView, frame } from "./cameraFocus";

// The isometric camera. Orthographic, looking along (1, 1, 1), with its zoom fitted so the 15x15
// loft (floor, walls and the slab under it) fills the viewport, then nudged a little closer.
//
//   follow    by default the camera glides toward the local player, but only part of the way
//             (FOLLOW): the room never slides far off-screen, it just leans toward you
//   free look right-drag or middle-drag (or a two-finger drag) pans the camera anywhere over the room
//   snap back the moment the player moves (a click-to-move, WASD, the joystick) the camera eases
//             back onto them
//   zoom      the wheel or a pinch, around the fit

const ISO_ANGLE = Math.atan(1 / Math.sqrt(2)); // ~35.264 deg
/** Orthographic, so this only has to keep the whole room in front of the near plane. */
const DISTANCE = 60;
/** The diorama slab stands this far under the floor (client/src/scene/LoungeWorld.tsx). */
const SLAB_DEPTH = 1.3;
/** The default view sits a little closer than the exact fit, so following has something to reveal. */
const DEFAULT_ZOOM = 1.04;
const ZOOM_MIN = 0.7; // x the fitted zoom
const ZOOM_MAX = 5;
const ZOOM_LERP = 0.18;
/** How much of the way to the player the camera leans while following (1 = locked on). */
const FOLLOW = 0.4;
const FOLLOW_LERP = 0.07;
/** Free look may roam this far from the room's centre. */
const PAN_LIMIT = 10;
/** The player counts as moving above this speed, in world units per second. */
const MOVING_SPEED = 0.35;

const ISO_DIR = new THREE.Vector3(
  DISTANCE * Math.cos(ISO_ANGLE) * Math.cos(Math.PI / 4),
  DISTANCE * Math.sin(ISO_ANGLE),
  DISTANCE * Math.cos(ISO_ANGLE) * Math.sin(Math.PI / 4)
);

/**
 * Pixels per world unit at which a `size`-wide square, seen from the isometric angle, fits the
 * viewport: its diagonal spans size*sqrt(2) across, its depth foreshortens by sin(ISO_ANGLE), and
 * the walls and the slab add their height on top and below.
 */
export function fitZoom(size: number, width: number, height: number): number {
  const across = size * Math.SQRT2;
  const tall = across * Math.sin(ISO_ANGLE) + (WALL_HEIGHT + SLAB_DEPTH) * Math.cos(ISO_ANGLE);
  return Math.min(width / across, height / tall) * 0.96;
}

// Screen-space drag -> ground-plane pan, so the world follows the pointer ("grab" feel). In this
// view screen-right is the ground diagonal (+x, -z) and screen-down is (+x, +z), foreshortened by
// sin(ISO_ANGLE) because the ground plane is tilted away from the camera.
const SCREEN_RIGHT = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);
const SCREEN_DOWN = new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2).multiplyScalar(1 / Math.sin(ISO_ANGLE));

/** Turns a "per 60fps frame" lerp factor into the equivalent for any frame delta. */
const frameLerp = (factor: number, delta: number) => 1 - Math.pow(1 - factor, delta * 60);

// Discord's webview reports the device pixel ratio of a Retina laptop or a phone (2-3), and 3x is
// 9x the fill of 1x. r3f treats a [min, max] dpr as a range it may adapt within.
const DPR_RANGE: [number, number] = [1, Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, 1.5)];

export function IsometricCanvas({ children }: { children: React.ReactNode }) {
  const [glLost, setGlLost] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        orthographic
        shadows={false}
        dpr={DPR_RANGE}
        camera={{ position: [ISO_DIR.x, ISO_DIR.y, ISO_DIR.z], zoom: 30, near: 0.1, far: 200 }}
        gl={{ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
        onCreated={(state) => {
          const { gl } = state;
          // dev builds only: expose the r3f state to the console for draw-call and camera checks
          if (import.meta.env.DEV) (window as unknown as { __r3f?: unknown }).__r3f = state;
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            setGlLost(true);
          });
          gl.domElement.addEventListener("webglcontextrestored", () => setGlLost(false));
        }}
      >
        <CameraRig />
        {children}
      </Canvas>
      {glLost && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,10,16,0.9)", color: "#ff8a8a", font: "14px sans-serif", padding: 24, textAlign: "center" }}>
          The 3D renderer lost its GPU context. Try reloading the Activity.
        </div>
      )}
    </div>
  );
}

function CameraRig() {
  const { camera, gl, size } = useThree();
  /** How far the wheel or a pinch has zoomed away from the default (1 = default). */
  const userZoom = useRef(1);
  /** The smoothed point the camera looks at. Following chases the player; free look writes into it directly. */
  const center = useRef(new THREE.Vector3());
  const zoomRef = useRef(30);
  const lastFocus = useRef({ x: 0, z: 0, ready: false });

  useEffect(() => {
    const canvas = gl.domElement;
    const clampZoom = (v: number) => THREE.MathUtils.clamp(v, ZOOM_MIN, ZOOM_MAX);
    const pan = (dx: number, dy: number) => {
      const perPixel = 1 / zoomRef.current; // orthographic: zoom is pixels per world unit
      center.current.x = THREE.MathUtils.clamp(center.current.x - (dx * SCREEN_RIGHT.x + dy * SCREEN_DOWN.x) * perPixel, -PAN_LIMIT, PAN_LIMIT);
      center.current.z = THREE.MathUtils.clamp(center.current.z - (dx * SCREEN_RIGHT.y + dy * SCREEN_DOWN.y) * perPixel, -PAN_LIMIT, PAN_LIMIT);
      cameraView.freeLook = true;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userZoom.current = clampZoom(userZoom.current * Math.exp(-e.deltaY * 0.0015));
    };

    // right or middle button drag: pan. (The left button is click-to-move and belongs to the scene.)
    let dragging: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 1 || e.button === 2) {
        e.preventDefault(); // no middle-click autoscroll
        dragging = { x: e.clientX, y: e.clientY };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // an inactive pointer id: the drag still works through the move events
        }
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      pan(e.clientX - dragging.x, e.clientY - dragging.y);
      dragging = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // nothing was captured
      }
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault(); // so a right-drag is not a menu
    const onAuxClick = (e: MouseEvent) => e.preventDefault();

    // two fingers: pinch to zoom and drag to pan
    let pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: dist(e.touches), zoom: userZoom.current, mid: mid(e.touches) };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      userZoom.current = clampZoom(pinch.zoom * (dist(e.touches) / pinch.dist));
      const m = mid(e.touches);
      if (Math.hypot(m.x - pinch.mid.x, m.y - pinch.mid.y) > 0.5) pan(m.x - pinch.mid.x, m.y - pinch.mid.y);
      pinch.mid = m;
    };
    const onTouchEnd = () => (pinch = null);

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("auxclick", onAuxClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("auxclick", onAuxClick);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [gl]);

  const snapped = useRef(false);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const cam = camera as THREE.OrthographicCamera;

    // zoom, eased toward the fitted goal
    const goal = fitZoom(frame.size, size.width, size.height) * DEFAULT_ZOOM * userZoom.current;
    zoomRef.current = snapped.current ? THREE.MathUtils.lerp(zoomRef.current, goal, frameLerp(ZOOM_LERP, delta)) : goal;
    cam.zoom = zoomRef.current;
    cam.updateProjectionMatrix();

    // the player moving takes the camera back from free look
    const last = lastFocus.current;
    if (cameraFocus.hasTarget) {
      const speed = last.ready && delta > 0 ? Math.hypot(cameraFocus.x - last.x, cameraFocus.z - last.z) / delta : 0;
      if (speed > MOVING_SPEED) cameraView.freeLook = false;
      last.x = cameraFocus.x;
      last.z = cameraFocus.z;
      last.ready = true;
    }

    // following: lean toward the player, most of the way; free look leaves the centre where it was dragged
    if (!cameraView.freeLook) {
      const gx = cameraFocus.hasTarget ? cameraFocus.x * FOLLOW : 0;
      const gz = cameraFocus.hasTarget ? cameraFocus.z * FOLLOW : 0;
      if (!snapped.current) center.current.set(gx, 0, gz);
      else {
        const t = frameLerp(FOLLOW_LERP, delta);
        center.current.x = THREE.MathUtils.lerp(center.current.x, gx, t);
        center.current.z = THREE.MathUtils.lerp(center.current.z, gz, t);
      }
    }
    snapped.current = true;

    // the same isometric angle as ever; only the point it looks at moves
    const c = center.current;
    cam.position.set(ISO_DIR.x + c.x, ISO_DIR.y, ISO_DIR.z + c.z);
    cam.lookAt(c.x, 0, c.z);
  });
  return null;
}
