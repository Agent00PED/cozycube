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

### Phase 6: new content (the audit's section 5): built 2026-09-30

| Step | Work | How |
|---|---|---|
| 6.1 | The overlook's campfire | shared/worlds/caverns.ts `HEARTH`, `HEARTH_SEATS` (the log style: a marshmallow on a stick as you sit, the server's `roastSeat`); build_caverns.py `build_hearth` (the stone ring, the charcoal bed, the charred logs, four log benches); the client's `HearthFire` (flames, embers, the `FIRE` glow in the cave's own materials) and the crackle (cavernAmbience's `fire` bed and pops) |
| 6.2 | The Hound's Hand photo spot | `PHOTO_SPOT` and its brass paw plaque; the dock's `[ 📸 Photo with the Hound's Hand ]`: the camera framed on you with the Hand behind, a flash and a shutter, `wonder_photo` |
| 6.3 | Living wonders | shared/caverns_codex.ts `CaveEvent`: a Cave Cloud (the mist through the whole cavern, `CLOUD_LUCK` on the cenote), a Glimmer Bloom (the rift flaring, `BLOOM_YIELD`, `BLOOM_REGROW`), a Rockfall (the `rockfall` crew node in the breakdown, `ore_rockfall`, `oreRule`), one every 18-30 minutes while anyone is down there (the server's `tickEvent`, the room's `caveEvent`, a pill with its clock); the Bat Exodus at the camp's dusk (caveFauna's `exodusClock`) |
| 6.4 | The Cave Codex | the camp profile's `codex` (34 entries, five sections, coins each and a bonus a section): zone stamps, fauna met in their homes, cave pearls (dock), fossils (a broken node's rubble), Old Flint's six journal pages (`Find_Page`, read at the dock), the wonders; `CaveCodexHud` (the watch and the toasts), `CaveCodexModal` (from the ore satchel drawer) |
| 6.5 | The grotto behind the waterfall | not built: the jungle's waterfall falls from the map's north edge (z -22.3 of the +-22.5 square), so a grotto behind it means growing the map past its bounds (the terrain grid, the shell, the camera's bounds); kept for a later phase with the raft and stream fishing |

The original brief:

The overlook's campfire ring (seats, the Hound's Hand as a photo spot); living events (Cave Cloud: mist
rolls through, rare fish bite more; Glimmer Bloom: the rift glows and yields more; Bat Exodus at the
camp's dusk; Rockfall: a temporary crew node in the breakdown); the cave codex (the fauna, cave pearls,
fossils, Old Flint's journal pages) and a stamp for each zone discovered; the grotto behind the
waterfall; later the raft to the islet and stream fishing.

### Phase 7: tech: built 2026-09-30

| Step | Work | How |
|---|---|---|
| 7.1 | A lighter avatar | scripts/blender/build_avatar.py's web budget: every part decimated on export to at most its budget (the head 3,000 triangles, the torso 2,600, a hat, a hair or a top 3,000-3,200, a bottom 1,800, the rest 1,500; never below 30% of it), a collapse symmetric across the avatar's middle; the normals packed to 8 bits (KHR_mesh_quantization, `quantize_normals`): avatar.glb 12.1 MB to 5.1 MB, 745k to 369k triangles over every garment; five outfits rendered before and after in Blender the same, nothing poking through |
| 7.2 | The x-ray only when hidden | client/src/scene/occlusion.ts: `OcclusionIndex` (the cave's rock, shell, trees and floor bucketed on a 1.5 m grid, a segment tested against only the triangles of the cells it crosses) and `xrayGate`; CavernsWorld's `XrayWatch` looks from your feet, chest and head toward the camera five times a second, and the avatar's silhouette (a second draw of every part) is drawn only while something is in the way; the other worlds as before |
| 7.3 | The phone profile | client/src/systems/perfProfile.ts `perf`, decided once at startup: a handheld (a coarse pointer and no fine one) gets no multisampling on a screen of 2x or more, no shadow map (the doline sun's shade is the model's baked light) and two crystal lights instead of four; the pixel ratio never past 1.5 on any device; the surface detail's fine grain was already off on touch (caveSurface's `CAVE_FINE`) |
| 7.4 | CavernsWorld.tsx by system | the model, the folk, the x-ray's gate and the winch stay in CavernsWorld.tsx (393 lines of 2,026); `caveMaterials.ts` (the shared uniforms, `bakedLight`, `heightMist`, the glow, the caustics, the water), `caveLight.tsx` (`CaveLights`, `YourLight`, the godrays, `MotePoints`, the dust), `caveOres.tsx` (the nodes, `ReadySparkles`, the effects' layer, the work), `caveLife.tsx` (the spray, the zone toasts, the steam, the float shadows, the forge's smoke, the drip), `caveWonders.tsx` (the hearth, the wonders' looks, the finds); every statement carried over unchanged (checked statement by statement) |
| 7.5 | build_caverns.py by system and zone | scripts/blender/caverns/: `kit`, `scene`, `ground`, `walls`, `rims`, `waters`, `rocks`, `templates`, `pack`, and a module a zone (`zone_basecamp`, `zone_jungle`, `zone_breakdown`, `zone_mudflats`, `zone_terraces`, `zone_lake`, `zone_rift`, `zone_overlook`); build_caverns.py keeps the world's order (`build_world`), the export and `main`, and imports the package afresh on every run (the Live Bridge's Blender keeps modules); the rebuilt caverns.glb byte for byte the builder's own (it already fluttered by one step in two of the copper rock's colour values from run to run) |

