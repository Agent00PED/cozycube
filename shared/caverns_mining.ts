// The Glimmering Caverns' prospecting, as both sides see it: the ores and what Gus pays for them, the
// pickaxes, the nodes' kinds, the strike's judging, the co-op shares, the Thermal Bellows Forge's
// recipes and its minigame (the bellows' heat, the hammer's rhythm: replayed by the server from the
// player's inputs), the Precision Geode Chisel's seam and gauge, and the forge's mining relics. The
// server rolls every weak spot and judges every strike on these tables (server/src/rooms/caverns.ts);
// the client draws the very same numbers.
//
// Tactile prospecting (no dial, no gauge, no prompt): walking up to a node and using it frames the
// rock close up; its weak spot is a point on its surface, told only by the rock itself (glowing stress
// fissures, a mineral's glint, dust sifting down from it). A strike is a tap or a click on the rock,
// judged by how far it lands from the weak spot:
//
//   direct   within the sweet radius: the pickaxe's whole damage, and the fissure runs on (a new weak
//            spot opens elsewhere on the rock)
//   near     within the near radius: half
//   bedrock  anywhere else: 15%, a dull clatter (the Deep Core Drill: half, it never skids)
//
// Mohs hardness: a pickaxe of a HIGHER tier than the ore breaks it in one blow; one a tier below it
// bites at 60%; two tiers or more below, it is deflected (no damage, and 0.5 s to recover). Co-op: a
// node struck by several shares one damage bar; when it breaks, everyone who dealt more than 15% of
// its damage gets the yield, +40% for each other such miner (up to four).

import { ORE_PRICES, PICKAXE_PRICES } from "./economy";

// --- what the caverns give: the satchel's items -----------------------------------------------------

export type OreItemId =
  | "coal"
  | "copper_ore"
  | "iron_ore"
  | "silver_ore"
  | "glimmer_shard"
  | "core_fragment"
  | "copper_ingot"
  | "iron_ingot"
  | "silver_ingot"
  | "copper_ingot_mw"
  | "iron_ingot_mw"
  | "silver_ingot_mw"
  | "mystery_geode"
  | "pristine_geode"
  | "amethyst"
  | "topaz"
  | "opal"
  | "star_shard";
/** The satchel's four drawers: raw ores, smelted ingots, uncracked geodes, cut gems. */
export type OreCategory = "raw" | "ingot" | "geode" | "gem";
export interface OreItem {
  name: string;
  emoji: string;
  cat: OreCategory;
  /** Gus's base price (shared/economy.ts ORE_PRICES), before the hour's market. */
  price: number;
  /** Its colour: the loot chunk that flies to you, the drawer's card. */
  color: string;
  blurb: string;
}
export const ORE_ITEMS: Record<OreItemId, OreItem> = {
  coal: { name: "Coal", emoji: "⚫", cat: "raw", price: ORE_PRICES.coal, color: "#3b3a40", blurb: "Off a coal seam in the Coal Breakdown's fallen blocks: the forge's fuel" },
  copper_ore: { name: "Raw Copper", emoji: "🟠", cat: "raw", price: ORE_PRICES.copper_ore, color: "#d9803f", blurb: "Off a copper vein in the Doline Jungle" },
  iron_ore: { name: "Raw Iron", emoji: "🔩", cat: "raw", price: ORE_PRICES.iron_ore, color: "#8a8f9a", blurb: "Off an iron lode in the Iron Mudflats" },
  silver_ore: { name: "Raw Silver", emoji: "⚪", cat: "raw", price: ORE_PRICES.silver_ore, color: "#dfe6f2", blurb: "Off a silver seam on the Pearl Terraces" },
  glimmer_shard: { name: "Glimmer Shard", emoji: "💠", cat: "raw", price: ORE_PRICES.glimmer_shard, color: "#5ff2ff", blurb: "Off a Glimmerstone cluster in the Glimmer Rift" },
  core_fragment: { name: "Ancient Core Fragment", emoji: "🔮", cat: "raw", price: ORE_PRICES.core_fragment, color: "#b36bff", blurb: "Off the Titan Monolith on the Great Lake's islet: humming, warm to the touch" },
  copper_ingot: { name: "Copper Ingot", emoji: "🟧", cat: "ingot", price: ORE_PRICES.copper_ingot, color: "#e0894a", blurb: "3 Raw Copper and 1 Coal, at the Thermal Bellows Forge" },
  iron_ingot: { name: "Iron Ingot", emoji: "⬛", cat: "ingot", price: ORE_PRICES.iron_ingot, color: "#6d7380", blurb: "3 Raw Iron and 2 Coal, at the Thermal Bellows Forge" },
  silver_ingot: { name: "Silver Ingot", emoji: "⬜", cat: "ingot", price: ORE_PRICES.silver_ingot, color: "#eef3fb", blurb: "2 Raw Silver and 2 Coal, at the Thermal Bellows Forge" },
  copper_ingot_mw: { name: "Masterwork Copper Ingot", emoji: "🟧", cat: "ingot", price: ORE_PRICES.copper_ingot_mw, color: "#ffb070", blurb: "Forged by hand at the bellows and the anvil: +25% at Gus's" },
  iron_ingot_mw: { name: "Masterwork Iron Ingot", emoji: "⬛", cat: "ingot", price: ORE_PRICES.iron_ingot_mw, color: "#9aa3b3", blurb: "Forged by hand at the bellows and the anvil: +25% at Gus's" },
  silver_ingot_mw: { name: "Masterwork Silver Ingot", emoji: "⬜", cat: "ingot", price: ORE_PRICES.silver_ingot_mw, color: "#ffffff", blurb: "Forged by hand at the bellows and the anvil: +25% at Gus's" },
  mystery_geode: { name: "Mystery Geode", emoji: "🪨", cat: "geode", price: ORE_PRICES.mystery_geode, color: "#8c7a6b", blurb: "Cleave it on the meteorite anvil: a gem inside" },
  pristine_geode: { name: "Pristine Geode", emoji: "🥚", cat: "geode", price: ORE_PRICES.pristine_geode, color: "#cfc2ff", blurb: "The Monolith's own: the finer gems are likelier" },
  amethyst: { name: "Amethyst Shard", emoji: "🟣", cat: "gem", price: ORE_PRICES.amethyst, color: "#a764e8", blurb: "Cut from a geode" },
  topaz: { name: "Topaz Pebble", emoji: "🟡", cat: "gem", price: ORE_PRICES.topaz, color: "#f2c24f", blurb: "Cut from a geode" },
  opal: { name: "Iridescent Opal", emoji: "🌈", cat: "gem", price: ORE_PRICES.opal, color: "#9ff2e4", blurb: "Cut from a geode: every colour at once" },
  star_shard: { name: "Star Shard", emoji: "🌟", cat: "gem", price: ORE_PRICES.star_shard, color: "#fff3a6", blurb: "Cut from a geode: a fallen star, they say" },
};
export const ORE_ITEM_IDS = Object.keys(ORE_ITEMS) as OreItemId[];
export function isOreItemId(v: unknown): v is OreItemId {
  return typeof v === "string" && v in ORE_ITEMS;
}
/** Whether an item is a Masterwork ingot (it counts as its plain ingot wherever one is asked for). */
export const isMasterwork = (id: OreItemId) => id.endsWith("_mw");
export const ORE_CATEGORIES: OreCategory[] = ["raw", "ingot", "geode", "gem"];
export const ORE_CATEGORY_LABEL: Record<OreCategory, { emoji: string; name: string }> = {
  raw: { emoji: "⛏️", name: "Raw Ores" },
  ingot: { emoji: "🔥", name: "Smelted Ingots" },
  geode: { emoji: "🪨", name: "Uncracked Geodes" },
  gem: { emoji: "💎", name: "Cut Gems" },
};
/** Every item of a drawer. */
export const itemsOf = (cat: OreCategory): OreItemId[] => ORE_ITEM_IDS.filter((id) => ORE_ITEMS[id].cat === cat);

