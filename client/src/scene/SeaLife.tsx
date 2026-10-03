import { Suspense, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { daylight } from "@shared/daynight";
import { SEA_EVENT_S } from "@shared/voyage";
import { onDeck } from "@shared/worlds/sea";
import { ModelBoundary } from "../entities/ModelBoundary";
import { seaEventStore } from "../systems/seaEventStore";
import { BEACH_LIFE_URL } from "./BeachLife";
import { MotePoints } from "./caveLight";
import { instanced, template } from "./faunaKit";

// The Open Sea's life, client-side (beach_life.glb's templates, one instanced draw a part):
//
//   always        two gulls keeping the boat company by day, a fish leaping now and then
//   the wonders   whatever the room says is beside the boat (shared/voyage.ts SeaEvent): a whale
//                 rolling at the surface off the starboard side and sounding with its flukes up as it
//                 leaves; a pod of dolphins circling the boat; a shoal flashing silver under the keel

const GULLS = 2;
const LEAPERS = 2;
const POD = 4;
const GLINTS = 60;
const SEA_Y = 0;
const SILVER = new THREE.Color("#eaf6ff");

export function SeaLife() {
  return (
    <ModelBoundary what="beach_life.glb" fallback={null}>
      <Suspense fallback={null}>
        <Life />
      </Suspense>
    </ModelBoundary>
  );
}

function Life() {
  const { scene } = useGLTF(BEACH_LIFE_URL);
  const gulls = useMemo(() => ["Body", "WingL", "WingR"].map((n) => instanced(template(scene, `Fauna_Gull_${n}`), GULLS, ["#ffffff"])), [scene]);
  const leapers = useMemo(() => instanced(template(scene, "Fauna_LeapFish"), LEAPERS, ["#ffffff", "#ffe9c2"]), [scene]);
  const pod = useMemo(() => instanced(template(scene, "Fauna_Dolphin"), POD, ["#ffffff"]), [scene]);
  const whale = useMemo(() => instanced(template(scene, "Fauna_WhaleBack"), 1, ["#ffffff"]), [scene]);
  const fluke = useMemo(() => instanced(template(scene, "Fauna_WhaleFluke"), 1, ["#ffffff"]), [scene]);
  const glints = useMemo(() => new MotePoints(GLINTS), []);
  const all = useMemo(() => [...gulls, leapers, pod, whale, fluke], [gulls, leapers, pod, whale, fluke]);
  useEffect(
    () => () => {
      for (const p of all) p?.mesh.dispose();
      glints.dispose();
    },
    [all, glints]
  );
  const leaps = useMemo(() => Array.from({ length: LEAPERS }, (_, i) => ({ at: -9, next: 5 + i * 8, x: 0, z: 0, yaw: 0 })), []);
  const seeds = useMemo(() => Array.from({ length: GLINTS }, () => ({ a: Math.random() * 6.283, r: 1.5 + Math.random() * 5.5, p: Math.random() * 6.283, v: 1.5 + Math.random() * 3 })), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0), rot: new THREE.Matrix4() }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const { m, w, q, q2, pos, scl, up, fwd, side, rot } = tmp;
    const day = daylight(Date.now()) > 0.35;
    // --- the gulls: wide circles round the mast, by day
    for (const p of gulls) if (p) p.mesh.visible = day;
    if (day) {
      for (let i = 0; i < GULLS; i++) {
        const wdir = i % 2 ? -1 : 1;
        const a = i * 3.1 + t * 0.22 * wdir;
        const r = 6.5 + i * 2.2;
        q.setFromAxisAngle(up, Math.PI / 2 - (a + (wdir * Math.PI) / 2));
        q.multiply(q2.setFromAxisAngle(fwd, -0.26 * wdir));
        m.compose(pos.set(Math.cos(a) * r, 6.2 + i * 1.1 + 0.3 * Math.sin(t * 0.6 + i), Math.sin(a) * r), q, scl.setScalar(1.9));
        const beat = (t * 0.17 + i * 0.41) % 1;
        const flap = beat < 0.3 ? 0.1 + Math.sin(beat * 42) * 0.55 : 0.12 + 0.04 * Math.sin(t * 1.3 + i);
        gulls[0]?.mesh.setMatrixAt(i, w.copy(m).multiply(gulls[0].t.matrix));
        if (gulls[1]) gulls[1].mesh.setMatrixAt(i, w.copy(m).multiply(gulls[1].t.matrix).multiply(rot.makeRotationAxis(fwd, flap)));
        if (gulls[2]) gulls[2].mesh.setMatrixAt(i, w.copy(m).multiply(gulls[2].t.matrix).multiply(rot.makeRotationAxis(fwd, -flap)));
      }
      for (const p of gulls) if (p) p.mesh.instanceMatrix.needsUpdate = true;
    }
    // --- a fish leaps, somewhere round the boat
    if (leapers) {
      leaps.forEach((f, i) => {
        if (t > f.next) {
          const a = Math.random() * 6.283;
          const r = 5 + Math.random() * 6;
          Object.assign(f, { at: t, next: t + 7 + Math.random() * 14, x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: Math.random() * 6.283 });
        }
        const u = (t - f.at) / 0.85;
        if (u < 0 || u > 1) {
          leapers.mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
          return;
        }
        const along = (u - 0.5) * 1.1;
        q.setFromAxisAngle(up, f.yaw);
        q.multiply(q2.setFromAxisAngle(side, -1.1 * Math.cos(Math.PI * u)));
        m.compose(pos.set(f.x + Math.sin(f.yaw) * along, SEA_Y - 0.1 + 0.75 * Math.sin(Math.PI * u), f.z + Math.cos(f.yaw) * along), q, scl.setScalar(1.3));
        leapers.mesh.setMatrixAt(i, w.copy(m).multiply(leapers.t.matrix));
      });
      leapers.mesh.instanceMatrix.needsUpdate = true;
    }
    // --- the wonder beside the boat
    const ev = seaEventStore.get();
    const now = Date.now();
    const on = ev && now >= ev.at && now < ev.until ? ev : null;
    // (0 as it comes, 1 as it goes: eased in and out over its first and last seconds)
    const u = on ? (now - on.at) / (SEA_EVENT_S * 1000) : 0;
    const ease = on ? Math.min(1, u * SEA_EVENT_S * 0.25, (1 - u) * SEA_EVENT_S * 0.25) : 0;
    if (whale && fluke) {
      const here = on?.kind === "whale";
      whale.mesh.visible = !!here;
      fluke.mesh.visible = !!here;
      if (here) {
        // lying along the starboard side, rolling slowly; in its last seconds it sounds, flukes up
        const leaving = Math.max(0, 1 - ((1 - u) * SEA_EVENT_S) / 6);
        const c = onDeck(0.5 + 2 * Math.sin(t * 0.05), 8.5);
        const ahead = onDeck(1.5 + 2 * Math.sin(t * 0.05), 8.5);
        const yaw = Math.atan2(ahead.x - c.x, ahead.z - c.z);
        q.setFromAxisAngle(up, yaw);
        q.multiply(q2.setFromAxisAngle(fwd, 0.08 * Math.sin(t * 0.5)));
        q.multiply(q2.setFromAxisAngle(side, 0.5 * leaving));
        m.compose(pos.set(c.x, SEA_Y - 1.9 + 1.75 * ease - 2.2 * leaving + 0.12 * Math.sin(t * 0.6), c.z), q, scl.setScalar(1));
        whale.mesh.setMatrixAt(0, w.copy(m).multiply(whale.t.matrix));
        whale.mesh.instanceMatrix.needsUpdate = true;
        const tail = onDeck(-3.6 + 2 * Math.sin(t * 0.05), 8.5);
        q.setFromAxisAngle(up, yaw);
        m.compose(pos.set(tail.x, SEA_Y - 2.6 + 2.5 * Math.sin(Math.PI * Math.min(1, leaving * 1.2)), tail.z), q, scl.setScalar(1));
        fluke.mesh.setMatrixAt(0, w.copy(m).multiply(fluke.t.matrix));
        fluke.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (pod) {
      const here = on?.kind === "dolphins";
      pod.mesh.visible = !!here;
      if (here) {
        for (let i = 0; i < POD; i++) {
          const a = t * 0.38 + (i * 6.283) / POD;
          const r = 8.5 + (i % 2) * 1.6;
          const ph = t * 2.2 + i * 1.5;
          q.setFromAxisAngle(up, Math.PI / 2 - (a + Math.PI / 2));
          q.multiply(q2.setFromAxisAngle(side, -0.75 * Math.cos(ph)));
          m.compose(pos.set(Math.cos(a) * r, SEA_Y - 0.55 - 1.5 * (1 - ease) + 0.95 * Math.sin(ph), Math.sin(a) * r), q, scl.setScalar(1));
          pod.mesh.setMatrixAt(i, w.copy(m).multiply(pod.t.matrix));
        }
        pod.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    // a shoal: silver flashes on the water all round the hull
    const shoal = on?.kind === "shoal";
    seeds.forEach((sd, i) => {
      if (!shoal) return glints.hide(i);
      const a = sd.a + t * 0.12;
      const flash = Math.max(0, Math.sin(t * sd.v + sd.p)) ** 3;
      glints.set(i, Math.cos(a) * sd.r, SEA_Y + 0.06, Math.sin(a) * sd.r, 0.9 * flash * ease, SILVER);
    });
    glints.commit();
  });
  return (
    <>
      {all.map((p, i) => (p ? <primitive key={i} object={p.mesh} /> : null))}
      <primitive object={glints.points} />
    </>
  );
}
