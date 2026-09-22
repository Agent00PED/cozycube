import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  ROULETTE_CENTER,
  SLOT_SYMBOLS,
  WHEEL_ORDER,
  parseBets,
  pocketColor,
  type PlayerState,
  type RouletteResultBroadcast,
  type RouletteSyncState,
  type SlotBroadcast,
  type ToggleableSyncState,
} from "@shared/types";
import { GEO, noRaycast, onHitLayer } from "../scene/kit";
import { LAYOUT } from "../scene/CasinoWorld";
import { RoomEventsContext, useRoomMessage } from "../scene/roomEvents";
import { playCoin, playConfetti, playReelTick } from "../audio/sfx";

// ---------------------------------------------------------------------------------------
// Roulette wheel: the head spins, the ball runs the other way and drops into the result
// ---------------------------------------------------------------------------------------

const WHEEL = { x: -0.75, y: 0.93, z: 0.4, r: 0.52 };
const POCKETS = WHEEL_ORDER.length;
const STEP = (Math.PI * 2) / POCKETS;
const SPIN_S = 5.6;
const BALL_REST_ANGLE = Math.PI * 0.25; // where on the rim the ball comes to rest (world angle)

const M = {
  red: new THREE.MeshStandardMaterial({ color: "#b3202e", roughness: 0.5 }),
  black: new THREE.MeshStandardMaterial({ color: "#1c1c22", roughness: 0.5 }),
  green: new THREE.MeshStandardMaterial({ color: "#1f8a4c", roughness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: "#d4a94a", roughness: 0.3, metalness: 0.8 }),
  wood: new THREE.MeshStandardMaterial({ color: "#5a3a24", roughness: 0.6 }),
  ball: new THREE.MeshStandardMaterial({ color: "#fbfbf7", roughness: 0.2 }),
  chip: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }),
  board: new THREE.MeshStandardMaterial({ color: "#3a2016", roughness: 0.6 }),
  cabinet: new THREE.MeshStandardMaterial({ color: "#7a1f2e", roughness: 0.45 }),
  chrome: new THREE.MeshStandardMaterial({ color: "#d9dde3", roughness: 0.2, metalness: 0.9 }),
  lever: new THREE.MeshStandardMaterial({ color: "#e0453a", roughness: 0.4 }),
  glassDark: new THREE.MeshStandardMaterial({ color: "#1a1418", roughness: 0.2 }),
};

const wedge = new THREE.CylinderGeometry(1, 1, 1, 2, 1, false, 0, STEP * 0.98);

