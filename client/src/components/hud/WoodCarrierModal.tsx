import { useState } from "react";
import { ITEMS, parseBag, type CampfirePacket } from "@shared/types";
import { WOOD, WOOD_KINDS, carrierTier, type WoodKind } from "@shared/chop";
import { CRAFTS, craftPrice } from "@shared/crafting";
import { carrierLoad, type FishingProfile } from "@shared/fishing";
import { Modal } from "./Modal";

interface Props {
  profile: FishingProfile;
  bag: string;
  send: (packet: CampfirePacket) => void;
  onClose: () => void;
}

// The wood carrier, opened from the header's 🪵 pill: every slot in a five-wide grid (the logs,
// then the carved pieces, then the empty slots), and two tabs. Raw Timber: the stacks of each wood,
// each with a quick Feed Fire (at the bonfire). Artisan Crafts: the pieces from Buster's workbench,
// a Masterwork ✨ in a gold frame. The pantry (foraged mushrooms and berries) sits at the foot.

type Tab = "raw" | "crafts";
type Slot = { kind: "wood"; wood: WoodKind } | { kind: "craft"; index: number } | { kind: "empty" };

export function WoodCarrierModal({ profile, bag, send, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("raw");
  const tier = carrierTier(profile.carrierTier);
  const load = carrierLoad(profile);
  const slots: Slot[] = [
    ...WOOD_KINDS.flatMap((w) => Array.from({ length: profile.wood[w] }, (): Slot => ({ kind: "wood", wood: w }))),
    ...profile.crafts.map((_, index): Slot => ({ kind: "craft", index })),
    ...Array.from({ length: Math.max(0, tier.capacity - load) }, (): Slot => ({ kind: "empty" })),
  ];
  const pantry = parseBag(bag);
  const craftWorth = profile.crafts.reduce((sum, c) => sum + craftPrice(c), 0);
  return (
    <Modal title={`${tier.icon} ${tier.name}`} icon="🪵" onClose={onClose} width={460}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-center justify-between text-sm">
          <span className="opacity-80">Logs and carved pieces, one slot each</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${load >= tier.capacity ? "bg-rose-400/30 text-rose-100" : "bg-white/10"}`}>
            {load}/{tier.capacity}
          </span>
        </div>
        {/* every slot, five to a row */}
        <div className="grid max-h-[32vh] grid-cols-5 gap-2 overflow-y-auto pr-0.5" aria-label="Carrier slots">
          {slots.map((s, i) => {
            if (s.kind === "empty") return <div key={i} className="aspect-square rounded-xl border border-dashed border-white/25 bg-white/[0.03]" aria-hidden />;
            if (s.kind === "wood") {
              return (
                <div key={i} className="flex aspect-square items-center justify-center rounded-xl bg-white/10 text-xl" title={WOOD[s.wood].name}>
                  {WOOD[s.wood].emoji}
                </div>
              );
            }
            const item = profile.crafts[s.index];
            const craft = CRAFTS[item.c];
            return (
              <div key={i} className={`flex aspect-square items-center justify-center rounded-xl text-xl ${item.m ? "border-2 border-amber-300 bg-amber-300/15 shadow-[0_0_10px_rgba(252,211,77,0.45)]" : "bg-white/10"}`} title={`${item.m ? "Masterwork ✨ " : ""}${craft.name} · ${craftPrice(item)} 🪙`}>
                {craft.emoji}
              </div>
            );
          })}
        </div>

        <div className="flex gap-1.5" role="tablist">
          {(
            [
              ["raw", "🪵 Raw Timber"],
              ["crafts", "🎨 Artisan Crafts"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-9 flex-1 rounded-full px-2 text-xs font-bold transition-transform active:scale-95 ${tab === id ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "raw" && (
          <div className="flex flex-col gap-1.5">
            {WOOD_KINDS.map((w) => (
              <div key={w} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
                <span className="text-2xl">{WOOD[w].emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {WOOD[w].name} <span className="font-normal opacity-70">×{profile.wood[w]}</span>
                  </b>
                  <span className="text-[11px] opacity-75">
                    +{WOOD[w].fuel}% on the fire · {WOOD[w].sell} 🪙 at Buster's
                  </span>
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={profile.wood[w] < 1} onClick={() => send({ type: "ADD_FUEL", item: w })} title="At the bonfire">
                  🔥 Feed Fire
                </button>
              </div>
            ))}
            {(pantry.mushroom || pantry.berry) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <b className="opacity-80">🧺 Pantry</b>
                {pantry.mushroom ? <span className="rounded-full bg-white/10 px-2 py-0.5">{ITEMS.mushroom.emoji} ×{pantry.mushroom}</span> : null}
                {pantry.berry ? <span className="rounded-full bg-white/10 px-2 py-0.5">{ITEMS.berry.emoji} ×{pantry.berry}</span> : null}
              </div>
            )}
          </div>
        )}

        {tab === "crafts" && (
          <div className="flex flex-col gap-1.5">
            {profile.crafts.length === 0 ? (
              <p className="m-0 py-3 text-center text-sm opacity-70">No carved pieces yet. Buster's workbench turns logs into totems, planks, birdhouses and more.</p>
            ) : (
              <div className="flex max-h-[26vh] flex-col gap-1.5 overflow-y-auto pr-1">
                {profile.crafts.map((item, i) => {
                  const craft = CRAFTS[item.c];
                  return (
                    <div key={i} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${item.m ? "border-2 border-amber-300 bg-amber-300/10" : "bg-white/10"}`}>
                      <span className="text-2xl">{craft.emoji}</span>
                      <b className="flex-1 text-sm">
                        {craft.name}
                        {item.m && <span className="ml-1 text-amber-200">Masterwork ✨</span>}
                      </b>
                      <span className="text-xs font-bold tabular-nums text-amber-200">{craftPrice(item)} 🪙</span>
                    </div>
                  );
                })}
              </div>
            )}
            {profile.crafts.length > 0 && <p className="m-0 text-center text-xs opacity-75">Worth {craftWorth} 🪙 at Buster's stall</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
