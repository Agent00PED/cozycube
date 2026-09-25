import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { AXES, AXE_IDS, WOOD, WOOD_KINDS } from "@shared/chop";
import type { FishingProfile } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

interface Props {
  profile: FishingProfile;
  coins: number;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

// Buster the Lumberjack's stall by the woodpile: he buys your split wood (Soft Pine, Hard Oak,
// Golden Charcoal) and sells better axes (the Steel Camp Axe widens the chopping block's green;
// the Golden Lumberjack Axe also slows the needle and sometimes splits a log in two). Every trade
// is the server's call (BUSTER packets); his answer comes back as busterResult.

type Tab = "wood" | "axes";
const HELLO = "Howdy! Buster's the name, timber's the game. Got some wood for me? 🦫";

export function LumberjackModal({ profile, coins, send, subscribeMessages, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("wood");
  const [say, setSay] = useState<{ text: string; ok: boolean }>({ text: HELLO, ok: true });
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "busterResult") return;
        const r = payload as BarnabyResult;
        setSay({ text: r.message, ok: r.ok });
        if (r.ok && r.coins > 0) playSfx("coins");
        else if (r.ok) playSfx("chop");
      }),
    [subscribeMessages]
  );
  const total = WOOD_KINDS.reduce((sum, k) => sum + profile.wood[k] * WOOD[k].sell, 0);
  return (
    <Modal title="Buster's Firewood" icon="🪓" onClose={onClose} width={440}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-start gap-2">
          <span className="text-4xl leading-none" aria-hidden>
            🦫
          </span>
          <div className={`clay-pop relative flex-1 rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-white/10" : "bg-rose-400/15"}`} key={say.text} role="status">
            {say.text}
          </div>
        </div>
        <div className="flex gap-1.5" role="tablist">
          {(
            [
              ["wood", "🪵 Sell Wood"],
              ["axes", "🪓 Axes"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-9 flex-1 rounded-full px-2 text-xs font-bold transition-transform active:scale-95 ${tab === id ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "wood" && (
          <div className="flex flex-col gap-1.5">
            {WOOD_KINDS.map((k) => {
              const have = profile.wood[k];
              return (
                <div key={k} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
                  <span className="text-2xl">{WOOD[k].emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="text-sm">
                      {WOOD[k].name} <span className="font-normal opacity-70">×{have}</span>
                    </b>
                    <span className="text-[11px] opacity-75">
                      {WOOD[k].sell} 🪙 each · or +{WOOD[k].fuel}% on the fire
                    </span>
                  </div>
                  <button type="button" className="clay-btn min-h-9 px-3 text-xs" disabled={have < 1} onClick={() => send({ type: "BUSTER", op: "sell", wood: k, count: 1 })}>
                    Sell 1
                  </button>
                  <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={have < 1} onClick={() => send({ type: "BUSTER", op: "sell", wood: k, count: "all" })}>
                    All · {have * WOOD[k].sell} 🪙
                  </button>
                </div>
              );
            })}
            <p className="m-0 text-center text-xs opacity-75">
              Everything you carry: <b className="text-amber-200">{total} 🪙</b>. Split logs at the chopping block right here.
            </p>
          </div>
        )}

        {tab === "axes" && (
          <div className="flex flex-col gap-1.5">
            {AXE_IDS.map((id) => {
              const axe = AXES[id];
              const owned = profile.axes.includes(id);
              const using = profile.axe === id;
              return (
                <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${using ? "bg-emerald-400/20" : "bg-white/10"}`}>
                  <span className="text-2xl">{axe.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="text-sm">{axe.name}</b>
                    <span className="text-[11px] opacity-75">{axe.blurb}</span>
                  </div>
                  {using ? (
                    <span className="px-2 text-xs font-bold text-emerald-200">In hand</span>
                  ) : owned ? (
                    <button type="button" className="clay-btn min-h-9 px-3 text-xs" onClick={() => send({ type: "BUSTER", op: "equipAxe", axe: id })}>
                      Use
                    </button>
                  ) : (
                    <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < axe.price} onClick={() => send({ type: "BUSTER", op: "buyAxe", axe: id })}>
                      {axe.price} 🪙
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
