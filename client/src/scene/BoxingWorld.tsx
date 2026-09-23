import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BOXING_RING, MAP_HALF } from "@shared/types";
import { CUSHIONS } from "@shared/seats";
import { B, Cone, Cyl, FloorPatch, GEO, Instanced, Sph, noMerge, noRaycast, type InstanceSpec, type Materials } from "./kit";
import { Occluder } from "./Occluder";

// A 24x24 boxing gym: the ring in the middle on its own platform (walkY lifts you onto it up
// the south steps), bleachers north and west, a drink rail east, the bell podium and buckets
// in one corner, towels and water in another, and the doors on the south side where everyone
// arrives. The stools and bleacher benches are seats; Mochi sits on the turnbuckle.
const HALF = MAP_HALF.boxing_ring;
const WALL_H = 4.2;
const WALL_T = 0.2;
const RING = BOXING_RING;

function useGymMaterials() {
  const m = useMemo(() => {
    const make = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
    return {
      canvas: make("#efe6d6", { roughness: 0.95 }),
      apron: make("#b3202e", { roughness: 0.8 }),
      apronTrim: make("#1d1d24"),
      ropeRed: make("#d63a48", { roughness: 0.6 }),
      ropeWhite: make("#f4efe6", { roughness: 0.6 }),
      ropeBlue: make("#3a63c9", { roughness: 0.6 }),
      padRed: make("#c9303e", { roughness: 0.7 }),
      padBlue: make("#3457b8", { roughness: 0.7 }),
      bleacher: make("#c98f4f", { roughness: 0.8 }),
      riser: make("#4a3524", { roughness: 0.9 }),
      steel: make("#8c9098", { roughness: 0.4, metalness: 0.6 }),
      truss: make("#2b2b30", { roughness: 0.6, metalness: 0.3 }),
      concrete: make("#6c6862", { roughness: 1 }),
      wainscot: make("#3d4350", { roughness: 0.8 }),
      poster: make("#e8c250", { roughness: 0.9 }),
      bag: make("#4a2f1d", { roughness: 0.7 }),
      spot: new THREE.MeshBasicMaterial({ color: "#fff2c8", toneMapped: false }),
      pool: new THREE.MeshBasicMaterial({ color: "#ffe9b8", transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      cone: new THREE.MeshBasicMaterial({ color: "#fff0c4", transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
    };
  }, []);
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  return m;
}
type GymMats = ReturnType<typeof useGymMaterials>;

export function BoxingWorld({ mats, wallColor }: { mats: Materials; wallColor: string }) {
  const g = useGymMaterials();
  return (
    <>
      <Shell mats={mats} g={g} wallColor={wallColor} />
      <Ring mats={mats} g={g} />
      <Bleachers g={g} />
      <DrinkRail mats={mats} g={g} />
      <Corners mats={mats} g={g} />
      <Rig g={g} />
    </>
  );
}

function Shell({ mats, g, wallColor }: { mats: Materials; g: GymMats; wallColor: string }) {
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 }), [wallColor]);
  useEffect(() => () => wallMat.dispose(), [wallMat]);
  const windows = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (const x of [-8, -4, 0, 4, 8]) out.push({ p: [x, 3.1, -HALF + WALL_T + 0.02], s: [1.6, 0.9, 0.04] });
    for (const z of [-8, -4, 0, 4, 8]) out.push({ p: [-HALF + WALL_T + 0.02, 3.1, z], s: [0.04, 0.9, 1.6] });
    return out;
  }, []);
  return (
    <>
      <B p={[0, WALL_H / 2, -HALF + WALL_T / 2]} s={[HALF * 2, WALL_H, WALL_T]} m={wallMat} cast recv />
      <B p={[-HALF + WALL_T / 2, WALL_H / 2, 0]} s={[WALL_T, WALL_H, HALF * 2]} m={wallMat} cast recv />
      <B p={[0, 0.7, -HALF + WALL_T + 0.02]} s={[HALF * 2, 1.4, 0.04]} m={g.wainscot} />
      <B p={[-HALF + WALL_T + 0.02, 0.7, 0]} s={[0.04, 1.4, HALF * 2]} m={g.wainscot} />
      {/* frosted high windows let a wash of daylight in */}
      <Instanced geo={GEO.box} m={mats.warmGlow} items={windows} />
      {/* a couple of fight posters and the club banner */}
      <B p={[-HALF + WALL_T + 0.03, 2.1, -4.0]} s={[0.04, 1.1, 0.8]} m={g.poster} />
      <B p={[-HALF + WALL_T + 0.03, 2.1, 3.0]} s={[0.04, 1.1, 0.8]} m={g.apron} />
      <B p={[2.0, 2.2, -HALF + WALL_T + 0.03]} s={[3.2, 0.9, 0.04]} m={g.apronTrim} />
      <B p={[2.0, 2.2, -HALF + WALL_T + 0.06]} s={[2.9, 0.6, 0.02]} m={g.poster} />
      {/* a rubber mat round the ring, and the spectator floor's painted lines */}
      <FloorPatch x0={-5.6} x1={5.6} z0={-5.6} z1={5.6} y={0.006} m={g.wainscot} />
      <FloorPatch x0={-5.4} x1={5.4} z0={-5.4} z1={5.4} y={0.009} m={g.concrete} />
      <FloorPatch x0={-2.2} x1={2.2} z0={6.2} z1={11.4} y={0.008} m={g.apron} />
      <FloorPatch x0={-2.0} x1={2.0} z0={6.4} z1={11.2} y={0.011} m={g.apronTrim} />
      {/* the double doors people come in through */}
      <group position={[0, 0, HALF - 0.4]}>
        <B p={[-1.0, 1.4, 0]} s={[1.9, 2.8, 0.1]} m={g.wainscot} />
        <B p={[1.0, 1.4, 0]} s={[1.9, 2.8, 0.1]} m={g.wainscot} />
        <B p={[0, 2.95, 0]} s={[4.4, 0.3, 0.3]} m={g.apronTrim} />
        <B p={[0, 2.95, 0.16]} s={[2.4, 0.2, 0.02]} m={mats.bulb} />
        {[-1.0, 1.0].map((x) => (
          <B key={x} p={[x, 1.7, 0.06]} s={[0.5, 0.5, 0.02]} m={mats.glass} />
        ))}
      </group>
    </>
  );
}

