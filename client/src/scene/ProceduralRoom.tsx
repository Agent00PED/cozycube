import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { MapId } from "@shared/types";
import { ROOM_THEMES, type RoomTheme } from "./roomThemes";

const HALF = 7; // room spans -7..7 on both X and Z (14x14 diorama)
const WALL_HEIGHT = 3;
const SLAB_HEIGHT = 1.1; // thickness of the floating diorama block under the floor

// Decorative meshes never receive pointer events, so click-to-move always reaches the floor
// underneath/behind them regardless of how much clutter is scattered around the room.
const noRaycast = () => null;

interface ProceduralRoomProps {
  mapId: MapId;
  onFloorClick: (x: number, z: number) => void;
}

// Shared material palette. Every small clutter prop pulls from this instead of declaring its
// own <meshStandardMaterial>, which keeps a room full of mugs/books/leaves down to a handful
// of materials — the thing that actually drives draw calls and shader compiles on mobile.
function useSharedMaterials() {
  const materials = useMemo(() => {
    const make = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
    return {
      wood: make("#a8743f"),
      darkWood: make("#5a3a24"),
      walnut: make("#4a2f1d"),
      cream: make("#f0e6d2", { roughness: 0.95 }),
      white: make("#f7f3ea"),
      sage: make("#7d9471"),
      sageDark: make("#6b8060"),
      mustard: make("#e0a93b"),
      terracotta: make("#c4714a"),
      leaf: make("#2f6b3f", { roughness: 0.8 }),
      leafLight: make("#4a8a55", { roughness: 0.8 }),
      charcoal: make("#2b2b30", { roughness: 0.5 }),
      black: make("#14141a", { roughness: 0.45 }),
      metal: make("#9aa0a8", { roughness: 0.35, metalness: 0.6 }),
      stone: make("#6b6b6b", { roughness: 1, flatShading: true }),
      dirt: make("#3b2a1c", { roughness: 1 }),
      bark: make("#4a3524", { roughness: 0.9 }),
      pine: make("#1f4a34", { roughness: 0.85 }),
      pineLight: make("#2a6044", { roughness: 0.85 }),
      // emissive accents
      warmGlow: make("#fff3d6", { emissive: "#ffcf7a", emissiveIntensity: 1.1 }),
      screenGlow: make("#0d0d10", { emissive: "#3a6ea8", emissiveIntensity: 0.5 }),
      neon: make("#7a2ee6", { emissive: "#7a2ee6", emissiveIntensity: 1.5 }),
      // a small fixed set of book spine colors, reused across every shelf and stack
      books: [
        make("#b5453c"),
        make("#3f7a8c"),
        make("#c9913a"),
        make("#6b5a8a"),
        make("#4d7a4a"),
      ] as THREE.MeshStandardMaterial[],
    };
  }, []);

  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => {
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      });
    },
    [materials]
  );

  return materials;
}

type Materials = ReturnType<typeof useSharedMaterials>;

