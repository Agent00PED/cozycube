import * as THREE from "three";
import { cavernsFloorY } from "@shared/worlds/caverns";
import { noRaycast } from "./kit";

// The Glimmering Caverns' little pieces (docs/caverns-roadmap.md phase 3), one pool of each for the
// whole cave (caveFx(): made on first use, drawn and stepped by CaveFxLayer in caveOres.tsx):
//
//   FxPool     glowing sparks thrown as streaks along their flight, the shards off a shattered node,
//              rock chips tumbling off a blow (each bouncing on the floor where it falls: the cave's
//              own heightfield, never a flat plane), and the loot flying to you: one instanced mesh
//   PuffPool   dust and steam puffs: soft discs that swell and fade (one Points draw, each puff's size
//              in metres at the camera's zoom)

interface Piece {
  kind: "spark" | "shard" | "chip" | "loot";
  t: number;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  from: THREE.Vector3;
  size: number;
  delay: number;
  spin: THREE.Vector3;
}
const FX_GEO = new THREE.OctahedronGeometry(1, 0);
const UP = new THREE.Vector3(0, 1, 0);

export class FxPool {
  mesh: THREE.InstancedMesh;
  private pieces: (Piece | null)[];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private c = new THREE.Color();
  private s = new THREE.Vector3();
  private dir = new THREE.Vector3();
  constructor(n: number) {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(FX_GEO, mat, n);
    this.mesh.raycast = noRaycast;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.pieces = Array.from({ length: n }, () => null);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
  }
  private add(p: Omit<Piece, "spin"> & { spin?: THREE.Vector3 }, color: string) {
    const i = this.pieces.findIndex((x) => x === null);
    if (i < 0) return;
    this.pieces[i] = { ...p, spin: p.spin ?? new THREE.Vector3(7, 5, 0) };
    this.c.set(color);
    this.mesh.setColorAt(i, this.c);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  /** Sparks thrown out along `out` (and scattered), streaking. */
  sparks(at: THREE.Vector3, out: THREE.Vector3, color: string, n: number, speed: number) {
    for (let k = 0; k < n; k++) {
      const v = out.clone().multiplyScalar(1.2 + Math.random()).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(2.2)).multiplyScalar(speed);
      this.add({ kind: "spark", t: 0, life: 0.28 + Math.random() * 0.22, pos: at.clone(), vel: v, from: at.clone(), size: 0.022 + Math.random() * 0.016, delay: 0 }, color);
    }
  }
  /** Embers drifting up out of a fire (slow, floating, streaking a little). */
  embers(at: THREE.Vector3, n: number) {
    for (let k = 0; k < n; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5);
      this.add({ kind: "spark", t: 0, life: 0.7 + Math.random() * 0.5, pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25)), vel: v, from: at.clone(), size: 0.018 + Math.random() * 0.012, delay: Math.random() * 0.15 }, Math.random() < 0.5 ? "#ff9a3d" : "#ffd27a");
    }
  }
  /** A node's shards, thrown wide as it shatters. */
  shards(at: THREE.Vector3, r: number, color: string, n: number) {
    for (let k = 0; k < n; k++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize();
      this.add({ kind: "shard", t: 0, life: 0.9 + Math.random() * 0.5, pos: at.clone().addScaledVector(d, r * 0.6), vel: d.multiplyScalar(2.5 + Math.random() * 3), from: at.clone(), size: 0.05 + Math.random() * 0.07 * (r / 0.5), delay: 0 }, k % 3 === 0 ? color : "#6d6878");
    }
  }
  /** Chips of rock knocked off by a blow: out along `out`, up, tumbling, bouncing where they fall. */
  chips(at: THREE.Vector3, out: THREE.Vector3, color: string, n: number) {
    for (let k = 0; k < n; k++) {
      const v = out.clone().multiplyScalar(1.3 + Math.random() * 1.4).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.1 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6));
      const spin = new THREE.Vector3((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24);
      this.add({ kind: "chip", t: 0, life: 0.9 + Math.random() * 0.5, pos: at.clone(), vel: v, from: at.clone(), size: 0.018 + Math.random() * 0.026, delay: 0, spin }, color);
    }
  }
  /** A piece of the haul, arcing up and over into you. */
  loot(at: THREE.Vector3, color: string, delay: number) {
    this.add({ kind: "loot", t: 0, life: 0.85, pos: at.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6), from: at.clone(), size: 0.07, delay }, color);
  }
  step(dt: number, focus: { x: number; y: number; z: number }) {
    const to = new THREE.Vector3(focus.x, focus.y + 0.85, focus.z);
    let dirty = false;
    this.pieces.forEach((p, i) => {
      if (!p) return;
      dirty = true;
      if (p.delay > 0) {
        p.delay -= dt;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        return;
      }
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this.pieces[i] = null;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        return;
      }
      if (p.kind === "loot") {
        // a magnet's arc: up and over, pulled in to you (never loose on the floor)
        const e = k * k * (3 - 2 * k);
        p.pos.lerpVectors(p.from, to, e).addScaledVector(p.vel, Math.sin(k * Math.PI) * 0.5);
        p.pos.y += Math.sin(k * Math.PI) * 1.3;
        const size = p.size * (1 - 0.6 * k * k);
        this.e.set(p.t * 7 + i, p.t * 5, 0);
        this.q.setFromEuler(this.e);
        this.m.compose(p.pos, this.q, this.s.setScalar(size));
        this.mesh.setMatrixAt(i, this.m);
        return;
      }
      // (sparks float a little, chips and shards fall hard)
      p.vel.y -= (p.kind === "spark" ? 5 : 9.8) * dt;
      if (p.kind === "spark") p.vel.multiplyScalar(1 - 1.5 * dt);
      p.pos.addScaledVector(p.vel, dt);
      // the floor where it falls: a bounce, losing most of its way
      const floor = cavernsFloorY(p.pos.x, p.pos.z) + 0.015;
      if (p.pos.y < floor) {
        p.pos.y = floor;
        if (p.vel.y < 0) p.vel.y = -p.vel.y * (p.kind === "spark" ? 0.25 : 0.35);
        p.vel.x *= 0.55;
        p.vel.z *= 0.55;
        p.spin.multiplyScalar(0.6);
      }
      if (p.kind === "spark") {
        // a streak along its flight, shortening as it cools
        const speed = p.vel.length();
        this.q.setFromUnitVectors(UP, speed > 1e-3 ? this.dir.copy(p.vel).divideScalar(speed) : UP);
        const fade = 1 - k;
        // (thin: seen end on, flying at you, a streak is only a speck)
        this.s.set(p.size * 0.26 * fade, p.size * (1.2 + Math.min(5, speed * 1.1)) * fade, p.size * 0.26 * fade);
      } else {
        this.e.set(p.t * p.spin.x + i, p.t * p.spin.y, p.t * p.spin.z);
        this.q.setFromEuler(this.e);
        this.s.setScalar(p.size * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1));
      }
      this.m.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

interface Puff {
  t: number;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  s0: number;
  s1: number;
  a: number;
}

/** Dust and steam: soft round puffs that swell and fade. */
export class PuffPool {
  points: THREE.Points;
  private puffs: (Puff | null)[];
  private pos: THREE.BufferAttribute;
  private size: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private mat: THREE.ShaderMaterial;
  private c = new THREE.Color();
  constructor(n: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3).fill(-100), 3);
    this.size = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute("position", this.pos);
    geo.setAttribute("aSize", this.size);
    geo.setAttribute("aCol", this.col);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uZoom: { value: 60 }, uPx: { value: Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: `
        attribute float aSize;
        attribute vec4 aCol;
        uniform float uZoom;
        uniform float uPx;
        varying vec4 vCol;
        void main() {
          vCol = aCol;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uZoom * uPx;
        }`,
      fragmentShader: `
        varying vec4 vCol;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.35, 1.0, r)) * vCol.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol.rgb, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.raycast = noRaycast;
    this.points.renderOrder = 4;
    this.puffs = Array.from({ length: n }, () => null);
  }
  /** `n` puffs at `at`, drifting out along `out` (and up), `size` metres at their fullest. */
  burst(at: THREE.Vector3, out: THREE.Vector3, color: string, n: number, size: number, life: number, alpha = 0.5) {
    for (let k = 0; k < n; k++) {
      const i = this.puffs.findIndex((x) => x === null);
      if (i < 0) return;
      const v = out.clone().multiplyScalar(0.35 + Math.random() * 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.35, (Math.random() - 0.5) * 0.5));
      this.puffs[i] = { t: 0, life: life * (0.7 + Math.random() * 0.6), pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08)), vel: v, s0: size * 0.3, s1: size * (0.7 + Math.random() * 0.5), a: alpha };
      this.c.set(color);
      this.col.setXYZW(i, this.c.r, this.c.g, this.c.b, 0);
    }
  }
  step(dt: number, zoom: number) {
    this.mat.uniforms.uZoom.value = zoom;
    let dirty = false;
    this.puffs.forEach((p, i) => {
      if (!p) return;
      dirty = true;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this.puffs[i] = null;
        this.pos.setXYZ(i, 0, -100, 0);
        this.col.setW(i, 0);
        return;
      }
      p.vel.multiplyScalar(1 - 1.8 * dt);
      p.pos.addScaledVector(p.vel, dt);
      this.pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      this.size.setX(i, p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k)));
      this.col.setW(i, p.a * Math.min(1, k * 6) * (1 - k) * (1 - k));
    });
    if (dirty) {
      this.pos.needsUpdate = true;
      this.size.needsUpdate = true;
      this.col.needsUpdate = true;
    }
  }
  dispose() {
    this.mat.dispose();
    this.points.geometry.dispose();
  }
}

let pools: { fx: FxPool; puffs: PuffPool } | null = null;
/** The cave's pools (made on first use; CaveFxLayer draws and steps them, and lets them go). */
export function caveFx(): { fx: FxPool; puffs: PuffPool } {
  if (!pools) pools = { fx: new FxPool(240), puffs: new PuffPool(96) };
  return pools;
}
export function releaseCaveFx() {
  if (!pools) return;
  pools.fx.dispose();
  pools.puffs.dispose();
  pools = null;
}
