import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { AXES, AXE_IDS, BYPRODUCTS, BYPRODUCT_IDS, WOOD, WOOD_CARRIER_TIERS, WOOD_KINDS, nextCarrierTier, woodAverage, woodPrice } from "@shared/chop";
import { FIREWOOD_PER_COIN, firewoodCoins, MAX_DAY_PERMITS, PERMIT_PRICES } from "@shared/economy";
import { CRAFTS, RESIN_PRICE, craftSalePrice, craftStacks } from "@shared/crafting";
import { craftGood, marketDirection, parseMarket, priceRun, woodGood } from "@shared/market";
import { carrierCap, carrierLoad, type FishingProfile } from "@shared/fishing";
import { CEILING_RATE, FULL_PRICE_AT, woodRate } from "@shared/keepers";
import { SHOP_TIER_CAP, soldElsewhere } from "@shared/expedition";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { LegacyTradeIn, hasLegacy } from "./LegacyTradeIn";
import { FooterBook, PRICE_COLUMN, GearShopList, MarketClock, SellAllButton, ShopShell, Trend, type ShopNotice, type ShopTab } from "./ShopShell";

/** The Whispering Woods' permits: a Day Trip (one way in) or the Ranger's Badge (in for good). Sold
 *  by Buster, at his stall or by the archway. */
export function WoodsPermits({ profile, coins, send }: { profile: FishingProfile; coins: number; send: (packet: CampfirePacket) => void }) {
  if (profile.ranger)
    return (
      <div className="flex flex-col items-center gap-1 rounded-2xl bg-emerald-400/15 px-3 py-3 text-center">
        <span className="text-3xl">🎖️</span>
        <b className="text-sm text-[#F7EBE1]">Ranger's Badge</b>
        <span className="text-xs opacity-80">The Whispering Woods are yours: walk through the archway any time.</span>
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-center text-xs opacity-80">Through the archway at the head of the north path, beside my stall: trees to fell (T1 to T5), the river's wild fish, and Bramble's trading post.</p>
      <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
        <span className="text-2xl">🎫</span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <b className="text-sm">
            Day Trip Permit <span className="font-normal opacity-70">×{profile.dayPermits}</span>
          </b>
          <span className="text-[11px] opacity-75">One trip in: stamped at the archway (come and go back out as you like)</span>
        </div>
        <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < PERMIT_PRICES.dayTrip || profile.dayPermits >= MAX_DAY_PERMITS} onClick={() => send({ type: "BUSTER", op: "buyPermit", permit: "dayTrip" })}>
          {PERMIT_PRICES.dayTrip} 🪙
        </button>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-[#F5A623]/50 bg-[#F5A623]/10 px-2.5 py-2">
        <span className="text-2xl">🎖️</span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <b className="text-sm">Ranger's Badge</b>
          <span className="text-[11px] opacity-75">The woods for good: no permit ever again</span>
        </div>
        <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < PERMIT_PRICES.rangerBadge} onClick={() => send({ type: "BUSTER", op: "buyPermit", permit: "ranger" })}>
          {PERMIT_PRICES.rangerBadge.toLocaleString("en-US")} 🪙
        </button>
      </div>
    </div>
  );
}

interface Props {
  profile: FishingProfile;
  coins: number;
  /** The camp's market this hour (shared/market.ts MarketState as JSON). */
  market: string;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onOpenCollection: () => void;
  onClose: () => void;
}

// Buster the Lumberjack's stall by the woodpile, on the shops' fixed-anchor counter (ShopShell). He
// buys your logs (at the hour's prices, each worth its tree's size), the felling's by-products, the
// Pine Resin, Firewood and the pieces carved at the workbench beside his stall; he sells the T2 axe
// and carrier, the woods' permits and the woodcutter's gear up to T3
// (the rest is Bramble's, in the woods). Every trade is the server's call (BUSTER packets); his
// answer comes back as busterResult.

const TABS: [ShopTab, string, string][] = [
  ["trade", "🪙", "Trade/Sell"],
  ["tools", "🪓", "Tools"],
  ["storage", "🎒", "Storage"],
  ["gear", "💍", "Gear"],
];

