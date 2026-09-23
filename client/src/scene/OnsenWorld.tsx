import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAP_HALF, ONSEN_POOL } from "@shared/types";
import { CUSHIONS } from "@shared/seats";
import { MAP_CHAIRS } from "@shared/props";
import { B, Cyl, FloorPatch, GEO, Instanced, Sph, noMerge, noRaycast, seeded, type InstanceSpec, type Materials } from "./kit";
import { Occluder } from "./Occluder";

// A 26x26 mountain bathhouse: the hot spring in the middle (a basin the floor steps down into,
// see walkY), river stones round its rim with the steps on the south side, bamboo to the north
// and west, cherry trees dropping petals, a tea house on its veranda, the wishing well, stone
// lanterns, a shishi-odoshi that clacks by the water, and the changing hut by the way in.
const HALF = MAP_HALF.japanese_onsen;
const POOL = ONSEN_POOL;
const WATER_Y = -0.08;

function useOnsenMaterials() {
  const m = useMemo(() => {
    const make = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts });
    return {
      moss: make("#5c7a4a", { roughness: 1 }),
      stonePath: make("#8a8a84", { roughness: 1, flatShading: true }),
      rock: make("#6d6a66", { roughness: 1, flatShading: true }),
      rockWet: make("#4f4d4b", { roughness: 0.6 }),
      basin: make("#3b3a38", { roughness: 0.9 }),
      water: new THREE.MeshStandardMaterial({ color: "#7fc6c9", emissive: "#1c4a4d", roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.72, depthWrite: false }),
      steam: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.22, depthWrite: false }),
      bambooStalk: make("#9fbd5a", { roughness: 0.8 }),
      bambooLeaf: make("#5f9a4a", { roughness: 0.8 }),
      cherryWood: make("#4a3524", { roughness: 0.95 }),
      blossom: make("#f6b8cc", { roughness: 0.9 }),
      blossomDeep: make("#ec8fb0", { roughness: 0.9 }),
      petal: make("#fbd0de", { roughness: 1 }),
      tatami: make("#c9c08a", { roughness: 1 }),
      timber: make("#7a5a3a", { roughness: 0.9 }),
      roof: make("#3a4048", { roughness: 0.9 }),
      paper: make("#f6f0e2", { roughness: 1, emissive: "#ffe9c4", emissiveIntensity: 0.25 }),
      towel: make("#fbf8f0", { roughness: 1 }),
      lanternStone: make("#8f8b83", { roughness: 1, flatShading: true }),
      rope: make("#c9b07a", { roughness: 1 }),
      wellRoof: make("#5a3a24", { roughness: 0.9 }),
    };
  }, []);
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  return m;
}
type OnsenMats = ReturnType<typeof useOnsenMaterials>;

export function OnsenWorld({ mats }: { mats: Materials }) {
  const o = useOnsenMaterials();
  return (
    <>
      <Grounds mats={mats} o={o} />
      <HotSpring o={o} />
      <Bamboo o={o} />
      <CherryTrees o={o} />
      <TeaHouse mats={mats} o={o} />
      <WishingWell mats={mats} o={o} />
      <ShishiOdoshi o={o} />
      <ChangingHut mats={mats} o={o} />
      <Petals o={o} />
    </>
  );
}

