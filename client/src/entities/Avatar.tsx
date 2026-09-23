import { forwardRef, memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, Text } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ACTIVITY_STATUSES, GESTURE_SECONDS, isActivityStatus, TOAST_MAX, defaultLook, hashString, parseLook, type Accessory, type Gesture, type HairStyle, type HeldItem, type OutfitId, type PlayerAction, type SitPose } from "@shared/types";
import { AVATAR_HIP_Y, AVATAR_LEG_RADIUS } from "@shared/seats";
import { GEO, arcGeo, noRaycast, ringGeo } from "../scene/kit";

export type CharacterPose = "stand" | SitPose;

export interface FloatingEmote {
  id: number;
  emoji: string;
}

interface Character3DProps {
  /** Discord user id — picks the head accessory, skin tone and hair colour deterministically. */
  userId: string;
  /** Wardrobe outfit (encodeLook); empty falls back to defaults derived from the user id. */
  look?: string;
  color: string; // "#rrggbb" — the clothing colour
  username: string;
  pose: CharacterPose;
  speedRef: React.MutableRefObject<number>; // 0 = stationary, 1 = full walking speed
  holding: HeldItem;
  action: PlayerAction;
  actionProgress: number;
  toast: number;
  speaking: boolean;
  emotes: FloatingEmote[];
  /** A social gesture in progress (wave, dance, cheers, nap) and when it started (performance.now). */
  gesture?: { kind: Gesture; at: number } | null;
  /** Activity status badge (an ActivityStatusId), "" for none. "afk" also naps. */
  status?: string;
  /** A quick-chat line to show in a speech bubble (keyed so a repeat re-animates). */
  bubble?: { id: number; text: string } | null;
  /** Boxing: the big red gloves go on inside the ring. */
  gloves?: boolean;
  /** A drink's glow colour ("" for none), from the beach blender. */
  aura?: string;
  /** Sitting in the hot spring: a folded towel on the head. */
  soaking?: boolean;
}

// --- Proportions -------------------------------------------------------------------------
// A chibi: the head is almost as big as the body, limbs are stubby, and everything is round.
// Authored directly in world units with the soles on y = 0, so seats and floors line up
// without any extra scaling. Total height is ~1.42 including the head.
const LEG_RADIUS = 0.085;
const LEG_LENGTH = 0.1;
const HIP_Y = LEG_LENGTH + LEG_RADIUS * 2; // 0.27 — top of the leg capsule
// Seat anchors (shared/seats.ts) are derived from these two numbers; the rig and the level data
// must agree or every seated avatar floats or sinks by the difference.
if (Math.abs(HIP_Y - AVATAR_HIP_Y) > 1e-6 || Math.abs(LEG_RADIUS - AVATAR_LEG_RADIUS) > 1e-6) {
  throw new Error("Character3D: hip height / leg radius drifted from shared/seats.ts");
}
const LEG_X = 0.105;

const BODY_Y = 0.5; // centre of the rounded torso
const BODY_R = 0.25;

const ARM_RADIUS = 0.065;
const ARM_LENGTH = 0.13;
const ARM_TOTAL = ARM_LENGTH + ARM_RADIUS * 2;
const SHOULDER_Y = 0.66;
const SHOULDER_X = 0.25;

const HEAD_Y = 1.04;
const HEAD_R = 0.36;
const NAMETAG_Y = HEAD_Y + HEAD_R + 0.2;

// --- Motion ---
const COLOR_LERP = 0.15;
const WALK_CYCLE = 11; // radians/sec: short legs take quick steps
const WADDLE_ROLL = 0.11; // side-to-side body roll — the waddle
const BOB_HEIGHT = 0.05;
const ARM_SWING = 0.7;
const LEG_SWING = 0.55;
const LIMB_LERP = 0.25;
const POSE_LERP = 0.18;
const SIT_LEG = -Math.PI / 2;
const SIT_ARM = -0.5;
const ROAST_ARM = -1.2;
const CUP_ARM = -1.05;
const FISH_ARM = -1.0;
const LIE_ROLL = -Math.PI / 2;
const LIE_LIFT = 0.26;

// Marshmallow doneness colours: raw -> golden -> charcoal.
const RAW = new THREE.Color("#f6f1e6");
const GOLDEN = new THREE.Color("#d9974a");
const BURNT = new THREE.Color("#2d211a");


// Shared geometry: every avatar uses the same few shapes, created once for the app's lifetime.
const G = {
  leg: new THREE.CapsuleGeometry(LEG_RADIUS, LEG_LENGTH, 4, 10),
  arm: new THREE.CapsuleGeometry(ARM_RADIUS, ARM_LENGTH, 4, 10),
  body: new THREE.SphereGeometry(1, 18, 14),
  head: new THREE.SphereGeometry(HEAD_R, 24, 18),
  // Hair is a real shell standing ~0.07 off the skull (not a swim-cap hugging it), tipped back
  // so the forehead shows, with separate bangs and per-style volumes on top.
  beanieShell: new THREE.SphereGeometry(HEAD_R + 0.11, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
  // The sunhat's crown: a dome wide enough to sit over the hair, open underneath.
  hatCrown: new THREE.SphereGeometry(0.44, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
  collar: new THREE.TorusGeometry(0.19, 0.055, 8, 22),
  eye: new THREE.SphereGeometry(0.048, 10, 8),
  glint: new THREE.SphereGeometry(0.016, 6, 5),
  blush: new THREE.CircleGeometry(0.06, 16),
  hand: new THREE.SphereGeometry(0.075, 10, 8),
  foot: new THREE.SphereGeometry(1, 10, 8),
};

// Shared, never-animated materials.
const M = {
  eye: new THREE.MeshBasicMaterial({ color: "#241a1a" }),
  glint: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
  blush: new THREE.MeshBasicMaterial({ color: "#ff8f9e", transparent: true, opacity: 0.45, depthWrite: false }),
  mouth: new THREE.MeshBasicMaterial({ color: "#6b3a34" }),
  shoe: new THREE.MeshStandardMaterial({ color: "#4a3a30", roughness: 0.8 }),
  mug: new THREE.MeshStandardMaterial({ color: "#f7f3ea", roughness: 0.5 }),
  coffee: new THREE.MeshStandardMaterial({ color: "#4a2c1a", roughness: 0.3 }),
  steam: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false }),
  smoke: new THREE.MeshBasicMaterial({ color: "#d8d2cc", transparent: true, opacity: 0.35, depthWrite: false }),
  stick: new THREE.MeshStandardMaterial({ color: "#8a6a45", roughness: 0.9 }),
  rod: new THREE.MeshStandardMaterial({ color: "#5a3a24", roughness: 0.6 }),
  line: new THREE.MeshBasicMaterial({ color: "#f2f2f2", transparent: true, opacity: 0.7 }),
  bobberRed: new THREE.MeshStandardMaterial({ color: "#e0453a", roughness: 0.5 }),
  bobberWhite: new THREE.MeshStandardMaterial({ color: "#f7f3ea", roughness: 0.5 }),
  gaugeBg: new THREE.MeshBasicMaterial({ color: "#1d1a24", transparent: true, opacity: 0.75, depthTest: false }),
  gaugeFill: new THREE.MeshBasicMaterial({ color: "#f4a15c", depthTest: false }),
  // accessories
  beret: new THREE.MeshStandardMaterial({ color: "#b8434a", roughness: 0.9 }),
  beanie: new THREE.MeshStandardMaterial({ color: "#e0a93b", roughness: 0.95 }),
  beanieBand: new THREE.MeshStandardMaterial({ color: "#c98f2a", roughness: 0.95 }),
  pom: new THREE.MeshStandardMaterial({ color: "#f7f3ea", roughness: 1 }),
  petal: new THREE.MeshStandardMaterial({ color: "#f59ab4", roughness: 0.7 }),
  petalCenter: new THREE.MeshStandardMaterial({ color: "#f2c94c", roughness: 0.7 }),
  headphone: new THREE.MeshStandardMaterial({ color: "#2f3f5c", roughness: 0.4, metalness: 0.2 }),
  headphonePad: new THREE.MeshStandardMaterial({ color: "#7d9471", roughness: 0.9 }),
  collar: new THREE.MeshStandardMaterial({ color: "#fbf6ea", roughness: 0.85 }),
  straw: new THREE.MeshStandardMaterial({ color: "#e8cf8a", roughness: 1 }),
  strawDark: new THREE.MeshStandardMaterial({ color: "#c9ad68", roughness: 1 }),
  beretBand: new THREE.MeshStandardMaterial({ color: "#8f2f36", roughness: 0.9 }),
  ribbon: new THREE.MeshStandardMaterial({ color: "#e0707a", roughness: 0.8 }),
  topHat: new THREE.MeshStandardMaterial({ color: "#1d1b22", roughness: 0.5 }),
  bunny: new THREE.MeshStandardMaterial({ color: "#fbf6f2", roughness: 0.9 }),
  bunnyInner: new THREE.MeshStandardMaterial({ color: "#f5b3c3", roughness: 0.9 }),
  crown: new THREE.MeshStandardMaterial({ color: "#f2c23a", roughness: 0.25, metalness: 0.85 }),
  gem: new THREE.MeshStandardMaterial({ color: "#d6334a", roughness: 0.2, emissive: "#6a0a18", emissiveIntensity: 0.6 }),
  flute: new THREE.MeshStandardMaterial({ color: "#f6e7b0", roughness: 0.1, transparent: true, opacity: 0.8 }),
  mochiFur: new THREE.MeshStandardMaterial({ color: "#e89a52", roughness: 0.9 }),
};

