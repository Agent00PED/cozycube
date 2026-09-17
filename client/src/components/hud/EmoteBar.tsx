import { useEffect, type CSSProperties } from "react";
import { EMOTES } from "@shared/types";
import { glass } from "./glass";

// Six one-tap reactions that float up above your head for everyone. Number keys 1-6 work too.
export function EmoteBar({ onEmote }: { onEmote: (emoji: string) => void }) {
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

  return (
    <div style={styles.bar} role="toolbar" aria-label="Emotes">
      {EMOTES.map((emoji, i) => (
        <button
          key={emoji}
          type="button"
          title={`${emoji}  (${i + 1})`}
          aria-label={`Emote ${emoji}`}
          onClick={() => onEmote(emoji)}
          style={styles.button}
          onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.88)")}
          onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onPointerLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  bar: {
    ...glass,
    display: "flex",
    gap: 4,
    padding: 5,
    borderRadius: 999,
  },
  button: {
    width: "clamp(32px, 9vw, 42px)",
    height: "clamp(32px, 9vw, 42px)",
    borderRadius: "50%",
    border: "none",
    background: "rgba(255,255,255,0.45)",
    fontSize: "clamp(16px, 4.6vw, 21px)",
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
    transition: "transform 110ms ease",
  },
};
