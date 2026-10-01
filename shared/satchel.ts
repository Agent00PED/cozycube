// The Prospector's Satchel: what the caverns' ores, ingots, geodes and gems ride in, kept in the
// camp profile (shared/fishing.ts FishingProfile: `satchelTier`, `satchelSlots`, `satchelContents`).
// Its room is counted in slots: ores, ingots and gems stack 10 to a slot, an uncracked geode 5 (they
// are big), sized for a 5-10 minute round underground. Its tiers come from Gus the Mole's workshop,
// each for coins and a little of the other crafts' makings (the woodcutter's and the forge's):
//
//   0  Coat Pockets               2 slots (20)    everyone's (Old Flint's pickaxe works on day one)
//   1  Canvas Ore Pouch           4 slots (40)    10 Sawdust, 4 Pine Resin, 500 coins
//   2  Reinforced Miner's Sack    8 slots (80)    4 Copper Ingots, 6 Birch Bark, 1,500 coins
//   3  Hardened Prospector Pack  12 slots (120)   4 Iron Ingots, 4 Highland Cedar Logs, 3,600 coins
//   4  Glimmer Expedition Rig    16 slots (160)   4 Silver Ingots, 2 Glimmer Shards, 8,750 coins
//   5  Titan Core Vault          20 slots (200)   2 Titan Heartwood, 2 Ancient Core Fragments, 15,750 coins
//
// The soft clamp, as for the carriers and the livewells: a satchel holding more than its room keeps
// everything (Overburdened: selling, smelting and cracking all work); only new things wait for room.
// A Masterwork ingot stands in for its plain one wherever a recipe asks (satchelCountFor).

import { SATCHEL_PRICES } from "./economy";
import { MASTERWORK_OF, ORE_ITEMS, ORE_ITEM_IDS, isIngotId, isOreItemId, type OreItemId } from "./caverns_mining";
import type { ByproductId, WoodKind } from "./chop";

/** How many of a kind one slot stacks: an uncracked geode 5, everything else 10. */
export const STACK_ORE = 10;
export const STACK_GEODE = 5;
export const stackOf = (id: OreItemId) => (ORE_ITEMS[id].cat === "geode" ? STACK_GEODE : STACK_ORE);

/** A stack in the satchel: an item and how many (one entry per kind; its slots are counted). */
export interface SatchelStack {
  id: OreItemId;
  n: number;
}
export interface SatchelTier {
  tier: number;
  name: string;
  icon: string;
  slots: number;
  price: number;
  /** What it takes besides coins: from the satchel itself (ingots, shards, fragments), and from the
   *  camp's pouches and carrier (Sawdust, Pine Resin, by-products, logs). */
  needs: { ore?: Partial<Record<OreItemId, number>>; sawdust?: number; resin?: number; byproducts?: Partial<Record<ByproductId, number>>; wood?: Partial<Record<WoodKind, number>> };
}
export const SATCHEL_TIERS: SatchelTier[] = [
  { tier: 0, name: "Coat Pockets", icon: "🧥", slots: 2, price: SATCHEL_PRICES[0], needs: {} },
  { tier: 1, name: "Canvas Ore Pouch", icon: "👝", slots: 4, price: SATCHEL_PRICES[1], needs: { sawdust: 10, resin: 4 } },
  { tier: 2, name: "Reinforced Miner's Sack", icon: "🎒", slots: 8, price: SATCHEL_PRICES[2], needs: { ore: { copper_ingot: 4 }, byproducts: { bark: 6 } } },
  { tier: 3, name: "Hardened Prospector Pack", icon: "🧳", slots: 12, price: SATCHEL_PRICES[3], needs: { ore: { iron_ingot: 4 }, wood: { cedar: 4 } } },
  { tier: 4, name: "Glimmer Expedition Rig", icon: "💼", slots: 16, price: SATCHEL_PRICES[4], needs: { ore: { silver_ingot: 4, glimmer_shard: 2 } } },
  { tier: 5, name: "Titan Core Vault", icon: "🗄️", slots: 20, price: SATCHEL_PRICES[5], needs: { byproducts: { heartwood: 2 }, ore: { core_fragment: 2 } } },
];
export const SATCHEL_MAX_TIER = SATCHEL_TIERS.length - 1;
/** A tier's satchel (clamped), and the next one up (null at the top). */
export function satchelTier(tier: number): SatchelTier {
  return SATCHEL_TIERS[Math.max(0, Math.min(SATCHEL_MAX_TIER, Math.round(tier) || 0))];
}
export function nextSatchelTier(tier: number): SatchelTier | null {
  return SATCHEL_TIERS[Math.max(0, Math.round(tier) || 0) + 1] ?? null;
}

/** The satchel as the profile keeps it (the fields it needs). */
export interface SatchelHold {
  satchelTier: number;
  satchelSlots: number;
  satchelContents: SatchelStack[];
}

