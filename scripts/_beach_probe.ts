import { BEACH_LAYOUT as L, BAR, MANGO, FIREPIT, LOUNGERS, PALMS, ROCKS, SHACK, BOAT, PIER, BEACH_ARRIVAL, BALL_COURT, HAMMOCK_PALMS, beachLand, beachBlocked, shoreD, onPierAt, PIER_LENGTH, BEACH_GRID, BEACH_SEATS, BEACH_OBSTACLES } from "../shared/worlds/beach";
import { isBlocked } from "../shared/collision";
import { findPath } from "../shared/pathfinding";
const f = (p: {x:number;z:number}) => `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) y=${beachLand(p.x,p.z).toFixed(2)}`;
console.log("arrival", f(BEACH_ARRIVAL), "bar", f(BAR), "mango", f(MANGO), "fire", f(FIREPIT), "court", f(BALL_COURT), "shack", f(SHACK), "boat", f(BOAT));
console.log("pier start", f(onPierAt(0,0)), "end", f(onPierAt(PIER_LENGTH,0)), "len", PIER_LENGTH.toFixed(1));
const all = [...PALMS, ...ROCKS, ...LOUNGERS, ...HAMMOCK_PALMS, BAR, SHACK];
console.log("out of bounds:", all.filter((p) => Math.max(Math.abs(p.x), Math.abs(p.z)) > 17.2).map(f));
// steepest slope over 0.5 m on land that is walked
let worst = 0, at = "";
let sea = 0, deep = 0, n = 0;
for (let x = -17.4; x <= 17.4; x += 0.25) for (let z = -17.4; z <= 17.4; z += 0.25) {
  n++; const d = shoreD(x, z); if (d < 0) sea++; if (beachBlocked(x, z)) deep++;
  if (beachBlocked(x, z)) continue;
  for (const [dx, dz] of [[0.5,0],[0,0.5]]) { const s = Math.abs(beachLand(x+dx,z+dz)-beachLand(x,z))/0.5; if (s > worst) { worst = s; at = `(${x},${z})`; } }
}
console.log("sea share", (sea/n).toFixed(2), "blocked share", (deep/n).toFixed(2), "steepest", (Math.atan(worst)*180/Math.PI).toFixed(1), "deg at", at);
const walk = (to: {x:number;z:number}) => { const p = findPath("sunset_beach", BEACH_ARRIVAL, to); if (!p) return "NO PATH"; let d = 0; let a = BEACH_ARRIVAL as any; for (const q of p) { d += Math.hypot(q.x-a.x,q.z-a.z); a = q; } return (d/3).toFixed(1)+" s"; };
for (const [name, p] of [["mango front", {x: BAR.stools[2].approach.x, z: BAR.stools[2].approach.z}], ["station", BAR.stations[1]], ["fire log", FIREPIT.logs[0].approach], ["court", BALL_COURT], ["pier end", onPierAt(PIER_LENGTH-0.6,0)], ["headland", {x: 11.5, z: -13.5}], ["lounger east", LOUNGERS[4].approach]] as const) console.log(name, f(p), isBlocked(p.x,p.z,"sunset_beach") ? "BLOCKED" : "open", walk(p));
console.log("seats", BEACH_SEATS.length, "obstacles", BEACH_OBSTACLES.length, "grid", BEACH_GRID.n);
