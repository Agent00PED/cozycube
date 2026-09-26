import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import { walkY } from "@shared/collision";
import { findPath, type Point } from "@shared/pathfinding";
import { CASINO_LAYOUT as L, PATRON_SPOTS, ROULETTE_CENTER } from "@shared/worlds/casino";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { cameraFocus } from "../scene/cameraFocus";
import { ModelBoundary } from "./ModelBoundary";

// The Velvet Casino's crowd: a dozen chibi regulars drifting through the hall, and Bella the
// cocktail bunny on her round between the tables with her brass tray, all drawn on this screen only
// (the server never hears of them; they walk through players as if they were not there, though never
// through the furniture: they path round it on the same grid players do).
//
// Four figures from patrons.glb (scripts/blender/build_casino_staff.py): an evening-gowned rabbit, a
// raccoon in a tailored suit, a chic feline in a cocktail dress and a pillbox hat, and Bella. Each is
// ONE instanced mesh (a draw call apiece, four for the whole crowd), rigged for a shader instead of
// bones: every vertex knows its limb (the model's u: body, right arm, left arm, right leg, left leg,
// tail) and whether it is clothing (v). The vertex shader swings each limb round its pivot from a
// per-patron walk (phase, stride), and a pose laid over it (a clap, a cheer, a sip); it tints each
// patron's clothes their own colour and their fur a shade of its own. The patron moves whole on the
// CPU: a bob of |sin(8t)| * 0.04 in its step, a sway, a turn toward where it goes.
//
// Each patron's evening, a little state machine over PATRON_SPOTS: in through the doors, to the
// slot row (watching, cheering a win), the bar (a sip now and then), the roulette table (clapping
// the number), now and then a detour by the lounge or the craps table, then out through the doors
// again; a while later, someone new comes in.

const URL = modelUrl("patrons.glb");
const KINDS = ["Rabbit", "Raccoon", "Feline"] as const;
type Kind = (typeof KINDS)[number];
const PER_KIND = 4;
const WALK_SPEED = 1.05;
const BELLA_SPEED = 0.9;
/** Outfit tints: gowns, suits, cocktail dresses. */
const OUTFITS: Record<Kind, string[]> = {
  Rabbit: ["#b3263e", "#2a4fa8", "#1f7a4f", "#e8d3a2", "#7b4ba8"],
  Raccoon: ["#3a3a46", "#22305a", "#5a2448", "#a8845a", "#2f4a3a"],
  Feline: ["#1c1c22", "#c2415b", "#2f6fb0", "#e0b44a", "#6b3aa8"],
};
/** Fur tints: gentle variations on the model's own colours. */
const FURS: Record<Kind, string[]> = {
  Rabbit: ["#ffffff", "#f3e6d4", "#d9c2a4", "#e6e6ec"],
  Raccoon: ["#ffffff", "#ece6dc", "#dcdce6", "#f2ebe0"],
  Feline: ["#ffffff", "#f7d8b0", "#dcdcdc", "#c9a07a"],
};

/** The poses laid over the walk (the shader's aWalk.z). */
const POSE = { none: 0, clap: 1, cheer: 2, sip: 3 } as const;
type Pose = keyof typeof POSE;
const POSE_S: Record<Pose, number> = { none: 0, clap: 1.8, cheer: 1.5, sip: 1.3 };

// --- the shader: the limbs round their pivots, the clothes tinted ------------------------------

