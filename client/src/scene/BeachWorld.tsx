import { Suspense, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { PlayerState } from "@shared/types";
import { daylight } from "@shared/daynight";
import { BALL_RADIUS, KICK_REACH, kickBall, stepBall, type BallState } from "@shared/volleyball";
import { BALL_COURT, BAR, BEACH_GRID, BEACH_LAYOUT as L, BOAT, FIREPIT, MANGO, PIER, PIER_LENGTH, SEA_Y, WADE_DEPTH, beachLand, beachWading, onPierAt } from "@shared/worlds/beach";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { CampNpc, type NpcTalk } from "../entities/CampNpc";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "./kit";
import { CampDaylightContext } from "./campDay";
import { OcclusionDriver, ditherOccluder } from "./occlusionDither";
import { CloudClock, cloudShadows } from "./campLife";
import { seaWater } from "./seaWater";
import { liveMotion } from "../systems/liveMotion";
import { ballStore } from "../systems/ballStore";
import { WadeRipples } from "./caveLife";

// Sunset Beach (map "sunset_beach", docs/beach-design.md). The island is one Blender model,
// beach.glb (scripts/blender/build_beach.py, laid out from shared/worlds/beach.ts): this file loads
// it and brings it to life.
//
//   the sea       one sheet (seaWater): turquoise shallows to blue, foam rolling in and lapping up
//                 the sand, the low sun's gold at dawn and dusk
//   the ground    sand rising from the waterline to the bar's dune: a click lands on an invisible
//                 copy of the grid the ground is modelled from (and on the pier's deck)
//   the bar       Mango the toucan behind the counter; its strings of lights and the firepit's
//                 flames come up as the sun goes down
//   the palms     their fronds sway; they thin between you and the camera
//   the boat      the captain's, moored at the pier's head: it rocks on the swell
//   the ball      on the flat stretch of sand: walk into it to send it up (shared/volleyball.ts)

export const BEACH_URL = modelUrl("beach.glb");
export const MANGO_URL = modelUrl("mango.glb");

const BEACH_TIME = { value: 0 };
const BEACH_NIGHT = { value: 0 };
const BEACH_DUSK = { value: 0 };
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
/** The ground a click is tested against: the game's own grid (never below where you can wade), and
 *  the pier's deck over it. Never drawn. */
const CLICK_GROUND = (() => {
  const { n, cell, ground } = BEACH_GRID;
  const pos: number[] = [];
  for (let k = 0; k <= n; k++) for (let i = 0; i <= n; i++) pos.push(-L.half + i * cell, Math.max(ground[k * (n + 1) + i], SEA_Y - WADE_DEPTH), -L.half + k * cell);
  const index: number[] = [];
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) {
      const a = k * (n + 1) + i;
      index.push(a, a + n + 2, a + 1, a, a + n + 1, a + n + 2);
    }
  // the pier's deck: its walk and its head, two rectangles
  const deck = (a0: number, a1: number, half: number) => {
    const at = pos.length / 3;
    for (const [a, b] of [[a0, -half], [a1, -half], [a1, half], [a0, half]] as const) {
      const p = onPierAt(a, b);
      pos.push(p.x, PIER.deck, p.z);
    }
    index.push(at, at + 1, at + 2, at, at + 2, at + 3, at, at + 2, at + 1, at, at + 3, at + 2);
  };
  deck(0, PIER_LENGTH - L.pier.head.len, PIER.half);
  deck(PIER_LENGTH - L.pier.head.len, PIER_LENGTH, PIER.headHalf);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
})();
/** What thins when it stands between you and the camera. */
const OCCLUDERS = /^BC_Palm(Bark)?$/;
/** What the clouds' shadows drift over. */
const CLOUDED = /^BC_(Sand|Clay|ClayDouble)$/;

