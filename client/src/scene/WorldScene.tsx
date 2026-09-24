import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Room } from "colyseus.js";
import type { ChairSyncState, MapId, PlayerState, TimeOfDay, ToggleableSyncState } from "@shared/types";
import { MAP_HALF, isWalkUpProp } from "@shared/types";
import { APPROACH_POINTS, mochiSpot } from "@shared/props";
import { LOFT_FRAME, SEAT_REACH } from "@shared/worlds/lounge";
import type { EmoteListener, RoomMessageListener } from "../hooks/useColyseusRoom";
import { LoungeWorld } from "./LoungeWorld";
import { Cat, FloorLamp, SeatPad } from "./Props";
import { ClickMarker } from "./ClickMarker";
import { HOUR_LOOKS, TimeOfDayContext } from "./timeOfDay";
import { cameraFocus, frame, requestRecenter } from "./cameraFocus";
import { interactBridge } from "./interactBridge";
import { GEO, StaticBatch, matte, noRaycast } from "./kit";
import type { MoveTarget } from "../systems/useLocalPlayerMovement";
import { LocalPlayerAvatar, OtherPlayers, type BubbleState, type CrowdFeed, type GestureState } from "../entities/Players";
import type { FloatingEmote } from "../entities/Avatar";

// The scene root: the world and everything alive in it.
//
//   - warm ambient light and the sky for the hour
//   - the world itself (the lounge; the other six are still an empty floor)
//   - seats and interactive props, drawn from the server's synced state
//   - you (LocalPlayerAvatar) and everyone else (OtherPlayers)
//   - click-to-move: the floor, a seat or Mochi is a walk order, and seats and props act on arrival
//
// It re-renders on every player state patch, which is why the world itself is a stable subtree and
// the handlers handed to it are stable callbacks reading the latest state through a ref.

export interface WorldSceneProps {
  room: Room | null;
  players: Record<string, PlayerState>;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string | null;
  mapId: MapId;
  timeOfDay: TimeOfDay;
  speakingUserIds: ReadonlySet<string>;
  subscribeEmotes: (listener: EmoteListener) => () => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

const EMOTE_LIFETIME_MS = 1900;
const BUBBLE_LIFETIME_MS = 4200;

/** Warm ambient light and a soft key with no shadow map: the whole room's light, with the lamps' own point lights. */
function SceneLighting({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const look = HOUR_LOOKS[timeOfDay];
  return (
    <>
      <color attach="background" args={[look.sky]} />
      <ambientLight color={look.ambientColor} intensity={look.ambient} />
      {/* the key only gives the clay its form: it never casts a shadow, and it comes from off the camera's axis */}
      <directionalLight position={[-14, 24, 10]} color={look.sunColor} intensity={look.sun} castShadow={false} />
    </>
  );
}

const FLOOR = matte("#8b8f86", 0.85);
const SLAB = matte("#4a3a2c", 0.85);

/** The other six worlds: a bare floor and a sign, until each is rebuilt. */
function EmptyWorld({ mapId, onFloorClick }: { mapId: MapId; onFloorClick: (x: number, z: number) => void }) {
  const half = MAP_HALF[mapId];
  return (
    <group>
      <mesh
        geometry={GEO.plane}
        material={FLOOR}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[half * 2, half * 2, 1]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onFloorClick(e.point.x, e.point.z);
        }}
      />
      <StaticBatch>
        <mesh geometry={GEO.box} material={SLAB} position={[0, -0.67, 0]} scale={[half * 2, 1.3, half * 2]} raycast={noRaycast} />
      </StaticBatch>
      <Html position={[0, 1.2, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ padding: "8px 16px", borderRadius: 999, background: "rgba(40,28,20,0.7)", color: "#fff8ec", font: "700 14px system-ui, sans-serif", whiteSpace: "nowrap" }}>🚧 This world is being rebuilt</div>
      </Html>
    </group>
  );
}

/** Emotes, gestures and speech bubbles arrive as one-shot messages; keep them per session. */
function useCrowdEvents(subscribeEmotes: WorldSceneProps["subscribeEmotes"], subscribeMessages: WorldSceneProps["subscribeMessages"]) {
  const [emotes, setEmotes] = useState<Record<string, FloatingEmote[]>>({});
  const [gestures, setGestures] = useState<Record<string, GestureState>>({});
  const [bubbles, setBubbles] = useState<Record<string, BubbleState>>({});
  const nextId = useRef(1);

  useEffect(
    () =>
      subscribeEmotes(({ sessionId, emoji }) => {
        const id = nextId.current++;
        setEmotes((prev) => ({ ...prev, [sessionId]: [...(prev[sessionId] ?? []), { id, emoji }] }));
        window.setTimeout(() => setEmotes((prev) => ({ ...prev, [sessionId]: (prev[sessionId] ?? []).filter((e) => e.id !== id) })), EMOTE_LIFETIME_MS);
      }),
    [subscribeEmotes]
  );

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "gesture" && payload?.sessionId) {
          setGestures((prev) => ({ ...prev, [payload.sessionId]: { kind: payload.gesture, at: performance.now() } }));
        } else if (type === "chatBubble" && payload?.sessionId) {
          const id = nextId.current++;
          setBubbles((prev) => ({ ...prev, [payload.sessionId]: { id, text: String(payload.text) } }));
          window.setTimeout(
            () =>
              setBubbles((prev) => {
                if (prev[payload.sessionId]?.id !== id) return prev; // a newer line replaced it
                const { [payload.sessionId]: _gone, ...rest } = prev;
                return rest;
              }),
            BUBBLE_LIFETIME_MS
          );
        }
      }),
    [subscribeMessages]
  );

  return { emotes, gestures, bubbles };
}

