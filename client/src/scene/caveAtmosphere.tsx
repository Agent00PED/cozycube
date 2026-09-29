import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CAVERNS_LAYOUT as L, CAVE_WATER_Y, TERRAIN_CELL, TERRAIN_N, cavernsFloorY } from "@shared/worlds/caverns";
import { cameraFocus } from "./cameraFocus";
import { prospectCam } from "./prospectCamera";
import { noRaycast } from "./kit";

// The Glimmering Caverns' atmosphere, client-only (every mesh here is left out of the pointer: a click
// only ever lands on the floor, caverns_walk_collider):
//
//   the crystals' light  four small point lights (decay 2, 2.1 m) that go to the crystal clusters,
//                        the fractures' crystals and the glowing fungi nearest you, so each glows
//                        from within without a bulb of light round it (and the cavern keeps its
//                        handful of lights, whatever its crystals number)
//   the mist             a low, dark mist lying over the lower floor and the water: three thin
//                        sheets, each fading where the floor rises through it (the floor's heights in
//                        a small texture), so it never cuts a hard line
//   the frame            dark limestone stalactites hanging along the top of the view (caverns.glb's
//                        Frame_Stalactites, tiled), drifting a little faster than the cavern as the
//                        camera moves: the foreground's parallax

const CRYSTAL_LIGHTS = 4;
const CRYSTAL_REACH = 2.1;
const CYAN = new THREE.Color("#35f0ff");
const VIOLET = new THREE.Color("#b45cff");
const TEAL = new THREE.Color("#4fffd2");
const PINK = new THREE.Color("#ff7ad9");

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
      l.intensity = 3.2 * g.power * (0.88 + 0.12 * Math.sin(t * 1.3 + k * 1.7));
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

const MIST_SHEETS = [0.12, 0.45, 0.85];
const MIST_COLOR = new THREE.Color("#141923");

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
      uniforms: { uTime: { value: 0 }, uFloor: { value: tex }, uColor: { value: MIST_COLOR }, uHalf: { value: L.half }, uCell: { value: TERRAIN_CELL }, uN: { value: TERRAIN_N } },
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
        varying vec3 vW;
        void main() {
          // (the texel of each grid vertex at its middle)
          vec2 uv = ((vW.xz + uHalf) / uCell + 0.5) / uN;
          float floorY = texture2D(uFloor, uv).r * 8.0 - 3.0;
          // (how far this sheet floats over the floor: nothing where the floor rises through it)
          float over = vW.y - floorY;
          float soft = smoothstep(0.02, 0.5, over);
          float drift = 0.55 + 0.25 * sin(vW.x * 0.33 + uTime * 0.05) * sin(vW.z * 0.29 - uTime * 0.04) + 0.2 * sin((vW.x + vW.z) * 0.9 + uTime * 0.11);
          float layer = mix(0.26, 0.08, clamp((vW.y - 0.1) / 0.8, 0.0, 1.0));
          // (thinner toward the map's edges: the rim's section stays clear)
          float rim = 1.0 - smoothstep(uHalf - 3.0, uHalf, max(abs(vW.x), abs(vW.z)));
          gl_FragColor = vec4(uColor, layer * soft * drift * rim);
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

// --- the stalactite frame ------------------------------------------------------------------------------

/** The template's length (m): it tiles end to end. */
const FRAME_TILE = 12;
/** How much faster than the cavern the frame drifts as the camera moves (the foreground's parallax). */
const FRAME_PARALLAX = 0.3;

export function StalactiteFrame({ template }: { template: THREE.Mesh | null }) {
  const group = useMemo(() => {
    if (!template) return null;
    // (in the transparent pass, last of all: over the water and the mist too)
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const g = new THREE.Group();
    for (let k = -1; k <= 1; k++) {
      const m = new THREE.Mesh(template.geometry, mat);
      m.position.x = k * FRAME_TILE;
      m.raycast = noRaycast;
      m.renderOrder = 20;
      m.frustumCulled = false;
      g.add(m);
    }
    return { g, mat };
  }, [template]);
  useEffect(() => () => group?.mat.dispose(), [group]);
  const v = useMemo(() => ({ right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3() }), []);
  useFrame(({ camera }) => {
    if (!group) return;
    const cam = camera as THREE.OrthographicCamera;
    const w = (cam.right - cam.left) / cam.zoom;
    const h = (cam.top - cam.bottom) / cam.zoom;
    // (one tile a little wider than the view; the stalactites a band along its top, never lower than
    // about a ninth of the screen)
    const s = (w / FRAME_TILE) * 1.25;
    v.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    v.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    v.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const span = FRAME_TILE * s;
    const along = -cam.position.dot(v.right) * (1 + FRAME_PARALLAX);
    const offset = ((along % span) + span) % span - span / 2;
    group.g.position.copy(cam.position).addScaledVector(v.fwd, cam.near + 1).addScaledVector(v.up, h / 2).addScaledVector(v.right, offset);
    group.g.quaternion.copy(cam.quaternion);
    group.g.scale.set(s, s * 0.5, s);
    // (the prospecting close-up is kept clear)
    group.g.visible = prospectCam.blend < 0.05;
  });
  return group ? <primitive object={group.g} /> : null;
}
