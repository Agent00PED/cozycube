# The Glimmering Caverns: polish roadmap

The plan that follows the six-phase rebuild (docs/caverns-design.md stays the spec of the map itself).
Written 2026-09-30 from a full audit in game: every zone at the 7 m and 16 m zoom, the whole map from
far out and from above, a phone-sized screen, frame cost, and every cave mini-game played by hand.

## 1. Where the cave stands

**Works well**: every zone reads by colour at a glance; the ground steps down to the south-east so the
cliffs face the camera; the grinding loop is short (the nearest copper and coal 4 s, the loop 42 s)
and `npm run check-layout` enforces it; the basecamp (the forge alcove, Gus's stall, the adit) and the
mudflats (cracked plates, rust, bats) have real character; the rift's crystals and the lake's islet
are strong focal points; the whole cave is 7 static draw calls, its floor is its click collider, and
the builder is deterministic.

**The problems** (from the audit, most important first):

| # | Problem | Evidence |
|---|---|---|
| P1 | Zones are rectangles on a flat board: two straight mudflat strips, three swimming-pool terraces in a row, a slab overlook, a rectangle rift | the whole-map views |
| P2 | The Great Wall is a blurry white fog sheet (flowstone only painted into coarse wall colours) | the terraces' wall |
| P3 | The open south and east edges are ruler lines into darkness, the shore a plain brown band, the edge rocks pebble-sized | the south edge |
| P4 | Empty stretches: the overlook, the rift floor, the south shore, the slope under the switchback | 16 m views |
| P5 | The jungle is a flat lawn, the trees are poles, the waterfall a flat ribbon, no sky through the collapse; it is also the smallest zone (90 m²) for 5 nodes | the jungle |
| P6 | On a phone in portrait the 7 m default shows about 5 m of ground: no sense of place | phone view |
| P7 | The winch teleports; the cage never moves | server `rideWinch` |
| P8 | T4 glimmer (8.9 s) is nearer than T3 silver (10.9 s): depth is not progress | walk times |
| P9 | The lake's surface is one busy, even squiggle pattern, no calm, no foam | the islet |
| P10 | Soft fades on walkable ramps, saw-tooth banks on diagonals, the Hound's Hand a cluster of cones | the overlook |
| P11 | Ore silhouettes: copper reads as mushrooms, coal as stacked plates, iron as grapes | close-ups |
| P12 | Activity animations are arm-only: the mining swing, the fishing pose, nothing at the forge, the anvil, the springs or the winch | Avatar.tsx `mine`, `reel` |
| P13 | Surfaces have no detail below the vertex grid: the floor, walls and rocks are flat colour with facet shading, so up close everything looks like clay blocks | every close-up |
| P14 | The mini-games feel like beta tests: plain DOM panels covering the world (the forge's thermometer and a button, the geode as a brown blob in a box), no onboarding line, little feedback or juice, no streaks, flat square particles; the fishing wait has nothing to watch | played by hand |
| P15 | Sound is thin: synthesized beds only, one footstep for every surface, no zone reverb, no music, the water on the "cave air" fader | cavernAmbience.ts |
| P16 | Frame cost is dominated by avatars (yours ~55k triangles, drawn twice for the x-ray); draw calls sit at 90-101 of the 110 cap | gl.info |

## 2. Decisions (taken for the owner, 2026-09-30)

1. **Reshape, don't relocate**: every zone keeps its place, height, ores, node count and walk-time
   targets, but gets an organic outline (lobes, bays, scalloped rims).
2. **Depth is progress**: the winch runs **up only** (the way back to the basecamp, as first decided),
   and the glimmer nodes move deeper into the rift, so walking from the arrival reaches the tiers in
   order (copper and coal, iron, silver, glimmer, the Monolith). `check-layout` enforces the order.
3. **Sound stays synthesized** by default; every bed and effect gets a sample slot
   (`client/public/sounds/caverns/<name>.mp3`, used when present), so recordings can be dropped in
   later without code changes.
4. **New content, staged**: the overlook's campfire hub, living events (Cave Cloud, Glimmer Bloom, Bat
   Exodus on the camp's day), a cave codex with collectibles (cave pearls, fossils, Old Flint's
   journal), the grotto behind the waterfall; the raft and stream fishing come last.

## 3. The quality bar (every change is checked against it)

- **Devices**: PC (mouse, 16:9), iPad (touch, 4:3, both orientations), phone (touch, portrait and
  landscape). Each change is looked at in game at 1280 x 720, 1024 x 768, 768 x 1024 and 390 x 844.
- **Readability**: anything you interact with reads at the default zoom on a phone (a clear silhouette
  and colour), tap targets at least 48 px, no text under 12 px, the HUD never over the thing you act on.
- **Detail in three scales**: large (1-3 m: shape, colour zones) for the phone, mid (0.2-0.5 m:
  cracks, strata, moss) for everyone, fine (under 5 cm: grain, sparkle) only where the device can
  afford it. Chunky, cozy low-poly: detail comes from shape and shading, never photo textures.
- **Budget**: at most 110 draw calls in the caverns, the cave model under 2.4 MB, a frame on a
  mid-range phone kept cheap (no heavy per-pixel loops, shadows limited, fine detail off on low end).
- **Mini-games**: understood in one second, playable with one thumb, forgiving but with a skill ceiling,
  a clear reward every time, set in the world (the camera frames the forge, the anvil, the rock)
  rather than a panel over it, and a quick mode for the grind.
- **Every step is verified in game** (screenshots at 7 m, 16 m and on a phone), `check-layout`, both
  typechecks and the build.

## 4. The phases

### Phase 1: the fix pass (P1-P11): built 2026-09-30

All eleven steps built and checked in game. Left to phase 2's surface detail: the ramps' tan fans
where a walkable ramp runs from pale ground into dark, the stepped shading still showing on a few
diagonal banks (the rift's and the overlook's, drawn on the 0.5 m grid), and the pale haze over the
terraces seen from the mudflats above.

| Step | Work | Done when |
|---|---|---|
| 1.1 | Camera by screen shape: the default distance and zoom limits follow the aspect (portrait sees about as much ground as landscape) | a phone in portrait shows the zone around you |
| 1.2 | Winch up only, with a ride: the cage rises with you in it over 2.5 s, the crank turns, the rope creaks; you stand in it while it rides | the ride plays, the server holds you for its length |
| 1.3 | Tier order: glimmer nodes deeper in the rift; `check-layout` fails if a higher tier is nearer than a lower one | walk times copper/coal < iron < silver < glimmer < Monolith |
| 1.4 | Water: calmer, varied ripples, stiller in the deep and under the skylight, a foam line where it laps, the depth reading through | the lake reads as water, not a pattern |
| 1.5 | Banks and ramps: banks broken up so diagonals do not saw-tooth, ramps edged so they end cleanly; the Hound's Hand re-sculpted as one hand-like tower | the overlook reads cleanly at 16 m |
| 1.6 | The Great Wall as geometry: flowstone curtains, folds and rimstone ledges down the west wall, cream but not glaring | no fog-like smear |
| 1.7 | The jungle: moss, leaf litter and roots on the floor, buttressed jungle trees with canopies that read from above, a waterfall with foam, spray and a plunge-pool splash, the sky and vines seen through the collapse, a little more room | the jungle reads as Son Doong's garden |
| 1.8 | Organic outlines for every zone, the terraces as scalloped rimstone pools of different sizes, the mudflats broken into lobes, bays in the overlook, a crevasse-shaped rift | the whole-map view has no rectangles |
| 1.9 | The open edges: a real rim (bays, points, big boulders, stalagmites), the far cave beyond (silhouettes fading into mist) | no ruler line anywhere |
| 1.10 | The empty stretches dressed (the overlook, the rift floor, the shore, the slope) | nothing looks unfinished at 16 m |
| 1.11 | Ore silhouettes: each ore unmistakable on a phone | a new player can name each ore |

### Phase 2: surface detail (P13): built 2026-09-30

Built as client/src/scene/caveSurface.ts and the builder's walls:

| Step | Work | How |
|---|---|---|
| 2.1 | The surface shader | one generated 256 x 256 noise texture (mottling, grain, a crack network, each crack cell's tone), sampled in world space (along the ground on the floor, from three sides on rock and walls); a look texture on the terrain's grid (a row per surface: cracks, moss, rust, wet, strata, gours, ripples, sparkle), its zones' edges wandering with the noise; the fine grain and glints only without a touch screen; only natural faces (colour alpha 1, the builder's `PLAIN` colours 0) |
| 2.2 | The banks | the floor's steepness over a metre from its heights (a half-float texture, shared with the water's depth): bare rock past the walkable line, each crack plate turning whole where the slope hovers there (scree, never smoke) |
| 2.3 | The trails | drawn from their own lines in the shader (crisp at any zoom, a trodden way with grit and a lip, fading past the ends); the floor under them painted as the ground they cut (`ground` in the terrain data), the zones' seams no longer blurred over a metre and a half |
| 2.4 | The walls | 38 rows, beds a metre or so thick each set back from the one below (lit lips, dark recesses); the vault's broken lip and stalactite clusters along the tops (never over the jungle's collapse or the floor); the Great Wall's faceted faces keep their cream flowstone colours (they had fallen back to grey limestone since phase 1) |
| 2.5 | Weathered edges | every natural corner paler and every crevice darker, baked from the mesh's own shape (`vertex_wear`) |
| 2.6 | The haze | the low mist lighter (16%) and only below 2.2 m, so the terraces and the overlook keep their contrast |

