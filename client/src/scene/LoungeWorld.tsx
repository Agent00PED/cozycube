import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cone, Cyl, FloorPatch, GEO, HALF, Instanced, Rug, Sph, arcGeo, noMerge, noRaycast, ringGeo, seeded, type InstanceSpec, type Materials } from "./kit";

// A 20x20 penthouse in five zones — living room, kitchen, dining, gamer corner, vinyl nook —
// wrapped round a balcony deck. Coordinates match shared/collision.ts and shared/props.ts:
// when something moves here, its obstacle box and any approach point that passes it must move
// too (scripts/checklayout.ts checks the latter).
//
// The camera looks from +X/+Z, so the two walls stand along x = -HALF (screen left) and
// z = -HALF (screen right), and the front of the room (+X/+Z) stays open.
const WALL_HEIGHT = 3.2;
const WALL_THICK = 0.2;
/** Inner face of both walls. */
const INNER = HALF - WALL_THICK;

export function LoungeWorld({ mats, wallColor }: { mats: Materials; wallColor: string }) {
  return (
    <>
      <Shell mats={mats} wallColor={wallColor} />
      <LivingRoom mats={mats} />
      <Kitchen mats={mats} />
      <DiningSet mats={mats} />
      <GamerCorner mats={mats} />
      <VinylNook mats={mats} />
      <BalconyDeck mats={mats} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Shell: two solid walls with real thickness, skirting, and the floor zoning
// ---------------------------------------------------------------------------------------

function Shell({ mats, wallColor }: { mats: Materials; wallColor: string }) {
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95 }), [wallColor]);
  useEffect(() => () => wallMat.dispose(), [wallMat]);

  return (
    <>
      {/* Walls are BOXES, not planes: at this camera angle a zero-thickness wall shows its
          paper edge along the top, which is the one thing that gives away a fake room. */}
      <mesh
        geometry={GEO.box}
        material={wallMat}
        position={[0, WALL_HEIGHT / 2, -HALF + WALL_THICK / 2]}
        scale={[HALF * 2, WALL_HEIGHT, WALL_THICK]}
        castShadow
        receiveShadow
        raycast={noRaycast}
      />
      <mesh
        geometry={GEO.box}
        material={wallMat}
        position={[-HALF + WALL_THICK / 2, WALL_HEIGHT / 2, 0]}
        scale={[WALL_THICK, WALL_HEIGHT, HALF * 2]}
        castShadow
        receiveShadow
        raycast={noRaycast}
      />

      {/* skirting boards and crown moulding, proud of the wall face */}
      <B p={[0, 0.09, -INNER + 0.04]} s={[HALF * 2, 0.18, 0.09]} m={mats.white} />
      <B p={[-INNER + 0.04, 0.09, 0]} s={[0.09, 0.18, HALF * 2]} m={mats.white} />
      <B p={[0, WALL_HEIGHT - 0.07, -INNER + 0.05]} s={[HALF * 2, 0.14, 0.11]} m={mats.white} />
      <B p={[-INNER + 0.05, WALL_HEIGHT - 0.07, 0]} s={[0.11, 0.14, HALF * 2]} m={mats.white} />

      {/* Kitchen tiles mark that zone off from the living room's wood floor. */}
      <FloorPatch x0={0.4} x1={HALF} z0={-INNER} z1={-4.4} y={0.006} m={mats.tile} />
      <KitchenTileGrid mats={mats} />
      <FloorPatch x0={-INNER} x1={-5.0} z0={-INNER} z1={-5.2} y={0.006} m={mats.denCarpet} />

      {/* gallery wall + a clock with real hands */}
      <WallFrame x={-INNER + 0.01} y={2.0} z={-1.4} w={0.8} h={1.0} art={mats.terracotta} mats={mats} onLeftWall />
      <WallFrame x={-INNER + 0.01} y={2.25} z={0.0} w={0.58} h={0.58} art={mats.sage} mats={mats} onLeftWall />
      <WallFrame x={-INNER + 0.01} y={1.55} z={0.0} w={0.58} h={0.44} art={mats.mustard} mats={mats} onLeftWall />
      <WallClock x={-INNER + 0.02} y={2.05} z={1.5} mats={mats} />
      <PottedPlant x={-9.2} z={-9.2} mats={mats} kind="monstera" scale={0.9} />
    </>
  );
}

