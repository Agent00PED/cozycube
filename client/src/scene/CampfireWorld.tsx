import { useContext, useEffect, useMemo, useRef } from "react";
import { TimeOfDayContext } from "./timeOfDay";
import { BRIDGE_DECK_Y, BRIDGE_HALF_LENGTH, FOREST_RADIUS, streamZ } from "@shared/collision";
import { BLANKET } from "@shared/props";
import { BLUFF, MAP_HALF } from "@shared/types";
import { CUSHIONS } from "@shared/seats";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cyl, GEO, HALF, Instanced, Sph, noMerge, noRaycast, seeded, type InstanceSpec, type Materials } from "./kit";

// A 28x28 forest valley: the grand campfire at its heart with the log ring and the stew pot, a
// stream across the front crossed by a plank bridge on the stone trail, tents pitched on the
// grass, a glamping clearing (hammock, sleeping mats, its own lantern) in the west, and a
// stargazing bluff rising in the north-east corner. The seats, lanterns and the stew pot are
// interactive props rendered elsewhere; this file draws everything static around them.

const CAMP_HALF = MAP_HALF.campfire_night;
const EDGE = CAMP_HALF - 0.3;
/** Past this you are in the trees (shared with the collision rules). */
const TREELINE = FOREST_RADIUS;
/** The glamping clearing's middle (hammock, mats and lantern gather round it). */
const GLAMP = { x: -7.8, z: -7.4 };

/** Centre line of the stream, which meanders across the front-left of the clearing. */
export { streamZ };

const TENTS: { x: number; z: number; color: string }[] = [
  { x: -5.6, z: -4.6, color: "#d97a4a" },
  { x: 5.4, z: -5.0, color: "#4a8ad9" },
  { x: -6.2, z: 2.6, color: "#5fa86a" },
  { x: -10.2, z: -4.4, color: "#d9c04a" }, // the glamping tent, out past the clearing
];

/** Keep procedural scatter off the paths, the water, the tents and the seating ring. */
function isClearZone(x: number, z: number, margin = 0): boolean {
  if (Math.abs(x) < 2.6 + margin && z > 4.6) return true; // stone trail + spawn
  if (Math.abs(z - streamZ(x)) < 1.5 + margin) return true; // the stream
  if (Math.hypot(x, z) < 4.6 + margin) return true; // fire, log ring and their approach points
  if (TENTS.some((t) => Math.hypot(x - t.x, z - t.z) < 2.2 + margin)) return true;
  if (Math.hypot(x - BLANKET.x, z - BLANKET.z) < 2.0 + margin) return true; // stargazing blanket
  if (Math.hypot(x - GLAMP.x, z - GLAMP.z) < 3.2 + margin) return true; // the glamping clearing
  if (Math.hypot(x - BLUFF.x, z - BLUFF.z) < BLUFF.radius + 1.2 + margin) return true; // the bluff
  if (Math.hypot(x + 4.2, z + 4.6) < 1.2 + margin) return true; // the path to the clearing
  if (Math.hypot(x - 6.0, z + 5.6) < 1.2 + margin) return true; // the path up to the bluff
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
      <Glamping mats={mats} />
      <Bluff mats={mats} />
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
    for (const ring of [TREELINE + 0.3, TREELINE + 1.0]) {
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
    // Saplings and boulders scattered through the valley for depth (never on the paths).
    for (let i = 0; i < 170; i++) {
      const a = rand() * Math.PI * 2;
      const r = 5.2 + rand() * 6.4;
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

    for (let i = 0; i < 700; i++) {
      const x = (rand() * 2 - 1) * (EDGE - 0.2);
      const z = (rand() * 2 - 1) * (EDGE - 0.2);
      if (Math.hypot(x, z) > TREELINE + 0.6) continue; // under the pines it is needles, not flowers
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
      // Glints stay out from under the bridge: a row of pale strokes glimpsed between the
      // planks read as a stray white grid in the water.
      const underBridge = Math.abs(x) < 1.3;
      const twinkle = underBridge ? 0 : 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      tmp.scale.set(0.2 * twinkle + 0.001, 0.01, 0.05 * twinkle + 0.001);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group userData={noMerge}>
      <mesh geometry={bank} material={mats.mud} receiveShadow raycast={noRaycast} />
      <mesh geometry={water} material={STREAM_WATER} renderOrder={2} raycast={noRaycast} />
      <instancedMesh ref={glintRef} args={[GEO.box, mats.bulb, glints.length]} frustumCulled={false} raycast={noRaycast} />
      {/* stepping stones a little downstream of the bridge, for the look of it */}
      {[-2.2, -1.5, -0.8].map((dx) => (
        <Cyl key={dx} p={[-4.2 + dx, 0.06, streamZ(-4.2 + dx)]} s={[0.66, 0.12, 0.54]} m={mats.stone} recv />
      ))}
      {/* two flat fishing stones on the near bank (river_seat_1/2 sit on the pierPlank cushion),
          each with a bait tin and a rod rest beside it */}
      {[
        [-4.6, 4.4],
        [3.6, 4.6],
      ].map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <Cyl p={[0, CUSHIONS.pierPlank.y, 0]} s={[1.3, CUSHIONS.pierPlank.h + 0.14, 1.1]} m={mats.stone} cast recv />
          <Cyl p={[0.75, 0.1, -0.2]} s={[0.22, 0.2, 0.22]} m={mats.rust} />
          <Cyl p={[-0.7, 0.35, 0.1]} s={[0.04, 0.7, 0.04]} r={[0.5, 0, 0.3]} m={mats.darkWood} />
        </group>
      ))}
    </group>
  );
}

