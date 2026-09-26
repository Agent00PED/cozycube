import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import { CASINO_LAYOUT as L } from "@shared/worlds/casino";
import { ModelBoundary } from "../entities/ModelBoundary";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "./kit";
import { useLampBoost } from "./timeOfDay";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { Vance } from "../entities/Vance";

// The Velvet Casino (map 3). The hall is one Blender model, casino.glb
// (scripts/blender/build_casino.py, laid out from shared/worlds/casino.ts): everything that stands
// still is a single mesh with a slot per finish, and the roulette wheel is a node of its own. This
// file loads it and lights it:
//
//   the floor        the zone floors and the gold inlays sit a few millimetres over the carpet, each
//                    nudged toward the camera in the depth test too: never a flicker
//   the wheel        turns slowly while bets are open, spins up when the croupier launches it and
//                    runs down over the spin (the room's roulette phase)
//   the neon         Neon Alley's tubes and floor strip breathe, with the odd flutter
//   Mr. Vance        the fox cashier at the Golden Cage's window, on the platform behind its counter
//                    (entities/Vance.tsx): he looks up at whoever comes to the window and waves as
//                    they open the cage
//   the light        a low warm ambient (the hour's), amber pools under the four chandeliers, a wash
//                    along each wall from its sconces, the banker's lamp in the cage, the back bar,
//                    the lounge's candles, and a pink and a cyan glow off the slot row
//
// Walking is a flat invisible plane over the floor (the model never takes clicks), as at the
// campfire. No light casts a shadow.

export const CASINO_URL = modelUrl("casino.glb");

/** Floor layers by material, and how far each is nudged toward the camera in the depth test. */
const DECAL_OFFSET: Record<string, number> = {
  CS_MarbleLight: -1,
  CS_MarbleDark: -1,
  CS_Terrazzo: -1,
  CS_PitCarpet: -1,
  CS_Plank: -1,
  CS_PlankDark: -1,
  CS_Runner: -2,
  CS_Inlay: -3,
  CS_NeonCyan: -3,
};
const NEON = new Set(["CS_NeonPink", "CS_NeonCyan"]);
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/** The wheel's turn (radians per second): idling while bets are open, launched, and run down. */
const WHEEL_IDLE = 0.35;
const WHEEL_LAUNCH = 9;

interface CasinoWorldProps {
  onFloorClick: (x: number, z: number) => void;
  /** The room, for the roulette's phase (the wheel follows it). */
  room: Room | null;
  /** One-shot messages (Mr. Vance waves on "vanceWave"). */
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

export function CasinoWorld({ onFloorClick, room, subscribeMessages }: CasinoWorldProps) {
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  return (
    <group>
      <CasinoBackdrop />
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[L.half * 2, L.half * 2, 1]} onPointerDown={floorClick} />
      <ModelBoundary what="casino.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <CasinoModel room={room} />
        </Suspense>
      </ModelBoundary>
      <Vance subscribeMessages={subscribeMessages} />
      <CasinoLights />
    </group>
  );
}

// while the model loads, or if it cannot: the hall as a plain slab of burgundy carpet
const STAND_IN_TOP = matte("#5a1424", 0.9);
const STAND_IN_SIDE = matte("#24140f", 0.85);
function StandIn() {
  return (
    <group>
      <mesh geometry={GEO.box} material={STAND_IN_SIDE} position={[0, -0.3, 0]} scale={[L.half * 2, 0.6, L.half * 2]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={STAND_IN_TOP} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} scale={[L.half * 2, L.half * 2, 1]} raycast={noRaycast} />
    </group>
  );
}