// --- Outfits ------------------------------------------------------------------------------------
// Every outfit is the same rig dressed differently: the torso and sleeves take the player's
// accent colour, the legs a fixed fabric, and a few extra shapes (a hood, straps, lapels, a
// sash, a robe) tell them apart at chibi size.
const OUTFIT_M = {
  sweats: new THREE.MeshStandardMaterial({ color: "#5a5a66", roughness: 0.95 }),
  denim: new THREE.MeshStandardMaterial({ color: "#3f5f8a", roughness: 0.9 }),
  denimDark: new THREE.MeshStandardMaterial({ color: "#2f4a6e", roughness: 0.9 }),
  khaki: new THREE.MeshStandardMaterial({ color: "#a08a60", roughness: 0.95 }),
  flannel: new THREE.MeshStandardMaterial({ color: "#b3403a", roughness: 0.95 }),
  flannelLine: new THREE.MeshStandardMaterial({ color: "#3a2320", roughness: 0.95 }),
  linen: new THREE.MeshStandardMaterial({ color: "#f5ecd8", roughness: 0.95 }),
  hibiscus: new THREE.MeshStandardMaterial({ color: "#ff6b8a", roughness: 0.9 }),
  tuxBlack: new THREE.MeshStandardMaterial({ color: "#1d1b22", roughness: 0.6 }),
  tuxShirt: new THREE.MeshStandardMaterial({ color: "#f7f3ea", roughness: 0.8 }),
  bowTie: new THREE.MeshStandardMaterial({ color: "#b3202e", roughness: 0.6 }),
  robeTrim: new THREE.MeshStandardMaterial({ color: "#f2c23a", roughness: 0.5, metalness: 0.3 }),
  shorts: new THREE.MeshStandardMaterial({ color: "#f4efe6", roughness: 0.9 }),
  indigo: new THREE.MeshStandardMaterial({ color: "#2b3a6b", roughness: 0.95 }),
  obi: new THREE.MeshStandardMaterial({ color: "#e0a93b", roughness: 0.9 }),
  cyber: new THREE.MeshStandardMaterial({ color: "#1a1a2e", roughness: 0.5, metalness: 0.2 }),
  neon: new THREE.MeshStandardMaterial({ color: "#4fe3ff", emissive: "#4fe3ff", emissiveIntensity: 1.8, roughness: 0.4 }),
  neonPink: new THREE.MeshStandardMaterial({ color: "#ff5fc8", emissive: "#ff5fc8", emissiveIntensity: 1.6, roughness: 0.4 }),
  glove: new THREE.MeshStandardMaterial({ color: "#d63a48", roughness: 0.55 }),
  gloveCuff: new THREE.MeshStandardMaterial({ color: "#f4efe6", roughness: 0.8 }),
  towel: new THREE.MeshStandardMaterial({ color: "#fbf8f0", roughness: 1 }),
  towelStripe: new THREE.MeshStandardMaterial({ color: "#9ac6ea", roughness: 1 }),
  bird: new THREE.MeshStandardMaterial({ color: "#ffe15f", roughness: 0.8 }),
};

interface OutfitSpec {
  /** Legs. null means the accent colour (a one-piece). */
  legs: THREE.Material | null;
  /** Torso material when it is NOT the accent colour (the tux is always black). */
  torso: THREE.Material | null;
  /** Sleeves follow the torso unless given. */
  sleeves?: THREE.Material | null;
  collar: boolean;
}
const OUTFIT_SPECS: Record<OutfitId, OutfitSpec> = {
  outfit_starter_hoodie: { legs: OUTFIT_M.sweats, torso: null, collar: false },
  outfit_starter_overalls: { legs: OUTFIT_M.denim, torso: null, collar: true },
  outfit_flannel_vest: { legs: OUTFIT_M.khaki, torso: OUTFIT_M.flannel, sleeves: OUTFIT_M.flannel, collar: false },
  outfit_hawaiian: { legs: OUTFIT_M.linen, torso: null, collar: true },
  outfit_tuxedo: { legs: OUTFIT_M.tuxBlack, torso: OUTFIT_M.tuxBlack, collar: false },
  outfit_boxing: { legs: OUTFIT_M.shorts, torso: null, collar: false },
  outfit_yukata: { legs: OUTFIT_M.indigo, torso: OUTFIT_M.indigo, collar: false },
  outfit_cyber: { legs: OUTFIT_M.cyber, torso: OUTFIT_M.cyber, collar: false },
};

const skinCache = new Map<string, THREE.MeshStandardMaterial>();
function skinMaterial(color: string) {
  let m = skinCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    skinCache.set(color, m);
  }
  return m;
}
const hairCache = new Map<string, THREE.MeshStandardMaterial>();
function hairMaterial(color: string) {
  let m = hairCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    hairCache.set(color, m);
  }
  return m;
}

const STICK_ANGLE = Math.atan2(1, 0.35);
const STICK_LENGTH = 1.15;
const ROD_LENGTH = 1.3;

