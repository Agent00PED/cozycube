import { isBlocked } from "../shared/collision.ts";
import { CAMPFIRE_LAYOUT } from "../shared/worlds/campfire.ts";
import { FOREST_LAYOUT } from "../shared/worlds/forest.ts";
const cat = (p0: number, p1: number, p2: number, p3: number, u: number) => 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
for (const [map, L] of [["campfire_night", CAMPFIRE_LAYOUT], ["whispering_woods", FOREST_LAYOUT]] as const) {
  (L.paths as any[]).forEach((path, i) => {
    const P = path.points as number[][];
    const bad: string[] = [];
    for (let k = 0; k + 1 < P.length; k++) {
      const a = P[Math.max(0, k - 1)], b = P[k], c = P[k + 1], d = P[Math.min(P.length - 1, k + 2)];
      for (let u = 0; u < 1; u += 0.1) {
        const x = cat(a[0], b[0], c[0], d[0], u), z = cat(a[1], b[1], c[1], d[1], u);
        if (isBlocked(x, z, map as any, 0.42)) bad.push(`(${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
    console.log(map, "path", i, bad.length ? "BLOCKED at " + [...new Set(bad)].join(" ") : "clear");
  });
}
