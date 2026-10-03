// Walking against the worlds (docs/caverns-roadmap.md R2.1): `npm test`. The slide step the game walks
// by (shared/collision.ts slideStep) slides round what it meets, walks out of a spot a body doesn't
// fit, and round colliders are round.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_OBSTACLES, disc, isBlocked, slideStep } from "../shared/collision";

test("a round collider is round: its box's corner is open ground", () => {
  const trunk = MAP_OBSTACLES.whispering_woods.find((b) => b.r !== undefined)!;
  assert.ok(trunk, "the woods' trunks are discs");
  const cx = (trunk.minX + trunk.maxX) / 2;
  const cz = (trunk.minZ + trunk.maxZ) / 2;
  assert.equal(isBlocked(cx, cz, "whispering_woods", 0.05), true);
  // (just inside the box's corner, outside the disc)
  const k = trunk.r! * 0.95;
  const corner = { x: cx + k, z: cz + k };
  const inDisc = Math.hypot(corner.x - cx, corner.z - cz) < trunk.r! + 0.05;
  if (!inDisc) assert.equal(isBlocked(corner.x, corner.z, "whispering_woods", 0.05), MAP_OBSTACLES.whispering_woods.some((b) => b !== trunk && corner.x + 0.05 > b.minX && corner.x - 0.05 < b.maxX && corner.z + 0.05 > b.minZ && corner.z - 0.05 < b.maxZ));
  assert.deepEqual(disc({ x: 1, z: 2 }, 0.5), { minX: 0.5, maxX: 1.5, minZ: 1.5, maxZ: 2.5, r: 0.5 });
});

test("stood where a body doesn't fit, a step out is always taken", () => {
  const trunk = MAP_OBSTACLES.whispering_woods.find((b) => b.r !== undefined)!;
  const cx = (trunk.minX + trunk.maxX) / 2;
  const cz = (trunk.minZ + trunk.maxZ) / 2;
  // (right against the trunk, inside a body's reach of it)
  const pos = { x: cx + trunk.r! + 0.1, z: cz };
  assert.equal(isBlocked(pos.x, pos.z, "whispering_woods", 0.3), true);
  for (let i = 0; i < 40; i++) slideStep(pos, 0.05, 0, "whispering_woods");
  assert.equal(isBlocked(pos.x, pos.z, "whispering_woods", 0.3), false, "walked clear of it");
});

test("steering in the caverns rarely snags (under 1.5% of steers)", () => {
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blocked = (x: number, z: number) => isBlocked(x, z, "glimmering_caverns", 0.3);
  let snags = 0;
  const N = 400;
  for (let t = 0; t < N; t++) {
    let p: { x: number; z: number };
    do p = { x: (rnd() * 2 - 1) * 22, z: (rnd() * 2 - 1) * 22 };
    while (blocked(p.x, p.z));
    const a = rnd() * Math.PI * 2;
    const ux = Math.sin(a);
    const uz = Math.cos(a);
    let still = 0;
    for (let f = 0; f < 90; f++) {
      const bx = p.x;
      const bz = p.z;
      slideStep(p, (ux * 3) / 60, (uz * 3) / 60, "glimmering_caverns");
      still = Math.hypot(p.x - bx, p.z - bz) < 0.005 ? still + 1 : 0;
      if (still < 20) continue;
      const open = [25, -25, 45, -45].some((deg) => {
        const r = (deg * Math.PI) / 180;
        const rx = ux * Math.cos(r) - uz * Math.sin(r);
        const rz = ux * Math.sin(r) + uz * Math.cos(r);
        return !blocked(p.x + rx * 0.35, p.z + rz * 0.35) && !blocked(p.x + rx * 0.7, p.z + rz * 0.7);
      });
      if (open) snags++;
      break;
    }
  }
  assert.ok(snags <= N * 0.015, `${snags} of ${N} steers snagged`);
});

// (docs/caverns-roadmap.md R4.1) click-to-move as the client walks it (the path, its waypoints each
// taken only with a clear way on, the slide step, a re-plan when wedged), between random spots on
// every built map: every trip arrives, none much slower than its path
import { mapBounds } from "../shared/collision";
import { clearLine, findPath } from "../shared/pathfinding";
import type { MapId } from "../shared/types";
import { CAVERNS_LAYOUT, CAVE_ARRIVAL } from "../shared/worlds/caverns";

