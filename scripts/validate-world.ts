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
//   - the casino: its tables can be played from open ground, the roulette's betting ground and the
//     blackjack tables' never overlap (the two tables' may: the nearest is yours), every seat at the
//     poker tables and every game table's front are within its reach, the standing tables can be
//     played from all round their rims, every
//     walk-up prop's spot is within the server's reach of it, the cage window, the machines, the
//     tip jars, the bar, the gazette and the piano are in reach from where you stand (or sit), the
//     staff stand inside colliders (nobody walks through them), every seat sits on a floor (not
//     half on a step), every zone and both stages can be walked onto, and the crowd's spots are
//     open ground
//   - the Velvet Penthouse (a map of its own: casino_vip): its seats in reach of their tables, its
//     staff inside colliders, the elevator (where Bruno sets you down: its spawn) open, and Bruno's
//     doors open ground on the hall's stage
//   - the lounge's Velvet Boutique: Chloe and her mirror stand inside colliders, her counter's spot
//     in reach of both; the campfire's chalkboard stands in a collider beside Barnaby
//   - every built world (the fast-travel grid's, and the penthouse) has seats or props
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, isBlocked, walkRegions, worldLimit } from "../shared/collision";
import { APPROACH_POINTS, MAP_CHAIRS, MAP_TOGGLEABLES, MOCHI_WAYPOINTS } from "../shared/props";
import { isReachable, type Point } from "../shared/pathfinding";
import { INTERACT_RADIUS, isWalkUpProp, MAP_IDS, type MapId } from "../shared/types";
import {
  BAR_FRONT,
  BAR_REACH,
  BLACKJACK_TABLES,
  CASHIER_FRONT,
  CASHIER_REACH,
  CASINO_NPCS,
  CASINO_SEATS,
  CASINO_STAGES,
  CASINO_GAME_TABLES,
  CASINO_ZONES,
  GACHAPON_FRONT,
  GAZETTE_REACH,
  MACHINE_REACH,
  PATRON_SPOTS,
  PIANO_REACH,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  TIP_JARS,
  VIP_DOORS_FRONT,
  ZARA_FRONT,
  barDistance,
  blackjackTableNear,
  casinoFloorY,
  nearGameTable,
  tablePerimeter,
  type CasinoGameTable,
  type StandingTable,
} from "../shared/worlds/casino";
import { VIP_ARRIVAL, VIP_NPCS, VIP_SEATS } from "../shared/worlds/casino_vip";
import { BOUTIQUE, BOUTIQUE_REACH } from "../shared/worlds/lounge";
import { BARNABY_BOARD } from "../shared/worlds/campfire";
import { WORLDS } from "../shared/worlds/index";

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
    const onFloor = walkRegions(mapId).some((r) => chair.x >= r.x0 - 0.6 && chair.x <= r.x1 + 0.6 && chair.z >= r.z0 - 0.6 && chair.z <= r.z1 + 0.6);
    if (!onFloor) fail(`${mapId}: seat ${chair.propId} is off the floor ${fmt(chair)}`);
    if (!Number.isFinite(chair.sitY) || chair.sitY < -0.3 || chair.sitY > 1.2) fail(`${mapId}: seat ${chair.propId} has an odd anchor height ${chair.sitY}`);
    const a = APPROACH_POINTS[chair.propId];
    if (!a) fail(`${mapId}: seat ${chair.propId} has no approach point`);
    else standable(mapId, home, a, `seat ${chair.propId} approach`);
  }

  // --- walk-up props: approach open and reachable, and within the server's reach of the prop ---
  for (const prop of MAP_TOGGLEABLES[mapId]) {
    if (!isWalkUpProp(prop.kind)) continue;
    const a = APPROACH_POINTS[prop.propId];
    if (!a) {
      checks++;
      fail(`${mapId}: walk-up prop ${prop.propId} has no approach point`);
      continue;
    }
    standable(mapId, home, a, `prop ${prop.propId} approach`);
    checks++;
    if (prop.kind !== "cat" && Math.hypot(a.x - prop.x, a.z - prop.z) > INTERACT_RADIUS) fail(`${mapId}: prop ${prop.propId}'s approach ${fmt(a)} is out of reach (${INTERACT_RADIUS}) of it`);
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

  // no spot is in reach of the roulette and a blackjack table at once (two boards to choose from);
  // the crescent's tables may share ground, where the nearest one is yours
  const H = worldLimit(C);
  for (let x = -H; x <= H; x += 0.25) {
    for (let z = -H; z <= H; z += 0.25) {
      const table = blackjackTableNear(x, z);
      const atRoulette = Math.hypot(x - ROULETTE_CENTER.x, z - ROULETTE_CENTER.z) < ROULETTE_BET_RADIUS;
      if (table && atRoulette) {
        fail(`${C}: ${fmt({ x, z })} is in reach of the roulette and ${table.id}`);
        x = z = 99; // one report is enough
      }
    }
  }
  checks++;
  // each stool plays at its own table (the nearest), not a neighbour's
  for (const s of CASINO_SEATS.filter((c) => c.propId.startsWith("seat_bj"))) {
    checks++;
    const want = `blackjack_0${s.propId.charAt(7)}`;
    const got = blackjackTableNear(s.x, s.z)?.id;
    if (got !== want) fail(`${C}: ${s.propId} plays at ${got ?? "no table"}, not ${want}`);
  }

  // the cage window: its front is open, reachable, and within its own reach
  standable(C, home, CASHIER_FRONT, "the cage window");

  // the poker table: every chair and the table's front are in its reach; the dice, the Turf Club,
  // the coin pusher and the billiards can be played from their fronts
  for (const s of CASINO_SEATS.filter((c) => c.propId.startsWith("seat_poker"))) {
    checks++;
    if (!nearGameTable("poker", s.x, s.z)) fail(`${C}: ${s.propId} is out of the poker table's reach`);
  }
  const gameProp: Record<CasinoGameTable, string> = { poker: "poker_table", poker_vip: "vip_poker_table", baccarat: "baccarat_table", craps: "craps_table", derby: "derby_table", pusher: "coin_pusher", billiards: "billiards_table" };
  for (const game of Object.keys(CASINO_GAME_TABLES) as CasinoGameTable[]) {
    const a = APPROACH_POINTS[gameProp[game]];
    checks++;
    if (!a || !nearGameTable(game, a.x, a.z)) fail(`${game === "poker_vip" || game === "baccarat" ? "casino_vip" : C}: the ${game} table's front ${a ? fmt(a) : "(none)"} is out of its reach`);
  }

  // the standing tables: open ground all round their rims, and every open spot within reach (you
  // walk up from any side)
  const standingReach: Record<StandingTable, (p: Point) => boolean> = {
    roulette: (p) => Math.hypot(p.x - ROULETTE_CENTER.x, p.z - ROULETTE_CENTER.z) < ROULETTE_BET_RADIUS,
    craps: (p) => nearGameTable("craps", p.x, p.z),
    derby: (p) => nearGameTable("derby", p.x, p.z),
    billiards: (p) => nearGameTable("billiards", p.x, p.z),
  };
  for (const t of Object.keys(standingReach) as StandingTable[]) {
    const ring = tablePerimeter(t);
    const open = ring.filter((p) => !isBlocked(p.x, p.z, C) && isReachable(C, home, p));
    checks++;
    if (open.length < ring.length / 2) fail(`${C}: only ${open.length}/${ring.length} spots round the ${t} table can be stood on`);
    for (const p of open) {
      checks++;
      if (!standingReach[t](p)) fail(`${C}: the spot ${fmt(p)} round the ${t} table is out of its reach`);
    }
  }

  // Bruno's doors up to the penthouse: open ground on the stage
  standable(C, home, VIP_DOORS_FRONT, "Bruno's doors (the stage)");

  // the staff stand inside colliders, so nobody walks through them
  for (const [id, npc] of Object.entries(CASINO_NPCS)) {
    checks++;
    if (!isBlocked(npc.x, npc.z, C, 0.05)) fail(`${C}: ${id} stands on open floor ${fmt(npc)}: give them a collider`);
  }
  checks++;
  if (CASHIER_REACH < 0.5) fail(`${C}: the cage's reach ${CASHIER_REACH} is too tight to stand in`);

  // the machines, the jars, the bar, the paper and the piano: in reach from where you stand
  const inReach = (label: string, from: Point, to: Point, reach: number) => {
    checks++;
    if (Math.hypot(from.x - to.x, from.z - to.z) > reach) fail(`${C}: ${label} ${fmt(from)} is out of reach (${reach}) of ${fmt(to)}`);
  };
  const props = MAP_TOGGLEABLES[C];
  const at = (id: string) => props.find((p) => p.propId === id)!;
  inReach("Madame Zara's front", ZARA_FRONT, at("zara_booth"), MACHINE_REACH);
  inReach("the capsule machine's front", GACHAPON_FRONT, at("capsule_machine"), MACHINE_REACH);
  for (const [dealer, jar] of Object.entries(TIP_JARS)) {
    inReach(`${dealer}'s tip jar front`, jar.front, jar, MACHINE_REACH);
    standable(C, home, jar.front, `${dealer}'s tip jar front`);
  }
  checks++;
  if (barDistance(BAR_FRONT.x, BAR_FRONT.z) > BAR_REACH) fail(`${C}: the bar's front ${fmt(BAR_FRONT)} is out of the bar's reach`);
  for (const s of CASINO_SEATS.filter((c) => c.propId.startsWith("seat_bar"))) {
    checks++;
    if (barDistance(s.x, s.z) > BAR_REACH) fail(`${C}: ${s.propId} is out of the bar's reach: its sitter can't order`);
  }
  for (const s of CASINO_SEATS.filter((c) => c.propId.startsWith("seat_sofa"))) inReach(`${s.propId} (reading the paper)`, s, at("velvet_gazette"), GAZETTE_REACH);
  inReach("the piano bench", CASINO_SEATS.find((c) => c.propId === "seat_piano")!, at("piano_keys"), PIANO_REACH);
  inReach("the piano's front", APPROACH_POINTS.piano_keys, at("piano_keys"), PIANO_REACH);
  inReach("the gazette's front", APPROACH_POINTS.velvet_gazette, at("velvet_gazette"), GAZETTE_REACH);

  // every seat sits on a floor: the hall's, the pit's or the lounge's, never half on a step
  const floors = new Set([0, ...CASINO_STAGES.map((st) => st.h)]);
  for (const s of CASINO_SEATS) {
    checks++;
    if (!floors.has(s.floor)) fail(`${C}: ${s.propId} stands on a step (floor ${s.floor.toFixed(3)})`);
  }
  // both stages can be walked onto (up their steps)
  for (const st of CASINO_STAGES) {
    checks++;
    let found = false;
    for (let x = st.x0 + 0.5; x < st.x1 && !found; x += 0.5) for (let z = st.z0 + 0.5; z < st.z1 && !found; z += 0.5) found = casinoFloorY(x, z) === st.h && !isBlocked(x, z, C) && isReachable(C, home, { x, z });
    if (!found) fail(`${C}: the ${st.id} stage can't be walked onto`);
  }
  // the crowd's spots: open ground (they walk through nobody, but not through furniture) you can reach
  for (const [group, spots] of Object.entries(PATRON_SPOTS)) {
    for (const p of Array.isArray(spots) ? spots : [spots]) {
      checks++;
      if (isBlocked(p.x, p.z, C, 0.25) || !isReachable(C, home, p)) fail(`${C}: the crowd's ${group} spot ${fmt(p)} is not open ground`);
    }
  }

  // every zone can be walked into
  for (const zone of CASINO_ZONES) {
    checks++;
    let found = false;
    for (let x = zone.x0 + 0.5; x < zone.x1 && !found; x += 0.5) for (let z = zone.z0 + 0.5; z < zone.z1 && !found; z += 0.5) found = !isBlocked(x, z, C) && isReachable(C, home, { x, z });
    if (!found) fail(`${C}: the ${zone.name} has no ground you can walk to`);
  }
}

