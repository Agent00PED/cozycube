import { memo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { ChairSyncState, SeatStyle } from "@shared/types";
import { GEO, noRaycast, castsUsefulShadow } from "../scene/kit";

interface ChairPropProps {
  chair: ChairSyncState;
  onSeatClick: (chair: ChairSyncState) => void;
}

// Hit pads must stay `visible` — three.js/R3F skip invisible objects when raycasting, which is
// exactly how an earlier version silently made every seat unclickable. They're hidden by writing
// nothing to colour or depth instead.
const HIT_PAD_MATERIAL = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

const mat = (color: string, roughness = 0.75, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const M = {
  black: mat("#1a1a1e", 0.5, 0.4),
  seat: mat("#38383f", 0.6),
  seatTaken: mat("#2a2a30", 0.6),
  neon: new THREE.MeshStandardMaterial({ color: "#7a2ee6", emissive: "#7a2ee6", emissiveIntensity: 1.2 }),
  log: mat("#4a3320", 0.95),
  logTaken: mat("#3a2717", 0.95),
  logEnd: mat("#b58a5a", 0.9),
  oak: mat("#c89a5e", 0.7),
  walnut: mat("#4a2f1d", 0.8),
  brass: mat("#c9a24a", 0.35, 0.7),
  cushion: mat("#e0a93b", 0.9),
  velvet: mat("#3f6b52", 0.7),
  canvasA: mat("#f0e6d2", 0.95),
  canvasB: mat("#c4714a", 0.95),
};

// Per-style click target sizing: [width, height, depth] and its centre height.
const PAD: Record<SeatStyle, { size: [number, number, number]; y: number }> = {
  gaming: { size: [0.9, 1.3, 0.9], y: 0.6 },
  log: { size: [1.3, 0.8, 0.8], y: 0.3 },
  pad: { size: [1.1, 0.9, 1.1], y: 0.4 },
  stool: { size: [0.7, 1.1, 0.7], y: 0.5 },
  armchair: { size: [1.1, 1.2, 1.1], y: 0.55 },
  wood: { size: [0.8, 1.2, 0.8], y: 0.55 },
  deckchair: { size: [0.9, 1.0, 1.4], y: 0.45 },
  blanket: { size: [0.9, 0.4, 1.4], y: 0.1 },
};

// Seat frames and legs go through the same silhouette test as the rest of the furniture, so a
// chair contributes one or two shadow draws instead of one per strut.
const Box = ({ p, s, m, r, cast = true }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; r?: [number, number, number]; cast?: boolean }) => (
  <mesh geometry={GEO.box} material={m} position={p} scale={s} rotation={r} castShadow={cast && castsUsefulShadow(s)} receiveShadow raycast={noRaycast} />
);
const Cylinder = ({ p, s, m, r }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; r?: [number, number, number] }) => (
  <mesh geometry={GEO.cyl} material={m} position={p} scale={s} rotation={r} castShadow={castsUsefulShadow(s)} receiveShadow raycast={noRaycast} />
);

// memo: seats only change when someone sits or stands, not on every movement patch.
export const ChairProp = memo(function ChairProp({ chair, onSeatClick }: ChairPropProps) {
  const occupied = chair.occupiedBy !== "";
  const pad = PAD[chair.style] ?? PAD.pad;

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 2) return; // right-drag pans the camera
    e.stopPropagation(); // don't also register as a floor click behind the seat
    onSeatClick(chair);
  };

  return (
    <group position={[chair.x, 0, chair.z]} rotation={[0, chair.rotationY, 0]}>
      <mesh geometry={GEO.box} material={HIT_PAD_MATERIAL} position={[0, pad.y, 0]} scale={pad.size} onPointerDown={handleClick} />

      {chair.style === "gaming" && <GamingChair occupied={occupied} />}
      {chair.style === "log" && <LogSeat occupied={occupied} />}
      {chair.style === "stool" && <BarStool />}
      {chair.style === "armchair" && <Armchair />}
      {chair.style === "wood" && <WoodChair />}
      {chair.style === "deckchair" && <DeckChair />}
      {/* "pad" and "blanket" seats are drawn by the world itself (sofa, beanbags, cushions, blanket) */}
    </group>
  );
});

// All seats face local +Z; backrests therefore sit on local -Z.

function GamingChair({ occupied }: { occupied: boolean }) {
  const seat = occupied ? M.seatTaken : M.seat;
  return (
    <>
      <Cylinder p={[0, 0.04, 0]} s={[0.5, 0.05, 0.5]} m={M.black} />
      <Cylinder p={[0, 0.22, 0]} s={[0.07, 0.36, 0.07]} m={M.black} />
      <Box p={[0, 0.37, 0]} s={[0.46, 0.1, 0.46]} m={seat} />
      <Box p={[0, 0.72, -0.21]} s={[0.46, 0.62, 0.09]} m={seat} r={[-0.15, 0, 0]} />
      <Box p={[0, 0.82, -0.17]} s={[0.34, 0.04, 0.02]} m={M.neon} r={[-0.15, 0, 0]} cast={false} />
    </>
  );
}

