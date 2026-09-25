// Shared between client and server — keep this file framework-agnostic (no THREE/Colyseus imports).

export type SitPose = "sit" | "lie";
export type HeldItem = "" | "coffee" | "marshmallow" | "skewer";
/** "reel" is the Stardew-style tension mini-game after a bite; "dizzy" is a boxing knockdown. */
export type PlayerAction = "" | "brew" | "roast" | "fish" | "afkfish" | "reel" | "dizzy" | "grill" | "guitar";

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
  /** What is in the mug while holding "coffee" from the kitchenette (encodeDrink), "" for a plain one. */
  drink: string;
  /** The lounge plants this player has watered today, comma-separated prop ids. */
  watered: string;
  /** What is on the skewer while holding "skewer" from the campfire (encodeSnack), e.g. "mallow:golden". */
  snack: string;
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
  /** Lifetime stats (a PlayerStats as JSON), persisted between visits. */
  stats: string;
  /** Round-trip latency to the server in ms, as the client last measured it. */
  ping: number;
  /** Boxing: wearing the big gloves (inside the ring), hits taken this round, knockdowns scored. */
  gloves: boolean;
  boxHits: number;
  boxKOs: number;
  /** A temporary glow (from a blended drink): a colour, or "" for none. */
  aura: string;
  /** Today's cozy checklist (a DailyChecklist as JSON). */
  daily: string;
}

/** Lifetime achievements, kept in PostgreSQL and shown in the profile / roster. */
export interface PlayerStats {
  roulette_wins: number;
  blackjack_wins: number;
  slots_spins: number;
  fish_caught: number;
  marshmallows_roasted: number;
  boxing_knockouts: number;
  gacha_pulls: number;
  mochi_pets: number;
  time_spent_mins: number;
}
export const DEFAULT_STATS: PlayerStats = { roulette_wins: 0, blackjack_wins: 0, slots_spins: 0, fish_caught: 0, marshmallows_roasted: 0, boxing_knockouts: 0, gacha_pulls: 0, mochi_pets: 0, time_spent_mins: 0 };

// --- the daily cozy checklist ---
export type DailyTaskId = "pet_mochi" | "catch_fish" | "win_boxing" | "soak_onsen" | "roast_marshmallow" | "spin_slots" | "pull_gacha" | "splash_water" | "brew_coffee" | "make_wish";
export const DAILY_TASKS: Record<DailyTaskId, { label: string; emoji: string; goal: number }> = {
  pet_mochi: { label: "Play with Mochi", emoji: "🐱", goal: 1 },
  catch_fish: { label: "Catch 2 fish", emoji: "🎣", goal: 2 },
  win_boxing: { label: "Win a boxing bout", emoji: "🥊", goal: 1 },
  soak_onsen: { label: "Soak in the onsen for 30 s", emoji: "♨️", goal: 1 },
  roast_marshmallow: { label: "Toast a marshmallow", emoji: "🍢", goal: 1 },
  spin_slots: { label: "Spin the slots 3 times", emoji: "🎰", goal: 3 },
  pull_gacha: { label: "Turn the gachapon", emoji: "🔮", goal: 1 },
  splash_water: { label: "Splash someone at the onsen", emoji: "💦", goal: 1 },
  brew_coffee: { label: "Pull an espresso", emoji: "☕", goal: 1 },
  make_wish: { label: "Make a wish at the well", emoji: "🪙", goal: 1 },
};
export const DAILY_REWARD = 75;
export interface DailyChecklist {
  /** YYYY-MM-DD (UTC) the list was rolled for. */
  date: string;
  tasks: { id: DailyTaskId; progress: number }[];
  claimed: boolean;
}
export function parseDaily(raw: string | null | undefined): DailyChecklist | null {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" && Array.isArray(v.tasks) ? (v as DailyChecklist) : null;
  } catch {
    return null;
  }
}

