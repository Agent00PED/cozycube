import { forwardRef, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";

interface Character3DProps {
  color: string; // "#rrggbb"
  username: string;
  sitting: boolean;
  speedRef: React.MutableRefObject<number>; // 0 = stationary, 1 = walking — drives the wobble/bob
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

// --- Seated pose ---
const SIT_LEG_ROTATION = -Math.PI / 2; // thighs forward, horizontal
const SIT_ARM_ROTATION = -0.75; // hands resting toward the lap
const SIT_POSE_LERP = 0.18;

// Organic "clay doll" figure. Every limb is a capsule (rounded caps, no hard-cut cylinder
// ends), every joint is buried inside the neighbouring mass (shoulder spheres swallow the arm
// tops, the torso capsule swallows the leg tops) so nothing reads as a separate floating part.
// All of it shares ONE material instance, so a single color lerp tints the whole body and the
// figure costs one material regardless of part count.
//
// Visual body only — the parent (LocalPlayerAvatar / RemotePlayerAvatar in WorldScene) owns the
// forwarded outer group and drives its logical (x, z) position every frame.
export const Character3D = forwardRef<THREE.Group, Character3DProps>(
  ({ color, username, sitting, speedRef }, ref) => {
    const bodyRef = useRef<THREE.Group>(null);
    const leftArmRef = useRef<THREE.Group>(null);
    const rightArmRef = useRef<THREE.Group>(null);
    const leftLegRef = useRef<THREE.Group>(null);
    const rightLegRef = useRef<THREE.Group>(null);
    const targetColor = useRef(new THREE.Color(color));
    const walkPhaseRef = useRef(0);

    const material = useMemo(
      () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
        Object.values(geometries).forEach((g) => g.dispose());
      },
      [material, geometries]
    );

    useEffect(() => {
      targetColor.current.set(color);
    }, [color]);

    useFrame((_, delta) => {
      material.color.lerp(targetColor.current, COLOR_LERP_FACTOR);

      const walking = speedRef.current > 0.01 && !sitting;
      if (walking) walkPhaseRef.current += delta * WALK_CYCLE_SPEED;

      const phase = walkPhaseRef.current;
      // Arms and legs swing in opposition (left arm forward with right leg), the way a real
      // gait works — that contralateral pairing is most of what sells it as walking.
      const swing = walking ? Math.sin(phase) : 0;

      // Seated pose and walk cycle share the same joints, so they resolve into one target per
      // limb and a single lerp gets a smooth stand<->sit transition for free.
      const armTarget = sitting ? SIT_ARM_ROTATION : swing * ARM_SWING;
      const armTargetOpposite = sitting ? SIT_ARM_ROTATION : -swing * ARM_SWING;
      const legTarget = sitting ? SIT_LEG_ROTATION : -swing * LEG_SWING;
      const legTargetOpposite = sitting ? SIT_LEG_ROTATION : swing * LEG_SWING;
      const poseLerp = sitting ? SIT_POSE_LERP : LIMB_LERP;

      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, armTarget, poseLerp);
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x,
          armTargetOpposite,
          poseLerp
        );
      }
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, legTarget, poseLerp);
        rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
          rightLegRef.current.rotation.x,
          legTargetOpposite,
          poseLerp
        );
      }

      if (bodyRef.current) {
        const bob = walking ? Math.abs(Math.sin(phase)) * BOB_HEIGHT : 0;
        const tilt = walking ? Math.sin(phase) * WOBBLE_TILT : 0;
        bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, bob, poseLerp);
        bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, tilt, poseLerp);
      }
    });

    return (
      <group ref={ref}>
        {/* Uniform scale keeps the soles pinned to y=0 and never distorts the nametag, which
            lives outside this group. Sitting is a real limb pose now, not a vertical squash. */}
        <group ref={bodyRef} scale={BODY_SCALE}>
          {/* --- legs: pivot at the hip so the whole leg swings from the body --- */}
          <group ref={leftLegRef} position={[-LEG_OFFSET_X, HIP_Y, 0]}>
            <mesh
              castShadow
              receiveShadow
              position={[0, -LEG_TOTAL / 2, 0]}
              geometry={geometries.leg}
              material={material}
            />
          </group>
          <group ref={rightLegRef} position={[LEG_OFFSET_X, HIP_Y, 0]}>
            <mesh
              castShadow
              receiveShadow
              position={[0, -LEG_TOTAL / 2, 0]}
              geometry={geometries.leg}
              material={material}
            />
          </group>

          {/* --- torso: overlaps the leg tops so the hips read as one continuous mass --- */}
          <mesh castShadow receiveShadow position={[0, 0.72, 0]} geometry={geometries.torso} material={material} />
          {/* shoulder mass — wider than the waist, and deep enough to swallow both arm tops */}
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
            <mesh
              castShadow
              receiveShadow
              position={[0, -ARM_TOTAL / 2, 0]}
              geometry={geometries.arm}
              material={material}
            />
            <mesh castShadow position={[0, -ARM_TOTAL, 0]} geometry={geometries.hand} material={material} />
          </group>
          <group ref={rightArmRef} position={[SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, ARM_SPLAY]}>
            <mesh
              castShadow
              receiveShadow
              position={[0, -ARM_TOTAL / 2, 0]}
              geometry={geometries.arm}
              material={material}
            />
            <mesh castShadow position={[0, -ARM_TOTAL, 0]} geometry={geometries.hand} material={material} />
          </group>

          {/* --- neck + head: the neck is buried in the shoulders, leaving just enough gap for
                  the head to cast a soft contact shadow onto them --- */}
          <mesh castShadow position={[0, 1.19, 0]} geometry={geometries.neck} material={material} />
          <mesh castShadow receiveShadow position={[0, 1.5, 0]} geometry={geometries.head} material={material} />
        </group>

        {/* Billboard cancels out the character's facing rotation — without it the nametag is a
            child of the turning body and renders mirrored whenever the player walks away from
            the camera. */}
        <Billboard position={[0, NAMETAG_Y, 0]}>
          {/* `font` MUST stay set: without it, troika-three-text calls out to a CDN font resolver
              blocked by Discord's Activity iframe CSP, which silently broke rendering entirely. */}
          <Text
            scale={[1, 1, 1]}
            font="/fonts/kenpixel.ttf"
            fontSize={0.155}
            maxWidth={1.6}
            overflowWrap="break-word"
            textAlign="center"
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineColor="#000000"
            outlineWidth={0.02}
          >
            {username}
          </Text>
        </Billboard>
      </group>
    );
  }
);

Character3D.displayName = "Character3D";