function LogSeat({ occupied }: { occupied: boolean }) {
  // Lies across the seat (perpendicular to where the sitter faces), log ends showing the grain.
  return (
    <>
      <Cylinder p={[0, 0.21, 0]} s={[0.44, 1.2, 0.44]} r={[0, 0, Math.PI / 2]} m={occupied ? M.logTaken : M.log} />
      {[-0.6, 0.6].map((x) => (
        <Cylinder key={x} p={[x, 0.21, 0]} s={[0.4, 0.01, 0.4]} r={[0, 0, Math.PI / 2]} m={M.logEnd} />
      ))}
    </>
  );
}

function BarStool() {
  // Seat top at ~0.75 — pairs with the stool's sitY in shared/props.ts.
  return (
    <>
      {[
        [-0.16, -0.16],
        [0.16, -0.16],
        [-0.16, 0.16],
        [0.16, 0.16],
      ].map(([x, z], i) => (
        <Box key={i} p={[x * 0.9, 0.35, z * 0.9]} s={[0.04, 0.7, 0.04]} m={M.black} r={[z * 0.2, 0, -x * 0.2]} />
      ))}
      <mesh geometry={GEO.torus} material={M.brass} position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.36, 0.36, 0.5]} raycast={noRaycast} />
      <Cylinder p={[0, 0.72, 0]} s={[0.44, 0.07, 0.44]} m={M.walnut} />
      <Cylinder p={[0, 0.77, 0]} s={[0.4, 0.04, 0.4]} m={M.cushion} />
    </>
  );
}

function Armchair() {
  return (
    <>
      {[
        [-0.34, -0.3],
        [0.34, -0.3],
        [-0.34, 0.3],
        [0.34, 0.3],
      ].map(([x, z], i) => (
        <Box key={i} p={[x, 0.07, z]} s={[0.06, 0.14, 0.06]} m={M.walnut} />
      ))}
      <Box p={[0, 0.27, 0.02]} s={[0.84, 0.26, 0.78]} m={M.velvet} />
      <Box p={[0, 0.42, 0.06]} s={[0.6, 0.08, 0.64]} m={M.velvet} />
      <Box p={[0, 0.72, -0.34]} s={[0.84, 0.86, 0.16]} m={M.velvet} r={[-0.1, 0, 0]} />
      {[-0.38, 0.38].map((x) => (
        <Box key={x} p={[x, 0.5, 0.02]} s={[0.12, 0.3, 0.78]} m={M.velvet} />
      ))}
      <Box p={[0.1, 0.58, -0.2]} s={[0.36, 0.3, 0.1]} m={M.cushion} r={[-0.2, 0, 0.1]} />
    </>
  );
}

function WoodChair() {
  return (
    <>
      {[
        [-0.2, -0.2],
        [0.2, -0.2],
        [-0.2, 0.2],
        [0.2, 0.2],
      ].map(([x, z], i) => (
        <Box key={i} p={[x, 0.22, z]} s={[0.05, 0.44, 0.05]} m={M.oak} />
      ))}
      <Box p={[0, 0.46, 0]} s={[0.5, 0.05, 0.5]} m={M.oak} />
      {[-0.18, -0.06, 0.06, 0.18].map((x) => (
        <Box key={x} p={[x, 0.78, -0.22]} s={[0.035, 0.6, 0.035]} m={M.oak} />
      ))}
      <Box p={[0, 1.08, -0.22]} s={[0.5, 0.07, 0.05]} m={M.oak} />
    </>
  );
}

function DeckChair() {
  // Reclined wooden frame with a striped canvas sling.
  return (
    <>
      {[-0.3, 0.3].map((x) => (
        <group key={x}>
          <Box p={[x, 0.3, 0.05]} s={[0.05, 0.05, 1.2]} m={M.oak} r={[0.25, 0, 0]} />
          <Box p={[x, 0.45, -0.35]} s={[0.05, 0.9, 0.05]} m={M.oak} r={[-0.5, 0, 0]} />
        </group>
      ))}
      <Box p={[0, 0.32, 0.12]} s={[0.56, 0.02, 0.7]} m={M.canvasA} r={[0.25, 0, 0]} />
      <Box p={[0, 0.6, -0.32]} s={[0.56, 0.02, 0.62]} m={M.canvasB} r={[-1.05, 0, 0]} />
    </>
  );
}
