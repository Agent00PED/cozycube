import { useEffect, useState } from "react";
import { GACHA_COST, OUTFITS, PREMIUM_HATS, type GachaPrize } from "@shared/types";
import { Modal } from "./Modal";
import { playClick, playCoin, playGachaCrank, playGachaDrop, playJingle } from "../../audio/sfx";

interface Props {
  coins: number;
  /** The latest prize from the server (null until the first pull; reset by the parent on open). */
  result: GachaPrize | null;
  onPull: () => void;
  onClose: () => void;
}

// The gachapon: turn the crank, a capsule rattles down, crack it open. The server rolls the
// prize (pull_gacha -> gachaResult); this is the crank, the rattle and the reveal.
export function GachaModal({ coins, result, onPull, onClose }: Props) {
  const [phase, setPhase] = useState<"idle" | "cranking" | "dropped" | "open">("idle");
  const [shown, setShown] = useState<GachaPrize | null>(null);

  useEffect(() => {
    if (!result || phase === "open") return;
    // the capsule lands once the crank has finished turning
    const wait = phase === "idle" ? 0 : 900;
    const t = window.setTimeout(() => {
      playGachaDrop();
      setShown(result);
      setPhase("dropped");
    }, wait);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const pull = () => {
    if (coins < GACHA_COST) return;
    playGachaCrank();
    setShown(null);
    setPhase("cranking");
    onPull();
  };
  const open = () => {
    if (!shown) return;
    if (shown.kind === "coins" || shown.kind === "dupe") playCoin();
    else playJingle();
    setPhase("open");
  };

  const label = (p: GachaPrize) => {
    if (p.kind === "hat") return { emoji: PREMIUM_HATS[p.id].emoji, text: `${PREMIUM_HATS[p.id].name}! Find it in the wardrobe.` };
    if (p.kind === "outfit") return { emoji: OUTFITS[p.id].emoji, text: `${OUTFITS[p.id].name}! A gacha exclusive. It's in your wardrobe.` };
    if (p.kind === "coins") return { emoji: "🪙", text: `${p.amount} coins!` };
    return { emoji: "♻️", text: `A duplicate. Refunded ${p.refund} coins.` };
  };

  return (
    <Modal title="Gachapon Alley" icon="🔮" onClose={onClose} width={420}>
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <div className="relative flex h-44 w-44 items-center justify-center">
          <div className={`absolute inset-0 rounded-full bg-gradient-to-b from-pink-300/30 to-sky-300/20 ${phase === "cranking" ? "animate-pulse" : ""}`} />
          <span className={`text-7xl transition-transform ${phase === "cranking" ? "animate-bounce" : ""}`}>{phase === "open" && shown ? label(shown).emoji : phase === "dropped" ? "🥚" : "🎱"}</span>
          {phase === "dropped" && <span className="clay-pop absolute -bottom-1 rounded-full bg-amber-300 px-3 py-1 text-xs font-extrabold text-amber-950">Tap to open</span>}
        </div>
        {phase === "open" && shown ? (
          <>
            <b className="text-lg">{label(shown).text}</b>
            <button type="button" className="clay-btn clay-btn-amber" disabled={coins < GACHA_COST} onClick={pull}>
              🔮 Again · {GACHA_COST} 🪙
            </button>
          </>
        ) : phase === "dropped" ? (
          <button type="button" className="clay-btn clay-btn-rose" onClick={open}>
            🥚 Crack it open
          </button>
        ) : (
          <>
            <p className="text-sm opacity-80">Hats, a rare cyber jumpsuit, coins, or Mochi's own ears. Every turn of the crank is a surprise.</p>
            <button type="button" className="clay-btn clay-btn-amber min-h-14 text-lg" disabled={coins < GACHA_COST || phase === "cranking"} onClick={pull}>
              {phase === "cranking" ? "Cranking…" : `🔮 Turn the crank · ${GACHA_COST} 🪙`}
            </button>
            {coins < GACHA_COST && <span className="text-xs opacity-60">You need {GACHA_COST} coins.</span>}
          </>
        )}
        <button type="button" className="text-xs opacity-60 hover:opacity-90" onClick={() => (playClick(), onClose())}>
          Walk away
        </button>
      </div>
    </Modal>
  );
}
