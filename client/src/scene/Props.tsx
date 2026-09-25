import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { MapId, ToggleableSyncState } from "@shared/types";
import { mochiSpot } from "@shared/props";
import { MochiModel, restDrive, type MochiDrive } from "../entities/Mochi";
import { GEO, matte, noRaycast } from "./kit";
import { useLampBoost } from "./timeOfDay";

// The lounge's interactive props, drawn from the server's synced state: the floor lamps (click to
// switch them) and Mochi, who lives her day on the wall clock and opens her playroom when clicked.

// A hit pad is invisible but raycastable: R3F skips `visible={false}` OBJECTS when raycasting, so
// the MATERIAL is what is hidden. The renderer drops a mesh whose material is invisible.
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const LIGHT_LERP = 0.18;

function HitPad({ size, position, onUse }: { size: [number, number, number]; position: [number, number, number]; onUse: () => void }) {
  return (
    <mesh
      geometry={GEO.box}
      material={HIT}
      position={position}
      scale={size}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0) return; // only the left button clicks; right and middle drag the camera
        e.stopPropagation(); // don't also count as a floor click behind the prop
        onUse();
      }}
    />
  );
}

const BASE = matte("#5a3a24", 0.85);
const STAND = matte("#b08d57", 0.7, { metalness: 0.1 });

/** A floor lamp: a walnut foot, a brass stand and a glowing linen shade with its warm light. */
export function FloorLamp({ prop, onUse }: { prop: ToggleableSyncState; onUse: () => void }) {
  const boost = useLampBoost();
  const boostRef = useRef(boost);
  boostRef.current = boost;
  const light = useRef<THREE.PointLight>(null);
  const shade = useMemo(() => matte("#f3e6cf", 0.85, { emissive: prop.color, emissiveIntensity: 0 }), [prop.color]);
  useEffect(() => () => shade.dispose(), [shade]);
  useFrame(() => {
    shade.emissiveIntensity = THREE.MathUtils.lerp(shade.emissiveIntensity, prop.on ? 1.3 : 0, LIGHT_LERP);
    if (light.current) light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, prop.on ? 1.7 * boostRef.current : 0, LIGHT_LERP);
  });
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh geometry={GEO.cyl} material={BASE} position={[0, 0.03, 0]} scale={[0.34, 0.06, 0.34]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={STAND} position={[0, 0.78, 0]} scale={[0.04, 1.5, 0.04]} raycast={noRaycast} />
      <mesh geometry={GEO.cylTaper} material={shade} position={[0, 1.6, 0]} scale={[0.5, 0.36, 0.5]} raycast={noRaycast} />
      <pointLight ref={light} color={prop.color} intensity={prop.on ? 1.7 * boost : 0} distance={6} decay={2} position={[0, 1.5, 0]} castShadow={false} />
      <HitPad size={[0.7, 1.9, 0.7]} position={[0, 0.95, 0]} onUse={onUse} />
    </group>
  );
}

const lerpAngle = (from: number, to: number, k: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
};

/**
 * The world cat. Her whole day comes from `mochiSpot` (shared/props.ts), read off the wall clock
 * every frame, so the server, the dock's reach and this model put her in the same place: the
 * hearth rug, the window bay, the kitchen mat; loafing, washing a paw, stretching, waddling.
 */
export function Cat({ mapId, onUse }: { mapId: MapId; onUse: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const drive = useRef<MochiDrive>(restDrive());
  const placed = useRef(false);
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const s = mochiSpot(mapId, Date.now() / 1000);
    g.position.set(s.x, 0, s.z);
    // the first frame snaps to her heading; after that she turns in a smooth arc
    g.rotation.y = placed.current ? lerpAngle(g.rotation.y, s.heading, 0.12) : s.heading;
    placed.current = true;
    const d = drive.current;
    d.walking = s.phase === "walk";
    d.lick = s.phase === "lick" ? s.t : 0;
    d.stretch = s.phase === "stretch" ? s.t : 0;
  });
  return (
    <group ref={groupRef}>
      {/* the model is authored at diorama scale (about 0.7 long), so it needs no enlarging */}
      <MochiModel drive={drive} />
      <HitPad size={[0.7, 0.7, 0.9]} position={[0, 0.27, 0]} onUse={onUse} />
    </group>
  );
}

