import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cone, Cyl, FloorPatch, GEO, HALF, Instanced, Rug, Sph, arcGeo, noMerge, noRaycast, ringGeo, seeded, type InstanceSpec, type Materials } from "./kit";
import { CUSHIONS, surfaceY } from "@shared/seats";
import { TEA_TABLE } from "@shared/props";
import { LOUNGE_PIT } from "@shared/types";

const PIT = LOUNGE_PIT;
const PIT_Y = -PIT.depth;

// A 20x20 "cozy modern loft", laid out as one connected home rather than furniture pushed
// against the walls:
//   - the LIVING ROOM is the heart of the floor: an L-sofa on a big cream rug, facing a media
//     console that stands on a slatted oak screen;
//   - behind that screen, the GAME DEN (desk, arcades, beanbags by a tall bookcase);
//   - the KITCHEN runs along the back wall and its island continues straight into a long
//     farmhouse DINING table;
//   - a low bookshelf behind the sofa divides the living room from the TEA CORNER (low table,
//     floor cushions) and the VINYL NOOK in the front-left;
//   - the BALCONY deck on the front-right, where everyone arrives.
// Coordinates match shared/collision.ts and shared/props.ts: when something moves here, its
// obstacle box and any approach point that passes it must move too (npm run check-layout).
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
      <TeaCorner mats={mats} />
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
      <FloorPatch x0={TILE_X0} x1={HALF} z0={-INNER} z1={-4.0} y={0.006} m={mats.tile} />
      <KitchenTileGrid mats={mats} />
      {/* The living room's big hand-woven rug, in the middle of the floor: cream with a caramel
          border and two woven stripes. */}
      <FloorPatch x0={PIT.x0 + 0.25} x1={PIT.x1 - 0.25} z0={PIT.z0 + 0.25} z1={PIT.z1 - 0.25} y={PIT_Y + 0.008} m={mats.rugBorder} />
      <FloorPatch x0={PIT.x0 + 0.45} x1={PIT.x1 - 0.45} z0={PIT.z0 + 0.45} z1={PIT.z1 - 0.45} y={PIT_Y + 0.012} m={mats.denCarpet} />
      <FloorPatch x0={PIT.x0 + 0.45} x1={PIT.x1 - 0.45} z0={-2.9} z1={-2.75} y={PIT_Y + 0.014} m={mats.rugBorder} />
      <FloorPatch x0={PIT.x0 + 0.45} x1={PIT.x1 - 0.45} z0={1.05} z1={1.2} y={PIT_Y + 0.014} m={mats.rugBorder} />
      {/* the studio den's rug: sage with a caramel border */}
      <FloorPatch x0={-8.3} x1={-3.9} z0={-9.0} z1={-4.9} y={0.008} m={mats.rugBorder} />
      <FloorPatch x0={-8.15} x1={-4.05} z0={-8.85} z1={-5.05} y={0.012} m={mats.sage} />
      {/* The reading & tea lounge: one big rug under the vinyl nook AND the tea table, so the
          front of the room is a single zone with real visual weight instead of two islands. */}
      <FloorPatch x0={-8.8} x1={-0.6} z0={2.9} z1={8.4} y={0.008} m={mats.rugBorder} />
      <FloorPatch x0={-8.6} x1={-0.8} z0={3.1} z1={8.2} y={0.012} m={mats.denCarpet} />
      <FloorPatch x0={-8.6} x1={-0.8} z0={3.5} z1={3.65} y={0.014} m={mats.terracotta} />
      <FloorPatch x0={-8.6} x1={-0.8} z0={7.65} z1={7.8} y={0.014} m={mats.terracotta} />
      {/* a runner under the farmhouse table */}
      <FloorPatch x0={-0.6} x1={3.2} z0={-7.5} z1={-4.9} y={0.012} m={mats.terracotta} />
      <FloorPatch x0={-0.45} x1={3.05} z0={-7.35} z1={-5.05} y={0.014} m={mats.blush} />

      {/* gallery wall + a clock with real hands */}
      <WallFrame x={-INNER + 0.01} y={2.0} z={-1.4} w={0.8} h={1.0} art={mats.terracotta} mats={mats} onLeftWall />
      <WallFrame x={-INNER + 0.01} y={2.25} z={0.0} w={0.58} h={0.58} art={mats.sage} mats={mats} onLeftWall />
      <WallFrame x={-INNER + 0.01} y={1.55} z={0.0} w={0.58} h={0.44} art={mats.mustard} mats={mats} onLeftWall />
      <WallClock x={-INNER + 0.02} y={2.05} z={1.5} mats={mats} />
      <PottedPlant x={-9.2} z={-9.2} mats={mats} kind="monstera" scale={0.9} />
    </>
  );
}

/** Where the kitchen-and-dining tiles start (they run to the right-hand edge). */
const TILE_X0 = -0.9;

