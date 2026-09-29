import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CAVERNS_CHANNELS, CHISEL_BITE, CHISEL_PULVERIZE, CHISEL_SWEET, GEM_IDS, ORE_ITEMS, chiselGauge, geodeOdds, seamFaces, type CavernsResult, type GemId, type GeodeAim, type GeodeId, type GeodeResult, type GeodeStart, type Vec3 } from "@shared/caverns_mining";
import { satchelCount } from "@shared/satchel";
import type { FishingProfile } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playCaveSfx } from "../../audio/cavernAmbience";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The Precision Geode Chisel, on the meteorite anvil beside the forge: a geode is cleaved in two
// phases (shared/caverns_mining.ts).
//
//   the seam     the geode turns in your hands (a drag, a swipe, or the arrow keys: its canvas takes
//                no scrolling and no text selection, `touch-action: none`, `user-select: none`), its
//                crystal seam glinting brighter the more it faces you; faced within SEAM_FACE_DEG, a
//                harmonic chime rings and the chisel is set (the server's word: GeodeAim)
//   the mallet   the power gauge sweeps 0 to 100% and back; raise the mallet (hold the button, or
//                Space) and let go in the gold: 65-80% a perfect cleavage (the finer gems' odds
//                whole), under 40% the chisel rings off (again), over 85% the core is pulverized into
//                Fine Stone Dust, anywhere between a rough cleave (the finer gems' odds shaved)
//
// The gauge's clock starts when the server sets the chisel; the release goes up with the time this
// side measured on it (the server checks it against its own, within a slack).

interface Props {
  profile: FishingProfile;
  send: (channel: string, packet?: unknown) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

type Phase = "pick" | "seam" | "mallet" | "done";

/** Keeps a press's pointer on its element (a drag off the geode, a finger off the mallet button). */
function capture(e: React.PointerEvent<Element>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // (a pointer the browser no longer tracks)
  }
}

/** The geode's turn in your hands, shared between the canvas and the panel (no React state: a frame's). */
interface Turn {
  q: THREE.Quaternion;
  /** How squarely the seam faces you (its cosine against the view). */
  facing: number;
}

