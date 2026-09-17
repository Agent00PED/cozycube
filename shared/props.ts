import type { MapId, SeatStyle, ToggleableKind } from "./types";

// Author-time config for each map's interactive furniture. The server loads this into
// ChairState/ToggleableState schema instances on room create and on every map change;
// clients only ever see the resulting synced state (see useColyseusRoom.ts) plus the approach
// points below, which are level design rather than runtime state.
//
// Invariant enforced by hand (and worth re-checking whenever furniture moves): every approach
// point sits OUTSIDE every collision box in collision.ts, with the 0.3 player radius included.
// Seats themselves are allowed inside their furniture's box — the server snaps you onto them.
export interface ChairConfig {
  propId: string;
  /** Where the character is snapped to when seated. */
  x: number;
  z: number;
  rotationY: number; // radians, direction the seated character faces
  style: SeatStyle;
  /** Vertical lift while seated: 0 for sofa-height seats, more for bar stools. */
  sitY?: number;
  /** Where the character walks to before sitting. */
  approachX: number;
  approachZ: number;
}

export interface ToggleableConfig {
  propId: string;
  x: number;
  y?: number;
  z: number;
  kind: ToggleableKind;
  color: string;
  defaultOn: boolean;
  /** Only needed for walk-up props (see isWalkUpProp). */
  approachX?: number;
  approachZ?: number;
}

/** Direction a seat at (x, z) should face to look at (cx, cz). */
function facing(x: number, z: number, cx: number, cz: number): number {
  return Math.atan2(cx - x, cz - z);
}

/** Seats evenly spaced on a circle, all facing its centre, approached from further out. */
function seatRing(
  prefix: string,
  cx: number,
  cz: number,
  radius: number,
  approachRadius: number,
  count: number,
  style: SeatStyle,
  startAngle = 0
): ChairConfig[] {
  return Array.from({ length: count }, (_, i) => {
    const a = startAngle + (i / count) * Math.PI * 2;
    const x = cx + Math.cos(a) * radius;
    const z = cz + Math.sin(a) * radius;
    return {
      propId: `${prefix}_${i + 1}`,
      x,
      z,
      rotationY: facing(x, z, cx, cz),
      style,
      approachX: cx + Math.cos(a) * approachRadius,
      approachZ: cz + Math.sin(a) * approachRadius,
    };
  });
}

const FACE_NEG_Z = Math.PI;
const FACE_POS_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;
const FACE_POS_Z = 0;

// World is 28x28 (HALF = 14). Back walls run along x = -14 and z = -14.
export const MAP_CHAIRS: Record<MapId, ChairConfig[]> = {
  cozy_lounge: [
    // --- Zone 1: Grand Living — L-sofa facing the 75" wall TV ---
    ...[-4.4, -2.35, -0.3].map((x, i) => ({
      propId: `sofa_${i + 1}`,
      x,
      z: -5.5,
      rotationY: FACE_NEG_Z,
      style: "pad" as const,
      approachX: x,
      approachZ: -4.1,
    })),
    ...[-7.2, -8.8].map((z, i) => ({
      propId: `sofa_${i + 4}`,
      x: -5.3,
      z,
      rotationY: FACE_POS_X,
      style: "pad" as const,
      approachX: -3.9,
      approachZ: z,
    })),

    // --- Zone 2: Cafe kitchen — four bar stools along the island ---
    ...[6.7, 7.7, 8.7, 9.7].map((x, i) => ({
      propId: `stool_${i + 1}`,
      x,
      z: -7.05,
      rotationY: FACE_NEG_Z,
      style: "stool" as const,
      sitY: 0.34,
      approachX: x,
      approachZ: -5.9,
    })),

    // --- Zone 3: Gamer den — two streamer desks + a beanbag couch facing the arcades ---
    { propId: "gamer_chair_1", x: -11.9, z: -9.4, rotationY: FACE_NEG_X, style: "gaming", approachX: -10.7, approachZ: -9.4 },
    { propId: "gamer_chair_2", x: -11.9, z: -5.4, rotationY: FACE_NEG_X, style: "gaming", approachX: -10.7, approachZ: -5.4 },
    { propId: "den_beanbag_1", x: -9.6, z: -2.6, rotationY: FACE_NEG_Z, style: "pad", approachX: -9.6, approachZ: -1.4 },
    { propId: "den_beanbag_2", x: -8.0, z: -2.6, rotationY: FACE_NEG_Z, style: "pad", approachX: -8.0, approachZ: -1.4 },

    // --- Zone 4: Library — two armchairs and a desk chair ---
    { propId: "armchair_1", x: -11.6, z: 5.4, rotationY: FACE_POS_X, style: "armchair", sitY: 0.03, approachX: -10.3, approachZ: 5.4 },
    { propId: "armchair_2", x: -11.6, z: 8.4, rotationY: FACE_POS_X, style: "armchair", sitY: 0.03, approachX: -10.3, approachZ: 8.4 },
    { propId: "study_chair", x: -8.6, z: 10.5, rotationY: FACE_POS_Z, style: "wood", sitY: 0.04, approachX: -8.6, approachZ: 9.2 },

    // --- Zone 5: Balcony garden — deck chairs looking out over the edge ---
    { propId: "deckchair_1", x: 9.6, z: 1.2, rotationY: FACE_POS_X, style: "deckchair", sitY: -0.06, approachX: 8.2, approachZ: 1.2 },
    { propId: "deckchair_2", x: 9.6, z: 3.8, rotationY: FACE_POS_X, style: "deckchair", sitY: -0.06, approachX: 8.2, approachZ: 3.8 },

    // --- Social circle between the zones: floor cushions around a pouf table ---
    ...seatRing("cushion", 0, 6, 2.2, 3.4, 4, "pad", Math.PI / 4),
  ],
  campfire_night: [
    // Eight log benches ringing the fire — room for the whole gang.
    ...seatRing("log", 0, 0, 3.4, 4.7, 8, "log"),
    // Stargazing blanket: you lie down here instead of sitting.
    { propId: "blanket_1", x: 6.0, z: 4.3, rotationY: FACE_POS_Z, style: "blanket", approachX: 6.0, approachZ: 5.4 },
    { propId: "blanket_2", x: 7.0, z: 4.3, rotationY: FACE_POS_Z, style: "blanket", approachX: 7.0, approachZ: 5.4 },
  ],
};

