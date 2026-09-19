import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, clampToWorld, isBlocked } from "../../../shared/collision";
import { MAP_CHAIRS, MAP_TOGGLEABLES, isFishingSeat } from "../../../shared/props";
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
}

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
/** What a line brings up. "boot" is a dud that goes back in the sea. */
const FISH_TABLE: { item: ItemId | "boot"; weight: number }[] = [
  { item: "sardine", weight: 50 },
  { item: "clownfish", weight: 25 },
  { item: "boot", weight: 12 },
  { item: "octopus", weight: 10 },
  { item: "goldray", weight: 3 },
];
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
      // Premium hats have to have been bought.
      if (isPremiumHat(look.hat) && !player.owned.split(",").includes(look.hat)) return;
      player.look = encodeLook(look);
      player.color = look.shirt;
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
    this.state.toggleables.forEach((prop) => {
      if (prop.boost > 0) prop.boost = Math.max(0, prop.boost - dt);
      // picked bushes grow back
      const regrow = this.regrowAt.get(prop.propId);
      if (regrow !== undefined && now >= regrow) {
        prop.on = true;
        this.regrowAt.delete(prop.propId);
        if (prop.kind === "sparkle") this.moveSparkle(prop);
      }
    });

    this.state.players.forEach((player, sessionId) => {
      if (player.action === "brew") {
        player.actionProgress = Math.min(1, player.actionProgress + dt / BREW_SECONDS);
        if (player.actionProgress >= 1) {
          player.holding = "coffee";
          this.clearAction(player);
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
    if (!player || (player.action !== "fish" && player.action !== "afkfish")) return;
    if (player.action === "afkfish" || !this.biteUntil.has(sessionId)) {
      // nothing on the line: this is "stop fishing"
      this.clearAction(player);
      this.fishBiteAt.delete(sessionId);
      return;
    }
    this.biteUntil.delete(sessionId);
    player.actionProgress = 0;
    const caught = pickFish();
    if (caught === "boot") {
      this.broadcast("emote", { sessionId, emoji: "👢" });
    } else {
      this.addItem(player, caught);
      this.broadcast("emote", { sessionId, emoji: ITEMS[caught].emoji });
    }
    this.fishBiteAt.set(sessionId, Date.now() + randomBiteDelay());
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

    let goalX = clampToWorld(x);
    let goalZ = clampToWorld(z);

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
    if (!MAP_OBSTACLES[mapId]) return;

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
      if (Math.hypot(player.x - prop.x, player.z - prop.z) > INTERACT_RADIUS) return;
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
        this.spinSlot(sessionId, player, prop.propId);
        break;
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
        this.broadcast("emote", { sessionId, emoji: "💕" });
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

  private spinSlot(sessionId: string, player: Player, propId: string) {
    if (player.coins < SLOT_COST) return;
    player.coins -= SLOT_COST;
    const reels: [number, number, number] = [rollSymbol(), rollSymbol(), rollSymbol()];
    let win = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) win = SLOT_COST * SLOT_TRIPLE[reels[0]];
    else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) win = SLOT_COST * 2;
    // The reels spin for ~1.6 s on screen; pay out when they land.
    this.broadcast("slotSpin", { propId, sessionId, reels, win });
    if (win > 0) {
      this.clock.setTimeout(() => {
        const p = this.state.players.get(sessionId);
        if (!p) return;
        this.addCoins(p, win);
        this.broadcast("emote", { sessionId, emoji: win >= SLOT_COST * 12 ? "💰" : "🪙" });
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

  onJoin(client: Client, options: { userId: string; username: string; avatarUrl: string }) {
    const player = new Player();
    player.userId = options.userId;
    player.username = options.username;
    player.avatarUrl = options.avatarUrl;
    player.color = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
    // Cycle through the spawn points instead of always using the first one, otherwise every
    // player in the room materialises inside everybody else.
    const spawns = MAP_SPAWN_POINTS[this.state.currentMap];
    const spawn = spawns[this.state.players.size % spawns.length];
    player.x = spawn.x;
    player.z = spawn.z;
    // Coming back to the same room restores your wallet, catch and shop hats.
    const wallet = this.wallets.get(player.userId);
    if (wallet) {
      player.coins = wallet.coins;
      player.bag = wallet.bag;
      player.owned = wallet.owned;
    }
    this.state.players.set(client.sessionId, player);
  }

  private removePlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    this.refundBets(sessionId);
    if (player.userId) this.wallets.set(player.userId, { coins: player.coins, bag: player.bag, owned: player.owned });
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

    player.connected = false;
    try {
      await this.allowReconnection(client, 30);
      player.connected = true;
    } catch {
      this.removePlayer(client.sessionId);
    }
  }

  onDispose() {
    console.log(`Room ${this.roomId} disposed`);
  }
}

function pickFish(): ItemId | "boot" {
  const total = FISH_TABLE.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of FISH_TABLE) {
    roll -= c.weight;
    if (roll <= 0) return c.item;
  }
  return "sardine";
}

/** Weighted so jackpots stay rare: cherries common, sevens scarce. */
const SYMBOL_WEIGHTS = [34, 26, 20, 13, 7];
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
