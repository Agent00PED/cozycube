# The Glimmering Caverns: design

The spec every change to the caverns map is checked against. The layout lives in
`shared/worlds/caverns.ts` (`CAVERNS_LAYOUT`), the model in `scripts/blender/build_caverns.py`, the
checks in `npm run check-layout`.

## The brief

- **Reference: Hang Son Doong** (Vietnam): collapsed dolines letting sunlight onto an underground
  jungle, an underground river, the 70-80 m Hand of Dog stalagmite, the 90 m Great Wall calcite wall,
  rimstone pools with cave pearls, the Passchendaele mud passage, clouds forming inside.
- **Played as a grinding game**: one zone per ore, each with its own ground, rock, plants, animals and
  light, so going deeper feels like progress.
- **A large body of water** inside the cave.
- **Keep the forge corner** (the Basalt Crucible Forge's alcove, the anvil, the flagstones) exactly as
  built. Everything else was rebuilt.
- **Style**: the forge's level of detail: chunky, cozy low-poly, readable props, not photo-real.

Decisions (2026-09-30): rebuild the map's content but keep the game's systems, NPCs and pipeline; a
lake plus a decorative river (fishing stays at the lake); an open cave (the pickaxe tier only limits
what you can mine); Gus's winch lift from the rift back up to the basecamp (up only).

## Rules the camera sets

1. The camera always looks north-west from the south-east (orthographic, 34 degrees, 3.5-16 m).
   Tall things (the walls, the doline's broken rim, big flowstone) go on the north and west only. The
   ground steps **down toward the south-east**, so every cliff between two levels faces the camera.
2. Every level change is either **a visible cliff** or **a visible trail** carved across it. Never a
   soft slope that secretly blocks (`STEEPEST_WALK` 20 degrees decides what is walkable).
3. The floor is one heightfield: nothing is walked over or under. Water is crossed at fords or on
   stepping stones.
4. Each zone owns a palette and a light that read at the default zoom (about 12 x 8 m on screen).
   The lower you go, the mistier (Son Doong's clouds), so depth reads.
5. Budget: at most 110 draw calls in the caverns, the model under 2 MB, plants and animals instanced.

## The zones

The map stays 45 x 45 m; the ground runs from the lake's water (0 m) up to the jungle (6.5 m).

| Zone | Height | Ore | Son Doong | Ground and rock | Life and light |
|---|---|---|---|---|---|
| Expedition Basecamp (north) | 6 m | forge, Gus, anvil, the adit | expedition campsite | the forge alcove unchanged; packed earth, camp gear | lanterns, the forge's glow |
| Doline Jungle (north-west) | 6.5 m | copper (T1) | Garden of Edam | moss and leaf litter over limestone; copper as green stains on fallen blocks | tall thin trees, ferns, vines from the broken rim, swiftlets; golden sun shafts |
| Coal Breakdown (north-east) | 5.5 m | coal (T1) | the collapse's debris | angular fallen limestone slabs; coal as black bands in grey shale | dust in the light, cooler grey |
| Iron Mudflats (west) | 4.5 m | iron (T2) | Passchendaele | cracked red-ochre mud, rust-stained flowstone on the west wall, a rust-red stream | bats on the wall, drips; dim warm orange |
| Pearl Terraces (south-west) | 3.6 / 2.4 / 1.2 m | silver (T3), hot springs | rimstone pools, cave pearls, the Great Wall | white travertine dams stepping down into the lake; a huge flowstone wall behind; silver veins in white calcite | steam, the capybara, cave pearls in dry pools; cool white light |
| Hound's Overlook (middle) | 3 m | none | the Hand of Dog | a plateau under the basecamp's cliff with the Hound's Hand, a giant stalagmite | the landmark seen from several zones |
| Glimmer Rift (east) | 1 m | glimmer (T4) | the deep, dark passages | a black-rock floor under the breakdown's cliff, its crystal-lined face turned to the camera | glowworms, glowing fungi; the darkest zone, cyan and violet |
| Great Lake (south) | 0 m | Monolith (T5), fishing | the underground river | emerald shallows to near-black deep water; the islet under a second skylight; stepping stones out to it | Finnegan, glowing crabs, low mist on the water |

## Water

A waterfall drops through the jungle's broken roof into a plunge pool. The stream runs south across
the mudflats (a ford in each of the jungle and the mudflats), spills into the terraces' top pool,
flows down through the three pools, crosses the pearl trail at a ford and falls over the last step
into the lake. The lake drains east over the rim into the dark (a ford where the loop crosses it).
The open east edge reads as the river leaving into the dark. Only the lake is fished.

## Ore nodes

Each ore gets its own silhouette and a host rock from its zone, readable at the default zoom:
copper a green crust with orange nuggets, coal a black boulder of glossy lumps, iron dark banded iron
with red jasper stripes and metal plates, silver dark argentite with white calcite and shining wire,
glimmer a large crystal cluster; the Monolith obelisk stays as it is. Every ore is darker or brighter
than its zone's ground (the polish pass's rule), so it reads on a phone. One shared "ready to mine" sparkle replaces the flat glowing triangles.

Counts: copper 5, coal 5, iron 6, silver 5, glimmer 4, Monolith 1, in veins of 2-3 so a crew can mine
together.

## Grinding flow

- **The loop**: basecamp, jungle, the rope descent, mudflats, pearl trail, the lake's south shore,
  the east shore, the rift from its south mouth to its deep end, the winch back up to the basecamp.
- **The shortcuts**: the switchback from the basecamp down to the overlook, the ramps on to the lake
  (Finnegan) and down the overlook's east cliff into the rift; the winch **up only** (the way back from
  the deepest zone; a 3 s ride, the cage then going back down empty).
- **Depth is progress**: walking from the arrival reaches the tiers in order, and `npm run
  check-layout` fails if a deeper tier's nearest node is no further than the one before's. The
  Monolith's islet is reached by its stepping stones from the east shore, past the rift.
- **Walking times** at the game's 3 m/s, from the arrival, checked by `npm run check-layout`:

| To | Target | Now |
|---|---|---|
| nearest copper | 5 s | 4.0 s |
| nearest coal | 5 s | 4.0 s |
| nearest iron | 8 s | 6.9 s |
| nearest silver | 12 s | 10.0 s |
| nearest glimmer | 15 s | 12.1 s |
| the Monolith | 20 s | 15.3 s |
| the whole loop, winch included | 60 s | 44.0 s |

## Surface detail

Everything natural carries detail below the floor's 0.5 m grid (client/src/scene/caveSurface.ts,
docs/caverns-roadmap.md phase 2), each zone its own mix: the breakdown's limestone cracked into
plates, the basecamp's trodden dirt barely, the jungle's moss in patches, the mudflats' walls
streaked with rust, the terraces' tiny rimstone pools, the beach's ripples, the rift's basalt
glinting, strata up every cliff. Every bank too steep to walk is bare rock or broken scree; every
trail a trodden way drawn from its own line. The walls stand in beds a metre thick under the vault's
broken lip, stalactites hanging from it; the Great Wall is cream and amber flowstone.

