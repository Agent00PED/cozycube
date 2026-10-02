// Where you stand to fell a tree that grew where it pleased (the camp maps' wild trees: the ones a
// layout stands for their looks, not at a felling spot of their own): a step out from the trunk
// toward the middle of the map, or the nearest way round it that is open.

type Pt = { x: number; z: number };

/** The turns tried, in degrees off the way toward the middle: the nearest first. */
const TURNS = [0, 25, -25, 50, -50, 75, -75, 100, -100, 130, -130, 160, -160, 180];

/** A spot `reach` out from the trunk at `t`, toward `toward` if that is open (`free`), else the
 *  nearest turn off it that is (a little further out if none is). */
export function openApproach(t: Pt, reach: number, toward: Pt, free: (x: number, z: number) => boolean): Pt {
  const base = Math.atan2(toward.z - t.z, toward.x - t.x);
  const at = (turn: number, out: number): Pt => {
    const a = base + (turn * Math.PI) / 180;
    return { x: Math.round((t.x + Math.cos(a) * out) * 1000) / 1000, z: Math.round((t.z + Math.sin(a) * out) * 1000) / 1000 };
  };
  for (const out of [reach, reach + 0.25, reach + 0.5]) {
    for (const turn of TURNS) {
      const p = at(turn, out);
      if (free(p.x, p.z)) return p;
    }
  }
  return at(0, reach);
}