/** The hall from Blender: its floor layers offset, its glow kept, the wheel and the neon alive. */
function CasinoModel({ room }: { room: Room | null }) {
  const { scene } = useGLTF(CASINO_URL);
  const boost = useLampBoost();
  const parts = useMemo(() => {
    const neon = new Set<THREE.MeshStandardMaterial>();
    const glow = new Set<THREE.MeshStandardMaterial>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {}; // the invisible floor plane takes the clicks
      const m = mesh.material as THREE.MeshStandardMaterial;
      const offset = DECAL_OFFSET[m.name];
      if (offset !== undefined) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = offset;
        m.polygonOffsetUnits = offset;
      }
      if (m.emissive && m.emissive.getHex() !== 0) {
        // glowing things keep their colour: the tone mapping would bleach them white
        m.toneMapped = false;
        (NEON.has(m.name) ? neon : glow).add(m);
      }
    });
    return { wheel: scene.getObjectByName("Prop_RouletteWheel") ?? null, neon: [...neon], glow: [...glow] };
  }, [scene]);
  const spin = useRef({ phase: "", since: 0, speed: WHEEL_IDLE });

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    // the wheel: launched as the spin starts, then running down to a crawl over the spin
    const phase = room?.state?.roulette?.phase ?? "betting";
    const s = spin.current;
    if (phase !== s.phase) {
      s.phase = phase;
      s.since = t;
    }
    const target = phase === "spinning" ? WHEEL_LAUNCH * Math.max(0.08, 1 - (t - s.since) / 6) : WHEEL_IDLE;
    s.speed += (target - s.speed) * Math.min(1, dt * (phase === "spinning" && t - s.since < 0.5 ? 6 : 1.2));
    if (parts.wheel) parts.wheel.rotation.y += s.speed * dt;
    // the neon breathes, with the odd flutter; the lamps sit a touch brighter after dark
    const flutter = Math.sin(t * 23) > 0.985 ? 0.55 : 1;
    for (const m of parts.neon) m.emissiveIntensity = (0.85 + 0.15 * Math.sin(t * 1.7)) * flutter;
    for (const m of parts.glow) m.emissiveIntensity = 0.8 + 0.1 * Math.min(1.5, boost);
  });

  return <primitive object={scene} />;
}

/** The casino's own lights, all warm and shadowless (a fill, then point lights scaled by the hour's lamp boost). */
function CasinoLights() {
  const boost = useLampBoost();
  const lamp = Math.min(1.6, boost);
  const face = -L.half + L.walls.t;
  const [pinkX, pinkY] = [L.slots.x + 1.2, 1.7];
  return (
    <>
      {/* the hall's own fill: warm from above, plum from the carpet, so the velvet reads as red, not black */}
      <hemisphereLight args={["#ffd9a8", "#4a1a26", 0.9]} />
      {L.chandeliers.map(([x, y, z], i) => (
        <pointLight key={i} color="#ffc873" intensity={5 * lamp} distance={13} decay={1.6} position={[x, y - 0.25, z]} castShadow={false} />
      ))}
      {/* the sconces along each wall: one soft wash apiece */}
      <pointLight color="#ffcf8a" intensity={1.1 * lamp} distance={8} decay={2} position={[-4, 2.4, face + 0.6]} castShadow={false} />
      <pointLight color="#ffcf8a" intensity={1.1 * lamp} distance={8} decay={2} position={[face + 0.6, 2.4, -8]} castShadow={false} />
      {/* the banker's lamp in the cage, the back bar, the lounge's candles */}
      <pointLight color="#ffd98a" intensity={0.9 * lamp} distance={4} decay={2} position={[L.cage.window - 0.85, 1.5, L.cage.z1 - 0.4]} castShadow={false} />
      <pointLight color="#ffc070" intensity={1.1 * lamp} distance={5} decay={2} position={[face + 0.8, 2.3, (L.bar.z0 + L.bar.z1) / 2]} castShadow={false} />
      <pointLight color="#ffb866" intensity={0.8 * lamp} distance={4.5} decay={2} position={[(L.cocktails[0].x + L.cocktails[1].x) / 2, 1.0, L.cocktails[0].z]} castShadow={false} />
      {/* Neon Alley: a pink glow and a cyan one off the slot row */}
      <pointLight color="#ff4fa3" intensity={1.0} distance={5} decay={2} position={[pinkX, pinkY, L.slots.zs[1]]} castShadow={false} />
      <pointLight color="#4fe3ff" intensity={0.9} distance={5} decay={2} position={[pinkX, pinkY, L.slots.zs[4]]} castShadow={false} />
    </>
  );
}

/** Inside, there is no sky: a deep plum dark behind the hall, whatever the hour. */
export function CasinoBackdrop() {
  const scene = useThree((s) => s.scene);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#0e0709");
      grad.addColorStop(1, "#22101a");
      g.fillStyle = grad;
      g.fillRect(0, 0, 2, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
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
