import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PlayerState, TimeOfDay, ToggleableSyncState } from "@shared/types";
import { CAMPFIRE_LAYOUT as L, DOCK_PILINGS, DUCK_PATHS, RIVER_Z, riverSpan } from "@shared/worlds/campfire";
import { ModelBoundary } from "../entities/ModelBoundary";
import { GEO, matte, noRaycast } from "./kit";
import { TimeOfDayContext, useLampBoost } from "./timeOfDay";
import { STRING_BULBS, STRING_SWING, bindCampfireLife, duckPose } from "./campfireLife";

// The Starlight Campfire (map 2). The island itself is one Blender model, campfire.glb
// (scripts/blender/build_campfire.py, laid out from shared/worlds/campfire.ts); this file loads it
// and brings it to life (the wildlife, the canoe, the swaying strings, the river's flow and the
// pines' sway are campfireLife.ts):
//
//   the fire      its two flame nodes flicker and breathe over a flickering orange point light,
//                 and roar up for a minute when someone splits a log for it (the bonfire's boost)
//   smoke         soft puffs rising off it and drifting away on the night wind
//   embers        sparks lifting off the fire and winking out
//   fireflies     green-gold, drifting and blinking over the river, the pines and the hammock
//   stars         a field of them round the floating island
//   string lights warm bulbs strung between the tipi, a pole, the pines and the camper's awning,
//                 and along the front fence: each bulb has a soft glow, and a few warm lights
//                 light the ground under them
//   the river     foam rings round the dock's pilings and the paddling ducks
//   the lanterns  on the dock's river corners and the picnic table, glowing
//   the sky       a midnight-navy gradient (CampfireSky), with a cool moon over the island
//
// It is always night at the campfire (WorldScene wears the "night" hour here whatever the room's
// clock says). Walking is a flat invisible plane over the island (the model never takes clicks),
// as the lounge's floor is. No light casts a shadow; the effects are one instanced draw each.

export const CAMPFIRE_URL = "/models/campfire.glb";

const FIRE_COLOR = "#ff8c32";
/** The fire's light at its base; every lamp is scaled by the hour's lamp boost (x2.2 at night). */
const FIRE_INTENSITY = 2.8;
/** The ground decals (moss patches, paths, the clearing), each nudged toward the camera in the
 *  depth test by its own polygon offset on top of its few millimetres of height: never a flicker. */
const DECAL_OFFSET: Record<string, number> = { CF_GrassDark: -1, CF_GrassLight: -1, CF_Dirt: -2 };
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/** How much of the night's magic shows at each hour (fireflies, stars). */
const NIGHTNESS: Record<TimeOfDay, number> = { night: 1, sunset: 0.6, sunrise: 0.25, day: 0 };

/** How fed the fire is right now, 0..1: a clean split at the chopping block sets the bonfire's
 *  boost (BONFIRE_FUEL_SECONDS), and the flames, its light, the embers and the smoke all swell. */
const FUEL = { value: 0 };

interface Live {
  players: Record<string, PlayerState>;
  toggleables: Record<string, ToggleableSyncState>;
}

export function CampfireWorld({ onFloorClick, players, toggleables }: { onFloorClick: (x: number, z: number) => void } & Live) {
  // the latest state for the frame loop, without re-rendering the island on every change
  const live = useRef<Live>({ players, toggleables });
  live.current = { players, toggleables };
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  useFrame((_, dt) => {
    const fire = Object.values(live.current.toggleables).find((p) => p.kind === "bonfire");
    const want = fire && fire.boost > 0 ? Math.min(1, fire.boost / 4) : 0;
    FUEL.value += (want - FUEL.value) * Math.min(1, dt * 1.5);
  });
  return (
    <group>
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[L.half * 2, L.half * 2, 1]} onPointerDown={floorClick} />
      <ModelBoundary what="campfire.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <CampfireModel live={live} />
        </Suspense>
      </ModelBoundary>
      <FireLight />
      <Moonlight />
      <Embers />
      <Smoke />
      <BulbGlows />
      <FoamRings />
      <Fireflies />
      <Stars />
    </group>
  );
}

// while the model loads, or if it cannot: the island as a plain slab of moss and soil
const STAND_IN_TOP = matte("#5b7a4e", 0.85);
const STAND_IN_SIDE = matte("#3a2d25", 0.85);
function StandIn() {
  return (
    <group>
      <mesh geometry={GEO.box} material={STAND_IN_SIDE} position={[0, -0.56, 0]} scale={[L.half * 2, 1.1, L.half * 2]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={STAND_IN_TOP} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} scale={[L.half * 2, L.half * 2, 1]} raycast={noRaycast} />
    </group>
  );
}

