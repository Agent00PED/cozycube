import type { AABB } from "../collision";
import type { SeatStyle } from "../types";
import type { Corner, RopeSide } from "../boxing";
import type { PropSpec, SeatSpec } from "./lounge";

// The Velvet Ring: a vintage boxing hall of 20x20, the map `boxing_ring`. A raised canvas in the
// middle of an aged herringbone parquet, warm red brick and oak wainscot on the two back walls
// (north, -z; west, -x), tall steel sash windows onto the night, burgundy velvet drapes gathered at
// the pilasters, and a yellow neon "THE VELVET RING" over the lockers. One industrial dome lamp
// hangs over the ring (the game lights it and drifts chalk dust through its beam).
//
//   the ring       (centre) a 6x6 canvas 1 m up on its apron: cream, a faded gold star, four padded
//                  posts (Red, Blue and two neutral), three elastic ropes a side; wooden steps at the
//                  Red (south-west) and Blue (north-east) corners, a stool, a water bucket and a
//                  chalk basin in each; the timekeeper's table and bell at the south side
//   the lounge     (west, checkerboard tiles) three tiers of wooden benches against the wall, two
//                  tufted Chesterfields, high-top cocktail tables, and the ringside chalkboard on
//                  its easel (the contenders, the bout, the live odds: bets go on here)
//   the gym        (north, parquet) vintage wooden lockers (two doors open), a bench with folded
//                  towels, a balance-beam scale, a heavy bag on its wall bracket, a speed bag, and
//                  two tall oak-framed mirrors on the north wall (a trainee skips rope before them)
//   the pro shop   (north-east, checkerboard) Coach Bruno's oak counter (a bulldog in a hoodie,
//                  whistle and mouthguard), a back bar of gloves and tape, and the glass trophy case
//                  with the golden Velvet Championship Belt under its downlights
//   ringside       (east, south) folding chairs down the east side, the judges' chairs at the bell
//                  table, and open floor for everyone else; a brass rail along the open front
//
// Authored ONCE here, in the map's own coordinates (x and z from -10 to 10): RING_LAYOUT is plain
// JSON between the markers, read as it is by scripts/blender/build_boxing_ring.py to build
// boxing_ring.glb; everything else below is derived from it (seats, props, colliders, the fighters'
// bounds inside the ropes, the corners, the spawns).
//
// Spectators never set foot on the canvas: the whole ring (its apron and steps) is a collider.
// A fighter steps in through their corner's steps (the server puts them on the canvas) and from
// then on walks only inside the ropes (RING_INNER), on the canvas's height (RING_FLOOR_Y).

