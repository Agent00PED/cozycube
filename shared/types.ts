// Shared between client and server — keep this file framework-agnostic (no THREE/Colyseus imports).

export type SitPose = "sit" | "lie";
export type HeldItem = "" | "coffee" | "marshmallow";
export type PlayerAction = "" | "brew" | "roast" | "fish";

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
  /** Wardrobe outfit, encoded by encodeLook(). Empty = the defaults derived from the user id. */
  look: string;
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

export type MapId = "cozy_lounge" | "campfire_night" | "sunset_beach";

/** Shared lighting mood. Purely presentational, but synced so the room reads the same for everyone. */
export type TimeOfDay = "sunrise" | "day" | "sunset" | "night";
export const TIMES_OF_DAY: TimeOfDay[] = ["sunrise", "day", "sunset", "night"];
export function isTimeOfDay(v: unknown): v is TimeOfDay {
  return typeof v === "string" && (TIMES_OF_DAY as string[]).includes(v);
}

export type ToggleableKind = "tv" | "lamp" | "desk_lamp" | "lantern" | "campfire" | "arcade" | "espresso" | "turntable";

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
  /** Turntable only: which record is on (index into LOFI_TRACKS). */
  track: number;
}

export interface BallSyncState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

// --- gameplay tuning shared by both sides ---
export const INTERACT_RADIUS = 3.2;
export const BREW_SECONDS = 1.5;
export const ROAST_SECONDS = 9; // raw -> golden
export const TOAST_MAX = 1.7; // keep roasting past golden and it chars
export const CAMPFIRE_BOOST_SECONDS = 3;

export const EMOTES = ["☕", "🍢", "🔥", "❤️", "😂", "👋"] as const;

/** The records on the lounge turntable. The music itself is synthesised client-side. */
export const LOFI_TRACKS = ["Rainy Window", "Late Night Study", "Sunday Coffee"] as const;

/** What a fishing line can bring up, and how often (weights). */
export const CATCHES: { emoji: string; weight: number }[] = [
  { emoji: "🐟", weight: 50 },
  { emoji: "🐠", weight: 25 },
  { emoji: "🦀", weight: 12 },
  { emoji: "🐙", weight: 6 },
  { emoji: "👢", weight: 7 },
];

// --- avatar identity ---
// Head accessories are derived from the player's Discord user id rather than stored: every
// client computes the same answer, it survives reconnects and map changes, and it costs the
// room state nothing.
export type Accessory = "beret" | "beanie" | "flower" | "headphones" | "none";
const ACCESSORIES: Accessory[] = ["beret", "beanie", "flower", "headphones", "none"];

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function accessoryFor(userId: string): Accessory {
  return ACCESSORIES[hashString(userId) % ACCESSORIES.length];
}

// --- wardrobe ---
// A player's outfit travels as one short string ("skin,style,hair,shirt,pants,hat") so it is a
// single schema field and a single message. Every value is picked from a fixed palette, which is
// also how the server validates it: anything not in the lists is rejected outright.
export const SKIN_TONES = ["#fbe3d3", "#f6d7c3", "#f2cfb0", "#eec1a0", "#d9a47c", "#b67c56", "#8a5a3c", "#6b4430"];
export const HAIR_COLORS = ["#3b2a20", "#6b4430", "#1f1c1c", "#c98e4f", "#8c3d2e", "#e5d3a6", "#4a3a5c", "#f2a7bd", "#9fc3e8", "#a8d5b5"];
export const HAIR_STYLES = ["cap", "bob", "bun", "spiky", "long"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const OUTFIT_COLORS = [
  "#e8a598", "#f4b6c2", "#f0c290", "#f6e3a1", "#e8d5a8", "#a8c8a0", "#bfe3c8", "#8fb8b0",
  "#9ab8d8", "#c4d7f2", "#b8a8d0", "#d8a8c0", "#c8b090", "#f5ede0", "#7a8aa6", "#5c6b5a",
];
export const HATS: Accessory[] = ACCESSORIES;

export interface Look {
  skin: string;
  hairStyle: HairStyle;
  hair: string;
  shirt: string;
  pants: string;
  hat: Accessory;
}

/** The outfit someone has before they ever open the wardrobe — stable per user id. */
export function defaultLook(userId: string, shirt = OUTFIT_COLORS[0]): Look {
  const h = hashString(userId);
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hairStyle: HAIR_STYLES[(h >>> 8) % HAIR_STYLES.length],
    hair: HAIR_COLORS[(h >>> 4) % HAIR_COLORS.length],
    shirt,
    pants: OUTFIT_COLORS[14 + ((h >>> 12) % 2)],
    hat: accessoryFor(userId),
  };
}

export function encodeLook(l: Look): string {
  return [l.skin, l.hairStyle, l.hair, l.shirt, l.pants, l.hat].join(",");
}

/** Parses and validates; returns null for anything that isn't made of palette values. */
export function parseLook(raw: string | null | undefined): Look | null {
  if (!raw || raw.length > 64) return null;
  const [skin, hairStyle, hair, shirt, pants, hat] = raw.split(",");
  if (!SKIN_TONES.includes(skin)) return null;
  if (!(HAIR_STYLES as readonly string[]).includes(hairStyle)) return null;
  if (!HAIR_COLORS.includes(hair) || !OUTFIT_COLORS.includes(shirt) || !OUTFIT_COLORS.includes(pants)) return null;
  if (!ACCESSORIES.includes(hat as Accessory)) return null;
  return { skin, hairStyle: hairStyle as HairStyle, hair, shirt, pants, hat: hat as Accessory };
}
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

export interface KickBallMessage {
  dirX: number;
  dirZ: number;
}

export interface SpeakingMessage {
  speaking: boolean;
}

// --- server -> client broadcasts ---
export interface EmoteBroadcast {
  sessionId: string;
  emoji: string;
}