/** The island from Blender: the fire's flames and glow animated here, the rest by campfireLife. */
function CampfireModel({ live }: { live: React.MutableRefObject<Live> }) {
  const { scene } = useGLTF(CAMPFIRE_URL);
  const boost = useLampBoost();
  const life = useMemo(() => bindCampfireLife(scene, DECAL_OFFSET), [scene]);
  const [begging, setBegging] = useState(false);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const flick = 0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
    const fuel = FUEL.value;
    const { outer, inner } = life.flames;
    if (outer) {
      outer.scale.set((1 + 0.05 * Math.sin(t * 9.1)) * (1 + 0.3 * fuel), (0.9 + 0.14 * flick + 0.05 * Math.sin(t * 13.7)) * (1 + 0.55 * fuel), (1 + 0.05 * Math.cos(t * 8.3)) * (1 + 0.3 * fuel));
      outer.rotation.y = t * 0.6;
    }
    if (inner) {
      inner.scale.set((1 + 0.07 * Math.sin(t * 11.3 + 1)) * (1 + 0.25 * fuel), (0.88 + 0.2 * (1 - flick) + 0.06 * Math.sin(t * 17.1)) * (1 + 0.5 * fuel), (1 + 0.07 * Math.cos(t * 10.1)) * (1 + 0.25 * fuel));
      inner.rotation.y = -t * 0.9;
    }
    // the flames, the embers and the lanterns glow a touch brighter after dark, and flicker
    for (const m of life.flicker) m.emissiveIntensity = (0.75 + 0.12 * Math.min(1.5, boost)) * (0.9 + 0.1 * flick) * (1 + 0.25 * fuel);
    const now = life.update(t, dt, live.current.players, live.current.toggleables);
    if (now.begging !== begging) setBegging(now.begging);
  });

  return (
    <>
      <primitive object={scene} />
      {/* a snack nearby: the raccoon's hearts */}
      {begging && (
        <Html position={life.critterAt} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <div className="cozy-critter-hearts" aria-hidden>
            <span>❤️</span>
            <span>❤️</span>
            <span>❤️</span>
          </div>
        </Html>
      )}
    </>
  );
}

/** The bonfire's light (warm orange, flickering, swelling when fed), the lanterns', and the soft
 *  warm pools under the string lights; no shadows. */
function FireLight() {
  const boost = useLampBoost();
  const light = useRef<THREE.PointLight>(null);
  const lantern = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flick = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 2) + 0.04 * Math.sin(t * 23.7);
    if (light.current) {
      light.current.intensity = FIRE_INTENSITY * boost * flick * (1 + 0.6 * FUEL.value);
      light.current.distance = 14 + 6 * FUEL.value;
    }
    if (lantern.current) lantern.current.intensity = 0.9 * boost * (0.95 + 0.05 * Math.sin(t * 5.1));
  });
  // one warm light for the dock's two lanterns, between them
  const lx = L.lanterns.reduce((a, p) => a + p.x, 0) / L.lanterns.length;
  const lz = L.lanterns.reduce((a, p) => a + p.z, 0) / L.lanterns.length;
  return (
    <>
      <pointLight ref={light} color={FIRE_COLOR} intensity={FIRE_INTENSITY * boost} distance={14} decay={2} position={[L.fire.x, 1.0, L.fire.z]} castShadow={false} />
      <pointLight ref={lantern} color="#ffd27a" intensity={0.9 * boost} distance={5} decay={2} position={[lx, 1.1, lz]} castShadow={false} />
      {/* under the strings: by the tipi, under the awning, and the picnic table's lantern */}
      <pointLight color="#ffd98a" intensity={0.55 * boost} distance={6.5} decay={2} position={[-5.3, 2.0, -3.1]} castShadow={false} />
      <pointLight color="#ffd98a" intensity={0.45 * boost} distance={4.5} decay={2} position={[L.van.x + 0.2, 1.3, L.van.z + L.van.w / 2 + 0.8]} castShadow={false} />
      <pointLight color="#ffd27a" intensity={0.5 * boost} distance={5} decay={2} position={[L.picnic.x - 0.48, 1.0, L.picnic.z + 0.05]} castShadow={false} />
    </>
  );
}

/** The moon: a soft cool key from high over the back of the island (no shadow), and a faint
 *  blue-over-moss fill, so the island's edges and pines still read by it. */
function Moonlight() {
  const night = NIGHTNESS[useContext(TimeOfDayContext)];
  if (night <= 0) return null;
  return (
    <>
      <directionalLight color="#9fb4e8" intensity={0.35 * night} position={[-10, 20, -14]} castShadow={false} />
      <hemisphereLight args={["#6f86c8", "#1c2a1f", 0.3 * night]} />
    </>
  );
}

