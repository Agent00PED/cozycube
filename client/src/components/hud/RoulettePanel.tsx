import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CHIP_VALUES, MAX_BET_TOTAL, ROULETTE_PHASE_SECONDS, parseBets, pocketColor, type RouletteResultBroadcast, type RouletteSyncState } from "@shared/types";
import { glass, hudText } from "./glass";
import { playChip, playClick, playConfetti } from "../../audio/sfx";

const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  dx: `${Math.cos(i * 0.35 + 0.2) * (90 + (i % 4) * 30)}px`,
  dy: `${-60 - (i % 5) * 28 + (i % 3) * 20}px`,
  color: ["#f2cf73", "#e0453a", "#6fd08c", "#7fb6f2", "#ec7fa3"][i % 5],
}));

type Subscribe = (listener: (type: string, payload: unknown) => void) => () => void;

interface RoulettePanelProps {
  roulette: RouletteSyncState;
  myBets: string;
  coins: number;
  localSessionId: string;
  onPlaceBet: (kind: string, amount: number) => void;
  onClearBets: () => void;
  subscribeMessages: Subscribe;
  onClose: () => void;
}

const CHIP_COLORS: Record<number, string> = { 5: "#e0453a", 10: "#2f5fd0", 25: "#2d9a5a" };
const POCKET_BG = { red: "#b3202e", black: "#1c1c22", green: "#1f8a4c" } as const;
const OUTSIDE = [
  { kind: "red", label: "RED", bg: POCKET_BG.red, fg: "#fff" },
  { kind: "black", label: "BLACK", bg: POCKET_BG.black, fg: "#fff" },
  { kind: "odd", label: "ODD", bg: "rgba(255,255,255,0.12)", fg: "#fff3dc" },
  { kind: "even", label: "EVEN", bg: "rgba(255,255,255,0.12)", fg: "#fff3dc" },
];
// The real table layout: three rows, top row 3-6-9…36, twelve columns.
const ROWS = [3, 2, 1].map((r) => Array.from({ length: 12 }, (_, c) => c * 3 + r));

