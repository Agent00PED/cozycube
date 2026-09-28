import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { AXES, AXES_BY_TIER, BYPRODUCTS, BYPRODUCT_IDS, TREES, WOOD, WOOD_CARRIER_TIERS, WOOD_KINDS, carrierCapacity, nextCarrierTier, woodAverage, woodPrice, type TreeKind } from "@shared/chop";
import { FIREWOOD_PRICE } from "@shared/economy";
import { carrierLoad, type FishingProfile } from "@shared/fishing";
import { parseMarket, priceRun, woodGood } from "@shared/market";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// Bramble the Bear's trading post in the Whispering Woods: the woods' forester. He buys your logs
// (at the camp's hour's prices, each log worth its tree's size), the felling's by-products (Birch
// Bark, Amber Resin, Golden Leaf Amber, Ancient Wood Shavings) and Firewood; he sells every axe, T1
// to T5, and the bigger wood carriers; his advanced workbench stands beside the counter. Fish, rods,
// livewells and bait are Finley's, down by the river. Everything goes as BUSTER packets (the server
// knows it is Bramble by where you stand); the answers come back as busterResult.

type Tab = "trade" | "axes" | "carrier" | "trees";
const TABS: [Tab, string][] = [
  ["trade", "🪙 Trade"],
  ["axes", "🪓 Axes"],
  ["carrier", "🎒 Carriers"],
  ["trees", "🌲 The Woods"],
];
const HELLO = "Well now, a visitor! Bramble's the name, forester of these woods. Timber to sell, an axe to try, or a bigger carrier? 🐻";

