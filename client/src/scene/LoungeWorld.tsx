import { Suspense, useContext, useEffect, useMemo, useRef } from "react";
import { modelUrl } from "../assetVersion";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ModelBoundary } from "../entities/ModelBoundary";
import { B, Cyl, GEO, RB, Sph, StaticBatch, Stem, makePlankTexture, makeTileTexture, matte, noMerge, noRaycast, seeded } from "./kit";
import { TimeOfDayContext, useLampBoost, useWeather } from "./timeOfDay";
import type { TimeOfDay } from "@shared/types";
import { CUSHIONS } from "@shared/seats";
import {
  CHAISE,
  COFFEE_MACHINE,
  COFFEE_TABLE,
  GAMES,
  HEARTH,
  KITCHEN,
  LOFT_HALF,
  NOOK,
  PLANTS,
  POUF_CIRCLE,
  RADIO,
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
// fire (which flickers) opts out. The small things lying about (the throw pillows, the toaster,
// the kettle and pot, the fruit bowl, the bread basket, the mugs) are sculpted in Blender
// (scripts/blender/build_props.py -> props.glb) and placed by LoftProps, batched the same way.

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
  const floor = useMemo(() => floorGeometry(), []);
  useEffect(() => () => floor.dispose(), [floor]);
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };

  return (
    <group>
      {/* the floor is its own thin sheet and the ONLY click target for walking (a box would also
          return hits on its sides and underside and send you to nonsensical places): the loft's
          planks round the nook, and the nook's pit a step down */}
      <mesh geometry={floor} material={c.floor} onPointerDown={floorClick} />
      <StaticBatch>
        <Slab c={c} />
        <KitchenTile c={c} />
        <Walls c={c} />
        <Windows c={c} />
        <Hearth c={c} />
        <LogBasket c={c} />
        <Bookcases c={c} />
        <NookRim c={c} />
        {/* the nook's furniture stands on the pit's floor */}
        <group position={[0, -NOOK.depth, 0]}>
          <Sectional c={c} />
          <CoffeeTable c={c} />
        </group>
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
      <WindowWeather c={c} />
      {/* a missing or broken props.glb just leaves the counters bare: the room never fails */}
      <ModelBoundary what="props.glb" fallback={null}>
        <Suspense fallback={null}>
          <LoftProps />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The Blender props (client/public/models/props.glb)
// ---------------------------------------------------------------------------------------

const PROPS_URL = modelUrl("props.glb");
type PropName = "Prop_Pillow" | "Prop_Toaster" | "Prop_Kettle" | "Prop_DutchOven" | "Prop_FruitBowl" | "Prop_BreadBasket" | "Prop_Mug" | "Prop_Radio" | "Prop_CoffeeMachine";
/** The materials a placement may recolour: a pillow's fabric, a mug's glaze. */
const TINTABLE = new Set(["Prop_Fabric", "Prop_Glaze"]);

interface Placement {
  name: PropName;
  /** Where the middle of its base stands. */
  p: V3;
  /** Its heading about y (0 faces +z, into the room). */
  heading?: number;
  /** How far it leans back, radians: a pillow resting against a backrest. */
  tilt?: number;
  tint?: string;
}

const HOB_TOP = KITCHEN.counter.height + 0.022; // on the burners
const ISLAND_MID = { x: (KITCHEN.island.x0 + KITCHEN.island.x1) / 2, z: (KITCHEN.island.z0 + KITCHEN.island.z1) / 2 };
// The throw pillows stand on the seat cushions (their top is 0.36, down in the nook's pit) and lean
// back 16-17 degrees against the back cushions, well behind where a napping head goes
// (shared/worlds/lounge.ts nap).
const PILLOW_BASE = CUSHIONS.sofa.y + CUSHIONS.sofa.h / 2 - 0.01 - NOOK.depth;
const PILLOW_TILT = 0.28;
const PILLOW_Z = SOFA.runZ - 0.06;

const PLACEMENTS: Placement[] = [
  // the sectional: one at each end of the run, one in the corner; and one in the wingback
  { name: "Prop_Pillow", p: [SOFA.corner.x + 0.7, PILLOW_BASE, PILLOW_Z], heading: 0.2, tilt: PILLOW_TILT, tint: "#c4714a" },
  { name: "Prop_Pillow", p: [SOFA.run.x1 - 0.55, PILLOW_BASE, PILLOW_Z], heading: -0.3, tilt: PILLOW_TILT, tint: "#d9a441" },
  { name: "Prop_Pillow", p: [SOFA.corner.x - 0.02, PILLOW_BASE, SOFA.corner.z - 0.02], heading: Math.PI / 4, tilt: PILLOW_TILT, tint: "#f3e9d6" },
  { name: "Prop_Pillow", p: [READING.chair.x - 0.13, CUSHIONS.wingback.y + CUSHIONS.wingback.h / 2 - 0.01, READING.chair.z + 0.05], heading: Math.PI / 2 - 0.25, tilt: 0.3, tint: "#d9a441" },
  // the kitchen counter: the toaster where the espresso machine stood, a fruit bowl; the hob's
  // Dutch oven and kettle
  { name: "Prop_Toaster", p: [6.5, KITCHEN.counter.height, -6.98] },
  { name: "Prop_FruitBowl", p: [3.7, KITCHEN.counter.height, -6.9], heading: 0.3 },
  { name: "Prop_DutchOven", p: [KITCHEN.hobX - 0.2, HOB_TOP, -6.79], heading: 0.3 },
  { name: "Prop_Kettle", p: [KITCHEN.hobX + 0.2, HOB_TOP, -7.05], heading: -0.6 },
  // the island: a bread basket and two mugs of coffee
  { name: "Prop_BreadBasket", p: [ISLAND_MID.x - 0.6, KITCHEN.island.height, ISLAND_MID.z], heading: 0.25 },
  { name: "Prop_Mug", p: [ISLAND_MID.x + 0.35, KITCHEN.island.height, ISLAND_MID.z + 0.2], heading: 0.6, tint: "#c4714a" },
  { name: "Prop_Mug", p: [ISLAND_MID.x + 0.55, KITCHEN.island.height, ISLAND_MID.z + 0.05], heading: -0.5, tint: "#f3e9d6" },
  // the coffee machine at the counter (brew a drink there) and the radio on the green rug's low table
  { name: "Prop_CoffeeMachine", p: [COFFEE_MACHINE.x, KITCHEN.counter.height, COFFEE_MACHINE.z] },
  { name: "Prop_Radio", p: [RADIO.x, POUF_CIRCLE.table.height, RADIO.z], heading: -0.5 },
  // the coffee table's tray, down in the nook
  { name: "Prop_Mug", p: [COFFEE_TABLE.x + 0.14, COFFEE_TABLE.height + 0.022 - NOOK.depth, COFFEE_TABLE.z - 0.06], heading: 2.2, tint: "#e9dfd0" },
];

/** The Blender props, each copy placed, leaned and recoloured, then baked into one draw per material. */
function LoftProps() {
  const { scene } = useGLTF(PROPS_URL);
  const { placed, tints } = useMemo(() => {
    const tints = new Map<string, THREE.MeshStandardMaterial>();
    const tinted = (m: THREE.MeshStandardMaterial, color: string) => {
      const key = `${m.name}|${color}`;
      let t = tints.get(key);
      if (!t) tints.set(key, (t = m.clone()));
      t.color.set(color);
      return t;
    };
    const placed = PLACEMENTS.map((pl) => {
      const source = scene.getObjectByName(pl.name);
      if (!source) throw new Error(`props.glb has no "${pl.name}" node`);
      const copy = source.clone(true);
      copy.position.set(0, 0, 0);
      copy.rotation.set(0, 0, 0);
      copy.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.raycast = noRaycast;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (pl.tint && TINTABLE.has(material.name)) mesh.material = tinted(material, pl.tint);
      });
      const lean = new THREE.Group();
      lean.rotation.x = -(pl.tilt ?? 0);
      lean.add(copy);
      const at = new THREE.Group();
      at.position.set(...pl.p);
      at.rotation.y = pl.heading ?? 0;
      at.add(lean);
      return at;
    });
    return { placed, tints };
  }, [scene]);
  useEffect(() => () => tints.forEach((m) => m.dispose()), [tints]);
  return (
    <StaticBatch>
      {placed.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </StaticBatch>
  );
}

