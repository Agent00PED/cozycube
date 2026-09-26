// Buster's utility gear: kit you buy once at his stall (the 🧤 Gear tab) and that works for good
// from then on, no equipping. It lives in the camp profile (FishingProfile.gear); the server applies
// every effect (the chopping meter's gold band, the bonus log, the walking pace, the workbench's
// odds and salvage), and the client draws them from the same functions.

export type GearId = "canvas_gloves" | "deerskin_gloves" | "traction_boots" | "leather_apron";

export interface Gear {
  name: string;
  emoji: string;
  price: number;
  blurb: string;
}

export const GEAR: Record<GearId, Gear> = {
  canvas_gloves: { name: "Canvas Work Gloves", emoji: "🧤", price: 280, blurb: "+15% gold sweet spot on the chopping meter" },
  deerskin_gloves: { name: "Deerskin Grip Gloves", emoji: "🥊", price: 750, blurb: "+30% gold sweet spot, and a 10% chance of a bonus log per split" },
  traction_boots: { name: "Forester Traction Boots", emoji: "🥾", price: 550, blurb: "+15% walking pace while you carry timber" },
  leather_apron: { name: "Artisan Leather Apron", emoji: "🦺", price: 900, blurb: "10% less chance to break a carving, and 75% salvage (not 50%) when one breaks" },
};
export const GEAR_IDS = Object.keys(GEAR) as GearId[];
export function isGearId(v: unknown): v is GearId {
  return typeof v === "string" && v in GEAR;
}

/** How much wider the gloves make the chopping meter's gold band (the better pair counts). */
export function gloveSweetBonus(gear: readonly GearId[]): number {
  return gear.includes("deerskin_gloves") ? 0.3 : gear.includes("canvas_gloves") ? 0.15 : 0;
}
/** The Deerskin Grip Gloves' chance of one more log on a split. */
export function bonusLogChance(gear: readonly GearId[]): number {
  return gear.includes("deerskin_gloves") ? 0.1 : 0;
}
/** The Forester Traction Boots' pace: +15% while the wood carrier holds anything. */
export const TRACTION_SPEED = 1.15;
export function gearPace(gear: readonly GearId[], carrying: boolean): number {
  return carrying && gear.includes("traction_boots") ? TRACTION_SPEED : 1;
}
/** The Artisan Leather Apron: a carving's break chance, less 10 points (they go to a normal
 *  success), and how much of a broken carving's wood comes back (50%, 75% with the apron). */
export const APRON_BREAK_CUT = 0.1;
export function salvageRate(gear: readonly GearId[]): number {
  return gear.includes("leather_apron") ? 0.75 : 0.5;
}
