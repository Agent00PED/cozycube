import type { MapId } from "../../../shared/types";
import {
  ANVIL,
  ANVIL_FRONT,
  ANVIL_REACH,
  CAVE_ARRIVAL,
  CAVE_WINCH,
  WINCH_REACH,
  WINCH_RETURN_S,
  WINCH_RIDE_S,
  FORGE,
  FORGE_FRONT,
  FORGE_REACH,
  GUS,
  GUS_FRONT,
  GUS_REACH,
  ORE_NODES,
  ORE_NODE_AT,
  THERMAL_REACH,
  THERMAL_SEATS,
  THERMAL_SEAT_IDS,
  oreNodeOf,
  oreReach,
  orePropId,
  type OreNode,
  CAPYBARA,
  CAVE_PEARLS,
  FIND_REACH,
  JOURNAL_PAGES,
  PHOTO_REACH,
  PHOTO_SPOT,
  cavernsZoneAt,
} from "../../../shared/worlds/caverns";
import { FOREST_ADIT_FRONT, OLD_FLINT, OLD_FLINT_FRONT, OLD_FLINT_REACH, WOODS_FROM_CAVERNS } from "../../../shared/worlds/forest";
import {
  CHISEL_CLOCK_SLACK_MS,
  PERFECT_DAMAGE,
  PROSPECT_CLOCK_SLACK_MS,
  STREAK_IDLE_S,
  onPulse,
  streakBonus,
  DEEP_WARMTH_MS,
  DEFLECT_STAGGER_S,
  FORGE_QUEUE_MAX,
  FORGE_RECIPES,
  FORGE_RELICS,
  FORGE_SMELT_S,
  INGOT_IDS,
  MASTERWORK_OF,
  ORE_ITEMS,
  ORE_KINDS,
  PICKAXES,
  PULVERIZED_DUST,
  QUICK_SMELT_ORDER,
  SOAK_S,
  STOUT_DAMAGE,
  STRIKE_DEBOUNCE_S,
  oreRule,
  type CodexPacket,
  QUICK_CRACK_GAP_MS,
  forgeGrade,
  BELLOWS_LIMIT_S,
  chiselGauge,
  coopShares,
  isForgeBatch,
  isGeodeId,
  isIngotId,
  isMiningRelicId,
  isOreItemId,
  isPickaxeId,
  itemsOf,
  judgeChisel,
  judgeForge,
  judgeStrike,
  rollDust,
  rollGem,
  rollSeam,
  rollWeakSpot,
  rollYield,
  scaleCount,
  seamFaces,
  smeltable,
  strikeDirection,
  warmthOn,
  type CaveLoot,
  type CaveProspect,
  type CaveShatter,
  type CaveStrike,
  type CavernsResult,
  type ForgeBatch,
  type ForgeGame,
  type ForgePacket,
  type ForgeResult,
  type GeodeAim,
  type GeodeId,
  type GeodePacket,
  type GeodeResult,
  type GeodeStart,
  type GusPacket,
  type IngotId,
  type OnsenPacket,
  type SoakBreath,
  BREATH_BONUS_MS,
  BREATH_CLOCK_SLACK_MS,
  BREATH_MAX,
  breathAt,
  type OreCategory,
  type OreItemId,
  type OreSyncState,
  type SatchelPacket,
  type StrikePacket,
  type Vec3,
} from "../../../shared/caverns_mining";
import { DRIP_EVERY_S, DRIP_REACH, DRIP_S, GLOW_LURE_GRACE_S, type CaveDrip } from "../../../shared/caverns_fishing";
import { BLOOM_REGROW, BLOOM_YIELD, CAVE_EVENT_EVERY_MIN, CAVE_EVENT_INFO, CAVE_EVENT_S, CLOUD_LUCK, CODEX, CODEX_BY_ID, CODEX_SECTIONS, EXODUS_S, FAUNA_ZONE, FOSSILS, FOSSIL_CHANCE, ROCKFALL_S, caveEventOn, codexProgress, type CaveEvent, type CaveEventKind } from "../../../shared/caverns_codex";
import { dayPhase, DAY_CYCLE_MS } from "../../../shared/daynight";
import { nextSatchelTier, satchelAdd, satchelCount, satchelCountFor, satchelCounts, satchelHasRoom, satchelTake, satchelTakeFor, satchelTier, type SatchelTier } from "../../../shared/satchel";
import { takeLogs, WOOD, BYPRODUCTS, type ByproductId, type WoodKind } from "../../../shared/chop";
import { addMaterial, buffOn, materialCount, takeMaterial, type FishingProfile } from "../../../shared/fishing";
import { GEAR, geodeFind, lodestoneSweet, satchelBonus, swingHaste, wearGear } from "../../../shared/gear";
import { oreGood, priceRun, type MarketState } from "../../../shared/market";
import { BYPRODUCT_PRICES } from "../../../shared/economy";

// The Glimmering Caverns on the server (the CasinoFloor pattern: the room hands it a host). It keeps:
//
//   the nodes          each one's damage (shared by everyone striking it), its weak spot (re-rolled as
//                      a direct strike runs the fissure on), who struck it how hard (the co-op shares),
//                      and when a broken one grows back; synced as `state.ores`, saved with the scene
//   prospecting        who is at which node, their last strike (the pickaxe's own swing, the Tempered
//                      Knuckle Guards' quicker one), a deflected blow's stagger; a strike is judged
//                      against the weak spot (shared/caverns_mining judgeStrike: the Deep Warmth's and
//                      the Lodestone Pendant's wider sweet spot, Miner's Stout's harder blow), and a
//                      broken node's yield goes to everyone past 15% of its damage, +40% for each other
//                      such miner (a silver seam's stone dust into the materials' store)
//   the Titan Monolith a world event on the Cenote's islet: it surfaces (the whole room is told), is
//                      broken together, and sinks back for 25-30 minutes
//   the forge          each player's queue of plain ingots (one every FORGE_SMELT_S, into the satchel
//                      or onto its tray), the bellows' game (a batch of 1, 3 or 5 by hand: its makings
//                      taken as it starts, the log of pumps and strikes replayed at the end, Masterwork
//                      ingots for a clean game), and the mining relics forged once each
//   the chisel         a geode's seam, the gauge's clock once the seam is found, the mallet's release
//   the terraces       who soaks in the warm pools, for how long; SOAK_S of it: the Deep Warmth
//   the lucky drip     a ripple on one of the outcrop's floats every DRIP_EVERY_S
//   Gus's shop         sales at the hour's market (the stone dust from the materials' store too), the
//                      pickaxes, the satchel's tiers
//   Old Flint          the woods' way down: his gift (the Rusted Pickaxe) and the adit it opens

/** What the caverns need of a player. */
export interface CavePlayer {
  userId: string;
  username: string;
  map: MapId;
  x: number;
  z: number;
  sitting: boolean;
  action: string;
  actionProgress: number;
  coins: number;
  connected: boolean;
}

export interface CavernsHost {
  player(sessionId: string): CavePlayer | undefined;
  /** Every session in the room. */
  sessions(): string[];
  profile(sessionId: string): FishingProfile | undefined;
  /** The profile changed: mirror it to the player and queue it for the database. */
  saveProfile(sessionId: string): void;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  toMap(map: MapId, type: string, payload: unknown): void;
  /** To everyone in the room, whatever world (the Monolith surfacing). */
  shout(type: string, payload: unknown): void;
  addCoins(sessionId: string, amount: number): void;
  gesture(sessionId: string, gesture: "mine" | "reach" | "toss"): void;
  emote(sessionId: string, emoji: string): void;
  market(): MarketState;
  setMarket(m: MarketState): void;
  travel(sessionId: string, map: MapId, at: { x: number; z: number }): void;
  /** Set them down elsewhere on the map they are on (their own reports not believed for `holdMs`). */
  place(sessionId: string, x: number, z: number, holdMs: number): void;
  /** Seat them on a chair (it is free: checked here), or stand them up (onto its exit anchor). */
  seat(sessionId: string, chairId: string): void;
  standUp(sessionId: string): void;
  /** Who sits on a chair ("" nobody), and which chair a session sits on ("" none). */
  occupant(chairId: string): string;
  seatOf(sessionId: string): string;
  /** A tick of the daily checklist (a soak in the warm pools counts). */
  daily(sessionId: string, task: "soak_onsen"): void;
  /** The nodes changed: their sync (JSON) into the room's state. */
  syncOres(json: string): void;
  /** The living wonder under way (JSON, "" none) into the room's state. */
  syncCaveEvent(json: string): void;
  /** Where the floats of everyone fishing the cenote's shore sit (the lucky drip falls by one). */
  shoreFloats(): { x: number; z: number }[];
}

interface NodeState {
  /** Damage taken (0 .. the kind's hp), whether it stands, when a broken one grows back (ms). */
  dmg: number;
  up: boolean;
  respawnAt: number;
  weak: Vec3;
  /** Who struck it, and how hard (the co-op shares), since it last grew back. */
  contrib: Map<string, number>;
}

