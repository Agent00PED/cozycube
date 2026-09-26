import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Room } from "colyseus.js";
import type { DiscordAuthInfo } from "./useDiscordAuth";
import { liveMotion, recordMotion } from "../systems/liveMotion";
import type {
  BallSyncState,
  BlackjackAction,
  ChairSyncState,
  EmoteBroadcast,
  LeaderboardEntry,
  BoardPacket,
  HeldItem,
  CampfirePacket,
  KitchenPacket,
  PlantPacket,
  RadioPacket,
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

import { parsePicnic, parseStew, FUEL_START, type PicnicPlate, type StewState } from "@shared/bonfire";

const RECONNECT_KEY_PREFIX = "hangout_reconnect_";

/** The Campfire's shared hearth, as the room syncs it (shared/bonfire.ts). */
export interface HearthState {
  fuel: number;
  stew: StewState;
  picnic: PicnicPlate[];
}
const EMPTY_HEARTH: HearthState = { fuel: FUEL_START, stew: parseStew(""), picnic: [] };

export type EmoteListener = (emote: EmoteBroadcast) => void;

/** One-shot server messages other than emotes (gesture, slotSpin, rouletteResult, npcSay). */
export type RoomMessageListener = (type: string, payload: any) => void;
const RELAYED_MESSAGES = [
  "gesture",
  "slotSpin",
  "rouletteResult",
  "npcSay",
  "chatBubble",
  "blackjackState",
  "openSlots",
  "allowance",
  "welcome",
  // titan infinity: per-world minigames, the boxing ring, the checklist and the vibe bonus
  "openPanel",
  "fishOnLine",
  "gachaResult",
  "clawResult",
  "arcadeResult",
  "punch",
  "boxingResult",
  "splash",
  "wishResult",
  "matchaResult",
  "blendResult",
  "boardState",
  "mochiResult",
  "dailyComplete",
  "vibe",
  // the lounge's plants: the splash for everyone, and "already watered" for the one who tried
  "plantWatered",
  "plantHappy",
  // the server refusing a board move, or failing on a message: the sender is told why
  "boardError",
  "serverError",
  // the campfire: a roast's dial and how it came off the fire; what the river gave up
  "roastStart",
  "roastResult",
  "fishCaught",
  "campfireNotice",
  // the telescope, the chopping block and foraging
  "meteorShower",
  "constellationDone",
  "starlightReel",
  // the campfire's critters: a treat for the raccoon, a duck's dive
  "critterTreat",
  "duckDive",
  "starCaught",
  "chopStroke",
  "chopResult",
  "forageResult",
  // the hearth: wood on the fire (or it burning down), the Dutch oven; Barnaby's stall
  "BONFIRE_STATE_UPDATE",
  "STEW_STATE_UPDATE",
  "barnabyResult",
  "barnabyWave",
  "busterResult",
  "busterWave",
  "workbenchResult",
  "creelFull",
] as const;
/** How often the client times a round trip for the roster's ping column. */
const PING_EVERY_MS = 5000;
// Staying connected. The "ping" above is also the heartbeat: its steady traffic keeps idle-timeout
// proxies (Discord's, the host's) from cutting a quiet socket, and its answers prove the socket is
// alive. A socket a proxy drops silently never closes, so when HEARTBEAT_MISSES pings in a row go
// unanswered for HEARTBEAT_SILENCE_MS it is treated as lost. A lost or failed connection is retried
// with backoff (RETRY_BASE_MS doubling to RETRY_MAX_MS), first with the reconnection token (the
// server holds a dropped player's seat for 30 s), then as a fresh join.
const HEARTBEAT_MISSES = 3;
const HEARTBEAT_SILENCE_MS = 15000;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 8000;
/** A join the server has not answered by now is given up on (and retried). */
const JOIN_TIMEOUT_MS = 8000;

/** A failed join as words: a network failure rejects with a bare browser event, not an Error. */
function describeFailure(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Couldn't reach the lounge's server";
}

/** `join`, or a rejection after `ms`; a room that turns up after that is left at once. */
function joinWithin(join: Promise<Room>, ms: number): Promise<Room> {
  return new Promise((resolve, reject) => {
    let late = false;
    const timer = window.setTimeout(() => {
      late = true;
      reject(new Error("The lounge took too long to answer"));
      join.then((room) => room.leave(true)).catch(() => {});
    }, ms);
    join.then(
      (room) => {
        if (late) return;
        window.clearTimeout(timer);
        resolve(room);
      },
      (err) => {
        if (late) return;
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}
/** Movement alone reaches React state at most this often (the frame loops read liveMotion). */
const MOTION_FLUSH_MS = 200;
const MOTION_KEYS: ReadonlySet<string> = new Set(["x", "z", "dirX", "dirZ"]);

/** Whether two snapshots of a player differ in nothing but where they are and which way they walk. */
function onlyMotionChanged(a: PlayerState, b: PlayerState): boolean {
  for (const key of Object.keys(b) as (keyof PlayerState)[]) if (!MOTION_KEYS.has(key) && a[key] !== b[key]) return false;
  return true;
}

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
  /** Why the last connection attempt failed or dropped, while it is being retried; null when fine. */
  connectionIssue: string | null;
  /** Tear the connection down and start the handshake again now (the loading screen's Reconnect). */
  reconnect: () => void;
  /**
   * The connection dropped mid-session and is being restored in the background: the world, the
   * HUD and any open panel stay on screen (the last state, frozen) while this is true.
   */
  reconnecting: boolean;
  /** Skip the backoff wait and try to reconnect right now (the reconnecting pill's button). */
  retryNow: () => void;
  roulette: RouletteSyncState;
  /** Roulette bets on the table this round, by sessionId (encodeBets strings). */
  bets: Record<string, string>;
  autoCycle: boolean;
  /** Persisted High Rollers (top balances), refreshed by the server every few seconds. */
  leaderboard: LeaderboardEntry[];
  /** The Campfire's hearth: the bonfire's fuel (0..100), the Dutch oven and the picnic table's plates. */
  hearth: HearthState;
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
  /** Wardrobe: buy a full outfit by id (server checks the price and the gacha-only flag). */
  buyOutfit: (outfit: string) => void;
  buyHair: (style: string) => void;
  pullGacha: () => void;
  clawPlay: (aim: number) => void;
  arcadeScore: (score: number) => void;
  /** Fishing: a bite was noticed; then the reel minigame's outcome. */
  hook: () => void;
  catchFish: (result: "caught" | "lost", quality: number) => void;
  boxingEnter: () => void;
  boxingExit: () => void;
  punch: (target: string) => void;
  tossCoin: (to: string) => void;
  splash: () => void;
  makeWish: () => void;
  matchaWhisk: (score: number) => void;
  blendDrink: (recipe: string, ingredients: string[]) => void;
  setRecord: (track: number) => void;
  /** A packet for the board game table (BoardPacket); the server answers with "boardState". */
  boardSend: (packet: BoardPacket) => void;
  /** The lounge's kitchenette (KITCHEN_BREW), radio (RADIO_UPDATE) and plants (PLANT_WATER). */
  kitchenSend: (packet: KitchenPacket) => void;
  radioSend: (packet: RadioPacket) => void;
  plantSend: (packet: PlantPacket) => void;
  /** The campfire: roasting (ROAST_START / ROAST_STOP) and the guitar (GUITAR). */
  campfireSend: (packet: CampfirePacket) => void;
  /** Sit cross-legged on the ground where you stand, facing `rotationY` (the Sit emote, away from seats). */
  groundSit: (rotationY: number) => void;
  mochiPlay: (action: string) => void;
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
  const [reconnecting, setReconnecting] = useState(false);
  const retryNowRef = useRef<(() => void) | null>(null);
  const retryNow = useCallback(() => retryNowRef.current?.(), []);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  // bumped by reconnect(): the connection effect tears everything down and starts over
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const reconnect = useCallback(() => setReconnectNonce((n) => n + 1), []);
  const emoteListenersRef = useRef(new Set<EmoteListener>());
  const messageListenersRef = useRef(new Set<RoomMessageListener>());
  const [roulette, setRoulette] = useState<RouletteSyncState>({ phase: "betting", timeLeft: 25, result: -1, spinId: 0 });
  const [bets, setBets] = useState<Record<string, string>>({});
  const [autoCycle, setAutoCycleState] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [hearth, setHearth] = useState<HearthState>(EMPTY_HEARTH);
  const [latency, setLatency] = useState(0);
  const ballRef = useRef<BallSnapshot | null>(null);

  useEffect(() => {
    if (!auth) return;
    let disposed = false;
    let connecting = false;
    let attempt = 0;
    let retryTimer: number | undefined;
    /** The room this run is connected to, if any. */
    let live: Room | null = null;
    /** Each connection's own timers, stopped when it is let go. */
    const stops = new Map<Room, (() => void)[]>();
    setConnectionIssue(null);

    const resetWorld = () => {
      setPlayers({});
      setChairs({});
      setToggleables({});
    };

    /** Let go of a room for good: its timers, every listener, and its socket if still open. */
    function retire(room: Room, consented: boolean) {
      stops.get(room)?.forEach((stop) => stop());
      stops.delete(room);
      room.removeAllListeners();
      if (room.connection?.isOpen) room.leave(consented).catch(() => {});
      if (live === room) live = null;
      if (roomRef.current === room) roomRef.current = null;
    }

    /** The connection dropped or went silent: clear it away and come back, with backoff. */
    function lost(room: Room, reason: string) {
      if (disposed || live !== room) return;
      // not consented: the server keeps the seat (and a board game's seat) for a while, and the
      // token takes it back. Mid-session this is quiet: the world stays up, frozen on its last
      // state, and a pill says we are reconnecting; nothing is unmounted.
      retire(room, false);
      setReconnecting(true);
      scheduleRetry(reason);
    }

    function scheduleRetry(reason: string) {
      if (disposed || retryTimer !== undefined) return;
      setConnectionIssue(reason);
      const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
      attempt++;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void attemptConnect();
      }, delay);
    }

    async function attemptConnect() {
      if (disposed || connecting || live) return;
      connecting = true;
      try {
        await connect();
        attempt = 0;
      } catch (err) {
        scheduleRetry(describeFailure(err));
      } finally {
        connecting = false;
      }
    }

    // back online, or the Activity looked at again: retry now instead of waiting out the backoff
    const nudge = () => {
      if (disposed || live || retryTimer === undefined) return;
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
      void attemptConnect();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") nudge();
    };
    window.addEventListener("online", nudge);
    document.addEventListener("visibilitychange", onVisible);
    retryNowRef.current = nudge;

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
          room = await joinWithin(client.reconnect(savedToken), JOIN_TIMEOUT_MS);
        } catch {
          // the seat is gone (held too long, or the server restarted): join afresh
          localStorage.removeItem(reconnectKey);
          room = await joinWithin(client.joinOrCreate("hangout_room", joinOptions), JOIN_TIMEOUT_MS);
        }
      } else {
        room = await joinWithin(client.joinOrCreate("hangout_room", joinOptions), JOIN_TIMEOUT_MS);
      }

      if (disposed) {
        room.leave();
        return;
      }

      live = room;
      const roomStops: (() => void)[] = [];
      stops.set(room, roomStops);
      roomRef.current = room;
      // dev aid: poke at the live room from the console (window.__cozyRoom.state, .send)
      if (import.meta.env.DEV) (window as unknown as { __cozyRoom?: Room }).__cozyRoom = room;
      forceRender((n) => n + 1);
      setLocalSessionId(room.sessionId);
      setConnected(true);
      setReconnecting(false);
      setConnectionIssue(null);
      localStorage.setItem(reconnectKey, room.reconnectionToken);

      room.onMessage("emote", (msg: EmoteBroadcast) => {
        emoteListenersRef.current.forEach((listener) => listener(msg));
      });
      for (const type of RELAYED_MESSAGES) {
        room.onMessage(type, (msg: unknown) => messageListenersRef.current.forEach((listener) => listener(type, msg)));
      }
      // Latency and heartbeat: time a round trip every few seconds and tell the server the last
      // result; pings that stop coming back mean the socket is dead, even if it never closed.
      let lastRtt = 0;
      let lastPong = performance.now();
      let unanswered = 0;
      room.onMessage("pong", (msg: { t: number }) => {
        lastRtt = Math.round(performance.now() - msg.t);
        lastPong = performance.now();
        unanswered = 0;
        setLatency(lastRtt);
      });
      const pingTimer = window.setInterval(() => {
        if (live !== room) return;
        if (unanswered >= HEARTBEAT_MISSES && performance.now() - lastPong > HEARTBEAT_SILENCE_MS) {
          lost(room, "The connection went quiet");
          return;
        }
        room.send("ping", { t: performance.now(), rtt: lastRtt });
        unanswered++;
      }, PING_EVERY_MS);
      roomStops.push(() => window.clearInterval(pingTimer));

      // Motion goes to liveMotion on every patch, for the frame loops. React hears about a change
      // at once only if something other than movement changed; movement alone is batched into at
      // most MOTION_FLUSH_MS-spaced updates, so walking never re-renders the app 20 times a second.
      const pendingMotion = new Map<string, PlayerState>();
      let motionFlush: number | undefined;
      const flushMotion = () => {
        motionFlush = undefined;
        if (pendingMotion.size === 0) return;
        const batch = new Map(pendingMotion);
        pendingMotion.clear();
        setPlayers((prev) => {
          const next = { ...prev };
          batch.forEach((snapshot, id) => {
            if (next[id]) next[id] = snapshot;
          });
          return next;
        });
      };
      roomStops.push(() => window.clearTimeout(motionFlush));

      // Back after a drop, the world was kept as it was: once the first full state arrives (the
      // additions below have refreshed everything still there), drop whatever is no longer
      // there (players who left meanwhile, our own old session after a fresh join).
      room.onStateChange.once(() => {
        const only = <T,>(ids: Iterable<string>) => {
          const keep = new Set(ids);
          return (prev: Record<string, T>) => (Object.keys(prev).every((id) => keep.has(id)) ? prev : Object.fromEntries(Object.entries(prev).filter(([id]) => keep.has(id))));
        };
        setPlayers(only<PlayerState>(room.state.players.keys()));
        setChairs(only<ChairSyncState>(room.state.chairs.keys()));
        setToggleables(only<ToggleableSyncState>(room.state.toggleables.keys()));
      });

      room.state.players.onAdd((player: any, sessionId: string) => {
        let last: PlayerState | null = null;
        const sync = () => {
          recordMotion(sessionId, player.x, player.z, player.moveSeq ?? 0);
          const snapshot: PlayerState = {
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
            drink: player.drink ?? "",
            snack: player.snack ?? "",
            watered: player.watered ?? "",
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
            gloves: !!player.gloves,
            boxHits: player.boxHits ?? 0,
            boxKOs: player.boxKOs ?? 0,
            aura: player.aura ?? "",
            daily: player.daily ?? "",
            fishing: player.fishing ?? "",
            fed: player.fed ?? 0,
          };
          const prevSnapshot = last;
          const motionOnly = prevSnapshot !== null && onlyMotionChanged(prevSnapshot, snapshot);
          last = snapshot;
          if (motionOnly) {
            if (prevSnapshot && prevSnapshot.x === snapshot.x && prevSnapshot.z === snapshot.z && prevSnapshot.dirX === snapshot.dirX && prevSnapshot.dirZ === snapshot.dirZ) return; // only the echo number moved
            pendingMotion.set(sessionId, snapshot);
            motionFlush ??= window.setTimeout(flushMotion, MOTION_FLUSH_MS);
            return;
          }
          pendingMotion.delete(sessionId);
          setPlayers((prev) => ({ ...prev, [sessionId]: snapshot }));
        };
        player.onChange(sync);
        sync();
      });

      room.state.players.onRemove((_player: any, sessionId: string) => {
        liveMotion.delete(sessionId);
        pendingMotion.delete(sessionId);
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

      room.state.listen("fuel", (fuel: number) => setHearth((h) => ({ ...h, fuel: fuel ?? 0 })));
      room.state.listen("stew", (raw: string) => setHearth((h) => ({ ...h, stew: parseStew(raw ?? "") })));
      room.state.listen("picnic", (raw: string) => setHearth((h) => ({ ...h, picnic: parsePicnic(raw ?? "") })));

      room.state.listen("currentMap", (map: MapId) => setCurrentMap(map));
      room.state.listen("timeOfDay", (t: TimeOfDay) => setTimeOfDayState(t));
      room.state.listen("mapTransitioning", (val: boolean) => setMapTransitioning(val));

      // the socket closed under us (a proxy timed it out, the network blinked, the server restarted).
      // The token is kept whatever the close code (a proxy's idle cut can look like a clean close):
      // the next attempt tries it first, and a seat that is really gone falls back to a fresh join.
      room.onLeave(() => lost(room, "The connection closed"));

      room.onError((code, message) => {
        setConnectionIssue(message ?? `room error (code ${code})`);
      });
    }

    void attemptConnect();

    return () => {
      disposed = true;
      retryNowRef.current = null;
      setReconnecting(false);
      window.clearTimeout(retryTimer);
      window.removeEventListener("online", nudge);
      document.removeEventListener("visibilitychange", onVisible);
      if (live) retire(live, true);
      stops.forEach((list) => list.forEach((stop) => stop()));
      stops.clear();
      roomRef.current = null;
      resetWorld();
      setConnected(false);
    };
    // Re-join when the identity of the target room changes, or on reconnect().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.channelId, auth?.userId, reconnectNonce]);

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
    connectionIssue,
    reconnect,
    reconnecting,
    retryNow,
    roulette,
    bets,
    autoCycle,
    leaderboard,
    hearth,
    latency,
    setAutoCycle: (on) => send("setAutoCycle", { on }),
    claimAllowance: () => send("claim_allowance"),
    spinSlots: (propId, bet) => send("spin_slots", { propId, bet }),
    blackjackAction: (action, bet) => send("blackjack_action", { action, bet }),
    sendChat: (text) => send("chat_bubble", { text }),
    sendGesture: (gesture) => send("gesture", { gesture }),
    groundSit: (rotationY) => send("groundSit", { rotationY }),
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
    buyOutfit: (outfit) => send("buy_outfit", { outfit }),
    buyHair: (style) => send("buy_hair", { style }),
    pullGacha: () => send("pull_gacha"),
    clawPlay: (aim) => send("claw_play", { aim }),
    arcadeScore: (score) => send("arcade_score", { score }),
    hook: () => send("hook"),
    catchFish: (result, quality) => send("catch_fish", { result, quality }),
    boxingEnter: () => send("boxing_enter"),
    boxingExit: () => send("boxing_exit"),
    punch: (target) => send("boxing_punch", { target }),
    tossCoin: (to) => send("toss_coin", { to }),
    splash: () => send("splash"),
    makeWish: () => send("make_wish"),
    matchaWhisk: (score) => send("matcha_whisk", { score }),
    blendDrink: (recipe, ingredients) => send("blend_drink", { recipe, ingredients }),
    setRecord: (track) => send("set_record", { track }),
    boardSend: (packet) => send("board", packet),
    kitchenSend: (packet) => send("kitchen", packet),
    radioSend: (packet) => send("radio", packet),
    plantSend: (packet) => send("plant", packet),
    campfireSend: (packet) => send("campfire", packet),
    mochiPlay: (action) => send("mochi_play", { action }),
    ballRef,
    subscribeEmotes,
  };
}
