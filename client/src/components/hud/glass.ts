import type { CSSProperties } from "react";

// The frosted-glass pill look shared by every HUD element (matches MapSwitcherUI / ColorPickerUI).
export const glass: CSSProperties = {
  background: "rgba(255, 250, 240, 0.55)",
  backdropFilter: "blur(14px) saturate(160%)",
  WebkitBackdropFilter: "blur(14px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.5)",
  boxShadow: "0 8px 24px rgba(80, 60, 40, 0.18)",
};

export const hudText: CSSProperties = {
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: "#4a3a2c",
};

export const pillButton: CSSProperties = {
  ...hudText,
  border: "none",
  borderRadius: 999,
  background: "rgba(255,255,255,0.55)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 14px",
  whiteSpace: "nowrap",
  transition: "transform 120ms ease, background 150ms ease",
};
