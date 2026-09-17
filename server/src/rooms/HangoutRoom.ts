import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, clampToWorld, isBlocked } from "../../../shared/collision";
import { MAP_CHAIRS, MAP_TOGGLEABLES } from "../../../shared/props";
import {
  BREW_SECONDS,
  CAMPFIRE_BOOST_SECONDS,
  EMOTES,
  INTERACT_RADIUS,
  ROAST_SECONDS,
  TOAST_MAX,
  isTimeOfDay,
  isWalkUpProp,
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
}

class HangoutState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: ChairState }) chairs = new MapSchema<ChairState>();
  @type({ map: ToggleableState }) toggleables = new MapSchema<ToggleableState>();
  @type("string") currentMap: MapId = "cozy_lounge";
  @type("string") timeOfDay: TimeOfDay = "day";
  @type("boolean") mapTransitioning = false;
}

const MOVE_SPEED_PER_SEC = 3;
// How far a client may legitimately have travelled between two move reports. Reports are
// throttled to ~48ms, but a tab that stalls (GC, backgrounded, a slow frame) can legitimately
// batch up more ground than that, so this is deliberately generous — it is an anti-teleport
// sanity check, not a precise speed limit.
const MAX_REPORT_STEP = MOVE_SPEED_PER_SEC * 0.75;
const TICK_MS = 100; // timed activities only need 10 Hz; state patches still go out at the default rate
const EMOTE_COOLDOWN_MS = 600;
const ALLOWED_EMOTES = new Set<string>(EMOTES);

export class HangoutRoom extends Room<HangoutState> {
  maxClients = 25;
  channelId = "";
  private lastEmoteAt = new Map<string, number>();

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
      this.applyReportedPosition(player, msg.x, msg.z);
    });

    this.onMessage("standUp", (client) => this.handleStandUp(client.sessionId));

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
      if (isTimeOfDay(msg?.timeOfDay)) this.state.timeOfDay = msg.timeOfDay;
    });

    this.onMessage("emote", (client, msg: { emoji: string }) => this.handleEmote(client.sessionId, msg.emoji));

    this.onMessage("speaking", (client, msg: { speaking: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.speaking = msg.speaking === true;
    });

    this.onMessage("roast", (client) => this.handleRoast(client.sessionId));
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
    this.state.toggleables.forEach((prop) => {
      if (prop.boost > 0) prop.boost = Math.max(0, prop.boost - dt);
    });

    this.state.players.forEach((player, sessionId) => {
      if (player.action === "brew") {
        player.actionProgress = Math.min(1, player.actionProgress + dt / BREW_SECONDS);
        if (player.actionProgress >= 1) {
          player.holding = "coffee";
          this.clearAction(player);
          this.broadcast("emote", { sessionId, emoji: "☕" });
        }
      } else if (player.action === "roast") {
        player.toast = Math.min(TOAST_MAX, player.toast + dt / ROAST_SECONDS);
      }
    });
  }

  // The authoritative position comes from the client's own prediction, validated here,
  // instead of a second server-side integration running on a different clock. Two integrations
  // inevitably diverge (different dt, different message timing), and that divergence was what
  // the client had to reconcile away as a visible snap. Validating one stream keeps the server
  // in charge of collisions and bounds while leaving the walk perfectly smooth.
  private applyReportedPosition(player: Player, x?: number, z?: number) {
    if (this.state.mapTransitioning) return;
    if (typeof x !== "number" || typeof z !== "number") return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    let goalX = clampToWorld(x);
    let goalZ = clampToWorld(z);

    // An implausibly long jump is clamped to MAX_REPORT_STEP toward the report — NOT ignored.
    // Ignoring it was a permanent-desync trap: the server's position never moved, so every later
    // report was measured against that stale anchor and rejected too, and the client never
    // reconciled either (its snap only fires when the server position CHANGES). Moving partway
    // guarantees the server position changes, which makes the client snap back to it and
    // converge, while still capping how far any single message can carry a player.
    const dx = goalX - player.x;
    const dz = goalZ - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > MAX_REPORT_STEP) {
      goalX = player.x + (dx / dist) * MAX_REPORT_STEP;
      goalZ = player.z + (dz / dist) * MAX_REPORT_STEP;
    }

    const mapId = this.state.currentMap;
    // Axis-separated so sliding along a wall still works instead of stopping dead.
    if (!isBlocked(goalX, player.z, mapId)) player.x = goalX;
    if (!isBlocked(player.x, goalZ, mapId)) player.z = goalZ;
  }

  private handleChangeMap(mapId: MapId) {
    if (this.state.mapTransitioning) return;
    if (!MAP_OBSTACLES[mapId]) return;

    this.state.mapTransitioning = true;
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
    // Cycle through the spawn points instead of always using the first one, otherwise every
    // player in the room materialises inside everybody else.
    const spawns = MAP_SPAWN_POINTS[this.state.currentMap];
    const spawn = spawns[this.state.players.size % spawns.length];
    player.x = spawn.x;
    player.z = spawn.z;
    this.state.players.set(client.sessionId, player);
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

    if (consented) {
      this.state.players.delete(client.sessionId);
      this.lastEmoteAt.delete(client.sessionId);
      return;
    }

    player.connected = false;
    try {
      await this.allowReconnection(client, 30);
      player.connected = true;
    } catch {
      this.state.players.delete(client.sessionId);
      this.lastEmoteAt.delete(client.sessionId);
    }
  }

  onDispose() {
    console.log(`Room ${this.roomId} disposed`);
  }
}
