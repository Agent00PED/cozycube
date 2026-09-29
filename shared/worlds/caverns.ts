import type { AABB } from "../collision";
import type { PropSpec } from "./lounge";
import { ORE_KINDS, type OreKind } from "../caverns_mining";

// The Glimmering Caverns (the map "glimmering_caverns"): a monumental 45 x 45 natural karst cavern, a
// doline and a cenote, reached only through the overgrown mine adit behind the Whispering Woods'
// Autumn Maples (Old Flint the Badger keeps it: meeting him hands you the Rusted Pickaxe and opens it
// to you for good). Like every world, it is the one room's: going down the adit is a trip.
//
//   The Sunlit Doline          north-centre, raised on a mossy limestone plateau (y 2.8, swelling to
//                              3.5 in its back corners) under a collapsed ceiling that pours golden
//                              sunlight down: ferns, ivy, fallen boulders; the adit's tunnel in the
//                              north wall (you arrive facing south, over the lake); the Expedition
//                              Outpost (Gus the Mole at his log workstation, the Thermal Bellows
//                              Forge in a basalt fissure of the north wall, the meteorite Geode Anvil
//                              beside an antique tool crate); eight Coal Seams and Copper Veins among
//                              the fallen limestone. One flowstone ramp (28 degrees, 3.2 m wide) down
//                              its front cliff to the lake's shore
//   The Abyssal Cenote Lake    south-centre (26 x 18 m): crystal-clear aquamarine over white and gold
//                              sand that slopes into it (no walls, no borders); a limestone islet in
//                              its middle under a skylight (a karst tower on its west shore, an old
//                              mangrove on top weeping its aerial roots down round it), and the Titan
//                              Monolith (a sandbar wades out to it); Finnegan the Grotto Angler on his
//                              driftwood crate by the weathered outcrop he fishes from (three spots)
//   The Travertine Terraces    the west cliff: three cascading rimstone pools of warm mineral water,
//                              steaming, six seats in the stone (a soak: the Deep Warmth), each with a
//                              dry landing on the shore beside it
//   The Deep Crystal Fissures  the east and west wings, dark ravines lit only by crystals and glowing
//                              mushrooms: six Iron Lodes, five Silver Seams, four Glimmerstone
//                              Clusters set in the walls' crevices and in fallen rock
//
// The camera looks from +x +z: the north and west are the cavern's shell (tall limestone walls, double
// sided, their stalactites hugging them), the south and east its cut-away rim. No roof: nothing hangs
// over the floor but the islet's roots (dithered, like every occluder, where they stand between you
// and the camera). Only three lights move (the forge, the terraces, the cenote's heart); the crystals
// and mushrooms glow from their own vertex colours. The layout below is plain JSON between the
// markers, read as-is by scripts/blender/build_caverns.py, which builds caverns.glb (the diorama, and
// each node kind's rock as a template the client places at its node). The lake's shore, the islet and
// the sandbar are functions of the layout (lakeFactor, isletFactor, onSandbar): the builder has the
// same ones, so the water it models is the water the game walls off.

type Pt = { x: number; z: number };

