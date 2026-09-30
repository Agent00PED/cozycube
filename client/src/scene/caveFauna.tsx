import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CAVE_LAKE, CAVE_WATER_Y, DOLINE_BEAMS, cavernsFloorY, cavernsWalkable, lakeFactor } from "@shared/worlds/caverns";
import { noRaycast } from "./kit";
import { DAY_CYCLE_MS, dayPhase } from "@shared/daynight";
import { EXODUS_S } from "@shared/caverns_codex";

// The Glimmering Caverns' little lives, client-only and instanced from caverns.glb's templates (one
// draw call a kind, like the woods' songbirds):
//
//   the crabs     glowing cave crabs on the cenote's beach, each on its own stretch of shore just
//                 above the waterline: a skitter sideways, a pause, back the other way
//   the swifts    swiftlets circling in the doline's sunbeams, wings beating in bursts between glides
//                 (the flap in the vertex shader, each bird its own phase)
//   the bats      a few looping over the mudflats; and at the camp's dusk the Bat Exodus: a river of
//                 bats pouring out of the mudflats' west wall, up past the jungle and out through the
//                 collapse, over EXODUS_S (the same moment on every client: the wall clock's day)

const CRABS = 9;
const SWIFTS = 10;

/** A crab's stretch of shore: the beach points along it (just above the waterline), its pace. */
interface CrabRun {
  pts: THREE.Vector3[];
  speed: number;
  phase: number;
  pause: number;
}

/** Where the shore is on a ray out of the lake's middle: the first point past the waterline. */
function shoreAt(a: number): THREE.Vector3 | null {
  for (let r = 0.7; r < 1.6; r += 0.01) {
    const x = CAVE_LAKE.x + Math.cos(a) * CAVE_LAKE.rx * r;
    const z = CAVE_LAKE.z + Math.sin(a) * CAVE_LAKE.rz * r;
    if (lakeFactor(x, z) < 1.06) continue;
    const y = cavernsFloorY(x, z);
    if (y < CAVE_WATER_Y + 0.02) continue;
    return new THREE.Vector3(x, y, z);
  }
  return null;
}

function crabRuns(): CrabRun[] {
  const out: CrabRun[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; out.length < CRABS && k < 80; k++) {
    const a0 = rnd() * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const p = shoreAt(a0 + (i - 4) * 0.025);
      // (a crab keeps to the open sand: never into a rock or a prop)
      if (!p || !cavernsWalkable(p.x, p.z)) break;
      pts.push(p);
    }
    if (pts.length < 6) continue;
    if (out.some((o) => o.pts[0].distanceTo(pts[0]) < 3)) continue;
    out.push({ pts, speed: 0.35 + rnd() * 0.35, phase: rnd() * 10, pause: 1.2 + rnd() * 2.5 });
  }
  return out;
}

/** Where along its run a crab is at time t (0..1): a skitter, a pause, a skitter back. */
function crabAlong(run: CrabRun, t: number): { u: number; moving: boolean } {
  const len = run.pts.length - 1;
  const go = len * 0.18 / run.speed;
  const cycle = 2 * (go + run.pause);
  const k = (t + run.phase) % cycle;
  if (k < go) return { u: k / go, moving: true };
  if (k < go + run.pause) return { u: 1, moving: false };
  if (k < 2 * go + run.pause) return { u: 1 - (k - go - run.pause) / go, moving: true };
  return { u: 0, moving: false };
}

/** The mudflats' bats: out from their roost on the west wall, fluttering in loose loops over the mud
 *  (each its own loop, its own beat). */
