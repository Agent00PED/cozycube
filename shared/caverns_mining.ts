// The Glimmering Caverns' prospecting, as both sides see it: the ores and what Gus pays for them, the
// pickaxes, the nodes' kinds, the strike's judging, the co-op shares, the Ancient Forge's recipes and
// the Geode Anvil's odds. The server rolls every weak spot and judges every strike on these tables
// (server/src/rooms/caverns.ts); the client draws the very same numbers.
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
  | "stone_dust"
  | "glimmer_shard"
  | "core_fragment"
  | "copper_ingot"
  | "iron_ingot"
  | "silver_ingot"
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
  coal: { name: "Coal", emoji: "⚫", cat: "raw", price: ORE_PRICES.coal, color: "#3b3a40", blurb: "Off a coal seam on the terrace: the forge's fuel" },
  copper_ore: { name: "Raw Copper", emoji: "🟠", cat: "raw", price: ORE_PRICES.copper_ore, color: "#d9803f", blurb: "Off a copper vein on the terrace" },
  iron_ore: { name: "Raw Iron", emoji: "🔩", cat: "raw", price: ORE_PRICES.iron_ore, color: "#8a8f9a", blurb: "Off an iron lode on the wet cliffs" },
  silver_ore: { name: "Raw Silver", emoji: "⚪", cat: "raw", price: ORE_PRICES.silver_ore, color: "#dfe6f2", blurb: "Off a silver seam in the lower chasm" },
  stone_dust: { name: "Fine Stone Dust", emoji: "🌫️", cat: "raw", price: ORE_PRICES.stone_dust, color: "#b8b0a2", blurb: "Silver's powdery by-product: masons pay for it" },
  glimmer_shard: { name: "Glimmer Shard", emoji: "💠", cat: "raw", price: ORE_PRICES.glimmer_shard, color: "#5ff2ff", blurb: "Off a Glimmerstone cluster in the fungal chasm" },
  core_fragment: { name: "Ancient Core Fragment", emoji: "🔮", cat: "raw", price: ORE_PRICES.core_fragment, color: "#b36bff", blurb: "Off the Titan Monolith: humming, warm to the touch" },
  copper_ingot: { name: "Copper Ingot", emoji: "🟧", cat: "ingot", price: ORE_PRICES.copper_ingot, color: "#e0894a", blurb: "3 Raw Copper and 1 Coal, at the Ancient Forge" },
  iron_ingot: { name: "Iron Ingot", emoji: "⬛", cat: "ingot", price: ORE_PRICES.iron_ingot, color: "#6d7380", blurb: "3 Raw Iron and 2 Coal, at the Ancient Forge" },
  silver_ingot: { name: "Silver Ingot", emoji: "⬜", cat: "ingot", price: ORE_PRICES.silver_ingot, color: "#eef3fb", blurb: "2 Raw Silver and 2 Coal, at the Ancient Forge" },
  mystery_geode: { name: "Mystery Geode", emoji: "🪨", cat: "geode", price: ORE_PRICES.mystery_geode, color: "#8c7a6b", blurb: "Crack it on the Geode Anvil: a gem inside" },
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
  coal: { name: "Coal Seam", emoji: "⚫", tier: 1, hp: 120, respawnS: [35, 35], radius: 0.42, sweet: 0.2, geode: 0, zone: "the Upper Terrace", glow: "#ffb347" },
  copper: { name: "Copper Vein", emoji: "🟠", tier: 1, hp: 120, respawnS: [35, 35], radius: 0.42, sweet: 0.2, geode: 0, zone: "the Upper Terrace", glow: "#ffb347" },
  iron: { name: "Iron Lode", emoji: "🔩", tier: 2, hp: 200, respawnS: [50, 50], radius: 0.5, sweet: 0.18, geode: 0.15, zone: "the Wet Cliffs", glow: "#ff8a4a" },
  silver: { name: "Silver Seam", emoji: "⚪", tier: 3, hp: 300, respawnS: [75, 75], radius: 0.55, sweet: 0.16, geode: 0, zone: "the Lower Chasm", glow: "#8fe8ff" },
  glimmer: { name: "Glimmerstone Cluster", emoji: "💠", tier: 4, hp: 440, respawnS: [120, 120], radius: 0.6, sweet: 0.15, geode: 0.3, zone: "the Fungal Chasm", glow: "#00f0ff" },
  monolith: { name: "Titan Monolith", emoji: "🗿", tier: 5, hp: 2400, respawnS: [25 * 60, 30 * 60], radius: 1.1, sweet: 0.24, geode: 1, zone: "the Center Sanctuary", glow: "#b36bff" },
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
/** The Deep Warmth's reach: a fracture radius this much wider (the onsen's buff). */
export const WARMTH_FRACTURE = 1.2;

