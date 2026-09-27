import { MAP_HALF, MAP_IDS, type MapId } from "./types";
import { LOFT_OBSTACLES, LOFT_SPAWNS, NAV_LIMIT, loungeFloorY } from "./worlds/lounge";
import { CAMP_OBSTACLES, CAMP_SPAWNS } from "./worlds/campfire";
import { CASINO_OBSTACLES, CASINO_REGIONS, CASINO_SPAWNS, casinoFloorY } from "./worlds/casino";
import { VIP_ARRIVAL, VIP_OBSTACLES, VIP_REGION } from "./worlds/casino_vip";

// Where you can stand. The lounge, the campfire and the casino are authored in shared/worlds/
// (lounge.ts, campfire.ts, casino.ts); every other world is still an open square floor with one spawn in the middle
// until it is rebuilt.

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

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
  boxing_ring: open(),
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
  boxing_ring: centre(),
  japanese_onsen: centre(),
  retro_arcade: centre(),
  gaming_cafe: centre(),
};

/** True when a disc of `radius` at (x, z) is off the floor or overlaps furniture. */
export function isBlocked(x: number, z: number, mapId: MapId, radius = 0.3): boolean {
  if (!REGIONS[mapId].some((r) => inside(r, x, z))) return true;
  for (const b of MAP_OBSTACLES[mapId]) {
    if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) return true;
  }
  return false;
}

/** How high the floor is at (x, z): the casino's raised High-Roller Pit and Velvet Lounge (and the
 *  steps up to them), the lounge's Sunken Living Nook a step down; every other world is flat.
 *  Where an avatar's feet go, where a click lands. */
export function walkY(mapId: MapId, x: number, z: number): number {
  return mapId === "velvet_casino" ? casinoFloorY(x, z) : mapId === "cozy_lounge" ? loungeFloorY(x, z) : 0;
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