// A stylized chibi avatar. Visual body only: the parent (LocalPlayerAvatar /
// RemotePlayerAvatar in WorldScene) owns the forwarded outer group and drives its position.
export const Character3D = memo(
  forwardRef<THREE.Group, Character3DProps>(
    ({ userId, look, color, username, pose, speedRef, holding, action, actionProgress, toast, speaking, emotes, gesture, status = "", bubble = null, gloves = false, aura = "", soaking = false }, ref) => {
      const bodyRef = useRef<THREE.Group>(null);
      const torsoRef = useRef<THREE.Mesh>(null);
      const headRef = useRef<THREE.Group>(null);
      const eyesRef = useRef<THREE.Group>(null);
      const leftArmRef = useRef<THREE.Group>(null);
      const rightArmRef = useRef<THREE.Group>(null);
      const leftLegRef = useRef<THREE.Group>(null);
      const rightLegRef = useRef<THREE.Group>(null);
      const mugRef = useRef<THREE.Group>(null);
      const stickRef = useRef<THREE.Group>(null);
      const smokeRef = useRef<THREE.Group>(null);
      const rodRef = useRef<THREE.Group>(null);
      const bobberRef = useRef<THREE.Group>(null);
      const steamRef = useRef<THREE.Group>(null);
      const fluteRef = useRef<THREE.Group>(null);
      const auraRef = useRef<THREE.Mesh>(null);
      const aura2Ref = useRef<THREE.Mesh>(null);
      const birdsRef = useRef<THREE.Group>(null);
      const glowRef = useRef<THREE.Mesh>(null);
      const targetColor = useRef(new THREE.Color(color));
      // an occasional curious head tilt while idle, on its own per-avatar schedule
      const tiltRef = useRef({ next: 4 + Math.random() * 6, until: 0, dir: 1 });
      const walkPhaseRef = useRef(0);
      const blinkRef = useRef({ next: 2 + Math.random() * 3, t: 0 });
      // every avatar breathes and glances round on its own clock, so a crowd never moves in unison
      const idleSeed = useMemo(() => (hashString(userId || username) % 1000) / 100, [userId, username]);

      const outfit = useMemo(() => parseLook(look) ?? defaultLook(userId || username, color), [look, userId, username, color]);
      const identity = useMemo(
        () => ({
          accessory: outfit.hat,
          hairStyle: outfit.hairStyle,
          skin: skinMaterial(outfit.skin),
          hair: hairMaterial(outfit.hair),
          outfit: outfit.outfit,
          spec: OUTFIT_SPECS[outfit.outfit] ?? OUTFIT_SPECS.outfit_starter_hoodie,
        }),
        [outfit]
      );

      const clothes = useMemo(
        () => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
      );
      const marshmallowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: RAW, roughness: 0.8 }), []);
      const auraMat = useMemo(
        () => new THREE.MeshBasicMaterial({ color: "#43d17a", transparent: true, opacity: 0, depthWrite: false }),
        []
      );
      // the drink glow: a soft additive shell round the body in the drink's colour
      const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }), []);
      useEffect(
        () => () => {
          clothes.dispose();
          marshmallowMat.dispose();
          auraMat.dispose();
          glowMat.dispose();
        },
        [clothes, marshmallowMat, auraMat, glowMat]
      );
      useEffect(() => {
        targetColor.current.set(outfit.outfitColor);
      }, [outfit.outfitColor]);
      useEffect(() => {
        if (aura) glowMat.color.set(aura);
      }, [aura, glowMat]);

      useFrame(({ clock }, delta) => {
        const t = clock.elapsedTime;
        clothes.color.lerp(targetColor.current, COLOR_LERP);

        const seated = pose !== "stand";
        const speed = seated ? 0 : speedRef.current;
        const walking = speed > 0.05;
        if (walking) walkPhaseRef.current += delta * WALK_CYCLE * (0.6 + 0.4 * speed);
        const phase = walkPhaseRef.current;
        const swing = walking ? Math.sin(phase) * Math.min(1, speed * 1.4) : 0;
        const roasting = holding === "marshmallow";
        const holdingCup = holding === "coffee";
        const fishing = action === "fish" || action === "afkfish" || action === "reel";
        const reeling = action === "reel";
        const dizzy = action === "dizzy";
        // AFK and standing about: curl up for a nap where you are until you're back.
        // AFK: stay on your feet, eyes shut, swaying gently like someone dozing standing up.
        const dozing = status === "afk" && !walking && pose === "stand";

        // --- limbs ---
        let leftArm = swing * ARM_SWING;
        let rightArm = -swing * ARM_SWING;
        let legs: [number, number] = [-swing * LEG_SWING, swing * LEG_SWING];
        if (pose === "sit") {
          leftArm = rightArm = SIT_ARM;
          legs = [SIT_LEG, SIT_LEG];
        } else if (pose === "lie") {
          leftArm = rightArm = 0;
          legs = [0, 0];
        } else if (!walking) {
          // idle: a slow sway in the arms
          const idle = Math.sin(t * 1.3 + idleSeed) * 0.05;
          leftArm = idle;
          rightArm = -idle;
        }
        // --- social gestures (only while standing still) ---
        const gAge = gesture ? (performance.now() - gesture.at) / 1000 : Infinity;
        const g = gesture && gAge < GESTURE_SECONDS[gesture.kind] && !walking && pose === "stand" ? gesture.kind : null;
        let waveZ = 0.35;
        if (g === "wave") {
          rightArm = -2.75;
          waveZ = 0.35 + Math.sin(gAge * 11) * 0.4;
        } else if (g === "dance") {
          leftArm = -2.3 + Math.sin(gAge * 7) * 0.6;
          rightArm = -2.3 - Math.sin(gAge * 7) * 0.6;
          legs = [Math.max(0, Math.sin(gAge * 7)) * -0.4, Math.max(0, -Math.sin(gAge * 7)) * -0.4];
        } else if (g === "cheers") {
          rightArm = -2.45 + Math.sin(gAge * 3) * 0.1;
        }
        if (rightArmRef.current) rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, waveZ, 0.3);
        if (fluteRef.current) fluteRef.current.visible = g === "cheers";

        if (roasting) leftArm = rightArm = ROAST_ARM;
        if (fishing) rightArm = FISH_ARM + Math.sin(t * 1.1) * 0.04;
        if (reeling) {
          // both hands on the rod, tugging against the fish
          rightArm = FISH_ARM - 0.3 + Math.sin(t * 9) * 0.18;
          leftArm = FISH_ARM - 0.1 + Math.sin(t * 9 + 1) * 0.12;
        }
        if (gloves && !seated && !dizzy) {
          // guard up, bouncing on the toes
          leftArm = -1.9 + Math.sin(t * 6) * 0.08;
          rightArm = -2.0 - Math.sin(t * 6) * 0.08;
        }
        if (dizzy) {
          leftArm = -0.6;
          rightArm = -0.6;
        }
        if (holdingCup && pose !== "lie" && !fishing) rightArm = CUP_ARM + swing * 0.1;

        const L = THREE.MathUtils.lerp;
        const lerp = seated ? POSE_LERP : LIMB_LERP;
        if (leftArmRef.current) leftArmRef.current.rotation.x = L(leftArmRef.current.rotation.x, leftArm, lerp);
        if (rightArmRef.current) rightArmRef.current.rotation.x = L(rightArmRef.current.rotation.x, rightArm, lerp);
        if (leftLegRef.current) leftLegRef.current.rotation.x = L(leftLegRef.current.rotation.x, legs[0], lerp);
        if (rightLegRef.current) rightLegRef.current.rotation.x = L(rightLegRef.current.rotation.x, legs[1], lerp);

        // --- body: waddle when walking, breathe when still, lie flat on a blanket ---
        const body = bodyRef.current;
        if (body) {
          const lying = pose === "lie" || g === "nap";
          const danceBob = g === "dance" ? Math.abs(Math.sin(gAge * 7)) * 0.08 : 0;
          const bob = walking ? Math.abs(Math.sin(phase)) * BOB_HEIGHT : danceBob;
          body.position.y = L(body.position.y, lying ? LIE_LIFT : bob, lerp);
          body.rotation.x = L(body.rotation.x, lying ? LIE_ROLL : walking ? 0.06 * speed : dizzy ? Math.sin(t * 4.5) * 0.12 : 0, lerp);
          body.rotation.z = L(body.rotation.z, walking ? Math.sin(phase) * WADDLE_ROLL : dizzy ? Math.cos(t * 4.5) * 0.28 : dozing ? Math.sin(t * 0.9) * 0.05 : 0, lerp);
          body.rotation.y = L(body.rotation.y, g === "dance" ? Math.sin(gAge * 3.5) * 0.6 : 0, 0.2);
        }
        const torso = torsoRef.current;
        if (torso) {
          const breath = walking ? 0 : Math.sin(t * 2.1 + idleSeed) * 0.018;
          torso.scale.set(BODY_R * (1 - breath * 0.5), BODY_R * 1.06 * (1 + breath), BODY_R * 0.92);
        }

        // --- head: glance about when standing still, look toward the fire/water when busy ---
        const head = headRef.current;
        if (head) {
          const idleLook = !walking && pose === "stand" ? Math.sin(t * 0.45 + idleSeed) * 0.35 * Math.max(0, Math.sin(t * 0.21 + idleSeed * 2)) : 0;
          head.rotation.y = L(head.rotation.y, idleLook, 0.06);
          const tilt = tiltRef.current;
          if (!walking && t > tilt.next) {
            tilt.until = t + 1.4;
            tilt.dir = Math.random() < 0.5 ? -1 : 1;
            tilt.next = t + 6 + Math.random() * 9;
          }
          const tiltZ = !walking && t < tilt.until ? tilt.dir * 0.22 : 0;
          head.rotation.z = L(head.rotation.z, walking ? -Math.sin(phase) * 0.06 : tiltZ, walking ? 0.2 : 0.08);
          head.position.y = HEAD_Y + (walking ? 0 : Math.sin(t * 2.1 + idleSeed) * 0.006);
        }

        // --- blink ---
        const blink = blinkRef.current;
        blink.t += delta;
        if (eyesRef.current) {
          let open = 1;
          if (blink.t > blink.next) {
            const k = (blink.t - blink.next) / 0.14;
            open = k < 1 ? Math.abs(1 - k * 2) : 1;
            if (k >= 1) {
              blink.t = 0;
              blink.next = 2.5 + Math.random() * 3.5;
            }
          }
          eyesRef.current.scale.y = g === "nap" || dozing ? 0.1 : Math.max(0.1, open);
        }
        // knocked silly: little birds circle the head
        if (birdsRef.current) {
          birdsRef.current.visible = dizzy;
          if (dizzy) {
            birdsRef.current.rotation.y = t * 4;
            birdsRef.current.position.y = HEAD_Y + HEAD_R + 0.2 + Math.sin(t * 6) * 0.03;
          }
        }
        // the drink glow breathes while it lasts
        glowMat.opacity = L(glowMat.opacity, aura ? 0.16 + Math.sin(t * 2.2) * 0.05 : 0, 0.08);
        if (glowRef.current) glowRef.current.visible = glowMat.opacity > 0.01;

        // --- held items, counter-rotated so a cup stays upright whatever the arm does ---
        const armX = rightArmRef.current?.rotation.x ?? 0;
        if (mugRef.current) {
          mugRef.current.visible = holdingCup && !fishing;
          mugRef.current.rotation.x = -armX;
        }
        if (stickRef.current) {
          stickRef.current.visible = roasting;
          stickRef.current.rotation.x = -armX;
        }
        if (rodRef.current) {
          rodRef.current.visible = fishing;
          rodRef.current.rotation.x = -armX;
        }
        if (bobberRef.current) {
          bobberRef.current.visible = fishing;
          // the float rides the swell, with an occasional nibble dip
          const nibble = Math.max(0, Math.sin(t * 5.3 + idleSeed)) > 0.93 ? -0.05 : 0;
          bobberRef.current.position.y = -0.2 + Math.sin(t * 1.7) * 0.02 + nibble;
        }
        if (holdingCup && steamRef.current) {
          steamRef.current.children.forEach((puff, i) => {
            const p = (t * 0.6 + i / 3) % 1;
            puff.position.set(Math.sin(p * 5 + i) * 0.03, 0.14 + p * 0.3, 0);
            puff.scale.setScalar(0.04 + p * 0.06);
          });
        }
        if (roasting) {
          const k = Math.min(toast, TOAST_MAX);
          if (k <= 1) marshmallowMat.color.copy(RAW).lerp(GOLDEN, k);
          else marshmallowMat.color.copy(GOLDEN).lerp(BURNT, (k - 1) / (TOAST_MAX - 1));
          // wisps of smoke off the marshmallow, thicker the closer it gets to burning
          if (smokeRef.current) {
            const thickness = Math.min(1, 0.35 + Math.max(0, toast - 0.6));
            smokeRef.current.children.forEach((puff, i) => {
              const p = (t * 0.5 + i / 4) % 1;
              puff.position.set(Math.sin(p * 4 + i * 2) * 0.05, p * 0.55, 0);
              puff.scale.setScalar((0.05 + p * 0.1) * thickness);
            });
          }
        }

        // --- Discord voice aura: two rings pulsing out from the feet while speaking ---
        const pulse = (t * 1.5) % 1;
        const pulse2 = (t * 1.5 + 0.5) % 1;
        auraMat.opacity = L(auraMat.opacity, speaking ? 0.85 : 0, 0.25);
        const show = auraMat.opacity > 0.02;
        if (auraRef.current) {
          auraRef.current.visible = show;
          auraRef.current.scale.setScalar(0.5 + pulse * 0.55);
        }
        if (aura2Ref.current) {
          aura2Ref.current.visible = show;
          aura2Ref.current.scale.setScalar(0.5 + pulse2 * 0.55);
        }
      });

      const gaugeVisible = action === "brew";
      const gaugeWidth = 0.7;
      const lying = pose === "lie";
      const bite = action === "fish" && actionProgress >= 1;
      const overheadY = (lying ? 0.72 : NAMETAG_Y) + (isActivityStatus(status) ? 0.7 : 0.32);

      return (
        <group ref={ref}>
          {/* Voice aura on the floor. Stays out of the body group so lying down doesn't tip it. */}
          <mesh ref={auraRef} geometry={ringGeo(0.62, 0.7)} material={auraMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false} raycast={noRaycast} />
          <mesh ref={aura2Ref} geometry={ringGeo(0.62, 0.7)} material={auraMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.031, 0]} visible={false} raycast={noRaycast} />

          <group ref={bodyRef}>
            {/* legs pivot at the hip; little round shoes on the ends */}
            {[
              [leftLegRef, -LEG_X],
              [rightLegRef, LEG_X],
            ].map(([legRef, x], i) => (
              <group key={i} ref={legRef as React.RefObject<THREE.Group>} position={[x as number, HIP_Y, 0]}>
                <mesh geometry={G.leg} material={identity.spec.legs ?? clothes} position={[0, -HIP_Y / 2, 0]} raycast={noRaycast} />
                <mesh geometry={G.foot} material={M.shoe} position={[0, -HIP_Y + 0.045, 0.035]} scale={[0.1, 0.06, 0.13]} raycast={noRaycast} />
              </group>
            ))}

            {/* a round, slightly pear-shaped body */}
            <mesh ref={torsoRef} castShadow receiveShadow geometry={G.body} material={identity.spec.torso ?? clothes} position={[0, BODY_Y, 0]} scale={[BODY_R, BODY_R * 1.06, BODY_R * 0.92]} raycast={noRaycast} />
            <OutfitDetails outfit={identity.outfit} accent={clothes} />

            {/* a little collar, so the head doesn't just sit on the egg of the body */}
            {identity.spec.collar && <mesh geometry={G.collar} material={M.collar} position={[0, 0.73, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.92, 1]} raycast={noRaycast} />}
            {/* the drink glow */}
            <mesh ref={glowRef} geometry={G.body} material={glowMat} position={[0, BODY_Y + 0.1, 0]} scale={[BODY_R + 0.14, BODY_R * 1.5, BODY_R + 0.1]} visible={false} raycast={noRaycast} />

            {/* arms pivot at the shoulder */}
            <group ref={leftArmRef} position={[-SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, -0.35]}>
              <mesh geometry={G.arm} material={sleeveMaterial(identity.spec, clothes)} position={[0, -ARM_TOTAL / 2, 0]} raycast={noRaycast} />
              <mesh geometry={G.hand} material={identity.skin} position={[0, -ARM_TOTAL, 0]} raycast={noRaycast} />
              {gloves && <BoxingGlove />}
            </group>
            <group ref={rightArmRef} position={[SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, 0.35]}>
              <mesh geometry={G.arm} material={sleeveMaterial(identity.spec, clothes)} position={[0, -ARM_TOTAL / 2, 0]} raycast={noRaycast} />
              <mesh geometry={G.hand} material={identity.skin} position={[0, -ARM_TOTAL, 0]} raycast={noRaycast} />
              {gloves && <BoxingGlove />}

              {/* a champagne flute for cheers */}
              <group ref={fluteRef} position={[0, -ARM_TOTAL - 0.02, 0.06]} visible={false}>
                <mesh geometry={GEO.cyl} material={M.flute} position={[0, 0.02, 0]} scale={[0.02, 0.12, 0.02]} raycast={noRaycast} />
                <mesh geometry={GEO.cone} material={M.flute} position={[0, 0.16, 0]} rotation={[Math.PI, 0, 0]} scale={[0.09, 0.2, 0.09]} raycast={noRaycast} />
              </group>

              {/* coffee mug, steaming */}
              <group ref={mugRef} position={[0, -ARM_TOTAL, 0.05]} visible={false}>
                <mesh geometry={GEO.cyl} material={M.mug} position={[0, 0.06, 0.1]} scale={[0.17, 0.2, 0.17]} raycast={noRaycast} />
                <mesh geometry={GEO.cyl} material={M.coffee} position={[0, 0.155, 0.1]} scale={[0.14, 0.01, 0.14]} raycast={noRaycast} />
                <mesh geometry={GEO.torus} material={M.mug} position={[0.1, 0.06, 0.1]} rotation={[0, 0, Math.PI / 2]} scale={[0.06, 0.06, 0.3]} raycast={noRaycast} />
                <group ref={steamRef} position={[0, 0, 0.1]}>
                  {[0, 1, 2].map((i) => (
                    <mesh key={i} geometry={GEO.sphereLow} material={M.steam} raycast={noRaycast} />
                  ))}
                </group>
              </group>

              {/* roasting stick with a marshmallow — and a curl of smoke off it */}
              <group ref={stickRef} position={[0, -ARM_TOTAL, 0]} visible={false}>
                <group rotation={[STICK_ANGLE, 0, 0]}>
                  <mesh geometry={GEO.cyl} material={M.stick} position={[0, STICK_LENGTH / 2, 0]} scale={[0.03, STICK_LENGTH, 0.03]} raycast={noRaycast} />
                  <mesh geometry={GEO.sphere} material={marshmallowMat} position={[0, STICK_LENGTH + 0.04, 0]} scale={[0.15, 0.19, 0.15]} raycast={noRaycast} />
                  <group ref={smokeRef} position={[0, STICK_LENGTH + 0.12, 0]} rotation={[-STICK_ANGLE, 0, 0]}>
                    {[0, 1, 2, 3].map((i) => (
                      <mesh key={i} geometry={GEO.sphereLow} material={M.smoke} raycast={noRaycast} />
                    ))}
                  </group>
                </group>
              </group>

              {/* fishing rod angled out over the water */}
              <group ref={rodRef} position={[0, -ARM_TOTAL, 0]} visible={false}>
                <group rotation={[1.0, 0, 0]}>
                  <mesh geometry={GEO.cyl} material={M.rod} position={[0, ROD_LENGTH / 2, 0]} scale={[0.028, ROD_LENGTH, 0.028]} raycast={noRaycast} />
                  <mesh geometry={GEO.cyl} material={M.bobberWhite} position={[0, 0.18, 0.04]} scale={[0.08, 0.06, 0.08]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast} />
                </group>
              </group>
            </group>

            {/* --- the head: big, round, with a face --- */}
            <group ref={headRef} position={[0, HEAD_Y, 0]}>
              <mesh castShadow receiveShadow geometry={G.head} material={identity.skin} raycast={noRaycast} />
              <Hair style={identity.hairStyle} mat={identity.hair} hidden={identity.accessory === "beanie" || identity.accessory === "tophat" || identity.accessory === "straw"} />
              {/* eyes (the group squashes to blink), with a glint each */}
              <group ref={eyesRef} position={[0, 0.0, HEAD_R * 0.9]}>
                <mesh geometry={EYES_GEO} material={M.eye} raycast={noRaycast} />
                <mesh geometry={GLINTS_GEO} material={M.glint} raycast={noRaycast} />
              </group>
              {/* blush and a small smile */}
              <mesh geometry={BLUSH_GEO} material={M.blush} raycast={noRaycast} />
              <mesh geometry={arcGeo(0.05, 0.012, Math.PI)} material={M.mouth} position={[0, -0.075, HEAD_R * 0.96]} rotation={[0, 0, Math.PI]} raycast={noRaycast} />

              {soaking ? <HeadTowel /> : <HeadAccessory kind={identity.accessory} />}
            </group>
            {/* dizzy birds, orbiting above the head */}
            <group ref={birdsRef} position={[0, HEAD_Y + HEAD_R + 0.2, 0]} visible={false}>
              {[0, 1, 2].map((i) => (
                <group key={i} rotation={[0, (i / 3) * Math.PI * 2, 0]}>
                  <mesh geometry={GEO.sphereLow} material={OUTFIT_M.bird} position={[0.42, 0, 0]} scale={[0.09, 0.07, 0.07]} raycast={noRaycast} />
                  <mesh geometry={GEO.cone} material={OUTFIT_M.bird} position={[0.5, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.03, 0.05, 0.03]} raycast={noRaycast} />
                </group>
              ))}
            </group>
          </group>

          {/* fishing float, out in front of the seat, riding the water */}
          <group ref={bobberRef} position={[0, -0.2, 1.55]} visible={false}>
            <mesh geometry={GEO.sphereLow} material={M.bobberRed} position={[0, 0.04, 0]} scale={0.09} raycast={noRaycast} />
            <mesh geometry={GEO.sphereLow} material={M.bobberWhite} position={[0, -0.02, 0]} scale={0.085} raycast={noRaycast} />
            {/* the line back up to the rod tip */}
            <mesh geometry={GEO.cyl} material={M.line} position={[0.12, 0.55, -0.45]} rotation={[-0.95, 0, 0.12]} scale={[0.008, 1.25, 0.008]} raycast={noRaycast} />
          </group>

          {/* Billboard cancels the character's facing rotation — without it the nametag turns
              with the body and renders mirrored when the player walks away. */}
          <Billboard position={[0, lying ? 0.72 : NAMETAG_Y, 0]}>
            {/* `font` MUST stay set: without it troika-three-text reaches for a CDN font that
                Discord's Activity CSP blocks, which silently broke rendering. */}
            <Text
              font="/fonts/kenpixel.ttf"
              fontSize={0.15}
              maxWidth={1.6}
              overflowWrap="break-word"
              textAlign="center"
              color={speaking ? "#8dffae" : "#ffffff"}
              anchorX="center"
              anchorY="middle"
              outlineColor="#000000"
              outlineWidth={0.02}
            >
              {username}
            </Text>

            {gaugeVisible && (
              <group position={[0, 0.24, 0]}>
                <mesh geometry={GEO.plane} material={M.gaugeBg} scale={[gaugeWidth + 0.04, 0.11, 1]} renderOrder={10} raycast={noRaycast} />
                <mesh
                  geometry={GEO.plane}
                  material={M.gaugeFill}
                  position={[-gaugeWidth / 2 + (gaugeWidth * actionProgress) / 2, 0, 0.001]}
                  scale={[Math.max(0.001, gaugeWidth * actionProgress), 0.07, 1]}
                  renderOrder={11}
                  raycast={noRaycast}
                />
              </group>
            )}
          </Billboard>

          {/* Emoji (emotes, and the bouncing note while talking) need the platform colour-emoji
              font, which WebGL text can't use, so they're DOM overlays. No distanceFactor:
              under an OrthographicCamera it scales runaway. */}
          {isActivityStatus(status) && (
            <Html position={[0, (lying ? 0.72 : NAMETAG_Y) + 0.42, 0]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
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
          {bite && (
            <Html position={[0, overheadY + 0.2, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
              <div className="cozy-bite-mark">!</div>
            </Html>
          )}
          {(emotes.length > 0 || speaking) && (
            <Html position={[0, NAMETAG_Y + (isActivityStatus(status) ? 0.66 : 0.3), 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
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
    }
  )
);

Character3D.displayName = "Avatar";

/** The player avatar entity (the name the rest of the app grew up with is kept below). */
export const Avatar = Character3D;

// --- Merged part geometry ------------------------------------------------------------------------
// Bangs, spikes, petals and crown points are several shapes that never move relative to each
// other, so each set is baked into ONE geometry at load: one draw call per set instead of up to
// eleven, per avatar. That matters with a full room of players.

type Part = { geo: THREE.BufferGeometry; p: [number, number, number]; r?: [number, number, number] | [number, number, number, string]; s: number | [number, number, number] };
function bake(parts: Part[]): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const geos = parts.map(({ geo, p, r, s }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    if (r) e.set(r[0], r[1], r[2], (r[3] as THREE.EulerOrder) ?? "XYZ");
    else e.set(0, 0, 0);
    q.setFromEuler(e);
    const sc = typeof s === "number" ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    m.compose(new THREE.Vector3(...p), q, sc);
    g.applyMatrix4(m);
    return g;
  });
  return mergeGeometries(geos) ?? geos[0];
}

// --- Hair --------------------------------------------------------------------------------------
// Every style is the same volumetric shell plus a fringe of bangs, with its own extra volumes.
// The shell is tipped back so its front edge sits just above the eyes and its back edge falls
// to the nape.

// The face: both eyes, both glints and both blush marks are one geometry each.
const EYES_GEO = bake([-0.12, 0.12].map((x) => ({ geo: G.eye, p: [x, 0, 0] as [number, number, number], s: [1, 1.25, 0.6] as [number, number, number] })));
const GLINTS_GEO = bake([-0.12, 0.12].map((x) => ({ geo: G.glint, p: [x + 0.015, 0.022, 0.03] as [number, number, number], s: 1 })));
const BLUSH_GEO = bake([-0.2, 0.2].map((x) => ({ geo: G.blush, p: [x, -0.075, HEAD_R * 0.86] as [number, number, number], r: [0, x * 0.9, 0] as [number, number, number], s: 1 })));

const PETALS_GEO = bake([
  ...[0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    return { geo: GEO.sphere, p: [Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0] as [number, number, number], r: [0, 0, a] as [number, number, number], s: [0.13, 0.09, 0.04] as [number, number, number] };
  }),
  ...[0, 1, 2, 3, 4].map((i) => {
    const a = ((i + 0.5) / 5) * Math.PI * 2;
    return { geo: GEO.sphere, p: [Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0.015] as [number, number, number], r: [0, 0, a] as [number, number, number], s: [0.08, 0.06, 0.03] as [number, number, number] };
  }),
]);
const CROWN_GEO = bake([
  { geo: GEO.cyl, p: [0, 0.06, 0], s: [0.52, 0.14, 0.52] },
  ...[0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    return { geo: GEO.cone, p: [Math.sin(a) * 0.23, 0.2, Math.cos(a) * 0.23] as [number, number, number], s: [0.1, 0.16, 0.1] as [number, number, number] };
  }),
]);
// The sunhat and beret are several pieces in two materials each; baked, each hat is two draws.
const STRAW_GEO = bake([
  { geo: GEO.cone, p: [0, -0.01, 0], s: [1.42, 0.1, 1.42] }, // a shallow cone: the brim droops toward its edge
  { geo: G.hatCrown, p: [0, 0, 0], s: [1, 0.82, 1] },
]);
const STRAW_TRIM_GEO = bake([
  { geo: arcGeo(0.445, 0.028, Math.PI * 2), p: [0, 0.06, 0], r: [Math.PI / 2, 0, 0], s: 1 }, // ribbon band
  { geo: GEO.box, p: [0.28, 0.07, -0.35], r: [0, 0.7, 0], s: [0.17, 0.08, 0.05] }, // its bow at the back
]);
const BERET_GEO = bake([
  { geo: GEO.sphere, p: [0.02, 0.06, 0], s: [1.0, 0.42, 0.98] },
  { geo: GEO.sphere, p: [0.12, 0.12, -0.03], s: [0.76, 0.34, 0.72] }, // the plush overhang, slumped to one side
  { geo: GEO.cyl, p: [0.08, 0.3, -0.02], s: [0.04, 0.09, 0.04] }, // the stalk
]);
const GEMS_GEO = bake(
  [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    return { geo: GEO.sphereLow, p: [Math.sin(a) * 0.265, 0.06, Math.cos(a) * 0.265] as [number, number, number], s: 0.05 };
  })
);

// Each hairstyle is ONE smooth sculpted mesh. A dense sphere round the head is pushed out where
// the style has hair and tucked inside the skull where it doesn't, with soft falloffs, so every
// cut is a single clean surface: a swept fringe with gentle points instead of a row of beads,
// soft spikes instead of cones, a rounded bob instead of stacked balls. Two variants each: the
// full cut, and what still shows under a beanie or top hat.

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface HairShape {
  /** Lowest point of the hair at the front (fringe), at the sides and at the back, in unit-sphere y. */
  front: (ux: number) => number;
  side: number;
  back: number;
  /** Extra radius (fraction) at this direction: volume, flicks, spikes. */
  puff: (ux: number, uy: number, uz: number) => number;
}

// A side-swept fringe with three soft points, clear of the eyes (they sit at y 0..0.14).
const FRINGE = (ux: number) => 0.3 - ux * 0.1 + Math.abs(Math.sin(ux * 7.5)) * 0.06;

const HAIR_SHAPES: Record<HairStyle, HairShape> = {
  // short and tidy: tapers to the ears and the nape
  cap: { front: FRINGE, side: -0.05, back: -0.42, puff: (_x, uy) => 0.03 * smooth(0, 0.8, uy) },
  // rounded bob: full at the cheeks and back, curling in at the jaw
  bob: {
    front: FRINGE,
    side: -0.72,
    back: -0.78,
    puff: (_x, uy, uz) => 0.16 * Math.exp(-((uy + 0.38) ** 2) / 0.09) * (1 - smooth(0.15, 0.6, uz)) + 0.03,
  },
  // tidy top gathered back into a bun (the bun itself is added below): soft tapered ridges
  // sweep round the head toward it, so it reads as pulled-back hair rather than a swim cap
  bun: {
    front: FRINGE,
    side: -0.12,
    back: -0.5,
    puff: (ux, uy, uz) => {
      const toward = ux * BUN_DIR.x + uy * BUN_DIR.y + uz * BUN_DIR.z; // 1 = right at the bun
      // azimuth of this direction around the bun's axis
      const px = ux - toward * BUN_DIR.x;
      const py = uy - toward * BUN_DIR.y;
      const pz = uz - toward * BUN_DIR.z;
      const az = Math.atan2(px, py * BUN_SIDE.y + pz * BUN_SIDE.z);
      const ridge = Math.pow(0.5 + 0.5 * Math.cos(az * 5), 2);
      return 0.02 + 0.05 * ridge * smooth(-0.25, 0.25, toward);
    },
  },
  // twin buns: the tidy bun cap, but gathered out to each side (the buns themselves are added below)
  buns: {
    front: FRINGE,
    side: -0.12,
    back: -0.5,
    puff: (ux, uy) => 0.02 + 0.05 * smooth(0.3, 0.9, Math.abs(ux)) * smooth(-0.1, 0.5, uy),
  },
  // lively anime spikes: a dozen separate clusters across the crown and temples, each its own
  // soft point, instead of ridges that all converge at the top of the head
  spiky: {
    front: (ux) => 0.24 + Math.abs(Math.sin(ux * 9)) * 0.1,
    side: -0.05,
    back: -0.4,
    puff: (ux, uy, uz) => {
      // each spike is a narrow lobe (half its height ~9 degrees off its axis), so neighbours
      // stay separate points instead of merging into one puff
      let p = 0.03;
      for (const [sx, sy, sz, amp] of SPIKES) {
        const d = ux * sx + uy * sy + uz * sz;
        if (d > 0.5) p += amp * Math.pow(d, 44);
      }
      return p;
    },
  },
  // long: the cut stops at the ears and cheeks (they show), flares at the temples, and the
  // bulk drapes back and down over the shoulders (the fall below the head is added below)
  long: {
    front: FRINGE,
    side: -0.12,
    back: -0.95,
    puff: (ux, uy, uz) => {
      const backness = smooth(0.2, -0.5, uz);
      const low = smooth(0.1, -0.7, uy);
      const temple = smooth(0.55, 0.95, Math.abs(ux)) * smooth(0.3, -0.1, uy);
      return 0.05 + 0.14 * low * backness + 0.05 * temple + 0.03 * smooth(0, 0.8, uy);
    },
  },
};

/** Where the bun sits (a unit direction from the head centre) and a side axis round it. */
const BUN_DIR = new THREE.Vector3(0, 0.64, -0.77).normalize();
const BUN_SIDE = new THREE.Vector3(0, BUN_DIR.z, -BUN_DIR.y);
/** Spike directions [x, y, z, amplitude]: crown swept back, sides, front-up, temples, back. */
const SPIKES: [number, number, number, number][] = (
  [
    [0, 1, -0.3, 0.7],
    [0.6, 0.85, -0.15, 0.6],
    [-0.6, 0.85, -0.15, 0.6],
    [0.3, 0.85, 0.6, 0.5],
    [-0.3, 0.85, 0.6, 0.5],
    [0.95, 0.45, 0.3, 0.42],
    [-0.95, 0.45, 0.3, 0.42],
    [0.5, 0.6, -0.8, 0.55],
    [-0.5, 0.6, -0.8, 0.55],
    [0, 0.55, -0.95, 0.5],
  ] as [number, number, number, number][]
).map(([x, y, z, a]) => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n, a];
});