function Grounds({ mats, o }: { mats: Materials; o: OnsenMats }) {
  const stones = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(17);
    const out: InstanceSpec[] = [];
    // the path from the way in to the steps, and a fork to the tea house and the well
    const path = (from: [number, number], to: [number, number]) => {
      const n = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.7);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        out.push({ p: [from[0] + (to[0] - from[0]) * t + (rand() - 0.5) * 0.2, 0.035, from[1] + (to[1] - from[1]) * t + (rand() - 0.5) * 0.2], s: [0.55 + rand() * 0.2, 0.06, 0.45 + rand() * 0.2], r: [0, rand() * 3, 0] });
      }
    };
    path([0, 11.2], [0, 4.2]);
    path([-1.0, 6.0], [-6.4, -3.2]);
    path([1.0, 6.0], [6.5, -3.8]);
    return out;
  }, []);
  const lanterns = [
    [-7.0, 5.6],
    [6.8, -0.8],
  ];
  return (
    <>
      <FloorPatch x0={-HALF + 0.3} x1={HALF - 0.3} z0={-HALF + 0.3} z1={HALF - 0.3} y={0.004} m={o.moss} />
      <Instanced geo={GEO.cylLow} m={o.stonePath} items={stones} recv />
      {/* stone lanterns (their glow is the "lantern" prop standing in each) */}
      {lanterns.map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <B p={[0, 0.15, 0]} s={[0.7, 0.3, 0.7]} m={o.lanternStone} cast />
          <Cyl p={[0, 0.55, 0]} s={[0.26, 0.5, 0.26]} m={o.lanternStone} />
          <B p={[0, 0.95, 0]} s={[0.56, 0.4, 0.56]} m={o.lanternStone} cast />
          <B p={[0, 1.24, 0]} s={[0.8, 0.12, 0.8]} m={o.lanternStone} />
          <Sph p={[0, 1.36, 0]} s={0.16} m={o.lanternStone} />
        </group>
      ))}
    </>
  );
}

/** The hot spring: the basin walls, the ledges under the seats, the water, the rim rocks, steam. */
function HotSpring({ o }: { o: OnsenMats }) {
  const w = POOL.x1 - POOL.x0;
  const d = POOL.z1 - POOL.z0;
  const cx = (POOL.x0 + POOL.x1) / 2;
  const cz = (POOL.z0 + POOL.z1) / 2;
  const ledge = CUSHIONS.onsenLedge;
  const rocks = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(23);
    const out: InstanceSpec[] = [];
    const ring = (x: number, z: number) => {
      const s = 0.55 + rand() * 0.35;
      out.push({ p: [x + (rand() - 0.5) * 0.2, s * 0.22, z + (rand() - 0.5) * 0.2], s: [s, s * 0.6, s * 0.8], r: [0, rand() * 3, 0] });
    };
    for (let x = POOL.x0 - 0.2; x <= POOL.x1 + 0.2; x += 0.62) {
      ring(x, POOL.z0 - 0.5);
      if (Math.abs(x) > 1.3) ring(x, POOL.z1 + 0.5); // the steps gap
    }
    for (let z = POOL.z0 - 0.2; z <= POOL.z1 + 0.2; z += 0.62) {
      ring(POOL.x0 - 0.5, z);
      ring(POOL.x1 + 0.5, z);
    }
    return out;
  }, []);
  const seats = MAP_CHAIRS.japanese_onsen.filter((c) => c.style === "onsen");
  const waterRef = useRef<THREE.Mesh>(null);
  const steamRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (waterRef.current) waterRef.current.position.y = WATER_Y + Math.sin(t * 0.8) * 0.008;
    const g = steamRef.current;
    if (g) {
      g.children.forEach((p, i) => {
        const u = (t * 0.12 + i / g.children.length) % 1;
        p.position.set(POOL.x0 + 0.6 + ((i * 1.37) % (w - 1.2)), WATER_Y + 0.1 + u * 1.3, POOL.z0 + 0.6 + ((i * 2.11) % (d - 1.2)) + Math.sin(t * 0.5 + i) * 0.2);
        p.scale.setScalar(0.25 + u * 0.55);
        (p as THREE.Mesh).material = o.steam;
      });
    }
  });
  return (
    <>
      {/* basin walls, just inside the cut in the ground */}
      <B p={[cx, -POOL.depth / 2, POOL.z0 + 0.04]} s={[w, POOL.depth, 0.08]} m={o.basin} />
      <B p={[cx, -POOL.depth / 2, POOL.z1 - 0.04]} s={[w, POOL.depth, 0.08]} m={o.basin} />
      <B p={[POOL.x0 + 0.04, -POOL.depth / 2, cz]} s={[0.08, POOL.depth, d]} m={o.basin} />
      <B p={[POOL.x1 - 0.04, -POOL.depth / 2, cz]} s={[0.08, POOL.depth, d]} m={o.basin} />
      {/* the steps down on the south side */}
      <B p={[0, -POOL.depth / 4, POOL.z1 + 0.45]} s={[2.2, POOL.depth / 2, 0.9]} m={o.rockWet} recv />
      {/* underwater stone ledges where the seats are */}
      {seats.map((s) => (
        <B key={s.propId} p={[s.x, -POOL.depth + ledge.y, s.z]} s={[1.1, ledge.h, 1.1]} m={o.rockWet} />
      ))}
      <group userData={noMerge}>
        <mesh ref={waterRef} geometry={GEO.plane} material={o.water} position={[cx, WATER_Y, cz]} rotation={[-Math.PI / 2, 0, 0]} scale={[w - 0.05, d - 0.05, 1]} renderOrder={1} raycast={noRaycast} />
        <group ref={steamRef}>
          {Array.from({ length: 10 }, (_, i) => (
            <mesh key={i} geometry={GEO.sphereLow} material={o.steam} raycast={noRaycast} />
          ))}
        </group>
      </group>
      <Instanced geo={GEO.sphereLow} m={o.rock} items={rocks} cast recv />
      {/* Mochi's flat rock on the east rim, and a bucket and ladle by the steps */}
      <B p={[3.9, 0.11, -1.4]} s={[0.9, 0.22, 0.9]} m={o.rock} cast />
      <Cyl p={[1.6, 0.14, 3.6]} s={[0.36, 0.28, 0.36]} m={o.timber} />
      <Cyl p={[1.75, 0.34, 3.5]} s={[0.03, 0.5, 0.03]} r={[0.3, 0, 0.6]} m={o.timber} />
    </>
  );
}

