import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { playChime, playClick } from "../../audio/sfx";
import { glass, hudText } from "./glass";
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

// The wardrobe: a live 3D preview beside palette pickers. Every change applies immediately (you
// see it on your character in the world too), syncs through the room, and is remembered locally.
export function Wardrobe({ userId, username, initial, coins, owned, onApply, onBuy, onClose }: WardrobeProps) {
  const [look, setLook] = useState<Look>(initial);
  const [tab, setTab] = useState<"style" | "shop">("style");
  const ownedHats = owned ? (owned.split(",") as PremiumHat[]) : [];
  const hatOptions: Accessory[] = [...HATS, ...ownedHats];
  // latest outfit, so two quick taps before a re-render both land
  const lookRef = useRef(initial);

  useEffect(() => {
    playChime();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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
    <div style={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cozy-wardrobe" style={styles.panel} role="dialog" aria-label="Wardrobe">
        <div className="cozy-wardrobe-preview" style={styles.preview}>
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

        <div style={styles.controls}>
          <div style={styles.header}>
            <span style={styles.title}>👗 Wardrobe</span>
            <span style={styles.coins}>🪙 {coins}</span>
            <button type="button" onClick={onClose} style={styles.close} aria-label="Close wardrobe">
              ✕
            </button>
          </div>
          <div style={styles.tabs} role="tablist">
            {(["style", "shop"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{ ...styles.tab, ...(tab === t ? styles.tabOn : null) }}>
                {t === "style" ? "✂️ Style" : "🛍️ Coin Shop"}
              </button>
            ))}
          </div>
          {tab === "style" ? (
            <>
              <Swatches label="Skin" colors={SKIN_TONES} value={look.skin} onPick={(skin) => update({ skin })} />
              <Chips label="Hair style" options={HAIR_STYLES} labels={HAIR_STYLE_LABELS} value={look.hairStyle} onPick={(hairStyle) => update({ hairStyle })} />
              <Swatches label="Hair colour" colors={HAIR_COLORS} value={look.hair} onPick={(hair) => update({ hair })} />
              <Swatches label="Top" colors={OUTFIT_COLORS} value={look.shirt} onPick={(shirt) => update({ shirt })} />
              <Swatches label="Bottoms" colors={OUTFIT_COLORS} value={look.pants} onPick={(pants) => update({ pants })} />
              <Chips label="Hat" options={hatOptions} labels={HAT_LABELS} value={look.hat} onPick={(hat) => update({ hat })} />
            </>
          ) : (
            <div style={styles.shop}>
              {PREMIUM_HAT_IDS.map((hat) => {
                const item = PREMIUM_HATS[hat];
                const have = ownedHats.includes(hat);
                const wearing = look.hat === hat;
                return (
                  <div key={hat} style={styles.shopRow}>
                    <span style={{ fontSize: 24 }}>{item.emoji}</span>
                    <span style={{ flex: 1 }}>
                      <b>{item.name}</b>
                      <br />
                      <span style={{ opacity: 0.7 }}>{have ? "Owned" : `${item.price} 🪙`}</span>
                    </span>
                    {have ? (
                      <button type="button" style={{ ...styles.chip, ...(wearing ? styles.chipOn : null) }} onClick={() => update({ hat: wearing ? "none" : hat })}>
                        {wearing ? "Wearing" : "Wear"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={coins < item.price}
                        style={{ ...styles.chip, ...styles.buy, opacity: coins < item.price ? 0.45 : 1 }}
                        onClick={() => {
                          playClick();
                          onBuy(hat);
                        }}
                      >
                        Buy
                      </button>
                    )}
                  </div>
                );
              })}
              <span style={{ ...styles.label, textTransform: "none", letterSpacing: 0 }}>
                Earn coins by fishing, foraging, pulling espressos and at the casino.
              </span>
            </div>
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
  return (
    <Character3D
      userId={userId}
      look={look}
      color={shirt}
      username="" /* no nametag floating over the preview */
      pose="stand"
      speedRef={speedRef}
      holding=""
      action=""
      actionProgress={0}
      toast={0}
      speaking={false}
      emotes={emotes}
    />
  );
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <div style={styles.swatches}>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            aria-label={`${label} ${c}`}
            aria-pressed={c === value}
            style={{ ...styles.swatch, background: c, ...(c === value ? styles.swatchOn : null) }}
          />
        ))}
      </div>
    </div>
  );
}

function Chips<T extends string>({ label, options, labels, value, onPick }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onPick: (v: T) => void }) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <div style={styles.swatches}>
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onPick(o)} aria-pressed={o === value} style={{ ...styles.chip, ...(o === value ? styles.chipOn : null) }}>
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(40,30,24,0.25)", padding: 12 },
  panel: { ...glass, background: "rgba(255,250,242,0.85)", borderRadius: 22, display: "flex", overflow: "hidden", maxWidth: 640, width: "100%", maxHeight: "calc(100vh - 24px)" },
  preview: { flex: "0 0 38%", minHeight: 260, background: "radial-gradient(circle at 50% 70%, #fde3ea 0%, #f6efe4 70%)" },
  controls: { flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { ...hudText, fontSize: 16, fontWeight: 700 },
  close: { ...hudText, border: "none", background: "rgba(255,255,255,0.7)", borderRadius: 999, width: 30, height: 30, cursor: "pointer", fontSize: 13 },
  row: { display: "flex", flexDirection: "column", gap: 5 },
  label: { ...hudText, fontSize: 11.5, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 },
  swatches: { display: "flex", flexWrap: "wrap", gap: 6 },
  swatch: { width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 1px 4px rgba(80,60,40,0.25)", cursor: "pointer", padding: 0, transition: "transform 120ms ease" },
  swatchOn: { transform: "scale(1.18)", boxShadow: "0 0 0 2px #ec7fa3, 0 2px 6px rgba(236,127,163,0.5)" },
  chip: { ...hudText, border: "none", borderRadius: 999, background: "rgba(255,255,255,0.7)", padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  chipOn: { background: "#ec7fa3", color: "#fff" },
  coins: { ...hudText, fontSize: 13, fontWeight: 800, marginLeft: "auto", marginRight: 8 },
  tabs: { display: "flex", gap: 6 },
  tab: { ...hudText, border: "none", borderRadius: 999, background: "rgba(255,255,255,0.55)", padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  tabOn: { background: "#4a3a2c", color: "#fff" },
  shop: { display: "flex", flexDirection: "column", gap: 8 },
  shopRow: { ...hudText, display: "flex", alignItems: "center", gap: 10, fontSize: 13, background: "rgba(255,255,255,0.6)", borderRadius: 14, padding: "8px 10px" },
  buy: { background: "#f4c15c", color: "#3a2415" },
};
