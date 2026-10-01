import { riderWalking } from "../scene/winchRide";
import { forwardRef, memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, Text, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ACTIVITY_STATUSES, DRINK_BASE_INFO, GESTURE_SECONDS, defaultLook, hashString, isActivityStatus, parseDrink, parseLook, parseSnack, type Gesture, type HeldItem, type Look, type PlayerAction, type RoastFood, type RoastQuality, type SitPose } from "@shared/types";
import { AVATAR_HIP_Y, AVATAR_LIE_LIFT } from "@shared/seats";
import { CAVE_TRAILS, cavernsFloorY } from "@shared/worlds/caverns";
import { activityPose, chiselBeat, forgeBeat, type Activity } from "./activityAnimations";
import { activity, nowS, remoteBlows } from "../systems/activityStore";
import { matte, noRaycast } from "../scene/kit";
import { xrayGate } from "../scene/occlusion";
import { ModelBoundary } from "./ModelBoundary";
import { CasinoAura } from "./CasinoAura";
import { capsuleTitle } from "@shared/casino";
import { specialTitle } from "@shared/items";
import { canoeBob, canoePitch, canoeRoll } from "../scene/canoeMotion";
import { AVATAR_MATERIALS, AVATAR_NODES, AVATAR_URL, AVATAR_VARIANT_PREFIX, CROWN_HATS, DEFAULT_HAIR, GLOVES_URL, GLOVE_HAND, HAIR_PROP_SUFFIX, MUG_TOPPING_PREFIX, OUTFIT_PARTS, SKEWER_PIECE_PREFIX, coversEars, hairUnderHat } from "./rig";
import { BELT_TITLE, type FighterState } from "@shared/boxing";
import { getBout, useFighterState } from "../systems/boutStore";
import { combatNow, fightAnimOf } from "../systems/fightAnim";
import { boxerPose, emptyPose } from "./boxingAnimations";
import { EmoteGlyph } from "../components/hud/VelvetChipIcon";
import { useNameplateSettings } from "./nameplateSettings";
import { Nametag } from "./Nametag";

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
//   Head     glances about, tilts, nods along with the waddle, bobs to the radio; Eyes blink, and
//            EyesHappy (^ ^) stand in for them over a sip of something warm
//   ArmL/R   swing, splay, wave, cheer, dance, hold a mug (the right hand) or a stick or rod,
//            reach over the board to play a move, tip a WateringCan over a plant; at the
//            campfire, hold a Skewer over the fire and nibble it, cast a FishingRod (its line runs
//            to the Bobber on the water), strum the Guitar across the lap on a log bench
//   LegL/R   swing, and fold forward 90 degrees to sit (the hip height is shared/seats.ts's)
//
// In the Velvet Ring a fighter wears boxing gloves (boxing_gloves.glb, hung on ArmL / ArmR where the
// hands are: a Classic pair in their corner's colour) and is posed by the ring's own animation suite
// (boxingAnimations.ts: the peek-a-boo stance, the Ring Shuffle, the M1 string, the Heavy Smash, the
// shell, the slips, the hit reactions, the knockdown and the push-up back up), from the bout's state
// (systems/boutStore.ts) and the fight anims its events start (systems/fightAnim.ts), on the combat
// clock (it stops for a hitstop). The M2's wind-up shimmers the air round the rear glove, and a
// fighter dazed, staggered or down sees stars.
//
// The look picks the hair variant (Hair_<style>), the hat (Hat_<id>) and the outfit's top and
// bottom (Top_<id>, Bottom_<id>: OUTFIT_PARTS), and tints the materials the rig names: skin, hair,
// the top's and the bottom's fabrics, and the accent trims. Under a hat, a style too tall for it
// is worn as the short crop (rig.ts HAIR_TUCK), and a style's raised part (its _Prop node: a tail,
// buns, a knot) is hidden under a hat that covers the crown. The ears are their own nodes, hidden
// while the style worn covers them (rig.ts HAIR_STYLE_META).
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
  /** What is in the mug (shared/types encodeDrink), "" for a plain coffee. */
  drink?: string;
  action?: PlayerAction;
  speaking?: boolean;
  emotes?: FloatingEmote[];
  /** A social gesture in progress and when it started (performance.now). */
  gesture?: { kind: Gesture; at: number } | null;
  /** Activity status badge (an ActivityStatusId), "" for none. "afk" also dozes. */
  status?: string;
  /** A quick-chat line in a speech bubble (keyed so a repeat re-animates). */
  bubble?: { id: number; text: string } | null;
  /** Seated on a cushion round the radio while it plays: the head bobs and the body sways to it. */
  vibe?: boolean;
  /** Sitting in the campfire's canoe: rocking with the boat on the water. */
  rock?: boolean;
  /** Seated at the board while the opponent thinks: the head tilts, waiting. */
  awaiting?: boolean;
  /** On the skewer while holding "skewer" (shared/types encodeSnack). */
  snack?: string;
  /** 0..1 progress of the current action: a fishing bite is 1 (the bobber is under). */
  actionProgress?: number;
  /** Where this angler's bobber floats (world space), while fishing the campfire's river. */
  bobberAt?: { x: number; y: number; z: number } | null;
  /** Tapping the bite mark (your own avatar only): set the hook. */
  onHook?: () => void;
  /** Well-Fed (a campfire meal): a bouncier step. */
  fed?: boolean;
  /** Fishing with the Starlight Composite: a shimmer of stars about the rod's tip. */
  rodAura?: boolean;
  /** You: an x-ray silhouette shows through anything standing between you and the camera. */
  xray?: boolean;
  /** A capsule title worn over the name (shared/casino.ts CAPSULE_PRIZES id), "" for none. */
  title?: string;
  /** A drink's glow (PlayerState.aura): a casino drink shows round them (entities/CasinoAura.tsx). */
  aura?: string;
  /** Their session (the Velvet Ring's bout knows its fighters by it). */
  sessionId?: string;
  /** The boxing gloves worn in the ring ("red", "tiger"), "" for none. */
  gloves?: string;
  /** Wearing the Velvet Championship Belt: its gold badge over the name. */
  champion?: boolean;
  /** You (your own beats at work are played the moment they happen: systems/activityStore.ts). */
  local?: boolean;
  /** The world they are in (the Glimmering Caverns' rope descent is walked with a hand on the rope). */
  map?: string;
  /** How heavy their pickaxe swings (entities/activityAnimations.ts pickWeight). */
  pickWeight?: number;
}

/** A capsule title's words, over the name (a special title, the Velvet Pioneer's, is drawn apart:
 *  in glowing gold, and with an emoji WebGL text cannot draw). */
function titleText(id: string): string {
  const prize = capsuleTitle(id);
  return prize ? prize.name : "";
}

/** The overhead anchor: the nametag sits here, the badge, bubble and emotes stack above it. */
export const AVATAR_ANCHOR_Y = 1.25;

// The nameplate, sized to the camera: the name is NAME_SIZE world units tall, but never drawn
// smaller or larger on screen than NAME_PX (a close zoom would blow it up, a far one shrink it to
// nothing); the title over it is a micro badge (TITLE_PX, about 10px) standing TITLE_GAP_PX clear
// of the name's top. Orthographic: the camera's zoom is its pixels per world unit.
const NAME_SIZE = 0.15;
const NAME_PX = { min: 8, max: 14 };
const TITLE_SIZE = 0.1;
const TITLE_PX = { min: 7, max: 10 };
const TITLE_GAP_PX = 4;
const clampPx = (v: number, r: { min: number; max: number }) => Math.max(r.min, Math.min(r.max, v));
/** How far the nametag floats above the top of the head's hair or hat, when that reaches past AVATAR_ANCHOR_Y. */
const CROWN_CLEARANCE = 0.08;
const LYING_ANCHOR_Y = 0.72;

