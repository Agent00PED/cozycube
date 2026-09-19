import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Group } from "three";
import type { Room } from "colyseus.js";
import { Character3D, type CharacterPose, type FloatingEmote } from "./Character3D";
import { ChairProp } from "./ChairProp";
import { ToggleableProp } from "./ToggleableProp";
import { ClickMarker } from "./ClickMarker";
import { DioramaRoom } from "../scene/DioramaRoom";
import { Footprints } from "../scene/Footprints";
import { StaticBatch } from "../scene/kit";
import { Volleyball } from "./Volleyball";
import { BetChips, Leaderboard, RouletteWheel } from "./Casino";
import { Dealer } from "./LivingProps";
import { Critters } from "../scene/Critters";
import { RoomEventsContext } from "../scene/roomEvents";
import { ROOM_THEMES, TIME_PRESETS, type RoomTheme, type TimePreset } from "../scene/roomThemes";
import { TimeOfDayContext } from "../scene/timeOfDay";
import { useLocalPlayerMovement, type MoveTarget } from "../systems/useLocalPlayerMovement";
import type { BallSnapshot, EmoteListener, RoomMessageListener } from "../hooks/useColyseusRoom";
import { requestRecenter } from "../scene/cameraFocus";
import { APPROACH_POINTS } from "@shared/props";
import {
  GESTURE_SECONDS,
  isWalkUpProp,
  type Gesture,
  type GestureBroadcast,
  type RouletteSyncState,
  type ChairSyncState,
  type MapId,
  type PlayerState,
  type TimeOfDay,
  type ToggleableSyncState,
} from "@shared/types";

const EMOTE_LIFETIME_MS = 1900; // matches the .cozy-emote CSS animation in App.tsx
const MAX_EMOTES_PER_PLAYER = 4;
const NO_EMOTES: FloatingEmote[] = [];

