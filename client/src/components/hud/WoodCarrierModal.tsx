import { useState, type ReactNode } from "react";
import { ITEMS, parseBag, type CampfirePacket } from "@shared/types";
import { AXES, BYPRODUCTS, BYPRODUCT_IDS, TREES, WOOD, WOOD_KINDS, carrierTier, trunkCm, woodAverage, woodPrice, type TreeKind, type WoodKind } from "@shared/chop";
import { BUFFS, CRAFTS, RESIN_PRICE, craftSalePrice, craftStacks, tradeInValue, type CraftItem } from "@shared/crafting";
import { CRAFT_SLOT_STACK, CRAFT_STASH_SLOTS, FIREWOOD_PRICE } from "@shared/economy";
import { carrierBonus } from "@shared/gear";
import { buffOn, carrierCap, carrierLoad, pouchCap, pouchLoad, stars, type FishingProfile } from "@shared/fishing";
import { craftGood, marketMultiplier, parseMarket, woodGood } from "@shared/market";
import { Modal } from "./Modal";
import { GearSlots, TacklesOwned } from "./GearSlots";
import { TrendBadge } from "./ShopShell";

interface Props {
  profile: FishingProfile;
  bag: string;
  market: string;
  send: (packet: CampfirePacket) => void;
  onClose: () => void;
  /** The Timber Collection (the wood's own logbook). */
  onOpenCollection: () => void;
}

// The wood drawer, opened from the header's 🪵 gauge (or B), laid out like the fish drawer: how full
// the carrier is, four tabs, one scrolling list of two-column cards. Timber: each wood's stack (its
// logs' trunk and size, stars for a big tree's, what it fetches this hour). Byproducts: the pouches
// (the felling's by-products, the Fish Scales, the resin jar, and the sawdust with them: their room
// grows with the carrier, 30 to 250). Crafts & Fuel: the craft stash (12 slots of up to 99 a kind:
// carved pieces, a Masterwork ✨ in a gold frame, and consumables with a Use button), the Firewood
// and the sawdust, the forage pantry. Axe & Gear: the
// axe in hand and what it fells, the gear worn slot by slot, the woods' permits. The bonfire is fed
// at the bonfire, not from here.

type Tab = "timber" | "byproducts" | "crafts" | "gear";
const TABS: [Tab, string, string][] = [
  ["timber", "🪵", "Timber"],
  ["byproducts", "🍯", "Byproducts"],
  ["crafts", "🪚", "Crafts & Fuel"],
  ["gear", "🪓", "Axe & Gear"],
];
/** Each wood's tree (its trunk's width); the old camp woods have none. */
const TREE_OF: Partial<Record<WoodKind, TreeKind>> = Object.fromEntries((Object.keys(TREES) as TreeKind[]).map((k) => [TREES[k].wood, k]));

function minutesLeft(until: number) {
  const m = Math.ceil((until - Date.now()) / 60000);
  return m > 0 ? `${m} min` : "";
}

/** A stack's stars by its logs' size: a big tree's ★★★ (1.2x and up), a fair one's ★★. */
const sizeStars = (scale: number) => (scale >= 1.2 ? 3 : scale >= 1 ? 2 : 1);