// --- the pickaxes: Old Flint's Rusted Pickaxe (T1), then Gus's ---------------------------------------

export type PickaxeId = "rusted" | "copper" | "reinforced" | "glimmer" | "drill";
export interface Pickaxe {
  name: string;
  emoji: string;
  tier: number;
  price: number;
  /** A direct strike's damage (a near one half, bedrock 15%). */
  damage: number;
  /** Seconds between strikes (the server's own limit): +15% swing speed from T2 up. */
  swing: number;
  /** The sweet (and near) radius, this much wider (0.15: +15%). */
  sweet: number;
  /** The weak spot hums in your ear as you near it (T3 up). */
  hum: boolean;
  /** How bright the weak spot's glint shows (T4 up: +50%). */
  glint: number;
  /** A Mystery Geode off an iron lode at least this often (T3 up: 25%). */
  geodeFloor: number;
  /** A perfect (direct) breaking strike doubles the node's yield (the Deep Core Drill). */
  shatterDouble: boolean;
  /** A strike off the weak spot never skids: bedrock bites as a near strike does (the drill). */
  noBedrock: boolean;
  blurb: string;
}
/** The base swing and the T2-up swing speed (+15%). */
export const BASE_SWING_S = 0.55;
const FAST_SWING_S = Math.round((BASE_SWING_S / 1.15) * 1000) / 1000;
export const PICKAXES: Record<PickaxeId, Pickaxe> = {
  rusted: { name: "Rusted Pickaxe", emoji: "⛏️", tier: 1, price: 0, damage: 24, swing: BASE_SWING_S, sweet: 0, hum: false, glint: 1, geodeFloor: 0, shatterDouble: false, noBedrock: false, blurb: "T1: Old Flint's gift. Mines T1-T2 (a T2 lode at 60%)." },
  copper: { name: "Copper Pickaxe", emoji: "⛏️", tier: 2, price: PICKAXE_PRICES.copper, damage: 32, swing: FAST_SWING_S, sweet: 0.15, hum: false, glint: 1, geodeFloor: 0, shatterDouble: false, noBedrock: false, blurb: "T2: mines T1-T3 (one-shots T1). +15% swing speed, +15% sweet spot radius." },
  reinforced: { name: "Reinforced Pickaxe", emoji: "⚒️", tier: 3, price: PICKAXE_PRICES.reinforced, damage: 42, swing: FAST_SWING_S, sweet: 0.15, hum: true, glint: 1, geodeFloor: 0.25, shatterDouble: false, noBedrock: false, blurb: "T3: mines T1-T4 (one-shots T1-T2). The weak spot hums as you near it; a 25% geode drop rate off iron." },
  glimmer: { name: "Glimmer Pickaxe", emoji: "💠", tier: 4, price: PICKAXE_PRICES.glimmer, damage: 54, swing: FAST_SWING_S, sweet: 0.3, hum: true, glint: 1.5, geodeFloor: 0.25, shatterDouble: false, noBedrock: false, blurb: "T4: mines every tier, the Titan Monolith too (one-shots T1-T3). Weak spots glint 50% brighter, +30% sweet spot radius." },
  drill: { name: "Deep Core Drill", emoji: "🌀", tier: 5, price: PICKAXE_PRICES.drill, damage: 70, swing: FAST_SWING_S, sweet: 0.6, hum: true, glint: 1.5, geodeFloor: 0.25, shatterDouble: true, noBedrock: true, blurb: "T5: one-shots T1-T4; 2x shatter yield on a perfect strike; +60% sweet spot radius; bedrock never deflects it." },
};
export const PICKAXE_IDS = Object.keys(PICKAXES) as PickaxeId[];
export const PICKAXES_BY_TIER: PickaxeId[] = [...PICKAXE_IDS].sort((a, b) => PICKAXES[a].tier - PICKAXES[b].tier);
export function isPickaxeId(v: unknown): v is PickaxeId {
  return typeof v === "string" && v in PICKAXES;
}

// --- the nodes' kinds: T1 up the terrace to the T5 Titan Monolith ------------------------------------