export function GeodeModal({ profile, send, subscribeMessages, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [geode, setGeode] = useState<GeodeId | null>(null);
  const [seam, setSeam] = useState<Vec3 | null>(null);
  const [result, setResult] = useState<GeodeResult | null>(null);
  const [bounces, setBounces] = useState(0);
  const [notice, setNotice] = useState("");
  const [raised, setRaised] = useState(false);
  const gaugeAt = useRef(0);
  const turn = useRef<Turn>({ q: new THREE.Quaternion(), facing: -1 });
  const aimSent = useRef(0);
  const chimed = useRef(false);
  // (the room's senders are made afresh on every render: read the latest through the ref)
  const live = useRef({ phase, geode, send });
  live.current = { phase, geode, send };

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "geodeStart") {
          const g = payload as GeodeStart;
          setGeode(g.geode);
          setSeam(g.seam);
          setResult(null);
          setBounces(0);
          setNotice("");
          chimed.current = false;
          aimSent.current = 0;
          // the geode turned so its seam starts away from you (the find is yours to make)
          const s = new THREE.Vector3(...g.seam);
          turn.current.q.setFromUnitVectors(s, new THREE.Vector3(0.35, -0.2, -1).normalize());
          setPhase("seam");
        } else if (type === "geodeAim") {
          const a = payload as GeodeAim;
          if (a.ok && live.current.phase === "seam") {
            gaugeAt.current = performance.now();
            setPhase("mallet");
          }
        } else if (type === "geodeResult") {
          const r = payload as GeodeResult;
          if (r.verdict === "bounce") {
            setBounces((n) => n + 1);
            playCaveSfx("clang", 0.8);
            return;
          }
          setResult(r);
          setPhase("done");
          if (r.verdict === "pulverize") {
            playCaveSfx("shatter", 0.9);
          } else {
            playCaveSfx("crack", 1);
            if (r.gem) window.setTimeout(() => playSfx(r.gem === "star_shard" || r.gem === "opal" ? "jackpot" : "chime"), 350);
          }
        } else if (type === "cavernsResult") {
          const r = payload as CavernsResult;
          if (!r.ok) setNotice(r.message);
        }
      }),
    [subscribeMessages]
  );
  // stepping away mid-cleave (the panel closed): the geode stays whole in the satchel
  useEffect(
    () => () => {
      const { phase: p, send: s } = live.current;
      if (p === "seam" || p === "mallet") s(CAVERNS_CHANNELS.geode, { op: "cancel" });
    },
    []
  );

  // the seam found: the chime, and the aim sent up (again now and then while the server hasn't said)
  const onFacing = (view: Vec3) => {
    if (live.current.phase !== "seam" || !seam || !seamFaces(seam, view)) return;
    if (!chimed.current) {
      chimed.current = true;
      playSfx("chime");
    }
    const now = performance.now();
    if (now - aimSent.current < 350) return;
    aimSent.current = now;
    live.current.send(CAVERNS_CHANNELS.geode, { op: "aim", view: view.map((v) => Math.round(v * 1000) / 1000) });
  };

  const release = () => {
    if (live.current.phase !== "mallet" || !raised) return;
    setRaised(false);
    const t = Math.round(performance.now() - gaugeAt.current);
    playCaveSfx("anvil", 0.9);
    live.current.send(CAVERNS_CHANNELS.geode, { op: "release", t });
  };
  // Space raises the mallet and lets it fall
  const liveRelease = useRef(release);
  liveRelease.current = release;
  useEffect(() => {
    if (phase !== "mallet") return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      setRaised(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      liveRelease.current();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [phase]);

  const start = (id: GeodeId) => send(CAVERNS_CHANNELS.geode, { op: "start", geode: id });
  const mystery = satchelCount(profile, "mystery_geode");
  const pristine = satchelCount(profile, "pristine_geode");
  const again = () => {
    setPhase("pick");
    setGeode(null);
    setSeam(null);
    setResult(null);
  };

  return (
    <Modal title="The Geode Anvil" icon="🔨" onClose={onClose} width={460}>
      <div className="flex flex-col items-center gap-2 pb-1">
        {phase === "pick" && (
          <>
            <p className="m-0 text-center text-[12px] opacity-80">Set a geode on the meteorite anvil. Turn it until its crystal seam faces you, then one mallet blow: 65-80% power for a perfect cleavage.</p>
            <div className="grid w-full grid-cols-2 gap-1.5">
              {(["mystery_geode", "pristine_geode"] as GeodeId[]).map((id) => {
                const n = id === "mystery_geode" ? mystery : pristine;
                return (
                  <button key={id} type="button" className="clay-btn clay-btn-amber flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 leading-tight" disabled={n < 1} onClick={() => start(id)}>
                    <span className="text-2xl">{ORE_ITEMS[id].emoji}</span>
                    <span className="text-[12px]">
                      {ORE_ITEMS[id].name} ×{n}
                    </span>
                  </button>
                );
              })}
            </div>
            <OddsTable odds={geodeOdds("mystery_geode", true)} label="A Mystery Geode, a perfect cleavage" />
            <OddsTable odds={geodeOdds("pristine_geode", true)} label="A Pristine Geode, a perfect cleavage" />
          </>
        )}
        {(phase === "seam" || phase === "mallet") && geode && seam && (
          <>
            <p className="m-0 text-center text-[12px] opacity-80">
              {phase === "seam" ? (
                <>
                  <span className="kbd-hint">Drag the geode (or use the arrow keys)</span>
                  <span className="touch-hint">Swipe the geode</span> to turn it: find the glowing seam and face it toward you
                </>
              ) : (
                <>
                  🔔 The chisel is set on the seam. <span className="kbd-hint">Hold Space (or the mallet button)</span>
                  <span className="touch-hint">Hold the mallet</span> and let go in the gold
                </>
              )}
            </p>
            <div className="relative aspect-square w-full max-w-[250px] rounded-3xl bg-gradient-to-b from-[#2a2233] to-[#16121c]" style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}>
              <GeodeStage geode={geode} seam={seam} turn={turn} canTurn={phase === "seam"} onFacing={onFacing} />
              {phase === "mallet" && <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] font-bold text-cyan-100/90">✦ seam ✦</div>}
            </div>
            {phase === "seam" && <SeamMeter turn={turn} seam={seam} />}
            {phase === "mallet" && (
              <>
                <PowerGauge geode={geode} since={gaugeAt} raised={raised} />
                <button
                  type="button"
                  className={`clay-btn clay-btn-amber min-h-14 w-full select-none text-base font-extrabold ${raised ? "brightness-125" : ""}`}
                  style={{ touchAction: "none" }}
                  onPointerDown={(e) => {
                    capture(e);
                    setRaised(true);
                  }}
                  onPointerUp={release}
                  onPointerCancel={() => setRaised(false)}
                >
                  {raised ? "🔨 …let go!" : "🔨 Raise the mallet"}
                </button>
                {bounces > 0 && <p className="m-0 text-center text-[12px] text-amber-200">The chisel rang off the shell: more power ({Math.round(CHISEL_BITE * 100)}% at least)</p>}
              </>
            )}
          </>
        )}
        {phase === "done" && result && <Reveal geode={geode} result={result} onAgain={again} />}
        {notice && <p className="m-0 text-center text-[12px] font-semibold text-rose-200">{notice}</p>}
      </div>
    </Modal>
  );
}

