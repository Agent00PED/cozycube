import { useState } from "react";
import { CODEX, CODEX_COUNT, CODEX_SECTIONS, CODEX_TITLE, codexFound, codexProgress, codexTitles, type CodexSection } from "@shared/caverns_codex";
import { specialTitle } from "@shared/items";
import { Modal } from "./Modal";

// The Cave Codex (shared/caverns_codex.ts): the expedition's field journal, in five tabs (the zone
// stamps, the fauna, the pearls and fossils, Old Flint's journal, the living wonders). Each entry
// found shows its lore (a journal page its whole text); each one still to find a hint of where. The
// section's progress and its completion bonus on its tab; the gold titles a filled section gives (and
// the whole codex), each one worn from here.

const HINT: Record<CodexSection, string> = {
  zones: "Walk into this zone to stamp it",
  fauna: "Spend a moment where this creature lives",
  finds: "A pearl glints in a dry basin on the terraces; fossils turn up now and then in a node's rubble",
  journal: "A torn page lies somewhere in the caverns, glinting",
  wonders: "A living wonder, the Bat Exodus at the camp's dusk, or a photo at the Explorers' Rest",
};

export function CaveCodexModal({ found, initial, title, onWear, onClose }: { found: string[]; initial?: string; /** The title worn now. */ title: string; onWear: (title: string) => void; onClose: () => void }) {
  const start = (CODEX_SECTIONS.find((s) => s.id === initial)?.id ?? "zones") as CodexSection;
  const [tab, setTab] = useState<CodexSection>(start);
  const entries = CODEX.filter((e) => e.section === tab);
  const section = CODEX_SECTIONS.find((s) => s.id === tab)!;
  const prog = codexProgress(found, tab);
  const all = codexFound(found);
  const earned = codexTitles(found);
  return (
    <Modal title="The Cave Codex" icon="📖" onClose={onClose} width={620}>
      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex flex-wrap justify-center gap-1" role="tablist">
          {CODEX_SECTIONS.map((s) => {
            const p = codexProgress(found, s.id);
            return (
              <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} className={`clay-btn min-h-11 px-3 text-[12px] ${tab === s.id ? "clay-btn-amber" : "clay-btn-ghost"}`} onClick={() => setTab(s.id)}>
                {s.emoji} {s.name}
                <span className="rounded-full bg-black/20 px-1.5 text-[10.5px] tabular-nums">
                  {p.found}/{p.all}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-1 text-[12px] opacity-85">
          <span>
            {section.emoji} {prog.found} of {prog.all} {prog.found === prog.all ? "· complete ✨" : `· all of them: +${section.bonus} 🪙`}
          </span>
          <span className="tabular-nums">
            📖 {all}/{CODEX_COUNT}
          </span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2" style={{ maxHeight: "min(52vh, 440px)" }}>
          {entries.map((e) => {
            const have = found.includes(e.id);
            return (
              <div key={e.id} className={`flex gap-2.5 rounded-2xl border px-3 py-2 ${have ? "border-amber-200/25 bg-white/[0.06]" : "border-dashed border-white/15 bg-black/15"}`}>
                <span className="text-2xl leading-none" style={{ filter: have ? undefined : "grayscale(1) brightness(0.4)" }} aria-hidden>
                  {e.emoji}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <b className={`text-[12.5px] leading-tight ${have ? "text-[#F7EBE1]" : "opacity-60"}`}>{have ? e.name : "???"}</b>
                  <span className={`text-[11.5px] leading-snug ${have ? "opacity-85" : "opacity-55"}`}>{have ? e.lore : HINT[e.section]}</span>
                  {!have && <span className="text-[10.5px] font-semibold text-amber-200/80">+{e.coins} 🪙</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 px-1 pt-2 text-[11.5px]">
          <span className="opacity-75">🏅 Titles:</span>
          {[...CODEX_SECTIONS.map((s) => s.title), CODEX_TITLE].map((t) => {
            const have = earned.includes(t);
            const worn = title === t;
            return (
              <button key={t} type="button" disabled={!have} onClick={() => onWear(worn ? "" : t)} className={`min-h-8 rounded-full border px-2.5 font-bold ${worn ? "border-amber-300 bg-amber-300 text-amber-950" : have ? "border-amber-300/50 bg-white/10 text-amber-200 hover:bg-white/15" : "border-white/10 opacity-35"}`} title={have ? (worn ? "Take it off" : "Wear it over your name") : t === CODEX_TITLE ? "Fill the whole codex" : "Fill its section"}>
                {have ? specialTitle(t)?.name : "🔒 ???"}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
