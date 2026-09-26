import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Room } from "colyseus.js";
import type { BoardGameView, ChairSyncState, MapId, PlayerState, TimeOfDay, ToggleableSyncState } from "@shared/types";
import { GESTURE_SECONDS, MAP_HALF, isWalkUpProp } from "@shared/types";
import { APPROACH_POINTS, mochiSpot } from "@shared/props";
import { LOFT_FRAME, SEAT_REACH } from "@shared/worlds/lounge";
import { CAMPFIRE_FRAME, CAMPFIRE_LAYOUT, GUITAR_LISTEN, dockSeatOf, nearestChopStation } from "@shared/worlds/campfire";
import { useGLTF } from "@react-three/drei";
import { CAMPFIRE_URL, CampfireSky, CampfireWorld } from "./CampfireWorld";
import type { EmoteListener, HearthState, RoomMessageListener } from "../hooks/useColyseusRoom";
import { LoungeWorld } from "./LoungeWorld";
import { BoardTablePad, CampfirePuff, Cat, FloorLamp, PLANT_BURST_SECONDS, PUFF_SECONDS, PlantBurst, PropPad, RadioProp, SeatPad } from "./Props";
import { ClickMarker } from "./ClickMarker";
import { HOUR_LOOKS, TimeOfDayContext } from "./timeOfDay";
import { cameraFocus, frame, requestRecenter } from "./cameraFocus";
import { interactBridge } from "./interactBridge";
import { GEO, StaticBatch, matte, noRaycast } from "./kit";
import type { MoveTarget } from "../systems/useLocalPlayerMovement";
import { faceToward } from "../systems/faceTargets";
import { liveMotion } from "../systems/liveMotion";
import { LocalPlayerAvatar, OtherPlayers, bobberFor, type BubbleState, type CrowdFeed, type GestureState } from "../entities/Players";
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
  /** The Campfire's hearth (the fire's fuel, the Dutch oven, the picnic plates). */
  hearth: HearthState;
}

/** An emote's bubble floats over its sender this long (it pops in, bobs, and fades). */
const EMOTE_LIFETIME_MS = 3000;
const BUBBLE_LIFETIME_MS = 4200;

