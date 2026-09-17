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

// How a seat draws itself. "pad" seats have no geometry of their own — the visible furniture
// is already drawn by ProceduralRoom (sofa cushions, beanbag), so the seat contributes only an
// invisible click target and a snap point.
export type SeatStyle = "gaming" | "log" | "pad";

// Runtime (synced) state of an interactive prop — mirrors the server's ChairState/ToggleableState schema.
export interface ChairSyncState {
  propId: string;
  x: number;
  z: number;
  rotationY: number;
  style: SeatStyle;
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
// The client is visually authoritative while walking, so it reports the position its own
// prediction arrived at. The server validates that position (reachable since the last report,
// not inside an obstacle, inside the world bounds) rather than re-integrating movement on its
// own clock — two independent integrations is exactly what produced the rollback jitter.
export interface MoveMessage {
  dirX: number;
  dirZ: number;
  x: number;
  z: number;
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

// Sent when the player clicks open floor while seated — stand up, then walk to the click.
export interface StandUpMessage {
  _?: never;
}

export interface TogglePropMessage {
  propId: string;
}
