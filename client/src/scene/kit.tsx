import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Building blocks for the procedural world.
//
// Three things keep a 28x28 diorama with six furnished zones running smoothly:
//  1. Unit geometries, created ONCE for the whole app. Every box in every zone is the same
//     1x1x1 buffer scaled into shape, so switching maps never re-uploads geometry.
//  2. A shared material palette (useSharedMaterials), so hundreds of meshes compile a handful of
//     shader programs instead of one per <meshStandardMaterial>.
//  3. InstancedMesh for anything repeated (books, trees, rocks, flowers, planks, bulbs): one draw
//     call for the whole set instead of one per object.
//
// And every decorative mesh here ignores raycasts, so click-to-move always reaches the floor.

export const noRaycast = () => null;

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  cylLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
  cylTaper: new THREE.CylinderGeometry(0.42, 0.5, 1, 14),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  sphereLow: new THREE.SphereGeometry(0.5, 7, 5),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  coneLow: new THREE.ConeGeometry(0.5, 1, 7),
  pyramid: new THREE.ConeGeometry(0.5, 1, 4),
  plane: new THREE.PlaneGeometry(1, 1),
  circle: new THREE.CircleGeometry(0.5, 40),
  torus: new THREE.TorusGeometry(0.5, 0.06, 8, 32),
};

// Parametric shapes (rings, partial tori) can't be unit-scaled, so they're cached by their
// parameters instead. NEVER write `new THREE.RingGeometry(...)` inline in JSX: the scene
// re-renders on every player state patch, and each render would upload a fresh geometry.
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
export const ringGeo = (inner: number, outer: number) =>
  cached(`ring:${inner}:${outer}`, () => new THREE.RingGeometry(inner, outer, 64));
export const arcGeo = (radius: number, tube: number, arc: number) =>
  cached(`arc:${radius}:${tube}:${arc}`, () => new THREE.TorusGeometry(radius, tube, 8, 24, arc));

type V3 = [number, number, number];

interface PrimitiveProps {
  p: V3;
  s: V3 | number;
  m: THREE.Material;
  r?: V3;
  /** Furniture casts shadows; small clutter and wall decor should not (it only adds shadow-pass draws). */
  cast?: boolean;
  recv?: boolean;
}

function Prim({ geo, p, s, m, r, cast = false, recv = false }: PrimitiveProps & { geo: THREE.BufferGeometry }) {
  return (
    <mesh
      geometry={geo}
      material={m}
      position={p}
      rotation={r}
      scale={s}
      castShadow={cast && castsUsefulShadow(s)}
      receiveShadow={recv}
      raycast={noRaycast}
    />
  );
}

// Whether a shape is worth a shadow-pass draw. The test is the SECOND largest dimension, not
// the largest: a table leg is 0.7 long but 4cm thick, and its shadow is a hairline nobody will
// ever notice — while every caster costs the shadow pass a full extra draw call. Only shapes
// with a real silhouette (both of their two biggest dimensions chunky) cast.
const SILHOUETTE_MIN = 0.45;
export function castsUsefulShadow(s: V3 | number): boolean {
  if (!Array.isArray(s)) return s >= SILHOUETTE_MIN;
  const [, mid] = [...s].sort((a, b) => b - a);
  return mid >= SILHOUETTE_MIN;
}

/** Box by centre `p` and full size `s`. */
export const B = (props: PrimitiveProps) => <Prim geo={GEO.box} {...props} />;
/** Cylinder by centre and [diameter, height, diameter]. */
export const Cyl = (props: PrimitiveProps & { low?: boolean }) => (
  <Prim geo={props.low ? GEO.cylLow : GEO.cyl} {...props} />
);
/** Sphere by centre and [diameter x, y, z]. */
export const Sph = (props: PrimitiveProps & { low?: boolean }) => (
  <Prim geo={props.low ? GEO.sphereLow : GEO.sphere} {...props} />
);
export const Cone = (props: PrimitiveProps) => <Prim geo={GEO.cone} {...props} />;

