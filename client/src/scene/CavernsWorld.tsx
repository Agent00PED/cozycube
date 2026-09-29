import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PlayerState } from "@shared/types";
import { CAVE_LAKE, CAVE_LIGHTS, CAVE_SKYLIGHT, CAVE_WATER_Y, CAVERNS_LAYOUT as L, DOLINE_BEAMS, FINNEGAN, FORGE, GUS, ORE_NODES, ORE_NODE_AT, TERRACES, cavernsFloorY, type OreNode } from "@shared/worlds/caverns";
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

// The Glimmering Caverns (map "glimmering_caverns"), down the Whispering Woods' old mine adit: the
// Grand Karst Sanctuary, 45 x 45. The cavern is one Blender model, caverns.glb
// (scripts/blender/build_caverns.py, laid out from shared/worlds/caverns.ts): this file loads it and
// brings it to life.
//
//   the floor     the model's own floor, which is its walk collider (`caverns_walk_collider`, drawn):
//                 the very grid cavernsFloorY walks you on (the doline, the talus's switchbacks, the
//                 overlook, the trails, the beach, the islet), triangle for triangle, so a click lands
//                 at the exact height you see (the only mesh of the model a click is tested against);
//                 while the model loads (or if it fails) the same grid built here in its place
//   the finishes  the rock and the shell as painted (the light baked into their vertex colours), the
//                 lake's bed lit by moving caustics (brightest under the islet's skylight); what glows
//                 (crystals, mushrooms, lanterns, the forge's mouth) a MeshStandardMaterial whose
//                 emission is its own vertex colour, breathing; the cenote's and the terraces' water
//                 see-through with no depth write (nothing z-fights under it); the mangrove roots and
//                 the skylight's rim dithered to 30% where they stand between you and the camera
//   the light     the doline's godrays and the skylight's shaft (additive, soft-edged, dust drifting
//                 in them); only three point lights, all moving: the forge's (flickering), the
//                 terraces' (warm), the cenote's heart (pulsing)
//   the nodes     every ore node from its kind's rock (the model's Ore_<kind>), instanced: its damage
//                 the room's (`ores`): surface fissures glowing in, then the outer shell fracturing
//                 (a tremble), then the shatter (a burst of shards); a broken node leaves a dark
//                 cracked stump with dust motes over it until it grows back; each strike throws sparks
//                 where it landed; the loot flies to you
//   the folk      Gus the mole at his log workstation (gus.glb), Finnegan the Grotto Angler on his
//                 driftwood log on the cenote's north shore, his reed creel and lantern by him
//                 (finnegan.glb)
//   the terraces  steam curling off their pools
//   the drip      a lucky drip's cyan ripple on the cenote (the fishing's luck)

export const CAVERNS_URL = modelUrl("caverns.glb");
export const GUS_URL = modelUrl("gus.glb");
export const FINNEGAN_URL = modelUrl("finnegan.glb");

const TIME = { value: 0 };
const CAVE_DARK = new THREE.Color("#07060c");

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

/** The caustics' pattern (GLSL): bright thin lines where a warped grid folds, drifting with time. */
const CAUSTIC_GLSL = `
float caveCaustic(vec2 p, float t) {
  vec2 q = p * 1.9;
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    q += vec2(sin(q.y * 1.7 + t * 0.9 + k), cos(q.x * 1.5 - t * 0.8 + k * 1.3)) * 0.45;
  }
  float v = sin(q.x) * sin(q.y);
  return 1.0 - smoothstep(0.0, 0.2, abs(v));
}`;

/** The rock's finish, and the cenote's bed lit from above through the water: caustics dancing on
 *  whatever lies under the lake's surface (strongest in the shallows and under the skylight). */