/** The campfire's sky: a midnight-navy gradient behind the island, deepest at the top. */
export function CampfireSky() {
  const scene = useThree((s) => s.scene);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#0b0e14");
      grad.addColorStop(1, "#182030");
      g.fillStyle = grad;
      g.fillRect(0, 0, 2, 256);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => {
    const before = scene.background;
    scene.background = texture;
    return () => {
      scene.background = before;
      texture.dispose();
    };
  }, [scene, texture]);
  return null;
}

const SPARK_GEO = new THREE.SphereGeometry(1, 6, 4);
const EMBER_MAT = new THREE.MeshBasicMaterial({ color: "#ffb347", toneMapped: false });
const FIREFLY_MAT = new THREE.MeshBasicMaterial({ color: "#d6ff7a", toneMapped: false });
/** A firefly's soft halo: a bigger, faint green-gold glow round each one (additive, no depth write). */
const FIREFLY_HALO_MAT = new THREE.MeshBasicMaterial({ color: "#b8e05a", toneMapped: false, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
const dummy = new THREE.Object3D();

/** Sparks lifting off the fire on a slow spiral, shrinking as they rise. */
function Embers() {
  const COUNT = 22;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: COUNT }, () => ({ phase: Math.random(), speed: 0.22 + Math.random() * 0.25, r: 0.08 + Math.random() * 0.3, spin: Math.random() * 6.28, drift: 0.6 + Math.random() * 1.2 })), []);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const fuel = FUEL.value;
    seeds.forEach((s, i) => {
      const life = (t * s.speed * (1 + 0.6 * fuel) + s.phase) % 1;
      const a = s.spin + life * s.drift * 4;
      dummy.position.set(L.fire.x + Math.cos(a) * s.r * (0.4 + life), 0.45 + life * (2.3 + 1.2 * fuel), L.fire.z + Math.sin(a) * s.r * (0.4 + life));
      dummy.scale.setScalar(0.028 * (1 + 0.4 * fuel) * (1 - life) * (0.7 + 0.3 * Math.sin(t * 20 + i)));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[SPARK_GEO, EMBER_MAT, COUNT]} raycast={noRaycast} frustumCulled={false} />;
}

/** Fireflies drifting low over the river, among the pines and by the hammock, blinking; only after dark. */
function Fireflies() {
  const hour = useContext(TimeOfDayContext);
  const night = NIGHTNESS[hour];
  const mesh = useRef<THREE.InstancedMesh>(null);
  const flies = useMemo(() => {
    const around = (x0: number, x1: number, z0: number, z1: number, n: number) =>
      Array.from({ length: n }, () => ({ x: x0 + Math.random() * (x1 - x0), z: z0 + Math.random() * (z1 - z0), y: 0.35 + Math.random() * 1.1, phase: Math.random() * 6.28, rate: 0.6 + Math.random() * 0.9, wander: 0.25 + Math.random() * 0.45 }));
    const h = L.hammock;
    // over the water, all the way down the river
    const river = Array.from({ length: 16 }, (_, i) => {
      const z = RIVER_Z.from + 0.8 + ((RIVER_Z.to - RIVER_Z.from - 1.6) * (i + Math.random())) / 16;
      const span = riverSpan(z) ?? { x0: 7, x1: 8 };
      return { x: span.x0 + Math.random() * (span.x1 - span.x0), z, y: 0.25 + Math.random() * 0.9, phase: Math.random() * 6.28, rate: 0.6 + Math.random() * 0.9, wander: 0.25 + Math.random() * 0.45 };
    });
    return [
      ...river,
      ...around(-9.5, -6, -9, 1.5, 7),
      ...around(-4, 6, -9.5, -7.5, 6),
      ...around(Math.min(h.a.x, h.b.x) - 0.5, Math.max(h.a.x, h.b.x) + 0.5, Math.min(h.a.z, h.b.z) - 0.5, Math.max(h.a.z, h.b.z) + 0.5, 5),
    ];
  }, []);
  const halo = useRef<THREE.InstancedMesh>(null);
  useFrame(({ clock }) => {
    const m = mesh.current;
    const g = halo.current;
    if (!m || !g) return;
    const t = clock.elapsedTime;
    flies.forEach((f, i) => {
      if (night <= 0) {
        m.setMatrixAt(i, hidden);
        g.setMatrixAt(i, hidden);
        return;
      }
      const blink = Math.max(0, Math.sin(t * f.rate + f.phase));
      dummy.position.set(f.x + Math.sin(t * 0.3 * f.rate + f.phase) * f.wander, f.y + Math.sin(t * 0.7 + f.phase * 2) * 0.18, f.z + Math.cos(t * 0.25 * f.rate + f.phase) * f.wander);
      dummy.scale.setScalar(0.034 * night * blink * blink);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      // the glow round it, soft and a little slower to fade
      dummy.scale.setScalar(0.12 * night * blink);
      dummy.updateMatrix();
      g.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    g.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={mesh} args={[SPARK_GEO, FIREFLY_MAT, flies.length]} raycast={noRaycast} frustumCulled={false} />
      <instancedMesh ref={halo} args={[SPARK_GEO, FIREFLY_HALO_MAT, flies.length]} raycast={noRaycast} frustumCulled={false} renderOrder={2} />
    </>
  );
}

/** A field of stars far below and round the floating island: from the camera's angle they fill
 *  the sky behind it. Only after dark, brighter at night. */
function Stars() {
  const hour = useContext(TimeOfDayContext);
  const night = NIGHTNESS[hour];
  const geometry = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i < 220; i++) {
      const x = (Math.random() - 0.5) * 110;
      const z = (Math.random() - 0.5) * 110;
      if (Math.abs(x) < L.half + 1 && Math.abs(z) < L.half + 1) continue; // not under the island
      pts.push(x, -14 - Math.random() * 6, z);
    }
    return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  }, []);
  const material = useMemo(() => new THREE.PointsMaterial({ color: "#fff6dc", size: 2.2, sizeAttenuation: false, toneMapped: false }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  if (night <= 0) return null;
  material.color.set(night >= 1 ? "#fff6dc" : "#f3dcc6");
  return <points geometry={geometry} material={material} raycast={noRaycast} frustumCulled={false} />;
}

const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: "#9a93a6", transparent: true, opacity: 0.14, depthWrite: false });

