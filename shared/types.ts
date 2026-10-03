// Shared between client and server — keep this file framework-agnostic (no THREE/Colyseus imports).

import type { SlingShot } from "./slingshot";
import type { BaitId, CreelFish, FishId, FishTier, RodId } from "./fishing";
import type { FuelItem, StewIngredient } from "./bonfire";
import type { AxeId, ByproductId, FellVerdict, TreeKind, WoodKind } from "./chop";
import type { Adhesive, CraftId, CraftMode, CraftOutcome } from "./crafting";
import type { GearFamily, GearId } from "./gear";
import type { CaveTackleId } from "./caverns_fishing";
import type { SplitSwing, SplitVerdict } from "./splitting";
import { START_COINS, type WardrobeTier } from "./economy";

/** "dangle": sitting on an edge (the campfire's dock), legs hanging down and swinging.
 *  "cross": sitting cross-legged right on the ground (the Sit emote, away from any seat). */
export type SitPose = "sit" | "lie" | "dangle" | "cross";
/** "jar": a glass jar of fireflies caught at the campfire, glowing in the left hand. */
export type HeldItem = "" | "coffee" | "marshmallow" | "skewer" | "jar";
/** "reel" is the Stardew-style tension mini-game after a bite; "dizzy" is stunned in the ring. */
/** "rest": sitting at a fishing spot with the rod stowed and a warm mug, the creel full. */
/** "mine": at an ore node in the Glimmering Caverns, the pickaxe up; "soak": in its thermal terraces' warm pools; "winch": riding Gus's winch up out of the glimmer rift, "winchdown" down into it; "forge": working the forge's bellows and hammer; "chisel": cracking a geode at the anvil. */
export type PlayerAction = "" | "brew" | "roast" | "fish" | "afkfish" | "reel" | "dizzy" | "grill" | "guitar" | "stargaze" | "chop" | "rest" | "mine" | "soak" | "winch" | "winchdown" | "forge" | "chisel" | "raft";

export interface PlayerState {
  sessionId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  /** The world this player is in: everyone in a guild shares one room, and each walks their own
   *  way between its worlds (a player is drawn, collided with and heard only on their own map). */
  map: MapId;
  x: number;
  y: number; // height, mostly fixed for a flat diorama room
  z: number;
  dirX: number;
  dirZ: number;
  /** Where this angler's float sits on the Glimmering Caverns' cenote (cast from anywhere on its
   *  shore: shared/worlds/caverns.ts shoreCast), while they fish there. */
  floatX: number;
  floatZ: number;
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
  /** Velvet Chips: the casino's balance, bought and cashed out at Mr. Vance's cage. */
  chips: number;
  /** Holds the Black Card (shared/items.ts VIP_PASS): Bruno takes them up to the penthouse. */
  vipPass: boolean;
  /** Velvet VIP Wristbands held (shared/items.ts VIP_WRISTBAND): one ride up each. */
  vipWristbands: number;
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
  /** The Velvet Ring: the corner this player fights from while they are in the ring ("" outside it:
   *  a spectator), and the gloves they wear there (shared/boxing.ts GloveId). */
  corner: string;
  gloves: string;
  /** Their fighter's record (a BoxingProfile as JSON, shared/boxing.ts): wins, streak, the belt. */
  boxing: string;
  /** A temporary glow from a drink: a blended drink's colour, a casino drink ("casino:fizz",
   *  "casino:martini", "casino:espresso"), or "" for none. */
  aura: string;
  /** A title won from the casino's capsule machine, worn over the name ("" for none). */
  title: string;
  /** Today's cozy checklist (a DailyChecklist as JSON). */
  daily: string;
  /** The angler's creel, rods, baits and records (a FishingProfile as JSON, shared/fishing.ts). */
  fishing: string;
  /** Whole seconds left Well-Fed (0: not): a quicker, bouncier step and quicker bites. */
  fed: number;
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
  soak_onsen: { label: "Soak in a warm pool for 30 s", emoji: "♨️", goal: 1 },
  roast_marshmallow: { label: "Toast a marshmallow", emoji: "🍢", goal: 1 },
  spin_slots: { label: "Spin the slots 3 times", emoji: "🎰", goal: 3 },
  pull_gacha: { label: "Turn the gachapon", emoji: "🔮", goal: 1 },
  splash_water: { label: "Splash someone in a warm pool", emoji: "💦", goal: 1 },
  brew_coffee: { label: "Pull an espresso", emoji: "☕", goal: 1 },
  make_wish: { label: "Make a wish at the well", emoji: "🪙", goal: 1 },
};
export const DAILY_REWARD = 30;
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
export const VIBE_COINS = 5;
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

/** The most coins anyone can hold (Velvet Chips share the ceiling: shared/casino CHIP_CAP). */
export const COIN_CAP = 99_999;

/** The house tops you up when you are broke: once per cooldown, only while your net worth (coins
 *  and Velvet Chips together, shared/casino netWorth) is under this. */
export const ALLOWANCE_COINS = 50;
export const ALLOWANCE_BELOW = 10;
export const ALLOWANCE_COOLDOWN_S = 600;

/** Quick chat: short lines that float over your head as a speech bubble for everyone. */
export const CHAT_MAX_CHARS = 80;
export const CHAT_BUBBLE_SECONDS = 4;
export const QUICK_CHATS = ["hi! 👋", "brb", "gg!", "lol", "come sit here!", "let's go to the beach 🏖️", "who's up for roulette? 🎡", "love this song 🎶"];
/** The quick chats round the campfire. */
export const CAMPFIRE_QUICK_CHATS = ["Pass the marshmallows! 🍢", "Huge catch! 🐟", "Cozy night 🔥", "Look, a shooting star! 🌠", "Who's on guitar? 🎸", "Come sit by the fire!", "Fireflies! ✨", "goodnight 🌙"];
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

export type MapId = "cozy_lounge" | "campfire_night" | "sunset_beach" | "velvet_casino" | "casino_vip" | "boxing_ring" | "japanese_onsen" | "retro_arcade" | "gaming_cafe" | "whispering_woods" | "glimmering_caverns" | "open_sea" | "hidden_cove";
/**
 * Every world, in the fast-travel grid's order: two per row, a theme per row (cozy living,
 * vacation and spa, action and play, gaming and cyber); then the Velvet Penthouse (casino_vip), the
 * Whispering Woods and the Glimmering Caverns, never on the grid (HIDDEN_MAPS).
 */
export const MAP_IDS: MapId[] = ["cozy_lounge", "campfire_night", "sunset_beach", "japanese_onsen", "velvet_casino", "boxing_ring", "retro_arcade", "gaming_cafe", "casino_vip", "whispering_woods", "glimmering_caverns", "open_sea", "hidden_cove"];
/** Worlds reached only from another (never on the fast-travel grid): the Velvet Penthouse (Bruno's
 *  doors), the Whispering Woods (the campfire's branch archway, with a permit) and the Glimmering
 *  Caverns (the woods' old mine adit, once Old Flint has met you); and, registered for the beach
 *  (docs/beach-design.md: neither is built), the Open Sea and the Hidden Cove (the captain's boat). */
