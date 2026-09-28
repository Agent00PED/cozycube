import { useEffect, useRef, useState, type CSSProperties } from "react";
import { stickInput } from "../../systems/input";
import { useTouchUi } from "../../systems/inputMode";

// The floating joystick, on every map, on a touch screen only (touch-ui: a phone or a tablet, or a
// touch laptop being touched). A thumb put down anywhere in the screen's lower-left (the left 45%,
// the bottom 60%) grows a faint ring round where it landed; dragging steers you like WASD
// (stickInput, read by the movement hook), harder the further it goes. It spawns only once the
// thumb drags past a small dead zone, so a plain tap there is still a tap: the floor walks you to
// it, a seat or a prop walks you up and uses it, exactly as elsewhere on the screen (and a drag
// that turns into steering drops that walk). A touch on the HUD (a button, a panel, the action dock,
// a text field) is never taken.

/** The ring's radius, and how far the thumb drags before it counts as steering (px). */
const RADIUS = 52;
const DEAD_ZONE = 10;
/** Where a thumb may land to steer: the left share of the width, below this share of the height. */
const ZONE_X = 0.45;
const ZONE_Y = 0.4;
const IGNORE = '.ui-modal, .action-dock, .cozy-hud-block, button, input, textarea, select, a, [role="dialog"], [role="toolbar"]';

export function TouchControls({ enabled }: { enabled: boolean }) {
  const touch = useTouchUi();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const knob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!touch || !enabled) return;
    let id: number | null = null;
    let origin = { x: 0, y: 0 };
    let shown = false;
    const release = () => {
      id = null;
      shown = false;
      stickInput.active = false;
      stickInput.held = false;
      stickInput.x = 0;
      stickInput.y = 0;
      setAt(null);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || id !== null) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(IGNORE)) return;
      if (e.clientX > window.innerWidth * ZONE_X || e.clientY < window.innerHeight * ZONE_Y) return;
      id = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
      stickInput.held = true;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      const len = Math.hypot(dx, dy);
      if (!shown && len < DEAD_ZONE) return;
      if (!shown) {
        shown = true;
        setAt({ ...origin });
      }
      const k = len > RADIUS ? RADIUS / len : 1;
      const kx = dx * k;
      const ky = dy * k;
      stickInput.x = kx / RADIUS;
      stickInput.y = -ky / RADIUS;
      stickInput.active = len >= DEAD_ZONE;
      if (knob.current) knob.current.style.transform = `translate(${kx}px, ${ky}px)`;
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
  }, [touch, enabled]);

  if (!at) return null;
  return (
    <div style={{ ...ring, left: at.x - RADIUS, top: at.y - RADIUS }} aria-hidden>
      <div ref={knob} style={knobStyle} />
    </div>
  );
}

const ring: CSSProperties = {
  position: "fixed",
  width: RADIUS * 2,
  height: RADIUS * 2,
  borderRadius: "50%",
  border: "2px solid rgba(255, 255, 255, 0.22)",
  background: "rgba(255, 255, 255, 0.04)",
  pointerEvents: "none",
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const knobStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "2px solid rgba(255, 255, 255, 0.3)",
  background: "rgba(255, 255, 255, 0.14)",
  willChange: "transform",
};