// The diorama shell: a floating slab with a thick visible edge, the room built on its top
// face, and a theme-specific dressing (indoor walls vs. an open-air clearing).
export function ProceduralRoom({ mapId, onFloorClick }: ProceduralRoomProps) {
  const theme = ROOM_THEMES[mapId];
  const mats = useSharedMaterials();

  const floorGeometry = useMemo(() => new THREE.PlaneGeometry(HALF * 2, HALF * 2), []);
  const floorMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.9 }),
    [theme.floor]
  );
  useEffect(() => () => floorMaterial.dispose(), [floorMaterial]);

  const handleFloorClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };

  return (
    <group>
      {/* The floor stays its own thin, single-sided plane rather than the top face of the slab
          box: it is the ONLY click target in the scene, and a box would also hand back hits on
          its sides and underside, which would drop the character in nonsensical places. */}
      <mesh
        geometry={floorGeometry}
        material={floorMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onPointerDown={handleFloorClick}
      />

      <DioramaSlab theme={theme} mats={mats} outdoor={mapId === "campfire_night"} />

      {mapId === "cozy_lounge" ? (
        <>
          <CozyLoungeShell wallColor={theme.wall} mats={mats} />
          <CozyLoungeFurniture mats={mats} />
        </>
      ) : (
        <>
          <CampfireClearingBoundary mats={mats} />
          <CampfireFurniture mats={mats} />
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Diorama base
// ---------------------------------------------------------------------------------------

function DioramaSlab({ theme, mats, outdoor }: { theme: RoomTheme; mats: Materials; outdoor: boolean }) {
  const edgeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.95 }),
    [theme.edge]
  );
  const edgeTopMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: theme.edgeTop, roughness: 1 }),
    [theme.edgeTop]
  );
  useEffect(
    () => () => {
      edgeMaterial.dispose();
      edgeTopMaterial.dispose();
    },
    [edgeMaterial, edgeTopMaterial]
  );

  // Pebbles poking out of the earth cross-section, so the outdoor slab edge reads as soil
  // rather than a painted box.
  const pebbles = useMemo(() => {
    if (!outdoor) return [];
    const out: { pos: [number, number, number]; scale: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * 4;
      const side = Math.floor(t);
      const f = (t % 1) * 2 * HALF - HALF;
      const depth = -0.25 - ((i * 37) % 5) * 0.14;
      const edge = HALF - 0.04;
      const pos: [number, number, number] =
        side === 0 ? [f, depth, edge] : side === 1 ? [edge, depth, f] : side === 2 ? [f, depth, -edge] : [-edge, depth, f];
      out.push({ pos, scale: 0.16 + ((i * 53) % 4) * 0.05 });
    }
    return out;
  }, [outdoor]);

  return (
    <group raycast={noRaycast}>
      {/* main block — sits just below y=0 so it never z-fights with the floor plane */}
      <mesh position={[0, -SLAB_HEIGHT / 2 - 0.005, 0]} castShadow receiveShadow raycast={noRaycast}>
        <boxGeometry args={[HALF * 2, SLAB_HEIGHT, HALF * 2]} />
        <primitive object={edgeMaterial} attach="material" />
      </mesh>

      {/* top band: the soil line outdoors, a wood-grain highlight indoors. Very slightly wider
          than the block so it reads as a distinct stratum instead of co-planar decal. */}
      <mesh position={[0, -0.075, 0]} raycast={noRaycast}>
        <boxGeometry args={[HALF * 2 + 0.02, 0.13, HALF * 2 + 0.02]} />
        <primitive object={edgeTopMaterial} attach="material" />
      </mesh>

      {pebbles.map((p, i) => (
        <mesh key={i} position={p.pos} scale={p.scale} material={mats.stone} raycast={noRaycast} castShadow>
          <sphereGeometry args={[1, 6, 5]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Cozy Lounge
// ---------------------------------------------------------------------------------------

function WallSegment({
  from,
  to,
  color,
  height = WALL_HEIGHT,
}: {
  from: [number, number];
  to: [number, number];
  color: string;
  height?: number;
}) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const midX = (from[0] + to[0]) / 2;
  const midZ = (from[1] + to[1]) / 2;
  // The plane's local +X must lie along the segment. Rotating (1,0,0) by angle around Y gives
  // (cos, 0, -sin), so we need cos = dx/len and sin = -dz/len. Using atan2(dx, dz) here instead
  // (the previous form) rotated every wall 90 degrees off, standing it up perpendicular to its
  // own footprint — which is what was slicing a "partition" through the middle of the lounge.
  const angle = Math.atan2(-dz, dx);

  return (
    <mesh position={[midX, height / 2, midZ]} rotation={[0, angle, 0]} receiveShadow raycast={noRaycast}>
      <planeGeometry args={[length, height]} />
      <meshStandardMaterial color={color} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CozyLoungeShell({ wallColor, mats }: { wallColor: string; mats: Materials }) {
  return (
    <>
      {/* Isometric "open box": only the two walls behind the camera's viewing direction exist.
          No front walls, no side-front walls and no partitions, so the sofa and the desk are
          never occluded from the fixed iso angle. */}
      <WallSegment from={[-HALF, -HALF]} to={[HALF, -HALF]} color={wallColor} /> {/* back-right */}
      <WallSegment from={[-HALF, HALF]} to={[-HALF, -HALF]} color={wallColor} /> {/* back-left */}

      {/* skirting board / baseboard trim along both walls */}
      <mesh position={[0, 0.07, -HALF + 0.05]} material={mats.white} raycast={noRaycast} receiveShadow>
        <boxGeometry args={[HALF * 2, 0.14, 0.1]} />
      </mesh>
      <mesh position={[-HALF + 0.05, 0.07, 0]} material={mats.white} raycast={noRaycast} receiveShadow>
        <boxGeometry args={[0.1, 0.14, HALF * 2]} />
      </mesh>

      {/* window on the back-right wall, warm daylight glow */}
      <group position={[1.9, 2, -6.95]} raycast={noRaycast}>
        <mesh material={mats.warmGlow} raycast={noRaycast}>
          <planeGeometry args={[1.7, 1.3]} />
        </mesh>
        <mesh position={[0, 0, 0.02]} material={mats.white} raycast={noRaycast}>
          <boxGeometry args={[0.05, 1.32, 0.03]} />
        </mesh>
        <mesh position={[0, 0, 0.02]} material={mats.white} raycast={noRaycast}>
          <boxGeometry args={[1.72, 0.05, 0.03]} />
        </mesh>
      </group>

      {/* canvas frames on the back-left wall */}
      <WallArt x={-6.93} z={-2.6} width={0.8} height={1} mat={mats.terracotta} mats={mats} />
      <WallArt x={-6.93} z={-1.2} width={0.65} height={0.65} mat={mats.sage} mats={mats} />
      <WallArt x={-6.93} z={3.6} width={0.7} height={0.85} mat={mats.mustard} mats={mats} />

      {/* floating shelf with a small potted plant, back-right wall */}
      <group position={[-0.4, 1.85, -6.88]} raycast={noRaycast}>
        <mesh material={mats.wood} castShadow raycast={noRaycast}>
          <boxGeometry args={[1, 0.06, 0.24]} />
        </mesh>
        <mesh position={[-0.25, 0.14, 0]} material={mats.terracotta} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[0.1, 0.08, 0.18, 10]} />
        </mesh>
        <mesh position={[-0.25, 0.3, 0]} material={mats.leafLight} castShadow raycast={noRaycast}>
          <sphereGeometry args={[0.15, 10, 8]} />
        </mesh>
        <BookStack x={0.25} y={0.06} z={0} mats={mats} count={3} lying />
      </group>
    </>
  );
}

function WallArt({
  x,
  z,
  width,
  height,
  mat,
  mats,
}: {
  x: number;
  z: number;
  width: number;
  height: number;
  mat: THREE.Material;
  mats: Materials;
}) {
  // On the back-left wall (the x = -5 plane), so the canvas faces +X into the room.
  return (
    <group position={[x, 1.7, z]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
      <mesh material={mats.walnut} castShadow raycast={noRaycast}>
        <boxGeometry args={[width, height, 0.04]} />
      </mesh>
      <mesh position={[0, 0, 0.03]} raycast={noRaycast}>
        <planeGeometry args={[width - 0.1, height - 0.1]} />
        <primitive object={mat} attach="material" />
      </mesh>
    </group>
  );
}

function BookStack({
  x,
  y,
  z,
  mats,
  count = 3,
  lying = false,
}: {
  x: number;
  y: number;
  z: number;
  mats: Materials;
  count?: number;
  lying?: boolean;
}) {
  return (
    <group position={[x, y, z]} raycast={noRaycast}>
      {Array.from({ length: count }).map((_, i) =>
        lying ? (
          <mesh
            key={i}
            position={[0, 0.045 + i * 0.05, 0]}
            rotation={[0, i * 0.25, 0]}
            material={mats.books[i % mats.books.length]}
            castShadow
            raycast={noRaycast}
          >
            <boxGeometry args={[0.26, 0.05, 0.19]} />
          </mesh>
        ) : (
          <mesh
            key={i}
            position={[i * 0.07 - (count - 1) * 0.035, 0.14, 0]}
            rotation={[0, 0, i % 3 === 2 ? 0.16 : 0]}
            material={mats.books[i % mats.books.length]}
            castShadow
            raycast={noRaycast}
          >
            <boxGeometry args={[0.055, 0.28, 0.18]} />
          </mesh>
        )
      )}
    </group>
  );
}

function CozyLoungeFurniture({ mats }: { mats: Materials }) {
  return (
    <>
      {/* ===== Zone 1: Living area — L-shape sage sofa facing the wall TV ===== */}
      {/* long run, backrest on the +Z side so the seat opens toward the TV */}
      <group position={[-2.95, 0, -3.0]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.21, 0]} material={mats.sage} raycast={noRaycast}>
          <boxGeometry args={[3.3, 0.42, 1.1]} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.52, 0.47]} material={mats.sageDark} raycast={noRaycast}>
          <boxGeometry args={[3.3, 0.62, 0.18]} />
        </mesh>
        <mesh castShadow receiveShadow position={[1.65, 0.38, 0]} material={mats.sageDark} raycast={noRaycast}>
          <boxGeometry args={[0.2, 0.34, 1.1]} />
        </mesh>
        {[-0.9, 0.55].map((cx) => (
          <mesh
            key={cx}
            castShadow
            position={[cx, 0.48, 0.3]}
            rotation={[-0.25, 0, cx * 0.12]}
            scale={[1, 1, 0.45]}
            material={mats.mustard}
            raycast={noRaycast}
          >
            <boxGeometry args={[0.36, 0.36, 0.36]} />
          </mesh>
        ))}
      </group>
      {/* return leg running toward the camera, closing the L */}
      <group position={[-5.0, 0, -1.9]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.21, 0]} material={mats.sage} raycast={noRaycast}>
          <boxGeometry args={[2.1, 0.42, 1.1]} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.52, -0.47]} material={mats.sageDark} raycast={noRaycast}>
          <boxGeometry args={[2.1, 0.62, 0.18]} />
        </mesh>
        <mesh castShadow receiveShadow position={[-1.05, 0.38, 0]} material={mats.sageDark} raycast={noRaycast}>
          <boxGeometry args={[0.2, 0.34, 1.1]} />
        </mesh>
        <mesh
          castShadow
          position={[0.5, 0.48, -0.3]}
          rotation={[0.25, 0, 0.1]}
          scale={[1, 1, 0.45]}
          material={mats.mustard}
          raycast={noRaycast}
        >
          <boxGeometry args={[0.36, 0.36, 0.36]} />
        </mesh>
      </group>

      {/* large braided round rug tying the living zone together */}
      <group position={[-2.9, 0, -4.4]} raycast={noRaycast}>
        <mesh
          position={[0, 0.015, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
          material={mats.cream}
          raycast={noRaycast}
        >
          <circleGeometry args={[1.95, 32]} />
        </mesh>
        {[0.8, 1.35, 1.8].map((r) => (
          <mesh key={r} position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.white} raycast={noRaycast}>
            <ringGeometry args={[r - 0.05, r, 36]} />
          </mesh>
        ))}
      </group>

      {/* coffee table + tabletop clutter */}
      <group position={[-2.8, 0, -4.4]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.3, 0]} material={mats.wood} raycast={noRaycast}>
          <boxGeometry args={[1.6, 0.08, 0.9]} />
        </mesh>
        {[
          [-0.7, -0.35],
          [0.7, -0.35],
          [-0.7, 0.35],
          [0.7, 0.35],
        ].map(([lx, lz], i) => (
          <mesh key={i} castShadow position={[lx, 0.13, lz]} material={mats.darkWood} raycast={noRaycast}>
            <cylinderGeometry args={[0.04, 0.04, 0.26, 6]} />
          </mesh>
        ))}
        <CoffeeMug x={-0.4} y={0.34} z={0.05} mats={mats} />
        <BookStack x={0.4} y={0.34} z={-0.05} mats={mats} count={3} lying />
      </group>

      {/* ===== Zone 3: Kitchenette & coffee bar (back-right) ===== */}
      <Kitchenette mats={mats} />

      {/* low bookshelf against the back wall — built as an open carcass (back panel, sides,
          top/bottom, one middle shelf) rather than a solid block, so the books actually sit in
          a visible opening instead of being swallowed by the box */}
      <group position={[0.3, 0, -6.7]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.45, -0.18]} material={mats.darkWood} raycast={noRaycast}>
          <boxGeometry args={[1.6, 0.9, 0.04]} />
        </mesh>
        {[-0.78, 0.78].map((sx) => (
          <mesh key={sx} castShadow receiveShadow position={[sx, 0.45, 0]} material={mats.wood} raycast={noRaycast}>
            <boxGeometry args={[0.04, 0.9, 0.4]} />
          </mesh>
        ))}
        {[0.03, 0.45, 0.88].map((sy) => (
          <mesh key={sy} castShadow receiveShadow position={[0, sy, 0]} material={mats.wood} raycast={noRaycast}>
            <boxGeometry args={[1.6, 0.05, 0.4]} />
          </mesh>
        ))}
        {/* books stand on the lower and middle shelves, pushed toward the open front face */}
        {[0.055, 0.475].map((shelfY) =>
          [-0.5, -0.17, 0.16, 0.49].map((bx) => (
            <BookStack key={`${shelfY}-${bx}`} x={bx} y={shelfY} z={0.04} mats={mats} count={3} />
          ))
        )}
      </group>

      {/* reading lamp beside the sofa, warm orange pool of light */}
      <group position={[-0.8, 0, -2.8]} raycast={noRaycast}>
        <mesh castShadow position={[0, 0.04, 0]} material={mats.darkWood} raycast={noRaycast}>
          <cylinderGeometry args={[0.16, 0.18, 0.08, 12]} />
        </mesh>
        <mesh castShadow position={[0, 0.6, 0]} material={mats.metal} raycast={noRaycast}>
          <cylinderGeometry args={[0.025, 0.025, 1.1, 8]} />
        </mesh>
        <mesh position={[0, 1.24, 0]} material={mats.warmGlow} raycast={noRaycast}>
          <coneGeometry args={[0.24, 0.32, 12, 1, true]} />
        </mesh>
        <pointLight position={[0, 1.15, 0]} intensity={1.4} color="#ffb765" distance={4.5} decay={2} />
      </group>

      {/* floor lamp — right side, out of the walking lane */}
      <group position={[6.25, 0, -3.35]} raycast={noRaycast}>
        <mesh castShadow position={[0, 0.75, 0]} material={mats.charcoal} raycast={noRaycast}>
          <cylinderGeometry args={[0.04, 0.04, 1.5, 8]} />
        </mesh>
        <mesh position={[0, 1.55, 0]} material={mats.warmGlow} raycast={noRaycast}>
          <coneGeometry args={[0.26, 0.35, 12, 1, true]} />
        </mesh>
        <pointLight position={[0, 1.5, 0]} intensity={1} color="#ffdb8a" distance={4} decay={2} />
      </group>

      {/* floor cushion / beanbag — a seat (see MAP_CHAIRS "beanbag"), bridging the living zone
          and the middle of the room. Seat top sits at ~0.42 to match the character's hips. */}
      <group position={[1.0, 0, -0.5]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.2, 0]} scale={[1, 0.58, 1]} material={mats.mustard} raycast={noRaycast}>
          <sphereGeometry args={[0.52, 14, 12]} />
        </mesh>
        <mesh position={[0, 0.36, 0]} scale={[1, 0.3, 1]} material={mats.terracotta} raycast={noRaycast}>
          <sphereGeometry args={[0.32, 12, 10]} />
        </mesh>
      </group>

      {/* small round rug softening the join between the living zone and the beanbag */}
      <mesh
        position={[1.6, 0.012, 1.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        material={mats.cream}
        raycast={noRaycast}
      >
        <circleGeometry args={[1.15, 28]} />
      </mesh>

      {/* monstera plant — tucked into the corner where the two walls meet */}
      <group position={[-6.5, 0, -6.5]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.25, 0]} material={mats.terracotta} raycast={noRaycast}>
          <cylinderGeometry args={[0.28, 0.22, 0.5, 12]} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            castShadow
            position={[Math.sin(i) * 0.15, 0.9 + i * 0.15, Math.cos(i) * 0.15]}
            rotation={[0.3, i, 0.2]}
            scale={[0.5, 0.7, 0.15]}
            material={i % 2 === 0 ? mats.leaf : mats.leafLight}
            raycast={noRaycast}
          >
            <sphereGeometry args={[0.35, 8, 8]} />
          </mesh>
        ))}
      </group>

      {/* ===== Zone 2: Battlestation — long desk flat against the back-left wall ===== */}
      {/* Desk surface at 0.62 rather than the old 0.45: the character shrank, but a desk still
          has to clear a seated player's knees, so it moved the other way. */}
      <group position={[-6.1, 0, 1.8]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.62, 0]} material={mats.charcoal} raycast={noRaycast}>
          <boxGeometry args={[2.8, 0.08, 1.1]} />
        </mesh>
        {[-1.3, 1.3].map((lx) => (
          <mesh key={lx} castShadow position={[lx, 0.31, 0.35]} material={mats.black} raycast={noRaycast}>
            <boxGeometry args={[0.08, 0.62, 0.08]} />
          </mesh>
        ))}
        {/* glowing desk mat under the keyboard */}
        <mesh position={[0, 0.67, 0.18]} rotation={[-Math.PI / 2, 0, 0]} material={mats.neon} raycast={noRaycast}>
          <planeGeometry args={[1.3, 0.5]} />
        </mesh>
        <mesh castShadow position={[0, 0.71, 0.18]} material={mats.black} raycast={noRaycast}>
          <boxGeometry args={[1, 0.05, 0.32]} />
        </mesh>
        {[-0.58, 0.58].map((mx) => (
          <mesh key={mx} castShadow position={[mx, 0.96, -0.3]} material={mats.screenGlow} raycast={noRaycast}>
            <boxGeometry args={[0.7, 0.42, 0.04]} />
          </mesh>
        ))}
        {/* soft backlight strip behind the monitors */}
        <mesh position={[0, 0.96, -0.38]} material={mats.neon} raycast={noRaycast}>
          <boxGeometry args={[1.8, 0.03, 0.02]} />
        </mesh>
        <pointLight position={[0, 1, -0.35]} intensity={0.7} color="#7a5ee6" distance={2.4} decay={2} />
        <mesh castShadow position={[1.15, 0.3, -0.35]} material={mats.black} raycast={noRaycast}>
          <boxGeometry args={[0.38, 0.6, 0.54]} />
        </mesh>
        <mesh position={[1.15, 0.3, -0.07]} material={mats.neon} raycast={noRaycast}>
          <boxGeometry args={[0.02, 0.54, 0.02]} />
        </mesh>
        {/* small trash bin under the desk */}
        <mesh castShadow position={[-1.2, 0.16, 0.1]} material={mats.metal} raycast={noRaycast}>
          <cylinderGeometry args={[0.13, 0.1, 0.32, 10]} />
        </mesh>
      </group>
    </>
  );
}

