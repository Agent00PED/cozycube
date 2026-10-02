import { useContext, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { instanced, template } from "./faunaKit";
import { CampDaylightContext } from "./campDay";
import { cameraFocus } from "./cameraFocus";
import { noRaycast } from "./kit";

// The camp maps' small motions (the campfire and the woods): cloud shadows drifting over the ground,
// leaves coming down under the leafy trees, rings where a fish rises, mist on the river at dawn and
// dusk, moths round the lanterns, smoke off a chimney, a flight of birds crossing overhead, frogs on
// the lily pads. All client-side, nothing synced; one instanced draw each.

// --- cloud shadows --------------------------------------------------------------------------------

/** The clouds' clock and how much day there is (set each frame by `CloudClock`). */
const CLOUD = { t: { value: 0 }, day: { value: 0 } };

/** Soft shadows of clouds drifting over whatever `m` paints (the ground, the clay): by day only. */
export function cloudShadows(m: THREE.Material) {
  if (m.userData.cloudShadows) return;
  m.userData.cloudShadows = true;
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uCloudT = CLOUD.t;
    shader.uniforms.uCloudDay = CLOUD.day;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vCloudXZ;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 cloudWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cloudWorld = instanceMatrix * cloudWorld;
      #endif
      vCloudXZ = (modelMatrix * cloudWorld).xz;`
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vCloudXZ;
        uniform float uCloudT;
        uniform float uCloudDay;
        float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cloudNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 cloudP = vCloudXZ * 0.06 + vec2(uCloudT * 0.011, uCloudT * 0.006);
        float cloudN = 0.65 * cloudNoise(cloudP) + 0.35 * cloudNoise(cloudP * 2.3 + 7.0);
        diffuseColor.rgb *= 1.0 - 0.2 * uCloudDay * smoothstep(0.5, 0.72, cloudN);`
      );
  };
  m.customProgramCacheKey = () => prevKey() + "|clouds";
  m.needsUpdate = true;
}

/** Moves the clouds. */
export function CloudClock() {
  const daylight = useContext(CampDaylightContext) ?? 1;
  useFrame((_, dt) => {
    CLOUD.t.value += Math.min(dt, 0.1);
    CLOUD.day.value = daylight;
  });
  return null;
}

// --- falling leaves -------------------------------------------------------------------------------

export interface LeafTree {
  x: number;
  z: number;
  /** The ground it stands on, how far its crown reaches and how high its crown hangs. */
  y: number;
  r: number;
  top: number;
  tints: string[];
}
const LEAF_GEO = new THREE.PlaneGeometry(0.12, 0.075);
const LEAF_MAT = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
const LEAVES_PER_TREE = 3;

