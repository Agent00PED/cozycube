// `npm run campfire-terrain`: the Starlight Campfire's ground, for the Blender builder.
//
// shared/worlds/campfire.ts samples the ground on a grid (CAMP_GRID: the drawn ground with the river's
// channel, and the land under things without it); the builder (scripts/blender/build_campfire.py)
// models the ground from that very grid and stands everything on it, so it reads it from the file this
// writes: scripts/blender/data/campfire_terrain.json. `npm run check-layout` fails while it is stale.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { campTerrainData } from "../shared/worlds/campfire";

export const CAMPFIRE_TERRAIN_PATH = join(__dirname, "blender", "data", "campfire_terrain.json");

/** The file's text for the current layout (the validator compares it with what is on disk). */
export function campfireTerrainText(): string {
  return JSON.stringify(campTerrainData()) + "\n";
}

if (require.main === module) {
  mkdirSync(dirname(CAMPFIRE_TERRAIN_PATH), { recursive: true });
  writeFileSync(CAMPFIRE_TERRAIN_PATH, campfireTerrainText());
  const t = campTerrainData();
  console.log(`campfire terrain: ${t.n + 1} x ${t.n + 1} heights every ${t.cell.toFixed(3)} m, ${Math.min(...t.ground).toFixed(2)} to ${Math.max(...t.ground).toFixed(2)} m -> ${CAMPFIRE_TERRAIN_PATH}`);
}
