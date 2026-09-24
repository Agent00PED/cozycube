import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type * as THREE from "three";
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
  type Accessory,
  type HairStyle,
  type Look,
  type OutfitId,
  type PremiumHat,
} from "@shared/types";
import { saveLook } from "./lookStorage";
import { Avatar } from "../../entities/Avatar";

interface WardrobeProps {
  userId: string;
  username: string;
  initial: Look;
  coins: number;
  /** Everything unlocked so far (comma-separated ids: premium hats, bought outfits, hair_<style>). */
  owned: string;
  onApply: (encoded: string) => void;
  onBuy: (hat: PremiumHat) => void;
  onBuyOutfit: (outfit: OutfitId) => void;
  onBuyHair: (style: HairStyle) => void;
  onClose: () => void;
}

const FREE_HAT_LABELS: Record<Accessory, { label: string; emoji: string }> = {
  none: { label: "Bare head", emoji: "🙂" },
  beret: { label: "Beret", emoji: "🎨" },
  beanie: { label: "Beanie", emoji: "🧶" },
  flower: { label: "Flower", emoji: "🌸" },
  headphones: { label: "Headphones", emoji: "🎧" },
  straw: { label: "Straw Sunhat", emoji: "👒" },
  bunny: { label: "Bunny Ears", emoji: "🐰" },
  tophat: { label: "Top Hat", emoji: "🎩" },
  crown: { label: "High Roller Crown", emoji: "👑" },
  mochiears: { label: "Mochi Ears", emoji: "🐱" },
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

// The wardrobe: a live 3D preview you can drag round, with a quick colour bar under it, beside a
// category list (outfits, hats, hair styles) and the Appearance tab with every palette (skin, hair,
// top, bottoms, accent). Every change applies immediately (you see it on your character in the
// world too), syncs through the room as the equipped look, persists to the database and is
// remembered locally as a fallback. Outfits, premium hats and fancy hair are bought here;
// gacha-only items only ever arrive from the arcade.
export function Wardrobe({ userId, username, initial, coins, owned, onApply, onBuy, onBuyOutfit, onBuyHair, onClose }: WardrobeProps) {
  const [look, setLook] = useState<Look>(initial);
  const [tab, setTab] = useState<Tab>("outfits");
  const ownedIds = useMemo(() => new Set(owned ? owned.split(",") : []), [owned]);
  const lookRef = useRef(initial);
  const spin = useRef({ y: 0, v: 0, dragging: false, lastX: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = (patch: Partial<Look>) => {
    const next = { ...lookRef.current, ...patch };
    lookRef.current = next;
    setLook(next);
    const encoded = encodeLook(next);
    saveLook(encoded);
    onApply(encoded);
  };
  const ownsOutfit = (id: OutfitId) => STARTER_OUTFITS.includes(id) || ownedIds.has(id);
  const ownsHair = (style: HairStyle) => HAIR_DEFINITIONS[style].price === 0 || ownedIds.has(hairUnlockId(style));
  // a new outfit comes in its own fabrics; recolour it from there
  const wearOutfit = (outfit: OutfitId) => update({ outfit, ...OUTFIT_FABRICS[outfit] });
  const quick = QUICK_PALETTE[tab];

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="cozy-wardrobe clay-sheet sm:clay-pop font-cozy flex max-h-[85vh] w-full max-w-[760px] overflow-hidden rounded-t-3xl border border-white/10 bg-stone-900/85 text-stone-100 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md sm:rounded-3xl" role="dialog" aria-label="Wardrobe">
        {/* ---- left: the preview, and the quick colour bar under it ---- */}
        <div className="flex min-h-[260px] flex-[0_0_40%] flex-col bg-[radial-gradient(circle_at_50%_70%,#3b2a36_0%,#1f1a22_70%)]">
          <div
            className="cozy-wardrobe-preview relative min-h-0 flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerDown={(e) => {
              spin.current.dragging = true;
              spin.current.lastX = e.clientX;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!spin.current.dragging) return;
              const dx = e.clientX - spin.current.lastX;
              spin.current.lastX = e.clientX;
              spin.current.v = dx * 0.01;
              spin.current.y += dx * 0.01;
            }}
            onPointerUp={() => (spin.current.dragging = false)}
            onPointerCancel={() => (spin.current.dragging = false)}
          >
            <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.1, 4.4], fov: 30 }} gl={{ antialias: true, alpha: true }}>
              <ambientLight intensity={1.3} />
              <directionalLight position={[2, 4, 3]} intensity={1.7} />
              <Suspense fallback={null}>
                <Turntable spin={spin}>
                  <PreviewAvatar userId={userId} username={username} look={encodeLook(look)} color={look.outfitColor} />
                </Turntable>
              </Suspense>
            </Canvas>
            <span className="pointer-events-none absolute bottom-1 left-0 right-0 text-center text-[11px] opacity-50">drag to turn</span>
          </div>
          <QuickBar palette={quick} value={look[quick.field]} onPick={(c) => update({ [quick.field]: c })} />
        </div>

        {/* ---- right: categories and the list ---- */}
        <div className="scrollbar-none flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-lg font-extrabold tracking-wide">👗 Wardrobe</h2>
            <span className="rounded-full bg-amber-300/25 px-3 py-1 text-sm font-extrabold text-amber-100">🪙 {coins}</span>
            <button type="button" onClick={onClose} className="clay-icon-btn bg-white/10 hover:bg-white/20" aria-label="Close wardrobe">
              ✕
            </button>
          </div>

          <div className="flex gap-1.5" role="tablist" aria-label="Wardrobe categories">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`min-h-11 flex-1 rounded-full px-2 text-xs font-bold sm:text-sm transition-transform duration-150 active:scale-95 ${tab === t.id ? "bg-amber-300 text-amber-950 shadow-[inset_0_-2px_0_rgba(120,70,0,0.25)]" : "bg-white/10 hover:bg-white/15"}`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2" role="tabpanel">
            {tab === "outfits" &&
              OUTFIT_IDS.map((id) => {
                const item = OUTFITS[id];
                const have = ownsOutfit(id);
                return (
                  <ItemRow key={id} emoji={item.emoji} name={item.name} note={have ? "Owned" : item.gachaOnly ? "Gachapon only" : `${item.price} 🪙`} wearing={look.outfit === id} owned={have} gachaOnly={!!item.gachaOnly} canAfford={coins >= item.price} onWear={() => wearOutfit(id)} onBuy={() => (onBuyOutfit(id), wearOutfit(id))} />
                );
              })}
            {tab === "hats" && (
              <>
                {HATS.map((hat) => (
                  <ItemRow key={hat} emoji={FREE_HAT_LABELS[hat].emoji} name={FREE_HAT_LABELS[hat].label} note="Free" wearing={look.hat === hat} owned onWear={() => update({ hat })} />
                ))}
                {PREMIUM_HAT_IDS.map((hat) => {
                  const item = PREMIUM_HATS[hat];
                  const have = ownedIds.has(hat);
                  return (
                    <ItemRow key={hat} emoji={item.emoji} name={item.name} note={have ? "Owned" : item.gachaOnly ? "Gachapon only" : `${item.price} 🪙`} wearing={look.hat === hat} owned={have} gachaOnly={!!item.gachaOnly} canAfford={coins >= item.price} onWear={() => update({ hat })} onBuy={() => (onBuy(hat), update({ hat }))} />
                  );
                })}
              </>
            )}
            {tab === "hair" &&
              HAIR_STYLES.map((style) => {
                const item = HAIR_DEFINITIONS[style];
                const have = ownsHair(style);
                return (
                  <ItemRow key={style} emoji={item.emoji} name={item.name} note={item.price === 0 ? "Free" : have ? "Owned" : `${item.price} 🪙`} wearing={look.hairStyle === style} owned={have} canAfford={coins >= item.price} onWear={() => update({ hairStyle: style })} onBuy={() => (onBuyHair(style), update({ hairStyle: style }))} />
                );
              })}
            {tab === "appearance" && (
              <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-3">
                {Object.values(PALETTES).map((p) => (
                  <Swatches key={p.field} label={p.label} colors={p.colors} names={p.names} value={look[p.field]} onPick={(c) => update({ [p.field]: c })} big={p.field === "skin" || p.field === "hair"} />
                ))}
              </div>
            )}
          </div>
          <p className="text-xs opacity-60">Earn coins by fishing, foraging, boxing, the tea house, the daily checklist, and at the casino.</p>
        </div>
      </div>
    </div>
  );
}

