// The captain's boat on the server (shared/voyage.ts), in the room's sub-system pattern: the ticket
// from Sunset Beach's pier to the Open Sea, the trips between the pier, the sea and the Hidden Cove,
// and the Tidewater tools made at Dune's shack (shared/expedition.ts, place "dune").
import { FORGED_TOOLS, forgedBlocked, forgedOwned, grantForged, isForgedToolId, makingsMissing, spendMakings } from "../../../shared/expedition";
import type { FishingProfile } from "../../../shared/fishing";
import type { MapId } from "../../../shared/types";
import { TICKET_PRICE, isSeaMap, type SeaPacket } from "../../../shared/voyage";
import { BRINE_FRONT, BRINE_REACH, DUNE_FRONT, DUNE_REACH, PIER_RETURN } from "../../../shared/worlds/beach";
import { CAPTAIN_REACH, SEA_CAPTAIN_FRONT, SEA_SPAWNS } from "../../../shared/worlds/sea";

export interface SeaPlayer {
  map: string;
  x: number;
  z: number;
  sitting: boolean;
  coins: number;
  action: string;
  corner?: string;
}
export interface SeaHost {
  player(sessionId: string): SeaPlayer | undefined;
  profile(sessionId: string): FishingProfile | undefined;
  saveProfile(sessionId: string): void;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  addCoins(sessionId: string, amount: number): void;
  travel(sessionId: string, map: MapId, at: { x: number; z: number }): void;
  emote(sessionId: string, emoji: string): void;
  /** How many players are on a map (the boat's spawns are spread by it). */
  count(map: MapId): number;
}

export class BeachSea {
  constructor(private host: SeaHost) {}

  private say(sessionId: string, message: string, emoji = "⛵") {
    this.host.sendTo(sessionId, "campfireNotice", { message, emoji });
  }

  handle(sessionId: string, msg: SeaPacket) {
    if (!msg || typeof msg !== "object") return;
    const player = this.host.player(sessionId);
    const profile = this.host.profile(sessionId);
    if (!player || !profile || player.corner) return;
    if (msg.op === "sail") this.sail(sessionId, player, profile);
    else if (msg.op === "home") this.home(sessionId, player, profile);
    else if (msg.op === "make") this.make(sessionId, player, profile, msg.tool);
  }

  /** Aboard at the pier's head: the ticket bought (or the trip already paid for taken up again). */
  private sail(sessionId: string, player: SeaPlayer, profile: FishingProfile) {
    if (player.map !== "sunset_beach" || player.sitting || (player.action !== "" && player.action !== "rest")) return;
    if (Math.hypot(player.x - BRINE_FRONT.x, player.z - BRINE_FRONT.z) > BRINE_REACH + 0.8) return;
    if (!profile.seaTrip) {
      if (player.coins < TICKET_PRICE) return this.say(sessionId, `A ticket to sea is ${TICKET_PRICE} coins, friend`, "🪙");
      this.host.addCoins(sessionId, -TICKET_PRICE);
      profile.seaTrip = true;
      this.host.saveProfile(sessionId);
    }
    this.host.travel(sessionId, "open_sea", SEA_SPAWNS[this.host.count("open_sea") % SEA_SPAWNS.length]);
  }

  /** Back to the pier: the trip is over. */
  private home(sessionId: string, player: SeaPlayer, profile: FishingProfile) {
    if (!isSeaMap(player.map) || player.sitting) return;
    if (player.map === "open_sea" && Math.hypot(player.x - SEA_CAPTAIN_FRONT.x, player.z - SEA_CAPTAIN_FRONT.z) > CAPTAIN_REACH + 1.2) return;
    this.endTrip(sessionId, profile);
    this.host.travel(sessionId, "sunset_beach", PIER_RETURN);
  }

  /** The trip ended some other way (the world list from the boat): the ticket is spent. */
  endTrip(sessionId: string, profile = this.host.profile(sessionId)) {
    if (!profile || !profile.seaTrip) return;
    profile.seaTrip = false;
    this.host.saveProfile(sessionId);
  }

  /** A Tidewater tool made at Dune's shack: coins and makings from all three crafts. */
  private make(sessionId: string, player: SeaPlayer, profile: FishingProfile, tool: unknown) {
    const reply = (ok: boolean, message: string, coins = 0) => this.host.sendTo(sessionId, "barnabyResult", { ok, message, coins });
    if (player.map !== "sunset_beach" || Math.hypot(player.x - DUNE_FRONT.x, player.z - DUNE_FRONT.z) > DUNE_REACH + 0.6) return reply(false, "Come up to the shack, friend");
    if (!isForgedToolId(tool) || FORGED_TOOLS[tool].place !== "dune") return;
    const t = FORGED_TOOLS[tool];
    if (forgedOwned(profile, tool)) return reply(false, `You have the ${t.name} already`);
    const first = forgedBlocked(profile, tool);
    if (first) return reply(false, `The ${t.name} takes ${first}`);
    if (player.coins < t.coins) return reply(false, `The ${t.name} takes ${t.coins.toLocaleString("en-US")} 🪙`);
    const missing = makingsMissing(profile, t.needs);
    if (missing.length) return reply(false, `The ${t.name} takes ${missing.join(", ")} more`);
    spendMakings(profile, t.needs);
    this.host.addCoins(sessionId, -t.coins);
    grantForged(profile, tool);
    this.host.saveProfile(sessionId);
    this.host.emote(sessionId, t.emoji);
    reply(true, `${t.emoji} The ${t.name}, made slow and made well. ${t.blurb}`, -t.coins);
  }
}