const HEADER = /* glsl */ `
attribute vec2 aLimb;
attribute vec4 aWalk;
attribute vec3 aFur;
uniform float uTime;
uniform vec3 uPivot[5];
mat3 chRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 chRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 chRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
// arms hang down: x below 0 swings one forward; z toward the middle is +side (the right arm is on -x)
mat3 chLimb(float limb) {
  float ph = aWalk.x;
  float stride = aWalk.y;
  float pose = aWalk.z;
  float pw = aWalk.w;
  float sw = sin(uTime * 8.0 + ph);
  if (limb > 0.5 && limb < 2.5) {
    float side = limb < 1.5 ? 1.0 : -1.0;
    float ax = sw * 0.7 * stride * side;
    float az = 0.0;
    if (pose > 0.5 && pose < 1.5) {
      ax = mix(ax, -1.25, pw);
      az = mix(az, side * (0.3 + 0.28 * (0.5 + 0.5 * sin(uTime * 16.0 + ph))), pw);
    } else if (pose > 1.5 && pose < 2.5) {
      ax = mix(ax, -0.25, pw);
      az = mix(az, -side * (2.5 + 0.25 * sin(uTime * 11.0 + ph)), pw);
    } else if (pose > 2.5 && pose < 3.5 && side > 0.0) {
      ax = mix(ax, -2.05 + 0.08 * sin(uTime * 2.0 + ph), pw);
      az = mix(az, 0.5, pw);
    }
    return chRotX(ax) * chRotZ(az);
  }
  if (limb > 2.5 && limb < 4.5) {
    float side = limb < 3.5 ? 1.0 : -1.0;
    return chRotX(-sw * 0.6 * stride * side);
  }
  if (limb > 4.5) return chRotY(sin(uTime * 3.0 + ph) * 0.45);
  return mat3(1.0);
}
`;
const NORMAL = /* glsl */ `
float chId = floor(aLimb.x + 0.5);
mat3 chR = chLimb(chId);
vec3 chP = chId > 0.5 ? uPivot[int(chId) - 1] : vec3(0.0);
objectNormal = chR * objectNormal;
`;
const POSITION = /* glsl */ `
if (chId > 0.5) transformed = chP + chR * (transformed - chP);
`;
// (the model's colours carry an alpha, so vColor may be a vec4)
const COLOR = /* glsl */ `
#if defined( USE_COLOR_ALPHA )
vColor = vec4(1.0);
#else
vColor = vec3(1.0);
#endif
vColor *= color;
vColor.xyz *= mix(aFur, instanceColor.xyz, aLimb.y);
`;

const PIVOT_ORDER = ["armR", "armL", "legR", "legL", "tail"] as const;
const DEFAULT_PIVOTS: Record<(typeof PIVOT_ORDER)[number], number[]> = { armR: [-0.15, 0.5, 0], armL: [0.15, 0.5, 0], legR: [-0.075, 0.27, 0], legL: [0.075, 0.27, 0], tail: [0, 0.3, -0.12] };
const time = { value: 0 };

interface Figure {
  mesh: THREE.InstancedMesh;
  walk: THREE.InstancedBufferAttribute;
}