function sculptHair(shape: HairShape, capAbove = Infinity): THREE.BufferGeometry {
  const R = HEAD_R + 0.05;
  const inside = HEAD_R * 0.82;
  const g = new THREE.SphereGeometry(1, 44, 30);
  g.deleteAttribute("uv");
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const { x: ux, y: uy, z: uz } = v;
    // where the hairline sits in this direction: fringe in front, sides, then back
    const frontness = smooth(0.35, 0.85, uz);
    const backness = smooth(0.1, -0.6, uz);
    const edge = shape.side + (shape.front(ux) - shape.side) * frontness + (shape.back - shape.side) * backness;
    let cover = smooth(edge - 0.05, edge + 0.03, uy);
    if (uy > capAbove) cover = 0; // under a hat: only what hangs below it
    const r = inside + (R * (1 + shape.puff(ux, uy, uz)) - inside) * cover;
    pos.setXYZ(i, ux * r, uy * r, uz * r);
  }
  const merged = mergeVertices(g);
  merged.computeVertexNormals();
  return merged;
}

const HAIR_OFFSET: [number, number, number] = [0, 0.02, -0.02];
const HAIR_GEO = Object.fromEntries(
  (Object.keys(HAIR_SHAPES) as HairStyle[]).map((style) => {
    const extras: Part[] = [];
    if (style === "bun") extras.push({ geo: GEO.sphere, p: [0, 0.31, -0.38], s: 0.31 });
    if (style === "buns") {
      extras.push({ geo: GEO.sphere, p: [0.4, 0.3, -0.12], s: 0.27 });
      extras.push({ geo: GEO.sphere, p: [-0.4, 0.3, -0.12], s: 0.27 });
    }
    if (style === "long") {
      // the bulk over the shoulders at the back, and a lock in front of each ear flaring out
      extras.push({ geo: GEO.sphere, p: [0, -0.36, -0.2], s: [0.64, 0.72, 0.32] });
      extras.push({ geo: GEO.sphere, p: [0.31, -0.28, 0.1], s: [0.17, 0.56, 0.2], r: [0, 0, -0.12] });
      extras.push({ geo: GEO.sphere, p: [-0.31, -0.28, 0.1], s: [0.17, 0.56, 0.2], r: [0, 0, 0.12] });
    }
    const shell = { geo: sculptHair(HAIR_SHAPES[style]), p: HAIR_OFFSET, s: 1 };
    const under = { geo: sculptHair(HAIR_SHAPES[style], 0.12), p: HAIR_OFFSET, s: 1 };
    const keepUnderHat = extras.filter((e) => e.p[1] < 0);
    return [style, { full: bake([shell, ...extras]), underHat: bake([under, ...keepUnderHat]) }];
  })
) as Record<HairStyle, { full: THREE.BufferGeometry; underHat: THREE.BufferGeometry | null }>;

