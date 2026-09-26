import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { AXES, AXE_IDS, WOOD, WOOD_CARRIER_TIERS, WOOD_KINDS, carrierCapacity, nextCarrierTier, type WoodKind } from "@shared/chop";
import { CRAFTS, CRAFT_IDS, MASTERWORK_CHANCE, canCraft, craftPrice } from "@shared/crafting";
import { carrierLoad, type FishingProfile } from "@shared/fishing";
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

// Buster the Lumberjack's stall by the woodpile. He buys your split wood (Soft Pine, Hard Oak,
// Golden Charcoal) and your carved pieces; at his workbench you carve wood into artisan pieces
// worth far more (a Masterwork ✨ now and then, likelier with a finer axe); he sells better axes and
// bigger wood carriers, tier by tier. Every trade is the server's call (BUSTER packets); his answer
// comes back as busterResult.

type Tab = "sell" | "bench" | "axes" | "carrier";
const TABS: [Tab, string][] = [
  ["sell", "🪙 Sell"],
  ["bench", "🛠️ Workbench"],
  ["axes", "🪓 Axes"],
  ["carrier", "🎒 Carrier"],
];
const HELLO = "Howdy! Buster's the name, timber's the game. Got some wood for me? 🦫";

const needsText = (needs: Partial<Record<WoodKind, number>>) =>
  (Object.entries(needs) as [WoodKind, number][]).map(([k, n]) => `${n} ${WOOD[k].emoji}`).join(" + ");

export function LumberjackModal({ profile, coins, send, subscribeMessages, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("sell");
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
  const woodWorth = WOOD_KINDS.reduce((sum, k) => sum + profile.wood[k] * WOOD[k].sell, 0);
  const craftWorth = profile.crafts.reduce((sum, c) => sum + craftPrice(c), 0);
  const next = nextCarrierTier(profile.carrierTier);
  return (
    <Modal title="Buster's Firewood" icon="🪓" onClose={onClose} width={460}>
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
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-9 flex-1 rounded-full px-1.5 text-[11px] font-bold transition-transform active:scale-95 ${tab === id ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "sell" && (
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
            {profile.crafts.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
                <div className="flex max-h-[20vh] flex-col gap-1 overflow-y-auto pr-1">
                  {profile.crafts.map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${item.m ? "border-2 border-amber-300 bg-amber-300/10" : "bg-white/10"}`}>
                      <span className="text-xl">{CRAFTS[item.c].emoji}</span>
                      <b className="flex-1 text-xs">
                        {CRAFTS[item.c].name}
                        {item.m && <span className="ml-1 text-amber-200">Masterwork ✨</span>}
                      </b>
                      <button type="button" className="clay-btn min-h-8 px-3 text-xs" onClick={() => send({ type: "BUSTER", op: "sellCraft", slot: i })}>
                        {craftPrice(item)} 🪙
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-10 w-full text-xs" onClick={() => send({ type: "BUSTER", op: "sellCraft", slot: "all" })}>
                  Sell every carved piece · {craftWorth} 🪙
                </button>
              </div>
            )}
            <p className="m-0 text-center text-xs opacity-75">
              Carrying <b className="text-amber-200">{woodWorth + craftWorth} 🪙</b> of timber. Carved, wood is worth far more!
            </p>
          </div>
        )}

        {tab === "bench" && (
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-center text-xs opacity-75">
              Carve your logs into artisan pieces. A Masterwork ✨ ({Math.round(MASTERWORK_CHANCE[profile.axe] * 100)}% with your {AXES[profile.axe].name}) fetches half again.
            </p>
            {CRAFT_IDS.map((id) => {
              const craft = CRAFTS[id];
              const ok = canCraft(profile.wood, id);
              return (
                <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
                  <span className="text-2xl">{craft.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="text-sm">{craft.name}</b>
                    <span className="text-[11px] opacity-75">
                      {needsText(craft.needs)} → {craft.price} 🪙 · ✨ {craft.master} 🪙
                    </span>
                  </div>
                  <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={!ok} onClick={() => send({ type: "BUSTER", op: "craft", recipe: id })}>
                    Carve
                  </button>
                </div>
              );
            })}
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

        {tab === "carrier" && (
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-center text-xs opacity-75">
              Every log and carved piece takes a slot ({carrierLoad(profile)}/{carrierCapacity(profile.carrierTier)} now). A full carrier means no more chopping.
            </p>
            <div className="flex max-h-[34vh] flex-col gap-1.5 overflow-y-auto pr-1">
              {WOOD_CARRIER_TIERS.map((t, i) => {
                const tier = i + 1;
                const using = tier === profile.carrierTier;
                const have = tier <= profile.carrierTier;
                return (
                  <div key={t.id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${using ? "bg-emerald-400/20" : have ? "bg-white/5 opacity-60" : "bg-white/10"}`}>
                    <span className="text-xl">{t.icon}</span>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <b className="text-sm">{t.name}</b>
                      <span className="text-[11px] opacity-75">{t.capacity} slots</span>
                    </div>
                    {using ? (
                      <span className="px-2 text-xs font-bold text-emerald-200">In use</span>
                    ) : have ? (
                      <span className="px-2 text-xs opacity-60">Outgrown</span>
                    ) : next?.id === t.id ? (
                      <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < t.price} onClick={() => send({ type: "BUSTER", op: "upgradeCarrier" })}>
                        {t.price.toLocaleString()} 🪙
                      </button>
                    ) : (
                      <span className="px-2 text-xs opacity-50">{t.price.toLocaleString()} 🪙</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
