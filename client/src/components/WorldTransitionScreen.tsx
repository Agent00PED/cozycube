import { useEffect, useMemo, useRef, useState } from "react";
import type { MapId } from "@shared/types";
import { MAP_LABELS } from "./hud/Header";

// The curtain between worlds: two burgundy velvet drapes sweep shut from either side (CURTAIN_S),
// the destination's icon and name on a gold-fringed card between them with a cozy tip, and part
// again once you have arrived (the new world's first frames settle behind them). A trip is only
// yours: nobody else sees the curtain. Between the campfire and the Whispering Woods (next door,
// through the archway) there is no curtain: a dark cocoa dusk with drifting fog fades in and out in
// FOG_S, a softly glowing pine over "Entering the Whispering Woods..." (or back to the campfire).

const CURTAIN_S = 0.35;
const FOG_S = 0.3;
const CAMP = new Set<MapId>(["campfire_night", "whispering_woods"]);

const TIPS = [
  "Barnaby's prices change on the hour: his chalkboard shows what's ▲ up and ▼ down.",
  "Sell more than 30 of one kind in an hour and its price starts to slide. What nobody sells climbs back up!",
  "A King Size catch earns a gold crown in your Field Guide 👑",
  "Chat reaches every world: say hi to friends at the campfire from the casino.",
  "Chloe's cheval mirror lets you try an outfit on before you buy it.",
  "Feed the bonfire above 70% for the Cozy Aura: rarer fish and warmer coins for everyone.",
  "Hardwood sells for more than softwood, and carved pieces for more still.",
  "Mr. Vance changes coins into Velvet Chips (and back) one for one.",
  "A bowl of stew keeps you Well-Fed: a bouncier step and quicker bites.",
  "Water the lounge's plants once a day each for a few coins.",
  "Swing when the felling ring meets the gold: a critical swing, now and then a coin or a Pine Resin.",
  "A bigger tree's logs are worth more: size squared. Watch for the Colossal Titan in the woods!",
  "A King-Size Surge's golden ripples: reel by hand in them for a 4 in 10 King Size catch.",
  "A Pine Resin in the workbench's Adhesive Slot bonds a carving so it can't break, or gilds it for a Masterwork.",
  "Bigger creels and carriers cost more each tier, but carry far more.",
];

export function WorldTransitionScreen({ destination, from }: { destination: MapId | null; from?: MapId }) {
  // stays mounted while the drapes part again after arrival
  const [shown, setShown] = useState<MapId | null>(destination);
  const [closing, setClosing] = useState(false);
  // a walk through the archway (the campfire and the woods): the mist, decided as the trip starts
  const [misty, setMisty] = useState(false);
  const tipIndex = useRef(Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    if (destination) {
      tipIndex.current = Math.floor(Math.random() * TIPS.length);
      if (!shown) setMisty(!!from && CAMP.has(from) && CAMP.has(destination));
      setShown(destination);
      setClosing(false);
      return;
    }
    if (!shown) return;
    setClosing(true);
    const t = window.setTimeout(
      () => {
        setShown(null);
        setClosing(false);
      },
      (misty ? FOG_S : CURTAIN_S) * 1000 + 40
    );
    return () => window.clearTimeout(t);
  }, [destination]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = useMemo(() => (shown ? MAP_LABELS[shown] : null), [shown]);
  if (!shown || !label) return null;
  if (misty) {
    const woods = shown === "whispering_woods";
    return (
      <div className={`cozy-mist fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 ${closing ? "cozy-mist-out" : "cozy-mist-in"}`} role="status" aria-live="polite" aria-label={woods ? "Entering the Whispering Woods" : `Walking to ${label.name}`}>
        <style>{CURTAIN_CSS}</style>
        <span className="cozy-mist-fog" aria-hidden />
        <span className="cozy-pine-glow text-6xl" aria-hidden>
          {woods ? "🌲" : "🔥"}
        </span>
        <b className="font-cozy relative text-base tracking-[0.2em] text-[#F7EBE1]">{woods ? "Entering the Whispering Woods..." : "Back to the Starlight Campfire..."}</b>
      </div>
    );
  }
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

export const CURTAIN_CSS = `
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
.cozy-mist {
  background: radial-gradient(90% 70% at 50% 45%, #3a2a22 0%, #231915 60%, #140e0b 100%);
  overflow: hidden;
}
.cozy-mist-fog {
  position: absolute; inset: -20%;
  background:
    radial-gradient(40% 25% at 25% 70%, rgba(210, 200, 185, 0.22), rgba(210, 200, 185, 0) 70%),
    radial-gradient(45% 30% at 75% 35%, rgba(200, 190, 175, 0.18), rgba(200, 190, 175, 0) 70%),
    radial-gradient(35% 20% at 55% 85%, rgba(220, 210, 195, 0.2), rgba(220, 210, 195, 0) 70%);
  filter: blur(8px);
  animation: cozy-fog-drift 3s ease-in-out infinite alternate;
}
@keyframes cozy-fog-drift { from { transform: translateX(-3%); } to { transform: translateX(3%); } }
.cozy-pine-glow {
  position: relative;
  filter: drop-shadow(0 0 10px rgba(143, 240, 170, 0.75)) drop-shadow(0 0 24px rgba(245, 190, 90, 0.45));
  animation: cozy-pine-pulse 1.2s ease-in-out infinite alternate;
}
@keyframes cozy-pine-pulse { from { transform: scale(0.97); opacity: 0.9; } to { transform: scale(1.04); opacity: 1; } }
.cozy-mist-in { animation: cozy-mist-in ${FOG_S}s ease-out forwards; }
.cozy-mist-out { animation: cozy-mist-out ${FOG_S}s ease-in forwards; }
@keyframes cozy-mist-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes cozy-mist-out { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .cozy-curtain-close, .cozy-curtain-open, .cozy-curtain-card-in, .cozy-curtain-card-out, .cozy-mist-in, .cozy-mist-out { animation-duration: 1ms; }
  .cozy-mist-fog, .cozy-pine-glow { animation: none; }
}
`;
