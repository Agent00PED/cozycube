import { CUSHIONS, napPose, seatAnchorY } from "./seats";
import type { MapId, SeatStyle, ToggleableKind } from "./types";
import { LOFT_MOCHI, LOFT_PROPS, LOFT_SEATS } from "./worlds/lounge";
import { CAMP_PROPS, CAMP_SEATS, lieSeatPose } from "./worlds/campfire";

// The per-map tables of things you can sit on and things you can use, with the approach point of
// each (where you stand to use it, and where you land when you get up). The lounge's come from
// its floor plan (shared/worlds/lounge.ts); the other worlds have none until they are rebuilt.

export interface ChairConfig {
  propId: string;
  x: number;
  z: number;
  rotationY: number;
  style: SeatStyle;
  approachX: number;
  approachZ: number;
  /** DERIVED from the seat's cushion (shared/seats.ts): the seated avatar's origin height. */
  sitY: number;
  /** A long seat's nap pose (lying along it while AFK), DERIVED from where the head rests. */
  nap?: { x: number; z: number; rotationY: number; y: number };
}

export interface ToggleableConfig {
  propId: string;
  x: number;
  y?: number;
  z: number;
  kind: ToggleableKind;
  color: string;
  defaultOn: boolean;
  approachX?: number;
  approachZ?: number;
  /** A potted plant: each player can water it once a day for PLANT_WATER_COINS. */
  waterable?: boolean;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export const MAP_CHAIRS: Record<MapId, ChairConfig[]> = {
  cozy_lounge: LOFT_SEATS.map((s) => ({
    propId: s.propId,
    x: s.x,
    z: s.z,
    rotationY: s.rotationY,
    style: "pad" as const,
    approachX: s.approachX,
    approachZ: s.approachZ,
    sitY: round(seatAnchorY(CUSHIONS[s.cushion])),
    nap: s.nap && napPose(CUSHIONS[s.cushion], s.nap.head, s.nap.dir),
  })),
  // the campfire: the log benches (sit, facing the fire), and the hammock and the tipi, which you
  // lie down in: a lie seat's position, heading and height are where its lying avatar goes
  campfire_night: CAMP_SEATS.map((s) => {
    const lie = lieSeatPose(s);
    return {
      propId: s.propId,
      x: lie ? round(lie.x) : s.x,
      z: lie ? round(lie.z) : s.z,
      rotationY: lie ? round(lie.rotationY) : s.rotationY,
      style: lie ? ("blanket" as const) : ("log" as const),
      approachX: round(s.approachX),
      approachZ: round(s.approachZ),
      sitY: round(lie ? lie.y : seatAnchorY(CUSHIONS[s.cushion])),
    };
  }),
  sunset_beach: [],
  velvet_casino: [],
  boxing_ring: [],
  japanese_onsen: [],
  retro_arcade: [],
  gaming_cafe: [],
};

export const MAP_TOGGLEABLES: Record<MapId, ToggleableConfig[]> = {
  cozy_lounge: LOFT_PROPS,
  campfire_night: CAMP_PROPS,
  sunset_beach: [],
  velvet_casino: [],
  boxing_ring: [],
  japanese_onsen: [],
  retro_arcade: [],
  gaming_cafe: [],
};

/** Where to stand for each seat and walk-up prop, by prop id. */
export const APPROACH_POINTS: Record<string, { x: number; z: number }> = {};
for (const list of Object.values(MAP_CHAIRS)) for (const c of list) APPROACH_POINTS[c.propId] = { x: c.approachX, z: c.approachZ };
for (const list of Object.values(MAP_TOGGLEABLES)) for (const t of list) if (t.approachX !== undefined && t.approachZ !== undefined) APPROACH_POINTS[t.propId] = { x: t.approachX, z: t.approachZ };

/** The props tagged waterable (the potted plants), by prop id, across every map. */
export const WATERABLE_PROPS: ReadonlySet<string> = new Set(Object.values(MAP_TOGGLEABLES).flatMap((list) => list.filter((t) => t.waterable).map((t) => t.propId)));
export function isWaterable(propId: string): boolean {
  return WATERABLE_PROPS.has(propId);
}

/** There is no pier yet. */
export function isFishingSeat(_propId: string): boolean {
  return false;
}

// ---------------------------------------------------------------------------------------
// Mochi's day
// ---------------------------------------------------------------------------------------
//
// One schedule per world, read off the wall clock, so the server, every client and the dock agree
// on where she is without a single message. At each resting stop she washes a paw, loafs, then
// stretches and yawns; then she waddles to the next stop (through any `pass` corners) and starts
// again.

export const MOCHI_WAYPOINTS: Partial<Record<MapId, typeof LOFT_MOCHI>> = { cozy_lounge: LOFT_MOCHI };

export type MochiPhase = "lick" | "loaf" | "stretch" | "walk";

const LICK_S = 6;
const LOAF_S = 20;
const STRETCH_S = 4;
const REST_S = LICK_S + LOAF_S + STRETCH_S;
/** Her waddle, in units per second. */
const WALK_SPEED = 0.55;

export interface MochiSpot {
  x: number;
  z: number;
  /** A spot beside her a player can stand on (interpolated along a walk). */
  ax: number;
  az: number;
  /** The way she faces, about y (0 = +z). */
  heading: number;
  phase: MochiPhase;
  /** 0..1 through the current phase. */
  t: number;
}

type Stop = (typeof LOFT_MOCHI)[number];
const headingTo = (a: Stop, b: Stop) => Math.atan2(b.x - a.x, b.z - a.z);
/** The resting heading at a stop: its own, or toward the next real stop. */
function restHeading(stops: Stop[], i: number): number {
  const a = stops[i];
  if (a.face !== undefined) return a.face;
  return headingTo(a, stops[(i + 1) % stops.length]);
}

function turnToward(from: number, to: number, k: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}

/** Where Mochi is, and what she is doing, `seconds` (wall clock) into the day. */
export function mochiSpot(mapId: MapId, seconds: number): MochiSpot {
  const stops = MOCHI_WAYPOINTS[mapId];
  if (!stops || stops.length === 0) return { x: 0, z: 0, ax: 0, az: 0, heading: 0, phase: "loaf", t: 0 };

  const legs = stops.map((a, i) => {
    const b = stops[(i + 1) % stops.length];
    return { a, b, i, rest: a.pass ? 0 : REST_S, walk: Math.hypot(b.x - a.x, b.z - a.z) / WALK_SPEED };
  });
  const cycle = legs.reduce((sum, l) => sum + l.rest + l.walk, 0);
  let t = ((seconds % cycle) + cycle) % cycle;

  let heading = 0;
  for (const { a, b, i, rest, walk } of legs) {
    if (t < rest) {
      const phase: MochiPhase = t < LICK_S ? "lick" : t < LICK_S + LOAF_S ? "loaf" : "stretch";
      const start = phase === "lick" ? 0 : phase === "loaf" ? LICK_S : LICK_S + LOAF_S;
      const len = phase === "lick" ? LICK_S : phase === "loaf" ? LOAF_S : STRETCH_S;
      return { x: a.x, z: a.z, ax: a.ax, az: a.az, heading: restHeading(stops, i), phase, t: (t - start) / len };
    }
    t -= rest;
    if (t < walk) {
      const k = t / walk;
      // she swings round to face the way she is going over the first tenth of the walk
      heading = turnToward(a.pass ? headingTo(a, b) : restHeading(stops, i), headingTo(a, b), Math.min(1, k * 10));
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, ax: a.ax + (b.ax - a.ax) * k, az: a.az + (b.az - a.az) * k, heading, phase: "walk", t: k };
    }
    t -= walk;
  }
  const first = stops[0];
  return { x: first.x, z: first.z, ax: first.ax, az: first.az, heading: restHeading(stops, 0), phase: "lick", t: 0 };
}
