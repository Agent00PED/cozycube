import { MAP_HALF, MAP_IDS, type MapId } from "./types";
import { LOFT_OBSTACLES, LOFT_SPAWNS, NAV_LIMIT } from "./worlds/lounge";
import { CAMP_OBSTACLES, CAMP_SPAWNS } from "./worlds/campfire";
import { CASINO_OBSTACLES, CASINO_SPAWNS, casinoFloorY } from "./worlds/casino";

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

/** The furthest from the centre an avatar's origin may be, on either axis. */
export function worldLimit(mapId: MapId): number {
  return mapId === "cozy_lounge" ? NAV_LIMIT : MAP_HALF[mapId] - 0.6;
}
/** The pathfinding grid is sized to the largest map. */
export const GRID_LIMIT = Math.max(...MAP_IDS.map(worldLimit));

const open = () => [] as AABB[];
export const MAP_OBSTACLES: Record<MapId, AABB[]> = {
  cozy_lounge: LOFT_OBSTACLES,
  campfire_night: CAMP_OBSTACLES,
  sunset_beach: open(),
  velvet_casino: CASINO_OBSTACLES,
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
  boxing_ring: centre(),
  japanese_onsen: centre(),
  retro_arcade: centre(),
  gaming_cafe: centre(),
};

/** True when a disc of `radius` at (x, z) is off the floor or overlaps furniture. */
export function isBlocked(x: number, z: number, mapId: MapId, radius = 0.3): boolean {
  const limit = worldLimit(mapId);
  if (Math.abs(x) > limit || Math.abs(z) > limit) return true;
  for (const b of MAP_OBSTACLES[mapId]) {
    if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) return true;
  }
  return false;
}

/** How high the floor is at (x, z): the casino's raised High-Roller Pit and Velvet Lounge (and the
 *  steps up to them); every other world is flat. Where an avatar's feet go, where a click lands. */
export function walkY(mapId: MapId, x: number, z: number): number {
  return mapId === "velvet_casino" ? casinoFloorY(x, z) : 0;
}

export function clampToWorld(v: number, mapId: MapId = "cozy_lounge"): number {
  const limit = worldLimit(mapId);
  return Math.max(-limit, Math.min(limit, v));
}