export function LumberjackModal({ profile, coins, market, send, subscribeMessages, onOpenCollection, onClose }: Props) {
  const [tab, setTab] = useState<ShopTab>("trade");
  const [notice, setNotice] = useState<ShopNotice | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "busterResult") return;
        const r = payload as BarnabyResult;
        setNotice({ text: r.message, ok: r.ok });
        if (r.ok && r.coins > 0) playSfx("coins");
        else if (r.ok) playSfx("chop");
      }),
    [subscribeMessages]
  );
  // at the hour's prices, past 30 of a kind sold each knocking 2% off the next (as the server settles it),
  // each log worth its tree's size (the stack's average: a big tree's logs fetch more)
  const hour = parseMarket(market);
  // (Buster pays in full for pine and birch; a finer wood fetches CEILING_RATE here, and Sell All
  // passes it by: shared/keepers.ts)
  const woodRun = (k: (typeof WOOD_KINDS)[number], n: number) => priceRun(Array.from({ length: n }, () => k), woodGood, (x, mult) => Math.max(1, Math.round(woodPrice(x, mult, woodAverage(profile, x)) * woodRate("campfire", x))), hour).total;
  const fullKinds = WOOD_KINDS.filter((k) => woodRate("campfire", k) === 1);
  const logs = fullKinds.reduce((n, k) => n + (profile.wood[k] ?? 0), 0);
  const logsWorth = fullKinds.reduce((sum, k) => sum + woodRun(k, profile.wood[k]), 0);
  const tooFine = WOOD_KINDS.reduce((n, k) => n + (fullKinds.includes(k) ? 0 : (profile.wood[k] ?? 0)), 0);
  const byCount = BYPRODUCT_IDS.reduce((n, k) => n + (profile.byproducts[k] ?? 0), 0);
  const byWorth = BYPRODUCT_IDS.reduce((sum, k) => sum + (profile.byproducts[k] ?? 0) * BYPRODUCTS[k].price, 0);
  // the stash's pieces to sell (its consumables are for using), a row a stack
  // (a piece from the old bench is traded in instead, at its full price: LegacyTradeIn)
  const forSale = profile.crafts.filter((c) => CRAFTS[c.c].price > 0 && !CRAFTS[c.c].legacy);
  const craftWorth = priceRun(forSale, (c) => craftGood(c.c), (c, mult) => craftSalePrice(c, mult), hour).total;
  const saleStacks = craftStacks(forSale).map((st) => ({ ...st, at: profile.crafts.findIndex((c) => c.c === st.item.c && c.m === st.item.m) }));
  const next = nextCarrierTier(profile.carrierTier);
  // (what Buster doesn't stock: T3 and T4 are Bramble's, T5 is forged in the caverns)
  const away = (tier: number) => soldElsewhere(tier, SHOP_TIER_CAP.campfire, "🐻 At Bramble's cabin in the woods");
  const held = WOOD_KINDS.filter((k) => profile.wood[k] > 0);
  return (
    <ShopShell
      title="Buster's Firewood"
      icon="🪓"
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
          <MarketClock market={hour} goods={[...held.map(woodGood), ...profile.crafts.map((c) => craftGood(c.c))]} />
          <FooterBook label="📖 Timber Collection" onClick={onOpenCollection} />
        </>
      }
    >
      {tab === "trade" && (
        <div className="flex flex-col gap-1.5">
          {tooFine > 0 && (
            <p className="m-0 rounded-xl bg-rose-400/10 px-2.5 py-1.5 text-center text-[11px] text-rose-100">
              💰 Buster can only pay {Math.round(CEILING_RATE * 100)}% for woods finer than birch ({tooFine} logs here): {FULL_PRICE_AT.wood.campfire} pays in full. Sell All passes them by.
            </p>
          )}
          {held.map((k) => {
            const have = profile.wood[k];
            return (
              <div key={k} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
                <span className="text-2xl">{WOOD[k].emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {WOOD[k].name} <span className="font-normal opacity-70">×{have}</span>
                  </b>
                  <span className="text-[11px] opacity-75">
                    {woodRun(k, 1)} 🪙 this hour <Trend dir={marketDirection(woodGood(k), hour)} />
                    {woodAverage(profile, k) > 1.01 ? ` · big logs ×${woodAverage(profile, k).toFixed(2)}` : ""}
                  </span>
                </div>
                <button type="button" className="clay-btn min-h-9 shrink-0 justify-center px-0 text-xs" style={{ width: 64, minWidth: 64 }} onClick={() => send({ type: "BUSTER", op: "sell", wood: k, count: 1 })}>
                  <span className="whitespace-nowrap text-[12px]">Sell 1</span>
                </button>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 justify-center px-0 text-xs" style={PRICE_COLUMN} onClick={() => send({ type: "BUSTER", op: "sell", wood: k, count: "all" })}>
                  <span className="whitespace-nowrap text-[12px]">All · {woodRun(k, have)} 🪙</span>
                </button>
              </div>
            );
          })}
          {BYPRODUCT_IDS.filter((k) => (profile.byproducts[k] ?? 0) > 0).map((k) => (
            <div key={k} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
              <span className="text-2xl">{BYPRODUCTS[k].emoji}</span>
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
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
              <span className="text-2xl">🔥</span>
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
          {profile.resin > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
              <span className="text-2xl">🍯</span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <b className="text-sm">
                  Pine Resin <span className="font-normal opacity-70">×{profile.resin}</span>
                </b>
                <span className="text-[11px] opacity-75">{RESIN_PRICE} 🪙 each · from gold swings</span>
              </div>
              <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 justify-center px-0 text-xs" style={PRICE_COLUMN} onClick={() => send({ type: "BUSTER", op: "sellResin", count: "all" })}>
                <span className="whitespace-nowrap text-[12px]">All · {profile.resin * RESIN_PRICE} 🪙</span>
              </button>
            </div>
          )}
          {forSale.length > 0 && (
            <>
              <b className="mt-1 text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Carved pieces</b>
              {saleStacks.map(({ item, n, at }) => (
                <div key={`${item.c}:${item.m}`} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${item.m ? "border-2 border-amber-300 bg-amber-300/10" : "bg-white/10"}`}>
                  <span className="text-xl">{CRAFTS[item.c].emoji}</span>
                  <b className="flex-1 text-xs">
                    {CRAFTS[item.c].name} <span className="font-normal opacity-70">×{n}</span>
                    {item.m && <span className="ml-1 text-amber-200">Masterwork ✨</span>}
                  </b>
                  <button type="button" className="clay-btn min-h-8 shrink-0 justify-center px-0 text-xs" style={PRICE_COLUMN} onClick={() => send({ type: "BUSTER", op: "sellCraft", slot: at })} title="Sell one">
                    <span className="whitespace-nowrap text-[12px]">{priceRun([item], (c) => craftGood(c.c), (c, mult) => craftSalePrice(c, mult), hour).total} 🪙</span>
                  </button>
                </div>
              ))}
              <button type="button" className="clay-btn clay-btn-amber min-h-10 w-full text-xs" onClick={() => send({ type: "BUSTER", op: "sellCraft", slot: "all" })}>
                Sell every carved piece · {craftWorth} 🪙
              </button>
            </>
          )}
          <LegacyTradeIn profile={profile} send={send} />
          {!held.length && !byCount && !profile.firewood && !profile.resin && !forSale.length && !hasLegacy(profile) && <p className="m-0 py-6 text-center text-sm opacity-70">Nothing to trade yet. The Soft Pines round the clearing are yours to fell!</p>}
          <p className="m-0 pt-1 text-center text-[11px] opacity-70">Carve your logs at the workbench 🪚 by the tipi: worth far more!</p>
        </div>
      )}

      {tab === "tools" && (
        <div className="flex flex-col gap-1.5">
          <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Axes</b>
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
          <b className="mt-1 text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">The Whispering Woods</b>
          <WoodsPermits profile={profile} coins={coins} send={send} />
        </div>
      )}

      {tab === "storage" && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-center text-xs opacity-75">
            Every log takes a slot ({carrierLoad(profile)}/{carrierCap(profile)} now; carved pieces go in the craft stash; the pouches grow with the carrier: 30 to 250). A full carrier means no more felling until you sell or split some (nothing is ever thrown away).
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

      {tab === "gear" && <GearShopList craft="wood" maxTier={3} elsewhere="🐻 At Bramble's cabin in the woods" profile={profile} coins={coins} onBuy={(id) => send({ type: "BUSTER", op: "buyGear", gear: id })} send={send} />}
    </ShopShell>
  );
}
