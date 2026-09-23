import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { MAP_HALF } from "@shared/types";
import { B, Cyl, FloorPatch, GEO, Instanced, Sph, noMerge, noRaycast, seeded, type InstanceSpec, type Materials } from "./kit";
import { Occluder } from "./Occluder";

// A 24x24 neon arcade: dark walls with pastel neon tubes along the top, a checkered floor, a
// pulsing dance floor in the middle, the row of cabinets along the back wall (the "arcade"
// props), gachapon machines along the west wall (the "gacha" props), the claw machine and the
// prize counter in the far corner, a snack bar east, pinball, a photo booth and the big screen
// with beanbags in front of it. Mochi naps on a warm cabinet.
const HALF = MAP_HALF.retro_arcade;
const WALL_H = 4.0;
const WALL_T = 0.2;

function useArcadeMaterials() {
  const m = useMemo(() => {
    const make = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });
    const neon = (color: string) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.4 });
    return {
      wall: make("#1b1a33", { roughness: 0.9 }),
      tileA: make("#2a2848", { roughness: 0.7 }),
      tileB: make("#3a3466", { roughness: 0.7 }),
      trim: make("#0d0d1c", { roughness: 0.6 }),
      pink: neon("#ff5fc8"),
      cyan: neon("#4fe3ff"),
      lime: neon("#a8ff5f"),
      yellow: neon("#ffe15f"),
      cabinet: make("#3a2f6b", { roughness: 0.6 }),
      counter: make("#5c2a7a", { roughness: 0.6 }),
      counterTop: make("#e9dcff", { roughness: 0.3 }),
      plush: make("#f0a860", { roughness: 0.9 }),
      plushCream: make("#f6e2c4", { roughness: 0.9 }),
      popcorn: make("#ffe9a8", { roughness: 1 }),
      screen: make("#0b0b16", { emissive: "#3a6ea8", emissiveIntensity: 0.9 }),
      curtain: make("#b3202e", { roughness: 1 }),
      pinball: make("#2c8fd1", { roughness: 0.5 }),
      // unlit, so the per-instance neon colour is what you see (instance colours only tint diffuse)
      danceTile: new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
    };
  }, []);
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  return m;
}
type ArcadeMats = ReturnType<typeof useArcadeMaterials>;

export function ArcadeWorld({ mats }: { mats: Materials }) {
  const a = useArcadeMaterials();
  return (
    <>
      <Shell mats={mats} a={a} />
      <DanceFloor a={a} />
      <PrizeCorner mats={mats} a={a} />
      <SnackBar mats={mats} a={a} />
      <Pinball a={a} />
      <PhotoBooth mats={mats} a={a} />
      <BigScreen a={a} />
    </>
  );
}

function Shell({ mats, a }: { mats: Materials; a: ArcadeMats }) {
  const tiles = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    const n = 12;
    const size = (HALF * 2) / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        out.push({ p: [-HALF + size / 2 + i * size, 0.004, -HALF + size / 2 + j * size], s: [size - 0.02, 0.006, size - 0.02], color: (i + j) % 2 ? "#2a2848" : "#3a3466" });
      }
    }
    return out;
  }, []);
  const tubes = useMemo(() => {
    const y = WALL_H - 0.5;
    return {
      pink: [{ p: [0, y, -HALF + WALL_T + 0.05], s: [HALF * 2 - 0.4, 0.06, 0.06] }] as InstanceSpec[],
      cyan: [{ p: [-HALF + WALL_T + 0.05, y, 0], s: [0.06, 0.06, HALF * 2 - 0.4] }] as InstanceSpec[],
      lime: [
        { p: [0, y - 0.3, -HALF + WALL_T + 0.05], s: [HALF * 2 - 0.4, 0.04, 0.04] },
        { p: [-HALF + WALL_T + 0.05, y - 0.3, 0], s: [0.04, 0.04, HALF * 2 - 0.4] },
      ] as InstanceSpec[],
    };
  }, []);
  return (
    <>
      <B p={[0, WALL_H / 2, -HALF + WALL_T / 2]} s={[HALF * 2, WALL_H, WALL_T]} m={a.wall} cast recv />
      <B p={[-HALF + WALL_T / 2, WALL_H / 2, 0]} s={[WALL_T, WALL_H, HALF * 2]} m={a.wall} cast recv />
      <Instanced geo={GEO.box} m={mats.tintable} items={tiles} recv />
      <Instanced geo={GEO.box} m={a.pink} items={tubes.pink} />
      <Instanced geo={GEO.box} m={a.cyan} items={tubes.cyan} />
      <Instanced geo={GEO.box} m={a.lime} items={tubes.lime} />
      {/* the sign over the cabinets */}
      <B p={[-3.4, 3.1, -HALF + WALL_T + 0.06]} s={[6.4, 0.9, 0.08]} m={a.trim} />
      <Text font="/fonts/kenpixel.ttf" position={[-3.4, 3.1, -HALF + WALL_T + 0.12]} fontSize={0.6} color="#ff5fc8" anchorX="center" anchorY="middle" outlineColor="#ffe15f" outlineWidth={0.02}>
        ARCADE
      </Text>
      {/* the way in: a neon-framed doorway on the south side */}
      <group position={[1.0, 0, HALF - 0.3]}>
        <B p={[-1.3, 1.5, 0]} s={[0.2, 3.0, 0.2]} m={a.trim} />
        <B p={[1.3, 1.5, 0]} s={[0.2, 3.0, 0.2]} m={a.trim} />
        <B p={[0, 3.05, 0]} s={[2.8, 0.2, 0.2]} m={a.trim} />
        <B p={[0, 3.05, 0.11]} s={[2.4, 0.06, 0.02]} m={a.cyan} />
        <B p={[-1.3, 1.5, 0.11]} s={[0.06, 2.8, 0.02]} m={a.pink} />
        <B p={[1.3, 1.5, 0.11]} s={[0.06, 2.8, 0.02]} m={a.pink} />
      </group>
    </>
  );
}

