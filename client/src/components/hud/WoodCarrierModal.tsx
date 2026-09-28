import { useState } from "react";
import { ITEMS, parseBag, type CampfirePacket } from "@shared/types";
import { AXES, AXES_BY_TIER, BYPRODUCTS, BYPRODUCT_IDS, TREES, WOOD, WOOD_KINDS, carrierTier, woodAverage, type TreeKind, type WoodKind } from "@shared/chop";
import { CRAFTS, RESIN_PRICE, SAWDUST_FUEL, craftPrice } from "@shared/crafting";
import { GEAR, GEAR_IDS } from "@shared/gear";
import { carrierLoad, type FishingProfile } from "@shared/fishing";
import { Modal } from "./Modal";

interface Props {
  profile: FishingProfile;
  bag: string;
  send: (packet: CampfirePacket) => void;
  onClose: () => void;
  /** The Timber Collection (the wood's own logbook). */
  onOpenCollection: () => void;
}

// The wood drawer, opened from the header's 🪵 gauge (or B): the carrier's every slot in a five-wide
// grid (the logs, then the carved pieces, then the empty slots), and three tabs. Timber: each wood's
// stack and its logs' size value (a big tree's logs are worth more), with a quick Feed Fire (at the
// bonfire); beside the carrier (no slots), the felling's by-products (Birch Bark, Amber Resin,
// Golden Leaf Amber, Ancient Wood Shavings: they feed the fire too), the resin jar, the sawdust pouch
// and the Firewood. Crafts: the workbench's pieces, a Masterwork ✨ in a gold frame. Axe: the axe in
// hand and what it fells (the others you own a tap away), Buster's gear, the woods' permits. And a
// way into the Timber Collection.

type Tab = "timber" | "crafts" | "axe";
type Slot = { kind: "wood"; wood: WoodKind } | { kind: "craft"; index: number } | { kind: "empty" };

function minutesLeft(until: number) {
  const m = Math.ceil((until - Date.now()) / 60000);
  return m > 0 ? `${m} min` : "";
}