/** Grout lines over the kitchen floor patch, so the tiles read as tiles. */
function KitchenTileGrid({ mats }: { mats: Materials }) {
  const lines = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    const x0 = TILE_X0;
    const x1 = HALF;
    const z0 = -INNER;
    const z1 = -4.0;
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
  y = 0,
}: {
  x: number;
  z: number;
  mats: Materials;
  kind?: "fig" | "snake" | "olive" | "fern" | "monstera";
  scale?: number;
  /** Height of whatever the pot stands on (0 = the floor). */
  y?: number;
}) {
  return (
    <group position={[x, y, z]} scale={scale}>
      <Cyl p={[0, 0.26, 0]} s={[0.62, 0.52, 0.62]} m={mats.terracotta} cast recv />
      {/* Soil is a solid unlit cylinder with shadows off both ways — see mats.soil. */}
      <Cyl p={[0, 0.48, 0]} s={[0.54, 0.1, 0.54]} m={mats.soil} />
      {kind === "fig" && (
        <>
          <Cyl p={[0, 1.0, 0]} s={[0.07, 1.0, 0.07]} m={mats.bark} />
          {/* big fiddle leaves clustered on the trunk: each leaf's inner end overlaps the stem,
              so nothing hangs in the air */}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = i * 1.9;
            const y = 1.15 + (i % 3) * 0.24;
            return <Sph key={i} p={[Math.sin(a) * 0.19, y, Math.cos(a) * 0.19]} s={[0.4, 0.34, 0.18]} r={[0.35, a, 0]} m={i % 2 ? mats.leaf : mats.leafLight} cast />;
          })}
          <Sph p={[0, 1.78, 0]} s={[0.34, 0.26, 0.34]} m={mats.leafLight} cast />
        </>
      )}
      {kind === "snake" &&
        // tapered blades fanning out of the soil, in two greens
        [0, 1, 2, 3, 4, 5].map((i) => {
          const a = i * 1.05;
          return <Cone key={i} p={[Math.sin(a) * 0.1, 0.5 + 0.3 * ((i % 3) + 1) * 0.5, Math.cos(a) * 0.1]} s={[0.16, 0.6 + (i % 3) * 0.3, 0.05]} r={[Math.cos(a) * 0.22, a, -Math.sin(a) * 0.22]} m={i % 2 ? mats.leaf : mats.sageDark} cast />;
        })}
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
      {kind === "monstera" && (
        <>
          <Cyl p={[0, 0.72, 0]} s={[0.06, 0.5, 0.06]} m={mats.bark} />
          {[
            [0, 1.18, 0, 0.62],
            [0.26, 1.02, 0.1, 0.44],
            [-0.24, 1.05, -0.08, 0.46],
            [0.05, 1.0, -0.26, 0.42],
            [-0.06, 1.44, 0.04, 0.4],
          ].map(([x, y, z, r], i) => (
            <Sph key={i} p={[x, y, z]} s={[r, r * 0.86, r]} m={i % 2 ? mats.leafLight : mats.leaf} cast />
          ))}
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Living room: L-sofa opening onto the middle of the room, TV on the back wall
// ---------------------------------------------------------------------------------------

const SOFA = CUSHIONS.loungeSofa;
const SOFA_TOP = surfaceY(SOFA);

function LivingRoom({ mats }: { mats: Materials }) {
  return (
    <>
      <SlatScreen mats={mats} x0={-5.4} x1={-0.6} z={-3.95} />

      {/* media console standing against the screen; the TV on it is the "tv" prop, and its
          middle bay is the hearth: a glass firebox with a bed of embers and real flames */}
      <B p={[-3.0, 0.3, -3.55]} s={[3.2, 0.6, 0.6]} m={mats.walnut} cast recv />
      {[-4.05, -1.95].map((x) => (
        <B key={x} p={[x, 0.3, -3.24]} s={[0.95, 0.44, 0.02]} m={mats.darkWood} />
      ))}
      <Hearth mats={mats} />
      <PottedPlant x={-4.35} z={-3.6} y={0.6} mats={mats} kind="snake" scale={0.5} />
      <Cyl p={[-1.7, 0.72, -3.6]} s={[0.2, 0.24, 0.2]} m={mats.blush} />
      <Cyl p={[-1.45, 0.66, -3.55]} s={[0.1, 0.12, 0.1]} m={mats.warmGlow} />

      {/* The conversation pit: the floor steps down PIT.depth inside PIT (walkY in
          shared/collision.ts), with a walnut lip, a warm light strip under it, and the sofa,
          coffee table and side table all sitting on the lower floor. */}
      <PitRim mats={mats} />
      <group position={[0, PIT_Y, 0]}>
      {/* L-sofa facing the TV: the long run across the rug, the return leg on its left */}
      <B p={[-3.0, 0.21, 1.0]} s={[4.4, 0.42, 1.1]} m={mats.sage} cast recv />
      <B p={[-3.0, 0.58, 1.46]} s={[4.4, 0.75, 0.2]} m={mats.sageDark} cast recv />
      <B p={[-0.7, 0.44, 1.0]} s={[0.2, 0.46, 1.1]} m={mats.sageDark} cast />
      <B p={[-5.6, 0.21, -0.4]} s={[1.1, 0.42, 2.4]} m={mats.sage} cast recv />
      <B p={[-6.06, 0.58, -0.1]} s={[0.2, 0.75, 3.1]} m={mats.sageDark} cast recv />
      <B p={[-5.6, 0.44, -1.62]} s={[1.1, 0.46, 0.2]} m={mats.sageDark} cast />
      {/* ONE flush cushion platform across both legs of the L (CUSHIONS.loungeSofa, which the
          seats' anchor height is derived from): no stepped trench between modules, just two
          stitched seams drawn on top */}
      <B p={[-3.43, SOFA.y, 0.96]} s={[5.26, SOFA.h, 0.92]} m={mats.sage} />
      <B p={[-5.6, SOFA.y, -0.475]} s={[0.92, SOFA.h, 1.95]} m={mats.sage} />
      {[-3.7, -2.3].map((x) => (
        <B key={x} p={[x, SOFA_TOP + 0.002, 0.96]} s={[0.02, 0.004, 0.9]} m={mats.sageDark} />
      ))}
      <B p={[-5.6, SOFA_TOP + 0.002, 0.5]} s={[0.9, 0.004, 0.02]} m={mats.sageDark} />
      {/* throw pillows on the seat, and a blanket folded over the return leg */}
      <B p={[-4.7, 0.68, 1.16]} s={[0.4, 0.36, 0.14]} r={[0.25, 0, 0.08]} m={mats.mustard} cast />
      <B p={[-1.3, 0.68, 1.16]} s={[0.4, 0.36, 0.14]} r={[0.25, 0, -0.08]} m={mats.terracotta} cast />
      <B p={[-5.84, 0.68, -1.15]} s={[0.13, 0.38, 0.4]} r={[0, 0, 0.14]} m={mats.blush} cast />
      <B p={[-5.55, 0.53, -1.1]} s={[0.8, 0.04, 0.55]} r={[0, 0.2, 0]} m={mats.rust} />

      {/* marble coffee table with a tray, mugs, a book and a vase of tulips */}
      <B p={[-3.0, 0.4, -1.3]} s={[2.2, 0.08, 0.9]} m={mats.marble} cast recv />
      <B p={[-3.0, 0.18, -1.3]} s={[1.8, 0.36, 0.6]} m={mats.walnut} cast />
      <B p={[-3.5, 0.46, -1.3]} s={[0.6, 0.04, 0.4]} m={mats.brass} />
      <Cyl p={[-3.62, 0.52, -1.34]} s={[0.1, 0.1, 0.1]} m={mats.white} />
      <Cyl p={[-3.36, 0.52, -1.22]} s={[0.1, 0.1, 0.1]} m={mats.terracotta} />
      <B p={[-2.7, 0.47, -1.16]} s={[0.32, 0.06, 0.24]} m={mats.navy} r={[0, 0.3, 0]} />
      <Cyl p={[-2.1, 0.53, -1.2]} s={[0.12, 0.18, 0.12]} m={mats.blush} />
      {[-0.05, 0, 0.05].map((dx, i) => (
        <group key={dx}>
          <Cyl p={[-2.1 + dx * 1.2, 0.74, -1.2 + (i - 1) * 0.02]} s={[0.025, 0.26, 0.025]} r={[0, 0, -dx * 2.2]} m={mats.olive} />
          <Sph p={[-2.1 + dx * 1.7, 0.87, -1.2 + (i - 1) * 0.03]} s={[0.07, 0.09, 0.07]} m={i === 1 ? mats.mustard : mats.terracotta} />
        </group>
      ))}

      {/* a little round side table beside the armchair across from the sofa */}
      <Cyl p={[0.6, 0.5, 0.35]} s={[0.5, 0.04, 0.5]} m={mats.oak} cast />
      <Cyl p={[0.6, 0.25, 0.35]} s={[0.06, 0.5, 0.06]} m={mats.walnut} />
      <Cyl p={[0.55, 0.58, 0.32]} s={[0.1, 0.12, 0.1]} m={mats.sage} />
      </group>

      {/* the low bookshelf behind the sofa: a soft partition from the tea corner */}
      <B p={[-3.0, 0.36, 1.95]} s={[4.2, 0.72, 0.4]} m={mats.oak} cast recv />
      <B p={[-3.0, 0.73, 1.95]} s={[4.3, 0.04, 0.44]} m={mats.walnut} />
      <LowShelfBooks mats={mats} />
      <PottedPlant x={-4.45} z={1.95} mats={mats} kind="fern" scale={0.45} y={0.75} />
      <Cyl p={[-1.3, 0.84, 1.95]} s={[0.16, 0.18, 0.16]} m={mats.terracotta} />

      {/* big plants bookending the room's heart */}
      <PottedPlant x={-6.4} z={-3.5} mats={mats} kind="monstera" scale={1.1} />
      <PottedPlant x={-0.2} z={2.2} mats={mats} kind="olive" scale={0.85} />
    </>
  );
}

/** The pit's walnut lip and walls, and the warm LED strip glowing under the lip. */
function PitRim({ mats }: { mats: Materials }) {
  const w = PIT.x1 - PIT.x0;
  const d = PIT.z1 - PIT.z0;
  const cx = (PIT.x0 + PIT.x1) / 2;
  const cz = (PIT.z0 + PIT.z1) / 2;
  const h = PIT.depth;
  return (
    <>
      {/* walls, just inside the cut, from the pit floor up to the rim */}
      <B p={[cx, -h / 2, PIT.z0 + 0.03]} s={[w, h, 0.06]} m={mats.walnut} />
      <B p={[cx, -h / 2, PIT.z1 - 0.03]} s={[w, h, 0.06]} m={mats.walnut} />
      <B p={[PIT.x0 + 0.03, -h / 2, cz]} s={[0.06, h, d]} m={mats.walnut} />
      <B p={[PIT.x1 - 0.03, -h / 2, cz]} s={[0.06, h, d]} m={mats.walnut} />
      {/* the lip: a rounded-off nosing half over the cut */}
      <B p={[cx, 0.02, PIT.z0]} s={[w + 0.3, 0.04, 0.3]} m={mats.oak} />
      <B p={[cx, 0.02, PIT.z1]} s={[w + 0.3, 0.04, 0.3]} m={mats.oak} />
      <B p={[PIT.x0, 0.02, cz]} s={[0.3, 0.04, d]} m={mats.oak} />
      <B p={[PIT.x1, 0.02, cz]} s={[0.3, 0.04, d]} m={mats.oak} />
      {/* the light strip under the lip, a warm line all the way round */}
      <B p={[cx, -0.03, PIT.z0 + 0.07]} s={[w - 0.2, 0.012, 0.02]} m={mats.warmGlow} />
      <B p={[cx, -0.03, PIT.z1 - 0.07]} s={[w - 0.2, 0.012, 0.02]} m={mats.warmGlow} />
      <B p={[PIT.x0 + 0.07, -0.03, cz]} s={[0.02, 0.012, d - 0.2]} m={mats.warmGlow} />
      <B p={[PIT.x1 - 0.07, -0.03, cz]} s={[0.02, 0.012, d - 0.2]} m={mats.warmGlow} />
    </>
  );
}

const FLAME_OUTER = new THREE.MeshBasicMaterial({ color: "#ff8a3d", toneMapped: false });
const FLAME_INNER = new THREE.MeshBasicMaterial({ color: "#fff1b8", toneMapped: false });
const EMBER = new THREE.MeshBasicMaterial({ color: "#ff5a2a", toneMapped: false });

/** The hearth in the console's middle bay: a dark firebox, glowing embers, three dancing flames. */
function Hearth({ mats }: { mats: Materials }) {
  const flamesRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = flamesRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((f, i) => {
      const flicker = 0.85 + Math.sin(t * 9 + i * 2.1) * 0.12 + Math.sin(t * 17 + i) * 0.06;
      f.scale.set(0.16 * (0.9 + Math.sin(t * 7 + i) * 0.1), 0.3 * flicker, 0.1);
      f.rotation.z = Math.sin(t * 5 + i * 1.7) * 0.12;
    });
  });
  return (
    <group position={[-3.0, 0.3, -3.3]}>
      {/* the black steel surround and the cavity behind it */}
      <B p={[0, 0, 0.03]} s={[0.98, 0.5, 0.06]} m={mats.black} />
      <B p={[0, 0, 0.02]} s={[0.84, 0.38, 0.02]} m={mats.charcoal} />
      {/* the ember bed */}
      <B p={[0, -0.16, 0.03]} s={[0.8, 0.03, 0.06]} m={EMBER} />
      {[-0.28, -0.1, 0.1, 0.26].map((x) => (
        <Cyl key={x} p={[x, -0.12, 0.04]} s={[0.08, 0.14, 0.08]} r={[0, 0, Math.PI / 2]} m={mats.bark} />
      ))}
      <group ref={flamesRef} position={[0, -0.02, 0.05]} userData={noMerge}>
        {[-0.2, 0.02, 0.2].map((x, i) => (
          <mesh key={x} geometry={GEO.cone} material={i === 1 ? FLAME_INNER : FLAME_OUTER} position={[x, 0, 0]} raycast={noRaycast} />
        ))}
      </group>
      {/* the glass front */}
      <B p={[0, 0, 0.07]} s={[0.86, 0.4, 0.01]} m={mats.glass} />
    </group>
  );
}

