# The Whispering Woods: expansion design

Status: **approved 2026-10-02** with the recommended answers, and **built** (patch 0.7.44). What was
measured, and where the build moved from this plan, is at the foot of this document.

The layout lives in `shared/worlds/forest.ts` (`FOREST_LAYOUT`), the model in
`scripts/blender/build_forest.py`, the trees you fell in `trees.glb`, the checks in
`npm run check-layout`.

## Why expand

The woods are where the middle of the game is played: axes T2 to T5, the river's best fish, the
advanced workbench, the gear's rank 3 and 4, the way down to the caverns. Measured 2026-10-02:

| | The woods today | The campfire, rebuilt | The caverns |
|---|---|---|---|
| Size | 24 x 24 m, flat | 28 x 28 m, 0 to 1.7 m | 45 x 45 m, 0 to 6.5 m |
| Draw calls, whole map in view, one player | 128 | 116 | 79 |
| What stands on it | 26 trees to fell, 25 vista pines, a cabin, a workbench, two keepers, a shrine, the adit | | |
| The river | 14 m of it, in the north-east corner only | the whole east side | a lake and a stream |

- **Crowded:** 51 trees on 576 m2. The canopies cover most of the ground from the camera, so the
  player is seen through dithered leaves most of the time.
- **The river is a corner:** four fishing spots within 9 m of each other; the rest of the map has no
  water.
- **Flat:** the mine adit is a boxed outcrop on the west edge, not a hillside.
- **Each tier's grove is a rectangle** (`zones`) painted on flat ground.

## What must not change

- Every rule, price and count: 26 trees (4 Soft Pine, 11 Silver Birch, 7 Highland Cedar, 3 Autumn
  Maple, 1 Whispering Elderwood), 3 Colossal clearings, 4 fishing spots (the log and the rock seat
  among them), the deer and the rabbits.
- Every id (`tree_<id>`, the props, the seats): saved scenes keep each tree's stage and a standing
  Colossal.
- The two doors: the archway to the campfire (`CAMP_FROM_WOODS`) and the adit to the caverns
  (`WOODS_FROM_CAVERNS`), Old Flint beside it.
- **Income.** The campfire taught this: spreading eight pines 4 m apart cost a T1 woodcutter 8%,
  because the walk between trees is most of the work. Here the simulator's lines are wood T2 to T5
  at 49.1 / 72.7 / 101.3 / 130.5 coins a minute and the river at 25.2 to 100.6. Each grove keeps
  its trees as close together as they stand now, and Bramble and Finley as short a walk from them;
  the simulator is run on the first layout draft, before anything is modelled, and every line must
  stay within 2%.

## Rules the camera sets

1. The camera looks north-west from the south-east. High ground and the tallest trees go north and
   west; the ground steps down toward the south-east, and the river lies low in front.
2. Nothing walked is steeper than 24 degrees over half a metre. What is steeper is a cliff you can
   see, with a collider.
3. A grove is a ring, not a block: its trees stand round a small glade, so whoever fells them is in
   the open on the camera's side of the trunk.

## The plan

**Size: 34 x 34 m** (half 17, from 12): twice the ground. The arrival stays in the south-west, by the
archway.

**Ground: a hillside**, with the campfire's terrain system (one height function, a grid for the
builder, `walkY`; the shared parts of `campLand` moved into a module both maps use). From the river
(-0.3 m) in the south-east up to the mine's ledge (+3.2 m) in the north-west, in broad terraces
joined by slopes and trails.

Depth is progress, as in the caverns: each tier's grove is further in and higher up than the last.

