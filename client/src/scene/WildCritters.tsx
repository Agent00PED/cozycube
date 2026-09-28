import { Suspense, useContext, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { MapId } from "@shared/types";
import { isBlocked } from "@shared/collision";
import { ModelBoundary } from "../entities/ModelBoundary";
import { modelUrl } from "../assetVersion";
import { liveMotion } from "../systems/liveMotion";
import { cameraFocus } from "./cameraFocus";
import { CampDaylightContext } from "./campDay";
import { noRaycast } from "./kit";

// The wild critters of the campfire and the woods (critters.glb: Critter_Rabbit, Critter_Squirrel,
// Critter_Deer, each one vertex-clay mesh): rabbits, red squirrels and a dappled doe, each keeping
// to its own territory (TERRITORY m round its home). They amble or hop to a spot, stop to sniff the
// air or nibble at the grass, and move on; anyone who comes within FLEE_R sends them bolting away
// (hopping flat out, scurrying, bounding), and they settle again once clear. Only this client's
// eyes: nothing here is synced (the wild things aren't anyone's to catch), but every player on the
// map (the server's positions, liveMotion) scares them the same. Drawn instanced, one draw call
// per kind for the whole map; the squirrels curl up in their dreys by night.

export const CRITTERS_URL = modelUrl("critters.glb");

type Kind = "rabbit" | "squirrel" | "deer";
/** How far from home a critter wanders (m), and how close someone comes before it bolts. */
const TERRITORY = 5;
const FLEE_R = 3.0;

/** Each kind's size in the game, its footprint, its paces (m/s) and its gait. */
const KIND: Record<Kind, { node: string; scale: number; radius: number; walk: number; run: number; step: number; hop: number }> = {
  rabbit: { node: "Critter_Rabbit", scale: 1.25, radius: 0.2, walk: 0.8, run: 3.4, step: 0.34, hop: 0.09 },
  squirrel: { node: "Critter_Squirrel", scale: 1.3, radius: 0.18, walk: 1.1, run: 3.8, step: 0.2, hop: 0.035 },
  deer: { node: "Critter_Deer", scale: 1.0, radius: 0.35, walk: 0.45, run: 3.0, step: 0.5, hop: 0.12 },
};

/** Each map's critters and their homes: on open ground at the edges, clear of the paths' busiest
 *  stretches (the woods' own tame deer and rabbits by the glen's path are ForestWorld's). */
const HOMES: Partial<Record<MapId, [Kind, number, number][]>> = {
  campfire_night: [
    ["rabbit", -8.5, 1.5],
    ["rabbit", -8.0, 8.5],
    ["rabbit", 6.5, 9.3],
    ["squirrel", -6.5, -7.0],
    ["squirrel", -0.5, -8.5],
    ["deer", -7.0, 4.5],
  ],
  whispering_woods: [
    ["rabbit", -8.0, -7.0],
    ["rabbit", -6.0, 9.0],
    ["rabbit", 6.0, 9.0],
    ["squirrel", -9.0, 2.5],
    ["squirrel", 1.0, -8.5],
    ["squirrel", 5.5, 5.0],
    ["deer", -5.5, 0.0],
    ["deer", 4.0, -3.0],
  ],
};

type Mode = "idle" | "move" | "flee" | "alert";
interface Critter {
  kind: Kind;
  home: { x: number; z: number };
  x: number;
  z: number;
  yaw: number;
  mode: Mode;
  to: { x: number; z: number };
  /** When the current idle, alert or walk ends (s, the frame clock). */
  until: number;
  /** Nibbling (head down) or sniffing (quick little bobs) while idle. */
  nibble: boolean;
  /** How far along its gait (hops, strides). */
  gait: number;
  seed: number;
}

/** A straight line open to a critter of radius `r` (sampled every 0.3 m). */
function clearLine(mapId: MapId, x0: number, z0: number, x1: number, z1: number, r: number) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3));
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    if (isBlocked(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, mapId, r)) return false;
  }
  return true;
}

