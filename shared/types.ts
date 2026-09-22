// Shared between client and server — keep this file framework-agnostic (no THREE/Colyseus imports).

export type SitPose = "sit" | "lie";
export type HeldItem = "" | "coffee" | "marshmallow";
export type PlayerAction = "" | "brew" | "roast" | "fish" | "afkfish";

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
  /** Wallet. Starts at STARTING_COINS; lives in the room (kept across reconnects, not restarts). */
  coins: number;
  /** Carried catches and forage, encoded by encodeBag(). */
  bag: string;
  /** Comma-separated premium hats bought in the coin shop. */
  owned: string;
  /** What the player is up to away from the game (an ActivityStatusId), "" = just here. */
  status: string;
}

// --- activity status: a badge over your head saying what you're up to IRL ---
export type ActivityStatusId = "afk" | "gaming" | "eating" | "shower" | "study" | "music" | "chat";
export const ACTIVITY_STATUSES: Record<ActivityStatusId, { emoji: string; label: string }> = {
  afk: { emoji: "💤", label: "AFK" },
  gaming: { emoji: "🎮", label: "Gaming" },
  eating: { emoji: "🍜", label: "Eating" },
  shower: { emoji: "🚿", label: "Showering" },
  study: { emoji: "📚", label: "Study / Work" },
  music: { emoji: "🎵", label: "Listening" },
  chat: { emoji: "💬", label: "Chatting" },
};
export const ACTIVITY_STATUS_IDS = Object.keys(ACTIVITY_STATUSES) as ActivityStatusId[];
export function isActivityStatus(v: unknown): v is ActivityStatusId {
  return typeof v === "string" && v in ACTIVITY_STATUSES;
}

/** AFK fishing: a catch (or a few coins) every AFK_FISH_MIN_S..AFK_FISH_MAX_S seconds. */
export const AFK_FISH_MIN_S = 35;
export const AFK_FISH_MAX_S = 45;
/** Sparkles on the sand: where they can turn up, and how long before a picked one reappears. */
export const SPARKLE_SPOTS: { x: number; z: number }[] = [
  { x: -1.0, z: -3.6 },
  { x: 2.6, z: -2.6 },
  { x: -6.3, z: -4.6 },
  { x: 0.4, z: 2.8 },
  { x: 3.2, z: 1.6 },
  { x: 6.5, z: -3.5 },
  { x: -2.2, z: -4.4 },
];
export const SPARKLE_RESPAWN_S = 30;

export type MapId = "cozy_lounge" | "campfire_night" | "sunset_beach" | "velvet_casino";
export const MAP_IDS: MapId[] = ["cozy_lounge", "campfire_night", "sunset_beach", "velvet_casino"];

/** Shared lighting mood. Purely presentational, but synced so the room reads the same for everyone. */
export type TimeOfDay = "sunrise" | "day" | "sunset" | "night";
export const TIMES_OF_DAY: TimeOfDay[] = ["sunrise", "day", "sunset", "night"];
export function isTimeOfDay(v: unknown): v is TimeOfDay {
  return typeof v === "string" && (TIMES_OF_DAY as string[]).includes(v);
}

export type ToggleableKind =
  | "tv"
  | "lamp"
  | "desk_lamp"
  | "lantern"
  | "pendant"
  | "campfire"
  | "arcade"
  | "espresso"
  | "turntable"
  | "slot"
  | "npc"
  | "forage"
  | "cat"
  | "sparkle";

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
/** Emoji the server itself sends (rewards, reactions) — never accepted from a client. */
export const SYSTEM_EMOJI = ["🥂", "💤", "💃", "🪙", "💰", "🎰", "✨", "💕", "🫐", "💨"] as const;

/** Full-body social gestures (the emote bar's second row). */
export const GESTURES = ["wave", "dance", "cheers", "nap"] as const;
export type Gesture = (typeof GESTURES)[number];
export const GESTURE_SECONDS: Record<Gesture, number> = { wave: 2.2, dance: 5, cheers: 2.4, nap: 7 };
export const GESTURE_EMOJI: Record<Gesture, string> = { wave: "👋", dance: "💃", cheers: "🥂", nap: "💤" };
export function isGesture(v: unknown): v is Gesture {
  return typeof v === "string" && (GESTURES as readonly string[]).includes(v);
}
export interface GestureBroadcast {
  sessionId: string;
  gesture: Gesture;
}

