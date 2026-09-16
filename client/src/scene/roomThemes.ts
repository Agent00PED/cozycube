import type { MapId } from "@shared/types";

// Visual-only palette per theme — purely client-side, unrelated to shared/ game data.
export interface RoomTheme {
  floor: string;
  wall: string;
  ambient: string;
  directional: string;
  ambientIntensity: number;
  directionalIntensity: number;
}

export const ROOM_THEMES: Record<MapId, RoomTheme> = {
  cozy_lounge: {
    floor: "#c9a876", // warm wood floor
    wall: "#e8dcc8", // soft cream wall
    ambient: "#fff1d8",
    directional: "#fff8ec", // gentle daylight through the window
    ambientIntensity: 0.6,
    directionalIntensity: 1.2,
  },
  campfire_night: {
    floor: "#1c2e2a", // dark grass
    wall: "#0c1420", // night sky void beyond the tree line
    ambient: "#1a2540", // deep blue night ambient
    directional: "#2a3a5c", // faint moonlight, warmth comes from the campfire's own point light
    ambientIntensity: 0.35,
    directionalIntensity: 0.3,
  },
};