export const CAVERNS_LAYOUT = /* layout:begin */ {
  "half": 22.5,
  "doline": { "x0": -12.5, "x1": 12.5, "z0": -22.5, "z1": -10.0, "y": 2.8, "rise": 0.7 },
  "ramp": { "x0": -1.6, "x1": 1.6, "top": -10.0, "foot": -4.734, "slopeDeg": 28 },
  "walls": { "north": -22.5, "west": -22.5, "height": 11.5 },
  "zones": [
    { "id": "doline", "name": "The Sunlit Doline", "x0": -12.5, "x1": 12.5, "z0": -22.5, "z1": -10.0 },
    { "id": "terraces", "name": "The Travertine Terraces", "x0": -22.5, "x1": -14.5, "z0": -7.5, "z1": 6.0 },
    { "id": "fissureW", "name": "The Deep Crystal Fissures", "x0": -22.5, "x1": -12.5, "z0": -22.5, "z1": 22.5 },
    { "id": "fissureE", "name": "The Deep Crystal Fissures", "x0": 12.5, "x1": 22.5, "z0": -22.5, "z1": 22.5 },
    { "id": "cenote", "name": "The Abyssal Cenote Lake", "x0": -14.5, "x1": 14.5, "z0": -10.0, "z1": 22.5 }
  ],
  "adit": { "x": 0.0, "z": -22.1, "w": 2.0, "h": 2.6 },
  "arrival": { "x": 0.0, "z": -19.5 },
  "gus": { "x": -7.0, "z": -16.7, "yaw": 0 },
  "workstation": { "x": -7.0, "z": -15.7, "len": 2.4, "w": 0.75, "top": 0.78 },
  "forge": { "x": 6.6, "z": -21.3, "w": 2.6, "d": 1.8, "h": 3.2 },
  "anvil": { "x": 2.9, "z": -15.0 },
  "crate": { "x": 4.15, "z": -15.45, "w": 0.9, "d": 0.6, "h": 0.55 },
  "lake": { "x": 0.0, "z": 8.0, "rx": 13.0, "rz": 9.0, "water": -0.06, "depth": 2.4, "beach": 1.14, "wade": 1.04 },
  "islet": { "x": 0.8, "z": 9.4, "r": 2.9, "top": 0.3 },
  "sandbar": { "points": [[-3.4, -1.9], [-3.1, 1.6], [-1.8, 4.7], [-0.3, 7.2], [0.2, 7.9]], "half": 1.2, "y": -0.03 },
  "skylight": { "x": 0.2, "z": 8.6, "r": 3.4 },
  "tower": { "x": -1.95, "z": 9.05, "r": 1.0, "h": 5.2 },
  "outcrop": { "x0": 9.6, "x1": 14.7, "z0": 5.6, "z1": 7.7, "deck": 0.12 },
  "finnegan": { "x": 15.3, "z": 4.4, "yaw": -0.93 },
  "fishing": [
    { "stand": { "x": 10.2, "z": 6.05 }, "bobber": { "x": 8.4, "z": 5.4 }, "face": [-1, -0.35] },
    { "stand": { "x": 10.2, "z": 7.2 }, "bobber": { "x": 8.4, "z": 7.85 }, "face": [-1, 0.35] },
    { "stand": { "x": 11.8, "z": 7.3 }, "bobber": { "x": 11.95, "z": 9.0 }, "face": [0.1, 1] }
  ],
  "terraces": { "x0": -22.5, "x1": -17.9, "pools": [{ "z0": -6.4, "z1": -2.8, "y": 0.75 }, { "z0": -2.6, "z1": 1.0, "y": 0.45 }, { "z0": 1.2, "z1": 4.8, "y": 0.15 }] },
  "thermalSeats": [
    { "id": "thermal_1", "x": -19.3, "z": -5.4, "face": 1.5708, "exit": { "x": -16.95, "z": -5.4 } },
    { "id": "thermal_2", "x": -19.3, "z": -3.8, "face": 1.5708, "exit": { "x": -16.95, "z": -3.8 } },
    { "id": "thermal_3", "x": -19.3, "z": -1.6, "face": 1.5708, "exit": { "x": -16.95, "z": -1.6 } },
    { "id": "thermal_4", "x": -19.3, "z": 0.0, "face": 1.5708, "exit": { "x": -16.95, "z": 0.0 } },
    { "id": "thermal_5", "x": -19.3, "z": 2.2, "face": 1.5708, "exit": { "x": -16.95, "z": 2.2 } },
    { "id": "thermal_6", "x": -19.3, "z": 3.8, "face": 1.5708, "exit": { "x": -16.95, "z": 3.8 } }
  ],
  "nodes": [
    { "id": "copper_1", "kind": "copper", "x": -4.6, "z": -21.6, "face": [0, 1] },
    { "id": "coal_1", "kind": "coal", "x": -11.4, "z": -19.2, "face": [1, 0.25] },
    { "id": "copper_2", "kind": "copper", "x": -10.4, "z": -13.4, "face": [0.55, 0.85] },
    { "id": "coal_2", "kind": "coal", "x": -4.6, "z": -12.3, "face": [1, 0.15] },
    { "id": "coal_3", "kind": "coal", "x": 10.2, "z": -21.6, "face": [0, 1] },
    { "id": "copper_3", "kind": "copper", "x": 11.1, "z": -17.2, "face": [0.2, 1] },
    { "id": "coal_4", "kind": "coal", "x": 7.8, "z": -12.7, "face": [0.35, 1] },
    { "id": "copper_4", "kind": "copper", "x": -8.8, "z": -20.6, "face": [0.4, 1] },
    { "id": "iron_1", "kind": "iron", "x": -21.6, "z": -17.4, "face": [1, 0] },
    { "id": "iron_2", "kind": "iron", "x": -17.0, "z": -21.6, "face": [0, 1] },
    { "id": "iron_3", "kind": "iron", "x": 13.35, "z": -15.8, "face": [1, 0] },
    { "id": "iron_4", "kind": "iron", "x": 18.4, "z": -21.6, "face": [0, 1] },
    { "id": "iron_5", "kind": "iron", "x": -21.6, "z": 12.0, "face": [1, 0] },
    { "id": "iron_6", "kind": "iron", "x": 19.4, "z": 13.2, "face": [0.55, 0.85] },
    { "id": "silver_1", "kind": "silver", "x": -21.55, "z": -10.4, "face": [1, 0] },
    { "id": "silver_2", "kind": "silver", "x": -21.55, "z": 19.0, "face": [1, 0] },
    { "id": "silver_3", "kind": "silver", "x": 13.4, "z": -11.8, "face": [1, 0] },
    { "id": "silver_4", "kind": "silver", "x": -16.0, "z": 12.6, "face": [0.6, 0.8] },
    { "id": "silver_5", "kind": "silver", "x": 19.0, "z": -4.0, "face": [0.4, 1] },
    { "id": "glimmer_1", "kind": "glimmer", "x": -21.5, "z": 15.5, "face": [1, 0] },
    { "id": "glimmer_2", "kind": "glimmer", "x": 19.6, "z": -13.6, "face": [0.3, 1] },
    { "id": "glimmer_3", "kind": "glimmer", "x": 16.2, "z": 18.4, "face": [0.5, 0.85] },
    { "id": "glimmer_4", "kind": "glimmer", "x": -10.6, "z": 19.6, "face": [0.45, 0.9] },
    { "id": "monolith", "kind": "monolith", "x": 0.8, "z": 9.4, "face": [0.87, 0.5] }
  ],
  "boulders": [[-8.95, -17.75, 0.95], [5.0, -17.4, 0.7], [-2.6, -15.0, 0.55], [9.4, -15.2, 0.85], [-5.6, -18.8, 0.5], [3.6, -19.4, 0.45], [-11.2, -11.2, 0.7], [11.3, -11.0, 0.65], [-15.8, -14.2, 1.1], [16.4, -8.6, 1.0], [-17.8, 8.8, 0.9], [20.2, 3.6, 1.0], [-6.2, 20.8, 0.8], [7.4, 20.6, 0.9], [18.6, 20.0, 0.8]],
  "fins": [[-17.6, -6.9, 1.6, 0.5, 2.6, 0.5], [16.0, -1.4, 0.6, 1.8, 2.8, -0.4], [15.4, 10.4, 0.55, 1.5, 2.2, 0.35], [-15.2, 17.2, 1.4, 0.55, 2.4, -0.3]],
  "shrooms": [[-19.6, -15.2, 1.0], [-14.6, -19.8, 0.8], [-18.4, -11.8, 0.9], [15.0, -19.6, 1.0], [21.0, -10.8, 0.8], [17.0, -17.6, 0.7], [-19.4, 7.0, 0.8], [-14.8, 14.6, 1.0], [-19.8, 21.2, 0.7], [21.2, 6.4, 0.9], [14.4, 13.6, 0.8], [20.6, 17.2, 1.0], [-13.2, 21.0, 0.8], [10.2, 21.4, 0.7]],
  "crystals": [[-21.8, -14.0, 1.2], [-15.2, -21.8, 1.0], [-21.8, -6.0, 0.9], [21.8, -18.0, 1.1], [14.2, -21.8, 0.9], [21.8, -7.4, 1.0], [-21.8, 9.4, 1.0], [-21.8, 21.8, 1.3], [-17.6, 21.6, 0.9], [21.8, 10.8, 1.2], [21.8, 21.8, 1.1], [13.0, 21.8, 0.8], [-13.2, -7.2, 0.7], [13.4, -8.2, 0.7]],
  "beams": [[-4.2, -17.2, 1.7], [2.2, -18.9, 2.1], [7.4, -14.6, 1.4], [-8.4, -12.6, 1.2], [0.0, -13.2, 1.0]],
  "lights": { "forge": [6.6, 4.2, -20.1], "thermal": [-19.6, 1.9, -0.8], "cenote": [0.8, 1.3, 9.4] },
  "spawns": [{ "x": 0.0, "z": -19.5 }, { "x": 0.9, "z": -18.8 }, { "x": -0.9, "z": -18.8 }]
} /* layout:end */;

