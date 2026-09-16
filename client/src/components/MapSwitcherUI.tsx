import type { CSSProperties } from "react";
import type { MapId } from "@shared/types";

interface MapSwitcherUIProps {
  currentMap: MapId;
  disabled: boolean;
  onSelect: (mapId: MapId) => void;
}

const MAP_LABELS: Record<MapId, string> = {
  cozy_bedroom: "Cozy Bedroom",
  cyber_lounge: "Cyber Lounge",
  chill_lounge: "Chill Lounge",
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
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 6,
    padding: "6px",
    borderRadius: 12,
    background: "rgba(20, 20, 30, 0.6)",
    backdropFilter: "blur(6px)",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    zIndex: 10,
  },
  button: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "none",
    background: "rgba(255,255,255,0.08)",
    color: "#e8e8f0",
    fontFamily: "sans-serif",
    fontSize: 13,
  },
  active: {
    background: "#4dabf7",
    color: "#0e0e16",
    fontWeight: 600,
  },
};
