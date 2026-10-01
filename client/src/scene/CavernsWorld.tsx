import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PlayerState } from "@shared/types";
import { CAVERNS_LAYOUT as L, CAVE_WINCH, FINNEGAN, GUS, TERRACES, cavernsFloorY } from "@shared/worlds/caverns";
import { playCaveSfx } from "../audio/cavernAmbience";
import { ORE_KIND_IDS, type OreKind } from "@shared/caverns_mining";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { CampNpc, type NpcGesture, type NpcTalk } from "../entities/CampNpc";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { OcclusionIndex, xrayGate } from "./occlusion";
import { parseCaveEvent } from "@shared/caverns_codex";
import { OcclusionDriver, ditherOccluder } from "./occlusionDither";
import { ProspectingView } from "./ProspectingView";
import { CaveFauna } from "./caveFauna";
import { CaveMist, CrystalLights } from "./caveAtmosphere";
import { CageClock } from "./winchRide";
import { caveSurface } from "./caveSurface";
import { bakedLight, causticBed, CAVE_DARK, glowFromVertexColour, heightMist, stillWater, TIME } from "./caveMaterials";
import { CaveLights, DustMotes, Godrays, LampDust } from "./caveLight";
import { DripRipples, FloatShadows, ForgeSmoke, SoakSteam, ThermalSteam, WaterfallSpray, WadeRipples, ZoneToasts, CeilingDrips, RaftRig } from "./caveLife";
import { CaveFinds, EventLooks, HearthFire } from "./caveWonders";
import { CaveFxLayer, OreNodes, WorkFx } from "./caveOres";

// The Glimmering Caverns (map "glimmering_caverns"), down the Whispering Woods' old mine adit: 45 x 45,
// after Hang Son Doong (docs/caverns-design.md), eight zones stepping down from the basecamp's shelf to
// the Great Lake. The cavern is one Blender model, caverns.glb (scripts/blender/build_caverns.py, laid
// out from shared/worlds/caverns.ts): this file loads it, its folk and your x-ray's gate, and brings it
// to life through its systems' modules (docs/caverns-roadmap.md phase 7): caveMaterials.ts (the
// finishes), caveLight.tsx (the light), caveOres.tsx (the nodes and the work's effects), caveLife.tsx
// (the water and life), caveWonders.tsx (the hearth, the living wonders, the codex's finds), with
// caveSurface.ts, caveAtmosphere.tsx, caveFauna.tsx and caveFx.ts.
//
//   the floor     the model's own floor, which is its walk collider (`caverns_walk_collider`, drawn):
//                 the very grid cavernsFloorY walks you on (every zone, the trails cut across the
//                 cliffs, the fords, the lake's shore and the causeway), triangle for triangle, so a
//                 click lands at the exact height you see (the only mesh of the model a click is tested
//                 against); while the model loads (or if it fails) the same grid built here in its
//                 place; its own copy of the clay paints every bank too steep to walk bare rock
//                 (caveSurface.ts, from the ground's steepness over a metre)
//   the finishes  the rock and the shell as painted (each zone's ground and tint in their vertex
//                 colours), with detail below the grid on everything natural (caveSurface.ts: mottling,
//                 cracks, strata, rust, moss, rimstone, ripples, grain, glints), the lake's bed lit by
//                 moving caustics (brightest under the islet's
//                 skylight); what glows (crystals, fungi, lanterns, the forge's mouth) a
//                 MeshStandardMaterial whose emission is its own vertex colour, breathing; the lake's
//                 and the pools' water see-through with no depth write (nothing z-fights under it);
//                 the jungle's trees and the Hound's Hand dithered to 30% where they stand between
//                 you and the camera
//   the light     the game's own (CaveLights): ACES tone mapping at a balanced exposure, a deep cool
//                 navy ambient and hemisphere (#161c26 at 0.28), the sun through the jungle's collapse
//                 a soft golden spotlight casting real shadows, a key light from high over the collapse
//                 (every cliff facing the camera in its own shade) and a softer fill from over your
//                 shoulder, the model's baked light kept as a dim lightmap (bakedLight: its colours'
//                 own glow), three moving point lights (the forge's flicker, the pools' warmth, the
//                 lake's heart) and four small ones for the crystals nearest you (caveAtmosphere.tsx);
//                 the jungle's godrays and the islet's skylight shaft (additive, soft-edged, dust
//                 drifting in them); dust in the collapse's light over the basecamp and the
//                 breakdown; a thin pale mist over the lake's water and a height mist on everything
//                 (heightMist: a haze over the low ground, the deep dark below the water line and
//                 down the edges); nothing ever hangs into the view
//   the shore     the sand the water touches damp: darker, and glossy (lower roughness) in the
//                 bed's finish
//   the zones     each one's name in a toast as you come into it (ZoneToasts)
//   the nodes     every ore node from its kind's rock (the model's Ore_<kind>), instanced: its damage
//                 the room's (`ores`): surface fissures glowing in, then the outer shell fracturing
//                 (a tremble), then the shatter (a burst of shards); a broken node leaves a dark
//                 cracked stump with dust motes over it until it grows back; each strike throws sparks
//                 where it landed; the loot flies to you
//   the folk      Gus the mole at his log workstation (gus.glb), Finnegan the Grotto Angler on his
//                 driftwood log on the lake's north shore, his reed creel and lantern by him
//                 (finnegan.glb), and a capybara soaking in the terraces' upper pool, a towel folded
//                 on its head (capybara.glb)
//   the fauna     glowing crabs skittering on the shore, swiftlets circling in the jungle's sunbeams,
//                 bats fluttering over the mudflats (caveFauna.tsx, instanced from the model's Fauna_*
//                 templates)
//   the terraces  steam curling off their pools, and warm motes rising round every bather
//   the drip      a lucky drip's cyan ripple on the lake (the fishing's luck)

