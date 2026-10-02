# The campfire and the woods: the nature pass

Status: **built** (patch 0.7.50), on top of the fill plan (docs/maps-fill-plan.md). The brief: the
two maps "still feel odd, not natural"; analyse them, change whatever it takes.

## What was wrong (seen from the play camera)

| # | What the eye caught | Why it reads as artificial |
|---|---|---|
| 1 | **Nothing cast a shadow.** The renderer draws none (`shadows={false}`), and nothing was painted in their place. | Trees, stalls, rocks and players sat on the grass like pieces on a board: no contact, no depth. |
| 2 | **Every conifer was the same stack of three smooth cones**, the same dark green, with no trunk showing. | Real trees differ in girth, lean, height and tone; a row of identical shapes is a pattern, and the eye finds patterns at once. |
| 3 | **The fire's clearing was one flat brown disc** with trails as wide as roads leading out of it. | Bare ground is worn by feet: it is narrow, ragged, patchy, and yellows the grass at its margin before it goes bare. |
| 4 | **The grass was one green** with a faint mottle. | Open lawns bleach in the sun; the ground under conifers is brown with needles; shade is darker and cooler. |
| 5 | **The islands were thin square slabs** with ruled edges. | A straight edge 28 m long is the strongest man-made line on the screen. |
| 6 | **Stones along the river stood at even spacing** on both banks, all one size. | A necklace. Stones gather where the current drops them and leave clear bank between. |
| 7 | **The woods' rim pines stood in a row** 2.7 m apart, all nearly one size. | A hedge, not a forest's edge. |
| 8 | **The brook was a straight pale ribbon.** | Water finds its way round things; it does not run ruled. |
| 9 | **No understory, nothing dead.** | A wood has saplings at the feet of its trees and standing dead trunks among the living. |

## What the references say