/** Bakes transformed copies of shapes into one geometry, so a set costs one draw call. */
function bake(parts: { geo: THREE.BufferGeometry; p: [number, number, number]; r?: [number, number, number]; s: [number, number, number] }[]) {
  const m = new THREE.Matrix4();
  const geos = parts.map(({ geo, p, r = [0, 0, 0], s }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    g.applyMatrix4(m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
    return g;
  });
  return mergeGeometries(geos)!;
}

// All 37 pockets as three geometries (red, black, green) instead of 37 meshes.
const POCKET_GEO = (["red", "black", "green"] as const).map((col) =>
  bake(
    WHEEL_ORDER.map((n, i) => ({ n, i }))
      .filter(({ n }) => pocketColor(n) === col)
      .map(({ i }) => ({ geo: wedge, p: [0, 0.02, 0] as [number, number, number], r: [0, i * STEP + Math.PI / 2, 0] as [number, number, number], s: [WHEEL.r, 0.04, WHEEL.r] as [number, number, number] }))
  )
);

export function RouletteWheel({ roulette }: { roulette: RouletteSyncState }) {
  const headRef = useRef<THREE.Group>(null);
  const ballRef = useRef<THREE.Mesh>(null);
  // The spin plays from when THIS client saw it start, so everyone watches the same motion.
  const spinRef = useRef<{ id: number; start: number; from: number; wheelTurn: number; result: number } | null>(null);
  const idleAngle = useRef(0);

  useEffect(() => {
    if (roulette.phase !== "spinning" || roulette.result < 0) return;
    if (spinRef.current?.id === roulette.spinId) return;
    const from = idleAngle.current;
    const idx = WHEEL_ORDER.indexOf(roulette.result);
    // The head turns so that pocket idx ends up under the ball's resting angle.
    const pocketCentre = idx * STEP + STEP / 2 + Math.PI / 2;
    let delta = (BALL_REST_ANGLE - pocketCentre - from) % (Math.PI * 2);
    if (delta < 0) delta += Math.PI * 2;
    spinRef.current = { id: roulette.spinId, start: performance.now(), from, wheelTurn: Math.PI * 6 + delta, result: roulette.result };
  }, [roulette.phase, roulette.spinId, roulette.result]);

  useFrame((_, delta) => {
    const head = headRef.current;
    const ball = ballRef.current;
    if (!head || !ball) return;
    const spin = spinRef.current;
    const u = spin ? Math.min(1, (performance.now() - spin.start) / 1000 / SPIN_S) : 1;
    const ease = 1 - Math.pow(1 - u, 3);
    let wheel: number;
    let ballAngle: number;
    let ballR: number;
    if (spin && u < 1) {
      wheel = spin.from + spin.wheelTurn * ease;
      // the ball laps the rim the other way, then spirals down into the pocket
      ballAngle = BALL_REST_ANGLE + (1 - ease) * Math.PI * 10;
      ballR = WHEEL.r * (u < 0.75 ? 0.95 : 0.95 - ((u - 0.75) / 0.25) * 0.22);
      idleAngle.current = wheel;
    } else {
      // at rest the wheel drifts slowly; the ball rides in its pocket
      idleAngle.current += delta * 0.25;
      wheel = idleAngle.current;
      if (spin) {
        const idx = WHEEL_ORDER.indexOf(spin.result);
        ballAngle = wheel + idx * STEP + STEP / 2 + Math.PI / 2;
      } else ballAngle = BALL_REST_ANGLE;
      ballR = WHEEL.r * 0.73;
    }
    head.rotation.y = wheel;
    // same angle convention as the wedges (three's cylinder theta): x = sin, z = cos
    ball.position.set(Math.sin(ballAngle) * ballR, 0.07 + (ballR > WHEEL.r * 0.8 ? 0.02 : 0), Math.cos(ballAngle) * ballR);
  });

  return (
    <group position={[WHEEL.x, WHEEL.y, WHEEL.z]}>
      <group ref={headRef}>
        <mesh geometry={POCKET_GEO[0]} material={M.red} raycast={noRaycast} />
        <mesh geometry={POCKET_GEO[1]} material={M.black} raycast={noRaycast} />
        <mesh geometry={POCKET_GEO[2]} material={M.green} raycast={noRaycast} />
        <mesh geometry={GEO.cyl} material={M.wood} position={[0, 0.05, 0]} scale={[WHEEL.r * 1.2, 0.05, WHEEL.r * 1.2]} raycast={noRaycast} />
        <mesh geometry={GEO.cone} material={M.gold} position={[0, 0.12, 0]} scale={[0.26, 0.1, 0.26]} raycast={noRaycast} />
        <mesh geometry={GEO.cyl} material={M.gold} position={[0, 0.2, 0]} scale={[0.03, 0.12, 0.03]} raycast={noRaycast} />
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} geometry={GEO.box} material={M.gold} position={[0, 0.25, 0]} rotation={[0, (i * Math.PI) / 2, 0]} scale={[0.2, 0.02, 0.02]} raycast={noRaycast} />
        ))}
      </group>
      <mesh ref={ballRef} geometry={GEO.sphere} material={M.ball} scale={0.05} raycast={noRaycast} />

      {roulette.phase !== "betting" && roulette.result >= 0 && (
        <Billboard position={[0.9, 1.25, 0]}>
          <Text font="/fonts/kenpixel.ttf" fontSize={0.26} color={roulette.phase === "payout" ? resultColor(roulette.result) : "#ffe8b0"} outlineColor="#000" outlineWidth={0.02} anchorX="center">
            {roulette.phase === "spinning" ? "No more bets!" : `${roulette.result} ${pocketColor(roulette.result).toUpperCase()}`}
          </Text>
        </Billboard>
      )}
      {roulette.phase === "betting" && (
        <Billboard position={[0.9, 1.25, 0]}>
          <Text font="/fonts/kenpixel.ttf" fontSize={0.2} color="#ffe8b0" outlineColor="#000" outlineWidth={0.02} anchorX="center">
            {`Place your bets  ${roulette.timeLeft}s`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Payout confetti: a burst of gold, red and cream flecks over the wheel when a big payout
// lands — for everyone in the room, not just the winner's own screen
// ---------------------------------------------------------------------------------------

const CONFETTI_COUNT = 56;
const CONFETTI_LIFE = 2.4; // seconds
const BIG_PAYOUT = 50; // coins: below this the table just pays out quietly
const CONFETTI_MAT = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
const CONFETTI_COLORS = ["#f2c94c", "#e0453a", "#fbf6ea", "#2d9a5a", "#ffb34d"];

export function PayoutConfetti() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const burstAt = useRef(-Infinity);
  const { localSessionId } = useContext(RoomEventsContext);
  // each fleck's launch velocity and spin, fixed once
  const flecks = useMemo(() => {
    let s = 7;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: CONFETTI_COUNT }, () => {
      const a = rand() * Math.PI * 2;
      const r = 0.6 + rand() * 1.6;
      return { vx: Math.cos(a) * r, vy: 2.2 + rand() * 1.8, vz: Math.sin(a) * r, spin: (rand() - 0.5) * 12, tilt: rand() * Math.PI };
    });
  }, []);
  const tmp = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const color = new THREE.Color();
    flecks.forEach((_, i) => mesh.setColorAt(i, color.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length])));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [flecks]);

  useRoomMessage<RouletteResultBroadcast>("rouletteResult", (msg) => {
    const biggest = msg.winners.reduce((m, w) => Math.max(m, w.amount), 0);
    if (biggest < BIG_PAYOUT) return;
    burstAt.current = performance.now();
    // the winner's own panel already plays the fanfare; everyone else hears the burst here
    if (!msg.winners.some((w) => w.sessionId === localSessionId)) playConfetti();
  });

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = (performance.now() - burstAt.current) / 1000;
    if (t > CONFETTI_LIFE) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    flecks.forEach((f, i) => {
      const drag = 1 - Math.min(0.85, t * 0.35);
      tmp.position.set(f.vx * t * drag, f.vy * t - 4.2 * t * t * 0.5, f.vz * t * drag);
      tmp.rotation.set(f.tilt + t * f.spin, t * f.spin * 0.7, 0);
      const fade = t > CONFETTI_LIFE - 0.5 ? (CONFETTI_LIFE - t) / 0.5 : 1;
      tmp.scale.set(0.07 * fade, 0.03 * fade, 0.001 + 0.05 * fade);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[WHEEL.x, WHEEL.y + 0.3, WHEEL.z]}>
      <instancedMesh ref={ref} args={[GEO.box, CONFETTI_MAT, CONFETTI_COUNT]} frustumCulled={false} visible={false} raycast={noRaycast} />
    </group>
  );
}

