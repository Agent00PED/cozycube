import type { CSSProperties } from "react";
import { TIMES_OF_DAY, type TimeOfDay } from "@shared/types";
import { TIME_PRESETS } from "../../scene/roomThemes";
import { glass } from "./glass";

interface TimeOfDayBarProps {
  current: TimeOfDay;
  onSelect: (time: TimeOfDay) => void;
}

// The hour is shared room state, like the lights — one person changing it changes it for
// everyone, which is the point: you all sit around the same sunset.
export function TimeOfDayBar({ current, onSelect }: TimeOfDayBarProps) {
  return (
    <div style={styles.bar} role="group" aria-label="Time of day">
      {TIMES_OF_DAY.map((time) => {
        const preset = TIME_PRESETS[time];
        const active = time === current;
        const [icon, ...rest] = preset.label.split(" ");
        return (
          <button
            key={time}
            type="button"
            onClick={() => onSelect(time)}
            aria-pressed={active}
            title={rest.join(" ")}
            style={{ ...styles.button, ...(active ? styles.active : null) }}
          >
            <span style={styles.icon}>{icon}</span>
            <span className="cozy-time-label" style={styles.name}>{rest.join(" ")}</span>
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  bar: { ...glass, display: "flex", gap: 2, padding: 4, borderRadius: 999 },
  button: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    border: "none",
    background: "transparent",
    borderRadius: 999,
    padding: "6px 10px",
    cursor: "pointer",
    color: "#5a4a3a",
    fontFamily: "sans-serif",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
  },
  active: { background: "rgba(255,255,255,0.8)", boxShadow: "0 2px 6px rgba(80,60,40,0.16)" },
  icon: { fontSize: 14 },
  // The labels are the first thing to go when the HUD gets tight; the emoji still reads.
  name: { whiteSpace: "nowrap" },
};
