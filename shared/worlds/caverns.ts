import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";
import { ORE_KINDS, type OreKind } from "../caverns_mining";

// The Glimmering Caverns (the map "glimmering_caverns"): a 28 x 28 underground amphitheatre in two
// tiers, reached only through the overgrown mine adit behind the Whispering Woods' Autumn Maples
// (Old Flint the Badger keeps it: meeting him hands you the Rusted Pickaxe and opens it to you for
// good). Like every world, it is the one room's: going down the adit is a trip, not a new connection.
//
//   The Upper Terrace      the back (north) band, 3.5 m up (TERRACE.y), dry shale in warm lantern
//                          light (#FFB347): the adit's tunnel in the north-west corner, Gus the Mole's
//                          workshop, the Ancient Forge and the Geode Anvil, eight Coal Seams and
//                          Copper Veins round its perimeter, and the six-seat Subterranean Onsen in
//                          the north-east, steaming
//   The Grand Stair        one flight down the cliff's middle, 2.6 m wide on a smooth 28 degree ramp
//                          (walkY: no step to snag a joystick on)
//   The Wet Cliffs         the cliff's foot: six Iron Lodes set into its dripping face
//   The Lower Chasm        the south-west, in cold bioluminescent cyan and violet (#00F0FF, #9D00FF):
//                          five Silver Seams
//   The Center Sanctuary   the Titan Monolith on its rune dais (a world event: it surfaces, is broken
//                          together, and sinks back for 25-30 minutes)
//   The Fungal Chasm       the south-east: four Glimmerstone Clusters among glowing mushrooms, and the
//                          Bioluminescent Grotto Pool with its weathered pier (three spots to fish from)
//                          under a rock overhang whose stalactites drip into it (the lucky drip)
//
// The camera looks from +x +z: the north and west are the cavern's shell (tall rock walls, a double-
// sided mesh, so nothing ever shows the void behind), the south and east its cut-away rim. Only three
// lights move (the forge, the onsen, the pool); the crystals and mushrooms glow from their own vertex
// colours. The layout below is plain JSON between the markers, read as-is by
// scripts/blender/build_caverns.py, which builds caverns.glb (the diorama, and each node kind's rock
// as a template the client places at its node).

type Pt = { x: number; z: number };

