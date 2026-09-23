import type { MapId } from "../types";

// The worlds: one short id per hangout, the map id the server and the rest of the shared
// code know it by, a name for the UI, and its bounds. UI headers, navigation and the state
// stores read this table, so every world is listed here whether or not its scene is built.
//
// "lounge" is the active, fully built world (shared/worlds/lounge.ts holds its floor plan and
// client/src/scene/LoungeWorld.tsx draws it). The others keep their own scene files and
// layouts; this table is the one place their identity is written down.

export type WorldId = "lounge" | "gym" | "arcade" | "onsen" | "casino" | "beach" | "campfire";

export interface WorldConfig {
  id: WorldId;
  /** The id the room state, props, collision and themes are keyed by. */
  mapId: MapId;
  name: string;
  icon: string;
  tagline: string;
  /** Half the world's width: the floor spans -half..half on both axes. */
  half: number;
  /** Two solid back walls and an open front (indoors), or a floating island (outdoors). */
  indoor: boolean;
}

export const WORLDS: Record<WorldId, WorldConfig> = {
  lounge: { id: "lounge", mapId: "cozy_lounge", name: "Lounge", icon: "🛋️", tagline: "Fireplace, games and tea", half: 7.5, indoor: true },
  gym: { id: "gym", mapId: "boxing_ring", name: "Boxing Gym", icon: "🥊", tagline: "Slapstick bouts and bleachers", half: 12, indoor: true },
  arcade: { id: "arcade", mapId: "retro_arcade", name: "Arcade", icon: "🕹️", tagline: "Gachapon, the claw and old cabinets", half: 12, indoor: true },
  onsen: { id: "onsen", mapId: "japanese_onsen", name: "Onsen", icon: "♨️", tagline: "Hot spring, tea and a wishing well", half: 13, indoor: false },
  casino: { id: "casino", mapId: "velvet_casino", name: "Casino", icon: "🎰", tagline: "Roulette, blackjack and slots", half: 13, indoor: true },
  beach: { id: "beach", mapId: "sunset_beach", name: "Beach Bar", icon: "🏖️", tagline: "Surf, fishing and tiki drinks", half: 14, indoor: false },
  campfire: { id: "campfire", mapId: "campfire_night", name: "Campfire", icon: "🔥", tagline: "A valley of tents and stars", half: 14, indoor: false },
};

/** The world whose scene is the reference build (and the one everyone spawns into). */
export const ACTIVE_WORLD: WorldId = "lounge";

export const WORLD_IDS = Object.keys(WORLDS) as WorldId[];

/** The world a map id belongs to. */
export function worldOfMap(mapId: MapId): WorldConfig {
  const found = WORLD_IDS.map((id) => WORLDS[id]).find((w) => w.mapId === mapId);
  if (!found) throw new Error(`no world is registered for map "${mapId}"`);
  return found;
}
