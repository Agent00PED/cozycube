import type { MapId, SeatStyle, ToggleableKind } from "./types";

// Author-time config for each map's interactive furniture. The server loads this into
// ChairState/ToggleableState schema instances on room create and on every map change;
// clients only ever see the resulting synced state (see useColyseusRoom.ts) plus the approach
// points below, which are level design rather than runtime state.
//
// Invariant enforced by the layout check (scripts/checklayout.ts): every approach point sits
// OUTSIDE every collision box in collision.ts, with the 0.3 player radius included. Seats
// themselves are allowed inside their furniture's box — the server snaps you onto them.
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

// The world is 20x20 (HALF = 10). Indoors the two back walls run along x = -10 and z = -10
// (inner faces at -9.8), and the open sides are +X and +Z — the camera looks from that corner.
export const MAP_CHAIRS: Record<MapId, ChairConfig[]> = {
  cozy_lounge: [
    // --- Living room: L-sofa opening onto the middle of the room ---
    ...[-5.6, -4.2, -2.8].map((x, i) => ({
      propId: `sofa_${i + 1}`,
      x,
      z: -4.6,
      rotationY: FACE_NEG_Z,
      style: "pad" as const,
      approachX: x,
      approachZ: -3.0,
    })),
    { propId: "sofa_4", x: -7.0, z: -6.0, rotationY: FACE_POS_X, style: "pad", approachX: -7.0, approachZ: -3.2 },

    // --- Kitchen bar: three stools along the island ---
    ...[3.9, 5.1, 6.3].map((x, i) => ({
      propId: `stool_${i + 1}`,
      x,
      z: -5.0,
      rotationY: FACE_NEG_Z,
      style: "stool" as const,
      sitY: 0.34,
      approachX: x,
      approachZ: -4.2,
    })),

    // --- Dining set: four chairs round the table, bridging kitchen and living room ---
    { propId: "dining_1", x: 2.6, z: -1.4, rotationY: FACE_POS_X, style: "wood", sitY: 0.04, approachX: 1.4, approachZ: -1.4 },
    { propId: "dining_2", x: 5.0, z: -1.4, rotationY: FACE_NEG_X, style: "wood", sitY: 0.04, approachX: 6.2, approachZ: -1.4 },
    { propId: "dining_3", x: 3.8, z: -2.6, rotationY: FACE_POS_Z, style: "wood", sitY: 0.04, approachX: 3.8, approachZ: -3.7 },
    { propId: "dining_4", x: 3.8, z: -0.2, rotationY: FACE_NEG_Z, style: "wood", sitY: 0.04, approachX: 3.8, approachZ: 0.9 },

    // --- Gamer corner ---
    { propId: "gamer_chair_1", x: -8.1, z: -7.2, rotationY: FACE_POS_Z, style: "gaming", approachX: -8.1, approachZ: -5.9 },

    // --- Vinyl nook: an armchair and two floor cushions by the record player ---
    { propId: "armchair_1", x: -7.6, z: 4.2, rotationY: FACE_POS_X, style: "armchair", sitY: 0.03, approachX: -6.2, approachZ: 4.2 },
    { propId: "cushion_1", x: -5.4, z: 5.9, rotationY: -2.2, style: "pad", approachX: -4.4, approachZ: 6.7 },
    { propId: "cushion_2", x: -4.6, z: 4.3, rotationY: -1.9, style: "pad", approachX: -3.6, approachZ: 4.8 },

    // --- Balcony deck: loungers looking out over the edge ---
    { propId: "deckchair_1", x: 7.6, z: 4.2, rotationY: FACE_POS_X, style: "deckchair", sitY: -0.06, approachX: 6.3, approachZ: 4.2 },
    { propId: "deckchair_2", x: 7.6, z: 6.6, rotationY: FACE_POS_X, style: "deckchair", sitY: -0.06, approachX: 6.3, approachZ: 6.6 },
  ],

  campfire_night: [
    // Six log benches ringing the fire.
    ...seatRing("log", 0, 0, 2.8, 4.1, 6, "log"),
    // Camp chairs a little further back, out of the smoke.
    { propId: "camp_chair_1", x: -3.6, z: 3.4, rotationY: facing(-3.6, 3.4, 0, 0), style: "deckchair", sitY: -0.06, approachX: -4.6, approachZ: 4.4 },
    { propId: "camp_chair_2", x: 3.6, z: 3.4, rotationY: facing(3.6, 3.4, 0, 0), style: "deckchair", sitY: -0.06, approachX: 4.6, approachZ: 4.4 },
    // Stargazing blanket: you lie down here instead of sitting.
    { propId: "blanket_1", x: 5.2, z: -3.4, rotationY: FACE_POS_Z, style: "blanket", approachX: 5.2, approachZ: -2.1 },
    { propId: "blanket_2", x: 6.2, z: -3.4, rotationY: FACE_POS_Z, style: "blanket", approachX: 6.2, approachZ: -2.1 },
  ],

  sunset_beach: [
    // --- Tiki bar: four stools along the counter ---
    ...[-2.4, -1.2, 0, 1.2].map((x, i) => ({
      propId: `bar_stool_${i + 1}`,
      x,
      z: -4.6,
      rotationY: FACE_NEG_Z,
      style: "stool" as const,
      sitY: 0.34,
      approachX: x,
      approachZ: -3.3,
    })),
    // --- Sun loungers under the striped parasol ---
    { propId: "lounger_1", x: -6.4, z: 1.0, rotationY: FACE_POS_Z, style: "deckchair", sitY: -0.06, approachX: -5.1, approachZ: 1.0 },
    { propId: "lounger_2", x: -6.4, z: 3.2, rotationY: FACE_POS_Z, style: "deckchair", sitY: -0.06, approachX: -5.1, approachZ: 3.2 },
    // --- Driftwood logs round the beach bonfire (marshmallows work here too) ---
    // NOTE: propIds key the global APPROACH_POINTS table, so they must be unique across ALL
    // maps — hence "driftwood" rather than reusing the campfire's "log".
    ...seatRing("driftwood", 5.0, -1.0, 1.9, 3.1, 3, "log"),
    // --- The end of the pier: sit with your feet over the water ---
    { propId: "pier_seat_1", x: 1.6, z: 7.4, rotationY: FACE_POS_Z, style: "pad", approachX: 1.6, approachZ: 6.2 },
    { propId: "pier_seat_2", x: 2.8, z: 7.4, rotationY: FACE_POS_Z, style: "pad", approachX: 2.8, approachZ: 6.2 },
  ],
};

