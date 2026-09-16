// Shared between client and server — keep this file framework-agnostic (no THREE/Colyseus imports).

export interface PlayerState {
  sessionId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  x: number;
  y: number; // height, mostly fixed for a flat diorama room
  z: number;
  dirX: number;
  dirZ: number;
  color: string; // "#rrggbb"
  sitting: boolean;
  sitRotationY: number; // facing direction snapped from the chair while sitting
  connected: boolean;
}

export type MapId = "cozy_lounge" | "campfire_night";

export type ToggleableKind = "tv" | "lamp" | "campfire";

// Runtime (synced) state of an interactive prop — mirrors the server's ChairState/ToggleableState schema.
export interface ChairSyncState {
  propId: string;
  x: number;
  z: number;
  rotationY: number;
  occupiedBy: string; // sessionId, or "" if free
}

export interface ToggleableSyncState {
  propId: string;
  x: number;
  z: number;
  kind: ToggleableKind;
  color: string; // "#rrggbb", the glow color when on
  on: boolean;
}

// --- client -> server messages ---
export interface MoveMessage {
  dirX: number;
  dirZ: number;
  seq: number;
}

export interface SetColorMessage {
  color: string;
}

export interface ChangeMapMessage {
  mapId: MapId;
}

export interface InteractChairMessage {
  chairId: string;
}

export interface TogglePropMessage {
  propId: string;
}
