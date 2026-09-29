import { useState } from "react";
import { isCavernsMap, type CampfirePacket, type MapId } from "@shared/types";
import { CAVERNS_CHANNELS, FORGE_SMELT_S, ORE_CATEGORIES, ORE_CATEGORY_LABEL, ORE_ITEMS, ORE_KINDS, PICKAXES, PICKAXES_BY_TIER, itemsOf, smeltable, QUICK_SMELT_ORDER, warmthOn, type OreCategory, type OreItemId } from "@shared/caverns_mining";
import { satchelCap, satchelCounts, satchelTier, slotsUsed, stackOf, STACK_GEODE, STACK_ORE } from "@shared/satchel";
import type { FishingProfile } from "@shared/fishing";
import { satchelBonus } from "@shared/gear";
import { marketMultiplier, oreGood, parseMarket } from "@shared/market";
import { Modal } from "./Modal";
import { TrendBadge } from "./ShopShell";
import { GearSlots } from "./GearSlots";
import { DrawerCrafts, Materials } from "./DrawerKit";

// The Prospector's Satchel's drawer, opened from the header's ⛏️ gauge (or B, in turn with the other
// drawers), laid out like the wood and fish drawers (520 x 600, never jumping between tabs): how full
// it is (its tier's slots, and the Deepvein Satchel Strap's four more while worn), four drawers of
// slots (Raw Ores, Smelted Ingots, Uncracked Geodes, Cut Gems), each slot a stack (ores, ingots and
// gems up to 10, an uncracked geode 5) with what it fetches from Gus this hour; a satchel over its room
// from before keeps everything (Overburdened: no more mining until it is back under, while selling,
// smelting, cracking and crafting all still work); Gear: the pickaxes (one in hand) and the Miner's
// relics worn slot by slot; Brews: the Miner's Stout brewed right here from coal and Fine Stone Dust.
// Pinned to its foot, its two quick actions (anywhere in the caverns): Quick Smelt All (every recipe
// the satchel makes into the forge, the best margin first) and Sell All Cut Gems (to Gus); and under
// them the pickaxe in hand, the forge's queue and the Deep Warmth.

interface Props {
  profile: FishingProfile;
  market: string;
  mapId: MapId;
  send: (channel: string, packet?: unknown) => void;
  /** The camp's channel (the gear, the drawer's brews: taken on every map). */
  campfireSend: (packet: CampfirePacket) => void;
  onClose: () => void;
}

type Tab = OreCategory | "gear" | "brews";
const SHORT: Record<OreCategory, string> = { raw: "Ores", ingot: "Ingots", geode: "Geodes", gem: "Gems" };

