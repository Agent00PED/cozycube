import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MapId } from "@shared/types";
import { PIER_MIN_X } from "@shared/collision";
import { GEO, noRaycast } from "./kit";

// Little ambient animals. Purely client-side and decorative (never synced, never collide), each
// only a handful of meshes so they cost a few draw calls, not dozens.

const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });
const M = {
  crab: mat("#e2574a"),
  crabDark: mat("#b8392f"),
  eye: new THREE.MeshBasicMaterial({ color: "#1a1414" }),
  gull: mat("#f5f5f2"),
  gullGrey: mat("#aab2bb"),
  beak: mat("#f2b33c"),
  squirrel: mat("#b8643a"),
  squirrelBelly: mat("#f0d2b0"),
  owl: mat("#8a6a4a"),
  owlFace: mat("#e8d6b8"),
  owlEye: new THREE.MeshBasicMaterial({ color: "#ffd35c", toneMapped: false }),
  bark: mat("#4a3524", { roughness: 0.95 }),
};

/** Pairs of identical little parts (eyes, legs) as one geometry each. */
function pair(geo: THREE.BufferGeometry, xs: [number, number], y: number, z: number, s: [number, number, number]) {
  return mergeGeometries(
    xs.map((x) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
      return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(...s)));
    })
  )!;
}
const CRAB_EYES = pair(GEO.sphereLow, [-0.05, 0.05], 0.2, 0.08, [0.035, 0.035, 0.035]);
const GULL_LEGS = pair(GEO.cyl, [-0.04, 0.04], 0, 0, [0.015, 0.08, 0.015]);

export function Critters({ mapId }: { mapId: MapId }) {
  if (mapId === "sunset_beach")
    return (
      <>
        <Crab />
        <Seagull />
      </>
    );
  if (mapId === "campfire_night")
    return (
      <>
        <Squirrel />
        <Owl />
      </>
    );
  return null;
}

/** Scuttles sideways along the waterline, stopping now and then to wave its claws. */
function Crab() {
  const ref = useRef<THREE.Group>(null);
  const clawL = useRef<THREE.Mesh>(null);
  const clawR = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = ref.current;
    if (!g) return;
    // a slow back-and-forth with pauses: position follows a clamped sine
    const cycle = Math.sin(t * 0.28);
    const x = -6.2 + THREE.MathUtils.clamp(cycle * 1.4, -1, 1) * 1.8;
    const moving = Math.abs(cycle) < 0.7;
    g.position.set(x, 0, 4.35 + Math.sin(t * 0.5) * 0.08);
    g.position.y = moving ? Math.abs(Math.sin(t * 18)) * 0.015 : 0;
    const wave = moving ? 0 : Math.sin(t * 6) * 0.4;
    if (clawL.current) clawL.current.rotation.z = 0.4 + wave;
    if (clawR.current) clawR.current.rotation.z = -0.4 - wave;
  });
  return (
    <group ref={ref}>
      <mesh geometry={GEO.sphereLow} material={M.crab} position={[0, 0.09, 0]} scale={[0.3, 0.12, 0.22]} raycast={noRaycast} />
      <mesh ref={clawL} geometry={GEO.sphereLow} material={M.crabDark} position={[-0.18, 0.12, 0.1]} scale={[0.1, 0.07, 0.08]} raycast={noRaycast} />
      <mesh ref={clawR} geometry={GEO.sphereLow} material={M.crabDark} position={[0.18, 0.12, 0.1]} scale={[0.1, 0.07, 0.08]} raycast={noRaycast} />
      <mesh geometry={CRAB_EYES} material={M.eye} raycast={noRaycast} />
    </group>
  );
}

/** Perched on a pier post, looking about, with the odd flap. */
function Seagull() {
  const head = useRef<THREE.Group>(null);
  const wings = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (head.current) head.current.rotation.y = Math.sin(t * 0.7) * 0.8 * (Math.sin(t * 0.23) > 0 ? 1 : 0.2);
    if (wings.current) {
      const flap = (t % 9) < 0.8 ? Math.sin(t * 25) * 0.7 : 0;
      wings.current.children.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.1 + Math.abs(flap))));
    }
  });
  return (
    <group position={[PIER_MIN_X + 0.1, 0.64, 7.0]} rotation={[0, -0.6, 0]}>
      <mesh geometry={GEO.sphereLow} material={M.gull} position={[0, 0.12, 0]} scale={[0.18, 0.18, 0.34]} raycast={noRaycast} />
      <group ref={wings}>
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={GEO.sphereLow} material={M.gullGrey} position={[s * 0.09, 0.15, -0.02]} scale={[0.06, 0.1, 0.3]} raycast={noRaycast} />
        ))}
      </group>
      <group ref={head} position={[0, 0.27, 0.12]}>
        <mesh geometry={GEO.sphereLow} material={M.gull} scale={0.14} raycast={noRaycast} />
        <mesh geometry={GEO.cone} material={M.beak} position={[0, -0.01, 0.1]} rotation={[Math.PI / 2, 0, 0]} scale={[0.04, 0.1, 0.04]} raycast={noRaycast} />
      </group>
      <mesh geometry={GULL_LEGS} material={M.beak} raycast={noRaycast} />
    </group>
  );
}

