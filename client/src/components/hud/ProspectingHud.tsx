import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CAVERNS_CHANNELS, ORE_KINDS, STREAK_MAX, STREAK_STEP } from "@shared/caverns_mining";
import { ORE_NODE_AT } from "@shared/worlds/caverns";
import { useBlow, useCleanBreak, useProspect } from "../../systems/prospectStore";
import { ORE_ITEMS, type OreItemId } from "@shared/caverns_mining";
import { isTouchUi } from "../../systems/inputMode";
import { tipDue, tipMastered, tipSeen } from "./firstTips";

// Prospecting's HUD (the rock and its ring are the interface: scene/ProspectingView), all of it clear
// of the rock in the middle of the screen:
//
//   the rock    its name and tier, and how far it has cracked (a meter filling as the strikes land,
//               everyone's), under the header
//   the run     your run of Perfects and what it adds to every haul (a chip under the meter), for as
//               long as it lasts
//   the pop     each of your blows judged, big and brief: PERFECT, Direct, Near, Glanced off, Skid
//   the tip     the first few times, one line at the foot: strike inside the ring as it closes
//   step back   top right, big enough to tap (Escape does the same)

const POP: Record<string, { text: string; color: string }> = {
  perfect: { text: "PERFECT!", color: "#ffe28a" },
  direct: { text: "Direct", color: "#fff4e0" },
  near: { text: "Near", color: "#ffc27a" },
  bedrock: { text: "Glanced off", color: "#c9c2b8" },
  deflect: { text: "Skid!", color: "#bcd8ff" },
};

