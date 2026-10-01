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
//   - the Velvet Ring: its corners (their steps' feet open, reachable and in reach of the steps;
//     inside the ropes), the neutral corners inside them, every ring-out landing open floor, Coach
//     Bruno inside a collider with his counter's spot in reach, the chalkboard's and the gym's spots
//     in reach, the bleachers' front open (where a beaten fighter stands when every seat there is
//     taken), and the ring itself closed to every spectator; the regulars: Jimmy the Slugger and Kip
//     at the heavy bag inside colliders (Jimmy's spot open, reachable and in reach), the fans'
//     bleacher seats taken out of the seats nobody else may sit on; the trainee inside a collider, the
//     fight night's crowd between the seats (never on one), Ref Barnaby's corner inside the ropes and
//     his walk on the apron (between the ropes and its edge)
//   - the Glimmering Caverns (docs/caverns-design.md): the builder's terrain JSON in step with the
//     layout; the adit's mouth, Gus's workstation, the forge, the anvil and Finnegan's front open and
//     reachable, Gus, Finnegan and the Hound's Hand inside colliders; every step between walkable
//     cells no steeper than STEEPEST_WALK (no stairs); each trail's ends walked to and at their
//     heights, its tread no steeper than TRAIL_STEEPEST, the switchback from the basecamp's shelf to
//     the overlook; every ore node inside its own collider, mined from its own floor and in reach,
//     reachable from the adit; each thermal seat's dry exit open and near it; the winch's two stands
//     open and in reach of its props; the stream's fords walked across; a cast onto open water from
//     a dozen shore spots round the lake, never with the angler's back or side to it; the design's
//     walking times from the arrival (each tier's nearest node, the whole loop with the winch); every
//     spot inside the camera's bounds (+-21); and in the woods the adit's front open and reachable,
//     Old Flint inside a collider with his spot in reach, and the arrival from the caverns open
//   - every built world (the fast-travel grid's, and the penthouse) has seats or props
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, isBlocked, slideStep, walkRegions, walkY, worldLimit } from "../shared/collision";
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
  BIG_SIX_SPOTS,
  PINBALL_MACHINES,
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
import { VAULT_SLOTS, VIP_ARRIVAL, VIP_BACCARAT, VIP_BACCARAT_PAD, VIP_BLACKJACK, VIP_FOUNTAIN, VIP_FOUNTAIN_BOXES, VIP_JUKEBOX_FRONT, VIP_NPCS, VIP_OFFSET, VIP_PROPS, VIP_RAIL, VIP_SEATS, VIP_TABLE_BOXES } from "../shared/worlds/casino_vip";
import { findPath } from "../shared/pathfinding";
import type { AABB } from "../shared/collision";
import { BOUTIQUE, BOUTIQUE_REACH } from "../shared/worlds/lounge";
import { BARNABY_BOARD, BARNABY_FRONT, BUSTER_FRONT, CAMPFIRE_LAYOUT, CAMP_ARCHWAY_FRONT, CAMP_TREES, FISHING_SPOTS, GALLERY_FRONT, SPLITBLOCK_FRONT, TELESCOPE_FRONT, WORKBENCH_FRONT, campGroundY, campLand } from "../shared/worlds/campfire";
import { CAMPFIRE_TERRAIN_PATH, campfireTerrainText } from "./campfire-terrain";
import { WORLDS } from "../shared/worlds/index";
import { ANVIL, ANVIL_FRONT, ANVIL_REACH, CAST_DEPTH, CAVE_ADIT_FRONT, CAVE_ARRIVAL, CAVE_LAKE, CAVE_TRAILS, CAVE_WATER_Y, CAVE_WINCH, CAVERNS_CAMERA, CAVERNS_LAYOUT, CAVERNS_MASK, DOLINE, WINCH_REACH, WINCH_RIDE_S, FINNEGAN, FINNEGAN_FRONT, FINNEGAN_REACH, FORGE, FORGE_FRONT, FORGE_REACH, GUS, GUS_FRONT, GUS_REACH, MASK_CELL, MASK_N, ORE_NODES, OVERLOOK, SHORE_REACH, STEEPEST_WALK, THERMAL_REACH, THERMAL_SEATS, TRAIL_STEEPEST, HEARTH_SEATS, PHOTO_SPOT, JOURNAL_PAGES, CAVE_PEARLS, FIND_REACH, cavernsFloorY, cavernsWalkable, inLakeWater, lakeFactor, nearestWater, onBeach, oreReach, shoreCast, trailSlope, RAFT, raftAt, streamCast, STREAM_REACHES, cavernsSurface, SURFACE, STEEPEST_STEP } from "../shared/worlds/caverns";
import { readFileSync, existsSync } from "node:fs";
import { CAVERNS_TERRAIN_PATH, cavernsTerrainText } from "./caverns-terrain";
import { FOREST_ADIT_FRONT, OLD_FLINT, OLD_FLINT_FRONT, OLD_FLINT_REACH, WOODS_FROM_CAVERNS } from "../shared/worlds/forest";
import { BAG_BOXER, REF_APRON, REF_HOME, RING_CROWD, TRAINEE, CHALKBOARD, CHALKBOARD_FRONT, CHALKBOARD_REACH, COACH_BRUNO, COACH_FRONT, COACH_REACH, CORNER_REACH, GYM_REACH, HEAVY_BAG, HEAVY_BAG_FRONT, JIMMY, JIMMY_FRONT, JIMMY_REACH, NEUTRAL_CORNERS, RING, RING_BENCH_FRONT, RING_CORNERS, RING_FANS, RING_SEATS, SPEED_BAG_FRONT, WEIGH_SCALE, WEIGH_SCALE_FRONT, outsideRopes, ringOutLanding } from "../shared/worlds/boxing_ring";

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
    // (over the floor under it: the casino's stages and the caverns' doline stand higher; the caverns'
    // thermal seats sink a little below theirs, into the warm water)
    const floor = walkY(mapId, chair.approachX, chair.approachZ);
    // (a thermal terrace's seat sits chest-deep in its pool, carved into the slope: its dry exit on
    // the bank can stand well over the water)
    const lowest = chair.propId.startsWith("thermal_") ? -1.0 : -0.45;
    if (!Number.isFinite(chair.sitY) || chair.sitY - floor < lowest || chair.sitY - floor > 1.2) fail(`${mapId}: seat ${chair.propId} has an odd anchor height ${chair.sitY} (its floor ${floor})`);
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
  // (the penthouse's table on its own map)
  for (const t of BLACKJACK_TABLES) {
    const stools = MAP_CHAIRS[t.map].filter((s) => blackjackTableNear(s.x, s.z)?.id === t.id);
    checks++;
    if (stools.length !== t.stools.length) fail(`${t.map}: ${t.id} has ${stools.length} stools within its reach ${t.reach}, not ${t.stools.length}`);
    for (const s of stools) {
      checks++;
      if (!t.stools.includes(s.propId)) fail(`${t.map}: ${s.propId} is in ${t.id}'s reach but not one of its stools`);
      if (!blackjackTableNear(s.approachX, s.approachZ, 0.8)) fail(`${t.map}: ${s.propId}'s approach is out of ${t.id}'s reach`);
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
  const gameProp: Record<CasinoGameTable, string> = { poker: "poker_table", poker_vip: "vip_poker_table", baccarat: "baccarat_table", baccarat_hall: "hall_baccarat_table", craps: "craps_table", derby: "derby_table", pusher: "coin_pusher", pusher_high: "coin_pusher_high", billiards: "billiards_table", bigsix: "big_six", pinball: "pinball_01" };
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
  // the Big Six's ledge: every spot you bet from is open, reachable and in reach of the ledge
  BIG_SIX_SPOTS.forEach((p, i) => {
    if (standable(C, home, p, `the Big Six's spot ${i + 1}`) && !nearGameTable("bigsix", p.x, p.z)) fail(`${C}: the Big Six's spot ${i + 1} ${fmt(p)} is out of its reach`);
  });
  // both pinball cabinets: each one's front is in reach of the pair
  for (const m of PINBALL_MACHINES) {
    checks++;
    if (!nearGameTable("pinball", m.approachX, m.approachZ)) fail(`${C}: ${m.propId}'s front is out of the pinball machines' reach`);
  }

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
  // the twin Golden Vaults: each one's front open and reachable from the elevator
  for (const v of VAULT_SLOTS) standable(V, VIP_ARRIVAL, v.approach, v.propId);
  for (const [id, npc] of Object.entries(VIP_NPCS)) {
    checks++;
    if (!isBlocked(npc.x, npc.z, V, 0.05)) fail(`${V}: ${id} stands on open floor ${fmt(npc)}: give them a collider`);
  }
  // nothing of the penthouse is on the hall's floor, and nothing of the hall on the penthouse's
  checks++;
  if (!isBlocked(VIP_ARRIVAL.x, VIP_ARRIVAL.z, "velvet_casino")) fail(`${V}: the elevator ${fmt(VIP_ARRIVAL)} is open floor in the hall too`);

  // --- the two card tables: blackjack (emerald) at (-3.0, 2.2) and baccarat (crimson) at (3.0,
  // 2.2) in the suite's own frame; each dealer on the balcony's side (south, +z) facing north over
  // the felt; the stools on the fountain's side (north) facing south (rotation 0); each table's
  // click pad or front on its north side ---
  const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
  const tables = [
    { name: "blackjack", at: VIP_BLACKJACK, want: { x: -3.0, z: 2.2 }, dealer: VIP_NPCS.gideonVip, stools: "seat_vbj", pad: VIP_PROPS.find((q) => q.propId === VIP_BLACKJACK.id) },
    { name: "baccarat", at: VIP_BACCARAT, want: { x: 3.0, z: 2.2 }, dealer: VIP_NPCS.scarlettVip, stools: "seat_bacc", pad: { x: VIP_BACCARAT_PAD.x, z: VIP_BACCARAT_PAD.z, approachX: VIP_BACCARAT_PAD.x, approachZ: VIP_BACCARAT_PAD.z } },
  ];
  for (const t of tables) {
    checks++;
    if (!near(t.at.x - VIP_OFFSET.x, t.want.x) || !near(t.at.z - VIP_OFFSET.z, t.want.z)) fail(`${V}: the ${t.name} table is at ${fmt({ x: t.at.x - VIP_OFFSET.x, z: t.at.z - VIP_OFFSET.z })} in the suite, not ${fmt(t.want)}`);
    checks++;
    if (!(t.dealer.z > t.at.z + 0.2) || Math.abs(Math.cos(t.dealer.yaw) + 1) > 0.02) fail(`${V}: the ${t.name} table's dealer is not on the balcony's side facing north (${fmt(t.dealer)}, yaw ${t.dealer.yaw.toFixed(2)})`);
    for (const st of VIP_SEATS.filter((c) => c.propId.startsWith(t.stools))) {
      checks++;
      if (!(st.z < t.at.z - 0.5) || Math.abs(st.rotationY) > 1e-6) fail(`${V}: ${st.propId} is not on the fountain's side facing south (${fmt(st)}, rotation ${st.rotationY.toFixed(2)})`);
    }
    checks++;
    if (!t.pad || !(t.pad.approachZ < t.at.z - 0.3)) fail(`${V}: the ${t.name} table's click pad or front is not on its north side`);
  }

  // --- the walkways round the card tables and the fountain ---
  const gapOf = (a: AABB, b: AABB) => Math.hypot(Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX)), Math.max(0, Math.max(a.minZ, b.minZ) - Math.min(a.maxZ, b.maxZ)));
  const groupGap = (A: AABB[], B: AABB[]) => Math.min(...A.flatMap((a) => B.map((b) => gapOf(a, b))));
  // the fountain's round base to every card table's stool (round too), the Duchess on hers: 2.0 m
  const stools = [...VIP_SEATS.filter((c) => c.propId.startsWith("seat_bacc") || c.propId.startsWith("seat_vbj")).map((c) => ({ id: c.propId, x: c.x, z: c.z, r: 0.22 })), { id: "the Duchess's stool", x: VIP_NPCS.duchess.x, z: VIP_NPCS.duchess.z, r: 0.3 }];
  for (const st of stools) {
    checks++;
    const clear = Math.hypot(st.x - VIP_FOUNTAIN.x, st.z - VIP_FOUNTAIN.z) - VIP_FOUNTAIN.r - st.r;
    if (clear < 2.0) fail(`${V}: ${st.id} is ${clear.toFixed(2)} m from the fountain's base (2.00 at least)`);
  }
  // each card table (its colliders: the table, its stools, its dealer) 1.10 m clear of the front
  // rail: a walk along the balcony behind the dealers
  for (const [name, boxes] of Object.entries(VIP_TABLE_BOXES)) {
    checks++;
    const clear = VIP_RAIL.z - Math.max(...boxes.map((b) => b.maxZ));
    if (clear < 1.1) fail(`${V}: the ${name} table is ${clear.toFixed(2)} m from the front rail (1.10 at least)`);
  }
  // the Grand Central Promenade between the two tables: 1.80 m
  checks++;
  const promenade = groupGap(VIP_TABLE_BOXES.baccarat, VIP_TABLE_BOXES.blackjack);
  if (promenade < 1.8) fail(`${V}: the promenade between the card tables is ${promenade.toFixed(2)} m (1.80 at least)`);
  // the champagne tower's sunburst ring: nothing but the tower itself within 1.80 m of its middle
  // (no table, stool, dealer or chair: a walk all the way round it)
  const towerBoxes = new Set(VIP_FOUNTAIN_BOXES);
  for (const b of MAP_OBSTACLES[V].filter((o) => !towerBoxes.has(o))) {
    checks++;
    const d = Math.hypot(Math.max(b.minX - VIP_FOUNTAIN.x, 0, VIP_FOUNTAIN.x - b.maxX), Math.max(b.minZ - VIP_FOUNTAIN.z, 0, VIP_FOUNTAIN.z - b.maxZ));
    if (d < 1.8) fail(`${V}: something at ${fmt({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 })} is ${d.toFixed(2)} m from the champagne tower's middle (its ring is 1.80 m clear)`);
  }
  // all the way round the fountain: a ring of spots just off its base, each open, each walked to
  // from the last (and the first from the elevator)
  const ring = Array.from({ length: 24 }, (_, k) => ({ x: VIP_FOUNTAIN.x + Math.cos((k / 24) * 2 * Math.PI) * (VIP_FOUNTAIN.r + 0.5), z: VIP_FOUNTAIN.z + Math.sin((k / 24) * 2 * Math.PI) * (VIP_FOUNTAIN.r + 0.5) }));
  ring.forEach((p, k) => standable(V, k === 0 ? VIP_ARRIVAL : ring[k - 1], p, `the walk round the fountain (${k * 15} degrees)`));
  // from the jukebox corner to the elevator: a clean walk, no detour round a table
  checks++;
  const route = findPath(V, VIP_JUKEBOX_FRONT, VIP_ARRIVAL);
  if (!route) fail(`${V}: no walk from the jukebox ${fmt(VIP_JUKEBOX_FRONT)} to the elevator`);
  else {
    let len = 0;
    let at: Point = VIP_JUKEBOX_FRONT;
    for (const w of route) {
      len += Math.hypot(w.x - at.x, w.z - at.z);
      at = w;
    }
    const straight = Math.hypot(VIP_ARRIVAL.x - VIP_JUKEBOX_FRONT.x, VIP_ARRIVAL.z - VIP_JUKEBOX_FRONT.z);
    if (len > straight * 1.25) fail(`${V}: the walk from the jukebox to the elevator is ${len.toFixed(1)} m against ${straight.toFixed(1)} m straight: something is in the way`);
  }
  // a player seated at a card table clears everything that is not their own table (a wall, a palm,
  // the fountain, the other table)
  for (const [name, own] of Object.entries(VIP_TABLE_BOXES)) {
    const others = MAP_OBSTACLES[V].filter((b) => !own.includes(b));
    for (const seat of VIP_SEATS.filter((c) => (name === "baccarat" ? c.propId.startsWith("seat_bacc") : c.propId.startsWith("seat_vbj")))) {
      checks++;
      const me: AABB = { minX: seat.x - 0.3, maxX: seat.x + 0.3, minZ: seat.z - 0.3, maxZ: seat.z + 0.3 };
      const clear = Math.min(groupGap([me], others), VIP_RAIL.x - me.maxX, VIP_RAIL.z - me.maxZ);
      if (clear < 0.15) fail(`${V}: someone sitting on ${seat.propId} would brush something else (${clear.toFixed(2)} m)`);
    }
  }
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

