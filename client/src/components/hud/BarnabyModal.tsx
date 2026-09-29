import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { BAITS, BAIT_IDS, CREEL_TIERS, RODS, ROD_IDS, fishValue, livewellCap, nextCreelTier, type FishingProfile } from "@shared/fishing";
import { livewellBonus } from "@shared/gear";
import { CAVE_TACKLES, CAVE_TACKLE_IDS } from "@shared/caverns_fishing";
import { ORE_ITEMS, type OreItemId } from "@shared/caverns_mining";
import { BYPRODUCTS, type ByproductId } from "@shared/chop";
import { satchelCountFor } from "@shared/satchel";
import { COZY_AURA_LUCK, hasCozyAura } from "@shared/bonfire";
import { fishGood, marketMultiplier, parseMarket, priceRun } from "@shared/market";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { FishCard, FooterBook, GearShopList, MarketClock, SellAllButton, ShopShell, lockPacket, type ShopNotice, type ShopTab } from "./ShopShell";

interface Props {
  profile: FishingProfile;
  coins: number;
  fuel: number;
  /** The camp's market this hour (shared/market.ts MarketState as JSON). */
  market: string;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onOpenFieldGuide: () => void;
  onClose: () => void;
  /** Who keeps this shop: Barnaby at the campfire (rods and the angler's gear up to T3), Finley the
   *  River Otter on the woods' river, or Finnegan the Grotto Angler by the cenote (both every tier;
   *  Finnegan's advanced tackle bartered too). All buy fish and sell bait and livewells. */
  keeper?: "barnaby" | "finley" | "finnegan";
}

// Barnaby the Angler's stall by the dock (and Finley's boulder on the woods' river), on the shops'
// fixed-anchor counter (ShopShell): Sell All Unlocked Fish always in reach, each fish a card with its
// lock (a locked fish stays: Sell All passes it by, and its own sell button is off), rods and bait,
// the livewells, and the angler's gear. The hour's price for each fish (15% more while the bonfire's
// Cozy Aura is up; past 30 of a kind sold in the hour, each knocks 2% off the next). Every trade is the server's call
// (BARNABY packets); the answer comes back as barnabyResult, in the keeper's word. Finnegan's counter
// has a fifth tab, Barter: his advanced tackle for coins and the caverns' makings (ingots, gems, fish
// bones and prismatic scales), each made once and at work for good.

const TABS: [ShopTab, string, string][] = [
  ["trade", "🪙", "Trade/Sell"],
  ["tools", "🎣", "Tools"],
  ["storage", "🪣", "Storage"],
  ["gear", "💍", "Gear"],
];
const FINNEGAN_TABS: [ShopTab, string, string][] = [...TABS, ["barter", "🦎", "Barter"]];