const L = CAVERNS_LAYOUT;

// --- the ground: the doline's plateau, its ramp, the lake's shore, the islet, the sandbar ----------------

/** The doline's plateau and its one ramp down to the shore. */
export const DOLINE = L.doline;
export const RAMP = L.ramp;
const smooth01 = (t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};
const inDoline = (x: number, z: number) => x >= L.doline.x0 && x <= L.doline.x1 && z <= L.doline.z1;
const onRamp = (x: number, z: number) => x >= L.ramp.x0 - 0.001 && x <= L.ramp.x1 + 0.001 && z > L.ramp.top && z < L.ramp.foot;

/** How far out on the lake a point is, against its shore: under 1 the water (0 its middle), 1 the
 *  waterline's ellipse, above it the beach and the land. The shore wobbles (never a clean ellipse):
 *  the builder has the very same function. */
export function lakeFactor(x: number, z: number): number {
  const dx = (x - L.lake.x) / L.lake.rx;
  const dz = (z - L.lake.z) / L.lake.rz;
  const a = Math.atan2(dz, dx);
  const wob = 1 + 0.05 * Math.sin(3 * a + 0.7) + 0.035 * Math.sin(5 * a + 2.1);
  return Math.hypot(dx, dz) / wob;
}
/** How far from the islet's middle, against its rocky shore (under 1: the islet). */
export function isletFactor(x: number, z: number): number {
  const dx = x - L.islet.x;
  const dz = z - L.islet.z;
  const a = Math.atan2(dz, dx);
  const r = L.islet.r * (1 + 0.12 * Math.sin(3 * a + 1.0) + 0.06 * Math.sin(7 * a + 0.4));
  return Math.hypot(dx, dz) / r;
}
/** How far a point is from the sandbar's spine (m). */
export function sandbarDistance(x: number, z: number): number {
  let best = Infinity;
  const P = L.sandbar.points;
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, az] = P[i];
    const [bx, bz] = P[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}
