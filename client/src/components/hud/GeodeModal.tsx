import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CAVERNS_CHANNELS, CHISEL_BITE, CHISEL_PULVERIZE, CHISEL_SWEET, GEM_IDS, ORE_ITEMS, SEAM_FACE_DEG, chiselGauge, geodeOdds, seamFaces, type CavernsResult, type GemId, type GeodeAim, type GeodeId, type GeodeResult, type GeodeStart, type Vec3 } from "@shared/caverns_mining";
import { satchelCount } from "@shared/satchel";
import type { FishingProfile } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playCaveSfx } from "../../audio/cavernAmbience";
import { playPing, playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { GradeStars, WorkSheet } from "./WorkSheet";
import { flyToBag } from "./flyToBag";
import { hasPlayed, markPlayed, tipDue, tipMastered, tipSeen } from "./firstTips";
import { activity, nowS } from "../../systems/activityStore";
import { ANVIL_SPOT, frameWork } from "../../scene/workSpots";

// The Precision Geode Chisel, on the meteorite anvil beside the forge (shared/caverns_mining.ts). A
// geode is picked in the panel; the cleave itself happens at the anvil, the camera on it
// (scene/workSpots.ts) and a sheet at the foot of the screen (WorkSheet):
//
//   the seam     the geode turns in your hands (a drag, a swipe, or the arrow keys: its canvas takes
//                no scrolling and no text selection), warmer and warmer as its crystal seam comes
//                round toward you: the seam's glow goes from ice to gold, the stage glows with it and
//                a crystal ping rises in pitch and quickens; faced within SEAM_FACE_DEG, a chime and
//                the chisel is set (the server's word: GeodeAim)
//   the mallet   the mallet's swing over the geode, sweeping 0 to 100% and back; hold the mallet
//                (or Space) and let go in the gold: 65-80% a perfect cleavage (the finer gems' odds
//                whole), under 40% the chisel rings off (again), over 85% the core is pulverized into
//                Fine Stone Dust, anywhere between a rough cleave (the finer gems' odds shaved)
//   the reveal   the geode shakes, splits and falls open on its crystal heart, the gem bursting out
//                on rays in its rarity's colour, graded in stars (perfect 3, rough 2, dust 1), and
//                flown into the satchel; another by hand, or a quick crack
//   quick crack  once one has been cleaved by hand: one blow, no game, always a rough cleave
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
const GEODES: GeodeId[] = ["mystery_geode", "pristine_geode"];

/** Each gem's rarity, as the reveal names and colours it (its burst of rays the fuller the rarer). */
const GEM_RARITY: Record<GemId, { label: string; color: string; rays: number }> = {
  amethyst: { label: "Common", color: "#c7a6f5", rays: 8 },
  topaz: { label: "Uncommon", color: "#f7cf5e", rays: 10 },
  opal: { label: "Rare", color: "#8ff2e4", rays: 14 },
  star_shard: { label: "Legendary", color: "#fff0a0", rays: 18 },
};

/** Keeps a press's pointer on its element (a drag off the geode, a finger off the mallet button). */
function capture(e: React.PointerEvent<Element>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // (a pointer the browser no longer tracks)
  }
}

/** The geode's turn in your hands, shared between the canvas and the sheet (no React state: a frame's). */
interface Turn {
  q: THREE.Quaternion;
  /** How squarely the seam faces you (its cosine against the view). */
  facing: number;
}

/** How warm the seam is: 0 turned right away from you, 1 facing you (the chisel sets); every turn
 *  toward it warmer, from the far side too (eased: the last stretch counts most). */
const FACE_COS = Math.cos((SEAM_FACE_DEG * Math.PI) / 180);
const warmthOf = (facing: number) => THREE.MathUtils.clamp((facing + 1) / (FACE_COS + 1), 0, 1) ** 1.4;