export function WorldScene({ room, players, chairs, toggleables, localSessionId, mapId, timeOfDay, speakingUserIds, subscribeEmotes, subscribeMessages }: WorldSceneProps) {
  const me = localSessionId ? players[localSessionId] : undefined;
  const { emotes, gestures, bubbles } = useCrowdEvents(subscribeEmotes, subscribeMessages);

  // the camera fits this world's floor with a margin (the lounge's own frame, or another world's size)
  frame.size = mapId === "cozy_lounge" ? LOFT_FRAME.size : MAP_HALF[mapId] * 2 + 0.8;

  // --- click-to-move ---
  const targetRef = useRef<MoveTarget | null>(null);
  const rippleRef = useRef({ x: 0, z: 0, id: 0 });
  // everything the stable handlers read, refreshed on every render
  const live = useRef({ room, me, chairs, toggleables, localSessionId, mapId });
  live.current = { room, me, chairs, toggleables, localSessionId, mapId };

  const walkTo = useCallback((x: number, z: number, then?: Pick<MoveTarget, "seatId" | "propId">) => {
    const { room, me } = live.current;
    if (me?.sitting) room?.send("standUp"); // the queued walk carries on once you are up
    targetRef.current = { x, z, ...then };
    rippleRef.current = { x, z, id: rippleRef.current.id + 1 };
    requestRecenter(); // a new walk takes the camera back from free look
  }, []);

  const onFloorClick = useCallback((x: number, z: number) => walkTo(x, z), [walkTo]);

  const sit = useCallback(
    (chairId: string) => {
      const { room, chairs, localSessionId } = live.current;
      const chair = chairs[chairId];
      if (!chair) return;
      if (chair.occupiedBy && chair.occupiedBy !== localSessionId) return; // somebody else is in it
      if (chair.occupiedBy === localSessionId) {
        room?.send("standUp");
        return;
      }
      const at = APPROACH_POINTS[chairId] ?? chair;
      walkTo(at.x, at.z, { seatId: chairId });
    },
    [walkTo]
  );

  const stand = useCallback(() => live.current.room?.send("standUp"), []);

  const activate = useCallback(
    (propId: string) => {
      const { room, toggleables, mapId } = live.current;
      const prop = toggleables[propId];
      if (!prop) return;
      if (!isWalkUpProp(prop.kind)) {
        // lamps work from across the room
        room?.send("useProp", { propId, x: cameraFocus.x, z: cameraFocus.z });
        return;
      }
      // Mochi is wherever her day has taken her; everything else has a fixed spot to stand
      if (prop.kind === "cat") {
        const s = mochiSpot(mapId, Date.now() / 1000);
        walkTo(s.ax, s.az, { propId });
      } else {
        const at = APPROACH_POINTS[propId] ?? prop;
        walkTo(at.x, at.z, { propId });
      }
    },
    [walkTo]
  );

  const sitNearest = useCallback((): boolean => {
    const { chairs, localSessionId } = live.current;
    let best: { id: string; d: number } | null = null;
    for (const c of Object.values(chairs)) {
      if (c.occupiedBy && c.occupiedBy !== localSessionId) continue;
      const a = APPROACH_POINTS[c.propId];
      const d = Math.min(Math.hypot(c.x - cameraFocus.x, c.z - cameraFocus.z), a ? Math.hypot(a.x - cameraFocus.x, a.z - cameraFocus.z) : Infinity);
      if (d <= SEAT_REACH && (!best || d < best.d)) best = { id: c.propId, d };
    }
    if (!best) return false;
    sit(best.id);
    return true;
  }, [sit]);

  useEffect(() => {
    interactBridge.current = { useProp: activate, sit, sitNearest, stand, walkTo: (x, z) => walkTo(x, z) };
    return () => {
      interactBridge.current = null;
    };
  }, [activate, sit, sitNearest, stand, walkTo]);

  // a new world starts with no walk in progress
  useEffect(() => {
    targetRef.current = null;
  }, [mapId]);

  const feed = useMemo<CrowdFeed>(() => ({ speakingUserIds, emotes, gestures, bubbles }), [speakingUserIds, emotes, gestures, bubbles]);

  return (
    <TimeOfDayContext.Provider value={timeOfDay}>
      <SceneLighting timeOfDay={timeOfDay} />
      {mapId === "cozy_lounge" ? <LoungeWorld onFloorClick={onFloorClick} /> : <EmptyWorld mapId={mapId} onFloorClick={onFloorClick} />}

      {Object.values(chairs).map((chair) => (
        <SeatPad key={chair.propId} x={chair.x} z={chair.z} wide={!chair.propId.startsWith("stool")} onUse={() => sit(chair.propId)} />
      ))}
      {Object.values(toggleables).map((prop) =>
        prop.kind === "cat" ? <Cat key={prop.propId} mapId={mapId} onUse={() => activate(prop.propId)} /> : prop.kind === "lamp" ? <FloorLamp key={prop.propId} prop={prop} onUse={() => activate(prop.propId)} /> : null
      )}

      {me && <LocalPlayerAvatar key={`${mapId}:${localSessionId}`} player={me} room={room} mapId={mapId} targetRef={targetRef} feed={feed} />}
      <OtherPlayers players={players} localSessionId={localSessionId} feed={feed} />
      <ClickMarker targetRef={targetRef} rippleRef={rippleRef} />
    </TimeOfDayContext.Provider>
  );
}
