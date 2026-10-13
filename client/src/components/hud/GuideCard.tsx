import { useEffect, useState } from "react";
import type { FishingProfile } from "@shared/fishing";
import { GUIDE_BONUS, guideProgress, guideStep } from "@shared/guide";

// The Newcomer's Guide (shared/guide.ts), in the top-left corner under the buffs' row: the one step in
// hand as a small chip (its number and title), opened by a tap into a card with how to do it and what
// it pays. Folded or open is the viewer's own choice, kept in this browser; a new step opens the card
// once so its hint is seen. Gone for good once the chain is done.

const KEY = "cozy_guide_open";
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (v: string) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* (a private window: the choice lasts the visit) */
  }
};

export function GuideCard({ profile }: { profile: FishingProfile }) {
  const step = guideStep(profile.guide);
  const at = guideProgress(profile.guide);
  // (the step this browser last folded the card on: any other step shows open)
  const [folded, setFolded] = useState<string | null>(read);
  useEffect(() => {
    if (folded !== null) write(folded);
  }, [folded]);
  if (!step) return null;
  const open = folded !== step.id;
  const last = at.done === at.all - 1;
  return (
    <div className="pointer-events-none fixed z-[33] w-[min(280px,calc(100vw-24px))]" style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 86px)", left: "max(10px, env(safe-area-inset-left))" }}>
      {open ? (
        <section className="clay-pop pointer-events-auto rounded-2xl border border-[#f5c46b]/50 bg-[#231B18]/92 p-2.5 text-[#F7EBE1] shadow-lg" aria-label="Newcomer's Guide">
          <header className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#f5c46b]">
              🧭 Guide · {at.done + 1}/{at.all}
            </span>
            <span className="ml-auto rounded-full bg-[#f5c46b]/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#f5c46b]">
              +{step.coins + (last ? GUIDE_BONUS : 0)} 🪙
            </span>
            <button type="button" className="-my-2 -mr-1.5 grid h-8 w-8 place-items-center rounded-full text-sm text-[#F7EBE1]/70 hover:text-[#F7EBE1]" onClick={() => setFolded(step.id)} aria-label="Fold the guide">
              ▾
            </button>
          </header>
          <h3 className="mt-0.5 text-[13px] font-bold leading-snug">
            <span aria-hidden>{step.emoji}</span> {step.title}
          </h3>
          <p className="mt-1 text-[11.5px] leading-snug text-[#F7EBE1]/80">{step.hint}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#F7EBE1]/12" aria-hidden>
            <div className="h-full rounded-full bg-[#f5c46b]" style={{ width: `${(at.done / at.all) * 100}%` }} />
          </div>
        </section>
      ) : (
        <button type="button" className="clay-pop pointer-events-auto flex max-w-full items-center gap-1.5 rounded-full border border-[#f5c46b]/50 bg-[#231B18]/88 py-1 pl-2 pr-2.5 text-[11px] font-bold text-[#F7EBE1] shadow" onClick={() => setFolded("")} aria-label={`Newcomer's Guide, step ${at.done + 1} of ${at.all}: ${step.title}. Open`}>
          <span aria-hidden>🧭</span>
          <span className="tabular-nums text-[#f5c46b]">
            {at.done + 1}/{at.all}
          </span>
          <span className="truncate">{step.title}</span>
        </button>
      )}
    </div>
  );
}