function resultColor(n: number) {
  const c = pocketColor(n);
  return c === "red" ? "#ff6b6b" : c === "green" ? "#6bffa0" : "#e8e8f0";
}

/** Where a bet of this kind sits on the felt. */
export function betSpot(kind: string): [number, number] {
  if (kind === "red" || kind === "black" || kind === "odd" || kind === "even") {
    const i = ["red", "black", "odd", "even"].indexOf(kind);
    return [LAYOUT.x0 + 0.26 + i * 0.52, LAYOUT.outsideZ];
  }
  const n = Number(kind.slice(1));
  if (n === 0) return [LAYOUT.x0 - 0.1, LAYOUT.zMid];
  const col = Math.floor((n - 1) / 3);
  const row = (n - 1) % 3;
  return [LAYOUT.x0 + col * LAYOUT.cell + LAYOUT.cell / 2, LAYOUT.zMid + (1 - row) * LAYOUT.row];
}

const MAX_CHIPS = 160;

/** Everyone's chips on the felt, in each player's shirt colour. */
export function BetChips({ bets, players }: { bets: Record<string, string>; players: Record<string, PlayerState> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const tmp = new THREE.Object3D();
    const color = new THREE.Color();
    let n = 0;
    Object.entries(bets).forEach(([sessionId, raw], pi) => {
      const shirt = players[sessionId]?.color ?? "#ffffff";
      for (const [kind, amount] of Object.entries(parseBets(raw))) {
        const [x, z] = betSpot(kind);
        const ox = ((pi % 3) - 1) * 0.045;
        const oz = (Math.floor(pi / 3) % 2) * 0.04;
        const stack = Math.min(8, Math.ceil(amount / 5));
        for (let k = 0; k < stack && n < MAX_CHIPS; k++, n++) {
          tmp.position.set(x + ox, LAYOUT.feltY + 0.02 + k * 0.018, z + oz);
          tmp.scale.set(0.09, 0.016, 0.09);
          tmp.updateMatrix();
          mesh.setMatrixAt(n, tmp.matrix);
          mesh.setColorAt(n, color.set(shirt));
        }
      }
    });
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [bets, players]);
  return <instancedMesh ref={ref} args={[GEO.cyl, M.chip, MAX_CHIPS]} frustumCulled={false} raycast={noRaycast} />;
}

