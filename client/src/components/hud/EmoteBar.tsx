import { useEffect, type CSSProperties } from "react";
import { EMOTES, GESTURES, GESTURE_EMOJI, type Gesture } from "@shared/types";
import { glass } from "./glass";

const GESTURE_LABELS: Record<Gesture, string> = { wave: "Wave", dance: "Dance", cheers: "Cheers", nap: "Nap" };

// Six one-tap reactions that float up above your head for everyone (number keys 1-6), then the
// full-body gestures — wave, dance, cheers, nap — which your character acts out.
export function EmoteBar({ onEmote, onGesture }: { onEmote: (emoji: string) => void; onGesture: (g: Gesture) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < EMOTES.length && !e.repeat) onEmote(EMOTES[index]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEmote]);

  const press = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => (e.currentTarget.style.transform = "scale(0.88)"),
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => (e.currentTarget.style.transform = "scale(1)"),
    onPointerLeave: (e: React.PointerEvent<HTMLButtonElement>) => (e.currentTarget.style.transform = "scale(1)"),
  };

  return (
    <div style={styles.bar} role="toolbar" aria-label="Emotes and gestures">
      {EMOTES.map((emoji, i) => (
        <button key={emoji} type="button" title={`${emoji}  (${i + 1})`} aria-label={`Emote ${emoji}`} onClick={() => onEmote(emoji)} style={styles.button} {...press}>
          {emoji}
        </button>
      ))}
      <span style={styles.divider} aria-hidden />
      {GESTURES.map((g) => (
        <button key={g} type="button" title={GESTURE_LABELS[g]} aria-label={GESTURE_LABELS[g]} onClick={() => onGesture(g)} style={{ ...styles.button, ...styles.gesture }} {...press}>
          {GESTURE_EMOJI[g]}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  bar: {
    ...glass,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
    padding: 5,
    borderRadius: 26,
    maxWidth: "calc(100vw - 24px)",
  },
  button: {
    width: "clamp(30px, 8.4vw, 40px)",
    height: "clamp(30px, 8.4vw, 40px)",
    borderRadius: "50%",
    border: "none",
    background: "rgba(255,255,255,0.45)",
    fontSize: "clamp(15px, 4.3vw, 20px)",
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
    transition: "transform 110ms ease",
  },
  gesture: { background: "rgba(236,127,163,0.22)" },
  divider: { width: 1, alignSelf: "stretch", margin: "4px 2px", background: "rgba(90,74,58,0.22)" },
};
