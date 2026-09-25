import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  AFK_FISH_MAX_S,
  AFK_FISH_MIN_S,
  ITEMS,
  TOAST_MAX,
  parseBag,
  type ChairSyncState,
  type ItemId,
  type MapId,
  type PlayerState,
} from "@shared/types";
import { isFishingSeat } from "@shared/props";
import { glass, hudText, pillButton } from "./glass";

interface ActivityBarProps {
  player: PlayerState;
  chairs: Record<string, ChairSyncState>;
  localSessionId: string;
  mapId: MapId;
  roulette: unknown;
  myBets: string;
  onRoast: () => void;
  onEat: () => void;
  onSip: () => void;
  onPutDown: () => void;
  onCastLine: (afk?: boolean) => void;
  onReelIn: () => void;
  /** A bite: set the hook and the reel minigame opens. */
  onHook: () => void;
  /** Sitting in the hot spring: splash whoever is next to you. */
  onSplash: () => void;
  onPlaceBet: (kind: string, amount: number) => void;
  onClearBets: () => void;
}

function doneness(toast: number): { label: string; color: string } {
  if (toast < 0.35) return { label: "Raw", color: "#b8ad98" };
  if (toast < 0.8) return { label: "Toasty", color: "#d9b36b" };
  if (toast <= 1.15) return { label: "Golden ✨", color: "#d9974a" };
  if (toast < 1.45) return { label: "Very dark…", color: "#8a5a36" };
  return { label: "Burnt! 🔥", color: "#5a3a2a" };
}

// The action dock: only what you can do right now, right here — plus your fish bucket, and the
// betting board when you are standing at the roulette table.
export function ActivityBar(props: ActivityBarProps) {
  const { player, chairs, localSessionId, mapId, roulette, myBets, onRoast, onEat, onSip, onPutDown, onCastLine, onReelIn, onHook, onSplash } = props;
  const soaking = player.sitting && Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.style === "onsen");
  const onLog = player.sitting && Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.style === "log");
  const roasting = player.holding === "marshmallow";
  const holdingCoffee = player.holding === "coffee";
  const brewing = player.action === "brew";
  const onPier = player.sitting && Object.values(chairs).some((c) => c.occupiedBy === localSessionId && isFishingSeat(c.propId));
  const fishing = player.action === "fish";
  const afkFishing = player.action === "afkfish";
  const bite = fishing && player.actionProgress >= 1;
  const bag = parseBag(player.bag);
  const bagCount = Object.values(bag).reduce((a, b) => a + (b ?? 0), 0);

  const hasActions = onLog || roasting || holdingCoffee || brewing || onPier || soaking;

  // the reel itself is a modal; nothing to add underneath it
  if (player.action === "reel" || player.action === "dizzy") return null;
  if (!hasActions && bagCount === 0 && !afkFishing) return null;

  const d = doneness(player.toast);

  return (
    <div style={styles.stack}>
      {(hasActions || bagCount > 0) && (
        <div style={styles.bar}>
          {brewing && <span style={styles.status}>☕ Brewing… {Math.round(player.actionProgress * 100)}%</span>}

          {onPier && !fishing && !afkFishing && (
            <>
              <button type="button" style={styles.primary} onClick={() => onCastLine(false)}>
                🎣 Cast a line
              </button>
              <button type="button" style={styles.secondary} onClick={() => onCastLine(true)}>
                ☕ AFK Fishing
              </button>
            </>
          )}
          {afkFishing && <ChillFishing player={player} onStop={onReelIn} />}
          {fishing && !bite && (
            <>
              <span style={styles.status}>🎣 Watching the float…</span>
              <button type="button" style={styles.ghost} onClick={onReelIn}>
                Stop
              </button>
            </>
          )}
          {bite && (
            <button type="button" className="cozy-bite" style={styles.bite} onClick={onHook}>
              ❗ Bite! Set the hook!
            </button>
          )}
          {soaking && (
            <button type="button" style={styles.secondary} onClick={onSplash}>
              💦 Splash
            </button>
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

          {bagCount > 0 && <Bucket bag={bag} count={bagCount} />}
        </div>
      )}
    </div>
  );
}

/** Chill-mode fishing: a calm card with the wait for the next haul and what has come in. */
function ChillFishing({ player, onStop }: { player: PlayerState; onStop: () => void }) {
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  const [session, setSession] = useState({ coins: 0, fish: 0 });
  const prev = useRef({ coins: player.coins, bag: parseBag(player.bag) });
  useEffect(() => {
    const bag = parseBag(player.bag);
    const before = prev.current;
    const gained: string[] = [];
    const dc = player.coins - before.coins;
    if (dc > 0) gained.push(`+${dc} 🪙`);
    let fish = 0;
    for (const id of Object.keys(bag) as ItemId[]) {
      const n = (bag[id] ?? 0) - (before.bag[id] ?? 0);
      if (n > 0) {
        gained.push(`${ITEMS[id].emoji} ${ITEMS[id].name}`);
        fish += n;
      }
    }
    prev.current = { coins: player.coins, bag };
    if (!gained.length) return;
    setSession((s0) => ({ coins: s0.coins + Math.max(0, dc), fish: s0.fish + fish }));
    setLog((l) => [{ id: Date.now(), text: gained.join(" · ") }, ...l].slice(0, 3));
  }, [player.coins, player.bag]);

  // The server keeps the exact moment; the wait is always 35-45 s, so this is honest to a few seconds.
  const secondsLeft = Math.max(1, Math.round((1 - player.actionProgress) * ((AFK_FISH_MIN_S + AFK_FISH_MAX_S) / 2)));
  return (
    <div style={styles.chill}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 22 }} className="cozy-bob">🎣</span>
        <div style={{ flex: 1 }}>
          <div style={styles.status}>Chill fishing · next bite in ~{secondsLeft}s</div>
          <div style={styles.meterTrack}>
            <div style={{ ...styles.meterFill, width: `${player.actionProgress * 100}%`, background: "#7fc6d9", transition: "width 0.5s linear" }} />
          </div>
        </div>
        <button type="button" style={styles.ghost} onClick={onStop}>
          Stop
        </button>
      </div>
      <div style={styles.chillStats}>
        <span>This session: {session.fish} 🐟 · {session.coins} 🪙</span>
        {log[0] && (
          <span key={log[0].id} className="cozy-coin-bump" style={styles.chillLast}>
            {log[0].text}
          </span>
        )}
      </div>
    </div>
  );
}

