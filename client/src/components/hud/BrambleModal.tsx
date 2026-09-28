import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { AXES, AXES_BY_TIER, TREES, WOOD, WOOD_KINDS, woodAverage, woodPrice, type TreeKind } from "@shared/chop";
import { FIREWOOD_PRICE } from "@shared/economy";
import { FISH, RODS, RODS_BY_TIER, fishValue, type FishingProfile } from "@shared/fishing";
import { fishGood, parseMarket, priceRun, woodGood } from "@shared/market";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// Bramble the Bear's trading post in the Whispering Woods. He buys your logs and your livewell at
// the camp's hour's prices (the same market as Buster and Barnaby), and sells what nobody else
// does: the Golden Felling and Runic Elderwood axes (T4, T5) and the Starlight and Moonlight rods
// (the legendary and mythic fish). Wood and axes go as BUSTER packets, fish and rods as BARNABY
// packets (the server knows it is Bramble by where you stand); answers come back as busterResult
// and barnabyResult.

type Tab = "trade" | "axes" | "rods" | "trees";
const TABS: [Tab, string][] = [
  ["trade", "🪙 Trade"],
  ["axes", "🪓 Axes"],
  ["rods", "🎣 Rods"],
  ["trees", "🌲 The Woods"],
];
const HELLO = "Well now, a visitor! Bramble's the name. Timber, fish, the finest tools in the land: what'll it be? 🐻";

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
        if (type !== "busterResult" && type !== "barnabyResult") return;
        const r = payload as BarnabyResult;
        setSay({ text: r.message, ok: r.ok });
        if (r.ok && r.coins > 0) playSfx("coins");
        else if (r.ok) playSfx("chime");
      }),
    [subscribeMessages]
  );
  const hour = parseMarket(market);
  const logs = WOOD_KINDS.flatMap((k) => Array.from({ length: profile.wood[k] ?? 0 }, () => k));
  const logsWorth = priceRun(logs, woodGood, (k, mult) => woodPrice(k, mult, woodAverage(profile, k)), hour).total;
  const fishWorth = priceRun(profile.creel, (f) => fishGood(f.s), (f, mult) => fishValue(f, mult), hour).total;
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
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1.5">
              {WOOD_KINDS.filter((k) => (profile.wood[k] ?? 0) > 0).map((k) => (
                <div key={k} className="flex items-center gap-1.5 rounded-xl bg-white/10 px-2 py-1.5 text-xs">
                  <span className="text-lg">{WOOD[k].emoji}</span>
                  <span className="flex-1 truncate">{WOOD[k].name}</span>
                  <b>×{profile.wood[k]}</b>
                </div>
              ))}
            </div>
            <button type="button" className="clay-btn clay-btn-amber min-h-11 w-full" disabled={logs.length === 0} onClick={() => send({ type: "BUSTER", op: "sellAllWood" })}>
              🪵 Sell All Logs ({logs.length}) · {logsWorth} 🪙
            </button>
            {profile.firewood > 0 && (
              <button type="button" className="clay-btn clay-btn-amber min-h-11 w-full" onClick={() => send({ type: "BUSTER", op: "sellFirewood", count: "all" })}>
                🔥 Sell Firewood ({profile.firewood}) · {profile.firewood * FIREWOOD_PRICE} 🪙
              </button>
            )}
            <button type="button" className="clay-btn clay-btn-amber min-h-11 w-full" disabled={profile.creel.length === 0} onClick={() => send({ type: "BARNABY", op: "sell", slot: "all" })}>
              🐟 Sell All Fish ({profile.creel.length}) · {fishWorth} 🪙
            </button>
            <p className="m-0 text-center text-[11px] opacity-70">The camp's market sets the prices this hour; every sale nudges the next one down a little.</p>
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
                    <b className="text-sm">{axe.name}</b>
                    <span className="text-[11px] opacity-75">{axe.blurb}</span>
                  </div>
                  {using ? (
                    <span className="px-2 text-xs font-bold text-emerald-200">In hand</span>
                  ) : owned ? (
                    <button type="button" className="clay-btn min-h-9 px-3 text-xs" onClick={() => send({ type: "BUSTER", op: "equipAxe", axe: id })}>
                      Use
                    </button>
                  ) : axe.tier >= 4 ? (
                    <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < axe.price} onClick={() => send({ type: "BUSTER", op: "buyAxe", axe: id })}>
                      {axe.price.toLocaleString("en-US")} 🪙
                    </button>
                  ) : (
                    <span className="max-w-[88px] px-1 text-right text-[10px] leading-tight opacity-70">🦫 Buster sells this one</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "rods" && (
          <div className="flex flex-col gap-1.5">
            {RODS_BY_TIER.map((id) => {
              const rod = RODS[id];
              const owned = profile.rods.includes(id);
              const using = profile.rod === id;
              return (
                <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${using ? "bg-emerald-400/20" : rod.tier >= 4 ? "border border-[#F5A623]/40 bg-[#F5A623]/10" : "bg-white/5"}`}>
                  <span className="text-2xl">{rod.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="text-sm">{rod.name}</b>
                    <span className="text-[11px] opacity-75">{rod.blurb}</span>
                  </div>
                  {using ? (
                    <span className="px-2 text-xs font-bold text-emerald-200">In hand</span>
                  ) : owned ? (
                    <button type="button" className="clay-btn min-h-9 px-3 text-xs" onClick={() => send({ type: "BARNABY", op: "equipRod", rod: id })}>
                      Use
                    </button>
                  ) : rod.tier >= 4 ? (
                    <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < rod.price} onClick={() => send({ type: "BARNABY", op: "buyRod", rod: id })}>
                      {rod.price.toLocaleString("en-US")} 🪙
                    </button>
                  ) : (
                    <span className="max-w-[88px] px-1 text-right text-[10px] leading-tight opacity-70">🦦 Barnaby sells this one</span>
                  )}
                </div>
              );
            })}
            <p className="m-0 text-center text-[11px] opacity-70">The river holds the woods' legendaries and mythics: {Object.values(FISH).filter((f) => "rapids" in f && f.rapids).length} of them, and only a T4 or T5 rod lands them.</p>
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
                      {t.rounds[0]}-{t.rounds[1]} rounds · {Math.round(t.logChance * 100)}% a {WOOD[t.wood].name} log a round · grows back in {t.respawnS >= 60 ? `${Math.round(t.respawnS / 60)} min` : `${t.respawnS}s`}
                    </span>
                  </div>
                  <span className="text-xs opacity-80">felled ×{profile.felled[k] ?? 0}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
