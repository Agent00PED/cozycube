import { forwardRef, memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, Text } from "@react-three/drei";
import * as THREE from "three";
import { TOAST_MAX, accessoryFor, hashString, type Accessory, type HeldItem, type PlayerAction, type SitPose } from "@shared/types";
import { GEO, arcGeo, noRaycast, ringGeo } from "../scene/kit";

export type CharacterPose = "stand" | SitPose;

export interface FloatingEmote {
  id: number;
  emoji: string;
}

interface Character3DProps {
  /** Discord user id — picks the head accessory, skin tone and hair colour deterministically. */
  userId: string;
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
}

// --- Proportions -------------------------------------------------------------------------
// A chibi: the head is almost as big as the body, limbs are stubby, and everything is round.
// Authored directly in world units with the soles on y = 0, so seats and floors line up
// without any extra scaling. Total height is ~1.42 including the head.
const LEG_RADIUS = 0.085;
const LEG_LENGTH = 0.1;
const HIP_Y = LEG_LENGTH + LEG_RADIUS * 2; // 0.27 — top of the leg capsule
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

// Identity palettes, picked by hashing the user id.
const SKIN_TONES = ["#f6d7c3", "#eec1a0", "#d9a47c", "#b67c56", "#8a5a3c", "#f2cfb0"];
const HAIR_TONES = ["#3b2a20", "#6b4430", "#1f1c1c", "#c98e4f", "#8c3d2e", "#e5d3a6", "#4a3a5c"];

