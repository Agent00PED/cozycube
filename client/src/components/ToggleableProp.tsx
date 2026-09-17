import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { ToggleableSyncState } from "@shared/types";
import { GEO, noRaycast } from "../scene/kit";
import { useRetroScreen } from "./useRetroScreen";

interface ToggleablePropProps {
  prop: ToggleableSyncState;
  onUse: (prop: ToggleableSyncState) => void;
  /** True while anyone in the room is pulling an espresso — the machine steams. */
  brewing?: boolean;
}

// Every point light stays MOUNTED and is switched by intensity, never by conditional rendering.
// three.js bakes the number of lights into every lit material's shader; adding or removing a
// light forces the whole scene to recompile, which is a visible hitch on every toggle. Keeping
// the count constant makes flipping a lamp free.
const LIGHT_LERP = 0.18;

// Hit pads have to stay "visible" (R3F only raycasts visible objects), so they are hidden by
// writing nothing to colour or depth instead. One shared material for all of them.
const HIT_PAD_MATERIAL = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });

// Materials shared by every instance of a prop kind (dispose never needed: app lifetime).
const M = {
  black: mat("#111318", { roughness: 0.45 }),
  metal: mat("#9aa0a8", { roughness: 0.3, metalness: 0.7 }),
  brass: mat("#c9a24a", { roughness: 0.35, metalness: 0.7 }),
  walnut: mat("#4a2f1d", { roughness: 0.8 }),
  shadeOff: mat("#e8dcc6", { roughness: 0.9 }),
  cabinet: mat("#231a38", { roughness: 0.55 }),
  steam: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false }),
  ember: new THREE.MeshBasicMaterial({ color: "#ffb35c" }),
  flameOuter: new THREE.MeshBasicMaterial({ color: "#ff8a3d", toneMapped: false }),
  flameInner: new THREE.MeshBasicMaterial({ color: "#fff1b8", toneMapped: false }),
};

function HitPad({ size, position, onUse }: { size: [number, number, number]; position: [number, number, number]; onUse: () => void }) {
  return (
    <mesh
      geometry={GEO.box}
      material={HIT_PAD_MATERIAL}
      position={position}
      scale={size}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (e.button === 2) return; // right-drag pans the camera
        e.stopPropagation(); // don't also count as a floor click behind the prop
        onUse();
      }}
    />
  );
}

/** A light whose intensity eases toward on/off instead of popping. */
function SoftLight({ on, intensity, ...rest }: { on: boolean; intensity: number } & JSX.IntrinsicElements["pointLight"]) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (ref.current) ref.current.intensity = THREE.MathUtils.lerp(ref.current.intensity, on ? intensity : 0, LIGHT_LERP);
  });
  return <pointLight ref={ref} intensity={on ? intensity : 0} decay={2} {...rest} />;
}

/** An emissive material per prop instance, so its glow can follow its own on/off state. */
function useGlow(color: string, on: boolean, strength = 1.6) {
  const material = useMemo(() => mat("#f3ead8", { emissive: color, emissiveIntensity: 0 }), [color]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, on ? strength : 0, LIGHT_LERP);
  });
  return material;
}

export function ToggleableProp({ prop, onUse, brewing = false }: ToggleablePropProps) {
  const use = () => onUse(prop);
  switch (prop.kind) {
    case "campfire":
      return <Campfire prop={prop} onUse={use} />;
    case "tv":
      return <WallTV prop={prop} onUse={use} />;
    case "arcade":
      return <ArcadeCabinet prop={prop} onUse={use} />;
    case "espresso":
      return <EspressoMachine prop={prop} onUse={use} brewing={brewing} />;
    case "desk_lamp":
      return <DeskLamp prop={prop} onUse={use} />;
    case "lantern":
      return <Lantern prop={prop} onUse={use} />;
    default:
      return <FloorLamp prop={prop} onUse={use} />;
  }
}

type PropViewProps = { prop: ToggleableSyncState; onUse: () => void };

