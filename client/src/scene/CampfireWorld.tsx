import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PlayerState, TimeOfDay, ToggleableSyncState } from "@shared/types";
import { CAMPFIRE_LAYOUT as L, CHOP_STATIONS, DOCK_PILINGS, DUCK_PATHS, RIVER_Z, riverSpan } from "@shared/worlds/campfire";
import { ModelBoundary } from "../entities/ModelBoundary";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "./kit";
import { TimeOfDayContext, useLampBoost } from "./timeOfDay";
import { CRITTER_TREAT, DUCK_DIVE_AT, DUCK_DIVE_S, STRING_BULBS, STRING_SWING, bindCampfireLife, campNow, duckPose } from "./campfireLife";
import type { HearthState, RoomMessageListener } from "../hooks/useColyseusRoom";
import { playSfx } from "../audio/sfx";
import { Barnaby, Buster } from "../entities/Barnaby";
import { LOW_FUEL, COZY_AURA_FUEL, type BonfireUpdate } from "@shared/bonfire";

// The Starlight Campfire (map 2). The island itself is one Blender model, campfire.glb
// (scripts/blender/build_campfire.py, laid out from shared/worlds/campfire.ts); this file loads it
// and brings it to life (the wildlife, the canoe, the swaying strings, the river's flow and the
// pines' sway are campfireLife.ts):
//
//   the fire      its two flame nodes flicker and breathe over a flickering orange point light,
//                 as big and bright as its fuel (the room's hearth): a burst as wood goes on,
//                 roaring above 70% (the Cozy Aura), sunk to embers under a smoky haze below 20%
//   the hearth    the Dutch oven swinging gently on its tripod over the fire, its stew showing
//                 (tinted by what is in it) and steaming as it cooks; the skewers friends left
//                 on the picnic table's plates
//   Barnaby       the otter angler at his tackle stall by the dock, and Buster the beaver
//                 lumberjack at his firewood stall by the woodpile (entities/Barnaby.tsx)
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

export const CAMPFIRE_URL = modelUrl("campfire.glb");

const FIRE_COLOR = "#ff8c32";
/** The fire's light at its base; every lamp is scaled by the hour's lamp boost (x2.2 at night). */
const FIRE_INTENSITY = 2.8;
/** The bonfire's light once it is out: the embers' faint glow. */
const EMBER_LIGHT = 0.05;
/** The tipi's inner glow (the Tipi interior light): lit while it is empty, a dim 0.1 while someone naps in it. */
const TIPI_AWAKE = 1.5;
const TIPI_ASLEEP = 0.1;
/** The ground decals (moss patches, paths, the clearing), each nudged toward the camera in the
 *  depth test by its own polygon offset on top of its few millimetres of height: never a flicker. */
const DECAL_OFFSET: Record<string, number> = { CF_GrassDark: -1, CF_GrassLight: -1, CF_Dirt: -2 };
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/** How much of the night's magic shows at each hour (fireflies, stars). */
const NIGHTNESS: Record<TimeOfDay, number> = { night: 1, sunset: 0.6, sunrise: 0.25, day: 0 };

/** The fire right now, smoothed from the hearth's fuel: `level` 0..1 (the fuel), `heat` how big and
 *  bright its flames and light are (embers at 0.4, full at 1), `value` its roar on top (above the
 *  Cozy Aura line, and a burst each time wood goes on), `smoky` the haze of a fire burning low. */
const FUEL = { value: 0, level: 0.6, heat: 1, burst: 0, smoky: 0, out: false };

interface Live {
  players: Record<string, PlayerState>;
  toggleables: Record<string, ToggleableSyncState>;
  hearth: HearthState;
}

interface CampfireWorldProps extends Live {
  /** The camp's shared hearth: the fire's fuel, the Dutch oven, the picnic table's plates. */
  hearth: HearthState;
  onFloorClick: (x: number, z: number) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  /** A tap on one of the ducks (the room tells everyone it dives). */
  onDuck: (duck: number) => void;
}

