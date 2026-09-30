import * as THREE from "three";
import { CAVERNS_LAYOUT as L, CAVE_TRAILS, SURFACE, TERRAIN_CELL, TERRAIN_HEIGHTS, TERRAIN_N, cavernsSurface } from "@shared/worlds/caverns";
import { isTouchUi } from "../systems/inputMode";

// The Glimmering Caverns' surface detail (docs/caverns-roadmap.md phase 2): everything natural in the
// model (the floor, the rock, the walls, the Hound's Hand) gets detail below its 0.5 m grid, in the
// three scales of the quality bar:
//
//   large   each zone's own ground and tint (the model's vertex colours, as before)
//   mid     two scales of mottling, cracks between plates on the ground (each plate its own tone),
//           strata seams and bands up the steep faces, rust streaking down the mudflats' walls, moss in
//           patches on whatever faces up in the jungle, the terraces' tiny rimstone pools, the beach's
//           ripples, and the floor's banks painted bare rock by how steep the ground is over a metre
//           (its heights as a texture: an edge that follows the contour, never the grid's saw-tooth)
//   fine    grain, and flecks glinting in the rift's basalt (off on a touch screen, whose pixels are
//           each a bigger share of a metre)
//
// and the trails drawn over the floor from their own lines (CAVE_TRAILS, exactly: a vertex grid can
// only carry a smudge): a trodden way lighter than the ground it is cut into, grit on it, a darker lip
// along its edges, fading out past its ends.
//
// All of it from one 256 x 256 noise texture made here (mottling, grain, a crack network and each
// crack cell's tone, all tiling), sampled in world space (along the ground on the floor, from three
// sides on the rock and the walls), and a look texture on the terrain's grid saying how much of each
// the ground there takes (a row of LOOK per SURFACE, the zones' edges blending over half a metre and
// wandering with the noise). A vertex colour's alpha says whether a face is natural (1: rock, ground)
// or made or grown (0: timber, canvas, metal, the trees): only the natural take any of it.

/** How much of each detail each kind of ground takes: cracks, moss, rust, wet, strata, gours, ripples,
 *  sparkle. */
const LOOK: Record<number, [number, number, number, number, number, number, number, number]> = {
  [SURFACE.basecamp]: [0.14, 0, 0, 0, 0.7, 0, 0, 0.12],
  [SURFACE.jungle]: [0.05, 0.9, 0, 0.12, 0.45, 0, 0, 0],
  [SURFACE.breakdown]: [0.85, 0, 0, 0, 0.85, 0, 0, 0.3],
  [SURFACE.mudflats]: [0.3, 0, 0.9, 0.04, 0.5, 0, 0, 0],
  [SURFACE.overlook]: [0.55, 0.05, 0, 0, 0.75, 0.12, 0, 0.1],
  [SURFACE.travertine]: [0, 0, 0, 0.08, 0.25, 0.9, 0, 0.08],
  [SURFACE.rift]: [0.45, 0, 0, 0, 0.4, 0, 0, 1],
  [SURFACE.shore]: [0.04, 0, 0, 0.04, 0.4, 0, 0.8, 0.12],
  [SURFACE.bed]: [0, 0, 0, 1, 0.2, 0, 0.5, 0],
  [SURFACE.trail]: [0.12, 0, 0, 0, 0.3, 0, 0, 0],
  [SURFACE.stream]: [0, 0.2, 0, 1, 0, 0, 0.2, 0],
  [SURFACE.pool]: [0, 0, 0, 1, 0, 0.6, 0, 0],
};

const NOISE_SIZE = 256;

