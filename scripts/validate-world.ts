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
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, WORLD_LIMIT, isBlocked } from "../shared/collision";
import { APPROACH_POINTS, MAP_CHAIRS, MAP_TOGGLEABLES } from "../shared/props";
import { isReachable } from "../shared/pathfinding";
import { isWalkUpProp, type MapId } from "../shared/types";

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
    if (Math.abs(chair.x) > WORLD_LIMIT + 0.6 || Math.abs(chair.z) > WORLD_LIMIT + 0.6) fail(`${mapId}: seat ${chair.propId} is off the island ${fmt(chair)}`);
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
    if ((prop.y ?? 0) < 0) fail(`${mapId}: prop ${prop.propId} is sunk below the slab (y = ${prop.y})`);
    if (!isWalkUpProp(prop.kind)) continue;
    const a = APPROACH_POINTS[prop.propId];
    if (!a) {
      fail(`${mapId}: walk-up prop ${prop.propId} has no approach point`);
      continue;
    }
    if (isBlocked(a.x, a.z, mapId)) fail(`${mapId}: prop ${prop.propId} approach ${fmt(a)} is blocked`);
    else if (!isReachable(mapId, home, a)) fail(`${mapId}: prop ${prop.propId} approach ${fmt(a)} is unreachable from the spawn`);
  }

  checks += mapChecks;
  console.log(`  ${mapId.padEnd(15)} ${MAP_CHAIRS[mapId].length} seats, ${MAP_TOGGLEABLES[mapId].length} props, ${spawns.length} spawns, ${MAP_OBSTACLES[mapId].length} obstacles`);
}

if (failures.length === 0) {
  console.log(`\nWORLD OK — ${checks} checks passed`);
  process.exit(0);
}
console.log(`\nWORLD INVALID — ${failures.length} problem(s):`);
for (const f of failures) console.log(`  x ${f}`);
process.exit(1);
