import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cyl, GEO, HALF, Instanced, Sph, noRaycast, seeded, type InstanceSpec, type Materials } from "./kit";

// An 18x18 forest clearing. The six log benches and the lantern flames are interactive props
// rendered elsewhere (ChairProp / ToggleableProp); this file draws everything static around
// them. Coordinates match shared/collision.ts and shared/props.ts.

const EDGE = HALF - 0.2;
/** Matches FOREST_RADIUS in shared/collision.ts: past this you are in the trees. */
const TREELINE = 7.2;

const TENTS: { x: number; z: number; color: string }[] = [
  { x: -5.7, z: -5.3, color: "#d97a4a" },
  { x: 5.7, z: -5.5, color: "#4a8ad9" },
  { x: -6.5, z: 2.1, color: "#5fa86a" },
];

/** Keep procedural scatter off the paths, the tents and the seating ring. */
function isClearZone(x: number, z: number, margin = 0): boolean {
  if (Math.abs(x) < 2.4 + margin && z > 4.2) return true; // stone trail + spawn
  if (Math.hypot(x, z) < 4.4 + margin) return true; // fire, log ring and their approach points
  if (TENTS.some((t) => Math.hypot(x - t.x, z - t.z) < 2.0 + margin)) return true;
  if (Math.hypot(x - 5.1, z - 3.2) < 1.8 + margin) return true; // stargazing blanket + telescope
  if (Math.hypot(x - 4.0, z + 2.0) < 0.9 || Math.hypot(x + 4.0, z - 2.0) < 0.9) return true; // lantern stumps
  return false;
}

export function CampfireWorld({ mats }: { mats: Materials }) {
  return (
    <>
      <FirePit mats={mats} />
      <Forest mats={mats} />
      <GroundCover mats={mats} />
      <StoneTrail mats={mats} />
      {TENTS.map((t) => (
        <Tent key={`${t.x}:${t.z}`} {...t} mats={mats} />
      ))}
      <CampProps mats={mats} />
      <StargazingSpot mats={mats} />
      <Fireflies mats={mats} />
    </>
  );
}

function FirePit({ mats }: { mats: Materials }) {
  // The flames, embers and firelight are the "campfire" prop; this is just stone and wood.
  const stones = useMemo<InstanceSpec[]>(
    () =>
      Array.from({ length: 13 }, (_, i) => {
        const a = (i / 13) * Math.PI * 2;
        return { p: [Math.cos(a) * 0.72, 0.09, Math.sin(a) * 0.72], s: [0.3, 0.2, 0.26], r: [0, a, 0] };
      }),
    []
  );
  return (
    <>
      <Instanced geo={GEO.sphereLow} m={mats.stone} items={stones} recv />
      <Cyl p={[0, 0.005, 0]} s={[1.3, 0.01, 1.3]} m={mats.dirt} />
      {[0.5, -0.5, 1.6].map((r) => (
        <Cyl key={r} p={[0, 0.1, 0]} s={[0.12, 0.8, 0.12]} r={[0, r, Math.PI / 2.4]} m={mats.darkWood} cast />
      ))}
    </>
  );
}

