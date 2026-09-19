import { useEffect, useState, type CSSProperties } from "react";
import { ACTIVITY_STATUSES, isActivityStatus, type PlayerState } from "@shared/types";
import { lookAtTemporarily } from "../../scene/cameraFocus";
import { glass, hudText } from "./glass";

interface PlayerRosterProps {
  players: Record<string, PlayerState>;
  localSessionId: string | null;
  speakingUserIds: ReadonlySet<string>;
}

const COMPACT_BELOW = 640;

function statusIcon(p: PlayerState): string {
  if (isActivityStatus(p.status)) return ACTIVITY_STATUSES[p.status].emoji;
  if (p.action === "fish" || p.action === "afkfish") return "🎣";
  if (p.holding === "marshmallow") return "🍡";
  if (p.action === "brew") return "⏳";
  if (p.holding === "coffee") return "☕";
  if (p.sitting) return p.sitPose === "lie" ? "🌙" : "🪑";
  return "";
}

// Who's here, what they're up to, and who's talking. Tap a friend to glance over at them — on a
// 28x28 map, "where is everyone?" is the first question people ask.
export function PlayerRoster({ players, localSessionId, speakingUserIds }: PlayerRosterProps) {
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= COMPACT_BELOW);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < COMPACT_BELOW) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const list = Object.values(players)
    .filter((p) => p.connected)
    .sort((a, b) => (a.sessionId === localSessionId ? -1 : b.sessionId === localSessionId ? 1 : a.username.localeCompare(b.username)));

  return (
    <div style={styles.panel}>
      <button type="button" style={styles.header} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>👥 {list.length} here</span>
        <span style={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <ul style={styles.list}>
          {list.map((p) => {
            const speaking = p.speaking || speakingUserIds.has(p.userId);
            const isMe = p.sessionId === localSessionId;
            return (
              <li key={p.sessionId}>
                <button
                  type="button"
                  style={styles.row}
                  onClick={() => lookAtTemporarily(p.x, p.z)}
                  title={isMe ? "That's you" : `Look at ${p.username}`}
                >
                  <span
                    style={{
                      ...styles.swatch,
                      background: p.color,
                      boxShadow: speaking ? "0 0 0 2px #fff, 0 0 0 4px #43d17a" : "0 0 0 2px rgba(255,255,255,0.8)",
                    }}
                  />
                  <span style={styles.name}>
                    {p.username}
                    {isMe && <span style={styles.you}> (you)</span>}
                  </span>
                  <span style={styles.icon}>{speaking ? "🔊" : statusIcon(p)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: { ...glass, borderRadius: 18, padding: 4, minWidth: 140, maxWidth: "min(240px, 46vw)" },
  header: {
    ...hudText,
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    border: "none",
    background: "transparent",
    padding: "6px 10px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  chevron: { opacity: 0.6 },
  list: { listStyle: "none", margin: 0, padding: "0 2px 4px", maxHeight: "40vh", overflowY: "auto" },
  row: {
    ...hudText,
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    background: "rgba(255,255,255,0.35)",
    borderRadius: 999,
    padding: "5px 10px",
    marginTop: 3,
    cursor: "pointer",
    fontSize: 12,
    textAlign: "left",
  },
  swatch: { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 },
  name: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 },
  you: { fontWeight: 400, opacity: 0.6 },
  icon: { width: 18, textAlign: "center" },
};