export const CAVERNS_LAYOUT = /* layout:begin */ {
  "half": 14,
  "terrace": { "y": 3.5, "edge": -4.2 },
  "stairs": { "x0": -1.3, "x1": 1.3, "top": -4.2, "foot": 2.38, "slopeDeg": 28 },
  "walls": { "north": -13.4, "west": -13.4, "height": 6.6 },
  "zones": [
    { "id": "terrace", "name": "The Upper Terrace", "x0": -14, "x1": 14, "z0": -14, "z1": -4.2 },
    { "id": "cliffs", "name": "The Wet Cliffs", "x0": -14, "x1": 14, "z0": -4.2, "z1": -1.4 },
    { "id": "chasm", "name": "The Lower Chasm", "x0": -14, "x1": -3.4, "z0": -1.4, "z1": 14 },
    { "id": "sanctuary", "name": "The Center Sanctuary", "x0": -3.4, "x1": 3.4, "z0": -1.4, "z1": 14 },
    { "id": "fungal", "name": "The Fungal Chasm", "x0": 3.4, "x1": 14, "z0": -1.4, "z1": 14 }
  ],
  "adit": { "x": -11.4, "z": -13.4, "w": 1.8, "h": 2.5 },
  "arrival": { "x": -11.4, "z": -11.8 },
  "gus": { "x": -8.0, "z": -9.75, "yaw": 0 },
  "counter": { "x": -8.0, "z": -9.0, "len": 2.2, "w": 0.6, "top": 0.95 },
  "workshop": { "x0": -10.2, "x1": -5.8, "z0": -13.4, "z1": -10.15 },
  "forge": { "x": -3.6, "z": -12.3, "w": 2.2, "d": 1.6, "h": 2.6 },
  "anvil": { "x": -0.9, "z": -9.8 },
  "onsen": { "x": 8.0, "z": -7.7, "w": 4.2, "d": 3.2, "rim": 0.35, "water": -0.1, "depth": 0.6 },
  "onsenSeats": [
    { "id": "onsen_n1", "x": 6.9, "z": -8.75, "face": 0, "exit": { "x": 6.9, "z": -10.1 } },
    { "id": "onsen_n2", "x": 8.0, "z": -8.75, "face": 0, "exit": { "x": 8.0, "z": -10.1 } },
    { "id": "onsen_n3", "x": 9.1, "z": -8.75, "face": 0, "exit": { "x": 9.1, "z": -10.1 } },
    { "id": "onsen_s1", "x": 6.9, "z": -6.65, "face": 3.1416, "exit": { "x": 6.9, "z": -5.35 } },
    { "id": "onsen_s2", "x": 8.0, "z": -6.65, "face": 3.1416, "exit": { "x": 8.0, "z": -5.35 } },
    { "id": "onsen_s3", "x": 9.1, "z": -6.65, "face": 3.1416, "exit": { "x": 9.1, "z": -5.35 } }
  ],
  "nodes": [
    { "id": "copper_1", "kind": "copper", "x": 1.8, "z": -12.95, "face": [0, 1] },
    { "id": "coal_1", "kind": "coal", "x": 4.0, "z": -12.95, "face": [0, 1] },
    { "id": "copper_2", "kind": "copper", "x": 6.2, "z": -12.95, "face": [0, 1] },
    { "id": "coal_2", "kind": "coal", "x": 11.8, "z": -12.95, "face": [0, 1] },
    { "id": "coal_3", "kind": "coal", "x": -12.95, "z": -7.4, "face": [1, 0] },
    { "id": "copper_3", "kind": "copper", "x": -12.95, "z": -5.4, "face": [1, 0] },
    { "id": "coal_4", "kind": "coal", "x": 12.4, "z": -10.3, "face": null },
    { "id": "copper_4", "kind": "copper", "x": -5.4, "z": -6.2, "face": null },
    { "id": "iron_1", "kind": "iron", "x": -11.6, "z": -3.75, "face": [0, 1] },
    { "id": "iron_2", "kind": "iron", "x": -8.8, "z": -3.75, "face": [0, 1] },
    { "id": "iron_3", "kind": "iron", "x": -6.0, "z": -3.75, "face": [0, 1] },
    { "id": "iron_4", "kind": "iron", "x": 3.8, "z": -3.75, "face": [0, 1] },
    { "id": "iron_5", "kind": "iron", "x": 7.4, "z": -3.75, "face": [0, 1] },
    { "id": "iron_6", "kind": "iron", "x": 11.0, "z": -3.75, "face": [0, 1] },
    { "id": "silver_1", "kind": "silver", "x": -12.9, "z": 0.8, "face": [1, 0] },
    { "id": "silver_2", "kind": "silver", "x": -12.9, "z": 6.2, "face": [1, 0] },
    { "id": "silver_3", "kind": "silver", "x": -9.6, "z": 3.2, "face": null },
    { "id": "silver_4", "kind": "silver", "x": -7.6, "z": 9.4, "face": null },
    { "id": "silver_5", "kind": "silver", "x": -11.2, "z": 11.6, "face": null },
    { "id": "glimmer_1", "kind": "glimmer", "x": 11.8, "z": 2.0, "face": null },
    { "id": "glimmer_2", "kind": "glimmer", "x": 12.1, "z": 11.0, "face": null },
    { "id": "glimmer_3", "kind": "glimmer", "x": 8.9, "z": 12.0, "face": null },
    { "id": "glimmer_4", "kind": "glimmer", "x": 2.8, "z": 11.8, "face": null },
    { "id": "monolith", "kind": "monolith", "x": 0.0, "z": 7.6, "face": null }
  ],
  "dais": { "x": 0.0, "z": 7.6, "r": 2.1 },
  "pool": { "x": 6.6, "z": 7.2, "rx": 3.0, "rz": 2.3, "water": -0.12, "bed": -0.75 },
  "pier": { "x": 6.2, "z0": 4.3, "z1": 7.25, "w": 1.6, "deck": 0.12 },
  "fishing": [
    { "stand": { "x": 6.2, "z": 6.75 }, "bobber": { "x": 6.2, "z": 8.35 }, "face": [0, 1] },
    { "stand": { "x": 5.75, "z": 5.7 }, "bobber": { "x": 4.5, "z": 6.2 }, "face": [-1, 0.2] },
    { "stand": { "x": 6.65, "z": 5.7 }, "bobber": { "x": 8.05, "z": 6.05 }, "face": [1, 0.2] }
  ],
  "overhang": { "x0": 3.8, "x1": 14.0, "z0": 5.4, "z1": 9.2, "y": 4.4, "pillar": { "x": 13.0, "z": 7.2, "r": 0.45 }, "stalactites": [[5.2, 6.4, 1.3], [6.6, 7.6, 1.8], [7.9, 6.6, 1.5], [9.2, 8.2, 1.2], [5.9, 8.6, 1.0], [8.4, 7.9, 1.6], [10.6, 6.9, 1.1]] },
  "beams": [
    { "x": 0.0, "z": 0.6, "span": 3.6, "along": "x", "top": 4.4 },
    { "x": -11.4, "z": -10.6, "span": 3.0, "along": "x", "top": 6.2 }
  ],
  "rails": [[-11.4, -12.6], [-11.4, -10.9], [-9.9, -9.9], [-6.0, -9.9], [-4.2, -10.6]],
  "shrooms": [[10.6, 4.0, 1.0], [12.6, 5.1, 0.8], [9.6, 1.2, 0.7], [4.8, 12.6, 1.1], [7.4, 12.7, 0.8], [11.1, 12.7, 1.0], [2.4, 3.6, 0.6], [12.8, 0.4, 0.9], [-2.8, 12.6, 0.7], [3.9, 10.2, 0.6], [10.2, 9.9, 0.7]],
  "crystals": [[-13.1, 3.4, 1.1], [-13.1, 9.3, 1.3], [-12.6, 12.8, 1.0], [-5.6, 12.8, 0.8], [-9.0, 12.9, 1.2], [-3.9, 3.9, 0.6], [-13.1, -1.6, 0.9], [13.0, 12.9, 1.1], [-7.0, 1.0, 0.5], [-2.4, -2.2, 0.6]],
  "lights": { "forge": [-3.6, 4.4, -11.3], "onsen": [8.0, 4.4, -7.7], "pool": [6.6, 1.1, 7.2] },
  "spawns": [{ "x": -11.4, "z": -11.8 }, { "x": -10.8, "z": -11.2 }, { "x": -12.0, "z": -11.2 }]
} /* layout:end */;

