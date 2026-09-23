import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { ToggleableSyncState } from "@shared/types";
import { TOGGLEABLE_CONFIG } from "@shared/props";
import { GEO, noRaycast, onHitLayer } from "../scene/kit";
import { useLampBoost } from "../scene/timeOfDay";

// The Titan Infinity props: each is a walk-up thing that opens a panel on the HUD (the server
// answers "useProp" with "openPanel"), so the 3D piece only has to look inviting, idle
// charmingly and take a click. Materials are shared for the app's lifetime.

const HIT_PAD = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, visible: false });
const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
const M = {
  gachaBody: mat("#e94e77", { roughness: 0.5 }),
  gachaBodyB: mat("#4fb3e8", { roughness: 0.5 }),
  gachaBodyC: mat("#ffcf4a", { roughness: 0.5 }),
  glass: new THREE.MeshStandardMaterial({ color: "#dff4ff", roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }),
  chrome: mat("#c9ced6", { roughness: 0.3, metalness: 0.7 }),
  dark: mat("#1d1d28", { roughness: 0.6 }),
  capsuleA: mat("#ff7ab8"),
  capsuleB: mat("#7ae0ff"),
  capsuleC: mat("#ffe15f"),
  capsuleD: mat("#a8ff5f"),
  clawBody: mat("#3a2f6b", { roughness: 0.55 }),
  clawNeon: new THREE.MeshStandardMaterial({ color: "#ff5fc8", emissive: "#ff5fc8", emissiveIntensity: 1.6 }),
  plush: mat("#f0a860", { roughness: 0.95 }),
  plushCream: mat("#f6e2c4", { roughness: 0.95 }),
  wellCoin: mat("#f2c23a", { roughness: 0.3, metalness: 0.8 }),
  wellGlow: new THREE.MeshBasicMaterial({ color: "#9fe7ff", transparent: true, opacity: 0.35, depthWrite: false }),
  teaBowl: mat("#3b4a3a", { roughness: 0.6 }),
  matcha: mat("#7fae4a", { roughness: 0.9 }),
  whisk: mat("#d8c39a", { roughness: 1 }),
  tray: mat("#4a3524", { roughness: 0.9 }),
  blenderBase: mat("#f4efe6", { roughness: 0.6 }),
  blenderJug: new THREE.MeshStandardMaterial({ color: "#e8f6ff", roughness: 0.1, transparent: true, opacity: 0.4, depthWrite: false }),
  juice: mat("#ff9a5c", { roughness: 0.4 }),
  fruitA: mat("#ffb347"),
  fruitB: mat("#9be36d"),
  fruitC: mat("#7a4aa8"),
  boardLight: mat("#e8d5a8", { roughness: 0.9 }),
  boardDark: mat("#5a3a24", { roughness: 0.9 }),
  pieceRed: mat("#c9303e", { roughness: 0.5 }),
  pieceBlack: mat("#2a2a30", { roughness: 0.5 }),
  jukeBody: mat("#7a2a1e", { roughness: 0.6 }),
  jukeChrome: mat("#d8b45a", { roughness: 0.3, metalness: 0.7 }),
  jukeGlow: new THREE.MeshStandardMaterial({ color: "#ff9a5c", emissive: "#ff7a3c", emissiveIntensity: 1.2 }),
  jukeGlowB: new THREE.MeshStandardMaterial({ color: "#7fd3ff", emissive: "#3fa8ff", emissiveIntensity: 1.2 }),
  record: mat("#111114", { roughness: 0.4 }),
  bamboo: mat("#9fbd5a", { roughness: 0.8 }),
  stone: mat("#6d6a66", { roughness: 1, flatShading: true }),
  water: new THREE.MeshStandardMaterial({ color: "#7fc6c9", roughness: 0.1, transparent: true, opacity: 0.7, depthWrite: false }),
  lampWarm: new THREE.MeshStandardMaterial({ color: "#fff1c8", emissive: "#ffd28a", emissiveIntensity: 1.5 }),
};

