import { BAITS, FISH, FISH_IDS, RODS, TIER_LABEL, creelTier, fishValue, isKingSize, stars, type FishingProfile } from "@shared/fishing";
import { fishGood, marketMultiplier, parseMarket } from "@shared/market";

// The Fish Creel, from the header's 🪣 button: every slot in a five-wide grid (the catches, then the
// empty ones: every creel's capacity is a multiple of five, so the rows always come out whole),
// what Barnaby would pay for them this hour (the camp's market), the rod and bait in use, and the
// way into the Field Guide (the trophy ledger: every species' longest, its best sale, the crowns).

export function CreelPopover({ profile, live, market, onOpenFieldGuide }: { profile: FishingProfile; live: boolean; market: string; onOpenFieldGuide: () => void }) {
  const hour = parseMarket(market);
  const worth = profile.creel.reduce((sum, f) => sum + fishValue(f, marketMultiplier(fishGood(f.s), hour)), 0);
  const empty = Math.max(0, profile.slots - profile.creel.length);
  const found = FISH_IDS.filter((id) => FISH[id].water === "freshwater" && (profile.caught[id] || profile.records[id])).length;
  const kinds = FISH_IDS.filter((id) => FISH[id].water === "freshwater").length;
  const rod = RODS[profile.rod];
  return (
    <div className="flex w-[min(92vw,300px)] flex-col gap-2 p-1.5 text-sm" aria-label="Fish creel">
      <div className="flex items-center justify-between gap-2">
        <b className="text-base">
          {creelTier(profile.creelTier).icon} {creelTier(profile.creelTier).name}
        </b>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${empty === 0 ? "bg-rose-400/30 text-rose-100" : "bg-white/10"}`}>
          {profile.creel.length}/{profile.slots}
        </span>
      </div>
      <div className="grid max-h-[46vh] grid-cols-5 gap-2 overflow-y-auto pr-0.5">
        {profile.creel.map((f, i) => {
          const sp = FISH[f.s];
          return (
            <div key={i} className={`relative flex aspect-square flex-col items-center justify-center rounded-xl bg-white/10 text-center leading-none ${isKingSize(f) ? "ring-1 ring-amber-300/70" : ""}`} title={`${sp.name} · ${f.cm} cm ${stars(f.q)}${isKingSize(f) ? " · King Size 👑" : ""} · ${TIER_LABEL[sp.tier]} · worth ${fishValue(f, marketMultiplier(fishGood(f.s), hour))} 🪙 this hour`}>
              {isKingSize(f) && <span className="absolute -right-1 -top-1.5 text-[11px]">👑</span>}
              <span className="text-xl">{sp.emoji}</span>
              <span className="mt-0.5 text-[9px] opacity-80">{f.cm}cm</span>
              <span className="text-[8px] text-amber-200">{"★".repeat(f.q)}</span>
            </div>
          );
        })}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e${i}`} className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-white/15 text-sm opacity-40">
            ·
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs opacity-85">
        <span>
          Worth <b className="text-amber-200">{worth} 🪙</b> at Barnaby's, this hour
        </span>
        {!live && <span className="opacity-60">saved copy</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-white/10 px-2 py-0.5">
          {rod.emoji} {rod.name}
        </span>
        <span className="rounded-full bg-white/10 px-2 py-0.5">{profile.bait ? `${BAITS[profile.bait].emoji} ${BAITS[profile.bait].name} ×${profile.baits[profile.bait] ?? 0}` : "🪝 No bait"}</span>
      </div>
      <button type="button" onClick={onOpenFieldGuide} className="flex items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 text-left text-xs font-semibold transition-transform duration-150 hover:bg-white/15 active:scale-95">
        <span>📖 Field Guide</span>
        <span className="opacity-70">
          {found}/{kinds} species · records & crowns ›
        </span>
      </button>
    </div>
  );
}
