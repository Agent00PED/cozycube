import { ORE_NODES, type OreNode } from "@shared/worlds/caverns";

// The Glimmering Caverns' nodes as drawn: each one's turn about the vertical (a wall-mounted rock
// faces out of its wall; a free-standing one its own way, the same on every client). The rocks
// (CavernsWorld.tsx) and prospecting's proxy and tells (ProspectingView.tsx) both place by it.

function nodeYaw(n: OreNode): number {
  if (n.face) return Math.atan2(n.face.x, n.face.z);
  let h = 0;
  for (const c of n.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 628) / 100 - Math.PI;
}
export const NODE_YAW = new Map(ORE_NODES.map((n) => [n.id, nodeYaw(n)]));
