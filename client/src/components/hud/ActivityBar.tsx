import type { CSSProperties } from "react";
import { TOAST_MAX, type ChairSyncState, type PlayerState } from "@shared/types";
import { isFishingSeat } from "@shared/props";
import { glass, hudText, pillButton } from "./glass";

interface ActivityBarProps {
  player: PlayerState;
  chairs: Record<string, ChairSyncState>;
  localSessionId: string;
  onRoast: () => void;
  onEat: () => void;
  onSip: () => void;
  onPutDown: () => void;
  onCastLine: () => void;
  onReelIn: () => void;
}

function doneness(toast: number): { label: string; color: string } {
  if (toast < 0.35) return { label: "Raw", color: "#b8ad98" };
  if (toast < 0.8) return { label: "Toasty", color: "#d9b36b" };
  if (toast <= 1.15) return { label: "Golden ✨", color: "#d9974a" };
  if (toast < 1.45) return { label: "Very dark…", color: "#8a5a36" };
  return { label: "Burnt! 🔥", color: "#5a3a2a" };
}

// Context-sensitive actions: only what you can do right now, right here.
export function ActivityBar({ player, chairs, localSessionId, onRoast, onEat, onSip, onPutDown, onCastLine, onReelIn }: ActivityBarProps) {
  const onLog = player.sitting && Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.style === "log");
  const roasting = player.holding === "marshmallow";
  const holdingCoffee = player.holding === "coffee";
  const brewing = player.action === "brew";
  const onPier = player.sitting && Object.values(chairs).some((c) => c.occupiedBy === localSessionId && isFishingSeat(c.propId));
  const fishing = player.action === "fish";

  if (!onLog && !roasting && !holdingCoffee && !brewing && !onPier) return null;

  const d = doneness(player.toast);

  return (
    <div style={styles.bar}>
      {brewing && <span style={styles.status}>☕ Brewing… {Math.round(player.actionProgress * 100)}%</span>}

      {onPier && !fishing && (
        <button type="button" style={styles.primary} onClick={onCastLine}>
          🎣 Cast a line
        </button>
      )}
      {fishing && (
        <>
          <span style={styles.status}>🎣 Waiting for a bite…</span>
          <button type="button" style={styles.ghost} onClick={onReelIn}>
            Reel in
          </button>
        </>
      )}

      {onLog && !roasting && (
        <button type="button" style={styles.primary} onClick={onRoast}>
          🍡 Roast a marshmallow
        </button>
      )}

      {roasting && (
        <>
          <div style={styles.meterWrap} aria-label={`Marshmallow: ${d.label}`}>
            <div style={styles.meterTrack}>
              {/* the sweet spot */}
              <div style={{ ...styles.sweetSpot, left: `${(0.8 / TOAST_MAX) * 100}%`, width: `${(0.35 / TOAST_MAX) * 100}%` }} />
              <div style={{ ...styles.meterFill, width: `${(player.toast / TOAST_MAX) * 100}%`, background: d.color }} />
            </div>
            <span style={styles.meterLabel}>{d.label}</span>
          </div>
          <button type="button" style={styles.primary} onClick={onEat}>
            😋 Eat it
          </button>
        </>
      )}

      {holdingCoffee && !roasting && (
        <>
          <button type="button" style={styles.secondary} onClick={onSip}>
            ☕ Sip
          </button>
          <button type="button" style={styles.ghost} onClick={onPutDown}>
            Put down
          </button>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  bar: {
    ...glass,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 6,
    borderRadius: 999,
    maxWidth: "calc(100vw - 24px)",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  status: { ...hudText, fontSize: 13, fontWeight: 600, padding: "0 10px" },
  primary: { ...pillButton, background: "#f4a15c", color: "#3a2415", boxShadow: "0 2px 8px rgba(244,161,92,0.45)" },
  secondary: { ...pillButton, background: "rgba(255,255,255,0.75)" },
  ghost: { ...pillButton, background: "transparent", fontWeight: 500 },
  meterWrap: { display: "flex", alignItems: "center", gap: 8, padding: "0 6px 0 10px" },
  meterTrack: {
    position: "relative",
    width: "clamp(80px, 22vw, 130px)",
    height: 10,
    borderRadius: 999,
    background: "rgba(74,58,44,0.18)",
    overflow: "hidden",
  },
  sweetSpot: { position: "absolute", top: 0, bottom: 0, background: "rgba(255, 215, 120, 0.55)" },
  meterFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, transition: "width 120ms linear" },
  meterLabel: { ...hudText, fontSize: 12, fontWeight: 700, minWidth: 74 },
};
