// Shared between client and server — keep this file framework-agnostic (no THREE/Colyseus imports).

export type SitPose = "sit" | "lie";
export type HeldItem = "" | "coffee" | "marshmallow";
export type PlayerAction = "" | "brew" | "roast";

export interface PlayerState {
  sessionId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  x: number;
  y: number; // height, mostly fixed for a flat diorama room
  z: number;
  dirX: number;
  dirZ: number;
  color: string; // "#rrggbb"
  sitting: boolean;
  sitRotationY: number; // facing direction snapped from the chair while sitting
  /** Vertical offset while seated, so bar stools and floor blankets put the body at the right height. */
  sitY: number;
  sitPose: SitPose;
  holding: HeldItem;
  action: PlayerAction;
  /** 0..1 progress of a timed action (the espresso brew gauge). */
  actionProgress: number;
  /** Marshmallow doneness: 0 raw, 1 golden, TOAST_MAX burnt. */
  toast: number;
  speaking: boolean;
  connected: boolean;
}

export type MapId = "cozy_lounge" | "campfire_night";

/** Shared lighting mood. Purely presentational, but synced so the room reads the same for everyone. */
export type TimeOfDay = "sunrise" | "day" | "sunset" | "night";
export const TIMES_OF_DAY: TimeOfDay[] = ["sunrise", "day", "sunset", "night"];
export function isTimeOfDay(v: unknown): v is TimeOfDay {
  return typeof v === "string" && (TIMES_OF_DAY as string[]).includes(v);
}

export type ToggleableKind = "tv" | "lamp" | "desk_lamp" | "lantern" | "campfire" | "arcade" | "espresso";

// How a seat draws itself. "pad" and "blanket" seats have no geometry of their own — the
// visible furniture is already drawn by the world (sofa cushions, beanbags, picnic blanket),
// so the seat contributes only a click target and a snap point.
export type SeatStyle = "gaming" | "log" | "pad" | "stool" | "armchair" | "wood" | "deckchair" | "blanket";

// Runtime (synced) state of an interactive prop — mirrors the server's ChairState/ToggleableState schema.
export interface ChairSyncState {
  propId: string;
  x: number;
  z: number;
  rotationY: number;
  style: SeatStyle;
  sitY: number;
  occupiedBy: string; // sessionId, or "" if free
}

export interface ToggleableSyncState {
  propId: string;
  x: number;
  y: number;
  z: number;
  kind: ToggleableKind;
  color: string; // "#rrggbb", the glow color when on
  on: boolean;
  /** Seconds of campfire flare-up remaining after someone throws on firewood. */
  boost: number;
}

// --- gameplay tuning shared by both sides ---
export const INTERACT_RADIUS = 3.2;
export const BREW_SECONDS = 1.5;
export const ROAST_SECONDS = 9; // raw -> golden
export const TOAST_MAX = 1.7; // keep roasting past golden and it chars
export const CAMPFIRE_BOOST_SECONDS = 3;

export const EMOTES = ["☕", "🍢", "🔥", "❤️", "😂", "👋"] as const;
export type Emote = (typeof EMOTES)[number];

/** Seat styles you lie down on rather than sit on. */
export function poseForSeat(style: SeatStyle): SitPose {
  return style === "blanket" ? "lie" : "sit";
}

/** Props you must walk up to before using; everything else (lights, TV, campfire) works from anywhere. */
export function isWalkUpProp(kind: ToggleableKind): boolean {
  return kind === "espresso" || kind === "arcade";
}

// --- client -> server messages ---
// The client is visually authoritative while walking, so it reports the position its own
// prediction arrived at. The server validates that position (reachable since the last report,
// not inside an obstacle, inside the world bounds) rather than re-integrating movement on its
// own clock — two independent integrations is exactly what produced the rollback jitter.
export interface MoveMessage {
  dirX: number;
  dirZ: number;
  x: number;
  z: number;
  seq: number;
}

export interface SetColorMessage {
  color: string;
}

export interface ChangeMapMessage {
  mapId: MapId;
}

export interface InteractChairMessage {
  chairId: string;
  x?: number;
  z?: number;
}

export interface UsePropMessage {
  propId: string;
  x?: number;
  z?: number;
}

export interface EmoteMessage {
  emoji: string;
}

export interface SetTimeOfDayMessage {
  timeOfDay: TimeOfDay;
}

export interface SpeakingMessage {
  speaking: boolean;
}

// --- server -> client broadcasts ---
export interface EmoteBroadcast {
  sessionId: string;
  emoji: string;
}