/** A node's sweet and near radii (m) for this pickaxe, the Deep Warmth widening both. */
export function strikeRadii(kind: OreKind, pick: PickaxeId, warmth: boolean): { sweet: number; near: number } {
  const sweet = ORE_KINDS[kind].sweet * (1 + PICKAXES[pick].sweet) * (warmth ? WARMTH_FRACTURE : 1);
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
export function judgeStrike(kind: OreKind, pick: PickaxeId, weak: Vec3, hit: Vec3, warmth = false): { verdict: StrikeVerdict; damage: number; d: number; oneshot: boolean } {
  const info = ORE_KINDS[kind];
  const p = PICKAXES[pick];
  const rule = mohs(p.tier, info.tier);
  const d = strikeDistance(kind, weak, hit);
  if (rule === "deflect") return { verdict: "deflect", damage: 0, d, oneshot: false };
  const { sweet, near } = strikeRadii(kind, pick, warmth);
  const verdict: StrikeVerdict = d <= sweet ? "direct" : d <= near ? "near" : "bedrock";
  if (rule === "oneshot") return { verdict, damage: info.hp, d, oneshot: true };
  const share = verdict === "bedrock" && p.noBedrock ? STRIKE_DAMAGE.near : STRIKE_DAMAGE[verdict as keyof typeof STRIKE_DAMAGE];
  return { verdict, damage: Math.max(1, Math.round(p.damage * share * (rule === "under" ? UNDER_TIER_DAMAGE : 1))), d, oneshot: false };
}

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

/** A broken node's haul for one miner (before the co-op multiplier): its ores, and now and then a
 *  geode (the pickaxe's floor on an iron lode). */
export function rollYield(kind: OreKind, pick: PickaxeId, rand: () => number = Math.random): Partial<Record<OreItemId, number>> {
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
      add("stone_dust", 1 + (rand() < 0.5 ? 1 : 0));
      break;
    case "glimmer":
      add("glimmer_shard", 1 + (rand() < 0.2 ? 1 : 0));
      break;
    case "monolith":
      add("core_fragment", 1);
      add("pristine_geode", 1);
      return out;
  }
  const geode = kind === "iron" ? Math.max(ORE_KINDS.iron.geode, PICKAXES[pick].geodeFloor) : ORE_KINDS[kind].geode;
  if (geode > 0 && rand() < geode) add("mystery_geode", 1);
  return out;
}

// --- the Ancient Forge -----------------------------------------------------------------------------

export type IngotId = "copper_ingot" | "iron_ingot" | "silver_ingot";
export const INGOT_IDS: IngotId[] = ["copper_ingot", "iron_ingot", "silver_ingot"];
export function isIngotId(v: unknown): v is IngotId {
  return typeof v === "string" && (INGOT_IDS as string[]).includes(v);
}
/** Each ingot's ores and coal. */
export const FORGE_RECIPES: Record<IngotId, Partial<Record<OreItemId, number>>> = {
  copper_ingot: { copper_ore: 3, coal: 1 },
  iron_ingot: { iron_ore: 3, coal: 2 },
  silver_ingot: { silver_ore: 2, coal: 2 },
};
/** Quick Smelt All's order: the best margin first (silver +51%, iron +9%, copper +7%). */
export const QUICK_SMELT_ORDER: IngotId[] = ["silver_ingot", "iron_ingot", "copper_ingot"];
/** How long the forge takes over each ingot (s), one after another; the most one queue holds. */
export const FORGE_SMELT_S = 3;
export const FORGE_QUEUE_MAX = 60;
/** How many of an ingot the ores in `have` make. */
export function smeltable(have: Partial<Record<OreItemId, number>>, ingot: IngotId): number {
  let n = Infinity;
  for (const [id, k] of Object.entries(FORGE_RECIPES[ingot]) as [OreItemId, number][]) n = Math.min(n, Math.floor((have[id] ?? 0) / k));
  return Number.isFinite(n) ? n : 0;
}

// --- the Geode Anvil: three strikes along its seam -----------------------------------------------------

export type GeodeId = "mystery_geode" | "pristine_geode";
export type GemId = "amethyst" | "topaz" | "opal" | "star_shard";
export const GEM_IDS: GemId[] = ["amethyst", "topaz", "opal", "star_shard"];
export function isGeodeId(v: unknown): v is GeodeId {
  return v === "mystery_geode" || v === "pristine_geode";
}
/** What a geode holds, cracked cleanly along its seam: a Mystery Geode's Amethyst 50%, Topaz 30%,
 *  Opal 15%, Star Shard 5%; a Pristine Geode (the Monolith's) the finer gems likelier. */