function Hair({ style, mat, hidden }: { style: HairStyle; mat: THREE.Material; hidden: boolean }) {
  const geo = hidden ? HAIR_GEO[style].underHat : HAIR_GEO[style].full;
  return (
    <group>
      {geo && <mesh castShadow geometry={geo} material={mat} raycast={noRaycast} />}
      {style === "bun" && !hidden && (
        <mesh geometry={GEO.torus} material={M.ribbon} position={[0, 0.24, -0.3]} rotation={[-2.45, 0, 0]} scale={[0.27, 0.27, 0.6]} raycast={noRaycast} />
      )}
      {style === "buns" &&
        !hidden &&
        [-1, 1].map((s) => <mesh key={s} geometry={GEO.torus} material={M.ribbon} position={[s * 0.36, 0.22, -0.1]} rotation={[0, s * 1.2, 0]} scale={[0.24, 0.24, 0.6]} raycast={noRaycast} />)}
    </group>
  );
}

// --- Headwear -----------------------------------------------------------------------------------
// Sized to sit on the hair shell (HEAD_R + 0.07), not on the bare skull.

const HAT_TOP = HEAD_R + 0.06;
/** The brow line: eyes sit at y 0, so a brim resting here shades them without covering them. */
const HAT_BROW = 0.12;

