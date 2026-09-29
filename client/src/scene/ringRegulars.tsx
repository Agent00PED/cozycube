import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { JIMMY_ID, JIMMY_NAME, gloveLook, type BotTier, type BoutResult, type BoxEvent, type Corner, type FighterView } from "@shared/boxing";
import { OUTFIT_FABRICS, defaultLook, encodeLook } from "@shared/types";
import { findPath } from "@shared/pathfinding";
import { BAG_BOXER, JIMMY, REF_APRON, REF_HOME, RING, RING_CORNERS, RING_CROWD, RING_FANS, RING_FLOOR_Y, TRAINEE, clampToRing, outsideRopes } from "@shared/worlds/boxing_ring";
import { Avatar } from "../entities/Avatar";
import { CampNpc, GESTURE_S, gestureArm, ownMaterial, skinParts, type NpcGesture, type NpcMood, type NpcMotion } from "../entities/CampNpc";
import { ModelBoundary } from "../entities/ModelBoundary";
import { modelUrl } from "../assetVersion";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { getBout, subscribeBout } from "../systems/boutStore";
import { drawnAt, fighterSpot, playMove } from "../systems/fightAnim";
import { noRaycast } from "./kit";

// The Velvet Ring's regulars (ring_regulars.glb, and Jimmy on the player's own rig):
//
//   Jimmy the Slugger  waits by the Blue Corner's steps; called in, he walks to his corner's foot,
//                      up the steps and through the ropes by the post, across the canvas to his
//                      corner; the bout over, back the same way (the canvas at its height, the
//                      steps down, the floor home): never through the ring's platform
//   Ref Barnaby        the referee: in the north-west neutral corner between bouts, in the middle
//                      for the instructions, walking the apron on the side away from the camera
//                      through a round with his eyes on the exchange (round the corners, never
//                      across the canvas), rushing in to count a knockdown down arm-pump by
//                      arm-pump, and at the end between the two, the winner's arm raised, then the
//                      bout waved off
//   the regulars       the raccoon and the rabbit doze on the bleachers between bouts, and lean in
//                      through one: clapping, gasping at a Heavy Smash, cheering a knockdown
//   the crowd          fight night: five more fans (one skinned mesh, one draw call) fade in on the
//                      bleachers when a bout is on, react with the regulars, and fade out after it
//   Kip, the trainee   the kangaroo's one-two on the heavy bag; a pug skipping rope before the
//                      north mirrors, all night

type Subscribe = (listener: RoomMessageListener) => () => void;
type Pt = { x: number; z: number };

export const RING_REGULARS_URL = modelUrl("ring_regulars.glb");
/** Kip's one-two on the heavy bag: while it lasts, the bag is struck (BoxingWorld's RingModel swings it). */
export const kipBag = { until: 0, next: 0 };

