import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EMOTES, GESTURES, GESTURE_EMOJI, type Gesture } from "@shared/types";
import { glass } from "./glass";
import { playClick } from "../../audio/sfx";

const GESTURE_LABELS: Record<Gesture, string> = { wave: "Wave", dance: "Dance", cheers: "Cheers", nap: "Nap" };

// A single small "✨" button in the corner instead of a row of ten buttons parked on the bottom
// of the screen. It opens a tray of reactions (keys 1-6 still work while it is closed) and
// gestures, which folds away after a pick or a click anywhere else.
export function EmoteBar({ onEmote, onGesture }: { onEmote: (emoji: string) => void; onGesture: (g: Gesture) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Escape") setOpen(false);
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < EMOTES.length && !e.repeat) onEmote(EMOTES[index]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEmote]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} style={styles.root}>
      <div className={open ? "cozy-tray cozy-tray-open" : "cozy-tray"} style={styles.tray} role="toolbar" aria-label="Emotes and gestures" aria-hidden={!open}>
        <div style={styles.grid}>
          {EMOTES.map((emoji, i) => (
            <button
              key={emoji}
              type="button"
              title={`${emoji}  (${i + 1})`}
              aria-label={`Emote ${emoji}`}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                onEmote(emoji);
                setOpen(false);
              }}
              style={styles.button}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div style={styles.sep} />
        <div style={styles.gestures}>
          {GESTURES.map((g) => (
            <button
              key={g}
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                playClick();
                onGesture(g);
                setOpen(false);
              }}
              style={styles.gesture}
            >
              <span style={{ fontSize: 17 }}>{GESTURE_EMOJI[g]}</span>
              {GESTURE_LABELS[g]}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        style={{ ...styles.fab, ...(open ? styles.fabOpen : null) }}
        onClick={() => {
          playClick();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        title="Emotes and actions"
      >
        <span style={{ fontSize: 17 }}>✨</span>
        <span className="cozy-hud-label">Emotes</span>
      </button>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: "absolute",
    left: "max(16px, env(safe-area-inset-left))",
    bottom: "max(16px, env(safe-area-inset-bottom))",
    zIndex: 12,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  },
  tray: {
    ...glass,
    background: "rgba(255, 250, 240, 0.82)",
    borderRadius: 20,
    padding: 8,
    width: 236,
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 },
  button: { height: 34, borderRadius: 12, border: "none", background: "rgba(255,255,255,0.6)", fontSize: 19, cursor: "pointer", padding: 0 },
  sep: { height: 1, margin: "7px 4px", background: "rgba(90,74,58,0.18)" },
  gestures: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 },
  gesture: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    borderRadius: 12,
    background: "rgba(236,127,163,0.18)",
    color: "#7a3350",
    fontFamily: "system-ui, sans-serif",
    fontSize: 12.5,
    fontWeight: 700,
    padding: "8px 10px",
    cursor: "pointer",
  },
  fab: {
    ...glass,
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    padding: "10px 15px",
    cursor: "pointer",
    color: "#5a4a3a",
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 700,
    transition: "transform 150ms ease, background 150ms ease",
  },
  fabOpen: { background: "rgba(255, 226, 196, 0.85)", transform: "scale(0.96)" },
};
