import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { CAVERNS_CHANNELS, ORE_ITEMS, ORE_ITEM_IDS, PICKAXES, PICKAXES_BY_TIER, itemsOf, type CavernsResult, type OreCategory, type OreItemId } from "@shared/caverns_mining";
import { SATCHEL_TIERS, STACK_GEODE, STACK_ORE, nextSatchelTier, satchelCountFor, satchelCounts, satchelTier, slotsUsed } from "@shared/satchel";
import { BYPRODUCTS, WOOD, type ByproductId, type WoodKind } from "@shared/chop";
import { materialCount, type FishingProfile } from "@shared/fishing";
import { FORGED_TIER } from "@shared/expedition";
import { BYPRODUCT_PRICES, MATERIAL_CAP } from "@shared/economy";
import { marketMultiplier, oreGood, parseMarket, priceRun } from "@shared/market";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { MarketClock, PRICE_COLUMN, SellAllButton, ShopShell, TrendBadge, type ShopNotice, type ShopTab } from "./ShopShell";

// Gus the Mole's workstation at the Expedition Basecamp, on the shops' fixed-anchor counter (ShopShell).
// He buys everything the caverns give (the raw ores, the forge's ingots, Masterworks at their +25%,
// geodes as they are, the anvil's cut gems) at the hour's market, and the Fine Stone Dust (at its
// flat price: the materials' store, up to 99); the cenote's fish are Finnegan's to buy. He sells the
// pickaxes (the Copper Pickaxe to the Deep Core Drill: the Rusted one is Old Flint's) and the
// Prospector's Satchel's tiers, each for coins and a little of the other crafts' makings (Sawdust,
// Pine Resin, bark, cedar logs, Titan Heartwood) and the caverns' own (ingots, shards, fragments). All
// on the caverns' channels, answered with cavernsResult.

const TABS: [ShopTab, string, string][] = [
  ["trade", "🪙", "Trade/Sell"],
  ["tools", "⛏️", "Pickaxes"],
  ["storage", "🎒", "Satchels"],
];

interface Props {
  profile: FishingProfile;
  coins: number;
  market: string;
  send: (channel: string, packet?: unknown) => void;
  campfireSend: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onOpenCollection: () => void;
  onClose: () => void;
}

