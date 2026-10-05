import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CREEK, MANGROVES, SEA_Y, at, beachBlocked, beachLand, creekInside } from "@shared/worlds/beach";
import { beachDay } from "./beachDay";
import { cameraFocus } from "./cameraFocus";
import { instanced, template } from "./faunaKit";

// The strand's own small lives on Sunset Beach, client-side and synced to no one (beach_life.glb's
// templates, one instanced draw a kind):
//
//   the egrets        two, wading the tidal creek by day: a slow stalk from one stretch to another, a
//                     long stand; they lift off and glide to the far end from anyone who comes close
//   the fiddler crabs six on the creek's mud banks: each waves at its burrow, and is down it the
//                     moment you come near (out again once you have gone)
//   the hermit crabs  six on the dry sand of the backshore: a slow walk, a long rest; each pulls
//                     into its shell while you stand over it

const EGRETS = 2;
const FIDDLERS = 6;
const HERMITS = 6;
const EGRET_SHY = 3.2;
const FIDDLER_SHY = 2.4;
const HERMIT_SHY = 1.5;

type Pt = { x: number; z: number };
/** Where an egret stands: along the creek's course, in its shallows. */
const WADES: Pt[] = [...CREEK.points.slice(1), { x: CREEK.pool.x + 0.9, z: CREEK.pool.z - 0.6 }, { x: CREEK.pool.x - 1.0, z: CREEK.pool.z + 0.7 }];
/** A fiddler's burrow: on the mud just above the creek's water, round the mangroves. */
const BURROWS: Pt[] = (() => {
  const out: Pt[] = [];
  for (let i = 0; out.length < FIDDLERS && i < 400; i++) {
    const m = MANGROVES[i % MANGROVES.length];
    const a = i * 2.399;
    const r = 0.8 + ((i * 7) % 10) * 0.12;
    const p = { x: m.x + Math.cos(a) * r, z: m.z + Math.sin(a) * r };
    const ck = creekInside(p.x, p.z);
    if (ck < -0.15 && ck > -1.1 && !beachBlocked(p.x, p.z) && out.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 0.7)) out.push(p);
  }
  return out;
})();
/** The hermits' stretches of dry sand. */
const HERMIT_V = [-6.5, -1.5, 2.5, 6.5, 9.5, 13.5];

