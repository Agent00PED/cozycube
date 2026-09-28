import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { COMPOSURE_MAX, CORNER_COLOR, CORNER_NAME, GUARD, METHOD_LABEL, MOVES, STAMINA_MAX, SWAY, oddsText, parseBet, type BoutResult, type BoxEvent, type BoxingPacket, type Corner, type FighterView } from "@shared/boxing";
import type { PlayerState } from "@shared/types";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { cornerOfSession, useBout, useBoutClock } from "../../systems/boutStore";
import { combatInput, cooldowns, makeMoves, resetCooldowns, useCombatInput, useCooldownVersion, type Moves } from "../../systems/combatInput";
import { useTouchUi } from "../../systems/inputMode";
import { glass, hudText, pillButton } from "./glass";

// The Velvet Ring's HUD, for everyone on its map:
//
//   the scoreboard   (top) the two corners' names, each fighter's Composure (🧠) and Stamina (⚡)
//                    bars and knockdowns, the round and its clock; the warm-up's countdown with
//                    the pools and the odds; the ten-count, big; the result banner
//   a fighter's own  the controls: on a keyboard and mouse their hints (left click Jab, right click
//                    Heavy Hook, Space Guard, R + WASD Sway) with each one's cooldown; on a touch
//                    screen the combat cluster (bottom right: the 👊 Jab, and round it 🛡️ Block,
//                    🥊 Heavy Hook and 💨 Dodge, each with its cooldown sweeping round it); down on
//                    the canvas, the call to mash; out of a round, a way back down the steps
//   the effects      a golden flash on a Perfect Parry, a red flush for a fighter hit
//
// The controls themselves are systems/combatInput.ts (the packets go out on the "boxing" channel).

interface Props {
  me: PlayerState;
  localSessionId: string;
  send: (packet: BoxingPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

export function BoxingHud({ me, localSessionId, send, subscribeMessages }: Props) {
  const bout = useBout();
  const clock = useBoutClock();
  const touch = useTouchUi();
  const corner = cornerOfSession(bout, localSessionId);
  const mine = corner ? bout[corner] : null;
  const inRing = !!corner && me.corner !== "";
  const phase = bout.phase;
  const downed = inRing && phase === "count" && mine?.state === "down";
  const fighting = inRing && (phase === "fight" || phase === "count" || phase === "rest" || phase === "warmup");
  const moves = useMemo(() => makeMoves(send), [send]);
  useCombatInput(fighting, moves);
  useEffect(() => {
    combatInput.downed = downed;
    return () => {
      combatInput.downed = false;
    };
  }, [downed]);
  // a new round: every cooldown ready again
  useEffect(() => {
    if (phase === "fight") resetCooldowns();
  }, [bout.round, phase]);

  // the effects: a golden flash (a Perfect Parry), a red flush (a hit taken)
  const [flash, setFlash] = useState<{ kind: "gold" | "hit"; id: number } | null>(null);
  const flashId = useRef(0);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "boxEvent") return;
        const ev = payload as BoxEvent;
        if (ev.kind === "parry" && (ev.by === localSessionId || ev.to === localSessionId)) setFlash({ kind: "gold", id: ++flashId.current });
        else if (ev.kind === "hit" && ev.to === localSessionId) setFlash({ kind: "hit", id: ++flashId.current });
      }),
    [subscribeMessages, localSessionId]
  );
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 450);
    return () => window.clearTimeout(t);
  }, [flash]);

  let result: BoutResult | null = null;
  try {
    result = phase === "result" && bout.result ? (JSON.parse(bout.result) as BoutResult) : null;
  } catch {
    result = null;
  }
  const show = phase !== "open" || !!bout.red.sessionId || !!bout.blue.sessionId;
  const myBet = parseBet(bout.bets[localSessionId]);

  return (
    <>
      {flash && <div key={flash.id} style={flash.kind === "gold" ? goldFlash : hitFlash} aria-hidden />}
      {show && (
        <div className="cozy-hud-block" style={board}>
          <div style={row}>
            <FighterCard corner="red" f={bout.red} you={corner === "red"} />
            <div style={middle}>
              {phase === "fight" && <Clock label={`ROUND ${bout.round}`} secs={clock} />}
              {phase === "rest" && <Clock label={`ROUND ${bout.round + 1} IN`} secs={clock} />}
              {phase === "warmup" && <Clock label="WARM-UP" secs={clock} hint={`🎟️ Bets open · ${oddsText(bout.pools, "red")} / ${oddsText(bout.pools, "blue")}`} />}
              {phase === "count" && (
                <div style={countBox}>
                  <div style={countNum}>{bout.count}</div>
                  <div style={tiny}>Coach Bruno counts</div>
                </div>
              )}
              {phase === "open" && <div style={tiny}>{bout.red.sessionId ? "Blue corner is open" : "Red corner is open"}</div>}
              {phase === "result" && <div style={tiny}>The result</div>}
            </div>
            <FighterCard corner="blue" f={bout.blue} you={corner === "blue"} />
          </div>
          {result && (
            <div style={banner}>
              {result.winner ? (
                <>
                  🏆 <b>{result.winnerName}</b> wins by {METHOD_LABEL[result.method]}
                  {result.purse > 0 && <span style={dim}> · +{result.purse} 🪙 purse</span>}
                  {result.belt && <span style={{ color: "#ffd76a" }}> · 👑 NEW VELVET CHAMPION</span>}
                </>
              ) : (
                <>{result.method === "nocontest" ? "🤚 No Contest: every bet goes back" : "🤝 A draw on the judges' cards: every bet goes back"}</>
              )}
            </div>
          )}
          {!inRing && myBet && phase !== "result" && (
            <div style={ticket}>
              🎟️ Your ticket: {myBet.amount} 🪙 on the <span style={{ color: CORNER_COLOR[myBet.side] }}>{CORNER_NAME[myBet.side]}</span> ({oddsText(bout.pools, myBet.side)})
            </div>
          )}
        </div>
      )}

      {inRing && (
        <div className="cozy-hud-block" style={touch ? fighterBarTouch : fighterBar}>
          {downed && mine ? (
            <MashPrompt taps={mine.taps} need={mine.need} touch={touch} onTap={() => moves.jab()} />
          ) : (
            <>
              {phase === "open" && <div style={pill}>🥊 Waiting for a challenger in the {corner === "red" ? CORNER_NAME.blue : CORNER_NAME.red}…</div>}
              {phase === "warmup" && <div style={pill}>🔔 The bell rings in {clock}s: shadowbox, stretch, stare them down</div>}
              {phase === "rest" && <div style={pill}>🪣 Catch your breath: composure and stamina come back a little</div>}
              {!touch && (phase === "fight" || phase === "warmup") && <KeyHints />}
            </>
          )}
          {(phase === "open" || phase === "warmup" || phase === "result") && (
            <button type="button" style={ghostBtn} onClick={() => send({ type: "LEAVE_RING" })}>
              🚪 Leave the Ring
            </button>
          )}
          {(phase === "fight" || phase === "rest") && !downed && (
            <button type="button" style={ghostBtn} onClick={() => send({ type: "LEAVE_RING" })} title="Leaving mid-bout is a forfeit">
              🏳️ Throw in the Towel
            </button>
          )}
        </div>
      )}

      {inRing && touch && (phase === "fight" || phase === "warmup") && !downed && <CombatCluster moves={moves} />}
    </>
  );
}

