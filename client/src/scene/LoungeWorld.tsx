import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cone, Cyl, FloorPatch, GEO, Instanced, Rug, Sph, arcGeo, noRaycast, ringGeo, seeded, type InstanceSpec, type Materials } from "./kit";

// 28x28 luxury penthouse. Coordinates match shared/collision.ts and shared/props.ts — when
// something moves here, its obstacle box and any approach point that passes it must move too.
//
// The camera looks from +X/+Z, so the two walls stand along x = -HALF (screen left) and
// z = -HALF (screen right), and the front of the room (+X/+Z) stays open.
export const HALF = 14;
const WALL_HEIGHT = 3.4;

export function LoungeWorld({ mats, wallColor }: { mats: Materials; wallColor: string }) {
  return (
    <>
      <Shell mats={mats} wallColor={wallColor} />
      <GrandLiving mats={mats} />
      <CafeKitchen mats={mats} />
      <GamerDen mats={mats} />
      <Library mats={mats} />
      <BalconyGarden mats={mats} />
      <Foyer mats={mats} />
      <SocialCircle mats={mats} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Shell: two walls, trim, windows, and the floor zoning that tells each area apart at a glance.
// ---------------------------------------------------------------------------------------

function Shell({ mats, wallColor }: { mats: Materials; wallColor: string }) {
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95 }), [wallColor]);
  useEffect(() => () => wallMat.dispose(), [wallMat]);
  return (
    <>
      {/* back-right wall along z = -HALF, and back-left wall along x = -HALF */}
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

      {/* zone floors, each a hair higher than the last so overlaps never z-fight */}
      <FloorPatch x0={3} x1={HALF} z0={-HALF} z1={-4.4} y={0.006} m={mats.tile} />
      <FloorPatch x0={-HALF} x1={-6} z0={-HALF} z1={-0.6} y={0.006} m={mats.denCarpet} />
      <FloorPatch x0={7} x1={HALF} z0={8.8} z1={HALF} y={0.006} m={mats.tile} />

      {/* a gallery wall bridging the den and the library on the back-left wall */}
      <WallFrame x={-HALF + 0.03} y={2.0} z={0.2} w={0.8} h={1.0} art={mats.terracotta} mats={mats} onLeftWall />
      <WallFrame x={-HALF + 0.03} y={2.25} z={1.5} w={0.6} h={0.6} art={mats.sage} mats={mats} onLeftWall />
      <WallFrame x={-HALF + 0.03} y={1.55} z={1.5} w={0.6} h={0.45} art={mats.mustard} mats={mats} onLeftWall />
      <WallClock x={-HALF + 0.04} y={2.1} z={2.8} mats={mats} />
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
    // Real local time — a small touch that makes the room feel lived-in.
    const now = new Date();
    const minutes = now.getMinutes() + now.getSeconds() / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    if (minuteRef.current) minuteRef.current.rotation.z = -(minutes / 60) * Math.PI * 2;
    if (hourRef.current) hourRef.current.rotation.z = -(hours / 12) * Math.PI * 2;
  });
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI / 2, 0]}>
      <Cyl p={[0, 0, 0.03]} s={[0.62, 0.05, 0.62]} r={[Math.PI / 2, 0, 0]} m={mats.walnut} />
      <Cyl p={[0, 0, 0.06]} s={[0.52, 0.02, 0.52]} r={[Math.PI / 2, 0, 0]} m={mats.cream} />
      <mesh ref={hourRef} position={[0, 0, 0.08]} raycast={noRaycast}>
        <mesh geometry={GEO.box} material={mats.black} position={[0, 0.07, 0]} scale={[0.025, 0.14, 0.01]} raycast={noRaycast} />
      </mesh>
      <mesh ref={minuteRef} position={[0, 0, 0.085]} raycast={noRaycast}>
        <mesh geometry={GEO.box} material={mats.black} position={[0, 0.1, 0]} scale={[0.015, 0.2, 0.01]} raycast={noRaycast} />
      </mesh>
    </group>
  );
}

