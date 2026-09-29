import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PlayerState } from "@shared/types";
import { CAVE_LIGHTS, CAVE_POOL, CAVERNS_LAYOUT as L, GUS, ONSEN, ORE_NODES, ORE_NODE_AT, STAIRS, TERRACE, type OreNode } from "@shared/worlds/caverns";
import { ORE_ITEMS, ORE_KINDS, ORE_KIND_IDS, oreCenterY, parseOres, type CaveLoot, type CaveShatter, type CaveStrike, type OreKind, type OreItemId } from "@shared/caverns_mining";
import { DRIP_S, type CaveDrip } from "@shared/caverns_fishing";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { CampNpc, type NpcTalk } from "../entities/CampNpc";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { OcclusionDriver, ditherOccluder } from "./occlusionDither";
import { prospectShake } from "./prospectCamera";
import { ProspectingView } from "./ProspectingView";
import { NODE_YAW } from "./caveNodes";
import { playCaveSfx } from "../audio/cavernAmbience";

// The Glimmering Caverns (map "glimmering_caverns"), down the Whispering Woods' old mine adit. The
// cavern is one Blender model, caverns.glb (scripts/blender/build_caverns.py, laid out from
// shared/worlds/caverns.ts): this file loads it and brings it to life.
//
//   the finishes  the rock and the shell as painted (the light baked into their vertex colours);
//                 what glows (crystals, mushrooms, lanterns, the forge's mouth, the runes) a
//                 MeshStandardMaterial whose emission is its own vertex colour, breathing; the Grotto
//                 Pool's and the onsen's water see-through with no depth write (nothing z-fights
//                 under it); the overhang, its stalactites and the shoring dithered away when they
//                 stand between you and the camera, and the overhang over the Grotto Pool veiled whole
//                 (a 30% screen door) while you are down in the grotto under it, so the pool, the
//                 pier and its anglers show
//   the lights    only three move: the forge's (flickering), the onsen's, the pool's heart (pulsing)
//   the nodes     every ore node from its kind's rock (the model's Ore_<kind>), instanced: its damage
//                 the room's (`ores`): surface fissures glowing in, then the outer shell fracturing
//                 (a tremble), then the shatter (a burst of shards); a broken node leaves rubble until
//                 it grows back; each strike throws sparks where it landed; the loot flies to you
//   Gus           the mole behind his workshop's counter (gus.glb)
//   the onsen     steam curling off it
//   the drip      a lucky drip's cyan ripple on the Grotto Pool (the fishing's luck)

export const CAVERNS_URL = modelUrl("caverns.glb");
export const GUS_URL = modelUrl("gus.glb");

const TIME = { value: 0 };
const CAVE_DARK = new THREE.Color("#07060c");
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// The overhang's veil: 0 (the roof whole) .. 1 (a 30% screen door over all of it), eased as you come
// down into the grotto under it (VEIL_ZONE) and leave it. Only the overhang's own footprint is
// veiled (the shoring elsewhere shares its finish): it reads the world position the occlusion
// dither's patch passes down (ditherOccluder, applied with it).
const VEIL = { value: 0 };
const VEIL_S = 0.4;
const VEIL_KEEP = 0.3;
const OV = L.overhang;
const VEIL_ZONE = { x0: OV.x0 - 3, x1: OV.x1 + 1, z0: OV.z0 - 3.5, z1: OV.z1 + 2 };
function veilOverhang(m: THREE.Material) {
  if (m.userData.caveVeil) return;
  m.userData.caveVeil = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uCaveVeil = VEIL;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uCaveVeil;").replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      if (uCaveVeil > 0.001 && vOccWorld.x > ${(OV.x0 - 0.6).toFixed(2)} && vOccWorld.x < ${(OV.x1 + 0.6).toFixed(2)} && vOccWorld.z > ${(OV.z0 - 0.6).toFixed(2)} && vOccWorld.z < ${(OV.z1 + 0.6).toFixed(2)}) {
        const float VEIL_BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
        int veilI = int(mod(gl_FragCoord.x, 4.0)) + int(mod(gl_FragCoord.y, 4.0)) * 4;
        if ((VEIL_BAYER[veilI] + 0.5) / 16.0 > mix(1.0, ${VEIL_KEEP.toFixed(2)}, uCaveVeil)) discard;
      }`
    );
  };
  m.needsUpdate = true;
}

/** A glowing finish: its emission is its own vertex colour (times `strength`), breathing a little. */
function glowFromVertexColour(m: THREE.MeshStandardMaterial, strength: number) {
  if (m.userData.caveGlow) return;
  m.userData.caveGlow = true;
  m.vertexColors = true;
  m.emissive = new THREE.Color(1, 1, 1);
  m.emissiveIntensity = strength;
  m.toneMapped = false;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        totalEmissiveRadiance *= vColor.rgb * (0.85 + 0.15 * sin(uTime * 1.3 + vColor.g * 9.0));
      #endif`
    );
  };
  m.customProgramCacheKey = () => `cave-glow-${strength}`;
  m.needsUpdate = true;
}