function HeadAccessory({ kind }: { kind: Accessory }) {
  switch (kind) {
    case "beret":
      // a plush dome with real volume, slumped to one side the way a beret drapes, with a
      // band round the head and the little stalk on top
      return (
        <group position={[0.08, HAT_TOP - 0.11, -0.04]} rotation={[-0.16, 0.1, -0.5]}>
          <mesh geometry={BERET_GEO} material={M.beret} raycast={noRaycast} />
          <mesh geometry={arcGeo(0.39, 0.035, Math.PI * 2)} material={M.beretBand} position={[0, -0.06, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} />
        </group>
      );
    case "beanie":
      // knit shell down to the brow, a folded cuff, and a pom-pom
      return (
        <group position={[0, 0.03, -0.02]} rotation={[-0.22, 0, 0]}>
          <mesh geometry={G.beanieShell} material={M.beanie} raycast={noRaycast} />
          <mesh geometry={arcGeo(HEAD_R + 0.1, 0.07, Math.PI * 2)} material={M.beanieBand} position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} />
          <mesh geometry={GEO.sphereLow} material={M.pom} position={[0, HEAD_R + 0.15, 0]} scale={0.18} raycast={noRaycast} />
        </group>
      );
    case "flower":
      // a real five-petal bloom, two layers deep, tucked above the ear
      return (
        <group position={[HEAD_R + 0.04, 0.16, 0.08]} rotation={[0, 1.25, 0.25]}>
          <mesh geometry={PETALS_GEO} material={M.petal} raycast={noRaycast} />
          <mesh geometry={GEO.sphere} material={M.petalCenter} position={[0, 0, 0.03]} scale={[0.07, 0.07, 0.04]} raycast={noRaycast} />
        </group>
      );
    case "headphones":
      // a headband over the crown and a cup with a cushion over each ear
      return (
        <group>
          <mesh geometry={arcGeo(HEAD_R + 0.1, 0.035, Math.PI)} material={M.headphone} position={[0, 0.0, -0.02]} raycast={noRaycast} />
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (HEAD_R + 0.1), -0.02, -0.02]}>
              <mesh geometry={GEO.cyl} material={M.headphone} rotation={[0, 0, Math.PI / 2]} scale={[0.24, 0.09, 0.24]} raycast={noRaycast} />
              <mesh geometry={GEO.cyl} material={M.headphonePad} position={[-side * 0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.2, 0.04, 0.2]} raycast={noRaycast} />
            </group>
          ))}
        </group>
      );
    case "straw":
      // worn properly: the brim rests on the brow (the hair above it is hidden, like under a
      // beanie), a full crown dome covers the head, a woven contour line runs round the crown,
      // and a ribbon band with a bow at the back
      return (
        <group position={[0, HAT_BROW, -0.03]} rotation={[-0.12, 0, 0.05]}>
          <mesh geometry={STRAW_GEO} material={M.straw} raycast={noRaycast} />
          <mesh geometry={arcGeo(0.385, 0.012, Math.PI * 2)} material={M.strawDark} position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} />
          <mesh geometry={STRAW_TRIM_GEO} material={M.ribbon} raycast={noRaycast} />
        </group>
      );
    case "tophat":
      return (
        <group position={[0, HAT_TOP - 0.08, -0.02]} rotation={[-0.12, 0, -0.06]}>
          <mesh geometry={GEO.cyl} material={M.topHat} scale={[0.95, 0.03, 0.95]} raycast={noRaycast} />
          <mesh geometry={GEO.cyl} material={M.topHat} position={[0, 0.3, 0]} scale={[0.6, 0.58, 0.6]} raycast={noRaycast} />
          <mesh geometry={GEO.cyl} material={M.ribbon} position={[0, 0.08, 0]} scale={[0.62, 0.08, 0.62]} raycast={noRaycast} />
        </group>
      );
    case "bunny":
      return (
        <group position={[0, HAT_TOP, -0.04]}>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.14, 0.2, 0]} rotation={[-0.1, 0, -s * 0.2]}>
              <mesh geometry={GEO.sphere} material={M.bunny} scale={[0.14, 0.5, 0.08]} raycast={noRaycast} />
              <mesh geometry={GEO.sphere} material={M.bunnyInner} position={[0, 0, 0.03]} scale={[0.08, 0.38, 0.03]} raycast={noRaycast} />
            </group>
          ))}
          <mesh geometry={arcGeo(HEAD_R + 0.08, 0.025, Math.PI)} material={M.bunnyInner} position={[0, -HAT_TOP + 0.02, 0.02]} raycast={noRaycast} />
        </group>
      );
    case "crown":
      return (
        <group position={[0, HAT_TOP - 0.02, -0.02]} rotation={[-0.1, 0, 0.1]}>
          <mesh geometry={CROWN_GEO} material={M.crown} raycast={noRaycast} />
          <mesh geometry={GEMS_GEO} material={M.gem} raycast={noRaycast} />
        </group>
      );
    case "mochiears":
      // Mochi's own ears: orange cones with pink insides on a thin band
      return (
        <group position={[0, HAT_TOP - 0.06, -0.04]}>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.24, 0.12, 0]} rotation={[0, 0, -s * 0.35]}>
              <mesh geometry={GEO.cone} material={M.mochiFur} scale={[0.2, 0.26, 0.16]} raycast={noRaycast} />
              <mesh geometry={GEO.cone} material={M.bunnyInner} position={[0, -0.02, 0.05]} scale={[0.11, 0.16, 0.06]} raycast={noRaycast} />
            </group>
          ))}
          <mesh geometry={arcGeo(HEAD_R + 0.08, 0.025, Math.PI)} material={M.mochiFur} position={[0, 0.02, 0.02]} raycast={noRaycast} />
        </group>
      );
    default:
      return null;
  }
}