const BATS = 6;
/** The Bat Exodus: how many pour out, and each one's flight (s) from the wall out through the roof. */
const EXODUS_BATS = 56;
const EXODUS_FLIGHT_S = 9;
/** Their way out: off the mudflats' west wall, north under the jungle's cliff, up through the collapse. */
const EXODUS_PATH = [new THREE.Vector3(-21.2, 5.6, -5.5), new THREE.Vector3(-19.8, 8.8, -11.5), new THREE.Vector3(-16.8, 11.5, -16.5), new THREE.Vector3(-17.8, 20.5, -22.0)];
/** Seconds into the camp's dusk (the Exodus's clock), or -1 outside it. */
export function exodusClock(now = Date.now()): number {
  const t = ((dayPhase(now) - 0.5) * DAY_CYCLE_MS) / 1000;
  return t >= 0 && t <= EXODUS_S + EXODUS_FLIGHT_S ? t : -1;
}
function bezier(u: number, out: THREE.Vector3) {
  const [a, b, c, d] = EXODUS_PATH;
  const v = 1 - u;
  return out.set(
    v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u * u * u * d.x,
    v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u * u * u * d.y,
    v * v * v * a.z + 3 * v * v * u * b.z + 3 * v * u * u * c.z + u * u * u * d.z
  );
}
const BAT_ROOSTS = [
  [-18.0, -7.0],
  [-19.0, -2.0],
  [-15.0, -9.5],
  [-17.0, -4.0],
  [-20.0, -10.0],
  [-14.5, -3.0],
] as const;
function batAt(i: number, t: number, out: THREE.Vector3) {
  const [cx, cz] = BAT_ROOSTS[i % BAT_ROOSTS.length];
  const w = 0.9 + ((i * 0.37) % 1) * 0.6;
  const a = t * w + i * 1.9;
  const r = 1.4 + ((i * 0.53) % 1) * 1.2;
  return out.set(cx + Math.cos(a) * r + 0.4 * Math.sin(a * 3.1), cavernsFloorY(cx, cz) + 2.4 + 0.8 * Math.sin(a * 2.0 + i) + ((i * 0.29) % 1) * 1.2, cz + Math.sin(a * 2.0) * r * 0.6);
}

