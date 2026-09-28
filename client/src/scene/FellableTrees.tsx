import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { MapId, PlayerState } from "@shared/types";
import { TITAN, TREES, type TreeKind, type TreeStage, type TreeSync } from "@shared/chop";
import { FELL_TREES, fellReach, type FellTree } from "@shared/worlds/trees";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { modelUrl } from "../assetVersion";
import { playSfx } from "../audio/sfx";
import { GEO, matte, noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { ditherOccluder } from "./occlusionDither";
import { treeTarget } from "./treeTarget";

// The trees you fell, on the campfire's clearing and in the Whispering Woods: every kind's looks
// (stump, sprout, sapling, mature) come from one Blender model, trees.glb (build_forest.py), each
// drawn instanced (one draw per part per look in use), at its node, its yaw fixed per node and its
// size as the room rolled it (0.85-1.35x; a Colossal Titan 2x). A stump is as wide as its trunk was
// and no taller (scaled s, 1, s). The nearest grown tree in reach wears a soft white rim (no label:
// the action dock names it): a click, a tap or E fells it. One coming down swings over, away from
// whoever felled it, bounces and sinks away, the stump already under it. A Titan glows amber, motes
// of it drifting up round its trunk.

export const TREES_URL = modelUrl("trees.glb");

const TREE_TIME = { value: 0 };
const STAGES: TreeStage[] = ["stump", "sprout", "sapling", "mature"];
/** Foliage that sways in the wind (the tree kinds' needles and leaves). */
const SWAYERS = /(Needle|Leaf)/;

function swayFoliage(m: THREE.Material) {
  if (m.userData.swaying) return;
  m.userData.swaying = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uTreeTime = TREE_TIME;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTreeTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float swayH = max(0.0, transformed.y - 0.6);
      float swayPh = transformed.x * 0.4 + transformed.z * 0.3;
      transformed.x += sin(uTreeTime * 1.1 + swayPh) * 0.02 * swayH;
      transformed.z += sin(uTreeTime * 0.8 + swayPh * 1.3) * 0.015 * swayH;`
    );
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${key ? key() : ""}|treeSway`;
  m.needsUpdate = true;
}

/** A tree's yaw at its node: fixed per node, so every client plants it the same way round. */
export function treeYaw(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 10007;
  return (h / 10007) * Math.PI * 2;
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
// (the rim clears away where its tree stands over you: otherwise it would fill the tree's dither
// holes, a lattice where you should be)
ditherOccluder(OUTLINE_MAT, 0);

interface Falling {
  id: string;
  kind: TreeKind;
  scale: number;
  at: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
}
const FALL_S = 1.25;
const SINK_S = 0.9;

export interface FellableTreesProps {
  mapId: MapId;
  /** The room's trees (node id -> stage, size, damage). */
  trees: Record<string, TreeSync>;
  players: Record<string, PlayerState>;
  localSessionId: string | null;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onUseProp: (propId: string) => void;
}

export function FellableTrees(props: FellableTreesProps) {
  // E fells the tree you are next to (the same as a click on it)
  const useProp = useRef(props.onUseProp);
  useProp.current = props.onUseProp;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (treeTarget.id) useProp.current(`tree_${treeTarget.id}`);
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
      treeTarget.id = null;
    };
  }, []);
  useFrame((_, dt) => {
    TREE_TIME.value += dt;
  });
  return (
    <ModelBoundary what="trees.glb" fallback={<StandIns {...props} />}>
      <Suspense fallback={<StandIns {...props} />}>
        <TreeModels {...props} />
      </Suspense>
    </ModelBoundary>
  );
}

/** The map's trees standing now: its own (a Titan only while the room has it). */
function standing(mapId: MapId, trees: Record<string, TreeSync>): FellTree[] {
  return FELL_TREES.filter((t) => t.map === mapId && (!t.titan || !!trees[t.id]));
}
function sizeOf(t: FellTree, sync: TreeSync | undefined): number {
  return t.titan ? TITAN.scale : Math.max(0.5, Math.min(2.5, sync?.scale ?? 1));
}