/** A slatted oak screen: open vertical battens between a top and bottom rail. */
function SlatScreen({ mats, x0, x1, z }: { mats: Materials; x0: number; x1: number; z: number }) {
  const slats = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (let x = x0 + 0.08; x < x1; x += 0.22) out.push({ p: [x, 1.15, z], s: [0.07, 2.2, 0.09] });
    return out;
  }, [x0, x1, z]);
  return (
    <>
      <Instanced geo={GEO.box} m={mats.oak} items={slats} cast />
      <B p={[(x0 + x1) / 2, 2.27, z]} s={[x1 - x0, 0.07, 0.14]} m={mats.walnut} cast />
      <B p={[(x0 + x1) / 2, 0.05, z]} s={[x1 - x0, 0.1, 0.16]} m={mats.walnut} />
    </>
  );
}

/** Books along the low shelf behind the sofa, one instanced draw. */
function LowShelfBooks({ mats }: { mats: Materials }) {
  const books = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(88);
    const colors = ["#c4714a", "#2f3f5c", "#e0a93b", "#7d9471", "#a8553a", "#f0e6d2"];
    const out: InstanceSpec[] = [];
    let x = -4.9;
    while (x < -1.5) {
      const w = 0.06 + rand() * 0.05;
      const h = 0.22 + rand() * 0.1;
      if (x > -4.75 && x < -4.15) {
        x += 0.1; // leave room for the plant
        continue;
      }
      out.push({ p: [x + w / 2, 0.75 + h / 2, 1.95], s: [w, h, 0.28], r: [0, 0, rand() < 0.1 ? 0.15 : 0], color: colors[Math.floor(rand() * colors.length)] });
      x += w + 0.01;
    }
    return out;
  }, []);
  return <Instanced geo={GEO.box} m={mats.tintable} items={books} />;
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
      <CoffeeStation mats={mats} />

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

