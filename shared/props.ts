import type { MapId, SeatStyle, ToggleableKind } from "./types";
import { BOXING_RING, SPARKLE_SPOTS, poseForSeat } from "./types";
import { CUSHIONS, STYLE_CUSHION, seatAnchorY, type CushionId } from "./seats";
import { walkY } from "./collision";

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
  /**
   * Which cushion the seat is drawn on (see shared/seats.ts). Styles that ChairProp draws
   * default to their own cushion; "pad" seats drawn by the worlds must name theirs.
   */
  cushion?: CushionId;
  /**
   * Vertical offset of the seated avatar. NEVER authored: filled in by `anchored()` below from
   * the cushion's bounding box, so it can't drift from the geometry.
   */
  sitY: number;
  /** Where the character walks to before sitting. */
  approachX: number;
  approachZ: number;
}

/** A ChairConfig as written by hand: everything but the derived anchor. */
type SeatSpec = Omit<ChairConfig, "sitY">;

/**
 * Derives each seat's anchor height from its cushion (shared/seats.ts), on top of whatever the
 * walk surface does there (the sunken pit, the VIP platform, the bluff: shared/collision.ts).
 */
function anchored(mapId: MapId, seats: SeatSpec[]): ChairConfig[] {
  return seats.map((seat) => {
    const cushion = seat.cushion ?? (seat.style === "pad" ? undefined : STYLE_CUSHION[seat.style]);
    if (!cushion) throw new Error(`seat ${seat.propId}: a "pad" seat must name the cushion it sits on`);
    return { ...seat, cushion, sitY: seatAnchorY(CUSHIONS[cushion], poseForSeat(seat.style)) + walkY(mapId, seat.x, seat.z) };
  });
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
  /** Light strength multiplier for this one prop (default 1) — static art direction, so it is
   *  read from here by the client rather than synced. */
  intensity?: number;
  /** Which way the prop faces (radians about Y); static art direction like intensity. */
  rotationY?: number;
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
): SeatSpec[] {
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

/** Centre of the stargazing blanket in the campfire clearing (CampfireWorld draws it here). */
export const BLANKET = { x: 5.9, z: -1.55 };

const FACE_NEG_Z = Math.PI;
const FACE_POS_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;
const FACE_POS_Z = 0;

// The world is 20x20 (HALF = 10). Indoors the two back walls run along x = -10 and z = -10
// (inner faces at -9.8), and the open sides are +X and +Z — the camera looks from that corner.
/** The reading & tea cluster in the lounge's front-left wing: everything gathers round here. */
export const TEA_TABLE = { x: -4.4, z: 5.4 };

export const MAP_CHAIRS: Record<MapId, ChairConfig[]> = {
  cozy_lounge: anchored("cozy_lounge", [
    // --- Living room, the heart of the floor: L-sofa facing the TV on the slatted screen ---
    // Approached from the strip between the sofa and the coffee table. The seats sit a little
    // forward of the backrest (which stands at z 1.36) so nobody's shoulders go through it.
    ...[-4.4, -3.0, -1.6].map((x, i) => ({
      propId: `sofa_${i + 1}`,
      x,
      z: 0.95,
      rotationY: FACE_NEG_Z,
      style: "pad" as const,
      cushion: "loungeSofa" as const,
      approachX: x,
      approachZ: 0.0,
    })),
    { propId: "sofa_4", x: -5.55, z: -0.6, rotationY: FACE_POS_X, style: "pad", cushion: "loungeSofa", approachX: -4.6, approachZ: -0.3 },
    { propId: "armchair_2", x: 0.5, z: -1.1, rotationY: FACE_NEG_X, style: "armchair", approachX: -0.4, approachZ: -0.3 },

    // --- Kitchen bar: three stools along the island ---
    ...[3.9, 5.1, 6.3].map((x, i) => ({
      propId: `stool_${i + 1}`,
      x,
      z: -5.0,
      rotationY: FACE_NEG_Z,
      style: "stool" as const,
      approachX: x,
      approachZ: -4.2,
    })),

    // --- Dining set: four chairs round the table, bridging kitchen and living room ---
    // Farmhouse table running on from the island: two chairs each side.
    { propId: "dining_1", x: 0.7, z: -5.1, rotationY: FACE_NEG_Z, style: "wood", approachX: 0.7, approachZ: -4.3 },
    { propId: "dining_2", x: 1.9, z: -5.1, rotationY: FACE_NEG_Z, style: "wood", approachX: 1.9, approachZ: -4.3 },
    { propId: "dining_3", x: 0.7, z: -7.3, rotationY: FACE_POS_Z, style: "wood", approachX: 0.2, approachZ: -8.0 },
    { propId: "dining_4", x: 1.9, z: -7.3, rotationY: FACE_POS_Z, style: "wood", approachX: 1.4, approachZ: -8.0 },

    // --- Console lounge: two beanbags turned to the little screen in front of the bookcase ---
    { propId: "beanbag_1", x: -3.3, z: -7.3, rotationY: FACE_NEG_Z, style: "pad", cushion: "beanbag", approachX: -3.3, approachZ: -6.2 },
    { propId: "beanbag_2", x: -1.6, z: -7.3, rotationY: FACE_NEG_Z, style: "pad", cushion: "beanbag", approachX: -1.6, approachZ: -6.2 },

    // --- Board-game table: three chairs round the round table in the corner ---
    { propId: "game_1", x: -8.2, z: -5.9, rotationY: FACE_NEG_Z, style: "wood", approachX: -8.2, approachZ: -5.0 },
    { propId: "game_2", x: -7.0, z: -7.0, rotationY: FACE_NEG_X, style: "wood", approachX: -6.1, approachZ: -7.0 },
    { propId: "game_3", x: -8.2, z: -8.1, rotationY: FACE_POS_Z, style: "wood", approachX: -8.2, approachZ: -9.0 },

    // --- Reading & tea lounge: the armchair and three floor cushions gather round the low
    //     tea table, with the record shelf and guitar along the wall behind them ---
    { propId: "armchair_1", x: -6.3, z: TEA_TABLE.z, rotationY: FACE_POS_X, style: "wingback", approachX: -6.3, approachZ: 4.1 },
    { propId: "wingback_2", x: -8.2, z: 2.2, rotationY: FACE_POS_Z, style: "wingback", approachX: -8.2, approachZ: 1.1 },
    { propId: "cushion_1", x: TEA_TABLE.x, z: 4.0, rotationY: FACE_POS_Z, style: "pad", cushion: "floorCushion", approachX: TEA_TABLE.x, approachZ: 3.0 },
    { propId: "cushion_2", x: TEA_TABLE.x, z: 6.8, rotationY: FACE_NEG_Z, style: "pad", cushion: "floorCushion", approachX: TEA_TABLE.x, approachZ: 7.8 },
    { propId: "cushion_3", x: -2.9, z: TEA_TABLE.z, rotationY: FACE_NEG_X, style: "pad", cushion: "floorCushion", approachX: -1.9, approachZ: TEA_TABLE.z },

    // --- Balcony deck: loungers looking out over the edge ---
    { propId: "deckchair_1", x: 7.6, z: 4.2, rotationY: FACE_POS_X, style: "deckchair", approachX: 6.3, approachZ: 4.2 },
    { propId: "deckchair_2", x: 7.6, z: 6.6, rotationY: FACE_POS_X, style: "deckchair", approachX: 6.3, approachZ: 6.6 },
    // --- The garden terrace beyond the deck: a bench for two under the string lights ---
    { propId: "garden_bench_1", x: 11.3, z: 2.6, rotationY: FACE_NEG_X, style: "pad", cushion: "terraceBench", approachX: 10.2, approachZ: 2.6 },
    { propId: "garden_bench_2", x: 11.3, z: 3.4, rotationY: FACE_NEG_X, style: "pad", cushion: "terraceBench", approachX: 10.2, approachZ: 3.4 },
  ]),

  campfire_night: anchored("campfire_night", [
    // Six log benches ringing the fire.
    ...seatRing("log", 0, 0, 2.8, 4.1, 6, "log"),
    // Camp chairs a little further back, out of the smoke.
    { propId: "camp_chair_1", x: -3.6, z: 3.4, rotationY: facing(-3.6, 3.4, 0, 0), style: "deckchair", approachX: -4.7, approachZ: 3.6 },
    { propId: "camp_chair_2", x: 3.6, z: 3.4, rotationY: facing(3.6, 3.4, 0, 0), style: "deckchair", approachX: 4.6, approachZ: 4.4 },
    // Stargazing blanket: you lie down here instead of sitting. Lying, the head goes a full
    // head-length BEHIND the anchor (-Z), so the anchor sits well forward of the blue tent.
    // Approached from the fire side, a step in from the ends so the east berry bush stays clear.
    { propId: "blanket_1", x: BLANKET.x - 0.5, z: BLANKET.z, rotationY: FACE_POS_Z, style: "blanket", approachX: BLANKET.x - 0.6, approachZ: BLANKET.z + 1.3 },
    { propId: "blanket_2", x: BLANKET.x + 0.5, z: BLANKET.z, rotationY: FACE_POS_Z, style: "blanket", approachX: BLANKET.x + 0.2, approachZ: BLANKET.z + 1.3 },
    // --- Glamping clearing: a hammock between two posts and two sleeping mats on the grass ---
    { propId: "hammock_1", x: -8.3, z: -8.6, rotationY: FACE_POS_X, style: "blanket", cushion: "hammock", approachX: -8.3, approachZ: -7.5 },
    { propId: "mat_1", x: -6.2, z: -8.4, rotationY: FACE_POS_X, style: "blanket", cushion: "sleepingMat", approachX: -5.1, approachZ: -8.4 },
    { propId: "mat_2", x: -6.2, z: -7.0, rotationY: FACE_POS_X, style: "blanket", cushion: "sleepingMat", approachX: -5.1, approachZ: -7.0 },
    // --- The stargazing bluff: two camp chairs turned to the sky over the valley's edge ---
    { propId: "bluff_chair_1", x: 8.8, z: -8.6, rotationY: facing(8.8, -8.6, 14, -14), style: "deckchair", approachX: 7.9, approachZ: -7.7 },
    { propId: "bluff_chair_2", x: 10.2, z: -8.0, rotationY: facing(10.2, -8.0, 14, -14), style: "deckchair", approachX: 9.6, approachZ: -6.9 },
    // --- River fishing: two flat stones on the bank, feet over the water ---
    { propId: "river_seat_1", x: -4.6, z: 4.4, rotationY: FACE_POS_Z, style: "pad", cushion: "pierPlank", approachX: -4.6, approachZ: 3.3 },
    { propId: "river_seat_2", x: 3.6, z: 4.6, rotationY: FACE_POS_Z, style: "pad", cushion: "pierPlank", approachX: 3.6, approachZ: 3.5 },
  ]),

  sunset_beach: anchored("sunset_beach", [
    // --- Tiki bar: four stools along the counter ---
    ...[-2.4, -1.2, 0, 1.2].map((x, i) => ({
      propId: `bar_stool_${i + 1}`,
      x,
      z: -4.6,
      rotationY: FACE_NEG_Z,
      style: "stool" as const,
      approachX: x,
      approachZ: -3.3,
    })),
    // --- Sun loungers under the striped parasol ---
    { propId: "lounger_1", x: -6.4, z: 1.0, rotationY: FACE_POS_Z, style: "deckchair", approachX: -5.1, approachZ: 1.0 },
    { propId: "lounger_2", x: -6.4, z: 3.2, rotationY: FACE_POS_Z, style: "deckchair", approachX: -5.1, approachZ: 3.2 },
    // --- Driftwood logs round the beach bonfire (marshmallows work here too) ---
    // NOTE: propIds key the global APPROACH_POINTS table, so they must be unique across ALL
    // maps — hence "driftwood" rather than reusing the campfire's "log".
    ...seatRing("driftwood", 5.0, -1.0, 1.9, 3.1, 3, "log"),
    // --- The end of the pier: sit with your feet over the water ---
    { propId: "pier_seat_1", x: 1.6, z: 7.4, rotationY: FACE_POS_Z, style: "pad", cushion: "pierPlank", approachX: 1.6, approachZ: 6.2 },
    { propId: "pier_seat_2", x: 2.8, z: 7.4, rotationY: FACE_POS_Z, style: "pad", cushion: "pierPlank", approachX: 2.8, approachZ: 6.2 },
    // --- The cabana: a shaded daybed for two, looking back over the beach ---
    { propId: "cabana_1", x: 8.2, z: 1.1, rotationY: FACE_NEG_X, style: "pad", cushion: "cabanaBed", approachX: 6.6, approachZ: 1.1 },
    { propId: "cabana_2", x: 8.2, z: 2.0, rotationY: FACE_NEG_X, style: "pad", cushion: "cabanaBed", approachX: 6.6, approachZ: 2.0 },
  ]),

  velvet_casino: anchored("velvet_casino", [
    // --- Bar: three stools along the back counter ---
    ...[-7.8, -6.2, -4.6].map((x, i) => ({
      propId: `casino_bar_${i + 1}`,
      x,
      z: -8.4,
      rotationY: FACE_NEG_Z,
      style: "stool" as const,
      approachX: x,
      approachZ: -7.3,
    })),
    // --- Blackjack: three stools round the player side of the half-moon table, close enough
    //     that folded legs tuck under the leather rail instead of dangling short of it ---
    ...[-0.7, 0, 0.7].map((a, i) => {
      const x = -5.5 + Math.sin(a) * 1.45;
      const z = -4.6 + Math.cos(a) * 1.45;
      return {
        propId: `blackjack_${i + 1}`,
        x,
        z,
        rotationY: facing(x, z, -5.5, -4.6),
        style: "stool" as const,
        approachX: -5.5 + Math.sin(a) * 2.5,
        approachZ: -4.6 + Math.cos(a) * 2.5,
      };
    }),
    // --- VIP lounge: the chesterfield and two club armchairs ---
    // Sofa seats sit forward of the buttoned back (front face x -9.42) and in from the rolled
    // arms (z 2.95 and 7.05), so shoulders never go through leather.
    { propId: "vip_sofa_1", x: -8.95, z: 4.35, rotationY: FACE_POS_X, style: "pad", cushion: "vipSofa", approachX: -7.7, approachZ: 3.4 },
    { propId: "vip_sofa_2", x: -8.95, z: 5.65, rotationY: FACE_POS_X, style: "pad", cushion: "vipSofa", approachX: -7.7, approachZ: 6.6 },
    { propId: "vip_chair_1", x: -5.5, z: 3.3, rotationY: facing(-5.5, 3.3, -7.5, 5), style: "armchair", approachX: -6.3, approachZ: 2.6 },
    { propId: "vip_chair_2", x: -5.5, z: 6.7, rotationY: facing(-5.5, 6.7, -7.5, 5), style: "armchair", approachX: -6.3, approachZ: 7.5 },
    // --- The foyer: velvet benches either side of the doors ---
    { propId: "foyer_bench_1", x: 6.2, z: 11.9, rotationY: FACE_NEG_Z, style: "pad", cushion: "velvetBench", approachX: 6.2, approachZ: 10.8 },
    { propId: "foyer_bench_2", x: 8.0, z: 11.9, rotationY: FACE_NEG_Z, style: "pad", cushion: "velvetBench", approachX: 8.0, approachZ: 10.8 },
  ]),

  boxing_ring: anchored("boxing_ring", [
    // --- Bleachers: three tiers north (facing the ring) and three tiers west ---
    ...[-3.6, -1.2, 1.2, 3.6].flatMap((x, i) =>
      (["bleacherLow", "bleacherMid", "bleacherHigh"] as const).map((cushion, tier) => ({
        propId: `bleacher_n_${i + 1}_${tier + 1}`,
        x,
        z: -7.2 - tier * 1.1,
        rotationY: FACE_POS_Z,
        style: "bleacher" as const,
        cushion,
        approachX: x,
        approachZ: -5.9,
      }))
    ),
    ...[-3.6, -1.2, 1.2, 3.6].flatMap((z, i) =>
      (["bleacherLow", "bleacherMid", "bleacherHigh"] as const).map((cushion, tier) => ({
        propId: `bleacher_w_${i + 1}_${tier + 1}`,
        x: -7.2 - tier * 1.1,
        z,
        rotationY: FACE_POS_X,
        style: "bleacher" as const,
        cushion,
        approachX: -5.9,
        approachZ: z,
      }))
    ),
    // --- Drink rail: three stools facing the ring ---
    ...[-2.4, 0, 2.4].map((z, i) => ({ propId: `rail_stool_${i + 1}`, x: 6.9, z, rotationY: FACE_NEG_X, style: "stool" as const, approachX: 5.9, approachZ: z })),
    // --- Ringside: sit on the apron with your legs over the side ---
    { propId: "apron_1", x: -2.0, z: BOXING_RING.half - 0.2, rotationY: FACE_POS_Z, style: "pad", cushion: "ringApron", approachX: -2.0, approachZ: BOXING_RING.half + 1.0 },
    { propId: "apron_2", x: 2.0, z: BOXING_RING.half - 0.2, rotationY: FACE_POS_Z, style: "pad", cushion: "ringApron", approachX: 2.0, approachZ: BOXING_RING.half + 1.0 },
  ]),

  japanese_onsen: anchored("japanese_onsen", [
    // --- In the water: ledges round the pool, facing the middle ---
    { propId: "onsen_1", x: -2.7, z: -1.6, rotationY: facing(-2.7, -1.6, 0, 0), style: "onsen", approachX: 0, approachZ: 4.2 },
    { propId: "onsen_2", x: 2.7, z: -1.6, rotationY: facing(2.7, -1.6, 0, 0), style: "onsen", approachX: 0, approachZ: 4.2 },
    { propId: "onsen_3", x: -2.7, z: 1.6, rotationY: facing(-2.7, 1.6, 0, 0), style: "onsen", approachX: 0, approachZ: 4.2 },
    { propId: "onsen_4", x: 2.7, z: 1.6, rotationY: facing(2.7, 1.6, 0, 0), style: "onsen", approachX: 0, approachZ: 4.2 },
    { propId: "onsen_5", x: 0, z: -1.9, rotationY: FACE_POS_Z, style: "onsen", approachX: 0, approachZ: 4.2 },
    // --- The tea house veranda and a bench by the well ---
    { propId: "veranda_1", x: -6.4, z: -4.6, rotationY: FACE_POS_Z, style: "pad", cushion: "floorCushion", approachX: -6.4, approachZ: -3.5 },
    { propId: "veranda_2", x: -8.0, z: -4.6, rotationY: FACE_POS_Z, style: "pad", cushion: "floorCushion", approachX: -8.0, approachZ: -3.5 },
    { propId: "well_bench", x: 8.6, z: -3.2, rotationY: FACE_NEG_X, style: "wood", approachX: 7.6, approachZ: -3.2 },
  ]),

  retro_arcade: anchored("retro_arcade", [
    // --- Snack bar stools ---
    ...[-2.2, 0, 2.2].map((z, i) => ({ propId: `snack_stool_${i + 1}`, x: 7.8, z, rotationY: FACE_POS_X, style: "stool" as const, approachX: 6.8, approachZ: z })),
    // --- Beanbags in front of the big screen ---
    { propId: "arcade_bean_1", x: 4.4, z: 5.6, rotationY: FACE_NEG_X, style: "pad", cushion: "beanbag", approachX: 5.4, approachZ: 5.6 },
    { propId: "arcade_bean_2", x: 4.4, z: 7.4, rotationY: FACE_NEG_X, style: "pad", cushion: "beanbag", approachX: 5.4, approachZ: 7.4 },
  ]),
};

export const MAP_TOGGLEABLES: Record<MapId, ToggleableConfig[]> = {
  cozy_lounge: [
    // The TV stands on the media console against the slatted screen, facing the sofa.
    { propId: "tv", x: -3.0, y: 1.42, z: -3.62, kind: "tv", color: "#9ad1e8", defaultOn: true },
    { propId: "lamp_living", x: 0.9, y: -0.16, z: 1.1, kind: "lamp", color: "#ffcf8a", defaultOn: true }, // down in the pit
    { propId: "espresso", x: 2.4, y: 0.95, z: -9.25, kind: "espresso", color: "#ffb36b", defaultOn: true, approachX: 2.4, approachZ: -8.0 },
    // Both cabinets stand against the left wall just past the streamer desk, facing into the room
    // with two clear units of floor in front of them.
    // Both cabinets on the back wall of the game den, two clear units of floor in front.
    { propId: "arcade_1", x: -7.0, z: -9.45, kind: "arcade", color: "#ff4fd8", defaultOn: true, approachX: -7.0, approachZ: -7.4 },
    { propId: "arcade_2", x: -5.6, z: -9.45, kind: "arcade", color: "#4fd8ff", defaultOn: false, approachX: -5.6, approachZ: -7.4 },
    { propId: "desk_lamp_den", x: -9.0, y: 0.66, z: -7.8, kind: "desk_lamp", color: "#ffe2b0", defaultOn: true },
    { propId: "lamp_vinyl", x: -8.1, z: 7.0, kind: "lamp", color: "#ffc47a", defaultOn: true },
    // The record player on top of the vinyl shelf: click to change the record (or stop it).
    { propId: "turntable", x: -9.3, y: 1.7, z: 3.8, kind: "turntable", color: "#e0a93b", defaultOn: true },
    { propId: "lantern_balcony", x: 8.9, z: 5.4, kind: "lantern", color: "#ffbe6b", defaultOn: true },
    // Mochi the cat, loafing on the pit rug. Walk up and play with her.
    { propId: "cat_mochi", x: -0.9, y: -0.16, z: -2.5, kind: "cat", color: "#f0a860", defaultOn: true, approachX: -0.3, approachZ: -1.9 },
    // The board-game table (checkers) and the jukebox panel on the record player.
    { propId: "boardgame_lounge", x: -8.2, y: 0.75, z: -7.0, kind: "boardgame", color: "#f0e6d2", defaultOn: true, approachX: -7.0, approachZ: -5.9 },
    { propId: "jukebox_lounge", x: -9.3, y: 1.7, z: 4.4, kind: "jukebox", color: "#e0a93b", defaultOn: true, approachX: -8.4, approachZ: 4.4 },
  ],

  campfire_night: [
    { propId: "campfire", x: 0, z: 0, kind: "campfire", color: "#ff8a3d", defaultOn: true },
    // Warm lantern gold, never the greenish white it used to read as against the night grade.
    // Dimmed so they read as lanterns round a campfire rather than competing with it.
    { propId: "lantern_east", x: 4.4, y: 0.42, z: -2.2, kind: "lantern", color: "#ffb25e", defaultOn: true, intensity: 0.5 },
    { propId: "lantern_west", x: -4.4, y: 0.42, z: 2.2, kind: "lantern", color: "#ffb25e", defaultOn: true, intensity: 0.5 },
    { propId: "lantern_glamp", x: -8.0, y: 0.42, z: -6.6, kind: "lantern", color: "#ffb25e", defaultOn: true, intensity: 0.5 },
    // The stew pot in the gap between two log seats: stir it, and when it is ready everyone
    // round the fire gets a bowl.
    { propId: "stewpot", x: 0.1, z: -2.0, kind: "stew", color: "#ffb36b", defaultOn: true, approachX: 0.1, approachZ: -3.3 },
    // Berry bushes to forage (fireflies instead after dark), and the ranger who buys them.
    { propId: "bush_west", x: -6.8, z: -1.2, kind: "forage", color: "#5b6fd6", defaultOn: true, approachX: -5.8, approachZ: -1.0 },
    { propId: "bush_north", x: -1.0, z: -7.2, kind: "forage", color: "#5b6fd6", defaultOn: true, approachX: -0.9, approachZ: -6.2 },
    { propId: "bush_east", x: 6.8, z: 0.0, kind: "forage", color: "#5b6fd6", defaultOn: true, approachX: 5.8, approachZ: 0.3 },
    { propId: "npc_oak", x: 6.4, z: 2.2, kind: "npc", color: "#5f7d4a", defaultOn: true, approachX: 5.4, approachZ: 2.6 },
    // Mochi, curled up by the firewood stack in her scout bandana.
    { propId: "cat_mochi_camp", x: -3.9, z: -3.1, kind: "cat", color: "#f0a860", defaultOn: true, approachX: -4.6, approachZ: -2.3 },
  ],

  sunset_beach: [
    // The bonfire the driftwood logs ring — same fire, so roasting works on the beach too.
    { propId: "bonfire", x: 5.0, z: -1.0, kind: "campfire", color: "#ff8a3d", defaultOn: true },
    // A woven lantern hanging under the front eave (it used to be a floor lamp on the roof).
    { propId: "lamp_bar", x: -0.6, y: 2.75, z: -5.25, kind: "pendant", color: "#ffd08a", defaultOn: true },
    { propId: "beach_bar_tap", x: -1.1, y: 1.05, z: -5.95, kind: "espresso", color: "#ffb36b", defaultOn: true, approachX: -1.1, approachZ: -3.3 },
    { propId: "tiki_east", x: 7.4, y: 0.5, z: 3.0, kind: "lantern", color: "#ff9a4a", defaultOn: true },
    { propId: "tiki_west", x: -8.0, y: 0.5, z: -1.6, kind: "lantern", color: "#ff9a4a", defaultOn: true },
    // Fisherman Bob buys your catch at his stall by the pier.
    // Glints in the sand: beachcombing spots. The server moves each one after it is picked.
    ...SPARKLE_SPOTS.slice(0, 3).map((s, i) => ({ propId: `sparkle_${i + 1}`, x: s.x, z: s.z, kind: "sparkle" as const, color: "#fff3b0", defaultOn: true, approachX: s.x, approachZ: s.z })),
    { propId: "npc_bob", x: 5.0, z: 4.0, kind: "npc", color: "#3f6d8c", defaultOn: true, approachX: 5.0, approachZ: 2.9 },
    // Mochi under the parasol in her pink sunglasses; the blender behind the bar.
    { propId: "cat_mochi_beach", x: -7.7, z: 2.4, kind: "cat", color: "#f0a860", defaultOn: true, approachX: -8.5, approachZ: 2.5 },
    { propId: "blender_bar", x: -1.9, y: 1.45, z: -6.35, kind: "blender", color: "#f4b6c2", defaultOn: true, approachX: -1.9, approachZ: -4.6 },
  ],

  velvet_casino: [
    ...[1.6, 3.3, 5.0].map((x, i) => ({
      propId: `slot_${i + 1}`,
      x,
      z: -9.35,
      kind: "slot" as const,
      color: ["#ff5d73", "#ffc94d", "#5de0ff"][i],
      defaultOn: true,
      approachX: x,
      approachZ: -8.1,
    })),
    { propId: "casino_lamp_vip", x: -8.6, y: 0.18, z: 7.9, kind: "lamp", color: "#ffc27a", defaultOn: true }, // up on the VIP platform
    { propId: "casino_lamp_bj", x: -3.2, z: -6.4, kind: "lamp", color: "#ffc27a", defaultOn: true },
    { propId: "casino_lamp_door", x: 8.9, z: 3.4, kind: "lamp", color: "#ffc27a", defaultOn: true },
    // Lucky Mochi on the bar counter in her bow tie.
    { propId: "cat_mochi_casino", x: -5.4, y: 1.16, z: -9.0, kind: "cat", color: "#f0a860", defaultOn: true, approachX: -5.4, approachZ: -7.4 },
    { propId: "casino_lamp_foyer", x: 9.8, z: 11.6, kind: "lamp", color: "#ffc27a", defaultOn: true },
  ],

  boxing_ring: [
    // Mochi on the corner turnbuckle with one tiny glove on.
    { propId: "cat_mochi_ring", x: 3.3, y: 1.08, z: 3.3, kind: "cat", color: "#f0a860", defaultOn: true, approachX: 4.3, approachZ: 4.4 },
    { propId: "gym_lamp_1", x: -6.0, y: 0.0, z: 7.8, kind: "lamp", color: "#ffd8a0", defaultOn: true },
    { propId: "gym_lamp_2", x: 6.0, y: 0.0, z: 6.6, kind: "lamp", color: "#ffd8a0", defaultOn: true },
  ],

  japanese_onsen: [
    // Mochi on the rock rim with a folded towel on her head.
    { propId: "cat_mochi_onsen", x: 3.9, y: 0.22, z: -1.4, kind: "cat", color: "#f0a860", defaultOn: true, approachX: 5.0, approachZ: -1.4 },
    { propId: "well_onsen", x: 6.5, z: -5.7, kind: "well", color: "#9ac6ea", defaultOn: true, approachX: 6.5, approachZ: -4.2 },
    { propId: "teahouse_onsen", x: -7.3, y: 0.3, z: -6.6, kind: "teahouse", color: "#8fd3b6", defaultOn: true, approachX: -7.3, approachZ: -4.6 },
    { propId: "stone_lantern_1", x: -7.0, y: 0.9, z: 5.6, kind: "lantern", color: "#ffd9a0", defaultOn: true, intensity: 0.6 },
    { propId: "stone_lantern_2", x: 6.8, y: 0.9, z: -0.8, kind: "lantern", color: "#ffd9a0", defaultOn: true, intensity: 0.6 },
  ],

  retro_arcade: [
    ...[-8.0, -5.6, -3.2, -0.8, 1.6].map((x, i) => ({
      propId: `arcade_cab_${i + 1}`,
      x,
      z: -11.1,
      kind: "arcade" as const,
      color: ["#ff4fd8", "#4fd8ff", "#ffd84f", "#8fff4f", "#ff7a4f"][i],
      defaultOn: true,
      approachX: x,
      approachZ: -9.4,
    })),
    ...[-4.2, -2.0, 0.2].map((z, i) => ({ propId: `gacha_${i + 1}`, x: -11.1, z, kind: "gacha" as const, color: ["#ff6b9d", "#6bc5ff", "#ffe36b"][i], defaultOn: true, approachX: -9.6, approachZ: z })),
    { propId: "claw_arcade", x: 4.0, z: -10.9, kind: "claw", color: "#b28cff", defaultOn: true, approachX: 4.0, approachZ: -9.2 },
    // Mochi napping on top of a warm cabinet, in her pixel glasses.
    { propId: "cat_mochi_arcade", x: -3.2, y: 1.9, z: -11.2, kind: "cat", color: "#f0a860", defaultOn: true, approachX: -3.2, approachZ: -9.4 },
    { propId: "arcade_lamp_bar", x: 9.4, y: 1.4, z: 0, kind: "pendant", color: "#ff7ad9", defaultOn: true, intensity: 0.8 },
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

/** Static per-prop art direction (intensity etc.), keyed by propId. */
export const TOGGLEABLE_CONFIG: Record<string, ToggleableConfig> = (() => {
  const out: Record<string, ToggleableConfig> = {};
  for (const list of Object.values(MAP_TOGGLEABLES)) for (const t of list) out[t.propId] = t;
  return out;
})();

/** Seats you can fish from once you are sitting on them (the pier, and the river stones). */
export function isFishingSeat(propId: string): boolean {
  return propId.startsWith("pier_seat") || propId.startsWith("river_seat");
}

/** Where Mochi wanders in each world: three cozy spots round her home (the cat prop). */
export const MOCHI_WAYPOINTS: Record<MapId, { x: number; z: number }[]> = {
  cozy_lounge: [
    { x: -0.9, z: -2.5 },
    { x: -2.6, z: -0.4 },
    { x: 0.3, z: -0.9 },
  ],
  campfire_night: [
    { x: -3.9, z: -3.1 },
    { x: -2.2, z: -2.2 },
    { x: -4.4, z: -1.4 },
  ],
  sunset_beach: [
    { x: -7.7, z: 2.4 },
    { x: -8.6, z: 1.0 },
    { x: -6.2, z: 4.3 },
  ],
  velvet_casino: [
    { x: -5.4, z: -9.0 },
    { x: -6.6, z: -9.0 },
    { x: -4.2, z: -9.0 },
  ],
  boxing_ring: [
    { x: 3.3, z: 3.3 },
    { x: 3.3, z: 1.4 },
    { x: 1.4, z: 3.3 },
  ],
  japanese_onsen: [
    { x: 3.9, z: -1.4 },
    { x: 3.9, z: 0.6 },
    { x: 2.4, z: -3.0 },
  ],
  retro_arcade: [
    { x: -3.2, z: -11.2 },
    { x: -5.6, z: -11.2 },
    { x: -0.8, z: -11.2 },
  ],
};
