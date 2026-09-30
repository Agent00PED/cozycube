import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cavernsFloorY } from "@shared/worlds/caverns";
import { noRaycast } from "./kit";
import { CAVE_PEARLS, HEARTH, JOURNAL_PAGES } from "@shared/worlds/caverns";
import type { CaveEvent } from "@shared/caverns_codex";
import { BLOOM, CLOUD } from "./caveAtmosphere";
import { FIRE, TIME } from "./caveMaterials";
import { MotePoints } from "./caveLight";
import { ReadySparkles } from "./caveOres";

// The Glimmering Caverns' living cave (docs/caverns-roadmap.md phase 6; CavernsWorld.tsx): the
// overlook hearth's fire (HearthFire), the living wonders' looks (EventLooks: a Cave Cloud's mist, a
// Glimmer Bloom's flare) and the codex's finds (CaveFinds: the journal pages and the pearls).

/** The flames of the overlook's campfire: a few tongues of fire (camera-facing, additive, each its own
 *  flicker) over the builder's charred logs, embers rising, and its light on the cave round it (FIRE,
 *  in the cave's own materials). The crackle is the ambience's (audio/cavernAmbience.ts). */
const FLAMES = 6;
const FLAME_GEO = (() => {
  const g = new THREE.PlaneGeometry(1, 1, 1, 1);
  g.translate(0, 0.5, 0);
  g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: FLAMES }, (_, i) => i * 1.37)), 1));
  return g;
})();
const FLAME_MAT = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uTime: TIME },
  vertexShader: `
    attribute float aSeed;
    varying vec2 vUv;
    varying float vSeed;
    void main() {
      vUv = uv;
      vSeed = aSeed;
      // (turned to the camera: the instance's centre in view space, the quad spread in its plane)
      vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sx = length(instanceMatrix[0].xyz);
      float sy = length(instanceMatrix[1].xyz);
      c.xy += vec2(position.x * sx, position.y * sy);
      gl_Position = projectionMatrix * c;
    }`,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying float vSeed;
    void main() {
      float y = vUv.y;
      float wob = 0.1 * sin(y * 7.0 - uTime * 8.0 + vSeed * 3.0) * y;
      float w = 0.5 * (1.0 - y) * (0.8 + 0.2 * sin(uTime * 11.0 + vSeed * 5.0)) + 0.04;
      float x = abs(vUv.x - 0.5 - wob) / w;
      float body = (1.0 - smoothstep(0.45, 1.0, x)) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.55, 1.0, y));
      vec3 col = mix(vec3(1.0, 0.93, 0.55), vec3(1.0, 0.36, 0.08), smoothstep(0.05, 0.75, y + x * 0.35));
      gl_FragColor = vec4(col, body * 0.9);
    }`,
});
const EMBERS = 22;
const EMBER_COLOR = new THREE.Color("#ffb45a");
export function HearthFire() {
  const flames = useMemo(() => {
    const im = new THREE.InstancedMesh(FLAME_GEO, FLAME_MAT, FLAMES);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    im.renderOrder = 3;
    return im;
  }, []);
  const embers = useMemo(() => new MotePoints(EMBERS), []);
  useEffect(
    () => () => {
      flames.dispose();
      embers.dispose();
    },
    [flames, embers]
  );
  const seeds = useMemo(() => Array.from({ length: EMBERS }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.25, p: Math.random(), s: 0.6 + Math.random() * 0.8, w: (Math.random() - 0.5) * 0.6 })), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const y = HEARTH.y + 0.06;
    for (let i = 0; i < FLAMES; i++) {
      const a = (i / FLAMES) * Math.PI * 2 + 0.3;
      const r = i === 0 ? 0 : 0.13 + 0.05 * Math.sin(i * 2.1);
      const h = (i === 0 ? 1.25 : 0.75 + 0.25 * ((i * 0.37) % 1)) * (0.82 + 0.18 * Math.sin(t * (6 + i) + i * 1.7) * Math.sin(t * 3.3 + i));
      const w = i === 0 ? 0.55 : 0.36;
      m.makeScale(w, h, w).setPosition(HEARTH.x + Math.cos(a) * r, y, HEARTH.z + Math.sin(a) * r);
      flames.setMatrixAt(i, m);
    }
    flames.instanceMatrix.needsUpdate = true;
    // the light on the cave round it: a flicker
    FIRE.value.w = 0.85 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.05 * Math.sin(t * 17);
    for (let i = 0; i < EMBERS; i++) {
      const sd = seeds[i];
      const u = (((t * 0.35 * sd.s + sd.p) % 1) + 1) % 1;
      embers.set(i, HEARTH.x + Math.cos(sd.a) * sd.r + sd.w * u + 0.08 * Math.sin(t * 2 + i), y + 0.25 + u * 2.2, HEARTH.z + Math.sin(sd.a) * sd.r + 0.08 * Math.cos(t * 1.7 + i), 0.9 * Math.sin(Math.PI * u) * (1 - u * 0.5), EMBER_COLOR);
    }
    embers.commit();
  });
  return (
    <>
      <primitive object={flames} />
      <primitive object={embers.points} />
    </>
  );
}

/** The living wonder's looks, eased in and out (caveAtmosphere.tsx CLOUD, BLOOM): the Cloud's mist in
 *  the height mist and over the lake, the Bloom's crystals flaring. */
export function EventLooks({ ev }: { ev: CaveEvent | null }) {
  useFrame((_, dt) => {
    const now = Date.now();
    const on = (k: CaveEvent["kind"]) => (ev && ev.kind === k && now < ev.until ? 1 : 0);
    CLOUD.value += (on("cloud") - CLOUD.value) * Math.min(1, dt * 0.4);
    BLOOM.value += (on("bloom") - BLOOM.value) * Math.min(1, dt * 0.8);
  });
  useEffect(
    () => () => {
      CLOUD.value = 0;
      BLOOM.value = 0;
    },
    []
  );
  return null;
}

/** The codex's finds, where they lie until you have them (your codex: `found`): Old Flint's journal
 *  pages (the builder's `Find_Page`, one instanced draw) and a twinkle over each page and each cave
 *  pearl's basin still to find. */
const FIND_TWINKLE = new THREE.Color("#fff1c8");
export function CaveFinds({ page, found }: { page: THREE.Mesh | null; found: string[] }) {
  const pages = useMemo(() => {
    if (!page) return null;
    const im = new THREE.InstancedMesh(page.geometry, page.material as THREE.Material, JOURNAL_PAGES.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, [page]);
  const twinkles = useMemo(() => new ReadySparkles(JOURNAL_PAGES.length + CAVE_PEARLS.length), []);
  useEffect(
    () => () => {
      pages?.dispose();
      twinkles.dispose();
    },
    [pages, twinkles]
  );
  const have = useMemo(() => new Set(found), [found]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(({ clock, camera }) => {
    JOURNAL_PAGES.forEach((pg, i) => {
      const got = have.has(pg.id);
      const y = cavernsFloorY(pg.x, pg.z);
      if (pages) {
        q.setFromAxisAngle(up, i * 1.9 + 0.4);
        m.compose(v.set(pg.x, y, pg.z), q, sc.setScalar(got ? 0 : 1.6));
        pages.setMatrixAt(i, m);
      }
      if (got) twinkles.hide(i);
      else twinkles.set(i, pg.x, y + 0.35, pg.z, FIND_TWINKLE, i * 2.1);
    });
    if (pages) pages.instanceMatrix.needsUpdate = true;
    CAVE_PEARLS.forEach((pl, k) => {
      const i = JOURNAL_PAGES.length + k;
      if (have.has(pl.id)) twinkles.hide(i);
      else twinkles.set(i, pl.x, cavernsFloorY(pl.x, pl.z) + 0.3, pl.z, FIND_TWINKLE, i * 1.3);
    });
    twinkles.commit(clock.elapsedTime, (camera as THREE.OrthographicCamera).zoom ?? 1);
  });
  return (
    <>
      {pages && <primitive object={pages} />}
      <primitive object={twinkles.points} />
    </>
  );
}
