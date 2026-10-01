// `npm run forest-terrain`: the Whispering Woods' ground, for the Blender builder.
//
// shared/worlds/forest.ts samples the ground on a grid (FOREST_GRID: the drawn ground with the river's
// channel, and the land under things without it); the builder (scripts/blender/build_forest.py)
// models the ground from that very grid and stands everything on it, so it reads it from the file this
// writes: scripts/blender/data/forest_terrain.json. `npm run check-layout` fails while it is stale.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { forestTerrainData } from "../shared/worlds/forest";

export const FOREST_TERRAIN_PATH = join(__dirname, "blender", "data", "forest_terrain.json");

/** The file's text for the current layout (the validator compares it with what is on disk). */
export function forestTerrainText(): string {
  return JSON.stringify(forestTerrainData()) + "\n";
}

if (require.main === module) {
  mkdirSync(dirname(FOREST_TERRAIN_PATH), { recursive: true });
  writeFileSync(FOREST_TERRAIN_PATH, forestTerrainText());
  const t = forestTerrainData();
  console.log(`forest terrain: ${t.n + 1} x ${t.n + 1} heights every ${t.cell.toFixed(3)} m, ${Math.min(...t.ground).toFixed(2)} to ${Math.max(...t.ground).toFixed(2)} m -> ${FOREST_TERRAIN_PATH}`);
}
