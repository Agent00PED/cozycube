import type { AABB } from "../collision";
import type { SeatStyle } from "../types";
import type { PropSpec, SeatSpec } from "./lounge";

// The Velvet Penthouse: the Velvet Casino's private 10x10 high-roller suite, reached only through
// the gilded doors Bruno guards in the hall (with a Black Velvet VIP Pass: shared/items.ts) and left
// by its elevator. It is a map of its own (casino_vip): Bruno's doors carry a pass holder there, the
// elevator back to the hall. Its floor sits where the suite was first authored, off to the side of
// the hall's (OFFSET), and the camera frames it on its own (VIP_FRAME).
//
// Authored ONCE, here, in the suite's own coordinates (x and z from -5 to 5, the two tall window
// walls at x = -5 and z = -5 looking out over the city's lights, the front open to the camera):
//
//   VIP_LAYOUT     where everything is (plain JSON between the markers: scripts/blender/
//                  build_casino_vip.py reads the very same text to build casino_vip.glb)
//   VIP_SEATS      the high-limit poker table's chairs, the baccarat table's stools and the
//                  penthouse blackjack table's three
//   VIP_PROPS      the tables, the twin Golden Vault slots, the elevator home
//   VIP_OBSTACLES  what you walk round;  VIP_NPCS  Boris dealing, Baron von Fox and Duchess
//                  Penelope at their tables, Scarlett dealing the baccarat, Gideon the blackjack
//
// The baccarat table is turned (`face`: 180) so its dealer, behind its flat side, faces the elevator
// and the room's middle, the players' stools on the curve toward them; the blackjack table stands
// in the southern lounge, its curve toward the room; the twin Golden Vaults stand side by side
// against the western glass, a little Art-Deco jukebox beside them.
//
// Everything exported is in the map's world coordinates (the layout plus OFFSET).

export const VIP_LAYOUT = /* layout:begin */ {
  "half": 5,
  "offset": [21, -21],
  "walls": { "t": 0.2, "h": 3.6 },
  "elevator": { "x": 2.6, "w": 1.4, "h": 2.5 },
  "arrival": { "x": 2.6, "z": -3.7 },
  "fountain": { "x": -0.1, "z": 0.45, "r": 0.72 },
  "poker": {
    "x": -2.2,
    "z": -2.5,
    "len": 2.8,
    "w": 1.25,
    "top": 0.68,
    "reach": 2.4,
    "chairZ": -1.25,
    "chairs": [-3.2, -2.4, -1.6],
    "baron": [-0.25, -2.5],
    "dealer": [-2.2, -3.5]
  },
  "baccarat": { "x": 2.3, "z": 2.4, "face": 180, "r": 1.15, "top": 0.74, "reach": 2.6, "stoolR": 1.55, "stoolAngles": [-55, -18, 18], "duchess": 55, "dealer": 0.6 },
  "blackjack": { "x": -1.3, "z": 3.75, "yaw": 3.14159, "r": 1.1, "top": 0.74, "reach": 2.4, "stoolR": 1.55, "stoolAngles": [-40, 0, 40], "felt": "green", "dealer": 0.55 },
  "vault": { "x": -4.3, "zs": [0.95, 2.15], "w": 1.1, "d": 0.95, "h": 2.2 },
  "jukebox": { "x": -4.52, "z": 3.3, "w": 0.72, "d": 0.5, "h": 1.5 },
  "planters": [{ "x": 4.25, "z": -0.6 }, { "x": -4.25, "z": 4.25 }],
  "loveseat": { "x": 0.5, "z": -4.35, "len": 1.5 },
  "npcs": {
    "borisVip": { "x": -2.2, "z": -3.5, "yaw": 0 },
    "baron": { "x": -0.25, "z": -2.5, "yaw": -1.5708 },
    "duchess": { "x": 0, "z": 0, "yaw": 0 }
  }
} /* layout:end */;

const V = VIP_LAYOUT;
type Pt = { x: number; z: number };
const [OX, OZ] = V.offset;
/** A point of the suite's own, in the casino's world. */
const W = (x: number, z: number): Pt => ({ x: x + OX, z: z + OZ });
const DEG = Math.PI / 180;
const heading = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
const facing = (from: Pt, to: Pt) => Math.atan2(to.x - from.x, to.z - from.z);

/** The suite's centre and extent in the world (the camera frames it; the floor is walkable inside,
 *  a margin in from its walls and its front rail). */
export const VIP_OFFSET = { x: OX, z: OZ };
export const VIP_FRAME = { x: OX, z: OZ, size: V.half * 2 + 0.8 };
export const VIP_REGION = { x0: OX - V.half + 0.4, x1: OX + V.half - 0.4, z0: OZ - V.half + 0.4, z1: OZ + V.half - 0.4 };
export function inPenthouse(x: number, z: number): boolean {
  return x >= VIP_REGION.x0 - 0.5 && x <= VIP_REGION.x1 + 0.5 && z >= VIP_REGION.z0 - 0.5 && z <= VIP_REGION.z1 + 0.5;
}

