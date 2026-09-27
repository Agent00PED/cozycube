import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PlayerState } from "@shared/types";
import { TREES, type TreeKind, type TreeStage } from "@shared/chop";
import { FOREST_ANIMALS, FOREST_LAYOUT as L, FOREST_TREES, TREE_REACH, type ForestTree } from "@shared/worlds/forest";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { CampNpc, type NpcTalk } from "../entities/CampNpc";
import { modelUrl } from "../assetVersion";
import { playSfx } from "../audio/sfx";
import { GEO, matte, noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { CampDaylightContext } from "./campDay";
import { OcclusionDriver, ditherOccluder } from "./occlusionDither";
import { forestTarget } from "./forestTarget";

// The Whispering Woods (map "whispering_woods"), behind the campfire's archway. The island is one
// Blender model, forest.glb (scripts/blender/build_forest.py, laid out from shared/worlds/forest.ts):
// this file loads it and brings it to life.
//
//   the trees     the twenty trees you fell, drawn from the model's Tree_<kind>_<stage> looks, one
//                 instanced draw per part per look in use: each at its node, as the room says it is
//                 growing back (stump, sprout, sapling, mature). One coming down swings over, away
//                 from whoever felled it, bounces and sinks away, the stump already under it
//   the target    the nearest mature tree within reach of you wears a soft white outline: a click,
//                 a tap or E fells it
//   Bramble       the bear ranger at his counter (bramble.glb): he trades wood and fish, sells the
//                 top axes and rods, and his cabin's windows glow at night
//   the animals   the deer grazing by the glen's path, looking up now and then; the rabbits hopping
//                 by the splitting block; fed, they hop for joy
//   the rapids    the water running down the east edge, its foam streaming
//   the wind      the canopy sways; trees between you and the camera thin to let you through
//   the light     the camp's 24-minute day (campDay): fireflies and the elderwood's glow by night

export const FOREST_URL = modelUrl("forest.glb");
export const BRAMBLE_URL = modelUrl("bramble.glb");

const FOREST_TIME = { value: 0 };
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
/** The ground decals, each nudged toward the camera in the depth test. */
const DECAL_OFFSET: Record<string, number> = { FW_BirchFloor: -1, FW_RidgeFloor: -1, FW_GlenFloor: -1, FW_ShrineFloor: -1, FW_StoneDark: -1, FW_Dirt: -2 };
/** What thins when it stands between you and the camera. */
const OCCLUDERS = /^FW_(Pine|Birch|Cedar|Maple|Elder|Log|Roof|PlankDark|Bark)/;
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
        // the foam streams down the rapids (toward the camera), breaking up and re-forming
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

/** A tree's yaw at its node: fixed per node, so every client plants it the same way round. */
function yawOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 10007;
  return (h / 10007) * Math.PI * 2;
}

function parseStages(raw: string): Record<string, TreeStage> {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Record<string, TreeStage>) : {};
  } catch {
    return {};
  }
}

interface ForestWorldProps {
  onFloorClick: (x: number, z: number) => void;
  players: Record<string, PlayerState>;
  localSessionId: string | null;
  /** The room's growing-back trees (JSON: node id -> stage; missing = mature). */
  forest: string;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onUseProp: (propId: string) => void;
}

const BRAMBLE_TALK: NpcTalk = {
  height: 1.6,
  greet: {
    inside: (x, z) => Math.hypot(x - L.counter.x, z - L.counter.z) < 3.2,
    lines: ["Welcome to my trading post, friend", "Mind the rapids, they've got a mind of their own", "Fine day for felling, isn't it?", "Bring me good timber and I'll pay you fair"],
  },
  on: {
    treeFelled: () => (Math.random() < 0.25 ? "Timberrr!" : null),
  },
};

export function ForestWorld({ onFloorClick, players, localSessionId, forest, subscribeMessages, onUseProp }: ForestWorldProps) {
  const stages = useMemo(() => parseStages(forest), [forest]);
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  useFrame((_, dt) => {
    FOREST_TIME.value += dt;
  });
  // E fells the tree you are next to (the same as a click on it)
  const target = useRef<ForestTree | null>(null);
  const useRefProp = useRef(onUseProp);
  useRefProp.current = onUseProp;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (target.current) useRefProp.current(`tree_${target.current.id}`);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);
  return (
    <group>
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[L.half * 2, L.half * 2, 1]} onPointerDown={floorClick} />
      <ModelBoundary what="forest.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <ForestModel stages={stages} players={players} localSessionId={localSessionId} subscribeMessages={subscribeMessages} target={target} />
        </Suspense>
      </ModelBoundary>
      <CampNpc url={BRAMBLE_URL} what="bramble.glb" prefix="Bramble" at={L.bramble} waveEvent="brambleWave" standIn={<BrambleStandIn />} subscribeMessages={subscribeMessages} talk={BRAMBLE_TALK} />
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
const BRAMBLE_STAND_IN = matte("#7a5236", 0.85);
function BrambleStandIn() {
  return <mesh geometry={GEO.box} material={BRAMBLE_STAND_IN} position={[0, 0.6, 0]} scale={[0.6, 1.2, 0.5]} raycast={noRaycast} />;
}

