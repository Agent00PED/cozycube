import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, clampToWorld, isBlocked } from "../../../shared/collision";
import { MAP_CHAIRS, MAP_TOGGLEABLES } from "../../../shared/props";
import type { MapId } from "../../../shared/types";

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
  @type("boolean") connected = true;
}

class ChairState extends Schema {
  @type("string") propId = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") rotationY = 0;
  @type("string") style = "pad";
  @type("string") occupiedBy = ""; // sessionId, or "" if free
}

class ToggleableState extends Schema {
  @type("string") propId = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("string") kind = "lamp";
  @type("string") color = "#ffffff";
  @type("boolean") on = true;
}

class HangoutState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: ChairState }) chairs = new MapSchema<ChairState>();
  @type({ map: ToggleableState }) toggleables = new MapSchema<ToggleableState>();
  @type("string") currentMap: MapId = "cozy_lounge";
  @type("boolean") mapTransitioning = false;
}

const MOVE_SPEED_PER_SEC = 3;
// How far a client may legitimately have travelled between two move reports. Reports are
// throttled to ~48ms, but a tab that stalls (GC, backgrounded, a slow frame) can legitimately
// batch up more ground than that, so this is deliberately generous — it is an anti-teleport
// sanity check, not a precise speed limit.
const MAX_REPORT_STEP = MOVE_SPEED_PER_SEC * 0.75;
// Players walk to a seat's approach point themselves before asking to sit, so this only has to
// be loose enough to tolerate prediction drift on arrival.
const INTERACT_RADIUS = 2.5;

export class HangoutRoom extends Room<HangoutState> {
  maxClients = 25;
  channelId = "";

  onCreate(options: { channelId: string }) {
    this.setState(new HangoutState());
    this.autoDispose = false; // `autoDispose` is an accessor on the base Room class — assign, don't redeclare as a field.
    // NOTE: do not reassign `this.roomId` here — it breaks Colyseus's internal room
    // registry/dispose bookkeeping. "1 Discord voice channel = 1 room" is achieved via
    // `.filterBy(["channelId"])` on the room definition in server/src/index.ts instead.
    this.channelId = options.channelId;
    this.loadMapProps(this.state.currentMap);

    this.onMessage("move", (client, msg: { dirX: number; dirZ: number; x?: number; z?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.sitting) return;
      player.dirX = Math.max(-1, Math.min(1, msg.dirX));
      player.dirZ = Math.max(-1, Math.min(1, msg.dirZ));
      this.applyReportedPosition(player, msg.x, msg.z);
    });

    this.onMessage("standUp", (client) => this.handleStandUp(client.sessionId));

    this.onMessage("setColor", (client, msg: { color: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !/^#[0-9a-fA-F]{6}$/.test(msg.color)) return;
      player.color = msg.color;
    });

    this.onMessage("changeMap", (client, msg: { mapId: MapId }) => {
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

    this.onMessage("toggleProp", (client, msg: { propId: string }) => {
      this.handleToggleProp(client, msg.propId);
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
      this.state.chairs.set(chair.propId, state);
    }

    this.state.toggleables.clear();
    for (const prop of MAP_TOGGLEABLES[mapId]) {
      const state = new ToggleableState();
      state.propId = prop.propId;
      state.x = prop.x;
      state.z = prop.z;
      state.kind = prop.kind;
      state.color = prop.color;
      state.on = prop.defaultOn;
      this.state.toggleables.set(prop.propId, state);
    }
  }

  // The authoritative position now comes from the client's own prediction, validated here,
  // instead of a second server-side integration running on a different clock. Two integrations
  // inevitably diverge (different dt, different message timing), and that divergence was what
  // the client had to reconcile away as a visible snap. Validating one stream keeps the server
  // in charge of collisions and bounds while leaving the walk perfectly smooth.
  private applyReportedPosition(player: Player, x?: number, z?: number) {
    if (this.state.mapTransitioning) return;
    if (typeof x !== "number" || typeof z !== "number") return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    // Reject implausible jumps (teleport/speed hacks, or a stale message after a map change).
    if (Math.hypot(x - player.x, z - player.z) > MAX_REPORT_STEP) return;

    const obstacles = MAP_OBSTACLES[this.state.currentMap];
    const nextX = clampToWorld(x);
    const nextZ = clampToWorld(z);
    // Axis-separated so sliding along a wall still works instead of stopping dead.
    if (!isBlocked(nextX, player.z, obstacles)) player.x = nextX;
    if (!isBlocked(player.x, nextZ, obstacles)) player.z = nextZ;
  }

  private handleChangeMap(mapId: MapId) {
    if (this.state.mapTransitioning) return;
    if (!MAP_OBSTACLES[mapId]) return;

    this.state.mapTransitioning = true;
    this.state.players.forEach((p) => (p.sitting = false));
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
    if (config?.approachX !== undefined && config.approachZ !== undefined) {
      player.x = config.approachX;
      player.z = config.approachZ;
    }

    player.sitting = false;
    player.dirX = 0;
    player.dirZ = 0;
  }

  private handleInteractChair(client: Client, chairId: string) {
    if (this.state.mapTransitioning) return;
    const player = this.state.players.get(client.sessionId);
    const chair = this.state.chairs.get(chairId);
    if (!player || !chair) return;

    if (player.sitting) {
      if (chair.occupiedBy === client.sessionId) {
        chair.occupiedBy = "";
        player.sitting = false;
      }
      return; // sitting in a different chair (shouldn't normally happen) — ignore
    }

    if (chair.occupiedBy !== "") return; // already taken

    const dist = Math.hypot(player.x - chair.x, player.z - chair.z);
    if (dist > INTERACT_RADIUS) return; // server-authoritative proximity check

    chair.occupiedBy = client.sessionId;
    player.sitting = true;
    player.sitRotationY = chair.rotationY;
    player.x = chair.x;
    player.z = chair.z;
    player.dirX = 0;
    player.dirZ = 0;
  }

  private handleToggleProp(client: Client, propId: string) {
    if (this.state.mapTransitioning) return;
    const player = this.state.players.get(client.sessionId);
    const prop = this.state.toggleables.get(propId);
    if (!player || !prop) return;

    const dist = Math.hypot(player.x - prop.x, player.z - prop.z);
    if (dist > INTERACT_RADIUS) return;

    prop.on = !prop.on;
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

    if (consented) {
      this.state.players.delete(client.sessionId);
      return;
    }

    player.connected = false;
    try {
      await this.allowReconnection(client, 30);
      player.connected = true;
    } catch {
      this.state.players.delete(client.sessionId);
    }
  }

  onDispose() {
    console.log(`Room ${this.roomId} disposed`);
  }
}
