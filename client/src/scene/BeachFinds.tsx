import { Suspense, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { COMB_SPOTS, HATCH_NEST, HATCH_REACH, HATCH_S, HATCH_SEA, combBucket, combSpots, hatchClock } from "@shared/beach_journal";
import { CREEK, MANGROVES, PALMS, SEA_Y, beachGroundY, shoreD } from "@shared/worlds/beach";
import { ModelBoundary } from "../entities/ModelBoundary";
import { beachJournal, sighted, toldCount } from "../systems/beachJournalStore";
import { beachDay } from "./beachDay";
import { cameraFocus } from "./cameraFocus";
import { MotePoints } from "./caveLight";
import { instanced, template } from "./faunaKit";
import { BEACH_LIFE_URL } from "./BeachLife";

// What the Beach Journal draws and watches on Sunset Beach (shared/beach_journal.ts), all of it this
// player's own:
//
//   the finds        a twinkle over each of this stretch's beachcombing spots not yet picked up
//   the hatchlings   some nights a nest in the open sand below the bar hatches: a dozen little turtles run for
//                    the sea, one after another (the same moment on every client: hatchClock)
//   the watch        once a second, the shore's creatures you are near enough to have seen are
//                    reported for the journal (the server believes only what could be true)

const HATCHLINGS = 12;
const GOLD = new THREE.Color("#ffe9a8");
const PALE = new THREE.Color("#fff6dc");

export function BeachFinds() {
  return (
    <ModelBoundary what="beach_life.glb" fallback={null}>
      <Suspense fallback={null}>
        <Finds />
      </Suspense>
    </ModelBoundary>
  );
}

function Finds() {
  const { scene } = useGLTF(BEACH_LIFE_URL);
  const motes = useMemo(() => new MotePoints(COMB_SPOTS * 3), []);
  // (what lies on the sand at each spot: a pale shell, the hermit crabs' own, empty)
  const shells = useMemo(() => instanced(template(scene, "Fauna_HermitCrab"), COMB_SPOTS, ["#fff3e0", "#ffd9c9", "#e9f3ff"]), [scene]);
  const hatch = useMemo(() => instanced(template(scene, "Fauna_SeaTurtle"), HATCHLINGS, [[1.9, 2.3, 1.7], [1.6, 2.0, 1.5], [2.1, 2.4, 1.9]]), [scene]);
  useEffect(
    () => () => {
      motes.dispose();
      hatch?.mesh.dispose();
      shells?.mesh.dispose();
    },
    [motes, hatch, shells]
  );
  const state = useMemo(() => ({ bucket: -1, spots: [] as { x: number; z: number; y: number }[], watch: 0 }), []);
  // each hatchling's own wander off the straight line, and when it sets out
  const runs = useMemo(() => Array.from({ length: HATCHLINGS }, (_, i) => ({ start: 4 + i * 5.5 + Math.random() * 3, side: (Math.random() - 0.5) * 2.4, wob: Math.random() * 6.283, pace: 0.9 + Math.random() * 0.3 })), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);

  useFrame(({ clock }, rawDt) => {
    const t = clock.elapsedTime;
    const now = Date.now();
    // --- the finds: this stretch's spots, a twinkle of three motes over each one still lying there
    const bucket = combBucket(now);
    if (bucket !== state.bucket) {
      state.bucket = bucket;
      state.spots = combSpots(bucket).map((p) => ({ ...p, y: beachGroundY(p.x, p.z) }));
    }
    for (let i = 0; i < COMB_SPOTS; i++) {
      const p = state.spots[i];
      const there = p && !beachJournal.picked.has(`${bucket}:${i}`);
      if (shells) {
        if (there) tmp.m.compose(tmp.pos.set(p.x, p.y + 0.01, p.z), tmp.q.setFromAxisAngle(tmp.up, i * 1.9), tmp.scl.setScalar(2.6));
        else tmp.m.makeScale(0, 0, 0);
        shells.mesh.setMatrixAt(i, there ? tmp.w.copy(tmp.m).multiply(shells.t.matrix) : tmp.m);
      }
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        if (!there) {
          motes.hide(j);
          continue;
        }
        const ph = t * 1.6 + i * 1.7 + k * 2.1;
        const tw = Math.max(0, Math.sin(ph)) ** 3;
        motes.set(j, p.x + 0.12 * Math.cos(k * 2.1 + i), p.y + 0.1 + 0.16 * k + 0.05 * Math.sin(ph * 0.5), p.z + 0.12 * Math.sin(k * 2.1 + i), 0.25 + 0.75 * tw, k === 1 ? PALE : GOLD);
      }
    }
    motes.commit();
    if (shells) shells.mesh.instanceMatrix.needsUpdate = true;

    // --- the hatchlings: from the nest down the sand and into the water, each in its turn
    const run = hatchClock(now, beachDay.hour);
    if (hatch) {
      hatch.mesh.visible = run >= 0;
      if (run >= 0) {
        const { m, w, q, pos, scl, up } = tmp;
        const dx = HATCH_SEA.x - HATCH_NEST.x;
        const dz = HATCH_SEA.z - HATCH_NEST.z;
        const len = Math.hypot(dx, dz);
        const yaw = Math.atan2(dx, dz);
        runs.forEach((r, i) => {
          // (a hatchling's whole run takes about a minute; before its turn it is still in the nest,
          // after it, gone under)
          const u = ((run - r.start) * r.pace) / 60;
          if (u <= 0 || u >= 1 || run > HATCH_S - 2) {
            m.makeScale(0, 0, 0);
            hatch.mesh.setMatrixAt(i, m);
            return;
          }
          const off = r.side * Math.sin(u * Math.PI) + 0.25 * Math.sin(t * 2.2 + r.wob);
          const x = HATCH_NEST.x + dx * u + (dz / len) * off;
          const z = HATCH_NEST.z + dz * u - (dx / len) * off;
          const y = Math.max(beachGroundY(x, z), SEA_Y + beachDay.tide - 0.02);
          q.setFromAxisAngle(up, yaw + 0.35 * Math.sin(t * 7 + r.wob));
          m.compose(pos.set(x, y + 0.01 + 0.012 * Math.abs(Math.sin(t * 9 + r.wob)), z), q, scl.setScalar(0.26));
          hatch.mesh.setMatrixAt(i, w.copy(m).multiply(hatch.t.matrix));
        });
        hatch.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // --- the watch: what you are near enough to have seen
    state.watch -= Math.min(rawDt, 0.2);
    if (state.watch > 0 || !cameraFocus.hasTarget) return;
    // (one note at a time: a walk down the beach fills the journal a creature at a go, not a page at once)
    state.watch = 1;
    const before = toldCount();
    const px = cameraFocus.x;
    const pz = cameraFocus.z;
    const day = beachDay.hour !== "night";
    const edge = shoreD(px, pz);
    const see = (id: string) => {
      if (toldCount() === before) sighted(id);
    };
    if (day) see("shore_gull");
    if (day && edge < 2.2) see("shore_sandpiper");
    if (edge < 1.6) see("shore_crab");
    if (edge > 3 && edge < 6.5) see("shore_hermit");
    if (Math.hypot(px - CREEK.pool.x, pz - CREEK.pool.z) < 5.5 || CREEK.points.some((c) => Math.hypot(px - c.x, pz - c.z) < 3)) see("shore_egret");
    if (MANGROVES.some((g) => Math.hypot(px - g.x, pz - g.z) < 2.8)) see("shore_fiddler");
    if (!day && PALMS.some((p) => Math.hypot(px - p.x, pz - p.z) < 3)) see("shore_firefly");
    if (run >= 0 && Math.hypot(px - HATCH_NEST.x, pz - HATCH_NEST.z) < HATCH_REACH) see("shore_hatchling");
    if (toldCount() !== before) state.watch = 7;
  });

  return (
    <>
      <primitive object={motes.points} />
      {hatch && <primitive object={hatch.mesh} />}
      {shells && <primitive object={shells.mesh} />}
    </>
  );
}
