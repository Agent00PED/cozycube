import * as THREE from "three";

// Whether anything stands between two points in a world (docs/caverns-roadmap.md phase 7): a world's
// big static meshes (its triangles in world space) bucketed in a grid on the ground, so a segment only
// tests the triangles of the cells it crosses. The local player's x-ray silhouette asks it a few times a
// second (is the player hidden from the camera?) instead of drawing the silhouette every frame: the
// silhouette is a second draw of every part of the avatar, so this saves as many draw calls as the
// avatar has parts, and its triangles, whenever nothing hides you.
//
// A world registers its index (`xrayGate.index`) while it is up; without one (the other worlds) the
// silhouette is drawn always, as before.

export class OcclusionIndex {
  private tris: Float32Array;
  private cells = new Map<number, number[]>();
  private stamp: Uint32Array;
  private pass = 0;
  private x0: number;
  private z0: number;

  constructor(meshes: THREE.Mesh[], private readonly cell = 1.5) {
    let n = 0;
    for (const m of meshes) {
      const g = m.geometry;
      n += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
    this.tris = new Float32Array(n * 9);
    let x0 = Infinity;
    let z0 = Infinity;
    const v = new THREE.Vector3();
    let k = 0;
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      const g = m.geometry;
      const pos = g.attributes.position as THREE.BufferAttribute;
      const idx = g.index;
      const count = idx ? idx.count : pos.count;
      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
        this.tris[k * 3] = v.x;
        this.tris[k * 3 + 1] = v.y;
        this.tris[k * 3 + 2] = v.z;
        x0 = Math.min(x0, v.x);
        z0 = Math.min(z0, v.z);
        k++;
      }
    }
    this.x0 = x0;
    this.z0 = z0;
    const t = this.tris;
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const cx0 = this.cx(Math.min(t[o], t[o + 3], t[o + 6]));
      const cx1 = this.cx(Math.max(t[o], t[o + 3], t[o + 6]));
      const cz0 = this.cz(Math.min(t[o + 2], t[o + 5], t[o + 8]));
      const cz1 = this.cz(Math.max(t[o + 2], t[o + 5], t[o + 8]));
      for (let a = cx0; a <= cx1; a++)
        for (let b = cz0; b <= cz1; b++) {
          const key = a * 4096 + b;
          const list = this.cells.get(key);
          if (list) list.push(i);
          else this.cells.set(key, [i]);
        }
    }
    this.stamp = new Uint32Array(n);
  }

  private cx(x: number) {
    return Math.floor((x - this.x0) / this.cell);
  }
  private cz(z: number) {
    return Math.floor((z - this.z0) / this.cell);
  }

  /** Whether the segment from `a` to `b` passes through any of the meshes (its very ends left out). */
  blocked(a: THREE.Vector3, b: THREE.Vector3): boolean {
    this.pass = (this.pass + 1) >>> 0 || 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    const seen = new Set<number>();
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = a.x + dx * u;
      const z = a.z + dz * u;
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const key = (this.cx(x) + ox) * 4096 + (this.cz(z) + oz);
          if (seen.has(key)) continue;
          seen.add(key);
          const list = this.cells.get(key);
          if (!list) continue;
          for (const i of list) {
            if (this.stamp[i] === this.pass) continue;
            this.stamp[i] = this.pass;
            if (this.hits(i, a, dx, dy, dz)) return true;
          }
        }
    }
    return false;
  }

  /** Möller-Trumbore: the segment a + t (dx, dy, dz), t in (0.02, 0.98), through triangle i. */
  private hits(i: number, a: THREE.Vector3, dx: number, dy: number, dz: number): boolean {
    const t = this.tris;
    const o = i * 9;
    const e1x = t[o + 3] - t[o];
    const e1y = t[o + 4] - t[o + 1];
    const e1z = t[o + 5] - t[o + 2];
    const e2x = t[o + 6] - t[o];
    const e2y = t[o + 7] - t[o + 1];
    const e2z = t[o + 8] - t[o + 2];
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) return false;
    const inv = 1 / det;
    const sx = a.x - t[o];
    const sy = a.y - t[o + 1];
    const sz = a.z - t[o + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return false;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return false;
    const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return d > 0.02 && d < 0.98;
  }
}

/** The local player's x-ray: the world's index (null: draw it always) and whether they are hidden now. */
export const xrayGate = { index: null as OcclusionIndex | null, occluded: true };