// The trail comes in from the front, crosses the stream on a plank bridge, and reaches the fire.
function StoneTrail({ mats }: { mats: Materials }) {
  const stones = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(9);
    const out: InstanceSpec[] = [];
    for (let z = EDGE - 0.4; z > 3.4; z -= 0.6) {
      if (Math.abs(z - streamZ(Math.sin(z * 0.8) * 0.3)) < 1.3) continue; // the bridge spans this
      const x = Math.sin(z * 0.8) * 0.3;
      const s = 0.45 + rand() * 0.15;
      out.push({ p: [x, 0.04, z], s: [s, 0.05, s * 0.8], r: [0, rand() * 3, 0] });
    }
    // meandering side paths: west to the glamping clearing, north-east up to the bluff
    const branch = (from: [number, number], to: [number, number]) => {
      const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.62);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wobble = Math.sin(t * 9) * 0.25;
        const x = from[0] + (to[0] - from[0]) * t + wobble;
        const z = from[1] + (to[1] - from[1]) * t - wobble;
        const s = 0.4 + rand() * 0.14;
        out.push({ p: [x, 0.04, z], s: [s, 0.05, s * 0.8], r: [0, rand() * 3, 0] });
      }
    };
    branch([-3.4, -2.4], [-6.4, -6.0]);
    branch([3.4, -3.2], [7.6, -7.2]);
    return out;
  }, []);

  const bridgeZ = streamZ(0);
  // Plank tops sit exactly at BRIDGE_DECK_Y: the walk plane (walkY in shared/collision.ts)
  // lifts avatars onto that height, so feet stand ON the deck instead of through it.
  const planks = useMemo<InstanceSpec[]>(
    () => Array.from({ length: 9 }, (_, i) => ({ p: [0, BRIDGE_DECK_Y - 0.04, bridgeZ - 1.6 + i * 0.4] as [number, number, number], s: [1.7, 0.08, 0.34] as [number, number, number] })),
    [bridgeZ]
  );

  return (
    <>
      <Instanced geo={GEO.cylLow} m={mats.stone} items={stones} recv />
      {/* the bridge: deck, four posts and a rail on each side */}
      <Instanced geo={GEO.box} m={mats.plankA} items={planks} cast recv />
      {/* a short sloped board at each end, matching the ramp the walk plane climbs */}
      {[-1, 1].map((end) => (
        <B key={end} p={[0, BRIDGE_DECK_Y / 2 - 0.01, bridgeZ + end * (BRIDGE_HALF_LENGTH + 0.24)]} s={[1.5, 0.06, 0.56]} r={[end * 0.48, 0, 0]} m={mats.plankA} recv />
      ))}
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

// The tent doorway is a real porch: a Λ of canvas standing out from the pyramid's face, with a
// dark interior (the door opening lies back against the sloping canvas, the groundsheet runs
// out to the porch mouth), so the entrance has depth instead of being a triangle painted on.
type V = [number, number, number];
/** A double-sided triangle (both windings), for panels seen from either side. */
function tri2(out: number[], a: V, b: V, c: V) {
  out.push(...a, ...b, ...c, ...a, ...c, ...b);
}
function quad2(out: number[], a: V, b: V, c: V, d: V) {
  tri2(out, a, b, c);
  tri2(out, a, c, d);
}
function geoFrom(pos: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// Pyramid face: from z 0.74 at the ground to z 0 at the ridge (height 1.5), i.e. z = 0.74 * (1 - y / 1.5).
const faceZ = (y: number) => 0.74 * (1 - y / 1.5);
const PORCH = {
  ridgeBack: [0, 1.0, faceZ(1.0)] as V,
  ridgeFront: [0, 0.9, 1.18] as V,
  groundBack: (s: number) => [s * 0.46, 0.005, faceZ(0)] as V,
  groundFront: (s: number) => [s * 0.5, 0.005, 1.18] as V,
};
const PORCH_CANVAS = (() => {
  const pos: number[] = [];
  for (const s of [-1, 1]) quad2(pos, PORCH.ridgeBack, PORCH.ridgeFront, PORCH.groundFront(s), PORCH.groundBack(s));
  return geoFrom(pos);
})();
const PORCH_INSIDE = (() => {
  const pos: number[] = [];
  // the door opening, lying back against the sloping face
  tri2(pos, PORCH.ridgeBack, PORCH.groundBack(-1), PORCH.groundBack(1));
  // the groundsheet out to the mouth
  quad2(pos, PORCH.groundBack(-1), PORCH.groundBack(1), PORCH.groundFront(1), PORCH.groundFront(-1));
  return geoFrom(pos);
})();
const FLAP_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.3, 0);
  s.lineTo(0, 0.95);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.computeVertexNormals();
  return g;
})();
const TENT_INSIDE = new THREE.MeshBasicMaterial({ color: "#241f1b" });