export function CampfireWorld({ onFloorClick, players, toggleables, hearth, subscribeMessages, onDuck }: CampfireWorldProps) {
  // the latest state for the frame loop, without re-rendering the island on every change
  const live = useRef<Live>({ players, toggleables, hearth });
  live.current = { players, toggleables, hearth };
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  // the raccoon's treats and the ducks' dives, as the room reports them: everyone sees (and hears) them
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "critterTreat") {
          CRITTER_TREAT.at = campNow();
          playSfx("squeak");
        } else if (type === "duckDive" && typeof payload?.duck === "number") {
          DUCK_DIVE_AT[payload.duck] = campNow();
          playSfx("quack");
        } else if (type === "BONFIRE_STATE_UPDATE" && (payload as BonfireUpdate).amount > 0) {
          // wood on the fire: it flares up
          FUEL.burst = 1;
        }
      }),
    [subscribeMessages]
  );
  useFrame((_, dt) => {
    const level = Math.max(0, Math.min(1, live.current.hearth.fuel / 100));
    FUEL.level += (level - FUEL.level) * Math.min(1, dt * 0.8);
    FUEL.burst = Math.max(0, FUEL.burst - dt * 0.45);
    // at 0% the fire is out: no flames, a faint glow from the embers (until someone relights it)
    FUEL.out = live.current.hearth.fuel <= 0;
    FUEL.heat = FUEL.out ? 0 : 0.4 + 0.6 * Math.min(1, FUEL.level / 0.6);
    const roar = Math.max(0, (FUEL.level - COZY_AURA_FUEL / 100) / (1 - COZY_AURA_FUEL / 100));
    FUEL.value += (Math.max(roar * 0.8, FUEL.burst) - FUEL.value) * Math.min(1, dt * 2.5);
    FUEL.smoky = Math.max(0, Math.min(1, (LOW_FUEL / 100 - FUEL.level) / (LOW_FUEL / 100)));
  });
  return (
    <group>
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[L.half * 2, L.half * 2, 1]} onPointerDown={floorClick} />
      <ModelBoundary what="campfire.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <CampfireModel live={live} />
        </Suspense>
      </ModelBoundary>
      <FireLight live={live} />
      <JarLights live={live} />
      <StewSteam live={live} />
      <ChopBillboards toggleables={toggleables} />
      <Barnaby subscribeMessages={subscribeMessages} />
      <Buster subscribeMessages={subscribeMessages} />
      <Moonlight />
      <Embers />
      <Smoke />
      <BulbGlows />
      <FoamRings />
      <DuckTargets onDuck={onDuck} />
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
  const hearthNodes = useMemo(() => {
    const pot = scene.getObjectByName("Stew_Pot") ?? null;
    const contents = scene.getObjectByName("Stew_Contents") as THREE.Mesh | undefined;
    const stewMat = contents && !Array.isArray(contents.material) ? (contents.material as THREE.MeshStandardMaterial) : null;
    const plates = [1, 2, 3, 4].map((k) => {
      const mallow = scene.getObjectByName(`Picnic_Skewer_0${k}`) ?? null;
      const bbq = scene.getObjectByName(`Picnic_Bbq_0${k}`) ?? null;
      if (mallow) mallow.visible = false;
      if (bbq) bbq.visible = false;
      return { mallow, bbq };
    });
    if (contents) contents.visible = false;
    return { pot, contents: contents ?? null, contentsY: contents?.position.y ?? 0, stewMat, plates };
  }, [scene]);
  const [begging, setBegging] = useState(false);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const flick = 0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
    const fuel = FUEL.value;
    const heat = FUEL.heat;
    const { outer, inner } = life.flames;
    if (outer) outer.visible = !FUEL.out;
    if (inner) inner.visible = !FUEL.out;
    if (outer) {
      outer.scale.set((1 + 0.05 * Math.sin(t * 9.1)) * (1 + 0.3 * fuel) * heat, (0.9 + 0.14 * flick + 0.05 * Math.sin(t * 13.7)) * (1 + 0.45 * fuel) * heat, (1 + 0.05 * Math.cos(t * 8.3)) * (1 + 0.3 * fuel) * heat);
      outer.rotation.y = t * 0.6;
    }
    if (inner) {
      inner.scale.set((1 + 0.07 * Math.sin(t * 11.3 + 1)) * (1 + 0.25 * fuel) * heat, (0.88 + 0.2 * (1 - flick) + 0.06 * Math.sin(t * 17.1)) * (1 + 0.4 * fuel) * heat, (1 + 0.07 * Math.cos(t * 10.1)) * (1 + 0.25 * fuel) * heat);
      inner.rotation.y = -t * 0.9;
    }
    // the flames, the embers and the lanterns glow a touch brighter after dark, and flicker
    for (const m of life.flicker) m.emissiveIntensity = (0.75 + 0.12 * Math.min(1.5, boost)) * (0.9 + 0.1 * flick) * (1 + 0.25 * fuel);
    const now = life.update(t, dt, live.current.players, live.current.toggleables);
    // the Dutch oven: a gentle swing on its chain (livelier on the boil), its stew showing and
    // tinted by what went in, bubbling as it cooks
    const { stew, picnic } = live.current.hearth;
    if (hearthNodes.pot) {
      const cooking = stew.phase === "cooking";
      hearthNodes.pot.rotation.x = (cooking ? 0.035 : 0.015) * Math.sin(t * 1.4);
      hearthNodes.pot.rotation.z = (cooking ? 0.03 : 0.012) * Math.sin(t * 1.1 + 1);
    }
    if (hearthNodes.contents) {
      const n = stew.items.length;
      hearthNodes.contents.visible = n > 0 || stew.phase !== "gathering";
      hearthNodes.contents.position.y = hearthNodes.contentsY - 0.05 + 0.02 * Math.min(3, n);
      const pulse = stew.phase === "cooking" ? 1 + 0.03 * Math.sin(t * 9) : 1;
      hearthNodes.contents.scale.set(pulse, 1, pulse);
      if (hearthNodes.stewMat) hearthNodes.stewMat.color.copy(stewColor(stew.items.map((i) => i.kind)));
    }
    // the picnic table: the skewers friends have left on its plates
    hearthNodes.plates.forEach((plate, k) => {
      const on = picnic[k];
      if (plate.mallow) plate.mallow.visible = on?.food === "mallow";
      if (plate.bbq) plate.bbq.visible = on?.food === "bbq";
    });
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
function FireLight({ live }: { live: React.MutableRefObject<Live> }) {
  const boost = useLampBoost();
  // the tipi's glow, eased down to a dim night-light while someone sleeps in it
  const tipiLevel = useRef(TIPI_AWAKE);
  const light = useRef<THREE.PointLight>(null);
  const lantern = useRef<THREE.PointLight>(null);
  const grove = useRef<THREE.PointLight>(null);
  const tipi = useRef<THREE.PointLight>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const flick = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 2) + 0.04 * Math.sin(t * 23.7);
    if (grove.current) grove.current.intensity = 0.55 * boost * (0.9 + 0.1 * Math.sin(t * 6.1 + 1) * Math.sin(t * 2.3));
    if (tipi.current) {
      const asleep = Object.values(live.current.players).some((p) => p.sitting && p.sitPose === "lie" && Math.hypot(p.x - L.tent.x, p.z - L.tent.z) < L.tent.r);
      tipiLevel.current += ((asleep ? TIPI_ASLEEP : TIPI_AWAKE) - tipiLevel.current) * Math.min(1, dt * 1.2);
      tipi.current.intensity = tipiLevel.current * (0.92 + 0.08 * Math.sin(t * 3.7) * Math.sin(t * 1.3 + 2));
    }
    if (light.current) {
      light.current.intensity = FUEL.out ? EMBER_LIGHT : FIRE_INTENSITY * boost * flick * (0.35 + 0.65 * FUEL.heat) * (1 + 0.5 * FUEL.value);
      light.current.distance = (10 + 4 * FUEL.heat) + 6 * FUEL.value;
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
      {/* inside the tipi: a warm glow through its canvas and out of its open flap */}
      <pointLight ref={tipi} color="#ffa64d" intensity={TIPI_AWAKE} distance={4.5} decay={2} position={[L.tent.x + 0.2, 0.9, L.tent.z + 0.15]} castShadow={false} />
      {/* under the strings: the awning, and the picnic table's lantern */}
      <pointLight color="#ffd98a" intensity={0.45 * boost} distance={4.5} decay={2} position={[L.van.x + 0.2, 1.3, L.van.z + L.van.w / 2 + 0.8]} castShadow={false} />
      <pointLight color="#ffd27a" intensity={0.5 * boost} distance={5} decay={2} position={[L.picnic.x - 0.48, 1.0, L.picnic.z + 0.05]} castShadow={false} />
      {/* the grove's ground lantern by the guitar case */}
      {/* Buster's stall by the woodpile, and Barnaby's by the dock: warm little lights so they are easy to find */}
      <pointLight color="#ffd27a" intensity={0.5 * boost} distance={3.2} decay={2} position={[L.buster.x - 0.4, 1.5, L.buster.z + 0.8]} castShadow={false} />
      <pointLight color="#ffd27a" intensity={0.55 * boost} distance={3.4} decay={2} position={[L.barnaby.x + 0.3, 1.5, L.barnaby.z + 0.7]} castShadow={false} />
      <pointLight ref={grove} color="#ffa844" intensity={0.55 * boost} distance={4.5} decay={2} position={[L.groundLantern.x, 0.35, L.groundLantern.z]} castShadow={false} />
    </>
  );
}