export type OreKind = "coal" | "copper" | "iron" | "silver" | "glimmer" | "monolith";
export interface OreKindInfo {
  name: string;
  emoji: string;
  tier: number;
  /** Its damage bar (a strike's damage comes off it; shared by everyone striking it). */
  hp: number;
  /** Seconds (or, the Monolith, a range) before it grows back once broken. */
  respawnS: readonly [number, number];
  /** The rock's rough radius (m): a strike's distance from the weak spot is measured on it. */
  radius: number;
  /** The sweet radius at 1x (m); the near radius is NEAR_RADII times it. */
  sweet: number;
  /** A Mystery (or, the Monolith, a Pristine) Geode's chance per break. */
  geode: number;
  /** Where it is: its zone's name, for the dock and the drawer. */
  zone: string;
  /** Its tells' colour (the stress fissures' glow). */
  glow: string;
}
export const ORE_KINDS: Record<OreKind, OreKindInfo> = {
  coal: { name: "Coal Seam", emoji: "⚫", tier: 1, hp: 120, respawnS: [35, 35], radius: 0.42, sweet: 0.2, geode: 0, zone: "the Coal Breakdown", glow: "#ffb347" },
  copper: { name: "Copper Vein", emoji: "🟠", tier: 1, hp: 120, respawnS: [35, 35], radius: 0.42, sweet: 0.2, geode: 0, zone: "the Doline Jungle", glow: "#ffb347" },
  iron: { name: "Iron Lode", emoji: "🔩", tier: 2, hp: 200, respawnS: [50, 50], radius: 0.5, sweet: 0.18, geode: 0.15, zone: "the Iron Mudflats", glow: "#ff8a4a" },
  silver: { name: "Silver Seam", emoji: "⚪", tier: 3, hp: 300, respawnS: [75, 75], radius: 0.55, sweet: 0.16, geode: 0, zone: "the Pearl Terraces", glow: "#8fe8ff" },
  glimmer: { name: "Glimmerstone Cluster", emoji: "💠", tier: 4, hp: 440, respawnS: [120, 120], radius: 0.6, sweet: 0.15, geode: 0.3, zone: "the Glimmer Rift", glow: "#00f0ff" },
  monolith: { name: "Titan Monolith", emoji: "🗿", tier: 5, hp: 2400, respawnS: [25 * 60, 30 * 60], radius: 1.1, sweet: 0.24, geode: 1, zone: "the Great Lake's islet", glow: "#b36bff" },
};
export const ORE_KIND_IDS = Object.keys(ORE_KINDS) as OreKind[];
/** How high a node's rock centre stands over its floor (m): a strike's direction, and its weak spot,
 *  are measured from there (the rock sits a little sunk into the floor; the Monolith stands tall). */
export function oreCenterY(kind: OreKind): number {
  return kind === "monolith" ? 1.25 : ORE_KINDS[kind].radius * 0.72;
}
export function isOreKind(v: unknown): v is OreKind {
  return typeof v === "string" && v in ORE_KINDS;
}
/** How far past the sweet radius a strike still lands near. */
export const NEAR_RADII = 2.4;
/** Each strike's share of a direct one's damage, by where it landed. */
export const STRIKE_DAMAGE = { direct: 1, near: 0.5, bedrock: 0.15 } as const;
/** A pickaxe one tier under the ore bites at this much. */
export const UNDER_TIER_DAMAGE = 0.6;
/** Deflected (two tiers or more under the ore): the arms' recovery before the next strike (s). */
export const DEFLECT_STAGGER_S = 0.5;
/** The client's own guard between taps (s): a double tap on a phone is one strike. */
export const STRIKE_DEBOUNCE_S = 0.25;

/** What a pickaxe does to an ore of `oreTier`: breaks it at once (a higher tier), mines it, mines it
 *  at 60% (one tier under), or is deflected (two or more under). */
export function mohs(pickTier: number, oreTier: number): "oneshot" | "mine" | "under" | "deflect" {
  if (pickTier > oreTier) return "oneshot";
  if (pickTier === oreTier) return "mine";
  return pickTier === oreTier - 1 ? "under" : "deflect";
}

export type StrikeVerdict = "direct" | "near" | "bedrock" | "deflect";
export type Vec3 = [number, number, number];
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** The way the isometric camera looks from (a weak spot is always on the side you see). */
export const CAMERA_SIDE: Vec3 = norm([1, 1.15, 1]);
/** The Deep Warmth's reach: a fracture radius this much wider (the thermal terraces' buff). */
export const WARMTH_FRACTURE = 1.2;
/** Miner's Stout: every strike this much harder a while. */
export const STOUT_DAMAGE = 1.25;

/** A node's sweet and near radii (m) for this pickaxe, the Deep Warmth widening both (and `extra`,
 *  the Lodestone Pendant's share, on top). */
export function strikeRadii(kind: OreKind, pick: PickaxeId, warmth: boolean, extra = 0): { sweet: number; near: number } {
  const sweet = ORE_KINDS[kind].sweet * (1 + PICKAXES[pick].sweet + extra) * (warmth ? WARMTH_FRACTURE : 1);
  return { sweet, near: sweet * NEAR_RADII };
}

/**
 * A new weak spot on a node: a direction from its centre (a unit vector, the world's axes) on the
 * side the camera sees, never its underside, and on a wall-mounted node never into the wall (`face`:
 * the way it faces out of it, on the ground).
 */
export function rollWeakSpot(face: { x: number; z: number } | null, rand: () => number = Math.random): Vec3 {
  let best: Vec3 = norm([CAMERA_SIDE[0], 0.4, CAMERA_SIDE[2]]);
  for (let k = 0; k < 60; k++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const d: Vec3 = [r * Math.cos(a), u, r * Math.sin(a)];
    if (d[1] < -0.1 || d[1] > 0.85) continue;
    if (d[0] * CAMERA_SIDE[0] + d[1] * CAMERA_SIDE[1] + d[2] * CAMERA_SIDE[2] < 0.3) continue;
    if (face && d[0] * face.x + d[2] * face.z < 0.3) continue;
    best = d;
    break;
  }
  return best.map((v) => Math.round(v * 1000) / 1000) as Vec3;
}

/** A strike's direction from a node's centre, from what a client sent (null: not a direction). */
export function strikeDirection(raw: unknown): Vec3 | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const v = raw.map(Number) as Vec3;
  if (!v.every(Number.isFinite)) return null;
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-6 ? [v[0] / l, v[1] / l, v[2] / l] : null;
}

/** How far a strike landed from the weak spot (m, on the rock's rough sphere). */
export function strikeDistance(kind: OreKind, weak: Vec3, hit: Vec3): number {
  return Math.hypot(weak[0] - hit[0], weak[1] - hit[1], weak[2] - hit[2]) * ORE_KINDS[kind].radius;
}

