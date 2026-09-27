import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  HAIR_COLORS,
  HAIR_COLOR_NAMES,
  HAIR_DEFINITIONS,
  HAIR_STYLES,
  HATS,
  OUTFITS,
  OUTFIT_COLORS,
  OUTFIT_COLOR_NAMES,
  OUTFIT_FABRICS,
  OUTFIT_IDS,
  PANTS_COLORS,
  PANTS_COLOR_NAMES,
  PREMIUM_HATS,
  PREMIUM_HAT_IDS,
  SHIRT_COLORS,
  SHIRT_COLOR_NAMES,
  SKIN_TONES,
  SKIN_TONE_NAMES,
  STARTER_OUTFITS,
  encodeLook,
  hairUnlockId,
  isPremiumHat,
  type FreeAccessory,
  type HairStyle,
  type Look,
  type OutfitId,
  type PremiumHat,
  type WardrobeItem,
} from "@shared/types";
import { WARDROBE_BANDS, WARDROBE_TIER_LABEL, type WardrobeTier } from "@shared/economy";
import { PIONEER_SET, SPECIAL_TITLES, type PioneerInfo } from "@shared/items";
import { capsuleUnlock } from "@shared/casino";
import { saveLook } from "./lookStorage";
import { Avatar } from "../../entities/Avatar";
import { GEO, matte, noRaycast } from "../../scene/kit";

// The wardrobe, and Chloe's Velvet Boutique (she opens it from her cheval mirror in the lounge): a
// studio turntable of your own avatar you drag round a full 360 degrees (a key, a fill and a rim
// light over a velvet podium), beside the collection in its three price bands (Common, Rare,
// Prestige: shared/economy.ts). Anything you pick is tried on the turntable at once; what you own
// goes straight on (the room sees it, it is saved, and remembered locally too); what you don't is a
// try-on, its cost totalled live under the list with [ Purchase & Equip ] (or a Revert back to what
// you wear). The gachapon's pieces only come from the arcade, and the Velvet Pioneer set is claimed
// free (0 coins) by the beta's players for two weeks after the wipe, its gold title with it.

interface WardrobeProps {
  userId: string;
  username: string;
  initial: Look;
  coins: number;
  /** Everything unlocked so far (comma-separated ids: premium hats, bought outfits, hair_<style>, titles). */
  owned: string;
  /** The title worn over the name ("" none). */
  title: string;
  /** What the server said about the Velvet Pioneer set (null: not yet heard). */
  pioneer: PioneerInfo | null;
  /** Opened by Chloe at her boutique: she greets you at the top. */
  greeting?: string;
  onApply: (encoded: string) => void;
  onBuy: (hat: PremiumHat) => void;
  onBuyOutfit: (outfit: OutfitId) => void;
  onBuyHair: (style: HairStyle) => void;
  onClaimPioneer: () => void;
  onWearTitle: (id: string) => void;
  onClose: () => void;
}

const FREE_HAT_LABELS: Record<FreeAccessory, { label: string; emoji: string }> = {
  none: { label: "Bare head", emoji: "🙂" },
  beret: { label: "Beret", emoji: "🎨" },
  beanie: { label: "Beanie", emoji: "🧶" },
  flower: { label: "Flower", emoji: "🌸" },
  headphones: { label: "Headphones", emoji: "🎧" },
};

type Tab = "outfits" | "hats" | "hair" | "appearance";
const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "outfits", label: "Outfits", emoji: "👕" },
  { id: "hats", label: "Hats", emoji: "👒" },
  { id: "hair", label: "Hair", emoji: "💇" },
  { id: "appearance", label: "Appearance", emoji: "🎨" },
];

/** A palette the look can be painted from: which field it sets, and its swatches. */
interface Palette {
  label: string;
  field: "skin" | "hair" | "shirt" | "pants" | "outfitColor";
  colors: string[];
  names: string[];
}
const PALETTES: Record<Palette["field"], Palette> = {
  skin: { label: "Skin tone", field: "skin", colors: SKIN_TONES, names: SKIN_TONE_NAMES },
  hair: { label: "Hair colour", field: "hair", colors: HAIR_COLORS, names: HAIR_COLOR_NAMES },
  shirt: { label: "Top", field: "shirt", colors: SHIRT_COLORS, names: SHIRT_COLOR_NAMES },
  pants: { label: "Bottoms", field: "pants", colors: PANTS_COLORS, names: PANTS_COLOR_NAMES },
  outfitColor: { label: "Accent", field: "outfitColor", colors: OUTFIT_COLORS, names: OUTFIT_COLOR_NAMES },
};
/** The quick-bar under the preview follows the tab: the colour that tab is about. */
const QUICK_PALETTE: Record<Tab, Palette> = { outfits: PALETTES.shirt, hats: PALETTES.outfitColor, hair: PALETTES.hair, appearance: PALETTES.skin };

