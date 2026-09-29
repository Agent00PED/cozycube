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
// Pippin working his shaker, the Velvet Ring's regulars clapping from the bleachers and Kip the
// kangaroo's one-two on the heavy bag. A gesture that needs both arms moves the left one too
// (`fuseArm={false}`); otherwise it stays still (it holds the rake, the lever, the shaker, the cards).
//
// A few do more: Ref Barnaby walks (`motion`: where he is this frame, and how briskly he goes: a
// bobbing, arm-swinging gait), keeps his eyes on the exchange (`lookAt`), counts a knockdown down
// with his arm, raises the winner's and waves the bout off; the ring's regulars doze between bouts
// and lean forward through one (`mood`); the trainee skips rope all night (`loop`: the rope a part
// of its own, turned round the hands, the pug hopping over it); and the fight-night fans fade in
// and out (`presence`).
//
// However many parts move, each character is ONE draw call: the parts painted with the body's
// material are fused into a single skinned mesh whose bones are those very parts (skinParts), so
// the breathing, the head's turn, a wave and a bow move the skin exactly as they moved the parts.

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
export type NpcGesture = "clap" | "paw" | "sleep" | "perk" | "knock" | "shake" | "shuffle" | "punch" | "count" | "raise" | "waveoff" | "flail" | "cheer" | "gasp";
export const GESTURE_S: Record<NpcGesture, number> = { clap: 1.8, paw: 1.5, sleep: 4.5, perk: 1.0, knock: 1.1, shake: 1.8, shuffle: 2.4, punch: 2.4, count: 0.85, raise: 3.2, waveoff: 1.5, flail: 1.2, cheer: 2.0, gasp: 1.3 };
/** A pose held for as long as it lasts: dozing between bouts, leaning forward through one. */
export type NpcMood = "doze" | "lean" | null;
/** Where a walking NPC is this frame (the component places them), and how briskly they go (0..1). */
export interface NpcMotion {
  x: number;
  z: number;
  y: number;
  yaw: number;
  moving: number;
}
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
  /** Leave the left arm still (the default); false moves it too, for gestures with both arms. */
  fuseArm?: boolean;
  /** Draw only this node of the model (and what hangs from it): a model holding more than the one
   *  character (Chloe and her mirror, in chloe_maid.glb). The whole scene when omitted. */
  node?: string;
  /** Walking about: read every frame (`at` is then only where they start). */
  motion?: MutableRefObject<NpcMotion>;
  /** Where they keep their eyes, when anywhere (else on whoever comes near). */
  lookAt?: () => { x: number; z: number } | null;
  /** A pose held a while (dozing, leaning in), asked every frame. */
  mood?: () => NpcMood;
  /** A loop they keep up all the time: skipping rope (the `<Prefix>_Rope` part turned round the hands). */
  loop?: "skip";
  /** How much of them shows (0..1, asked every frame): they fade in and out, and draw nothing at 0. */
  presence?: () => number;
  /** Filled with a way to start a gesture from outside (a referee's call on arriving). */
  gestureRef?: MutableRefObject<((g: NpcGesture) => void) | null>;
}

const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