// ---------------------------------------------------------------------------------------
// High Roller leaderboard: a gilt board on an easel by the cashier
// ---------------------------------------------------------------------------------------

export function Leaderboard({ players }: { players: Record<string, PlayerState> }) {
  const lines = useMemo(() => {
    const top = Object.values(players)
      .filter((p) => p.connected)
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 5);
    if (top.length === 0) return "—";
    return top.map((p, i) => `${i + 1}. ${p.username.slice(0, 9).padEnd(10, " ")} ${p.coins}`).join("\n");
  }, [players]);

  return (
    <group position={[8.0, 0, -4.7]} rotation={[0, Math.PI / 4, 0]} scale={1.25}>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} geometry={GEO.box} material={M.wood} position={[x, 0.9, -0.05]} rotation={[0.08, 0, 0]} scale={[0.08, 1.8, 0.08]} castShadow raycast={noRaycast} />
      ))}
      <group position={[0, 1.5, 0]} rotation={[-0.35, 0, 0]}>
        <mesh geometry={GEO.box} material={M.gold} scale={[1.8, 1.2, 0.06]} castShadow raycast={noRaycast} />
        <mesh geometry={GEO.box} material={M.board} position={[0, 0, 0.035]} scale={[1.66, 1.06, 0.02]} raycast={noRaycast} />
        <Text font="/fonts/kenpixel.ttf" position={[0, 0.43, 0.05]} fontSize={0.14} color="#f2cf73" anchorX="center">
          HIGH ROLLERS
        </Text>
        <Text font="/fonts/kenpixel.ttf" position={[-0.74, 0.28, 0.05]} fontSize={0.13} lineHeight={1.3} color="#fff3dc" anchorX="left" anchorY="top">
          {lines}
        </Text>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Slot machines: three fruit reels on a textured drum, a pull lever, a coin tray
// ---------------------------------------------------------------------------------------

const REEL_FACES = SLOT_SYMBOLS.length;
const REEL_STEP = (Math.PI * 2) / REEL_FACES;
let reelTexture: THREE.CanvasTexture | null = null;
function getReelTexture() {
  if (reelTexture) return reelTexture;
  const cell = 128;
  const canvas = document.createElement("canvas");
  canvas.width = cell * REEL_FACES;
  canvas.height = cell;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fbf6ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  SLOT_SYMBOLS.forEach((sym, i) => {
    ctx.save();
    ctx.translate(i * cell + cell / 2, cell / 2);
    // the drum lies on its side, so each face is drawn a quarter-turn round
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (sym === "7") {
      ctx.fillStyle = "#d62839";
      ctx.font = "bold 92px Georgia, serif";
    } else {
      ctx.font = "84px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
    }
    ctx.fillText(sym, 0, 6);
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(i * cell, 0, 2, cell);
  });
  reelTexture = new THREE.CanvasTexture(canvas);
  reelTexture.colorSpace = THREE.SRGBColorSpace;
  return reelTexture;
}
const reelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.16, 20, 1, true);
reelGeo.rotateZ(Math.PI / 2);

const HIT_PAD = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// The cabinet's fixed parts, one geometry per material.
const CABINET_GEO = bake([
  { geo: GEO.box, p: [0, 0.55, 0], s: [1.0, 1.1, 0.8] },
  { geo: GEO.box, p: [0, 1.45, -0.1], s: [1.0, 0.7, 0.6] },
]);
const CHROME_GEO = bake([
  { geo: GEO.box, p: [0, 1.1, 0.12], s: [1.04, 0.05, 0.62] },
  { geo: GEO.box, p: [0, 1.45, 0.22], s: [0.86, 0.03, 0.02] },
  { geo: GEO.box, p: [0, 0.5, 0.42], s: [0.6, 0.1, 0.12] },
]);