- Cluster boldly and leave other ground bare; never scatter evenly. Saplings and shrubs belong at
  the feet of bigger plants, which also hides where trunks meet the ground. Dead trees and fallen
  logs are a large part of any real forest. Forest floors carry ferns and litter, not lawn.
  ([Art Tips for Building Forests, Eastshade Studios](https://www.eastshade.com/art-tips-for-building-forests/))
- Water curves round obstacles; paths follow the land and blur at their edges where they are little
  used; straight lines read as built.
  ([The Level Design Book: Landscape](https://book.leveldesignbook.com/process/blockout/massing/landscape))

## What was done

All of it is in the two Blender builders and one shared module, `scripts/blender/nature_kit.py`.
No collider on any walk moved, so income is unchanged to the decimal on both maps.

1. **Shade and contact shadows, painted into the ground** (`nature_kit.Shade`, each builder's
   `make_shade`, read by `ground_color`): a soft dark pool under every crown, thrown a little to the
   south-east (the light stands in the north-west), and a tight shadow at the foot of everything
   that stands (the tipi, the van, the stalls, the cabin, rocks, shrubs, posts, logs, benches).
   Shade is cooler as well as darker. The fellable trees get it too: a felled tree leaves a stump
   in a dim, littered patch, which is what a felled tree leaves.
2. **A soft shadow under every player** on these two maps (Avatar's `FOOT_SHADOW`, standing only).
3. **Litter:** brown needles under the conifers, pale leaves under the birches, blended in by the
   same shade field.
4. **A new conifer** (`nature_kit.conifer`): a tapered trunk that shows, four or five tiers of
   boughs with ragged drooping tips, faceted, each tree its own girth, height, lean and turn, the
   low boughs darker than the top. Three kinds: pine, the slimmer spruce (one in four of the
   standing trees), cedar. The trees you fell use the same shapes (trees.glb), so the two no longer
   look like different species. Needles are a step lighter and warmer than before.
5. **Understory:** saplings in ones and twos at the feet of the standing pines (walked through),
   and dead standing trees (`snag`) at the rims (two at the campfire, four in the woods).
6. **Birches made lopsided**, so no two turns of one look alike.
7. **Worn ground, not roads:** the clearing is worn round the fire and its seats (three quarters of
   its old radius, ragged), the trails are 60% as wide, their edges wander at three scales, tufts
   hold on in their middles, and the grass yellows where the wear begins.
8. **Drifts of dry grass** over the open lawns.
9. **Rock at the rim** (`build_rim`): ledges and outcrops in groups shoulder out of the islands'
   sides with blocks tumbled under them and moss on top, wider on the two faces the camera sees.
   The square outline is gone; where anyone walks is exactly as it was.
10. **The river's stones in groups** of every size with clear bank between.
11. **The woods' rim pines** re-placed off the line, in sizes from 0.75 to 1.3, with gaps.
12. **The brook** narrower and winding between its banks; it still only runs downhill.

## What it costs

| | Campfire | Woods |
|---|---|---|
| Draw calls (one player, whole map) | about 118 (unchanged) | about 110 (unchanged) |
| Model, packed | 3.4 to 3.9 MB | 3.8 to 4.6 MB |
| Income | unchanged | unchanged |

The size is the faceted conifers (a flat-shaded face keeps its own three vertices).

## Round two: the campfire's shape (patch 0.7.51)

The campfire was evenly full: eight pines in a ring round the fire, a prop every few metres, no part
of it denser or emptier than another. Now it has three parts.

- **The wood** on the west and north-west: six of the eight fellable pines in two stands, the
  standing pines behind them, a dark needle-strewn floor, ferns in drifts and saplings between the
  trunks. It is the backdrop the camera looks toward.
- **The meadow** from the fire east to the dock and the river: open grass and flowers, nothing
  standing but the Hammock Grove.
- **The fire** between them, its clearing the one worn place.
- Two pines stay by the willow at the River's End. With all eight in the wood a starter earned 6%
  more (every tree was nearer Buster); the simulator picked the layout that holds income: T1 30.3
  against 30.7, the other tiers within 0.5%.
- **Removed:** two barrels, two lantern posts, a stump, the cairn, the smoker.
- **The trails** are one worn line again: the first pass traded ruled roads for blotches.

## Round three: daylight and relief (patch 0.7.52)

- **The day's light had no direction.** The fill was 0.78 and the key 0.62, so a face in the light
  and a face out of it were nearly the same. Now the fill is 0.56 in a cool sky tint and the key 0.98
  in a warm one: trees, boulders and roofs have a lit side and a shaded side. Night is unchanged.
- **The painted shade was thrown the wrong way** (to the south-east; the key light stands in the
  west-south-west). It now lies to the east-north-east of what casts it, as the key would throw it.
- **Relief:** five low hummocks on the campfire's lawns and six in the woods' flats (0.2 m high),
  kept clear of everything built. With the stronger key they catch the light.

## Round four: streams, not falls (patch 0.7.53)

The owner's call after seeing the maps, and a correction to this document: several of the things
added to make the maps "natural" were clutter of their own.

- **The rock ledges round the rims are gone.** The islands' sides are plain again.
- **Nothing lies across a trail:** the log steps are gone from both maps.
- **The woods' brook is gone**, with its spring, its stepping stones and its bridge.
- **No waterfalls:** the fall and rock step at each river's head and the sheet over each island's
  edge are gone. Each river is a stream that comes in over the north edge and leaves over the south.

## Round five: fewer things (patch 0.7.54)

- **The campfire's south side** had a gallery, a swing, three garden beds, a scarecrow, a picnic table
  and the fence's lights within a few metres. The beds, the scarecrow and the watering can are gone;
  so are the drying rack by the hammocks, the last stump, the lantern post north of the fire and four
  shrubs.
- **The woods** had seven lantern posts along their trails: now four (two on the first stretch from
  the archway, one at each keeper). The fish signs at the fishing spots are gone.
- The two trail posts stay because the simulator's woodcutter walks round them: without them the
  woods' T4 and T5 earn 2% and 1.4% less. Income is exactly as on record.

## Round six: traces, pines, a wheel (patch 0.7.55)

The owner's list after seeing round five, and what was done.

- **Trails, three times.** They were a band of earth with a ruled rim. The first answer faded the
  wear out over a metre and a half: a smear. The second was a bare tread with a ragged, feathered
  edge: still a line, and untidy. The owner's words settled it: "like a path people walk back and
  forth on all the time", its edge smooth into the grass beside it, and its course not random.
  So: an even tread, ONE smooth ease into the grass over three quarters of a metre, a lighter dry
  earth close to the grass in value, no noise in the shape at all. And the courses were redrawn so
  every trail leaves another trail and arrives at a place people use: at the campfire a lane along
  Traders' Row was added and the stray worn patches removed; in the woods two dead-end spurs became
  one loop through the birches and the maples to the shrine's gate, and the trail to Finley now
  starts on the spine. Both maps.
- **The campfire:** the stone steps on the north trail are gone; the two picnic blankets and their
  basket are gone; every birch is gone (four fellable, five ornamental). The campfire is the Soft
  Pine's map: T1 to fell, everything else to look at.
- **The woods' layout, twice.** The Elderwood was the size of a birch and stood behind a pine. The
  first answer (tight clumps round a big open glade) left the middle empty and the groves crowded.
  The second keeps each grove where it is but spaces its trees 2.7 to 4 m apart, woods the middle,
  and fills what was open with ornamental pines, shrubs, boulders and more undergrowth. The
  Elderwood stands on its own mound at the top of the hill with a clear forecourt before it.
- **Size says rank.** Soft Pine 3.0 m, birch 4.0, cedar 5.1, maple 4.7 and broad, the Elderwood 8.3 m
  with an 8.5 m crown: the tallest thing in the wood by a third. Ornamental trees are dark conifers
  only, so a leafy tree is always one you can fell.
- **The cave is hidden.** No trail, no row of stones pointing at it; three spruces between it and
  the camera (seven was a wall). You find it by walking round behind them, or by Old Flint's lantern through the
  trunks at night.

- **Two things seen on the way:** each river ended in a dark notch at the island's edge (now a clean
  cut face of water), and the maples' crowns were seven big blocks (now sixteen small clumps, gold
  on top, orange in the middle, a red bough low down).

- **And then no trails at all.** After the third version the owner asked whether a wood should have
  drawn trails in the first place. It should not: both maps now paint none. The campfire keeps the
  worn circle round its fire and a soft worn patch where people stand (the stalls, the dock, the
  tipi); the woods keep only the arrival, the keepers, the fishing spots and the shrine's gate.

- **And no worn spots either.** The patches left at the stalls, the dock and the shrine's gate read
  as stains. They are gone; only the ground round the campfire's fire is worn, wide and dark and
  fading out over more than a metre, with the log seats lying on it.

## Not done, and worth doing next

- **The lit clearing by night:** the bonfire's light could flicker over the painted shade.
- **Bolder relief:** the hummocks are gentle; banks and exposed rock on the lawns would do more.
- **The fellable birches and maples** are still one model each, turned and sized per tree.
- **An organic coastline:** the islands' walkable outline is still a rounded square under the rock.
