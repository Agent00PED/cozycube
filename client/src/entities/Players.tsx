import { SEA_Y } from "@shared/worlds/beach";
import { FOREST_FISHING, FOREST_LAYOUT } from "@shared/worlds/forest";
import { wornBackOf } from "@shared/gear";
import { CAVE_WATER_Y, floatY } from "@shared/worlds/caverns";
import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Room } from "colyseus.js";
import type * as THREE from "three";
import { type Gesture, type MapId, type PlayerState } from "@shared/types";
import { walkY } from "@shared/collision";
import { CAMPFIRE_LAYOUT, nearestFishingSpot } from "@shared/worlds/campfire";
import { faceHeading, workHeading } from "../systems/faceTargets";
import { liveMotion, type MotionSample } from "../systems/liveMotion";
import { useLocalPlayerMovement, type MoveTarget } from "../systems/useLocalPlayerMovement";
import { Avatar, type FloatingEmote } from "./Avatar";
import { getBout } from "../systems/boutStore";
import { beltUntilOf, gloveLook } from "@shared/boxing";
import { drawnAt, fighterSpot } from "../systems/fightAnim";
import { riderPose } from "../scene/winchRide";
import { pickWeightOf } from "./activityAnimations";

// The people in the scene: your own avatar, driven by the locomotion hook, and every other
// connected player, eased toward the position the server relays. Both are the same Avatar
// underneath; only what moves the outer group differs.

export interface GestureState {
  kind: Gesture;
  at: number;
}
export interface BubbleState {
  id: number;
  text: string;
}

/** The per-session one-shots and the voice roster every avatar reads. */
export interface CrowdFeed {
  speakingUserIds: ReadonlySet<string>;
  emotes: Record<string, FloatingEmote[]>;
  gestures: Record<string, GestureState>;
  bubbles: Record<string, BubbleState>;
  /** Session ids seated on a cushion round the radio while it plays (they groove to it). */
  vibing: ReadonlySet<string>;
  /** Session ids seated at the board while it is the opponent's move (they wait, head tilted). */
  awaiting: ReadonlySet<string>;
  /** The world everyone is in (where a fishing line goes). */
  mapId: MapId;
  /** Session ids sitting in the campfire's canoe (they rock with it). */
  rocking: ReadonlySet<string>;
  /** Session ids on the campfire's bench swing, and how far each hangs under its beam (m). */
  swinging: ReadonlyMap<string, number>;
  /** Session ids lying on a slope (the stargazers' blankets), and how far each head is raised (rad). */
  tilts: ReadonlyMap<string, number>;
}

/** Where an angler's bobber floats on the campfire's river: out from the dock spot they fish from
 *  (each spot has its own float, and only one angler at a time). */
export function bobberFor(player: PlayerState, mapId: MapId) {
  if (player.action !== "fish" && player.action !== "reel" && player.action !== "afkfish") return null;
  if (mapId === "whispering_woods") {
    // the river: the float lands off the bank spot the angler stands (or sits) at
    const spot = FOREST_FISHING.reduce((a, b) => (Math.hypot(b.stand.x - player.x, b.stand.z - player.z) < Math.hypot(a.stand.x - player.x, a.stand.z - player.z) ? b : a));
    return { x: spot.bobber.x, y: FOREST_LAYOUT.river.water, z: spot.bobber.z };
  }
  if (mapId === "glimmering_caverns") {
    // the Cenote: where their cast from the shore landed (the server's `floatX` / `floatZ`)
    if (!player.floatX && !player.floatZ) return null;
    return { x: player.floatX, y: floatY(player.floatX, player.floatZ), z: player.floatZ };
  }
  if (mapId === "sunset_beach" || mapId === "open_sea" || mapId === "hidden_cove") {
    // the sea: where their cast landed, on the water
    if (!player.floatX && !player.floatZ) return null;
    return { x: player.floatX, y: SEA_Y, z: player.floatZ };
  }
  if (mapId !== "campfire_night") return null;
  const { bobber } = nearestFishingSpot(player.x, player.z);
  return { x: bobber.x, y: CAMPFIRE_LAYOUT.river.water, z: bobber.z };
}

const NO_EMOTES: FloatingEmote[] = [];