// The roulette table as a proper on-screen board: pick a chip, tap the felt. It shows the phase
// countdown, what you have on the table, and — after each spin — the number and what you won
// or lost, while the wallet in the top bar ticks over.
export function RoulettePanel({ roulette, myBets, coins, localSessionId, onPlaceBet, onClearBets, subscribeMessages, onClose }: RoulettePanelProps) {
  const [chip, setChip] = useState<number>(CHIP_VALUES[0]);
  const [outcome, setOutcome] = useState<{ result: number; text: string; win: boolean } | null>(null);
  const bets = parseBets(myBets) as Record<string, number>;
  const staked = Object.values(bets).reduce((a, b) => a + b, 0);
  const open = roulette.phase === "betting";
  const canBet = open && coins >= chip && staked + chip <= MAX_BET_TOTAL;

  // What was riding on this spin, so a loss can be named when the result lands.
  const ridingRef = useRef(0);
  useEffect(() => {
    if (roulette.phase === "spinning") ridingRef.current = staked;
    if (roulette.phase === "betting") setOutcome(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roulette.phase]);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "rouletteResult") return;
        const { result, winners } = payload as RouletteResultBroadcast;
        const mine = winners.find((w) => w.sessionId === localSessionId);
        if (mine) {
          setOutcome({ result, text: `You won ${mine.amount} 🪙!`, win: true });
          playConfetti();
        }
        else if (ridingRef.current > 0) setOutcome({ result, text: `No luck — ${ridingRef.current} 🪙 to the house`, win: false });
        else setOutcome({ result, text: "Place a chip next round!", win: false });
      }),
    [subscribeMessages, localSessionId]
  );

  const place = (kind: string) => {
    if (!canBet) return;
    playChip();
    onPlaceBet(kind, chip);
  };

  const total = ROULETTE_PHASE_SECONDS[roulette.phase];
  const frac = Math.max(0, Math.min(1, roulette.timeLeft / total));
  const phaseLabel = open ? `Bets close in ${roulette.timeLeft}s` : roulette.phase === "spinning" ? "Spinning… no more bets" : "Paying out";

  const cell = (kind: string, label: string, bg: string, fg = "#fff", extra: CSSProperties = {}) => (
    <button
      key={kind}
      type="button"
      disabled={!canBet}
      onClick={() => place(kind)}
      style={{ ...styles.cell, background: bg, color: fg, cursor: canBet ? "pointer" : "default", ...(outcome && `n${outcome.result}` === kind ? styles.cellHit : null), ...extra }}
    >
      {label}
      {bets[kind] ? <span style={{ ...styles.marker, background: "#c9962e" }}>{bets[kind]}</span> : null}
    </button>
  );

  return (
    <div className="cozy-roulette" style={styles.panel} role="dialog" aria-label="Roulette betting board">
      <div style={styles.head}>
        <span style={styles.title}>🎡 Roulette</span>
        <span style={{ ...styles.phase, background: open ? "#2d9a5a" : roulette.phase === "spinning" ? "#b3202e" : "#8a6a2a" }}>{phaseLabel}</span>
        <span style={{ flex: 1 }} />
        <span style={styles.wallet}>🪙 {coins}</span>
        <button
          type="button"
          style={styles.close}
          onClick={() => {
            playClick();
            onClose();
          }}
          aria-label="Close the betting board"
        >
          ✕
        </button>
      </div>
      <div style={styles.track}>
        <div style={{ ...styles.fill, width: `${frac * 100}%`, background: open ? "#6fd08c" : "#f2cf73" }} />
      </div>

      {outcome?.win && roulette.phase !== "betting" && (
        <div className="cozy-confetti" aria-hidden>
          {CONFETTI.map((c, i) => (
            <i key={i} style={{ background: c.color, ["--dx" as string]: c.dx, ["--dy" as string]: c.dy, animationDelay: `${(i % 6) * 30}ms` } as CSSProperties} />
          ))}
        </div>
      )}
      {outcome && roulette.phase !== "betting" && (
        <div style={{ ...styles.outcome, background: outcome.win ? "rgba(111,208,140,0.25)" : "rgba(255,255,255,0.08)" }}>
          <span style={{ ...styles.ball, background: POCKET_BG[pocketColor(outcome.result)] }}>{outcome.result}</span>
          <span className={outcome.win ? "cozy-coin-bump" : undefined}>{outcome.text}</span>
        </div>
      )}

      <div style={styles.felt}>
        <div className="cozy-felt-grid" style={styles.grid}>
          {cell("n0", "0", POCKET_BG.green, "#fff", { gridRow: "1 / span 3", gridColumn: 1 })}
          {ROWS.map((row, r) =>
            row.map((n, c) => (
              <div key={n} style={{ gridRow: r + 1, gridColumn: c + 2, display: "flex" }}>
                {cell(`n${n}`, String(n), POCKET_BG[pocketColor(n)])}
              </div>
            ))
          )}
        </div>
        <div style={styles.outside}>{OUTSIDE.map((o) => cell(o.kind, o.label, o.bg, o.fg, { flex: 1, height: 30 }))}</div>
      </div>

      <div style={styles.foot}>
        <div style={styles.chips}>
          {CHIP_VALUES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                playClick();
                setChip(v);
              }}
              aria-pressed={chip === v}
              style={{ ...styles.chip, background: CHIP_COLORS[v], ...(chip === v ? styles.chipOn : null) }}
            >
              {v}
            </button>
          ))}
        </div>
        <span style={styles.staked}>
          On the table: <b>{staked}</b> / {MAX_BET_TOTAL}
        </span>
        {staked > 0 && open && (
          <button
            type="button"
            style={styles.clear}
            onClick={() => {
              playClick();
              onClearBets();
            }}
          >
            Take back
          </button>
        )}
      </div>
      <span className="cozy-hint" style={styles.hint}>Red · Black · Odd · Even pay 2× — a single number pays 36×</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    ...glass,
    ...hudText,
    backdropFilter: "blur(16px) saturate(150%)",
    border: "1px solid rgba(242, 207, 115, 0.45)",
    color: "#fff3dc",
    borderRadius: 22,
    padding: 12,
    width: "min(500px, calc(100vw - 24px))",
    position: "relative",
    background: "rgba(38, 16, 20, 0.72)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
  },
  head: { display: "flex", alignItems: "center", gap: 8 },
  title: { fontWeight: 800, fontSize: 15, color: "#f2cf73" },
  phase: { fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 999, color: "#fff" },
  wallet: { fontWeight: 800, fontSize: 13, fontVariantNumeric: "tabular-nums" },
  close: { border: "none", background: "rgba(255,255,255,0.12)", color: "#fff3dc", borderRadius: 999, width: 28, height: 28, cursor: "pointer", fontSize: 13 },
  track: { height: 5, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999, transition: "width 1s linear" },
  outcome: { display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 12, fontWeight: 700, fontSize: 14 },
  ball: { width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, color: "#fff", boxShadow: "0 0 0 2px #f2cf73" },
  felt: { background: "#1c6b3f", borderRadius: 14, padding: 6, display: "flex", flexDirection: "column", gap: 5, boxShadow: "inset 0 0 0 2px rgba(242,207,115,0.5)" },
  grid: { display: "grid", gridTemplateColumns: "1.1fr repeat(12, 1fr)", gridTemplateRows: "repeat(3, 26px)", gap: 3 },
  outside: { display: "flex", gap: 4 },
  cell: {
    position: "relative",
    flex: 1,
    width: "100%",
    border: "1px solid rgba(242,207,115,0.35)",
    borderRadius: 6,
    fontFamily: "system-ui, sans-serif",
    fontWeight: 800,
    fontSize: 12,
    padding: 0,
    transition: "transform 100ms ease, filter 100ms ease",
  },
  cellHit: { boxShadow: "0 0 0 3px #ffe08a, 0 0 14px #ffd35c" },
  marker: {
    position: "absolute",
    top: -7,
    right: -5,
    minWidth: 18,
    height: 18,
    padding: "0 3px",
    borderRadius: 999,
    border: "2px dashed #fff",
    color: "#fff",
    fontSize: 9.5,
    lineHeight: "14px",
    fontWeight: 800,
    boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
    pointerEvents: "none",
  },
  foot: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  chips: { display: "flex", gap: 6 },
  chip: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "3px dashed rgba(255,255,255,0.85)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
    transition: "transform 120ms ease",
  },
  chipOn: { transform: "translateY(-4px) scale(1.1)", boxShadow: "0 0 0 3px #f2cf73, 0 6px 12px rgba(0,0,0,0.5)" },
  staked: { fontSize: 12.5, opacity: 0.9 },
  clear: { border: "1px solid rgba(255,243,220,0.4)", background: "transparent", color: "#fff3dc", borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 },
  hint: { fontSize: 11, opacity: 0.6, textAlign: "center" },
};
