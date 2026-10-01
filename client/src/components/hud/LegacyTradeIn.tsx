import type { CampfirePacket } from "@shared/types";
import { CRAFTS, craftStacks, needsList, tradeInValue, type CraftId } from "@shared/crafting";
import { GEAR, type GearId } from "@shared/gear";
import type { FishingProfile } from "@shared/fishing";
import { BYPRODUCTS, WOOD, type ByproductId, type WoodKind } from "@shared/chop";
import { PRICE_COLUMN } from "./ShopShell";

// The old workbench's trade-in, at Buster's stall and at Bramble's counter (the workbench's overhaul
// retired its old recipes: shared/crafting.ts `legacy`). A piece from the old bench still in the craft
// stash is traded in for its whole listed price (a Masterwork's for one), never the market's; a relic
// from it (the Otter-Carved Hook Charm, the Amber Bark Bangle) for every material it took, in full.
// The server settles both (BUSTER tradeIn / tradeInRelic); nothing shows here when there is nothing.

/** A material's emoji, from a needsList key. */
function needEmoji(key: string): string {
  const [kind, what] = key.split(":");
  return kind === "wood" ? WOOD[what as WoodKind].emoji : kind === "by" ? BYPRODUCTS[what as ByproductId].emoji : kind === "firewood" ? "🔥" : kind === "sawdust" ? "🪚" : "🍯";
}

/** Whether there is anything from the old workbench to trade in. */
export const hasLegacy = (profile: FishingProfile) => profile.crafts.some((c) => tradeInValue(c) > 0);

export function LegacyTradeIn({ profile, send }: { profile: FishingProfile; send: (packet: CampfirePacket) => void }) {
  const pieces = profile.crafts.filter((c) => tradeInValue(c) > 0);
  if (!pieces.length) return null;
  const stacks = craftStacks(pieces).map((st) => ({ ...st, at: profile.crafts.findIndex((c) => c.c === st.item.c && c.m === st.item.m) }));
  const worth = pieces.reduce((sum, c) => sum + tradeInValue(c), 0);
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-[#F5C46B]/50 bg-[#F5C46B]/5 p-2">
      <b className="text-[11px] uppercase tracking-widest text-[#F5C46B]">🔧 Old workbench trade-in · full refund</b>
      {stacks.map(({ item, n, at }) => (
        <div key={`${item.c}:${item.m}`} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${item.m ? "border-2 border-amber-300 bg-amber-300/10" : "bg-white/10"}`}>
          <span className="text-xl">{CRAFTS[item.c].emoji}</span>
          <b className="flex-1 text-xs">
            {CRAFTS[item.c].name} <span className="font-normal opacity-70">×{n}</span>
            {item.m && <span className="ml-1 text-amber-200">Masterwork ✨</span>}
          </b>
          <button type="button" className="clay-btn min-h-8 shrink-0 justify-center px-0 text-xs" style={PRICE_COLUMN} onClick={() => send({ type: "BUSTER", op: "tradeIn", slot: at })} title="Trade one in">
            <span className="whitespace-nowrap text-[12px]">{tradeInValue(item)} 🪙</span>
          </button>
        </div>
      ))}
      {pieces.length > 1 && (
        <button type="button" className="clay-btn clay-btn-amber min-h-10 w-full text-xs" onClick={() => send({ type: "BUSTER", op: "tradeIn", slot: "all" })}>
          Trade in every old piece · {worth} 🪙
        </button>
      )}
    </div>
  );
}