/** Grout lines over the kitchen floor patch, so the tiles read as tiles. */
function KitchenTileGrid({ mats }: { mats: Materials }) {
  const lines = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    const x0 = 0.4;
    const x1 = HALF;
    const z0 = -INNER;
    const z1 = -4.4;
    for (let x = x0; x <= x1; x += 1.2) out.push({ p: [x, 0.008, (z0 + z1) / 2], s: [0.035, 0.004, z1 - z0] });
    for (let z = z0; z <= z1; z += 1.2) out.push({ p: [(x0 + x1) / 2, 0.008, z], s: [x1 - x0, 0.004, 0.035] });
    return out;
  }, []);
  return <Instanced geo={GEO.box} m={mats.cream} items={lines} />;
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
  const hourRef = useRef<THREE.Group>(null);
  const minuteRef = useRef<THREE.Group>(null);
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
      <Cyl p={[0, 0, 0.03]} s={[0.58, 0.05, 0.58]} m={mats.walnut} r={[Math.PI / 2, 0, 0]} />
      <Cyl p={[0, 0, 0.06]} s={[0.48, 0.02, 0.48]} m={mats.cream} r={[Math.PI / 2, 0, 0]} />
      {/* hour ticks */}
      {[0, 1, 2, 3].map((i) => (
        <B key={i} p={[Math.sin((i * Math.PI) / 2) * 0.2, Math.cos((i * Math.PI) / 2) * 0.2, 0.075]} s={[0.025, 0.05, 0.005]} r={[0, 0, (i * Math.PI) / 2]} m={mats.charcoal} />
      ))}
      {/* the hands themselves: each is a group pivoting at the centre, with the hand offset up */}
      <group ref={hourRef} position={[0, 0, 0.085]}>
        <B p={[0, 0.06, 0]} s={[0.028, 0.13, 0.012]} m={mats.charcoal} />
      </group>
      <group ref={minuteRef} position={[0, 0, 0.095]}>
        <B p={[0, 0.09, 0]} s={[0.018, 0.19, 0.012]} m={mats.charcoal} />
      </group>
      <Cyl p={[0, 0, 0.1]} s={[0.05, 0.02, 0.05]} m={mats.brass} r={[Math.PI / 2, 0, 0]} />
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
      {/* Soil is a solid unlit cylinder with shadows off both ways — see mats.soil. */}
      <Cyl p={[0, 0.48, 0]} s={[0.54, 0.1, 0.54]} m={mats.soil} />
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
// Living room: L-sofa opening onto the middle of the room, TV on the back wall
// ---------------------------------------------------------------------------------------