const F = RING_FLOOR_Y;
const pickLine = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
/** A bout on (or about to be, or just over): fight night on the bleachers. */
const fightNight = () => getBout().phase !== "open";
/** Where the exchange is: between the two fighters as they are drawn (the middle of the ring otherwise). */
function exchange(): Pt {
  const b = getBout();
  const r = b.red.sessionId ? fighterSpot(b.red) : null;
  const u = b.blue.sessionId ? fighterSpot(b.blue) : null;
  if (r && u) return { x: (r.x + u.x) / 2, z: (r.z + u.z) / 2 };
  return r ?? u ?? { x: RING.x, z: RING.z };
}
const turnTo = (from: number, to: number, k: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;

// --- Jimmy the Slugger ------------------------------------------------------------------------------

const JIMMY_LOOK = encodeLook({ ...defaultLook("bot:jimmy-the-slugger"), outfit: "outfit_boxing", ...OUTFIT_FABRICS.outfit_boxing, hat: "none" });
const JIMMY_LINES: Record<BotTier, string[]> = {
  rookie: ["Go easy on me! 😅", "Just a light spar, yeah? 🥊"],
  contender: ["Let's see what you've got! 🥊", "Gloves up, champ! 🥊"],
  champion: ["You sure about this? 😏", "I don't go easy. 🥊"],
};
/** Where the bout has Jimmy (his corner), or null while he waits by the steps. */
const jimmyCorner = (): Corner | null => {
  const b = getBout();
  return b.red.sessionId === JIMMY_ID ? "red" : b.blue.sessionId === JIMMY_ID ? "blue" : null;
};
const WALK = 2.4;

interface Way {
  x: number;
  z: number;
  y: number;
  /** Through the ropes on this leg: a duck under them. */
  duck?: boolean;
}

/** A corner's way from its inside to the floor: across the canvas to beside the post (at the
 *  canvas's height), through the ropes onto the apron, to the top of the steps, down them, and off
 *  onto the floor at their foot. */
function cornerWay(c: Corner): Way[] {
  const k = RING_CORNERS[c];
  const sx = Math.sign(k.inside.x - RING.x) || 1;
  const sz = Math.sign(k.inside.z - RING.z) || 1;
  const at = (u: number, v: number) => ({ x: RING.x + sx * u, z: RING.z + sz * v });
  const bottom = RING.apron + 0.8;
  return [
    { ...k.inside, y: F },
    { ...at(RING.rope - 0.28, RING.rope - 0.55), y: F },
    { ...at(RING.rope + 0.24, RING.rope - 0.4), y: F, duck: true },
    { ...at(RING.apron - 0.05, RING.apron - 0.05), y: F },
    { ...k.steps, y: F * 0.45 },
    { ...at(bottom, bottom), y: 0 },
    { ...k.foot, y: 0 },
  ];
}

/** The floor between two points (round the ring and everything else), as ways at y 0. */
function floorWay(from: Pt, to: Pt): Way[] {
  const path = findPath("boxing_ring", from, to);
  return (path && path.length ? path : [to]).map((p) => ({ x: p.x, z: p.z, y: 0 }));
}

/** The index of the way nearest to where Jimmy is (height counted too). */
function nearestWay(ways: Way[], d: { x: number; z: number; y: number }): number {
  let best = 0;
  let bestD = Infinity;
  ways.forEach((w, i) => {
    const dd = Math.hypot(w.x - d.x, w.z - d.z, (w.y - d.y) * 1.5);
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  });
  return best;
}

/** Home from wherever he is: along his corner's way (from the nearest point of it) down to the floor,
 *  then over the floor to his spot. Off the ring already: straight over the floor. */
function wayHome(c: Corner, d: { x: number; z: number; y: number }): Way[] {
  const down = cornerWay(c);
  const home: Way = { x: JIMMY.x, z: JIMMY.z, y: 0 };
  if (d.y < 0.05) return [...floorWay(d, { x: home.x, z: home.z + 0.95 }), home];
  const rest = down.slice(nearestWay(down, d));
  const foot = rest[rest.length - 1];
  return [...rest, ...floorWay(foot, { x: home.x, z: home.z + 0.95 }), home];
}

/** Into his corner from wherever he is: over the floor to its steps' foot, up and in. */
function wayIn(c: Corner, d: { x: number; z: number; y: number }): Way[] {
  const up = cornerWay(c).reverse().map((w, i, all) => ({ ...w, duck: i > 0 && !!all[i - 1].duck }));
  if (d.y < 0.05 && !(Math.hypot(d.x - up[0].x, d.z - up[0].z) < 0.2)) return [...floorWay(d, up[0]), ...up.slice(1)];
  return up.slice(nearestWay(up, d));
}

/** Jimmy the Slugger: the player's own avatar, by the Blue Corner's steps in his stance until he is
 *  called in; then up the steps and through the ropes to his corner, where the bout has him (eased
 *  between its reports), squared up to whoever he spars; and home the same way, the canvas at its
 *  height and the steps down (never through the platform). A word now and then. */
export function SparringJimmy({ subscribeMessages }: { subscribeMessages: Subscribe }) {
  const group = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  const drawn = useRef({ x: JIMMY.x, z: JIMMY.z, y: 0, facing: JIMMY.yaw, mode: "home" as "home" | "in" | "ring" | "out", corner: "blue" as Corner, route: [] as Way[], from: { x: JIMMY.x, z: JIMMY.z, y: 0 } as Way });
  const corner = useSyncExternalStore(subscribeBout, jimmyCorner, jimmyCorner);
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  const bubbleId = useRef(0);
  useEffect(() => {
    const say = (text: string) => {
      const id = ++bubbleId.current;
      setBubble({ id, text });
      window.setTimeout(() => setBubble((b) => (b?.id === id ? null : b)), 2600);
    };
    return subscribeMessages((type, payload) => {
      if (type === "boxEvent") {
        const ev = payload as BoxEvent;
        const b = getBout();
        const tier = b.red.sessionId === JIMMY_ID ? b.red.bot : b.blue.bot;
        if (ev.kind === "enter" && ev.by === JIMMY_ID) say(pickLine(JIMMY_LINES[(tier || "contender") as BotTier]));
        else if (ev.kind === "towel" && tier) say("No shame in that. Come back anytime! 🥊");
        else if (ev.kind === "round" && tier) {
          const his = jimmyCorner();
          if (ev.winner && ev.winner === his) say(pickLine(["That's how it's done! 💪", "One for me! 🔔"]));
          else if (ev.winner) say(pickLine(["Oof, good shot! 😵", "Okay, okay, you got that one."]));
        }
      } else if (type === "boxResult" && (payload as BoutResult).spar && !(payload as BoutResult).towel) say("Good work out there! Again sometime? 🥊");
    });
  }, [subscribeMessages]);
  useEffect(() => () => void drawnAt.delete(JIMMY_ID), []);
  useFrame((_, raw) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(raw, 0.1);
    const b = getBout();
    const c = jimmyCorner();
    const d = drawn.current;
    // called in, or sent home: a route of his own
    if (c && (d.mode === "home" || d.mode === "out")) {
      d.corner = c;
      d.route = wayIn(c, d);
      d.mode = "in";
      d.from = { x: d.x, z: d.z, y: d.y };
    } else if (!c && (d.mode === "ring" || d.mode === "in")) {
      d.route = wayHome(d.corner, d);
      d.mode = "out";
      d.from = { x: d.x, z: d.z, y: d.y };
    } else if (c && c !== d.corner) d.corner = c;
    const before = { x: d.x, z: d.z };
    const me: FighterView | null = c ? b[c] : null;
    if (d.route.length > 0) {
      // along the route: each leg walked at an even pace, the height eased from its start to its end
      let left = WALK * dt;
      while (left > 0 && d.route.length > 0) {
        const w = d.route[0];
        const dx = w.x - d.x;
        const dz = w.z - d.z;
        const far = Math.hypot(dx, dz);
        if (far <= left) {
          d.x = w.x;
          d.z = w.z;
          d.y = w.y;
          left -= far;
          d.from = w;
          d.route.shift();
          // ducking through the ropes on the next leg
          if (d.route[0]?.duck) playMove(JIMMY_ID, "dashF");
        } else {
          d.x += (dx / far) * left;
          d.z += (dz / far) * left;
          const span = Math.hypot(w.x - d.from.x, w.z - d.from.z) || 1;
          const k = 1 - Math.hypot(w.x - d.x, w.z - d.z) / span;
          d.y = d.from.y + (w.y - d.from.y) * Math.max(0, Math.min(1, k));
          left = 0;
        }
      }
      if (d.route.length === 0) d.mode = d.mode === "in" ? "ring" : "home";
    } else if (d.mode === "ring" && me) {
      // in the ring: where the bout has him (a round's reset: a brisk walk back to his corner)
      const dx = me.x - d.x;
      const dz = me.z - d.z;
      const far = Math.hypot(dx, dz);
      if (far > 2.5) {
        const step = Math.min(far, 5 * dt);
        d.x += (dx / far) * step;
        d.z += (dz / far) * step;
      } else {
        const k = 1 - Math.pow(1 - 0.22, dt * 60);
        d.x += dx * k;
        d.z += dz * k;
      }
      d.y = F;
    } else if (d.mode === "home") {
      d.y = 0;
    }
    const moved = Math.hypot(d.x - before.x, d.z - before.z);
    speedRef.current += (Math.min(1, moved / Math.max(dt, 1e-3) / 3) - speedRef.current) * 0.3;
    // squared up to whoever he spars in the ring; the way he walks, walking; the room at home
    const foe = d.mode === "ring" && me ? (c === "red" ? b.blue : b.red) : null;
    const at = foe ? fighterSpot(foe) : null;
    const goal = at ? Math.atan2(at.x - d.x, at.z - d.z) : moved > 0.004 ? Math.atan2(d.x - before.x, d.z - before.z) : d.mode === "home" ? JIMMY.yaw : d.facing;
    d.facing = turnTo(d.facing, goal, at ? 1 - Math.exp(-30 * dt) : 1 - Math.exp(-14 * dt));
    g.position.set(d.x, d.y, d.z);
    g.rotation.y = d.facing;
    if (c) drawnAt.set(JIMMY_ID, { x: d.x, z: d.z });
    else drawnAt.delete(JIMMY_ID);
  });
  return (
    <Avatar
      ref={group}
      userId="bot:jimmy-the-slugger"
      look={JIMMY_LOOK}
      color="#c8453a"
      username={JIMMY_NAME}
      pose="stand"
      speedRef={speedRef}
      sessionId={JIMMY_ID}
      gloves={gloveLook("red", corner ?? "blue")}
      bubble={bubble}
    />
  );
}

