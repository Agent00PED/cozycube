import { useContext, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FOREST_BIRDS, FOREST_HIVES, FOREST_OWL, forestLand } from "@shared/worlds/forest";
import { cameraFocus } from "./cameraFocus";
import { CampDaylightContext } from "./campDay";
import { instanced, template } from "./faunaKit";
import { Butterflies } from "./Butterflies";

// The Whispering Woods' little lives. By day: songbirds perched on the vista pines' lower boughs
// (FOREST_BIRDS; the kingfisher on its branch over the river's pool is one of them, in its own blue) that
// take off in a flurry when someone walks up (and come back a while later), butterflies drifting
// over the meadows (Butterflies), and bees circling Bramble's hives. By night: the Old Growth's owl
// on its bough, turning to watch whoever passes. All from forest.glb's templates (Fauna_Bird_Body,
// _WingL, _WingR; Fauna_Butterfly_*; Fauna_Bee; Fauna_WoodsOwl), drawn instanced: one draw per part for
// the whole flock, each one tinted its own colour.

const BIRD_TINTS = ["#ffd0b8", "#c8dcff", "#fff0b0", "#e2ffd8", "#ffe0ec"];
/** The meadows the butterflies drift over (the Border, the Birch Grove's glade, the Golden Glen, the
 *  Heart Glade, the Ridge; Bramble's garden and the rise). */
const MEADOWS: [number, number][] = [
  [-7.5, 14.2],
  [-10.2, 5.6],
  [-9.4, -2.6],
  [-0.8, 3.4],
  [-1.6, 8.6],
  [2.6, 13.2],
  [0.6, -1.6],
  [-11.2, 11.0],
  [6.6, -5.6],
  [8.6, 7.6],
  [10.6, 11.2],
  [7.6, -0.4],
];
const SCATTER_R = 2.6;
const FLY_S = 2.2;
/** Bees to a hive. */
const BEES_PER_HIVE = 4;

/** The woods' trees that are down now (felled, growing back), by node id: a bird whose pine is among
 *  them is away, and the owl with its own. ForestWorld keeps it from the room's trees. */
export const woodsTreesDown = { ids: new Set<string>() };