// --- the Velvet Penthouse: a map of its own, reached only through Bruno's doors ---
{
  const V: MapId = "casino_vip";
  checks++;
  if (MAP_SPAWN_POINTS[V][0] !== VIP_ARRIVAL) fail(`${V}: its spawn is not the elevator ${fmt(VIP_ARRIVAL)}`);
  checks++;
  if (isBlocked(VIP_ARRIVAL.x, VIP_ARRIVAL.z, V)) fail(`${V}: the elevator ${fmt(VIP_ARRIVAL)} is blocked`);
  for (const s of VIP_SEATS.filter((c) => c.propId.startsWith("seat_vpoker"))) {
    checks++;
    if (!nearGameTable("poker_vip", s.x, s.z)) fail(`${V}: ${s.propId} is out of the high-limit poker table's reach`);
  }
  for (const s of VIP_SEATS.filter((c) => c.propId.startsWith("seat_bacc"))) {
    checks++;
    if (!nearGameTable("baccarat", s.x, s.z)) fail(`${V}: ${s.propId} is out of the baccarat table's reach`);
  }
  for (const [id, npc] of Object.entries(VIP_NPCS)) {
    checks++;
    if (!isBlocked(npc.x, npc.z, V, 0.05)) fail(`${V}: ${id} stands on open floor ${fmt(npc)}: give them a collider`);
  }
  // nothing of the penthouse is on the hall's floor, and nothing of the hall on the penthouse's
  checks++;
  if (!isBlocked(VIP_ARRIVAL.x, VIP_ARRIVAL.z, "velvet_casino")) fail(`${V}: the elevator ${fmt(VIP_ARRIVAL)} is open floor in the hall too`);
}