/** A strike, judged: where it landed (direct, near, bedrock; deflected off a rock too hard for the
 *  pickaxe), and its damage. A pickaxe of a higher tier breaks the node outright (the whole bar). */
export function judgeStrike(kind: OreKind, pick: PickaxeId, weak: Vec3, hit: Vec3, warmth = false, boost: { sweet?: number; damage?: number } = {}): { verdict: StrikeVerdict; damage: number; d: number; oneshot: boolean } {
  const info = ORE_KINDS[kind];
  const p = PICKAXES[pick];
  const rule = mohs(p.tier, info.tier);
  const d = strikeDistance(kind, weak, hit);
  if (rule === "deflect") return { verdict: "deflect", damage: 0, d, oneshot: false };
  const { sweet, near } = strikeRadii(kind, pick, warmth, boost.sweet ?? 0);
  const verdict: StrikeVerdict = d <= sweet ? "direct" : d <= near ? "near" : "bedrock";
  if (rule === "oneshot") return { verdict, damage: info.hp, d, oneshot: true };
  const share = verdict === "bedrock" && p.noBedrock ? STRIKE_DAMAGE.near : STRIKE_DAMAGE[verdict as keyof typeof STRIKE_DAMAGE];
  return { verdict, damage: Math.max(1, Math.round(p.damage * share * (rule === "under" ? UNDER_TIER_DAMAGE : 1) * (boost.damage ?? 1))), d, oneshot: false };
}

// --- the strike's pulse and the miner's streak (docs/caverns-roadmap.md phase 4) --------------------

/** The target ring on the rock tightens onto the weak spot's sweet ring once every PULSE_S, from the
 *  moment the close-up opens: a direct strike within PERFECT_WINDOW_S of it closing is a Perfect,
 *  PERFECT_DAMAGE times as hard. */
export const PULSE_S = 1.1;
export const PERFECT_WINDOW_S = 0.13;
export const PERFECT_DAMAGE = 1.3;
/** Perfects in a row (from node to node): each adds STREAK_STEP to every haul, up to STREAK_MAX; a
 *  near or bedrock strike ends the run, a plain direct one holds it, and it lapses after
 *  STREAK_IDLE_S without a strike. */
export const STREAK_STEP = 0.08;
export const STREAK_MAX = 5;
export const STREAK_IDLE_S = 90;
/** How far the client's clock may run from the server's on a strike (ms). */
export const PROSPECT_CLOCK_SLACK_MS = 450;
/** Where the ring is in its pulse `t` seconds after the close-up opened: 0 wide open .. 1 closed. */
export function pulsePhase(t: number): number {
  return (((t % PULSE_S) + PULSE_S) % PULSE_S) / PULSE_S;
}
/** Whether a strike `t` seconds after the close-up opened lands as the ring closes (the first time
 *  at PULSE_S). */
export function onPulse(t: number): boolean {
  const k = Math.round(t / PULSE_S);
  return k >= 1 && Math.abs(t - k * PULSE_S) <= PERFECT_WINDOW_S;
}
/** A haul's share for a run of `n` Perfects. */
export const streakBonus = (n: number) => 1 + STREAK_STEP * Math.min(STREAK_MAX, Math.max(0, n));

/** A node's crack stage from its damage (0 whole .. 1 about to go): surface fissures, then the outer
 *  shell fracturing, then the shatter. */
export function crackStage(damage: number): "whole" | "fissures" | "fracture" {
  return damage < 0.08 ? "whole" : damage < 0.6 ? "fissures" : "fracture";
}

// --- co-op veins ---------------------------------------------------------------------------------

/** Each other qualifying miner adds this much to everyone's yield (up to COOP_MAX_CREW of them). */
export const COOP_BONUS = 0.4;
/** A miner qualifies for a node's yield past this share of its damage. */
export const COOP_MIN_SHARE = 0.15;
export const COOP_MAX_CREW = 4;
/** Who shares a broken node's yield (more than 15% of its damage each), and the multiplier on
 *  every share: 1 alone, 1.4 for two, 1.8 for three, 2.2 for four or more. */
export function coopShares(damage: ReadonlyMap<string, number>): { crew: string[]; mult: number } {
  const total = [...damage.values()].reduce((a, b) => a + b, 0);
  const crew = [...damage.entries()].filter(([, d]) => total > 0 && d / total > COOP_MIN_SHARE).map(([id]) => id);
  return { crew, mult: 1 + COOP_BONUS * (Math.min(COOP_MAX_CREW, Math.max(1, crew.length)) - 1) };
}
/** `n` times `mult`, rounded by chance (1.4 of a thing is one, and a second 40% of the time). */
export function scaleCount(n: number, mult: number, rand: () => number = Math.random): number {
  const x = n * mult;
  return Math.floor(x) + (rand() < x - Math.floor(x) ? 1 : 0);
}

/** A broken silver seam's Fine Stone Dust (into the materials' store, not the satchel). */
export function rollDust(kind: OreKind, rand: () => number = Math.random): number {
  return kind === "silver" ? 1 + (rand() < 0.5 ? 1 : 0) : 0;
}
/** A broken node's haul for one miner (before the co-op multiplier): its ores, and now and then a
 *  geode (the pickaxe's floor on an iron lode; `geodeFind`, the Geode Hunter's Ring's, on top). */
export function rollYield(kind: OreKind, pick: PickaxeId, rand: () => number = Math.random, geodeFind = 0): Partial<Record<OreItemId, number>> {
  const out: Partial<Record<OreItemId, number>> = {};
  const add = (id: OreItemId, n: number) => n > 0 && (out[id] = (out[id] ?? 0) + n);
  switch (kind) {
    case "coal":
      add("coal", 1 + (rand() < 0.5 ? 1 : 0));
      break;
    case "copper":
      add("copper_ore", 1);
      if (rand() < 0.3) add("coal", 1);
      break;
    case "iron":
      add("iron_ore", 1 + (rand() < 0.3 ? 1 : 0));
      break;
    case "silver":
      add("silver_ore", 1 + (rand() < 0.35 ? 1 : 0));
      break;
    case "glimmer":
      add("glimmer_shard", 1 + (rand() < 0.2 ? 1 : 0));
      break;
    case "monolith":
      add("core_fragment", 1);
      add("pristine_geode", 1);
      return out;
  }
  const base = kind === "iron" ? Math.max(ORE_KINDS.iron.geode, PICKAXES[pick].geodeFloor) : ORE_KINDS[kind].geode;
  const geode = base + (kind !== "coal" && kind !== "copper" ? geodeFind : 0);
  if (geode > 0 && rand() < geode) add("mystery_geode", 1);
  return out;
}

