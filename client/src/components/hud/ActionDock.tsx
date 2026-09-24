import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ChairSyncState, MapId, PlayerState, ToggleableSyncState } from "@shared/types";
import { APPROACH_POINTS, mochiSpot } from "@shared/props";
import { MOCHI_REACH, SEAT_REACH } from "@shared/worlds/lounge";
import { cameraFocus } from "../../scene/cameraFocus";
import { interactBridge } from "../../scene/interactBridge";
import { glass, hudText, pillButton } from "./glass";

// The action dock: a floating pill at the bottom-centre that offers exactly what you can do right
// now, and does exactly what clicking it in the scene does.
//
//   [🛋️ Sit]        within SEAT_REACH (1.5) of a free seat, measured to the seat or its approach point
//   [🐾 Pet Mochi]  as you approach her (she wanders, so it is measured to where she is right now)
//   [🧍 Stand up]   while you are sitting
//
// Buttons are deduplicated by action type: only the nearest target of each type gets one, so
// three stools side by side give one "Sit", not three.

interface Action {
  key: string;
  type: "sit" | "pet" | "stand";
  label: string;
  run: () => void;
}

interface DockProps {
  player: PlayerState;
  mapId: MapId;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string;
}

const SCAN_MS = 120;

export function ActionDock({ player, mapId, chairs, toggleables, localSessionId }: DockProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const latest = useRef({ chairs, toggleables, mapId, localSessionId, sitting: player.sitting });
  latest.current = { chairs, toggleables, mapId, localSessionId, sitting: player.sitting };

  useEffect(() => {
    let lastKey = "";
    const scan = () => {
      const { chairs, toggleables, mapId, localSessionId, sitting } = latest.current;
      const found: Action[] = [];

      if (sitting) {
        found.push({ key: "stand", type: "stand", label: "🧍 Stand up", run: () => interactBridge.current?.stand() });
      } else {
        const px = cameraFocus.x;
        const pz = cameraFocus.z;

        // the nearest free seat in reach
        let seat: { id: string; d: number } | null = null;
        for (const c of Object.values(chairs)) {
          if (c.occupiedBy && c.occupiedBy !== localSessionId) continue;
          const a = APPROACH_POINTS[c.propId];
          const d = Math.min(Math.hypot(c.x - px, c.z - pz), a ? Math.hypot(a.x - px, a.z - pz) : Infinity);
          if (d <= SEAT_REACH && (!seat || d < seat.d)) seat = { id: c.propId, d };
        }
        if (seat) {
          const id = seat.id;
          found.push({ key: `sit:${id}`, type: "sit", label: "🛋️ Sit", run: () => interactBridge.current?.sit(id) });
        }

        // Mochi is wherever her day has taken her, not at her home spot
        for (const p of Object.values(toggleables)) {
          if (p.kind !== "cat") continue;
          const at = mochiSpot(mapId, Date.now() / 1000);
          const d = Math.min(Math.hypot(at.x - px, at.z - pz), Math.hypot(at.ax - px, at.az - pz));
          if (d <= MOCHI_REACH) {
            const id = p.propId;
            found.push({ key: `pet:${id}`, type: "pet", label: "🐾 Pet Mochi", run: () => interactBridge.current?.useProp(id) });
          }
        }
      }

      // only touch React state when the set of buttons really changed
      const key = found.map((a) => a.key).join("|");
      if (key !== lastKey) {
        lastKey = key;
        setActions(found);
      }
    };
    scan();
    const timer = window.setInterval(scan, SCAN_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (actions.length === 0) return null;
  return (
    <div style={dockStyle} role="toolbar" aria-label="Actions">
      {actions.map((a) => (
        <button key={a.key} type="button" className="cozy-action" style={actionStyle} onClick={a.run}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

const dockStyle: CSSProperties = { ...glass, ...hudText, display: "flex", gap: 8, padding: 6, borderRadius: 999 };
const actionStyle: CSSProperties = {
  ...pillButton,
  background: "linear-gradient(180deg, #ffd166, #f4a83a)",
  color: "#3b2410",
  fontSize: 15,
  fontWeight: 800,
  boxShadow: "0 4px 16px rgba(255, 190, 60, 0.55), inset 0 -2px 0 rgba(160, 90, 10, 0.25)",
};