/** The personal fish bucket / forage bag, and who buys what. */
function Bucket({ bag, count }: { bag: ReturnType<typeof parseBag>; count: number }) {
  const [open, setOpen] = useState(false);
  const entries = (Object.entries(bag) as [ItemId, number][]).filter(([, n]) => n > 0);
  const worth = entries.reduce((sum, [id, n]) => sum + ITEMS[id].value * n, 0);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        style={styles.secondary}
        onClick={() => {
          setOpen((o) => !o);
        }}
        aria-expanded={open}
      >
        🪣 Bucket ({count})
      </button>
      {open && (
        <div style={styles.popover} role="dialog" aria-label="Your bucket">
          {entries.map(([id, n]) => (
            <div key={id} style={styles.itemRow}>
              <span style={{ fontSize: 18 }}>{ITEMS[id].emoji}</span>
              <span style={{ flex: 1 }}>
                {ITEMS[id].name} × {n}
              </span>
              <span style={styles.value}>{ITEMS[id].value * n} 🪙</span>
            </div>
          ))}
          <div style={styles.hint}>
            Worth {worth} 🪙. Sell fish to <b>Fisherman Bob</b> (beach) and berries or fireflies to <b>Ranger Oak</b> (campfire).
          </div>
        </div>
      )}
    </div>
  );
}


const styles: Record<string, CSSProperties> = {
  chill: { ...glass, background: "rgba(240, 250, 252, 0.8)", borderRadius: 18, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, minWidth: 280 },
  chillStats: { ...hudText, display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, opacity: 0.85 },
  chillLast: { fontWeight: 800, color: "#2c6f86" },
  stack: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, maxWidth: "calc(100vw - 24px)" },
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
  bite: { ...pillButton, background: "#ec7fa3", color: "#fff", fontWeight: 800, boxShadow: "0 2px 12px rgba(236,127,163,0.6)" },
  secondary: { ...pillButton, background: "rgba(255,255,255,0.75)" },
  ghost: { ...pillButton, background: "transparent", fontWeight: 500 },
  meterWrap: { display: "flex", alignItems: "center", gap: 8, padding: "0 6px 0 10px" },
  meterTrack: { position: "relative", width: "clamp(80px, 22vw, 130px)", height: 10, borderRadius: 999, background: "rgba(74,58,44,0.18)", overflow: "hidden" },
  sweetSpot: { position: "absolute", top: 0, bottom: 0, background: "rgba(255, 215, 120, 0.55)" },
  meterFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, transition: "width 120ms linear" },
  meterLabel: { ...hudText, fontSize: 12, fontWeight: 700, minWidth: 74 },
  popover: {
    ...glass,
    ...hudText,
    position: "absolute",
    bottom: "calc(100% + 8px)",
    right: 0,
    width: 250,
    borderRadius: 16,
    padding: 10,
    background: "rgba(255,250,242,0.92)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
  },
  itemRow: { display: "flex", alignItems: "center", gap: 8 },
  value: { fontWeight: 700, color: "#8a5a10" },
  hint: { ...hudText, fontSize: 11.5, opacity: 0.75, lineHeight: 1.35, textAlign: "center" },
  boardHead: { display: "flex", justifyContent: "space-between", flexWrap: "wrap" },
  row: { display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", alignItems: "center" },
  chip: { ...hudText, width: 34, height: 34, borderRadius: "50%", border: "3px dashed rgba(255,255,255,0.9)", background: "#2f5fd0", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", padding: 0 },
  chipOn: { background: "#e0453a", boxShadow: "0 0 0 2px #ffd35c" },
  betBtn: { ...pillButton, padding: "7px 12px", fontWeight: 700 },
  betBtnGhost: { ...pillButton, padding: "7px 12px", background: "rgba(255,255,255,0.6)" },
  numberGrid: { display: "grid", gridTemplateColumns: "repeat(13, minmax(0, 1fr))", gap: 3 },
  num: { border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: 11, padding: "5px 0", cursor: "pointer", fontFamily: "var(--font-cozy)" },
};