interface Prospector {
  node: string;
  lastStrikeAt: number;
  staggerUntil: number;
  seq: number;
  /** When the close-up opened (the ring's pulse runs from it). */
  openedAt: number;
}
/** A miner's run of Perfects (from node to node), and their last strike. */
interface Streak {
  n: number;
  at: number;
}

/** A bellows game under way: its batch, its seed, when it began (the makings already taken). */
interface ForgeGameState {
  ingot: IngotId;
  batch: ForgeBatch;
  seed: number;
  at: number;
}
/** A geode on the chisel's anvil: its seam, and once found, when the gauge began (0: not yet). */
interface ChiselState {
  geode: GeodeId;
  seam: Vec3;
  gaugeAt: number;
  lastAt: number;
}

/** A prospector idle this long (no strike) lets the node go. */
const PROSPECT_IDLE_S = 30;
/** The slack on a pickaxe's swing a strike may arrive early by (the network's bunching). */
const SWING_SLACK_MS = 90;
/** A soak's daily-checklist tick (the soak task: 30 s). */
const DAILY_SOAK_S = 30;
/** A bellows game left this long past its limit is given up (its makings back). */
const FORGE_GAME_ABANDON_S = BELLOWS_LIMIT_S + 20;
/** The chisel's blow is seen through before the avatar leaves the anvil (ms after a cleave). */
const CHISEL_REST_MS = 900;

export class CavernsMine {
  private readonly nodes = new Map<string, NodeState>();
  private readonly prospectors = new Map<string, Prospector>();
  private readonly streaks = new Map<string, Streak>();
  /** Cleavers whose blow is still falling (when they step back from the anvil), and each one's last
   *  quick crack. */
  private readonly chiselRest = new Map<string, number>();
  /** The living wonder under way (shared/caverns_codex.ts), and when the next may start. */
  private event: CaveEvent | null = null;
  private nextEventAt = Date.now() + (CAVE_EVENT_EVERY_MIN[0] + Math.random() * (CAVE_EVENT_EVERY_MIN[1] - CAVE_EVENT_EVERY_MIN[0])) * 60_000;
  private eventClock = 0;
  private readonly quickAt = new Map<string, number>();
  private readonly chisels = new Map<string, ChiselState>();
  private readonly forgeGames = new Map<string, ForgeGameState>();
  private readonly soakers = new Map<string, number>();
  /** Each bather's deep breaths this soak (and the last breath taken, one a breath). */
  private readonly breaths = new Map<string, { n: number; k: number }>();
  /** Who is riding the winch up, and when their ride ends (ms); the cage free again at `winchFreeAt`. */
  private readonly riders = new Map<string, number>();
  private winchFreeAt = 0;
  private drip: CaveDrip | null = null;
  private nextDripAt = Date.now() + DRIP_EVERY_S * 1000;
  private synced = "";
  private forgeClock = 0;

  constructor(private readonly host: CavernsHost) {
    // (a crew node, the Rockfall's heap, lies waiting until its wonder raises it)
    for (const n of ORE_NODES) this.nodes.set(n.id, { dmg: 0, up: !ORE_KINDS[n.kind].crew, respawnAt: ORE_KINDS[n.kind].crew ? Infinity : 0, weak: rollWeakSpot(n.face), contrib: new Map() });
    this.sync();
  }

  // --- the scene: saved and restored with the lounge's -----------------------------------------------

  /** Each node that isn't fresh: its damage and, broken, when it grows back. */
  save(): Record<string, { dmg: number; respawnAt: number }> {
    const out: Record<string, { dmg: number; respawnAt: number }> = {};
    this.nodes.forEach((s, id) => {
      if (ORE_KINDS[ORE_NODE_AT.get(id)!.kind].crew) return;
      if (s.dmg > 0 || !s.up) out[id] = { dmg: Math.round(s.dmg), respawnAt: s.up ? 0 : s.respawnAt };
    });
    return out;
  }

  restore(saved: unknown) {
    if (!saved || typeof saved !== "object") return;
    const now = Date.now();
    for (const [id, v] of Object.entries(saved as Record<string, { dmg?: unknown; respawnAt?: unknown }>)) {
      const node = ORE_NODE_AT.get(id);
      const s = this.nodes.get(id);
      if (!node || !s || !v || ORE_KINDS[node.kind].crew) continue;
      const at = Number(v.respawnAt) || 0;
      if (at > now) {
        s.up = false;
        s.respawnAt = Math.min(at, now + ORE_KINDS[node.kind].respawnS[1] * 1000);
        s.dmg = 0;
      } else {
        s.up = true;
        s.dmg = Math.max(0, Math.min(ORE_KINDS[node.kind].hp - 1, Math.round(Number(v.dmg) || 0)));
      }
    }
    this.sync();
  }

  /** The nodes as the room syncs them. */
  private sync() {
    const out: OreSyncState = {};
    this.nodes.forEach((s, id) => {
      const crew = [...this.prospectors.values()].filter((p) => p.node === id).length;
      out[id] = { dmg: Math.round((s.dmg / ORE_KINDS[ORE_NODE_AT.get(id)!.kind].hp) * 1000) / 1000, up: s.up, ...(crew > 0 ? { crew } : {}) };
    });
    const json = JSON.stringify(out);
    if (json === this.synced) return;
    this.synced = json;
    this.host.syncOres(json);
  }

  /** Whether a node stands (its prop takes a click only then). */
  isUp(nodeId: string): boolean {
    return this.nodes.get(nodeId)?.up ?? false;
  }

  // --- the props: the adit both ends, Old Flint, Gus, the forge, the anvil, the nodes ------------------

  useProp(sessionId: string, prop: { propId: string; kind: string; x: number; z: number }) {
    const player = this.host.player(sessionId);
    if (!player) return;
    switch (prop.kind) {
      case "miner":
        return this.talkToFlint(sessionId, player);
      case "adit":
        return this.useAdit(sessionId, player, prop.propId);
      case "prospector":
        if (player.map !== "glimmering_caverns" || Math.min(Math.hypot(player.x - GUS_FRONT.x, player.z - GUS_FRONT.z), Math.hypot(player.x - GUS.x, player.z - GUS.z)) > GUS_REACH + 1.2) return;
        this.host.sendTo(sessionId, "openPanel", { kind: "gus", propId: prop.propId });
        this.host.toMap("glimmering_caverns", "gusWave", { sessionId });
        return;
      case "forge":
        if (player.map !== "glimmering_caverns" || !this.atForge(player)) return;
        this.host.sendTo(sessionId, "openPanel", { kind: "forge", propId: prop.propId });
        return;
      case "anvil":
        if (player.map !== "glimmering_caverns" || !this.atAnvil(player)) return;
        this.host.sendTo(sessionId, "openPanel", { kind: "anvil", propId: prop.propId });
        return;
      case "ore": {
        const node = oreNodeOf(prop.propId);
        if (node) this.startProspect(sessionId, player, node);
        return;
      }
      case "winch":
        return this.rideWinch(sessionId, player, prop.propId);
    }
  }

  /** Gus's winch lift, the way back up: from its foot in the glimmer rift up the cliff to the coal
   *  breakdown's edge (a step from the basecamp). The rider is set down on the ledge at once, riding
   *  ("winch") for WINCH_RIDE_S while every client draws the climb (winchRidePose); the cage then goes
   *  back down empty, and takes no one till it is down. */
  private rideWinch(sessionId: string, player: CavePlayer, propId: string) {
    if (player.map !== "glimmering_caverns" || player.sitting || player.action !== "" || propId !== "winch_bottom") return;
    const from = CAVE_WINCH.lower;
    if (Math.hypot(player.x - from.x, player.z - from.z) > WINCH_REACH + 0.6) return;
    const now = Date.now();
    if (now < this.winchFreeAt) {
      this.host.sendTo(sessionId, "campfireNotice", { message: "The cage is on its way back down: hold on a moment", emoji: "🪢" });
      return;
    }
    const to = CAVE_WINCH.upper;
    player.action = "winch";
    this.riders.set(sessionId, now + WINCH_RIDE_S * 1000);
    this.winchFreeAt = now + (WINCH_RIDE_S + WINCH_RETURN_S) * 1000;
    this.host.place(sessionId, to.x, to.z, WINCH_RIDE_S * 1000 + 300);
  }

  /** Old Flint the Badger by the woods' adit: the first time, his welcome (the lore), the Rusted
   *  Pickaxe and the adit opened for good; after, a word. */
  private talkToFlint(sessionId: string, player: CavePlayer) {
    if (player.map !== "whispering_woods") return;
    if (Math.min(Math.hypot(player.x - OLD_FLINT_FRONT.x, player.z - OLD_FLINT_FRONT.z), Math.hypot(player.x - OLD_FLINT.x, player.z - OLD_FLINT.z)) > OLD_FLINT_REACH + 1.2) return;
    const kit = this.host.profile(sessionId);
    if (!kit) return;
    const first = !kit.caveAccess;
    if (first) {
      kit.caveAccess = true;
      if (!kit.pickaxes.includes("rusted")) kit.pickaxes.push("rusted");
      kit.pickaxeId = kit.pickaxeId || "rusted";
      this.host.saveProfile(sessionId);
      this.host.emote(sessionId, "⛏️");
    }
    this.host.sendTo(sessionId, "openPanel", { kind: "flint", propId: first ? "old_flint:first" : "old_flint" });
    this.host.toMap("whispering_woods", "flintWave", { sessionId });
  }