function CoffeeStation({ mats }: { mats: Materials }) {
  const steamRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = steamRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((puff, i) => {
      const mug = i < 3 ? 0 : 1;
      const p = (t * 0.45 + (i % 3) / 3) % 1;
      puff.position.set(mug * 0.36 + Math.sin(p * 5 + i) * 0.03, 0.12 + p * 0.38, Math.cos(p * 4 + i) * 0.02);
      puff.scale.setScalar(0.035 + p * 0.07);
    });
  });
  return (
    <group position={[4.5, 0.96, -9.35]}>
      {/* drip brewer: base, carafe, filter hood */}
      <B p={[0, 0.03, 0]} s={[0.36, 0.06, 0.3]} m={mats.black} />
      <B p={[0, 0.3, -0.1]} s={[0.36, 0.56, 0.12]} m={mats.black} />
      <B p={[0, 0.54, 0.02]} s={[0.36, 0.1, 0.3]} m={mats.black} />
      <Cyl p={[0, 0.14, 0.04]} s={[0.2, 0.2, 0.2]} m={mats.glass} />
      <Cyl p={[0, 0.1, 0.04]} s={[0.18, 0.1, 0.18]} m={mats.darkWood} />
      <B p={[0.13, 0.36, 0.06]} s={[0.04, 0.04, 0.02]} m={mats.warmGlow} />
      {/* teapot */}
      <group position={[-0.48, 0, 0.02]}>
        <Sph p={[0, 0.13, 0]} s={[0.26, 0.22, 0.26]} m={mats.terracotta} />
        <Cyl p={[0, 0.25, 0]} s={[0.1, 0.03, 0.1]} m={mats.terracotta} />
        <Cyl p={[0.14, 0.15, 0]} s={[0.04, 0.16, 0.04]} r={[0, 0, -0.9]} m={mats.terracotta} />
      </group>
      {/* two mugs, steaming */}
      <group position={[0.36, 0, 0.1]}>
        <Cyl p={[0, 0.06, 0]} s={[0.14, 0.12, 0.14]} m={mats.white} />
        <Cyl p={[0.36, 0.06, 0]} s={[0.14, 0.12, 0.14]} m={mats.sage} />
        <group ref={steamRef} userData={noMerge}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} geometry={GEO.sphereLow} material={mats.foam} raycast={noRaycast} />
          ))}
        </group>
      </group>
      {/* a jar of tea tins and a sugar pot */}
      <Cyl p={[-0.9, 0.1, 0.05]} s={[0.14, 0.2, 0.14]} m={mats.mustard} />
      <Cyl p={[-1.08, 0.08, 0.05]} s={[0.12, 0.16, 0.12]} m={mats.sage} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Dining: a long farmhouse table running straight on from the kitchen island, so cooking,
