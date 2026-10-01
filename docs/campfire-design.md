# The Starlight Campfire: rebuild design

Status: **approved 2026-10-02** with the recommended answers to the four decisions (28 m, walkable
gentle hills, the telescope on the knoll's top, the counts kept). **The structure is built** (patch
0.7.42: steps 1 to 3 of the order of work, and step 5's checks): the layout, the height function, the
builder, the water, the client. **The dressing pass is done** (patch 0.7.43: step 4, and the lobby's
backdrop picture). What was measured is at the foot of this document.

The layout lives in `shared/worlds/campfire.ts` (`CAMPFIRE_LAYOUT`), the model in
`scripts/blender/build_campfire.py`, the checks in `npm run check-layout`.

## Why rebuild

The review of every built map (2026-10-02) measured the campfire as the weakest of the craft maps:

| | Campfire today | Caverns (the bar) |
|---|---|---|
| Size | 21.6 x 21.6 m, flat | 45 x 45 m, 0 to 6.5 m |
| Draw calls (one player) | 217 (273 before round one) | 79 |
| Ground | one flat plane, painted paths | a heightfield, each zone its own ground |
| Water | a flat ribbon along the east edge | depth-read colour, foam, falls, spray |
| Things to do per metre | crowded: two shops, a bench, a gallery, a splitting block, 12 trees, a dock, a firepit | spread by zone |

It is also the first map every new player gathers on, so it sets the first impression of the game.

## What must not change

- Every system, rule and price. The rebuild moves things; it adds no income.
- Every prop id and seat id (saved scenes, `PROP_MAP`, the trees' saved stages `tree_camp_pine_N`,
  `camp_birch_N`), the archway's pairing with the woods (`CAMP_ARCHWAY`, `CAMP_FROM_WOODS`).
- The hearth: the bonfire at (0, 0), its horseshoe of logs, the tripod and Dutch oven, exactly as
  they are. The map grows outward round it.
- The counts that feed the economy: 8 Soft Pines, 4 birches, 3 fishing spots plus the canoe, 4
  forage patches. `npm run economy-sim` must print the same table before and after.

## Rules the camera sets

1. The camera looks north-west from the south-east. Tall things (the knoll, the pine wall, the
   waterfall's rock) go north and west; the ground steps **down toward the south-east**, so every
   bank faces the camera and the river lies low in front.
2. Nothing walkable is steeper than the caverns' rule (24 degrees over half a metre). A rise is a
   visible slope or a visible path, never a soft bank that secretly blocks.
3. The follow camera's edge clamp (`keepInWorld`) already handles a bigger world.

## The plan

**Size: 28 x 28 m** (half 14, from 10.8): 68% more ground, so each activity gets its own place and
the walks between them stay under 10 s.

**Ground: gentle terrain, one heightfield** (the caverns' system reused: a height function in the
layout, a walk grid, `walkY`, the builder reading the same data). Heights from the river (-0.3 m) to
the knoll's top (+1.8 m).

| Zone | Where | Height | What stands there |
|---|---|---|---|
| The Hearth | centre | 0 m | unchanged: bonfire, logs, tripod, the signpost |
| Tipi Knoll | north-west | +1.0 to +1.8 m | the tipi on a shoulder of the hill, the string lights, the guitar case, the fireflies; the telescope on the top ("the Overlook", moved up from the south fence) |
| Traders' Row | north | +0.4 m | the archway to the woods, Buster and his board, the workbench, the woodpile, the camper van and splitting block, on a terrace along the pine wall |
| The River | east and south-east | -0.3 m | a waterfall off a rock step in the north-east (today's `cascade`, made real), a plunge pool, the river running south and widening into a pond at the dock; Barnaby, the dock, the canoe, the ducks; reeds and stepping stones |
| South Meadow | south and south-west | 0 to +0.3 m | the slingshot gallery along the fence, the picnic table, the birch grove, wildflowers, the raccoon |
| The Pine Ring | between zones | follows the ground | the eight Soft Pines spaced 4 m or more apart, each with open ground on the camera's side |

**Water:** the caverns' water (depth read off the ground: shallow green to deep blue, foam at every
shore, white streaks down the fall, spray and rings at its foot), on the camp's day and night.

**Render cost: at most 110 draw calls with one player.** The map's static parts fused by finish with
vertex colours (the casino's and the caverns' way) instead of a material a colour; fauna and
undergrowth instanced; the model under 1.5 MB packed.

**Light:** the bonfire's warm pool and the lanterns' glow kept; the knoll and the pine wall catching
the moon so the island has a silhouette at night.

## Order of work

1. The layout and the height function; `check-layout` extended (every spot open and reachable, every
   slope within the rule, the walks' times).
2. The builder: ground, river, falls, the statics fused by finish.
3. The client: `walkY`, the water, the lights, the wildlife's paths on the new ground.
4. Dressing zone by zone, checked in the browser by day and by night.
5. The economy simulator and the full verification; patch notes.

## What was built, and what moved from this plan

- **Draw calls:** about 115 with one player (217 before; the model itself 48). The plan's 110 is not
  quite met: an avatar alone is some 58 of them, on every map (its own task).
- **The model:** 2.4 MB packed (the plan said under 1.5 MB): the ground is drawn at 0.175 m for its
  paint, 51,000 triangles of it.
- **The Pine Ring:** the plan spaced the eight Soft Pines 4 m or more apart. Spread like that a T1
  woodcutter earned 8% less (the walks between trees are most of the work), so they stand where they
  did round the clearing, and Buster a little nearer the path. The simulator's table: the campfire's
  wood within 2% of the record at every tier, its fishing unchanged.
- **The ground needs no walk mask:** nothing is steeper than 24 degrees, so the whole island is
  walked and only the old boxes stop anyone.
- **The river leaves the island** over its south edge in a sheet (the plan had a closed pond).
- **The dressing** (patch 0.7.43): lantern posts, crates, barrels, fallen logs and stumps with
  colliders; grass, wildflowers, pebbles, trail steps, leaves, river stones and the far bank by rule,
  with none; spray at the falls. The model is 2.9 MB packed and 193,000 triangles; the draw calls are
  unchanged but for the spray's one.

## Decisions (answered)

1. **Size:** 28 m (recommended), a smaller step to 25 m, or keep 21.6 m and only re-dress.
2. **Terrain:** walkable gentle hills (recommended; more work, reuses the caverns' walking), or a
   flat walkable ground with raised scenery only round the rim.
3. **The telescope on the knoll's top** (recommended), or left by the south fence.
4. **Counts:** keep trees and fishing spots as they are (recommended: no economy change), or add
   some and rebalance.