function Bamboo({ o }: { o: OnsenMats }) {
  const { stalks, leaves } = useMemo(() => {
    const rand = seeded(41);
    const stalks: InstanceSpec[] = [];
    const leaves: InstanceSpec[] = [];
    const clump = (x: number, z: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const px = x + (rand() - 0.5) * 2.4;
        const pz = z + (rand() - 0.5) * 2.4;
        const h = 3.2 + rand() * 1.6;
        stalks.push({ p: [px, h / 2, pz], s: [0.12, h, 0.12], r: [(rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.06] });
        for (let k = 0; k < 3; k++) leaves.push({ p: [px + (rand() - 0.5) * 0.6, h - 0.4 - k * 0.5, pz + (rand() - 0.5) * 0.6], s: [0.7, 0.08, 0.28], r: [0, rand() * 3, 0.3] });
      }
    };
    for (const [x, z] of [
      [-9.5, -10.5],
      [-6.5, -11],
      [-3, -11],
      [1, -11],
      [5, -11],
      [-11, -8],
      [-11, -4],
      [-11, 0],
      [9.5, -11],
      [11, 2],
      [11, 8],
    ])
      clump(x, z, 5 + Math.floor(rand() * 4));
    return { stalks, leaves };
  }, []);
  return (
    <>
      <Instanced geo={GEO.cylLow} m={o.bambooStalk} items={stalks} cast fadeRadius={1.0} />
      <Instanced geo={GEO.sphereLow} m={o.bambooLeaf} items={leaves} fadeRadius={1.0} />
    </>
  );
}

const CHERRIES: [number, number][] = [
  [-2.6, 7.0],
  [8.8, -8.8],
  [-10.0, 3.8],
];

function CherryTrees({ o }: { o: OnsenMats }) {
  return (
    <>
      {CHERRIES.map(([x, z], i) => (
        <Occluder key={i} x={x} z={z} halfWidth={2.0}>
          <group position={[x, 0, z]} rotation={[0, i * 1.7, 0]}>
            <Cyl p={[0, 1.1, 0]} s={[0.4, 2.2, 0.4]} m={o.cherryWood} cast />
            <Cyl p={[0.5, 2.2, 0.2]} s={[0.2, 1.2, 0.2]} r={[0, 0, -0.7]} m={o.cherryWood} />
            <Cyl p={[-0.4, 2.3, -0.2]} s={[0.18, 1.1, 0.18]} r={[0.3, 0, 0.6]} m={o.cherryWood} />
            <Sph p={[0, 3.1, 0]} s={[2.6, 1.7, 2.6]} m={o.blossom} cast />
            <Sph p={[1.0, 2.7, 0.4]} s={[1.6, 1.2, 1.6]} m={o.blossomDeep} cast />
            <Sph p={[-0.9, 2.8, -0.5]} s={[1.5, 1.1, 1.5]} m={o.blossom} cast />
            <Sph p={[0.2, 3.7, -0.3]} s={[1.3, 0.9, 1.3]} m={o.blossomDeep} />
          </group>
        </Occluder>
      ))}
    </>
  );
}