export function OreSatchelDrawer({ profile, market, mapId, send, campfireSend, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("raw");
  const hour = parseMarket(market);
  const tier = satchelTier(profile.satchelTier);
  const bonus = satchelBonus(profile.worn);
  const cap = satchelCap(profile, bonus);
  const used = slotsUsed(profile.satchelContents);
  const counts = satchelCounts(profile);
  const price = (id: OreItemId) => Math.max(1, Math.round(ORE_ITEMS[id].price * marketMultiplier(oreGood(id), hour)));
  const worth = (Object.entries(counts) as [OreItemId, number][]).reduce((a, [id, n]) => a + price(id) * n, 0);
  // each item's stacks, as slots
  const slots = (tab === "gear" || tab === "brews" ? [] : itemsOf(tab)).flatMap((id) => {
    const n = counts[id] ?? 0;
    const per = stackOf(id);
    return Array.from({ length: Math.ceil(n / per) }, (_, k) => ({ id, n: Math.min(per, n - k * per) }));
  });
  const here = isCavernsMap(mapId);
  const smeltCount = QUICK_SMELT_ORDER.reduce((a, ingot) => a + smeltable(counts, ingot), 0);
  const gems = itemsOf("gem").reduce((a, id) => a + (counts[id] ?? 0), 0);
  const gemsWorth = itemsOf("gem").reduce((a, id) => a + price(id) * (counts[id] ?? 0), 0);
  const queued = profile.forgeQueue.reduce((a, j) => a + j.n, 0);
  const tray = Object.values(profile.forgeTray).reduce((a, n) => a + (n ?? 0), 0);
  const pick = PICKAXES[profile.pickaxeId];
  const warm = warmthOn(profile.deepWarmthUntil);
  const mined = Object.values(profile.mined).reduce((a, n) => a + (n ?? 0), 0);
  return (
    <Modal title={`${tier.icon} ${tier.name}`} icon="⛏️" onClose={onClose} width={520} pinned fixedHeight={600}>
      <div className="flex shrink-0 flex-col gap-2 pb-2">
        <div className="flex items-center gap-2 text-xs">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (used / Math.max(1, cap)) * 100)}%`, background: used >= cap ? "#ec7fa3" : "#5ff2ff" }} />
          </div>
          <b className={`tabular-nums ${used > cap ? "text-rose-300" : ""}`} title={used > cap ? "Over its room: everything is kept, but nothing more comes in until you sell, smelt or crack some" : `${STACK_ORE} ores, ingots or gems a slot; ${STACK_GEODE} geodes${bonus ? `; +${bonus} slots from your Deepvein Satchel Strap` : ""}`}>
            {used}/{cap} slots
          </b>
          <span className="opacity-75">
            worth <b className="text-amber-200">{worth.toLocaleString("en-US")} 🪙</b> to Gus
          </span>
        </div>
        {used > cap && (
          <p className="m-0 rounded-xl border border-rose-300/40 bg-rose-400/10 px-2.5 py-1 text-center text-[11px] text-rose-100">
            ⚠️ Overburdened: everything is kept, but no more ore comes in until you're back under {cap} slots. Selling, smelting, cracking and crafting still work.
          </p>
        )}
        <div className="flex gap-1" role="tablist">
          {ORE_CATEGORIES.map((c) => {
            const n = itemsOf(c).reduce((a, id) => a + (counts[id] ?? 0), 0);
            return (
              <button key={c} type="button" role="tab" aria-selected={tab === c} onClick={() => setTab(c)} className={`min-h-9 min-w-0 flex-1 whitespace-nowrap rounded-full px-1 text-[10.5px] font-bold transition-transform active:scale-95 ${tab === c ? "bg-[#5ff2ff] text-[#10222a]" : "bg-white/10 hover:bg-white/15"}`} title={ORE_CATEGORY_LABEL[c].name}>
                <span className="text-[10.5px]">
                  <span className="hidden sm:inline">{ORE_CATEGORY_LABEL[c].emoji} </span>
                  {SHORT[c]}
                  {n > 0 && <span className="ml-1 opacity-70">{n}</span>}
                </span>
              </button>
            );
          })}
          {(
            [
              ["gear", "⛏️", "Gear"],
              ["brews", "🍺", "Brews"],
            ] as const
          ).map(([id, emoji, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-9 min-w-0 flex-1 whitespace-nowrap rounded-full px-1 text-[10.5px] font-bold transition-transform active:scale-95 ${tab === id ? "bg-[#5ff2ff] text-[#10222a]" : "bg-white/10 hover:bg-white/15"}`}>
              <span className="text-[10.5px]">
                <span className="hidden sm:inline">{emoji} </span>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1">
        {tab === "gear" ? (
          <div className="flex flex-col gap-2 text-xs">
            <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Pickaxes</b>
            <div className="flex flex-col gap-1.5">
              {PICKAXES_BY_TIER.filter((id) => profile.pickaxes.includes(id)).map((id) => {
                const p = PICKAXES[id];
                const inHand = profile.pickaxeId === id;
                return (
                  <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${inHand ? "border border-[#5ff2ff]/50 bg-[#5ff2ff]/10" : "bg-white/10"}`}>
                    <span className="text-2xl">{p.emoji}</span>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <b className="text-xs text-[#F7EBE1]">
                        {p.name} <span className="font-normal opacity-70">· T{p.tier}</span>
                      </b>
                      <span className="text-[10.5px] opacity-75">{p.blurb}</span>
                    </div>
                    <button type="button" className={`clay-btn min-h-9 px-3 text-[11px] ${inHand ? "clay-btn-ghost" : "clay-btn-amber"}`} disabled={inHand} onClick={() => send(CAVERNS_CHANNELS.gus, { op: "equipPickaxe", pickaxe: id })}>
                      {inHand ? "In hand" : "Take"}
                    </button>
                  </div>
                );
              })}
              {profile.pickaxes.length < PICKAXES_BY_TIER.length && <p className="m-0 text-center text-[11px] opacity-60">Gus sells the finer pickaxes at the outpost.</p>}
            </div>
            <GearSlots profile={profile} send={campfireSend} disc="ore" />
          </div>
        ) : tab === "brews" ? (
          <div className="flex flex-col gap-2 text-xs">
            <DrawerCrafts profile={profile} drawer="ore" send={campfireSend} />
            <Materials profile={profile} disc="ore" />
            <p className="m-0 text-center text-[11px] opacity-70">Fine Stone Dust falls from broken silver lodes and pulverized geodes. Gus buys it; the forge's relics and the Miner's Stout take it.</p>
          </div>
        ) : slots.length === 0 ? (
          <p className="m-0 rounded-2xl bg-white/5 px-3 py-4 text-center text-sm opacity-80">{EMPTY[tab as OreCategory]}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {slots.map((st, i) => {
              const item = ORE_ITEMS[st.id];
              const mult = marketMultiplier(oreGood(st.id), hour);
              return (
                <div key={`${st.id}:${i}`} className={`flex min-h-[92px] flex-col items-center justify-between gap-0.5 rounded-2xl px-1.5 py-1.5 text-center ${item.cat === "gem" ? "bg-[#5ff2ff]/10 ring-1 ring-[#5ff2ff]/45" : item.cat === "geode" ? "bg-[#b36bff]/10 ring-1 ring-[#b36bff]/40" : "bg-white/10"}`} title={`${item.name}: ${item.blurb}`}>
                  <span className="relative text-2xl leading-none">
                    <span style={{ filter: `drop-shadow(0 0 6px ${item.color}aa)` }}>{item.emoji}</span>
                    <span className="absolute -bottom-1 -right-4 rounded-full bg-[#2B201B] px-1 text-[10px] font-bold tabular-nums text-[#F7EBE1] ring-1 ring-white/15">
                      ×{st.n}
                      <span className="opacity-50">/{stackOf(st.id)}</span>
                    </span>
                  </span>
                  <span className="line-clamp-2 w-full text-[10px] font-semibold leading-tight text-[#F7EBE1]">{item.name}</span>
                  <TrendBadge price={price(st.id)} mult={mult} />
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, Math.min(4, cap - used)) }, (_, i) => (
              <div key={`free:${i}`} className="flex min-h-[92px] items-center justify-center rounded-2xl border border-dashed border-white/15 text-[10px] opacity-40" aria-label="A free slot">
                free
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 border-t border-white/10 pt-2">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="clay-btn clay-btn-amber flex min-h-12 flex-col items-center justify-center gap-0 px-2 leading-tight" disabled={!here || smeltCount === 0} onClick={() => send(CAVERNS_CHANNELS.satchel, { op: "smeltAll" })} title={here ? "Every ingot the satchel's ores make, into the Thermal Bellows Forge (silver first: the best margin)" : "The forge is down in the Glimmering Caverns"}>
            <span className="text-[12.5px]">🔥 Quick Smelt All</span>
            <span className="text-[11px] font-semibold opacity-90">{here ? `${smeltCount} ingot${smeltCount === 1 ? "" : "s"}` : "in the caverns"}</span>
          </button>
          <button type="button" className="clay-btn clay-btn-amber flex min-h-12 flex-col items-center justify-center gap-0 px-2 leading-tight" disabled={!here || gems === 0} onClick={() => send(CAVERNS_CHANNELS.satchel, { op: "sellGems" })} title={here ? "Every cut gem to Gus, at this hour's prices" : "Gus buys them down in the Glimmering Caverns"}>
            <span className="text-[12.5px]">💎 Sell All Cut Gems ({gems})</span>
            <span className="text-[11px] font-semibold tabular-nums opacity-90">{gemsWorth.toLocaleString("en-US")} 🪙</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-white/10 px-2 py-0.5" title={pick.blurb}>
            {pick.emoji} {pick.name} · T{pick.tier}
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5" title={`The Thermal Bellows Forge: an ingot every ${FORGE_SMELT_S} s, into your satchel (or its tray when the satchel is full)`}>
            🔥 {queued > 0 ? `${queued} in the forge` : "forge idle"}
            {tray > 0 ? ` · ${tray} on its tray` : ""}
          </span>
          {warm && <span className="rounded-full border border-orange-300/50 bg-orange-300/10 px-2 py-0.5">♨️ Deep Warmth</span>}
          <span className="rounded-full bg-white/10 px-2 py-0.5 opacity-80" title={Object.entries(profile.mined).map(([k, n]) => `${ORE_KINDS[k as keyof typeof ORE_KINDS].name}: ${n}`).join(" · ") || "Nothing mined yet"}>
            🪨 {mined} broken
          </span>
        </div>
      </div>
    </Modal>
  );
}

const EMPTY: Record<OreCategory, string> = {
  raw: "No ore yet. Mine a node: the doline's coal and copper in its fallen rocks, the crystal fissures' iron, silver and glimmerstone.",
  ingot: "No ingots yet. The Thermal Bellows Forge smelts them (Quick Smelt All, below, or the bellows at the forge for Masterworks).",
  geode: "No geodes yet. Iron lodes and Glimmerstone clusters give them up now and then; the Titan Monolith always.",
  gem: "No gems yet. Cleave a geode on the meteorite anvil, by the forge.",
};
