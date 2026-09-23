import { useEffect, useRef, useState } from "react";
import { CLAW_COST, CLAW_WIN_COINS } from "@shared/types";
import { Modal } from "./Modal";
import { playClick, playCoin, playPop } from "../../audio/sfx";

interface Props {
  coins: number;
  result: { won: boolean; target: number } | null;
  onPlay: (aim: number) => void;
  onClose: () => void;
}

// The claw machine: the claw sweeps left and right over the plush pile, you drop it, the server
// says whether it gripped (claw_play {aim} -> clawResult). The plush's real spot is only
// revealed afterwards, so it is a game of timing, not of reading the screen.
export function ClawModal({ coins, result, onPlay, onClose }: Props) {
  const [aim, setAim] = useState(0.5);
  const [phase, setPhase] = useState<"sweep" | "dropping" | "done">("sweep");
  const posRef = useRef(0.5);
  const dirRef = useRef(1);

  useEffect(() => {
    if (phase !== "sweep") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      posRef.current += dirRef.current * dt * 0.75;
      if (posRef.current > 1) (posRef.current = 1), (dirRef.current = -1);
      if (posRef.current < 0) (posRef.current = 0), (dirRef.current = 1);
      setAim(posRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (!result || phase !== "dropping") return;
    const t = window.setTimeout(() => {
      if (result.won) playCoin();
      else playPop();
      setPhase("done");
    }, 1100);
    return () => window.clearTimeout(t);
  }, [result, phase]);

  const drop = () => {
    if (coins < CLAW_COST) return;
    playClick();
    setPhase("dropping");
    onPlay(posRef.current);
  };
  const again = () => {
    setPhase("sweep");
  };

  return (
    <Modal title="Claw Machine" icon="🧸" onClose={onClose} width={440}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="relative h-44 overflow-hidden rounded-2xl border border-pink-300/30 bg-[#1b1a33]">
          {/* the plush pile: the real target only shows once the claw has dropped */}
          <div className="absolute inset-x-0 bottom-0 flex h-14 items-end justify-around px-3 text-3xl">
            {["🧸", "🐻", "🐰", "🧸", "🐼"].map((e, i) => (
              <span key={i} className={phase !== "sweep" && result && Math.abs(i / 4 - result.target) < 0.13 ? "cozy-coin-bump" : "opacity-70"}>
                {e}
              </span>
            ))}
          </div>
          {/* the claw */}
          <div className={`absolute top-2 text-3xl transition-[top] ${phase === "dropping" ? "duration-1000 ease-in top-[96px]" : phase === "done" ? "top-2 duration-700" : ""}`} style={{ left: `calc(${aim * 100}% - 16px)` }}>
            🪝
          </div>
          {phase === "done" && result && (
            <div className="clay-pop absolute inset-x-0 top-10 text-center">
              <span className="rounded-full bg-stone-900/85 px-4 py-2 text-base font-extrabold">{result.won ? `Got it! +${CLAW_WIN_COINS} 🪙 and a plush` : "Slipped away…"}</span>
            </div>
          )}
        </div>
        {phase === "done" ? (
          <button type="button" className="clay-btn clay-btn-amber min-h-14 text-lg" disabled={coins < CLAW_COST} onClick={again}>
            🧸 Play again · {CLAW_COST} 🪙
          </button>
        ) : (
          <button type="button" className="clay-btn clay-btn-rose min-h-14 text-lg" disabled={coins < CLAW_COST || phase === "dropping"} onClick={drop}>
            {phase === "dropping" ? "Dropping…" : `⬇️ Drop the claw · ${CLAW_COST} 🪙`}
          </button>
        )}
        <p className="text-center text-xs opacity-60">Time your drop over the pile. A clean grip pays {CLAW_WIN_COINS} coins and a plush for your bag.</p>
      </div>
    </Modal>
  );
}
