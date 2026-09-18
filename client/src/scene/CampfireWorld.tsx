import { useContext, useEffect, useMemo, useRef } from "react";
import { TimeOfDayContext } from "./timeOfDay";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cyl, GEO, HALF, Instanced, Sph, noMerge, noRaycast, seeded, type InstanceSpec, type Materials } from "./kit";

// A 20x20 forest clearing: an open grass camp with the tents pitched on the grass (not buried
// in the trees), a stream running across the front corner, and a stone trail that crosses it on
// a little wooden bridge. The six log benches and the lanterns are interactive props rendered
// elsewhere; this file draws everything static around them.

const EDGE = HALF - 0.3;
/** Matches FOREST_RADIUS in shared/collision.ts: past this you are in the trees. */
const TREELINE = 8.3;

/** Centre line of the stream, which meanders across the front-left of the clearing. */
export function streamZ(x: number): number {
  return 6.4 + Math.sin(x * 0.34) * 0.9;
}

const TENTS: { x: number; z: number; color: string }[] = [
  { x: -5.6, z: -4.6, color: "#d97a4a" },
  { x: 5.4, z: -5.0, color: "#4a8ad9" },
  { x: -6.2, z: 2.6, color: "#5fa86a" },
];

/** Keep procedural scatter off the paths, the water, the tents and the seating ring. */
function isClearZone(x: number, z: number, margin = 0): boolean {
  if (Math.abs(x) < 2.6 + margin && z > 4.6) return true; // stone trail + spawn
  if (Math.abs(z - streamZ(x)) < 1.5 + margin) return true; // the stream
  if (Math.hypot(x, z) < 4.6 + margin) return true; // fire, log ring and their approach points
  if (TENTS.some((t) => Math.hypot(x - t.x, z - t.z) < 2.2 + margin)) return true;
  if (Math.hypot(x - 5.7, z + 3.4) < 2.0 + margin) return true; // stargazing blanket + telescope
  if (Math.hypot(x - 4.4, z + 2.2) < 0.9 || Math.hypot(x + 4.4, z - 2.2) < 0.9) return true; // lantern stumps
  if (Math.hypot(x - 2.3, z + 6.0) < 1.4 + margin) return true; // camp table
  return false;
}

export function CampfireWorld({ mats }: { mats: Materials }) {
  return (
    <>
      <FirePit mats={mats} />
      <Forest mats={mats} />
      <GroundCover mats={mats} />
      <Stream mats={mats} />
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
  // The flames, embers and firelight are the "campfire" prop; this is the stone ring, the logs
  // and the cooking tripod over them.
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
        <Cyl key={r} p={[0, 0.17, 0]} s={[0.12, 0.8, 0.12]} r={[0, r, Math.PI / 2.4]} m={mats.darkWood} cast />
      ))}
      {/* cooking tripod with a billy can hanging over the flames */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        return (
          <Cyl
            key={i}
            p={[Math.cos(a) * 0.5, 0.9, Math.sin(a) * 0.5]}
            s={[0.06, 1.85, 0.06]}
            r={[Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]}
            m={mats.bark}
            cast
          />
        );
      })}
      <Cyl p={[0, 1.2, 0]} s={[0.02, 0.5, 0.02]} m={mats.metal} />
      <Cyl p={[0, 0.88, 0]} s={[0.42, 0.34, 0.42]} m={mats.metal} cast />
      <mesh geometry={GEO.torus} material={mats.metal} position={[0, 1.06, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.22, 0.22, 0.5]} raycast={noRaycast} />
    </>
  );
}