export const onSandbar = (x: number, z: number) => sandbarDistance(x, z) <= L.sandbar.half;
const onDeck = (x: number, z: number) => x >= L.outcrop.x0 && x <= L.outcrop.x1 && z >= L.outcrop.z0 && z <= L.outcrop.z1;
/** Where you can stand out on the lake: the islet's top, the sandbar, the outcrop's deck. */
function walkableWater(x: number, z: number): boolean {
  return isletFactor(x, z) < 0.8 || onSandbar(x, z) || onDeck(x, z);
}
/** Whether (x, z) is the lake's water (walled off; the islet, the sandbar and the deck are not). */
export function inLakeWater(x: number, z: number): boolean {
  return lakeFactor(x, z) < L.lake.wade && !walkableWater(x, z);
}

/** The floor's height at (x, z): the doline's plateau (2.8, swelling to 3.5 in its back corners), its
 *  ramp (a smooth 28 degrees, no step to snag on), the beach sloping into the lake (you wade a step
 *  into its shallows), the sandbar, the islet and the deck, or the cavern's floor (0). */
export function cavernsFloorY(x: number, z: number): number {
  if (inDoline(x, z)) return L.doline.y + L.doline.rise * smooth01((Math.abs(x) - 4) / 7) * smooth01((L.doline.z1 - 3 - z) / 7);
  if (onRamp(x, z)) return (L.doline.y * (L.ramp.foot - z)) / (L.ramp.foot - L.ramp.top);
  if (onDeck(x, z)) return L.outcrop.deck;
  const g = isletFactor(x, z);
  if (g < 0.95) return L.sandbar.y + (L.islet.top - L.sandbar.y) * smooth01((0.95 - g) / 0.35);
  const f = lakeFactor(x, z);
  if (f < L.lake.beach) {
    const shore = -0.2 * ((L.lake.beach - f) / (L.lake.beach - 1));
    return onSandbar(x, z) ? Math.max(L.sandbar.y, shore) : shore;
  }
  return 0;
}
/** The caverns' zones (the Logbook's and the HUD's name for where you are). */
export function cavernsZoneAt(x: number, z: number): (typeof L.zones)[number] | null {
  return L.zones.find((zn) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) ?? null;
}