Draw calls unchanged (the shader rides the existing materials); the model 2.32 MB. The original
brief:

A shared cave-surface shader on the floor, walls, rock and props: world-space noise at two scales for
grain, cracks, strata banded by height on limestone, moss on up-facing rock in the jungle, rust streaks
down the mudflats' walls, wet sheen near water, crevices darker; each zone's look set by a small
table, the fine scale off on low-end devices. The walls get more rows and bedding ledges; the vault's
broken lip and stalactite clusters along the tops of the walls only (never over the play area); every
boulder and prop given weathered edges.

### Phase 3: animation (P12): built 2026-09-30

| Step | Work | How |
|---|---|---|
| 3.1 | The activity suite | client/src/entities/activityAnimations.ts: whole-body poses on the boxing suite's pose (mining, the forge's bellows and hammer, the geode chisel, the warm pools, the winch), eased by Avatar.tsx; tools drawn back out to the side (a raised arm hides behind the chibi's head); a heavier pick swings bigger and slower |
| 3.2 | Everyone sees it | the server marks the forge and the chisel (`forge`, `chisel` actions, `working`); other miners' blows timed by the room's `caveStrike`; the forge and chisel on a shared loop for everyone else (`forgeBeat`, `chiselBeat`); the worker turned to the rock, forge or anvil (`workHeading`) |
| 3.3 | Your own beats at once | client/src/systems/activityStore.ts: the tap on the rock, the bellows held, each pump and hammer blow, the geode's turn, the mallet's power and blow, written the moment they happen |
| 3.4 | Held props | the avatar's `SmithHammer` and `Chisel` (build_avatar.py), shown at the forge and the anvil |
| 3.5 | Fishing, the rope, the springs, the winch | a cast with the whole body, a start at the bite, a braced reel (every map); a hand on the rope descent's rope; leaning back in the pool with happy eyes; a hand on the rope and one on the cage |
| 3.6 | The folk | Gus writing his ledger, Finnegan casting his rod, the capybara bobbing and dozing in its bath |
| 3.7 | Particles | client/src/scene/caveFx.ts: sparks as thin streaks, rock chips and dust puffs off every blow, all landing on the real floor (they fell through it on high ground before), embers from the forge's mouth with each pump, sparks off the hammer, chips off the chisel |

The original brief:

A full-body activity animation suite on the rig (the ring's boxing suite shows the way): mining
(stance, wind-up, strike, recoil, a heavier swing for heavier picks), fishing (cast, the wait, the bite
flinch, reeling, landing), the forge (pumping the bellows, hammering on the anvil), the geode (setting
it down, chisel and mallet), the springs (sinking in, relaxing), the winch ride, climbing the rope
descent; the folk (Gus working his ledger, Finnegan's cast and catch, the capybara's bath) and better
particles (sparks as streaks, dust puffs, chips) everywhere.

### Phase 4: the mini-games (P14): built 2026-09-30

| Step | Work | How |
|---|---|---|
| 4.1 | Prospecting | a glowing ring the size of the sweet spot on the weak spot, a white ring closing onto it every `PULSE_S` (1.1 s); a direct strike as it closes (`PERFECT_WINDOW_S` 0.13 s) is a Perfect, 30% harder (`PERFECT_DAMAGE`); Perfects in a row a streak, +8% haul each up to +40% (`streakBonus`, lapsing after `STREAK_IDLE_S`); the rock's crack meter, each blow's verdict popped big, a shake, a crit chime and white sparks on a Perfect (ProspectingHud, ProspectingView); judged by the server on the client's clock within `PROSPECT_CLOCK_SLACK_MS` |
| 4.2 | The forge | in the world: the camera on the forge (scene/workSpots.ts `FORGE_SPOT`, prospectCamera's `spot`), a sheet at the foot of the screen (hud/WorkSheet.tsx); a curved heat gauge with its gold band and the hold filling, a big round bellows button; the anvil's rings closing onto the glowing ingot, a star for each strike on the beat (`HAMMER_WINDOW_S` 0.22); graded Plain, Fine (the heat held: the batch's coal back) or Masterwork (`forgeGrade`) |
| 4.3 | The geode | the cleave at the anvil in the world (`ANVIL_SPOT`, WorkSheet); warmer and colder as the seam comes round (its glow ice to gold, the stage glowing, a crystal ping rising and quickening: sfx `playPing`; 🧊 Cold to 🔥 Hot); the mallet's swing as an arc over the geode; the reveal: the geode shakes, splits and falls open, the gem bursting out on rays in its rarity's colour (index.css `geode-*`); ⚡ Quick crack once one has been cleaved by hand (op `quick`: a rough cleave, never dust, `QUICK_CRACK_GAP_MS`); the odds perfect beside rough; the avatar kept at the anvil while the blow lands (`CHISEL_REST_MS`) |
| 4.4 | The springs | the breathing ring (hud/SoakHud.tsx): a tap at the swell's top a deep breath, +1 min of the Deep Warmth each, up to 10 a soak, one try a breath (`BREATH_*`, `breathFill`, `breathAt`; the server's `breathe`, `soakBreath`); the capybara dozing alone, waking to watch the nearest bather, a perk as each settles in or at a deep breath, shaking off a splash, a word when clicked (`CapybaraBath`) |
| 4.5 | Fishing | a fish's shadow circling under each float at the cenote (wide and lazy, closer and quicker with the nibbles, darting in on the bite; lazily under an AFK line: `FloatShadows`, one instanced draw), the bite's mark thumb-sized on a touch screen, the reel held through a thumb sliding off (pointer capture) |
| 4.6 | Everywhere | stars on every result (`GradeStars`), rewards flown into the 🎒 pill (hud/flyToBag.ts: the gem, the dust, the ingots), first-time tips (hud/firstTips.ts: three times until played well; `markPlayed` opens a quick mode), the quick modes (Quick Smelt, Quick crack) |

The original brief:

- **Prospecting**: a clear target on the rock (a pulsing ring the size of the sweet spot), a crack
  meter showing how far the rock has gone, a strike timed to the ring's pulse for a Perfect, streaks
  that raise the yield, hit-stop, camera kick and layered sound; a one-line tip the first time.
- **The forge**: framed in the world (the camera on the forge, the heat as the fire's own glow with a
  curved gauge), the avatar pumping the bellows, then the anvil: shrinking rings onto the glowing ingot
  for each strike; quality in three grades (Plain, Fine, Masterwork) instead of pass or fail.
- **The geode**: on the real anvil in a close-up, turned by a drag with a warmer-colder glow and tone
  on the seam, the mallet's power on a swing, and the reveal: the geode splits in half on its crystal
  heart, the gem's rarity bursting out.
- **Fishing**: something to watch in the wait (the float's nibbles, a fish shadow circling), a clear
  "Bite!" with sound, the reel tuned for touch, the cave's glowing reveal.
- **The springs**: an optional breathing rhythm (tap with a slow ring) that lengthens the Deep Warmth;
  the capybara reacts to bathers.
- **Everywhere**: the same result card, rewards flying into the satchel, first-time tips, forgiving
  retries, and a quick mode once you know the game.

### Phase 5: sound and light (the audit's section 4): built 2026-09-30

| Step | Work | How |
|---|---|---|
| 5.1 | Each zone's reverb | client/src/audio/cavernAmbience.ts `ROOMS`: the jungle open to the sky short and dry, the basecamp, the breakdown and the mudflats halls, the terraces, the overlook and the lake longer, the rift deepest (3.2 s); two convolvers, the silent one given the next zone's impulse and the two cross-faded as you walk in (held 0.5 s first: no flicker on a border) |
| 5.2 | Footsteps by the ground | `GROUND_OF` from `cavernsSurface`: stone (the basecamp, the overlook, the rift), gravel (the breakdown, the trails), mud, sand (the shore), travertine, leaf litter (the jungle), a splash (the fords and the shallows); left and right a touch apart |
| 5.3 | A sparse music layer | `MUSIC`: every half a minute or so a kalimba's phrase of three to six notes in A minor pentatonic over a soft drone swelling in under it, each zone its register and pace (glassy and high in the rift, slow and low by the lake) |
| 5.4 | The faders | the caverns' five in Settings: Cavern Air & Footsteps, Water (the waterfall, the stream, the lake, off the air's fader now), Crystal Resonance, Thermal Steam, Cave Music |
| 5.5 | The sample slots | every effect, `step_<ground>` and `bed_<name>` (air, steam, waterfall, stream, lake: a bed's sample loops in place of its voices) from client/public/sounds/caverns/<name>.mp3, used when named in manifest.json there (`[]` for now: one request, never twenty misses) |
| 5.6 | The jungle's sun on the camp's day | `daylight` (shared/daynight.ts): the collapse's spotlight golden by day, a silver moon by night; the jungle's ground cooler and darker after dusk, the sky through its broken rim a starry deep blue (`DAY` in `bakedLight` and the glow's shader), the godrays moonlit and fainter |
| 5.7 | A light round you in the dark | `YOU` in the cave's own materials (the floor, the rock, the walls: a warm glow within about 4.5 m, not a light, so no material pays for another light and the dark basalt lights up round you without the avatar glaring), eased by zone (`ZONE_DARK`: the rift darkest; the jungle by night) |
| 5.8 | Softer godrays | long fades at both ends, a gentler falloff to the edges, a slow breath, the pools wider and fainter |
| 5.9 | Shadows | only the cave's own rock casts the sun's shadow and nothing that moves does, so the map is drawn as the model settles in and then every few seconds, never every frame; the spotlight's cone keeps them to the jungle |

The original brief:

Sound: per-surface footsteps (mud, gravel, travertine, sand, stone), each zone's own reverb (the rift
deepest), a sparse music layer, a Water fader, the sample slots. Light: the jungle's sun on the camp's
24-minute day (moonlight at night), a small light round you in the dark zones, softer godrays;
shadows limited to the jungle.

### Phase 6: new content (the audit's section 5)

The overlook's campfire ring (seats, the Hound's Hand as a photo spot); living events (Cave Cloud: mist
rolls through, rare fish bite more; Glimmer Bloom: the rift glows and yields more; Bat Exodus at the
camp's dusk; Rockfall: a temporary crew node in the breakdown); the cave codex (the fauna, cave pearls,
fossils, Old Flint's journal pages) and a stamp for each zone discovered; the grotto behind the
waterfall; later the raft to the islet and stream fishing.

### Phase 7: tech

Split `build_caverns.py` and `CavernsWorld.tsx` into per-zone and per-system modules; a lighter avatar
(every map benefits); the performance pass on phones.

## 5. How each phase ships

Each phase runs on its own branch, is checked against section 3, and is shown with screenshots
(7 m, 16 m, phone) before it is committed; docs/caverns-design.md, CLAUDE.md and the patch notes are
brought along with it.