/** One figure from the model as an instanced mesh with the limb shader, `count` of it. */
function makeFigure(scene: THREE.Object3D, name: string, count: number): Figure {
  const node = scene.getObjectByName(name) as THREE.Mesh | undefined;
  const geo = node?.geometry?.clone() ?? new THREE.BoxGeometry(0.3, 1, 0.3).translate(0, 0.5, 0);
  // the model's UVs are the limb and the tint: renamed, so no texture code wants them
  const uv = geo.getAttribute("uv");
  if (uv) {
    geo.setAttribute("aLimb", uv);
    geo.deleteAttribute("uv");
  } else geo.setAttribute("aLimb", new THREE.BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
  if (!geo.getAttribute("color")) geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.getAttribute("position").count * 3).fill(0.8), 3));
  let pivots = DEFAULT_PIVOTS;
  try {
    const raw = node?.userData?.pivots;
    if (typeof raw === "string") pivots = { ...DEFAULT_PIVOTS, ...JSON.parse(raw) };
  } catch {
    // the defaults are the builder's own
  }
  const src = node?.material as THREE.MeshStandardMaterial | undefined;
  const mat = src ? src.clone() : new THREE.MeshStandardMaterial({ roughness: 0.8 });
  mat.vertexColors = true;
  const pivotUniform = { value: PIVOT_ORDER.map((k) => new THREE.Vector3(...(pivots[k] as [number, number, number]))) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uPivot = pivotUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${HEADER}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${NORMAL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${POSITION}`)
      .replace("#include <color_vertex>", COLOR);
  };
  mat.customProgramCacheKey = () => "cozy-chibi-patron";
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // the tints exist from the first frame, so the shader is built with them
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
  const walk = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  walk.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aWalk", walk);
  geo.setAttribute("aFur", new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3));
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return { mesh, walk };
}

type Group = "slots" | "bar" | "roulette" | "craps" | "lounge";
const GROUPS: Group[] = ["slots", "bar", "roulette", "craps", "lounge"];
/** What each place's patrons look at. */
const LOOK_AT: Record<Group, (p: Point) => Point> = {
  slots: (p) => ({ x: L.slots.x, z: p.z }),
  bar: (p) => ({ x: L.bar.x1, z: p.z }),
  roulette: () => ROULETTE_CENTER,
  craps: () => ({ x: L.craps.x, z: L.craps.z }),
  lounge: () => ({ x: L.billiards.x, z: L.billiards.z }),
};

interface Patron {
  kind: Kind;
  slot: number; // its instance index within its kind
  fur: THREE.Color;
  outfit: THREE.Color;
  x: number;
  z: number;
  y: number;
  heading: number;
  path: Point[];
  state: "away" | "enter" | "walk" | "stay" | "exit";
  /** Where it is going (or stands): a place's spot, or the doors. */
  group: Group | "doors";
  spot: number;
  /** Seconds left in this state. */
  left: number;
  /** Places still to visit this evening. */
  plan: Group[];
  /** 0..1 appearing (the doors), 1 present. */
  shown: number;
  phase: number;
  /** A pose laid over the walk: which, and when it started. */
  pose: Pose;
  poseAt: number;
  nextSip: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** An evening's places, in order: the slots, the bar, the roulette; sometimes the lounge after the
 *  bar, or the craps table after the wheel. */
function evening(): Group[] {
  const plan: Group[] = ["slots", "bar"];
  if (Math.random() < 0.35) plan.push("lounge");
  plan.push("roulette");
  if (Math.random() < 0.3) plan.push("craps");
  return plan;
}
/** What is left of an evening for someone already at `group`. */
function restOf(group: Group): Group[] {
  const plan = evening();
  const i = plan.indexOf(group);
  return i >= 0 ? plan.slice(i + 1) : plan.slice(plan.indexOf("roulette"));
}
const spotsOf = (g: Group | "doors"): Point[] => (g === "doors" ? [PATRON_SPOTS.doors] : PATRON_SPOTS[g]);
/** A pose's weight at `now` (eased in and out), 0 once it is over. */
function poseWeight(pose: Pose, at: number, now: number): number {
  const d = POSE_S[pose];
  const u = d ? (now - at) / d : 1;
  return u >= 0 && u < 1 ? Math.min(1, Math.min(u, 1 - u) * 5) : 0;
}

export function AmbientPatrons({ subscribeMessages, room }: { subscribeMessages: (listener: RoomMessageListener) => () => void; room: Room | null }) {
  return (
    <ModelBoundary what="patrons.glb" fallback={null}>
      <Suspense fallback={null}>
        <Crowd subscribeMessages={subscribeMessages} />
        <Bella room={room} />
      </Suspense>
    </ModelBoundary>
  );
}

function Crowd({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const { scene } = useGLTF(URL);
  const figures = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, makeFigure(scene, `Patron_${k}`, PER_KIND)])) as Record<Kind, Figure>, [scene]);
  useEffect(
    () => () => {
      for (const kind of KINDS) {
        (figures[kind].mesh.material as THREE.Material).dispose();
        figures[kind].mesh.geometry.dispose();
        figures[kind].mesh.dispose();
      }
    },
    [figures]
  );

  // the evening's patrons: most already about the hall, a few still to come in
  const patrons = useMemo(() => {
    const out: Patron[] = [];
    const taken = new Set<string>();
    KINDS.forEach((kind, k) => {
      for (let i = 0; i < PER_KIND; i++) {
        const p: Patron = {
          kind,
          slot: i,
          fur: new THREE.Color(FURS[kind][(i + k) % FURS[kind].length]),
          outfit: new THREE.Color(OUTFITS[kind][(i * 2 + k) % OUTFITS[kind].length]),
          x: PATRON_SPOTS.doors.x,
          z: PATRON_SPOTS.doors.z,
          y: 0,
          heading: Math.PI,
          path: [],
          state: "away",
          group: "doors",
          spot: 0,
          left: rand(1, 40),
          plan: [],
          shown: 0,
          phase: Math.random() * 10,
          pose: "none",
          poseAt: -99,
          nextSip: rand(2, 6),
        };
        if ((i + k) % 3 !== 0) {
          // already here: standing at a free spot somewhere, part way through the evening
          const group = GROUPS[(i * 3 + k) % GROUPS.length];
          const spots = spotsOf(group);
          const spot = spots.findIndex((_, s) => !taken.has(`${group}:${s}`));
          if (spot >= 0) {
            taken.add(`${group}:${spot}`);
            Object.assign(p, { state: "stay", group, spot, x: spots[spot].x, z: spots[spot].z, left: rand(3, 18), shown: 1, plan: restOf(group) });
          }
        }
        out.push(p);
      }
    });
    return out;
  }, []);
  const occupied = useRef(new Set<string>(patrons.filter((p) => p.state === "stay").map((p) => `${p.group}:${p.spot}`)));

  // the room's moments: a number at the wheel (its watchers clap), a win at the slots or a jackpot
  // (cheers), the dice (the craps crowd claps)
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        const now = performance.now() / 1000;
        const pose = (p: Patron, which: Pose) => {
          p.pose = which;
          p.poseAt = now + Math.random() * 0.35;
        };
        for (const p of patrons) {
          if (p.state !== "stay") continue;
          if (type === "rouletteResult" && p.group === "roulette") pose(p, "clap");
          else if (type === "slotSpin" && p.group === "slots" && (payload as { win?: number; bet?: number })?.win! > (payload as { bet?: number })?.bet! && Math.random() < 0.8) pose(p, "cheer");
          else if (type === "casinoWin" && (payload as { celebrate?: boolean })?.celebrate && Math.random() < 0.7) pose(p, p.group === "roulette" ? "clap" : "cheer");
          else if (type === "casinoProp" && (payload as { kind?: string })?.kind === "craps" && p.group === "craps") pose(p, "clap");
        }
      }),
    [subscribeMessages, patrons]
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colored = useRef(false);

  /** Sends a patron on to its next place (or out, or back to the doors to leave). */
  const route = (p: Patron) => {
    occupied.current.delete(`${p.group}:${p.spot}`);
    let next: Group | "doors" = p.plan.shift() ?? "doors";
    let spot = 0;
    if (next !== "doors") {
      const spots = spotsOf(next);
      const free = spots.map((_, s) => s).filter((s) => !occupied.current.has(`${next}:${s}`));
      if (free.length === 0) next = "doors";
      else {
        spot = free[Math.floor(Math.random() * free.length)];
        occupied.current.add(`${next}:${spot}`);
      }
    }
    const to = spotsOf(next)[spot];
    p.group = next;
    p.spot = spot;
    p.path = findPath("velvet_casino", { x: p.x, z: p.z }, to) ?? [to];
    p.state = next === "doors" ? "exit" : "walk";
  };

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const t = clock.elapsedTime;
    time.value = t;
    const now = performance.now() / 1000;
    for (const p of patrons) {
      if (p.state === "away") {
        p.left -= dt;
        if (p.left <= 0) {
          // in through the doors, with an evening's plan
          p.state = "enter";
          p.x = PATRON_SPOTS.doors.x + rand(-0.4, 0.4);
          p.z = PATRON_SPOTS.doors.z;
          p.heading = 0;
          p.plan = evening();
          p.shown = 0;
        }
      } else if (p.state === "enter") {
        p.shown = Math.min(1, p.shown + dt * 2.5);
        if (p.shown >= 1) route(p);
      } else if (p.state === "walk" || p.state === "exit") {
        const wp = p.path[0];
        if (!wp) {
          if (p.state === "exit") {
            p.shown = Math.max(0, p.shown - dt * 2.5);
            if (p.shown <= 0) {
              p.state = "away";
              p.left = rand(8, 30);
            }
          } else {
            p.state = "stay";
            p.left = rand(8, 22);
          }
        } else {
          const dx = wp.x - p.x;
          const dz = wp.z - p.z;
          const d = Math.hypot(dx, dz);
          const step = WALK_SPEED * dt;
          if (d <= step) {
            p.x = wp.x;
            p.z = wp.z;
            p.path.shift();
          } else {
            p.x += (dx / d) * step;
            p.z += (dz / d) * step;
          }
          if (d > 0.01) p.heading = turn(p.heading, Math.atan2(dx, dz), 0.18);
        }
      } else if (p.state === "stay") {
        const g = p.group as Group;
        const look = LOOK_AT[g]({ x: p.x, z: p.z });
        p.heading = turn(p.heading, Math.atan2(look.x - p.x, look.z - p.z), 0.08);
        p.left -= dt;
        // a sip at the bar now and then; the odd cheer at the slots
        if (g === "bar") {
          p.nextSip -= dt;
          if (p.nextSip <= 0) {
            p.pose = "sip";
            p.poseAt = now;
            p.nextSip = rand(3.5, 7);
          }
        } else if (g === "slots" && Math.random() < dt * 0.04) {
          p.pose = "cheer";
          p.poseAt = now;
        }
        if (p.left <= 0) route(p);
      }
      p.y += (walkY("velvet_casino", p.x, p.z) - p.y) * 0.2;
    }

    for (const kind of KINDS) {
      const { mesh, walk } = figures[kind];
      for (const p of patrons) {
        if (p.kind !== kind) continue;
        const walking = (p.state === "walk" || p.state === "exit") && p.path.length > 0;
        const pw = walking ? 0 : poseWeight(p.pose, p.poseAt, now);
        // the step's bob and sway; a little hop in a cheer
        const lift = walking ? Math.abs(Math.sin(t * 8 + p.phase)) * 0.04 : p.pose === "cheer" ? Math.abs(Math.sin((now - p.poseAt) * 7)) * 0.06 * pw : 0;
        const sway = walking ? Math.sin(t * 8 + p.phase) * 0.04 : 0;
        const squash = 1 + 0.012 * Math.sin(t * 2 + p.phase);
        const scale = p.shown <= 0 ? 0.0001 : 0.25 + 0.75 * easeOut(p.shown);
        dummy.position.set(p.x, p.y + lift, p.z);
        dummy.rotation.set(0, p.heading, sway, "YXZ");
        dummy.scale.set(scale, scale * squash, scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(p.slot, dummy.matrix);
        walk.setXYZW(p.slot, p.phase, walking ? 1 : 0, POSE[p.pose], pw);
        if (!colored.current) {
          mesh.setColorAt(p.slot, p.outfit);
          (mesh.geometry.getAttribute("aFur") as THREE.InstancedBufferAttribute).setXYZ(p.slot, p.fur.r, p.fur.g, p.fur.b);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      walk.needsUpdate = true;
      if (!colored.current) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        (mesh.geometry.getAttribute("aFur") as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
    }
    colored.current = true;
  });

  return (
    <>
      {KINDS.map((kind) => (
        <primitive key={kind} object={figures[kind].mesh} />
      ))}
    </>
  );
}

// --- Bella: round the tables with her tray, pausing at each stop; a word for a seated guest ---

const BELLA_LINES = ["Can I get you anything, darling? 🍸", "Something sparkling for the table? 🥂", "You look like a winner tonight! ✨", "Pippin's shaking up something special, sweetie. 🍹"];
const BELLA_GREET_GAP_S = 30;
const BELLA_PAUSE_S = 2.6;

function Bella({ room }: { room: Room | null }) {
  const { scene } = useGLTF(URL);
  const figure = useMemo(() => makeFigure(scene, "Patron_Bella", 1), [scene]);
  useEffect(
    () => () => {
      (figure.mesh.material as THREE.Material).dispose();
      figure.mesh.geometry.dispose();
      figure.mesh.dispose();
    },
    [figure]
  );
  // her round: the stops in PATRON_SPOTS.bella, joined by paths round the furniture
  const round = useMemo(() => {
    const stops = PATRON_SPOTS.bella;
    return stops.map((a, i) => {
      const b = stops[(i + 1) % stops.length];
      return findPath("velvet_casino", a, b) ?? [b];
    });
  }, []);
  const me = useRef({ x: PATRON_SPOTS.bella[0].x, z: PATRON_SPOTS.bella[0].z, y: 0, heading: 0, leg: 0, path: [...round[0]], pause: 1, lastGreet: -99 });
  const anchor = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const t = clock.elapsedTime;
    const now = performance.now() / 1000;
    const b = me.current;
    let walking = false;
    if (b.pause > 0) b.pause -= dt;
    else {
      const wp = b.path[0];
      if (!wp) {
        // at a stop: a pause, then on to the next
        b.leg = (b.leg + 1) % round.length;
        b.path = [...round[b.leg]];
        b.pause = BELLA_PAUSE_S;
      } else {
        walking = true;
        const dx = wp.x - b.x;
        const dz = wp.z - b.z;
        const d = Math.hypot(dx, dz);
        const step = BELLA_SPEED * dt;
        if (d <= step) {
          b.x = wp.x;
          b.z = wp.z;
          b.path.shift();
        } else {
          b.x += (dx / d) * step;
          b.z += (dz / d) * step;
        }
        if (d > 0.01) b.heading = turn(b.heading, Math.atan2(dx, dz), 0.15);
      }
    }
    b.y += (walkY("velvet_casino", b.x, b.z) - b.y) * 0.2;
    // a seated guest close by: a word, now and then
    const seated = !!room?.state?.players?.get?.(room.sessionId)?.sitting;
    if (seated && now - b.lastGreet > BELLA_GREET_GAP_S && Math.hypot(cameraFocus.x - b.x, cameraFocus.z - b.z) < 1.9) {
      b.lastGreet = now;
      const id = Math.floor(now * 1000);
      setBubble({ id, text: BELLA_LINES[Math.floor(Math.random() * BELLA_LINES.length)] });
      window.setTimeout(() => setBubble((cur) => (cur?.id === id ? null : cur)), 4000);
    }
    const lift = walking ? Math.abs(Math.sin(t * 8)) * 0.04 : 0;
    dummy.position.set(b.x, b.y + lift, b.z);
    dummy.rotation.set(0, b.heading, walking ? Math.sin(t * 8) * 0.035 : 0, "YXZ");
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    figure.mesh.setMatrixAt(0, dummy.matrix);
    figure.mesh.instanceMatrix.needsUpdate = true;
    figure.walk.setXYZW(0, 0, walking ? 1 : 0, 0, 0);
    figure.walk.needsUpdate = true;
    anchor.current?.position.set(b.x, b.y + 1.35, b.z);
  });

  return (
    <>
      <primitive object={figure.mesh} />
      <group ref={anchor}>
        {bubble && (
          <Html key={bubble.id} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div className="cozy-chat-bubble" style={{ position: "relative" }}>
              {bubble.text}
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

function turn(from: number, to: number, k: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}

const easeOut = (x: number) => 1 - (1 - x) * (1 - x);

export function preloadPatrons() {
  useGLTF.preload(URL);
}