export function CampNpc(props: CampNpcProps) {
  const { talk, waveEvent, subscribeMessages, bowOn, waveOn, gestureOn, idle, onGesture, motion } = props;
  const groupRef = useRef<THREE.Group>(null);
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
  if (props.gestureRef) props.gestureRef.current = startGesture.current;
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
  // walking into their corner: a greeting, once per visit (and, walking about, where they are now)
  useFrame(() => {
    const m = motion?.current;
    if (m && groupRef.current) {
      groupRef.current.position.set(m.x, m.y, m.z);
      groupRef.current.rotation.y = m.yaw;
    }
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
    <group ref={groupRef} position={[props.at.x, props.y ?? 0, props.at.z]} rotation={[0, props.at.yaw, 0]}>
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

function NpcModel({ url, prefix, at, waveAt, bowAt, gesture, fuseArm = true, node, motion, lookAt, mood, loop, presence }: CampNpcProps & { waveAt: MutableRefObject<number>; bowAt: MutableRefObject<number>; gesture: MutableRefObject<{ kind: NpcGesture; at: number }> }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const root = (node && scene.getObjectByName(node)) || scene;
    const copy = root.clone(true);
    // (a node drawn on its own stands at the component's place, not where it sat in the file)
    if (root !== scene) copy.position.set(0, 0, 0);
    return copy;
  }, [scene, node]);
  const parts = useMemo(() => {
    const get = (name: string) => model.getObjectByName(`${prefix}_${name}`) ?? null;
    model.traverse((o) => {
      o.raycast = noRaycast;
    });
    const body = get("Body") as THREE.Mesh | null;
    // (one that fades has a material of its own: the clay is shared by the model's every copy)
    const fade = presence && body?.isMesh && !Array.isArray(body.material) ? ownMaterial(model, body) : null;
    skinParts(model, body, prefix);
    const armR = get("ArmR");
    const leftArm = fuseArm ? null : get("ArmL");
    return {
      body,
      bodyY: body?.position.y ?? 0,
      head: get("Head"),
      armR,
      armL: leftArm,
      tail: get("Tail"),
      rope: get("Rope"),
      armRest: armR ? armR.rotation.clone() : new THREE.Euler(),
      armLRest: leftArm ? leftArm.rotation.clone() : new THREE.Euler(),
      fade,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, prefix, fuseArm]);
  useEffect(() => () => parts.fade?.dispose(), [parts]);
  const look = useRef(0);
  const held = useRef({ doze: 0, lean: 0 });

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const { body, head, armR, armL, tail, rope, armRest, armLRest, fade } = parts;
    // fading in and out: see-through on the way, nothing drawn once gone
    if (fade && presence) {
      const k = Math.max(0, Math.min(1, presence()));
      model.visible = k > 0.01;
      fade.opacity = k;
      const clear = k < 0.999;
      if (fade.transparent !== clear) {
        fade.transparent = clear;
        fade.depthWrite = !clear;
        fade.needsUpdate = true;
      }
    }
    // the gesture under way, if any: its kind, how far in (0 to 1), and an ease in and out (k)
    const gs = performance.now() / 1000 - gesture.current.at;
    const g = gs >= 0 && gs < GESTURE_S[gesture.current.kind] ? gesture.current.kind : null;
    const gu = g ? gs / GESTURE_S[g] : 0;
    const gk = g ? Math.min(1, Math.min(gu, 1 - gu) * 5) : 0;
    // a mood held: dozing (slumped, the head nodding), leaning in (forward, elbows to the knees)
    const m = mood?.() ?? null;
    const h = held.current;
    const ease = Math.min(1, dt * 2.5);
    h.doze += ((m === "doze" && !g ? 1 : 0) - h.doze) * ease;
    h.lean += ((m === "lean" ? 1 : 0) - h.lean) * ease;
    // walking: a bobbing, swaying gait; skipping rope: a hop over the rope as it passes the feet
    const walk = motion?.current.moving ?? 0;
    const turn = loop === "skip" ? t * Math.PI * 2 * 1.9 : 0;
    const hop = loop === "skip" ? 0.075 * Math.pow(Math.max(0, Math.cos(turn)), 4) : 0;
    const stride = t * 13;
    if (body) {
      const curl = Math.max(g === "sleep" ? gk : 0, h.doze);
      body.scale.set(1 + 0.01 * Math.sin(t * (curl > 0.5 ? 0.9 : 2.1)), (1 + 0.018 * Math.sin(t * 2.1 + 0.4)) * (1 - 0.1 * curl), 1);
      // a bow: forward from the feet (the body's origin) and slowly back up; dozing, a slump;
      // leaning in; a gasp throws them back
      const b = performance.now() / 1000 - bowAt.current;
      body.rotation.x = (b >= 0 && b < BOW_S ? BOW_ANGLE * Math.sin((Math.PI * b) / BOW_S) : 0) + 0.28 * curl + 0.2 * h.lean - (g === "gasp" ? 0.22 * gk : 0) + 0.05 * walk;
      body.rotation.z = Math.sin(stride) * 0.07 * walk;
      // perking up (or clapping or cheering for joy): a little hop; walking, a bob; skipping, the hop
      const joy = g === "perk" || g === "clap" || g === "cheer" ? Math.abs(Math.sin(gs * Math.PI * 3)) * (g === "cheer" ? 0.1 : 0.07) * gk : 0;
      body.position.y = parts.bodyY + joy + Math.abs(Math.sin(stride)) * 0.045 * walk + hop;
    }
    if (tail) tail.rotation.y = 0.35 * Math.sin(t * (walk > 0.3 || loop ? 6 : 1.7));
    // the rope, round the line through the hands: over the head, down in front, under the feet
    if (rope) rope.rotation.x = turn;
    // the head turns to what they watch, or to you as you come near (relative to their own
    // facing), and idly looks about
    if (head) {
      const here = motion?.current ?? { x: at.x, z: at.z, yaw: at.yaw };
      const target = lookAt?.() ?? null;
      const dx = (target ? target.x : cameraFocus.x) - here.x;
      const dz = (target ? target.z : cameraFocus.z) - here.z;
      const near = !!target || Math.hypot(dx, dz) < NOTICE;
      const toward = Math.atan2(dx, dz) - here.yaw;
      const wrapped = Math.atan2(Math.sin(toward), Math.cos(toward));
      const want = h.doze > 0.5 ? 0 : near ? Math.max(-0.95, Math.min(0.95, wrapped)) : 0.35 * Math.sin(t * 0.4);
      look.current += (want - look.current) * Math.min(1, dt * (target ? 6 : 3));
      head.rotation.y = look.current + (g === "paw" ? 0.25 * Math.sin(gs * 20) * gk : 0);
      head.rotation.z = 0.04 * Math.sin(t * 0.9) + 0.08 * h.doze * Math.sin(t * 0.6);
      head.rotation.x = Math.max(g === "sleep" ? 0.45 * gk : g === "knock" ? 0.15 * gk : g === "count" ? 0.25 * gk : 0, h.doze * (0.4 + 0.08 * Math.sin(t * 0.9))) - (g === "gasp" ? 0.2 * gk : g === "cheer" ? 0.15 * gk : 0);
    }
    // a wave: the right arm up and waggling; or the gesture's arms; walking, a swing; skipping, a
    // little turn of the wrists with the rope; leaning in, the elbows to the knees
    const idleArm = (side: 1 | -1): { x: number; z: number } => {
      if (loop === "skip") return { x: 0.12 * Math.sin(turn), z: side * 0.05 * Math.cos(turn) };
      const swing = { x: 0.45 * Math.sin(stride + (side === 1 ? 0 : Math.PI)) * walk, z: 0 };
      return { x: swing.x - 0.35 * h.lean, z: swing.z + side * 0.1 * h.lean };
    };
    if (armR) {
      const w = performance.now() / 1000 - waveAt.current;
      const k = w >= 0 && w < WAVE_S ? Math.sin((Math.PI * w) / WAVE_S) : 0;
      if (g && k === 0) {
        const r = gestureArm(g, gs, gk, 1);
        armR.rotation.set(armRest.x + r.x, armRest.y, armRest.z + r.z);
      } else if (k > 0) armR.rotation.set(armRest.x - 0.3 * k, armRest.y, armRest.z - 2.3 * k + 0.35 * k * Math.sin(w * 14));
      else {
        const r = idleArm(1);
        armR.rotation.set(armRest.x + r.x, armRest.y, armRest.z + r.z);
      }
    }
    if (armL) {
      const r = g ? gestureArm(g, gs, gk, -1) : idleArm(-1);
      armL.rotation.set(armLRest.x + r.x, armLRest.y, armLRest.z + r.z);
    }
  });

  return <primitive object={model} />;
}