Measured: at the overlook's phase 6 view 104 to 72 draw calls and 271k to 148k triangles (the
avatar and the x-ray); a phone at the basecamp 74 draw calls, 152k triangles, five point lights, no
shadow map, no multisampling.

The original brief:

Split `build_caverns.py` and `CavernsWorld.tsx` into per-zone and per-system modules; a lighter avatar
(every map benefits); the performance pass on phones.

## 5. How each phase ships

Each phase runs on its own branch, is checked against section 3, and is shown with screenshots
(7 m, 16 m, phone) before it is committed; docs/caverns-design.md, CLAUDE.md and the patch notes are
brought along with it.

## 6. Round 2 (the audit of 2026-09-30, after phase 7)

A second audit (every zone at 7 m and 16 m, a model of every income, the walk and steer replayed
headless) found the caverns finished but out of step with the game: its economy 3-9 times the river's
(the cenote 5x at every rod tier, mining 3-15x), the ground paved by one crack pattern everywhere, a
white hole in the jungle's sky at 16 m, two rift nodes sharing a spot, and, from players, the avatar
snagging while steering (WASD or the joystick). In order:

| Step | Work | Why first |
|---|---|---|
| R2.1 | Movement and hitboxes: a slide that turns along what it meets when the axis split stalls (every map), a walk out of a blocked spot, the caverns' pinholes closed, colliders checked against what they stand for, a snag test in check-layout | felt on every walk, every map (steering snags in the caverns 4% of steers) |
| R2.2 | The economy: the caverns about 2x the river at the same tier (cave fish and ores cut, geodes and ingots made fair choices), the codex's reward titles | the caverns otherwise buy out the whole game |
| R2.3 | The bugs: the jungle's sky, the rift's shared spot, stale docs | small, visible |
| R2.4 | The ground by what it is: cracks only where mud would crack, sand grain and pebbles, basalt joints, travertine flow, cell sizes that vary; the trails worn with ruts and grit | the most visible artifice up close |
| R2.5 | A colour and light pass: the mudflats calmer, the terraces with contrast, the upper zones a touch dimmer with more pools of light | underground should feel underground |
| R2.6 | Room in the model: meshopt compression on caverns.glb and avatar.glb | the model is at its cap |
| R2.7 | The Monolith remade | it is the plainest ore of all |
| R2.8 | An endgame: mining mastery by kind (ranks, small perks, titles), the Motherlode (a rare rich vein), the Monolith's awakening | past the Drill there is nothing to mine for |
| R2.9 | Unit tests (tsx --test): the strike, the forge's replay, the codex, the economy's targets, the snag rate | the rules had only the layout's checks |
| R2.10 | Optional polish: a distant passage beyond the open rims, drips off the stalactites, the lake's sheen, the jungle's canopies, dust in the dark zones, a cave map with regrowth timers, a prospector's ledger, weekly goals, lanterns you set down, the hearth's stories, the raft to the islet, stream fishing | better, not needed |

Not in this round: the grotto behind the waterfall (it needs the map grown past its bounds) and
recorded sound (the sample slots wait for files).

Built 2026-10-01 (patch 0.7.21):

