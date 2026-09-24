import { forwardRef, memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, Text, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ACTIVITY_STATUSES, GESTURE_SECONDS, defaultLook, hashString, isActivityStatus, parseLook, type Gesture, type HeldItem, type Look, type PlayerAction, type SitPose } from "@shared/types";
import { AVATAR_HIP_Y } from "@shared/seats";
import { matte, noRaycast } from "../scene/kit";
import { ModelBoundary } from "./ModelBoundary";
import { AVATAR_MATERIALS, AVATAR_NODES, AVATAR_URL, AVATAR_VARIANT_PREFIX, DEFAULT_HAIR, OUTFIT_PARTS, hairUnderHat } from "./rig";

// The player avatar: a chibi clay figurine authored in Blender (scripts/blender/build_avatar.py)
// and loaded from client/public/models/avatar.glb. This file loads it, dresses it from the
// player's look and poses it; nothing here builds a body.
//
// Every avatar gets its own copy of the model. The rig contract (rig.ts) names the parts it moves,
// each with its pivot at the joint and no rotation of its own, so a pose is plain rotations from
// the rest transforms read out of the file:
//
//   Body     waddles and bobs while walking, lies back on a blanket, sways while dozing
//   Torso    breathes (scaled about its base)
//   Head     glances about, tilts, nods along with the waddle; Eyes blink
//   ArmL/R   swing, splay, wave, cheer, dance, hold a mug (the right hand) or a stick or rod
//   LegL/R   swing, and fold forward 90 degrees to sit (the hip height is shared/seats.ts's)
//
// The look picks the hair variant (Hair_<style>), the hat (Hat_<id>) and the outfit's top and
// bottom (Top_<id>, Bottom_<id>: OUTFIT_PARTS), and tints the materials the rig names: skin, hair,
// the top's and the bottom's fabrics, and the accent trims. Under a hat, a style too tall for it
// is worn as the short crop (rig.ts HAIR_TUCK).
// A garment's pieces ride on the parts they move with (the top's body on the Torso, its sleeves on
// the arms, the bottom's legs on the legs), so they breathe, swing and sit with the body.
//
// The outer group is the one the parent moves (Players: your locomotion, or the server's relayed
// position). Around the model it carries the voice rings and the overhead anchor: the nametag at
// AVATAR_ANCHOR_Y (raised over tall hair or a tall hat), and above it the activity badge, the
// chat bubble and floating emotes.

export type CharacterPose = "stand" | SitPose;

export interface FloatingEmote {
  id: number;
  emoji: string;
}

export interface AvatarProps {
  /** Discord user id: the defaults for a look nobody has chosen yet are derived from it. */
  userId: string;
  /** The wardrobe look (encodeLook); empty falls back to defaultLook(userId). */
  look?: string;
  /** "#rrggbb": the accent colour for the default look. */
  color: string;
  username: string;
  pose: CharacterPose;
  /** 0 = standing still, 1 = full walking speed. */
  speedRef: React.MutableRefObject<number>;
  holding?: HeldItem;
  action?: PlayerAction;
  speaking?: boolean;
  emotes?: FloatingEmote[];
  /** A social gesture in progress and when it started (performance.now). */
  gesture?: { kind: Gesture; at: number } | null;
  /** Activity status badge (an ActivityStatusId), "" for none. "afk" also dozes. */
  status?: string;
  /** A quick-chat line in a speech bubble (keyed so a repeat re-animates). */
  bubble?: { id: number; text: string } | null;
}

/** The overhead anchor: the nametag sits here, the badge, bubble and emotes stack above it. */
export const AVATAR_ANCHOR_Y = 1.25;
/** How far the nametag floats above the top of the head's hair or hat, when that reaches past AVATAR_ANCHOR_Y. */
const CROWN_CLEARANCE = 0.08;
const LYING_ANCHOR_Y = 0.72;

