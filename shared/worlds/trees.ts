import type { MapId } from "../types";
import { TITAN, type TreeKind } from "../chop";
import { CAMP_TREES } from "./campfire";
import { FOREST_TREES, TITAN_SPOTS, TREE_REACH, titanApproach } from "./forest";

// Every tree you can fell, on both maps: the campfire's Soft Pines round its clearing, the Whispering
// Woods' twenty-six, and the three clearings where a Colossal Titan can sprout (a world event: only one
// at a time, and only while it stands). Each by its node id (unique across maps; its prop is
// `tree_<id>`), with the map it stands on, its kind, and where you fell it from.

export interface FellTree {
  id: string;
  map: MapId;
  kind: TreeKind;
  x: number;
  z: number;
  approachX: number;
  approachZ: number;
  /** A Colossal Titan's clearing (it stands there only during its event). */
  titan: boolean;
}

export const FELL_TREES: FellTree[] = [
  ...CAMP_TREES.map((t) => ({ id: t.id, map: "campfire_night" as MapId, kind: t.kind as TreeKind, x: t.x, z: t.z, approachX: t.approachX, approachZ: t.approachZ, titan: false })),
  ...FOREST_TREES.map((t) => ({ id: t.id, map: "whispering_woods" as MapId, kind: t.kind, x: t.x, z: t.z, approachX: t.approachX, approachZ: t.approachZ, titan: false })),
  ...TITAN_SPOTS.map((p, i) => {
    const a = titanApproach(p);
    return { id: `titan_${i + 1}`, map: "whispering_woods" as MapId, kind: TITAN.kind, x: p.x, z: p.z, approachX: a.x, approachZ: a.z, titan: true };
  }),
];
export const FELL_TREE_AT = new Map(FELL_TREES.map((t) => [t.id, t]));
/** How close you stand to fell a tree (a Titan's trunk is wider). */
export const fellReach = (t: FellTree) => (t.titan ? TREE_REACH + 1.0 : TREE_REACH);
/** The tree node a prop id (`tree_<id>`) or a node id names. */
export const fellTreeOf = (id: unknown) => (typeof id === "string" ? FELL_TREE_AT.get(id.replace(/^tree_/, "")) : undefined);