// --- the campfire's strings of lights: every end tied to something (no end floating in the air):
// the tipi's canvas, a pine's boughs (build_campfire.py pine: its three tiers' profile), a mounting
// peg's tip, the light pole's top or an awning pole's top ---
{
  const CL = CAMPFIRE_LAYOUT;
  /** How far a pine's boughs reach out at a height (the builder's lathe profiles, less their jitter). */
  const boughs = (s: number, y: number) => {
    let r = 0;
    for (const [rad, base, tall] of [
      [1.05, 0.55, 1.15],
      [0.82, 1.25, 1.0],
      [0.58, 1.9, 0.95],
    ]) {
      const R = rad * s;
      const y0 = base * s;
      const H = tall * s;
      const prof: [number, number][] = [
        [0, y0],
        [R * 0.95, y0 + 0.02 * s],
        [R, y0 + 0.1 * s],
        [R * 0.72, y0 + 0.28 * H],
        [R * 0.4, y0 + 0.6 * H],
        [0, y0 + H],
      ];
      for (let k = 0; k + 1 < prof.length; k++) {
        const [r0, h0] = prof[k];
        const [r1, h1] = prof[k + 1];
        if (y >= h0 && y <= h1 && h1 > h0) r = Math.max(r, r0 + ((r1 - r0) * (y - h0)) / (h1 - h0));
      }
    }
    return r * 0.94;
  };
  const vanFront = CL.van.z + CL.van.w / 2 + CL.van.awning;
  const anchored = ([x, y, z]: number[]): string | null => {
    const t = CL.tent;
    if (y <= t.h && Math.hypot(x - t.x, z - t.z) <= t.r * (1 - y / t.h) + 0.12) return "the tipi";
    for (const tr of CL.trees) if (Math.hypot(x - tr.x, z - tr.z) <= boughs(tr.s, y)) return "a pine's boughs";
    for (const pg of CL.pegs) if (Math.hypot(x - pg.tip[0], z - pg.tip[1]) <= 0.05 && Math.abs(y - pg.y) <= 0.05) return "a peg";
    const sp = CL.stringPole;
    if (Math.hypot(x - sp.x, z - sp.z) <= 0.2 && Math.abs(y - sp.h) <= 0.15) return "the light pole";
    for (const px of [CL.van.x - 0.85, CL.van.x + 1.25]) if (Math.hypot(x - px, z - vanFront) <= 0.08 && y <= 1.6 && y >= 1.3) return "an awning pole";
    return null;
  };
  CL.strings.forEach((st, i) => {
    for (const end of [st.a, st.b]) {
      checks++;
      if (!anchored(end)) fail(`campfire_night: string of lights ${i + 1}'s end ${JSON.stringify(end)} floats in the air: tie it to a pine, a peg, a pole or the tipi`);
    }
  });
  // (a peg's tip sticks out of its pine's boughs, where the wire can be seen tied to it)
  for (const pg of CL.pegs) {
    checks++;
    const tree = CL.trees.find((tr) => Math.hypot(tr.x - pg.x, tr.z - pg.z) < 0.05);
    if (!tree) fail(`campfire_night: the peg at ${fmt(pg)} is in no pine`);
    else if (Math.hypot(pg.tip[0] - pg.x, pg.tip[1] - pg.z) <= boughs(tree.s, pg.y) / 0.94) fail(`campfire_night: the peg at ${fmt(pg)} is hidden in its pine's boughs`);
  }
}