function avatarProps(player: PlayerState, feed: CrowdFeed) {
  return {
    userId: player.userId,
    look: player.look,
    color: player.color,
    username: player.username,
    pose: player.sitting ? player.sitPose : ("stand" as const),
    holding: player.holding,
    drink: player.drink,
    action: player.action,
    speaking: player.speaking || feed.speakingUserIds.has(player.userId),
    emotes: feed.emotes[player.sessionId] ?? NO_EMOTES,
    gesture: feed.gestures[player.sessionId] ?? null,
    status: player.status,
    bubble: feed.bubbles[player.sessionId] ?? null,
    vibe: feed.vibing.has(player.sessionId),
    rock: feed.rocking.has(player.sessionId),
    swing: feed.swinging.get(player.sessionId) ?? 0,
    lieTilt: feed.tilts.get(player.sessionId) ?? 0,
    awaiting: feed.awaiting.has(player.sessionId),
    snack: player.snack,
    actionProgress: player.actionProgress,
    bobberAt: bobberFor(player, feed.mapId),
    fed: player.fed > 0,
    rodAura: player.fishing.includes('"rod":"starlight"'),
    title: player.title,
    aura: player.aura,
    // the Velvet Ring: the gloves while in it, the fighter's state (their own subscription), and the
    // Velvet Championship Belt over the name while it is worn
    sessionId: player.sessionId,
    gloves: player.corner ? gloveLook(player.gloves, player.corner) : "",
    // the gear's back piece worn (read off the synced camp profile)
    back: wornBackOf(player.fishing),
    champion: beltUntilOf(player.boxing) > Date.now(),
    // the Glimmering Caverns: the world (the rope descent) and how heavily their pickaxe swings
    map: player.map,
    pickWeight: player.map === "glimmering_caverns" ? pickWeightOf(player.fishing) : 1,
  };
}

/** You: the client is the authority on where you are (useLocalPlayerMovement). */
export function LocalPlayerAvatar({ player, room, mapId, targetRef, feed }: { player: PlayerState; room: Room | null; mapId: MapId; targetRef: React.MutableRefObject<MoveTarget | null>; feed: CrowdFeed }) {
  const groupRef = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  useLocalPlayerMovement(groupRef, room, player, targetRef, speedRef, mapId);
  return <Avatar ref={groupRef} speedRef={speedRef} {...avatarProps(player, feed)} onHook={room ? () => room.send("hook") : undefined} xray local />;
}

// Remote players are drawn a little in the past, interpolated between the positions the server
// relayed (liveMotion keeps them with their arrival times). Reports arrive ~16 times a second but
// unevenly, bunched and gapped by the network; chasing each one made the walk surge and stall.
// Rendering INTERP_DELAY_MS behind the newest sample puts two samples either side of the drawn
// moment almost always, so the walk runs at an even speed. Starved of samples (a gap longer than
// the delay), the player coasts on for a moment and then waits where they were last seen.
const INTERP_DELAY_MS = 120;
const MAX_COAST_MS = 100;
const SNAP_DISTANCE = 4; // a bigger jump is a teleport (a map change, standing up): don't glide across the room
const FULL_SPEED = 3; // units/s, the walking speed
/** How much faster than a walk a step may look (bunched reports) and still be coasted on. */
const MAX_WALK_OVER = 2.5;
const HEIGHT_LERP = 0.2;
/** The turn to the way they walk (rad/s, an exponential approach), and a fighter's lock onto the other. */
const TURN_RATE = 22;
const LOCK_RATE = 40;

/** Where the samples put a player at time `t` (performance.now ms). */
function sampleAt(samples: MotionSample[], t: number): { x: number; z: number } {
  const last = samples[samples.length - 1];
  if (t >= last.t) {
    const prev = samples[samples.length - 2];
    if (!prev || last.t - prev.t <= 0) return last;
    // a step no walk could make (the server setting someone down: a corner of the ring, a
    // knockback, a slip) is never coasted on: they would be drawn metres past where they landed
    if (Math.hypot(last.x - prev.x, last.z - prev.z) / ((last.t - prev.t) / 1000) > FULL_SPEED * MAX_WALK_OVER) return last;
    const ahead = Math.min(t - last.t, MAX_COAST_MS) / (last.t - prev.t);
    return { x: last.x + (last.x - prev.x) * ahead, z: last.z + (last.z - prev.z) * ahead };
  }
  for (let i = samples.length - 1; i > 0; i--) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a.t <= t) {
      if (Math.hypot(b.x - a.x, b.z - a.z) > SNAP_DISTANCE) return b; // a teleport: never glide across the room
      const f = (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    }
  }
  return samples[0];
}

function turn(from: number, to: number, k: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}