// The forest is now one to two rows of pines around the clearing instead of a wall of them:
// roughly 45% fewer trees, and you can see out of the camp.
function Forest({ mats }: { mats: Materials }) {
  const { trunks, lower, upper, boulders } = useMemo(() => {
    const rand = seeded(2024);
    const trunks: InstanceSpec[] = [];
    const lower: InstanceSpec[] = [];
    const upper: InstanceSpec[] = [];
    const boulders: InstanceSpec[] = [];

    const addPine = (x: number, z: number, scale: number) => {
      const rot = rand() * Math.PI;
      trunks.push({ p: [x, 0.45 * scale, z], s: [0.26 * scale, 0.9 * scale, 0.26 * scale], r: [0, rot, 0] });
      lower.push({ p: [x, 1.3 * scale, z], s: [1.25 * scale, 1.3 * scale, 1.25 * scale], r: [0, rot, 0] });
      upper.push({ p: [x, 2.05 * scale, z], s: [0.9 * scale, 1.05 * scale, 0.9 * scale], r: [0, rot + 0.4, 0] });
    };

    // Two rings of trunks around the treeline, jittered, with a gap where the trail comes in.
    for (const ring of [TREELINE + 0.35, TREELINE + 1.35]) {
      const count = Math.round(ring * 3.4);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand() * 0.18;
        const r = ring + (rand() - 0.5) * 0.5;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (Math.abs(x) > EDGE || Math.abs(z) > EDGE) continue;
        if (isClearZone(x, z)) continue; // leaves the trail mouth and the stream open
        addPine(x, z, 0.85 + rand() * 0.6);
      }
    }
    // A handful of saplings and boulders scattered inside the clearing for depth.
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2;
      const r = 5.2 + rand() * 2.6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isClearZone(x, z)) continue;
      if (rand() < 0.45) addPine(x, z, 0.4 + rand() * 0.3);
      else if (rand() < 0.3) boulders.push({ p: [x, 0.16, z], s: [0.6 + rand() * 0.4, 0.4 + rand() * 0.25, 0.55 + rand() * 0.4], r: [0, rand() * 3, 0] });
    }
    return { trunks, lower, upper, boulders };
  }, []);

  return (
    <>
      {/* fadeRadius: a pine standing between you and the camera dissolves instead of hiding you */}
      <Instanced geo={GEO.cylLow} m={mats.bark} items={trunks} cast fadeRadius={1.1} />
      <Instanced geo={GEO.coneLow} m={mats.pine} items={lower} cast fadeRadius={1.3} />
      <Instanced geo={GEO.coneLow} m={mats.pineLight} items={upper} cast fadeRadius={1.3} />
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

    for (let i = 0; i < 360; i++) {
      const x = (rand() * 2 - 1) * 9.2;
      const z = (rand() * 2 - 1) * 9.2;
      if (isClearZone(x, z, -0.5)) continue;
      const nearStream = Math.abs(z - streamZ(x)) < 2.4;
      const roll = rand();
      if (nearStream ? roll < 0.4 : roll < 0.16) addFlowerClump(x, z);
      else if (roll < 0.7) tufts.push({ p: [x, 0.1, z], s: [0.1, 0.22 + rand() * 0.12, 0.1], r: [0, rand() * 3, (rand() - 0.5) * 0.3] });
    }

    for (const [cx, cz] of [
      [-7.0, -2.6],
      [3.4, -7.4],
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

// A ribbon mesh following streamZ(x), with a muddy bank under it and glints drifting downstream.
function Stream({ mats }: { mats: Materials }) {
  const { water, bank } = useMemo(() => {
    const ribbon = (halfWidth: number, y: number) => {
      const positions: number[] = [];
      const indices: number[] = [];
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const x = -EDGE - 0.3 + (i / steps) * (EDGE * 2 + 0.6);
        const zc = streamZ(x);
        const w = halfWidth * (0.85 + Math.sin(x * 0.9) * 0.15);
        positions.push(x, y, zc - w, x, y, zc + w);
        if (i < steps) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      return g;
    };
    return { water: ribbon(0.75, 0.028), bank: ribbon(1.05, 0.014) };
  }, []);
  useEffect(
    () => () => {
      water.dispose();
      bank.dispose();
    },
    [water, bank]
  );

  const glintRef = useRef<THREE.InstancedMesh>(null);
  const glints = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ offset: i / 12, lane: (i % 3) - 1 })), []);
  const tmp = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const mesh = glintRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    glints.forEach((g, i) => {
      const u = (g.offset + t * 0.04) % 1;
      const x = -EDGE + u * EDGE * 2;
      tmp.position.set(x, 0.04, streamZ(x) + g.lane * 0.32);
      const twinkle = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      tmp.scale.set(0.2 * twinkle + 0.05, 0.01, 0.05);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group userData={noMerge}>
      <mesh geometry={bank} material={mats.mud} receiveShadow raycast={noRaycast} />
      <mesh geometry={water} material={mats.water} raycast={noRaycast} />
      <instancedMesh ref={glintRef} args={[GEO.box, mats.bulb, glints.length]} frustumCulled={false} raycast={noRaycast} />
      {/* stepping stones a little downstream of the bridge, for the look of it */}
      {[-2.2, -1.5, -0.8].map((dx) => (
        <Cyl key={dx} p={[-4.2 + dx, 0.06, streamZ(-4.2 + dx)]} s={[0.66, 0.12, 0.54]} m={mats.stone} recv />
      ))}
    </group>
  );
}

