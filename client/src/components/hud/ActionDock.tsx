import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PLANT_WATER_COINS, msUntilNextDay, type ChairSyncState, type MapId, type PlayerState, type ToggleableSyncState } from "@shared/types";
import { APPROACH_POINTS, isWaterable, mochiSpot } from "@shared/props";
import { BOARD_REACH, KITCHEN_REACH, MOCHI_REACH, PLANT_REACH, RADIO_REACH, SEAT_REACH } from "@shared/worlds/lounge";
import { pushToast } from "./toastStore";
import { cameraFocus } from "../../scene/cameraFocus";
import { interactBridge } from "../../scene/interactBridge";
import { glass, hudText, pillButton } from "./glass";

// The action dock: a floating pill at the bottom-centre that offers exactly what you can do right
// now, and does exactly what clicking it in the scene does.
//
//   [🛋️ Sit]        within SEAT_REACH (1.5) of a free seat, measured to the seat or its approach point
//   [🐾 Pet Mochi]  as you approach her (she wanders, so it is measured to where she is right now)
//   [♟️ Play Board Game]  within BOARD_REACH of the games table, or sitting at it
//   [☕ Brew Drink]  within KITCHEN_REACH of the coffee machine
//   [📻 Tune Radio]  within RADIO_REACH of the radio, or sitting on a pouf round its table
//   [🪴 Water Plant] within PLANT_REACH of a plant you have not watered today; after, [🌿 Happy
//                    Plant · 5h] counts down to when it is thirsty again (the day's rollover)
//   [🧍 Stand up]   while you are sitting
//
// Buttons are deduplicated by action type: only the nearest target of each type gets one, so
// three stools side by side give one "Sit", not three.

interface Action {
  key: string;
  type: "sit" | "pet" | "board" | "brew" | "radio" | "water" | "stand";
  label: string;
  /** A longer status line, shown as the button's tooltip. */
  hint?: string;
  run: () => void;
}

/** "5h 12m", "12m", "<1m": the time until the daily rollover. */
function untilTomorrow(short = false) {
  const minutes = Math.floor(msUntilNextDay() / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return short ? `${h}h` : `${h}h ${m}m`;
  return m > 0 ? `${m}m` : "<1m";
}

interface DockProps {
  player: PlayerState;
  mapId: MapId;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string;
  /** Water the plant in reach (PLANT_WATER). */
  onWater: (plantId: string) => void;
}

const SCAN_MS = 120;

export function ActionDock({ player, mapId, chairs, toggleables, localSessionId, onWater }: DockProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const latest = useRef({ chairs, toggleables, mapId, localSessionId, sitting: player.sitting, watered: player.watered, onWater });
  latest.current = { chairs, toggleables, mapId, localSessionId, sitting: player.sitting, watered: player.watered, onWater };

  useEffect(() => {
    let lastKey = "";
    const scan = () => {
      const { chairs, toggleables, mapId, localSessionId, sitting, watered, onWater } = latest.current;
      const found: Action[] = [];
      const reach = (p: ToggleableSyncState) => {
        const a = APPROACH_POINTS[p.propId];
        return Math.min(Math.hypot(p.x - cameraFocus.x, p.z - cameraFocus.z), a ? Math.hypot(a.x - cameraFocus.x, a.z - cameraFocus.z) : Infinity);
      };

      // the radio: tune it from beside it, or from a pouf round its table
      const radio = Object.values(toggleables).find((p) => p.kind === "radio");
      const onPouf = Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.propId.startsWith("pouf_"));
      if (radio && (onPouf || (!sitting && reach(radio) <= RADIO_REACH))) {
        const id = radio.propId;
        found.push({ key: `radio:${id}`, type: "radio", label: "📻 Tune Radio", run: () => interactBridge.current?.useProp(id) });
      }
      if (!sitting) {
        // the coffee machine
        const kitchen = Object.values(toggleables).find((p) => p.kind === "kitchen");
        if (kitchen && reach(kitchen) <= KITCHEN_REACH) {
          const id = kitchen.propId;
          found.push({ key: `brew:${id}`, type: "brew", label: "☕ Brew Drink", run: () => interactBridge.current?.useProp(id) });
        }
        // the nearest plant in reach: water it, or (already watered today) it is happy
        let plant: { id: string; d: number } | null = null;
        for (const p of Object.values(toggleables)) {
          if (!isWaterable(p.propId)) continue;
          const d = reach(p);
          if (d <= PLANT_REACH && (!plant || d < plant.d)) plant = { id: p.propId, d };
        }
        if (plant) {
          const id = plant.id;
          const done = watered.split(",").includes(id);
          if (done) {
            // watered today: happy until the day rolls over, and the pill counts down to it
            const left = untilTomorrow(true);
            found.push({ key: `water:${id}:done:${left}`, type: "water", label: `🌿 Happy Plant · ${left}`, hint: `Watered today. Thirsty again in ${untilTomorrow()}.`, run: () => pushToast(`The plant is happy and hydrated! Thirsty again in ${untilTomorrow()}.`, { emoji: "🌿" }) });
          } else {
            found.push({ key: `water:${id}`, type: "water", label: "🪴 Water Plant", hint: `Thirsty! Water it for +${PLANT_WATER_COINS} coins (each plant once a day).`, run: () => onWater(id) });
          }
        }
      }

      // the games table: offered as you walk up to it, and while you sit on one of its chairs
      const board = Object.values(toggleables).find((p) => p.kind === "boardgame");
      if (board) {
        const a = APPROACH_POINTS[board.propId];
        const atTable = Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.propId.startsWith("games_"));
        const d = Math.min(Math.hypot(board.x - cameraFocus.x, board.z - cameraFocus.z), a ? Math.hypot(a.x - cameraFocus.x, a.z - cameraFocus.z) : Infinity);
        if (atTable || (!sitting && d <= BOARD_REACH)) {
          const id = board.propId;
          // both of its chairs taken by others: walking up just opens the board to watch
          const full = Object.values(chairs).filter((c) => c.propId.startsWith("games_") && c.occupiedBy && c.occupiedBy !== localSessionId).length >= 2;
          found.push({ key: `board:${id}:${full}`, type: "board", label: full ? "👀 Watch Board Game" : "♟️ Play Board Game", run: () => interactBridge.current?.useProp(id) });
        }
      }

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
        <button key={a.key} type="button" className="cozy-action" style={actionStyle} onClick={a.run} title={a.hint}>
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