/** A taut line from `from` to `to`: one thin cylinder, positioned and turned to span them. */
function Rope({ from, to, m, thick = 0.02 }: { from: V; to: V; m: THREE.Material; thick?: number }) {
  const { p, r, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    const mid = a.add(b).multiplyScalar(0.5);
    return { p: [mid.x, mid.y, mid.z] as V, r: [e.x, e.y, e.z] as V, len };
  }, [from, to]);
  return <Cyl p={p} s={[thick, len, thick]} r={r} m={m} />;
}
const STREAM_WATER = new THREE.MeshStandardMaterial({
  color: "#2f6480",
  emissive: "#0d2c3d",
  roughness: 0.12,
  metalness: 0.15,
  transparent: true,
  opacity: 0.88,
  depthWrite: false,
});

function Tent({ x, z, color, mats }: { x: number; z: number; color: string; mats: Materials }) {
  const canvas = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), [color]);
  // Door faces the fire.
  const rotY = Math.atan2(-x, -z);
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.pyramid} material={canvas} position={[0, 0.75, 0]} rotation={[0, Math.PI / 4, 0]} scale={[2.1, 1.5, 2.1]} castShadow receiveShadow raycast={noRaycast} />
      {/* the porch: a Λ of canvas standing proud of the face, dark inside, flaps tied back at
          its mouth, and its ridge staked down with a guy rope to a peg on each side */}
      <mesh geometry={PORCH_CANVAS} material={canvas} castShadow raycast={noRaycast} />
      <mesh geometry={PORCH_INSIDE} material={TENT_INSIDE} raycast={noRaycast} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh geometry={FLAP_GEO} material={canvas} position={[side * 0.5, 0.02, 1.18]} rotation={[0, side * 0.75, 0]} scale={[side, 0.92, 1]} castShadow raycast={noRaycast} />
          <Cyl p={[side * 0.42, 0.5, 1.24]} s={[0.035, 0.05, 0.035]} r={[0, 0, Math.PI / 2]} m={mats.cream} />
          <Rope from={[0, 0.9, 1.18]} to={[side * 1.15, 0.12, 1.75]} m={mats.cream} />
          <Cyl p={[side * 1.15, 0.07, 1.75]} s={[0.035, 0.16, 0.035]} r={[0.25, 0, side * -0.25]} m={mats.metal} />
          <Cyl p={[side * 1.15, 0.14, 1.74]} s={[0.07, 0.025, 0.07]} m={mats.metal} />
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
      {/* plaid picnic blanket — the "blanket_N" seats lie down here (BLANKET in shared/props.ts).
          Lying, a head goes a head-length behind the anchor, so the blanket sits well forward
          of the blue tent with the pillows along its back edge. */}
      <B p={[BLANKET.x, 0.06, BLANKET.z]} s={[2.2, 0.02, 1.7]} m={mats.rust} recv />
      {[-0.6, 0, 0.6].map((dx) => (
        <B key={`v${dx}`} p={[BLANKET.x + dx, 0.075, BLANKET.z]} s={[0.12, 0.01, 1.7]} m={mats.cream} />
      ))}
      {[-0.5, 0.3].map((dz) => (
        <B key={`h${dz}`} p={[BLANKET.x, 0.08, BLANKET.z + dz]} s={[2.2, 0.01, 0.12]} m={mats.mustard} />
      ))}
      {[-0.5, 0.5].map((dx) => (
        <Sph key={dx} p={[BLANKET.x + dx, 0.09, BLANKET.z - 0.62]} s={[0.52, 0.16, 0.32]} m={mats.cream} cast />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// The glamping clearing: a hammock slung between two posts, two sleeping mats, a lantern
// stump, bunting to the tent, and a stump table with mugs. The hammock and mats are seats.
// ---------------------------------------------------------------------------------------

function Glamping({ mats }: { mats: Materials }) {
  const posts: [number, number][] = [
    [-9.6, -8.6],
    [-7.0, -8.6],
  ];
  const sling = CUSHIONS.hammock; // the seat anchor is derived from this
  const mat = CUSHIONS.sleepingMat;
  const bunting = useMemo<InstanceSpec[]>(() => {
    // little flags strung from the west hammock post to the tent's ridge
    const from = new THREE.Vector3(-9.6, 1.9, -8.6);
    const to = new THREE.Vector3(-10.2, 1.5, -4.9);
    const colors = ["#e0a93b", "#c4714a", "#7d9471", "#e3b3a3"];
    return Array.from({ length: 9 }, (_, i) => {
      const t = (i + 0.5) / 9;
      const p = from.clone().lerp(to, t);
      p.y -= Math.sin(t * Math.PI) * 0.35; // the string sags
      return { p: [p.x, p.y - 0.12, p.z] as [number, number, number], s: [0.16, 0.2, 0.02] as [number, number, number], r: [Math.PI, 0.3, 0] as [number, number, number], color: colors[i % colors.length] };
    });
  }, []);
  return (
    <>
      {/* a worn patch of ground marks the clearing */}
      <Cyl p={[GLAMP.x, 0.006, GLAMP.z]} s={[6.0, 0.01, 5.2]} m={mats.mud} recv />
      {/* the hammock: two posts, the ropes, and the canvas sling between them */}
      {posts.map(([x, z]) => (
        <Cyl key={x} p={[x, 0.95, z]} s={[0.2, 1.9, 0.2]} m={mats.darkWood} cast />
      ))}
      <B p={[-8.3, sling.y, -8.6]} s={[2.0, sling.h, 0.9]} r={[0, 0, 0]} m={mats.cream} cast recv />
      <B p={[-8.3, sling.y + 0.02, -8.6]} s={[1.6, 0.02, 0.8]} m={mats.sage} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Cyl p={[-8.3 + side * 1.15, 1.2, -8.6]} s={[0.03, 1.15, 0.03]} r={[0, 0, side * 0.62]} m={mats.cream} />
          <Cyl p={[-8.3 + side * 0.85, sling.y + 0.06, -8.6]} s={[0.05, 0.05, 0.94]} r={[Math.PI / 2, 0, 0]} m={mats.darkWood} />
        </group>
      ))}
      {/* two sleeping mats with a rolled pillow at the head end (heads lie to the west) */}
      {[-8.4, -7.0].map((z) => (
        <group key={z}>
          <B p={[-6.2, mat.y, z]} s={[1.9, mat.h, 0.9]} m={z < -8 ? mats.navy : mats.terracotta} recv />
          <B p={[-6.2, mat.y + 0.035, z]} s={[1.7, 0.01, 0.7]} m={mats.cream} />
          <Cyl p={[-7.0, mat.y + 0.1, z]} s={[0.22, 0.6, 0.22]} r={[Math.PI / 2, 0, 0]} m={mats.blush} />
        </group>
      ))}
      {/* the lantern stump (the lantern itself is the "lantern_glamp" prop) and a stump table */}
      <Cyl p={[-8.0, 0.2, -6.6]} s={[0.62, 0.4, 0.62]} m={mats.bark} cast recv />
      <Cyl p={[-8.0, 0.405, -6.6]} s={[0.58, 0.01, 0.58]} m={mats.oak} />
      <group position={[-9.0, 0, -7.6]}>
        <Cyl p={[0, 0.24, 0]} s={[0.7, 0.48, 0.7]} m={mats.bark} cast />
        <Cyl p={[0, 0.485, 0]} s={[0.66, 0.01, 0.66]} m={mats.oak} />
        <Cyl p={[-0.15, 0.56, 0.05]} s={[0.14, 0.14, 0.14]} m={mats.white} />
        <Cyl p={[0.14, 0.56, -0.1]} s={[0.14, 0.14, 0.14]} m={mats.sage} />
        <B p={[0.05, 0.53, 0.2]} s={[0.26, 0.06, 0.2]} m={mats.rust} />
      </group>
      <Instanced geo={GEO.pyramid} m={mats.tintable} items={bunting} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// The stargazing bluff: a grassy knoll in the north-east corner (walkY lifts you onto it),
// with the telescope on top, a cairn, and boulders round the rim. Its two camp chairs are seats.
// ---------------------------------------------------------------------------------------

function Bluff({ mats }: { mats: Materials }) {
  const r = BLUFF.radius;
  return (
    <group position={[BLUFF.x, 0, BLUFF.z]}>
      {/* the mound: a tapered drum with a flat grassy top, the slope matching the walk ramp */}
      <mesh geometry={GEO.cylTaper} material={mats.pineLight} position={[0, BLUFF.height / 2, 0]} scale={[(r + 0.9) * 2, BLUFF.height, (r + 0.9) * 2]} receiveShadow raycast={noRaycast} />
      <Cyl p={[0, BLUFF.height + 0.004, 0]} s={[(r - 0.1) * 2, 0.01, (r - 0.1) * 2]} m={mats.leaf} recv />
      {/* boulders round the rim, and a little cairn */}
      {[
        [2.0, 1.0, 0.9],
        [-1.6, 1.9, 0.7],
        [1.2, -2.2, 0.8],
        [-2.3, -0.8, 0.6],
      ].map(([x, z, s], i) => (
        <Sph key={i} p={[x, BLUFF.height + s * 0.2, z]} s={[s, s * 0.6, s * 0.8]} r={[0, i, 0]} m={mats.stone} cast recv low />
      ))}
      {[0.32, 0.24, 0.16].map((s, i) => (
        <Sph key={s} p={[-0.9, BLUFF.height + 0.1 + i * 0.2, 1.4]} s={[s, s * 0.7, s]} m={mats.stone} low />
      ))}
      {/* the telescope on its tripod, aimed up over the valley's edge */}
      <group position={[0, BLUFF.height, -0.6]} rotation={[0, -0.9, 0]}>
        {[0, 1, 2].map((i) => (
          <Cyl key={i} p={[Math.cos(i * 2.09) * 0.2, 0.5, Math.sin(i * 2.09) * 0.2]} s={[0.03, 1.05, 0.03]} r={[Math.sin(i * 2.09) * 0.35, 0, -Math.cos(i * 2.09) * 0.35]} m={mats.black} />
        ))}
        <Cyl p={[0, 1.1, -0.1]} s={[0.12, 0.9, 0.12]} r={[-0.9, 0.3, 0]} m={mats.brass} cast />
      </group>
      {/* a folded star chart and a thermos on the grass between the chairs */}
      <B p={[-0.5, BLUFF.height + 0.02, 1.0]} s={[0.5, 0.01, 0.36]} r={[0, 0.4, 0]} m={mats.cream} />
      <Cyl p={[-0.1, BLUFF.height + 0.16, 0.6]} s={[0.16, 0.32, 0.16]} m={mats.navy} />
    </group>
  );
}

const FIREFLY_COUNT = 44;

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
      radius: 2.8 + rand() * 9.0,
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
