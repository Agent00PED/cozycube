import { useState } from "react";
import { BAITS, BAIT_IDS, FISH_TIER_RANK, RODS, TIER_LABEL, creelTier, fishValue, livewellCap, type FishingProfile } from "@shared/fishing";
import { livewellBonus } from "@shared/gear";
import type { CampfirePacket } from "@shared/types";
import { fishGood, marketMultiplier, parseMarket } from "@shared/market";
import { Modal } from "./Modal";
import { FishCard, lockPacket } from "./ShopShell";
import { GearSlots } from "./GearSlots";

interface Props {
  profile: FishingProfile;
  market: string;
  send: (packet: CampfirePacket) => void;
  onClose: () => void;
  /** The Fish Collection (the fish's own logbook: Day, Night, Ocean). */
  onOpenCollection: () => void;
}

// The fish drawer, opened from the header's 🪣 gauge (or B): how full the livewell is and what it
// is worth this hour, then two tabs over one scrolling list. Fish: every fish a card (its kind,
// length, weight and stars, a King Size crowned, what Barnaby or Finley would pay) with its lock (a
// locked fish no sale takes). Rod & Gear: the rod in hand and what it lands, the bait on the hook and
// the tins in the tackle box, the gear worn slot by slot. Rods are switched at the shops.

type Tab = "fish" | "gear";
const TIER_NAMES = ["common", "uncommon", "rare", "legendary", "mythic"] as const;

function minutesLeft(until: number) {
  const m = Math.ceil((until - Date.now()) / 60000);
  return m > 0 ? `${m} min` : "";
}

export function FishLivewellModal({ profile, market, send, onClose, onOpenCollection }: Props) {
  const [tab, setTab] = useState<Tab>("fish");
  const hour = parseMarket(market);
  const tier = creelTier(profile.creelTier);
  const cap = livewellCap(profile);
  const held = profile.creel.length;
  const worth = profile.creel.reduce((sum, f) => sum + fishValue(f, marketMultiplier(fishGood(f.s), hour)), 0);
  const locked = profile.creel.filter((f) => f.l).length;
  const rod = RODS[profile.rod];
  const lands = TIER_NAMES.filter((t) => FISH_TIER_RANK[t] <= rod.tier).map((t) => TIER_LABEL[t].replace(" ✨", "").replace(" 🌌", ""));
  const bonus = livewellBonus(profile.worn);
  return (
    <Modal title={`${tier.icon} ${tier.name}`} icon="🪣" onClose={onClose} width={520} pinned fixedHeight={600}>
      <div className="flex shrink-0 flex-col gap-2 pb-2">
        <div className="flex items-center gap-2 text-xs">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (held / Math.max(1, cap)) * 100)}%`, background: held >= cap ? "#ec7fa3" : "#F5A623" }} />
          </div>
          <b className={`tabular-nums ${held > cap ? "text-rose-300" : ""}`} title={held > cap ? "Over capacity: every fish is kept, but none come in until you sell some" : bonus ? `+${bonus} slots from your holster` : undefined}>
            {held}/{cap}
          </b>
          <span className="opacity-75">
            worth <b className="text-amber-200">{worth} 🪙</b> this hour{locked ? ` · 🔒 ${locked}` : ""}
          </span>
        </div>
        <div className="flex gap-1.5" role="tablist">
          {(
            [
              ["fish", "🐟 Fish"],
              ["gear", "🎣 Rod & Gear"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-9 flex-1 rounded-full px-2 text-xs font-bold transition-transform active:scale-95 ${tab === id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10 hover:bg-white/15"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1">
        {tab === "fish" &&
          (held === 0 ? (
            <p className="m-0 rounded-2xl bg-white/5 px-3 py-4 text-center text-sm opacity-80">Your livewell is empty. Cast from the campfire's dock, the canoe, or the woods' river bank.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {profile.creel.map((f, i) => (
                <FishCard key={i} fish={f} price={fishValue(f, marketMultiplier(fishGood(f.s), hour))} mult={marketMultiplier(fishGood(f.s), hour)} onToggleLock={() => send(lockPacket(f, i))} />
              ))}
            </div>
          ))}

        {tab === "gear" && (
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-2xl border border-[#9ecbff]/40 bg-[#9ecbff]/10 px-2.5 py-2">
              <span className="text-3xl">{rod.emoji}</span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <b className="text-sm text-[#F7EBE1]">
                  {rod.name} <span className="font-normal opacity-70">· T{rod.tier}</span>
                </b>
                <span className="opacity-80">Lands {lands.join(", ")}</span>
                <span className="opacity-70">
                  Reel bar +{Math.round(rod.barBonus * 100)}% · the line holds {rod.tensionResist ? `${Math.round(rod.tensionResist * 100)}% longer` : "as it is"}
                </span>
              </div>
            </div>
            <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Bait</b>
            <div className="flex flex-wrap gap-1.5">
              {BAIT_IDS.filter((id) => (profile.baits[id] ?? 0) > 0).map((id) => {
                const on = profile.bait === id;
                return (
                  <button key={id} type="button" onClick={() => send({ type: "BARNABY", op: "equipBait", bait: on ? "" : id })} className={`min-h-9 rounded-full px-2.5 py-1 font-semibold ${on ? "border border-emerald-300/70 bg-emerald-400/20" : "bg-white/10 hover:bg-white/15"}`} title={BAITS[id].blurb}>
                    {BAITS[id].emoji} {BAITS[id].name} ×{profile.baits[id]}
                    {on ? " · on the hook" : ""}
                  </button>
                );
              })}
              {BAIT_IDS.every((id) => !(profile.baits[id] ?? 0)) && <span className="opacity-60">No bait: Finley and Barnaby sell five kinds</span>}
            </div>
            {(profile.fedUntil > Date.now() || profile.eagleUntil > Date.now()) && (
              <div className="flex flex-wrap gap-1.5">
                {profile.fedUntil > Date.now() && <span className="rounded-full border border-[#F5A623]/60 bg-[#F5A623]/15 px-2.5 py-1">🍲 Well-Fed · {minutesLeft(profile.fedUntil)}</span>}
                {profile.eagleUntil > Date.now() && <span className="rounded-full border border-[#8fd3b6]/60 bg-[#8fd3b6]/15 px-2.5 py-1">🦅 Eagle Eye · {minutesLeft(profile.eagleUntil)}</span>}
              </div>
            )}
            <GearSlots profile={profile} send={send} craft="fish" />
          </div>
        )}
      </div>

      <button type="button" onClick={onOpenCollection} className="mt-2 flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 text-left text-sm font-semibold transition-transform duration-150 hover:bg-white/15 active:scale-95">
        <span>📖 Fish Collection</span>
        <span className="text-xs opacity-70">day, night and ocean pages, King Size crowns ›</span>
      </button>
    </Modal>
  );
}
