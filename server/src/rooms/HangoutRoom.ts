import { Room, Client, OnMessageException, type RoomException } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, clampToWorld, isBlocked } from "../../../shared/collision";
import { PersistenceQueue, getPlayerStore, newPlayerRecord, type PlayerRecord } from "../db/players";
import { outfitPrice, progressDaily, rollDaily, rollFish, rollGacha, todayKey } from "./games";
import { AWAY_PREFIX, BoardTable } from "./boardgame";
import { getBoardStore } from "../db/boards";
import { BOARD_SEAT_CHAIRS, GAMES, boardSeatOfChair } from "../../../shared/worlds/lounge";
import { BUSTER_FRONT, BUSTER_REACH, BARNABY_FRONT, BARNABY_REACH, BONFIRE_REACH, CAMPFIRE_LAYOUT, CHOP_REACH, CRITTER_REACH, DUCK_PATHS, FIREFLY_REACH, FISHING_REACH, FISHING_SPOTS, FORAGE_REACH, FORAGE_SPOTS, PICNIC_REACH, STARGAZE_REACH, dockSeatOf, nearestFishingSpot, spotOfSeat } from "../../../shared/worlds/campfire";
import { CUSHIONS, seatAnchorY } from "../../../shared/seats";
import { AXES, CARRIER_CAPACITY, CARRIER_UPGRADE_COSTS, CHOP_LOGS, CHOP_RESPAWN_S, WOOD, carrierCapacity, isAxeId, isWoodKind, judgeChop, rollChopLog, rollChopStroke, type ChopLog, type ChopStroke, type ChopStrokeNo } from "../../../shared/chop";
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
  creelUpgradeCost,
  fishValue,
  isBaitId,
  isRodId,
  rollCatch,
  rollFish as rollRiverFish,
  type BaitId,
  type CreelFish,
  type FishId,
} from "../../../shared/fishing";
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
  parsePicnic,
  parseStew,
  stewName,
  type BonfireUpdate,
  type PicnicPlate,
  type StewState,
  type StewUpdate,
} from "../../../shared/bonfire";
import { emptyCampfireCoins } from "../db/players";
import { MAP_CHAIRS, MAP_TOGGLEABLES, isFishingSeat, isWaterable, mochiSpot } from "../../../shared/props";
import { BALL_HOME, KICK_REACH, kickBall, stepBall } from "../../../shared/volleyball";
import {
  BITE_WINDOW_S,
  CAMPFIRE_DAILY_COINS,
  CHOP_CLEAN_COINS,
  FORAGE_COINS,
  FORAGE_INFO,
  FORAGE_REGROW_CAMP_S,
  STAR_SPARK_COINS,
  STARLIGHT_REEL_MIN_S,
  type StarlightReel,
  type CampfireCoinKind,
  type ChopResult,
  CHOP_STUN_S,
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
  MAX_BET_TOTAL,
  NPCS,
  PREMIUM_HATS,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  ROULETTE_PHASE_SECONDS,
  SLOT_COST,
  SLOT_SYMBOLS,
  SLOT_TRIPLE,
  STARTING_COINS,
  TIMES_OF_DAY,
  CHIP_VALUES,
  betReturn,
  encodeBag,
  encodeBets,
  isBetKind,
  isGesture,
  isPremiumHat,
  parseBag,
  parseBets,
  type ItemId,
  type RoulettePhase,
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
  BLACKJACK_BETS,
  BLACKJACK_CENTER,
  BLACKJACK_RADIUS,
  CHAT_MAX_CHARS,
  DEFAULT_STATS,
  SLOT_BETS,
  STEW_COOLDOWN_S,
  STEW_RADIUS,
  STEW_REWARD,
  STEW_STIRS,
  blackjackTotal,
  parseStats,
  type BlackjackAction,
  type BlackjackCard,
  type BlackjackOutcome,
  type BlackjackPhase,
  type BlackjackView,
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
  isOutfitId,
  toStoredLook,
  type DailyTaskId,
  type FishOnLine,
  type FishingWater,
  type MochiAction,
} from "../../../shared/types";

class Player extends Schema {
  @type("string") userId = "";
  @type("string") username = "";
  @type("string") avatarUrl = "";
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
  @type("string") bag = "";
  @type("string") owned = "";
  @type("string") status = "";
  @type("string") stats = JSON.stringify(DEFAULT_STATS);
  @type("number") ping = 0;
  @type("boolean") gloves = false;
  @type("number") boxHits = 0;
  @type("number") boxKOs = 0;
  @type("string") aura = "";
  @type("string") daily = "";
  /** The angler's FishingProfile as JSON (the record's copy is the one kept). */
  @type("string") fishing = "";
  /** Whole seconds left Well-Fed. */
  @type("number") fed = 0;
}

// The shared roulette wheel in the casino. One loop for the whole room: 25 s of betting, a 6 s
// spin everyone watches together, then 4 s of payouts. Only the phase, a whole-second countdown
// and the result are synced; the wheel's motion is animated client-side from spinId + result.
class RouletteSchema extends Schema {
  @type("string") phase: RoulettePhase = "betting";
  @type("number") timeLeft = ROULETTE_PHASE_SECONDS.betting;
  @type("number") result = -1;
  @type("number") spinId = 0;
}

// How near the board game table you must be to take a seat at it
const BOARD_REACH = 3.2;
// How soon after one drink the kitchenette will pour another
const KITCHEN_COOLDOWN_MS = 2000;

class ChairState extends Schema {
  @type("string") propId = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") rotationY = 0;
  @type("string") style = "pad";
  @type("number") sitY = 0;
  @type("string") occupiedBy = ""; // sessionId, or "" if free
}

class ToggleableState extends Schema {
  @type("string") propId = "";
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
  @type("string") currentMap: MapId = "cozy_lounge";
  @type("string") timeOfDay: TimeOfDay = "day";
  @type("boolean") mapTransitioning = false;
  @type(BallSchema) ball = new BallSchema();
  @type(RouletteSchema) roulette = new RouletteSchema();
  /** Roulette bets on the table this round, per sessionId, as encodeBets() strings. */
  @type({ map: "string" }) bets = new MapSchema<string>();
  @type("boolean") autoCycle = false;
  /** The persisted High Rollers table (LeaderboardEntry[] as JSON), refreshed every few seconds. */
  @type("string") leaderboard = "[]";
  /** The Campfire's bonfire, 0..FUEL_MAX (shared/bonfire.ts): it burns down; firewood builds it up. */
  @type("number") fuel = FUEL_START;
  /** The Dutch oven over it (a StewState as JSON). */
  @type("string") stew = "";
  /** Skewers left on the picnic table (PicnicPlate[] as JSON). */
  @type("string") picnic = "";
}

