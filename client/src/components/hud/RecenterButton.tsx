import { useEffect, useState, type CSSProperties } from "react";
import { requestRecenter, subscribeFreeLook } from "../../scene/cameraFocus";

// A round white button in the bottom-right corner with a reticle on it, shown only while the
// camera has been dragged off the player. Free look is easy to enter by accident (a stray
// right-drag), so there has to be one obvious way back — and no button in the way when there
// is nothing to go back from.
export function RecenterButton() {
  const [free, setFree] = useState(false);
  useEffect(() => subscribeFreeLook(setFree), []);

  return (
    <button
      type="button"
      onClick={requestRecenter}
      title="Recenter on your character"
      aria-label="Recenter camera on your character"
      aria-hidden={!free}
      style={{
        ...styles.button,
        opacity: free ? 1 : 0,
        transform: free ? "scale(1)" : "scale(0.6)",
        pointerEvents: free ? "auto" : "none",
      }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
        {/* a reticle around a little figure */}
        <circle cx="12" cy="12" r="6.2" stroke="#ffffff" strokeWidth="1.8" />
        <path d="M12 1.6v3.2M12 19.2v3.2M1.6 12h3.2M19.2 12h3.2" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="10.1" r="1.7" fill="#ffffff" />
        <path d="M9.2 15.4c0-1.7 1.3-2.9 2.8-2.9s2.8 1.2 2.8 2.9z" fill="#ffffff" />
      </svg>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  button: {
    width: 46,
    height: 46,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.85)",
    background: "#ec7fa3",
    boxShadow: "0 6px 18px rgba(236,127,163,0.45)",
    cursor: "pointer",
    transition: "opacity 160ms ease, transform 160ms ease",
    padding: 0,
  },
};