function causticBed(m: THREE.MeshStandardMaterial) {
  if (m.userData.caveCaustic) return;
  m.userData.caveCaustic = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBedPos;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBedPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vBedPos;\nuniform float uTime;\n${CAUSTIC_GLSL}`).replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        vec2 lk = (vBedPos.xz - vec2(${CAVE_LAKE.x.toFixed(2)}, ${CAVE_LAKE.z.toFixed(2)})) / vec2(${CAVE_LAKE.rx.toFixed(2)}, ${CAVE_LAKE.rz.toFixed(2)});
        float inLake = 1.0 - smoothstep(0.98, 1.12, length(lk));
        float under = ${CAVE_WATER_Y.toFixed(3)} - vBedPos.y;
        float depth = smoothstep(0.01, 0.12, under) * (1.0 - smoothstep(1.4, 2.8, under));
        float sky = exp(-pow(length(vBedPos.xz - vec2(${CAVE_SKYLIGHT.x.toFixed(2)}, ${CAVE_SKYLIGHT.z.toFixed(2)})) / ${(CAVE_SKYLIGHT.r * 1.6).toFixed(2)}, 2.0));
        float c = caveCaustic(vBedPos.xz, uTime) * 0.7 + caveCaustic(vBedPos.xz * 1.7 + 3.1, uTime * 1.3) * 0.4;
        totalEmissiveRadiance += vec3(0.32, 0.86, 1.0) * c * inLake * depth * (0.22 + 0.55 * sky);
      }`
    );
  };
  m.customProgramCacheKey = () => "cave-caustic-bed";
  m.needsUpdate = true;
}

/** The water: see-through, no depth write (the bed under it never fights it), a slow shimmer and the
 *  sun's glints tracking the caustics below. */
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
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vWaterPos;\nuniform float uTime;\n${CAUSTIC_GLSL}`).replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float wv = sin(vWaterPos.x * 3.1 + uTime * 0.9) * sin(vWaterPos.z * 2.7 - uTime * 0.7);
      diffuseColor.rgb *= 0.92 + 0.14 * wv;
      diffuseColor.rgb += vec3(0.0, 0.08, 0.1) * smoothstep(0.6, 1.0, wv);
      diffuseColor.rgb += vec3(0.12, 0.2, 0.22) * caveCaustic(vWaterPos.xz * 0.8 + 1.7, uTime * 0.7);`
    );
  };
  m.customProgramCacheKey = () => `cave-water-${opacity}`;
  m.needsUpdate = true;
}

/** The cavern's floor as one invisible heightfield (a cell every 0.5 m, the terrain's grid), from the
 *  room's own floor: the click surface while the model's collider is not there. */
