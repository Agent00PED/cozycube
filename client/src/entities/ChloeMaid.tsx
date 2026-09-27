import { Suspense, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BOUTIQUE, BOUTIQUE_REACH } from "@shared/worlds/lounge";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "../scene/kit";
import { CampNpc, type NpcTalk } from "./CampNpc";
import { ModelBoundary } from "./ModelBoundary";

// The Velvet Boutique, by the lounge's front window: Chloe, a chibi cat maid in Victorian black and
// white (a lace headband, a red velvet bow), and her ornate gilded cheval mirror. One Blender model,
// chloe_maid.glb (scripts/blender/build_staff.py), with two roots: `Chloe` (her nodes follow the
// shopkeepers' contract, Chloe_Body / _Head / _ArmR / _ArmL / _Tail: she breathes, sways her tail,
// looks at whoever comes near and curtsies with a wave) and `Mirror` (the frame, and its glass,
// which catches a slow sheen). Talking to either opens the wardrobe (the server's "boutique"
// panel); she greets you as you come by.

export const CHLOE_URL = modelUrl("chloe_maid.glb");
export function preloadChloe() {
  useGLTF.preload(CHLOE_URL);
}

/** What she says as she opens the wardrobe for you (the wardrobe shows it too). */
export const CHLOE_WELCOME = "Welcome to The Velvet Boutique! Would you like to try on our latest collection?";

const TALK: NpcTalk = {
  height: 1.3,
  clicked: [CHLOE_WELCOME, "Every piece is hand-stitched, nya~ 🧵", "The mirror never lies, but it is very kind. 🪞", "Prestige pieces just came in from the city! ✨"],
  on: { chloeWave: () => CHLOE_WELCOME },
  greet: {
    inside: (x, z) => Math.hypot(x - BOUTIQUE.approach.x, z - BOUTIQUE.approach.z) < BOUTIQUE_REACH + 0.6,
    lines: ["Oh! A new face at the boutique. 🎀", "Good evening! The mirror's ready when you are. 🪞", "Welcome back, darling! Something new today? ✨"],
  },
};

const STAND_IN = matte("#1f1b24", 0.85);
const MIRROR_STAND_IN = matte("#c9a24a", 0.6);

export function ChloeMaid({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  return (
    <>
      <CampNpc
        url={CHLOE_URL}
        what="chloe_maid.glb"
        prefix="Chloe"
        node="Chloe"
        at={BOUTIQUE.chloe}
        waveEvent="chloeWave"
        standIn={<mesh geometry={GEO.round} material={STAND_IN} position={[0, 0.55, 0]} scale={[0.42, 1.1, 0.38]} raycast={noRaycast} />}
        subscribeMessages={subscribeMessages}
        talk={TALK}
        idle={{ gesture: "perk", every: 16 }}
      />
      <group position={[BOUTIQUE.mirror.x, 0, BOUTIQUE.mirror.z]} rotation={[0, BOUTIQUE.mirror.yaw, 0]}>
        <ModelBoundary what="chloe_maid.glb" fallback={<MirrorStandIn />}>
          <Suspense fallback={<MirrorStandIn />}>
            <Mirror />
          </Suspense>
        </ModelBoundary>
      </group>
    </>
  );
}

function MirrorStandIn() {
  return <mesh geometry={GEO.box} material={MIRROR_STAND_IN} position={[0, 0.8, 0]} scale={[0.7, 1.6, 0.12]} raycast={noRaycast} />;
}

/** The cheval mirror: its gilded frame as built, its glass given a slow travelling sheen. */
function Mirror() {
  const { scene } = useGLTF(CHLOE_URL);
  const { model, glass } = useMemo(() => {
    const root = scene.getObjectByName("Mirror");
    const copy = (root ?? new THREE.Group()).clone(true);
    copy.position.set(0, 0, 0);
    copy.traverse((o) => (o.raycast = noRaycast));
    const glassMesh = copy.getObjectByName("Mirror_Glass") as THREE.Mesh | undefined;
    let mat: THREE.MeshStandardMaterial | null = null;
    if (glassMesh?.isMesh) {
      mat = (glassMesh.material as THREE.MeshStandardMaterial).clone();
      mat.metalness = 0.9;
      mat.roughness = 0.12;
      glassMesh.material = mat;
    }
    return { model: copy, glass: mat };
  }, [scene]);
  useFrame(({ clock }) => {
    if (!glass) return;
    // a soft sheen sweeping over the glass every few seconds
    const s = (clock.elapsedTime % 6) / 6;
    const k = Math.max(0, 1 - Math.abs(s - 0.5) * 6);
    glass.emissive.setRGB(0.18 * k, 0.16 * k, 0.12 * k);
  });
  return <primitive object={model} />;
}