function FighterCard({ corner, f, you }: { corner: Corner; f: FighterView; you: boolean }) {
  const colour = CORNER_COLOR[corner];
  const flip = corner === "blue";
  return (
    <div style={{ ...card, alignItems: flip ? "flex-end" : "flex-start", borderColor: you ? "#ffd76a" : "rgba(255,255,255,0.1)" }}>
      <div style={{ ...name, color: colour, flexDirection: flip ? "row-reverse" : "row" }}>
        <span>{corner === "red" ? "🔴" : "🔵"}</span>
        <span style={nameText}>{f.name || "—"}</span>
        {f.away && <span title="Connection dropped: the bout waits a moment">📡</span>}
        {Array.from({ length: f.knockdowns }, (_, i) => (
          <span key={i} title="Knockdowns">💫</span>
        ))}
      </div>
      {f.sessionId && (
        <>
          <Bar label="🧠" value={f.composure} max={COMPOSURE_MAX} colour="#e5577a" flip={flip} title="Composure: 0 and you're down" />
          <Bar label="⚡" value={f.stamina} max={STAMINA_MAX} colour="#f2c14e" flip={flip} title="Stamina: punches and the guard spend it" />
        </>
      )}
    </div>
  );
}

function Bar({ label, value, max, colour, flip, title }: { label: string; value: number; max: number; colour: string; flip: boolean; title: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ ...barRow, flexDirection: flip ? "row-reverse" : "row" }} title={title}>
      <span style={{ fontSize: 11 }}>{label}</span>
      <div style={barTrack}>
        <div style={{ ...barFill, width: `${pct}%`, background: colour, marginLeft: flip ? "auto" : 0 }} />
      </div>
    </div>
  );
}

function Clock({ label, secs, hint }: { label: string; secs: number; hint?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={tiny}>{label}</div>
      <div style={clockText}>
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
      </div>
      {hint && <div style={{ ...tiny, whiteSpace: "nowrap" }}>{hint}</div>}
    </div>
  );
}