// --- motion ---
const COLOR_LERP = 0.15;
const WALK_CYCLE = 11; // radians/s: short legs take quick steps
/** The ring's footwork: the ground one full stride (a step and its follow) covers, in metres. */
const STRIDE_M = 0.42;
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
// sitting on the dock's edge: the legs hang down over the water (forward and down), swinging
const DANGLE_LEG = -0.95;
const DANGLE_SWING = 0.16;
// the reel: leaning back against the fish, the rod's tip dipping and jerking toward it
const REEL_LEAN = -0.2;
// the firefly net's swipe: up and over, then down through the air
const NET_UP_ARM = -2.6;
const NET_DOWN_ARM = -0.6;
// the firefly jar, held out a little in the left hand
const JAR_ARM = -0.55;
// sitting cross-legged on the ground: the thighs forward and a touch down, crossed in front
const CROSS_LEG_X = -Math.PI / 2 + 0.12;
const CROSS_LEG_Y = 0.9;
const CROSS_ARM = -0.75;
// the cheer: both arms up
const CHEER_ARM = -2.6;
/** A new personal best held high: both arms straight up over the head. */
const TROPHY_ARM = -2.95;
// the heart: both hands together at the chest while it floats up
const HEART_ARM = -1.15;
// the toss to the raccoon: back, then up and over
const TOSS_BACK_ARM = 0.5;
const TOSS_OVER_ARM = -2.3;
const SIT_ARM = -0.5;
const ROAST_ARM = -1.2;
const CUP_ARM = -1.05;
// a sip now and then (every SIP_EVERY..+SIP_JITTER s): the mug comes up to the mouth, the head
// tips back a touch and the eyes close happily (^ ^)
const SIP_ARM = -1.95;
const SIP_TILT = -0.12;
const SIP_SECONDS = 1.2;
const SIP_EVERY = 12;
const SIP_JITTER = 3;
// watering a plant: a lean forward, the arm out with the can, which tips forward to pour
const WATER_LEAN = 0.2;
const WATER_ARM = -1.7;
const WATER_POUR = 0.4;
// playing a move at the board: the hand goes out over the table (REACH_OUT s), holds, and comes back
const REACH_ARM = -1.3;
const REACH_LEAN = 0.1;
const REACH_OUT = 0.35;
const REACH_HOLD = 0.1;
// waiting on the opponent: a small thoughtful head tilt (5 degrees)
const AWAIT_TILT = (5 * Math.PI) / 180;
// vibing to the radio on a cushion: a head bob on the beat and a slow sway
const VIBE_BEAT = 3.5;
const VIBE_BOB = 0.08;
const VIBE_SWAY = 0.045;
// the steam off a hot drink: a few soft wisps rising from the mug, in the mug's own (upright) space
const STEAM_COUNT = 3;
const STEAM_BASE = new THREE.Vector3(0, 0.075, 0.07);
const STEAM_RISE = 0.26;
const STEAM_GEO = new THREE.SphereGeometry(1, 8, 6);
const STEAM_MAT = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.65, depthWrite: false });
// the fishing line, and the rings a bite sends out across the water
const LINE_MAT = new THREE.LineBasicMaterial({ color: "#f4efe6" });
const RIPPLE_GEO = new THREE.RingGeometry(0.07, 0.09, 28);
const RIPPLE_MAT = new THREE.MeshBasicMaterial({ color: "#dff3ff" });
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const FISH_ARM = -1.0;
// the chopping block: the hatchet held up overhead while the meter runs, then brought down
const CHOP_RAISE_ARM = -2.75;
const CHOP_DOWN_ARM = -0.55;
// prospecting in the caverns: the pickaxe held at the shoulder, ready, then (the server's "mine"
// gesture, on every strike) a short hard swing into the rock
const MINE_READY_ARM = -2.1;
const MINE_HIT_ARM = -0.8;
// the telescope: both hands up to the eyepiece
const STARGAZE_ARM = -1.35;
// the rod held in both hands: the left arm reaches in across the body to the grip
const TWO_HAND_IN = 0.42;
// the belly rub: both paws on the tummy, reaching in
const BELLY_ARM = -0.62;
const BELLY_IN = 0.34;
// Well-Fed: how much bouncier the step is
const FED_BOUNCE = 1.9;
// casting into the river: the rod swings up and back, then over and out (CAST_SECONDS)
const CAST_BACK_ARM = -2.5;
const CAST_SECONDS = 0.7;
// roasting at the campfire: the skewer held out over the fire, then carried and nibbled from the
// tip (a bite every BITE_EVERY..+BITE_JITTER s, the arm up for BITE_SECONDS)
const GRILL_ARM = -1.3;
const SKEWER_HOLD_ARM = -0.95;
const BITE_ARM = -1.85;
const BITE_SECONDS = 0.9;
const BITE_EVERY = 6;
const BITE_JITTER = 3;
/** The stick's tip a little up while carried, a little down over the fire (radians about x). */
const SKEWER_LEVEL = -0.3;
const SKEWER_OVER_FIRE = 0.15;
/** The food's colours by how it came off the fire (the marshmallows or the meat, and the peppers). */
const ROAST_TINTS: Record<RoastFood, Record<RoastQuality, { food: string; veg: string }>> = {
  mallow: { raw: { food: "#fff6e6", veg: "#6fae4b" }, golden: { food: "#e8a94e", veg: "#6fae4b" }, charred: { food: "#3b2a20", veg: "#2f3326" } },
  bbq: { raw: { food: "#d98a7a", veg: "#6fae4b" }, golden: { food: "#9b5a33", veg: "#5e8a38" }, charred: { food: "#2b211c", veg: "#2f3326" } },
};
// the guitar on a log bench: the left hand up the neck, the right strumming over the sound hole
const GUITAR_NECK_ARM = -0.95;
const GUITAR_NECK_SPLAY = 0.55;
const STRUM_ARM = -0.62;
const STRUM_SWING = 0.14;
const STRUM_RATE = 10;
const LIE_ROLL = -Math.PI / 2;
// lying down (a blanket, an AFK nap on a sofa): legs eased up a touch, hands resting on the tummy
const LIE_LEGS = -0.12;
const LIE_ARMS = -0.55;
// dozing in a seat: the head nods forward and lolls a little to one side
const DOZE_NOD = 0.28;
const DOZE_LOLL = 0.14;

type PartKey = keyof typeof AVATAR_NODES;
type TintKey = keyof typeof AVATAR_MATERIALS;
interface Rig {
  root: THREE.Object3D;
  part: Record<PartKey, THREE.Object3D>;
  rest: Record<PartKey, { pos: THREE.Vector3; scale: THREE.Vector3 }>;
  /** The wardrobe variants under the head, by their name after the prefix. */
  hair: Map<string, THREE.Object3D>;
  /** The mug's toppings, by topping id, and the steam wisps rising off it. */
  toppings: Map<string, THREE.Object3D>;
  steam: THREE.Mesh[];
  /** The skewer's food, tip first, by food; the steam off a golden roast; the fishing line and the
   *  bite's ripples (both in the model's own space, round the bobber). */
  skewerPieces: Record<RoastFood, THREE.Object3D[]>;
  skewerSteam: THREE.Mesh[];
  line: THREE.Line;
  ripples: THREE.Mesh[];
  /** Each style's raised part (Hair_<style>_Prop, a child of its hair node), by style. */
  hairProps: Map<string, THREE.Object3D>;
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

/**
 * Show or hide a wardrobe variant. A variant never moves relative to the part it hangs on, so its
 * local matrices are baked once (bakeStatic); a hidden one also stops refreshing its world
 * matrix, so the dozens of variants nobody is wearing cost nothing in the frame's scene update.
 */
function show(node: THREE.Object3D, on: boolean) {
  node.visible = on;
  node.matrixWorldAutoUpdate = on;
}

function bakeStatic(node: THREE.Object3D) {
  node.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}

/** A fresh copy of the model, its parts found by name and its tinted materials made its own. */
function useRig(): Rig {
  const { scene } = useGLTF(AVATAR_URL);
  const rig = useMemo(() => {
    const root = scene.clone(true);
    // The GLTF cache hands every avatar the same materials. The ones the look recolours are cloned
    // here, once per avatar, so one player's colours never repaint anyone else. Each is shared by
    // every mesh of this avatar that uses it: Mat_Skin covers the head and ears, trunk, arms and
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
    part.wateringCan.visible = false;
    part.hatchet.visible = false;
    part.pickaxe.visible = false;
    part.net.visible = false;
    part.fireflyJar.visible = false;
    part.heart.visible = false;
    part.heart.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.emissive && m.emissive.getHex() !== 0) m.toneMapped = false;
    });
    // crossing the legs turns each about the vertical after folding it forward
    part.legL.rotation.order = "YXZ";
    part.legR.rotation.order = "YXZ";
    // the jar glows from within: keep its colour out of the tone mapping
    part.fireflyJar.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.emissive && m.emissive.getHex() !== 0) m.toneMapped = false;
    });
    part.eyesHappy.visible = false;
    for (const key of ["skewer", "fishingRod", "guitar", "bobber"] as const) part[key].visible = false;
    const pieces = (prefix: string) => [...variants(part.skewer, prefix).entries()].sort(([a], [b]) => Number(a) - Number(b)).map(([, node]) => node);
    const skewerPieces = { mallow: pieces(SKEWER_PIECE_PREFIX.mallow), bbq: pieces(SKEWER_PIECE_PREFIX.bbq) };
    const skewerSteam = Array.from({ length: STEAM_COUNT }, () => {
      const wisp = new THREE.Mesh(STEAM_GEO, STEAM_MAT);
      wisp.raycast = noRaycast;
      wisp.visible = false;
      part.skewer.add(wisp);
      return wisp;
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)), LINE_MAT);
    line.frustumCulled = false;
    line.visible = false;
    line.raycast = noRaycast;
    root.add(line);
    const ripples = [0, 1].map(() => {
      const ring = new THREE.Mesh(RIPPLE_GEO, RIPPLE_MAT);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      ring.raycast = noRaycast;
      root.add(ring);
      return ring;
    });
    const toppings = variants(part.mug, MUG_TOPPING_PREFIX);
    const steam = Array.from({ length: STEAM_COUNT }, () => {
      const wisp = new THREE.Mesh(STEAM_GEO, STEAM_MAT);
      wisp.raycast = noRaycast;
      wisp.visible = false;
      part.mug.add(wisp);
      return wisp;
    });
    const limbs = [part.torso, part.body, part.armL, part.armR, part.legL, part.legR];
    const wardrobe = {
      hair: variants(part.head, AVATAR_VARIANT_PREFIX.hair),
      hats: variants(part.head, AVATAR_VARIANT_PREFIX.hat),
      tops: garments(limbs, AVATAR_VARIANT_PREFIX.top),
      bottoms: garments(limbs, AVATAR_VARIANT_PREFIX.bottom),
    };
    const hairProps = new Map<string, THREE.Object3D>();
    wardrobe.hair.forEach((node, style) => {
      const prop = node.getObjectByName(`${AVATAR_VARIANT_PREFIX.hair}${style}${HAIR_PROP_SUFFIX}`);
      if (prop) hairProps.set(style, prop);
    });
    wardrobe.hair.forEach(bakeStatic);
    wardrobe.hats.forEach(bakeStatic);
    wardrobe.tops.forEach((pieces) => pieces.forEach(bakeStatic));
    wardrobe.bottoms.forEach((pieces) => pieces.forEach(bakeStatic));
    return { root, part, rest, tint, hairProps, toppings, steam, skewerPieces, skewerSteam, line, ripples, ...wardrobe };
  }, [scene]);
  useEffect(
    () => () => {
      Object.values(rig.tint).forEach((m) => m.dispose());
      rig.line.geometry.dispose();
    },
    [rig]
  );
  return rig;
}

/** The x-ray silhouette: each part of you drawn again in a warm flat glow, only where something is
 *  in front of it (depth "greater"), just before you are (render order 1 against your 2, the world's
 *  0), so it never shows through your own parts; pulled a touch toward the camera so the ground
 *  under your feet never lights it. One opaque pass: no sorting. Where the world keeps an occlusion
 *  index (scene/occlusion.ts `xrayGate`: the caverns), it is drawn only while something actually
 *  stands between you and the camera: a second draw of every part saved the rest of the time. */
