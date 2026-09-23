import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MOCHI_ACTION_COOLDOWN_S, MOCHI_SCRITCH_COINS, type MochiAction } from "@shared/types";
import { Modal } from "../components/hud/Modal";
import { MochiModel, restDrive, type MochiDrive } from "./Mochi";
import { GEO, noRaycast } from "../scene/kit";
import { playClick, playCoin, playMeow, playPurr } from "../audio/sfx";

interface Props {
  result: { action: MochiAction; coins: number; cooldown: boolean } | null;
  onPlay: (action: MochiAction) => void;
  onClose: () => void;
}

// Mochi's playroom: a clay card with a little 3D viewport in the middle (her real model, the
// same one that sleeps by the fire) and three ways to fuss over her.
//   🪶 Feather wand: move the pointer over the viewport; the feather follows it, her head
//      follows the feather, and a quick flick makes her pounce (that is the feather "play",
//      once per cooldown).
//   🐟 Treat: a dried fish; she chews, purrs, and looks very pleased.
//   ✨ Scritches: hold to stroke her chin; the purr meter fills and, once a day, she drops a
//      few coins she found somewhere.
// The server owns the cooldowns and the coins (mochi_play -> mochiResult); this is the toy.
const POUNCE_SPEED = 900; // px/s of feather movement that counts as a flick
type Pose = "idle" | "pounce" | "chew" | "purr" | "grumpy";

/** What the pointer is doing over the viewport, written by the DOM handlers, read per frame. */
interface Pointer {
  /** Normalised -1..1 across the viewport (x right, y up), or null when the pointer is off it. */
  x: number;
  y: number;
  over: boolean;
}