// --- the campfire's ground (docs/campfire-design.md): the builder's grid in step with the layout,
// nothing walked steeper than the walk's limit, what is built standing on level ground, and every
// place a short walk from the hearth ---
{
  const F: MapId = "campfire_night";
  const CL = CAMPFIRE_LAYOUT;
  checks++;
  if (!existsSync(CAMPFIRE_TERRAIN_PATH) || readFileSync(CAMPFIRE_TERRAIN_PATH, "utf8").replace(/\r\n/g, "\n") !== campfireTerrainText()) fail(`${F}: scripts/blender/data/campfire_terrain.json is stale: run npm run campfire-terrain, then rebuild campfire.glb`);
  // (the land itself, the river's cut banks aside: no one walks those)
  const STEEPEST = 24;
  let worst = 0;
  let worstAt = { x: 0, z: 0 };
  const lim = worldLimit(F);
  for (let x = -lim; x <= lim; x += 0.25)
    for (let z = -lim; z <= lim; z += 0.25) {
      const rise = Math.max(Math.abs(campLand(x + 0.25, z) - campLand(x - 0.25, z)), Math.abs(campLand(x, z + 0.25) - campLand(x, z - 0.25)));
      const deg = (Math.atan2(rise, 0.5) * 180) / Math.PI;
      if (deg > worst) (worst = deg), (worstAt = { x, z });
    }
  checks++;
  if (worst > STEEPEST) fail(`${F}: the ground is ${worst.toFixed(1)} degrees steep at ${fmt(worstAt)} (at most ${STEEPEST})`);
  // what is built stands level: the land under it within a few centimetres across its footprint
  const level = (label: string, at: Point, r: number, tol = 0.06) => {
    checks++;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 8; k++) {
      const h = campLand(at.x + Math.cos((k * Math.PI) / 4) * r, at.z + Math.sin((k * Math.PI) / 4) * r);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    if (hi - lo > tol) fail(`${F}: ${label} at ${fmt(at)} stands on a slope (${(hi - lo).toFixed(2)} m across it)`);
  };
  level("the tipi", CL.tent, CL.tent.r);
  level("the telescope", CL.telescope, 0.9);
  level("the workbench", CL.workbench, 0.8);
  level("Buster's stall", CL.buster, 0.9);
  level("Barnaby's stall", CL.barnaby, 0.9);
  level("the camper van", CL.van, 1.6);
  level("the splitting block", CL.splitblock, 0.5);
  level("the woodpile", CL.woodpile, 0.8);
  level("the picnic table", CL.picnic, 1.2);
  level("the slingshot gallery", { x: CL.gallery.x, z: (CL.gallery.z + CL.gallery.back) / 2 }, 1.8, 0.08);
  level("the firepit", CL.fire, CL.firepit.r + 0.6, 0.001);
  level("the dock's landing", { x: CL.dock.x0, z: (CL.dock.z0 + CL.dock.z1) / 2 }, 1.2, 0.001);
  // the drawn ground and the land agree wherever anyone stands (only the river's channel differs)
  for (const t of CAMP_TREES) {
    checks++;
    if (Math.abs(campGroundY(t.approachX, t.approachZ) - campLand(t.approachX, t.approachZ)) > 0.05) fail(`${F}: ${t.id} is felled from the river's bank ${fmt({ x: t.approachX, z: t.approachZ })}`);
  }
  // the walks from the hearth: nowhere more than ten seconds off at the game's 3 m/s
  const hearth = { x: CL.fire.x, z: CL.fire.z + 1.35 };
  const walkS = (to: Point) => {
    const path = findPath(F, hearth, to);
    if (!path) return Infinity;
    let d = 0;
    let at: Point = hearth;
    for (const p of path) {
      d += Math.hypot(p.x - at.x, p.z - at.z);
      at = p;
    }
    return d / 3;
  };
  for (const [label, to] of [["Barnaby", BARNABY_FRONT], ["Buster", BUSTER_FRONT], ["the workbench", WORKBENCH_FRONT], ["the archway", CAMP_ARCHWAY_FRONT], ["the splitting block", SPLITBLOCK_FRONT], ["the gallery", GALLERY_FRONT], ["the telescope", TELESCOPE_FRONT], ["the dock", FISHING_SPOTS[1].approach]] as const) {
    checks++;
    const s_ = walkS(to);
    if (!(s_ <= 10)) fail(`${F}: ${label} is a ${s_.toFixed(1)} s walk from the hearth (at most 10)`);
  }
}