const STAND_IN_TRUNK = matte("#5a3e2b", 0.85);
const STAND_IN_TOP = matte("#3f6b3a", 0.85);
/** Plain trunks and cones while trees.glb loads (or if it cannot). */
function StandIns({ mapId, trees }: FellableTreesProps) {
  return (
    <group>
      {standing(mapId, trees).map((t) => {
        const sync = trees[t.id];
        const s = sizeOf(t, sync);
        const stage = sync?.stage ?? "mature";
        return (
          <group key={t.id} position={[t.x, 0, t.z]} scale={[s, stage === "stump" ? 1 : s, s]}>
            <mesh geometry={GEO.box} material={STAND_IN_TRUNK} position={[0, stage === "stump" ? 0.12 : 0.5, 0]} scale={[0.3, stage === "stump" ? 0.24 : 1, 0.3]} raycast={noRaycast} />
            {stage !== "stump" && <mesh geometry={GEO.box} material={STAND_IN_TOP} position={[0, stage === "mature" ? 1.6 : 0.8, 0]} scale={stage === "mature" ? [1.2, 1.6, 1.2] : [0.5, 0.6, 0.5]} raycast={noRaycast} />}
          </group>
        );
      })}
    </group>
  );
}

function TreeModels({ mapId, trees, players, localSessionId, subscribeMessages }: FellableTreesProps) {
  const { scene } = useGLTF(TREES_URL);
  const livePlayers = useRef(players);
  livePlayers.current = players;
  const liveTrees = useRef(trees);
  liveTrees.current = trees;
  // the looks, lifted out as templates (drawn instanced below): the foliage swaying, and every part
  // thinning when it stands between you and the camera
  const templates = useMemo(() => {
    const out = new Map<string, TemplatePart[]>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (SWAYERS.test(m.name)) swayFoliage(m);
      ditherOccluder(m);
    });
    scene.updateMatrixWorld(true);
    for (const kind of Object.keys(TREES) as TreeKind[]) {
      for (const stage of STAGES) {
        const node = scene.getObjectByName(`Tree_${kind}_${stage}`);
        if (!node) continue;
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

  // one instanced mesh per part of every look, as many instances as this map has trees of its kind
  const nodes = useMemo(() => FELL_TREES.filter((t) => t.map === mapId), [mapId]);
  const instanced = useMemo(() => {
    const out: { key: string; mesh: THREE.InstancedMesh; part: TemplatePart }[] = [];
    templates.forEach((parts, key) => {
      const kind = key.split(":")[0] as TreeKind;
      const most = nodes.filter((t) => t.kind === kind).length;
      if (!most) return;
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, most);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.raycast = noRaycast;
        out.push({ key, mesh, part });
      }
    });
    return out;
  }, [templates, nodes]);
  useEffect(() => () => instanced.forEach((i) => i.mesh.dispose()), [instanced]);

  // (re)place every tree as its stage or size changes
  useEffect(() => {
    const byKey = new Map<string, FellTree[]>();
    for (const t of standing(mapId, trees)) {
      const key = `${t.kind}:${trees[t.id]?.stage ?? "mature"}`;
      byKey.set(key, [...(byKey.get(key) ?? []), t]);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (const { key, mesh, part } of instanced) {
      const list = byKey.get(key) ?? [];
      const stump = key.endsWith(":stump");
      list.forEach((t, i) => {
        const s = sizeOf(t, trees[t.id]);
        q.setFromAxisAngle(up, treeYaw(t.id));
        m.compose(pos.set(t.x, 0, t.z), q, stump ? scl.set(s, 1, s) : scl.set(s, s, s)).multiply(part.matrix);
        mesh.setMatrixAt(i, m);
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [instanced, trees, mapId]);

  // a tree coming down: the room says who felled it; it swings over away from them
  const [falling, setFalling] = useState<Falling[]>([]);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "treeFelled") return;
        const node = nodes.find((t) => t.id === payload?.tree);
        if (!node) return;
        const who = livePlayers.current[payload.sessionId];
        let dx = who ? node.x - who.x : 1;
        let dz = who ? node.z - who.z : 0;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d;
        dz /= d;
        const scale = Number(payload.scale) || sizeOf(node, liveTrees.current[node.id]);
        setFalling((f) => [...f.filter((x) => performance.now() / 1000 - x.at < FALL_S + SINK_S), { id: node.id, kind: node.kind, scale, at: performance.now() / 1000, x: node.x, z: node.z, dx, dz }]);
        if (Math.hypot(node.x - cameraFocus.x, node.z - cameraFocus.z) < 14) {
          playSfx("woodSnap");
          window.setTimeout(() => playSfx("thunk"), FALL_S * 1000 - 120);
        }
      }),
    [subscribeMessages, nodes]
  );
  useEffect(() => {
    if (!falling.length) return;
    const t = window.setTimeout(() => setFalling((f) => f.filter((x) => performance.now() / 1000 - x.at < FALL_S + SINK_S)), (FALL_S + SINK_S) * 1000 + 50);
    return () => window.clearTimeout(t);
  }, [falling]);

  // the nearest grown tree in reach of you: outlined, and E fells it
  const [outlined, setOutlined] = useState<string | null>(null);
  useFrame(() => {
    let best: FellTree | null = null;
    let bestD = Infinity;
    for (const t of standing(mapId, liveTrees.current)) {
      if ((liveTrees.current[t.id]?.stage ?? "mature") !== "mature") continue;
      const d = Math.hypot(t.x - cameraFocus.x, t.z - cameraFocus.z);
      if (d <= fellReach(t) && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    const me = localSessionId ? livePlayers.current[localSessionId] : null;
    if (me && me.action !== "") best = null;
    const id = best?.id ?? null;
    treeTarget.id = id;
    if (id !== outlined) setOutlined(id);
  });
  const outlineTree = outlined ? nodes.find((t) => t.id === outlined) : undefined;
  const titans = standing(mapId, trees).filter((t) => t.titan && trees[t.id]?.stage === "mature");

  return (
    <>
      {instanced.map(({ key, mesh, part }, i) => (
        <primitive key={`${key}:${i}:${part.geometry.uuid}`} object={mesh} />
      ))}
      {falling.map((f) => (
        <FallingTree key={`${f.id}:${f.at}`} fall={f} parts={templates.get(`${f.kind}:mature`) ?? []} />
      ))}
      {outlineTree && <TreeOutline tree={outlineTree} scale={sizeOf(outlineTree, trees[outlineTree.id])} parts={templates.get(`${outlineTree.kind}:mature`) ?? []} />}
      {titans.map((t) => (
        <TitanGlow key={t.id} x={t.x} z={t.z} />
      ))}
    </>
  );
}

/** The target tree's soft white rim (an inverted hull, pulsing a little). */
function TreeOutline({ tree, scale, parts }: { tree: FellTree; scale: number; parts: TemplatePart[] }) {
  useFrame(({ clock }) => {
    OUTLINE_MAT.opacity = 0.55 + 0.25 * Math.sin(clock.elapsedTime * 4);
  });
  return (
    <group position={[tree.x, 0, tree.z]} rotation={[0, treeYaw(tree.id), 0]} scale={scale}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={OUTLINE_MAT} matrixAutoUpdate={false} matrix={p.matrix} raycast={noRaycast} renderOrder={2} />
      ))}
    </group>
  );
}