export const GEODE_ODDS: Record<GeodeId, Record<GemId, number>> = {
  mystery_geode: { amethyst: 0.5, topaz: 0.3, opal: 0.15, star_shard: 0.05 },
  pristine_geode: { amethyst: 0.2, topaz: 0.35, opal: 0.3, star_shard: 0.15 },
};
export const GEODE_STRIKES = 3;
/** A strike this close to the seam (the geode's face is a unit disc) cracks it cleanly. */
export const SEAM_CLEAN = 0.12;
/** The seam across the geode's face: a line at `a` radians, `o` off its centre. */
export interface GeodeSeam {
  a: number;
  o: number;
}
export function rollSeam(rand: () => number = Math.random): GeodeSeam {
  return { a: Math.round(rand() * Math.PI * 1000) / 1000, o: Math.round((rand() - 0.5) * 0.5 * 1000) / 1000 };
}
/** How far a strike at (x, y) on the geode's face (a unit disc) lands from its seam. */
export function seamDistance(seam: GeodeSeam, x: number, y: number): number {
  return Math.abs(x * -Math.sin(seam.a) + y * Math.cos(seam.a) - seam.o);
}
/** The odds after `rough` strikes off the seam: each shaves the finer gems (the Star Shard by a fifth,
 *  the Opal by 15%, the Topaz by 10%) into the humblest. */
export function geodeOdds(geode: GeodeId, rough: number): Record<GemId, number> {
  const o = { ...GEODE_ODDS[geode] };
  for (let k = 0; k < Math.max(0, Math.min(GEODE_STRIKES, rough)); k++) {
    const shaved = o.star_shard * 0.2 + o.opal * 0.15 + o.topaz * 0.1;
    o.star_shard *= 0.8;
    o.opal *= 0.85;
    o.topaz *= 0.9;
    o.amethyst += shaved;
  }
  return o;
}
export function rollGem(geode: GeodeId, rough: number, rand: () => number = Math.random): GemId {
  const o = geodeOdds(geode, rough);
  let r = rand();
  for (const g of GEM_IDS) {
    r -= o[g];
    if (r < 0) return g;
  }
  return "amethyst";
}

// --- the Subterranean Onsen's Deep Warmth -------------------------------------------------------------

/** A soak this long in the onsen: the Deep Warmth, this long (it goes with you, whatever world). */
export const SOAK_S = 60;
export const DEEP_WARMTH_MS = 20 * 60_000;
/** The Deep Warmth: walking this much quicker everywhere, and the Velvet Ring's stamina coming back
 *  this much quicker (its fracture radius: WARMTH_FRACTURE). */
export const WARMTH_PACE = 1.15;
export const WARMTH_STAMINA = 1.25;
export const warmthOn = (until: number, now = Date.now()) => until > now;

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
} as const;
/** A strike on the node being prospected: its direction from the node's centre (the world's axes)
 *  where the pointer met the rock. `seq` numbers it (a stale one is dropped). */
export interface StrikePacket {
  node: string;
  dir: Vec3;
  seq: number;
}
/** The anvil: a geode set on it (answered with its seam), a strike on its face, or stepping away. */
export type GeodePacket = { op: "start"; geode: GeodeId } | { op: "strike"; x: number; y: number } | { op: "cancel" };
/** The forge: `n` of an ingot into its queue (at the forge), or Quick Smelt All (anywhere in the
 *  caverns: every recipe the satchel can make, the best margin first), or the tray collected. */
export type ForgePacket = { op: "smelt"; ingot: IngotId; n: number } | { op: "all" } | { op: "collect" };
/** Into the onsen (the nearest free seat in reach) or out of it (onto its dry exit anchor). */
export interface OnsenPacket {
  on: boolean;
}
/** Stepping back from a node (the view closed). */
export interface ProspectPacket {
  op: "stop";
}
/** Gus the Mole's shop. */
export type GusPacket =
  | { op: "sell"; item: OreItemId; n: number | "all" }
  | { op: "sellCat"; cat: OreCategory }
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
}
/** Server -> the node's world ("caveShatter"): it broke, and who shared it. */
export interface CaveShatter {
  node: string;
  kind: OreKind;
  crew: string[];
}
/** Server -> one miner ("caveLoot"): their share of a broken node, flying to them. */
export interface CaveLoot {
  node: string;
  items: Partial<Record<OreItemId, number>>;
  /** What found no room in the satchel (the soft clamp: lost). */
  lost: number;
  mult: number;
  perfect: boolean;
}
/** Server -> the geode's cracker: its seam ("geodeStart"), each strike ("geodeStrike"), the gem. */
export interface GeodeStart {
  geode: GeodeId;
  seam: GeodeSeam;
}
export interface GeodeStrike {
  n: number;
  clean: boolean;
  x: number;
  y: number;
  gem?: GemId;
}
/** Server -> the player: a word from the caverns (a refusal, a result), for the panel open or a toast. */
export interface CavernsResult {
  ok: boolean;
  message: string;
  coins?: number;
}
