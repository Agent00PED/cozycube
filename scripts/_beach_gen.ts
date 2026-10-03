import { BAR, FIREPIT, SHACK, HAMMOCK_PALMS, BEACH_ARRIVAL, BALL_COURT, LOUNGERS, shoreOf, shoreD } from "../shared/worlds/beach";
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const keep: { x: number; z: number; r: number }[] = [{ ...BAR, r: 4.6 }, { ...FIREPIT, r: 3.4 }, { ...SHACK, r: 3.8 }, { ...BEACH_ARRIVAL, r: 3.4 }, { ...BALL_COURT, r: BALL_COURT.r + 1.2 }, ...HAMMOCK_PALMS.map((p) => ({ ...p, r: 3.0 })), ...LOUNGERS.map((p) => ({ ...p, r: 2.6 }))];
const placed: { x: number; z: number; s: number }[] = [];
const scatter = (n: number, minD: number, gap: number, size: [number, number], others: { x: number; z: number }[], otherGap: number) => {
  const out: { x: number; z: number; s: number }[] = [];
  for (let tries = 0; out.length < n && tries < 40000; tries++) {
    const x = -16.6 + rnd() * 33.2, z = -16.6 + rnd() * 33.2;
    const d = shoreD(x, z);
    if (d < minD) continue;
    if (keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    if (out.some((p) => Math.hypot(x - p.x, z - p.z) < gap) || others.some((p) => Math.hypot(x - p.x, z - p.z) < otherGap)) continue;
    out.push({ x, z, s: size[0] + rnd() * (size[1] - size[0]) });
  }
  return out;
};
const fmt = (list: { x: number; z: number; s: number }[]) => "[" + list.map((p) => { const q = shoreOf(p.x, p.z); return `[${q.d.toFixed(1)}, ${q.v.toFixed(1)}, ${p.s.toFixed(2)}]`; }).join(", ") + "]";
const palms = scatter(26, 8.0, 3.0, [0.88, 1.12], HAMMOCK_PALMS, 3.2);
const shrubs = scatter(12, 7.0, 2.6, [0.65, 0.85], [...palms, ...HAMMOCK_PALMS], 1.7);
console.log('"palms": ' + fmt(palms) + ",");
console.log('"shrubs": ' + fmt(shrubs) + ",");
