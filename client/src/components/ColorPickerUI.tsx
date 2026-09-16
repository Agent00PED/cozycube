import type { CSSProperties } from "react";

interface ColorPickerUIProps {
  currentColor: string;
  onSelect: (color: string) => void;
}

const PRESET_COLORS = [
  "#ff6b6b",
  "#ffa94d",
  "#ffd43b",
  "#69db7c",
  "#38d9a9",
  "#22e6ff",
  "#4dabf7",
  "#9775fa",
  "#f783ac",
  "#ffffff",
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
              outline: isActive ? "3px solid #ffffff" : "2px solid rgba(255,255,255,0.35)",
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
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 16,
    background: "rgba(20, 20, 30, 0.6)",
    backdropFilter: "blur(6px)",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    zIndex: 10,
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
};