export const RING_LAYOUT = /* layout:begin */ {
  "half": 10,
  "walls": { "t": 0.2, "h": 4.3, "wainscot": 1.15 },
  "zones": [
    { "id": "ring", "floor": "parquet", "x0": -5.6, "x1": 10, "z0": -5.6, "z1": 10 },
    { "id": "gym", "floor": "parquet", "x0": -10, "x1": 3.6, "z0": -10, "z1": -5.6 },
    { "id": "lounge", "floor": "checker", "x0": -10, "x1": -5.6, "z0": -5.6, "z1": 10 },
    { "id": "shop", "floor": "checker", "x0": 3.6, "x1": 10, "z0": -10, "z1": -5.6 }
  ],
  "ring": { "x": 0, "z": 0, "rope": 3.0, "apron": 3.45, "canvas": 1.0, "post": 1.3, "ropes": [0.38, 0.74, 1.1], "inner": 2.65, "corner": 2.2 },
  "corners": { "red": [-1, 1], "blue": [1, -1] },
  "steps": { "out": 0.8, "w": 0.75, "count": 4 },
  "lamp": { "y": 6.4, "r": 0.62, "chain": 10.5 },
  "bell": { "x": 0, "z": 4.7, "len": 2.6, "d": 0.62, "h": 0.76, "chairZ": 5.45, "chairs": [-0.85, 0, 0.85] },
  "ringside": { "x": 4.95, "zs": [-1.65, -0.55, 0.55, 1.65] },
  "bleachers": { "tiers": 3, "depth": 0.55, "rise": 0.4, "z0": -3.9, "z1": 3.9, "seats": [-2.6, 0, 2.6] },
  "sofas": [{ "x": -6.55, "z": -2.3, "len": 1.9 }, { "x": -6.55, "z": 2.4, "len": 1.9 }],
  "cocktails": [{ "x": -6.8, "z": -4.9 }, { "x": -7.0, "z": 7.1 }],
  "chalkboard": { "x": -5.7, "z": 5.6, "yaw": 0.785, "w": 1.35, "h": 1.0 },
  "lockers": { "x0": -4.8, "x1": -1.2, "d": 0.5, "h": 1.95, "count": 6, "open": [1, 4] },
  "bench": { "x": -3.0, "z": -8.15, "len": 1.5 },
  "scale": { "x": -7.1, "z": -9.2 },
  "heavyBag": { "x": 0.9, "z": -8.85 },
  "speedBag": { "x": 2.75, "z": -9.45, "y": 1.62 },
  "mirrors": { "x0": -9.62, "x1": -8.3, "y0": 0.3, "y1": 1.98 },
  "trainee": { "x": -8.96, "z": -8.1 },
  "neon": { "x": -3.0, "y": 3.3, "size": 0.46, "text": "THE VELVET RING" },
  "windows": { "north": [-7.4], "west": [-7.6, -1.2, 3.2, 7.9], "y0": 2.0, "y1": 3.9, "w": 1.5 },
  "pilasters": { "north": [-5.8, 3.6], "west": [-5.6, 5.6] },
  "posters": [{ "wall": "z", "at": 1.9, "y": 2.85, "w": 0.7, "h": 0.95, "title": "SAT NIGHT", "tint": "#C8453A" }, { "wall": "x", "at": 1.0, "y": 2.6, "w": 0.66, "h": 0.9, "title": "TITLE BOUT", "tint": "#3A6FB0" }],
  "shop": { "x0": 5.6, "counterZ": -6.3, "counterD": 0.62, "counterH": 0.98, "platform": 0.22, "bruno": [7.6, -7.2] },
  "trophy": { "x": 4.6, "z": -9.45, "w": 1.2, "d": 0.7, "h": 2.05 },
  "spawns": [[6.4, 6.4], [7.6, 5.0], [5.0, 7.6], [8.0, 7.9]]
} /* layout:end */;

const R = RING_LAYOUT;
type Pt = { x: number; z: number };
const FACE_POS_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;
const FACE_POS_Z = 0;
const FACE_NEG_Z = Math.PI;

/** The walls' inner faces (the north wall's at z = -WALL, the west wall's at x = -WALL). */
export const RING_WALL = R.half - R.walls.t;
/** The camera frames the hall with a margin. */
export const RING_FRAME = { size: R.half * 2 + 0.8 };

// --- the ring -------------------------------------------------------------------------------------

export const RING = {
  x: R.ring.x,
  z: R.ring.z,
  /** The ropes' line (the posts stand on it), the apron's edge, the canvas's height. */
  rope: R.ring.rope,
  apron: R.ring.apron,
  canvasY: R.ring.canvas,
};
/** How high a fighter's feet are: on the canvas. */
export const RING_FLOOR_Y = R.ring.canvas;
/** Where a fighter's origin may go, inside the ropes. */
export const RING_INNER = { x0: R.ring.x - R.ring.inner, x1: R.ring.x + R.ring.inner, z0: R.ring.z - R.ring.inner, z1: R.ring.z + R.ring.inner };
/** Whether (x, z) is over the ring's apron (the canvas's height applies there). */
export function onRing(x: number, z: number): boolean {
  return Math.abs(x - RING.x) <= RING.apron && Math.abs(z - RING.z) <= RING.apron;
}
/** (x, z) kept inside the ropes. */
export function clampToRing(x: number, z: number): Pt {
  return { x: Math.max(RING_INNER.x0, Math.min(RING_INNER.x1, x)), z: Math.max(RING_INNER.z0, Math.min(RING_INNER.z1, z)) };
}
/** Whether a fighter's disc at (x, z) would cross the ropes. */
export function outsideRopes(x: number, z: number, radius = 0): boolean {
  return x - radius < RING_INNER.x0 || x + radius > RING_INNER.x1 || z - radius < RING_INNER.z0 || z + radius > RING_INNER.z1;
}