function MashPrompt({ taps, need, touch, onTap }: { taps: number; need: number; touch: boolean; onTap: () => void }) {
  const pct = need > 0 ? Math.min(100, (taps / need) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button type="button" style={mashBtn} onPointerDown={(e) => (e.preventDefault(), onTap())}>
        💫 {touch ? "TAP TAP TAP to get up!" : "Mash Space or click to get up!"}
      </button>
      <div style={{ ...barTrack, width: 220, height: 10 }}>
        <div style={{ ...barFill, width: `${pct}%`, background: "#7ee08a" }} />
      </div>
    </div>
  );
}

// --- the keyboard's hints, each with its cooldown -------------------------------------------------

function KeyHints() {
  useCooldownVersion();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 100);
    return () => window.clearInterval(t);
  }, []);
  const now = performance.now();
  const left = (at: number) => Math.max(0, (at - now) / 1000);
  const hint = (keys: string, label: string, wait: number) => (
    <span style={{ ...keyHint, opacity: wait > 0 ? 0.5 : 1 }}>
      <b>{keys}</b> {label}
      {wait > 0 && <span style={dim}> {wait.toFixed(1)}s</span>}
    </span>
  );
  return (
    <div className="kbd-hint" style={hintsRow}>
      {hint("Left click", "Jab", left(cooldowns.jab))}
      {hint("Right click", "Heavy Hook", left(cooldowns.hook))}
      {hint("Space", "Guard", left(cooldowns.guard))}
      {hint("R + WASD", "Sway", left(cooldowns.sway))}
    </div>
  );
}

// --- the touch combat cluster: the Jab, and round it Block, Heavy Hook and Dodge ------------------

function CombatCluster({ moves }: { moves: Moves }) {
  useCooldownVersion();
  return (
    <div className="cozy-hud-block touch-hint" style={cluster} aria-label="Combat controls">
      <RoundButton size={76} at={{ right: 0, bottom: 0 }} emoji="👊" label="Jab" readyAt={cooldowns.jab} total={MOVES.jab.cooldown * 1000} onDown={() => moves.jab()} />
      <RoundButton size={48} at={{ right: 14, bottom: 92 }} emoji="🛡️" label="Block" readyAt={cooldowns.guard} total={GUARD.cooldown * 1000} onDown={() => moves.guard(true)} onUp={() => moves.guard(false)} />
      <RoundButton size={48} at={{ right: 80, bottom: 62 }} emoji="🥊" label="Hook" readyAt={cooldowns.hook} total={MOVES.hook.cooldown * 1000} onDown={() => moves.hook()} />
      <RoundButton size={48} at={{ right: 92, bottom: -4 }} emoji="💨" label="Dodge" readyAt={cooldowns.sway} total={SWAY.cooldown * 1000} onDown={() => moves.sway()} />
    </div>
  );
}

/** A round button with its cooldown sweeping round it (a dark wedge shrinking clockwise). */
function RoundButton({ size, at, emoji, label, readyAt, total, onDown, onUp }: { size: number; at: { right: number; bottom: number }; emoji: string; label: string; readyAt: number; total: number; onDown: () => void; onUp?: () => void }) {
  const wedge = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let raf = 0;
    const r = size / 4;
    const circ = 2 * Math.PI * r;
    const frame = () => {
      const left = Math.max(0, readyAt - performance.now());
      const k = total > 0 ? left / total : 0;
      if (wedge.current) wedge.current.style.strokeDashoffset = String(circ * (1 - k));
      if (left > 0) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [readyAt, total, size]);
  const r = size / 4;
  const circ = 2 * Math.PI * r;
  const release = onUp ? () => onUp() : undefined;
  return (
    <button
      type="button"
      aria-label={label}
      style={{ ...roundBtn, width: size, height: size, right: at.right, bottom: at.bottom, fontSize: size * 0.42 }}
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
        // (held: the release comes back here even if the thumb slides off)
        try {
          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        } catch {
          // a pointer the browser no longer tracks: the press still counts
        }
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span aria-hidden>{emoji}</span>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, pointerEvents: "none", transform: "rotate(-90deg)" }} aria-hidden>
        <circle ref={wedge} cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(10, 8, 8, 0.62)" strokeWidth={size / 2} strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ} />
      </svg>
      {size > 60 && <span style={roundLabel}>{label}</span>}
    </button>
  );
}

// --- styles ------------------------------------------------------------------------------------------

