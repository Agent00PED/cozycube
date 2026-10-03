// The captain's boat on the server (shared/voyage.ts), in the room's sub-system pattern: the ticket
// from Sunset Beach's pier to the Open Sea, the trips between the pier, the sea and the Hidden Cove,
// and the Tidewater tools made at Dune's shack (shared/expedition.ts, place "dune").
import { FORGED_TOOLS, forgedBlocked, forgedOwned, grantForged, isForgedToolId, makingsMissing, spendMakings } from "../../../shared/expedition";
import type { FishingProfile } from "../../../shared/fishing";
import type { MapId } from "../../../shared/types";
import { CHART_PIECES, CLAM_DOUBLE, CLAM_PEARLS, CLAM_SHUT_MS, TICKET_PRICE, chartChance, isSeaMap, type ChartPiece, type ClamSync, type SeaPacket, DOLPHIN_HASTE, SEA_EVENT_EVERY_MIN, SEA_EVENT_KINDS, SEA_EVENT_S, SHOAL_LUCK, WHALE_KING, seaEventOn, type SeaEvent, type SeaEventKind } from "../../../shared/voyage";
import { MATERIAL_CAP } from "../../../shared/economy";
import { CLAM_REACH, COVE_BENCH_FRONT, COVE_BENCH_REACH, COVE_CAPTAIN_FRONT, COVE_CLAMS, COVE_SPAWNS } from "../../../shared/worlds/cove";
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
  /** To everyone in the Hidden Cove. */
  toCove(type: string, payload: unknown): void;
  /** To everyone out on the Open Sea. */
  toSea?(type: string, payload: unknown): void;
}

export class BeachSea {
  /** When each of the cove's clams opens again (ms): the room's, never saved. */
  private clams = new Map<string, number>();

  /** The living wonder beside the boat (null: none), and when the next may come. */
  private event: SeaEvent | null = null;
  private nextEventAt = 0;
  private lastKind: SeaEventKind | null = null;

  constructor(private host: SeaHost) {}

  /** Every tick: a wonder ends when its time is up; another comes a while later, while anyone is out
   *  on the Open Sea (never the same twice running). */
  tick(now: number) {
    if (this.event && now >= this.event.until) {
      this.event = null;
      this.host.toSea?.("seaEvent", null);
    }
    if (this.host.count("open_sea") <= 0) {
      this.nextEventAt = 0;
      return;
    }
    const gap = () => (SEA_EVENT_EVERY_MIN[0] + Math.random() * (SEA_EVENT_EVERY_MIN[1] - SEA_EVENT_EVERY_MIN[0])) * 60_000;
    // (the first of a trip comes sooner: a few minutes in)
    if (!this.nextEventAt) this.nextEventAt = now + gap() * 0.4;
    if (this.event || now < this.nextEventAt) return;
    const kinds = SEA_EVENT_KINDS.filter((k) => k !== this.lastKind);
    this.startEvent(kinds[Math.floor(Math.random() * kinds.length)], now);
    this.nextEventAt = now + SEA_EVENT_S * 1000 + gap();
  }

  startEvent(kind: SeaEventKind, now = Date.now()) {
    this.event = { kind, at: now, until: now + SEA_EVENT_S * 1000 };
    this.lastKind = kind;
    this.host.toSea?.("seaEvent", this.event);
  }