// --- motion ---
const COLOR_LERP = 0.15;
const WALK_CYCLE = 11; // radians/s: short legs take quick steps
const WADDLE_ROLL = 0.11;
const BOB_HEIGHT = 0.05;
const ARM_SWING = 0.7;
const LEG_SWING = 0.55;
// the arms hang a little away from the body; the shoulders sit out on a shelf (x 0.19), so a small
// splay puts the hands just clear of the hips
const ARM_SPLAY = 0.2;
const LIMB_LERP = 0.25;
const POSE_LERP = 0.18;
const SIT_LEG = -Math.PI / 2;
const SIT_ARM = -0.5;
const ROAST_ARM = -1.2;
const CUP_ARM = -1.05;
const FISH_ARM = -1.0;
const LIE_ROLL = -Math.PI / 2;
const LIE_LIFT = 0.26;

type PartKey = keyof typeof AVATAR_NODES;
type TintKey = keyof typeof AVATAR_MATERIALS;
interface Rig {
  root: THREE.Object3D;
  part: Record<PartKey, THREE.Object3D>;
  rest: Record<PartKey, { pos: THREE.Vector3; scale: THREE.Vector3 }>;
  /** The wardrobe variants under the head, by their name after the prefix. */
  hair: Map<string, THREE.Object3D>;
  hats: Map<string, THREE.Object3D>;
  /** Every top and bottom, by id, as the pieces it is made of across the parts. */
  tops: Map<string, THREE.Object3D[]>;
  bottoms: Map<string, THREE.Object3D[]>;
  /** This avatar's own copies of the tinted materials. */
  tint: Partial<Record<TintKey, THREE.MeshStandardMaterial>>;
}

const TINT_BY_MATERIAL = new Map(Object.entries(AVATAR_MATERIALS).map(([key, name]) => [name as string, key as TintKey]));

/** The wardrobe variants hung on `parent` (the head), by their name after the prefix. Only its
 *  direct children count: a variant made of several materials loads as a group whose meshes
 *  carry the same prefix, and those must stay part of it, not become variants of their own. */
function variants(parent: THREE.Object3D, prefix: string) {
  const found = new Map<string, THREE.Object3D>();
  for (const o of parent.children) if (o.name.startsWith(prefix)) found.set(o.name.slice(prefix.length), o);
  return found;
}

/** The garments hung on `parents`, by id: "Top_hoodie" and "Top_hoodie_SleeveL" are both pieces of
 *  the hoodie. Only direct children count, as for `variants`. */
function garments(parents: THREE.Object3D[], prefix: string) {
  const found = new Map<string, THREE.Object3D[]>();
  for (const parent of parents)
    for (const o of parent.children) {
      if (!o.name.startsWith(prefix)) continue;
      const id = o.name.slice(prefix.length).split("_")[0];
      found.set(id, [...(found.get(id) ?? []), o]);
    }
  return found;
}