// the bar stools and dinner are one continuous social line. shared/props.ts places the chairs.
// ---------------------------------------------------------------------------------------

function DiningSet({ mats }: { mats: Materials }) {
  return (
    <>
      <B p={[1.3, 0.74, -6.2]} s={[2.7, 0.08, 1.3]} m={mats.oak} cast recv />
      {[-0.0, 2.6].map((x) =>
        [-6.7, -5.7].map((z) => <B key={`${x}${z}`} p={[x, 0.36, z]} s={[0.1, 0.72, 0.1]} m={mats.walnut} cast />)
      )}
      {/* runner, a jug of wildflowers and four place settings */}
      <B p={[1.3, 0.79, -6.2]} s={[2.3, 0.01, 0.4]} m={mats.cream} />
      <Cyl p={[1.3, 0.92, -6.2]} s={[0.18, 0.28, 0.18]} m={mats.glass} />
      <Cyl p={[1.3, 0.9, -6.2]} s={[0.15, 0.2, 0.15]} m={mats.seaShallow} />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = i * 1.3;
        const lean = 0.18 + (i % 2) * 0.08;
        return (
          <group key={i}>
            <Cyl p={[1.3 + Math.sin(a) * 0.05, 1.03, -6.2 + Math.cos(a) * 0.05]} s={[0.02, 0.3, 0.02]} r={[Math.cos(a) * lean, 0, -Math.sin(a) * lean]} m={mats.olive} />
            <Sph p={[1.3 + Math.sin(a) * 0.09, 1.19 + (i % 2) * 0.03, -6.2 + Math.cos(a) * 0.09]} s={0.065} m={i % 2 ? mats.mustard : mats.blush} />
          </group>
        );
      })}
      {[
        [0.7, -5.75],
        [1.9, -5.75],
        [0.7, -6.65],
        [1.9, -6.65],
      ].map(([x, z]) => (
        <group key={`${x}${z}`}>
          <Cyl p={[x, 0.79, z]} s={[0.36, 0.02, 0.36]} m={mats.white} />
          <Cyl p={[x, 0.81, z]} s={[0.2, 0.02, 0.2]} m={mats.terracotta} />
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Gamer corner: streamer desk along the left wall, two arcade cabinets on the back wall
// ---------------------------------------------------------------------------------------

function GamerCorner({ mats }: { mats: Materials }) {
  const books = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(311);
    const colors = ["#c4714a", "#2f3f5c", "#e0a93b", "#7d9471", "#a8553a", "#f0e6d2", "#5b3a63"];
    const out: InstanceSpec[] = [];
    for (const y of [0.42, 1.02, 1.62]) {
      let x = -3.55;
      while (x < -1.05) {
        const w = 0.06 + rand() * 0.05;
        const h = 0.26 + rand() * 0.14;
        if (rand() < 0.1) {
          x += 0.25; // a gap for a trinket
          continue;
        }
        out.push({ p: [x + w / 2, y + h / 2, -9.55], s: [w, h, 0.3], color: colors[Math.floor(rand() * colors.length)] });
        x += w + 0.012;
      }
    }
    return out;
  }, []);

  const board = useMemo<InstanceSpec[]>(() => {
    // a checkered game board on the round table, four by four, with a few pieces on it
    const out: InstanceSpec[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.push({ p: [-8.2 - 0.3 + i * 0.2, 0.755, -7.0 - 0.3 + j * 0.2], s: [0.19, 0.01, 0.19], color: (i + j) % 2 ? "#4a2f1d" : "#f0e6d2" });
    return out;
  }, []);
  return (
    <>
      {/* the board-game table: a round oak top on a turned pedestal, its three chairs are seats */}
      <Cyl p={[-8.2, 0.72, -7.0]} s={[1.5, 0.06, 1.5]} m={mats.oak} cast recv />
      <Cyl p={[-8.2, 0.36, -7.0]} s={[0.16, 0.66, 0.16]} m={mats.walnut} cast />
      <Cyl p={[-8.2, 0.04, -7.0]} s={[0.8, 0.08, 0.8]} m={mats.walnut} />
      <Instanced geo={GEO.box} m={mats.tintable} items={board} />
      {[
        [-8.5, -7.3, mats.terracotta],
        [-8.1, -6.9, mats.terracotta],
        [-7.9, -7.3, mats.navy],
        [-8.3, -6.7, mats.navy],
      ].map(([x, z, m], i) => (
        <Cyl key={i} p={[x as number, 0.78, z as number]} s={[0.1, 0.04, 0.1]} m={m as THREE.Material} />
      ))}
      <Cyl p={[-7.7, 0.82, -7.5]} s={[0.14, 0.14, 0.14]} m={mats.white} />
      <B p={[-8.75, 0.78, -6.5]} s={[0.3, 0.06, 0.22]} r={[0, 0.5, 0]} m={mats.rust} />

      {/* an oak-framed cork board over the desk, pinned with sketches and photos */}
      <group position={[-INNER + 0.02, 2.2, -7.2]} rotation={[0, Math.PI / 2, 0]}>
        <B p={[0, 0, 0]} s={[1.6, 0.9, 0.04]} m={mats.oak} />
        <B p={[0, 0, 0.025]} s={[1.46, 0.76, 0.01]} m={mats.rugBorder} />
        {[
          [-0.5, 0.12, mats.cream],
          [-0.12, -0.14, mats.sage],
          [0.22, 0.14, mats.blush],
          [0.52, -0.1, mats.white],
        ].map(([x, y, m], i) => (
          <B key={i} p={[x as number, y as number, 0.035]} s={[0.26, 0.2, 0.005]} r={[0, 0, (i - 1.5) * 0.08]} m={m as THREE.Material} />
        ))}
      </group>
      {/* framed prints over the two arcade cabinets on the back wall */}
      <WallFrame x={-7.0} y={2.3} z={-INNER + 0.01} w={0.55} h={0.38} art={mats.terracotta} mats={mats} />
      <WallFrame x={-5.6} y={2.3} z={-INNER + 0.01} w={0.55} h={0.38} art={mats.sage} mats={mats} />

      {/* a tall bookcase on the back wall, with two beanbags in front of it */}
      <B p={[-2.3, 1.1, -9.55]} s={[2.7, 2.2, 0.45]} m={mats.walnut} cast recv />
      {[0.4, 1.0, 1.6].map((y) => (
        <B key={y} p={[-2.3, y, -9.36]} s={[2.62, 0.04, 0.1]} m={mats.darkWood} />
      ))}
      <Instanced geo={GEO.box} m={mats.tintable} items={books} />
      <PottedPlant x={-2.3} z={-9.5} y={2.2} mats={mats} kind="fern" scale={0.5} />
      <Beanbag x={-3.3} z={-7.3} m={mats.mustard} mats={mats} />
      <Beanbag x={-1.6} z={-7.3} m={mats.sage} mats={mats} />
      {/* the console lounge: a retro set on a crate in front of the bookcase, which the beanbags
          face, with the console and two controllers on the floor between them */}
      <group position={[-2.45, 0, -8.5]}>
        <B p={[0, 0.25, 0]} s={[1.0, 0.5, 0.7]} m={mats.walnut} cast recv />
        <B p={[0, 0.78, 0.02]} s={[0.76, 0.54, 0.5]} m={mats.charcoal} cast />
        <B p={[0, 0.8, 0.28]} s={[0.6, 0.4, 0.02]} m={mats.screenGlow} />
        <Cyl p={[0.26, 1.15, -0.1]} s={[0.02, 0.36, 0.02]} r={[0, 0, -0.5]} m={mats.metal} />
        <B p={[-0.2, 0.54, 0.42]} s={[0.3, 0.08, 0.2]} m={mats.black} />
      </group>
      <B p={[-3.0, 0.03, -7.9]} s={[0.22, 0.06, 0.12]} r={[0, 0.3, 0]} m={mats.mustard} />
      <B p={[-1.9, 0.03, -7.9]} s={[0.22, 0.06, 0.12]} r={[0, -0.4, 0]} m={mats.sage} />
    </>
  );
}

/** Wisps of steam curling up from the teapot. */
function TeaSteam({ x, y, z, mats }: { x: number; y: number; z: number; mats: Materials }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((puff, i) => {
      const p = (t * 0.35 + i / 4) % 1;
      puff.position.set(Math.sin(p * 6 + i) * 0.05, p * 0.5, Math.cos(p * 5 + i) * 0.04);
      puff.scale.setScalar(0.04 + p * 0.08);
    });
  });
  return (
    <group ref={ref} position={[x, y, z]} userData={noMerge}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={GEO.sphereLow} material={mats.foam} raycast={noRaycast} />
      ))}
    </group>
  );
}