/** Dashes between the firewood stack and a stump, pausing to sit up. */
function Squirrel() {
  const ref = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  const A = new THREE.Vector3(-2.9, 0.62, -4.3); // on top of the firewood stack
  const Bp = new THREE.Vector3(-1.6, 0, -3.2);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = ref.current;
    if (!g) return;
    const phase = (t * 0.12) % 1; // one round trip every ~8 s
    const leg = phase < 0.5 ? phase * 2 : (1 - phase) * 2; // 0 -> 1 -> 0
    const run = THREE.MathUtils.smoothstep(leg, 0.35, 0.65);
    g.position.lerpVectors(A, Bp, run);
    const moving = leg > 0.35 && leg < 0.65;
    g.position.y += moving ? Math.abs(Math.sin(t * 16)) * 0.12 : 0;
    g.rotation.y = Math.atan2(Bp.x - A.x, Bp.z - A.z) + (phase < 0.5 ? 0 : Math.PI);
    if (tail.current) tail.current.rotation.x = -0.5 + Math.sin(t * (moving ? 12 : 3)) * 0.2;
  });
  return (
    <group ref={ref}>
      <mesh geometry={GEO.sphereLow} material={M.squirrel} position={[0, 0.1, 0]} scale={[0.14, 0.16, 0.22]} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.squirrelBelly} position={[0, 0.09, 0.05]} scale={[0.09, 0.11, 0.12]} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.squirrel} position={[0, 0.2, 0.11]} scale={0.12} raycast={noRaycast} />
      <mesh ref={tail} geometry={GEO.sphereLow} material={M.squirrel} position={[0, 0.2, -0.15]} scale={[0.1, 0.3, 0.12]} raycast={noRaycast} />
    </group>
  );
}

/** A little owl on a bare snag at the edge of the clearing: blinks and swivels its head. */
function Owl() {
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (head.current) head.current.rotation.y = Math.round(Math.sin(t * 0.3) * 2) * 0.5;
    if (eyes.current) eyes.current.scale.y = (t % 4.5) < 0.15 ? 0.1 : 1;
  });
  return (
    <group position={[-6.6, 0, -6.4]}>
      {/* the snag */}
      <mesh geometry={GEO.cylTaper} material={M.bark} position={[0, 1.1, 0]} scale={[0.22, 2.2, 0.22]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.bark} position={[0.3, 1.8, 0.1]} rotation={[0, 0, -1.2]} scale={[0.07, 0.7, 0.07]} raycast={noRaycast} />
      <group position={[0.5, 1.92, 0.12]} rotation={[0, 0.7, 0]}>
        <mesh geometry={GEO.sphereLow} material={M.owl} position={[0, 0.12, 0]} scale={[0.22, 0.28, 0.2]} raycast={noRaycast} />
        <group ref={head} position={[0, 0.32, 0]}>
          <mesh geometry={GEO.sphereLow} material={M.owl} scale={[0.24, 0.2, 0.2]} raycast={noRaycast} />
          <mesh geometry={GEO.sphereLow} material={M.owlFace} position={[0, 0, 0.07]} scale={[0.2, 0.15, 0.08]} raycast={noRaycast} />
          <group ref={eyes}>
            {[-0.05, 0.05].map((x) => (
              <mesh key={x} geometry={GEO.sphereLow} material={M.owlEye} position={[x, 0.01, 0.11]} scale={0.05} raycast={noRaycast} />
            ))}
          </group>
          {[-0.08, 0.08].map((x) => (
            <mesh key={x} geometry={GEO.cone} material={M.owl} position={[x, 0.11, 0]} scale={[0.05, 0.08, 0.05]} raycast={noRaycast} />
          ))}
        </group>
      </group>
    </group>
  );
}
