import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { MochiAction } from "@shared/types";
import { Modal } from "../components/hud/Modal";
import { GEO, matte, noRaycast } from "../scene/kit";
import { MochiModel, restDrive, type MochiDrive } from "./Mochi";

// Mochi's playroom: her own little 3D viewport (a separate <Canvas>, ambient light at 1.0 and two
// warm point lights) with three things to do.
//
//   feather  a wand that follows the cursor; her head follows it, and a flick makes her pounce
//   treat    tap the bowl: she chews, and the server logs the play
//   scritch  drag over her: the meter fills, she purrs (a synthesised purr) and sways; a full
//            meter is a satisfied cat and the day's scritch coins
//
// Every action is also sent to the server (`onPlay`), which applies the cooldowns and the daily
// coin; its answer (`result`) comes back as the little line under the viewport.

const SCRITCH_FILL_PER_S = 0.55;
const SCRITCH_DECAY_PER_S = 0.18;
const POUNCE_S = 0.7;
const TREAT_S = 2.6;

/** A cat's purr, synthesised: low, amplitude-modulated noise. Only ever started by a user gesture. */
function usePurr() {
  const ref = useRef<{ ctx: AudioContext; gain: GainNode; stop: () => void } | null>(null);
  const start = useCallback(() => {
    if (ref.current) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // the rumble: the noise pulsed at ~25 Hz, the pace of a real purr
    const pulse = ctx.createOscillator();
    pulse.frequency.value = 25;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    const amp = ctx.createGain();
    amp.gain.value = 0.5;
    pulse.connect(depth).connect(amp.gain);
    noise.connect(low).connect(amp).connect(gain).connect(ctx.destination);
    noise.start();
    pulse.start();
    ref.current = {
      ctx,
      gain,
      stop: () => {
        noise.stop();
        pulse.stop();
        void ctx.close();
      },
    };
  }, []);
  /** 0..1 loudness, eased so a purr swells and fades instead of clicking. */
  const level = useCallback((v: number) => {
    const p = ref.current;
    if (p) p.gain.gain.setTargetAtTime(v * 0.5, p.ctx.currentTime, 0.15);
  }, []);
  useEffect(() => () => ref.current?.stop(), []);
  return { start, level };
}

interface Session {
  drive: React.MutableRefObject<MochiDrive>;
  /** The wand's tip in the playroom's floor plane (x, z), or null when the cursor is away. */
  wand: React.MutableRefObject<{ x: number; z: number } | null>;
  scratching: React.MutableRefObject<boolean>;
  /** Bumped on a flick, so the scene can start a pounce. */
  flick: React.MutableRefObject<number>;
  /** True while she is chewing a treat. */
  chewing: React.MutableRefObject<boolean>;
  meter: React.MutableRefObject<number>;
}

function Playroom({ s, onScratchStart }: { s: Session; onScratchStart: () => void }) {
  const wandRef = useRef<THREE.Group>(null);
  const pounceAt = useRef(-1);
  const lastFlick = useRef(0);
  const lastWand = useRef<{ x: number; z: number } | null>(null);
  const gl = useThree((state) => state.gl);
  const { camera } = useThree();
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02));
  const ray = useRef(new THREE.Raycaster());
  const hit = useRef(new THREE.Vector3());

  // the cursor is tracked over the whole canvas, not only over meshes
  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      ray.current.setFromCamera(ndc, camera);
      if (ray.current.ray.intersectPlane(plane.current, hit.current)) {
        const p = { x: THREE.MathUtils.clamp(hit.current.x, -1.6, 1.6), z: THREE.MathUtils.clamp(hit.current.z, -1.2, 1.4) };
        const prev = lastWand.current;
        // a quick sweep is a flick
        if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) > 0.35) s.flick.current += 1;
        lastWand.current = p;
        s.wand.current = p;
      }
    };
    const leave = () => {
      s.wand.current = null;
      lastWand.current = null;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [gl, camera, s]);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const d = s.drive.current;
    const now = clock.elapsedTime;
    const wand = s.wand.current;

    // the feather: floats after the cursor, and bobs a little on its own
    if (wandRef.current) {
      const goal = wand ?? { x: 1.2, z: 0.9 };
      wandRef.current.position.x = THREE.MathUtils.lerp(wandRef.current.position.x, goal.x, 0.25);
      wandRef.current.position.z = THREE.MathUtils.lerp(wandRef.current.position.z, goal.z, 0.25);
      wandRef.current.position.y = 0.32 + Math.sin(now * 5) * 0.03;
      wandRef.current.rotation.z = Math.sin(now * 6) * 0.25;
    }

    // her head follows the wand; a flick starts a pounce
    if (wand) {
      d.headYaw = THREE.MathUtils.clamp(Math.atan2(wand.x, wand.z + 0.3) * 0.7, -0.7, 0.7);
      d.headPitch = THREE.MathUtils.clamp(0.1 - wand.z * 0.05, -0.2, 0.3);
    } else {
      d.headYaw = 0;
      d.headPitch = 0;
    }
    if (s.flick.current !== lastFlick.current) {
      lastFlick.current = s.flick.current;
      if (pounceAt.current < 0) pounceAt.current = now;
    }
    d.pounce = 0;
    if (pounceAt.current >= 0) {
      const k = (now - pounceAt.current) / POUNCE_S;
      if (k >= 1) pounceAt.current = -1;
      else d.pounce = k;
    }

    // the treat, and the scritches
    d.chew = s.chewing.current ? 1 : 0;
    const scratching = s.scratching.current;
    s.meter.current = THREE.MathUtils.clamp(s.meter.current + (scratching ? SCRITCH_FILL_PER_S : -SCRITCH_DECAY_PER_S) * delta, 0, 1);
    d.happy = scratching || s.meter.current > 0.02 || d.chew > 0;
  });

  const scratch = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    s.scratching.current = true;
    onScratchStart();
  };

  return (
    <>
      {/* a round rug for her to play on */}
      <mesh geometry={GEO.circle} material={RUG} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.1]} scale={[3.6, 3.6, 1]} raycast={noRaycast} />
      <mesh geometry={GEO.circle} material={RUG_INNER} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0.1]} scale={[2.9, 2.9, 1]} raycast={noRaycast} />
      <group scale={2.4}>
        <MochiModel drive={s.drive} />
      </group>
      {/* the scritch target: a big invisible pad over her */}
      <mesh geometry={GEO.box} material={HIT} position={[0, 0.4, 0.1]} scale={[1.3, 0.9, 1.5]} onPointerDown={scratch} />
      {/* the feather wand */}
      <group ref={wandRef} position={[1.2, 0.32, 0.9]}>
        <mesh geometry={GEO.cyl} material={WOOD} position={[0, 0.25, 0]} scale={[0.03, 0.5, 0.03]} raycast={noRaycast} />
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} geometry={GEO.sphere} material={i % 2 ? FEATHER_A : FEATHER_B} position={[Math.sin(i * 1.6) * 0.05, 0.52 + i * 0.05, Math.cos(i * 1.6) * 0.03]} scale={[0.07, 0.2, 0.03]} rotation={[0, 0, (i - 1.5) * 0.35]} raycast={noRaycast} />
        ))}
      </group>
    </>
  );
}

