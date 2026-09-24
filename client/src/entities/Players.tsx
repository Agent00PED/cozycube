import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Room } from "colyseus.js";
import type * as THREE from "three";
import type { Gesture, MapId, PlayerState } from "@shared/types";
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
    action: player.action,
    speaking: player.speaking || feed.speakingUserIds.has(player.userId),
    emotes: feed.emotes[player.sessionId] ?? NO_EMOTES,
    gesture: feed.gestures[player.sessionId] ?? null,
    status: player.status,
    bubble: feed.bubbles[player.sessionId] ?? null,
  };
}

/** You: the client is the authority on where you are (useLocalPlayerMovement). */
export function LocalPlayerAvatar({ player, room, mapId, targetRef, feed }: { player: PlayerState; room: Room | null; mapId: MapId; targetRef: React.MutableRefObject<MoveTarget | null>; feed: CrowdFeed }) {
  const groupRef = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  useLocalPlayerMovement(groupRef, room, player, targetRef, speedRef, mapId);
  return <Avatar ref={groupRef} speedRef={speedRef} {...avatarProps(player, feed)} />;
}

// Remote players are drawn where the server last said they were, eased toward it. Reports arrive
// ~16 times a second; the ease turns those steps into a walk.
const FOLLOW_RATE = 11; // 1/s
const SNAP_DISTANCE = 4; // a bigger jump is a teleport (a map change, standing up): don't glide across the room
const FULL_SPEED = 3; // units/s, the walking speed
const HEIGHT_LERP = 0.2;
const TURN_LERP = 0.22;

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

    const dx = p.x - d.x;
    const dz = p.z - d.z;
    let moved = 0;
    if (!d.ready || Math.hypot(dx, dz) > SNAP_DISTANCE) {
      d.x = p.x;
      d.z = p.z;
      d.ready = true;
    } else {
      const k = 1 - Math.exp(-FOLLOW_RATE * delta);
      d.x += dx * k;
      d.z += dz * k;
      moved = Math.hypot(dx * k, dz * k);
      if (!p.sitting && moved > 0.002) d.facing = turn(d.facing, Math.atan2(dx, dz), TURN_LERP);
    }
    // the gait is measured from what is actually drawn, so the feet match the ground
    const speed = p.sitting || delta <= 0 ? 0 : Math.min(1, moved / delta / FULL_SPEED);
    speedRef.current += (speed - speedRef.current) * 0.3;

    if (p.sitting) d.facing = p.sitRotationY;
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
