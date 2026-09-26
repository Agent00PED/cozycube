import type { FortuneResult } from "@shared/casino";
import { Modal } from "./Modal";
import { VelvetChipIcon } from "./VelvetChipIcon";

// Madame Zara's card: the reading her booth prints (the owl on its roof hoots as it does). One a
// day: asked again, she hands you the same card; a lucky reading comes with a few chips, once.

export function FortuneModal({ fortune, onClose }: { fortune: FortuneResult; onClose: () => void }) {
  return (
    <Modal title="Madame Zara" icon="🔮" onClose={onClose} width={420} tone="velvet">
      <div className="flex flex-col items-center gap-3 pb-2">
        <div className="clay-pop relative w-full rounded-2xl border-2 border-amber-300/60 bg-gradient-to-b from-[#3a1d4f] to-[#1d0f2a] px-5 py-6 text-center shadow-[0_0_40px_rgba(155,107,224,0.3)]">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.35em] text-amber-200/80">✦ Your fortune ✦</div>
          <p className="m-0 text-lg font-bold italic leading-snug text-amber-50">“{fortune.text}”</p>
          <div className="mt-3 text-2xl" aria-hidden>
            🌙 🦉 ✨
          </div>
        </div>
        {fortune.again ? (
          <div className="text-center text-sm opacity-80">Madame Zara reads each palm but once a day. Come back tomorrow for a new card.</div>
        ) : fortune.lucky ? (
          <div className="rounded-full bg-emerald-400/20 px-4 py-2 text-sm font-extrabold text-emerald-200">A lucky reading! +{fortune.chips} Velvet Chips <VelvetChipIcon /></div>
        ) : (
          <div className="text-center text-sm opacity-80">The owl blinks knowingly. Tomorrow, another card.</div>
        )}
        <button type="button" onClick={onClose} className="clay-btn clay-btn-amber min-h-11 px-6">
          Thank you, Madame
        </button>
      </div>
    </Modal>
  );
}
