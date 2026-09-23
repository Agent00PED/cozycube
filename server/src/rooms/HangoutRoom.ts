import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, clampToWorld, isBlocked } from "../../../shared/collision";
import { PersistenceQueue, getPlayerStore, newPlayerRecord, type PlayerRecord } from "../db/players";
import { applyMove, boardView, legalMoves, newBoardGame, outfitPrice, progressDaily, rollDaily, rollFish, rollGacha, todayKey, type BoardGame } from "./games";
import { MAP_CHAIRS, MAP_TOGGLEABLES, isFishingSeat, mochiSpot } from "../../../shared/props";
import { BALL_HOME, KICK_REACH, kickBall, stepBall } from "../../../shared/volleyball";
import {
  BITE_WINDOW_S,
  BREW_SECONDS,
  ESPRESSO_TIP,
  ESPRESSO_TIP_COOLDOWN_S,
  FORAGE_REGROW_S,
  GESTURE_EMOJI,
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
  BOARD_MOVE_TIMEOUT_S,
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
  fromStoredLook,
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
  @type("string") color = "#ffffff";
  @type("string") look = "";
  @type("boolean") sitting = false;
  @type("number") sitRotationY = 0;
  @type("number") sitY = 0;
  @type("string") sitPose = "sit";
  @type("string") holding = "";
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
  private lastPunchAt = new Map<string, number>();
  private dizzyUntil = new Map<string, number>();
  private auraUntil = new Map<string, number>();
  private vibeAt = new Map<string, number>();
  private soakSeconds = new Map<string, number>();
  private lastArcadeScoreAt = new Map<string, number>();
  private lastMatchaAt = new Map<string, number>();
  private lastDrinkAt = new Map<string, number>();
  private lastMochiAt = new Map<string, number>();
  private boardGame: BoardGame = newBoardGame();
  private persistClock = 0;
  private leaderboardClock = LEADERBOARD_EVERY_S; // refresh on the first tick
  private phaseClock = ROULETTE_PHASE_SECONDS.betting;
  private cycleClock = 0;
  private ballIdle = 0;

  onCreate(options: { channelId: string }) {
    this.setState(new HangoutState());
    this.autoDispose = false; // `autoDispose` is an accessor on the base Room class — assign, don't redeclare as a field.
    // NOTE: do not reassign `this.roomId` here — it breaks Colyseus's internal room
    // registry/dispose bookkeeping. "1 Discord voice channel = 1 room" is achieved via
    // `.filterBy(["channelId"])` on the room definition in server/src/index.ts instead.
    this.channelId = options.channelId;
    this.loadMapProps(this.state.currentMap);

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), TICK_MS);

    this.onMessage("move", (client, msg: { dirX: number; dirZ: number; x?: number; z?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.sitting) return;
      player.dirX = Math.max(-1, Math.min(1, msg.dirX));
      player.dirZ = Math.max(-1, Math.min(1, msg.dirZ));
      // Walking away from the espresso machine abandons the brew.
      if (player.action === "brew" && (player.dirX !== 0 || player.dirZ !== 0)) this.clearAction(player);
      this.applyReportedPosition(player, msg.x, msg.z, client.sessionId);
    });

    this.onMessage("standUp", (client) => this.handleStandUp(client.sessionId));

    this.onMessage("setLook", (client, msg: { look: string }) => {
      const player = this.state.players.get(client.sessionId);
      const look = parseLook(msg?.look);
      if (!player || !look) return;
      // Premium hats and outfits have to have been bought (or won at the gachapon).
      if (isPremiumHat(look.hat) && !this.owns(player, look.hat)) return;
      if (!this.owns(player, look.outfit)) return;
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
    this.onMessage("setTimeOfDay", (_client, msg: { timeOfDay: TimeOfDay }) => {
      if (!isTimeOfDay(msg?.timeOfDay)) return;
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
    });
    this.onMessage("reelIn", (client) => this.handleReelIn(client.sessionId));
    this.onMessage("eat", (client) => this.handleEat(client.sessionId));
    this.onMessage("dropHeld", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player && player.holding === "coffee") player.holding = "";
    });

    // --- server-authoritative transactions (the wallet is never trusted from a client) ---
    this.onMessage("claim_allowance", (client) => this.handleClaimAllowance(client.sessionId));
    this.onMessage("buy_item", (client, msg: { item: string }) => this.handleBuyHat(client.sessionId, msg?.item));
    this.onMessage("spin_slots", (client, msg: { propId: string; bet: number }) => this.handleSpinSlots(client.sessionId, msg));
    this.onMessage("blackjack_action", (client, msg: { action: BlackjackAction; bet?: number }) => this.handleBlackjack(client.sessionId, msg));
    this.onMessage("chat_bubble", (client, msg: { text: string }) => this.handleChat(client.sessionId, msg?.text));
    // --- outfits, gachapon and the arcade ---
    this.onMessage("buy_outfit", (client, msg: { outfit: string }) => this.handleBuyOutfit(client.sessionId, msg?.outfit));
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
    this.onMessage("board_join", (client) => this.handleBoardJoin(client.sessionId));
    this.onMessage("board_leave", (client) => this.handleBoardLeave(client.sessionId));
    this.onMessage("board_move", (client, msg: { from: number; to: number }) => this.handleBoardMove(client.sessionId, Number(msg?.from), Number(msg?.to)));
    // --- mochi ---
    this.onMessage("mochi_play", (client, msg: { action: string }) => this.handleMochi(client.sessionId, msg?.action));
    // Latency: the client times the round trip and reports it, so the roster can show pings.
    this.onMessage("ping", (client, msg: { t: number; rtt?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player && typeof msg?.rtt === "number" && Number.isFinite(msg.rtt)) player.ping = Math.max(0, Math.min(9999, Math.round(msg.rtt)));
      client.send("pong", { t: msg?.t ?? 0 });
    });
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
    const signature = `${record.coins}|${player.owned}|${player.look}|${player.stats}|${player.daily}|${record.mochiCoinsDay}|${record.lastDailyClaim?.getTime() ?? 0}`;
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
      this.broadcast("emote", { sessionId, emoji: recipe.emoji });
    }
    this.sendTo(sessionId, "blendResult", { right, coins: right ? DRINK_REWARD : 0 });
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
    this.broadcast("boardState", boardView(this.boardGame));
  }

  private handleBoardJoin(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.currentMap !== "cozy_lounge") return;
    const g = this.boardGame;
    if (g.players.red === sessionId || g.players.black === sessionId) return this.broadcastBoard();
    if (g.winner || (g.players.red && g.players.black && !this.state.players.has(g.players.red))) this.boardGame = newBoardGame();
    const game = this.boardGame;
    if (!game.players.red) {
      game.players.red = sessionId;
      game.names.red = player.username;
    } else if (!game.players.black) {
      game.players.black = sessionId;
      game.names.black = player.username;
    }
    game.lastMoveAt = Date.now();
    this.broadcastBoard();
  }

  private handleBoardLeave(sessionId: string) {
    const g = this.boardGame;
    if (g.players.red !== sessionId && g.players.black !== sessionId) return;
    // walking away forfeits an unfinished game
    if (g.players.red && g.players.black && !g.winner) g.winner = g.players.red === sessionId ? "black" : "red";
    else this.boardGame = newBoardGame();
    this.broadcastBoard();
    if (this.boardGame.winner) this.clock.setTimeout(() => (this.boardGame = newBoardGame()), 4000);
  }

  private handleBoardMove(sessionId: string, from: number, to: number) {
    const g = this.boardGame;
    const color = g.players.red === sessionId ? "red" : g.players.black === sessionId ? "black" : "";
    if (!color || !g.players.red || !g.players.black) return;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from > 63 || to > 63) return;
    if (!applyMove(g, color, from, to)) return;
    this.broadcastBoard();
    if (g.winner) {
      const winnerId = g.players[g.winner];
      const winner = this.state.players.get(winnerId);
      if (winner) {
        this.addCoins(winner, 15);
        this.broadcast("emote", { sessionId: winnerId, emoji: "♟️" });
      }
      this.clock.setTimeout(() => {
        this.boardGame = newBoardGame();
        this.broadcastBoard();
      }, 6000);
    }
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
        const until = this.biteUntil.get(sessionId);
        if (until !== undefined) {
          if (now > until) {
            // too slow: it got away
            this.biteUntil.delete(sessionId);
            player.actionProgress = 0;
            this.broadcast("emote", { sessionId, emoji: "💨" });
            this.fishBiteAt.set(sessionId, now + randomBiteDelay());
          }
        } else if (now >= (this.fishBiteAt.get(sessionId) ?? 0)) {
          // Bite! actionProgress = 1 tells every client the float has gone under.
          this.biteUntil.set(sessionId, now + BITE_WINDOW_S * 1000);
          player.actionProgress = 1;
        }
      }
    });

    if (this.state.currentMap === "sunset_beach") this.tickBall(dt);
    if (this.state.currentMap === "velvet_casino") this.tickRoulette(dt);

    if (this.state.autoCycle) {
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

  private handleGesture(sessionId: string, gesture: unknown) {
    if (!isGesture(gesture)) return;
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
    let allowed = MAX_REPORT_STEP;
    if (sessionId) {
      const last = this.lastReportAt.get(sessionId);
      this.lastReportAt.set(sessionId, now);
      if (last !== undefined) {
        const elapsed = Math.min(1, (now - last) / 1000);
        allowed = Math.min(MAX_REPORT_STEP, MOVE_SPEED_PER_SEC * elapsed * SPEED_TOLERANCE + STEP_SLACK);
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
    this.boardGame = newBoardGame();

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
      if (p.holding === "marshmallow") {
        p.holding = "";
        p.toast = 0;
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

    // You can't carry a roasting stick away from the fire.
    if (player.action === "roast" || player.holding === "marshmallow") {
      player.holding = "";
      player.toast = 0;
    }
    this.clearAction(player);
    this.fishBiteAt.delete(sessionId);
    this.biteUntil.delete(sessionId);
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

    if (player.action === "brew") this.clearAction(player);
    if (player.gloves) this.handleBoxingExit(client.sessionId); // gloves come off to sit down
    chair.occupiedBy = client.sessionId;
    player.sitting = true;
    player.sitRotationY = chair.rotationY;
    player.sitY = chair.sitY;
    player.sitPose = poseForSeat(chair.style as SeatStyle);
    player.x = chair.x;
    player.z = chair.z;
    player.dirX = 0;
    player.dirZ = 0;
    this.lastReportAt.delete(client.sessionId);
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
      if (player.sitting) return;
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
      case "boardgame":
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

  private handleCastLine(sessionId: string, afk = false) {
    const player = this.state.players.get(sessionId);
    if (!player || !player.sitting || player.action !== "") return;
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
    player.stats = JSON.stringify(record.stats);
    const look = fromStoredLook(record.equippedLook as any);
    if (look && this.ownsOutfit(record.unlockedItems, look.outfit)) {
      player.look = encodeLook(look);
      player.color = look.outfitColor;
    }
    const daily = record.daily && record.daily.date === todayKey() ? record.daily : rollDaily(player.userId);
    record.daily = daily;
    player.daily = JSON.stringify(daily);
    this.vibeAt.set(client.sessionId, Date.now());
    this.records.set(client.sessionId, record);
    // The catch bucket is a session thing (the traders buy it); it survives a reconnect only.
    const wallet = this.wallets.get(player.userId);
    if (wallet) player.bag = wallet.bag;

    this.state.players.set(client.sessionId, player);
    if (isNew) this.persist(client.sessionId, player, true);
    else this.savedSignature.set(client.sessionId, "");
    this.sendTo(client.sessionId, "welcome", { isNew, coins: player.coins });
  }

  private ownsOutfit(unlocked: string[], outfit: string): boolean {
    return (STARTER_OUTFITS as string[]).includes(outfit) || unlocked.includes(outfit);
  }

  private removePlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    if (this.boardGame.players.red === sessionId || this.boardGame.players.black === sessionId) this.handleBoardLeave(sessionId);
    this.vibeAt.delete(sessionId);
    this.soakSeconds.delete(sessionId);
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
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    this.state.chairs.forEach((chair) => {
      if (chair.occupiedBy === client.sessionId) chair.occupiedBy = "";
    });
    player.sitting = false;
    player.speaking = false;
    this.clearAction(player);

    this.fishBiteAt.delete(client.sessionId);
    this.biteUntil.delete(client.sessionId);
    this.lastReportAt.delete(client.sessionId);
    if (consented) {
      this.removePlayer(client.sessionId);
      return;
    }

    // Dropped, not left: write what we have now in case they never come back.
    this.persist(client.sessionId, player, true);
    player.connected = false;
    try {
      await this.allowReconnection(client, 30);
      player.connected = true;
    } catch {
      this.removePlayer(client.sessionId);
    }
  }

  async onDispose() {
    await this.queue.flush();
    console.log(`Room ${this.roomId} disposed`);
  }
}


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

/** 5-12 seconds between bites: long enough to feel like fishing, short enough to stay fun. */
function randomBiteDelay(): number {
  return 5000 + Math.random() * 7000;
}