export function CaveFauna({ crab, swift, bat }: { crab: THREE.Mesh | null; swift: THREE.Mesh | null; bat: THREE.Mesh | null }) {
  const runs = useMemo(crabRuns, []);
  const crabs = useMemo(() => {
    if (!crab || !runs.length) return null;
    const im = new THREE.InstancedMesh(crab.geometry, crab.material as THREE.Material, runs.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, [crab, runs]);
  // the swifts' wings beat in the vertex shader: the farther out along the wing, the higher it swings
  const swifts = useMemo(() => {
    if (!swift) return null;
    const mat = (swift.material as THREE.MeshStandardMaterial).clone();
    const time = { value: 0 };
    mat.side = THREE.DoubleSide;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;\nattribute float aPhase;").replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float reach = smoothstep(0.02, 0.24, abs(transformed.x));
          float burst = 0.5 + 0.5 * sin(uTime * 0.8 + aPhase * 0.37);
          float beat = sin(uTime * 17.0 + aPhase) * smoothstep(0.35, 0.6, burst);
          transformed.y += reach * abs(transformed.x) * (beat * 0.9 + 0.12);
        }`
      );
    };
    mat.customProgramCacheKey = () => "cave-swift";
    const geo = swift.geometry.clone();
    const phase = new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: SWIFTS }, (_, i) => i * 2.39)), 1);
    geo.setAttribute("aPhase", phase);
    const im = new THREE.InstancedMesh(geo, mat, SWIFTS);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return { im, time };
  }, [swift]);
  // the bats' wings beat faster than the swifts', never gliding
  const bats = useMemo(() => {
    if (!bat) return null;
    const mat = (bat.material as THREE.MeshStandardMaterial).clone();
    const time = { value: 0 };
    mat.side = THREE.DoubleSide;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;\nattribute float aPhase;").replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float reach = smoothstep(0.02, 0.2, abs(transformed.x));
          float beat = sin(uTime * 24.0 + aPhase);
          transformed.y += reach * abs(transformed.x) * (beat * 1.1);
        }`
      );
    };
    mat.customProgramCacheKey = () => "cave-bat";
    const geo = bat.geometry.clone();
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: BATS + EXODUS_BATS }, (_, i) => i * 1.13)), 1));
    const im = new THREE.InstancedMesh(geo, mat, BATS + EXODUS_BATS);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return { im, time };
  }, [bat]);
  const flights = useMemo(
    () =>
      Array.from({ length: SWIFTS }, (_, i) => {
        const [bx, bz, br] = DOLINE_BEAMS[i % DOLINE_BEAMS.length];
        return { bx, bz, r: br + 0.6 + ((i * 0.37) % 1) * 1.6, h: cavernsFloorY(bx, bz) + 3.2 + ((i * 0.61) % 1) * 2.6, w: (0.55 + ((i * 0.23) % 1) * 0.5) * (i % 3 === 0 ? -1 : 1), p: i * 1.7 };
      }),
    []
  );
  useEffect(
    () => () => {
      crabs?.dispose();
      if (swifts) {
        swifts.im.geometry.dispose();
        (swifts.im.material as THREE.Material).dispose();
        swifts.im.dispose();
      }
      if (bats) {
        bats.im.geometry.dispose();
        (bats.im.material as THREE.Material).dispose();
        bats.im.dispose();
      }
    },
    [crabs, swifts, bats]
  );
  const here = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (crabs) {
      runs.forEach((run, i) => {
        const { u, moving } = crabAlong(run, t);
        const f = u * (run.pts.length - 1);
        const i0 = Math.min(run.pts.length - 2, Math.floor(f));
        const a = run.pts[i0];
        const b = run.pts[i0 + 1];
        const s = f - i0;
        dummy.position.set(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s + (moving ? 0.008 * Math.abs(Math.sin(t * 30 + i)) : 0), a.z + (b.z - a.z) * s);
        // (a crab walks sideways: its face turned across the way it goes)
        dummy.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2 + (moving ? 0 : 0.15 * Math.sin(t * 0.7 + i)), 0);
        dummy.scale.setScalar(1.3);
        dummy.updateMatrix();
        crabs.setMatrixAt(i, dummy.matrix);
      });
      crabs.instanceMatrix.needsUpdate = true;
    }
    if (swifts) {
      swifts.time.value = t;
      flights.forEach((fl, i) => {
        const a = t * fl.w + fl.p;
        const r = fl.r * (1 + 0.18 * Math.sin(t * 0.3 + fl.p));
        dummy.position.set(fl.bx + Math.cos(a) * r, fl.h + 0.5 * Math.sin(t * 0.5 + fl.p), fl.bz + Math.sin(a) * r);
        // (heading along the circle, banked into the turn)
        const dir = Math.sign(fl.w);
        dummy.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), -0.45 * dir, "YXZ");
        dummy.scale.setScalar(1.2);
        dummy.updateMatrix();
        swifts.im.setMatrixAt(i, dummy.matrix);
      });
      swifts.im.instanceMatrix.needsUpdate = true;
    }
    if (bats) {
      bats.time.value = t;
      for (let i = 0; i < BATS; i++) {
        batAt(i, t, here);
        batAt(i, t + 0.05, ahead);
        dummy.position.copy(here);
        dummy.rotation.set(0.25 * Math.sin(t * 3 + i), Math.atan2(ahead.x - here.x, ahead.z - here.z), 0.35 * Math.sin(t * 2.3 + i), "YXZ");
        dummy.scale.setScalar(1.25);
        dummy.updateMatrix();
        bats.im.setMatrixAt(i, dummy.matrix);
      }
      // the Bat Exodus: each bat off the wall in its turn, along the way out, a wobble of its own
      const ex = exodusClock();
      for (let j = 0; j < EXODUS_BATS; j++) {
        const i = BATS + j;
        const start = (j / EXODUS_BATS) * (EXODUS_S - 4) + ((j * 0.61) % 1) * 1.5;
        const u = ex < 0 ? -1 : (ex - start) / EXODUS_FLIGHT_S;
        if (u < 0 || u > 1) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          bats.im.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const side = ((j * 0.37) % 1) - 0.5;
        const lift = ((j * 0.71) % 1) - 0.5;
        bezier(u, here);
        bezier(Math.min(1, u + 0.02), ahead);
        here.x += side * 2.2 + 0.35 * Math.sin(t * 3 + j);
        here.y += lift * 1.4 + 0.25 * Math.sin(t * 4.1 + j * 1.3);
        here.z += side * 1.2;
        ahead.x += side * 2.2;
        ahead.z += side * 1.2;
        dummy.position.copy(here);
        dummy.rotation.set(-0.35, Math.atan2(ahead.x - here.x, ahead.z - here.z), 0.3 * Math.sin(t * 2.7 + j), "YXZ");
        dummy.scale.setScalar(1.5 * Math.min(1, u * 8, (1 - u) * 5));
        dummy.updateMatrix();
        bats.im.setMatrixAt(i, dummy.matrix);
      }
      bats.im.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      {crabs && <primitive object={crabs} />}
      {swifts && <primitive object={swifts.im} />}
      {bats && <primitive object={bats.im} />}
    </>
  );
}
