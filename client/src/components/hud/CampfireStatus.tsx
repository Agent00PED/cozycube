import type { CSSProperties } from "react";
import { LOW_FUEL, STEW_SLOTS, hasCozyAura } from "@shared/bonfire";
import type { HearthState } from "../../hooks/useColyseusRoom";

// Small, quiet pills at the top-left under the room selector while at the campfire: how the
// bonfire is doing (and the Cozy Aura while it roars), the Dutch oven's pot, and your Well-Fed
// time left. Low-contrast glass, so they inform without pressing.

export function CampfireStatus({ hearth, fed }: { hearth: HearthState; fed: number }) {
  const { fuel, stew } = hearth;
  const aura = hasCozyAura(fuel);
  const low = fuel < LOW_FUEL;
  return (
    <div style={wrapStyle} className="pointer-events-none" aria-label="Campfire">
      <span className={`${PILL} ${aura ? "text-amber-100/90" : low ? "text-rose-100/85" : ""}`} title={aura ? "Cozy Aura: +15% rare fish and campfire coins" : low ? "The fire is burning low: add firewood" : "The bonfire's fuel"}>
        <span aria-hidden>{low ? "💨" : "🔥"}</span>
        <span className="relative h-1 w-9 overflow-hidden rounded-full bg-white/10">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fuel}%`, background: aura ? "#ffd166" : low ? "#9a7a6a" : "#ff8c32", opacity: 0.85 }} />
        </span>
        <span className="tabular-nums">{fuel}%</span>
        {aura && <span className="opacity-90">✨ Aura</span>}
      </span>
      {stew.phase !== "gathering" || stew.items.length > 0 ? (
        <span className={PILL} title="The Dutch oven over the fire">
          <span aria-hidden>🫕</span>
          {stew.phase === "gathering" ? `${stew.items.length}/${STEW_SLOTS}` : stew.phase === "cooking" ? `${Math.round(stew.progress * 100)}%` : `Stew ×${stew.servings}`}
        </span>
      ) : null}
      {fed > 0 && (
        <span className={PILL} title="Well-Fed: a bouncier step, and fish bite sooner">
          <span aria-hidden>😋</span>
          <span className="tabular-nums">
            {Math.floor(fed / 60)}:{String(fed % 60).padStart(2, "0")}
          </span>
        </span>
      )}
    </div>
  );
}

const PILL = "flex h-6 items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2 text-[11px] font-semibold text-white/80 backdrop-blur";
const wrapStyle: CSSProperties = {
  position: "absolute",
  top: "calc(max(8px, env(safe-area-inset-top)) + 50px)",
  left: "max(10px, env(safe-area-inset-left))",
  zIndex: 11,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 5,
};