/** The ring: platform, apron skirt, corner posts with pads, three rope tiers, the steps. */
function Ring({ mats, g }: { mats: Materials; g: GymMats }) {
  const w = RING.half * 2;
  const ropes = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (const tier of [0.45, 0.85, 1.25]) {
      out.push({ p: [0, RING.height + tier, -RING.half], s: [w, 0.06, 0.06] });
      out.push({ p: [0, RING.height + tier, RING.half], s: [w, 0.06, 0.06] });
      out.push({ p: [-RING.half, RING.height + tier, 0], s: [0.06, 0.06, w] });
      out.push({ p: [RING.half, RING.height + tier, 0], s: [0.06, 0.06, w] });
    }
    return out;
  }, [w]);
  return (
    <group position={[RING.x, 0, RING.z]}>
      <B p={[0, RING.height / 2, 0]} s={[w + 0.6, RING.height, w + 0.6]} m={g.apron} cast recv />
      <B p={[0, RING.height + 0.01, 0]} s={[w + 0.5, 0.02, w + 0.5]} m={g.canvas} recv />
      <B p={[0, RING.height - 0.05, 0]} s={[w + 0.62, 0.06, w + 0.62]} m={g.apronTrim} />
      {/* the corner posts, red and blue corners, with turnbuckle pads */}
      {[
        [-1, -1, g.padRed],
        [1, 1, g.padRed],
        [-1, 1, g.padBlue],
        [1, -1, g.padBlue],
      ].map(([sx, sz, pad], i) => (
        <group key={i} position={[(sx as number) * RING.half, RING.height, (sz as number) * RING.half]}>
          <Cyl p={[0, 0.8, 0]} s={[0.14, 1.6, 0.14]} m={g.steel} cast />
          <Cyl p={[0, 0.85, 0]} s={[0.3, 1.0, 0.3]} m={pad as THREE.Material} cast />
          <Sph p={[0, 1.6, 0]} s={0.22} m={pad as THREE.Material} />
        </group>
      ))}
      <Instanced geo={GEO.box} m={g.ropeRed} items={ropes.filter((_, i) => i < 4)} />
      <Instanced geo={GEO.box} m={g.ropeWhite} items={ropes.filter((_, i) => i >= 4 && i < 8)} />
      <Instanced geo={GEO.box} m={g.ropeBlue} items={ropes.filter((_, i) => i >= 8)} />
      {/* the steps on the south side, and the ring bell */}
      <B p={[0, 0.16, RING.half + 0.55]} s={[1.5, 0.32, 0.5]} m={g.riser} recv />
      <B p={[0, 0.36, RING.half + 0.3]} s={[1.5, 0.12, 0.3]} m={g.riser} recv />
      <Cyl p={[RING.half + 0.5, 0.55, -RING.half - 0.5]} s={[0.3, 1.1, 0.3]} m={g.steel} />
      <Sph p={[RING.half + 0.5, 1.2, -RING.half - 0.5]} s={[0.26, 0.24, 0.26]} m={mats.brass} />
      {/* the light pools the spotlights leave on the canvas */}
      <mesh geometry={GEO.cyl} material={g.pool} position={[0, RING.height + 0.03, 0]} scale={[w + 0.2, 0.01, w + 0.2]} raycast={noRaycast} />
    </group>
  );
}

