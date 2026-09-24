import { useEffect, useRef, useState } from "react";
import { MATCHA_REWARD_MAX } from "@shared/types";
import { Modal } from "./Modal";

// The tea ceremony: whisk in rhythm. A marker sweeps across a bar; tap when it is in the
// green. Eight strokes; the share of good strokes is the score (matcha_whisk -> matchaResult),
// and a good bowl comes with a cup of tea in hand.
const STROKES = 8;
const SWEEP_MS = 1100;

interface Props {
  result: { coins: number } | null;
  onWhisk: (score: number) => void;
  onClose: () => void;
}

export function MatchaModal({ result, onWhisk, onClose }: Props) {
  const [pos, setPos] = useState(0);
  const [strokes, setStrokes] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const start = useRef(performance.now());
  const doneRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const u = ((now - start.current) % SWEEP_MS) / SWEEP_MS;
      setPos(u < 0.5 ? u * 2 : (1 - u) * 2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tap = () => {
    if (doneRef.current) return;
    const good = pos > 0.6 && pos < 0.9;
    const next = [...strokes, good];
    setStrokes(next);
    if (next.length >= STROKES) {
      doneRef.current = true;
      setDone(true);
      const score = next.filter(Boolean).length / STROKES;
      onWhisk(score);
    }
  };

  const good = strokes.filter(Boolean).length;
  return (
    <Modal title="Tea Ceremony" icon="🍵" onClose={onClose} width={420}>
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <span className="text-6xl">🍵</span>
        {done ? (
          <div className="clay-pop">
            <b className="text-lg">
              {good}/{STROKES} clean strokes
            </b>
            <p className="mt-1 text-sm opacity-80">{result ? (result.coins > 0 ? `The host slips you ${result.coins} coins and a warm cup.` : "A little frothy. The kettle needs a minute before the next bowl.") : "Whisked…"}</p>
            <button type="button" className="clay-btn clay-btn-mint mt-3" onClick={onClose}>
              🙏 Thank the host
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm opacity-80">Whisk in rhythm: tap when the marker is in the green. {STROKES} strokes.</p>
            <div className="relative h-8 w-full overflow-hidden rounded-full bg-white/10">
              <div className="absolute inset-y-0 rounded-full bg-emerald-400/50" style={{ left: "60%", width: "30%" }} />
              <div className="absolute inset-y-1 w-2 rounded-full bg-amber-200" style={{ left: `calc(${pos * 100}% - 4px)` }} />
            </div>
            <div className="flex gap-1">
              {Array.from({ length: STROKES }, (_, i) => (
                <span key={i} className={`h-3 w-3 rounded-full ${i < strokes.length ? (strokes[i] ? "bg-emerald-300" : "bg-rose-300") : "bg-white/15"}`} />
              ))}
            </div>
            <button type="button" className="clay-btn clay-btn-amber min-h-14 w-full text-lg" onPointerDown={tap}>
              🥄 Whisk
            </button>
            <span className="text-xs opacity-60">A perfect bowl earns up to {MATCHA_REWARD_MAX} coins.</span>
          </>
        )}
      </div>
    </Modal>
  );
}