export function WoodCarrierModal({ profile, bag, send, onClose, onOpenCollection }: Props) {
  const [tab, setTab] = useState<Tab>("timber");
  const tier = carrierTier(profile.carrierTier);
  const load = carrierLoad(profile);
  const slots: Slot[] = [
    ...WOOD_KINDS.flatMap((w) => Array.from({ length: profile.wood[w] }, (): Slot => ({ kind: "wood", wood: w }))),
    ...profile.crafts.map((_, index): Slot => ({ kind: "craft", index })),
    ...Array.from({ length: Math.max(0, tier.capacity - load) }, (): Slot => ({ kind: "empty" })),
  ];
  const pantry = parseBag(bag);
  const craftWorth = profile.crafts.reduce((sum, c) => sum + craftPrice(c), 0);
  const axe = AXES[profile.axe];
  const fells = (Object.keys(TREES) as TreeKind[]).filter((k) => TREES[k].tier <= axe.tier).map((k) => TREES[k].name);
  const felled = Object.values(profile.felled).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <Modal title={`${tier.icon} ${tier.name}`} icon="🪵" onClose={onClose} width={480}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="opacity-80">Logs and carved pieces, one slot each</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${load >= tier.capacity ? "bg-rose-400/30 text-rose-100" : "bg-white/10"}`} title={load > tier.capacity ? "Over capacity: everything is kept, but no more wood comes in until you sell some" : undefined}>
            {load}/{tier.capacity}
          </span>
        </div>
        {/* every slot, five to a row */}
        <div className="grid max-h-[24vh] grid-cols-5 gap-2 overflow-y-auto pr-0.5" aria-label="Carrier slots">
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
              ["timber", "🪵 Timber"],
              ["crafts", "🎨 Crafts"],
              ["axe", "🪓 Axe & Gear"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-9 flex-1 rounded-full px-2 text-xs font-bold transition-transform active:scale-95 ${tab === id ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "timber" && (
          <div className="flex max-h-[30vh] flex-col gap-1.5 overflow-y-auto pr-1">
            {WOOD_KINDS.filter((w) => profile.wood[w] > 0).map((w) => (
              <div key={w} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
                <span className="text-2xl">{WOOD[w].emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {WOOD[w].name} <span className="font-normal opacity-70">×{profile.wood[w]}</span>
                  </b>
                  <span className="text-[11px] opacity-75">
                    {woodAverage(profile, w) > 1.01 ? <span className="text-amber-200">size ×{woodAverage(profile, w).toFixed(2)} · </span> : null}+{WOOD[w].fuel}% on the fire
                  </span>
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send({ type: "ADD_FUEL", item: w })} title="At the bonfire">
                  🔥 Feed Fire
                </button>
              </div>
            ))}
            {WOOD_KINDS.every((w) => profile.wood[w] < 1) && <p className="m-0 py-2 text-center text-sm opacity-70">No logs yet. Fell a tree: the campfire's Soft Pines, or the Whispering Woods.</p>}
            <b className="mt-1 text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Beside the carrier (no slots)</b>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {BYPRODUCT_IDS.map((k) => {
                const n = profile.byproducts[k] ?? 0;
                return (
                  <div key={k} className={`flex items-center gap-1.5 rounded-2xl px-2 py-1.5 ${n ? "bg-white/10" : "bg-white/5 opacity-55"}`} title={`${BYPRODUCTS[k].blurb} · ${BYPRODUCTS[k].price} 🪙 at Bramble's or Buster's`}>
                    <span className="text-lg">{BYPRODUCTS[k].emoji}</span>
                    <span className="min-w-0 flex-1 truncate">{BYPRODUCTS[k].name}</span>
                    <b className="tabular-nums">×{n}</b>
                    {k === "shavings" && n > 0 && (
                      <button type="button" className="clay-btn min-h-7 px-2 text-[10px]" onClick={() => send({ type: "ADD_FUEL", item: "shavings" })} title="At the bonfire">
                        🔥
                      </button>
                    )}
                  </div>
                );
              })}
              <div className={`flex items-center gap-1.5 rounded-2xl px-2 py-1.5 ${profile.firewood ? "bg-white/10" : "bg-white/5 opacity-55"}`}>
                <span className="text-lg">🔥</span>
                <span className="min-w-0 flex-1 truncate">Firewood</span>
                <b className="tabular-nums">×{profile.firewood}</b>
              </div>
              <div className={`flex items-center gap-1.5 rounded-2xl px-2 py-1.5 ${profile.resin ? "bg-white/10" : "bg-white/5 opacity-55"}`} title={`Glues a carving at the workbench · ${RESIN_PRICE} 🪙 at Buster's`}>
                <span className="text-lg">🍯</span>
                <span className="min-w-0 flex-1 truncate">Pine Resin</span>
                <b className="tabular-nums">×{profile.resin}</b>
              </div>
              {profile.sawdust > 0 && (
                <div className="flex items-center gap-1.5 rounded-2xl bg-white/10 px-2 py-1.5">
                  <span className="text-lg">🪚</span>
                  <span className="min-w-0 flex-1 truncate">Sawdust</span>
                  <b className="tabular-nums">×{profile.sawdust}</b>
                  <button type="button" className="clay-btn min-h-7 px-2 text-[10px]" onClick={() => send({ type: "ADD_FUEL", item: "sawdust" })} title={`+${SAWDUST_FUEL}% at the bonfire`}>
                    🔥
                  </button>
                </div>
              )}
            </div>
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
              <p className="m-0 py-3 text-center text-sm opacity-70">No carved pieces yet. A workbench turns logs into totems, planks, birdhouses and more.</p>
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

        {tab === "axe" && (
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-2xl border border-[#F5A623]/50 bg-[#F5A623]/10 px-2.5 py-2">
              <span className="text-3xl">{axe.emoji}</span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <b className="text-sm text-[#F7EBE1]">
                  {axe.name} <span className="font-normal opacity-70">· T{axe.tier}</span>
                </b>
                <span className="opacity-80">Fells {fells.join(", ")}</span>
                <span className="opacity-70">
                  Sweet spot +{Math.round(axe.zoneBonus * 100)}% · ring {axe.slow ? `${Math.round(axe.slow * 100)}% slower` : "at full speed"} · {felled} trees felled
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {AXES_BY_TIER.filter((id) => profile.axes.includes(id) && id !== profile.axe).map((id) => (
                <button key={id} type="button" className="clay-btn min-h-9 px-3 text-xs" onClick={() => send({ type: "BUSTER", op: "equipAxe", axe: id })}>
                  {AXES[id].emoji} Use the {AXES[id].name}
                </button>
              ))}
            </div>
            <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Gear</b>
            <div className="flex flex-wrap gap-1.5">
              {GEAR_IDS.filter((id) => profile.gear.includes(id)).map((id) => (
                <span key={id} className="rounded-full bg-white/10 px-2.5 py-1" title={GEAR[id].blurb}>
                  {GEAR[id].emoji} {GEAR[id].name}
                </span>
              ))}
              {!profile.gear.length && <span className="opacity-60">None yet: Buster sells gloves, boots and an apron</span>}
            </div>
            <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">The Whispering Woods</b>
            <div className="flex flex-wrap gap-1.5">
              {profile.ranger ? <span className="rounded-full border border-[#F5A623]/60 bg-[#F5A623]/15 px-2.5 py-1">🎖️ Ranger's Badge</span> : <span className="rounded-full bg-white/10 px-2.5 py-1">🎫 Day Trip Permits ×{profile.dayPermits}</span>}
              {profile.eagleUntil > Date.now() && <span className="rounded-full border border-[#8fd3b6]/60 bg-[#8fd3b6]/15 px-2.5 py-1">🦅 Eagle Eye · {minutesLeft(profile.eagleUntil)}</span>}
            </div>
          </div>
        )}

        <button type="button" onClick={onOpenCollection} className="flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 text-left text-sm font-semibold transition-transform duration-150 hover:bg-white/15 active:scale-95">
          <span>📖 Timber Collection</span>
          <span className="text-xs opacity-70">each tree's story, widest trunk and best sale ›</span>
        </button>
      </div>
    </Modal>
  );
}