export function GusShopModal({ profile, coins, market, send, campfireSend, subscribeMessages, onOpenCollection, onClose }: Props) {
  const [tab, setTab] = useState<ShopTab>("trade");
  const [notice, setNotice] = useState<ShopNotice | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "cavernsResult" && type !== "barnabyResult") return;
        const r = payload as CavernsResult | BarnabyResult;
        setNotice({ text: r.message, ok: r.ok });
        if (r.ok && (r.coins ?? 0) > 0) playSfx("coins");
        else if (r.ok) playSfx("chime");
      }),
    [subscribeMessages]
  );
  const hour = parseMarket(market);
  const counts = satchelCounts(profile);
  const run = (ids: OreItemId[]) => priceRun(ids.flatMap((id) => Array.from({ length: counts[id] ?? 0 }, () => id)), oreGood, (id, mult) => Math.max(1, Math.round(ORE_ITEMS[id].price * mult)), hour);
  const catRun = (cat: OreCategory) => run(itemsOf(cat));
  const catCount = (cat: OreCategory) => itemsOf(cat).reduce((a, id) => a + (counts[id] ?? 0), 0);
  const dust = materialCount(profile, "stoneDust");
  const held = ORE_ITEM_IDS.filter((id) => (counts[id] ?? 0) > 0);
  const next = nextSatchelTier(profile.satchelTier);
  return (
    <ShopShell
      title="Gus's Workshop"
      icon="⛏️"
      notice={notice}
      tabs={TABS}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      sellBar={
        <div className="grid grid-cols-2 gap-1.5">
          <SellAllButton label="⛏️ Sell All Ores" count={catCount("raw")} coins={catRun("raw").total} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "sellCat", cat: "raw" })} />
          <SellAllButton label="🔥 Sell All Ingots" count={catCount("ingot")} coins={catRun("ingot").total} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "sellCat", cat: "ingot" })} />
          <SellAllButton label="💎 Sell All Gems" count={catCount("gem")} coins={catRun("gem").total} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "sellCat", cat: "gem" })} />
          <SellAllButton label="🌫️ Sell Stone Dust" count={dust} coins={dust * BYPRODUCT_PRICES.stoneDust} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "sellDust" })} />
        </div>
      }
      footer={<MarketClock market={hour} goods={held.map(oreGood)} />}
    >
      {tab === "trade" && (
        <div className="flex flex-col gap-1.5">
          {held.length === 0 && dust === 0 && <p className="m-0 rounded-2xl bg-white/5 px-3 py-4 text-center text-sm opacity-80">Bring me ore, friend! Copper from the jungle, coal from the breakdown, iron, silver and glimmerstone from further down: I buy the lot. The lake's fish? Take those to Finnegan, down on the north shore.</p>}
          {held.map((id) => {
            const item = ORE_ITEMS[id];
            const mult = marketMultiplier(oreGood(id), hour);
            const one = Math.max(1, Math.round(item.price * mult));
            const n = counts[id] ?? 0;
            return (
              <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${item.cat === "gem" ? "bg-[#5ff2ff]/10" : "bg-white/10"}`}>
                <span className="text-2xl" style={{ filter: `drop-shadow(0 0 5px ${item.color}aa)` }}>
                  {item.emoji}
                </span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="truncate text-xs text-[#F7EBE1]">
                    {item.name} <span className="font-normal opacity-70">×{n}</span>
                  </b>
                  <span className="flex items-center gap-1.5 text-[10px]">
                    <TrendBadge mult={mult} />
                    <span className="truncate opacity-70">{item.blurb}</span>
                  </span>
                </div>
                <button type="button" className="clay-btn clay-btn-ghost min-h-9 shrink-0 justify-center px-0 text-xs" style={{ width: 44, minWidth: 44 }} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "sell", item: id, n: 1 })} title={`Sell one for ${one} 🪙`} aria-label={`Sell one ${item.name} for ${one} coins`}>
                  ×1
                </button>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 flex-col justify-center gap-0 px-0 text-xs leading-none" style={PRICE_COLUMN} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "sell", item: id, n: "all" })} title={`Sell all ${n}`}>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider opacity-70">All</span>
                  <span className="whitespace-nowrap text-[12px]">{run([id]).total.toLocaleString("en-US")} 🪙</span>
                </button>
              </div>
            );
          })}
          {dust > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
              <span className="text-2xl">🌫️</span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <b className="truncate text-xs text-[#F7EBE1]">
                  Fine Stone Dust{" "}
                  <span className="font-normal opacity-70">
                    ×{dust}/{MATERIAL_CAP}
                  </span>
                </b>
                <span className="truncate text-[10px] opacity-70">{BYPRODUCTS.stoneDust.blurb}</span>
              </div>
              <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 flex-col justify-center gap-0 px-0 text-xs leading-none" style={PRICE_COLUMN} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "sellDust" })} title={`${BYPRODUCT_PRICES.stoneDust} 🪙 each (a flat price)`}>
                <span className="text-[9px] font-extrabold uppercase tracking-wider opacity-70">All</span>
                <span className="whitespace-nowrap text-[12px]">{(dust * BYPRODUCT_PRICES.stoneDust).toLocaleString("en-US")} 🪙</span>
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "tools" && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-center text-[11px] opacity-75">A pickaxe mines its own tier and the one above (at 60%); anything lower breaks in one blow. Two tiers above it, it skids off.</p>
          {PICKAXES_BY_TIER.map((id) => {
            const p = PICKAXES[id];
            const owned = profile.pickaxes.includes(id);
            const inHand = profile.pickaxeId === id;
            return (
              <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${inHand ? "bg-emerald-400/20" : p.tier >= 4 ? "border border-[#5ff2ff]/40 bg-[#5ff2ff]/10" : "bg-white/10"}`}>
                <span className="text-2xl">{p.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {p.name} <span className="font-normal opacity-60">· T{p.tier}</span>
                  </b>
                  <span className="text-[11px] opacity-75">{p.blurb}</span>
                </div>
                {inHand ? (
                  <span className="px-2 text-xs font-bold text-emerald-200">In hand</span>
                ) : owned ? (
                  <button type="button" className="clay-btn clay-btn-ghost min-h-9 px-3 text-xs" onClick={() => send(CAVERNS_CHANNELS.gus, { op: "equipPickaxe", pickaxe: id })}>
                    Hold
                  </button>
                ) : p.tier >= FORGED_TIER ? (
                  <span className="max-w-[92px] px-1 text-right text-[10px] leading-tight opacity-70">🔥 Forged at the forge beside the post</span>
                ) : p.price === 0 ? (
                  <span className="max-w-[92px] px-1 text-right text-[10px] leading-tight opacity-70">Old Flint's gift, by the woods' adit</span>
                ) : (
                  <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < p.price} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "buyPickaxe", pickaxe: id })}>
                    {p.price.toLocaleString("en-US")} 🪙
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "storage" && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-center text-[11px] opacity-75">
            Your {satchelTier(profile.satchelTier).name}: {slotsUsed(profile.satchelContents)} of {satchelTier(profile.satchelTier).slots} slots used. Ores, ingots and gems stack {STACK_ORE} to a slot; an uncracked geode {STACK_GEODE}.
          </p>
          {SATCHEL_TIERS.map((t) => {
            const have = profile.satchelTier >= t.tier;
            const isNext = next?.tier === t.tier;
            const needs = needList(t.needs, profile);
            const ready = needs.every((n) => n.ok) && coins >= t.price;
            return (
              <div key={t.tier} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${profile.satchelTier === t.tier ? "bg-emerald-400/20" : isNext ? "border border-[#5ff2ff]/40 bg-[#5ff2ff]/10" : "bg-white/10"} ${!have && !isNext ? "opacity-60" : ""}`}>
                <span className="text-2xl">{t.icon}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {t.name} <span className="font-normal opacity-60">· {t.slots} slots</span>
                  </b>
                  {needs.length > 0 && !have && (
                    <span className="flex flex-wrap gap-1 pt-0.5 text-[10px]">
                      {needs.map((n) => (
                        <span key={n.label} className={`rounded-full px-1.5 ${n.ok ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/15 text-rose-200"}`}>
                          {n.ok ? "✓" : "✗"} {n.label} {n.have}/{n.need}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                {profile.satchelTier === t.tier ? (
                  <span className="px-2 text-xs font-bold text-emerald-200">Carried</span>
                ) : have ? (
                  <span className="px-2 text-xs opacity-60">Outgrown</span>
                ) : isNext ? (
                  <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={!ready} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "upgradeSatchel" })}>
                    {t.price.toLocaleString("en-US")} 🪙
                  </button>
                ) : (
                  <span className="px-2 text-xs opacity-60">{t.price.toLocaleString("en-US")} 🪙</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ShopShell>
  );
}

/** A satchel tier's makings, each with what you hold of it. */
function needList(needs: (typeof SATCHEL_TIERS)[number]["needs"], p: FishingProfile) {
  const out: { label: string; have: number; need: number; ok: boolean }[] = [];
  for (const [id, n] of Object.entries(needs.ore ?? {}) as [OreItemId, number][]) out.push({ label: ORE_ITEMS[id].name, have: satchelCountFor(p, id), need: n, ok: satchelCountFor(p, id) >= n });
  if (needs.sawdust) out.push({ label: "Sawdust", have: p.sawdust, need: needs.sawdust, ok: p.sawdust >= needs.sawdust });
  if (needs.resin) out.push({ label: "Pine Resin", have: p.resin, need: needs.resin, ok: p.resin >= needs.resin });
  for (const [k, n] of Object.entries(needs.byproducts ?? {}) as [ByproductId, number][]) out.push({ label: BYPRODUCTS[k].name, have: p.byproducts[k] ?? 0, need: n, ok: (p.byproducts[k] ?? 0) >= n });
  for (const [k, n] of Object.entries(needs.wood ?? {}) as [WoodKind, number][]) out.push({ label: WOOD[k].name, have: p.wood[k] ?? 0, need: n, ok: (p.wood[k] ?? 0) >= n });
  return out;
}