interface Props {
  profile: FishingProfile;
  coins: number;
  market: string;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

export function BrambleModal({ profile, coins, market, send, subscribeMessages, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("trade");
  const [say, setSay] = useState<{ text: string; ok: boolean }>({ text: HELLO, ok: true });
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "busterResult") return;
        const r = payload as BarnabyResult;
        setSay({ text: r.message, ok: r.ok });
        if (r.ok && r.coins > 0) playSfx("coins");
        else if (r.ok) playSfx("chime");
      }),
    [subscribeMessages]
  );
  const hour = parseMarket(market);
  const logRun = (k: (typeof WOOD_KINDS)[number], n: number) => priceRun(Array.from({ length: n }, () => k), woodGood, (x, mult) => woodPrice(x, mult, woodAverage(profile, x)), hour).total;
  const logs = WOOD_KINDS.reduce((n, k) => n + (profile.wood[k] ?? 0), 0);
  const logsWorth = WOOD_KINDS.reduce((sum, k) => sum + logRun(k, profile.wood[k] ?? 0), 0);
  const byWorth = BYPRODUCT_IDS.reduce((sum, k) => sum + (profile.byproducts[k] ?? 0) * BYPRODUCTS[k].price, 0);
  const byCount = BYPRODUCT_IDS.reduce((n, k) => n + (profile.byproducts[k] ?? 0), 0);
  const next = nextCarrierTier(profile.carrierTier);
  return (
    <Modal title="Bramble's Trading Post" icon="🐻" onClose={onClose} width={480}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-start gap-2">
          <span className="text-4xl leading-none" aria-hidden>
            🐻
          </span>
          <div className={`clay-pop relative flex-1 rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-white/10" : "bg-rose-400/15"}`} key={say.text} role="status">
            {say.text}
          </div>
        </div>
        <div className="flex gap-1.5" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-9 flex-1 rounded-full px-1.5 text-[11px] font-bold transition-transform active:scale-95 ${tab === id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10 hover:bg-white/15"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "trade" && (
          <div className="flex flex-col gap-1.5">
            {WOOD_KINDS.filter((k) => (profile.wood[k] ?? 0) > 0).map((k) => (
              <div key={k} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
                <span className="text-xl">{WOOD[k].emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {WOOD[k].name} <span className="font-normal opacity-70">×{profile.wood[k]}</span>
                  </b>
                  <span className="text-[11px] opacity-75">
                    {logRun(k, 1)} 🪙 this hour{woodAverage(profile, k) > 1.01 ? ` · big logs ×${woodAverage(profile, k).toFixed(2)}` : ""}
                  </span>
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send({ type: "BUSTER", op: "sell", wood: k, count: "all" })}>
                  All · {logRun(k, profile.wood[k])} 🪙
                </button>
              </div>
            ))}
            {BYPRODUCT_IDS.filter((k) => (profile.byproducts[k] ?? 0) > 0).map((k) => (
              <div key={k} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
                <span className="text-xl">{BYPRODUCTS[k].emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {BYPRODUCTS[k].name} <span className="font-normal opacity-70">×{profile.byproducts[k]}</span>
                  </b>
                  <span className="text-[11px] opacity-75">
                    {BYPRODUCTS[k].price} 🪙 each · {BYPRODUCTS[k].blurb}
                  </span>
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send({ type: "BUSTER", op: "sellByproducts", item: k })}>
                  All · {(profile.byproducts[k] ?? 0) * BYPRODUCTS[k].price} 🪙
                </button>
              </div>
            ))}
            {profile.firewood > 0 && (
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
                <span className="text-xl">🔥</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    Firewood bundles <span className="font-normal opacity-70">×{profile.firewood}</span>
                  </b>
                  <span className="text-[11px] opacity-75">{FIREWOOD_PRICE} 🪙 a bundle</span>
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send({ type: "BUSTER", op: "sellFirewood", count: "all" })}>
                  All · {profile.firewood * FIREWOOD_PRICE} 🪙
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className="clay-btn clay-btn-amber min-h-11 w-full text-xs" disabled={logs === 0} onClick={() => send({ type: "BUSTER", op: "sellAllWood" })}>
                🪵 Sell All Logs ({logs}) · {logsWorth} 🪙
              </button>
              <button type="button" className="clay-btn clay-btn-amber min-h-11 w-full text-xs" disabled={byCount === 0} onClick={() => send({ type: "BUSTER", op: "sellByproducts", item: "all" })}>
                ✨ Sell By-products ({byCount}) · {byWorth} 🪙
              </button>
            </div>
            <p className="m-0 text-center text-[11px] opacity-70">Logs go at the camp's market price this hour; every sale nudges the next one down a little. Fish? Finley's down by the river 🦦</p>
          </div>
        )}

        {tab === "axes" && (
          <div className="flex flex-col gap-1.5">
            {AXES_BY_TIER.map((id) => {
              const axe = AXES[id];
              const owned = profile.axes.includes(id);
              const using = profile.axe === id;
              return (
                <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${using ? "bg-emerald-400/20" : axe.tier >= 4 ? "border border-[#F5A623]/40 bg-[#F5A623]/10" : "bg-white/5"}`}>
                  <span className="text-2xl">{axe.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="text-sm">
                      {axe.name} <span className="font-normal opacity-60">· T{axe.tier}</span>
                    </b>
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
                      {axe.price.toLocaleString("en-US")} 🪙
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
              Every log and carved piece takes a slot ({carrierLoad(profile)}/{carrierCapacity(profile.carrierTier)} now). By-products and Firewood ride beside it.
            </p>
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
        )}

        {tab === "trees" && (
          <div className="flex flex-col gap-1.5">
            {(Object.keys(TREES) as TreeKind[]).map((k) => {
              const t = TREES[k];
              return (
                <div key={k} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
                  <span className="rounded-full bg-[#F5A623]/20 px-2 py-0.5 text-[11px] font-extrabold text-[#F5A623]">T{t.tier}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="text-sm">{t.name}</b>
                    <span className="text-[11px] opacity-75">
                      {t.rounds[0]}-{t.rounds[1]} rounds · {Math.round(t.logChance * 100)}% a {WOOD[t.wood].name} log a round
                      {t.byproduct ? `, else ${BYPRODUCTS[t.byproduct].emoji} ${BYPRODUCTS[t.byproduct].name}` : ""} · grows back in {t.respawnS >= 60 ? `${Math.round(t.respawnS / 60)} min` : `${t.respawnS}s`}
                    </span>
                  </div>
                  <span className="text-xs opacity-80">×{profile.felled[k] ?? 0}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
