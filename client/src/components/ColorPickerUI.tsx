import type { CSSProperties } from "react";

interface ColorPickerUIProps {
  currentColor: string;
  onSelect: (color: string) => void;
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

export function ColorPickerUI({ currentColor, onSelect }: ColorPickerUIProps) {
  return (
    <div style={styles.container}>
      {PRESET_COLORS.map((color) => {
        const isActive = currentColor.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            onClick={() => onSelect(color)}
            aria-label={`Set color ${color}`}
            style={{
              ...styles.swatch,
              backgroundColor: color,
              outline: isActive ? "3px solid #ffffff" : "2px solid rgba(255,255,255,0.5)",
              transform: isActive ? "scale(1.15)" : "scale(1)",
            }}
          />
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: "absolute",
    bottom: "max(20px, env(safe-area-inset-bottom))",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    padding: "10px 14px",
    maxWidth: "calc(100vw - 24px)",
    borderRadius: 999,
    background: "rgba(255, 250, 240, 0.55)",
    backdropFilter: "blur(14px) saturate(160%)",
    WebkitBackdropFilter: "blur(14px) saturate(160%)",
    border: "1px solid rgba(255,255,255,0.5)",
    boxShadow: "0 8px 24px rgba(80, 60, 40, 0.18)",
    zIndex: 10,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    padding: 0,
    transition: "transform 120ms ease",
    flexShrink: 0,
  },
};
