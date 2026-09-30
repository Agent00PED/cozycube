import { useState } from "react";
import { CODEX, CODEX_SECTIONS, codexProgress, type CodexSection } from "@shared/caverns_codex";
import { Modal } from "./Modal";

// The Cave Codex (shared/caverns_codex.ts): the expedition's field journal, in five tabs (the zone
// stamps, the fauna, the pearls and fossils, Old Flint's journal, the living wonders). Each entry
// found shows its lore (a journal page its whole text); each one still to find a hint of where. The
// section's progress and its completion bonus on its tab.

const HINT: Record<CodexSection, string> = {
  zones: "Walk into this zone to stamp it",
  fauna: "Spend a moment where this creature lives",
  finds: "A pearl glints in a dry basin on the terraces; fossils turn up now and then in a node's rubble",
  journal: "A torn page lies somewhere in the caverns, glinting",
  wonders: "A living wonder, the Bat Exodus at the camp's dusk, or a photo at the Hound's Hand",
};

export function CaveCodexModal({ found, initial, onClose }: { found: string[]; initial?: string; onClose: () => void }) {
  const start = (CODEX_SECTIONS.find((s) => s.id === initial)?.id ?? "zones") as CodexSection;
  const [tab, setTab] = useState<CodexSection>(start);
  const entries = CODEX.filter((e) => e.section === tab);
  const section = CODEX_SECTIONS.find((s) => s.id === tab)!;
  const prog = codexProgress(found, tab);
  const all = CODEX.filter((e) => found.includes(e.id)).length;
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
            📖 {all}/{CODEX.length}
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
      </div>
    </Modal>
  );
}