/** The games table's click target: an invisible pad over the table top and its board. */
export function BoardTablePad({ prop, onUse }: { prop: ToggleableSyncState; onUse: () => void }) {
  return <HitPad size={[1.3, 0.8, 1.3]} position={[prop.x, 0.4, prop.z]} onUse={onUse} />;
}

/** A walk-up prop's click target (the coffee machine, a plant): an invisible pad of `size` over it, its base at `y`. */
export function PropPad({ prop, size, onUse }: { prop: ToggleableSyncState; size: [number, number, number]; onUse: () => void }) {
  return <HitPad size={size} position={[prop.x, prop.y + size[1] / 2, prop.z]} onUse={onUse} />;
}

// --- the radio's music notes -------------------------------------------------------------------

const NOTE_COLORS = ["#f4b6e0", "#a8d8ea", "#fff3a8", "#c9f2a8", "#d5aaff"].map((c) => matte(c, 0.7));
const NOTE_HEAD = new THREE.SphereGeometry(1, 12, 8);
const NOTE_STEM = new THREE.CylinderGeometry(1, 1, 1, 6);
const NOTE_FLAG = new THREE.BoxGeometry(1, 1, 1);
const NOTE_COUNT = 6;
const NOTE_LIFE = 3.2; // seconds from the radio up into the air

/** One note: a "♪" (a head, a stem and a flag) or a beamed "♫" (two heads and stems, one beam). */
function NoteShape({ beamed, m }: { beamed: boolean; m: THREE.Material }) {
  const heads = beamed ? [-0.04, 0.04] : [0];
  return (
    <group>
      {heads.map((x, i) => (
        <group key={i} position={[x, i * 0.015, 0]}>
          <mesh geometry={NOTE_HEAD} material={m} scale={[0.028, 0.022, 0.022]} rotation={[0, 0, 0.4]} raycast={noRaycast} />
          <mesh geometry={NOTE_STEM} material={m} position={[0.024, 0.06, 0]} scale={[0.006, 0.12, 0.006]} raycast={noRaycast} />
        </group>
      ))}
      {beamed ? <mesh geometry={NOTE_FLAG} material={m} position={[0.024, 0.125, 0]} rotation={[0, 0, 0.2]} scale={[0.1, 0.018, 0.012]} raycast={noRaycast} /> : <mesh geometry={NOTE_FLAG} material={m} position={[0.042, 0.105, 0]} rotation={[0, 0, -0.7]} scale={[0.045, 0.014, 0.01]} raycast={noRaycast} />}
    </group>
  );
}

/**
 * The radio's click target, and while it plays, pastel music notes floating up out of it: each
 * rises and drifts over NOTE_LIFE seconds, swelling in and shrinking away (no fading: every
 * material stays opaque), and they all stop the moment the radio does.
 */
export function RadioProp({ prop, onUse }: { prop: ToggleableSyncState; onUse: () => void }) {
  const notes = useRef<(THREE.Group | null)[]>([]);
  const playing = useRef(prop.on);
  playing.current = prop.on;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    notes.current.forEach((g, i) => {
      if (!g) return;
      if (!playing.current) {
        g.visible = false;
        return;
      }
      const life = ((t / NOTE_LIFE + i / NOTE_COUNT) % 1 + 1) % 1;
      g.visible = true;
      const side = i % 2 === 0 ? 1 : -1;
      g.position.set(Math.sin(life * Math.PI * 1.5 + i) * 0.18 * side + side * 0.05, 0.3 + life * 1.1, Math.cos(life * Math.PI + i * 1.3) * 0.12);
      g.rotation.z = Math.sin(t * 2 + i) * 0.25;
      g.scale.setScalar(Math.sin(Math.PI * Math.min(1, life * 1.15)) * 1.1 + 0.001);
    });
  });
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      {Array.from({ length: NOTE_COUNT }, (_, i) => (
        <group key={i} ref={(g) => (notes.current[i] = g)} visible={false}>
          <NoteShape beamed={i % 3 === 1} m={NOTE_COLORS[i % NOTE_COLORS.length]} />
        </group>
      ))}
      <HitPad size={[0.45, 0.45, 0.35]} position={[0, 0.2, 0]} onUse={onUse} />
    </group>
  );
}

// --- watering a plant: a stream of drops from the can, then star sparkles -------------------------

