import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { AXES, AXES_BY_TIER, BYPRODUCTS, BYPRODUCT_IDS, WOOD, WOOD_CARRIER_TIERS, WOOD_KINDS, nextCarrierTier, woodAverage, woodPrice } from "@shared/chop";
import { FIREWOOD_PER_COIN, firewoodCoins } from "@shared/economy";
import { carrierCap, carrierLoad, type FishingProfile } from "@shared/fishing";
import { SHOP_TIER_CAP, soldElsewhere } from "@shared/expedition";
import { GearWorks } from "./GearWorks";
import { marketDirection, parseMarket, priceRun, woodGood } from "@shared/market";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { LegacyTradeIn, hasLegacy } from "./LegacyTradeIn";
import { FooterBook, PRICE_COLUMN, MarketClock, SellAllButton, ShopShell, Trend, type ShopNotice, type ShopTab } from "./ShopShell";

// Bramble the Bear's trading post in the Whispering Woods: the woods' forester, on the shops'
// fixed-anchor counter (ShopShell). He buys your logs (at the camp's hour's prices, each log worth its
// tree's size), the felling's by-products and Firewood; he sells the axes up to T4 (T5 is forged in the caverns), the bigger wood
// carriers and the woodcutter's gear, every tier. Fish, rods, livewells and bait are Finley's, down by
// the river. Everything goes as BUSTER packets (the server knows it is Bramble by where you stand);
// the answers come back as busterResult. A piece or a relic from the old workbench is traded in here
// (or at Buster's) for a full refund: LegacyTradeIn.

const TABS: [ShopTab, string, string][] = [
  ["trade", "🪙", "Trade/Sell"],
  ["tools", "🪓", "Tools"],
  ["storage", "🎒", "Storage"],
  ["gear", "💍", "Gear"],
];

interface Props {
  profile: FishingProfile;
  coins: number;
  market: string;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onOpenCollection: () => void;
  onClose: () => void;
}

export function BrambleModal({ profile, coins, market, send, subscribeMessages, onOpenCollection, onClose }: Props) {
  const [tab, setTab] = useState<ShopTab>("trade");
  const [notice, setNotice] = useState<ShopNotice | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "busterResult") return;
        const r = payload as BarnabyResult;
        setNotice({ text: r.message, ok: r.ok });
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
  // (T5 is forged in the caverns, not sold)
  const away = (tier: number) => soldElsewhere(tier, SHOP_TIER_CAP.woods, "");
  const held = WOOD_KINDS.filter((k) => (profile.wood[k] ?? 0) > 0);
  return (
    <ShopShell
      title="Bramble's Trading Post"
      icon="🐻"
      notice={notice}
      tabs={TABS}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      sellBar={
        <div className="grid grid-cols-2 gap-1.5">
          <SellAllButton label="🪵 Sell All Logs" count={logs} coins={logsWorth} onClick={() => send({ type: "BUSTER", op: "sellAllWood" })} />
          <SellAllButton label="✨ Sell All Byproducts" count={byCount} coins={byWorth} onClick={() => send({ type: "BUSTER", op: "sellByproducts", item: "all" })} />
        </div>
      }
      footer={
        <>
          <MarketClock market={hour} goods={held.map(woodGood)} />
          <FooterBook label="📖 Timber Collection" onClick={onOpenCollection} />
        </>
      }
    >
      {tab === "trade" && (
        <div className="flex flex-col gap-1.5">
          {held.map((k) => (
            <div key={k} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
              <span className="text-xl">{WOOD[k].emoji}</span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <b className="text-sm">
                  {WOOD[k].name} <span className="font-normal opacity-70">×{profile.wood[k]}</span>
                </b>
                <span className="text-[11px] opacity-75">
                  {logRun(k, 1)} 🪙 this hour <Trend dir={marketDirection(woodGood(k), hour)} />
                  {woodAverage(profile, k) > 1.01 ? ` · big logs ×${woodAverage(profile, k).toFixed(2)}` : ""}
                </span>
              </div>
              <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 justify-center px-0 text-xs" style={PRICE_COLUMN} onClick={() => send({ type: "BUSTER", op: "sell", wood: k, count: "all" })}>
                <span className="whitespace-nowrap text-[12px]">All · {logRun(k, profile.wood[k])} 🪙</span>
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
                <span className="text-[11px] opacity-75">{BYPRODUCTS[k].price} 🪙 each</span>
              </div>
              <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 justify-center px-0 text-xs" style={PRICE_COLUMN} onClick={() => send({ type: "BUSTER", op: "sellByproducts", item: k })}>
                <span className="whitespace-nowrap text-[12px]">All · {(profile.byproducts[k] ?? 0) * BYPRODUCTS[k].price} 🪙</span>
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
                <span className="text-[11px] opacity-75">1 🪙 for {FIREWOOD_PER_COIN} bundles</span>
              </div>
              <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 justify-center px-0 text-xs" style={PRICE_COLUMN} onClick={() => send({ type: "BUSTER", op: "sellFirewood", count: "all" })}>
                <span className="whitespace-nowrap text-[12px]">All · {firewoodCoins(profile.firewood)} 🪙</span>
              </button>
            </div>
          )}
          <LegacyTradeIn profile={profile} send={send} />
          {!held.length && !byCount && !profile.firewood && !hasLegacy(profile) && <p className="m-0 py-6 text-center text-sm opacity-70">Nothing to trade yet. Fell a tree or two, friend: I'll be here.</p>}
          <p className="m-0 pt-1 text-center text-[11px] opacity-70">Logs go at the camp's market price this hour; every sale nudges the next one down a little. Fish? Finley's down by the river 🦦</p>
        </div>
      )}

      {tab === "tools" && (
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
                ) : away(axe.tier) ? (
                  <span className="max-w-[92px] px-1 text-right text-[10px] leading-tight opacity-70">{away(axe.tier)}</span>
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

      {tab === "storage" && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-center text-xs opacity-75">
            Every log takes a slot ({carrierLoad(profile)}/{carrierCap(profile)} now). Carved pieces go in the craft stash (12 slots); the pouches (by-products, resin, sawdust) grow with the carrier.
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
                ) : next?.id === t.id && away(tier) ? (
                  <span className="max-w-[92px] px-1 text-right text-[10px] leading-tight opacity-70">{away(tier)}</span>
                ) : next?.id === t.id ? (
                  <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < t.price} onClick={() => send({ type: "BUSTER", op: "upgradeCarrier" })}>
                    {t.price.toLocaleString("en-US")} 🪙
                  </button>
                ) : (
                  <span className="px-2 text-xs opacity-50">{t.price.toLocaleString("en-US")} 🪙</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "gear" && <GearWorks profile={profile} coins={coins} send={send} families={["forester", "wayfarer"]} places={["woods"]} />}
    </ShopShell>
  );
}