// invisible but raycastable: R3F skips `visible={false}` objects, so the MATERIAL is what is hidden
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const RUG = matte("#a65a38", 0.85);
const RUG_INNER = matte("#e3c9a0", 0.85);
const WOOD = matte("#c48a4f", 0.8);
const FEATHER_A = matte("#7fb3a0", 0.85);
const FEATHER_B = matte("#f0c27a", 0.85);

const LINES: Record<MochiAction, string> = {
  feather: "She pounces on the feather!",
  treat: "Nom nom nom.",
  scritch: "Purrrrr.",
};

export function MochiPlayroomModal({ result, onPlay, onClose }: { result: { action: MochiAction; coins: number; cooldown: boolean } | null; onPlay: (action: string) => void; onClose: () => void }) {
  const session = useRef<Session>({
    drive: { current: restDrive() },
    wand: { current: null },
    scratching: { current: false },
    flick: { current: 0 },
    chewing: { current: false },
    meter: { current: 0 },
  }).current;
  const purr = usePurr();
  const [meter, setMeter] = useState(0);
  const [line, setLine] = useState("Wave the feather, feed her a treat, or scritch her.");
  const sentScritch = useRef(false);
  const sentFeather = useRef(false);

  // the meter, the purr and the "satisfied" moment all follow the scene's meter
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const m = session.meter.current;
      setMeter(m);
      purr.level(m > 0.02 ? 0.4 + m * 0.6 : 0);
      if (session.flick.current > 0 && !sentFeather.current) {
        sentFeather.current = true;
        onPlay("feather");
        setLine(LINES.feather);
      }
      if (m >= 1 && !sentScritch.current) {
        sentScritch.current = true;
        onPlay("scritch");
        setLine("Mochi is completely satisfied. 💕");
      }
      if (m < 0.3) sentScritch.current = false;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [session, purr, onPlay]);

  // letting go anywhere ends the scritch
  useEffect(() => {
    const up = () => (session.scratching.current = false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [session]);

  // the server's answer: coins for the day's first satisfied scritch, or a "not yet"
  useEffect(() => {
    if (!result) return;
    if (result.cooldown) setLine("She needs a moment before doing that again.");
    else if (result.coins > 0) setLine(`Mochi is delighted. +${result.coins} 🪙`);
    else setLine(LINES[result.action]);
  }, [result]);

  const giveTreat = () => {
    session.chewing.current = true;
    purr.start();
    onPlay("treat");
    setLine(LINES.treat);
    window.setTimeout(() => (session.chewing.current = false), TREAT_S * 1000);
  };

  return (
    <Modal title="Mochi's playroom" icon="🐱" onClose={onClose} width={560}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="relative overflow-hidden rounded-3xl" style={{ height: 300, background: "#3a2618", touchAction: "none" }}>
          <Canvas dpr={[1, 1.5]} camera={{ position: [0, 2.6, 3.6], fov: 34 }} gl={{ antialias: true }} onCreated={({ camera }) => camera.lookAt(0, 0.4, 0.2)}>
            <color attach="background" args={["#3a2618"]} />
            <ambientLight intensity={1.0} />
            <pointLight position={[-2, 2.5, 1.5]} color="#ffaa44" intensity={9} distance={9} decay={2} />
            <pointLight position={[2.2, 2, 2.2]} color="#ffe0b2" intensity={8} distance={9} decay={2} />
            <Playroom s={session} onScratchStart={purr.start} />
          </Canvas>
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold text-amber-100">move the feather · drag over Mochi to scritch</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest opacity-60">Scritch</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${Math.round(meter * 100)}%`, background: meter >= 1 ? "#ff8fb1" : "#ffc457" }} />
          </div>
          <span className="w-8 text-right text-xs tabular-nums opacity-70">{Math.round(meter * 100)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="clay-btn clay-btn-amber" onClick={giveTreat}>
            🐟 Give a treat
          </button>
          <button type="button" className="clay-btn clay-btn-ghost" onClick={() => (session.flick.current += 1)}>
            🪶 Flick the feather
          </button>
          <span className="min-w-0 flex-1 text-sm opacity-80">{line}</span>
        </div>
      </div>
    </Modal>
  );
}
