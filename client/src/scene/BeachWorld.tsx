import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cone, Cyl, GEO, HALF, Instanced, Sph, noMerge, noRaycast, seeded, type InstanceSpec, type Materials } from "./kit";
import { PIER_MAX_X, PIER_MIN_X, PIER_END_Z, SHORELINE_Z } from "@shared/collision";

// A 20x20 sunset beach. The tiki bar's stools, the loungers, the driftwood ring and the bonfire
// are interactive props rendered elsewhere; this file draws the island itself.
//
// The sea is ONE continuous surface sunk into a basin moulded into the slab (see DioramaSlab in
// ProceduralRoom): no floating blue rectangles, and no hollow to see under the pier.
export const BASIN_Y = -0.25;
const WATER_Y = BASIN_Y + 0.17;

export function BeachWorld({ mats }: { mats: Materials }) {
  return (
    <>
      <Sea mats={mats} />
      <Sand mats={mats} />
      <TikiBar mats={mats} />
      <Pier mats={mats} />
      <LoungerSpot mats={mats} />
      <VolleyballCourt mats={mats} />
      <Palms mats={mats} />
      <BeachClutter mats={mats} />
      <BonfireRing mats={mats} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Sea: a single graded surface filling the basin, with a foam line along the shore
// ---------------------------------------------------------------------------------------

function Sea({ mats }: { mats: Materials }) {
  const surfaceRef = useRef<THREE.Mesh>(null);

  // One plane spanning the whole basin, vertex-coloured from turquoise at the shore to deep
  // blue at the horizon — a gradient rather than two rectangles butted together, which is what
  // used to leave a hard seam beside the pier.
  const geometry = useMemo(() => {
    const width = HALF * 2;
    const depth = HALF - SHORELINE_Z + 0.4;
    const segX = 40;
    const segZ = 16;
    const g = new THREE.PlaneGeometry(width, depth, segX, segZ);
    g.rotateX(-Math.PI / 2);
    const shallow = new THREE.Color("#63d3de");
    const deep = new THREE.Color("#0f5f8f");
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      // t: 0 at the shore edge of the plane, 1 at the far edge
      const t = THREE.MathUtils.clamp((pos.getZ(i) + depth / 2) / depth, 0, 1);
      c.copy(shallow).lerp(deep, Math.pow(t, 0.75));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.16,
        metalness: 0.12,
        transparent: true,
        opacity: 0.94,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  // Rolling swell: the whole surface rides up and down a few centimetres, and the vertex rows
  // ripple along it. Cheap (one geometry, updated in place) and it makes the water feel alive.
  const basePositions = useMemo(() => Float32Array.from(geometry.attributes.position.array), [geometry]);
  useFrame(({ clock }) => {
    const mesh = surfaceRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = basePositions[i * 3];
      const z = basePositions[i * 3 + 2];
      pos.setY(i, Math.sin(x * 0.55 + t * 0.9) * 0.035 + Math.sin(z * 0.9 - t * 1.3) * 0.022);
    }
    pos.needsUpdate = true;
  });

  const foam = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(5);
    return Array.from({ length: 30 }, (_, i) => {
      const x = -HALF + (i / 30) * HALF * 2 + rand() * 0.3;
      return {
        p: [x, WATER_Y + 0.03, SHORELINE_Z + 0.12 + Math.sin(x * 0.9) * 0.14] as [number, number, number],
        s: [0.8 + rand() * 0.5, 0.02, 0.26] as [number, number, number],
      };
    });
  }, []);

  // A handful of sparkles skating over the water where the low sun catches it.
  const sparkleRef = useRef<THREE.InstancedMesh>(null);
  const sparkles = useMemo(() => {
    const rand = seeded(63);
    return Array.from({ length: 22 }, () => ({ x: (rand() * 2 - 1) * (HALF - 0.6), z: SHORELINE_Z + rand() * (HALF - SHORELINE_Z), phase: rand() * 9 }));
  }, []);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const mesh = sparkleRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    sparkles.forEach((s, i) => {
      const twinkle = Math.max(0, Math.sin(t * 1.6 + s.phase));
      tmp.position.set(s.x + Math.sin(t * 0.3 + s.phase) * 0.35, WATER_Y + 0.05, s.z + Math.cos(t * 0.22 + s.phase) * 0.25);
      tmp.scale.set(0.26 * twinkle + 0.02, 0.01, 0.06 * twinkle + 0.01);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group userData={noMerge}>
      <mesh
        ref={surfaceRef}
        geometry={geometry}
        material={material}
        position={[0, WATER_Y, SHORELINE_Z + (HALF - SHORELINE_Z + 0.4) / 2 - 0.2]}
        raycast={noRaycast}
      />
      <Instanced geo={GEO.box} m={mats.foam} items={foam} />
      <instancedMesh ref={sparkleRef} args={[GEO.box, mats.foam, sparkles.length]} frustumCulled={false} raycast={noRaycast} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Sand: shells, pebbles and driftwood. No lawn grass, and no mystery white sphere.
// ---------------------------------------------------------------------------------------

function Sand({ mats }: { mats: Materials }) {
  const { shells, pebbles, twigs } = useMemo(() => {
    const rand = seeded(88);
    const shells: InstanceSpec[] = [];
    const pebbles: InstanceSpec[] = [];
    const twigs: InstanceSpec[] = [];
    const clear = (x: number, z: number) =>
      (Math.abs(x) < 3.8 && z > -7.0 && z < -4.4) || // the bar
      Math.hypot(x - 5.0, z + 1.0) < 2.6 || // the bonfire ring
      (x > PIER_MIN_X - 0.5 && x < PIER_MAX_X + 0.5 && z > 3.0) || // the pier
      (x > -5.6 && x < -4.2 && z > -4.1 && z < 0.5) || // the volleyball court
      Math.hypot(x + 6.5, z - 2.1) < 2.6; // the loungers

    for (let i = 0; i < 300; i++) {
      const x = (rand() * 2 - 1) * 9.2;
      const z = -9.2 + rand() * (SHORELINE_Z + 8.9);
      if (clear(x, z)) continue;
      const roll = rand();
      if (roll < 0.22) {
        // little clam shells, lying flat
        shells.push({ p: [x, 0.035, z], s: [0.15 + rand() * 0.09, 0.05, 0.12 + rand() * 0.07], r: [0, rand() * 3, 0] });
      } else if (roll < 0.45) {
        pebbles.push({ p: [x, 0.03, z], s: [0.11 + rand() * 0.1, 0.06, 0.1 + rand() * 0.08], r: [0, rand() * 3, 0] });
      } else if (roll < 0.52 && z < -2.0) {
        // bleached driftwood twigs up the dry end of the beach
        twigs.push({ p: [x, 0.05, z], s: [0.06, 0.06, 0.5 + rand() * 0.4], r: [0, rand() * 3, Math.PI / 2] });
      }
    }
    return { shells, pebbles, twigs };
  }, []);

  return (
    <>
      <Instanced geo={GEO.sphereLow} m={mats.shell} items={shells} />
      <Instanced geo={GEO.sphereLow} m={mats.stone} items={pebbles} />
      <Instanced geo={GEO.cylLow} m={mats.wetSand} items={twigs} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// The tiki bar: a smooth thatched cone, a woven lantern, and a counter that looks stocked
// ---------------------------------------------------------------------------------------

function TikiBar({ mats }: { mats: Materials }) {
  const bottles = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(12);
    const colors = ["#8fd6a8", "#e8a84a", "#d96b6b", "#6fb2d9", "#c9a24a"];
    return Array.from({ length: 9 }, (_, i) => ({
      p: [-1.9 + i * 0.44, 1.62, -6.45] as [number, number, number],
      s: [0.13, 0.34 + rand() * 0.12, 0.13] as [number, number, number],
      color: colors[i % colors.length],
    }));
  }, []);

  // Thatch is drawn as smooth-shaded overlapping cones. The old version used flat-shaded panels
  // whose facets caught the low sun as hard black wedges.
  const thatchMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c79a4e", roughness: 1 }), []);
  useEffect(() => () => thatchMat.dispose(), [thatchMat]);

  return (
    <>
      {/* counter: bamboo front, driftwood top overhanging the stool side */}
      <B p={[-0.6, 0.55, -5.95]} s={[5.6, 1.1, 1.0]} m={mats.wood} cast recv />
      <B p={[-0.6, 1.14, -5.8]} s={[6.0, 0.12, 1.4]} m={mats.oak} cast recv />
      {Array.from({ length: 11 }, (_, i) => -3.2 + i * 0.52).map((x) => (
        <Cyl key={x} p={[x, 0.55, -5.46]} s={[0.17, 1.06, 0.17]} m={mats.bark} />
      ))}
      <B p={[-0.6, 1.42, -6.45]} s={[4.6, 0.08, 0.3]} m={mats.darkWood} />
      <Instanced geo={GEO.cylLow} m={mats.tintable} items={bottles} />

      {/* a cocktail with a paper umbrella, a coconut with a straw, and a jar of fruit */}
      <group position={[1.5, 1.2, -5.6]}>
        <Cyl p={[0, 0.16, 0]} s={[0.22, 0.32, 0.26]} m={mats.glass} />
        <Cyl p={[0, 0.14, 0]} s={[0.19, 0.24, 0.22]} m={mats.coral} />
        <Sph p={[0.06, 0.3, 0.04]} s={0.08} m={mats.mustard} />
        <Cyl p={[-0.07, 0.34, 0]} s={[0.02, 0.4, 0.02]} r={[0.2, 0, 0.25]} m={mats.white} />
        <Cone p={[0.09, 0.46, -0.02]} s={[0.26, 0.12, 0.26]} r={[0.1, 0, -0.3]} m={mats.blush} />
        <Cyl p={[0.09, 0.38, -0.02]} s={[0.015, 0.22, 0.015]} r={[0.1, 0, -0.3]} m={mats.oak} />
      </group>
      <group position={[0.6, 1.2, -5.5]}>
        <Sph p={[0, 0.2, 0]} s={[0.4, 0.38, 0.4]} m={mats.darkWood} cast />
        <Cyl p={[0, 0.39, 0]} s={[0.16, 0.04, 0.16]} m={mats.cream} />
        <Cyl p={[0.05, 0.52, 0]} s={[0.02, 0.32, 0.02]} r={[0, 0, -0.35]} m={mats.coral} />
      </group>
      <group position={[-2.6, 1.2, -5.6]}>
        <Cyl p={[0, 0.22, 0]} s={[0.36, 0.44, 0.36]} m={mats.glass} />
        <Cyl p={[0, 0.16, 0]} s={[0.3, 0.3, 0.3]} m={mats.mustard} />
        <Cyl p={[0, 0.45, 0]} s={[0.38, 0.05, 0.38]} m={mats.metal} />
      </group>
      <Cyl p={[0.4, 1.24, -6.05]} s={[0.4, 0.09, 0.4]} m={mats.shell} />
      {[
        [0.32, -6.02],
        [0.48, -6.08],
        [0.4, -5.94],
      ].map(([x, z], i) => (
        <Sph key={i} p={[x, 1.32, z]} s={0.11} m={i === 1 ? mats.mustard : mats.leafLight} />
      ))}

      {/* four bamboo posts and the thatched roof they hold up */}
      {[
        [-3.3, -6.6],
        [2.1, -6.6],
        [-3.3, -5.2],
        [2.1, -5.2],
      ].map(([x, z]) => (
        <Cyl key={String(x) + ":" + String(z)} p={[x, 1.45, z]} s={[0.17, 2.9, 0.17]} m={mats.bark} cast />
      ))}
      <Cone p={[0, 2.95, -5.9]} s={[7.0, 0.95, 5.4]} m={thatchMat} cast />
      <Cone p={[0, 3.5, -5.9]} s={[3.6, 0.7, 2.8]} m={thatchMat} cast />
      {/* a woven lantern at the apex, in scale with the hut (it used to be a giant glowing orb) */}
      <group position={[0, 2.62, -5.9]}>
        <Cyl p={[0, 0, 0]} s={[0.34, 0.36, 0.34]} m={mats.thatch} />
        <Cyl p={[0, 0, 0]} s={[0.26, 0.3, 0.26]} m={mats.bulb} />
        <Cyl p={[0, 0.2, 0]} s={[0.05, 0.16, 0.05]} m={mats.darkWood} />
      </group>
      {/* painted sign hanging off the front beam */}
      <B p={[-0.6, 2.5, -5.15]} s={[5.6, 0.14, 0.14]} m={mats.darkWood} />
      <B p={[-0.6, 2.14, -5.1]} s={[1.9, 0.48, 0.06]} m={mats.oak} />
      <B p={[-0.6, 2.14, -5.06]} s={[1.7, 0.32, 0.02]} m={mats.coral} />
      {[-0.3, 0.3].map((dx) => (
        <Cyl key={dx} p={[-0.6 + dx, 2.38, -5.1]} s={[0.02, 0.16, 0.02]} m={mats.metal} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// The pier: planks on posts that reach down into the basin, so nothing floats
// ---------------------------------------------------------------------------------------

function Pier({ mats }: { mats: Materials }) {
  const { planks, posts } = useMemo(() => {
    const planks: InstanceSpec[] = [];
    const posts: InstanceSpec[] = [];
    const width = PIER_MAX_X - PIER_MIN_X;
    const cx = (PIER_MIN_X + PIER_MAX_X) / 2;
    for (let z = 3.0; z <= PIER_END_Z; z += 0.34) {
      planks.push({ p: [cx, 0.13, z], s: [width, 0.06, 0.3] });
    }
    // Posts run from the deck down to the basin floor — over water they are full length.
    for (let z = 3.6; z <= PIER_END_Z; z += 1.1) {
      const bottom = z > SHORELINE_Z ? BASIN_Y : 0;
      const height = 0.13 - bottom;
      posts.push({ p: [PIER_MIN_X + 0.22, bottom + height / 2, z], s: [0.17, height, 0.17] });
      posts.push({ p: [PIER_MAX_X - 0.22, bottom + height / 2, z], s: [0.17, height, 0.17] });
    }
    return { planks, posts };
  }, []);

  return (
    <>
      <Instanced geo={GEO.box} m={mats.plankA} items={planks} cast recv />
      <Instanced geo={GEO.cylLow} m={mats.darkWood} items={posts} cast />
      {[PIER_MIN_X + 0.1, PIER_MAX_X - 0.1].map((x) => (
        <group key={x}>
          {[3.8, 5.4, 7.0].map((z) => (
            <Cyl key={z} p={[x, 0.38, z]} s={[0.12, 0.5, 0.12]} m={mats.darkWood} cast />
          ))}
          <B p={[x, 0.58, 5.4]} s={[0.05, 0.05, 3.4]} m={mats.cream} />
        </group>
      ))}
      <Cyl p={[1.35, 0.28, 7.6]} s={[0.3, 0.24, 0.3]} m={mats.metal} cast />
      <Cyl p={[3.1, 0.9, 6.8]} s={[0.03, 1.5, 0.03]} r={[-0.5, 0.3, 0]} m={mats.bark} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Sun loungers under a striped parasol
// ---------------------------------------------------------------------------------------

function LoungerSpot({ mats }: { mats: Materials }) {
  const canopy = useMemo<InstanceSpec[]>(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return {
          p: [Math.cos(a) * 0.95, 2.28, Math.sin(a) * 0.95] as [number, number, number],
          s: [1.3, 0.06, 0.78] as [number, number, number],
          r: [0.24, -a, 0] as [number, number, number],
          color: i % 2 ? "#f7f3ea" : "#e8705f",
        };
      }),
    []
  );

  return (
    <>
      <group position={[-7.0, 0, 2.1]}>
        <Cyl p={[0, 1.15, 0]} s={[0.1, 2.3, 0.1]} m={mats.oak} cast />
        <Instanced geo={GEO.box} m={mats.tintable} items={canopy} cast />
        <Cone p={[0, 2.46, 0]} s={[0.3, 0.2, 0.3]} m={mats.coral} />
      </group>
      {/* a towel spread on the sand and a drink beside it */}
      <B p={[-4.8, 0.045, 4.0]} s={[1.5, 0.02, 1.0]} r={[0, 0.3, 0]} m={mats.seaShallow} recv />
      <B p={[-4.8, 0.06, 4.0]} s={[1.2, 0.01, 0.2]} r={[0, 0.3, 0]} m={mats.white} />
      <Cyl p={[-4.0, 0.18, 3.3]} s={[0.18, 0.36, 0.18]} m={mats.glass} />
      <Cyl p={[-4.0, 0.14, 3.3]} s={[0.15, 0.24, 0.15]} m={mats.mustard} />
      {[-0.18, 0.18].map((dx) => (
        <B key={dx} p={[-7.6 + dx, 0.04, 3.7]} s={[0.22, 0.05, 0.5]} r={[0, 0.4 + dx, 0]} m={mats.coral} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Beach volleyball: two posts, a net of instanced strands, and a ball on the sand
// ---------------------------------------------------------------------------------------

function VolleyballCourt({ mats }: { mats: Materials }) {
  const net = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    const z0 = -3.6;
    const z1 = 0.0;
    const top = 1.75;
    const bottom = 1.05;
    for (let z = z0; z <= z1 + 0.001; z += 0.3) {
      out.push({ p: [-4.9, (top + bottom) / 2, z], s: [0.02, top - bottom, 0.02] });
    }
    for (let y = bottom; y <= top + 0.001; y += 0.175) {
      out.push({ p: [-4.9, y, (z0 + z1) / 2], s: [0.02, 0.02, z1 - z0] });
    }
    return out;
  }, []);

  const court = useMemo<InstanceSpec[]>(() => {
    // a rope marking the court, laid on the sand
    const out: InstanceSpec[] = [];
    const x0 = -7.4;
    const x1 = -2.4;
    const z0 = -3.6;
    const z1 = 0.0;
    out.push({ p: [(x0 + x1) / 2, 0.03, z0], s: [x1 - x0, 0.03, 0.05] });
    out.push({ p: [(x0 + x1) / 2, 0.03, z1], s: [x1 - x0, 0.03, 0.05] });
    out.push({ p: [x0, 0.03, (z0 + z1) / 2], s: [0.05, 0.03, z1 - z0] });
    out.push({ p: [x1, 0.03, (z0 + z1) / 2], s: [0.05, 0.03, z1 - z0] });
    return out;
  }, []);

  return (
    <>
      {[-3.6, 0.0].map((z) => (
        <Cyl key={z} p={[-4.9, 0.95, z]} s={[0.16, 1.9, 0.16]} m={mats.oak} cast />
      ))}
      <Instanced geo={GEO.box} m={mats.cream} items={net} />
      <Instanced geo={GEO.box} m={mats.white} items={court} />
      {/* the ball itself is live — see components/Volleyball.tsx */}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Palms: curved trunks of stacked segments, crowns of drooping fronds — none near the fire
// ---------------------------------------------------------------------------------------

const PALMS: { x: number; z: number; h: number; lean: number }[] = [
  { x: -8.2, z: -7.0, h: 3.6, lean: 0.16 },
  { x: 7.8, z: -5.8, h: 4.0, lean: -0.13 },
  { x: -8.4, z: -0.4, h: 3.2, lean: 0.1 },
  { x: 8.4, z: 0.6, h: 3.4, lean: -0.2 },
  { x: 3.4, z: -8.2, h: 3.0, lean: 0.22 },
  { x: -2.0, z: 2.6, h: 3.3, lean: 0.14 },
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
      <Instanced geo={GEO.cylLow} m={mats.bark} items={trunks} cast fadeRadius={0.9} />
      <Instanced geo={GEO.sphereLow} m={mats.palmLeaf} items={fronds} cast fadeRadius={1.4} />
      <Instanced geo={GEO.sphereLow} m={mats.darkWood} items={coconuts} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Clutter: surfboards leaning on a palm, a rowboat, a sandcastle safely on the sand
// ---------------------------------------------------------------------------------------

function BeachClutter({ mats }: { mats: Materials }) {
  return (
    <>
      {/* Two surfboards leaning against the palm by the loungers — upright and above the sand,
          replacing the pair that used to be sunk through it. */}
      <group position={[-8.0, 0, -0.9]} rotation={[0, 0.5, 0]}>
        {[
          [-0.26, mats.coral, 0.26],
          [0.26, mats.seaShallow, 0.34],
        ].map(([dx, m, lean], i) => (
          <group key={i} position={[dx as number, 0, 0]} rotation={[-0.12, 0, lean as number]}>
            <B p={[0, 1.1, 0]} s={[0.44, 2.0, 0.1]} m={m as THREE.Material} cast />
            <B p={[0, 1.1, 0.055]} s={[0.07, 1.7, 0.01]} m={mats.white} />
          </group>
        ))}
      </group>

      {/* a rowboat pulled up above the tideline */}
      <group position={[-2.6, 0, 1.0]} rotation={[0, -0.5, 0]}>
        <Sph p={[0, 0.26, 0]} s={[1.0, 0.52, 2.5]} m={mats.seaShallow} cast recv />
        <Sph p={[0, 0.34, 0]} s={[0.8, 0.44, 2.3]} m={mats.oak} />
        <B p={[0, 0.34, 0]} s={[0.78, 0.06, 0.3]} m={mats.darkWood} />
        <Cyl p={[0.5, 0.42, 0.3]} s={[0.06, 2.0, 0.06]} r={[0, 0.2, 1.5]} m={mats.oak} />
      </group>

      {/* Sandcastle, moved clear of the pier planks onto open sand. */}
      <group position={[5.4, 0, 3.4]}>
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
        {/* a bucket and spade beside it */}
        <Cyl p={[0.8, 0.14, 0.3]} s={[0.3, 0.28, 0.3]} m={mats.coral} cast />
        <Cyl p={[1.05, 0.24, 0.1]} s={[0.03, 0.5, 0.03]} r={[0.2, 0, 0.5]} m={mats.mustard} />
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
        return { p: [5.0 + Math.cos(a) * 0.75, 0.09, -1.0 + Math.sin(a) * 0.75], s: [0.3, 0.2, 0.26], r: [0, a, 0] };
      }),
    []
  );
  return (
    <>
      <Instanced geo={GEO.sphereLow} m={mats.stone} items={stones} recv />
      <Cyl p={[5.0, 0.02, -1.0]} s={[1.5, 0.01, 1.5]} m={mats.wetSand} />
      {[0.5, -0.5, 1.6].map((r) => (
        <Cyl key={r} p={[5.0, 0.17, -1.0]} s={[0.12, 0.8, 0.12]} r={[0, r, Math.PI / 2.4]} m={mats.darkWood} cast />
      ))}
      <B p={[6.9, 0.22, -2.0]} s={[0.7, 0.44, 0.45]} r={[0, 0.3, 0]} m={mats.seaShallow} cast />
      <B p={[6.9, 0.46, -2.0]} s={[0.74, 0.06, 0.49]} r={[0, 0.3, 0]} m={mats.white} />
      {[0, 1, 2].map((i) => (
        <Cyl key={i} p={[3.0 + i * 0.06, 0.12 + i * 0.2, -2.4]} s={[0.2, 0.9, 0.2]} r={[0, 0.3 * i, Math.PI / 2]} m={i % 2 ? mats.darkWood : mats.bark} cast />
      ))}
    </>
  );
}