/** A soft green-gold glow round anyone carrying a jar of fireflies (two lights, always there, so
 *  the scene's light count never changes: a change would recompile every material). */
function JarLights({ live }: { live: React.MutableRefObject<Live> }) {
  const lights = [useRef<THREE.PointLight>(null), useRef<THREE.PointLight>(null)];
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const holders = Object.values(live.current.players).filter((p) => p.holding === "jar");
    lights.forEach((ref, i) => {
      const l = ref.current;
      if (!l) return;
      const p = holders[i];
      if (!p) {
        l.intensity = 0;
        return;
      }
      l.position.set(p.x, 0.45, p.z);
      l.intensity = 0.7 * (0.85 + 0.15 * Math.sin(t * 3.3 + i * 2));
    });
  });
  return (
    <>
      {lights.map((ref, i) => (
        <pointLight key={i} ref={ref} color="#d6ff7a" intensity={0} distance={3.2} decay={2} castShadow={false} />
      ))}
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
      dummy.scale.setScalar(i / COUNT > FUEL.heat + 0.1 ? 0 : 0.028 * (1 + 0.4 * fuel) * (1 - life) * (0.7 + 0.3 * Math.sin(t * 20 + i)));
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
      // the grove between the hammock and the tipi, thick with them (catch some in a jar)
      ...around(L.fireflies.x - 1.3, L.fireflies.x + 1.3, L.fireflies.z - 1.3, L.fireflies.z + 1.3, 12),
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
      dummy.scale.setScalar(grow * s.size * (1 - life * life * life) * (1 + 0.35 * fuel + 0.9 * FUEL.smoky));
      if (FUEL.smoky > 0) dummy.position.y -= rise * 0.35 * FUEL.smoky; // a low fire's smoke hangs about
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    SMOKE_MAT.opacity = 0.12 + 0.06 * fuel + 0.2 * FUEL.smoky;
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

/** Over a chopping station on the Timber Trail that is cooling down (bare, waiting for fresh logs), a
 *  small floating countdown; nothing at all over one that is ready. The server says how long the
 *  wait is (the station's `boost`) when it goes bare; the countdown runs here, from when that was
 *  seen, and the badge goes the moment it reaches 0. */
function ChopBillboards({ toggleables }: { toggleables: Record<string, ToggleableSyncState> }) {
  const bareSince = useRef<Record<string, number>>({});
  const [, setTick] = useState(0);
  const stations = CHOP_STATIONS.map((s) => toggleables[s.propId]).filter((s): s is ToggleableSyncState => !!s);
  const now = performance.now();
  for (const s of stations) {
    if (!s.on) bareSince.current[s.propId] ??= now;
    else delete bareSince.current[s.propId];
  }
  const waiting = stations.some((s) => !s.on);
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [waiting]);
  return (
    <>
      {stations.map((s) => {
        if (s.on) return null;
        const left = Math.max(0, Math.ceil((s.boost || 20) - (now - (bareSince.current[s.propId] ?? now)) / 1000));
        if (left <= 0) return null;
        return (
          <Html key={s.propId} position={[s.x, 1.15, s.z]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
            <div className="cozy-chop-sign">⏳ {left}s</div>
          </Html>
        );
      })}
    </>
  );
}

const STEAM_MAT = new THREE.MeshBasicMaterial({ color: "#f3efe8", transparent: true, opacity: 0.2, depthWrite: false });
const STEW_TINT: Record<string, THREE.Color> = { fish: new THREE.Color("#d88a4a"), mushroom: new THREE.Color("#8a5a3a"), berry: new THREE.Color("#8f4f9a") };
const stewMix = new THREE.Color();
/** The stew's colour: an average of its ingredients' (a fishy orange, a mushroom brown, a berry purple). */
function stewColor(kinds: string[]): THREE.Color {
  if (!kinds.length) return stewMix.set("#c8763c");
  stewMix.setRGB(0, 0, 0);
  for (const k of kinds) stewMix.add(STEW_TINT[k] ?? STEW_TINT.fish);
  return stewMix.multiplyScalar(1 / kinds.length);
}

/** Wisps of steam off the Dutch oven while it cooks and while the stew waits, warm, for bowls. */
function StewSteam({ live }: { live: React.MutableRefObject<Live> }) {
  const COUNT = 8;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => ({ phase: i / COUNT, a: Math.random() * 6.28, r: 0.05 + Math.random() * 0.12 })), []);
  const top = L.tripod.potY + 0.28;
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const phase = live.current.hearth.stew.phase;
    const on = phase === "cooking" ? 1 : phase === "ready" ? 0.6 : 0;
    seeds.forEach((s, i) => {
      if (!on) {
        m.setMatrixAt(i, hidden);
        return;
      }
      const life = (t * 0.35 + s.phase) % 1;
      dummy.position.set(L.fire.x + Math.cos(s.a + life * 2) * s.r, top + life * 0.9, L.fire.z + Math.sin(s.a + life * 2) * s.r);
      dummy.scale.setScalar((0.05 + life * 0.14) * (1 - life) * on * 1.6);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[SPARK_GEO, STEAM_MAT, COUNT]} raycast={noRaycast} frustumCulled={false} renderOrder={3} />;
}