export const HIDDEN_MAPS: ReadonlySet<MapId> = new Set<MapId>(["casino_vip", "whispering_woods", "glimmering_caverns", "open_sea", "hidden_cove"]);
/** The Glimmering Caverns (under the Whispering Woods). */
export function isCavernsMap(map: string): boolean {
  return map === "glimmering_caverns";
}
/** The worlds with water to fish (the reel, the livewell, AFK): the camp's rivers and the caverns'
 *  cenote lake. */
export function isFishingMap(map: string): boolean {
  return isCampMap(map) || isCavernsMap(map) || isBeachMap(map);
}
/** The worlds where a line is cast from where you stand, the way you face (no fishing spots): the
 *  caverns' shores, Sunset Beach's pier and waterline, the boat's rails, the cove. */
export function isShoreCastMap(map: string): boolean {
  return isCavernsMap(map) || isBeachMap(map);
}
/** Sunset Beach and the two maps under it: the Open Sea and the Hidden Cove (docs/beach-design.md). */
export function isBeachMap(map: string): boolean {
  return map === "sunset_beach" || map === "open_sea" || map === "hidden_cove";
}
/** The campfire and the woods behind it: one 24-minute day between them (shared/daynight.ts). */
export function isCampMap(map: string): boolean {
  return map === "campfire_night" || map === "whispering_woods";
}
/** The worlds you gather in (the wood carrier's, the livewell's and the satchel's gauges show only
 *  there): the campfire and the woods behind it, the caverns under them, the beach and the two maps
 *  under it. */
export function isGatheringMap(map: string): boolean {
  return isCampMap(map) || isCavernsMap(map) || isBeachMap(map);
}
/** The casino's two floors: the hall and the penthouse (the High Rollers board shows on both). */
export function isCasinoMap(map: string): boolean {
  return map === "velvet_casino" || map === "casino_vip";
}
export function isMapId(v: unknown): v is MapId {
  return typeof v === "string" && (MAP_IDS as string[]).includes(v);
}

/** A name as shown over a head and in chat: the letters, combining marks and digits of every
 *  script (Thai's consonants, its vowels and tone marks: U+0E00-U+0E7F, stay whole), spaces,
 *  punctuation and symbols (emoji); control, zero-width and other invisible characters go, runs of
 *  spaces fold to one, and it is at most 32 characters (Discord's own limit). Nothing left: `fallback`. */
export function cleanDisplayName(raw: unknown, fallback = "Guest"): string {
  const name = String(raw ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}\p{Zs}\p{P}\p{S}฀-๿]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(name).slice(0, 32).join("") || fallback;
}

/** The room a join goes to: one per Discord guild, so everyone in a server (whatever voice channel
 *  they launched from) shares one instance and walks its worlds freely; a DM or a group DM, with no
 *  guild, gets one of its own. Sent as the join's `guildKey` (the server's matchmaking filter). */
export function guildRoomKey(guildId: string | null | undefined, channelId: string | null | undefined): string {
  const guild = String(guildId ?? "").trim();
  return guild ? `guild_${guild}` : `channel_${String(channelId ?? "").trim() || "local"}`;
}

/**
 * The lounges: LOUNGE_COUNT instances of the whole game shared by EVERY Discord server (Velvet
 * Lounge 01 is the same room whichever server you launch it from), each its own persistent room
 * (its own scene, fire, coin pushers and board game), picked on the lounge selector after the
 * splash. Each holds LOUNGE_CAPACITY players (the room's maxClients); a full one refuses the join.
 */
export const LOUNGE_COUNT = 3;
export const LOUNGE_CAPACITY = 15;
/** The join error a full lounge answers with (the client goes back to the selector). */
export const LOUNGE_FULL = "LOUNGE_FULL";
export const loungeName = (lounge: number) => `Velvet Lounge ${String(lounge).padStart(2, "0")}`;
export function isLounge(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= LOUNGE_COUNT;
}
/** The room key (the join's `guildKey`) of a lounge: global, the same from every Discord server. */
export function loungeRoomKey(lounge: number): string {
  return `lounge_${String(lounge).padStart(2, "0")}`;
}
/** Whether a join's key is one of the lounges' (nothing else ever makes a room). */
export function isLoungeRoomKey(key: unknown): key is string {
  return typeof key === "string" && /^lounge_\d{2}$/.test(key) && isLounge(Number(key.slice(7)));
}
/** POST /api/lounges: the guild's key and the Discord ids of the player's voice-channel friends. */
export interface LoungesRequest {
  guildKey: string;
  friends?: string[];
}
/** Each lounge's head count, and how many of those friends are in it. */
export interface LoungeInfo {
  lounge: number;
  name: string;
  players: number;
  capacity: number;
  friends: number;
}

/** The hour a world keeps whatever the lounge's clock says: the campfire is always a starlit night,
 *  and the casino's floors and the Velvet Ring's fight nights never see the sun. */
export const MAP_SIGNATURE_TIME: Partial<Record<MapId, TimeOfDay>> = { campfire_night: "night", velvet_casino: "night", casino_vip: "night", boxing_ring: "night", glimmering_caverns: "night" };

/** Shared lighting mood. Purely presentational, but synced so the room reads the same for everyone. */
export type TimeOfDay = "sunrise" | "day" | "sunset" | "night";
export const TIMES_OF_DAY: TimeOfDay[] = ["sunrise", "day", "sunset", "night"];
export function isTimeOfDay(v: unknown): v is TimeOfDay {
  return typeof v === "string" && (TIMES_OF_DAY as string[]).includes(v);
}

/**
 * The lounge's weather outside its windows, shared by the whole guild like its hour: clear skies, or
 * a soft rain (an overcast slate sky, streaks falling past the loft, drops running down the panes,
 * dim light through them and the rain's hush in the ambience). The campfire's night and the casino's
 * are always clear.
 */
export type Weather = "clear" | "rain";
export const WEATHERS: Weather[] = ["clear", "rain"];
export function isWeather(v: unknown): v is Weather {
  return v === "clear" || v === "rain";
}
/** With Auto Cycle on, each new hour may bring rain in (or clear it away): these chances. */
export const RAIN_START_CHANCE = 0.25;
export const RAIN_STOP_CHANCE = 0.5;

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
  | "bartender"
  | "barshift"
  | "captain"
  | "plant"
  | "bonfire"
  | "fishing"
  | "telescope"
  | "foraging"
  | "fireflies"
  | "critter"
  | "angler"
  | "lumberjack"
  | "workbench"
  | "boutique"
  | "archway"
  | "slingshot"
  | "splitblock"
  | "tree"
  | "ranger"
  | "animal"
  // the Glimmering Caverns (and the woods' way down): the old mine adit, Old Flint the Badger, Gus
  // the Mole's workstation, the Thermal Bellows Forge, the meteorite Geode Anvil, the ore nodes, the
  // winch lift between the coal breakdown and the glimmer rift, Finnegan the Grotto Angler ("angler",
  // as the woods' Finley)
  | "adit"
  | "miner"
  | "prospector"
  | "forge"
  | "anvil"
  | "ore"
  | "winch"
  | RingPropKind
  | CasinoPropKind;

