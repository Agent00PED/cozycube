import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cyl, GEO, RB, Sph, StaticBatch, Stem, makePlankTexture, makeTileTexture, matte, noMerge, noRaycast, seeded } from "./kit";
import { useLampBoost } from "./timeOfDay";
import { CUSHIONS } from "@shared/seats";
import {
  CHAISE,
  COFFEE_TABLE,
  GAMES,
  HEARTH,
  KITCHEN,
  LOFT_HALF,
  PLANTS,
  POUF_CIRCLE,
  READING,
  SOFA,
  SUN_PATCH,
  WALL_HEIGHT,
  WALL_T,
  WINDOWS,
  WINDOW_Y,
} from "@shared/worlds/lounge";

// The Loft, drawn from the floor plan in shared/worlds/lounge.ts.
//
// One visual language: warm matte oak and walnut, woven fabric in forest olive, vanilla cream,
// terracotta and mustard, satin ceramic and muted brass. Every material is matte (roughness
// 0.7..0.85, metalness at most 0.1). Nothing casts or receives a shadow: the room is lit by warm
// ambient light, the hearth's ember light, the lamps and the pendants (WorldScene owns the
// ambient; the point lights are here, next to the things that motivate them).
//
// Every piece of furniture is one group built from the kit's primitives, joined part into part
// (arms into seats, legs into aprons), so nothing can drift from the thing it belongs to. The
// whole static world is baked into a few dozen merged draws by the StaticBatch round it; only the
// fire (which flickers) opts out.

const HALF = LOFT_HALF;
const H = WALL_HEIGHT;
const T = WALL_T;
const INNER = HALF - T; // the walls' inner faces stand at -INNER

type Mats = ReturnType<typeof useLoftMaterials>;

function useLoftMaterials() {
  const m = useMemo(() => {
    const floor = makePlankTexture("#cf9a5d", 30);
    const tile = makeTileTexture("#efe6d2", "#c9d3bf", 8);
    tile.repeat.set(4.4, 1.6);
    const make = matte;
    return {
      // textured surfaces
      floor: new THREE.MeshStandardMaterial({ map: floor, roughness: 0.82, metalness: 0 }),
      tile: new THREE.MeshStandardMaterial({ map: tile, roughness: 0.75, metalness: 0 }),
      // woods
      oak: make("#c48a4f"),
      oakLight: make("#d9a86c"),
      walnut: make("#5a3a24"),
      slab: make("#4a2f1d", 0.85),
      slabTop: make("#6b452b", 0.85),
      // fabrics
      olive: make("#5e6b45", 0.85),
      oliveSoft: make("#71805a", 0.85),
      oliveDeep: make("#4a5637", 0.85),
      cream: make("#f3e9d6", 0.85),
      creamDeep: make("#e3d5bb", 0.85),
      terracotta: make("#c4714a", 0.85),
      terracottaSoft: make("#d38a5f", 0.85),
      terracottaDeep: make("#a65a38", 0.85),
      mustard: make("#d9a441", 0.85),
      mustardDeep: make("#b9862c", 0.85),
      plum: make("#6b4a63", 0.85),
      linen: make("#d9c9a8", 0.85),
      rugWool: make("#cdb08a", 0.85),
      rugWoolDeep: make("#a98a62", 0.85),
      rugRose: make("#c98a80", 0.85),
      rugRoseDeep: make("#a86b62", 0.85),
      rugMoss: make("#6f7f5e", 0.85),
      rugMossDeep: make("#57664a", 0.85),
      // hard surfaces
      brass: make("#b08d57", 0.7, { metalness: 0.1 }),
      ceramic: make("#e9dfd0", 0.7),
      sage: make("#a9b8a0", 0.75),
      sageDeep: make("#8a9c82", 0.75),
      stone: make("#8f8a83", 0.8),
      countertop: make("#ece4d4", 0.72),
      brick: make("#b06a4e", 0.85),
      brickDark: make("#8f4f38", 0.85),
      charcoal: make("#3a3a3e", 0.8),
      firebox: make("#1c1512", 0.85),
      soil: make("#2b1e16", 0.85),
      wall: make("#f2e8d8", 0.85),
      wallKitchen: make("#ece3cf", 0.85),
      trim: make("#e6d8c0", 0.85),
      // plants
      leaf: make("#4f7a4a", 0.85),
      leafLight: make("#6d9a5e", 0.85),
      oliveLeaf: make("#7f9168", 0.85),
      // glass and glow (these are opaque: a window is light, not a see-through pane)
      pane: make("#bfe3f5", 0.75, { emissive: "#9fd0ea", emissiveIntensity: 0.55 }),
      frameWhite: make("#f7f3ea", 0.75),
      bulb: new THREE.MeshBasicMaterial({ color: "#ffe6bf", toneMapped: false }),
      ember: new THREE.MeshBasicMaterial({ color: "#ff7a2a", toneMapped: false }),
      flameOuter: new THREE.MeshBasicMaterial({ color: "#ffb347", toneMapped: false }),
      flameInner: new THREE.MeshBasicMaterial({ color: "#fff1b8", toneMapped: false }),
      books: ["#b4523c", "#3f6b52", "#d9a441", "#4a6a8a", "#8a5a83", "#e6d8c0", "#c4714a", "#2f3e46"].map((c) => make(c, 0.8)),
    };
  }, []);
  useEffect(
    () => () => {
      Object.values(m).forEach((v) => (Array.isArray(v) ? v.forEach((x) => x.dispose()) : v.dispose()));
    },
    [m]
  );
  return m;
}

/** A brick face: one material per size, so the courses stay square instead of stretching. */
function useBrick(w: number, h: number) {
  const material = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#e6d8c6"; // the grout
    g.fillRect(0, 0, size, size);
    const rnd = seeded(11);
    const rows = 8;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? size / 8 : 0;
      for (let x = -size / 4; x < size; x += size / 4) {
        const c = new THREE.Color("#b06a4e").offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.07);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect(x + off + 2, r * rowH + 2, size / 4 - 4, rowH - 4);
      }
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, Math.round(w / 0.55)), Math.max(1, Math.round(h / 0.28)));
    t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0 });
  }, [w, h]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material]
  );
  return material;
}

type V3 = [number, number, number];
const mid = (a: number, b: number) => (a + b) / 2;

// ---------------------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------------------

export function LoungeWorld({ onFloorClick }: { onFloorClick: (x: number, z: number) => void }) {
  const c = useLoftMaterials();
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };

  return (
    <group>
      {/* the floor is its own thin plane and the ONLY click target for walking: a box would also
          return hits on its sides and underside and send you to nonsensical places */}
      <mesh geometry={GEO.plane} material={c.floor} rotation={[-Math.PI / 2, 0, 0]} scale={[HALF * 2, HALF * 2, 1]} onPointerDown={floorClick} />
      <StaticBatch>
        <Slab c={c} />
        <KitchenTile c={c} />
        <Walls c={c} />
        <Windows c={c} />
        <Hearth c={c} />
        <Bookcases c={c} />
        <Sectional c={c} />
        <CoffeeTable c={c} />
        <ReadingNook c={c} />
        <Chaise c={c} />
        <Kitchen c={c} />
        <Rafters c={c} />
        <BistroSet c={c} />
        <GamesTable c={c} />
        <PoufCircle c={c} />
        <Rugs c={c} />
        <Plants c={c} />
        <WallArt c={c} />
        <Balustrade c={c} />
      </StaticBatch>
      <Fire c={c} />
      <PendantLights c={c} />
    </group>
  );
}

