import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { AXES, AXE_IDS, WOOD, WOOD_CARRIER_TIERS, WOOD_KINDS, carrierCapacity, nextCarrierTier, woodPrice } from "@shared/chop";
import { CRAFTS, RESIN_PRICE, craftSalePrice } from "@shared/crafting";
import { craftGood, marketDirection, parseMarket, priceRun, woodGood } from "@shared/market";
import { Trend } from "./BarnabyModal";
import { GEAR, GEAR_IDS } from "@shared/gear";
import { carrierLoad, type FishingProfile } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { MAX_DAY_PERMITS, PERMIT_PRICES } from "@shared/economy";

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
      <p className="m-0 text-center text-xs opacity-80">Beyond the archway at the fence's west end: trees to fell (T1 to T5), the rapids' wild fish, and Bramble's trading post.</p>
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
  onClose: () => void;
}

// Buster the Lumberjack's stall by the woodpile. He buys your split wood (Soft Pine, Hard Oak,
// Golden Charcoal), the Pine Resin from critical chops and the artisan pieces carved at the
// workbench beside his stall (WoodCraftModal); he sells better axes, bigger wood carriers tier by
// tier, and utility gear (gloves for the chopping meter, boots, an apron for the workbench). Every trade is the server's call
// (BUSTER packets); his answer comes back as busterResult.

type Tab = "sell" | "axes" | "gear" | "carrier" | "permits";
const TABS: [Tab, string][] = [
  ["sell", "🪙 Sell"],
  ["axes", "🪓 Axes"],
  ["gear", "🧤 Gear"],
  ["carrier", "🎒 Carrier"],
  ["permits", "🌲 Woods"],
];
const HELLO = "Howdy! Buster's the name, timber's the game. Got some wood for me? 🦫";

export function LumberjackModal({ profile, coins, market, send, subscribeMessages, onClose, startTab = "sell" }: Props & { startTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(startTab);
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
  // at the hour's prices, each sale knocking 2% off the next of its kind (as the server settles it)
  const hour = parseMarket(market);
  const woodRun = (k: (typeof WOOD_KINDS)[number], n: number) => priceRun(Array.from({ length: n }, () => k), woodGood, (x, mult) => woodPrice(x, mult), hour).total;
  const woodWorth = WOOD_KINDS.reduce((sum, k) => sum + woodRun(k, profile.wood[k]), 0) + profile.resin * RESIN_PRICE;
  const craftWorth = priceRun(profile.crafts, (c) => craftGood(c.c), (c, mult) => craftSalePrice(c, mult), hour).total;
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
                      {woodRun(k, 1)} 🪙 this hour <Trend dir={marketDirection(woodGood(k), hour)} /> · or +{WOOD[k].fuel}% on the fire
                    </span>
                  </div>
                  <button type="button" className="clay-btn min-h-9 px-3 text-xs" disabled={have < 1} onClick={() => send({ type: "BUSTER", op: "sell", wood: k, count: 1 })}>
                    Sell 1
                  </button>
                  <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={have < 1} onClick={() => send({ type: "BUSTER", op: "sell", wood: k, count: "all" })}>
                    All · {woodRun(k, have)} 🪙
                  </button>
                </div>
              );
            })}
            {profile.resin > 0 && (
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
                <span className="text-2xl">🍯</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    Pine Resin <span className="font-normal opacity-70">×{profile.resin}</span>
                  </b>
                  <span className="text-[11px] opacity-75">{RESIN_PRICE} 🪙 each · from critical chops · its own jar, 0 carrier slots</span>
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send({ type: "BUSTER", op: "sellResin", count: "all" })}>
                  All · {profile.resin * RESIN_PRICE} 🪙
                </button>
              </div>
            )}
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
                        {priceRun([item], (c) => craftGood(c.c), (c, mult) => craftSalePrice(c, mult), hour).total} 🪙
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-10 w-full text-xs" onClick={() => send({ type: "BUSTER", op: "sellCraft", slot: "all" })}>
                  Sell every carved piece · {craftWorth} 🪙
                </button>
              </div>
            )}
            {WOOD_KINDS.some((k) => profile.wood[k] > 0) && (
              <button type="button" className="clay-btn clay-btn-amber min-h-10 w-full text-xs" onClick={() => send({ type: "BUSTER", op: "sellAllWood" })}>
                🪵 Sell All Logs · {WOOD_KINDS.reduce((sum, k) => sum + woodRun(k, profile.wood[k]), 0)} 🪙
              </button>
            )}
            <p className="m-0 text-center text-xs opacity-75">
              Carrying <b className="text-amber-200">{woodWorth + craftWorth} 🪙</b> of timber. Carve it at the workbench 🪚 by the tipi: worth far more!
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
                  ) : axe.tier >= 4 ? (
                    // the Maple and Elderwood axes: Bramble's, in the Whispering Woods
                    <span className="max-w-[92px] px-1 text-right text-[10px] leading-tight opacity-70">🐻 At Bramble's cabin in the woods</span>
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

        {tab === "gear" && (
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-center text-xs opacity-75">Buy it once and it works for good: no need to put it on.</p>
            {GEAR_IDS.map((id) => {
              const g = GEAR[id];
              const owned = profile.gear.includes(id);
              return (
                <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${owned ? "bg-emerald-400/20" : "bg-white/10"}`}>
                  <span className="text-2xl">{g.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="text-sm">{g.name}</b>
                    <span className="text-[11px] opacity-75">{g.blurb}</span>
                  </div>
                  {owned ? (
                    <span className="px-2 text-xs font-bold text-emerald-200">Owned</span>
                  ) : (
                    <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < g.price} onClick={() => send({ type: "BUSTER", op: "buyGear", gear: id })}>
                      {g.price} 🪙
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "permits" && <WoodsPermits profile={profile} coins={coins} send={send} />}

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
