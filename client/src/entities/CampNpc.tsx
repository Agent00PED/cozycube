import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { cameraFocus } from "../scene/cameraFocus";
import { noRaycast } from "../scene/kit";
import { ModelBoundary } from "./ModelBoundary";

// A shopkeeper (the Campfire's Barnaby the Angler and Buster the Lumberjack, the casino's Mr. Vance):
// a pure loader for their Blender model, whose nodes follow one contract (`<Prefix>_Body`, `_Head`,
// `_ArmR`, `_Tail`, see scripts/blender/build_barnaby.py, build_buster.py and build_vance.py). They
// breathe, sway their tails, turn their heads to whoever walks up, and wave when someone opens their
// shop (`waveEvent`: everyone sees it). Where they stand comes from their world's layout (`y` lifts
// them onto a platform, as the cage's); a model loading or missing shows `standIn`.

/** How near the local player comes before they look their way. */
const NOTICE = 4.5;
const WAVE_S = 1.8;

export interface CampNpcProps {
  url: string;
  what: string;
  prefix: string;
  at: { x: number; z: number; yaw: number };
  /** The height they stand at (a platform's top); the ground when omitted. */
  y?: number;
  waveEvent: string;
  standIn: ReactNode;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

export function CampNpc(props: CampNpcProps) {
  return (
    <group position={[props.at.x, props.y ?? 0, props.at.z]} rotation={[0, props.at.yaw, 0]}>
      <ModelBoundary what={props.what} fallback={props.standIn}>
        <Suspense fallback={props.standIn}>
          <NpcModel {...props} />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}

function NpcModel({ url, prefix, at, waveEvent, subscribeMessages }: CampNpcProps) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  const parts = useMemo(() => {
    const get = (name: string) => model.getObjectByName(`${prefix}_${name}`) ?? null;
    model.traverse((o) => {
      o.raycast = noRaycast;
    });
    const armR = get("ArmR");
    return { body: get("Body"), head: get("Head"), armR, tail: get("Tail"), armRest: armR ? armR.rotation.clone() : new THREE.Euler() };
  }, [model, prefix]);
  const waveAt = useRef(-99);
  const look = useRef(0);
  useEffect(
    () =>
      subscribeMessages((type) => {
        if (type === waveEvent) waveAt.current = performance.now() / 1000;
      }),
    [subscribeMessages, waveEvent]
  );

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const { body, head, armR, tail, armRest } = parts;
    if (body) body.scale.set(1 + 0.01 * Math.sin(t * 2.1), 1 + 0.018 * Math.sin(t * 2.1 + 0.4), 1);
    if (tail) tail.rotation.y = 0.35 * Math.sin(t * 1.7);
    // the head turns to you as you come near (relative to their own facing), and idly looks about
    if (head) {
      const dx = cameraFocus.x - at.x;
      const dz = cameraFocus.z - at.z;
      const near = Math.hypot(dx, dz) < NOTICE;
      const toward = Math.atan2(dx, dz) - at.yaw;
      const wrapped = Math.atan2(Math.sin(toward), Math.cos(toward));
      const want = near ? Math.max(-0.75, Math.min(0.75, wrapped)) : 0.35 * Math.sin(t * 0.4);
      look.current += (want - look.current) * Math.min(1, dt * 3);
      head.rotation.y = look.current;
      head.rotation.z = 0.04 * Math.sin(t * 0.9);
    }
    // a wave: the right arm up and waggling
    if (armR) {
      const w = performance.now() / 1000 - waveAt.current;
      const k = w >= 0 && w < WAVE_S ? Math.sin((Math.PI * w) / WAVE_S) : 0;
      armR.rotation.set(armRest.x - 0.3 * k, armRest.y, armRest.z - 2.3 * k + 0.35 * k * Math.sin(w * 14));
    }
  });

  return <primitive object={model} />;
}
