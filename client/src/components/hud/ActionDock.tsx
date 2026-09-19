import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  NPCS,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  isWalkUpProp,
  type ChairSyncState,
  type MapId,
  type PlayerState,
  type ToggleableSyncState,
} from "@shared/types";
import { APPROACH_POINTS, isFishingSeat } from "@shared/props";
import { cameraFocus } from "../../scene/cameraFocus";
import { interactBridge } from "../../scene/interactBridge";
import { hudText, pillButton } from "./glass";
import { playClick } from "../../audio/sfx";

// Proximity actions: walk within reach of something you can use and a big gold button for it
// appears at the bottom of the screen. Pressing it does exactly what clicking the 3D model does,
// so nobody has to hit a small mesh (or miss it behind a hit box or a label) to play.
const REACH = 2.8;
const MAX_BUTTONS = 3;

interface Action {
  key: string;
  label: string;
  run: () => void;
}

function propLabel(p: ToggleableSyncState): string | null {
  switch (p.kind) {
    case "espresso":
      return "☕ Brew a coffee";
    case "arcade":
      return "🕹️ Play arcade";
    case "slot":
      return "🎰 Play slots";
    case "npc":
      return `💬 Talk to ${NPCS[p.propId]?.name.split(" ").pop() ?? "them"}`;
    case "forage":
      return p.on ? "🫐 Forage" : null; // picked bushes have nothing to give yet
    case "cat":
      return "🐱 Pet Mochi";
    case "sparkle":
      return p.on ? "🐚 Pick it up" : null;
    default:
      return null;
  }
}

interface ActionDockProps {
  player: PlayerState;
  mapId: MapId;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string;
  onCastLine: (afk?: boolean) => void;
  /** The betting board is already up: no need to offer it. */
  rouletteOpen?: boolean;
}

export function ActionDock({ player, mapId, chairs, toggleables, localSessionId, onCastLine, rouletteOpen = false }: ActionDockProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const latest = useRef({ chairs, toggleables, mapId, localSessionId });
  latest.current = { chairs, toggleables, mapId, localSessionId };
  // Pressing "Fish" walks you onto a pier seat; the line is cast by itself once you sit.
  const castPending = useRef<null | "manual" | "afk">(null);

  useEffect(() => {
    let lastKey = "";
    const scan = () => {
      const { chairs, toggleables, mapId, localSessionId } = latest.current;
      const px = cameraFocus.x;
      const pz = cameraFocus.z;
      const found: (Action & { d: number })[] = [];
      const dist = (x: number, z: number, id: string) => {
        const a = APPROACH_POINTS[id];
        return Math.min(Math.hypot(x - px, z - pz), a ? Math.hypot(a.x - px, a.z - pz) : Infinity);
      };

      for (const p of Object.values(toggleables)) {
        if (!isWalkUpProp(p.kind)) continue;
        const label = propLabel(p);
        if (!label) continue;
        const d = dist(p.x, p.z, p.propId);
        if (d <= REACH) found.push({ key: p.propId, label, d, run: () => interactBridge.current?.useProp(p.propId) });
      }

      // Seats that are an activity: the pier (fishing) and the logs round the fire (roasting).
      const free = (c: ChairSyncState) => c.occupiedBy === "" || c.occupiedBy === localSessionId;
      let fish: { id: string; d: number } | null = null;
      let fire: (Action & { d: number }) | null = null;
      for (const c of Object.values(chairs)) {
        if (!free(c)) continue;
        const d = dist(c.x, c.z, c.propId);
        if (d > REACH + 0.6) continue;
        if (isFishingSeat(c.propId) && (!fish || d < fish.d)) {
          fish = { id: c.propId, d };
        } else if (c.style === "log" && (!fire || d < fire.d)) {
          fire = { key: "fire", label: "🔥 Sit by the fire", d, run: () => interactBridge.current?.sit(c.propId) };
        }
      }
      // The pier offers both ways to fish: the bite-and-reel game, or chill mode that keeps
      // bringing in a little something while you just hang out on voice.
      if (fish) {
        const seat = fish.id;
        const go = (mode: "manual" | "afk") => () => {
          castPending.current = mode;
          interactBridge.current?.sit(seat);
        };
        found.push({ key: "fish", label: "🎣 Manual Fishing", d: fish.d, run: go("manual") });
        found.push({ key: "afkfish", label: "☕ AFK Fishing (chill)", d: fish.d + 0.01, run: go("afk") });
      }
      if (fire) found.push(fire);

      // The roulette table: from anywhere near it, step up to the rail and the board opens.
      if (mapId === "velvet_casino") {
        const dx = px - ROULETTE_CENTER.x;
        const dz = pz - ROULETTE_CENTER.z;
        const d = Math.hypot(dx, dz);
        if (d < ROULETTE_BET_RADIUS - 0.2) {
          found.push({ key: "roulette-open", label: "🎡 Betting board", d: 0, run: () => window.dispatchEvent(new Event("cozy-open-roulette")) });
        } else if (d < ROULETTE_BET_RADIUS + REACH) {
          const k = 3.0 / (d || 1);
          found.push({
            key: "roulette",
            label: "🎡 Join roulette",
            d: d - ROULETTE_BET_RADIUS,
            run: () => interactBridge.current?.walkTo(ROULETTE_CENTER.x + dx * k, ROULETTE_CENTER.z + dz * k),
          });
        }
      }

      found.sort((a, b) => a.d - b.d);
      const next = found.slice(0, MAX_BUTTONS);
      const key = next.map((a) => a.key + a.label).join("|");
      if (key !== lastKey) {
        lastKey = key;
        setActions(next);
      }
    };
    scan();
    const id = window.setInterval(scan, 150);
    return () => window.clearInterval(id);
  }, []);

  const onPier = player.sitting && Object.values(chairs).some((c) => c.occupiedBy === localSessionId && isFishingSeat(c.propId));
  useEffect(() => {
    const mode = castPending.current;
    if (!mode) return;
    if (onPier && player.action === "") {
      castPending.current = null;
      onCastLine(mode === "afk");
    }
  }, [onPier, player.action, onCastLine]);

  // Busy (seated, fishing, brewing): the activity bar has the controls, not the dock.
  const shown = rouletteOpen ? actions.filter((a) => a.key !== "roulette-open") : actions;
  if (player.sitting || player.action !== "" || shown.length === 0) return null;

  return (
    <div style={styles.dock}>
      {shown.map((a) => (
        <button
          key={a.key}
          type="button"
          className="cozy-action"
          style={styles.button}
          onClick={() => {
            playClick();
            a.run();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  dock: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", pointerEvents: "auto" },
  button: {
    ...pillButton,
    ...hudText,
    fontSize: 15,
    fontWeight: 800,
    padding: "11px 20px",
    color: "#4a2a08",
    background: "linear-gradient(180deg, #ffe08a 0%, #f5b93a 100%)",
    border: "2px solid #fff3c4",
    boxShadow: "0 4px 16px rgba(230, 160, 40, 0.55), inset 0 -2px 0 rgba(160, 90, 10, 0.25)",
  },
};
