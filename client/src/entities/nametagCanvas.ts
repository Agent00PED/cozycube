import * as THREE from "three";

// A player's name over their head, drawn on a canvas and shown as a texture: the canvas draws text
// the way the page does, glyph by glyph through a font stack, so a name in any script shows (the
// nametag's pixel face has only Latin: Thai, and whatever else, falls through to Noto Sans Thai and
// then the system's fonts). The canvas is drawn at the screen's pixel ratio (up to 2) for crisp
// edges, and sized from the text's measured ink: Thai stacks vowels and tone marks above a
// consonant (ไม้เอก over สระอี) and hangs vowels below it (สระอุ), so the box gets room over the
// tallest mark and under the lowest, never a clipped accent. White text in a black outline: the
// mesh's material colour tints the white (green while speaking), the outline stays black.

/** The canvas's text size in CSS pixels: the plane is scaled so this many map to NAME_SIZE. */
export const NAMETAG_FONT_PX = 32;
const FONT = `700 ${NAMETAG_FONT_PX}px "KenPixel", "Noto Sans Thai", "Prompt", system-ui, sans-serif`;
const OUTLINE_PX = 5;
/** Room kept over and under the ink (a fraction of the font size), for the marks. */
const PAD_Y = 0.22;
const PAD_X = 0.3;
/** The widest a name is drawn (in font sizes) before it is shrunk to fit. */
const MAX_EMS = 11;

export interface NametagTexture {
  texture: THREE.CanvasTexture;
  /** The plane's size in font sizes (so its height in world units is NAME_SIZE * h). */
  w: number;
  h: number;
  /** Let go of the texture (and of a redraw still waiting on the fonts). */
  dispose: () => void;
}

/** Drawn at 2x at least (sharp Thai tone marks on any screen), 3x on the densest. */
const dpr = () => Math.max(2, Math.min(typeof window === "undefined" ? 2 : window.devicePixelRatio || 1, 3));

function draw(canvas: HTMLCanvasElement, text: string): { w: number; h: number } {
  const ctx = canvas.getContext("2d")!;
  ctx.font = FONT;
  const m = ctx.measureText(text);
  // shrink a long name to fit, keeping its marks' room in proportion
  const scale = Math.min(1, (MAX_EMS * NAMETAG_FONT_PX) / Math.max(1, m.width));
  const ascent = Math.max(m.actualBoundingBoxAscent || 0, NAMETAG_FONT_PX * 0.8) * scale;
  const descent = Math.max(m.actualBoundingBoxDescent || 0, NAMETAG_FONT_PX * 0.2) * scale;
  const padY = NAMETAG_FONT_PX * PAD_Y + OUTLINE_PX;
  const padX = NAMETAG_FONT_PX * PAD_X + OUTLINE_PX;
  const cssW = m.width * scale + padX * 2;
  const cssH = ascent + descent + padY * 2;
  const k = dpr();
  canvas.width = Math.ceil(cssW * k);
  canvas.height = Math.ceil(cssH * k);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  const x = cssW / 2;
  const y = padY + ascent;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineWidth = (OUTLINE_PX * 2) / scale;
  ctx.strokeStyle = "#000";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return { w: cssW / NAMETAG_FONT_PX, h: cssH / NAMETAG_FONT_PX };
}

/** A texture of `text`, redrawn (through `onRedraw`) once the fonts it needs have loaded. */
export function makeNametag(text: string, onRedraw: (tag: NametagTexture) => void): NametagTexture {
  const canvas = document.createElement("canvas");
  const size = draw(canvas, text);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // shown at 8 to 14 px from a canvas several times that: mipmapped, so the strokes never shimmer
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  let disposed = false;
  const tag: NametagTexture = {
    texture,
    ...size,
    dispose: () => {
      disposed = true;
      texture.dispose();
    },
  };
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (fonts && !fonts.check(FONT, text)) {
    void fonts.load(FONT, text).then(() => {
      if (disposed) return;
      Object.assign(tag, draw(canvas, text));
      texture.dispose(); // the canvas changed size: the GPU copy is remade
      texture.needsUpdate = true;
      onRedraw({ ...tag });
    });
  }
  return tag;
}