// Zone 3 — a small coffee bar filling the back-right quarter of the 14x14 room.
function Kitchenette({ mats }: { mats: Materials }) {
  return (
    <group position={[3.7, 0, -6.5]} raycast={noRaycast}>
      {/* counter carcass + wooden worktop */}
      <mesh castShadow receiveShadow position={[0, 0.42, 0]} material={mats.cream} raycast={noRaycast}>
        <boxGeometry args={[3.8, 0.84, 0.9]} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.87, 0]} material={mats.wood} raycast={noRaycast}>
        <boxGeometry args={[3.95, 0.07, 1] } />
      </mesh>
      {/* cabinet doors */}
      {[-1.25, -0.42, 0.42, 1.25].map((dx) => (
        <mesh key={dx} position={[dx, 0.42, 0.46]} material={mats.white} raycast={noRaycast}>
          <boxGeometry args={[0.72, 0.68, 0.03]} />
        </mesh>
      ))}

      {/* espresso machine */}
      <group position={[-1.3, 0.9, 0]} raycast={noRaycast}>
        <mesh castShadow position={[0, 0.26, 0]} material={mats.metal} raycast={noRaycast}>
          <boxGeometry args={[0.6, 0.52, 0.5]} />
        </mesh>
        <mesh position={[0, 0.44, 0.26]} material={mats.black} raycast={noRaycast}>
          <boxGeometry args={[0.34, 0.14, 0.03]} />
        </mesh>
        <mesh castShadow position={[0, 0.12, 0.2]} material={mats.black} raycast={noRaycast}>
          <cylinderGeometry args={[0.05, 0.05, 0.18, 8]} />
        </mesh>
        <mesh position={[0.22, 0.44, 0.26]} material={mats.warmGlow} raycast={noRaycast}>
          <sphereGeometry args={[0.03, 6, 6]} />
        </mesh>
      </group>

      {/* a row of mugs waiting on the worktop */}
      {[-0.25, 0.1, 0.45].map((mx, i) => (
        <mesh
          key={mx}
          castShadow
          position={[mx, 0.97, i % 2 === 0 ? -0.12 : 0.1]}
          material={i === 1 ? mats.terracotta : mats.white}
          raycast={noRaycast}
        >
          <cylinderGeometry args={[0.06, 0.05, 0.12, 10]} />
        </mesh>
      ))}
      <CoffeeMug x={1.15} y={0.91} z={0} mats={mats} />
      <BookStack x={1.6} y={0.91} z={0} mats={mats} count={2} lying />

      {/* minimalist mini fridge at the end of the run */}
      <group position={[2.4, 0, 0.35]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.6, 0]} material={mats.white} raycast={noRaycast}>
          <boxGeometry args={[0.85, 1.2, 0.85]} />
        </mesh>
        <mesh position={[0, 0.78, 0.43]} material={mats.metal} raycast={noRaycast}>
          <boxGeometry args={[0.05, 0.3, 0.03]} />
        </mesh>
        <mesh position={[0, 0.6, 0.43]} material={mats.metal} raycast={noRaycast}>
          <boxGeometry args={[0.8, 0.02, 0.02]} />
        </mesh>
      </group>
    </group>
  );
}

