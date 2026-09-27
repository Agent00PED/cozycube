import { useEffect, useRef, useState } from "react";
import { BIG_SIX_BETS, BIG_SIX_INFO, BIG_SIX_SEGMENTS, BIG_SIX_SPIN_MS, TABLE_LIMITS, bigSixRest, bigSixSpinAngle, bigSixUnder, chipText, limitPlacard, type BigSixBet, type BigSixState } from "@shared/casino";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount } from "./VelvetChipIcon";
import { bigSixPanel } from "./bigSixPanel";

// The Big Six wheel, where the foyer meets the floor: one wheel for the room. Put chips on a
// segment's colour at the ledge (1x, 2x, 5x, 10x, 20x, or the Joker at 40x); the first bet opens the
// betting window, then the croupier's pull sends the wheel round, its leather flapper clicking over
// the pegs, and where it stops pays (the server draws it: "BIGSIX_BET", answered with
// "bigSixState"). The wheel here turns exactly as the one in the hall does (shared bigSixSpinAngle).

interface Props {
  state: BigSixState | null;
  localSessionId: string;
  chips: number;
  coins: number;
  onBet: (bet: BigSixBet, amount: number) => void;
  onClose: () => void;
}

const LIMIT = TABLE_LIMITS.bigsix;
const N = BIG_SIX_SEGMENTS.length;
const LABEL: Record<BigSixBet, string> = { "1": "1", "2": "2", "5": "5", "10": "10", "20": "20", joker: "★" };

/** The wheel, drawn: 53 lacquered segments round a gilt hub, pegs on the rim. */
function Wheel({ angle, highlight }: { angle: number; highlight: number }) {
  const R = 190;
  const seg = (k: number) => {
    const a0 = (k / N) * Math.PI * 2;
    const a1 = ((k + 1) / N) * Math.PI * 2;
    const p = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
    return `M ${p(42, a0)} L ${p(R - 14, a0)} A ${R - 14} ${R - 14} 0 0 1 ${p(R - 14, a1)} L ${p(42, a1)} A 42 42 0 0 0 ${p(42, a0)} Z`;
  };
  return (
    <svg viewBox="-205 -215 410 425" className="h-full max-h-full w-auto" aria-hidden>
      <defs>
        <radialGradient id="six-hub" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="1" stopColor="#9c6b1c" />
        </radialGradient>
      </defs>
      <circle r={R + 6} fill="#2a130b" />
      <g transform={`rotate(${(-angle * 180) / Math.PI})`}>
        <circle r={R} fill="#c9a24a" />
        {BIG_SIX_SEGMENTS.map((b, k) => {
          const mid = ((k + 0.5) / N) * 360;
          return (
            <g key={k}>
              <path d={seg(k)} fill={BIG_SIX_INFO[b].colour} stroke="#c9a24a" strokeWidth={1.2} opacity={highlight === k ? 1 : 0.94} />
              <text transform={`rotate(${mid}) translate(0 ${-(R - 34)}) rotate(0)`} textAnchor="middle" dominantBaseline="middle" fontSize={b === "10" || b === "20" ? 12 : 14} fontWeight={900} fill={BIG_SIX_INFO[b].ink} style={{ fontFamily: "Cinzel, serif", letterSpacing: 0 }}>
                {LABEL[b]}
              </text>
            </g>
          );
        })}
        {BIG_SIX_SEGMENTS.map((_, k) => {
          const a = (k / N) * Math.PI * 2;
          return <circle key={`p${k}`} cx={(R - 6) * Math.sin(a)} cy={-(R - 6) * Math.cos(a)} r={2.6} fill="#e8e2d4" stroke="#6b4a12" strokeWidth={0.6} />;
        })}
        <circle r={42} fill="url(#six-hub)" stroke="#6b4a12" strokeWidth={2} />
        {Array.from({ length: 8 }, (_, k) => (
          <path key={k} d="M 0 -8 L 7 -34 L 0 -28 L -7 -34 Z" fill={k % 2 ? "#fff3cc" : "#8a5a17"} transform={`rotate(${k * 45})`} />
        ))}
      </g>
      {/* the flapper at the top */}
      <path d="M -9 -214 L 9 -214 L 3 -180 L -3 -180 Z" fill="#6b2418" stroke="#2a0c06" strokeWidth={1.5} />
      <circle cy={-212} r={7} fill="#d4a93c" stroke="#6b4a12" strokeWidth={1.5} />
    </svg>
  );
}