/** Time-in-room rewards: coins every VIBE_EVERY_MIN minutes, more when it is a party. */
export const VIBE_EVERY_MIN = 10;
export const VIBE_COINS = 15;
export const VIBE_PARTY_SIZE = 3;
export const VIBE_PARTY_MULTIPLIER = 1.5;
export function parseStats(raw: string | null | undefined): PlayerStats {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return { ...DEFAULT_STATS, ...(v && typeof v === "object" ? v : {}) };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

/** Achievement milestones surfaced as toasts when a stat first reaches them. */
export const ACHIEVEMENTS: { stat: keyof PlayerStats; at: number; title: string; emoji: string }[] = [
  { stat: "fish_caught", at: 1, title: "First catch!", emoji: "🐟" },
  { stat: "fish_caught", at: 10, title: "Angler", emoji: "🎣" },
  { stat: "marshmallows_roasted", at: 1, title: "Campfire cook", emoji: "🍢" },
  { stat: "marshmallows_roasted", at: 10, title: "S'more sommelier", emoji: "🔥" },
  { stat: "slots_spins", at: 25, title: "One more spin", emoji: "🎰" },
  { stat: "roulette_wins", at: 1, title: "Lucky number", emoji: "🎡" },
  { stat: "roulette_wins", at: 10, title: "High roller", emoji: "💰" },
  { stat: "blackjack_wins", at: 1, title: "Twenty-one", emoji: "🃏" },
  { stat: "blackjack_wins", at: 10, title: "Card shark", emoji: "🦈" },
];

/** The house tops you up when you are broke: once per cooldown, only under this balance. */
export const ALLOWANCE_COINS = 50;
export const ALLOWANCE_BELOW = 10;
export const ALLOWANCE_COOLDOWN_S = 600;

/** Quick chat: short lines that float over your head as a speech bubble for everyone. */
export const CHAT_MAX_CHARS = 80;
export const CHAT_BUBBLE_SECONDS = 4;
export const QUICK_CHATS = ["hi! 👋", "brb", "gg!", "lol", "come sit here!", "let's go to the beach 🏖️", "who's up for roulette? 🎡", "love this song 🎶"];
export interface ChatBubbleBroadcast {
  sessionId: string;
  text: string;
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

export type MapId = "cozy_lounge" | "campfire_night" | "sunset_beach" | "velvet_casino" | "boxing_ring" | "japanese_onsen" | "retro_arcade" | "gaming_cafe";
/**
 * Every world, in the fast-travel grid's order: two per row, a theme per row (cozy living,
 * vacation and spa, action and play, gaming and cyber).
 */
export const MAP_IDS: MapId[] = ["cozy_lounge", "campfire_night", "sunset_beach", "japanese_onsen", "velvet_casino", "boxing_ring", "retro_arcade", "gaming_cafe"];
export function isMapId(v: unknown): v is MapId {
  return typeof v === "string" && (MAP_IDS as string[]).includes(v);
}

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
  | "sparkle"
  | "stew"
  | "gacha"
  | "claw"
  | "well"
  | "teahouse"
  | "blender"
  | "boardgame"
  | "jukebox"
  | "shishi"
  | "kitchen"
  | "radio"
  | "plant"
  | "bonfire"
  | "fishing";

// How a seat draws itself. "pad" and "blanket" seats have no geometry of their own — the
// visible furniture is already drawn by the world (sofa cushions, beanbags, picnic blanket),
// so the seat contributes only a click target and a snap point.
export type SeatStyle = "gaming" | "log" | "pad" | "stool" | "armchair" | "wood" | "deckchair" | "blanket" | "onsen" | "bleacher" | "wingback";

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

/**
 * Full-body gestures: the social ones (the emote bar's second row), and the ones the server plays
 * on its own when something happens (SERVER_GESTURES): watering a plant, reaching over the board
 * to make a move.
 */
export const GESTURES = ["wave", "dance", "cheers", "nap", "water", "reach"] as const;
export type Gesture = (typeof GESTURES)[number];
export const GESTURE_SECONDS: Record<Gesture, number> = { wave: 2.2, dance: 5, cheers: 2.4, nap: 7, water: 1.8, reach: 0.8 };
export const GESTURE_EMOJI: Record<Gesture, string> = { wave: "👋", dance: "💃", cheers: "🥂", nap: "💤", water: "💧", reach: "♟️" };
/** Gestures only the server starts (a client asking for one is ignored). */
export const SERVER_GESTURES: ReadonlySet<Gesture> = new Set(["water", "reach"]);
export function isGesture(v: unknown): v is Gesture {
  return typeof v === "string" && (GESTURES as readonly string[]).includes(v);
}
export interface GestureBroadcast {
  sessionId: string;
  gesture: Gesture;
}

// --- economy ---
export const STARTING_COINS = 150;
/** The stew pot by the campfire: stir it this many times and it feeds everyone round the fire. */
export const STEW_STIRS = 5;
export const STEW_REWARD = 4;
export const STEW_RADIUS = 6;
export const STEW_COOLDOWN_S = 40;
export const ESPRESSO_TIP = 6;
export const ESPRESSO_TIP_COOLDOWN_S = 30;
export const FORAGE_REGROW_S = 25;
/** How long a bite lasts: reel in within this window or the fish slips the hook. */
export const BITE_WINDOW_S = 2.6;

export type ItemId = "sardine" | "clownfish" | "octopus" | "goldray" | "berry" | "firefly" | "shell" | "seabass" | "starfish" | "trout" | "salmon" | "crayfish" | "plush";
export const ITEMS: Record<ItemId, { emoji: string; name: string; value: number; buyer: "bob" | "oak" }> = {
  sardine: { emoji: "🐟", name: "Sardine", value: 10, buyer: "bob" },
  clownfish: { emoji: "🐠", name: "Clownfish", value: 25, buyer: "bob" },
  seabass: { emoji: "🐟", name: "Sea Bass", value: 35, buyer: "bob" },
  starfish: { emoji: "⭐", name: "Starfish", value: 18, buyer: "bob" },
  octopus: { emoji: "🐙", name: "Giant Octopus", value: 60, buyer: "bob" },
  goldray: { emoji: "🌟", name: "Golden Ray", value: 150, buyer: "bob" },
  trout: { emoji: "🐟", name: "River Trout", value: 20, buyer: "oak" },
  salmon: { emoji: "🍣", name: "Salmon", value: 45, buyer: "oak" },
  crayfish: { emoji: "🦞", name: "Crayfish", value: 14, buyer: "oak" },
  berry: { emoji: "🫐", name: "Wild Berries", value: 5, buyer: "oak" },
  firefly: { emoji: "✨", name: "Firefly Jar", value: 12, buyer: "oak" },
  shell: { emoji: "🐚", name: "Pretty Shell", value: 8, buyer: "bob" },
  plush: { emoji: "🧸", name: "Mochi Plush", value: 40, buyer: "bob" },
};

// --- fishing: the Stardew-style reel mini-game ---
/** How long the tension game lasts before the fish wins by exhaustion. */
export const REEL_SECONDS = 22;
export type FishingWater = "ocean" | "river";
/** What a line brings up, per water. "boot" is a dud. `speed` shapes the mini-game. */
export const FISH_TABLES: Record<FishingWater, { item: ItemId | "boot"; weight: number; speed: number; size: number }[]> = {
  ocean: [
    { item: "sardine", weight: 40, speed: 0.7, size: 0.9 },
    { item: "clownfish", weight: 22, speed: 1.0, size: 0.8 },
    { item: "seabass", weight: 14, speed: 1.4, size: 1.1 },
    { item: "starfish", weight: 10, speed: 0.4, size: 0.7 },
    { item: "boot", weight: 8, speed: 0.3, size: 1.2 },
    { item: "octopus", weight: 5, speed: 1.6, size: 1.3 },
    { item: "goldray", weight: 1, speed: 2.0, size: 1.0 },
  ],
  river: [
    { item: "trout", weight: 45, speed: 0.9, size: 0.9 },
    { item: "crayfish", weight: 25, speed: 0.5, size: 0.7 },
    { item: "salmon", weight: 18, speed: 1.5, size: 1.2 },
    { item: "boot", weight: 12, speed: 0.3, size: 1.2 },
  ],
};
export interface FishOnLine {
  item: ItemId | "boot";
  speed: number;
  size: number;
  water: FishingWater;
}
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
/** Stakes the slot modal offers; a win scales with the stake. */
export const SLOT_BETS = [5, 10, 25] as const;
export const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "🍀", "💎", "7"] as const;
/** Payout multipliers (of the stake) for three of a kind, by symbol index; any pair pays 2x. */
export const SLOT_TRIPLE = [5, 8, 12, 20, 35, 60];
export interface SlotBroadcast {
  propId: string;
  sessionId: string;
  reels: [number, number, number];
  win: number;
  bet: number;
}

// --- boxing ring ---
export const BOXING_RING = { x: 0, z: 0, half: 3.2, height: 0.5 };
export const BOXING_REACH = 1.7;
export const PUNCH_COOLDOWN_MS = 650;
export const BOXING_KNOCKDOWN_HITS = 3;
export const BOXING_DIZZY_S = 3;
export const BOXING_BOUT_KOS = 2;
export const BOXING_PURSE = 20;
export const BOXING_TIP = 5;

// --- japanese onsen ---
export const ONSEN_POOL = { x0: -3.4, x1: 3.4, z0: -2.6, z1: 2.6, depth: 0.42 };
export const ONSEN_SOAK_S = 30;
export const WISH_COST = 1;
export const FORTUNES = [
  "A warm drink will find you before the day is out.",
  "Someone is thinking of you kindly right now.",
  "The fish are biting on the north bank tonight.",
  "Luck favours the one who stirs the stew.",
  "Rest is productive. Stay a little longer.",
  "A small kindness today comes back tenfold.",
  "Your next spin has a good feeling about it.",
  "Mochi approves of you. That is rare.",
];
export const MATCHA_REWARD_MAX = 8;
export const MATCHA_COOLDOWN_S = 60;

// --- beach bar: blended drinks ---
export const DRINK_RECIPES: { id: string; name: string; emoji: string; aura: string; needs: string[] }[] = [
  { id: "sunset", name: "Sunset Punch", emoji: "🍹", aura: "#ff9a5c", needs: ["mango", "lime", "ice"] },
  { id: "lagoon", name: "Blue Lagoon", emoji: "🧊", aura: "#6fd3ff", needs: ["coconut", "ice", "mint"] },
  { id: "berry", name: "Berry Fizz", emoji: "🫐", aura: "#c98fff", needs: ["berry", "lime", "mint"] },
];
export const DRINK_INGREDIENTS = ["mango", "lime", "ice", "coconut", "mint", "berry"] as const;
export const DRINK_REWARD = 6;
export const DRINK_COOLDOWN_S = 45;
export const AURA_SECONDS = 90;

// --- retro arcade: gachapon, claw and the cabinet high score ---
export const GACHA_COST = 25;
export const CLAW_COST = 10;
export const CLAW_WIN_COINS = 30;
export const ARCADE_SCORE_COOLDOWN_S = 60;
export const ARCADE_COINS_PER_POINT = 0.1;
export const ARCADE_COINS_MAX = 20;
export type GachaPrize = { kind: "hat"; id: PremiumHat } | { kind: "outfit"; id: OutfitId } | { kind: "coins"; amount: number } | { kind: "dupe"; refund: number; id: string };

// --- the lounge board game table: chess or checkers, two seats, anyone may watch ---
//
// The server owns the rules (server/src/rooms/boardgame.ts: chess.js for chess, its own engine for
// checkers) and broadcasts the whole table as a BoardGameView ("boardState") after every change,
// so the two players and every spectator always draw the same, authoritative board. Clients send
// BoardPackets on the "board" channel.

export type BoardGameType = "chess" | "checkers";
/** Seat 1 plays white (and moves first), seat 2 black: in chess the pieces, in checkers the cream and cocoa discs. */
export type BoardSide = "w" | "b";
/**
 * A square is its index 0..63, row by row from the top of the board as white sees it: 0 is a8,
 * 7 is h8, 56 is a1, 63 is h1. A promotion names the piece a pawn becomes (chess only).
 */
export interface BoardMove {
  from: number;
  to: number;
  promotion?: "q" | "r" | "b" | "n";
}
export type BoardPacket =
  /** The board modal opened (watching) or closed: the table lists who is looking on. */
  | { type: "BOARD_WATCH"; watching: boolean }
  /** Take a seat (sitting on its chair too, if you are near and it is free). */
  | { type: "BOARD_SIT"; seat: BoardSide }
  /** Get up from the table: an unfinished game with an opponent is forfeited. */
  | { type: "BOARD_LEAVE" }
  /** Choose the game, while none is under way. */
  | { type: "BOARD_SELECT"; gameType: BoardGameType }
  /** A move. `fen` is what the sender's board shows; the server's own position is what counts. */
  | { type: "BOARD_MOVE"; gameType: BoardGameType; move: BoardMove; fen?: string }
  /** A fresh board (a rematch, or a new game type), once a game is over or before it has begun. */
  | { type: "BOARD_RESET"; gameType: BoardGameType }
  | { type: "BOARD_RESIGN" }
  /** Offer a draw, or answer one (accept: true / false). */
  | { type: "BOARD_DRAW"; accept?: boolean };

export interface BoardGameView {
  gameType: BoardGameType;
  /**
   * The 64 squares (see BoardMove): "" is empty, otherwise the side and the piece: chess
   * "wp" "wn" "wb" "wr" "wq" "wk" (and "b..."), checkers "wm" / "bm" for a man and "wk" / "bk"
   * for a king.
   */
  cells: string[];
  seats: Record<BoardSide, string>; // session ids, "" while open
  names: Record<BoardSide, string>;
  turn: BoardSide;
  /** "waiting" for a second player, "playing", or "over". */
  phase: "waiting" | "playing" | "over";
  /** Who won ("draw" for a draw), once it is over. */
  result: "" | BoardSide | "draw";
  /** Why it ended: "checkmate", "stalemate", "resignation", "no moves left", "draw agreed", ... */
  reason: string;
  /** The side to move is in check (chess). */
  check: boolean;
  /** The side to move has to capture (checkers). */
  mustJump: boolean;
  /** Every legal move for the side to move: the board's tap-to-highlight comes from here. */
  legal: { from: number; to: number; promotion: boolean }[];
  lastMove: { from: number; to: number } | null;
  /** A standing draw offer, and whose it is. */
  drawOffer: "" | BoardSide;
  /** The chess position (Forsyth-Edwards); "" for checkers. */
  fen: string;
  /** Plies played in this game. */
  moves: number;
  /** Who has the board open and is not playing. */
  watchers: string[];
  /**
   * A seated player who is not here right now (their connection dropped, or the server restarted
   * and they have not rejoined yet): the seat is held for them for a minute.
   */
  away?: Partial<Record<BoardSide, boolean>>;
}
/** The winner's purse, paid once a decisive game has lasted at least BOARD_MIN_PLIES_FOR_PURSE plies. */
export const BOARD_WIN_COINS = 15;
export const BOARD_MIN_PLIES_FOR_PURSE = 6;

// --- the lounge's kitchenette, radio and plants ---
//
// Clients send typed packets: KitchenPacket on "kitchen", RadioPacket on "radio", PlantPacket on
// "plant". The radio's station and whether it plays live in its prop's synced state (on, track),
// so everyone, late arrivals too, hears the same station; the music itself is generated in each
// browser (client/src/audio/radio.ts), and its volume and mute are each player's own.

export const DRINK_BASES = ["coffee", "matcha", "milktea"] as const;
export type DrinkBase = (typeof DRINK_BASES)[number];
export const DRINK_TOPPINGS = ["marshmallow", "cinnamon", "caramel", "cream"] as const;
export type DrinkTopping = (typeof DRINK_TOPPINGS)[number];
/** Each base: its name, and the colour of the drink in the mug. */
export const DRINK_BASE_INFO: Record<DrinkBase, { name: string; emoji: string; color: string; note: string }> = {
  coffee: { name: "Coffee", emoji: "☕", color: "#6b4430", note: "a smooth house roast" },
  matcha: { name: "Matcha", emoji: "🍵", color: "#8fb56a", note: "whisked, grassy and sweet" },
  milktea: { name: "Milk Tea", emoji: "🧋", color: "#c9a27a", note: "black tea, milk and honey" },
};
export const DRINK_TOPPING_INFO: Record<DrinkTopping, { name: string; emoji: string }> = {
  marshmallow: { name: "Marshmallows", emoji: "🍡" },
  cinnamon: { name: "Cinnamon", emoji: "🌰" },
  caramel: { name: "Caramel", emoji: "🍯" },
  cream: { name: "Whipped Cream", emoji: "🍦" },
};
export function encodeDrink(base: DrinkBase, topping: DrinkTopping): string {
  return `${base}:${topping}`;
}
export function parseDrink(raw: string): { base: DrinkBase; topping: DrinkTopping } | null {
  const [base, topping] = raw.split(":");
  return (DRINK_BASES as readonly string[]).includes(base) && (DRINK_TOPPINGS as readonly string[]).includes(topping) ? { base: base as DrinkBase, topping: topping as DrinkTopping } : null;
}
/** The brewing animation the kitchen modal plays before the drink is poured. */
export const KITCHEN_BREW_SECONDS = 1.5;
export type KitchenPacket = { type: "KITCHEN_BREW"; base: DrinkBase; topping: DrinkTopping };

/** The radio's stations, in the order its synced `track` indexes them. */
export const RADIO_STATIONS = [
  { id: "lofi", name: "Cozy Lofi Beats", emoji: "🎧", mood: "dusty keys, a lazy boom-bap, vinyl crackle" },
  { id: "rain", name: "Rainy Evening", emoji: "🌧️", mood: "soft rain on the glass, slow pads, a few piano notes" },
  { id: "jazz", name: "Sunny Café Jazz", emoji: "🎷", mood: "a walking bass, brushed swing, bright chords" },
  { id: "stars", name: "Starlight Ambient", emoji: "🌙", mood: "a warm drone and a music-box twinkle" },
] as const;
export type RadioStationId = (typeof RADIO_STATIONS)[number]["id"];
export function radioStationIndex(id: string): number {
  return RADIO_STATIONS.findIndex((s) => s.id === id);
}
export type RadioPacket = { type: "RADIO_UPDATE"; station: RadioStationId; playing: boolean };

/** Coins for watering a plant: each plant, once a day. */
export const PLANT_WATER_COINS = 15;
/** The daily things (plants, the checklist) roll over at midnight UTC: how long until then. */
export function msUntilNextDay(now = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now;
}
export type PlantPacket = { type: "PLANT_WATER"; plantId: string };
/** Broadcast when a plant is watered: where to splash, and who earned what. */
export interface PlantWatered {
  type: "PLANT_WATERED";
  sessionId: string;
  plantId: string;
  coins: number;
}

// --- mochi ---
export const MOCHI_ACTIONS = ["feather", "treat", "scritch"] as const;
export type MochiAction = (typeof MOCHI_ACTIONS)[number];
export const MOCHI_SCRITCH_COINS = [5, 10];
export const MOCHI_ACTION_COOLDOWN_S = 20;

// --- casino: blackjack ---
export const BLACKJACK_BETS = [10, 25, 50, 100] as const;
/** Where the half-moon table stands; you must be this close to play. */
export const BLACKJACK_CENTER = { x: -5.5, z: -4.6 };
export const BLACKJACK_RADIUS = 3.6;
export interface BlackjackCard {
  rank: string; // "A", "2".."10", "J", "Q", "K"
  suit: string; // "♠" "♥" "♦" "♣"
}
export type BlackjackPhase = "idle" | "player" | "dealer" | "done";
export type BlackjackOutcome = "" | "blackjack" | "win" | "push" | "lose" | "bust";
/** What the player sees: the dealer's hole card stays hidden until the dealer plays. */
export interface BlackjackView {
  phase: BlackjackPhase;
  bet: number;
  player: BlackjackCard[];
  dealer: BlackjackCard[];
  holeHidden: boolean;
  playerTotal: number;
  dealerTotal: number;
  outcome: BlackjackOutcome;
  payout: number;
  canDouble: boolean;
}
export type BlackjackAction = "deal" | "hit" | "stand" | "double";
/** Best total with aces as 11 where that does not bust, else 1. */
export function blackjackTotal(cards: BlackjackCard[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces++;
      total += 11;
    } else if (c.rank === "J" || c.rank === "Q" || c.rank === "K") total += 10;
    else total += Number(c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
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
export type PremiumHat = "straw" | "bunny" | "tophat" | "crown" | "mochiears";

// --- outfits: a whole look for the body, in one accent colour of your choosing ---
export type OutfitId = "outfit_starter_hoodie" | "outfit_starter_overalls" | "outfit_flannel_vest" | "outfit_hawaiian" | "outfit_tuxedo" | "outfit_boxing" | "outfit_yukata" | "outfit_cyber";
export const OUTFITS: Record<OutfitId, { name: string; emoji: string; price: number; gachaOnly?: boolean }> = {
  outfit_starter_hoodie: { name: "Cozy Hoodie & Sweats", emoji: "🧥", price: 0 },
  outfit_starter_overalls: { name: "Classic Denim Overalls", emoji: "👖", price: 0 },
  outfit_flannel_vest: { name: "Flannel Camp Vest", emoji: "🪵", price: 120 },
  outfit_hawaiian: { name: "Hawaiian Floral Set", emoji: "🌺", price: 150 },
  outfit_tuxedo: { name: "Velvet Evening Tuxedo", emoji: "🎩", price: 250 },
  outfit_boxing: { name: "Boxing Robe & Shorts", emoji: "🥊", price: 200 },
  outfit_yukata: { name: "Indigo Bath Yukata", emoji: "👘", price: 180 },
  outfit_cyber: { name: "Retro Cyber Jumpsuit", emoji: "🕹️", price: 0, gachaOnly: true },
};
export const OUTFIT_IDS = Object.keys(OUTFITS) as OutfitId[];
export const STARTER_OUTFITS: OutfitId[] = ["outfit_starter_hoodie", "outfit_starter_overalls"];
export function isOutfitId(v: unknown): v is OutfitId {
  return typeof v === "string" && v in OUTFITS;
}
/** Everything a fresh player owns: the two starter outfits and the bare head. */
export const STARTER_UNLOCKS = ["outfit_starter_hoodie", "outfit_starter_overalls", "hat_none"];
export type Accessory = FreeAccessory | PremiumHat;
const ACCESSORIES: FreeAccessory[] = ["beret", "beanie", "flower", "headphones", "none"];
/** The coin shop: premium hats and their prices. */
export const PREMIUM_HATS: Record<PremiumHat, { name: string; price: number; emoji: string; gachaOnly?: boolean }> = {
  straw: { name: "Straw Sunhat", price: 80, emoji: "👒" },
  bunny: { name: "Bunny Ears", price: 120, emoji: "🐰" },
  tophat: { name: "Top Hat", price: 200, emoji: "🎩" },
  crown: { name: "High Roller Crown", price: 400, emoji: "👑" },
  mochiears: { name: "Mochi Ears", price: 0, emoji: "🐱", gachaOnly: true },
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
// A player's look travels as one short string (encodeLook: skin, hair style, hair colour, outfit,
// accent, hat, top colour, bottom colour) so it is a single schema field and a single message.
// Every value is picked from a fixed palette or list, which is also how the server validates it.
// A look saved before the palettes and styles changed (six fields) is carried over to the nearest
// current values rather than thrown away.

/** Six warm skin tones, light to deep. */
export const SKIN_TONES = ["#ffe5d9", "#fcd5ce", "#e8b89a", "#c68e5e", "#a67c52", "#6f4e37"];
export const SKIN_TONE_NAMES = ["Porcelain", "Warm peach", "Honey tan", "Golden caramel", "Warm cocoa", "Deep chestnut"];
/** Eight cozy hair tones. */
export const HAIR_COLORS = ["#222222", "#4a3525", "#dda15e", "#c85a44", "#dda7a5", "#457b9d", "#d6d6d6", "#a390e4"];
export const HAIR_COLOR_NAMES = ["Soft black", "Chocolate", "Blonde", "Terracotta", "Rose", "Slate blue", "Silver", "Lavender"];

export const HAIR_STYLES = ["short", "bob", "curtain", "ponytail", "wavylong", "hero", "drill", "topknot", "spacebuns", "afro"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
/** The hair catalogue: five free starter styles, and the fancy ones sold in the wardrobe (price in coins). */
export const HAIR_DEFINITIONS: Record<HairStyle, { name: string; emoji: string; price: number }> = {
  short: { name: "Cozy Crop", emoji: "✂️", price: 0 },
  bob: { name: "Layered Bob", emoji: "💇", price: 0 },
  curtain: { name: "Curtain Shag", emoji: "🍃", price: 0 },
  ponytail: { name: "High Ponytail", emoji: "💁", price: 0 },
  wavylong: { name: "Soft Waves", emoji: "🌊", price: 0 },
  hero: { name: "Anime Hero", emoji: "⚡", price: 200 },
  drill: { name: "Twin Drills", emoji: "🎀", price: 180 },
  topknot: { name: "Samurai Topknot", emoji: "🎋", price: 150 },
  spacebuns: { name: "Space Buns", emoji: "🐼", price: 150 },
  afro: { name: "Cloud Afro", emoji: "☁️", price: 250 },
};
export const STARTER_HAIR: HairStyle[] = HAIR_STYLES.filter((s) => HAIR_DEFINITIONS[s].price === 0);
export function isHairStyle(v: unknown): v is HairStyle {
  return typeof v === "string" && v in HAIR_DEFINITIONS;
}
/** The unlock id a bought hair style is recorded under, in the same list as hats and outfits. */
export function hairUnlockId(style: HairStyle): string {
  return `hair_${style}`;
}
/** Retired style ids, and what they are worn as now (always a free one): a saved look naming one
 *  still loads, in the style that replaced it. */
const LEGACY_HAIR: Record<string, HairStyle> = { cap: "short", long: "wavylong", spiky: "curtain", bun: "short", buns: "short", messy: "curtain", wavy: "wavylong" };
/** A hair id from a saved look: a current style as it is, a retired one as the style that replaced it. */
function currentHair(id: string): HairStyle | undefined {
  return isHairStyle(id) ? id : LEGACY_HAIR[id];
}

/** Twelve vibrant pastels for an outfit's accent: its trims (a vest, lapels, an obi, piping). */
export const OUTFIT_COLORS = [
  "#ff9aa2", "#ffb7b2", "#ffdac1", "#fff3a8", "#c9f2a8", "#a8e6cf",
  "#9ee7e3", "#a8d8ea", "#b5b9ff", "#d5aaff", "#f4b6e0", "#ffd6a5",
];
export const OUTFIT_COLOR_NAMES = ["Coral", "Peach blush", "Apricot", "Lemon", "Lime", "Mint", "Aqua", "Sky", "Periwinkle", "Lilac", "Orchid", "Butterscotch"];
/** Twelve cozy earth and jewel tones for a top's fabric: every one reads as cloth against every skin tone. */
export const SHIRT_COLORS = ["#c85a44", "#b3403a", "#e9c46a", "#8aa67e", "#2a9d8f", "#6c8ebf", "#3d5a80", "#2b3a6b", "#7d4e6d", "#d98e8e", "#3a3a40", "#1d1b22"];
export const SHIRT_COLOR_NAMES = ["Terracotta", "Brick", "Mustard", "Sage", "Teal", "Cornflower", "Slate", "Indigo", "Plum", "Dusty rose", "Charcoal", "Midnight"];
/** Nine fabrics for trousers and shorts. */
export const PANTS_COLORS = ["#5a5a66", "#3f5f8a", "#2b3a6b", "#a08a60", "#6b4f3a", "#7a8b6f", "#f5ecd8", "#3a3a40", "#1d1b22"];
export const PANTS_COLOR_NAMES = ["Heather grey", "Denim", "Indigo", "Khaki", "Cocoa", "Olive", "Cream", "Charcoal", "Midnight"];
/** Each outfit's own fabrics: what its top and bottom are made of until the player recolours them. */
export const OUTFIT_FABRICS: Record<OutfitId, { shirt: string; pants: string }> = {
  outfit_starter_hoodie: { shirt: "#c85a44", pants: "#5a5a66" },
  outfit_starter_overalls: { shirt: "#e9c46a", pants: "#3f5f8a" },
  outfit_flannel_vest: { shirt: "#b3403a", pants: "#a08a60" },
  outfit_hawaiian: { shirt: "#2a9d8f", pants: "#f5ecd8" },
  outfit_tuxedo: { shirt: "#1d1b22", pants: "#1d1b22" },
  outfit_boxing: { shirt: "#c85a44", pants: "#f5ecd8" },
  outfit_yukata: { shirt: "#2b3a6b", pants: "#2b3a6b" },
  outfit_cyber: { shirt: "#1d1b22", pants: "#1d1b22" },
};
export const HATS: FreeAccessory[] = ACCESSORIES;
export function isHat(v: unknown): v is Accessory {
  return ACCESSORIES.includes(v as FreeAccessory) || isPremiumHat(v);
}

export interface Look {
  skin: string;
  hairStyle: HairStyle;
  hair: string;
  /** The whole outfit, and its accent colour (its trims: the vest, the lapels, the obi...). */
  outfit: OutfitId;
  outfitColor: string;
  hat: Accessory;
  /** The top's fabric and the bottom's (SHIRT_COLORS, PANTS_COLORS). */
  shirt: string;
  pants: string;
}
/** The look as it is stored in the database (the spec's column shape). */
export interface StoredLook {
  skinColor: string;
  hairStyle: HairStyle;
  hairColor: string;
  outfit: OutfitId;
  outfitColor: string;
  hat: Accessory;
  shirtColor: string;
  pantsColor: string;
}
export function toStoredLook(l: Look): StoredLook {
  return { skinColor: l.skin, hairStyle: l.hairStyle, hairColor: l.hair, outfit: l.outfit, outfitColor: l.outfitColor, hat: l.hat, shirtColor: l.shirt, pantsColor: l.pants };
}
export function fromStoredLook(s: Partial<StoredLook> | null | undefined): Look | null {
  if (!s || !s.skinColor) return null;
  const fields = [s.skinColor, s.hairStyle, s.hairColor, s.outfit, s.outfitColor, s.hat];
  if (s.shirtColor && s.pantsColor) fields.push(s.shirtColor, s.pantsColor);
  return parseLook(fields.map(String).join(","));
}

/** The colour in `palette` closest to any "#rrggbb". */
export function nearestColor(palette: readonly string[], hex: string): string {
  const lower = hex.toLowerCase();
  if (palette.includes(lower)) return lower;
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  const [r, g, b] = rgb(lower);
  let best = palette[0];
  let bestD = Infinity;
  for (const c of palette) {
    const [cr, cg, cb] = rgb(c);
    const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** The accent colour closest to any "#rrggbb" — so a colour handed in from outside the wardrobe
 *  (the server's join-time pastel) always encodes to a look that validates. */
export function nearestOutfitColor(hex: string): string {
  return nearestColor(OUTFIT_COLORS, hex);
}

/** The look someone has before they ever open the wardrobe — stable per user id, all free items. */
export function defaultLook(userId: string, accent = OUTFIT_COLORS[0]): Look {
  const h = hashString(userId);
  const outfit = STARTER_OUTFITS[(h >>> 12) % STARTER_OUTFITS.length];
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hairStyle: STARTER_HAIR[(h >>> 8) % STARTER_HAIR.length],
    hair: HAIR_COLORS[(h >>> 4) % HAIR_COLORS.length],
    outfit,
    outfitColor: nearestOutfitColor(accent),
    hat: accessoryFor(userId),
    ...OUTFIT_FABRICS[outfit],
  };
}

export function encodeLook(l: Look): string {
  return [l.skin, l.hairStyle, l.hair, l.outfit, l.outfitColor, l.hat, l.shirt, l.pants].join(",");
}

/** Parses and validates; returns null for anything that isn't made of palette values. A six-field
 *  look from before the current palettes is carried over instead (migrateLook). */
export function parseLook(raw: string | null | undefined): Look | null {
  if (!raw || raw.length > 128) return null;
  const fields = raw.split(",");
  if (fields.length === 6) return migrateLook(fields);
  if (fields.length !== 8) return null;
  const [skin, hairId, hair, outfit, outfitColor, hat, shirt, pants] = fields;
  const hairStyle = currentHair(hairId);
  if (!SKIN_TONES.includes(skin) || !hairStyle || !HAIR_COLORS.includes(hair)) return null;
  if (!isOutfitId(outfit) || !OUTFIT_COLORS.includes(outfitColor) || !isHat(hat)) return null;
  if (!SHIRT_COLORS.includes(shirt) || !PANTS_COLORS.includes(pants)) return null;
  return { skin, hairStyle, hair, outfit, outfitColor, hat, shirt, pants };
}

/** A look saved in the old six-field shape: its colours snap to the nearest current swatches, a
 *  retired hair style becomes the free style closest to it, and the top and bottom take the
 *  outfit's own fabrics. */
function migrateLook([skin, hairStyle, hair, outfit, outfitColor, hat]: string[]): Look | null {
  const hex = /^#[0-9a-f]{6}$/i;
  if (![skin, hair, outfitColor].every((c) => hex.test(c)) || !isOutfitId(outfit) || !isHat(hat)) return null;
  const style = currentHair(hairStyle);
  if (!style) return null;
  return { skin: nearestColor(SKIN_TONES, skin), hairStyle: style, hair: nearestColor(HAIR_COLORS, hair), outfit, outfitColor: nearestColor(OUTFIT_COLORS, outfitColor), hat, ...OUTFIT_FABRICS[outfit] };
}
export type Emote = (typeof EMOTES)[number];

/** Seat styles you lie down on rather than sit on. */
export function poseForSeat(style: SeatStyle): SitPose {
  return style === "blanket" ? "lie" : "sit";
}

/** Props you must walk up to before using; everything else (lights, TV, campfire) works from anywhere. */
export function isWalkUpProp(kind: ToggleableKind): boolean {
  return (
    kind === "espresso" ||
    kind === "arcade" ||
    kind === "slot" ||
    kind === "npc" ||
    kind === "forage" ||
    kind === "cat" ||
    kind === "sparkle" ||
    kind === "stew" ||
    kind === "gacha" ||
    kind === "claw" ||
    kind === "well" ||
    kind === "teahouse" ||
    kind === "blender" ||
    kind === "boardgame" ||
    kind === "jukebox" ||
    kind === "kitchen" ||
    kind === "radio" ||
    kind === "plant" ||
    kind === "bonfire" ||
    kind === "fishing"
  );
}

// --- world sizes ---
/** Half-width of each diorama slab. Indoor rooms keep their walls at ROOM_HALF; the slab beyond
 *  the open sides is the terrace / foyer that the bigger footprint adds. */
export const MAP_HALF: Record<MapId, number> = { cozy_lounge: 7.5, campfire_night: 8, sunset_beach: 14, velvet_casino: 13, boxing_ring: 12, japanese_onsen: 13, retro_arcade: 12, gaming_cafe: 12 };
/** Where the two back walls of an indoor room stand (x = -ROOM_HALF and z = -ROOM_HALF). */
export const ROOM_HALF = 10;
/** The casino's raised VIP lounge, behind the velvet rope. */
export const VIP_PLATFORM = { x0: -9.8, x1: -4.7, z0: 1.7, z1: 8.3, height: 0.18 };
/** The campfire's stargazing bluff: a knoll in the north-east corner of the valley. */
export const BLUFF = { x: 9.8, z: -9.6, radius: 2.6, height: 0.55 };

/** Persisted top balances, synced to every room. */
export interface LeaderboardEntry {
  username: string;
  coins: number;
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

// --- the Campfire: roasting, starlight fishing and the guitar ------------------------------------

/** What you can put on a skewer over the bonfire. */
export const ROAST_FOODS = ["mallow", "bbq"] as const;
export type RoastFood = (typeof ROAST_FOODS)[number];
export const ROAST_FOOD_INFO: Record<RoastFood, { name: string; emoji: string; note: string }> = {
  mallow: { name: "Sweet Marshmallow", emoji: "🍡", note: "gooey and golden" },
  bbq: { name: "Hearty BBQ Skewer", emoji: "🍢", note: "smoky, peppers and all" },
};
/** How it came off the fire: pulled too soon, just right (the green zone), or left too long. */
export type RoastQuality = "raw" | "golden" | "charred";
export function isRoastFood(v: unknown): v is RoastFood {
  return typeof v === "string" && (ROAST_FOODS as readonly string[]).includes(v);
}
/** A skewer's contents as synced on the player: "mallow:golden". */
export function encodeSnack(food: RoastFood, quality: RoastQuality): string {
  return `${food}:${quality}`;
}
export function parseSnack(snack: string): { food: RoastFood; quality: RoastQuality } | null {
  const [food, quality] = snack.split(":");
  if (!isRoastFood(food) || (quality !== "raw" && quality !== "golden" && quality !== "charred")) return null;
  return { food, quality };
}
/** A perfectly roasted skewer pays this. */
export const ROAST_GOLDEN_COINS = 5;
/** A skewer in hand is nibbled away over this long (bites every few seconds), then it is gone. */
export const SNACK_SECONDS = 45;

/** The roast, as the server sets it: the dial's needle sweeps once over `duration` seconds, and
 *  stopping it between zoneFrom and zoneTo (fractions of the sweep) is golden. Past the end, it burns. */
export interface RoastStart {
  duration: number;
  zoneFrom: number;
  zoneTo: number;
}
export interface RoastResult {
  sessionId: string;
  food: RoastFood;
  quality: RoastQuality;
  coins: number;
  /** A golden roast that paid nothing because today's campfire coins are spent. */
  capped: boolean;
}

/** What the pond gives up to a starlight fishing line, and what each is worth. */
export const STARLIGHT_CATCHES = {
  minnow: { name: "Chibi Minnow", emoji: "🐟", coins: 10, weight: 40 },
  trout: { name: "River Trout", emoji: "🐠", coins: 15, weight: 30 },
  starshell: { name: "Star Shell", emoji: "🐚", coins: 20, weight: 20 },
  bottle: { name: "Lucky Bottle", emoji: "🍾", coins: 25, weight: 10 },
} as const;
export type StarlightCatchId = keyof typeof STARLIGHT_CATCHES;
export interface FishCaught {
  sessionId: string;
  catchId: StarlightCatchId;
  coins: number;
  capped: boolean;
}
/** The bobber stays under this long after a bite: tap in time and it is yours. */
export const STARLIGHT_BITE_S = 1.0;
/** Seconds between casting (or a catch) and the next bite. */
export const STARLIGHT_BITE_DELAY_S = { min: 3, max: 6 };
/** Campfire coins a player can earn in a day (catches and golden roasts still happen past it, unpaid). */
export const CAMPFIRE_DAILY_COINS = { fish: 250, roast: 60 };

export type CampfirePacket = { type: "ROAST_START"; food: RoastFood } | { type: "ROAST_STOP" } | { type: "GUITAR"; playing: boolean };
