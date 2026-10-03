import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { BAITS, BAIT_IDS, CREEL_TIERS, RODS, ROD_IDS, TIER_LABEL, fishValue, livewellCap, nextCreelTier, type FishId, type FishingProfile } from "@shared/fishing";
import { livewellBonus } from "@shared/gear";
import { CAVE_TACKLES, CAVE_TACKLE_IDS } from "@shared/caverns_fishing";
import { ORE_ITEMS, type OreItemId } from "@shared/caverns_mining";
import { BYPRODUCTS, type ByproductId } from "@shared/chop";
import { FORGED_TOOLS, FORGED_TOOL_IDS, forgedBlocked, forgedOwned, makingsList } from "@shared/expedition";
import { SEA_CHANNEL } from "@shared/voyage";
import { CEILING_RATE, FISH_CEILING, FULL_PRICE_AT, fishRate, type Counter } from "@shared/keepers";
import { SHOP_TIER_CAP, soldElsewhere } from "@shared/expedition";
import { hasForesight, noCeiling } from "@shared/gear";
import { GearWorks } from "./GearWorks";
import { satchelCountFor } from "@shared/satchel";
import { COZY_AURA_LUCK, hasCozyAura } from "@shared/bonfire";
import { fishGood, marketMultiplier, parseMarket, priceRun } from "@shared/market";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { FishCard, FooterBook, MarketClock, SellAllButton, ShopShell, lockPacket, type ShopNotice, type ShopTab } from "./ShopShell";

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
  /** Who keeps this shop: Barnaby at the campfire (the T2 rod and livewell, the angler's gear up to T3), Finley the
   *  River Otter on the woods' river, or Finnegan the Grotto Angler by the cenote (both every tier;
   *  Finnegan's advanced tackle bartered too). All buy fish and sell bait and livewells. */
  keeper?: "barnaby" | "finley" | "finnegan" | "dune";
  /** Dune's timber scale (he buys wood too: BrambleModal's trade tab). */
  onTimber?: () => void;
  /** Dune's ore scale (GusShopModal's trade tab). */
  onOre?: () => void;
  /** Dune's Tidewater tools are made on the boat's channel (shared/voyage.ts). */
  sea?: (channel: string, packet?: unknown) => void;
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
const DUNE_TABS: [ShopTab, string, string][] = [...TABS, ["barter", "🌊", "Tidewater"]];

