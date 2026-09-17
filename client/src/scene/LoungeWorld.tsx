import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cone, Cyl, FloorPatch, GEO, HALF, Instanced, Rug, Sph, arcGeo, noMerge, noRaycast, ringGeo, seeded, type InstanceSpec, type Materials } from "./kit";

// An 18x18 penthouse: four zones packed close enough that the whole room reads at a glance and
// nobody is more than a few seconds' walk from anyone else. Coordinates match
// shared/collision.ts and shared/props.ts — when something moves here, its obstacle box and any
// approach point that passes it must move too (scripts/checklayout.ts checks the latter).
//
// The camera looks from +X/+Z, so the two walls stand along x = -HALF (screen left) and
// z = -HALF (screen right), and the front of the room (+X/+Z) stays open.
const WALL_HEIGHT = 3.1;

export function LoungeWorld({ mats, wallColor }: { mats: Materials; wallColor: string }) {
  return (
    <>
      <Shell mats={mats} wallColor={wallColor} />
      <LivingRoom mats={mats} />
      <KitchenBar mats={mats} />
      <GamerCorner mats={mats} />
      <BalconyDeck mats={mats} />
      <CushionCircle mats={mats} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Shell: two walls, trim, and the floor zoning that tells each area apart at a glance.
// ---------------------------------------------------------------------------------------

function Shell({ mats, wallColor }: { mats: Materials; wallColor: string }) {
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95 }), [wallColor]);
  useEffect(() => () => wallMat.dispose(), [wallMat]);
  return (
    <>
      <mesh
        geometry={GEO.plane}
        material={wallMat}
        position={[0, WALL_HEIGHT / 2, -HALF]}
        scale={[HALF * 2, WALL_HEIGHT, 1]}
        receiveShadow
        raycast={noRaycast}
      />
      <mesh
        geometry={GEO.plane}
        material={wallMat}
        position={[-HALF, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[HALF * 2, WALL_HEIGHT, 1]}
        receiveShadow
        raycast={noRaycast}
      />
      {/* skirting boards + crown moulding */}
      <B p={[0, 0.08, -HALF + 0.05]} s={[HALF * 2, 0.16, 0.1]} m={mats.white} />
      <B p={[-HALF + 0.05, 0.08, 0]} s={[0.1, 0.16, HALF * 2]} m={mats.white} />
      <B p={[0, WALL_HEIGHT - 0.06, -HALF + 0.06]} s={[HALF * 2, 0.12, 0.12]} m={mats.white} />
      <B p={[-HALF + 0.06, WALL_HEIGHT - 0.06, 0]} s={[0.12, 0.12, HALF * 2]} m={mats.white} />

      {/* zone floors, a hair above the slab so overlaps never z-fight */}
      <FloorPatch x0={0.6} x1={HALF} z0={-HALF} z1={-4.9} y={0.006} m={mats.tile} />
      <FloorPatch x0={-HALF} x1={-4.4} z0={-HALF} z1={-4.4} y={0.006} m={mats.denCarpet} />

      {/* gallery wall + a clock showing real local time */}
      <WallFrame x={-HALF + 0.03} y={1.95} z={-1.2} w={0.75} h={0.95} art={mats.terracotta} mats={mats} onLeftWall />
      <WallFrame x={-HALF + 0.03} y={2.2} z={0.1} w={0.55} h={0.55} art={mats.sage} mats={mats} onLeftWall />
      <WallFrame x={-HALF + 0.03} y={1.5} z={0.1} w={0.55} h={0.42} art={mats.mustard} mats={mats} onLeftWall />
      <WallClock x={-HALF + 0.04} y={2.0} z={1.5} mats={mats} />
      <PottedPlant x={-8.4} z={-8.4} mats={mats} kind="monstera" scale={0.9} />
    </>
  );
}

function WallFrame({
  x,
  y,
  z,
  w,
  h,
  art,
  mats,
  onLeftWall = false,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  art: THREE.Material;
  mats: Materials;
  onLeftWall?: boolean;
}) {
  // Back-wall frames face +Z; left-wall frames are turned to face +X into the room.
  return (
    <group position={[x, y, z]} rotation={[0, onLeftWall ? Math.PI / 2 : 0, 0]}>
      <B p={[0, 0, 0.02]} s={[w, h, 0.04]} m={mats.walnut} />
      <B p={[0, 0, 0.045]} s={[w - 0.1, h - 0.1, 0.01]} m={art} />
    </group>
  );
}