function floorGeometry(): THREE.BufferGeometry {
  const half = L.half;
  const n = Math.round((half * 2) / 0.5);
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, cavernsFloorY(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
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
    lines: ["Welcome to the Sunlit Doline!", "The sun only reaches this far down at the doline", "Fresh from the rock? Let's see what you've got", "The forge is hot and the anvil's ready"],
  },
};
const FINNEGAN_TALK: NpcTalk = {
  height: 1.25,
  clicked: ["The cenote's fish glow, friend. Mind the drip", "A silver spinner for the patient angler", "Fish bones and prismatic scales: that's the currency down here", "The elder olm's been in this lake longer than the cavern"],
  greet: {
    inside: (x, z) => Math.hypot(x - FINNEGAN.x, z - FINNEGAN.z) < 3.6,
    lines: ["Ahoy up there!", "Come, sit a while, the fish are biting", "The lake's still as glass today", "Got anything glowing in that livewell?"],
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
  return (
    <group>
      <ModelBoundary what="caverns.glb" fallback={<StandIn onClick={floorClick} />}>
        <Suspense fallback={<StandIn onClick={floorClick} />}>
          <CavernModel ores={ores} subscribeMessages={subscribeMessages} players={players} localSessionId={localSessionId} onStrike={onStrike} onClick={floorClick} />
        </Suspense>
      </ModelBoundary>
      <CampNpc url={GUS_URL} what="gus.glb" prefix="Gus" at={{ x: GUS.x, z: GUS.z, yaw: GUS.yaw }} y={cavernsFloorY(GUS.x, GUS.z)} waveEvent="gusWave" standIn={<NpcStandIn />} subscribeMessages={subscribeMessages} talk={GUS_TALK} />
      <CampNpc url={FINNEGAN_URL} what="finnegan.glb" prefix="Finnegan" at={{ x: FINNEGAN.x, z: FINNEGAN.z, yaw: FINNEGAN.yaw }} y={cavernsFloorY(FINNEGAN.x, FINNEGAN.z)} waveEvent="finneganWave" standIn={<NpcStandIn />} subscribeMessages={subscribeMessages} talk={FINNEGAN_TALK} />
      <CaveLights />
      <Godrays />
      <ThermalSteam />
      <ForgeSmoke />
      <DripRipples subscribeMessages={subscribeMessages} />
      <OcclusionDriver />
    </group>
  );
}

const STAND_IN_TOP = matte("#3d4556", 0.9);
const STAND_IN_SIDE = matte("#241f26", 0.9);
/** The model not there (loading, or broken): the floor's own heightfield, plainly drawn and clicked. */
function StandIn({ onClick }: { onClick: (e: ThreeEvent<PointerEvent>) => void }) {
  const floor = useMemo(floorGeometry, []);
  useEffect(() => () => floor.dispose(), [floor]);
  return (
    <group>
      <mesh geometry={GEO.box} material={STAND_IN_SIDE} position={[0, -0.6, 0]} scale={[L.half * 2, 1.2, L.half * 2]} raycast={noRaycast} />
      <mesh geometry={floor} material={STAND_IN_TOP} onPointerDown={onClick} />
    </group>
  );
}
const NPC_STAND_IN = matte("#4a4550", 0.85);
function NpcStandIn() {
  return <mesh geometry={GEO.box} material={NPC_STAND_IN} position={[0, 0.55, 0]} scale={[0.6, 1.1, 0.5]} raycast={noRaycast} />;
}

function CavernModel({ ores, subscribeMessages, players, localSessionId, onStrike, onClick }: { ores: string; subscribeMessages: (listener: RoomMessageListener) => () => void; players: Record<string, PlayerState>; localSessionId: string | null; onStrike: CavernsWorldProps["onStrike"]; onClick: (e: ThreeEvent<PointerEvent>) => void }) {
  const { scene } = useGLTF(CAVERNS_URL);
  // the floor is the walk collider itself (caverns_walk_collider: the walk grid's triangles exactly,
  // drawn): the only mesh of the model a click is tested against
  const walk = useMemo(() => (scene.getObjectByName("caverns_walk_collider") as THREE.Mesh | undefined) ?? null, [scene]);
  const fallbackFloor = useMemo(() => (walk ? null : floorGeometry()), [walk]);
  useEffect(() => () => fallbackFloor?.dispose(), [fallbackFloor]);
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
      else if (m.name === "CV_Water") stillWater(m, 0.66);
      else if (m.name === "CV_ThermalWater") stillWater(m, 0.62);
      else if (m.name === "CV_Clay") causticBed(m);
      else if (m.name === "CV_Occluder") ditherOccluder(m);
    });
    if (walk) walk.raycast = THREE.Mesh.prototype.raycast;
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
      {/* (a click lands on the floor, the model's collider: every other mesh of it is left out) */}
      <primitive object={scene} onPointerDown={onClick} />
      {!walk && <mesh geometry={fallbackFloor!} visible={false} onPointerDown={onClick} />}
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


