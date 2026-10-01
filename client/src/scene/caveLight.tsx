import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CAVE_LIGHTS, CAVE_SKYLIGHT, CAVE_SUN, DOLINE_BEAMS, cavernsFloorY, cavernsZoneAt } from "@shared/worlds/caverns";
import { noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { perf } from "../systems/perfProfile";
import { daylight } from "@shared/daynight";
import { CAVE_EXPOSURE, DAY, TIME, YOU } from "./caveMaterials";

// The Glimmering Caverns' light (CavernsWorld.tsx): the game's own lights (CaveLights: ACES under a
// balanced exposure, the navy ambient, the doline's sun and its shadows, the key light and the fill,
// the three moving point lights, the camp's day and night through the collapse), the glow round you
// in the dark zones (YourLight), the jungle's godrays and the skylight's shaft with their sunlit pools
// and motes (Godrays, MotePoints), and the dust drifting in the collapse's light (DustMotes).

/** The doline's skylight: a soft golden spot high over the jungle's broken roof, falling only on the
 *  jungle under it (its cone and penumbra), casting real shadows there (the layout's `sun`). */
const SKY_FROM = new THREE.Vector3(...CAVE_SUN.from);
const SKY_AT = new THREE.Vector3(...CAVE_SUN.at);

/** The cavern's light: a dim cool fill (the rock's own light is painted in), the sun's warm slant
 *  down the doline, and the three point lights that move: the forge's mouth flickering, the
 *  terraces' warm glow breathing, the cenote's heart pulsing. */
export function CaveLights() {
  const gl = useThree((s) => s.gl);
  const forge = useRef<THREE.PointLight>(null);
  const thermal = useRef<THREE.PointLight>(null);
  const cenote = useRef<THREE.PointLight>(null);
  const sun = useRef<THREE.SpotLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  /** The key light: from high over the collapse in the north-west, so every cliff facing the camera
   *  stands in its own shade against the lit ground over it. */
  const key = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(SKY_AT);
    return o;
  }, []);
  const fillAt = useMemo(() => new THREE.Object3D(), []);
  // ACES under a balanced exposure, and the shadow map, while you are down here (put back as you leave)
  useEffect(() => {
    const before = { tone: gl.toneMapping, exposure: gl.toneMappingExposure, shadows: gl.shadowMap.enabled, type: gl.shadowMap.type };
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = CAVE_EXPOSURE;
    // (a phone draws no shadow map: the collapse's shade is the model's baked light, systems/perfProfile.ts)
    if (perf.shadows) {
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
      gl.shadowMap.needsUpdate = true;
    }
    return () => {
      gl.toneMapping = before.tone;
      gl.toneMappingExposure = before.exposure;
      gl.shadowMap.enabled = before.shadows;
      gl.shadowMap.type = before.type;
      gl.shadowMap.needsUpdate = true;
    };
  }, [gl]);
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.target = target;
    const c = l.shadow.camera;
    c.near = 4;
    c.far = 30;
    c.updateProjectionMatrix();
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.bias = -0.0001;
    l.shadow.normalBias = 0.02;
    l.shadow.radius = 3;
  }, [target]);
  // the sun's shadow map: only the cave's own rock casts it (nothing that moves), so it is drawn while
  // the model settles in and then only now and then, never every frame
  const shadowAt = useRef({ start: -1, last: -99 });
  useFrame(({ clock, camera }) => {
    // the sun over the collapse on the camp's day: a warm gold by day, a cool silver moon by night
    const d = daylight(Date.now());
    DAY.value = d;
    if (sun.current) {
      const l = sun.current;
      l.color.copy(MOON_COLOR).lerp(SUN_COLOR, d);
      l.intensity = 0.95 + 1.65 * d;
      if (l.shadow.autoUpdate) l.shadow.autoUpdate = false;
      const ct = clock.elapsedTime;
      if (shadowAt.current.start < 0) shadowAt.current.start = ct;
      if (ct - shadowAt.current.start < 4 || ct - shadowAt.current.last > 3) {
        shadowAt.current.last = ct;
        l.shadow.needsUpdate = true;
      }
    }
    // (the soft fill from over your shoulder: the folk and the players are never silhouettes)
    if (fill.current) {
      fill.current.target = fillAt;
      fillAt.position.set(cameraFocus.x, cameraFocus.y + 0.8, cameraFocus.z);
      fill.current.position.copy(camera.position);
    }
    if (key.current) {
      key.current.target = fillAt;
      key.current.position.set(cameraFocus.x - 6, cameraFocus.y + 12, cameraFocus.z - 5);
    }
    // (the canvas's own configuration turns the shadow map off again on any re-render of it: held on
    // here, a frame at a time, before anything is drawn)
    if (perf.shadows && !gl.shadowMap.enabled) {
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
      gl.shadowMap.needsUpdate = true;
      if (sun.current) sun.current.shadow.needsUpdate = true;
    }
    const t = clock.elapsedTime;
    if (forge.current) forge.current.intensity = 2.6 + 0.6 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.3 * Math.sin(t * 17);
    if (thermal.current) thermal.current.intensity = 1.5 + 0.2 * Math.sin(t * 0.7);
    if (cenote.current) cenote.current.intensity = 1.9 + 0.45 * Math.sin(t * 0.9);
  });
  return (
    <>
      {/* (a deep cool navy penumbra: the rock's faces away from every light sink into it) */}
      <ambientLight color="#161c26" intensity={0.28} />
      <hemisphereLight args={["#161c26", "#0d0f13", 0.28]} />
      <primitive object={target} />
      <spotLight ref={sun} color="#ffd79c" intensity={2.6} distance={0} decay={0} angle={0.62} penumbra={0.75} position={SKY_FROM.toArray()} castShadow={perf.shadows} />
      <primitive object={fillAt} />
      <directionalLight ref={fill} color="#dde4f4" intensity={0.5} castShadow={false} />
      <directionalLight ref={key} color="#fff0d8" intensity={0.6} castShadow={false} />
      <pointLight ref={forge} color="#ff8a3a" distance={11} decay={1.4} position={CAVE_LIGHTS.forge as [number, number, number]} castShadow={false} />
      <pointLight ref={thermal} color="#ffc78a" distance={9} decay={1.5} position={CAVE_LIGHTS.thermal as [number, number, number]} castShadow={false} />
      <pointLight ref={cenote} color="#3ff0ff" distance={13} decay={1.3} position={CAVE_LIGHTS.cenote as [number, number, number]} castShadow={false} />
      <YourLight />
    </>
  );
}
const SUN_COLOR = new THREE.Color("#ffd79c");
const MOON_COLOR = new THREE.Color("#a9c2ff");