function WallTV({ prop, onUse }: PropViewProps) {
  const screen = useRetroScreen("pong", prop.color, prop.on, prop.x, prop.z);
  const screenMat = useMemo(() => new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }), [screen]);
  useEffect(() => () => screenMat.dispose(), [screenMat]);
  // 75" at this world scale: a 3.2 x 1.8 panel.
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh geometry={GEO.box} material={M.black} scale={[3.35, 1.95, 0.08]} castShadow raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={screenMat} position={[0, 0, 0.045]} scale={[3.2, 1.8, 1]} raycast={noRaycast} />
      <SoftLight on={prop.on} intensity={1.4} color={prop.color} position={[0, 0, 1.2]} distance={6} />
      <HitPad size={[3.4, 2.0, 0.5]} position={[0, 0, 0.2]} onUse={onUse} />
    </group>
  );
}

function FloorLamp({ prop, onUse }: PropViewProps) {
  const glow = useGlow(prop.color, prop.on, 1.2);
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh geometry={GEO.cyl} material={M.walnut} position={[0, 0.03, 0]} scale={[0.36, 0.06, 0.36]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.brass} position={[0, 0.8, 0]} scale={[0.04, 1.55, 0.04]} castShadow raycast={noRaycast} />
      <mesh geometry={GEO.cylTaper} material={glow} position={[0, 1.62, 0]} scale={[0.5, 0.36, 0.5]} raycast={noRaycast} />
      <SoftLight on={prop.on} intensity={1.6} color={prop.color} position={[0, 1.5, 0]} distance={5.5} />
      <HitPad size={[0.7, 1.9, 0.7]} position={[0, 0.95, 0]} onUse={onUse} />
    </group>
  );
}

function DeskLamp({ prop, onUse }: PropViewProps) {
  const glow = useGlow(prop.color, prop.on, 1.4);
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh geometry={GEO.cyl} material={M.black} position={[0, 0.015, 0]} scale={[0.18, 0.03, 0.18]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.black} position={[0.04, 0.2, 0]} rotation={[0, 0, -0.35]} scale={[0.025, 0.4, 0.025]} raycast={noRaycast} />
      <mesh geometry={GEO.cone} material={glow} position={[0.12, 0.38, 0]} rotation={[0, 0, 0.5]} scale={[0.2, 0.16, 0.2]} raycast={noRaycast} />
      <SoftLight on={prop.on} intensity={0.9} color={prop.color} position={[0.16, 0.3, 0]} distance={3} />
      <HitPad size={[0.5, 0.6, 0.5]} position={[0.05, 0.25, 0]} onUse={onUse} />
    </group>
  );
}

function Lantern({ prop, onUse }: PropViewProps) {
  const glow = useGlow(prop.color, prop.on, 2.2);
  const flameRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!flameRef.current) return;
    const f = prop.on ? 1 + Math.sin(clock.elapsedTime * 13) * 0.08 : 0.001;
    flameRef.current.scale.set(0.08 * f, 0.14 * f, 0.08 * f);
  });
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh geometry={GEO.cyl} material={M.black} position={[0, 0.03, 0]} scale={[0.26, 0.06, 0.26]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={glow} position={[0, 0.22, 0]} scale={[0.2, 0.32, 0.2]} raycast={noRaycast} />
      <mesh ref={flameRef} geometry={GEO.sphereLow} material={M.flameInner} position={[0, 0.22, 0]} raycast={noRaycast} />
      <mesh geometry={GEO.cone} material={M.black} position={[0, 0.44, 0]} scale={[0.28, 0.12, 0.28]} raycast={noRaycast} />
      <mesh geometry={GEO.torus} material={M.black} position={[0, 0.55, 0]} scale={[0.14, 0.14, 0.3]} raycast={noRaycast} />
      <SoftLight on={prop.on} intensity={1.5} color={prop.color} position={[0, 0.3, 0]} distance={5} />
      <HitPad size={[0.6, 0.8, 0.6]} position={[0, 0.3, 0]} onUse={onUse} />
    </group>
  );
}

