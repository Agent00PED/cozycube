import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { stickInput } from "../../systems/input";
import { useTouchUi } from "../../systems/inputMode";

// The universal floating joystick: on a touch screen (a phone or a tablet, or a touch laptop being
// touched) the way you walk on every map. A thumb put down anywhere in the screen's lower-left (the
// left 45%, the bottom 60%) spawns the stick right there: its base ring (18vmin across, 130 to 210
// px) and its knob (7vmin, 50 to 80 px) in frosted glass, a soft glow on the rim the way you push.
// Dragging steers like WASD (stickInput), harder the further it goes, past a dead zone of 15% of
// the ring (no idle jitter); drag on past 1.2 radii and the base follows the thumb, so a long run
// never runs out of stick. The input is screen-space: the movement hook turns it into the camera's
// own right and forward along the ground (input.ts setScreenAxes, kept by the camera rig), so the
// avatar walks the way the thumb points whatever the camera (the isometric diorama, the ring's
// action camera). A plain tap (no drag past the dead zone) is still a tap: the floor walks you to
// it, a seat or a prop walks you up and uses it (a drag that turns into steering drops that walk).
// A touch on the HUD (a button, a panel, the action dock, a text field) is never taken, and each
// finger is its own: a thumb on the stick never stops the other hand's taps (the ring's combat
// cluster). While no thumb is on it, a faint outline waits in the corner as a hint. The first touch
// on a device that was on the mouse spawns it too (the page turns to touch as that finger lands).

/** Where a thumb may land to steer: the left share of the width, below this share of the height. */
const ZONE_X = 0.45;
const ZONE_Y = 0.4;
/** The dead zone (a share of the ring's radius), and how far past the rim the base starts to follow. */
const DEAD = 0.15;
const FOLLOW = 1.2;
const IGNORE = '.ui-modal, .action-dock, .cozy-hud-block, button, input, textarea, select, a, [role="dialog"], [role="toolbar"]';

/** The ring's and the knob's size (px) for this screen: clamp(130px, 18vmin, 210px), clamp(50px, 7vmin, 80px). */
function sizes() {
  const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
  return { ring: Math.min(210, Math.max(130, 18 * vmin)), knob: Math.min(80, Math.max(50, 7 * vmin)) };
}