/** How dark each zone is away from its own lights (0 lit .. 1 dark): the light round you there. */
const ZONE_DARK: Record<string, number> = { basecamp: 0.1, jungle: 0, breakdown: 0.35, mudflats: 0.5, terraces: 0.2, overlook: 0.4, lake: 0.6, rift: 0.9 };
/** The warm glow round you in the dark zones (a lamp's at your shoulder: `YOU` in the cave's
 *  materials), eased in and out as you walk between them; the jungle dark too once the sun is down. */
function YourLight() {
  const level = useRef(0);
  useFrame((_, dt) => {
    const zone = cavernsZoneAt(cameraFocus.x, cameraFocus.z)?.id ?? "lake";
    const dark = zone === "jungle" ? 0.55 * (1 - DAY.value) : (ZONE_DARK[zone] ?? 0.5);
    level.current += (dark - level.current) * Math.min(1, dt * 1.5);
    YOU.value.set(cameraFocus.x, cameraFocus.y, cameraFocus.z, level.current);
  });
  return null;
}

// The godrays: soft shafts of sunlight pouring down through the doline's broken ceiling, and the
// skylight's over the islet; one instanced open cylinder, additive, its edges and its ends fading (no
// depth write: never a hard edge), a faint shimmer running down it. Dust drifts in each.
const RAY_TOP = 13.5;
const RAY_TILT = 0.16;
const RAY_GEO = (() => {
  const g = new THREE.CylinderGeometry(1, 1.3, 1, 24, 1, true);
  g.translate(0, 0.5, 0);
  return g;
})();
const RAY_MAT = new THREE.ShaderMaterial({
  uniforms: { uTime: TIME, uDay: DAY },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: `
    varying float vUp;
    varying float vFace;
    varying vec3 vRayPos;
    void main() {
      vec4 p = vec4(position, 1.0);
      vec3 n = normal;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        n = mat3(instanceMatrix) * n;
      #endif
      vUp = position.y;
      vRayPos = p.xyz;
      vec3 nv = normalize(normalMatrix * n);
      vFace = abs(nv.z);
      gl_Position = projectionMatrix * modelViewMatrix * p;
    }`,
  fragmentShader: `
    uniform float uTime;
    uniform float uDay;
    varying float vUp;
    varying float vFace;
    varying vec3 vRayPos;
    void main() {
      // (soft all round: a long fade at each end, a gentle falloff to its edges, a slow breath)
      float ends = smoothstep(0.0, 0.14, vUp) * (1.0 - smoothstep(0.42, 1.0, vUp));
      float core = pow(vFace, 1.2) * smoothstep(0.0, 0.35, vFace);
      float shimmer = 0.82 + 0.18 * sin(vRayPos.y * 2.3 - uTime * 1.1 + vRayPos.x * 0.7);
      float breath = 0.85 + 0.15 * sin(uTime * 0.35 + vRayPos.x * 0.5 + vRayPos.z * 0.3);
      float a = ends * core * shimmer * breath * 0.095 * mix(0.55, 1.0, uDay);
      gl_FragColor = vec4(mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.9, 0.68), uDay), a);
    }`,
});
const RAYS = [...DOLINE_BEAMS.map(([x, z, r]) => ({ x, z, r, sky: false })), { x: CAVE_SKYLIGHT.x, z: CAVE_SKYLIGHT.z, r: CAVE_SKYLIGHT.r * 0.72, sky: true }];
// where each shaft lands: a soft warm pool of sunlight on the floor (additive, fading to its rim)
const POOL_GEO = (() => {
  const g = new THREE.CircleGeometry(1, 32);
  g.rotateX(-Math.PI / 2);
  return g;
})();
const POOL_MAT = new THREE.ShaderMaterial({
  uniforms: { uTime: TIME, uDay: DAY },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    varying vec2 vDisc;
    void main() {
      vDisc = position.xz;
      vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p;
    }`,
  fragmentShader: `
    uniform float uTime;
    uniform float uDay;
    varying vec2 vDisc;
    void main() {
      float r = length(vDisc);
      float a = (1.0 - smoothstep(0.2, 1.0, r)) * (0.065 + 0.012 * sin(uTime * 0.8 + vDisc.x * 3.0)) * mix(0.6, 1.0, uDay);
      gl_FragColor = vec4(mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.88, 0.62), uDay), a);
    }`,
});
const MOTES_PER_RAY = 10;

export function Godrays() {
  const rays = useMemo(() => {
    const im = new THREE.InstancedMesh(RAY_GEO, RAY_MAT, RAYS.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    im.renderOrder = 2;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-RAY_TILT, 0, 0));
    RAYS.forEach((r, i) => {
      const y = cavernsFloorY(r.x, r.z) - 0.05;
      m.compose(new THREE.Vector3(r.x, y, r.z), q, new THREE.Vector3(r.r, RAY_TOP - y, r.r));
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, []);
  const pools = useMemo(() => {
    const im = new THREE.InstancedMesh(POOL_GEO, POOL_MAT, RAYS.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    im.renderOrder = 1;
    const m = new THREE.Matrix4();
    RAYS.forEach((r, i) => {
      m.makeScale(r.r * 1.25, 1, r.r * 1.25).setPosition(r.x, cavernsFloorY(r.x, r.z) + 0.04, r.z);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, []);
  // the dust in the light: slow motes drifting down each shaft, sparkling as they turn
  const motes = useMemo(() => new MotePoints(RAYS.length * MOTES_PER_RAY), []);
  const seeds = useMemo(() => RAYS.flatMap((r) => Array.from({ length: MOTES_PER_RAY }, () => ({ r, a: Math.random() * Math.PI * 2, d: Math.sqrt(Math.random()) * r.r * 0.8, p: Math.random(), s: 0.4 + Math.random() * 0.5 }))), []);
  useEffect(
    () => () => {
      rays.dispose();
      pools.dispose();
      motes.dispose();
    },
    [rays, pools, motes]
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const k = (((sd.p - t * 0.03 * sd.s) % 1) + 1) % 1;
      const floor = cavernsFloorY(sd.r.x, sd.r.z);
      const y = floor + 0.3 + k * 5.5;
      const a = sd.a + t * 0.15 * sd.s;
      // (the shaft leans with its tilt, its top toward the doline's broken north: the higher, the further)
      const lean = (y - floor) * Math.tan(RAY_TILT);
      motes.set(i, sd.r.x + Math.cos(a) * sd.d, y, sd.r.z - lean + Math.sin(a) * sd.d, 0.55 + 0.45 * Math.sin(t * 2 + i), MOTE_SUN);
    });
    motes.commit();
  });
  return (
    <>
      <primitive object={pools} />
      <primitive object={rays} />
      <primitive object={motes.points} />
    </>
  );
}

const MOTE_SUN = new THREE.Color("#ffe7b0");
/** Little soft round motes (one draw for many): each its place, its brightness and its colour. */
export class MotePoints {
  points: THREE.Points;
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  constructor(n: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3).fill(-100), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute("position", this.pos);
    geo.setAttribute("aCol", this.col);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: `
        attribute vec4 aCol;
        uniform float uPx;
        varying vec4 vCol;
        void main() {
          vCol = aCol;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 4.5 * uPx;
        }`,
      fragmentShader: `
        varying vec4 vCol;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.2, 1.0, r)) * vCol.a;
          gl_FragColor = vec4(vCol.rgb, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.raycast = noRaycast;
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  set(i: number, x: number, y: number, z: number, alpha: number, c: THREE.Color) {
    this.pos.setXYZ(i, x, y, z);
    this.col.setXYZW(i, c.r, c.g, c.b, alpha);
  }
  hide(i: number) {
    this.pos.setXYZ(i, 0, -100, 0);
    this.col.setW(i, 0);
  }
  commit() {
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
  }
  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Dust drifting in the light over the breakdown and the basecamp (the collapse's), slow and pale. */
const DUST_MOTES = 70;
const DUST_COLOR = new THREE.Color("#fff1d6");
export function DustMotes() {
  const motes = useMemo(() => new MotePoints(DUST_MOTES), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: DUST_MOTES }, (_, i) => {
        const east = i % 2 === 0;
        const x = east ? 9.5 + Math.random() * 11.5 : -6.5 + Math.random() * 14;
        const z = -21 + Math.random() * 8;
        return { x, z, y: cavernsFloorY(x, z) + 0.6 + Math.random() * 3.4, a: Math.random() * 6.283, s: 0.3 + Math.random() * 0.5, p: Math.random() * 10 };
      }),
    []
  );
  useEffect(() => () => motes.dispose(), [motes]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((d, i) => {
      const a = d.a + t * 0.05 * d.s;
      const bob = Math.sin(t * 0.3 * d.s + d.p);
      motes.set(i, d.x + Math.cos(a) * 0.8, d.y + bob * 0.35, d.z + Math.sin(a) * 0.8, 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.7 + d.p)), DUST_COLOR);
    });
    motes.commit();
  });
  return <primitive object={motes.points} />;
}

