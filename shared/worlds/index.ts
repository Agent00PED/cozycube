import type { MapId } from "../types";

// The world table the HUD, navigation and state stores read. Every world is listed here; only
// `built` ones have a scene yet.

export type WorldId = "lounge" | "campfire" | "beach" | "onsen" | "casino" | "gym" | "arcade" | "gamingcafe";

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

// In the fast-travel grid's order (WORLD_ROWS below, and shared/types MAP_IDS).
export const WORLDS: Record<WorldId, WorldConfig> = {
  lounge: { id: "lounge", mapId: "cozy_lounge", name: "Lounge", icon: "🛋️", tagline: "Fireplace, kitchen and Mochi", size: 15, built: true },
  campfire: { id: "campfire", mapId: "campfire_night", name: "Campfire", icon: "🔥", tagline: "Starlight, embers, and fishing", size: 16, built: true },
  beach: { id: "beach", mapId: "sunset_beach", name: "Beach Bar", icon: "🏖️", tagline: "Sunset drinks and volleyball", size: 28, built: false },
  onsen: { id: "onsen", mapId: "japanese_onsen", name: "Onsen", icon: "♨️", tagline: "Hot springs and cherry blossoms", size: 26, built: false },
  casino: { id: "casino", mapId: "velvet_casino", name: "Casino", icon: "🎰", tagline: "Roulette, cards and slots", size: 26, built: false },
  gym: { id: "gym", mapId: "boxing_ring", name: "Boxing Gym", icon: "🥊", tagline: "Gloves up in the ring", size: 24, built: false },
  arcade: { id: "arcade", mapId: "retro_arcade", name: "Arcade", icon: "🕹️", tagline: "Claw machines and high scores", size: 24, built: false },
  gamingcafe: { id: "gamingcafe", mapId: "gaming_cafe", name: "Gaming Cafe", icon: "🖥️", tagline: "PC Bang, ramen, and chill", size: 24, built: false },
};

/** The fast-travel grid: two worlds a row, each row a theme. */
export const WORLD_ROWS: readonly { theme: string; worlds: readonly [WorldId, WorldId] }[] = [
  { theme: "Cozy Living", worlds: ["lounge", "campfire"] },
  { theme: "Vacation & Spa", worlds: ["beach", "onsen"] },
  { theme: "Action & Play", worlds: ["casino", "gym"] },
  { theme: "Gaming & Cyber", worlds: ["arcade", "gamingcafe"] },
];

/** The world whose scene is built, and the one everyone spawns into. */
export const ACTIVE_WORLD: WorldId = "lounge";
export const WORLD_IDS = Object.keys(WORLDS) as WorldId[];