/** A slouchy beanbag for a floor seat (its seat in props.ts is style "pad"). */
function Beanbag({ x, z, m, mats }: { x: number; z: number; m: THREE.Material; mats: Materials }) {
  const seat = CUSHIONS.beanbag;
  return (
    <group position={[x, 0, z]}>
      <Sph p={[0, seat.y, 0]} s={[0.9, seat.h, 0.85]} m={m} cast />
      <Sph p={[0, 0.42, -0.28]} s={[0.72, 0.38, 0.34]} m={m} />
      <Sph p={[0, 0.02, 0]} s={[0.92, 0.04, 0.88]} m={mats.charcoal} />
    </group>
  );
}

/** A plump floor cushion (seat style "pad"). */
function FloorCushion({ x, z, m }: { x: number; z: number; m: THREE.Material }) {
  const top = CUSHIONS.floorCushion; // the plump top; the seat anchor is derived from it
  return (
    <group position={[x, 0, z]}>
      <Cyl p={[0, top.y - 0.08, 0]} s={[0.62, 0.16, 0.62]} m={m} cast />
      <Sph p={[0, top.y, 0]} s={[0.58, top.h, 0.58]} m={m} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Tea corner: a low round table on its own rug with floor cushions, behind the sofa
// ---------------------------------------------------------------------------------------

function TeaCorner({ mats }: { mats: Materials }) {
  const { x, z } = TEA_TABLE;
  return (
    <>
      <Cyl p={[x, 0.3, z]} s={[1.3, 0.06, 1.3]} m={mats.oak} cast recv />
      <Cyl p={[x, 0.14, z]} s={[0.9, 0.28, 0.9]} m={mats.walnut} cast />
      {/* a teapot and three cups, one per cushion */}
      <Sph p={[x, 0.43, z]} s={[0.24, 0.2, 0.24]} m={mats.sage} />
      <Cyl p={[x, 0.54, z]} s={[0.09, 0.03, 0.09]} m={mats.sage} />
      <Cyl p={[x + 0.14, 0.45, z]} s={[0.04, 0.14, 0.04]} r={[0, 0, -0.9]} m={mats.sage} />
      <Cyl p={[x - 0.1, 0.38, z - 0.4]} s={[0.1, 0.1, 0.1]} m={mats.white} />
      <Cyl p={[x + 0.4, 0.38, z + 0.15]} s={[0.1, 0.1, 0.1]} m={mats.white} />
      <Cyl p={[x - 0.15, 0.38, z + 0.42]} s={[0.1, 0.1, 0.1]} m={mats.white} />
      <TeaSteam x={x} y={0.6} z={z} mats={mats} />
      <FloorCushion x={x} z={4.0} m={mats.terracotta} />
      <FloorCushion x={x} z={6.8} m={mats.mustard} />
      <FloorCushion x={-2.9} z={z} m={mats.blush} />
      {/* plants round the edge of the wing */}
      <PottedPlant x={2.5} z={6.4} mats={mats} kind="fig" scale={1.0} />
      <PottedPlant x={-2.0} z={7.7} mats={mats} kind="snake" scale={0.8} />
      <PottedPlant x={1.8} z={3.3} mats={mats} kind="fern" scale={0.8} />
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

  const tierBooks = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(505);
    const colors = ["#c4714a", "#2f3f5c", "#e0a93b", "#7d9471", "#a8553a", "#f0e6d2", "#5b3a63"];
    const out: InstanceSpec[] = [];
    for (const [y, z0, z1] of [
      [1.89, 2.45, 3.35],
      [1.69, 4.35, 5.15],
      [2.32, 2.45, 3.35],
    ]) {
      let z = z0;
      while (z < z1) {
        const w = 0.05 + rand() * 0.04;
        const h = 0.24 + rand() * 0.12;
        out.push({ p: [-9.35, y + h / 2, z + w / 2], s: [0.4, h, w], r: [rand() < 0.1 ? 0.15 : 0, 0, 0], color: colors[Math.floor(rand() * colors.length)] });
        z += w + 0.01;
      }
    }
    return out;
  }, []);
  return (
    <>


      {/* a tiered bookcase against the wall: tall ends stepping down to the middle, where the
          record player stands (the "turntable" prop); records in the low tier, books above */}
      <B p={[-9.35, 1.3, 2.9]} s={[0.62, 2.6, 1.0]} m={mats.walnut} cast recv />
      <B p={[-9.35, 0.85, 3.85]} s={[0.62, 1.7, 0.9]} m={mats.walnut} cast recv />
      <B p={[-9.35, 1.1, 4.75]} s={[0.62, 2.2, 0.9]} m={mats.walnut} cast recv />
      <B p={[-9.35, 0.36, 3.8]} s={[0.66, 0.05, 2.84]} m={mats.darkWood} />
      <B p={[-9.35, 1.08, 3.8]} s={[0.66, 0.05, 2.84]} m={mats.darkWood} />
      <B p={[-9.35, 1.86, 2.9]} s={[0.66, 0.05, 1.04]} m={mats.darkWood} />
      <B p={[-9.35, 1.66, 4.75]} s={[0.66, 0.05, 0.94]} m={mats.darkWood} />
      <Instanced geo={GEO.box} m={mats.tintable} items={sleeves} />
      <Instanced geo={GEO.box} m={mats.tintable} items={tierBooks} />

      {/* the record player on top of the shelf is the interactive "turntable" prop */}

      {/* acoustic guitar on a proper A-frame stand, tucked into the corner by the wall */}
      <group position={[-8.7, 0, 8.0]} rotation={[0, 0.9, 0]}>
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

      {/* a round wooden side table beside the armchair, with a coffee and a little stack of books */}
      <Cyl p={[-6.3, 0.56, 6.7]} s={[0.66, 0.05, 0.66]} m={mats.oak} cast recv />
      <Cyl p={[-6.3, 0.28, 6.7]} s={[0.08, 0.52, 0.08]} m={mats.walnut} cast />
      <Cyl p={[-6.3, 0.03, 6.7]} s={[0.4, 0.05, 0.4]} m={mats.walnut} />
      <B p={[-6.4, 0.61, 6.62]} s={[0.3, 0.05, 0.22]} m={mats.rust} />
      <B p={[-6.4, 0.66, 6.62]} s={[0.28, 0.05, 0.2]} r={[0, 0.25, 0]} m={mats.navy} />
      <Cyl p={[-6.15, 0.64, 6.85]} s={[0.12, 0.13, 0.12]} m={mats.white} />
      <Cyl p={[-6.15, 0.7, 6.85]} s={[0.1, 0.01, 0.1]} m={mats.darkWood} />
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

  // Four low posts at the deck's corners, each crowned with its own lantern. Nothing runs
  // between them overhead — no beams, no cables — so from the camera the terrace is open sky.
  const POSTS: [number, number][] = [
    [4.8, 0.8],
    [9.2, 0.8],
    [9.2, 9.2],
    [4.8, 9.2],
  ];
  const POST_H = 1.1;

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
        <group key={String(x) + ":" + String(z)} position={[x, 0, z]}>
          <B p={[0, POST_H / 2, 0]} s={[0.16, POST_H, 0.16]} m={mats.darkWood} cast />
          <B p={[0, POST_H + 0.02, 0]} s={[0.24, 0.04, 0.24]} m={mats.walnut} />
          <Sph p={[0, POST_H + 0.17, 0]} s={[0.17, 0.22, 0.17]} m={mats.bulb} />
          <Cone p={[0, POST_H + 0.34, 0]} s={[0.24, 0.12, 0.24]} m={mats.black} />
        </group>
      ))}

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
      {/* an indoor-garden edge at mixed heights: a big monstera, and a fern up on a plant stool */}
      <PottedPlant x={9.1} z={7.2} mats={mats} kind="monstera" scale={1.2} />
      <Cyl p={[9.1, 0.22, 3.2]} s={[0.5, 0.44, 0.5]} m={mats.walnut} cast />
      <PottedPlant x={9.1} z={3.2} mats={mats} kind="fern" scale={0.75} y={0.44} />

      {/* The walkway between the kitchen and the deck stays open: no furniture in it. */}
    </>
  );
}