/** Leaves letting go of the leafy trees and tumbling down, a few at a time under each. */
export function FallingLeaves({ trees }: { trees: LeafTree[] }) {
  const count = trees.length * LEAVES_PER_TREE;
  const mesh = useMemo(() => {
    if (!count) return null;
    const m = new THREE.InstancedMesh(LEAF_GEO, LEAF_MAT, count);
    m.frustumCulled = false;
    m.raycast = noRaycast;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = trees[Math.floor(i / LEAVES_PER_TREE)];
      m.setColorAt(i, c.set(t.tints[i % t.tints.length]));
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return m;
  }, [trees, count]);
  useEffect(
    () => () => {
      mesh?.dispose();
    },
    [mesh]
  );
  const seeds = useMemo(() => Array.from({ length: count }, () => ({ p: Math.random(), a: Math.random() * 6.283, d: 0.25 + 0.75 * Math.random(), fall: 6 + Math.random() * 6, spin: 1.5 + Math.random() * 2.5, sway: 0.25 + Math.random() * 0.35 })), [count]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), pos: new THREE.Vector3(), scl: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    if (!mesh) return;
    const t = clock.elapsedTime;
    const { m, q, e, pos, scl } = tmp;
    seeds.forEach((s, i) => {
      const tree = trees[Math.floor(i / LEAVES_PER_TREE)];
      // (each leaf falls for a third of its cycle, and waits on the tree for the rest)
      const u = ((t / s.fall + s.p) % 1) * 3;
      const k = u < 1 ? Math.sin(Math.min(1, u * 8) * Math.PI * 0.5) * Math.min(1, (1 - u) * 6) : 0;
      const drift = Math.sin(t * 1.3 + s.a) * s.sway * u;
      pos.set(tree.x + Math.cos(s.a) * tree.r * s.d + drift, tree.y + 0.04 + (tree.top - 0.04) * (1 - Math.min(1, u)), tree.z + Math.sin(s.a) * tree.r * s.d + Math.cos(t * 1.1 + s.a) * s.sway * u);
      q.setFromEuler(e.set(t * s.spin + s.a, t * s.spin * 0.7, s.a));
      m.compose(pos, q, scl.setScalar(k));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh ? <primitive object={mesh} /> : null;
}

// --- a fish rising --------------------------------------------------------------------------------

const RING_GEO = new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2);
const RING_MAT = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const RINGS = 5;
const RING_S = 2.6;

/** Rings spreading on the water where a fish comes up, here and there along the river. */
export function RiseRings({ spots, waterY }: { spots: [number, number][]; waterY: number }) {
  const daylight = useContext(CampDaylightContext) ?? 1;
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(RING_GEO, RING_MAT, RINGS * 2);
    m.frustumCulled = false;
    m.raycast = noRaycast;
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh]
  );
  const rings = useMemo(() => Array.from({ length: RINGS }, (_, i) => ({ at: -99, next: 2 + i * 2.3 + Math.random() * 4, x: 0, z: 0 })), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), c: new THREE.Color() }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!spots.length) return;
    const { m, q, pos, scl, c } = tmp;
    const glow = 0.1 + 0.16 * daylight;
    rings.forEach((r, i) => {
      if (t > r.next) {
        const [x, z] = spots[Math.floor(Math.random() * spots.length)];
        Object.assign(r, { at: t, next: t + 5 + Math.random() * 9, x: x + (Math.random() - 0.5) * 0.5, z: z + (Math.random() - 0.5) * 0.5 });
      }
      // (two rings a rise, the second a beat behind)
      for (let k = 0; k < 2; k++) {
        const u = (t - r.at - k * 0.45) / RING_S;
        const on = u > 0 && u < 1;
        const s = on ? 0.08 + 0.55 * u : 0.0001;
        m.compose(pos.set(r.x, waterY + 0.012, r.z), q, scl.set(s, 1, s));
        mesh.setMatrixAt(i * 2 + k, m);
        mesh.setColorAt(i * 2 + k, c.setScalar(on ? glow * (1 - u) * (1 - u) : 0));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

// --- mist on the water ----------------------------------------------------------------------------

let mistTexture: THREE.CanvasTexture | null = null;
function softDisc() {
  if (mistTexture) return mistTexture;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  mistTexture = new THREE.CanvasTexture(cv);
  return mistTexture;
}
const MIST_GEO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

/** A low mist lying on the river at dawn and dusk, thinner through the night, gone by day. */
export function RiverMist({ spots, waterY }: { spots: [number, number, number][]; waterY: number }) {
  const daylight = useContext(CampDaylightContext) ?? 1;
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: softDisc(), color: "#dfe8f2", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(MIST_GEO, mat, Math.max(1, spots.length));
    m.frustumCulled = false;
    m.raycast = noRaycast;
    m.renderOrder = 3;
    return m;
  }, [spots, mat]);
  useEffect(
    () => () => {
      mesh.dispose();
      mat.dispose();
    },
    [mesh, mat]
  );
  const seeds = useMemo(() => spots.map(() => ({ p: Math.random() * 6.283, s: 0.8 + Math.random() * 0.5, lift: Math.random() * 0.22 })), [spots]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    // (thickest as the light turns: 4 d (1 - d) peaks at dawn and dusk)
    const strength = Math.max(4 * daylight * (1 - daylight), 0.3 * (1 - daylight));
    mat.opacity = 0.34 * strength;
    mesh.visible = strength > 0.03;
    if (!mesh.visible) return;
    const t = clock.elapsedTime;
    const { m, q, pos, scl } = tmp;
    spots.forEach(([x, z, w], i) => {
      const s = seeds[i];
      const r = (w + 0.7) * s.s * (1 + 0.08 * Math.sin(t * 0.21 + s.p));
      m.compose(pos.set(x + Math.sin(t * 0.07 + s.p) * 0.5, waterY + 0.14 + s.lift, z + Math.cos(t * 0.05 + s.p) * 0.6), q, scl.set(r, 1, r * 1.25));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

// --- moths at the lanterns ------------------------------------------------------------------------

const MOTH_GEO = new THREE.SphereGeometry(0.018, 5, 4);
const MOTH_MAT = new THREE.MeshBasicMaterial({ color: "#efe6cf", toneMapped: false });
const MOTHS_PER_LAMP = 3;

/** Moths circling each lantern after dark. */
export function LanternMoths({ lamps }: { lamps: { x: number; y: number; z: number }[] }) {
  const daylight = useContext(CampDaylightContext) ?? 1;
  const count = lamps.length * MOTHS_PER_LAMP;
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(MOTH_GEO, MOTH_MAT, Math.max(1, count));
    m.frustumCulled = false;
    m.raycast = noRaycast;
    return m;
  }, [count]);
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh]
  );
  const seeds = useMemo(() => Array.from({ length: count }, () => ({ p: Math.random() * 6.283, w: 2.2 + Math.random() * 2.4, r: 0.14 + Math.random() * 0.22, dir: Math.random() < 0.5 ? 1 : -1 })), [count]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const night = 1 - daylight;
    mesh.visible = night > 0.35 && count > 0;
    if (!mesh.visible) return;
    const t = clock.elapsedTime;
    const { m, q, pos, scl } = tmp;
    seeds.forEach((s, i) => {
      const lamp = lamps[Math.floor(i / MOTHS_PER_LAMP)];
      const a = t * s.w * s.dir + s.p;
      // (never a tidy orbit: the radius and the height flutter)
      const r = s.r * (1 + 0.45 * Math.sin(t * 5.1 + s.p * 3));
      m.compose(pos.set(lamp.x + Math.cos(a) * r, lamp.y + 0.1 * Math.sin(t * 6.3 + s.p) + 0.06 * Math.sin(t * 2.1 + s.p * 2), lamp.z + Math.sin(a) * r), q, scl.setScalar(Math.min(1, (night - 0.35) * 4)));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

// --- chimney smoke --------------------------------------------------------------------------------

const PUFF_GEO = new THREE.SphereGeometry(1, 8, 6);
const PUFFS = 9;
const PUFF_S = 6.5;

/** A thin column of smoke off a chimney: puffs rising, widening and thinning away. */
export function ChimneySmoke({ at }: { at: [number, number, number] }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#a9a4b0", transparent: true, opacity: 0.12, depthWrite: false }), []);
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(PUFF_GEO, mat, PUFFS);
    m.frustumCulled = false;
    m.raycast = noRaycast;
    return m;
  }, [mat]);
  useEffect(
    () => () => {
      mesh.dispose();
      mat.dispose();
    },
    [mesh, mat]
  );
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const { m, q, pos, scl } = tmp;
    for (let i = 0; i < PUFFS; i++) {
      const u = (t / PUFF_S + i / PUFFS) % 1;
      // (born small at the pot, widest two thirds up, gone at the top)
      const s = (0.07 + 0.3 * u) * Math.sin(Math.min(1, u * 5) * Math.PI * 0.5) * Math.min(1, (1 - u) * 2.2);
      m.compose(pos.set(at[0] + 0.5 * u * u + 0.07 * Math.sin(t * 0.9 + i * 2.1), at[1] + 2.4 * u, at[2] - 0.3 * u * u + 0.07 * Math.cos(t * 0.7 + i * 1.7)), q, scl.setScalar(Math.max(0.0001, s)));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

// --- birds crossing overhead ----------------------------------------------------------------------

const FLOCK = 3;
const CROSS_S = 11;

/** Now and then, by day, three birds cross high over the map in a loose line (the model's own
 *  songbird templates: `prefix`_Body, _WingL, _WingR). */
export function Flyover({ scene, half, prefix = "Fauna_Bird" }: { scene: THREE.Object3D; half: number; prefix?: string }) {
  const daylight = useContext(CampDaylightContext) ?? 1;
  const parts = useMemo(() => ["Body", "WingL", "WingR"].map((n) => instanced(template(scene, `${prefix}_${n}`), FLOCK, ["#3d3a45", "#4a4038", "#35404a"])), [scene, prefix]);
  useEffect(
    () => () => {
      for (const p of parts) p?.mesh.dispose();
    },
    [parts]
  );
  const pass = useMemo(() => ({ at: -99, next: 14 + Math.random() * 20, a: 0, off: 0, y: 10 }), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1), rot: new THREE.Matrix4() }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t > pass.next) Object.assign(pass, { at: t, next: t + 45 + Math.random() * 50, a: Math.random() * 6.283, off: (Math.random() - 0.5) * half, y: 8.5 + Math.random() * 3 });
    const u = (t - pass.at) / CROSS_S;
    const on = daylight > 0.3 && u > 0 && u < 1;
    for (const p of parts) if (p) p.mesh.visible = on;
    if (!on) return;
    const { m, w, q, pos, scl, up, fwd, rot } = tmp;
    const dx = Math.sin(pass.a);
    const dz = Math.cos(pass.a);
    const reach = half * 1.7;
    q.setFromAxisAngle(up, pass.a);
    for (let i = 0; i < FLOCK; i++) {
      // (a loose line astern: each a little behind and to one side of the one before)
      const along = (u * 2 - 1) * reach - i * 1.3;
      const side = pass.off + (i - 1) * 0.9;
      m.compose(pos.set(dx * along + dz * side, pass.y + 0.25 * Math.sin(t * 1.7 + i), dz * along - dx * side), q, scl.setScalar(2.1));
      const flap = 0.15 + Math.abs(Math.sin(t * 9 + i * 1.3)) * 0.95;
      parts[0]?.mesh.setMatrixAt(i, w.copy(m).multiply(parts[0].t.matrix));
      if (parts[1]) parts[1].mesh.setMatrixAt(i, w.copy(m).multiply(parts[1].t.matrix).multiply(rot.makeRotationAxis(fwd, flap)));
      if (parts[2]) parts[2].mesh.setMatrixAt(i, w.copy(m).multiply(parts[2].t.matrix).multiply(rot.makeRotationAxis(fwd, -flap)));
    }
    for (const p of parts) if (p) p.mesh.instanceMatrix.needsUpdate = true;
  });
  return <>{parts.map((p, i) => (p ? <primitive key={i} object={p.mesh} /> : null))}</>;
}

// --- frogs on the lily pads -------------------------------------------------------------------------

/** How near you come before a frog jumps in, how long its leap takes, and how long it keeps under. */
const FROG_SHY = 2.3;
const FROG_LEAP_S = 0.5;
const FROG_UNDER_S = [9, 17] as const;
const FROG_TINTS = ["#ffffff", "#eaf6cf", "#d7ecd9", "#f6f2c4"];

/** Frogs sitting on the river's lily pads (the model's template `name`, one instanced draw): each
 *  breathes, turns with a little hop now and then, leaps into the water when you come near and
 *  climbs back out once you have gone. */
export function Frogs({ scene, name, spots, waterY }: { scene: THREE.Object3D; name: string; spots: [number, number][]; waterY: number }) {
  const part = useMemo(() => instanced(template(scene, name), spots.length, FROG_TINTS), [scene, name, spots]);
  useEffect(
    () => () => {
      part?.mesh.dispose();
    },
    [part]
  );
  const frogs = useMemo(
    () => spots.map(([x, z], i) => ({ x, z, yaw: (i * 2.4) % 6.283, turn: 0, phase: "sit" as "sit" | "leap" | "under" | "back", at: -99, hop: 3 + Math.random() * 8, wait: 0, dx: 0, dz: 1 })),
    [spots]
  );
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(({ clock }) => {
    if (!part) return;
    const t = clock.elapsedTime;
    const { m, q, pos, scl, up } = tmp;
    frogs.forEach((f, i) => {
      const near = Math.hypot(cameraFocus.x - f.x, cameraFocus.z - f.z);
      const since = t - f.at;
      if (f.phase === "sit" && near < FROG_SHY) {
        // away from whoever came, out over the water
        const d = near || 1;
        Object.assign(f, { phase: "leap", at: t, dx: (f.x - cameraFocus.x) / d, dz: (f.z - cameraFocus.z) / d, wait: FROG_UNDER_S[0] + Math.random() * (FROG_UNDER_S[1] - FROG_UNDER_S[0]) });
        f.yaw = Math.atan2(f.dx, f.dz);
      } else if (f.phase === "leap" && since > FROG_LEAP_S) Object.assign(f, { phase: "under", at: t });
      else if (f.phase === "under" && since > f.wait && near > FROG_SHY + 1.5) Object.assign(f, { phase: "back", at: t });
      else if (f.phase === "back" && since > 0.4) Object.assign(f, { phase: "sit", at: t, hop: t + 4 + Math.random() * 9 });
      else if (f.phase === "sit" && t > f.hop) Object.assign(f, { hop: t + 5 + Math.random() * 11, turn: t, yaw: f.yaw + (Math.random() - 0.5) * 2.4 });
      let x = f.x;
      let y = waterY + 0.022;
      let z = f.z;
      let s = 1.7;
      let squash = 1 + 0.035 * Math.sin(t * 2.6 + i * 1.7);
      if (f.phase === "leap") {
        const u = Math.min(1, since / FROG_LEAP_S);
        x += f.dx * 0.55 * u;
        z += f.dz * 0.55 * u;
        y += 0.3 * Math.sin(Math.PI * u) - 0.1 * u;
        s *= 1 - 0.5 * u * u;
        squash = 1.15;
      } else if (f.phase === "under") s = 0.0001;
      else if (f.phase === "back") s *= Math.min(1, since / 0.4);
      else {
        // (a little hop as it turns)
        const h = (t - f.turn) / 0.3;
        if (h > 0 && h < 1) y += 0.07 * Math.sin(Math.PI * h);
      }
      q.setFromAxisAngle(up, f.yaw);
      m.compose(pos.set(x, y, z), q, scl.set(s, s * squash, s));
      part.mesh.setMatrixAt(i, m.multiply(part.t.matrix));
    });
    part.mesh.instanceMatrix.needsUpdate = true;
  });
  return part ? <primitive object={part.mesh} /> : null;
}
