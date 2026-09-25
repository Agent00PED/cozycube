import { ITEMS, parseBag } from "@shared/types";
import { AXES, WOOD, WOOD_KINDS } from "@shared/chop";
import { woodCount, type FishingProfile } from "@shared/fishing";

// The 🪵 pill's popover: the split wood you carry (it burns on the bonfire, and Buster buys it by
// the woodpile), the axe in hand, and the pantry for the Dutch oven (foraged mushrooms, berries).

export function WoodPopover({ profile, bag }: { profile: FishingProfile; bag: string }) {
  const pantry = parseBag(bag);
  const worth = WOOD_KINDS.reduce((sum, k) => sum + profile.wood[k] * WOOD[k].sell, 0);
  const axe = AXES[profile.axe];
  return (
    <div className="flex w-[min(92vw,260px)] flex-col gap-2 p-1.5 text-sm" aria-label="Wood and pantry">
      <div className="flex items-center justify-between gap-2">
        <b className="text-base">🪵 Firewood</b>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold">{woodCount(profile)}</span>
      </div>
      <div className="flex flex-col gap-1">
        {WOOD_KINDS.map((k) => (
          <div key={k} className="flex items-center justify-between rounded-xl bg-white/5 px-2.5 py-1.5">
            <span>
              {WOOD[k].emoji} {WOOD[k].name}
            </span>
            <span className="tabular-nums font-bold">×{profile.wood[k]}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs opacity-85">
        <span>
          Buster pays <b className="text-amber-200">{worth} 🪙</b>
        </span>
        <span className="rounded-full bg-white/10 px-2 py-0.5">
          {axe.emoji} {axe.name}
        </span>
      </div>
      {(pantry.mushroom || pantry.berry) && (
        <div className="flex flex-wrap gap-1.5 border-t border-white/10 pt-1.5 text-xs">
          <b className="w-full opacity-80">🧺 Pantry</b>
          {pantry.mushroom ? <span className="rounded-full bg-white/10 px-2 py-0.5">{ITEMS.mushroom.emoji} ×{pantry.mushroom}</span> : null}
          {pantry.berry ? <span className="rounded-full bg-white/10 px-2 py-0.5">{ITEMS.berry.emoji} ×{pantry.berry}</span> : null}
        </div>
      )}
    </div>
  );
}