// ~130 pines as instanced meshes: 3 draw calls for the backdrop band, 3 more for the nearer
// trees that actually cast shadows (their shadows are the only ones anyone can see).
function Forest({ mats }: { mats: Materials }) {
  const { trunks, lower, upper, nearTrunks, nearLower, nearUpper, boulders } = useMemo(() => {
    const rand = seeded(2024);
    const trunks: InstanceSpec[] = [];
    const lower: InstanceSpec[] = [];
    const upper: InstanceSpec[] = [];
    const nearTrunks: InstanceSpec[] = [];
    const nearLower: InstanceSpec[] = [];
    const nearUpper: InstanceSpec[] = [];
    const boulders: InstanceSpec[] = [];
    const SHADOW_RADIUS = 8.2;

    const addPine = (x: number, z: number, scale: number) => {
      const rot = rand() * Math.PI;
      const near = Math.hypot(x, z) < SHADOW_RADIUS;
      (near ? nearTrunks : trunks).push({ p: [x, 0.45 * scale, z], s: [0.26 * scale, 0.9 * scale, 0.26 * scale], r: [0, rot, 0] });
      (near ? nearLower : lower).push({ p: [x, 1.3 * scale, z], s: [1.25 * scale, 1.3 * scale, 1.25 * scale], r: [0, rot, 0] });
      (near ? nearUpper : upper).push({ p: [x, 2.05 * scale, z], s: [0.9 * scale, 1.05 * scale, 0.9 * scale], r: [0, rot + 0.4, 0] });
    };

    // Dense band from the treeline outward on a jittered grid, thinning toward the clearing.
    const step = 1.15;
    for (let gx = -EDGE; gx <= EDGE; gx += step) {
      for (let gz = -EDGE; gz <= EDGE; gz += step) {
        const x = THREE.MathUtils.clamp(gx + (rand() - 0.5) * step * 0.8, -EDGE, EDGE);
        const z = THREE.MathUtils.clamp(gz + (rand() - 0.5) * step * 0.8, -EDGE, EDGE);
        const r = Math.hypot(x, z);
        if (isClearZone(x, z)) continue;
        if (r > TREELINE) {
          addPine(x, z, 0.8 + rand() * 0.7);
        } else if (r > 5.6 && rand() < 0.25) {
          addPine(x, z, 0.5 + rand() * 0.35); // saplings creeping in toward the clearing
        } else if (r > 4.8 && rand() < 0.1) {
          boulders.push({ p: [x, 0.16, z], s: [0.6 + rand() * 0.4, 0.4 + rand() * 0.25, 0.55 + rand() * 0.4], r: [0, rand() * 3, 0] });
        }
      }
    }
    return { trunks, lower, upper, nearTrunks, nearLower, nearUpper, boulders };
  }, []);

  return (
    <>
      <Instanced geo={GEO.cylLow} m={mats.bark} items={trunks} />
      <Instanced geo={GEO.coneLow} m={mats.pine} items={lower} />
      <Instanced geo={GEO.coneLow} m={mats.pineLight} items={upper} />
      <Instanced geo={GEO.cylLow} m={mats.bark} items={nearTrunks} cast />
      <Instanced geo={GEO.coneLow} m={mats.pine} items={nearLower} cast />
      <Instanced geo={GEO.coneLow} m={mats.pineLight} items={nearUpper} cast />
      <Instanced geo={GEO.sphereLow} m={mats.stone} items={boulders} recv />
    </>
  );
}

function GroundCover({ mats }: { mats: Materials }) {
  const { bushes, blooms, tufts, caps, stems } = useMemo(() => {
    const rand = seeded(77);
    const bushes: InstanceSpec[] = [];
    const blooms: InstanceSpec[] = [];
    const tufts: InstanceSpec[] = [];
    const caps: InstanceSpec[] = [];
    const stems: InstanceSpec[] = [];
    const bloomColors = ["#f2e6c9", "#e0a93b", "#c98fd6", "#f09aa8"];

    const addFlowerClump = (x: number, z: number) => {
      const s = 0.7 + rand() * 0.5;
      bushes.push({ p: [x, 0.09 * s, z], s: [0.36 * s, 0.22 * s, 0.36 * s] });
      const color = bloomColors[Math.floor(rand() * bloomColors.length)];
      for (let k = 0; k < 3; k++) {
        const a = rand() * Math.PI * 2;
        blooms.push({ p: [x + Math.cos(a) * 0.1 * s, 0.2 * s, z + Math.sin(a) * 0.1 * s], s: [0.07, 0.07, 0.07], color });
      }
    };

    for (let i = 0; i < 320; i++) {
      const x = (rand() * 2 - 1) * 8.2;
      const z = (rand() * 2 - 1) * 8.2;
      if (isClearZone(x, z, -0.5)) continue;
      const roll = rand();
      if (roll < 0.2) addFlowerClump(x, z);
      else if (roll < 0.72) tufts.push({ p: [x, 0.1, z], s: [0.1, 0.22 + rand() * 0.12, 0.1], r: [0, rand() * 3, (rand() - 0.5) * 0.3] });
    }

    // A couple of mushroom rings tucked against the treeline.
    for (const [cx, cz] of [
      [-6.4, -2.6],
      [3.0, -6.6],
    ]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + rand();
        const x = cx + Math.cos(a) * 0.4;
        const z = cz + Math.sin(a) * 0.4;
        const s = 0.7 + rand() * 0.5;
        stems.push({ p: [x, 0.07 * s, z], s: [0.05 * s, 0.14 * s, 0.05 * s] });
        caps.push({ p: [x, 0.15 * s, z], s: [0.17 * s, 0.09 * s, 0.17 * s] });
      }
    }
    return { bushes, blooms, tufts, caps, stems };
  }, []);

  return (
    <>
      <Instanced geo={GEO.sphereLow} m={mats.pineLight} items={bushes} />
      <Instanced geo={GEO.sphereLow} m={mats.tintable} items={blooms} />
      <Instanced geo={GEO.coneLow} m={mats.leaf} items={tufts} />
      <Instanced geo={GEO.cylLow} m={mats.cream} items={stems} />
      <Instanced geo={GEO.sphereLow} m={mats.mushroom} items={caps} />
    </>
  );
}

