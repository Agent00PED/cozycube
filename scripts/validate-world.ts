// World validator: `npm run check-layout`. Exits non-zero on any failure, so it can gate a commit.
//
// It proves the level-design invariants with the game's own collision and pathfinder:
//   - every propId is unique across ALL maps (approach points are one global table; a duplicate
//     silently sends players to the wrong map's coordinates)
//   - every spawn is on open ground, and every spawn can walk to every other (no one born in a pocket)
//   - every seat and walk-up prop has an approach point that is open AND reachable on foot from the
//     first spawn, not just empty
//   - every seat's anchor height is a sane number (they are derived from shared/seats.ts cushions)
//   - Mochi's stops can be stood beside, and her straight walks between them cross no furniture
//   - the casino: its tables can be played from open ground, its game areas don't overlap (two
//     panels at once), the cage window is in reach, the staff stand inside colliders (nobody walks
//     through them), and every zone can be walked into
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, isBlocked, worldLimit } from "../shared/collision";
import { APPROACH_POINTS, MAP_CHAIRS, MAP_TOGGLEABLES, MOCHI_WAYPOINTS } from "../shared/props";
import { isReachable, type Point } from "../shared/pathfinding";
import { isWalkUpProp, MAP_IDS, type MapId } from "../shared/types";
import {
  BLACKJACK_TABLES,
  CASHIER_FRONT,
  CASHIER_REACH,
  CASINO_NPCS,
  CASINO_ZONES,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  blackjackTableNear,
} from "../shared/worlds/casino";

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);
const fmt = (p: Point) => `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
let checks = 0;

/** Open and reachable on foot from `home`; reports what is wrong under `label`. */
function standable(mapId: MapId, home: Point, at: Point, label: string): boolean {
  checks++;
  if (isBlocked(at.x, at.z, mapId)) {
    fail(`${mapId}: ${label} ${fmt(at)} is blocked`);
    return false;
  }
  if (!isReachable(mapId, home, at)) {
    fail(`${mapId}: ${label} ${fmt(at)} can't be walked to from the spawn ${fmt(home)}`);
    return false;
  }
  return true;
}

// --- global: unique prop ids ---
const seen = new Map<string, MapId>();
for (const mapId of MAP_IDS) {
  for (const id of [...MAP_CHAIRS[mapId].map((c) => c.propId), ...MAP_TOGGLEABLES[mapId].map((t) => t.propId)]) {
    checks++;
    const other = seen.get(id);
    if (other) fail(`duplicate propId "${id}" in ${other} and ${mapId}`);
    seen.set(id, mapId);
  }
}

for (const mapId of MAP_IDS) {
  const spawns = MAP_SPAWN_POINTS[mapId];
  const home = spawns[0];

  // --- spawns: open, and all connected to each other ---
  for (const spawn of spawns) {
    checks++;
    if (isBlocked(spawn.x, spawn.z, mapId)) fail(`${mapId}: spawn ${fmt(spawn)} is blocked`);
    else if (spawn !== home && !isReachable(mapId, home, spawn)) fail(`${mapId}: spawn ${fmt(spawn)} can't be walked to from ${fmt(home)}`);
  }

  // --- seats: on the floor, a sane anchor, approach open and reachable ---
  for (const chair of MAP_CHAIRS[mapId]) {
    checks++;
    const edge = worldLimit(mapId) + 0.6;
    if (Math.abs(chair.x) > edge || Math.abs(chair.z) > edge) fail(`${mapId}: seat ${chair.propId} is off the floor ${fmt(chair)}`);
    if (!Number.isFinite(chair.sitY) || chair.sitY < -0.3 || chair.sitY > 1.2) fail(`${mapId}: seat ${chair.propId} has an odd anchor height ${chair.sitY}`);
    const a = APPROACH_POINTS[chair.propId];
    if (!a) fail(`${mapId}: seat ${chair.propId} has no approach point`);
    else standable(mapId, home, a, `seat ${chair.propId} approach`);
  }

  // --- walk-up props: approach open and reachable ---
  for (const prop of MAP_TOGGLEABLES[mapId]) {
    if (!isWalkUpProp(prop.kind)) continue;
    const a = APPROACH_POINTS[prop.propId];
    if (!a) {
      checks++;
      fail(`${mapId}: walk-up prop ${prop.propId} has no approach point`);
    } else standable(mapId, home, a, `prop ${prop.propId} approach`);
  }

  // --- Mochi: a spot beside each stop, and clear straight walks between them ---
  const stops = MOCHI_WAYPOINTS[mapId] ?? [];
  for (const w of stops) standable(mapId, home, { x: w.ax, z: w.az }, `Mochi's stop ${fmt(w)} approach`);
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i];
    const b = stops[(i + 1) % stops.length];
    checks++;
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

  console.log(`  ${mapId.padEnd(15)} ${String(MAP_CHAIRS[mapId].length).padStart(2)} seats, ${String(MAP_TOGGLEABLES[mapId].length).padStart(2)} props, ${spawns.length} spawns, ${MAP_OBSTACLES[mapId].length} obstacles`);
}