const TIER_ORDER: Record<string, number> = { starter: 0, common: 1, rare: 2, prestige: 3, gacha: 4, pioneer: 5 };
const tierKey = (item: WardrobeItem) => (item.pioneer ? "pioneer" : item.gachaOnly ? "gacha" : item.tier ?? "starter");
const byTier = <T extends string>(ids: readonly T[], item: (id: T) => WardrobeItem) => [...ids].sort((a, b) => TIER_ORDER[tierKey(item(a))] - TIER_ORDER[tierKey(item(b))] || item(a).price - item(b).price);

/** One piece of a try-on that isn't yours yet: what it is, what it costs, and whether it is for sale. */
interface Missing {
  key: string;
  name: string;
  emoji: string;
  price: number;
  /** "buy" (for coins), "gacha" (the arcade's only), "pioneer" (claimed, not bought). */
  how: "buy" | "gacha" | "pioneer";
  buy: () => void;
}

export function WardrobeModal({ userId, username, initial, coins, owned, title, pioneer, greeting, onApply, onBuy, onBuyOutfit, onBuyHair, onClaimPioneer, onWearTitle, onClose }: WardrobeProps) {
  const [look, setLook] = useState<Look>(initial);
  const [tab, setTab] = useState<Tab>("outfits");
  const [pending, setPending] = useState(false);
  const ownedIds = useMemo(() => new Set(owned ? owned.split(",") : []), [owned]);
  const applied = useRef(encodeLook(initial));
  const spin = useRef({ y: 0, v: 0, dragging: false, lastX: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ownsOutfit = (id: OutfitId) => STARTER_OUTFITS.includes(id) || ownedIds.has(id);
  const ownsHat = (hat: string) => !isPremiumHat(hat) || ownedIds.has(hat);
  const ownsHair = (style: HairStyle) => HAIR_DEFINITIONS[style].price === 0 || ownedIds.has(hairUnlockId(style));

  // what the try-on has on that you don't own yet
  const missing = useMemo<Missing[]>(() => {
    const out: Missing[] = [];
    const how = (item: WardrobeItem): Missing["how"] => (item.pioneer ? "pioneer" : item.gachaOnly ? "gacha" : "buy");
    if (!ownsOutfit(look.outfit)) {
      const it = OUTFITS[look.outfit];
      out.push({ key: look.outfit, name: it.name, emoji: it.emoji, price: it.price, how: how(it), buy: () => onBuyOutfit(look.outfit) });
    }
    if (isPremiumHat(look.hat) && !ownsHat(look.hat)) {
      const hat = look.hat;
      const it = PREMIUM_HATS[hat];
      out.push({ key: hat, name: it.name, emoji: it.emoji, price: it.price, how: how(it), buy: () => onBuy(hat) });
    }
    if (!ownsHair(look.hairStyle)) {
      const style = look.hairStyle;
      const it = HAIR_DEFINITIONS[style];
      out.push({ key: hairUnlockId(style), name: it.name, emoji: it.emoji, price: it.price, how: "buy", buy: () => onBuyHair(style) });
    }
    return out;
  }, [look, ownedIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const cost = missing.filter((m) => m.how === "buy").reduce((sum, m) => sum + m.price, 0);
  const locked = missing.find((m) => m.how !== "buy");

  // everything on the turntable is yours: it goes on for real (the room, the database, this browser)
  useEffect(() => {
    if (missing.length) return;
    setPending(false);
    const encoded = encodeLook(look);
    if (encoded === applied.current) return;
    applied.current = encoded;
    saveLook(encoded);
    onApply(encoded);
  }, [look, missing.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const tryOn = (patch: Partial<Look>) => setLook((l) => ({ ...l, ...patch }));
  // a new outfit comes in its own fabrics; recolour it from there
  const wearOutfit = (outfit: OutfitId) => tryOn({ outfit, ...OUTFIT_FABRICS[outfit] });
  const revert = () => {
    const parts = applied.current.split(",");
    setLook((l) => ({ ...l, hairStyle: parts[1] as HairStyle, outfit: parts[3] as OutfitId, hat: parts[5] as Look["hat"], shirt: parts[6], pants: parts[7] }));
  };
  const purchase = () => {
    if (pending || locked || cost > coins) return;
    setPending(true);
    for (const m of missing) m.buy();
    // the purchase lands through the room; if it never does, the button comes back
    window.setTimeout(() => setPending(false), 3000);
  };
  const quick = QUICK_PALETTE[tab];

  const pioneerTitle = SPECIAL_TITLES[PIONEER_SET.title];
  // the Pioneer set's pieces are listed only for those who have them or may claim them
  const listed = (item: WardrobeItem, have: boolean) => !item.pioneer || have || !!pioneer?.eligible;
  const ownsPioneerTitle = ownedIds.has(capsuleUnlock({ kind: "title", id: PIONEER_SET.title }));

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-0 backdrop-blur-[3px] sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="clay-sheet sm:clay-pop font-cozy flex max-h-[90vh] w-full max-w-[860px] flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-stone-900/90 text-stone-100 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md sm:rounded-3xl md:flex-row" role="dialog" aria-label="Wardrobe">
        {/* ---- the studio turntable, and the quick colour bar under it ---- */}
        <div className="flex shrink-0 flex-col bg-[radial-gradient(circle_at_50%_35%,#4a2a3c_0%,#221820_62%,#140f16_100%)] md:min-h-[460px] md:w-[280px] lg:w-[300px]">
          <div
            className="relative h-[200px] cursor-grab touch-none select-none active:cursor-grabbing sm:h-[250px] md:h-auto md:min-h-0 md:flex-1"
            onPointerDown={(e) => {
              spin.current.dragging = true;
              spin.current.lastX = e.clientX;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!spin.current.dragging) return;
              const dx = e.clientX - spin.current.lastX;
              spin.current.lastX = e.clientX;
              spin.current.v = dx * 0.012;
              spin.current.y += dx * 0.012;
            }}
            onPointerUp={() => (spin.current.dragging = false)}
            onPointerCancel={() => (spin.current.dragging = false)}
            aria-label="Your avatar on the turntable: drag to turn it round"
          >
            <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.35, 4.3], fov: 30 }} gl={{ antialias: true, alpha: true }} onCreated={({ camera }) => camera.lookAt(0, -0.05, 0)}>
              <StudioLights />
              <Suspense fallback={null}>
                <Turntable spin={spin}>
                  <PreviewAvatar userId={userId} look={encodeLook(look)} color={look.outfitColor} />
                </Turntable>
              </Suspense>
              <Podium />
            </Canvas>
            <span className="pointer-events-none absolute bottom-1 left-0 right-0 text-center text-[11px] opacity-50">drag to turn · 360°</span>
            {missing.length > 0 && <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-amber-300/90 px-2.5 py-1 text-[11px] font-extrabold text-amber-950 shadow">TRYING ON</span>}
          </div>
          <QuickBar palette={quick} value={look[quick.field]} onPick={(c) => tryOn({ [quick.field]: c })} />
        </div>

        {/* ---- the collection ---- */}
        <div className="scrollbar-none flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-lg font-bold tracking-wide">{greeting ? "🎀 The Velvet Boutique" : "👗 Wardrobe"}</h2>
            <span className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-amber-300/20 px-3.5 text-sm font-bold tabular-nums leading-none text-amber-100 outline outline-1 -outline-offset-1 outline-amber-200/25" title="Your coins">
              <span className="text-base leading-none">🪙</span>
              {coins}
            </span>
            <button type="button" onClick={onClose} className="clay-close" aria-label="Close wardrobe">
              ✕
            </button>
          </div>

          {greeting && (
            <div className="flex items-start gap-3 rounded-2xl bg-[#3a1020]/70 p-3 text-sm outline outline-1 -outline-offset-1 outline-rose-200/20">
              <span className="text-3xl leading-none" aria-hidden>
                🐈‍⬛
              </span>
              <div>
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-rose-200/80">Chloe</div>
                {greeting}
              </div>
            </div>
          )}

          {pioneer?.eligible || pioneer?.claimed ? <PioneerCard info={pioneer} ownsTitle={ownsPioneerTitle} wearing={title === PIONEER_SET.title} titleName={pioneerTitle?.name ?? ""} onClaim={onClaimPioneer} onWearTitle={onWearTitle} onTryOn={() => wearOutfit(PIONEER_SET.outfit)} /> : null}

          {/* one segmented track; each tab sizes to its label */}
          <div className="flex gap-1 rounded-full bg-black/30 p-1 outline outline-1 -outline-offset-1 outline-white/10" role="tablist" aria-label="Wardrobe categories">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex h-10 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold leading-none transition-transform duration-150 active:scale-95 sm:px-3 sm:text-sm ${tab === t.id ? "bg-[#fff4e0] text-stone-900 shadow-[0_2px_8px_rgba(0,0,0,0.35),inset_0_-2px_0_rgba(120,70,0,0.14)]" : "text-stone-200 hover:bg-white/10"}`}>
                <span className="text-base leading-none max-[419px]:hidden" aria-hidden>
                  {t.emoji}
                </span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2" role="tabpanel">
            {tab === "outfits" &&
              byTier(OUTFIT_IDS, (id) => OUTFITS[id])
                .filter((id) => listed(OUTFITS[id], ownsOutfit(id)))
                .map((id) => {
                const item = OUTFITS[id];
                return <ItemRow key={id} item={item} owned={ownsOutfit(id)} wearing={look.outfit === id} canAfford={coins >= item.price} onPick={() => wearOutfit(id)} />;
              })}
            {tab === "hats" && (
              <>
                {HATS.map((hat) => (
                  <ItemRow key={hat} item={{ name: FREE_HAT_LABELS[hat].label, emoji: FREE_HAT_LABELS[hat].emoji, price: 0 }} owned wearing={look.hat === hat} onPick={() => tryOn({ hat })} />
                ))}
                {byTier(PREMIUM_HAT_IDS, (h) => PREMIUM_HATS[h])
                  .filter((hat) => listed(PREMIUM_HATS[hat], ownedIds.has(hat)))
                  .map((hat) => {
                  const item = PREMIUM_HATS[hat];
                  return <ItemRow key={hat} item={item} owned={ownedIds.has(hat)} wearing={look.hat === hat} canAfford={coins >= item.price} onPick={() => tryOn({ hat })} />;
                })}
              </>
            )}
            {tab === "hair" &&
              byTier(HAIR_STYLES, (s) => HAIR_DEFINITIONS[s]).map((style) => {
                const item = HAIR_DEFINITIONS[style];
                return <ItemRow key={style} item={item} owned={ownsHair(style)} wearing={look.hairStyle === style} canAfford={coins >= item.price} onPick={() => tryOn({ hairStyle: style })} />;
              })}
            {tab === "appearance" && (
              <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-3">
                {Object.values(PALETTES).map((p) => (
                  <Swatches key={p.field} label={p.label} colors={p.colors} names={p.names} value={look[p.field]} onPick={(c) => tryOn({ [p.field]: c })} big={p.field === "skin" || p.field === "hair"} />
                ))}
              </div>
            )}
          </div>
          <p className="text-xs opacity-60">
            Common {WARDROBE_BANDS.common.join("–")} · Rare {WARDROBE_BANDS.rare.join("–")} · Prestige {WARDROBE_BANDS.prestige.map((n) => n.toLocaleString()).join("–")} coins. Earn them fishing, chopping, carving, and on the daily checklist.
          </p>

          {/* ---- the try-on's bill: live, and the one button that settles it ---- */}
          <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto border-t border-white/10 bg-stone-950/85 px-4 py-3 backdrop-blur" aria-live="polite">
            {missing.length === 0 ? (
              <div className="flex items-center justify-end gap-2 text-sm">
                <span className={`${ACTION} bg-gradient-to-b from-pink-200 to-pink-400 text-pink-950`}>✓ Equipped</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {missing.map((m) => (
                    <span key={m.key} className="rounded-full bg-white/10 px-2 py-1">
                      {m.emoji} {m.name} · {m.how === "buy" ? `🪙 ${m.price.toLocaleString()}` : m.how === "gacha" ? "🔮 Gachapon only" : "🛠️ Pioneer set"}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm">
                    Total <b className="text-amber-200 tabular-nums">🪙 {cost.toLocaleString()}</b>
                    <span className="ml-1 text-xs opacity-60 tabular-nums">{cost <= coins ? `· ${(coins - cost).toLocaleString()} left after` : `· ${(cost - coins).toLocaleString()} short`}</span>
                  </span>
                  <button type="button" onClick={revert} className={`${ACTION} bg-white/10 text-stone-100 outline outline-1 -outline-offset-1 outline-white/10 hover:bg-white/20 active:scale-95`}>
                    ↺ Revert
                  </button>
                  <button type="button" disabled={!!locked || cost > coins || pending} onClick={purchase} className={`${ACTION} min-w-[150px] bg-gradient-to-b from-amber-200 to-amber-400 text-amber-950 shadow-[0_4px_12px_rgba(244,161,92,0.4),inset_0_-2px_0_rgba(120,70,0,0.25)] enabled:active:scale-95 disabled:opacity-40`}>
                    {locked ? (locked.how === "gacha" ? "🔮 Not for sale" : "🛠️ Claim above") : pending ? "Wrapping it up…" : `[ Purchase & Equip ]`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ACTION = "inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-full px-3.5 text-xs font-bold leading-none transition-transform duration-150";

const TIER_BADGE: Record<string, string> = {
  starter: "bg-white/10 text-stone-200",
  common: "bg-stone-200/15 text-stone-100",
  rare: "bg-sky-300/20 text-sky-100",
  prestige: "bg-gradient-to-r from-amber-300/40 to-yellow-200/30 text-amber-50",
  gacha: "bg-violet-400/20 text-violet-100",
  pioneer: "bg-amber-400/25 text-amber-100",
};
const TIER_TEXT: Record<string, string> = { starter: "Free", gacha: "Gachapon", pioneer: "Pioneer", ...WARDROBE_TIER_LABEL };

/** One line of the closet: what it is, its tier and price, and whether it is yours; a click tries it on. */
function ItemRow({ item, owned, wearing, canAfford = true, onPick }: { item: WardrobeItem; owned: boolean; wearing: boolean; canAfford?: boolean; onPick: () => void }) {
  const tier = tierKey(item);
  return (
    <button type="button" onClick={onPick} aria-pressed={wearing} className={`flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ${wearing ? "bg-amber-300/15 ring-1 ring-amber-300/40" : "bg-white/5 hover:bg-white/10"}`}>
      <span className="w-8 shrink-0 text-center text-2xl leading-none">{item.emoji}</span>
      <span className="min-w-0 flex-1">
        <b className="block break-words font-semibold leading-tight">{item.name}</b>
        <span className={`mt-0.5 inline-block rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wider ${TIER_BADGE[tier]}`}>{TIER_TEXT[tier as WardrobeTier] ?? tier}</span>
      </span>
      <span className={`shrink-0 text-xs font-bold tabular-nums ${owned ? "text-emerald-200" : canAfford ? "text-amber-200" : "text-rose-200/80"}`}>{wearing && owned ? "✓ Wearing" : owned ? "Owned" : item.pioneer ? "Claim" : item.gachaOnly ? "🔮" : `🪙 ${item.price.toLocaleString()}`}</span>
    </button>
  );
}

/** The Velvet Pioneer set: claim it free, try the overalls on, wear its gold title. */
function PioneerCard({ info, ownsTitle, wearing, titleName, onClaim, onWearTitle, onTryOn }: { info: PioneerInfo; ownsTitle: boolean; wearing: boolean; titleName: string; onClaim: () => void; onWearTitle: (id: string) => void; onTryOn: () => void }) {
  const days = Math.max(0, Math.ceil((info.until - Date.now()) / 86_400_000));
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-[linear-gradient(135deg,#3b2a12,#1e2a3f)] p-3 outline outline-1 -outline-offset-1 outline-amber-300/30">
      <div className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden>
          🛠️
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-sm tracking-wide text-amber-100">{PIONEER_SET.name}</b>
          <span className="text-[11px] opacity-75">{info.claimed ? "Yours: thank you for playing the beta!" : `Pioneer Cap, Blueprint Overalls and a glowing gold title. Free for beta players · ${days} day${days === 1 ? "" : "s"} left`}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onTryOn} className={`${ACTION} bg-white/10 hover:bg-white/20 active:scale-95`}>
          🪞 Try on
        </button>
        {!info.claimed ? (
          <button type="button" onClick={onClaim} className={`${ACTION} bg-gradient-to-b from-amber-200 to-amber-400 text-amber-950 active:scale-95`}>
            Claim · 🪙 0
          </button>
        ) : (
          ownsTitle && (
            <button type="button" onClick={() => onWearTitle(wearing ? "" : PIONEER_SET.title)} className={`${ACTION} ${wearing ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/20"} active:scale-95`}>
              {wearing ? `✓ Wearing ${titleName}` : `Wear ${titleName}`}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/** A key, a fill and a rim: the avatar lit like a fitting room's mirror, nothing casting a shadow. */
function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.75} color="#fff1e6" />
      <directionalLight position={[2.2, 3.2, 3]} intensity={1.6} color="#fff4e2" />
      <directionalLight position={[-2.6, 1.6, 1.6]} intensity={0.55} color="#ffd6e8" />
      <directionalLight position={[0, 2.4, -3.2]} intensity={1.1} color="#ffe2a8" />
    </>
  );
}

// the podium: a velvet disc on a gilded rim, turning with the avatar
const VELVET = matte("#6a1a30", 0.9);
const GILT = new THREE.MeshStandardMaterial({ color: "#d4a93c", roughness: 0.35, metalness: 0.6 });
function Podium() {
  return (
    <group position={[0, -0.8, 0]}>
      <mesh geometry={GEO.cyl} material={GILT} position={[0, -0.03, 0]} scale={[1.9, 0.08, 1.9]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={VELVET} position={[0, 0.0, 0]} scale={[1.8, 0.07, 1.8]} raycast={noRaycast} />
    </group>
  );
}

/** Turns with your drag, coasts to a stop, and turns slowly round by itself when left alone. */
function Turntable({ spin, children }: { spin: React.MutableRefObject<{ y: number; v: number; dragging: boolean; lastX: number }>; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const s = spin.current;
    if (!s.dragging) {
      s.y += s.v;
      s.v *= 0.92;
      // idle: a slow showroom turn
      if (Math.abs(s.v) < 0.002) s.y += dt * 0.35;
    }
    if (ref.current) ref.current.rotation.y = s.y;
  });
  return (
    <group ref={ref} position={[0, -0.75, 0]}>
      {children}
    </group>
  );
}

function PreviewAvatar({ userId, look, color }: { userId: string; look: string; color: string }) {
  const speedRef = useRef(0);
  return <Avatar userId={userId} look={look} color={color} username="" pose="stand" speedRef={speedRef} />;
}

// A colour chip, and its picked state: a cream ring with a gap, matching the active tab
const SWATCH = "shrink-0 rounded-full border-2 border-white/60 shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)] transition-transform duration-150 hover:scale-110 active:scale-95";
const SWATCH_ON = "scale-105 border-white ring-2 ring-[#fff4e0] ring-offset-2 ring-offset-stone-900";

/** The quick colour bar docked under the preview: the current tab's colour, as chips that wrap. */
function QuickBar({ palette, value, onPick }: { palette: Palette; value: string; onPick: (c: string) => void }) {
  return (
    <div className="border-t border-white/10 bg-black/25 px-4 pb-4 pt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-widest opacity-60">
        <span className="shrink-0">{palette.label}</span>
        <span className="min-w-0 truncate normal-case tracking-normal">{palette.names[palette.colors.indexOf(value)] ?? ""}</span>
      </div>
      <div className="flex flex-wrap gap-2 p-1">
        {palette.colors.map((c, i) => (
          <button key={c} type="button" onClick={() => onPick(c)} aria-label={`${palette.label}: ${palette.names[i]}`} title={palette.names[i]} aria-pressed={c === value} className={`${SWATCH} h-7 w-7 ${c === value ? SWATCH_ON : ""}`} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, colors, names, value, onPick, big = false }: { label: string; colors: string[]; names?: string[]; value: string; onPick: (c: string) => void; big?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest opacity-60">
        <span>{label}</span>
        {names && <span className="normal-case tracking-normal opacity-90">{names[colors.indexOf(value)] ?? ""}</span>}
      </div>
      <div className="flex flex-wrap gap-2.5 p-1">
        {colors.map((c, i) => (
          <button key={c} type="button" onClick={() => onPick(c)} aria-label={`${label}: ${names?.[i] ?? c}`} title={names?.[i] ?? c} aria-pressed={c === value} className={`${SWATCH} ${big ? "h-10 w-10" : "h-9 w-9"} ${c === value ? SWATCH_ON : ""}`} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}