function WallClock({ x, y, z, mats }: { x: number; y: number; z: number; mats: Materials }) {
  const hourRef = useRef<THREE.Mesh>(null);
  const minuteRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const now = new Date();
    const minutes = now.getMinutes() + now.getSeconds() / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    if (minuteRef.current) minuteRef.current.rotation.z = -(minutes / 60) * Math.PI * 2;
    if (hourRef.current) hourRef.current.rotation.z = -(hours / 12) * Math.PI * 2;
  });
  // The hands turn every frame, so the clock stays out of the static batch.
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI / 2, 0]} userData={noMerge}>
      <Cyl p={[0, 0, 0.03]} s={[0.55, 0.05, 0.55]} r={[Math.PI / 2, 0, 0]} m={mats.walnut} />
      <Cyl p={[0, 0, 0.06]} s={[0.46, 0.02, 0.46]} r={[Math.PI / 2, 0, 0]} m={mats.cream} />
      <mesh ref={hourRef} position={[0, 0, 0.08]} raycast={noRaycast}>
        <mesh geometry={GEO.box} material={mats.black} position={[0, 0.06, 0]} scale={[0.025, 0.12, 0.01]} raycast={noRaycast} />
      </mesh>
      <mesh ref={minuteRef} position={[0, 0, 0.085]} raycast={noRaycast}>
        <mesh geometry={GEO.box} material={mats.black} position={[0, 0.09, 0]} scale={[0.015, 0.18, 0.01]} raycast={noRaycast} />
      </mesh>
    </group>
  );
}

