import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Room } from "colyseus.js";
import type { DiscordAuthInfo } from "./useDiscordAuth";
import type {
  BallSyncState,
  BlackjackAction,
  ChairSyncState,
  EmoteBroadcast,
  LeaderboardEntry,
  HeldItem,
  MapId,
  PlayerAction,
  PlayerState,
  RoulettePhase,
  RouletteSyncState,
  SeatStyle,
  SitPose,
  TimeOfDay,
  ToggleableKind,
  ToggleableSyncState,
} from "@shared/types";

const RECONNECT_KEY_PREFIX = "hangout_reconnect_";
const NORMAL_CLOSE_CODE = 1000;

export type EmoteListener = (emote: EmoteBroadcast) => void;

/** One-shot server messages other than emotes (gesture, slotSpin, rouletteResult, npcSay). */
export type RoomMessageListener = (type: string, payload: any) => void;
const RELAYED_MESSAGES = ["gesture", "slotSpin", "rouletteResult", "npcSay", "chatBubble", "blackjackState", "openSlots", "allowance", "welcome"] as const;
/** How often the client times a round trip for the roster's ping column. */
const PING_EVERY_MS = 5000;

export interface BallSnapshot extends BallSyncState {
  /** performance.now() when this snapshot arrived. */
  receivedAt: number;
}

interface UseColyseusRoomResult {
  room: Room | null;
  players: Record<string, PlayerState>;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string | null;
  currentMap: MapId;
  timeOfDay: TimeOfDay;
  mapTransitioning: boolean;
  connected: boolean;
  error: string | null;
  roulette: RouletteSyncState;
  /** Roulette bets on the table this round, by sessionId (encodeBets strings). */
  bets: Record<string, string>;
  autoCycle: boolean;
  /** Persisted High Rollers (top balances), refreshed by the server every few seconds. */
  leaderboard: LeaderboardEntry[];
  /** Your last measured round trip in ms. */
  latency: number;
  setAutoCycle: (on: boolean) => void;
  claimAllowance: () => void;
  spinSlots: (propId: string, bet: number) => void;
  blackjackAction: (action: BlackjackAction, bet?: number) => void;
  sendChat: (text: string) => void;
  sendGesture: (gesture: string) => void;
  buyHat: (hat: string) => void;
  placeBet: (kind: string, amount: number) => void;
  clearBets: () => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  setColor: (color: string) => void;
  setLook: (look: string) => void;
  changeMap: (mapId: MapId) => void;
  setTimeOfDay: (timeOfDay: TimeOfDay) => void;
  sendEmote: (emoji: string) => void;
  setSpeaking: (speaking: boolean) => void;
  roast: () => void;
  eat: () => void;
  dropHeld: () => void;
  kickBall: (dirX: number, dirZ: number) => void;
  castLine: (afk?: boolean) => void;
  setStatus: (status: string) => void;
  reelIn: () => void;
  /** Latest server snapshot of the beach volleyball (null until the first patch). */
  ballRef: React.MutableRefObject<BallSnapshot | null>;
  /** Emotes are one-shot broadcasts rather than state, so they are delivered by subscription. */
  subscribeEmotes: (listener: EmoteListener) => () => void;
}