/** Where Bruno sets you down (out of the elevator), and the elevator's doors (the way back). */
export const VIP_ARRIVAL = W(V.arrival.x, V.arrival.z);
export const VIP_ELEVATOR = W(V.elevator.x, -V.half + 0.4);

// --- the tables ---------------------------------------------------------------------------------

export const VIP_POKER = { ...W(V.poker.x, V.poker.z), reach: V.poker.reach };
const baccaratCentre = W(V.baccarat.x, V.baccarat.z);
export const VIP_BACCARAT = { ...baccaratCentre, reach: V.baccarat.reach };
/** The way the baccarat table's curve (its players' side) faces: toward the room's middle and the
 *  elevator; its dealer stands behind the flat side, facing the same way. */
const baccFace = V.baccarat.face * DEG;
/** The twin Golden Vaults against the western glass, side by side (the first keeps its old id). */
export const VAULT_SLOTS = V.vault.zs.map((z, i) => ({ propId: i === 0 ? "slot_vault" : `slot_vault_${i + 1}`, ...W(V.vault.x, z), approach: W(V.vault.x + V.vault.d / 2 + 0.85, z) }));
export const VAULT_SLOT = VAULT_SLOTS[0];
const stoolAt = (deg: number) => {
  const d = heading(deg * DEG + baccFace);
  return W(V.baccarat.x + d.x * V.baccarat.stoolR, V.baccarat.z + d.z * V.baccarat.stoolR);
};

/** The penthouse's blackjack table (a half-moon in emerald felt, three stools on its curve, Gideon
 *  dealing from behind its flat side): played like the hall's, at its own high limits. */
const bj = V.blackjack;
const bjCentre = W(bj.x, bj.z);
export const VIP_BLACKJACK = {
  id: "blackjack_vip",
  x: bjCentre.x,
  z: bjCentre.z,
  yaw: bj.yaw,
  r: bj.r,
  reach: bj.reach,
  stoolR: bj.stoolR,
  tier: "blackjack_vip" as const,
  label: "Penthouse Table",
  dealer: "gideon" as const,
  map: "casino_vip" as const,
  stools: bj.stoolAngles.map((_, k) => `seat_vbj_${k + 1}`),
};
const bjStoolAt = (deg: number) => {
  const d = heading(bj.yaw + deg * DEG);
  return { at: { x: bjCentre.x + d.x * bj.stoolR, z: bjCentre.z + d.z * bj.stoolR }, out: d };
};
const behind = (c: Pt, yaw: number, by: number): Pt => ({ x: c.x - Math.sin(yaw) * by, z: c.z - Math.cos(yaw) * by });

/** The staff and the high rollers, where they stand or sit (y: the floor, 0). */
export const VIP_NPCS = {
  borisVip: { ...W(V.npcs.borisVip.x, V.npcs.borisVip.z), yaw: V.npcs.borisVip.yaw, y: 0, name: "Boris", role: "dealing the penthouse's high-limit poker" },
  baron: { ...W(V.poker.baron[0], V.poker.baron[1]), yaw: V.npcs.baron.yaw, y: 0, name: "Baron von Fox", role: "a high roller in white tails at the poker table" },
  duchess: { ...stoolAt(V.baccarat.duchess), yaw: facing(stoolAt(V.baccarat.duchess), baccaratCentre), y: 0, name: "Duchess Penelope", role: "a high roller in diamonds at the baccarat table" },
  scarlettVip: { ...behind(baccaratCentre, baccFace, V.baccarat.dealer), yaw: baccFace, y: 0, name: "Scarlett", role: "dealing the penthouse's high-limit baccarat, facing the elevator" },
  gideonVip: { ...behind(bjCentre, bj.yaw, bj.dealer), yaw: bj.yaw, y: 0, name: "Gideon", role: "dealing the penthouse's blackjack table" },
};

// --- seats and props ----------------------------------------------------------------------------

export type VipSeat = SeatSpec & { style: SeatStyle; floor: number };

export const VIP_SEATS: VipSeat[] = [
  // the high-limit poker table: three chairs along its front, facing Boris; stepped into from behind
  ...V.poker.chairs.map((x, i): VipSeat => {
    const at = W(x, V.poker.chairZ);
    return { propId: `seat_vpoker_${i + 1}`, x: at.x, z: at.z, rotationY: Math.PI, cushion: "pokerChair", style: "armchair", approachX: at.x, approachZ: at.z + 0.85, floor: 0 };
  }),
  // the baccarat table: stools round its curve, facing the shoe
  ...V.baccarat.stoolAngles.map((deg, i): VipSeat => {
    const at = stoolAt(deg);
    const out = heading(deg * DEG + baccFace);
    return { propId: `seat_bacc_${i + 1}`, x: at.x, z: at.z, rotationY: facing(at, baccaratCentre), cushion: "barStool", style: "stool", approachX: at.x + out.x * 0.8, approachZ: at.z + out.z * 0.8, floor: 0 };
  }),
  // the blackjack table: three stools round its curve, facing Gideon; stepped up to from behind
  ...bj.stoolAngles.map((deg, i): VipSeat => {
    const { at, out } = bjStoolAt(deg);
    return { propId: `seat_vbj_${i + 1}`, x: at.x, z: at.z, rotationY: facing(at, bjCentre), cushion: "barStool", style: "stool", approachX: at.x + out.x * 0.8, approachZ: at.z + out.z * 0.8, floor: 0 };
  }),
];