useGLTF.preload(PROPS_URL);

/**
 * The floor's planks: the loft's floor round the nook in four sheets, and the nook's pit a step
 * down, one geometry. The UVs are the whole floor's, so the planks run on unbroken across the cut.
 */
function floorGeometry(): THREE.BufferGeometry {
  const p = NOOK.pit;
  const sheets: [number, number, number, number, number][] = [
    // x0, x1, z0, z1, y
    [-HALF, HALF, -HALF, p.z0, 0],
    [-HALF, HALF, p.z1, HALF, 0],
    [-HALF, p.x0, p.z0, p.z1, 0],
    [p.x1, HALF, p.z0, p.z1, 0],
    [p.x0, p.x1, p.z0, p.z1, -NOOK.depth],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const [x0, x1, z0, z1, y] of sheets) {
    const base = pos.length / 3;
    for (const [x, z] of [
      [x0, z1],
      [x1, z1],
      [x1, z0],
      [x0, z0],
    ]) {
      pos.push(x, y, z);
      uv.push((x + HALF) / (HALF * 2), (HALF - z) / (HALF * 2));
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3); // wound to face up
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** The diorama slab under the floor: a chunky walnut block with a lighter lip, like a model on a
 *  table. The lip is a ring round the edge, so nothing covers the nook's pit. */
function Slab({ c }: { c: Mats }) {
  const lip = 0.6;
  const along = HALF * 2 + 0.02;
  const inset = HALF - lip / 2 + 0.01;
  return (
    <group>
      <B p={[0, -0.74, 0]} s={[HALF * 2, 1.16, HALF * 2]} m={c.slab} />
      <B p={[0, -0.09, inset]} s={[along, 0.14, lip]} m={c.slabTop} />
      <B p={[0, -0.09, -inset]} s={[along, 0.14, lip]} m={c.slabTop} />
      <B p={[inset, -0.09, 0]} s={[lip, 0.14, along]} m={c.slabTop} />
      <B p={[-inset, -0.09, 0]} s={[lip, 0.14, along]} m={c.slabTop} />
    </group>
  );
}

/** The nook's rim: the step's faces down to the pit (the two the camera sees, behind the sofa's
 *  backs) and an oak coping round the edge, so the step reads at a glance. */
function NookRim({ c }: { c: Mats }) {
  const p = NOOK.pit;
  const d = NOOK.depth;
  const w = 0.1;
  return (
    <group>
      <B p={[p.x0 - 0.01, -d / 2, mid(p.z0, p.z1)]} s={[0.02, d, p.z1 - p.z0]} m={c.oak} />
      <B p={[mid(p.x0, p.x1), -d / 2, p.z0 - 0.01]} s={[p.x1 - p.x0, d, 0.02]} m={c.oak} />
      {/* the coping, flush round the pit and just proud of the planks */}
      <B p={[mid(p.x0 - w, p.x1 + w), 0.012, p.z0 - w / 2]} s={[p.x1 - p.x0 + w * 2, 0.024, w]} m={c.oakLight} />
      <B p={[mid(p.x0 - w, p.x1 + w), 0.012, p.z1 + w / 2]} s={[p.x1 - p.x0 + w * 2, 0.024, w]} m={c.oakLight} />
      <B p={[p.x0 - w / 2, 0.012, mid(p.z0, p.z1)]} s={[w, 0.024, p.z1 - p.z0]} m={c.oakLight} />
      <B p={[p.x1 + w / 2, 0.012, mid(p.z0, p.z1)]} s={[w, 0.024, p.z1 - p.z0]} m={c.oakLight} />
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
// The light through the windows, and the rain on them
// ---------------------------------------------------------------------------------------

/** How the windows look at an hour: the glass's own colour and glow, the light falling through
 *  them (its colour, how strong the shafts and the pools on the floor are, and how high it comes
 *  from: a high sun lays short pools by the wall, a low one long streaks across the floor), and the
 *  directional light it throws into the room. */
interface WindowLook {
  pane: string;
  paneGlow: string;
  paneGlowAmt: number;
  shaft: string;
  shaftAmt: number;
  /** The light's elevation, radians above the horizon. */
  elev: number;
  lightAmt: number;
}
const WINDOW_CLEAR: Record<TimeOfDay, WindowLook> = {
  sunrise: { pane: "#ffd9c4", paneGlow: "#ffbf94", paneGlowAmt: 0.55, shaft: "#ffd7b0", shaftAmt: 0.22, elev: 0.5, lightAmt: 0.35 },
  // day: warm golden light from high up (#FFF4D6)
  day: { pane: "#cfeaf7", paneGlow: "#a8d6ee", paneGlowAmt: 0.55, shaft: "#fff4d6", shaftAmt: 0.26, elev: 0.78, lightAmt: 0.45 },
  // sunset: deep amber, low and long (#FFB366)
  sunset: { pane: "#ffc48a", paneGlow: "#ff9a48", paneGlowAmt: 0.65, shaft: "#ffb366", shaftAmt: 0.32, elev: 0.36, lightAmt: 0.55 },
  // night: a cool silver moonbeam (#D0E0FF)
  night: { pane: "#27355e", paneGlow: "#34497f", paneGlowAmt: 0.5, shaft: "#d0e0ff", shaftAmt: 0.15, elev: 0.66, lightAmt: 0.25 },
};
/** Under rain: dim, diffuse light, grey glass. */
const WINDOW_RAIN: Record<TimeOfDay, WindowLook> = {
  sunrise: { pane: "#a4acb4", paneGlow: "#8d98a3", paneGlowAmt: 0.4, shaft: "#c3cbd4", shaftAmt: 0.06, elev: 1.0, lightAmt: 0.14 },
  day: { pane: "#aab4bd", paneGlow: "#909ca8", paneGlowAmt: 0.42, shaft: "#c8d1da", shaftAmt: 0.06, elev: 1.05, lightAmt: 0.16 },
  sunset: { pane: "#7c7f8c", paneGlow: "#6b6e80", paneGlowAmt: 0.38, shaft: "#b6b2bb", shaftAmt: 0.05, elev: 1.0, lightAmt: 0.12 },
  night: { pane: "#1c2330", paneGlow: "#253043", paneGlowAmt: 0.4, shaft: "#aebbd0", shaftAmt: 0.04, elev: 1.0, lightAmt: 0.08 },
};

/** How far into the room the light may reach on the floor: the nook's pit starts there. */
const LIGHT_REACH_X = NOOK.pit.x0 - 0.05;
/** The shafts' glass edge: just inside the left wall. */
const GLASS_X = -INNER;
const SHAFT_VERTS_PER_WINDOW = 4 * 4; // four faces: top, bottom, the two sides
const POOL_Y = 0.05; // over the rugs

/**
 * The window light: soft shafts slanting in through the left wall's three windows onto pools on the
 * floor (additive, no depth write), a directional light from the same side, the glass taking the
 * hour's colour, and, while it rains, drops sliding down every pane. Everything eases to a new hour
 * or weather over a couple of seconds.
 */
function WindowWeather({ c }: { c: Mats }) {
  const hour = useContext(TimeOfDayContext);
  const weather = useWeather();
  const look = (weather === "rain" ? WINDOW_RAIN : WINDOW_CLEAR)[hour];
  const raining = weather === "rain";

  const { geometry, material } = useMemo(() => {
    const count = WINDOWS.length * (SHAFT_VERTS_PER_WINDOW + 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    const index: number[] = [];
    for (let q = 0; q < count / 4; q++) index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    g.setIndex(index);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    return { geometry: g, material: m };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  const light = useRef<THREE.DirectionalLight>(null);
  const eased = useRef({ elev: -1, shaft: new THREE.Color(look.shaft), shaftAmt: 0, pane: new THREE.Color(look.pane), glow: new THREE.Color(look.paneGlow), glowAmt: look.paneGlowAmt, lightAmt: look.lightAmt });
  const targets = useMemo(() => ({ shaft: new THREE.Color(look.shaft), pane: new THREE.Color(look.pane), glow: new THREE.Color(look.paneGlow) }), [look]);

  useFrame((_, delta) => {
    const e = eased.current;
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 1.7);
    e.shaft.lerp(targets.shaft, k);
    e.pane.lerp(targets.pane, k);
    e.glow.lerp(targets.glow, k);
    e.shaftAmt += (look.shaftAmt - e.shaftAmt) * k;
    e.glowAmt += (look.paneGlowAmt - e.glowAmt) * k;
    e.lightAmt += (look.lightAmt - e.lightAmt) * k;
    // the glass: the batch shares this material, so the whole window row changes with it
    c.pane.color.copy(e.pane);
    c.pane.emissive.copy(e.glow);
    c.pane.emissiveIntensity = e.glowAmt;
    material.color.copy(e.shaft);
    material.opacity = e.shaftAmt;
    // the light's height: re-lay the shafts only when it has moved
    const elev = e.elev < 0 ? look.elev : e.elev + (look.elev - e.elev) * k;
    if (Math.abs(elev - e.elev) > 0.0005) {
      e.elev = elev;
      layShafts(geometry, elev);
    }
    if (light.current) {
      light.current.color.copy(e.shaft);
      light.current.intensity = e.lightAmt;
      light.current.position.set(-HALF - Math.cos(elev) * 10, Math.sin(elev) * 10, 1);
    }
  });

  return (
    <group userData={noMerge}>
      {/* from outside the left wall's windows, into the room and down */}
      <directionalLight ref={light} castShadow={false} />
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} raycast={noRaycast} />
      {raining && <RainOnGlass />}
    </group>
  );
}

/**
 * The shafts and pools for light at `elev`: each window's opening extruded along the light until it
 * meets the floor (or the nook's rim), bright at the glass and fading as it goes, and the pool it
 * lays on the floor. Vertex colours carry the fade (the material's colour and opacity the hour's).
 */
function layShafts(g: THREE.BufferGeometry, elev: number) {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const col = g.getAttribute("color") as THREE.BufferAttribute;
  const run = 1 / Math.tan(Math.max(0.2, elev)); // across per unit fallen
  // where a ray through the glass at height y comes down (stopping at the nook's rim)
  const land = (y: number): [number, number] => {
    const x = GLASS_X + y * run;
    return x <= LIGHT_REACH_X ? [x, 0] : [LIGHT_REACH_X, y - (LIGHT_REACH_X - GLASS_X) / run];
  };
  let v = 0;
  const put = (x: number, y: number, z: number, a: number) => {
    pos.setXYZ(v, x, y, z);
    col.setXYZ(v, a, a, a);
    v++;
  };
  for (const w of WINDOWS) {
    const z0 = w.z0 + 0.1;
    const z1 = w.z1 - 0.1;
    const y0 = WINDOW_Y.y0 + 0.1;
    const y1 = WINDOW_Y.y1 - 0.1;
    const [xa, ya] = land(y0);
    const [xb, yb] = land(y1);
    const near = 0.55; // the glow at the glass
    const far = 0.12; // and where it lands
    // the top face and the bottom face (glass edge to floor)
    put(GLASS_X, y1, z0, near), put(GLASS_X, y1, z1, near), put(xb, yb, z1, far), put(xb, yb, z0, far);
    put(GLASS_X, y0, z0, near), put(GLASS_X, y0, z1, near), put(xa, ya, z1, far), put(xa, ya, z0, far);
    // the two sides
    put(GLASS_X, y1, z1, near), put(GLASS_X, y0, z1, near), put(xa, ya, z1, far), put(xb, yb, z1, far);
    put(GLASS_X, y1, z0, near), put(GLASS_X, y0, z0, near), put(xa, ya, z0, far), put(xb, yb, z0, far);
    // the pool on the floor, the window's shape stretched by the light's slant
    const p0 = Math.min(xa, LIGHT_REACH_X);
    const p1 = Math.min(xb, LIGHT_REACH_X);
    put(p0, POOL_Y, z0, 0.75), put(p0, POOL_Y, z1, 0.75), put(p1, POOL_Y, z1, 0.45), put(p1, POOL_Y, z0, 0.45);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  g.computeBoundingSphere();
}

const GLASS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// Drops on a pane: beads clinging to the glass, and runs sliding down it, each leaving a thin trail.
// uSize is the pane in world units, so a drop is the same size on every window.
const GLASS_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uSize;
varying vec2 vUv;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  vec2 w = vUv * uSize;
  // beads: a hashed scatter, a few centimetres apart
  vec2 g = w * 14.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id);
  vec2 off = (vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5) * 0.6;
  float r = 0.1 + 0.14 * hash(id + 5.1);
  float bead = step(0.55, h) * smoothstep(r, r * 0.35, length(f - off));
  // runs: a column every ~7 cm, some of them carrying a drop down at their own pace
  float cols = uSize.x * 14.0;
  float cx = vUv.x * cols;
  float c = floor(cx);
  float ch = hash(vec2(c, 3.7));
  float fx = (fract(cx) - 0.5) / 14.0; // metres from the column's middle
  float head = 1.0 - fract(uTime * (0.08 + ch * 0.12) + ch * 7.0);
  float dy = (vUv.y - head) * uSize.y;
  float drop = step(0.5, ch) * smoothstep(0.03, 0.012, length(vec2(fx, dy * 0.8)));
  float trail = step(0.5, ch) * step(0.0, dy) * smoothstep(0.35, 0.0, dy) * smoothstep(0.008, 0.002, abs(fx));
  float a = max(bead * 0.5, max(drop * 0.8, trail * 0.3));
  gl_FragColor = vec4(vec3(0.9, 0.94, 0.98), a);
  #include <colorspace_fragment>
}`;

/** Rain on the glass: a sheet of drops just inside each pane (the left wall's three and the kitchen's). */
function RainOnGlass() {
  const panes = useMemo(() => {
    const k = KITCHEN.window;
    const list: { p: V3; r: V3; w: number; h: number }[] = WINDOWS.map((w) => ({ p: [GLASS_X - 0.06, mid(WINDOW_Y.y0, WINDOW_Y.y1), mid(w.z0, w.z1)] as V3, r: [0, Math.PI / 2, 0] as V3, w: w.z1 - w.z0 - 0.2, h: WINDOW_Y.y1 - WINDOW_Y.y0 - 0.2 }));
    list.push({ p: [mid(k.x0, k.x1), mid(k.y0, k.y1), -INNER - 0.06], r: [0, 0, 0], w: k.x1 - k.x0 - 0.2, h: k.y1 - k.y0 - 0.2 });
    return list.map((pane) => ({
      ...pane,
      material: new THREE.ShaderMaterial({ vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false, toneMapped: false, uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(pane.w, pane.h) } } }),
    }));
  }, []);
  useEffect(() => () => panes.forEach((p) => p.material.dispose()), [panes]);
  useFrame(({ clock }) => {
    for (const p of panes) p.material.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <>
      {panes.map((p, i) => (
        <mesh key={i} geometry={GEO.plane} material={p.material} position={p.p} rotation={p.r} scale={[p.w, p.h, 1]} raycast={noRaycast} renderOrder={4} />
      ))}
    </>
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
// The Sunken Living Nook: a closed L-shaped sectional, the coffee table, the rug
// ---------------------------------------------------------------------------------------

/**
 * The nook's sectional, in the pit's own frame (LoungeWorld stands it on the pit's floor). One
 * continuous base and back wrap the corner (no gaps, no missing corner geometry): a long run with
 * its back along the pit's back edge, a return leg down its left edge, and the corner cell where
 * they meet, all facing the room. Every seat cushion sits at CUSHIONS.sofa, which is where the
 * seat anchors come from.
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
      {/* the backs wrap the corner: along the run's rear (the pit's back edge), and down the leg's (its left edge) */}
      <RB p={[mid(run.x0, run.x1 - 0.25), backY, run.z0 + 0.15]} s={[run.x1 - 0.25 - run.x0, backH, 0.3]} m={c.olive} />
      <RB p={[run.x0 + 0.15, backY, mid(run.z0, leg.z1 - 0.25)]} s={[0.3, backH, leg.z1 - 0.25 - run.z0]} m={c.olive} />
      {/* arms at the two open ends */}
      <RB p={[run.x1 - 0.125, 0.36, mid(run.z0, run.z1)]} s={[0.25, 0.52, run.z1 - run.z0]} m={c.olive} />
      <RB p={[mid(leg.x0, leg.x1), 0.36, leg.z1 - 0.125]} s={[leg.x1 - leg.x0, 0.52, 0.25]} m={c.olive} />
      {/* seat cushions, and a soft back cushion behind each */}
      {cells.map((cell, i) => (
        <group key={i}>
          <RB p={[cell.alongX ? cell.x : cell.x + 0.05, cush.y, cell.alongX ? cell.z + 0.05 : cell.z]} s={cell.alongX ? [0.96, cush.h, 0.84] : [0.84, cush.h, 0.96]} m={c.oliveSoft} />
          <RB p={cell.alongX ? [cell.x, 0.62, run.z0 + 0.34] : [leg.x0 + 0.34, 0.62, cell.z]} s={cell.alongX ? [0.9, 0.5, 0.16] : [0.16, 0.5, 0.9]} r={cell.alongX ? [0.16, 0, 0] : [0, 0, 0.16]} m={c.oliveSoft} />
        </group>
      ))}
      {/* its throw pillows are Blender props (LoftProps) */}
      {/* four little feet */}
      {[
        [run.x1 - 0.1, run.z0 + 0.1],
        [run.x1 - 0.1, run.z1 - 0.1],
        [leg.x1 - 0.1, leg.z1 - 0.1],
        [leg.x0 + 0.1, leg.z1 - 0.1],
      ].map(([x, z], i) => (
        <Cyl key={i} p={[x, 0.02, z]} s={[0.07, 0.04, 0.07]} m={c.walnut} />
      ))}
    </group>
  );
}

/** A woven basket of split logs beside the hearth. */
function LogBasket({ c }: { c: Mats }) {
  const b = HEARTH.logBasket;
  return (
    <group position={[b.x, 0, b.z]}>
      <Cyl p={[0, 0.15, 0]} s={[b.r * 2, 0.3, b.r * 2]} m={c.linen} />
      <Cyl p={[0, 0.3, 0]} s={[b.r * 2 + 0.04, 0.04, b.r * 2 + 0.04]} m={c.oak} />
      <Cyl p={[-0.08, 0.35, 0.02]} s={[0.1, 0.5, 0.1]} r={[0, 0.3, Math.PI / 2]} m={c.walnut} />
      <Cyl p={[0.08, 0.36, -0.06]} s={[0.1, 0.48, 0.1]} r={[0, -0.25, Math.PI / 2]} m={c.oak} />
      <Cyl p={[0, 0.44, 0]} s={[0.09, 0.46, 0.09]} r={[0, 0.9, Math.PI / 2]} m={c.walnut} />
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
      {/* a tray, two books and a little plant (and a mug of coffee: LoftProps) */}
      <Cyl p={[0, t.height + 0.012, 0]} s={[0.62, 0.02, 0.62]} m={c.creamDeep} />
      <B p={[-0.1, t.height + 0.04, 0.05]} s={[0.26, 0.035, 0.19]} r={[0, 0.3, 0]} m={c.books[2]} />
      <B p={[-0.1, t.height + 0.075, 0.05]} s={[0.22, 0.035, 0.16]} r={[0, 0.1, 0]} m={c.books[1]} />
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
      {/* the hob: four burners (its Dutch oven and kettle are Blender props: LoftProps) */}
      {[
        [-0.2, -0.13],
        [0.2, -0.13],
        [-0.2, 0.13],
        [0.2, 0.13],
      ].map(([dx, dz], i) => (
        <Cyl key={i} p={[KITCHEN.hobX + dx, k.height + 0.012, -6.92 + dz]} s={[0.2, 0.02, 0.2]} m={c.charcoal} />
      ))}
      {/* on the counter: a cutting board and a jar of spoons (the fruit bowl and the toaster are
          Blender props: LoftProps) */}
      <B p={[2.9, k.height + 0.015, -6.95]} s={[0.5, 0.03, 0.3]} m={c.oakLight} />
      <Cyl p={[4.2, k.height + 0.09, -7.1]} s={[0.1, 0.18, 0.1]} m={c.ceramic} />
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
      {/* a plant (the bread basket and two mugs of coffee are Blender props: LoftProps) */}
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
        {/* the radio sits on it (a Blender prop: LoftProps) */}
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
function Rug({ x, z, rx, rz, outer, inner, y = 0 }: { x: number; z: number; rx: number; rz: number; outer: THREE.Material; inner: THREE.Material; y?: number }) {
  return (
    <group>
      <Cyl p={[x, y + 0.015, z]} s={[rx * 2, 0.03, rz * 2]} m={outer} />
      <Cyl p={[x, y + 0.0225, z]} s={[rx * 1.62, 0.045, rz * 1.62]} m={inner} />
    </group>
  );
}

function Rugs({ c }: { c: Mats }) {
  const h = HEARTH.rug;
  const n = NOOK.rug;
  return (
    <group>
      {/* the nook's big rug, on the pit's floor; Mochi's mat by the hearth */}
      <Rug x={n.x} z={n.z} rx={n.rx} rz={n.rz} y={-NOOK.depth} outer={c.terracottaDeep} inner={c.creamDeep} />
      <Rug x={h.x} z={h.z} rx={h.rx} rz={h.rz} outer={c.rugWoolDeep} inner={c.rugWool} />
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
  // on the left wall's blank stretch by the hearth (rotY pi/2: facing +x)
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