/** A flat disc/rug lying on the floor. `y` should differ between overlapping rugs to avoid z-fighting. */
export function Rug({ x, z, radius, y = 0.06, m, sx = 1 }: { x: number; z: number; radius: number; y?: number; m: THREE.Material; sx?: number }) {
  return (
    <mesh
      geometry={GEO.circle}
      material={m}
      position={[x, y, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[radius * 2 * sx, radius * 2, 1]}
      receiveShadow
      raycast={noRaycast}
    />
  );
}

/** A flat rectangle lying on the floor (tiles, mats, zone overlays). */
export function FloorPatch({ x0, x1, z0, z1, y = 0.006, m }: { x0: number; x1: number; z0: number; z1: number; y?: number; m: THREE.Material }) {
  return (
    <mesh
      geometry={GEO.plane}
      material={m}
      position={[(x0 + x1) / 2, y, (z0 + z1) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[x1 - x0, z1 - z0, 1]}
      receiveShadow
      raycast={noRaycast}
    />
  );
}

export interface InstanceSpec {
  p: V3;
  s?: V3;
  r?: V3;
  color?: string;
}

const _obj = new THREE.Object3D();
const _col = new THREE.Color();

/** One draw call for many copies of the same geometry+material. */
export function Instanced({
  geo,
  m,
  items,
  cast = false,
  recv = false,
}: {
  geo: THREE.BufferGeometry;
  m: THREE.Material;
  items: InstanceSpec[];
  cast?: boolean;
  recv?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      _obj.position.set(...it.p);
      _obj.rotation.set(...(it.r ?? [0, 0, 0]));
      _obj.scale.set(...(it.s ?? [1, 1, 1]));
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
      if (it.color) mesh.setColorAt(i, _col.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Instances spread far beyond the base geometry's own bounds; without this the whole set
    // gets frustum-culled the moment the ORIGINAL unit shape leaves the screen.
    mesh.computeBoundingSphere();
  }, [items]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geo, m, items.length]}
      castShadow={cast}
      receiveShadow={recv}
      raycast={noRaycast}
    />
  );
}

/** Deterministic PRNG so procedural layouts (forests, book colours) are identical on every client. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function useSharedMaterials() {
  const materials = useMemo(() => {
    const make = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
    return {
      // woods
      wood: make("#a8743f"),
      oak: make("#c89a5e"),
      darkWood: make("#5a3a24"),
      walnut: make("#4a2f1d"),
      plankA: make("#b98552"),
      bark: make("#4a3524", { roughness: 0.95 }),
      // fabrics & soft furnishings
      cream: make("#f0e6d2", { roughness: 0.95 }),
      white: make("#f7f3ea"),
      sage: make("#7d9471"),
      sageDark: make("#6b8060"),
      mustard: make("#e0a93b"),
      terracotta: make("#c4714a"),
      blush: make("#e3b3a3", { roughness: 0.95 }),
      navy: make("#2f3f5c"),
      velvetGreen: make("#3f6b52", { roughness: 0.7 }),
      rust: make("#a8553a"),
      plum: make("#5b3a63"),
      denCarpet: make("#2f2b45", { roughness: 1 }),
      libraryRug: make("#3f5a47", { roughness: 1 }),
      // hard surfaces
      marble: make("#ece8e1", { roughness: 0.3 }),
      tile: make("#e7e0d2", { roughness: 0.6 }),
      charcoal: make("#2b2b30", { roughness: 0.5 }),
      black: make("#14141a", { roughness: 0.45 }),
      metal: make("#9aa0a8", { roughness: 0.35, metalness: 0.6 }),
      brass: make("#c9a24a", { roughness: 0.35, metalness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({
        color: "#cfe6ee",
        roughness: 0.05,
        metalness: 0.1,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
      mirror: make("#b9c9d3", { roughness: 0.05, metalness: 0.9 }),
      // outdoors
      leaf: make("#2f6b3f", { roughness: 0.8 }),
      leafLight: make("#4a8a55", { roughness: 0.8 }),
      olive: make("#7f9168", { roughness: 0.8 }),
      stone: make("#6b6b6b", { roughness: 1, flatShading: true }),
      dirt: make("#3b2a1c", { roughness: 1 }),
      pine: make("#1f4a34", { roughness: 0.85 }),
      pineLight: make("#2a6044", { roughness: 0.85 }),
      water: new THREE.MeshStandardMaterial({
        color: "#2f6480",
        emissive: "#0d2c3d",
        roughness: 0.12,
        metalness: 0.15,
        transparent: true,
        opacity: 0.9,
      }),
      mud: make("#2c3a2c", { roughness: 1 }),
      // beach
      sand: make("#f2ddb6", { roughness: 1 }),
      wetSand: make("#d9c194", { roughness: 0.95 }),
      seaShallow: new THREE.MeshStandardMaterial({ color: "#5fc6d8", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }),
      seaDeep: new THREE.MeshStandardMaterial({ color: "#1f7fa8", roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.95 }),
      foam: make("#f4fbfb", { roughness: 0.8 }),
      thatch: make("#c79a4e", { roughness: 1, flatShading: true }),
      palmLeaf: make("#3f8f5a", { roughness: 0.8 }),
      coral: make("#e8705f", { roughness: 0.7 }),
      shell: make("#f6e6d8", { roughness: 0.7 }),
      tikiFlame: new THREE.MeshBasicMaterial({ color: "#ff9a3d", toneMapped: false }),
      mushroom: make("#c9423a", { roughness: 0.6 }),
      // Multiplied by per-instance colour (setColorAt), so one material serves every book/flower.
      tintable: make("#ffffff"),
      // emissive accents (never real lights — see ToggleableProp for why lights are scarce)
      warmGlow: make("#fff3d6", { emissive: "#ffcf7a", emissiveIntensity: 1.1 }),
      bulb: make("#fff1c9", { emissive: "#ffc76b", emissiveIntensity: 2.2 }),
      screenGlow: make("#0d0d10", { emissive: "#3a6ea8", emissiveIntensity: 0.5 }),
      neon: make("#7a2ee6", { emissive: "#7a2ee6", emissiveIntensity: 1.5 }),
      neonPink: make("#ff4fd8", { emissive: "#ff4fd8", emissiveIntensity: 2 }),
      neonCyan: make("#4fd8ff", { emissive: "#4fd8ff", emissiveIntensity: 2 }),
      doorwayGlow: make("#ffe3b0", { emissive: "#ffcc80", emissiveIntensity: 1.4 }),
    };
  }, []);

  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
    },
    [materials]
  );

  return materials;
}

export type Materials = ReturnType<typeof useSharedMaterials>;

// ---------------------------------------------------------------------------------------
// Static batching
// ---------------------------------------------------------------------------------------

/** Mark a subtree as animated/interactive so StaticBatch leaves it alone. */
export const noMerge = { noMerge: true };

