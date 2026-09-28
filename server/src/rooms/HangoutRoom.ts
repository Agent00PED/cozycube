import { Room, Client, OnMessageException, type RoomException } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, clampToRegion, isBlocked } from "../../../shared/collision";
import { PersistenceQueue, getPlayerStore, newPlayerRecord, type PlayerRecord } from "../db/players";
import { outfitPrice, progressDaily, rollDaily, rollFish, rollGacha, todayKey } from "./games";
import { AWAY_PREFIX, BoardTable, type BoardSnapshot } from "./boardgame";
import { registerRoom, roomOpen, unregisterRoom } from "./lounges";
import { getBoardStore } from "../db/boards";
import { BOARD_SEAT_CHAIRS, GAMES, boardSeatOfChair } from "../../../shared/worlds/lounge";
import { BUSTER_FRONT, BUSTER_REACH, BARNABY_FRONT, BARNABY_REACH, BONFIRE_REACH, CAMPFIRE_LAYOUT, CRITTER_REACH, DUCK_PATHS, FIREFLY_REACH, FISHING_REACH, FISHING_SPOTS, FORAGE_REACH, FORAGE_SPOTS, PICNIC_REACH, STARGAZE_REACH, WORKBENCH, WORKBENCH_FRONT, WORKBENCH_REACH, dockSeatOf, nearestFishingSpot, spotOfSeat } from "../../../shared/worlds/campfire";
import { CUSHIONS, seatAnchorY } from "../../../shared/seats";
import { ADHESIVES, CRAFTS, RESIN_PRICE, SAWDUST_FUEL, canCraft, craftOdds, craftSalePrice, craftSalvage, isAdhesive, isCraftId, isCraftMode, rollCraft } from "../../../shared/crafting";
import { DRYAD_GROWTH, GEAR, LUCKY_BELL_KING, LUCKY_BELL_WARN_S, baitSaveChance, biteHaste, bonusLogChance, byproductBonus, dryadChance, feltRingSlow, goldBonus, goldStarBonus, hasLuckyBell, heftBonus, isGearId, missDeepens, nightRareLuck, quickRegrow, splitYield, wearGear, type GearId } from "../../../shared/gear";
import { AXES, woodPrice, nextCarrierTier, WOOD, isAxeId, isWoodKind, addLogs, takeLogs, woodAverage, logMultiplier, rollFellSwing, judgeFell, rollTreeScale, rollTreeRounds, trunkCm, FELL_CRIT_CHANCE, FELL_CRIT_COINS, FELL_ROUND_PAUSE_S, TITAN, type FellSwing, type FellVerdict } from "../../../shared/chop";
import {
  BAITS,
  afkSeconds,
  CREEL_RELEASE_COINS,
  FISH,
  RODS,
  WELL_FED_S,
  WELL_FED_SPEED,
  biteSeconds,
  woodCount,
  carrierCap,
  carrierLoad,
  creelFull,
  creelTier,
  livewellCap,
  nextCreelTier,
  fishValue,
  isBaitId,
  isRodId,
  rollCatch,
  rollFish as rollRiverFish,
  type BaitId,
  type CatchLuck,
  type CreelFish,
  type FishId,
  type FishingProfile,
} from "../../../shared/fishing";
import { isCampDay } from "../../../shared/daynight";
import { BYPRODUCTS, BYPRODUCT_IDS, FIREWOOD_FUEL, TREES, WOOD_KINDS, isByproductId, regrowth, treeStage, type TreeStage, type WoodKind } from "../../../shared/chop";
import { FELL_TREES, FELL_TREE_AT, fellReach, fellTreeOf, type FellTree } from "../../../shared/worlds/trees";
import { ADVANCED_BENCH_MASTER, EAGLE_EYE_MS, EAGLE_EYE_ZONE, FIREWOOD_PRICE, GOLDEN_ACORN_COINS, MAX_DAY_PERMITS, PERMIT_PRICES, RAPIDS_LUCK, SLINGSHOT_PAID_ROUNDS_PER_HOUR, SLINGSHOT_PRIZES } from "../../../shared/economy";
import { SLING_ROUND_S, playSlingshot, slingPrize, validSlingShots } from "../../../shared/slingshot";
import {
  ANIMAL_REACH,
  BRAMBLE_FRONT,
  BRAMBLE_REACH,
  FOREST_ANIMALS,
  FOREST_FISHING,
  FINLEY_FRONT,
  FINLEY_REACH,
  FOREST_WORKBENCH,
  FOREST_WORKBENCH_FRONT,
  TITAN_SPOTS,
  WOODS_ARRIVAL,
  woodsSpotOfSeat,
} from "../../../shared/worlds/forest";
import { CAMP_ARCHWAY_FRONT, CAMP_FROM_WOODS, GALLERY_FRONT, SPLITBLOCK_FRONT } from "../../../shared/worlds/campfire";
import {
  COZY_AURA_LUCK,
  FUEL_DECAY,
  FUEL_DECAY_S,
  FUEL_MAX,
  FUEL_START,
  PICNIC_PLATES,
  PICNIC_STALE_S,
  STEW_COLD_S,
  STEW_COOK_S,
  STEW_SERVINGS,
  STEW_SLOTS,
  emptyStew,
  hasCozyAura,
  isCampfireStew,
  parsePicnic,
  parseStew,
  stewName,
  type BonfireUpdate,
  type PicnicPlate,
  type StewState,
  type StewUpdate,
} from "../../../shared/bonfire";
import { emptyCampfireCoins } from "../db/players";
import { MAP_CHAIRS, MAP_TOGGLEABLES, PROP_MAP, isFishingSeat, isWaterable, mochiSpot } from "../../../shared/props";
import { WORLDS } from "../../../shared/worlds/index";
import { BOUTIQUE, BOUTIQUE_REACH } from "../../../shared/worlds/lounge";
import { craftGood, fishGood, parseMarket, priceRun, woodGood, type MarketState } from "../../../shared/market";
import { PIONEER_SET, pioneerEligible, pioneerUntil, specialTitle, type PioneerInfo } from "../../../shared/items";
import { BALL_HOME, KICK_REACH, kickBall, stepBall } from "../../../shared/volleyball";
import {
  BITE_WINDOW_S,
  CAMPFIRE_DAILY_COINS,
  FORAGE_COINS,
  FORAGE_INFO,
  FORAGE_REGROW_CAMP_S,
  STAR_SPARK_COINS,
  STARLIGHT_REEL_MIN_S,
  type StarlightReel,
  type CampfireCoinKind,
  type WorkbenchResult,
  FELL_COINS,
  SURGE_KING_CHANCE,
  SURGE_S,
  WORLD_EVENT_EVERY_MIN,
  parseWorldEvent,
  type FellDrop,
  type FellResult,
  type WorldEvent,
  CONSTELLATIONS,
  CONSTELLATION_COINS,
  CONSTELLATION_MIN_S,
  TREASURE_CHANCE,
  TREASURE_COINS,
  starComboMultiplier,
  type ConstellationDone,
  type ConstellationId,
  type MeteorShower,
  type ForageResult,
  type Gesture,
  type ShootingStar,
  type StarCaught,
  ROAST_GOLDEN_COINS,
  SNACK_SECONDS,
  STARLIGHT_BITE_S,
  encodeSnack,
  parseSnack,
  type BarnabyResult,
  isRoastFood,
  type CampfirePacket,
  type FishCaught,
  type RoastFood,
  type RoastQuality,
  type RoastResult,
  type RoastStart,
  BREW_SECONDS,
  ESPRESSO_TIP,
  ESPRESSO_TIP_COOLDOWN_S,
  FORAGE_REGROW_S,
  GESTURE_EMOJI,
  SERVER_GESTURES,
  ITEMS,
  NPCS,
  PREMIUM_HATS,
  STARTING_COINS,
  TIMES_OF_DAY,
  RAIN_START_CHANCE,
  RAIN_STOP_CHANCE,
  isWeather,
  type Weather,
  encodeBag,
  isGesture,
  isPremiumHat,
  parseBag,
  type ItemId,
  LOFI_TRACKS,
  CAMPFIRE_BOOST_SECONDS,
  EMOTES,
  INTERACT_RADIUS,
  ROAST_SECONDS,
  TOAST_MAX,
  isTimeOfDay,
  isActivityStatus,
  AFK_FISH_MIN_S,
  AFK_FISH_MAX_S,
  SPARKLE_SPOTS,
  SPARKLE_RESPAWN_S,
  isWalkUpProp,
  isCasinoProp,
  usableSeated,
  encodeLook,
  parseLook,
  poseForSeat,
  type MapId,
  type TimeOfDay,
  type SeatStyle,
  type ToggleableKind,
  ALLOWANCE_BELOW,
  ALLOWANCE_COINS,
  ALLOWANCE_COOLDOWN_S,
  CHAT_MAX_CHARS,
  DEFAULT_STATS,
  STEW_COOLDOWN_S,
  STEW_RADIUS,
  STEW_REWARD,
  STEW_STIRS,
  parseStats,
  type PlayerStats,
  ARCADE_COINS_MAX,
  ARCADE_COINS_PER_POINT,
  ARCADE_SCORE_COOLDOWN_S,
  AURA_SECONDS,
  BOARD_MIN_PLIES_FOR_PURSE,
  BOARD_WIN_COINS,
  DRINK_BASES,
  DRINK_BASE_INFO,
  DRINK_TOPPINGS,
  PLANT_WATER_COINS,
  RADIO_STATIONS,
  encodeDrink,
  radioStationIndex,
  type BoardPacket,
  type BoardSide,
  type KitchenPacket,
  type PlantPacket,
  type PlantWatered,
  type RadioPacket,
  BOXING_BOUT_KOS,
  BOXING_DIZZY_S,
  BOXING_KNOCKDOWN_HITS,
  BOXING_PURSE,
  BOXING_REACH,
  BOXING_RING,
  BOXING_TIP,
  CLAW_COST,
  CLAW_WIN_COINS,
  DAILY_REWARD,
  DRINK_COOLDOWN_S,
  DRINK_RECIPES,
  DRINK_REWARD,
  FORTUNES,
  GACHA_COST,
  MATCHA_COOLDOWN_S,
  MATCHA_REWARD_MAX,
  MOCHI_ACTIONS,
  MOCHI_ACTION_COOLDOWN_S,
  MOCHI_SCRITCH_COINS,
  ONSEN_SOAK_S,
  PUNCH_COOLDOWN_MS,
  REEL_SECONDS,
  STARTER_OUTFITS,
  VIBE_COINS,
  VIBE_EVERY_MIN,
  VIBE_PARTY_MULTIPLIER,
  VIBE_PARTY_SIZE,
  WISH_COST,
  HAIR_DEFINITIONS,
  fromStoredLook,
  hairUnlockId,
  isHairStyle,
  isMapId,
  LOUNGE_CAPACITY,
  LOUNGE_FULL,
  isLoungeRoomKey,
  cleanDisplayName,
  MAP_SIGNATURE_TIME,
  isCasinoMap,
  isCampMap,
  HIDDEN_MAPS,
  isBlacklisted,
  isOutfitId,
  toStoredLook,
  type DailyTaskId,
  type SlingshotResult,
  type SlingshotStarted,
  type SplitResult,
  type TreeFelled,
  type FishOnLine,
  type FishingWater,
  type MochiAction,
} from "../../../shared/types";
import { CASINO_EMOTES, auraPace, capsuleUnlock, netWorth, type BlackjackAction, type CashierRequest, type CasinoPacket } from "../../../shared/casino";
import { CasinoFloor, RouletteSchema } from "./casino";
import { getWipeAt } from "../db/players";
import { BUILD_ID } from "../build";

class Player extends Schema {
  @type("string") userId = "";
  @type("string") username = "";
  @type("string") avatarUrl = "";
  /** The world this player is in (everyone in the guild shares the room; each walks their own way). */
  @type("string") map: MapId = "cozy_lounge";
  @type("number") x = 0;
  @type("number") z = 2;
  @type("number") dirX = 0;
  @type("number") dirZ = 0;
  /** The number of the last movement report applied: the client reconciles against that report. */
  @type("number") moveSeq = 0;
  @type("string") color = "#ffffff";
  @type("string") look = "";
  @type("boolean") sitting = false;
  @type("number") sitRotationY = 0;
  @type("number") sitY = 0;
  @type("string") sitPose = "sit";
  @type("string") holding = "";
  /** What is in the mug (encodeDrink), "" for a plain one. */
  @type("string") drink = "";
  /** On the skewer, while holding "skewer" (shared/types encodeSnack). */
  @type("string") snack = "";
  /** The lounge plants watered today, comma-separated prop ids. */
  @type("string") watered = "";
  @type("string") action = "";
  @type("number") actionProgress = 0;
  @type("number") toast = 0;
  @type("boolean") speaking = false;
  @type("boolean") connected = true;
  @type("number") coins = STARTING_COINS;
  /** Velvet Chips (the record's casino.chips is the one kept). */
  @type("number") chips = 0;
  /** Holds the Black Card, the penthouse's permanent pass (the record's casino.vipPass is the one kept). */
  @type("boolean") vipPass = false;
  /** Velvet VIP Wristbands held: one ride up each (the record's casino.wristbands). */
  @type("number") vipWristbands = 0;
  @type("string") bag = "";
  @type("string") owned = "";
  @type("string") status = "";
  @type("string") stats = JSON.stringify(DEFAULT_STATS);
  @type("number") ping = 0;
  @type("boolean") gloves = false;
  @type("number") boxHits = 0;
  @type("number") boxKOs = 0;
  @type("string") aura = "";
  /** A capsule title worn over the name (shared/casino.ts CAPSULE_PRIZES), "" for none. */
  @type("string") title = "";
  @type("string") daily = "";
  /** The angler's FishingProfile as JSON (the record's copy is the one kept). */
  @type("string") fishing = "";
  /** Whole seconds left Well-Fed. */
  @type("number") fed = 0;
}

// How near the board game table you must be to take a seat at it
const BOARD_REACH = 3.2;
// How soon after one drink the kitchenette will pour another
const KITCHEN_COOLDOWN_MS = 2000;

class ChairState extends Schema {
  @type("string") propId = "";
  /** The world the seat is in: every built world's seats live in the one room. */
  @type("string") map = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") rotationY = 0;
  @type("string") style = "pad";
  @type("number") sitY = 0;
  @type("string") occupiedBy = ""; // sessionId, or "" if free
}

class ToggleableState extends Schema {
  @type("string") propId = "";
  /** The world the prop is in. */
  @type("string") map = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("string") kind = "lamp";
  @type("string") color = "#ffffff";
  @type("boolean") on = true;
  @type("number") boost = 0;
  @type("number") track = 0;
}

// The beach volleyball. The server owns it; clients run the same shared physics step between
// patches (see shared/volleyball.ts), so it flies smoothly rather than hopping at 20 Hz.
class BallSchema extends Schema {
  @type("number") x = BALL_HOME.x;
  @type("number") y = BALL_HOME.y;
  @type("number") z = BALL_HOME.z;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") vz = 0;
}

class HangoutState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: ChairState }) chairs = new MapSchema<ChairState>();
  @type({ map: ToggleableState }) toggleables = new MapSchema<ToggleableState>();
  /** The lounge's hour (the campfire and the casino keep their own night: MAP_SIGNATURE_TIME). */
  @type("string") timeOfDay: TimeOfDay = "day";
  /** The lounge's weather outside its windows (the campfire and the casino are always clear). */
  @type("string") weather: Weather = "clear";
  @type(BallSchema) ball = new BallSchema();
  @type(RouletteSchema) roulette = new RouletteSchema();
  /** Roulette bets on the table this round, per sessionId, as encodeBets() strings. */
  @type({ map: "string" }) bets = new MapSchema<string>();
  /** Who is at each of the casino's one-player machines: "" free, a sessionId, or a patron
   *  "npc:<Kind>:<tint>" (shared/casino.ts). */
  @type({ map: "string" }) machines = new MapSchema<string>();
  @type("boolean") autoCycle = false;
  /** The persisted High Rollers table (LeaderboardEntry[] as JSON), refreshed every few seconds. */
  @type("string") leaderboard = "[]";
  /** The Campfire's bonfire, 0..FUEL_MAX (shared/bonfire.ts): it burns down; firewood builds it up. */
  @type("number") fuel = FUEL_START;
  /** The Dutch oven over it (a StewState as JSON). */
  @type("string") stew = "";
  /** Every fellable tree (the campfire's and the woods', a Titan while it stands), as JSON: { node id:
   *  { stage, scale, dmg, rounds } } (shared/chop.ts TreeSync). */
  @type("string") trees = "";
  /** The living wonder under way, if any (shared/types WorldEvent as JSON): a King-Size Surge or a
   *  Colossal Titan. In the state, so everyone (a late joiner too) sees the same one. */
  @type("string") worldEvent = "";
  /** Skewers left on the picnic table (PicnicPlate[] as JSON). */
  @type("string") picnic = "";
  /** The hour's sales at the camp's stalls (a MarketState as JSON: shared/market.ts). */
  @type("string") market = "";
}

const CHAT_COOLDOWN_MS = 1200;
const PERSIST_EVERY_S = 2.5;
const LEADERBOARD_EVERY_S = 15;
/** Which water each map's fishing seats hang over. */
const MAP_WATER: Partial<Record<MapId, FishingWater>> = { sunset_beach: "ocean", campfire_night: "river" };

interface Wallet {
  coins: number;
  bag: string;
  owned: string;
}

const MOVE_SPEED_PER_SEC = 3;
// Movement is CLIENT-authoritative: the client pathfinds and collides against the same shared
// collision the server knows, so the server's job is only to refuse the impossible — a warp,
// a speed hack, a position outside the island. How far a report may move a player is derived
// from the time since their last one, with generous slack for jittery networks and stalled
// tabs; anything beyond that is clamped toward the report (never ignored — see below).
const SPEED_TOLERANCE = 1.6;
const STEP_SLACK = 0.45;
const MAX_REPORT_STEP = MOVE_SPEED_PER_SEC * 0.75; // hard cap for any single report
// Positions are only refused for being properly INSIDE furniture, with a slimmer radius than
// the client walks with. Both sides run the same test, but float drift at a box edge must never
// be the thing that yanks a player back — that is exactly what a rollback is.
const SANITY_RADIUS = 0.12;
const TICK_MS = 50; // 20 Hz: the volleyball needs it; everything else is happy at any rate
const BALL_SUBSTEP = 1 / 120;
const KICK_COOLDOWN_MS = 350;
const BALL_RESET_IDLE_S = 25;
const EMOTE_COOLDOWN_MS = 600;
// Everybody used to arrive as the same white figure, which made a busy room unreadable. New
// players get a pastel at random (the colour picker still overrides it), spread round the hue
// circle so two people rarely land on near-identical shades.
const PASTEL_COLORS = [
  "#f2a3a3", // blush
  "#f6c48a", // apricot
  "#f2e09a", // butter
  "#b8e0a0", // pistachio
  "#9adfd0", // seafoam
  "#a3c9f2", // sky
  "#b8b0ec", // lilac
  "#e8a8dd", // orchid
];
const AUTO_CYCLE_SECONDS = 45; // each hour of the day lasts this long when Auto Cycle is on
const GESTURE_COOLDOWN_MS = 1200;
const COIN_CAP = 99999;
const ALLOWED_EMOTES = new Set<string>(EMOTES);

export class HangoutRoom extends Room<HangoutState> {
  /** A lounge holds this many (shared/types LOUNGE_CAPACITY); a full one refuses the join. */
  maxClients = LOUNGE_CAPACITY;
  channelId = "";
  /** The guild this room is for (guild_<id>): every channel in it joins this one instance. */
  guildKey = "";
  /** After a trip between worlds, move reports are not believed until then (ms): the ones still in
   *  flight were walked on the world left behind. */
  private arrivedUntil = new Map<string, number>();
  private lastEmoteAt = new Map<string, number>();
  private lastReportAt = new Map<string, number>();
  private lastKickAt = new Map<string, number>();
  private fishBiteAt = new Map<string, number>();
  /** When the current bite escapes, per fishing player (absent = no bite on the line). */
  private biteUntil = new Map<string, number>();
  /** Length of the current AFK-fishing wait, per player, so progress can be shown. */
  private afkTotal = new Map<string, number>();
  private lastTipAt = new Map<string, number>();
  private lastGestureAt = new Map<string, number>();
  private regrowAt = new Map<string, number>();
  /** Wallets of players who left, by Discord user id, so coming back restores them. */
  private wallets = new Map<string, Wallet>();
  /** The persisted record behind each connected player, and a signature of what was last saved. */
  private records = new Map<string, PlayerRecord>();
  private savedSignature = new Map<string, string>();
  private queue = new PersistenceQueue(getPlayerStore);
  private lastChatAt = new Map<string, number>();
  /** The fish on each reeling player's line, and when the tension game times out. */
  private hooked = new Map<string, { fish: FishOnLine; until: number }>();
  /** The campfire: each roast in progress (its dial, timed here), when each skewer is eaten up,
   *  when each player last took one off the fire, and who is fishing the river from the dock. */
  private roasts = new Map<string, RoastStart & { food: RoastFood; startedAt: number }>();
  private snackUntil = new Map<string, number>();
  private lastRoastAt = new Map<string, number>();
  private starlight = new Set<string>();
  /** The river's reels in progress: what is on each line, and when the fight began. */
  private starReels = new Map<string, { fish: CreelFish; startedAt: number; treasure: boolean }>();
  /** What is nosing at each line in the river before it bites (rolled at the cast: a big fish takes
   *  its time), when the line went in, and how long the wait is. */
  private pendingFish = new Map<string, { species: FishId; castAt: number; total: number }>();
  /** The bonfire's last burn-down; the Dutch oven's cooking clock and when it came to the boil;
   *  when each plate went on the picnic table. */
  private fuelTickAt = Date.now();
  private stewCookAt = 0;
  private stewReadyAt = 0;
  private picnicAt: number[] = [];
  /** When each player last swept the net through the fireflies. */
  private lastNetAt = new Map<string, number>();
  /** When each player last tossed the raccoon a treat, and when each duck last dived. */
  private lastTreatAt = new Map<string, number>();
  private duckDivedAt: number[] = [];
  /** The telescope: each stargazer's next meteor shower, the shooting stars crossing their lens
   *  (each catchable until its time is up), their catch chain, and the constellations they have
   *  traced this look. */
  private stargazers = new Map<string, { next: number; since: number; stars: Map<number, number>; combo: number; traced: Set<string> }>();
  private starSeq = 1;
  /** Felling under way: each feller's tree and the swing's ring (timed from `startedAt`). */
  private fells = new Map<string, { tree: string; swing: FellSwing; startedAt: number }>();
  /** Every fellable tree's life (shared/worlds/trees.ts): its stage, size, rounds landed and needed,
   *  and when it fell (its regrowth); a Titan's only while its event stands. */
  /** Every fellable tree's state; `quick` a tree struck gold by someone wearing the Ancient Ring of
   *  Oak (it grows back sooner), `grown` one the Dryad's Sprout Amulet has already grown this time. */
  private trees = new Map<string, { stage: TreeStage; scale: number; dmg: number; rounds: number; fellAt: number; quick?: boolean; grown?: boolean }>();
  /** Finley's Lucky Bell: the surge it has already rung for (its start time), and where it will be. */
  private bellRungFor = 0;
  private nextSurgeSpot: { map: MapId; at: { x: number; z: number } } | null = null;
  /** When the next living wonder comes (epoch ms), and which came last (they take turns). */
  private nextWonderAt = Date.now() + wonderGap();
  private lastWonder: "surge" | "titan" = Math.random() < 0.5 ? "surge" : "titan";
  /** Who is fishing each of the rapids' spots (spot id: sessionId). */
  private rapidsAnglers = new Map<string, string>();
  private treeTickAt = 0;
  private lastFeedAt = new Map<string, number>();
  /** The slingshot gallery: each shooter's round under way, and when each account's paid rounds
   *  of the last hour began. */
  private slingRounds = new Map<string, { seed: number; startedAt: number; paid: boolean }>();
  private slingPaidAt = new Map<string, number[]>();
  private lastChopAt = new Map<string, number>();
  private lastPunchAt = new Map<string, number>();
  private dizzyUntil = new Map<string, number>();
  private auraUntil = new Map<string, number>();
  private vibeAt = new Map<string, number>();
  private soakSeconds = new Map<string, number>();
  private lastArcadeScoreAt = new Map<string, number>();
  private lastMatchaAt = new Map<string, number>();
  private lastDrinkAt = new Map<string, number>();
  private lastMochiAt = new Map<string, number>();
  /** When each player's account was made (the Pioneer set's eligibility). */
  private createdAt = new Map<string, number>();
  private board = new BoardTable();
  /** The casino's tables and Mr. Vance's cage (server/src/rooms/casino.ts), built with the state. */
  private casino!: CasinoFloor;
  /** When each player last poured a drink at the kitchenette. */
  private lastKitchenAt = new Map<string, number>();
  private boardSweepClock = 0;
  /** Seats restored after a restart are held for their players until then (Date.now ms). */
  private boardHoldUntil = 0;
  /** Set while shutting down: the table was saved as it stood, and what follows is not saved. */
  private boardFrozen = false;
  private boardSaveTimer: NodeJS.Timeout | undefined;
  private persistClock = 0;
  private leaderboardClock = LEADERBOARD_EVERY_S; // refresh on the first tick
  /** The channel's scene as last saved (sceneSignature), and the clock that checks it. */
  private savedScene = "";
  private sceneClock = 0;
  private cycleClock = 0;
  private ballIdle = 0;

