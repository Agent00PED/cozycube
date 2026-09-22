import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { playPop } from "../../audio/sfx";

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
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** A tinted variant for the casino tables. */
  tone?: "stone" | "felt" | "velvet";
}) {
  useEffect(() => {
    playPop();
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
        className={`clay-sheet sm:clay-pop flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border text-stone-100 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md sm:rounded-3xl ${toneClass}`}
        style={{ maxWidth: width }}
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
          {icon && <span className="text-2xl">{icon}</span>}
          <h2 className="font-cozy flex-1 text-lg font-extrabold tracking-wide">{title}</h2>
          <button type="button" onClick={onClose} className="clay-icon-btn bg-white/10 hover:bg-white/20" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body
  );
}
