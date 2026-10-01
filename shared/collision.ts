import { MAP_HALF, MAP_IDS, type MapId } from "./types";
import { LOFT_OBSTACLES, LOFT_SPAWNS, NAV_LIMIT } from "./worlds/lounge";
import { CAMP_OBSTACLES, CAMP_SPAWNS } from "./worlds/campfire";
import { CASINO_OBSTACLES, CASINO_REGIONS, CASINO_SPAWNS, casinoFloorY } from "./worlds/casino";
import { VIP_ARRIVAL, VIP_OBSTACLES, VIP_REGION } from "./worlds/casino_vip";
import { FOREST_OBSTACLES, FOREST_SPAWNS } from "./worlds/forest";
import { RING_FLOOR_Y, RING_OBSTACLES, RING_SPAWNS, onRing } from "./worlds/boxing_ring";
import { CAVERNS_OBSTACLES, CAVERNS_SPAWNS, cavernsBlocked, cavernsFloorY } from "./worlds/caverns";

// Where you can stand. The lounge, the campfire, the woods, the casino, the Velvet Ring and the
// Glimmering Caverns are authored in shared/worlds/ (lounge.ts, campfire.ts, forest.ts, casino.ts,
// boxing_ring.ts, caverns.ts); every
// other world is still an open square floor with one spawn in the middle until it is rebuilt.

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** A round thing (a trunk, a rock, a stool, an ore node): a disc of this radius in the box's middle,
   *  the box only its bounds. A square collider round a round thing sticks out 40% at its corners:
   *  an invisible catch as you brush past, a gap between two that looks wide enough and isn't. */
  r?: number;
}
/** A round thing's collider: a disc of `r` round `p`. */
export const disc = (p: { x: number; z: number }, r: number): AABB => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r, r });

/** Kept for shared/volleyball.ts (the beach is not built yet). */
export const WORLD_LIMIT = 9.4;
export const SHORELINE_Z = 4.8;

/** The furthest from the centre an avatar's origin may be, on either axis (a square world). */
export function worldLimit(mapId: MapId): number {
  return mapId === "cozy_lounge" ? NAV_LIMIT : MAP_HALF[mapId] - 0.6;
}

/** A rectangle of floor an avatar's origin may stand in. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
/** Each world's floor: a square round the origin, or (the casino) its hall's floor plan, or (the
 *  penthouse) the suite's floor, which sits where it was authored, off at VIP_OFFSET. */
const REGIONS: Record<MapId, Rect[]> = Object.fromEntries(
  MAP_IDS.map((id) => {
    const l = worldLimit(id);
    return [id, id === "velvet_casino" ? CASINO_REGIONS : id === "casino_vip" ? [VIP_REGION] : [{ x0: -l, x1: l, z0: -l, z1: l }]];
  })
) as Record<MapId, Rect[]>;
export const walkRegions = (mapId: MapId): Rect[] => REGIONS[mapId];
const inside = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
/** The rectangle all of a world's floor lies within (the pathfinding grid covers it). */
export function mapBounds(mapId: MapId): Rect {
  const rs = REGIONS[mapId];
  return { x0: Math.min(...rs.map((r) => r.x0)), x1: Math.max(...rs.map((r) => r.x1)), z0: Math.min(...rs.map((r) => r.z0)), z1: Math.max(...rs.map((r) => r.z1)) };
}

const open = () => [] as AABB[];
export const MAP_OBSTACLES: Record<MapId, AABB[]> = {
  cozy_lounge: LOFT_OBSTACLES,
  campfire_night: CAMP_OBSTACLES,
  sunset_beach: open(),
  velvet_casino: CASINO_OBSTACLES,
  casino_vip: VIP_OBSTACLES,
  whispering_woods: FOREST_OBSTACLES,
  glimmering_caverns: CAVERNS_OBSTACLES,
  boxing_ring: RING_OBSTACLES,
  japanese_onsen: open(),
  retro_arcade: open(),
  gaming_cafe: open(),
};

const centre = () => [{ x: 0, z: 0 }];
export const MAP_SPAWN_POINTS: Record<MapId, { x: number; z: number }[]> = {
  cozy_lounge: LOFT_SPAWNS,
  campfire_night: CAMP_SPAWNS,
  sunset_beach: centre(),
  velvet_casino: CASINO_SPAWNS,
  casino_vip: [VIP_ARRIVAL],
  whispering_woods: FOREST_SPAWNS,
  glimmering_caverns: CAVERNS_SPAWNS,
  boxing_ring: RING_SPAWNS,
  japanese_onsen: centre(),
  retro_arcade: centre(),
  gaming_cafe: centre(),
};

/** True when a disc of `radius` at (x, z) is off the floor or overlaps furniture. */
/** The caverns' ground is tested with the feet's footprint (m), everything standing on it with the
 *  body's radius. */
export const CAVE_FOOT = 0.18;
export function isBlocked(x: number, z: number, mapId: MapId, radius = 0.3): boolean {
  if (!REGIONS[mapId].some((r) => inside(r, x, z))) return true;
  // (the caverns' ground: its own mask of where you can stand, besides its furniture's boxes; tested
  // with the feet's footprint, not the body's, so you walk right up to a bank's edge and through a
  // gap you can see: docs/caverns-roadmap.md R4.1)
  if (mapId === "glimmering_caverns" && cavernsBlocked(x, z, Math.min(radius, CAVE_FOOT))) return true;
  for (const b of MAP_OBSTACLES[mapId]) {
    if (!(x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ)) continue;
    if (b.r === undefined) return true;
    const dx = x - (b.minX + b.maxX) / 2;
    const dz = z - (b.minZ + b.maxZ) / 2;
    if (dx * dx + dz * dz < (b.r + radius) * (b.r + radius)) return true;
  }
  return false;
}