/** A fresh copy of the model, its parts found by name and its tinted materials made its own. */
function useRig(): Rig {
  const { scene } = useGLTF(AVATAR_URL);
  const rig = useMemo(() => {
    const root = scene.clone(true);
    // The GLTF cache hands every avatar the same materials. The ones the look recolours are cloned
    // here, once per avatar, so one player's colours never repaint anyone else. Each is shared by
    // every mesh of this avatar that uses it: Mat_Skin covers the head (ears too), trunk, arms and
    // legs, so a skin tone lands on all of them at once, while the eyes and blush keep their own.
    const tint: Rig["tint"] = {};
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast; // clicks go to the floor and the seats, never to a player
      const key = TINT_BY_MATERIAL.get((mesh.material as THREE.Material).name);
      if (key) mesh.material = tint[key] ??= (mesh.material as THREE.MeshStandardMaterial).clone();
    });
    const part = {} as Rig["part"];
    const rest = {} as Rig["rest"];
    for (const key of Object.keys(AVATAR_NODES) as PartKey[]) {
      const node = root.getObjectByName(AVATAR_NODES[key]);
      if (!node) throw new Error(`avatar.glb has no "${AVATAR_NODES[key]}" node`);
      part[key] = node;
      rest[key] = { pos: node.position.clone(), scale: node.scale.clone() };
    }
    // seat anchors (shared/seats.ts) assume the hips at AVATAR_HIP_Y: a model built to other
    // proportions would float over, or sink into, every cushion
    const hipY = part.legL.getWorldPosition(new THREE.Vector3()).y - part.root.getWorldPosition(new THREE.Vector3()).y;
    if (Math.abs(hipY - AVATAR_HIP_Y) > 1e-3) console.warn(`[models] avatar.glb hips at ${hipY.toFixed(3)}, seats expect ${AVATAR_HIP_Y}`);
    part.mug.visible = false;
    const limbs = [part.torso, part.body, part.armL, part.armR, part.legL, part.legR];
    return {
      root,
      part,
      rest,
      tint,
      hair: variants(part.head, AVATAR_VARIANT_PREFIX.hair),
      hats: variants(part.head, AVATAR_VARIANT_PREFIX.hat),
      tops: garments(limbs, AVATAR_VARIANT_PREFIX.top),
      bottoms: garments(limbs, AVATAR_VARIANT_PREFIX.bottom),
    };
  }, [scene]);
  useEffect(() => () => Object.values(rig.tint).forEach((m) => m.dispose()), [rig]);
  return rig;
}

interface RigProps {
  look: Look;
  pose: CharacterPose;
  speedRef: React.MutableRefObject<number>;
  holding: HeldItem;
  action: PlayerAction;
  gesture: { kind: Gesture; at: number } | null;
  status: string;
  seed: number;
  /** Told the height of the top of the hair or hat being worn, so the nametag clears it. */
  onCrownTop: (y: number) => void;
}