export function MochiPlayroomModal({ result, onPlay, onClose }: Props) {
  const [meter, setMeter] = useState(0);
  const [pose, setPose] = useState<Pose>("idle");
  const [cooldowns, setCooldowns] = useState<Partial<Record<MochiAction, number>>>({});
  const [now, setNow] = useState(Date.now());
  const rubbing = useRef(false);
  const matRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<Pointer>({ x: 0, y: 0, over: false });
  const lastMove = useRef({ x: 0, y: 0, t: 0 });
  const lastPounce = useRef(0);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  // the server's answer drives her reaction
  useEffect(() => {
    if (!result) return;
    if (result.cooldown) {
      setPose("grumpy");
      const t = window.setTimeout(() => setPose("idle"), 1500);
      return () => window.clearTimeout(t);
    }
    setCooldowns((c) => ({ ...c, [result.action]: Date.now() + MOCHI_ACTION_COOLDOWN_S * 1000 }));
    if (result.action === "feather") {
      setPose("pounce");
      playMeow();
    } else if (result.action === "treat") {
      setPose("chew");
      playPurr();
    } else {
      setPose("purr");
      playPurr();
      if (result.coins > 0) playCoin();
    }
    const t = window.setTimeout(() => setPose("idle"), 2600);
    return () => window.clearTimeout(t);
  }, [result]);

  // the purr meter: fills while the scritch button is held, then fires the action once
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setMeter((m) => {
        const next = rubbing.current ? Math.min(1, m + 0.012) : Math.max(0, m - 0.004);
        if (next >= 1 && m < 1) {
          rubbing.current = false;
          onPlay("scritch");
          return 0;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onPlay]);

  const left = (id: MochiAction) => Math.max(0, Math.ceil(((cooldowns[id] ?? 0) - now) / 1000));

  // the feather: wherever the pointer goes over the viewport; a flick is a pounce
  const moveFeather = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = matRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    pointer.current = { x: (x / r.width) * 2 - 1, y: -((y / r.height) * 2 - 1), over: true };
    const t = performance.now();
    const prev = lastMove.current;
    if (prev.t) {
      const speed = Math.hypot(x - prev.x, y - prev.y) / Math.max(0.001, (t - prev.t) / 1000);
      if (speed > POUNCE_SPEED && t - lastPounce.current > 1200 && left("feather") === 0) {
        lastPounce.current = t;
        onPlay("feather");
      }
    }
    lastMove.current = { x, y, t };
  };

  return (
    <Modal title="Mochi's Playroom" icon="🐱" onClose={onClose} width={440}>
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        {/* the viewport: Mochi herself, and the feather wherever the pointer is */}
        <div
          ref={matRef}
          className="relative h-56 w-full touch-none select-none overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_50%_70%,#3b2a36_0%,#1f1a22_75%)] shadow-[inset_0_2px_0_rgba(255,255,255,0.08)]"
          onPointerMove={moveFeather}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            moveFeather(e);
          }}
          onPointerLeave={() => (pointer.current = { ...pointer.current, over: false })}
        >
          <Canvas
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: true, powerPreference: "default" }}
            camera={{ fov: 28, position: [0, 0.55, 2.2], near: 0.1, far: 20 }}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            onCreated={({ camera }) => camera.lookAt(0, 0.22, 0)}
          >
            <PlayroomScene pose={pose} pointer={pointer} />
          </Canvas>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] opacity-50">move the feather over her, flick it to play</div>
          {pose === "purr" && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-sm font-extrabold text-pink-200" aria-hidden>
              purrrr…
            </div>
          )}
          {pose === "grumpy" && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-sm font-extrabold text-amber-100/80" aria-hidden>
              …not now.
            </div>
          )}
        </div>

        {result?.cooldown && <span className="text-xs opacity-70">She needs a minute. Try something else.</span>}
        {result && !result.cooldown && result.action === "scritch" && (
          <span className="clay-pop text-sm font-bold text-amber-200">{result.coins > 0 ? `She drops ${result.coins} coins from somewhere. 🪙` : "That is today's coin already claimed, but she loves you anyway."}</span>
        )}

        <div className="grid w-full grid-cols-2 gap-2">
          <div className="clay-btn clay-btn-ghost min-h-16 flex-col gap-0 text-sm" aria-label="Feather wand: move it over the viewport">
            <span className="text-2xl">🪶</span>
            {left("feather") > 0 ? `${left("feather")}s` : "Feather wand"}
            <span className="text-[10px] opacity-60">flick it to make her pounce</span>
          </div>
          <button type="button" disabled={left("treat") > 0} onClick={() => (playClick(), onPlay("treat"))} className="clay-btn clay-btn-rose min-h-16 flex-col gap-0 text-sm">
            <span className="text-2xl">🐟</span>
            {left("treat") > 0 ? `${left("treat")}s` : "Cat treat"}
            <span className="text-[10px] opacity-70">a dried fish, gone in one bite</span>
          </button>
        </div>

        <div className="w-full">
          <div className="mb-1 flex justify-between text-xs font-bold uppercase tracking-widest opacity-60">
            <span>✨ Scritch meter</span>
            <span>
              {MOCHI_SCRITCH_COINS[0]}–{MOCHI_SCRITCH_COINS[1]} 🪙 once a day
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-pink-300 to-amber-200" style={{ width: `${meter * 100}%` }} />
          </div>
          <button
            type="button"
            disabled={left("scritch") > 0}
            className="clay-btn clay-btn-amber mt-2 min-h-14 w-full select-none text-lg"
            onPointerDown={() => (rubbing.current = true)}
            onPointerUp={() => (rubbing.current = false)}
            onPointerLeave={() => (rubbing.current = false)}
            onPointerCancel={() => (rubbing.current = false)}
          >
            {left("scritch") > 0 ? `🤚 ${left("scritch")}s` : "🤚 Hold to scritch"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------
// The little scene: a warm spot of light, a round mat, Mochi, and the feather
// ---------------------------------------------------------------------------------------

const MAT = new THREE.MeshStandardMaterial({ color: "#5a3f4c", roughness: 1 });
const MAT_RIM = new THREE.MeshStandardMaterial({ color: "#7a5668", roughness: 1 });
const FEATHER = new THREE.MeshStandardMaterial({ color: "#f3e7c9", roughness: 0.9, side: THREE.DoubleSide });
const FEATHER_TIP = new THREE.MeshStandardMaterial({ color: "#e88a8a", roughness: 0.9, side: THREE.DoubleSide });
const WAND = new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 0.8 });
const FEATHER_PLANE_Z = 0.55; // the feather hovers on this plane, just in front of her nose