// the parts, once fused into the skin, are never drawn themselves (but still move, as its bones)
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

/** A material of this copy's own for every part painted like `body` (the model's clay is shared by
 *  every copy of it, and a fade must touch only this one). */
export function ownMaterial(model: THREE.Object3D, body: THREE.Mesh): THREE.Material {
  const shared = body.material as THREE.Material;
  const own = shared.clone();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === shared) m.material = own;
  });
  return own;
}

/** Fuses every part of `model` painted with the body's material into ONE skinned mesh at the
 *  model's root: each part becomes a bone of it (the part itself: its transform, as animated, is
 *  what moves its vertices), and is hidden. Parts in another material (a stall, a held prop) stay
 *  as they are. Nothing happens if the parts can't be merged (the model then draws as before). */
export function skinParts(model: THREE.Object3D, body: THREE.Mesh | null, prefix: string) {
  if (model.userData.skinned || !body?.isMesh || Array.isArray(body.material)) return;
  model.userData.skinned = true;
  const material = body.material;
  const parts: THREE.Mesh[] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === material) parts.push(m);
  });
  if (parts.length < 2) return;
  model.updateMatrixWorld(true);
  const toRoot = model.matrixWorld.clone().invert();
  // the attributes every part has (a merge needs one set), and all indexed or none
  const names = Object.keys(parts[0].geometry.attributes).filter((a) => parts.every((p) => p.geometry.attributes[a]));
  const indexed = parts.every((p) => p.geometry.index);
  const geos = parts.map((p, i) => {
    const src = indexed ? p.geometry : p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
    const g = new THREE.BufferGeometry();
    for (const a of names) g.setAttribute(a, src.attributes[a].clone());
    if (indexed && src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(toRoot.clone().multiply(p.matrixWorld));
    const n = g.attributes.position.count;
    const index = new Uint16Array(n * 4);
    const weight = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      index[v * 4] = i;
      weight[v * 4] = 1;
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
    return g;
  });
  const merged = mergeGeometries(geos);
  if (!merged) return;
  const skin = new THREE.SkinnedMesh(merged, material);
  skin.name = `${prefix}_Skin`;
  skin.raycast = noRaycast;
  skin.castShadow = body.castShadow;
  skin.receiveShadow = body.receiveShadow;
  model.add(skin);
  skin.updateMatrixWorld(true);
  skin.bind(new THREE.Skeleton(parts as unknown as THREE.Bone[], parts.map((p) => p.matrixWorld.clone().invert())), skin.matrixWorld);
  // culled by a sphere round the bind pose, grown for a raised arm or a bow
  skin.computeBoundingSphere();
  skin.boundingSphere!.radius *= 1.35;
  for (const p of parts) p.material = HIDDEN;
}

