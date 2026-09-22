import type { CSSProperties } from "react";

// The Cozy Clay & Glass look shared by the inline-styled HUD pieces (action dock, activity
// bar, roulette board, wardrobe): warm frosted stone, soft edges, light text. The Tailwind
// components use the same values through .clay-panel / .clay-pill in index.css.
export const glass: CSSProperties = {
  background: "rgba(28, 25, 23, 0.8)",
  backdropFilter: "blur(14px) saturate(140%)",
  WebkitBackdropFilter: "blur(14px) saturate(140%)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 10px 32px rgba(0, 0, 0, 0.4)",
};

export const hudText: CSSProperties = {
  fontFamily: "'Nunito', 'Quicksand', system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: "#f5f5f4",
};

export const pillButton: CSSProperties = {
  ...hudText,
  border: "none",
  borderRadius: 999,
  background: "rgba(255,255,255,0.12)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  padding: "10px 16px",
  minHeight: 44,
  whiteSpace: "nowrap",
  transition: "transform 120ms ease, background 150ms ease",
};