function HitPad({ size, position, onUse }: { size: [number, number, number]; position: [number, number, number]; onUse: () => void }) {
  return (
    <mesh
      ref={onHitLayer}
      geometry={GEO.box}
      material={HIT_PAD}
      position={position}
      scale={size}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (e.button === 2) return;
        e.stopPropagation();
        onUse();
      }}
    />
  );
}

type P = { prop: ToggleableSyncState; onUse: () => void };
const rot = (prop: ToggleableSyncState) => TOGGLEABLE_CONFIG[prop.propId]?.rotationY ?? 0;

/** A gachapon machine: a glass globe of capsules on a bright body with a crank. */
export function Gachapon({ prop, onUse }: P) {
  const crankRef = useRef<THREE.Group>(null);
  const globeRef = useRef<THREE.Group>(null);
  const body = useMemo(() => [M.gachaBody, M.gachaBodyB, M.gachaBodyC][Math.abs(prop.propId.charCodeAt(prop.propId.length - 1)) % 3], [prop.propId]);
  const capsules = useMemo(() => {
    const out: { p: [number, number, number]; m: THREE.Material }[] = [];
    const mats = [M.capsuleA, M.capsuleB, M.capsuleC, M.capsuleD];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const r = 0.05 + (i % 3) * 0.06;
      out.push({ p: [Math.cos(a) * r, -0.16 + (i % 4) * 0.08, Math.sin(a) * r], m: mats[i % 4] });
    }
    return out;
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (crankRef.current) crankRef.current.rotation.z = Math.sin(t * 0.6) * 0.05;
    if (globeRef.current) globeRef.current.rotation.y = t * 0.15;
  });
  return (
    <group position={[prop.x, prop.y, prop.z]} rotation={[0, rot(prop), 0]}>
      <mesh geometry={GEO.box} material={body} position={[0, 0.5, 0]} scale={[0.7, 1.0, 0.6]} castShadow receiveShadow raycast={noRaycast} />
      <mesh geometry={GEO.box} material={M.dark} position={[0, 0.22, 0.31]} scale={[0.3, 0.16, 0.02]} raycast={noRaycast} />
      <group ref={crankRef} position={[0, 0.72, 0.32]}>
        <mesh geometry={GEO.cyl} material={M.chrome} rotation={[Math.PI / 2, 0, 0]} scale={[0.16, 0.06, 0.16]} raycast={noRaycast} />
        <mesh geometry={GEO.box} material={M.chrome} position={[0.07, 0, 0.04]} scale={[0.14, 0.03, 0.03]} raycast={noRaycast} />
        <mesh geometry={GEO.sphereLow} material={M.dark} position={[0.14, 0, 0.06]} scale={0.04} raycast={noRaycast} />
      </group>
      <group ref={globeRef} position={[0, 1.3, 0]}>
        {capsules.map((c, i) => (
          <mesh key={i} geometry={GEO.sphereLow} material={c.m} position={c.p} scale={0.1} raycast={noRaycast} />
        ))}
        <mesh geometry={GEO.sphere} material={M.glass} scale={0.62} raycast={noRaycast} />
      </group>
      <mesh geometry={GEO.cyl} material={M.chrome} position={[0, 1.0, 0]} scale={[0.66, 0.06, 0.66]} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.chrome} position={[0, 1.62, 0]} scale={0.08} raycast={noRaycast} />
      <HitPad size={[0.9, 1.8, 0.9]} position={[0, 0.9, 0]} onUse={onUse} />
    </group>
  );
}