function AvatarModel({ look, pose, speedRef, holding, action, gesture, status, seed, onCrownTop }: RigProps) {
  const rig = useRig();
  const shirtGoal = useRef(new THREE.Color());
  const walkPhase = useRef(0);
  const blink = useRef({ next: 2 + Math.random() * 3, t: 0 });
  // an occasional curious head tilt while idle, on its own per-avatar schedule
  const tilt = useRef({ next: 4 + Math.random() * 6, until: 0, dir: 1 });

  // dress: the hair style, the hat, the outfit and the colours from the look
  useEffect(() => {
    const style = hairUnderHat(rig.hair.has(look.hairStyle) ? look.hairStyle : DEFAULT_HAIR, look.hat);
    rig.hair.forEach((node, name) => (node.visible = name === style));
    rig.hats.forEach((node, name) => (node.visible = name === look.hat));
    // the top of whatever the head wears, measured in the model's own space
    rig.root.updateWorldMatrix(true, true);
    const toModel = rig.root.matrixWorld.clone().invert();
    const worn = [rig.hair.get(style), rig.hats.get(look.hat)].filter((o): o is THREE.Object3D => !!o);
    onCrownTop(Math.max(0, ...worn.map((o) => new THREE.Box3().setFromObject(o).applyMatrix4(toModel).max.y)));
    const outfit = OUTFIT_PARTS[look.outfit] ?? OUTFIT_PARTS.outfit_starter_hoodie;
    rig.tops.forEach((pieces, id) => pieces.forEach((node) => (node.visible = id === outfit.top)));
    rig.bottoms.forEach((pieces, id) => pieces.forEach((node) => (node.visible = id === outfit.bottom)));
    rig.tint.skin?.color.set(look.skin);
    rig.tint.accent?.color.set(look.outfitColor);
    rig.tint.hair?.color.set(look.hair);
    rig.tint.trousers?.color.set(look.pants);
    shirtGoal.current.set(look.shirt);
  }, [rig, look, onCrownTop]);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const t = clock.elapsedTime;
    const { part, rest } = rig;
    rig.tint.clothes?.color.lerp(shirtGoal.current, COLOR_LERP);

    const seated = pose !== "stand";
    const speed = seated ? 0 : speedRef.current;
    const walking = speed > 0.05;
    if (walking) walkPhase.current += delta * WALK_CYCLE * (0.6 + 0.4 * speed);
    const phase = walkPhase.current;
    const swing = walking ? Math.sin(phase) * Math.min(1, speed * 1.4) : 0;
    const fishing = action === "fish" || action === "afkfish" || action === "reel";
    const dizzy = action === "dizzy";
    const dozing = status === "afk" && !walking && pose === "stand";

    // --- limbs (ArmR is her right hand: it holds the mug and waves) ---
    let armL = -swing * ARM_SWING;
    let armR = swing * ARM_SWING;
    let legs: [number, number] = [swing * LEG_SWING, -swing * LEG_SWING];
    if (pose === "sit") {
      armL = armR = SIT_ARM;
      legs = [SIT_LEG, SIT_LEG];
    } else if (pose === "lie") {
      armL = armR = 0;
      legs = [0, 0];
    } else if (!walking) {
      const idle = Math.sin(t * 1.3 + seed) * 0.05;
      armL = -idle;
      armR = idle;
    }
    // social gestures, only while standing still
    const gAge = gesture ? (performance.now() - gesture.at) / 1000 : Infinity;
    const g = gesture && gAge < GESTURE_SECONDS[gesture.kind] && !walking && pose === "stand" ? gesture.kind : null;
    let wave = 0;
    if (g === "wave") {
      armR = -2.75;
      wave = Math.sin(gAge * 11) * 0.4;
    } else if (g === "dance") {
      armL = -2.3 + Math.sin(gAge * 7) * 0.6;
      armR = -2.3 - Math.sin(gAge * 7) * 0.6;
      legs = [Math.max(0, Math.sin(gAge * 7)) * -0.4, Math.max(0, -Math.sin(gAge * 7)) * -0.4];
    } else if (g === "cheers") {
      armR = -2.45 + Math.sin(gAge * 3) * 0.1;
    }
    if (holding === "marshmallow") armL = armR = ROAST_ARM;
    if (fishing) armR = FISH_ARM + Math.sin(t * 1.1) * 0.04;
    if (action === "reel") {
      armR = FISH_ARM - 0.3 + Math.sin(t * 9) * 0.18;
      armL = FISH_ARM - 0.1 + Math.sin(t * 9 + 1) * 0.12;
    }
    if (dizzy) armL = armR = -0.6;
    const holdingCup = holding === "coffee" && pose !== "lie" && !fishing;
    if (holdingCup) armR = CUP_ARM + swing * 0.1;

    const L = THREE.MathUtils.lerp;
    const k = seated ? POSE_LERP : LIMB_LERP;
    part.armL.rotation.x = L(part.armL.rotation.x, armL, k);
    part.armR.rotation.x = L(part.armR.rotation.x, armR, k);
    part.armL.rotation.z = L(part.armL.rotation.z, pose === "lie" ? 0.1 : ARM_SPLAY, 0.3);
    part.armR.rotation.z = L(part.armR.rotation.z, (pose === "lie" ? -0.1 : -ARM_SPLAY) - wave, 0.3);
    part.legL.rotation.x = L(part.legL.rotation.x, legs[0], k);
    part.legR.rotation.x = L(part.legR.rotation.x, legs[1], k);

    // --- body: waddle when walking, lie back on a blanket, sway while dizzy or dozing ---
    const body = part.body;
    const lying = pose === "lie" || g === "nap";
    const bob = walking ? Math.abs(Math.sin(phase)) * BOB_HEIGHT : g === "dance" ? Math.abs(Math.sin(gAge * 7)) * 0.08 : 0;
    body.position.y = L(body.position.y, rest.body.pos.y + (lying ? LIE_LIFT : bob), k);
    body.rotation.x = L(body.rotation.x, lying ? LIE_ROLL : walking ? 0.06 * speed : dizzy ? Math.sin(t * 4.5) * 0.12 : 0, k);
    body.rotation.z = L(body.rotation.z, walking ? Math.sin(phase) * WADDLE_ROLL : dizzy ? Math.cos(t * 4.5) * 0.28 : dozing ? Math.sin(t * 0.9) * 0.05 : 0, k);
    body.rotation.y = L(body.rotation.y, g === "dance" ? Math.sin(gAge * 3.5) * 0.6 : 0, 0.2);

    // --- breathing: the torso swells about its base ---
    const breath = walking ? 0 : Math.sin(t * 2.1 + seed) * 0.018;
    const ts = rest.torso.scale;
    part.torso.scale.set(ts.x * (1 - breath * 0.5), ts.y * (1 + breath), ts.z);

    // --- head: glance about and tilt when idle, nod along with the waddle ---
    const head = part.head;
    const idleLook = !walking && pose === "stand" ? Math.sin(t * 0.45 + seed) * 0.35 * Math.max(0, Math.sin(t * 0.21 + seed * 2)) : 0;
    head.rotation.y = L(head.rotation.y, idleLook, 0.06);
    const tl = tilt.current;
    if (!walking && t > tl.next) {
      tl.until = t + 1.4;
      tl.dir = Math.random() < 0.5 ? -1 : 1;
      tl.next = t + 6 + Math.random() * 9;
    }
    const tiltZ = !walking && t < tl.until ? tl.dir * 0.22 : 0;
    head.rotation.z = L(head.rotation.z, walking ? -Math.sin(phase) * 0.06 : tiltZ, walking ? 0.2 : 0.08);
    head.position.y = rest.head.pos.y + (walking ? 0 : Math.sin(t * 2.1 + seed) * 0.006);

    // --- blink (and eyes shut for a nap or a doze) ---
    const b = blink.current;
    b.t += delta;
    let open = 1;
    if (b.t > b.next) {
      const p = (b.t - b.next) / 0.14;
      open = p < 1 ? Math.abs(1 - p * 2) : 1;
      if (p >= 1) {
        b.t = 0;
        b.next = 2.5 + Math.random() * 3.5;
      }
    }
    part.eyes.scale.y = rest.eyes.scale.y * (g === "nap" || dozing ? 0.1 : Math.max(0.1, open));

    // --- the mug stays upright whatever the arm does ---
    part.mug.visible = holdingCup;
    part.mug.rotation.x = -part.armR.rotation.x;
  });

  return <primitive object={rig.root} />;
}

