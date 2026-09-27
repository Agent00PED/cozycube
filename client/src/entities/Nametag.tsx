import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { makeNametag, type NametagTexture } from "./nametagCanvas";
import { noRaycast } from "../scene/kit";

const PLANE = new THREE.PlaneGeometry(1, 1);

/** A name drawn on a canvas texture (entities/nametagCanvas.ts), `size` world units per font size,
 *  centred on its group; `color` tints the letters (the outline stays black). */
export function Nametag({ text, size, color }: { text: string; size: number; color: string }) {
  const [tag, setTag] = useState<NametagTexture | null>(null);
  useEffect(() => {
    const made = makeNametag(text, setTag);
    setTag(made);
    return () => made.dispose();
  }, [text]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    if (!tag) return;
    material.map = tag.texture;
    material.needsUpdate = true;
  }, [material, tag]);
  useEffect(() => {
    material.color.set(color);
  }, [material, color]);
  if (!tag) return null;
  return <mesh geometry={PLANE} material={material} scale={[tag.w * size, tag.h * size, 1]} raycast={noRaycast} />;
}