export const MAP_TOGGLEABLES: Record<MapId, ToggleableConfig[]> = {
  cozy_lounge: [
    { propId: "tv", x: -4.2, y: 1.62, z: -9.72, kind: "tv", color: "#9ad1e8", defaultOn: true },
    { propId: "lamp_living", x: -1.3, z: -4.9, kind: "lamp", color: "#ffcf8a", defaultOn: true },
    { propId: "espresso", x: 2.4, y: 0.95, z: -9.25, kind: "espresso", color: "#ffb36b", defaultOn: true, approachX: 2.4, approachZ: -8.0 },
    { propId: "arcade_1", x: -7.4, z: -9.3, kind: "arcade", color: "#ff4fd8", defaultOn: true, approachX: -7.4, approachZ: -8.2 },
    { propId: "arcade_2", x: -6.1, z: -9.3, kind: "arcade", color: "#4fd8ff", defaultOn: false, approachX: -6.1, approachZ: -8.2 },
    { propId: "desk_lamp_den", x: -9.0, y: 0.66, z: -7.8, kind: "desk_lamp", color: "#b18cff", defaultOn: true },
    { propId: "lamp_vinyl", x: -8.4, z: 6.0, kind: "lamp", color: "#ffc47a", defaultOn: true },
    { propId: "lantern_balcony", x: 8.9, z: 5.4, kind: "lantern", color: "#ffbe6b", defaultOn: true },
  ],

  campfire_night: [
    { propId: "campfire", x: 0, z: 0, kind: "campfire", color: "#ff8a3d", defaultOn: true },
    // Warm lantern gold, never the greenish white it used to read as against the night grade.
    { propId: "lantern_east", x: 4.4, y: 0.42, z: -2.2, kind: "lantern", color: "#ffa64d", defaultOn: true },
    { propId: "lantern_west", x: -4.4, y: 0.42, z: 2.2, kind: "lantern", color: "#ffa64d", defaultOn: true },
  ],

  sunset_beach: [
    // The bonfire the driftwood logs ring — same fire, so roasting works on the beach too.
    { propId: "bonfire", x: 5.0, z: -1.0, kind: "campfire", color: "#ff8a3d", defaultOn: true },
    { propId: "lamp_bar", x: 0, y: 2.62, z: -5.9, kind: "lamp", color: "#ffd08a", defaultOn: true },
    { propId: "beach_bar_tap", x: -1.1, y: 1.05, z: -5.95, kind: "espresso", color: "#ffb36b", defaultOn: true, approachX: -1.1, approachZ: -3.3 },
    { propId: "tiki_east", x: 7.4, y: 0.5, z: 3.0, kind: "lantern", color: "#ff9a4a", defaultOn: true },
    { propId: "tiki_west", x: -8.0, y: 0.5, z: -1.6, kind: "lantern", color: "#ff9a4a", defaultOn: true },
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
