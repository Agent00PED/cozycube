import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// The mesh kit every world is built from.
//
//  1. Unit primitives (GEO): every shape is authored 1 unit tall about its centre, so a part is
//     just a position and a scale, and shared/seats.ts can derive a cushion's top from its scale.
//  2. Prim helpers (B, Cyl, Sph, Cone): one line per part. They never raycast, so a click always
//     reaches the floor or a seat's hit pad rather than a cushion or a wall.
//  3. StaticBatch: furniture never moves after mount, so each group of same-material meshes is
//     baked into ONE merged geometry, cutting hundreds of draw calls to a few dozen.
//  4. matte(): every material in this project is matte clay (roughness 0.7..0.85, metalness < 0.15).

export const noRaycast = () => null;

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  /** A soft-edged box: cushions, pillows, chair backs. The bevel scales with the part, which reads as squish. */
  round: new RoundedBoxGeometry(1, 1, 1, 4, 0.18),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  cylTaper: new THREE.CylinderGeometry(0.36, 0.5, 1, 20),
  sphere: new THREE.SphereGeometry(0.5, 20, 14),
  cone: new THREE.ConeGeometry(0.5, 1, 14),
  plane: new THREE.PlaneGeometry(1, 1),
  circle: new THREE.CircleGeometry(0.5, 48),
  torus: new THREE.TorusGeometry(0.5, 0.06, 8, 32),
};

/** A matte clay material. Roughness stays in 0.7..0.85 and metalness below 0.15 unless a part asks otherwise. */
export function matte(color: string, roughness = 0.8, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...opts });
}

type V3 = [number, number, number];
interface PrimProps {
  p: V3;
  s: V3 | number;
  m: THREE.Material;
  r?: V3;
}

function Prim({ geo, p, s, m, r }: PrimProps & { geo: THREE.BufferGeometry }) {
  // castShadow / receiveShadow are left off: nothing in this project uses a shadow map
  return <mesh geometry={geo} material={m} position={p} rotation={r} scale={s} castShadow={false} receiveShadow={false} raycast={noRaycast} />;
}
export const B = (props: PrimProps) => <Prim geo={GEO.box} {...props} />;
export const Cyl = (props: PrimProps) => <Prim geo={GEO.cyl} {...props} />;
export const RB = (props: PrimProps) => <Prim geo={GEO.round} {...props} />;
export const Sph = (props: PrimProps) => <Prim geo={GEO.sphere} {...props} />;
export const Cone = (props: PrimProps) => <Prim geo={GEO.cone} {...props} />;

/**
 * A cylinder running from point `a` to point `b`: a branch, a stem, a cord. Both ends are given
 * in the parent's space, so a plant's stems can be authored as "from the soil to the leaf" and
 * are joined to what they connect by construction.
 */
const Y_AXIS = new THREE.Vector3(0, 1, 0);
export function Stem({ a, b, r, m }: { a: V3; b: V3; r: number; m: THREE.Material }) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return <mesh geometry={GEO.cyl} material={m} position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} rotation={e} scale={[r * 2, len, r * 2]} castShadow={false} receiveShadow={false} raycast={noRaycast} />;
}

/** Mark a subtree as animated so StaticBatch leaves it alone. */
export const noMerge = { noMerge: true };

function isBatchable(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return false;
  if (Array.isArray(mesh.material) || mesh.userData.merged) return false;
  for (let p: THREE.Object3D | null = mesh; p && p !== root; p = p.parent) if (p.userData.noMerge) return false;
  return true;
}

/**
 * Bakes every static mesh under it into one merged mesh per material. The originals are only
 * hidden, never removed, so React still owns them and a re-render can't fight the batch.
 */
export function StaticBatch({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const buckets = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[]; sources: THREE.Mesh[] }>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!isBatchable(mesh, root)) return;
      const material = mesh.material as THREE.Material;
      let bucket = buckets.get(material.uuid);
      if (!bucket) buckets.set(material.uuid, (bucket = { material, geos: [], sources: [] }));
      let geo = mesh.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      // merging needs identical attribute sets, all indexed or none: normalise the odd ones out
      for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") geo.deleteAttribute(name);
      if (!geo.getAttribute("normal")) geo.computeVertexNormals();
      if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
      if (!geo.index) geo = mergeVertices(geo);
      bucket.geos.push(geo);
      bucket.sources.push(mesh);
    });

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
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.raycast = noRaycast;
      mesh.userData.merged = true;
      root.add(mesh);
      created.push(mesh);
      bucket.sources.forEach((s) => {
        s.visible = false;
        hidden.push(s);
      });
    });

    return () => {
      created.forEach((m) => {
        root.remove(m);
        m.geometry.dispose();
      });
      hidden.forEach((m) => (m.visible = true));
    };
  }, []);

  return <group ref={groupRef}>{children}</group>;
}

/** A tiny seeded random, so scattered decor is the same on every client. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Oak floorboards on one canvas: alternating plank tones with dark seams, drawn once. */
export function makePlankTexture(base: string, planks = 15): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const rnd = seeded(7);
  const baseColor = new THREE.Color(base);
  const step = size / planks;
  for (let i = 0; i < planks; i++) {
    for (let j = 0; j < 3; j++) {
      // each board is a third of the room long, staggered plank to plank
      const len = size / 3;
      const offset = ((i * 0.37) % 1) * len;
      const c = baseColor.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
      g.fillStyle = `#${c.getHexString()}`;
      g.fillRect(i * step, j * len - offset, step, len);
      g.fillRect(i * step, j * len - offset + size, step, len);
      g.fillStyle = "rgba(60, 35, 15, 0.35)";
      g.fillRect(i * step, j * len - offset, step, 2);
      g.fillRect(i * step, j * len - offset + size, step, 2);
    }
    g.fillStyle = "rgba(60, 35, 15, 0.35)";
    g.fillRect(i * step, 0, 2, size);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Small checked tile (kitchen floor) on a canvas. */
export function makeTileTexture(a: string, b: string, cells = 8): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const step = size / cells;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      g.fillStyle = (r + c) % 2 === 0 ? a : b;
      g.fillRect(c * step, r * step, step, step);
    }
  }
  g.strokeStyle = "rgba(90, 70, 50, 0.25)";
  g.lineWidth = 2;
  for (let i = 0; i <= cells; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo(i * step, size);
    g.moveTo(0, i * step);
    g.lineTo(size, i * step);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