// --- Ref Barnaby --------------------------------------------------------------------------------------

const REF_WALK = 1.7;
const REF_RUSH = 3.4;
type Side = "n" | "s" | "e" | "w";
const SIDE_OUT: Record<Side, Pt> = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } };
/** A point on the apron's walk: `side`, `along` it (from the middle). */
function apronAt(side: Side, along: number): Pt {
  const a = Math.max(-REF_APRON + 0.35, Math.min(REF_APRON - 0.35, along));
  if (side === "n" || side === "s") return { x: RING.x + a, z: RING.z + SIDE_OUT[side].z * REF_APRON };
  return { x: RING.x + SIDE_OUT[side].x * REF_APRON, z: RING.z + a };
}
const onApron = (p: Pt) => Math.max(Math.abs(p.x - RING.x), Math.abs(p.z - RING.z)) > RING.rope + 0.08;
const sideOf = (p: Pt): Side => (Math.abs(p.x - RING.x) > Math.abs(p.z - RING.z) ? (p.x > RING.x ? "e" : "w") : p.z > RING.z ? "s" : "n");
/** The next point on the way from `p` to `goal`: round the apron's corners when both are on it on
 *  different sides (never across the canvas), otherwise straight there (through the ropes). */
function refNext(p: Pt, goal: Pt): Pt {
  if (!onApron(p) || !onApron(goal)) return goal;
  const a = sideOf(p);
  const b = sideOf(goal);
  if (a === b) return goal;
  const cx = a === "e" || b === "e" ? 1 : a === "w" || b === "w" ? -1 : Math.sign(p.x - RING.x) || 1;
  const cz = a === "s" || b === "s" ? 1 : a === "n" || b === "n" ? -1 : Math.sign(p.z - RING.z) || 1;
  // opposite sides: to the corner on this side nearer to him first
  if ((a === "n" && b === "s") || (a === "s" && b === "n")) return { x: RING.x + (Math.sign(p.x - RING.x) || 1) * REF_APRON, z: RING.z + SIDE_OUT[a].z * REF_APRON };
  if ((a === "e" && b === "w") || (a === "w" && b === "e")) return { x: RING.x + SIDE_OUT[a].x * REF_APRON, z: RING.z + (Math.sign(p.z - RING.z) || 1) * REF_APRON };
  return { x: RING.x + cx * REF_APRON, z: RING.z + cz * REF_APRON };
}