// --- Outfit details -----------------------------------------------------------------------------
// The few shapes that make each outfit read at a glance. All static, all shared materials.

function sleeveMaterial(spec: OutfitSpec, accent: THREE.Material): THREE.Material {
  if (spec.sleeves === undefined) return spec.torso ?? accent;
  return spec.sleeves ?? accent;
}

function OutfitDetails({ outfit, accent }: { outfit: OutfitId; accent: THREE.Material }) {
  switch (outfit) {
    case "outfit_starter_hoodie":
      // a hood slumped at the back of the neck, a kangaroo pocket and drawstrings
      return (
        <group>
          <mesh geometry={GEO.sphere} material={accent} position={[0, 0.74, -0.16]} scale={[0.34, 0.16, 0.2]} raycast={noRaycast} />
          <mesh geometry={GEO.box} material={OUTFIT_M.sweats} position={[0, 0.4, 0.2]} scale={[0.26, 0.1, 0.04]} raycast={noRaycast} />
          {[-0.05, 0.05].map((x) => (
            <mesh key={x} geometry={GEO.cyl} material={OUTFIT_M.towel} position={[x, 0.62, 0.23]} scale={[0.012, 0.16, 0.012]} raycast={noRaycast} />
          ))}
        </group>
      );
    case "outfit_starter_overalls":
      // a denim bib with two straps over the shoulders and a pocket
      return (
        <group>
          <mesh geometry={GEO.box} material={OUTFIT_M.denim} position={[0, 0.5, 0.21]} scale={[0.26, 0.24, 0.05]} raycast={noRaycast} />
          <mesh geometry={GEO.box} material={OUTFIT_M.denimDark} position={[0, 0.48, 0.24]} scale={[0.14, 0.1, 0.01]} raycast={noRaycast} />
          {[-0.09, 0.09].map((x) => (
            <mesh key={x} geometry={GEO.box} material={OUTFIT_M.denim} position={[x, 0.66, 0.1]} rotation={[0.5, 0, 0]} scale={[0.05, 0.28, 0.03]} raycast={noRaycast} />
          ))}
          <mesh geometry={GEO.sphere} material={OUTFIT_M.denim} position={[0, 0.32, 0]} scale={[0.24, 0.12, 0.22]} raycast={noRaycast} />
        </group>
      );
    case "outfit_flannel_vest":
      // a checked shirt (the torso) under a puffer vest in the player's colour
      return (
        <group>
          <mesh geometry={GEO.sphere} material={accent} position={[0, 0.5, 0]} scale={[0.23, 0.25, 0.2]} raycast={noRaycast} />
          <mesh geometry={GEO.box} material={OUTFIT_M.flannelLine} position={[0, 0.5, 0.21]} scale={[0.02, 0.3, 0.01]} raycast={noRaycast} />
          {[0.44, 0.56].map((y) => (
            <mesh key={y} geometry={GEO.box} material={OUTFIT_M.flannelLine} position={[0, y, 0.21]} scale={[0.3, 0.012, 0.01]} raycast={noRaycast} />
          ))}
        </group>
      );
    case "outfit_hawaiian":
      // an open floral shirt: hibiscus dots over the accent, and a lei
      return (
        <group>
          {[
            [0.12, 0.56, 0.2],
            [-0.14, 0.46, 0.19],
            [0.04, 0.38, 0.22],
            [-0.06, 0.6, 0.2],
            [0.18, 0.42, 0.14],
          ].map(([x, y, z], i) => (
            <mesh key={i} geometry={GEO.sphereLow} material={OUTFIT_M.hibiscus} position={[x, y, z]} scale={0.045} raycast={noRaycast} />
          ))}
          <mesh geometry={GEO.torus} material={OUTFIT_M.hibiscus} position={[0, 0.66, 0.06]} rotation={[Math.PI / 2 + 0.4, 0, 0]} scale={[0.46, 0.46, 0.7]} raycast={noRaycast} />
        </group>
      );
    case "outfit_tuxedo":
      // a white shirt front, satin lapels in the accent, and a bow tie
      return (
        <group>
          <mesh geometry={GEO.box} material={OUTFIT_M.tuxShirt} position={[0, 0.54, 0.215]} scale={[0.12, 0.28, 0.02]} raycast={noRaycast} />
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={GEO.box} material={accent} position={[s * 0.1, 0.56, 0.21]} rotation={[0, 0, s * 0.35]} scale={[0.06, 0.26, 0.02]} raycast={noRaycast} />
          ))}
          <mesh geometry={GEO.box} material={OUTFIT_M.bowTie} position={[0, 0.7, 0.2]} scale={[0.14, 0.05, 0.03]} raycast={noRaycast} />
          <mesh geometry={GEO.sphereLow} material={OUTFIT_M.bowTie} position={[0, 0.7, 0.21]} scale={0.035} raycast={noRaycast} />
        </group>
      );
    case "outfit_boxing":
      // a satin robe in the accent (the torso), gold trim and a waistband over white shorts
      return (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={GEO.box} material={OUTFIT_M.robeTrim} position={[s * 0.08, 0.5, 0.215]} rotation={[0, 0, s * 0.2]} scale={[0.035, 0.36, 0.015]} raycast={noRaycast} />
          ))}
          <mesh geometry={GEO.torus} material={OUTFIT_M.robeTrim} position={[0, 0.33, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.42, 0.42, 0.5]} raycast={noRaycast} />
        </group>
      );
    case "outfit_yukata":
      // crossed indigo lapels edged in the accent, and a wide obi sash
      return (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={GEO.box} material={accent} position={[s * 0.07, 0.56, 0.215]} rotation={[0, 0, s * 0.55]} scale={[0.04, 0.3, 0.015]} raycast={noRaycast} />
          ))}
          <mesh geometry={GEO.torus} material={OUTFIT_M.obi} position={[0, 0.36, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.44, 0.44, 0.9]} raycast={noRaycast} />
          <mesh geometry={GEO.box} material={OUTFIT_M.obi} position={[0, 0.36, -0.24]} scale={[0.16, 0.1, 0.06]} raycast={noRaycast} />
        </group>
      );
    case "outfit_cyber":
      // a dark jumpsuit with neon piping in the accent and a glowing chest core
      return (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={GEO.box} material={OUTFIT_M.neon} position={[s * 0.12, 0.5, 0.2]} rotation={[0, 0, s * 0.1]} scale={[0.02, 0.36, 0.015]} raycast={noRaycast} />
          ))}
          <mesh geometry={GEO.sphereLow} material={OUTFIT_M.neonPink} position={[0, 0.56, 0.22]} scale={0.05} raycast={noRaycast} />
          <mesh geometry={GEO.torus} material={OUTFIT_M.neon} position={[0, 0.33, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.4, 0.4, 0.4]} raycast={noRaycast} />
          {[-LEG_X, LEG_X].map((x) => (
            <mesh key={x} geometry={GEO.box} material={OUTFIT_M.neonPink} position={[x, 0.14, 0.085]} scale={[0.02, 0.12, 0.01]} raycast={noRaycast} />
          ))}
        </group>
      );
    default:
      return null;
  }
}