  /** The adit: down into the caverns (once Old Flint has met you), or back up to the woods. */
  private useAdit(sessionId: string, player: CavePlayer, propId: string) {
    if (player.sitting) return;
    if (propId === "cave_adit") {
      if (player.map !== "glimmering_caverns") return;
      this.leave(sessionId);
      this.host.travel(sessionId, "whispering_woods", WOODS_FROM_CAVERNS);
      return;
    }
    if (player.map !== "whispering_woods" || Math.hypot(player.x - FOREST_ADIT_FRONT.x, player.z - FOREST_ADIT_FRONT.z) > 2.4) return;
    const kit = this.host.profile(sessionId);
    if (!kit) return;
    if (!kit.caveAccess) {
      this.host.sendTo(sessionId, "campfireNotice", { message: "\"Hold it there, young'un!\" Old Flint steps in front of the adit: have a word with him first", emoji: "🦡" });
      return;
    }
    this.host.travel(sessionId, "glimmering_caverns", CAVE_ARRIVAL);
  }

  private atForge(p: CavePlayer) {
    return Math.min(Math.hypot(p.x - FORGE_FRONT.x, p.z - FORGE_FRONT.z), Math.hypot(p.x - FORGE.x, p.z - FORGE.z)) <= FORGE_REACH + 0.8;
  }
  private atAnvil(p: CavePlayer) {
    return Math.min(Math.hypot(p.x - ANVIL_FRONT.x, p.z - ANVIL_FRONT.z), Math.hypot(p.x - ANVIL.x, p.z - ANVIL.z)) <= ANVIL_REACH + 0.6;
  }
  private atGus(p: CavePlayer) {
    return p.map === "glimmering_caverns" && Math.min(Math.hypot(p.x - GUS_FRONT.x, p.z - GUS_FRONT.z), Math.hypot(p.x - GUS.x, p.z - GUS.z)) <= GUS_REACH + 0.6;
  }

  private reply(sessionId: string, ok: boolean, message: string, coins = 0) {
    this.host.sendTo(sessionId, "cavernsResult", { ok, message, ...(coins ? { coins } : {}) } satisfies CavernsResult);
    if (ok) this.host.saveProfile(sessionId);
  }

  /** The satchel's extra slots (the Deepvein Satchel Strap, worn). */
  private strap(kit: FishingProfile) {
    return satchelBonus(kit.worn);
  }

  // --- prospecting ----------------------------------------------------------------------------------

  /** Up to a node to mine it: it stands, it is in reach, the satchel has room. The rock is framed and
   *  its weak spot told (no dial, no gauge: the rock's own tells). */
  private startProspect(sessionId: string, player: CavePlayer, node: OreNode) {
    if (player.map !== "glimmering_caverns" || player.sitting || (player.action !== "" && player.action !== "mine")) return;
    if (Math.hypot(player.x - node.x, player.z - node.z) > oreReach(node) + 0.6) return;
    const s = this.nodes.get(node.id);
    const kit = this.host.profile(sessionId);
    if (!s || !kit) return;
    const info = ORE_KINDS[node.kind];
    if (!s.up) {
      this.host.sendTo(sessionId, "campfireNotice", { message: node.kind === "monolith" ? "The Titan Monolith has sunk back into the islet's rock: it surfaces again before long" : `That ${info.name} is still growing back`, emoji: "🪨" });
      return;
    }
    if (!satchelHasRoom(kit, this.strap(kit))) {
      const t = satchelTier(kit.satchelTier);
      this.host.sendTo(sessionId, "campfireNotice", { message: `Your ${t.name} is full (${t.slots + this.strap(kit)} slots of 10): sell to Gus, smelt at the forge, or crack your geodes`, emoji: "⛏️" });
      return;
    }
    const pick = PICKAXES[kit.pickaxeId];
    const rule = oreRule(pick.tier, node.kind);
    if (rule === "deflect") this.host.sendTo(sessionId, "campfireNotice", { message: `${info.name} is T${info.tier}: your ${pick.name} (T${pick.tier}) will skid right off it. A T${info.tier - 1} pickaxe or better bites (Gus sells them)`, emoji: "🪨" });
    const was = this.prospectors.get(sessionId);
    this.prospectors.set(sessionId, { node: node.id, lastStrikeAt: 0, staggerUntil: 0, seq: was?.node === node.id ? was.seq : 0, openedAt: Date.now() });
    player.action = "mine";
    player.actionProgress = s.dmg / info.hp;
    const packet: CaveProspect = { node: node.id, kind: node.kind, weak: s.weak, pick: kit.pickaxeId, rule };
    this.host.sendTo(sessionId, "caveProspect", packet);
    this.sync();
  }

  /** Stepping back from a node (the view closed, walked off, travelled, left). */
  stopProspect(sessionId: string) {
    if (!this.prospectors.delete(sessionId)) return;
    const player = this.host.player(sessionId);
    if (player && player.action === "mine") {
      player.action = "";
      player.actionProgress = 0;
    }
    this.host.sendTo(sessionId, "caveProspectEnd", {});
    this.sync();
  }

  /** A strike (`caverns:strike`): judged on the node's weak spot as it stands now. */
  strike(sessionId: string, raw: StrikePacket) {
    const player = this.host.player(sessionId);
    const pr = this.prospectors.get(sessionId);
    const kit = this.host.profile(sessionId);
    if (!player || !pr || !kit || player.map !== "glimmering_caverns" || player.action !== "mine") return;
    if (!raw || typeof raw !== "object" || raw.node !== pr.node) return;
    const seq = Number(raw.seq);
    if (Number.isFinite(seq) && seq <= pr.seq) return;
    if (Number.isFinite(seq)) pr.seq = seq;
    const node = ORE_NODE_AT.get(pr.node);
    const s = node ? this.nodes.get(node.id) : undefined;
    const dir = strikeDirection(raw.dir);
    if (!node || !s || !dir || !s.up) return;
    const now = Date.now();
    const pick = PICKAXES[kit.pickaxeId];
    if (now < pr.staggerUntil) return;
    // (the Tempered Knuckle Guards: a quicker swing)
    if (now - pr.lastStrikeAt < Math.max(STRIKE_DEBOUNCE_S * 1000, (pick.swing / swingHaste(kit.worn)) * 1000 - SWING_SLACK_MS)) return;
    pr.lastStrikeAt = now;
    const warm = warmthOn(kit.deepWarmthUntil, now);
    // (the Lodestone Pendant's wider sweet spot, Miner's Stout's harder blow)
    const j = judgeStrike(node.kind, kit.pickaxeId, s.weak, dir, warm, { sweet: lodestoneSweet(kit.worn), damage: buffOn(kit, "stout", now) ? STOUT_DAMAGE : 1 });
    this.host.gesture(sessionId, "mine");
    const info = ORE_KINDS[node.kind];
    // (as the ring closed: the time the client measured since the close-up opened, if near enough
    // the server's own)
    const seen = now - pr.openedAt;
    const tc = Number(raw.t);
    const at = Number.isFinite(tc) && tc >= 0 && Math.abs(tc - seen) <= PROSPECT_CLOCK_SLACK_MS ? tc : seen;
    const perfect = j.verdict === "direct" && onPulse(at / 1000);
    const run = this.streak(sessionId, now);
    if (perfect) run.n += 1;
    else if (j.verdict === "near" || j.verdict === "bedrock") run.n = 0;
    run.at = now;
    if (j.verdict === "deflect") {
      pr.staggerUntil = now + DEFLECT_STAGGER_S * 1000;
      this.host.toMap("glimmering_caverns", "caveStrike", { sessionId, node: node.id, verdict: "deflect", hit: dir, dmg: s.dmg / info.hp, streak: run.n } satisfies CaveStrike);
      return;
    }
    const damage = perfect && !j.oneshot ? Math.round(j.damage * PERFECT_DAMAGE) : j.damage;
    s.dmg = Math.min(info.hp, s.dmg + damage);
    s.contrib.set(sessionId, (s.contrib.get(sessionId) ?? 0) + damage);
    const moved = j.verdict === "direct" && s.dmg < info.hp;
    if (moved) s.weak = rollWeakSpot(node.face);
    const frac = s.dmg / info.hp;
    this.host.toMap("glimmering_caverns", "caveStrike", { sessionId, node: node.id, verdict: j.verdict, hit: dir, dmg: Math.round(frac * 1000) / 1000, ...(moved ? { moved: true } : {}), ...(perfect ? { perfect: true } : {}), streak: run.n } satisfies CaveStrike);
    // the fissure ran on: everyone at this node is shown where the rock is weak now
    if (moved) this.prospectors.forEach((p, id) => p.node === node.id && this.host.sendTo(id, "caveWeak", { node: node.id, weak: s.weak }));
    this.prospectors.forEach((p, id) => {
      if (p.node !== node.id) return;
      const who = this.host.player(id);
      if (who) who.actionProgress = Math.round(frac * 20) / 20;
    });
    if (s.dmg >= info.hp) this.shatter(node, s, sessionId, j.verdict === "direct");
    this.sync();
  }

