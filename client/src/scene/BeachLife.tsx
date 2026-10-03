import { Suspense, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { daylight } from "@shared/daynight";
import { BEACH_LAYOUT as L, PIER, SEA_Y, SHRUBS, at, beachBlocked, beachLand } from "@shared/worlds/beach";
import { ModelBoundary } from "../entities/ModelBoundary";
import { modelUrl } from "../assetVersion";
import { cameraFocus } from "./cameraFocus";
import { Butterflies } from "./Butterflies";
import { instanced, template } from "./faunaKit";

// Sunset Beach's little lives, client-side and synced to no one (beach_life.glb, built by
// scripts/blender/build_beach.py `build_life_looks`), one instanced draw a part:
//
//   the gulls        three, wheeling slowly over the shore by day (a few wingbeats, a long glide)
//   the crabs        seven on the wet sand: each keeps a stretch of its own, scuttles sideways a little
//                    way and stops, and hurries off up the sand from anyone who comes close
//   the sandpipers   four in a little flock at the water's edge by day: a quick run, a stop, a peck;
//                    they flutter off down the shore from anyone who comes near
//   the turtle       one, swimming a slow round in the shallows off the east beach
//   a leaping fish   now and then, out past the shallows
//   the dolphins     a pod of three passing far out now and then, porpoising
//   butterflies      over the flowering shrubs, by day

export const BEACH_LIFE_URL = modelUrl("beach_life.glb");

const GULLS = 3;
const CRABS = 7;
const PIPERS = 4;
const LEAPERS = 2;
const POD = 3;
/** How near you come before a crab runs, and how fast it goes (m/s: ambling, fleeing). */
const CRAB_SHY = 2.2;
const CRAB_PACE = 0.45;
const CRAB_FLEE = 2.4;
const PIPER_SHY = 2.8;
/** A pod's pass along the coast (s), and how far out it goes by. */
const POD_PASS_S = 16;
const POD_OUT = 14;

export function BeachLife() {
  return (
    <ModelBoundary what="beach_life.glb" fallback={null}>
      <Suspense fallback={null}>
        <Life />
      </Suspense>
    </ModelBoundary>
  );
}

interface Crab {
  x: number;
  z: number;
  /** Its own stretch of shore (metres along the coast) and where it is heading. */
  home: number;
  tx: number;
  tz: number;
  rest: number;
  yaw: number;
}
interface Piper {
  x: number;
  z: number;
  tx: number;
  tz: number;
  rest: number;
  yaw: number;
  /** A flutter off the sand (s left of it). */
  hop: number;
}

/** The flowering shrubs the butterflies keep to (every third shrub is a hibiscus: build_beach.py). */
const FLOWER_SPOTS = SHRUBS.filter((_, i) => i % 3 === 0).map((p): [number, number] => [p.x, p.z]);

function Life() {
  const { scene } = useGLTF(BEACH_LIFE_URL);
  const gulls = useMemo(() => ["Body", "WingL", "WingR"].map((n) => instanced(template(scene, `Fauna_Gull_${n}`), GULLS, ["#ffffff"])), [scene]);
  const crabs = useMemo(() => instanced(template(scene, "Fauna_SandCrab"), CRABS, ["#ffffff", "#ffe2d2", "#f6c9b0"]), [scene]);
  const pipers = useMemo(() => instanced(template(scene, "Fauna_Sandpiper"), PIPERS, ["#ffffff", "#f3e9dc"]), [scene]);
  const turtle = useMemo(() => instanced(template(scene, "Fauna_SeaTurtle"), 1, ["#ffffff"]), [scene]);
  const leapers = useMemo(() => instanced(template(scene, "Fauna_LeapFish"), LEAPERS, ["#ffffff", "#ffe9c2"]), [scene]);
  const pod = useMemo(() => instanced(template(scene, "Fauna_Dolphin"), POD, ["#ffffff"]), [scene]);
  const all = useMemo(() => [...gulls, crabs, pipers, turtle, leapers, pod], [gulls, crabs, pipers, turtle, leapers, pod]);
  useEffect(
    () => () => {
      for (const p of all) p?.mesh.dispose();
    },
    [all]
  );
  // each gull's own circle over the shore
  const rings = useMemo(
    () =>
      Array.from({ length: GULLS }, (_, i) => {
        const c = at(-1.5 + i * 2.2, -9 + i * 9);
        return { x: c.x, z: c.z, r: 5.5 + i * 1.6, y: 7.2 + i * 0.9, w: (i % 2 ? -1 : 1) * (0.2 + i * 0.035), ph: i * 2.1 };
      }),
    []
  );
  // the crabs' stretches of wet sand (clear of the pier's piles)
  const herd = useMemo((): Crab[] => {
    const out: Crab[] = [];
    const span = L.half * 2 - 10;
    for (let i = 0; i < CRABS; i++) {
      let home = -span / 2 + (span * (i + 0.5)) / CRABS;
      if (Math.abs(home - PIER.v) < 2.2) home += home < PIER.v ? -2.4 : 2.4;
      const p = at(0.7 + (i % 3) * 0.35, home);
      out.push({ x: p.x, z: p.z, home, tx: p.x, tz: p.z, rest: 1 + i * 0.7, yaw: i });
    }
    return out;
  }, []);
  // the sandpipers' flock: where along the coast it is, and each bird round it
  const flock = useMemo(() => ({ v: 8, birds: Array.from({ length: PIPERS }, (_, i): Piper => ({ ...at(0.9, 8 + i * 0.5), tx: 0, tz: 0, rest: 0.3 * i, yaw: 0, hop: 0 })) }), []);
  const leaps = useMemo(() => Array.from({ length: LEAPERS }, (_, i) => ({ at: -9, next: 6 + i * 9, x: 0, z: 0, yaw: 0 })), []);
  const pass = useMemo(() => ({ at: -99, next: 25, dir: 1 }), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0), rot: new THREE.Matrix4() }), []);

  useFrame(({ clock }, rawDt) => {
    const t = clock.elapsedTime;
    const dt = Math.min(rawDt, 0.1);
    const { m, w, q, q2, pos, scl, up, fwd, side, rot } = tmp;
    const day = daylight(Date.now()) > 0.35;
    // --- the gulls: by day
    for (const p of gulls) if (p) p.mesh.visible = day;
    if (day) {
      rings.forEach((g, i) => {
        const a = g.ph + t * g.w;
        const heading = a + (g.w > 0 ? Math.PI / 2 : -Math.PI / 2);
        q.setFromAxisAngle(up, Math.PI / 2 - heading);
        // (banked into the turn)
        q2.setFromAxisAngle(fwd, g.w > 0 ? -0.28 : 0.28);
        q.multiply(q2);
        m.compose(pos.set(g.x + Math.cos(a) * g.r, g.y + 0.35 * Math.sin(t * 0.5 + i * 2), g.z + Math.sin(a) * g.r), q, scl.setScalar(1.9));
        // a few beats, then a long glide on set wings
        const beat = (t * 0.16 + i * 0.37) % 1;
        const flap = beat < 0.3 ? 0.1 + Math.sin(beat * 42) * 0.55 : 0.12 + 0.04 * Math.sin(t * 1.3 + i);
        gulls[0]?.mesh.setMatrixAt(i, w.copy(m).multiply(gulls[0].t.matrix));
        if (gulls[1]) gulls[1].mesh.setMatrixAt(i, w.copy(m).multiply(gulls[1].t.matrix).multiply(rot.makeRotationAxis(fwd, flap)));
        if (gulls[2]) gulls[2].mesh.setMatrixAt(i, w.copy(m).multiply(gulls[2].t.matrix).multiply(rot.makeRotationAxis(fwd, -flap)));
      });
      for (const p of gulls) if (p) p.mesh.instanceMatrix.needsUpdate = true;
    }
    // --- the crabs
    if (crabs) {
      herd.forEach((c, i) => {
        const near = cameraFocus.hasTarget ? Math.hypot(cameraFocus.x - c.x, cameraFocus.z - c.z) : 99;
        let speed = CRAB_PACE;
        if (near < CRAB_SHY) {
          // off, straight away from whoever it is (never into the sea or through what stands)
          const dx = (c.x - cameraFocus.x) / (near || 1);
          const dz = (c.z - cameraFocus.z) / (near || 1);
          c.tx = c.x + dx * 2.5;
          c.tz = c.z + dz * 2.5;
          c.rest = 0;
          speed = CRAB_FLEE;
        } else if (c.rest > 0) {
          c.rest -= dt;
          if (c.rest <= 0) {
            // a little way along its own stretch, somewhere in the wet band
            const p = at(0.5 + Math.random() * 1.4, c.home + (Math.random() - 0.5) * 3.2);
            c.tx = p.x;
            c.tz = p.z;
          }
        }
        const dx = c.tx - c.x;
        const dz = c.tz - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05 && c.rest <= 0) {
          const step = Math.min(d, speed * dt);
          const nx = c.x + (dx / d) * step;
          const nz = c.z + (dz / d) * step;
          if (beachBlocked(nx, nz)) c.rest = 0.6 + Math.random();
          else {
            c.x = nx;
            c.z = nz;
            // (sideways on: its shell turned a quarter from the way it goes)
            c.yaw = Math.atan2(dx, dz) + Math.PI / 2;
          }
        } else if (c.rest <= 0) c.rest = 1.5 + Math.random() * 4;
        const moving = d > 0.05 && c.rest <= 0;
        q.setFromAxisAngle(up, c.yaw);
        m.compose(pos.set(c.x, beachLand(c.x, c.z) + (moving ? 0.012 * Math.abs(Math.sin(t * 22 + i)) : 0), c.z), q, scl.setScalar(1.25));
        crabs.mesh.setMatrixAt(i, w.copy(m).multiply(crabs.t.matrix));
      });
      crabs.mesh.instanceMatrix.needsUpdate = true;
    }
    // --- the sandpipers: by day, a flock that works its way along the water's edge
    if (pipers) {
      pipers.mesh.visible = day;
      if (day) {
        const centre = at(0.9, flock.v);
        const near = cameraFocus.hasTarget ? Math.hypot(cameraFocus.x - centre.x, cameraFocus.z - centre.z) : 99;
        if (near < PIPER_SHY) {
          // up and away down the shore, to the far side of whoever came (never under the pier)
          let v = flock.v + (flock.v > 2 ? -1 : 1) * (7 + Math.random() * 4);
          if (v < -3) v = 14 - Math.random() * 3;
          if (v > 15) v = 1 + Math.random() * 3;
          flock.v = v;
          for (const b of flock.birds) {
            b.hop = 1.1;
            b.rest = 0;
            const p = at(0.6 + Math.random() * 0.9, flock.v + (Math.random() - 0.5) * 2.2);
            b.tx = p.x;
            b.tz = p.z;
          }
        }
        flock.birds.forEach((b, i) => {
          if (b.rest > 0) {
            b.rest -= dt;
            if (b.rest <= 0) {
              const p = at(0.45 + Math.random() * 1.0, flock.v + (Math.random() - 0.5) * 2.6);
              b.tx = p.x;
              b.tz = p.z;
            }
          }
          const dx = b.tx - b.x;
          const dz = b.tz - b.z;
          const d = Math.hypot(dx, dz);
          const flying = b.hop > 0;
          if (flying) b.hop = Math.max(0, b.hop - dt);
          if (d > 0.04 && b.rest <= 0) {
            const step = Math.min(d, (flying ? 6.5 : 1.7) * dt);
            b.x += (dx / d) * step;
            b.z += (dz / d) * step;
            b.yaw = Math.atan2(dx, dz);
          } else if (b.rest <= 0) b.rest = 0.5 + Math.random() * 2.2;
          const still = b.rest > 0;
          // a peck as it stands, a quick patter as it runs, an arc as it flutters off
          q.setFromAxisAngle(up, b.yaw);
          if (still) q.multiply(q2.setFromAxisAngle(side, 0.5 * Math.max(0, Math.sin(t * 5 + i * 1.9)) ** 4));
          const lift = flying ? 0.55 * Math.sin((Math.PI * b.hop) / 1.1) : still ? 0 : 0.012 * Math.abs(Math.sin(t * 30 + i));
          m.compose(pos.set(b.x, beachLand(b.x, b.z) + lift, b.z), q, scl.setScalar(1.5));
          pipers.mesh.setMatrixAt(i, w.copy(m).multiply(pipers.t.matrix));
        });
        pipers.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    // --- the turtle: a slow round in the shallows off the east beach, its shell breaking the surface
    if (turtle) {
      const a = t * 0.07;
      const c = at(-3.6 - 1.2 * Math.sin(a), 9 + 6.5 * Math.cos(a));
      const ahead = at(-3.6 - 1.2 * Math.sin(a + 0.05), 9 + 6.5 * Math.cos(a + 0.05));
      q.setFromAxisAngle(up, Math.atan2(ahead.x - c.x, ahead.z - c.z));
      q.multiply(q2.setFromAxisAngle(fwd, 0.1 * Math.sin(t * 1.4)));
      m.compose(pos.set(c.x, SEA_Y - 0.03 + 0.03 * Math.sin(t * 0.9), c.z), q, scl.setScalar(1.15));
      turtle.mesh.setMatrixAt(0, w.copy(m).multiply(turtle.t.matrix));
      turtle.mesh.instanceMatrix.needsUpdate = true;
    }
    // --- a fish leaps: an arc out of the water and back, nose first
    if (leapers) {
      leaps.forEach((f, i) => {
        if (t > f.next) {
          const p = at(-(3.5 + Math.random() * 7), -15 + Math.random() * 30);
          Object.assign(f, { at: t, next: t + 9 + Math.random() * 16, x: p.x, z: p.z, yaw: Math.random() * 6.283 });
        }
        const u = (t - f.at) / 0.85;
        if (u < 0 || u > 1) {
          m.makeScale(0, 0, 0);
          leapers.mesh.setMatrixAt(i, m);
          return;
        }
        const along = (u - 0.5) * 1.1;
        q.setFromAxisAngle(up, f.yaw);
        // (pitched up as it leaves the water, down as it falls back)
        q.multiply(q2.setFromAxisAngle(side, -1.1 * Math.cos(Math.PI * u)));
        m.compose(pos.set(f.x + Math.sin(f.yaw) * along, SEA_Y - 0.1 + 0.75 * Math.sin(Math.PI * u), f.z + Math.cos(f.yaw) * along), q, scl.setScalar(1.3));
        leapers.mesh.setMatrixAt(i, w.copy(m).multiply(leapers.t.matrix));
      });
      leapers.mesh.instanceMatrix.needsUpdate = true;
    }
    // --- the dolphins: a pod passing far out, each rising and falling in its own beat
    if (pod) {
      if (t > pass.next) Object.assign(pass, { at: t, next: t + 70 + Math.random() * 80, dir: Math.random() < 0.5 ? 1 : -1 });
      const u = (t - pass.at) / POD_PASS_S;
      const on = u > 0 && u < 1;
      pod.mesh.visible = on;
      if (on) {
        for (let i = 0; i < POD; i++) {
          const v = pass.dir * ((u * 2 - 1) * 24 - i * 2.4);
          const c = at(-(POD_OUT + i * 1.3), v);
          const ahead = at(-(POD_OUT + i * 1.3), v + pass.dir * 0.2);
          const ph = t * 2.1 + i * 1.4;
          q.setFromAxisAngle(up, Math.atan2(ahead.x - c.x, ahead.z - c.z));
          q.multiply(q2.setFromAxisAngle(side, -0.75 * Math.cos(ph)));
          m.compose(pos.set(c.x, SEA_Y - 0.55 + 0.95 * Math.sin(ph), c.z), q, scl.setScalar(1));
          pod.mesh.setMatrixAt(i, w.copy(m).multiply(pod.t.matrix));
        }
        pod.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  });
  return (
    <>
      {all.map((p, i) => (p ? <primitive key={i} object={p.mesh} /> : null))}
      <Butterflies scene={scene} spots={FLOWER_SPOTS} landY={beachLand} prefix="Fauna_BeachFly" />
    </>
  );
}