// --- blackjack: one hand per player, dealt and settled entirely on the server ---
interface BlackjackGame {
  deck: BlackjackCard[];
  player: BlackjackCard[];
  dealer: BlackjackCard[];
  bet: number;
  phase: BlackjackPhase;
  outcome: BlackjackOutcome;
  payout: number;
}
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];
function freshDeck(): BlackjackCard[] {
  const deck: BlackjackCard[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
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
const MAP_SIGNATURE_TIME: Partial<Record<MapId, TimeOfDay>> = {
  sunset_beach: "sunset",
  campfire_night: "night",
  velvet_casino: "night",
};
const AUTO_CYCLE_SECONDS = 45; // each hour of the day lasts this long when Auto Cycle is on
const GESTURE_COOLDOWN_MS = 1200;
const COIN_CAP = 99999;
const ALLOWED_EMOTES = new Set<string>(EMOTES);

export class HangoutRoom extends Room<HangoutState> {
  maxClients = 25;
  channelId = "";
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
  private blackjack = new Map<string, BlackjackGame>();
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
  /** The chopping block: each combo in progress (the stroke it is on, its meter, timed here), and
   *  each player's last swing (a knot stuns the axe past it). */
  private chops = new Map<string, { stroke: ChopStroke; startedAt: number; log: ChopLog; station: string }>();
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
  private board = new BoardTable();
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
  private phaseClock = ROULETTE_PHASE_SECONDS.betting;
  private cycleClock = 0;
  private ballIdle = 0;

  async onCreate(options: { channelId: string }) {
    this.setState(new HangoutState());
    this.autoDispose = false; // `autoDispose` is an accessor on the base Room class — assign, don't redeclare as a field.
    // NOTE: do not reassign `this.roomId` here — it breaks Colyseus's internal room
    // registry/dispose bookkeeping. "1 Discord voice channel = 1 room" is achieved via
    // `.filterBy(["channelId"])` on the room definition in server/src/index.ts instead.
    this.channelId = options.channelId;
    this.loadMapProps(this.state.currentMap);
    // (the board game in this channel, if one was going when the server last stopped, is put back
    // at the end of onCreate: see restoreBoard)

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), TICK_MS);

    this.onMessage("move", (client, msg: { dirX: number; dirZ: number; x?: number; z?: number; seq?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
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
        else if (player.action === "chop") this.finishChop(client.sessionId, player, false, false, this.chops.get(client.sessionId)?.stroke.stroke ?? 1);
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
      if (!player || player.sitting || player.action !== "" || player.gloves || this.state.mapTransitioning) return;
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
      if (this.state.currentMap !== "campfire_night") return;
      const i = Number(msg?.duck);
      if (!Number.isInteger(i) || i < 0 || i >= DUCK_PATHS.length) return;
      const now = Date.now();
      if (now - (this.duckDivedAt[i] ?? 0) < DUCK_DIVE_COOLDOWN_MS) return;
      this.duckDivedAt[i] = now;
      this.broadcast("duckDive", { duck: i, sessionId: client.sessionId });
    });

    this.onMessage("setLook", (client, msg: { look: string }) => {
      const player = this.state.players.get(client.sessionId);
      const look = parseLook(msg?.look);
      if (!player || !look) return;
      // Premium hats, outfits and fancy hair have to have been bought (or won at the gachapon).
      if (isPremiumHat(look.hat) && !this.owns(player, look.hat)) return;
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

    this.onMessage("changeMap", (_client, msg: { mapId: MapId }) => {
      this.handleChangeMap(msg.mapId);
    });

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
      // the campfire is always a starlit night
      if (this.state.currentMap === "campfire_night") {
        this.sendTo(client.sessionId, "campfireNotice", { message: "It's always a starlit night by the campfire", emoji: "🌙" });
        return;
      }
      this.state.timeOfDay = msg.timeOfDay;
      this.state.autoCycle = false; // picking an hour by hand stops the clock
    });
    this.onMessage("setAutoCycle", (_client, msg: { on: boolean }) => {
      this.state.autoCycle = msg?.on === true;
      this.cycleClock = 0;
    });

    this.onMessage("gesture", (client, msg: { gesture: string }) => this.handleGesture(client.sessionId, msg?.gesture));
    this.onMessage("buyHat", (client, msg: { hat: string }) => this.handleBuyHat(client.sessionId, msg?.hat));
    this.onMessage("placeBet", (client, msg: { kind: string; amount: number }) => this.handlePlaceBet(client.sessionId, msg));
    this.onMessage("clearBets", (client) => this.handleClearBets(client.sessionId));

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
        this.broadcast("emote", { sessionId: client.sessionId, emoji: "✨" });
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
    this.onMessage("spin_slots", (client, msg: { propId: string; bet: number }) => this.handleSpinSlots(client.sessionId, msg));
    this.onMessage("blackjack_action", (client, msg: { action: BlackjackAction; bet?: number }) => this.handleBlackjack(client.sessionId, msg));
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
    this.onMessage("set_record", (client, msg: { track: number }) => this.handleSetRecord(Number(msg?.track)));
    this.onMessage("board", (client, packet: BoardPacket) => this.handleBoardPacket(client, packet));
    // --- mochi ---
    this.onMessage("mochi_play", (client, msg: { action: string }) => this.handleMochi(client.sessionId, msg?.action));
    // Latency and heartbeat: the client times the round trip and reports it, so the roster can
    // show pings. The steady traffic also keeps idle-timeout proxies from cutting the socket, and a
    // client whose pings stop coming back treats its connection as dead and reconnects, so every
    // ping is always answered.
    this.onMessage("ping", (client, msg: { t: number; rtt?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player && typeof msg?.rtt === "number" && Number.isFinite(msg.rtt)) player.ping = Math.max(0, Math.min(9999, Math.round(msg.rtt)));
      client.send("pong", { t: msg?.t ?? 0 });
    });

    // last: the board game this channel had going when the server stopped, back on its table
    // (Colyseus waits for this before anyone joins, so the first to arrive can reclaim a seat)
    await this.restoreBoard();
  }

  // --- persistence ---------------------------------------------------------------------------

  /** Copies the live state into the player's record and queues a debounced write if it changed. */
  private persist(sessionId: string, player: Player, now = false) {
    const record = this.records.get(sessionId);
    if (!record) return;
    record.username = player.username;
    record.coins = player.coins;
    record.unlockedItems = player.owned ? player.owned.split(",") : [];
    const look = parseLook(player.look);
    record.equippedLook = look ? { ...toStoredLook(look) } : {};
    record.stats = parseStats(player.stats);
    try {
      record.daily = player.daily ? JSON.parse(player.daily) : null;
    } catch {
      record.daily = null;
    }
    const signature = `${record.coins}|${player.fishing}|${player.owned}|${player.look}|${player.stats}|${player.daily}|${record.mochiCoinsDay}|${record.plantsWatered.day}:${record.plantsWatered.ids.join(",")}|${Object.values(record.campfireCoins).join(":")}|${record.lastDailyClaim?.getTime() ?? 0}`;
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
      this.broadcast("emote", { sessionId, emoji: "🎀" });
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

  private handleBuyOutfit(sessionId: string, outfit: unknown) {
    const player = this.state.players.get(sessionId);
    if (!player || !isOutfitId(outfit) || this.owns(player, outfit)) return;
    const price = outfitPrice(outfit);
    if (price <= 0 || player.coins < price) return; // gacha-only outfits are not for sale
    player.coins -= price;
    this.grant(player, outfit);
    this.broadcast("emote", { sessionId, emoji: "👕" });
  }

  /** A fancy hair style from the wardrobe's shop: recorded as hair_<style> with the other unlocks. */
  private handleBuyHair(sessionId: string, style: unknown) {
    const player = this.state.players.get(sessionId);
    if (!player || !isHairStyle(style) || this.ownsHair(player.owned.split(","), style)) return;
    const price = HAIR_DEFINITIONS[style].price;
    if (player.coins < price) return;
    player.coins -= price;
    this.grant(player, hairUnlockId(style));
    this.broadcast("emote", { sessionId, emoji: HAIR_DEFINITIONS[style].emoji });
  }

  private handleGacha(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.currentMap !== "retro_arcade" || player.coins < GACHA_COST) return;
    player.coins -= GACHA_COST;
    const prize = rollGacha(new Set(player.owned.split(",")));
    if (prize.kind === "hat" || prize.kind === "outfit") this.grant(player, prize.id);
    else if (prize.kind === "coins") this.addCoins(player, prize.amount);
    else this.addCoins(player, prize.refund);
    this.bumpStat(player, "gacha_pulls");
    this.daily(sessionId, player, "pull_gacha");
    this.sendTo(sessionId, "gachaResult", prize);
    if (prize.kind === "hat" || prize.kind === "outfit") this.broadcast("emote", { sessionId, emoji: "✨" });
  }

  private handleClaw(sessionId: string, aim: number) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.currentMap !== "retro_arcade" || player.coins < CLAW_COST || !Number.isFinite(aim)) return;
    player.coins -= CLAW_COST;
    // the plush sits at a random spot; a claw dropped within a whisker of it usually grips
    const target = Math.random();
    const miss = Math.abs(Math.max(0, Math.min(1, aim)) - target);
    const chance = miss < 0.08 ? 0.75 : miss < 0.2 ? 0.4 : 0.1;
    const won = Math.random() < chance;
    if (won) {
      this.addItem(player, "plush");
      this.addCoins(player, CLAW_WIN_COINS);
      this.broadcast("emote", { sessionId, emoji: "🧸" });
    }
    this.sendTo(sessionId, "clawResult", { won, target });
  }

  private handleArcadeScore(sessionId: string, score: number) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.currentMap !== "retro_arcade" || !Number.isFinite(score) || score <= 0) return;
    const now = Date.now();
    if (now - (this.lastArcadeScoreAt.get(sessionId) ?? 0) < ARCADE_SCORE_COOLDOWN_S * 1000) return;
    this.lastArcadeScoreAt.set(sessionId, now);
    const coins = Math.min(ARCADE_COINS_MAX, Math.floor(score * ARCADE_COINS_PER_POINT));
    if (coins > 0) {
      this.addCoins(player, coins);
      this.broadcast("emote", { sessionId, emoji: "🕹️" });
    }
    this.sendTo(sessionId, "arcadeResult", { coins });
  }

  // --- fishing: the tension game ---------------------------------------------------------------

  private handleHook(sessionId: string) {
    if (this.starlight.has(sessionId)) return this.hookStarlight(sessionId);
    const player = this.state.players.get(sessionId);
    if (!player || player.action !== "fish" || !this.biteUntil.has(sessionId)) return;
    const water = MAP_WATER[this.state.currentMap] ?? "ocean";
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
        this.broadcast("emote", { sessionId, emoji: "👢" });
      } else {
        this.addItem(player, line.fish.item);
        this.bumpStat(player, "fish_caught");
        this.daily(sessionId, player, "catch_fish");
        this.broadcast("emote", { sessionId, emoji: ITEMS[line.fish.item].emoji });
        // a clean reel-in (the bar never slipped) earns a little bonus
        if (quality >= 0.9) this.addCoins(player, 3);
      }
    } else {
      this.broadcast("emote", { sessionId, emoji: "💨" });
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
    if (!player || this.state.currentMap !== "boxing_ring" || player.sitting) return;
    if (!this.inRing(player)) return;
    player.gloves = true;
    player.boxHits = 0;
    player.boxKOs = 0;
    this.broadcast("emote", { sessionId, emoji: "🥊" });
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
    if (!me || !target || sessionId === targetId) return;
    if (!me.gloves || !target.gloves || me.action === "dizzy" || target.action === "dizzy") return;
    if (Math.hypot(me.x - target.x, me.z - target.z) > BOXING_REACH + 0.6) return;
    const now = Date.now();
    if (now - (this.lastPunchAt.get(sessionId) ?? 0) < PUNCH_COOLDOWN_MS) return;
    this.lastPunchAt.set(sessionId, now);
    target.boxHits += 1;
    this.broadcast("punch", { from: sessionId, to: targetId, hits: target.boxHits });
    if (target.boxHits >= BOXING_KNOCKDOWN_HITS) {
      target.boxHits = 0;
      target.action = "dizzy";
      this.dizzyUntil.set(targetId, now + BOXING_DIZZY_S * 1000);
      me.boxKOs += 1;
      this.broadcast("emote", { sessionId: targetId, emoji: "💫" });
      if (me.boxKOs >= BOXING_BOUT_KOS) {
        this.addCoins(me, BOXING_PURSE);
        this.bumpStat(me, "boxing_knockouts");
        this.daily(sessionId, me, "win_boxing");
        this.broadcast("boxingResult", { winner: sessionId, winnerName: me.username, loser: targetId, loserName: target.username, purse: BOXING_PURSE });
        this.broadcast("emote", { sessionId, emoji: "🏆" });
        me.boxKOs = 0;
        target.boxKOs = 0;
      }
    }
  }

  private handleTossCoin(sessionId: string, to: string) {
    const from = this.state.players.get(sessionId);
    const target = this.state.players.get(to);
    if (!from || !target || from === target || !target.gloves || from.coins < BOXING_TIP) return;
    from.coins -= BOXING_TIP;
    this.addCoins(target, BOXING_TIP);
    this.broadcast("emote", { sessionId: to, emoji: "🪙" });
  }

  // --- onsen ---------------------------------------------------------------------------------

  private handleSplash(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.currentMap !== "japanese_onsen") return;
    const now = Date.now();
    if (now - (this.lastGestureAt.get(sessionId) ?? 0) < GESTURE_COOLDOWN_MS) return;
    this.lastGestureAt.set(sessionId, now);
    let splashedSomeone = false;
    this.state.players.forEach((p, id) => {
      if (id !== sessionId && Math.hypot(p.x - player.x, p.z - player.z) < 2.6) splashedSomeone = true;
    });
    this.broadcast("splash", { sessionId, x: player.x, z: player.z });
    this.broadcast("emote", { sessionId, emoji: "💦" });
    if (splashedSomeone) this.daily(sessionId, player, "splash_water");
  }

  private handleWish(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.currentMap !== "japanese_onsen" || player.coins < WISH_COST) return;
    player.coins -= WISH_COST;
    const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    // once in a while the well gives back more than it took
    const lucky = Math.random() < 0.15 ? 5 + Math.floor(Math.random() * 10) : 0;
    if (lucky) this.addCoins(player, lucky);
    this.daily(sessionId, player, "make_wish");
    this.sendTo(sessionId, "wishResult", { fortune, lucky });
    this.broadcast("emote", { sessionId, emoji: "🪙" });
  }

  private handleMatcha(sessionId: string, score: number) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.currentMap !== "japanese_onsen" || !Number.isFinite(score)) return;
    const now = Date.now();
    if (now - (this.lastMatchaAt.get(sessionId) ?? 0) < MATCHA_COOLDOWN_S * 1000) return;
    this.lastMatchaAt.set(sessionId, now);
    const coins = Math.round(Math.max(0, Math.min(1, score)) * MATCHA_REWARD_MAX);
    if (coins > 0) this.addCoins(player, coins);
    player.holding = "coffee"; // a bowl of tea to carry, drawn like the mug
    player.drink = "";
    this.sendTo(sessionId, "matchaResult", { coins });
    this.broadcast("emote", { sessionId, emoji: "🍵" });
  }

  // --- beach bar -----------------------------------------------------------------------------

  private handleBlend(sessionId: string, msg: { recipe: string; ingredients: string[] }) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.currentMap !== "sunset_beach") return;
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
      this.broadcast("emote", { sessionId, emoji: recipe.emoji });
    }
    this.sendTo(sessionId, "blendResult", { right, coins: right ? DRINK_REWARD : 0 });
  }

  // --- lounge: the kitchenette, the radio and the plants -----------------------------------------

  /** The nearest prop of `kind` in reach of the player (INTERACT_RADIUS), or undefined. */
  private propInReach(player: Player, kind: string, propId?: string) {
    let best: ToggleableState | undefined;
    let bestD = INTERACT_RADIUS;
    this.state.toggleables.forEach((prop) => {
      if (prop.kind !== kind || (propId && prop.propId !== propId)) return;
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
    if (!player || packet?.type !== "KITCHEN_BREW" || this.state.currentMap !== "cozy_lounge") return;
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
    this.broadcast("emote", { sessionId, emoji: DRINK_BASE_INFO[packet.base].emoji });
  }

  /** Tunes the lounge radio for the whole room: its station and whether it plays are synced state. */
  private handleRadio(sessionId: string, packet: RadioPacket) {
    const player = this.state.players.get(sessionId);
    if (!player || packet?.type !== "RADIO_UPDATE" || this.state.currentMap !== "cozy_lounge") return;
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
    if (!player || !record || this.state.currentMap !== "cozy_lounge" || !isWaterable(plantId)) return;
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
    this.broadcast("plantWatered", splash);
    this.broadcast("gesture", { sessionId, gesture: "water" });
    this.persist(sessionId, player);
  }

  // --- lounge: the jukebox and the board game ---------------------------------------------------

  private handleSetRecord(track: number) {
    if (this.state.currentMap !== "cozy_lounge") return;
    this.state.toggleables.forEach((prop) => {
      if (prop.kind !== "turntable") return;
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
    return this.channelId || this.roomId;
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
    if (!player || !packet || typeof packet !== "object" || this.state.currentMap !== "cozy_lounge") return;
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
        if (changed) this.broadcast("gesture", { sessionId, gesture: "reach" });
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
    this.broadcast("emote", { sessionId: winnerId, emoji: this.board.gameType === "chess" ? "♟️" : "⛀" });
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
    if (!player || this.state.currentMap !== "cozy_lounge" || this.state.mapTransitioning) return false;
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
      if (prop.kind === "cat") hasMochi = true;
    });
    if (!hasMochi) return;
    const at = mochiSpot(this.state.currentMap, Date.now() / 1000);
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
      if (prop.kind === "cat") prop.boost = 2.5; // hearts and purring on the mascot
    });
    this.broadcast("emote", { sessionId, emoji: a === "treat" ? "🐟" : "💕" });
    this.sendTo(sessionId, "mochiResult", { action: a, coins, cooldown: false });
  }

  private async refreshLeaderboard() {
    try {
      const top = await getPlayerStore().topCoins(10);
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
    if (player.coins >= ALLOWANCE_BELOW) return;
    const last = record.lastDailyClaim?.getTime() ?? 0;
    if (Date.now() - last < ALLOWANCE_COOLDOWN_S * 1000) {
      this.sendTo(sessionId, "allowance", { ok: false, retryInS: Math.ceil((ALLOWANCE_COOLDOWN_S * 1000 - (Date.now() - last)) / 1000) });
      return;
    }
    record.lastDailyClaim = new Date();
    this.addCoins(player, ALLOWANCE_COINS);
    this.sendTo(sessionId, "allowance", { ok: true, coins: ALLOWANCE_COINS });
    this.broadcast("emote", { sessionId, emoji: "🪙" });
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
    this.broadcast("chatBubble", { sessionId, text });
  }

  private handleSpinSlots(sessionId: string, msg: { propId: string; bet: number }) {
    const player = this.state.players.get(sessionId);
    const prop = this.state.toggleables.get(String(msg?.propId ?? ""));
    if (!player || !prop || prop.kind !== "slot") return;
    const bet = Number(msg.bet);
    if (!(SLOT_BETS as readonly number[]).includes(bet)) return;
    if (Math.hypot(player.x - prop.x, player.z - prop.z) > INTERACT_RADIUS + 0.8) return;
    this.spinSlot(sessionId, player, prop.propId, bet);
  }

  // --- blackjack -----------------------------------------------------------------------------

  private blackjackView(game: BlackjackGame): BlackjackView {
    const holeHidden = game.phase === "player";
    const dealerShown = holeHidden ? game.dealer.slice(0, 1) : game.dealer;
    return {
      phase: game.phase,
      bet: game.bet,
      player: game.player,
      dealer: dealerShown,
      holeHidden,
      playerTotal: blackjackTotal(game.player),
      dealerTotal: blackjackTotal(dealerShown),
      outcome: game.outcome,
      payout: game.payout,
      canDouble: game.phase === "player" && game.player.length === 2,
    };
  }

  private handleBlackjack(sessionId: string, msg: { action: BlackjackAction; bet?: number }) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.currentMap !== "velvet_casino") return;
    if (Math.hypot(player.x - BLACKJACK_CENTER.x, player.z - BLACKJACK_CENTER.z) > BLACKJACK_RADIUS + 0.8) return;
    const action = msg?.action;
    let game = this.blackjack.get(sessionId);

    if (action === "deal") {
      if (game && (game.phase === "player" || game.phase === "dealer")) return; // hand in progress
      const bet = Number(msg.bet);
      if (!(BLACKJACK_BETS as readonly number[]).includes(bet) || player.coins < bet) return;
      player.coins -= bet;
      const deck = freshDeck();
      game = { deck, player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], bet, phase: "player", outcome: "", payout: 0 };
      this.blackjack.set(sessionId, game);
      const natural = blackjackTotal(game.player) === 21;
      const dealerNatural = blackjackTotal(game.dealer) === 21;
      if (natural || dealerNatural) this.settleBlackjack(sessionId, player, game, natural && !dealerNatural ? "blackjack" : natural ? "push" : "lose");
    } else if (!game || game.phase !== "player") {
      return;
    } else if (action === "hit") {
      game.player.push(game.deck.pop()!);
      const total = blackjackTotal(game.player);
      if (total > 21) this.settleBlackjack(sessionId, player, game, "bust");
      else if (total === 21) this.dealerPlays(sessionId, player, game);
    } else if (action === "double") {
      if (game.player.length !== 2 || player.coins < game.bet) return;
      player.coins -= game.bet;
      game.bet *= 2;
      game.player.push(game.deck.pop()!);
      if (blackjackTotal(game.player) > 21) this.settleBlackjack(sessionId, player, game, "bust");
      else this.dealerPlays(sessionId, player, game);
    } else if (action === "stand") {
      this.dealerPlays(sessionId, player, game);
    } else {
      return;
    }
    this.sendTo(sessionId, "blackjackState", this.blackjackView(this.blackjack.get(sessionId)!));
  }

  /** Dealer draws to 17 (hits 16 and below, stands on any 17), then the hand is compared. */
  private dealerPlays(sessionId: string, player: Player, game: BlackjackGame) {
    game.phase = "dealer";
    while (blackjackTotal(game.dealer) < 17) game.dealer.push(game.deck.pop()!);
    const p = blackjackTotal(game.player);
    const d = blackjackTotal(game.dealer);
    this.settleBlackjack(sessionId, player, game, d > 21 || p > d ? "win" : p === d ? "push" : "lose");
  }

  private settleBlackjack(sessionId: string, player: Player, game: BlackjackGame, outcome: BlackjackOutcome) {
    game.phase = "done";
    game.outcome = outcome;
    game.payout = outcome === "blackjack" ? Math.floor(game.bet * 2.5) : outcome === "win" ? game.bet * 2 : outcome === "push" ? game.bet : 0;
    if (game.payout > 0) this.addCoins(player, game.payout);
    if (outcome === "win" || outcome === "blackjack") {
      this.bumpStat(player, "blackjack_wins");
      this.broadcast("emote", { sessionId, emoji: outcome === "blackjack" ? "💰" : "🪙" });
    }
  }

  private loadMapProps(mapId: MapId) {
    this.state.chairs.clear();
    for (const chair of MAP_CHAIRS[mapId]) {
      const state = new ChairState();
      state.propId = chair.propId;
      state.x = chair.x;
      state.z = chair.z;
      state.rotationY = chair.rotationY;
      state.style = chair.style;
      state.sitY = chair.sitY ?? 0;
      this.state.chairs.set(chair.propId, state);
    }

    this.state.toggleables.clear();
    for (const prop of MAP_TOGGLEABLES[mapId]) {
      const state = new ToggleableState();
      state.propId = prop.propId;
      state.x = prop.x;
      state.y = prop.y ?? 0;
      state.z = prop.z;
      state.kind = prop.kind;
      state.color = prop.color;
      state.on = prop.defaultOn;
      this.state.toggleables.set(prop.propId, state);
    }
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
      if (this.state.currentMap === "japanese_onsen" && player.sitting) {
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
          this.broadcast("emote", { sessionId, emoji: "☕" });
          // A barista tip, at most once every ESPRESSO_TIP_COOLDOWN_S so it can't be farmed.
          if (now - (this.lastTipAt.get(sessionId) ?? 0) > ESPRESSO_TIP_COOLDOWN_S * 1000) {
            this.lastTipAt.set(sessionId, now);
            this.addCoins(player, ESPRESSO_TIP);
            this.broadcast("emote", { sessionId, emoji: "🪙" });
          }
        }
      } else if (player.action === "afkfish" && this.state.currentMap === "campfire_night") {
        // feet up, line in: a fish into the creel now and then, the rarer the longer the wait
        // (AFK_CATCH_S; the fish is rolled when the wait starts), or, the creel full, let go
        const at = this.fishBiteAt.get(sessionId) ?? now;
        const total = this.afkTotal.get(sessionId) ?? 25000;
        const progress = Math.max(0, Math.min(1, Math.floor((1 - (at - now) / total) * 20) / 20));
        if (progress !== player.actionProgress) player.actionProgress = progress;
        if (now >= at) {
          const species = this.pendingFish.get(sessionId)?.species ?? rollRiverFish("freshwater", { afk: true });
          this.landFish(sessionId, player, rollCatch(species), true, 0);
          this.scheduleCampAfk(sessionId, now);
          player.actionProgress = 0;
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
            this.broadcast("emote", { sessionId, emoji: "🪙" });
          } else {
            const fish: ItemId = roll < 0.8 ? "sardine" : "clownfish";
            this.addItem(player, fish);
            this.bumpStat(player, "fish_caught");
            this.broadcast("emote", { sessionId, emoji: ITEMS[fish].emoji });
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
            this.broadcast("emote", { sessionId, emoji: "💨" });
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

    if (this.state.currentMap === "sunset_beach") this.tickBall(dt);
    if (this.state.currentMap === "campfire_night") this.tickCampfire(now);
    if (this.state.currentMap === "velvet_casino") this.tickRoulette(dt);

    if (this.state.autoCycle && this.state.currentMap !== "campfire_night") {
      this.cycleClock += dt;
      if (this.cycleClock >= AUTO_CYCLE_SECONDS) {
        this.cycleClock = 0;
        const i = TIMES_OF_DAY.indexOf(this.state.timeOfDay);
        this.state.timeOfDay = TIMES_OF_DAY[(i + 1) % TIMES_OF_DAY.length];
      }
    }
  }

  // --- roulette ---
  private tickRoulette(dt: number) {
    const r = this.state.roulette;
    this.phaseClock -= dt;
    const shown = Math.max(0, Math.ceil(this.phaseClock));
    if (r.timeLeft !== shown) r.timeLeft = shown;
    if (this.phaseClock > 0) return;

    if (r.phase === "betting") {
      r.result = Math.floor(Math.random() * 37);
      r.spinId += 1;
      this.setPhase("spinning");
    } else if (r.phase === "spinning") {
      this.payRoulette(r.result);
      this.setPhase("payout");
    } else {
      this.state.bets.clear();
      this.setPhase("betting");
    }
  }

  private setPhase(phase: RoulettePhase) {
    this.state.roulette.phase = phase;
    this.phaseClock = ROULETTE_PHASE_SECONDS[phase];
    this.state.roulette.timeLeft = ROULETTE_PHASE_SECONDS[phase];
  }

  private payRoulette(result: number) {
    const winners: { sessionId: string; username: string; amount: number }[] = [];
    this.state.bets.forEach((raw, sessionId) => {
      const player = this.state.players.get(sessionId);
      if (!player) return;
      let won = 0;
      for (const [kind, amount] of Object.entries(parseBets(raw))) won += betReturn(kind, amount, result);
      if (won > 0) {
        this.addCoins(player, won);
        this.bumpStat(player, "roulette_wins");
        winners.push({ sessionId, username: player.username, amount: won });
        this.broadcast("emote", { sessionId, emoji: won >= 100 ? "💰" : "🪙" });
      }
    });
    this.broadcast("rouletteResult", { result, winners });
  }

  private handlePlaceBet(sessionId: string, msg: { kind: string; amount: number }) {
    if (this.state.currentMap !== "velvet_casino" || this.state.roulette.phase !== "betting") return;
    const player = this.state.players.get(sessionId);
    if (!player || !isBetKind(msg?.kind)) return;
    const amount = Number(msg.amount);
    if (!(CHIP_VALUES as readonly number[]).includes(amount)) return;
    if (Math.hypot(player.x - ROULETTE_CENTER.x, player.z - ROULETTE_CENTER.z) > ROULETTE_BET_RADIUS + 0.6) return;
    if (player.coins < amount) return;
    const bets = parseBets(this.state.bets.get(sessionId) ?? "");
    const staked = Object.values(bets).reduce((a, b) => a + b, 0);
    if (staked + amount > MAX_BET_TOTAL) return;
    bets[msg.kind] = (bets[msg.kind] ?? 0) + amount;
    player.coins -= amount;
    this.state.bets.set(sessionId, encodeBets(bets));
  }

  private handleClearBets(sessionId: string) {
    if (this.state.roulette.phase !== "betting") return;
    this.refundBets(sessionId);
  }

  private refundBets(sessionId: string) {
    const raw = this.state.bets.get(sessionId);
    if (raw === undefined) return;
    const player = this.state.players.get(sessionId);
    if (player) this.addCoins(player, Object.values(parseBets(raw)).reduce((a, b) => a + b, 0));
    this.state.bets.delete(sessionId);
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
    this.broadcast("gesture", { sessionId, gesture });
  }

  private handleGesture(sessionId: string, gesture: unknown) {
    if (!isGesture(gesture) || SERVER_GESTURES.has(gesture)) return;
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const now = Date.now();
    if (now - (this.lastGestureAt.get(sessionId) ?? 0) < GESTURE_COOLDOWN_MS) return;
    this.lastGestureAt.set(sessionId, now);
    this.broadcast("gesture", { sessionId, gesture });
    this.broadcast("emote", { sessionId, emoji: GESTURE_EMOJI[gesture] });
  }

  private handleBuyHat(sessionId: string, hat: unknown) {
    const player = this.state.players.get(sessionId);
    if (!player || !isPremiumHat(hat)) return;
    const owned = player.owned ? player.owned.split(",") : [];
    if (owned.includes(hat)) return;
    const price = PREMIUM_HATS[hat].price;
    if (player.coins < price) return;
    player.coins -= price;
    player.owned = [...owned, hat].join(",");
    this.broadcast("emote", { sessionId, emoji: PREMIUM_HATS[hat].emoji });
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
      if (prop.kind === kind && Math.hypot(player.x - prop.x, player.z - prop.z) <= reach) near = true;
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
    if (!player || !packet || typeof packet !== "object" || this.state.currentMap !== "campfire_night" || this.state.mapTransitioning) return;
    switch (packet.type) {
      case "ROAST_START": {
        // from beside the fire or from a log bench round it (a little slack for latency)
        if (!isRoastFood(packet.food) || (player.action !== "" && player.action !== "guitar")) return;
        if (!this.nearProp(player, "bonfire", BONFIRE_REACH + 0.3)) return;
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
        this.broadcast("emote", { sessionId, emoji: "🌠" });
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
        this.broadcast("emote", { sessionId, emoji: shape.emoji });
        this.persist(sessionId, player);
        return;
      }
      case "CHOP_START": {
        if (player.sitting || player.action !== "") return;
        // the station you stand at: it needs a log on its block, and nobody else at it
        let station: ToggleableState | null = null;
        this.state.toggleables.forEach((prop) => {
          if (prop.kind !== "woodchop" || Math.hypot(player.x - prop.x, player.z - prop.z) > CHOP_REACH + 0.4) return;
          if (!station || Math.hypot(player.x - prop.x, player.z - prop.z) < Math.hypot(player.x - station.x, player.z - station.z)) station = prop;
        });
        const at = station as ToggleableState | null;
        if (!at) return;
        if (Date.now() < (this.lastChopAt.get(sessionId) ?? 0) + CHOP_COOLDOWN_MS) return;
        if (!at.on) {
          const left = Math.max(1, Math.ceil(((this.regrowAt.get(at.propId) ?? Date.now()) - Date.now()) / 1000));
          client.send("campfireNotice", { message: `A fresh log is on its way to this block (${left}s). Try another station!`, emoji: "🪵" });
          return;
        }
        if ([...this.chops.values()].some((c) => c.station === at.propId)) {
          client.send("campfireNotice", { message: "Someone's chopping at this block. There are two more!", emoji: "🪓" });
          return;
        }
        const profile = this.records.get(sessionId)?.fishing;
        if (profile && woodCount(profile) >= carrierCapacity(profile.carrier)) {
          client.send("campfireNotice", { message: `Your wood carrier is full (${carrierCapacity(profile.carrier)}): burn some on the fire, or sell it to Buster`, emoji: "🪵" });
          return;
        }
        // the combo's first stroke: the notch
        player.action = "chop";
        player.actionProgress = 0;
        this.startChopStroke(client, 1, rollChopLog(), at.propId);
        return;
      }
      case "REEL_DONE": {
        this.finishStarlightReel(sessionId, packet.caught === true, packet.treasure === true);
        return;
      }
      case "ADD_FUEL": {
        const item = isWoodKind(packet.item) ? packet.item : "pine";
        const profile = this.records.get(sessionId)?.fishing;
        if (!profile || player.action === "grill" || !this.nearProp(player, "bonfire", BONFIRE_REACH + 0.5)) return;
        if (!(profile.wood[item] > 0)) return;
        if (this.state.fuel >= FUEL_MAX) {
          client.send("campfireNotice", { message: "The fire's already roaring! Save that for later", emoji: "🔥" });
          return;
        }
        profile.wood[item] -= 1;
        this.saveFishing(sessionId, player);
        const amount = WOOD[item].fuel;
        this.state.fuel = Math.min(FUEL_MAX, this.state.fuel + amount);
        const update: BonfireUpdate = { fuel: this.state.fuel, sessionId, item, amount };
        this.broadcast("BONFIRE_STATE_UPDATE", update);
        if (!player.sitting) this.playGesture(sessionId, "toss");
        this.broadcast("emote", { sessionId, emoji: "🔥" });
        return;
      }
      case "STEW_ADD": {
        if (player.action === "grill" || !this.nearProp(player, "bonfire", BONFIRE_REACH + 0.5)) return;
        const stew = parseStew(this.state.stew);
        if (stew.phase !== "gathering" || stew.items.length >= STEW_SLOTS) return;
        const kind = packet.ingredient;
        let fish: FishId | undefined;
        if (kind === "fish") {
          const profile = this.records.get(sessionId)?.fishing;
          const slot = Math.floor(Number(packet.slot));
          const f = profile?.creel[slot];
          if (!profile || !f) return;
          profile.creel.splice(slot, 1);
          fish = f.s;
          this.saveFishing(sessionId, player);
        } else if (kind === "mushroom" || kind === "berry") {
          const bag = parseBag(player.bag);
          if (!((bag[kind] ?? 0) > 0)) return;
          bag[kind] = (bag[kind] ?? 0) - 1;
          if (!bag[kind]) delete bag[kind];
          player.bag = encodeBag(bag);
        } else return;
        stew.items.push(fish ? { kind, by: player.username, fish } : { kind, by: player.username });
        if (stew.items.length >= STEW_SLOTS) {
          stew.phase = "cooking";
          stew.progress = 0;
          this.stewCookAt = Date.now();
        }
        this.setStew(stew, "add", sessionId);
        this.broadcast("emote", { sessionId, emoji: fish ? FISH[fish].emoji : kind === "berry" ? "🫐" : "🍄" });
        return;
      }
      case "STEW_SCOOP": {
        if (!this.nearProp(player, "bonfire", BONFIRE_REACH + 0.5)) return;
        const stew = parseStew(this.state.stew);
        if (stew.phase !== "ready" || stew.servings <= 0 || stew.served.includes(player.userId)) return;
        stew.servings -= 1;
        stew.served.push(player.userId);
        this.feed(sessionId, player);
        this.broadcast("emote", { sessionId, emoji: "🥣" });
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
        this.broadcast("emote", { sessionId, emoji: "🍢" });
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
        this.broadcast("emote", { sessionId, emoji: "😋" });
        return;
      }
      case "AFK": {
        let seatId = "";
        this.state.chairs.forEach((chair) => {
          if (chair.occupiedBy === sessionId) seatId = chair.propId;
        });
        if (!spotOfSeat(seatId)) return;
        if (!packet.on) {
          if (player.action !== "afkfish") return;
          // back to watching the bobber
          this.afkTotal.delete(sessionId);
          player.action = "fish";
          this.starlight.add(sessionId);
          this.waitForBite(sessionId, player, false);
          return;
        }
        if (player.action !== "" && player.action !== "fish") return;
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
      case "CHOP_STOP": {
        const chop = this.chops.get(sessionId);
        if (!chop || player.action !== "chop") return;
        // judged on when you swung: the time on your meter at the click, as long as it is one the
        // connection could have given (the meter reached you up to a round trip after it started
        // here, and the swing took up to half of one to arrive); otherwise, on this clock less
        // half a round trip
        const raw = (Date.now() - chop.startedAt) / 1000;
        const rtt = Math.min(1, Math.max(0, player.ping) / 1000);
        const told = typeof packet.t === "number" && Number.isFinite(packet.t) ? packet.t : NaN;
        const t = told <= raw + 0.05 && told >= raw - rtt - 0.35 ? told : raw - rtt / 2;
        const verdict = judgeChop(chop.stroke, t);
        if (verdict === "hit") {
          this.playGesture(sessionId, "chop");
          if (chop.stroke.stroke < 3) this.startChopStroke(client, (chop.stroke.stroke + 1) as ChopStrokeNo, chop.log, chop.station);
          else this.finishChop(sessionId, player, true, false, 3);
        } else {
          this.finishChop(sessionId, player, false, verdict === "knot", chop.stroke.stroke);
        }
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
    this.broadcast("roastResult", result);
    this.broadcast("emote", { sessionId, emoji: quality === "golden" ? "🤩" : quality === "charred" ? "😵" : "😋" });
    this.persist(sessionId, player);
  }

  /** The axe comes down: a clean split pays and feeds the fire; a glancing blow does neither. */
  /** The chopping combo's next stroke: a fresh meter for it, timed from now. */
  private startChopStroke(client: Client, stroke: ChopStrokeNo, log: ChopLog, station: string) {
    const meter = rollChopStroke(stroke, log, Math.random, this.records.get(client.sessionId)?.fishing.axe ?? "rusty");
    this.chops.set(client.sessionId, { stroke: meter, startedAt: Date.now(), log, station });
    client.send("chopStroke", meter);
  }

  /** The combo's end: all three strokes landed (paid, the fire fed), a swing into a knot (the axe
   *  is stunned a moment), or a miss. */
  private finishChop(sessionId: string, player: Player, clean: boolean, stunned: boolean, stroke: number) {
    const chop = this.chops.get(sessionId);
    if (!chop) return;
    this.chops.delete(sessionId);
    this.lastChopAt.set(sessionId, Date.now() + (stunned ? CHOP_STUN_S * 1000 : 0));
    this.clearAction(player);
    this.playGesture(sessionId, "chop");
    let coins = 0;
    const log = CHOP_LOGS[chop.log];
    const profile = this.records.get(sessionId)?.fishing;
    let pieces = 0;
    if (clean && profile) {
      coins = this.campfirePay(sessionId, player, "chop", CHOP_CLEAN_COINS + log.bonus);
      // the split log is yours: wood to burn or to sell to Buster (two, with the Golden Axe's luck),
      // as much as the carrier holds; the block waits CHOP_RESPAWN_S for its next log
      const room = Math.max(0, carrierCapacity(profile.carrier) - woodCount(profile));
      pieces = Math.min(room, Math.random() < AXES[profile.axe].doubleChance ? 2 : 1);
      profile.wood[log.wood] = Math.min(999, profile.wood[log.wood] + pieces);
      this.saveFishing(sessionId, player);
      const station = this.state.toggleables.get(chop.station);
      if (station) {
        station.on = false;
        this.regrowAt.set(station.propId, Date.now() + CHOP_RESPAWN_S * 1000);
      }
    }
    const result: ChopResult = { sessionId, clean, stunned, stroke, log: chop.log, wood: log.wood, pieces, coins, capped: clean && coins === 0 };
    this.broadcast("chopResult", result);
    this.broadcast("emote", { sessionId, emoji: clean ? "🪵" : stunned ? "💫" : "😅" });
    this.persist(sessionId, player);
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
      this.broadcast("emote", { sessionId, emoji: "✨" });
      return;
    }
    // whatever was in hand is set down for the jar
    player.holding = "jar";
    player.drink = "";
    player.snack = "";
    this.snackUntil.delete(sessionId);
    this.playGesture(sessionId, "net");
    this.broadcast("emote", { sessionId, emoji: "✨" });
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
    this.broadcast("forageResult", result);
    this.broadcast("emote", { sessionId, emoji: FORAGE_INFO[spot.kind].emoji });
    this.persist(sessionId, player);
  }

  /** The roasting dials, skewers eaten up, the chopping meters and the stargazers' shooting stars. */
  private tickCampfire(now: number) {
    // the bonfire burns down a notch every couple of minutes
    if (now - this.fuelTickAt >= FUEL_DECAY_S * 1000) {
      this.fuelTickAt = now;
      if (this.state.fuel > 0) {
        this.state.fuel = Math.max(0, this.state.fuel - FUEL_DECAY);
        const update: BonfireUpdate = { fuel: this.state.fuel, sessionId: "", item: "", amount: -FUEL_DECAY };
        this.broadcast("BONFIRE_STATE_UPDATE", update);
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
    this.chops.forEach((chop, sessionId) => {
      const player = this.state.players.get(sessionId);
      if (!player || player.action !== "chop") {
        this.chops.delete(sessionId);
        return;
      }
      // the meter ran out with no swing: the stroke is missed
      if (now - chop.startedAt > chop.stroke.duration * 1000 + 400) this.finishChop(sessionId, player, false, false, chop.stroke.stroke);
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
    const species = this.pendingFish.get(sessionId)?.species ?? rollRiverFish("freshwater");
    this.pendingFish.delete(sessionId);
    const fish = rollCatch(species, { rareLuck: hasCozyAura(this.state.fuel) ? COZY_AURA_LUCK : 0 });
    const treasure = Math.random() < TREASURE_CHANCE[FISH[species].tier];
    this.starReels.set(sessionId, { fish, startedAt: Date.now(), treasure });
    player.action = "reel";
    player.actionProgress = 0;
    const reel: StarlightReel = { fish, rod: this.records.get(sessionId)?.fishing.rod ?? "bamboo", treasure };
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
      if (consumeBait) {
        const left = (profile.baits[bait] ?? 0) - 1;
        if (left > 0) profile.baits[bait] = left;
        else {
          delete profile.baits[bait];
          profile.bait = "";
        }
        this.saveFishing(sessionId, player);
      }
    }
    const species = rollRiverFish("freshwater", { rareLuck: hasCozyAura(this.state.fuel) ? COZY_AURA_LUCK : 0, bait });
    const total = biteSeconds(species, { fed: player.fed > 0, bait }) * 1000;
    const now = Date.now();
    this.pendingFish.set(sessionId, { species, castAt: now, total });
    this.fishBiteAt.set(sessionId, now + total);
    player.actionProgress = 0;
  }

  private scheduleCampAfk(sessionId: string, now: number) {
    const species = rollRiverFish("freshwater", { afk: true, rareLuck: hasCozyAura(this.state.fuel) ? COZY_AURA_LUCK : 0 });
    const total = afkSeconds(species) * 1000;
    this.pendingFish.set(sessionId, { species, castAt: now, total });
    this.afkTotal.set(sessionId, total);
    this.fishBiteAt.set(sessionId, now + total);
  }

  /** A fish out of the river: into the creel (the angler's longest of its kind noted), or, the creel
   *  full, let go for a few coins. Everyone hears about it. */
  private landFish(sessionId: string, player: Player, fish: CreelFish, afk: boolean, treasure: number) {
    const profile = this.records.get(sessionId)?.fishing;
    if (!profile) return;
    const best = profile.records[fish.s] ?? 0;
    if (fish.cm > best) profile.records[fish.s] = fish.cm;
    let coins = treasure;
    let released = false;
    if (profile.creel.length < profile.slots) profile.creel.push(fish);
    else {
      released = true;
      coins += this.campfirePay(sessionId, player, "fish", CREEL_RELEASE_COINS);
    }
    this.bumpStat(player, "fish_caught");
    this.daily(sessionId, player, "catch_fish");
    const landed: FishCaught = { sessionId, fish, released, record: fish.cm > best, coins, treasure, afk };
    this.broadcast("fishCaught", landed);
    this.broadcast("emote", { sessionId, emoji: released ? "🪣" : FISH[fish.s].emoji });
    this.saveFishing(sessionId, player);
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
    this.broadcast("STEW_STATE_UPDATE", update);
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
        this.broadcast("campfireNotice", { message: `The ${stewName(stew.items)} is ready! Grab a bowl by the fire`, emoji: "🍲" });
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

  /** Buster the Lumberjack's stall: he buys split wood (near him) and sells axes (near him); an
   *  axe you own can be switched to anywhere. */
  private handleBuster(sessionId: string, player: Player, packet: Extract<CampfirePacket, { type: "BUSTER" }>) {
    const record = this.records.get(sessionId);
    if (!record) return;
    const profile = record.fishing;
    const B = CAMPFIRE_LAYOUT.buster;
    const near = Math.min(Math.hypot(player.x - BUSTER_FRONT.x, player.z - BUSTER_FRONT.z), Math.hypot(player.x - B.x, player.z - B.z)) <= BUSTER_REACH + 0.4;
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
        const earned = n * WOOD[packet.wood].sell;
        profile.wood[packet.wood] -= n;
        this.addCoins(player, earned);
        this.broadcast("emote", { sessionId, emoji: earned >= 100 ? "💰" : "🪙" });
        return reply(true, `${n} ${WOOD[packet.wood].name}? Fine timber! Here's ${earned} 🪙`, earned);
      }
      case "buyAxe": {
        if (!isAxeId(packet.axe)) return;
        const axe = AXES[packet.axe];
        if (profile.axes.includes(packet.axe)) return reply(false, `You've already got the ${axe.name}`);
        if (!near) return tooFar();
        if (player.coins < axe.price) return reply(false, `The ${axe.name} is ${axe.price} 🪙. Keep chopping!`);
        this.addCoins(player, -axe.price);
        profile.axes.push(packet.axe);
        profile.axe = packet.axe;
        this.broadcast("emote", { sessionId, emoji: axe.emoji });
        return reply(true, `The ${axe.name}, all yours. Mind your toes!`, -axe.price);
      }
      case "equipAxe": {
        if (!isAxeId(packet.axe) || !profile.axes.includes(packet.axe)) return;
        profile.axe = packet.axe;
        return reply(true, `${AXES[packet.axe].emoji} ${AXES[packet.axe].name} in hand`);
      }
      case "upgradeCarrier": {
        if (!near) return tooFar();
        const cost = CARRIER_UPGRADE_COSTS[profile.carrier - 1];
        if (cost === undefined || profile.carrier >= CARRIER_CAPACITY.length) return reply(false, "That carrier's as big as they come!");
        if (player.coins < cost) return reply(false, `A bigger carrier is ${cost} 🪙`);
        this.addCoins(player, -cost);
        profile.carrier += 1;
        return reply(true, `There you go: your carrier holds ${carrierCapacity(profile.carrier)} logs now 🪵`, -cost);
      }
    }
  }

  /** Barnaby's stall: selling the creel (near him), buying rods, bait and a bigger creel (near him),
   *  and switching rod or bait (anywhere). */
  private handleBarnaby(sessionId: string, player: Player, packet: Extract<CampfirePacket, { type: "BARNABY" }>) {
    const record = this.records.get(sessionId);
    if (!record) return;
    const profile = record.fishing;
    const B = CAMPFIRE_LAYOUT.barnaby;
    const near = Math.min(Math.hypot(player.x - BARNABY_FRONT.x, player.z - BARNABY_FRONT.z), Math.hypot(player.x - B.x, player.z - B.z)) <= BARNABY_REACH + 0.4;
    const reply = (ok: boolean, message: string, coins = 0) => {
      const result: BarnabyResult = { ok, message, coins };
      this.sendTo(sessionId, "barnabyResult", result);
      if (ok) this.saveFishing(sessionId, player);
    };
    const tooFar = () => reply(false, "Come on over to the stall, friend!");
    switch (packet.op) {
      case "sell": {
        if (!near) return tooFar();
        const picked = packet.slot === "all" ? profile.creel.map((_, k) => k) : [Math.floor(Number(packet.slot))].filter((k) => !!profile.creel[k]);
        if (!picked.length) return reply(false, "Your creel's empty! The river's right there 🎣");
        // a roaring fire puts Barnaby in a generous mood (the Cozy Aura: +15%)
        const aura = hasCozyAura(this.state.fuel) ? 1 + COZY_AURA_LUCK : 1;
        const first = profile.creel[picked[0]];
        const earned = picked.reduce((sum, k) => sum + Math.round(fishValue(profile.creel[k]) * aura), 0);
        profile.creel = profile.creel.filter((_, k) => !picked.includes(k));
        this.addCoins(player, earned);
        this.broadcast("emote", { sessionId, emoji: earned >= 100 ? "💰" : "🪙" });
        return reply(true, picked.length > 1 ? `${picked.length} fine fish! Here's ${earned} 🪙` : `A lovely ${FISH[first.s].name}! Here's ${earned} 🪙`, earned);
      }
      case "buyRod": {
        if (!isRodId(packet.rod)) return;
        const rod = RODS[packet.rod];
        if (profile.rods.includes(packet.rod)) return reply(false, `You've already got the ${rod.name}`);
        if (!near) return tooFar();
        if (player.coins < rod.price) return reply(false, `The ${rod.name} is ${rod.price} 🪙. Keep at it!`);
        this.addCoins(player, -rod.price);
        profile.rods.push(packet.rod);
        profile.rod = packet.rod;
        this.broadcast("emote", { sessionId, emoji: rod.emoji });
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
      case "upgradeCreel": {
        if (!near) return tooFar();
        const cost = creelUpgradeCost(profile.slots);
        if (cost === null) return reply(false, "That creel's as big as they come!");
        if (player.coins < cost) return reply(false, `Two more slots is ${cost} 🪙`);
        this.addCoins(player, -cost);
        profile.slots += 2;
        return reply(true, `Stitched on two more slots: ${profile.slots} now 🪣`, -cost);
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
    this.waitForBite(sessionId, player, true);
    if (!caught || Date.now() - reel.startedAt < STARLIGHT_REEL_MIN_S * 1000) {
      this.broadcast("emote", { sessionId, emoji: "💨" });
      return;
    }
    // a chest the server rolled for this reel, held in the bar until it opened
    const treasure = reel.treasure && openedChest ? this.campfirePay(sessionId, player, "fish", TREASURE_COINS) : 0;
    this.landFish(sessionId, player, reel.fish, false, treasure);
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
    if (this.state.mapTransitioning) return;
    if (typeof x !== "number" || typeof z !== "number") return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    let goalX = clampToWorld(x, this.state.currentMap);
    let goalZ = clampToWorld(z, this.state.currentMap);

    // How far this player could honestly have walked since their last report.
    const now = Date.now();
    let allowed = MAX_REPORT_STEP * (player.fed > 0 ? WELL_FED_SPEED : 1);
    if (sessionId) {
      const last = this.lastReportAt.get(sessionId);
      this.lastReportAt.set(sessionId, now);
      if (last !== undefined) {
        const elapsed = Math.min(1, (now - last) / 1000);
        const pace = player.fed > 0 ? WELL_FED_SPEED : 1;
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
    const mapId = this.state.currentMap;
    if (!isBlocked(goalX, goalZ, mapId, SANITY_RADIUS)) {
      player.x = goalX;
      player.z = goalZ;
    }
  }

  private handleChangeMap(mapId: MapId) {
    if (this.state.mapTransitioning) return;
    if (!isMapId(mapId) || !MAP_OBSTACLES[mapId]) return;
    this.state.players.forEach((p, id) => {
      p.gloves = false;
      p.boxHits = 0;
      p.boxKOs = 0;
      this.soakSeconds.delete(id);
    });
    this.hooked.clear();
    this.pendingFish.clear();
    this.board = new BoardTable();
    this.saveBoard();

    this.state.mapTransitioning = true;
    // Each map has an hour it was built for. Arriving at the Sunset Beach Bar at midday would
    // throw away the whole point of it, so the move sets the mood — anyone can change it back
    // from the time bar straight afterwards.
    const signatureTime = MAP_SIGNATURE_TIME[mapId];
    if (signatureTime) this.state.timeOfDay = signatureTime;

    this.state.players.forEach((p) => {
      p.sitting = false;
      this.clearAction(p);
      // A coffee survives the trip; a marshmallow on a stick doesn't make sense away from the fire.
      if (p.holding === "marshmallow" || p.holding === "skewer") {
        p.holding = "";
        p.toast = 0;
        p.snack = "";
      }
    });
    this.loadMapProps(mapId); // clears + repopulates chairs/toggleables, implicitly releasing all occupants
    // Leaving the casino mid-round hands every stake back.
    this.state.players.forEach((_p, sessionId) => this.refundBets(sessionId));
    this.state.bets.clear();
    this.setPhase("betting");
    this.regrowAt.clear();
    this.biteUntil.clear();
    this.fishBiteAt.clear();
    this.roasts.clear();
    this.snackUntil.clear();
    this.starlight.clear();
    this.stargazers.clear();
    this.chops.clear();
    this.starReels.clear();
    this.lastReportAt.clear();
    Object.assign(this.state.ball, BALL_HOME);
    this.ballIdle = 0;

    const spawns = MAP_SPAWN_POINTS[mapId];
    let i = 0;
    this.state.players.forEach((p) => {
      const spawn = spawns[i % spawns.length];
      p.x = spawn.x;
      p.z = spawn.z;
      i++;
    });

    this.state.currentMap = mapId;
    this.clock.setTimeout(() => {
      this.state.mapTransitioning = false;
    }, 1500);
  }

  /**
   * Put a seated player where the seat puts them: upright on it, or, AFK on a long seat that has a
   * nap pose (shared/props.ts), lying along it with their head at the arm. Called on sitting down
   * and whenever their status changes, so an AFK nap starts and ends with the badge.
   */
  private settleInSeat(player: Player, chair: ChairState) {
    const nap = player.status === "afk" ? MAP_CHAIRS[this.state.currentMap].find((c) => c.propId === chair.propId)?.nap : undefined;
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

    const config = MAP_CHAIRS[this.state.currentMap].find((c) => c.propId === vacatedId);
    if (config) {
      player.x = config.approachX;
      player.z = config.approachZ;
    }
    // getting up from one of the games table's chairs gives up its board seat with it
    if (boardSeatOfChair(vacatedId) && this.board.leave(sessionId)) {
      this.broadcastBoard();
      this.payBoardWinner();
    }

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
    if (this.state.mapTransitioning) return;
    const player = this.state.players.get(client.sessionId);
    const chair = this.state.chairs.get(chairId);
    if (!player || !chair) return;

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
  }

  private handleUseProp(sessionId: string, propId: string) {
    if (this.state.mapTransitioning) return;
    const player = this.state.players.get(sessionId);
    const prop = this.state.toggleables.get(propId);
    if (!player || !prop) return;

    const kind = prop.kind as ToggleableKind;
    // Lights, the TV and the campfire work from across the room — that's what makes them feel
    // like shared ambience. The espresso machine and arcades are things you stand in front of.
    if (isWalkUpProp(kind)) {
      // (sitting on the dock's edge, you cast from where you sit)
      if (player.sitting && !(kind === "fishing" && this.state.chairs.get(dockSeatOf(prop.propId))?.occupiedBy === sessionId)) return;
      // Mochi wanders (mochiSpot, wall-clock), so her reach is measured from where she is now.
      const at = kind === "cat" ? mochiSpot(this.state.currentMap, Date.now() / 1000) : prop;
      if (Math.hypot(player.x - at.x, player.z - at.z) > INTERACT_RADIUS) return;
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
        // Walking up opens the machine's own panel; spins arrive as "spin_slots" with a stake.
        this.sendTo(sessionId, "openSlots", { propId: prop.propId });
        break;
      case "stew": {
        if (!prop.on) return; // the pot is empty and being refilled
        prop.track = Math.min(STEW_STIRS, prop.track + 1);
        this.broadcast("emote", { sessionId, emoji: "🥄" });
        if (prop.track >= STEW_STIRS) {
          // Stew's up: everyone round the fire gets a bowl.
          this.state.players.forEach((p, id) => {
            if (!p.connected || Math.hypot(p.x - prop.x, p.z - prop.z) > STEW_RADIUS) return;
            this.addCoins(p, STEW_REWARD);
            this.broadcast("emote", { sessionId: id, emoji: "🍲" });
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
        this.broadcast("emote", { sessionId, emoji: ITEMS[item].emoji });
        break;
      }
      case "sparkle": {
        if (!prop.on) return; // already picked; another turns up soon
        if (Math.random() < 0.6) {
          this.addItem(player, "shell");
          this.broadcast("emote", { sessionId, emoji: ITEMS.shell.emoji });
        } else {
          this.addCoins(player, 3 + Math.floor(Math.random() * 8));
          this.broadcast("emote", { sessionId, emoji: "🪙" });
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
      case "woodchop":
        if (player.action === "" && Math.hypot(player.x - prop.x, player.z - prop.z) <= CHOP_REACH + 0.4) this.sendTo(sessionId, "openPanel", { kind: "woodchop", propId: prop.propId });
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
        this.broadcast("critterTreat", { sessionId });
        break;
      }
      case "lumberjack":
        if (Math.hypot(player.x - prop.x, player.z - prop.z) > BUSTER_REACH + 1.2) return;
        this.sendTo(sessionId, "openPanel", { kind: "buster", propId: prop.propId });
        this.broadcast("busterWave", { sessionId });
        break;
      case "angler":
        if (Math.hypot(player.x - prop.x, player.z - prop.z) > BARNABY_REACH + 1.2) return;
        this.sendTo(sessionId, "openPanel", { kind: "barnaby", propId: prop.propId });
        this.broadcast("barnabyWave", { sessionId });
        break;
      case "fishing":
        if (player.action === "fish" || player.action === "afkfish") this.handleReelIn(sessionId);
        else this.handleCastLine(sessionId, false, prop.propId);
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

  private spinSlot(sessionId: string, player: Player, propId: string, bet: number = SLOT_COST) {
    if (player.coins < bet) return;
    player.coins -= bet;
    this.bumpStat(player, "slots_spins");
    this.daily(sessionId, player, "spin_slots");
    const reels: [number, number, number] = [rollSymbol(), rollSymbol(), rollSymbol()];
    let win = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) win = bet * SLOT_TRIPLE[reels[0]];
    else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) win = bet * 2;
    // The reels spin for ~1.6 s on screen; pay out when they land.
    this.broadcast("slotSpin", { propId, sessionId, reels, win, bet });
    if (win > 0) {
      this.clock.setTimeout(() => {
        const p = this.state.players.get(sessionId);
        if (!p) return;
        this.addCoins(p, win);
        this.broadcast("emote", { sessionId, emoji: win >= bet * 12 ? "💰" : "🪙" });
      }, 1700);
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
    this.broadcast("emote", { sessionId, emoji: earned >= 100 ? "💰" : "🪙" });
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
    this.broadcast("emote", { sessionId, emoji });
    player.holding = "";
    player.toast = 0;
    this.clearAction(player);
    this.feed(sessionId, player);
  }

  private handleKick(sessionId: string, msg: { dirX: number; dirZ: number }) {
    if (this.state.currentMap !== "sunset_beach") return;
    const player = this.state.players.get(sessionId);
    if (!player || player.sitting) return;
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
      if (t.kind === "sparkle" && t !== prop) taken.add(`${t.x},${t.z}`);
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
    if (!player || player.action !== "") return;
    // the campfire's river: from the dock's edge at one of its spots (one angler to a spot), sitting
    // with your legs over the water; a bite, a tap, then the reel
    if (this.state.currentMap === "campfire_night") {
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
    if (!ALLOWED_EMOTES.has(emoji)) return;
    const now = Date.now();
    if (now - (this.lastEmoteAt.get(sessionId) ?? 0) < EMOTE_COOLDOWN_MS) return; // spam guard
    this.lastEmoteAt.set(sessionId, now);
    this.broadcast("emote", { sessionId, emoji });
  }

  private clearAction(player: Player) {
    player.action = "";
    player.actionProgress = 0;
  }

  async onJoin(client: Client, options: { userId: string; username: string; avatarUrl: string }) {
    const player = new Player();
    // The Discord user id keys the persisted record; a session id stands in when there is none.
    player.userId = String(options?.userId || `guest_${client.sessionId}`);
    player.username = String(options?.username || "Guest").slice(0, 100);
    player.avatarUrl = String(options?.avatarUrl ?? "");
    player.color = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
    // Cycle through the spawn points instead of always using the first one, otherwise every
    // player in the room materialises inside everybody else.
    const spawns = MAP_SPAWN_POINTS[this.state.currentMap];
    const spawn = spawns[this.state.players.size % spawns.length];
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
    player.owned = record.unlockedItems.join(",");
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
    if (heldSide && heldChair && !heldChair.occupiedBy && this.state.currentMap === "cozy_lounge") {
      this.board.claim(heldSide, client.sessionId);
      this.seatPlayer(client.sessionId, player, heldChair);
      resumedSeat = true;
    }
    if (isNew) this.persist(client.sessionId, player, true);
    else this.savedSignature.set(client.sessionId, "");
    this.sendTo(client.sessionId, "welcome", { isNew, coins: player.coins });
    // a game already on at the board table: the newcomer's avatars know whose turn it is
    if (this.board.seats.w || this.board.seats.b) this.sendTo(client.sessionId, "boardState", this.boardView());
    // back in their seat at the board: everyone sees the new session there, and their board reopens
    if (resumedSeat) {
      this.broadcastBoard();
      this.sendTo(client.sessionId, "openPanel", { kind: "boardgame", propId: "board_table" });
    }
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
    this.soakSeconds.delete(sessionId);
    this.roasts.delete(sessionId);
    this.snackUntil.delete(sessionId);
    this.lastRoastAt.delete(sessionId);
    this.starlight.delete(sessionId);
    this.stargazers.delete(sessionId);
    this.chops.delete(sessionId);
    this.lastChopAt.delete(sessionId);
    this.starReels.delete(sessionId);
    this.pendingFish.delete(sessionId);
    this.lastNetAt.delete(sessionId);
    this.lastTreatAt.delete(sessionId);
    this.hooked.delete(sessionId);
    this.refundBets(sessionId);
    // An unfinished blackjack hand is abandoned: the stake comes back.
    const game = this.blackjack.get(sessionId);
    if (game && game.phase === "player") this.addCoins(player, game.bet);
    this.blackjack.delete(sessionId);
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
      player.coins = old.coins;
      player.fishing = JSON.stringify(record.fishing);
      player.fed = old.fed;
    }
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
    this.boardFrozen = true;
    void this.writeBoard().finally(() => super.onBeforeShutdown());
  }

  async onDispose() {
    clearTimeout(this.boardSaveTimer);
    if (!this.boardFrozen) await this.writeBoard();
    await this.queue.flush();
    console.log(`Room ${this.roomId} disposed`);
  }
}


/** A burst of board changes is saved once, this long after the last. */
const BOARD_SAVE_DEBOUNCE_MS = 300;
/** How long a dropped player's avatar, chair and board seat wait for them to reconnect. */
const RECONNECT_WINDOW_S = 60;

/** Weighted so jackpots stay rare: cherries common, sevens scarce. */
const SYMBOL_WEIGHTS = [30, 24, 18, 13, 9, 6];
function rollSymbol(): number {
  let roll = Math.random() * SYMBOL_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    roll -= SYMBOL_WEIGHTS[i];
    if (roll <= 0) return i;
  }
  return 0;
}

/** A roast can start again this long after the last one came off the fire. */
const ROAST_COOLDOWN_MS = 1500;
/** Between swings at the chopping block. */
const CHOP_COOLDOWN_MS = 900;
/** Between treats for the raccoon (per player), and between a duck's dives. */
const TREAT_COOLDOWN_MS = 2000;
const DUCK_DIVE_COOLDOWN_MS = 1800;
/** Sitting cross-legged on the ground: the avatar's height, derived from the ground "cushion". */
const GROUND_SIT_Y = Math.round(seatAnchorY(CUSHIONS.ground) * 1000) / 1000;


/** 5-12 seconds between bites: long enough to feel like fishing, short enough to stay fun. */
function randomBiteDelay(): number {
  return 5000 + Math.random() * 7000;
}