  /** A node breaks: its yield to everyone past 15% of its damage (+40% for each other such miner),
   *  flying to them; the node down until it grows back (its cracked stump dusting); the Monolith told
   *  to the whole room. */
  private shatter(node: OreNode, s: NodeState, breaker: string, perfect: boolean) {
    const { crew, mult: shares } = coopShares(s.contrib);
    const now = Date.now();
    const [lo, hi] = ORE_KINDS[node.kind].respawnS;
    // (a Glimmer Bloom: the rift's glimmer half as much again, growing back twice as fast)
    const bloom = node.kind === "glimmer" && caveEventOn(this.event, "bloom", now);
    const mult = shares * (bloom ? BLOOM_YIELD : 1);
    s.up = false;
    s.respawnAt = ORE_KINDS[node.kind].crew ? Infinity : now + (lo + Math.random() * (hi - lo)) * 1000 * (bloom ? BLOOM_REGROW : 1);
    s.dmg = 0;
    const struck = [...s.contrib.keys()];
    s.contrib = new Map();
    s.weak = rollWeakSpot(node.face);
    this.host.toMap("glimmering_caverns", "caveShatter", { node: node.id, kind: node.kind, crew } satisfies CaveShatter);
    for (const id of crew) {
      const kit = this.host.profile(id);
      const who = this.host.player(id);
      if (!kit || !who || !who.connected) continue;
      const raw = rollYield(node.kind, kit.pickaxeId, Math.random, geodeFind(kit.worn));
      // (the Deep Core Drill's perfect breaking strike: its own share twice over)
      const double = id === breaker && perfect && PICKAXES[kit.pickaxeId].shatterDouble;
      // (their run of Perfects: a bigger share)
      const streak = this.streak(id, now).n;
      const share = mult * (double ? 2 : 1) * streakBonus(streak);
      const items: Partial<Record<OreItemId, number>> = {};
      let lost = 0;
      for (const [item, n] of Object.entries(raw) as [OreItemId, number][]) {
        const want = scaleCount(n, share);
        const got = satchelAdd(kit, item, want, this.strap(kit));
        if (got > 0) items[item] = got;
        lost += want - got;
      }
      // a silver seam's stone dust: into the materials' store
      const dust = addMaterial(kit, "stoneDust", scaleCount(rollDust(node.kind), mult * (double ? 2 : 1)));
      kit.mined[node.kind] = Math.min(999_999, (kit.mined[node.kind] ?? 0) + 1);
      // now and then a fossil turns up in the rubble (one you haven't found)
      const missing = FOSSILS.filter((f) => !kit.codex.includes(f));
      if (missing.length && Math.random() < FOSSIL_CHANCE) this.addCodex(id, missing[Math.floor(Math.random() * missing.length)]);
      this.host.saveProfile(id);
      this.host.sendTo(id, "caveLoot", { node: node.id, items, ...(dust > 0 ? { dust } : {}), lost, mult, perfect: double, ...(streak > 0 ? { streak } : {}) } satisfies CaveLoot);
    }
    // the ones whose blows fell short of a share: a word
    for (const id of struck) if (!crew.includes(id)) this.host.sendTo(id, "campfireNotice", { message: "Your blows helped, but a share takes more than 15% of the damage", emoji: "🪨" });
    // everyone at it steps back (the rock is gone)
    for (const [id, p] of [...this.prospectors.entries()]) if (p.node === node.id) this.stopProspect(id);
    if (ORE_KINDS[node.kind].crew && this.event?.kind === "rockfall") {
      // the Rockfall's heap broken: the wonder ends (and a word to everyone down here)
      this.host.toMap("glimmering_caverns", "campfireNotice", { message: `The Rockfall's heap is broken${crew.length > 1 ? ` by a crew of ${crew.length}` : ""}! The breakdown settles again`, emoji: "🪨" });
      this.endEvent();
    }
    if (node.kind === "monolith") {
      const names = crew.map((id) => this.host.player(id)?.username ?? "").filter(Boolean);
      this.host.shout("campfireNotice", { message: `The Titan Monolith shattered under ${names.length ? names.slice(0, 4).join(", ") : "a lone pickaxe"}${names.length > 4 ? ` and ${names.length - 4} more` : ""}! It sinks back into the islet for now`, emoji: "🗿" });
    }
  }

  // --- the Thermal Bellows Forge ----------------------------------------------------------------------

  forge(sessionId: string, packet: ForgePacket) {
    const player = this.host.player(sessionId);
    const kit = this.host.profile(sessionId);
    if (!player || !kit || !packet || typeof packet !== "object" || player.map !== "glimmering_caverns") return;
    if (packet.op === "all") return this.smeltAll(sessionId, kit);
    if (packet.op === "cancel") return this.abandonForge(sessionId, kit, "The bellows go quiet: your ore and coal are back in your satchel");
    if (packet.op === "finish") return this.finishForge(sessionId, kit, packet);
    if (!this.atForge(player)) return this.reply(sessionId, false, "Walk over to the forge");
    if (packet.op === "collect") {
      let n = 0;
      for (const [id, have] of Object.entries(kit.forgeTray) as [OreItemId, number][]) {
        const got = satchelAdd(kit, id, have, this.strap(kit));
        n += got;
        if (have - got > 0) kit.forgeTray[id] = have - got;
        else delete kit.forgeTray[id];
      }
      return this.reply(sessionId, n > 0, n > 0 ? `${n} ingot${n > 1 ? "s" : ""} off the forge's tray, into your satchel` : "No room in your satchel for the tray's ingots");
    }
    if (packet.op === "relic") return this.forgeRelic(sessionId, kit, packet.relic);
    if (packet.op === "start") return this.startForge(sessionId, kit, packet.ingot, packet.batch);
    if (packet.op !== "smelt" || !isIngotId(packet.ingot)) return;
    const queued = kit.forgeQueue.reduce((a, j) => a + j.n, 0);
    const n = Math.min(Math.max(1, Math.floor(Number(packet.n) || 1)), smeltable(satchelCounts(kit), packet.ingot), FORGE_QUEUE_MAX - queued);
    if (n <= 0) return this.reply(sessionId, false, queued >= FORGE_QUEUE_MAX ? "The forge is full up: let it catch up" : `Not enough for a ${ORE_ITEMS[packet.ingot].name} (${this.recipeText(packet.ingot)})`);
    this.queue(kit, packet.ingot, n);
    this.host.emote(sessionId, "🔥");
    this.reply(sessionId, true, `${n} ${ORE_ITEMS[packet.ingot].name}${n > 1 ? "s" : ""} into the forge: one every ${FORGE_SMELT_S} s`);
  }

  private recipeText(id: IngotId) {
    return (Object.entries(FORGE_RECIPES[id]) as [OreItemId, number][]).map(([k, n]) => `${n} ${ORE_ITEMS[k].name}`).join(" + ");
  }

  /** Materials out of the satchel, `n` ingots into the queue. */
  private queue(kit: FishingProfile, ingot: IngotId, n: number) {
    for (const [id, k] of Object.entries(FORGE_RECIPES[ingot]) as [OreItemId, number][]) satchelTake(kit, id, k * n);
    const last = kit.forgeQueue[kit.forgeQueue.length - 1];
    if (last && last.i === ingot) last.n += n;
    else kit.forgeQueue.push({ i: ingot, n });
    if (!kit.forgeAt) kit.forgeAt = Date.now() + FORGE_SMELT_S * 1000;
  }

  /** Quick Smelt All (anywhere in the caverns): every recipe the satchel makes, the best margin
   *  first, as far as the queue's room goes (plain ingots on the forge's clock). */
  private smeltAll(sessionId: string, kit: FishingProfile) {
    const made: string[] = [];
    let room = FORGE_QUEUE_MAX - kit.forgeQueue.reduce((a, j) => a + j.n, 0);
    for (const ingot of QUICK_SMELT_ORDER) {
      const n = Math.min(room, smeltable(satchelCounts(kit), ingot));
      if (n <= 0) continue;
      this.queue(kit, ingot, n);
      room -= n;
      made.push(`${n} ${ORE_ITEMS[ingot].name}${n > 1 ? "s" : ""}`);
    }
    if (!made.length) return this.reply(sessionId, false, room <= 0 ? "The forge is full up: let it catch up" : "Nothing to smelt: an ingot takes 3 Raw Copper + 1 Coal, 3 Raw Iron + 2 Coal, or 2 Raw Silver + 2 Coal");
    this.host.emote(sessionId, "🔥");
    this.reply(sessionId, true, `Into the forge: ${made.join(", ")}`);
  }