// --- economy ---
export const STARTING_COINS = 100;
export const ESPRESSO_TIP = 6;
export const ESPRESSO_TIP_COOLDOWN_S = 30;
export const FORAGE_REGROW_S = 25;
/** How long a bite lasts: reel in within this window or the fish slips the hook. */
export const BITE_WINDOW_S = 2.6;

export type ItemId = "sardine" | "clownfish" | "octopus" | "goldray" | "berry" | "firefly" | "shell";
export const ITEMS: Record<ItemId, { emoji: string; name: string; value: number; buyer: "bob" | "oak" }> = {
  sardine: { emoji: "🐟", name: "Sardine", value: 10, buyer: "bob" },
  clownfish: { emoji: "🐠", name: "Clownfish", value: 25, buyer: "bob" },
  octopus: { emoji: "🐙", name: "Giant Octopus", value: 60, buyer: "bob" },
  goldray: { emoji: "🌟", name: "Golden Ray", value: 150, buyer: "bob" },
  berry: { emoji: "🫐", name: "Wild Berries", value: 5, buyer: "oak" },
  firefly: { emoji: "✨", name: "Firefly Jar", value: 12, buyer: "oak" },
  shell: { emoji: "🐚", name: "Pretty Shell", value: 8, buyer: "bob" },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export type Bag = Partial<Record<ItemId, number>>;
export function parseBag(raw: string): Bag {
  const bag: Bag = {};
  if (!raw) return bag;
  for (const part of raw.split(",")) {
    const [id, n] = part.split(":");
    if (id in ITEMS && Number(n) > 0) bag[id as ItemId] = Math.floor(Number(n));
  }
  return bag;
}
export function encodeBag(bag: Bag): string {
  return ITEM_IDS.filter((id) => (bag[id] ?? 0) > 0)
    .map((id) => `${id}:${bag[id]}`)
    .join(",");
}

// --- casino: roulette ---
export type RoulettePhase = "betting" | "spinning" | "payout";
export const ROULETTE_PHASE_SECONDS: Record<RoulettePhase, number> = { betting: 25, spinning: 6, payout: 4 };
/** European wheel order, clockwise. */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export function pocketColor(n: number): "green" | "red" | "black" {
  return n === 0 ? "green" : RED_NUMBERS.has(n) ? "red" : "black";
}
/** A bet target: "red" | "black" | "odd" | "even" | "n<0-36>". */
export type BetKind = string;
export const CHIP_VALUES = [5, 10, 25] as const;
export const MAX_BET_TOTAL = 200;
export function isBetKind(kind: unknown): kind is BetKind {
  if (typeof kind !== "string") return false;
  if (kind === "red" || kind === "black" || kind === "odd" || kind === "even") return true;
  const m = /^n(\d{1,2})$/.exec(kind);
  return !!m && Number(m[1]) <= 36;
}
/** Total returned (stake included) for a winning bet, or 0. */
export function betReturn(kind: BetKind, amount: number, result: number): number {
  if (kind === "red" || kind === "black") return pocketColor(result) === kind ? amount * 2 : 0;
  if (kind === "odd") return result !== 0 && result % 2 === 1 ? amount * 2 : 0;
  if (kind === "even") return result !== 0 && result % 2 === 0 ? amount * 2 : 0;
  return kind === `n${result}` ? amount * 36 : 0;
}
/** Bets travel as "kind:amount,kind:amount". */
export function parseBets(raw: string): Record<BetKind, number> {
  const out: Record<BetKind, number> = {};
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const [k, n] = part.split(":");
    if (isBetKind(k) && Number(n) > 0) out[k] = Math.floor(Number(n));
  }
  return out;
}
export function encodeBets(bets: Record<BetKind, number>): string {
  return Object.entries(bets)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(",");
}
export interface RouletteSyncState {
  phase: RoulettePhase;
  timeLeft: number;
  result: number;
  spinId: number;
}
export interface RouletteResultBroadcast {
  result: number;
  winners: { sessionId: string; username: string; amount: number }[];
}
export const ROULETTE_CENTER = { x: 0.6, z: 0.4 };
export const ROULETTE_BET_RADIUS = 4.4;