export const CAVERNS_URL = modelUrl("caverns.glb");
export const GUS_URL = modelUrl("gus.glb");
export const FINNEGAN_URL = modelUrl("finnegan.glb");
export const CAPYBARA_URL = modelUrl("capybara.glb");

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
  /** A strike on the node being prospected (its channel's packet; `t`: ms since the close-up opened). */
  onStrike: (node: string, dir: [number, number, number], t: number) => void;
  /** The living wonder under way (shared/caverns_codex.ts CaveEvent as JSON; "" none). */
  caveEvent: string;
  /** The raft (JSON: its side and crossing). */
  caveRaft: string;
}

/** The codex entries found, from a synced camp profile (PlayerState.fishing). */
function codexOf(fishing: string | undefined): string[] {
  try {
    const v = (JSON.parse(fishing || "{}") as { codex?: unknown }).codex;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const GUS_TALK: NpcTalk = {
  height: 1.3,
  clicked: ["Ore, ingots, geodes, gems: Gus buys the lot!", "Mind the Monolith when it wakes. Takes a crew to crack it", "A good pickaxe is half the work, friend", "Smelt your copper before you sell it: every bit counts"],
  greet: {
    inside: (x, z) => Math.hypot(x - GUS.x, z - GUS.z) < 3.4,
    lines: ["Welcome to the basecamp!", "The sun only reaches this far down at the jungle's doline", "Fresh from the rock? Let's see what you've got", "The forge is hot and the anvil's ready"],
  },
};
const FINNEGAN_TALK: NpcTalk = {
  height: 1.25,
  clicked: ["The lake's fish glow, friend. Mind the drip", "A silver spinner for the patient angler", "Fish bones and prismatic scales: that's the currency down here", "The elder olm's been in this lake longer than the cavern"],
  greet: {
    inside: (x, z) => Math.hypot(x - FINNEGAN.x, z - FINNEGAN.z) < 3.6,
    lines: ["Ahoy up there!", "Come, sit a while, the fish are biting", "The lake's still as glass today", "Got anything glowing in that livewell?"],
  },
};

/** The folk's own turns (constants: an object made afresh each render would reset their clocks):
 *  Gus writing up his ledger, Finnegan casting afresh, the capybara nodding off in its bath. */
const GUS_IDLE = { gesture: "write" as const, every: 7 };
const FINNEGAN_IDLE = { gesture: "cast" as const, every: 11 };
const CAPY_IDLE = { gesture: "sleep" as const, every: 16 };

/** The capybara in the upper pool: dozing while it has the terraces to itself, waking to watch the
 *  nearest bather (a little perk as each one settles in), shaking off a splash nearby, perking up
 *  at your deep breath, and a contented word when it's clicked. */
const CAPY_WATCH = 9;
const CAPY_TALK: NpcTalk = { height: 0.55, clicked: ["♨️ …", "*a contented squeak*", "*blinks slowly at you*", "Mmm. Warm.", "*scoots over to make room*"] };
const capyReact = (type: string, payload: { x?: number; z?: number; deep?: boolean }): { gesture: NpcGesture; line?: string } | null => {
  if (type === "splash" && Math.hypot((payload.x ?? 99) - L.capybara.x, (payload.z ?? 99) - L.capybara.z) < 4) return { gesture: "shake", line: "💦 !" };
  if (type === "soakBreath" && payload.deep) return { gesture: "perk" };
  return null;
};
function CapybaraBath({ players, subscribeMessages }: { players: Record<string, PlayerState>; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const live = useRef(players);
  live.current = players;
  const gesture = useRef<((g: NpcGesture) => void) | null>(null);
  const bathers = useRef(new Set<string>());
  const watch = useRef<{ x: number; z: number } | null>(null);
  useFrame(() => {
    const now = new Set<string>();
    let best: { x: number; z: number } | null = null;
    let bestD = CAPY_WATCH;
    for (const [id, p] of Object.entries(live.current)) {
      if (p.map !== "glimmering_caverns" || p.action !== "soak") continue;
      now.add(id);
      const d = Math.hypot(p.x - L.capybara.x, p.z - L.capybara.z);
      if (d < bestD) {
        bestD = d;
        best = { x: p.x, z: p.z };
      }
    }
    for (const id of now) if (!bathers.current.has(id)) gesture.current?.("perk");
    bathers.current = now;
    watch.current = best;
  });
  return <CampNpc url={CAPYBARA_URL} what="capybara.glb" prefix="Capy" at={{ x: L.capybara.x, z: L.capybara.z, yaw: L.capybara.yaw }} y={TERRACES.pools[0].y} waveEvent="capybaraWave" standIn={null} subscribeMessages={subscribeMessages} loop="bathe" idle={CAPY_IDLE} talk={CAPY_TALK} gestureOn={capyReact} gestureRef={gesture} lookAt={capyLook(watch)} mood={capyMood(watch)} />;
}
// (made once per ref: CampNpc reads them every frame)
const capyLook = (watch: { current: { x: number; z: number } | null }) => () => watch.current;
const capyMood = (watch: { current: { x: number; z: number } | null }) => () => (watch.current ? null : ("doze" as const));

export function CavernsWorld({ onFloorClick, players, localSessionId, ores, subscribeMessages, onStrike, caveEvent, caveRaft }: CavernsWorldProps) {
  const ev = useMemo(() => parseCaveEvent(caveEvent), [caveEvent]);
  const fishing = localSessionId ? players[localSessionId]?.fishing : undefined;
  const found = useMemo(() => codexOf(fishing), [fishing]);
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
          <CavernModel ores={ores} raft={caveRaft} subscribeMessages={subscribeMessages} players={players} localSessionId={localSessionId} onStrike={onStrike} onClick={floorClick} found={found} />
        </Suspense>
      </ModelBoundary>
      <CampNpc url={GUS_URL} what="gus.glb" prefix="Gus" at={{ x: GUS.x, z: GUS.z, yaw: GUS.yaw }} y={cavernsFloorY(GUS.x, GUS.z)} waveEvent="gusWave" standIn={<NpcStandIn />} subscribeMessages={subscribeMessages} talk={GUS_TALK} idle={GUS_IDLE} />
      <CampNpc url={FINNEGAN_URL} what="finnegan.glb" prefix="Finnegan" at={{ x: FINNEGAN.x, z: FINNEGAN.z, yaw: FINNEGAN.yaw }} y={cavernsFloorY(FINNEGAN.x, FINNEGAN.z)} waveEvent="finneganWave" standIn={<NpcStandIn />} subscribeMessages={subscribeMessages} talk={FINNEGAN_TALK} idle={FINNEGAN_IDLE} fuseArm={false} />
      <CapybaraBath players={players} subscribeMessages={subscribeMessages} />
      <CaveLights />
      <CrystalLights />
      <Godrays />
      <CaveMist />
      <ThermalSteam />
      <SoakSteam players={players} />
      <FloatShadows players={players} />
      <HearthFire />
      <EventLooks ev={ev} />
      <ForgeSmoke />
      <DustMotes />
      <LampDust />
      <CeilingDrips />
      <WaterfallSpray />
      <WadeRipples players={players} localSessionId={localSessionId} />
      <CaveFxLayer />
      <WorkFx players={players} localSessionId={localSessionId} />
      <ZoneToasts />
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

function CavernModel({ ores, subscribeMessages, players, localSessionId, onStrike, onClick, found, raft }: { raft: string; ores: string; subscribeMessages: (listener: RoomMessageListener) => () => void; players: Record<string, PlayerState>; localSessionId: string | null; onStrike: CavernsWorldProps["onStrike"]; onClick: (e: ThreeEvent<PointerEvent>) => void; found: string[] }) {
  const { scene } = useGLTF(CAVERNS_URL);
  // the floor is the walk collider itself (caverns_walk_collider: the walk grid's triangles exactly,
  // drawn): the only mesh of the model a click is tested against
  const walk = useMemo(() => (scene.getObjectByName("caverns_walk_collider") as THREE.Mesh | undefined) ?? null, [scene]);
  const fallbackFloor = useMemo(() => (walk ? null : floorGeometry()), [walk]);
  const fauna = useMemo(() => ({ crab: (scene.getObjectByName("Fauna_Crab") as THREE.Mesh | undefined) ?? null, swift: (scene.getObjectByName("Fauna_Swift") as THREE.Mesh | undefined) ?? null, bat: (scene.getObjectByName("Fauna_Bat") as THREE.Mesh | undefined) ?? null }), [scene]);
  useEffect(() => () => fallbackFloor?.dispose(), [fallbackFloor]);
  // the model's finishes, and the node rocks' templates taken out of it (instanced below)
  const templates = useMemo(() => {
    const t: Partial<Record<OreKind | "rubble", { rock: THREE.Mesh; glow: THREE.Mesh | null }>> = {};
    // (the floor its own copy of the clay: only it takes the banks)
    if (walk && !(walk.material as THREE.Material).userData.caveFloor) {
      const own = (walk.material as THREE.MeshStandardMaterial).clone();
      own.userData = { caveFloor: true };
      walk.material = own;
    }
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.name === "CV_Glow") glowFromVertexColour(m, 1.7);
      else if (m.name === "CV_OreGlow") glowFromVertexColour(m, 1.6);
      else if (m.name === "CV_Water") stillWater(m, 0.66);
      else if (m.name === "CV_ThermalWater") stillWater(m, 0.62);
      else if (m.name === "CV_Clay") {
        causticBed(m);
        caveSurface(m, !!m.userData.caveFloor);
        bakedLight(m);
        heightMist(m);
      } else if (m.name === "CV_Shell") {
        caveSurface(m, false);
        bakedLight(m);
        heightMist(m);
      } else if (m.name === "CV_Occluder") {
        ditherOccluder(m);
        caveSurface(m, false);
        bakedLight(m);
        heightMist(m);
      }
      // (the rock, the walls and the pillars cast the sun's shadows; the floor and they take them)
      if (mesh.name === "Cave_Rock" || mesh.name === "Cave_Shell" || mesh.name === "Cave_Roots") {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      } else if (mesh.name === "caverns_walk_collider") mesh.receiveShadow = true;
    });
    if (walk) walk.raycast = THREE.Mesh.prototype.raycast;
    // (the fauna's templates: drawn instanced, never where they were modelled)
    for (const name of ["Fauna_Crab", "Fauna_Swift", "Fauna_Bat", "Find_Page", "Find_Lantern"]) {
      const o = scene.getObjectByName(name);
      if (o) o.visible = false;
    }
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
      <CaveFauna crab={fauna.crab} swift={fauna.swift} bat={fauna.bat} />
      <CaveFinds page={(scene.getObjectByName("Find_Page") as THREE.Mesh | undefined) ?? null} found={found} />
      <WinchRig scene={scene} players={players} />
      <RaftRig scene={scene} raft={raft} />
      <XrayWatch scene={scene} />
    </>
  );
}

/** The x-ray's gate down here (scene/occlusion.ts): the cave's rock, shell, trees and floor in an
 *  occlusion index, and a look five times a second from your feet, chest and head toward the camera:
 *  your silhouette drawn only while something stands in the way. */
const XRAY_MESHES = ["Cave_Rock", "Cave_Shell", "Cave_Roots", "caverns_walk_collider"];
function XrayWatch({ scene }: { scene: THREE.Object3D }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const meshes = XRAY_MESHES.map((n) => scene.getObjectByName(n)).filter((o): o is THREE.Mesh => !!o && (o as THREE.Mesh).isMesh);
    xrayGate.index = meshes.length ? new OcclusionIndex(meshes) : null;
    xrayGate.occluded = false;
    return () => {
      xrayGate.index = null;
      xrayGate.occluded = true;
    };
  }, [scene]);
  const next = useRef(0);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), dir: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const idx = xrayGate.index;
    if (!idx || clock.elapsedTime < next.current) return;
    next.current = clock.elapsedTime + 0.2;
    camera.getWorldDirection(tmp.dir).negate();
    let hidden = false;
    for (const h of [0.35, 0.9, 1.45]) {
      tmp.a.set(cameraFocus.x, cameraFocus.y + h, cameraFocus.z);
      tmp.b.copy(tmp.a).addScaledVector(tmp.dir, 7);
      if (idx.blocked(tmp.a, tmp.b)) {
        hidden = true;
        break;
      }
    }
    xrayGate.occluded = hidden;
  });
  return null;
}