function StoneTrail({ mats }: { mats: Materials }) {
  const stones = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(9);
    const out: InstanceSpec[] = [];
    for (let z = 8.2; z > 3.4; z -= 0.6) {
      const x = Math.sin(z * 0.8) * 0.32;
      const s = 0.45 + rand() * 0.15;
      out.push({ p: [x, 0.04, z], s: [s, 0.05, s * 0.8], r: [0, rand() * 3, 0] });
    }
    return out;
  }, []);
  return <Instanced geo={GEO.cylLow} m={mats.stone} items={stones} recv />;
}

function Tent({ x, z, color, mats }: { x: number; z: number; color: string; mats: Materials }) {
  const canvas = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), [color]);
  // Door faces the fire.
  const rotY = Math.atan2(-x, -z);
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.pyramid} material={canvas} position={[0, 0.75, 0]} rotation={[0, Math.PI / 4, 0]} scale={[2.1, 1.5, 2.1]} castShadow receiveShadow raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={mats.black} position={[0, 0.42, 0.76]} scale={[0.55, 0.8, 1]} raycast={noRaycast} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Cyl p={[side * 0.95, 0.5, 0.88]} s={[0.02, 1.1, 0.02]} r={[0.55, 0, side * -0.55]} m={mats.cream} />
          <Cyl p={[side * 1.28, 0.05, 1.2]} s={[0.05, 0.1, 0.05]} m={mats.metal} />
        </group>
      ))}
    </group>
  );
}

function CampProps({ mats }: { mats: Materials }) {
  return (
    <>
      {/* lantern stumps (the lanterns themselves are toggleable props) */}
      {[
        [4.0, -2.0],
        [-4.0, 2.0],
      ].map(([x, z]) => (
        <group key={x}>
          <Cyl p={[x, 0.2, z]} s={[0.62, 0.4, 0.62]} m={mats.bark} cast recv />
          <Cyl p={[x, 0.405, z]} s={[0.58, 0.01, 0.58]} m={mats.oak} />
        </group>
      ))}

      {/* firewood stack */}
      <group position={[-2.8, 0, -4.1]} rotation={[0, 0.5, 0]}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const row = i < 3 ? 0 : i < 5 ? 1 : 2;
          const col = i < 3 ? i : i < 5 ? i - 3 : 0;
          return (
            <Cyl key={i} p={[0, 0.12 + row * 0.21, (col - (2 - row) / 2) * 0.24]} s={[0.22, 0.9, 0.22]} r={[0, 0, Math.PI / 2]} m={i % 2 ? mats.darkWood : mats.bark} cast />
          );
        })}
      </group>

      {/* backpack by tent 1, cooler by tent 3 */}
      <group position={[-4.5, 0, -4.4]} rotation={[0, 0.8, 0.15]}>
        <Sph p={[0, 0.32, 0]} s={[0.46, 0.64, 0.34]} m={mats.pine} cast />
        <B p={[0, 0.24, 0.17]} s={[0.26, 0.2, 0.08]} m={mats.bark} />
      </group>
      <group position={[-5.4, 0, 3.1]} rotation={[0, 0.4, 0]}>
        <B p={[0, 0.22, 0]} s={[0.7, 0.44, 0.45]} m={mats.navy} cast />
        <B p={[0, 0.46, 0]} s={[0.74, 0.06, 0.49]} m={mats.white} />
      </group>

      {/* acoustic guitar propped near the ring */}
      <group position={[-3.1, 0, -1.3]} rotation={[0.42, 1.2, 0.1]}>
        <Sph p={[0, 0.3, 0]} s={[0.48, 0.48, 0.16]} m={mats.oak} cast />
        <Sph p={[0, 0.52, 0]} s={[0.36, 0.36, 0.12]} m={mats.oak} cast />
        <B p={[0, 0.95, 0]} s={[0.09, 0.62, 0.05]} m={mats.darkWood} />
        <Cyl p={[0, 0.3, 0.085]} s={[0.12, 0.01, 0.12]} r={[Math.PI / 2, 0, 0]} m={mats.black} />
      </group>

      {/* marshmallow kit */}
      <group position={[1.5, 0, -3.3]}>
        <B p={[0, 0.14, 0]} s={[0.32, 0.28, 0.2]} m={mats.white} />
        <B p={[0, 0.2, 0.105]} s={[0.22, 0.1, 0.01]} m={mats.blush} />
        {[0, 1, 2].map((i) => (
          <Cyl key={i} p={[0.3 + i * 0.05, 0.02, 0.1]} s={[0.02, 0.9, 0.02]} r={[0, 0.2 * i, Math.PI / 2]} m={mats.oak} />
        ))}
      </group>
    </>
  );
}