| Step | Work | How |
|---|---|---|
| R2.1 | Movement and hitboxes | shared/collision.ts `slideStep` (the axis split, then the step turned up to 80 degrees where it stalls; a walk out of a spot a body doesn't fit), used by the client and replayed by check-layout (600 steers a world, a 1.5% snag budget) and `npm test`; round things discs (`disc`, AABB `r`) on every map; the caverns' mask opening lone slope-only pinholes; `glimmer_3` turned south (no two mining spots within 0.8 m, checked). Steering snags per 2,000 steers: caverns 81 to 4, campfire 53 to 14, woods 41 to 6, lounge 25 to 6, casino 32 to 12, ring 22 to 10 |
| R2.2 | The economy | shared/economy.ts: ore, ingots, geodes, gems and cave fish recalibrated (the cenote 1.6-3.2x the river on the same rod, pinned by tests/economy.test.ts; ingots 15-18% over their makings; an uncracked geode about two thirds of a cracked one); iron regrows in 75 s; the codex's gold titles (a section each, the whole codex) |
| R2.3 | The bugs | the jungle's sky a day gradient with drifting cloud, ending in the cave's dark (no white slab); stale docs |
| R2.4 | The ground | caveSurface `LOOK`'s slabs, pebbles, flow and joints; the small plates' crack net warped; cracks only on mud; basalt's joints crisp |
| R2.5 | Colour and light | the mud's palette calmer; the travertine and the breakdown a touch darker; the baked light 0.66 and the exposure 0.88; the glow round you as strong as the ground is dark (no white halo on pale stone) |
| R2.6 | Room in the model | scripts/pack-models.mts (EXT_meshopt_compression, vertex-exact; run by both builders): caverns.glb 2.39 to 1.24 MB with the round's additions, avatar.glb 5.06 to 3.52 MB |
| R2.7 | The Monolith | `ore_monolith`: a weathered six-sided shaft, a broken crown of violet crystal, two bands of runes, jagged seams, rubble and fallen slabs |
| R2.8 | An endgame | shared/caverns_mastery.ts: mastery by kind (ranks, +5% extra ore a rank, a Master's +10% sweet spot and title, the Grandmaster's), the Motherlode (a gold halo and motes, 3x), the Monolith awake (a violet beam, a second core); the satchel's Mastery tab |
| R2.9 | Tests | `npm test` (tsx --test): the strike, the pulse, the crew, the yields, the forge (a steady-hand bot makes a Masterwork at every batch size), the chisel, mastery, the codex's titles, the weekly orders, the economy against the river, the stream's catch, walking |
| R2.10 | Polish | the Cave Map (M), lanterns (a coal, 10 minutes, their warm pools), the raft to the islet, stream fishing, the Prospector's Ledger, weekly orders, the hearth's stories, dust in your light, drips off the stalactites, the lake's sheen, the passage's glints below the open rims, the jungle's canopies (a tree's own green, a middle layer, hanging moss, blossoms), the forge's tip (pump a little early) |

One finding on the way: the forge's biggest batch holds only for a hand that pumps a little before the
heat reaches the band's middle (a pump's puff is more than its band's half): kept as the hardest
batch's skill, and said in its tip.

## 7. Round 3 (the owner's review of 2026-10-01): the cave, made natural

The owner's review named six spots (the adit, Gus's camp, the stream's falls, the pools, the
Monolith, the trails). Close-ups of each, and a second look round the whole map, found the same root
in almost every case: things built as regular shapes (a ribbon, a ring, a band, a sheet, a box) where
the cave wants them grown, worn and uneven.

### What the close-ups found