const cornerSign = (c: Corner) => ({ sx: R.corners[c][0], sz: R.corners[c][1] });
/** Each corner inside the ropes (where a fighter starts a round), and its steps outside (where you
 *  walk up to step in, and where you are set down after the bout). */
export const RING_CORNERS: Record<Corner, { inside: Pt; steps: Pt; foot: Pt; yaw: number }> = {
  red: cornerFor("red"),
  blue: cornerFor("blue"),
};
function cornerFor(c: Corner) {
  const { sx, sz } = cornerSign(c);
  const inside = { x: R.ring.x + sx * R.ring.corner, z: R.ring.z + sz * R.ring.corner };
  const out = R.ring.apron + R.steps.out / 2;
  const steps = { x: R.ring.x + sx * out, z: R.ring.z + sz * out };
  const footAt = R.ring.apron + R.steps.out + 0.55;
  const foot = { x: R.ring.x + sx * footAt, z: R.ring.z + sz * footAt };
  // facing the ring's middle from the corner
  return { inside, steps, foot, yaw: Math.atan2(-sx, -sz) };
}
/** The two neutral corners, where the standing fighter waits out a count. */
export const NEUTRAL_CORNERS: Pt[] = [
  { x: R.ring.x - R.ring.corner, z: R.ring.z - R.ring.corner },
  { x: R.ring.x + R.ring.corner, z: R.ring.z + R.ring.corner },
];
/** How far from its corner a fighter may step up to it (the server's reach for the steps). */
export const CORNER_REACH = 1.6;

/** Which side's ropes a push from the middle toward (x, z) meets, and where someone launched
 *  through them lands on the floor outside. */
export function ropeSideOf(dx: number, dz: number): RopeSide {
  return Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? "e" : "w") : dz >= 0 ? "s" : "n";
}
export function ringOutLanding(side: RopeSide, along: number): Pt {
  const a = Math.max(-2.6, Math.min(2.6, along));
  const out = R.ring.apron + 0.55;
  return side === "e" ? { x: R.ring.x + out, z: R.ring.z + a } : side === "w" ? { x: R.ring.x - out, z: R.ring.z + a } : side === "s" ? { x: R.ring.x + a, z: R.ring.z + out } : { x: R.ring.x + a, z: R.ring.z - out };
}

// --- the staff and the fixtures ---------------------------------------------------------------------

/** Coach Bruno behind his counter, facing the floor. */
export const COACH_BRUNO = { x: R.shop.bruno[0], z: R.shop.bruno[1], yaw: FACE_POS_Z, y: R.shop.platform, name: "Coach Bruno" };
/** Where you stand to talk to him: in front of the counter. */
export const COACH_FRONT = { x: COACH_BRUNO.x, z: R.shop.counterZ + R.shop.counterD / 2 + 0.75 };
export const COACH_REACH = 1.9;
/** The ringside chalkboard (its face turned toward the room), and where you read it from. */
export const CHALKBOARD = { x: R.chalkboard.x, z: R.chalkboard.z, yaw: R.chalkboard.yaw };
export const CHALKBOARD_FRONT = { x: R.chalkboard.x + Math.sin(R.chalkboard.yaw) * 1.1, z: R.chalkboard.z + Math.cos(R.chalkboard.yaw) * 1.1 };
export const CHALKBOARD_REACH = 1.8;
export const HEAVY_BAG = { x: R.heavyBag.x, z: R.heavyBag.z };
export const HEAVY_BAG_FRONT = { x: R.heavyBag.x, z: R.heavyBag.z + 0.95 };
export const SPEED_BAG = { x: R.speedBag.x, z: R.speedBag.z };
export const SPEED_BAG_FRONT = { x: R.speedBag.x, z: RING_WALL * -1 + 1.15 };
export const WEIGH_SCALE = { x: R.scale.x, z: R.scale.z };
export const WEIGH_SCALE_FRONT = { x: R.scale.x, z: R.scale.z + 0.95 };
/** How near a gym fixture you must be to use it. */
export const GYM_REACH = 1.5;
/** The timekeeper's bell, on the judges' table. */
export const RING_BELL = { x: R.bell.x + R.bell.len / 2 - 0.35, z: R.bell.z };