export function useColyseusRoom(auth: DiscordAuthInfo | null): UseColyseusRoomResult {
  const roomRef = useRef<Room | null>(null);
  const [, forceRender] = useState(0); // room is exposed via ref; bump this when it changes identity
  const [players, setPlayers] = useState<Record<string, PlayerState>>({});
  const [chairs, setChairs] = useState<Record<string, ChairSyncState>>({});
  const [toggleables, setToggleables] = useState<Record<string, ToggleableSyncState>>({});
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [currentMap, setCurrentMap] = useState<MapId>("cozy_lounge");
  const [timeOfDay, setTimeOfDayState] = useState<TimeOfDay>("day");
  const [mapTransitioning, setMapTransitioning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emoteListenersRef = useRef(new Set<EmoteListener>());
  const messageListenersRef = useRef(new Set<RoomMessageListener>());
  const [roulette, setRoulette] = useState<RouletteSyncState>({ phase: "betting", timeLeft: 25, result: -1, spinId: 0 });
  const [bets, setBets] = useState<Record<string, string>>({});
  const [autoCycle, setAutoCycleState] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [latency, setLatency] = useState(0);
  const ballRef = useRef<BallSnapshot | null>(null);

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
      const joinOptions = {
        channelId: auth!.channelId,
        userId: auth!.userId,
        username: auth!.username,
        avatarUrl: auth!.avatarUrl,
      };

      let room: Room;
      if (savedToken) {
        try {
          room = await client.reconnect(savedToken);
        } catch {
          localStorage.removeItem(reconnectKey);
          room = await client.joinOrCreate("hangout_room", joinOptions);
        }
      } else {
        room = await client.joinOrCreate("hangout_room", joinOptions);
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

      room.onMessage("emote", (msg: EmoteBroadcast) => {
        emoteListenersRef.current.forEach((listener) => listener(msg));
      });
      for (const type of RELAYED_MESSAGES) {
        room.onMessage(type, (msg: unknown) => messageListenersRef.current.forEach((listener) => listener(type, msg)));
      }
      // Latency: time a round trip every few seconds and tell the server the last result.
      let lastRtt = 0;
      room.onMessage("pong", (msg: { t: number }) => {
        lastRtt = Math.round(performance.now() - msg.t);
        setLatency(lastRtt);
      });
      const pingTimer = window.setInterval(() => {
        if (roomRef.current === room) room.send("ping", { t: performance.now(), rtt: lastRtt });
      }, PING_EVERY_MS);
      room.onLeave(() => window.clearInterval(pingTimer));

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
              look: player.look,
              sitting: player.sitting,
              sitRotationY: player.sitRotationY,
              sitY: player.sitY,
              sitPose: player.sitPose as SitPose,
              holding: player.holding as HeldItem,
              action: player.action as PlayerAction,
              actionProgress: player.actionProgress,
              toast: player.toast,
              speaking: player.speaking,
              connected: player.connected,
              coins: player.coins ?? 0,
              bag: player.bag ?? "",
              owned: player.owned ?? "",
              status: player.status ?? "",
              stats: player.stats ?? "",
              ping: player.ping ?? 0,
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
              style: chair.style as SeatStyle,
              sitY: chair.sitY,
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
              y: prop.y,
              z: prop.z,
              kind: prop.kind as ToggleableKind,
              color: prop.color,
              on: prop.on,
              boost: prop.boost,
              track: prop.track ?? 0,
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

      // The volleyball changes 20 times a second. Routing that through React state would
      // re-render the whole scene for a single sphere, so it lands in a ref the ball component
      // reads each frame, stamped with when it arrived (for extrapolation between patches).
      const syncBall = () => {
        const b = room.state.ball;
        if (!b) return;
        ballRef.current = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, receivedAt: performance.now() };
      };
      if (room.state.ball) {
        room.state.ball.onChange(syncBall);
        syncBall();
      }

      // Follow the roulette through `listen`, not a one-off reference: the object present at
      // join time can be a placeholder that the first full state replaces, and a listener left
      // on that would freeze the wheel and the betting board on their first phase.
      let attached: any = null;
      const attachRoulette = (r: any) => {
        if (!r || r === attached) return;
        attached = r;
        const syncRoulette = () =>
          setRoulette({ phase: r.phase as RoulettePhase, timeLeft: r.timeLeft, result: r.result, spinId: r.spinId });
        r.onChange(syncRoulette);
        syncRoulette();
      };
      room.state.listen("roulette", attachRoulette);
      attachRoulette(room.state.roulette);
      if (room.state.bets) {
        room.state.bets.onAdd((value: string, sessionId: string) => setBets((prev) => ({ ...prev, [sessionId]: value })));
        room.state.bets.onChange((value: string, sessionId: string) => setBets((prev) => ({ ...prev, [sessionId]: value })));
        room.state.bets.onRemove((_v: string, sessionId: string) =>
          setBets((prev) => {
            const next = { ...prev };
            delete next[sessionId];
            return next;
          })
        );
      }
      room.state.listen("autoCycle", (v: boolean) => setAutoCycleState(v));
      room.state.listen("leaderboard", (raw: string) => {
        try {
          const parsed = JSON.parse(raw || "[]");
          setLeaderboard(Array.isArray(parsed) ? parsed : []);
        } catch {
          setLeaderboard([]);
        }
      });

      room.state.listen("currentMap", (map: MapId) => setCurrentMap(map));
      room.state.listen("timeOfDay", (t: TimeOfDay) => setTimeOfDayState(t));
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

  const send = (type: string, payload?: unknown) => roomRef.current?.send(type, payload);

  const subscribeEmotes = useCallback((listener: EmoteListener) => {
    emoteListenersRef.current.add(listener);
    return () => {
      emoteListenersRef.current.delete(listener);
    };
  }, []);

  const subscribeMessages = useCallback((listener: RoomMessageListener) => {
    messageListenersRef.current.add(listener);
    return () => {
      messageListenersRef.current.delete(listener);
    };
  }, []);

  // Stable identity: useVoiceActivity keeps this in a ref, but a stable function also keeps it
  // from being a hidden effect dependency anywhere else.
  const setSpeaking = useCallback((speaking: boolean) => {
    roomRef.current?.send("speaking", { speaking });
  }, []);

  return {
    room: roomRef.current,
    players,
    chairs,
    toggleables,
    localSessionId,
    currentMap,
    timeOfDay,
    mapTransitioning,
    connected,
    error,
    roulette,
    bets,
    autoCycle,
    leaderboard,
    latency,
    setAutoCycle: (on) => send("setAutoCycle", { on }),
    claimAllowance: () => send("claim_allowance"),
    spinSlots: (propId, bet) => send("spin_slots", { propId, bet }),
    blackjackAction: (action, bet) => send("blackjack_action", { action, bet }),
    sendChat: (text) => send("chat_bubble", { text }),
    sendGesture: (gesture) => send("gesture", { gesture }),
    buyHat: (hat) => send("buyHat", { hat }),
    placeBet: (kind, amount) => send("placeBet", { kind, amount }),
    clearBets: () => send("clearBets"),
    subscribeMessages,
    setColor: (color) => send("setColor", { color }),
    setLook: (look) => send("setLook", { look }),
    changeMap: (mapId) => send("changeMap", { mapId }),
    setTimeOfDay: (t) => send("setTimeOfDay", { timeOfDay: t }),
    sendEmote: (emoji) => send("emote", { emoji }),
    setSpeaking,
    roast: () => send("roast"),
    eat: () => send("eat"),
    dropHeld: () => send("dropHeld"),
    kickBall: (dirX: number, dirZ: number) => send("kickBall", { dirX, dirZ }),
    castLine: (afk = false) => send("castLine", { afk }),
    setStatus: (status) => send("setStatus", { status }),
    reelIn: () => send("reelIn"),
    ballRef,
    subscribeEmotes,
  };
}