/** A spot to amble to: within its territory, reachable in a straight line. */
function wanderSpot(mapId: MapId, c: Critter) {
  const r = KIND[c.kind].radius;
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * Math.PI * 2;
    const d = 0.8 + Math.random() * (c.kind === "deer" ? 2.4 : 1.8);
    const x = c.x + Math.cos(a) * d;
    const z = c.z + Math.sin(a) * d;
    if (Math.hypot(x - c.home.x, z - c.home.z) > TERRITORY) continue;
    if (clearLine(mapId, c.x, c.z, x, z, r)) return { x, z };
  }
  // (hemmed in: back toward home)
  return clearLine(mapId, c.x, c.z, c.home.x, c.home.z, r) ? { ...c.home } : null;
}

/** Where to bolt from a threat at (tx, tz): away from it, as far as it can, inside its territory. */
function fleeSpot(mapId: MapId, c: Critter, tx: number, tz: number) {
  const r = KIND[c.kind].radius;
  const away = Math.atan2(c.z - tz, c.x - tx);
  let best: { x: number; z: number } | null = null;
  let bestD = -1;
  for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1]) {
    for (const d of [4.0, 3.0, 2.0]) {
      const x = c.x + Math.cos(away + da) * d;
      const z = c.z + Math.sin(away + da) * d;
      if (Math.hypot(x - c.home.x, z - c.home.z) > TERRITORY + 0.5 || !clearLine(mapId, c.x, c.z, x, z, r)) continue;
      const gap = Math.hypot(x - tx, z - tz);
      if (gap > bestD) {
        bestD = gap;
        best = { x, z };
      }
      break;
    }
  }
  return best;
}

