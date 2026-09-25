import { Suspense, useMemo, useRef } from "react";
import { useFrame, type GroupProps } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GEO, matte, noRaycast } from "../scene/kit";
import { ModelBoundary } from "./ModelBoundary";
import { MOCHI_NODES, MOCHI_URL } from "./rig";

// Mochi: a ginger cat loaf, authored in Blender (scripts/blender/build_cat.py) and loaded from
// client/public/models/cat.glb. Shared by the world cat (scene/Props `Cat`) and the playroom's
// own little viewport (entities/MochiPlayroomModal).
//
// This file only loads the model and poses it. Each part the runtime moves is its own node with
// its pivot at the joint and no rotation of its own (rig.ts, MOCHI_NODES), so a pose is plain
// rotations and offsets from the rest transforms read out of the file:
//
//   Loaf     squashed and stretched about its base on the floor (breathing, crouch, stretch);
//            the head, paws and tail ride along with its scale so they stay attached
//   Head     pivots at the neck: looks at the feather, nods while chewing, tips up to yawn
//   EarL/R   flick about their base now and then, and flatten for a pounce
//   PawL/R   pivot at the wrist: waddle, reach forward in a stretch, the left one lifts to be washed
//   Tail     pivots at the root: sways, lifts while walking, swishes before a pounce
//   Yawn     a dark mouth hidden inside the head, scaled open for a yawn or a chew
//   Tongue   scaled out for a wash
//
// Whoever mounts her drives her through a `MochiDrive` ref, written every frame by the owner and
// read here: the world cat fills it from her wall-clock day (mochiSpot), the playroom from the
// feather, the treat and the scritches.

export interface MochiDrive {
  /** Waddling: bob and rock the body, paws stepping, tail up. */
  walking: boolean;
  /** 0..1 through a paw wash; the tongue and the left paw follow it. */
  lick: number;
  /** 0..1 through a stretch (the yawn opens near the top of it). */
  stretch: number;
  /** Where she is looking, radians about y (+ to her left) and x (+ down). */
  headYaw: number;
  headPitch: number;
  /** 0..1 a pounce: crouch through the first half, spring through the second. */
  pounce: number;
  /** 0..1 chewing a treat. */
  chew: number;
  /** Being fussed over: the happy sway, a quick purring breath, the swishing tail. */
  happy: boolean;
}

export const restDrive = (): MochiDrive => ({
  walking: false,
  lick: 0,
  stretch: 0,
  headYaw: 0,
  headPitch: 0,
  pounce: 0,
  chew: 0,
  happy: false,
});

type PartKey = keyof typeof MOCHI_NODES;
interface Part {
  node: THREE.Object3D;
  pos: THREE.Vector3;
  scale: THREE.Vector3;
}
type Rig = Record<PartKey, Part>;

/** How quickly each pose eases toward its target (per second): high is snappy, low is lazy. */
const EASE = 10;
const { damp, clamp } = THREE.MathUtils;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Finds every contract node in a fresh copy of the file, and remembers its rest transform. */
function useRig(): { root: THREE.Object3D; rig: Rig } {
  const { scene } = useGLTF(MOCHI_URL);
  return useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      // clicks are taken by the invisible pads the owners put over her
      if ((o as THREE.Mesh).isMesh) o.raycast = noRaycast;
    });
    const rig = {} as Rig;
    for (const key of Object.keys(MOCHI_NODES) as PartKey[]) {
      const node = root.getObjectByName(MOCHI_NODES[key]);
      if (!node) throw new Error(`cat.glb has no "${MOCHI_NODES[key]}" node`);
      rig[key] = { node, pos: node.position.clone(), scale: node.scale.clone() };
    }
    return { root, rig };
  }, [scene]);
}