const L = CAVERNS_LAYOUT;

/** The terrace's height, where its edge is, and the stair down its cliff. */
export const TERRACE = L.terrace;
export const STAIRS = L.stairs;
/** The floor's height at (x, z): the terrace (3.5 m), the stair (a smooth 28 degree ramp, no step to
 *  snag on), or the basin (0). Where an avatar's feet go, where a click lands. */
export function cavernsFloorY(x: number, z: number): number {
  if (z <= L.terrace.edge) return L.terrace.y;
  if (x >= L.stairs.x0 - 0.001 && x <= L.stairs.x1 + 0.001 && z < L.stairs.foot) return (L.terrace.y * (L.stairs.foot - z)) / (L.stairs.foot - L.stairs.top);
  return 0;
}
/** The caverns' zones (the Logbook's and the HUD's name for where you are). */
export function cavernsZoneAt(x: number, z: number): (typeof L.zones)[number] | null {
  return L.zones.find((zn) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) ?? null;
}

/** The adit's tunnel back up to the Whispering Woods, and where you stand at it. */
export const CAVE_ADIT = L.adit;
export const CAVE_ADIT_FRONT: Pt = { x: L.adit.x, z: L.adit.z + 1.3 };
/** Where a traveller arrives from the woods (just inside the tunnel). */
export const CAVE_ARRIVAL: Pt = L.arrival;
/** Gus the Mole behind his workshop's counter, and where you stand to trade with him. */
export const GUS = L.gus;
export const GUS_FRONT: Pt = { x: L.counter.x, z: L.counter.z + L.counter.w / 2 + 0.7 };
export const GUS_REACH = 1.9;
/** The Ancient Forge against the back wall, and the Geode Anvil beside the terrace's middle. */
export const FORGE = L.forge;
export const FORGE_FRONT: Pt = { x: L.forge.x, z: L.forge.z + L.forge.d / 2 + 0.8 };
export const FORGE_REACH = 2.0;
export const ANVIL = L.anvil;
export const ANVIL_FRONT: Pt = { x: L.anvil.x, z: L.anvil.z + 0.95 };
export const ANVIL_REACH = 1.8;