// --- the geode in your hands --------------------------------------------------------------------------

/** A geode's rind: an icosphere pushed about by noise, in vertex colours; each vertex keeps its own
 *  direction (`aDir`) for the seam, which the shader draws per pixel (a thin line can't be drawn
 *  from the vertices: it would break into lit facets). */
function geodeGeometry(geode: GeodeId): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const dirs = new Float32Array(pos.count * 3);
  const rock = new THREE.Color(geode === "pristine_geode" ? "#8d7fb8" : "#8a7868");
  const dark = new THREE.Color(geode === "pristine_geode" ? "#4d4174" : "#4e4038");
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    dirs.set([v.x, v.y, v.z], i * 3);
    const n = Math.sin(v.x * 5.1 + 1.3) * Math.sin(v.y * 4.3 + 0.7) * Math.sin(v.z * 3.7 + 2.1) + 0.5 * Math.sin(v.x * 11 + v.z * 9);
    const r = 1 + 0.07 * n;
    pos.setXYZ(i, v.x * r, v.y * r * 0.94, v.z * r);
    c.copy(rock).lerp(dark, THREE.MathUtils.clamp(0.5 - n * 0.6, 0, 1));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.setAttribute("aDir", new THREE.BufferAttribute(dirs, 3));
  geo.computeVertexNormals();
  return geo;
}

/** The seam's frame: its point, and the great circle the crack runs along (its tangent and normal). */
function seamFrame(seam: Vec3) {
  const dir = new THREE.Vector3(...seam).normalize();
  const tangent = new THREE.Vector3(0, 1, 0).cross(dir);
  if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
  tangent.normalize();
  return { dir, tangent, normal: new THREE.Vector3().crossVectors(dir, tangent).normalize() };
}

/** The rock's finish, and its crystal seam drawn per pixel: a jagged crack zig-zagging along the
 *  great circle through the seam's point (about 100 degrees long, fading at its ends), a dark groove
 *  round it and a glowing line in it, brighter the more it faces you. */
function geodeMaterial(geode: GeodeId, seam: Vec3): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true });
  const f = seamFrame(seam);
  const glow = new THREE.Color(geode === "pristine_geode" ? "#d6b8ff" : "#8ff6ff");
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSeamGlow: GLOW, uSeamDir: { value: f.dir }, uSeamT: { value: f.tangent }, uSeamN: { value: f.normal }, uSeamCol: { value: glow } });
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aDir;\nvarying vec3 vDir;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvDir = aDir;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uSeamGlow;
        uniform vec3 uSeamDir;
        uniform vec3 uSeamT;
        uniform vec3 uSeamN;
        uniform vec3 uSeamCol;
        varying vec3 vDir;
        float seamOff;
        float seamAlong;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec3 d = normalize(vDir);
          seamAlong = dot(d, uSeamDir);
          float round_ = atan(dot(d, uSeamT), seamAlong);
          float zig = 0.035 * sin(round_ * 23.0) + 0.015 * sin(round_ * 57.0 + 1.3);
          seamOff = abs(dot(d, uSeamN) + zig);
          float groove = (1.0 - smoothstep(0.0, 0.07, seamOff)) * smoothstep(0.25, 0.6, seamAlong);
          diffuseColor.rgb *= 1.0 - 0.55 * groove;
        }`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uSeamCol * (1.0 - smoothstep(0.006, 0.026, seamOff)) * smoothstep(0.3, 0.75, seamAlong) * uSeamGlow;`
      );
  };
  m.customProgramCacheKey = () => "geode-seam";
  return m;
}