export function GeodeModal({ profile, send, subscribeMessages, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [geode, setGeode] = useState<GeodeId | null>(null);
  const [seam, setSeam] = useState<Vec3 | null>(null);
  const [result, setResult] = useState<GeodeResult | null>(null);
  const [reveals, setReveals] = useState(0);
  const [bounces, setBounces] = useState(0);
  const [notice, setNotice] = useState("");
  const [raised, setRaised] = useState(false);
  const [known, setKnown] = useState(() => hasPlayed("geode"));
  const [tip, setTip] = useState(false);
  const [busy, setBusy] = useState(false);
  const gaugeAt = useRef(0);
  const turn = useRef<Turn>({ q: new THREE.Quaternion(), facing: -1 });
  const stage = useRef<HTMLDivElement>(null);
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
          turn.current.facing = -1;
          const due = tipDue("geode");
          setTip(due);
          if (due) tipSeen("geode");
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
          if (r.geode) setGeode(r.geode);
          setBusy(false);
          setResult(r);
          setReveals((n) => n + 1);
          setPhase("done");
          if (!r.quick) {
            markPlayed("geode");
            setKnown(true);
          }
          if (r.verdict === "perfect") {
            tipMastered("geode");
            setTip(false);
          }
          if (r.verdict === "pulverize") {
            playCaveSfx("shatter", 0.9);
          } else {
            playCaveSfx("crack", 1);
            if (r.gem) window.setTimeout(() => playSfx(r.gem === "star_shard" || r.gem === "opal" ? "jackpot" : "chime"), 350);
          }
        } else if (type === "cavernsResult") {
          const r = payload as CavernsResult;
          if (!r.ok) {
            setNotice(r.message);
            setBusy(false);
          }
        }
      }),
    [subscribeMessages]
  );
  // the camera on the anvil while a geode is on it (the pick is a panel of its own)
  const atWork = phase !== "pick";
  useEffect(() => frameWork(atWork ? ANVIL_SPOT : null), [atWork]);
  useEffect(() => () => frameWork(null), []);
  // your avatar at the anvil (entities/activityAnimations.ts): both hands turning the geode while
  // you look for the seam, then the chisel set and the mallet drawn back as the power builds, and
  // the blow seen through as it falls (a quick crack's too)
  useEffect(() => {
    activity.geode = phase === "seam" ? "aim" : "gauge";
    if (phase !== "mallet" || !geode) {
      activity.power = 0;
      return;
    }
    let raf = 0;
    const tick = () => {
      activity.power = raised ? chiselGauge(geode, (performance.now() - gaugeAt.current) / 1000) : 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, raised, geode]);
  useEffect(
    () => () => {
      activity.geode = null;
      activity.power = 0;
    },
    []
  );
  // stepping away mid-cleave (the panel closed): the geode stays whole in the satchel
  useEffect(
    () => () => {
      const { phase: p, send: s } = live.current;
      if (p === "seam" || p === "mallet") s(CAVERNS_CHANNELS.geode, { op: "cancel" });
    },
    []
  );
  // the gem (or the dust) flown into the satchel once it has burst out
  useEffect(() => {
    if (!result || !reveals) return;
    const what = result.verdict === "pulverize" ? "🌫️" : result.gem ? ORE_ITEMS[result.gem].emoji : "";
    if (what) flyToBag(what, stage.current, 1, 900);
  }, [reveals, result]);

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
    activity.chiselAt = nowS();
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

  const start = (id: GeodeId) => {
    setNotice("");
    send(CAVERNS_CHANNELS.geode, { op: "start", geode: id });
  };
  // one blow, no game (the answer comes back as a reveal; a refusal or a silence frees the button)
  const quick = (id: GeodeId) => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    window.setTimeout(() => setBusy(false), 1500);
    activity.geode = "gauge";
    activity.chiselAt = nowS();
    playCaveSfx("anvil", 0.9);
    send(CAVERNS_CHANNELS.geode, { op: "quick", geode: id });
  };
  const back = () => {
    setPhase("pick");
    setSeam(null);
    setResult(null);
  };
  const count = (id: GeodeId) => satchelCount(profile, id);
  const next = geode && count(geode) > 0 ? geode : (GEODES.find((id) => count(id) > 0) ?? null);

  if (phase === "pick") {
    const none = GEODES.every((id) => count(id) < 1);
    return (
      <Modal title="The Geode Anvil" icon="🔨" onClose={onClose} width={460}>
        <div className="flex flex-col items-center gap-2 pb-1">
          <p className="m-0 text-center text-[12px] opacity-80">Set a geode on the meteorite anvil and turn it till its crystal seam faces you (it glows warmer as it comes round), then one mallet blow: 65-80% power for a perfect cleavage.</p>
          <div className="grid w-full grid-cols-2 gap-1.5">
            {GEODES.map((id) => {
              const n = count(id);
              return (
                <div key={id} className="flex flex-col gap-1">
                  <button type="button" className="clay-btn clay-btn-amber flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 leading-tight" disabled={n < 1} onClick={() => start(id)}>
                    <span className="text-2xl">{ORE_ITEMS[id].emoji}</span>
                    <span className="text-[12px]">
                      {ORE_ITEMS[id].name} ×{n}
                    </span>
                  </button>
                  {known && (
                    <button type="button" className="clay-btn clay-btn-ghost min-h-11 px-2 text-[12px] font-bold" disabled={n < 1 || busy} onClick={() => quick(id)} title="One blow, no game: always a rough cleave, never dust">
                      ⚡ Quick crack
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="m-0 text-center text-[11px] opacity-70">{none ? "No geodes yet: iron lodes and the glimmer cluster crack them loose now and then, and the Titan Monolith always." : known ? "⚡ Quick crack: one blow and no game, always a rough cleave (never dust)." : "Cleave one by hand and ⚡ Quick crack opens: one blow, no game."}</p>
          <OddsTable geode="mystery_geode" />
          <OddsTable geode="pristine_geode" />
          {notice && <p className="m-0 text-center text-[12px] font-semibold text-rose-200">{notice}</p>}
        </div>
      </Modal>
    );
  }

  return (
    <WorkSheet title="The Geode Anvil" icon="🔨" onClose={onClose}>
      <div className="flex items-center gap-3">
        <div ref={stage} className="relative size-[clamp(128px,34vmin,176px)] shrink-0 overflow-hidden rounded-3xl bg-gradient-to-b from-[#2a2233] to-[#16121c]" style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}>
          {phase === "done" && result ? (
            <Reveal key={reveals} geode={geode} result={result} />
          ) : (
            geode &&
            seam && (
              <>
                <GeodeStage geode={geode} seam={seam} turn={turn} canTurn={phase === "seam"} onFacing={onFacing} />
                {phase === "mallet" && <SwingArc geode={geode} since={gaugeAt} raised={raised} />}
              </>
            )
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          {phase === "seam" && seam && (
            <>
              <p className="m-0 text-center text-[12px] leading-snug opacity-90">
                <span className="kbd-hint">Drag the geode (or the arrow keys)</span>
                <span className="touch-hint">Swipe the geode</span> to turn it: the seam glows <b className="text-amber-200">warmer</b> as it comes round to face you
              </p>
              <SeamMeter turn={turn} stage={stage} />
            </>
          )}
          {phase === "mallet" && (
            <>
              <p className="m-0 text-center text-[12px] leading-snug opacity-90">
                🔔 The chisel is set. <span className="kbd-hint">Hold Space or</span> hold the mallet, let go in the <b className="text-yellow-200">gold</b>
              </p>
              <button
                type="button"
                aria-label={raised ? "Let go of the mallet" : "Raise the mallet"}
                className={`grid size-[clamp(76px,20vmin,96px)] select-none place-items-center rounded-full border-4 transition-transform ${raised ? "scale-95 border-amber-200 bg-gradient-to-b from-amber-300 to-orange-600 shadow-[0_0_30px_rgba(255,190,90,0.8)]" : "border-amber-300/70 bg-gradient-to-b from-stone-300 to-stone-600 shadow-[0_6px_18px_rgba(0,0,0,0.5)]"}`}
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  capture(e);
                  setRaised(true);
                }}
                onPointerUp={release}
                onPointerCancel={() => setRaised(false)}
              >
                <span style={{ fontSize: 40, lineHeight: 1, transform: raised ? "rotate(-35deg)" : undefined, transition: "transform 120ms" }}>🔨</span>
              </button>
              <span className="text-center text-[11px] opacity-75">{bounces > 0 ? `It rang off the shell: more power (${Math.round(CHISEL_BITE * 100)}% at least)` : raised ? "…let go in the gold!" : "Hold, then let go"}</span>
            </>
          )}
          {phase === "done" && result && (
            <ResultText
              result={result}
              next={next}
              left={next ? count(next) : 0}
              known={known}
              busy={busy}
              onHand={() => next && start(next)}
              onQuick={() => next && quick(next)}
              onBack={back}
            />
          )}
        </div>
      </div>
      {tip && phase !== "done" && <p className="m-0 rounded-xl bg-black/25 px-3 py-1.5 text-center text-[12px] text-amber-100">Tip: the pings rise as the seam comes round. Then hold the mallet and let go as the swing crosses the gold (65-80%) for a perfect cleavage and the finer gems.</p>}
      {notice && <p className="m-0 text-center text-[12px] font-semibold text-rose-200">{notice}</p>}
    </WorkSheet>
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
 *  round it and a glowing line in it, brighter and warmer (ice to gold) the more it faces you. */
function geodeMaterial(geode: GeodeId, seam: Vec3): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true });
  const f = seamFrame(seam);
  const glow = new THREE.Color(geode === "pristine_geode" ? "#c9b8ff" : "#8fdcff");
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSeamGlow: GLOW, uSeamWarm: WARM, uSeamDir: { value: f.dir }, uSeamT: { value: f.tangent }, uSeamN: { value: f.normal }, uSeamCol: { value: glow }, uSeamHot: { value: new THREE.Color("#ffc862") } });
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aDir;\nvarying vec3 vDir;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvDir = aDir;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uSeamGlow;
        uniform float uSeamWarm;
        uniform vec3 uSeamDir;
        uniform vec3 uSeamT;
        uniform vec3 uSeamN;
        uniform vec3 uSeamCol;
        uniform vec3 uSeamHot;
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
        {
          float line = (1.0 - smoothstep(0.006, 0.026, seamOff)) * smoothstep(0.3, 0.75, seamAlong);
          float halo = (1.0 - smoothstep(0.02, 0.12, seamOff)) * smoothstep(0.35, 0.8, seamAlong) * 0.35 * uSeamWarm;
          totalEmissiveRadiance += mix(uSeamCol, uSeamHot, uSeamWarm) * (line + halo) * uSeamGlow;
        }`
      );
  };
  m.customProgramCacheKey = () => "geode-seam-warm";
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
        spin.current.y += (e.clientX - d.x) * 0.014;
        spin.current.x += (e.clientY - d.y) * 0.014;
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
    const w = warmthOf(turn.current.facing);
    WARM.value = w;
    GLOW.value = 0.6 + 2.4 * THREE.MathUtils.smoothstep(w, 0.35, 1) + 0.25 * Math.sin(state.clock.elapsedTime * (3 + 5 * w));
    if (ref.current) {
      ref.current.quaternion.copy(turn.current.q);
      ref.current.position.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.03;
    }
    onFacing([tmp.v.x, tmp.v.y, tmp.v.z]);
  });
  return <mesh ref={ref} geometry={geo} material={mat} />;
}
const GLOW = { value: 0.5 };
const WARM = { value: 0 };

/** Warmer or colder: a thermometer from ice to gold as the seam comes round, the stage behind the
 *  geode glowing with it, and a crystal ping that rises in pitch and quickens while you turn it. */
function SeamMeter({ turn, stage }: { turn: React.MutableRefObject<Turn>; stage: React.RefObject<HTMLDivElement | null> }) {
  const bar = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let pingAt = 0;
    let last = turn.current.facing;
    let movedAt = 0;
    const tick = () => {
      const now = performance.now();
      const w = warmthOf(turn.current.facing);
      if (Math.abs(turn.current.facing - last) > 0.002) movedAt = now;
      last = turn.current.facing;
      if (bar.current) {
        bar.current.style.width = `${(4 + w * 96).toFixed(1)}%`;
        bar.current.style.background = `linear-gradient(90deg, #7fb6ff, ${w > 0.5 ? "#ffd27a" : "#9fdcff"} ${Math.round(100 - w * 40)}%, ${w > 0.8 ? "#fff3c0" : w > 0.5 ? "#ffb347" : "#bfe8ff"})`;
      }
      if (word.current) word.current.textContent = w >= 0.99 ? "✨ Found!" : w > 0.8 ? "🔥 Hot!" : w > 0.55 ? "☀️ Warmer" : w > 0.3 ? "🌤️ Warm" : "🧊 Cold";
      if (stage.current) stage.current.style.boxShadow = `inset 0 0 ${Math.round(18 + 30 * w)}px rgba(255, ${Math.round(150 + 60 * w)}, ${Math.round(210 - 150 * w)}, ${(0.12 + 0.5 * w * w).toFixed(2)})`;
      // the ping, only while the geode is being turned (a held one is quiet)
      if (w < 0.99 && now - movedAt < 220 && now - pingAt > 520 - 400 * w) {
        pingAt = now;
        playPing(w, 0.55);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const st = stage.current;
    return () => {
      cancelAnimationFrame(raf);
      if (st) st.style.boxShadow = "";
    };
  }, [turn, stage]);
  return (
    <div className="w-full">
      <div className="mb-0.5 flex justify-between text-[11px]">
        <span className="opacity-70">the seam</span>
        <span ref={word} className="font-bold text-amber-100" />
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-black/35 outline outline-1 -outline-offset-1 outline-white/10">
        <div ref={bar} className="h-full rounded-full" />
      </div>
    </div>
  );
}