  /** What the wonder beside the boat does for an angler on the Open Sea, now. */
  luck(now = Date.now()): { rare: number; king: number; haste: number } {
    const ev = seaEventOn(this.event, now) ? this.event : null;
    return { rare: ev?.kind === "shoal" ? SHOAL_LUCK : 0, king: ev?.kind === "whale" ? WHALE_KING : 0, haste: ev?.kind === "dolphins" ? DOLPHIN_HASTE : 1 };
  }

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
    else if (msg.op === "cove") this.toCove(sessionId, player, profile);
    else if (msg.op === "tosea") this.toSea(sessionId, player);
    else if (msg.op === "pry") this.pry(sessionId, player, profile, msg.clam);
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
    if (seaEventOn(this.event)) this.host.sendTo(sessionId, "seaEvent", this.event);
  }

  /** Back to the pier: the trip is over. */
  private home(sessionId: string, player: SeaPlayer, profile: FishingProfile) {
    if (!isSeaMap(player.map) || player.sitting) return;
    if (player.map === "open_sea" && Math.hypot(player.x - SEA_CAPTAIN_FRONT.x, player.z - SEA_CAPTAIN_FRONT.z) > CAPTAIN_REACH + 1.2) return;
    if (player.map === "hidden_cove" && Math.hypot(player.x - COVE_CAPTAIN_FRONT.x, player.z - COVE_CAPTAIN_FRONT.z) > CAPTAIN_REACH + 1.2) return;
    this.endTrip(sessionId, profile);
    this.host.travel(sessionId, "sunset_beach", PIER_RETURN);
  }

  /** The trip ended some other way (the world list from the boat): the ticket is spent. */
  endTrip(sessionId: string, profile = this.host.profile(sessionId)) {
    if (!profile || !profile.seaTrip) return;
    profile.seaTrip = false;
    this.host.saveProfile(sessionId);
  }

  /** At the wheel, the chart whole: on to the Hidden Cove (the captain knows the way from then on). */
  private toCove(sessionId: string, player: SeaPlayer, profile: FishingProfile) {
    if (player.map !== "open_sea" || player.sitting) return;
    if (Math.hypot(player.x - SEA_CAPTAIN_FRONT.x, player.z - SEA_CAPTAIN_FRONT.z) > CAPTAIN_REACH + 1.2) return;
    if (!profile.coveAccess) {
      if (profile.chart < CHART_PIECES) return;
      profile.coveAccess = true;
      this.host.saveProfile(sessionId);
    }
    this.host.travel(sessionId, "hidden_cove", COVE_SPAWNS[this.host.count("hidden_cove") % COVE_SPAWNS.length]);
    this.host.sendTo(sessionId, "coveClams", this.clamSync());
  }

  /** From the cove's sand: back out to the Open Sea. */
  private toSea(sessionId: string, player: SeaPlayer) {
    if (player.map !== "hidden_cove" || player.sitting) return;
    if (Math.hypot(player.x - COVE_CAPTAIN_FRONT.x, player.z - COVE_CAPTAIN_FRONT.z) > CAPTAIN_REACH + 1.2) return;
    this.host.travel(sessionId, "open_sea", SEA_SPAWNS[this.host.count("open_sea") % SEA_SPAWNS.length]);
    if (seaEventOn(this.event)) this.host.sendTo(sessionId, "seaEvent", this.event);
  }

  /** A fish landed by hand on the Open Sea: now and then a bottle comes up with it, a torn piece of
   *  the chart inside (the chance climbs with every catch that brings none). */
  bottle(sessionId: string, rand: () => number = Math.random) {
    const profile = this.host.profile(sessionId);
    const player = this.host.player(sessionId);
    if (!profile || !player || player.map !== "open_sea" || profile.chart >= CHART_PIECES || profile.coveAccess) return;
    if (rand() < chartChance(profile.chartDry)) {
      profile.chart++;
      profile.chartDry = 0;
      this.host.sendTo(sessionId, "chartPiece", { piece: profile.chart, of: CHART_PIECES } satisfies ChartPiece);
      this.host.emote(sessionId, "🍾");
    } else {
      profile.chartDry++;
    }
    this.host.saveProfile(sessionId);
  }

  private clamSync(): ClamSync {
    const now = Date.now();
    const out: ClamSync = {};
    for (const c of COVE_CLAMS) {
      const at = this.clams.get(c.id) ?? 0;
      if (at > now) out[c.id] = at;
    }
    return out;
  }

  /** A giant clam pried open: a pearl or two, and it is shut again for a while (for everyone). */
  private pry(sessionId: string, player: SeaPlayer, profile: FishingProfile, clamId: unknown) {
    const clam = COVE_CLAMS.find((c) => c.id === clamId);
    if (!clam || player.map !== "hidden_cove" || player.sitting || player.action !== "") {
      // (asked from the cove with no clam named: the clams' state, for whoever just arrived)
      if (player.map === "hidden_cove") this.host.sendTo(sessionId, "coveClams", this.clamSync());
      return;
    }
    if (Math.hypot(player.x - clam.x, player.z - clam.z) > CLAM_REACH + 0.6) return;
    const now = Date.now();
    if ((this.clams.get(clam.id) ?? 0) > now) return this.say(sessionId, "That one's shut tight: give it a while", "🦪");
    const have = profile.byproducts.pearl ?? 0;
    if (have >= MATERIAL_CAP) return this.say(sessionId, "You can't carry another pearl", "🫧");
    const n = Math.min(MATERIAL_CAP - have, Math.random() < CLAM_DOUBLE ? CLAM_PEARLS[1] : CLAM_PEARLS[0]);
    profile.byproducts.pearl = have + n;
    this.clams.set(clam.id, now + CLAM_SHUT_MS);
    this.host.saveProfile(sessionId);
    this.host.emote(sessionId, "🫧");
    this.host.sendTo(sessionId, "clamPried", { clam: clam.id, pearls: n });
    this.host.toCove("coveClams", this.clamSync());
  }

  /** A Tidewater tool made at Dune's shack: coins and makings from all three crafts. */
  private make(sessionId: string, player: SeaPlayer, profile: FishingProfile, tool: unknown) {
    const reply = (ok: boolean, message: string, coins = 0) => this.host.sendTo(sessionId, "barnabyResult", { ok, message, coins });
    if (!isForgedToolId(tool)) return;
    const place = FORGED_TOOLS[tool].place;
    // (Dune's shack for the Tidewater tools, the cove's old bench for the Deep Tide)
    if (place === "dune" && (player.map !== "sunset_beach" || Math.hypot(player.x - DUNE_FRONT.x, player.z - DUNE_FRONT.z) > DUNE_REACH + 0.6)) return reply(false, "Come up to the shack, friend");
    if (place === "cove" && (player.map !== "hidden_cove" || Math.hypot(player.x - COVE_BENCH_FRONT.x, player.z - COVE_BENCH_FRONT.z) > COVE_BENCH_REACH + 0.6)) return reply(false, "Step up to the bench");
    if (place === "forge") return;
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
