import * as THREE from "three";
import { noRaycast } from "./kit";

// The little lives drawn instanced from a world model's hidden templates (a node at the world's
// origin, named Fauna_<Name>; a wing's node origin is its shoulder): one draw per part for the whole
// flock, each instance tinted its own colour.

export interface Template {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** The part's own placement in the template (a wing's shoulder). */
  matrix: THREE.Matrix4;
}

/** The template `name` in `scene` (hidden from then on), or null while the model lacks it. */
export function template(scene: THREE.Object3D, name: string): Template | null {
  const node = scene.getObjectByName(name) as THREE.Mesh | undefined;
  if (!node) return null;
  node.visible = false;
  node.updateWorldMatrix(true, false);
  const mesh = (node.isMesh ? node : (node.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined)) ?? null;
  if (!mesh) return null;
  return { geometry: mesh.geometry, material: mesh.material as THREE.Material, matrix: node.matrixWorld.clone() };
}

/** `count` instances of a template, the i-th tinted `tints[i % tints.length]` (a CSS colour, or linear
 *  RGB: over 1 to lift a dark template). */
export function instanced(t: Template | null, count: number, tints: (string | readonly [number, number, number])[]) {
  if (!t || count <= 0) return null;
  const mesh = new THREE.InstancedMesh(t.geometry, t.material, count);
  mesh.frustumCulled = false;
  mesh.raycast = noRaycast;
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const tint = tints[i % tints.length];
    mesh.setColorAt(i, typeof tint === "string" ? c.set(tint) : c.setRGB(tint[0], tint[1], tint[2]));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh, t };
}