// The trail comes in from the front, crosses the stream on a plank bridge, and reaches the fire.
function StoneTrail({ mats }: { mats: Materials }) {
  const stones = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(9);
    const out: InstanceSpec[] = [];
    for (let z = 9.2; z > 3.4; z -= 0.6) {
      if (Math.abs(z - streamZ(Math.sin(z * 0.8) * 0.3)) < 1.3) continue; // the bridge spans this
      const x = Math.sin(z * 0.8) * 0.3;
      const s = 0.45 + rand() * 0.15;
      out.push({ p: [x, 0.04, z], s: [s, 0.05, s * 0.8], r: [0, rand() * 3, 0] });
    }
    return out;
  }, []);

  const bridgeZ = streamZ(0);
  const planks = useMemo<InstanceSpec[]>(
    () => Array.from({ length: 9 }, (_, i) => ({ p: [0, 0.22, bridgeZ - 1.6 + i * 0.4] as [number, number, number], s: [1.7, 0.08, 0.34] as [number, number, number] })),
    [bridgeZ]
  );

  return (
    <>
      <Instanced geo={GEO.cylLow} m={mats.stone} items={stones} recv />
      {/* the bridge: deck, four posts and a rail on each side */}
      <Instanced geo={GEO.box} m={mats.plankA} items={planks} cast recv />
      {[-0.85, 0.85].map((dx) => (
        <group key={dx}>
          {[-1.5, 1.5].map((dz) => (
            <Cyl key={dz} p={[dx, 0.13, bridgeZ + dz]} s={[0.12, 0.26, 0.12]} m={mats.darkWood} />
          ))}
          {[-1.5, 1.5].map((dz) => (
            <Cyl key={`r${dz}`} p={[dx, 0.52, bridgeZ + dz]} s={[0.1, 0.62, 0.1]} m={mats.darkWood} cast />
          ))}
          <B p={[dx, 0.78, bridgeZ]} s={[0.08, 0.08, 3.1]} m={mats.darkWood} cast />
        </group>
      ))}
    </>
  );
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
        [4.4, -2.2],
        [-4.4, 2.2],
      ].map(([x, z]) => (
        <group key={x}>
          <Cyl p={[x, 0.2, z]} s={[0.62, 0.4, 0.62]} m={mats.bark} cast recv />
          <Cyl p={[x, 0.405, z]} s={[0.58, 0.01, 0.58]} m={mats.oak} />
        </group>
      ))}

      {/* firewood stack */}
      <group position={[-2.9, 0, -4.3]} rotation={[0, 0.5, 0]}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const row = i < 3 ? 0 : i < 5 ? 1 : 2;
          const col = i < 3 ? i : i < 5 ? i - 3 : 0;
          return (
            <Cyl key={i} p={[0, 0.12 + row * 0.21, (col - (2 - row) / 2) * 0.24]} s={[0.22, 0.9, 0.22]} r={[0, 0, Math.PI / 2]} m={i % 2 ? mats.darkWood : mats.bark} cast />
          );
        })}
      </group>

      {/* camp table with a cooler underneath and a lamp and mugs on top */}
      <group position={[2.3, 0, -6.0]} rotation={[0, -0.25, 0]}>
        <B p={[0, 0.62, 0]} s={[1.5, 0.07, 0.8]} m={mats.oak} cast recv />
        {[
          [-0.65, -0.3],
          [0.65, -0.3],
          [-0.65, 0.3],
          [0.65, 0.3],
        ].map(([dx, dz], i) => (
          <Cyl key={i} p={[dx, 0.3, dz]} s={[0.06, 0.6, 0.06]} m={mats.metal} />
        ))}
        <Cyl p={[-0.4, 0.72, 0.05]} s={[0.16, 0.18, 0.16]} m={mats.white} />
        <Cyl p={[-0.1, 0.72, -0.1]} s={[0.16, 0.18, 0.16]} m={mats.terracotta} />
        <B p={[0.45, 0.72, 0]} s={[0.3, 0.14, 0.24]} m={mats.mustard} />
        {/* cooler tucked under the table */}
        <B p={[0.2, 0.2, 0]} s={[0.7, 0.4, 0.45]} m={mats.navy} cast />
        <B p={[0.2, 0.42, 0]} s={[0.74, 0.06, 0.49]} m={mats.white} />
      </group>

      {/* backpack leaning on the orange tent */}
      <group position={[-4.5, 0, -3.4]} rotation={[0, 0.8, 0.15]}>
        <Sph p={[0, 0.37, 0]} s={[0.46, 0.64, 0.34]} m={mats.pine} cast />
        <B p={[0, 0.24, 0.17]} s={[0.26, 0.2, 0.08]} m={mats.bark} />
      </group>

      {/* The guitar now stands on an A-frame stand ON THE GROUND. It used to be posed in mid-air
          beside the log, which read as somebody's ghost holding it. */}
      <group position={[-2.6, 0, 1.9]} rotation={[0, 0.9, 0]}>
        {[-0.18, 0.18].map((dx) => (
          <Cyl key={dx} p={[dx, 0.26, 0]} s={[0.05, 0.52, 0.05]} r={[0.18, 0, dx > 0 ? -0.2 : 0.2]} m={mats.black} />
        ))}
        <Cyl p={[0, 0.46, 0.03]} s={[0.04, 0.38, 0.04]} r={[0, 0, Math.PI / 2]} m={mats.black} />
        <group position={[0, 0, 0.05]} rotation={[0.16, 0, 0]}>
          <Sph p={[0, 0.4, 0]} s={[0.48, 0.48, 0.16]} m={mats.oak} cast />
          <Sph p={[0, 0.63, 0]} s={[0.36, 0.36, 0.13]} m={mats.oak} cast />
          <Cyl p={[0, 0.4, 0.085]} s={[0.12, 0.01, 0.12]} r={[Math.PI / 2, 0, 0]} m={mats.black} />
          <B p={[0, 1.02, 0]} s={[0.09, 0.62, 0.05]} m={mats.darkWood} cast />
          <B p={[0, 1.36, 0]} s={[0.12, 0.18, 0.05]} m={mats.black} />
        </group>
      </group>

      {/* marshmallow kit */}
      <group position={[1.5, 0, -3.4]}>
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
      <B p={[5.7, 0.06, -3.4]} s={[2.2, 0.02, 1.7]} m={mats.rust} recv />
      {[-0.6, 0, 0.6].map((dx) => (
        <B key={`v${dx}`} p={[5.7 + dx, 0.075, -3.4]} s={[0.12, 0.01, 1.7]} m={mats.cream} />
      ))}
      {[-0.5, 0.3].map((dz) => (
        <B key={`h${dz}`} p={[5.7, 0.08, -3.4 + dz]} s={[2.2, 0.01, 0.12]} m={mats.mustard} />
      ))}
      {[5.3, 6.1].map((x) => (
        <Sph key={x} p={[x, 0.09, -4.0]} s={[0.52, 0.16, 0.32]} m={mats.cream} cast />
      ))}
      {/* telescope on a tripod, aimed up at the stars */}
      <group position={[7.3, 0, -2.7]}>
        {[0, 1, 2].map((i) => (
          <Cyl key={i} p={[Math.cos(i * 2.09) * 0.2, 0.5, Math.sin(i * 2.09) * 0.2]} s={[0.03, 1.05, 0.03]} r={[Math.sin(i * 2.09) * 0.35, 0, -Math.cos(i * 2.09) * 0.35]} m={mats.black} />
        ))}
        <Cyl p={[0, 1.1, -0.1]} s={[0.12, 0.9, 0.12]} r={[-0.9, 0.3, 0]} m={mats.brass} cast />
      </group>
    </>
  );
}