/** Warm ambient light and a soft key with no shadow map: the whole room's light, with the lamps' own point lights. */
function SceneLighting({ timeOfDay, starlit }: { timeOfDay: TimeOfDay; starlit: boolean }) {
  const look = HOUR_LOOKS[timeOfDay];
  return (
    <>
      {starlit ? <CampfireSky /> : <color attach="background" args={[look.sky]} />}
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

export function WorldScene({ room, players, chairs, toggleables, localSessionId, mapId, timeOfDay, speakingUserIds, subscribeEmotes, subscribeMessages, hearth }: WorldSceneProps) {
  const me = localSessionId ? players[localSessionId] : undefined;
  const { emotes, gestures, bubbles } = useCrowdEvents(subscribeEmotes, subscribeMessages);

  // a watered plant's splash (drops from the waterer's can, then sparkles), shown for
  // PLANT_BURST_SECONDS; the waterer turns to face the plant for the pour
  const [bursts, setBursts] = useState<{ id: number; x: number; z: number; from?: { x: number; z: number }; at: number }[]>([]);
  const burstId = useRef(1);
  const liveProps = useRef(toggleables);
  liveProps.current = toggleables;
  useEffect(() => {
    const timers = new Set<number>();
    const off = subscribeMessages((type, payload) => {
      if (type !== "plantWatered") return;
      const plant = liveProps.current[payload?.plantId];
      if (!plant) return;
      const waterer = typeof payload?.sessionId === "string" ? liveMotion.get(payload.sessionId) : undefined;
      const from = waterer ? { x: waterer.x, z: waterer.z } : APPROACH_POINTS[plant.propId];
      if (waterer) faceToward(payload.sessionId, plant.x, plant.z, GESTURE_SECONDS.water);
      const id = burstId.current++;
      setBursts((prev) => [...prev, { id, x: plant.x, z: plant.z, from, at: performance.now() }]);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, PLANT_BURST_SECONDS * 1000);
      timers.add(timer);
    });
    return () => {
      off();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [subscribeMessages]);

  // the camera fits this world's floor with a margin (the lounge's own frame, or another world's size)
  frame.size = mapId === "cozy_lounge" ? LOFT_FRAME.size : mapId === "campfire_night" ? CAMPFIRE_FRAME.size : MAP_HALF[mapId] * 2 + 0.8;

  // the campfire's model is fetched quietly once the lounge is up, so travelling there is instant
  useEffect(() => {
    const t = window.setTimeout(() => useGLTF.preload(CAMPFIRE_URL), 4000);
    return () => window.clearTimeout(t);
  }, []);

  // the campfire's little effects: smoke off a burnt skewer, a splash off a catch
  const [puffs, setPuffs] = useState<{ id: number; x: number; y: number; z: number; kind: "smoke" | "splash" | "chips"; at: number }[]>([]);
  const puffId = useRef(1);
  const livePlayers = useRef(players);
  livePlayers.current = players;
  useEffect(() => {
    const timers = new Set<number>();
    const add = (p: { x: number; y: number; z: number; kind: "smoke" | "splash" | "chips" }) => {
      const id = puffId.current++;
      setPuffs((prev) => [...prev, { id, ...p, at: performance.now() }]);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setPuffs((prev) => prev.filter((b) => b.id !== id));
      }, PUFF_SECONDS * 1000);
      timers.add(timer);
    };
    const off = subscribeMessages((type, payload) => {
      const who = typeof payload?.sessionId === "string" ? livePlayers.current[payload.sessionId] : undefined;
      if (!who) return;
      if (type === "roastResult" && payload.quality === "charred") {
        // over the skewer's end: out in front of them, toward the fire
        const fx = CAMPFIRE_LAYOUT.fire.x - who.x;
        const fz = CAMPFIRE_LAYOUT.fire.z - who.z;
        const d = Math.hypot(fx, fz) || 1;
        add({ x: who.x + (fx / d) * 0.55, y: 0.55, z: who.z + (fz / d) * 0.55, kind: "smoke" });
      } else if (type === "chopResult" && payload.clean) {
        const block = nearestChopStation(who.x, who.z);
        add({ x: block.x, y: 0.45, z: block.z, kind: "chips" });
      } else if (type === "fishCaught") {
        // off this angler's own float (the one out from their spot on the dock)
        const b = bobberFor(who, "campfire_night");
        if (b) add({ x: b.x, y: b.y, z: b.z, kind: "splash" });
      }
    });
    return () => {
      off();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [subscribeMessages]);

  // anglers face their float and cooks face the fire, whichever way they stood
  useEffect(() => {
    if (mapId !== "campfire_night") return;
    const timer = window.setInterval(() => {
      for (const p of Object.values(livePlayers.current)) {
        if (p.sitting) continue;
        const float = bobberFor(p, "campfire_night");
        if (float) faceToward(p.sessionId, float.x, float.z, 0.6);
        else if (p.action === "grill") faceToward(p.sessionId, CAMPFIRE_LAYOUT.fire.x, CAMPFIRE_LAYOUT.fire.z, 0.6);
        else if (p.action === "stargaze") faceToward(p.sessionId, CAMPFIRE_LAYOUT.telescope.x, CAMPFIRE_LAYOUT.telescope.z, 0.6);
        else if (p.action === "chop") {
          const block = nearestChopStation(p.x, p.z);
          faceToward(p.sessionId, block.x, block.z, 0.6);
        }
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [mapId]);

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
      const { room, toggleables, mapId, me } = live.current;
      const prop = toggleables[propId];
      if (!prop) return;
      // already sitting at the games table, or on a pouf by the radio: its panel opens right there, without getting up
      if ((prop.kind === "boardgame" || prop.kind === "radio") && me?.sitting) {
        window.dispatchEvent(new CustomEvent("cozy-open-panel", { detail: { kind: prop.kind, propId } }));
        return;
      }
      // sitting at a fishing spot already (the dock's edge, the canoe): cast from right there,
      // never walking off to its approach point (the canoe's is on the dock)
      if (prop.kind === "fishing" && me?.sitting && live.current.localSessionId && live.current.chairs[dockSeatOf(propId)]?.occupiedBy === live.current.localSessionId) {
        room?.send("useProp", { propId, x: cameraFocus.x, z: cameraFocus.z });
        return;
      }
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

  // the lounge's moods: whoever sits on a cushion round the radio while it plays grooves to it, and
  // whoever sits at the board waits on the opponent's move (from the table's broadcasts)
  const radioOn = Object.values(toggleables).some((t) => t.kind === "radio" && t.on);
  const guitarists = Object.values(players).filter((p) => p.action === "guitar");
  const guitarKey = guitarists.map((p) => p.sessionId).join(",");
  const vibing = useMemo<ReadonlySet<string>>(() => {
    const out = new Set(radioOn ? Object.values(chairs).flatMap((c) => (c.occupiedBy && c.propId.startsWith("pouf_") ? [c.occupiedBy] : [])) : []);
    // the campfire's guitar: everyone seated within earshot sways along
    for (const c of Object.values(chairs)) {
      if (c.occupiedBy && guitarists.some((g) => Math.hypot(g.x - c.x, g.z - c.z) <= GUITAR_LISTEN)) out.add(c.occupiedBy);
    }
    return out;
    // guitarKey stands in for who is playing (positions only matter as seated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioOn, chairs, guitarKey]);
  const [board, setBoard] = useState<BoardGameView | null>(null);
  useEffect(() => subscribeMessages((type, payload) => type === "boardState" && setBoard(payload as BoardGameView)), [subscribeMessages]);
  const awaiting = useMemo<ReadonlySet<string>>(() => {
    const waiter = board?.phase === "playing" ? board.seats[board.turn === "w" ? "b" : "w"] : "";
    return new Set(waiter ? [waiter] : []);
  }, [board]);
  // whoever sits in the campfire's canoe rocks with it
  const canoeSitter = chairs.seat_canoe?.occupiedBy ?? "";
  const rocking = useMemo<ReadonlySet<string>>(() => new Set(canoeSitter ? [canoeSitter] : []), [canoeSitter]);
  const feed = useMemo<CrowdFeed>(() => ({ speakingUserIds, emotes, gestures, bubbles, vibing, awaiting, mapId, rocking }), [speakingUserIds, emotes, gestures, bubbles, vibing, awaiting, mapId, rocking]);

  // it is always a starlit night at the campfire, whatever the room's clock says
  const starlit = mapId === "campfire_night";
  const hour: TimeOfDay = starlit ? "night" : timeOfDay;
  return (
    <TimeOfDayContext.Provider value={hour}>
      <SceneLighting timeOfDay={hour} starlit={starlit} />
      {mapId === "cozy_lounge" ? <LoungeWorld onFloorClick={onFloorClick} /> : mapId === "campfire_night" ? <CampfireWorld onFloorClick={onFloorClick} players={players} toggleables={toggleables} hearth={hearth} subscribeMessages={subscribeMessages} onDuck={(duck) => room?.send("duckPoke", { duck })} /> : <EmptyWorld mapId={mapId} onFloorClick={onFloorClick} />}

      {Object.values(chairs).map((chair) => (
        // a seat you lie in (the hammock, the tent) is placed by where your feet go: its pad sits
        // over the middle of you instead (the head end is local -z)
        chair.style === "blanket" ? (
          <SeatPad key={chair.propId} x={chair.x - Math.sin(chair.rotationY) * 0.45} z={chair.z - Math.cos(chair.rotationY) * 0.45} wide onUse={() => sit(chair.propId)} />
        ) : (
          <SeatPad key={chair.propId} x={chair.x} z={chair.z} wide={!chair.propId.startsWith("stool")} onUse={() => sit(chair.propId)} />
        )
      ))}
      {Object.values(toggleables).map((prop) =>
        prop.kind === "cat" ? (
          <Cat key={prop.propId} mapId={mapId} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "lamp" ? (
          <FloorLamp key={prop.propId} prop={prop} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "boardgame" ? (
          <BoardTablePad key={prop.propId} prop={prop} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "radio" ? (
          <RadioProp key={prop.propId} prop={prop} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "kitchen" ? (
          <PropPad key={prop.propId} prop={{ ...prop, y: 0.7 }} size={[0.4, 0.45, 0.4]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "bonfire" ? (
          <PropPad key={prop.propId} prop={prop} size={[1.4, 1.2, 1.4]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "fishing" ? (
          <PropPad key={prop.propId} prop={prop} size={[0.9, 0.5, 1.1]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "telescope" ? (
          <PropPad key={prop.propId} prop={prop} size={[0.8, 1.4, 0.8]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "woodchop" ? (
          <PropPad key={prop.propId} prop={prop} size={[0.7, 0.8, 0.7]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "lumberjack" ? (
          <PropPad key={prop.propId} prop={prop} size={[0.8, 1.3, 0.8]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "workbench" ? (
          <PropPad key={prop.propId} prop={prop} size={[1.2, 1.0, 1.2]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "angler" ? (
          <PropPad key={prop.propId} prop={prop} size={[0.8, 1.3, 0.8]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "critter" ? (
          <PropPad key={prop.propId} prop={prop} size={[0.6, 0.6, 0.7]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "fireflies" ? (
          <PropPad key={prop.propId} prop={prop} size={[1.4, 1.2, 1.4]} onUse={() => activate(prop.propId)} />
        ) : prop.kind === "foraging" ? (
          prop.on ? <PropPad key={prop.propId} prop={prop} size={[0.8, 0.6, 0.8]} onUse={() => activate(prop.propId)} /> : null
        ) : prop.kind === "plant" ? (
          <PropPad key={prop.propId} prop={prop} size={[0.75, 1.4, 0.75]} onUse={() => activate(prop.propId)} />
        ) : null
      )}
      {puffs.map((p) => (
        <CampfirePuff key={p.id} x={p.x} y={p.y} z={p.z} kind={p.kind} at={p.at} />
      ))}
      {bursts.map((b) => (
        <PlantBurst key={b.id} x={b.x} z={b.z} from={b.from} at={b.at} />
      ))}

      {me && <LocalPlayerAvatar key={`${mapId}:${localSessionId}`} player={me} room={room} mapId={mapId} targetRef={targetRef} feed={feed} />}
      <OtherPlayers players={players} localSessionId={localSessionId} feed={feed} />
      <ClickMarker targetRef={targetRef} rippleRef={rippleRef} />
    </TimeOfDayContext.Provider>
  );
}
