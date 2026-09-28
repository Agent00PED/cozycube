import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { parseWorldEvent, type PlayerState } from "@shared/types";
import { parseTrees } from "@shared/chop";
import { FINLEY, FOREST_ANIMALS, FOREST_LAYOUT as L, FOREST_TREES, forestRiver } from "@shared/worlds/forest";
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
import { SurgeRipples } from "./SurgeRipples";
import { WoodsFauna } from "./WoodsFauna";

// The Whispering Woods (map "whispering_woods"), behind the campfire's archway. The island is one
// Blender model, forest.glb (scripts/blender/build_forest.py, laid out from shared/worlds/forest.ts):
// this file loads it and brings it to life.
//
//   the trees     the twenty-five trees you fell (and a Colossal Titan while one stands): FellableTrees,
//                 from trees.glb, each its own size, as the room says it is growing back
//   Bramble       the bear ranger at his counter (bramble.glb): he trades wood and fish, sells the
//                 top axes and rods, and his cabin's windows glow at night
//   the animals   the deer grazing by the glen's path, looking up now and then; the rabbits hopping
//                 by the splitting block; fed, they hop for joy
//   the river     meandering in off the north edge and out off the east, its water flowing and its
//                 foam streaming round the rocks; a King-Size Surge's golden ripples on it
//   the wind      the canopy sways; trees between you and the camera thin to let you through
//   the light     the camp's 24-minute day (campDay): fireflies and the elderwood's glow by night

export const FOREST_URL = modelUrl("forest.glb");
export const BRAMBLE_URL = modelUrl("bramble.glb");
export const FINLEY_URL = modelUrl("finley.glb");

const FOREST_TIME = { value: 0 };
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
/** The ground decals, each nudged toward the camera in the depth test. */
const DECAL_OFFSET: Record<string, number> = { FW_Meadow: -1, FW_StoneDark: -1, FW_Bank: -2, FW_Dirt: -2 };
/** What thins when it stands between you and the camera. */
const OCCLUDERS = /^FW_(Pine|Birch|Cedar|Maple|Elder|Log|Roof|PlankDark|Bark)/;
/** The river's water: its height (the surge's ripples float on it). */
const WATER_Y = L.river.water;
/** Foliage that sways in the wind. */
const SWAYERS = /^FW_(PineNeedle|BirchLeaf|CedarNeedle|MapleLeaf|ElderLeaf)/;

