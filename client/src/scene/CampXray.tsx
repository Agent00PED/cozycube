import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { MapId } from "@shared/types";
import { TITAN, type TreeKind, type TreeSync } from "@shared/chop";
import { walkY } from "@shared/collision";
import { FELL_TREES, drawnSize, type FellTree } from "@shared/worlds/trees";
import { cameraFocus } from "./cameraFocus";
import { OcclusionIndex, xrayGate } from "./occlusion";

// The x-ray's gate on the camp maps (scene/occlusion.ts; the caverns keep their own in CavernsWorld):
// your silhouette is a second draw of every part of your avatar (some twenty-seven draw calls), so it
// is drawn only while something stands between you and the camera. Five times a second three lines
// are looked along, from your shins, chest and head toward the camera, against:
//   - the model's still things taller than the undergrowth (an occlusion index of their triangles),
//   - the trees you fell, which the game draws itself (each grown one a cone or a crown, by its look),
//   - the ground (a hill between you and the camera).

/** How far toward the camera a line is looked along, and at how many points the trees and the
 *  ground are tried. */
const REACH = 9;
const STEPS = 12;
/** What hides nobody: anything that does not stand this far over the ground under it (grass, ferns,
 *  flowers, stones: most of the model's triangles). */
const UNDERGROWTH = 0.7;

/** A grown tree as something that hides you: a cone (a conifer: its foot's radius, where its boughs
 *  begin and its top) or a crown (a round mass between two heights), all at size 1. */
type Shape = { cone: true; r: number; y0: number; top: number } | { cone: false; r: number; y0: number; top: number };
const SHAPES: Record<TreeKind | "spruce", Shape> = {
  soft_pine: { cone: true, r: 1.1, y0: 0.6, top: 3.2 },
  spruce: { cone: true, r: 0.8, y0: 0.5, top: 3.4 },
  cedar: { cone: true, r: 1.4, y0: 0.9, top: 5.3 },
  birch: { cone: false, r: 1.25, y0: 1.6, top: 4.3 },
  maple: { cone: false, r: 2.3, y0: 1.9, top: 5.1 },
  elderwood: { cone: false, r: 4.4, y0: 2.6, top: 8.7 },
  palm: { cone: false, r: 1.6, y0: 3.2, top: 5.2 },
};

export function CampXray({ url, mapId, prefixes, trees }: { /** The world's model (the one the world itself loads: shared). */ url: string; mapId: MapId; /** The model's still meshes, by the start of their (or their parent's) name. */ prefixes: string[]; trees: Record<string, TreeSync> }) {
  const camera = useThree((s) => s.camera);
  const { scene } = useGLTF(url);
  useEffect(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh && prefixes.some((p) => mesh.name.startsWith(p) || !!mesh.parent?.name.startsWith(p))) meshes.push(mesh);
    });
    xrayGate.index = meshes.length ? new OcclusionIndex(meshes, 1.5, (x, y, z) => y > walkY(mapId, x, z) + UNDERGROWTH) : null;
    xrayGate.occluded = false;
    return () => {
      xrayGate.index = null;
      xrayGate.occluded = true;
    };
  }, [scene, mapId, prefixes]);

  const nodes = useMemo(() => FELL_TREES.filter((t) => t.map === mapId), [mapId]);
  const live = useRef(trees);
  live.current = trees;
  const next = useRef(0);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), dir: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const idx = xrayGate.index;
    if (!idx || clock.elapsedTime < next.current) return;
    next.current = clock.elapsedTime + 0.2;
    camera.getWorldDirection(tmp.dir).negate();
    // the grown trees near enough to stand in the way
    const near: { t: FellTree; s: number; shape: Shape }[] = [];
    for (const t of nodes) {
      const sync = live.current[t.id];
      if (t.titan ? !sync : false) continue;
      if ((sync?.stage ?? "mature") !== "mature") continue;
      if (Math.hypot(t.x - cameraFocus.x, t.z - cameraFocus.z) > REACH + 5) continue;
      const kind = t.titan ? (sync?.kind ?? t.kind) : t.kind;
      near.push({ t, s: t.titan ? TITAN.scale : drawnSize(t, sync?.scale ?? 1), shape: SHAPES[t.look === "spruce" ? "spruce" : kind] });
    }
    let hidden = false;
    for (const h of [0.5, 0.95, 1.45]) {
      tmp.a.set(cameraFocus.x, cameraFocus.y + h, cameraFocus.z);
      tmp.b.copy(tmp.a).addScaledVector(tmp.dir, REACH);
      if (idx.blocked(tmp.a, tmp.b)) hidden = true;
      for (let k = 1; k <= STEPS && !hidden; k++) {
        const u = k / STEPS;
        const x = tmp.a.x + (tmp.b.x - tmp.a.x) * u;
        const y = tmp.a.y + (tmp.b.y - tmp.a.y) * u;
        const z = tmp.a.z + (tmp.b.z - tmp.a.z) * u;
        if (y < walkY(mapId, x, z) - 0.05) hidden = true;
        for (const { t, s, shape } of near) {
          const up = (y - t.y) / s;
          if (up < shape.y0 || up > shape.top) continue;
          const r = shape.cone ? shape.r * (1 - (up - shape.y0) / (shape.top - shape.y0)) : shape.r;
          if (Math.hypot(x - t.x, z - t.z) < r * s + 0.1) {
            hidden = true;
            break;
          }
        }
      }
      if (hidden) break;
    }
    xrayGate.occluded = hidden;
  });
  return null;
}