const DROP_MAT = matte("#8fd0f2", 0.7, { emissive: "#5fb8e8", emissiveIntensity: 0.35 });
const SPARKLE_MAT = new THREE.MeshBasicMaterial({ color: "#ffd166", toneMapped: false, side: THREE.DoubleSide });
const DROP_GEO = new THREE.SphereGeometry(1, 8, 6);
/** A four-pointed twinkle (the ✨ shape): long points on the axes, pinched in between. */
function twinkleShape() {
  const s = new THREE.Shape();
  const pinch = 0.14;
  s.moveTo(0, 1);
  s.quadraticCurveTo(pinch, pinch, 1, 0);
  s.quadraticCurveTo(pinch, -pinch, 0, -1);
  s.quadraticCurveTo(-pinch, -pinch, -1, 0);
  s.quadraticCurveTo(-pinch, pinch, 0, 1);
  return s;
}
const SPARKLE_GEO = new THREE.ShapeGeometry(twinkleShape(), 5);
const DROPS = 16;
const SPARKLES = 12;
// The pour, timed to the waterer's "water" gesture (Avatar.tsx): the can tips once the arm is out
// (POUR_START), drops leave the spout for POUR_SECONDS and each takes DROP_FALL to land, so the
// stream runs one second in all; then the sparkles pop, each living SPARKLE_LIFE.
const POUR_START = 0.4;
const POUR_SECONDS = 0.6;
const DROP_FALL = 0.4;
const SPARKLE_START = POUR_START + POUR_SECONDS + DROP_FALL - 0.1;
const SPARKLE_LIFE = 1.1;
/** How long a splash lasts; the scene removes it after this. */
export const PLANT_BURST_SECONDS = SPARKLE_START + 0.35 + SPARKLE_LIFE + 0.1;
/** The pot's soil; the can's spout, this far out in front of the waterer, at this height while pouring. */
const SOIL_Y = 0.38;
const SPOUT_REACH = 0.5;
const SPOUT_Y = 0.44;
/** The spout never sits inside the pot: at the closest, just over its rim. */
const SPOUT_MIN = 0.26;

/**
 * The splash over a watered plant, started at `at` (performance.now ms). `from` is where the
 * waterer stands: a stream of soft blue drops arcs from their can's spout, out in front of them,
 * down onto the soil (under the canopy, where the camera sees it), for one second; then golden
 * four-pointed sparkles pop round the outside of the whole plant, facing the camera, and twinkle
 * away. Driven by the frame clock (no timers of its own).
 */
export function PlantBurst({ x, z, from, at }: { x: number; z: number; from?: { x: number; z: number }; at: number }) {
  const drops = useRef<(THREE.Mesh | null)[]>([]);
  const sparkles = useRef<(THREE.Mesh | null)[]>([]);
  // the spout, relative to the plant: toward the waterer (the camera's side when unknown)
  const spout = useMemo(() => {
    const dx = from ? from.x - x : 1;
    const dz = from ? from.z - z : 1;
    const d = Math.hypot(dx, dz) || 1;
    const out = Math.max(SPOUT_MIN, from ? d - SPOUT_REACH : SPOUT_MIN);
    return { x: (dx / d) * out, z: (dz / d) * out };
  }, [from, x, z]);
  const seeds = useMemo(
    () => ({
      drops: Array.from({ length: DROPS }, (_, i) => ({ d: POUR_START + (i / DROPS) * POUR_SECONDS, jx: (Math.random() - 0.5) * 0.12, jz: (Math.random() - 0.5) * 0.12 })),
      sparkles: Array.from({ length: SPARKLES }, (_, i) => ({ a: (i / SPARKLES) * Math.PI * 2 + Math.random() * 0.4, y: 0.7 + (i % 4) * 0.42 + Math.random() * 0.15, r: 0.62 + Math.random() * 0.2, d: Math.random() * 0.35, spin: Math.random() * Math.PI })),
    }),
    []
  );
  useFrame(({ camera }) => {
    const age = (performance.now() - at) / 1000;
    drops.current.forEach((m, i) => {
      if (!m) return;
      const s = seeds.drops[i];
      const u = (age - s.d) / DROP_FALL;
      m.visible = u > 0 && u < 1;
      if (!m.visible) return;
      // out of the spout in a little arc, over the rim, down onto the soil
      m.position.set(spout.x * (1 - u) + s.jx * u, SPOUT_Y + (SOIL_Y - SPOUT_Y) * u * u + 0.1 * Math.sin(Math.PI * u), spout.z * (1 - u) + s.jz * u);
      m.scale.set(0.05, 0.075, 0.05);
    });
    sparkles.current.forEach((m, i) => {
      if (!m) return;
      const s = seeds.sparkles[i];
      const u = (age - SPARKLE_START - s.d) / SPARKLE_LIFE;
      m.visible = u > 0 && u < 1;
      if (!m.visible) return;
      const r = s.r + 0.25 * u;
      m.position.set(Math.cos(s.a) * r, s.y + 0.35 * u, Math.sin(s.a) * r);
      // flat twinkles turned to the camera, spinning a little as they swell and fade
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(s.spin + u * 2.5);
      m.scale.setScalar(0.13 * Math.sin(Math.PI * u) * (0.75 + 0.35 * Math.sin(u * 28 + i)));
    });
  });
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: DROPS }, (_, i) => (
        <mesh key={`d${i}`} ref={(m) => (drops.current[i] = m)} geometry={DROP_GEO} material={DROP_MAT} visible={false} raycast={noRaycast} />
      ))}
      {Array.from({ length: SPARKLES }, (_, i) => (
        <mesh key={`s${i}`} ref={(m) => (sparkles.current[i] = m)} geometry={SPARKLE_GEO} material={SPARKLE_MAT} visible={false} raycast={noRaycast} />
      ))}
    </group>
  );
}

