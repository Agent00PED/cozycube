import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CAVERNS_LAYOUT as L, CAVE_WATER_Y, TERRAIN_CELL, TERRAIN_N, cavernsFloorY } from "@shared/worlds/caverns";
import { cameraFocus } from "./cameraFocus";
import { noRaycast } from "./kit";
import { perf } from "../systems/perfProfile";

// The Glimmering Caverns' atmosphere, client-only (every mesh here is left out of the pointer: a click
// only ever lands on the floor, caverns_walk_collider):
//
//   the crystals' light  four small point lights (decay 2, 2.1 m) that go to the crystal clusters,
//                        the fractures' crystals and the glowing fungi nearest you, so each glows
//                        from within without a bulb of light round it (and the cavern keeps its
//                        handful of lights, whatever its crystals number)
//   the mist             a thin, pale mist hovering over the cenote's water, and only there: three
//                        sheets just above its surface, each fading at the shore and wherever the
//                        floor rises through it (the floor's heights in a small texture), drifting

/** The living wonders' looks (shared/caverns_codex.ts), eased 0 .. 1 by the scene as they come and go:
 *  a Cave Cloud's mist rolling over the whole cavern, a Glimmer Bloom's crystals flaring. */
export const CLOUD = { value: 0 };
export const BLOOM = { value: 0 };

// (two on a phone: every light is paid for by every lit pixel, systems/perfProfile.ts)
const CRYSTAL_LIGHTS = perf.crystalLights;
const CRYSTAL_REACH = 2.1;
const CYAN = new THREE.Color("#00f5d4");
const VIOLET = new THREE.Color("#7b2cbf");
const TEAL = new THREE.Color("#4fffd2");
const PINK = new THREE.Color("#b98cff");

interface Glowing {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  power: number;
}

/** Every crystal cluster, fracture and fungus patch that glows (where, what colour, how strongly). */
function glowingThings(): Glowing[] {
  const out: Glowing[] = [];
  L.crystals.forEach(([x, z, s], k) => out.push({ x, z, y: cavernsFloorY(x, z) + 0.5 * s, color: k % 3 === 2 ? VIOLET : CYAN, power: 1.1 * s }));
  for (const [x, z, lean] of L.fractures) out.push({ x: x + lean * 0.45, z, y: cavernsFloorY(Math.min(x, L.half - 0.1), z) + 1.3, color: CYAN, power: 1 });
  L.shrooms.forEach(([x, z, s], k) => out.push({ x, z, y: cavernsFloorY(x, z) + 0.35 * s, color: k % 2 ? PINK : TEAL, power: 0.8 * s }));
  return out;
}

export function CrystalLights() {
  const things = useMemo(glowingThings, []);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const pick = useRef<number[]>([]);
  const next = useRef(0);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // (every quarter second: the clusters nearest where the camera looks take the lights)
    if (t >= next.current) {
      next.current = t + 0.25;
      pick.current = things
        .map((g, i) => ({ i, d: Math.hypot(g.x - cameraFocus.x, g.z - cameraFocus.z) }))
        .filter((c) => c.d < 13)
        .sort((a, b) => a.d - b.d)
        .slice(0, CRYSTAL_LIGHTS)
        .map((c) => c.i);
    }
    lights.current.forEach((l, k) => {
      if (!l) return;
      const g = things[pick.current[k] ?? -1];
      if (!g) {
        l.intensity = 0;
        return;
      }
      l.position.set(g.x, g.y, g.z);
      l.color.copy(g.color);
      l.intensity = 3.2 * g.power * (0.88 + 0.12 * Math.sin(t * 1.3 + k * 1.7)) * (1 + BLOOM.value * (1.3 + 0.7 * Math.sin(t * 2.4 + k)));
    });
  });
  return (
    <>
      {Array.from({ length: CRYSTAL_LIGHTS }, (_, k) => (
        <pointLight key={k} ref={(l) => (lights.current[k] = l)} intensity={0} distance={CRYSTAL_REACH} decay={2} castShadow={false} />
      ))}
    </>
  );
}

// --- the low mist ------------------------------------------------------------------------------------