export function BarnabyModal({ profile, coins, fuel, market, send, subscribeMessages, onOpenFieldGuide, onClose, keeper = "barnaby", sea, onTimber, onOre }: Props) {
  // (Finnegan keeps every tier, as Finley does)
  const finley = keeper !== "barnaby";
  const finnegan = keeper === "finnegan";
  // (Dune, at his shack on Sunset Beach: stocked as Finley is, and he pays in full for every fish)
  const dune = keeper === "dune";
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
  // (what this counter can afford: past its ceiling it pays CEILING_RATE, and Sell All passes those by)
  const counter: Counter = dune ? "beach" : finnegan ? "caverns" : finley ? "woods" : "campfire";
  // (the Wayfarer's whole set: every keeper pays in full)
  const rate = (s: FishId) => (noCeiling(profile) ? 1 : fishRate(counter, s));
  const worth = (x: (typeof profile.creel)[number], mult: number) => Math.max(1, Math.round(fishValue(x, mult) * aura * rate(x.s)));
  const price = (f: (typeof profile.creel)[number]) => priceRun([f], (x) => fishGood(x.s), worth, hour).total;
  // Sell All: every unlocked fish this counter pays in full for, as the server will settle it (one at
  // a time, each nudging the next)
  const unlocked = profile.creel.filter((f) => !f.l && rate(f.s) === 1);
  const unlockedWorth = priceRun(unlocked, (f) => fishGood(f.s), worth, hour).total;
  const tooFine = profile.creel.filter((f) => rate(f.s) < 1).length;
  const next = nextCreelTier(profile.creelTier);
  // (what this counter doesn't stock: T3 and T4 are the woods', T5 is forged in the caverns)
  const away = (tier: number) => soldElsewhere(tier, finley ? SHOP_TIER_CAP.woods : SHOP_TIER_CAP.campfire, "🦦 At Finley's boulder on the woods' river");
  const bonus = livewellBonus(profile);
  const who = dune ? "Dune" : finnegan ? "Finnegan" : finley ? "Finley" : "Barnaby";

  return (
    <ShopShell
      title={dune ? "Dune's Fish Shack" : finnegan ? "Finnegan's Grotto Tackle" : finley ? "Finley's River Tackle" : "Barnaby's Bait & Tackle"}
      icon={dune ? "🐢" : finnegan ? "🦎" : finley ? "🎣" : "🦦"}
      notice={notice}
      tabs={dune ? DUNE_TABS : finnegan ? FINNEGAN_TABS : TABS}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      sellBar={<SellAllButton label="🐟 Sell All Unlocked Fish" count={unlocked.length} coins={unlockedWorth} onClick={() => shop({ type: "BARNABY", op: "sell", slot: "all" })} />}
      footer={
        <>
          <MarketClock market={hour} goods={profile.creel.map((f) => fishGood(f.s))} ahead={hasForesight(profile)} />
          <FooterBook label="📖 Field Guide" onClick={onOpenFieldGuide} />
        </>
      }
    >
      {tab === "trade" && (
        <div className="flex flex-col gap-1.5">
          {aura > 1 && <div className="rounded-xl bg-amber-300/15 px-2.5 py-1.5 text-xs text-amber-100">✨ Cozy Aura: the roaring campfire has {who} paying 15% more</div>}
          {tooFine > 0 && (
            <p className="m-0 rounded-xl bg-rose-400/10 px-2.5 py-1.5 text-center text-[11px] text-rose-100">
              💰 {who} can only pay {Math.round(CEILING_RATE * 100)}% for fish finer than {TIER_LABEL[FISH_CEILING[counter]]} ({tooFine} here): {FULL_PRICE_AT.fish[counter]} pays in full. Sell All passes them by.
            </p>
          )}
          {profile.creel.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm opacity-70">{dune ? "Your livewell is empty. Cast into the sea from the pier, or wade in a step from the sand!" : finnegan ? "Your livewell is empty. Cast into the lake from anywhere on its shore!" : "Your livewell is empty. Cast a line from the dock, the canoe, or the woods' river bank!"}</p>
          ) : (
            profile.creel.map((f, i) => <FishCard key={i} fish={f} price={price(f)} mult={marketMultiplier(fishGood(f.s), hour)} onToggleLock={() => send(lockPacket(f, i))} onSell={() => shop({ type: "BARNABY", op: "sell", slot: i })} />)
          )}
          {dune && onOre && (
            <button type="button" className="clay-btn clay-btn-ghost min-h-11 justify-center text-xs" onClick={onOre}>
              ⛏️ Reef stone, ore, gems? The ore scale
            </button>
          )}
          {dune && onTimber && (
            <button type="button" className="clay-btn clay-btn-ghost min-h-11 justify-center text-xs" onClick={onTimber}>
              🪵 Logs, husks, coconuts? The timber scale
            </button>
          )}
          {profile.creel.some((f) => f.l) && <p className="m-0 pt-1 text-center text-[11px] opacity-70">🔒 Locked fish stay in your livewell: Sell All passes them by.</p>}
        </div>
      )}

      {tab === "tools" && (
        <div className="flex flex-col gap-1.5">
          <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Rods</b>
          {ROD_IDS.filter((id) => RODS[id].tier < 7 || profile.coveAccess || profile.rods.includes(id)).map((id) => {
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
                ) : away(rod.tier) ? (
                  <span className="max-w-[92px] px-1 text-right text-[10px] leading-tight opacity-70">{away(rod.tier)}</span>
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
                ) : next?.id === t.id && away(tier) ? (
                  <span className="max-w-[92px] px-1 text-right text-[10px] leading-tight opacity-70">{away(tier)}</span>
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

      {tab === "gear" && <GearWorks profile={profile} coins={coins} send={send} families={["angler", "wayfarer"]} places={[finley ? "woods" : "campfire"]} />}

      {tab === "barter" && dune && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-center text-[12px] opacity-80">"A Tidewater rod isn't bought, it's made: slow, and from good things." Coins and makings from all three crafts. A Masterwork ingot stands in for a plain one.</p>
          {FORGED_TOOL_IDS.filter((id) => FORGED_TOOLS[id].place === "dune").map((id) => {
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
                      {first && <span className="rounded-full bg-rose-400/15 px-1.5 text-rose-200">Needs {first}</span>}
                    </span>
                  )}
                </div>
                <button type="button" className={`clay-btn min-h-11 shrink-0 px-3 text-xs ${owned ? "clay-btn-ghost" : "clay-btn-amber"}`} disabled={owned || !ready} onClick={() => sea?.(SEA_CHANNEL, { op: "make", tool: id })}>
                  {owned ? "Made ✓" : "Make"}
                </button>
              </div>
            );
          })}
        </div>
      )}

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