/** The water: see-through, no depth write (the bowl under it never fights it), a slow shimmer. */
function stillWater(m: THREE.MeshStandardMaterial, opacity: number) {
  if (m.userData.caveWater) return;
  m.userData.caveWater = true;
  m.transparent = true;
  m.depthWrite = false;
  m.opacity = opacity;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWaterPos;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWaterPos;\nuniform float uTime;").replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float wv = sin(vWaterPos.x * 3.1 + uTime * 0.9) * sin(vWaterPos.z * 2.7 - uTime * 0.7);
      diffuseColor.rgb *= 0.92 + 0.14 * wv;
      diffuseColor.rgb += vec3(0.0, 0.08, 0.1) * smoothstep(0.6, 1.0, wv);`
    );
  };
  m.customProgramCacheKey = () => `cave-water-${opacity}`;
  m.needsUpdate = true;
}

interface CavernsWorldProps {
  onFloorClick: (x: number, z: number) => void;
  players: Record<string, PlayerState>;
  localSessionId: string | null;
  /** The room's ore nodes (shared/caverns_mining.ts OreSyncState as JSON). */
  ores: string;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  /** A strike on the node being prospected (its channel's packet). */
  onStrike: (node: string, dir: [number, number, number]) => void;
}

const GUS_TALK: NpcTalk = {
  height: 1.3,
  clicked: ["Ore, ingots, geodes, gems: Gus buys the lot!", "Mind the Monolith when it wakes. Takes a crew to crack it", "A good pickaxe is half the work, friend", "Smelt your copper before you sell it: every bit counts"],
  greet: {
    inside: (x, z) => Math.hypot(x - GUS.x, z - GUS.z) < 3.4,
    lines: ["Welcome to the Glimmering Caverns!", "Mind your head, the ceiling's low in places", "Fresh from the rock? Let's see what you've got", "The forge is hot and the anvil's ready"],
  },
};

export function CavernsWorld({ onFloorClick, players, localSessionId, ores, subscribeMessages, onStrike }: CavernsWorldProps) {
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  useFrame((_, dt) => {
    TIME.value += dt;
    // down in the grotto under the overhang: veil it
    const under = cameraFocus.z > TERRACE.edge && cameraFocus.x >= VEIL_ZONE.x0 && cameraFocus.x <= VEIL_ZONE.x1 && cameraFocus.z >= VEIL_ZONE.z0 && cameraFocus.z <= VEIL_ZONE.z1;
    VEIL.value = under ? Math.min(1, VEIL.value + dt / VEIL_S) : Math.max(0, VEIL.value - dt / VEIL_S);
  });
  // the dark round the shell (no sky down here): the scene's own background while you are here
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const before = scene.background;
    scene.background = CAVE_DARK;
    return () => {
      scene.background = before;
    };
  }, [scene]);
  const half = L.half;
  const edge = TERRACE.edge;
  const run = STAIRS.foot - STAIRS.top;
  const slope = Math.atan2(TERRACE.y, run);
  return (
    <group>
      {/* the floors' click planes: the terrace up the cliff, the basin, and the stair's ramp */}
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, TERRACE.y + 0.02, (-half + edge) / 2]} scale={[half * 2, edge + half, 1]} onPointerDown={floorClick} />
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, (edge + half) / 2]} scale={[half * 2, half - edge, 1]} onPointerDown={floorClick} />
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2 + slope, 0, 0]} position={[(STAIRS.x0 + STAIRS.x1) / 2, TERRACE.y / 2 + 0.03, (STAIRS.top + STAIRS.foot) / 2]} scale={[STAIRS.x1 - STAIRS.x0, Math.hypot(run, TERRACE.y), 1]} onPointerDown={floorClick} />
      <ModelBoundary what="caverns.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <CavernModel ores={ores} subscribeMessages={subscribeMessages} players={players} localSessionId={localSessionId} onStrike={onStrike} />
        </Suspense>
      </ModelBoundary>
      <CampNpc url={GUS_URL} what="gus.glb" prefix="Gus" at={{ x: GUS.x, z: GUS.z, yaw: GUS.yaw }} y={TERRACE.y} waveEvent="gusWave" standIn={<GusStandIn />} subscribeMessages={subscribeMessages} talk={GUS_TALK} />
      <CaveLights />
      <OnsenSteam />
      <DripRipples subscribeMessages={subscribeMessages} />
      <OcclusionDriver />
    </group>
  );
}

const STAND_IN_TOP = matte("#3d4556", 0.9);
const STAND_IN_SIDE = matte("#241f26", 0.9);
function StandIn() {
  return (
    <group>
      <mesh geometry={GEO.box} material={STAND_IN_SIDE} position={[0, -0.6, 0]} scale={[L.half * 2, 1.2, L.half * 2]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={STAND_IN_TOP} position={[0, TERRACE.y / 2, (-L.half + TERRACE.edge) / 2]} scale={[L.half * 2, TERRACE.y, TERRACE.edge + L.half]} raycast={noRaycast} />
    </group>
  );
}
const GUS_STAND_IN = matte("#4a4550", 0.85);
function GusStandIn() {
  return <mesh geometry={GEO.box} material={GUS_STAND_IN} position={[0, 0.55, 0]} scale={[0.6, 1.1, 0.5]} raycast={noRaycast} />;
}

function CavernModel({ ores, subscribeMessages, players, localSessionId, onStrike }: { ores: string; subscribeMessages: (listener: RoomMessageListener) => () => void; players: Record<string, PlayerState>; localSessionId: string | null; onStrike: CavernsWorldProps["onStrike"] }) {
  const { scene } = useGLTF(CAVERNS_URL);
  // the model's finishes, and the node rocks' templates taken out of it (instanced below)
  const templates = useMemo(() => {
    const t: Partial<Record<OreKind | "rubble", { rock: THREE.Mesh; glow: THREE.Mesh | null }>> = {};
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.name === "CV_Glow") glowFromVertexColour(m, 1.25);
      else if (m.name === "CV_OreGlow") glowFromVertexColour(m, 1.4);
      else if (m.name === "CV_Water") stillWater(m, 0.74);
      else if (m.name === "CV_OnsenWater") stillWater(m, 0.62);
      else if (m.name === "CV_Occluder") {
        // (the veil first: the dither's patch, chained after it, sets its program's cache key)
        veilOverhang(m);
        ditherOccluder(m);
      }
    });
    for (const kind of [...ORE_KIND_IDS, "rubble"] as const) {
      const rock = scene.getObjectByName(kind === "rubble" ? "Ore_Rubble" : `Ore_${kind}`) as THREE.Mesh | undefined;
      if (!rock) continue;
      rock.visible = false;
      const glow = (scene.getObjectByName(`Ore_${kind}_Glow`) as THREE.Mesh | undefined) ?? null;
      t[kind] = { rock, glow };
    }
    return t;
  }, [scene]);
  return (
    <>
      <primitive object={scene} />
      <OreNodes templates={templates} ores={ores} subscribeMessages={subscribeMessages} localSessionId={localSessionId} players={players} />
      <ProspectingView templates={templates} onStrike={onStrike} />
    </>
  );
}

// --- the nodes ------------------------------------------------------------------------------------

/** The rock's damage in its shader: darker as it goes, fissures glowing its kind's colour in. */
function crackedRock(base: THREE.MeshStandardMaterial, glow: string): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.vertexColors = true;
  const color = new THREE.Color(glow);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCrackGlow = { value: color };
    shader.uniforms.uTime = TIME;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCrack;\nvarying float vCrack;\nvarying vec3 vRockPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCrack = aCrack;\nvRockPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uCrackGlow;\nuniform float uTime;\nvarying float vCrack;\nvarying vec3 vRockPos;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          // fissures: the zero lines of two warped waves on the rock's own skin
          vec3 p = vRockPos * 9.0;
          float n = sin(p.x + 1.7 * sin(p.y * 0.8)) * sin(p.z * 1.1 + 1.3 * sin(p.x * 0.7)) + 0.35 * sin(p.y * 2.3 + p.z);
          float width = 0.05 + 0.16 * vCrack;
          float line = 1.0 - smoothstep(0.0, width, abs(n));
          float show = smoothstep(0.06, 0.3, vCrack);
          diffuseColor.rgb *= 1.0 - 0.3 * vCrack;
          totalEmissiveRadiance += uCrackGlow * line * show * (0.8 + 1.6 * vCrack) * (0.8 + 0.2 * sin(uTime * 6.0));
        }`
      );
  };
  m.customProgramCacheKey = () => `cave-crack-${glow}`;
  return m;
}