/** The Velvet Ring's props (shared/worlds/boxing_ring.ts): the corner steps (step in as Red or
 *  Blue), the ringside chalkboard (the bets), Coach Bruno's pro shop, Jimmy the Slugger (a spar),
 *  the heavy bag, the speed bag and the balance-beam scale. */
export type RingPropKind = "ringcorner" | "chalkboard" | "coach" | "spar" | "heavybag" | "speedbag" | "scale";
const RING_PROP_KINDS: ReadonlySet<string> = new Set<RingPropKind>(["ringcorner", "chalkboard", "coach", "spar", "heavybag", "speedbag", "scale"]);
export function isRingProp(kind: string): kind is RingPropKind {
  return RING_PROP_KINDS.has(kind);
}

/** The Velvet Casino's props (shared/worlds/casino.ts): the slot row, Mr. Vance's cage, the exit
 *  doors, the game tables (walking up to one opens its panel: the wheel, blackjack, poker, baccarat,
 *  the Big Six, the dice, the Turf Club, the two coin pushers, the billiards, the pinball cabinets,
 *  the baby grand), Madame Zara, the capsule machine,
 *  the dealers' tip jars, Pippin's bar menu, The Velvet Gazette and the VIP room's doors. */
export type CasinoPropKind =
  | "slot"
  | "cashier"
  | "portal"
  | "roulette"
  | "blackjack"
  | "poker"
  | "baccarat"
  | "craps"
  | "derby"
  | "pusher"
  | "billiards"
  | "bigsix"
  | "pinball"
  | "piano"
  | "gazette"
  | "fortune"
  | "gachapon"
  | "tipjar"
  | "barmenu"
  | "vipdoor";

// How a seat draws itself. "pad" and "blanket" seats have no geometry of their own — the
// visible furniture is already drawn by the world (sofa cushions, beanbags, picnic blanket),
// so the seat contributes only a click target and a snap point.
export type SeatStyle = "gaming" | "log" | "pad" | "stool" | "armchair" | "wood" | "deckchair" | "blanket" | "onsen" | "bleacher" | "wingback" | "dock";

// Runtime (synced) state of an interactive prop — mirrors the server's ChairState/ToggleableState schema.
export interface ChairSyncState {
  propId: string;
  /** The world the seat is in (every built world's seats live in the one room). */
  map: MapId;
  x: number;
  z: number;
  rotationY: number;
  style: SeatStyle;
  sitY: number;
  occupiedBy: string; // sessionId, or "" if free
}

