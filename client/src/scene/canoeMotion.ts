// How the campfire's canoe moves on the water, moored off the dock at its cleat, shared by the boat itself (campfireLife.ts) and
// whoever sits in it (Avatar.tsx), so the two rock as one: a gentle bob and roll, and, while its
// angler fights a fish on the line, a harder rock with a jerky tug in it. The canoe lies along
// the river's x, so it rolls about x and pitches about z.

/** How far the boat rises and falls on the water. */
export function canoeBob(t: number): number {
  // a slow swell with a small ripple riding on it
  return 0.02 * Math.sin(t * 1.4) + 0.007 * Math.sin(t * 2.9 + 1);
}

/** The roll about its length (x). */
export function canoeRoll(t: number, struggling: boolean): number {
  return (struggling ? 0.075 : 0.04) * Math.sin(t * 1.3) + 0.012 * Math.sin(t * 0.5 + 2) + (struggling ? 0.03 * Math.sin(t * 7.1) : 0);
}

/** The pitch, bow up and down (about z). */
export function canoePitch(t: number, struggling: boolean): number {
  return 0.03 * Math.sin(t * 1.1 + 1) + 0.012 * Math.sin(t * 0.45) + (struggling ? 0.02 * Math.sin(t * 5.3) : 0);
}