// --- the Expedition Outpost, the adit ------------------------------------------------------------------

/** The adit's tunnel back up to the Whispering Woods, and where you stand at it. */
export const CAVE_ADIT = L.adit;
export const CAVE_ADIT_FRONT: Pt = { x: L.adit.x, z: L.adit.z + 1.3 };
/** Where a traveller arrives from the woods (in the doline, facing south over the lake). */
export const CAVE_ARRIVAL: Pt = L.arrival;
/** Gus the Mole at his log workstation, and where you stand to trade with him. */
export const GUS = L.gus;
export const GUS_FRONT: Pt = { x: L.workstation.x, z: L.workstation.z + L.workstation.w / 2 + 0.7 };
export const GUS_REACH = 1.9;
/** The Thermal Bellows Forge in the north wall's basalt fissure, and the meteorite Geode Anvil beside
 *  the antique tool crate. */
export const FORGE = L.forge;
export const FORGE_FRONT: Pt = { x: L.forge.x, z: L.forge.z + L.forge.d / 2 + 0.8 };
export const FORGE_REACH = 2.0;
export const ANVIL = L.anvil;
export const ANVIL_FRONT: Pt = { x: L.anvil.x, z: L.anvil.z + 0.95 };
export const ANVIL_REACH = 1.8;

// --- the nodes -----------------------------------------------------------------------------------------

/** A node's spot, its kind, the floor it stands on, the way it faces out of its wall or rock, and
 *  where you stand to mine it (a step out from its face). */
