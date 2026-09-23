import { LOFT_SEAT_REACH } from "@shared/worlds/lounge";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BLACKJACK_CENTER,
  BLACKJACK_RADIUS,
  BOXING_RING,
  NPCS,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  isWalkUpProp,
  type ChairSyncState,
  type MapId,
  type PlayerState,
  type ToggleableSyncState,
} from "@shared/types";
import { APPROACH_POINTS, isFishingSeat, mochiSpot } from "@shared/props";
import { cameraFocus } from "../../scene/cameraFocus";
import { interactBridge } from "../../scene/interactBridge";
import { hudText, pillButton } from "./glass";
import { playClick } from "../../audio/sfx";

// Proximity actions: walk within reach of something you can use and a big gold button for it
// appears at the bottom of the screen. Pressing it does exactly what clicking the 3D model does,
// so nobody has to hit a small mesh (or miss it behind a hit box or a label) to play.
const REACH = 2.8;
/** One button: the nearest thing you can do right now. */
const MAX_BUTTONS = 1;

interface Action {
  key: string;
  /** What kind of thing it is. Only the nearest of each type gets a button, so three slot
   *  machines side by side give one "Play slots", not three. */
  type: string;
  label: string;
  run: () => void;
}

function propLabel(p: ToggleableSyncState, mapId: MapId): string | null {
  switch (p.kind) {
    case "espresso":
      return "☕ Brew a coffee";
    case "arcade":
      return mapId === "retro_arcade" ? "🕹️ Play Snake" : "🕹️ Play arcade";
    case "gacha":
      return "🔮 Turn Gacha";
    case "claw":
      return "🧸 Claw machine";
    case "well":
      return "🪙 Make a wish";
    case "teahouse":
      return "🍵 Tea ceremony";
    case "blender":
      return "🍹 Blend a drink";
    case "boardgame":
      return "🔴 Play checkers";
    case "jukebox":
      return "🎵 Jukebox";
    case "shishi":
      return null;
    case "slot":
      return "🎰 Play slots";
    case "npc":
      return `💬 Talk to ${NPCS[p.propId]?.name.split(" ").pop() ?? "them"}`;
    case "forage":
      return p.on ? "🫐 Forage" : null; // picked bushes have nothing to give yet
    case "cat":
      return "🐱 Play with Mochi";
    case "sparkle":
      return p.on ? "🐚 Pick it up" : null;
    case "stew":
      return p.on ? "🍲 Stir the stew" : null; // an empty pot is being refilled
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
  onRoast: () => void;
  /** Step into the ring: gloves on (the server checks you are standing inside it). */
  onBoxingEnter: () => void;
  /** The betting board is already up: no need to offer it. */
  rouletteOpen?: boolean;
}

export function ActionDock({ player, mapId, chairs, toggleables, localSessionId, onCastLine, onRoast, onBoxingEnter, rouletteOpen = false }: ActionDockProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const latest = useRef({ chairs, toggleables, mapId, localSessionId, gloves: player.gloves });
  latest.current = { chairs, toggleables, mapId, localSessionId, gloves: player.gloves };
  // "Step into the ring" walks you up the steps; the gloves go on once you are inside.
  const ringPending = useRef(false);
  // Pressing "Fish" walks you onto a pier seat; the line is cast by itself once you sit.
  const castPending = useRef<null | "manual" | "afk">(null);
  // Likewise "Roast": sit on the nearest log, and the stick is handed over once you're down.
  const roastPending = useRef(false);

  useEffect(() => {
    let lastKey = "";
    const scan = () => {
      const { chairs, toggleables, mapId, localSessionId, gloves } = latest.current;
      const px = cameraFocus.x;
      const pz = cameraFocus.z;
      const found: (Action & { d: number })[] = [];
      const dist = (x: number, z: number, id: string) => {
        const a = APPROACH_POINTS[id];
        return Math.min(Math.hypot(x - px, z - pz), a ? Math.hypot(a.x - px, a.z - pz) : Infinity);
      };

      for (const p of Object.values(toggleables)) {
        if (!isWalkUpProp(p.kind)) continue;
        const label = propLabel(p, mapId);
        if (!label) continue;
        // Mochi is wherever her day has taken her, not at her home spot
        const at = p.kind === "cat" ? mochiSpot(mapId, Date.now() / 1000) : null;
        const d = at ? Math.min(Math.hypot(at.x - px, at.z - pz), Math.hypot(at.ax - px, at.az - pz)) : dist(p.x, p.z, p.propId);
        if (d <= REACH)
          found.push({
            key: p.propId,
            type: p.kind,
            label,
            d,
            run: () => {
              interactBridge.current?.useProp(p.propId);
              // the arcade's cabinets open their game on this client; the server only lights them up
              if (p.kind === "arcade" && mapId === "retro_arcade") window.dispatchEvent(new CustomEvent("cozy-open-panel", { detail: { kind: "arcade", propId: p.propId } }));
            },
          });
      }

      // Seats that are an activity: the pier (fishing) and the logs round the fire (roasting).
      const free = (c: ChairSyncState) => c.occupiedBy === "" || c.occupiedBy === localSessionId;
      let fish: { id: string; d: number } | null = null;
      let fire: { id: string; d: number } | null = null;
      // the intimate lounge asks you to come right up to a seat before offering it
      const seatReach = mapId === "cozy_lounge" ? LOFT_SEAT_REACH : REACH;
      let seat: { id: string; d: number } | null = null;
      for (const c of Object.values(chairs)) {
        if (!free(c)) continue;
        const d = dist(c.x, c.z, c.propId);
        if (d > REACH + 0.6) continue;
        if (isFishingSeat(c.propId) && (!fish || d < fish.d)) {
          fish = { id: c.propId, d };
        } else if (c.style === "log" && (!fire || d < fire.d)) {
          fire = { id: c.propId, d };
        } else if (d <= seatReach && (!seat || d < seat.d)) {
          seat = { id: c.propId, d };
        }
      }
      // Any other seat close by: one "sit" button for the nearest (a soak, in the hot spring).
      if (seat) {
        const id = seat.id;
        const onsen = chairs[id]?.style === "onsen";
        found.push({ key: "sit", type: "sit", label: onsen ? "♨️ Soak" : "🛋️ Sit", d: seat.d + 0.3, run: () => interactBridge.current?.sit(id) });
      }
      // The ring: from beside it, walk up the steps; standing inside, the gloves go on.
      if (mapId === "boxing_ring" && !gloves) {
        const inside = Math.abs(px - BOXING_RING.x) < BOXING_RING.half - 0.3 && Math.abs(pz - BOXING_RING.z) < BOXING_RING.half - 0.3;
        const d = Math.hypot(px - BOXING_RING.x, pz - BOXING_RING.z);
        if (inside) found.push({ key: "ring-enter", type: "ring", label: "🥊 Put the gloves on", d: 0, run: () => onBoxingEnter() });
        else if (d < BOXING_RING.half + REACH + 1.5)
          found.push({
            key: "ring",
            type: "ring",
            label: "🥊 Step into Ring",
            d: d - BOXING_RING.half + 0.2,
            run: () => {
              ringPending.current = true;
              interactBridge.current?.walkTo(BOXING_RING.x, BOXING_RING.z + 1.0);
            },
          });
      }
      // The pier offers both ways to fish: the bite-and-reel game, or chill mode that keeps
      // bringing in a little something while you just hang out on voice.
      if (fish) {
        const seat = fish.id;
        const go = (mode: "manual" | "afk") => () => {
          castPending.current = mode;
          interactBridge.current?.sit(seat);
        };
        found.push({ key: "fish", type: "fish", label: "🎣 Cast Line", d: fish.d, run: go("manual") });
      }
      // The fire offers a seat, or a seat with a roasting stick already in hand.
      if (fire) {
        const seat = fire.id;
        found.push({
          key: "roast",
          type: "roast",
          label: "🍢 Roast a marshmallow",
          d: fire.d,
          run: () => {
            roastPending.current = true;
            interactBridge.current?.sit(seat);
          },
        });
      }

      // The blackjack table: step up to it and the table opens.
      if (mapId === "velvet_casino") {
        const dx = px - BLACKJACK_CENTER.x;
        const dz = pz - BLACKJACK_CENTER.z;
        const d = Math.hypot(dx, dz);
        if (d < BLACKJACK_RADIUS) {
          found.push({ key: "blackjack-open", type: "blackjack", label: "🃏 Play blackjack", d: 0.5, run: () => window.dispatchEvent(new Event("cozy-open-blackjack")) });
        } else if (d < BLACKJACK_RADIUS + REACH) {
          const k = 2.6 / (d || 1);
          found.push({ key: "blackjack", type: "blackjack", label: "🃏 Blackjack table", d: d - BLACKJACK_RADIUS + 0.2, run: () => interactBridge.current?.walkTo(BLACKJACK_CENTER.x + dx * k, BLACKJACK_CENTER.z + dz * k) });
        }
      }
      // The roulette table: from anywhere near it, step up to the rail and the board opens.
      if (mapId === "velvet_casino") {
        const dx = px - ROULETTE_CENTER.x;
        const dz = pz - ROULETTE_CENTER.z;
        const d = Math.hypot(dx, dz);
        if (d < ROULETTE_BET_RADIUS - 0.2) {
          found.push({ key: "roulette-open", type: "roulette", label: "🎡 Betting board", d: 0, run: () => window.dispatchEvent(new Event("cozy-open-roulette")) });
        } else if (d < ROULETTE_BET_RADIUS + REACH) {
          const k = 3.0 / (d || 1);
          found.push({
            key: "roulette",
            type: "roulette",
            label: "🎡 Join roulette",
            d: d - ROULETTE_BET_RADIUS,
            run: () => interactBridge.current?.walkTo(ROULETTE_CENTER.x + dx * k, ROULETTE_CENTER.z + dz * k),
          });
        }
      }

      // Nearest first, then keep only the first (nearest) of each type.
      found.sort((a, b) => a.d - b.d);
      const seen = new Set<string>();
      const next = found.filter((a) => (seen.has(a.type) ? false : (seen.add(a.type), true))).slice(0, MAX_BUTTONS);
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

  // Gloves go on by themselves once "Step into Ring" has carried you up onto the canvas.
  const inRing = !player.sitting && Math.abs(player.x - BOXING_RING.x) < BOXING_RING.half - 0.3 && Math.abs(player.z - BOXING_RING.z) < BOXING_RING.half - 0.3;
  useEffect(() => {
    if (!ringPending.current) return;
    if (mapId !== "boxing_ring") {
      ringPending.current = false;
      return;
    }
    if (inRing && !player.gloves) {
      ringPending.current = false;
      onBoxingEnter();
    }
  }, [inRing, player.gloves, mapId, onBoxingEnter]);

  const onLog = player.sitting && Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.style === "log");
  useEffect(() => {
    if (!roastPending.current) return;
    if (onLog && player.action === "") {
      roastPending.current = false;
      onRoast();
    }
  }, [onLog, player.action, onRoast]);

  // Busy (seated, fishing, brewing): the activity bar has the controls, not the dock.
  const shown = rouletteOpen ? actions.filter((a) => a.key !== "roulette-open") : actions;
  if (player.sitting || player.action !== "" || player.gloves || shown.length === 0) return null;

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
    padding: "12px 20px",
    minHeight: 48,
    color: "#4a2a08",
    background: "linear-gradient(180deg, #ffe08a 0%, #f5b93a 100%)",
    border: "2px solid #fff3c4",
    boxShadow: "0 4px 16px rgba(230, 160, 40, 0.55), inset 0 -2px 0 rgba(160, 90, 10, 0.25)",
  },
};