function StargazingSpot({ mats }: { mats: Materials }) {
  return (
    <>
      {/* plaid picnic blanket — the "blanket_N" seats lie down here */}
      <B p={[5.1, 0.06, 3.2]} s={[2.2, 0.02, 1.7]} m={mats.rust} recv />
      {[-0.6, 0, 0.6].map((dx) => (
        <B key={`v${dx}`} p={[5.1 + dx, 0.075, 3.2]} s={[0.12, 0.01, 1.7]} m={mats.cream} />
      ))}
      {[-0.5, 0.3].map((dz) => (
        <B key={`h${dz}`} p={[5.1, 0.08, 3.2 + dz]} s={[2.2, 0.01, 0.12]} m={mats.mustard} />
      ))}
      {[4.7, 5.5].map((x) => (
        <Sph key={x} p={[x, 0.09, 2.6]} s={[0.52, 0.16, 0.32]} m={mats.cream} cast />
      ))}
      {/* telescope on a tripod, aimed up at the stars */}
      <group position={[6.5, 0, 2.9]}>
        {[0, 1, 2].map((i) => (
          <Cyl key={i} p={[Math.cos(i * 2.09) * 0.2, 0.5, Math.sin(i * 2.09) * 0.2]} s={[0.03, 1.05, 0.03]} r={[Math.sin(i * 2.09) * 0.35, 0, -Math.cos(i * 2.09) * 0.35]} m={mats.black} />
        ))}
        <Cyl p={[0, 1.1, -0.1]} s={[0.12, 0.9, 0.12]} r={[-0.9, 0.3, 0]} m={mats.brass} cast />
      </group>
    </>
  );
}

const FIREFLY_COUNT = 28;

// Slow-drifting fireflies with an independent blink phase each, as ONE instanced mesh updated
// per frame (28 matrix writes) instead of 28 separate draw calls.
function Fireflies({ mats }: { mats: Materials }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => {
    const rand = seeded(31);
    return Array.from({ length: FIREFLY_COUNT }, () => ({
      radius: 2.6 + rand() * 4.6,
      angle: rand() * Math.PI * 2,
      baseY: 0.45 + rand() * 1.4,
      drift: (0.04 + rand() * 0.07) * (rand() < 0.5 ? -1 : 1),
      bob: 0.5 + rand() * 0.9,
      phase: rand() * 10,
    }));
  }, []);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const a = s.angle + t * s.drift;
      tmp.position.set(Math.cos(a) * s.radius, s.baseY + Math.sin(t * s.bob + s.phase) * 0.25, Math.sin(a) * s.radius);
      // blink by shrinking to nothing rather than toggling visibility, so it fades in and out
      const blink = Math.max(0, Math.sin(t * 1.4 + s.phase));
      tmp.scale.setScalar(0.02 + blink * 0.07);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  // frustumCulled off: instances move every frame, so a stale bounding sphere would cull them.
  return <instancedMesh ref={ref} args={[GEO.sphereLow, mats.bulb, FIREFLY_COUNT]} frustumCulled={false} raycast={noRaycast} />;
}
