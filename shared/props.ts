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
  cozy_lounge: [{ propId: "gaming_chair", x: 3.2, z: -2.4, rotationY: Math.PI }],
  campfire_night: [{ propId: "log_seat", x: 0, z: 1.6, rotationY: Math.PI }],
};

export const MAP_TOGGLEABLES: Record<MapId, ToggleableConfig[]> = {
  cozy_lounge: [{ propId: "wall_tv", x: -3, z: -4.6, kind: "tv", color: "#9ad1e8", defaultOn: true }],
  campfire_night: [{ propId: "campfire", x: 0, z: 0, kind: "campfire", color: "#ff8a3d", defaultOn: true }],
};
