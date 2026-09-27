import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import { walkY } from "@shared/collision";
import { findPath, type Point } from "@shared/pathfinding";
import { BIG_SIX, BLACKJACK_TABLES, CASINO_LAYOUT as L, CASINO_PROPS, PATRON_SPOTS, ROULETTE_CENTER, SINGLE_MACHINES } from "@shared/worlds/casino";
import { PATRON_KINDS, npcOccupant } from "@shared/casino";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { cameraFocus } from "../scene/cameraFocus";
import { ModelBoundary } from "./ModelBoundary";

// The Velvet Casino's crowd: twenty-four chibi regulars drifting through the hall, the ones playing
// the one-player machines, and Bella the cocktail bunny on her round between the tables with her
// brass tray. The wanderers are drawn on this screen only (the server never hears of them; they walk
// through players as if they were not there, though never through the furniture: they path round it
// on the same grid players do). The machine players are the room's: when the server gives a slot or
// the coin pusher to a patron (state.machines, "npc:<Kind>:<tint>"), that patron walks up to it and
// plays (a pull of the lever, a coin dropped into the pusher) until it lets the machine go, then
// steps back into the crowd and is gone; meanwhile no player can use it.
//
// Nine figures from patrons.glb (scripts/blender/build_casino_staff.py): an evening-gowned rabbit, a
// raccoon in a tailored suit, a chic feline in a cocktail dress and a pillbox hat, a dapper fox in a
// cream dinner jacket and a maroon bow tie, a round panda in a tweed overcoat, a gentleman owl in a
// top hat and monocle, a tall greyhound in a pinstriped double-breasted suit, a chic otter in a
// fringed 1920s flapper dress and a feathered headband, and Bella. No two stand alike: each patron
// is drawn 0.85 to 1.25 times the figure's height, and a touch wider or slimmer with it. Each figure
// is ONE instanced mesh (a draw call apiece, nine for the whole crowd), rigged for a shader instead of
// bones: every vertex knows its limb (the model's u: body, right arm, left arm, right leg, left leg,
// tail) and whether it is clothing (v). The vertex shader swings each limb round its pivot from a
// per-patron walk (phase, stride), and a pose laid over it (a clap, a cheer, a sip); it tints each
// patron's clothes their own colour and their fur a shade of its own. The patron moves whole on the
// CPU: a bob of |sin(8t)| * 0.04 in its step, a sway, a turn toward where it goes.
//
// Each patron's evening, a little state machine over PATRON_SPOTS: in through the doors, to the
// slot row (watching, cheering a win), the bar (a sip now and then), the roulette table (clapping
// the number), now and then a detour by the lounge, the blackjack tables, the Big Six (watching its
// spin), the promenade or the craps table, then out through the doors again; a while later, someone
// new comes in.

const URL = modelUrl("patrons.glb");
const KINDS = PATRON_KINDS;
type Kind = (typeof KINDS)[number];
const PER_KIND = 3;
/** Each figure's extra instances for the machine players (the room lets patrons take up to three at
 *  once; one more for a patron still stepping away from the last). */
const MACHINE_SLOTS = 4;
const WALK_SPEED = 1.05;
const BELLA_SPEED = 0.9;
/** Outfit tints: gowns, suits, cocktail dresses; the fox's cream dinner jackets, the panda's tweeds,
 *  the owl's tailcoats, the greyhound's pinstripe suits, the otter's flapper dresses. */