/** Half the world's width: the diorama slab spans -HALF..HALF on both axes. */
export const HALF = 9;

function collectMergeable(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o.userData.noMerge) return; // (traverse can't prune, so children re-check below)
    if (!(o as THREE.Mesh).isMesh) return;
    if ((o as THREE.InstancedMesh).isInstancedMesh) return; // already one draw call
    const mesh = o as THREE.Mesh;
    if (Array.isArray(mesh.material)) return;
    if (mesh.userData.merged) return;
    // Anything under a node the author marked, or anything that owns click handlers, stays.
    for (let p: THREE.Object3D | null = mesh; p && p !== root; p = p.parent) {
      if (p.userData.noMerge) return;
    }
    out.push(mesh);
  });
  return out;
}

// The penthouse is ~550 individually-authored little meshes, and every visible one is its own
// draw call — which is what made a big room lag on modest hardware. The geometry never moves
// after mount, so this bakes each group of same-material, same-shadow-flag meshes into ONE
// merged buffer at startup: same pixels, a fraction of the calls. The originals are only
// hidden (never removed), so React still owns them and a re-render can't fight this.
export function StaticBatch({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root) return;
    root.updateWorldMatrix(false, true);
    const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const buckets = new Map<string, { material: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[]; sources: THREE.Mesh[] }>();
    for (const mesh of collectMergeable(root)) {
      const material = mesh.material as THREE.Material;
      const key = `${material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material, cast: mesh.castShadow, recv: mesh.receiveShadow, geos: [], sources: [] };
        buckets.set(key, bucket);
      }
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      // Merging needs identical attribute sets; the kit's unit shapes all carry position/normal/uv.
      geo.deleteAttribute("uv1");
      bucket.geos.push(geo);
      bucket.sources.push(mesh);
    }

    const created: THREE.Mesh[] = [];
    const hidden: THREE.Mesh[] = [];
    buckets.forEach((bucket) => {
      if (bucket.geos.length < 2) {
        bucket.geos.forEach((g) => g.dispose());
        return;
      }
      const merged = mergeGeometries(bucket.geos);
      bucket.geos.forEach((g) => g.dispose());
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = bucket.cast;
      mesh.receiveShadow = bucket.recv;
      mesh.raycast = noRaycast;
      mesh.userData.merged = true;
      root.add(mesh);
      created.push(mesh);
      bucket.sources.forEach((source) => {
        source.visible = false;
        hidden.push(source);
      });
    });

    return () => {
      created.forEach((mesh) => {
        root.remove(mesh);
        mesh.geometry.dispose();
      });
      hidden.forEach((mesh) => (mesh.visible = true));
    };
  });

  return <group ref={groupRef}>{children}</group>;
}
