import { useEffect, useRef, useState } from "react";
import { Client, Room } from "colyseus.js";
import type { DiscordAuthInfo } from "./useDiscordAuth";
import type { ChairSyncState, MapId, PlayerState, ToggleableSyncState } from "@shared/types";

const RECONNECT_KEY_PREFIX = "hangout_reconnect_";
const NORMAL_CLOSE_CODE = 1000;

interface UseColyseusRoomResult {
  room: Room | null;
  players: Record<string, PlayerState>;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string | null;
  currentMap: MapId;
  mapTransitioning: boolean;
  connected: boolean;
  error: string | null;
  setColor: (color: string) => void;
  changeMap: (mapId: MapId) => void;
  interactChair: (chairId: string) => void;
  toggleProp: (propId: string) => void;
}

export function useColyseusRoom(auth: DiscordAuthInfo | null): UseColyseusRoomResult {
  const roomRef = useRef<Room | null>(null);
  const [, forceRender] = useState(0); // room is exposed via ref; bump this when it changes identity
  const [players, setPlayers] = useState<Record<string, PlayerState>>({});
  const [chairs, setChairs] = useState<Record<string, ChairSyncState>>({});
  const [toggleables, setToggleables] = useState<Record<string, ToggleableSyncState>>({});
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [currentMap, setCurrentMap] = useState<MapId>("cozy_lounge");
  const [mapTransitioning, setMapTransitioning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    let disposed = false;

    async function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // The "/colyseus" segment only exists as a routing key for Vite's dev-server proxy
      // (vite.config.ts strips it before forwarding to the real Colyseus server, which expects
      // root-level paths like "/matchmake/..."). In a production build there's no such proxy —
      // Express serves the client bundle and Colyseus share the same port directly — so the
      // prefix must be omitted there, or every connection attempt 404s.
      const wsPath = import.meta.env.DEV ? "/colyseus" : "";
      const client = new Client(`${protocol}//${window.location.host}${wsPath}`);
      const reconnectKey = `${RECONNECT_KEY_PREFIX}${auth!.channelId}`;
      const savedToken = localStorage.getItem(reconnectKey);

      let room: Room;
      if (savedToken) {
        try {
          room = await client.reconnect(savedToken);
        } catch {
          localStorage.removeItem(reconnectKey);
          room = await client.joinOrCreate("hangout_room", {
            channelId: auth!.channelId,
            userId: auth!.userId,
            username: auth!.username,
            avatarUrl: auth!.avatarUrl,
          });
        }
      } else {
        room = await client.joinOrCreate("hangout_room", {
          channelId: auth!.channelId,
          userId: auth!.userId,
          username: auth!.username,
          avatarUrl: auth!.avatarUrl,
        });
      }

      if (disposed) {
        room.leave();
        return;
      }

      roomRef.current = room;
      forceRender((n) => n + 1);
      setLocalSessionId(room.sessionId);
      setConnected(true);
      setError(null);
      localStorage.setItem(reconnectKey, room.reconnectionToken);

      room.state.players.onAdd((player: any, sessionId: string) => {
        const sync = () => {
          setPlayers((prev) => ({
            ...prev,
            [sessionId]: {
              sessionId,
              userId: player.userId,
              username: player.username,
              avatarUrl: player.avatarUrl,
              x: player.x,
              y: 0,
              z: player.z,
              dirX: player.dirX,
              dirZ: player.dirZ,
              color: player.color,
              sitting: player.sitting,
              sitRotationY: player.sitRotationY,
              connected: player.connected,
            },
          }));
        };
        player.onChange(sync);
        sync();
      });

      room.state.players.onRemove((_player: any, sessionId: string) => {
        setPlayers((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      });

      room.state.chairs.onAdd((chair: any, propId: string) => {
        const sync = () => {
          setChairs((prev) => ({
            ...prev,
            [propId]: {
              propId,
              x: chair.x,
              z: chair.z,
              rotationY: chair.rotationY,
              style: chair.style,
              occupiedBy: chair.occupiedBy,
            },
          }));
        };
        chair.onChange(sync);
        sync();
      });

      room.state.chairs.onRemove((_chair: any, propId: string) => {
        setChairs((prev) => {
          const next = { ...prev };
          delete next[propId];
          return next;
        });
      });

      room.state.toggleables.onAdd((prop: any, propId: string) => {
        const sync = () => {
          setToggleables((prev) => ({
            ...prev,
            [propId]: {
              propId,
              x: prop.x,
              z: prop.z,
              kind: prop.kind,
              color: prop.color,
              on: prop.on,
            },
          }));
        };
        prop.onChange(sync);
        sync();
      });

      room.state.toggleables.onRemove((_prop: any, propId: string) => {
        setToggleables((prev) => {
          const next = { ...prev };
          delete next[propId];
          return next;
        });
      });

      room.state.listen("currentMap", (map: MapId) => setCurrentMap(map));
      room.state.listen("mapTransitioning", (val: boolean) => setMapTransitioning(val));

      room.onLeave((code) => {
        setConnected(false);
        if (code === NORMAL_CLOSE_CODE) {
          localStorage.removeItem(reconnectKey);
        }
      });

      room.onError((code, message) => {
        setError(message ?? `room error (code ${code})`);
      });
    }

    connect().catch((err) => {
      if (!disposed) setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      disposed = true;
      roomRef.current?.leave(true);
      roomRef.current = null;
      setPlayers({});
      setChairs({});
      setToggleables({});
      setConnected(false);
    };
    // Only re-join when identity of the target room changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.channelId, auth?.userId]);

  const setColor = (color: string) => roomRef.current?.send("setColor", { color });
  const changeMap = (mapId: MapId) => roomRef.current?.send("changeMap", { mapId });
  const interactChair = (chairId: string) => roomRef.current?.send("interactChair", { chairId });
  const toggleProp = (propId: string) => roomRef.current?.send("toggleProp", { propId });

  return {
    room: roomRef.current,
    players,
    chairs,
    toggleables,
    localSessionId,
    currentMap,
    mapTransitioning,
    connected,
    error,
    setColor,
    changeMap,
    interactChair,
    toggleProp,
  };
}