export function ProspectingHud({ send }: { send: (channel: string, packet?: unknown) => void }) {
  const pr = useProspect();
  const { blow, streak } = useBlow();
  const cleanAt = useCleanBreak();
  useEffect(() => {
    if (!pr) return;
    // (Escape, or a step away with the keys: back from the rock; docs/caverns-roadmap.md R10.5)
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const walk = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase());
      if (e.key !== "Escape" && !walk) return;
      send(CAVERNS_CHANNELS.prospect, { op: "stop" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pr, send]);
  // the tip: the first few close-ups, until a Perfect lands
  const [tip, setTip] = useState(false);
  const opened = useRef("");
  useEffect(() => {
    if (!pr || opened.current === `${pr.node}:${pr.openedAt}`) return;
    opened.current = `${pr.node}:${pr.openedAt}`;
    const due = tipDue("prospect");
    setTip(due);
    if (due) tipSeen("prospect");
  }, [pr]);
  useEffect(() => {
    if (blow?.perfect) {
      tipMastered("prospect");
      setTip(false);
    }
  }, [blow]);
  // (the rock already gone: a Clean Break's pop outlives the close-up)
  if (!pr)
    return performance.now() - cleanAt < 1800 ? (
      <div key={`c${cleanAt}`} className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2" style={{ top: "24%" }}>
        <div style={{ ...popStyle, color: "#9fffd0", fontSize: "clamp(28px, 6.5vw, 48px)" }}>CLEAN BREAK! <span style={{ fontSize: "0.5em" }}>+25% haul</span></div>
      </div>
    ) : null;
  const node = ORE_NODE_AT.get(pr.node);
  const info = node ? ORE_KINDS[node.kind] : null;
  const pop = blow && performance.now() - blow.at < 1300 ? (blow.perfect ? POP.perfect : POP[blow.verdict]) : null;
  const bonus = Math.round(STREAK_STEP * Math.min(STREAK_MAX, streak) * 100);
  return (
    <>
      <div className="pointer-events-none fixed left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1.5" style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 58px)" }}>
        {info && (
          <div className="flex min-w-[210px] flex-col gap-1 rounded-2xl bg-stone-900/75 px-3.5 py-2 text-stone-100 outline outline-1 -outline-offset-1 outline-white/15 backdrop-blur">
            <div className="flex items-center justify-between gap-3 text-[12px] font-bold">
              <span>
                {info.emoji} {info.name}
              </span>
              <span className="opacity-70">T{info.tier}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/50" aria-label={`Cracked ${Math.round(pr.dmg * 100)}%`}>
              <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.max(3, pr.dmg * 100)}%`, background: pr.dmg > 0.6 ? "linear-gradient(90deg,#ffb347,#ff5a3c)" : "linear-gradient(90deg,#f7d58a,#ffb347)" }} />
            </div>
          </div>
        )}
        {streak > 0 && (
          <div className="rounded-full bg-amber-950/80 px-3 py-1 text-[12px] font-extrabold text-amber-200 outline outline-1 -outline-offset-1 outline-amber-300/30">
            🔥 Perfect ×{streak} · +{bonus}% haul
          </div>
        )}
      </div>
      {pop && blow && (
        <div key={blow.at} className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2" style={{ top: "30%" }}>
          <div style={{ ...popStyle, color: pop.color, fontSize: blow.perfect ? "clamp(30px, 7vw, 52px)" : "clamp(20px, 4.5vw, 32px)" }}>
            {pop.text}
            {blow.perfect && streak > 1 && <span style={{ fontSize: "0.55em", marginLeft: 8 }}>×{streak}</span>}
          </div>
        </div>
      )}
      {blow?.bonus && performance.now() - blow.at < 1600 && (
        <div key={`g${blow.at}`} className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2" style={{ top: "38%" }}>
          <div style={{ ...popStyle, color: "#ffd84a", fontSize: "clamp(16px, 3.6vw, 24px)" }}>✨ Lucky glint! +1 {ORE_ITEMS[blow.bonus as OreItemId]?.name ?? "ore"}</div>
        </div>
      )}
      {performance.now() - cleanAt < 1800 && (
        <div key={`c${cleanAt}`} className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2" style={{ top: "24%" }}>
          <div style={{ ...popStyle, color: "#9fffd0", fontSize: "clamp(28px, 6.5vw, 48px)" }}>CLEAN BREAK! <span style={{ fontSize: "0.5em" }}>+25% haul</span></div>
        </div>
      )}
      {tip && (
        <div className="pointer-events-none fixed left-1/2 z-30 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl bg-stone-900/80 px-4 py-2 text-center text-[13px] font-semibold text-amber-100 outline outline-1 -outline-offset-1 outline-amber-200/25 backdrop-blur" style={{ bottom: "calc(max(12px, env(safe-area-inset-bottom)) + 84px)" }}>
          {isTouchUi() ? "Tap" : "Click"} inside the glowing ring on the rock, just as the white ring closes on it: <b className="text-amber-300">Perfect!</b> Perfects in a row mine more; a gold ring is a lucky glint, and a Perfect to finish it is a clean break. Click away or walk to step back.
        </div>
      )}
      <button
        type="button"
        onClick={() => send(CAVERNS_CHANNELS.prospect, { op: "stop" })}
        className="clay-pill-soft pointer-events-auto fixed z-30 flex min-h-12 items-center gap-2 rounded-full bg-stone-900/70 px-4 text-sm font-bold text-stone-100 outline outline-1 -outline-offset-1 outline-white/15 backdrop-blur transition-transform active:scale-95"
        style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 56px)", right: "max(12px, env(safe-area-inset-right))" }}
        title="Step back from the rock (Esc)"
        aria-label={`Step back from the ${info ? info.name : "rock"}`}
      >
        ✕ <span className="hidden sm:inline">Step back</span>
      </button>
    </>
  );
}

const popStyle: CSSProperties = { fontFamily: "var(--font-cozy)", fontWeight: 900, letterSpacing: 1, textAlign: "center", WebkitTextStroke: "1px rgba(0,0,0,0.4)", textShadow: "0 3px 12px rgba(0,0,0,0.55)", animation: "cozy-ring-badge 1.3s ease-out forwards", whiteSpace: "nowrap" };