/** Three tiers of benches on risers, north and west, facing the ring. The benches are seats. */
function Bleachers({ g }: { g: GymMats }) {
  const tiers = ["bleacherLow", "bleacherMid", "bleacherHigh"] as const;
  return (
    <>
      {tiers.map((id, tier) => {
        const c = CUSHIONS[id];
        const depth = -7.2 - tier * 1.1;
        return (
          <group key={id}>
            {/* north bank */}
            <B p={[0, c.y, depth]} s={[9.6, c.h, 0.9]} m={g.bleacher} cast recv />
            <B p={[0, c.y / 2 - 0.05, depth - 0.3]} s={[9.6, c.y - 0.05, 0.5]} m={g.riser} />
            {/* west bank */}
            <B p={[depth, c.y, 0]} s={[0.9, c.h, 9.6]} m={g.bleacher} cast recv />
            <B p={[depth - 0.3, c.y / 2 - 0.05, 0]} s={[0.5, c.y - 0.05, 9.6]} m={g.riser} />
          </group>
        );
      })}
      {/* the backs of the top tiers, up against the walls */}
      <B p={[0, 1.4, -9.7]} s={[9.6, 0.6, 0.1]} m={g.riser} />
      <B p={[-9.7, 1.4, 0]} s={[0.1, 0.6, 9.6]} m={g.riser} />
    </>
  );
}

function DrinkRail({ mats, g }: { mats: Materials; g: GymMats }) {
  return (
    <>
      <B p={[8.0, 1.05, 0]} s={[0.6, 0.1, 8.8]} m={mats.walnut} cast recv />
      <B p={[8.0, 0.5, 0]} s={[0.4, 1.0, 8.8]} m={g.wainscot} cast />
      <B p={[8.0, 0.02, 0]} s={[0.7, 0.04, 8.8]} m={mats.brass} />
      {[-3.6, -1.2, 1.2, 3.6].map((z) => (
        <group key={z}>
          <Cyl p={[8.0, 1.22, z]} s={[0.16, 0.24, 0.16]} m={mats.glass} />
          <Cyl p={[8.0, 1.18, z]} s={[0.13, 0.14, 0.13]} m={z < 0 ? mats.mustard : mats.coral} />
        </group>
      ))}
      <Cyl p={[8.0, 1.3, -4.0]} s={[0.4, 0.5, 0.4]} m={g.steel} />
    </>
  );
}