const XRAY_MAT = new THREE.MeshBasicMaterial({ color: "#ffe2b0", depthWrite: false, depthFunc: THREE.GreaterDepth, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -60, toneMapped: false });
function useXray(root: THREE.Object3D, on: boolean) {
  const ghosts = useRef<THREE.Mesh[]>([]);
  useFrame(() => {
    const show = xrayGate.index ? xrayGate.occluded : true;
    for (const g of ghosts.current) if (g.visible !== show) g.visible = show;
  });
  useEffect(() => {
    if (!on) return;
    const made: { mesh: THREE.Mesh; ghost: THREE.Mesh; order: number }[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as unknown as { isLine?: boolean }).isLine || mesh.userData.xrayGhost) return;
      const ghost = new THREE.Mesh(mesh.geometry, XRAY_MAT);
      ghost.userData.xrayGhost = true;
      ghost.raycast = noRaycast;
      ghost.renderOrder = 1;
      ghost.frustumCulled = false;
      made.push({ mesh, ghost, order: mesh.renderOrder });
    });
    for (const m of made) {
      m.mesh.renderOrder = 2;
      m.mesh.add(m.ghost);
    }
    ghosts.current = made.map((m) => m.ghost);
    return () => {
      ghosts.current = [];
      for (const m of made) {
        m.mesh.remove(m.ghost);
        m.mesh.renderOrder = m.order;
      }
    };
  }, [root, on]);
}

interface RigProps {
  xray: boolean;
  look: Look;
  pose: CharacterPose;
  speedRef: React.MutableRefObject<number>;
  holding: HeldItem;
  drink: string;
  action: PlayerAction;
  gesture: { kind: Gesture; at: number } | null;
  status: string;
  seed: number;
  vibe: boolean;
  rock: boolean;
  awaiting: boolean;
  snack: string;
  actionProgress: number;
  bobberAt: { x: number; y: number; z: number } | null;
  onHook?: () => void;
  fed: boolean;
  rodAura: boolean;
  /** Told the height of the top of the hair or hat being worn, so the nametag clears it. */
  onCrownTop: (y: number) => void;
  /** The Velvet Ring: the gloves' look ("" none: red, blue or tiger), the fighter's state (null: not
   *  in the bout), and their session (the fight anims are kept by it). */
  gloves: string;
  fight: FighterState | null;
  sessionId: string;
  local: boolean;
  map: string;
  pickWeight: number;
}