// --- the lounge's Velvet Boutique, and the campfire's chalkboard ---
{
  const Lg: MapId = "cozy_lounge";
  for (const [id, at] of [["Chloe", BOUTIQUE.chloe], ["the cheval mirror", BOUTIQUE.mirror]] as const) {
    checks++;
    if (!isBlocked(at.x, at.z, Lg, 0.05)) fail(`${Lg}: ${id} stands on open floor ${fmt(at)}: give them a collider`);
    checks++;
    if (Math.hypot(BOUTIQUE.approach.x - at.x, BOUTIQUE.approach.z - at.z) > BOUTIQUE_REACH + 1.0) fail(`${Lg}: the boutique's spot ${fmt(BOUTIQUE.approach)} is out of reach of ${id}`);
  }
  standable(Lg, MAP_SPAWN_POINTS[Lg][0], BOUTIQUE.approach, "the boutique's spot");
  checks++;
  if (!isBlocked(BARNABY_BOARD.x, BARNABY_BOARD.z, "campfire_night", 0.05)) fail(`campfire_night: Barnaby's chalkboard stands on open floor ${fmt(BARNABY_BOARD)}: give it a collider`);
}

// --- every built world has something in it ---
for (const w of Object.values(WORLDS).filter((w) => w.built)) {
  checks++;
  if (MAP_CHAIRS[w.mapId].length + MAP_TOGGLEABLES[w.mapId].length === 0) fail(`${w.mapId}: a built world with no seats and no props`);
}

if (failures.length === 0) {
  console.log(`\nWORLD OK - ${checks} checks passed`);
  process.exit(0);
}
console.log(`\nWORLD INVALID - ${failures.length} problem(s):`);
for (const f of failures) console.log(`  x ${f}`);
process.exit(1);
