import { BAITS, BAIT_IDS, FISH, FISH_TIER_RANK, RODS, RODS_BY_TIER, TIER_COLOR, TIER_LABEL, creelTier, fishKg, fishValue, isKingSize, stars, type FishingProfile } from "@shared/fishing";
import type { CampfirePacket } from "@shared/types";
import { fishGood, marketMultiplier, parseMarket } from "@shared/market";
import { Modal } from "./Modal";

interface Props {
  profile: FishingProfile;
  market: string;
  send: (packet: CampfirePacket) => void;
  onClose: () => void;
  /** The Fish Collection (the fish's own logbook: Day, Night, Ocean). */
  onOpenCollection: () => void;
}

// The fish drawer, opened from the header's 🪣 gauge (or B): the livewell's every fish (its kind,
// length, weight and stars, a King Size crowned, what Barnaby or Finley would pay this hour), how
// full it is, the rod in hand and what it lands (the others you own a tap away), the bait on the hook
// and the tins in the tackle box, and a way into the Fish Collection.

const TIER_NAMES = ["common", "uncommon", "rare", "legendary", "mythic"] as const;

function minutesLeft(until: number) {
  const m = Math.ceil((until - Date.now()) / 60000);
  return m > 0 ? `${m} min` : "";
}

export function FishLivewellModal({ profile, market, send, onClose, onOpenCollection }: Props) {
  const hour = parseMarket(market);
  const tier = creelTier(profile.creelTier);
  const held = profile.creel.length;
  const worth = profile.creel.reduce((sum, f) => sum + fishValue(f, marketMultiplier(fishGood(f.s), hour)), 0);
  const rod = RODS[profile.rod];
  const lands = TIER_NAMES.filter((t) => FISH_TIER_RANK[t] <= rod.tier).map((t) => TIER_LABEL[t].replace(" ✨", ""));
  return (
    <Modal title={`${tier.icon} ${tier.name}`} icon="🪣" onClose={onClose} width={480}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-center gap-2 text-xs">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (held / Math.max(1, profile.slots)) * 100)}%`, background: held >= profile.slots ? "#ec7fa3" : "#F5A623" }} />
          </div>
          <b className={`tabular-nums ${held > profile.slots ? "text-rose-300" : ""}`} title={held > profile.slots ? "Over capacity: every fish is kept, but none come in until you sell some" : undefined}>
            {held}/{profile.slots}
          </b>
          <span className="opacity-75">
            worth <b className="text-amber-200">{worth} 🪙</b> this hour
          </span>
        </div>

        {held === 0 ? (
          <p className="m-0 rounded-2xl bg-white/5 px-3 py-4 text-center text-sm opacity-80">Your livewell is empty. Cast from the campfire's dock, the canoe, or the woods' river bank.</p>
        ) : (
          <div className="grid max-h-[34vh] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {profile.creel.map((f, i) => {
              const sp = FISH[f.s];
              const king = isKingSize(f);
              return (
                <div key={i} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${king ? "bg-[#F5A623]/15 ring-1 ring-[#F5A623]/70" : "bg-white/10"}`}>
                  <span className="text-2xl">{sp.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="truncate text-xs text-[#F7EBE1]">
                      {sp.name}
                      {king ? " 👑" : ""}
                    </b>
                    <span className="text-[11px] opacity-80">
                      {f.cm} cm · {fishKg(f)} kg · <span className="text-amber-200">{stars(f.q)}</span>
                    </span>
                  </div>
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-[10px] font-bold" style={{ color: TIER_COLOR[sp.tier] }}>
                      {TIER_LABEL[sp.tier]}
                    </span>
                    <span className="text-[10px] tabular-nums opacity-75">{fishValue(f, marketMultiplier(fishGood(f.s), hour))} 🪙</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex items-center gap-2 rounded-2xl border border-[#9ecbff]/40 bg-[#9ecbff]/10 px-2.5 py-2">
            <span className="text-2xl">{rod.emoji}</span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <b className="text-sm text-[#F7EBE1]">
                {rod.name} <span className="font-normal opacity-70">· T{rod.tier}</span>
              </b>
              <span className="opacity-75">Lands {lands.join(", ")}</span>
            </div>
          </div>
          {RODS_BY_TIER.some((id) => profile.rods.includes(id) && id !== profile.rod) && (
            <div className="flex flex-wrap gap-1.5">
              {RODS_BY_TIER.filter((id) => profile.rods.includes(id) && id !== profile.rod).map((id) => (
                <button key={id} type="button" className="clay-btn min-h-9 px-3 text-xs" onClick={() => send({ type: "BARNABY", op: "equipRod", rod: id })}>
                  {RODS[id].emoji} Use the {RODS[id].name}
                </button>
              ))}
            </div>
          )}
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
        </div>

        <button type="button" onClick={onOpenCollection} className="flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 text-left text-sm font-semibold transition-transform duration-150 hover:bg-white/15 active:scale-95">
          <span>📖 Fish Collection</span>
          <span className="text-xs opacity-70">day, night and ocean pages, King Size crowns ›</span>
        </button>
      </div>
    </Modal>
  );
}
