import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { cameraFocus } from "../scene/cameraFocus";
import { GEO, noRaycast } from "../scene/kit";
import { ModelBoundary } from "./ModelBoundary";

// A shopkeeper or a regular (the Campfire's Barnaby the Angler and Buster the Lumberjack, the
// casino's Mr. Vance, Boris, Madame Vivienne, Jasper and Pippin): a pure loader for their Blender
// model, whose nodes follow one contract (`<Prefix>_Body`, `_Head`, `_ArmR`, `_Tail`, see
// scripts/blender/build_barnaby.py, build_buster.py, build_vance.py and build_casino_staff.py). They
// breathe, sway their tails, turn their heads to whoever walks up, and wave when someone opens their
// shop (`waveEvent`: everyone sees it). Where they stand comes from their world's layout (`y` lifts
// them onto a platform, as the cage's); a model loading or missing shows `standIn`.
//
// Some also talk (`talk`): a line in a speech bubble over them, with a wave, when they are clicked,
// when a room message they care about arrives (Jasper at a slot spin, Vivienne at the wheel's
// number), or when you walk into their corner (Boris, at the pit). What they say is only yours: the
// bubble shows on your screen.

/** How near the local player comes before they look their way. */
const NOTICE = 4.5;
const WAVE_S = 1.8;
/** A room message sets them talking at most this often (a run of spins is not a run of lines). */
const REACT_GAP_MS = 5000;
/** A bubble's life (the chat bubble's own animation fades it over 4 s). */
const BUBBLE_MS = 4000;
const PAD = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

export interface NpcTalk {
  /** How high over their feet they stand (the bubble floats over it, the click pad reaches it). */
  height: number;
  /** Said when they are clicked (one at random). */
  clicked?: string[];
  /** Said on a room message: the line, or null to stay quiet. */
  on?: Record<string, (payload: any) => string | null>;
  /** Said once as you come into an area, and again only after you have left it. */
  greet?: { inside: (x: number, z: number) => boolean; lines: string[] };
}

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
  talk?: NpcTalk;
}

const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

export function CampNpc(props: CampNpcProps) {
  const { talk, waveEvent, subscribeMessages } = props;
  const waveAt = useRef(-99);
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  const bubbleId = useRef(0);
  const lastReact = useRef(0);
  const inside = useRef(false);
  const say = useRef((text: string) => {
    const id = ++bubbleId.current;
    setBubble({ id, text });
    waveAt.current = performance.now() / 1000;
    window.setTimeout(() => setBubble((b) => (b?.id === id ? null : b)), BUBBLE_MS);
  });

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === waveEvent) waveAt.current = performance.now() / 1000;
        const react = talk?.on?.[type];
        if (!react || Date.now() - lastReact.current < REACT_GAP_MS) return;
        const line = react(payload);
        if (!line) return;
        lastReact.current = Date.now();
        say.current(line);
      }),
    [subscribeMessages, waveEvent, talk]
  );
  // walking into their corner: a greeting, once per visit
  useFrame(() => {
    const greet = talk?.greet;
    if (!greet) return;
    const now = greet.inside(cameraFocus.x, cameraFocus.z);
    if (now && !inside.current) say.current(pick(greet.lines));
    inside.current = now;
  });

  const clicked = talk?.clicked;
  const onPad = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !clicked) return;
    e.stopPropagation(); // not a walk to the floor behind them
    say.current(pick(clicked));
  };

  return (
    <group position={[props.at.x, props.y ?? 0, props.at.z]} rotation={[0, props.at.yaw, 0]}>
      <ModelBoundary what={props.what} fallback={props.standIn}>
        <Suspense fallback={props.standIn}>
          <NpcModel {...props} waveAt={waveAt} />
        </Suspense>
      </ModelBoundary>
      {talk && clicked && <mesh geometry={GEO.box} material={PAD} position={[0, talk.height / 2, 0]} scale={[0.8, talk.height, 0.8]} onPointerDown={onPad} />}
      {talk && bubble && (
        <Html key={bubble.id} position={[0, talk.height + 0.22, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="cozy-chat-bubble" style={{ position: "relative" }}>
            {bubble.text}
          </div>
        </Html>
      )}
    </group>
  );
}

function NpcModel({ url, prefix, at, waveAt }: CampNpcProps & { waveAt: MutableRefObject<number> }) {
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
  const look = useRef(0);

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