// --- the Thermal Bellows Forge ------------------------------------------------------------------------

export type IngotId = "copper_ingot" | "iron_ingot" | "silver_ingot";
export const INGOT_IDS: IngotId[] = ["copper_ingot", "iron_ingot", "silver_ingot"];
export function isIngotId(v: unknown): v is IngotId {
  return typeof v === "string" && (INGOT_IDS as string[]).includes(v);
}
/** Each plain ingot's Masterwork (forged by hand at the bellows and the anvil: +25% value). */
export const MASTERWORK_OF: Record<IngotId, OreItemId> = { copper_ingot: "copper_ingot_mw", iron_ingot: "iron_ingot_mw", silver_ingot: "silver_ingot_mw" };
/** Each ingot's ores and coal. */
export const FORGE_RECIPES: Record<IngotId, Partial<Record<OreItemId, number>>> = {
  copper_ingot: { copper_ore: 3, coal: 1 },
  iron_ingot: { iron_ore: 3, coal: 2 },
  silver_ingot: { silver_ore: 2, coal: 2 },
};
/** Quick Smelt All's order: the best margin first (silver +51%, iron +9%, copper +7%). */
export const QUICK_SMELT_ORDER: IngotId[] = ["silver_ingot", "iron_ingot", "copper_ingot"];
/** How long the forge takes over each plain ingot (s), one after another; the most one queue holds. */
export const FORGE_SMELT_S = 3;
export const FORGE_QUEUE_MAX = 60;
/** How many of an ingot the ores in `have` make. */
export function smeltable(have: Partial<Record<OreItemId, number>>, ingot: IngotId): number {
  let n = Infinity;
  for (const [id, k] of Object.entries(FORGE_RECIPES[ingot]) as [OreItemId, number][]) n = Math.min(n, Math.floor((have[id] ?? 0) / k));
  return Number.isFinite(n) ? n : 0;
}

/**
 * The Thermal Bellows Forge, by hand: a batch of 1, 3 or 5 ingots of one kind (its ores and coal
 * taken as it starts, all given back if it is abandoned), in two phases.
 *
 *   the bellows   each pump of the bellows heats the furnace (PUMP), which cools as it burns (COOL a
 *                 second); the "Optimal Temperature" band's needle drifts up and down (a bigger batch
 *                 swings it wider and quicker: FORGE_BATCH). Keep the heat inside the band for
 *                 BELLOWS_HOLD_S seconds running, before BELLOWS_LIMIT_S
 *   the hammer    the glowing ingot on the anvil: sparks burst on a beat (HAMMER_LEAD after the heat
 *                 holds, then every HAMMER_BEAT), and each of the two strikes lands within
 *                 HAMMER_WINDOW of its burst
 *
 * Both phases done: the batch comes out Masterwork (+25% value); the heat held but a strike missed:
 * Fine (plain ingots, and the batch's coal back in the satchel); the heat never held: plain. The
 * client runs the same simulation live (forgeHeatAt) and sends its pumps and strikes once, at the
 * end; the server replays them (judgeForge), never faster than the time it gave.
 */
export const FORGE_BATCHES = [1, 3, 5] as const;
export type ForgeBatch = (typeof FORGE_BATCHES)[number];
export function isForgeBatch(v: unknown): v is ForgeBatch {
  return v === 1 || v === 3 || v === 5;
}
/** The heat's simulation step (s), a pump's heat, the furnace's cooling a second, where it starts. */
export const FORGE_STEP_S = 1 / 60;
export const PUMP_HEAT = 0.09;
export const HEAT_COOL = 0.26;
export const HEAT_START = 0.25;
/** Holding the bellows down pumps this many times a second (a tap is one pump). */
export const HOLD_PUMPS_PER_S = 6;
/** The band: its middle's rest, and by batch its half-width, its swing and its period (s): the band
 *  never falls quicker than the furnace cools, so every batch can be held with a steady hand. */
export const BAND_MID = 0.56;
export const FORGE_BATCH: Record<ForgeBatch, { half: number; swing: number; period: number }> = {
  1: { half: 0.1, swing: 0.08, period: 5.2 },
  3: { half: 0.09, swing: 0.11, period: 4.0 },
  5: { half: 0.075, swing: 0.13, period: 3.2 },
};
export const BELLOWS_HOLD_S = 4.0;
export const BELLOWS_LIMIT_S = 26;
export const HAMMER_LEAD_S = 1.0;
export const HAMMER_BEAT_S = 0.85;
export const HAMMER_WINDOW_S = 0.22;
export const HAMMER_STRIKES = 2;
/** The most pumps a second a hand can manage (a longer log is refused). */
export const MAX_PUMPS_PER_S = 14;

/** Where the band's middle is at `t` seconds into the game (its phase from the game's seed). */
export function bandAt(batch: ForgeBatch, seed: number, t: number): { mid: number; half: number } {
  const b = FORGE_BATCH[batch];
  const phase = (seed % 1000) / 1000;
  return { mid: BAND_MID + b.swing * Math.sin(2 * Math.PI * (t / b.period + phase)), half: b.half };
}
/** The furnace's heat through a log of pumps (seconds, sorted), step by step to `until` (s): its heat
 *  then, and when the heat had held inside the band for BELLOWS_HOLD_S running (null: not yet). */