function trips(map: MapId, n: number) {
  let seed = 777;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const b = mapBounds(map);
  const spot = () => {
    for (;;) {
      const x = b.x0 + rnd() * (b.x1 - b.x0);
      const z = b.z0 + rnd() * (b.z1 - b.z0);
      if (!isBlocked(x, z, map, 0.3)) return { x, z };
    }
  };
  const stuck: string[] = [];
  let done = 0;
  while (done < n) {
    const a = spot();
    const g = spot();
    let path = findPath(map, a, g);
    if (!path || path.length === 0) continue;
    done++;
    const p = { ...a };
    let still = 0;
    let last = { ...p };
    let arrived = false;
    for (let t = 0; t < 60 * 60; t++) {
      const w = path[0];
      if (!w) {
        arrived = true;
        break;
      }
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (path.length === 1 ? d <= 0.05 : d <= 0.05 || (d <= 0.2 && clearLine(map, p, path[1]))) {
        path.shift();
        continue;
      }
      const stride = Math.min(3 / 60, d);
      const before = { ...p };
      slideStep(p, ((w.x - p.x) / d) * stride, ((w.z - p.z) / d) * stride, map);
      if (Math.hypot(p.x - before.x, p.z - before.z) < stride * 0.05) {
        path = findPath(map, p, g) ?? [];
        if (!path.length) break;
      }
      if (Math.hypot(p.x - last.x, p.z - last.z) > 0.05) {
        last = { ...p };
        still = 0;
      } else if (++still > 60) break;
    }
    if (!arrived) stuck.push(`${map}: from ${a.x.toFixed(2)},${a.z.toFixed(2)} to ${g.x.toFixed(2)},${g.z.toFixed(2)} stuck at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
  }
  return stuck;
}

for (const map of ["glimmering_caverns", "campfire_night", "whispering_woods", "cozy_lounge", "velvet_casino", "casino_vip", "boxing_ring", "sunset_beach"] as MapId[]) {
  test(`click-to-move never stalls: ${map}`, () => {
    const stuck = trips(map, 80);
    assert.deepEqual(stuck, []);
  });
}

test("the caverns: every patch of ground a body stands on is walked to from the arrival", () => {
  const S = 0.25;
  const X0 = -CAVERNS_LAYOUT.half;
  const N = Math.round((CAVERNS_LAYOUT.half * 2) / S);
  const open = (i: number, k: number) => !isBlocked(X0 + (i + 0.5) * S, X0 + (k + 0.5) * S, "glimmering_caverns", 0.3);
  const seen = new Uint8Array(N * N);
  const flood = (q0: number) => {
    let n = 0;
    const st = [q0];
    seen[q0] = 1;
    while (st.length) {
      const q = st.pop()!;
      n++;
      const i = q % N;
      const k = (q - i) / N;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di;
        const kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= N || kk >= N || seen[kk * N + ii] || !open(ii, kk)) continue;
        seen[kk * N + ii] = 1;
        st.push(kk * N + ii);
      }
    }
    return n;
  };
  flood(Math.floor((CAVE_ARRIVAL.z - X0) / S) * N + Math.floor((CAVE_ARRIVAL.x - X0) / S));
  const pockets: string[] = [];
  for (let q = 0; q < N * N; q++) {
    if (seen[q] || !open(q % N, Math.floor(q / N))) continue;
    const n = flood(q);
    // (a stray cell or two between colliders is no floor anyone sees; the ring inside the hearth's
    // benches is the fire's)
    const x = X0 + ((q % N) + 0.5) * S;
    const z = X0 + (Math.floor(q / N) + 0.5) * S;
    if (Math.hypot(x - CAVERNS_LAYOUT.hearth.x, z - CAVERNS_LAYOUT.hearth.z) < 2.2) continue;
    if (n > 5) pockets.push(`${n} cells at ${(X0 + ((q % N) + 0.5) * S).toFixed(1)},${(X0 + (Math.floor(q / N) + 0.5) * S).toFixed(1)}`);
  }
  assert.deepEqual(pockets, []);
});