const MIST_SHEETS = [CAVE_WATER_Y + 0.08, CAVE_WATER_Y + 0.32, CAVE_WATER_Y + 0.62];
const MIST_COLOR = new THREE.Color("#93a8b8");

/** The lake's shore (GLSL): shared/worlds/caverns.ts lakeFactor, under 1 the water. */
const LAKE_GLSL = `
float caveLakeFactor(vec2 p) {
  vec2 d = (p - vec2(${L.lake.x.toFixed(2)}, ${L.lake.z.toFixed(2)})) / vec2(${L.lake.rx.toFixed(2)}, ${L.lake.rz.toFixed(2)});
  float a = atan(d.y, d.x);
  float wob = 1.0 + 0.08 * sin(2.0 * a + 0.4) + 0.06 * sin(3.0 * a + 0.7) + 0.04 * sin(5.0 * a + 2.1) + 0.025 * sin(9.0 * a + 1.3);
  return length(d) / wob;
}`;

/** The floor's heights as a small texture (the terrain's own grid, 0.5 m a texel), for the mist. */
function floorTexture(): THREE.DataTexture {
  const n = TERRAIN_N;
  const data = new Uint8Array(n * n);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const y = Math.max(cavernsFloorY(-L.half + i * TERRAIN_CELL, -L.half + k * TERRAIN_CELL), CAVE_WATER_Y);
      data[k * n + i] = Math.max(0, Math.min(255, Math.round(((y + 3) / 8) * 255)));
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function CaveMist() {
  const { mesh, mat, tex } = useMemo(() => {
    const tex = floorTexture();
    const parts = MIST_SHEETS.map((y) => {
      const g = new THREE.PlaneGeometry(L.half * 2, L.half * 2, 1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, y, 0);
      return g;
    });
    // (the three sheets as one geometry: one draw)
    const pos: number[] = [];
    const idx: number[] = [];
    parts.forEach((g, k) => {
      const p = g.attributes.position.array as ArrayLike<number>;
      for (let i = 0; i < p.length; i++) pos.push(p[i]);
      const ix = g.index!.array as ArrayLike<number>;
      for (let i = 0; i < ix.length; i++) idx.push(ix[i] + k * 4);
      g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFloor: { value: tex }, uColor: { value: MIST_COLOR }, uHalf: { value: L.half }, uCell: { value: TERRAIN_CELL }, uN: { value: TERRAIN_N }, uWater: { value: CAVE_WATER_Y }, uCloud: CLOUD },
      vertexShader: `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform sampler2D uFloor;
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uHalf;
        uniform float uCell;
        uniform float uN;
        uniform float uWater;
        uniform float uCloud;
        varying vec3 vW;
        ${LAKE_GLSL}
        void main() {
          // (the texel of each grid vertex at its middle)
          vec2 uv = ((vW.xz + uHalf) / uCell + 0.5) / uN;
          float floorY = texture2D(uFloor, uv).r * 8.0 - 3.0;
          // (how far this sheet floats over the floor: nothing where the floor rises through it)
          float over = vW.y - floorY;
          float soft = smoothstep(0.02, 0.5, over);
          float drift = 0.55 + 0.25 * sin(vW.x * 0.33 + uTime * 0.05) * sin(vW.z * 0.29 - uTime * 0.04) + 0.2 * sin((vW.x + vW.z) * 0.9 + uTime * 0.11);
          float layer = mix(0.16, 0.05, clamp((vW.y - uWater) / 0.6, 0.0, 1.0));
          // (over the cenote only: fading out past its shore)
          float lake = 1.0 - smoothstep(0.95, 1.12, caveLakeFactor(vW.xz));
          // (a Cave Cloud: thicker, and over the low ground round the lake too)
          lake = mix(lake, max(lake, 0.7), uCloud);
          gl_FragColor = vec4(uColor, layer * soft * drift * lake * (1.0 + 1.8 * uCloud));
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.raycast = noRaycast;
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    return { mesh, mat, tex };
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mat.dispose();
      tex.dispose();
    },
    [mesh, mat, tex]
  );
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  return <primitive object={mesh} />;
}