export function forgeHeatAt(batch: ForgeBatch, seed: number, pumps: readonly number[], until: number): { heat: number; held: number; doneAt: number | null } {
  let heat = HEAT_START;
  let run = 0;
  let k = 0;
  const steps = Math.min(Math.ceil(until / FORGE_STEP_S), Math.ceil(BELLOWS_LIMIT_S / FORGE_STEP_S));
  for (let i = 1; i <= steps; i++) {
    const t = i * FORGE_STEP_S;
    while (k < pumps.length && pumps[k] <= t) {
      heat = Math.min(1, heat + PUMP_HEAT);
      k++;
    }
    heat = Math.max(0, heat - HEAT_COOL * FORGE_STEP_S);
    const band = bandAt(batch, seed, t);
    run = Math.abs(heat - band.mid) <= band.half ? run + FORGE_STEP_S : 0;
    if (run >= BELLOWS_HOLD_S - 1e-9) return { heat, held: run, doneAt: t };
  }
  return { heat, held: run, doneAt: null };
}
/** The spark bursts' beats once the heat held at `doneAt` (s). */
export const hammerBeats = (doneAt: number) => Array.from({ length: HAMMER_STRIKES }, (_, k) => doneAt + HAMMER_LEAD_S + k * HAMMER_BEAT_S);
/** A batch's grade: Masterwork (both phases clean), Fine (the heat held, a strike missed: its coal
 *  back), Plain (the heat never held). */
export type ForgeGrade = "plain" | "fine" | "masterwork";
export const forgeGrade = (j: { held: boolean; masterwork: boolean }): ForgeGrade => (j.masterwork ? "masterwork" : j.held ? "fine" : "plain");
/** A whole game judged from its log: the heat held (and when), each strike on its beat, and so a
 *  Masterwork or not. `elapsed`: the seconds the server has seen go by since the game began. */
export function judgeForge(batch: ForgeBatch, seed: number, pumps: readonly number[], strikes: readonly number[], elapsed: number): { held: boolean; beats: boolean[]; masterwork: boolean; valid: boolean } {
  const sorted = (a: readonly number[]) => a.every((v, i) => Number.isFinite(v) && v >= 0 && (i === 0 || v >= a[i - 1]));
  const last = Math.max(0, ...pumps, ...strikes);
  const valid = sorted(pumps) && sorted(strikes) && pumps.length <= MAX_PUMPS_PER_S * BELLOWS_LIMIT_S && last <= elapsed + 1 && pumps.length / Math.max(1, last) <= MAX_PUMPS_PER_S * 1.2;
  if (!valid) return { held: false, beats: [], masterwork: false, valid: false };
  const { doneAt } = forgeHeatAt(batch, seed, pumps, BELLOWS_LIMIT_S);
  if (doneAt === null) return { held: false, beats: [], masterwork: false, valid: true };
  const hits = strikes.filter((t) => t > doneAt).slice(0, HAMMER_STRIKES);
  const beats = hammerBeats(doneAt).map((b, i) => hits[i] !== undefined && Math.abs(hits[i] - b) <= HAMMER_WINDOW_S);
  return { held: true, beats, masterwork: beats.length === HAMMER_STRIKES && beats.every(Boolean), valid: true };
}

// --- the Thermal Bellows Forge's mining relics --------------------------------------------------------

/** The mining relics (shared/gear.ts, craft "forge"), forged once each at the forge from its own
 *  makings: what each takes (from the satchel, a Masterwork ingot standing in for a plain one; the
 *  stone dust from the materials' store). */
export type MiningRelicId = "knuckle_guards" | "satchel_strap" | "hunter_ring" | "lodestone_pendant";
export const FORGE_RELICS: Record<MiningRelicId, { ore: Partial<Record<OreItemId, number>>; dust: number }> = {
  knuckle_guards: { ore: { iron_ingot: 4 }, dust: 6 },
  satchel_strap: { ore: { copper_ingot: 3, iron_ingot: 2 }, dust: 0 },
  hunter_ring: { ore: { silver_ingot: 2, topaz: 1 }, dust: 4 },
  lodestone_pendant: { ore: { silver_ingot: 2, glimmer_shard: 3 }, dust: 0 },
};
export const MINING_RELIC_IDS = Object.keys(FORGE_RELICS) as MiningRelicId[];
export function isMiningRelicId(v: unknown): v is MiningRelicId {
  return typeof v === "string" && v in FORGE_RELICS;
}

// --- the Precision Geode Chisel -------------------------------------------------------------------------

export type GeodeId = "mystery_geode" | "pristine_geode";
export type GemId = "amethyst" | "topaz" | "opal" | "star_shard";
export const GEM_IDS: GemId[] = ["amethyst", "topaz", "opal", "star_shard"];
export function isGeodeId(v: unknown): v is GeodeId {
  return v === "mystery_geode" || v === "pristine_geode";
}
/**
 * A geode on the meteorite anvil, cleaved with a chisel and mallet in two phases:
 *
 *   seam finding   turn the geode round (a drag, or the arrow keys) until its glowing crystal seam
 *                  faces you: within SEAM_FACE_DEG a harmonic chime rings and the chisel is set
 *   mallet         the power gauge sweeps 0 to 100% and back (CHISEL_PERIOD_S); let go of the mallet
 *                  in the sweet spot. Under CHISEL_BITE the chisel rings off the shell (try again);
 *                  CHISEL_SWEET is a perfect cleavage (the finer gems intact: GEODE_ODDS_PERFECT);
 *                  over CHISEL_PULVERIZE the core is pulverized into stone dust; anywhere else a rough
 *                  crack (a gem, the finer ones a little less likely)
 *   quick crack    once the game is known: one blow and no game, always a rough cleave (never dust,
 *                  never a bounce, never the perfect odds), for cracking a pile
 *
 * The server rolls the seam and starts the gauge's clock; it judges the release on the time the
 * client measured, if near enough its own.
 */
export const GEODE_ODDS: Record<GeodeId, Record<GemId, number>> = {
  mystery_geode: { amethyst: 0.5, topaz: 0.3, opal: 0.15, star_shard: 0.05 },
  pristine_geode: { amethyst: 0.2, topaz: 0.35, opal: 0.3, star_shard: 0.15 },
};
/** A perfect cleavage: the finer gems come out whole, the likelier. */
export const GEODE_ODDS_PERFECT: Record<GeodeId, Record<GemId, number>> = {
  mystery_geode: { amethyst: 0.34, topaz: 0.33, opal: 0.23, star_shard: 0.1 },
  pristine_geode: { amethyst: 0.1, topaz: 0.3, opal: 0.35, star_shard: 0.25 },
};
/** How near the seam must face the viewer (degrees), the gauge's sweep there and back (s, a Pristine
 *  Geode's quicker), and its bands (share of the gauge). */