interface Template {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

function Critters({ mapId }: { mapId: MapId }) {
  const { scene } = useGLTF(CRITTERS_URL);
  const daylight = useContext(CampDaylightContext) ?? 1;
  const critters = useMemo<Critter[]>(
    () =>
      (HOMES[mapId] ?? []).map(([kind, x, z], i) => ({
        kind,
        home: { x, z },
        x,
        z,
        yaw: Math.random() * Math.PI * 2,
        mode: "idle",
        to: { x, z },
        until: 1 + Math.random() * 4,
        nibble: Math.random() < 0.5,
        gait: 0,
        seed: i * 1.73 + Math.random(),
      })),
    [mapId]
  );
  // one instanced mesh per kind, as many instances as the map has of it
  const meshes = useMemo(() => {
    const out: Partial<Record<Kind, { mesh: THREE.InstancedMesh; members: Critter[] }>> = {};
    for (const kind of Object.keys(KIND) as Kind[]) {
      const members = critters.filter((c) => c.kind === kind);
      const node = scene.getObjectByName(KIND[kind].node) as THREE.Mesh | undefined;
      const mesh = node && ((node.isMesh ? node : node.children.find((ch) => (ch as THREE.Mesh).isMesh)) as THREE.Mesh | undefined);
      if (!members.length || !mesh) continue;
      const t: Template = { geometry: mesh.geometry, material: mesh.material as THREE.Material };
      const im = new THREE.InstancedMesh(t.geometry, t.material, members.length);
      im.frustumCulled = false;
      im.raycast = noRaycast;
      out[kind] = { mesh: im, members };
    }
    return out;
  }, [scene, critters]);
  useEffect(
    () => () => {
      for (const m of Object.values(meshes)) m?.mesh.dispose();
    },
    [meshes]
  );

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, dtRaw) => {
    const t = clock.elapsedTime;
    const dt = Math.min(0.1, dtRaw);
    const night = daylight < 0.3;
    // everyone on this map (the server's positions), the local player as they are this frame
    const threats: [number, number][] = [[cameraFocus.x, cameraFocus.z]];
    liveMotion.forEach((lm) => {
      if (lm.map === mapId) threats.push([lm.x, lm.z]);
    });
    for (const c of critters) {
      const k = KIND[c.kind];
      // the nearest person: too close, and it bolts
      let near = Infinity;
      let tx = 0;
      let tz = 0;
      for (const [px, pz] of threats) {
        const d = Math.hypot(px - c.x, pz - c.z);
        if (d < near) {
          near = d;
          tx = px;
          tz = pz;
        }
      }
      if (near < FLEE_R && c.mode !== "flee") {
        const spot = fleeSpot(mapId, c, tx, tz);
        if (spot) {
          c.mode = "flee";
          c.to = spot;
        } else if (c.mode !== "alert") {
          // cornered: it freezes, ears up
          c.mode = "alert";
          c.until = t + 1.2;
        }
      }
      if (c.mode === "move" || c.mode === "flee") {
        const dx = c.to.x - c.x;
        const dz = c.to.z - c.z;
        const d = Math.hypot(dx, dz);
        const pace = c.mode === "flee" ? k.run : k.walk;
        if (d < 0.05) {
          c.mode = c.mode === "flee" ? "alert" : "idle";
          c.until = t + (c.mode === "alert" ? 1.2 + Math.random() : 2 + Math.random() * 4);
          c.nibble = Math.random() < 0.55;
        } else {
          const step = Math.min(d, pace * dt);
          c.x += (dx / d) * step;
          c.z += (dz / d) * step;
          c.gait += step / k.step;
          // turn toward the way it's going (quick when bolting)
          const want = Math.atan2(dx, dz);
          let turn = want - c.yaw;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          c.yaw += turn * Math.min(1, dt * (c.mode === "flee" ? 14 : 5));
        }
      } else if (t >= c.until) {
        if (c.mode === "alert" && near < FLEE_R + 0.5) c.until = t + 0.8;
        else {
          const spot = wanderSpot(mapId, c);
          if (spot) {
            c.mode = "move";
            c.to = spot;
          } else {
            c.mode = "idle";
            c.until = t + 3;
          }
        }
      }
    }
    // draw each kind's instances
    for (const kind of Object.keys(meshes) as Kind[]) {
      const entry = meshes[kind];
      if (!entry) continue;
      const k = KIND[kind];
      const hidden = kind === "squirrel" && night;
      entry.mesh.visible = !hidden;
      if (hidden) continue;
      entry.members.forEach((c, i) => {
        const moving = c.mode === "move" || c.mode === "flee";
        const fleeing = c.mode === "flee";
        let lift = 0;
        let pitch = 0;
        let look = 0;
        if (moving) {
          const ph = c.gait % 1;
          if (kind === "deer") {
            // a walk's gentle bob, or bounding flat out
            lift = fleeing ? Math.sin(ph * Math.PI) * k.hop : Math.abs(Math.sin(ph * Math.PI * 2)) * 0.015;
            pitch = fleeing ? Math.sin(ph * Math.PI * 2) * 0.14 : 0;
          } else {
            // hops (a rabbit) or a scurry (a squirrel, low to the ground)
            lift = Math.sin(ph * Math.PI) * k.hop * (fleeing ? 1.4 : 1);
            pitch = (kind === "squirrel" ? 0.45 : 0.12) + Math.cos(ph * Math.PI) * 0.12;
          }
        } else if (c.mode === "alert") {
          // upright, looking back at whoever startled it
          pitch = kind === "deer" ? -0.05 : -0.12;
          look = Math.sin(t * 2.2 + c.seed) * 0.5;
        } else if (c.nibble) {
          // head down, nibbling the grass (the deer grazes, lifting its head now and then)
          const up = kind === "deer" ? Math.max(0, Math.sin(t * 0.45 + c.seed)) ** 12 : 0;
          pitch = (kind === "deer" ? 0.32 : 0.28) * (1 - up) + Math.sin(t * 13 + c.seed) * 0.025;
        } else {
          // sniffing the air: quick little bobs, a glance round
          pitch = Math.max(0, Math.sin(t * 9 + c.seed)) ** 3 * 0.08 - 0.04;
          look = Math.sin(t * 0.8 + c.seed * 2) * 0.35;
        }
        e.set(pitch, c.yaw + look, 0);
        q.setFromEuler(e);
        pos.set(c.x, lift, c.z);
        scl.setScalar(k.scale);
        m.compose(pos, q, scl);
        entry.mesh.setMatrixAt(i, m);
      });
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {Object.values(meshes).map((entry, i) => (entry ? <primitive key={i} object={entry.mesh} /> : null))}
    </>
  );
}

/** The map's wild critters (none where no homes are listed); a missing model shows nothing. */
export function WildCritters({ mapId }: { mapId: MapId }) {
  if (!HOMES[mapId]) return null;
  return (
    <ModelBoundary what="critters.glb" fallback={null}>
      <Suspense fallback={null}>
        <Critters mapId={mapId} />
      </Suspense>
    </ModelBoundary>
  );
}

useGLTF.preload(CRITTERS_URL);
