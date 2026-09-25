// The Campfire's hearth, as the room shares it: the bonfire's fuel (it burns down; firewood from
// the chopping block builds it back up, and a roaring fire gives everyone the Cozy Aura), the
// communal Dutch oven hung over it (three ingredients from anyone make a pot of stew anyone can
// scoop), and the picnic table, where a roasted skewer can be left for a friend to grab.
//
// The server owns all three (HangoutRoom: state.fuel, state.stew, state.picnic) and announces
// every change as BONFIRE_STATE_UPDATE / STEW_STATE_UPDATE, so each client can play the flame
// burst or the bubbling pot as it happens.

import type { RoastFood, RoastQuality } from "./types";
import type { FishId } from "./fishing";

// --- the bonfire's fuel --------------------------------------------------------------------------

export const FUEL_MAX = 100;
/** A fresh room's fire. */
export const FUEL_START = 60;
/** It burns down this much... */
export const FUEL_DECAY = 5;
/** ...every this many seconds. */
export const FUEL_DECAY_S = 120;
/** What a split log (or a lump of Golden Charcoal, double) puts back. */
export const FUEL_PER_FIREWOOD = 25;
export const FUEL_PER_CHARCOAL = 50;
/** Above this the fire roars and everyone at the campfire has the Cozy Aura. */
export const COZY_AURA_FUEL = 70;
/** Below this the fire sinks to embers under a smoky haze. */
export const LOW_FUEL = 20;
/** The Cozy Aura: +15% on rare fish and on campfire coins. */
export const COZY_AURA_LUCK = 0.15;

export type FuelItem = "firewood" | "charcoal";
export function hasCozyAura(fuel: number): boolean {
  return fuel > COZY_AURA_FUEL;
}

/** Someone put wood on the fire (or it burnt down a notch: `sessionId` ""). */
export interface BonfireUpdate {
  fuel: number;
  sessionId: string;
  item: FuelItem | "";
  amount: number;
}

// --- the Dutch oven --------------------------------------------------------------------------------

export type StewIngredient = "fish" | "mushroom" | "berry";
export const STEW_INGREDIENT_INFO: Record<StewIngredient, { name: string; emoji: string }> = {
  fish: { name: "a fish from your creel", emoji: "🐟" },
  mushroom: { name: "Spotted Red Mushrooms", emoji: "🍄" },
  berry: { name: "Glowing Night Berries", emoji: "🫐" },
};
/** A pot takes three ingredients, from anyone. */
export const STEW_SLOTS = 3;
/** It simmers this long once the third goes in. */
export const STEW_COOK_S = 25;
/** Bowls in a pot (one each per pot). */
export const STEW_SERVINGS = 6;
/** A pot nobody finishes goes cold and is emptied after this long. */
export const STEW_COLD_S = 10 * 60;

export type StewPhase = "gathering" | "cooking" | "ready";
/** The pot as the room syncs it (state.stew, JSON). */
export interface StewState {
  phase: StewPhase;
  /** What went in, in order, and who put it there (username), for the pot's card. */
  items: { kind: StewIngredient; by: string; fish?: FishId }[];
  /** 0..1 while cooking. */
  progress: number;
  servings: number;
  /** The userIds who already had a bowl of this pot. */
  served: string[];
}
export function emptyStew(): StewState {
  return { phase: "gathering", items: [], progress: 0, servings: 0, served: [] };
}
export function parseStew(raw: string): StewState {
  if (!raw) return emptyStew();
  try {
    const s = JSON.parse(raw) as StewState;
    return { ...emptyStew(), ...s, items: Array.isArray(s.items) ? s.items : [], served: Array.isArray(s.served) ? s.served : [] };
  } catch {
    return emptyStew();
  }
}
/** The pot's name, from what is in it. */
export function stewName(items: readonly { kind: StewIngredient }[]): string {
  const n = (k: StewIngredient) => items.filter((i) => i.kind === k).length;
  if (n("fish") >= 2) return "Hearty Fisherman's Stew";
  if (n("mushroom") >= 2) return "Forest Mushroom Stew";
  if (n("berry") >= 2) return "Starberry Compote";
  if (n("fish") && n("mushroom") && n("berry")) return "Campfire Hotpot";
  return "Cozy Camp Stew";
}

export interface StewUpdate {
  stew: StewState;
  /** What just happened: an ingredient went in, it came to the boil, a bowl was scooped, it went cold. */
  event: "add" | "ready" | "scoop" | "cold";
  sessionId: string;
}

// --- the picnic table -----------------------------------------------------------------------------

/** Skewers left on the picnic table for anyone to take (a plate each). */
export const PICNIC_PLATES = 4;
/** A plate left untouched this long is cleared (the raccoon, probably). */
export const PICNIC_STALE_S = 10 * 60;
export interface PicnicPlate {
  food: RoastFood;
  quality: RoastQuality;
  by: string;
}
export function parsePicnic(raw: string): PicnicPlate[] {
  if (!raw) return [];
  try {
    const plates = JSON.parse(raw);
    return Array.isArray(plates) ? plates : [];
  } catch {
    return [];
  }
}