export const MAP_TOGGLEABLES: Record<MapId, ToggleableConfig[]> = {
  cozy_lounge: [
    { propId: "tv", x: -1.5, y: 1.9, z: -13.88, kind: "tv", color: "#9ad1e8", defaultOn: true },
    { propId: "lamp_living", x: 2.2, z: -5.5, kind: "lamp", color: "#ffcf8a", defaultOn: true },
    { propId: "espresso", x: 5.2, y: 0.95, z: -13.35, kind: "espresso", color: "#ffb36b", defaultOn: true, approachX: 5.2, approachZ: -12.0 },
    { propId: "arcade_1", x: -11.0, z: -13.35, kind: "arcade", color: "#ff4fd8", defaultOn: true, approachX: -11.0, approachZ: -11.9 },
    { propId: "arcade_2", x: -9.0, z: -13.35, kind: "arcade", color: "#4fd8ff", defaultOn: false, approachX: -9.0, approachZ: -11.9 },
    { propId: "desk_lamp_den", x: -13.2, y: 0.66, z: -10.4, kind: "desk_lamp", color: "#b18cff", defaultOn: true },
    { propId: "lamp_library", x: -12.8, z: 6.9, kind: "lamp", color: "#ffc47a", defaultOn: true },
    { propId: "desk_lamp_library", x: -9.3, y: 0.82, z: 11.8, kind: "desk_lamp", color: "#ffd89a", defaultOn: false },
    { propId: "lantern_balcony", x: 12.4, z: 2.5, kind: "lantern", color: "#ffbe6b", defaultOn: true },
  ],
  campfire_night: [
    { propId: "campfire", x: 0, z: 0, kind: "campfire", color: "#ff8a3d", defaultOn: true },
    { propId: "lantern_east", x: 5.2, y: 0.42, z: -2.4, kind: "lantern", color: "#ffc46b", defaultOn: true },
    { propId: "lantern_west", x: -5.2, y: 0.42, z: 2.4, kind: "lantern", color: "#ffc46b", defaultOn: true },
  ],
};

/** Flattened approach points for every walk-up seat and prop, keyed by propId. */
export const APPROACH_POINTS: Record<string, { x: number; z: number }> = (() => {
  const out: Record<string, { x: number; z: number }> = {};
  for (const list of Object.values(MAP_CHAIRS)) {
    for (const c of list) out[c.propId] = { x: c.approachX, z: c.approachZ };
  }
  for (const list of Object.values(MAP_TOGGLEABLES)) {
    for (const t of list) {
      if (t.approachX !== undefined && t.approachZ !== undefined) out[t.propId] = { x: t.approachX, z: t.approachZ };
    }
  }
  return out;
})();