/** The dance floor: a 6x6 of tiles that ripple through the neon palette. */
function DanceFloor({ a }: { a: ArcadeMats }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const palette = useMemo(() => ["#ff5fc8", "#4fe3ff", "#a8ff5f", "#ffe15f", "#b28cff"].map((c) => new THREE.Color(c)), []);
  const n = 6;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        tmp.position.set(-2.5 + i, 0.012, -2.5 + j);
        tmp.scale.set(0.94, 0.01, 0.94);
        tmp.updateMatrix();
        mesh.setMatrixAt(i * n + j, tmp.matrix);
      }
    mesh.instanceMatrix.needsUpdate = true;
  }, [tmp]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const k = Math.floor(((Math.sin(t * 1.4 + i * 0.9 + j * 0.6) + 1) / 2) * (palette.length - 0.001));
        color.copy(palette[k]).multiplyScalar(0.55 + 0.45 * Math.max(0, Math.sin(t * 3 + i + j)));
        mesh.setColorAt(i * n + j, color);
      }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[GEO.box, a.danceTile, n * n]} raycast={noRaycast} userData={{ noMerge: true }} />;
}

/** The prize counter with a stack of Mochi plushies, next to the claw machine (a prop). */
function PrizeCorner({ mats, a }: { mats: Materials; a: ArcadeMats }) {
  const rand = useMemo(() => seeded(9), []);
  const plushies = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (let i = 0; i < 9; i++) out.push({ p: [7.2 + (i % 5) * 0.9, 1.35 + Math.floor(i / 5) * 0.55, -11.1 + (rand() - 0.5) * 0.2], s: [0.44, 0.34, 0.4], r: [0, rand() * 1.2 - 0.6, 0] });
    return out;
  }, [rand]);
  return (
    <>
      <B p={[9.0, 0.55, -11.1]} s={[5.2, 1.1, 1.4]} m={a.counter} cast recv />
      <B p={[9.0, 1.13, -11.05]} s={[5.3, 0.06, 1.5]} m={a.counterTop} />
      <B p={[9.0, 2.2, -HALF + WALL_T + 0.05]} s={[5.0, 1.6, 0.08]} m={a.trim} />
      {[1.7, 2.35].map((y) => (
        <B key={y} p={[9.0, y, -HALF + WALL_T + 0.16]} s={[4.8, 0.05, 0.3]} m={a.counterTop} />
      ))}
      <Instanced geo={GEO.sphereLow} m={a.plush} items={plushies} />
      <B p={[9.0, 2.95, -HALF + WALL_T + 0.1]} s={[2.4, 0.3, 0.04]} m={a.yellow} />
      {/* a till and a tickets jar on the counter */}
      <B p={[10.6, 1.3, -11.0]} s={[0.5, 0.3, 0.4]} m={mats.charcoal} />
      <Cyl p={[7.6, 1.3, -10.9]} s={[0.34, 0.34, 0.34]} m={mats.glass} />
      <Cyl p={[7.6, 1.24, -10.9]} s={[0.3, 0.2, 0.3]} m={a.pink} />
    </>
  );
}