/** One line of the closet: what it is, what it costs, and Wear / Wearing / Buy. */
function ItemRow({ emoji, name, note, wearing, owned, gachaOnly = false, canAfford = true, onWear, onBuy }: { emoji: string; name: string; note: string; wearing: boolean; owned: boolean; gachaOnly?: boolean; canAfford?: boolean; onWear: () => void; onBuy?: () => void }) {
  return (
    <div className={`flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2 text-sm transition-colors ${wearing ? "bg-amber-300/15 ring-1 ring-amber-300/40" : "bg-white/5"}`}>
      <span className="text-2xl">{emoji}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">{name}</b>
        <span className="opacity-70">{note}</span>
      </span>
      {owned ? (
        <button type="button" disabled={wearing} onClick={onWear} className={`clay-btn min-h-10 px-4 text-xs ${wearing ? "clay-btn-rose" : "clay-btn-ghost"}`}>
          {wearing ? "Wearing" : "Wear"}
        </button>
      ) : gachaOnly ? (
        <span className="text-xs opacity-60" title="Only from the gachapon in the arcade">
          🔮
        </span>
      ) : (
        <button type="button" disabled={!canAfford} onClick={onBuy} className="clay-btn clay-btn-amber min-h-10 px-4 text-xs">
          Buy
        </button>
      )}
    </div>
  );
}