/** The tea house: a raised veranda on posts with a hipped roof (an occluder), tatami inside. */
function TeaHouse({ mats, o }: { mats: Materials; o: OnsenMats }) {
  return (
    <group position={[-7.3, 0, -7.1]}>
      <B p={[0, 0.15, 0]} s={[3.8, 0.3, 3.8]} m={o.timber} cast recv />
      <B p={[0, 0.305, 0]} s={[3.4, 0.01, 3.4]} m={o.tatami} />
      <B p={[0, 0.15, 2.4]} s={[3.8, 0.3, 1.0]} m={o.timber} recv />
      {/* back and side walls are sliding paper screens */}
      <B p={[0, 1.4, -1.85]} s={[3.8, 2.2, 0.08]} m={o.paper} />
      <B p={[-1.85, 1.4, 0]} s={[0.08, 2.2, 3.8]} m={o.paper} />
      {[-1.8, 1.8].map((x) => (
        <Cyl key={x} p={[x, 1.4, 1.8]} s={[0.16, 2.2, 0.16]} m={o.timber} cast />
      ))}
      {[-0.6, 0.6].map((x) => (
        <B key={x} p={[x, 1.4, -1.8]} s={[0.06, 2.2, 0.06]} m={o.timber} />
      ))}
      <Occluder x={-7.3} z={-7.1} halfWidth={2.4}>
        <mesh geometry={GEO.pyramid} material={o.roof} position={[0, 3.0, 0]} rotation={[0, Math.PI / 4, 0]} scale={[6.2, 1.2, 6.2]} castShadow raycast={noRaycast} />
        <B p={[0, 2.5, 0]} s={[4.4, 0.16, 4.4]} m={o.timber} />
      </Occluder>
      {/* the low table (the "teahouse" prop's tea set sits on it) and a hanging scroll */}
      <B p={[0, 0.55, 0.5]} s={[1.4, 0.06, 0.8]} m={mats.walnut} cast />
      <B p={[0, 1.5, -1.79]} s={[0.5, 0.9, 0.02]} m={mats.cream} />
      <B p={[0, 1.5, -1.775]} s={[0.36, 0.7, 0.01]} m={o.blossomDeep} />
    </group>
  );
}

/** The wishing well: a stone ring, a little roof, the rope and bucket. The "well" prop stands in it. */
function WishingWell({ mats, o }: { mats: Materials; o: OnsenMats }) {
  return (
    <group position={[6.5, 0, -5.7]}>
      <Cyl p={[0, 0.4, 0]} s={[1.5, 0.8, 1.5]} m={o.lanternStone} cast recv />
      <Cyl p={[0, 0.81, 0]} s={[1.2, 0.02, 1.2]} m={mats.water} />
      <mesh geometry={GEO.torus} material={o.rock} position={[0, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.44, 1.44, 1.0]} raycast={noRaycast} />
      {[-0.6, 0.6].map((x) => (
        <Cyl key={x} p={[x, 1.4, 0]} s={[0.12, 1.4, 0.12]} m={o.timber} cast />
      ))}
      <Cyl p={[0, 1.95, 0]} s={[0.08, 0.08, 1.3]} r={[Math.PI / 2, 0, Math.PI / 2]} m={o.timber} />
      <Cyl p={[0, 1.6, 0]} s={[0.02, 0.6, 0.02]} m={o.rope} />
      <Cyl p={[0, 1.25, 0]} s={[0.3, 0.26, 0.3]} m={o.timber} />
      <Occluder x={6.5} z={-5.7} halfWidth={1.2}>
        <mesh geometry={GEO.pyramid} material={o.wellRoof} position={[0, 2.35, 0]} rotation={[0, Math.PI / 4, 0]} scale={[2.6, 0.7, 2.6]} castShadow raycast={noRaycast} />
      </Occluder>
    </group>
  );
}

