import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, isBlocked } from "../../../shared/collision";
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
  @type("string") currentMap: MapId = "cozy_bedroom";
  @type("boolean") mapTransitioning = false;
}

const MOVE_SPEED_PER_SEC = 3;
const INTERACT_RADIUS = 1.5;

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

    this.setSimulationInterval((dt) => this.update(dt / 1000), 1000 / 20);

    this.onMessage("move", (client, msg: { dirX: number; dirZ: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.sitting) return;
      player.dirX = Math.max(-1, Math.min(1, msg.dirX));
      player.dirZ = Math.max(-1, Math.min(1, msg.dirZ));
    });

    this.onMessage("setColor", (client, msg: { color: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !/^#[0-9a-fA-F]{6}$/.test(msg.color)) return;
      player.color = msg.color;
    });

    this.onMessage("changeMap", (client, msg: { mapId: MapId }) => {
      this.handleChangeMap(msg.mapId);
    });

    this.onMessage("interactChair", (client, msg: { chairId: string }) => {
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

  private update(dt: number) {
    if (this.state.mapTransitioning) return;
    const obstacles = MAP_OBSTACLES[this.state.currentMap];

    this.state.players.forEach((player) => {
      if (player.sitting) return;
      const speed = MOVE_SPEED_PER_SEC * dt;
      const nextX = player.x + player.dirX * speed;
      const nextZ = player.z + player.dirZ * speed;
      if (!isBlocked(nextX, player.z, obstacles)) player.x = nextX;
      if (!isBlocked(player.x, nextZ, obstacles)) player.z = nextZ;
    });
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
    const spawn = MAP_SPAWN_POINTS[this.state.currentMap][0];
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
