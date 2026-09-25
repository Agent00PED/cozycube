import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The one modal shell every panel uses: a frosted clay card centred on desktop, a bottom sheet
// on phones, closed by the X, the backdrop or Escape. Rendered through a portal so it always
// sits above the canvas and the rest of the HUD.
export function Modal({
  title,
  icon,
  onClose,
  children,
  width = 480,
  tone = "stone",
  fit = false,
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** A tinted variant for the casino tables. */
  tone?: "stone" | "felt" | "velvet";
  /** Sized to fit the viewport whole (90vw, never over 85vh), with no scrolling: for panels laid out to fit (the reel). */
  fit?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toneClass = tone === "felt" ? "bg-emerald-950/85 border-emerald-300/20" : tone === "velvet" ? "bg-[#2a1017]/90 border-amber-200/20" : "bg-stone-900/85 border-white/10";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div
        role="dialog"
        aria-label={title}
        className={`clay-sheet sm:clay-pop flex max-h-[85vh] ${fit ? "w-[90vw] sm:w-[90vw]" : "w-full"} flex-col overflow-hidden rounded-t-3xl border text-stone-100 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md sm:rounded-3xl ${toneClass}`}
        style={{ maxWidth: width }}
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
          {icon && <span className="text-2xl">{icon}</span>}
          <h2 className="font-cozy flex-1 text-lg font-extrabold tracking-wide">{title}</h2>
          <button type="button" onClick={onClose} className="clay-close" aria-label="Close">
            ✕
          </button>
        </div>
        <div className={fit ? "flex min-h-0 flex-1 flex-col justify-between overflow-hidden px-4 pb-[max(14px,env(safe-area-inset-bottom))]" : "scrollbar-none overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]"}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