/** A felled tree: over it goes (easing in, as trees do), a bounce as it lands, then it sinks away. */
function FallingTree({ fall, parts }: { fall: Falling; parts: TemplatePart[] }) {
  const pivot = useRef<THREE.Group>(null);
  const axis = useMemo(() => new THREE.Vector3(fall.dz, 0, -fall.dx), [fall]);
  const yaw = treeYaw(fall.id);
  useFrame(() => {
    const g = pivot.current;
    if (!g) return;
    const t = performance.now() / 1000 - fall.at;
    const u = Math.min(1, t / FALL_S);
    let angle = (Math.PI / 2) * u * u * u;
    if (t > FALL_S) angle = Math.PI / 2 - 0.06 * Math.exp(-(t - FALL_S) * 9) * Math.abs(Math.sin((t - FALL_S) * 20));
    g.quaternion.setFromAxisAngle(axis, angle);
    const sink = Math.max(0, t - FALL_S - 0.25) / (SINK_S - 0.25);
    g.position.y = -sink * 0.9 * fall.scale;
    g.scale.setScalar(fall.scale * (1 - sink * 0.3));
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

const MOTE_GEO = new THREE.SphereGeometry(0.045, 6, 4);
const MOTE_MAT = new THREE.MeshBasicMaterial({ color: "#ffb347", toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
const MOTES = 36;
/** A Colossal Titan's amber: motes drifting up round its trunk and a warm light on the clearing. */
function TitanGlow({ x, z }: { x: number; z: number }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(MOTE_GEO, MOTE_MAT, MOTES);
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
  const seeds = useMemo(() => Array.from({ length: MOTES }, () => ({ a: Math.random() * Math.PI * 2, r: 0.7 + Math.random() * 1.1, p: Math.random(), s: 0.12 + Math.random() * 0.12 })), []);
  const light = useRef<THREE.PointLight>(null);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const u = (s.p + t * s.s) % 1;
      const a = s.a + t * 0.3;
      const sc = Math.sin(u * Math.PI) * 1.1;
      m.makeScale(sc, sc, sc).setPosition(x + Math.cos(a) * s.r, 0.3 + u * 4.2, z + Math.sin(a) * s.r);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (light.current) light.current.intensity = 1.6 + 0.4 * Math.sin(t * 1.7);
  });
  return (
    <>
      <primitive object={mesh} />
      <pointLight ref={light} color="#ffae42" distance={7} decay={1.5} position={[x, 2.2, z]} castShadow={false} />
    </>
  );
}

useGLTF.preload(TREES_URL);