/** Ref Barnaby: the ring's referee, all on the ring's height (he never steps off it). */
export function RefBarnaby({ subscribeMessages }: { subscribeMessages: Subscribe }) {
  const { camera } = useThree();
  const motion = useRef<NpcMotion>({ x: REF_HOME.x, z: REF_HOME.z, y: F, yaw: Math.PI / 4, moving: 0 });
  const gestureRef = useRef<((g: NpcGesture) => void) | null>(null);
  const st = useRef({
    side: "n" as Side,
    countTo: "",
    result: null as null | { winner: Corner | null; towel: boolean; arrived: number; raised: boolean; waved: boolean },
    look: null as Pt | null,
    view: new THREE.Vector3(),
  });
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        const s = st.current;
        if (type === "boxEvent") {
          const ev = payload as BoxEvent;
          if (ev.kind === "knockdown") {
            s.countTo = ev.to;
            gestureRef.current?.("flail");
          } else if (ev.kind === "count") gestureRef.current?.("count");
          else if (ev.kind === "up" || ev.kind === "round") s.countTo = "";
          else if (ev.kind === "towel") gestureRef.current?.("waveoff");
        } else if (type === "boxResult") {
          const r = payload as BoutResult;
          s.countTo = "";
          // (a No Contest or a draw: no arm to raise, the bout waved off)
          const winner = r.method === "nocontest" || r.method === "draw" ? null : r.winner;
          s.result = { winner, towel: !!r.towel, arrived: 0, raised: false, waved: false };
        }
      }),
    [subscribeMessages]
  );
  useFrame(({ clock }, raw) => {
    const dt = Math.min(raw, 0.1);
    const t = clock.elapsedTime;
    const b = getBout();
    const m = motion.current;
    const s = st.current;
    const red = b.red.sessionId ? fighterSpot(b.red) : null;
    const blue = b.blue.sessionId ? fighterSpot(b.blue) : null;
    const mid = exchange();
    // (the result's message can come a moment before the bout's phase turns: kept until the ring opens)
    if (b.phase === "open" || b.phase === "warmup") s.result = null;
    let goal: Pt = REF_HOME;
    let speed = REF_WALK;
    let face: number | null = Math.atan2(RING.x - REF_HOME.x, RING.z - REF_HOME.z);
    s.look = null;
    // the side of the apron away from the camera (switched only when another is clearly better)
    camera.getWorldDirection(s.view);
    const score = (k: Side) => SIDE_OUT[k].x * s.view.x + SIDE_OUT[k].z * s.view.z;
    const best = (["n", "e", "s", "w"] as Side[]).reduce((a, k) => (score(k) > score(a) ? k : a), s.side);
    if (score(best) > score(s.side) + 0.3) s.side = best;
    if (s.result) {
      // the result: a step to the side of the winner (never in front of them), facing the room with
      // the winner on his right, the hand he raises; no winner (a draw, a No Contest): in the
      // middle, facing the room, to wave it off. (Whoever was put through the ropes, or already
      // walked to the bleachers, is out of it.)
      const inside = (p: Pt | null) => (p && !outsideRopes(p.x, p.z, 0) ? p : null);
      const w = inside(s.result.winner === "red" ? red : s.result.winner === "blue" ? blue : null);
      if (w) {
        // beside them as the room sees it (to the screen's right of the winner, facing the camera:
        // the winner on his right); against the ropes there, the other side, his back to the room
        const vl = Math.hypot(s.view.x, s.view.z) || 1;
        const rx = -s.view.z / vl;
        const rz = s.view.x / vl;
        goal = clampToRing(w.x + rx * 0.8, w.z + rz * 0.8);
        face = Math.atan2(-s.view.x, -s.view.z);
        if (Math.hypot(goal.x - w.x, goal.z - w.z) < 0.55) {
          goal = clampToRing(w.x - rx * 0.8, w.z - rz * 0.8);
          face = Math.atan2(s.view.x, s.view.z);
        }
        s.look = w;
      } else {
        goal = { x: RING.x, z: RING.z };
        face = Math.atan2(-s.view.x, -s.view.z);
        s.look = null;
      }
    } else if (b.phase === "count" && s.countTo) {
      // rushing in to the one down: beside them, away from the other, counting over them
      const downed = b.red.sessionId === s.countTo ? red : blue;
      const other = b.red.sessionId === s.countTo ? blue : red;
      if (downed) {
        let ux = other ? downed.x - other.x : 1;
        let uz = other ? downed.z - other.z : 0;
        const ul = Math.hypot(ux, uz) || 1;
        ux /= ul;
        uz /= ul;
        goal = clampToRing(downed.x + ux * 0.4 - uz * 0.75, downed.z + uz * 0.4 + ux * 0.75);
        face = Math.atan2(downed.x - goal.x, downed.z - goal.z);
        s.look = downed;
        speed = REF_RUSH;
      }
    } else if (b.phase === "fight" || b.phase === "count") {
      // walking the far apron, keeping level with the exchange, eyes on it
      const along = s.side === "n" || s.side === "s" ? mid.x - RING.x : mid.z - RING.z;
      goal = apronAt(s.side, along * 0.8 + Math.sin(t * 0.45) * 0.6);
      face = Math.atan2(mid.x - m.x, mid.z - m.z);
      s.look = mid;
    } else if (b.phase === "warmup" && red && blue) {
      // the instructions: in the middle, a step off the line between them, facing them
      const ax = blue.x - red.x;
      const az = blue.z - red.z;
      const len = Math.hypot(ax, az) || 1;
      let px = -az / len;
      let pz = ax / len;
      if (px * s.view.x + pz * s.view.z < 0) {
        px = -px;
        pz = -pz;
      }
      goal = clampToRing(mid.x + px * 0.9, mid.z + pz * 0.9);
      face = Math.atan2(mid.x - goal.x, mid.z - goal.z);
      s.look = mid;
    }
    // the way there
    const next = refNext(m, goal);
    const dx = next.x - m.x;
    const dz = next.z - m.z;
    const far = Math.hypot(dx, dz);
    const step = Math.min(far, speed * dt);
    let moving = 0;
    if (far > 0.04) {
      m.x += (dx / far) * step;
      m.z += (dz / far) * step;
      moving = speed > REF_WALK ? 1 : 0.8;
      m.yaw = turnTo(m.yaw, Math.atan2(dx, dz), 1 - Math.exp(-14 * dt));
    } else if (face !== null) m.yaw = turnTo(m.yaw, face, 1 - Math.exp(-8 * dt));
    m.moving += (moving - m.moving) * Math.min(1, dt * 8);
    // through the ropes, a duck under them
    const edge = Math.max(Math.abs(m.x - RING.x), Math.abs(m.z - RING.z));
    const duck = moving && edge > RING.rope - 0.25 && edge < RING.rope + 0.12 ? 0.1 : 0;
    m.y += (F - duck - m.y) * Math.min(1, dt * 12);
    // the result: arrived between them, the winner's arm up, then the bout waved off
    const r = s.result;
    if (r && far <= 0.04) {
      if (!r.arrived) r.arrived = t;
      if (r.winner && !r.raised && !r.towel) {
        r.raised = true;
        gestureRef.current?.("raise");
      } else if (!r.waved && (t - r.arrived > GESTURE_S.raise || !r.winner || r.towel)) {
        r.waved = true;
        gestureRef.current?.("waveoff");
      }
    }
  });
  return (
    <CampNpc
      url={RING_REGULARS_URL}
      what="ring_regulars.glb"
      node="Referee"
      prefix="Referee"
      at={{ x: REF_HOME.x, z: REF_HOME.z, yaw: Math.PI / 4 }}
      y={F}
      motion={motion}
      lookAt={() => st.current.look}
      gestureRef={gestureRef}
      fuseArm={false}
      waveEvent="Referee:wave"
      standIn={null}
      subscribeMessages={subscribeMessages}
      talk={{ height: 1.3, clicked: ["Protect yourself at all times. 🐶", "Ref Barnaby. I've seen every kind of punch there is.", "Keep it clean in there! 🔔", "Three knockdowns in a round and I'm stopping it."] }}
    />
  );
}