const OUTFITS: Record<Kind, string[]> = {
  Rabbit: ["#b3263e", "#2a4fa8", "#1f7a4f", "#e8d3a2", "#7b4ba8"],
  Raccoon: ["#3a3a46", "#22305a", "#5a2448", "#a8845a", "#2f4a3a"],
  Feline: ["#1c1c22", "#c2415b", "#2f6fb0", "#e0b44a", "#6b3aa8"],
  Fox: ["#f2ead8", "#ece2cc", "#f6efe0", "#e6dac0", "#efe4d2"],
  Panda: ["#7a6a4f", "#6b5a44", "#5e6a4a", "#8a7358", "#6a5a5e"],
  Owl: ["#1f2230", "#2e1f2a", "#26302a", "#3a2c22", "#222226"],
  Greyhound: ["#2a3346", "#33333d", "#2d2a3a", "#243a36", "#3a3040"],
  Otter: ["#c9a24a", "#b3263e", "#1c1c22", "#2f6fb0", "#e8d3a2"],
};
/** Fur tints: gentle variations on the model's own colours. */
const FURS: Record<Kind, string[]> = {
  Rabbit: ["#ffffff", "#f3e6d4", "#d9c2a4", "#e6e6ec"],
  Raccoon: ["#ffffff", "#ece6dc", "#dcdce6", "#f2ebe0"],
  Feline: ["#ffffff", "#f7d8b0", "#dcdcdc", "#c9a07a"],
  Fox: ["#ffffff", "#f5dcc4", "#e8c9a8", "#fff1e0"],
  Panda: ["#ffffff", "#f2ede4", "#ece8e0", "#f7f2ea"],
  Owl: ["#ffffff", "#e8d8c4", "#d4c4ae", "#f0e4d4"],
  Greyhound: ["#ffffff", "#e4dccf", "#d0d0d8", "#c9b8a4"],
  Otter: ["#ffffff", "#ecd9c0", "#d9c2a4", "#c8a882"],
};
/** A patron's build: 0.85 to 1.25 of the figure's height, and a width that goes with it (a little
 *  more or less, as people are). */
function build(kind: Kind): { h: number; w: number } {
  const h = 0.85 + Math.random() * 0.4;
  const w = Math.pow(h, 0.55) * (0.93 + Math.random() * 0.17) * (kind === "Panda" ? 1.06 : kind === "Greyhound" ? 0.94 : 1);
  return { h, w };
}

/** The poses laid over the walk (the shader's aWalk.z): pull (a slot's lever) and drop (a coin into
 *  the pusher) loop for as long as they are held. */
