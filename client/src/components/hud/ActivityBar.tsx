import { useState, type CSSProperties } from "react";
import {
  CHIP_VALUES,
  ITEMS,
  MAX_BET_TOTAL,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  TOAST_MAX,
  parseBag,
  parseBets,
  type ChairSyncState,
  type ItemId,
  type MapId,
  type PlayerState,
  type RouletteSyncState,
} from "@shared/types";
import { isFishingSeat } from "@shared/props";
import { glass, hudText, pillButton } from "./glass";
import { playClick } from "../../audio/sfx";

interface ActivityBarProps {
  player: PlayerState;
  chairs: Record<string, ChairSyncState>;
  localSessionId: string;
  mapId: MapId;
  roulette: RouletteSyncState;
  myBets: string;
  onRoast: () => void;
  onEat: () => void;
  onSip: () => void;
  onPutDown: () => void;
  onCastLine: () => void;
  onReelIn: () => void;
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
  const { player, chairs, localSessionId, mapId, roulette, myBets, onRoast, onEat, onSip, onPutDown, onCastLine, onReelIn } = props;
  const onLog = player.sitting && Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.style === "log");
  const roasting = player.holding === "marshmallow";
  const holdingCoffee = player.holding === "coffee";
  const brewing = player.action === "brew";
  const onPier = player.sitting && Object.values(chairs).some((c) => c.occupiedBy === localSessionId && isFishingSeat(c.propId));
  const fishing = player.action === "fish";
  const bite = fishing && player.actionProgress >= 1;
  const bag = parseBag(player.bag);
  const bagCount = Object.values(bag).reduce((a, b) => a + (b ?? 0), 0);
  const atRoulette =
    mapId === "velvet_casino" && Math.hypot(player.x - ROULETTE_CENTER.x, player.z - ROULETTE_CENTER.z) < ROULETTE_BET_RADIUS && !player.sitting;

  const hasActions = onLog || roasting || holdingCoffee || brewing || onPier;
  if (!hasActions && bagCount === 0 && !atRoulette) return null;

  const d = doneness(player.toast);

  return (
    <div style={styles.stack}>
      {atRoulette && <BettingBoard roulette={roulette} myBets={myBets} coins={player.coins} onPlaceBet={props.onPlaceBet} onClearBets={props.onClearBets} />}
      {(hasActions || bagCount > 0) && (
        <div style={styles.bar}>
          {brewing && <span style={styles.status}>☕ Brewing… {Math.round(player.actionProgress * 100)}%</span>}

          {onPier && !fishing && (
            <button type="button" style={styles.primary} onClick={onCastLine}>
              🎣 Cast a line
            </button>
          )}
          {fishing && !bite && (
            <>
              <span style={styles.status}>🎣 Watching the float…</span>
              <button type="button" style={styles.ghost} onClick={onReelIn}>
                Stop
              </button>
            </>
          )}
          {bite && (
            <button type="button" className="cozy-bite" style={styles.bite} onClick={onReelIn}>
              ❗ Bite! Reel in!
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
          playClick();
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

const OUTSIDE: { kind: string; label: string; bg: string; fg: string }[] = [
  { kind: "red", label: "Red", bg: "#b3202e", fg: "#fff" },
  { kind: "black", label: "Black", bg: "#1c1c22", fg: "#fff" },
  { kind: "odd", label: "Odd", bg: "rgba(255,255,255,0.8)", fg: "#3a2415" },
  { kind: "even", label: "Even", bg: "rgba(255,255,255,0.8)", fg: "#3a2415" },
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/** The roulette betting board: pick a chip, then tap where to put it. */
function BettingBoard({
  roulette,
  myBets,
  coins,
  onPlaceBet,
  onClearBets,
}: {
  roulette: RouletteSyncState;
  myBets: string;
  coins: number;
  onPlaceBet: (kind: string, amount: number) => void;
  onClearBets: () => void;
}) {
  const [chip, setChip] = useState<number>(CHIP_VALUES[0]);
  const [numbers, setNumbers] = useState(false);
  const bets = parseBets(myBets);
  const staked = Object.values(bets).reduce((a, b) => a + b, 0);
  const open = roulette.phase === "betting";
  const canBet = open && coins >= chip && staked + chip <= MAX_BET_TOTAL;
  const place = (kind: string) => {
    if (!canBet) return;
    playClick();
    onPlaceBet(kind, chip);
  };

  return (
    <div style={{ ...styles.bar, flexDirection: "column", borderRadius: 20, alignItems: "stretch", padding: 8, gap: 6 }}>
      <div style={styles.boardHead}>
        <span style={styles.status}>
          🎡 {open ? `Bets close in ${roulette.timeLeft}s` : roulette.phase === "spinning" ? "Spinning… no more bets" : `Result: ${roulette.result}`}
        </span>
        <span style={{ ...styles.status, opacity: 0.75 }}>On the table: {staked} 🪙</span>
      </div>
      <div style={styles.row}>
        {CHIP_VALUES.map((v) => (
          <button key={v} type="button" onClick={() => setChip(v)} aria-pressed={chip === v} style={{ ...styles.chip, ...(chip === v ? styles.chipOn : null) }}>
            {v}
          </button>
        ))}
        <span style={{ width: 6 }} />
        {OUTSIDE.map((o) => (
          <button key={o.kind} type="button" disabled={!canBet} onClick={() => place(o.kind)} style={{ ...styles.betBtn, background: o.bg, color: o.fg, opacity: canBet ? 1 : 0.5 }}>
            {o.label}
            {bets[o.kind] ? ` · ${bets[o.kind]}` : ""}
          </button>
        ))}
        <button type="button" onClick={() => setNumbers((n) => !n)} style={styles.betBtnGhost} aria-expanded={numbers}>
          # Number
        </button>
        {staked > 0 && open && (
          <button type="button" onClick={onClearBets} style={styles.betBtnGhost}>
            Take back
          </button>
        )}
      </div>
      {numbers && (
        <div style={styles.numberGrid}>
          {Array.from({ length: 37 }, (_, n) => (
            <button
              key={n}
              type="button"
              disabled={!canBet}
              onClick={() => place(`n${n}`)}
              style={{
                ...styles.num,
                background: n === 0 ? "#1f8a4c" : RED.has(n) ? "#b3202e" : "#1c1c22",
                outline: bets[`n${n}`] ? "2px solid #ffd35c" : "none",
                opacity: canBet ? 1 : 0.5,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      <span style={styles.hint}>Red/Black/Odd/Even pay 2×, a single number pays 36×.</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
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
  num: { border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: 11, padding: "5px 0", cursor: "pointer", fontFamily: "sans-serif" },
};
