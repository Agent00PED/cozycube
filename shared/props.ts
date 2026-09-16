import type { MapId, ToggleableKind } from "./types";

// Author-time config for each map's interactive furniture. The server loads this into
// ChairState/ToggleableState schema instances on room create and on every map change;
// clients only ever see the resulting synced state (see useColyseusRoom.ts), never this file.
export interface ChairConfig {
  propId: string;
  x: number;
  z: number;
  rotationY: number; // radians, direction the seated character faces
}

export interface ToggleableConfig {
  propId: string;
  x: number;
  z: number;
  kind: ToggleableKind;
  color: string;
  defaultOn: boolean;
}

export const MAP_CHAIRS: Record<MapId, ChairConfig[]> = {
  // sits just in front of the desk on the back-left wall, facing -X into the monitors
  cozy_lounge: [{ propId: "gaming_chair", x: -3.1, z: 1.4, rotationY: -Math.PI / 2 }],
  campfire_night: [{ propId: "log_seat", x: 0, z: 1.6, rotationY: Math.PI }],
};

export const MAP_TOGGLEABLES: Record<MapId, ToggleableConfig[]> = {
  // mounted on the back-right wall, directly in the sofa's line of sight
  cozy_lounge: [{ propId: "wall_tv", x: -2.5, z: -4.85, kind: "tv", color: "#9ad1e8", defaultOn: true }],
  campfire_night: [{ propId: "campfire", x: 0, z: 0, kind: "campfire", color: "#ff8a3d", defaultOn: true }],
};