  async onCreate(options: { guildKey?: string; guildId?: string; channelId: string }) {
    // the three lounges are global (the same room from every Discord server): only their keys make a
    // room, and never a second one with the same key (a full lounge is locked, and matchmaking would
    // otherwise open another beside it: the join is refused instead)
    if (!isLoungeRoomKey(options.guildKey)) throw new Error("unknown lounge");
    if (roomOpen(options.guildKey)) throw new Error(LOUNGE_FULL);
    this.setState(new HangoutState());
    this.casino = new CasinoFloor(this.state, {
      broadcastExcept: (sessionId, type, payload) => {
        this.toMap("velvet_casino", type, payload, sessionId);
        this.toMap("casino_vip", type, payload, sessionId);
      },
      sendTo: (sessionId, type, payload) => this.sendTo(sessionId, type, payload),
      seatOf: (sessionId) => {
        let seat = "";
        this.state.chairs.forEach((chair, id) => {
          if (chair.occupiedBy === sessionId) seat = id;
        });
        return seat;
      },
      teleport: (sessionId, x, z) => {
        const player = this.state.players.get(sessionId);
        if (!player || player.sitting) return;
        player.x = x;
        player.z = z;
        player.dirX = 0;
        player.dirZ = 0;
      },
      travel: (sessionId, map, at) => {
        const player = this.state.players.get(sessionId);
        if (player && !player.sitting) this.travel(sessionId, player, map, at);
      },
      broadcast: (type, payload) => {
        this.toMap("velvet_casino", type, payload);
        this.toMap("casino_vip", type, payload);
      },
      shout: (type, payload) => this.broadcast(type, payload),
      later: (ms, fn) => void this.clock.setTimeout(fn, ms),
      tally: (sessionId, event) => {
        const player = this.state.players.get(sessionId);
        if (!player) return;
        if (event === "slots_spin") {
          this.bumpStat(player, "slots_spins");
          this.daily(sessionId, player, "spin_slots");
        } else if (event === "capsule_pull") {
          // the casino's capsule machine counts as a turn of the gachapon
          this.bumpStat(player, "gacha_pulls");
          this.daily(sessionId, player, "pull_gacha");
        } else this.bumpStat(player, event === "roulette_win" ? "roulette_wins" : "blackjack_wins");
      },
      persistNow: (sessionId) => {
        const player = this.state.players.get(sessionId);
        if (player) this.persist(sessionId, player, true);
      },
      profile: (sessionId) => this.records.get(sessionId)?.casino,
      owns: (sessionId, id) => {
        const player = this.state.players.get(sessionId);
        return !!player && this.owns(player, id);
      },
      grant: (sessionId, id) => {
        const player = this.state.players.get(sessionId);
        if (player) this.grant(player, id);
      },
      aura: (sessionId, aura, seconds) => {
        const player = this.state.players.get(sessionId);
        if (!player) return;
        player.aura = aura;
        this.auraUntil.set(sessionId, Date.now() + seconds * 1000);
      },
    });
    this.autoDispose = false; // `autoDispose` is an accessor on the base Room class — assign, don't redeclare as a field.
    // NOTE: do not reassign `this.roomId` here — it breaks Colyseus's internal room
    // registry/dispose bookkeeping. "1 Discord guild = 1 room" is achieved via
    // `.filterBy(["guildKey"])` on the room definition in server/src/index.ts instead.
    this.channelId = String(options.channelId ?? "");
    this.guildKey = String(options.guildKey);
    // the lounge selector counts who is here (rooms/lounges.ts)
    registerRoom(this.guildKey, this);
    this.loadAllProps();
    this.initTrees();
    this.state.market = JSON.stringify(parseMarket(""));
    // (the board game in this channel, if one was going when the server last stopped, is put back
    // at the end of onCreate: see restoreBoard)

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), TICK_MS);

    this.onMessage("move", (client, msg: { dirX: number; dirZ: number; x?: number; z?: number; seq?: number; map?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      // a report walked on the world you just left (sent before the trip reached the client) never
      // moves you on the new one: its spot is the old world's
      if (typeof msg?.map === "string" && msg.map !== player.map) return;
      if (player.sitting) {
        // walking off a seat gets you up: nobody is ever held on a chair by a missed "standUp"
        // (one sent into a dying connection, say) while their client thinks they are walking
        if (!msg || (!msg.dirX && !msg.dirZ)) return;
        this.handleStandUp(client.sessionId);
        if (player.sitting) return;
      }
      player.dirX = Math.max(-1, Math.min(1, msg.dirX));
      player.dirZ = Math.max(-1, Math.min(1, msg.dirZ));
      // Walking away from the espresso machine abandons the brew.
      if (player.action === "brew" && (player.dirX !== 0 || player.dirZ !== 0)) this.clearAction(player);
      // walking off your spot on the dock puts the rod away; walking away from the fire takes the skewer out
      if (player.dirX !== 0 || player.dirZ !== 0) {
        if ((player.action === "fish" || player.action === "reel") && this.starlight.has(client.sessionId)) this.stopStarlight(client.sessionId, player);
        else if (player.action === "grill") this.finishRoast(client.sessionId, player, "raw");
        else if (player.action === "stargaze") this.stopStargazing(client.sessionId, player);
        else if (player.action === "chop") this.cancelFell(client.sessionId, player);
        else if (player.action === "afkfish" || player.action === "rest") {
          // walking off a spot on the woods' bank (fishing standing, AFK or resting with a mug):
          // the line comes in and the mug goes back in the bag
          this.putMugAway(player);
          this.afkTotal.delete(client.sessionId);
          this.stopStarlight(client.sessionId, player);
        }
      }
      this.applyReportedPosition(player, msg.x, msg.z, client.sessionId);
      // echo which report this position answers, applied as sent or not, so the client can tell
      // an old echo from a real correction
      if (typeof msg.seq === "number" && Number.isInteger(msg.seq) && msg.seq > 0) player.moveSeq = msg.seq;
    });

    this.onMessage("standUp", (client) => this.handleStandUp(client.sessionId));
    // the Sit emote, away from any seat: cross-legged right where you stand, facing the way you
    // faced (moving, or standUp, gets you up again)
    this.onMessage("groundSit", (client, msg: { rotationY?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.sitting || player.action !== "" || player.gloves) return;
      const heading = Number(msg?.rotationY);
      player.sitting = true;
      player.sitPose = "cross";
      player.sitY = GROUND_SIT_Y;
      player.sitRotationY = Number.isFinite(heading) ? heading : 0;
      player.dirX = 0;
      player.dirZ = 0;
      this.lastReportAt.delete(client.sessionId);
    });
    // a tap on one of the campfire's ducks: it quacks and dives (everyone sees it)
    this.onMessage("duckPoke", (client, msg: { duck?: number }) => {
      if (this.state.players.get(client.sessionId)?.map !== "campfire_night") return;
      const i = Number(msg?.duck);
      if (!Number.isInteger(i) || i < 0 || i >= DUCK_PATHS.length) return;
      const now = Date.now();
      if (now - (this.duckDivedAt[i] ?? 0) < DUCK_DIVE_COOLDOWN_MS) return;
      this.duckDivedAt[i] = now;
      this.toMap("campfire_night", "duckDive", { duck: i, sessionId: client.sessionId });
    });

    this.onMessage("setLook", (client, msg: { look: string }) => {
      const player = this.state.players.get(client.sessionId);
      const look = parseLook(msg?.look);
      if (!player || !look) return;
      // Premium hats, outfits and fancy hair have to have been bought (or won at the gachapon).
      if (isPremiumHat(look.hat) && !this.owns(player, look.hat)) return;
      // (the Velvet Pioneer set is owned once claimed, like anything bought)
      if (!this.owns(player, look.outfit)) return;
      if (!this.ownsHair(player.owned.split(","), look.hairStyle)) return;
      player.look = encodeLook(look);
      player.color = look.outfitColor;
    });

    this.onMessage("setColor", (client, msg: { color: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !/^#[0-9a-fA-F]{6}$/.test(msg.color)) return;
      player.color = msg.color;
    });

    // a trip to another world: only the one who asked goes (Bruno's doors are the way up to the
    // penthouse, never this)
    this.onMessage("changeMap", (client, msg: { mapId: MapId }) => this.handleChangeMap(client.sessionId, msg?.mapId));
    // the Velvet Pioneer set, free for the beta's players for two weeks after the wipe
    this.onMessage("claim_pioneer", (client) => this.handleClaimPioneer(client.sessionId));

    this.onMessage("interactChair", (client, msg: { chairId: string; x?: number; z?: number }) => {
      const player = this.state.players.get(client.sessionId);
      // Fold in the arrival position the client reports alongside the request. Proximity is
      // checked against the server's copy of the player position, which is only as fresh as the
      // last throttled move report — without this the sit loses that race and is rejected.
      if (player && !player.sitting) this.applyReportedPosition(player, msg.x, msg.z);
      this.handleInteractChair(client, msg.chairId);
    });

    this.onMessage("useProp", (client, msg: { propId: string; x?: number; z?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player && !player.sitting) this.applyReportedPosition(player, msg.x, msg.z);
      this.handleUseProp(client.sessionId, msg.propId);
    });

    // Time of day is shared ambience, like the lights: anyone can set it, everyone sees it.
    this.onMessage("setTimeOfDay", (client, msg: { timeOfDay: TimeOfDay }) => {
      if (!isTimeOfDay(msg?.timeOfDay)) return;
      // the campfire is always a starlit night, and the casino never sees the sun
      const map = this.state.players.get(client.sessionId)?.map;
      if (map && MAP_SIGNATURE_TIME[map]) {
        if (map === "campfire_night") this.sendTo(client.sessionId, "campfireNotice", { message: "It's always a starlit night by the campfire", emoji: "🌙" });
        return;
      }
      this.state.timeOfDay = msg.timeOfDay;
      this.state.autoCycle = false; // picking an hour by hand stops the clock
    });
    this.onMessage("setAutoCycle", (_client, msg: { on: boolean }) => {
      this.state.autoCycle = msg?.on === true;
      this.cycleClock = 0;
    });
    // the weather, like the hour: anyone in the lounge can bring the rain in or clear it away
    this.onMessage("setWeather", (client, msg: { weather: Weather }) => {
      if (!isWeather(msg?.weather)) return;
      const map = this.state.players.get(client.sessionId)?.map;
      if (map && MAP_SIGNATURE_TIME[map]) return;
      this.state.weather = msg.weather;
    });

    this.onMessage("gesture", (client, msg: { gesture: string }) => this.handleGesture(client.sessionId, msg?.gesture));
    this.onMessage("buyHat", (client, msg: { hat: string }) => this.handleBuyHat(client.sessionId, msg?.hat));
    this.onMessage("placeBet", (client, msg: { kind: string; amount: number }) => this.casino.placeBet(client.sessionId, msg));
    this.onMessage("clearBets", (client) => this.casino.clearBets(client.sessionId));
    // Mr. Vance's cage: coins into Velvet Chips and back, 1:1, at the window
    this.onMessage("buyChips", (client, msg: CashierRequest) => this.casino.exchange(client.sessionId, "buy", msg?.amount));
    this.onMessage("cashOut", (client, msg: CashierRequest) => this.casino.exchange(client.sessionId, "cashout", msg?.amount));
    // the capsule machine, the title you wear, Pippin's bar menu
    this.onMessage("casino", (client, packet: CasinoPacket) => this.casino.packet(client.sessionId, packet));

    this.onMessage("emote", (client, msg: { emoji: string }) => this.handleEmote(client.sessionId, msg.emoji));

    this.onMessage("speaking", (client, msg: { speaking: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.speaking = msg.speaking === true;
    });

    this.onMessage("roast", (client) => this.handleRoast(client.sessionId));
    this.onMessage("kickBall", (client, msg: { dirX: number; dirZ: number }) => this.handleKick(client.sessionId, msg));
    this.onMessage("castLine", (client, msg: { afk?: boolean }) => this.handleCastLine(client.sessionId, !!msg?.afk));
    this.onMessage("setStatus", (client, msg: { status: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.status = isActivityStatus(msg?.status) ? msg.status : "";
      // going AFK on a long sofa lies you down along it; coming back sits you up again
      if (player.sitting) this.state.chairs.forEach((chair) => chair.occupiedBy === client.sessionId && this.settleInSeat(player, chair));
    });
    this.onMessage("reelIn", (client) => this.handleReelIn(client.sessionId));
    this.onMessage("eat", (client) => this.handleEat(client.sessionId));
    this.onMessage("dropHeld", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player && player.holding === "jar") {
        // letting the fireflies go
        player.holding = "";
        this.nearby(client.sessionId, "emote", { sessionId: client.sessionId, emoji: "✨" });
      } else if (player && (player.holding === "coffee" || (player.holding === "skewer" && player.action !== "grill"))) {
        player.holding = "";
        player.drink = "";
        player.snack = "";
        this.snackUntil.delete(client.sessionId);
      }
    });
    // --- the campfire: roasting and the guitar (fishing goes through castLine / hook / reelIn) ---
    this.onMessage("campfire", (client, packet: CampfirePacket) => this.handleCampfire(client, packet));
    // --- lounge: the kitchenette, the radio and the plants ---
    this.onMessage("kitchen", (client, packet: KitchenPacket) => this.handleKitchen(client.sessionId, packet));
    this.onMessage("radio", (client, packet: RadioPacket) => this.handleRadio(client.sessionId, packet));
    this.onMessage("plant", (client, packet: PlantPacket) => packet?.type === "PLANT_WATER" && this.waterPlant(client.sessionId, String(packet.plantId)));

    // --- server-authoritative transactions (the wallet is never trusted from a client) ---
    this.onMessage("claim_allowance", (client) => this.handleClaimAllowance(client.sessionId));
    this.onMessage("buy_item", (client, msg: { item: string }) => this.handleBuyHat(client.sessionId, msg?.item));
    this.onMessage("spin_slots", (client, msg: { propId: string; bet: number }) => this.casino.spinSlot(client.sessionId, this.state.toggleables.get(String(msg?.propId ?? "")), Number(msg?.bet)));
    this.onMessage("blackjack_action", (client, msg: { action: BlackjackAction; bet?: number; hand?: number }) => this.casino.blackjack(client.sessionId, msg));
    this.onMessage("chat_bubble", (client, msg: { text: string }) => this.handleChat(client.sessionId, msg?.text));
    // --- outfits, gachapon and the arcade ---
    this.onMessage("buy_outfit", (client, msg: { outfit: string }) => this.handleBuyOutfit(client.sessionId, msg?.outfit));
    this.onMessage("buy_hair", (client, msg: { style: string }) => this.handleBuyHair(client.sessionId, msg?.style));
    this.onMessage("pull_gacha", (client) => this.handleGacha(client.sessionId));
    this.onMessage("claw_play", (client, msg: { aim: number }) => this.handleClaw(client.sessionId, Number(msg?.aim)));
    this.onMessage("arcade_score", (client, msg: { score: number }) => this.handleArcadeScore(client.sessionId, Number(msg?.score)));
    // --- fishing: hook the bite, then settle the tension game ---
    this.onMessage("hook", (client) => this.handleHook(client.sessionId));
    this.onMessage("catch_fish", (client, msg: { result: string; quality?: number }) => this.handleCatchFish(client.sessionId, msg?.result === "caught", Number(msg?.quality ?? 0)));
    // --- boxing ---
    this.onMessage("boxing_enter", (client) => this.handleBoxingEnter(client.sessionId));
    this.onMessage("boxing_exit", (client) => this.handleBoxingExit(client.sessionId));
    this.onMessage("boxing_punch", (client, msg: { target: string }) => this.handlePunch(client.sessionId, String(msg?.target ?? "")));
    this.onMessage("toss_coin", (client, msg: { to: string }) => this.handleTossCoin(client.sessionId, String(msg?.to ?? "")));
    // --- onsen ---
    this.onMessage("splash", (client) => this.handleSplash(client.sessionId));
    this.onMessage("make_wish", (client) => this.handleWish(client.sessionId));
    this.onMessage("matcha_whisk", (client, msg: { score: number }) => this.handleMatcha(client.sessionId, Number(msg?.score)));
    // --- beach bar ---
    this.onMessage("blend_drink", (client, msg: { recipe: string; ingredients: string[] }) => this.handleBlend(client.sessionId, msg));
    // --- lounge ---
    this.onMessage("set_record", (client, msg: { track: number }) => this.handleSetRecord(client.sessionId, Number(msg?.track)));
    this.onMessage("board", (client, packet: BoardPacket) => this.handleBoardPacket(client, packet));
    // --- mochi ---
    this.onMessage("mochi_play", (client, msg: { action: string }) => this.handleMochi(client.sessionId, msg?.action));
    // Latency and heartbeat: the client times the round trip and reports it, so the roster can
    // show pings. The steady traffic also keeps idle-timeout proxies from cutting the socket, and a
    // client whose pings stop coming back treats its connection as dead and reconnects, so every
    // ping is always answered.
    // (development only: bring on a living wonder now, to see it)
    if (process.env.NODE_ENV !== "production") {
      this.onMessage("devWorldEvent", (_client, kind: unknown) => {
        this.endWonder(false);
        // "auto": the room's own clock comes due now (the next wonder in turn, as in production);
        // "soon": due in 35 s (a Lucky Bell rings first, if a surge is next)
        if (kind === "auto") this.nextWonderAt = 0;
        else if (kind === "soon") this.nextWonderAt = Date.now() + (LUCKY_BELL_WARN_S + 5) * 1000;
        else this.startWonder(kind === "titan" ? "titan" : "surge");
      });
    }

    this.onMessage("ping", (client, msg: { t: number; rtt?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player && typeof msg?.rtt === "number" && Number.isFinite(msg.rtt)) player.ping = Math.max(0, Math.min(9999, Math.round(msg.rtt)));
      client.send("pong", { t: msg?.t ?? 0 });
    });

    // last: the board game this channel had going when the server stopped, back on its table
    // (Colyseus waits for this before anyone joins, so the first to arrive can reclaim a seat)
    await this.restoreScene();
    await this.restoreBoard();
  }

  // --- persistence ---------------------------------------------------------------------------

  /** Copies the live state into the player's record and queues a debounced write if it changed. */
  private persist(sessionId: string, player: Player, now = false) {
    const record = this.records.get(sessionId);
    // test and bot accounts are never recorded
    if (!record || isBlacklisted(player.username)) return;
    record.username = player.username;
    record.coins = player.coins;
    record.casino = { ...record.casino, chips: player.chips, title: player.title, vipPass: player.vipPass, wristbands: player.vipWristbands };
    record.unlockedItems = player.owned ? player.owned.split(",") : [];
    const look = parseLook(player.look);
    record.equippedLook = look ? { ...toStoredLook(look) } : {};
    record.stats = parseStats(player.stats);
    try {
      record.daily = player.daily ? JSON.parse(player.daily) : null;
    } catch {
      record.daily = null;
    }
    const signature = `${record.coins}|${player.chips}|${player.title}|${player.vipPass}|${player.vipWristbands}|${record.casino.fortuneDay}|${player.fishing}|${player.owned}|${player.look}|${player.stats}|${player.daily}|${record.mochiCoinsDay}|${record.plantsWatered.day}:${record.plantsWatered.ids.join(",")}|${Object.values(record.campfireCoins).join(":")}|${record.lastDailyClaim?.getTime() ?? 0}`;
    if (signature === this.savedSignature.get(sessionId) && !now) return;
    this.savedSignature.set(sessionId, signature);
    this.queue.mark(record);
    if (now) void this.queue.flush(record.discordId);
  }

  private bumpStat(player: Player, stat: keyof PlayerStats, by = 1) {
    const stats = parseStats(player.stats);
    stats[stat] += by;
    player.stats = JSON.stringify(stats);
  }

  /** Advances one of today's checklist tasks for a player; the finished list pays out at once. */
  private daily(sessionId: string, player: Player, task: DailyTaskId, by = 1) {
    let list: ReturnType<typeof rollDaily> | null = null;
    try {
      list = player.daily ? JSON.parse(player.daily) : null;
    } catch {
      list = null;
    }
    if (!list || list.date !== todayKey()) list = rollDaily(player.userId);
    const completed = progressDaily(list, task, by);
    player.daily = JSON.stringify(list);
    if (completed) {
      this.addCoins(player, DAILY_REWARD);
      this.sendTo(sessionId, "dailyComplete", { coins: DAILY_REWARD });
      this.nearby(sessionId, "emote", { sessionId, emoji: "🎀" });
    }
  }

  private owns(player: Player, id: string): boolean {
    return (STARTER_OUTFITS as string[]).includes(id) || player.owned.split(",").includes(id);
  }

  private grant(player: Player, id: string) {
    if (this.owns(player, id)) return;
    player.owned = player.owned ? `${player.owned},${id}` : id;
  }

  // --- outfits, gachapon, arcade -------------------------------------------------------------

  /** At the Velvet Boutique in the lounge, by Chloe or her cheval mirror: the only place the
   *  wardrobe sells (wearing what you own works anywhere). Says so if not. */
  private atBoutique(sessionId: string, player: Player): boolean {
    const near = player.map === "cozy_lounge" && Math.min(Math.hypot(player.x - BOUTIQUE.chloe.x, player.z - BOUTIQUE.chloe.z), Math.hypot(player.x - BOUTIQUE.mirror.x, player.z - BOUTIQUE.mirror.z)) <= BOUTIQUE_REACH + 1.0;
    if (!near) this.sendTo(sessionId, "campfireNotice", { message: "New clothes are Chloe's: visit the Velvet Boutique in the lounge", emoji: "👗" });
    return near;
  }

  private handleBuyOutfit(sessionId: string, outfit: unknown) {
    const player = this.state.players.get(sessionId);
    if (!player || !isOutfitId(outfit) || this.owns(player, outfit)) return;
    if (!this.atBoutique(sessionId, player)) return;
    const price = outfitPrice(outfit);
    if (price <= 0 || player.coins < price) return; // gacha-only outfits are not for sale
    player.coins -= price;
    this.grant(player, outfit);
    this.nearby(sessionId, "emote", { sessionId, emoji: "👕" });
  }

  /** A fancy hair style from the wardrobe's shop: recorded as hair_<style> with the other unlocks. */
  private handleBuyHair(sessionId: string, style: unknown) {
    const player = this.state.players.get(sessionId);
    if (!player || !isHairStyle(style) || this.ownsHair(player.owned.split(","), style)) return;
    if (!this.atBoutique(sessionId, player)) return;
    const price = HAIR_DEFINITIONS[style].price;
    if (player.coins < price) return;
    player.coins -= price;
    this.grant(player, hairUnlockId(style));
    this.nearby(sessionId, "emote", { sessionId, emoji: HAIR_DEFINITIONS[style].emoji });
  }

  private handleGacha(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "retro_arcade" || player.coins < GACHA_COST) return;
    player.coins -= GACHA_COST;
    const prize = rollGacha(new Set(player.owned.split(",")));
    if (prize.kind === "hat" || prize.kind === "outfit") this.grant(player, prize.id);
    else if (prize.kind === "coins") this.addCoins(player, prize.amount);
    else this.addCoins(player, prize.refund);
    this.bumpStat(player, "gacha_pulls");
    this.daily(sessionId, player, "pull_gacha");
    this.sendTo(sessionId, "gachaResult", prize);
    if (prize.kind === "hat" || prize.kind === "outfit") this.nearby(sessionId, "emote", { sessionId, emoji: "✨" });
  }

  private handleClaw(sessionId: string, aim: number) {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "retro_arcade" || player.coins < CLAW_COST || !Number.isFinite(aim)) return;
    player.coins -= CLAW_COST;
    // the plush sits at a random spot; a claw dropped within a whisker of it usually grips
    const target = Math.random();
    const miss = Math.abs(Math.max(0, Math.min(1, aim)) - target);
    const chance = miss < 0.08 ? 0.75 : miss < 0.2 ? 0.4 : 0.1;
    const won = Math.random() < chance;
    if (won) {
      this.addItem(player, "plush");
      this.addCoins(player, CLAW_WIN_COINS);
      this.nearby(sessionId, "emote", { sessionId, emoji: "🧸" });
    }
    this.sendTo(sessionId, "clawResult", { won, target });
  }

  private handleArcadeScore(sessionId: string, score: number) {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "retro_arcade" || !Number.isFinite(score) || score <= 0) return;
    const now = Date.now();
    if (now - (this.lastArcadeScoreAt.get(sessionId) ?? 0) < ARCADE_SCORE_COOLDOWN_S * 1000) return;
    this.lastArcadeScoreAt.set(sessionId, now);
    const coins = Math.min(ARCADE_COINS_MAX, Math.floor(score * ARCADE_COINS_PER_POINT));
    if (coins > 0) {
      this.addCoins(player, coins);
      this.nearby(sessionId, "emote", { sessionId, emoji: "🕹️" });
    }
    this.sendTo(sessionId, "arcadeResult", { coins });
  }

  // --- fishing: the tension game ---------------------------------------------------------------

  private handleHook(sessionId: string) {
    if (this.starlight.has(sessionId)) return this.hookStarlight(sessionId);
    const player = this.state.players.get(sessionId);
    if (!player || player.action !== "fish" || !this.biteUntil.has(sessionId)) return;
    const water = MAP_WATER[player.map] ?? "ocean";
    const fish = rollFish(water);
    this.biteUntil.delete(sessionId);
    this.hooked.set(sessionId, { fish, until: Date.now() + (REEL_SECONDS + 4) * 1000 });
    player.action = "reel";
    player.actionProgress = 0;
    this.sendTo(sessionId, "fishOnLine", fish);
  }

  private handleCatchFish(sessionId: string, caught: boolean, quality: number) {
    const player = this.state.players.get(sessionId);
    const line = this.hooked.get(sessionId);
    if (!player || !line || player.action !== "reel") return;
    this.hooked.delete(sessionId);
    if (caught) {
      if (line.fish.item === "boot") {
        this.nearby(sessionId, "emote", { sessionId, emoji: "👢" });
      } else {
        this.addItem(player, line.fish.item);
        this.bumpStat(player, "fish_caught");
        this.daily(sessionId, player, "catch_fish");
        this.nearby(sessionId, "emote", { sessionId, emoji: ITEMS[line.fish.item].emoji });
        // a clean reel-in (the bar never slipped) earns a little bonus
        if (quality >= 0.9) this.addCoins(player, 3);
      }
    } else {
      this.nearby(sessionId, "emote", { sessionId, emoji: "💨" });
    }
    player.action = "fish";
    player.actionProgress = 0;
    this.fishBiteAt.set(sessionId, Date.now() + randomBiteDelay());
  }

  // --- boxing --------------------------------------------------------------------------------

  private inRing(p: Player): boolean {
    return Math.abs(p.x - BOXING_RING.x) < BOXING_RING.half && Math.abs(p.z - BOXING_RING.z) < BOXING_RING.half;
  }

  private handleBoxingEnter(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "boxing_ring" || player.sitting) return;
    if (!this.inRing(player)) return;
    player.gloves = true;
    player.boxHits = 0;
    player.boxKOs = 0;
    this.nearby(sessionId, "emote", { sessionId, emoji: "🥊" });
  }

  private handleBoxingExit(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    player.gloves = false;
    player.boxHits = 0;
    player.boxKOs = 0;
  }

  private handlePunch(sessionId: string, targetId: string) {
    const me = this.state.players.get(sessionId);
    const target = this.state.players.get(targetId);
    if (!me || !target || sessionId === targetId || me.map !== target.map) return;
    if (!me.gloves || !target.gloves || me.action === "dizzy" || target.action === "dizzy") return;
    if (Math.hypot(me.x - target.x, me.z - target.z) > BOXING_REACH + 0.6) return;
    const now = Date.now();
    if (now - (this.lastPunchAt.get(sessionId) ?? 0) < PUNCH_COOLDOWN_MS) return;
    this.lastPunchAt.set(sessionId, now);
    target.boxHits += 1;
    this.nearby(sessionId, "punch", { from: sessionId, to: targetId, hits: target.boxHits });
    if (target.boxHits >= BOXING_KNOCKDOWN_HITS) {
      target.boxHits = 0;
      target.action = "dizzy";
      this.dizzyUntil.set(targetId, now + BOXING_DIZZY_S * 1000);
      me.boxKOs += 1;
      this.nearby(targetId, "emote", { sessionId: targetId, emoji: "💫" });
      if (me.boxKOs >= BOXING_BOUT_KOS) {
        this.addCoins(me, BOXING_PURSE);
        this.bumpStat(me, "boxing_knockouts");
        this.daily(sessionId, me, "win_boxing");
        this.nearby(sessionId, "boxingResult", { winner: sessionId, winnerName: me.username, loser: targetId, loserName: target.username, purse: BOXING_PURSE });
        this.nearby(sessionId, "emote", { sessionId, emoji: "🏆" });
        me.boxKOs = 0;
        target.boxKOs = 0;
      }
    }
  }

  private handleTossCoin(sessionId: string, to: string) {
    const from = this.state.players.get(sessionId);
    const target = this.state.players.get(to);
    if (!from || !target || from === target || from.map !== target.map || !target.gloves || from.coins < BOXING_TIP) return;
    from.coins -= BOXING_TIP;
    this.addCoins(target, BOXING_TIP);
    this.nearby(to, "emote", { sessionId: to, emoji: "🪙" });
  }

  // --- onsen ---------------------------------------------------------------------------------

  private handleSplash(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "japanese_onsen") return;
    const now = Date.now();
    if (now - (this.lastGestureAt.get(sessionId) ?? 0) < GESTURE_COOLDOWN_MS) return;
    this.lastGestureAt.set(sessionId, now);
    let splashedSomeone = false;
    this.state.players.forEach((p, id) => {
      if (id !== sessionId && p.map === player.map && Math.hypot(p.x - player.x, p.z - player.z) < 2.6) splashedSomeone = true;
    });
    this.nearby(sessionId, "splash", { sessionId, x: player.x, z: player.z });
    this.nearby(sessionId, "emote", { sessionId, emoji: "💦" });
    if (splashedSomeone) this.daily(sessionId, player, "splash_water");
  }

  private handleWish(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "japanese_onsen" || player.coins < WISH_COST) return;
    player.coins -= WISH_COST;
    const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    // once in a while the well gives back more than it took
    const lucky = Math.random() < 0.15 ? 5 + Math.floor(Math.random() * 10) : 0;
    if (lucky) this.addCoins(player, lucky);
    this.daily(sessionId, player, "make_wish");
    this.sendTo(sessionId, "wishResult", { fortune, lucky });
    this.nearby(sessionId, "emote", { sessionId, emoji: "🪙" });
  }

  private handleMatcha(sessionId: string, score: number) {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "japanese_onsen" || !Number.isFinite(score)) return;
    const now = Date.now();
    if (now - (this.lastMatchaAt.get(sessionId) ?? 0) < MATCHA_COOLDOWN_S * 1000) return;
    this.lastMatchaAt.set(sessionId, now);
    const coins = Math.round(Math.max(0, Math.min(1, score)) * MATCHA_REWARD_MAX);
    if (coins > 0) this.addCoins(player, coins);
    player.holding = "coffee"; // a bowl of tea to carry, drawn like the mug
    player.drink = "";
    this.sendTo(sessionId, "matchaResult", { coins });
    this.nearby(sessionId, "emote", { sessionId, emoji: "🍵" });
  }

  // --- beach bar -----------------------------------------------------------------------------

  private handleBlend(sessionId: string, msg: { recipe: string; ingredients: string[] }) {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "sunset_beach") return;
    const recipe = DRINK_RECIPES.find((r) => r.id === msg?.recipe);
    if (!recipe || !Array.isArray(msg.ingredients)) return;
    const now = Date.now();
    if (now - (this.lastDrinkAt.get(sessionId) ?? 0) < DRINK_COOLDOWN_S * 1000) return;
    const right = recipe.needs.every((n) => msg.ingredients.includes(n)) && msg.ingredients.length === recipe.needs.length;
    this.lastDrinkAt.set(sessionId, now);
    if (right) {
      this.addCoins(player, DRINK_REWARD);
      player.aura = recipe.aura;
      this.auraUntil.set(sessionId, now + AURA_SECONDS * 1000);
      player.holding = "coffee";
      player.drink = "";
      this.nearby(sessionId, "emote", { sessionId, emoji: recipe.emoji });
    }
    this.sendTo(sessionId, "blendResult", { right, coins: right ? DRINK_REWARD : 0 });
  }

  // --- lounge: the kitchenette, the radio and the plants -----------------------------------------

  /** The nearest prop of `kind` in reach of the player (INTERACT_RADIUS), or undefined. */
  private propInReach(player: Player, kind: string, propId?: string) {
    let best: ToggleableState | undefined;
    let bestD = INTERACT_RADIUS;
    this.state.toggleables.forEach((prop) => {
      if (prop.kind !== kind || prop.map !== player.map || (propId && prop.propId !== propId)) return;
      const d = Math.hypot(player.x - prop.x, player.z - prop.z);
      if (d <= bestD) {
        best = prop;
        bestD = d;
      }
    });
    return best;
  }

  /** Pours the drink the kitchen modal brewed (its brewing animation has already played) into the player's mug. */
  private handleKitchen(sessionId: string, packet: KitchenPacket) {
    const player = this.state.players.get(sessionId);
    if (!player || packet?.type !== "KITCHEN_BREW" || player.map !== "cozy_lounge") return;
    if (!(DRINK_BASES as readonly string[]).includes(packet.base) || !(DRINK_TOPPINGS as readonly string[]).includes(packet.topping)) return;
    if (!this.propInReach(player, "kitchen")) return;
    const now = Date.now();
    if (now - (this.lastKitchenAt.get(sessionId) ?? 0) < KITCHEN_COOLDOWN_MS) return;
    this.lastKitchenAt.set(sessionId, now);
    if (player.action === "brew" || player.action === "roast") this.clearAction(player);
    if (player.holding === "marshmallow") player.toast = 0;
    player.holding = "coffee";
    player.drink = encodeDrink(packet.base, packet.topping);
    this.daily(sessionId, player, "brew_coffee");
    this.nearby(sessionId, "emote", { sessionId, emoji: DRINK_BASE_INFO[packet.base].emoji });
  }

  /** Tunes the lounge radio for the whole room: its station and whether it plays are synced state. */
  private handleRadio(sessionId: string, packet: RadioPacket) {
    const player = this.state.players.get(sessionId);
    if (!player || packet?.type !== "RADIO_UPDATE" || player.map !== "cozy_lounge") return;
    const station = radioStationIndex(String(packet.station));
    if (station < 0 || station >= RADIO_STATIONS.length) return;
    // tuning is done at the radio (or from a pouf round its table)
    const radio = this.propInReach(player, "radio");
    if (!radio) return;
    radio.track = station;
    radio.on = !!packet.playing;
  }

  /** Waters a lounge plant: each one pays PLANT_WATER_COINS, once a day per player. */
  private waterPlant(sessionId: string, plantId: string) {
    const player = this.state.players.get(sessionId);
    const record = this.records.get(sessionId);
    if (!player || !record || player.map !== "cozy_lounge" || !isWaterable(plantId)) return;
    const plant = this.propInReach(player, "plant", plantId);
    if (!plant) return;
    const today = todayKey();
    if (record.plantsWatered.day !== today) record.plantsWatered = { day: today, ids: [] };
    if (record.plantsWatered.ids.includes(plantId)) {
      this.sendTo(sessionId, "plantHappy", { plantId });
      return;
    }
    record.plantsWatered.ids.push(plantId);
    player.watered = record.plantsWatered.ids.join(",");
    this.addCoins(player, PLANT_WATER_COINS);
    const splash: PlantWatered = { type: "PLANT_WATERED", sessionId, plantId, coins: PLANT_WATER_COINS };
    this.toMap("cozy_lounge", "plantWatered", splash);
    this.nearby(sessionId, "gesture", { sessionId, gesture: "water" });
    this.persist(sessionId, player);
  }

  // --- lounge: the jukebox and the board game ---------------------------------------------------

  private handleSetRecord(sessionId: string, track: number) {
    const map = this.state.players.get(sessionId)?.map;
    this.state.toggleables.forEach((prop) => {
      if (prop.kind !== "turntable" || prop.map !== map) return;
      if (!Number.isFinite(track) || track < 0) {
        prop.on = false;
        return;
      }
      prop.on = true;
      prop.track = Math.min(LOFI_TRACKS.length - 1, Math.floor(track));
    });
  }

  private broadcastBoard() {
    this.broadcast("boardState", this.boardView());
    this.saveBoard();
  }

  /** The table, plus who at it is away (dropped, or not back yet since a restart). */
  private boardView() {
    const away = (side: BoardSide) => {
      const id = this.board.seats[side];
      return !!id && (id.startsWith(AWAY_PREFIX) || this.state.players.get(id)?.connected === false);
    };
    return { ...this.board.view(), away: { w: away("w"), b: away("b") } };
  }

  // --- saving the board game ------------------------------------------------------------------
  // The table is written to the board store (db/boards.ts) shortly after every change, so a
  // restart or a redeploy never wipes a game in progress; the room puts it back when it is
  // created again, each seat held for its player (by Discord user id) for RECONNECT_WINDOW_S.

  private boardStoreKey() {
    return this.guildKey || this.channelId || this.roomId;
  }

  /** Saves the table soon (changes that come in a burst are written once). */
  private saveBoard() {
    if (this.boardFrozen) return;
    clearTimeout(this.boardSaveTimer);
    this.boardSaveTimer = setTimeout(() => void this.writeBoard(), BOARD_SAVE_DEBOUNCE_MS);
  }

  private async writeBoard() {
    clearTimeout(this.boardSaveTimer);
    this.boardSaveTimer = undefined;
    const t = this.board;
    const held = !!t.seats.w || !!t.seats.b;
    try {
      await getBoardStore().save(this.boardStoreKey(), held ? t.snapshot((id) => this.state.players.get(id)?.userId ?? "") : null);
    } catch (err) {
      console.error("[db] failed to save the board game (will retry on the next change):", err instanceof Error ? err.message : err);
    }
  }

  // --- the channel's scene -----------------------------------------------------------------------
  //
  // A room lives as long as the server does (it is never disposed when it empties), so what ends
  // one is a restart or a redeploy, and a fresh room starts in the lounge with a fresh fire. The
  // scene is saved beside the board game (db/boards.ts, under "<channel>#scene") whenever it
  // changes, and a room created again for the channel puts it back before anyone joins: the world
  // it was in, the hour, and the campfire's bonfire (its fuel, even at 0%: an out fire stays out
  // until relit, nobody is ever moved for it), its Dutch oven and its picnic plates, and the casino's
  // coin pushers' shelves (every coin on them).

  private sceneKey() {
    return `${this.boardStoreKey()}#scene`;
  }

  private sceneNow(): SavedScene {
    const trees: NonNullable<SavedScene["trees"]> = {};
    this.trees.forEach((t, id) => {
      if (!FELL_TREE_AT.get(id)?.titan) trees[id] = { scale: t.scale, dmg: t.dmg, rounds: t.rounds, fellAt: t.fellAt };
    });
    const ev = parseWorldEvent(this.state.worldEvent);
    const titanTree = ev?.kind === "titan" ? this.trees.get(ev.id) : undefined;
    const titan = ev?.kind === "titan" && titanTree ? { id: ev.id, x: ev.x, z: ev.z, dmg: titanTree.dmg, rounds: titanTree.rounds } : undefined;
    return { time: this.state.timeOfDay, weather: this.state.weather, fuel: this.state.fuel, stew: this.state.stew, picnic: this.state.picnic, pushers: this.casino.saveShelves(), trees, titan };
  }

  private async saveScene() {
    const scene = this.sceneNow();
    const signature = JSON.stringify(scene);
    if (signature === this.savedScene) return;
    this.savedScene = signature;
    try {
      // (the board store keeps any JSON per key: the scene rides in it under its own key)
      await getBoardStore().save(this.sceneKey(), scene as unknown as BoardSnapshot);
    } catch (err) {
      this.savedScene = "";
      console.error("[db] failed to save the scene (will retry):", err instanceof Error ? err.message : err);
    }
  }

  private async restoreScene() {
    try {
      const scene = (await getBoardStore().load(this.sceneKey())) as unknown as Partial<SavedScene> | null;
      if (!scene) return;
      if (isTimeOfDay(scene.time)) this.state.timeOfDay = scene.time;
      if (isWeather(scene.weather)) this.state.weather = scene.weather;
      if (typeof scene.fuel === "number" && Number.isFinite(scene.fuel)) this.state.fuel = Math.max(0, Math.min(FUEL_MAX, Math.round(scene.fuel)));
      // the pot and the plates come back as they were; a pot still cooking finishes from now
      const stew = parseStew(typeof scene.stew === "string" ? scene.stew : "");
      if (stew.phase === "cooking") this.stewCookAt = Date.now() - stew.progress * STEW_COOK_S * 1000;
      if (stew.phase === "ready") this.stewReadyAt = Date.now();
      this.state.stew = stew.items.length || stew.phase !== "gathering" ? JSON.stringify(stew) : "";
      const plates = parsePicnic(typeof scene.picnic === "string" ? scene.picnic : "");
      this.state.picnic = plates.length ? JSON.stringify(plates) : "";
      this.picnicAt = plates.map(() => Date.now());
      // the casino's coin pushers: their shelves as the last players left them
      this.casino.restoreShelves(scene.pushers);
      // the trees: their sizes, notches and stumps as they were (a stump grows on from when it fell)
      if (scene.trees && typeof scene.trees === "object") {
        for (const [id, t] of Object.entries(scene.trees)) {
          const node = FELL_TREE_AT.get(id);
          const tree = this.trees.get(id);
          if (!node || node.titan || !tree || !t) continue;
          if (Number(t.scale) >= 0.5 && Number(t.scale) <= 2.5) tree.scale = Number(t.scale);
          if (Number(t.rounds) >= 1 && Number(t.rounds) <= 8) tree.rounds = Math.round(Number(t.rounds));
          tree.dmg = Math.max(0, Math.min(tree.rounds - 1, Math.round(Number(t.dmg) || 0)));
          const fellAt = Number(t.fellAt) || 0;
          if (fellAt > 0 && regrowth(node.kind, (Date.now() - fellAt) / 1000) < 1) {
            tree.fellAt = fellAt;
            tree.dmg = 0;
            tree.stage = treeStage(regrowth(node.kind, (Date.now() - fellAt) / 1000));
          }
        }
        this.syncTrees();
      }
      // a Titan that stood when the room last closed still stands, notch and all
      const t = scene.titan;
      if (t && typeof t.id === "string" && FELL_TREE_AT.get(t.id)?.titan) {
        const node = FELL_TREE_AT.get(t.id)!;
        const rounds = Math.max(1, Math.min(8, Math.round(Number(t.rounds) || TITAN.rounds[0])));
        this.trees.set(node.id, { stage: "mature", scale: TITAN.scale, dmg: Math.max(0, Math.min(rounds - 1, Math.round(Number(t.dmg) || 0))), rounds, fellAt: 0 });
        this.state.worldEvent = JSON.stringify({ kind: "titan", map: "whispering_woods", id: node.id, x: node.x, z: node.z, until: 0 } satisfies WorldEvent);
        this.lastWonder = "titan";
        this.syncTrees();
      }
      this.savedScene = JSON.stringify(this.sceneNow());
      console.log(`[room ${this.roomId}] scene restored for ${this.boardStoreKey()}: fire ${this.state.fuel}%`);
    } catch (err) {
      console.error("[db] could not restore the scene:", err instanceof Error ? err.message : err);
    }
  }

  /** Puts back the board game this channel had going when the server last stopped. */
  private async restoreBoard() {
    try {
      const snap = await getBoardStore().load(this.boardStoreKey());
      if (!snap || !this.board.restore(snap)) return;
      this.boardHoldUntil = Date.now() + RECONNECT_WINDOW_S * 1000;
      console.log(`[room ${this.roomId}] board game restored for channel ${this.boardStoreKey()} (${snap.gameType}, ${snap.plies} plies)`);
    } catch (err) {
      console.error("[db] could not restore the board game:", err instanceof Error ? err.message : err);
    }
  }

  /**
   * The board game table (server/src/rooms/boardgame.ts owns the rules). Every packet that
   * changes the table is answered by broadcasting the whole table to everyone, so the players and
   * the spectators can never disagree about the board. A decisive game pays its winner once.
   */
  private handleBoardPacket(client: Client, packet: BoardPacket) {
    const sessionId = client.sessionId;
    const player = this.state.players.get(sessionId);
    if (!player || !packet || typeof packet !== "object" || player.map !== "cozy_lounge") return;
    const t = this.board;
    let changed = false;
    switch (packet.type) {
      case "BOARD_WATCH":
        changed = t.watch(sessionId, player.username, !!packet.watching);
        // whoever opens the board gets the table as it stands right now
        if (packet.watching) this.sendTo(sessionId, "boardState", this.boardView());
        break;
      case "BOARD_SIT":
        if (Math.hypot(player.x - GAMES.table.x, player.z - GAMES.table.z) > BOARD_REACH) return;
        this.takeBoardSeat(sessionId, packet.seat === "b" ? "b" : "w");
        return; // takeBoardSeat broadcasts what changed
      case "BOARD_LEAVE":
        this.leaveBoard(sessionId);
        return;
      case "BOARD_SELECT":
        changed = t.select(sessionId, packet.gameType);
        break;
      case "BOARD_MOVE":
        changed = !!packet.move && t.move(sessionId, packet.gameType, { from: Number(packet.move.from), to: Number(packet.move.to), promotion: packet.move.promotion });
        // the mover reaches over the table to play it (everyone sees the hand go out)
        if (changed) this.nearby(sessionId, "gesture", { sessionId, gesture: "reach" });
        // refused (illegal, out of turn, or a board that moved on): say so, and resend the table
        // so a client drawing a stale board catches up
        else this.boardRefused(client, "That move isn't allowed");
        break;
      case "BOARD_RESET":
        changed = t.reset(sessionId, packet.gameType);
        break;
      case "BOARD_RESIGN":
        changed = t.resign(sessionId);
        break;
      case "BOARD_DRAW":
        changed = t.draw(sessionId, typeof packet.accept === "boolean" ? packet.accept : undefined);
        break;
      default:
        return;
    }
    if (!changed) return;
    this.broadcastBoard();
    this.payBoardWinner();
  }

  /** Tells a player their board packet was refused, and sends them the table as it stands. */
  private boardRefused(client: Client, message: string) {
    client.send("boardError", { type: "BOARD_ERROR", message });
    client.send("boardState", this.boardView());
  }

  /** A decisive game pays its winner BOARD_WIN_COINS, once, if it lasted long enough to count. */
  private payBoardWinner() {
    const winnerId = this.board.settle(BOARD_MIN_PLIES_FOR_PURSE);
    const winner = winnerId ? this.state.players.get(winnerId) : undefined;
    this.saveBoard(); // settled: the purse is never paid twice, restart or not
    if (!winner) return;
    this.addCoins(winner, BOARD_WIN_COINS);
    this.nearby(winnerId, "emote", { sessionId: winnerId, emoji: this.board.gameType === "chess" ? "♟️" : "⛀" });
  }

  /**
   * Seats `sessionId` at the board table: on the seat asked for if its chair is free, otherwise on
   * the other one (so a second player always lands on the opposite chair), sitting them on that
   * seat's chair in the same step. Both seats taken: false, and they stay where they are (the
   * board opens for them to watch). The seat and its chair are one lock (BOARD_SEAT_CHAIRS):
   * messages are handled one at a time, so two players can never be given the same one.
   */
  private takeBoardSeat(sessionId: string, wanted?: BoardSide): boolean {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "cozy_lounge") return false;
    const mine = this.board.sideOf(sessionId);
    if (mine && (!wanted || wanted === mine)) return true; // already there
    if (mine && this.board.underWay()) return false; // no swapping sides mid-game
    const free = (side: BoardSide) => {
      const chair = this.state.chairs.get(BOARD_SEAT_CHAIRS[side]);
      return !!chair && (chair.occupiedBy === "" || chair.occupiedBy === sessionId) && (!this.board.seats[side] || this.board.seats[side] === sessionId);
    };
    const first: BoardSide = wanted ?? "w";
    const other: BoardSide = first === "w" ? "b" : "w";
    const side: BoardSide | "" = free(first) ? first : free(other) ? other : "";
    if (!side || side === mine) return !!side;
    if (player.sitting) this.handleStandUp(sessionId); // off whatever seat (or the other board seat) first
    const chair = this.state.chairs.get(BOARD_SEAT_CHAIRS[side]);
    if (!chair || chair.occupiedBy !== "" || !this.board.sit(sessionId, player.username, side)) return false;
    this.seatPlayer(sessionId, player, chair);
    this.broadcastBoard();
    return true;
  }

  /** Gets up from the board table: the seat and its chair are given up together. */
  private leaveBoard(sessionId: string) {
    let onBoardChair = false;
    this.state.chairs.forEach((chair) => {
      if (chair.occupiedBy === sessionId && boardSeatOfChair(chair.propId)) onBoardChair = true;
    });
    if (onBoardChair) this.handleStandUp(sessionId); // standing up gives the seat up with the chair
    else if (this.board.leave(sessionId)) {
      this.broadcastBoard();
      this.payBoardWinner();
    }
  }

  /**
   * Keeps the lock honest: a board seat is held only by the player sitting on its chair. Anyone
   * holding one without sitting on it (they left the room, or got up some other way) loses it.
   * A dropped connection does not count: a reconnecting player keeps their chair, and so their seat.
   */
  private sweepBoardSeats() {
    let changed = false;
    for (const side of ["w", "b"] as BoardSide[]) {
      const id = this.board.seats[side];
      if (!id) continue;
      // held since a restart: kept until its player is back, or until the wait is over
      if (id.startsWith(AWAY_PREFIX)) {
        if (Date.now() > this.boardHoldUntil) changed = this.board.leave(id) || changed;
        continue;
      }
      const chair = this.state.chairs.get(BOARD_SEAT_CHAIRS[side]);
      if (!this.state.players.has(id) || chair?.occupiedBy !== id) changed = this.board.leave(id) || changed;
    }
    if (!changed) return;
    this.broadcastBoard();
    this.payBoardWinner();
  }

  // --- mochi ---------------------------------------------------------------------------------

  private handleMochi(sessionId: string, action: unknown) {
    const player = this.state.players.get(sessionId);
    const record = this.records.get(sessionId);
    if (!player || !record || !(MOCHI_ACTIONS as readonly string[]).includes(String(action))) return;
    const a = action as MochiAction;
    // she has to be in this world, and you have to be beside wherever she has wandered to
    let hasMochi = false;
    this.state.toggleables.forEach((prop) => {
      if (prop.kind === "cat" && prop.map === player.map) hasMochi = true;
    });
    if (!hasMochi) return;
    const at = mochiSpot(player.map, Date.now() / 1000);
    if (Math.hypot(at.x - player.x, at.z - player.z) > INTERACT_RADIUS + 1.5) return;
    const now = Date.now();
    const key = `${sessionId}:${a}`;
    if (now - (this.lastMochiAt.get(key) ?? 0) < MOCHI_ACTION_COOLDOWN_S * 1000) {
      this.sendTo(sessionId, "mochiResult", { action: a, coins: 0, cooldown: true });
      return;
    }
    this.lastMochiAt.set(key, now);
    this.bumpStat(player, "mochi_pets");
    this.daily(sessionId, player, "pet_mochi");
    let coins = 0;
    if (a === "scritch" && record.mochiCoinsDay !== todayKey()) {
      record.mochiCoinsDay = todayKey();
      coins = MOCHI_SCRITCH_COINS[0] + Math.floor(Math.random() * (MOCHI_SCRITCH_COINS[1] - MOCHI_SCRITCH_COINS[0] + 1));
      this.addCoins(player, coins);
    }
    this.state.toggleables.forEach((prop) => {
      if (prop.kind === "cat" && prop.map === player.map) prop.boost = 2.5; // hearts and purring on the mascot
    });
    this.nearby(sessionId, "emote", { sessionId, emoji: a === "treat" ? "🐟" : "💕" });
    this.sendTo(sessionId, "mochiResult", { action: a, coins, cooldown: false });
  }

  private async refreshLeaderboard() {
    try {
      const top = (await getPlayerStore().topNetWorth(10)).filter((e) => !isBlacklisted(e.username));
      const json = JSON.stringify(top);
      if (json !== this.state.leaderboard) this.state.leaderboard = json;
    } catch (err) {
      console.error("[db] leaderboard query failed:", err instanceof Error ? err.message : err);
    }
  }

  private handleClaimAllowance(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const record = this.records.get(sessionId);
    if (!player || !record) return;
    // net worth, not coins: chips parked at the cage still count
    if (netWorth(player.coins, player.chips) >= ALLOWANCE_BELOW) return;
    const last = record.lastDailyClaim?.getTime() ?? 0;
    if (Date.now() - last < ALLOWANCE_COOLDOWN_S * 1000) {
      this.sendTo(sessionId, "allowance", { ok: false, retryInS: Math.ceil((ALLOWANCE_COOLDOWN_S * 1000 - (Date.now() - last)) / 1000) });
      return;
    }
    record.lastDailyClaim = new Date();
    this.addCoins(player, ALLOWANCE_COINS);
    this.sendTo(sessionId, "allowance", { ok: true, coins: ALLOWANCE_COINS });
    this.nearby(sessionId, "emote", { sessionId, emoji: "🪙" });
    this.persist(sessionId, player, true);
  }

  private handleChat(sessionId: string, raw: unknown) {
    const player = this.state.players.get(sessionId);
    if (!player || typeof raw !== "string") return;
    // eslint-disable-next-line no-control-regex
    const text = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, CHAT_MAX_CHARS);
    if (!text) return;
    const now = Date.now();
    if (now - (this.lastChatAt.get(sessionId) ?? 0) < CHAT_COOLDOWN_MS) return;
    this.lastChatAt.set(sessionId, now);
    this.broadcast("chatBubble", { sessionId, text, map: player.map, username: player.username });
  }

  /** Every world's seats and props, in the one room (their ids are unique across the worlds): each
   *  player uses only those on their own map. */
  private loadAllProps() {
    this.state.chairs.clear();
    this.state.toggleables.clear();
    for (const mapId of Object.keys(MAP_CHAIRS) as MapId[]) {
      for (const chair of MAP_CHAIRS[mapId]) {
        const state = new ChairState();
        state.propId = chair.propId;
        state.map = mapId;
        state.x = chair.x;
        state.z = chair.z;
        state.rotationY = chair.rotationY;
        state.style = chair.style;
        state.sitY = chair.sitY ?? 0;
        this.state.chairs.set(chair.propId, state);
      }
      for (const prop of MAP_TOGGLEABLES[mapId]) {
        const state = new ToggleableState();
        state.propId = prop.propId;
        state.map = mapId;
        state.x = prop.x;
        state.y = prop.y ?? 0;
        state.z = prop.z;
        state.kind = prop.kind;
        state.color = prop.color;
        state.on = prop.defaultOn;
        this.state.toggleables.set(prop.propId, state);
      }
    }
  }

  /** Whether anyone (connected) is on `map`: a world nobody is in stands still. */
  private occupied(map: MapId): boolean {
    let here = false;
    this.state.players.forEach((p) => {
      if (p.connected && p.map === map) here = true;
    });
    return here;
  }

  /** To everyone on `map` (but `except`): a world's own news (its fire, its ducks, its tables). */
  private toMap(map: string, type: string, payload: unknown, except?: string) {
    for (const c of this.clients) {
      if (c.sessionId !== except && this.state.players.get(c.sessionId)?.map === map) c.send(type, payload);
    }
  }

  /** To everyone on the same map as `sessionId` (their emotes and gestures: only they can see them). */
  private nearby(sessionId: string, type: string, payload: unknown) {
    const map = this.state.players.get(sessionId)?.map;
    if (map) this.toMap(map, type, payload);
  }

  // Timed activities: the brew gauge, marshmallow toasting, and campfire flare-ups all advance
  // here so every client sees the same progress instead of each running its own clock.
  private tick(dt: number) {
    const now = Date.now();

    // Debounced persistence: every few seconds, anyone whose wallet, wardrobe or stats moved
    // gets queued for a write (the queue coalesces further). Leaving flushes at once.
    this.persistClock += dt;
    if (this.persistClock >= PERSIST_EVERY_S) {
      this.persistClock = 0;
      this.state.players.forEach((player, sessionId) => this.persist(sessionId, player));
    }
    this.state.players.forEach((player, sessionId) => {
      if (player.fed <= 0) return;
      const until = this.records.get(sessionId)?.fishing.fedUntil ?? 0;
      const left = Math.max(0, Math.ceil((until - now) / 1000));
      if (left !== player.fed) player.fed = left;
    });
    this.boardSweepClock += dt;
    if (this.boardSweepClock >= 1) {
      this.boardSweepClock = 0;
      this.sweepBoardSeats();
    }
    // the channel's scene (its world, the campfire's hearth, the hour), saved when it changes
    this.sceneClock += dt;
    if (this.sceneClock >= SCENE_SAVE_EVERY_S) {
      this.sceneClock = 0;
      void this.saveScene();
    }
    this.leaderboardClock += dt;
    if (this.leaderboardClock >= LEADERBOARD_EVERY_S) {
      this.leaderboardClock = 0;
      void this.refreshLeaderboard();
    }

    // The vibe bonus: coins for time spent together, more when it is a party.
    let here = 0;
    this.state.players.forEach((p) => {
      if (p.connected) here++;
    });
    this.state.players.forEach((player, sessionId) => {
      if (!player.connected) return;
      const since = this.vibeAt.get(sessionId) ?? now;
      if (!this.vibeAt.has(sessionId)) this.vibeAt.set(sessionId, now);
      if (now - since >= VIBE_EVERY_MIN * 60 * 1000) {
        this.vibeAt.set(sessionId, now);
        const coins = Math.round(VIBE_COINS * (here >= VIBE_PARTY_SIZE ? VIBE_PARTY_MULTIPLIER : 1));
        this.addCoins(player, coins);
        this.bumpStat(player, "time_spent_mins", VIBE_EVERY_MIN);
        this.sendTo(sessionId, "vibe", { coins, party: here >= VIBE_PARTY_SIZE });
      }
      // knockdowns wear off; drink auras fade; a fish on the line gets away if nobody reels
      if (player.action === "dizzy" && now >= (this.dizzyUntil.get(sessionId) ?? 0)) {
        this.clearAction(player);
        player.boxHits = 0;
      }
      if (player.aura && now >= (this.auraUntil.get(sessionId) ?? 0)) player.aura = "";
      const line = this.hooked.get(sessionId);
      if (line && now >= line.until) this.handleCatchFish(sessionId, false, 0);
      // soaking in the onsen
      if (player.map === "japanese_onsen" && player.sitting) {
        let inWater = false;
        this.state.chairs.forEach((chair) => {
          if (chair.occupiedBy === sessionId && chair.style === "onsen") inWater = true;
        });
        if (inWater) {
          const soaked = (this.soakSeconds.get(sessionId) ?? 0) + dt;
          this.soakSeconds.set(sessionId, soaked);
          if (soaked >= ONSEN_SOAK_S && soaked - dt < ONSEN_SOAK_S) this.daily(sessionId, player, "soak_onsen");
        }
      }
    });
    this.state.toggleables.forEach((prop) => {
      if (prop.boost > 0) prop.boost = Math.max(0, prop.boost - dt);
      // picked bushes grow back
      const regrow = this.regrowAt.get(prop.propId);
      if (regrow !== undefined && now >= regrow) {
        prop.on = true;
        this.regrowAt.delete(prop.propId);
        if (prop.kind === "sparkle") this.moveSparkle(prop);
        if (prop.kind === "stew") prop.track = 0; // a fresh pot
      }
    });

    this.state.players.forEach((player, sessionId) => {
      if (player.action === "brew") {
        player.actionProgress = Math.min(1, player.actionProgress + dt / BREW_SECONDS);
        if (player.actionProgress >= 1) {
          player.holding = "coffee";
          player.drink = "";
          this.clearAction(player);
          this.daily(sessionId, player, "brew_coffee");
          this.nearby(sessionId, "emote", { sessionId, emoji: "☕" });
          // A barista tip, at most once every ESPRESSO_TIP_COOLDOWN_S so it can't be farmed.
          if (now - (this.lastTipAt.get(sessionId) ?? 0) > ESPRESSO_TIP_COOLDOWN_S * 1000) {
            this.lastTipAt.set(sessionId, now);
            this.addCoins(player, ESPRESSO_TIP);
            this.nearby(sessionId, "emote", { sessionId, emoji: "🪙" });
          }
        }
      } else if (player.action === "afkfish" && isCampMap(player.map)) {
        // feet up, line in: a fish into the creel now and then, the rarer the longer the wait
        // (AFK_CATCH_S; the fish is rolled when the wait starts); the creel full, the rod is stowed
        // and the angler rests (no cast, no bait) until there is room again
        const at = this.fishBiteAt.get(sessionId) ?? now;
        const total = this.afkTotal.get(sessionId) ?? 25000;
        const progress = Math.max(0, Math.min(1, Math.floor((1 - (at - now) / total) * 20) / 20));
        if (progress !== player.actionProgress) player.actionProgress = progress;
        if (now >= at) {
          const species = this.pendingFish.get(sessionId)?.species ?? rollRiverFish("freshwater", { afk: true });
          const worn = this.records.get(sessionId)?.fishing.worn ?? [];
          this.landFish(sessionId, player, rollCatch(species, { afk: true, goldStar: goldStarBonus(worn), heft: heftBonus(worn) }), true, 0);
          if (this.creelIsFull(sessionId)) this.restByTheWater(sessionId, player);
          else {
            this.scheduleCampAfk(sessionId, now);
            player.actionProgress = 0;
          }
        }
      } else if (player.action === "afkfish") {
        // Chill mode: no bites to watch for, a little haul now and then while you chat.
        const at = this.fishBiteAt.get(sessionId) ?? now;
        const total = this.afkTotal.get(sessionId) ?? AFK_FISH_MIN_S * 1000;
        player.actionProgress = Math.max(0, Math.min(1, 1 - (at - now) / total));
        if (now >= at) {
          const roll = Math.random();
          if (roll < 0.4) {
            this.addCoins(player, 5 + Math.floor(Math.random() * 11));
            this.nearby(sessionId, "emote", { sessionId, emoji: "🪙" });
          } else {
            const fish: ItemId = roll < 0.8 ? "sardine" : "clownfish";
            this.addItem(player, fish);
            this.bumpStat(player, "fish_caught");
            this.nearby(sessionId, "emote", { sessionId, emoji: ITEMS[fish].emoji });
          }
          this.scheduleAfkCatch(sessionId, now);
          player.actionProgress = 0;
        }
      } else if (player.action === "roast") {
        player.toast = Math.min(TOAST_MAX, player.toast + dt / ROAST_SECONDS);
      } else if (player.action === "fish") {
        const starlit = this.starlight.has(sessionId);
        const until = this.biteUntil.get(sessionId);
        if (until !== undefined) {
          if (now > until) {
            // too slow: it got away
            this.biteUntil.delete(sessionId);
            player.actionProgress = 0;
            this.nearby(sessionId, "emote", { sessionId, emoji: "💨" });
            if (starlit) this.waitForBite(sessionId, player, false);
            else this.fishBiteAt.set(sessionId, now + randomBiteDelay());
          }
        } else if (starlit && now < (this.fishBiteAt.get(sessionId) ?? 0)) {
          // the wait: ripples round the bobber build as the bite nears (tenths, 0..0.9; 1 is the bite)
          const wait = this.pendingFish.get(sessionId);
          const progress = wait ? Math.min(0.9, Math.floor(((now - wait.castAt) / wait.total) * 10) / 10) : 0;
          if (progress !== player.actionProgress) player.actionProgress = progress;
        } else if (now >= (this.fishBiteAt.get(sessionId) ?? 0)) {
          // Bite! actionProgress = 1 tells every client the float has gone under. On the river the
          // window is STARLIGHT_BITE_S, plus half the angler's round trip (the tap has to get here)
          this.biteUntil.set(sessionId, now + (starlit ? STARLIGHT_BITE_S * 1000 + Math.min(400, player.ping / 2 + 120) : BITE_WINDOW_S * 1000));
          player.actionProgress = 1;
        }
      }
    });

    // each world runs while someone is in it
    if (this.occupied("sunset_beach")) this.tickBall(dt);
    if (this.occupied("campfire_night")) this.tickCampfire(now);
    if (this.occupied("whispering_woods") && !this.occupied("campfire_night")) this.tickCampfire(now);
    this.tickTrees(now);
    this.tickWonder(now);
    if (this.occupied("velvet_casino") || this.occupied("casino_vip")) this.casino.tick(dt);
    // the hour rolls over: the camp's market opens fresh
    const market = parseMarket(this.state.market, now);
    if (JSON.stringify(market) !== this.state.market) this.state.market = JSON.stringify(market);

    if (this.state.autoCycle) {
      this.cycleClock += dt;
      if (this.cycleClock >= AUTO_CYCLE_SECONDS) {
        this.cycleClock = 0;
        const i = TIMES_OF_DAY.indexOf(this.state.timeOfDay);
        this.state.timeOfDay = TIMES_OF_DAY[(i + 1) % TIMES_OF_DAY.length];
        // and the sky may change its mind: a shower rolls in, or blows over
        if (this.state.weather === "clear" ? Math.random() < RAIN_START_CHANCE : Math.random() < RAIN_STOP_CHANCE) this.state.weather = this.state.weather === "clear" ? "rain" : "clear";
      }
    }
  }

  // --- wallet helpers ---
  private addCoins(player: Player, amount: number) {
    player.coins = Math.max(0, Math.min(COIN_CAP, player.coins + amount));
  }

  private addItem(player: Player, item: ItemId) {
    const bag = parseBag(player.bag);
    bag[item] = Math.min(99, (bag[item] ?? 0) + 1);
    player.bag = encodeBag(bag);
  }

  /** A gesture the server plays on someone (a chop, a pluck): everyone sees it. */
  private playGesture(sessionId: string, gesture: Gesture) {
    this.nearby(sessionId, "gesture", { sessionId, gesture });
  }

  private handleGesture(sessionId: string, gesture: unknown) {
    if (!isGesture(gesture) || SERVER_GESTURES.has(gesture)) return;
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const now = Date.now();
    if (now - (this.lastGestureAt.get(sessionId) ?? 0) < GESTURE_COOLDOWN_MS) return;
    this.lastGestureAt.set(sessionId, now);
    this.nearby(sessionId, "gesture", { sessionId, gesture });
    this.nearby(sessionId, "emote", { sessionId, emoji: GESTURE_EMOJI[gesture] });
  }

  private handleBuyHat(sessionId: string, hat: unknown) {
    const player = this.state.players.get(sessionId);
    if (!player || !isPremiumHat(hat)) return;
    const owned = player.owned ? player.owned.split(",") : [];
    if (owned.includes(hat)) return;
    if (!this.atBoutique(sessionId, player)) return;
    const price = PREMIUM_HATS[hat].price;
    if (player.coins < price) return;
    player.coins -= price;
    player.owned = [...owned, hat].join(",");
    this.nearby(sessionId, "emote", { sessionId, emoji: PREMIUM_HATS[hat].emoji });
  }

  private handleReelIn(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || (player.action !== "fish" && player.action !== "afkfish" && player.action !== "reel")) return;
    // Stop fishing: the bite mini-game itself is "hook" then "catch_fish".
    this.clearAction(player);
    this.fishBiteAt.delete(sessionId);
    this.biteUntil.delete(sessionId);
    this.hooked.delete(sessionId);
    this.starlight.delete(sessionId);
    this.starReels.delete(sessionId);
    this.pendingFish.delete(sessionId);
  }

  // --- the campfire: roasting, starlight fishing and the guitar ------------------------------------

  /** Whether `player` stands (or sits) within `reach` of a prop of `kind` on this map. */
  private nearProp(player: Player, kind: string, reach: number): boolean {
    let near = false;
    this.state.toggleables.forEach((prop) => {
      if (prop.kind === kind && prop.map === player.map && Math.hypot(player.x - prop.x, player.z - prop.z) <= reach) near = true;
    });
    return near;
  }

  /**
   * Campfire coins, paid within the day's cap (CAMPFIRE_DAILY_COINS): the river and the fire stay
   * fun all evening without flooding the economy. Returns what was actually paid.
   */
  private campfirePay(sessionId: string, player: Player, kind: CampfireCoinKind, coins: number): number {
    const record = this.records.get(sessionId);
    if (!record) return 0;
    const today = todayKey();
    if (record.campfireCoins.day !== today) record.campfireCoins = emptyCampfireCoins(today);
    const lucky = Math.round(coins * (hasCozyAura(this.state.fuel) ? 1 + COZY_AURA_LUCK : 1));
    const paid = Math.max(0, Math.min(lucky, CAMPFIRE_DAILY_COINS[kind] - record.campfireCoins[kind]));
    if (paid > 0) {
      record.campfireCoins[kind] += paid;
      this.addCoins(player, paid);
    }
    return paid;
  }

  private handleCampfire(client: Client, packet: CampfirePacket) {
    const sessionId = client.sessionId;
    const player = this.state.players.get(sessionId);
    if (!player || !packet || typeof packet !== "object") return;
    // the drawers' own changes (a fish locked, gear put on, the rod, bait or axe in hand) work on
    // every map, as the drawers do; everything else happens at the camp
    const anywhere = packet.type === "GEAR" || (packet.type === "BARNABY" && (packet.op === "lockFish" || packet.op === "equipRod" || packet.op === "equipBait")) || (packet.type === "BUSTER" && packet.op === "equipAxe");
    if (!isCampMap(player.map) && !anywhere) return;
    switch (packet.type) {
      case "ROAST_START": {
        // from beside the fire or from a log bench round it (a little slack for latency)
        if (!isRoastFood(packet.food) || (player.action !== "" && player.action !== "guitar")) return;
        if (!this.nearProp(player, "bonfire", BONFIRE_REACH + 0.3)) return;
        if (this.state.fuel <= 0) {
          client.send("campfireNotice", { message: "The bonfire's out! Relight it with a log first", emoji: "🔥" });
          return;
        }
        if (Date.now() - (this.lastRoastAt.get(sessionId) ?? 0) < ROAST_COOLDOWN_MS) return;
        // the dial: one sweep over `duration`, a green zone somewhere past halfway; the server keeps
        // the clock, so the result is its call
        const duration = 3.0 + Math.random() * 0.8;
        const width = 0.13 + Math.random() * 0.04;
        const zoneFrom = 0.5 + Math.random() * (0.86 - width - 0.5);
        const roast = { food: packet.food, startedAt: Date.now(), duration, zoneFrom, zoneTo: zoneFrom + width };
        this.roasts.set(sessionId, roast);
        this.snackUntil.delete(sessionId);
        player.drink = "";
        player.holding = "skewer";
        player.snack = encodeSnack(packet.food, "raw");
        player.action = "grill";
        player.actionProgress = 0;
        const start: RoastStart = { duration, zoneFrom, zoneTo: roast.zoneTo };
        client.send("roastStart", start);
        return;
      }
      case "ROAST_STOP": {
        const roast = this.roasts.get(sessionId);
        if (!roast || player.action !== "grill") return;
        // judged on when you pressed, not when it got here: half the round trip back
        const at = (Date.now() - Math.min(250, player.ping / 2) - roast.startedAt) / (roast.duration * 1000);
        const quality: RoastQuality = at < roast.zoneFrom - 0.01 ? "raw" : at <= roast.zoneTo + 0.01 ? "golden" : "charred";
        this.finishRoast(sessionId, player, quality);
        return;
      }
      case "STARGAZE": {
        if (!packet.on) {
          if (player.action === "stargaze") this.stopStargazing(sessionId, player);
          return;
        }
        if (player.sitting || (player.action !== "" && player.action !== "stargaze")) return;
        if (!this.nearProp(player, "telescope", STARGAZE_REACH + 0.4)) return;
        player.action = "stargaze";
        player.actionProgress = 0;
        // the first shower comes quickly, so the lens never feels empty for long
        const now = Date.now();
        this.stargazers.set(sessionId, { next: now + 1500 + Math.random() * 1000, since: now, stars: new Map(), combo: 0, traced: new Set() });
        return;
      }
      case "STAR_CATCH": {
        const gazer = this.stargazers.get(sessionId);
        const until = gazer?.stars.get(packet.id);
        if (!gazer || until === undefined || player.action !== "stargaze" || Date.now() > until) return;
        gazer.stars.delete(packet.id);
        // one after another without letting one go: the chain grows, and so does the multiplier
        gazer.combo += 1;
        const multiplier = starComboMultiplier(gazer.combo);
        const coins = this.campfirePay(sessionId, player, "star", STAR_SPARK_COINS * multiplier);
        const caught: StarCaught = { sessionId, coins, capped: coins === 0, combo: gazer.combo, multiplier };
        client.send("starCaught", caught);
        this.nearby(sessionId, "emote", { sessionId, emoji: "🌠" });
        this.persist(sessionId, player);
        return;
      }
      case "CONSTELLATION": {
        const gazer = this.stargazers.get(sessionId);
        const shape = CONSTELLATIONS.find((c) => c.id === packet.id);
        if (!gazer || !shape || player.action !== "stargaze" || gazer.traced.has(shape.id)) return;
        // traced star by star: not believed faster than a person could
        if (Date.now() - gazer.since < CONSTELLATION_MIN_S * 1000) return;
        gazer.traced.add(shape.id);
        gazer.since = Date.now(); // the next one takes its own time
        const coins = this.campfirePay(sessionId, player, "star", CONSTELLATION_COINS);
        const done: ConstellationDone = { sessionId, id: shape.id as ConstellationId, coins, capped: coins === 0 };
        client.send("constellationDone", done);
        this.nearby(sessionId, "emote", { sessionId, emoji: shape.emoji });
        this.persist(sessionId, player);
        return;
      }
      case "CHOP_START": {
        if (player.sitting || player.action !== "") return;
        this.startFelling(client, player, typeof packet.tree === "string" ? packet.tree : "");
        return;
      }
      case "REEL_DONE": {
        this.finishStarlightReel(sessionId, packet.caught === true, packet.treasure === true);
        return;
      }
      case "SPLIT_WOOD": {
        this.splitWood(sessionId, player, packet.wood);
        return;
      }
      case "SLINGSHOT_START": {
        if (player.map !== "campfire_night" || player.sitting || Math.hypot(player.x - GALLERY_FRONT.x, player.z - GALLERY_FRONT.z) > 2.4) return;
        const now = Date.now();
        // the paid rounds are counted by account (leaving and coming back doesn't reset them)
        const recent = (this.slingPaidAt.get(player.userId) ?? []).filter((at) => now - at < 3_600_000);
        const paid = recent.length < SLINGSHOT_PAID_ROUNDS_PER_HOUR;
        if (paid) recent.push(now);
        this.slingPaidAt.set(player.userId, recent);
        const seed = Math.floor(Math.random() * 2 ** 31);
        this.slingRounds.set(sessionId, { seed, startedAt: now, paid });
        client.send("slingshotStarted", { seed, paid, left: SLINGSHOT_PAID_ROUNDS_PER_HOUR - recent.length } satisfies SlingshotStarted);
        return;
      }
      case "SLINGSHOT_END": {
        this.endSlingshot(sessionId, player, packet.shots);
        return;
      }
      case "ADD_FUEL": {
        if (player.map !== "campfire_night") return;
        const item = isWoodKind(packet.item) || packet.item === "sawdust" || packet.item === "firewood" || packet.item === "shavings" ? packet.item : "pine";
        const profile = this.records.get(sessionId)?.fishing;
        if (!profile || player.action === "grill") return;
        if (!this.nearProp(player, "bonfire", BONFIRE_REACH + 0.5)) {
          client.send("campfireNotice", { message: "Walk over to the bonfire to feed it", emoji: "🔥" });
          return;
        }
        if (!((item === "sawdust" ? profile.sawdust : item === "firewood" ? profile.firewood : item === "shavings" ? (profile.byproducts.shavings ?? 0) : profile.wood[item]) > 0)) return;
        if (this.state.fuel >= FUEL_MAX) {
          client.send("campfireNotice", { message: "The fire's already roaring! Save that for later", emoji: "🔥" });
          return;
        }
        if (item === "sawdust") profile.sawdust -= 1;
        else if (item === "firewood") profile.firewood -= 1;
        else if (item === "shavings") profile.byproducts.shavings = (profile.byproducts.shavings ?? 1) - 1;
        else takeLogs(profile, item, 1);
        this.saveFishing(sessionId, player);
        const amount = item === "sawdust" ? SAWDUST_FUEL : item === "firewood" ? FIREWOOD_FUEL : item === "shavings" ? (BYPRODUCTS.shavings.fuel ?? 0) : WOOD[item].fuel;
        this.state.fuel = Math.min(FUEL_MAX, this.state.fuel + amount);
        const update: BonfireUpdate = { fuel: this.state.fuel, sessionId, item, amount };
        this.toMap("campfire_night", "BONFIRE_STATE_UPDATE", update);
        if (!player.sitting) this.playGesture(sessionId, "toss");
        this.nearby(sessionId, "emote", { sessionId, emoji: "🔥" });
        return;
      }
      case "STEW_ADD": {
        if (player.map !== "campfire_night" || player.action === "grill" || !this.nearProp(player, "bonfire", BONFIRE_REACH + 0.5)) return;
        const stew = parseStew(this.state.stew);
        if (stew.phase !== "gathering" || stew.items.length >= STEW_SLOTS) return;
        const kind = packet.ingredient;
        let fish: FishId | undefined;
        if (kind === "fish") {
          const profile = this.records.get(sessionId)?.fishing;
          const slot = Math.floor(Number(packet.slot));
          const f = profile?.creel[slot];
          if (!profile || !f) return;
          if (f.l) {
            this.sendTo(sessionId, "campfireNotice", { message: `Your ${FISH[f.s].name} is locked: unlock it in the livewell to cook it`, emoji: "🔒" });
            return;
          }
          profile.creel.splice(slot, 1);
          fish = f.s;
          this.saveFishing(sessionId, player);
        } else if (kind === "log") {
          // the humblest wood in the carrier goes under the cauldron
          const profile = this.records.get(sessionId)?.fishing;
          const wood = profile && WOOD_KINDS.slice().sort((a, b) => WOOD[a].sell - WOOD[b].sell).find((k) => (profile.wood[k] ?? 0) > 0);
          if (!profile || !wood) return;
          takeLogs(profile, wood, 1);
          this.saveFishing(sessionId, player);
        } else if (kind === "mushroom" || kind === "berry") {
          const bag = parseBag(player.bag);
          if (!((bag[kind] ?? 0) > 0)) return;
          bag[kind] = (bag[kind] ?? 0) - 1;
          if (!bag[kind]) delete bag[kind];
          player.bag = encodeBag(bag);
        } else return;
        stew.items.push(fish ? { kind, by: player.username, fish } : { kind, by: player.username });
        if (stew.items.length >= STEW_SLOTS || isCampfireStew(stew.items)) {
          stew.phase = "cooking";
          stew.progress = 0;
          this.stewCookAt = Date.now();
        }
        this.setStew(stew, "add", sessionId);
        this.nearby(sessionId, "emote", { sessionId, emoji: fish ? FISH[fish].emoji : kind === "berry" ? "🫐" : kind === "log" ? "🪵" : "🍄" });
        return;
      }
      case "STEW_SCOOP": {
        if (!this.nearProp(player, "bonfire", BONFIRE_REACH + 0.5)) return;
        const stew = parseStew(this.state.stew);
        if (stew.phase !== "ready" || stew.servings <= 0 || stew.served.includes(player.userId)) return;
        stew.servings -= 1;
        stew.served.push(player.userId);
        this.feed(sessionId, player);
        this.nearby(sessionId, "emote", { sessionId, emoji: "🥣" });
        if (stew.servings <= 0) {
          this.stewReadyAt = 0;
          this.setStew(emptyStew(), "scoop", sessionId);
        } else this.setStew(stew, "scoop", sessionId);
        return;
      }
      case "PICNIC_PLACE": {
        const snack = parseSnack(player.snack);
        if (player.holding !== "skewer" || !snack || player.action === "grill" || !this.nearPicnic(player)) return;
        const plates = parsePicnic(this.state.picnic);
        if (plates.length >= PICNIC_PLATES) {
          client.send("campfireNotice", { message: "The picnic table's full of skewers already!", emoji: "🍢" });
          return;
        }
        plates.push({ food: snack.food, quality: snack.quality, by: player.username });
        this.picnicAt.push(Date.now());
        this.state.picnic = JSON.stringify(plates);
        player.holding = "";
        player.snack = "";
        this.snackUntil.delete(sessionId);
        if (!player.sitting) this.playGesture(sessionId, "reach");
        this.nearby(sessionId, "emote", { sessionId, emoji: "🍢" });
        return;
      }
      case "PICNIC_TAKE": {
        if (!this.nearPicnic(player) || (player.action !== "" && player.action !== "guitar")) return;
        const plates = parsePicnic(this.state.picnic);
        const k = Math.floor(Number(packet.plate));
        const plate = plates[k];
        if (!plate) return;
        plates.splice(k, 1);
        this.picnicAt.splice(k, 1);
        this.state.picnic = plates.length ? JSON.stringify(plates) : "";
        player.drink = "";
        player.holding = "skewer";
        player.snack = encodeSnack(plate.food, plate.quality);
        this.snackUntil.set(sessionId, Date.now() + SNACK_SECONDS * 1000);
        this.feed(sessionId, player);
        this.nearby(sessionId, "emote", { sessionId, emoji: "😋" });
        return;
      }
      case "AFK": {
        let seatId = "";
        this.state.chairs.forEach((chair) => {
          if (chair.occupiedBy === sessionId) seatId = chair.propId;
        });
        // the campfire: from a dock seat or the canoe; the woods: at a bank spot (standing, or on its
        // log or rock)
        const woodsSpot = player.map === "whispering_woods" ? (woodsSpotOfSeat(seatId) ?? (!player.sitting ? this.woodsSpotAt(player) : undefined)) : undefined;
        if (!spotOfSeat(seatId) && !woodsSpot) return;
        if (woodsSpot) {
          // one angler to a spot on the bank
          const holder = this.rapidsAnglers.get(woodsSpot);
          if (holder && holder !== sessionId && this.state.players.get(holder)?.map === "whispering_woods") {
            client.send("campfireNotice", { message: "Someone's fishing that spot. Try the next one along the bank", emoji: "🎣" });
            return;
          }
          this.rapidsAnglers.set(woodsSpot, sessionId);
        }
        if (!packet.on) {
          if (player.action === "rest") return;
          if (player.action !== "afkfish") return;
          // back to watching the bobber
          this.afkTotal.delete(sessionId);
          player.action = "fish";
          this.starlight.add(sessionId);
          this.waitForBite(sessionId, player, false);
          return;
        }
        if (player.action !== "" && player.action !== "fish" && player.action !== "rest") return;
        // the pre-cast guard: no room in the creel, no cast (and no bait spent)
        if (this.creelIsFull(sessionId)) {
          if (player.action !== "rest") this.restByTheWater(sessionId, player);
          else client.send("campfireNotice", { message: "Your livewell's still full: sell some fish to Barnaby or Bramble first", emoji: "🪣" });
          return;
        }
        if (player.action === "rest") this.putMugAway(player);
        this.biteUntil.delete(sessionId);
        this.pendingFish.delete(sessionId);
        this.starlight.delete(sessionId);
        player.action = "afkfish";
        player.actionProgress = 0;
        this.scheduleCampAfk(sessionId, Date.now());
        return;
      }
      case "BARNABY": {
        this.handleBarnaby(sessionId, player, packet);
        return;
      }
      case "BUSTER": {
        this.handleBuster(sessionId, player, packet);
        return;
      }
      case "GEAR": {
        this.handleGear(sessionId, player, packet);
        return;
      }
      case "WORKBENCH": {
        this.handleWorkbench(sessionId, player, packet);
        return;
      }
      case "CHOP_CANCEL": {
        if (player.action === "chop") this.cancelFell(sessionId, player);
        return;
      }
      case "CHOP_STOP": {
        const fell = this.fells.get(sessionId);
        if (!fell || player.action !== "chop") return;
        // judged on when you swung: the time on your ring at the press, as long as it is one the
        // connection could have given (the ring reached you up to a round trip after it started
        // here, and the swing took up to half of one to arrive); otherwise, on this clock less
        // half a round trip
        const raw = (Date.now() - fell.startedAt) / 1000;
        if (raw < -0.05) return; // (the ring hasn't started yet: the round's pause)
        const rtt = Math.min(1, Math.max(0, player.ping) / 1000);
        const told = typeof packet.t === "number" && Number.isFinite(packet.t) ? packet.t : NaN;
        const t = told <= raw + 0.05 && told >= raw - rtt - 0.35 ? told : raw - rtt / 2;
        this.landFellSwing(client, player, fell, judgeFell(fell.swing, Math.max(0, t)));
        return;
      }
      case "GUITAR": {
        if (!packet.playing) {
          if (player.action === "guitar") this.clearAction(player);
          return;
        }
        let onLog = false;
        this.state.chairs.forEach((chair) => {
          if (chair.occupiedBy === sessionId && chair.style === "log") onLog = true;
        });
        if (!player.sitting || !onLog || player.action !== "") return;
        player.action = "guitar";
        player.actionProgress = 0;
        return;
      }
    }
  }

  /** The skewer comes off the fire: raw, golden (paid) or charred. The rest is eaten away. */
  private finishRoast(sessionId: string, player: Player, quality: RoastQuality) {
    const roast = this.roasts.get(sessionId);
    if (!roast) return;
    this.roasts.delete(sessionId);
    const now = Date.now();
    this.lastRoastAt.set(sessionId, now);
    player.snack = encodeSnack(roast.food, quality);
    player.action = "";
    player.actionProgress = 0;
    this.snackUntil.set(sessionId, now + SNACK_SECONDS * 1000);
    this.feed(sessionId, player);
    let coins = 0;
    if (quality === "golden") {
      coins = this.campfirePay(sessionId, player, "roast", ROAST_GOLDEN_COINS);
      this.bumpStat(player, "marshmallows_roasted");
      this.daily(sessionId, player, "roast_marshmallow");
    }
    const result: RoastResult = { sessionId, food: roast.food, quality, coins, capped: quality === "golden" && coins === 0 };
    this.toMap("campfire_night", "roastResult", result);
    this.nearby(sessionId, "emote", { sessionId, emoji: quality === "golden" ? "🤩" : quality === "charred" ? "😵" : "😋" });
    this.persist(sessionId, player);
  }

  // --- felling (shared/chop.ts): the radial swings, the trees' damage, their drops ---------------

  /** A tree to fell (the one named, on your map, within reach): standing grown, nobody else at it,
   *  an axe of its tier (a Titan takes any), room in the carrier. Then its first swing's ring. */
  private startFelling(client: Client, player: Player, nodeId: string) {
    const sessionId = client.sessionId;
    const node = fellTreeOf(nodeId);
    if (!node || node.map !== player.map) return;
    if (Math.hypot(player.x - node.x, player.z - node.z) > fellReach(node) + 0.6) return;
    if (Date.now() < (this.lastChopAt.get(sessionId) ?? 0) + CHOP_COOLDOWN_MS) return;
    const tree = this.trees.get(node.id);
    const info = TREES[node.kind];
    const name = node.titan ? TITAN.name : info.name;
    if (!tree || tree.stage !== "mature") {
      client.send("campfireNotice", { message: node.titan ? "No Titan stands here now" : `That ${name} is still growing back`, emoji: "🌱" });
      return;
    }
    if ([...this.fells.entries()].some(([id, f]) => f.tree === node.id && id !== sessionId)) {
      client.send("campfireNotice", { message: `Someone's already felling that ${name}`, emoji: "🪓" });
      return;
    }
    const profile = this.records.get(sessionId)?.fishing;
    if (!profile) return;
    const axe = AXES[profile.axe];
    if (!node.titan && axe.tier < info.tier) {
      const from = info.tier >= 4 ? "Bramble at his cabin" : "Buster at the campfire";
      client.send("campfireNotice", { message: `Your ${axe.name} (T${axe.tier}) can't bite into ${name}: it takes a T${info.tier} axe or better (${from} sells them)`, emoji: "🪓" });
      return;
    }
    if (carrierLoad(profile) >= carrierCap(profile)) {
      client.send("campfireNotice", { message: `Your wood carrier is full (${carrierLoad(profile)}/${carrierCap(profile)}): split some into Firewood, sell it, or burn it`, emoji: "🪵" });
      return;
    }
    // the Dryad's Sprout Amulet: now and then the tree grows as you set your axe to it (once a growth)
    if (!node.titan && tree.dmg === 0 && !tree.grown && Math.random() < dryadChance(profile.worn)) {
      tree.grown = true;
      tree.scale = Math.round((tree.scale + DRYAD_GROWTH) * 100) / 100;
      this.syncTrees();
      client.send("campfireNotice", { message: `🌱 Your Dryad's Sprout Amulet glows: the ${name} grows before your eyes (now ${tree.scale.toFixed(2)}x)`, emoji: "🌱" });
    }
    player.action = "chop";
    player.actionProgress = tree.dmg / tree.rounds;
    this.sendFellSwing(client, node, 0);
  }

  /** The tree's next swing: a fresh ring, its clock starting after `pauseS` (the chips of the round
   *  before settling on the client too). */
  private sendFellSwing(client: Client, node: FellTree, pauseS: number) {
    const tree = this.trees.get(node.id);
    if (!tree) return;
    const profile = this.records.get(client.sessionId)?.fishing;
    const eagle = (profile?.eagleUntil ?? 0) > Date.now() ? EAGLE_EYE_ZONE : 0;
    const worn = profile?.worn ?? [];
    const swing = rollFellSwing(node.id, node.kind, tree.dmg + 1, tree.rounds, profile?.axe ?? "rusty", Math.random, goldBonus(worn), eagle, node.titan, feltRingSlow(worn));
    this.fells.set(client.sessionId, { tree: node.id, swing, startedAt: Date.now() + pauseS * 1000 });
    client.send("fellSwing", { ...swing, pause: pauseS });
  }

  /** A swing lands (gold, hit or miss). A hit deepens the notch: the round's drop, and on its last
   *  round, down the tree comes. A miss: swing again. */
  private landFellSwing(client: Client, player: Player, fell: { tree: string; swing: FellSwing; startedAt: number }, verdict: FellVerdict) {
    const sessionId = client.sessionId;
    const node = FELL_TREE_AT.get(fell.tree);
    const tree = this.trees.get(fell.tree);
    const profile = this.records.get(sessionId)?.fishing;
    if (!node || !tree || !profile || tree.stage !== "mature") {
      this.cancelFell(sessionId, player);
      return;
    }
    this.playGesture(sessionId, "chop");
    let bonus: FellResult["bonus"] = "";
    let coins = 0;
    let drop: FellDrop = { kind: "none", name: "", emoji: "", count: 0 };
    let felled = false;
    let capped = false;
    // the Titan-Grip Gauntlets: a miss still deepens the notch (but drops nothing)
    const grip = verdict === "miss" && missDeepens(profile.worn);
    if (grip) {
      tree.dmg = Math.min(tree.rounds, tree.dmg + 1);
      felled = tree.dmg >= tree.rounds;
    }
    // the Ancient Ring of Oak: a tree struck gold grows back sooner
    if (verdict === "gold" && quickRegrow(profile.worn) > 0) tree.quick = true;
    if (verdict !== "miss") {
      tree.dmg = Math.min(tree.rounds, tree.dmg + 1);
      if (verdict === "gold" && Math.random() < FELL_CRIT_CHANCE) {
        // a critical: a coin or two toward the day's felling coins, or (those all earned) a Pine Resin
        const paid = this.campfirePay(sessionId, player, "chop", FELL_CRIT_COINS);
        if (paid > 0) {
          bonus = "coins";
          coins += paid;
        } else {
          bonus = "resin";
          profile.resin = Math.min(999, profile.resin + 1);
        }
      }
      drop = this.fellDrop(profile, node, tree.scale);
      felled = tree.dmg >= tree.rounds;
    }
    const dmg = tree.dmg;
    player.actionProgress = dmg / tree.rounds;
    if (felled) {
      const want = node.titan ? FELL_COINS[5] * 2 : FELL_COINS[TREES[node.kind].tier];
      const paid = this.campfirePay(sessionId, player, "chop", want);
      capped = paid === 0;
      coins += paid;
      const heavy = this.fellTree(sessionId, player, node, profile);
      if (heavy) drop = heavy;
    }
    this.saveFishing(sessionId, player);
    const result: FellResult = { sessionId, tree: node.id, kind: node.kind, verdict, dmg, rounds: tree.rounds, drop, bonus, coins, felled, capped, ...(grip ? { grip: true } : {}) };
    client.send("fellResult", result);
    this.syncTrees();
    if (felled) {
      this.fells.delete(sessionId);
      this.lastChopAt.set(sessionId, Date.now());
      player.action = "";
      player.actionProgress = 0;
      this.nearby(sessionId, "emote", { sessionId, emoji: "🌲" });
      this.persist(sessionId, player);
    } else {
      // the next swing: after the round's chips have flown (a miss: at once)
      this.sendFellSwing(client, node, verdict === "miss" && !grip ? 0.15 : FELL_ROUND_PAUSE_S);
    }
  }

  /** A round's drop: a log (its wood, worth its tree's size squared) as often as its tier allows,
   *  else the tier's by-product (Birch Bark, Amber Resin, Golden Leaf Amber, Ancient Wood Shavings),
   *  into its own pouch. A full carrier takes no log (the by-product still comes). A Titan's rounds
   *  shed Golden Leaf Amber (its heavy logs come when it falls). */
  private fellDrop(profile: FishingProfile, node: FellTree, scale: number): FellDrop {
    const info = TREES[node.kind];
    const pouch = (id: keyof typeof BYPRODUCTS): FellDrop => {
      profile.byproducts[id] = Math.min(999, (profile.byproducts[id] ?? 0) + 1);
      return { kind: "byproduct", name: BYPRODUCTS[id].name, emoji: BYPRODUCTS[id].emoji, count: 1 };
    };
    if (node.titan) return pouch("leafAmber");
    const room = carrierCap(profile) - carrierLoad(profile);
    if (room > 0 && Math.random() < info.logChance) {
      const mult = logMultiplier(scale);
      // the Deerskin Felling Gloves: now and then a second log off the same round
      const n = room > 1 && Math.random() < bonusLogChance(profile.worn) ? 2 : 1;
      addLogs(profile, info.wood, n, mult);
      const drop: FellDrop = { kind: "log", name: WOOD[info.wood].name, emoji: WOOD[info.wood].emoji, wood: info.wood, mult: Math.round(mult * 100) / 100, count: n };
      // the Amber Resin Band: the tree's by-product too, now and then
      if (info.byproduct && Math.random() < byproductBonus(profile.worn)) {
        const extra = pouch(info.byproduct);
        drop.also = { name: extra.name, emoji: extra.emoji };
      }
      return drop;
    }
    // no log this round (its luck, or a full carrier): the tier's by-product (a T1 pine has none)
    return info.byproduct ? pouch(info.byproduct) : { kind: "none", name: "", emoji: "", count: 0 };
  }

  /** Down it comes: a stump as wide as its trunk (it grows back, a new size), the Logbook's records,
   *  and for everyone on its world, the fall. A Colossal Titan: its heavy logs (worth 3x each, as
   *  many as the carrier holds), and the wonder is over. */
  private fellTree(sessionId: string, player: Player, node: FellTree, profile: FishingProfile): FellDrop | null {
    const tree = this.trees.get(node.id);
    if (!tree) return null;
    const scale = tree.scale;
    profile.felled[node.kind] = Math.min(999_999, (profile.felled[node.kind] ?? 0) + 1);
    profile.trunkRecord[node.kind] = Math.max(profile.trunkRecord[node.kind] ?? 0, trunkCm(node.kind, scale));
    this.toMap(node.map, "treeFelled", { sessionId, tree: node.id, kind: node.kind, scale } satisfies TreeFelled);
    let heavy: FellDrop | null = null;
    if (node.titan) {
      const wood = TREES[node.kind].wood;
      const logs = rollTreeRounds(TITAN.logs);
      const room = Math.max(0, carrierCap(profile) - carrierLoad(profile));
      const got = Math.min(logs, room);
      addLogs(profile, wood, got, TITAN.mult);
      heavy = { kind: "log", name: `heavy ${WOOD[wood].name}`, emoji: WOOD[wood].emoji, wood, mult: TITAN.mult, count: got };
      this.trees.delete(node.id);
      this.broadcast("campfireNotice", { message: `${player.username} felled the Colossal Titan! ${got} heavy logs${got < logs ? ` (their carrier held ${got} of ${logs})` : ""}`, emoji: "🪓" });
      this.endWonder(true);
    } else {
      tree.stage = "stump";
      // (struck gold with the Ancient Ring of Oak: it starts a fifth of the way back already)
      tree.fellAt = Date.now() - (tree.quick ? 0.2 * TREES[node.kind].respawnS * 1000 : 0);
      tree.quick = false;
      tree.dmg = 0;
    }
    this.fells.forEach((f, id) => {
      if (f.tree === node.id && id !== sessionId) this.cancelFell(id, this.state.players.get(id));
    });
    return heavy;
  }

  /** Stop felling (walked off, left): the tree keeps its notch for whoever comes next. */
  private cancelFell(sessionId: string, player: Player | undefined) {
    const fell = this.fells.get(sessionId);
    this.fells.delete(sessionId);
    // (the feller's panel closes: its ring would only be swung at nothing now)
    if (fell) this.sendTo(sessionId, "fellStop", { tree: fell.tree });
    if (player && player.action === "chop") {
      player.action = "";
      player.actionProgress = 0;
    }
  }

  /** Every tree standing grown at the start, each a size of its own (a saved scene may say otherwise). */
  private initTrees() {
    for (const node of FELL_TREES) {
      if (node.titan) continue;
      this.trees.set(node.id, { stage: "mature", scale: rollTreeScale(), dmg: 0, rounds: rollTreeRounds(TREES[node.kind].rounds), fellAt: 0 });
    }
    this.syncTrees();
  }

  /** The felled trees growing back (stump, sprout, sapling, then grown again: a new size and number
   *  of rounds), a second at a time. */
  private tickTrees(now: number) {
    if (now - this.treeTickAt < 1000) return;
    this.treeTickAt = now;
    let changed = false;
    this.trees.forEach((tree, id) => {
      if (tree.stage === "mature") return;
      const node = FELL_TREE_AT.get(id);
      if (!node) return;
      const stage = treeStage(regrowth(node.kind, (now - tree.fellAt) / 1000));
      if (stage === tree.stage) return;
      changed = true;
      tree.stage = stage;
      if (stage === "mature") {
        tree.scale = rollTreeScale();
        tree.rounds = rollTreeRounds(TREES[node.kind].rounds);
        tree.dmg = 0;
        tree.fellAt = 0;
        tree.grown = false;
      }
    });
    if (changed) this.syncTrees();
    // an angler on the woods' bank who walked off (or left the woods) lets the spot go
    this.rapidsAnglers.forEach((sessionId, spotId) => {
      const p = this.state.players.get(sessionId);
      const spot = FOREST_FISHING.find((f) => f.propId === spotId);
      const fishing = p && p.map === "whispering_woods" && (p.action === "fish" || p.action === "reel" || p.action === "rest" || p.action === "afkfish");
      if (!p || !spot || !fishing) {
        this.rapidsAnglers.delete(spotId);
        return;
      }
      if (Math.hypot(p.x - spot.stand.x, p.z - spot.stand.z) > FISHING_REACH + 1.2) {
        this.rapidsAnglers.delete(spotId);
        this.putMugAway(p);
        this.afkTotal.delete(sessionId);
        this.stopStarlight(sessionId, p);
      }
    });
  }

  /** The trees as the room syncs them, and each tree prop's `on` (a grown tree, or a standing Titan:
   *  only those take a click). */
  private syncTrees() {
    const out: Record<string, { stage: TreeStage; scale: number; dmg: number; rounds: number }> = {};
    this.trees.forEach((t, id) => {
      out[id] = { stage: t.stage, scale: t.scale, dmg: t.dmg, rounds: t.rounds };
    });
    const next = JSON.stringify(out);
    if (next !== this.state.trees) this.state.trees = next;
    for (const node of FELL_TREES) {
      const prop = this.state.toggleables.get(`tree_${node.id}`);
      const on = this.trees.get(node.id)?.stage === "mature";
      if (prop && prop.on !== on) prop.on = on;
    }
  }

  // --- the living wonders: one at a time, every 45-60 minutes -----------------------------------

  /** The room's own clock for its wonders (production included): every 45-60 minutes while anyone is
   *  here, a King-Size Surge and a Colossal Titan in turn. A surge lasts four minutes; a Titan stands
   *  until someone fells it (and the next wonder waits for that). */
  private tickWonder(now: number) {
    const ev = parseWorldEvent(this.state.worldEvent);
    // Finley's Lucky Bell: thirty seconds before a surge, its wearers hear where it will be
    if (!ev && this.lastWonder === "titan" && this.nextWonderAt > 0 && now >= this.nextWonderAt - LUCKY_BELL_WARN_S * 1000 && this.bellRungFor !== this.nextWonderAt) {
      this.bellRungFor = this.nextWonderAt;
      this.nextSurgeSpot = this.pickSurgeSpot();
      const where = this.nextSurgeSpot.map === "campfire_night" ? "by the campfire's dock" : "on the Whispering Woods' river";
      this.clients.forEach((c) => {
        if (hasLuckyBell(this.records.get(c.sessionId)?.fishing.worn ?? [])) c.send("campfireNotice", { message: `Your Lucky Bell is ringing! A King-Size Surge in ${LUCKY_BELL_WARN_S} seconds, ${where}`, emoji: "🔔" });
      });
    }
    if (ev && ev.until > 0 && now > ev.until) {
      this.endWonder(true);
    } else if (!ev && now >= this.nextWonderAt && this.clients.length > 0) {
      this.startWonder(this.lastWonder === "surge" ? "titan" : "surge");
    }
  }

  /** A King-Size Surge on a stretch of water (a fishing spot's, at the campfire or in the woods), or
   *  a Colossal Titan in one of the woods' fairy rings: for everyone, in the room's state. */
  private startWonder(kind: "surge" | "titan") {
    const now = Date.now();
    let ev: WorldEvent;
    if (kind === "surge") {
      // (where the Lucky Bell said it would be, if it rang)
      const spot = this.nextSurgeSpot ?? this.pickSurgeSpot();
      this.nextSurgeSpot = null;
      ev = { kind: "surge", map: spot.map, x: spot.at.x, z: spot.at.z, r: 1.6, until: now + SURGE_S * 1000 };
      const where = spot.map === "campfire_night" ? "by the campfire's dock" : "on the Whispering Woods' river";
      this.broadcast("campfireNotice", { message: `The water's shimmering gold ${where}! A King-Size Surge for four minutes: reel by hand in the ripples and 4 in 10 catches are King Size`, emoji: "✨" });
    } else {
      const i = Math.floor(Math.random() * TITAN_SPOTS.length);
      const id = `titan_${i + 1}`;
      const at = TITAN_SPOTS[i];
      this.trees.set(id, { stage: "mature", scale: TITAN.scale, dmg: 0, rounds: rollTreeRounds(TITAN.rounds), fellAt: 0 });
      ev = { kind: "titan", map: "whispering_woods", id, x: at.x, z: at.z, until: 0 };
      this.syncTrees();
      this.broadcast("campfireNotice", { message: "A Colossal Titan has risen in a clearing of the Whispering Woods, glowing amber! It stands until someone fells it (any axe): heavy logs worth 3x", emoji: "🌳" });
    }
    this.lastWonder = kind;
    this.state.worldEvent = JSON.stringify(ev);
  }

  /** A stretch of water for a surge: a fishing spot's, at the campfire or in the woods. */
  private pickSurgeSpot(): { map: MapId; at: { x: number; z: number } } {
    const spots = [...FISHING_SPOTS.map((f) => ({ map: "campfire_night" as MapId, at: f.bobber })), ...FOREST_FISHING.map((f) => ({ map: "whispering_woods" as MapId, at: f.bobber }))];
    return spots[Math.floor(Math.random() * spots.length)];
  }

  /** The wonder ends (felled, faded or replaced): the Titan's tree goes, and the next is due. */
  private endWonder(scheduleNext: boolean) {
    const ev = parseWorldEvent(this.state.worldEvent);
    if (ev?.kind === "titan") {
      this.trees.delete(ev.id);
      this.fells.forEach((f, id) => {
        if (f.tree === ev.id) this.cancelFell(id, this.state.players.get(id));
      });
      this.syncTrees();
    }
    this.state.worldEvent = "";
    if (scheduleNext) this.nextWonderAt = Date.now() + wonderGap();
  }

  /** The King-Size chance for this angler's hand-reeled catch: a surge on their world whose ripples
   *  their float lands in. */
  private surgeKing(sessionId: string, player: Player): number {
    const ev = parseWorldEvent(this.state.worldEvent);
    if (!ev || ev.kind !== "surge" || ev.map !== player.map) return 0;
    const bob = this.bobberOf(sessionId, player);
    if (!bob || Math.hypot(bob.x - ev.x, bob.z - ev.z) > ev.r + 0.6) return 0;
    // Finley's Lucky Bell: five in ten
    return hasLuckyBell(this.records.get(sessionId)?.fishing.worn ?? []) ? LUCKY_BELL_KING : SURGE_KING_CHANCE;
  }

  /** Where this angler's float is: their spot's (a dock seat, the canoe, a woods spot or seat). */
  private bobberOf(sessionId: string, player: Player): { x: number; z: number } | null {
    if (player.map === "whispering_woods") {
      const spot = FOREST_FISHING.reduce((a, b) => (Math.hypot(b.stand.x - player.x, b.stand.z - player.z) < Math.hypot(a.stand.x - player.x, a.stand.z - player.z) ? b : a));
      return spot.bobber;
    }
    if (player.map !== "campfire_night") return null;
    let seatId = "";
    this.state.chairs.forEach((c) => {
      if (c.occupiedBy === sessionId) seatId = c.propId;
    });
    const bySeat = FISHING_SPOTS.find((f) => f.seat === seatId);
    return (bySeat ?? nearestFishingSpot(player.x, player.z)).bobber;
  }

  /** The woods' bank spot an angler standing at (x, z) is at, if any. */
  private woodsSpotAt(player: Player): string | undefined {
    const spot = FOREST_FISHING.find((f) => Math.hypot(player.x - f.stand.x, player.z - f.stand.z) <= FISHING_REACH + 0.8);
    return spot?.propId;
  }

  /** A swipe of the net through the grove's fireflies: a glowing jar of them to carry about (or,
   *  with a jar already in hand, letting them go). */
  private catchFireflies(sessionId: string, player: Player, prop: ToggleableState) {
    if (player.sitting || player.action !== "") return;
    if (Math.hypot(player.x - prop.x, player.z - prop.z) > FIREFLY_REACH + 0.4) return;
    const now = Date.now();
    if (now - (this.lastNetAt.get(sessionId) ?? 0) < 1500) return;
    this.lastNetAt.set(sessionId, now);
    if (player.holding === "jar") {
      player.holding = "";
      this.nearby(sessionId, "emote", { sessionId, emoji: "✨" });
      return;
    }
    // whatever was in hand is set down for the jar
    player.holding = "jar";
    player.drink = "";
    player.snack = "";
    this.snackUntil.delete(sessionId);
    this.playGesture(sessionId, "net");
    this.nearby(sessionId, "emote", { sessionId, emoji: "✨" });
  }

  private stopStargazing(sessionId: string, player: Player) {
    this.stargazers.delete(sessionId);
    if (player.action === "stargaze") this.clearAction(player);
  }

  /** Picking a patch under the pines: a pluck, a few coins, and it grows back in a few minutes. */
  private forage(sessionId: string, player: Player, prop: ToggleableState) {
    if (!prop.on || player.sitting || player.action !== "") return;
    if (Math.hypot(player.x - prop.x, player.z - prop.z) > FORAGE_REACH + 0.4) return;
    const spot = FORAGE_SPOTS.find((f) => f.propId === prop.propId);
    if (!spot) return;
    prop.on = false;
    this.regrowAt.set(prop.propId, Date.now() + FORAGE_REGROW_CAMP_S * 1000);
    this.playGesture(sessionId, "reach");
    this.addItem(player, spot.kind === "berries" ? "berry" : "mushroom");
    const coins = this.campfirePay(sessionId, player, "forage", FORAGE_COINS);
    const result: ForageResult = { sessionId, kind: spot.kind, coins, capped: coins === 0 };
    this.toMap("campfire_night", "forageResult", result);
    this.nearby(sessionId, "emote", { sessionId, emoji: FORAGE_INFO[spot.kind].emoji });
    this.persist(sessionId, player);
  }

  /** The roasting dials, skewers eaten up, the fellers' rings and the stargazers' shooting stars. */
  private tickCampfire(now: number) {
    // the bonfire burns down a notch every couple of minutes
    if (now - this.fuelTickAt >= FUEL_DECAY_S * 1000) {
      this.fuelTickAt = now;
      if (this.state.fuel > 0) {
        this.state.fuel = Math.max(0, this.state.fuel - FUEL_DECAY);
        const update: BonfireUpdate = { fuel: this.state.fuel, sessionId: "", item: "", amount: -FUEL_DECAY };
        this.toMap("campfire_night", "BONFIRE_STATE_UPDATE", update);
      }
    }
    this.tickStew(now);
    // plates left too long on the picnic table are cleared
    const plates = parsePicnic(this.state.picnic);
    if (plates.length && this.picnicAt.some((at) => now - at > PICNIC_STALE_S * 1000)) {
      const keep = plates.filter((_, k) => now - (this.picnicAt[k] ?? now) <= PICNIC_STALE_S * 1000);
      this.picnicAt = this.picnicAt.filter((at) => now - at <= PICNIC_STALE_S * 1000);
      this.state.picnic = keep.length ? JSON.stringify(keep) : "";
    }
    this.starReels.forEach((reel, sessionId) => {
      if (now - reel.startedAt > (REEL_SECONDS + 6) * 1000) this.finishStarlightReel(sessionId, false);
    });
    this.fells.forEach((fell, sessionId) => {
      const player = this.state.players.get(sessionId);
      if (!player || player.action !== "chop") {
        this.fells.delete(sessionId);
        return;
      }
      // a feller who stopped swinging lets the tree go (its notch stays)
      if (now - fell.startedAt > FELL_IDLE_S * 1000) this.cancelFell(sessionId, player);
    });
    this.stargazers.forEach((gazer, sessionId) => {
      const player = this.state.players.get(sessionId);
      if (!player || player.action !== "stargaze") {
        this.stargazers.delete(sessionId);
        return;
      }
      // a star that got across the lens uncaught breaks the chain
      gazer.stars.forEach((until, id) => {
        if (now > until) {
          gazer.stars.delete(id);
          gazer.combo = 0;
        }
      });
      if (now < gazer.next) return;
      // a meteor shower: three to five shooting stars, at their own speeds and slants, a beat apart
      const grace = Math.min(400, player.ping / 2 + 150);
      const shower: MeteorShower = { stars: [] };
      let delay = 0;
      const count = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < count; k++) {
        const fromLeft = Math.random() < 0.5;
        const duration = 0.75 + Math.random() * 0.9;
        const star: ShootingStar = {
          id: this.starSeq++,
          delay,
          x0: fromLeft ? 0.02 : 0.98,
          y0: 0.08 + Math.random() * 0.45,
          x1: fromLeft ? 0.98 : 0.02,
          y1: 0.3 + Math.random() * 0.62,
          duration,
        };
        shower.stars.push(star);
        gazer.stars.set(star.id, now + (delay + duration) * 1000 + grace);
        delay += 0.35 + Math.random() * 0.7;
      }
      gazer.next = now + (delay + 1.2) * 1000 + 3500 + Math.random() * 3500;
      const client = this.clients.find((c) => c.sessionId === sessionId);
      client?.send("meteorShower", shower);
    });
    this.roasts.forEach((roast, sessionId) => {
      const player = this.state.players.get(sessionId);
      if (!player || player.action !== "grill") {
        this.roasts.delete(sessionId);
        return;
      }
      const at = (now - roast.startedAt) / (roast.duration * 1000);
      player.actionProgress = Math.min(1, Math.round(at * 50) / 50);
      if (at >= 1) this.finishRoast(sessionId, player, "charred"); // left in the fire: burnt
    });
    this.snackUntil.forEach((until, sessionId) => {
      if (now < until) return;
      this.snackUntil.delete(sessionId);
      const player = this.state.players.get(sessionId);
      if (player && player.holding === "skewer" && player.action !== "grill") {
        player.holding = "";
        player.snack = "";
      }
    });
  }

  /** A tap while the bobber is under: the fish is on, and the reel begins (the angler's
   *  FishingModal plays it; REEL_DONE says how it ended). */
  private hookStarlight(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || player.action !== "fish" || !this.biteUntil.has(sessionId)) return;
    this.biteUntil.delete(sessionId);
    const species = this.pendingFish.get(sessionId)?.species ?? rollRiverFish("freshwater", this.catchLuck(sessionId, player));
    this.pendingFish.delete(sessionId);
    const worn = this.records.get(sessionId)?.fishing.worn ?? [];
    const fish = rollCatch(species, { rareLuck: this.catchLuck(sessionId, player).rareLuck, king: this.surgeKing(sessionId, player), goldStar: goldStarBonus(worn), heft: heftBonus(worn) });
    const treasure = Math.random() < TREASURE_CHANCE[FISH[species].tier];
    this.starReels.set(sessionId, { fish, startedAt: Date.now(), treasure });
    player.action = "reel";
    player.actionProgress = 0;
    // how it swims and how big its shadow is: never what it is (that is told once it is landed)
    const sp = FISH[species];
    const [lo, hi] = sp.cm;
    const reel: StarlightReel = {
      swim: { speed: sp.speed, size: sp.size, pattern: sp.pattern, barScale: sp.barScale * ((this.records.get(sessionId)?.fishing.eagleUntil ?? 0) > Date.now() ? 1.15 : 1) },
      shadow: Math.max(0.1, Math.min(1, Math.sqrt(Math.max(1, fish.cm) / 260) * (0.85 + 0.3 * ((fish.cm - lo) / Math.max(1, hi - lo))))),
      rod: this.records.get(sessionId)?.fishing.rod ?? "bamboo",
      treasure,
    };
    this.sendTo(sessionId, "starlightReel", reel);
  }

  /**
   * A line goes (back) in the river: what will bite is rolled now (the Cozy Aura and Star Droplets
   * tip it rare), and so is the wait, from its kind (a big fish takes its time), sooner with
   * Glowworms and while Well-Fed. A fresh cast puts a bait on the hook (`consumeBait`); a bite that
   * got away leaves the old one on.
   */
  private waitForBite(sessionId: string, player: Player, consumeBait: boolean) {
    const profile = this.records.get(sessionId)?.fishing;
    let bait: BaitId | "" = "";
    if (profile?.bait && (profile.baits[profile.bait] ?? 0) > 0) {
      bait = profile.bait;
      // (the Tackle Master's Holster: a bait lasts a fifth longer, one cast in six on the house)
      if (consumeBait && Math.random() >= baitSaveChance(profile.worn)) {
        const left = (profile.baits[bait] ?? 0) - 1;
        if (left > 0) profile.baits[bait] = left;
        else {
          delete profile.baits[bait];
          profile.bait = "";
        }
        this.saveFishing(sessionId, player);
      }
    }
    const species = rollRiverFish("freshwater", this.catchLuck(sessionId, player, bait));
    const day = isCampDay(Date.now());
    const total = biteSeconds(species, { fed: player.fed > 0, bait, night: !day, haste: biteHaste(profile?.worn ?? [], day) }) * 1000;
    const now = Date.now();
    this.pendingFish.set(sessionId, { species, castAt: now, total });
    this.fishBiteAt.set(sessionId, now + total);
    player.actionProgress = 0;
  }

  /** What can bite for this angler now: the hour's light (the day's fish or the night's), the
   *  rapids (their own legendaries and mythics, and a richer water), the rod's reach (nothing rarer
   *  than its tier), the Cozy Aura at the campfire, and the bait. */
  private catchLuck(sessionId: string, player: Player, bait: BaitId | "" = ""): CatchLuck {
    const profile = this.records.get(sessionId)?.fishing;
    const rapids = player.map === "whispering_woods";
    const aura = player.map === "campfire_night" && hasCozyAura(this.state.fuel) ? COZY_AURA_LUCK : 0;
    const day = isCampDay(Date.now());
    // (the Moonlit Abyssal Ring: by night, the rare and nocturnal fish a quarter likelier)
    return { rareLuck: aura + (rapids ? RAPIDS_LUCK : 0) + nightRareLuck(profile?.worn ?? [], !day), bait, time: day ? "day" : "night", rapids, rodTier: RODS[profile?.rod ?? "bamboo"].tier };
  }

  private creelIsFull(sessionId: string): boolean {
    const profile = this.records.get(sessionId)?.fishing;
    return !!profile && creelFull(profile);
  }

  /** The creel is full: the line comes in (nothing on it, no bait spent), the rod is stowed, and the
   *  angler rests where they sit, feet over the water with a warm mug, until there is room again
   *  (they sell some fish) or they get up. Said once, to them. */
  private restByTheWater(sessionId: string, player: Player) {
    this.fishBiteAt.delete(sessionId);
    this.biteUntil.delete(sessionId);
    this.pendingFish.delete(sessionId);
    this.afkTotal.delete(sessionId);
    this.starlight.delete(sessionId);
    this.starReels.delete(sessionId);
    const was = player.action;
    player.action = "rest";
    player.actionProgress = 0;
    player.holding = "coffee";
    player.drink = "";
    if (was !== "rest") {
      const kit = this.records.get(sessionId)?.fishing;
      this.sendTo(sessionId, "creelFull", { capacity: kit ? livewellCap(kit) : 0, held: kit?.creel.length ?? 0 });
      this.nearby(sessionId, "emote", { sessionId, emoji: "☕" });
    }
  }

  /** Out of the rest: the mug goes back in the bag. */
  private putMugAway(player: Player) {
    if (player.holding === "coffee" && !player.drink) player.holding = "";
  }

  private scheduleCampAfk(sessionId: string, now: number) {
    const player = this.state.players.get(sessionId);
    const species = rollRiverFish("freshwater", player ? { ...this.catchLuck(sessionId, player), afk: true } : { afk: true });
    // premium bait (the Lucky Chum) on the hook: every wait a quarter shorter
    const profile = this.records.get(sessionId)?.fishing;
    const bait = profile && profile.bait && (profile.baits[profile.bait] ?? 0) > 0 ? profile.bait : "";
    const total = afkSeconds(species, Math.random, bait, biteHaste(profile?.worn ?? [], isCampDay(now))) * 1000;
    this.pendingFish.set(sessionId, { species, castAt: now, total });
    this.afkTotal.set(sessionId, total);
    this.fishBiteAt.set(sessionId, now + total);
  }

  /** A fish out of the river: into the creel (the angler's longest of its kind noted), or, the creel
   *  full, let go for a few coins. Everyone hears about it. */
  private landFish(sessionId: string, player: Player, fish: CreelFish, afk: boolean, treasure: number) {
    const profile = this.records.get(sessionId)?.fishing;
    if (!profile) return;
    // the Field Guide's ledger: the longest of each kind, and how many landed
    const best = profile.records[fish.s] ?? 0;
    if (fish.cm > best) profile.records[fish.s] = fish.cm;
    profile.caught[fish.s] = Math.min(999_999, (profile.caught[fish.s] ?? 0) + 1);
    let coins = treasure;
    let released = false;
    if (profile.creel.length < livewellCap(profile)) profile.creel.push(fish);
    else {
      released = true;
      coins += this.campfirePay(sessionId, player, "fish", CREEL_RELEASE_COINS);
    }
    this.bumpStat(player, "fish_caught");
    this.daily(sessionId, player, "catch_fish");
    // a new personal best (not the first of its kind: that is only a first): held high overhead
    const record = best > 0 && fish.cm > best;
    const landed: FishCaught = { sessionId, fish, released, record, coins, treasure, afk };
    this.toMap(player.map, "fishCaught", landed);
    if (record && !afk) this.playGesture(sessionId, "trophy");
    this.nearby(sessionId, "emote", { sessionId, emoji: released ? "🪣" : record ? "🏆" : FISH[fish.s].emoji });
    this.saveFishing(sessionId, player);
  }

  /** The camp's market as it stands this hour. */
  private market(): MarketState {
    return parseMarket(this.state.market);
  }

  /** The angler's profile changed: its synced copy follows, and it is queued for the database. */
  private saveFishing(sessionId: string, player: Player) {
    const record = this.records.get(sessionId);
    if (!record) return;
    player.fishing = JSON.stringify(record.fishing);
    this.persist(sessionId, player);
  }

  /** Eating at the campfire: Well-Fed for WELL_FED_S (a bouncier, quicker step; quicker bites). */
  private feed(sessionId: string, player: Player) {
    const record = this.records.get(sessionId);
    if (!record) return;
    record.fishing.fedUntil = Date.now() + WELL_FED_S * 1000;
    player.fed = WELL_FED_S;
    this.saveFishing(sessionId, player);
  }

  /** The Dutch oven, changed: synced, and announced (the pot bubbles, a bowl is scooped...). */
  private setStew(stew: StewState, event: StewUpdate["event"], sessionId: string) {
    this.state.stew = stew.items.length || stew.phase !== "gathering" ? JSON.stringify(stew) : "";
    const update: StewUpdate = { stew, event, sessionId };
    this.toMap("campfire_night", "STEW_STATE_UPDATE", update);
  }

  /** The pot simmers once its third ingredient is in, then waits (warm) for bowls, then goes cold. */
  private tickStew(now: number) {
    if (this.stewCookAt) {
      const stew = parseStew(this.state.stew);
      const done = (now - this.stewCookAt) / (STEW_COOK_S * 1000);
      if (done >= 1) {
        this.stewCookAt = 0;
        this.stewReadyAt = now;
        stew.phase = "ready";
        stew.progress = 1;
        stew.servings = STEW_SERVINGS;
        this.setStew(stew, "ready", "");
        if (isCampfireStew(stew.items)) {
          // the Campfire Stew: the whole room is Well-Fed at once (a quicker step, quicker bites)
          this.state.players.forEach((p, id) => {
            if (p.connected) this.feed(id, p);
          });
          this.broadcast("campfireNotice", { message: "The Campfire Stew is ready: everyone is Well-Fed! A quicker step and quicker bites for a while", emoji: "🍲" });
        } else this.toMap("campfire_night", "campfireNotice", { message: `The ${stewName(stew.items)} is ready! Grab a bowl by the fire`, emoji: "🍲" });
      } else {
        const progress = Math.floor(done * 20) / 20;
        if (progress !== stew.progress) {
          stew.progress = progress;
          this.state.stew = JSON.stringify(stew);
        }
      }
    }
    if (this.stewReadyAt && now - this.stewReadyAt > STEW_COLD_S * 1000) {
      this.stewReadyAt = 0;
      this.setStew(emptyStew(), "cold", "");
    }
  }

  private nearPicnic(player: Player): boolean {
    return Math.hypot(player.x - CAMPFIRE_LAYOUT.picnic.x, player.z - CAMPFIRE_LAYOUT.picnic.z) <= PICNIC_REACH + 0.4;
  }

  /** The branch archway: from the campfire into the Whispering Woods (the Ranger's Badge, or a Day
   *  Trip Permit used up on the way in; neither: Buster's permits offered there), or back out. */
  private useArchway(sessionId: string, player: Player) {
    if (player.sitting) return;
    if (player.map === "whispering_woods") {
      this.travel(sessionId, player, "campfire_night", CAMP_FROM_WOODS);
      return;
    }
    if (player.map !== "campfire_night") return;
    const profile = this.records.get(sessionId)?.fishing;
    if (!profile) return;
    if (!profile.ranger) {
      if (profile.dayPermits <= 0) {
        this.sendTo(sessionId, "openPanel", { kind: "permits", propId: "woods_gate" });
        return;
      }
      profile.dayPermits -= 1;
      this.saveFishing(sessionId, player);
      this.sendTo(sessionId, "campfireNotice", { message: `A Day Trip Permit, stamped. ${profile.dayPermits ? `(${profile.dayPermits} left)` : "Enjoy the woods!"}`, emoji: "🎫" });
    }
    this.travel(sessionId, player, "whispering_woods", WOODS_ARRIVAL);
  }

  /** A slingshot round's shots, replayed against its seeded range: the score, the prize tier (and
   *  the Eagle Eye at the top), the Golden Acorns; paid only on a paid round, within the day's cap. */
  private endSlingshot(sessionId: string, player: Player, raw: unknown) {
    const round = this.slingRounds.get(sessionId);
    if (!round) return;
    this.slingRounds.delete(sessionId);
    const elapsed = (Date.now() - round.startedAt) / 1000;
    const shots = elapsed <= SLING_ROUND_S + 30 ? validSlingShots(raw, elapsed) : null;
    const profile = this.records.get(sessionId)?.fishing;
    const fail: SlingshotResult = { ok: false, score: 0, hits: 0, acorns: 0, streak: 0, prize: 0, acornCoins: 0, coins: 0, capped: false, eagle: false, paid: round.paid, best: profile?.slingBest ?? 0 };
    if (!shots || !profile) return this.sendTo(sessionId, "slingshotResult", fail);
    const run = playSlingshot(round.seed, shots);
    const tier = slingPrize(SLINGSHOT_PRIZES, run.score);
    const prize = round.paid ? (tier?.coins ?? 0) : 0;
    const acornCoins = round.paid ? run.acorns * GOLDEN_ACORN_COINS : 0;
    const coins = prize + acornCoins > 0 ? this.campfirePay(sessionId, player, "slingshot", prize + acornCoins) : 0;
    const eagle = !!tier?.eagle;
    if (eagle) profile.eagleUntil = Date.now() + EAGLE_EYE_MS;
    profile.slingBest = Math.max(profile.slingBest, run.score);
    this.saveFishing(sessionId, player);
    this.persist(sessionId, player);
    const result: SlingshotResult = { ok: true, score: run.score, hits: run.hits.length, acorns: run.acorns, streak: run.streak, prize, acornCoins, coins, capped: prize + acornCoins > coins, eagle, paid: round.paid, best: profile.slingBest };
    this.sendTo(sessionId, "slingshotResult", result);
    if (eagle) {
      this.nearby(sessionId, "emote", { sessionId, emoji: "🦅" });
      this.toMap("campfire_night", "campfireNotice", { message: `${player.username} scored ${run.score.toLocaleString("en-US")} at the slingshot gallery: Eagle Eye!`, emoji: "🦅" });
    } else if (run.hits.length) this.nearby(sessionId, "emote", { sessionId, emoji: "🎯" });
  }

  /** The chopping block: logs into Firewood (every kind, or one), bundled beside the carrier. */
  private splitWood(sessionId: string, player: Player, only: unknown) {
    const profile = this.records.get(sessionId)?.fishing;
    if (!profile) return;
    if (player.map !== "campfire_night") return;
    const front = SPLITBLOCK_FRONT;
    const reply = (ok: boolean, message: string) => this.sendTo(sessionId, "splitResult", { ok, message, firewood: profile.firewood } satisfies SplitResult);
    if (Math.hypot(player.x - front.x, player.z - front.z) > 1.9) return reply(false, "Step up to the chopping block");
    const kinds = isWoodKind(only) ? [only] : WOOD_KINDS;
    let logs = 0;
    let bundles = 0;
    for (const k of kinds) {
      const n = profile.wood[k] ?? 0;
      if (n <= 0) continue;
      logs += n;
      // (the Forester's Toolbelt: half as many bundles again)
      bundles += Math.round(n * WOOD[k].firewood * splitYield(profile.worn));
      takeLogs(profile, k, n);
    }
    if (!logs) return reply(false, "No logs in your carrier to split");
    profile.firewood = Math.min(9999, profile.firewood + bundles);
    this.saveFishing(sessionId, player);
    if (!player.sitting) this.playGesture(sessionId, "chop");
    this.nearby(sessionId, "emote", { sessionId, emoji: "🪵" });
    reply(true, `${logs} log${logs > 1 ? "s" : ""} split into ${bundles} bundles of Firewood`);
  }

  /** The woods' deer and rabbits: a berry or a mushroom from the forage bag, and a hop of joy. */
  private feedAnimal(sessionId: string, player: Player, propId: string) {
    const animal = FOREST_ANIMALS.find((a) => a.propId === propId);
    if (!animal || player.sitting || Math.hypot(player.x - animal.x, player.z - animal.z) > ANIMAL_REACH + 0.5) return;
    const now = Date.now();
    if (now - (this.lastFeedAt.get(sessionId) ?? 0) < 3000) return;
    const bag = parseBag(player.bag);
    const treat = (["berry", "mushroom"] as const).find((k) => (bag[k] ?? 0) > 0);
    if (!treat) {
      this.sendTo(sessionId, "campfireNotice", { message: `The ${animal.kind === "deer" ? "deer" : "rabbits"} sniff hopefully: bring a berry or a mushroom from the campfire's pines`, emoji: animal.kind === "deer" ? "🦌" : "🐇" });
      return;
    }
    this.lastFeedAt.set(sessionId, now);
    bag[treat] = (bag[treat] ?? 0) - 1;
    if (!bag[treat]) delete bag[treat];
    player.bag = encodeBag(bag);
    this.playGesture(sessionId, "toss");
    const coins = this.campfirePay(sessionId, player, "forage", 2);
    this.toMap("whispering_woods", "animalFed", { sessionId, propId: animal.propId, coins });
    this.nearby(sessionId, "emote", { sessionId, emoji: animal.kind === "deer" ? "🦌" : "🐇" });
    this.persist(sessionId, player);
  }

  /** The carpenter's workbench between the tipi and Buster's stall: the recipe's wood comes out of
   *  the carrier and one carved piece goes in (a Masterwork now and then: finer with a finer axe).
   *  Answered with workbenchResult; Buster buys the pieces at his stall. */
  private handleWorkbench(sessionId: string, player: Player, packet: Extract<CampfirePacket, { type: "WORKBENCH" }>) {
    const record = this.records.get(sessionId);
    if (!record || !isCraftId(packet.recipe)) return;
    const mode = isCraftMode(packet.mode) ? packet.mode : "safe";
    const adhesive = isAdhesive(packet.adhesive) ? packet.adhesive : "";
    const profile = record.fishing;
    const reply = (ok: boolean, message: string, extra: Partial<WorkbenchResult> = {}) => {
      const result: WorkbenchResult = { ok, message, ...extra };
      this.sendTo(sessionId, "workbenchResult", result);
      if (ok) this.saveFishing(sessionId, player);
    };
    const advanced = player.map === "whispering_woods";
    const near = advanced
      ? Math.min(Math.hypot(player.x - FOREST_WORKBENCH_FRONT.x, player.z - FOREST_WORKBENCH_FRONT.z), Math.hypot(player.x - FOREST_WORKBENCH.x, player.z - FOREST_WORKBENCH.z)) <= WORKBENCH_REACH + 0.5
      : Math.min(Math.hypot(player.x - WORKBENCH_FRONT.x, player.z - WORKBENCH_FRONT.z), Math.hypot(player.x - WORKBENCH.x, player.z - WORKBENCH.z)) <= WORKBENCH_REACH + 0.4;
    if (!near) return reply(false, "Step up to the workbench to carve");
    const craft = CRAFTS[packet.recipe];
    if (!canCraft(profile.wood, packet.recipe)) return reply(false, `The ${craft.name} takes ${Object.entries(craft.needs).map(([k, n]) => `${n} ${WOOD[k as keyof typeof WOOD].name}`).join(" + ")}`);
    if (adhesive && profile.resin < 1) return reply(false, "No Pine Resin for the Adhesive Slot: land a gold chop on the meter");
    for (const [k, n] of Object.entries(craft.needs) as [keyof typeof WOOD, number][]) takeLogs(profile, k, n);
    // the Adhesive Slot: the resin is brushed on (and spent) before the carve
    if (adhesive) profile.resin -= 1;
    const glue = adhesive ? { adhesive } : {};
    // Bramble's advanced bench: finer tools, a little more of a Masterwork's chance
    const odds = craftOdds(packet.recipe, mode, adhesive);
    const outcome = rollCraft(advanced ? { ...odds, masterwork: odds.masterwork + Math.min(odds.normal, ADVANCED_BENCH_MASTER), normal: Math.max(0, odds.normal - ADVANCED_BENCH_MASTER) } : odds, Math.random());
    this.playGesture(sessionId, "chop");
    if (outcome === "broken") {
      // the safety net: half its wood back (rounded up, per kind), and sawdust
      const salvaged = craftSalvage(packet.recipe);
      for (const [k, n] of Object.entries(salvaged) as [keyof typeof WOOD, number][]) addLogs(profile, k, Math.min(n, 999 - profile.wood[k]));
      profile.sawdust = Math.min(999, profile.sawdust + 1);
      this.nearby(sessionId, "emote", { sessionId, emoji: "💥" });
      const back = (Object.entries(salvaged) as [keyof typeof WOOD, number][]).map(([k, n]) => `${n} ${WOOD[k].emoji}`).join(" + ");
      return reply(true, `Craft Broken! Salvaged ${back} + 1 Sawdust`, { outcome, recipe: packet.recipe, salvaged, sawdust: 1, ...glue });
    }
    const m = outcome === "masterwork";
    profile.crafts.push({ c: packet.recipe, m });
    this.nearby(sessionId, "emote", { sessionId, emoji: m ? "✨" : craft.emoji });
    const note = adhesive ? ` (${ADHESIVES[adhesive].emoji} ${ADHESIVES[adhesive].name})` : "";
    reply(true, m ? `A Masterwork ${craft.name}!${note} ✨ Buster will pay ${craft.master} 🪙 for it` : `A fine ${craft.name} ${craft.emoji}${note}, worth ${craft.price} 🪙 at Buster's stall`, { outcome, recipe: packet.recipe, ...glue });
  }

  /** Buster the Lumberjack's stall: he buys split wood and carved pieces (near him) and sells axes
   *  and carriers (near him); an axe you own can be switched to anywhere. */
  private handleBuster(sessionId: string, player: Player, packet: Extract<CampfirePacket, { type: "BUSTER" }>) {
    const record = this.records.get(sessionId);
    if (!record) return;
    const profile = record.fishing;
    const B = CAMPFIRE_LAYOUT.buster;
    // at Buster's stall, or at Bramble's counter in the woods (the woods' forester: wood and its
    // by-products, every axe, the carriers; no fish)
    const atBramble = player.map === "whispering_woods" && Math.hypot(player.x - BRAMBLE_FRONT.x, player.z - BRAMBLE_FRONT.z) <= BRAMBLE_REACH + 0.4;
    const near = atBramble || (player.map === "campfire_night" && Math.min(Math.hypot(player.x - BUSTER_FRONT.x, player.z - BUSTER_FRONT.z), Math.hypot(player.x - B.x, player.z - B.z)) <= BUSTER_REACH + 0.4);
    const reply = (ok: boolean, message: string, coins = 0) => {
      const result: BarnabyResult = { ok, message, coins };
      this.sendTo(sessionId, "busterResult", result);
      if (ok) this.saveFishing(sessionId, player);
    };
    const tooFar = () => reply(false, "Come on over to the woodpile, pal!");
    switch (packet.op) {
      case "sell": {
        if (!isWoodKind(packet.wood)) return;
        if (!near) return tooFar();
        const have = profile.wood[packet.wood];
        const n = packet.count === "all" ? have : Math.min(have, Math.max(1, Math.floor(Number(packet.count) || 1)));
        if (n <= 0) return reply(false, `No ${WOOD[packet.wood].name} to sell. The chopping block's right there!`);
        // one at a time at the hour's price (each sale knocks 2% off the next), each log worth its
        // tree's size (the stack's average)
        const kind = packet.wood;
        const size = woodAverage(profile, kind);
        const run = priceRun(Array.from({ length: n }, () => kind), woodGood, (k, mult) => woodPrice(k, mult, size), this.market());
        const earned = run.total;
        this.state.market = JSON.stringify(run.after);
        profile.bestLog[kind] = Math.max(profile.bestLog[kind] ?? 0, ...run.prices);
        takeLogs(profile, kind, n);
        this.addCoins(player, earned);
        this.nearby(sessionId, "emote", { sessionId, emoji: earned >= 100 ? "💰" : "🪙" });
        return reply(true, `${n} ${WOOD[packet.wood].name}? Fine timber! Here's ${earned} 🪙`, earned);
      }
      case "sellAllWood": {
        if (!near) return tooFar();
        const goods = WOOD_KINDS.flatMap((k) => Array.from({ length: profile.wood[k] ?? 0 }, () => k));
        if (!goods.length) return reply(false, "Your carrier's empty of logs!");
        const sizes = Object.fromEntries(WOOD_KINDS.map((k) => [k, woodAverage(profile, k)])) as Record<WoodKind, number>;
        const run = priceRun(goods, woodGood, (k, mult) => woodPrice(k, mult, sizes[k]), this.market());
        this.state.market = JSON.stringify(run.after);
        goods.forEach((k, i) => {
          profile.bestLog[k] = Math.max(profile.bestLog[k] ?? 0, run.prices[i]);
        });
        for (const k of WOOD_KINDS) takeLogs(profile, k, profile.wood[k] ?? 0);
        this.addCoins(player, run.total);
        this.nearby(sessionId, "emote", { sessionId, emoji: run.total >= 100 ? "💰" : "🪙" });
        return reply(true, `${goods.length} logs, the lot! Here's ${run.total} 🪙`, run.total);
      }
      case "buyPermit": {
        // Buster's permits (at his stall, or at the archway into the woods)
        const atGate = player.map === "campfire_night" && Math.hypot(player.x - CAMP_ARCHWAY_FRONT.x, player.z - CAMP_ARCHWAY_FRONT.z) <= 2.2;
        if (!near && !atGate) return tooFar();
        if (profile.ranger) return reply(false, "You carry the Ranger's Badge: the woods are yours already!");
        if (packet.permit === "ranger") {
          if (player.coins < PERMIT_PRICES.rangerBadge) return reply(false, `The Ranger's Badge is ${PERMIT_PRICES.rangerBadge.toLocaleString("en-US")} 🪙`);
          this.addCoins(player, -PERMIT_PRICES.rangerBadge);
          profile.ranger = true;
          this.nearby(sessionId, "emote", { sessionId, emoji: "🎖️" });
          return reply(true, "The Ranger's Badge! The Whispering Woods are open to you for good", -PERMIT_PRICES.rangerBadge);
        }
        if (packet.permit !== "dayTrip") return;
        if (profile.dayPermits >= MAX_DAY_PERMITS) return reply(false, `${MAX_DAY_PERMITS} permits is plenty for anybody!`);
        if (player.coins < PERMIT_PRICES.dayTrip) return reply(false, `A Day Trip Permit is ${PERMIT_PRICES.dayTrip} 🪙`);
        this.addCoins(player, -PERMIT_PRICES.dayTrip);
        profile.dayPermits += 1;
        return reply(true, `A Day Trip Permit (you hold ${profile.dayPermits}): show it at the archway`, -PERMIT_PRICES.dayTrip);
      }
      case "buyAxe": {
        if (!isAxeId(packet.axe)) return;
        const axe = AXES[packet.axe];
        if (profile.axes.includes(packet.axe)) return reply(false, `You've already got the ${axe.name}`);
        if (!near) return tooFar();
        // Buster forges up to T3; Bramble, the woods' forester, sells every axe (T1 to T5)
        if (!atBramble && axe.tier >= 4) return reply(false, `The ${axe.name} comes from Bramble's cabin in the Whispering Woods`);
        if (player.coins < axe.price) return reply(false, `The ${axe.name} is ${axe.price} 🪙. Keep chopping!`);
        this.addCoins(player, -axe.price);
        profile.axes.push(packet.axe);
        profile.axe = packet.axe;
        this.nearby(sessionId, "emote", { sessionId, emoji: axe.emoji });
        return reply(true, `The ${axe.name}, all yours. Mind your toes!`, -axe.price);
      }
      case "equipAxe": {
        if (!isAxeId(packet.axe) || !profile.axes.includes(packet.axe)) return;
        profile.axe = packet.axe;
        return reply(true, `${AXES[packet.axe].emoji} ${AXES[packet.axe].name} in hand`);
      }
      case "upgradeCarrier": {
        if (!near) return tooFar();
        const next = nextCarrierTier(profile.carrierTier);
        if (!next) return reply(false, "That's the finest rig in the woods!");
        if (player.coins < next.price) return reply(false, `The ${next.name} is ${next.price} 🪙`);
        this.addCoins(player, -next.price);
        profile.carrierTier += 1;
        return reply(true, `${next.icon} The ${next.name}: room for ${next.capacity}!`, -next.price);
      }
      case "buyGear": {
        if (!isGearId(packet.gear)) return;
        if (!near) return tooFar();
        const gear = GEAR[packet.gear];
        if (gear.craft !== "wood") return reply(false, `${theGear(gear.name)}? That's angling kit: ask Barnaby or Finley`);
        if (!atBramble && gear.tier >= 4) return reply(false, `${theGear(gear.name)} comes from Bramble's cabin in the Whispering Woods`);
        return this.buyGear(sessionId, player, profile, packet.gear, reply);
      }
      case "sellByproducts": {
        // the felling's by-products, at their flat prices (one kind, or every pouch)
        if (!near) return tooFar();
        const kinds = packet.item === "all" ? BYPRODUCT_IDS : isByproductId(packet.item) ? [packet.item] : [];
        let n = 0;
        let earned = 0;
        for (const k of kinds) {
          const have = profile.byproducts[k] ?? 0;
          if (have <= 0) continue;
          n += have;
          earned += have * BYPRODUCTS[k].price;
          delete profile.byproducts[k];
        }
        if (n <= 0) return reply(false, "No bark, amber or shavings to sell yet: they come off the bigger trees");
        this.addCoins(player, earned);
        this.nearby(sessionId, "emote", { sessionId, emoji: "🪙" });
        return reply(true, `${n} by-product${n > 1 ? "s" : ""} from the felling? Useful stuff! Here's ${earned} 🪙`, earned);
      }
      case "sellFirewood": {
        // split Firewood bundles: a flat price a bundle (the bonfire's fuel too)
        if (!near) return tooFar();
        const n = packet.count === "all" ? profile.firewood : Math.min(profile.firewood, Math.max(1, Math.floor(Number(packet.count) || 1)));
        if (n <= 0) return reply(false, "No Firewood bundles: split some logs at the chopping block!");
        const earned = n * FIREWOOD_PRICE;
        profile.firewood -= n;
        this.addCoins(player, earned);
        this.nearby(sessionId, "emote", { sessionId, emoji: "🪙" });
        return reply(true, `${n} bundle${n > 1 ? "s" : ""} of Firewood? Keeps a camp warm! Here's ${earned} 🪙`, earned);
      }
      case "sellResin": {
        if (!near) return tooFar();
        const n = packet.count === "all" ? profile.resin : Math.min(profile.resin, Math.max(1, Math.floor(Number(packet.count) || 1)));
        if (n <= 0) return reply(false, "No resin yet: land a swing in the gold on the felling ring!");
        const earned = n * RESIN_PRICE;
        profile.resin -= n;
        this.addCoins(player, earned);
        this.nearby(sessionId, "emote", { sessionId, emoji: "🪙" });
        return reply(true, `${n} Pine Resin? Smells like the woods! Here's ${earned} 🪙`, earned);
      }
      case "sellCraft": {
        if (!near) return tooFar();
        const picked = packet.slot === "all" ? profile.crafts.map((_, k) => k) : [Math.floor(Number(packet.slot))].filter((k) => !!profile.crafts[k]);
        if (!picked.length) return reply(false, "No carved pieces to sell yet: try the workbench!");
        const run = priceRun(picked.map((k) => profile.crafts[k]), (item) => craftGood(item.c), (item, mult) => craftSalePrice(item, mult), this.market());
        const earned = run.total;
        this.state.market = JSON.stringify(run.after);
        const first = profile.crafts[picked[0]];
        profile.crafts = profile.crafts.filter((_, k) => !picked.includes(k));
        this.addCoins(player, earned);
        this.nearby(sessionId, "emote", { sessionId, emoji: earned >= 100 ? "💰" : "🪙" });
        return reply(true, picked.length > 1 ? `${picked.length} pieces of fine work! Here's ${earned} 🪙` : `${first.m ? "A Masterwork " : "A "}${CRAFTS[first.c].name}? Here's ${earned} 🪙`, earned);
      }
    }
  }

  /** A piece of gear bought (the shop has already checked it sells it): paid for, owned for good, and
   *  worn at once (whatever it displaces comes off, still owned). */
  private buyGear(sessionId: string, player: Player, profile: FishingProfile, id: GearId, reply: (ok: boolean, message: string, coins?: number) => void) {
    const gear = GEAR[id];
    if (profile.gear.includes(id)) return reply(false, `You've already got ${theGear(gear.name, false)}!`);
    if (player.coins < gear.price) return reply(false, `${theGear(gear.name)} is ${gear.price.toLocaleString("en-US")} 🪙`);
    this.addCoins(player, -gear.price);
    profile.gear.push(id);
    const { worn, removed } = wearGear(profile.worn, id);
    profile.worn = worn;
    this.nearby(sessionId, "emote", { sessionId, emoji: gear.emoji });
    const off = removed.length ? ` (took off ${removed.map((r) => theGear(GEAR[r].name, false)).join(" and ")})` : "";
    return reply(true, `${gear.emoji} ${theGear(gear.name)}, on and working${off}! ${gear.blurb}`, -gear.price);
  }

  /** Putting on or taking off a piece of gear you own (anywhere: the drawers' gear tabs). */
  private handleGear(sessionId: string, player: Player, packet: Extract<CampfirePacket, { type: "GEAR" }>) {
    const profile = this.records.get(sessionId)?.fishing;
    if (!profile || !isGearId(packet.gear) || !profile.gear.includes(packet.gear)) return;
    const gear = GEAR[packet.gear];
    if (packet.op === "unequip") {
      if (!profile.worn.includes(packet.gear)) return;
      profile.worn = profile.worn.filter((g) => g !== packet.gear);
      this.saveFishing(sessionId, player);
      this.sendTo(sessionId, "campfireNotice", { message: `Took off ${theGear(gear.name, false)}`, emoji: gear.emoji });
      return;
    }
    const { worn, removed } = wearGear(profile.worn, packet.gear);
    profile.worn = worn;
    this.saveFishing(sessionId, player);
    const off = removed.length ? `, in place of ${removed.map((r) => theGear(GEAR[r].name, false)).join(" and ")}` : "";
    this.sendTo(sessionId, "campfireNotice", { message: `${gear.name} on${off}`, emoji: gear.emoji });
  }

  /** Barnaby's stall: selling the creel (near him), buying rods, bait and a bigger creel (near him),
   *  and switching rod or bait (anywhere). */
  private handleBarnaby(sessionId: string, player: Player, packet: Extract<CampfirePacket, { type: "BARNABY" }>) {
    const record = this.records.get(sessionId);
    if (!record) return;
    const profile = record.fishing;
    const B = CAMPFIRE_LAYOUT.barnaby;
    // at Barnaby's stall, or by Finley's boulder on the woods' river (the woods' angler: fish, every
    // rod, the livewells, every bait)
    const atFinley = player.map === "whispering_woods" && Math.hypot(player.x - FINLEY_FRONT.x, player.z - FINLEY_FRONT.z) <= FINLEY_REACH + 0.4;
    const near = atFinley || (player.map === "campfire_night" && Math.min(Math.hypot(player.x - BARNABY_FRONT.x, player.z - BARNABY_FRONT.z), Math.hypot(player.x - B.x, player.z - B.z)) <= BARNABY_REACH + 0.4);
    const reply = (ok: boolean, message: string, coins = 0) => {
      const result: BarnabyResult = { ok, message, coins };
      this.sendTo(sessionId, "barnabyResult", result);
      if (ok) this.saveFishing(sessionId, player);
    };
    const tooFar = () => reply(false, "Come on over to the stall, friend!");
    switch (packet.op) {
      case "sell": {
        if (!near) return tooFar();
        // (a locked fish never goes: Sell All passes it by, and alone it is refused)
        const one = Math.floor(Number(packet.slot));
        if (packet.slot !== "all" && profile.creel[one]?.l) return reply(false, `That ${FISH[profile.creel[one].s].name} is locked: unlock it to sell`);
        const picked = packet.slot === "all" ? profile.creel.map((f, k) => (f.l ? -1 : k)).filter((k) => k >= 0) : [one].filter((k) => !!profile.creel[k]);
        if (!picked.length) return reply(false, profile.creel.length ? "Every fish in there is locked: nothing to sell!" : "Your creel's empty! The river's right there 🎣");
        // a roaring fire puts Barnaby in a generous mood (the Cozy Aura: +15%)
        const aura = hasCozyAura(this.state.fuel) ? 1 + COZY_AURA_LUCK : 1;
        const first = profile.creel[picked[0]];
        // one at a time at the hour's price (each sale knocks 2% off the next of its kind); the best
        // price each kind ever fetched goes in the Field Guide
        const fish = picked.map((k) => profile.creel[k]);
        const run = priceRun(fish, (f) => fishGood(f.s), (f, mult) => Math.round(fishValue(f, mult) * aura), this.market());
        const earned = run.total;
        fish.forEach((f, i) => {
          if (run.prices[i] > (profile.best[f.s] ?? 0)) profile.best[f.s] = run.prices[i];
        });
        this.state.market = JSON.stringify(run.after);
        profile.creel = profile.creel.filter((_, k) => !picked.includes(k));
        this.addCoins(player, earned);
        this.nearby(sessionId, "emote", { sessionId, emoji: earned >= 100 ? "💰" : "🪙" });
        return reply(true, picked.length > 1 ? `${picked.length} fine fish! Here's ${earned} 🪙` : `A lovely ${FISH[first.s].name}! Here's ${earned} 🪙`, earned);
      }
      case "buyRod": {
        if (!isRodId(packet.rod)) return;
        const rod = RODS[packet.rod];
        if (profile.rods.includes(packet.rod)) return reply(false, `You've already got the ${rod.name}`);
        if (!near) return tooFar();
        // Barnaby sells up to T3; Finley on the woods' river sells every rod (T1 to T5)
        if (!atFinley && rod.tier >= 4) return reply(false, `The ${rod.name} comes from Finley, on his boulder by the woods' river`);
        if (player.coins < rod.price) return reply(false, `The ${rod.name} is ${rod.price} 🪙. Keep at it!`);
        this.addCoins(player, -rod.price);
        profile.rods.push(packet.rod);
        profile.rod = packet.rod;
        this.nearby(sessionId, "emote", { sessionId, emoji: rod.emoji });
        return reply(true, `The ${rod.name} is yours. Tight lines!`, -rod.price);
      }
      case "equipRod": {
        if (!isRodId(packet.rod) || !profile.rods.includes(packet.rod)) return;
        profile.rod = packet.rod;
        return reply(true, `${RODS[packet.rod].emoji} ${RODS[packet.rod].name} in hand`);
      }
      case "buyBait": {
        if (!isBaitId(packet.bait)) return;
        const bait = BAITS[packet.bait];
        if (!near) return tooFar();
        if (player.coins < bait.price) return reply(false, `A pack of ${bait.name} is ${bait.price} 🪙`);
        if ((profile.baits[packet.bait] ?? 0) >= 99) return reply(false, `Your ${bait.name} tin is full!`);
        this.addCoins(player, -bait.price);
        profile.baits[packet.bait] = Math.min(99, (profile.baits[packet.bait] ?? 0) + bait.pack);
        if (!profile.bait) profile.bait = packet.bait;
        return reply(true, `${bait.pack} ${bait.name} ${bait.emoji}, on the hook for your next casts`, -bait.price);
      }
      case "equipBait": {
        if (packet.bait === "") profile.bait = "";
        else if (isBaitId(packet.bait) && (profile.baits[packet.bait] ?? 0) > 0) profile.bait = packet.bait;
        else return;
        return reply(true, profile.bait ? `${BAITS[profile.bait].emoji} ${BAITS[profile.bait].name} on the hook` : "No bait on the hook");
      }
      case "buyGear": {
        if (!isGearId(packet.gear)) return;
        if (!near) return tooFar();
        const gear = GEAR[packet.gear];
        if (gear.craft !== "fish") return reply(false, `${theGear(gear.name)}? That's woodcutter's kit: ask Buster or Bramble`);
        if (!atFinley && gear.tier >= 4) return reply(false, `${theGear(gear.name)} comes from Finley, on his boulder by the woods' river`);
        return this.buyGear(sessionId, player, profile, packet.gear, reply);
      }
      case "lockFish": {
        // a favourite: locked, no sale takes it (anywhere: it is your own livewell)
        const slot = Math.floor(Number(packet.slot));
        const f = profile.creel[slot];
        if (!f || f.s !== packet.fish) return;
        if (packet.locked) f.l = true;
        else delete f.l;
        return reply(true, packet.locked ? `🔒 Your ${FISH[f.s].name} is locked: it's staying with you` : `🔓 Your ${FISH[f.s].name} is unlocked`);
      }
      case "upgradeCreel": {
        if (!near) return tooFar();
        const next = nextCreelTier(profile.creelTier);
        if (!next) return reply(false, "That's the finest livewell on the river!");
        if (player.coins < next.price) return reply(false, `The ${next.name} is ${next.price} 🪙`);
        this.addCoins(player, -next.price);
        profile.creelTier += 1;
        profile.slots = creelTier(profile.creelTier).capacity;
        return reply(true, `${next.icon} The ${next.name}: room for ${next.capacity} fish!`, -next.price);
      }
    }
  }

  /** The reel's end: landed (believed only if it took as long as a real one can), or it got away.
   *  Either way the line goes back in. */
  private finishStarlightReel(sessionId: string, caught: boolean, openedChest = false) {
    const player = this.state.players.get(sessionId);
    const reel = this.starReels.get(sessionId);
    if (!player || !reel || player.action !== "reel") return;
    this.starReels.delete(sessionId);
    player.action = "fish";
    const landed = caught && Date.now() - reel.startedAt >= STARLIGHT_REEL_MIN_S * 1000;
    if (landed) {
      // a chest the server rolled for this reel, held in the bar until it opened
      const treasure = reel.treasure && openedChest ? this.campfirePay(sessionId, player, "fish", TREASURE_COINS) : 0;
      this.landFish(sessionId, player, reel.fish, false, treasure);
    } else {
      this.nearby(sessionId, "emote", { sessionId, emoji: "💨" });
      // a catch the server could not accept (reeled in faster than any fish comes in): the reel's
      // panel says it slipped the hook, instead of waiting on a reveal
      if (caught) this.sendTo(sessionId, "fishEscaped", {});
    }
    // the line goes back in only if the creel has room (a full one: rod stowed, no bait spent)
    if (this.creelIsFull(sessionId)) this.restByTheWater(sessionId, player);
    else this.waitForBite(sessionId, player, landed);
  }

  private stopStarlight(sessionId: string, player: Player) {
    this.starReels.delete(sessionId);
    this.pendingFish.delete(sessionId);
    this.clearAction(player);
    this.fishBiteAt.delete(sessionId);
    this.biteUntil.delete(sessionId);
    this.starlight.delete(sessionId);
  }

  private tickBall(dt: number) {
    const ball = this.state.ball;
    // Step a plain object and copy back: the schema only patches what actually changed.
    const b = { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz };
    let moving = false;
    for (let t = 0; t < dt; t += BALL_SUBSTEP) moving = stepBall(b, Math.min(BALL_SUBSTEP, dt - t)) || moving;

    // A ball left lying off the court for a while wanders home, so it can never be lost.
    this.ballIdle = moving ? 0 : this.ballIdle + dt;
    if (this.ballIdle > BALL_RESET_IDLE_S && Math.hypot(b.x - BALL_HOME.x, b.z - BALL_HOME.z) > 1) {
      Object.assign(b, BALL_HOME);
      this.ballIdle = 0;
    }

    ball.x = b.x;
    ball.y = b.y;
    ball.z = b.z;
    ball.vx = b.vx;
    ball.vy = b.vy;
    ball.vz = b.vz;
  }

  // The authoritative position comes from the client's own prediction, validated here,
  // instead of a second server-side integration running on a different clock. Two integrations
  // inevitably diverge (different dt, different message timing), and that divergence was what
  // the client had to reconcile away as a visible snap. Validating one stream keeps the server
  // in charge of collisions and bounds while leaving the walk perfectly smooth.
  private applyReportedPosition(player: Player, x?: number, z?: number, sessionId?: string) {
    if (sessionId && Date.now() < (this.arrivedUntil.get(sessionId) ?? 0)) return;
    if (typeof x !== "number" || typeof z !== "number") return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    // (kept on the floor the player stands on: the casino's hall and penthouse are joined only by
    // Bruno's doors, never by a walk)
    const kept = clampToRegion(player.map, player.x, player.z, x, z);
    let goalX = kept.x;
    let goalZ = kept.z;

    // How far this player could honestly have walked since their last report.
    const now = Date.now();
    const pace = (player.fed > 0 ? WELL_FED_SPEED : 1) * auraPace(player.aura);
    let allowed = MAX_REPORT_STEP * pace;
    if (sessionId) {
      const last = this.lastReportAt.get(sessionId);
      this.lastReportAt.set(sessionId, now);
      if (last !== undefined) {
        const elapsed = Math.min(1, (now - last) / 1000);
        allowed = Math.min(MAX_REPORT_STEP * pace, MOVE_SPEED_PER_SEC * pace * elapsed * SPEED_TOLERANCE + STEP_SLACK);
      }
    }

    // An implausibly long jump is clamped to MAX_REPORT_STEP toward the report — NOT ignored.
    // Ignoring it was a permanent-desync trap: the server's position never moved, so every later
    // report was measured against that stale anchor and rejected too, and the client never
    // reconciled either (its snap only fires when the server position CHANGES). Moving partway
    // guarantees the server position changes, which makes the client snap back to it and
    // converge, while still capping how far any single message can carry a player.
    const dx = goalX - player.x;
    const dz = goalZ - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > allowed) {
      goalX = player.x + (dx / dist) * allowed;
      goalZ = player.z + (dz / dist) * allowed;
    }

    // Only a position properly inside furniture (or out in the sea) is refused.
    if (!isBlocked(goalX, goalZ, player.map, SANITY_RADIUS)) {
      player.x = goalX;
      player.z = goalZ;
    }
  }

  /** A trip to another built world, for the one who asked (the penthouse only through Bruno). */
  private handleChangeMap(sessionId: string, mapId: unknown) {
    const player = this.state.players.get(sessionId);
    if (!player || !isMapId(mapId) || mapId === player.map || HIDDEN_MAPS.has(mapId)) return;
    if (!Object.values(WORLDS).some((w) => w.mapId === mapId && w.built)) return;
    this.travel(sessionId, player, mapId);
  }

  /**
   * Takes one player to another world: whatever they were doing in this one ends (a seat, a line in
   * the river, a skewer in the fire, the gloves, a stake on a casino table: handed back), and they
   * arrive at a spawn point (or `at`). Nobody else moves.
   */
  private travel(sessionId: string, player: Player, mapId: MapId, at?: { x: number; z: number }) {
    if (player.sitting) this.handleStandUp(sessionId);
    if (this.roasts.has(sessionId)) this.finishRoast(sessionId, player, "raw");
    if (player.action === "chop") this.cancelFell(sessionId, player);
    if (player.gloves) this.handleBoxingExit(sessionId);
    this.soakSeconds.delete(sessionId);
    this.hooked.delete(sessionId);
    this.pendingFish.delete(sessionId);
    this.biteUntil.delete(sessionId);
    this.fishBiteAt.delete(sessionId);
    this.afkTotal.delete(sessionId);
    this.starlight.delete(sessionId);
    this.starReels.delete(sessionId);
    this.stargazers.delete(sessionId);
    this.fells.delete(sessionId);
    this.clearAction(player);
    // a coffee survives the trip; a marshmallow on a stick doesn't make sense away from the fire
    if (player.holding === "marshmallow" || player.holding === "skewer") {
      player.holding = "";
      player.toast = 0;
      player.snack = "";
      this.snackUntil.delete(sessionId);
    }
    // off the casino's floors (or from one to the other): every stake still open comes back, in chips
    if (isCasinoMap(player.map)) this.casino.leaveFloor(sessionId);
    // no longer watching the board game
    if (this.board.watch(sessionId, "", false)) this.broadcastBoard();

    // the spawn is the server's word (MAP_SPAWN_POINTS: on the new world's floor, inside its rails):
    // position, heading and the echo all start again there, before the client lifts its curtain
    const spawn = at ?? this.spawnOn(mapId);
    player.map = mapId;
    player.x = spawn.x;
    player.z = spawn.z;
    player.dirX = 0;
    player.dirZ = 0;
    this.lastReportAt.delete(sessionId);
    this.arrivedUntil.set(sessionId, Date.now() + ARRIVAL_GRACE_MS);
    this.sendTo(sessionId, "travelled", { map: mapId, x: spawn.x, z: spawn.z });
  }

  /** A spawn point on `map`, the one fewest people stand near. */
  private spawnOn(map: MapId): { x: number; z: number } {
    const spawns = MAP_SPAWN_POINTS[map];
    let best = spawns[0];
    let crowd = Infinity;
    for (const sp of spawns) {
      let n = 0;
      this.state.players.forEach((p) => {
        if (p.map === map && Math.hypot(p.x - sp.x, p.z - sp.z) < 1.2) n++;
      });
      if (n < crowd) (crowd = n), (best = sp);
    }
    return best;
  }

  /**
   * Put a seated player where the seat puts them: upright on it, or, AFK on a long seat that has a
   * nap pose (shared/props.ts), lying along it with their head at the arm. Called on sitting down
   * and whenever their status changes, so an AFK nap starts and ends with the badge.
   */
  private settleInSeat(player: Player, chair: ChairState) {
    const nap = player.status === "afk" ? MAP_CHAIRS[chair.map as MapId]?.find((c) => c.propId === chair.propId)?.nap : undefined;
    if (nap) {
      player.sitPose = "lie";
      player.x = nap.x;
      player.z = nap.z;
      player.sitRotationY = nap.rotationY;
      player.sitY = nap.y;
    } else {
      player.sitPose = poseForSeat(chair.style as SeatStyle);
      player.x = chair.x;
      player.z = chair.z;
      player.sitRotationY = chair.rotationY;
      player.sitY = chair.sitY;
    }
  }

  // Seats deliberately sit INSIDE their furniture's collision box (you sit on the sofa, not
  // beside it). If we just flipped `sitting` off and left the player there, every position they
  // reported while walking away would be rejected by isBlocked, the server position would stay
  // pinned to the seat, and the client would snap backwards once the delta crossed its
  // threshold. So standing up also returns the player to the seat's approach point.
  private handleStandUp(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || !player.sitting) return;

    let vacatedId = "";
    this.state.chairs.forEach((chair) => {
      if (chair.occupiedBy === sessionId) {
        chair.occupiedBy = "";
        vacatedId = chair.propId;
      }
    });

    const config = vacatedId ? MAP_CHAIRS[PROP_MAP[vacatedId]]?.find((c) => c.propId === vacatedId) : undefined;
    if (config) {
      player.x = config.approachX;
      player.z = config.approachZ;
    }
    // getting up from one of the games table's chairs gives up its board seat with it
    if (boardSeatOfChair(vacatedId) && this.board.leave(sessionId)) {
      this.broadcastBoard();
      this.payBoardWinner();
    }

    // Getting up from a rest by the water: the mug goes back in the bag.
    if (player.action === "rest") this.putMugAway(player);
    // Standing up mid-roast takes the skewer out of the fire (as it is).
    if (this.roasts.has(sessionId)) this.finishRoast(sessionId, player, "raw");
    // You can't carry a roasting stick away from the fire.
    if (player.action === "roast" || player.holding === "marshmallow") {
      player.holding = "";
      player.toast = 0;
    }
    this.clearAction(player);
    this.fishBiteAt.delete(sessionId);
    this.biteUntil.delete(sessionId);
    this.starlight.delete(sessionId);
    this.starReels.delete(sessionId);
    this.pendingFish.delete(sessionId);
    this.lastReportAt.delete(sessionId);
    player.sitting = false;
    player.sitY = 0;
    player.dirX = 0;
    player.dirZ = 0;
  }

  private handleInteractChair(client: Client, chairId: string) {
    const player = this.state.players.get(client.sessionId);
    const chair = this.state.chairs.get(chairId);
    if (!player || !chair || chair.map !== player.map) return;

    if (player.sitting) {
      if (chair.occupiedBy === client.sessionId) this.handleStandUp(client.sessionId);
      return; // sitting in a different chair (shouldn't normally happen) — ignore
    }

    if (chair.occupiedBy !== "") return; // already taken

    const dist = Math.hypot(player.x - chair.x, player.z - chair.z);
    if (dist > INTERACT_RADIUS) return; // server-authoritative proximity check

    // the games table's chairs are its board seats: sitting on one takes that seat, and opens the board
    const seat = boardSeatOfChair(chairId);
    if (seat) {
      if (this.takeBoardSeat(client.sessionId, seat)) this.sendTo(client.sessionId, "openPanel", { kind: "boardgame", propId: "board_table" });
      return;
    }
    this.seatPlayer(client.sessionId, player, chair);
  }

  /** Sits a player on a (free) chair: the chair is theirs, and they settle into it. */
  private seatPlayer(sessionId: string, player: Player, chair: ChairState) {
    if (player.action === "brew") this.clearAction(player);
    if (player.gloves) this.handleBoxingExit(sessionId); // gloves come off to sit down
    chair.occupiedBy = sessionId;
    player.sitting = true;
    this.settleInSeat(player, chair);
    player.dirX = 0;
    player.dirZ = 0;
    this.lastReportAt.delete(sessionId);
    // round the fire: a stick with a marshmallow on it, straight into the flames
    if (player.map === "campfire_night" && chair.style === "log" && player.action === "" && !player.holding && this.state.fuel > 0) this.handleRoast(sessionId);
  }

  private handleUseProp(sessionId: string, propId: string) {
    const player = this.state.players.get(sessionId);
    const prop = this.state.toggleables.get(propId);
    if (!player || !prop || prop.map !== player.map) return;

    const kind = prop.kind as ToggleableKind;
    // Lights, the TV and the campfire work from across the room — that's what makes them feel
    // like shared ambience. The espresso machine and arcades are things you stand in front of.
    if (isWalkUpProp(kind)) {
      // (sitting on the dock's edge, you cast from where you sit; the piano's bench, a bar stool, a
      // chair by Boris's tip jar, the Chesterfield and a blackjack stool reach their props too: the
      // casino measures those reaches itself)
      if (player.sitting && !(kind === "fishing" && this.state.chairs.get(dockSeatOf(prop.propId))?.occupiedBy === sessionId) && !usableSeated(kind)) return;
      // Mochi wanders (mochiSpot, wall-clock), so her reach is measured from where she is now.
      const at = kind === "cat" ? mochiSpot(player.map, Date.now() / 1000) : prop;
      if (Math.hypot(player.x - at.x, player.z - at.z) > INTERACT_RADIUS) return;
    }

    // the casino's tables, machines, jars and set dressing (the slots, the cage and the doors below)
    if (isCasinoProp(kind) && kind !== "slot" && kind !== "cashier" && kind !== "portal") {
      this.casino.useProp(sessionId, prop);
      return;
    }

    switch (kind) {
      case "campfire":
        prop.boost = CAMPFIRE_BOOST_SECONDS; // throwing on firewood never puts the fire out
        break;
      case "turntable":
        // off -> record 1 -> record 2 -> ... -> off
        if (!prop.on) {
          prop.on = true;
          prop.track = 0;
        } else if (prop.track < LOFI_TRACKS.length - 1) {
          prop.track += 1;
        } else {
          prop.on = false;
        }
        break;
      case "slot":
        // Walking up opens the machine's own panel (unless someone is at it); spins arrive as
        // "spin_slots" with a stake.
        if (this.casino.claimMachine(sessionId, prop.propId)) this.sendTo(sessionId, "openSlots", { propId: prop.propId });
        break;
      case "stew": {
        if (!prop.on) return; // the pot is empty and being refilled
        prop.track = Math.min(STEW_STIRS, prop.track + 1);
        this.nearby(sessionId, "emote", { sessionId, emoji: "🥄" });
        if (prop.track >= STEW_STIRS) {
          // Stew's up: everyone round the fire gets a bowl.
          this.state.players.forEach((p, id) => {
            if (!p.connected || p.map !== prop.map || Math.hypot(p.x - prop.x, p.z - prop.z) > STEW_RADIUS) return;
            this.addCoins(p, STEW_REWARD);
            this.nearby(id, "emote", { sessionId: id, emoji: "🍲" });
          });
          prop.on = false;
          this.regrowAt.set(prop.propId, Date.now() + STEW_COOLDOWN_S * 1000);
        }
        break;
      }
      case "npc":
        this.sellTo(sessionId, player, prop.propId);
        break;
      case "forage": {
        if (!prop.on) return; // already picked; it grows back
        const item: ItemId = this.state.timeOfDay === "night" ? "firefly" : "berry";
        this.addItem(player, item);
        prop.on = false;
        this.regrowAt.set(prop.propId, Date.now() + FORAGE_REGROW_S * 1000);
        this.nearby(sessionId, "emote", { sessionId, emoji: ITEMS[item].emoji });
        break;
      }
      case "sparkle": {
        if (!prop.on) return; // already picked; another turns up soon
        if (Math.random() < 0.6) {
          this.addItem(player, "shell");
          this.nearby(sessionId, "emote", { sessionId, emoji: ITEMS.shell.emoji });
        } else {
          this.addCoins(player, 3 + Math.floor(Math.random() * 8));
          this.nearby(sessionId, "emote", { sessionId, emoji: "🪙" });
        }
        prop.on = false;
        this.regrowAt.set(prop.propId, Date.now() + SPARKLE_RESPAWN_S * 1000);
        break;
      }
      case "cat":
        prop.boost = 2.5; // hearts float up and she purrs while this runs down
        this.sendTo(sessionId, "openPanel", { kind: "mochi", propId: prop.propId });
        break;
      case "gacha":
      case "claw":
      case "well":
      case "teahouse":
      case "blender":
      case "kitchen":
      case "radio":
        this.sendTo(sessionId, "openPanel", { kind, propId: prop.propId });
        break;
      case "plant":
        this.waterPlant(sessionId, prop.propId);
        break;
      case "bonfire":
        this.sendTo(sessionId, "openPanel", { kind: "roast", propId: prop.propId });
        break;
      case "telescope":
        if (player.action === "" && Math.hypot(player.x - prop.x, player.z - prop.z) <= STARGAZE_REACH + 0.4) this.sendTo(sessionId, "openPanel", { kind: "stargaze", propId: prop.propId });
        break;
      case "foraging":
        this.forage(sessionId, player, prop);
        break;
      case "fireflies":
        this.catchFireflies(sessionId, player, prop);
        break;
      case "critter": {
        // a treat tossed to the raccoon: it spins for joy (everyone sees it)
        if (player.sitting || Math.hypot(player.x - prop.x, player.z - prop.z) > CRITTER_REACH + 0.4) return;
        const now = Date.now();
        if (now - (this.lastTreatAt.get(sessionId) ?? 0) < TREAT_COOLDOWN_MS) return;
        this.lastTreatAt.set(sessionId, now);
        this.playGesture(sessionId, "toss");
        this.toMap("campfire_night", "critterTreat", { sessionId });
        break;
      }
      case "lumberjack":
        if (Math.hypot(player.x - prop.x, player.z - prop.z) > BUSTER_REACH + 1.2) return;
        this.sendTo(sessionId, "openPanel", { kind: "buster", propId: prop.propId });
        this.toMap("campfire_night", "busterWave", { sessionId });
        break;
      case "boutique":
        // Chloe at the Velvet Boutique (or her mirror): she curtsies, and the wardrobe opens
        if (Math.min(Math.hypot(player.x - BOUTIQUE.chloe.x, player.z - BOUTIQUE.chloe.z), Math.hypot(player.x - BOUTIQUE.mirror.x, player.z - BOUTIQUE.mirror.z)) > BOUTIQUE_REACH + 1.0) return;
        this.sendTo(sessionId, "openPanel", { kind: "boutique", propId: prop.propId });
        this.toMap("cozy_lounge", "chloeWave", { sessionId });
        break;
      case "workbench":
        if (Math.hypot(player.x - prop.x, player.z - prop.z) > WORKBENCH_REACH + 1.0) return;
        this.sendTo(sessionId, "openPanel", { kind: "workbench", propId: prop.propId });
        break;
      case "cashier":
        // Mr. Vance's window: the cage modal (the exchange itself is "buyChips" / "cashOut"); he
        // waves, and everyone sees it
        this.sendTo(sessionId, "openPanel", { kind: "cashier", propId: prop.propId });
        this.toMap("velvet_casino", "vanceWave", { sessionId });
        break;
      case "portal":
        // the casino's exit doors: the world drawer, to go back to the Lounge or anywhere else
        this.sendTo(sessionId, "openPanel", { kind: "worlds", propId: prop.propId });
        break;
      case "angler":
        if (prop.propId === "finley") {
          // Finley the River Otter, the woods' angler
          if (Math.hypot(player.x - FINLEY_FRONT.x, player.z - FINLEY_FRONT.z) > FINLEY_REACH + 1.2) return;
          this.sendTo(sessionId, "openPanel", { kind: "finley", propId: prop.propId });
          this.toMap("whispering_woods", "finleyWave", { sessionId });
          break;
        }
        if (Math.hypot(player.x - prop.x, player.z - prop.z) > BARNABY_REACH + 1.2) return;
        this.sendTo(sessionId, "openPanel", { kind: "barnaby", propId: prop.propId });
        this.toMap("campfire_night", "barnabyWave", { sessionId });
        break;
      case "fishing":
        if (player.action === "fish" || player.action === "afkfish") this.handleReelIn(sessionId);
        else this.handleCastLine(sessionId, false, prop.propId);
        break;
      case "archway":
        this.useArchway(sessionId, player);
        break;
      case "tree": {
        // a tree: the radial felling panel (its swings start from there)
        const node = fellTreeOf(prop.propId);
        if (node && player.action === "" && prop.on && Math.hypot(player.x - prop.x, player.z - prop.z) <= fellReach(node) + 0.6) this.sendTo(sessionId, "openPanel", { kind: "fell", propId: prop.propId });
        break;
      }
      case "splitblock":
        this.sendTo(sessionId, "openPanel", { kind: "splitblock", propId: prop.propId });
        break;
      case "slingshot":
        this.sendTo(sessionId, "openPanel", { kind: "slingshot", propId: prop.propId });
        break;
      case "ranger":
        if (Math.hypot(player.x - prop.x, player.z - prop.z) > BRAMBLE_REACH + 1.2) return;
        this.sendTo(sessionId, "openPanel", { kind: "bramble", propId: prop.propId });
        this.toMap("whispering_woods", "brambleWave", { sessionId });
        break;
      case "animal":
        this.feedAnimal(sessionId, player, prop.propId);
        break;
      case "boardgame":
        // walking up to the table seats you at it (seat 1, or seat 2 opposite whoever has it);
        // with both seats taken you stay standing and the board opens for you to watch
        this.takeBoardSeat(sessionId);
        this.sendTo(sessionId, "openPanel", { kind, propId: prop.propId });
        break;
      case "jukebox":
        this.sendTo(sessionId, "openPanel", { kind, propId: prop.propId });
        break;
      case "espresso":
        if (player.action === "brew") return;
        if (player.holding === "marshmallow") player.toast = 0;
        player.holding = "";
        player.action = "brew";
        player.actionProgress = 0;
        break;
      default:
        prop.on = !prop.on;
    }
  }

  private sellTo(sessionId: string, player: Player, propId: string) {
    const npc = NPCS[propId];
    if (!npc) return;
    const bag = parseBag(player.bag);
    let earned = 0;
    for (const [id, count] of Object.entries(bag) as [ItemId, number][]) {
      if (ITEMS[id].buyer !== npc.npc) continue;
      earned += ITEMS[id].value * count;
      delete bag[id];
    }
    if (earned === 0) {
      this.sendTo(sessionId, "npcSay", { propId, text: npc.npc === "bob" ? "Bring me some fish, matey! 🎣" : "Berries by day, fireflies by night. 🌲" });
      return;
    }
    player.bag = encodeBag(bag);
    this.addCoins(player, earned);
    this.nearby(sessionId, "emote", { sessionId, emoji: earned >= 100 ? "💰" : "🪙" });
    this.sendTo(sessionId, "npcSay", { propId, text: `Thanks! Here's ${earned} 🪙` });
  }

  private sendTo(sessionId: string, type: string, payload: unknown) {
    this.clients.find((c) => c.sessionId === sessionId)?.send(type, payload);
  }

  private handleRoast(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || !player.sitting || player.action === "roast") return;
    // Only from a log bench by the fire.
    let onLog = false;
    this.state.chairs.forEach((chair) => {
      if (chair.occupiedBy === sessionId && chair.style === "log") onLog = true;
    });
    if (!onLog) return;

    player.holding = "marshmallow";
    player.toast = 0;
    player.action = "roast";
  }

  private handleEat(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || player.holding !== "marshmallow") return;
    // The reaction depends on how long you left it in the fire.
    const emoji = player.toast < 0.55 ? "😋" : player.toast <= 1.15 ? "🤩" : "😵";
    this.bumpStat(player, "marshmallows_roasted");
    this.daily(sessionId, player, "roast_marshmallow");
    this.nearby(sessionId, "emote", { sessionId, emoji });
    player.holding = "";
    player.toast = 0;
    this.clearAction(player);
    this.feed(sessionId, player);
  }

  private handleKick(sessionId: string, msg: { dirX: number; dirZ: number }) {
    const player = this.state.players.get(sessionId);
    if (!player || player.map !== "sunset_beach" || player.sitting) return;
    if (!Number.isFinite(msg?.dirX) || !Number.isFinite(msg?.dirZ)) return;
    const now = Date.now();
    if (now - (this.lastKickAt.get(sessionId) ?? 0) < KICK_COOLDOWN_MS) return;
    const ball = this.state.ball;
    // The server's copy of the player is one report behind, so allow extra reach for latency.
    if (Math.hypot(player.x - ball.x, player.z - ball.z) > KICK_REACH + 0.9) return;
    if (ball.y > 1.2) return; // already in the air
    this.lastKickAt.set(sessionId, now);
    const b = { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz };
    kickBall(b, msg.dirX, msg.dirZ);
    ball.vx = b.vx;
    ball.vy = b.vy;
    ball.vz = b.vz;
    ball.y = b.y;
    this.ballIdle = 0;
  }

  private scheduleAfkCatch(sessionId: string, now: number) {
    const total = (AFK_FISH_MIN_S + Math.random() * (AFK_FISH_MAX_S - AFK_FISH_MIN_S)) * 1000;
    this.afkTotal.set(sessionId, total);
    this.fishBiteAt.set(sessionId, now + total);
  }

  /** A picked sparkle reappears somewhere else on the sand, never on top of another one. */
  private moveSparkle(prop: ToggleableState) {
    const taken = new Set<string>();
    this.state.toggleables.forEach((t) => {
      if (t.kind === "sparkle" && t.map === prop.map && t !== prop) taken.add(`${t.x},${t.z}`);
    });
    const free = SPARKLE_SPOTS.filter((s) => !taken.has(`${s.x},${s.z}`));
    const spot = free[Math.floor(Math.random() * free.length)];
    if (spot) {
      prop.x = spot.x;
      prop.z = spot.z;
    }
  }

  private handleCastLine(sessionId: string, afk = false, spotId = "") {
    const player = this.state.players.get(sessionId);
    // (resting by the water with a full creel counts as free: the guard below decides)
    if (!player || (player.action !== "" && player.action !== "rest")) return;
    // the woods' river: at one of its bank spots (one angler to a spot), standing, or sitting on its
    // log or rock (you are sat down on it as you cast)
    if (player.map === "whispering_woods") {
      let seatId = "";
      this.state.chairs.forEach((chair) => {
        if (chair.occupiedBy === sessionId) seatId = chair.propId;
      });
      const bySeat = woodsSpotOfSeat(seatId);
      if (player.sitting && !bySeat) return;
      const spot = FOREST_FISHING.find((f) => f.propId === (bySeat ?? spotId)) ?? FOREST_FISHING.reduce((a, b) => (Math.hypot(b.stand.x - player.x, b.stand.z - player.z) < Math.hypot(a.stand.x - player.x, a.stand.z - player.z) ? b : a));
      if (!player.sitting && Math.hypot(player.x - spot.stand.x, player.z - spot.stand.z) > FISHING_REACH + 0.8 && Math.hypot(player.x - spot.approach.x, player.z - spot.approach.z) > FISHING_REACH + 0.3) return;
      if (!player.sitting && spot.seat) {
        const seat = this.state.chairs.get(spot.seat);
        if (!seat) return;
        if (seat.occupiedBy !== "") {
          this.sendTo(sessionId, "campfireNotice", { message: "Someone's sitting there. Try the next spot along the bank", emoji: "🎣" });
          return;
        }
        this.seatPlayer(sessionId, player, seat);
      }
      const holder = this.rapidsAnglers.get(spot.propId);
      if (holder && holder !== sessionId && this.state.players.get(holder)?.map === "whispering_woods") {
        this.sendTo(sessionId, "campfireNotice", { message: "Someone's fishing that eddy. Try the next one along the bank", emoji: "🎣" });
        return;
      }
      if (this.creelIsFull(sessionId)) {
        this.sendTo(sessionId, "campfireNotice", { message: "Your livewell's full: sell some fish to Bramble or Barnaby first", emoji: "🪣" });
        return;
      }
      this.rapidsAnglers.set(spot.propId, sessionId);
      if (player.action === "rest") this.putMugAway(player);
      player.action = "fish";
      player.actionProgress = 0;
      this.starlight.add(sessionId);
      this.waitForBite(sessionId, player, true);
      return;
    }
    // the campfire's river: from the dock's edge at one of its spots (one angler to a spot), sitting
    // with your legs over the water; a bite, a tap, then the reel
    if (player.map === "campfire_night") {
      const spot = FISHING_SPOTS.find((f) => f.propId === spotId) ?? nearestFishingSpot(player.x, player.z);
      const seat = this.state.chairs.get(dockSeatOf(spot.propId));
      if (!seat) return;
      if (!player.sitting) {
        if (Math.hypot(player.x - spot.approach.x, player.z - spot.approach.z) > FISHING_REACH + 0.3 && !this.nearProp(player, "fishing", FISHING_REACH)) return;
        if (seat.occupiedBy !== "") {
          this.sendTo(sessionId, "campfireNotice", { message: "Someone's already fishing there. Try the next spot along the dock", emoji: "🎣" });
          return;
        }
        this.seatPlayer(sessionId, player, seat);
      } else if (seat.occupiedBy !== sessionId) {
        return; // sitting somewhere else
      }
      // the pre-cast guard: a full creel means no cast (and no bait spent)
      if (this.creelIsFull(sessionId)) {
        if (player.action === "rest") this.sendTo(sessionId, "campfireNotice", { message: "Your creel's still full: sell some fish to Barnaby first", emoji: "🪣" });
        this.restByTheWater(sessionId, player);
        return;
      }
      if (player.action === "rest") this.putMugAway(player);
      player.action = "fish";
      player.actionProgress = 0;
      this.starlight.add(sessionId);
      this.waitForBite(sessionId, player, true);
      return;
    }
    let onPier = false;
    this.state.chairs.forEach((chair) => {
      if (chair.occupiedBy === sessionId && isFishingSeat(chair.propId)) onPier = true;
    });
    if (!onPier) return;
    player.actionProgress = 0;
    if (afk) {
      player.action = "afkfish";
      this.scheduleAfkCatch(sessionId, Date.now());
      return;
    }
    player.action = "fish";
    this.fishBiteAt.set(sessionId, Date.now() + randomBiteDelay());
  }

  private handleEmote(sessionId: string, emoji: string) {
    if (!ALLOWED_EMOTES.has(emoji)) {
      const prize = CASINO_EMOTES.get(emoji);
      const player = this.state.players.get(sessionId);
      if (!prize || !player || !this.owns(player, capsuleUnlock(prize))) return;
    }
    const now = Date.now();
    if (now - (this.lastEmoteAt.get(sessionId) ?? 0) < EMOTE_COOLDOWN_MS) return; // spam guard
    this.lastEmoteAt.set(sessionId, now);
    this.nearby(sessionId, "emote", { sessionId, emoji });
  }

  private clearAction(player: Player) {
    player.action = "";
    player.actionProgress = 0;
  }

  async onJoin(client: Client, options: { userId: string; username: string; avatarUrl: string }) {
    const player = new Player();
    // The Discord user id keys the persisted record; a session id stands in when there is none.
    player.userId = String(options?.userId || `guest_${client.sessionId}`);
    player.username = cleanDisplayName(options?.username);
    player.avatarUrl = String(options?.avatarUrl ?? "");
    player.color = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
    // everyone arrives in the lounge, at its least crowded spawn point
    player.map = "cozy_lounge";
    const spawn = this.spawnOn("cozy_lounge");
    player.x = spawn.x;
    player.z = spawn.z;

    // Returning players come back with their wallet, hats, look and stats; newcomers get the
    // starter grant. A store outage must not keep anyone out: fall back to a fresh record.
    let record: PlayerRecord | null = null;
    try {
      record = await getPlayerStore().load(player.userId);
    } catch (err) {
      console.error("[db] load failed, starting a fresh record:", err instanceof Error ? err.message : err);
    }
    const isNew = !record;
    if (!record) record = newPlayerRecord(player.userId, player.username);
    record.username = player.username;
    player.coins = record.coins;
    player.chips = record.casino.chips;
    player.vipPass = record.casino.vipPass;
    player.vipWristbands = record.casino.wristbands ?? 0;
    player.owned = record.unlockedItems.join(",");
    const title = record.casino.title;
    player.title = title && record.unlockedItems.includes(capsuleUnlock({ kind: "title", id: title })) ? title : "";
    this.createdAt.set(client.sessionId, record.createdAt?.getTime() ?? 0);
    player.watered = record.plantsWatered.day === todayKey() ? record.plantsWatered.ids.join(",") : "";
    player.stats = JSON.stringify(record.stats);
    const look = fromStoredLook(record.equippedLook as any);
    if (look && this.ownsOutfit(record.unlockedItems, look.outfit) && this.ownsHair(record.unlockedItems, look.hairStyle)) {
      player.look = encodeLook(look);
      player.color = look.outfitColor;
    }
    const daily = record.daily && record.daily.date === todayKey() ? record.daily : rollDaily(player.userId);
    record.daily = daily;
    player.daily = JSON.stringify(daily);
    player.fishing = JSON.stringify(record.fishing);
    player.fed = Math.max(0, Math.ceil((record.fishing.fedUntil - Date.now()) / 1000));
    this.vibeAt.set(client.sessionId, Date.now());
    this.records.set(client.sessionId, record);
    // The catch bucket is a session thing (the traders buy it); it survives a reconnect only.
    const wallet = this.wallets.get(player.userId);
    if (wallet) player.bag = wallet.bag;

    // this person's own lingering session (dropped, waiting to reconnect): take it over
    const ghosts: [string, Player][] = [];
    this.state.players.forEach((old, oldId) => {
      if (oldId !== client.sessionId && !old.connected && old.userId === player.userId) ghosts.push([oldId, old]);
    });
    let resumedSeat = false;
    for (const [oldId, old] of ghosts) resumedSeat = this.takeOver(oldId, old, client.sessionId, player) || resumedSeat;

    this.state.players.set(client.sessionId, player);
    // back after a restart to a board game they were playing: their seat was held, so they sit
    // straight back down on its chair and the game goes on
    const heldSide = this.board.reservedSide(player.userId);
    const heldChair = heldSide ? this.state.chairs.get(BOARD_SEAT_CHAIRS[heldSide]) : undefined;
    if (heldSide && heldChair && !heldChair.occupiedBy && player.map === "cozy_lounge") {
      this.board.claim(heldSide, client.sessionId);
      this.seatPlayer(client.sessionId, player, heldChair);
      resumedSeat = true;
    }
    if (isNew) this.persist(client.sessionId, player, true);
    else this.savedSignature.set(client.sessionId, "");
    this.sendTo(client.sessionId, "welcome", { isNew, coins: player.coins, build: BUILD_ID });
    this.sendTo(client.sessionId, "pioneer", this.pioneerInfo(client.sessionId, player));
    // a game already on at the board table: the newcomer's avatars know whose turn it is
    if (this.board.seats.w || this.board.seats.b) this.sendTo(client.sessionId, "boardState", this.boardView());
    // back in their seat at the board: everyone sees the new session there, and their board reopens
    if (resumedSeat) {
      this.broadcastBoard();
      this.sendTo(client.sessionId, "openPanel", { kind: "boardgame", propId: "board_table" });
    }
  }

  /** The Velvet Pioneer set, for this player: can they claim it, have they, and until when. */
  private pioneerInfo(sessionId: string, player: Player): PioneerInfo {
    const wipeAt = getWipeAt();
    const owned = player.owned.split(",");
    const claimed = owned.includes(PIONEER_SET.hat) && owned.includes(PIONEER_SET.outfit) && owned.includes(capsuleUnlock({ kind: "title", id: PIONEER_SET.title }));
    return { eligible: pioneerEligible(this.createdAt.get(sessionId) ?? 0, wipeAt), claimed, until: pioneerUntil(wipeAt) };
  }

  /** Claims the Velvet Pioneer set (0 coins): the cap, the overalls and the title, for an account
   *  from before the wipe, inside its two weeks. */
  private handleClaimPioneer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const info = this.pioneerInfo(sessionId, player);
    if (!info.eligible || info.claimed) return this.sendTo(sessionId, "pioneer", info);
    this.grant(player, PIONEER_SET.hat);
    this.grant(player, PIONEER_SET.outfit);
    this.grant(player, capsuleUnlock({ kind: "title", id: PIONEER_SET.title }));
    // the title goes on at once, in gold
    if (specialTitle(PIONEER_SET.title)) player.title = PIONEER_SET.title;
    this.persist(sessionId, player, true);
    this.nearby(sessionId, "emote", { sessionId, emoji: "🛠️" });
    this.sendTo(sessionId, "pioneer", { ...this.pioneerInfo(sessionId, player), justClaimed: true });
  }

  private ownsOutfit(unlocked: string[], outfit: string): boolean {
    return (STARTER_OUTFITS as string[]).includes(outfit) || unlocked.includes(outfit);
  }

  /** The starter styles are everyone's; a fancy one has to have been bought. */
  private ownsHair(unlocked: string[], style: string): boolean {
    return isHairStyle(style) && (HAIR_DEFINITIONS[style].price === 0 || unlocked.includes(hairUnlockId(style)));
  }

  private removePlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const leftTable = this.board.leave(sessionId);
    if (this.board.watch(sessionId, "", false) || leftTable) {
      this.broadcastBoard();
      this.payBoardWinner();
    }
    this.vibeAt.delete(sessionId);
    this.arrivedUntil.delete(sessionId);
    this.createdAt.delete(sessionId);
    this.soakSeconds.delete(sessionId);
    this.roasts.delete(sessionId);
    this.snackUntil.delete(sessionId);
    this.lastRoastAt.delete(sessionId);
    this.starlight.delete(sessionId);
    this.stargazers.delete(sessionId);
    this.fells.delete(sessionId);
    this.lastChopAt.delete(sessionId);
    this.slingRounds.delete(sessionId);
    this.lastFeedAt.delete(sessionId);
    this.starReels.delete(sessionId);
    this.pendingFish.delete(sessionId);
    this.lastNetAt.delete(sessionId);
    this.lastTreatAt.delete(sessionId);
    this.hooked.delete(sessionId);
    // Bets on the wheel and an unfinished blackjack hand come back, in chips.
    this.casino.release(sessionId);
    if (player.userId) this.wallets.set(player.userId, { coins: player.coins, bag: player.bag, owned: player.owned });
    // Flush straight to the database: nothing pending may be lost with the player gone.
    this.persist(sessionId, player, true);
    this.records.delete(sessionId);
    this.savedSignature.delete(sessionId);
    this.lastChatAt.delete(sessionId);
    this.state.players.delete(sessionId);
    this.lastEmoteAt.delete(sessionId);
    this.lastGestureAt.delete(sessionId);
    this.lastTipAt.delete(sessionId);
  }

  async onLeave(client: Client, consented: boolean) {
    const sessionId = client.sessionId;
    const player = this.state.players.get(sessionId);
    if (!player) return;

    player.speaking = false;
    if (this.roasts.has(sessionId)) this.finishRoast(sessionId, player, "raw");
    this.starlight.delete(sessionId);
    this.clearAction(player);
    this.fishBiteAt.delete(sessionId);
    this.biteUntil.delete(sessionId);
    this.lastReportAt.delete(sessionId);
    if (consented) {
      this.releaseSeat(sessionId, player);
      this.removePlayer(sessionId);
      return;
    }

    // Dropped, not left (a proxy cut an idle socket, the network blinked): write what we have now
    // in case they never come back, and keep their chair, and with it their board seat, so a game
    // of chess survives the blip. Only if they do not come back in time are they got up.
    this.persist(sessionId, player, true);
    player.connected = false;
    try {
      const back = await this.allowReconnection(client, RECONNECT_WINDOW_S);
      if (this.state.players.get(sessionId) !== player) {
        back.leave(); // they came back on a new session meanwhile, which took this one over
        return;
      }
      player.connected = true;
      this.welcomeBack(back);
    } catch {
      if (this.state.players.get(sessionId) !== player) return;
      this.releaseSeat(sessionId, player);
      this.removePlayer(sessionId);
    }
  }

  /** Gets a player off whatever they sit on (and so off the board table, if that is where). */
  private releaseSeat(sessionId: string, player: Player) {
    let boardChair = false;
    this.state.chairs.forEach((chair) => {
      if (chair.occupiedBy !== sessionId) return;
      chair.occupiedBy = "";
      if (boardSeatOfChair(chair.propId)) boardChair = true;
    });
    player.sitting = false;
    if (boardChair && this.board.leave(sessionId)) {
      this.broadcastBoard();
      this.payBoardWinner();
    }
  }

  /**
   * A player back after a drop: the table as it stands, and if they sit at it, the board opened
   * again, so their game resumes where it was.
   */
  private welcomeBack(client: Client) {
    const seated = !!this.board.sideOf(client.sessionId);
    if (seated || this.board.watchers.has(client.sessionId)) client.send("boardState", this.boardView());
    if (seated) client.send("openPanel", { kind: "boardgame", propId: "board_table" });
  }

  /**
   * The same person joining on a new session while their old one still waits to reconnect (its
   * token was lost: a reload in a new webview, cleared storage): the new session takes the old
   * one over, where it stood or sat, its chair and its board seat, so nobody meets their own ghost
   * and a game in progress carries on. Returns whether a board seat came along.
   */
  private takeOver(oldId: string, old: Player, sessionId: string, player: Player): boolean {
    // the dropped session's wallet and creel are the newest (its last writes may still be queued)
    const oldRecord = this.records.get(oldId);
    const record = this.records.get(sessionId);
    if (oldRecord && record) {
      record.coins = oldRecord.coins;
      record.fishing = oldRecord.fishing;
      record.campfireCoins = oldRecord.campfireCoins;
      record.casino = oldRecord.casino;
      player.coins = old.coins;
      player.chips = old.chips;
      player.vipPass = old.vipPass;
      player.vipWristbands = old.vipWristbands;
      player.title = old.title;
      player.fishing = JSON.stringify(record.fishing);
      player.fed = old.fed;
    }
    player.map = old.map;
    player.x = old.x;
    player.z = old.z;
    player.sitting = old.sitting;
    player.sitRotationY = old.sitRotationY;
    player.sitY = old.sitY;
    player.sitPose = old.sitPose;
    this.state.chairs.forEach((chair) => {
      if (chair.occupiedBy === oldId) chair.occupiedBy = sessionId;
    });
    const seated = this.board.transfer(oldId, sessionId);
    // bets on the wheel and a hand at the blackjack table move over before the old session goes
    // (removing it would hand them back to a player about to vanish)
    this.casino.transfer(oldId, sessionId);
    this.removePlayer(oldId); // quietly: the chair and the seat have already moved on
    return seated;
  }

  /**
   * Nothing a player sends, and nothing on a timer, may take the server down or close anyone's
   * connection: with this defined, Colyseus runs every message handler, timer and lifecycle hook
   * inside a try/catch and hands what it catches here. The sender of a bad message is told.
   */
  onUncaughtException(err: RoomException<this>, methodName: string) {
    const cause = (err as Error & { cause?: unknown }).cause;
    console.error(`[room ${this.roomId}] uncaught in ${methodName}:`, cause instanceof Error ? cause.stack : cause ?? err);
    if (!(err instanceof OnMessageException)) return;
    try {
      if (err.type === "board") this.boardRefused(err.client, "Something went wrong with that move");
      else err.client.send("serverError", { type: err.type, message: "Something went wrong, try again" });
    } catch {
      // the sender is gone: nothing to tell
    }
  }

  /**
   * A deploy or a restart. The default would disconnect everyone as if they had chosen to leave,
   * and leaving walks out on a board game (a forfeit). So the table is frozen first (nothing that
   * happens as everyone is let go is saved), written as it stands, and only then is everyone let
   * go. The next server puts the game back and holds the seats for their players.
   */
  onBeforeShutdown() {
    // a deploy or a restart: every client lets go of the room and rejoins in memory once the server
    // is back, or asks its player to start the Activity afresh if new client code is live
    // (client/src/systems/lifecycle.ts); never a reload of Discord's frame
    this.broadcast("server_restarting", { inS: 3 });
    this.boardFrozen = true;
    void this.writeBoard().finally(() => super.onBeforeShutdown());
  }

  /** Discord ids of everyone connected (the lounge selector's head count). */
  connectedUserIds(): string[] {
    const out: string[] = [];
    this.state.players.forEach((p) => {
      if (p.connected) out.push(p.userId);
    });
    return out;
  }

  async onDispose() {
    unregisterRoom(this.guildKey, this);
    clearTimeout(this.boardSaveTimer);
    if (!this.boardFrozen) await this.writeBoard();
    await this.queue.flush();
    console.log(`Room ${this.roomId} disposed`);
  }
}


