import type { CSSProperties } from "react";
import type { VoiceMode } from "../../hooks/useVoiceActivity";
import { glass, hudText } from "./glass";

interface VoiceChipProps {
  mode: VoiceMode;
  active: boolean;
  onPressChange: (pressed: boolean) => void;
}

// In Discord the speaking rings are driven by real voice activity, so this is just a quiet
// status chip. Outside Discord (local testing) it becomes a push-to-talk preview button: hold it,
// or hold V, to light up your own ring for everyone in the room.
export function VoiceChip({ mode, active, onPressChange }: VoiceChipProps) {
  if (mode === "discord") {
    return (
      <div style={{ ...styles.chip, cursor: "default" }} title="Speaking indicators follow your Discord voice activity">
        <span style={{ ...styles.dot, background: "#43d17a" }} />
        <span style={styles.label}>Voice linked</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      style={{ ...styles.chip, ...(active ? styles.chipActive : null) }}
      title="Not running inside Discord — hold this (or V) to preview the speaking indicator"
      aria-pressed={active}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPressChange(true);
      }}
      onPointerUp={() => onPressChange(false)}
      onPointerCancel={() => onPressChange(false)}
    >
      <span style={{ ...styles.dot, background: active ? "#43d17a" : "#b8ad98" }} />
      <span style={styles.label}>{active ? "Talking…" : "Hold V to talk"}</span>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  chip: {
    ...glass,
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.5)",
    cursor: "pointer",
    touchAction: "none",
    userSelect: "none",
  },
  chipActive: { background: "rgba(214, 255, 226, 0.75)" },
  dot: { width: 9, height: 9, borderRadius: "50%", boxShadow: "0 0 0 3px rgba(255,255,255,0.6)" },
  label: { ...hudText, fontSize: 12, fontWeight: 600 },
};