function CoffeeMug({ x, y, z, mats }: { x: number; y: number; z: number; mats: Materials }) {
  const steamRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!steamRef.current) return;
    const t = clock.elapsedTime;
    steamRef.current.children.forEach((child, i) => {
      const p = (t * 0.45 + i * 0.33) % 1;
      child.position.y = 0.1 + p * 0.3;
      child.position.x = Math.sin(p * 5 + i) * 0.035;
      const s = (1 - p) * 0.55;
      child.scale.setScalar(Math.max(s, 0.001));
    });
  });

  return (
    <group position={[x, y, z]} raycast={noRaycast}>
      <mesh castShadow material={mats.white} position={[0, 0.06, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.055, 0.045, 0.12, 12]} />
      </mesh>
      <mesh position={[0.07, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.white} raycast={noRaycast}>
        <torusGeometry args={[0.035, 0.012, 6, 10]} />
      </mesh>
      <group ref={steamRef} raycast={noRaycast}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} material={mats.white} raycast={noRaycast}>
            <sphereGeometry args={[0.035, 6, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Campfire Night
// ---------------------------------------------------------------------------------------

// No walls outdoors — a ring of pine trees and rocks marks the edge of the clearing, denser
// along the back so the treeline reads as depth rather than a thin fence.
function CampfireClearingBoundary({ mats }: { mats: Materials }) {
  const perimeter = useMemo(() => {
    const points: { x: number; z: number; scale: number; kind: "tree" | "rock" }[] = [];
    // inner ring, right at the edge of the clearing
    const count = 22;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 5.9 + (i % 2) * 0.4;
      points.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        scale: 0.85 + ((i * 37) % 5) * 0.08,
        kind: i % 4 === 0 ? "rock" : "tree",
      });
    }
    // two staggered back rows, pushed out and scaled up so the treeline reads as depth
    for (let ring = 0; ring < 2; ring++) {
      const radius = 6.5 + ring * 0.55;
      const n = 12 + ring * 2;
      for (let i = 0; i < n; i++) {
        const angle = Math.PI + ((i / (n - 1)) - 0.5) * (2.6 + ring * 0.4);
        points.push({
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius - 0.3,
          scale: 1.05 + ((i * 29) % 3) * 0.14 + ring * 0.1,
          kind: "tree",
        });
      }
    }
    return points;
  }, []);

  return (
    <>
      {perimeter.map((p, i) =>
        p.kind === "tree" ? (
          <PineTree key={i} x={p.x} z={p.z} scale={p.scale} mats={mats} />
        ) : (
          <Rock key={i} x={p.x} z={p.z} scale={p.scale} mats={mats} />
        )
      )}
    </>
  );
}

