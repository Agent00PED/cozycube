import { useContext, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FOREST_BIRDS, forestLand } from "@shared/worlds/forest";
import { noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { CampDaylightContext } from "./campDay";

// The Whispering Woods' little lives, by day: songbirds perched on the vista pines' lower boughs
// (FOREST_BIRDS) that take off in a flurry when someone walks up (and come back a while later), and
// butterflies drifting over the meadows. Both from forest.glb's templates (Fauna_Bird_Body, _WingL,
// _WingR; Fauna_Butterfly_*: each wing's node origin is its shoulder), drawn instanced: one draw
// per part for the whole flock, each one tinted its own colour. Gone by night (the fireflies take
// over: ForestWorld).

interface Template {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** The part's own placement in the template (a wing's shoulder). */
  matrix: THREE.Matrix4;
}

const BIRD_TINTS = ["#ffd0b8", "#c8dcff", "#fff0b0", "#e2ffd8", "#ffe0ec"];
const FLY_TINTS = ["#ffe066", "#ff9ec4", "#9fd4ff", "#d4b0ff", "#ffb56b", "#b8f0a0"];
/** The meadows the butterflies drift over (the Border, the Birch Grove, the Golden Glen, the Ridge). */
const MEADOWS: [number, number][] = [
  [-7.5, 14.2],
  [-10.2, 6.2],
  [-7.6, -5.2],
  [0.4, 6.6],
  [-8.2, 2.2],
  [2.6, 13.2],
  [1.6, -3.4],
  [-11.2, 10.0],
  [6.0, -6.0],
  [8.6, 7.6],
];
const SCATTER_R = 2.6;
const FLY_S = 2.2;

function template(scene: THREE.Object3D, name: string): Template | null {
  const node = scene.getObjectByName(name) as THREE.Mesh | undefined;
  if (!node) return null;
  node.visible = false;
  node.updateWorldMatrix(true, false);
  const mesh = (node.isMesh ? node : (node.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined)) ?? null;
  if (!mesh) return null;
  return { geometry: mesh.geometry, material: mesh.material as THREE.Material, matrix: node.matrixWorld.clone() };
}

function instanced(t: Template | null, count: number, tints: string[]) {
  if (!t) return null;
  const mesh = new THREE.InstancedMesh(t.geometry, t.material, count);
  mesh.frustumCulled = false;
  mesh.raycast = noRaycast;
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) mesh.setColorAt(i, c.set(tints[i % tints.length]));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh, t };
}

export function WoodsFauna({ scene }: { scene: THREE.Object3D }) {
  const daylight = useContext(CampDaylightContext) ?? 1;
  const parts = useMemo(() => {
    const bird = ["Fauna_Bird_Body", "Fauna_Bird_WingL", "Fauna_Bird_WingR"].map((n) => instanced(template(scene, n), FOREST_BIRDS.length, BIRD_TINTS));
    const fly = ["Fauna_Butterfly_Body", "Fauna_Butterfly_WingL", "Fauna_Butterfly_WingR"].map((n) => instanced(template(scene, n), MEADOWS.length, FLY_TINTS));
    return { bird, fly };
  }, [scene]);
  useEffect(
    () => () => {
      for (const p of [...parts.bird, ...parts.fly]) p?.mesh.dispose();
    },
    [parts]
  );
  // each bird's state: perched, off in a flurry (and away a while), or on its way back
  const birds = useMemo(() => FOREST_BIRDS.map((b) => ({ ...b, phase: "perched" as "perched" | "flying" | "away" | "back", at: -99, dir: { x: 0, z: 1 }, twitch: Math.random() * 4 })), []);
  const flies = useMemo(() => MEADOWS.map(([x, z], i) => ({ x, z, p: i * 1.7 + Math.random(), a: 0.18 + Math.random() * 0.1, b: 0.23 + Math.random() * 0.1 })), []);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const w = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const fwd = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const rot = useMemo(() => new THREE.Matrix4(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const day = daylight > 0.3;
    for (const p of [...parts.bird, ...parts.fly]) if (p) p.mesh.visible = day;
    if (!day) return;
    // --- the birds ---
    birds.forEach((b, i) => {
      const since = t - b.at;
      if (b.phase === "perched" && Math.hypot(cameraFocus.x - b.x, cameraFocus.z - b.z) < SCATTER_R) {
        const dx = b.x - cameraFocus.x;
        const dz = b.z - cameraFocus.z;
        const d = Math.hypot(dx, dz) || 1;
        b.dir = { x: dx / d, z: dz / d };
        b.phase = "flying";
        b.at = t;
      } else if (b.phase === "flying" && since > FLY_S) {
        b.phase = "away";
        b.at = t;
      } else if (b.phase === "away" && since > 18 + (i % 3) * 5 && Math.hypot(cameraFocus.x - b.x, cameraFocus.z - b.z) > SCATTER_R + 1.5) {
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
    // --- the butterflies: a lazy loop over their meadow, flapping as they go ---
    flies.forEach((f, i) => {
      const x = f.x + Math.sin(t * f.a + f.p) * 1.9 + Math.sin(t * f.a * 2.3 + f.p) * 0.5;
      const z = f.z + Math.cos(t * f.b + f.p * 1.3) * 1.5;
      const y = forestLand(x, z) + 0.75 + 0.35 * Math.sin(t * 0.9 + f.p) + 0.08 * Math.sin(t * 7 + f.p);
      const vx = Math.cos(t * f.a + f.p) * 1.9 * f.a;
      const vz = -Math.sin(t * f.b + f.p * 1.3) * 1.5 * f.b;
      q.setFromAxisAngle(up, Math.atan2(vx, vz));
      m.compose(pos.set(x, y, z), q, scl.set(2.8, 2.8, 2.8));
      const flap = 0.2 + Math.abs(Math.sin(t * 14 + f.p)) * 1.15;
      parts.fly[0]?.mesh.setMatrixAt(i, w.copy(m).multiply(parts.fly[0].t.matrix));
      if (parts.fly[1]) parts.fly[1].mesh.setMatrixAt(i, w.copy(m).multiply(parts.fly[1].t.matrix).multiply(rot.makeRotationAxis(fwd, flap)));
      if (parts.fly[2]) parts.fly[2].mesh.setMatrixAt(i, w.copy(m).multiply(parts.fly[2].t.matrix).multiply(rot.makeRotationAxis(fwd, -flap)));
    });
    for (const p of parts.fly) if (p) p.mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {[...parts.bird, ...parts.fly].map((p, i) => (p ? <primitive key={i} object={p.mesh} /> : null))}
    </>
  );
}