function MochiRig({ drive }: { drive: React.RefObject<MochiDrive> }) {
  const { root, rig } = useRig();
  const seed = useMemo(() => Math.random() * 7, []);

  useFrame(({ clock }, rawDelta) => {
    const d = drive.current;
    if (!d) return;
    const dt = Math.min(rawDelta, 0.1);
    const t = clock.elapsedTime + seed;
    const { body, loaf, head, earL, earR, pawL, pawR, tail, yawn, tongue } = rig;

    const stretchK = Math.sin(clamp(d.stretch, 0, 1) * Math.PI);
    const crouch = Math.sin(Math.min(0.5, d.pounce) * Math.PI);
    const spring = d.pounce > 0.5 ? Math.sin((d.pounce - 0.5) * Math.PI) : 0;
    const washing = d.lick > 0;
    const wash = washing ? 0.5 + 0.5 * Math.sin(d.lick * Math.PI * 4) : 0;
    const chewK = d.chew > 0 ? Math.abs(Math.sin(t * 14)) * d.chew : 0;
    const step = d.walking ? t * 10 : 0;

    // the loaf breathes (a quick shallow purr while fussed), crouches and stretches about its base
    const breath = d.happy ? Math.sin(t * 5) * 0.015 : Math.sin(t * 1.4) * 0.025;
    const sx = 1 - stretchK * 0.06 + crouch * 0.06;
    const sy = (1 + breath) * (1 - stretchK * 0.18 - crouch * 0.25 + spring * 0.1);
    const sz = 1 + stretchK * 0.22 + crouch * 0.08;
    loaf.node.scale.set(loaf.scale.x * sx, loaf.scale.y * sy, loaf.scale.z * sz);

    // the whole body: a waddle, the happy sway, the spring of a pounce
    const b = body.node;
    b.position.y = damp(b.position.y, body.pos.y + (d.walking ? Math.abs(Math.sin(step)) * 0.03 : 0) + spring * 0.18, EASE * 2, dt);
    b.position.z = damp(b.position.z, body.pos.z + spring * 0.2, EASE * 2, dt);
    b.rotation.z = damp(b.rotation.z, (d.walking ? Math.sin(step) * 0.08 : 0) + (d.happy ? Math.sin(t * 3) * 0.04 : 0) + crouch * Math.sin(t * 16) * 0.03, EASE, dt);
    b.rotation.x = damp(b.rotation.x, -spring * 0.25, EASE, dt);

    // the head rides on the loaf's squash, and turns about the neck
    const h = head.node;
    h.position.set(head.pos.x * sx, head.pos.y * sy - wash * 0.02, head.pos.z * sz);
    h.rotation.x = damp(h.rotation.x, d.headPitch - stretchK * 0.45 + wash * 0.35 + chewK * 0.08 - spring * 0.2, EASE, dt);
    h.rotation.y = damp(h.rotation.y, d.headYaw + (washing ? 0.3 : 0), EASE, dt);
    h.rotation.z = damp(h.rotation.z, d.happy ? Math.sin(t * 3) * 0.12 : washing ? -0.2 : d.walking ? Math.sin(step) * 0.05 : Math.sin(t * 0.5) * 0.03, EASE, dt);

    // ears: a flick every few seconds (never both at once), flattened back for a pounce
    const flick = (phase: number, every: number) => {
      const p = (t + phase) % every;
      return p < 0.25 ? Math.sin((p / 0.25) * Math.PI) * 0.4 : 0;
    };
    earL.node.rotation.x = damp(earL.node.rotation.x, flick(0, 3.7) - crouch * 0.7 - (d.happy ? 0.15 : 0), EASE * 2, dt);
    earR.node.rotation.x = damp(earR.node.rotation.x, flick(1.9, 5.1) - crouch * 0.7 - (d.happy ? 0.15 : 0), EASE * 2, dt);

    // paws: they ride forward with a stretch, step while walking, and the left one comes up to be washed
    const pawGoal = (rest: THREE.Vector3, lift: number, reach: number) => [rest.x * sx, rest.y + lift, rest.z * sz + reach] as const;
    const [lx, ly, lz] = pawGoal(pawL.pos, wash * 0.13 + (d.walking ? Math.max(0, Math.sin(step)) * 0.035 : 0) + spring * 0.06, stretchK * 0.06 + spring * 0.08 - wash * 0.04);
    const [rx, ry, rz] = pawGoal(pawR.pos, (d.walking ? Math.max(0, -Math.sin(step)) * 0.035 : 0) + spring * 0.06, stretchK * 0.06 + spring * 0.08);
    pawL.node.position.set(lx, damp(pawL.node.position.y, ly, EASE, dt), damp(pawL.node.position.z, lz, EASE, dt));
    pawR.node.position.set(rx, damp(pawR.node.position.y, ry, EASE, dt), damp(pawR.node.position.z, rz, EASE, dt));
    pawL.node.rotation.x = damp(pawL.node.rotation.x, -wash * 0.9, EASE, dt);

    // the tail: a lazy sway, a swish when happy or about to pounce, carried up while she walks
    const tl = tail.node;
    tl.position.set(tail.pos.x * sx, tail.pos.y * sy, tail.pos.z * sz);
    const swish = d.happy ? Math.sin(t * 4) * 0.3 : Math.sin(t * 0.9) * 0.1;
    tl.rotation.y = damp(tl.rotation.y, swish + (d.pounce > 0 ? Math.sin(t * 9) * 0.3 : 0), EASE, dt);
    tl.rotation.x = damp(tl.rotation.x, d.walking || crouch > 0.3 ? -0.5 : stretchK > 0 ? -0.25 : 0, EASE * 0.5, dt);

    // the mouth opens for a yawn at the top of a stretch and with every chew; the tongue for a wash
    const open = smooth(0.35, 0.9, stretchK) + chewK * 0.45;
    yawn.node.scale.setScalar(Math.max(yawn.scale.x, open));
    yawn.node.visible = open > 0.02;
    const out = washing ? Math.max(0, Math.sin(d.lick * Math.PI * 4)) : 0;
    tongue.node.scale.setScalar(Math.max(tongue.scale.x, out));
    tongue.node.position.z = tongue.pos.z + out * 0.012;
    tongue.node.visible = out > 0.05;
  });

  return <primitive object={root} />;
}

// the stand-in while the file loads, or if it cannot: a plain ginger lump of her size
const STAND_IN = matte("#eb9a55", 0.8);
function StandIn() {
  return <mesh geometry={GEO.sphere} material={STAND_IN} position={[0, 0.16, 0]} scale={[0.38, 0.32, 0.6]} raycast={noRaycast} />;
}

/** Mochi posed by `drive` (or resting, without one). The model is authored at diorama scale, about 0.66 long. */
export const MochiModel: React.FC<{ drive?: React.RefObject<MochiDrive> | any }> = ({ drive }) => {
  const idle = useRef(restDrive());
  return (
    <ModelBoundary what="cat.glb" fallback={<StandIn />}>
      <Suspense fallback={<StandIn />}>
        <MochiRig drive={drive ?? idle} />
      </Suspense>
    </ModelBoundary>
  );
};

/** A self-contained Mochi you can place anywhere: a group around the model. */
export const Mochi: React.FC<GroupProps & { drive?: React.RefObject<MochiDrive> }> = ({ drive, ...group }) => (
  <group {...group}>
    <MochiModel drive={drive} />
  </group>
);

export default Mochi;

useGLTF.preload(MOCHI_URL);