const FIREFLY_COUNT = 30;

// Slow-drifting fireflies with an independent blink phase each, as ONE instanced mesh updated
// per frame (30 matrix writes) instead of 30 separate draw calls.
function Fireflies({ mats }: { mats: Materials }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // Fireflies are a dusk-and-dark thing; by day they simply aren't out.
  const time = useContext(TimeOfDayContext);
  const out = time === "night" || time === "sunset";
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => {
    const rand = seeded(31);
    return Array.from({ length: FIREFLY_COUNT }, (_, i) => ({
      overStream: i % 3 === 0,
      radius: 2.8 + rand() * 5.0,
      angle: rand() * Math.PI * 2,
      baseY: 0.45 + rand() * 1.4,
      drift: (0.04 + rand() * 0.07) * (rand() < 0.5 ? -1 : 1),
      bob: 0.5 + rand() * 0.9,
      phase: rand() * 10,
      streamX: (rand() * 2 - 1) * 8,
    }));
  }, []);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      if (s.overStream) {
        const x = s.streamX + Math.sin(t * s.drift * 6 + s.phase) * 1.4;
        tmp.position.set(x, s.baseY * 0.6 + Math.sin(t * s.bob + s.phase) * 0.2, streamZ(x) + Math.cos(t * 0.3 + s.phase) * 0.8);
      } else {
        const a = s.angle + t * s.drift;
        tmp.position.set(Math.cos(a) * s.radius, s.baseY + Math.sin(t * s.bob + s.phase) * 0.25, Math.sin(a) * s.radius);
      }
      const blink = Math.max(0, Math.sin(t * 1.4 + s.phase));
      tmp.scale.setScalar(0.02 + blink * 0.07);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  // frustumCulled off: instances move every frame, so a stale bounding sphere would cull them.
  return <instancedMesh ref={ref} args={[GEO.sphereLow, mats.bulb, FIREFLY_COUNT]} frustumCulled={false} visible={out} raycast={noRaycast} userData={{ noMerge: true }} />;
}
