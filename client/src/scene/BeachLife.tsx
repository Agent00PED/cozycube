import { Suspense, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { daylight } from "@shared/daynight";
import { BEACH_LAYOUT as L, PIER, at, beachBlocked, beachLand } from "@shared/worlds/beach";
import { ModelBoundary } from "../entities/ModelBoundary";
import { modelUrl } from "../assetVersion";
import { cameraFocus } from "./cameraFocus";
import { instanced, template } from "./faunaKit";

// Sunset Beach's little lives, client-side and synced to no one (beach_life.glb, built by
// scripts/blender/build_beach.py `build_life_looks`), one instanced draw a part:
//
//   the gulls   three, wheeling slowly over the shore by day (a few wingbeats, a long glide), gone to
//               roost by night
//   the crabs   seven on the wet sand along the waterline: each keeps a stretch of its own, scuttles
//               sideways a little way and stops, and hurries off up the sand from anyone who comes close

export const BEACH_LIFE_URL = modelUrl("beach_life.glb");

const GULLS = 3;
const CRABS = 7;
/** How near you come before a crab runs, and how fast it goes (m/s: ambling, fleeing). */
const CRAB_SHY = 2.2;
const CRAB_PACE = 0.45;
const CRAB_FLEE = 2.4;

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

function Life() {
  const { scene } = useGLTF(BEACH_LIFE_URL);
  const gulls = useMemo(() => ["Body", "WingL", "WingR"].map((n) => instanced(template(scene, `Fauna_Gull_${n}`), GULLS, ["#ffffff"])), [scene]);
  const crabs = useMemo(() => instanced(template(scene, "Fauna_SandCrab"), CRABS, ["#ffffff", "#ffe2d2", "#f6c9b0"]), [scene]);
  useEffect(
    () => () => {
      for (const p of gulls) p?.mesh.dispose();
      crabs?.mesh.dispose();
    },
    [gulls, crabs]
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
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1), rot: new THREE.Matrix4(), bank: new THREE.Quaternion() }), []);

  useFrame(({ clock }, rawDt) => {
    const t = clock.elapsedTime;
    const dt = Math.min(rawDt, 0.1);
    const { m, w, q, pos, scl, up, fwd, rot, bank } = tmp;
    // --- the gulls: by day
    const day = daylight(Date.now()) > 0.35;
    for (const p of gulls) if (p) p.mesh.visible = day;
    if (day) {
      rings.forEach((g, i) => {
        const a = g.ph + t * g.w;
        const heading = a + (g.w > 0 ? Math.PI / 2 : -Math.PI / 2);
        q.setFromAxisAngle(up, Math.PI / 2 - heading);
        // (banked into the turn)
        bank.setFromAxisAngle(fwd, g.w > 0 ? -0.28 : 0.28);
        q.multiply(bank);
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
    if (!crabs) return;
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
  });
  return (
    <>
      {gulls.map((p, i) => (p ? <primitive key={i} object={p.mesh} /> : null))}
      {crabs && <primitive object={crabs.mesh} />}
    </>
  );
}