function ArcadeCabinet({ prop, onUse }: PropViewProps) {
  const screen = useRetroScreen("invaders", prop.color, prop.on, prop.x, prop.z);
  const screenMat = useMemo(() => new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }), [screen]);
  useEffect(() => () => screenMat.dispose(), [screenMat]);
  const marquee = useGlow(prop.color, prop.on, 2.4);
  // Neon edge trim is lit even when the game is off, just dimmer — cabinets never look dead.
  const trim = useGlow(prop.color, true, prop.on ? 2 : 0.5);

  // Faces +Z (out from the back wall).
  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh geometry={GEO.box} material={M.cabinet} position={[0, 0.95, 0]} scale={[0.95, 1.9, 0.8]} castShadow receiveShadow raycast={noRaycast} />
      {[-0.48, 0.48].map((x) => (
        <mesh key={x} geometry={GEO.box} material={trim} position={[x, 0.95, 0.38]} scale={[0.03, 1.9, 0.03]} raycast={noRaycast} />
      ))}
      <mesh geometry={GEO.box} material={marquee} position={[0, 1.78, 0.37]} scale={[0.85, 0.22, 0.08]} raycast={noRaycast} />
      {/* screen bezel, tilted back */}
      <group position={[0, 1.33, 0.38]} rotation={[-0.22, 0, 0]}>
        <mesh geometry={GEO.box} material={M.black} scale={[0.82, 0.62, 0.04]} raycast={noRaycast} />
        <mesh geometry={GEO.plane} material={screenMat} position={[0, 0, 0.022]} scale={[0.72, 0.5, 1]} raycast={noRaycast} />
      </group>
      {/* control deck: joystick + buttons */}
      <mesh geometry={GEO.box} material={M.black} position={[0, 0.98, 0.52]} rotation={[0.35, 0, 0]} scale={[0.9, 0.08, 0.36]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.metal} position={[-0.22, 1.08, 0.52]} scale={[0.03, 0.14, 0.03]} raycast={noRaycast} />
      <mesh geometry={GEO.sphere} material={trim} position={[-0.22, 1.16, 0.52]} scale={0.08} raycast={noRaycast} />
      {[0.08, 0.2, 0.32].map((x) => (
        <mesh key={x} geometry={GEO.cyl} material={trim} position={[x, 1.04, 0.54]} rotation={[0.35, 0, 0]} scale={[0.07, 0.03, 0.07]} raycast={noRaycast} />
      ))}
      <HitPad size={[1.0, 2.0, 1.0]} position={[0, 1.0, 0.15]} onUse={onUse} />
    </group>
  );
}

const STEAM_PUFFS = 4;