interface NodeLook {
  dmg: number;
  up: boolean;
  /** When it last grew back (it swells in), and until when it trembles (a strike). */
  bornAt: number;
  shakeUntil: number;
}


type Templates = Partial<Record<OreKind | "rubble", { rock: THREE.Mesh; glow: THREE.Mesh | null }>>;

function OreNodes({ templates, ores, subscribeMessages, localSessionId, players }: { templates: Templates; ores: string; subscribeMessages: (listener: RoomMessageListener) => () => void; localSessionId: string | null; players: Record<string, PlayerState> }) {
  const sync = useMemo(() => parseOres(ores), [ores]);
  const looks = useRef(new Map<string, NodeLook>());
  // one instanced rock (and its glow) per kind, the nodes of that kind its instances; the rubble for all
  const sets = useMemo(() => {
    const out: { kind: OreKind; nodes: OreNode[]; rock: THREE.InstancedMesh; glow: THREE.InstancedMesh | null; crack: THREE.InstancedBufferAttribute }[] = [];
    for (const kind of ORE_KIND_IDS) {
      const t = templates[kind];
      const nodes = ORE_NODES.filter((n) => n.kind === kind);
      if (!t || !nodes.length) continue;
      const geo = t.rock.geometry.clone();
      const crack = new THREE.InstancedBufferAttribute(new Float32Array(nodes.length), 1);
      geo.setAttribute("aCrack", crack);
      const rock = new THREE.InstancedMesh(geo, crackedRock(t.rock.material as THREE.MeshStandardMaterial, ORE_KINDS[kind].glow), nodes.length);
      const glow = t.glow ? new THREE.InstancedMesh(t.glow.geometry, t.glow.material as THREE.Material, nodes.length) : null;
      for (const im of [rock, glow]) {
        if (!im) continue;
        im.raycast = noRaycast;
        im.frustumCulled = false;
      }
      out.push({ kind, nodes, rock, glow, crack });
    }
    return out;
  }, [templates]);
  const rubble = useMemo(() => {
    const t = templates.rubble;
    if (!t) return null;
    const im = new THREE.InstancedMesh(t.rock.geometry, t.rock.material as THREE.Material, ORE_NODES.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, [templates]);
  useEffect(
    () => () => {
      for (const s of sets) {
        s.rock.geometry.dispose();
        (s.rock.material as THREE.Material).dispose();
        s.rock.dispose();
        s.glow?.dispose();
      }
      rubble?.dispose();
    },
    [sets, rubble]
  );
  // the room's word on each node: its damage, and whether it stands (a node back up swells in)
  useEffect(() => {
    const now = performance.now();
    for (const n of ORE_NODES) {
      const s = sync[n.id];
      const look = looks.current.get(n.id) ?? { dmg: 0, up: true, bornAt: -1e9, shakeUntil: 0 };
      if (s) {
        if (s.up && !look.up) look.bornAt = now;
        look.up = s.up;
        look.dmg = s.dmg;
      }
      looks.current.set(n.id, look);
    }
  }, [sync]);

  // the sparks, the shards and the loot: one pool of little glowing pieces
  const fx = useMemo(() => new FxPool(160), []);
  useEffect(() => () => fx.dispose(), [fx]);
  const live = useRef({ players, localSessionId });
  live.current = { players, localSessionId };
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "caveStrike") {
          const st = payload as CaveStrike;
          const node = ORE_NODE_AT.get(st.node);
          if (!node) return;
          const look = looks.current.get(node.id);
          if (look) look.shakeUntil = performance.now() + (st.verdict === "deflect" ? 120 : 200);
          const r = ORE_KINDS[node.kind].radius;
          const c = new THREE.Vector3(node.x, node.y + oreCenterY(node.kind), node.z);
          const at = c.clone().add(new THREE.Vector3(...st.hit).multiplyScalar(r * 0.95));
          const col = st.verdict === "direct" ? ORE_KINDS[node.kind].glow : st.verdict === "near" ? "#ffb46b" : st.verdict === "deflect" ? "#cfe6ff" : "#9a948c";
          fx.sparks(at, new THREE.Vector3(...st.hit), col, st.verdict === "direct" ? 12 : st.verdict === "deflect" ? 10 : 6, st.verdict === "bedrock" ? 0.6 : 1);
          const mine = st.sessionId === live.current.localSessionId;
          if (mine) prospectShake(st.verdict === "direct" ? 0.05 : st.verdict === "deflect" ? 0.08 : 0.025);
          playCaveSfx(st.verdict === "direct" ? "crack" : st.verdict === "near" ? "clink" : st.verdict === "deflect" ? "clang" : "clatter", mine ? 1 : 0.45);
        } else if (type === "caveShatter") {
          const sh = payload as CaveShatter;
          const node = ORE_NODE_AT.get(sh.node);
          if (!node) return;
          const c = new THREE.Vector3(node.x, node.y + oreCenterY(node.kind), node.z);
          fx.shards(c, ORE_KINDS[node.kind].radius, ORE_KINDS[node.kind].glow, node.kind === "monolith" ? 60 : 26);
          const look = looks.current.get(node.id);
          if (look) look.up = false;
          playCaveSfx("shatter", 1);
          if (sh.crew.includes(live.current.localSessionId ?? "")) prospectShake(0.14);
        } else if (type === "caveLoot") {
          const loot = payload as CaveLoot;
          const node = ORE_NODE_AT.get(loot.node);
          if (!node) return;
          const c = new THREE.Vector3(node.x, node.y + oreCenterY(node.kind), node.z);
          let k = 0;
          for (const [id, n] of Object.entries(loot.items) as [OreItemId, number][]) {
            for (let j = 0; j < Math.min(6, n); j++) fx.loot(c, ORE_ITEMS[id].color, (k++ * 70) / 1000);
          }
        }
      }),
    [subscribeMessages, fx]
  );

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame((_, dt) => {
    const now = performance.now();
    for (const set of sets) {
      set.nodes.forEach((n, i) => {
        const look = looks.current.get(n.id) ?? { dmg: 0, up: true, bornAt: -1e9, shakeUntil: 0 };
        // swelling in when it grows back; a strike's tremble; the outer shell's shudder past 60%
        const born = Math.min(1, (now - look.bornAt) / 600);
        const grow = look.up ? 0.35 + 0.65 * (1 - (1 - born) ** 3) : 0;
        const shaking = now < look.shakeUntil ? 0.03 : 0;
        const shudder = look.dmg > 0.6 ? 0.008 * Math.sin(now * 0.05 + i) : 0;
        const jx = (Math.random() - 0.5) * shaking + shudder;
        const jz = (Math.random() - 0.5) * shaking - shudder;
        q.setFromAxisAngle(yAxis, NODE_YAW.get(n.id) ?? 0);
        const swell = 1 + (look.dmg > 0.6 ? 0.025 * look.dmg : 0);
        s.set(grow * swell, grow, grow * swell);
        p.set(n.x + jx, n.y, n.z + jz);
        m.compose(p, q, s);
        set.rock.setMatrixAt(i, m);
        set.glow?.setMatrixAt(i, m);
        set.crack.setX(i, look.dmg);
      });
      set.rock.instanceMatrix.needsUpdate = true;
      if (set.glow) set.glow.instanceMatrix.needsUpdate = true;
      set.crack.needsUpdate = true;
    }
    if (rubble) {
      ORE_NODES.forEach((n, i) => {
        const up = looks.current.get(n.id)?.up ?? true;
        const r = ORE_KINDS[n.kind].radius / 0.42;
        q.setFromAxisAngle(yAxis, NODE_YAW.get(n.id) ?? 0);
        s.setScalar(up ? 0 : r * (n.kind === "monolith" ? 1.6 : 1));
        p.set(n.x, n.y, n.z);
        m.compose(p, q, s);
        rubble.setMatrixAt(i, m);
      });
      rubble.instanceMatrix.needsUpdate = true;
    }
    fx.step(dt, cameraFocus);
  });
  return (
    <>
      {sets.map((set) => (
        <group key={set.kind}>
          <primitive object={set.rock} />
          {set.glow && <primitive object={set.glow} />}
        </group>
      ))}
      {rubble && <primitive object={rubble} />}
      <primitive object={fx.mesh} />
    </>
  );
}