function swayFronds(m: THREE.Material) {
  if (m.userData.swaying) return;
  m.userData.swaying = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = BEACH_TIME;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      // (a palm's height over the sand it stands on is in its UVs: build_beach.py bake_colors;
      // glTF's v runs down)
      float swayH = max(0.0, (1.0 - uv.y) - 2.2);
      float swayPh = transformed.x * 0.35 + transformed.z * 0.27;
      transformed.x += sin(uTime * 1.2 + swayPh) * 0.035 * swayH;
      transformed.z += sin(uTime * 0.9 + swayPh * 1.3) * 0.028 * swayH;
      transformed.y += sin(uTime * 1.6 + swayPh * 2.1) * 0.012 * swayH;`
    );
  };
  m.needsUpdate = true;
}

interface BeachWorldProps {
  onFloorClick: (x: number, z: number) => void;
  room: Room | null;
  players: Record<string, PlayerState>;
  localSessionId: string | null;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

const MANGO_TALK: NpcTalk = {
  height: 1.5,
  clicked: ["What'll it be?", "Fresh coconuts today!", "Take a shift behind the bar if you like", "Sunset's the best hour for a Sunset Punch"],
  greet: {
    inside: (x, z) => Math.hypot(x - BAR.x, z - BAR.z) < 4.2,
    lines: ["Welcome to the bar on the beach!", "Pull up a stool, friend", "Thirsty? Or would you rather mix one yourself?", "Mind the sand in your drink"],
  },
};

export function BeachWorld({ onFloorClick, room, players, localSessionId, subscribeMessages }: BeachWorldProps) {
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  useFrame((_, dt) => {
    BEACH_TIME.value += dt;
    const d = daylight(Date.now());
    BEACH_NIGHT.value = 1 - d;
    // (the low sun: strongest halfway between night and day)
    BEACH_DUSK.value = Math.max(0, 1 - Math.abs(d - 0.45) / 0.4);
  });
  return (
    <group>
      <mesh geometry={CLICK_GROUND} material={CLICK_MAT} onPointerDown={floorClick} />
      <ModelBoundary what="beach.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <BeachModel />
        </Suspense>
      </ModelBoundary>
      <CampNpc url={MANGO_URL} what="mango.glb" prefix="Mango" at={MANGO} y={beachLand(MANGO.x, MANGO.z)} waveEvent="mangoWave" standIn={<MangoStandIn />} subscribeMessages={subscribeMessages} talk={MANGO_TALK} />
      <BeachLights />
      <BeachFire />
      <Ball room={room} players={players} localSessionId={localSessionId} />
      <WadeRipples players={players} localSessionId={localSessionId} mapId="sunset_beach" inWater={beachWading} waterY={SEA_Y} />
      <CloudClock />
      <OcclusionDriver />
    </group>
  );
}

const STAND_IN_SAND = matte("#ebd8a7", 0.9);
const STAND_IN_SEA = matte("#2f8fb0", 0.4);
function StandIn() {
  return (
    <group>
      <mesh geometry={GEO.plane} material={STAND_IN_SEA} rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_Y, 0]} scale={[L.half * 6, L.half * 6, 1]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={STAND_IN_SAND} rotation={[-Math.PI / 2, Math.PI / 4, 0]} position={[-6, 0.3, -6]} scale={[L.half * 1.6, L.half * 1.6, 1]} raycast={noRaycast} />
    </group>
  );
}
const MANGO_STAND_IN = matte("#2b2b33", 0.85);
function MangoStandIn() {
  return <mesh geometry={GEO.box} material={MANGO_STAND_IN} position={[0, 0.55, 0]} scale={[0.5, 1.1, 0.45]} raycast={noRaycast} />;
}

function BeachModel() {
  const { scene } = useGLTF(BEACH_URL);
  const boat = useMemo(() => {
    let found: THREE.Object3D | null = null;
    scene.traverse((o) => {
      if (o.name === "Prop_Boat") found = o;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.emissive && m.emissive.getHex() !== 0) m.toneMapped = false;
        if (m.name === "BC_Sea" && !m.userData.flowing) {
          m.userData.flowing = true;
          seaWater(m, BEACH_TIME, BEACH_NIGHT, BEACH_DUSK);
        }
        if (m.name === "BC_Palm") swayFronds(m);
        if (OCCLUDERS.test(m.name)) ditherOccluder(m);
        if (CLOUDED.test(m.name)) cloudShadows(m);
      }
      // (the sea runs far out past the map: never culled by its bounds)
      if (o.name === "Beach_Sea") o.frustumCulled = false;
    });
    return found as THREE.Object3D | null;
  }, [scene]);
  // the boat on the swell: a slow roll and pitch, a hand's height up and down
  useFrame(() => {
    if (!boat) return;
    const t = BEACH_TIME.value;
    boat.position.y = SEA_Y + 0.05 * Math.sin(t * 0.7 + BOAT.x * 0.21 + BOAT.z * 0.17);
    boat.rotation.x = 0.02 * Math.sin(t * 0.8 + 1.1);
    boat.rotation.z = 0.03 * Math.sin(t * 0.6);
  });
  return <primitive object={scene} />;
}

/** The bar's lights and the firepit's glow, coming up as the sun goes down. */
function BeachLights() {
  const d = useContext(CampDaylightContext) ?? 1;
  const dark = 1 - d;
  const fire = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (fire.current) fire.current.intensity = dark * (2.2 + 0.5 * Math.sin(clock.elapsedTime * 9.1) * Math.sin(clock.elapsedTime * 5.3));
  });
  const head = onPierAt(PIER_LENGTH - L.pier.head.len + 0.6, -PIER.headHalf + 0.1);
  return (
    <>
      <pointLight position={[BAR.x, beachLand(BAR.x, BAR.z) + 2.4, BAR.z]} color="#ffd9a0" intensity={dark * 3.2} distance={9} decay={1.6} />
      <pointLight ref={fire} position={[FIREPIT.x, beachLand(FIREPIT.x, FIREPIT.z) + 0.5, FIREPIT.z]} color="#ff9a4a" intensity={0} distance={7} decay={1.6} />
      <pointLight position={[head.x, PIER.deck + 1.8, head.z]} color="#ffe2a6" intensity={dark * 1.6} distance={6} decay={1.8} />
    </>
  );
}

const FLAME_GEO = new THREE.ConeGeometry(0.5, 1, 6, 1, true).translate(0, 0.5, 0);
const FLAME_MAT = new THREE.MeshBasicMaterial({ color: "#ffa23a", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const FLAMES = 5;
/** The firepit's flames: lit from dusk to dawn. */
function BeachFire() {
  const d = useContext(CampDaylightContext) ?? 1;
  const lit = d < 0.55;
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(FLAME_GEO, FLAME_MAT, FLAMES);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, []);
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh]
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  const y = beachLand(FIREPIT.x, FIREPIT.z) + 0.08;
  useFrame(({ clock }) => {
    if (!lit) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < FLAMES; i++) {
      const a = (i / FLAMES) * Math.PI * 2 + 0.4;
      const r = i === 0 ? 0 : 0.12;
      const h = (i === 0 ? 0.62 : 0.4) * (0.8 + 0.2 * Math.sin(t * (6 + i) + i * 1.7) * Math.sin(t * 3.1 + i));
      const w = i === 0 ? 0.42 : 0.28;
      m.makeScale(w, h, w).setPosition(FIREPIT.x + Math.cos(a) * r, y, FIREPIT.z + Math.sin(a) * r);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return lit ? <primitive object={mesh} /> : null;
}

const BALL_GEO = new THREE.SphereGeometry(BALL_RADIUS, 16, 12);
/** The beach ball's six panels, painted into its vertices (one draw call). */
const BALL_MAT = (() => {
  const colors = ["#f25c54", "#f7f3ea", "#f2c14e", "#f7f3ea", "#3aa6a0", "#f7f3ea"].map((c) => new THREE.Color(c));
  const pos = BALL_GEO.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI;
    const c = colors[Math.min(5, Math.floor((a / (Math.PI * 2)) * 6))];
    col.set([c.r, c.g, c.b], i * 3);
  }
  BALL_GEO.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
})();
const KICK_EVERY_MS = 450;
/** The beach ball: the room's ball (shared/volleyball.ts), stepped here between its patches; walking
 *  into it sends it up the way you are going. */
function Ball({ room, players, localSessionId }: { room: Room | null; players: Record<string, PlayerState>; localSessionId: string | null }) {
  const ref = useRef<THREE.Mesh>(null);
  const sim = useRef<{ ball: BallState; at: number } | null>(null);
  const lastKick = useRef(0);
  const live = useRef({ room, players, localSessionId });
  live.current = { room, players, localSessionId };
  useFrame((_, dt) => {
    const snap = ballStore.current;
    if (!snap || !ref.current) return;
    // (a fresh patch: take it, and run it forward by how old it is)
    if (!sim.current || sim.current.at !== snap.receivedAt) {
      sim.current = { ball: { x: snap.x, y: snap.y, z: snap.z, vx: snap.vx, vy: snap.vy, vz: snap.vz }, at: snap.receivedAt };
    } else {
      stepBall(sim.current.ball, Math.min(dt, 0.05));
    }
    const b = sim.current.ball;
    ref.current.position.set(b.x, BALL_COURT.y + b.y, b.z);
    ref.current.rotation.x += b.vz * dt * 3;
    ref.current.rotation.z -= b.vx * dt * 3;
    // your own bump: walking into it
    const { room: r, players: ps, localSessionId: id } = live.current;
    const me = id ? ps[id] : null;
    const at = id ? liveMotion.get(id) : undefined;
    if (!r || !me || me.sitting || !at || b.y > 0.9) return;
    const now = performance.now();
    if (now - lastKick.current < KICK_EVERY_MS) return;
    const dx = b.x - at.x;
    const dz = b.z - at.z;
    if (Math.hypot(dx, dz) > KICK_REACH) return;
    lastKick.current = now;
    // (away from you: the way you walked into it)
    r.send("kickBall", { dirX: dx, dirZ: dz });
    kickBall(b, dx, dz);
  });
  return <mesh ref={ref} geometry={BALL_GEO} material={BALL_MAT} raycast={noRaycast} />;
}