/** How many of an item the satchel holds. */
export function satchelCount(p: Pick<SatchelHold, "satchelContents">, id: OreItemId): number {
  return p.satchelContents.find((s) => s.id === id)?.n ?? 0;
}
/** Every item's count, as a record (none: absent). */
export function satchelCounts(p: Pick<SatchelHold, "satchelContents">): Partial<Record<OreItemId, number>> {
  const out: Partial<Record<OreItemId, number>> = {};
  for (const s of p.satchelContents) if (s.n > 0) out[s.id] = s.n;
  return out;
}
/** The slots a set of stacks fills (each kind a slot per its stack size). */
export function slotsUsed(stacks: readonly SatchelStack[]): number {
  return stacks.reduce((sum, s) => sum + (s.n > 0 ? Math.ceil(s.n / stackOf(s.id)) : 0), 0);
}
/** The satchel's room: its tier's slots (and `bonus` more: the Deepvein Satchel Strap's, worn). */
export function satchelCap(p: Pick<SatchelHold, "satchelTier">, bonus = 0): number {
  return satchelTier(p.satchelTier).slots + bonus;
}
/** Everything it holds, counted. */
export function satchelTotal(p: Pick<SatchelHold, "satchelContents">): number {
  return p.satchelContents.reduce((a, s) => a + s.n, 0);
}
/** How many more of `id` fit (a part-filled stack's room, then whole free slots); none at all while
 *  the satchel is over its slots (Overburdened). */
export function satchelRoomFor(p: Pick<SatchelHold, "satchelTier" | "satchelContents">, id: OreItemId, bonus = 0): number {
  const used = slotsUsed(p.satchelContents);
  if (used > satchelCap(p, bonus)) return 0;
  const free = Math.max(0, satchelCap(p, bonus) - used);
  const have = satchelCount(p, id);
  const topUp = have > 0 && have % stackOf(id) !== 0 ? stackOf(id) - (have % stackOf(id)) : 0;
  return topUp + free * stackOf(id);
}
/** Whether anything at all fits (a free slot, or room on a stack); never while Overburdened. */
export function satchelHasRoom(p: Pick<SatchelHold, "satchelTier" | "satchelContents">, bonus = 0): boolean {
  const used = slotsUsed(p.satchelContents);
  if (used > satchelCap(p, bonus)) return false;
  return used < satchelCap(p, bonus) || p.satchelContents.some((s) => s.n % stackOf(s.id) !== 0);
}
/** Up to `n` of an item in (as room allows): how many went in. */
export function satchelAdd(p: SatchelHold, id: OreItemId, n: number, bonus = 0): number {
  const take = Math.max(0, Math.min(Math.floor(n), satchelRoomFor(p, id, bonus)));
  if (take <= 0) return 0;
  const s = p.satchelContents.find((x) => x.id === id);
  if (s) s.n += take;
  else p.satchelContents.push({ id, n: take });
  // (kept in the items' own order: the drawer reads it as it is)
  p.satchelContents.sort((a, b) => ORE_ITEM_IDS.indexOf(a.id) - ORE_ITEM_IDS.indexOf(b.id));
  return take;
}
/** Up to `n` of an item out: how many came out. */
export function satchelTake(p: Pick<SatchelHold, "satchelContents">, id: OreItemId, n: number): number {
  const s = p.satchelContents.find((x) => x.id === id);
  if (!s) return 0;
  const take = Math.max(0, Math.min(s.n, Math.floor(n)));
  s.n -= take;
  if (s.n <= 0) p.satchelContents.splice(p.satchelContents.indexOf(s), 1);
  return take;
}
/** How many of an item count toward a recipe: a plain ingot's Masterworks stand in for it. */
export function satchelCountFor(p: Pick<SatchelHold, "satchelContents">, id: OreItemId): number {
  return satchelCount(p, id) + (isIngotId(id) ? satchelCount(p, MASTERWORK_OF[id]) : 0);
}
/** Up to `n` toward a recipe out of the satchel: the plain ones first, then Masterworks. */
export function satchelTakeFor(p: Pick<SatchelHold, "satchelContents">, id: OreItemId, n: number): number {
  const plain = satchelTake(p, id, n);
  return plain + (isIngotId(id) && plain < n ? satchelTake(p, MASTERWORK_OF[id], n - plain) : 0);
}
/** Whether the satchel holds all of these (a Masterwork standing in for a plain ingot). */
export function satchelHasAll(p: Pick<SatchelHold, "satchelContents">, need: Partial<Record<OreItemId, number>>): boolean {
  return (Object.entries(need) as [OreItemId, number][]).every(([id, n]) => satchelCountFor(p, id) >= n);
}

/** The satchel read back from storage (or the network): known items only, whole positive counts,
 *  one stack a kind (at most 9,999 of one), and its slots its tier's. */
export function sanitizeSatchel(raw: Record<string, unknown>): SatchelHold {
  const tier = Math.max(0, Math.min(SATCHEL_MAX_TIER, Math.round(Number(raw.satchelTier) || 0)));
  const byId = new Map<OreItemId, number>();
  if (Array.isArray(raw.satchelContents)) {
    for (const s of raw.satchelContents) {
      const e = s as Record<string, unknown>;
      if (!isOreItemId(e?.id)) continue;
      const n = Math.max(0, Math.min(9999, Math.round(Number(e.n) || 0)));
      if (n > 0) byId.set(e.id, Math.min(9999, (byId.get(e.id) ?? 0) + n));
    }
  }
  const satchelContents = ORE_ITEM_IDS.filter((id) => byId.has(id)).map((id) => ({ id, n: byId.get(id)! }));
  return { satchelTier: tier, satchelSlots: SATCHEL_TIERS[tier].slots, satchelContents };
}