// --- the little pieces: sparks off a strike, shards off a shatter, the loot flying to you ----------

interface Piece {
  kind: "spark" | "shard" | "loot";
  t: number;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  from: THREE.Vector3;
  size: number;
  delay: number;
}
const FX_GEO = new THREE.OctahedronGeometry(1, 0);
class FxPool {
  mesh: THREE.InstancedMesh;
  private pieces: (Piece | null)[];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private c = new THREE.Color();
  constructor(n: number) {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(FX_GEO, mat, n);
    this.mesh.raycast = noRaycast;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.pieces = Array.from({ length: n }, () => null);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
  }
  private add(p: Piece, color: string) {
    const i = this.pieces.findIndex((x) => x === null);
    if (i < 0) return;
    this.pieces[i] = p;
    this.c.set(color);
    this.mesh.setColorAt(i, this.c);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  sparks(at: THREE.Vector3, out: THREE.Vector3, color: string, n: number, speed: number) {
    for (let k = 0; k < n; k++) {
      const v = out.clone().multiplyScalar(1.2 + Math.random()).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(2.2)).multiplyScalar(speed);
      this.add({ kind: "spark", t: 0, life: 0.28 + Math.random() * 0.2, pos: at.clone(), vel: v, from: at.clone(), size: 0.025 + Math.random() * 0.02, delay: 0 }, color);
    }
  }
  shards(at: THREE.Vector3, r: number, color: string, n: number) {
    for (let k = 0; k < n; k++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize();
      this.add({ kind: "shard", t: 0, life: 0.9 + Math.random() * 0.5, pos: at.clone().addScaledVector(d, r * 0.6), vel: d.multiplyScalar(2.5 + Math.random() * 3), from: at.clone(), size: 0.05 + Math.random() * 0.07 * (r / 0.5), delay: 0 }, k % 3 === 0 ? color : "#6d6878");
    }
  }
  loot(at: THREE.Vector3, color: string, delay: number) {
    this.add({ kind: "loot", t: 0, life: 0.85, pos: at.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6), from: at.clone(), size: 0.07, delay }, color);
  }
  step(dt: number, focus: { x: number; y: number; z: number }) {
    const to = new THREE.Vector3(focus.x, focus.y + 0.85, focus.z);
    let dirty = false;
    this.pieces.forEach((p, i) => {
      if (!p) return;
      dirty = true;
      if (p.delay > 0) {
        p.delay -= dt;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        return;
      }
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this.pieces[i] = null;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        return;
      }
      let size = p.size;
      if (p.kind === "loot") {
        // a magnet's arc: up and over, pulled in to you (never loose on the floor)
        const e = k * k * (3 - 2 * k);
        p.pos.lerpVectors(p.from, to, e).addScaledVector(p.vel, Math.sin(k * Math.PI) * 0.5);
        p.pos.y += Math.sin(k * Math.PI) * 1.3;
        size = p.size * (1 - 0.6 * k * k);
      } else {
        p.vel.y -= (p.kind === "shard" ? 9 : 6) * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y < 0.02) {
          p.pos.y = 0.02;
          p.vel.multiplyScalar(0.3);
        }
        size = p.size * (1 - k);
      }
      this.e.set(p.t * 7 + i, p.t * 5, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(p.pos, this.q, new THREE.Vector3(size, size, size));
      this.mesh.setMatrixAt(i, this.m);
    });
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