// --- casino: slots ---
export const SLOT_COST = 5;
export const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "7"] as const;
/** Payout multipliers for three of a kind, by symbol index; any pair pays 2x. */
export const SLOT_TRIPLE = [5, 8, 12, 20, 50];
export interface SlotBroadcast {
  propId: string;
  sessionId: string;
  reels: [number, number, number];
  win: number;
}

// --- NPC traders ---
export type NpcId = "bob" | "oak";
export const NPCS: Record<string, { npc: NpcId; name: string }> = {
  npc_bob: { npc: "bob", name: "Fisherman Bob" },
  npc_oak: { npc: "oak", name: "Ranger Oak" },
};

/** The records on the lounge turntable. The music itself is synthesised client-side. */
export const LOFI_TRACKS = ["Rainy Window", "Late Night Study", "Sunday Coffee"] as const;

// --- avatar identity ---
// Head accessories are derived from the player's Discord user id rather than stored: every
// client computes the same answer, it survives reconnects and map changes, and it costs the
// room state nothing.
export type FreeAccessory = "beret" | "beanie" | "flower" | "headphones" | "none";
export type PremiumHat = "straw" | "bunny" | "tophat" | "crown";
export type Accessory = FreeAccessory | PremiumHat;
const ACCESSORIES: FreeAccessory[] = ["beret", "beanie", "flower", "headphones", "none"];
/** The coin shop: premium hats and their prices. */
export const PREMIUM_HATS: Record<PremiumHat, { name: string; price: number; emoji: string }> = {
  straw: { name: "Straw Sunhat", price: 80, emoji: "👒" },
  bunny: { name: "Bunny Ears", price: 120, emoji: "🐰" },
  tophat: { name: "Top Hat", price: 200, emoji: "🎩" },
  crown: { name: "High Roller Crown", price: 400, emoji: "👑" },
};
export const PREMIUM_HAT_IDS = Object.keys(PREMIUM_HATS) as PremiumHat[];
export function isPremiumHat(v: unknown): v is PremiumHat {
  return typeof v === "string" && v in PREMIUM_HATS;
}

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function accessoryFor(userId: string): FreeAccessory {
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
export const HATS: FreeAccessory[] = ACCESSORIES;

export interface Look {
  skin: string;
  hairStyle: HairStyle;
  hair: string;
  shirt: string;
  pants: string;
  hat: Accessory;
}

/** The palette colour closest to any "#rrggbb" — so a shirt handed in from outside the
 *  wardrobe (the server's join-time pastel) always encodes to a look that validates. */
export function nearestOutfitColor(hex: string): string {
  if (OUTFIT_COLORS.includes(hex)) return hex;
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  const [r, g, b] = rgb(hex);
  let best = OUTFIT_COLORS[0];
  let bestD = Infinity;
  for (const c of OUTFIT_COLORS) {
    const [cr, cg, cb] = rgb(c);
    const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** The outfit someone has before they ever open the wardrobe — stable per user id. */
export function defaultLook(userId: string, shirt = OUTFIT_COLORS[0]): Look {
  const h = hashString(userId);
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hairStyle: HAIR_STYLES[(h >>> 8) % HAIR_STYLES.length],
    hair: HAIR_COLORS[(h >>> 4) % HAIR_COLORS.length],
    shirt: nearestOutfitColor(shirt),
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
  if (!ACCESSORIES.includes(hat as FreeAccessory) && !isPremiumHat(hat)) return null;
  return { skin, hairStyle: hairStyle as HairStyle, hair, shirt, pants, hat: hat as Accessory };
}
export type Emote = (typeof EMOTES)[number];

/** Seat styles you lie down on rather than sit on. */
export function poseForSeat(style: SeatStyle): SitPose {
  return style === "blanket" ? "lie" : "sit";
}

/** Props you must walk up to before using; everything else (lights, TV, campfire) works from anywhere. */
export function isWalkUpProp(kind: ToggleableKind): boolean {
  return kind === "espresso" || kind === "arcade" || kind === "slot" || kind === "npc" || kind === "forage" || kind === "cat" || kind === "sparkle";
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