function EspressoMachine({ prop, onUse, brewing }: PropViewProps & { brewing: boolean }) {
  const pilot = useGlow("#7dff9a", true, brewing ? 2.5 : 0.6);
  const steamRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const group = steamRef.current;
    if (!group) return;
    group.visible = brewing;
    if (!brewing) return;
    group.children.forEach((child, i) => {
      const p = (clock.elapsedTime * 0.9 + i / STEAM_PUFFS) % 1;
      child.position.set(Math.sin(p * 6 + i) * 0.04, 0.62 + p * 0.5, 0.05);
      child.scale.setScalar(0.05 + p * 0.1);
    });
  });

  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <mesh geometry={GEO.box} material={M.metal} position={[0, 0.27, -0.05]} scale={[0.62, 0.54, 0.46]} castShadow raycast={noRaycast} />
      <mesh geometry={GEO.box} material={M.black} position={[0, 0.56, -0.05]} scale={[0.66, 0.06, 0.5]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={M.black} position={[0, 0.02, 0.17]} scale={[0.5, 0.04, 0.2]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={M.black} position={[0, 0.34, 0.2]} scale={[0.14, 0.08, 0.14]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={M.black} position={[0, 0.34, 0.33]} scale={[0.05, 0.03, 0.2]} raycast={noRaycast} />
      <mesh geometry={GEO.sphere} material={pilot} position={[0.22, 0.44, 0.19]} scale={0.04} raycast={noRaycast} />
      {/* a cup waiting under the group head */}
      <mesh geometry={GEO.cyl} material={M.shadeOff} position={[0, 0.1, 0.19]} scale={[0.1, 0.1, 0.1]} raycast={noRaycast} />
      <group ref={steamRef} visible={false}>
        {Array.from({ length: STEAM_PUFFS }, (_, i) => (
          <mesh key={i} geometry={GEO.sphereLow} material={M.steam} raycast={noRaycast} />
        ))}
      </group>
      <HitPad size={[0.8, 0.8, 0.8]} position={[0, 0.35, 0.05]} onUse={onUse} />
    </group>
  );
}

// Reaches the whole seating ring (log benches sit 3.4 units out).
const FIRE_INTENSITY = 3.5;
const FIRE_DISTANCE = 14;
const EMBER_COUNT = 14;

function Campfire({ prop, onUse }: PropViewProps) {
  const lightRef = useRef<THREE.PointLight>(null);
  const flameRef = useRef<THREE.Group>(null);
  const embersRef = useRef<THREE.InstancedMesh>(null);
  const flareRef = useRef(0);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const embers = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, (_, i) => ({
        angle: (i / EMBER_COUNT) * Math.PI * 2,
        radius: 0.05 + (i % 4) * 0.06,
        speed: 0.55 + (i % 5) * 0.14,
        offset: i * 0.73,
      })),
    []
  );

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    // Firewood flare-up: ease toward 1 while boost time remains, then settle back down.
    flareRef.current = THREE.MathUtils.lerp(flareRef.current, prop.boost > 0 ? 1 : 0, Math.min(1, delta * (prop.boost > 0 ? 6 : 1.5)));
    const flare = flareRef.current;

    if (lightRef.current) {
      const flicker = Math.sin(t * 14) * 0.35 + Math.sin(t * 31) * 0.2;
      lightRef.current.intensity = prop.on ? FIRE_INTENSITY + flicker + flare * 3.5 : 0;
    }
    if (flameRef.current) {
      const s = 1 + Math.sin(t * 16) * 0.08;
      const grow = 1 + flare * 1.3;
      flameRef.current.scale.set(s * (1 + flare * 0.5), (1 + Math.sin(t * 11) * 0.12) * grow, s * (1 + flare * 0.5));
      flameRef.current.visible = prop.on;
    }
    const mesh = embersRef.current;
    if (mesh) {
      embers.forEach((e, i) => {
        const cycle = (t * e.speed * (1 + flare) + e.offset) % 2;
        const spread = e.radius * (1 + flare * 2);
        tmp.position.set(Math.cos(e.angle + t) * spread, 0.2 + cycle * (0.9 + flare * 1.2), Math.sin(e.angle + t) * spread);
        tmp.scale.setScalar(prop.on && cycle < 1.6 ? 0.035 * (1 - cycle / 2) : 0.0001);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group position={[prop.x, prop.y, prop.z]}>
      <group ref={flameRef} position={[0, 0.18, 0]}>
        <mesh geometry={GEO.cone} material={M.flameOuter} position={[0, 0.25, 0]} scale={[0.46, 0.62, 0.46]} raycast={noRaycast} />
        <mesh geometry={GEO.cone} material={M.flameInner} position={[0, 0.2, 0]} scale={[0.24, 0.4, 0.24]} raycast={noRaycast} />
      </group>
      <instancedMesh ref={embersRef} args={[GEO.sphereLow, M.ember, EMBER_COUNT]} frustumCulled={false} raycast={noRaycast} />
      <pointLight ref={lightRef} position={[0, 0.7, 0]} intensity={FIRE_INTENSITY} color={prop.color} distance={FIRE_DISTANCE} decay={2} />
      <HitPad size={[1.7, 1.4, 1.7]} position={[0, 0.6, 0]} onUse={onUse} />
    </group>
  );
}