export function TouchControls({ enabled }: { enabled: boolean }) {
  const touch = useTouchUi();
  const [size, setSize] = useState(sizes);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  /** The knob's offset and the glow's strength and angle, kept so a stick drawn after its first
   *  moves (React mounts it a moment after the thumb lands) shows where the thumb already is. */
  const shown = useRef({ kx: 0, ky: 0, glow: 0, angle: 0 });
  const paint = () => {
    const v = shown.current;
    if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${v.kx}px), calc(-50% + ${v.ky}px))`;
    if (glow.current) {
      glow.current.style.opacity = String(v.glow);
      glow.current.style.transform = `rotate(${v.angle}rad)`;
    }
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const onResize = () => setSize(sizes());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let id: number | null = null;
    let origin = { x: 0, y: 0 };
    const release = () => {
      id = null;
      stickInput.active = false;
      stickInput.held = false;
      stickInput.x = 0;
      stickInput.y = 0;
      setAt(null);
    };
    const place = () => {
      if (base.current) base.current.style.transform = `translate(${origin.x}px, ${origin.y}px)`;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || id !== null) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(IGNORE)) return;
      if (e.clientX > window.innerWidth * ZONE_X || e.clientY < window.innerHeight * ZONE_Y) return;
      id = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
      stickInput.held = true;
      shown.current = { kx: 0, ky: 0, glow: 0, angle: 0 };
      setAt({ ...origin });
      paintRef.current();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const r = sizeRef.current.ring / 2;
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      let len = Math.hypot(dx, dy);
      // dragged far past the rim: the base follows the thumb (never a dead stick mid-run)
      if (len > FOLLOW * r) {
        const pull = (len - FOLLOW * r) / len;
        origin = { x: origin.x + dx * pull, y: origin.y + dy * pull };
        place();
        dx = e.clientX - origin.x;
        dy = e.clientY - origin.y;
        len = Math.hypot(dx, dy);
      }
      const k = len > r ? r / len : 1;
      const kx = dx * k;
      const ky = dy * k;
      const live = len >= DEAD * r;
      stickInput.active = live;
      stickInput.x = live ? kx / r : 0;
      stickInput.y = live ? -ky / r : 0;
      shown.current = { kx, ky, glow: live ? Math.min(1, len / r) : 0, angle: Math.atan2(dx, -dy) };
      paintRef.current();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) release();
    };
    window.addEventListener("pointerdown", down, { capture: true, passive: true });
    window.addEventListener("pointermove", move, { capture: true, passive: true });
    window.addEventListener("pointerup", up, { capture: true });
    window.addEventListener("pointercancel", up, { capture: true });
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerdown", down, { capture: true });
      window.removeEventListener("pointermove", move, { capture: true });
      window.removeEventListener("pointerup", up, { capture: true });
      window.removeEventListener("pointercancel", up, { capture: true });
      window.removeEventListener("blur", release);
      release();
    };
  }, [enabled]);

  // the base follows the thumb by transform (set above); a fresh press puts it where it landed, and
  // the knob and the glow where the thumb has already gone
  useLayoutEffect(() => {
    if (at && base.current) base.current.style.transform = `translate(${at.x}px, ${at.y}px)`;
    if (at) paintRef.current();
  }, [at]);

  if (!enabled || (!touch && !at)) return null;
  const ring = size.ring;
  const held = !!at;
  return (
    <>
      {/* the idle hint: a faint outline where a thumb usually lands */}
      {!held && <div aria-hidden style={{ ...idleRing, width: ring, height: ring, left: `max(${Math.round(ring * 0.25)}px, calc(env(safe-area-inset-left) + 20px))`, bottom: `max(${Math.round(ring * 0.3)}px, calc(env(safe-area-inset-bottom) + 24px))` }} />}
      {held && (
        <div ref={base} aria-hidden style={{ ...anchor, transform: `translate(${at.x}px, ${at.y}px)` }}>
          <div style={{ ...activeRing, width: ring, height: ring }} />
          <div ref={glow} style={{ ...glowStyle, width: ring, height: ring }} />
          <div ref={knob} style={{ ...knobStyle, width: size.knob, height: size.knob }} />
        </div>
      )}
    </>
  );
}

const anchor: CSSProperties = { position: "fixed", left: 0, top: 0, width: 0, height: 0, pointerEvents: "none", zIndex: 30, transition: "transform 70ms linear" };
const idleRing: CSSProperties = {
  position: "fixed",
  borderRadius: "50%",
  border: "1.5px solid rgba(255, 255, 255, 1)",
  opacity: 0.1,
  pointerEvents: "none",
  zIndex: 30,
  transition: "opacity 200ms ease",
};
/** Held: the ring eased from its idle 0.10 up to 0.35, frosted glass with a crisp rim. */
const activeRing: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  transform: "translate(-50%, -50%)",
  borderRadius: "50%",
  border: "1.5px solid rgba(255, 255, 255, 0.95)",
  background: "rgba(255, 255, 255, 0.5)",
  opacity: 0.35,
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.18)",
  animation: "cozy-stick-in 180ms ease-out",
};
/** The rim's glow the way you push: a soft light at the ring's top edge, turned to the angle (its
 *  rotation set about the stick's centre). */
const glowStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  marginLeft: 0,
  translate: "-50% -50%",
  borderRadius: "50%",
  background: "radial-gradient(circle at 50% 3%, rgba(255, 244, 214, 0.75), rgba(255, 244, 214, 0) 40%)",
  opacity: 0,
  transition: "opacity 90ms linear",
};
const knobStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  transform: "translate(-50%, -50%)",
  borderRadius: "50%",
  border: "1.5px solid rgba(255, 255, 255, 0.7)",
  background: "rgba(255, 255, 255, 0.42)",
  opacity: 0.8,
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.22)",
  willChange: "transform",
};
