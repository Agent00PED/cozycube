import { BAITS, FISH, FISH_IDS, RODS, TIER_LABEL, creelTier, fishValue, stars, type FishingProfile } from "@shared/fishing";

// The Fish Creel, from the header's 🪣 button: every slot in a five-wide grid (the catches, then the
// empty ones: every creel's capacity is a multiple of five, so the rows always come out whole),
// what Barnaby would pay for them, the rod and bait in use, and the angler's records (the longest of
// each kind they have landed).

export function CreelPopover({ profile, live }: { profile: FishingProfile; live: boolean }) {
  const worth = profile.creel.reduce((sum, f) => sum + fishValue(f), 0);
  const empty = Math.max(0, profile.slots - profile.creel.length);
  const records = FISH_IDS.filter((id) => FISH[id].water === "freshwater" && profile.records[id]);
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
            <div key={i} className="flex aspect-square flex-col items-center justify-center rounded-xl bg-white/10 text-center leading-none" title={`${sp.name} · ${f.cm} cm ${stars(f.q)} · ${TIER_LABEL[sp.tier]} · worth ${fishValue(f)} 🪙`}>
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
          Worth <b className="text-amber-200">{worth} 🪙</b> at Barnaby's stall
        </span>
        {!live && <span className="opacity-60">saved copy</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-white/10 px-2 py-0.5">
          {rod.emoji} {rod.name}
        </span>
        <span className="rounded-full bg-white/10 px-2 py-0.5">{profile.bait ? `${BAITS[profile.bait].emoji} ${BAITS[profile.bait].name} ×${profile.baits[profile.bait] ?? 0}` : "🪝 No bait"}</span>
      </div>
      {records.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-white/10 pt-1.5 text-xs">
          <b className="opacity-80">📏 Records</b>
          {records.map((id) => (
            <div key={id} className="flex justify-between">
              <span>
                {FISH[id].emoji} {FISH[id].name}
              </span>
              <span className="tabular-nums opacity-85">{profile.records[id]} cm</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
