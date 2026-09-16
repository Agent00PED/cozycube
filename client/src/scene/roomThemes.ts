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
    floor: "#41684f", // grass — light enough to still read as ground under a night grade
    wall: "#0c1420", // unused outdoors (the clearing has a tree/rock ring instead of walls)
    // Light COLOR multiplies light INTENSITY, so a dark navy hex here cannot be rescued by
    // turning intensity up; the hue has to stay midnight-navy while the value stays high.
    ambient: "#9db4e8",
    directional: "#b9cbf0", // moonlight; the warm key light still comes from the campfire itself
    ambientIntensity: 1.25,
    directionalIntensity: 1,
  },
};
