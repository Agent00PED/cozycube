// `npm run beach-terrain`: the Sunset Beach' ground, for the Blender builder.
//
// shared/worlds/beach.ts samples the ground on a grid (BEACH_GRID: the sand, the dunes and the seabed
// channel, and the land under things without it); the builder (scripts/blender/build_beach.py)
// models the ground from that very grid and stands everything on it, so it reads it from the file this
// writes: scripts/blender/data/beach_terrain.json. `npm run check-layout` fails while it is stale.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { beachTerrainData } from "../shared/worlds/beach";

export const BEACH_TERRAIN_PATH = join(__dirname, "blender", "data", "beach_terrain.json");

/** The file's text for the current layout (the validator compares it with what is on disk). */
export function beachTerrainText(): string {
  return JSON.stringify(beachTerrainData()) + "\n";
}

if (require.main === module) {
  mkdirSync(dirname(BEACH_TERRAIN_PATH), { recursive: true });
  writeFileSync(BEACH_TERRAIN_PATH, beachTerrainText());
  const t = beachTerrainData();
  console.log(`beach terrain: ${t.n + 1} x ${t.n + 1} heights every ${t.cell.toFixed(3)} m, ${Math.min(...t.ground).toFixed(2)} to ${Math.max(...t.ground).toFixed(2)} m -> ${BEACH_TERRAIN_PATH}`);
}