  /** A batch by hand at the bellows: its makings out of the satchel now, a seed for its band. */
  private startForge(sessionId: string, kit: FishingProfile, ingot: unknown, batch: unknown) {
    if (!isIngotId(ingot) || !isForgeBatch(batch)) return;
    if (this.forgeGames.has(sessionId)) this.abandonForge(sessionId, kit, "");
    if (smeltable(satchelCounts(kit), ingot) < batch) return this.reply(sessionId, false, `A batch of ${batch} ${ORE_ITEMS[ingot].name}${batch > 1 ? "s" : ""} takes ${batch} x (${this.recipeText(ingot)})`);
    for (const [id, k] of Object.entries(FORGE_RECIPES[ingot]) as [OreItemId, number][]) satchelTake(kit, id, k * batch);
    const seed = Math.floor(Math.random() * 1_000_000);
    this.forgeGames.set(sessionId, { ingot, batch, seed, at: Date.now() });
    this.working(sessionId, "forge", true);
    this.host.saveProfile(sessionId);
    this.host.emote(sessionId, "🔥");
    this.host.sendTo(sessionId, "forgeGame", { ingot, batch, seed } satisfies ForgeGame);
  }

  /** The game's log replayed: Masterwork ingots for a clean one, plain ingots otherwise, into the
   *  satchel (or onto the forge's tray). */
  private finishForge(sessionId: string, kit: FishingProfile, packet: Extract<ForgePacket, { op: "finish" }>) {
    const game = this.forgeGames.get(sessionId);
    if (!game) return;
    this.forgeGames.delete(sessionId);
    this.working(sessionId, "forge", false);
    const secs = (a: unknown) => (Array.isArray(a) ? a.slice(0, 2000).map((v) => Number(v) / 1000) : []);
    const elapsed = (Date.now() - game.at) / 1000;
    const j = judgeForge(game.batch, game.seed, secs(packet.pumps), secs(packet.strikes), elapsed);
    const masterwork = j.valid && j.masterwork;
    const item: OreItemId = masterwork ? MASTERWORK_OF[game.ingot] : game.ingot;
    const got = satchelAdd(kit, item, game.batch, this.strap(kit));
    const tray = game.batch - got;
    if (tray > 0) kit.forgeTray[item] = Math.min(999, (kit.forgeTray[item] ?? 0) + tray);
    // (a Fine batch, the heat held: its coal back, whatever the satchel's room: the soft clamp)
    const grade = j.valid ? forgeGrade(j) : "plain";
    let coal = 0;
    if (grade === "fine") {
      coal = (FORGE_RECIPES[game.ingot].coal ?? 0) * game.batch;
      const s = kit.satchelContents.find((x) => x.id === "coal");
      if (s) s.n += coal;
      else if (coal > 0) kit.satchelContents.push({ id: "coal", n: coal });
    }
    this.host.emote(sessionId, masterwork ? "✨" : "🔥");
    this.host.saveProfile(sessionId);
    this.host.sendTo(sessionId, "forgeResult", { ingot: game.ingot, n: game.batch, masterwork, held: j.held, beats: j.beats, tray, grade, ...(coal > 0 ? { coal } : {}) } satisfies ForgeResult);
  }

  /** A bellows game given up (the panel closed, a trip, a drop): its makings back into the satchel. */
  private abandonForge(sessionId: string, kit: FishingProfile, word: string) {
    const game = this.forgeGames.get(sessionId);
    if (!game) return;
    this.forgeGames.delete(sessionId);
    this.working(sessionId, "forge", false);
    for (const [id, k] of Object.entries(FORGE_RECIPES[game.ingot]) as [OreItemId, number][]) {
      // (the soft clamp never loses them: back in even over the satchel's room)
      const n = k * game.batch;
      const s = kit.satchelContents.find((x) => x.id === id);
      if (s) s.n += n;
      else kit.satchelContents.push({ id, n });
    }
    this.host.saveProfile(sessionId);
    if (word) this.host.sendTo(sessionId, "campfireNotice", { message: word, emoji: "🔥" });
  }

  /** A mining relic forged (once each): its makings out of the satchel and the materials' store, and
   *  on it goes. */
  private forgeRelic(sessionId: string, kit: FishingProfile, relic: unknown) {
    if (!isMiningRelicId(relic)) return;
    const g = GEAR[relic];
    if (kit.gear.includes(relic)) return this.reply(sessionId, false, `You've forged your ${g.name} already: wear it from the satchel drawer's gear tab`);
    const need = FORGE_RELICS[relic];
    const missing: string[] = [];
    for (const [id, n] of Object.entries(need.ore) as [OreItemId, number][]) if (satchelCountFor(kit, id) < n) missing.push(`${n - satchelCountFor(kit, id)} ${ORE_ITEMS[id].name}`);
    if (materialCount(kit, "stoneDust") < need.dust) missing.push(`${need.dust - materialCount(kit, "stoneDust")} Fine Stone Dust`);
    if (missing.length) return this.reply(sessionId, false, `The ${g.name} takes ${missing.join(", ")} more`);
    for (const [id, n] of Object.entries(need.ore) as [OreItemId, number][]) satchelTakeFor(kit, id, n);
    takeMaterial(kit, "stoneDust", need.dust);
    kit.gear.push(relic);
    kit.worn = wearGear(kit.worn, relic).worn;
    this.host.gesture(sessionId, "mine");
    this.host.emote(sessionId, g.emoji);
    this.reply(sessionId, true, `${g.emoji} Your ${g.name}, fresh off the anvil, and on it goes! ${g.blurb}`);
  }

  /** The forge's clocks: each queued ingot done in turn, into the satchel (or the tray when it is full);
   *  a player back after a while catches up at once. A bellows game left far too long is given up. */
  private tickForge(now: number) {
    for (const sessionId of this.host.sessions()) {
      const kit = this.host.profile(sessionId);
      const game = this.forgeGames.get(sessionId);
      if (kit && game && now - game.at > FORGE_GAME_ABANDON_S * 1000) this.abandonForge(sessionId, kit, "The forge cooled while you were away: your ore and coal are back in your satchel");
      if (!kit || !kit.forgeQueue.length || !kit.forgeAt || now < kit.forgeAt) continue;
      const done: Partial<Record<IngotId, number>> = {};
      let tray = 0;
      let guard = 0;
      while (kit.forgeQueue.length && kit.forgeAt && now >= kit.forgeAt && guard++ < 1000) {
        const job = kit.forgeQueue[0];
        if (satchelAdd(kit, job.i, 1, this.strap(kit)) < 1) {
          kit.forgeTray[job.i] = Math.min(999, (kit.forgeTray[job.i] ?? 0) + 1);
          tray++;
        }
        done[job.i] = (done[job.i] ?? 0) + 1;
        job.n -= 1;
        if (job.n <= 0) kit.forgeQueue.shift();
        kit.forgeAt = kit.forgeQueue.length ? kit.forgeAt + FORGE_SMELT_S * 1000 : 0;
      }
      this.host.saveProfile(sessionId);
      this.host.sendTo(sessionId, "caveForge", { done, tray, left: kit.forgeQueue.reduce((a, j) => a + j.n, 0) });
    }
  }

  // --- the Precision Geode Chisel ---------------------------------------------------------------------