export interface OreNode {
  id: string;
  kind: OreKind;
  x: number;
  z: number;
  /** Its floor's height (the doline, or the cavern's floor, the islet). */
  y: number;
  face: Pt | null;
  approach: Pt;
  /** Set in the cavern's shell (the north or west wall), not in a fallen rock. */
  wall: boolean;
}
export const ORE_NODES: OreNode[] = L.nodes.map((n) => {
  const face = n.face ? { x: n.face[0], z: n.face[1] } : null;
  const r = ORE_KINDS[n.kind as OreKind].radius + 0.75;
  // (free standing: from the side the camera sees, toward the middle of the cavern)
  const d = Math.hypot(n.x, n.z) || 1;
  const out = face ?? { x: (-n.x / d) * 0.6 + 0.4, z: (-n.z / d) * 0.6 + 0.4 };
  const ol = Math.hypot(out.x, out.z) || 1;
  const wall = n.x <= L.walls.west + 1.3 || n.z <= L.walls.north + 1.3;
  return { id: n.id, kind: n.kind as OreKind, x: n.x, z: n.z, y: cavernsFloorY(n.x, n.z), face, approach: { x: n.x + (out.x / ol) * r, z: n.z + (out.z / ol) * r }, wall };
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
/** The fallen limestone a node away from the walls sits in (behind it, against its face): the
 *  builder's rock, and the collider round it. */
export function nodeBackRock(n: OreNode): { x: number; z: number; r: number } | null {
  if (n.wall || n.kind === "monolith" || !n.face) return null;
  const fl = Math.hypot(n.face.x, n.face.z) || 1;
  const r = ORE_KINDS[n.kind].radius;
  return { x: n.x - (n.face.x / fl) * (r + 0.45), z: n.z - (n.face.z / fl) * (r + 0.45), r: r + 0.35 };
}
export const MONOLITH = ORE_NODE_AT.get("monolith")!;

// --- the Travertine Thermal Terraces ---------------------------------------------------------------------

/** The terraces' three rimstone pools against the west cliff (their water's height), and their six
 *  seats in the warm water, each with its dry landing on the shore beside it (where you are set down
 *  getting out, or dropping out of the game). */
export const TERRACES = L.terraces;
export const THERMAL_SEATS = L.thermalSeats.map((s) => ({ propId: s.id, x: s.x, z: s.z, rotationY: s.face, approachX: s.exit.x, approachZ: s.exit.z, exit: s.exit }));
export const THERMAL_SEAT_IDS: ReadonlySet<string> = new Set(THERMAL_SEATS.map((s) => s.propId));
/** The water's height in the pool a seat sits in. */
export function thermalPoolY(z: number): number {
  return (L.terraces.pools.find((p) => z >= p.z0 - 0.1 && z <= p.z1 + 0.1) ?? L.terraces.pools[L.terraces.pools.length - 1]).y;
}
/** How near a seat's landing you step into its pool from (the soak toggle). */
export const THERMAL_REACH = 2.2;
/** The thermal seat nearest (x, z) among these. */
export function nearestThermalSeat(x: number, z: number, ids: readonly string[] = THERMAL_SEATS.map((s) => s.propId)) {
  let best: (typeof THERMAL_SEATS)[number] | null = null;
  for (const s of THERMAL_SEATS) {
    if (!ids.includes(s.propId)) continue;
    if (!best || Math.hypot(s.exit.x - x, s.exit.z - z) < Math.hypot(best.exit.x - x, best.exit.z - z)) best = s;
  }
  return best;
}

// --- the Abyssal Cenote Lake -------------------------------------------------------------------------------

export const CAVE_LAKE = L.lake;
export const CAVE_ISLET = L.islet;
export const CAVE_OUTCROP = L.outcrop;
/** Finnegan the Grotto Angler on his driftwood crate by the outcrop (facing the lake: `yaw`), and where
 *  you stand to trade with him. */
export const FINNEGAN = L.finnegan;
export const FINNEGAN_FRONT: Pt = { x: L.finnegan.x + Math.sin(L.finnegan.yaw) * 1.05, z: L.finnegan.z + Math.cos(L.finnegan.yaw) * 1.05 };
export const FINNEGAN_REACH = 1.9;
/** The outcrop's three fishing spots: where you stand, where the float lands, where you step up from. */
export const CAVE_FISHING = L.fishing.map((f, i) => {
  const d = Math.hypot(f.face[0], f.face[1]) || 1;
  const face = { x: f.face[0] / d, z: f.face[1] / d };
  return { propId: `cave_fishing_${i + 1}`, stand: f.stand, bobber: f.bobber, face, approach: { x: f.stand.x - face.x * 0.35, z: f.stand.z - face.z * 0.35 } };
});
/** The outcrop spot an angler standing at (x, z) is at, if any: the nearest within `reach` (the spots
 *  stand close together on the deck). */
export function caveSpotAt(x: number, z: number, reach = 0.9) {
  let best: (typeof CAVE_FISHING)[number] | undefined;
  for (const f of CAVE_FISHING) {
    const d = Math.hypot(x - f.stand.x, z - f.stand.z);
    if (d <= reach && (!best || d < Math.hypot(x - best.stand.x, z - best.stand.z))) best = f;
  }
  return best;
}
/** The water's height (the float's, the drip's ripple). */
export const CAVE_WATER_Y = L.lake.water;
/** The three lights that move (the forge's mouth, the terraces' steam, the cenote's heart), the
 *  doline's sunbeams and the islet's skylight. */
export const CAVE_LIGHTS = L.lights;
export const DOLINE_BEAMS = L.beams;
export const CAVE_SKYLIGHT = L.skylight;
/** The camera's bounds while you are down here: its look-at point is kept inside them (the shell
 *  round it: no void to see past). */
export const CAVERNS_CAMERA = { x0: -21, x1: 21, z0: -21, z1: 21 };

export const CAVERNS_PROPS: PropSpec[] = ([
  { propId: "cave_adit", x: L.adit.x, z: L.adit.z + 0.4, kind: "adit", color: "#8a6a3f", defaultOn: true, approachX: CAVE_ADIT_FRONT.x, approachZ: CAVE_ADIT_FRONT.z },
  { propId: "gus", x: L.gus.x, z: L.gus.z, kind: "prospector", color: "#6b5a4a", defaultOn: true, approachX: GUS_FRONT.x, approachZ: GUS_FRONT.z },
  { propId: "ancient_forge", x: L.forge.x, z: L.forge.z, kind: "forge", color: "#ff7a2f", defaultOn: true, approachX: FORGE_FRONT.x, approachZ: FORGE_FRONT.z },
  { propId: "geode_anvil", x: L.anvil.x, z: L.anvil.z, kind: "anvil", color: "#8a8f9a", defaultOn: true, approachX: ANVIL_FRONT.x, approachZ: ANVIL_FRONT.z },
  { propId: "finnegan", x: L.finnegan.x, z: L.finnegan.z, kind: "angler", color: "#e8a6b8", defaultOn: true, approachX: FINNEGAN_FRONT.x, approachZ: FINNEGAN_FRONT.z },
  ...ORE_NODES.map((n): PropSpec => ({ propId: orePropId(n.id), x: n.x, z: n.z, kind: "ore", color: ORE_KINDS[n.kind].glow, defaultOn: true, approachX: n.approach.x, approachZ: n.approach.z })),
  ...CAVE_FISHING.map((f): PropSpec => ({ propId: f.propId, x: f.stand.x, z: f.stand.z, kind: "fishing", color: "#5ff2ff", defaultOn: true, approachX: f.approach.x, approachZ: f.approach.z })),
] satisfies PropSpec[]).map((p) => ({ ...p, y: cavernsFloorY(p.x, p.z) }));

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
const box = (x0: number, x1: number, z0: number, z1: number): AABB => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });

/** The lake's water as rows of boxes (a 0.25 m row at a time, each run of water one box): the islet's
 *  top, the sandbar and the outcrop's deck left open. */
function lakeBoxes(): AABB[] {
  const out: AABB[] = [];
  const step = 0.25;
  const x0 = L.lake.x - L.lake.rx * 1.2;
  const x1 = L.lake.x + L.lake.rx * 1.2;
  for (let z = L.lake.z - L.lake.rz * 1.2; z < L.lake.z + L.lake.rz * 1.2; z += step) {
    let run: number | null = null;
    for (let x = x0; x <= x1 + step; x += step) {
      const wet = x <= x1 && inLakeWater(x + step / 2, z + step / 2);
      if (wet && run === null) run = x;
      if (!wet && run !== null) {
        out.push(box(run, x, z, z + step));
        run = null;
      }
    }
  }
  return out;
}

const D = L.doline;
const MONO = ORE_NODE_AT.get("monolith")!;
const MONO_R = ORE_KINDS.monolith.radius * 0.8;
export const CAVERNS_OBSTACLES: AABB[] = [
  // the doline's cliffs: its front (but for the ramp) and its two sides down into the fissures
  box(D.x0 - 0.25, L.ramp.x0, D.z1 - 0.25, D.z1 + 0.25),
  box(L.ramp.x1, D.x1 + 0.25, D.z1 - 0.25, D.z1 + 0.25),
  box(D.x0 - 0.25, D.x0 + 0.25, D.z0, D.z1),
  box(D.x1 - 0.25, D.x1 + 0.25, D.z0, D.z1),
  // the ramp's flowstone sides, down its whole length (you step on or off it only at its ends)
  box(L.ramp.x0 - 0.25, L.ramp.x0, L.ramp.top, L.ramp.foot),
  box(L.ramp.x1, L.ramp.x1 + 0.25, L.ramp.top, L.ramp.foot),
  // the Expedition Outpost: Gus's log workstation and him behind it; the forge in its fissure; the
  // anvil and the tool crate
  box(L.workstation.x - L.workstation.len / 2, L.workstation.x + L.workstation.len / 2, L.gus.z - 0.4, L.workstation.z + L.workstation.w / 2),
  box(L.forge.x - L.forge.w / 2 - 0.1, L.forge.x + L.forge.w / 2 + 0.1, L.walls.north, L.forge.z + L.forge.d / 2 + 0.1),
  around(L.anvil, 0.42),
  box(L.crate.x - L.crate.w / 2, L.crate.x + L.crate.w / 2, L.crate.z - L.crate.d / 2, L.crate.z + L.crate.d / 2),
  // the adit's timbers either side of its opening
  around({ x: L.adit.x - L.adit.w / 2 - 0.14, z: L.adit.z + 0.25 }, 0.24),
  around({ x: L.adit.x + L.adit.w / 2 + 0.14, z: L.adit.z + 0.25 }, 0.24),
  // every node (a wall's from its wall out; one in fallen rock, and its rock); the Monolith rounder
  // (a cross of two boxes: its square's corners would pinch the walk round it on the islet)
  ...ORE_NODES.filter((n) => n.kind !== "monolith").map((n) => around(n, ORE_KINDS[n.kind].radius * 0.95)),
  box(MONO.x - MONO_R, MONO.x + MONO_R, MONO.z - MONO_R * 0.62, MONO.z + MONO_R * 0.62),
  box(MONO.x - MONO_R * 0.62, MONO.x + MONO_R * 0.62, MONO.z - MONO_R, MONO.z + MONO_R),
  ...ORE_NODES.flatMap((n) => {
    const b = nodeBackRock(n);
    return b ? [around(b, b.r * 0.85)] : [];
  }),
  // the lake (its islet, sandbar and deck open), the karst tower on the islet's west shore, Finnegan
  // and his crate
  ...lakeBoxes(),
  around(L.tower, L.tower.r),
  around(L.finnegan, 0.5),
  // the thermal terraces' rimstone pools (their seats are in the water, inside this)
  box(L.terraces.x0, L.terraces.x1, L.terraces.pools[0].z0 - 0.2, L.terraces.pools[L.terraces.pools.length - 1].z1 + 0.2),
  // the fallen boulders, the fissures' rock fins, the mushrooms and the crystals (you walk round them)
  ...L.boulders.map(([x, z, r]) => around({ x, z }, r * 0.85)),
  ...L.fins.flatMap(([x, z, rx, rz, , yaw]) => {
    // (a fin is a long rock turned `yaw`: a row of boxes down its length)
    const len = Math.max(rx, rz);
    const w = Math.min(rx, rz);
    const along = rx >= rz ? { x: Math.cos(yaw), z: -Math.sin(yaw) } : { x: Math.sin(yaw), z: Math.cos(yaw) };
    const n = Math.max(2, Math.ceil(len / 0.4));
    return Array.from({ length: n + 1 }, (_, k) => {
      const t = -len + (2 * len * k) / n;
      return around({ x: x + along.x * t, z: z + along.z * t }, w * 0.9);
    });
  }),
  ...L.shrooms.map(([x, z, s]) => around({ x, z }, 0.3 * s)),
  ...L.crystals.map(([x, z, s]) => around({ x, z }, 0.32 * s)),
];
export const CAVERNS_SPAWNS: Pt[] = L.spawns;