const DUST_PER_STUMP = 6;
const STUMP_DUST = new THREE.Color("#b8a58c");

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
  // the dust lingering over a broken node's stump till it grows back
  const dust = useMemo(() => new MotePoints(ORE_NODES.length * DUST_PER_STUMP), []);
  const dustSeeds = useMemo(() => ORE_NODES.flatMap(() => Array.from({ length: DUST_PER_STUMP }, () => ({ a: Math.random() * Math.PI * 2, r: 0.15 + Math.random() * 0.45, p: Math.random(), s: 0.5 + Math.random() * 0.6 }))), []);
  useEffect(() => () => dust.dispose(), [dust]);
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
    const t = now / 1000;
    ORE_NODES.forEach((n, i) => {
      const up = looks.current.get(n.id)?.up ?? true;
      const span = ORE_KINDS[n.kind].radius / 0.42;
      for (let j = 0; j < DUST_PER_STUMP; j++) {
        const k = i * DUST_PER_STUMP + j;
        if (up) {
          dust.hide(k);
          continue;
        }
        const sd = dustSeeds[k];
        const rise = (((sd.p + t * 0.08 * sd.s) % 1) + 1) % 1;
        const a = sd.a + t * 0.4 * sd.s;
        dust.set(k, n.x + Math.cos(a) * sd.r * span, n.y + 0.15 + rise * 0.9 * span, n.z + Math.sin(a) * sd.r * span, 0.5 * Math.sin(rise * Math.PI), STUMP_DUST);
      }
    });
    dust.commit();
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
      <primitive object={dust.points} />
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

// --- the light: three moving lights, the godrays, the steam, the drip ----------------------------------

/** The cavern's light: a dim cool fill (the rock's own light is painted in), the sun's warm slant
 *  down the doline, and the three point lights that move: the forge's mouth flickering, the
 *  terraces' warm glow breathing, the cenote's heart pulsing. */