function AvatarModel({ xray, look, pose, speedRef, holding, drink, action, gesture, status, seed, vibe, rock, awaiting, snack, actionProgress, bobberAt, onHook, fed, rodAura, onCrownTop, gloves, fight, sessionId, local, map, pickWeight }: RigProps) {
  const rig = useRig();
  useXray(rig.root, xray);
  const shirtGoal = useRef(new THREE.Color());
  const walkPhase = useRef(0);
  // the ring's footwork: where the avatar stood last frame, its ground speed forward and to its left
  // (smoothed), and the stride's phase, run by the ground covered (so the feet plant)
  const footwork = useRef({ x: 0, z: 0, ready: false, fwd: 0, left: 0, phase: 0 });
  const blink = useRef({ next: 2 + Math.random() * 3, t: 0 });
  // an occasional curious head tilt while idle, on its own per-avatar schedule
  const tilt = useRef({ next: 4 + Math.random() * 6, until: 0, dir: 1 });
  // a sip of whatever is in the mug, every so often (the first one soon after it is poured)
  const sip = useRef({ next: 3 + Math.random() * 4, until: 0 });
  // the radio's groove eases in and out, and rides on top of the head's and body's own pose
  const groove = useRef({ amount: 0, headX: 0, bodyZ: 0 });
  // the skewer: how many pieces are eaten, and the next bite (reset for each new skewer)
  const bites = useRef({ snack: "", eaten: 0, next: 0, until: 0, pending: false });
  // a cast: when the line went out (the rod swings over and out)
  const cast = useRef({ was: "" as PlayerAction, at: -Infinity });
  // the Bear Fleece Cap's ears (child nodes of Hat_bearcap): they bob with each step
  const bearEars = useMemo(() => [rig.root.getObjectByName("Hat_bearcap_EarL") ?? null, rig.root.getObjectByName("Hat_bearcap_EarR") ?? null], [rig]);
  // where the bite mark floats, over the bobber; and the Starlight rod's shimmer, at its tip
  const markRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Group>(null);
  // the Velvet Ring: this frame's boxing pose, and the M2's shimmer round the rear glove (0..1)
  const boxPose = useMemo(() => emptyPose(), []);
  const smashAura = useRef(0);
  // the caverns' work: which activity is on and since when (its way in); a fishing bite's start
  const work = useRef({ kind: null as Activity | null, at: 0, bite: false, biteAt: -Infinity });

  // the skewer: the food's colour for how it was roasted, and the pieces of the right food
  useEffect(() => {
    const s = parseSnack(snack);
    const tints = ROAST_TINTS[s?.food ?? "mallow"][s?.quality ?? "raw"];
    rig.tint.roast?.color.set(tints.food);
    rig.tint.roastVeg?.color.set(tints.veg);
  }, [rig, snack]);

  // the mug: the drink's colour, and its one topping (a plain coffee has none)
  useEffect(() => {
    const d = parseDrink(drink);
    rig.tint.drink?.color.set(DRINK_BASE_INFO[d?.base ?? "coffee"].color);
    rig.toppings.forEach((node, id) => (node.visible = id === d?.topping));
  }, [rig, drink]);

  // dress: the hair style, the hat, the outfit and the colours from the look
  useEffect(() => {
    const style = hairUnderHat(rig.hair.has(look.hairStyle) ? look.hairStyle : DEFAULT_HAIR, look.hat);
    rig.hair.forEach((node, name) => show(node, name === style));
    rig.hairProps.forEach((prop) => show(prop, !CROWN_HATS.has(look.hat)));
    // the style actually shown decides: a covering style tucked under a hat as the crop shows them
    const ears = !coversEars(style);
    show(rig.part.earL, ears);
    show(rig.part.earR, ears);
    rig.hats.forEach((node, name) => show(node, name === look.hat));
    // the top of whatever the head wears, measured in the model's own space
    rig.root.updateWorldMatrix(true, true);
    const toModel = rig.root.matrixWorld.clone().invert();
    const worn = [rig.hair.get(style), rig.hats.get(look.hat)].filter((o): o is THREE.Object3D => !!o);
    onCrownTop(Math.max(0, ...worn.map((o) => new THREE.Box3().setFromObject(o).applyMatrix4(toModel).max.y)));
    const outfit = OUTFIT_PARTS[look.outfit] ?? OUTFIT_PARTS.outfit_starter_hoodie;
    rig.tops.forEach((pieces, id) => pieces.forEach((node) => show(node, id === outfit.top)));
    rig.bottoms.forEach((pieces, id) => pieces.forEach((node) => show(node, id === outfit.bottom)));
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
    // (in the ring: stunned or staggered, seeing stars; down on the canvas)
    // (a fighter launched through the ropes has their gloves off, and still lies where they landed)
    const boxing = (!!gloves || fight === "out" || fight === "down") && pose === "stand";
    const dizzy = action === "dizzy" && !boxing;
    // AFK is asleep, whatever the pose: the eyes close standing, sitting or lying; standing, the
    // body also sways, and seated, the head nods
    const asleep = status === "afk" && !walking;
    const dozing = asleep && pose === "stand";

    // --- limbs (ArmR is her right hand: it holds the mug and waves) ---
    let armL = -swing * ARM_SWING;
    let armR = swing * ARM_SWING;
    let legs: [number, number] = [swing * LEG_SWING, -swing * LEG_SWING];
    if (pose === "sit") {
      armL = armR = SIT_ARM;
      legs = [SIT_LEG, SIT_LEG];
    } else if (pose === "cross") {
      armL = armR = CROSS_ARM;
      legs = [CROSS_LEG_X, CROSS_LEG_X];
    } else if (pose === "dangle") {
      armL = armR = SIT_ARM;
      legs = [DANGLE_LEG + Math.sin(t * 1.7 + seed) * DANGLE_SWING, DANGLE_LEG + Math.sin(t * 1.7 + seed + 2.4) * DANGLE_SWING];
    } else if (pose === "lie") {
      armL = armR = LIE_ARMS;
      legs = [LIE_LEGS, LIE_LEGS];
    } else if (!walking) {
      const idle = Math.sin(t * 1.3 + seed) * 0.05;
      armL = -idle;
      armR = idle;
    }
    // gestures, while standing still (and a move at the board, played from the chair)
    const gAge = gesture ? (performance.now() - gesture.at) / 1000 : Infinity;
    const g = gesture && gAge < GESTURE_SECONDS[gesture.kind] && !walking && (pose === "stand" || gesture.kind === "reach" || ((gesture.kind === "belly" || gesture.kind === "trophy") && pose !== "lie")) ? gesture.kind : null;
    const holdingCup = holding === "coffee" && pose !== "lie" && !fishing;
    // the reach: out over REACH_OUT, held REACH_HOLD, back over REACH_OUT (eased both ways)
    const reach = g === "reach" ? THREE.MathUtils.smoothstep(Math.min(gAge, 2 * REACH_OUT + REACH_HOLD - gAge) / REACH_OUT, 0, 1) : 0;
    // the pour: the can tips forward once the arm is out, and rights itself at the end
    const pour = g === "water" ? THREE.MathUtils.smoothstep(Math.min(gAge - 0.2, GESTURE_SECONDS.water - 0.25 - gAge) / 0.25, 0, 1) : 0;
    let wave = 0;
    if (g === "wave") {
      // three waves side to side over the gesture
      armR = -2.75;
      wave = Math.sin((gAge / GESTURE_SECONDS.wave) * Math.PI * 2 * 3) * 0.45;
    } else if (g === "dance") {
      // arms up and swinging, stepping from foot to foot (the hips sway and the body bounces below)
      armL = -2.3 + Math.sin(gAge * 7) * 0.6;
      armR = -2.3 - Math.sin(gAge * 7) * 0.6;
      legs = [Math.max(0, Math.sin(gAge * 7)) * -0.4, Math.max(0, -Math.sin(gAge * 7)) * -0.4];
    } else if (g === "cheers") {
      armL = armR = CHEER_ARM + Math.sin(gAge * 9) * 0.12;
    } else if (g === "trophy") {
      // the catch held high: both arms up in a quick lift, pumping twice for joy
      const lift = THREE.MathUtils.smoothstep(gAge / 0.25, 0, 1) * (1 - THREE.MathUtils.smoothstep((gAge - GESTURE_SECONDS.trophy + 0.35) / 0.35, 0, 1));
      armL = armR = TROPHY_ARM * lift + Math.abs(Math.sin(gAge * 7)) * 0.18 * lift;
    } else if (g === "heart") {
      armL = armR = HEART_ARM;
    } else if (g === "belly") {
      // a happy belly rub: both paws on the tummy, rubbing round and round
      armL = BELLY_ARM + Math.sin(gAge * 7) * 0.12;
      armR = BELLY_ARM - Math.sin(gAge * 7) * 0.12;
    } else if (g === "toss") {
      armR = gAge < 0.25 ? THREE.MathUtils.lerp(0, TOSS_BACK_ARM, gAge / 0.25) : THREE.MathUtils.lerp(TOSS_BACK_ARM, TOSS_OVER_ARM, THREE.MathUtils.smoothstep((gAge - 0.25) / 0.3, 0, 1));
    } else if (g === "water") {
      armR = WATER_ARM + Math.sin(gAge * 6) * 0.08;
    }
    if (holding === "marshmallow") armL = armR = ROAST_ARM;
    // the firefly jar, held out in the left hand
    const holdingJar = holding === "jar" && pose !== "lie";
    if (holdingJar) armL = JAR_ARM + swing * 0.08;
    // the net: a swipe up and over, then down through the fireflies
    if (g === "net") {
      const k = gAge / GESTURE_SECONDS.net;
      armR = k < 0.35 ? THREE.MathUtils.lerp(0, NET_UP_ARM, k / 0.35) : THREE.MathUtils.lerp(NET_UP_ARM, NET_DOWN_ARM, THREE.MathUtils.smoothstep((k - 0.35) / 0.4, 0, 1));
    }
    // the rod in both hands: the right on the grip, the left reaching across to steady it
    if (fishing) {
      armR = FISH_ARM + Math.sin(t * 1.1) * 0.04;
      armL = FISH_ARM + 0.08 + Math.sin(t * 1.1 + 0.4) * 0.03;
    }
    // a cast: up and back, then over and out, as the line goes in
    const cr = cast.current;
    if (action === "fish" && cr.was !== "fish") cr.at = t;
    cr.was = action;
    const castAge = t - cr.at;
    if (action === "fish" && castAge < CAST_SECONDS) armR = THREE.MathUtils.lerp(CAST_BACK_ARM, FISH_ARM, THREE.MathUtils.smoothstep(castAge / CAST_SECONDS, 0.25, 1));
    const bite = action === "fish" && actionProgress >= 1;
    if (bite) armR = FISH_ARM - 0.12 + Math.sin(t * 22) * 0.05;
    // the bite's flinch: a start, the rod snatched up, then held tight
    if (bite && !work.current.bite) work.current.biteAt = t;
    work.current.bite = bite;
    const flinch = bite ? Math.max(0, 1 - (t - work.current.biteAt) / 0.35) : 0;
    if (flinch > 0) armR -= 0.35 * flinch;
    // the cast with the whole body: wound back, then swung through and out
    const casting = action === "fish" && castAge < CAST_SECONDS ? THREE.MathUtils.smoothstep(castAge / CAST_SECONDS, 0.15, 0.75) : -1;
    // the chopping block: raised overhead, then (the server's "chop" gesture) swung down through the log
    if (action === "chop") {
      armR = CHOP_RAISE_ARM + Math.sin(t * 3.1) * 0.05;
      armL = -0.5;
    }
    if (g === "chop") {
      const down = THREE.MathUtils.smoothstep(gAge / 0.18, 0, 1);
      const back = THREE.MathUtils.smoothstep((gAge - 0.4) / 0.3, 0, 1);
      armR = THREE.MathUtils.lerp(THREE.MathUtils.lerp(CHOP_RAISE_ARM, CHOP_DOWN_ARM, down), 0, back);
      armL = -0.5 * (1 - back);
    }
    if (action === "mine") {
      armR = MINE_READY_ARM + Math.sin(t * 2.4) * 0.05;
      armL = MINE_READY_ARM + 0.35;
    }
    if (g === "mine") {
      const down = THREE.MathUtils.smoothstep(gAge / 0.12, 0, 1);
      const back = THREE.MathUtils.smoothstep((gAge - 0.24) / 0.28, 0, 1);
      armR = THREE.MathUtils.lerp(THREE.MathUtils.lerp(MINE_READY_ARM - 0.4, MINE_HIT_ARM, down), MINE_READY_ARM, back);
      armL = armR + 0.35;
    }
    // riding Gus's winch up: both hands up on the rope, a little sway with the cage
    if ((action === "winch" || action === "winchdown") && !riderWalking(sessionId)) {
      armR = -2.75 + Math.sin(t * 2.2) * 0.04;
      armL = -2.6 + Math.sin(t * 2.2 + 0.6) * 0.04;
    }
    // the telescope: hands up to the eyepiece, and a slow sway as the sky is searched
    if (action === "stargaze") armL = armR = STARGAZE_ARM + Math.sin(t * 0.7 + seed) * 0.03;
    if (action === "reel") {
      armR = FISH_ARM - 0.3 + Math.sin(t * 9) * 0.18;
      armL = FISH_ARM - 0.1 + Math.sin(t * 9 + 1) * 0.12;
    }
    if (dizzy) armL = armR = -0.6;
    if (action === "reel" && pose === "stand") legs = [-0.32, 0.18];
    // the Glimmering Caverns' rope descent: a hand on the rope on the drop side, leaning back
    let onRope = false;
    let ropeLeft = false;
    if (map === "glimmering_caverns" && walking && pose === "stand") {
      const e = rig.root.matrixWorld.elements;
      const rope = CAVE_TRAILS.find((p) => p.id === "ropeDescent");
      if (rope) {
        const [ax, az] = rope.points[0];
        const [bx, bz] = rope.points[rope.points.length - 1];
        const vx = bx - ax;
        const vz = bz - az;
        const len = Math.hypot(vx, vz);
        const u = ((e[12] - ax) * vx + (e[14] - az) * vz) / (len * len);
        const cx = ax + vx * Math.max(0, Math.min(1, u));
        const cz = az + vz * Math.max(0, Math.min(1, u));
        if (u > 0.05 && u < 0.95 && Math.hypot(e[12] - cx, e[14] - cz) < rope.half + 0.2) {
          onRope = true;
          // (the drop side: the lower ground across the trail)
          const nx = -vz / len;
          const nz = vx / len;
          const side = cavernsFloorY(cx + nx * 1.4, cz + nz * 1.4) < cavernsFloorY(cx - nx * 1.4, cz - nz * 1.4) ? 1 : -1;
          ropeLeft = (nx * side * e[0] + nz * side * e[2]) > 0;
          if (ropeLeft) armL = -1.05 + swing * 0.1;
          else armR = -1.05 - swing * 0.1;
        }
      }
    }
    // --- the Velvet Ring: the whole pose from the ring's animation suite, on the combat clock ---
    let bp: typeof boxPose | null = null;
    if (boxing) {
      const b = getBout();
      const me = b.red.sessionId === sessionId ? b.red : b.blue.sessionId === sessionId ? b.blue : null;
      const anim = fightAnimOf(sessionId);
      // the ground actually covered since last frame, split along the way they face and across it
      const e = rig.root.matrixWorld.elements;
      const fw = footwork.current;
      const fl = Math.hypot(e[8], e[10]) || 1;
      const ll = Math.hypot(e[0], e[2]) || 1;
      const moved = Math.hypot(e[12] - fw.x, e[14] - fw.z);
      if (!fw.ready || moved > 1 || rawDelta <= 0) {
        fw.ready = true;
        fw.fwd = 0;
        fw.left = 0;
      } else {
        const vx = (e[12] - fw.x) / rawDelta;
        const vz = (e[14] - fw.z) / rawDelta;
        const k = 1 - Math.exp(-12 * rawDelta);
        fw.fwd += ((vx * e[8] + vz * e[10]) / fl - fw.fwd) * k;
        fw.left += ((vx * e[0] + vz * e[2]) / ll - fw.left) * k;
      }
      fw.x = e[12];
      fw.z = e[14];
      const v = Math.hypot(fw.fwd, fw.left);
      fw.phase += (Math.PI * 2 * v * delta) / STRIDE_M;
      const moving = v > 0.08;
      bp = boxerPose(boxPose, { t: combatNow() + seed, seed, speed: Math.min(1, v / 3), phase: fw.phase, fwd: moving ? fw.fwd / v : 1, side: moving ? fw.left / v : 0, state: fight, exhausted: !!me?.exhausted, move: anim.move, moveAge: anim.moveAge, react: anim.react, reactAge: anim.reactAge });
    } else footwork.current.ready = false;
    // --- the Glimmering Caverns' work: the whole body from the activity suite (activityAnimations.ts) ---
    const wk = work.current;
    const kind: Activity | null = bp ? null : action === "soak" && pose !== "stand" ? "soak" : pose !== "stand" ? null : (action === "winch" || action === "winchdown") && !riderWalking(sessionId) ? "winch" : (action === "winch" || action === "winchdown") ? null : action === "raft" ? "raft" : !walking && (action === "mine" || action === "forge" || action === "chisel") ? action : null;
    if (kind !== wk.kind) {
      wk.kind = kind;
      wk.at = t;
    }
    let forgeHalf: "bellows" | "hammer" = "bellows";
    let geodeHalf: "aim" | "gauge" = "aim";
    if (kind) {
      const now = nowS();
      const blow = local ? { at: activity.blowAt, deflect: activity.deflect } : remoteBlows.get(sessionId);
      const fb = forgeBeat(now, seed);
      const cb = chiselBeat(now, seed);
      forgeHalf = local ? (activity.forge ?? "bellows") : fb.forge;
      geodeHalf = local ? (activity.geode ?? "aim") : cb.geode;
      bp = activityPose(boxPose, {
        kind,
        t,
        age: t - wk.at,
        seed,
        blowAge: blow ? now - blow.at : Infinity,
        deflect: !!blow?.deflect,
        weight: pickWeight,
        forge: forgeHalf,
        pumping: local ? activity.pumping : fb.forge === "bellows",
        pumpAge: local ? (activity.pumping ? now % 0.5 : now - activity.pumpAt) : fb.pumpAge,
        hammerAge: local ? now - activity.hammerAt : fb.hammerAge,
        geode: geodeHalf,
        power: local ? activity.power : cb.power,
        chiselAge: local ? now - activity.chiselAt : cb.chiselAge,
      });
    }
    smashAura.current = bp ? bp.aura : 0;
    if (g === "bag") {
      // a flurry on the gym's heavy bag, one hand then the other
      const beat = Math.sin(gAge * 18);
      armL = -1.4 - 0.25 * Math.max(0, beat);
      armR = -1.4 - 0.25 * Math.max(0, -beat);
    }
    // the mug: held out, and brought up for a sip now and then (not mid-pour or mid-move)
    const busyHand = g === "water" || g === "reach";
    const sp = sip.current;
    if (holdingCup && !busyHand && t > sp.next) {
      sp.until = t + SIP_SECONDS;
      sp.next = t + SIP_EVERY + Math.random() * SIP_JITTER;
    }
    const sipping = holdingCup && !busyHand && t < sp.until;
    if (holdingCup && g !== "water") armR = sipping ? SIP_ARM : CUP_ARM + swing * 0.1;
    // a move at the board: the free hand reaches out over the table (the left, if the right holds a mug)
    if (reach > 0) {
      if (holdingCup) armL = THREE.MathUtils.lerp(armL, REACH_ARM, reach);
      else armR = THREE.MathUtils.lerp(armR, REACH_ARM, reach);
    }
    // the campfire: a skewer held out over the fire, then carried and nibbled from the tip
    const guitarOn = action === "guitar" && pose === "sit";
    const grilling = action === "grill";
    const holdingSkewer = holding === "skewer" && pose !== "lie" && !fishing && !guitarOn && g !== "water";
    const food = parseSnack(snack)?.food ?? "mallow";
    const bt = bites.current;
    if (bt.snack !== snack) {
      bt.snack = snack;
      bt.eaten = 0;
      bt.next = t + 2.5;
      bt.until = 0;
      bt.pending = false;
    }
    const pieceCount = rig.skewerPieces[food].length;
    if (holdingSkewer && !grilling && bt.eaten < pieceCount && t > bt.next) {
      bt.until = t + BITE_SECONDS;
      bt.pending = true;
      bt.next = t + BITE_EVERY + Math.random() * BITE_JITTER;
    }
    const biting = holdingSkewer && t < bt.until;
    if (bt.pending && t > bt.until - BITE_SECONDS / 2) {
      bt.eaten += 1; // chomp: the piece at the tip is gone
      bt.pending = false;
    }
    if (holdingSkewer) armR = grilling ? GRILL_ARM + Math.sin(t * 2.2) * 0.03 : biting ? BITE_ARM : SKEWER_HOLD_ARM + swing * 0.1;
    // the guitar across the lap: the left hand up the neck, the right strumming
    if (guitarOn) {
      armL = GUITAR_NECK_ARM + Math.sin(t * 1.3 + seed) * 0.04;
      armR = STRUM_ARM + Math.sin(t * STRUM_RATE) * STRUM_SWING;
    }

    const L = THREE.MathUtils.lerp;
    const k = seated ? POSE_LERP : LIMB_LERP;
    // (the ring's punches are quicker than any cozy gesture: its poses are already eased in time)
    const ka = bp ? 0.8 : k;
    const trem = bp ? bp.tremble * Math.sin(t * 71) : 0;
    const bagFlurry = g === "bag";
    part.armL.rotation.x = L(part.armL.rotation.x, bp ? bp.armL.x + trem : armL, ka);
    part.armR.rotation.x = L(part.armR.rotation.x, bp ? bp.armR.x - trem : armR, ka);
    part.armL.rotation.y = L(part.armL.rotation.y, bp ? bp.armL.y : 0, bp ? 0.8 : 0.3);
    part.armR.rotation.y = L(part.armR.rotation.y, bp ? bp.armR.y : 0, bp ? 0.8 : 0.3);
    const twoHanded = fishing && pose !== "lie";
    const rubbing = g === "belly";
    part.armL.rotation.z = L(part.armL.rotation.z, bp ? -bp.armL.in : bagFlurry ? -0.3 : pose === "lie" ? 0.1 : guitarOn ? GUITAR_NECK_SPLAY : twoHanded ? -TWO_HAND_IN : rubbing ? -BELLY_IN : onRope && ropeLeft ? 0.75 : ARM_SPLAY, bp ? 0.8 : 0.3);
    part.armR.rotation.z = L(part.armR.rotation.z, bp ? bp.armR.in : bagFlurry ? 0.3 : (pose === "lie" ? -0.1 : guitarOn ? -0.05 : twoHanded ? TWO_HAND_IN * 0.3 : rubbing ? BELLY_IN : onRope && !ropeLeft ? -0.75 : -ARM_SPLAY) - wave, bp ? 0.8 : 0.3);
    part.legL.rotation.x = L(part.legL.rotation.x, bp ? bp.legL : legs[0], bp ? 0.6 : k);
    part.legR.rotation.x = L(part.legR.rotation.x, bp ? bp.legR : legs[1], bp ? 0.6 : k);
    // cross-legged: each thigh swung in across the other (the left is +x, so it turns to -x); in
    // the ring, the rear foot's pivot and the stance's width
    part.legL.rotation.y = L(part.legL.rotation.y, pose === "cross" ? -CROSS_LEG_Y : 0, k);
    part.legR.rotation.y = L(part.legR.rotation.y, pose === "cross" ? CROSS_LEG_Y : bp ? bp.pivotR : 0, bp ? 0.6 : k);
    part.legL.rotation.z = L(part.legL.rotation.z, bp ? bp.legSpread + bp.sideL : 0, bp ? 0.6 : 0.4);
    part.legR.rotation.z = L(part.legR.rotation.z, bp ? -bp.legSpread + bp.sideR : 0, bp ? 0.6 : 0.4);

    // --- body: waddle when walking, lie back on a blanket, sway while dizzy or dozing ---
    const body = part.body;
    const lying = pose === "lie" || g === "nap";
    // Well-Fed: a spring in the step
    const bob = walking ? Math.abs(Math.sin(phase)) * BOB_HEIGHT * (fed ? FED_BOUNCE : 1) : g === "dance" ? Math.abs(Math.sin(gAge * 7)) * 0.08 : 0;
    body.position.y = L(body.position.y, rest.body.pos.y + (bp ? bp.lift : lying ? AVATAR_LIE_LIFT : bob), bp ? 0.6 : k);
    body.position.z = L(body.position.z, rest.body.pos.z + (bp ? bp.shift : 0), 0.6);
    const reeling = action === "reel" && !!bobberAt;
    const fishLean = casting >= 0 ? THREE.MathUtils.lerp(-0.12, 0.16, casting) : flinch > 0 ? -0.1 * flinch : 0;
    body.rotation.x = L(body.rotation.x, bp ? bp.lean + trem * 0.5 : lying ? LIE_ROLL : reeling ? REEL_LEAN + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.02 : onRope ? -0.1 : walking ? 0.06 * speed : dizzy ? Math.sin(t * 4.5) * 0.12 : g === "water" ? WATER_LEAN : fishLean || reach * REACH_LEAN, bp ? 0.55 : reeling ? 0.3 : casting >= 0 || flinch > 0 ? 0.35 : k);
    // the radio's groove: eased in while vibing on a cushion, riding on top of the pose
    const gr = groove.current;
    gr.amount = L(gr.amount, (vibe || guitarOn) && pose === "sit" && !asleep ? 1 : 0, 0.05);
    gr.bodyZ = L(gr.bodyZ, bp ? bp.roll : walking ? Math.sin(phase) * WADDLE_ROLL : dizzy ? Math.cos(t * 4.5) * 0.28 : dozing ? Math.sin(t * 0.9) * 0.05 : g === "dance" ? Math.sin(gAge * 7) * 0.14 : 0, bp ? 0.6 : k);
    body.rotation.z = gr.bodyZ + gr.amount * Math.sin(t * VIBE_BEAT * 0.5 + seed) * VIBE_SWAY;
    // the canoe bobs and rocks on the water (canoeMotion, as campfireLife moves the boat), its
    // sitter with it, harder while fighting a fish from it; the sitter faces +z, across the boat,
    // so the boat's roll about x is the root's pitch here and its pitch about z the root's roll
    const struggling = action === "reel";
    part.root.position.y = rest.root.pos.y + (rock ? canoeBob(t) : 0);
    part.root.rotation.x = rock ? canoeRoll(t, struggling) : 0;
    part.root.rotation.z = rock ? canoePitch(t, struggling) : 0;
    const fishTwist = casting >= 0 ? THREE.MathUtils.lerp(-0.38, 0.14, casting) : reeling ? -0.12 + Math.sin(t * 4.5) * 0.06 : 0;
    body.rotation.y = L(body.rotation.y, bp ? bp.twist : g === "dance" ? Math.sin(gAge * 3.5) * 0.6 : fishTwist, bp ? 0.7 : casting >= 0 ? 0.35 : 0.2);

    // --- the bear cap's ears: a floppy bob, one then the other, with each step; a twitch now and then idle ---
    bearEars.forEach((ear, i) => {
      if (!ear) return;
      const side = i === 0 ? 1 : -1;
      ear.rotation.x = walking ? Math.sin(phase + i * Math.PI) * 0.3 : Math.pow(Math.max(0, Math.sin(t * 0.9 + seed + i * 1.7)), 14) * 0.4;
      ear.rotation.y = walking ? side * Math.abs(Math.sin(phase)) * 0.15 : 0;
    });

    // --- breathing: the torso swells about its base ---
    const breath = walking ? 0 : Math.sin(t * 2.1 + seed) * 0.018;
    const ts = rest.torso.scale;
    part.torso.scale.set(ts.x * (1 - breath * 0.5), ts.y * (1 + breath), ts.z);

    // --- head: glance about and tilt when idle, nod along with the waddle ---
    const head = part.head;
    const idleLook = !walking && pose === "stand" && !asleep ? Math.sin(t * 0.45 + seed) * 0.35 * Math.max(0, Math.sin(t * 0.21 + seed * 2)) : 0;
    head.rotation.y = L(head.rotation.y, bp ? bp.head.y : idleLook, bp ? 0.6 : 0.06);
    const tl = tilt.current;
    if (!walking && t > tl.next) {
      tl.until = t + 1.4;
      tl.dir = Math.random() < 0.5 ? -1 : 1;
      tl.next = t + 6 + Math.random() * 9;
    }
    // resting by the water (the creel full): feet over the edge, a warm mug, the head nodding off
    const nodding = (asleep && pose === "sit") || (action === "rest" && !sipping);
    // at the board, waiting on the opponent: a small steady tilt, to the side this avatar favours
    const waiting = awaiting && pose === "sit" && !asleep;
    const tiltZ = nodding ? DOZE_LOLL : !walking && t < tl.until ? tl.dir * 0.22 : waiting ? (seed % 2 < 1 ? 1 : -1) * AWAIT_TILT : 0;
    head.rotation.z = L(head.rotation.z, bp ? bp.head.z : walking ? -Math.sin(phase) * 0.06 : tiltZ, bp ? 0.6 : walking ? 0.2 : 0.08);
    gr.headX = L(gr.headX, nodding ? DOZE_NOD + Math.sin(t * 0.8 + seed) * 0.03 : sipping ? SIP_TILT : biting ? SIP_TILT * 0.6 : 0, sipping || biting ? 0.12 : 0.05);
    head.rotation.x = bp ? L(head.rotation.x, bp.head.x, 0.6) : gr.headX + gr.amount * Math.sin(t * VIBE_BEAT) * VIBE_BOB;
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
    part.eyes.scale.y = rest.eyes.scale.y * (g === "nap" || asleep || pose === "lie" || (bp?.eyesShut && kind !== "soak") ? 0.1 : Math.max(0.1, open));
    // a sip of something warm (or a bite of something golden): the eyes close happily (^ ^)
    const happy = (sipping || g === "belly" || (biting && parseSnack(snack)?.quality === "golden") || (kind === "soak" && !!bp?.eyesShut)) && !asleep; // (only while not lying)
    part.eyes.visible = !happy;
    part.eyesHappy.visible = happy;

    // --- the mug stays upright whatever the arm does, and a hot drink steams (puffing on a sip);
    // the watering can takes the right hand while pouring, upright, then tipped forward ---
    const mugShown = holdingCup && g !== "water" && !guitarOn;
    part.mug.visible = mugShown;
    part.mug.rotation.x = -part.armR.rotation.x;
    part.wateringCan.visible = g === "water";
    part.hatchet.visible = action === "chop" || g === "chop";
    part.pickaxe.visible = action === "mine" || (g === "mine" && action !== "forge");
    part.smithHammer.visible = (kind === "forge" && forgeHalf === "hammer") || (kind === "chisel" && geodeHalf === "gauge");
    part.chisel.visible = kind === "chisel" && geodeHalf === "gauge";
    part.net.visible = g === "net";
    part.fireflyJar.visible = holdingJar;
    // the Heart emote: the heart pops up in front of the chest, floats up spinning, then shrinks away
    const hk = g === "heart" ? gAge / GESTURE_SECONDS.heart : -1;
    part.heart.visible = hk >= 0 && hk < 1;
    if (part.heart.visible) {
      const pop = hk < 0.15 ? 1 + 0.25 * Math.sin((hk / 0.15) * Math.PI) - 0.25 * (1 - hk / 0.15) : hk > 0.75 ? 1 - (hk - 0.75) / 0.25 : 1;
      part.heart.scale.setScalar(rest.heart.scale.x * Math.max(0.01, hk < 0.15 ? (hk / 0.15) * pop : pop));
      part.heart.position.set(rest.heart.pos.x, rest.heart.pos.y + hk * 0.75, rest.heart.pos.z);
      part.heart.rotation.y = gAge * 2.4;
    }
    part.wateringCan.rotation.x = -part.armR.rotation.x + pour * WATER_POUR;
    rig.steam.forEach((wisp, i) => {
      wisp.visible = mugShown;
      if (!mugShown) return;
      const life = (t * (sipping ? 0.7 : 0.45) + i / STEAM_COUNT + seed) % 1; // each wisp rises, swells and fades out
      wisp.position.set(STEAM_BASE.x + Math.sin(t * 1.7 + i * 2.1) * 0.012, STEAM_BASE.y + life * STEAM_RISE, STEAM_BASE.z + Math.cos(t * 1.3 + i) * 0.008);
      wisp.scale.setScalar((0.012 + 0.024 * Math.sin(Math.PI * life)) * (sipping ? 1.3 : 1));
    });

    // --- the skewer: level while carried, dipped over the fire; its pieces go as they are
    // eaten; a golden one steams ---
    // (sitting round the campfire: a marshmallow on its stick, held out to the flames)
    part.skewer.visible = holdingSkewer || (holding === "marshmallow" && pose !== "lie" && !guitarOn);
    part.skewer.rotation.x = -part.armR.rotation.x + (grilling ? SKEWER_OVER_FIRE : SKEWER_LEVEL);
    (["mallow", "bbq"] as const).forEach((f) => rig.skewerPieces[f].forEach((piece, i) => (piece.visible = f === food && i >= bt.eaten)));
    const steaming = holdingSkewer && !grilling && parseSnack(snack)?.quality === "golden" && bt.eaten < pieceCount;
    rig.skewerSteam.forEach((wisp, i) => {
      wisp.visible = steaming;
      if (!steaming) return;
      const life = (t * 0.5 + i / STEAM_COUNT + seed) % 1;
      wisp.position.set(Math.sin(t * 1.7 + i * 2.1) * 0.012, 0.04 + life * STEAM_RISE, 0.42);
      wisp.scale.setScalar(0.012 + 0.022 * Math.sin(Math.PI * life));
    });

    // --- the guitar across the lap ---
    part.guitar.visible = guitarOn;

    // --- fishing the river: the rod held out at a steady angle, the bobber on the water (dipping
    // on a bite, rings spreading), the line from the rod's tip to it ---
    const angling = (action === "fish" || action === "reel" || action === "afkfish") && !!bobberAt;
    // the wait: as the bite nears (the server's progress, in tenths), nibbles tug the float and rings spread
    const nibble = action === "fish" && !bite && actionProgress >= 0.5 ? Math.min(1, (actionProgress - 0.4) / 0.5) : 0;
    part.fishingRod.visible = fishing;
    // fighting a fish on the river, the rod's tip is pulled down toward it and jerks
    part.fishingRod.rotation.x = -part.armR.rotation.x + (reeling ? 0.3 + Math.sin(t * 13) * 0.1 + Math.sin(t * 31) * 0.04 : 0);
    part.bobber.visible = angling;
    rig.line.visible = angling;
    rig.ripples.forEach((ring) => (ring.visible = angling && (bite || reeling || nibble > 0)));
    if (angling && bobberAt) {
      const float = rig.root.worldToLocal(tmpA.set(bobberAt.x, bobberAt.y, bobberAt.z));
      const surface = float.y;
      float.y += reeling ? -0.05 + Math.sin(t * 17) * 0.02 : bite ? -0.06 + Math.sin(t * 28) * 0.015 : castAge < CAST_SECONDS ? 0.3 * (1 - castAge / CAST_SECONDS) : Math.sin(t * 2.3 + seed) * 0.012 - nibble * 0.035 * Math.pow(Math.max(0, Math.sin(t * (4 + 5 * nibble) + seed)), 8);
      if (reeling) {
        // the fish drags the float about under the surface
        float.x += Math.sin(t * 3.1) * 0.12 + Math.sin(t * 7.7) * 0.04;
        float.z += Math.cos(t * 2.3) * 0.1;
      }
      part.bobber.position.copy(float);
      markRef.current?.position.set(float.x, surface + 0.42, float.z);
      const tip = rig.root.worldToLocal(part.rodTip.getWorldPosition(tmpB));
      const pos = rig.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, tip.x, tip.y, tip.z);
      pos.setXYZ(1, float.x, float.y + 0.085, float.z);
      pos.needsUpdate = true;
      rig.ripples.forEach((ring, i) => {
        const small = nibble > 0 && !bite && !reeling;
        const life = (t * (small ? 0.8 + nibble : 1.6) + i * 0.5) % 1;
        ring.position.set(float.x, surface + 0.006, float.z);
        ring.scale.setScalar(small ? 0.4 + life * (0.6 + 1.4 * nibble) : 0.6 + life * 2.4);
      });
    }
    // the Starlight rod's shimmer rides its tip
    if (rodAura && fishing && auraRef.current) auraRef.current.position.copy(rig.root.worldToLocal(part.rodTip.getWorldPosition(tmpB)));
  });

  const guitarOn = action === "guitar" && pose === "sit";
  const bite = action === "fish" && actionProgress >= 1 && !!bobberAt;
  return (
    <>
      <primitive object={rig.root} />
      {/* the Velvet Ring: the gloves on the hands (their own little model, loaded apart: the
          avatar never waits on it), and stars over a fighter stunned or down */}
      {gloves && (
        <ModelBoundary what="boxing_gloves.glb" fallback={null}>
          <Suspense fallback={null}>
            <AvatarGloves rig={rig} kind={gloves} aura={smashAura} sessionId={sessionId} fight={fight} />
          </Suspense>
        </ModelBoundary>
      )}
      {(fight === "stun" || fight === "stagger" || fight === "down" || fight === "out") && (
        <Html position={fight === "down" || fight === "out" ? [0, 0.42, 0.95] : [0, 1.32, 0]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
          <div className="cozy-dizzy" aria-hidden>
            {["⭐", "💫", "⭐"].map((c, i) => (
              <span key={i} style={{ animationDelay: `${-i * 0.33}s` }}>
                {c}
              </span>
            ))}
          </div>
        </Html>
      )}
      {/* the bite: a mark over the bobber (tap it, or the dock's button, to set the hook) */}
      <group ref={markRef}>
        {bite && (
          <Html center zIndexRange={[6, 0]} style={{ pointerEvents: onHook ? "auto" : "none" }}>
            <button type="button" className="cozy-bite-mark" onClick={onHook} disabled={!onHook} aria-label="Set the hook">
              !
            </button>
          </Html>
        )}
      </group>
      {/* the Starlight Composite: stars twinkling about the rod's tip while it is out */}
      <group ref={auraRef}>
        {rodAura && (action === "fish" || action === "afkfish" || action === "reel") && (
          <Html center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
            <div className="cozy-star-aura" aria-hidden>
              {["✨", "⭐", "✨"].map((c, i) => (
                <span key={i} style={{ animationDelay: `${i * 0.5}s`, "--ax": `${(i - 1) * 12}px` } as React.CSSProperties}>
                  {c}
                </span>
              ))}
            </div>
          </Html>
        )}
      </group>
      {/* a new personal best: a trophy and sparkles over the raised catch */}
      {gesture?.kind === "trophy" && (
        <Html key={`trophy:${gesture.at}`} position={[0, 1.45, 0]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
          <div className="cozy-sparkles" aria-hidden>
            {["✨", "🏆", "⭐", "✨"].map((c, i) => (
              <span key={i} style={{ "--sx": `${(i - 1.5) * 18}px`, animationDelay: `${i * 0.1}s` } as React.CSSProperties}>
                {c}
              </span>
            ))}
          </div>
        </Html>
      )}
      {/* the cheer's sparkles and the nap's Zzz, played once each time (keyed on the gesture) */}
      {gesture?.kind === "cheers" && (
        <Html key={`cheer:${gesture.at}`} position={[0, 1.25, 0]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
          <div className="cozy-sparkles" aria-hidden>
            {["✨", "⭐", "✨", "🌟", "✨"].map((c, i) => (
              <span key={i} style={{ "--sx": `${(i - 2) * 16}px`, animationDelay: `${i * 0.12}s` } as React.CSSProperties}>
                {c}
              </span>
            ))}
          </div>
        </Html>
      )}
      {/* a nap (and anyone lying down: the hammock, the tents, a nap on the sofa): a drift of Zzz */}
      {(gesture?.kind === "nap" || pose === "lie") && (
        <Html key={pose === "lie" ? "lie" : `nap:${gesture?.at}`} position={pose === "lie" ? [0, 0.72, 0] : [0.18, 1.05, 0]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
          <div className={pose === "lie" ? "cozy-zzz cozy-zzz-loop" : "cozy-zzz"} aria-hidden>
            {["z", "Z", "z", "Z"].map((c, i) => (
              <span key={i} style={{ animationDelay: `${i * (pose === "lie" ? 0.65 : 1.4)}s` }}>
                {c}
              </span>
            ))}
          </div>
        </Html>
      )}
      {/* the guitar: warm notes drifting up while it is played */}
      {guitarOn && (
        <Html position={[0.1, 0.9, 0.2]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
          <div style={{ position: "relative", width: 0, height: 0 }}>
            {["♪", "♫", "♪"].map((n, i) => (
              <span key={i} className="cozy-guitar-note" style={{ animationDelay: `${i * 0.7}s` }}>
                {n}
              </span>
            ))}
          </div>
        </Html>
      )}
    </>
  );
}

/** The M2's wind-up: the air round the rear glove shimmering (a rim-lit haze, rippling). Additive,
 *  drawn only while it shows. (The camera is orthographic: the view runs along -z in view space.) */
const AURA_GEO = new THREE.SphereGeometry(0.17, 20, 14);
const GLOVE_SCALE = 1.2;
function auraMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { amount: { value: 0 }, time: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec3 vN;
      varying float vW;
      void main() {
        vW = sin(time * 38.0 + position.y * 34.0 + position.x * 21.0);
        vec3 p = position * (1.0 + 0.09 * vW);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float amount;
      varying vec3 vN;
      varying float vW;
      void main() {
        float rim = pow(1.0 - abs(vN.z), 2.2);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * rim * (0.65 + 0.35 * vW) * amount * 0.85, 1.0);
      }`,
  });
}

// --- the ring's telegraphs, on a fighter -------------------------------------------------------------
//
//   the guard's shield   while guarding: a cyan arc before the chest (at most 40%), flaring when a
//                        punch lands in the shell
//   the strike trails    a crisp white motion arc on each punch as it lands: a straight streak off
//                        the lead shoulder for the jab (the rear one for the straight), a swept arc
//                        for the lead hook (level), the Heavy Smash (overhead) and the uppercut
//   the dash's ghost     a translucent afterimage left where a dash started (the i-frames' blur)
//
// All in the fighter's own frame (the avatar faces +z, its left hand at +x), additive, never a
// shadow; the meshes are this fighter's own and made only while they wear gloves.

const SHIELD_GEO = new THREE.CylinderGeometry(0.46, 0.46, 0.78, 32, 1, true, -1.2, 2.4);
const SHIELD_COLOR = new THREE.Color("#5fd4ff");
const STREAK_GEO = new THREE.PlaneGeometry(1, 1);
const ARC_GEO = new THREE.RingGeometry(0.3, 0.44, 48, 1);
const TRAIL_VS = "varying vec2 vUv; varying vec3 vP; void main() { vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

function shieldMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { opacity: { value: 0 }, color: { value: SHIELD_COLOR } },
    vertexShader: TRAIL_VS,
    // brightest at its middle band, fading to its top and bottom edges and its two sides
    fragmentShader: "uniform float opacity; uniform vec3 color; varying vec2 vUv; void main() { float band = sin(vUv.y * 3.14159); float side = sin(vUv.x * 3.14159); float rim = 0.55 + 0.45 * smoothstep(0.8, 1.0, band); gl_FragColor = vec4(color * opacity * band * side * rim * 1.6, 1.0); }",
  });
}

function streakMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { opacity: { value: 0 } },
    vertexShader: TRAIL_VS,
    // a streak: clear at its tail, white at its head (uv.x), soft top and bottom (uv.y)
    fragmentShader: "uniform float opacity; varying vec2 vUv; void main() { float a = pow(vUv.x, 1.6) * sin(vUv.y * 3.14159); gl_FragColor = vec4(vec3(1.0) * opacity * a, 1.0); }",
  });
}

function arcMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { opacity: { value: 0 }, from: { value: 0 }, to: { value: 1 } },
    vertexShader: TRAIL_VS,
    // the swept part of the ring only, from `from` to `to` (radians, either way round), clear at
    // its tail and white at its head, soft across its width
    fragmentShader:
      "uniform float opacity; uniform float from; uniform float to; varying vec3 vP; void main() { float a = atan(vP.y, vP.x); float span = to - from; float k = (a - from) / span; if (k < -0.02) { a += 6.28318 * sign(span); k = (a - from) / span; } if (k < 0.0 || k > 1.0) discard; float r = length(vP.xy); float across = sin(clamp((r - 0.3) / 0.14, 0.0, 1.0) * 3.14159); gl_FragColor = vec4(vec3(1.0) * opacity * pow(k, 1.4) * across, 1.0); }",
  });
}

/** Where each punch's trail sits and sweeps, in the fighter's own frame. */
const TRAILS: Partial<Record<string, { kind: "streak"; x: number; y: number } | { kind: "arc"; plane: "level" | "upright"; at: [number, number, number]; from: number; to: number }>> = {
  jab: { kind: "streak", x: 0.17, y: 0.56 },
  straight: { kind: "streak", x: -0.12, y: 0.54 },
  // level, seen from above: +x (the lead side) is 0, the front (+z) is -PI/2
  leadhook: { kind: "arc", plane: "level", at: [0, 0.56, 0.08], from: 0.35, to: -2.1 },
  // upright, beside the rear shoulder: the back is 0, up is PI/2, the front PI
  smash: { kind: "arc", plane: "upright", at: [-0.16, 0.6, 0.06], from: 0.7, to: 3.75 },
  uppercut: { kind: "arc", plane: "upright", at: [-0.14, 0.42, 0.12], from: 4.1, to: 1.85 },
};

const GHOST_MAT_PROTO = new THREE.MeshBasicMaterial({ color: "#cfeeff", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });

/** Every mesh of the fighter that is shown right now (its own and its ancestors' visibility). */
function shownMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material instanceof THREE.ShaderMaterial)) out.push(m);
    o.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** The boxing gloves on the hands: each a copy of its glove from boxing_gloves.glb (Glove_<look>_L/R:
 *  red, blue or tiger), hung on the arm where the hand is (the arm's own motion carries it); the
 *  rear glove carries the M2's shimmer; and the ring's telegraphs (the guard's shield, the strike
 *  trails, the dash's ghost). */
function AvatarGloves({ rig, kind, aura, sessionId, fight }: { rig: Rig; kind: string; aura: React.MutableRefObject<number>; sessionId: string; fight: FighterState | null }) {
  const { scene } = useGLTF(GLOVES_URL);
  const world = useThree((st) => st.scene);
  const fx = useMemo(() => {
    const shield = new THREE.Mesh(SHIELD_GEO, shieldMaterial());
    shield.position.set(0, 0.52, 0.02);
    const streak = new THREE.Mesh(STREAK_GEO, streakMaterial());
    // the streak's length along +z (turned by y), then rolled about that length to face the camera
    // (outermost: the ZYX order), so it reads as a ribbon from the side, behind or above
    streak.rotation.order = "ZYX";
    streak.rotation.y = -Math.PI / 2;
    const arc = new THREE.Mesh(ARC_GEO, arcMaterial());
    for (const m of [shield, streak, arc]) {
      m.raycast = noRaycast;
      m.visible = false;
      m.renderOrder = 5;
      m.frustumCulled = false;
      rig.root.add(m);
    }
    return { shield, streak, arc, shieldShown: 0, ghosts: [] as { group: THREE.Group; mat: THREE.MeshBasicMaterial; at: number }[], lastDash: -1, view: new THREE.Vector3(), turn: new THREE.Quaternion() };
  }, [rig]);
  useEffect(
    () => () => {
      for (const m of [fx.shield, fx.streak, fx.arc]) {
        rig.root.remove(m);
        (m.material as THREE.Material).dispose();
      }
      for (const g of fx.ghosts) {
        world.remove(g.group);
        g.mat.dispose();
      }
    },
    [fx, rig, world]
  );
  const haze = useMemo(() => {
    const mesh = new THREE.Mesh(AURA_GEO, auraMaterial());
    mesh.raycast = noRaycast;
    mesh.visible = false;
    mesh.renderOrder = 4;
    mesh.position.set(GLOVE_HAND.x, GLOVE_HAND.y - 0.02, GLOVE_HAND.z);
    return mesh;
  }, []);
  useEffect(() => {
    const made: [THREE.Object3D, THREE.Object3D][] = [];
    for (const [side, arm] of [
      ["L", rig.part.armL],
      ["R", rig.part.armR],
    ] as const) {
      const src = scene.getObjectByName(`Glove_${kind}_${side}`) ?? scene.getObjectByName(`Glove_red_${side}`);
      if (!src) continue;
      const glove = src.clone(true);
      glove.position.set(GLOVE_HAND.x, GLOVE_HAND.y, GLOVE_HAND.z);
      glove.rotation.set(0, 0, 0);
      // (a touch bigger than the hand: a chibi's boxing gloves read from across the hall)
      glove.scale.setScalar(GLOVE_SCALE);
      glove.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).raycast = noRaycast;
      });
      arm.add(glove);
      made.push([arm, glove]);
    }
    rig.part.armR.add(haze);
    return () => {
      made.forEach(([arm, glove]) => arm.remove(glove));
      rig.part.armR.remove(haze);
    };
  }, [scene, rig, kind, haze]);
  useEffect(() => () => (haze.material as THREE.ShaderMaterial).dispose(), [haze]);
  useFrame(({ clock, camera }, delta) => {
    const k = aura.current;
    haze.visible = k > 0.02;
    if (haze.visible) {
      const m = haze.material as THREE.ShaderMaterial;
      m.uniforms.amount.value = k;
      m.uniforms.time.value = clock.elapsedTime;
      haze.scale.setScalar(0.7 + 0.8 * k);
    }
    const anim = fightAnimOf(sessionId);
    // the guard's shield: eased up to 40% while guarding, a flare when a punch lands in it
    const flare = anim.react?.kind === "blockhit" ? 0.5 * (1 - anim.reactAge / 0.2) : 0;
    fx.shieldShown += ((fight === "block" ? 0.4 : 0) - fx.shieldShown) * Math.min(1, delta * 14);
    const shieldOn = fx.shieldShown + flare;
    fx.shield.visible = shieldOn > 0.01;
    (fx.shield.material as THREE.ShaderMaterial).uniforms.opacity.value = shieldOn;
    // the strike's trail: swept in as the punch lands, gone a beat after
    const move = anim.move;
    const trail = move ? TRAILS[move.kind] : undefined;
    fx.streak.visible = false;
    fx.arc.visible = false;
    if (move && trail) {
      const w = move.windup ?? 0.1;
      const a = anim.moveAge;
      const sweep = THREE.MathUtils.smoothstep((a - (w - 0.07)) / 0.08, 0, 1);
      const fade = 1 - THREE.MathUtils.smoothstep((a - w) / 0.13, 0, 1);
      const on = sweep * fade;
      if (on > 0.01) {
        if (trail.kind === "streak") {
          fx.streak.visible = true;
          const len = 0.2 + 0.42 * sweep;
          fx.streak.position.set(trail.x, trail.y, 0.12 + len / 2);
          fx.streak.scale.set(len, 0.08, 1);
          camera.getWorldDirection(fx.view);
          fx.view.applyQuaternion(rig.root.getWorldQuaternion(fx.turn).invert());
          fx.streak.rotation.z = Math.atan2(fx.view.y, fx.view.x);
          (fx.streak.material as THREE.ShaderMaterial).uniforms.opacity.value = 0.95 * on;
        } else {
          fx.arc.visible = true;
          fx.arc.position.set(trail.at[0], trail.at[1], trail.at[2]);
          if (trail.plane === "level") fx.arc.rotation.set(-Math.PI / 2, 0, 0);
          else fx.arc.rotation.set(0, Math.PI / 2, 0);
          const u = (fx.arc.material as THREE.ShaderMaterial).uniforms;
          u.from.value = trail.from;
          u.to.value = trail.from + (trail.to - trail.from) * sweep;
          u.opacity.value = 0.9 * on;
        }
      }
    }
    // the dash's ghost: the fighter's silhouette left behind where it started, fading out
    if (move && move.kind.startsWith("dash") && move.at !== fx.lastDash) {
      fx.lastDash = move.at;
      const mat = GHOST_MAT_PROTO.clone();
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      rig.root.updateWorldMatrix(true, true);
      for (const mesh of shownMeshes(rig.root)) {
        const g = new THREE.Mesh(mesh.geometry, mat);
        g.matrixAutoUpdate = false;
        g.matrix.copy(mesh.matrixWorld);
        g.raycast = noRaycast;
        g.renderOrder = 4;
        group.add(g);
      }
      world.add(group);
      fx.ghosts.push({ group, mat, at: clock.elapsedTime });
    }
    for (let i = fx.ghosts.length - 1; i >= 0; i--) {
      const g = fx.ghosts[i];
      const age = clock.elapsedTime - g.at;
      g.mat.opacity = 0.35 * Math.max(0, 1 - age / 0.24);
      if (age >= 0.24) {
        world.remove(g.group);
        g.mat.dispose();
        fx.ghosts.splice(i, 1);
      }
    }
  });
  return null;
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
  forwardRef<THREE.Group, AvatarProps>(function Avatar({ userId, look, color, username, pose, speedRef, holding = "", drink = "", action = "", speaking = false, emotes = [], gesture = null, status = "", bubble = null, vibe = false, rock = false, awaiting = false, snack = "", actionProgress = 0, bobberAt = null, onHook, fed = false, rodAura = false, title = "", aura = "", xray = false, sessionId = "", gloves = "", champion = false, local = false, map = "", pickWeight = 1 }, ref) {
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
    // the name and the title over it, each of which Settings can hide
    const plates = useNameplateSettings();
    const showName = !!username && plates.showNames;
    // the Velvet Championship Belt's badge takes a capsule title's place while it is worn
    const worn = plates.showTitles && !champion ? titleText(title) : "";
    const special = plates.showTitles ? (champion ? { name: BELT_TITLE } : specialTitle(title)) : null;
    const fight = useFighterState(sessionId);
    // a title rides just over the name, and lifts what floats over it
    const nameY = lying ? LYING_ANCHOR_Y : Math.max(AVATAR_ANCHOR_Y, crownTop + CROWN_CLEARANCE);
    const anchorY = nameY + (worn || special ? 0.15 : 0);

    // the nameplate follows the camera's zoom: the name and the title clamped to their pixel
    // sizes, and the title kept TITLE_GAP_PX over the name's top (or where the name would be)
    const nameRef = useRef<THREE.Group>(null);
    const titleRef = useRef<THREE.Group>(null);
    const specialRef = useRef<THREE.Group>(null);
    const specialText = useRef<HTMLSpanElement>(null);
    const lastTitlePx = useRef(0);
    useFrame(({ camera }) => {
      const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
      const nameK = clampPx(NAME_SIZE * zoom, NAME_PX) / (NAME_SIZE * zoom);
      nameRef.current?.scale.setScalar(nameK);
      const titlePx = clampPx(TITLE_SIZE * zoom, TITLE_PX);
      const base = nameY + (showName ? (NAME_SIZE * nameK) / 2 : 0) + TITLE_GAP_PX / zoom;
      if (titleRef.current) {
        titleRef.current.position.y = base;
        titleRef.current.scale.setScalar(titlePx / (TITLE_SIZE * zoom));
      }
      if (specialRef.current) specialRef.current.position.y = base + (titlePx * 0.6) / zoom;
      if (specialText.current && Math.abs(lastTitlePx.current - titlePx) > 0.05) {
        lastTitlePx.current = titlePx;
        specialText.current.style.fontSize = `${titlePx.toFixed(1)}px`;
      }
    });
    const badge = isActivityStatus(status);
    const overheadY = anchorY + (badge ? 0.7 : 0.32);

    return (
      <group ref={ref}>
        <mesh ref={ringA} geometry={RING_GEO} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false} raycast={noRaycast} />
        <mesh ref={ringB} geometry={RING_GEO} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.031, 0]} visible={false} raycast={noRaycast} />

        <ModelBoundary what="avatar.glb" fallback={<StandIn />}>
          <Suspense fallback={<StandIn />}>
            <AvatarModel xray={xray} look={outfit} pose={pose} speedRef={speedRef} holding={holding} drink={drink} action={action} gesture={gesture} status={status} seed={seed} vibe={vibe} rock={rock} awaiting={awaiting} snack={snack} actionProgress={actionProgress} bobberAt={bobberAt} onHook={onHook} fed={fed} rodAura={rodAura} onCrownTop={setCrownTop} gloves={gloves} fight={fight} sessionId={sessionId} local={local} map={map} pickWeight={pickWeight} />
          </Suspense>
        </ModelBoundary>

        {/* a drink from the casino's bar glows round them */}
        {aura && <CasinoAura aura={aura} />}

        {/* the Billboard cancels the avatar's facing, so the name never turns or mirrors; the
            title is a micro badge standing just clear of the name's top (its bottom on the line) */}
        {worn && (
          <group ref={titleRef} position={[0, nameY + 0.1, 0]}>
            <Billboard>
              <Text font="/fonts/kenpixel.ttf" fontSize={TITLE_SIZE} maxWidth={2.4} textAlign="center" color="#ffd76a" anchorX="center" anchorY="bottom" outlineColor="#3a1a10" outlineWidth={0.016}>
                {worn}
              </Text>
            </Billboard>
          </group>
        )}
        {/* the Velvet Pioneer's title: glowing gold over the name (a DOM overlay: it has an emoji) */}
        {special && (
          <group ref={specialRef} position={[0, nameY + 0.16, 0]}>
            <Html center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
              <span ref={specialText} className="cozy-title-gold">
                {/* the emoji keeps its own colours: only the words are gilded */}
                {special.name.split(/(\p{Extended_Pictographic}️?)/u).map((part, i) => (i % 2 ? <span key={i} className="cozy-title-emoji">{part}</span> : part))}
              </span>
            </Html>
          </group>
        )}
        {showName && (
          <group ref={nameRef} position={[0, nameY, 0]}>
            <Billboard>
              {/* drawn on a canvas (entities/nametagCanvas.ts): any script shows, Thai's marks and all */}
              <Nametag text={username} size={NAME_SIZE} color={speaking ? "#8dffae" : "#ffffff"} />
            </Billboard>
          </group>
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
                  <EmoteGlyph emoji={e.emoji} />
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
