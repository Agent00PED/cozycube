// World validator — run with `npm run validate-world`. Exits non-zero on any failure, so it can
// gate a deploy.
//
// It checks the level-design invariants that have actually broken before:
//   - every spawn point is on open ground (not in furniture, not in the sea, inside the island)
//   - every spawn can walk to every other spawn (one connected map, nobody born in a pocket)
//   - every seat and walk-up prop has an approach point that is open AND reachable on foot from
//     the spawn, using the game's own pathfinder — not just "the point is empty"
//   - every interactive prop sits at y >= 0 (nothing sunk through the slab)
//   - every propId is unique across ALL maps (approach points are one global table; a duplicate
//     silently sends players to the wrong map's coordinates)
//
// Hand-placed static meshes live in TSX, not data, so their y >= 0 check runs in the client:
// StaticBatch logs any mesh whose bottom dips below the slab in development builds.
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, isBlocked, walkY, worldLimit } from "../shared/collision";
import { APPROACH_POINTS, MAP_CHAIRS, MAP_TOGGLEABLES, MOCHI_WAYPOINTS } from "../shared/props";
import { isReachable } from "../shared/pathfinding";
import { ROULETTE_BET_RADIUS, ROULETTE_CENTER, isWalkUpProp, type MapId } from "../shared/types";

const maps = Object.keys(MAP_OBSTACLES) as MapId[];
const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);
const fmt = (p: { x: number; z: number }) => `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;

let checks = 0;

// --- global: unique prop ids ---
const seen = new Map<string, MapId>();
for (const mapId of maps) {
  const ids = [...MAP_CHAIRS[mapId].map((c) => c.propId), ...MAP_TOGGLEABLES[mapId].map((t) => t.propId)];
  for (const id of ids) {
    checks++;
    const other = seen.get(id);
    if (other) fail(`duplicate propId "${id}" in ${other} and ${mapId}`);
    seen.set(id, mapId);
  }
}

for (const mapId of maps) {
  const spawns = MAP_SPAWN_POINTS[mapId];
  const home = spawns[0];
  let mapChecks = 0;

  // --- spawns: open, and all connected to each other ---
  for (const spawn of spawns) {
    mapChecks++;
    if (isBlocked(spawn.x, spawn.z, mapId)) fail(`${mapId}: spawn ${fmt(spawn)} is blocked (furniture, sea or out of bounds)`);
    else if (spawn !== home && !isReachable(mapId, home, spawn)) fail(`${mapId}: spawn ${fmt(spawn)} can't be walked to from ${fmt(home)}`);
  }

  // --- seats: in bounds, approach open and reachable on foot ---
  for (const chair of MAP_CHAIRS[mapId]) {
    mapChecks++;
    if (Math.abs(chair.x) > worldLimit(mapId) + 0.6 || Math.abs(chair.z) > worldLimit(mapId) + 0.6) fail(`${mapId}: seat ${chair.propId} is off the island ${fmt(chair)}`);
    const a = APPROACH_POINTS[chair.propId];
    if (!a) {
      fail(`${mapId}: seat ${chair.propId} has no approach point`);
      continue;
    }
    if (isBlocked(a.x, a.z, mapId)) fail(`${mapId}: seat ${chair.propId} approach ${fmt(a)} is blocked`);
    else if (!isReachable(mapId, home, a)) fail(`${mapId}: seat ${chair.propId} approach ${fmt(a)} is unreachable from the spawn`);
  }

  // --- props: above the slab; walk-up props reachable ---
  for (const prop of MAP_TOGGLEABLES[mapId]) {
    mapChecks++;
    // "the slab" is the walk surface there: the lounge pit is a step down, the VIP lounge a step up
    const floor = walkY(mapId, prop.x, prop.z);
    if ((prop.y ?? 0) < floor - 0.01) fail(`${mapId}: prop ${prop.propId} is sunk below the floor (y = ${prop.y}, floor ${floor.toFixed(2)})`);
    if (!isWalkUpProp(prop.kind)) continue;
    const a = APPROACH_POINTS[prop.propId];
    if (!a) {
      fail(`${mapId}: walk-up prop ${prop.propId} has no approach point`);
      continue;
    }
    if (isBlocked(a.x, a.z, mapId)) fail(`${mapId}: prop ${prop.propId} approach ${fmt(a)} is blocked`);
    else if (!isReachable(mapId, home, a)) fail(`${mapId}: prop ${prop.propId} approach ${fmt(a)} is unreachable from the spawn`);
  }

  // Mochi wanders between her waypoints; each has a spot beside it a player can stand on.
  for (const w of MOCHI_WAYPOINTS[mapId] ?? []) {
    mapChecks++;
    const a = { x: w.ax, z: w.az };
    if (isBlocked(a.x, a.z, mapId)) fail(`${mapId}: Mochi waypoint ${fmt(w)} approach ${fmt(a)} is blocked`);
    else if (!isReachable(mapId, home, a)) fail(`${mapId}: Mochi waypoint ${fmt(w)} approach ${fmt(a)} is unreachable from the spawn`);
  }
  // ...and she walks a straight line from each spot to the next, so every leg must be clear of
  // furniture. A perched cat (a spot inside a collider, like the arcade's cabinet tops) walks
  // along her perch, so legs from or to a perch are not sampled.
  const spots = MOCHI_WAYPOINTS[mapId] ?? [];
  for (let i = 0; i < spots.length; i++) {
    const a = spots[i];
    const b = spots[(i + 1) % spots.length];
    if (isBlocked(a.x, a.z, mapId, 0.05) || isBlocked(b.x, b.z, mapId, 0.05)) continue;
    mapChecks++;
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2));
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const at = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
      if (isBlocked(at.x, at.z, mapId, 0.2)) {
        fail(`${mapId}: Mochi's walk from ${fmt(a)} to ${fmt(b)} crosses furniture at ${fmt(at)}`);
        break;
      }
    }
  }

  checks += mapChecks;
  console.log(`  ${mapId.padEnd(15)} ${MAP_CHAIRS[mapId].length} seats, ${MAP_TOGGLEABLES[mapId].length} props, ${spawns.length} spawns, ${MAP_OBSTACLES[mapId].length} obstacles`);
}

// --- casino: every side of the roulette table must be somewhere you can stand and bet ---
{
  const home = MAP_SPAWN_POINTS.velvet_casino[0];
  for (const [dx, dz] of [
    [0, 2.0],
    [0, -1.9],
    [2.6, 0],
    [-2.6, 0],
  ]) {
    checks++;
    const spot = { x: ROULETTE_CENTER.x + dx, z: ROULETTE_CENTER.z + dz };
    if (Math.hypot(dx, dz) > ROULETTE_BET_RADIUS) fail(`velvet_casino: roulette spot ${fmt(spot)} is outside the betting radius`);
    else if (isBlocked(spot.x, spot.z, "velvet_casino")) fail(`velvet_casino: roulette spot ${fmt(spot)} is blocked`);
    else if (!isReachable("velvet_casino", home, spot)) fail(`velvet_casino: roulette spot ${fmt(spot)} is unreachable`);
  }
}

if (failures.length === 0) {
  console.log(`\nWORLD OK — ${checks} checks passed`);
  process.exit(0);
}
console.log(`\nWORLD INVALID — ${failures.length} problem(s):`);
for (const f of failures) console.log(`  x ${f}`);
process.exit(1);