// --- the regulars -----------------------------------------------------------------------------------

/** Jimmy the Slugger, the sparring partner, waiting by the Blue Corner's steps (facing the room),
 *  and where you stand to call him in. */
export const JIMMY = { x: 5.55, z: -3.25, yaw: FACE_POS_Z };
export const JIMMY_FRONT: Pt = { x: JIMMY.x, z: JIMMY.z + 0.95 };
export const JIMMY_REACH = 1.6;
/** A boxer working the heavy bag from its west side, all day long (ring_regulars.glb). */
export const BAG_BOXER = { x: R.heavyBag.x - 0.88, z: R.heavyBag.z + 0.1, yaw: FACE_POS_X };
/** A trainee skipping rope before the north mirrors, facing them (ring_regulars.glb's Trainee: the
 *  rope turns 0.64 m round the hands, so the collider keeps everyone clear of it). */
export const TRAINEE = { x: R.trainee.x, z: R.trainee.z, yaw: FACE_NEG_Z };
export const TRAINEE_CLEAR = 0.45;
/** Ref Barnaby, the ring's referee (ring_regulars.glb): he waits in the north-west neutral corner,
 *  walks the apron through a round (this far out from the middle: between the ropes and the apron's
 *  edge, on the canvas's height), and steps in for a count or the result. No collider: he never
 *  stands in anyone's way. */
export const REF_APRON = (R.ring.rope + R.ring.apron) / 2;
export const REF_HOME: Pt = { x: R.ring.x - R.ring.corner, z: R.ring.z - R.ring.corner };

// --- seats ------------------------------------------------------------------------------------------

export type RingSeat = SeatSpec & { style: SeatStyle; floor: number };

const bleacherX = (tier: number) => -RING_WALL + (R.bleachers.tiers - tier) * R.bleachers.depth - 0.16;
const BLEACHER_FRONT = -RING_WALL + R.bleachers.tiers * R.bleachers.depth;
/** Two regulars cheering from the bleachers (ring_regulars.glb, seated): their seats are theirs,
 *  never offered to anyone else. `n` is the seat's number on the tiers. */
export const RING_FANS = [
  { node: "RingFan_Raccoon", n: 4 },
  { node: "RingFan_Rabbit", n: 9 },
].map(({ node, n }) => {
  const tier = Math.floor((n - 1) / R.bleachers.seats.length);
  return { node, seat: `ring_bleacher_${n}`, x: bleacherX(tier), z: R.bleachers.seats[(n - 1) % R.bleachers.seats.length], y: tier * R.bleachers.rise, yaw: FACE_POS_X };
});
const FAN_SEATS = new Set(RING_FANS.map((f) => f.seat));
/** Fight night: five more fans fill the bleachers while a bout is on (fading in, and out after it),
 *  sat between the seats (never on one, so a player's seat is always free). One node of
 *  ring_regulars.glb, RingCrowd, fused into a single skinned mesh: `RingCrowd_<n>` each. */