const VIEW = new THREE.Vector3(0, 0, 1);

function GeodeStage({ geode, seam, turn, canTurn, onFacing }: { geode: GeodeId; seam: Vec3; turn: React.MutableRefObject<Turn>; canTurn: boolean; onFacing: (view: Vec3) => void }) {
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const spin = useRef({ x: 0, y: 0 });
  const keys = useRef(new Set<string>());
  useEffect(() => {
    if (!canTurn) return;
    const down = (e: KeyboardEvent) => {
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        keys.current.add(e.key);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.current.clear();
    };
  }, [canTurn]);
  return (
    <div
      className="absolute inset-0"
      style={{ touchAction: "none", cursor: canTurn ? "grab" : "default" }}
      onPointerDown={(e) => {
        if (!canTurn) return;
        capture(e);
        drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        spin.current.y += (e.clientX - d.x) * 0.012;
        spin.current.x += (e.clientY - d.y) * 0.012;
        d.x = e.clientX;
        d.y = e.clientY;
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 4.2], fov: 34 }} gl={{ alpha: true, antialias: true }} style={{ background: "transparent" }}>
        <ambientLight intensity={0.75} color="#e8e0ff" />
        <directionalLight position={[2, 3, 3]} intensity={1.5} color="#ffe2c0" />
        <directionalLight position={[-2.5, -1, 1.5]} intensity={0.5} color="#8fd8ff" />
        <Suspense fallback={null}>
          <Geode geode={geode} seam={seam} turn={turn} spin={spin} keys={keys} onFacing={onFacing} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function Geode({ geode, seam, turn, spin, keys, onFacing }: { geode: GeodeId; seam: Vec3; turn: React.MutableRefObject<Turn>; spin: React.MutableRefObject<{ x: number; y: number }>; keys: React.MutableRefObject<Set<string>>; onFacing: (view: Vec3) => void }) {
  const geo = useMemo(() => geodeGeometry(geode), [geode]);
  const mat = useMemo(() => geodeMaterial(geode, seam), [geode, seam]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat]
  );
  const ref = useRef<THREE.Mesh>(null);
  const s = useMemo(() => new THREE.Vector3(...seam).normalize(), [seam]);
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), inv: new THREE.Quaternion() }), []);
  useFrame((state, dt) => {
    const k = keys.current;
    const rate = 1.8 * dt;
    if (k.has("ArrowLeft")) spin.current.y -= rate;
    if (k.has("ArrowRight")) spin.current.y += rate;
    if (k.has("ArrowUp")) spin.current.x -= rate;
    if (k.has("ArrowDown")) spin.current.x += rate;
    // the drag's turn, about the screen's own axes
    if (spin.current.x || spin.current.y) {
      tmp.q.setFromEuler(tmp.e.set(spin.current.x, spin.current.y, 0));
      turn.current.q.premultiply(tmp.q);
      spin.current.x = 0;
      spin.current.y = 0;
    }
    // how squarely the seam faces you: the view in the geode's own axes
    tmp.inv.copy(turn.current.q).invert();
    tmp.v.copy(VIEW).applyQuaternion(tmp.inv);
    turn.current.facing = tmp.v.dot(s);
    GLOW.value = 0.6 + 2.2 * THREE.MathUtils.smoothstep(turn.current.facing, 0.3, 0.95) + 0.25 * Math.sin(state.clock.elapsedTime * 3);
    if (ref.current) {
      ref.current.quaternion.copy(turn.current.q);
      ref.current.position.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.03;
    }
    onFacing([tmp.v.x, tmp.v.y, tmp.v.z]);
  });
  return <mesh ref={ref} geometry={geo} material={mat} />;
}
const GLOW = { value: 0.5 };