export function WoodsFauna({ scene }: { scene: THREE.Object3D }) {
  const daylight = useContext(CampDaylightContext) ?? 1;
  const parts = useMemo(() => {
    const tints = FOREST_BIRDS.map((b, i) => b.tint ?? BIRD_TINTS[i % BIRD_TINTS.length]);
    const bird = ["Fauna_Bird_Body", "Fauna_Bird_WingL", "Fauna_Bird_WingR"].map((n) => instanced(template(scene, n), FOREST_BIRDS.length, tints));
    const bee = instanced(template(scene, "Fauna_Bee"), FOREST_HIVES.length * BEES_PER_HIVE, ["#ffffff"]);
    const owl = instanced(template(scene, "Fauna_WoodsOwl"), 1, ["#ffffff"]);
    return { bird, bee, owl };
  }, [scene]);
  useEffect(
    () => () => {
      for (const p of [...parts.bird, parts.bee, parts.owl]) p?.mesh.dispose();
    },
    [parts]
  );
  // each bird's state: perched, off in a flurry (and away a while), or on its way back
  const birds = useMemo(() => FOREST_BIRDS.map((b) => ({ ...b, phase: "perched" as "perched" | "flying" | "away" | "back", at: -99, dir: { x: 0, z: 1 }, twitch: Math.random() * 4 })), []);
  // each bee: its hive, and its own loop round the hive's mouth
  const bees = useMemo(
    () =>
      FOREST_HIVES.flatMap((h) =>
        Array.from({ length: BEES_PER_HIVE }, () => ({ x: h.x, z: h.z, y: forestLand(h.x, h.z) + 0.55, r: 0.28 + Math.random() * 0.45, w: 1.6 + Math.random() * 1.6, p: Math.random() * 6.28, lift: 0.15 + Math.random() * 0.4 }))
      ),
    []
  );
  const owlYaw = useMemo(() => ({ v: FOREST_OWL.yaw }), []);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const w = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const fwd = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const rot = useMemo(() => new THREE.Matrix4(), []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const day = daylight > 0.3;
    for (const p of [...parts.bird, parts.bee]) if (p) p.mesh.visible = day;
    // --- the owl, by night: it turns to whoever is near, and bobs as it settles ---
    if (parts.owl) {
      const night = daylight < 0.25 && !(FOREST_OWL.tree && woodsTreesDown.ids.has(FOREST_OWL.tree));
      parts.owl.mesh.visible = night;
      if (night) {
        const dx = cameraFocus.x - FOREST_OWL.x;
        const dz = cameraFocus.z - FOREST_OWL.z;
        const want = Math.hypot(dx, dz) < 7 ? Math.atan2(dx, dz) : FOREST_OWL.yaw + 0.35 * Math.sin(t * 0.23);
        let turn = want - owlYaw.v;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        owlYaw.v += turn * Math.min(1, dt * 1.8);
        q.setFromAxisAngle(up, owlYaw.v);
        const s = 1.7 * (1 + 0.012 * Math.sin(t * 1.4));
        m.compose(pos.set(FOREST_OWL.x, FOREST_OWL.y, FOREST_OWL.z), q, scl.set(s, s, s));
        parts.owl.mesh.setMatrixAt(0, w.copy(m).multiply(parts.owl.t.matrix));
        parts.owl.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (!day) return;
    // --- the birds ---
    birds.forEach((b, i) => {
      const since = t - b.at;
      // (its pine felled: off it goes, and it stays away until the tree is grown again)
      const down = !!b.tree && woodsTreesDown.ids.has(b.tree);
      if (b.phase === "perched" && (down || Math.hypot(cameraFocus.x - b.x, cameraFocus.z - b.z) < SCATTER_R)) {
        const dx = b.x - cameraFocus.x;
        const dz = b.z - cameraFocus.z;
        const d = Math.hypot(dx, dz) || 1;
        b.dir = { x: dx / d, z: dz / d };
        b.phase = "flying";
        b.at = t;
      } else if (b.phase === "flying" && since > FLY_S) {
        b.phase = "away";
        b.at = t;
      } else if (b.phase === "away" && !down && since > 18 + (i % 3) * 5 && Math.hypot(cameraFocus.x - b.x, cameraFocus.z - b.z) > SCATTER_R + 1.5) {
        b.phase = "back";
        b.at = t;
      } else if (b.phase === "back" && since > FLY_S) {
        b.phase = "perched";
        b.at = t;
      }
      // where along its flight (0 at the perch, 1 gone), and the flap
      const u = b.phase === "flying" ? Math.min(1, since / FLY_S) : b.phase === "back" ? 1 - Math.min(1, since / FLY_S) : b.phase === "away" ? 1 : 0;
      const airborne = b.phase === "flying" || b.phase === "back";
      const shown = b.phase !== "away";
      const reach = u * u * 7;
      pos.set(b.x + b.dir.x * reach, b.y + u * 4.5, b.z + b.dir.z * reach);
      const yaw = airborne ? Math.atan2(b.phase === "back" ? -b.dir.x : b.dir.x, b.phase === "back" ? -b.dir.z : b.dir.z) : b.yaw + 0.25 * Math.sin(t * 0.7 + b.twitch);
      q.setFromAxisAngle(up, yaw);
      // (a chibi songbird: a little larger than life, to read at the game's zoom)
      const s = shown ? 1.8 : 0.0001;
      m.compose(pos, q, scl.set(s, s, s));
      // a hop on the bough now and then
      if (!airborne) m.elements[13] += Math.max(0, Math.sin(t * 1.3 + b.twitch * 3)) ** 16 * 0.04;
      const flap = airborne ? Math.sin(t * 30 + i) * 1.1 : Math.max(0, Math.sin(t * 0.9 + b.twitch)) ** 24 * 0.9;
      parts.bird[0]?.mesh.setMatrixAt(i, w.copy(m).multiply(parts.bird[0].t.matrix));
      if (parts.bird[1]) parts.bird[1].mesh.setMatrixAt(i, w.copy(m).multiply(parts.bird[1].t.matrix).multiply(rot.makeRotationAxis(fwd, flap)));
      if (parts.bird[2]) parts.bird[2].mesh.setMatrixAt(i, w.copy(m).multiply(parts.bird[2].t.matrix).multiply(rot.makeRotationAxis(fwd, -flap)));
    });
    for (const p of parts.bird) if (p) p.mesh.instanceMatrix.needsUpdate = true;
    // --- the bees: each a quick loop round its hive, in and out, up and down ---
    if (parts.bee) {
      const bee = parts.bee;
      bees.forEach((b, i) => {
        const a = t * b.w + b.p;
        const r = b.r * (0.75 + 0.25 * Math.sin(t * 0.9 + b.p * 2));
        const x = b.x + Math.cos(a) * r;
        const z = b.z + 0.25 + Math.sin(a) * r * 0.7;
        const y = b.y + b.lift * (0.6 + 0.4 * Math.sin(t * 1.7 + b.p)) + 0.03 * Math.sin(t * 19 + i);
        q.setFromAxisAngle(up, -a);
        m.compose(pos.set(x, y, z), q, scl.set(1.7, 1.7, 1.7));
        bee.mesh.setMatrixAt(i, w.copy(m).multiply(bee.t.matrix));
      });
      bee.mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {[...parts.bird, parts.bee, parts.owl].map((p, i) => (p ? <primitive key={i} object={p.mesh} /> : null))}
      <Butterflies scene={scene} spots={MEADOWS} landY={forestLand} />
    </>
  );
}