/** A big red glove over the hand, with a white cuff. */
function BoxingGlove() {
  return (
    <group position={[0, -ARM_TOTAL - 0.02, 0.01]}>
      <mesh geometry={GEO.sphere} material={OUTFIT_M.glove} scale={[0.15, 0.14, 0.16]} raycast={noRaycast} />
      <mesh geometry={GEO.sphere} material={OUTFIT_M.glove} position={[0.06, 0.03, 0.06]} scale={[0.07, 0.06, 0.07]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={OUTFIT_M.gloveCuff} position={[0, 0.1, 0]} scale={[0.15, 0.06, 0.15]} raycast={noRaycast} />
    </group>
  );
}

/** A folded towel balanced on the head, the onsen way. */
function HeadTowel() {
  return (
    <group position={[0, HEAD_R + 0.02, -0.02]} rotation={[0, 0.15, 0.05]}>
      <mesh geometry={GEO.box} material={OUTFIT_M.towel} position={[0, 0.04, 0]} scale={[0.5, 0.09, 0.34]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={OUTFIT_M.towel} position={[0, 0.11, 0]} scale={[0.36, 0.06, 0.26]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={OUTFIT_M.towelStripe} position={[0, 0.045, 0]} scale={[0.505, 0.025, 0.345]} raycast={noRaycast} />
    </group>
  );
}