const SWING = { cx: 100, cy: 104, R: 90 };
/** A point on the swing's arc (0 rest, on the left; 1 a full swing, on the right), and its heading. */
function swingAt(v: number) {
  const a = Math.PI - Math.max(0, Math.min(1, v)) * Math.PI;
  return { x: SWING.cx + SWING.R * Math.cos(a), y: SWING.cy - SWING.R * Math.sin(a), deg: 90 - (a * 180) / Math.PI };
}
function swingArc(from: number, to: number) {
  const a = swingAt(from);
  const b = swingAt(to);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${SWING.R} ${SWING.R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** The mallet's swing over the geode: an arc from rest (left) over the top to a full swing (right),
 *  sweeping on the server's clock, its bands laid out (rings off, the gold, the pulverizing end),
 *  the mallet riding it. */
function SwingArc({ geode, since, raised }: { geode: GeodeId; since: React.MutableRefObject<number>; raised: boolean }) {
  const mallet = useRef<SVGGElement>(null);
  const gold = useRef<SVGPathElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = chiselGauge(geode, (performance.now() - since.current) / 1000);
      const p = swingAt(v);
      mallet.current?.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.deg.toFixed(1)})`);
      const inGold = v >= CHISEL_SWEET[0] && v <= CHISEL_SWEET[1];
      if (gold.current) gold.current.style.filter = inGold ? "drop-shadow(0 0 6px #ffe28a)" : "";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [geode, since]);
  return (
    <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      <path d={swingArc(0, CHISEL_BITE)} fill="none" stroke="#94a3b8" strokeOpacity="0.45" strokeWidth="9" />
      <path d={swingArc(CHISEL_BITE, CHISEL_SWEET[0])} fill="none" stroke="#f59e0b" strokeOpacity="0.45" strokeWidth="9" />
      <path ref={gold} d={swingArc(CHISEL_SWEET[0], CHISEL_SWEET[1])} fill="none" stroke="#ffe28a" strokeWidth="12" />
      <path d={swingArc(CHISEL_SWEET[1], CHISEL_PULVERIZE)} fill="none" stroke="#f59e0b" strokeOpacity="0.45" strokeWidth="9" />
      <path d={swingArc(CHISEL_PULVERIZE, 1)} fill="none" stroke="#f43f5e" strokeOpacity="0.7" strokeWidth="9" />
      <g ref={mallet}>
        <circle r={raised ? 15 : 12} fill={raised ? "#ffcf7a" : "#e7e5e4"} stroke="#2a1a12" strokeWidth="2.5" style={{ filter: raised ? "drop-shadow(0 0 6px #ffb347)" : undefined }} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={raised ? 17 : 14}>
          🔨
        </text>
      </g>
    </svg>
  );
}

// --- the reveal ------------------------------------------------------------------------------------------

/** One half of a geode's outline, split down a jagged line (the halves share it: they fit). */
function halfPath(C: number, R: number, side: -1 | 1): string {
  const zig = Array.from({ length: 9 }, (_, i) => {
    const y = C + R - (i * 2 * R) / 8;
    return `L ${(C + (i % 2 ? 4 : -3)).toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return `M ${C} ${C - R} A ${R} ${R} 0 0 ${side < 0 ? 0 : 1} ${C} ${C + R} ${zig} Z`;
}

/** Crystal teeth round a half's hollow, pointing in. */
function teeth(C: number, r: number, side: -1 | 1, color: string) {
  return Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI / 2 + ((i + 0.5) / 9) * Math.PI;
    const s = side < 0 ? 1 : -1;
    const ax = C + s * Math.cos(a) * r;
    const ay = C - Math.sin(a) * r;
    const w = 0.16;
    const bx = C + s * Math.cos(a - w) * r;
    const by = C - Math.sin(a - w) * r;
    const tx = C + s * Math.cos(a + w * 0.2) * r * 0.72;
    const ty = C - Math.sin(a + w * 0.2) * r * 0.72;
    return <path key={i} d={`M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} Z`} fill={i % 2 ? color : "#ffffff"} opacity={i % 2 ? 0.85 : 0.7} />;
  });
}