// --- the regulars, Kip, the trainee ------------------------------------------------------------------

/** The crowd's calls: a Heavy Smash landing (a gasp), a knockdown (a cheer), a round or the result
 *  (applause), a towel (a gasp). */
function crowdCall(type: string, p: any): NpcGesture | null {
  if (type === "boxResult") return "cheer";
  if (type !== "boxEvent") return null;
  const ev = p as BoxEvent;
  if (ev.kind === "hit" && ev.move === "smash") return "gasp";
  if (ev.kind === "knockdown" || ev.kind === "ringout") return "cheer";
  if (ev.kind === "round" || ev.kind === "perfect") return "clap";
  if (ev.kind === "towel") return "gasp";
  if (ev.kind === "bell" && ev.ring === "start") return "clap";
  return null;
}

const FAN_LINES: Record<string, string[]> = {
  RingFan_Raccoon: ["Best seats in the house! 🍿", "C'mon, Red! 📣", "Did you see that dodge?! ⚡"],
  RingFan_Rabbit: ["Go Blue! 💙", "I never miss a fight night. 🥊", "Ooh, that was close!"],
};
const SLEEPY: string[] = ["Zzz... wake me for the main event... 😴", "Mm? Is it fight night yet? 💤"];

/** The regulars on the bleachers (dozing between bouts, leaning in through one), Kip at the heavy
 *  bag, the trainee skipping rope before the mirrors, and the fight night's crowd. */