// the stand-in while the model loads, or if it cannot: a plain capsule of her size
const STAND_IN_GEO = new THREE.CapsuleGeometry(0.24, 0.6, 4, 12);
const STAND_IN_MAT = matte("#e8d5c4", 0.8);
function StandIn() {
  return <mesh geometry={STAND_IN_GEO} material={STAND_IN_MAT} position={[0, 0.54, 0]} raycast={noRaycast} />;
}

// the voice rings: two pulses spreading from the feet while speaking
const RING_GEO = new THREE.RingGeometry(0.62, 0.7, 40);

/** A player: the model, dressed and posed, with the nametag and the overhead overlays. */
export const Avatar = memo(
  forwardRef<THREE.Group, AvatarProps>(function Avatar({ userId, look, color, username, pose, speedRef, holding = "", action = "", speaking = false, emotes = [], gesture = null, status = "", bubble = null }, ref) {
    const outfit = useMemo(() => parseLook(look) ?? defaultLook(userId || username, color), [look, userId, username, color]);
    // every avatar breathes and glances round on its own clock, so a crowd never moves in unison
    const seed = useMemo(() => (hashString(userId || username) % 1000) / 100, [userId, username]);

    const ringA = useRef<THREE.Mesh>(null);
    const ringB = useRef<THREE.Mesh>(null);
    const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#43d17a", transparent: true, opacity: 0, depthWrite: false }), []);
    useEffect(() => () => ringMat.dispose(), [ringMat]);
    useFrame(({ clock }) => {
      const t = clock.elapsedTime;
      ringMat.opacity = THREE.MathUtils.lerp(ringMat.opacity, speaking ? 0.85 : 0, 0.25);
      const show = ringMat.opacity > 0.02;
      [ringA.current, ringB.current].forEach((ring, i) => {
        if (!ring) return;
        ring.visible = show;
        ring.scale.setScalar(0.5 + ((t * 1.5 + i * 0.5) % 1) * 0.55);
      });
    });

    const [crownTop, setCrownTop] = useState(0);
    const lying = pose === "lie";
    const anchorY = lying ? LYING_ANCHOR_Y : Math.max(AVATAR_ANCHOR_Y, crownTop + CROWN_CLEARANCE);
    const badge = isActivityStatus(status);
    const overheadY = anchorY + (badge ? 0.7 : 0.32);

    return (
      <group ref={ref}>
        <mesh ref={ringA} geometry={RING_GEO} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false} raycast={noRaycast} />
        <mesh ref={ringB} geometry={RING_GEO} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.031, 0]} visible={false} raycast={noRaycast} />

        <ModelBoundary what="avatar.glb" fallback={<StandIn />}>
          <Suspense fallback={<StandIn />}>
            <AvatarModel look={outfit} pose={pose} speedRef={speedRef} holding={holding} action={action} gesture={gesture} status={status} seed={seed} onCrownTop={setCrownTop} />
          </Suspense>
        </ModelBoundary>

        {/* the Billboard cancels the avatar's facing, so the name never turns or mirrors */}
        {username && (
          <Billboard position={[0, anchorY, 0]}>
            {/* `font` MUST stay set: without it troika-three-text reaches for a CDN font that
                Discord's Activity CSP blocks */}
            <Text font="/fonts/kenpixel.ttf" fontSize={0.15} maxWidth={1.6} overflowWrap="break-word" textAlign="center" color={speaking ? "#8dffae" : "#ffffff"} anchorX="center" anchorY="middle" outlineColor="#000000" outlineWidth={0.02}>
              {username}
            </Text>
          </Billboard>
        )}

        {/* emoji need the platform's colour-emoji font, which WebGL text cannot use, so these are
            DOM overlays (no distanceFactor: under an orthographic camera it scales runaway) */}
        {badge && (
          <Html position={[0, anchorY + 0.42, 0]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
            <div style={{ position: "relative" }}>
              <span className="cozy-status">
                {ACTIVITY_STATUSES[status].emoji} {ACTIVITY_STATUSES[status].label}
              </span>
              {status === "afk" && (
                <>
                  <span className="cozy-zzz">z</span>
                  <span className="cozy-zzz">z</span>
                  <span className="cozy-zzz">Z</span>
                </>
              )}
            </div>
          </Html>
        )}
        {bubble && (
          <Html key={bubble.id} position={[0, overheadY + 0.15, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div className="cozy-chat-bubble" style={{ position: "relative" }}>
              {bubble.text}
            </div>
          </Html>
        )}
        {(emotes.length > 0 || speaking) && (
          <Html position={[0, anchorY + (badge ? 0.66 : 0.3), 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
            <div style={{ position: "relative", width: 0, height: 0 }}>
              {speaking && <span className="cozy-speaking">🎵</span>}
              {emotes.map((e) => (
                <span key={e.id} className="cozy-emote">
                  {e.emoji}
                </span>
              ))}
            </div>
          </Html>
        )}
      </group>
    );
  })
);

/** The name the rest of the app grew up with. */
export const Character3D = Avatar;

export default Avatar;

useGLTF.preload(AVATAR_URL);
