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

/** A seat's click target: an invisible pad over the cushion. */
export function SeatPad({ x, z, wide, onUse }: { x: number; z: number; wide: boolean; onUse: () => void }) {
  return <HitPad size={wide ? [1.05, 0.9, 1.05] : [0.6, 1.0, 0.6]} position={[x, wide ? 0.45 : 0.5, z]} onUse={onUse} />;
}