| Spot | What is wrong | Why (in the build) |
|---|---|---|
| The trails | a pale road 2.2-2.4 m wide with crisp dark edges, lined with stones and cairns: it reads as a built way, not an expedition's traces; thin ring lines across the pearl trail | caveSurface's trail band at 85% over its whole half-width, with a dark lip; build_trail_edges' lining; the gours' ring pattern showing on the floor |
| Gus's camp | stands in the middle of the basecamp shelf (7 m wide): the way west pinched to 4.2 m, a post a metre from the switchback's top, the rope descent 16% further round it; a flat sheet on four sticks over a log that hides Gus | layout `camp` / `workstation` / `gus` at (-4.7, -16.6); build_camp's tarp (no thickness) and log workstation |
| The stream's falls | a flat ribbon folded down the cliff like paper: one width, no curtain, no white water, no splash | build_waters: one ribbon 0.2 m over its channel, tilted wherever the channel drops |
| The pools | an even white ring round each (the same width, height and colour all round); the stream stops at a pool's edge and a straight flat strip spills to the next; the seats' submerged ledges show as glassy cubes; dark triangular holes in the rimstone cliffs | build_terrace_lips (four identical rings); the ribbon's `skip` inside pools; the ledges built in the water's material; gaps in the gour faces |
| The Monolith | stands straight on the sand, no base and nothing round it; its glowing seams drape past its foot onto the sand | `ore_monolith` has no plinth; the seams run to the ring below ground level |
| The adit | a timber set standing in front of a flat cliff (a black gap by its left post), a floating block on its header, a flat dark bore about 4 m deep, rails stopping in the sand | build_adit: the bore's four rings and a flat cap, the lagging stacked over the cap, no rock round the portal, the track cut at the mouth |
| The mudflats | plates like floor tiles: flat, all the same thickness, even gaps, brighter than the ground | build_mudflats' Voronoi plates, raised whole |
| The zones' borders | the mud cliff meets a grey cliff in a hard seam at the overlook's edge | build_cliff_faces' styles switching per rim run |
| Still pale | the breakdown and the overlook under the key light | their ground colours and the key light |
| The raft | lands a step from the Monolith's mining spot | layout `raft.islet` |

What stays as it is: the rift (glowing crystals in the dark, the lanterns' warm pools), the lake's
colours and sheen, the jungle's waterfall spray and canopies, the Hound's Hand, the hearth, the
ores, the terraces' pool shapes from above, and the budget (74-87 draw calls, 1.24 MB).

### The plan, in order

| Step | Work | Done when |
|---|---|---|
| R3.1 | **Trails as traces.** The shader's trail: a worn core about 0.5 m wide with feathered sides, its wear in patches along it (noise: strongest at bends, the tops of slopes and the ends, fading to nothing between), scuffs and a bootprint now and then, the ground's own detail only softened under it, no dark lip. The builder: the stone lining and most cairns gone; in their place the expedition's leavings: survey stakes with faded ribbon at the turns, chalk arrows on the rock by the junctions, the rope and its anchors down the rope descent, a cold fire ring and a dropped canteen or map scrap here and there. The ring lines on the pearl trail softened | at 7 m a faint worn way you follow by eye; at 16 m hardly there; the Cave Map and the dock still show every way |
| R3.2 | **Gus's trading post, moved and rebuilt.** Against the north wall west of the adit (the barrels and the crate stack moved with it), out of the east-west way: a timber lean-to off the rock (rafters from a ledger beam on the wall to two front posts, a shingled roof with thickness and a little sag), a plank counter with Gus behind it facing the shelf, brass ore scales, bins of each ore, a rack with the four pickaxes for sale, a satchel hung up, lanterns, and a painted sign board (a pick and a gem). The layout's `gus`, `workstation`, `camp` and `campProps` moved, and Gus's front and colliders with them | the shelf clear from the arrival to the rope descent and the switchback (their walks straight); check-layout's walking times still met; Gus seen at his counter |
| R3.3 | **The stream and its falls.** The ribbon's width varying along it (0.6-1.3x) and its surface flowing (streaks along the current, white riffles over stones set in it). Wherever the channel drops, a fall instead of a tilted ribbon: a curtain leaving the lip, narrower and thicker, white-streaked, into a splash pool with a ring of foam and spray (the jungle's WaterfallSpray for every fall). Stepping stones at the fords | no folded strip anywhere; each fall reads as falling water |
| R3.4 | **The pools.** Rims grown, not rung: uneven in width and height round each pool (thin and scalloped on the downhill side, heavier upstream), cream to tan to ochre, a wet dark band at the waterline, running into the terrace's slope. The overflow a notch in the lowest rim, with a thin sheet of water down a flowstone curtain to the next pool; the stream entering the top pool and leaving the last through notches (the ribbon reaching into the pool's water). The seats' ledges travertine shelves under the water, never glassy cubes; the holes in the gour cliffs closed | a pool and its stream one water; no ring, no cube, no hole |
| R3.5 | **The Monolith's base and mystique.** A stepped dais of worn basalt (three uneven tiers, runes carved in their risers, moss in the cracks, the shaft set in a socket of packed rubble); a rune circle engraved in the islet's floor, glowing faintly and breathing with the shaft; a ring of five broken standing stones, one fallen; violet crystal breaking out of the ground round the dais; the seams ending at the shaft's foot. In the game: a few shards turning slowly round its crown, a mist collar at its foot, the skylight's shaft laid on it, a low hum near it (all of it stronger while it is awake). The raft's islet landing moved round the islet | a place, not a post; its collider and its mining spot as before (check-layout) |
| R3.6 | **The adit.** The portal set into the rock: rough-cut stone and the cliff sculpted round the timber set (no gap), the header without its floating block and a carved sign board over it, a second set further in, lagging along the walls. The bore going on about eight metres and bending out of sight, darkening, a lantern glimmering far inside. The rails running in, and outside to a buffer stop with a tipped ore cart and a spoil heap, a tool box and a rope coil by it, a pointer sign to the woods | an entrance you believe goes somewhere |
| R3.7 | **The ground and its borders.** The mud's plates thin (a few centimetres), curled at their edges, of every size, fewer, the colour of the ground with dust in their gaps; the cliffs' styles blended over a metre or two where two zones meet; the breakdown and the overlook a touch darker | no tiles, no seams |
| R3.8 | **The rest.** Docs (CLAUDE.md, this roadmap, the design doc), patch note 0.7.22, the full verification (both typechecks, check-layout, npm test, the build), before and after at 7 m, 16 m and on a phone | all green, every spot shown |

