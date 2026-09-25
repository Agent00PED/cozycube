import type { CSSProperties } from "react";
import { LOW_FUEL, STEW_SLOTS, hasCozyAura } from "@shared/bonfire";
import type { HearthState } from "../../hooks/useColyseusRoom";

// A strip of small chips under the header at the campfire: how the bonfire is doing (and the Cozy
// Aura while it roars), the Dutch oven's pot, and your Well-Fed time left.

export function CampfireStatus({ hearth, fed }: { hearth: HearthState; fed: number }) {
  const { fuel, stew } = hearth;
  const aura = hasCozyAura(fuel);
  const low = fuel < LOW_FUEL;
  return (
    <div style={wrapStyle} className="pointer-events-none" aria-label="Campfire">
      <span className={`${CHIP} ${aura ? "cozy-aura-chip text-amber-100" : low ? "text-rose-100" : ""}`} title={aura ? "Cozy Aura: +15% rare fish and campfire coins" : low ? "The fire is burning low: add firewood" : "The bonfire's fuel"}>
        <span aria-hidden>{low ? "💨" : "🔥"}</span>
        <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-black/35">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fuel}%`, background: aura ? "#ffd166" : low ? "#9a7a6a" : "#ff8c32" }} />
        </span>
        <span className="tabular-nums">{fuel}%</span>
        {aura && <span>✨ Aura</span>}
      </span>
      {stew.phase !== "gathering" || stew.items.length > 0 ? (
        <span className={CHIP} title="The Dutch oven over the fire">
          <span aria-hidden>🫕</span>
          {stew.phase === "gathering" ? `${stew.items.length}/${STEW_SLOTS}` : stew.phase === "cooking" ? `${Math.round(stew.progress * 100)}%` : `Stew's up! ×${stew.servings}`}
        </span>
      ) : null}
      {fed > 0 && (
        <span className={`${CHIP} text-emerald-100`} title="Well-Fed: a bouncier step, and fish bite sooner">
          <span aria-hidden>😋</span>
          <span className="tabular-nums">
            {Math.floor(fed / 60)}:{String(fed % 60).padStart(2, "0")}
          </span>
        </span>
      )}
    </div>
  );
}

const CHIP = "flex h-7 items-center gap-1.5 rounded-full bg-[rgba(30,24,34,0.72)] px-2.5 text-xs font-bold shadow-[0_2px_8px_rgba(0,0,0,0.25)] outline outline-1 outline-white/10 backdrop-blur-sm";
const wrapStyle: CSSProperties = {
  position: "absolute",
  top: "calc(max(12px, env(safe-area-inset-top)) + 54px)",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 11,
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  justifyContent: "center",
  maxWidth: "calc(100vw - 32px)",
};