| Zone | Where | Height | What stands there |
|---|---|---|---|
| The Border | south-west | 0 m | the archway, the arrival, the 4 Soft Pines, the path forking east to the post and north up the hill |
| The Birch Grove | west and middle | 0 to 0.8 m | the 11 birches in two loose rings round glades, the deer's trail, a Colossal clearing |
| Bramble's Post | south, middle | 0 m | the cabin, the counter, the advanced workbench, a log deck: a yard with room for a queue, a short walk from every grove |
| The Cedar Ridge | north-east shoulder | 1.2 to 1.8 m | the 7 cedars along a ridge trail above the river, a Colossal clearing, the songbirds |
| The Golden Glen | north | 2.0 to 2.4 m | the 3 maples in a hollow under falling leaves, a Colossal clearing |
| The Elderwood Shrine | the hill's crown, north | 2.8 m | the Whispering Elderwood in its ring of standing stones, seen from the whole map |
| The Mine Ledge | north-west | 3.2 m | the adit cut into a real cliff face, Old Flint and his lantern, a switchback trail up to it |
| The River | the whole east side | -0.3 m | in over a fall below the shrine, a rapids reach (the log and the rock seat), a wide pool at Finley's boulder, out over the south-east edge; the 4 fishing spots along it |

**Trees:** the 25 vista pines move to the north and west rims and thin out toward the camera, so the
groves are seen from above, not through a wall of canopy.

**Water:** the campfire's river shader (shallows to deep, foam at the banks, streaks down the falls,
darker by night), moved to a module both maps use.

**Render cost: at most 110 draw calls with one player** in view of the whole map: the statics fused
by finish as at the campfire (`fuse`), the ground painted in vertex colours with each grove's own
floor blended in (as `biome_color` does today).

**Life and light:** what is there stays (the deer, the rabbits, the wild critters, the songbirds, the
butterflies, the riverbank fireflies). New: golden leaves drifting down in the Glen, shafts of
daylight through the canopy on the ridge, spray at the fall, lantern posts along the trails to the
post and the ledge.

## Order of work

1. The layout and the height function; the simulator run on the draft (every wood and river line
   within 2%); `check-layout` extended (slopes, level footings, each tier further in than the last,
   the walks from the arrival and from each grove to Bramble and Finley).
2. The shared modules: the terrain helpers and the river shader out of the campfire's files.
3. The builder: the heightfield ground, the river, the cliff and the adit, everything stood on the
   ground, the statics fused.
4. The client: the ground under the trees, the keepers and the animals, the click surface, the
   lights.
5. Dressing zone by zone, checked in the browser by day and by night.
6. The full verification, the patch notes.

## What was built, and what moved from this plan

- **Draw calls:** 109 with one player and the whole map in view (128 before); the model itself 15.
- **Heights:** the Mine Ledge stands at 2.8 m (the plan said 3.2), the shrine's crown at 2.5 m, the
  Glen's maples at 2.1 m: two steps' skirts may not meet where their slopes would add past 24
  degrees, and that bounds how fast the hill can rise on a 34 m island.
- **The groves were not rearranged into rings.** The simulator ruled it out: moving the maples 3 m
  and the Elderwood 5.5 m up the hill alone cost a T5 woodcutter 4%. So the whole constellation of
  trees, with Bramble's post, moved as one to the south and west of the bigger island (every walk
  between trees as long as it was), and only the maples (1.5 m) and the Elderwood (2 m) went further
  up. The order by tier from the arrival was already the plan's.
- **Income:** wood T1 to T3 and the river unchanged, T4 1% under, T5 0.5% over the record. The T5
  figure moves by 2 to 3% with a single small collider on a walk between groves (the simulator's
  woodcutter chooses trees by walking time), so the dressing keeps off those walks.
- **The river** leaves over the south edge (the plan said the south-east); its head pool and the
  rock seat sit at the hill's foot in the north-east.
- **Not built:** shafts of daylight through the canopy, and leaves drifting down in the Glen (its
  fallen leaves lie on the ground as before).

## Decisions (answered)

1. **Size:** 34 m (recommended), a smaller step to 30 m, or keep 24 m and only thin the canopy.
2. **Ground:** a walked hillside up to 3.2 m (recommended), gentler (up to 1.5 m, like the
   campfire), or flat.
3. **The groves by tier, further in and higher up** (recommended), or the groves where they are
   today, only spread out.
4. **The river down the whole east side** with a fall and a wide pool (recommended), or kept in its
   north-east corner.
5. **Counts:** keep the trees and the fishing spots as they are (recommended: no economy change),
   or add some and rebalance.
