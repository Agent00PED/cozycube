// Seat anchors are DERIVED, never typed in by hand.
//
// Every seat is drawn from one cushion primitive: a unit box, cylinder or sphere from the mesh
// kit, scaled to `h` tall and centred at `y`. That is described here ONCE. The world draws the
// cushion from it, and props.ts computes where a seated avatar goes from it, so moving a cushion
// moves the avatar with it and there is no second number to forget.
//
//   surfaceY = geometry.boundingBox.max.y * scale.y + position.y
//
// (the kit's unit shapes are 1 tall about their centre, so boundingBox.max.y is 0.5)

export interface Cushion {
  /** Centre height of the cushion primitive (its `position.y`). */
  y: number;
  /** Full height of the primitive (its `scale.y`). */
  h: number;
}

const UNIT_BOUNDING_BOX_MAX_Y = 0.5;

/** The top surface of a cushion, from its bounding box. */
export function surfaceY(c: Cushion): number {
  return UNIT_BOUNDING_BOX_MAX_Y * c.h + c.y;
}

// --- The avatar's proportions that seating depends on (client/src/entities/Avatar.tsx asserts them) ---

/** Height of the hip pivot above the soles; the thighs fold forward from here when sitting. */
export const AVATAR_HIP_Y = 0.27;
/** Radius of the leg capsules: the folded thighs hang this far below the hip pivot. */
export const AVATAR_LEG_RADIUS = 0.085;
/** The hip pivot rests this far above the cushion surface (the thighs sink into it by a whisker). */
export const AVATAR_HIP_OFFSET = 0.1;

/** Where a seated avatar's ORIGIN (its soles' height) goes so its hips rest on `cushion`. */
export function seatAnchorY(cushion: Cushion): number {
  return surfaceY(cushion) + AVATAR_HIP_OFFSET - AVATAR_HIP_Y;
}

// --- Lying down (a nap on a sofa, a blanket) ---
//
// Lying, the avatar rolls onto its back about its soles (Avatar.tsx) and is lifted AVATAR_LIE_LIFT,
// so its head, the widest part of it, rests on whatever is under its origin. Its head's centre is
// then AVATAR_HEAD_Y along the body from the soles, toward the way the head points.

/** How far a lying avatar is lifted: its head's radius, so the back of the head rests on the surface. */
export const AVATAR_LIE_LIFT = 0.26;
/** The head's centre above the soles, standing (along the body, lying). */
export const AVATAR_HEAD_Y = 0.82;
/** How far a napping head sinks into a soft cushion. */
const NAP_SINK = 0.03;

/** Where a napping avatar's ORIGIN goes so its head rests on `cushion`. */
export function napAnchorY(cushion: Cushion): number {
  return surfaceY(cushion) - NAP_SINK;
}

/** Where a nap puts the avatar: its soles (the origin), heading and height, from where the head
 *  rests and the way it points along the cushion (a unit vector in x, z). A lying avatar's head
 *  points along its local -z, which a heading of h turns to (-sin h, -cos h). */
export function napPose(cushion: Cushion, head: { x: number; z: number }, dir: { x: number; z: number }) {
  return {
    x: head.x - dir.x * AVATAR_HEAD_Y,
    z: head.z - dir.z * AVATAR_HEAD_Y,
    rotationY: Math.atan2(-dir.x, -dir.z),
    y: napAnchorY(cushion),
  };
}

// --- The Loft's cushions (proportioned to the 1.3-unit avatar: seats 0.36, stools 0.48) ---

export const CUSHIONS = {
  sofa: { y: 0.3, h: 0.12 }, // the sectional's seat cushions -> top 0.36
  wingback: { y: 0.3, h: 0.12 }, // the reading armchair
  chaise: { y: 0.26, h: 0.12 }, // a little lower: you recline into it -> top 0.32
  stool: { y: 0.45, h: 0.06 }, // the island's counter stools -> top 0.48
  dining: { y: 0.34, h: 0.04 }, // bistro and games-table chairs -> top 0.36
  pouf: { y: 0.16, h: 0.32 }, // the floor poufs round the low table -> top 0.32
  // --- the Campfire's (shared/worlds/campfire.ts; scripts/blender/build_campfire.py reads these three) ---
  log: { y: 0.19, h: 0.38 }, // a fallen log bench, lying on its side (radius 0.19) -> top 0.38
  hammock: { y: 0.6, h: 0.04 }, // the hammock's fabric at the bottom of its sag -> 0.62
  tentMat: { y: 0.03, h: 0.06 }, // the sleeping mat inside the tipi -> 0.06
} as const satisfies Record<string, Cushion>;

export type CushionId = keyof typeof CUSHIONS;