export function BigSixModal({ state, localSessionId, chips, coins, onBet, onClose }: Props) {
  const [pick, setPick] = useState<BigSixBet>("1");
  useEffect(() => {
    bigSixPanel.open = true;
    return () => {
      bigSixPanel.open = false;
    };
  }, []);
  const [stake, setStake] = useState<number>(LIMIT.presets[0]);
  const amount = clampStake(stake, LIMIT, chips);
  const phase = state?.phase ?? "betting";

  // the wheel's turn: at rest on the last result, or partway through the spin
  const spin = useRef({ id: -1, at: 0 });
  if (state && state.phase === "spinning" && spin.current.id !== state.spinId) spin.current = { id: state.spinId, at: performance.now() };
  const [angle, setAngle] = useState(() => bigSixRest(state?.result ?? -1));
  const [landed, setLanded] = useState(-1);
  useEffect(() => {
    if (!state) return;
    if (state.phase !== "spinning") {
      setAngle(bigSixRest(state.result));
      return;
    }
    let raf = 0;
    let last = bigSixUnder(bigSixRest(state.prevResult));
    const tick = () => {
      const ms = performance.now() - spin.current.at;
      const a = bigSixSpinAngle(state.prevResult, state.result, ms);
      setAngle(a);
      const under = bigSixUnder(a);
      if (under !== last) {
        last = under;
        playSfx("clicker", 0.5);
      }
      if (ms < BIG_SIX_SPIN_MS) raf = requestAnimationFrame(tick);
      else setLanded(state.result);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state?.phase, state?.spinId]); // eslint-disable-line react-hooks/exhaustive-deps

  // the countdown between the server's words
  const [now, setNow] = useState(() => performance.now());
  const at = useRef({ key: "", t: performance.now() });
  const key = state ? `${state.spinId}:${state.phase}:${state.timeLeft}` : "";
  if (key !== at.current.key) at.current = { key, t: performance.now() };
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const left = state && state.timeLeft > 0 ? Math.max(0, Math.ceil(state.timeLeft - (now - at.current.t) / 1000)) : 0;

  const mine = state?.stakes.filter((s) => s.sessionId === localSessionId) ?? [];
  const won = phase === "settled" ? (state?.paid.find((p) => p.sessionId === localSessionId)?.amount ?? 0) : 0;
  const chimed = useRef(-1);
  useEffect(() => {
    if (phase !== "settled" || !state || chimed.current === state.spinId) return;
    chimed.current = state.spinId;
    if (won > 0) playSfx(BIG_SIX_SEGMENTS[state.result] === "joker" ? "jackpot" : "coins");
  }, [phase, state, won]);
  const result = state && state.result >= 0 ? BIG_SIX_SEGMENTS[state.result] : null;
  const showResult = phase === "settled" && result;

  return (
    <Modal landscape title="The Big Six Wheel" icon="🎡" onClose={onClose} tone="velvet" placard={limitPlacard(LIMIT)}>
      <div className="casino-body flex min-h-0 flex-1 gap-4">
        {/* the wheel */}
        <div className="relative flex min-h-0 flex-[1.1] items-center justify-center overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_50%_40%,#4a1a26,#1c0a10)] p-2">
          <Wheel angle={angle} highlight={phase === "settled" ? (state?.result ?? -1) : landed} />
          {showResult && (
            <div className="casino-win-banner absolute bottom-4 left-1/2 -translate-x-1/2 rounded-2xl border-2 border-amber-300 bg-black/70 px-5 py-2 text-center shadow-[0_0_24px_rgba(255,210,110,0.45)]">
              <div className="casino-heading text-xl tracking-[0.2em]" style={{ color: result === "joker" ? "#f6dc8f" : BIG_SIX_INFO[result].colour }}>
                {BIG_SIX_INFO[result].name}
              </div>
              <div className="text-xs text-amber-50/85">pays {BIG_SIX_INFO[result].pays} to 1</div>
            </div>
          )}
        </div>
        {/* the ledge: the six bets, your stake, the table's wagers */}
        <div className="flex min-h-0 w-[26rem] min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2 rounded-2xl bg-black/30 px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/80">Last spins</span>
            <div className="flex flex-1 flex-wrap gap-1">
              {[...(state?.history ?? [])].slice(0, 12).map((b, i) => (
                <span key={i} className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-black" style={{ background: BIG_SIX_INFO[b].colour, color: BIG_SIX_INFO[b].ink }}>
                  {LABEL[b]}
                </span>
              ))}
            </div>
            <span className="rounded-full border border-amber-300/40 bg-black/40 px-2.5 py-0.5 text-[11px] font-bold text-amber-100">
              {phase === "betting" ? (left ? `No more bets in ${left}s` : "Place your bets") : phase === "spinning" ? "The wheel turns…" : "Settled"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {BIG_SIX_BETS.map((b) => {
              const on = mine.find((s) => s.bet === b);
              return (
                <button key={b} type="button" disabled={phase !== "betting"} onClick={() => setPick(b)} aria-pressed={pick === b} className={`flex flex-col items-center rounded-2xl border-2 px-2 py-2 shadow-[0_3px_0_rgba(0,0,0,0.45)] transition-transform active:translate-y-0.5 disabled:opacity-60 ${pick === b ? "border-amber-300 ring-2 ring-amber-300 ring-offset-2 ring-offset-black/40" : "border-white/25"}`} style={{ background: BIG_SIX_INFO[b].colour, color: BIG_SIX_INFO[b].ink }}>
                  <span className="casino-heading text-lg tracking-[0.1em]">{b === "joker" ? "★ Joker" : BIG_SIX_INFO[b].name}</span>
                  <span className="text-[11px] font-bold opacity-85">pays {BIG_SIX_INFO[b].pays}:1 · {BIG_SIX_SEGMENTS.filter((x) => x === b).length} of {N}</span>
                  {on && (
                    <span className="mt-0.5 rounded-full bg-black/45 px-1.5 text-[10px] text-amber-100">
                      <ChipAmount n={on.amount} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {phase === "betting" ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/30 p-2">
              <BetPicker limit={LIMIT} chips={chips} value={amount} onChange={setStake} />
              <button type="button" disabled={chips < amount || chips < LIMIT.min} onClick={() => onBet(pick, amount)} className="clay-btn clay-btn-amber min-h-11 w-full text-base">
                Bet {pick === "joker" ? "the Joker" : BIG_SIX_INFO[pick].name} · <ChipAmount n={amount} />
              </button>
              <ShortOfChips limit={LIMIT} chips={chips} coins={coins} />
            </div>
          ) : (
            <div className="flex min-h-[5.5rem] items-center justify-center rounded-2xl bg-black/30 p-2 text-center text-sm">
              {phase === "settled" && mine.length ? (
                won > 0 ? (
                  <span className="rounded-full bg-amber-300 px-4 py-1.5 font-extrabold text-amber-950">
                    +<ChipAmount n={won} /> back
                  </span>
                ) : (
                  <span className="opacity-80">Not this spin. The ledge is open again in a moment.</span>
                )
              ) : (
                <span className="opacity-80">{mine.length ? "Your chips ride on the wheel." : phase === "spinning" ? "Watching this one: bet on the next spin." : "No bet on this spin."}</span>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/25 p-2">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/80">At the ledge</div>
            <div className="flex flex-wrap gap-1 text-[11px]">
              {(state?.stakes ?? []).slice(0, 14).map((s, i) => (
                <span key={i} className={`rounded-full px-2 py-0.5 ${s.sessionId === localSessionId ? "bg-amber-300/25 text-amber-100" : "bg-white/10"}`}>
                  {s.username} · {s.bet === "joker" ? "★" : BIG_SIX_INFO[s.bet].name} {chipText(s.amount)}
                </span>
              ))}
              {!state?.stakes.length && <span className="opacity-50">No chips down yet. The first bet opens the window.</span>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