// --- the lights, the steam, the drip -----------------------------------------------------------------

/** The cavern's light: a dim cool fill (the rock's own light is painted in), and the three that move:
 *  the forge's mouth flickering, the onsen's lanterns, the Grotto Pool's heart pulsing. */
function CaveLights() {
  const forge = useRef<THREE.PointLight>(null);
  const pool = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (forge.current) forge.current.intensity = 2.2 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.25 * Math.sin(t * 17);
    if (pool.current) pool.current.intensity = 1.5 + 0.35 * Math.sin(t * 0.9);
  });
  return (
    <>
      <ambientLight color="#cbc6e6" intensity={1.35} />
      <hemisphereLight args={["#a9b4ff", "#2a1e18", 0.35]} />
      <directionalLight color="#ffe2c4" intensity={0.3} position={[-8, 20, 12]} castShadow={false} />
      <pointLight ref={forge} color="#ff8a3a" distance={9} decay={1.4} position={CAVE_LIGHTS.forge as [number, number, number]} castShadow={false} />
      <pointLight color="#ffc36b" intensity={1.2} distance={7} decay={1.5} position={CAVE_LIGHTS.onsen as [number, number, number]} castShadow={false} />
      <pointLight ref={pool} color="#00f0ff" distance={8} decay={1.4} position={CAVE_LIGHTS.pool as [number, number, number]} castShadow={false} />
    </>
  );
}

