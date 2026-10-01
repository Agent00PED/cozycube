import { OUTFITS, OUTFIT_ARCHETYPE_LABEL, type OutfitId } from "@shared/types";

// A map's own outfit at its keeper's counter (shared/types.ts OUTFITS `keeper`: the woodsman's at
// Bramble's, the prospector's at Gus's): bought here for coins, put on as it is bought, and from then
// on one of your outfits at Chloe's boutique like any other. A cosmetic: no stats.

export function MapOutfitCard({ outfit, owned, coins, onBuy }: { outfit: OutfitId; /** The wardrobe's owned ids, comma-joined. */ owned: string; coins: number; onBuy: (outfit: OutfitId) => void }) {
  const item = OUTFITS[outfit];
  const have = owned.split(",").includes(outfit);
  return (
    <div className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 ${have ? "border-emerald-300/40 bg-emerald-400/15" : "border-[#F5A623]/40 bg-[#F5A623]/10"}`}>
      <span className="text-2xl">{item.emoji}</span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <b className="text-[13px] text-[#F7EBE1]">
          {item.name} <span className="font-normal opacity-60">· outfit{item.archetype ? ` · ${OUTFIT_ARCHETYPE_LABEL[item.archetype]}` : ""}</span>
        </b>
        <span className="text-[11px] opacity-80">{have ? "Yours: wear it or change back at Chloe's Velvet Boutique, in the lounge." : "Sold only here. It goes on as you buy it (a look, no stats); change back at Chloe's Velvet Boutique."}</span>
      </div>
      {have ? (
        <span className="px-2 text-xs font-bold text-emerald-200">Owned</span>
      ) : (
        <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 px-3 text-xs" disabled={coins < item.price} onClick={() => onBuy(outfit)}>
          {item.price.toLocaleString("en-US")} 🪙
        </button>
      )}
    </div>
  );
}
