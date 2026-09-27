import { useEffect, useRef, useState } from "react";
import { PATCH_CATEGORIES, PATCH_ERAS, type PatchNote } from "../../data/patchNotesData";
import { Modal } from "./Modal";

// The Patch Notes: CozyCube's whole history, from Settings. A 16:9 landscape sheet in Dark Cozy (a
// warm oak card on roasted cocoa, vanilla cream headings, oatmeal text, amber accents; Fredoka): on
// the left the six eras as carved wooden tabs on a timeline, on the right the chosen era's patches,
// newest first, each with its changes under four soft badges (new features, visuals, economy,
// fixes). Only the changelog scrolls; the timeline always fits (on a narrow screen it becomes a strip
// of era tabs over the changelog).

const BADGE_TONE: Record<string, string> = {
  features: "bg-sky-400/15 text-sky-200 border-sky-300/25",
  visuals: "bg-violet-400/15 text-violet-200 border-violet-300/25",
  economy: "bg-[#F5A623]/15 text-[#F8C977] border-[#F5A623]/30",
  fixes: "bg-emerald-400/15 text-emerald-200 border-emerald-300/25",
};
/** Each era's medallion, a soft glow of its own. */
const ERA_TONE = ["bg-[#F5A623]/25", "bg-sky-400/25", "bg-emerald-400/25", "bg-violet-400/25", "bg-rose-400/25", "bg-amber-300/25"];

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
    <Modal title="Patch Notes" icon="📜" onClose={onClose} landscape>
      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
        {/* ---- the timeline: the six eras, as carved wooden tabs ---- */}
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
                    ? "border-[#F5A623]/55 bg-gradient-to-b from-[#6E4A2E] to-[#4A301E] text-[#F7EBE1] shadow-[inset_0_1px_0_rgba(255,220,170,0.25),inset_0_-3px_0_rgba(0,0,0,0.25),0_4px_12px_rgba(0,0,0,0.35)]"
                    : "border-[#4A3A30] bg-gradient-to-b from-[#3A2C25] to-[#2F241E] text-[#C9BDB5] shadow-[inset_0_1px_0_rgba(255,220,170,0.08)] hover:from-[#433229]"
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#F7EBE1] ${ERA_TONE[i % ERA_TONE.length]}`}>{e.era}</span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="whitespace-normal text-[12px] font-semibold">
                    {e.icon} {e.name}
                  </span>
                  <span className={`text-[11px] ${on ? "text-[#F8C977]" : "text-[#9C8B80]"}`}>{e.range}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* ---- the changelog ---- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[20px] border border-[#3F3129] bg-[#231B18]">
          <header className="shrink-0 border-b border-[#3F3129] px-4 pb-2 pt-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h3 className="m-0 text-[17px] font-bold text-[#F7EBE1]">
                Era {current.era} · {current.name}
              </h3>
              <span className="rounded-full bg-[#3A2C25] px-2 py-0.5 text-[11px] font-semibold text-[#F8C977]">{current.range}</span>
            </div>
            <p className="m-0 mt-1 text-[13px] text-[#C9BDB5]">{current.blurb}</p>
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
    <article role="listitem" className="rounded-2xl border border-[#3F3129] bg-[#2B201B] p-3 shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="rounded-full bg-[#F5A623]/20 px-2.5 py-0.5 text-[12px] font-bold text-[#F8C977]">v{patch.version}</span>
        <b className="text-[15px] font-bold text-[#F7EBE1]">{patch.title}</b>
        <span className="ml-auto text-[11px] text-[#9C8B80]">{patch.date}</span>
      </div>
      <p className="m-0 mt-1 text-[13px] text-[#C9BDB5]">{patch.summary}</p>
      <div className="mt-2 flex flex-col gap-2">
        {PATCH_CATEGORIES.filter((c) => patch.changes[c.id]?.length).map((c) => (
          <div key={c.id}>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BADGE_TONE[c.id]}`}>
              {c.icon} {c.label}
            </span>
            <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
              {patch.changes[c.id]!.map((line, i) => (
                <li key={i} className="relative pl-4 text-[13px] leading-snug text-[#C9BDB5]">
                  <span className="absolute left-1 top-[0.5em] h-1.5 w-1.5 rounded-full bg-[#F5A623]/80" aria-hidden />
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