function SnackBar({ mats, a }: { mats: Materials; a: ArcadeMats }) {
  const popcorn = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(5);
    return Array.from({ length: 12 }, () => ({ p: [9.6 + (rand() - 0.5) * 0.4, 1.4 + rand() * 0.3, 2.6 + (rand() - 0.5) * 0.4] as [number, number, number], s: [0.1, 0.1, 0.1] as [number, number, number] }));
  }, []);
  return (
    <>
      <B p={[9.6, 0.55, 0]} s={[1.5, 1.1, 6.8]} m={a.counter} cast recv />
      <B p={[9.5, 1.13, 0]} s={[1.9, 0.06, 7.0]} m={a.counterTop} cast />
      <B p={[8.75, 0.3, 0]} s={[0.05, 0.6, 6.6]} m={a.cyan} />
      {/* popcorn machine and a slushie tower */}
      <B p={[9.6, 1.55, 2.6]} s={[0.8, 0.8, 0.8]} m={mats.glass} />
      <B p={[9.6, 2.0, 2.6]} s={[0.84, 0.12, 0.84]} m={a.curtain} />
      <Instanced geo={GEO.sphereLow} m={a.popcorn} items={popcorn} />
      <Cyl p={[9.6, 1.55, -2.4]} s={[0.5, 0.8, 0.5]} m={mats.glass} />
      <Cyl p={[9.6, 1.45, -2.4]} s={[0.44, 0.5, 0.44]} m={a.pink} />
      <Cyl p={[9.6, 2.0, -2.4]} s={[0.54, 0.1, 0.54]} m={a.trim} />
      {[-0.8, 0.2].map((z) => (
        <Cyl key={z} p={[9.3, 1.28, z]} s={[0.18, 0.28, 0.18]} m={z < 0 ? a.cyan : a.lime} />
      ))}
    </>
  );
}

function Pinball({ a }: { a: ArcadeMats }) {
  return (
    <>
      {[4.8, 7.0].map((z, i) => (
        <group key={z} position={[-11.1, 0, z]} rotation={[0, Math.PI / 2, 0]}>
          <B p={[0, 0.85, 0]} s={[1.5, 0.3, 1.0]} r={[0.12, 0, 0]} m={a.cabinet} cast />
          <B p={[0, 1.02, -0.02]} s={[1.3, 0.04, 0.8]} r={[0.12, 0, 0]} m={i ? a.pinball : a.pink} />
          <B p={[0, 1.6, -0.55]} s={[1.5, 1.2, 0.2]} m={a.cabinet} cast />
          <B p={[0, 1.6, -0.44]} s={[1.3, 1.0, 0.02]} m={a.screen} />
          {[-0.55, 0.55].map((x) => (
            <B key={x} p={[x, 0.35, 0.3]} s={[0.08, 0.7, 0.08]} m={a.trim} />
          ))}
        </group>
      ))}
    </>
  );
}

function PhotoBooth({ mats, a }: { mats: Materials; a: ArcadeMats }) {
  return (
    <group position={[-5.2, 0, 9.5]}>
      <B p={[0, 1.2, 0]} s={[1.6, 2.4, 1.4]} m={a.cabinet} cast recv />
      <B p={[0.81, 1.1, 0]} s={[0.02, 2.0, 1.1]} m={a.curtain} />
      <B p={[0, 2.5, 0]} s={[1.7, 0.2, 1.5]} m={a.trim} />
      <B p={[0.86, 2.2, 0]} s={[0.02, 0.3, 1.2]} m={a.yellow} />
      <Sph p={[0, 2.75, 0]} s={0.3} m={mats.bulb} />
    </group>
  );
}

/** The big screen on a stand with the beanbags facing it (seats), a tall one so it occludes. */
function BigScreen({ a }: { a: ArcadeMats }) {
  return (
    <Occluder x={6.4} z={6.5} halfWidth={1.8}>
      <group position={[6.4, 0, 6.5]}>
        <B p={[0, 0.3, 0]} s={[0.6, 0.6, 1.0]} m={a.trim} cast />
        <B p={[0, 1.7, 0]} s={[0.16, 2.4, 3.0]} m={a.trim} cast />
        <B p={[-0.1, 1.7, 0]} s={[0.02, 2.0, 2.7]} m={a.screen} />
        <B p={[-0.12, 1.7, 0]} s={[0.01, 0.4, 1.6]} m={a.lime} />
      </group>
    </Occluder>
  );
}

// Keep the kit's noMerge referenced for the animated pieces above (tree-shaken otherwise).
void noMerge;
void Sph;
void Cyl;
