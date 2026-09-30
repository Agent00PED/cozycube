// The device's render profile, decided once at startup (docs/caverns-roadmap.md phase 7: the
// performance pass on phones). A handheld (a coarse pointer and no fine one: a phone or a tablet) gets
// the lighter settings: its screen already packs its pixels densely, so no multisampling on top of a
// dense one, no real-time shadow map (the doline's sun keeps its light, its shadows are the model's
// baked shade), and fewer of the crystals' little lights (every light is paid for by every lit pixel).
// A desktop keeps everything. The page never changes profile mid-visit: a switch would rebuild every
// material.

const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

export const perf = {
  /** A phone or a tablet at startup. */
  handheld: coarse,
  /** The canvas's pixel ratio range (never past 1.5: the HUD is DOM, sharp at any ratio). */
  dpr: [1, Math.min(dpr, 1.5)] as [number, number],
  /** Multisampling, off on a handheld's dense screen (twice the pixels or more). */
  antialias: !(coarse && dpr >= 2),
  /** The doline sun's real-time shadow map. */
  shadows: !coarse,
  /** How many of the crystals' and fungi's little point lights follow you in the caverns. */
  crystalLights: coarse ? 2 : 4,
};
