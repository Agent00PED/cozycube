import { useEffect, useState, type CSSProperties } from "react";
import { requestRecenter, subscribeFreeLook } from "../../scene/cameraFocus";
import { glass, hudText } from "./glass";

// Only visible while the camera has been dragged off the player. Free look is easy to enter by
// accident (a stray right-drag), so there has to be an obvious way back.
export function RecenterButton() {
  const [free, setFree] = useState(false);
  useEffect(() => subscribeFreeLook(setFree), []);

  return (
    <button
      type="button"
      onClick={requestRecenter}
      title="Recenter on your character"
      aria-label="Recenter camera on your character"
      style={{
        ...styles.button,
        opacity: free ? 1 : 0,
        transform: free ? "scale(1)" : "scale(0.7)",
        pointerEvents: free ? "auto" : "none",
      }}
    >
      <span style={styles.icon}>◎</span>
      <span style={styles.label}>Recenter</span>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  button: {
    ...glass,
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.55)",
    cursor: "pointer",
    transition: "opacity 160ms ease, transform 160ms ease",
  },
  icon: { fontSize: 15, lineHeight: 1, color: "#c4713a" },
  label: { ...hudText, fontSize: 12, fontWeight: 700 },
};