Built 2026-10-01 (patch 0.7.22):

| Step | Built |
|---|---|
| R3.1 | caveSurface's trail pass rewritten (a worn line meandering in the tread, patchy wear by the turns and ends, scuffs, bootprints, the ground drawn toward boot dirt, no lip; the look texture read as the ground under a trail); `build_trail_edges` leaves the rope descent's stakes and rope (an iron anchor pin and a coil at its top), survey stakes with ribbon at each trail's head and turns, chalk arrows, a cold fire ring off the pearl trail, a canteen and a map scrap; the stone lining and cairns gone |
| R3.2 | Gus's trading post at (-5.2, -20.5): the lean-to (ledger beam pinned to the rock, two posts on stone footings, knee braces, eight rows of lapped shingles), the counter, the scales, the ledger, the bins, the pickaxe rack, the crates, a satchel, rope, two lanterns, the sign up on the eave; Gus seen from the game's camera; the arrival's walks to the rope descent and the switchback straight (they were 16% longer) |
| R3.3 | `STREAM_REACHES` / `STREAM_FALLS` (shared, exported to the builder): three falls found (the mudflats' cliff, the chute into the top pool, the outflow); each a two-layer curtain into a splash, spray at each foot; three strips across with a pale thread of current, white riffles with stones, stepping stones at the four fords |
| R3.4 | the rims grown (six rings, heavy upstream, scalloped downhill, wet band, ochre outside, notches in and out), the overflow a sheet over a flowstone curtain, the ledges travertine shelves, the dams' banks cream in the floor shader |
| R3.5 | `build_monolith_dais` (three basalt tiers with glowing runes and moss, the socket's rubble, the rune circle, five menhirs one fallen, violet crystal), the seams starting over the socket, `MonolithAura` (seven shards round the crown, the mist collar, the circle breathing, the hum `setCaveDrone`), the raft landing on the islet's west |
| R3.6 | the adit's collar and shoulders, the carved board, a second set, lagging inside, the bore eight metres on and bending with a lantern round the bend, rails curving in and out to a stop block, the tipped ore tub, the spoil heap, the tool box and rope, the signpost to the woods |
| R3.7 | the mud's plates (seeds kept 58%: every size, a dark lip, curled 2-5 cm, the mud's own colour), `cliff_blend`, the breakdown's and the overlook's ground a shade darker |

How each step ships: its code, the model rebuilt once for the step (packed), check-layout and the
tests run, the spot shown before and after. R3.2 moves layout (the terrain data regenerated and the
walking times re-checked); the others change only the model and the shaders. The budgets hold: the
model under 2.4 MB (1.24 now), at most 110 draw calls (74-87 now).

## 8. Round 4 (the owner's report of 2026-10-01): walking without invisible walls

Walking the cave, players stopped against nothing. An audit steered from every open spot 16 ways with
the game's own slide step, attributed every snag, flooded the map from the arrival, and sent bots on
hundreds of click-to-move trips. What it found:

| Cause | Why | Fix (R4.1) |
|---|---|---|
| Stopping short of every bank | the mask shut ground at 20 degrees, the floor painted bare rock only from about 24-32 | `STEEPEST_WALK` 24 over half a metre; the floor paints exactly the cells the ground shuts (`caveMaskTexture`) |
| Little shut patches in open ground | each 25 cm cell judged at 20 degrees: the ground's bumps | a single step may be 30 (`STEEPEST_STEP`); islands of up to ten such cells opened |
| The body kept 0.3 m off the ground's edge | the mask tested with the body's radius | the ground tested with the feet's (`CAVE_FOOT` 0.18) |
| The stream's margin | shut 0.7 m from its middle, its water drawn 0.35-0.57 | shut only where its water is drawn |
| A steep ring round every pool | each pool sunk over a metre | sunk under its own water only |
| Floor you see and never reach | the terraces' west ledges walled in by their pools and dams (20 m2) | pools A and B trimmed, a dam eased; what still no one reaches shut and dressed with dry rimstone basins and stalagmites (`maskUnreached`, `build_unreached`) |
| Click-to-move stalling at a corner | a waypoint taken 0.2 m early, the next leg cutting into the corner | a waypoint taken only with the way on clear (`clearLine`) |

Before: 4.8% of steers snagged, 1.3% on nothing visible; 20 m2 of floor unreachable. After: 3.4%, each
one a cliff, a wall, the water, a rock or furniture, and painted or built so; every patch of floor
reached; click-to-move trips on every built map arrive, none stalled (`npm test`).

## 9. Round 5 (the owner's report of 2026-10-01): the water, the Hand, the winch

| Report | Cause | Fix |
|---|---|---|
| The Hound's Hand looks strange | five knuckled fingers on a column | `hound_hand` a giant stalagmite: a flowstone mound, a tapering trunk with drip streaks, a blunt top, two fused at its foot (R5.1) |
| Water running through rock and soil | curtains cutting into the slope under them; the chute into the top pool landing on dry ground; the overflows under the rimstone faces; the stream's mouth sunk under the lake | curtains kept over the ground; a fall near a pool carried into it; the cliff faces open over the overflows; the stream held at the lake's level, its mouth the lake's own water (R5.2) |
| The waterfall's basin | 14 cm deep: all shallows, pale and foamy; white foam tiles | sunk 0.75 m, mossy boulders round it, `foam_disc` (R5.2) |
| The water into and between the pools | straight canals, a splash on dry ground | the fall into the pool; wandering rivulets on a wet bed down notches in the dams (R5.2) |
| The winch only up | by design ("depth is progress") | both ways: `winch_top`, `winchdown`, `winchDownPose` (R5.3) |
| White spots drifting in the water | the water shader's painted glints; the spray's motes rising a metre and more | glints gone; a short puff at each splash (R5.2) |
| Dark stones in the pools | slope rubble scattered on the pools' steep bowls | rubble kept out of the water |

## 10. Round 6 (the owner's report of 2026-10-01)

| Report | Fix |
|---|---|
| Two ways down off the overlook's east side: keep the left | the rift ramp removed (the rift along the lake's shore or down the winch); its head dressed with stalagmites and a boulder (R6.1) |
| Finnegan on dry land; use folk and rocks from any side | Finnegan at the waterline, his front at his side; Finnegan, the anvil and every ore node used from any side (R6.2) |
| The plunge pool's outlet runs back into it | the pool's level fixed at the outlet's (`plunge.level`), a bank round it, the stream leaving at that level (R6.3) |
| The falls through the ground, broken where they land | each fall drawn as the stream's own strip, every vertex over the ground; the outflow carried on down the rim as the same strip (R6.4) |
| The weak spot round the back of the rock | rolled on the miner's side (`rollWeakSpot` `toward`), tested (R6.5) |
| Rocks lined along the map's edge | gone (R6.6) |
| Stones on the way to the Monolith | none; the causeway a hand's depth under the water, waded with a splash (R6.7) |
| Setting down lanterns | removed (R6.8) |
| The adit's gap | the bore squared to its timber, its mouth flared, the collar reaching the wall's own face (R6.9) |
| The Hound's Hand more natural | its own calcite (no rock strata painted over it), rimstone and stalagmites round its foot (R6.10) |