export function StrandLife({ scene }: { scene: THREE.Object3D }) {
  const egrets = useMemo(() => instanced(template(scene, "Fauna_Egret"), EGRETS, ["#ffffff"]), [scene]);
  const fiddlers = useMemo(() => instanced(template(scene, "Fauna_SandCrab"), FIDDLERS, ["#9fd4ff", "#ffd27a", "#c9b6ff"]), [scene]);
  const hermits = useMemo(() => instanced(template(scene, "Fauna_HermitCrab"), HERMITS, ["#ffffff", "#ffe7cf", "#e8f0ff"]), [scene]);
  const all = useMemo(() => [egrets, fiddlers, hermits], [egrets, fiddlers, hermits]);
  useEffect(
    () => () => {
      for (const p of all) p?.mesh.dispose();
    },
    [all]
  );
  const waders = useMemo(() => Array.from({ length: EGRETS }, (_, i) => ({ ...WADES[(i * 2) % WADES.length], from: WADES[0], to: WADES[(i * 2) % WADES.length], spot: (i * 2) % WADES.length, rest: 4 + i * 5, fly: 0, u: 1, yaw: i * 2 })), []);
  const wavers = useMemo(() => BURROWS.map((b, i) => ({ ...b, out: 1, ph: i * 1.7 })), []);
  const shells = useMemo(
    () =>
      HERMIT_V.map((v, i) => {
        const p = at(6.2 + (i % 3) * 0.9, v);
        return { x: p.x, z: p.z, v, tx: p.x, tz: p.z, rest: 2 + i * 1.3, yaw: i, tuck: 0 };
      }),
    []
  );
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);

  useFrame(({ clock }, rawDt) => {
    const t = clock.elapsedTime;
    const dt = Math.min(rawDt, 0.1);
    const { m, w, q, pos, scl, up } = tmp;
    const you = cameraFocus.hasTarget ? cameraFocus : null;
    const near = (x: number, z: number) => (you ? Math.hypot(you.x - x, you.z - z) : 99);
    // --- the egrets
    if (egrets) {
      const day = beachDay.light > 0.3;
      egrets.mesh.visible = day;
      if (day) {
        waders.forEach((e, i) => {
          if (e.u >= 1) {
            e.rest -= dt;
            const scared = near(e.x, e.z) < EGRET_SHY;
            if (e.rest <= 0 || scared) {
              // on to another stretch of the creek: stalking, or (startled) on the wing to the far one
              let next = (e.spot + 1 + Math.floor(Math.random() * (WADES.length - 1))) % WADES.length;
              if (scared && you) next = WADES.reduce((best, p, k) => (Math.hypot(p.x - you.x, p.z - you.z) > Math.hypot(WADES[best].x - you.x, WADES[best].z - you.z) ? k : best), 0);
              if (next !== e.spot || !scared) {
                e.from = { x: e.x, z: e.z };
                e.to = { x: WADES[next].x + (Math.random() - 0.5) * 0.6, z: WADES[next].z + (Math.random() - 0.5) * 0.6 };
                e.spot = next;
                e.u = 0;
                e.fly = scared ? 1 : 0;
                e.yaw = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z);
              }
              e.rest = 7 + Math.random() * 10;
            }
          } else {
            const len = Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z) || 1;
            e.u = Math.min(1, e.u + (dt * (e.fly ? 4.2 : 0.55)) / len);
            e.x = e.from.x + (e.to.x - e.from.x) * e.u;
            e.z = e.from.z + (e.to.z - e.from.z) * e.u;
          }
          const walking = e.u < 1 && !e.fly;
          const y = Math.max(beachLand(e.x, e.z), SEA_Y - 0.16) + (e.fly && e.u < 1 ? 1.5 * Math.sin(Math.PI * e.u) : 0) + (walking ? 0.02 * Math.abs(Math.sin(t * 5 + i)) : 0);
          q.setFromAxisAngle(up, e.yaw + (e.u >= 1 ? 0.25 * Math.sin(t * 0.3 + i * 2) : 0));
          m.compose(pos.set(e.x, y, e.z), q, scl.setScalar(1.25));
          egrets.mesh.setMatrixAt(i, w.copy(m).multiply(egrets.t.matrix));
        });
        egrets.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    // --- the fiddler crabs: out at the burrow's mouth, waving; down it when you come near
    if (fiddlers) {
      wavers.forEach((f, i) => {
        const want = near(f.x, f.z) < FIDDLER_SHY ? 0 : 1;
        f.out += Math.sign(want - f.out) * Math.min(Math.abs(want - f.out), dt * (want ? 0.6 : 5));
        const wave = 0.035 * Math.max(0, Math.sin(t * 3.2 + f.ph)) * f.out;
        q.setFromAxisAngle(up, f.ph + 0.3 * Math.sin(t * 0.7 + f.ph));
        m.compose(pos.set(f.x, beachLand(f.x, f.z) - 0.07 * (1 - f.out) + wave, f.z), q, scl.setScalar(0.62 * (0.001 + f.out)));
        fiddlers.mesh.setMatrixAt(i, w.copy(m).multiply(fiddlers.t.matrix));
      });
      fiddlers.mesh.instanceMatrix.needsUpdate = true;
    }
    // --- the hermit crabs: a slow walk over the dry sand; tucked into the shell while you stand over one
    if (hermits) {
      shells.forEach((h, i) => {
        const hide = near(h.x, h.z) < HERMIT_SHY;
        h.tuck += Math.sign((hide ? 1 : 0) - h.tuck) * Math.min(1, dt * 5);
        h.tuck = Math.max(0, Math.min(1, h.tuck));
        if (!hide) {
          if (h.rest > 0) {
            h.rest -= dt;
            if (h.rest <= 0) {
              const p = at(5.6 + Math.random() * 2.8, h.v + (Math.random() - 0.5) * 3);
              h.tx = p.x;
              h.tz = p.z;
            }
          } else {
            const dx = h.tx - h.x;
            const dz = h.tz - h.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.05) h.rest = 3 + Math.random() * 7;
            else {
              const step = Math.min(d, 0.14 * dt);
              const nx = h.x + (dx / d) * step;
              const nz = h.z + (dz / d) * step;
              if (beachBlocked(nx, nz)) h.rest = 2;
              else {
                h.x = nx;
                h.z = nz;
                h.yaw = Math.atan2(dx, dz);
              }
            }
          }
        }
        const moving = !hide && h.rest <= 0;
        q.setFromAxisAngle(up, h.yaw);
        m.compose(pos.set(h.x, beachLand(h.x, h.z) - 0.018 * h.tuck + (moving ? 0.006 * Math.abs(Math.sin(t * 9 + i)) : 0), h.z), q, scl.set(1.3, 1.3 * (1 - 0.25 * h.tuck), 1.3 * (1 - 0.3 * h.tuck)));
        hermits.mesh.setMatrixAt(i, w.copy(m).multiply(hermits.t.matrix));
      });
      hermits.mesh.instanceMatrix.needsUpdate = true;
    }
  });
  return <>{all.map((p, i) => (p ? <primitive key={i} object={p.mesh} /> : null))}</>;
}