const STEAM_N = 26;
const STEAM_GEO = new THREE.SphereGeometry(0.22, 8, 6);
const STEAM_MAT = new THREE.MeshBasicMaterial({ color: "#f4f1ff", transparent: true, opacity: 0.16, depthWrite: false });
/** Steam curling up off the onsen's water. */
function OnsenSteam() {
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(STEAM_GEO, STEAM_MAT, STEAM_N);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, []);
  useEffect(() => () => {
    mesh.dispose();
  }, [mesh]);
  const seeds = useMemo(() => Array.from({ length: STEAM_N }, () => ({ x: ONSEN.x + (Math.random() - 0.5) * ONSEN.w * 0.9, z: ONSEN.z + (Math.random() - 0.5) * ONSEN.d * 0.9, p: Math.random() * 6, s: 0.6 + Math.random() * 0.6 })), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const k = ((t * 0.18 * sd.s + sd.p) % 1 + 1) % 1;
      const sc = (0.5 + 1.6 * k) * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      m.makeScale(sc, sc * 0.8, sc).setPosition(sd.x + Math.sin(t * 0.6 + sd.p) * 0.25 * k, TERRACE.y + ONSEN.water + 0.1 + k * 1.8, sd.z + Math.cos(t * 0.5 + sd.p) * 0.25 * k);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

const RIPPLE_GEO = new THREE.RingGeometry(0.2, 0.26, 36);
/** The lucky drip: a drop falls from the stalactites and a cyan ripple spreads round a float. */
function DripRipples({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const drip = useRef<{ x: number; z: number; at: number; until: number } | null>(null);
  const rings = useMemo(
    () =>
      [0, 1, 2].map(() => {
        const mat = new THREE.MeshBasicMaterial({ color: "#5ff2ff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(RIPPLE_GEO, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.raycast = noRaycast;
        return mesh;
      }),
    []
  );
  const drop = useMemo(() => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: "#bff8ff", toneMapped: false }));
    mesh.raycast = noRaycast;
    return mesh;
  }, []);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "caveDrip") return;
        const d = payload as CaveDrip;
        const now = performance.now();
        drip.current = { x: d.x, z: d.z, at: now, until: now + DRIP_S * 1000 };
        playCaveSfx("drip", 1);
      }),
    [subscribeMessages]
  );
  useEffect(
    () => () => {
      rings.forEach((r) => (r.material as THREE.Material).dispose());
      drop.geometry.dispose();
      (drop.material as THREE.Material).dispose();
    },
    [rings, drop]
  );
  useFrame(() => {
    const d = drip.current;
    const now = performance.now();
    const on = !!d && now < d.until;
    rings.forEach((r, k) => {
      const mat = r.material as THREE.MeshBasicMaterial;
      if (!on || !d) {
        mat.opacity = 0;
        return;
      }
      const age = ((now - d.at) / 1000 - 0.45 - k * 0.55 + 10) % 1.6;
      r.position.set(d.x, CAVE_POOL.water + 0.02, d.z);
      r.scale.setScalar(1 + age * 3.2);
      mat.opacity = Math.max(0, 0.75 * (1 - age / 1.6)) * Math.min(1, (d.until - now) / 800);
    });
    // the drop: falling from the overhang onto the float, then gone
    const fall = d ? (now - d.at) / 450 : 2;
    drop.visible = fall >= 0 && fall < 1;
    if (d && drop.visible) drop.position.set(d.x, L.overhang.y - 1.2 + (CAVE_POOL.water - (L.overhang.y - 1.2)) * fall * fall, d.z);
  });
  return (
    <>
      {rings.map((r, k) => (
        <primitive key={k} object={r} />
      ))}
      <primitive object={drop} />
    </>
  );
}

useGLTF.preload(GUS_URL);