/** Tiling value noise: `period` lattice cells across the tile, smoothly interpolated (0..1). */
function valueNoise(size: number, period: number, seed: number): Float32Array {
  const lat = new Float32Array(period * period);
  let s = seed * 2654435761;
  for (let i = 0; i < lat.length; i++) {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    lat[i] = (s % 100000) / 100000;
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * period;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const a = lat[(y0 % period) * period + (x0 % period)];
      const b = lat[(y0 % period) * period + ((x0 + 1) % period)];
      const c = lat[((y0 + 1) % period) * period + (x0 % period)];
      const d = lat[((y0 + 1) % period) * period + ((x0 + 1) % period)];
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

/** A small seeded random (0..1) for the crack cells. */
function rand2(i: number, j: number, k: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

let noiseTex: THREE.DataTexture | null = null;
/** The noise: R mottling (four octaves), G grain, B the crack network (a tiling Voronoi's edges),
 *  A each crack cell's own tone. */
export function caveNoiseTexture(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const n = NOISE_SIZE;
  const oct = [valueNoise(n, 4, 1), valueNoise(n, 8, 2), valueNoise(n, 16, 3), valueNoise(n, 32, 4)];
  const grainA = valueNoise(n, 64, 5);
  const grainB = valueNoise(n, 128, 6);
  const cells = 10;
  const pts: [number, number][] = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + 0.7 * rand2(i, j, 1)) / cells, (j + 0.15 + 0.7 * rand2(i, j, 2)) / cells]);
  const data = new Uint8Array(n * n * 4);
  let lo = 1;
  let hi = 0;
  const fbm = new Float32Array(n * n);
  for (let q = 0; q < n * n; q++) {
    const v = oct[0][q] * 0.5 + oct[1][q] * 0.26 + oct[2][q] * 0.14 + oct[3][q] * 0.1;
    fbm[q] = v;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const q = y * n + x;
      const u = (x + 0.5) / n;
      const v = (y + 0.5) / n;
      const ci = Math.floor(u * cells);
      const cj = Math.floor(v * cells);
      let f1 = 9;
      let f2 = 9;
      let id = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = (ci + di + cells) % cells;
          const jj = (cj + dj + cells) % cells;
          const p = pts[jj * cells + ii];
          const px = p[0] + (ci + di < 0 ? -1 : ci + di >= cells ? 1 : 0);
          const py = p[1] + (cj + dj < 0 ? -1 : cj + dj >= cells ? 1 : 0);
          const d = Math.hypot(px - u, py - v);
          if (d < f1) {
            f2 = f1;
            f1 = d;
            id = jj * cells + ii;
          } else if (d < f2) f2 = d;
        }
      }
      // (a crack a couple of texels wide where two cells meet, wobbling with the fine noise)
      const edge = f2 - f1 + (grainA[q] - 0.5) * 0.006;
      const crack = 1 - Math.min(1, Math.max(0, (edge - 0.003) / 0.009));
      const mottle = (fbm[q] - lo) / (hi - lo);
      data[q * 4] = Math.round(mottle * 255);
      data[q * 4 + 1] = Math.round((grainB[q] * 0.65 + grainA[q] * 0.35) * 255);
      data[q * 4 + 2] = Math.round(crack * 255);
      data[q * 4 + 3] = Math.round(rand2(id, 7, 3) * 255);
    }
  }
  noiseTex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.anisotropy = 4;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

let lookTex: [THREE.DataTexture, THREE.DataTexture] | null = null;
/** The look on the terrain's grid: A (cracks, moss, rust, wet), B (strata, gours, ripples, sparkle);
 *  the water's wet reaching a cell up its banks. */
export function caveLookTextures(): [THREE.DataTexture, THREE.DataTexture] {
  if (lookTex) return lookTex;
  const n = TERRAIN_N;
  const x0 = -L.half;
  const surf = new Uint8Array(n * n);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) surf[k * n + i] = cavernsSurface(x0 + i * TERRAIN_CELL, x0 + k * TERRAIN_CELL);
  const a = new Uint8Array(n * n * 4);
  const b = new Uint8Array(n * n * 4);
  const watery = (s: number) => s === SURFACE.stream || s === SURFACE.pool || s === SURFACE.bed;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const q = k * n + i;
      const look = LOOK[surf[q]] ?? LOOK[SURFACE.shore];
      let wet = look[3];
      if (wet < 0.6) {
        for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
          const kk = k + dk;
          const ii = i + di;
          if (kk >= 0 && ii >= 0 && kk < n && ii < n && watery(surf[kk * n + ii])) wet = Math.max(wet, 0.6);
        }
      }
      a.set([look[0], look[1], look[2], wet].map((v) => Math.round(v * 255)), q * 4);
      b.set([look[4], look[5], look[6], look[7]].map((v) => Math.round(v * 255)), q * 4);
    }
  }
  const make = (data: Uint8Array<ArrayBuffer>) => {
    const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  lookTex = [make(a), make(b)];
  return lookTex;
}

