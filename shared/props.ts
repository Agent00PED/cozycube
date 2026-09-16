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
  cozy_bedroom: [{ propId: "reading_chair", x: -2, z: -3, rotationY: 0 }],
  cyber_lounge: [{ propId: "neon_stool", x: 2, z: -1, rotationY: Math.PI }],
  chill_lounge: [{ propId: "bar_stool", x: -1.6, z: 0, rotationY: -Math.PI / 2 }],
};

export const MAP_TOGGLEABLES: Record<MapId, ToggleableConfig[]> = {
  cozy_bedroom: [{ propId: "bedside_lamp", x: -3.6, z: 1.6, kind: "lamp", color: "#ffb37a", defaultOn: true }],
  cyber_lounge: [{ propId: "wall_tv", x: 0, z: -3.55, kind: "tv", color: "#22e6ff", defaultOn: true }],
  chill_lounge: [{ propId: "hanging_lamp", x: 3, z: -2, kind: "lamp", color: "#ff2ee6", defaultOn: true }],
};
