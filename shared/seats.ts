import type { SeatStyle, SitPose } from "./types";

// Seat anchors are DERIVED, never typed in by hand.
//
// Every seat is drawn from one cushion primitive (a unit box, cylinder or sphere from the mesh
// kit, scaled and positioned). That primitive is described here ONCE, and both sides read it:
// the world files draw the cushion from it, and props.ts computes where a seated avatar goes
// from it. Move a cushion and the avatar moves with it; there is no second number to forget.
//
// surfaceY = geometry.boundingBox.max.y * scale.y + position.y   (kit shapes are unit-sized,
// so boundingBox.max.y is 0.5 for a box, cylinder or sphere)

export interface Cushion {
  /** Centre height of the cushion primitive (its `position.y`). */
  y: number;
  /** Full height of the primitive (its `scale.y`); the kit's unit shapes are 1 unit tall. */
  h: number;
}

/** Every kit primitive is authored 1 unit tall about its centre. */
const UNIT_BOUNDING_BOX_MAX_Y = 0.5;

/** The top surface of a cushion, from its bounding box. */
export function surfaceY(c: Cushion): number {
  return UNIT_BOUNDING_BOX_MAX_Y * c.h + c.y;
}

// --- The avatar's own proportions that seating depends on (mirrored by Character3D) ---

/** Height of the chibi's hip pivot above its soles; its legs fold forward here when it sits. */
export const AVATAR_HIP_Y = 0.27;
/** Radius of the leg capsules: the folded legs hang this far below the hip pivot. */
export const AVATAR_LEG_RADIUS = 0.085;
/**
 * How far above the cushion surface the hip pivot rests. The legs are AVATAR_LEG_RADIUS thick
 * below the pivot, so this leaves them pressed into the top of the cushion by a whisker (soft
 * seats give a little) instead of hovering over it or sinking into it.
 */
export const AVATAR_HIP_OFFSET = 0.07;
/** Lying down, the body rolls onto its back; its back is this far above the avatar origin. */
export const AVATAR_BACK_LIFT = 0.03;
/** A seated avatar's top of head (hat included) above its origin. Used for headroom checks. */
export const AVATAR_SEATED_HEIGHT = 1.78;
/** Clear air wanted between a seated head and anything overhead (roof eaves, tent canvas). */
export const HEADROOM_MIN = 0.5;

/** The vertical offset of a seated avatar's origin so its hips rest on `cushion`. */
export function seatAnchorY(cushion: Cushion, pose: SitPose = "sit"): number {
  const top = surfaceY(cushion);
  if (pose === "lie") return top - AVATAR_BACK_LIFT;
  return top + AVATAR_HIP_OFFSET - AVATAR_HIP_Y;
}

// --- The cushions themselves ---
// Keyed by the world piece they belong to. Seat styles drawn by ChairProp reference these by
// style name; "pad" seats drawn by the worlds (sofas, beanbags, cushions, pier planks) name
// their own entry.

export const CUSHIONS = {
  // ChairProp styles (see client/src/components/ChairProp.tsx)
  stool: { y: 0.77, h: 0.04 }, // the padded top of a bar stool
  armchair: { y: 0.42, h: 0.08 }, // seat cushion
  wood: { y: 0.46, h: 0.05 }, // plank seat
  gaming: { y: 0.37, h: 0.1 },
  log: { y: 0.21, h: 0.44 }, // a log lying on its side: its diameter is its height
  deckchair: { y: 0.3, h: 0.06 }, // the sling where the hips land (it slopes; this is its middle)
  blanket: { y: 0.06, h: 0.02 },
  // "pad" seats drawn by the worlds
  loungeSofa: { y: 0.46, h: 0.1 }, // the unified L-sofa cushion platform (LoungeWorld)
  beanbag: { y: 0.2, h: 0.42 }, // the beanbag's squashed sphere
  floorCushion: { y: 0.17, h: 0.08 }, // the plump top of a floor cushion
  pierPlank: { y: 0.13, h: 0.06 }, // the pier deck (BeachWorld)
  vipSofa: { y: 0.48, h: 0.1 }, // the chesterfield's seat cushions (CasinoWorld)
} as const satisfies Record<string, Cushion>;

export type CushionId = keyof typeof CUSHIONS;

/** The cushion a ChairProp-drawn style sits you on. */
export const STYLE_CUSHION: Record<Exclude<SeatStyle, "pad">, CushionId> = {
  stool: "stool",
  armchair: "armchair",
  wood: "wood",
  gaming: "gaming",
  log: "log",
  deckchair: "deckchair",
  blanket: "blanket",
};
