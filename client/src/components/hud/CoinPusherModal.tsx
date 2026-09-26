import { memo, useEffect, useRef, useState } from "react";
import { PUSHER_OUTCOMES, TABLE_LIMITS, limitPlacard, pusherAccuracy, pusherBarPos, type PusherResult } from "@shared/casino";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount, VelvetChipIcon } from "./VelvetChipIcon";

// The coin pusher in Neon Alley: a brass dropper sweeps over the shelf; press DROP (or Space) and
// the coin falls where the dropper is. The nearer the middle, the harder the shelf's plate shoves
// the pile: the server rolls what goes over the edge on that accuracy (the "PUSHER_DROP" packet,
// answered with pusherResult), from nothing, through a trickle, to an avalanche, and now and then a
// Bonus Token (a free drop at the same stake).

interface Props {
  result: PusherResult | null;
  chips: number;
  coins: number;
  onDrop: (stake: number, pos: number) => void;
  onClose: () => void;
}

const LIMIT = TABLE_LIMITS.pusher;
/** The shelf's pile: chips at rest, placed once. */
const PILE = Array.from({ length: 34 }, (_, i) => ({ x: 6 + ((i * 37) % 88), y: 8 + ((i * 53) % 40), r: (i * 29) % 360 }));

export function CoinPusherModal({ result, chips, coins, onDrop, onClose }: Props) {
  const [stake, setStake] = useState<number>(LIMIT.presets[0]);
  const bet = clampStake(stake, LIMIT, chips);
  // the dropper's place, read at the drop (the sweep moves it on the DOM, not through React)
  const posRef = useRef(0);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [falling, setFalling] = useState<{ id: number; n: number } | null>(null);
  const [shown, setShown] = useState<PusherResult | null>(null);
  const waiting = useRef(false);
  const t0 = useRef(performance.now());
  const tokens = result?.tokens.length ?? 0;
  const free = tokens > 0;

  // the dropper's sweep, and the aim line under the cabinet
  const dropper = useRef<HTMLDivElement>(null);
  const aim = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const pos = pusherBarPos(performance.now() - t0.current);
      posRef.current = pos;
      if (dropper.current) dropper.current.style.left = `${8 + pos * 84}%`;
      if (aim.current) aim.current.textContent = `${Math.round(pusherAccuracy(pos) * 100)}%`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // what the drop pushed over the edge
  const lastResult = useRef(result);
  useEffect(() => {
    if (!result || result === lastResult.current) return;
    lastResult.current = result;
    waiting.current = false;
    const t = window.setTimeout(() => {
      setShown(result);
      const n = result.outcome === "avalanche" ? 22 : Math.min(14, Math.round((result.payout / Math.max(1, result.stake)) * 4));
      if (n > 0) setFalling({ id: performance.now(), n });
      if (result.outcome === "avalanche") playSfx("jackpot");
      else if (result.payout > 0) playSfx("coins");
      else if (result.outcome === "token") playSfx("sparkle");
      setDropAt(null);
    }, 420);
    return () => window.clearTimeout(t);
  }, [result]);

  const drop = () => {
    if (waiting.current || dropAt !== null) return;
    if (!free && (chips < bet || chips < LIMIT.min)) return;
    waiting.current = true;
    // a drop the server turned down (too quick, or short of chips) sends nothing back
    window.setTimeout(() => {
      if (!waiting.current) return;
      waiting.current = false;
      setDropAt(null);
    }, 2500);
    const pos = posRef.current;
    setDropAt(pos);
    setShown(null);
    playSfx("coinDrop");
    onDrop(bet, pos);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        drop();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const outcome = shown ? PUSHER_OUTCOMES.find((o) => o.id === shown.outcome) : null;

  return (
    <Modal title="The Coin Pusher" icon="🪙" onClose={onClose} width={480} tone="velvet" placard={limitPlacard(LIMIT)}>
      <div className="flex flex-col items-center gap-3 pb-2">
        {/* the cabinet: the dropper's rail, the shelf and its plate, the edge */}
        <div className="relative h-56 w-full overflow-hidden rounded-3xl border-4 border-amber-300/70 bg-gradient-to-b from-[#3a0f1c] to-[#1c070d] shadow-[inset_0_0_30px_rgba(0,0,0,0.7)]">
          {/* the sweet spot and the rail */}
          <div className="absolute left-[8%] right-[8%] top-3 h-2 rounded-full bg-black/50" />
          <div className="absolute top-2 h-4 w-[12%] -translate-x-1/2 rounded-full bg-emerald-400/35" style={{ left: "50%" }} />
          {/* the dropper */}
          <div ref={dropper} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: "8%" }}>
            <div className="h-6 w-8 rounded-b-lg border-2 border-amber-200 bg-gradient-to-b from-amber-300 to-amber-600 shadow" />
            <div className="h-2 w-1 bg-amber-200" />
          </div>
          {/* the coin, dropped */}
          {dropAt !== null && (
            <div className="pusher-drop absolute top-12 -translate-x-1/2 text-2xl" style={{ left: `${8 + dropAt * 84}%` }}>
              <VelvetChipIcon />
            </div>
          )}
          {/* the shelf's pile and the sliding plate */}
          <div className="absolute bottom-10 left-[6%] right-[6%] top-[5.5rem] rounded-xl bg-[#4a1e12]/80">
            <div className="absolute inset-x-0 top-0 h-3 animate-[cozy-bob-kf_1.6s_ease-in-out_infinite] rounded-t-xl bg-gradient-to-b from-stone-300 to-stone-500" />
            <Pile />
          </div>
          {/* the edge, and what goes over it */}
          <div className="absolute bottom-8 left-[6%] right-[6%] h-2 rounded bg-amber-300/70" />
          {falling &&
            Array.from({ length: falling.n }, (_, i) => (
              <span key={`${falling.id}-${i}`} className="pusher-fall absolute text-lg" style={{ left: `${10 + ((i * 41) % 80)}%`, bottom: "2.2rem", animationDelay: `${i * 45}ms` }}>
                <VelvetChipIcon />
              </span>
            ))}
          <div className="absolute bottom-1 left-0 right-0 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-amber-200/60">what falls is yours</div>
        </div>

        <div className="h-6 text-center text-base font-extrabold text-amber-200" role="status">
          {shown && outcome ? (
            <>
              {outcome.name}
              {shown.payout > 0 && (
                <>
                  {" "}
                  +<ChipAmount n={shown.payout} />
                </>
              )}
              {shown.free && <span className="ml-1 text-xs opacity-70">(a free drop)</span>}
            </>
          ) : (
            <span className="text-sm opacity-80">
              Drop it in the green: <span ref={aim}>0%</span> on target
            </span>
          )}
        </div>

        {free ? (
          <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-100">
            {tokens} Bonus Token{tokens > 1 ? "s" : ""}: your next drop is free (<ChipAmount n={result!.tokens[0]} />). Use them before you go!
          </div>
        ) : (
          <BetPicker limit={LIMIT} chips={chips} value={bet} onChange={setStake} disabled={dropAt !== null} label="Per drop" />
        )}
        <button type="button" onClick={drop} disabled={dropAt !== null || (!free && (chips < bet || chips < LIMIT.min))} className="clay-btn clay-btn-rose min-h-12 px-12 text-base">
          DROP {free ? "(free)" : ""} · Space
        </button>
        <ShortOfChips limit={LIMIT} chips={chips} coins={coins} />
      </div>
    </Modal>
  );
}

/** The shelf's pile of chips: drawn once (no shadows, it never moves). */
const Pile = memo(function Pile() {
  return (
    <>
      {PILE.map((c, i) => (
        <span key={i} className="absolute text-base" style={{ left: `${c.x}%`, top: `${14 + c.y}%`, transform: `rotate(${c.r}deg)` }}>
          <VelvetChipIcon size="0.95em" style={{ filter: "none" }} />
        </span>
      ))}
    </>
  );
});
