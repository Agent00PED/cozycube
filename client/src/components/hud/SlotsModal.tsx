import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SLOT_PAIR, SLOT_SYMBOLS, SLOT_TRIPLE, VAULT_SLOT_ID, limitPlacard, slotLimit, type SlotBroadcast } from "@shared/casino";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount, VelvetChipIcon } from "./VelvetChipIcon";
import { playSfx } from "../../audio/sfx";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";

// A retro-cozy three-reel machine. The server rolls (spin_slots) and broadcasts the reels;
// this panel spins its strips to land on them one after another, ticking as they go, then
// lights the payline and bursts chips if it paid. Stakes and wins are Velvet Chips, within the
// machine's limits (Neon Alley's, or the penthouse's Golden Vault), with an ALL IN up to its
// cap; a pair hands the stake back (a push), three of a kind pays the paytable. The lever is the
// only way to spin: drag its knob down (or tap it) and it ratchets down with a clunk.
const SYMBOLS = SLOT_SYMBOLS as readonly string[];
const N = SYMBOLS.length;
const ROW = 72; // px per symbol row
const REPEATS = 40; // strip length in symbol sets: enough for many spins before a silent reset
const STOP_MS = [900, 1350, 1800];
/** How far the lever's knob travels (px), and how far down a drag must bring it to pull. */
const LEVER_TRAVEL = 64;
const LEVER_PULL = 0.6;

interface Props {
  propId: string;
  /** Velvet Chips: what you can stake (and coins, for the cage's advice when both run out). */
  chips: number;
  coins: number;
  localSessionId: string;
  onSpin: (propId: string, bet: number) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

export function SlotsModal({ propId, chips, coins, localSessionId, onSpin, subscribeMessages, onClose }: Props) {
  const limit = slotLimit(propId);
  const vip = propId === VAULT_SLOT_ID;
  const [stake, setBet] = useState<number>(limit.presets[0]);
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
              if (msg.win > msg.bet) {
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

  // the stake follows the purse (it can't be more than you hold, nor under the machine's minimum)
  const bet = spinning ? stake : clampStake(stake, limit, chips);
  const canPull = !spinning && chips >= bet && bet >= limit.min;
  const pull = () => {
    if (!canPull) return;
    setLever(true);
    playSfx("lever");
    window.setTimeout(() => setLever(false), 450);
    setResult(null);
    onSpin(propId, bet);
  };
  // the lever: drag the knob down past LEVER_PULL of its travel (or just tap it) to pull
  const drag = useRef<{ y0: number; id: number; moved: boolean } | null>(null);
  const [leverDrag, setLeverDrag] = useState(0);
  const onLeverDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canPull) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, id: e.pointerId, moved: false };
  };
  const onLeverMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const f = Math.max(0, Math.min(1, (e.clientY - d.y0) / LEVER_TRAVEL));
    if (f > 0.08) d.moved = true;
    setLeverDrag(f);
  };
  const onLeverUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const f = leverDrag;
    setLeverDrag(0);
    if (!d.moved || f >= LEVER_PULL) pull();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      pull();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const knobY = lever ? LEVER_TRAVEL : leverDrag * LEVER_TRAVEL;

  const landedAll = !spinning && !!result && landed === 3;
  const won = landedAll && result!.win > bet;
  const push = landedAll && result!.win > 0 && !won;
  const strip = Array.from({ length: N * REPEATS }, (_, i) => SYMBOLS[i % N]);

  return (
    <Modal title={vip ? "The Golden Vault" : "Lucky Reels"} icon={vip ? "🏆" : "🎰"} onClose={onClose} width={460} tone="velvet" placard={limitPlacard(limit)}>
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
                  <VelvetChipIcon />
                </span>
              ))}
          </div>
          {/* the lever: a chrome arm on a pivot in the cabinet's side, a red knob on top; drag it
              down (or tap it) to spin */}
          <button
            type="button"
            onPointerDown={onLeverDown}
            onPointerMove={onLeverMove}
            onPointerUp={onLeverUp}
            onPointerCancel={() => ((drag.current = null), setLeverDrag(0))}
            onKeyDown={(e) => (e.key === "Enter" ? pull() : undefined)}
            disabled={!canPull}
            className="relative flex w-16 touch-none select-none flex-col items-center disabled:opacity-50"
            aria-label="Pull the lever to spin"
            title="Pull the lever"
          >
            <span className="relative mt-1 h-[124px] w-full">
              {/* the arm, swinging down about its pivot as the knob comes down */}
              <span className="absolute bottom-3 left-1/2 w-2.5 -translate-x-1/2 rounded-full bg-gradient-to-r from-stone-400 via-stone-100 to-stone-500 shadow" style={{ height: `${Math.max(18, 92 - knobY * 1.1)}px`, transition: drag.current ? "none" : "height 250ms cubic-bezier(0.3, 1.4, 0.6, 1)" }} />
              {/* the knob */}
              <span className="absolute left-1/2 h-11 w-11 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ff9a9a,#d91e2a_55%,#7a0a12)] shadow-[0_4px_10px_rgba(0,0,0,0.5)]" style={{ top: `${knobY}px`, transition: drag.current ? "none" : "top 250ms cubic-bezier(0.3, 1.4, 0.6, 1)" }} />
              {/* the pivot's housing on the cabinet's side */}
              <span className="absolute bottom-0 left-1/2 h-7 w-9 -translate-x-1/2 rounded-lg bg-gradient-to-b from-amber-300 to-amber-700 shadow-inner" />
            </span>
            <span className="kbd-hint mt-1 text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Space</span>
          </button>
        </div>

        <div className="h-7 text-center text-base font-extrabold text-amber-200">
          {spinning ? (
            "Spinning…"
          ) : won ? (
            <>
              🎉 WIN +<ChipAmount n={result!.win} />!
            </>
          ) : push ? (
            "A pair! Your stake back"
          ) : landedAll ? (
            "So close! Try again?"
          ) : (
            "Pick a stake and pull the lever down"
          )}
        </div>

        <BetPicker limit={limit} chips={chips} value={bet} onChange={setBet} disabled={spinning} />
        <ShortOfChips limit={limit} chips={chips} coins={coins} />

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
              <span>any pair (stake back)</span>
              <span className="font-bold text-amber-200">×{SLOT_PAIR}</span>
            </div>
          </div>
        </details>
      </div>
    </Modal>
  );
}