export function WoodCarrierModal({ profile, bag, market, send, onClose, onOpenCollection }: Props) {
  const [tab, setTab] = useState<Tab>("timber");
  const hour = parseMarket(market);
  const tier = carrierTier(profile.carrierTier);
  const cap = carrierCap(profile);
  const load = carrierLoad(profile);
  const pantry = parseBag(bag);
  const axe = AXES[profile.axe];
  const fells = (Object.keys(TREES) as TreeKind[]).filter((k) => TREES[k].tier <= axe.tier).map((k) => TREES[k].name);
  const felled = Object.values(profile.felled).reduce((a, b) => a + (b ?? 0), 0);
  const held = WOOD_KINDS.filter((w) => profile.wood[w] > 0);
  const each = (w: WoodKind) => woodPrice(w, marketMultiplier(woodGood(w), hour), woodAverage(profile, w));
  const worth = held.reduce((sum, w) => sum + each(w) * profile.wood[w], 0);
  const bonus = carrierBonus(profile.worn);
  // the craft stash's slots: each kind (Masterworks apart) a slot per CRAFT_SLOT_STACK
  const stash = craftStacks(profile.crafts).flatMap((st): { item: CraftItem; n: number }[] => Array.from({ length: Math.ceil(st.n / CRAFT_SLOT_STACK) }, (_, k) => ({ item: st.item, n: Math.min(CRAFT_SLOT_STACK, st.n - k * CRAFT_SLOT_STACK) })));
  return (
    <Modal title={`${tier.icon} ${tier.name}`} icon="🪵" onClose={onClose} width={520} pinned fixedHeight={600}>
      <div className="flex shrink-0 flex-col gap-2 pb-2">
        <div className="flex items-center gap-2 text-xs">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (load / Math.max(1, cap)) * 100)}%`, background: load >= cap ? "#ec7fa3" : "#F5A623" }} />
          </div>
          <b className={`tabular-nums ${load > cap ? "text-rose-300" : ""}`} title={load > cap ? "Over capacity: everything is kept, but no more wood comes in until you sell some" : bonus ? `+${bonus} slots from your toolbelt` : undefined}>
            {load}/{cap}
          </b>
          <span className="opacity-75">
            logs worth <b className="text-amber-200">{worth} 🪙</b> this hour
          </span>
        </div>
        <div className="flex gap-1" role="tablist">
          {TABS.map(([id, emoji, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-9 min-w-0 flex-1 whitespace-nowrap rounded-full px-1 text-[10.5px] font-bold transition-transform active:scale-95 ${tab === id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10 hover:bg-white/15"}`}>
              <span className="text-[10.5px]">
                <span className="hidden sm:inline">{emoji} </span>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1">
        {tab === "timber" &&
          (held.length === 0 ? (
            <Empty>No logs yet. Fell a tree: the campfire's Soft Pines, or the Whispering Woods.</Empty>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {held.map((w) => {
                const avg = woodAverage(profile, w);
                const scale = Math.sqrt(avg);
                const tree = TREE_OF[w];
                return (
                  <Card key={w} emoji={WOOD[w].emoji} title={WOOD[w].name} count={profile.wood[w]} gold={scale >= 1.2}>
                    <span className="text-[11px] opacity-80">
                      {tree ? `⌀ ${trunkCm(tree, scale)} cm · ` : ""}
                      {scale.toFixed(2)}x · <span className="text-amber-200">{stars(sizeStars(scale))}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] tabular-nums">
                      <TrendBadge price={each(w)} mult={marketMultiplier(woodGood(w), hour)} />
                      <span className="opacity-75">
                        all <b className="text-amber-200">{each(w) * profile.wood[w]} 🪙</b>
                      </span>
                    </span>
                  </Card>
                );
              })}
            </div>
          ))}

        {tab === "byproducts" && (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <Meter label="Pouches" load={pouchLoad(profile)} cap={pouchCap(profile)} note="by-products, resin and sawdust: they grow with the carrier" />
            {BYPRODUCT_IDS.map((k) => {
              const n = profile.byproducts[k] ?? 0;
              return (
                <Card key={k} emoji={BYPRODUCTS[k].emoji} title={BYPRODUCTS[k].name} count={n} dim={!n}>
                  <span className="truncate text-[11px] opacity-75">{BYPRODUCTS[k].blurb.split(":")[0]}</span>
                  <span className="text-[10px] tabular-nums opacity-75">
                    {BYPRODUCTS[k].price} 🪙 each{n ? <b className="text-amber-200"> · {n * BYPRODUCTS[k].price} 🪙</b> : null}
                  </span>
                </Card>
              );
            })}
            <Card emoji="🍯" title="Pine Resin" count={profile.resin} dim={!profile.resin}>
              <span className="text-[11px] opacity-75">From gold swings; glues a carving</span>
              <span className="text-[10px] tabular-nums opacity-75">{RESIN_PRICE} 🪙 each at Buster's</span>
            </Card>
            <p className="col-span-full m-0 pt-1 text-center text-[11px] opacity-70">They ride beside the carrier (no log slots): a bigger carrier, bigger pouches. Buster and Bramble buy them.</p>
          </div>
        )}

        {tab === "crafts" && (
          <div className="flex flex-col gap-1.5">
            <Meter label="Craft stash" load={stash.length} cap={CRAFT_STASH_SLOTS} note={`slots of up to ${CRAFT_SLOT_STACK} a kind`} unit="slots" />
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {Array.from({ length: Math.max(CRAFT_STASH_SLOTS, stash.length) }, (_, i) => {
                const st = stash[i];
                if (!st) return <div key={`empty:${i}`} className="flex min-h-[86px] items-center justify-center rounded-2xl border border-dashed border-white/15 text-[10px] opacity-40" aria-label="An empty stash slot">empty</div>;
                const craft = CRAFTS[st.item.c];
                const usable = craft.use === "consumable" && craft.buff;
                const mult = marketMultiplier(craftGood(st.item.c), hour);
                return (
                  <div key={`${st.item.c}:${st.item.m}:${i}`} className={`flex min-h-[86px] flex-col items-center justify-between gap-0.5 rounded-2xl px-1.5 py-1.5 text-center ${st.item.m ? "bg-[#F5A623]/15 ring-1 ring-[#F5A623]/70" : usable ? "bg-[#f5c46b]/10 ring-1 ring-[#f5c46b]/35" : "bg-white/10"}`} title={`${craft.name}${st.item.m ? " (Masterwork)" : ""}: ${craft.description}`}>
                    <span className="relative text-2xl leading-none">
                      {craft.emoji}
                      <span className="absolute -bottom-1 -right-3 rounded-full bg-[#2B201B] px-1 text-[10px] font-bold tabular-nums text-[#F7EBE1] ring-1 ring-white/15">×{st.n}</span>
                    </span>
                    <span className="line-clamp-2 w-full text-[10px] font-semibold leading-tight text-[#F7EBE1]">{craft.name}</span>
                    {usable ? (
                      <button type="button" className="clay-btn clay-btn-amber min-h-8 w-full justify-center px-1" onClick={() => send({ type: "USE_CONSUMABLE", craft: st.item.c })} title={`${BUFFS[craft.buff!].name}: ${BUFFS[craft.buff!].blurb} for ${BUFFS[craft.buff!].ms / 60_000} min`}>
                        <span className="text-[11px]">{buffOn(profile, craft.buff!) ? "Refresh" : "Use"}</span>
                      </button>
                    ) : craft.legacy ? (
                      <span className="rounded-full bg-[#F5C46B]/15 px-1.5 text-[10px] font-bold text-[#F5C46B]" title="From the old workbench: Buster or Bramble trade it in at its full price">🔧 {tradeInValue(st.item)} 🪙</span>
                    ) : craft.price > 0 ? (
                      <TrendBadge price={craftSalePrice(st.item, mult)} mult={mult} />
                    ) : null}
                  </div>
                );
              })}
            </div>
            {profile.crafts.length === 0 && <p className="m-0 text-center text-[11px] opacity-70">Carve at a workbench: trade goods to sell, consumables to use from here.</p>}
            <b className="mt-1 text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Fuel (no slots)</b>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <Card emoji="🔥" title="Firewood" count={profile.firewood} dim={!profile.firewood}>
                <span className="text-[11px] opacity-75">Split at the chopping block</span>
                <span className="text-[10px] tabular-nums opacity-75">{FIREWOOD_PRICE} 🪙 a bundle</span>
              </Card>
              <Card emoji="🪚" title="Sawdust" count={profile.sawdust} dim={!profile.sawdust}>
                <span className="text-[11px] opacity-75">From a broken carving</span>
                <span className="text-[10px] opacity-75">For the bonfire</span>
              </Card>
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

        {tab === "gear" && (
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
            <GearSlots profile={profile} send={send} craft="wood" />
            <TacklesOwned profile={profile} craft="wood" />
            <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">The Whispering Woods</b>
            <div className="flex flex-wrap gap-1.5">
              {profile.ranger ? <span className="rounded-full border border-[#F5A623]/60 bg-[#F5A623]/15 px-2.5 py-1">🎖️ Ranger's Badge</span> : <span className="rounded-full bg-white/10 px-2.5 py-1">🎫 Day Trip Permits ×{profile.dayPermits}</span>}
              {profile.eagleUntil > Date.now() && <span className="rounded-full border border-[#8fd3b6]/60 bg-[#8fd3b6]/15 px-2.5 py-1">🦅 Eagle Eye · {minutesLeft(profile.eagleUntil)}</span>}
            </div>
          </div>
        )}
      </div>

      <button type="button" onClick={onOpenCollection} className="mt-2 flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 text-left text-sm font-semibold transition-transform duration-150 hover:bg-white/15 active:scale-95">
        <span>📖 Timber Collection</span>
        <span className="text-xs opacity-70">each tree's story, widest trunk and best sale ›</span>
      </button>
    </Modal>
  );
}

/** One of the drawer's cards: an icon, a name (and a count), two lines under it. */
function Card({ emoji, title, count, gold, dim, children }: { emoji: string; title: string; count?: number; gold?: boolean; dim?: boolean; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${gold ? "bg-[#F5A623]/15 ring-1 ring-[#F5A623]/70" : "bg-white/10"} ${dim ? "opacity-50" : ""}`}>
      <span className="text-2xl">{emoji}</span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <b className="flex min-w-0 items-baseline gap-1 text-xs text-[#F7EBE1]">
          <span className="truncate">{title}</span>
          {count !== undefined && <span className="shrink-0 font-normal tabular-nums opacity-70">×{count}</span>}
        </b>
        {children}
      </div>
    </div>
  );
}

/** A capacity bar: the pouches' room, the stash's slots. */
function Meter({ label, load, cap, note, unit }: { label: string; load: number; cap: number; note: string; unit?: string }) {
  return (
    <div className="col-span-full flex items-center gap-2 text-[11px]">
      <b className="shrink-0 text-[#F7EBE1]">{label}</b>
      <div className="h-2 min-w-[60px] flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (load / Math.max(1, cap)) * 100)}%`, background: load >= cap ? "#ec7fa3" : "#8fd3b6" }} />
      </div>
      <b className={`shrink-0 tabular-nums ${load >= cap ? "text-rose-300" : ""}`} title={load > cap ? "Over their room: everything is kept, but nothing more comes in until you sell or use some" : note}>
        {load}/{cap}
        {unit ? ` ${unit}` : ""}
      </b>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-2xl bg-white/5 px-3 py-4 text-center text-sm opacity-80">{children}</p>;
}