export interface ToggleableSyncState {
  propId: string;
  /** The world the prop is in. */
  map: MapId;
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
 * to make a move. (The Velvet Ring's punches, guards, dashes and hit reactions are not gestures:
 * they come with the bout's own events, client/src/systems/fightAnim.ts.)
 */
export const GESTURES = ["wave", "dance", "cheers", "nap", "heart", "water", "reach", "chop", "net", "toss", "belly", "trophy", "bag", "mine"] as const;
export type Gesture = (typeof GESTURES)[number];
export const GESTURE_SECONDS: Record<Gesture, number> = { wave: 1.2, dance: 5, cheers: 2.4, nap: 7, heart: 2.2, water: 1.8, reach: 0.8, chop: 0.7, net: 1.0, toss: 0.8, belly: 2.6, trophy: 2.4, bag: 2.4, mine: 0.55 };
export const GESTURE_EMOJI: Record<Gesture, string> = { wave: "👋", dance: "💃", cheers: "🥂", nap: "💤", heart: "❤️", water: "💧", reach: "♟️", chop: "🪓", net: "✨", toss: "🍪", belly: "😋", trophy: "🏆", bag: "🥊", mine: "⛏️" };
/** Gestures only the server starts (a client asking for one is ignored): "trophy" is the catch held
 *  high over the head for a new personal best (and a bout won); a flurry on the Velvet Ring's heavy
 *  bag ("bag") is the gym's; a pickaxe's blow on a rock ("mine") the caverns'. */
export const SERVER_GESTURES: ReadonlySet<Gesture> = new Set(["water", "reach", "chop", "net", "toss", "trophy", "bag", "mine"]);
export function isGesture(v: unknown): v is Gesture {
  return typeof v === "string" && (GESTURES as readonly string[]).includes(v);
}
export interface GestureBroadcast {
  sessionId: string;
  gesture: Gesture;
}

// --- economy ---
export const STARTING_COINS = START_COINS;
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

export type ItemId = "sardine" | "clownfish" | "octopus" | "goldray" | "berry" | "firefly" | "shell" | "seabass" | "starfish" | "trout" | "salmon" | "crayfish" | "plush" | "mushroom";
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
  mushroom: { emoji: "🍄", name: "Red Mushrooms", value: 6, buyer: "oak" },
};

// --- fishing: the Stardew-style reel mini-game ---
/** How long the tension game lasts before the fish wins by exhaustion. */
export const REEL_SECONDS = 22;
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

// (the Velvet Ring's rules: shared/boxing.ts)

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
  /** Each side's thinking time this game, in ms, as of this view (the running one keeps counting
   *  from when it arrived), and whose clock is running ("" while the game waits or is over). */
  clocks?: Record<BoardSide, number>;
  clockSide?: BoardSide | "";
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
export type PremiumHat =
  | "straw"
  | "bunny"
  | "tophat"
  | "crown"
  | "mochiears"
  | "cozybeanie"
  | "boonie"
  | "bearcap"
  | "headlamp"
  // the Velvet Boutique's collection (Chloe's, in the lounge)
  | "frogbeanie"
  | "catbeanie"
  | "painterberet"
  | "buckethat"
  | "deerstalker"
  | "goldglasses"
  // the Velvet Pioneer set (shared/items.ts): claimed, never sold
  | "pioneercap";

/** An outfit's cut: every outfit is built on one of five bespoke silhouettes (scripts/blender/
 *  build_avatar.py), none of them on another's base. */
export type OutfitArchetype = "formal" | "robe" | "streetwear" | "summer" | "workwear";
export const OUTFIT_ARCHETYPE_LABEL: Record<OutfitArchetype, string> = {
  formal: "Formal",
  robe: "Robe",
  streetwear: "Streetwear",
  summer: "Summer",
  workwear: "Workwear",
};

/** A wardrobe item's place in the shop: a price band (shared/economy.ts WARDROBE_BANDS), or not for
 *  sale at all (a starter piece, the gachapon's, the Pioneer set's). */
export interface WardrobeItem {
  name: string;
  emoji: string;
  price: number;
  tier?: WardrobeTier;
  gachaOnly?: boolean;
  /** One of the Velvet Pioneer set's (shared/items.ts): claimed free, never sold. */
  pioneer?: boolean;
  /** An outfit's cut (outfits only). */
  archetype?: OutfitArchetype;
  /** A map's own outfit: sold by that keeper at their counter (never at the boutique), and put on as
   *  it is bought. */
  keeper?: "bramble" | "gus";
}

// --- outfits: a whole look for the body, in one accent colour of your choosing ---
export type OutfitId =
  | "outfit_starter_hoodie"
  | "outfit_starter_overalls"
  | "outfit_flannel_vest"
  | "outfit_hawaiian"
  | "outfit_tuxedo"
  | "outfit_boxing"
  | "outfit_yukata"
  | "outfit_cyber"
  | "outfit_red_plaid"
  | "outfit_puffer_vest"
  | "outfit_wader_overalls"
  | "outfit_cable_sweater"
  | "outfit_garden_overalls"
  | "outfit_smoking_jacket"
  | "outfit_plaid_lounge"
  | "outfit_blueprint_overalls"
  | "outfit_swim_set"
  | "outfit_velvet_lounge"
  | "outfit_yukata_starry"
  | "outfit_pinstripe"
  | "outfit_forester"
  | "outfit_miner";
export const OUTFITS: Record<OutfitId, WardrobeItem> = {
  outfit_starter_hoodie: { name: "Cozy Hoodie & Sweats", emoji: "🧥", price: 0, archetype: "streetwear" },
  outfit_starter_overalls: { name: "Classic Denim Overalls", emoji: "👖", price: 0, archetype: "workwear" },
  // common
  outfit_garden_overalls: { name: "Denim Garden Overalls", emoji: "🌻", price: 2200, tier: "common", archetype: "workwear" },
  outfit_flannel_vest: { name: "Flannel Camp Vest", emoji: "🪵", price: 2000, tier: "common", archetype: "streetwear" },
  outfit_red_plaid: { name: "Lumberjack Suspenders", emoji: "🟥", price: 2400, tier: "common", archetype: "workwear" },
  // rare
  outfit_hawaiian: { name: "Hawaiian Floral Set", emoji: "🌺", price: 4800, tier: "rare", archetype: "summer" },
  outfit_swim_set: { name: "Beach Swim Set", emoji: "🩳", price: 4950, tier: "rare", archetype: "summer" },
  outfit_boxing: { name: "Boxing Robe & Shorts", emoji: "🥊", price: 5050, tier: "rare", archetype: "robe" },
  outfit_puffer_vest: { name: "Mustard Down Vest", emoji: "🟨", price: 5050, tier: "rare", archetype: "streetwear" },
  outfit_plaid_lounge: { name: "Plaid Loungewear", emoji: "🛌", price: 5350, tier: "rare", archetype: "streetwear" },
  outfit_wader_overalls: { name: "River Wader Dungarees", emoji: "🥾", price: 5450, tier: "rare", archetype: "workwear" },
  outfit_cable_sweater: { name: "Oversized Cable-Knit Sweater", emoji: "🧶", price: 5750, tier: "rare", archetype: "streetwear" },
  outfit_velvet_lounge: { name: "Velvet Loungewear", emoji: "🍇", price: 6000, tier: "rare", archetype: "robe" },
  // prestige
  outfit_yukata: { name: "Indigo Bath Yukata", emoji: "👘", price: 7000, tier: "prestige", archetype: "robe" },
  outfit_tuxedo: { name: "Velvet Evening Tuxedo", emoji: "🎩", price: 7300, tier: "prestige", archetype: "formal" },
  outfit_smoking_jacket: { name: "Vintage Smoking Jacket", emoji: "🍷", price: 7500, tier: "prestige", archetype: "formal" },
  outfit_yukata_starry: { name: "Starry Night Yukata", emoji: "🌌", price: 7750, tier: "prestige", archetype: "robe" },
  outfit_pinstripe: { name: "High Roller Pinstripe", emoji: "💼", price: 8000, tier: "prestige", archetype: "formal" },
  // the maps' own: sold by their keepers, in the Whispering Woods and the Glimmering Caverns
  outfit_forester: { name: "Woodsman's Vest & Work Trousers", emoji: "🌲", price: 4800, tier: "rare", archetype: "workwear", keeper: "bramble" },
  outfit_miner: { name: "Prospector's Canvas Overalls", emoji: "⛏️", price: 5200, tier: "rare", archetype: "workwear", keeper: "gus" },
  // never sold
  outfit_cyber: { name: "Retro Cyber Jumpsuit", emoji: "🕹️", price: 0, gachaOnly: true, archetype: "streetwear" },
  outfit_blueprint_overalls: { name: "Blueprint Overalls", emoji: "📐", price: 0, pioneer: true, archetype: "workwear" },
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
export const PREMIUM_HATS: Record<PremiumHat, WardrobeItem> = {
  // common
  cozybeanie: { name: "Cozy Knit Beanie", price: 800, emoji: "🧡", tier: "common" },
  headlamp: { name: "Spelunker Headlamp", price: 850, emoji: "🔦", tier: "common" },
  straw: { name: "Straw Sunhat", price: 850, emoji: "👒", tier: "common" },
  frogbeanie: { name: "Frog Knit Beanie", price: 850, emoji: "🐸", tier: "common" },
  catbeanie: { name: "Cat Knit Beanie", price: 850, emoji: "🐈", tier: "common" },
  painterberet: { name: "Painter's Beret", price: 900, emoji: "🎨", tier: "common" },
  // rare
  buckethat: { name: "Fisherman Bucket Hat", price: 1800, emoji: "🪣", tier: "rare" },
  boonie: { name: "Angler Boonie Hat", price: 1900, emoji: "🎣", tier: "rare" },
  bunny: { name: "Bunny Ears", price: 2100, emoji: "🐰", tier: "rare" },
  deerstalker: { name: "Deerstalker Cap", price: 2400, emoji: "🔍", tier: "rare" },
  bearcap: { name: "Fleece Bear Cap", price: 2600, emoji: "🐻", tier: "rare" },
  goldglasses: { name: "Gold Wire-Frame Glasses", price: 3200, emoji: "👓", tier: "rare" },
  // prestige
  tophat: { name: "Top Hat", price: 4000, emoji: "🎩", tier: "prestige" },
  crown: { name: "Gilded Crown", price: 6350, emoji: "👑", tier: "prestige" },
  // never sold
  mochiears: { name: "Mochi Ears", price: 0, emoji: "🐱", gachaOnly: true },
  pioneercap: { name: "Pioneer Cap", price: 0, emoji: "⚙️", pioneer: true },
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
export const HAIR_DEFINITIONS: Record<HairStyle, WardrobeItem> = {
  short: { name: "Cozy Crop", emoji: "✂️", price: 0 },
  bob: { name: "Layered Bob", emoji: "💇", price: 0 },
  curtain: { name: "Curtain Shag", emoji: "🍃", price: 0 },
  ponytail: { name: "High Ponytail", emoji: "💁", price: 0 },
  wavylong: { name: "Soft Waves", emoji: "🌊", price: 0 },
  hero: { name: "Anime Hero", emoji: "⚡", price: 2400, tier: "rare" },
  drill: { name: "Twin Drills", emoji: "🎀", price: 2000, tier: "rare" },
  topknot: { name: "Samurai Topknot", emoji: "🎋", price: 2800, tier: "rare" },
  spacebuns: { name: "Festival Space Buns", emoji: "🐼", price: 1800, tier: "rare" },
  afro: { name: "Cloud Afro", emoji: "☁️", price: 2600, tier: "rare" },
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
/** Ten fabrics for trousers and shorts. */
export const PANTS_COLORS = ["#5a5a66", "#3f5f8a", "#2b3a6b", "#a08a60", "#6b4f3a", "#7a8b6f", "#f5ecd8", "#3a3a40", "#1d1b22", "#3f5b3a"];
export const PANTS_COLOR_NAMES = ["Heather grey", "Denim", "Indigo", "Khaki", "Cocoa", "Olive", "Cream", "Charcoal", "Midnight", "Forest"];
/** Each outfit's own fabrics: what its top and bottom are made of until the player recolours them. */
export const OUTFIT_FABRICS: Record<OutfitId, { shirt: string; pants: string }> = {
  outfit_starter_hoodie: { shirt: "#c85a44", pants: "#5a5a66" },
  outfit_starter_overalls: { shirt: "#e9c46a", pants: "#3f5f8a" },
  outfit_flannel_vest: { shirt: "#b3403a", pants: "#a08a60" },
  outfit_hawaiian: { shirt: "#2a9d8f", pants: "#a08a60" },
  outfit_tuxedo: { shirt: "#1d1b22", pants: "#1d1b22" },
  outfit_boxing: { shirt: "#b3403a", pants: "#1d1b22" },
  outfit_yukata: { shirt: "#2b3a6b", pants: "#2b3a6b" },
  outfit_cyber: { shirt: "#1d1b22", pants: "#1d1b22" },
  outfit_red_plaid: { shirt: "#b3403a", pants: "#3f5f8a" },
  outfit_puffer_vest: { shirt: "#3d5a80", pants: "#6b4f3a" },
  outfit_wader_overalls: { shirt: "#e9c46a", pants: "#3f5b3a" },
  outfit_cable_sweater: { shirt: "#d98e8e", pants: "#6b4f3a" },
  outfit_garden_overalls: { shirt: "#8aa67e", pants: "#3f5f8a" },
  outfit_smoking_jacket: { shirt: "#7d4e6d", pants: "#1d1b22" },
  outfit_plaid_lounge: { shirt: "#3d5a80", pants: "#2b3a6b" },
  outfit_blueprint_overalls: { shirt: "#6c8ebf", pants: "#3f5f8a" },
  outfit_swim_set: { shirt: "#6c8ebf", pants: "#2b3a6b" },
  outfit_velvet_lounge: { shirt: "#7d4e6d", pants: "#f5ecd8" },
  outfit_yukata_starry: { shirt: "#1d1b22", pants: "#1d1b22" },
  outfit_pinstripe: { shirt: "#2b3a6b", pants: "#2b3a6b" },
  outfit_forester: { shirt: "#8aa67e", pants: "#6b4f3a" },
  outfit_miner: { shirt: "#3a3a40", pants: "#a08a60" },
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
  return style === "blanket" ? "lie" : style === "dock" ? "dangle" : "sit";
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
    kind === "bartender" ||
    kind === "captain" ||
    kind === "barshift" ||
    kind === "boardgame" ||
    kind === "jukebox" ||
    kind === "kitchen" ||
    kind === "radio" ||
    kind === "plant" ||
    kind === "bonfire" ||
    kind === "fishing" ||
    kind === "telescope" ||
    kind === "foraging" ||
    kind === "fireflies" ||
    kind === "critter" ||
    kind === "angler" ||
    kind === "lumberjack" ||
    kind === "workbench" ||
    kind === "boutique" ||
    kind === "archway" ||
    kind === "slingshot" ||
    kind === "splitblock" ||
    kind === "tree" ||
    kind === "ranger" ||
    kind === "animal" ||
    kind === "adit" ||
    kind === "miner" ||
    kind === "prospector" ||
    kind === "forge" ||
    kind === "anvil" ||
    kind === "ore" ||
    kind === "winch" ||
    isRingProp(kind) ||
    isCasinoProp(kind)
  );
}

const CASINO_PROP_KINDS: ReadonlySet<string> = new Set<CasinoPropKind>(["slot", "cashier", "portal", "roulette", "blackjack", "poker", "baccarat", "craps", "derby", "pusher", "billiards", "bigsix", "pinball", "piano", "gazette", "fortune", "gachapon", "tipjar", "barmenu", "vipdoor"]);
/** The casino's props: every one is walked up to. */
export function isCasinoProp(kind: string): kind is CasinoPropKind {
  return CASINO_PROP_KINDS.has(kind);
}

/** Props you can use without getting up from a seat within their reach (the server measures it):
 *  the baby grand from its bench, Pippin's menu from a bar stool, a tip from the poker table, The
 *  Velvet Gazette from the Chesterfield, and a blackjack, poker or baccarat table from one of its
 *  seats. */
export function usableSeated(kind: ToggleableKind): boolean {
  return kind === "bartender" || kind === "piano" || kind === "barmenu" || kind === "tipjar" || kind === "gazette" || kind === "blackjack" || kind === "poker" || kind === "baccarat";
}

// --- world sizes ---
/** Half-width of each diorama slab. */
export const MAP_HALF: Record<MapId, number> = { cozy_lounge: 6.4, campfire_night: 14, sunset_beach: 18, velvet_casino: 10, casino_vip: 5, whispering_woods: 17, boxing_ring: 10, japanese_onsen: 13, retro_arcade: 12, gaming_cafe: 12, glimmering_caverns: 22.5, open_sea: 7, hidden_cove: 12 };
/** The campfire's stargazing bluff: a knoll in the north-east corner of the valley. */
export const BLUFF = { x: 9.8, z: -9.6, radius: 2.6, height: 0.55 };

/** Test and bot accounts: never saved to the database and never shown on the High Rollers board. */
export function isBlacklisted(username: string): boolean {
  return /^tester\d{1,4}$/i.test(username) || /^verifybot/i.test(username);
}

/** Persisted top balances, synced to every room. */
export interface LeaderboardEntry {
  username: string;
  coins: number;
  chips: number;
  /** coins + chips (shared/casino netWorth): what the board is ranked by. */
  worth: number;
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

/** How a fish swims in the reel: a slow sine wave; rhythmic plunges to the bottom; erratic jerks and
 *  sudden turns; or the Star-Koi's fast darting. */
export type SwimPattern = "sine" | "plunge" | "erratic" | "koi";
/** A hooked fish at the campfire: the reel mini-game starts (FishingModal) for this fish (the
 *  server rolled its kind, length and stars; shared/fishing.ts FISH says how it fights), with the
 *  angler's rod, and a Sunken Treasure Chest may turn up in the column (`treasure`). */
/** Server -> the angler ("starlightReel"): a fish is on the line. How it swims, and how big its
 *  shadow is, but never what it is: the species (its name, its look, its rarity) is told only once
 *  it is landed (fishCaught). */
export interface StarlightReel {
  swim: { speed: number; size: number; pattern: SwimPattern; barScale: number };
  /** Its shadow's size in the water (0 a sliver of a fish, 1 a monster). */
  shadow: number;
  rod: RodId;
  treasure: boolean;
  /** How long the fish can run out of the green before the line's tension climbs (s: the rod's
   *  window, and on a boss the Otter-Carved Hook Charm's half second). */
  window: number;
  /** On a boss: its fake runs telegraphed this much earlier (s: the Angler's whole set). */
  tele?: number;
  /** The line's grip: tension builds this much slower (the rod's, the Braided Silk Line's). */
  resist?: number;
  /** A boss fish (a legendary or a mythic: its rarity, never its kind): a smaller green, fake runs
   *  (each telegraphed 0.3 s ahead) and thrashing; and the rod's passive against it (RodPerk): its
   *  darts slower (`dart`), its fake runs rarer (`feints`), snaps forgiven (`shields`). */
  boss?: boolean;
  dart?: number;
  feints?: number;
  shields?: number;
  /** The rod's passive by name, for the reel's corner. */
  perk?: string;
}
/** A Sunken Treasure Chest held in the green bar until it opens pays this. */
export const TREASURE_COINS = 25;
/** How likely a chest is on a reel, by how rare the fish is. */
export const TREASURE_CHANCE: Record<FishTier, number> = { common: 0.08, uncommon: 0.12, rare: 0.2, legendary: 0.45, mythic: 0.75 };
/** The shortest a real reel can take (the catch meter fills no faster): a quicker "caught" is not believed. */
export const STARLIGHT_REEL_MIN_S = 2.0;
/** A fish landed at the campfire: into the creel (Barnaby buys them), or, the creel full, let go
 *  for CREEL_RELEASE_COINS. `record`: the angler's longest of its kind yet. */
export interface FishCaught {
  sessionId: string;
  fish: CreelFish;
  released: boolean;
  record: boolean;
  /** Coins paid now: a release, a Sunken Treasure Chest. */
  coins: number;
  /** Coins from a Sunken Treasure Chest opened in the reel (0: none). */
  treasure: number;
  afk: boolean;
  /** It shed a Fish Scale into the pouches; a Fine Fish Bone (a rare or better), a Prismatic Scale
   *  (a legendary or a mythic). */
  scale?: true;
  bone?: true;
  prism?: true;
}
/** The bobber stays under this long after a bite: tap in time and it is yours. */
export const STARLIGHT_BITE_S = 1.0;
/** Campfire coins a player can earn in a day, by activity (it all still happens past a cap, unpaid). */
export const CAMPFIRE_DAILY_COINS = { fish: 250, roast: 60, star: 150, chop: 80, forage: 60, slingshot: 300 };
export type CampfireCoinKind = keyof typeof CAMPFIRE_DAILY_COINS;

// --- the Campfire's telescope, chopping block and foraging ----------------------------------------

/** A shooting star caught in the telescope pays this, times the combo multiplier. */
export const STAR_SPARK_COINS = 5;
/** Catching shooting stars one after another without letting one go: x1, x2, x3, then x5. */
export const STAR_COMBO_MULTIPLIERS = [1, 2, 3, 5];
export function starComboMultiplier(combo: number): number {
  return STAR_COMBO_MULTIPLIERS[Math.max(0, Math.min(STAR_COMBO_MULTIPLIERS.length - 1, combo - 1))];
}
/** A shooting star, as the server sends one to a stargazer: `delay` seconds after the shower
 *  arrives it crosses the lens from (x0, y0) to (x1, y1) (fractions of the lens) over `duration`
 *  seconds; tap it on the way to catch it. */
export interface ShootingStar {
  id: number;
  delay: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  duration: number;
}
/** A meteor shower: a few shooting stars, at their own speeds and angles. */
export interface MeteorShower {
  stars: ShootingStar[];
}
export interface StarCaught {
  sessionId: string;
  coins: number;
  capped: boolean;
  /** The catch's place in the chain (1: a fresh start) and the multiplier it earned. */
  combo: number;
  multiplier: number;
}
/** A constellation traced in the telescope pays this (once per look through it). */
export const CONSTELLATION_COINS = 30;
/** Tracing one faster than this is not believed. */
export const CONSTELLATION_MIN_S = 3;
/** The constellations to trace: their stars in order (fractions of the lens), then the picture
 *  they make once joined (polylines, the same space). */
export const CONSTELLATIONS = [
  {
    id: "ursa_chibi",
    name: "Ursa Chibi",
    emoji: "🐻",
    stars: [[0.3, 0.42], [0.38, 0.3], [0.5, 0.26], [0.62, 0.3], [0.7, 0.42], [0.64, 0.56], [0.5, 0.62], [0.36, 0.56]],
    art: [
      [[0.34, 0.36], [0.3, 0.26], [0.38, 0.22], [0.43, 0.29]],
      [[0.57, 0.29], [0.62, 0.22], [0.7, 0.26], [0.66, 0.36]],
      [[0.44, 0.44], [0.45, 0.45]],
      [[0.55, 0.44], [0.56, 0.45]],
      [[0.47, 0.52], [0.5, 0.55], [0.53, 0.52]],
    ],
  },
  {
    id: "starlight_cat",
    name: "Starlight Cat",
    emoji: "🐱",
    stars: [[0.3, 0.62], [0.32, 0.36], [0.4, 0.46], [0.5, 0.42], [0.6, 0.46], [0.68, 0.36], [0.7, 0.62], [0.5, 0.7]],
    art: [
      [[0.43, 0.54], [0.44, 0.55]],
      [[0.56, 0.54], [0.57, 0.55]],
      [[0.48, 0.6], [0.5, 0.62], [0.52, 0.6]],
      [[0.36, 0.6], [0.22, 0.57]],
      [[0.36, 0.63], [0.22, 0.66]],
      [[0.64, 0.6], [0.78, 0.57]],
      [[0.64, 0.63], [0.78, 0.66]],
    ],
  },
  {
    id: "celestial_fox",
    name: "Celestial Fox",
    emoji: "🦊",
    stars: [[0.32, 0.26], [0.41, 0.4], [0.59, 0.4], [0.68, 0.26], [0.66, 0.52], [0.5, 0.72], [0.34, 0.52]],
    art: [
      [[0.43, 0.51], [0.46, 0.49]],
      [[0.54, 0.49], [0.57, 0.51]],
      [[0.48, 0.64], [0.52, 0.64]],
      [[0.7, 0.62], [0.8, 0.58], [0.85, 0.46], [0.8, 0.37]],
    ],
  },
  {
    id: "cosmic_koi",
    name: "Cosmic Koi",
    emoji: "🎏",
    stars: [[0.24, 0.5], [0.36, 0.37], [0.52, 0.35], [0.68, 0.47], [0.8, 0.34], [0.8, 0.62], [0.52, 0.63], [0.34, 0.6]],
    art: [
      [[0.3, 0.47], [0.31, 0.47]],
      [[0.45, 0.63], [0.48, 0.71], [0.54, 0.64]],
      [[0.25, 0.53], [0.17, 0.59]],
      [[0.42, 0.44], [0.46, 0.49], [0.42, 0.55]],
      [[0.52, 0.44], [0.56, 0.49], [0.52, 0.55]],
    ],
  },
  {
    id: "moon_bunny",
    name: "Moon Bunny",
    emoji: "🐰",
    stars: [[0.4, 0.14], [0.45, 0.38], [0.55, 0.38], [0.62, 0.16], [0.64, 0.5], [0.5, 0.66], [0.36, 0.5]],
    art: [
      [[0.44, 0.5], [0.45, 0.5]],
      [[0.55, 0.5], [0.56, 0.5]],
      [[0.48, 0.57], [0.5, 0.59], [0.52, 0.57]],
      [[0.76, 0.6], [0.82, 0.68], [0.8, 0.79], [0.71, 0.83]],
    ],
  },
  {
    id: "cozy_teapot",
    name: "Cozy Teapot",
    emoji: "🫖",
    stars: [[0.2, 0.4], [0.35, 0.52], [0.38, 0.72], [0.62, 0.72], [0.7, 0.62], [0.8, 0.5], [0.68, 0.42], [0.5, 0.34]],
    art: [
      [[0.47, 0.3], [0.5, 0.27], [0.53, 0.3]],
      [[0.22, 0.33], [0.19, 0.26], [0.23, 0.19]],
      [[0.44, 0.55], [0.5, 0.6], [0.56, 0.55]],
    ],
  },
] as const;
export type ConstellationId = (typeof CONSTELLATIONS)[number]["id"];
export interface ConstellationDone {
  sessionId: string;
  id: ConstellationId;
  coins: number;
  capped: boolean;
}
/** A tree felled (its last round landed): these coins (by tier, before the day's cap). */
export const FELL_COINS = [0, 3, 4, 5, 6, 8] as const;
/** What a round that lands drops: a log (its wood, worth its tree's size squared) or the tier's
 *  by-product (resin, sawdust or a Firewood bundle), or nothing (the carrier full). */
export interface FellDrop {
  kind: "log" | "byproduct" | "none";
  name: string;
  emoji: string;
  wood?: WoodKind;
  /** A log's value multiplier (1.8 for a 1.35x tree, 3 for a Titan's). */
  mult?: number;
  count: number;
  /** A by-product that came off with the log (the Amber Resin Band). */
  also?: { name: string; emoji: string };
  /** No by-product this round: the pouches are full (their room grows with the carrier). */
  pouchesFull?: boolean;
}
/** Server -> the feller ("fellResult"): a swing, as it landed, and what came of it. */
export interface FellResult {
  sessionId: string;
  tree: string;
  kind: TreeKind;
  verdict: FellVerdict;
  /** The rounds landed on the tree now, and the rounds it takes. */
  dmg: number;
  rounds: number;
  drop: FellDrop;
  /** A gold swing's bonus (a coin or two, or a Pine Resin), and the coins for felling it. */
  bonus: "" | "coins" | "resin";
  coins: number;
  /** The last round landed: down it comes. */
  felled: boolean;
  /** The day's felling coins are all earned. */
  capped: boolean;
  /** A miss the Titan-Grip Gauntlets turned into a deeper notch (nothing dropped). */
  grip?: true;
  /** A Colossal's haul when it came down: this feller's share (by the rounds they landed), and how
   *  many shared it. */
  share?: ColossalShare;
}
/** A feller's share of a Colossal tree's haul (its logs, and its rare by-products or Pine Resin). */
export interface ColossalShare {
  kind: TreeKind;
  name: string;
  logs: number;
  wood: WoodKind;
  mult: number;
  extra: { name: string; emoji: string; n: number }[];
  crew: number;
  /** The logs the carrier had no room for (the soft clamp: the share is what it is). */
  lost: number;
}
/** Server -> the tree's world ("treeFelled"): a tree came down (the client plays its fall, then
 *  shows its stump). */
export interface TreeFelled {
  sessionId: string;
  tree: string;
  kind: TreeKind;
  scale: number;
}

// --- the living wonders: one world event at a time, in the room's state for everyone (late joiners
// too) ---
/** A King-Size Fish Surge: golden ripples and bubbles on a stretch of water; a hand-reeled catch
 *  whose float lands in them is King Size four times in ten. The Colossal Titan: a 2x tree in the
 *  woods, 5-6 rounds (a Golden Leaf Amber each), 4-6 heavy logs worth 3x each; the two take turns. */
export type WorldEvent =
  | { kind: "surge"; map: MapId; x: number; z: number; r: number; until: number }
  | { kind: "titan"; map: MapId; id: string; x: number; z: number; until: number; tree?: TreeKind };
/* (a Colossal's `until` is 0: it stands until it is felled; `tree` its kind, the Autumn Maple when
 * missing: a save from before the Colossal kinds) */
/** The wait between one wonder and the next (minutes), and how long a surge lasts (s). */
export const WORLD_EVENT_EVERY_MIN = [45, 60] as const;
export const SURGE_S = 240;
export const SURGE_KING_CHANCE = 0.4;
export function parseWorldEvent(raw: string): WorldEvent | null {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v && (v.kind === "surge" || v.kind === "titan") ? (v as WorldEvent) : null;
  } catch {
    return null;
  }
}
/** Server -> the player ("splitResult"): a word from the chopping block (a refusal, the block let
 *  go, or Bulk Process All's whole stack split at once). */
export interface SplitResult {
  ok: boolean;
  message: string;
  firewood: number;
}
/** Server -> the splitter ("splitSwing"): the next swing's gauge (shared/splitting.ts), its clock
 *  starting `pause` s from now, and the wood on the block. */
export interface SplitSwingPacket extends SplitSwing {
  pause: number;
  wood: WoodKind;
}
/** Server -> the splitter ("splitStrike"): how a strike landed. A gold one split a batch of logs and
 *  a bonus bundle; a hit two logs; a miss glanced off. `left`: logs still in the carrier. */
export interface SplitStrike {
  verdict: SplitVerdict;
  wood: WoodKind;
  logs: number;
  bundles: number;
  bonus: number;
  firewood: number;
  left: number;
  streak: number;
}
/** Picking a patch of mushrooms or a bush of night berries pays this; it grows back after FORAGE_REGROW_CAMP_S. */
export const FORAGE_COINS = 5;
export const FORAGE_REGROW_CAMP_S = 180;
export type ForageKind = "mushroom" | "berries";
export const FORAGE_INFO: Record<ForageKind, { name: string; emoji: string }> = {
  mushroom: { name: "Spotted Red Mushrooms", emoji: "🍄" },
  berries: { name: "Glowing Night Berries", emoji: "🫐" },
};
export interface ForageResult {
  sessionId: string;
  kind: ForageKind;
  coins: number;
  capped: boolean;
}

export type CampfirePacket =
  | { type: "ROAST_START"; food: RoastFood }
  | { type: "ROAST_STOP" }
  | { type: "GUITAR"; playing: boolean }
  | { type: "STARGAZE"; on: boolean }
  | { type: "STAR_CATCH"; id: number }
  | { type: "CONSTELLATION"; id: ConstellationId }
  /** Up to a tree (its node id) to fell it: answered with its swing's ring (fellSwing). */
  | { type: "CHOP_START"; tree: string }
  /** Up to the chopping block (with a wood to put on it first): answered with its gauge (splitSwing). */
  | { type: "SPLIT_START"; wood?: WoodKind }
  /** A strike, `t` seconds into the gauge as the splitter saw it (sampled at the press). */
  | { type: "SPLIT_STRIKE"; t?: number }
  /** Stepping back from the block (the panel closed). */
  | { type: "SPLIT_STOP" }
  /** Bulk Process All: a stack of more than BULK_MIN_LOGS logs split at once, at the plain yield. */
  | { type: "SPLIT_WOOD" }
  /** A consumable from the craft stash, used (anywhere): its buff (shared/crafting.ts BUFFS). */
  | { type: "USE_CONSUMABLE"; craft: CraftId }
  /** A drawer's own consumable made (anywhere the drawer opens): Feller's Pine Pitch, Phosphor Glow
   *  Bait, Miner's Stout, into the craft stash. */
  | { type: "DRAWER_CRAFT"; craft: CraftId }
  /** The swing, `t` seconds into the ring as the swinger saw it (sampled at the press). */
  | { type: "CHOP_STOP"; t?: number }
  /** Stepping back from the tree (the panel closed): its notch stays for whoever comes next. */
  | { type: "CHOP_CANCEL" }
  | { type: "REEL_DONE"; caught: boolean; treasure: boolean }
  /** A split log (or Golden Charcoal) onto the bonfire. */
  | { type: "ADD_FUEL"; item: FuelItem }
  /** Forest Whisper Incense from the crate onto the bonfire: rare-fish luck for the whole room. */
  | { type: "BURN_INCENSE" }
  /** An ingredient into the Dutch oven: a fish from the creel (by its slot), mushrooms or berries. */
  | { type: "STEW_ADD"; ingredient: StewIngredient; slot?: number }
  | { type: "STEW_SCOOP" }
  /** The skewer in hand onto the picnic table, or one off it. */
  | { type: "PICNIC_PLACE" }
  | { type: "PICNIC_TAKE"; plate: number }
  /** Feet up, line in: fish into the creel every AFK_CATCH_S (shared/fishing.ts). */
  | { type: "AFK"; on: boolean }
  /** Barnaby's shop (and equipping what you have: any time). */
  | { type: "BARNABY"; op: "sell"; slot: number | "all" }
  | { type: "BARNABY"; op: "buyRod" | "equipRod"; rod: RodId }
  | { type: "BARNABY"; op: "buyBait"; bait: BaitId }
  | { type: "BARNABY"; op: "equipBait"; bait: BaitId | "" }
  | { type: "BARNABY"; op: "upgradeCreel" }
  /** A fish locked as a favourite or let go again (its slot, and its kind to be sure it is the one
   *  meant). */
  | { type: "BARNABY"; op: "lockFish"; slot: number; fish: FishId; locked: boolean }
  /** Finnegan the Grotto Angler's advanced tackle (coins and a barter of makings: at his crate). */
  | { type: "BARNABY"; op: "buyCaveTackle"; tackle: CaveTackleId }
  /** The gear (shared/gear.ts): a piece you own put on or taken off, or a family's whole set put on
   *  (anywhere); a piece bought at rank 1, or raised a rank, where that work is done. */
  | { type: "GEAR"; op: "equip" | "unequip" | "buy" | "raise"; gear: GearId }
  | { type: "GEAR"; op: "set"; family: GearFamily }
  /** A ring you own put on a finger, or taken off (anywhere). */
  | { type: "GEAR"; op: "ring" | "ringOff"; ring: string }
  /** Buster the Lumberjack's stall: sell split wood (one, or all of a kind), buy or switch axes. */
  | { type: "BUSTER"; op: "sell"; wood: WoodKind; count: number | "all" }
  | { type: "BUSTER"; op: "buyAxe" | "equipAxe"; axe: AxeId }
  | { type: "BUSTER"; op: "upgradeCarrier" }
  /** Sell Buster your carved pieces (one, or all), or your Pine Resin; buy a piece of his gear. */
  | { type: "BUSTER"; op: "sellCraft"; slot: number | "all" }
  | { type: "BUSTER"; op: "sellResin"; count: number | "all" }
  | { type: "BUSTER"; op: "sellFirewood"; count: number | "all" }
  /** The felling's by-products (one kind, or every pouch at once), to Bramble or Buster. */
  | { type: "BUSTER"; op: "sellByproducts"; item: ByproductId | "all" }
  | { type: "BUSTER"; op: "buyPermit"; permit: "dayTrip" | "ranger" }
  | { type: "BUSTER"; op: "sellAllWood" }
  /** A legacy piece (a stash slot, or all of them) traded in at Buster's or Bramble's for its whole
   *  listed price. */
  | { type: "BUSTER"; op: "tradeIn"; slot: number | "all" }
  /** The workbench: carve a piece, safe or pushing for a Masterwork (its wood from the carrier;
   *  answered with workbenchResult). */
  | { type: "WORKBENCH"; recipe: CraftId; mode: CraftMode; adhesive?: Adhesive }
  /** The slingshot gallery: a round begins (answered with slingshotStarted), and its shots, reported
   *  when it ends (the server replays them: slingshotResult). */
  | { type: "SLINGSHOT_START" }
  | { type: "SLINGSHOT_END"; shots: SlingShot[]; touch?: boolean };

/** Server -> the shooter ("slingshotStarted"): the round's seed (the range follows from it), and
 *  whether it plays for coins (the paid rounds left this hour). */
export interface SlingshotStarted {
  seed: number;
  paid: boolean;
  left: number;
}
/** Server -> the shooter ("slingshotResult"): the round as the server scored it. */
export interface SlingshotResult {
  ok: boolean;
  score: number;
  hits: number;
  acorns: number;
  streak: number;
  /** The prize tier's coins and the Golden Acorns' (0 on a free round), and what was paid after
   *  the day's cap. */
  prize: number;
  acornCoins: number;
  coins: number;
  capped: boolean;
  eagle: boolean;
  paid: boolean;
  best: number;
}

/** How a carve at the workbench came out (sent to the carver). */
export interface WorkbenchResult {
  ok: boolean;
  message: string;
  /** Set when the carve happened: a normal piece, a Masterwork, or broken (salvage and sawdust back). */
  outcome?: CraftOutcome;
  recipe?: CraftId;
  salvaged?: Partial<Record<WoodKind, number>>;
  sawdust?: number;
  /** The Pine Resin spent in the Adhesive Slot on this carve, if one was. */
  adhesive?: Adhesive;
}

/** Barnaby's answer to a shop request (sent to the one who asked). */
export interface BarnabyResult {
  ok: boolean;
  message: string;
  coins: number;
}