  geode(sessionId: string, packet: GeodePacket) {
    const player = this.host.player(sessionId);
    const kit = this.host.profile(sessionId);
    if (!player || !kit || !packet || typeof packet !== "object") return;
    if (packet.op === "cancel") {
      this.chisels.delete(sessionId);
      this.chiselRest.delete(sessionId);
      this.working(sessionId, "chisel", false);
      return;
    }
    if (player.map !== "glimmering_caverns" || !this.atAnvil(player)) return this.reply(sessionId, false, "Walk over to the meteorite anvil");
    const now = Date.now();
    if (packet.op === "start") {
      if (!isGeodeId(packet.geode)) return;
      if (satchelCount(kit, packet.geode) <= 0) return this.reply(sessionId, false, `No ${ORE_ITEMS[packet.geode].name} in your satchel`);
      const seam = rollSeam();
      this.chisels.set(sessionId, { geode: packet.geode, seam, gaugeAt: 0, lastAt: 0 });
      this.chiselRest.delete(sessionId);
      this.working(sessionId, "chisel", true);
      this.host.sendTo(sessionId, "geodeStart", { geode: packet.geode, seam } satisfies GeodeStart);
      return;
    }
    if (packet.op === "quick") {
      // one blow, no game: a rough cleave, never dust
      if (!isGeodeId(packet.geode) || now - (this.quickAt.get(sessionId) ?? 0) < QUICK_CRACK_GAP_MS) return;
      if (satchelCount(kit, packet.geode) <= 0) return this.reply(sessionId, false, `No ${ORE_ITEMS[packet.geode].name} in your satchel`);
      this.quickAt.set(sessionId, now);
      this.chisels.delete(sessionId);
      this.working(sessionId, "chisel", true);
      this.host.gesture(sessionId, "reach");
      this.cleave(sessionId, kit, packet.geode, "rough", 0, now, true);
      return;
    }
    const c = this.chisels.get(sessionId);
    if (!c) return;
    if (packet.op === "aim") {
      const v = packet.view;
      if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => Number.isFinite(Number(n)))) return;
      const ok = seamFaces(c.seam, v.map(Number) as Vec3);
      if (ok && !c.gaugeAt) c.gaugeAt = now;
      this.host.sendTo(sessionId, "geodeAim", { ok } satisfies GeodeAim);
      return;
    }
    if (packet.op !== "release" || !c.gaugeAt) return;
    if (now - c.lastAt < STRIKE_DEBOUNCE_S * 1000) return;
    c.lastAt = now;
    // the release, at the time the client measured on the gauge (near enough the server's own)
    const seen = now - c.gaugeAt;
    const t = Number(packet.t);
    const at = Number.isFinite(t) && t >= 0 && Math.abs(t - seen) <= CHISEL_CLOCK_SLACK_MS ? t : seen;
    const v = chiselGauge(c.geode, at / 1000);
    const verdict = judgeChisel(v);
    this.host.gesture(sessionId, "reach");
    if (verdict === "bounce") {
      this.host.sendTo(sessionId, "geodeResult", { verdict, v: Math.round(v * 100) / 100, geode: c.geode } satisfies GeodeResult);
      return;
    }
    this.chisels.delete(sessionId);
    this.cleave(sessionId, kit, c.geode, verdict, v, now, false);
  }

  /** A geode cleaved (taken from the satchel): its gem in (put back whole if there's no room for
   *  it), or its core crumbled into stone dust. The avatar stays at the anvil while the blow lands. */
  private cleave(sessionId: string, kit: FishingProfile, geode: GeodeId, verdict: "rough" | "perfect" | "pulverize", v: number, now: number, quick: boolean) {
    this.chiselRest.set(sessionId, now + CHISEL_REST_MS);
    const base = { verdict, v: Math.round(v * 100) / 100, geode, quick: quick || undefined };
    if (satchelTake(kit, geode, 1) < 1) return this.reply(sessionId, false, `Your ${ORE_ITEMS[geode].name} is gone from the satchel`);
    if (verdict === "pulverize") {
      const [lo, hi] = PULVERIZED_DUST;
      const dust = addMaterial(kit, "stoneDust", lo + Math.floor(Math.random() * (hi - lo + 1)));
      this.host.emote(sessionId, "🌫️");
      this.host.saveProfile(sessionId);
      this.host.sendTo(sessionId, "geodeResult", { ...base, dust } satisfies GeodeResult);
      return;
    }
    const gem = rollGem(geode, verdict === "perfect");
    if (satchelAdd(kit, gem, 1, this.strap(kit)) < 1) {
      satchelAdd(kit, geode, 1, this.strap(kit)) || kit.satchelContents.push({ id: geode, n: 1 });
      return this.reply(sessionId, false, "No room in your satchel for what's inside: make some room first");
    }
    this.host.emote(sessionId, ORE_ITEMS[gem].emoji);
    this.host.saveProfile(sessionId);
    this.host.sendTo(sessionId, "geodeResult", { ...base, gem } satisfies GeodeResult);
  }

  // --- the Travertine Thermal Terraces -----------------------------------------------------------------

  /** Into a warm pool (the nearest free seat by its landing) or out of it (onto its dry landing).
   *  (The channel keeps its name: caverns:onsen_toggle.) */
  onsen(sessionId: string, packet: OnsenPacket) {
    const player = this.host.player(sessionId);
    if (!player || player.map !== "glimmering_caverns" || !packet || typeof packet !== "object") return;
    const seat = this.host.seatOf(sessionId);
    if (packet.breath !== undefined) return this.breathe(sessionId, Number(packet.breath));
    if (!packet.on) {
      if (THERMAL_SEAT_IDS.has(seat)) this.host.standUp(sessionId);
      return;
    }
    if (player.sitting || player.action !== "") return;
    let best: (typeof THERMAL_SEATS)[number] | null = null;
    let bestD = Infinity;
    for (const s of THERMAL_SEATS) {
      if (this.host.occupant(s.propId)) continue;
      const d = Math.min(Math.hypot(player.x - s.exit.x, player.z - s.exit.z), Math.hypot(player.x - s.x, player.z - s.z));
      if (d <= THERMAL_REACH && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (!best) {
      this.host.sendTo(sessionId, "campfireNotice", { message: "Every seat in the warm pools is taken, or out of reach: step up to a pool's edge", emoji: "♨️" });
      return;
    }
    this.host.seat(sessionId, best.propId);
  }

  /** Who soaks (sitting in a thermal seat, down here): SOAK_S of it brings the Deep Warmth. */
  private tickOnsen(dt: number, now: number) {
    for (const sessionId of this.host.sessions()) {
      const player = this.host.player(sessionId);
      const inWater = !!player && player.map === "glimmering_caverns" && player.sitting && THERMAL_SEAT_IDS.has(this.host.seatOf(sessionId));
      if (!inWater) {
        this.breaths.delete(sessionId);
        if (this.soakers.delete(sessionId) && player && player.action === "soak") {
          player.action = "";
          player.actionProgress = 0;
        }
        continue;
      }
      const before = this.soakers.get(sessionId) ?? 0;
      const soaked = before + dt;
      this.soakers.set(sessionId, soaked);
      if (player.action === "" || player.action === "soak") {
        player.action = "soak";
        const p = Math.min(1, Math.floor((soaked / SOAK_S) * 20) / 20);
        if (p !== player.actionProgress) player.actionProgress = p;
      }
      if (before < DAILY_SOAK_S && soaked >= DAILY_SOAK_S) this.host.daily(sessionId, "soak_onsen");
      if (before < SOAK_S && soaked >= SOAK_S) {
        const kit = this.host.profile(sessionId);
        if (!kit) continue;
        // (a second soak refreshes the Deep Warmth's clock: it never stacks; the deep breaths taken
        // on the way add theirs)
        kit.deepWarmthUntil = now + DEEP_WARMTH_MS + (this.breaths.get(sessionId)?.n ?? 0) * BREATH_BONUS_MS;
        this.host.saveProfile(sessionId);
        this.host.emote(sessionId, "♨️");
        this.host.sendTo(sessionId, "campfireNotice", { message: `Deep Warmth for ${DEEP_WARMTH_MS / 60_000} minutes: +15% walking pace everywhere, +20% fracture radius, and your stamina back 25% sooner in the ring`, emoji: "♨️" });
      }
    }
  }

  /** A breath in the warm water: at the ring's fullest, a deep one (a minute more of the Deep Warmth,
   *  BREATH_MAX a soak; before the soak is through, kept for when it is). */
  private breathe(sessionId: string, t: number) {
    const soaked = this.soakers.get(sessionId);
    const kit = this.host.profile(sessionId);
    if (soaked === undefined || !kit) return;
    const seen = soaked * 1000;
    const at = Number.isFinite(t) && t >= 0 && Math.abs(t - seen) <= BREATH_CLOCK_SLACK_MS ? t : seen;
    const { k, top } = breathAt(at / 1000);
    const run = this.breaths.get(sessionId) ?? { n: 0, k: -1 };
    this.breaths.set(sessionId, run);
    if (k === run.k) return;
    run.k = k;
    const deep = top && run.n < BREATH_MAX;
    if (deep) {
      run.n++;
      if (soaked >= SOAK_S && warmthOn(kit.deepWarmthUntil)) {
        kit.deepWarmthUntil += BREATH_BONUS_MS;
        this.host.saveProfile(sessionId);
      }
    }
    this.host.sendTo(sessionId, "soakBreath", { deep, n: run.n, until: soaked >= SOAK_S ? kit.deepWarmthUntil : 0 } satisfies SoakBreath);
  }

  // --- Gus the Mole's shop, and the satchel's quick actions ------------------------------------------

  gus(sessionId: string, packet: GusPacket) {
    const player = this.host.player(sessionId);
    const kit = this.host.profile(sessionId);
    if (!player || !kit || !packet || typeof packet !== "object") return;
    if (packet.op === "equipPickaxe") {
      if (!isPickaxeId(packet.pickaxe) || !kit.pickaxes.includes(packet.pickaxe)) return;
      kit.pickaxeId = packet.pickaxe;
      return this.reply(sessionId, true, `${PICKAXES[packet.pickaxe].emoji} ${PICKAXES[packet.pickaxe].name} in hand`);
    }
    if (!this.atGus(player)) return this.reply(sessionId, false, "Come over to the outpost, friend!");
    switch (packet.op) {
      case "sell": {
        if (!isOreItemId(packet.item)) return;
        const have = satchelCount(kit, packet.item);
        const n = packet.n === "all" ? have : Math.min(have, Math.max(1, Math.floor(Number(packet.n) || 1)));
        if (n <= 0) return this.reply(sessionId, false, `No ${ORE_ITEMS[packet.item].name} to sell`);
        return this.sellItems(sessionId, kit, [[packet.item, n]], `${n} ${ORE_ITEMS[packet.item].name}`);
      }
      case "sellCat": {
        const ids = itemsOf(packet.cat as OreCategory);
        const lots = ids.map((id) => [id, satchelCount(kit, id)] as [OreItemId, number]).filter(([, n]) => n > 0);
        if (!lots.length) return this.reply(sessionId, false, "Nothing of that sort to sell");
        return this.sellItems(sessionId, kit, lots, `${lots.reduce((a, [, n]) => a + n, 0)} pieces`);
      }
      case "sellDust": {
        const n = materialCount(kit, "stoneDust");
        if (n <= 0) return this.reply(sessionId, false, "No stone dust to sell: a silver seam leaves some");
        takeMaterial(kit, "stoneDust", n);
        const coins = n * BYPRODUCT_PRICES.stoneDust;
        this.host.addCoins(sessionId, coins);
        this.host.emote(sessionId, "🪙");
        return this.reply(sessionId, true, `${n} Fine Stone Dust? The masons will love it. Here's ${coins} 🪙`, coins);
      }
      case "buyPickaxe": {
        if (!isPickaxeId(packet.pickaxe)) return;
        const p = PICKAXES[packet.pickaxe];
        if (kit.pickaxes.includes(packet.pickaxe)) return this.reply(sessionId, false, `You've already got the ${p.name}`);
        if (p.price <= 0) return this.reply(sessionId, false, `The ${p.name} comes from Old Flint`);
        if (player.coins < p.price) return this.reply(sessionId, false, `The ${p.name} is ${p.price.toLocaleString("en-US")} 🪙`);
        this.host.addCoins(sessionId, -p.price);
        kit.pickaxes.push(packet.pickaxe);
        kit.pickaxeId = packet.pickaxe;
        this.host.emote(sessionId, p.emoji);
        return this.reply(sessionId, true, `The ${p.name}, fresh off my workstation. Mind the stalactites!`, -p.price);
      }
      case "upgradeSatchel": {
        const next = nextSatchelTier(kit.satchelTier);
        if (!next) return this.reply(sessionId, false, "That's the finest vault under the earth!");
        if (player.coins < next.price) return this.reply(sessionId, false, `The ${next.name} is ${next.price.toLocaleString("en-US")} 🪙`);
        const missing = this.missingFor(kit, next.needs);
        if (missing.length) return this.reply(sessionId, false, `The ${next.name} takes ${missing.join(", ")} more`);
        // the makings out of the satchel (a Masterwork ingot standing in for a plain one), the
        // materials' store and the carrier
        for (const [id, n] of Object.entries(next.needs.ore ?? {}) as [OreItemId, number][]) satchelTakeFor(kit, id, n);
        takeMaterial(kit, "sawdust", next.needs.sawdust ?? 0);
        takeMaterial(kit, "resin", next.needs.resin ?? 0);
        for (const [k, n] of Object.entries(next.needs.byproducts ?? {}) as [ByproductId, number][]) takeMaterial(kit, k, n);
        for (const [k, n] of Object.entries(next.needs.wood ?? {}) as [WoodKind, number][]) takeLogs(kit, k, n);
        this.host.addCoins(sessionId, -next.price);
        kit.satchelTier = next.tier;
        kit.satchelSlots = next.slots;
        this.host.emote(sessionId, next.icon);
        return this.reply(sessionId, true, `${next.icon} The ${next.name}: ${next.slots} slots!`, -next.price);
      }
    }
  }

  /** What a satchel tier's makings still lack, in words ([] : nothing). */
  private missingFor(kit: FishingProfile, needs: SatchelTier["needs"]): string[] {
    const out: string[] = [];
    for (const [id, n] of Object.entries(needs.ore ?? {}) as [OreItemId, number][]) if (satchelCountFor(kit, id) < n) out.push(`${n - satchelCountFor(kit, id)} ${ORE_ITEMS[id].name}`);
    if ((needs.sawdust ?? 0) > kit.sawdust) out.push(`${(needs.sawdust ?? 0) - kit.sawdust} Sawdust`);
    if ((needs.resin ?? 0) > kit.resin) out.push(`${(needs.resin ?? 0) - kit.resin} Pine Resin`);
    for (const [k, n] of Object.entries(needs.byproducts ?? {}) as [ByproductId, number][]) if ((kit.byproducts[k] ?? 0) < n) out.push(`${n - (kit.byproducts[k] ?? 0)} ${BYPRODUCTS[k].name}`);
    for (const [k, n] of Object.entries(needs.wood ?? {}) as [WoodKind, number][]) if ((kit.wood[k] ?? 0) < n) out.push(`${n - (kit.wood[k] ?? 0)} ${WOOD[k].name}`);
    return out;
  }

  /** Lots sold to Gus, one at a time at the hour's price (past the hour's 30th of a kind, each
   *  deepens its supply depression). */
  private sellItems(sessionId: string, kit: FishingProfile, lots: [OreItemId, number][], what: string) {
    const goods = lots.flatMap(([id, n]) => Array.from({ length: n }, () => id));
    const run = priceRun(goods, oreGood, (id, mult) => Math.max(1, Math.round(ORE_ITEMS[id].price * mult)), this.host.market());
    this.host.setMarket(run.after);
    for (const [id, n] of lots) satchelTake(kit, id, n);
    this.host.addCoins(sessionId, run.total);
    this.host.emote(sessionId, run.total >= 100 ? "💰" : "🪙");
    this.reply(sessionId, true, `${what}? A fine haul! Here's ${run.total.toLocaleString("en-US")} 🪙`, run.total);
  }

  /** The satchel drawer's quick actions, anywhere in the caverns: Quick Smelt All goes to the forge,
   *  Sell All Cut Gems to Gus. */
  satchel(sessionId: string, packet: SatchelPacket) {
    const player = this.host.player(sessionId);
    const kit = this.host.profile(sessionId);
    if (!player || !kit || !packet || typeof packet !== "object") return;
    if (player.map !== "glimmering_caverns") return this.reply(sessionId, false, "The forge and Gus are down in the Glimmering Caverns");
    if (packet.op === "smeltAll") return this.smeltAll(sessionId, kit);
    if (packet.op === "sellGems") {
      const lots = itemsOf("gem").map((id) => [id, satchelCount(kit, id)] as [OreItemId, number]).filter(([, n]) => n > 0);
      if (!lots.length) return this.reply(sessionId, false, "No cut gems yet: cleave a geode at the anvil");
      return this.sellItems(sessionId, kit, lots, `${lots.reduce((a, [, n]) => a + n, 0)} cut gem${lots.reduce((a, [, n]) => a + n, 0) > 1 ? "s" : ""}`);
    }
  }

  // --- the lucky drip -----------------------------------------------------------------------------

  /** Whether the lucky drip's ripple is on a float at (x, z) now (`grace`: seconds after it fades it
   *  still counts, the Cenote Glow Lure's). */
  dripOn(x: number, z: number, now = Date.now(), grace = 0): boolean {
    const d = this.drip;
    if (!d || now > d.until + grace * 1000) return false;
    return Math.hypot(x - d.x, z - d.z) <= DRIP_REACH;
  }
  /** The Glow Lure's grace, for the room's drip checks. */
  static readonly LURE_GRACE_S = GLOW_LURE_GRACE_S;

  // --- the clocks ------------------------------------------------------------------------------------

  /** Every tick: the nodes growing back (the Monolith surfacing is told to everyone), idle prospectors
   *  letting go, the forges, the warm pools, the drip. */
  tick(dt: number, now: number, occupied: boolean) {
    let changed = false;
    for (const node of ORE_NODES) {
      const s = this.nodes.get(node.id)!;
      if (s.up || now < s.respawnAt || ORE_KINDS[node.kind].crew) continue;
      s.up = true;
      s.dmg = 0;
      s.respawnAt = 0;
      s.weak = rollWeakSpot(node.face);
      changed = true;
      if (node.kind === "monolith") this.host.shout("campfireNotice", { message: "The Titan Monolith has surfaced on the Great Lake's islet in the Glimmering Caverns! Bring a T4 pickaxe or better and break it together", emoji: "🗿" });
    }
    for (const [id, p] of [...this.prospectors.entries()]) {
      const player = this.host.player(id);
      if (!player || player.map !== "glimmering_caverns" || player.action !== "mine" || (p.lastStrikeAt && now - p.lastStrikeAt > PROSPECT_IDLE_S * 1000)) this.stopProspect(id);
    }
    this.forgeClock += dt;
    if (this.forgeClock >= 0.5) {
      this.forgeClock = 0;
      this.tickForge(now);
    }
    this.tickOnsen(dt, now);
    for (const [id, until] of [...this.chiselRest.entries()]) {
      if (now < until) continue;
      this.chiselRest.delete(id);
      if (!this.chisels.has(id)) this.working(id, "chisel", false);
    }
    for (const [id, until] of [...this.riders.entries()]) {
      if (now < until) continue;
      this.riders.delete(id);
      const player = this.host.player(id);
      if (player && player.action === "winch") player.action = "";
    }
    if (occupied && now >= this.nextDripAt) {
      this.nextDripAt = now + DRIP_EVERY_S * 1000;
      // (by one of the floats out on the water, if anyone is fishing: a drop a little off it)
      const floats = this.host.shoreFloats();
      if (floats.length) {
        const f = floats[Math.floor(Math.random() * floats.length)];
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.35;
        this.drip = { spot: "shore", x: Math.round((f.x + Math.cos(a) * r) * 100) / 100, z: Math.round((f.z + Math.sin(a) * r) * 100) / 100, until: now + DRIP_S * 1000 };
        this.host.toMap("glimmering_caverns", "caveDrip", this.drip);
      }
    }
    if (changed) this.sync();
    this.eventClock += dt;
    if (this.eventClock >= 1) {
      this.eventClock = 0;
      this.tickEvent(now, occupied);
    }
  }

  // --- the living wonders (shared/caverns_codex.ts) ----------------------------------------------------

  /** Every so often while anyone is down here, a wonder: a Cave Cloud, a Glimmer Bloom or a Rockfall
   *  (never the same twice running); everyone down here while it lasts has it in their codex. */
  private tickEvent(now: number, occupied: boolean) {
    const ev = this.event;
    if (ev && now >= ev.until) {
      if (ev.kind === "rockfall") this.host.toMap("glimmering_caverns", "campfireNotice", { message: "The Rockfall's dust has settled: its heap has sunk back into the breakdown's rubble", emoji: "🪨" });
      this.endEvent();
      return;
    }
    if (ev) {
      for (const id of this.host.sessions()) if (this.host.player(id)?.map === "glimmering_caverns") this.addCodex(id, `wonder_${ev.kind}`);
      return;
    }
    if (!occupied || now < this.nextEventAt) return;
    const kinds = (["cloud", "bloom", "rockfall"] as CaveEventKind[]).filter((k) => k !== this.lastEvent);
    this.startEvent(kinds[Math.floor(Math.random() * kinds.length)], now);
  }
  private lastEvent: CaveEventKind | "" = "";

  startEvent(kind: CaveEventKind, now = Date.now()) {
    if (this.event) this.endEvent();
    this.event = { kind, at: now, until: now + (kind === "rockfall" ? ROCKFALL_S : CAVE_EVENT_S) * 1000 };
    this.lastEvent = kind;
    if (kind === "rockfall") {
      for (const node of ORE_NODES) {
        if (!ORE_KINDS[node.kind].crew) continue;
        this.nodes.set(node.id, { dmg: 0, up: true, respawnAt: 0, weak: rollWeakSpot(node.face), contrib: new Map() });
      }
      this.sync();
    }
    this.host.syncCaveEvent(JSON.stringify(this.event));
    const info = CAVE_EVENT_INFO[kind];
    this.host.toMap("glimmering_caverns", "campfireNotice", { message: info.toast, emoji: info.emoji });
  }

  private endEvent() {
    const ev = this.event;
    this.event = null;
    this.nextEventAt = Date.now() + (CAVE_EVENT_EVERY_MIN[0] + Math.random() * (CAVE_EVENT_EVERY_MIN[1] - CAVE_EVENT_EVERY_MIN[0])) * 60_000;
    if (ev?.kind === "rockfall") {
      for (const node of ORE_NODES) {
        if (!ORE_KINDS[node.kind].crew) continue;
        const s = this.nodes.get(node.id)!;
        s.up = false;
        s.respawnAt = Infinity;
        s.dmg = 0;
        s.contrib = new Map();
        for (const [id, p] of [...this.prospectors.entries()]) if (p.node === node.id) this.stopProspect(id);
      }
      this.sync();
    }
    this.host.syncCaveEvent("");
  }

  /** A Cave Cloud's pull on the cenote's rare fish (0 when there's none). */
  cloudLuck(now = Date.now()): number {
    return caveEventOn(this.event, "cloud", now) ? CLOUD_LUCK : 0;
  }

  // --- the Cave Codex (shared/caverns_codex.ts) -----------------------------------------------------------

  /** A codex entry found: its coins, and a section completed its bonus; told to the finder. */
  addCodex(sessionId: string, id: string) {
    const kit = this.host.profile(sessionId);
    const entry = CODEX_BY_ID.get(id);
    if (!kit || !entry || kit.codex.includes(id)) return;
    kit.codex.push(id);
    let coins = entry.coins;
    const section = CODEX_SECTIONS.find((s) => s.id === entry.section)!;
    const prog = codexProgress(kit.codex, entry.section);
    const complete = prog.found === prog.all;
    if (complete) coins += section.bonus;
    this.host.addCoins(sessionId, coins);
    this.host.saveProfile(sessionId);
    this.host.sendTo(sessionId, "caveCodex", { id, coins, complete: complete ? section.id : undefined, found: kit.codex.length, all: CODEX.length });
  }

  /** A find reported by the finder (a zone walked into, a creature met, the Bat Exodus seen, a pearl, a
   *  page, the photo): checked against where they stand, and the camp's clock for the Exodus. */
  codex(sessionId: string, packet: CodexPacket) {
    const player = this.host.player(sessionId);
    if (!player || player.map !== "glimmering_caverns" || !packet || typeof packet !== "object") return;
    const zone = cavernsZoneAt(player.x, player.z)?.id ?? "";
    switch (packet.op) {
      case "zone":
        if (packet.id === `zone_${zone}`) this.addCodex(sessionId, packet.id);
        return;
      case "fauna": {
        const home = FAUNA_ZONE[packet.id];
        if (!home || home !== zone) return;
        if (packet.id === "fauna_capybara" && Math.hypot(player.x - CAPYBARA.x, player.z - CAPYBARA.z) > 7) return;
        this.addCodex(sessionId, packet.id);
        return;
      }
      case "exodus": {
        // (the camp's dusk: from dayPhase 0.5 for EXODUS_S, a little slack either side)
        const t = (dayPhase(Date.now()) - 0.5) * DAY_CYCLE_MS;
        if (t >= -5000 && t <= EXODUS_S * 1000 + 15000) this.addCodex(sessionId, "wonder_exodus");
        return;
      }
      case "pearl": {
        const p = CAVE_PEARLS.find((q) => q.id === packet.id);
        if (p && Math.hypot(player.x - p.x, player.z - p.z) <= FIND_REACH + 0.6) this.addCodex(sessionId, p.id);
        return;
      }
      case "page": {
        const p = JOURNAL_PAGES.find((q) => q.id === packet.id);
        if (p && Math.hypot(player.x - p.x, player.z - p.z) <= FIND_REACH + 0.6) this.addCodex(sessionId, p.id);
        return;
      }
      case "photo":
        if (Math.hypot(player.x - PHOTO_SPOT.x, player.z - PHOTO_SPOT.z) <= PHOTO_REACH + 0.6) {
          this.addCodex(sessionId, "wonder_photo");
          this.host.emote(sessionId, "📸");
        }
        return;
    }
  }

  /** A miner's run of Perfects (lapsed after STREAK_IDLE_S without a strike). */
  private streak(sessionId: string, now: number): Streak {
    let run = this.streaks.get(sessionId);
    if (!run || now - run.at > STREAK_IDLE_S * 1000) {
      run = { n: 0, at: now };
      this.streaks.set(sessionId, run);
    }
    return run;
  }

  /** At the forge's bellows or cracking a geode at the anvil: the avatar at work, for everyone to see
   *  (its action; never over another one already on). */
  private working(sessionId: string, action: "forge" | "chisel", on: boolean) {
    const player = this.host.player(sessionId);
    if (!player) return;
    if (on) {
      if (player.action === "" || player.action === action) player.action = action;
    } else if (player.action === action) player.action = "";
  }

  /** Off the caverns (a trip, a drop): whatever they were doing down here stops (a bellows game's
   *  makings back into the satchel). */
  leave(sessionId: string) {
    if (this.riders.delete(sessionId)) {
      const rider = this.host.player(sessionId);
      if (rider?.action === "winch") rider.action = "";
    }
    this.stopProspect(sessionId);
    this.streaks.delete(sessionId);
    this.chisels.delete(sessionId);
    this.chiselRest.delete(sessionId);
    this.quickAt.delete(sessionId);
    this.working(sessionId, "chisel", false);
    this.soakers.delete(sessionId);
    this.breaths.delete(sessionId);
    const kit = this.host.profile(sessionId);
    if (kit) this.abandonForge(sessionId, kit, "");
  }

  /** Gone from the room. */
  forget(sessionId: string) {
    this.leave(sessionId);
  }

  /** A reconnecting player's session takes over the old one's. */
  transfer(oldId: string, newId: string) {
    this.nodes.forEach((s) => {
      const d = s.contrib.get(oldId);
      if (d === undefined) return;
      s.contrib.delete(oldId);
      s.contrib.set(newId, (s.contrib.get(newId) ?? 0) + d);
    });
    this.leave(oldId);
  }

  /** The Deep Warmth on this player (a quicker step, a wider fracture, the ring's stamina). */
  warm(sessionId: string, now = Date.now()): boolean {
    const kit = this.host.profile(sessionId);
    return !!kit && warmthOn(kit.deepWarmthUntil, now);
  }

  /** Each node's prop and whether it stands (a broken one takes no click until it grows back). */
  propsUp(): [string, boolean][] {
    return ORE_NODES.map((n) => [orePropId(n.id), this.nodes.get(n.id)?.up ?? false]);
  }
}
