import { useEffect, useState, type ReactNode } from "react";
import type { CampfirePacket } from "@shared/types";
import { FISH, TIER_COLOR, TIER_LABEL, fishKg, isKingSize, stars, type CreelFish, type FishingProfile } from "@shared/fishing";
import { GEAR, SLOT_LABEL, gearOf, wearGear, type GearId } from "@shared/gear";
import { marketDirection, msUntilNextHour, type MarketGood, type MarketState } from "@shared/market";
import { Modal } from "./Modal";

// The shopkeepers' counter, one layout for all four (Buster, Bramble, Barnaby, Finley), in fixed
// bands so the one-click sales are always in reach: the keeper's word and the tabs on top, the Sell
// All bar straight under them, one scrolling list of cards in the middle (the only thing that
// scrolls), and the hour's market clock and the collection button pinned to the foot.

export type ShopTab = "trade" | "tools" | "storage" | "gear";

export function ShopShell({
  title,
  icon,
  keeper,
  say,
  tabs,
  tab,
  onTab,
  sellBar,
  footer,
  onClose,
  children,
}: {
  title: string;
  icon: string;
  /** The keeper's face beside their word. */
  keeper: string;
  say: { text: string; ok: boolean };
  /** Each tab: its id, its emoji (hidden on a phone's narrow sheet) and its name. */
  tabs: [ShopTab, string, string][];
  tab: ShopTab;
  onTab: (tab: ShopTab) => void;
  /** The Sell All buttons (under the tabs, on every tab). */
  sellBar: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal title={title} icon={icon} onClose={onClose} width={480} pinned>
      {/* tier 1: the keeper's word and the tabs */}
      <div className="flex shrink-0 flex-col gap-2 pb-2">
        <div className="flex items-start gap-2">
          <span className="text-3xl leading-none" aria-hidden>
            {keeper}
          </span>
          <div className={`clay-pop relative line-clamp-2 flex-1 rounded-2xl px-3 py-1.5 text-[13px] leading-snug ${say.ok ? "bg-white/10" : "bg-rose-400/15"}`} key={say.text} role="status">
            {say.text}
          </div>
        </div>
        <div className="flex gap-1.5" role="tablist">
          {tabs.map(([id, emoji, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)} className={`min-h-9 min-w-0 flex-1 whitespace-nowrap rounded-full px-1 text-[11px] font-bold transition-transform active:scale-95 ${tab === id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10 hover:bg-white/15"}`}>
              {/* (the size on a span: a button's own font is the page's, index.css) */}
              <span className="text-[11px]">
                <span className="hidden sm:inline">{emoji} </span>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
      {/* tier 2: sell everything, one click, no scrolling */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-white/10 pb-2">{sellBar}</div>
      {/* tier 3: the cards, the only region that scrolls */}
      <div className="min-h-0 flex-1 overflow-y-auto py-2 pr-1" style={{ maxHeight: "52vh" }}>
        {children}
      </div>
      {/* tier 4: the hour's market and the collection */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px]">{footer}</div>
    </Modal>
  );
}

/** A big Sell All button for the bar: what it takes, and what it pays. */
export function SellAllButton({ label, count, coins, onClick }: { label: string; count: number; coins: number; onClick: () => void }) {
  return (
    <button type="button" className="clay-btn clay-btn-amber flex min-h-12 w-full flex-col items-center justify-center gap-0 whitespace-nowrap px-2 py-1 leading-tight" disabled={count === 0} onClick={onClick}>
      <span className="text-[12.5px]">
        {label} ({count})
      </span>
      <span className="text-[11px] font-semibold tabular-nums opacity-90">{coins.toLocaleString("en-US")} 🪙</span>
    </button>
  );
}

/** The hour's market: when the prices turn, and how the goods you carry stand this hour. */
export function MarketClock({ market, goods }: { market: MarketState; goods: MarketGood[] }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, Math.floor(msUntilNextHour() / 1000));
  const unique = Array.from(new Set(goods));
  const up = unique.filter((g) => marketDirection(g, market) === "up").length;
  const down = unique.filter((g) => marketDirection(g, market) === "down").length;
  return (
    <span className="flex min-w-0 items-center gap-1.5 opacity-85" title="Every good's price moves on the hour (50% to 200% of its base), and each sale knocks 2% off the next of its kind">
      <span aria-hidden>🕰️</span>
      <span className="truncate">
        Market turns in <b className="tabular-nums text-[#F7EBE1]">{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</b>
        {unique.length > 0 && (
          <>
            {" "}
            · <span className="font-bold text-emerald-300">▲{up}</span> <span className="font-bold text-rose-300">▼{down}</span> of yours
          </>
        )}
      </span>
    </span>
  );
}

/** The footer's book: the Field Guide, or a collection. */
export function FooterBook({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-9 shrink-0 rounded-full bg-white/10 px-3 font-semibold hover:bg-white/15">
      {label}
    </button>
  );
}

/** The hour's trend for a good, against the hour before. */
export function Trend({ dir }: { dir: "up" | "down" | "flat" }) {
  return dir === "up" ? <span className="font-bold text-emerald-300">▲</span> : dir === "down" ? <span className="font-bold text-rose-300">▼</span> : <span className="opacity-60">▪</span>;
}

/** A fish's card: its kind, length, weight and stars, what it fetches, and its lock (a locked fish
 *  wears an amber frame and a badge, and no sale takes it). `onSell`: a shop's sell button. */
export function FishCard({ fish, price, onToggleLock, onSell, trend }: { fish: CreelFish; price: number; onToggleLock: () => void; onSell?: () => void; trend?: ReactNode }) {
  const sp = FISH[fish.s];
  const king = isKingSize(fish);
  const locked = !!fish.l;
  return (
    <div className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${locked ? "bg-[#F5A623]/10 ring-2 ring-[#F5A623]/75" : king ? "bg-[#F5A623]/10 ring-1 ring-[#F5A623]/50" : "bg-white/10"}`}>
      <span className="text-2xl">{sp.emoji}</span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <b className="flex min-w-0 items-center gap-1 text-xs text-[#F7EBE1]">
          <span className="truncate">
            {sp.name}
            {king ? " 👑" : ""}
          </span>
          {locked && <span className="shrink-0 rounded-full bg-[#F5A623] px-1.5 text-[9px] font-extrabold uppercase tracking-wide text-[#2B201B]">Locked</span>}
        </b>
        <span className="text-[11px] opacity-80">
          {fish.cm} cm · {fishKg(fish)} kg · <span className="text-amber-200">{stars(fish.q)}</span>
        </span>
        <span className="text-[10px] leading-tight">
          <b style={{ color: TIER_COLOR[sp.tier] }}>{TIER_LABEL[sp.tier]}</b>
          <span className="tabular-nums opacity-75">
            {" "}
            · {price} 🪙 {trend}
          </span>
        </span>
      </div>
      <button type="button" onClick={onToggleLock} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base transition-transform active:scale-90 ${locked ? "bg-[#F5A623]/30" : "bg-white/10 hover:bg-white/15"}`} aria-pressed={locked} aria-label={locked ? `Unlock the ${sp.name}` : `Lock the ${sp.name}`} title={locked ? "Locked: tap to unlock" : "Lock it: no sale will take it"}>
        {locked ? "🔒" : "🔓"}
      </button>
      {onSell && (
        <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 px-3 text-xs" disabled={locked} onClick={onSell} title={locked ? "Locked - Unlock to sell" : undefined}>
          {locked ? "🔒" : `${price} 🪙`}
        </button>
      )}
    </div>
  );
}

/** The lock packet for a creel slot. */
export const lockPacket = (fish: CreelFish, slot: number): CampfirePacket => ({ type: "BARNABY", op: "lockFish", slot, fish: fish.s, locked: !fish.l });

/** A shop's accessories: its craft's gear up to the tiers it stocks (the rest named where they are
 *  sold), each bought once and worn at once (or put back on, if you own it). */
export function GearShopList({ craft, maxTier, elsewhere, profile, coins, onBuy, send }: { craft: "wood" | "fish"; maxTier: number; elsewhere: string; profile: FishingProfile; coins: number; onBuy: (id: GearId) => void; send: (packet: CampfirePacket) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-center text-[11px] opacity-75">Worn in four slots: hands, waist, two fingers and a charm. A new piece goes straight on (a third ring takes the oldest one's place).</p>
      {gearOf(craft).map((id) => {
        const g = GEAR[id];
        const owned = profile.gear.includes(id);
        const worn = profile.worn.includes(id);
        const swap = wearGear(profile.worn, id).removed;
        return (
          <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${worn ? "bg-emerald-400/20" : g.tier >= 4 ? "border border-[#F5A623]/40 bg-[#F5A623]/10" : "bg-white/10"}`}>
            <span className="text-2xl">{g.emoji}</span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <b className="text-sm">
                {g.name} <span className="font-normal opacity-60">· {SLOT_LABEL[g.slot]} · T{g.tier}</span>
              </b>
              <span className="text-[11px] opacity-75">{g.blurb}</span>
            </div>
            {worn ? (
              <span className="px-2 text-xs font-bold text-emerald-200">Worn</span>
            ) : owned ? (
              <button type="button" className="clay-btn min-h-9 px-3 text-xs" onClick={() => send({ type: "GEAR", op: "equip", gear: id })} title={swap.length ? `In place of the ${swap.map((r) => GEAR[r].name).join(" and ")}` : undefined}>
                {swap.length ? "Swap" : "Wear"}
              </button>
            ) : g.tier > maxTier ? (
              <span className="max-w-[92px] px-1 text-right text-[10px] leading-tight opacity-70">{elsewhere}</span>
            ) : (
              <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < g.price} onClick={() => onBuy(id)}>
                {g.price.toLocaleString("en-US")} 🪙
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