interface WorldSceneProps {
  room: Room | null;
  players: Record<string, PlayerState>;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string | null;
  mapId: MapId;
  timeOfDay: TimeOfDay;
  /** Discord user ids the SDK reports as speaking (unioned with the relayed `player.speaking`). */
  speakingUserIds: ReadonlySet<string>;
  subscribeEmotes: (listener: EmoteListener) => () => void;
  ballRef: React.MutableRefObject<BallSnapshot | null>;
  onKickBall: (dirX: number, dirZ: number) => void;
  roulette: RouletteSyncState;
  bets: Record<string, string>;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

type ActiveGesture = { kind: Gesture; at: number };

import { interactBridge } from "../scene/interactBridge";
export function WorldScene({
  room,
  players,
  chairs,
  toggleables,
  localSessionId,
  mapId,
  timeOfDay,
  speakingUserIds,
  subscribeEmotes,
  ballRef,
  onKickBall,
  roulette,
  bets,
  subscribeMessages,
}: WorldSceneProps) {
  const theme = ROOM_THEMES[mapId];

  // Click-to-move target, shared between click handlers, the movement hook, and the marker.
  const moveTargetRef = useRef<MoveTarget | null>(null);
  // Separate from the target: the ripple fires on the click itself, including clicks that set
  // no target at all, and must retrigger when the same spot is clicked twice.
  const rippleRef = useRef({ x: 0, z: 0, id: 0 });

  // Click handlers read the latest room/players through refs so their identities never change.
  // That stability is what lets ProceduralRoom, ChairProp and ToggleableProp skip re-rendering
  // on the ~20 state patches per second a walking player generates.
  const roomRef = useRef(room);
  roomRef.current = room;
  const localSittingRef = useRef(false);
  localSittingRef.current = !!(localSessionId && players[localSessionId]?.sitting);

  const pingRipple = (x: number, z: number) => {
    rippleRef.current = { x, z, id: rippleRef.current.id + 1 };
    // Any order you give the character pulls the camera back onto them — otherwise you would
    // walk off the edge of a panned-away view and lose yourself.
    requestRecenter();
  };
  const standUpIfSeated = () => {
    if (localSittingRef.current) roomRef.current?.send("standUp");
  };

  const handleFloorClick = useCallback((x: number, z: number) => {
    moveTargetRef.current = { x, z };
    pingRipple(x, z);
    // Clicking open ground always releases the seat first, so the walk can start immediately.
    standUpIfSeated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSeatClick = useCallback((chair: ChairSyncState) => {
    const approach = APPROACH_POINTS[chair.propId] ?? { x: chair.x, z: chair.z };
    // Somebody else is sitting there — walk over next to them rather than doing nothing.
    const taken = chair.occupiedBy !== "" && chair.occupiedBy !== roomRef.current?.sessionId;
    standUpIfSeated();
    // Always walk to the APPROACH point, never onto the seat itself: seats sit inside their
    // furniture's collision box, so a straight walk onto them would be rejected by the server.
    moveTargetRef.current = { x: approach.x, z: approach.z, seatId: taken ? undefined : chair.propId };
    pingRipple(approach.x, approach.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseProp = useCallback((prop: ToggleableSyncState) => {
    if (isWalkUpProp(prop.kind)) {
      // Sparkles wander (the server moves them), so walk right onto wherever one is now.
      const approach = prop.kind === "sparkle" ? { x: prop.x, z: prop.z } : APPROACH_POINTS[prop.propId] ?? { x: prop.x, z: prop.z + 1 };
      standUpIfSeated();
      moveTargetRef.current = { x: approach.x, z: approach.z, propId: prop.propId };
      pingRipple(approach.x, approach.z);
    } else {
      // Lights, TV and campfire respond instantly from anywhere — shared ambience.
      roomRef.current?.send("useProp", { propId: prop.propId });
      pingRipple(prop.x, prop.z);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The HUD's proximity action dock triggers these same handlers by id.
  const syncedRef = useRef({ chairs, toggleables });
  syncedRef.current = { chairs, toggleables };
  useEffect(() => {
    interactBridge.current = {
      useProp: (id) => {
        const prop = syncedRef.current.toggleables[id];
        if (prop) handleUseProp(prop);
      },
      sit: (id) => {
        const chair = syncedRef.current.chairs[id];
        if (chair) handleSeatClick(chair);
      },
      walkTo: (x, z) => {
        standUpIfSeated();
        moveTargetRef.current = { x, z };
        pingRipple(x, z);
      },
    };
    return () => {
      interactBridge.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleUseProp, handleSeatClick]);

  // --- floating emotes (one-shot broadcasts, not synced state) ---
  const [emotes, setEmotes] = useState<Record<string, FloatingEmote[]>>({});
  const emoteIdRef = useRef(0);
  useEffect(() => {
    const timers = new Set<number>();
    const unsubscribe = subscribeEmotes(({ sessionId, emoji }) => {
      const id = ++emoteIdRef.current;
      setEmotes((prev) => ({
        ...prev,
        [sessionId]: [...(prev[sessionId] ?? []), { id, emoji }].slice(-MAX_EMOTES_PER_PLAYER),
      }));
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setEmotes((prev) => {
          const remaining = (prev[sessionId] ?? []).filter((e) => e.id !== id);
          const next = { ...prev };
          if (remaining.length) next[sessionId] = remaining;
          else delete next[sessionId];
          return next;
        });
      }, EMOTE_LIFETIME_MS);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [subscribeEmotes]);

  // --- social gestures (wave, dance, cheers, nap): one-shot broadcasts, held for their duration ---
  const [gestures, setGestures] = useState<Record<string, ActiveGesture>>({});
  useEffect(() => {
    const timers = new Set<number>();
    const unsubscribe = subscribeMessages((type, payload) => {
      if (type !== "gesture") return;
      const { sessionId, gesture } = payload as GestureBroadcast;
      const entry = { kind: gesture, at: performance.now() };
      setGestures((prev) => ({ ...prev, [sessionId]: entry }));
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setGestures((prev) => {
          if (prev[sessionId] !== entry) return prev;
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      }, GESTURE_SECONDS[gesture] * 1000 + 200);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [subscribeMessages]);

  const roomEvents = useMemo(() => ({ subscribeMessages, localSessionId }), [subscribeMessages, localSessionId]);
  const isCasino = mapId === "velvet_casino";

  const chairSetKey = useMemo(() => Object.keys(chairs).sort().join(","), [chairs]);
  const anyoneBrewing = useMemo(() => Object.values(players).some((p) => p.action === "brew"), [players]);

  return (
    <RoomEventsContext.Provider value={roomEvents}>
    <TimeOfDayContext.Provider value={timeOfDay}>
      <RoomLighting theme={theme} preset={TIME_PRESETS[timeOfDay]} mapId={mapId} />
      {/* key={mapId} forces a full unmount of the old world before the new one mounts, instead of
          React diffing/reusing nodes across themes. */}
      <DioramaRoom key={mapId} mapId={mapId} onFloorClick={handleFloorClick} />

      <ClickMarker targetRef={moveTargetRef} rippleRef={rippleRef} />
      {mapId === "sunset_beach" && <Footprints />}
      {mapId === "sunset_beach" && <Volleyball ballRef={ballRef} onKick={onKickBall} />}
      <Critters mapId={mapId} />
      {isCasino && (
        <>
          <RouletteWheel roulette={roulette} />
          <BetChips bets={bets} players={players} />
          <Leaderboard players={players} />
          <Dealer phase={roulette.phase} />
        </>
      )}

      {/* Seats are static furniture once a map is loaded, so their meshes are merged into a
          handful of draw calls — re-merged only when the set of seats changes (a map change). */}
      <StaticBatch version={chairSetKey}>
        {Object.values(chairs).map((chair) => (
          <ChairProp key={chair.propId} chair={chair} onSeatClick={handleSeatClick} />
        ))}
      </StaticBatch>
      {Object.values(toggleables).map((prop) => (
        <ToggleableProp key={prop.propId} prop={prop} onUse={handleUseProp} brewing={prop.kind === "espresso" && anyoneBrewing} />
      ))}

      {Object.entries(players).map(([sessionId, player]) => {
        // A dropped player is held server-side for 30s in case they reconnect. Don't leave their
        // avatar standing frozen in the room meanwhile — the roster already hides them too.
        if (!player.connected) return null;
        const speaking = player.speaking || speakingUserIds.has(player.userId);
        const playerEmotes = emotes[sessionId] ?? NO_EMOTES;
        return sessionId === localSessionId ? (
          <LocalPlayerAvatar
            key={sessionId}
            room={room}
            player={player}
            targetPosRef={moveTargetRef}
            speaking={speaking}
            emotes={playerEmotes}
            mapId={mapId}
            gesture={gestures[sessionId] ?? null}
          />
        ) : (
          <RemotePlayerAvatar key={sessionId} player={player} speaking={speaking} emotes={playerEmotes} gesture={gestures[sessionId] ?? null} />
        );
      })}
    </TimeOfDayContext.Provider>
    </RoomEventsContext.Provider>
  );
}

const RoomLighting = memo(function RoomLighting({ theme, preset, mapId }: { theme: RoomTheme; preset: TimePreset; mapId: MapId }) {
  const { scene } = useThree();
  // Sky and haze live on the scene itself rather than on a mesh, so they cost nothing to draw
  // and the floating diorama reads against an actual horizon colour instead of flat black.
  useEffect(() => {
    const sky = new THREE.Color(preset.sky);
    scene.background = sky;
    scene.fog = preset.fog ? new THREE.Fog(sky.getHex(), preset.fog[0], preset.fog[1]) : null;
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene, preset]);

  // The theme sets the ROOM's own character (a warm penthouse, a cold clearing); the time
  // preset sets the hour. Multiplying the two keeps the campfire night blue at noon rather
  // than washing both maps to the same grade.
  const ambientIntensity = theme.ambientIntensity * preset.ambientIntensity * 1.6;
  const sunIntensity = theme.directionalIntensity * preset.sunIntensity;

  // Indoors the sun has to come from the OPEN corner (+X/+Z). The lounge's two walls stand on
  // the far side, and a sun from behind them laid a slab of shadow across most of the floor.
  // It still has to stay off the camera's own (1,1,1) bearing or every shadow hides behind its
  // caster, so this leans the light toward +X and lifts it rather than matching the camera.
  const indoors = mapId === "cozy_lounge" || mapId === "velvet_casino";
  // The casino has no windows: its own warm gold replaces the hour's sky-tinted fill.
  const ambientColor = mapId === "velvet_casino" ? theme.ambient : preset.ambientColor;
  const sun: [number, number, number] = indoors
    ? [Math.abs(preset.sun[0]) + 6, preset.sun[1] + 10, Math.abs(preset.sun[2]) + 8]
    : preset.sun;

  return (
    <>
      <ambientLight intensity={ambientIntensity} color={ambientColor} />
      <hemisphereLight intensity={ambientIntensity * 0.35} color={preset.sky} groundColor={theme.floor} />
      {/* Shadow-free fill from the camera side. It costs one more light for the whole scene and
          it is what keeps wood, sand and skin their own colour inside the shadows instead of
          taking the grade's tint. */}
      <directionalLight position={[16, 14, 22]} intensity={sunIntensity * 0.28} color={preset.fillColor} />
      {/* Cold rim light from behind, so pines, tents and characters keep an edge after dark
          instead of silhouetting into one black mass. */}
      <directionalLight position={[-18, 9, -16]} intensity={preset.rimIntensity} color={preset.rimColor} />
      <directionalLight
        // Deliberately OFF the camera's azimuth. The iso camera looks along (1,1,1); a light on
        // the same bearing throws every shadow directly behind its own caster, hidden from view,
        // which looks identical to having no shadows at all. Swinging it toward +X separates the
        // two bearings, and keeping it on the open side of the room means the back walls never
        // shadow the interior.
        position={sun}
        intensity={sunIntensity}
        color={preset.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        // Negative bias pushes the depth comparison away from the surface, killing the
        // self-shadowing "acne" you otherwise get on large flat floors.
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        // Tight to the 20x20 slab (half-diagonal ~14). At 2048 px over 26 units that is ~79
        // texels per world unit, so contact shadows stay crisp instead of blocky — and a
        // smaller frustum is also less for the shadow pass to cover.
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
    </>
  );
});

function poseOf(player: PlayerState): CharacterPose {
  return player.sitting ? player.sitPose : "stand";
}

function LocalPlayerAvatar({
  room,
  player,
  targetPosRef,
  speaking,
  emotes,
  mapId,
  gesture,
}: {
  room: Room | null;
  player: PlayerState;
  targetPosRef: React.MutableRefObject<MoveTarget | null>;
  speaking: boolean;
  emotes: FloatingEmote[];
  mapId: MapId;
  gesture: ActiveGesture | null;
}) {
  const groupRef = useRef<Group>(null);
  const speedRef = useRef(0);
  useLocalPlayerMovement(groupRef, room, player, targetPosRef, speedRef, mapId);
  return (
    <Character3D
      ref={groupRef}
      userId={player.userId}
      look={player.look}
      color={player.color}
      username={player.username}
      pose={poseOf(player)}
      speedRef={speedRef}
      holding={player.holding}
      action={player.action}
      actionProgress={player.actionProgress}
      toast={player.toast}
      speaking={speaking}
      emotes={emotes}
      gesture={gesture}
      status={player.status}
    />
  );
}

// --- Remote players: snapshot interpolation with dead reckoning ---
//
// Remote positions arrive as discrete snapshots (~16 Hz, with network jitter on top). Instead
// of chasing the latest one — which stutters whenever a packet is late and lurches when two
// arrive together — each remote player is drawn a fixed moment in the PAST, between the two
// snapshots that bracket that moment. Late packets are covered by dead reckoning: carrying on
// along the last known velocity for a short while before easing to a stop.
const INTERP_DELAY_MS = 110; // how far behind real time remote players are shown
const MAX_EXTRAPOLATE_MS = 250; // how long to keep moving on dead reckoning when packets stop
const SNAPSHOT_BUFFER = 12;
const REMOTE_MOVING_EPSILON = 0.02;
const REMOTE_TURN_LERP = 0.2;
const REMOTE_Y_LERP = 0.2;

interface Snapshot {
  t: number;
  x: number;
  z: number;
}

function lerpAngle(from: number, to: number, t: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

/** Where a remote player should be drawn at `renderTime`, from their snapshot history. */
function sampleSnapshots(buffer: Snapshot[], renderTime: number): { x: number; z: number; vx: number; vz: number } {
  const newest = buffer[buffer.length - 1];
  if (buffer.length === 1) return { x: newest.x, z: newest.z, vx: 0, vz: 0 };

  // Interpolate between the two snapshots that bracket renderTime.
  for (let i = buffer.length - 1; i > 0; i--) {
    const a = buffer[i - 1];
    const b = buffer[i];
    if (renderTime >= a.t && renderTime <= b.t) {
      const span = Math.max(1, b.t - a.t);
      const k = (renderTime - a.t) / span;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, vx: (b.x - a.x) / span, vz: (b.z - a.z) / span };
    }
  }

  const prev = buffer[buffer.length - 2];
  const span = Math.max(1, newest.t - prev.t);
  const vx = (newest.x - prev.x) / span;
  const vz = (newest.z - prev.z) / span;
  if (renderTime < buffer[0].t) return { x: buffer[0].x, z: buffer[0].z, vx: 0, vz: 0 };

  // renderTime is past the newest snapshot: the next packet is late. Dead-reckon along the
  // last velocity, fading it out so a player who really did stop settles instead of drifting.
  const ahead = Math.min(renderTime - newest.t, MAX_EXTRAPOLATE_MS);
  const fade = 1 - ahead / MAX_EXTRAPOLATE_MS;
  const carried = ahead * (0.5 + 0.5 * fade);
  return { x: newest.x + vx * carried, z: newest.z + vz * carried, vx: vx * fade, vz: vz * fade };
}

function RemotePlayerAvatar({ player, speaking, emotes, gesture }: { player: PlayerState; speaking: boolean; emotes: FloatingEmote[]; gesture: ActiveGesture | null }) {
  const groupRef = useRef<Group>(null);
  const speedRef = useRef(0);
  const bufferRef = useRef<Snapshot[]>([{ t: performance.now(), x: player.x, z: player.z }]);

  // Record every position change as a timestamped snapshot.
  useEffect(() => {
    const buffer = bufferRef.current;
    const last = buffer[buffer.length - 1];
    const jump = Math.hypot(player.x - last.x, player.z - last.z);
    const now = performance.now();
    if (jump > 4 || player.sitting) {
      // A teleport (map change, onto a seat, back to its approach point) must not be
      // interpolated across the room — start a fresh history there.
      bufferRef.current = [{ t: now - INTERP_DELAY_MS, x: player.x, z: player.z }];
      return;
    }
    buffer.push({ t: now, x: player.x, z: player.z });
    if (buffer.length > SNAPSHOT_BUFFER) buffer.shift();
  }, [player.x, player.z, player.sitting]);

  // Place newcomers where they actually are, instead of gliding in from the world origin.
  useLayoutEffect(() => {
    groupRef.current?.position.set(player.x, player.sitting ? player.sitY : 0, player.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const sample = sampleSnapshots(bufferRef.current, performance.now() - INTERP_DELAY_MS);
    g.position.x = sample.x;
    g.position.z = sample.z;
    g.position.y += ((player.sitting ? player.sitY : 0) - g.position.y) * REMOTE_Y_LERP;

    // Gait speed from the actual velocity (units/ms -> fraction of walking speed).
    const speed = Math.hypot(sample.vx, sample.vz) * 1000;
    const moving = !player.sitting && speed > REMOTE_MOVING_EPSILON * 10;
    speedRef.current = moving ? Math.min(1, speed / 3) : 0;

    // Face the seat while sitting, otherwise the direction of travel.
    const desiredY = player.sitting ? player.sitRotationY : moving ? Math.atan2(sample.vx, sample.vz) : g.rotation.y;
    g.rotation.y = lerpAngle(g.rotation.y, desiredY, REMOTE_TURN_LERP);
  });

  return (
    <Character3D
      ref={groupRef}
      userId={player.userId}
      look={player.look}
      color={player.color}
      username={player.username}
      pose={poseOf(player)}
      speedRef={speedRef}
      holding={player.holding}
      action={player.action}
      actionProgress={player.actionProgress}
      toast={player.toast}
      speaking={speaking}
      emotes={emotes}
      gesture={gesture}
      status={player.status}
    />
  );
}
