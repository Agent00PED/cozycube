import type { CSSProperties } from "react";
import { glass, hudText } from "./glass";

interface SoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

// Ambience starts off on purpose: browsers block audio until a gesture anyway, and an Activity
// that starts making noise the moment it opens is the kind of thing people close the tab over.
export function SoundToggle({ enabled, onToggle }: SoundToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      title={enabled ? "Mute the room" : "Play this room's ambience"}
      style={{ ...styles.chip, ...(enabled ? styles.on : null) }}
    >
      <span style={styles.icon}>{enabled ? "🔊" : "🔇"}</span>
      <span className="cozy-hud-label" style={styles.label}>
        {enabled ? "Ambience" : "Sound off"}
      </span>
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
  },
  on: { background: "rgba(214, 240, 255, 0.75)" },
  icon: { fontSize: 13, lineHeight: 1 },
  label: { ...hudText, fontSize: 12, fontWeight: 600 },
};