/** The claw machine: a glass case of plushies, a neon-edged cabinet, the claw swaying above. */
export function ClawMachine({ prop, onUse }: P) {
  const clawRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (clawRef.current) clawRef.current.position.x = Math.sin(t * 0.5) * 0.25;
  });
  const plushies = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) out.push([-0.3 + (i % 4) * 0.2, 0.86 + Math.floor(i / 4) * 0.18, -0.15 + (i % 3) * 0.15]);
    return out;
  }, []);
  return (
    <group position={[prop.x, prop.y, prop.z]} rotation={[0, rot(prop), 0]}>
      <mesh geometry={GEO.box} material={M.clawBody} position={[0, 0.4, 0]} scale={[1.1, 0.8, 0.9]} castShadow receiveShadow raycast={noRaycast} />
      <mesh geometry={GEO.box} material={M.clawBody} position={[0, 2.05, 0]} scale={[1.14, 0.3, 0.94]} castShadow raycast={noRaycast} />
      <mesh geometry={GEO.box} material={M.glass} position={[0, 1.35, 0]} scale={[1.04, 1.1, 0.84]} raycast={noRaycast} />
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} geometry={GEO.box} material={M.clawNeon} position={[x, 1.35, 0.44]} scale={[0.04, 1.1, 0.04]} raycast={noRaycast} />
      ))}
      <mesh geometry={GEO.box} material={M.clawNeon} position={[0, 2.05, 0.48]} scale={[1.0, 0.1, 0.02]} raycast={noRaycast} />
      {plushies.map((p, i) => (
        <mesh key={i} geometry={GEO.sphereLow} material={i % 3 ? M.plush : M.plushCream} position={p} scale={[0.18, 0.15, 0.17]} raycast={noRaycast} />
      ))}
      <group ref={clawRef} position={[0, 1.85, 0]}>
        <mesh geometry={GEO.cyl} material={M.chrome} position={[0, -0.12, 0]} scale={[0.02, 0.24, 0.02]} raycast={noRaycast} />
        {[0, 2.1, 4.2].map((a) => (
          <mesh key={a} geometry={GEO.box} material={M.chrome} position={[Math.cos(a) * 0.06, -0.3, Math.sin(a) * 0.06]} rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]} scale={[0.025, 0.14, 0.025]} raycast={noRaycast} />
        ))}
      </group>
      {/* the joystick and the prize chute */}
      <mesh geometry={GEO.box} material={M.dark} position={[0, 0.82, 0.5]} scale={[0.6, 0.06, 0.16]} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.clawNeon} position={[-0.15, 0.92, 0.5]} scale={0.05} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={M.dark} position={[0.3, 0.3, 0.46]} scale={[0.3, 0.26, 0.02]} raycast={noRaycast} />
      <HitPad size={[1.3, 2.2, 1.1]} position={[0, 1.1, 0]} onUse={onUse} />
    </group>
  );
}

/** The wishing well's glow and the coins glinting at the bottom (the well itself is in OnsenWorld). */
export function WishingWellProp({ prop, onUse }: P) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(0.9 + Math.sin(clock.elapsedTime * 1.4) * 0.08);
  });
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh ref={ref} geometry={GEO.cyl} material={M.wellGlow} position={[0, 0.83, 0]} scale={[1.2, 0.02, 1.2]} raycast={noRaycast} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={GEO.cyl} material={M.wellCoin} position={[Math.cos(i * 1.7) * 0.3, 0.805, Math.sin(i * 1.7) * 0.3]} scale={[0.08, 0.01, 0.08]} raycast={noRaycast} />
      ))}
      <HitPad size={[1.8, 1.4, 1.8]} position={[0, 0.7, 0]} onUse={onUse} />
    </group>
  );
}

/** The tea set on the tea house's low table: a tray, a bowl of matcha, a whisk and a lantern. */
export function TeaHouseProp({ prop, onUse }: P) {
  const boost = useLampBoost();
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (lightRef.current) lightRef.current.intensity = (0.5 + Math.sin(clock.elapsedTime * 2) * 0.05) * boost;
  });
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh geometry={GEO.box} material={M.tray} position={[0, 0.02, 0]} scale={[0.7, 0.04, 0.44]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.teaBowl} position={[-0.15, 0.1, 0]} scale={[0.22, 0.14, 0.22]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.matcha} position={[-0.15, 0.165, 0]} scale={[0.18, 0.01, 0.18]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.whisk} position={[0.14, 0.12, 0.05]} rotation={[0, 0, 0.5]} scale={[0.06, 0.2, 0.06]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.teaBowl} position={[0.24, 0.08, -0.12]} scale={[0.1, 0.1, 0.1]} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.lampWarm} position={[0.7, 0.28, -0.3]} scale={[0.16, 0.22, 0.16]} raycast={noRaycast} />
      <pointLight ref={lightRef} position={[0.7, 0.4, -0.3]} color="#ffd28a" intensity={0.5} distance={4} decay={2} castShadow={false} />
      <HitPad size={[1.2, 0.8, 0.9]} position={[0, 0.3, 0]} onUse={onUse} />
    </group>
  );
}