/** How near the seam is to facing you: a warmer, fuller bar as it comes round. */
function SeamMeter({ turn, seam }: { turn: React.MutableRefObject<Turn>; seam: Vec3 }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const f = THREE.MathUtils.clamp((turn.current.facing + 1) / 2, 0, 1);
      if (bar.current) bar.current.style.width = `${(f * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [turn, seam]);
  return (
    <div className="w-full">
      <div className="mb-0.5 flex justify-between text-[10.5px] opacity-75">
        <span>the seam: hidden</span>
        <span>facing you</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div ref={bar} className="h-full rounded-full bg-gradient-to-r from-slate-400 via-cyan-300 to-cyan-100" />
      </div>
    </div>
  );
}

/** The mallet's power gauge: sweeping 0 to 100% and back on the server's clock, its bands laid out
 *  (the bite, the gold, the pulverizing top). */
function PowerGauge({ geode, since, raised }: { geode: GeodeId; since: React.MutableRefObject<number>; raised: boolean }) {
  const marker = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = chiselGauge(geode, (performance.now() - since.current) / 1000);
      if (marker.current) marker.current.style.left = `${(v * 100).toFixed(2)}%`;
      if (label.current) label.current.textContent = `${Math.round(v * 100)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [geode, since]);
  const pct = (v: number) => `${v * 100}%`;
  return (
    <div className="w-full">
      <div className="mb-0.5 flex justify-between text-[10.5px] opacity-80">
        <span>🔨 power</span>
        <span ref={label} className="font-bold tabular-nums" />
      </div>
      <div className={`relative h-7 overflow-hidden rounded-xl border ${raised ? "border-amber-200/70" : "border-white/15"} bg-black/30`}>
        <div className="absolute inset-y-0 left-0 bg-slate-500/35" style={{ width: pct(CHISEL_BITE) }} />
        <div className="absolute inset-y-0 bg-amber-500/30" style={{ left: pct(CHISEL_BITE), width: pct(CHISEL_SWEET[0] - CHISEL_BITE) }} />
        <div className="absolute inset-y-0 bg-gradient-to-r from-yellow-300/80 to-amber-300/80" style={{ left: pct(CHISEL_SWEET[0]), width: pct(CHISEL_SWEET[1] - CHISEL_SWEET[0]) }} />
        <div className="absolute inset-y-0 bg-amber-500/30" style={{ left: pct(CHISEL_SWEET[1]), width: pct(CHISEL_PULVERIZE - CHISEL_SWEET[1]) }} />
        <div className="absolute inset-y-0 right-0 bg-rose-500/45" style={{ left: pct(CHISEL_PULVERIZE) }} />
        <div ref={marker} className="absolute inset-y-[-2px] w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_#fff]" />
      </div>
      <div className="relative mt-0.5 h-3 text-[9.5px] opacity-70">
        <span className="absolute -translate-x-1/2" style={{ left: pct(CHISEL_BITE / 2) }}>
          rings off
        </span>
        <span className="absolute -translate-x-1/2 font-bold text-yellow-200" style={{ left: pct((CHISEL_SWEET[0] + CHISEL_SWEET[1]) / 2) }}>
          perfect
        </span>
        <span className="absolute -translate-x-1/2 text-rose-200" style={{ left: pct((CHISEL_PULVERIZE + 1) / 2) }}>
          dust
        </span>
      </div>
    </div>
  );
}