const prop = (propId: string, at: Pt, kind: PropSpec["kind"], color: string, front: Pt, y = 0): PropSpec => ({ propId, x: at.x, z: at.z, y, kind, color, defaultOn: true, approachX: front.x, approachZ: front.z });

export const VIP_PROPS: PropSpec[] = [
  prop("vip_poker_table", VIP_POKER, "poker", "#1f6b45", W(V.poker.chairs[1], V.poker.chairZ + 0.85)),
  prop("baccarat_table", VIP_BACCARAT, "baccarat", "#1f6b45", { x: baccaratCentre.x + Math.sin(baccFace) * (V.baccarat.stoolR + 0.85), z: baccaratCentre.z + Math.cos(baccFace) * (V.baccarat.stoolR + 0.85) }),
  prop(VIP_BLACKJACK.id, VIP_BLACKJACK, "blackjack", "#1f6b45", { x: bjCentre.x + Math.sin(bj.yaw) * (bj.stoolR + 0.6), z: bjCentre.z + Math.cos(bj.yaw) * (bj.stoolR + 0.6) }),
  ...VAULT_SLOTS.map((v) => prop(v.propId, v, "slot", "#e0b44a", v.approach)),
  // the elevator: back down to the hall, outside Bruno's doors
  prop("vip_exit", VIP_ELEVATOR, "vipdoor", "#d4a93c", VIP_ARRIVAL),
];

// --- what you walk round ----------------------------------------------------------------------

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
const centred = (c: Pt, hx: number, hz: number): AABB => ({ minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz });

export const VIP_OBSTACLES: AABB[] = [
  // the champagne fountain in the middle of the room
  around(W(V.fountain.x, V.fountain.z), V.fountain.r),
  // the poker table, Boris behind it, its chairs, the Baron at its end
  centred(VIP_POKER, V.poker.len / 2, V.poker.w / 2),
  around(VIP_NPCS.borisVip, 0.36),
  ...VIP_SEATS.filter((s) => s.propId.startsWith("seat_vpoker")).map((s) => around(s, 0.25)),
  around(VIP_NPCS.baron, 0.34),
  // the baccarat table (its half disc, its curve toward the room), its stools, the Duchess on hers,
  // Scarlett behind it
  around({ x: baccaratCentre.x + Math.sin(baccFace) * 0.3, z: baccaratCentre.z + Math.cos(baccFace) * 0.3 }, 0.55),
  ...[-50, 0, 50].map((deg) => around({ x: baccaratCentre.x + Math.sin(deg * DEG + baccFace) * 0.72, z: baccaratCentre.z + Math.cos(deg * DEG + baccFace) * 0.72 }, 0.42)),
  ...VIP_SEATS.filter((s) => s.propId.startsWith("seat_bacc")).map((s) => around(s, 0.22)),
  around(VIP_NPCS.duchess, 0.3),
  around(VIP_NPCS.scarlettVip, 0.3),
  // the blackjack table (small boxes over its half disc), its stools, Gideon behind it
  around({ x: bjCentre.x + Math.sin(bj.yaw) * 0.25, z: bjCentre.z + Math.cos(bj.yaw) * 0.25 }, 0.5),
  ...[-2, -1, 0, 1, 2].map((k) => around({ x: bjCentre.x + Math.sin(bj.yaw + k * 40 * DEG) * 0.72, z: bjCentre.z + Math.cos(bj.yaw + k * 40 * DEG) * 0.72 }, 0.4)),
  ...VIP_SEATS.filter((s) => s.propId.startsWith("seat_vbj")).map((s) => around(s, 0.22)),
  around(VIP_NPCS.gideonVip, 0.3),
  // the twin Golden Vaults and the jukebox against the window wall, the loveseat under the back
  // windows, the planters out front
  ...V.vault.zs.map((z) => centred(W(V.vault.x, z), V.vault.d / 2, V.vault.w / 2)),
  centred(W(V.jukebox.x, V.jukebox.z), V.jukebox.d / 2, V.jukebox.w / 2),
  centred(W(V.loveseat.x, V.loveseat.z - 0.05), V.loveseat.len / 2 + 0.05, 0.42),
  ...V.planters.map((p) => around(W(p.x, p.z), 0.4)),
];
