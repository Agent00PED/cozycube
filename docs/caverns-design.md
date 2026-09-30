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
what you can mine); Gus's winch lift from the rift back up to the basecamp.

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
into the lake. The lake drains east over the rim into a dark sump (a ford where the loop crosses it).
The open east edge reads as the river leaving into the dark. Only the lake is fished.

## Ore nodes

Each ore gets its own silhouette and a host rock from its zone, readable at the default zoom:
copper a green crust with orange nuggets, coal glossy black bands, iron rust-red lumpy ore with a
metal sheen, silver threads in white calcite, glimmer a large crystal cluster; the Monolith obelisk
stays as it is. One shared "ready to mine" sparkle replaces the flat glowing triangles.

Counts: copper 5, coal 5, iron 6, silver 5, glimmer 4, Monolith 1, in veins of 2-3 so a crew can mine
together.

## Grinding flow

- **The loop**: basecamp, jungle, the rope descent, mudflats, pearl trail, the lake's south shore,
  the rift, the winch back up to the basecamp.
- **The shortcuts**: the switchback from the basecamp down to the overlook, the ramps on to the lake
  (Finnegan) and to the rift; the winch both ways.
- **Walking times** at the game's 3 m/s, from the arrival, checked by `npm run check-layout`:

| To | Target | Now |
|---|---|---|
| nearest copper | 5 s | 4.0 s |
| nearest coal | 5 s | 4.0 s |
| nearest iron | 8 s | 6.8 s |
| nearest silver | 12 s | 10.9 s |
| nearest glimmer | 15 s | 8.9 s |
| the whole loop, winch included | 60 s | 41.9 s |

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
   joints, the terraces' rimstone ripples, the rift's glints); the jungle's tall thin trees (dithered
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
   crown out of a dark socket; the Monolith as it was. Their glints sit on the rock's own skin (a ray
   from its centre). A twinkling four-point "ready to mine" star on every standing node's face, in its
   ore's colour (one draw for all); the ore rocks lit a little on their own so their minerals read.
5. **Light and mist per zone, animals, sound**; the zone-name toast (`cavernsZoneAt`).
6. **Cleanup**: CLAUDE.md, the patch note, `check-layout`, the build.

## What was kept

The forge alcove (`build_forge_alcove`), Gus's camp, the adit, the walls' builder, the ore and fauna
templates, every server system (mining, the forge, the geode chisel, shore fishing and the lucky drip,
the hot springs, Gus's and Finnegan's counters), the NPC models, the camera module and the pipeline
from the layout to the model. The node ids were reused where they fit; the nodes' saved state resets
once where they moved, which is harmless.
