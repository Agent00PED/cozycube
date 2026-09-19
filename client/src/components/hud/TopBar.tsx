import { useEffect, useRef, useState, type CSSProperties } from "react";
import { TIMES_OF_DAY, type MapId, type TimeOfDay } from "@shared/types";
import { TIME_PRESETS } from "../../scene/roomThemes";
import { glass } from "./glass";
import { playClick, playCoin } from "../../audio/sfx";

interface TopBarProps {
  currentMap: MapId;
  mapDisabled: boolean;
  onSelectMap: (mapId: MapId) => void;
  timeOfDay: TimeOfDay;
  onSelectTime: (time: TimeOfDay) => void;
  onOpenWardrobe: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  coins: number;
  autoCycle: boolean;
  onToggleAutoCycle: () => void;
}

const MAP_LABELS: Record<MapId, { icon: string; name: string }> = {
  cozy_lounge: { icon: "🛋️", name: "Lounge" },
  campfire_night: { icon: "🔥", name: "Campfire" },
  sunset_beach: { icon: "🏖️", name: "Beach Bar" },
  velvet_casino: { icon: "🎰", name: "Casino" },
};
const MAP_IDS = Object.keys(MAP_LABELS) as MapId[];

// One bar for both the place and the hour. They used to be two stacked bars that overlapped
// the roster and each other on a narrow Discord window; as one row with icon-only labels
// below 720px they fit a phone.
export function TopBar({ currentMap, mapDisabled, onSelectMap, timeOfDay, onSelectTime, onOpenWardrobe, soundOn, onToggleSound, coins, autoCycle, onToggleAutoCycle }: TopBarProps) {
  return (
    <div className="cozy-topbar" style={styles.bar}>
      <div style={styles.group} role="group" aria-label="Place">
        {MAP_IDS.map((mapId) => {
          const active = mapId === currentMap;
          return (
            <button
              key={mapId}
              type="button"
              disabled={mapDisabled || active}
              onClick={() => {
                playClick();
                onSelectMap(mapId);
              }}
              aria-pressed={active}
              title={MAP_LABELS[mapId].name}
              style={{
                ...styles.button,
                ...(active ? styles.activeMap : null),
                cursor: mapDisabled || active ? "default" : "pointer",
              }}
            >
              <span style={styles.icon}>{MAP_LABELS[mapId].icon}</span>
              <span className="cozy-hud-label">{MAP_LABELS[mapId].name}</span>
            </button>
          );
        })}
      </div>

      <span style={styles.divider} aria-hidden />

      <div style={styles.group} role="group" aria-label="Time of day">
        {TIMES_OF_DAY.map((time) => {
          const preset = TIME_PRESETS[time];
          const [icon, ...rest] = preset.label.split(" ");
          const name = rest.join(" ");
          const active = time === timeOfDay && !autoCycle;
          return (
            <button
              key={time}
              type="button"
              onClick={() => {
                playClick();
                onSelectTime(time);
              }}
              aria-pressed={active}
              title={name}
              style={{ ...styles.button, ...(active ? styles.activeTime : null) }}
            >
              <span style={styles.icon}>{icon}</span>
              <span className="cozy-hud-label">{name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            playClick();
            onToggleAutoCycle();
          }}
          aria-pressed={autoCycle}
          title="Auto Cycle: the hours roll by on their own"
          style={{ ...styles.button, ...(autoCycle ? styles.activeTime : null) }}
        >
          <span style={styles.icon}>⏱️</span>
          <span className="cozy-hud-label">Auto</span>
        </button>
      </div>

      <span style={styles.divider} aria-hidden />

      <div style={styles.group}>
        <CoinCounter coins={coins} />
        <button type="button" onClick={onOpenWardrobe} title="Wardrobe" style={{ ...styles.button, ...styles.wardrobe }}>
          <span style={styles.icon}>👗</span>
          <span className="cozy-hud-label">Wardrobe</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onToggleSound();
            playClick();
          }}
          aria-pressed={soundOn}
          title={soundOn ? "Mute the room" : "Play this room's ambience"}
          style={{ ...styles.button, ...(soundOn ? styles.activeTime : null) }}
        >
          <span style={styles.icon}>{soundOn ? "🔊" : "🔇"}</span>
        </button>
      </div>
    </div>
  );
}

/** The wallet: pops and chimes whenever it goes up. */
function CoinCounter({ coins }: { coins: number }) {
  const prev = useRef(coins);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (coins > prev.current) {
      setBump((b) => b + 1);
      playCoin();
    }
    prev.current = coins;
  }, [coins]);
  return (
    <span key={bump} className={bump ? "cozy-coin-bump" : undefined} style={styles.coins} title="Your coins">
      <span style={styles.icon}>🪙</span>
      {coins}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  bar: {
    ...glass,
    position: "absolute",
    top: "max(12px, env(safe-area-inset-top))",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: 5,
    borderRadius: 999,
    zIndex: 10,
    maxWidth: "calc(100vw - 20px)",
  },
  group: { display: "flex", gap: 2 },
  divider: { width: 1, alignSelf: "stretch", margin: "4px 4px", background: "rgba(90,74,58,0.22)" },
  button: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    border: "none",
    background: "transparent",
    borderRadius: 999,
    padding: "7px 11px",
    cursor: "pointer",
    color: "#5a4a3a",
    fontFamily: "sans-serif",
    fontSize: 12.5,
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  activeMap: { background: "#f4a15c", color: "#3a2415", fontWeight: 700, boxShadow: "0 2px 8px rgba(244,161,92,0.45)" },
  activeTime: { background: "rgba(255,255,255,0.85)", boxShadow: "0 2px 6px rgba(80,60,40,0.16)" },
  icon: { fontSize: 14 },
  wardrobe: { background: "rgba(236,127,163,0.16)", color: "#9c3f62" },
  coins: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 11px",
    borderRadius: 999,
    background: "rgba(255, 214, 102, 0.35)",
    color: "#6b4a10",
    fontFamily: "sans-serif",
    fontSize: 12.5,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
};
