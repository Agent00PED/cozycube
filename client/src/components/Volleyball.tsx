import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BALL_HOME, BALL_RADIUS, KICK_REACH, kickBall, stepBall, type BallState } from "@shared/volleyball";
import { GEO, arcGeo, noRaycast } from "../scene/kit";
import { cameraFocus } from "../scene/cameraFocus";
import type { BallSnapshot } from "../hooks/useColyseusRoom";

const KICK_COOLDOWN_MS = 400;
const ERROR_DECAY = 10; // 1/s — how fast a disagreement with the server is smoothed away
const WHITE = new THREE.MeshStandardMaterial({ color: "#f7f3ea", roughness: 0.55 });
const CORAL = new THREE.MeshStandardMaterial({ color: "#e8705f", roughness: 0.55 });
const TEAL = new THREE.MeshStandardMaterial({ color: "#3fb7c9", roughness: 0.55 });

// The beach volleyball. The server owns the ball and patches it ~20 times a second; between
// patches this runs the SAME physics step (shared/volleyball.ts) so it flies at the full frame
// rate. When the local player walks into it, the bump is applied here immediately — no waiting
// for a round trip — and sent to the server, whose next snapshot confirms it.
export function Volleyball({
  ballRef,
  onKick,
}: {
  ballRef: React.MutableRefObject<BallSnapshot | null>;
  onKick: (dirX: number, dirZ: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const sim = useRef<BallState>({ ...BALL_HOME });
  const error = useRef({ x: 0, y: 0, z: 0 });
  const lastSnapshotAt = useRef(0);
  const lastKickAt = useRef(0);
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false }), []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const ball = sim.current;

    // Adopt each new server snapshot — but keep the visible ball where it was and let the
    // difference melt away, so a correction never shows as a jump.
    const snap = ballRef.current;
    if (snap && snap.receivedAt !== lastSnapshotAt.current) {
      lastSnapshotAt.current = snap.receivedAt;
      error.current.x += ball.x - snap.x;
      error.current.y += ball.y - snap.y;
      error.current.z += ball.z - snap.z;
      Object.assign(ball, { x: snap.x, y: snap.y, z: snap.z, vx: snap.vx, vy: snap.vy, vz: snap.vz });
    }

    // Local bump: walking into the ball while it is low enough to reach.
    const now = performance.now();
    const moving = cameraFocus.dirX !== 0 || cameraFocus.dirZ !== 0;
    const reach = Math.hypot(cameraFocus.x - ball.x, cameraFocus.z - ball.z);
    if (moving && reach < KICK_REACH && ball.y < 0.9 && now - lastKickAt.current > KICK_COOLDOWN_MS) {
      lastKickAt.current = now;
      kickBall(ball, cameraFocus.dirX, cameraFocus.dirZ);
      onKick(cameraFocus.dirX, cameraFocus.dirZ);
    }

    stepBall(ball, delta);

    const decay = Math.exp(-ERROR_DECAY * delta);
    error.current.x *= decay;
    error.current.y *= decay;
    error.current.z *= decay;

    const g = groupRef.current;
    if (g) g.position.set(ball.x + error.current.x, Math.max(BALL_RADIUS, ball.y + error.current.y), ball.z + error.current.z);
    // roll with the travel
    const spin = spinRef.current;
    if (spin) {
      spin.rotation.x += (ball.vz * delta) / BALL_RADIUS;
      spin.rotation.z -= (ball.vx * delta) / BALL_RADIUS;
    }
  });

  return (
    <group ref={groupRef} position={[BALL_HOME.x, BALL_HOME.y, BALL_HOME.z]}>
      <group ref={spinRef}>
        <mesh geometry={GEO.sphere} material={WHITE} scale={BALL_RADIUS * 2} castShadow raycast={noRaycast} />
        {/* the classic panels: two coloured bands round the ball */}
        <mesh geometry={arcGeo(BALL_RADIUS * 0.99, 0.028, Math.PI * 2)} material={CORAL} raycast={noRaycast} />
        <mesh geometry={arcGeo(BALL_RADIUS * 0.99, 0.028, Math.PI * 2)} material={TEAL} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast} />
      </group>
      {/* a soft contact shadow that stays on the sand as the ball flies */}
      <BallShadow material={shadowMat} />
    </group>
  );
}

function BallShadow({ material }: { material: THREE.Material }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    const parent = m?.parent;
    if (!m || !parent) return;
    const height = parent.position.y;
    m.position.y = -height + 0.02;
    const s = Math.max(0.15, 0.4 - height * 0.08);
    m.scale.set(s, s, 1);
  });
  return <mesh ref={ref} geometry={GEO.circle} material={material} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} />;
}