function PlayroomScene({ pose, pointer }: { pose: Pose; pointer: React.MutableRefObject<Pointer> }) {
  const drive = useRef<MochiDrive>(restDrive());
  const featherRef = useRef<THREE.Group>(null);
  const poseStart = useRef(0);
  const lastPose = useRef<Pose>("idle");
  const { camera, viewport } = useThree();

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (pose !== lastPose.current) {
      lastPose.current = pose;
      poseStart.current = t;
    }
    const since = t - poseStart.current;
    const d = drive.current;
    const L = THREE.MathUtils.lerp;
    const p = pointer.current;

    // the feather: on its plane, under the pointer, with a little bob; parked at the side when the pointer leaves
    const f = featherRef.current;
    if (f) {
      const v = viewport.getCurrentViewport(camera, new THREE.Vector3(0, 0.22, FEATHER_PLANE_Z));
      const tx = p.over ? (p.x * v.width) / 2 : 0.9;
      const ty = p.over ? 0.22 + (p.y * v.height) / 2 : 0.15;
      f.position.x = L(f.position.x, tx, 1 - Math.pow(0.001, delta));
      f.position.y = L(f.position.y, ty + Math.sin(t * 5) * 0.02, 1 - Math.pow(0.001, delta));
      f.position.z = FEATHER_PLANE_Z;
      f.rotation.z = L(f.rotation.z, -0.5 + (tx - f.position.x) * 2, 0.2);
    }

    // her head follows the feather; a pounce, a chew or a purr takes over for a moment
    const fx = f ? f.position.x : 0;
    const fy = f ? f.position.y : 0.3;
    const yaw = THREE.MathUtils.clamp(Math.atan2(fx, FEATHER_PLANE_Z + 0.1), -0.8, 0.8);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(fy - 0.35, FEATHER_PLANE_Z + 0.2), -0.55, 0.6);
    d.headYaw = p.over ? yaw : Math.sin(t * 0.4) * 0.15;
    d.headPitch = p.over ? pitch : 0;
    d.pounce = pose === "pounce" ? THREE.MathUtils.clamp(since / 0.7, 0, 1) : 0;
    d.chew = pose === "chew" && since < 2.4 ? 1 : 0;
    d.happy = pose === "purr" || pose === "chew";
    d.stretch = pose === "grumpy" ? 0 : 0;
    d.lick = 0;
    d.walking = false;
    if (pose === "grumpy") {
      d.headYaw = Math.sin(t * 12) * 0.25; // a firm little head-shake
      d.headPitch = 0.2;
    }
  });

  return (
    <>
      {/* the modal's own lights: bright and warm, so she is never a silhouette */}
      <ambientLight intensity={1.0} color="#fff5e6" />
      <pointLight position={[1.6, 2.2, 2.0]} intensity={2.4} color="#ffe0b2" distance={8} decay={1.5} />
      <pointLight position={[-1.6, 1.4, 1.4]} intensity={1.4} color="#ffaa44" distance={7} decay={1.5} />
      {/* a round mat for her to sit on */}
      <mesh geometry={GEO.cyl} material={MAT_RIM} position={[0, -0.05, 0]} scale={[1.7, 0.08, 1.7]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={MAT} position={[0, -0.03, 0]} scale={[1.5, 0.08, 1.5]} raycast={noRaycast} />
      <group position={[0, 0, 0]} rotation={[0, 0, 0]} scale={1.15}>
        <MochiModel drive={drive} />
      </group>
      {/* the feather wand */}
      <group ref={featherRef} position={[0.9, 0.15, FEATHER_PLANE_Z]} rotation={[0, 0, -0.5]}>
        <mesh geometry={GEO.cyl} material={WAND} position={[0, -0.22, 0]} scale={[0.02, 0.3, 0.02]} raycast={noRaycast} />
        <mesh geometry={GEO.sphere} material={FEATHER} position={[0, 0.04, 0]} scale={[0.09, 0.26, 0.02]} raycast={noRaycast} />
        <mesh geometry={GEO.sphere} material={FEATHER_TIP} position={[0, 0.17, 0.002]} scale={[0.05, 0.1, 0.02]} raycast={noRaycast} />
      </group>
    </>
  );
}
