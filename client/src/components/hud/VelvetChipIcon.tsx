import { useId, type CSSProperties } from "react";
import { CHIP_EMOTE } from "@shared/casino";

// The Velvet Chip, drawn: an Art-Deco clay chip with a deep burgundy core, a gold ring round an
// embossed gold "V", and eight edge stripes (white and gold, turn about) round its rim, lifted off
// the page by a soft metallic shadow. It sits in a line of text at 1em (or any `size`), wherever the
// casino shows chips: the header's pill, the cage, every table's panel, the toasts and the emotes
// over an avatar (CHIP_EMOTE).

interface Props {
  /** Width and height: a CSS length ("1em", the default) or pixels. */
  size?: number | string;
  className?: string;
  /** Spoken by screen readers (none: it is decoration beside a number). */
  title?: string;
  style?: CSSProperties;
}

const STRIPES = Array.from({ length: 8 }, (_, i) => i * 45);

export function VelvetChipIcon({ size = "1em", className, title, style }: Props) {
  // gradient ids unique to each chip (one hidden elsewhere on the page must not blank this one)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const core = `vc-core-${id}`;
  const gold = `vc-gold-${id}`;
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "-0.16em", filter: "drop-shadow(0 1px 1px rgba(40, 10, 0, 0.55)) drop-shadow(0 0 0.6px rgba(255, 220, 140, 0.35))", ...style }}
    >
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={core} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#c2324d" />
          <stop offset="0.55" stopColor="#7c1529" />
          <stop offset="1" stopColor="#420815" />
        </radialGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#fff3c2" />
          <stop offset="0.45" stopColor="#e8b949" />
          <stop offset="1" stopColor="#8f5f12" />
        </linearGradient>
      </defs>
      {/* the clay body and its rim */}
      <circle cx="16" cy="16" r="15.2" fill={`url(#${core})`} stroke="#2a050d" strokeWidth="0.8" />
      {/* eight edge stripes, white and gold in turn */}
      {STRIPES.map((deg, i) => (
        <rect key={deg} x="14.3" y="1.1" width="3.4" height="4.3" rx="0.8" fill={i % 2 ? `url(#${gold})` : "#fbf3e3"} transform={`rotate(${deg} 16 16)`} />
      ))}
      {/* the gold ring and the inlay inside it */}
      <circle cx="16" cy="16" r="10.1" fill="none" stroke={`url(#${gold})`} strokeWidth="1.3" />
      <circle cx="16" cy="16" r="9.1" fill={`url(#${core})`} />
      {/* the embossed "V": a dark bed, the gold letter, a lit upper edge */}
      <path d="M10.9 11.1 L16 21.6 L21.1 11.1" fill="none" stroke="#2a050d" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" transform="translate(0 0.7)" />
      <path d="M10.9 11.1 L16 21.6 L21.1 11.1" fill="none" stroke={`url(#${gold})`} strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.6 10.6 L15.6 20.9" fill="none" stroke="#fff6d5" strokeWidth="0.7" strokeLinecap="round" opacity="0.8" />
      {/* a sheen across the top */}
      <path d="M6.2 11.5 A10.8 10.8 0 0 1 22.5 5.6" fill="none" stroke="#ffffff" strokeWidth="1.1" strokeLinecap="round" opacity="0.28" />
    </svg>
  );
}

/** An amount of chips: the chip, then the number (1,250). */
export function ChipAmount({ n, className, size }: { n: number; className?: string; size?: number | string }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className ?? ""}`}>
      <VelvetChipIcon size={size} />
      {Math.floor(n).toLocaleString("en-US")}
    </span>
  );
}

/** An emote or a toast's icon: the chip for CHIP_EMOTE, the emoji itself otherwise. */
export function EmoteGlyph({ emoji }: { emoji: string }) {
  return emoji === CHIP_EMOTE ? <VelvetChipIcon size="1em" /> : <>{emoji}</>;
}