// --- dust in your light (docs/caverns-roadmap.md R2.10) -------------------------------------------------

const LAMP_DUST = 44;
const LAMP_DUST_COLOR = new THREE.Color("#ffd9a8");
/** Dust hanging in the air round you in the dark zones, lit by the glow at your shoulder (YOU): motes
 *  drifting slowly within a few metres of you, only as bright as that glow is. */
export function LampDust() {
  const motes = useMemo(() => new MotePoints(LAMP_DUST), []);
  const seeds = useMemo(() => Array.from({ length: LAMP_DUST }, (_, i) => ({ a: (i * 2.39996) % (Math.PI * 2), r: 0.6 + ((i * 0.618) % 1) * 2.6, h: 0.2 + ((i * 0.37) % 1) * 2.0, s: 0.2 + ((i * 0.53) % 1) * 0.5, p: i * 1.31 })), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const glow = YOU.value.w;
    for (let i = 0; i < LAMP_DUST; i++) {
      const sd = seeds[i];
      if (glow < 0.05) {
        motes.hide(i);
        continue;
      }
      const a = sd.a + t * 0.05 * sd.s;
      const x = YOU.value.x + Math.cos(a) * sd.r + 0.3 * Math.sin(t * 0.3 * sd.s + sd.p);
      const z = YOU.value.z + Math.sin(a) * sd.r + 0.3 * Math.cos(t * 0.27 * sd.s + sd.p);
      const y = YOU.value.y + sd.h + 0.25 * Math.sin(t * 0.4 * sd.s + sd.p);
      const near = 1 - Math.min(1, sd.r / 3.4);
      motes.set(i, x, y, z, glow * (0.25 + 0.5 * near) * (0.6 + 0.4 * Math.sin(t * 1.3 + sd.p)), LAMP_DUST_COLOR);
    }
    motes.commit();
  });
  return <primitive object={motes.points} />;
}
