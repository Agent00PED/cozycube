import type { MapId } from "../types";

// The world table the HUD, navigation and state stores read. Every world is listed here; only
// `built` ones have a scene yet.

export type WorldId = "lounge" | "gym" | "arcade" | "onsen" | "casino" | "beach" | "campfire";

export interface WorldConfig {
  id: WorldId;
  /** The id the room state, props and collision are keyed by. */
  mapId: MapId;
  name: string;
  icon: string;
  tagline: string;
  /** Width and depth of the floor, in world units. */
  size: number;
  /** Whether a scene has been built for it. */
  built: boolean;
}

export const WORLDS: Record<WorldId, WorldConfig> = {
  lounge: { id: "lounge", mapId: "cozy_lounge", name: "Lounge", icon: "🛋️", tagline: "Fireplace, kitchen and Mochi", size: 15, built: true },
  gym: { id: "gym", mapId: "boxing_ring", name: "Boxing Gym", icon: "🥊", tagline: "Coming soon", size: 24, built: false },
  arcade: { id: "arcade", mapId: "retro_arcade", name: "Arcade", icon: "🕹️", tagline: "Coming soon", size: 24, built: false },
  onsen: { id: "onsen", mapId: "japanese_onsen", name: "Onsen", icon: "♨️", tagline: "Coming soon", size: 26, built: false },
  casino: { id: "casino", mapId: "velvet_casino", name: "Casino", icon: "🎰", tagline: "Coming soon", size: 26, built: false },
  beach: { id: "beach", mapId: "sunset_beach", name: "Beach Bar", icon: "🏖️", tagline: "Coming soon", size: 28, built: false },
  campfire: { id: "campfire", mapId: "campfire_night", name: "Campfire", icon: "🔥", tagline: "Coming soon", size: 28, built: false },
};

/** The world whose scene is built, and the one everyone spawns into. */
export const ACTIVE_WORLD: WorldId = "lounge";
export const WORLD_IDS = Object.keys(WORLDS) as WorldId[];