// --- the Velvet Ring ---
{
  const R: MapId = "boxing_ring";
  const home = MAP_SPAWN_POINTS[R][0];
  const near = (label: string, from: Point, to: Point, reach: number) => {
    checks++;
    if (Math.hypot(from.x - to.x, from.z - to.z) > reach) fail(`${R}: ${label} ${fmt(from)} is out of reach (${reach}) of ${fmt(to)}`);
  };
  for (const c of ["red", "blue"] as const) {
    const k = RING_CORNERS[c];
    standable(R, home, k.foot, `the ${c} corner's steps`);
    near(`the ${c} corner's foot`, k.foot, k.steps, CORNER_REACH);
    checks++;
    if (outsideRopes(k.inside.x, k.inside.z, 0.3)) fail(`${R}: the ${c} corner ${fmt(k.inside)} is outside the ropes`);
  }
  for (const n of NEUTRAL_CORNERS) {
    checks++;
    if (outsideRopes(n.x, n.z, 0.3)) fail(`${R}: the neutral corner ${fmt(n)} is outside the ropes`);
  }
  // wherever a fighter is launched through the ropes, they land on open floor
  for (const side of ["n", "s", "e", "w"] as const) {
    for (let a = -2.6; a <= 2.6; a += 0.65) {
      const at = ringOutLanding(side, a);
      checks++;
      if (isBlocked(at.x, at.z, R)) fail(`${R}: a ring-out through the ${side} ropes lands inside furniture at ${fmt(at)}`);
    }
  }
  // nobody walks onto the canvas: every point of it is closed to a spectator
  for (let x = RING.x - RING.rope; x <= RING.x + RING.rope; x += 0.5) {
    for (let z = RING.z - RING.rope; z <= RING.z + RING.rope; z += 0.5) {
      checks++;
      if (!isBlocked(x, z, R)) {
        fail(`${R}: ${fmt({ x, z })} on the canvas is open to spectators`);
        x = z = 99;
      }
    }
  }
  checks++;
  if (!isBlocked(COACH_BRUNO.x, COACH_BRUNO.z, R, 0.05)) fail(`${R}: Coach Bruno stands on open floor ${fmt(COACH_BRUNO)}: give him a collider`);
  standable(R, home, COACH_FRONT, "Coach Bruno's counter");
  near("Coach Bruno's counter spot", COACH_FRONT, { x: COACH_BRUNO.x, z: COACH_FRONT.z }, COACH_REACH);
  checks++;
  if (!isBlocked(CHALKBOARD.x, CHALKBOARD.z, R, 0.05)) fail(`${R}: the chalkboard stands on open floor ${fmt(CHALKBOARD)}`);
  standable(R, home, CHALKBOARD_FRONT, "the chalkboard");
  near("the chalkboard's spot", CHALKBOARD_FRONT, CHALKBOARD, CHALKBOARD_REACH);
  for (const [label, front, at] of [["the heavy bag", HEAVY_BAG_FRONT, HEAVY_BAG], ["the speed bag", SPEED_BAG_FRONT, SPEED_BAG_FRONT], ["the scale", WEIGH_SCALE_FRONT, WEIGH_SCALE]] as const) {
    standable(R, home, front, label);
    near(`${label}'s spot`, front, at, GYM_REACH + 0.5);
  }
  // a beaten fighter with every bleacher seat taken stands in front of them, on open floor
  standable(R, home, RING_BENCH_FRONT, "the bleachers' front (a beaten fighter's spot)");
  // the regulars: Jimmy by the Blue Corner's steps, Kip at the heavy bag, the fans on the bleachers
  for (const [label, at] of [["Jimmy the Slugger", JIMMY], ["Kip at the heavy bag", BAG_BOXER], ["the trainee skipping rope", TRAINEE]] as const) {
    checks++;
    if (!isBlocked(at.x, at.z, R, 0.05)) fail(`${R}: ${label} stands on open floor ${fmt(at)}: give them a collider`);
  }
  standable(R, home, JIMMY_FRONT, "Jimmy the Slugger");
  near("Jimmy's spot", JIMMY_FRONT, JIMMY, JIMMY_REACH);
  for (const fan of RING_FANS) {
    checks++;
    if (RING_SEATS.some((s) => s.propId === fan.seat)) fail(`${R}: ${fan.node} sits on ${fan.seat}, which is still a seat anyone can take`);
  }
  for (const fan of RING_CROWD) {
    checks++;
    const near = RING_SEATS.find((s) => Math.abs(s.x - fan.x) < 0.2 && Math.hypot(s.x - fan.x, s.z - fan.z) < 0.8);
    if (near) fail(`${R}: the crowd's ${fan.node} ${fmt(fan)} sits on top of the seat ${near.propId}`);
    const regular = RING_FANS.find((f) => Math.hypot(f.x - fan.x, f.z - fan.z) < 0.8);
    checks++;
    if (regular) fail(`${R}: the crowd's ${fan.node} ${fmt(fan)} sits on ${regular.node}`);
  }
  checks++;
  if (outsideRopes(REF_HOME.x, REF_HOME.z, 0.2)) fail(`${R}: Ref Barnaby's corner ${fmt(REF_HOME)} is outside the ropes`);
  checks++;
  if (!(REF_APRON > RING.rope + 0.1 && REF_APRON < RING.apron - 0.1)) fail(`${R}: Ref Barnaby's apron walk (${REF_APRON}) is not between the ropes (${RING.rope}) and the apron's edge (${RING.apron})`);
}

