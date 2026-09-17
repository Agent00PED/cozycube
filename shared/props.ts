import type { MapId, SeatStyle, ToggleableKind } from "./types";

// Author-time config for each map's interactive furniture. The server loads this into
// ChairState/ToggleableState schema instances on room create and on every map change;
// clients only ever see the resulting synced state (see useColyseusRoom.ts), never this file.
export interface ChairConfig {
  propId: string;
  /** Where the character is snapped to when seated. */
  x: number;
  z: number;
  rotationY: number; // radians, direction the seated character faces
  style: SeatStyle;
  /** Where the character walks to before sitting. Defaults to the seat itself. Used to keep
   *  players from pathing through the furniture they are about to sit on. */
  approachX?: number;
  approachZ?: number;
}

export interface ToggleableConfig {
  propId: string;
  x: number;
  z: number;
  kind: ToggleableKind;
  color: string;
  defaultOn: boolean;
}

// World is 14x14 (see HALF in ProceduralRoom.tsx / WORLD_LIMIT in collision.ts).
export const MAP_CHAIRS: Record<MapId, ChairConfig[]> = {
  cozy_lounge: [
    // Battlestation — in front of the desk on the back-left wall, facing -X into the monitors
    { propId: "gaming_chair", x: -5.0, z: 1.8, rotationY: -Math.PI / 2, style: "gaming", approachX: -4.1, approachZ: 1.8 },
    // L-shape sofa: two seats on the long run (facing the TV, -Z) plus one on the return leg
    { propId: "sofa_left", x: -3.7, z: -3.0, rotationY: Math.PI, style: "pad", approachX: -3.7, approachZ: -1.9 },
    { propId: "sofa_right", x: -2.2, z: -3.0, rotationY: Math.PI, style: "pad", approachX: -2.2, approachZ: -1.9 },
    { propId: "sofa_corner", x: -4.9, z: -1.9, rotationY: Math.PI / 2, style: "pad", approachX: -3.8, approachZ: -1.5 },
    // Beanbag bridging the living zone and the middle of the room
    { propId: "beanbag", x: 1.0, z: -0.5, rotationY: Math.PI * 0.85, style: "pad", approachX: 1.6, approachZ: 0.4 },
  ],
  campfire_night: [
    // Log benches ringing the fire at a roomier radius than the old 10x10 layout
    { propId: "log_seat_s", x: 0, z: 2.6, rotationY: Math.PI, style: "log", approachX: 0, approachZ: 3.7 },
    { propId: "log_seat_w", x: -2.6, z: 0, rotationY: Math.PI / 2, style: "log", approachX: -3.7, approachZ: 0 },
    { propId: "log_seat_e", x: 2.6, z: 0, rotationY: -Math.PI / 2, style: "log", approachX: 3.7, approachZ: 0 },
    { propId: "log_seat_n", x: 0, z: -2.6, rotationY: 0, style: "log", approachX: 0, approachZ: -3.7 },
  ],
};

export const MAP_TOGGLEABLES: Record<MapId, ToggleableConfig[]> = {
  // mounted on the back-right wall, directly in the sofa's line of sight
  cozy_lounge: [{ propId: "wall_tv", x: -2.9, z: -6.85, kind: "tv", color: "#9ad1e8", defaultOn: true }],
  campfire_night: [{ propId: "campfire", x: 0, z: 0, kind: "campfire", color: "#ff8a3d", defaultOn: true }],
};
