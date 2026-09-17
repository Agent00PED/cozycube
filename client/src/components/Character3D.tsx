import { forwardRef, memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, Text } from "@react-three/drei";
import * as THREE from "three";
import { TOAST_MAX, type HeldItem, type PlayerAction, type SitPose } from "@shared/types";
import { GEO, noRaycast, ringGeo } from "../scene/kit";

export type CharacterPose = "stand" | SitPose;

export interface FloatingEmote {
  id: number;
  emoji: string;
}

interface Character3DProps {
  color: string; // "#rrggbb"
  username: string;
  pose: CharacterPose;
  speedRef: React.MutableRefObject<number>; // 0 = stationary, 1 = walking — drives the gait
  holding: HeldItem;
  action: PlayerAction;
  actionProgress: number;
  toast: number;
  speaking: boolean;
  emotes: FloatingEmote[];
}

const COLOR_LERP_FACTOR = 0.15;
const WALK_CYCLE_SPEED = 7.5; // radians/sec of the walk phase while moving
const BOB_HEIGHT = 0.045;
const WOBBLE_TILT = 0.07;
const ARM_SWING = 0.45; // radians
const LEG_SWING = 0.38; // radians
const LIMB_LERP = 0.25; // eases limbs back to rest instead of snapping when the player stops

// --- Skeleton constants -----------------------------------------------------------------
// Everything is derived from these so the figure stays proportional AND, critically, so the
// soles of the feet land exactly on y = 0. LEG_TOTAL is the capsule's full height (the
// cylinder section plus both hemisphere caps), so hip - LEG_TOTAL === 0 keeps the doll
// standing on the floor plane rather than sinking into it or hovering above it.
const LEG_RADIUS = 0.1;
const LEG_LENGTH = 0.32; // cylinder section only
const LEG_TOTAL = LEG_LENGTH + LEG_RADIUS * 2; // 0.52
const HIP_Y = LEG_TOTAL; // 0.52 — pivot sits at the top of the leg capsule
const LEG_OFFSET_X = 0.115;

const ARM_RADIUS = 0.075;
const ARM_LENGTH = 0.34;
const ARM_TOTAL = ARM_LENGTH + ARM_RADIUS * 2; // 0.49
const SHOULDER_Y = 1;
const SHOULDER_X = 0.235;
const ARM_SPLAY = 0.14; // radians — arms hang with a natural outward drift, not straight down

const SHOULDER_RADIUS = 0.265;
const SHOULDER_PIVOT_Y = 1.02;

// The rig above is authored at ~1.76 units tall (head crown at 1.5 + 0.26). Scaling the whole
// body group by this factor lands it at ~1.37, which reads correctly against the furniture.
// Scaling the GROUP rather than editing each constant matters: the group's origin is the floor
// contact point, so y=0 maps to y=0 and the soles stay exactly on the floor at any scale.
const BODY_SCALE = 0.78;
const RIG_HEIGHT = 1.76;
const NAMETAG_Y = RIG_HEIGHT * BODY_SCALE + 0.18;

// --- Poses ---
const SIT_LEG_ROTATION = -Math.PI / 2; // thighs forward, horizontal
const SIT_ARM_ROTATION = -0.75; // hands resting toward the lap
const ROAST_ARM_ROTATION = -1.15; // both hands out toward the fire
const HOLD_CUP_ARM_ROTATION = -0.95; // forearm raised, cup in front of the chest
const LIE_BODY_ROTATION = -Math.PI / 2; // on your back, looking at the sky
const LIE_LIFT = 0.19; // torso radius at BODY_SCALE, so the back rests on the ground, not in it
const POSE_LERP = 0.18;

// Marshmallow doneness colours: raw -> golden -> charcoal.
const RAW = new THREE.Color("#f6f1e6");
const GOLDEN = new THREE.Color("#d9974a");
const BURNT = new THREE.Color("#2d211a");

// Shared, never-animated materials.
const GAUGE_BG = new THREE.MeshBasicMaterial({ color: "#1d1a24", transparent: true, opacity: 0.75, depthTest: false });
const GAUGE_FILL = new THREE.MeshBasicMaterial({ color: "#f4a15c", depthTest: false });
const MUG = new THREE.MeshStandardMaterial({ color: "#f7f3ea", roughness: 0.5 });
const COFFEE = new THREE.MeshStandardMaterial({ color: "#4a2c1a", roughness: 0.3 });
const STEAM = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false });
const STICK = new THREE.MeshStandardMaterial({ color: "#8a6a45", roughness: 0.9 });
const SPEAK_DOT = new THREE.MeshBasicMaterial({ color: "#43d17a", depthTest: false });