export function RingRegulars({ subscribeMessages }: { subscribeMessages: Subscribe }) {
  const mood = (): NpcMood => (fightNight() ? "lean" : "doze");
  const gestureOn = (type: string, p: any) => {
    const g = crowdCall(type, p);
    return g ? { gesture: g } : null;
  };
  // (a bout's own claps now and then: never while they doze)
  const refs = useMemo(() => Object.fromEntries(RING_FANS.map((f) => [f.node, { current: null as ((g: NpcGesture) => void) | null }])), []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (getBout().phase !== "fight") return;
      for (const f of RING_FANS) if (Math.random() < 0.3) refs[f.node].current?.("clap");
    }, 3000);
    return () => window.clearInterval(timer);
  }, [refs]);
  return (
    <>
      {RING_FANS.map((fan) => (
        <CampNpc
          key={fan.node}
          url={RING_REGULARS_URL}
          what="ring_regulars.glb"
          node={fan.node}
          prefix={fan.node}
          at={{ x: fan.x, z: fan.z, yaw: fan.yaw }}
          y={fan.y}
          waveEvent={`${fan.node}:wave`}
          standIn={null}
          subscribeMessages={subscribeMessages}
          gestureOn={gestureOn}
          gestureRef={refs[fan.node]}
          mood={mood}
          lookAt={() => (fightNight() ? exchange() : null)}
          fuseArm={false}
          talk={{ height: 1.3, clicked: FAN_LINES[fan.node] ?? SLEEPY }}
        />
      ))}
      <CampNpc
        url={RING_REGULARS_URL}
        what="ring_regulars.glb"
        node="BagBoxer"
        prefix="BagBoxer"
        at={{ x: BAG_BOXER.x, z: BAG_BOXER.z, yaw: BAG_BOXER.yaw }}
        waveEvent="BagBoxer:wave"
        standIn={null}
        subscribeMessages={subscribeMessages}
        idle={{ gesture: "punch", every: 2.2 }}
        fuseArm={false}
        onGesture={(g) => {
          if (g !== "punch") return;
          kipBag.until = performance.now() + 2200;
          kipBag.next = 0;
        }}
        talk={{ height: 1.35, clicked: ["One-two, one-two! 🥊", "Kip's the name. Heavy bag's the game. 🦘", "Stamina's everything, mate. ⚡"] }}
      />
      <CampNpc
        url={RING_REGULARS_URL}
        what="ring_regulars.glb"
        node="Trainee"
        prefix="Trainee"
        at={{ x: TRAINEE.x, z: TRAINEE.z, yaw: TRAINEE.yaw }}
        waveEvent="Trainee:wave"
        standIn={null}
        subscribeMessages={subscribeMessages}
        loop="skip"
        fuseArm={false}
        talk={{ height: 1.3, clicked: ["Two hundred more... huff... 🐶", "Coach says footwork first! 🦶", "Light on the toes, light on the toes!"] }}
      />
      <ModelBoundary what="ring_regulars.glb" fallback={null}>
        <Suspense fallback={null}>
          <RingCrowd subscribeMessages={subscribeMessages} />
        </Suspense>
      </ModelBoundary>
    </>
  );
}