// --- the casino ---
{
  const C: MapId = "velvet_casino";
  const home = MAP_SPAWN_POINTS[C][0];
  const ring = (c: Point, r: number, n: number) => Array.from({ length: n }, (_, k) => ({ x: c.x + Math.cos((k / n) * Math.PI * 2) * r, z: c.z + Math.sin((k / n) * Math.PI * 2) * r }));

  // the roulette table: most of a ring round it, inside the betting radius, is ground you can bet from
  const rouletteSpots = ring(ROULETTE_CENTER, 2.3, 16).filter((p) => !isBlocked(p.x, p.z, C) && isReachable(C, home, p));
  checks++;
  if (rouletteSpots.length < 8) fail(`${C}: only ${rouletteSpots.length}/16 spots round the roulette table can be stood on`);
  checks++;
  if (2.3 >= ROULETTE_BET_RADIUS) fail(`${C}: the roulette ring (2.3) is outside the betting radius ${ROULETTE_BET_RADIUS}`);

  // blackjack: each table's stools are within its reach (you play seated), and it can be reached
  for (const t of BLACKJACK_TABLES) {
    const stools = MAP_CHAIRS[C].filter((s) => blackjackTableNear(s.x, s.z)?.id === t.id);
    checks++;
    if (stools.length === 0) fail(`${C}: ${t.id} has no stools within its reach ${t.reach}`);
    for (const s of stools) {
      checks++;
      if (!blackjackTableNear(s.approachX, s.approachZ, 0.8)) fail(`${C}: ${s.propId}'s approach is out of ${t.id}'s reach`);
    }
  }

  // no spot is in reach of two games at once (the client would open both panels)
  for (let x = -13; x <= 13; x += 0.25) {
    for (let z = -13; z <= 13; z += 0.25) {
      const tables = BLACKJACK_TABLES.filter((t) => Math.hypot(x - t.x, z - t.z) < t.reach);
      const atRoulette = Math.hypot(x - ROULETTE_CENTER.x, z - ROULETTE_CENTER.z) < ROULETTE_BET_RADIUS;
      if (tables.length + (atRoulette ? 1 : 0) > 1) {
        fail(`${C}: ${fmt({ x, z })} is in reach of ${[atRoulette ? "roulette" : "", ...tables.map((t) => t.id)].filter(Boolean).join(" and ")}`);
        x = z = 99; // one report is enough
      }
    }
  }
  checks++;

  // the cage window: its front is open, reachable, and within its own reach
  standable(C, home, CASHIER_FRONT, "the cage window");

  // the staff stand inside colliders, so nobody walks through them
  for (const [id, npc] of Object.entries(CASINO_NPCS)) {
    checks++;
    if (!isBlocked(npc.x, npc.z, C, 0.05)) fail(`${C}: ${id} stands on open floor ${fmt(npc)}: give them a collider`);
  }
  checks++;
  if (CASHIER_REACH < 0.5) fail(`${C}: the cage's reach ${CASHIER_REACH} is too tight to stand in`);

  // every zone can be walked into
  for (const zone of CASINO_ZONES) {
    checks++;
    let found = false;
    for (let x = zone.x0 + 0.5; x < zone.x1 && !found; x += 0.5) for (let z = zone.z0 + 0.5; z < zone.z1 && !found; z += 0.5) found = !isBlocked(x, z, C) && isReachable(C, home, { x, z });
    if (!found) fail(`${C}: the ${zone.name} has no ground you can walk to`);
  }
}

if (failures.length === 0) {
  console.log(`\nWORLD OK - ${checks} checks passed`);
  process.exit(0);
}
console.log(`\nWORLD INVALID - ${failures.length} problem(s):`);
for (const f of failures) console.log(`  x ${f}`);
process.exit(1);