const board: CSSProperties = {
  ...glass,
  ...hudText,
  position: "absolute",
  top: "max(64px, calc(env(safe-area-inset-top) + 58px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 11,
  borderRadius: 18,
  padding: "8px 12px",
  width: "min(560px, calc(100vw - 24px))",
  pointerEvents: "none",
};
const row: CSSProperties = { display: "flex", alignItems: "stretch", gap: 8 };
const card: CSSProperties = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, padding: "4px 6px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" };
const name: CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontWeight: 800, fontSize: 14, minWidth: 0 };
const nameText: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const middle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", minWidth: 96 };
const barRow: CSSProperties = { display: "flex", alignItems: "center", gap: 4, width: "100%" };
const barTrack: CSSProperties = { flex: 1, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden", display: "flex" };
const barFill: CSSProperties = { height: "100%", borderRadius: 999, transition: "width 120ms linear" };
const tiny: CSSProperties = { fontSize: 11, fontWeight: 700, color: "#d6cfc7", letterSpacing: 0.4 };
const dim: CSSProperties = { color: "#bfb6ad", fontWeight: 600 };
const clockText: CSSProperties = { fontSize: 22, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "#fff8ec" };
const countBox: CSSProperties = { textAlign: "center" };
const countNum: CSSProperties = { fontSize: 44, lineHeight: 1, fontWeight: 900, color: "#ffd166", textShadow: "0 0 18px rgba(255, 190, 60, 0.7)" };
const banner: CSSProperties = { marginTop: 6, textAlign: "center", fontSize: 14, fontWeight: 700, color: "#fff8ec" };
const ticket: CSSProperties = { marginTop: 6, textAlign: "center", fontSize: 12, fontWeight: 700, color: "#e8dccf" };
const fighterBar: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "max(92px, calc(env(safe-area-inset-bottom) + 86px))",
  transform: "translateX(-50%)",
  zIndex: 12,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  pointerEvents: "auto",
  maxWidth: "calc(100vw - 24px)",
};
/** On a touch screen the bar rides above the combat cluster (bottom right), never under it. */
const fighterBarTouch: CSSProperties = { ...fighterBar, bottom: "max(236px, calc(env(safe-area-inset-bottom) + 230px))", maxWidth: "min(360px, calc(100vw - 32px))" };
const pill: CSSProperties = { ...glass, ...hudText, borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 700, textAlign: "center" };
const hintsRow: CSSProperties = { ...glass, ...hudText, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, borderRadius: 14, padding: "6px 12px", fontSize: 12 };
const keyHint: CSSProperties = { whiteSpace: "nowrap" };
const ghostBtn: CSSProperties = { ...pillButton, background: "rgba(28, 25, 23, 0.72)", border: "1px solid rgba(255,255,255,0.14)", minHeight: 40 };
const mashBtn: CSSProperties = { ...pillButton, fontSize: 18, fontWeight: 900, padding: "16px 26px", minHeight: 64, background: "linear-gradient(180deg, #ffd166, #f4a83a)", color: "#3b2410", boxShadow: "0 6px 22px rgba(255, 190, 60, 0.6)", touchAction: "manipulation" };
const cluster: CSSProperties = { position: "absolute", right: "max(22px, calc(env(safe-area-inset-right) + 16px))", bottom: "max(26px, calc(env(safe-area-inset-bottom) + 20px))", width: 180, height: 180, zIndex: 13, pointerEvents: "none" };
const roundBtn: CSSProperties = {
  position: "absolute",
  borderRadius: "50%",
  border: "2px solid rgba(255, 236, 200, 0.55)",
  background: "radial-gradient(circle at 35% 30%, rgba(255, 214, 150, 0.95), rgba(196, 96, 40, 0.92))",
  boxShadow: "0 6px 18px rgba(0,0,0,0.45), inset 0 -3px 0 rgba(90, 30, 10, 0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  pointerEvents: "auto",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  padding: 0,
  cursor: "pointer",
};
const roundLabel: CSSProperties = { position: "absolute", bottom: 6, left: 0, right: 0, textAlign: "center", fontSize: 11, fontWeight: 900, color: "#3b2410", fontFamily: "var(--font-cozy)" };
const goldFlash: CSSProperties = { position: "fixed", inset: 0, zIndex: 9, pointerEvents: "none", background: "radial-gradient(circle at 50% 50%, rgba(255, 215, 110, 0.0) 30%, rgba(255, 200, 80, 0.55) 100%)", animation: "cozy-ring-flash 450ms ease-out forwards" };
const hitFlash: CSSProperties = { position: "fixed", inset: 0, zIndex: 9, pointerEvents: "none", background: "radial-gradient(circle at 50% 50%, rgba(200, 30, 30, 0) 45%, rgba(200, 30, 30, 0.42) 100%)", animation: "cozy-ring-flash 450ms ease-out forwards" };