function LivingRoom({ mats }: { mats: Materials }) {
  return (
    <>
      {/* One plain rug. The faint concentric rings that used to sit on it read as a radar
          sweep from above, so they are gone. */}
      <Rug x={-4.4} z={-5.8} radius={3.1} y={0.06} m={mats.cream} sx={1.15} />

      {/* media console under the TV (the screen itself is the "tv" prop) */}
      <B p={[-4.2, 0.3, -9.4]} s={[3.4, 0.6, 0.72]} m={mats.walnut} cast recv />
      {[-5.0, -4.2, -3.4].map((x) => (
        <B key={x} p={[x, 0.3, -9.03]} s={[0.72, 0.46, 0.02]} m={mats.darkWood} />
      ))}
      <B p={[-4.2, 0.64, -9.3]} s={[1.8, 0.1, 0.14]} m={mats.black} />
      <Cyl p={[-3.0, 0.72, -9.35]} s={[0.2, 0.22, 0.2]} m={mats.blush} />
      <PottedPlant x={-6.7} z={-9.2} mats={mats} kind="snake" scale={0.7} />
      <WallFrame x={-1.4} y={1.9} z={-INNER + 0.01} w={0.85} h={1.1} art={mats.rust} mats={mats} />

      {/* L-sofa: long run faces the TV, the return leg turns in toward the room's middle so
          the corner "hugs" the open floor rather than facing a wall. */}
      <B p={[-4.2, 0.21, -4.6]} s={[4.4, 0.42, 1.1]} m={mats.sage} cast recv />
      <B p={[-4.2, 0.58, -4.14]} s={[4.4, 0.75, 0.2]} m={mats.sageDark} cast recv />
      <B p={[-7.0, 0.21, -6.2]} s={[1.1, 0.42, 2.1]} m={mats.sage} cast recv />
      <B p={[-7.46, 0.58, -5.9]} s={[0.2, 0.75, 2.7]} m={mats.sageDark} cast recv />
      <B p={[-2.05, 0.44, -4.6]} s={[0.2, 0.46, 1.1]} m={mats.sageDark} cast />
      {[-5.6, -4.2, -2.8].map((x) => (
        <B key={x} p={[x, 0.46, -4.64]} s={[1.32, 0.1, 0.92]} m={mats.sage} />
      ))}
      <B p={[-7.0, 0.46, -6.1]} s={[0.92, 0.1, 1.24]} m={mats.sage} />
      {[
        [-5.9, -4.35, mats.mustard],
        [-2.6, -4.35, mats.terracotta],
      ].map(([x, z, m], i) => (
        <B key={i} p={[x as number, 0.64, z as number]} s={[0.38, 0.38, 0.13]} r={[-0.2, 0, (i - 0.5) * 0.2]} m={m as THREE.Material} cast />
      ))}
      <B p={[-7.2, 0.6, -5.0]} s={[0.45, 0.05, 0.8]} r={[0, 0.4, 0.5]} m={mats.rust} />

      {/* marble coffee table + tabletop styling */}
      <B p={[-4.3, 0.4, -6.9]} s={[2.2, 0.08, 0.9]} m={mats.marble} cast recv />
      <B p={[-4.3, 0.18, -6.9]} s={[1.8, 0.36, 0.6]} m={mats.walnut} cast />
      <B p={[-4.8, 0.46, -6.9]} s={[0.6, 0.04, 0.4]} m={mats.brass} />
      <Cyl p={[-4.92, 0.52, -6.94]} s={[0.1, 0.1, 0.1]} m={mats.white} />
      <Cyl p={[-4.66, 0.52, -6.82]} s={[0.1, 0.1, 0.1]} m={mats.terracotta} />
      <Cyl p={[-3.7, 0.5, -7.0]} s={[0.12, 0.12, 0.12]} m={mats.warmGlow} />
      <B p={[-4.0, 0.47, -6.76]} s={[0.32, 0.06, 0.24]} m={mats.navy} r={[0, 0.3, 0]} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Kitchen: counter run, island with stools, wall-mounted lights (nothing hangs from the sky)
// ---------------------------------------------------------------------------------------

function Kitchen({ mats }: { mats: Materials }) {
  return (
    <>
      {/* back counter run: base cabinets, marble worktop, door fronts */}
      <B p={[5.1, 0.45, -9.3]} s={[8.4, 0.9, 0.9]} m={mats.cream} cast recv />
      <B p={[5.1, 0.93, -9.3]} s={[8.5, 0.06, 0.95]} m={mats.marble} cast recv />
      {Array.from({ length: 8 }, (_, i) => 1.4 + i * 0.94).map((x) => (
        <group key={x}>
          <B p={[x, 0.46, -8.84]} s={[0.84, 0.76, 0.02]} m={mats.white} />
          <B p={[x + 0.3, 0.62, -8.82]} s={[0.03, 0.18, 0.03]} m={mats.brass} />
        </group>
      ))}
      {/* sink + gooseneck faucet */}
      <B p={[6.2, 0.95, -9.25]} s={[0.9, 0.03, 0.5]} m={mats.metal} />
      <Cyl p={[6.2, 1.14, -9.55]} s={[0.05, 0.38, 0.05]} m={mats.brass} />
      <mesh geometry={GEO.torus} material={mats.brass} position={[6.2, 1.33, -9.43]} rotation={[0, Math.PI / 2, 0]} scale={[0.24, 0.24, 0.5]} raycast={noRaycast} />
      {/* fridge at the end of the run */}
      <B p={[8.5, 1.0, -9.25]} s={[1.3, 2.0, 0.9]} m={mats.white} cast recv />
      <B p={[8.5, 1.3, -8.79]} s={[1.26, 0.02, 0.02]} m={mats.metal} />
      <B p={[8.0, 1.66, -8.77]} s={[0.04, 0.38, 0.04]} m={mats.metal} />
      <B p={[8.0, 0.85, -8.77]} s={[0.04, 0.46, 0.04]} m={mats.metal} />
      {/* upper cabinets, open shelf, chalkboard menu */}
      <B p={[2.3, 2.3, -9.55]} s={[2.4, 0.7, 0.42]} m={mats.cream} cast />
      <B p={[4.4, 2.05, -9.58]} s={[0.9, 0.04, 0.28]} m={mats.oak} />
      {[4.1, 4.4, 4.7].map((x, i) => (
        <Cyl key={x} p={[x, 2.13, -9.57]} s={[0.12, 0.13, 0.12]} m={i === 1 ? mats.terracotta : mats.white} />
      ))}
      <B p={[7.4, 2.35, -9.7]} s={[1.1, 0.65, 0.04]} m={mats.charcoal} />
      {[0.11, 0, -0.11].map((dy, i) => (
        <B key={dy} p={[7.3 - i * 0.05, 2.4 + dy, -9.67]} s={[0.66 - i * 0.14, 0.025, 0.01]} m={mats.cream} />
      ))}

      {/* Window over the sink, with a proper 3D frame, sill and mullions. */}
      <group position={[6.2, 2.05, -INNER - 0.04]}>
        <B p={[0, 0, 0.06]} s={[2.3, 1.6, 0.12]} m={mats.walnut} cast />
        <B p={[0, 0, 0.14]} s={[2.0, 1.32, 0.02]} m={mats.warmGlow} />
        <B p={[0, 0, 0.16]} s={[0.07, 1.34, 0.05]} m={mats.white} />
        <B p={[0, 0, 0.16]} s={[2.02, 0.07, 0.05]} m={mats.white} />
        <B p={[0, -0.84, 0.2]} s={[2.5, 0.1, 0.34]} m={mats.white} cast />
        <Cyl p={[-0.8, -0.68, 0.24]} s={[0.22, 0.22, 0.22]} m={mats.terracotta} />
        <Sph p={[-0.8, -0.5, 0.24]} s={[0.3, 0.26, 0.3]} m={mats.leafLight} />
      </group>

      {/* island with butcher-block top overhanging the bar side */}
      <B p={[5.1, 0.45, -6.2]} s={[3.6, 0.9, 1.2]} m={mats.walnut} cast recv />
      <B p={[5.1, 0.94, -6.05]} s={[3.9, 0.08, 1.55]} m={mats.oak} cast recv />
      <Cyl p={[3.9, 1.03, -6.4]} s={[0.42, 0.1, 0.42]} m={mats.white} />
      {[
        [3.82, -6.38, mats.mustard],
        [3.98, -6.44, mats.rust],
        [3.9, -6.28, mats.leafLight],
      ].map(([x, z, m], i) => (
        <Sph key={i} p={[x as number, 1.12, z as number]} s={0.12} m={m as THREE.Material} />
      ))}
      <Cyl p={[5.3, 1.0, -6.4]} s={[0.36, 0.04, 0.36]} m={mats.white} />
      <Sph p={[5.3, 1.11, -6.4]} s={[0.32, 0.3, 0.32]} m={mats.glass} />
      <Sph p={[5.3, 1.05, -6.4]} s={[0.16, 0.09, 0.16]} m={mats.mustard} />
      <B p={[6.3, 0.99, -6.45]} s={[0.55, 0.03, 0.32]} m={mats.wood} />

      {/* Gooseneck bar lamps CLAMPED TO THE ISLAND. The old pendants hung from a ceiling this
          diorama does not have, so their flexes ended in mid-air. */}
      {[4.0, 6.2].map((x) => (
        <group key={x} position={[x, 0, -6.6]}>
          <Cyl p={[0, 0.5, 0]} s={[0.1, 1.0, 0.1]} m={mats.black} />
          <Cyl p={[0, 1.0, 0]} s={[0.05, 0.6, 0.05]} m={mats.black} />
          <Cyl p={[0.16, 1.3, 0]} s={[0.05, 0.42, 0.05]} r={[0, 0, -0.9]} m={mats.black} />
          <Cone p={[0.42, 1.4, 0]} s={[0.34, 0.24, 0.34]} r={[Math.PI, 0, 0.35]} m={mats.black} />
          <Sph p={[0.42, 1.3, 0]} s={0.12} m={mats.bulb} />
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Dining set: the bridge between kitchen and living room, so the middle is not dead floor
// ---------------------------------------------------------------------------------------

function DiningSet({ mats }: { mats: Materials }) {
  return (
    <>
      <B p={[3.8, 0.74, -1.4]} s={[1.7, 0.08, 1.5]} m={mats.oak} cast recv />
      <B p={[3.8, 0.4, -1.4]} s={[0.24, 0.7, 0.24]} m={mats.walnut} cast />
      <B p={[3.8, 0.06, -1.4]} s={[1.1, 0.1, 1.0]} m={mats.walnut} cast />
      {/* a runner, a vase of dried flowers and two place settings */}
      <B p={[3.8, 0.79, -1.4]} s={[1.5, 0.01, 0.42]} m={mats.blush} />
      <Cyl p={[3.8, 0.92, -1.4]} s={[0.18, 0.28, 0.18]} m={mats.glass} />
      {[0, 1, 2].map((i) => (
        <Cyl key={i} p={[3.8 + Math.sin(i * 2) * 0.05, 1.16, -1.4 + Math.cos(i * 2) * 0.05]} s={[0.02, 0.5, 0.02]} r={[Math.sin(i) * 0.2, 0, Math.cos(i) * 0.2]} m={mats.olive} />
      ))}
      {[
        [3.15, -1.4],
        [4.45, -1.4],
      ].map(([x, z], i) => (
        <group key={i}>
          <Cyl p={[x, 0.79, z]} s={[0.4, 0.02, 0.4]} m={mats.white} />
          <Cyl p={[x, 0.81, z]} s={[0.22, 0.02, 0.22]} m={mats.terracotta} />
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Gamer corner: streamer desk along the left wall, two arcade cabinets on the back wall
// ---------------------------------------------------------------------------------------

function GamerCorner({ mats }: { mats: Materials }) {
  return (
    <>
      <group position={[-9.05, 0, -7.2]} rotation={[0, Math.PI / 2, 0]}>
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
      <group position={[-INNER + 0.02, 2.4, -7.2]} rotation={[0, Math.PI / 2, 0]}>
        <B p={[0, 0, 0]} s={[1.7, 0.78, 0.03]} m={mats.black} />
        {[-0.36, 0.36].map((x) => (
          <group key={x} position={[x, 0, 0.05]}>
            <mesh geometry={arcGeo(0.22, 0.03, Math.PI * 1.55)} material={mats.neonPink} rotation={[0, 0, Math.PI * 0.45]} raycast={noRaycast} />
            <B p={[0.1, -0.02, 0]} s={[0.2, 0.05, 0.05]} m={mats.neonPink} />
          </group>
        ))}
      </group>

      <WallFrame x={-7.4} y={2.2} z={-INNER + 0.01} w={0.55} h={0.38} art={mats.neonCyan} mats={mats} />
      <WallFrame x={-6.1} y={2.2} z={-INNER + 0.01} w={0.55} h={0.38} art={mats.neonPink} mats={mats} />

      {/* snack table between the cabinets and the sofa */}
      <Cyl p={[-6.6, 0.18, -6.9]} s={[0.5, 0.36, 0.5]} m={mats.charcoal} cast />
      <Cyl p={[-6.6, 0.39, -6.9]} s={[0.3, 0.08, 0.3]} m={mats.white} />
      <Sph p={[-6.6, 0.44, -6.9]} s={[0.24, 0.08, 0.24]} m={mats.mustard} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Vinyl nook: turntable, records, a guitar on a stand and a reading lamp on a round rug
// ---------------------------------------------------------------------------------------

function VinylNook({ mats }: { mats: Materials }) {
  const sleeves = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(404);
    const colors = ["#c4714a", "#2f3f5c", "#e0a93b", "#7d9471", "#a8553a", "#5b3a63"];
    const out: InstanceSpec[] = [];
    for (let shelf = 0; shelf < 2; shelf++) {
      let z = 2.7;
      while (z < 4.9) {
        const thick = 0.05 + rand() * 0.03;
        out.push({
          p: [-9.35, 0.42 + shelf * 0.72, z + thick / 2],
          s: [0.52, 0.5, thick],
          r: [0, 0, rand() < 0.12 ? 0.16 : 0],
          color: colors[Math.floor(rand() * colors.length)],
        });
        z += thick + 0.01;
      }
    }
    return out;
  }, []);

  return (
    <>
      <Rug x={-6.4} z={4.8} radius={2.6} y={0.06} m={mats.libraryRug} />

      {/* record shelf against the wall, packed with sleeves */}
      <B p={[-9.35, 0.85, 3.8]} s={[0.62, 1.7, 2.8]} m={mats.walnut} cast recv />
      <B p={[-9.35, 0.36, 3.8]} s={[0.66, 0.05, 2.84]} m={mats.darkWood} />
      <B p={[-9.35, 1.08, 3.8]} s={[0.66, 0.05, 2.84]} m={mats.darkWood} />
      <Instanced geo={GEO.box} m={mats.tintable} items={sleeves} />

      {/* turntable on top of the shelf, lid open */}
      <B p={[-9.3, 1.78, 3.8]} s={[0.55, 0.12, 0.7]} m={mats.charcoal} cast />
      <Cyl p={[-9.3, 1.85, 3.8]} s={[0.42, 0.02, 0.42]} m={mats.black} />
      <Cyl p={[-9.3, 1.87, 3.8]} s={[0.14, 0.01, 0.14]} m={mats.mustard} />
      <B p={[-9.1, 1.87, 3.55]} s={[0.04, 0.02, 0.3]} r={[0, 0.5, 0]} m={mats.metal} />
      <B p={[-9.3, 2.05, 4.16]} s={[0.55, 0.36, 0.02]} r={[0.5, 0, 0]} m={mats.glass} />

      {/* acoustic guitar on a proper A-frame stand, resting on the floor */}
      <group position={[-6.2, 0, 3.1]} rotation={[0, 0.6, 0]}>
        {[-0.18, 0.18].map((dx) => (
          <Cyl key={dx} p={[dx, 0.28, 0]} s={[0.05, 0.56, 0.05]} r={[0.18, 0, dx > 0 ? -0.2 : 0.2]} m={mats.black} />
        ))}
        <Cyl p={[0, 0.5, 0.03]} s={[0.04, 0.4, 0.04]} r={[0, 0, Math.PI / 2]} m={mats.black} />
        <group position={[0, 0, 0.05]} rotation={[0.16, 0, 0]}>
          <Sph p={[0, 0.42, 0]} s={[0.5, 0.5, 0.17]} m={mats.oak} cast />
          <Sph p={[0, 0.66, 0]} s={[0.38, 0.38, 0.14]} m={mats.oak} cast />
          <Cyl p={[0, 0.42, 0.09]} s={[0.13, 0.01, 0.13]} r={[Math.PI / 2, 0, 0]} m={mats.black} />
          <B p={[0, 1.08, 0]} s={[0.09, 0.66, 0.05]} m={mats.darkWood} cast />
          <B p={[0, 1.44, 0]} s={[0.12, 0.2, 0.05]} m={mats.black} />
        </group>
      </group>

      {/* a low stack of art books and a mug, so the nook looks used */}
      <B p={[-5.2, 0.06, 3.4]} s={[0.42, 0.06, 0.32]} m={mats.rust} />
      <B p={[-5.2, 0.12, 3.4]} s={[0.4, 0.06, 0.3]} r={[0, 0.2, 0]} m={mats.navy} />
      <Cyl p={[-4.9, 0.09, 3.7]} s={[0.16, 0.18, 0.16]} m={mats.white} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Balcony deck: an open-edged terrace — no glass wall, no cage of beams overhead
// ---------------------------------------------------------------------------------------

const DECK = { x0: 4.6, x1: 9.4, z0: 0.6, z1: 9.4 };

function BalconyDeck({ mats }: { mats: Materials }) {
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

  // Festoon lights: four short corner posts with cables sagging between them, nothing else.
  // The previous version added a square of beams across the top, which from this camera read
  // as the bars of a cage over the whole terrace.
  const POSTS: [number, number][] = [
    [4.8, 0.8],
    [9.2, 0.8],
    [9.2, 9.2],
    [4.8, 9.2],
  ];
  const { bulbs, cables } = useMemo(() => {
    const bulbs: InstanceSpec[] = [];
    const cables: InstanceSpec[] = [];
    const TOP = 2.45; // clears every head, and low enough to feel like a terrace not a hangar
    for (let i = 0; i < POSTS.length; i++) {
      const [ax, az] = POSTS[i];
      const [bx, bz] = POSTS[(i + 1) % POSTS.length];
      const n = 11;
      const at = (t: number): [number, number, number] => [ax + (bx - ax) * t, TOP - Math.sin(t * Math.PI) * 0.3, az + (bz - az) * t];
      for (let k = 1; k < n; k++) bulbs.push({ p: at(k / n), s: [0.1, 0.13, 0.1] });
      for (let k = 0; k < n; k++) {
        const a = at(k / n);
        const b = at((k + 1) / n);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        cables.push({
          p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.06, (a[2] + b[2]) / 2],
          s: [0.022, 0.022, len],
          r: [Math.asin((b[1] - a[1]) / len), Math.atan2(b[0] - a[0], b[2] - a[2]), 0],
        });
      }
    }
    return { bulbs, cables };
  }, []);

  return (
    <>
      <Instanced geo={GEO.box} m={mats.tintable} items={planks} recv />

      {/* A single low step joins the wood floor to the deck — this replaces the door frame
          that used to stand out here on its own with nothing attached to it. */}
      <B p={[DECK.x0 - 0.16, 0.015, (DECK.z0 + DECK.z1) / 2]} s={[0.34, 0.03, DECK.z1 - DECK.z0]} m={mats.oak} recv />
      <B p={[DECK.x0, 0.03, (DECK.z0 + DECK.z1) / 2]} s={[0.1, 0.06, DECK.z1 - DECK.z0]} m={mats.walnut} />
      <B p={[(DECK.x0 + DECK.x1) / 2, 0.03, DECK.z0]} s={[DECK.x1 - DECK.x0, 0.06, 0.1]} m={mats.walnut} />
      <B p={[(DECK.x0 + DECK.x1) / 2, 0.015, DECK.z0 - 0.16]} s={[DECK.x1 - DECK.x0, 0.03, 0.34]} m={mats.oak} recv />

      {POSTS.map(([x, z]) => (
        <Cyl key={String(x) + ":" + String(z)} p={[x, 1.24, z]} s={[0.08, 2.48, 0.08]} m={mats.darkWood} cast />
      ))}
      <Instanced geo={GEO.box} m={mats.black} items={cables} />
      <Instanced geo={GEO.sphereLow} m={mats.bulb} items={bulbs} />

      {/* striped outdoor rug between the loungers */}
      <B p={[7.4, 0.06, 5.4]} s={[2.4, 0.01, 3.4]} m={mats.cream} />
      {[-1.2, -0.6, 0, 0.6, 1.2].map((dz) => (
        <B key={dz} p={[7.4, 0.066, 5.4 + dz]} s={[2.4, 0.01, 0.16]} m={mats.navy} />
      ))}
      <Cyl p={[7.4, 0.5, 3.0]} s={[0.5, 0.04, 0.5]} m={mats.white} cast />
      <Cyl p={[7.4, 0.25, 3.0]} s={[0.06, 0.5, 0.06]} m={mats.metal} />
      <Cyl p={[7.34, 0.6, 2.96]} s={[0.1, 0.16, 0.1]} m={mats.glass} />
      <Cyl p={[7.34, 0.57, 2.96]} s={[0.08, 0.1, 0.08]} m={mats.mustard} />

      <PottedPlant x={5.5} z={1.0} mats={mats} kind="fig" scale={1.1} />
      <PottedPlant x={8.85} z={1.75} mats={mats} kind="olive" />
      <PottedPlant x={8.4} z={8.6} mats={mats} kind="fern" scale={0.9} />

      {/* console table by the entry, where everyone spawns */}
      <B p={[6.5, 0.42, -3.1]} s={[1.0, 0.05, 0.36]} m={mats.oak} cast />
      {[6.1, 6.9].map((x) => (
        <B key={x} p={[x, 0.2, -3.1]} s={[0.05, 0.4, 0.3]} m={mats.oak} />
      ))}
      <Cyl p={[6.3, 0.49, -3.1]} s={[0.24, 0.08, 0.24]} m={mats.brass} />
      <Cyl p={[6.8, 0.6, -3.1]} s={[0.13, 0.32, 0.13]} m={mats.blush} />
      <Sph p={[6.8, 0.83, -3.1]} s={[0.24, 0.18, 0.24]} m={mats.leafLight} />
    </>
  );
}