// --- the Glimmering Caverns (docs/caverns-design.md) ---
const ORE_NODE_AT_ID = (id: string): Point => ORE_NODES.find((n) => n.id === id)!.approach;
{
  const C: MapId = "glimmering_caverns";
  const home = MAP_SPAWN_POINTS[C][0];
  const near = (label: string, from: Point, to: Point, reach: number) => {
    checks++;
    if (Math.hypot(from.x - to.x, from.z - to.z) > reach) fail(`${C}: ${label} ${fmt(from)} is out of reach (${reach}) of ${fmt(to)}`);
  };
  // the builder's copy of the floor (scripts/blender/data/caverns_terrain.json) is this layout's
  checks++;
  // (line endings aside: a checkout may turn the file's LF into CRLF)
  if (!existsSync(CAVERNS_TERRAIN_PATH) || readFileSync(CAVERNS_TERRAIN_PATH, "utf8").replace(/\r\n/g, "\n") !== cavernsTerrainText()) fail(`${C}: scripts/blender/data/caverns_terrain.json is stale: run npm run caverns-terrain (and rebuild caverns.glb)`);
  standable(C, home, CAVE_ARRIVAL, "the arrival from the woods");
  standable(C, home, CAVE_ADIT_FRONT, "the adit's mouth");
  standable(C, home, GUS_FRONT, "Gus's workstation");
  standable(C, home, FORGE_FRONT, "the Thermal Bellows Forge's front");
  standable(C, home, ANVIL_FRONT, "the meteorite anvil's front");
  standable(C, home, FINNEGAN_FRONT, "Finnegan's driftwood log");
  near("Gus's workstation", GUS_FRONT, GUS, GUS_REACH + 1.2);
  near("the forge's front", FORGE_FRONT, FORGE, FORGE_REACH + 0.8);
  near("the anvil's front", ANVIL_FRONT, ANVIL, ANVIL_REACH + 0.6);
  near("Finnegan's front", FINNEGAN_FRONT, FINNEGAN, FINNEGAN_REACH);
  for (const [who, at] of [
    ["Gus", GUS],
    ["Finnegan", FINNEGAN],
  ] as const) {
    checks++;
    if (!isBlocked(at.x, at.z, C, 0.05)) fail(`${C}: ${who} stands on open floor ${fmt(at)}: give it a collider`);
  }
  // no stairs, no scrambles: every step between two walkable cells no steeper than STEEPEST_STEP (a
  // hand's height over a mask cell; the ground over half a metre is held to STEEPEST_WALK by the mask)
  {
    let steepest = 0;
    let at: Point = { x: 0, z: 0 };
    for (let k = 0; k < MASK_N; k++) {
      for (let i = 0; i < MASK_N; i++) {
        if (!CAVERNS_MASK[k * MASK_N + i]) continue;
        const x = -CAVERNS_LAYOUT.half + (i + 0.5) * MASK_CELL;
        const z = -CAVERNS_LAYOUT.half + (k + 0.5) * MASK_CELL;
        for (const [di, dk] of [[1, 0], [0, 1]] as const) {
          if (i + di >= MASK_N || k + dk >= MASK_N || !CAVERNS_MASK[(k + dk) * MASK_N + i + di]) continue;
          const deg = (Math.atan2(Math.abs(cavernsFloorY(x + di * MASK_CELL, z + dk * MASK_CELL) - cavernsFloorY(x, z)), MASK_CELL) * 180) / Math.PI;
          if (deg > steepest) {
            steepest = deg;
            at = { x, z };
          }
        }
      }
    }
    checks++;
    if (steepest > STEEPEST_STEP + 0.05) fail(`${C}: a step on the walkable floor at ${fmt(at)} is ${steepest.toFixed(1)} degrees (${STEEPEST_STEP} at most)`);
  }
  // the trails across the cliffs (the rope descent, the switchback, the ramps to the rift and the
  // lake, the pearl trail): each one's ends walked to from the adit, and each at the height it was
  // laid out to (never a stair: the step check above)
  for (const t of CAVE_TRAILS) {
    const first = t.points[0];
    const last = t.points[t.points.length - 1];
    standable(C, home, { x: first[0], z: first[1] }, `the ${t.id}'s head`);
    standable(C, home, { x: last[0], z: last[1] }, `the ${t.id}'s foot`);
    for (const [x, z, h] of t.points) {
      checks++;
      if (Math.abs(cavernsFloorY(x, z) - h) > 0.12) fail(`${C}: the ${t.id} at ${fmt({ x, z })} stands at ${cavernsFloorY(x, z).toFixed(2)}, not its ${h}`);
    }
    // the explorer's trail: nowhere on its walkable tread (the beach at its foot aside) steeper than
    // TRAIL_STEEPEST
    let worst = 0;
    let worstAt = { x: 0, z: 0 };
    for (let i = 0; i + 1 < t.points.length; i++) {
      const [ax, az] = t.points[i];
      const [bx, bz] = t.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / len;
      const tz = (bz - az) / len;
      for (let s = 0; s <= len; s += 0.1) {
        for (let o = -t.half; o <= t.half + 1e-6; o += 0.2) {
          const x = ax + tx * s - tz * o;
          const z = az + tz * s + tx * o;
          // (the tread's middle as it was laid; its shoulders are walked on at STEEPEST_WALK)
          if (Math.abs(o) > t.half * 0.6 || onBeach(x, z) || !cavernsWalkable(x, z)) continue;
          const g = trailSlope(x, z);
          if (g > worst) {
            worst = g;
            worstAt = { x, z };
          }
        }
      }
    }
    checks++;
    if (worst > STEEPEST_WALK + 0.05) fail(`${C}: the ${t.id}'s tread at ${fmt(worstAt)} is ${worst.toFixed(1)} degrees (${STEEPEST_WALK} at most)`);
  }
  const descent = CAVE_TRAILS.find((t) => t.id === "switchback")!;
  const top = descent.points[0];
  const foot = descent.points[descent.points.length - 1];
  checks++;
  if (Math.abs(top[2] - DOLINE.y) > 0.1 || foot[2] > OVERLOOK.y + 0.45 || foot[2] < OVERLOOK.y - 0.1) fail(`${C}: the switchback runs from ${top[2]} to ${foot[2]}, not from the basecamp's shelf (${DOLINE.y}) to the overlook (${OVERLOOK.y})`);
  // the overlook's plateau at its level, walked to from the tunnel
  const overlookAt = { x: 1.0, z: -6.0 };
  standable(C, home, overlookAt, "the Hound's Overlook");
  checks++;
  if (Math.abs(cavernsFloorY(overlookAt.x, overlookAt.z) - OVERLOOK.y) > 0.45) fail(`${C}: the overlook at ${fmt(overlookAt)} stands at ${cavernsFloorY(overlookAt.x, overlookAt.z).toFixed(2)}, not about ${OVERLOOK.y}`);
  // every node: inside its collider, mined from its own floor, in reach, reachable from the tunnel
  for (const n of ORE_NODES) {
    checks++;
    if (!isBlocked(n.x, n.z, C, 0.05)) fail(`${C}: the ${n.kind} node ${n.id} ${fmt(n)} has no collider`);
    standable(C, home, n.approach, `the ${n.kind} node ${n.id}'s mining spot`);
    near(`the ${n.kind} node ${n.id}'s mining spot`, n.approach, n, oreReach(n));
    checks++;
    if (Math.abs(walkY(C, n.approach.x, n.approach.z) - n.y) > 0.3) fail(`${C}: the ${n.kind} node ${n.id} (floor ${n.y}) is mined from another floor (${walkY(C, n.approach.x, n.approach.z).toFixed(2)})`);
  }
  // the thermal terraces: each seat's dry exit open, walked to, and beside it (where you are set down,
  // and where the toggle finds it)
  for (const t of THERMAL_SEATS) {
    standable(C, home, t.exit, `thermal seat ${t.propId}'s exit`);
    near(`thermal seat ${t.propId}'s exit`, t.exit, t, THERMAL_REACH + 0.3);
  }
  // the overlook's hearth (docs/caverns-roadmap.md phase 6): each log bench's landing open, walked to,
  // and a step from its bench; the photo spot before the Hound's Hand; every one of Old Flint's pages
  // lying on open, walked-to ground; every cave pearl's basin with open, walked-to ground in reach
  for (const s of HEARTH_SEATS) {
    standable(C, home, s.exit, `hearth bench ${s.propId}'s landing`);
    near(`hearth bench ${s.propId}'s landing`, s.exit, s, 1.2);
  }
  standable(C, home, PHOTO_SPOT, "the Explorers' Rest photo spot");
  for (const pg of JOURNAL_PAGES) standable(C, home, pg, `Flint's journal ${pg.id}`);
  for (const pl of CAVE_PEARLS) {
    checks++;
    let spot: { x: number; z: number } | null = null;
    for (let r = 0; r <= FIND_REACH - 0.3 && !spot; r += 0.25) {
      for (let a = 0; a < 16 && !spot; a++) {
        const q = { x: pl.x + Math.cos((a / 16) * Math.PI * 2) * r, z: pl.z + Math.sin((a / 16) * Math.PI * 2) * r };
        if (!isBlocked(q.x, q.z, C) && isReachable(C, home, q)) spot = q;
      }
    }
    if (!spot) fail(`${C}: no open ground within ${FIND_REACH - 0.3} m of the cave pearl ${pl.id} ${fmt(pl)} to pick it up from`);
  }
  // the winch lift: both its stands open, walked to, and in reach of its props
  standable(C, home, CAVE_WINCH.upper, "the winch's upper stand");
  standable(C, home, CAVE_WINCH.lower, "the winch's lower stand");
  near("the winch's upper stand", CAVE_WINCH.upper, CAVE_WINCH.head, WINCH_REACH);
  near("the winch's lower stand", CAVE_WINCH.lower, CAVE_WINCH.bottom, WINCH_REACH);
  // the stream's fords: open and walked to (the stream itself is not)
  for (const [x, z] of CAVERNS_LAYOUT.river.fords) standable(C, home, { x, z }, "a ford across the stream");
  // the design's walking times (docs/caverns-design.md) at the game's 3 m/s, from the arrival: each
  // tier's nearest node, and the whole loop (the jungle, the rope descent, the mudflats, the pearl
  // trail, the south shore, the rift, then the winch back up)
  {
    const SPEED = 3;
    const walkS = (from: Point, to: Point) => {
      const path = findPath(C, from, to);
      if (!path) return Infinity;
      let d = 0;
      let at = from;
      for (const p of path) {
        d += Math.hypot(p.x - at.x, p.z - at.z);
        at = p;
      }
      return d / SPEED;
    };
    const TIER_S: Record<string, number> = { copper: 5, coal: 5, iron: 8, silver: 12, glimmer: 15, monolith: 20 };
    const nearest: Record<string, number> = {};
    for (const [kind, limit] of Object.entries(TIER_S)) {
      const s = Math.min(...ORE_NODES.filter((n) => n.kind === kind).map((n) => walkS(CAVE_ARRIVAL, n.approach)));
      nearest[kind] = s;
      checks++;
      if (s > limit) fail(`${C}: the nearest ${kind} node is ${s.toFixed(1)} s from the arrival (${limit} s at most)`);
    }
    // (depth is progress: each tier's nearest node further from the arrival than the tier before's)
    const order = ["coal", "iron", "silver", "glimmer", "monolith"];
    for (let i = 0; i + 1 < order.length; i++) {
      checks++;
      if (nearest[order[i + 1]] <= Math.max(nearest[order[i]], order[i] === "coal" ? nearest.copper : 0)) fail(`${C}: the nearest ${order[i + 1]} node (${nearest[order[i + 1]].toFixed(1)} s) is no further than the nearest ${order[i]} (${nearest[order[i]].toFixed(1)} s): the deeper tiers must lie further in`);
    }
    const legs: Point[] = [CAVE_ARRIVAL, ORE_NODE_AT_ID("copper_3"), ORE_NODE_AT_ID("iron_4"), ORE_NODE_AT_ID("silver_1"), ORE_NODE_AT_ID("silver_5"), ORE_NODE_AT_ID("glimmer_4"), CAVE_WINCH.lower];
    let loop = WINCH_RIDE_S + walkS(CAVE_WINCH.upper, CAVE_ARRIVAL);
    for (let i = 0; i + 1 < legs.length; i++) loop += walkS(legs[i], legs[i + 1]);
    checks++;
    if (loop > 60) fail(`${C}: the loop round the zones takes ${loop.toFixed(1)} s (60 s at most)`);
  }
  // the cenote: deep enough, and fished from anywhere on its shore (shoreCast): round the lake, the
  // first walkable spot within SHORE_REACH of the water, walked to from the tunnel, casts out onto
  // CAST_DEPTH of open water facing it, and never with its back to it (the angle guard); a dozen
  // of them at least
  checks++;
  if (CAVE_LAKE.depth < 0.15) fail(`${C}: the cenote is ${CAVE_LAKE.depth} m deep (0.15 at least)`);
  let shore = 0;
  for (let a = 0; a < 360; a += 15) {
    const r = (a * Math.PI) / 180;
    for (let d = 1.6; d > 0.9; d -= 0.02) {
      const x = CAVE_LAKE.x + Math.sin(r) * d * CAVE_LAKE.rx;
      const z = CAVE_LAKE.z + Math.cos(r) * d * CAVE_LAKE.rz;
      const w = nearestWater(x, z, SHORE_REACH - 0.3);
      if (!w) continue;
      if (isBlocked(x, z, C)) break;
      const f = shoreCast(x, z, w.x, w.z);
      const back = shoreCast(x, z, -w.x, -w.z);
      const side = shoreCast(x, z, -w.z, w.x);
      checks++;
      if (!f) fail(`${C}: no cast from the shore at ${fmt({ x, z })} facing the water`);
      else if (!inLakeWater(f.x, f.z) || lakeFactor(f.x, f.z) > 0.985 || CAVE_WATER_Y - cavernsFloorY(f.x, f.z) < CAST_DEPTH - 0.01) fail(`${C}: the cast from ${fmt({ x, z })} lands at ${fmt(f)}, not out on ${CAST_DEPTH} m of open water`);
      checks++;
      if (back || side) fail(`${C}: a cast from ${fmt({ x, z })} goes out with the angler's ${back ? "back" : "side"} to the water (the angle guard)`);
      if (f && !back && !side && standable(C, home, { x, z }, `the shore at ${a} degrees`)) shore++;
      break;
    }
  }
  checks++;
  if (shore < 12) fail(`${C}: only ${shore} spots round the cenote cast onto it (12 at least)`);
  // the stream (docs/caverns-roadmap.md R2.10): its banks cast into it along every reach, and the raft's
  // two landings walked to, its route over open water all the way
  {
    let bank = 0;
    for (const seg of CAVERNS_LAYOUT.river.segments) {
      for (let i = 0; i + 1 < seg.length; i++) {
        const [ax, az] = seg[i];
        const [bx, bz] = seg[i + 1];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        for (const side of [1, -1]) {
          for (const off of [1.0, 1.2, 1.4]) {
            const x = mx + nx * off * side;
            const z = mz + nz * off * side;
            if (isBlocked(x, z, C, 0.3)) continue;
            const f = streamCast(x, z, -nx * side, -nz * side);
            if (f) {
              bank++;
              break;
            }
          }
        }
      }
    }
    checks++;
    if (bank < 12) fail(`${C}: only ${bank} spots along the stream's banks cast into it (12 at least)`);
    for (const side of ["north", "islet"] as const) standable(C, home, RAFT[side], `the raft's ${side} landing`);
    for (let k = 0; k <= 40; k++) {
      const r = raftAt((k / 40) * 5, "islet", 5);
      checks++;
      if (k > 0 && k < 40 && !inLakeWater(r.x, r.z)) fail(`${C}: the raft's route leaves the water at ${fmt(r)}`);
    }
  }
  // round 3 (docs/caverns-roadmap.md R3.2, R3.3): the stream's water never under its floor and only
  // ever falling as it runs; the basecamp's shelf clear, the arrival's walks to the rope descent and
  // the switchback within a twentieth of a straight line
  // (a step up of a few centimetres where the floor forces it is the water pooling; out of the plunge
  // pool and the lake the builder draws none of it)
  for (const reach of STREAM_REACHES) {
    // (the lake's outflow crosses the causeway's ford, whose bed stands over the lake: a film over it)
    const outflow = inLakeWater(reach[0].x, reach[0].z);
    for (let i = 0; i < reach.length; i++) {
      const q = reach[i];
      if (inLakeWater(q.x, q.z) || Math.hypot(q.x - CAVERNS_LAYOUT.river.plunge.x, q.z - CAVERNS_LAYOUT.river.plunge.z) < CAVERNS_LAYOUT.river.plunge.r + 1.0) continue;
      // (its mouth, cut under the lake's level, is the lake's own water)
      if (cavernsFloorY(q.x, q.z) < CAVERNS_LAYOUT.lake.water - 0.02 && lakeFactor(q.x, q.z) < 1.45) continue;
      checks++;
      if (q.y < cavernsFloorY(q.x, q.z) + 0.025) fail(`${C}: the stream's water under its floor at ${fmt(q)}`);
      if (!outflow && i > 0 && cavernsSurface(reach[i - 1].x, reach[i - 1].z) !== SURFACE.pool && q.y > reach[i - 1].y + 0.035) fail(`${C}: the stream runs uphill at ${fmt(q)}`);
      // (inside a warm pool it is the pool's own water, as deep as the pool)
      if (q.kind !== "fall" && cavernsSurface(q.x, q.z) !== SURFACE.pool && q.y > cavernsFloorY(q.x, q.z) + 0.45) fail(`${C}: the stream stands ${(q.y - cavernsFloorY(q.x, q.z)).toFixed(2)} m over its floor at ${fmt(q)}`);
    }
  }
  for (const [what, to] of [["the rope descent", { x: CAVE_TRAILS[0].points[0][0], z: CAVE_TRAILS[0].points[0][1] }], ["the switchback", { x: CAVE_TRAILS[1].points[0][0], z: CAVE_TRAILS[1].points[0][1] }]] as const) {
    const path = findPath(C, CAVE_ARRIVAL, to);
    checks++;
    if (!path) {
      fail(`${C}: no walk from the arrival to ${what}`);
      continue;
    }
    let len = 0;
    let at: { x: number; z: number } = CAVE_ARRIVAL;
    for (const q of path) {
      len += Math.hypot(q.x - at.x, q.z - at.z);
      at = q;
    }
    const straight = Math.hypot(to.x - CAVE_ARRIVAL.x, to.z - CAVE_ARRIVAL.z);
    if (len > straight * 1.05) fail(`${C}: the walk from the arrival to ${what} is ${((len / straight - 1) * 100).toFixed(0)}% longer than a straight line (the shelf should be clear)`);
  }
  // the camera's bounds hold every spot anyone can stand at
  for (const p of [...MAP_SPAWN_POINTS[C], ...ORE_NODES.map((n) => n.approach), GUS_FRONT, FORGE_FRONT, ANVIL_FRONT, FINNEGAN_FRONT, ...THERMAL_SEATS.map((t) => t.exit)]) {
    checks++;
    if (p.x < CAVERNS_CAMERA.x0 || p.x > CAVERNS_CAMERA.x1 || p.z < CAVERNS_CAMERA.z0 || p.z > CAVERNS_CAMERA.z1) fail(`${C}: ${fmt(p)} is outside the camera's bounds`);
  }
  // the woods' end of it: the adit's front, Old Flint, the arrival from below
  const W: MapId = "whispering_woods";
  const woods = MAP_SPAWN_POINTS[W][0];
  standable(W, woods, FOREST_ADIT_FRONT, "the mine adit's front");
  standable(W, woods, WOODS_FROM_CAVERNS, "the arrival from the caverns");
  standable(W, woods, OLD_FLINT_FRONT, "Old Flint's spot");
  checks++;
  if (!isBlocked(OLD_FLINT.x, OLD_FLINT.z, W, 0.05)) fail(`${W}: Old Flint stands on open floor ${fmt(OLD_FLINT)}: give him a collider`);
  checks++;
  if (Math.hypot(OLD_FLINT_FRONT.x - OLD_FLINT.x, OLD_FLINT_FRONT.z - OLD_FLINT.z) > OLD_FLINT_REACH) fail(`${W}: Old Flint's spot ${fmt(OLD_FLINT_FRONT)} is out of his reach`);
}