/** The diorama slab under the floor: a chunky walnut block with a lighter lip, like a model on a table. */
function Slab({ c }: { c: Mats }) {
  return (
    <group>
      <B p={[0, -0.67, 0]} s={[HALF * 2, 1.3, HALF * 2]} m={c.slab} />
      <B p={[0, -0.09, 0]} s={[HALF * 2 + 0.02, 0.14, HALF * 2 + 0.02]} m={c.slabTop} />
    </group>
  );
}

function KitchenTile({ c }: { c: Mats }) {
  const t = KITCHEN.tile;
  return <B p={[mid(t.x0, t.x1), 0.006, mid(-INNER, t.z1)]} s={[t.x1 - t.x0, 0.012, t.z1 + INNER]} m={c.tile} />;
}

// ---------------------------------------------------------------------------------------
// Walls and windows
// ---------------------------------------------------------------------------------------

function Walls({ c }: { c: Mats }) {
  const k = KITCHEN.window;
  // back wall (z = -7.5): the corner cell belongs to the left wall, so this starts at -INNER
  const backZ = -HALF + T / 2;
  const back = (x0: number, x1: number, y0: number, y1: number, m: THREE.Material) => <B p={[mid(x0, x1), mid(y0, y1), backZ]} s={[x1 - x0, y1 - y0, T]} m={m} />;
  // left wall (x = -7.5), cut by three tall windows
  const leftX = -HALF + T / 2;
  const left = (z0: number, z1: number, y0: number, y1: number) => <B p={[leftX, mid(y0, y1), mid(z0, z1)]} s={[T, y1 - y0, z1 - z0]} m={c.wall} />;
  const piers: [number, number][] = [
    [-HALF, WINDOWS[0].z0],
    [WINDOWS[0].z1, WINDOWS[1].z0],
    [WINDOWS[1].z1, WINDOWS[2].z0],
    [WINDOWS[2].z1, HALF],
  ];
  return (
    <group>
      {back(-INNER, KITCHEN.counter.x0, 0, H, c.wall)}
      {back(KITCHEN.counter.x0, k.x0, 0, H, c.wallKitchen)}
      {back(k.x0, k.x1, 0, k.y0, c.wallKitchen)}
      {back(k.x0, k.x1, k.y1, H, c.wallKitchen)}
      {back(k.x1, HALF, 0, H, c.wallKitchen)}
      {piers.map(([z0, z1], i) => (
        <group key={i}>{left(z0, z1, 0, H)}</group>
      ))}
      {WINDOWS.map((w, i) => (
        <group key={i}>
          {left(w.z0, w.z1, 0, WINDOW_Y.y0)}
          {left(w.z0, w.z1, WINDOW_Y.y1, H)}
        </group>
      ))}
      {/* baseboards, proud of the plaster by 0.04, and a crown moulding along the top */}
      <B p={[mid(-INNER, HALF), 0.07, -INNER + 0.02]} s={[HALF + INNER, 0.14, 0.04]} m={c.trim} />
      <B p={[-INNER + 0.02, 0.07, mid(-INNER, HALF)]} s={[0.04, 0.14, HALF + INNER]} m={c.trim} />
      <B p={[mid(-INNER, HALF), H - 0.06, -INNER + 0.03]} s={[HALF + INNER, 0.1, 0.06]} m={c.trim} />
      <B p={[-INNER + 0.03, H - 0.06, mid(-INNER, HALF)]} s={[0.06, 0.1, HALF + INNER]} m={c.trim} />
    </group>
  );
}

/**
 * A window in a wall, in the wall's own frame: x along the wall, y up, z out into the room. The
 * opening is a real hole in the wall pieces; the glass sits at the wall's mid-plane and the
 * casing stands 0.1 proud of the plaster, so no two faces are ever coplanar (nothing z-fights).
 */
function WindowUnit({ w, h, c }: { w: number; h: number; c: Mats }) {
  const bar = 0.1;
  const depth = T + 0.1; // from the wall's outer face to 0.1 proud of the inner one
  const zc = 0.05; // the casing's centre, relative to the wall's mid-plane
  return (
    <group>
      <B p={[0, 0, 0]} s={[w, h, 0.03]} m={c.pane} />
      <B p={[0, h / 2 - bar / 2, zc]} s={[w, bar, depth]} m={c.frameWhite} />
      <B p={[0, -h / 2 + bar / 2, zc]} s={[w, bar, depth]} m={c.frameWhite} />
      <B p={[-w / 2 + bar / 2, 0, zc]} s={[bar, h - bar * 2, depth]} m={c.frameWhite} />
      <B p={[w / 2 - bar / 2, 0, zc]} s={[bar, h - bar * 2, depth]} m={c.frameWhite} />
      {/* mullions, on the room side of the glass */}
      <B p={[0, 0, 0.07]} s={[0.05, h - bar * 2, 0.06]} m={c.frameWhite} />
      <B p={[0, h * 0.12, 0.07]} s={[w - bar * 2, 0.05, 0.06]} m={c.frameWhite} />
      {/* the sill, proud of the casing */}
      <B p={[0, -h / 2 - 0.02, 0.12]} s={[w + 0.24, 0.07, 0.4]} m={c.frameWhite} />
    </group>
  );
}

