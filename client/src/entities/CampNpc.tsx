import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
// bubble shows on your screen. And some bow (`bowOn`: a dealer thanked with a tip) or wave
// (`waveOn`: Pippin serving a drink) when a message says so, for everyone.
//
// And some have little turns of their own (`gestureOn`, `idle`): Cedric shuffling his deck and
// knocking the felt for a natural, Jasper pawing at his coin slot, dozing off or perking up to clap,
// Pippin working his shaker. A gesture that needs both arms keeps the left one its own
// (`fuseArm={false}`: one more draw call).

/** How near the local player comes before they look their way. */
const NOTICE = 4.5;
const WAVE_S = 1.8;
/** A bow: forward from the feet and back up, this long, this far. */
const BOW_S = 1.3;
const BOW_ANGLE = 0.32;
/** A room message sets them talking at most this often (a run of spins is not a run of lines). */
const REACT_GAP_MS = 5000;
/** A bubble's life (the chat bubble's own animation fades it over 4 s). */
const BUBBLE_MS = 4000;

/** A little turn of their own, and how long each lasts (seconds). */
export type NpcGesture = "clap" | "paw" | "sleep" | "perk" | "knock" | "shake" | "shuffle";
const GESTURE_S: Record<NpcGesture, number> = { clap: 1.8, paw: 1.5, sleep: 4.5, perk: 1.0, knock: 1.1, shake: 1.8, shuffle: 2.4 };
// the click pad is never drawn (no draw call), but it still takes the click
const PAD = new THREE.MeshBasicMaterial({ visible: false });

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
  /** A room message that makes them bow (a tip in their jar), for everyone. */
  bowOn?: (type: string, payload: any) => boolean;
  /** A room message that makes them wave (a drink served), besides `waveEvent`. */
  waveOn?: (type: string, payload: any) => boolean;
  /** A room message that sets off a gesture (and, if given, a line with it), for everyone. */
  gestureOn?: (type: string, payload: any) => { gesture: NpcGesture; line?: string } | null;
  /** A gesture they fall into now and then by themselves (about every `every` seconds). */
  idle?: { gesture: NpcGesture; every: number };
  /** Told as each gesture starts (a sound, a sprinkle of ice). */
  onGesture?: (gesture: NpcGesture) => void;
  /** Keep the left arm its own node (for gestures with both arms); fused into the body otherwise. */
  fuseArm?: boolean;
}

const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

export function CampNpc(props: CampNpcProps) {
  const { talk, waveEvent, subscribeMessages, bowOn, waveOn, gestureOn, idle, onGesture } = props;
  const waveAt = useRef(-99);
  const bowAt = useRef(-99);
  const gesture = useRef<{ kind: NpcGesture; at: number }>({ kind: "perk", at: -99 });
  const onGestureRef = useRef(onGesture);
  onGestureRef.current = onGesture;
  const startGesture = useRef((kind: NpcGesture) => {
    gesture.current = { kind, at: performance.now() / 1000 };
    onGestureRef.current?.(kind);
  });
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
        if (type === waveEvent || waveOn?.(type, payload)) waveAt.current = performance.now() / 1000;
        if (bowOn?.(type, payload)) bowAt.current = performance.now() / 1000;
        const g = gestureOn?.(type, payload);
        if (g) {
          startGesture.current(g.gesture);
          if (g.line) {
            lastReact.current = Date.now();
            say.current(g.line);
            return;
          }
        }
        const react = talk?.on?.[type];
        if (!react || Date.now() - lastReact.current < REACT_GAP_MS) return;
        const line = react(payload);
        if (!line) return;
        lastReact.current = Date.now();
        say.current(line);
      }),
    [subscribeMessages, waveEvent, talk, bowOn, waveOn, gestureOn]
  );
  // an idle gesture now and then (never over another one)
  useEffect(() => {
    if (!idle) return;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        const busy = performance.now() / 1000 - gesture.current.at < GESTURE_S[gesture.current.kind];
        if (!busy) startGesture.current(idle.gesture);
        next();
      }, idle.every * 1000 * (0.6 + Math.random() * 0.8));
    };
    next();
    return () => window.clearTimeout(timer);
  }, [idle]);
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
          <NpcModel {...props} waveAt={waveAt} bowAt={bowAt} gesture={gesture} />
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

