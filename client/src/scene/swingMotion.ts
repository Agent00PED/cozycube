// How the campfire's bench swing moves (the Swing Garden), shared by the swing itself
// (campfireLife.ts turns `Prop_Swing` about its beam) and whoever sits on it (Avatar.tsx), so the
// two sway as one: a slow, gentle pendulum that never quite stops.

/** The swing's angle about its beam (rad): forward, the way its sitters face, when positive. */
export function swingAngle(t: number): number {
  return 0.085 * Math.sin(t * 2.1) + 0.02 * Math.sin(t * 0.47 + 1);
}