## 11. Round 7 (the proposals after Round 6, 2026-10-01)

| Step | Built |
|---|---|
| R7.1 | The look of the rock: the terraces' gour cliffs in travertine (no Great Wall shadow, a pale lip); the mud plates orange, cracked darker, fewer; the breakdown's slabs in two sheared layers with a coal seam; the lake's menhirs spindle-shaped; the Hand's bosses cream |
| R7.2 | The empty stretches: tents and sacks at the basecamp, nine dry rimstone pools and flowstone mounds on the overlook, a sign at the winch's top |
| R7.3 | The water: streaks down every fall in the water shader; every fall's roar by distance and height |
| R7.4 | Wading: `WADE_PACE` 0.82 through water, `WadeRipples` round the wader, the codex's `wonder_wade` for the causeway (34 entries) |
| R7.5 | The lanterns' last trace, the room's `caveLanterns` field, removed |

## 12. Round 8 (the owner's report of 2026-10-01)

| Report | Fix |
|---|---|
| The basecamp's tents float | moved off the shelf's rim to the overlook's hearth (R8.1) |
| The Hound's Hand has egg-like lumps on it | the bosses removed, its lumps gentler, its colour the overlook's own; the hearth made an explorers' rest (two tents, sacks, a bedroll, a lantern post) (R8.2) |
| A small pool floating at a fall's foot | gone: the stream itself widens into churned water there (R8.3) |
| The plunge pool and its stream disjointed; no splash | the stream leaves from under the pool's own water at its level and colour, the pool flat inside its bank; drops thrown in arcs and rings spreading at every fall (R8.4) |
| Water into the pools blocked by their rims | the stream meets pool A at its level; the overflows run in grooves cut in the terrain (`POOL_OVERFLOWS`); no rim where the water crosses (R8.5) |
| Rocks past the map's edge | silver_5 and its host rock moved in from the south rim (R8.6) |
| An old wall by the lake's beach | the rift's mouth was a bank too steep to stand on, nothing drawn on it: eased into a walked beach (R8.7) |
| The winch floats, no animation | the cage's clock was module state set by drawing the rider (another module instance, or a stale entry, froze it): `CageClock` watches the room's riders itself (R8.8) |