export const SEAM_FACE_DEG = 25;
export const CHISEL_PERIOD_S: Record<GeodeId, number> = { mystery_geode: 1.9, pristine_geode: 1.55 };
export const CHISEL_BITE = 0.4;
export const CHISEL_SWEET: readonly [number, number] = [0.65, 0.8];
export const CHISEL_PULVERIZE = 0.85;
/** How far the client's clock may run from the server's on a release (ms). */
export const CHISEL_CLOCK_SLACK_MS = 450;
/** A pulverized core's stone dust. */
export const PULVERIZED_DUST: readonly [number, number] = [2, 4];
/** Quick cracks no closer together than this (ms: the mallet's own swing). */
export const QUICK_CRACK_GAP_MS = 600;

/** The seam: a direction on the geode's surface (a unit vector, the geode's own axes). */
export function rollSeam(rand: () => number = Math.random): Vec3 {
  const u = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return [r * Math.cos(a), u, r * Math.sin(a)].map((v) => Math.round(v * 1000) / 1000) as Vec3;
}
/** Whether a view (the direction toward the viewer, in the geode's axes) sees the seam face on. */
export function seamFaces(seam: Vec3, view: Vec3): boolean {
  const l = Math.hypot(view[0], view[1], view[2]) || 1;
  const cos = (seam[0] * view[0] + seam[1] * view[1] + seam[2] * view[2]) / l;
  return cos >= Math.cos((SEAM_FACE_DEG * Math.PI) / 180);
}
/** The power gauge at `t` seconds (0..1..0 each period). */
export function chiselGauge(geode: GeodeId, t: number): number {
  const p = CHISEL_PERIOD_S[geode];
  const f = (((t % p) + p) % p) / p;
  return f < 0.5 ? f * 2 : 2 - f * 2;
}
export type ChiselVerdict = "bounce" | "rough" | "perfect" | "pulverize";
export function judgeChisel(v: number): ChiselVerdict {
  if (v < CHISEL_BITE) return "bounce";
  if (v > CHISEL_PULVERIZE) return "pulverize";
  return v >= CHISEL_SWEET[0] && v <= CHISEL_SWEET[1] ? "perfect" : "rough";
}
/** The odds on a cleave: a perfect one's, or a rough one's (each of the finer gems shaved: the Star
 *  Shard by a third, the Opal by a quarter, the Topaz by 15%, into the humblest). */
export function geodeOdds(geode: GeodeId, perfect: boolean): Record<GemId, number> {
  if (perfect) return { ...GEODE_ODDS_PERFECT[geode] };
  const o = { ...GEODE_ODDS[geode] };
  const shaved = o.star_shard / 3 + o.opal * 0.25 + o.topaz * 0.15;
  o.star_shard *= 2 / 3;
  o.opal *= 0.75;
  o.topaz *= 0.85;
  o.amethyst += shaved;
  return o;
}
export function rollGem(geode: GeodeId, perfect: boolean, rand: () => number = Math.random): GemId {
  const o = geodeOdds(geode, perfect);
  let r = rand();
  for (const g of GEM_IDS) {
    r -= o[g];
    if (r < 0) return g;
  }
  return "amethyst";
}

// --- the Travertine Thermal Terraces' Deep Warmth -------------------------------------------------------

/** A soak this long in the thermal terraces' warm pools: the Deep Warmth, this long (it goes with
 *  you, whatever world). */
export const SOAK_S = 60;
export const DEEP_WARMTH_MS = 20 * 60_000;
/** The Deep Warmth: walking this much quicker everywhere, and the Velvet Ring's stamina coming back
 *  this much quicker (its fracture radius: WARMTH_FRACTURE). */
export const WARMTH_PACE = 1.15;
export const WARMTH_STAMINA = 1.25;
export const warmthOn = (until: number, now = Date.now()) => until > now;

/**
 * The springs' breathing (optional, docs/caverns-roadmap.md phase 4): while you soak, a slow ring
 * swells (breathing in) and ebbs (breathing out) over BREATH_S; a tap as it is fullest (within
 * BREATH_WINDOW_S of the swell's top) is a deep breath, one a breath. Each deep breath adds
 * BREATH_BONUS_MS to the Deep Warmth (the soak's own, or the warmth already on once soaked
 * through), up to BREATH_MAX a soak. The clock runs from the soak's start: the client sends its own
 * time on it, taken if near enough the server's (BREATH_CLOCK_SLACK_MS).
 */
export const BREATH_S = 6;
export const BREATH_WINDOW_S = 0.6;
export const BREATH_BONUS_MS = 60_000;
export const BREATH_MAX = 10;
export const BREATH_CLOCK_SLACK_MS = 900;
/** Where a breath is at `t` seconds into the soak: 0 empty, 1 full (the swell eased in and out). */
export function breathFill(t: number): number {
  const f = (((t % BREATH_S) + BREATH_S) % BREATH_S) / BREATH_S;
  return 0.5 - 0.5 * Math.cos(f * Math.PI * 2);
}
/** Which breath `t` falls in (its top at (k + 0.5) x BREATH_S), and whether it is at the top. */
export function breathAt(t: number): { k: number; top: boolean } {
  const k = Math.floor(t / BREATH_S);
  return { k, top: k >= 0 && Math.abs(t - (k + 0.5) * BREATH_S) <= BREATH_WINDOW_S };
}

// --- the packets (each its own channel) -------------------------------------------------------------

/** The caverns' channels, one per job: the strike, the anvil, the forge, the onsen; and the rest of
 *  the caverns (prospecting's start and stop, Gus's shop, the satchel's quick actions, a recast into
 *  the lucky drip). */
export const CAVERNS_CHANNELS = {
  strike: "caverns:strike",
  geode: "caverns:geode_crack",
  forge: "caverns:forge_smelt",
  onsen: "caverns:onsen_toggle",
  prospect: "caverns:prospect",
  gus: "caverns:gus",
  satchel: "caverns:satchel",
  recast: "caverns:recast",
  cast: "caverns:cast",
} as const;
/** A cast from the cenote's shore: the way the angler faces (a unit vector on the ground). */
export interface ShoreCastPacket {
  fx: number;
  fz: number;
}
/** A strike on the node being prospected: its direction from the node's centre (the world's axes)
 *  where the pointer met the rock. `seq` numbers it (a stale one is dropped). */
