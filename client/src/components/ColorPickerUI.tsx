import { useEffect, useRef, useState, type CSSProperties } from "react";

interface ColorPickerUIProps {
  currentColor: string;
  onSelect: (color: string) => void;
  /** Laid out by a parent stack (the bottom-right corner group) rather than positioning itself. */
  inline?: boolean;
}

// Pastel + warm earth tones — matches the clay-doll character material better than saturated
// primaries did.
const PRESET_COLORS = [
  "#e8a598", // dusty rose
  "#f0c290", // sandy peach
  "#e8d5a8", // wheat
  "#a8c8a0", // sage green
  "#8fb8b0", // seafoam
  "#9ab8d8", // powder blue
  "#b8a8d0", // lilac
  "#d8a8c0", // dusty pink
  "#c8b090", // tan
  "#f5ede0", // cream
];

// A single floating puck in the bottom-right corner instead of a wide palette bar, so the
// 3D scene stays unobstructed. Tapping it opens a compact swatch grid that closes again as
// soon as a color is chosen or anything outside it is clicked.
export function ColorPickerUI({ currentColor, onSelect, inline = false }: ColorPickerUIProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // "pointerdown" (not "click") so the popover closes on the same gesture that would
    // otherwise fall through to the canvas and fire a click-to-move.
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={inline ? styles.inlineRoot : styles.root}>
      {open && (
        <div style={styles.popover} role="listbox" aria-label="Character color">
          {PRESET_COLORS.map((color) => {
            const isActive = currentColor.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                role="option"
                aria-selected={isActive}
                aria-label={`Set color ${color}`}
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
                style={{
                  ...styles.swatch,
                  backgroundColor: color,
                  outline: isActive ? "3px solid #ffffff" : "2px solid rgba(255,255,255,0.45)",
                  transform: isActive ? "scale(1.12)" : "scale(1)",
                }}
              />
            );
          })}
        </div>
      )}

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change character color"
        onClick={() => setOpen((v) => !v)}
        style={styles.trigger}
      >
        <span style={{ ...styles.triggerDot, backgroundColor: currentColor }} />
      </button>
    </div>
  );
}

const glass: CSSProperties = {
  background: "rgba(255, 250, 240, 0.55)",
  backdropFilter: "blur(14px) saturate(160%)",
  WebkitBackdropFilter: "blur(14px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.5)",
  boxShadow: "0 8px 24px rgba(80, 60, 40, 0.18)",
};

const styles: Record<string, CSSProperties> = {
  root: {
    position: "absolute",
    right: "max(18px, env(safe-area-inset-right))",
    bottom: "max(18px, env(safe-area-inset-bottom))",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 10,
    zIndex: 10,
  },
  inlineRoot: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
  },
  popover: {
    ...glass,
    display: "grid",
    gridTemplateColumns: "repeat(5, auto)",
    gap: 8,
    padding: 12,
    borderRadius: 20,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    padding: 0,
    transition: "transform 120ms ease",
  },
  trigger: {
    ...glass,
    width: 52,
    height: 52,
    borderRadius: "50%",
    padding: 0,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  triggerDot: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    boxShadow: "inset 0 -2px 5px rgba(0,0,0,0.18), 0 0 0 2px rgba(255,255,255,0.7)",
  },
};
