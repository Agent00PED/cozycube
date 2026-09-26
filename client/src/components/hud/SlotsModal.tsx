import { useEffect, useRef, useState } from "react";
import { SLOT_BETS, SLOT_PAIR, SLOT_SYMBOLS, SLOT_TRIPLE, type SlotBroadcast } from "@shared/casino";
import { Modal } from "./Modal";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";

// A retro-cozy three-reel machine. The server rolls (spin_slots) and broadcasts the reels;
// this panel spins its strips to land on them one after another, ticking as they go, then
// lights the payline and bursts coins if it paid.
const SYMBOLS = SLOT_SYMBOLS as readonly string[];
const N = SYMBOLS.length;
const ROW = 72; // px per symbol row
const REPEATS = 40; // strip length in symbol sets: enough for many spins before a silent reset
const STOP_MS = [900, 1350, 1800];

interface Props {
  propId: string;
  coins: number;
  localSessionId: string;
  onSpin: (propId: string, bet: number) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

export function SlotsModal({ propId, coins, localSessionId, onSpin, subscribeMessages, onClose }: Props) {
  const [bet, setBet] = useState<number>(SLOT_BETS[0]);
  const [spinning, setSpinning] = useState(false);
  const [lever, setLever] = useState(false);
  const [result, setResult] = useState<{ reels: number[]; win: number } | null>(null);
  const [landed, setLanded] = useState(0); // how many reels have stopped
  const [burst, setBurst] = useState(0);
  // each reel's cumulative row offset (only ever grows, so the strip keeps scrolling downward)
  const rows = useRef([0, 1, 2]);
  const [pos, setPos] = useState<number[]>([0, 1, 2]);
  const [noTransition, setNoTransition] = useState(false);
  const tickTimer = useRef(0);

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "slotSpin") return;
        const msg = payload as SlotBroadcast;
        if (msg.propId !== propId || msg.sessionId !== localSessionId) return;
        // Land each reel on its symbol after 3+ full turns, one reel after another.
        const next = rows.current.map((r, i) => {
          const current = ((r % N) + N) % N;
          const forward = (msg.reels[i] - current + N) % N;
          return r + N * (3 + i) + forward;
        });
        rows.current = next;
        setPos(next);
        setResult({ reels: msg.reels, win: msg.win });
        setLanded(0);
        setSpinning(true);
        STOP_MS.forEach((ms, i) =>
          window.setTimeout(() => {
            setLanded(i + 1);
            if (i === 2) {
              window.clearInterval(tickTimer.current);
              setSpinning(false);
              if (msg.win > 0) {
                setBurst((b) => b + 1);
              }
            }
          }, ms)
        );
      }),
    [subscribeMessages, propId, localSessionId]
  );
  useEffect(() => () => window.clearInterval(tickTimer.current), []);

  // Keep the strips from scrolling off the end: quietly rewind by whole sets between spins.
  useEffect(() => {
    if (spinning) return;
    if (rows.current.some((r) => r > N * (REPEATS - 8))) {
      const rewound = rows.current.map((r) => r - N * (REPEATS - 12));
      rows.current = rewound;
      setNoTransition(true);
      setPos(rewound);
      const t = window.setTimeout(() => setNoTransition(false), 30);
      return () => window.clearTimeout(t);
    }
  }, [spinning]);

  const pull = () => {
    if (spinning || coins < bet) return;
    setLever(true);
    window.setTimeout(() => setLever(false), 450);
    setResult(null);
    onSpin(propId, bet);
  };

  const won = !spinning && result && result.win > 0 && landed === 3;
  const strip = Array.from({ length: N * REPEATS }, (_, i) => SYMBOLS[i % N]);

  return (
    <Modal title="Lucky Reels" icon="🎰" onClose={onClose} width={440} tone="velvet">
      <div className="flex flex-col items-center gap-4 pb-2">
        <div className="relative flex w-full items-stretch justify-center gap-3">
          {/* the cabinet window */}
          <div className={`relative flex gap-2 rounded-3xl border-4 border-amber-300/70 bg-[#1a0c10] p-3 shadow-[inset_0_0_30px_rgba(0,0,0,0.6)] ${won ? "reel-win" : ""}`}>
            {pos.map((p, i) => (
              <div key={i} className="relative h-[72px] w-[72px] overflow-hidden rounded-2xl bg-gradient-to-b from-stone-100 to-stone-300 shadow-inner">
                <div className="reel-strip absolute left-0 top-0 w-full" style={{ transform: `translateY(${-p * ROW}px)`, transition: noTransition ? "none" : `transform ${STOP_MS[i]}ms cubic-bezier(0.15, 0.9, 0.3, 1.02)` }}>
                  {strip.map((sym, k) => (
                    <div key={k} className={`flex h-[72px] items-center justify-center text-4xl ${sym === "7" ? "font-serif font-black text-red-600" : ""}`}>
                      {sym}
                    </div>
                  ))}
                </div>
                {/* window shading */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/35" />
              </div>
            ))}
            {/* payline */}
            <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-0.5 -translate-y-1/2 bg-amber-300/50" />
            {won &&
              Array.from({ length: 14 }, (_, i) => (
                <span key={`${burst}-${i}`} className="coin-burst left-1/2 top-1/2 text-xl" style={{ ["--dx" as string]: `${(Math.random() - 0.5) * 220}px`, ["--dy" as string]: `${-60 - Math.random() * 120}px` }}>
                  🪙
                </span>
              ))}
          </div>
          {/* the lever */}
          <button type="button" onClick={pull} disabled={spinning || coins < bet} className="relative flex w-12 flex-col items-center justify-start disabled:opacity-50" aria-label="Pull the lever" title="Pull!">
            <span className={`h-16 w-2 rounded-full bg-stone-300 transition-transform duration-300 ${lever ? "translate-y-10 scale-y-50" : ""}`} style={{ transformOrigin: "bottom" }} />
            <span className={`-mt-1 h-7 w-7 rounded-full bg-gradient-to-b from-red-400 to-red-600 shadow-lg transition-transform duration-300 ${lever ? "translate-y-10" : ""}`} />
            <span className="mt-1 h-10 w-4 rounded-b-xl bg-stone-600" />
          </button>
        </div>

        <div className="h-7 text-center text-base font-extrabold text-amber-200">
          {spinning ? "Spinning…" : won ? `🎉 WIN +${result!.win} coins!` : result && landed === 3 ? "So close! Try again?" : "Pick a stake and pull the lever"}
        </div>

        <div className="flex items-center gap-2">
          {SLOT_BETS.map((b) => (
            <button key={b} type="button" onClick={() => (setBet(b))} disabled={spinning} className={`clay-btn min-h-11 px-4 text-sm ${bet === b ? "clay-btn-amber" : "clay-btn-ghost"}`}>
              🪙 {b}
            </button>
          ))}
          <button type="button" onClick={pull} disabled={spinning || coins < bet} className="clay-btn clay-btn-rose px-6">
            SPIN
          </button>
        </div>
        {coins < bet && <div className="text-xs text-rose-200">Not enough coins for that stake.</div>}

        <details className="w-full rounded-2xl bg-white/5 px-4 py-2 text-xs">
          <summary className="cursor-pointer font-bold">Paytable</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {SYMBOLS.map((s, i) => (
              <div key={s} className="flex justify-between">
                <span>
                  {s} {s} {s}
                </span>
                <span className="font-bold text-amber-200">×{SLOT_TRIPLE[i]}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span>any pair</span>
              <span className="font-bold text-amber-200">×{SLOT_PAIR}</span>
            </div>
          </div>
        </details>
      </div>
    </Modal>
  );
}