interface TemplatePart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
}

const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.BackSide, transparent: true, opacity: 0.85, depthWrite: false });
OUTLINE_MAT.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normal * 0.055;");
};

interface Falling {
  id: string;
  kind: TreeKind;
  at: number;
  x: number;
  z: number;
  /** The way it falls (a unit vector on the ground). */
  dx: number;
  dz: number;
}
const FALL_S = 1.25;
const SINK_S = 0.9;

function ForestModel({ stages, players, localSessionId, subscribeMessages, target }: { stages: Record<string, TreeStage>; players: Record<string, PlayerState>; localSessionId: string | null; subscribeMessages: (listener: RoomMessageListener) => () => void; target: React.MutableRefObject<ForestTree | null> }) {
  const { scene } = useGLTF(FOREST_URL);
  const livePlayers = useRef(players);
  livePlayers.current = players;
  // the model's materials: the decals nudged forward, the foliage swaying, the occluders dithering,
  // the rapids flowing; the tree looks lifted out as templates (drawn instanced below)
  const templates = useMemo(() => {
    const out = new Map<string, TemplatePart[]>();
    scene.traverse((o) => {
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
    scene.updateMatrixWorld(true);
    for (const kind of Object.keys(TREES) as TreeKind[]) {
      for (const stage of ["stump", "sprout", "sapling", "mature"] as TreeStage[]) {
        const node = scene.getObjectByName(`Tree_${kind}_${stage}`);
        if (!node) continue;
        node.visible = false;
        const inv = node.matrixWorld.clone().invert();
        const parts: TemplatePart[] = [];
        node.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, matrix: inv.clone().multiply(mesh.matrixWorld) });
        });
        out.set(`${kind}:${stage}`, parts);
      }
    }
    return out;
  }, [scene]);

  // one instanced mesh per part of every look, as many instances as there are trees of its kind
  const instanced = useMemo(() => {
    const out: { key: string; mesh: THREE.InstancedMesh; part: TemplatePart }[] = [];
    templates.forEach((parts, key) => {
      const kind = key.split(":")[0] as TreeKind;
      const most = FOREST_TREES.filter((t) => t.kind === kind).length;
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, most);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.raycast = noRaycast;
        out.push({ key, mesh, part });
      }
    });
    return out;
  }, [templates]);
  useEffect(
    () => () => {
      instanced.forEach((i) => i.mesh.dispose());
      forestTarget.id = null;
    },
    [instanced]
  );
  // (re)place every tree as its stage changes
  useEffect(() => {
    const byKey = new Map<string, ForestTree[]>();
    for (const t of FOREST_TREES) {
      const key = `${t.kind}:${stages[t.id] ?? "mature"}`;
      byKey.set(key, [...(byKey.get(key) ?? []), t]);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const { key, mesh, part } of instanced) {
      const trees = byKey.get(key) ?? [];
      trees.forEach((t, i) => {
        q.setFromAxisAngle(up, yawOf(t.id));
        m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(1, 1, 1)).multiply(part.matrix);
        mesh.setMatrixAt(i, m);
      });
      mesh.count = trees.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [instanced, stages]);

  // a tree coming down: the room says who felled it; it swings over away from them
  const [falling, setFalling] = useState<Falling[]>([]);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "treeFelled") return;
        const node = FOREST_TREES.find((t) => t.id === payload?.tree);
        if (!node) return;
        const who = livePlayers.current[payload.sessionId];
        let dx = who ? node.x - who.x : 1;
        let dz = who ? node.z - who.z : 0;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d;
        dz /= d;
        setFalling((f) => [...f.filter((x) => performance.now() / 1000 - x.at < FALL_S + SINK_S), { id: node.id, kind: node.kind, at: performance.now() / 1000, x: node.x, z: node.z, dx, dz }]);
        if (Math.hypot(node.x - cameraFocus.x, node.z - cameraFocus.z) < 14) {
          playSfx("woodSnap");
          window.setTimeout(() => playSfx("thunk"), FALL_S * 1000 - 120);
        }
      }),
    [subscribeMessages]
  );
  useEffect(() => {
    if (!falling.length) return;
    const t = window.setTimeout(() => setFalling((f) => f.filter((x) => performance.now() / 1000 - x.at < FALL_S + SINK_S)), (FALL_S + SINK_S) * 1000 + 50);
    return () => window.clearTimeout(t);
  }, [falling]);

  // the nearest mature tree in reach of you: outlined, and E fells it
  const [outlined, setOutlined] = useState<string | null>(null);
  useFrame(() => {
    let best: ForestTree | null = null;
    let bestD = TREE_REACH;
    for (const t of FOREST_TREES) {
      if ((stages[t.id] ?? "mature") !== "mature") continue;
      const d = Math.hypot(t.x - cameraFocus.x, t.z - cameraFocus.z);
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    const me = localSessionId ? livePlayers.current[localSessionId] : null;
    if (me && me.action !== "") best = null;
    target.current = best;
    const id = best?.id ?? null;
    forestTarget.id = id;
    if (id !== outlined) setOutlined(id);
  });

  return (
    <>
      <primitive object={scene} />
      {instanced.map(({ key, mesh, part }, i) => (
        <primitive key={`${key}:${i}:${part.geometry.uuid}`} object={mesh} />
      ))}
      {falling.map((f) => (
        <FallingTree key={`${f.id}:${f.at}`} fall={f} parts={templates.get(`${f.kind}:mature`) ?? []} />
      ))}
      {outlined && <TreeOutline tree={FOREST_TREES.find((t) => t.id === outlined)!} parts={templates.get(`${FOREST_TREES.find((t) => t.id === outlined)!.kind}:mature`) ?? []} />}
      <Animals scene={scene} subscribeMessages={subscribeMessages} />
    </>
  );
}

