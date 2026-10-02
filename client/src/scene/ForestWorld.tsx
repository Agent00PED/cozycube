import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { swingAngle } from "./swingMotion";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { parseWorldEvent, type PlayerState } from "@shared/types";
import { parseTrees } from "@shared/chop";
import { isBlocked } from "@shared/collision";
import { daylight } from "@shared/daynight";
import { FINLEY, FOREST_ANIMALS, FOREST_GRID, FOREST_LAYOUT as L, FOREST_SHAFTS, FOREST_TREES, OLD_FLINT, forestLand, forestRiver } from "@shared/worlds/forest";
import { riverWater } from "./riverWater";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { CampNpc, type NpcTalk } from "../entities/CampNpc";
import { modelUrl } from "../assetVersion";
import { playSfx } from "../audio/sfx";
import { GEO, matte, noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { CampDaylightContext } from "./campDay";
import { OcclusionDriver, ditherOccluder } from "./occlusionDither";
import { FellableTrees } from "./FellableTrees";
import { WildCritters } from "./WildCritters";
import { LightShafts } from "./LightShafts";
import { SurgeRipples } from "./SurgeRipples";
import { WoodsFauna } from "./WoodsFauna";
import { Butterflies } from "./Butterflies";
import { ChimneySmoke, CloudClock, FallingLeaves, Flyover, LanternMoths, RiseRings, RiverMist, cloudShadows, type LeafTree } from "./campLife";

// The Whispering Woods (map "whispering_woods"), behind the campfire's archway. The island is one
// Blender model, forest.glb (scripts/blender/build_forest.py, laid out from shared/worlds/forest.ts):
// this file loads it and brings it to life.
//
//   the trees     the twenty-six trees you fell (and a Colossal Titan while one stands): FellableTrees,
//                 from trees.glb, each its own size, as the room says it is growing back
//   Bramble       the bear ranger at his counter (bramble.glb): he trades wood and fish, sells the
//                 top axes and rods, and his cabin's windows glow at night
//   the animals   the deer grazing by the glen's path, looking up now and then; the rabbits hopping
//                 by the splitting block; fed, they hop for joy
//   the river     down the east side, from the fall at its head to the sheet over the island's edge
//                 (riverWater: shallows, foam at the banks, streaks down the falls); a King-Size
//                 Surge's golden ripples on it
//   the ground    a hillside (shared/worlds/forest.ts forestLand): a click lands on an invisible copy
//                 of the grid the ground is modelled from, and the keepers, the animals, the lights
//                 and the fireflies stand at the land's height
//   the wind      the canopy sways; trees between you and the camera thin to let you through
//   the light     the camp's 24-minute day (campDay): fireflies and the elderwood's glow by night

export const FOREST_URL = modelUrl("forest.glb");
export const BRAMBLE_URL = modelUrl("bramble.glb");
export const FINLEY_URL = modelUrl("finley.glb");
export const OLD_FLINT_URL = modelUrl("old_flint.glb");

const FOREST_TIME = { value: 0 };
const FOREST_NIGHT = { value: 0 };
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
/** The ground a click is tested against: the game's own grid (FOREST_GRID, each cell cut along the
 *  diagonal its heights are read by), so a click on the hill lands where it shows. Never drawn. */
const CLICK_GROUND = (() => {
  const { n, cell, ground } = FOREST_GRID;
  const pos = new Float32Array((n + 1) * (n + 1) * 3);
  for (let k = 0; k <= n; k++)
    for (let i = 0; i <= n; i++) {
      const at = (k * (n + 1) + i) * 3;
      pos[at] = -L.half + i * cell;
      pos[at + 1] = Math.max(ground[k * (n + 1) + i], L.river.water);
      pos[at + 2] = -L.half + k * cell;
    }
  const index: number[] = [];
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) {
      const a = k * (n + 1) + i;
      index.push(a, a + n + 2, a + 1, a, a + n + 1, a + n + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
})();
/** A height over the ground at (x, z). */
const over = (x: number, y: number, z: number): [number, number, number] => [x, forestLand(x, z) + y, z];
/** What thins when it stands between you and the camera (the vista pines; the trees you fell thin
 *  themselves, FellableTrees). */
const OCCLUDERS = /^FW_Vista(Needle|Bark)/;
/** The river's water: its height (the surge's ripples float on it). */
const WATER_Y = L.river.water;
/** What the clouds' shadows drift over: the ground and everything of clay standing on it. */
const CLOUDED = /^FW_(Meadow|Clay|ClayDouble)$/;
/** Dragonflies over the river (the butterflies' own templates, blue and quick and low). */
const DRAGON_TINTS = ["#5fd3ff", "#7af0d0", "#4f9bff", "#a8e8ff"];
/** Foliage that sways in the wind. */
const SWAYERS = /^FW_VistaNeedle/;

function swayFoliage(m: THREE.Material) {
  if (m.userData.swaying) return;
  m.userData.swaying = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = FOREST_TIME;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      // (a pine's height over the ground it stands on is in its UVs: build_forest.py bake_colors;
      // glTF's v runs down)
      float swayH = max(0.0, (1.0 - uv.y) - 0.6);
      float swayPh = transformed.x * 0.4 + transformed.z * 0.3;
      transformed.x += sin(uTime * 1.1 + swayPh) * 0.02 * swayH;
      transformed.z += sin(uTime * 0.8 + swayPh * 1.3) * 0.015 * swayH;`
    );
  };
  m.needsUpdate = true;
}

interface ForestWorldProps {
  onFloorClick: (x: number, z: number) => void;
  players: Record<string, PlayerState>;
  localSessionId: string | null;
  /** The room's trees (shared/chop.ts TreeSync as JSON) and its living wonder (WorldEvent as JSON). */
  trees: string;
  worldEvent: string;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onUseProp: (propId: string) => void;
}

const BRAMBLE_TALK: NpcTalk = {
  height: 1.6,
  greet: {
    inside: (x, z) => Math.hypot(x - L.counter.x, z - L.counter.z) < 3.2,
    lines: ["Welcome to my trading post, friend", "Mind the river, it wanders where it likes", "Fine day for felling, isn't it?", "Bring me good timber and I'll pay you fair"],
  },
  on: {
    treeFelled: () => (Math.random() < 0.25 ? "Timberrr!" : null),
  },
};

export function ForestWorld({ onFloorClick, players, localSessionId, trees, worldEvent, subscribeMessages, onUseProp }: ForestWorldProps) {
  const treeState = useMemo(() => parseTrees(trees), [trees]);
  const wonder = useMemo(() => parseWorldEvent(worldEvent), [worldEvent]);
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  // the leafy trees standing now (a stump drops no leaves): which of them, not their sizes
  const leafy = FOREST_TREES.filter((t) => (t.kind === "maple" || t.kind === "birch") && (treeState[t.id]?.stage ?? "mature") === "mature")
    .map((t) => t.id)
    .join(",");
  const leafTrees = useMemo(
    () =>
      FOREST_TREES.filter((t) => leafy.split(",").includes(t.id)).map((t): LeafTree => {
        const maple = t.kind === "maple";
        return { x: t.x, z: t.z, y: forestLand(t.x, t.z), r: maple ? 2.0 : 1.2, top: maple ? 4.2 : 3.5, tints: maple ? ["#e0782e", "#f2b33d", "#c8452f"] : ["#cdd46c", "#aac45c", "#e0d27a"] };
      }),
    [leafy]
  );
  useFrame((_, dt) => {
    FOREST_TIME.value += dt;
    FOREST_NIGHT.value = 1 - daylight(Date.now());
  });
  return (
    <group>
      <mesh geometry={CLICK_GROUND} material={CLICK_MAT} onPointerDown={floorClick} />
      <ModelBoundary what="forest.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <ForestModel subscribeMessages={subscribeMessages} />
        </Suspense>
      </ModelBoundary>
      <FellableTrees mapId="whispering_woods" trees={treeState} players={players} localSessionId={localSessionId} subscribeMessages={subscribeMessages} onUseProp={onUseProp} />
      <SurgeRipples event={wonder} mapId="whispering_woods" waterY={WATER_Y} />
      <CampNpc url={BRAMBLE_URL} what="bramble.glb" prefix="Bramble" at={L.bramble} y={forestLand(L.bramble.x, L.bramble.z)} waveEvent="brambleWave" standIn={<BrambleStandIn />} subscribeMessages={subscribeMessages} talk={BRAMBLE_TALK} />
      <CampNpc url={FINLEY_URL} what="finley.glb" prefix="Finley" at={FINLEY} y={forestLand(FINLEY.x, FINLEY.z)} waveEvent="finleyWave" standIn={<FinleyStandIn />} subscribeMessages={subscribeMessages} talk={FINLEY_TALK} />
      <CampNpc url={OLD_FLINT_URL} what="old_flint.glb" prefix="OldFlint" at={OLD_FLINT} y={forestLand(OLD_FLINT.x, OLD_FLINT.z)} waveEvent="flintWave" standIn={<FlintStandIn />} subscribeMessages={subscribeMessages} talk={FLINT_TALK} />
      <ForestLights />
      <WildCritters mapId="whispering_woods" />
      {/* the daylight through the Old Growth's canopy */}
      <LightShafts shafts={FOREST_SHAFTS} landY={forestLand} />
      <Fireflies />
      <ElderMotes />
      {/* the small motions: clouds' shadows, leaves coming down, a fish rising, mist on the river,
          moths at the lanterns, smoke off Bramble's chimney */}
      <CloudClock />
      <FallingLeaves trees={leafTrees} />
      <RiseRings spots={RISE_SPOTS} waterY={WATER_Y} />
      <RiverMist spots={MIST_SPOTS} waterY={WATER_Y} />
      <LanternMoths lamps={WOODS_LAMPS} />
      <ChimneySmoke at={CHIMNEY} />
      <OcclusionDriver />
    </group>
  );
}

const STAND_IN_TOP = matte("#6f9a55", 0.85);
const STAND_IN_SIDE = matte("#3a2d25", 0.85);
function StandIn() {
  return (
    <group>
      <mesh geometry={GEO.box} material={STAND_IN_SIDE} position={[0, -0.56, 0]} scale={[L.half * 2, 1.1, L.half * 2]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={STAND_IN_TOP} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} scale={[L.half * 2, L.half * 2, 1]} raycast={noRaycast} />
    </group>
  );
}
const FINLEY_TALK: NpcTalk = {
  height: 1.3,
  clicked: ["Shh... they're biting!", "Fish to sell? I'll give you a fair price", "The legendaries hide in the deep bends", "Tight lines, friend!"],
  greet: {
    inside: (x, z) => Math.hypot(x - FINLEY.x, z - FINLEY.z) < 3.0,
    lines: ["Oh! A visitor. Keep your voice down, the trout are shy", "Finley's the name, fish are the game", "Glow-Crickets work wonders after dark, you know", "Bring me your catch: I pay fair"],
  },
};
const FINLEY_STAND_IN = matte("#8a5a34", 0.85);
function FinleyStandIn() {
  return <mesh geometry={GEO.box} material={FINLEY_STAND_IN} position={[0, 0.45, 0]} scale={[0.6, 0.9, 0.5]} raycast={noRaycast} />;
}
// Old Flint the Badger by the old mine adit behind the Autumn Maples (the way down to the Glimmering
// Caverns): a lantern on his helmet, his pickaxe planted beside him
const FLINT_TALK: NpcTalk = {
  height: 1.5,
  clicked: ["Mind your lamp down there", "The rock talks, if you listen", "Coal up top, glimmer down in the dark", "Say hello to Gus for me"],
  greet: {
    inside: (x, z) => Math.hypot(x - OLD_FLINT.x, z - OLD_FLINT.z) < 3.0,
    lines: ["Found my old adit, did you?", "Evening, young'un", "There's more under these roots than you'd think", "Fancy a look below?"],
  },
};
const FLINT_STAND_IN = matte("#5d5a5e", 0.85);
function FlintStandIn() {
  return <mesh geometry={GEO.box} material={FLINT_STAND_IN} position={[0, 0.55, 0]} scale={[0.6, 1.1, 0.5]} raycast={noRaycast} />;
}
const BRAMBLE_STAND_IN = matte("#7a5236", 0.85);
function BrambleStandIn() {
  return <mesh geometry={GEO.box} material={BRAMBLE_STAND_IN} position={[0, 0.6, 0]} scale={[0.6, 1.2, 0.5]} raycast={noRaycast} />;
}

function ForestModel({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const { scene } = useGLTF(FOREST_URL);
  // the model's materials: the decals nudged forward, the foliage swaying, the occluders dithering,
  // the river flowing
  useMemo(() => {
    scene.traverse((o) => {
      // (an older model's tree looks: trees.glb draws the trees now)
      if (o.name.startsWith("Tree_")) o.visible = false;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.emissive && m.emissive.getHex() !== 0) m.toneMapped = false;
      if (m.name === "FW_Water" && !m.userData.flowing) {
        m.userData.flowing = true;
        riverWater(m, FOREST_TIME, FOREST_NIGHT);
      }
      if (SWAYERS.test(m.name)) swayFoliage(m);
      if (OCCLUDERS.test(m.name)) ditherOccluder(m);
      if (CLOUDED.test(m.name)) cloudShadows(m);
    });
  }, [scene]);
  return (
    <>
      <primitive object={scene} />
      <Animals scene={scene} subscribeMessages={subscribeMessages} />
      <WoodsFauna scene={scene} />
      <Butterflies scene={scene} spots={DRAGON_SPOTS} landY={dragonY} tints={DRAGON_TINTS} size={1.9} pace={2.3} lift={0.42} />
      <Flyover scene={scene} half={L.half} />
    </>
  );
}

/** How far the deer and the rabbits wander from home (m), and the deer's walking pace (m/s). */
const DEER_ROAM = 1.4;
const RABBIT_ROAM = 1.0;
const DEER_PACE = 0.32;
/** A spot to wander to: round home, on open ground. */
function roamSpot(home: { x: number; z: number }, roam: number): { x: number; z: number } {
  for (let k = 0; k < 8; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = roam * (0.35 + 0.65 * Math.random());
    const p = { x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r };
    if (!isBlocked(p.x, p.z, "whispering_woods", 0.35)) return p;
  }
  return { ...home };
}

/** The deer wanders its little trail near the glen's path, grazing and looking up at each stop; the
 *  rabbits hop about near home; fed, they hop for joy (and hearts rise). */
function Animals({ scene, subscribeMessages }: { scene: THREE.Object3D; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const parts = useMemo(() => {
    const deer = scene.getObjectByName("Animal_Deer") ?? null;
    const head = scene.getObjectByName("Animal_Deer_Head") ?? null;
    const rabbits = [1, 2, 3].map((k) => scene.getObjectByName(`Animal_Rabbit_${k}`)).filter((o): o is THREE.Object3D => !!o);
    // the rope swing by Bramble's garden: its plank hangs from the branch (the node's origin)
    const ropeSwing = scene.getObjectByName("Prop_RopeSwing") ?? null;
    const deerHome = deer ? { x: deer.position.x, z: deer.position.z } : { x: 0, z: 0 };
    return {
      ropeSwing,
      deer,
      deerY: deer?.position.y ?? 0,
      deerHome,
      // the deer's walk: where it is headed, and until when it grazes where it stands
      deerWalk: { to: { ...deerHome }, grazeUntil: 3 + Math.random() * 3, yaw: deer?.rotation.y ?? 0 },
      head,
      headRest: head?.rotation.x ?? 0,
      rabbits: rabbits.map((r) => ({ node: r, y: r.position.y, home: { x: r.position.x, z: r.position.z }, yaw: r.rotation.y, next: Math.random() * 3, hopAt: -99, from: { x: r.position.x, z: r.position.z }, to: { x: r.position.x, z: r.position.z } })),
    };
  }, [scene]);
  const [hearts, setHearts] = useState<{ id: string; at: number } | null>(null);
  const fedAt = useRef<Record<string, number>>({});
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "animalFed" || typeof payload?.propId !== "string") return;
        fedAt.current[payload.propId] = performance.now() / 1000;
        setHearts({ id: payload.propId, at: Date.now() });
        playSfx("pluck");
      }),
    [subscribeMessages]
  );
  useEffect(() => {
    if (!hearts) return;
    const t = window.setTimeout(() => setHearts(null), 2200);
    return () => window.clearTimeout(t);
  }, [hearts]);
  const dtRef = useRef(0);
  useFrame(({ clock }, dt) => {
    dtRef.current = dt;
    const t = clock.elapsedTime;
    // (toward the river, +x, and back: whoever sits on it sways with it, Avatar's `swing`)
    if (parts.ropeSwing) parts.ropeSwing.rotation.z = swingAngle(t);
    const now = performance.now() / 1000;
    if (parts.head) {
      // four seconds' grazing, three looking about
      const cycle = t % 7;
      const down = cycle < 4 ? Math.min(1, cycle / 0.6, (4 - cycle) / 0.6) : 0;
      const joy = now - (fedAt.current.animal_deer ?? -99) < 2 ? 1 : 0;
      parts.head.rotation.x = parts.headRest + (joy ? 0 : down * 0.75) + 0.04 * Math.sin(t * 3.1);
      parts.head.rotation.y = cycle >= 4 ? 0.4 * Math.sin((cycle - 4) * 1.7) : 0;
    }
    if (parts.deer) {
      const j = now - (fedAt.current.animal_deer ?? -99);
      // (on the ground where it wanders)
      parts.deer.position.y = forestLand(parts.deer.position.x, parts.deer.position.z) + (j < 1.2 ? Math.abs(Math.sin(j * Math.PI * 2.5)) * 0.12 : 0);
      // its wander: graze a while, then amble to the next spot near home (never while being fed)
      const w = parts.deerWalk;
      const dx = w.to.x - parts.deer.position.x;
      const dz = w.to.z - parts.deer.position.z;
      const d = Math.hypot(dx, dz);
      if (t < w.grazeUntil || j < 2) {
        // grazing (the head's cycle above)
      } else if (d > 0.03) {
        const step = Math.min(d, DEER_PACE * Math.min(0.1, dtRef.current));
        parts.deer.position.x += (dx / d) * step;
        parts.deer.position.z += (dz / d) * step;
        w.yaw = Math.atan2(dx, dz);
      } else {
        w.to = roamSpot(parts.deerHome, DEER_ROAM);
        w.grazeUntil = t + 4 + Math.random() * 5;
      }
      let turn = w.yaw - parts.deer.rotation.y;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      parts.deer.rotation.y += turn * 0.06;
    }
    const fed = now - (fedAt.current.animal_rabbits ?? -99) < 2;
    for (const r of parts.rabbits) {
      // now and then a hop (and sometimes a turn); fed, a bouncing fit of joy
      if (t > r.next) {
        // a hop to a spot near home (turning to face it)
        r.hopAt = t;
        r.next = t + 1.8 + Math.random() * 2.6;
        r.from = { x: r.node.position.x, z: r.node.position.z };
        const near = roamSpot(r.home, RABBIT_ROAM);
        const dx = near.x - r.from.x;
        const dz = near.z - r.from.z;
        const d = Math.hypot(dx, dz);
        // (a hop is short: a quarter metre at most toward it)
        const step = Math.min(0.25, d);
        r.to = d > 0.01 ? { x: r.from.x + (dx / d) * step, z: r.from.z + (dz / d) * step } : { ...r.from };
        if (d > 0.01) r.yaw = Math.atan2(dx, dz);
      }
      const since = t - r.hopAt;
      const k = Math.min(1, since / 0.35);
      if (!fed) {
        r.node.position.x = r.from.x + (r.to.x - r.from.x) * k;
        r.node.position.z = r.from.z + (r.to.z - r.from.z) * k;
      }
      const hop = fed ? Math.abs(Math.sin(t * 9)) * 0.16 : since < 0.35 ? Math.sin((since / 0.35) * Math.PI) * 0.12 : 0;
      r.node.position.y = forestLand(r.node.position.x, r.node.position.z) + hop;
      let turn = r.yaw - r.node.rotation.y;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      r.node.rotation.y += turn * 0.08;
    }
  });
  const at = hearts ? FOREST_ANIMALS.find((a) => a.propId === hearts.id) : null;
  return at ? (
    <Html key={hearts!.at} position={over(at.x, at.kind === "deer" ? 1.3 : 0.6, at.z)} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
      <div className="cozy-critter-hearts" aria-hidden>
        <span>❤️</span>
        <span>❤️</span>
        <span>❤️</span>
      </div>
    </Html>
  ) : null;
}

/** The woods' own lights: the cabin's windows, Old Flint's lantern by the adit (a flicker) and the
 *  elderwood's teal glow, brighter after dark, and a cool moon by night. */
function ForestLights() {
  const d = useContext(CampDaylightContext) ?? 0;
  const night = 1 - d;
  const elder = FOREST_TREES.find((t) => t.kind === "elderwood");
  const glow = useRef<THREE.PointLight>(null);
  const lantern = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (glow.current) glow.current.intensity = (1.0 + 3.4 * night) * (0.9 + 0.1 * Math.sin(t * 0.9));
    if (lantern.current) lantern.current.intensity = (0.5 + 1.5 * night) * (0.88 + 0.08 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 17.9));
  });
  return (
    <>
      <pointLight color="#ffb865" intensity={0.3 + 1.7 * night} distance={6} decay={1.6} position={over(L.cabin.x, 1.4, L.cabin.z + L.cabin.d / 2 + 0.9)} castShadow={false} />
      <pointLight ref={lantern} color="#ffb347" distance={4.2} decay={1.8} position={over(OLD_FLINT.x + Math.sin(OLD_FLINT.yaw) * 0.35, 1.45, OLD_FLINT.z + Math.cos(OLD_FLINT.yaw) * 0.35)} castShadow={false} />
      {elder && <pointLight ref={glow} color="#8ff0d8" distance={13} decay={1.4} position={over(elder.x + 1.6, 3.4, elder.z + 1.6)} castShadow={false} />}
      {night > 0.02 && <directionalLight color="#a9bcec" intensity={0.5 * night} position={[-10, 20, -14]} castShadow={false} />}
      {night > 0.02 && <hemisphereLight args={["#7a90d0", "#22322a", 0.44 * night]} />}
    </>
  );
}

const MOTE_GEO = new THREE.SphereGeometry(0.05, 6, 4);
const MOTE_MAT = new THREE.MeshBasicMaterial({ color: "#b6fff0", toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
const MOTE_COUNT = 46;
/** The Elderwood's spirit lights: motes rising in a slow spiral round the great tree, through its
 *  vines and up into its crown, day and night (brighter after dark). One instanced draw. */
function ElderMotes() {
  const d = useContext(CampDaylightContext) ?? 0;
  const elder = FOREST_TREES.find((t) => t.kind === "elderwood");
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(MOTE_GEO, MOTE_MAT, MOTE_COUNT);
    m.frustumCulled = false;
    m.raycast = noRaycast;
    return m;
  }, []);
  const seeds = useMemo(() => Array.from({ length: MOTE_COUNT }, (_, i) => ({ a: Math.random() * 6.283, r: 1.4 + Math.random() * 3.4, rise: 0.12 + Math.random() * 0.2, turn: (0.08 + Math.random() * 0.16) * (i % 2 ? 1 : -1), p: Math.random(), s: 0.6 + Math.random() * 0.9 })), []);
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh]
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  const base = elder ? forestLand(elder.x, elder.z) : 0;
  useFrame(({ clock }) => {
    if (!elder) return;
    const t = clock.elapsedTime;
    const night = 1 - d;
    seeds.forEach((s, i) => {
      // (each rises from the roots to the crown, fading in and out at the ends)
      const u = (s.p + t * s.rise * 0.12) % 1;
      const a = s.a + t * s.turn;
      const r = s.r * (0.75 + 0.25 * Math.sin(u * Math.PI));
      const fade = Math.sin(u * Math.PI) * (0.55 + 0.45 * Math.sin(t * 1.7 + i));
      const sc = Math.max(0, fade) * s.s * (0.55 + 0.75 * night);
      m.makeScale(sc, sc, sc).setPosition(elder.x + Math.cos(a) * r, base + 0.3 + u * 6.4, elder.z + Math.sin(a) * r);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return elder ? <primitive object={mesh} /> : null;
}

const FIREFLY_GEO = new THREE.SphereGeometry(0.035, 6, 4);
const FIREFLY_MAT = new THREE.MeshBasicMaterial({ color: "#d6ff7a", toneMapped: false, transparent: true });
const FIREFLY_COUNT = 54;
/** The river's course (inside the island), for the fireflies along its banks. */
const RIVER_BANKS = forestRiver(6).filter(([x, z]) => Math.abs(x) < L.half - 0.7 && Math.abs(z) < L.half - 0.7);
/** Where a fish may rise, where the mist lies and where the dragonflies keep (all along the river). */
const RISE_SPOTS = RIVER_BANKS.map(([x, z]): [number, number] => [x, z]);
const MIST_SPOTS = RIVER_BANKS.filter((_, i) => i % 3 === 0).map(([x, z, w]): [number, number, number] => [x, z, w]);
const DRAGON_SPOTS = RIVER_BANKS.filter((_, i) => i % 12 === 5).map(([x, z]): [number, number] => [x, z]);
const dragonY = () => WATER_Y;
/** The lantern posts' lanterns (on a bracket off each post) and the top of Bramble's chimney. */
const WOODS_LAMPS = L.dressing.lanternPosts.map(([x, z]) => ({ x: x + 0.24, y: forestLand(x, z) + 1.22, z: z + 0.24 }));
const CHIMNEY: [number, number, number] = [L.cabin.x - L.cabin.w / 2 - 0.3, forestLand(L.cabin.x - L.cabin.w / 2 - 0.3, L.cabin.z - 0.1) + 3.85, L.cabin.z - 0.1];
/** Fireflies drifting over the glen, the shrine and the birches, blinking: by night only. */
function Fireflies() {
  const d = useContext(CampDaylightContext) ?? 0;
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(FIREFLY_GEO, FIREFLY_MAT, FIREFLY_COUNT);
    m.frustumCulled = false;
    m.raycast = noRaycast;
    return m;
  }, []);
  const seeds = useMemo(
    () =>
      Array.from({ length: FIREFLY_COUNT }, (_, i) => {
        if (i % 3 === 2) {
          // along the river's banks, low over the water's edge
          const [rx, rz, rw] = RIVER_BANKS[Math.floor(Math.random() * RIVER_BANKS.length)];
          const side = Math.random() < 0.5 ? 1 : -1;
          return { x: rx + side * (rw + 0.2 + Math.random() * 0.5), z: rz + (Math.random() - 0.5) * 0.6, y: 0.25 + Math.random() * 0.8, p: Math.random() * 10, s: 0.25 + Math.random() * 0.35 };
        }
        // (over the Golden Glen and the birch grove, each over the ground where it drifts)
        const zone = i % 3 === 0 ? { x: -9.6, z: -3.4, r: 3.8 } : { x: -10, z: 5.4, r: 4.6 };
        const x = zone.x + (Math.random() - 0.5) * zone.r * 2;
        const z = zone.z + (Math.random() - 0.5) * zone.r * 2;
        return { x, z, y: forestLand(x, z) + 0.5 + Math.random() * 1.6, p: Math.random() * 10, s: 0.3 + Math.random() * 0.5 };
      }),
    []
  );
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh]
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const night = 1 - d;
    mesh.visible = night > 0.05;
    if (!mesh.visible) return;
    seeds.forEach((s, i) => {
      const blink = Math.max(0, Math.sin(t * 1.3 + s.p * 3)) ** 3;
      const sc = blink * night;
      m.makeScale(sc, sc, sc).setPosition(s.x + Math.sin(t * s.s + s.p) * 0.7, s.y + Math.sin(t * 0.8 + s.p) * 0.25, s.z + Math.cos(t * s.s * 0.8 + s.p) * 0.7);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

useGLTF.preload(BRAMBLE_URL);
useGLTF.preload(FINLEY_URL);
useGLTF.preload(OLD_FLINT_URL);