function Corners({ mats, g }: { mats: Materials; g: GymMats }) {
  return (
    <>
      {/* the bell podium corner: stools, buckets, a stack of towels */}
      <group position={[8.3, 0, -8.4]}>
        <B p={[0, 0.35, 0]} s={[1.6, 0.7, 1.6]} m={g.wainscot} cast recv />
        <Cyl p={[-0.4, 0.9, -0.3]} s={[0.36, 0.4, 0.36]} m={g.steel} />
        <Cyl p={[0.4, 0.9, 0.2]} s={[0.36, 0.4, 0.36]} m={g.padRed} />
        <B p={[0, 0.86, 0.5]} s={[0.5, 0.3, 0.3]} m={mats.white} />
      </group>
      {/* the towel and water station, with a heavy bag hanging beside it */}
      <group position={[-8.4, 0, 8.5]}>
        <B p={[0, 0.45, 0]} s={[2.0, 0.9, 1.6]} m={mats.oak} cast recv />
        <B p={[-0.5, 1.0, -0.3]} s={[0.5, 0.2, 0.4]} m={mats.white} />
        <B p={[-0.5, 1.2, -0.3]} s={[0.46, 0.2, 0.36]} m={mats.blush} />
        <Cyl p={[0.5, 1.1, 0.2]} s={[0.4, 0.4, 0.4]} m={mats.seaShallow} />
        <Cyl p={[1.6, 3.6, -0.6]} s={[0.05, 1.6, 0.05]} m={g.steel} />
        <Cyl p={[1.6, 1.9, -0.6]} s={[0.7, 1.8, 0.7]} m={g.bag} cast />
      </group>
      {/* the trainer's desk by the doors */}
      <group position={[4.2, 0, 8.7]}>
        <B p={[0, 0.72, 0]} s={[1.5, 0.08, 0.8]} m={mats.oak} cast recv />
        {[-0.6, 0.6].map((x) => (
          <B key={x} p={[x, 0.34, 0]} s={[0.08, 0.68, 0.7]} m={g.wainscot} />
        ))}
        <B p={[-0.3, 0.8, 0.1]} s={[0.5, 0.06, 0.36]} m={mats.cream} />
        <Cyl p={[0.4, 0.86, -0.1]} s={[0.14, 0.2, 0.14]} m={mats.white} />
      </group>
    </>
  );
}

/** The lighting rig over the ring: a truss square and four spotlights with soft beams. */
function Rig({ g }: { g: GymMats }) {
  const beamsRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const b = beamsRef.current;
    if (!b) return;
    const t = clock.elapsedTime;
    b.children.forEach((c, i) => {
      (c as THREE.Mesh).scale.setScalar(1 + Math.sin(t * 1.2 + i) * 0.03);
    });
  });
  const y = 5.4;
  const r = RING.half + 0.4;
  return (
    <Occluder x={0} z={0} halfWidth={5}>
      <B p={[0, y, -r]} s={[r * 2 + 0.4, 0.16, 0.16]} m={g.truss} />
      <B p={[0, y, r]} s={[r * 2 + 0.4, 0.16, 0.16]} m={g.truss} />
      <B p={[-r, y, 0]} s={[0.16, 0.16, r * 2 + 0.4]} m={g.truss} />
      <B p={[r, y, 0]} s={[0.16, 0.16, r * 2 + 0.4]} m={g.truss} />
      {[
        [-r, -r],
        [r, -r],
        [-r, r],
        [r, r],
      ].map(([x, z], i) => (
        <group key={i} position={[x, y, z]}>
          <Cone p={[0, -0.35, 0]} s={[0.5, 0.5, 0.5]} r={[Math.PI, 0, 0]} m={g.truss} />
          <mesh geometry={GEO.sphereLow} material={g.spot} position={[0, -0.6, 0]} scale={0.18} raycast={noRaycast} />
        </group>
      ))}
      <group ref={beamsRef} userData={noMerge}>
        {[
          [-r, -r],
          [r, -r],
          [-r, r],
          [r, r],
        ].map(([x, z], i) => (
          <mesh key={i} geometry={GEO.cone} material={g.cone} position={[x * 0.55, (y - 0.6 + RING.height) / 2, z * 0.55]} scale={[2.6, y - 0.6 - RING.height, 2.6]} rotation={[Math.PI, 0, 0]} raycast={noRaycast} />
        ))}
      </group>
    </Occluder>
  );
}