/** Turns with your drag, coasts to a stop, and sways gently when left alone. */
function Turntable({ spin, children }: { spin: React.MutableRefObject<{ y: number; v: number; dragging: boolean; lastX: number }>; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const s = spin.current;
    if (!s.dragging) {
      s.y += s.v;
      s.v *= 0.92;
    }
    if (ref.current) ref.current.rotation.y = s.y + (Math.abs(s.v) < 0.001 && !s.dragging ? Math.sin(clock.elapsedTime * 0.6) * 0.25 : 0);
  });
  return (
    <group ref={ref} position={[0, -0.75, 0]}>
      {children}
    </group>
  );
}

function PreviewAvatar({ userId, look, color }: { userId: string; username: string; look: string; color: string }) {
  const speedRef = useRef(0);
  return <Avatar userId={userId} look={look} color={color} username="" pose="stand" speedRef={speedRef} />;
}

/** The quick colour bar docked under the preview: one row of chips for the current tab's colour. */
function QuickBar({ palette, value, onPick }: { palette: Palette; value: string; onPick: (c: string) => void }) {
  return (
    <div className="border-t border-white/10 bg-black/25 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest opacity-60">
        <span>{palette.label}</span>
        <span className="normal-case tracking-normal">{palette.names[palette.colors.indexOf(value)] ?? ""}</span>
      </div>
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-0.5">
        {palette.colors.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            aria-label={`${palette.label}: ${palette.names[i]}`}
            title={palette.names[i]}
            aria-pressed={c === value}
            className={`h-7 w-7 shrink-0 rounded-full border-2 border-white/70 shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)] transition-transform duration-150 hover:scale-110 active:scale-95 ${c === value ? "scale-110 ring-2 ring-pink-300 ring-offset-1 ring-offset-stone-900" : ""}`}
            style={{ background: c }}
          />
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
      <div className="flex flex-wrap gap-2">
        {colors.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            aria-label={`${label}: ${names?.[i] ?? c}`}
            title={names?.[i] ?? c}
            aria-pressed={c === value}
            className={`rounded-full border-2 border-white/70 shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)] transition-transform duration-150 hover:scale-110 active:scale-95 ${big ? "h-10 w-10" : "h-8 w-8"} ${c === value ? "scale-110 ring-2 ring-pink-300 ring-offset-2 ring-offset-stone-900" : ""}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}