## Shapes

Nothing is a rectangle (docs/caverns-roadmap.md phase 1): every level's outline is a many-pointed
polygon wobbling as it goes (the mudflats in lobes, the overlook with bays, the rift a crevasse
opening south), the shelf's south edge meanders through its points (`shelfEdgeZ`: the jungle's rim
pushed south, giving it room), the terraces step down in scalloped dams, and their three warm pools
are rimstone basins each its own size and turn (`poolWobble`). The open south and east edges fall
away over a wandering rim into the dark under the cavern (`openEdgeFall`), the rift walled on the
east by a basalt lip (`riftLip`) down to where the lake's outflow spills over.

## Build phases

Each phase is signed off before the next, judged by in-game screenshots at the default (7 m) and the
widest (16 m) zoom, `npm run check-layout`, and the draw-call count.

1. **Blockout** (done 2026-09-30): the layout, the terrain and collision, the floor in flat zone
   colours, the water as plain surfaces, the node spots, the winch, the Hound's Hand; the forge alcove,
   the camp, the adit and the walls carried over.
2. **Structure** (done 2026-09-30): the walls stepped by their bedding, broken off in blocks over the
   jungle (the collapse), the Great Wall's cream flowstone curtains behind the terraces, rust bleeding
   down over the mudflats, fractured over the breakdown; every cliff between two levels dressed as
   rock (strata, rust-stained bluffs, rimstone gours down the terraces' dams, dark basalt with
   crystals over the rift); rimstone lips round the pools; the rope descent's stakes and rope, stones
   lining the trails and cairns at their ends; the stream white where it falls; low rock along the
   open south and east edges and the lake's outflow falling over the rim.
