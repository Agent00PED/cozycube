import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BOXING_BOUT_KOS, BOXING_KNOCKDOWN_HITS, BOXING_REACH, BOXING_TIP, PUNCH_COOLDOWN_MS, type PlayerState } from "@shared/types";
import { hudText, pillButton } from "./glass";

interface Props {
  me: PlayerState;
  players: Record<string, PlayerState>;
  onPunch: (target: string) => void;
  onExit: () => void;
  onToss: (to: string) => void;
}

// The ring's controls. Gloved: a big swing button aimed at the nearest opponent in reach, your
// guard (hits taken this round) and knockdowns scored. Ringside: toss a coin to a fighter you
// like. The server keeps score (boxing_punch -> punch / boxingResult).
export function BoxingHud({ me, players, onPunch, onExit, onToss }: Props) {
  const [cool, setCool] = useState(0);
  const lastRef = useRef(0);
  useEffect(() => {
    if (!cool) return;
    const t = window.setTimeout(() => setCool(0), cool);
    return () => window.clearTimeout(t);
  }, [cool]);

  const fighters = Object.values(players).filter((p) => p.gloves && p.connected && p.sessionId !== me.sessionId);
  if (!me.gloves) {
    if (fighters.length === 0) return null;
    return (
      <div style={styles.row}>
        {fighters.slice(0, 2).map((f) => (
          <button key={f.sessionId} type="button" style={styles.tip} disabled={me.coins < BOXING_TIP} onClick={() => (onToss(f.sessionId))}>
            🪙 Toss coin to {f.username} · {BOXING_TIP}
          </button>
        ))}
      </div>
    );
  }

  const nearest = fighters.map((f) => ({ f, d: Math.hypot(f.x - me.x, f.z - me.z) })).sort((a, b) => a.d - b.d)[0];
  const inReach = !!nearest && nearest.d <= BOXING_REACH;
  const dizzy = me.action === "dizzy";
  const swing = () => {
    if (!nearest || !inReach || dizzy) return;
    const now = performance.now();
    if (now - lastRef.current < PUNCH_COOLDOWN_MS) return;
    lastRef.current = now;
    setCool(PUNCH_COOLDOWN_MS);
    onPunch(nearest.f.sessionId);
  };

  return (
    <div style={styles.panel}>
      <div style={styles.stats}>
        <span title="Hits taken this round">
          🛡️ {Array.from({ length: BOXING_KNOCKDOWN_HITS }, (_, i) => (i < BOXING_KNOCKDOWN_HITS - me.boxHits ? "❤️" : "🤍")).join("")}
        </span>
        <span title="Knockdowns scored">
          🏆 {me.boxKOs}/{BOXING_BOUT_KOS}
        </span>
      </div>
      <button type="button" className="cozy-action" style={{ ...styles.swing, opacity: inReach && !dizzy && !cool ? 1 : 0.55 }} disabled={!inReach || dizzy || !!cool} onClick={swing}>
        {dizzy ? "😵 Seeing birds…" : !nearest ? "🥊 Waiting for a challenger" : inReach ? `👊 Swing at ${nearest.f.username}` : `🥊 Get closer to ${nearest.f.username}`}
      </button>
      <button type="button" style={styles.ghost} onClick={() => (onExit())}>
        Leave the ring
      </button>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center", pointerEvents: "auto" },
  row: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", pointerEvents: "auto" },
  stats: { ...pillButton, ...hudText, display: "flex", gap: 12, fontSize: 14, fontWeight: 800, padding: "10px 14px", minHeight: 48, cursor: "default" },
  swing: {
    ...pillButton,
    ...hudText,
    fontSize: 16,
    fontWeight: 900,
    padding: "12px 22px",
    minHeight: 48,
    color: "#fff3f0",
    background: "linear-gradient(180deg, #ff7a6b 0%, #d63a48 100%)",
    border: "2px solid #ffd0c8",
    boxShadow: "0 4px 16px rgba(214, 58, 72, 0.55)",
  },
  ghost: { ...pillButton, ...hudText, fontSize: 13, fontWeight: 700, padding: "10px 16px", minHeight: 48 },
  tip: {
    ...pillButton,
    ...hudText,
    fontSize: 14,
    fontWeight: 800,
    padding: "10px 18px",
    minHeight: 48,
    color: "#4a2a08",
    background: "linear-gradient(180deg, #ffe08a 0%, #f5b93a 100%)",
    border: "2px solid #fff3c4",
  },
};
