import { Suspense, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { beachDay } from "./beachDay";
import { SEA_EVENT_S } from "@shared/voyage";
import { DECK_Y, SEA_LAYOUT, onDeck } from "@shared/worlds/sea";
import { ModelBoundary } from "../entities/ModelBoundary";
import { seaEventStore } from "../systems/seaEventStore";
import { BEACH_LIFE_URL } from "./BeachLife";
import { MotePoints } from "./caveLight";
import { instanced, template } from "./faunaKit";

// The Open Sea's life, client-side (beach_life.glb's templates, one instanced draw a part):
//
//   always        two gulls keeping the boat company by day, a fish leaping now and then, a school of
//                 five going over one after another, flying fish skimming away low over the water, a
//                 sea turtle coming up for air a way off, a manta ray gliding past under the hull,
//                 two gulls resting on the wheelhouse's roof
//   the wonders   whatever the room says is beside the boat (shared/voyage.ts SeaEvent): a whale
//                 rolling at the surface off the starboard side and sounding with its flukes up as it
//                 leaves; a pod of dolphins circling the boat; a shoal flashing silver under the keel

const GULLS = 2;
const LEAPERS = 2;
/** A school leaping one after another, and the flying fish that skim off together. */
const SCHOOL = 5;
const FLYERS = 3;
/** Gulls at rest on the wheelhouse's roof (they lift off when a wonder comes, and at night they are gone). */
const ROOST = 2;
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
  const leapers = useMemo(() => instanced(template(scene, "Fauna_LeapFish"), LEAPERS + SCHOOL + FLYERS, ["#ffffff", "#ffe9c2", "#dff3ff"]), [scene]);
  const pod = useMemo(() => instanced(template(scene, "Fauna_Dolphin"), POD, ["#ffffff"]), [scene]);
  const turtle = useMemo(() => instanced(template(scene, "Fauna_SeaTurtle"), 1, ["#ffffff"]), [scene]);
  const roost = useMemo(() => instanced(template(scene, "Fauna_Gull_Body"), ROOST, ["#ffffff"]), [scene]);
  const manta = useMemo(() => instanced(template(scene, "Fauna_Manta"), 1, ["#ffffff"]), [scene]);
  const whale = useMemo(() => instanced(template(scene, "Fauna_WhaleBack"), 1, ["#ffffff"]), [scene]);
  const fluke = useMemo(() => instanced(template(scene, "Fauna_WhaleFluke"), 1, ["#ffffff"]), [scene]);
  const glints = useMemo(() => new MotePoints(GLINTS), []);
  const all = useMemo(() => [...gulls, leapers, pod, whale, fluke, turtle, manta, roost], [gulls, leapers, pod, whale, fluke, turtle, manta, roost]);
  useEffect(
    () => () => {
      for (const p of all) p?.mesh.dispose();
      glints.dispose();
    },
    [all, glints]
  );
  const leaps = useMemo(() => Array.from({ length: LEAPERS }, (_, i) => ({ at: -9, next: 5 + i * 8, x: 0, z: 0, yaw: 0 })), []);
  const school = useMemo(() => ({ at: -99, next: 12, x: 0, z: 0, yaw: 0 }), []);
  const flight = useMemo(() => ({ at: -99, next: 20, x: 0, z: 0, yaw: 0 }), []);
  const glide = useMemo(() => ({ at: -99, next: 40, x: 0, z: 0, yaw: 0 }), []);
  const swim = useMemo(() => ({ at: -99, next: 30, x: 0, z: 0, yaw: 0 }), []);
  const seeds = useMemo(() => Array.from({ length: GLINTS }, () => ({ a: Math.random() * 6.283, r: 1.5 + Math.random() * 5.5, p: Math.random() * 6.283, v: 1.5 + Math.random() * 3 })), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0), rot: new THREE.Matrix4() }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const { m, w, q, q2, pos, scl, up, fwd, side, rot } = tmp;
    const day = beachDay.light > 0.35;
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
      // a school: five over the water one after another, along one line
      if (t > school.next) {
        const a = Math.random() * 6.283;
        const r = 6 + Math.random() * 5;
        Object.assign(school, { at: t, next: t + 22 + Math.random() * 26, x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: a + Math.PI / 2 + (Math.random() - 0.5) });
      }
      for (let i = 0; i < SCHOOL; i++) {
        const u = (t - school.at - i * 0.16) / 0.8;
        if (u < 0 || u > 1) {
          leapers.mesh.setMatrixAt(LEAPERS + i, m.makeScale(0, 0, 0));
          continue;
        }
        const along = (u - 0.5) * 1.0 + i * 0.55 - 1.1;
        const off = (i % 2 ? 0.25 : -0.25) + 0.1 * i;
        q.setFromAxisAngle(up, school.yaw);
        q.multiply(q2.setFromAxisAngle(side, -1.1 * Math.cos(Math.PI * u)));
        m.compose(pos.set(school.x + Math.sin(school.yaw) * along + Math.cos(school.yaw) * off, SEA_Y - 0.1 + 0.6 * Math.sin(Math.PI * u), school.z + Math.cos(school.yaw) * along - Math.sin(school.yaw) * off), q, scl.setScalar(1.05));
        leapers.mesh.setMatrixAt(LEAPERS + i, w.copy(m).multiply(leapers.t.matrix));
      }
      // flying fish: out of the water by the hull and away, low and flat, a long glide
      if (t > flight.next) {
        const a = Math.random() * 6.283;
        Object.assign(flight, { at: t, next: t + 18 + Math.random() * 22, x: Math.cos(a) * 3.2, z: Math.sin(a) * 3.2, yaw: Math.atan2(Math.cos(a), Math.sin(a)) + (Math.random() - 0.5) * 0.8 });
      }
      for (let i = 0; i < FLYERS; i++) {
        const u = (t - flight.at - i * 0.22) / 1.7;
        if (u < 0 || u > 1) {
          leapers.mesh.setMatrixAt(LEAPERS + SCHOOL + i, m.makeScale(0, 0, 0));
          continue;
        }
        const yaw = flight.yaw + (i - 1) * 0.22;
        const along = u * 7.5;
        q.setFromAxisAngle(up, yaw);
        q.multiply(q2.setFromAxisAngle(side, u < 0.12 ? -0.6 : u > 0.9 ? 0.5 : -0.05));
        q.multiply(q2.setFromAxisAngle(fwd, 0.12 * Math.sin(t * 30 + i)));
        m.compose(pos.set(flight.x + Math.sin(yaw) * along, SEA_Y + 0.02 + 0.34 * Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.5, flight.z + Math.cos(yaw) * along), q, scl.setScalar(0.8));
        leapers.mesh.setMatrixAt(LEAPERS + SCHOOL + i, w.copy(m).multiply(leapers.t.matrix));
      }
      leapers.mesh.instanceMatrix.needsUpdate = true;
    }
    // --- a sea turtle up for air, a way off: its shell breaks the surface, it drifts, it goes down
    if (turtle) {
      if (t > swim.next) {
        const a = Math.random() * 6.283;
        const r = 7 + Math.random() * 4;
        Object.assign(swim, { at: t, next: t + 45 + Math.random() * 40, x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: Math.random() * 6.283 });
      }
      const u = (t - swim.at) / 9;
      turtle.mesh.visible = u >= 0 && u <= 1;
      if (turtle.mesh.visible) {
        const rise = Math.min(1, u * 5, (1 - u) * 5);
        q.setFromAxisAngle(up, swim.yaw + 0.15 * Math.sin(t * 0.4));
        q.multiply(q2.setFromAxisAngle(side, 0.25 * (1 - rise)));
        m.compose(pos.set(swim.x + Math.sin(swim.yaw) * u * 2.2, SEA_Y - 0.62 + 0.5 * rise + 0.04 * Math.sin(t * 1.3), swim.z + Math.cos(swim.yaw) * u * 2.2), q, scl.setScalar(1.25));
        turtle.mesh.setMatrixAt(0, w.copy(m).multiply(turtle.t.matrix));
        turtle.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    // --- two gulls at rest on the wheelhouse's roof, by day: a shuffle, a look about
    if (roost) {
      roost.mesh.visible = day;
      if (day) {
        const H = SEA_LAYOUT.wheelhouse;
        for (let i = 0; i < ROOST; i++) {
          const p = onDeck(H.a0 + 0.45 + i * 0.75, (i ? 0.35 : -0.3) + 0.03 * Math.sin(t * 0.4 + i));
          q.setFromAxisAngle(up, 0.8 + i * 1.9 + 0.5 * Math.sin(t * 0.23 + i * 3));
          m.compose(pos.set(p.x, DECK_Y + 2.02 + 0.006 * Math.sin(t * 2 + i), p.z), q, scl.setScalar(1.7));
          roost.mesh.setMatrixAt(i, w.copy(m).multiply(roost.t.matrix));
        }
        roost.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    // --- a manta ray gliding by under the surface, right past the hull: a dark shape, its wings beating slowly
    if (manta) {
      if (t > glide.next) {
        const a = Math.random() * 6.283;
        Object.assign(glide, { at: t, next: t + 55 + Math.random() * 50, x: Math.cos(a) * 11, z: Math.sin(a) * 11, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) + (Math.random() - 0.5) * 0.5 });
      }
      const u = (t - glide.at) / 16;
      manta.mesh.visible = u >= 0 && u <= 1;
      if (manta.mesh.visible) {
        const along = u * 22;
        q.setFromAxisAngle(up, glide.yaw + 0.2 * Math.sin(u * 5));
        q.multiply(q2.setFromAxisAngle(fwd, 0.1 * Math.sin(t * 1.4)));
        // (it rides just under the sheet's swell: its back breaks through in places, the rest is the water's)
        m.compose(pos.set(glide.x + Math.sin(glide.yaw) * along, SEA_Y - 0.035 + 0.02 * Math.sin(t * 1.4), glide.z + Math.cos(glide.yaw) * along), q, scl.set(1.5, 1, 1.5));
        manta.mesh.setMatrixAt(0, w.copy(m).multiply(manta.t.matrix));
        manta.mesh.instanceMatrix.needsUpdate = true;
      }
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