export interface StrikePacket {
  node: string;
  dir: Vec3;
  seq: number;
  /** When it was struck: ms since the close-up opened, on the client's clock (the ring's pulse). */
  t?: number;
}
/** The chisel: a geode set on the anvil (answered with its seam), the seam found (the view it was
 *  seen from, the geode's axes: answered with the gauge's start), the mallet let go (`t`: ms on the
 *  gauge since it started), or stepping away; or a quick crack (one blow, no game: a rough cleave). */
export type GeodePacket = { op: "start"; geode: GeodeId } | { op: "aim"; view: Vec3 } | { op: "release"; t: number } | { op: "cancel" } | { op: "quick"; geode: GeodeId };
/** The forge: `n` of an ingot into its queue (at the forge, plain ingots on its clock), or Quick
 *  Smelt All (anywhere in the caverns: every recipe the satchel can make, the best margin first), or
 *  the tray collected; the bellows' game (a batch started, its log sent at the end, or abandoned);
 *  a mining relic forged. */
export type ForgePacket =
  | { op: "smelt"; ingot: IngotId; n: number }
  | { op: "all" }
  | { op: "collect" }
  | { op: "start"; ingot: IngotId; batch: ForgeBatch }
  | { op: "finish"; pumps: number[]; strikes: number[] }
  | { op: "cancel" }
  | { op: "relic"; relic: MiningRelicId };
/** Into the onsen (the nearest free seat in reach) or out of it (onto its dry exit anchor); or, in
 *  it, a deep breath (`breath`: ms since the soak began, on the client's clock). */
export interface OnsenPacket {
  on?: boolean;
  breath?: number;
}
/** Server -> the bather: a breath judged ("soakBreath": deep or not, how many this soak, and the
 *  warmth it adds). */
export interface SoakBreath {
  deep: boolean;
  n: number;
  /** The Deep Warmth's end now (0: not soaked through yet: the breaths wait for it). */
  until: number;
}
/** Stepping back from a node (the view closed). */
export interface ProspectPacket {
  op: "stop";
}
/** Gus the Mole's shop (the stone dust from the materials' store too). */
export type GusPacket =
  | { op: "sell"; item: OreItemId; n: number | "all" }
  | { op: "sellCat"; cat: OreCategory }
  | { op: "sellDust" }
  | { op: "buyPickaxe"; pickaxe: PickaxeId }
  | { op: "equipPickaxe"; pickaxe: PickaxeId }
  | { op: "upgradeSatchel" };
/** The satchel drawer's quick actions (anywhere in the caverns): Quick Smelt All goes to the forge;
 *  Sell All Cut Gems to Gus. */
export type SatchelPacket = { op: "smeltAll" } | { op: "sellGems" };

// --- what the server tells -----------------------------------------------------------------------

/** One node as the room syncs it (`state.ores`, JSON by node id): its damage (0..1), whether it
 *  stands, and how many are at it. */
export interface OreSync {
  dmg: number;
  up: boolean;
  crew?: number;
}
export type OreSyncState = Record<string, OreSync>;
export function parseOres(raw: string): OreSyncState {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as OreSyncState) : {};
  } catch {
    return {};
  }
}
/** Server -> a prospector ("caveProspect"): the node framed, its weak spot, and your pickaxe's
 *  reach on it; `weak` changes as fissures run on ("caveWeak"). */
export interface CaveProspect {
  node: string;
  kind: OreKind;
  weak: Vec3;
  pick: PickaxeId;
  rule: "oneshot" | "mine" | "under" | "deflect";
}
/** Server -> the node's world ("caveStrike"): a strike landed (who, how, where, the node's damage). */
export interface CaveStrike {
  sessionId: string;
  node: string;
  verdict: StrikeVerdict;
  hit: Vec3;
  dmg: number;
  /** The weak spot moved (a direct strike ran the fissure on): only its prospectors are told where. */
  moved?: boolean;
  /** Struck as the ring closed (a Perfect), and the striker's run of Perfects now. */
  perfect?: boolean;
  streak?: number;
}
/** Server -> the node's world ("caveShatter"): it broke, and who shared it. */
export interface CaveShatter {
  node: string;
  kind: OreKind;
  crew: string[];
}
/** Server -> one miner ("caveLoot"): their share of a broken node, flying to them (the stone dust
 *  into the materials' store). */
export interface CaveLoot {
  node: string;
  items: Partial<Record<OreItemId, number>>;
  dust?: number;
  /** What found no room in the satchel (the soft clamp: lost). */
  lost: number;
  mult: number;
  perfect: boolean;
  /** The run of Perfects it was mined on (its haul's share: streakBonus). */
  streak?: number;
}
/** Server -> the chisel's hand: the geode's seam ("geodeStart"), the chisel set ("geodeAim": the
 *  gauge starts now), and the mallet's blow ("geodeResult": a bounce, a gem, or dust). */
export interface GeodeStart {
  geode: GeodeId;
  seam: Vec3;
}
export interface GeodeAim {
  ok: boolean;
}
export interface GeodeResult {
  verdict: ChiselVerdict;
  v: number;
  gem?: GemId;
  dust?: number;
  /** The geode cleaved, and whether it was a quick crack (no game: `v` 0). */
  geode?: GeodeId;
  quick?: boolean;
}
/** Server -> the forge's hand: a batch on ("forgeGame": its seed), and how it came out
 *  ("forgeResult"). */
export interface ForgeGame {
  ingot: IngotId;
  batch: ForgeBatch;
  seed: number;
}
export interface ForgeResult {
  ingot: IngotId;
  n: number;
  masterwork: boolean;
  held: boolean;
  beats: boolean[];
  /** How many found no room in the satchel (onto the forge's tray). */
  tray: number;
  /** Its grade, and (a Fine batch) the coal given back. */
  grade?: ForgeGrade;
  coal?: number;
}
/** Server -> the player: a word from the caverns (a refusal, a result), for the panel open or a toast. */
export interface CavernsResult {
  ok: boolean;
  message: string;
  coins?: number;
}