export function BarnabyModal({ profile, coins, fuel, market, send, subscribeMessages, onOpenFieldGuide, onClose, keeper = "barnaby" }: Props) {
  // (Finnegan keeps every tier, as Finley does)
  const finley = keeper !== "barnaby";
  const finnegan = keeper === "finnegan";
  const [tab, setTab] = useState<ShopTab>("trade");
  const [notice, setNotice] = useState<ShopNotice | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "barnabyResult") return;
        const r = payload as BarnabyResult;
        setNotice({ text: r.message, ok: r.ok });
        if (r.ok && r.coins > 0) playSfx("coins");
        else if (r.ok) playSfx("pluck");
      }),
    [subscribeMessages]
  );
  const shop = (packet: Extract<CampfirePacket, { type: "BARNABY" }>) => send(packet);
  const aura = hasCozyAura(fuel) ? 1 + COZY_AURA_LUCK : 1;
  const hour = parseMarket(market);
  const price = (f: (typeof profile.creel)[number]) => priceRun([f], (x) => fishGood(x.s), (x, mult) => Math.round(fishValue(x, mult) * aura), hour).total;
  // Sell All: every unlocked fish, as the server will settle it (one at a time, each nudging the next)
  const unlocked = profile.creel.filter((f) => !f.l);
  const unlockedWorth = priceRun(unlocked, (f) => fishGood(f.s), (f, mult) => Math.round(fishValue(f, mult) * aura), hour).total;
  const next = nextCreelTier(profile.creelTier);
  const bonus = livewellBonus(profile.worn);
  const who = finnegan ? "Finnegan" : finley ? "Finley" : "Barnaby";

  return (
    <ShopShell
      title={finnegan ? "Finnegan's Grotto Tackle" : finley ? "Finley's River Tackle" : "Barnaby's Bait & Tackle"}
      icon={finnegan ? "🦎" : finley ? "🎣" : "🦦"}
      notice={notice}
      tabs={finnegan ? FINNEGAN_TABS : TABS}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      sellBar={<SellAllButton label="🐟 Sell All Unlocked Fish" count={unlocked.length} coins={unlockedWorth} onClick={() => shop({ type: "BARNABY", op: "sell", slot: "all" })} />}
      footer={
        <>
          <MarketClock market={hour} goods={profile.creel.map((f) => fishGood(f.s))} />
          <FooterBook label="📖 Field Guide" onClick={onOpenFieldGuide} />
        </>
      }
    >
      {tab === "trade" && (
        <div className="flex flex-col gap-1.5">
          {aura > 1 && <div className="rounded-xl bg-amber-300/15 px-2.5 py-1.5 text-xs text-amber-100">✨ Cozy Aura: the roaring campfire has {who} paying 15% more</div>}
          {profile.creel.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm opacity-70">{finnegan ? "Your livewell is empty. Cast into the cenote from the driftwood outcrop!" : "Your livewell is empty. Cast a line from the dock, the canoe, or the woods' river bank!"}</p>
          ) : (
            profile.creel.map((f, i) => <FishCard key={i} fish={f} price={price(f)} mult={marketMultiplier(fishGood(f.s), hour)} onToggleLock={() => send(lockPacket(f, i))} onSell={() => shop({ type: "BARNABY", op: "sell", slot: i })} />)
          )}
          {profile.creel.some((f) => f.l) && <p className="m-0 pt-1 text-center text-[11px] opacity-70">🔒 Locked fish stay in your livewell: Sell All passes them by.</p>}
        </div>
      )}

      {tab === "tools" && (
        <div className="flex flex-col gap-1.5">
          <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Rods</b>
          {ROD_IDS.map((id) => {
            const rod = RODS[id];
            const owned = profile.rods.includes(id);
            const using = profile.rod === id;
            return (
              <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${using ? "bg-emerald-400/20" : rod.tier >= 4 ? "border border-[#F5A623]/40 bg-[#F5A623]/10" : "bg-white/10"}`}>
                <span className="text-2xl">{rod.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">{rod.name}</b>
                  <span className="text-[11px] opacity-75">{rod.blurb}</span>
                </div>
                {using ? (
                  <span className="px-2 text-xs font-bold text-emerald-200">In hand</span>
                ) : owned ? (
                  <button type="button" className="clay-btn min-h-9 px-3 text-xs" onClick={() => shop({ type: "BARNABY", op: "equipRod", rod: id })}>
                    Use
                  </button>
                ) : rod.tier >= 4 && !finley ? (
                  // the legendary and mythic rods: Finley's, on the Whispering Woods' river
                  <span className="max-w-[92px] px-1 text-right text-[10px] leading-tight opacity-70">🦦 At Finley's boulder on the woods' river</span>
                ) : (
                  <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < rod.price} onClick={() => shop({ type: "BARNABY", op: "buyRod", rod: id })}>
                    {rod.price.toLocaleString("en-US")} 🪙
                  </button>
                )}
              </div>
            );
          })}
          <b className="mt-1 text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Bait</b>
          {BAIT_IDS.map((id) => {
            const bait = BAITS[id];
            const have = profile.baits[id] ?? 0;
            const on = profile.bait === id;
            return (
              <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${on ? "bg-emerald-400/20" : "bg-white/10"}`}>
                <span className="text-2xl">{bait.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {bait.name} <span className="font-normal opacity-70">×{have}</span>
                  </b>
                  <span className="text-[11px] opacity-75">
                    {bait.blurb} Pack of {bait.pack}, one per cast.
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <button type="button" className="clay-btn clay-btn-amber min-h-8 px-3 text-xs" disabled={coins < bait.price} onClick={() => shop({ type: "BARNABY", op: "buyBait", bait: id })}>
                    {bait.price} 🪙
                  </button>
                  {have > 0 && (
                    <button type="button" className="clay-btn min-h-8 px-3 text-xs" onClick={() => shop({ type: "BARNABY", op: "equipBait", bait: on ? "" : id })}>
                      {on ? "Unhook" : "Hook it"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "storage" && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-center text-xs opacity-75">
            A full livewell stows the rod until you sell some fish ({profile.creel.length}/{livewellCap(profile)} now{bonus ? `, +${bonus} from your holster` : ""}). Each one in turn holds more:
          </p>
          {CREEL_TIERS.map((t, i) => {
            const tier = i + 1;
            const have = tier <= profile.creelTier;
            const using = tier === profile.creelTier;
            return (
              <div key={t.id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${using ? "bg-emerald-400/20" : have ? "bg-white/5 opacity-60" : "bg-white/10"}`}>
                <span className="text-xl">{t.icon}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">{t.name}</b>
                  <span className="text-[11px] opacity-75">{t.capacity} fish</span>
                </div>
                {using ? (
                  <span className="px-2 text-xs font-bold text-emerald-200">In use</span>
                ) : have ? (
                  <span className="px-2 text-xs opacity-60">Outgrown</span>
                ) : next?.id === t.id ? (
                  <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < t.price} onClick={() => shop({ type: "BARNABY", op: "upgradeCreel" })}>
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

      {tab === "gear" && <GearShopList craft="fish" maxTier={finley ? 5 : 3} elsewhere="🦦 At Finley's boulder on the woods' river" profile={profile} coins={coins} onBuy={(id) => shop({ type: "BARNABY", op: "buyGear", gear: id })} send={send} />}

      {tab === "barter" && finnegan && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-center text-xs opacity-75">Finnegan's advanced tackle: coins and the caverns' makings. Each made once, and at work on every line for good.</p>
          {CAVE_TACKLE_IDS.map((id) => {
            const t = CAVE_TACKLES[id];
            const owned = profile.caveTackles.includes(id);
            const ore = (Object.entries(t.ore) as [OreItemId, number][]).map(([k, n]) => ({ key: k, name: ORE_ITEMS[k].name, n, have: satchelCountFor(profile, k) }));
            const mats = (Object.entries(t.byproducts) as [ByproductId, number][]).map(([k, n]) => ({ key: k, name: BYPRODUCTS[k].name, n, have: profile.byproducts[k] ?? 0 }));
            const ready = coins >= t.price && [...ore, ...mats].every((x) => x.have >= x.n);
            return (
              <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${owned ? "bg-emerald-400/20" : "border border-[#5ff2ff]/30 bg-[#5ff2ff]/10"}`}>
                <span className="text-2xl">{t.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                  <b className="text-sm">{t.name}</b>
                  <span className="text-[11px] opacity-75">{t.blurb}</span>
                  {!owned && (
                    <span className="flex flex-wrap gap-1 text-[10px]">
                      <span className={`rounded-full px-1.5 ${coins >= t.price ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>{t.price.toLocaleString("en-US")} 🪙</span>
                      {[...ore, ...mats].map((x) => (
                        <span key={x.key} className={`rounded-full px-1.5 ${x.have >= x.n ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>
                          {x.n} {x.name} <span className="opacity-70">({x.have})</span>
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                {owned ? (
                  <span className="px-2 text-xs font-bold text-emerald-200">Owned ✓</span>
                ) : (
                  <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={!ready} onClick={() => shop({ type: "BARNABY", op: "buyCaveTackle", tackle: id })}>
                    Barter
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ShopShell>
  );
}
