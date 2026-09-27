import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The one modal shell every panel uses: a frosted clay card centred on desktop, a bottom sheet
// on phones, closed by the X, the backdrop or Escape. Rendered through a portal so it always
// sits above the canvas and the rest of the HUD, inside the safe area (a notch, Discord's own
// overlays): the backdrop is padded by the safe-area insets and a landscape sheet's height leaves
// room for them.

/** The backdrop's padding: at least its own, and never under a notch or Discord's overlays. */
export const SAFE_AREA = {
  paddingTop: "max(8px, env(safe-area-inset-top))",
  paddingBottom: "max(8px, env(safe-area-inset-bottom))",
  paddingLeft: "max(8px, env(safe-area-inset-left))",
  paddingRight: "max(8px, env(safe-area-inset-right))",
} as const;
/** A landscape sheet's height: 85% of the screen, less the safe area's insets. */
const SAFE_LANDSCAPE_H = "min(85vh, calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 16px))";
export function Modal({
  title,
  icon,
  onClose,
  children,
  width,
  tone = "stone",
  fit = false,
  landscape = false,
  placard,
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** A tinted variant for the casino tables. */
  tone?: "stone" | "felt" | "velvet" | "cream";
  /** Sized to fit the viewport whole (90vw, never over 85vh), with no scrolling: for panels laid out to fit (the reel). */
  fit?: boolean;
  /** A 16:9 table in landscape (90vw by 85vh, at most 1200 by 720), laid out to fit with no
   *  scrolling at all: the casino's games. */
  landscape?: boolean;
  /** A brass placard under the title: a casino table's limits ("MIN: 25 | MAX ALL-IN: 1,000"). */
  placard?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toneClass =
    tone === "felt"
      ? "bg-emerald-950/85 border-emerald-300/20 text-stone-100"
      : tone === "velvet"
        ? "bg-[#2a1017]/90 border-amber-200/20 text-stone-100"
        : tone === "cream"
          ? "cozy-cream-sheet border-[#E9DFCC] text-[#4A3728]"
          : "bg-stone-900/85 border-white/10 text-stone-100";
  // the casino's panels (felt and velvet): engraved gold titles, a brass-edged sheet, a velvet ribbon;
  // the cream sheet is CozyCube's own warm paper (Settings' Patch Notes)
  const casino = tone === "felt" || tone === "velvet";
  const cream = tone === "cream";
  const round = cream ? "rounded-[20px]" : "rounded-3xl";

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex justify-center bg-black/45 ${landscape ? "items-center p-2" : "items-end sm:items-center sm:p-4"}`} style={SAFE_AREA} onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div
        role="dialog"
        aria-label={title}
        className={`clay-sheet sm:clay-pop flex ${landscape ? `max-h-[720px] w-[90vw] ${round}` : `max-h-[85vh] ${fit ? "w-[90vw] sm:w-[90vw]" : "w-full"} rounded-t-3xl ${cream ? "sm:rounded-[20px]" : "sm:rounded-3xl"}`} flex-col overflow-hidden border shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md ${toneClass} ${casino ? "casino-sheet casino-body" : ""}`}
        style={{ maxWidth: landscape ? (width ?? 1200) : (width ?? 480), height: landscape ? SAFE_LANDSCAPE_H : undefined }}
      >
        <div className={`flex items-center gap-3 px-5 ${landscape ? "pt-2.5 pb-1" : "pt-4 pb-2"}`}>
          {icon && <span className="text-2xl">{icon}</span>}
          {casino ? (
            <h2 className="casino-title flex-1">
              <span className="gold-foil">{title}</span>
            </h2>
          ) : (
            <h2 className={`font-cozy flex-1 text-lg tracking-wide ${cream ? "font-bold text-[#4A3728]" : "font-extrabold"}`}>{title}</h2>
          )}
          <button type="button" onClick={onClose} className={cream ? "clay-close clay-close-cream" : "clay-close"} aria-label="Close">
            ✕
          </button>
        </div>
        {casino && <div className="casino-ribbon" aria-hidden />}
        {placard && (
          <div className="casino-placard mx-5 mb-1.5 self-center rounded-md border border-[#6b4a12] bg-gradient-to-b from-[#f6dc8f] via-[#d9a843] to-[#9c6b1c] px-3 py-0.5 text-center text-[11px] tracking-[0.18em] text-[#3a2206] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_2px_6px_rgba(0,0,0,0.45)]" style={{ textShadow: "0 1px 0 rgba(255,240,200,0.6)" }}>
            {placard}
          </div>
        )}
        <div className={landscape ? "flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3" : fit ? "flex min-h-0 flex-1 flex-col justify-between overflow-hidden px-4 pb-[max(14px,env(safe-area-inset-bottom))]" : "scrollbar-none overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]"}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