export function PottedPlant({
  x,
  z,
  mats,
  kind = "fig",
  scale = 1,
}: {
  x: number;
  z: number;
  mats: Materials;
  kind?: "fig" | "snake" | "olive" | "fern" | "monstera";
  scale?: number;
}) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <Cyl p={[0, 0.26, 0]} s={[0.62, 0.52, 0.62]} m={mats.terracotta} cast recv />
      {/* The soil never casts: it sits down inside the pot, so its only shadow is acne on the rim. */}
      <Cyl p={[0, 0.51, 0]} s={[0.56, 0.02, 0.56]} m={mats.dirt} />
      {kind === "fig" && (
        <>
          <Cyl p={[0, 1.0, 0]} s={[0.07, 1.0, 0.07]} m={mats.bark} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Sph key={i} p={[Math.sin(i * 1.9) * 0.28, 1.25 + (i % 3) * 0.28, Math.cos(i * 1.9) * 0.28]} s={[0.42, 0.36, 0.2]} r={[0.4, i, 0]} m={i % 2 ? mats.leaf : mats.leafLight} cast />
          ))}
        </>
      )}
      {kind === "snake" &&
        [0, 1, 2, 3, 4].map((i) => (
          <B key={i} p={[Math.sin(i * 2.4) * 0.12, 0.85, Math.cos(i * 2.4) * 0.12]} s={[0.1, 0.7 + (i % 2) * 0.25, 0.03]} r={[Math.sin(i) * 0.15, i * 1.2, Math.cos(i) * 0.12]} m={i % 2 ? mats.leaf : mats.sageDark} cast />
        ))}
      {kind === "olive" && (
        <>
          <Cyl p={[0, 1.05, 0]} s={[0.09, 1.1, 0.09]} m={mats.bark} />
          <Sph p={[0, 1.75, 0]} s={[0.9, 0.62, 0.9]} m={mats.olive} cast />
          <Sph p={[0.28, 1.55, 0.15]} s={[0.55, 0.42, 0.55]} m={mats.olive} cast />
          <Sph p={[-0.25, 1.5, -0.1]} s={[0.5, 0.38, 0.5]} m={mats.olive} cast />
        </>
      )}
      {kind === "fern" &&
        [0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Sph key={i} p={[Math.cos(i * 0.9) * 0.24, 0.7, Math.sin(i * 0.9) * 0.24]} s={[0.55, 0.16, 0.22]} r={[0, -i * 0.9, 0.45]} m={i % 2 ? mats.leafLight : mats.leaf} cast />
        ))}
      {kind === "monstera" &&
        [0, 1, 2, 3, 4].map((i) => (
          <Sph key={i} p={[Math.sin(i) * 0.18, 0.95 + i * 0.16, Math.cos(i) * 0.18]} s={[0.36, 0.5, 0.1]} r={[0.3, i, 0.2]} m={i % 2 ? mats.leaf : mats.leafLight} cast />
        ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Zone 1 — Living room (back centre): L-sofa facing the wall TV over a big rug
// ---------------------------------------------------------------------------------------

function LivingRoom({ mats }: { mats: Materials }) {
  return (
    <>
      <Rug x={-2.1} z={-5.6} radius={3.0} y={0.06} m={mats.cream} />
      {[1.2, 2.1, 2.8].map((r, i) => (
        <mesh key={r} geometry={ringGeo(r - 0.05, r)} material={i === 1 ? mats.blush : mats.white} position={[-2.1, 0.072, -5.6]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} />
      ))}

      {/* media console under the TV (the screen itself is the "tv" prop) */}
      <B p={[-2.1, 0.3, -8.55]} s={[3.6, 0.6, 0.8]} m={mats.walnut} cast recv />
      {[-3.0, -2.1, -1.2].map((x) => (
        <B key={x} p={[x, 0.3, -8.14]} s={[0.8, 0.46, 0.02]} m={mats.darkWood} />
      ))}
      <B p={[-2.1, 0.64, -8.45]} s={[1.9, 0.1, 0.14]} m={mats.black} />
      <Cyl p={[-0.8, 0.72, -8.5]} s={[0.2, 0.22, 0.2]} m={mats.blush} />
      <PottedPlant x={-4.6} z={-8.4} mats={mats} kind="snake" scale={0.7} />
      <WallFrame x={0.9} y={1.85} z={-HALF + 0.02} w={0.85} h={1.1} art={mats.rust} mats={mats} />

      {/* L-sofa — long run faces -Z toward the TV, backrest on its +Z edge */}
      <B p={[-2.1, 0.21, -4.2]} s={[4.4, 0.42, 1.1]} m={mats.sage} cast recv />
      <B p={[-2.1, 0.58, -3.74]} s={[4.4, 0.75, 0.2]} m={mats.sageDark} cast recv />
      <B p={[0.0, 0.44, -4.2]} s={[0.2, 0.46, 1.1]} m={mats.sageDark} cast />
      {/* return leg faces +X, backrest on its -X edge */}
      <B p={[-4.7, 0.21, -5.85]} s={[1.1, 0.42, 2.2]} m={mats.sage} cast recv />
      <B p={[-5.16, 0.58, -5.55]} s={[0.2, 0.75, 2.8]} m={mats.sageDark} cast recv />
      {[-3.5, -2.1, -0.7].map((x) => (
        <B key={x} p={[x, 0.46, -4.24]} s={[1.32, 0.1, 0.92]} m={mats.sage} />
      ))}
      <B p={[-4.7, 0.46, -5.7]} s={[0.92, 0.1, 1.3]} m={mats.sage} />
      {[
        [-3.9, -3.95, mats.mustard],
        [-0.5, -3.95, mats.terracotta],
      ].map(([x, z, m], i) => (
        <B key={i} p={[x as number, 0.64, z as number]} s={[0.38, 0.38, 0.13]} r={[-0.2, 0, (i - 0.5) * 0.2]} m={m as THREE.Material} cast />
      ))}
      <B p={[-4.9, 0.6, -4.6]} s={[0.45, 0.05, 0.8]} r={[0, 0.4, 0.5]} m={mats.rust} />

      {/* marble coffee table + tabletop styling */}
      <B p={[-2.1, 0.4, -6.3]} s={[2.1, 0.08, 0.9]} m={mats.marble} cast recv />
      <B p={[-2.1, 0.18, -6.3]} s={[1.7, 0.36, 0.6]} m={mats.walnut} cast />
      <B p={[-2.6, 0.46, -6.3]} s={[0.6, 0.04, 0.4]} m={mats.brass} />
      <Cyl p={[-2.72, 0.52, -6.34]} s={[0.1, 0.1, 0.1]} m={mats.white} />
      <Cyl p={[-2.46, 0.52, -6.22]} s={[0.1, 0.1, 0.1]} m={mats.terracotta} />
      <Cyl p={[-1.5, 0.5, -6.4]} s={[0.12, 0.12, 0.12]} m={mats.warmGlow} />
      <B p={[-1.8, 0.47, -6.16]} s={[0.32, 0.06, 0.24]} m={mats.navy} r={[0, 0.3, 0]} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Zone 2 — Kitchen bar (back right): counter run, coffee machine, island with stools
// ---------------------------------------------------------------------------------------

function KitchenBar({ mats }: { mats: Materials }) {
  return (
    <>
      {/* back counter run: base cabinets, marble worktop, door fronts */}
      <B p={[4.3, 0.45, -8.55]} s={[6.4, 0.9, 0.8]} m={mats.cream} cast recv />
      <B p={[4.3, 0.93, -8.55]} s={[6.5, 0.06, 0.85]} m={mats.marble} cast recv />
      {Array.from({ length: 7 }, (_, i) => 1.5 + i * 0.92).map((x) => (
        <group key={x}>
          <B p={[x, 0.46, -8.14]} s={[0.82, 0.76, 0.02]} m={mats.white} />
          <B p={[x + 0.29, 0.62, -8.12]} s={[0.03, 0.18, 0.03]} m={mats.brass} />
        </group>
      ))}
      {/* sink + gooseneck faucet */}
      <B p={[5.6, 0.95, -8.5]} s={[0.9, 0.03, 0.5]} m={mats.metal} />
      <Cyl p={[5.6, 1.14, -8.8]} s={[0.05, 0.38, 0.05]} m={mats.brass} />
      <mesh geometry={GEO.torus} material={mats.brass} position={[5.6, 1.33, -8.68]} rotation={[0, Math.PI / 2, 0]} scale={[0.24, 0.24, 0.5]} raycast={noRaycast} />
      {/* fridge at the end of the run */}
      <B p={[7.7, 1.0, -8.5]} s={[1.3, 2.0, 0.85]} m={mats.white} cast recv />
      <B p={[7.7, 1.3, -8.07]} s={[1.26, 0.02, 0.02]} m={mats.metal} />
      <B p={[7.2, 1.66, -8.05]} s={[0.04, 0.38, 0.04]} m={mats.metal} />
      <B p={[7.2, 0.85, -8.05]} s={[0.04, 0.46, 0.04]} m={mats.metal} />
      {/* upper cabinets, open shelf, chalkboard menu */}
      <B p={[1.9, 2.3, -8.77]} s={[2.4, 0.7, 0.4]} m={mats.cream} cast />
      <B p={[4.0, 2.05, -8.8]} s={[0.9, 0.04, 0.28]} m={mats.oak} />
      {[3.7, 4.0, 4.3].map((x, i) => (
        <Cyl key={x} p={[x, 2.13, -8.79]} s={[0.12, 0.13, 0.12]} m={i === 1 ? mats.terracotta : mats.white} />
      ))}
      <B p={[6.4, 2.35, -8.92]} s={[1.1, 0.65, 0.04]} m={mats.charcoal} />
      {[0.11, 0, -0.11].map((dy, i) => (
        <B key={dy} p={[6.3 - i * 0.05, 2.4 + dy, -8.89]} s={[0.66 - i * 0.14, 0.025, 0.01]} m={mats.cream} />
      ))}
      {/* window over the sink */}
      <group position={[5.6, 2.1, -HALF + 0.02]}>
        <B p={[0, 0, 0]} s={[1.9, 1.2, 0.02]} m={mats.warmGlow} />
        <B p={[0, 0, 0.02]} s={[0.05, 1.22, 0.03]} m={mats.white} />
        <B p={[0, 0, 0.02]} s={[1.92, 0.05, 0.03]} m={mats.white} />
        <B p={[0, -0.65, 0.08]} s={[2.1, 0.06, 0.2]} m={mats.white} />
      </group>

      {/* island with butcher-block top overhanging the bar side */}
      <B p={[4.8, 0.45, -5.7]} s={[3.6, 0.9, 1.2]} m={mats.walnut} cast recv />
      <B p={[4.8, 0.94, -5.55]} s={[3.9, 0.08, 1.55]} m={mats.oak} cast recv />
      <Cyl p={[3.6, 1.03, -5.9]} s={[0.42, 0.1, 0.42]} m={mats.white} />
      {[
        [3.52, -5.88, mats.mustard],
        [3.68, -5.94, mats.rust],
        [3.6, -5.78, mats.leafLight],
      ].map(([x, z, m], i) => (
        <Sph key={i} p={[x as number, 1.12, z as number]} s={0.12} m={m as THREE.Material} />
      ))}
      <Cyl p={[5.0, 1.0, -5.9]} s={[0.36, 0.04, 0.36]} m={mats.white} />
      <Sph p={[5.0, 1.11, -5.9]} s={[0.32, 0.3, 0.32]} m={mats.glass} />
      <Sph p={[5.0, 1.05, -5.9]} s={[0.16, 0.09, 0.16]} m={mats.mustard} />
      <B p={[6.0, 0.99, -5.95]} s={[0.55, 0.03, 0.32]} m={mats.wood} />

      {/* pendant lights over the island (emissive only — real lights are budgeted) */}
      {[3.9, 4.8, 5.7].map((x) => (
        <group key={x}>
          <Cyl p={[x, 2.75, -5.6]} s={[0.015, 0.7, 0.015]} m={mats.black} />
          <Cone p={[x, 2.3, -5.6]} s={[0.38, 0.24, 0.38]} m={mats.black} />
          <Sph p={[x, 2.2, -5.6]} s={0.13} m={mats.bulb} />
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Zone 3 — Gamer corner (back left): streamer desk on the wall, two arcade cabinets
// ---------------------------------------------------------------------------------------

function GamerCorner({ mats }: { mats: Materials }) {
  return (
    <>
      {/* desk runs along the left wall, screens facing into the room */}
      <group position={[-8.35, 0, -6.4]} rotation={[0, Math.PI / 2, 0]}>
        <B p={[0, 0.62, 0]} s={[2.6, 0.08, 1.0]} m={mats.charcoal} cast recv />
        {[-1.2, 1.2].map((lx) => (
          <B key={lx} p={[lx, 0.31, 0.3]} s={[0.08, 0.62, 0.08]} m={mats.black} cast />
        ))}
        <B p={[0, 0.575, 0.48]} s={[2.5, 0.02, 0.02]} m={mats.neonPink} />
        <B p={[0, 0.667, 0.12]} s={[1.2, 0.004, 0.45]} m={mats.neonPink} />
        <B p={[0, 0.69, 0.12]} s={[0.9, 0.04, 0.28]} m={mats.black} />
        <Sph p={[0.58, 0.69, 0.15]} s={[0.1, 0.05, 0.13]} m={mats.black} />
        {[-0.55, 0.3].map((mx) => (
          <group key={mx}>
            <B p={[mx, 0.96, -0.28]} s={[0.72, 0.42, 0.04]} m={mats.screenGlow} cast />
            <B p={[mx, 0.76, -0.31]} s={[0.05, 0.2, 0.05]} m={mats.black} />
          </group>
        ))}
        <mesh geometry={GEO.torus} material={mats.neonCyan} position={[-1.1, 1.3, -0.24]} scale={[0.42, 0.42, 0.42]} raycast={noRaycast} />
        <Cyl p={[-1.1, 0.92, -0.24]} s={[0.03, 0.56, 0.03]} m={mats.black} />
        <Cyl p={[1.05, 0.88, 0.18]} s={[0.03, 0.4, 0.03]} m={mats.black} r={[0.5, 0, 0]} />
        <Sph p={[1.05, 1.05, 0.28]} s={[0.1, 0.15, 0.1]} m={mats.charcoal} />
        <B p={[1.1, 0.3, -0.22]} s={[0.4, 0.6, 0.55]} m={mats.black} cast />
        <B p={[1.1, 0.3, 0.06]} s={[0.34, 0.52, 0.01]} m={mats.neonPink} />
      </group>

      {/* neon "GG" sign above the desk */}
      <group position={[-HALF + 0.05, 2.35, -6.4]} rotation={[0, Math.PI / 2, 0]}>
        <B p={[0, 0, 0]} s={[1.9, 0.85, 0.03]} m={mats.black} />
        {[-0.4, 0.4].map((x) => (
          <group key={x} position={[x, 0, 0.05]}>
            <mesh geometry={arcGeo(0.25, 0.032, Math.PI * 1.55)} material={mats.neonPink} rotation={[0, 0, Math.PI * 0.45]} raycast={noRaycast} />
            <B p={[0.11, -0.02, 0]} s={[0.22, 0.055, 0.055]} m={mats.neonPink} />
          </group>
        ))}
      </group>

      {/* posters above the arcade cabinets */}
      <WallFrame x={-6.6} y={2.5} z={-HALF + 0.02} w={0.6} h={0.4} art={mats.neonCyan} mats={mats} />
      <WallFrame x={-5.2} y={2.5} z={-HALF + 0.02} w={0.6} h={0.4} art={mats.neonPink} mats={mats} />

      {/* snack table between the cabinets and the sofa */}
      <Cyl p={[-6.0, 0.18, -6.2]} s={[0.5, 0.36, 0.5]} m={mats.charcoal} cast />
      <Cyl p={[-6.0, 0.39, -6.2]} s={[0.3, 0.08, 0.3]} m={mats.white} />
      <Sph p={[-6.0, 0.44, -6.2]} s={[0.24, 0.08, 0.24]} m={mats.mustard} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Zone 4 — Balcony deck (front right): planks, railing, loungers, festoon lights
// ---------------------------------------------------------------------------------------

const DECK = { x0: 4.2, x1: 8.4, z0: -0.6, z1: 8.4 };

function BalconyDeck({ mats }: { mats: Materials }) {
  // Staggered planks, two wood tones, one draw call.
  const planks = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(42);
    const out: InstanceSpec[] = [];
    const rowDepth = 0.32;
    for (let row = 0, z = DECK.z0 + rowDepth / 2; z < DECK.z1; row++, z += rowDepth) {
      let x = DECK.x0 - (row % 2) * 0.7;
      while (x < DECK.x1) {
        const len = 1.1 + rand() * 0.7;
        const x0 = Math.max(x, DECK.x0);
        const x1 = Math.min(x + len, DECK.x1);
        if (x1 - x0 > 0.1) {
          out.push({ p: [(x0 + x1) / 2, 0.03, z], s: [x1 - x0 - 0.02, 0.012, rowDepth - 0.02], color: rand() < 0.5 ? "#b98552" : "#a8743f" });
        }
        x += len;
      }
    }
    return out;
  }, []);

  // Festoon bulbs strung high enough to clear everyone's head (y >= 2.3), each swag carrying
  // its own dark cable so the lights never look like they are floating unsupported.
  const { bulbs, cables } = useMemo(() => {
    const posts: [number, number][] = [
      [4.4, -0.4],
      [8.2, -0.4],
      [8.2, 8.2],
      [4.4, 8.2],
    ];
    const bulbs: InstanceSpec[] = [];
    const cables: InstanceSpec[] = [];
    const TOP = 2.85;
    for (let i = 0; i < posts.length; i++) {
      const [ax, az] = posts[i];
      const [bx, bz] = posts[(i + 1) % posts.length];
      const n = 12;
      const at = (t: number): [number, number, number] => [ax + (bx - ax) * t, TOP - Math.sin(t * Math.PI) * 0.35, az + (bz - az) * t];
      for (let k = 1; k < n; k++) bulbs.push({ p: at(k / n), s: [0.1, 0.13, 0.1] });
      for (let k = 0; k < n; k++) {
        const a = at(k / n);
        const b = at((k + 1) / n);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        cables.push({
          p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.07, (a[2] + b[2]) / 2],
          s: [0.022, 0.022, len],
          r: [Math.asin((b[1] - a[1]) / len), Math.atan2(b[0] - a[0], b[2] - a[2]), 0],
        });
      }
    }
    return { bulbs, cables };
  }, []);

  const railPosts = useMemo<InstanceSpec[]>(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        p: [8.5, 0.5, DECK.z0 + 0.4 + i * 1.15] as [number, number, number],
        s: [0.08, 1.0, 0.08] as [number, number, number],
      })),
    []
  );

  return (
    <>
      <Instanced geo={GEO.box} m={mats.tintable} items={planks} recv />
      {/* a low step up onto the deck, read from the trim along its inner edges */}
      <B p={[DECK.x0, 0.03, (DECK.z0 + DECK.z1) / 2]} s={[0.08, 0.06, DECK.z1 - DECK.z0]} m={mats.walnut} />
      <B p={[(DECK.x0 + DECK.x1) / 2, 0.03, DECK.z0]} s={[DECK.x1 - DECK.x0, 0.06, 0.08]} m={mats.walnut} />

      {/* glass railing along the island's edge */}
      <Instanced geo={GEO.box} m={mats.walnut} items={railPosts} />
      <B p={[8.5, 1.02, (DECK.z0 + DECK.z1) / 2]} s={[0.12, 0.06, DECK.z1 - DECK.z0]} m={mats.walnut} cast />
      <B p={[8.5, 0.52, (DECK.z0 + DECK.z1) / 2]} s={[0.02, 0.9, DECK.z1 - DECK.z0]} m={mats.glass} />

      {/* festoon posts, cables and bulbs */}
      {[
        [4.4, -0.4],
        [8.2, -0.4],
        [8.2, 8.2],
        [4.4, 8.2],
      ].map(([x, z]) => (
        <Cyl key={String(x) + ":" + String(z)} p={[x, 1.45, z]} s={[0.07, 2.9, 0.07]} m={mats.black} cast />
      ))}
      <Instanced geo={GEO.box} m={mats.black} items={cables} />
      <Instanced geo={GEO.sphereLow} m={mats.bulb} items={bulbs} />

      {/* striped outdoor rug between the loungers */}
      <B p={[6.4, 0.06, 4.6]} s={[2.4, 0.01, 3.4]} m={mats.cream} />
      {[-1.2, -0.6, 0, 0.6, 1.2].map((dz) => (
        <B key={dz} p={[6.4, 0.066, 4.6 + dz]} s={[2.4, 0.01, 0.16]} m={mats.navy} />
      ))}
      {/* side table with a cold drink */}
      <Cyl p={[6.4, 0.5, 2.2]} s={[0.5, 0.04, 0.5]} m={mats.white} cast />
      <Cyl p={[6.4, 0.25, 2.2]} s={[0.06, 0.5, 0.06]} m={mats.metal} />
      <Cyl p={[6.34, 0.6, 2.16]} s={[0.1, 0.16, 0.1]} m={mats.glass} />
      <Cyl p={[6.34, 0.57, 2.16]} s={[0.08, 0.1, 0.08]} m={mats.mustard} />

      {/* the garden */}
      <PottedPlant x={4.9} z={-0.1} mats={mats} kind="fig" scale={1.1} />
      <PottedPlant x={7.75} z={0.55} mats={mats} kind="olive" />
      <PottedPlant x={7.3} z={7.6} mats={mats} kind="fern" scale={0.9} />

      {/* console table by the entry, where everyone spawns */}
      <B p={[6.9, 0.42, -2.7]} s={[1.0, 0.05, 0.36]} m={mats.oak} cast />
      {[6.5, 7.3].map((x) => (
        <B key={x} p={[x, 0.2, -2.7]} s={[0.05, 0.4, 0.3]} m={mats.oak} />
      ))}
      <Cyl p={[6.7, 0.49, -2.7]} s={[0.24, 0.08, 0.24]} m={mats.brass} />
      <Cyl p={[7.2, 0.6, -2.7]} s={[0.13, 0.32, 0.13]} m={mats.blush} />
      <Sph p={[7.2, 0.83, -2.7]} s={[0.24, 0.18, 0.24]} m={mats.leafLight} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Floor cushions round a pouf with a game board — the "sit with friends" spot
// ---------------------------------------------------------------------------------------

function CushionCircle({ mats }: { mats: Materials }) {
  const pieces = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const f = (col + (row % 2) * 0.5) * 0.12 - 0.18;
        out.push({ p: [f, 0.56, -0.18 + row * 0.1], s: [0.07, 0.03, 0.07], color: "#2b2b30" });
        out.push({ p: [f, 0.56, 0.18 - row * 0.1], s: [0.07, 0.03, 0.07], color: "#f7f3ea" });
      }
    }
    return out;
  }, []);

  const cushionMats = [mats.mustard, mats.sage, mats.terracotta, mats.navy];

  return (
    <>
      <Rug x={-3.4} z={3.6} radius={2.5} y={0.06} m={mats.blush} />
      <mesh geometry={ringGeo(2.1, 2.2)} material={mats.cream} position={[-3.4, 0.072, 3.6]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} />
      <Cyl p={[-3.4, 0.25, 3.6]} s={[1.0, 0.5, 1.0]} m={mats.cream} cast recv />
      <B p={[-3.4, 0.52, 3.6]} s={[0.52, 0.03, 0.52]} m={mats.walnut} />
      <group position={[-3.4, 0, 3.6]}>
        <Instanced geo={GEO.cylLow} m={mats.tintable} items={pieces} />
      </group>
      {[0, 1, 2, 3].map((i) => {
        const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
        return (
          <B
            key={i}
            p={[-3.4 + Math.cos(a) * 1.7, 0.1, 3.6 + Math.sin(a) * 1.7]}
            s={[0.8, 0.2, 0.8]}
            r={[0, -a, 0]}
            m={cushionMats[i]}
            cast
            recv
          />
        );
      })}
    </>
  );
}