function PineTree({ x, z, scale = 1, mats }: { x: number; z: number; scale?: number; mats: Materials }) {
  return (
    <group position={[x, 0, z]} scale={scale} raycast={noRaycast}>
      <mesh castShadow position={[0, 0.4, 0]} material={mats.bark} raycast={noRaycast}>
        <cylinderGeometry args={[0.1, 0.14, 0.8, 8]} />
      </mesh>
      <mesh castShadow position={[0, 1.2, 0]} material={mats.pine} raycast={noRaycast}>
        <coneGeometry args={[0.55, 1.1, 8]} />
      </mesh>
      <mesh castShadow position={[0, 1.75, 0]} material={mats.pineLight} raycast={noRaycast}>
        <coneGeometry args={[0.4, 0.9, 8]} />
      </mesh>
    </group>
  );
}

function Rock({ x, z, scale = 1, mats }: { x: number; z: number; scale?: number; mats: Materials }) {
  return (
    <mesh
      castShadow
      receiveShadow
      position={[x, 0.18 * scale, z]}
      scale={scale}
      material={mats.stone}
      raycast={noRaycast}
    >
      <sphereGeometry args={[0.3, 8, 6]} />
    </mesh>
  );
}

function CampfireFurniture({ mats }: { mats: Materials }) {
  // The four cardinal spots around the fire are real seats (MAP_CHAIRS "log_seat_*"), rendered
  // by ChairProp. These decorative logs fill the diagonals so the ring still looks complete.
  const decorativeLogs = useMemo(
    () =>
      [0.25, 0.75, 1.25, 1.75].map((t) => {
        const angle = t * Math.PI;
        return { x: Math.cos(angle) * 2.6, z: Math.sin(angle) * 2.6, angle };
      }),
    []
  );

  // Stepping-stone path leading in from the south spawn toward the fire.
  const steppingStones = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        x: Math.sin(i * 0.9) * 0.45,
        z: 5.6 - i * 0.62,
        scale: 0.42 + ((i * 23) % 3) * 0.06,
      })),
    []
  );

  // Wildflower clumps and loose stones, scattered deterministically so the layout is stable
  // across renders and never lands on the fire pit or the seating ring.
  const groundCover = useMemo(() => {
    const out: { x: number; z: number; kind: "flower" | "stone"; scale: number; tint: number }[] = [];
    for (let i = 0; i < 52; i++) {
      const angle = i * 2.399; // golden angle — even, non-repeating spread
      const radius = 3.4 + ((i * 41) % 17) * 0.16;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x, z) < 3.2) continue; // keep the fire + the seating ring clear
      if (Math.abs(x) > 5.9 || Math.abs(z) > 5.9) continue; // stay on the slab
      out.push({
        x,
        z,
        kind: i % 3 === 0 ? "stone" : "flower",
        scale: 0.7 + ((i * 17) % 4) * 0.12,
        tint: i % 3,
      });
    }
    return out;
  }, []);

  return (
    <>
      {/* fire pit: ring of stones + crossed logs (the flame/glow itself is the "campfire" ToggleableProp) */}
      <group raycast={noRaycast}>
        {Array.from({ length: 10 }).map((_, i) => {
          const angle = (i / 10) * Math.PI * 2;
          return (
            <mesh
              key={i}
              castShadow
              receiveShadow
              position={[Math.cos(angle) * 0.55, 0.08, Math.sin(angle) * 0.55]}
              scale={0.7}
              material={mats.stone}
              raycast={noRaycast}
            >
              <sphereGeometry args={[0.14, 6, 6]} />
            </mesh>
          );
        })}
        {[0.5, -0.5].map((r) => (
          <mesh
            key={r}
            castShadow
            position={[0, 0.1, 0]}
            rotation={[0, r, Math.PI / 2.5]}
            material={mats.darkWood}
            raycast={noRaycast}
          >
            <cylinderGeometry args={[0.05, 0.06, 0.7, 6]} />
          </mesh>
        ))}
      </group>

      {/* decorative log benches filling the diagonals of the seating ring */}
      {decorativeLogs.map((log, i) => (
        <mesh
          key={i}
          castShadow
          receiveShadow
          position={[log.x, 0.19, log.z]}
          rotation={[0, log.angle, Math.PI / 2]}
          material={mats.bark}
          raycast={noRaycast}
        >
          <cylinderGeometry args={[0.2, 0.2, 1, 12]} />
        </mesh>
      ))}

      {/* stepping stones leading in from the spawn side */}
      {steppingStones.map((s, i) => (
        <mesh
          key={i}
          receiveShadow
          position={[s.x, 0.03, s.z]}
          scale={[s.scale, 0.35, s.scale * 0.8]}
          material={mats.stone}
          raycast={noRaycast}
        >
          <cylinderGeometry args={[1, 1, 0.22, 7]} />
        </mesh>
      ))}

      {/* ground cover: wildflower clumps + loose stones */}
      {groundCover.map((g, i) =>
        g.kind === "stone" ? (
          <mesh
            key={i}
            castShadow
            receiveShadow
            position={[g.x, 0.07 * g.scale, g.z]}
            scale={g.scale * 0.45}
            material={mats.stone}
            raycast={noRaycast}
          >
            <sphereGeometry args={[0.3, 6, 5]} />
          </mesh>
        ) : (
          <group key={i} position={[g.x, 0, g.z]} scale={g.scale} raycast={noRaycast}>
            <mesh castShadow position={[0, 0.09, 0]} scale={[1, 0.7, 1]} material={mats.pineLight} raycast={noRaycast}>
              <sphereGeometry args={[0.14, 7, 6]} />
            </mesh>
            {[0, 1, 2].map((f) => (
              <mesh
                key={f}
                position={[Math.cos(f * 2.1) * 0.08, 0.17, Math.sin(f * 2.1) * 0.08]}
                material={g.tint === 1 ? mats.mustard : mats.cream}
                raycast={noRaycast}
              >
                <sphereGeometry args={[0.032, 5, 4]} />
              </mesh>
            ))}
          </group>
        )
      )}

      {/* backpack leaning against a log */}
      <group position={[-2.5, 0, 2.1]} rotation={[0, 0.6, 0.2]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.26, 0]} material={mats.pine} raycast={noRaycast}>
          <capsuleGeometry args={[0.18, 0.24, 4, 10]} />
        </mesh>
        <mesh castShadow position={[0, 0.2, 0.17]} material={mats.bark} raycast={noRaycast}>
          <boxGeometry args={[0.22, 0.18, 0.08]} />
        </mesh>
      </group>

      {/* acoustic guitar propped against a log bench */}
      <group position={[2.35, 0, 2.2]} rotation={[0.42, -0.5, 0.1]} raycast={noRaycast}>
        <mesh castShadow position={[0, 0.3, 0]} scale={[1, 1, 0.34]} material={mats.wood} raycast={noRaycast}>
          <sphereGeometry args={[0.24, 12, 10]} />
        </mesh>
        <mesh castShadow position={[0, 0.52, 0]} scale={[1, 1, 0.34]} material={mats.wood} raycast={noRaycast}>
          <sphereGeometry args={[0.18, 12, 10]} />
        </mesh>
        <mesh castShadow position={[0, 0.95, 0]} material={mats.darkWood} raycast={noRaycast}>
          <boxGeometry args={[0.09, 0.62, 0.05]} />
        </mesh>
        <mesh position={[0, 0.3, 0.09]} material={mats.black} raycast={noRaycast}>
          <circleGeometry args={[0.07, 12]} />
        </mesh>
      </group>

      {/* lantern on a tree stump */}
      <group position={[3.35, 0, -1.85]} raycast={noRaycast}>
        <mesh castShadow receiveShadow position={[0, 0.2, 0]} material={mats.bark} raycast={noRaycast}>
          <cylinderGeometry args={[0.3, 0.33, 0.4, 12]} />
        </mesh>
        <mesh position={[0, 0.41, 0]} material={mats.wood} raycast={noRaycast}>
          <cylinderGeometry args={[0.29, 0.29, 0.03, 12]} />
        </mesh>
        <mesh castShadow position={[0, 0.58, 0]} material={mats.metal} raycast={noRaycast}>
          <cylinderGeometry args={[0.1, 0.11, 0.06, 8]} />
        </mesh>
        <mesh position={[0, 0.72, 0]} material={mats.warmGlow} raycast={noRaycast}>
          <cylinderGeometry args={[0.08, 0.08, 0.22, 8]} />
        </mesh>
        <mesh castShadow position={[0, 0.86, 0]} material={mats.metal} raycast={noRaycast}>
          <cylinderGeometry args={[0.1, 0.09, 0.07, 8]} />
        </mesh>
        <pointLight position={[0, 0.72, 0]} intensity={1.6} color="#ffc46b" distance={4} decay={2} />
      </group>

      {/* two tents, spread out into a proper campsite */}
      <Tent x={-4.5} z={-4.5} color="#d97a4a" mats={mats} />
      <Tent x={4.5} z={-4.2} color="#4a8ad9" mats={mats} />

      <Fireflies mats={mats} />
    </>
  );
}