/** The tiki bar blender: a jug on a base with fruit round it, whirring while a drink is made. */
export function BlenderProp({ prop, onUse }: P) {
  const juiceRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (juiceRef.current) juiceRef.current.rotation.y = clock.elapsedTime * 3;
  });
  return (
    <group position={[prop.x, prop.y, prop.z]} rotation={[0, rot(prop), 0]}>
      <mesh geometry={GEO.box} material={M.blenderBase} position={[0, 0.12, 0]} scale={[0.3, 0.24, 0.3]} castShadow raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.dark} position={[0, 0.25, 0]} scale={[0.2, 0.03, 0.2]} raycast={noRaycast} />
      <mesh ref={juiceRef} geometry={GEO.cyl} material={M.juice} position={[0, 0.4, 0]} scale={[0.18, 0.24, 0.18]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.blenderJug} position={[0, 0.5, 0]} scale={[0.22, 0.5, 0.22]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.dark} position={[0, 0.77, 0]} scale={[0.2, 0.04, 0.2]} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.fruitA} position={[0.34, 0.08, 0.1]} scale={0.14} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.fruitB} position={[-0.32, 0.06, 0.16]} scale={0.1} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.fruitC} position={[-0.26, 0.06, -0.18]} scale={0.09} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={M.dark} position={[0.14, 0.26, 0.16]} scale={[0.04, 0.03, 0.02]} raycast={noRaycast} />
      <HitPad size={[0.9, 1.0, 0.8]} position={[0, 0.5, 0]} onUse={onUse} />
    </group>
  );
}

/** The board game on the lounge table: a checkered board with a few pieces set out. */
export function BoardGameProp({ prop, onUse }: P) {
  const squares = useMemo(() => {
    const out: { p: [number, number, number]; dark: boolean }[] = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) out.push({ p: [-0.35 + i * 0.1, 0.03, -0.35 + j * 0.1], dark: (i + j) % 2 === 1 });
    return out;
  }, []);
  const lightGeo = useMemo(() => mergeSquares(squares.filter((s) => !s.dark)), [squares]);
  const darkGeo = useMemo(() => mergeSquares(squares.filter((s) => s.dark)), [squares]);
  useEffect(() => () => (lightGeo.dispose(), darkGeo.dispose()), [lightGeo, darkGeo]);
  return (
    <group position={[prop.x, prop.y, prop.z]} rotation={[0, rot(prop), 0]}>
      <mesh geometry={GEO.box} material={M.tray} position={[0, 0.01, 0]} scale={[0.86, 0.03, 0.86]} raycast={noRaycast} />
      <mesh geometry={lightGeo} material={M.boardLight} raycast={noRaycast} />
      <mesh geometry={darkGeo} material={M.boardDark} raycast={noRaycast} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`r${i}`} geometry={GEO.cyl} material={M.pieceRed} position={[-0.35 + (i * 2 + 1) * 0.1, 0.06, -0.35]} scale={[0.08, 0.03, 0.08]} raycast={noRaycast} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`b${i}`} geometry={GEO.cyl} material={M.pieceBlack} position={[-0.35 + i * 2 * 0.1, 0.06, 0.35]} scale={[0.08, 0.03, 0.08]} raycast={noRaycast} />
      ))}
      <HitPad size={[1.0, 0.5, 1.0]} position={[0, 0.2, 0]} onUse={onUse} />
    </group>
  );
}