/** Gus's winch as someone rides it up (winchRide.ts): the cage lifted, the rope paid in over the
 *  drum as it climbs, the drum turning; the empty cage let back down after. */
const DRUM_R = 0.2;
/** How loud the winch is where you stand (0 .. 1). */
function nearWinch(): number {
  const d = Math.hypot(cameraFocus.x - CAVE_WINCH.top.x, cameraFocus.z - CAVE_WINCH.top.z);
  return Math.max(0, Math.min(1, 1.2 - d / 14));
}
function WinchRig({ scene, players }: { scene: THREE.Object3D; players: Record<string, PlayerState> }) {
  const live = useRef(players);
  live.current = players;
  const clock = useMemo(() => new CageClock(), []);
  const motion = useMemo(() => ({ last: 0, at: performance.now(), swing: 0, drum: 0, moving: false }), []);
  const rig = useMemo(() => {
    const cage = scene.getObjectByName("Prop_WinchCage");
    const rope = scene.getObjectByName("Prop_WinchRope");
    const drum = scene.getObjectByName("Prop_WinchDrum");
    if (!cage || !rope || !drum) return null;
    // (the rope hangs from the boom's end to the ring over the cage's top, 2.35 m over its floor)
    const hang = rope.position.y - (cage.position.y + 2.35);
    return { cage, rope, drum, cageY: cage.position.y, hang: Math.max(0.1, hang) };
  }, [scene]);
  useFrame(() => {
    clock.watch(Object.entries(live.current));
    if (!rig) return;
    const lift = clock.lift();
    const now = performance.now();
    // (docs/caverns-roadmap.md R10.7: the cage swings a little on its rope as it moves and settles
    // after it stops, the pawl clicks over the ratchet while the drum turns, a knock as it comes to rest)
    const speed = Math.abs(lift - motion.last) / Math.max(1e-3, (now - motion.at) / 1000);
    motion.swing += ((speed > 0.05 ? 1 : 0) - motion.swing) * 0.04;
    const tilt = 0.035 * motion.swing * Math.sin(now / 1000 * 2.3);
    if (speed > 0.05) {
      motion.drum += Math.abs(lift - motion.last);
      if (motion.drum > 0.22) {
        motion.drum = 0;
        playCaveSfx("ratchet", nearWinch());
      }
      motion.moving = true;
    } else if (motion.moving && now - motion.at < 200) {
      motion.moving = false;
      playCaveSfx("thump", nearWinch());
    }
    motion.last = lift;
    motion.at = now;
    rig.cage.position.y = rig.cageY + lift;
    rig.cage.rotation.z = tilt;
    rig.cage.rotation.x = tilt * 0.5;
    rig.rope.scale.y = Math.max(0.02, (rig.hang - lift) / rig.hang);
    rig.rope.rotation.z = tilt * 0.3;
    rig.drum.rotation.x = -lift / DRUM_R;
  });
  return null;
}

useGLTF.preload(GUS_URL);
useGLTF.preload(FINNEGAN_URL);
useGLTF.preload(CAPYBARA_URL);