export const RING_CROWD = [
  { tier: 0, z: -1.3 },
  { tier: 0, z: 1.3 },
  { tier: 1, z: 1.3 },
  { tier: 2, z: -1.3 },
  { tier: 0, z: 3.45 },
].map(({ tier, z }, i) => ({ node: `RingCrowd_${i + 1}`, x: bleacherX(tier), z, y: tier * R.bleachers.rise, yaw: FACE_POS_X }));
/** Where a beaten fighter stands when every bleacher seat is taken (open floor at their front). */
export const RING_BENCH_FRONT: Pt = { x: BLEACHER_FRONT + 0.55, z: 0 };
export const RING_SEATS: RingSeat[] = [
  // the tiered benches: three to a tier, facing the ring; stepped up to from the floor in front
  ...Array.from({ length: R.bleachers.tiers }, (_, tier) =>
    R.bleachers.seats.map(
      (z, i): RingSeat => ({ propId: `ring_bleacher_${tier * R.bleachers.seats.length + i + 1}`, x: bleacherX(tier), z, rotationY: FACE_POS_X, cushion: "bleacher", style: "bleacher", approachX: BLEACHER_FRONT + 0.5, approachZ: z, floor: tier * R.bleachers.rise })
    )
  )
    .flat()
    .filter((seat) => !FAN_SEATS.has(seat.propId)),
  // the Chesterfields: two to a sofa, facing the ring
  ...R.sofas.flatMap((s, k) => [-0.45, 0.45].map((dz, i): RingSeat => ({ propId: `ring_sofa_${k * 2 + i + 1}`, x: s.x + 0.08, z: s.z + dz, rotationY: FACE_POS_X, cushion: "chesterfield", style: "armchair", approachX: s.x + 0.95, approachZ: s.z + dz, floor: 0 }))),
  // the cocktail tables' leather stools, either side of each table
  ...R.cocktails.flatMap((c, k) => [-1, 1].map((sz, i): RingSeat => ({ propId: `ring_stool_${k * 2 + i + 1}`, x: c.x, z: c.z + sz * 0.55, rotationY: sz > 0 ? FACE_NEG_Z : FACE_POS_Z, cushion: "barStool", style: "stool", approachX: c.x + 0.75, approachZ: c.z + sz * 0.55, floor: 0 }))),
  // the folding chairs down the east side, facing the ring
  ...R.ringside.zs.map((z, i): RingSeat => ({ propId: `ring_side_${i + 1}`, x: R.ringside.x, z, rotationY: FACE_NEG_X, cushion: "dining", style: "armchair", approachX: R.ringside.x + 0.75, approachZ: z, floor: 0 })),
  // the judges' chairs at the bell table, facing the ring
  ...R.bell.chairs.map((dx, i): RingSeat => ({ propId: `ring_judge_${i + 1}`, x: R.bell.x + dx, z: R.bell.chairZ, rotationY: FACE_NEG_Z, cushion: "dining", style: "armchair", approachX: R.bell.x + dx, approachZ: R.bell.chairZ + 0.75, floor: 0 })),
  // the gym's bench, facing the ring
  ...[-0.4, 0.4].map((dx, i): RingSeat => ({ propId: `ring_bench_${i + 1}`, x: R.bench.x + dx, z: R.bench.z, rotationY: FACE_POS_Z, cushion: "gymBench", style: "wood", approachX: R.bench.x + dx, approachZ: R.bench.z + 0.8, floor: 0 })),
];

// --- props ------------------------------------------------------------------------------------------

const prop = (propId: string, at: Pt, kind: PropSpec["kind"], color: string, front: Pt, y = 0): PropSpec => ({ propId, x: at.x, z: at.z, y, kind, color, defaultOn: true, approachX: front.x, approachZ: front.z });

