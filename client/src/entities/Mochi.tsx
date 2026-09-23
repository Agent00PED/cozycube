import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GEO, StaticBatch, arcGeo, noRaycast } from "../scene/kit";

// Mochi: one lovingly sculpted, seamless loaf cat. Shared by the cat in every world
// (components/LivingProps `Cat`) and the playroom's own little viewport
// (entities/MochiPlayroomModal).
//
// How she stays watertight:
//   - The loaf rests flush on the floor (its belly touches y = 0, never below it). Her tabby
//     stripes and cream chest are VERTEX COLOURS painted into the loaf's own geometry, so
//     there is no marking mesh anywhere above her back.
//   - The head is sunk into the loaf's front and a neck sphere fills the crease between them,
//     so the profile is one curve from ears to rump.
//   - The paws grow out of a cream chest bulge that is itself buried in the underbelly; their
//     back halves sit inside it, so they cannot float.
//   - The tail starts from a root sunk in the rump and curls round her side along the floor.
//   - Ears are cones sunk into the skull; the closed eyes, nose, blush, smile and whiskers are
//     laid on the face and merged with it.
//
// Whoever mounts her drives her through a `MochiDrive` ref, written every frame by the owner
// and read here: the world cat fills it from her wall-clock day (mochiSpot: hearthrug ->
// window bay -> hearthrug -> kitchen mat, loafing, stretching, waddling, washing), the
// playroom from the feather, the treat and the scritches.

export interface MochiDrive {
  /** 0..1 how much she is stretched out (the yawn opens near the top of it). */
  stretch: number;
  /** 0..1 paw-washing; the tongue and one paw follow it. */
  lick: number;
  /** Waddling: bob and rock the body, tail up. */
  walking: boolean;
  /** Being fussed over: the happy sway and the purring tail. */
  happy: boolean;
  /** Where she is looking, radians about y (left/right) and x (down/up). */
  headYaw: number;
  headPitch: number;
  /** 0..1 a pounce: crouch then spring. */
  pounce: number;
  /** 0..1 chewing a treat. */
  chew: number;
}

export const restDrive = (): MochiDrive => ({ stretch: 0, lick: 0, walking: false, happy: false, headYaw: 0, headPitch: 0, pounce: 0, chew: 0 });

// Her palette: warm orange fur, vanilla cream, a darker tabby brown, and soft pinks. All matte.
const ORANGE = "#e89a52";
const CREAM = "#f6e2c4";
const DARK = "#b8703a";
const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
const M = {
  orange: mat(ORANGE),
  cream: mat(CREAM),
  dark: mat(DARK),
  pink: mat("#e88a8a"),
  blush: mat("#f6a5b5", { roughness: 1 }),
  mouth: mat("#7a2a3a", { roughness: 1 }),
  whisker: mat("#f6efe4", { roughness: 1 }),
  /** The loaf: its colour comes from the geometry below. */
  loaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
};