function NpcModel({ url, prefix, at, waveAt, bowAt, gesture, fuseArm = true }: CampNpcProps & { waveAt: MutableRefObject<number>; bowAt: MutableRefObject<number>; gesture: MutableRefObject<{ kind: NpcGesture; at: number }> }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  const parts = useMemo(() => {
    const get = (name: string) => model.getObjectByName(`${prefix}_${name}`) ?? null;
    model.traverse((o) => {
      o.raycast = noRaycast;
    });
    // the left arm never moves on its own (it holds the rake, the lever, the shaker, the cards):
    // fused into the body, it costs no draw call of its own
    const body = get("Body") as THREE.Mesh | null;
    const armL = get("ArmL") as THREE.Mesh | null;
    if (fuseArm && body?.isMesh && armL?.isMesh && armL.parent === body && armL.material === body.material) {
      armL.updateMatrix();
      const merged = mergeGeometries([body.geometry, armL.geometry.clone().applyMatrix4(armL.matrix)]);
      if (merged) {
        body.geometry = merged;
        armL.removeFromParent();
      }
    }
    const armR = get("ArmR");
    const leftArm = fuseArm ? null : get("ArmL");
    return {
      body,
      bodyY: body?.position.y ?? 0,
      head: get("Head"),
      armR,
      armL: leftArm,
      tail: get("Tail"),
      armRest: armR ? armR.rotation.clone() : new THREE.Euler(),
      armLRest: leftArm ? leftArm.rotation.clone() : new THREE.Euler(),
    };
  }, [model, prefix, fuseArm]);
  const look = useRef(0);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const { body, head, armR, armL, tail, armRest, armLRest } = parts;
    // the gesture under way, if any: its kind, how far in (0 to 1), and an ease in and out (k)
    const gs = performance.now() / 1000 - gesture.current.at;
    const g = gs >= 0 && gs < GESTURE_S[gesture.current.kind] ? gesture.current.kind : null;
    const gu = g ? gs / GESTURE_S[g] : 0;
    const gk = g ? Math.min(1, Math.min(gu, 1 - gu) * 5) : 0;
    if (body) {
      const curl = g === "sleep" ? gk : 0;
      body.scale.set(1 + 0.01 * Math.sin(t * (g === "sleep" ? 0.9 : 2.1)), (1 + 0.018 * Math.sin(t * 2.1 + 0.4)) * (1 - 0.1 * curl), 1);
      // a bow: forward from the feet (the body's origin) and slowly back up; dozing, a slump
      const b = performance.now() / 1000 - bowAt.current;
      body.rotation.x = (b >= 0 && b < BOW_S ? BOW_ANGLE * Math.sin((Math.PI * b) / BOW_S) : 0) + 0.28 * curl;
      // perking up (or clapping for joy): a little hop
      body.position.y = parts.bodyY + (g === "perk" || g === "clap" ? Math.abs(Math.sin(gs * Math.PI * 3)) * 0.07 * gk : 0);
    }
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
      head.rotation.y = look.current + (g === "paw" ? 0.25 * Math.sin(gs * 20) * gk : 0);
      head.rotation.z = 0.04 * Math.sin(t * 0.9);
      head.rotation.x = g === "sleep" ? 0.45 * gk : g === "knock" ? 0.15 * gk : 0;
    }
    // a wave: the right arm up and waggling; or the gesture's arms
    if (armR) {
      const w = performance.now() / 1000 - waveAt.current;
      const k = w >= 0 && w < WAVE_S ? Math.sin((Math.PI * w) / WAVE_S) : 0;
      if (g && k === 0) {
        const r = gestureArm(g, gs, gk, 1);
        armR.rotation.set(armRest.x + r.x, armRest.y, armRest.z + r.z);
      } else armR.rotation.set(armRest.x - 0.3 * k, armRest.y, armRest.z - 2.3 * k + 0.35 * k * Math.sin(w * 14));
    }
    if (armL) {
      const r = g ? gestureArm(g, gs, gk, -1) : { x: 0, z: 0 };
      armL.rotation.set(armLRest.x + r.x, armLRest.y, armLRest.z + r.z);
    }
  });

  return <primitive object={model} />;
}

/** An arm's turn for a gesture (added to its rest pose): `side` 1 the right arm, -1 the left. Arms
 *  hang down; x below 0 swings one forward, z toward the middle is +side (the right arm is on -x). */
function gestureArm(g: NpcGesture, s: number, k: number, side: 1 | -1): { x: number; z: number } {
  switch (g) {
    case "clap":
      // both paws up in front, meeting and parting
      return { x: -1.25 * k, z: side * k * (0.25 + 0.3 * (0.5 + 0.5 * Math.sin(s * 16))) };
    case "paw":
      // the right paw swiping at the coin slot, again and again
      return side === 1 ? { x: (-1.2 + 0.45 * Math.sin(s * 17)) * k, z: 0.15 * k } : { x: 0, z: 0 };
    case "knock":
      // two raps of the knuckles on the felt
      return side === 1 ? { x: (-0.75 + 0.3 * Math.abs(Math.sin(s * Math.PI * 2.4))) * k, z: 0.1 * k } : { x: 0, z: 0 };
    case "shake":
      // the shaker up by the shoulder, rattled hard
      return side === -1 ? { x: (-1.5 + 0.28 * Math.sin(s * 30)) * k, z: -0.25 * k } : { x: -0.25 * k, z: 0 };
    case "shuffle":
      // both paws in front, riffling the deck: one then the other
      return { x: (-0.95 + 0.12 * Math.sin(s * 12 + (side === 1 ? 0 : Math.PI))) * k, z: side * (0.3 + 0.08 * Math.sin(s * 12)) * k };
    case "sleep":
      return { x: -0.35 * k, z: side * 0.2 * k };
    case "perk":
      return { x: -0.4 * k, z: -side * 0.5 * k };
  }
}