/** A node's spot, its kind, the floor it stands on, the way it faces out of its wall (null: free
 *  standing), and where you stand to mine it (a step out from its face, or toward the camera). */
export interface OreNode {
  id: string;
  kind: OreKind;
  x: number;
  z: number;
  /** Its floor's height (the terrace, or the basin). */
  y: number;
  face: Pt | null;
  approach: Pt;
}
export const ORE_NODES: OreNode[] = L.nodes.map((n) => {
  const face = n.face ? { x: n.face[0], z: n.face[1] } : null;
  const r = ORE_KINDS[n.kind as OreKind].radius + 0.75;
  // (free standing: from the side the camera sees, toward the middle of the cavern)
  const d = Math.hypot(n.x, n.z) || 1;
  const out = face ?? { x: -n.x / d * 0.6 + 0.4, z: -n.z / d * 0.6 + 0.4 };
  const ol = Math.hypot(out.x, out.z) || 1;
  return { id: n.id, kind: n.kind as OreKind, x: n.x, z: n.z, y: cavernsFloorY(n.x, n.z), face, approach: { x: n.x + (out.x / ol) * r, z: n.z + (out.z / ol) * r } };
});
export const ORE_NODE_AT = new Map(ORE_NODES.map((n) => [n.id, n]));
/** The prop id of a node, and the node of a prop id. */
export const orePropId = (id: string) => `ore_${id}`;
export const oreNodeOf = (propId: string) => (propId.startsWith("ore_") ? ORE_NODE_AT.get(propId.slice(4)) : undefined);
/** How near a node you mine it from (the Monolith is bigger). */
export function oreReach(node: OreNode): number {
  return ORE_KINDS[node.kind].radius + 1.7;
}
/** The node within reach of (x, z), the nearest (null: none). */
export function oreNodeNear(x: number, z: number): OreNode | null {
  let best: OreNode | null = null;
  let d = Infinity;
  for (const n of ORE_NODES) {
    const e = Math.hypot(n.x - x, n.z - z);
    if (e <= oreReach(n) && e < d) {
      d = e;
      best = n;
    }
  }
  return best;
}
/** The Titan Monolith's node. */
export const MONOLITH = ORE_NODE_AT.get("monolith")!;

/** The Subterranean Onsen: its pool (sunk into the terrace), and its six seats in the water, each
 *  with its dry exit anchor (where you are set down getting out, or dropping out of the game). */
