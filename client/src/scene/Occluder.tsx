import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isOccludingLocalPlayer } from "./occlusion";
import { noMerge } from "./kit";

// The universal camera-occlusion fade. Wrap any tall thing (a roof, a tree crown, a screen, a
// lighting truss) in this and it dissolves to an ordered 25% screen-door whenever it stands
// between the camera and the local player, so the avatar is never hidden. Dithering rather
// than alpha: the materials stay opaque, so depth, shadows and sort order are untouched and
// nothing sparkles through the object's own faces.
//
// The group opts out of the world's StaticBatch (it has to keep its own draw calls to fade on
// its own), so it batches itself: on mount every plain mesh under it is merged into one mesh
// per material, and each of those gets a private clone of its material with the dither
// patched in. Instanced meshes are left as they are and patched in place.

const FADED = 0.25;
const LERP = 0.14;

function patch(material: THREE.Material, fade: { value: number }): THREE.Material {
  const clone = material.clone();
  clone.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = fade;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", ["#include <common>", "uniform float uFade;"].join("\n"))
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
         if (uFade < 0.999) {
           vec2 p = mod(gl_FragCoord.xy, 4.0);
           float threshold = (mod(p.x + p.y * 2.0 + floor(p.y / 2.0) * 3.0, 8.0) + 0.5) / 8.0;
           if (uFade < threshold) discard;
         }`
      );
  };
  // the patched program is keyed by this, or three would reuse the unpatched one
  clone.customProgramCacheKey = () => "occluder";
  clone.needsUpdate = true;
  return clone;
}

export function Occluder({ x, z, halfWidth, points, children }: { x: number; z: number; halfWidth: number; /** Several footprints sharing one fade (a row of tree crowns): fades when any of them occludes. */ points?: { x: number; z: number }[]; children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const fade = useMemo(() => ({ value: 1 }), []);

  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const made: THREE.Material[] = [];
    const created: THREE.Mesh[] = [];
    const hidden: THREE.Mesh[] = [];
    const buckets = new Map<string, { material: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        const clone = patch(mesh.material as THREE.Material, fade);
        mesh.material = clone;
        made.push(clone);
        return;
      }
      const material = mesh.material as THREE.Material;
      const key = `${material.uuid}|${mesh.castShadow}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material, cast: mesh.castShadow, recv: true, geos: [] };
        buckets.set(key, bucket);
      }
      let geo = mesh.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") geo.deleteAttribute(name);
      if (!geo.getAttribute("normal")) geo.computeVertexNormals();
      if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
      if (!geo.index) geo = mergeVertices(geo);
      bucket.geos.push(geo);
      hidden.push(mesh);
    });
    for (const bucket of buckets.values()) {
      const merged = mergeGeometries(bucket.geos, false);
      bucket.geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const clone = patch(bucket.material, fade);
      made.push(clone);
      const mesh = new THREE.Mesh(merged, clone);
      mesh.castShadow = bucket.cast;
      mesh.receiveShadow = bucket.recv;
      mesh.raycast = () => null;
      mesh.userData.merged = true;
      root.add(mesh);
      created.push(mesh);
    }
    hidden.forEach((m) => (m.visible = false));
    return () => {
      created.forEach((m) => {
        root.remove(m);
        m.geometry.dispose();
      });
      hidden.forEach((m) => (m.visible = true));
      made.forEach((m) => m.dispose());
    };
  }, [fade]);

  useFrame(() => {
    const hit = points ? points.some((p) => isOccludingLocalPlayer(p.x, p.z, halfWidth)) : isOccludingLocalPlayer(x, z, halfWidth);
    const goal = hit ? FADED : 1;
    if (Math.abs(goal - fade.value) > 0.002) fade.value += (goal - fade.value) * LERP;
  });

  return (
    <group ref={groupRef} userData={noMerge}>
      {children}
    </group>
  );
}