const RemotePlayerAvatar = memo(function RemotePlayerAvatar({ player, feed }: { player: PlayerState; feed: CrowdFeed }) {
  const groupRef = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  const latest = useRef(player);
  latest.current = player;
  const drawn = useRef({ x: player.x, z: player.z, seatY: 0, facing: player.sitRotationY, ready: false });

  useFrame((_, rawDelta) => {
    const g = groupRef.current;
    if (!g) return;
    const delta = Math.min(rawDelta, 0.1);
    const p = latest.current;
    const d = drawn.current;

    // riding Gus's winch up: the climb drawn the same on every client (the server has them on the
    // ledge already)
    const ride = feed.mapId === "glimmering_caverns" ? riderPose(p.sessionId, p.action) : null;
    if (ride) {
      d.x = ride.x;
      d.z = ride.z;
      d.seatY = ride.y;
      d.facing = ride.facing;
      d.ready = true;
      speedRef.current += ((ride.walking ? 0.55 : 0) - speedRef.current) * 0.3;
      g.position.set(d.x, d.seatY, d.z);
      g.rotation.y = d.facing;
      return;
    }

    const foe = p.corner && feed.mapId === "boxing_ring" ? fighterFoe(p.sessionId) : undefined;
    const live = liveMotion.get(p.sessionId);
    const goal = live && !p.sitting ? sampleAt(live.samples, performance.now() - INTERP_DELAY_MS) : p;
    const dx = goal.x - d.x;
    const dz = goal.z - d.z;
    let moved = 0;
    if (!d.ready || Math.hypot(dx, dz) > SNAP_DISTANCE) {
      d.x = goal.x;
      d.z = goal.z;
      // first seen (arriving from another world, say): feet straight on the floor there
      if (!d.ready) d.seatY = p.sitting ? p.sitY : walkY(feed.mapId, d.x, d.z);
      d.ready = true;
    } else {
      d.x = goal.x;
      d.z = goal.z;
      moved = Math.hypot(dx, dz);
      // (a fighter in a bout keeps their torso on the other one: the feet strafe, the body never turns)
      if (!p.sitting && !foe && moved > 0.002) d.facing = turn(d.facing, Math.atan2(dx, dz), 1 - Math.exp(-TURN_RATE * delta));
    }
    // the gait is measured from what is actually drawn, so the feet match the ground
    const speed = p.sitting || delta <= 0 ? 0 : Math.min(1, moved / delta / FULL_SPEED);
    speedRef.current += (speed - speedRef.current) * 0.3;

    if (p.sitting) d.facing = p.sitRotationY;
    else if (foe && Math.hypot(foe.x - d.x, foe.z - d.z) > 0.05) {
      // a fighter locked onto the other one, whichever way they step
      d.facing = turn(d.facing, Math.atan2(foe.x - d.x, foe.z - d.z), 1 - Math.exp(-LOCK_RATE * delta));
    } else if (moved <= 0.002) {
      // standing still with something to face (the plant being watered): turn to it
      const heading = faceHeading(p.sessionId, d.x, d.z) ?? workHeading(feed.mapId, p.action, d.x, d.z);
      if (heading !== null) d.facing = turn(d.facing, heading, 1 - Math.exp(-TURN_RATE * delta));
    }
    d.seatY += ((p.sitting ? p.sitY : walkY(feed.mapId, d.x, d.z)) - d.seatY) * HEIGHT_LERP;
    g.position.set(d.x, d.seatY, d.z);
    g.rotation.y = d.facing;
    // (the ring's action camera frames the two fighters where they are drawn)
    if (p.corner) drawnAt.set(p.sessionId, { x: d.x, z: d.z });
  });

  return <Avatar ref={groupRef} speedRef={speedRef} {...avatarProps(player, feed)} />;
});

/** Where the fighter `sessionId` is up against stands now (undefined: not in a bout). */
function fighterFoe(sessionId: string): { x: number; z: number } | undefined {
  const b = getBout();
  const other = b.red.sessionId === sessionId ? b.blue : b.blue.sessionId === sessionId ? b.red : null;
  return (other && fighterSpot(other)) ?? undefined;
}

/** Everyone else in the room: the remote half of the Colyseus player map. */
export function OtherPlayers({ players, localSessionId, feed }: { players: Record<string, PlayerState>; localSessionId: string | null; feed: CrowdFeed }) {
  return (
    <>
      {Object.values(players)
        .filter((p) => p.connected && p.sessionId !== localSessionId)
        .map((p) => (
          <RemotePlayerAvatar key={p.sessionId} player={p} feed={feed} />
        ))}
    </>
  );
}