function mergeSquares(list: { p: [number, number, number] }[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  list.forEach((s, k) => {
    const [x, y, z] = s.p;
    const h = 0.048;
    positions.push(x - h, y, z - h, x + h, y, z - h, x + h, y, z + h, x - h, y, z + h);
    for (let i = 0; i < 4; i++) normals.push(0, 1, 0);
    const b = k * 4;
    index.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(index);
  return geo;
}

/** A 1950s jukebox: an arched cabinet with glowing pipes, a record spinning behind the window. */
export function Jukebox({ prop, onUse }: P) {
  const recordRef = useRef<THREE.Mesh>(null);
  const boost = useLampBoost();
  useFrame(({ clock }) => {
    if (recordRef.current && prop.on) recordRef.current.rotation.y = clock.elapsedTime * 4;
  });
  const glow = prop.on ? M.jukeGlow : M.jukeChrome;
  const glowB = prop.on ? M.jukeGlowB : M.jukeChrome;
  return (
    <group position={[prop.x, prop.y, prop.z]} rotation={[0, rot(prop), 0]}>
      <mesh geometry={GEO.box} material={M.jukeBody} position={[0, 0.6, 0]} scale={[1.0, 1.2, 0.6]} castShadow receiveShadow raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.jukeBody} position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.0, 0.6, 1.0]} castShadow raycast={noRaycast} />
      {/* the arch of glowing pipes */}
      <mesh geometry={GEO.torus} material={glow} position={[0, 1.2, 0.31]} scale={[0.9, 0.9, 0.9]} raycast={noRaycast} />
      <mesh geometry={GEO.torus} material={glowB} position={[0, 1.2, 0.31]} scale={[0.72, 0.72, 0.9]} raycast={noRaycast} />
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} geometry={GEO.box} material={glow} position={[x, 0.7, 0.31]} scale={[0.06, 1.0, 0.04]} raycast={noRaycast} />
      ))}
      {/* the window with the record, the speaker grille and the buttons */}
      <mesh geometry={GEO.box} material={M.dark} position={[0, 1.25, 0.28]} scale={[0.5, 0.36, 0.06]} raycast={noRaycast} />
      <mesh ref={recordRef} geometry={GEO.cyl} material={M.record} position={[0, 1.25, 0.3]} rotation={[Math.PI / 2, 0, 0]} scale={[0.3, 0.02, 0.3]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.jukeChrome} position={[0, 1.25, 0.32]} rotation={[Math.PI / 2, 0, 0]} scale={[0.08, 0.02, 0.08]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={M.jukeChrome} position={[0, 0.45, 0.31]} scale={[0.7, 0.5, 0.02]} raycast={noRaycast} />
      {[-0.2, -0.07, 0.07, 0.2].map((x, i) => (
        <mesh key={x} geometry={GEO.cyl} material={i % 2 ? M.jukeGlow : M.jukeGlowB} position={[x, 0.85, 0.32]} rotation={[Math.PI / 2, 0, 0]} scale={[0.06, 0.02, 0.06]} raycast={noRaycast} />
      ))}
      <pointLight position={[0, 1.3, 0.8]} color="#ff9a5c" intensity={prop.on ? 0.9 * boost : 0} distance={4} decay={2} castShadow={false} />
      <HitPad size={[1.2, 2.0, 0.9]} position={[0, 1.0, 0.1]} onUse={onUse} />
    </group>
  );
}

/** A stand-alone shishi-odoshi for worlds that place one as a prop (the onsen draws its own). */
export function ShishiOdoshiProp({ prop, onUse }: P) {
  const tubeRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = tubeRef.current;
    if (!g) return;
    const cycle = clock.elapsedTime % 6;
    g.rotation.z = cycle < 4.6 ? -0.05 - (cycle / 4.6) * 0.25 : cycle < 5.0 ? 0.55 - (cycle - 4.6) * 1.5 : -0.05;
  });
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh geometry={GEO.box} material={M.stone} position={[0, 0.16, 0]} scale={[1.0, 0.32, 0.8]} castShadow raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.water} position={[0, 0.34, 0]} scale={[0.6, 0.06, 0.5]} raycast={noRaycast} />
      <group ref={tubeRef} position={[0, 0.78, 0]}>
        <mesh geometry={GEO.cyl} material={M.bamboo} position={[0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 1.0, 0.1]} raycast={noRaycast} />
      </group>
      <HitPad size={[1.2, 1.2, 1.0]} position={[0, 0.5, 0]} onUse={onUse} />
    </group>
  );
}