function PottedPlant({
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
// Zone 1 — Grand Living (back-centre): L-sofa facing a 75" wall TV over a giant rug
// ---------------------------------------------------------------------------------------

function GrandLiving({ mats }: { mats: Materials }) {
  return (
    <>
      <Rug x={-2.0} z={-8.8} radius={4.3} y={0.01} m={mats.cream} />
      {[1.6, 2.8, 3.9].map((r, i) => (
        <mesh key={r} geometry={ringGeo(r - 0.06, r)} material={i === 1 ? mats.blush : mats.white} position={[-2.0, 0.013, -8.8]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} />
      ))}

      {/* media console under the TV (the screen itself is the "tv" prop) */}
      <B p={[-1.5, 0.3, -13.55]} s={[4.4, 0.6, 0.9]} m={mats.walnut} cast recv />
      {[-3.2, -1.5, 0.2].map((x) => (
        <B key={x} p={[x, 0.3, -13.09]} s={[1.5, 0.48, 0.02]} m={mats.darkWood} />
      ))}
      <B p={[-1.5, 0.66, -13.4]} s={[2.4, 0.12, 0.16]} m={mats.black} />
      <PottedPlant x={-3.3} z={-13.55} mats={mats} kind="snake" scale={0.6} />
      <Cyl p={[0.2, 0.72, -13.5]} s={[0.22, 0.24, 0.22]} m={mats.blush} />

      <WallFrame x={-5.1} y={1.9} z={-HALF + 0.02} w={1.0} h={1.3} art={mats.sage} mats={mats} />
      <WallFrame x={2.1} y={1.9} z={-HALF + 0.02} w={1.0} h={1.3} art={mats.rust} mats={mats} />
      <PottedPlant x={-6.6} z={-13.3} mats={mats} kind="fig" />

      {/* L-sofa — long run faces -Z toward the TV, backrest on its +Z edge */}
      <B p={[-2.35, 0.21, -5.5]} s={[7.1, 0.42, 1.2]} m={mats.sage} cast recv />
      <B p={[-2.35, 0.6, -4.99]} s={[7.1, 0.8, 0.22]} m={mats.sageDark} cast recv />
      <B p={[1.12, 0.45, -5.5]} s={[0.22, 0.5, 1.2]} m={mats.sageDark} cast />
      {/* return leg faces +X, backrest on its -X edge */}
      <B p={[-5.3, 0.21, -7.95]} s={[1.2, 0.42, 3.7]} m={mats.sage} cast recv />
      <B p={[-5.79, 0.6, -7.35]} s={[0.22, 0.8, 4.9]} m={mats.sageDark} cast recv />
      <B p={[-5.3, 0.45, -9.78]} s={[1.2, 0.5, 0.22]} m={mats.sageDark} cast />
      {/* seat cushions + throw pillows */}
      {[-4.4, -2.35, -0.3].map((x) => (
        <B key={x} p={[x, 0.46, -5.55]} s={[1.95, 0.1, 1.0]} m={mats.sage} />
      ))}
      {[-7.2, -8.8].map((z) => (
        <B key={z} p={[-5.25, 0.46, z]} s={[1.0, 0.1, 1.5]} m={mats.sage} />
      ))}
      {[
        [-4.9, -5.2, mats.mustard],
        [-3.3, -5.2, mats.terracotta],
        [0.4, -5.2, mats.mustard],
      ].map(([x, z, m], i) => (
        <B key={i} p={[x as number, 0.66, z as number]} s={[0.42, 0.42, 0.14]} r={[-0.2, 0, (i - 1) * 0.12]} m={m as THREE.Material} cast />
      ))}
      <B p={[-5.5, 0.66, -8.2]} s={[0.14, 0.42, 0.42]} r={[0, 0, 0.2]} m={mats.blush} cast />
      {/* a throw blanket draped over the corner */}
      <B p={[-5.55, 0.62, -5.3]} s={[0.5, 0.05, 0.9]} r={[0, 0.4, 0.5]} m={mats.rust} />

      {/* marble coffee table + tabletop styling */}
      <B p={[-1.5, 0.4, -8.5]} s={[2.4, 0.08, 1.2]} m={mats.marble} cast recv />
      <B p={[-1.5, 0.18, -8.5]} s={[1.9, 0.36, 0.8]} m={mats.walnut} cast />
      <B p={[-2.1, 0.46, -8.5]} s={[0.7, 0.04, 0.45]} m={mats.brass} />
      <Cyl p={[-2.25, 0.52, -8.55]} s={[0.1, 0.1, 0.1]} m={mats.white} />
      <Cyl p={[-1.95, 0.52, -8.42]} s={[0.1, 0.1, 0.1]} m={mats.terracotta} />
      <Cyl p={[-0.8, 0.5, -8.6]} s={[0.12, 0.12, 0.12]} m={mats.warmGlow} />
      <B p={[-1.2, 0.47, -8.35]} s={[0.36, 0.06, 0.26]} m={mats.navy} r={[0, 0.3, 0]} />
      <B p={[-1.2, 0.52, -8.35]} s={[0.32, 0.05, 0.24]} m={mats.mustard} r={[0, 0.1, 0]} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Zone 2 — Cafe kitchen & dining island (back-right)
// ---------------------------------------------------------------------------------------

function CafeKitchen({ mats }: { mats: Materials }) {
  return (
    <>
      {/* back counter run: base cabinets, marble worktop, door fronts */}
      <B p={[7.6, 0.45, -13.52]} s={[7.4, 0.9, 0.95]} m={mats.cream} cast recv />
      <B p={[7.6, 0.93, -13.5]} s={[7.5, 0.06, 1.0]} m={mats.marble} cast recv />
      {Array.from({ length: 8 }, (_, i) => 4.33 + i * 0.93).map((x) => (
        <group key={x}>
          <B p={[x, 0.46, -13.03]} s={[0.84, 0.76, 0.02]} m={mats.white} />
          <B p={[x + 0.3, 0.62, -13.01]} s={[0.03, 0.18, 0.03]} m={mats.brass} />
        </group>
      ))}
      {/* sink + gooseneck faucet */}
      <B p={[9.0, 0.95, -13.45]} s={[0.95, 0.03, 0.55]} m={mats.metal} />
      <Cyl p={[9.0, 1.15, -13.8]} s={[0.05, 0.4, 0.05]} m={mats.brass} />
      <mesh geometry={GEO.torus} material={mats.brass} position={[9.0, 1.35, -13.68]} rotation={[0, Math.PI / 2, 0]} scale={[0.26, 0.26, 0.5]} raycast={noRaycast} />
      {/* upper cabinets + open shelf of cups */}
      <B p={[5.4, 2.4, -13.77]} s={[3.0, 0.75, 0.45]} m={mats.cream} cast />
      <B p={[7.5, 2.1, -13.82]} s={[1.0, 0.04, 0.3]} m={mats.oak} />
      {[7.15, 7.5, 7.85].map((x, i) => (
        <Cyl key={x} p={[x, 2.18, -13.8]} s={[0.12, 0.14, 0.12]} m={i === 1 ? mats.terracotta : mats.white} />
      ))}
      {/* window over the sink */}
      <group position={[9.8, 2.2, -HALF + 0.02]}>
        <B p={[0, 0, 0]} s={[2.2, 1.3, 0.02]} m={mats.warmGlow} />
        <B p={[0, 0, 0.02]} s={[0.05, 1.32, 0.03]} m={mats.white} />
        <B p={[0, 0, 0.02]} s={[2.22, 0.05, 0.03]} m={mats.white} />
        <B p={[0, -0.7, 0.08]} s={[2.4, 0.06, 0.2]} m={mats.white} />
      </group>
      {[9.2, 9.8, 10.4].map((x, i) => (
        <group key={x}>
          <Cyl p={[x, 1.58, -13.84]} s={[0.16, 0.14, 0.16]} m={mats.terracotta} />
          <Sph p={[x, 1.72, -13.84]} s={[0.2, 0.18, 0.2]} m={i === 1 ? mats.leaf : mats.leafLight} />
        </group>
      ))}
      {/* fridge */}
      <B p={[12.15, 1.0, -13.45]} s={[1.4, 2.0, 0.95]} m={mats.white} cast recv />
      <B p={[12.15, 1.33, -12.97]} s={[1.36, 0.02, 0.02]} m={mats.metal} />
      <B p={[11.62, 1.7, -12.95]} s={[0.04, 0.4, 0.04]} m={mats.metal} />
      <B p={[11.62, 0.85, -12.95]} s={[0.04, 0.5, 0.04]} m={mats.metal} />
      {/* chalkboard cafe menu above the fridge */}
      <B p={[12.15, 2.65, -13.95]} s={[1.2, 0.7, 0.04]} m={mats.charcoal} />
      {[0.12, 0, -0.12].map((dy, i) => (
        <B key={dy} p={[12.05 - i * 0.05, 2.7 + dy, -13.92]} s={[0.7 - i * 0.15, 0.025, 0.01]} m={mats.cream} />
      ))}

      {/* island with butcher-block top overhanging the bar side */}
      <B p={[8.2, 0.45, -8.6]} s={[4.4, 0.9, 1.5]} m={mats.walnut} cast recv />
      <B p={[8.2, 0.94, -8.45]} s={[4.7, 0.08, 1.85]} m={mats.oak} cast recv />
      {/* fruit bowl, pastry cloche, mugs */}
      <Cyl p={[7.0, 1.03, -8.8]} s={[0.46, 0.1, 0.46]} m={mats.white} />
      {[
        [6.92, -8.78, mats.mustard],
        [7.08, -8.84, mats.rust],
        [7.0, -8.68, mats.leafLight],
      ].map(([x, z, m], i) => (
        <Sph key={i} p={[x as number, 1.12, z as number]} s={0.13} m={m as THREE.Material} />
      ))}
      <Cyl p={[8.6, 1.0, -8.8]} s={[0.4, 0.04, 0.4]} m={mats.white} />
      <Sph p={[8.6, 1.12, -8.8]} s={[0.36, 0.34, 0.36]} m={mats.glass} />
      <Sph p={[8.6, 1.06, -8.8]} s={[0.18, 0.1, 0.18]} m={mats.mustard} />
      <Cyl p={[9.6, 1.04, -8.2]} s={[0.1, 0.12, 0.1]} m={mats.white} />
      <B p={[9.4, 0.99, -8.95]} s={[0.6, 0.03, 0.35]} m={mats.wood} />

      {/* pendant lights over the island (emissive only — real lights are budgeted, see ToggleableProp) */}
      {[7.0, 8.2, 9.4].map((x) => (
        <group key={x}>
          <Cyl p={[x, 3.0, -8.5]} s={[0.015, 0.8, 0.015]} m={mats.black} />
          <Cone p={[x, 2.5, -8.5]} s={[0.42, 0.26, 0.42]} m={mats.black} />
          <Sph p={[x, 2.38, -8.5]} s={0.14} m={mats.bulb} />
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Zone 3 — Gamer den & retro arcade (back-left)
// ---------------------------------------------------------------------------------------

function StreamerDesk({ z, accent, mats }: { z: number; accent: THREE.Material; mats: Materials }) {
  // Local frame: desk runs along X, monitors on local -Z. Rotated +90° it sits flat against the
  // back-left wall with its screens facing into the room.
  return (
    <group position={[-13.3, 0, z]} rotation={[0, Math.PI / 2, 0]}>
      <B p={[0, 0.62, 0]} s={[2.8, 0.08, 1.1]} m={mats.charcoal} cast recv />
      {[-1.3, 1.3].map((lx) => (
        <B key={lx} p={[lx, 0.31, 0.35]} s={[0.08, 0.62, 0.08]} m={mats.black} cast />
      ))}
      {/* RGB strip under the desk edge + glowing desk mat */}
      <B p={[0, 0.575, 0.54]} s={[2.7, 0.02, 0.02]} m={accent} />
      <B p={[0, 0.667, 0.15]} s={[1.3, 0.004, 0.5]} m={accent} />
      <B p={[0, 0.69, 0.15]} s={[0.95, 0.04, 0.3]} m={mats.black} />
      <Sph p={[0.62, 0.69, 0.18]} s={[0.1, 0.05, 0.14]} m={mats.black} />
      {/* dual monitors + a vertical third */}
      {[-0.62, 0.3].map((mx) => (
        <group key={mx}>
          <B p={[mx, 0.99, -0.3]} s={[0.78, 0.46, 0.04]} m={mats.screenGlow} cast />
          <B p={[mx, 0.78, -0.33]} s={[0.05, 0.22, 0.05]} m={mats.black} />
        </group>
      ))}
      <B p={[1.02, 1.07, -0.3]} s={[0.3, 0.56, 0.04]} m={mats.screenGlow} r={[0, -0.3, 0]} />
      {/* ring light, mic arm, headphone stand */}
      <mesh geometry={GEO.torus} material={accent} position={[-1.2, 1.35, -0.25]} scale={[0.45, 0.45, 0.45]} raycast={noRaycast} />
      <Cyl p={[-1.2, 0.95, -0.25]} s={[0.03, 0.6, 0.03]} m={mats.black} />
      <Cyl p={[1.15, 0.9, 0.2]} s={[0.03, 0.42, 0.03]} m={mats.black} r={[0.5, 0, 0]} />
      <Sph p={[1.15, 1.08, 0.3]} s={[0.1, 0.16, 0.1]} m={mats.charcoal} />
      {/* PC tower with glass side */}
      <B p={[1.2, 0.3, -0.25]} s={[0.4, 0.6, 0.58]} m={mats.black} cast />
      <B p={[1.2, 0.3, 0.05]} s={[0.36, 0.54, 0.01]} m={accent} />
    </group>
  );
}

function GamerDen({ mats }: { mats: Materials }) {
  return (
    <>
      <StreamerDesk z={-9.4} accent={mats.neonPink} mats={mats} />
      <StreamerDesk z={-5.4} accent={mats.neonCyan} mats={mats} />

      {/* neon "GG" sign on the back-left wall above the desks */}
      <group position={[-HALF + 0.05, 2.45, -7.4]} rotation={[0, Math.PI / 2, 0]}>
        <B p={[0, 0, 0]} s={[2.2, 0.95, 0.03]} m={mats.black} />
        {[-0.45, 0.45].map((x) => (
          <group key={x} position={[x, 0, 0.05]}>
            <mesh geometry={arcGeo(0.28, 0.035, Math.PI * 1.55)} material={mats.neonPink} rotation={[0, 0, Math.PI * 0.45]} raycast={noRaycast} />
            <B p={[0.12, -0.02, 0]} s={[0.24, 0.06, 0.06]} m={mats.neonPink} />
          </group>
        ))}
      </group>

      {/* posters above the arcade cabinets */}
      <WallFrame x={-11.0} y={2.75} z={-HALF + 0.02} w={0.7} h={0.45} art={mats.neonCyan} mats={mats} />
      <WallFrame x={-9.0} y={2.75} z={-HALF + 0.02} w={0.7} h={0.45} art={mats.neonPink} mats={mats} />
      <PottedPlant x={-13.3} z={-13.3} mats={mats} kind="monstera" />

      {/* beanbag couch facing the arcades + snack table */}
      {[
        [-9.6, mats.plum],
        [-8.0, mats.navy],
      ].map(([x, m]) => (
        <group key={x as number}>
          <Sph p={[x as number, 0.22, -2.6]} s={[1.05, 0.48, 1.0]} m={m as THREE.Material} cast recv />
          <Sph p={[x as number, 0.45, -2.25]} s={[0.9, 0.6, 0.35]} m={m as THREE.Material} cast />
        </group>
      ))}
      <Cyl p={[-8.8, 0.18, -3.75]} s={[0.55, 0.36, 0.55]} m={mats.charcoal} cast />
      <Cyl p={[-8.8, 0.39, -3.75]} s={[0.34, 0.08, 0.34]} m={mats.white} />
      <Sph p={[-8.8, 0.44, -3.75]} s={[0.26, 0.08, 0.26]} m={mats.mustard} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Zone 4 — Cozy library & study nook (front-left)
// ---------------------------------------------------------------------------------------

const SHELF_UNIT_CENTERS = [4.9, 7.9, 10.9];
const SHELF_HEIGHT = 3.3;
const SHELF_LEVELS = [0.08, 0.72, 1.36, 2.0, 2.64];
const BOOK_COLORS = ["#b5453c", "#3f7a8c", "#c9913a", "#6b5a8a", "#4d7a4a", "#d8cbb3", "#2f3f5c", "#8a4f3a"];

function Library({ mats }: { mats: Materials }) {
  // ~300 books, one draw call. Colours and sizes come from a seeded PRNG so every client
  // sees the identical library.
  const books = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(1337);
    const out: InstanceSpec[] = [];
    for (const zc of SHELF_UNIT_CENTERS) {
      for (const level of SHELF_LEVELS) {
        let z = zc - 1.3;
        while (z < zc + 1.25) {
          const thick = 0.06 + rand() * 0.05;
          const tall = 0.3 + rand() * 0.18;
          const lean = rand() < 0.07 ? 0.22 : 0;
          if (rand() < 0.06) {
            z += 0.18; // the occasional gap keeps the shelves from looking machine-packed
            continue;
          }
          out.push({
            p: [-13.62, level + 0.03 + tall / 2, z + thick / 2],
            s: [0.24, tall, thick],
            r: [lean, 0, 0],
            color: BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)],
          });
          z += thick + 0.005 + lean * 0.3;
        }
      }
    }
    return out;
  }, []);

  return (
    <>
      <Rug x={-10.2} z={7.2} radius={2.7} y={0.01} m={mats.libraryRug} />
      <mesh geometry={ringGeo(2.35, 2.45)} material={mats.cream} position={[-10.2, 0.013, 7.2]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} />

      {/* floor-to-ceiling shelving: back panel, uprights, shelves */}
      <B p={[-13.92, SHELF_HEIGHT / 2, 7.9]} s={[0.06, SHELF_HEIGHT, 8.9]} m={mats.darkWood} />
      {[3.5, 6.4, 9.4, 12.3].map((z) => (
        <B key={z} p={[-13.62, SHELF_HEIGHT / 2, z]} s={[0.6, SHELF_HEIGHT, 0.08]} m={mats.walnut} cast />
      ))}
      {[...SHELF_LEVELS, 3.28].map((y) => (
        <B key={y} p={[-13.62, y, 7.9]} s={[0.6, 0.05, 8.9]} m={mats.walnut} cast recv />
      ))}
      <Instanced geo={GEO.box} m={mats.tintable} items={books} />

      {/* rolling library ladder leaning on the shelves */}
      <group position={[-12.95, 0, 9.4]} rotation={[0, 0, -0.18]}>
        {[-0.28, 0.28].map((dz) => (
          <B key={dz} p={[0, 1.6, dz]} s={[0.05, 3.2, 0.05]} m={mats.oak} cast />
        ))}
        {Array.from({ length: 9 }, (_, i) => 0.3 + i * 0.34).map((y) => (
          <B key={y} p={[0, y, 0]} s={[0.04, 0.04, 0.56]} m={mats.oak} />
        ))}
      </group>

      {/* round side table between the armchairs, with tea and a book */}
      <Cyl p={[-11.6, 0.55, 6.9]} s={[0.66, 0.05, 0.66]} m={mats.oak} cast recv />
      <Cyl p={[-11.6, 0.27, 6.9]} s={[0.08, 0.54, 0.08]} m={mats.darkWood} />
      <Cyl p={[-11.6, 0.02, 6.9]} s={[0.4, 0.04, 0.4]} m={mats.darkWood} />
      <Cyl p={[-11.72, 0.62, 6.82]} s={[0.1, 0.08, 0.1]} m={mats.white} />
      <B p={[-11.48, 0.6, 7.0]} s={[0.26, 0.05, 0.2]} m={mats.rust} r={[0, 0.4, 0]} />

      {/* study desk */}
      <B p={[-8.6, 0.78, 11.6]} s={[2.2, 0.06, 1.0]} m={mats.walnut} cast recv />
      {[
        [-9.6, 11.2],
        [-7.6, 11.2],
        [-9.6, 12.0],
        [-7.6, 12.0],
      ].map(([x, z], i) => (
        <B key={i} p={[x, 0.38, z]} s={[0.07, 0.76, 0.07]} m={mats.walnut} cast />
      ))}
      {/* open book, pencil cup, globe */}
      <B p={[-8.75, 0.83, 11.45]} s={[0.26, 0.02, 0.36]} r={[0, 0, 0.12]} m={mats.cream} />
      <B p={[-8.47, 0.83, 11.45]} s={[0.26, 0.02, 0.36]} r={[0, 0, -0.12]} m={mats.cream} />
      <Cyl p={[-7.9, 0.88, 11.85]} s={[0.12, 0.16, 0.12]} m={mats.terracotta} />
      <Cyl p={[-8.0, 0.84, 11.9]} s={[0.1, 0.06, 0.1]} m={mats.brass} />
      <Sph p={[-8.0, 1.02, 11.9]} s={0.26} m={mats.navy} />
      <PottedPlant x={-13.1} z={13.1} mats={mats} kind="fern" scale={0.9} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Zone 5 — Relaxing balcony & indoor garden (front-right)
// ---------------------------------------------------------------------------------------

const BALCONY = { x0: 4.8, x1: 13.8, z0: -2.8, z1: 8.4 };

function BalconyGarden({ mats }: { mats: Materials }) {
  // Staggered parquet planks, two wood tones, one draw call.
  const planks = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(42);
    const out: InstanceSpec[] = [];
    const rowDepth = 0.32;
    for (let row = 0, z = BALCONY.z0 + rowDepth / 2; z < BALCONY.z1; row++, z += rowDepth) {
      let x = BALCONY.x0 - (row % 2) * 0.7;
      while (x < BALCONY.x1) {
        const len = 1.2 + rand() * 0.8;
        const x0 = Math.max(x, BALCONY.x0);
        const x1 = Math.min(x + len, BALCONY.x1);
        if (x1 - x0 > 0.1) {
          out.push({
            p: [(x0 + x1) / 2, 0.012, z],
            s: [x1 - x0 - 0.02, 0.012, rowDepth - 0.02],
            color: rand() < 0.5 ? "#b98552" : "#a8743f",
          });
        }
        x += len;
      }
    }
    return out;
  }, []);

  // Warm festoon bulbs strung between four posts.
  const bulbs = useMemo<InstanceSpec[]>(() => {
    const posts: [number, number][] = [
      [5.1, -2.6],
      [13.6, -2.6],
      [13.6, 8.2],
      [5.1, 8.2],
    ];
    const out: InstanceSpec[] = [];
    for (let i = 0; i < posts.length; i++) {
      const [ax, az] = posts[i];
      const [bx, bz] = posts[(i + 1) % posts.length];
      const n = 14;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const sag = Math.sin(t * Math.PI) * 0.45; // catenary-ish droop
        out.push({ p: [ax + (bx - ax) * t, 2.75 - sag, az + (bz - az) * t], s: [0.11, 0.14, 0.11] });
      }
    }
    return out;
  }, []);

  const railPosts = useMemo<InstanceSpec[]>(
    () => Array.from({ length: 10 }, (_, i) => ({ p: [13.85, 0.5, BALCONY.z0 + i * 1.24] as [number, number, number], s: [0.08, 1.0, 0.08] as [number, number, number] })),
    []
  );

  return (
    <>
      <Instanced geo={GEO.box} m={mats.tintable} items={planks} recv />
      {/* a slight step up onto the deck, read from the trim along its inner edges */}
      <B p={[BALCONY.x0, 0.03, (BALCONY.z0 + BALCONY.z1) / 2]} s={[0.08, 0.06, BALCONY.z1 - BALCONY.z0]} m={mats.walnut} />
      <B p={[(BALCONY.x0 + BALCONY.x1) / 2, 0.03, BALCONY.z0]} s={[BALCONY.x1 - BALCONY.x0, 0.06, 0.08]} m={mats.walnut} />

      {/* glass railing along the island's edge */}
      <Instanced geo={GEO.box} m={mats.walnut} items={railPosts} cast />
      <B p={[13.85, 1.02, (BALCONY.z0 + BALCONY.z1) / 2]} s={[0.12, 0.06, BALCONY.z1 - BALCONY.z0]} m={mats.walnut} cast />
      <B p={[13.85, 0.52, (BALCONY.z0 + BALCONY.z1) / 2]} s={[0.02, 0.9, BALCONY.z1 - BALCONY.z0]} m={mats.glass} />

      {/* festoon light posts + bulbs */}
      {[
        [5.1, -2.6],
        [13.6, -2.6],
        [13.6, 8.2],
        [5.1, 8.2],
      ].map(([x, z]) => (
        <Cyl key={`${x}${z}`} p={[x, 1.42, z]} s={[0.07, 2.84, 0.07]} m={mats.black} cast />
      ))}
      <Instanced geo={GEO.sphereLow} m={mats.bulb} items={bulbs} />

      {/* striped outdoor rug under the deck chairs */}
      <B p={[9.5, 0.03, 2.5]} s={[3.2, 0.01, 4.6]} m={mats.cream} />
      {[-1.6, -0.8, 0, 0.8, 1.6].map((dz) => (
        <B key={dz} p={[9.5, 0.036, 2.5 + dz]} s={[3.2, 0.01, 0.18]} m={mats.navy} />
      ))}
      {/* side table with lemonade */}
      <Cyl p={[9.6, 0.5, 2.5]} s={[0.56, 0.04, 0.56]} m={mats.white} cast />
      <Cyl p={[9.6, 0.25, 2.5]} s={[0.06, 0.5, 0.06]} m={mats.metal} />
      <Cyl p={[9.52, 0.6, 2.45]} s={[0.1, 0.16, 0.1]} m={mats.glass} />
      <Cyl p={[9.52, 0.57, 2.45]} s={[0.08, 0.1, 0.08]} m={mats.mustard} />

      {/* the garden */}
      <PottedPlant x={6.0} z={-1.8} mats={mats} kind="fig" scale={1.3} />
      <PottedPlant x={12.4} z={-1.6} mats={mats} kind="snake" />
      <PottedPlant x={12.4} z={7.2} mats={mats} kind="olive" scale={1.2} />
      <PottedPlant x={5.8} z={7.4} mats={mats} kind="fern" />
      {/* tiered plant stand with succulents */}
      <group position={[11.0, 0, 6.2]}>
        {[0.3, 0.62, 0.94].map((y, i) => (
          <group key={y}>
            <B p={[0, y, -0.12 + i * 0.12]} s={[0.55, 0.04, 0.22]} m={mats.oak} cast />
            {[-0.15, 0.15].map((dx) => (
              <group key={dx}>
                <Cyl p={[dx, y + 0.08, -0.12 + i * 0.12]} s={[0.14, 0.12, 0.14]} m={mats.terracotta} />
                <Sph p={[dx, y + 0.17, -0.12 + i * 0.12]} s={[0.14, 0.09, 0.14]} m={i % 2 ? mats.olive : mats.leafLight} />
              </group>
            ))}
          </group>
        ))}
        <B p={[0, 0.5, 0.12]} s={[0.04, 1.0, 0.04]} m={mats.oak} />
      </group>
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Zone 6 — Welcoming foyer (front corner, where everyone spawns)
// ---------------------------------------------------------------------------------------

function Foyer({ mats }: { mats: Materials }) {
  return (
    <>
      {/* welcome mat */}
      <B p={[10.4, 0.015, 11.4]} s={[2.0, 0.012, 1.15]} m={mats.rust} recv />
      <B p={[10.4, 0.022, 11.4]} s={[1.7, 0.012, 0.85]} m={mats.mustard} />

      {/* entrance door frame out at the island's corner, door ajar with warm light spilling in */}
      <group position={[13.75, 0, 11.2]} rotation={[0, -Math.PI / 2, 0]}>
        <B p={[-0.62, 1.25, 0]} s={[0.12, 2.5, 0.2]} m={mats.white} cast />
        <B p={[0.62, 1.25, 0]} s={[0.12, 2.5, 0.2]} m={mats.white} cast />
        <B p={[0, 2.5, 0]} s={[1.36, 0.14, 0.2]} m={mats.white} cast />
        <B p={[0, 1.18, -0.05]} s={[1.1, 2.3, 0.02]} m={mats.doorwayGlow} />
        <group position={[-0.56, 0, 0.02]} rotation={[0, -0.9, 0]}>
          <B p={[0.55, 1.18, 0]} s={[1.1, 2.3, 0.06]} m={mats.sageDark} cast />
          <Sph p={[0.95, 1.1, 0.06]} s={0.07} m={mats.brass} />
        </group>
      </group>

      {/* shoe bench with a cushion and a few pairs */}
      <B p={[9.1, 0.25, 13.05]} s={[2.4, 0.5, 0.7]} m={mats.walnut} cast recv />
      <B p={[9.1, 0.53, 13.05]} s={[2.3, 0.06, 0.62]} m={mats.blush} />
      <B p={[9.1, 0.12, 12.72]} s={[2.3, 0.02, 0.04]} m={mats.darkWood} />
      {[
        [8.3, mats.white],
        [8.9, mats.navy],
        [9.6, mats.rust],
      ].map(([x, m]) =>
        [-0.08, 0.08].map((dx) => (
          <B key={`${x}${dx}`} p={[(x as number) + dx, 0.06, 12.55]} s={[0.11, 0.08, 0.3]} m={m as THREE.Material} />
        ))
      )}

      {/* tall standing mirror, leaning back slightly */}
      <group position={[12.9, 0, 10.0]} rotation={[0, -Math.PI / 2, 0.08]}>
        <B p={[0, 1.0, 0]} s={[0.8, 2.0, 0.08]} m={mats.oak} cast />
        <B p={[0, 1.0, 0.045]} s={[0.66, 1.84, 0.01]} m={mats.mirror} />
      </group>

      {/* coat stand with a scarf and a hat */}
      <group position={[12.7, 0, 12.6]}>
        <Cyl p={[0, 0.9, 0]} s={[0.06, 1.8, 0.06]} m={mats.walnut} cast />
        <Cyl p={[0, 0.03, 0]} s={[0.42, 0.06, 0.42]} m={mats.walnut} />
        {[0, 1, 2, 3].map((i) => (
          <B key={i} p={[Math.cos(i * 1.57) * 0.12, 1.7, Math.sin(i * 1.57) * 0.12]} s={[0.2, 0.03, 0.03]} r={[0, -i * 1.57, 0.5]} m={mats.brass} />
        ))}
        <B p={[0.1, 1.35, 0.05]} s={[0.12, 0.6, 0.18]} m={mats.mustard} cast />
        <Cyl p={[-0.12, 1.86, 0]} s={[0.3, 0.12, 0.3]} m={mats.navy} />
      </group>

      {/* console with a key bowl and a vase, and an umbrella stand by the door */}
      <B p={[11.4, 0.42, 13.45]} s={[1.5, 0.05, 0.38]} m={mats.oak} cast />
      {[10.75, 12.05].map((x) => (
        <B key={x} p={[x, 0.2, 13.45]} s={[0.05, 0.4, 0.3]} m={mats.oak} />
      ))}
      <Cyl p={[11.0, 0.49, 13.45]} s={[0.26, 0.08, 0.26]} m={mats.brass} />
      <Cyl p={[11.8, 0.62, 13.45]} s={[0.14, 0.36, 0.14]} m={mats.blush} />
      <Sph p={[11.8, 0.88, 13.45]} s={[0.26, 0.2, 0.26]} m={mats.leafLight} />
      <Cyl p={[13.35, 0.3, 12.3]} s={[0.26, 0.6, 0.26]} m={mats.metal} />
      <Cyl p={[13.35, 0.72, 12.3]} s={[0.04, 0.5, 0.04]} m={mats.rust} r={[0.12, 0, 0.1]} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Social circle — floor cushions around a pouf table with a game board, between the zones
// ---------------------------------------------------------------------------------------

function SocialCircle({ mats }: { mats: Materials }) {
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
      <Rug x={0} z={6} radius={3.1} y={0.01} m={mats.blush} />
      <mesh geometry={ringGeo(2.7, 2.82)} material={mats.cream} position={[0, 0.013, 6]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} />
      {/* pouf table with a checkers game mid-play */}
      <Cyl p={[0, 0.25, 6]} s={[1.1, 0.5, 1.1]} m={mats.cream} cast recv />
      <B p={[0, 0.52, 6]} s={[0.56, 0.03, 0.56]} m={mats.walnut} />
      <group position={[0, 0, 6]}>
        <Instanced geo={GEO.cylLow} m={mats.tintable} items={pieces} />
      </group>
      {/* the four floor cushions, drawn where the "cushion_N" seats sit */}
      {[0, 1, 2, 3].map((i) => {
        const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
        return (
          <B
            key={i}
            p={[Math.cos(a) * 2.2, 0.1, 6 + Math.sin(a) * 2.2]}
            s={[0.85, 0.2, 0.85]}
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