/** The bamboo water spout: fills, tips and clacks against its stone every few seconds. */
function ShishiOdoshi({ o }: { o: OnsenMats }) {
  const tubeRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = tubeRef.current;
    if (!g) return;
    const cycle = clock.elapsedTime % 6;
    // slowly fills (tilts down at the mouth), tips over quickly, clacks back
    const tilt = cycle < 4.6 ? -0.05 - (cycle / 4.6) * 0.25 : cycle < 5.0 ? 0.55 - (cycle - 4.6) * 1.5 : -0.05;
    g.rotation.z = tilt;
  });
  return (
    <group position={[-6.0, 0, 0.5]}>
      <B p={[0, 0.16, 0]} s={[1.0, 0.32, 0.8]} m={o.rock} cast />
      <Cyl p={[0, 0.34, 0]} s={[0.6, 0.06, 0.5]} m={o.water} />
      <Cyl p={[-0.3, 0.55, 0]} s={[0.06, 0.5, 0.06]} m={o.bambooStalk} />
      <Cyl p={[0.3, 0.55, 0]} s={[0.06, 0.5, 0.06]} m={o.bambooStalk} />
      <group ref={tubeRef} position={[0, 0.78, 0]} userData={noMerge}>
        <mesh geometry={GEO.cyl} material={o.bambooStalk} position={[0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 1.0, 0.1]} raycast={noRaycast} />
      </group>
      <Cyl p={[-0.2, 1.4, -0.3]} s={[0.05, 1.3, 0.05]} r={[0.2, 0, 0.1]} m={o.bambooStalk} />
      <Cyl p={[-0.1, 1.9, -0.15]} s={[0.05, 0.6, 0.05]} r={[Math.PI / 2 - 0.3, 0, 0]} m={o.bambooStalk} />
    </group>
  );
}

function ChangingHut({ mats, o }: { mats: Materials; o: OnsenMats }) {
  return (
    <group position={[8.2, 0, 5.9]}>
      <B p={[0, 1.2, 0]} s={[2.6, 2.4, 2.8]} m={o.timber} cast recv />
      <B p={[-1.31, 1.1, 0.4]} s={[0.02, 1.8, 0.8]} m={o.paper} />
      <B p={[-1.32, 1.1, -0.5]} s={[0.02, 1.8, 0.8]} m={mats.navy} />
      <mesh geometry={GEO.pyramid} material={o.roof} position={[0, 2.85, 0]} rotation={[0, Math.PI / 4, 0]} scale={[4.2, 0.9, 4.4]} castShadow raycast={noRaycast} />
      {/* a rack of folded towels and wooden sandals by the door */}
      <B p={[-1.7, 0.5, 1.6]} s={[0.6, 1.0, 0.5]} m={mats.oak} cast />
      {[0.3, 0.55, 0.8].map((y) => (
        <B key={y} p={[-1.7, y + 0.2, 1.6]} s={[0.5, 0.14, 0.4]} m={o.towel} />
      ))}
      {[-2.3, -2.6].map((x) => (
        <B key={x} p={[x, 0.03, 1.4]} s={[0.16, 0.06, 0.34]} m={o.timber} />
      ))}
    </group>
  );
}

/** Cherry petals drifting down over the garden, one instanced mesh moved every frame. */
const PETAL_COUNT = 40;
function Petals({ o }: { o: OnsenMats }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => {
    const rand = seeded(88);
    return Array.from({ length: PETAL_COUNT }, () => {
      const tree = CHERRIES[Math.floor(rand() * CHERRIES.length)];
      return { x: tree[0] + (rand() - 0.5) * 4, z: tree[1] + (rand() - 0.5) * 4, phase: rand() * 9, speed: 0.12 + rand() * 0.1, drift: rand() * 2 };
    });
  }, []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const u = (t * s.speed + s.phase) % 1;
      tmp.position.set(s.x + Math.sin(t * 0.9 + s.drift) * 0.5, 3.6 - u * 3.5, s.z + Math.cos(t * 0.7 + s.drift) * 0.4);
      tmp.rotation.set(t * 2 + i, t * 1.5, 0);
      tmp.scale.set(0.12, 0.02, 0.09);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[GEO.box, o.petal, PETAL_COUNT]} frustumCulled={false} raycast={noRaycast} userData={{ noMerge: true }} />;
}
