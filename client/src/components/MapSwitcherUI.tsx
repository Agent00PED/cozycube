import type { CSSProperties } from "react";
import type { MapId } from "@shared/types";

interface MapSwitcherUIProps {
  currentMap: MapId;
  disabled: boolean;
  onSelect: (mapId: MapId) => void;
}

const MAP_LABELS: Record<MapId, string> = {
  cozy_lounge: "🛋️ Cozy Lounge",
  campfire_night: "🔥 Campfire",
  sunset_beach: "🏖️ Beach Bar",
};

const MAP_IDS = Object.keys(MAP_LABELS) as MapId[];

export function MapSwitcherUI({ currentMap, disabled, onSelect }: MapSwitcherUIProps) {
  return (
    <div style={styles.container}>
      {MAP_IDS.map((mapId) => {
        const isActive = mapId === currentMap;
        return (
          <button
            key={mapId}
            type="button"
            disabled={disabled || isActive}
            onClick={() => onSelect(mapId)}
            style={{
              ...styles.button,
              ...(isActive ? styles.active : {}),
              cursor: disabled || isActive ? "default" : "pointer",
            }}
          >
            {MAP_LABELS[mapId]}
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: "absolute",
    top: "max(16px, env(safe-area-inset-top))",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 6,
    padding: 6,
    borderRadius: 999,
    background: "rgba(255, 250, 240, 0.55)",
    backdropFilter: "blur(14px) saturate(160%)",
    WebkitBackdropFilter: "blur(14px) saturate(160%)",
    border: "1px solid rgba(255,255,255,0.5)",
    boxShadow: "0 8px 24px rgba(80, 60, 40, 0.18)",
    zIndex: 10,
    maxWidth: "calc(100vw - 24px)",
  },
  button: {
    padding: "8px 14px",
    borderRadius: 999,
    border: "none",
    background: "rgba(255,255,255,0.4)",
    color: "#5a4a3a",
    fontFamily: "sans-serif",
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    transition: "background 150ms ease, transform 150ms ease",
  },
  active: {
    background: "#f4a15c",
    color: "#3a2415",
    fontWeight: 700,
    boxShadow: "0 2px 8px rgba(244, 161, 92, 0.5)",
  },
};