const FIREFLY_COUNT = 26;

// Slow-drifting fireflies with an independent blink phase each, so the clearing feels alive
// without needing a particle system.
function Fireflies({ mats }: { mats: Materials }) {
  const groupRef = useRef<THREE.Group>(null);

  const seeds = useMemo(
    () =>
      Array.from({ length: FIREFLY_COUNT }, (_, i) => ({
        radius: 2.4 + ((i * 31) % 11) * 0.34,
        angle: (i / FIREFLY_COUNT) * Math.PI * 2,
        baseY: 0.5 + ((i * 17) % 7) * 0.2,
        driftSpeed: 0.08 + ((i * 13) % 5) * 0.03,
        bobSpeed: 0.6 + ((i * 7) % 6) * 0.15,
        phase: i * 1.7,
      })),
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const s = seeds[i];
      const angle = s.angle + t * s.driftSpeed;
      child.position.set(
        Math.cos(angle) * s.radius,
        s.baseY + Math.sin(t * s.bobSpeed + s.phase) * 0.22,
        Math.sin(angle) * s.radius
      );
      // blink: squash to nothing rather than toggling visibility, so it fades in and out
      const blink = (Math.sin(t * 1.6 + s.phase) + 1) / 2;
      child.scale.setScalar(0.35 + blink * 0.9);
    });
  });

  return (
    <group ref={groupRef} raycast={noRaycast}>
      {seeds.map((_, i) => (
        <mesh key={i} material={mats.warmGlow} raycast={noRaycast}>
          <sphereGeometry args={[0.035, 6, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function TentDoor({ mats }: { mats: Materials }) {
  return (
    <mesh position={[0, 0.42, 0.9]} material={mats.black} raycast={noRaycast}>
      <planeGeometry args={[0.55, 0.78]} />
    </mesh>
  );
}

function Tent({ x, z, color, mats }: { x: number; z: number; color: string; mats: Materials }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), [color]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <group position={[x, 0, z]} raycast={noRaycast}>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.72, 0]}
        rotation={[0, Math.PI / 4, 0]}
        material={material}
        raycast={noRaycast}
      >
        <coneGeometry args={[1.25, 1.45, 4]} />
      </mesh>
      <TentDoor mats={mats} />
    </group>
  );
}