## 13. Round 9 (the owner's report of 2026-10-01)

| Report | Fix |
|---|---|
| The rift's mouth still blocked | walked freely on the current mask (a server still running the old one shut it); verified by walking it (R9.1) |
| Riders pass through the gantry's timber at the top | a landing deck out from the ledge beside the cage; the rides walk it to and from a new upper stand (R9.2) |
| The Hand a draped sheet; a bedroll like a stick | the Hand faceted, in growth tiers; a quilted sleeping bag; a stew pot on a tripod over the hearth with its steam (R9.3) |
| The waterfall a flat sheet; a gap where the stream meets the lake | the waterfall an arcing two-sheet curtain; the stream run down to the lake's level and carried onto it in its colour, the lake carried up the mouth (R9.4) |
| (Survey) the terraces' unreachable ledges a field of rings | sparse gours, pebbles and stalagmites (R9.5) |

## 14. Round 10 (the owner's report of 2026-10-01)

| Report | Fix |
|---|---|
| Remove the stone pillar, move the camp in, dress it | the Hound's Hand removed; the Explorers' Rest built where it stood: hearth, benches, tents, sleeping bags, crates, barrels, lantern posts, woodpile, drying rack (R10.1) |
| The plunge pool and its stream not joined | a row set exactly on the pool's round edge; its bed rising to its outlet; its bank closed up to the stream (R10.2) |
| The fall reads as one level | each fall an arc off its lip hanging clear of the cliff, a stone either side of the lip (R10.3) |
| The pools' rims and channels look odd | rims dip smoothly under the water (no cut ends); the stream ends exactly on a pool's drawn edge (R10.4) |
| Step away from mining by clicking elsewhere or walking | a floor click well away from the rock, or a step with the keys (R10.5) |
| Mining more fun | Lucky Glint (a gold ring: a bonus ore on a Perfect), Clean Break (+25% on a Perfect breaking blow) (R10.6) |
| The winch's animation | riders walk the landing; the cage swings and settles; ratchet clicks and a knock (R10.7) |
