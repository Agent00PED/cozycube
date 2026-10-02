import type { MapId } from "../types";
import { TITAN, type TreeKind } from "../chop";
import { CAMP_TREES, CAMP_WILD_TREES, campLand } from "./campfire";
import { FOREST_TREES, FOREST_WILD_TREES, TITAN_SPOTS, TREE_REACH, forestLand, titanApproach } from "./forest";

// Every tree you can fell, on both maps: the campfire's Soft Pines round its clearing, the Whispering
// Woods' groves, the wild trees that stand everywhere else on both (the rims' pines, the Old Growth,
// the ones between the groves: Soft Pines and a few Highland Cedars), and the three clearings where
// a Colossal Titan can sprout (a world event: only one at a time, and only while it stands). Each by
// its node id (unique across maps; its prop is
// `tree_<id>`), with the map it stands on, its kind, and where you fell it from.

export interface FellTree {
  id: string;
  map: MapId;
  kind: TreeKind;
  x: number;
  z: number;
  /** The ground it stands on (the campfire's knoll and swells, the woods' hillside). */
  y: number;
  approachX: number;
  approachZ: number;
  /** A Colossal Titan's clearing (it stands there only during its event). */
  titan: boolean;
  /** A wild tree's own look when grown, where it is not its kind's (trees.glb `Tree_<look>_mature`). */
  look?: "pine" | "spruce";
  /** A wild tree's size against its look's (the layout's): it is drawn at that, a little more or
   *  less by the size the room rolled (`drawnSize`). A grove's tree is drawn at the rolled size. */
  size?: number;
  /** Which of the conifers' three greens a wild tree wears (0 the pine's own, 1 blue, 2 olive). */
  tone?: number;
}

/** The size a tree is drawn at: the room's roll (0.85-1.35x) for a grove's tree, and for a wild one
 *  its own size, a little more or less by that roll (half as much: the layout sized it to its place). */
export const drawnSize = (t: FellTree, rolled: number) => (t.size ? t.size * (1 + (rolled - 1.1) * 0.5) : rolled);

export const FELL_TREES: FellTree[] = [
  ...CAMP_TREES.map((t) => ({ id: t.id, map: "campfire_night" as MapId, kind: t.kind as TreeKind, x: t.x, z: t.z, y: Math.round(campLand(t.x, t.z) * 1000) / 1000, approachX: t.approachX, approachZ: t.approachZ, titan: false })),
  ...CAMP_WILD_TREES.map((t) => ({ id: t.id, map: "campfire_night" as MapId, kind: t.kind as TreeKind, x: t.x, z: t.z, y: Math.round(campLand(t.x, t.z) * 1000) / 1000, approachX: t.approachX, approachZ: t.approachZ, titan: false, look: t.look, size: t.size, tone: t.tone })),
  ...FOREST_TREES.map((t) => ({ id: t.id, map: "whispering_woods" as MapId, kind: t.kind, x: t.x, z: t.z, y: Math.round(forestLand(t.x, t.z) * 1000) / 1000, approachX: t.approachX, approachZ: t.approachZ, titan: false })),
  ...FOREST_WILD_TREES.map((t) => ({ id: t.id, map: "whispering_woods" as MapId, kind: t.kind, x: t.x, z: t.z, y: Math.round(forestLand(t.x, t.z) * 1000) / 1000, approachX: t.approachX, approachZ: t.approachZ, titan: false, look: t.look, size: t.size, tone: t.tone })),
  ...TITAN_SPOTS.map((p, i) => {
    const a = titanApproach(p);
    return { id: `titan_${i + 1}`, map: "whispering_woods" as MapId, kind: TITAN.kind, x: p.x, z: p.z, y: Math.round(forestLand(p.x, p.z) * 1000) / 1000, approachX: a.x, approachZ: a.z, titan: true };
  }),
];
export const FELL_TREE_AT = new Map(FELL_TREES.map((t) => [t.id, t]));
/** How close you stand to fell a tree (a Titan's trunk is wider). */
export const fellReach = (t: FellTree) => (t.titan ? TREE_REACH + 1.0 : TREE_REACH);
/** The tree node a prop id (`tree_<id>`) or a node id names. */
export const fellTreeOf = (id: unknown) => (typeof id === "string" ? FELL_TREE_AT.get(id.replace(/^tree_/, "")) : undefined);