// Shared geometry: every avatar uses the same few shapes, created once for the app's lifetime.
const G = {
  leg: new THREE.CapsuleGeometry(LEG_RADIUS, LEG_LENGTH, 4, 10),
  arm: new THREE.CapsuleGeometry(ARM_RADIUS, ARM_LENGTH, 4, 10),
  body: new THREE.SphereGeometry(1, 18, 14),
  head: new THREE.SphereGeometry(HEAD_R, 24, 18),
  // hair: the top part of a slightly larger sphere, so it sits on the skull like a cap
  hair: new THREE.SphereGeometry(HEAD_R * 1.05, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.46),
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
    ({ userId, color, username, pose, speedRef, holding, action, actionProgress, toast, speaking, emotes }, ref) => {
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
      const auraRef = useRef<THREE.Mesh>(null);
      const aura2Ref = useRef<THREE.Mesh>(null);
      const targetColor = useRef(new THREE.Color(color));
      const walkPhaseRef = useRef(0);
      const blinkRef = useRef({ next: 2 + Math.random() * 3, t: 0 });
      // every avatar breathes and glances round on its own clock, so a crowd never moves in unison
      const idleSeed = useMemo(() => (hashString(userId || username) % 1000) / 100, [userId, username]);

      const identity = useMemo(() => {
        const h = hashString(userId || username);
        return {
          accessory: accessoryFor(userId || username) as Accessory,
          skin: skinMaterial(SKIN_TONES[h % SKIN_TONES.length]),
          hair: hairMaterial(HAIR_TONES[(h >>> 4) % HAIR_TONES.length]),
        };
      }, [userId, username]);

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
      useEffect(
        () => () => {
          clothes.dispose();
          marshmallowMat.dispose();
          auraMat.dispose();
        },
        [clothes, marshmallowMat, auraMat]
      );
      useEffect(() => {
        targetColor.current.set(color);
      }, [color]);

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
        const fishing = action === "fish";

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
        if (roasting) leftArm = rightArm = ROAST_ARM;
        if (fishing) rightArm = FISH_ARM + Math.sin(t * 1.1) * 0.04;
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
          const lying = pose === "lie";
          const bob = walking ? Math.abs(Math.sin(phase)) * BOB_HEIGHT : 0;
          body.position.y = L(body.position.y, lying ? LIE_LIFT : bob, lerp);
          body.rotation.x = L(body.rotation.x, lying ? LIE_ROLL : walking ? 0.06 * speed : 0, lerp);
          body.rotation.z = L(body.rotation.z, walking ? Math.sin(phase) * WADDLE_ROLL : 0, lerp);
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
          head.rotation.z = L(head.rotation.z, walking ? -Math.sin(phase) * 0.06 : 0, 0.2);
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
          eyesRef.current.scale.y = Math.max(0.1, open);
        }

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
                <mesh castShadow geometry={G.leg} material={clothes} position={[0, -HIP_Y / 2, 0]} raycast={noRaycast} />
                <mesh castShadow geometry={G.foot} material={M.shoe} position={[0, -HIP_Y + 0.045, 0.035]} scale={[0.1, 0.06, 0.13]} raycast={noRaycast} />
              </group>
            ))}

            {/* a round, slightly pear-shaped body */}
            <mesh ref={torsoRef} castShadow receiveShadow geometry={G.body} material={clothes} position={[0, BODY_Y, 0]} scale={[BODY_R, BODY_R * 1.06, BODY_R * 0.92]} raycast={noRaycast} />

            {/* arms pivot at the shoulder */}
            <group ref={leftArmRef} position={[-SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, -0.35]}>
              <mesh castShadow geometry={G.arm} material={clothes} position={[0, -ARM_TOTAL / 2, 0]} raycast={noRaycast} />
              <mesh geometry={G.hand} material={identity.skin} position={[0, -ARM_TOTAL, 0]} raycast={noRaycast} />
            </group>
            <group ref={rightArmRef} position={[SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, 0.35]}>
              <mesh castShadow geometry={G.arm} material={clothes} position={[0, -ARM_TOTAL / 2, 0]} raycast={noRaycast} />
              <mesh geometry={G.hand} material={identity.skin} position={[0, -ARM_TOTAL, 0]} raycast={noRaycast} />

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
              {/* hair cap, tipped back a touch so a fringe shows */}
              <mesh castShadow geometry={G.hair} material={identity.hair} position={[0, 0.03, -0.035]} rotation={[-0.32, 0, 0]} raycast={noRaycast} />
              {/* eyes (the group squashes to blink), with a glint each */}
              <group ref={eyesRef} position={[0, 0.0, HEAD_R * 0.9]}>
                {[-0.12, 0.12].map((x) => (
                  <group key={x} position={[x, 0, 0]}>
                    <mesh geometry={G.eye} material={M.eye} scale={[1, 1.25, 0.6]} raycast={noRaycast} />
                    <mesh geometry={G.glint} material={M.glint} position={[0.015, 0.022, 0.03]} raycast={noRaycast} />
                  </group>
                ))}
              </group>
              {/* blush and a small smile */}
              {[-0.2, 0.2].map((x) => (
                <mesh key={x} geometry={G.blush} material={M.blush} position={[x, -0.075, HEAD_R * 0.86]} rotation={[0, x * 0.9, 0]} raycast={noRaycast} />
              ))}
              <mesh geometry={arcGeo(0.05, 0.012, Math.PI)} material={M.mouth} position={[0, -0.075, HEAD_R * 0.96]} rotation={[0, 0, Math.PI]} raycast={noRaycast} />

              <HeadAccessory kind={identity.accessory} />
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
          {(emotes.length > 0 || speaking) && (
            <Html position={[0, NAMETAG_Y + 0.3, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
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

Character3D.displayName = "Character3D";

/** Deterministic per-user headwear. Everything sits on the head group, so it follows the head. */
function HeadAccessory({ kind }: { kind: Accessory }) {
  switch (kind) {
    case "beret":
      return (
        <group position={[0.04, HEAD_R * 0.86, -0.02]} rotation={[-0.15, 0, -0.32]}>
          <mesh castShadow geometry={GEO.cyl} material={M.beret} scale={[0.62, 0.09, 0.62]} raycast={noRaycast} />
          <mesh geometry={GEO.cyl} material={M.beret} position={[0, 0.07, 0]} scale={[0.04, 0.07, 0.04]} raycast={noRaycast} />
        </group>
      );
    case "beanie":
      return (
        <group position={[0, 0.07, -0.02]}>
          <mesh castShadow geometry={G.hair} material={M.beanie} scale={1.04} rotation={[-0.2, 0, 0]} raycast={noRaycast} />
          <mesh geometry={arcGeo(HEAD_R * 1.02, 0.05, Math.PI * 2)} material={M.beanieBand} position={[0, 0.03, -0.01]} rotation={[Math.PI / 2 - 0.2, 0, 0]} raycast={noRaycast} />
          <mesh castShadow geometry={GEO.sphereLow} material={M.pom} position={[0, HEAD_R + 0.05, -0.1]} scale={0.14} raycast={noRaycast} />
        </group>
      );
    case "flower":
      return (
        <group position={[HEAD_R * 0.78, 0.14, 0.12]} rotation={[0, 0.9, 0.2]}>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return <mesh key={i} geometry={GEO.sphereLow} material={M.petal} position={[Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0]} scale={[0.07, 0.07, 0.03]} raycast={noRaycast} />;
          })}
          <mesh geometry={GEO.sphereLow} material={M.petalCenter} position={[0, 0, 0.02]} scale={0.05} raycast={noRaycast} />
        </group>
      );
    case "headphones":
      return (
        <group>
          <mesh castShadow geometry={arcGeo(HEAD_R * 1.08, 0.03, Math.PI)} material={M.headphone} position={[0, 0.0, -0.02]} raycast={noRaycast} />
          {[-1, 1].map((side) => (
            <group key={side} position={[side * HEAD_R * 0.98, -0.02, -0.01]}>
              <mesh castShadow geometry={GEO.cyl} material={M.headphone} rotation={[0, 0, Math.PI / 2]} scale={[0.2, 0.08, 0.2]} raycast={noRaycast} />
              <mesh geometry={GEO.cyl} material={M.headphonePad} position={[-side * 0.045, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.16, 0.03, 0.16]} raycast={noRaycast} />
            </group>
          ))}
        </group>
      );
    default:
      return null;
  }
}
