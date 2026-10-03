import { useEffect, useState } from "react";
import { FORGED_TOOLS, FORGED_TOOL_IDS, forgedBlocked, forgedOwned, makingsList } from "@shared/expedition";
import type { FishingProfile } from "@shared/fishing";
import { SEA_CHANNEL } from "@shared/voyage";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The old shipwright's bench in the Hidden Cove: the Deep Tide tools are made here (shared/expedition.ts,
// place "cove"), from pearls pried out of the cove's clams and the three crafts' rarest drops. Its
// recipes are seen nowhere else.

export function CoveBenchModal({ profile, coins, send, subscribeMessages, onClose }: { profile: FishingProfile; coins: number; send: (channel: string, packet?: unknown) => void; subscribeMessages: (listener: RoomMessageListener) => () => void; onClose: () => void }) {
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "barnabyResult") return;
        const r = payload as { ok: boolean; message: string };
        setNotice({ text: r.message, ok: r.ok });
        playSfx(r.ok ? "fanfare" : "pluck");
      }),
    [subscribeMessages]
  );
  const pearls = profile.byproducts.pearl ?? 0;
  return (
    <Modal title="The Shipwright's Bench" icon="🔱" onClose={onClose} width={440}>
      <p className="m-0 text-xs opacity-80">Someone built boats in this cave, long ago, and left the tools where they lay. What is made here is made of the deep: pearls, and the rarest thing each craft gives up.</p>
      <p className="m-0 rounded-2xl bg-black/20 px-3 py-1.5 text-xs">
        🫧 Sea Pearls: <b className="text-[#F7EBE1]">{pearls}</b> <span className="opacity-70">(pry the giant clams open: they shut again for a while)</span>
      </p>
      {FORGED_TOOL_IDS.filter((id) => FORGED_TOOLS[id].place === "cove").map((id) => {
        const t = FORGED_TOOLS[id];
        const owned = forgedOwned(profile, id);
        const first = forgedBlocked(profile, id);
        const makings = makingsList(profile, t.needs);
        const ready = !first && coins >= t.coins && makings.every((mk) => mk.have >= mk.need);
        return (
          <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
            <span className="text-2xl">{t.emoji}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
              <b className="text-[13px] text-[#F7EBE1]">{t.name}</b>
              <span className="text-[11px] opacity-80">{t.blurb}</span>
              {!owned && (
                <span className="flex flex-wrap gap-1 text-[10.5px]">
                  <span className={`rounded-full px-1.5 ${coins >= t.coins ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>{t.coins.toLocaleString("en-US")} 🪙</span>
                  {makings.map((mk) => (
                    <span key={mk.name} className={`rounded-full px-1.5 ${mk.have >= mk.need ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>
                      {mk.need} {mk.name} <span className="opacity-70">({mk.have})</span>
                    </span>
                  ))}
                </span>
              )}
            </div>
            <button type="button" className={`clay-btn min-h-11 shrink-0 px-3 text-xs ${owned ? "clay-btn-ghost" : "clay-btn-amber"}`} disabled={owned || !ready} onClick={() => send(SEA_CHANNEL, { op: "make", tool: id })}>
              {owned ? "Made ✓" : "Make"}
            </button>
          </div>
        );
      })}
      {notice && <p className={`m-0 text-center text-xs ${notice.ok ? "text-emerald-200" : "text-rose-200"}`}>{notice.text}</p>}
    </Modal>
  );
}
