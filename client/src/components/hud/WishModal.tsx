import { useEffect, useState } from "react";
import { WISH_COST } from "@shared/types";
import { Modal } from "./Modal";

interface Props {
  coins: number;
  result: { fortune: string; lucky: number } | null;
  onWish: () => void;
  onClose: () => void;
}

/** The wishing well: toss a coin, a fortune comes back up, and once in a while the well pays out. */
export function WishModal({ coins, result, onWish, onClose }: Props) {
  const [tossed, setTossed] = useState(false);
  useEffect(() => {
    if (!result) return;
    setTossed(false);
  }, [result]);
  const wish = () => {
    if (coins < WISH_COST) return;
    setTossed(true);
    onWish();
  };
  return (
    <Modal title="Wishing Well" icon="🪙" onClose={onClose} width={400}>
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <span className={`text-6xl ${tossed ? "animate-bounce" : ""}`}>🕳️</span>
        {result ? (
          <div className="clay-pop rounded-2xl bg-sky-300/10 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-widest opacity-60">The well whispers</div>
            <p className="mt-1 text-base font-bold italic">“{result.fortune}”</p>
            {result.lucky > 0 && <p className="mt-2 text-sm font-extrabold text-amber-200">✨ Lucky! {result.lucky} coins come bubbling back up.</p>}
          </div>
        ) : (
          <p className="text-sm opacity-80">Toss a coin, make a wish. The well keeps the coin, but sometimes it gives more back.</p>
        )}
        <button type="button" className="clay-btn clay-btn-amber min-h-14 text-lg" disabled={coins < WISH_COST || tossed} onClick={wish}>
          {tossed ? "…" : `🪙 Toss a coin · ${WISH_COST}`}
        </button>
      </div>
    </Modal>
  );
}