3. **Zone art** (done 2026-09-30): each zone's ground painted over its flat colour (the jungle's moss
   and leaf litter, the basecamp's trodden ways, the breakdown's gravel and dust, the overlook's slab
   joints (taken out in phase 5), the terraces' rimstone ripples, the rift's glints); the jungle's tall thin trees (dithered
   in front of you), ferns and vines down the collapse's walls; the basecamp's barrels, crates,
   bedroll, survey board and lantern posts at the switchback's head and the forge's corner; the
   breakdown's fallen slabs with coal in their beds and gravel; the mudflats' dried plates cracked
   apart (Voronoi) and ochre puddles, the stream rust-red across them; cave pearls in dry basins on
   the terraces' apron; reeds and pebbles at the lake's waterline, emerald shallows, the islet's crag;
   the rift's basalt stubs, fungi and glowworms up the crystal wall; the Hound's Hand's crown in lobes
   and the overlook's stalagmites.
4. **The six ore models** (done 2026-09-30): coal a stepped stack of shale beds striped with coal;
   copper limestone crusted with verdigris, native copper nuggets bulging from its face; iron
   kidney-ore hematite lobes rusting on a slab of the mudflats' rock; silver cool-white calcite with
   dog-tooth crystals, shining silver wire threaded over its face; glimmer a great crystal and its
   crown out of a dark socket; the Monolith as it was. (Coal, iron and silver redrawn in the polish
   pass, docs/caverns-roadmap.md step 1.11: coal a black boulder with glossy lumps, iron a gunmetal
   boulder of banded iron with red jasper and specularite plates, silver dark argentite veined white.) Their glints sit on the rock's own skin (a ray
   from its centre). A twinkling four-point "ready to mine" star on every standing node's face, in its
   ore's colour (one draw for all); the ore rocks lit a little on their own so their minerals read.
5. **Light, mist, animals and sound** (done 2026-09-30): a key light from high over the collapse so the
   cliffs facing the camera stand in their own shade, the fill softer and the baked light a little
   lower; each zone's tint baked into the model's base light (the jungle's green-gold, the basecamp's
   warmth, the breakdown's cool grey, the mudflats' dim orange, the rift's violet, the terraces' cool
   white, the lake's teal); a height mist, a cool haze over the low ground and the lake's shore and a
   deep one below the water line and down the pedestal's sides, the colour of the dark round the
   cavern, so its open edges fall away. The floor made to read as ground, not smoke: the banks too
   steep to walk painted bare rock triangle by triangle in the game (its zone's ground darker, the
   true drops darker still), where the 0.5 m vertex colours only smeared them; the trails blended
   from the zones round them; the overlook's painted joints taken out, the overlook and the
   travertine toned down. Bats roosting on the west wall and six fluttering over the mudflats; dust
   drifting in the collapse's light. The waterfall's roar, the stream's babble and the lake's lapping
   placed by distance, the bats' squeaks over the mudflats, the crystals ringing more often in the
   rift. Each zone's name and what it holds in a toast as you come into it (`cavernsZoneAt`).
6. **Cleanup** (done 2026-09-30): the patch note (0.7.13, The Son Doong Expedition); CLAUDE.md and
   the code's comments and player-facing lines brought to the new map (the Great Lake, the zones'
   names; Old Flint's lore, the world's tagline, Finnegan's and the Monolith's lines); the builder's
   palette cleared of the old map's colours (the model rebuilt byte for byte the same);
   `check-layout` and the build.

## What was kept

The forge alcove (`build_forge_alcove`), Gus's camp, the adit, the walls' builder, the ore and fauna
templates, every server system (mining, the forge, the geode chisel, shore fishing and the lucky drip,
the hot springs, Gus's and Finnegan's counters), the NPC models, the camera module and the pipeline
from the layout to the model. The node ids were reused where they fit; the nodes' saved state resets
once where they moved, which is harmless.
