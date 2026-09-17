import type { MapId } from "@shared/types";

// Visual-only palette per theme — purely client-side, unrelated to shared/ game data.
export interface RoomTheme {
  floor: string;
  wall: string;
  /** Side wall of the floating diorama slab (the "cut" you see under the floor). */
  edge: string;
  /** Thin band along the very top of the slab edge — soil line / wood grain highlight. */
  edgeTop: string;
  ambient: string;
  directional: string;
  ambientIntensity: number;
  directionalIntensity: number;
}

export const ROOM_THEMES: Record<MapId, RoomTheme> = {
  cozy_lounge: {
    floor: "#d9a86c", // honey oak
    wall: "#f2e8d8", // warm off-white
    edge: "#4a2f1d", // rich dark walnut
    edgeTop: "#6b452b",
    ambient: "#fff1d8",
    directional: "#fff8ec", // gentle daylight through the window
    ambientIntensity: 0.6,
    directionalIntensity: 1.2,
  },
  campfire_night: {
    floor: "#41684f", // grass — light enough to still read as ground under a night grade
    wall: "#0c1420", // unused outdoors (the clearing has a tree/rock ring instead of walls)
    edge: "#3b2a1c", // cross-section of dark earth
    edgeTop: "#2f4a38", // topsoil line, tinted by the grass above it
    // Light COLOR multiplies light INTENSITY, so a dark navy hex here cannot be rescued by
    // turning intensity up; the hue has to stay midnight-navy while the value stays high.
    ambient: "#9db4e8",
    directional: "#b9cbf0", // moonlight; the warm key light still comes from the campfire itself
    ambientIntensity: 1.25,
    directionalIntensity: 1,
  },
};