// Stick direction in the body frame: forward and a little upward.
const STICK_ANGLE = Math.atan2(1, 0.35);
const STICK_LENGTH = 1.25;

// Organic "clay doll" figure. Every limb is a capsule (rounded caps, no hard-cut cylinder
// ends), every joint is buried inside the neighbouring mass, and the whole body shares ONE
// material instance, so a single colour lerp tints everything.
//
// Visual body only — the parent (LocalPlayerAvatar / RemotePlayerAvatar in WorldScene) owns the
// forwarded outer group and drives its logical position every frame.
export const Character3D = memo(
  forwardRef<THREE.Group, Character3DProps>(
    ({ color, username, pose, speedRef, holding, action, actionProgress, toast, speaking, emotes }, ref) => {
      const bodyRef = useRef<THREE.Group>(null);
      const leftArmRef = useRef<THREE.Group>(null);
      const rightArmRef = useRef<THREE.Group>(null);
      const leftLegRef = useRef<THREE.Group>(null);
      const rightLegRef = useRef<THREE.Group>(null);
      const mugRef = useRef<THREE.Group>(null);
      const stickRef = useRef<THREE.Group>(null);
      const steamRef = useRef<THREE.Group>(null);
      const speakRingRef = useRef<THREE.Mesh>(null);
      const targetColor = useRef(new THREE.Color(color));
      const walkPhaseRef = useRef(0);

      const material = useMemo(
        () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
      );
      const marshmallowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: RAW, roughness: 0.8 }), []);
      const speakRingMat = useMemo(
        () => new THREE.MeshBasicMaterial({ color: "#43d17a", transparent: true, opacity: 0, depthTest: false }),
        []
      );

      // Capsules everywhere: rounded ends read as soft clay, and the caps double as feet/hands.
      const geometries = useMemo(
        () => ({
          leg: new THREE.CapsuleGeometry(LEG_RADIUS, LEG_LENGTH, 4, 12),
          arm: new THREE.CapsuleGeometry(ARM_RADIUS, ARM_LENGTH, 4, 12),
          torso: new THREE.CapsuleGeometry(0.24, 0.34, 5, 16),
          shoulder: new THREE.SphereGeometry(SHOULDER_RADIUS, 16, 14),
          head: new THREE.SphereGeometry(0.26, 20, 18),
          neck: new THREE.CapsuleGeometry(0.085, 0.12, 3, 10),
          hand: new THREE.SphereGeometry(0.088, 10, 8),
        }),
        []
      );

      useEffect(
        () => () => {
          material.dispose();
          marshmallowMat.dispose();
          speakRingMat.dispose();
          Object.values(geometries).forEach((g) => g.dispose());
        },
        [material, marshmallowMat, speakRingMat, geometries]
      );

      useEffect(() => {
        targetColor.current.set(color);
      }, [color]);

      useFrame(({ clock }, delta) => {
        material.color.lerp(targetColor.current, COLOR_LERP_FACTOR);

        const seated = pose !== "stand";
        const walking = speedRef.current > 0.01 && !seated;
        if (walking) walkPhaseRef.current += delta * WALK_CYCLE_SPEED;
        const phase = walkPhaseRef.current;
        // Arms and legs swing in opposition (left arm forward with right leg), the way a real
        // gait works — that contralateral pairing is most of what sells it as walking.
        const swing = walking ? Math.sin(phase) : 0;
        const roasting = holding === "marshmallow";
        const holdingCup = holding === "coffee";

        // Resolve one target per joint from pose + activity, then a single lerp toward it gives
        // smooth transitions between standing, walking, sitting, lying and holding things.
        let leftArm = swing * ARM_SWING;
        let rightArm = -swing * ARM_SWING;
        let legs: [number, number] = [-swing * LEG_SWING, swing * LEG_SWING];
        if (pose === "sit") {
          leftArm = rightArm = SIT_ARM_ROTATION;
          legs = [SIT_LEG_ROTATION, SIT_LEG_ROTATION];
        } else if (pose === "lie") {
          leftArm = rightArm = 0;
          legs = [0, 0];
        }
        if (roasting) leftArm = rightArm = ROAST_ARM_ROTATION;
        if (holdingCup && pose !== "lie") rightArm = HOLD_CUP_ARM_ROTATION + swing * 0.1;

        const lerp = seated ? POSE_LERP : LIMB_LERP;
        const L = THREE.MathUtils.lerp;
        if (leftArmRef.current) leftArmRef.current.rotation.x = L(leftArmRef.current.rotation.x, leftArm, lerp);
        if (rightArmRef.current) rightArmRef.current.rotation.x = L(rightArmRef.current.rotation.x, rightArm, lerp);
        if (leftLegRef.current) leftLegRef.current.rotation.x = L(leftLegRef.current.rotation.x, legs[0], lerp);
        if (rightLegRef.current) rightLegRef.current.rotation.x = L(rightLegRef.current.rotation.x, legs[1], lerp);

        const body = bodyRef.current;
        if (body) {
          const lying = pose === "lie";
          const bob = walking ? Math.abs(Math.sin(phase)) * BOB_HEIGHT : 0;
          body.position.y = L(body.position.y, lying ? LIE_LIFT : bob, lerp);
          body.rotation.x = L(body.rotation.x, lying ? LIE_BODY_ROTATION : 0, lerp);
          body.rotation.z = L(body.rotation.z, walking ? Math.sin(phase) * WOBBLE_TILT : 0, lerp);
        }

        // Held items live on the right hand but are counter-rotated against the arm, so a cup
        // stays upright and the stick keeps pointing at the fire whatever the arm is doing.
        const armX = rightArmRef.current?.rotation.x ?? 0;
        if (mugRef.current) {
          mugRef.current.visible = holdingCup;
          mugRef.current.rotation.x = -armX;
        }
        if (stickRef.current) {
          stickRef.current.visible = roasting;
          stickRef.current.rotation.x = -armX;
        }
        if (holdingCup && steamRef.current) {
          steamRef.current.children.forEach((puff, i) => {
            const p = (clock.elapsedTime * 0.6 + i / 3) % 1;
            puff.position.set(Math.sin(p * 5 + i) * 0.03, 0.14 + p * 0.3, 0);
            puff.scale.setScalar(0.04 + p * 0.06);
          });
        }
        if (roasting) {
          // raw -> golden over the first unit of toast, golden -> charcoal beyond it
          const t = Math.min(toast, TOAST_MAX);
          if (t <= 1) marshmallowMat.color.copy(RAW).lerp(GOLDEN, t);
          else marshmallowMat.color.copy(GOLDEN).lerp(BURNT, (t - 1) / (TOAST_MAX - 1));
        }

        // Speaking: an expanding green ripple above the nametag.
        const ring = speakRingRef.current;
        if (ring) {
          const cycle = (clock.elapsedTime * 1.6) % 1;
          ring.scale.setScalar(0.14 + cycle * 0.22);
          speakRingMat.opacity = L(speakRingMat.opacity, speaking ? (1 - cycle) * 0.9 : 0, 0.3);
          ring.visible = speakRingMat.opacity > 0.02;
        }
      });

      const gaugeVisible = action === "brew";
      const gaugeWidth = 0.7;

      return (
        <group ref={ref}>
          {/* Uniform scale keeps the soles pinned to y=0 and never distorts the nametag, which
              lives outside this group. Sitting and lying are real limb poses, not squashes. */}
          <group ref={bodyRef} scale={BODY_SCALE}>
            {/* --- legs: pivot at the hip so the whole leg swings from the body --- */}
            <group ref={leftLegRef} position={[-LEG_OFFSET_X, HIP_Y, 0]}>
              <mesh castShadow receiveShadow position={[0, -LEG_TOTAL / 2, 0]} geometry={geometries.leg} material={material} />
            </group>
            <group ref={rightLegRef} position={[LEG_OFFSET_X, HIP_Y, 0]}>
              <mesh castShadow receiveShadow position={[0, -LEG_TOTAL / 2, 0]} geometry={geometries.leg} material={material} />
            </group>

            {/* --- torso + shoulder mass that swallows both arm tops --- */}
            <mesh castShadow receiveShadow position={[0, 0.72, 0]} geometry={geometries.torso} material={material} />
            <mesh
              castShadow
              receiveShadow
              position={[0, SHOULDER_PIVOT_Y, 0]}
              scale={[1, 0.72, 0.92]}
              geometry={geometries.shoulder}
              material={material}
            />

            {/* --- arms: pivot at the shoulder, splayed outward, hanging under gravity --- */}
            <group ref={leftArmRef} position={[-SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, -ARM_SPLAY]}>
              <mesh castShadow receiveShadow position={[0, -ARM_TOTAL / 2, 0]} geometry={geometries.arm} material={material} />
              <mesh castShadow position={[0, -ARM_TOTAL, 0]} geometry={geometries.hand} material={material} />
            </group>
            <group ref={rightArmRef} position={[SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, ARM_SPLAY]}>
              <mesh castShadow receiveShadow position={[0, -ARM_TOTAL / 2, 0]} geometry={geometries.arm} material={material} />
              <mesh castShadow position={[0, -ARM_TOTAL, 0]} geometry={geometries.hand} material={material} />

              {/* coffee mug, steaming */}
              <group ref={mugRef} position={[0, -ARM_TOTAL, 0.05]} visible={false}>
                <mesh geometry={GEO.cyl} material={MUG} position={[0, 0.06, 0.1]} scale={[0.19, 0.22, 0.19]} raycast={noRaycast} />
                <mesh geometry={GEO.cyl} material={COFFEE} position={[0, 0.165, 0.1]} scale={[0.16, 0.01, 0.16]} raycast={noRaycast} />
                <mesh geometry={GEO.torus} material={MUG} position={[0.11, 0.06, 0.1]} rotation={[0, 0, Math.PI / 2]} scale={[0.07, 0.07, 0.3]} raycast={noRaycast} />
                <group ref={steamRef} position={[0, 0, 0.1]}>
                  {[0, 1, 2].map((i) => (
                    <mesh key={i} geometry={GEO.sphereLow} material={STEAM} raycast={noRaycast} />
                  ))}
                </group>
              </group>

              {/* roasting stick with a marshmallow on the end */}
              <group ref={stickRef} position={[0, -ARM_TOTAL, 0]} visible={false}>
                <group rotation={[STICK_ANGLE, 0, 0]}>
                  <mesh geometry={GEO.cyl} material={STICK} position={[0, STICK_LENGTH / 2, 0]} scale={[0.03, STICK_LENGTH, 0.03]} raycast={noRaycast} />
                  <mesh geometry={GEO.sphere} material={marshmallowMat} position={[0, STICK_LENGTH + 0.04, 0]} scale={[0.16, 0.2, 0.16]} raycast={noRaycast} />
                </group>
              </group>
            </group>

            {/* --- neck + head --- */}
            <mesh castShadow position={[0, 1.19, 0]} geometry={geometries.neck} material={material} />
            <mesh castShadow receiveShadow position={[0, 1.5, 0]} geometry={geometries.head} material={material} />
          </group>

          {/* Billboard cancels out the character's facing rotation — without it the nametag is a
              child of the turning body and renders mirrored whenever the player walks away. */}
          <Billboard position={[0, pose === "lie" ? 0.62 : NAMETAG_Y, 0]}>
            {/* `font` MUST stay set: without it, troika-three-text calls out to a CDN font resolver
                blocked by Discord's Activity iframe CSP, which silently broke rendering entirely. */}
            <Text
              font="/fonts/kenpixel.ttf"
              fontSize={0.155}
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

            <mesh ref={speakRingRef} geometry={ringGeo(0.78, 1)} material={speakRingMat} position={[0, 0.24, 0]} visible={false} raycast={noRaycast} />
            {speaking && <mesh geometry={GEO.circle} material={SPEAK_DOT} position={[0, 0.24, 0]} scale={0.1} raycast={noRaycast} />}

            {gaugeVisible && (
              <group position={[0, 0.26, 0]}>
                <mesh geometry={GEO.plane} material={GAUGE_BG} scale={[gaugeWidth + 0.04, 0.11, 1]} renderOrder={10} raycast={noRaycast} />
                <mesh
                  geometry={GEO.plane}
                  material={GAUGE_FILL}
                  position={[-gaugeWidth / 2 + (gaugeWidth * actionProgress) / 2, 0, 0.001]}
                  scale={[Math.max(0.001, gaugeWidth * actionProgress), 0.07, 1]}
                  renderOrder={11}
                  raycast={noRaycast}
                />
              </group>
            )}
          </Billboard>

          {/* Emoji need the platform's colour-emoji font, which WebGL text can't use, so they're
              DOM overlays. No distanceFactor: under an OrthographicCamera it scales runaway. */}
          {emotes.length > 0 && (
            <Html position={[0, NAMETAG_Y + 0.35, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
              <div style={{ position: "relative", width: 0, height: 0 }}>
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
