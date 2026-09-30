import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SAFE_AREA } from "./Modal";

// A game at work in the world (docs/caverns-roadmap.md phase 4): a compact sheet at the foot of the
// screen, the camera framing the work above it (scene/prospectCamera.ts `spot`), so what you do
// happens in the cave rather than on a panel over it. The world stays in view but out of reach (a
// stray tap on it is no walk away from the work); Escape and ✕ close it, as a panel's.

export function WorkSheet({ title, icon, onClose, children }: { title: string; icon: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="ui-modal fixed inset-0 z-[60]" style={SAFE_AREA} role="presentation">
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#1C1614]/70 to-transparent" aria-hidden />
      {/* (centred by its row: the pop-in's transform would undo a translate) */}
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: "max(10px, env(safe-area-inset-bottom))" }}>
        <div role="dialog" aria-label={title} className="cozy-oak-sheet clay-pop flex w-[min(94vw,520px)] flex-col gap-1.5 rounded-3xl border border-[#4A3A30] px-4 pb-3 pt-2.5 text-[#C9BDB5] shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h2 className="font-cozy flex-1 text-base font-bold tracking-wide text-[#F7EBE1]">{title}</h2>
            <button type="button" onClick={onClose} className="clay-close clay-close-cozy" aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** A result's grade in stars (1 plain .. 3 the best), popped in. */
export function GradeStars({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <div className="flex justify-center gap-1 text-2xl" aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} style={{ filter: i < n ? "drop-shadow(0 0 8px #ffd27a)" : "grayscale(1) opacity(0.3)", animation: i < n ? `clay-pop 0.4s ${0.12 * i}s both` : undefined }}>
          ⭐
        </span>
      ))}
    </div>
  );
}
