import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import {
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  OUTFIT_COLORS,
  PREMIUM_HATS,
  PREMIUM_HAT_IDS,
  SKIN_TONES,
  encodeLook,
  type Accessory,
  type HairStyle,
  type Look,
  type PremiumHat,
} from "@shared/types";
import { Character3D, type FloatingEmote } from "../Character3D";
import { playChime, playClick, playCoin } from "../../audio/sfx";
import { saveLook } from "./lookStorage";

interface WardrobeProps {
  userId: string;
  username: string;
  initial: Look;
  coins: number;
  /** Premium hats already bought (comma-separated, from the player state). */
  owned: string;
  onApply: (encoded: string) => void;
  onBuy: (hat: PremiumHat) => void;
  onClose: () => void;
}

const HAIR_STYLE_LABELS: Record<HairStyle, string> = { cap: "Short", bob: "Bob", bun: "Bun", spiky: "Spiky", long: "Long" };
const HAT_LABELS: Record<Accessory, string> = {
  beret: "Beret",
  beanie: "Beanie",
  flower: "Flower",
  headphones: "Phones",
  none: "None",
  straw: "👒 Sunhat",
  bunny: "🐰 Bunny",
  tophat: "🎩 Top hat",
  crown: "👑 Crown",
};
type Tab = "hair" | "outfit" | "hats" | "skin";
const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "hats", label: "Hats", emoji: "🎩" },
  { id: "hair", label: "Hair", emoji: "💇" },
  { id: "outfit", label: "Outfits", emoji: "👕" },
  { id: "skin", label: "Colors", emoji: "🎨" },
];

// The wardrobe: a live 3D preview beside category tabs. Every change applies immediately (you
// see it on your character in the world too), syncs through the room, persists to the database
// and is remembered locally as a fallback.
export function Wardrobe({ userId, username, initial, coins, owned, onApply, onBuy, onClose }: WardrobeProps) {
  const [look, setLook] = useState<Look>(initial);
  const [tab, setTab] = useState<Tab>("hats");
  const ownedHats = owned ? (owned.split(",") as PremiumHat[]) : [];
  const lookRef = useRef(initial);

  useEffect(() => {
    playChime();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = (patch: Partial<Look>) => {
    playClick();
    const next = { ...lookRef.current, ...patch };
    lookRef.current = next;
    setLook(next);
    const encoded = encodeLook(next);
    saveLook(encoded);
    onApply(encoded);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="cozy-wardrobe clay-sheet sm:clay-pop font-cozy flex max-h-[92vh] w-full max-w-[680px] overflow-hidden rounded-t-3xl border border-white/10 bg-stone-900/85 text-stone-100 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md sm:rounded-3xl" role="dialog" aria-label="Wardrobe">
        <div className="cozy-wardrobe-preview min-h-[260px] flex-[0_0_40%] bg-[radial-gradient(circle_at_50%_70%,#3b2a36_0%,#1f1a22_70%)]">
          <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.1, 4.4], fov: 30 }} gl={{ antialias: true, alpha: true }}>
            <ambientLight intensity={1.3} />
            <directionalLight position={[2, 4, 3]} intensity={1.7} />
            <Suspense fallback={null}>
              <Turntable>
                <PreviewAvatar userId={userId} username={username} look={encodeLook(look)} shirt={look.shirt} />
              </Turntable>
            </Suspense>
          </Canvas>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-lg font-extrabold tracking-wide">👗 Wardrobe</h2>
            <span className="rounded-full bg-amber-300/25 px-3 py-1 text-sm font-extrabold text-amber-100">🪙 {coins}</span>
            <button type="button" onClick={onClose} className="clay-icon-btn bg-white/10 hover:bg-white/20" aria-label="Close wardrobe">
              ✕
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => (playClick(), setTab(t.id))} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition-transform active:scale-95 ${tab === t.id ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {tab === "hair" && (
            <>
              <Chips label="Style" options={HAIR_STYLES} labels={HAIR_STYLE_LABELS} value={look.hairStyle} onPick={(hairStyle) => update({ hairStyle })} />
              <Swatches label="Colour" colors={HAIR_COLORS} value={look.hair} onPick={(hair) => update({ hair })} />
            </>
          )}
          {tab === "outfit" && (
            <>
              <Swatches label="Top" colors={OUTFIT_COLORS} value={look.shirt} onPick={(shirt) => update({ shirt })} />
              <Swatches label="Bottoms" colors={OUTFIT_COLORS} value={look.pants} onPick={(pants) => update({ pants })} />
            </>
          )}
          {tab === "skin" && <Swatches label="Skin tone" colors={SKIN_TONES} value={look.skin} onPick={(skin) => update({ skin })} big />}
          {tab === "hats" && (
            <>
              <Chips label="Everyday" options={HATS} labels={HAT_LABELS} value={look.hat} onPick={(hat) => update({ hat })} />
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-widest opacity-60">Coin shop</div>
                <div className="flex flex-col gap-2">
                  {PREMIUM_HAT_IDS.map((hat) => {
                    const item = PREMIUM_HATS[hat];
                    const have = ownedHats.includes(hat);
                    const wearing = look.hat === hat;
                    return (
                      <div key={hat} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 text-sm">
                        <span className="text-2xl">{item.emoji}</span>
                        <span className="flex-1">
                          <b>{item.name}</b>
                          <br />
                          <span className="opacity-70">{have ? "Owned" : `${item.price} 🪙`}</span>
                        </span>
                        {have ? (
                          <button type="button" onClick={() => update({ hat: wearing ? "none" : hat })} className={`clay-btn min-h-10 px-4 text-xs ${wearing ? "clay-btn-rose" : "clay-btn-ghost"}`}>
                            {wearing ? "Wearing" : "Wear"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={coins < item.price}
                            onClick={() => {
                              playCoin();
                              onBuy(hat);
                              update({ hat });
                            }}
                            className="clay-btn clay-btn-amber min-h-10 px-4 text-xs"
                          >
                            Buy
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs opacity-60">Earn coins by fishing, foraging, pulling espressos, stirring the stew, and at the casino.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Slowly sways the preview left and right so the outfit is seen from a few angles. */
function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.6) * 0.6;
  });
  return (
    <group ref={ref} position={[0, -0.75, 0]}>
      {children}
    </group>
  );
}

function PreviewAvatar({ userId, look, shirt }: { userId: string; username: string; look: string; shirt: string }) {
  const speedRef = useRef(0);
  const emotes = useMemo<FloatingEmote[]>(() => [], []);
  return <Character3D userId={userId} look={look} color={shirt} username="" pose="stand" speedRef={speedRef} holding="" action="" actionProgress={0} toast={0} speaking={false} emotes={emotes} />;
}

function Swatches({ label, colors, value, onPick, big = false }: { label: string; colors: string[]; value: string; onPick: (c: string) => void; big?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-widest opacity-60">{label}</div>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            aria-label={`${label} ${c}`}
            aria-pressed={c === value}
            className={`rounded-full border-2 border-white/70 transition-transform hover:scale-110 active:scale-95 ${big ? "h-10 w-10" : "h-8 w-8"} ${c === value ? "scale-110 ring-2 ring-pink-300 ring-offset-2 ring-offset-stone-900" : ""}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

function Chips<T extends string>({ label, options, labels, value, onPick }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onPick: (v: T) => void }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-widest opacity-60">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onPick(o)} aria-pressed={o === value} className={`min-h-10 rounded-full px-4 text-sm font-bold transition-transform active:scale-95 ${o === value ? "bg-pink-300 text-pink-950" : "bg-white/10 hover:bg-white/15"}`}>
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}