// --- nothing snags a walker (docs/caverns-roadmap.md R2.1) ---
// Steering (WASD or the joystick) replayed on every built world with the game's own slide step, from
// seeded open spots in seeded directions: a walker brought to a dead stop while open ground lies a
// little either way is a snag (an honest wall is not). A budget, not zero: a V-shaped corner met head
// on stops anyone. And no two of the caverns' mining spots share ground.
{
  const STEERS = 600;
  const BUDGET = 0.015;
  for (const w of Object.values(WORLDS).filter((w) => w.built)) {
    const mapId = w.mapId;
    const regions = walkRegions(mapId);
    let seed = 90210;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const blocked = (x: number, z: number) => isBlocked(x, z, mapId, 0.3);
    let snags = 0;
    const where: string[] = [];
    for (let t = 0; t < STEERS; t++) {
      let p: { x: number; z: number } | null = null;
      for (let tries = 0; tries < 200 && !p; tries++) {
        const r = regions[Math.floor(rnd() * regions.length)];
        const q = { x: r.x0 + rnd() * (r.x1 - r.x0), z: r.z0 + rnd() * (r.z1 - r.z0) };
        if (!blocked(q.x, q.z)) p = q;
      }
      if (!p) continue;
      const a = rnd() * Math.PI * 2;
      const ux = Math.sin(a);
      const uz = Math.cos(a);
      let still = 0;
      for (let f = 0; f < 90; f++) {
        const bx = p.x;
        const bz = p.z;
        slideStep(p, (ux * 3) / 60, (uz * 3) / 60, mapId, 0.3, 0.12);
        still = Math.hypot(p.x - bx, p.z - bz) < 0.005 ? still + 1 : 0;
        if (still < 20) continue;
        const open = [25, -25, 45, -45].some((deg) => {
          const r = (deg * Math.PI) / 180;
          const rx = ux * Math.cos(r) - uz * Math.sin(r);
          const rz = ux * Math.sin(r) + uz * Math.cos(r);
          return !blocked(p!.x + rx * 0.35, p!.z + rz * 0.35) && !blocked(p!.x + rx * 0.7, p!.z + rz * 0.7);
        });
        if (open) {
          snags++;
          if (where.length < 5) where.push(fmt(p));
        }
        break;
      }
    }
    checks++;
    if (snags > STEERS * BUDGET) fail(`${mapId}: ${snags} of ${STEERS} steers snag (over ${(BUDGET * 100).toFixed(1)}%), e.g. at ${where.join(", ")}`);
  }
  for (let i = 0; i < ORE_NODES.length; i++) {
    for (let j = i + 1; j < ORE_NODES.length; j++) {
      checks++;
      const a = ORE_NODES[i].approach;
      const b = ORE_NODES[j].approach;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 0.8) fail(`glimmering_caverns: ${ORE_NODES[i].id} and ${ORE_NODES[j].id} are mined from the same ground (${fmt(a)}, ${fmt(b)})`);
    }
  }
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