function CaveLights() {
  const forge = useRef<THREE.PointLight>(null);
  const thermal = useRef<THREE.PointLight>(null);
  const cenote = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (forge.current) forge.current.intensity = 2.6 + 0.6 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.3 * Math.sin(t * 17);
    if (thermal.current) thermal.current.intensity = 1.5 + 0.2 * Math.sin(t * 0.7);
    if (cenote.current) cenote.current.intensity = 1.9 + 0.45 * Math.sin(t * 0.9);
  });
  return (
    <>
      <ambientLight color="#cbc6e6" intensity={1.3} />
      <hemisphereLight args={["#b4c4ff", "#2a1e18", 0.35]} />
      <directionalLight color="#ffe6c4" intensity={0.45} position={[-6, 22, -14]} castShadow={false} />
      <pointLight ref={forge} color="#ff8a3a" distance={11} decay={1.4} position={CAVE_LIGHTS.forge as [number, number, number]} castShadow={false} />
      <pointLight ref={thermal} color="#ffc78a" distance={9} decay={1.5} position={CAVE_LIGHTS.thermal as [number, number, number]} castShadow={false} />
      <pointLight ref={cenote} color="#3ff0ff" distance={13} decay={1.3} position={CAVE_LIGHTS.cenote as [number, number, number]} castShadow={false} />
    </>
  );
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
  uniforms: { uTime: TIME },
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
    varying float vUp;
    varying float vFace;
    varying vec3 vRayPos;
    void main() {
      float ends = smoothstep(0.0, 0.08, vUp) * (1.0 - smoothstep(0.5, 1.0, vUp));
      float core = pow(vFace, 1.6);
      float shimmer = 0.78 + 0.22 * sin(vRayPos.y * 2.3 - uTime * 1.1 + vRayPos.x * 0.7);
      float a = ends * core * shimmer * 0.2;
      gl_FragColor = vec4(vec3(1.0, 0.9, 0.68), a);
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
  uniforms: { uTime: TIME },
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
    varying vec2 vDisc;
    void main() {
      float r = length(vDisc);
      float a = (1.0 - smoothstep(0.35, 1.0, r)) * (0.2 + 0.03 * sin(uTime * 0.8 + vDisc.x * 3.0));
      gl_FragColor = vec4(vec3(1.0, 0.88, 0.62), a);
    }`,
});
const MOTES_PER_RAY = 10;

function Godrays() {
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
class MotePoints {
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

const STEAM_PER_POOL = 10;
const STEAM_GEO = new THREE.SphereGeometry(0.22, 8, 6);
const STEAM_MAT = new THREE.MeshBasicMaterial({ color: "#f4f1ff", transparent: true, opacity: 0.1, depthWrite: false });
/** Steam curling up off the Travertine Terraces' three pools. */
function ThermalSteam() {
  const pools = TERRACES.pools;
  const n = pools.length * STEAM_PER_POOL;
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(STEAM_GEO, STEAM_MAT, n);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, [n]);
  useEffect(() => () => {
    mesh.dispose();
  }, [mesh]);
  const seeds = useMemo(
    () =>
      pools.flatMap((pool) =>
        Array.from({ length: STEAM_PER_POOL }, () => ({ x: TERRACES.x0 + 0.6 + Math.random() * (TERRACES.x1 - TERRACES.x0 - 1.0), z: pool.z0 + 0.3 + Math.random() * (pool.z1 - pool.z0 - 0.6), y: pool.y, p: Math.random() * 6, s: 0.6 + Math.random() * 0.6 }))
      ),
    [pools]
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const k = (((t * 0.18 * sd.s + sd.p) % 1) + 1) % 1;
      const sc = (0.5 + 1.6 * k) * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      m.makeScale(sc, sc * 0.8, sc).setPosition(sd.x + Math.sin(t * 0.6 + sd.p) * 0.25 * k + k * 0.6, sd.y + 0.1 + k * 1.9, sd.z + Math.cos(t * 0.5 + sd.p) * 0.25 * k);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

const SMOKE_PUFFS = 14;
const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: "#6d625c", transparent: true, opacity: 0.16, depthWrite: false });
/** Faint wisps of smoke rising out of the forge's crucible up its basalt cleft. */
function ForgeSmoke() {
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(STEAM_GEO, SMOKE_MAT, SMOKE_PUFFS);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, []);
  useEffect(() => () => {
    mesh.dispose();
  }, [mesh]);
  const base = useMemo(() => ({ x: FORGE.x, y: cavernsFloorY(FORGE.x, FORGE.z + FORGE.d / 2 + 0.3) + 0.4, z: FORGE.z + 0.1 }), []);
  const seeds = useMemo(() => Array.from({ length: SMOKE_PUFFS }, () => ({ p: Math.random(), s: 0.7 + Math.random() * 0.6, dx: (Math.random() - 0.5) * 0.5 })), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const k = (((t * 0.12 * sd.s + sd.p) % 1) + 1) % 1;
      const sc = (0.6 + 2.2 * k) * (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9);
      m.makeScale(sc, sc * 1.2, sc).setPosition(base.x + sd.dx + Math.sin(t * 0.5 + sd.p * 6) * 0.3 * k, base.y + k * 3.6, base.z - 0.25 * k);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

const RIPPLE_GEO = new THREE.RingGeometry(0.2, 0.26, 36);
/** The drop's height when it lets go: the cenote's dark vault, high over the float. */
const DRIP_FROM = 7.5;
/** The lucky drip: a drop falls from the vault and a cyan ripple spreads round a float. */
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
      const age = ((now - d.at) / 1000 - 0.6 - k * 0.55 + 10) % 1.6;
      r.position.set(d.x, CAVE_WATER_Y + 0.02, d.z);
      r.scale.setScalar(1 + age * 3.2);
      mat.opacity = Math.max(0, 0.75 * (1 - age / 1.6)) * Math.min(1, (d.until - now) / 800);
    });
    // the drop: falling from the vault onto the float, then gone
    const fall = d ? (now - d.at) / 600 : 2;
    drop.visible = fall >= 0 && fall < 1;
    if (d && drop.visible) drop.position.set(d.x, DRIP_FROM + (CAVE_WATER_Y - DRIP_FROM) * fall * fall, d.z);
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
useGLTF.preload(FINNEGAN_URL);
