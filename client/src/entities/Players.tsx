import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Room } from "colyseus.js";
import type * as THREE from "three";
import { type Gesture, type MapId, type PlayerState } from "@shared/types";
import { CAMPFIRE_LAYOUT, nearestFishingSpot } from "@shared/worlds/campfire";
import { faceHeading } from "../systems/faceTargets";
import { liveMotion, type MotionSample } from "../systems/liveMotion";
import { useLocalPlayerMovement, type MoveTarget } from "../systems/useLocalPlayerMovement";
import { Avatar, type FloatingEmote } from "./Avatar";

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
}

/** Where an angler's bobber floats on the campfire's river: out from the dock spot they fish from
 *  (each spot has its own float, and only one angler at a time). */
export function bobberFor(player: PlayerState, mapId: MapId) {
  if (mapId !== "campfire_night" || (player.action !== "fish" && player.action !== "reel")) return null;
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
    awaiting: feed.awaiting.has(player.sessionId),
    snack: player.snack,
    actionProgress: player.actionProgress,
    bobberAt: bobberFor(player, feed.mapId),
  };
}

/** You: the client is the authority on where you are (useLocalPlayerMovement). */
export function LocalPlayerAvatar({ player, room, mapId, targetRef, feed }: { player: PlayerState; room: Room | null; mapId: MapId; targetRef: React.MutableRefObject<MoveTarget | null>; feed: CrowdFeed }) {
  const groupRef = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  useLocalPlayerMovement(groupRef, room, player, targetRef, speedRef, mapId);
  return <Avatar ref={groupRef} speedRef={speedRef} {...avatarProps(player, feed)} onHook={room ? () => room.send("hook") : undefined} />;
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
const HEIGHT_LERP = 0.2;
const TURN_LERP = 0.22;

/** Where the samples put a player at time `t` (performance.now ms). */
function sampleAt(samples: MotionSample[], t: number): { x: number; z: number } {
  const last = samples[samples.length - 1];
  if (t >= last.t) {
    const prev = samples[samples.length - 2];
    if (!prev || last.t - prev.t <= 0) return last;
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

    const live = liveMotion.get(p.sessionId);
    const goal = live && !p.sitting ? sampleAt(live.samples, performance.now() - INTERP_DELAY_MS) : p;
    const dx = goal.x - d.x;
    const dz = goal.z - d.z;
    let moved = 0;
    if (!d.ready || Math.hypot(dx, dz) > SNAP_DISTANCE) {
      d.x = goal.x;
      d.z = goal.z;
      d.ready = true;
    } else {
      d.x = goal.x;
      d.z = goal.z;
      moved = Math.hypot(dx, dz);
      if (!p.sitting && moved > 0.002) d.facing = turn(d.facing, Math.atan2(dx, dz), TURN_LERP);
    }
    // the gait is measured from what is actually drawn, so the feet match the ground
    const speed = p.sitting || delta <= 0 ? 0 : Math.min(1, moved / delta / FULL_SPEED);
    speedRef.current += (speed - speedRef.current) * 0.3;

    if (p.sitting) d.facing = p.sitRotationY;
    else if (moved <= 0.002) {
      // standing still with something to face (the plant being watered): turn to it
      const heading = faceHeading(p.sessionId, d.x, d.z);
      if (heading !== null) d.facing = turn(d.facing, heading, TURN_LERP);
    }
    d.seatY += ((p.sitting ? p.sitY : 0) - d.seatY) * HEIGHT_LERP;
    g.position.set(d.x, d.seatY, d.z);
    g.rotation.y = d.facing;
  });

  return <Avatar ref={groupRef} speedRef={speedRef} {...avatarProps(player, feed)} />;
});

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
