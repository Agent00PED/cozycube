import { useEffect, useRef, useState } from "react";
import { PATCH_CATEGORIES, PATCH_ERAS, type PatchNote } from "../../data/patchNotesData";
import { Modal } from "./Modal";

// The Patch Notes: CozyCube's whole history, from Settings. A 16:9 landscape panel in the casino's
// Art-Deco dress (Cinzel capitals, gold foil, brass): on the left the six eras as a timeline, on the
// right the chosen era's patches, newest first, each with its changes under the four badges (new
// features, visuals, economy, fixes). Only the changelog scrolls; the timeline always fits (on a
// narrow screen it becomes a strip of era chips over the changelog).

const BADGE_TONE: Record<string, string> = {
  features: "border-sky-300/35 bg-sky-400/10 text-sky-100",
  visuals: "border-fuchsia-300/35 bg-fuchsia-400/10 text-fuchsia-100",
  economy: "border-amber-300/40 bg-amber-400/10 text-amber-100",
  fixes: "border-emerald-300/35 bg-emerald-400/10 text-emerald-100",
};

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
    <Modal title="Patch Notes" icon="📜" onClose={onClose} landscape tone="velvet">
      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
        {/* ---- the timeline: the six eras ---- */}
        <nav aria-label="Eras" className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 sm:w-[260px] sm:flex-col sm:gap-0 sm:overflow-visible sm:pb-0">
          {PATCH_ERAS.map((e, i) => {
            const on = i === era;
            return (
              <button
                key={e.era}
                type="button"
                onClick={() => setEra(i)}
                aria-current={on ? "true" : undefined}
                className={`group relative flex shrink-0 items-center gap-2.5 rounded-2xl px-2.5 py-1.5 text-left transition-colors sm:min-h-0 sm:flex-1 ${on ? "bg-gradient-to-r from-[#c9962e]/25 to-transparent outline outline-1 -outline-offset-1 outline-[#d4a93c]/50" : "hover:bg-white/5"}`}
              >
                {/* the timeline's rail, joining the eras' medallions (on wide screens) */}
                {i < PATCH_ERAS.length - 1 && <span className="absolute left-[27px] top-[calc(50%+16px)] hidden h-[calc(100%-32px)] w-0.5 bg-gradient-to-b from-[#d4a93c]/60 to-[#d4a93c]/15 sm:block" aria-hidden />}
                <span className={`casino-numeral relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${on ? "border-[#f6dc8f] bg-gradient-to-b from-[#f6dc8f] via-[#d9a843] to-[#9c6b1c] text-[#3a2206] shadow-[0_0_12px_rgba(246,220,143,0.55)]" : "border-[#d4a93c]/45 bg-[#1a0a0e] text-[#e8c872]"}`}>{e.era}</span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className={`casino-heading whitespace-normal text-[11px] uppercase !tracking-[0.05em] ${on ? "text-[#f6dc8f]" : "text-stone-200/85"}`}>
                    {e.icon} {e.name}
                  </span>
                  <span className="casino-numeral text-[10.5px] text-[#d4a93c]/80">{e.range}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* ---- the changelog ---- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-3xl border border-[#d4a93c]/25 bg-black/25">
          <header className="shrink-0 border-b border-[#d4a93c]/20 px-4 pb-2 pt-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h3 className="casino-title m-0 text-base">
                <span className="gold-foil">
                  Era {current.era} · {current.name}
                </span>
              </h3>
              <span className="casino-numeral text-xs text-[#d4a93c]">{current.range}</span>
            </div>
            <p className="casino-voice m-0 mt-0.5 text-[13px] text-stone-200/80">{current.blurb}</p>
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
    <article role="listitem" className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="casino-placard rounded-md border border-[#6b4a12] bg-gradient-to-b from-[#f6dc8f] via-[#d9a843] to-[#9c6b1c] px-2 py-0.5 text-[11px] tracking-[0.12em] text-[#3a2206] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">v{patch.version}</span>
        <b className="casino-heading text-[13px] uppercase text-[#f6dc8f]">{patch.title}</b>
        <span className="casino-numeral ml-auto text-[11px] text-stone-300/60">{patch.date}</span>
      </div>
      <p className="m-0 mt-1 text-[13px] text-stone-200/85">{patch.summary}</p>
      <div className="mt-2 flex flex-col gap-2">
        {PATCH_CATEGORIES.filter((c) => patch.changes[c.id]?.length).map((c) => (
          <div key={c.id}>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE_TONE[c.id]}`}>
              {c.icon} {c.label}
            </span>
            <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
              {patch.changes[c.id]!.map((line, i) => (
                <li key={i} className="relative pl-4 text-[12.5px] leading-snug text-stone-100/90">
                  <span className="absolute left-1 top-[0.45em] h-1.5 w-1.5 rotate-45 bg-[#d4a93c]/80" aria-hidden />
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
