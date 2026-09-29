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
import { VAULT_SLOTS, VIP_ARRIVAL, VIP_NPCS, VIP_SEATS } from "../shared/worlds/casino_vip";
import { BOUTIQUE, BOUTIQUE_REACH } from "../shared/worlds/lounge";
import { BARNABY_BOARD, CAMPFIRE_LAYOUT } from "../shared/worlds/campfire";
import { WORLDS } from "../shared/worlds/index";
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
