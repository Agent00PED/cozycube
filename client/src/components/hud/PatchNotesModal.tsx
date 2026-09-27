import { useEffect, useRef, useState } from "react";
import { PATCH_CATEGORIES, PATCH_ERAS, type PatchNote } from "../../data/patchNotesData";
import { Modal } from "./Modal";

// The Patch Notes: CozyCube's whole history, from Settings. A 16:9 landscape sheet of CozyCube's own
// warm paper (cream, Fredoka, soft 20px corners): on the left the six eras as wood-carved tabs on a
// timeline, on the right the chosen era's patches, newest first, each with its changes under four
// pastel badges (new features, visuals, economy, fixes). Only the changelog scrolls; the timeline
// always fits (on a narrow screen it becomes a strip of era tabs over the changelog).

const BADGE_TONE: Record<string, string> = {
  features: "bg-[#E4F1FF] text-[#2F5F8F] border-[#C9E0F8]",
  visuals: "bg-[#F1E7FF] text-[#6A4AA0] border-[#DFD0F7]",
  economy: "bg-[#FFF3CC] text-[#8A6412] border-[#F5E2A2]",
  fixes: "bg-[#E2F6EA] text-[#2F7A4F] border-[#C6EBD5]",
};
/** Each era's medallion, a pastel of its own. */
const ERA_TONE = ["bg-[#FFE3CC]", "bg-[#E4F1FF]", "bg-[#E2F6EA]", "bg-[#F1E7FF]", "bg-[#FFF3CC]", "bg-[#FFE1E6]"];

export function PatchNotesModal({ onClose }: { onClose: () => void }) {
  // the newest era first
  const [era, setEra] = useState(PATCH_ERAS.length - 1);
  const current = PATCH_ERAS[era];
  // a new era starts its changelog at the top
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pane.current?.scrollTo({ top: 0 });
  }, [era]);

  return (
    <Modal title="Patch Notes" icon="📜" onClose={onClose} landscape tone="cream">
      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
        {/* ---- the timeline: the six eras, as wood-carved tabs ---- */}
        <nav aria-label="Eras" className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 sm:w-[250px] sm:flex-col sm:gap-1.5 sm:overflow-visible sm:pb-0">
          {PATCH_ERAS.map((e, i) => {
            const on = i === era;
            return (
              <button
                key={e.era}
                type="button"
                onClick={() => setEra(i)}
                aria-current={on ? "true" : undefined}
                className={`relative flex min-h-12 shrink-0 items-center gap-2.5 rounded-2xl border px-2.5 py-1.5 text-left transition-colors sm:min-h-0 sm:flex-1 ${
                  on
                    ? "border-[#6B4226] bg-gradient-to-b from-[#9A6A43] to-[#6E4527] text-[#FFF6E8] shadow-[inset_0_1px_0_rgba(255,236,210,0.45),inset_0_-3px_0_rgba(0,0,0,0.18),0_4px_10px_rgba(110,69,39,0.3)]"
                    : "border-[#E8D9C2] bg-gradient-to-b from-[#FBF3E6] to-[#F2E4CF] text-[#5B4331] shadow-[inset_0_1px_0_#fff,inset_0_-2px_0_rgba(110,69,39,0.08)] hover:from-[#FFF6EA]"
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#5B4331] shadow-[inset_0_-2px_0_rgba(0,0,0,0.08)] ${ERA_TONE[i % ERA_TONE.length]}`}>{e.era}</span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="whitespace-normal text-[12px] font-semibold">
                    {e.icon} {e.name}
                  </span>
                  <span className={`text-[11px] ${on ? "text-[#FFE7CF]/85" : "text-[#8A6A52]"}`}>{e.range}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* ---- the changelog ---- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[20px] border border-[#EFE4D2] bg-white/70">
          <header className="shrink-0 border-b border-[#F0E6D6] px-4 pb-2 pt-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h3 className="m-0 text-[17px] font-bold text-[#4A3728]">
                Era {current.era} · {current.name}
              </h3>
              <span className="rounded-full bg-[#F3EBDD] px-2 py-0.5 text-[11px] font-semibold text-[#6B4F3A]">{current.range}</span>
            </div>
            <p className="m-0 mt-1 text-[13px] text-[#4A3728]/75">{current.blurb}</p>
          </header>
          <div ref={pane} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" role="list" aria-label={`Era ${current.era} patches`}>
            <div className="flex flex-col gap-3">
              {[...current.patches].reverse().map((p) => (
                <PatchCard key={p.version} patch={p} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function PatchCard({ patch }: { patch: PatchNote }) {
  return (
    <article role="listitem" className="rounded-2xl border border-[#F0E6D6] bg-[#FFFDF9] p-3 shadow-[0_2px_8px_rgba(110,69,39,0.06)]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="rounded-full bg-[#FFE3CC] px-2.5 py-0.5 text-[12px] font-bold text-[#8A4B1C]">v{patch.version}</span>
        <b className="text-[15px] font-bold text-[#4A3728]">{patch.title}</b>
        <span className="ml-auto text-[11px] text-[#8A6A52]">{patch.date}</span>
      </div>
      <p className="m-0 mt-1 text-[13px] text-[#4A3728]/80">{patch.summary}</p>
      <div className="mt-2 flex flex-col gap-2">
        {PATCH_CATEGORIES.filter((c) => patch.changes[c.id]?.length).map((c) => (
          <div key={c.id}>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BADGE_TONE[c.id]}`}>
              {c.icon} {c.label}
            </span>
            <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
              {patch.changes[c.id]!.map((line, i) => (
                <li key={i} className="relative pl-4 text-[13px] leading-snug text-[#4A3728]/90">
                  <span className="absolute left-1 top-[0.5em] h-1.5 w-1.5 rounded-full bg-[#E7B98A]" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  );
}