export const ONSEN = L.onsen;
export const ONSEN_SEATS = L.onsenSeats.map((s) => ({ propId: s.id, x: s.x, z: s.z, rotationY: s.face, approachX: s.exit.x, approachZ: s.exit.z, exit: s.exit }));
export const ONSEN_SEAT_IDS: ReadonlySet<string> = new Set(ONSEN_SEATS.map((s) => s.propId));
/** How near the pool's rim you step into it from (the onsen toggle). */
export const ONSEN_REACH = 2.2;
/** The onsen seat nearest (x, z) among these. */
export function nearestOnsenSeat(x: number, z: number, ids: readonly string[] = ONSEN_SEATS.map((s) => s.propId)) {
  let best: (typeof ONSEN_SEATS)[number] | null = null;
  for (const s of ONSEN_SEATS) {
    if (!ids.includes(s.propId)) continue;
    if (!best || Math.hypot(s.exit.x - x, s.exit.z - z) < Math.hypot(best.exit.x - x, best.exit.z - z)) best = s;
  }
  return best;
}

/** The Grotto Pool (its water's height) and its pier. */
export const CAVE_POOL = L.pool;
export const CAVE_PIER = L.pier;
/** The pier's three fishing spots: where you stand, where the float lands, where you step up from. */
export const CAVE_FISHING = L.fishing.map((f, i) => {
  const d = Math.hypot(f.face[0], f.face[1]) || 1;
  const face = { x: f.face[0] / d, z: f.face[1] / d };
  return { propId: `cave_fishing_${i + 1}`, stand: f.stand, bobber: f.bobber, face, approach: { x: f.stand.x - face.x * 0.35, z: f.stand.z - face.z * 0.35 } };
});
/** The pier spot an angler standing at (x, z) is at, if any: the nearest within `reach` (the spots
 *  stand close together on the pier). */
export function caveSpotAt(x: number, z: number, reach = 0.9) {
  let best: (typeof CAVE_FISHING)[number] | undefined;
  for (const f of CAVE_FISHING) {
    const d = Math.hypot(x - f.stand.x, z - f.stand.z);
    if (d <= reach && (!best || d < Math.hypot(x - best.stand.x, z - best.stand.z))) best = f;
  }
  return best;
}
/** The three lights that move (the forge's mouth, the onsen's lanterns, the pool's heart). */
export const CAVE_LIGHTS = L.lights;
/** The camera's bounds while you are down here: its look-at point is kept inside them (the shell
 *  round it: no void to see past). */
export const CAVERNS_CAMERA = { x0: -13, x1: 13, z0: -15, z1: 13 };

export const CAVERNS_PROPS: PropSpec[] = ([
  { propId: "cave_adit", x: L.adit.x, z: L.adit.z + 0.4, kind: "adit", color: "#8a6a3f", defaultOn: true, approachX: CAVE_ADIT_FRONT.x, approachZ: CAVE_ADIT_FRONT.z },
  { propId: "gus", x: L.gus.x, z: L.gus.z, kind: "prospector", color: "#6b5a4a", defaultOn: true, approachX: GUS_FRONT.x, approachZ: GUS_FRONT.z },
  { propId: "ancient_forge", x: L.forge.x, z: L.forge.z, kind: "forge", color: "#ff7a2f", defaultOn: true, approachX: FORGE_FRONT.x, approachZ: FORGE_FRONT.z },
  { propId: "geode_anvil", x: L.anvil.x, z: L.anvil.z, kind: "anvil", color: "#8a8f9a", defaultOn: true, approachX: ANVIL_FRONT.x, approachZ: ANVIL_FRONT.z },
  ...ORE_NODES.map((n): PropSpec => ({ propId: orePropId(n.id), x: n.x, z: n.z, kind: "ore", color: ORE_KINDS[n.kind].glow, defaultOn: true, approachX: n.approach.x, approachZ: n.approach.z })),
  ...CAVE_FISHING.map((f): PropSpec => ({ propId: f.propId, x: f.stand.x, z: f.stand.z, kind: "fishing", color: "#5ff2ff", defaultOn: true, approachX: f.approach.x, approachZ: f.approach.z })),
] satisfies PropSpec[]).map((p) => ({ ...p, y: cavernsFloorY(p.x, p.z) }));

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
const box = (x0: number, x1: number, z0: number, z1: number): AABB => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });

/** The pool's water, in slices down its length (you stand at its edge; the pier stays open). */
function poolBoxes(): AABB[] {
  const out: AABB[] = [];
  const P = L.pool;
  const pierX0 = L.pier.x - L.pier.w / 2;
  const pierX1 = L.pier.x + L.pier.w / 2;
  const step = 0.25;
  const inset = 0.2;
  for (let z = P.z - P.rz; z < P.z + P.rz; z += step) {
    const mid = z + step / 2;
    const k = 1 - ((mid - P.z) / P.rz) ** 2;
    if (k <= 0) continue;
    const half = Math.max(0, P.rx * Math.sqrt(k) - inset);
    if (half < 0.1) continue;
    const x0 = P.x - half;
    const x1 = P.x + half;
    if (z + step <= L.pier.z1 && x0 < pierX1 && x1 > pierX0) {
      // (the pier crosses this slice: water either side of it)
      if (x0 < pierX0) out.push(box(x0, pierX0, z, z + step));
      if (x1 > pierX1) out.push(box(pierX1, x1, z, z + step));
    } else out.push(box(x0, x1, z, z + step));
  }
  return out;
}

export const CAVERNS_OBSTACLES: AABB[] = [
  // the cliff's edge along the terrace, but for the stair (a rail to the terrace, a wall to the basin)
  box(-14, L.stairs.x0, L.terrace.edge - 0.25, L.terrace.edge + 0.25),
  box(L.stairs.x1, 14, L.terrace.edge - 0.25, L.terrace.edge + 0.25),
  // the stair's sides, down its whole flight (you step on or off it only at its ends)
  box(L.stairs.x0 - 0.25, L.stairs.x0, L.terrace.edge, L.stairs.foot),
  box(L.stairs.x1, L.stairs.x1 + 0.25, L.terrace.edge, L.stairs.foot),
  // the terrace: Gus's workshop (his shelves and crates), his counter and him behind it; the forge;
  // the anvil; the onsen's pool (its seats are in the water, inside this)
  box(L.workshop.x0, L.workshop.x1, L.workshop.z0, L.workshop.z1),
  box(L.counter.x - L.counter.len / 2, L.counter.x + L.counter.len / 2, L.gus.z - 0.35, L.counter.z + L.counter.w / 2),
  box(L.forge.x - L.forge.w / 2 - 0.1, L.forge.x + L.forge.w / 2 + 0.1, L.forge.z - L.forge.d / 2, L.forge.z + L.forge.d / 2 + 0.1),
  around(L.anvil, 0.42),
  box(L.onsen.x - L.onsen.w / 2 - L.onsen.rim, L.onsen.x + L.onsen.w / 2 + L.onsen.rim, L.onsen.z - L.onsen.d / 2 - L.onsen.rim, L.onsen.z + L.onsen.d / 2 + L.onsen.rim),
  // the adit's timbers either side of its opening
  around({ x: L.adit.x - L.adit.w / 2 - 0.12, z: L.adit.z + 0.3 }, 0.22),
  around({ x: L.adit.x + L.adit.w / 2 + 0.12, z: L.adit.z + 0.3 }, 0.22),
  // every node (a wall-mounted one from its wall out; the Monolith on its dais)
  ...ORE_NODES.map((n) => around(n, ORE_KINDS[n.kind].radius * (n.kind === "monolith" ? 0.8 : 0.95))),
  // the Grotto Pool (its pier open), and the overhang's pillar on the east rim
  ...poolBoxes(),
  around(L.overhang.pillar, L.overhang.pillar.r),
  // the shoring's posts
  ...L.beams.flatMap((b) => [around({ x: b.x - b.span / 2, z: b.z }, 0.14), around({ x: b.x + b.span / 2, z: b.z }, 0.14)]),
  // the glowing mushroom clusters and crystal clusters on the floor (you walk round them)
  ...L.shrooms.map(([x, z, s]) => around({ x, z }, 0.3 * s)),
  ...L.crystals.map(([x, z, s]) => around({ x, z }, 0.32 * s)),
];
export const CAVERNS_SPAWNS: Pt[] = L.spawns;