function swayFoliage(m: THREE.Material) {
  if (m.userData.swaying) return;
  m.userData.swaying = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = FOREST_TIME;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float swayH = max(0.0, transformed.y - 0.6);
      float swayPh = transformed.x * 0.4 + transformed.z * 0.3;
      transformed.x += sin(uTime * 1.1 + swayPh) * 0.02 * swayH;
      transformed.z += sin(uTime * 0.8 + swayPh * 1.3) * 0.015 * swayH;`
    );
  };
  m.needsUpdate = true;
}

function flowRapids(m: THREE.Material, foam: boolean) {
  if (m.userData.flowing) return;
  m.userData.flowing = true;
  if (foam) {
    m.transparent = true;
    m.depthWrite = false;
  }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = FOREST_TIME;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFlowPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vFlowPos;\nuniform float uTime;").replace(
      "#include <color_fragment>",
      foam
        ? `#include <color_fragment>
        // the foam streams along the river, breaking up and re-forming
        float fw = sin(vFlowPos.z * 3.1 - uTime * 3.4 + sin(vFlowPos.x * 5.0) * 1.5);
        diffuseColor.a *= 0.25 + 0.75 * smoothstep(-0.3, 0.7, fw);`
        : `#include <color_fragment>
        float w1 = sin(vFlowPos.z * 2.2 - uTime * 2.6 + sin(vFlowPos.x * 3.4 + uTime * 0.7) * 1.4);
        float w2 = sin(vFlowPos.z * 5.7 - uTime * 4.1 + vFlowPos.x * 2.6);
        float streak = smoothstep(0.7, 1.0, w1 * 0.6 + w2 * 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.88 + 0.1 * w1), vec3(0.8, 0.92, 0.97), streak * 0.35);`
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
  useFrame((_, dt) => {
    FOREST_TIME.value += dt;
  });
  return (
    <group>
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[L.half * 2, L.half * 2, 1]} onPointerDown={floorClick} />
      <ModelBoundary what="forest.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <ForestModel subscribeMessages={subscribeMessages} />
        </Suspense>
      </ModelBoundary>
      <FellableTrees mapId="whispering_woods" trees={treeState} players={players} localSessionId={localSessionId} subscribeMessages={subscribeMessages} onUseProp={onUseProp} />
      <SurgeRipples event={wonder} mapId="whispering_woods" waterY={WATER_Y} />
      <CampNpc url={BRAMBLE_URL} what="bramble.glb" prefix="Bramble" at={L.bramble} waveEvent="brambleWave" standIn={<BrambleStandIn />} subscribeMessages={subscribeMessages} talk={BRAMBLE_TALK} />
      <CampNpc url={FINLEY_URL} what="finley.glb" prefix="Finley" at={FINLEY} waveEvent="finleyWave" standIn={<FinleyStandIn />} subscribeMessages={subscribeMessages} talk={FINLEY_TALK} />
      <ForestLights />
      <Fireflies />
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
      const offset = DECAL_OFFSET[m.name];
      if (offset !== undefined) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = offset;
        m.polygonOffsetUnits = offset;
      }
      if (m.emissive && m.emissive.getHex() !== 0) m.toneMapped = false;
      if (m.name === "FW_Water") flowRapids(m, false);
      if (m.name === "FW_Foam") flowRapids(m, true);
      if (SWAYERS.test(m.name)) swayFoliage(m);
      if (OCCLUDERS.test(m.name)) ditherOccluder(m);
    });
  }, [scene]);
  return (
    <>
      <primitive object={scene} />
      <Animals scene={scene} subscribeMessages={subscribeMessages} />
      <WoodsFauna scene={scene} />
    </>
  );
}

/** The deer grazes and looks up; the rabbits hop about; fed, they hop for joy (and hearts rise). */
function Animals({ scene, subscribeMessages }: { scene: THREE.Object3D; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const parts = useMemo(() => {
    const deer = scene.getObjectByName("Animal_Deer") ?? null;
    const head = scene.getObjectByName("Animal_Deer_Head") ?? null;
    const rabbits = [1, 2, 3].map((k) => scene.getObjectByName(`Animal_Rabbit_${k}`)).filter((o): o is THREE.Object3D => !!o);
    return { deer, deerY: deer?.position.y ?? 0, head, headRest: head?.rotation.x ?? 0, rabbits: rabbits.map((r) => ({ node: r, y: r.position.y, yaw: r.rotation.y, next: Math.random() * 3, hopAt: -99 })) };
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
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
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
      parts.deer.position.y = parts.deerY + (j < 1.2 ? Math.abs(Math.sin(j * Math.PI * 2.5)) * 0.12 : 0);
    }
    const fed = now - (fedAt.current.animal_rabbits ?? -99) < 2;
    for (const r of parts.rabbits) {
      // now and then a hop (and sometimes a turn); fed, a bouncing fit of joy
      if (t > r.next) {
        r.hopAt = t;
        r.next = t + 1.8 + Math.random() * 2.6;
        if (Math.random() < 0.35) r.yaw += (Math.random() - 0.5) * 1.6;
      }
      const since = t - r.hopAt;
      const hop = fed ? Math.abs(Math.sin(t * 9)) * 0.16 : since < 0.35 ? Math.sin((since / 0.35) * Math.PI) * 0.12 : 0;
      r.node.position.y = r.y + hop;
      r.node.rotation.y += (r.yaw - r.node.rotation.y) * 0.08;
    }
  });
  const at = hearts ? FOREST_ANIMALS.find((a) => a.propId === hearts.id) : null;
  return at ? (
    <Html key={hearts!.at} position={[at.x, at.kind === "deer" ? 1.3 : 0.6, at.z]} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
      <div className="cozy-critter-hearts" aria-hidden>
        <span>❤️</span>
        <span>❤️</span>
        <span>❤️</span>
      </div>
    </Html>
  ) : null;
}

/** The woods' own lights: the cabin's windows and the elderwood's teal glow, brighter after dark,
 *  and a cool moon by night. */
function ForestLights() {
  const d = useContext(CampDaylightContext) ?? 0;
  const night = 1 - d;
  const elder = FOREST_TREES.find((t) => t.kind === "elderwood");
  const glow = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.intensity = (0.6 + 1.6 * night) * (0.9 + 0.1 * Math.sin(clock.elapsedTime * 1.3));
  });
  return (
    <>
      <pointLight color="#ffb865" intensity={0.3 + 1.7 * night} distance={6} decay={1.6} position={[L.cabin.x, 1.4, L.cabin.z + L.cabin.d / 2 + 0.9]} castShadow={false} />
      {elder && <pointLight ref={glow} color="#8ff0d8" distance={7} decay={1.5} position={[elder.x, 2.6, elder.z]} castShadow={false} />}
      {night > 0.02 && <directionalLight color="#9fb4e8" intensity={0.35 * night} position={[-10, 20, -14]} castShadow={false} />}
      {night > 0.02 && <hemisphereLight args={["#6f86c8", "#1c2a1f", 0.3 * night]} />}
    </>
  );
}

const FIREFLY_GEO = new THREE.SphereGeometry(0.035, 6, 4);
const FIREFLY_MAT = new THREE.MeshBasicMaterial({ color: "#d6ff7a", toneMapped: false, transparent: true });
const FIREFLY_COUNT = 54;
/** The river's course (inside the island), for the fireflies along its banks. */
const RIVER_BANKS = forestRiver(6).filter(([x, z]) => Math.abs(x) < 11.3 && Math.abs(z) < 11.3);
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
        const zone = i % 3 === 0 ? { x: -6, z: -8.5, r: 4 } : { x: -7.5, z: 0.5, r: 4.5 };
        return { x: zone.x + (Math.random() - 0.5) * zone.r * 2, z: zone.z + (Math.random() - 0.5) * zone.r * 2, y: 0.5 + Math.random() * 1.6, p: Math.random() * 10, s: 0.3 + Math.random() * 0.5 };
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