let floorTex: THREE.DataTexture | null = null;
/** The floor's heights on the terrain's grid (metres, half floats: a texel a grid vertex), for the
 *  banks' steepness and the water's depth. */
export function caveFloorTexture(): THREE.DataTexture {
  if (floorTex) return floorTex;
  const data = new Uint16Array(TERRAIN_N * TERRAIN_N);
  for (let q = 0; q < data.length; q++) data[q] = THREE.DataUtils.toHalfFloat(TERRAIN_HEIGHTS[q]);
  floorTex = new THREE.DataTexture(data, TERRAIN_N, TERRAIN_N, THREE.RedFormat, THREE.HalfFloatType);
  floorTex.magFilter = THREE.LinearFilter;
  floorTex.minFilter = THREE.LinearFilter;
  floorTex.needsUpdate = true;
  return floorTex;
}

/** The grid's texture coordinate of a world (x, z) (GLSL). */
export const CAVE_GRID_GLSL = `
vec2 caveGridUv(vec2 xz) { return ((xz + ${L.half.toFixed(2)}) / ${TERRAIN_CELL.toFixed(3)} + 0.5) / ${TERRAIN_N.toFixed(1)}; }`;

/** Every trail's straight stretches (ax, az, bx, bz) and each one's (half width, whether it starts
 *  the trail, whether it ends it). */
const TRAIL_SEGS: THREE.Vector4[] = [];
const TRAIL_ENDS: THREE.Vector3[] = [];
for (const p of CAVE_TRAILS) {
  for (let i = 0; i + 1 < p.points.length; i++) {
    const [ax, az] = p.points[i];
    const [bx, bz] = p.points[i + 1];
    TRAIL_SEGS.push(new THREE.Vector4(ax, az, bx, bz));
    TRAIL_ENDS.push(new THREE.Vector3(p.half, i === 0 ? 1 : 0, i + 2 === p.points.length ? 1 : 0));
  }
}

const BANK_ROCK = new THREE.Color("#6a655d");
const DROP_ROCK = new THREE.Color("#3e3b42");
const TIME = { value: 0 };
/** The clock the fine sparkle twinkles by (CavernsWorld advances it). */
export const caveSurfaceTime = TIME;

const SURFACE_PARS = `
uniform sampler2D uCaveNoise;
uniform sampler2D uCaveLookA;
uniform sampler2D uCaveLookB;
uniform sampler2D uCaveFloor;
uniform float uCaveTime;
uniform vec3 uBankRock;
uniform vec3 uDropRock;
uniform vec4 uTrailSeg[${TRAIL_SEGS.length}];
uniform vec3 uTrailEnd[${TRAIL_SEGS.length}];
varying vec3 vCavePos;
varying vec3 vCaveNrm;
${CAVE_GRID_GLSL}
vec4 caveLA;
vec4 caveLB;
float caveNat;
// (the noise from three sides, weighted by the facing; the floor only ever along the ground)
vec4 caveTri(vec3 p, vec3 w, float s) {
  #ifdef CAVE_FLOOR
    return texture2D(uCaveNoise, p.xz * s);
  #else
    return texture2D(uCaveNoise, p.zy * s) * w.x + texture2D(uCaveNoise, p.xz * s) * w.y + texture2D(uCaveNoise, p.xy * s) * w.z;
  #endif
}
float caveFloorH(vec2 xz) { return texture2D(uCaveFloor, caveGridUv(xz)).r; }`;