/** How often the room checks whether its scene changed (and saves it if so). */
const SCENE_SAVE_EVERY_S = 3;
/** A guild's scene, as saved (restoreScene). */
interface SavedScene {
  time: TimeOfDay;
  /** The lounge's weather (a scene saved before the weather had none: clear). */
  weather?: Weather;
  fuel: number;
  stew: string;
  picnic: string;
  /** The coin pushers' shelves (shared/pusherSim.ts saveShelf, by pusher). A scene saved before the
   *  shelves had coins kept only a number (`pusher`): its shelves are laid out new. */
  pushers?: Record<string, number[]>;
  /** The trees (not a Titan): each one's size, rounds landed and needed, and when it fell. */
  trees?: Record<string, { scale: number; dmg: number; rounds: number; fellAt: number }>;
  /** A Colossal Titan standing when the scene was saved (it waits to be felled), with its notch. */
  titan?: { id: string; x: number; z: number; dmg: number; rounds: number };
}

/** A burst of board changes is saved once, this long after the last. */
const BOARD_SAVE_DEBOUNCE_MS = 300;
/** How long a dropped player's avatar, chair and board seat wait for them to reconnect. */
const RECONNECT_WINDOW_S = 60;

/** A roast can start again this long after the last one came off the fire. */
const ROAST_COOLDOWN_MS = 1500;
/** Between one felling and the next (per player). */
const CHOP_COOLDOWN_MS = 900;
/** A feller idle this long (no swing) lets the tree go. */
const FELL_IDLE_S = 25;
/** The wait before the next living wonder: 45 to 60 minutes. */
/** A piece of gear named in a sentence: "the Amber Resin Band", but a keeper's own piece keeps
 *  its owner's name alone ("Finley's Lucky Bell"). */
function theGear(name: string, capital = true): string {
  return name.startsWith("Finley's ") ? name : `${capital ? "The" : "the"} ${name}`;
}

function wonderGap(): number {
  return (WORLD_EVENT_EVERY_MIN[0] + Math.random() * (WORLD_EVENT_EVERY_MIN[1] - WORLD_EVENT_EVERY_MIN[0])) * 60_000;
}
/** Between treats for the raccoon (per player), and between a duck's dives. */
const TREAT_COOLDOWN_MS = 2000;
const DUCK_DIVE_COOLDOWN_MS = 1800;
/** How long after a trip between worlds the reports walked on the old one are ignored. */
const ARRIVAL_GRACE_MS = 700;

/** Sitting cross-legged on the ground: the avatar's height, derived from the ground "cushion". */
const GROUND_SIT_Y = Math.round(seatAnchorY(CUSHIONS.ground) * 1000) / 1000;


/** 5-12 seconds between bites: long enough to feel like fishing, short enough to stay fun. */
function randomBiteDelay(): number {
  return 5000 + Math.random() * 7000;
}
