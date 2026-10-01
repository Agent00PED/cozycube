// Gentle ground, shared by the worlds that have it (the Starlight Campfire, the Whispering Woods).
//
// A world writes ONE height function (its mounds and terraces) and, from it, the ground as drawn
// (the river's channel cut in). `makeGrid` samples both on a square grid over the island; the
// builder models the ground from that very grid (scripts/<world>-terrain.ts writes it to
// scripts/blender/data/), each cell cut along the diagonal `gridY` reads it by, so feet, clicks and
// the model agree triangle for triangle. Nothing here knows a world's layout.

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 0 at a, 1 at b (either way round), eased. */
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** A round rise: `top` high within `flat` of its middle, down a smooth skirt `skirt` wide. Its
 *  steepest is 1.5 * top / skirt (keep that under tan 24 degrees, 0.445, for ground that is walked). */
export interface Mound {
  x: number;
  z: number;
  top: number;
  flat: number;
  skirt: number;
}
export const moundAt = (m: Mound, x: number, z: number) => m.top * (1 - smoothstep(m.flat, m.flat + m.skirt, Math.hypot(x - m.x, z - m.z)));

export interface TerrainGrid {
  half: number;
  /** Cells a side (n + 1 heights a side), each `cell` across. */
  n: number;
  cell: number;
  /** The ground as drawn, row by row along z. */
  ground: Float32Array;
  /** The ground things stand on (no river channel). */
  land: Float32Array;
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** The grid of a world's ground: `drawn` and `land` at every corner of its cells. */
export function makeGrid(half: number, step: number, drawn: (x: number, z: number) => number, land: (x: number, z: number) => number): TerrainGrid {
  const n = Math.round((2 * half) / step);
  const cell = (2 * half) / n;
  const ground = new Float32Array((n + 1) * (n + 1));
  const lands = new Float32Array((n + 1) * (n + 1));
  for (let k = 0; k <= n; k++)
    for (let i = 0; i <= n; i++) {
      const x = -half + i * cell;
      const z = -half + k * cell;
      ground[k * (n + 1) + i] = round4(drawn(x, z));
      lands[k * (n + 1) + i] = round4(land(x, z));
    }
  return { half, n, cell, ground, land: lands };
}

/** A grid's height at (x, z): its own triangles (each cell cut from its (-x, -z) corner to its
 *  (+x, +z) one). */
export function gridY(g: TerrainGrid, heights: Float32Array, x: number, z: number): number {
  const { n, cell, half } = g;
  const u = Math.max(0, Math.min(n - 1e-6, (x + half) / cell));
  const v = Math.max(0, Math.min(n - 1e-6, (z + half) / cell));
  const i = Math.floor(u);
  const k = Math.floor(v);
  const fu = u - i;
  const fv = v - k;
  const at = (a: number, b: number) => heights[b * (n + 1) + a];
  const h00 = at(i, k);
  const h11 = at(i + 1, k + 1);
  return fu >= fv ? h00 + (at(i + 1, k) - h00) * fu + (h11 - at(i + 1, k)) * fv : h00 + (h11 - at(i, k + 1)) * fu + (at(i, k + 1) - h00) * fv;
}

/** The grid as plain JSON for a builder. */
export function gridData(g: TerrainGrid) {
  return { half: g.half, n: g.n, cell: g.cell, ground: Array.from(g.ground, round4), land: Array.from(g.land, round4) };
}