/** An arm's turn for a gesture (added to its rest pose): `side` 1 the right arm, -1 the left. Arms
 *  hang down; x below 0 swings one forward, z toward the middle is +side (the right arm is on -x). */
export function gestureArm(g: NpcGesture, s: number, k: number, side: 1 | -1): { x: number; z: number } {
  switch (g) {
    case "count": {
      // the referee's count: the right arm up by the head, then chopped down hard in front
      if (side === -1) return { x: -0.2 * k, z: 0 };
      const chop = s < 0.3 ? s / 0.3 : Math.max(0, 1 - (s - 0.3) / 0.12);
      return { x: (-0.6 - 2.0 * chop) * k, z: 0.1 * k };
    }
    case "raise":
      // the winner's arm raised: the right arm straight up, held, a little shake of triumph
      return side === 1 ? { x: -0.25 * k, z: (-2.85 + 0.06 * Math.sin(s * 9)) * k } : { x: 0, z: 0 };
    case "waveoff": {
      // it's over: both arms swept across each other overhead, twice
      const sweep = Math.sin(s * Math.PI * 2 * 1.35);
      return { x: -2.4 * k, z: side * (0.35 + 0.55 * sweep) * k };
    }
    case "flail":
      // hurrying in: both arms waving over the head
      return { x: (-2.2 + 0.5 * Math.sin(s * 18 + (side === 1 ? 0 : Math.PI))) * k, z: -side * 0.35 * k };
    case "cheer": {
      // both arms flung up and pumped
      const pump = Math.abs(Math.sin(s * 7 + (side === 1 ? 0 : 0.6)));
      return { x: (-2.55 - 0.3 * pump) * k, z: -side * 0.3 * k };
    }
    case "gasp":
      // the paws flown up to the cheeks
      return { x: -2.15 * k, z: side * 0.55 * k };
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
    case "punch": {
      // a one-two on the heavy bag, again and again: each arm driven out in turn from the guard
      const beat = Math.max(0, Math.sin(s * 11 + (side === 1 ? 0 : Math.PI)));
      return { x: -0.95 * beat * beat * k, z: side * 0.12 * beat * k };
    }
    case "shuffle":
      // both paws in front, riffling the deck: one then the other
      return { x: (-0.95 + 0.12 * Math.sin(s * 12 + (side === 1 ? 0 : Math.PI))) * k, z: side * (0.3 + 0.08 * Math.sin(s * 12)) * k };
    case "sleep":
      return { x: -0.35 * k, z: side * 0.2 * k };
    case "perk":
      return { x: -0.4 * k, z: -side * 0.5 * k };
  }
}
