import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { VIP_FRAME, VIP_LAYOUT as V, VIP_OFFSET } from "@shared/worlds/casino_vip";
import { ModelBoundary } from "../entities/ModelBoundary";
import { modelUrl } from "../assetVersion";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { GEO, matte, noRaycast } from "./kit";
import { useLampBoost } from "./timeOfDay";

// The Velvet Penthouse: the casino's VIP suite, a walled room of its own off to the side of the hall
// (shared/worlds/casino_vip.ts; nobody walks between them, Bruno's elevator carries pass holders up
// and down). One Blender model, casino_vip.glb (scripts/blender/build_casino_vip.py): its static
// mesh painted in vertex colours over the hall's finishes, and a few named nodes that move:
//
//   the city         the tall windows along the back walls: a skyline of lit windows that twinkle
//   the fountain     the champagne tower in the middle of the room, its glasses brimming and a
//                    stream of bubbles rising off it
//   the vault        the Golden Vault's marquee bulbs, chasing
//
// It is drawn only while you are up here (the hall is hidden meanwhile, and the other way round),
// with its own warm light: nothing casts a shadow.

export const CASINO_VIP_URL = modelUrl("casino_vip.glb");

const CLICK_MAT = new THREE.MeshBasicMaterial({ visible: false });
const DECAL_OFFSET: Record<string, number> = { CS_Decal1: -1, CS_Decal2: -3, CS_Neon: -3 };
const W = (x: number, z: number) => ({ x: x + VIP_OFFSET.x, z: z + VIP_OFFSET.z });

interface Props {
  onFloorClick: (x: number, z: number) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  up: boolean;
}

export function CasinoVipWorld({ onFloorClick, up }: Props) {
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  return (
    <group visible={up}>
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[VIP_FRAME.x, 0.02, VIP_FRAME.z]} scale={[V.half * 2, V.half * 2, 1]} onPointerDown={floorClick} />
      {up && (
        <ModelBoundary what="casino_vip.glb" fallback={<StandIn />}>
          <Suspense fallback={<StandIn />}>
            <VipModel />
          </Suspense>
        </ModelBoundary>
      )}
      {up && <Bubbles />}
      {up && <VipLights />}
    </group>
  );
}

const STAND_IN_TOP = matte("#3a1a4a", 0.9);
const STAND_IN_SIDE = matte("#1a1024", 0.85);
function StandIn() {
  return (
    <group position={[VIP_FRAME.x, 0, VIP_FRAME.z]}>
      <mesh geometry={GEO.box} material={STAND_IN_SIDE} position={[0, -0.3, 0]} scale={[V.half * 2, 0.6, V.half * 2]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={STAND_IN_TOP} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} scale={[V.half * 2, V.half * 2, 1]} raycast={noRaycast} />
    </group>
  );
}

function VipModel() {
  const { scene } = useGLTF(CASINO_VIP_URL);
  const boost = useLampBoost();
  const parts = useMemo(() => {
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const city = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const neon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: DECAL_OFFSET.CS_Neon, polygonOffsetUnits: DECAL_OFFSET.CS_Neon });
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.name === "CS_Glow") mesh.material = glow;
      else if (m.name === "CS_City") mesh.material = city;
      else if (m.name === "CS_Neon") mesh.material = neon;
      else {
        const offset = DECAL_OFFSET[m.name];
        if (offset !== undefined) {
          m.polygonOffset = true;
          m.polygonOffsetFactor = offset;
          m.polygonOffsetUnits = offset;
        }
      }
    });
    return { glow, city, neon, fountain: scene.getObjectByName("Prop_FountainTop") ?? null };
  }, [scene]);
  useEffect(
    () => () => {
      parts.glow.dispose();
      parts.city.dispose();
      parts.neon.dispose();
    },
    [parts]
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // the city breathes (a slow shimmer, a window going out now and then), the bulbs chase
    parts.city.color.setScalar(0.88 + 0.08 * Math.sin(t * 0.7) + (Math.sin(t * 13) > 0.97 ? -0.12 : 0));
    parts.glow.color.setScalar(0.94 + 0.05 * Math.min(1.5, boost) + 0.04 * Math.sin(t * 5));
    parts.neon.color.setScalar(0.85 + 0.15 * Math.sin(t * 1.3));
    if (parts.fountain) parts.fountain.rotation.y = t * 0.25;
  });
  return <primitive object={scene} />;
}

// --- the champagne tower's bubbles: rising off the top glass, drifting, gone ------------------------

const BUBBLES = 28;
const BUBBLE_GEO = new THREE.SphereGeometry(0.018, 6, 4);
const BUBBLE_MAT = new THREE.MeshBasicMaterial({ color: "#fff4c8", toneMapped: false });
const TOP_Y = 1.02;

function Bubbles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const at = W(V.fountain.x, V.fountain.z);
  const seeds = useMemo(() => Array.from({ length: BUBBLES }, (_, i) => ({ a: i * 2.39996, r: 0.04 + ((i * 7) % 10) / 90, speed: 0.25 + ((i * 13) % 10) / 30, off: (i / BUBBLES) * 3 })), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((b, i) => {
      const u = ((t * b.speed + b.off) % 1.2) / 1.2;
      dummy.position.set(at.x + Math.cos(b.a + t * 0.6) * b.r * (1 + u), TOP_Y + u * 0.55, at.z + Math.sin(b.a + t * 0.6) * b.r * (1 + u));
      dummy.scale.setScalar(u < 0.85 ? 0.6 + u * 0.6 : (1 - u) * 6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[BUBBLE_GEO, BUBBLE_MAT, BUBBLES]} raycast={noRaycast} frustumCulled={false} />;
}

/** The penthouse's light: a warm fill, the chandelier over the fountain, lamps over each table, the
 *  vault's gold and the city's violet through the windows. */
function VipLights() {
  const boost = useLampBoost();
  const lamp = Math.min(1.6, boost);
  const c = W(V.fountain.x, V.fountain.z);
  const poker = W(V.poker.x, V.poker.z);
  const bacc = W(V.baccarat.x, V.baccarat.z);
  const bj = W(V.blackjack.x, V.blackjack.z);
  // (between the twin Golden Vaults, in front of them)
  const vault = W((V.vault.xs[0] + V.vault.xs[V.vault.xs.length - 1]) / 2, V.vault.z);
  return (
    <>
      <hemisphereLight args={["#ffd9b0", "#3a1848", 0.95]} />
      <pointLight color="#ffd28a" intensity={4.2 * lamp} distance={9} decay={1.6} position={[c.x, 2.9, c.z]} castShadow={false} />
      <pointLight color="#ffe0a0" intensity={1.4 * lamp} distance={4} decay={2} position={[poker.x, 2.0, poker.z]} castShadow={false} />
      <pointLight color="#ffe0a0" intensity={1.4 * lamp} distance={4} decay={2} position={[bacc.x, 2.0, bacc.z - 0.3]} castShadow={false} />
      <pointLight color="#ffe0a0" intensity={1.3 * lamp} distance={4} decay={2} position={[bj.x, 2.0, bj.z - 0.3]} castShadow={false} />
      <pointLight color="#ffc24a" intensity={1.1} distance={3.5} decay={2} position={[vault.x, 1.6, vault.z + 0.8]} castShadow={false} />
      <pointLight color="#8a6cff" intensity={0.9} distance={7} decay={2} position={[VIP_FRAME.x - V.half + 0.8, 2.2, VIP_FRAME.z - V.half + 0.8]} castShadow={false} />
    </>
  );
}