/** The target tree's soft white rim (an inverted hull, pulsing a little). */
function TreeOutline({ tree, parts }: { tree: ForestTree; parts: TemplatePart[] }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    OUTLINE_MAT.opacity = 0.55 + 0.25 * Math.sin(clock.elapsedTime * 4);
  });
  return (
    <group ref={group} position={[tree.x, 0, tree.z]} rotation={[0, yawOf(tree.id), 0]}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={OUTLINE_MAT} matrixAutoUpdate={false} matrix={p.matrix} raycast={noRaycast} renderOrder={2} />
      ))}
      <Html position={[0, 0.25, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
        <div className="rounded-full border border-[#4A3A30] bg-[#231B18]/85 px-2 py-0.5 text-[11px] font-bold text-[#F7EBE1] shadow" style={{ whiteSpace: "nowrap" }}>
          🪓 {TREES[tree.kind].name} · T{TREES[tree.kind].tier} <span className="opacity-70">(E)</span>
        </div>
      </Html>
    </group>
  );
}

/** A felled tree: over it goes (easing in, as trees do), a bounce as it lands, then it sinks away. */
function FallingTree({ fall, parts }: { fall: Falling; parts: TemplatePart[] }) {
  const pivot = useRef<THREE.Group>(null);
  const axis = useMemo(() => new THREE.Vector3(fall.dz, 0, -fall.dx), [fall]);
  const yaw = yawOf(fall.id);
  useFrame(() => {
    const g = pivot.current;
    if (!g) return;
    const t = performance.now() / 1000 - fall.at;
    const u = Math.min(1, t / FALL_S);
    let angle = (Math.PI / 2) * u * u * u;
    if (t > FALL_S) angle = Math.PI / 2 - 0.06 * Math.exp(-(t - FALL_S) * 9) * Math.abs(Math.sin((t - FALL_S) * 20));
    g.quaternion.setFromAxisAngle(axis, angle);
    const sink = Math.max(0, t - FALL_S - 0.25) / (SINK_S - 0.25);
    g.position.y = -sink * 0.9;
    g.scale.setScalar(1 - sink * 0.3);
  });
  return (
    <group position={[fall.x, 0, fall.z]}>
      <group ref={pivot}>
        <group rotation={[0, yaw, 0]}>
          {parts.map((p, i) => (
            <mesh key={i} geometry={p.geometry} material={p.material} matrixAutoUpdate={false} matrix={p.matrix} raycast={noRaycast} />
          ))}
        </group>
      </group>
    </group>
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
const FIREFLY_COUNT = 46;
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
        const zone = i % 3 === 0 ? { x: -6, z: -8.5, r: 4 } : i % 3 === 1 ? { x: 3.2, z: -9, r: 3 } : { x: -7.5, z: 0.5, r: 4.5 };
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
