import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { walkY } from "@shared/collision";
import { findPath, type Point } from "@shared/pathfinding";
import { CASINO_LAYOUT as L, PATRON_SPOTS, ROULETTE_CENTER } from "@shared/worlds/casino";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { ModelBoundary } from "./ModelBoundary";

// The Velvet Casino's crowd: a dozen well-dressed regulars drifting through the hall, drawn on this
// screen only (the server never hears of them, and they walk through players as if they were not
// there, though never through the furniture: they path round it on the same grid players do).
//
// Three archetypes from patrons.glb (scripts/blender/build_casino_staff.py): an evening-gowned
// rabbit, a raccoon in a tailored suit, a dapper badger in a waistcoat and bowler. Each archetype
// is two instanced meshes, the animal and its clothes, every patron's clothes tinted their own
// colour: six draw calls for the whole crowd.
//
// Each patron's evening, a little state machine over PATRON_SPOTS: in through the doors, to the
// slot row (watching, now and then a cheer), the bar (a drink, tipped back now and then), the
// roulette table (watching the wheel, cheering a number), now and then a detour by the lounge or
// the craps table, then out through the doors again; a while later, someone new comes in.

const URL = modelUrl("patrons.glb");
const KINDS = ["Rabbit", "Raccoon", "Badger"] as const;
type Kind = (typeof KINDS)[number];
const PER_KIND = 4;
const WALK_SPEED = 1.05;
/** Outfit tints: gowns, suits, waistcoats. */
const OUTFITS: Record<Kind, string[]> = {
  Rabbit: ["#b3263e", "#2a4fa8", "#1f7a4f", "#e8d3a2", "#7b4ba8"],
  Raccoon: ["#3a3a46", "#22305a", "#5a2448", "#a8845a", "#2f4a3a"],
  Badger: ["#7a5a3a", "#2f5a3a", "#6a1e2a", "#b8912e", "#40506a"],
};
/** Fur tints: gentle variations on the model's own colours. */
const FURS: Record<Kind, string[]> = {
  Rabbit: ["#ffffff", "#f3e6d4", "#d9c2a4", "#e6e6ec"],
  Raccoon: ["#ffffff", "#ece6dc", "#dcdce6", "#f2ebe0"],
  Badger: ["#ffffff", "#efe9e0", "#e2e2e8", "#f5efe4"],
};

type Group = "slots" | "bar" | "roulette" | "craps" | "lounge";
const GROUPS: Group[] = ["slots", "bar", "roulette", "craps", "lounge"];
/** What each place's patrons look at, and do. */
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
  cheerAt: number;
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

export function AmbientPatrons({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  return (
    <ModelBoundary what="patrons.glb" fallback={null}>
      <Suspense fallback={null}>
        <Crowd subscribeMessages={subscribeMessages} />
      </Suspense>
    </ModelBoundary>
  );
}

function Crowd({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const { scene } = useGLTF(URL);
  const meshes = useMemo(() => {
    const out: Record<Kind, { fur: THREE.InstancedMesh; outfit: THREE.InstancedMesh }> = {} as never;
    for (const kind of KINDS) {
      const make = (part: "Fur" | "Outfit") => {
        const node = scene.getObjectByName(`Patron_${kind}_${part}`) as THREE.Mesh | undefined;
        const geo = node?.geometry ?? new THREE.BoxGeometry(0.3, 1, 0.3);
        const src = node?.material as THREE.MeshStandardMaterial | undefined;
        const mat = src ? src.clone() : new THREE.MeshStandardMaterial({ color: "#999", roughness: 0.8 });
        const mesh = new THREE.InstancedMesh(geo, mat, PER_KIND);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // the tints exist from the first frame, so the shader is built with them
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PER_KIND * 3).fill(1), 3);
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        return mesh;
      };
      out[kind] = { fur: make("Fur"), outfit: make("Outfit") };
    }
    return out;
  }, [scene]);
  useEffect(
    () => () => {
      for (const kind of KINDS) {
        (meshes[kind].fur.material as THREE.Material).dispose();
        (meshes[kind].outfit.material as THREE.Material).dispose();
        meshes[kind].fur.dispose();
        meshes[kind].outfit.dispose();
      }
    },
    [meshes]
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
          cheerAt: -99,
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

  // a roulette number or a jackpot: those watching cheer
  useEffect(
    () =>
      subscribeMessages((type) => {
        if (type !== "rouletteResult" && type !== "casinoWin" && type !== "slotSpin") return;
        const now = performance.now() / 1000;
        for (const p of patrons) {
          if (p.state !== "stay") continue;
          if ((type === "rouletteResult" && p.group === "roulette") || (type === "casinoWin" && Math.random() < 0.6) || (type === "slotSpin" && p.group === "slots" && Math.random() < 0.3)) p.cheerAt = now + Math.random() * 0.4;
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
        if (g === "slots" && Math.random() < dt * 0.05) p.cheerAt = now;
        if (p.left <= 0) route(p);
      }
      p.y += (walkY("velvet_casino", p.x, p.z) - p.y) * 0.2;
    }

    for (const kind of KINDS) {
      const { fur, outfit } = meshes[kind];
      for (const p of patrons) {
        if (p.kind !== kind) continue;
        const walking = (p.state === "walk" || p.state === "exit") && p.path.length > 0;
        const cheer = now - p.cheerAt;
        let lift = 0;
        let tilt = 0;
        let squash = 1 + 0.012 * Math.sin(t * 2 + p.phase);
        if (walking) {
          lift = Math.abs(Math.sin(t * 8 + p.phase)) * 0.035;
          tilt = Math.sin(t * 8 + p.phase) * 0.05;
        } else if (cheer >= 0 && cheer < 1.2) {
          // a cheer: two little hops
          lift = Math.abs(Math.sin((cheer / 1.2) * Math.PI * 2)) * 0.12;
          squash = 1 + 0.05 * Math.sin((cheer / 1.2) * Math.PI * 2);
        } else if (p.state === "stay" && p.group === "bar") {
          // a drink: tipped back now and then
          const s = (t * 0.25 + p.phase) % 1;
          tilt = s < 0.12 ? -Math.sin((s / 0.12) * Math.PI) * 0.18 : 0;
        }
        const scale = p.shown <= 0 ? 0.0001 : 0.25 + 0.75 * easeOut(p.shown);
        dummy.position.set(p.x, p.y + lift, p.z);
        dummy.rotation.set(tilt, p.heading, 0, "YXZ");
        dummy.scale.set(scale, scale * squash, scale);
        dummy.updateMatrix();
        fur.setMatrixAt(p.slot, dummy.matrix);
        outfit.setMatrixAt(p.slot, dummy.matrix);
        if (!colored.current) {
          fur.setColorAt(p.slot, p.fur);
          outfit.setColorAt(p.slot, p.outfit);
        }
      }
      fur.instanceMatrix.needsUpdate = true;
      outfit.instanceMatrix.needsUpdate = true;
      if (!colored.current) {
        if (fur.instanceColor) fur.instanceColor.needsUpdate = true;
        if (outfit.instanceColor) outfit.instanceColor.needsUpdate = true;
      }
    }
    colored.current = true;
  });

  return (
    <>
      {KINDS.map((kind) => (
        <group key={kind}>
          <primitive object={meshes[kind].fur} />
          <primitive object={meshes[kind].outfit} />
        </group>
      ))}
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