/** The step turned this far either way (degrees) when the axis split stalls: along a slanted cliff,
 *  round a rock, past a corner's edge. */
const SLIDE_TURNS = [25, -25, 45, -45, 65, -65, 80, -80].map((d) => (d * Math.PI) / 180);
/** How clear a spot is: the widest of these radii a body there fits (0: not even a point). */
const CLEARANCE = [0.2, 0.1, 0.02];
function clearance(x: number, z: number, mapId: MapId, radius: number): number {
  if (!isBlocked(x, z, mapId, radius)) return CLEARANCE.length + 1;
  for (let i = 0; i < CLEARANCE.length; i++) if (!isBlocked(x, z, mapId, CLEARANCE[i])) return CLEARANCE.length - i;
  return 0;
}

/** A step against the world. Axis-separated first, so brushing a wall or a table slides along it; where
 *  that barely moves (a slanted cliff's stair of mask cells, a rock's round side, a corner's edge), the
 *  step turned a little either way, whichever gets furthest the way you asked. Standing somewhere a
 *  body doesn't fit (set down there by the server, a seat's exit, a door), any step that frees you more
 *  is taken: you are never held where you stand. (scripts/validate-world.ts replays steering on every
 *  map against a snag budget.) */
export function slideStep(pos: { x: number; z: number }, dx: number, dz: number, mapId: MapId, radius = 0.3, substep = 0.12) {
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return;
  const steps = Math.max(1, Math.ceil(len / substep));
  const ux = dx / len;
  const uz = dz / len;
  const s = len / steps;
  for (let i = 0; i < steps; i++) {
    const x0 = pos.x;
    const z0 = pos.z;
    if (isBlocked(x0, z0, mapId, radius)) {
      // (stuck inside something: take the move if it leaves you clearer, or no worse off)
      const here = clearance(x0, z0, mapId, radius);
      const to = clampToRegion(mapId, x0, z0, x0 + ux * s, z0 + uz * s);
      if (clearance(to.x, to.z, mapId, radius) >= here) {
        pos.x = to.x;
        pos.z = to.z;
      }
      continue;
    }
    const nx = clampToRegion(mapId, pos.x, pos.z, pos.x + ux * s, pos.z).x;
    if (!isBlocked(nx, pos.z, mapId, radius)) pos.x = nx;
    const nz = clampToRegion(mapId, pos.x, pos.z, pos.x, pos.z + uz * s).z;
    if (!isBlocked(pos.x, nz, mapId, radius)) pos.z = nz;
    const gained = (pos.x - x0) * ux + (pos.z - z0) * uz;
    if (gained >= 0.5 * s) continue;
    let bestX = pos.x;
    let bestZ = pos.z;
    let best = gained;
    for (const a of SLIDE_TURNS) {
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const rx = ux * c - uz * sn;
      const rz = ux * sn + uz * c;
      const k = s * Math.max(0.35, c);
      const to = clampToRegion(mapId, x0, z0, x0 + rx * k, z0 + rz * k);
      if (isBlocked(to.x, to.z, mapId, radius)) continue;
      const g = (to.x - x0) * ux + (to.z - z0) * uz;
      if (g > best + 1e-4) {
        best = g;
        bestX = to.x;
        bestZ = to.z;
      }
    }
    pos.x = bestX;
    pos.z = bestZ;
  }
}

/** How high the floor is at (x, z): the casino's raised High-Roller Pit and Velvet Lounge (and the
 *  steps up to them), the Velvet Ring's canvas (only a fighter stands there), the caverns' doline
 *  plateau, its ramp, the lake's sloping shore, the islet, the sandbar and the deck; every other world is flat. Where an avatar's feet go, where a
 *  click lands. */
export function walkY(mapId: MapId, x: number, z: number): number {
  if (mapId === "velvet_casino") return casinoFloorY(x, z);
  if (mapId === "glimmering_caverns") return cavernsFloorY(x, z);
  if (mapId === "boxing_ring") return onRing(x, z) ? RING_FLOOR_Y : 0;
  return 0;
}

/** (x, z) kept on the floor of the region (from, fx, fz) stands in: a step never crosses the void
 *  between two of a world's regions. */
export function clampToRegion(mapId: MapId, fx: number, fz: number, x: number, z: number): { x: number; z: number } {
  const rs = REGIONS[mapId];
  let r = rs.find((q) => inside(q, fx, fz));
  if (!r) {
    // off every floor (a stale position): the nearest region
    let best = Infinity;
    for (const q of rs) {
      const d = Math.hypot(Math.max(q.x0 - fx, 0, fx - q.x1), Math.max(q.z0 - fz, 0, fz - q.z1));
      if (d < best) (best = d), (r = q);
    }
  }
  const q = r!;
  return { x: Math.max(q.x0, Math.min(q.x1, x)), z: Math.max(q.z0, Math.min(q.z1, z)) };
}