function Windows({ c }: { c: Mats }) {
  const k = KITCHEN.window;
  return (
    <group>
      <group position={[mid(k.x0, k.x1), mid(k.y0, k.y1), -HALF + T / 2]}>
        <WindowUnit w={k.x1 - k.x0} h={k.y1 - k.y0} c={c} />
      </group>
      {WINDOWS.map((w, i) => (
        // rotated so the window's z (into the room) points along +x
        <group key={i} position={[-HALF + T / 2, mid(WINDOW_Y.y0, WINDOW_Y.y1), mid(w.z0, w.z1)]} rotation={[0, Math.PI / 2, 0]}>
          <WindowUnit w={w.z1 - w.z0} h={WINDOW_Y.y1 - WINDOW_Y.y0} c={c} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The hearth: chimney breast, firebox, mantel, shelves
// ---------------------------------------------------------------------------------------

function Hearth({ c }: { c: Mats }) {
  const b = HEARTH.breast;
  const fx0 = HEARTH.fireX - HEARTH.fireW / 2;
  const fx1 = HEARTH.fireX + HEARTH.fireW / 2;
  const dz = b.z1 - b.z0;
  const cz = mid(b.z0, b.z1);
  const pierL = useBrick(fx0 - b.x0, H);
  const pierR = useBrick(b.x1 - fx1, H);
  const lintel = useBrick(fx1 - fx0, H - HEARTH.fireH);
  return (
    <group>
      {/* the breast, in three brick pieces around the firebox opening: it goes right up to the ceiling */}
      <B p={[mid(b.x0, fx0), H / 2, cz]} s={[fx0 - b.x0, H, dz]} m={pierL} />
      <B p={[mid(fx1, b.x1), H / 2, cz]} s={[b.x1 - fx1, H, dz]} m={pierR} />
      <B p={[mid(fx0, fx1), mid(HEARTH.fireH, H), cz]} s={[fx1 - fx0, H - HEARTH.fireH, dz]} m={lintel} />
      {/* the firebox: a soot-dark back and floor, a stone lip under the opening */}
      <B p={[HEARTH.fireX, HEARTH.fireH / 2 + 0.03, b.z0 + 0.09]} s={[fx1 - fx0, HEARTH.fireH - 0.06, 0.18]} m={c.firebox} />
      <B p={[HEARTH.fireX, 0.03, cz]} s={[fx1 - fx0, 0.06, dz]} m={c.firebox} />
      {/* a hearth stone slab in front of it: flat and walkable */}
      <B p={[mid(HEARTH.stone.x0, HEARTH.stone.x1), 0.025, mid(HEARTH.stone.z0, HEARTH.stone.z1)]} s={[HEARTH.stone.x1 - HEARTH.stone.x0, 0.05, HEARTH.stone.z1 - HEARTH.stone.z0]} m={c.stone} />
      {/* the mantel: a walnut slab on two corbels, with a few things on it */}
      <B p={[HEARTH.fireX, HEARTH.mantelY, b.z1 + 0.06]} s={[b.x1 - b.x0 + 0.5, 0.09, 0.4]} m={c.walnut} />
      {[-1, 1].map((s) => (
        <B key={s} p={[HEARTH.fireX + s * 0.9, HEARTH.mantelY - 0.13, b.z1 + 0.02]} s={[0.1, 0.17, 0.28]} m={c.walnut} />
      ))}
      <Cyl p={[-5.7, HEARTH.mantelY + 0.13, b.z1 + 0.08]} s={[0.12, 0.16, 0.12]} m={c.ceramic} />
      <Cyl p={[-3.8, HEARTH.mantelY + 0.1, b.z1 + 0.08]} s={[0.1, 0.1, 0.1]} m={c.sage} />
      <Cyl p={[-3.62, HEARTH.mantelY + 0.09, b.z1 + 0.04]} s={[0.08, 0.08, 0.08]} m={c.cream} />
      <Sph p={[-5.7, HEARTH.mantelY + 0.34, b.z1 + 0.08]} s={0.22} m={c.leafLight} />
      {/* a framed picture leaning on the brick above */}
      <Frame p={[HEARTH.fireX, 1.95, b.z1 + 0.05]} rotY={0} w={1.1} h={0.75} art={c.sageDeep} art2={c.terracotta} c={c} />
    </group>
  );
}

/** The flames, the embers and the light they throw. Animated, so it opts out of the static batch. */
function Fire({ c }: { c: Mats }) {
  const boost = useLampBoost();
  const boostRef = useRef(boost);
  boostRef.current = boost;
  const light = useRef<THREE.PointLight>(null);
  const flames = useRef<THREE.Group>(null);
  const z = HEARTH.breast.z0 + 0.5;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (light.current) light.current.intensity = (2.2 + Math.sin(t * 9) * 0.25 + Math.sin(t * 5.3) * 0.2) * Math.min(1.5, 0.9 + boostRef.current * 0.5);
    flames.current?.children.forEach((f, i) => {
      const k = 1 + Math.sin(t * (8 + i * 2.3) + i) * 0.16;
      f.scale.set(f.userData.w * k, f.userData.h * (1 + Math.sin(t * (10 + i * 1.7)) * 0.2), f.userData.w * k);
    });
  });
  return (
    <group userData={noMerge} position={[HEARTH.fireX, 0, z]}>
      {/* two logs on a bed of embers */}
      <Cyl p={[0, 0.13, 0.05]} s={[0.12, 0.62, 0.12]} m={c.walnut} r={[0, 0, Math.PI / 2 - 0.08]} />
      <Cyl p={[0.05, 0.22, -0.1]} s={[0.11, 0.55, 0.11]} m={c.brickDark} r={[0.12, 0.6, Math.PI / 2 + 0.06]} />
      <Sph p={[0, 0.07, 0]} s={[0.7, 0.1, 0.4]} m={c.ember} />
      {/* flames: layered cones */}
      <group ref={flames}>
        <mesh userData={{ w: 0.26, h: 0.42 }} geometry={GEO.cone} material={c.flameOuter} position={[0, 0.34, 0]} scale={[0.26, 0.42, 0.26]} raycast={noRaycast} />
        <mesh userData={{ w: 0.18, h: 0.3 }} geometry={GEO.cone} material={c.flameOuter} position={[-0.2, 0.28, 0.02]} scale={[0.18, 0.3, 0.18]} raycast={noRaycast} />
        <mesh userData={{ w: 0.18, h: 0.34 }} geometry={GEO.cone} material={c.flameOuter} position={[0.2, 0.3, -0.02]} scale={[0.18, 0.34, 0.18]} raycast={noRaycast} />
        <mesh userData={{ w: 0.12, h: 0.26 }} geometry={GEO.cone} material={c.flameInner} position={[0, 0.27, 0.03]} scale={[0.12, 0.26, 0.12]} raycast={noRaycast} />
      </group>
      {/* the glowing embers' light, nestled in the firebox and spilling onto the hearth rug */}
      <pointLight ref={light} color="#ffaa44" intensity={2.2} distance={8} decay={2} position={[0, 0.45, 0.5]} castShadow={false} />
    </group>
  );
}

/** Built-in bookshelves either side of the chimney. */
function Bookcases({ c }: { c: Mats }) {
  return (
    <group>
      <Bookcase box={HEARTH.bookcaseL} seed={3} c={c} />
      <Bookcase box={HEARTH.bookcaseR} seed={9} c={c} />
    </group>
  );
}

function Bookcase({ box, seed, c }: { box: { x0: number; x1: number; z0: number; z1: number; height: number }; seed: number; c: Mats }) {
  const w = box.x1 - box.x0;
  const d = box.z1 - box.z0;
  const cx = mid(box.x0, box.x1);
  const cz = mid(box.z0, box.z1);
  const shelfYs = [0.05, 0.5, 0.95, 1.4, 1.85, box.height - 0.04];
  const rnd = seeded(seed);
  const books: { x: number; y: number; w: number; h: number; m: number }[] = [];
  for (let s = 0; s < shelfYs.length - 1; s++) {
    // the last bay of each shelf might hold a plant or a stack instead of books
    let x = box.x0 + 0.08;
    const end = box.x1 - 0.08 - (rnd() < 0.35 ? 0.3 : 0);
    while (x < end) {
      const bw = 0.035 + rnd() * 0.04;
      const bh = 0.24 + rnd() * 0.14;
      books.push({ x: x + bw / 2, y: shelfYs[s] + 0.03 + bh / 2, w: bw, h: bh, m: Math.floor(rnd() * c.books.length) });
      x += bw + 0.005;
    }
  }
  return (
    <group>
      <B p={[cx, box.height / 2, box.z0 + 0.02]} s={[w, box.height, 0.04]} m={c.walnut} />
      {[box.x0 + 0.03, box.x1 - 0.03].map((x) => (
        <B key={x} p={[x, box.height / 2, cz]} s={[0.06, box.height, d]} m={c.walnut} />
      ))}
      {shelfYs.map((y) => (
        <B key={y} p={[cx, y, cz]} s={[w - 0.1, 0.05, d]} m={c.walnut} />
      ))}
      {books.map((b, i) => (
        <B key={i} p={[b.x, b.y, box.z0 + 0.06 + d * 0.4]} s={[b.w, b.h, d * 0.62]} m={c.books[b.m]} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The conversation lounge: a closed L-shaped sectional, the coffee table, the rug
// ---------------------------------------------------------------------------------------

/**
 * The corner sectional. One continuous base and back wrap the corner (no gaps, no missing corner
 * geometry): a long run facing the fire, a return leg down the left wall, and the corner cell
 * where they meet. Every seat cushion sits at CUSHIONS.sofa, which is where the seat anchors come from.
 */
function Sectional({ c }: { c: Mats }) {
  const { run, leg } = SOFA;
  const cush = CUSHIONS.sofa;
  const backY = 0.56;
  const backH = SOFA.backH - 0.28;
  const cells: { x: number; z: number; alongX: boolean }[] = [
    { x: SOFA.corner.x, z: SOFA.corner.z, alongX: true },
    ...SOFA.runXs.map((x) => ({ x, z: SOFA.runZ, alongX: true })),
    ...SOFA.legZs.map((z) => ({ x: SOFA.legX, z, alongX: false })),
  ];
  return (
    <group>
      {/* the plinth, run and leg in one L */}
      <RB p={[mid(run.x0, run.x1), 0.14, mid(run.z0, run.z1)]} s={[run.x1 - run.x0, 0.28, run.z1 - run.z0]} m={c.oliveDeep} />
      <RB p={[mid(leg.x0, leg.x1), 0.14, mid(leg.z0, leg.z1)]} s={[leg.x1 - leg.x0, 0.28, leg.z1 - leg.z0]} m={c.oliveDeep} />
      {/* the backs wrap the corner: along the run's rear, and down the leg's wall side */}
      <RB p={[mid(run.x0, run.x1 - 0.25), backY, run.z1 - 0.15]} s={[run.x1 - 0.25 - run.x0, backH, 0.3]} m={c.olive} />
      <RB p={[run.x0 + 0.15, backY, mid(leg.z0 + 0.25, run.z1)]} s={[0.3, backH, run.z1 - leg.z0 - 0.25]} m={c.olive} />
      {/* arms at the two open ends */}
      <RB p={[run.x1 - 0.125, 0.36, mid(run.z0, run.z1)]} s={[0.25, 0.52, run.z1 - run.z0]} m={c.olive} />
      <RB p={[mid(leg.x0, leg.x1), 0.36, leg.z0 + 0.125]} s={[leg.x1 - leg.x0, 0.52, 0.25]} m={c.olive} />
      {/* seat cushions, and a soft back cushion behind each */}
      {cells.map((cell, i) => (
        <group key={i}>
          <RB p={[cell.alongX ? cell.x : cell.x + 0.05, cush.y, cell.alongX ? cell.z - 0.05 : cell.z]} s={cell.alongX ? [0.96, cush.h, 0.84] : [0.84, cush.h, 0.96]} m={c.oliveSoft} />
          <RB p={cell.alongX ? [cell.x, 0.62, run.z1 - 0.34] : [leg.x0 + 0.34, 0.62, cell.z]} s={cell.alongX ? [0.9, 0.5, 0.16] : [0.16, 0.5, 0.9]} r={cell.alongX ? [-0.16, 0, 0] : [0, 0, 0.16]} m={c.oliveSoft} />
        </group>
      ))}
      {/* throw pillows */}
      <RB p={[-6.1, 0.6, -2.62]} s={[0.34, 0.34, 0.13]} r={[-0.2, 0.35, 0.05]} m={c.terracotta} />
      <RB p={[-3.55, 0.6, -2.66]} s={[0.34, 0.34, 0.13]} r={[-0.2, -0.3, -0.05]} m={c.mustard} />
      <RB p={[-6.95, 0.6, -3.3]} s={[0.13, 0.34, 0.34]} r={[0, 0.2, 0.2]} m={c.cream} />
      {/* four little feet */}
      {[
        [run.x0 + 0.1, run.z0 + 0.1],
        [run.x1 - 0.1, run.z0 + 0.1],
        [run.x1 - 0.1, run.z1 - 0.1],
        [leg.x1 - 0.1, leg.z0 + 0.1],
      ].map(([x, z], i) => (
        <Cyl key={i} p={[x, 0.02, z]} s={[0.07, 0.04, 0.07]} m={c.walnut} />
      ))}
    </group>
  );
}

function CoffeeTable({ c }: { c: Mats }) {
  const t = COFFEE_TABLE;
  return (
    <group position={[t.x, 0, t.z]}>
      <Cyl p={[0, 0.02, 0]} s={[0.62, 0.04, 0.62]} m={c.walnut} />
      <Cyl p={[0, 0.16, 0]} s={[0.14, 0.28, 0.14]} m={c.walnut} />
      <Cyl p={[0, t.height - 0.03, 0]} s={[t.radius * 2, 0.06, t.radius * 2]} m={c.oakLight} />
      {/* a tray, two books, a mug and a little plant */}
      <Cyl p={[0, t.height + 0.012, 0]} s={[0.62, 0.02, 0.62]} m={c.creamDeep} />
      <B p={[-0.1, t.height + 0.04, 0.05]} s={[0.26, 0.035, 0.19]} r={[0, 0.3, 0]} m={c.books[2]} />
      <B p={[-0.1, t.height + 0.075, 0.05]} s={[0.22, 0.035, 0.16]} r={[0, 0.1, 0]} m={c.books[1]} />
      <Cyl p={[0.14, t.height + 0.06, -0.06]} s={[0.075, 0.09, 0.075]} m={c.ceramic} />
      <Cyl p={[-0.02, t.height + 0.05, -0.17]} s={[0.1, 0.07, 0.1]} m={c.terracottaDeep} />
      <Sph p={[-0.02, t.height + 0.12, -0.17]} s={[0.16, 0.12, 0.16]} m={c.leafLight} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The left wall: the reading nook and the chaise
// ---------------------------------------------------------------------------------------

/** A wingback armchair facing +x: its back against the wall, wings and rolled arms joined to the seat. */
function ReadingNook({ c }: { c: Mats }) {
  const { x, z } = READING.chair;
  const cush = CUSHIONS.wingback;
  return (
    <group position={[x, 0, z]}>
      {/* the base stops BELOW the cushion top (0.30 vs 0.36): the seat is a visible cushion, not swallowed by the base */}
      <RB p={[0, 0.15, 0]} s={[0.9, 0.3, 0.92]} m={c.terracottaDeep} />
      <RB p={[0.02, cush.y, 0]} s={[0.66, cush.h, 0.7]} m={c.terracottaSoft} />
      <RB p={[-0.3, 0.66, 0]} s={[0.3, 0.78, 0.92]} m={c.terracotta} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <RB p={[-0.02, 0.5, s * 0.4]} s={[0.78, 0.36, 0.16]} m={c.terracotta} />
          <RB p={[-0.24, 0.9, s * 0.38]} s={[0.24, 0.5, 0.2]} m={c.terracotta} />
        </group>
      ))}
      {[
        [-0.32, -0.34],
        [0.32, -0.34],
        [-0.32, 0.34],
        [0.32, 0.34],
      ].map(([lx, lz], i) => (
        <Cyl key={i} p={[lx, 0.02, lz]} s={[0.06, 0.04, 0.06]} m={c.walnut} />
      ))}
      <RB p={[-0.1, 0.5, 0.05]} s={[0.36, 0.34, 0.12]} r={[-0.2, 0.2, 0.1]} m={c.mustard} />
    </group>
  );
}

/**
 * The window daybed. Every surface is a slab at its own height and no two faces share a plane:
 * the base tops out at 0.24, the ONE seat cushion rises from 0.20 to 0.32 (CUSHIONS.chaise), the
 * bolster is tucked 0.02 into the cushion and 0.02 into the head-end arm, and the back reaches
 * over the cushion's edge instead of ending flush with it.
 */
function Chaise({ c }: { c: Mats }) {
  const { x, z } = CHAISE;
  const cush = CUSHIONS.chaise;
  return (
    <group position={[x, 0, z]}>
      <RB p={[0, 0.12, 0]} s={[0.86, 0.24, 2.0]} m={c.mustardDeep} />
      <RB p={[0.04, cush.y, 0]} s={[0.72, cush.h, 1.76]} m={c.mustard} />
      {/* the low back against the wall */}
      <RB p={[-0.31, 0.4, 0]} s={[0.22, 0.46, 2.0]} m={c.mustardDeep} />
      {/* the head-end arm, and a bolster resting against it and the back */}
      <RB p={[0.02, 0.34, 0.93]} s={[0.86, 0.36, 0.2]} m={c.mustardDeep} />
      <RB p={[0.09, 0.41, 0.7]} s={[0.5, 0.22, 0.3]} m={c.mustard} />
      {[
        [0.34, -0.92],
        [0.34, 0.92],
        [-0.34, -0.92],
        [-0.34, 0.92],
      ].map(([lx, lz], i) => (
        <Cyl key={i} p={[lx, 0.02, lz]} s={[0.07, 0.04, 0.07]} m={c.walnut} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The kitchen
// ---------------------------------------------------------------------------------------

function Kitchen({ c }: { c: Mats }) {
  const k = KITCHEN.counter;
  const cw = k.x1 - k.x0;
  const f = KITCHEN.fridge;
  const u = KITCHEN.uppers;
  const cabH = k.height - 0.06;
  const doors: number[] = [];
  for (let x = k.x0 + 0.5; x < k.x1 - 0.2; x += 0.75) doors.push(x);
  return (
    <group>
      {/* the counter run: base cabinets in sage, a cream stone top proud of the doors */}
      <B p={[mid(k.x0, k.x1), cabH / 2, mid(k.z0, k.z1)]} s={[cw, cabH, k.z1 - k.z0]} m={c.sage} />
      <B p={[mid(k.x0, k.x1), k.height - 0.03, mid(k.z0, k.z1) + 0.03]} s={[cw + 0.02, 0.06, k.z1 - k.z0 + 0.06]} m={c.countertop} />
      {doors.map((x) => (
        <group key={x}>
          <B p={[x, cabH / 2, k.z1 + 0.008]} s={[0.012, cabH - 0.1, 0.016]} m={c.sageDeep} />
          <Sph p={[x + 0.1, cabH - 0.16, k.z1 + 0.03]} s={0.045} m={c.brass} />
        </group>
      ))}
      {/* a tiled splashback behind the run, up to the wall cabinets */}
      <B p={[mid(k.x0, k.x1), mid(k.height, 1.5), -INNER + 0.03]} s={[cw, 1.5 - k.height, 0.06]} m={c.creamDeep} />
      {/* the sink, under the window: a basin and a brass tap */}
      <B p={[KITCHEN.sinkX, k.height + 0.004, -7.0]} s={[0.7, 0.012, 0.42]} m={c.charcoal} />
      <Cyl p={[KITCHEN.sinkX, k.height + 0.16, -7.2]} s={[0.035, 0.32, 0.035]} m={c.brass} />
      <Cyl p={[KITCHEN.sinkX, k.height + 0.31, -7.1]} s={[0.03, 0.2, 0.03]} m={c.brass} r={[Math.PI / 2, 0, 0]} />
      {/* the hob: four burners, a kettle and a pot */}
      {[
        [-0.2, -0.13],
        [0.2, -0.13],
        [-0.2, 0.13],
        [0.2, 0.13],
      ].map(([dx, dz], i) => (
        <Cyl key={i} p={[KITCHEN.hobX + dx, k.height + 0.012, -6.92 + dz]} s={[0.2, 0.02, 0.2]} m={c.charcoal} />
      ))}
      <Cyl p={[KITCHEN.hobX - 0.2, k.height + 0.1, -6.79]} s={[0.22, 0.16, 0.22]} m={c.terracotta} />
      <Cyl p={[KITCHEN.hobX + 0.2, k.height + 0.13, -7.05]} s={[0.2, 0.22, 0.2]} m={c.ceramic} />
      <Sph p={[KITCHEN.hobX + 0.2, k.height + 0.26, -7.05]} s={0.06} m={c.brass} />
      {/* things on the counter: a cutting board, a fruit bowl, a jar of spoons, an espresso machine */}
      <B p={[2.9, k.height + 0.015, -6.95]} s={[0.5, 0.03, 0.3]} m={c.oakLight} />
      <Cyl p={[3.7, k.height + 0.06, -6.9]} s={[0.3, 0.1, 0.3]} m={c.ceramic} />
      {[
        [-0.06, 0.02, 0.04, c.terracotta],
        [0.06, 0.03, -0.03, c.mustard],
        [0, 0.09, 0, c.leafLight],
      ].map(([dx, dy, dz, m], i) => (
        <Sph key={i} p={[3.7 + (dx as number), k.height + 0.13 + (dy as number), -6.9 + (dz as number)]} s={0.1} m={m as THREE.Material} />
      ))}
      <Cyl p={[4.2, k.height + 0.09, -7.1]} s={[0.1, 0.18, 0.1]} m={c.ceramic} />
      <B p={[6.5, k.height + 0.17, -7.0]} s={[0.36, 0.34, 0.3]} m={c.creamDeep} />
      <B p={[6.5, k.height + 0.36, -7.0]} s={[0.3, 0.06, 0.26]} m={c.charcoal} />
      {/* the fridge: rounded, cream, with a brass handle */}
      <RB p={[mid(f.x0, f.x1), f.height / 2, mid(f.z0, f.z1)]} s={[f.x1 - f.x0, f.height, f.z1 - f.z0]} m={c.creamDeep} />
      <B p={[f.x1 - 0.1, 1.0, f.z1 + 0.02]} s={[0.03, 0.5, 0.04]} m={c.brass} />
      <B p={[f.x1 - 0.1, 0.55, f.z1 + 0.02]} s={[0.03, 0.22, 0.04]} m={c.brass} />
      {/* wall cabinets, right of the window */}
      <B p={[mid(u.x0, u.x1), mid(u.y0, u.y1), -INNER + u.depth / 2]} s={[u.x1 - u.x0, u.y1 - u.y0, u.depth]} m={c.sage} />
      {Array.from({ length: 6 }, (_, i) => u.x0 + 0.4 + i * 0.78).map((x) => (
        <B key={x} p={[x, mid(u.y0, u.y1), -INNER + u.depth + 0.008]} s={[0.012, u.y1 - u.y0 - 0.12, 0.016]} m={c.sageDeep} />
      ))}
      {/* a shelf under the window with a herb pot and a jar */}
      <Cyl p={[0.6, 1.02, -7.15]} s={[0.12, 0.12, 0.12]} m={c.terracotta} />
      <Sph p={[0.6, 1.12, -7.15]} s={[0.16, 0.12, 0.16]} m={c.leafLight} />

      {/* the island: cabinets in oak, a butcher-block top with an overhang on the stool side */}
      <Island c={c} />
      {KITCHEN.stoolXs.map((x, i) => (
        <Stool key={i} x={x} z={KITCHEN.stoolZ} c={c} />
      ))}
      {/* a kitchen mat, the middle of Mochi's third stop */}
      <B p={[mid(KITCHEN.mat.x0, KITCHEN.mat.x1), 0.02, mid(KITCHEN.mat.z0, KITCHEN.mat.z1)]} s={[KITCHEN.mat.x1 - KITCHEN.mat.x0, 0.03, KITCHEN.mat.z1 - KITCHEN.mat.z0]} m={c.linen} />
      <B p={[mid(KITCHEN.mat.x0, KITCHEN.mat.x1), 0.038, mid(KITCHEN.mat.z0, KITCHEN.mat.z1)]} s={[KITCHEN.mat.x1 - KITCHEN.mat.x0 - 0.2, 0.012, KITCHEN.mat.z1 - KITCHEN.mat.z0 - 0.2]} m={c.terracottaSoft} />
    </group>
  );
}

function Island({ c }: { c: Mats }) {
  const i = KITCHEN.island;
  const cx = mid(i.x0, i.x1);
  const cz = mid(i.z0, i.z1);
  return (
    <group>
      <B p={[cx, (i.height - 0.06) / 2, cz - 0.05]} s={[i.x1 - i.x0 - 0.1, i.height - 0.06, i.z1 - i.z0 - 0.3]} m={c.oak} />
      <B p={[cx, i.height - 0.03, cz]} s={[i.x1 - i.x0 + 0.06, 0.06, i.z1 - i.z0 + 0.14]} m={c.oakLight} />
      {/* a bowl of lemons, two mugs, a plant */}
      <Cyl p={[cx - 0.6, i.height + 0.05, cz]} s={[0.34, 0.09, 0.34]} m={c.ceramic} />
      {[
        [-0.06, 0.05],
        [0.07, 0.03],
        [0, -0.06],
      ].map(([dx, dz], j) => (
        <Sph key={j} p={[cx - 0.6 + dx, i.height + 0.13, cz + dz]} s={[0.11, 0.09, 0.09]} m={c.mustard} />
      ))}
      <Cyl p={[cx + 0.35, i.height + 0.06, cz + 0.2]} s={[0.075, 0.09, 0.075]} m={c.terracotta} />
      <Cyl p={[cx + 0.55, i.height + 0.06, cz + 0.05]} s={[0.075, 0.09, 0.075]} m={c.cream} />
      <Cyl p={[cx + 0.8, i.height + 0.07, cz - 0.15]} s={[0.16, 0.1, 0.16]} m={c.terracottaDeep} />
      <Sph p={[cx + 0.8, i.height + 0.18, cz - 0.15]} s={[0.24, 0.2, 0.24]} m={c.leaf} />
    </group>
  );
}

/** A counter stool: four splayed legs, a foot ring and a padded top at CUSHIONS.stool. */
function Stool({ x, z, c }: { x: number; z: number; c: Mats }) {
  const cush = CUSHIONS.stool;
  return (
    <group position={[x, 0, z]}>
      <Cyl p={[0, cush.y, 0]} s={[0.44, cush.h, 0.44]} m={c.terracotta} />
      <Cyl p={[0, cush.y - 0.05, 0]} s={[0.4, 0.04, 0.4]} m={c.walnut} />
      {[
        [-0.14, -0.14],
        [0.14, -0.14],
        [-0.14, 0.14],
        [0.14, 0.14],
      ].map(([lx, lz], i) => (
        <Cyl key={i} p={[lx * 1.15, 0.21, lz * 1.15]} s={[0.035, 0.42, 0.035]} m={c.walnut} />
      ))}
      <Cyl p={[0, 0.18, 0]} s={[0.36, 0.02, 0.36]} m={c.walnut} />
    </group>
  );
}

/** Rafters: exposed timbers at the ceiling plane, running out from the back wall. The pendants' cords hang from them. */
function Rafters({ c }: { c: Mats }) {
  const rafters: { x: number; z1: number }[] = [
    { x: KITCHEN.pendantXs[0], z1: KITCHEN.pendantZ + 0.3 },
    { x: KITCHEN.pendantXs[1], z1: KITCHEN.pendantZ + 0.3 },
    { x: KITCHEN.bistro.x, z1: KITCHEN.bistro.z + 0.3 },
  ];
  return (
    <group>
      {rafters.map((r, i) => (
        <B key={i} p={[r.x, H - 0.1, mid(-INNER, r.z1)]} s={[0.16, 0.2, r.z1 + INNER]} m={c.walnut} />
      ))}
    </group>
  );
}

/** The lit half of the pendants: a bulb and a warm point light under each shade. The shade, the cord and the rafter are static. */
function PendantLights({ c }: { c: Mats }) {
  const boost = useLampBoost();
  const pendants: { x: number; z: number; y: number }[] = [
    ...KITCHEN.pendantXs.map((x) => ({ x, z: KITCHEN.pendantZ, y: KITCHEN.pendantY })),
    { x: KITCHEN.bistro.x, z: KITCHEN.bistro.z, y: 1.85 },
  ];
  return (
    <group userData={noMerge}>
      {pendants.map((p, i) => {
        // the cord runs from the rafter's underside (H - 0.2) down to the shade's crown
        const top = H - 0.2;
        const crown = p.y + 0.16;
        return (
          <group key={i} position={[p.x, 0, p.z]}>
            <Cyl p={[0, mid(top, crown), 0]} s={[0.022, top - crown, 0.022]} m={c.charcoal} />
            <Cyl p={[0, top - 0.005, 0]} s={[0.07, 0.03, 0.07]} m={c.brass} />
            <Cyl p={[0, p.y, 0]} s={[0.5, 0.3, 0.5]} m={c.brass} />
            <Cyl p={[0, crown, 0]} s={[0.07, 0.05, 0.07]} m={c.brass} />
            <Sph p={[0, p.y - 0.1, 0]} s={0.17} m={c.bulb} />
            <pointLight color="#ffe0b2" intensity={0.9 * boost} distance={5} decay={2} position={[0, p.y - 0.15, 0]} castShadow={false} />
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Tables and chairs
// ---------------------------------------------------------------------------------------

/** A dining chair facing its own +z (rotated by the seat's heading): four legs, a seat at CUSHIONS.dining, a slatted back. */
function DiningChair({ x, z, heading, c, m }: { x: number; z: number; heading: number; c: Mats; m: THREE.Material }) {
  const cush = CUSHIONS.dining;
  return (
    <group position={[x, 0, z]} rotation={[0, heading, 0]}>
      <RB p={[0, cush.y, 0]} s={[0.46, cush.h, 0.46]} m={m} />
      {[
        [-0.19, -0.19],
        [0.19, -0.19],
        [-0.19, 0.19],
        [0.19, 0.19],
      ].map(([lx, lz], i) => (
        <Cyl key={i} p={[lx, 0.16, lz]} s={[0.04, 0.32, 0.04]} m={c.walnut} />
      ))}
      {/* the back stands behind the sitter, never in front of them */}
      {[-0.19, 0.19].map((lx) => (
        <B key={lx} p={[lx, 0.6, -0.21]} s={[0.04, 0.5, 0.04]} m={c.walnut} />
      ))}
      <RB p={[0, 0.66, -0.22]} s={[0.42, 0.22, 0.05]} m={m} />
    </group>
  );
}

function BistroSet({ c }: { c: Mats }) {
  const t = KITCHEN.bistro;
  return (
    <group>
      <group position={[t.x, 0, t.z]}>
        <Cyl p={[0, 0.02, 0]} s={[0.5, 0.04, 0.5]} m={c.walnut} />
        <Cyl p={[0, 0.28, 0]} s={[0.07, 0.52, 0.07]} m={c.walnut} />
        <Cyl p={[0, t.height - 0.02, 0]} s={[t.radius * 2, 0.04, t.radius * 2]} m={c.ceramic} />
        <Cyl p={[0, t.height + 0.06, 0]} s={[0.07, 0.12, 0.07]} m={c.sage} />
        <Sph p={[0, t.height + 0.15, 0]} s={[0.15, 0.1, 0.15]} m={c.mustard} />
      </group>
      <DiningChair x={t.x} z={KITCHEN.bistroChairZs.north} heading={0} c={c} m={c.terracotta} />
      <DiningChair x={t.x} z={KITCHEN.bistroChairZs.south} heading={Math.PI} c={c} m={c.terracotta} />
    </group>
  );
}

function GamesTable({ c }: { c: Mats }) {
  const g = GAMES.table;
  const board = 0.78;
  const cell = board / 8;
  const squares: [number, number][] = [];
  for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) if ((r + q) % 2 === 1) squares.push([-board / 2 + cell * (q + 0.5), -board / 2 + cell * (r + 0.5)]);
  const pieces: { x: number; z: number; dark: boolean }[] = [];
  for (const [r, dark] of [[0, true], [1, true], [2, true], [5, false], [6, false], [7, false]] as [number, boolean][])
    for (let q = 0; q < 8; q++) if ((r + q) % 2 === 1) pieces.push({ x: -board / 2 + cell * (q + 0.5), z: -board / 2 + cell * (r + 0.5), dark });
  return (
    <group>
      <group position={[g.x, 0, g.z]}>
        <Cyl p={[0, 0.02, 0]} s={[0.7, 0.04, 0.7]} m={c.walnut} />
        <Cyl p={[0, 0.34, 0]} s={[0.12, 0.64, 0.12]} m={c.walnut} />
        <Cyl p={[0, g.height - 0.03, 0]} s={[g.radius * 2, 0.06, g.radius * 2]} m={c.walnut} />
        {/* a checkers set laid out on it */}
        <B p={[0, g.height + 0.012, 0]} s={[board + 0.08, 0.024, board + 0.08]} m={c.oak} />
        <B p={[0, g.height + 0.026, 0]} s={[board, 0.006, board]} m={c.cream} />
        {squares.map(([x, z], i) => (
          <B key={i} p={[x, g.height + 0.03, z]} s={[cell, 0.006, cell]} m={c.terracottaDeep} />
        ))}
        {pieces.map((p, i) => (
          <Cyl key={i} p={[p.x, g.height + 0.045, p.z]} s={[cell * 0.7, 0.026, cell * 0.7]} m={p.dark ? c.walnut : c.cream} />
        ))}
      </group>
      <DiningChair x={GAMES.chairA.x} z={GAMES.chairA.z} heading={Math.PI / 2} c={c} m={c.oak} />
      <DiningChair x={GAMES.chairB.x} z={GAMES.chairB.z} heading={-Math.PI / 2} c={c} m={c.oak} />
    </group>
  );
}

/** Four floor poufs round a low table: the room's easy place for a group to sit. */
function PoufCircle({ c }: { c: Mats }) {
  const t = POUF_CIRCLE.table;
  const cush = CUSHIONS.pouf;
  const tones = [c.terracotta, c.mustard, c.oliveSoft, c.plum];
  return (
    <group>
      <group position={[t.x, 0, t.z]}>
        <Cyl p={[0, 0.15, 0]} s={[0.16, 0.26, 0.16]} m={c.walnut} />
        <Cyl p={[0, t.height - 0.02, 0]} s={[t.radius * 2, 0.05, t.radius * 2]} m={c.oak} />
        <Cyl p={[0.1, t.height + 0.055, 0.05]} s={[0.09, 0.1, 0.09]} m={c.ceramic} />
        <Cyl p={[-0.12, t.height + 0.03, -0.08]} s={[0.22, 0.03, 0.22]} m={c.sage} />
      </group>
      {POUF_CIRCLE.poufs.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <Cyl p={[0, cush.y, 0]} s={[POUF_CIRCLE.radius * 2, cush.h, POUF_CIRCLE.radius * 2]} m={tones[i % tones.length]} />
          <Sph p={[0, cush.y + cush.h / 2 - 0.02, 0]} s={[POUF_CIRCLE.radius * 1.9, 0.12, POUF_CIRCLE.radius * 1.9]} m={tones[i % tones.length]} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Rugs, plants, wall art, the balustrade
// ---------------------------------------------------------------------------------------

/** A two-tone woven rug: a thin slab (so it has an edge, not a decal), its inner field a step higher. */
function Rug({ x, z, rx, rz, outer, inner }: { x: number; z: number; rx: number; rz: number; outer: THREE.Material; inner: THREE.Material }) {
  return (
    <group>
      <Cyl p={[x, 0.015, z]} s={[rx * 2, 0.03, rz * 2]} m={outer} />
      <Cyl p={[x, 0.0225, z]} s={[rx * 1.62, 0.045, rz * 1.62]} m={inner} />
    </group>
  );
}

function Rugs({ c }: { c: Mats }) {
  const h = HEARTH.rug;
  return (
    <group>
      <Rug x={h.x} z={h.z} rx={h.rx} rz={h.rz} outer={c.terracottaDeep} inner={c.creamDeep} />
      <Rug x={SUN_PATCH.x} z={SUN_PATCH.z} rx={SUN_PATCH.rx} rz={SUN_PATCH.rz} outer={c.rugWoolDeep} inner={c.rugWool} />
      <Rug x={POUF_CIRCLE.rug.x} z={POUF_CIRCLE.rug.z} rx={POUF_CIRCLE.rug.r} rz={POUF_CIRCLE.rug.r} outer={c.rugMossDeep} inner={c.rugMoss} />
      <Rug x={GAMES.table.x} z={GAMES.table.z} rx={1.5} rz={1.5} outer={c.rugRoseDeep} inner={c.rugRose} />
    </group>
  );
}

function Plants({ c }: { c: Mats }) {
  return (
    <group>
      {PLANTS.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <Cyl p={[0, 0.18, 0]} s={[0.42, 0.36, 0.42]} m={c.terracotta} />
          <Cyl p={[0, 0.375, 0]} s={[0.36, 0.03, 0.36]} m={c.soil} />
          {p.kind === "fig" && <Ficus c={c} />}
          {p.kind === "monstera" && <LeafyPlant c={c} />}
          {p.kind === "olive" && <OliveTree c={c} />}
        </group>
      ))}
    </group>
  );
}

// Nothing in a plant floats: every leaf cluster hangs on a visible stem or branch that runs back
// to the trunk or the soil (Stem takes both ends, so it is joined by construction), and the
// foliage is rounded clay clouds and fat lobes, never flat discs.

/** A rounded foliage cloud: three overlapping spheres, so it reads as one soft mass. */
function Cloud({ at, size, m, m2 }: { at: V3; size: number; m: THREE.Material; m2: THREE.Material }) {
  return (
    <group>
      <Sph p={at} s={[size, size * 0.86, size]} m={m} />
      <Sph p={[at[0] + size * 0.32, at[1] - size * 0.14, at[2] + size * 0.18]} s={size * 0.66} m={m2} />
      <Sph p={[at[0] - size * 0.3, at[1] + size * 0.1, at[2] - size * 0.2]} s={size * 0.62} m={m2} />
    </group>
  );
}

/** A ficus: one trunk up from the soil, four branches from its crown, a foliage cloud on each. */
function Ficus({ c }: { c: Mats }) {
  const clouds: { at: V3; size: number }[] = [
    { at: [0.02, 1.85, 0], size: 0.62 },
    { at: [-0.34, 1.5, 0.12], size: 0.5 },
    { at: [0.36, 1.55, -0.1], size: 0.52 },
    { at: [0.05, 1.42, -0.32], size: 0.44 },
  ];
  return (
    <group>
      <Stem a={[0, 0.38, 0]} b={[0, 1.3, 0]} r={0.045} m={c.walnut} />
      {clouds.map((cl, j) => (
        <group key={j}>
          <Stem a={[0, j === 0 ? 1.3 : 1.05 + j * 0.05, 0]} b={[cl.at[0], cl.at[1] - cl.size * 0.3, cl.at[2]]} r={0.028} m={c.walnut} />
          <Cloud at={cl.at} size={cl.size} m={j % 2 ? c.leafLight : c.leaf} m2={j % 2 ? c.leaf : c.leafLight} />
        </group>
      ))}
    </group>
  );
}

/** A leafy floor plant: stems fanning straight out of the soil, each ending in one fat rounded leaf. */
function LeafyPlant({ c }: { c: Mats }) {
  const stems = 7;
  return (
    <group>
      {Array.from({ length: stems }, (_, j) => {
        const a = (j / stems) * Math.PI * 2 + 0.4;
        const reach = 0.16 + (j % 3) * 0.06;
        const top = 0.85 + (j % 4) * 0.12;
        const tip: V3 = [Math.cos(a) * reach * 1.4, top, Math.sin(a) * reach * 1.4];
        const bend: V3 = [Math.cos(a) * reach * 0.5, top * 0.55, Math.sin(a) * reach * 0.5];
        return (
          <group key={j}>
            <Stem a={[Math.cos(a) * 0.04, 0.38, Math.sin(a) * 0.04]} b={bend} r={0.018} m={c.leaf} />
            <Stem a={bend} b={tip} r={0.016} m={c.leaf} />
            {/* the leaf is a thick lobe that starts at the stem's tip, tilted outward */}
            <Sph p={[tip[0] + Math.cos(a) * 0.1, tip[1] + 0.05, tip[2] + Math.sin(a) * 0.1]} s={[0.34, 0.2, 0.26]} r={[0, -a, 0.35]} m={j % 2 ? c.leafLight : c.leaf} />
          </group>
        );
      })}
    </group>
  );
}

/** A little olive tree: a leaning trunk, five branches, a soft grey-green cloud on each. */
function OliveTree({ c }: { c: Mats }) {
  const clouds: { at: V3; size: number }[] = [
    { at: [0.05, 1.55, 0.02], size: 0.42 },
    { at: [-0.24, 1.25, 0.1], size: 0.36 },
    { at: [0.27, 1.3, -0.06], size: 0.38 },
    { at: [-0.06, 1.15, -0.26], size: 0.32 },
    { at: [0.12, 1.02, 0.25], size: 0.3 },
  ];
  return (
    <group>
      <Stem a={[0, 0.38, 0]} b={[0.05, 0.95, 0]} r={0.04} m={c.walnut} />
      <Stem a={[0.05, 0.95, 0]} b={[0.05, 1.35, 0.02]} r={0.03} m={c.walnut} />
      {clouds.map((cl, j) => (
        <group key={j}>
          <Stem a={[0.05, 0.75 + j * 0.1, 0]} b={[cl.at[0], cl.at[1] - cl.size * 0.3, cl.at[2]]} r={0.02} m={c.walnut} />
          <Cloud at={cl.at} size={cl.size} m={j % 2 ? c.oliveLeaf : c.leafLight} m2={j % 2 ? c.leafLight : c.oliveLeaf} />
        </group>
      ))}
    </group>
  );
}

/** A framed picture on a wall: `p` is the centre and `rotY` faces it into the room (0 = toward +z). */
function Frame({ p, rotY, w, h, art, art2, c }: { p: V3; rotY: number; w: number; h: number; art: THREE.Material; art2: THREE.Material; c: Mats }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <B p={[0, 0, 0]} s={[w + 0.1, h + 0.1, 0.05]} m={c.walnut} />
      <B p={[0, 0, 0.03]} s={[w, h, 0.02]} m={c.cream} />
      <B p={[0, -h * 0.12, 0.045]} s={[w * 0.78, h * 0.5, 0.01]} m={art} />
      <Sph p={[w * 0.18, h * 0.22, 0.05]} s={[h * 0.28, h * 0.28, 0.02]} m={art2} />
    </group>
  );
}

function WallArt({ c }: { c: Mats }) {
  // on the plaster behind the sofa's leg, the left wall's blank stretch (rotY pi/2: facing +x)
  return (
    <group>
      <Frame p={[-INNER + 0.03, 1.75, -4.7]} rotY={Math.PI / 2} w={0.9} h={0.65} art={c.olive} art2={c.mustard} c={c} />
      <Frame p={[-INNER + 0.03, 1.55, -3.4]} rotY={Math.PI / 2} w={0.5} h={0.7} art={c.terracottaSoft} art2={c.cream} c={c} />
    </group>
  );
}

/** A low walnut balustrade along the two open edges: it keeps the diorama's edge readable and nobody in front of it. */
function Balustrade({ c }: { c: Mats }) {
  const edge = INNER;
  const posts: number[] = [];
  for (let v = -edge; v <= edge + 0.01; v += 1.2) posts.push(v);
  return (
    <group>
      {/* along +x (its rail runs in z) and along +z (its rail runs in x) */}
      <B p={[edge, 0.56, 0]} s={[0.08, 0.06, edge * 2]} m={c.walnut} />
      <B p={[edge, 0.3, 0]} s={[0.04, 0.04, edge * 2]} m={c.walnut} />
      <B p={[0, 0.56, edge]} s={[edge * 2, 0.06, 0.08]} m={c.walnut} />
      <B p={[0, 0.3, edge]} s={[edge * 2, 0.04, 0.04]} m={c.walnut} />
      {posts.map((v) => (
        <group key={v}>
          <B p={[edge, 0.27, v]} s={[0.09, 0.54, 0.09]} m={c.walnut} />
          <B p={[v, 0.27, edge]} s={[0.09, 0.54, 0.09]} m={c.walnut} />
        </group>
      ))}
    </group>
  );
}