/** The geode fallen open (its gem glowing in the halves), or crumbled to dust. */
function Reveal({ geode, result, onAgain }: { geode: GeodeId | null; result: GeodeResult; onAgain: () => void }) {
  const gem = result.gem ?? null;
  const R = 92;
  const C = 110;
  const rock = geode === "pristine_geode" ? ["#d9d0ff", "#6a5a9a"] : ["#a8988a", "#5a4a40"];
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <svg viewBox={`0 0 ${C * 2} ${C * 2}`} className="aspect-square w-full max-w-[220px]" role="img" aria-label="The geode, cleaved">
        <defs>
          <radialGradient id="geodeRind" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor={rock[0]} />
            <stop offset="100%" stopColor={rock[1]} />
          </radialGradient>
          <radialGradient id="geodeCore" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={gem ? ORE_ITEMS[gem].color : "#d8cfc4"} stopOpacity="0.95" />
            <stop offset="100%" stopColor="#2a1d3a" stopOpacity="0.95" />
          </radialGradient>
        </defs>
        {result.verdict === "pulverize" ? (
          <g>
            {[...Array(16)].map((_, k) => (
              <circle key={k} cx={C + Math.cos(k * 2.4) * (20 + (k % 5) * 14)} cy={C + 20 + Math.sin(k * 1.9) * (10 + (k % 4) * 8)} r={10 + (k % 3) * 6} fill="#cbbfb2" opacity={0.25 + (k % 3) * 0.12} />
            ))}
            <text x={C} y={C + 20} textAnchor="middle" fontSize="54">
              🌫️
            </text>
          </g>
        ) : (
          <g>
            <g transform={`translate(-22 6) rotate(-10 ${C} ${C})`}>
              <path d={`M ${C - R} ${C} A ${R} ${R} 0 0 1 ${C} ${C - R} L ${C} ${C + R} A ${R} ${R} 0 0 1 ${C - R} ${C}`} fill="url(#geodeRind)" stroke="#2a211c" strokeWidth="3" />
              <circle cx={C - 8} cy={C} r={R * 0.62} fill="url(#geodeCore)" />
            </g>
            <g transform={`translate(22 6) rotate(10 ${C} ${C})`}>
              <path d={`M ${C + R} ${C} A ${R} ${R} 0 0 0 ${C} ${C - R} L ${C} ${C + R} A ${R} ${R} 0 0 0 ${C + R} ${C}`} fill="url(#geodeRind)" stroke="#2a211c" strokeWidth="3" />
              <circle cx={C + 8} cy={C} r={R * 0.62} fill="url(#geodeCore)" />
            </g>
            <text x={C} y={C + 18} textAnchor="middle" fontSize="58" style={{ filter: `drop-shadow(0 0 12px ${gem ? ORE_ITEMS[gem].color : "#fff"})` }}>
              {gem ? ORE_ITEMS[gem].emoji : ""}
            </text>
          </g>
        )}
      </svg>
      {result.verdict === "pulverize" ? (
        <>
          <b className="text-lg text-rose-100">Pulverized!</b>
          <span className="text-center text-[12px] opacity-80">
            Too hard a blow ({Math.round(result.v * 100)}%): the core crumbled into {result.dust ?? 0} Fine Stone Dust 🌫️ (Gus buys it; the forge's relics and Miner's Stout take it)
          </span>
        </>
      ) : (
        gem && (
          <>
            <b className="text-lg text-[#F7EBE1]">
              {result.verdict === "perfect" ? "✨ A perfect cleavage! " : ""}
              {ORE_ITEMS[gem].name}!
            </b>
            <span className="text-center text-[12px] opacity-80">
              Worth about {ORE_ITEMS[gem].price.toLocaleString("en-US")} 🪙 to Gus · the blow at {Math.round(result.v * 100)}%{result.verdict === "rough" ? " (a rough cleave: 65-80% keeps the finer gems' odds whole)" : ""}
            </span>
          </>
        )
      )}
      <button type="button" className="clay-btn clay-btn-amber mt-1 min-h-11 px-4 text-sm" onClick={onAgain}>
        🔨 Cleave another
      </button>
    </div>
  );
}

function OddsTable({ odds, label }: { odds: Record<GemId, number>; label: string }) {
  return (
    <div className="w-full rounded-2xl bg-black/20 px-3 py-2 text-[11.5px]">
      <div className="mb-1 opacity-70">{label}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {GEM_IDS.map((g) => (
          <span key={g} className="flex items-center justify-between gap-2">
            <span>
              {ORE_ITEMS[g].emoji} {ORE_ITEMS[g].name}
            </span>
            <b className="tabular-nums">{(odds[g] * 100).toFixed(odds[g] < 0.1 ? 1 : 0)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}