const RING_GEO = new THREE.RingGeometry(0.08, 0.11, 24).rotateX(-Math.PI / 2);
const FOAM_MAT = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const foamColor = new THREE.Color();

/** Foam rings on the river: spreading out from each of the dock's pilings, and after each duck. */
function FoamRings() {
  const PER = 2;
  // the dock's pilings, the cascade's foot, then the ducks
  const still = [...DOCK_PILINGS, { x: L.cascade.x, z: L.cascade.z + 0.62 }];
  const sources = still.length + DUCK_PATHS.length;
  const mesh = useRef<THREE.InstancedMesh>(null);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    for (let s = 0; s < sources; s++) {
      const duck = s >= still.length;
      const at = duck ? duckPose(s - still.length, t) : still[s];
      for (let k = 0; k < PER; k++) {
        const i = s * PER + k;
        const life = (t * (duck ? 0.55 : 0.4) + k / PER + s * 0.37) % 1;
        const dk = duck ? (t - (DUCK_DIVE_AT[s - still.length] ?? -99)) / (DUCK_DIVE_S + 0.4) : 1;
        const splash = dk >= 0 && dk < 1 ? 1 - dk : 0;
        dummy.position.set(at.x, L.river.water + 0.006, at.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(((duck ? 1.1 : 1.3) + life * (duck ? 2.2 : 1.8)) * (1 + splash * 1.2));
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        // fading out as it spreads (additive: fading to black is fading away)
        m.setColorAt(i, foamColor.setScalar((0.45 + splash * 0.5) * (1 - life) * (1 - life)));
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[RING_GEO, FOAM_MAT, sources * PER]} raycast={noRaycast} frustumCulled={false} renderOrder={1} />;
}

const DUCK_TARGET_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/** Invisible, generous click targets that paddle along with the ducks: tap one to make it dive. */
function DuckTargets({ onDuck }: { onDuck: (duck: number) => void }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((m, i) => {
      if (!m) return;
      const p = duckPose(i, clock.elapsedTime);
      // above the island's invisible floor plane (y 0.02, over the river too), so a tap on the duck
      // reaches the duck and not the floor
      m.position.set(p.x, L.river.water + 0.32, p.z);
    });
  });
  return (
    <>
      {DUCK_PATHS.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => (refs.current[i] = m)}
          geometry={SPARK_GEO}
          material={DUCK_TARGET_MAT}
          scale={0.38}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onDuck(i);
          }}
        />
      ))}
    </>
  );
}