/** Soft puffs of smoke billowing up off the fire and drifting off diagonally on the night wind
 *  (thicker while the fire is fed). */
function Smoke() {
  const COUNT = 14;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => ({ phase: i / COUNT, wobble: Math.random() * 6.28, size: 0.8 + Math.random() * 0.5 })), []);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const fuel = FUEL.value;
    seeds.forEach((s, i) => {
      const life = (t * 0.085 + s.phase) % 1;
      const rise = life * 3.6;
      // the wind carries it off toward the back right, a little more the higher it goes
      dummy.position.set(L.fire.x + life * life * 2.2 + Math.sin(t * 0.7 + s.wobble) * 0.12, 1.05 + rise, L.fire.z - life * life * 1.4 + Math.cos(t * 0.6 + s.wobble) * 0.1);
      const grow = 0.16 + life * 0.6;
      dummy.scale.setScalar(grow * s.size * (1 - life * life * life) * (1 + 0.35 * fuel));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    SMOKE_MAT.opacity = 0.12 + 0.06 * fuel;
  });
  return <instancedMesh ref={mesh} args={[SPARK_GEO, SMOKE_MAT, COUNT]} raycast={noRaycast} frustumCulled={false} renderOrder={3} />;
}

const GLOW_MAT = new THREE.MeshBasicMaterial({ color: "#ffd98a", toneMapped: false, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
const swungBulb = new THREE.Vector3();

/** A soft warm glow round every bulb on the light strings, swinging with its string. */
function BulbGlows() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    STRING_BULBS.forEach((b, i) => {
      swungBulb.copy(b.rest).sub(b.anchor).applyQuaternion(STRING_SWING[b.string]).add(b.anchor);
      dummy.position.copy(swungBulb);
      dummy.scale.setScalar(0.1 * (0.92 + 0.08 * Math.sin(t * 2.3 + i * 1.7)));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[SPARK_GEO, GLOW_MAT, STRING_BULBS.length]} raycast={noRaycast} frustumCulled={false} renderOrder={2} />;
}

const RING_GEO = new THREE.RingGeometry(0.08, 0.11, 24).rotateX(-Math.PI / 2);
const FOAM_MAT = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const foamColor = new THREE.Color();

/** Foam rings on the river: spreading out from each of the dock's pilings, and after each duck. */
function FoamRings() {
  const PER = 2;
  const sources = DOCK_PILINGS.length + DUCK_PATHS.length;
  const mesh = useRef<THREE.InstancedMesh>(null);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    for (let s = 0; s < sources; s++) {
      const duck = s >= DOCK_PILINGS.length;
      const at = duck ? duckPose(s - DOCK_PILINGS.length, t) : DOCK_PILINGS[s];
      for (let k = 0; k < PER; k++) {
        const i = s * PER + k;
        const life = (t * (duck ? 0.55 : 0.4) + k / PER + s * 0.37) % 1;
        dummy.position.set(at.x, L.river.water + 0.006, at.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar((duck ? 1.1 : 1.3) + life * (duck ? 2.2 : 1.8));
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        // fading out as it spreads (additive: fading to black is fading away)
        m.setColorAt(i, foamColor.setScalar(0.45 * (1 - life) * (1 - life)));
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[RING_GEO, FOAM_MAT, sources * PER]} raycast={noRaycast} frustumCulled={false} renderOrder={1} />;
}