const SURFACE_FRAG = `
{
  #ifdef USE_COLOR_ALPHA
    caveNat = vColor.a;
  #else
    caveNat = 1.0;
  #endif
  vec3 nrm = normalize(vCaveNrm);
  #ifdef DOUBLE_SIDED
    nrm *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
  vec3 tw = pow(abs(nrm), vec3(4.0));
  tw /= (tw.x + tw.y + tw.z);
  vec4 big = caveTri(vCavePos, tw, 0.14);
  vec4 mid = caveTri(vCavePos + 3.7, tw, 0.37);
  // (the look's zones blend over half a metre, their edges wandering with the noise)
  vec2 luv = caveGridUv(vCavePos.xz + (big.rg - 0.5) * 0.9);
  caveLA = texture2D(uCaveLookA, luv);
  caveLB = texture2D(uCaveLookB, luv);
  float up = smoothstep(0.45, 0.85, nrm.y);
  float steep = 1.0 - smoothstep(0.55, 0.8, nrm.y);
  vec3 c = diffuseColor.rgb;
  #ifdef CAVE_FLOOR
  {
    // the banks: bare rock where the ground over a metre is too steep to walk (its zone's own ground
    // gone darker), the true drops darker still; the edge follows the contour, and where the slope
    // hovers near the line each crack plate goes one way or the other whole (broken scree, crisp
    // edges, never a smoky patch)
    float e = ${(TERRAIN_CELL).toFixed(2)};
    vec2 p = vCavePos.xz;
    float gx = (caveFloorH(p + vec2(e, 0.0)) - caveFloorH(p - vec2(e, 0.0))) / (2.0 * e);
    float gz = (caveFloorH(p + vec2(0.0, e)) - caveFloorH(p - vec2(0.0, e))) / (2.0 * e);
    float g = length(vec2(gx, gz));
    float bank = smoothstep(-0.015, 0.015, g - (0.44 + 0.18 * big.a + 0.05 * (mid.r - 0.5))) * 0.9;
    float drop = smoothstep(-0.02, 0.02, g - (1.0 + 0.3 * big.a)) * 0.55;
    c = mix(c, mix(c * 0.62, uBankRock, 0.35), bank * caveNat);
    c = mix(c, mix(c * 0.5, uDropRock, 0.5), drop * caveNat);
    steep = max(steep, bank);
    up *= 1.0 - bank;
  }
  // the trails: the trodden way over the ground it is cut into, its edge wobbling a little
  float trail = 0.0;
  float lip = 0.0;
  for (int i = 0; i < ${TRAIL_SEGS.length}; i++) {
    vec4 sg = uTrailSeg[i];
    vec2 ab = sg.zw - sg.xy;
    float len = length(ab);
    float t = dot(vCavePos.xz - sg.xy, ab) / (len * len);
    float d = length(vCavePos.xz - (sg.xy + ab * clamp(t, 0.0, 1.0))) - uTrailEnd[i].x;
    float fade = 1.0 - max(uTrailEnd[i].y * smoothstep(0.0, 1.4, -t * len), uTrailEnd[i].z * smoothstep(0.0, 1.4, (t - 1.0) * len));
    float edge = d + (mid.r - 0.5) * 0.35 + (big.g - 0.5) * 0.12;
    trail = max(trail, (1.0 - smoothstep(-0.04, 0.04, edge)) * fade);
    lip = max(lip, (1.0 - smoothstep(0.0, 0.09, abs(edge + 0.07))) * fade);
  }
  trail *= caveNat;
  #endif
  // mottling at two scales
  c *= 1.0 + caveNat * (0.2 * (big.r - 0.5) + 0.14 * (mid.r - 0.5));
  // cracks between plates on the ground, each plate its own tone
  float kc = caveLA.r * caveNat * up;
  #ifdef CAVE_FLOOR
    kc = max(kc, 0.6 * steep * caveNat) * (1.0 - trail);
  #endif
  c *= (1.0 - 0.5 * big.b * kc) * (1.0 + 0.16 * (big.a - 0.5) * kc);
  // strata up the steep faces: thin dark seams and broad bands by height
  float ks = caveLB.r * caveNat * steep;
  if (ks > 0.01) {
    float sy = vCavePos.y + (mid.r - 0.5) * 0.45;
    float seam = smoothstep(0.8, 0.97, sin(sy * 7.0));
    float band = sin(sy * 1.9 + big.r * 2.0);
    c *= 1.0 - ks * (0.3 * seam - 0.1 * band);
  }
  // rust streaking down the steep faces (the mudflats)
  float kr = caveLA.b * caveNat * steep;
  if (kr > 0.01) {
    float streak = texture2D(uCaveNoise, vec2((vCavePos.x + vCavePos.z) * 2.6, vCavePos.y * 0.12)).g;
    c = mix(c, vec3(0.25, 0.07, 0.023), kr * 0.35 * smoothstep(0.55, 0.8, streak));
  }
  // moss in patches on whatever faces up (the jungle)
  float km = caveLA.g * caveNat * smoothstep(0.55, 0.85, nrm.y);
  if (km > 0.01) {
    float patchy = smoothstep(0.48, 0.66, mid.r * 0.55 + big.r * 0.45);
    c = mix(c, vec3(0.078, 0.195, 0.042) * (0.8 + 0.4 * mid.g), km * patchy * 0.75);
  }
  // the terraces' tiny rimstone pools: pale rims round them
  float kg = caveLB.g * caveNat * up;
  if (kg > 0.01) {
    float gour = texture2D(uCaveNoise, vCavePos.xz * 0.3 + 0.3).b;
    c *= 1.0 + kg * (0.16 * gour - 0.03);
  }
  // the beach's ripples
  float kp = caveLB.b * caveNat * up;
  if (kp > 0.01) c *= 1.0 + 0.07 * kp * sin(dot(vCavePos.xz, vec2(0.6, 0.8)) * 11.0 + (big.r - 0.5) * 7.0);
  #ifdef CAVE_FINE
    c *= 1.0 + 0.1 * caveNat * (caveTri(vCavePos + 1.3, tw, 1.1).g - 0.5);
  #endif
  #ifdef CAVE_FLOOR
  {
    // (trodden: lighter and warmer, the cracks worn away, grit scattered on it, a lip at its edge)
    float grit = texture2D(uCaveNoise, vCavePos.xz * 1.7 + 0.6).g;
    // (#C9AE7C, the packed earth of every trail, a third of it over the ground's own colour)
    vec3 trod = mix(c * vec3(1.18, 1.13, 1.04), vec3(0.584, 0.423, 0.202), 0.32);
    trod *= 1.0 + 0.22 * smoothstep(0.74, 0.8, grit) - 0.16 * smoothstep(0.26, 0.2, grit);
    c = mix(c, trod, trail * 0.85);
    c *= 1.0 - 0.2 * lip * caveNat;
  }
  #endif
  // wet near the water: darker and glossy
  float wet = caveLA.a * caveNat;
  c *= 1.0 - 0.18 * wet;
  roughnessFactor = mix(roughnessFactor, 0.28, wet);
  diffuseColor.rgb = c;
}`;