export function SlotMachine({ prop, onUse }: { prop: ToggleableSyncState; onUse: () => void }) {
  const reelMat = useMemo(() => new THREE.MeshBasicMaterial({ map: getReelTexture() }), []);
  useEffect(() => () => reelMat.dispose(), [reelMat]);
  const topGlow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fff3d6", emissive: prop.color, emissiveIntensity: 1.6 }), [prop.color]);
  useEffect(() => () => topGlow.dispose(), [topGlow]);
  const reelRefs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const leverRef = useRef<THREE.Group>(null);
  const spinRef = useRef<{ start: number; from: number[]; to: number[]; win: number; mine: boolean; paid: boolean } | null>(null);
  const angles = useRef([REEL_STEP * 0.5, REEL_STEP * 1.5, REEL_STEP * 2.5]);
  const lastTick = useRef(0);
  const [banner, setBanner] = useState<string | null>(null);

  useRoomMessage<SlotBroadcast & { mine?: boolean }>("slotSpin", (msg) => {
    if (msg.propId !== prop.propId) return;
    const from = angles.current.slice();
    const to = msg.reels.map((sym, i) => {
      const target = sym * REEL_STEP + REEL_STEP / 2;
      let d = (target - from[i]) % (Math.PI * 2);
      if (d < 0) d += Math.PI * 2;
      return from[i] + Math.PI * 2 * (3 + i) + d;
    });
    spinRef.current = { start: performance.now(), from, to, win: msg.win, mine: false, paid: false };
    setBanner(null);
  });

  useFrame(({ clock }) => {
    const spin = spinRef.current;
    const t = clock.elapsedTime;
    if (spin) {
      const e = (performance.now() - spin.start) / 1000;
      let spinning = false;
      reelRefs.forEach((r, i) => {
        const dur = 0.9 + i * 0.35;
        const u = Math.min(1, e / dur);
        if (u < 1) spinning = true;
        const ease = 1 - Math.pow(1 - u, 3);
        angles.current[i] = spin.from[i] + (spin.to[i] - spin.from[i]) * ease;
        if (r.current) r.current.rotation.x = angles.current[i];
      });
      if (spinning && t - lastTick.current > 0.09) {
        lastTick.current = t;
        playReelTick();
      }
      if (!spinning && !spin.paid) {
        spin.paid = true;
        if (spin.win > 0) {
          setBanner(`WIN ${spin.win}!`);
          playCoin();
        }
        window.setTimeout(() => setBanner(null), 2500);
      }
    }
    if (leverRef.current) {
      const e = spin ? (performance.now() - spin.start) / 1000 : 9;
      leverRef.current.rotation.x = e < 0.5 ? Math.sin((e / 0.5) * Math.PI) * 0.9 : 0;
    }
    topGlow.emissiveIntensity = 1.2 + Math.sin(t * 4 + prop.x) * 0.4 + (banner ? 1.5 : 0);
  });

  return (
    <group position={[prop.x, 0, prop.z]}>
      {/* cabinet and its chrome trim */}
      <mesh geometry={CABINET_GEO} material={M.cabinet} castShadow receiveShadow raycast={noRaycast} />
      <mesh geometry={CHROME_GEO} material={M.chrome} raycast={noRaycast} />
      {/* glowing crown */}
      <mesh geometry={GEO.cyl} material={topGlow} position={[0, 1.88, -0.1]} rotation={[Math.PI / 2, 0, 0]} scale={[0.9, 0.5, 0.3]} raycast={noRaycast} />
      {/* reel window */}
      <mesh geometry={GEO.box} material={M.glassDark} position={[0, 1.45, 0.2]} scale={[0.82, 0.42, 0.02]} raycast={noRaycast} />
      {[-0.26, 0, 0.26].map((x, i) => (
        <group key={x} ref={reelRefs[i]} position={[x, 1.45, 0.08]} rotation={[angles.current[i], 0, 0]}>
          <mesh geometry={reelGeo} material={reelMat} scale={[1.45, 1, 1]} raycast={noRaycast} />
        </group>
      ))}
      {/* lever */}
      <group ref={leverRef} position={[0.56, 1.1, 0.05]}>
        <mesh geometry={GEO.cyl} material={M.chrome} position={[0, 0.3, 0]} scale={[0.04, 0.6, 0.04]} raycast={noRaycast} />
        <mesh geometry={GEO.sphere} material={M.lever} position={[0, 0.62, 0]} scale={0.12} raycast={noRaycast} />
      </group>
      {banner && (
        <Billboard position={[0, 2.35, 0]}>
          <Text font="/fonts/kenpixel.ttf" fontSize={0.22} color="#ffe36b" outlineColor="#000" outlineWidth={0.025} anchorX="center">
            {banner}
          </Text>
        </Billboard>
      )}
      <mesh
        ref={onHitLayer}
        geometry={GEO.box}
        material={HIT_PAD}
        position={[0, 1.0, 0.1]}
        scale={[1.2, 2.1, 1.0]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (e.button === 2) return;
          e.stopPropagation();
          onUse();
        }}
      />
    </group>
  );
}

export const ROULETTE_STAND = ROULETTE_CENTER;
