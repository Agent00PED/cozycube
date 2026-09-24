import { useEffect, useRef, useState } from "react";
import { setJoystick } from "../../systems/input";

// A floating analog stick for phones: drag the knob anywhere within the ring and the avatar
// walks that way, camera-relative. touch-action: none and stopPropagation keep the drag from
// ever reaching the canvas (which would pan the camera) or the page (which would scroll).
const RADIUS = 46; // px the knob can travel
const DEAD_ZONE = 0.12;

export function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, live: false });
  const pointerId = useRef<number | null>(null);
  const release = () => {
    pointerId.current = null;
    setKnob({ x: 0, y: 0, live: false });
    setJoystick(null);
  };

  useEffect(() => () => setJoystick(null), []);
  // A pointer that lifts outside the ring (or a synthetic event that never reports capture)
  // must still let go, or the stick stays engaged and the avatar keeps walking into a wall.
  useEffect(() => {
    const onUp = () => {
      if (pointerId.current !== null) release();
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy, live: true });
    const nx = dx / RADIUS;
    const ny = -dy / RADIUS; // screen up is positive for the movement system
    const strength = Math.hypot(nx, ny);
    if (strength < DEAD_ZONE) setJoystick({ x: 0, y: 0 });
    else setJoystick({ x: nx, y: ny });
  };

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto relative h-32 w-32 select-none rounded-full border border-white/20 bg-stone-900/60 shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
      style={{ touchAction: "none" }}
      role="application"
      aria-label="Movement joystick"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        pointerId.current = e.pointerId;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointerId.current !== e.pointerId) return;
        e.stopPropagation();
        update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (pointerId.current !== e.pointerId) return;
        e.stopPropagation();
        release();
      }}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {/* four soft direction ticks */}
      {[0, 90, 180, 270].map((deg) => (
        <span key={deg} className="absolute left-1/2 top-2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/25" style={{ transformOrigin: "50% 56px", transform: `translateX(-50%) rotate(${deg}deg)` }} />
      ))}
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-white/40 bg-gradient-to-b from-amber-200 to-amber-400 shadow-[0_4px_14px_rgba(0,0,0,0.35),inset_0_-3px_0_rgba(120,70,0,0.25)]"
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px)) scale(${knob.live ? 1.08 : 1})`,
          transition: knob.live ? "transform 40ms linear" : "transform 220ms cubic-bezier(0.3, 1.6, 0.5, 1)",
        }}
      />
    </div>
  );
}
