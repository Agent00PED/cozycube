// Mechanical level-design check: every spawn point and every approach point must be reachable
// (outside every collision box, inside the world). Run with: npx tsx scripts/checklayout.ts
import { MAP_OBSTACLES, MAP_SPAWN_POINTS, isBlocked } from "../shared/collision";
import { APPROACH_POINTS, MAP_CHAIRS, MAP_TOGGLEABLES } from "../shared/props";
import { isWalkUpProp, type MapId } from "../shared/types";

const maps = Object.keys(MAP_OBSTACLES) as MapId[];
let bad = 0;
const fail = (what: string, x: number, z: number) => {
  bad++;
  console.log(`  BLOCKED  ${what}  (${x.toFixed(2)}, ${z.toFixed(2)})`);
};

for (const mapId of maps) {
  console.log(`${mapId}: ${MAP_OBSTACLES[mapId].length} obstacles, ${MAP_CHAIRS[mapId].length} seats`);
  for (const spawn of MAP_SPAWN_POINTS[mapId]) {
    if (isBlocked(spawn.x, spawn.z, mapId)) fail("spawn", spawn.x, spawn.z);
  }
  for (const chair of MAP_CHAIRS[mapId]) {
    const a = APPROACH_POINTS[chair.propId];
    if (!a) {
      console.log(`  NO APPROACH POINT  ${chair.propId}`);
      bad++;
      continue;
    }
    if (isBlocked(a.x, a.z, mapId)) fail(`approach ${chair.propId}`, a.x, a.z);
  }
  for (const prop of MAP_TOGGLEABLES[mapId]) {
    if (!isWalkUpProp(prop.kind)) continue;
    const a = APPROACH_POINTS[prop.propId];
    if (!a) {
      console.log(`  NO APPROACH POINT  ${prop.propId}`);
      bad++;
      continue;
    }
    if (isBlocked(a.x, a.z, mapId)) fail(`approach ${prop.propId}`, a.x, a.z);
  }
}

console.log(bad === 0 ? "LAYOUT OK" : `LAYOUT FAILURES: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
