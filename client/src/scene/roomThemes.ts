import type { MapId } from "@shared/types";

// Visual-only palette per theme — purely client-side, unrelated to shared/ game data.
export interface RoomTheme {
  floor: string;
  wall: string;
  ambient: string;
  directional: string;
}

export const ROOM_THEMES: Record<MapId, RoomTheme> = {
  cozy_bedroom: { floor: "#5a4632", wall: "#3a2f22", ambient: "#6a5a4a", directional: "#fff1d8" },
  cyber_lounge: { floor: "#12121f", wall: "#0b0b16", ambient: "#2a2a55", directional: "#c9d9ff" },
  chill_lounge: { floor: "#241a28", wall: "#170f1c", ambient: "#4a2a4a", directional: "#ffd8ee" },
};