export const RING_PROPS: PropSpec[] = [
  // the corner steps: step in as Red or Blue
  prop("ring_red", RING_CORNERS.red.steps, "ringcorner", "#d8383a", RING_CORNERS.red.foot),
  prop("ring_blue", RING_CORNERS.blue.steps, "ringcorner", "#3a6fd8", RING_CORNERS.blue.foot),
  prop("ring_chalkboard", CHALKBOARD, "chalkboard", "#2f3a30", CHALKBOARD_FRONT),
  prop("coach_bruno", { x: COACH_BRUNO.x, z: R.shop.counterZ }, "coach", "#c99a6b", COACH_FRONT),
  prop("ring_jimmy", JIMMY, "spar", "#c8453a", JIMMY_FRONT),
  prop("heavy_bag", HEAVY_BAG, "heavybag", "#7a2a22", HEAVY_BAG_FRONT),
  prop("speed_bag", SPEED_BAG, "speedbag", "#8a3a2a", SPEED_BAG_FRONT, R.speedBag.y),
  prop("weigh_scale", WEIGH_SCALE, "scale", "#b8b0a0", WEIGH_SCALE_FRONT),
];

// --- what you walk round --------------------------------------------------------------------------

const around = (p: Pt, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
const rect = (x0: number, x1: number, z0: number, z1: number): AABB => ({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });

export const RING_OBSTACLES: AABB[] = [
  // the ring, apron and all: nobody but a fighter (put there by the server) stands on it
  rect(-R.ring.apron, R.ring.apron, -R.ring.apron, R.ring.apron),
  // the corner steps
  ...(["red", "blue"] as const).map((c) => around(RING_CORNERS[c].steps, R.steps.w / 2)),
  // the bell table and its chairs
  rect(R.bell.x - R.bell.len / 2, R.bell.x + R.bell.len / 2, R.bell.z - R.bell.d / 2, R.bell.z + R.bell.d / 2),
  ...RING_SEATS.filter((s) => s.propId.startsWith("ring_judge") || s.propId.startsWith("ring_side")).map((s) => around(s, 0.24)),
  // the bleachers, the Chesterfields, the cocktail tables and their stools, the chalkboard
  rect(-RING_WALL, BLEACHER_FRONT, R.bleachers.z0, R.bleachers.z1),
  ...R.sofas.map((s) => rect(s.x - 0.48, s.x + 0.42, s.z - s.len / 2, s.z + s.len / 2)),
  ...R.cocktails.map((c) => around(c, 0.34)),
  ...RING_SEATS.filter((s) => s.propId.startsWith("ring_stool")).map((s) => around(s, 0.22)),
  around(CHALKBOARD, 0.36),
  // the gym: the lockers, the bench, the scale, the heavy bag, the speed bag's platform
  rect(R.lockers.x0, R.lockers.x1, -RING_WALL, -RING_WALL + R.lockers.d),
  rect(R.bench.x - R.bench.len / 2, R.bench.x + R.bench.len / 2, R.bench.z - 0.2, R.bench.z + 0.2),
  rect(R.scale.x - 0.45, R.scale.x + 0.45, -RING_WALL, R.scale.z + 0.35),
  around(HEAVY_BAG, 0.3),
  rect(R.speedBag.x - 0.45, R.speedBag.x + 0.45, -RING_WALL, -RING_WALL + 0.55),
  // Jimmy the Slugger by the Blue Corner's steps, the boxer at the heavy bag, the trainee skipping rope
  around(JIMMY, 0.3),
  around(BAG_BOXER, 0.3),
  around(TRAINEE, TRAINEE_CLEAR),
  // the pro shop: the counter and everything behind it (Coach Bruno, the back bar); the trophy case
  rect(R.shop.x0, R.half, -RING_WALL, R.shop.counterZ + R.shop.counterD / 2),
  rect(R.trophy.x - R.trophy.w / 2, R.trophy.x + R.trophy.w / 2, -RING_WALL, -RING_WALL + R.trophy.d),
];

/** The hall's floor, a margin in from its walls and its front rail. */
export const RING_REGIONS = [{ x0: -R.half + 0.6, x1: R.half - 0.6, z0: -R.half + 0.6, z1: R.half - 0.6 }];
export const RING_SPAWNS: Pt[] = R.spawns.map(([x, z]) => ({ x, z }));

/** The zone under (x, z), for the floor it is laid with. */
export function ringZoneAt(x: number, z: number): (typeof R.zones)[number] {
  return R.zones.find((zn) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) ?? R.zones[0];
}
