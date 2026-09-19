import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { HAIR_COLORS, HAIR_STYLES, HATS, OUTFIT_COLORS, SKIN_TONES, encodeLook, type Accessory, type HairStyle, type Look } from "@shared/types";
import { Character3D, type FloatingEmote } from "../Character3D";
import { playChime, playClick } from "../../audio/sfx";
import { glass, hudText } from "./glass";
import { saveLook } from "./lookStorage";


interface WardrobeProps {
  userId: string;
  username: string;
  initial: Look;
  onApply: (encoded: string) => void;
  onClose: () => void;
}

const HAIR_STYLE_LABELS: Record<HairStyle, string> = { cap: "Short", bob: "Bob", bun: "Bun", spiky: "Spiky", long: "Long" };
const HAT_LABELS: Record<Accessory, string> = { beret: "Beret", beanie: "Beanie", flower: "Flower", headphones: "Phones", none: "None" };

// The wardrobe: a live 3D preview beside palette pickers. Every change applies immediately (you
// see it on your character in the world too), syncs through the room, and is remembered locally.
export function Wardrobe({ userId, username, initial, onApply, onClose }: WardrobeProps) {
  const [look, setLook] = useState<Look>(initial);
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
            <button type="button" onClick={onClose} style={styles.close} aria-label="Close wardrobe">
              ✕
            </button>
          </div>
          <Swatches label="Skin" colors={SKIN_TONES} value={look.skin} onPick={(skin) => update({ skin })} />
          <Chips label="Hair style" options={HAIR_STYLES} labels={HAIR_STYLE_LABELS} value={look.hairStyle} onPick={(hairStyle) => update({ hairStyle })} />
          <Swatches label="Hair colour" colors={HAIR_COLORS} value={look.hair} onPick={(hair) => update({ hair })} />
          <Swatches label="Top" colors={OUTFIT_COLORS} value={look.shirt} onPick={(shirt) => update({ shirt })} />
          <Swatches label="Bottoms" colors={OUTFIT_COLORS} value={look.pants} onPick={(pants) => update({ pants })} />
          <Chips label="Hat" options={HATS} labels={HAT_LABELS} value={look.hat} onPick={(hat) => update({ hat })} />
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
};