const POSE = { none: 0, clap: 1, cheer: 2, sip: 3, pull: 4, drop: 5 } as const;
type Pose = keyof typeof POSE;
const POSE_S: Record<Pose, number> = { none: 0, clap: 1.8, cheer: 1.5, sip: 1.3, pull: 0, drop: 0 };

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
    } else if (pose > 3.5 && pose < 4.5 && side > 0.0) {
      // a slot's lever: up to the handle, a yank down, a moment's wait for the reels
      float cyc = fract((uTime + ph) / 2.6);
      float yank = cyc < 0.3 ? cyc / 0.3 : cyc < 0.42 ? 1.0 - (cyc - 0.3) / 0.12 : 0.0;
      ax = mix(ax, mix(-2.35, -0.75, 1.0 - yank), pw);
      az = mix(az, 0.25, pw);
    } else if (pose > 4.5 && pose < 5.5 && side > 0.0) {
      // a coin into the pusher's slot: the paw out over it, a flick down now and then
      ax = mix(ax, -1.45 + 0.3 * max(0.0, sin(uTime * 2.4 + ph)), pw);
      az = mix(az, 0.15, pw);
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

type Group = "slots" | "bar" | "roulette" | "craps" | "lounge" | "blackjack" | "promenade" | "bigsix";
const GROUPS: Group[] = ["slots", "bar", "roulette", "craps", "lounge", "blackjack", "promenade", "bigsix"];
/** What each place's patrons look at. */
const nearestTable = (p: Point) => BLACKJACK_TABLES.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
const LOOK_AT: Record<Group, (p: Point) => Point> = {
  slots: (p) => ({ x: L.slots.x, z: p.z }),
  bar: (p) => ({ x: L.bar.x1, z: p.z }),
  roulette: () => ROULETTE_CENTER,
  craps: () => ({ x: L.craps.x, z: L.craps.z }),
  lounge: () => ({ x: L.billiards.x, z: L.billiards.z }),
  blackjack: (p) => nearestTable(p),
  promenade: () => ROULETTE_CENTER,
  bigsix: () => BIG_SIX,
};

/** The one-player machines: where their player stands, and what they face. */
const MACHINES = SINGLE_MACHINES.map((propId) => {
  const prop = CASINO_PROPS.find((q) => q.propId === propId)!;
  return { propId, at: { x: prop.approachX ?? prop.x, z: prop.approachZ ?? prop.z }, face: { x: prop.x, z: prop.z }, pose: (propId === "coin_pusher" ? "drop" : "pull") as Pose };
});
/** A machine player's walk up to it starts a few steps off, from the alley's aisle. */
const MACHINE_FROM = (m: (typeof MACHINES)[number]): Point => ({ x: m.at.x + 2.2, z: m.at.z + 0.6 });

interface Patron {
  kind: Kind;
  slot: number; // its instance index within its kind
  fur: THREE.Color;
  outfit: THREE.Color;
  /** Its build: height and width, over the figure's own. */
  h: number;
  w: number;
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
 *  bar, a look at the blackjack tables or a stroll on the promenade, or the craps table after the
 *  wheel. */
function evening(): Group[] {
  const plan: Group[] = ["slots", "bar"];
  if (Math.random() < 0.35) plan.push("lounge");
  if (Math.random() < 0.4) plan.push("blackjack");
  if (Math.random() < 0.35) plan.push("bigsix");
  plan.push("roulette");
  if (Math.random() < 0.35) plan.push("promenade");
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
        <Crowd subscribeMessages={subscribeMessages} room={room} />
        <Bella room={room} />
      </Suspense>
    </ModelBoundary>
  );
}

/** A patron at one of the one-player machines (the room's: state.machines). */
interface Player {
  propId: string;
  who: string;
  kind: Kind;
  slot: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  path: Point[];
  state: "walk" | "play" | "leave";
  shown: number;
  phase: number;
  tint: number;
  h: number;
  w: number;
}

function Crowd({ subscribeMessages, room }: { subscribeMessages: (listener: RoomMessageListener) => () => void; room: Room | null }) {
  const { scene } = useGLTF(URL);
  const figures = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, makeFigure(scene, `Patron_${k}`, PER_KIND + MACHINE_SLOTS)])) as Record<Kind, Figure>, [scene]);
  // the machine players, and which of each figure's extra instances are free for one
  const players = useRef<Player[]>([]);
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
          ...build(kind),
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
  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);

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

    // the machine players: the room hands a machine to a patron, who walks up and plays it until
    // the room takes it back, then heads for the doors
    const list = players.current;
    for (const m of MACHINES) {
      const who: string = room?.state?.machines?.get?.(m.propId) ?? "";
      const at = list.find((q) => q.propId === m.propId && q.state !== "leave");
      if (at && at.who !== who) {
        // done: a few steps back into the crowd, fading as it goes
        const away = MACHINE_FROM(m);
        at.state = "leave";
        at.path = findPath("velvet_casino", { x: at.x, z: at.z }, away) ?? [away];
      }
      const occupant = npcOccupant(who);
      if (occupant && (!at || at.who !== who)) {
        const kind = occupant.kind as Kind;
        const used = new Set(list.filter((q) => q.kind === kind).map((q) => q.slot));
        let slot = -1;
        for (let k = PER_KIND; k < PER_KIND + MACHINE_SLOTS; k++) if (!used.has(k)) (slot = slot < 0 ? k : slot);
        if (slot < 0) continue;
        const from = MACHINE_FROM(m);
        const q: Player = { propId: m.propId, who, kind, slot, x: from.x, z: from.z, y: 0, heading: Math.atan2(m.at.x - from.x, m.at.z - from.z), path: findPath("velvet_casino", from, m.at) ?? [m.at], state: "walk", shown: 0, phase: Math.random() * 10, tint: occupant.tint, ...build(kind) };
        q.path.push(m.at);
        list.push(q);
        const fig = figures[kind];
        fig.mesh.setColorAt(slot, new THREE.Color(OUTFITS[kind][occupant.tint % OUTFITS[kind].length]));
        const fur = new THREE.Color(FURS[kind][occupant.tint % FURS[kind].length]);
        (fig.mesh.geometry.getAttribute("aFur") as THREE.InstancedBufferAttribute).setXYZ(slot, fur.r, fur.g, fur.b);
        if (fig.mesh.instanceColor) fig.mesh.instanceColor.needsUpdate = true;
        (fig.mesh.geometry.getAttribute("aFur") as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
    }
    for (const q of list) {
      const m = MACHINES.find((x) => x.propId === q.propId)!;
      if (q.state === "play") {
        q.heading = turn(q.heading, Math.atan2(m.face.x - q.x, m.face.z - q.z), 0.12);
      } else {
        const wp = q.path[0];
        if (!wp) {
          if (q.state === "walk") q.state = "play";
        } else {
          const dx = wp.x - q.x;
          const dz = wp.z - q.z;
          const d = Math.hypot(dx, dz);
          const step = WALK_SPEED * dt;
          if (d <= step) {
            q.x = wp.x;
            q.z = wp.z;
            q.path.shift();
          } else {
            q.x += (dx / d) * step;
            q.z += (dz / d) * step;
          }
          if (d > 0.01) q.heading = turn(q.heading, Math.atan2(dx, dz), 0.18);
        }
      }
      q.shown = q.state === "leave" ? Math.max(0, q.shown - dt * 0.9) : Math.min(1, q.shown + dt * 2.5);
      q.y += (walkY("velvet_casino", q.x, q.z) - q.y) * 0.2;
    }
    // gone out of the doors: their instance is free again
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i];
      if (q.state === "leave" && q.shown <= 0) {
        figures[q.kind].mesh.setMatrixAt(q.slot, hidden);
        list.splice(i, 1);
      }
    }

    for (const kind of KINDS) {
      const { mesh, walk } = figures[kind];
      // only as many instances are drawn as the highest one in use (the machine players' spares
      // cost nothing while they wait)
      let top = -1;
      for (const p of patrons) if (p.kind === kind && p.shown > 0) top = Math.max(top, p.slot);
      for (const q of list) if (q.kind === kind) top = Math.max(top, q.slot);
      mesh.count = top + 1;
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
        dummy.scale.set(scale * p.w, scale * p.h * squash, scale * p.w);
        dummy.updateMatrix();
        mesh.setMatrixAt(p.slot, dummy.matrix);
        walk.setXYZW(p.slot, p.phase, walking ? 1 : 0, POSE[p.pose], pw);
        if (!colored.current) {
          mesh.setColorAt(p.slot, p.outfit);
          (mesh.geometry.getAttribute("aFur") as THREE.InstancedBufferAttribute).setXYZ(p.slot, p.fur.r, p.fur.g, p.fur.b);
        }
      }
      if (!colored.current) for (let k = PER_KIND; k < PER_KIND + MACHINE_SLOTS; k++) mesh.setMatrixAt(k, hidden);
      for (const q of list) {
        if (q.kind !== kind) continue;
        const walking = q.state !== "play" && q.path.length > 0;
        const scale = q.shown <= 0 ? 0.0001 : 0.25 + 0.75 * easeOut(q.shown);
        dummy.position.set(q.x, q.y + (walking ? Math.abs(Math.sin(t * 8 + q.phase)) * 0.04 : 0), q.z);
        dummy.rotation.set(0, q.heading, walking ? Math.sin(t * 8 + q.phase) * 0.04 : 0, "YXZ");
        dummy.scale.set(scale * q.w, scale * q.h, scale * q.w);
        dummy.updateMatrix();
        mesh.setMatrixAt(q.slot, dummy.matrix);
        const m = MACHINES.find((x) => x.propId === q.propId)!;
        walk.setXYZW(q.slot, q.phase, walking ? 1 : 0, q.state === "play" ? POSE[m.pose] : 0, q.state === "play" ? 1 : 0);
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