// --- the campfire: a puff of smoke off a burnt skewer, a splash and sparkles off a catch -----------

const SMOKE_MAT = matte("#6f6a66", 0.95);
/** How long a puff lasts; the scene removes it after this. */
export const PUFF_SECONDS = 1.6;

/**
 * A little effect at a point, started at `at` (performance.now ms): "smoke" (grey clay puffs
 * rising and swelling, off a skewer left too long in the fire) or "splash" (drops thrown up off
 * the water and golden twinkles, a catch coming out of the pond). Driven by the frame clock.
 */
export function CampfirePuff({ x, y, z, kind, at }: { x: number; y: number; z: number; kind: "smoke" | "splash"; at: number }) {
  const bits = useRef<(THREE.Mesh | null)[]>([]);
  const seeds = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2 + Math.random() * 0.5, r: 0.05 + Math.random() * 0.15, d: Math.random() * 0.3, up: 0.6 + Math.random() * 0.6 })), []);
  useFrame(({ camera }) => {
    const age = (performance.now() - at) / 1000;
    bits.current.forEach((m, i) => {
      if (!m) return;
      const s = seeds[i];
      const u = (age - s.d) / (kind === "smoke" ? 1.2 : 0.8);
      m.visible = u > 0 && u < 1;
      if (!m.visible) return;
      if (kind === "smoke") {
        m.position.set(Math.cos(s.a) * s.r * (1 + u * 2), u * s.up * 1.2, Math.sin(s.a) * s.r * (1 + u * 2));
        m.scale.setScalar(0.05 + 0.12 * u * (1 - u * 0.6));
      } else if (i % 2 === 0) {
        // a drop: thrown up off the water and back down
        m.position.set(Math.cos(s.a) * s.r * 2 * u, s.up * 1.8 * (u - u * u), Math.sin(s.a) * s.r * 2 * u);
        m.scale.set(0.03, 0.045, 0.03);
      } else {
        // a twinkle, turned to the camera
        m.position.set(Math.cos(s.a) * (0.15 + 0.3 * u), 0.25 + 0.4 * u, Math.sin(s.a) * (0.15 + 0.3 * u));
        m.quaternion.copy(camera.quaternion);
        m.scale.setScalar(0.08 * Math.sin(Math.PI * u));
      }
    });
  });
  return (
    <group position={[x, y, z]}>
      {seeds.map((_, i) => {
        const twinkle = kind === "splash" && i % 2 === 1;
        return <mesh key={i} ref={(m) => (bits.current[i] = m)} geometry={twinkle ? SPARKLE_GEO : DROP_GEO} material={kind === "smoke" ? SMOKE_MAT : twinkle ? SPARKLE_MAT : DROP_MAT} visible={false} raycast={noRaycast} />;
      })}
    </group>
  );
}

/** A seat's click target: an invisible pad over the cushion. */
export function SeatPad({ x, z, wide, onUse }: { x: number; z: number; wide: boolean; onUse: () => void }) {
  return <HitPad size={wide ? [1.05, 0.9, 1.05] : [0.6, 1.0, 0.6]} position={[x, wide ? 0.45 : 0.5, z]} onUse={onUse} />;
}