// --- the fight night's crowd -------------------------------------------------------------------------

interface CrowdFan {
  body: THREE.Object3D;
  head: THREE.Object3D | null;
  armR: THREE.Object3D | null;
  armL: THREE.Object3D | null;
  restR: THREE.Euler;
  restL: THREE.Euler;
  y: number;
  yaw: number;
  x: number;
  z: number;
  /** Each fan a beat behind the one before (a wave through the crowd, not a drill). */
  lag: number;
  /** Their own clap now and then. */
  own: { kind: NpcGesture; at: number };
  nextClap: number;
  look: number;
}

/** Five more fans on the bleachers while a bout is on: one skinned mesh (one draw call), faded in and
 *  out, every reaction the regulars have (a beat apart each), leaning in, clapping on their own. */
function RingCrowd({ subscribeMessages }: { subscribeMessages: Subscribe }) {
  const { scene } = useGLTF(RING_REGULARS_URL);
  const rig = useMemo(() => {
    const src = scene.getObjectByName("RingCrowd");
    if (!src) return null;
    const model = src.clone(true);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.traverse((o) => {
      o.raycast = noRaycast;
    });
    const fans: CrowdFan[] = [];
    RING_CROWD.forEach((spot, i) => {
      const get = (part: string) => model.getObjectByName(`${spot.node}_${part}`) ?? null;
      const body = get("Body");
      if (!body) return;
      // each fan on their own spot of the bleachers, facing the ring
      body.position.set(spot.x, spot.y, spot.z);
      body.rotation.set(0, spot.yaw, 0);
      const armR = get("ArmR");
      const armL = get("ArmL");
      fans.push({ body, head: get("Head"), armR, armL, restR: armR ? armR.rotation.clone() : new THREE.Euler(), restL: armL ? armL.rotation.clone() : new THREE.Euler(), y: spot.y, yaw: spot.yaw, x: spot.x, z: spot.z, lag: i * 0.07, own: { kind: "clap", at: -99 }, nextClap: 2 + i * 1.3, look: 0 });
    });
    const first = fans[0]?.body as THREE.Mesh | undefined;
    if (!first?.isMesh) return null;
    const material = ownMaterial(model, first);
    skinParts(model, first, "RingCrowd");
    return { model, fans, material };
  }, [scene]);
  useEffect(() => () => rig?.material.dispose(), [rig]);
  const shared = useRef<{ kind: NpcGesture; at: number }>({ kind: "clap", at: -99 });
  const shown = useRef(0);
  const lean = useRef(0);
  useEffect(
    () =>
      subscribeMessages((type, p) => {
        const g = crowdCall(type, p);
        if (g) shared.current = { kind: g, at: performance.now() / 1000 };
      }),
    [subscribeMessages]
  );
  useFrame(({ clock }, raw) => {
    if (!rig) return;
    const dt = Math.min(raw, 0.1);
    const t = clock.elapsedTime;
    const now = performance.now() / 1000;
    // in and out with the fight night
    const on = fightNight();
    shown.current += ((on ? 1 : 0) - shown.current) * Math.min(1, dt * 1.4);
    const k = shown.current < 0.005 ? 0 : shown.current;
    rig.model.visible = k > 0.01;
    if (!rig.model.visible) return;
    const mat = rig.material;
    mat.opacity = k;
    const clear = k < 0.999;
    if (mat.transparent !== clear) {
      mat.transparent = clear;
      mat.depthWrite = !clear;
      mat.needsUpdate = true;
    }
    lean.current += ((getBout().phase === "fight" || getBout().phase === "count" ? 1 : 0.3) - lean.current) * Math.min(1, dt * 2);
    const ex = exchange();
    const live = getBout().phase === "fight";
    for (const f of rig.fans) {
      // their own clap now and then through a round
      if (live && t > f.nextClap) {
        f.nextClap = t + 4 + Math.random() * 5;
        f.own = { kind: "clap", at: now };
      }
      const sg = shared.current;
      const gsShared = now - sg.at - f.lag;
      const useShared = gsShared >= 0 && gsShared < GESTURE_S[sg.kind];
      const cur = useShared ? sg : f.own;
      const gs = useShared ? gsShared : now - f.own.at;
      const g = gs >= 0 && gs < GESTURE_S[cur.kind] ? cur.kind : null;
      const gu = g ? gs / GESTURE_S[g] : 0;
      const gk = g ? Math.min(1, Math.min(gu, 1 - gu) * 5) : 0;
      // seated: breathing, leaning in, thrown back by a gasp, bouncing for joy; a touch lower as they fade
      const joy = g === "cheer" || g === "clap" ? Math.abs(Math.sin(gs * Math.PI * 3)) * (g === "cheer" ? 0.09 : 0.05) * gk : 0;
      f.body.position.y = f.y + joy - (1 - k) * 0.12;
      f.body.rotation.x = 0.2 * lean.current - (g === "gasp" ? 0.24 * gk : 0);
      f.body.scale.set(1 + 0.01 * Math.sin(t * 2.1 + f.lag * 20), 1 + 0.018 * Math.sin(t * 2.1 + 0.4 + f.lag * 20), 1);
      if (f.head) {
        const toward = Math.atan2(ex.x - f.x, ex.z - f.z) - f.yaw;
        const want = Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(toward), Math.cos(toward))));
        f.look += (want - f.look) * Math.min(1, dt * 4);
        f.head.rotation.y = f.look;
        f.head.rotation.x = g === "gasp" ? -0.2 * gk : g === "cheer" ? -0.15 * gk : 0;
      }
      const rest = (side: 1 | -1) => ({ x: -0.35 * lean.current, z: side * 0.1 * lean.current });
      if (f.armR) {
        const r = g ? gestureArm(g, gs, gk, 1) : rest(1);
        f.armR.rotation.set(f.restR.x + r.x, f.restR.y, f.restR.z + r.z);
      }
      if (f.armL) {
        const r = g ? gestureArm(g, gs, gk, -1) : rest(-1);
        f.armL.rotation.set(f.restL.x + r.x, f.restL.y, f.restL.z + r.z);
      }
    }
  });
  return rig ? <primitive object={rig.model} /> : null;
}