/** The geode shaking, splitting and falling open on its crystal heart, the gem bursting out on rays
 *  in its rarity's colour (index.css `geode-*`); or crumbling into a cloud of dust. */
function Reveal({ geode, result }: { geode: GeodeId | null; result: GeodeResult }) {
  const id = useId().replace(/:/g, "");
  const gem = result.gem ?? null;
  const C = 100;
  const R = 62;
  const rock = geode === "pristine_geode" ? ["#d9d0ff", "#6a5a9a"] : ["#a8988a", "#5a4a40"];
  const rarity = gem ? GEM_RARITY[gem] : null;
  if (result.verdict === "pulverize") {
    return (
      <div className="relative size-full" role="img" aria-label="The geode crumbled to dust">
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
          <defs>
            <radialGradient id={`${id}rind`} cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor={rock[0]} />
              <stop offset="100%" stopColor={rock[1]} />
            </radialGradient>
          </defs>
          {[...Array(14)].map((_, k) => (
            <circle key={k} className="geode-dust" style={{ transformOrigin: "100px 118px", animationDelay: `${0.05 * (k % 5)}s` }} cx={C + Math.cos(k * 2.4) * (18 + (k % 5) * 13)} cy={C + 18 + Math.sin(k * 1.9) * (8 + (k % 4) * 7)} r={10 + (k % 3) * 6} fill="#cbbfb2" opacity={0.3 + (k % 3) * 0.12} />
          ))}
          <circle className="geode-crumble" style={{ transformOrigin: "100px 100px" }} cx={C} cy={C} r={R} fill={`url(#${id}rind)`} stroke="#2a211c" strokeWidth="3" />
        </svg>
        <div className="geode-gem absolute inset-0 grid place-items-center" style={{ fontSize: 50 }}>
          🌫️
        </div>
      </div>
    );
  }
  return (
    <div className="relative size-full" role="img" aria-label={gem ? `The geode split open: ${ORE_ITEMS[gem].name}` : "The geode split open"}>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        <defs>
          <radialGradient id={`${id}rind`} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor={rock[0]} />
            <stop offset="100%" stopColor={rock[1]} />
          </radialGradient>
          <radialGradient id={`${id}core`} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={gem ? ORE_ITEMS[gem].color : "#d8cfc4"} stopOpacity="0.95" />
            <stop offset="100%" stopColor="#2a1d3a" stopOpacity="0.95" />
          </radialGradient>
        </defs>
        {rarity && (
          <g className="geode-rays" style={{ transformOrigin: "100px 100px" }}>
            {Array.from({ length: rarity.rays }, (_, k) => {
              const a = (k / rarity.rays) * Math.PI * 2;
              const long = k % 2 ? 0.8 : 1;
              return <line key={k} x1={C + Math.cos(a) * 26} y1={C + Math.sin(a) * 26} x2={C + Math.cos(a) * 98 * long} y2={C + Math.sin(a) * 98 * long} stroke={rarity.color} strokeWidth={k % 2 ? 3 : 6} strokeLinecap="round" opacity={0.7} />;
            })}
          </g>
        )}
        {([-1, 1] as const).map((side) => (
          <g key={side} className={side < 0 ? "geode-half-l" : "geode-half-r"} style={{ transformOrigin: "100px 150px" }}>
            <path d={halfPath(C, R, side)} fill={`url(#${id}rind)`} stroke="#2a211c" strokeWidth="3" />
            <g className="geode-inside">
              <path d={halfPath(C, R, side)} transform={`translate(${C} ${C}) scale(0.78) translate(${-C} ${-C})`} fill="#e9e1d6" opacity="0.55" />
              <path d={halfPath(C, R, side)} transform={`translate(${C} ${C}) scale(0.66) translate(${-C} ${-C})`} fill={`url(#${id}core)`} />
              {teeth(C, R * 0.66, side, rarity?.color ?? "#e8e0ff")}
            </g>
          </g>
        ))}
        <path className="geode-crack" d={`M ${C} ${C - R} ${Array.from({ length: 9 }, (_, i) => `L ${C + (i % 2 ? 4 : -3)} ${C - R + (i * 2 * R) / 8}`).join(" ")}`} fill="none" stroke={rarity?.color ?? "#fff"} strokeWidth="4" style={{ filter: `drop-shadow(0 0 6px ${rarity?.color ?? "#fff"})` }} />
      </svg>
      {gem && (
        <div className="geode-gem absolute inset-0 grid place-items-center" style={{ fontSize: "clamp(40px, 12vmin, 58px)", filter: `drop-shadow(0 0 14px ${ORE_ITEMS[gem].color})` }}>
          {ORE_ITEMS[gem].emoji}
        </div>
      )}
      {(gem === "opal" || gem === "star_shard") && (
        <div className="cozy-sparkles absolute left-1/2 top-1/2">
          {[-46, -20, 8, 34, 52].map((sx, k) => (
            <span key={k} style={{ ["--sx" as string]: `${sx}px`, animationDelay: `${0.45 + k * 0.12}s` }}>
              ✨
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** What came of the blow, graded like every result in the caverns (perfect 3, rough 2, dust 1), and
 *  what next: another by hand, a quick crack, or back to the geodes. */
function ResultText({ result, next, left, known, busy, onHand, onQuick, onBack }: { result: GeodeResult; next: GeodeId | null; left: number; known: boolean; busy: boolean; onHand: () => void; onQuick: () => void; onBack: () => void }) {
  const gem = result.gem ?? null;
  const stars = result.verdict === "perfect" ? 3 : result.verdict === "rough" ? 2 : 1;
  const rarity = gem ? GEM_RARITY[gem] : null;
  return (
    <div className="flex w-full flex-col items-center gap-1 text-center">
      <GradeStars n={stars} />
      <b className="text-[14px] leading-tight text-[#F7EBE1]">{result.verdict === "pulverize" ? "Pulverized!" : result.quick ? "⚡ Quick crack" : result.verdict === "perfect" ? "✨ A perfect cleavage!" : "A rough cleave"}</b>
      {gem && rarity ? (
        <span className="text-[12.5px]">
          {ORE_ITEMS[gem].emoji} <b>{ORE_ITEMS[gem].name}</b>{" "}
          <span className="rounded-full px-1.5 py-px text-[10.5px] font-extrabold text-stone-900" style={{ background: rarity.color }}>
            {rarity.label}
          </span>
          <span className="block text-[11px] opacity-75">about {ORE_ITEMS[gem].price.toLocaleString("en-US")} 🪙 at Gus's</span>
        </span>
      ) : (
        <span className="text-[12px] opacity-85">Too hard a blow: {result.dust ?? 0} Fine Stone Dust 🌫️ (Gus buys it; the Miner's Stout takes it)</span>
      )}
      {!result.quick && <span className="text-[10.5px] opacity-60">the blow at {Math.round(result.v * 100)}%{result.verdict === "rough" ? " · 65-80% keeps the finer gems' odds whole" : ""}</span>}
      <div className="mt-0.5 flex w-full flex-wrap justify-center gap-1.5">
        <button type="button" className="clay-btn clay-btn-amber min-h-11 flex-1 px-3 text-[12.5px] font-bold" disabled={!next} onClick={onHand}>
          🔨 {next ? `${ORE_ITEMS[next].emoji} ×${left}` : "No geodes left"}
        </button>
        {known && next && (
          <button type="button" className="clay-btn clay-btn-ghost min-h-11 flex-1 px-3 text-[12.5px] font-bold" disabled={busy} onClick={onQuick}>
            ⚡ Quick
          </button>
        )}
      </div>
      <button type="button" className="text-[11.5px] font-semibold text-amber-200/90 underline-offset-2 hover:underline" onClick={onBack}>
        ↩ Choose a geode
      </button>
    </div>
  );
}

/** A geode's odds: a perfect cleavage's, and a rough one's (a quick crack's) beside them. */
function OddsTable({ geode }: { geode: GeodeId }) {
  const perfect = geodeOdds(geode, true);
  const rough = geodeOdds(geode, false);
  const pct = (v: number) => `${(v * 100).toFixed(v * 100 < 9.95 ? 1 : 0)}%`;
  return (
    <div className="w-full rounded-2xl bg-black/20 px-3 py-2 text-[11.5px]">
      <div className="mb-1 flex justify-between opacity-70">
        <span>
          {ORE_ITEMS[geode].emoji} {ORE_ITEMS[geode].name}
        </span>
        <span>perfect · rough</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {GEM_IDS.map((g) => (
          <span key={g} className="flex items-center justify-between gap-2">
            <span>
              {ORE_ITEMS[g].emoji} {ORE_ITEMS[g].name}
            </span>
            <span className="tabular-nums">
              <b>{pct(perfect[g])}</b> <span className="opacity-55">{pct(rough[g])}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