const smooth = (a: number, b: number, v: number) => {
  const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The loaf: a smooth unit sphere with her markings painted into its vertex colours. */
const LOAF_GEO = (() => {
  const g = new THREE.SphereGeometry(0.5, 56, 36);
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const orange = new THREE.Color(ORANGE);
  const dark = new THREE.Color(DARK);
  const cream = new THREE.Color(CREAM);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    c.copy(orange);
    // tabby stripes: three soft bands across the back that fade out down the flanks
    let band = 0;
    for (const zc of [-0.3, -0.12, 0.06]) band = Math.max(band, Math.exp(-(((z - zc) / 0.05) ** 2)));
    const back = smooth(0.0, 0.3, y) * (1 - smooth(0.22, 0.44, Math.abs(x)));
    c.lerp(dark, band * back * 0.85);
    // the cream chest and belly: the lower front, softly feathered into the orange
    const chest = smooth(0.05, 0.28, z * 1.2 - y * 0.6 - 0.15);
    c.lerp(cream, chest);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
})();

const TAIL = arcGeo(0.17, 0.045, Math.PI * 0.95);
const EYE = arcGeo(0.032, 0.008, Math.PI);
const SMILE = arcGeo(0.02, 0.006, Math.PI);

/** Where the head rests (its sphere sinks into the loaf's front top). */
const HEAD_Y = 0.31;
/** Where the paws rest: on the floor, growing out of the chest bulge. */
const PAW_Y = 0.05;
const PAW_Z = 0.24;

export function MochiModel({ drive, children }: { drive: React.MutableRefObject<MochiDrive>; children?: React.ReactNode }) {
  const bodyRef = useRef<THREE.Group>(null);
  const loafRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const earLRef = useRef<THREE.Group>(null);
  const earRRef = useRef<THREE.Group>(null);
  const yawnRef = useRef<THREE.Mesh>(null);
  const tongueRef = useRef<THREE.Mesh>(null);
  const pawLRef = useRef<THREE.Mesh>(null);
  const pawRRef = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => Math.random() * 7, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const d = drive.current;
    const L = THREE.MathUtils.lerp;
    const stretchK = Math.sin(Math.min(1, d.stretch) * Math.PI);
    const pounceK = d.pounce; // 0 rest .. 0.5 crouched .. 1 sprung
    const crouch = Math.sin(Math.min(0.5, pounceK) * Math.PI); // crouches through the first half
    const spring = pounceK > 0.5 ? Math.sin((pounceK - 0.5) * Math.PI) : 0;
    const body = bodyRef.current;
    const loaf = loafRef.current;
    if (body && loaf) {
      const breath = Math.sin(t * (d.happy ? 5 : 1.4)) * 0.03;
      const waddle = d.walking ? Math.sin(t * 10) : 0;
      // the loaf squashes and stretches about its BELLY, so it never lifts off the floor
      const sy = 0.27 * (1 + breath) * (1 - stretchK * 0.22 - crouch * 0.3 + spring * 0.15);
      loaf.scale.set(0.34 * (1 - stretchK * 0.08 + crouch * 0.06), sy, 0.42 * (1 + stretchK * 0.35 + crouch * 0.12));
      loaf.position.y = sy / 2 - 0.004;
      body.position.y = (d.walking ? Math.abs(Math.sin(t * 10)) * 0.035 : 0) + spring * 0.25;
      body.position.z = spring * 0.2;
      body.rotation.z = L(body.rotation.z, waddle * 0.09 + (d.happy ? Math.sin(t * 3) * 0.04 : 0), 0.3);
      body.rotation.x = L(body.rotation.x, stretchK * -0.18 + (d.walking ? 0.05 : 0) - spring * 0.25, 0.15);
    }
    const head = headRef.current;
    if (head) {
      const lickK = d.lick > 0 ? 0.5 + 0.5 * Math.sin(d.lick * Math.PI * 4) : 0;
      const chewK = d.chew > 0 ? Math.abs(Math.sin(t * 14)) * d.chew : 0;
      head.rotation.x = L(head.rotation.x, -stretchK * 0.55 + lickK * 0.5 + d.headPitch + chewK * 0.08 - spring * 0.2, 0.15);
      head.rotation.z = L(head.rotation.z, d.happy ? Math.sin(t * 3) * 0.14 : d.lick > 0 ? 0.25 : d.walking ? Math.sin(t * 10) * 0.05 : Math.sin(t * 0.5) * 0.03, 0.12);
      head.rotation.y = L(head.rotation.y, (d.lick > 0 ? -0.35 : 0) + d.headYaw, 0.12);
      head.position.y = L(head.position.y, HEAD_Y + stretchK * 0.05 - lickK * 0.05 - crouch * 0.06, 0.12);
    }
    if (yawnRef.current) {
      const open = Math.max(0, stretchK - 0.35) + (d.chew > 0 ? Math.abs(Math.sin(t * 14)) * 0.5 * d.chew : 0);
      yawnRef.current.scale.set(0.03 + open * 0.03, 0.01 + open * 0.06, 0.02);
      yawnRef.current.visible = open > 0.02;
    }
    if (tongueRef.current) {
      const out = d.lick > 0 ? Math.max(0, Math.sin(d.lick * Math.PI * 4)) : 0;
      tongueRef.current.visible = out > 0.2;
      tongueRef.current.position.z = 0.19 + out * 0.03;
    }
    if (pawLRef.current && pawRRef.current) {
      const lift = d.lick > 0 ? 0.5 + 0.5 * Math.sin(d.lick * Math.PI * 4) : 0;
      pawLRef.current.position.y = L(pawLRef.current.position.y, PAW_Y + lift * 0.2 + spring * 0.1, 0.15);
      pawLRef.current.position.z = L(pawLRef.current.position.z, PAW_Z + lift * 0.02 + spring * 0.1, 0.15);
      pawRRef.current.position.y = PAW_Y + (d.walking ? Math.abs(Math.sin(t * 10 + 1)) * 0.04 : 0) + spring * 0.1;
      pawRRef.current.position.z = PAW_Z + spring * 0.1;
    }
    const tail = tailRef.current;
    if (tail) {
      tail.rotation.y = L(tail.rotation.y, Math.sin(t * (d.happy ? 4 : 0.9)) * (d.happy ? 0.35 : 0.12) + (pounceK > 0 ? Math.sin(t * 9) * 0.3 : 0), 0.2);
      tail.rotation.x = L(tail.rotation.x, d.walking || crouch > 0.3 ? -0.9 : stretchK > 0 ? -0.4 : 0, 0.08);
    }
    if (earLRef.current && earRRef.current) {
      const phase = t % 3.7;
      earLRef.current.rotation.x = phase < 0.25 ? Math.sin((phase / 0.25) * Math.PI) * 0.45 : 0;
      const phase2 = (t + 1.9) % 5.1;
      earRRef.current.rotation.x = (phase2 < 0.25 ? Math.sin((phase2 / 0.25) * Math.PI) * 0.45 : 0) - crouch * 0.6;
    }
  });

  return (
    <group ref={bodyRef}>
      {/* the loaf, flush on the floor, stripes and chest painted into it */}
      <mesh ref={loafRef} geometry={LOAF_GEO} material={M.loaf} position={[0, 0.131, -0.02]} scale={[0.34, 0.27, 0.42]} raycast={noRaycast} />
      <StaticBatch version="static">
        {/* the neck: fills the crease where the head meets the loaf */}
        <mesh geometry={GEO.sphere} material={M.orange} position={[0, 0.23, 0.1]} scale={[0.24, 0.17, 0.22]} raycast={noRaycast} />
        {/* the chest bulge: the cream front the paws grow out of, buried in the underbelly */}
        <mesh geometry={GEO.sphere} material={M.cream} position={[0, 0.09, 0.15]} scale={[0.24, 0.17, 0.2]} raycast={noRaycast} />
      </StaticBatch>
      {/* front paws on the floor, their back halves inside the chest */}
      <mesh ref={pawLRef} geometry={GEO.sphere} material={M.cream} position={[-0.09, PAW_Y, PAW_Z]} scale={[0.085, 0.075, 0.2]} raycast={noRaycast} />
      <mesh ref={pawRRef} geometry={GEO.sphere} material={M.cream} position={[0.09, PAW_Y, PAW_Z]} scale={[0.085, 0.075, 0.2]} raycast={noRaycast} />
      {/* the tail: a root sunk in the rump, then the arc curling round her right side along the floor */}
      <group ref={tailRef} position={[0.14, 0.05, -0.28]}>
        <mesh geometry={GEO.sphere} material={M.orange} position={[0, 0.01, 0.07]} scale={[0.1, 0.09, 0.16]} raycast={noRaycast} />
        <mesh geometry={TAIL} material={M.orange} position={[0.1, 0, 0.1]} rotation={[Math.PI / 2, 0, 0.5]} raycast={noRaycast} />
        <mesh geometry={GEO.sphere} material={M.cream} position={[0.2, 0.0, 0.27]} scale={0.05} raycast={noRaycast} />
      </group>
      {/* the head: sunk into the loaf's front top so the neck is one curve */}
      <group ref={headRef} position={[0, HEAD_Y, 0.16]}>
        <StaticBatch version="static">
          <mesh geometry={GEO.sphere} material={M.orange} scale={[0.25, 0.22, 0.23]} raycast={noRaycast} />
          <mesh geometry={GEO.sphere} material={M.cream} position={[0, -0.07, 0.14]} scale={[0.13, 0.08, 0.09]} raycast={noRaycast} />
          {/* closed, happy eyes; blush; a tiny nose; a little smile; whiskers */}
          {[-0.08, 0.08].map((x) => (
            <mesh key={x} geometry={EYE} material={M.dark} position={[x, 0.035, 0.21]} raycast={noRaycast} />
          ))}
          {[-0.135, 0.135].map((x) => (
            <mesh key={x} geometry={GEO.sphere} material={M.blush} position={[x, -0.02, 0.165]} scale={[0.045, 0.028, 0.02]} raycast={noRaycast} />
          ))}
          <mesh geometry={GEO.sphere} material={M.pink} position={[0, -0.02, 0.225]} scale={[0.024, 0.017, 0.016]} raycast={noRaycast} />
          <mesh geometry={SMILE} material={M.dark} position={[0, -0.05, 0.22]} rotation={[0, 0, Math.PI]} raycast={noRaycast} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={GEO.box} material={M.whisker} position={[s * 0.16, -0.02, 0.155]} rotation={[0, 0, s * 0.15]} scale={[0.12, 0.004, 0.004]} raycast={noRaycast} />
              <mesh geometry={GEO.box} material={M.whisker} position={[s * 0.16, -0.045, 0.155]} rotation={[0, 0, -s * 0.15]} scale={[0.12, 0.004, 0.004]} raycast={noRaycast} />
            </group>
          ))}
        </StaticBatch>
        {/* ears: rounded cones sunk into the skull, pink inside; they flick, so they stay their own draws */}
        <group ref={earLRef} position={[-0.12, 0.135, -0.02]} rotation={[0, 0, 0.3]}>
          <mesh geometry={GEO.cone} material={M.orange} position={[0, 0.03, 0]} scale={[0.1, 0.14, 0.08]} raycast={noRaycast} />
          <mesh geometry={GEO.cone} material={M.pink} position={[0, 0.02, 0.025]} scale={[0.05, 0.08, 0.03]} raycast={noRaycast} />
        </group>
        <group ref={earRRef} position={[0.12, 0.135, -0.02]} rotation={[0, 0, -0.3]}>
          <mesh geometry={GEO.cone} material={M.orange} position={[0, 0.03, 0]} scale={[0.1, 0.14, 0.08]} raycast={noRaycast} />
          <mesh geometry={GEO.cone} material={M.pink} position={[0, 0.02, 0.025]} scale={[0.05, 0.08, 0.03]} raycast={noRaycast} />
        </group>
        {/* the yawn and the tongue only show during a stretch, a chew or a wash */}
        <mesh ref={yawnRef} geometry={GEO.sphere} material={M.mouth} position={[0, -0.06, 0.21]} scale={[0.03, 0.01, 0.02]} visible={false} raycast={noRaycast} />
        <mesh ref={tongueRef} geometry={GEO.sphere} material={M.pink} position={[0, -0.075, 0.2]} scale={[0.02, 0.012, 0.03]} visible={false} raycast={noRaycast} />
      </group>
      {children}
    </group>
  );
}
