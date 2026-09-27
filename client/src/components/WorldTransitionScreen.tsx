import { useEffect, useMemo, useRef, useState } from "react";
import type { MapId } from "@shared/types";
import { MAP_LABELS } from "./hud/Header";

// The curtain between worlds: two burgundy velvet drapes sweep shut from either side (CURTAIN_S),
// the destination's icon and name on a gold-fringed card between them with a cozy tip, and part
// again once you have arrived (the new world's first frames settle behind them). A trip is only
// yours: nobody else sees the curtain.

const CURTAIN_S = 0.35;

const TIPS = [
  "Barnaby's prices change on the hour: his chalkboard shows what's ▲ up and ▼ down.",
  "Every fish you sell knocks 2% off the next of its kind this hour. Spread your sales out!",
  "A King Size catch earns a gold crown in your Field Guide 👑",
  "Chat reaches every world: say hi to friends at the campfire from the casino.",
  "Chloe's cheval mirror lets you try an outfit on before you buy it.",
  "Feed the bonfire above 70% for the Cozy Aura: rarer fish and warmer coins for everyone.",
  "Hardwood sells for more than softwood, and carved pieces for more still.",
  "Mr. Vance changes coins into Velvet Chips (and back) one for one.",
  "A bowl of stew keeps you Well-Fed: a bouncier step and quicker bites.",
  "Water the lounge's plants once a day each for a few coins.",
  "Gold on the chopping meter is a critical chop: now and then a coin or a Pine Resin.",
  "A Pine Resin in the workbench's Adhesive Slot bonds a carving so it can't break, or gilds it for a Masterwork.",
  "Bigger creels and carriers cost more each tier, but carry far more.",
];

export function WorldTransitionScreen({ destination }: { destination: MapId | null }) {
  // stays mounted while the drapes part again after arrival
  const [shown, setShown] = useState<MapId | null>(destination);
  const [closing, setClosing] = useState(false);
  const tipIndex = useRef(Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    if (destination) {
      tipIndex.current = Math.floor(Math.random() * TIPS.length);
      setShown(destination);
      setClosing(false);
      return;
    }
    if (!shown) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setShown(null);
      setClosing(false);
    }, CURTAIN_S * 1000 + 40);
    return () => window.clearTimeout(t);
  }, [destination]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = useMemo(() => (shown ? MAP_LABELS[shown] : null), [shown]);
  if (!shown || !label) return null;
  const drape = `absolute top-0 h-full w-1/2 ${closing ? "cozy-curtain-open" : "cozy-curtain-close"}`;
  return (
    <div className="fixed inset-0 z-[60] overflow-hidden" role="status" aria-live="polite" aria-label={`Travelling to ${label.name}`}>
      <style>{CURTAIN_CSS}</style>
      <div className={`${drape} left-0 cozy-velvet`} style={{ transformOrigin: "left" }} data-side="l" />
      <div className={`${drape} right-0 cozy-velvet`} style={{ transformOrigin: "right" }} data-side="r" />
      <div className={`absolute inset-0 flex items-center justify-center p-6 ${closing ? "cozy-curtain-card-out" : "cozy-curtain-card-in"}`}>
        <div className="font-cozy flex max-w-[min(420px,90vw)] flex-col items-center gap-2 rounded-3xl border border-amber-300/50 bg-[#2a0a14]/85 px-6 py-5 text-center text-amber-50 shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,215,140,0.15)]">
          <span className="text-5xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]" aria-hidden>
            {label.icon}
          </span>
          <b className="text-lg tracking-[0.18em] text-amber-200">{label.name.toUpperCase()}</b>
          <span className="text-xs opacity-80">{label.tagline}</span>
          <span className="mt-1 h-px w-24 bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
          <span className="text-[13px] leading-snug text-amber-100/90">💡 {TIPS[tipIndex.current]}</span>
        </div>
      </div>
    </div>
  );
}

const CURTAIN_CSS = `
.cozy-velvet {
  background:
    repeating-linear-gradient(90deg, rgba(0,0,0,0.28) 0 6px, rgba(255,255,255,0.04) 14px, rgba(0,0,0,0.22) 26px),
    radial-gradient(120% 90% at 50% 10%, #8e1b35 0%, #5c0c20 55%, #33040f 100%);
  box-shadow: inset 0 -26px 0 -18px #d7ad57, inset 0 -30px 24px rgba(0,0,0,0.45);
}
.cozy-velvet[data-side="l"] { box-shadow: inset -18px 0 30px rgba(0,0,0,0.45), inset 0 -26px 0 -18px #d7ad57; }
.cozy-velvet[data-side="r"] { box-shadow: inset 18px 0 30px rgba(0,0,0,0.45), inset 0 -26px 0 -18px #d7ad57; }
.cozy-curtain-close { animation: cozy-curtain-close ${CURTAIN_S}s cubic-bezier(0.55, 0.05, 0.35, 1) forwards; }
.cozy-curtain-open { animation: cozy-curtain-open ${CURTAIN_S}s cubic-bezier(0.55, 0.05, 0.35, 1) forwards; }
@keyframes cozy-curtain-close { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes cozy-curtain-open { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.cozy-curtain-card-in { animation: cozy-curtain-card-in ${CURTAIN_S}s ease-out ${CURTAIN_S * 0.6}s both; }
.cozy-curtain-card-out { animation: cozy-curtain-card-out ${CURTAIN_S * 0.6}s ease-in forwards; }
@keyframes cozy-curtain-card-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes cozy-curtain-card-out { to { opacity: 0; transform: scale(0.97); } }
@media (prefers-reduced-motion: reduce) {
  .cozy-curtain-close, .cozy-curtain-open, .cozy-curtain-card-in, .cozy-curtain-card-out { animation-duration: 1ms; }
}
`;
