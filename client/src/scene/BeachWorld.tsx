import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cone, Cyl, GEO, HALF, Instanced, Sph, noMerge, noRaycast, seeded, type InstanceSpec, type Materials } from "./kit";

// 18x18 sunset beach. The tiki bar's stools, the loungers, the driftwood ring and the bonfire
// are interactive props rendered elsewhere; this file draws the island itself.
//
// Coordinates match shared/collision.ts and shared/props.ts. The sea starts at SHORE and the
// pier is the only way out over it — both mirrored in collision.ts's `inScenery`.
const SHORE = 4.4;
const PIER = { x0: 1.0, x1: 3.4, z1: 7.2 };

export function BeachWorld({ mats }: { mats: Materials }) {
  return (
    <>
      <Sea mats={mats} />
      <Sand mats={mats} />
      <TikiBar mats={mats} />
      <Pier mats={mats} />
      <LoungerSpot mats={mats} />
      <Palms mats={mats} />
      <BeachClutter mats={mats} />
      <BonfireRing mats={mats} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Sea: two flat bands (shallow then deep) with a foam line and a gentle swell
// ---------------------------------------------------------------------------------------

function Sea({ mats }: { mats: Materials }) {
  const swellRef = useRef<THREE.Group>(null);
  // A slow vertical bob on the whole sea plate reads as a swell for almost nothing: no vertex
  // work, no shader, one transform a frame.
  useFrame(({ clock }) => {
    if (swellRef.current) swellRef.current.position.y = Math.sin(clock.elapsedTime * 0.55) * 0.012;
  });

  const foam = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(5);
    return Array.from({ length: 26 }, (_, i) => {
      const x = -HALF + (i / 26) * HALF * 2 + rand() * 0.3;
      return { p: [x, 0.05, SHORE - 0.1 + Math.sin(x * 0.9) * 0.16] as [number, number, number], s: [0.7 + rand() * 0.5, 0.02, 0.22] as [number, number, number] };
    });
  }, []);

  // noMerge: the static batch would bake the sea into the world and the swell would never move.
  return (
    <group ref={swellRef} userData={noMerge}>
      {/* wet sand strip, then shallow water, then the deep band out to the horizon */}
      <B p={[0, 0.02, SHORE - 0.55]} s={[HALF * 2, 0.01, 1.1]} m={mats.wetSand} recv />
      <B p={[0, 0.04, SHORE + 1.4]} s={[HALF * 2, 0.02, 2.8]} m={mats.seaShallow} />
      <B p={[0, 0.045, SHORE + 3.9]} s={[HALF * 2, 0.02, 2.2]} m={mats.seaDeep} />
      <Instanced geo={GEO.box} m={mats.foam} items={foam} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Sand: the beach itself, plus a scatter of shells, pebbles and tufts of dune grass
// ---------------------------------------------------------------------------------------

function Sand({ mats }: { mats: Materials }) {
  const { shells, pebbles, grass } = useMemo(() => {
    const rand = seeded(88);
    const shells: InstanceSpec[] = [];
    const pebbles: InstanceSpec[] = [];
    const grass: InstanceSpec[] = [];
    const clear = (x: number, z: number) =>
      (Math.abs(x) < 3.6 && z > -6.4 && z < -4.0) || // the bar
      Math.hypot(x - 4.4, z + 0.6) < 2.4 || // the bonfire ring
      (x > PIER.x0 - 0.4 && x < PIER.x1 + 0.4 && z > 3.0) || // the pier
      Math.hypot(x + 5.6, z - 2.3) < 2.4; // the loungers

    for (let i = 0; i < 260; i++) {
      const x = (rand() * 2 - 1) * 8.2;
      const z = -8.2 + rand() * (SHORE + 7.6);
      if (clear(x, z)) continue;
      const roll = rand();
      if (roll < 0.14) {
        shells.push({ p: [x, 0.04, z], s: [0.14 + rand() * 0.08, 0.05, 0.11 + rand() * 0.06], r: [0, rand() * 3, 0] });
      } else if (roll < 0.3) {
        pebbles.push({ p: [x, 0.03, z], s: [0.12 + rand() * 0.1, 0.06, 0.1 + rand() * 0.08], r: [0, rand() * 3, 0] });
      } else if (roll < 0.42 && z < -3.4) {
        // dune grass only up at the dry top of the beach
        grass.push({ p: [x, 0.16, z], s: [0.1, 0.34 + rand() * 0.16, 0.1], r: [0, rand() * 3, (rand() - 0.5) * 0.35] });
      }
    }
    return { shells, pebbles, grass };
  }, []);

  return (
    <>
      <Instanced geo={GEO.sphereLow} m={mats.shell} items={shells} />
      <Instanced geo={GEO.sphereLow} m={mats.stone} items={pebbles} />
      <Instanced geo={GEO.coneLow} m={mats.palmLeaf} items={grass} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// The tiki bar: thatched roof on bamboo posts, bottles, and a cocktail with a tiny umbrella
// ---------------------------------------------------------------------------------------

function TikiBar({ mats }: { mats: Materials }) {
  // A conical thatch roof, with a skirt of individual panels hanging at the eaves so the edge
  // reads as woven straw rather than as a clean cone.
  const eaves = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    const count = 22;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      out.push({
        p: [Math.cos(a) * 3.0, 2.62, -5.3 + Math.sin(a) * 2.3],
        s: [0.42, 0.42, 0.1],
        r: [0.55, -a, 0],
      });
    }
    return out;
  }, []);

  const bottles = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(12);
    const colors = ["#8fd6a8", "#e8a84a", "#d96b6b", "#6fb2d9", "#c9a24a"];
    return Array.from({ length: 9 }, (_, i) => ({
      p: [-1.9 + i * 0.44, 1.62, -5.85] as [number, number, number],
      s: [0.13, 0.34 + rand() * 0.12, 0.13] as [number, number, number],
      color: colors[i % colors.length],
    }));
  }, []);

  return (
    <>
      {/* counter: bamboo front, driftwood top overhanging the stool side */}
      <B p={[-0.6, 0.55, -5.35]} s={[5.6, 1.1, 1.0]} m={mats.wood} cast recv />
      <B p={[-0.6, 1.14, -5.2]} s={[6.0, 0.12, 1.4]} m={mats.oak} cast recv />
      {Array.from({ length: 11 }, (_, i) => -3.2 + i * 0.52).map((x) => (
        <Cyl key={x} p={[x, 0.55, -4.86]} s={[0.17, 1.06, 0.17]} m={mats.bark} />
      ))}
      {/* back shelf with the bottles */}
      <B p={[-0.6, 1.42, -5.85]} s={[4.6, 0.08, 0.3]} m={mats.darkWood} />
      <Instanced geo={GEO.cylLow} m={mats.tintable} items={bottles} />

      {/* a cocktail on the counter, complete with a tiny paper umbrella */}
      <group position={[1.5, 1.2, -5.0]}>
        <Cyl p={[0, 0.16, 0]} s={[0.22, 0.32, 0.26]} m={mats.glass} />
        <Cyl p={[0, 0.14, 0]} s={[0.19, 0.24, 0.22]} m={mats.coral} />
        <Sph p={[0.06, 0.3, 0.04]} s={0.08} m={mats.mustard} />
        <Cyl p={[-0.07, 0.34, 0]} s={[0.02, 0.4, 0.02]} r={[0.2, 0, 0.25]} m={mats.white} />
        <Cone p={[0.09, 0.46, -0.02]} s={[0.26, 0.12, 0.26]} r={[0.1, 0, -0.3]} m={mats.blush} />
        <Cyl p={[0.09, 0.38, -0.02]} s={[0.015, 0.22, 0.015]} r={[0.1, 0, -0.3]} m={mats.oak} />
      </group>
      {/* a second glass and a bowl of limes */}
      <Cyl p={[-2.6, 1.32, -5.0]} s={[0.2, 0.24, 0.24]} m={mats.glass} />
      <Cyl p={[-2.6, 1.28, -5.0]} s={[0.17, 0.16, 0.2]} m={mats.leafLight} />
      <Cyl p={[0.4, 1.24, -5.45]} s={[0.4, 0.09, 0.4]} m={mats.shell} />
      {[
        [0.32, -5.42],
        [0.48, -5.48],
        [0.4, -5.34],
      ].map(([x, z], i) => (
        <Sph key={i} p={[x, 1.32, z]} s={0.11} m={i === 1 ? mats.mustard : mats.leafLight} />
      ))}

      {/* four bamboo posts and the thatched roof they hold up */}
      {[
        [-3.3, -6.0],
        [2.1, -6.0],
        [-3.3, -4.6],
        [2.1, -4.6],
      ].map(([x, z]) => (
        <Cyl key={String(x) + ":" + String(z)} p={[x, 1.45, z]} s={[0.17, 2.9, 0.17]} m={mats.bark} cast />
      ))}
      <Instanced geo={GEO.box} m={mats.thatch} items={eaves} />
      <Cone p={[0, 3.0, -5.3]} s={[6.6, 1.0, 5.2]} m={mats.thatch} cast />
      <Cone p={[0, 3.62, -5.3]} s={[3.4, 0.7, 2.7]} m={mats.thatch} cast />
      <Sph p={[0, 3.95, -5.3]} s={[0.34, 0.34, 0.34]} m={mats.darkWood} />
      {/* a painted sign hanging off the front beam */}
      <B p={[-0.6, 2.58, -4.55]} s={[5.6, 0.14, 0.14]} m={mats.darkWood} />
      <B p={[-0.6, 2.2, -4.5]} s={[1.9, 0.5, 0.06]} m={mats.oak} />
      <B p={[-0.6, 2.2, -4.46]} s={[1.7, 0.34, 0.02]} m={mats.coral} />
      {[-0.3, 0.3].map((dx) => (
        <Cyl key={dx} p={[-0.6 + dx, 2.45, -4.5]} s={[0.02, 0.16, 0.02]} m={mats.metal} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// The pier: planks on posts running out over the water, with a couple of seats at the end
// ---------------------------------------------------------------------------------------

function Pier({ mats }: { mats: Materials }) {
  const { planks, posts } = useMemo(() => {
    const planks: InstanceSpec[] = [];
    const posts: InstanceSpec[] = [];
    const width = PIER.x1 - PIER.x0;
    const cx = (PIER.x0 + PIER.x1) / 2;
    for (let z = 3.0; z <= PIER.z1; z += 0.34) {
      planks.push({ p: [cx, 0.13, z], s: [width, 0.06, 0.3] });
    }
    for (let z = 3.4; z <= PIER.z1; z += 1.2) {
      posts.push({ p: [PIER.x0 + 0.2, 0.05, z], s: [0.16, 0.2, 0.16] });
      posts.push({ p: [PIER.x1 - 0.2, 0.05, z], s: [0.16, 0.2, 0.16] });
    }
    return { planks, posts };
  }, []);

  return (
    <>
      <Instanced geo={GEO.box} m={mats.plankA} items={planks} cast recv />
      <Instanced geo={GEO.cylLow} m={mats.darkWood} items={posts} />
      {/* rope rail along both sides, on short bollards */}
      {[PIER.x0 + 0.1, PIER.x1 - 0.1].map((x) => (
        <group key={x}>
          {[3.6, 5.0, 6.4].map((z) => (
            <Cyl key={z} p={[x, 0.38, z]} s={[0.12, 0.5, 0.12]} m={mats.darkWood} cast />
          ))}
          <B p={[x, 0.58, 5.0]} s={[0.05, 0.05, 3.4]} m={mats.cream} />
        </group>
      ))}
      {/* a bucket and a fishing rod left at the end */}
      <Cyl p={[1.35, 0.28, 6.9]} s={[0.3, 0.24, 0.3]} m={mats.metal} cast />
      <Cyl p={[3.1, 0.9, 6.2]} s={[0.03, 1.5, 0.03]} r={[-0.5, 0.3, 0]} m={mats.bark} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Sun loungers under a parasol, with a towel and a drink
// ---------------------------------------------------------------------------------------

function LoungerSpot({ mats }: { mats: Materials }) {
  const canopy = useMemo<InstanceSpec[]>(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return {
          p: [Math.cos(a) * 0.95, 2.28, Math.sin(a) * 0.95] as [number, number, number],
          s: [1.25, 0.06, 0.9] as [number, number, number],
          r: [0.22, -a, 0] as [number, number, number],
          color: i % 2 ? "#f2f0ea" : "#e8705f",
        };
      }),
    []
  );

  return (
    <>
      {/* parasol between the two loungers */}
      <group position={[-6.2, 0, 2.3]}>
        <Cyl p={[0, 1.15, 0]} s={[0.1, 2.3, 0.1]} m={mats.oak} cast />
        <Instanced geo={GEO.box} m={mats.tintable} items={canopy} cast />
        <Cone p={[0, 2.46, 0]} s={[0.3, 0.2, 0.3]} m={mats.coral} />
      </group>
      {/* a towel spread on the sand and a drink stuck in it */}
      <B p={[-4.4, 0.06, 4.0]} s={[1.5, 0.02, 1.0]} r={[0, 0.3, 0]} m={mats.seaShallow} recv />
      <B p={[-4.4, 0.075, 4.0]} s={[1.2, 0.01, 0.2]} r={[0, 0.3, 0]} m={mats.white} />
      <Cyl p={[-3.6, 0.18, 3.3]} s={[0.18, 0.36, 0.18]} m={mats.glass} />
      <Cyl p={[-3.6, 0.14, 3.3]} s={[0.15, 0.24, 0.15]} m={mats.mustard} />
      {/* flip-flops */}
      {[-0.18, 0.18].map((dx) => (
        <B key={dx} p={[-7.0 + dx, 0.04, 3.9]} s={[0.22, 0.05, 0.5]} r={[0, 0.4 + dx, 0]} m={mats.coral} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Palms: a curved trunk of stacked segments and a crown of drooping fronds
// ---------------------------------------------------------------------------------------

const PALMS: { x: number; z: number; h: number; lean: number }[] = [
  { x: -7.8, z: -6.6, h: 3.6, lean: 0.16 },
  { x: 7.2, z: -5.2, h: 4.0, lean: -0.13 },
  { x: -7.4, z: -0.4, h: 3.2, lean: 0.1 },
  { x: 7.6, z: 1.4, h: 3.4, lean: -0.2 },
  { x: 2.9, z: -7.6, h: 3.0, lean: 0.22 },
];

function Palms({ mats }: { mats: Materials }) {
  const { trunks, fronds, coconuts } = useMemo(() => {
    const trunks: InstanceSpec[] = [];
    const fronds: InstanceSpec[] = [];
    const coconuts: InstanceSpec[] = [];
    const rand = seeded(303);

    for (const palm of PALMS) {
      const segments = 7;
      for (let i = 0; i < segments; i++) {
        const t = i / (segments - 1);
        const y = 0.2 + t * palm.h;
        const x = palm.x + palm.lean * t * t * 3.2;
        trunks.push({ p: [x, y, palm.z], s: [0.3 - t * 0.09, palm.h / segments + 0.08, 0.3 - t * 0.09], r: [0, 0, palm.lean * t] });
      }
      const topX = palm.x + palm.lean * 3.2;
      const topY = 0.2 + palm.h;
      const count = 7;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand();
        fronds.push({
          p: [topX + Math.cos(a) * 0.75, topY + 0.12, palm.z + Math.sin(a) * 0.75],
          s: [1.9, 0.09, 0.62],
          r: [0.1, -a, -0.32],
        });
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        coconuts.push({ p: [topX + Math.cos(a) * 0.2, topY - 0.08, palm.z + Math.sin(a) * 0.2], s: [0.19, 0.19, 0.19] });
      }
    }
    return { trunks, fronds, coconuts };
  }, []);

  return (
    <>
      <Instanced geo={GEO.cylLow} m={mats.bark} items={trunks} cast />
      <Instanced geo={GEO.sphereLow} m={mats.palmLeaf} items={fronds} cast />
      <Instanced geo={GEO.sphereLow} m={mats.darkWood} items={coconuts} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Odds and ends: surfboards, a rowboat pulled up on the sand, a volleyball
// ---------------------------------------------------------------------------------------

function BeachClutter({ mats }: { mats: Materials }) {
  return (
    <>
      {/* surfboard rack at the head of the pier */}
      <group position={[-1.2, 0, 3.8]}>
        {[-0.5, 0.5].map((dx) => (
          <Cyl key={dx} p={[dx, 0.5, 0]} s={[0.1, 1.0, 0.1]} m={mats.darkWood} cast />
        ))}
        <B p={[0, 0.9, 0]} s={[1.2, 0.08, 0.12]} m={mats.darkWood} />
        {[
          [-0.22, mats.coral, 0.22],
          [0.2, mats.seaShallow, -0.18],
        ].map(([dx, m, lean], i) => (
          <group key={i} position={[dx as number, 0, 0]} rotation={[0, 0, lean as number]}>
            <B p={[0, 0.95, 0.06]} s={[0.42, 1.9, 0.09]} m={m as THREE.Material} cast />
            <B p={[0, 0.95, 0.11]} s={[0.07, 1.6, 0.01]} m={mats.white} />
          </group>
        ))}
      </group>

      {/* a little rowboat pulled up above the tideline */}
      <group position={[-3.0, 0, 1.4]} rotation={[0, -0.5, 0]}>
        <Sph p={[0, 0.26, 0]} s={[1.0, 0.52, 2.5]} m={mats.seaShallow} cast recv />
        <Sph p={[0, 0.34, 0]} s={[0.8, 0.44, 2.3]} m={mats.oak} />
        <B p={[0, 0.34, 0]} s={[0.78, 0.06, 0.3]} m={mats.darkWood} />
        <Cyl p={[0.5, 0.42, 0.3]} s={[0.06, 2.0, 0.06]} r={[0, 0.2, 1.5]} m={mats.oak} />
      </group>

      {/* volleyball and a sandcastle, because somebody was here earlier */}
      <Sph p={[1.4, 0.18, 0.4]} s={0.36} m={mats.white} cast />
      <group position={[6.4, 0, 2.4]}>
        <Cyl p={[0, 0.16, 0]} s={[0.7, 0.32, 0.7]} m={mats.wetSand} cast />
        <Cyl p={[0, 0.42, 0]} s={[0.45, 0.24, 0.45]} m={mats.wetSand} cast />
        {[
          [0.26, 0.26],
          [-0.26, 0.26],
          [0.26, -0.26],
          [-0.26, -0.26],
        ].map(([dx, dz], i) => (
          <Cyl key={i} p={[dx, 0.42, dz]} s={[0.17, 0.3, 0.17]} m={mats.wetSand} />
        ))}
        <Cyl p={[0, 0.62, 0]} s={[0.02, 0.3, 0.02]} m={mats.bark} />
        <B p={[0.1, 0.72, 0]} s={[0.2, 0.12, 0.01]} m={mats.coral} />
      </group>
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Bonfire ring: the stones and driftwood round the "bonfire" prop
// ---------------------------------------------------------------------------------------

function BonfireRing({ mats }: { mats: Materials }) {
  const stones = useMemo<InstanceSpec[]>(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return { p: [4.4 + Math.cos(a) * 0.75, 0.09, -0.6 + Math.sin(a) * 0.75], s: [0.3, 0.2, 0.26], r: [0, a, 0] };
      }),
    []
  );
  return (
    <>
      <Instanced geo={GEO.sphereLow} m={mats.stone} items={stones} recv />
      <Cyl p={[4.4, 0.02, -0.6]} s={[1.5, 0.01, 1.5]} m={mats.wetSand} />
      {[0.5, -0.5, 1.6].map((r) => (
        <Cyl key={r} p={[4.4, 0.1, -0.6]} s={[0.12, 0.8, 0.12]} r={[0, r, Math.PI / 2.4]} m={mats.darkWood} cast />
      ))}
      {/* a cooler and a stack of spare driftwood beside the ring */}
      <B p={[6.2, 0.22, -1.6]} s={[0.7, 0.44, 0.45]} r={[0, 0.3, 0]} m={mats.seaShallow} cast />
      <B p={[6.2, 0.46, -1.6]} s={[0.74, 0.06, 0.49]} r={[0, 0.3, 0]} m={mats.white} />
      {[0, 1, 2].map((i) => (
        <Cyl key={i} p={[2.6 + i * 0.06, 0.12 + i * 0.2, -1.9]} s={[0.2, 0.9, 0.2]} r={[0, 0.3 * i, Math.PI / 2]} m={i % 2 ? mats.darkWood : mats.bark} cast />
      ))}
    </>
  );
}