const SPARKLE_FRAG = `
#ifdef CAVE_FINE
{
  float kf = caveLB.a * caveNat;
  if (kf > 0.01) {
    float fleck = texture2D(uCaveNoise, vCavePos.xz * 2.3 + vCavePos.y * 0.7).g;
    float glint = smoothstep(0.86, 0.9, fleck) * (0.5 + 0.5 * sin(uCaveTime * 2.2 + fleck * 70.0));
    totalEmissiveRadiance += vec3(0.45, 0.75, 1.0) * glint * kf * 0.55;
  }
}
#endif`;

/** The surface detail chained onto a material (after any patch already on it): `floor` for the walk
 *  collider (along the ground only, and the banks painted by the ground's steepness). */
export function caveSurface(m: THREE.MeshStandardMaterial, floor: boolean) {
  if (m.userData.caveSurface) return;
  m.userData.caveSurface = true;
  const fine = !isTouchUi();
  m.defines = { ...(m.defines ?? {}), ...(floor ? { CAVE_FLOOR: "" } : {}), ...(fine ? { CAVE_FINE: "" } : {}) };
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  const [lookA, lookB] = caveLookTextures();
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uCaveNoise = { value: caveNoiseTexture() };
    shader.uniforms.uCaveLookA = { value: lookA };
    shader.uniforms.uCaveLookB = { value: lookB };
    shader.uniforms.uCaveFloor = { value: caveFloorTexture() };
    shader.uniforms.uCaveTime = TIME;
    shader.uniforms.uBankRock = { value: BANK_ROCK };
    shader.uniforms.uDropRock = { value: DROP_ROCK };
    shader.uniforms.uTrailSeg = { value: TRAIL_SEGS };
    shader.uniforms.uTrailEnd = { value: TRAIL_ENDS };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCavePos;\nvarying vec3 vCaveNrm;")
      .replace("#include <defaultnormal_vertex>", "#include <defaultnormal_vertex>\nvCaveNrm = inverseTransformDirection(transformedNormal, viewMatrix);")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCavePos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SURFACE_PARS}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${SURFACE_FRAG}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${SPARKLE_FRAG}`);
  };
  m.customProgramCacheKey = () => `${prevKey()}|cave-surface${floor ? "-floor" : ""}${fine ? "-fine" : ""}`;
  m.needsUpdate = true;
}
