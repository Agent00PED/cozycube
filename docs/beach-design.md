# Sunset Beach: design (proposal)

Status: **proposal, not approved**. Nothing in this document is built.

Sunset Beach (`sunset_beach`) is registered and empty: a bare floor in the world list ("Beach Bar",
28 x 28, not built). The economy plan (docs/economy-plan.md section 3, decided 2026-10-01) makes it
the home of tiers 6 and 7 for all three crafts, with a sea cave at its far end. This document is the
map and the order to build it in. It is the largest piece of work so far: a new world, new resources
for three crafts, two tool tiers and a hidden map, so it is cut into six parts, each its own PR.

## What is already in the code

- The world entry (`shared/worlds/index.ts` `beach`), `MAP_HALF.sunset_beach` 14, no seats, props
  or colliders.
- From the beach the game had before its rebuilds, still wired: the beach ball (`shared/volleyball.ts`,
  the room's `ball`, `tickBall` while anyone is on the beach) and the blender (`DRINK_RECIPES`: Sunset
  Punch, Blue Lagoon, Berry Fizz, each a drink with an aura; `DRINK_REWARD`).
- Four saltwater fish (`shared/fishing.ts`: Sand Sardine, Sunset Clownfish, Prism Jellyfish, Abyssal
  Pearl Whale), the Fish Collection's locked Ocean page, `isGatheringMap` already counting the beach.
- From the campfire and the woods: `shared/terrain.ts`, the builders' heightfield ground, `lift`
  and `fuse`, `riverWater.ts`, `FallsSpray.tsx`, the terrain checks.
- From the caverns: wading (`WADE_PACE`, rings round the wader), shore fishing from anywhere along
  a waterline (`shoreCast`), prospecting, the codex.

## What the economy plan already fixed

| | T6 Tidewater | T7 Deep Tide |
|---|---|---|
| Income target, coins a minute | 250 | 300 |
| Rod / axe | 34,000 | 100,000 |
| Pickaxe | 75,000 | 180,000 |
| Made of | coins and materials from all three crafts | rare drops (Titan Heartwood, Prismatic Scale, Core Fragment, Star Shard, pearls) and coins |
| Opens | the beach's trees, fish and fossil reef rock | the beach's top resources and the sea cave |

Gear ranks 6 and 7 (25% and 30%) are raised at the beach from beach materials and pearls.

## Rules the camera sets

1. The camera looks north-west from the south-east. The sea lies low in front (south and east), the
   sand rises away from it, and the cliff, the palms and the bar stand at the back (north and west).
2. Nothing walked is steeper than 24 degrees; the cliff is a wall you can see, with a collider.
3. Shallow water is waded, slower (the caverns' rule); deep water stops you.

## The map

**Size: 40 x 40 m** (the caverns are 45). About a third of it is sea.

**Ground:** one height function (`shared/terrain.ts`): the seabed from -1.2 m at the island's
south-east edge up through the waterline (0 m) and the beach to the dune line (+1.2 m), a headland
in the north-east (+2.5 m) and the cliff along the north-west (a wall, 4 m).

| Zone | Where | What stands there |
|---|---|---|
| The Boardwalk | west, the arrival | where you arrive from the world list; a plank walk down to the sand, a signpost |
| The Beach Bar | north-west, on the dune | a thatched bar with the blender (the three drinks and their auras), stools, loungers and parasols, string lights; the social heart, lit at dusk |
| The Sand Court | middle, on the flat sand | the beach ball and a net: the kick-about the old beach had |
| The Palm Grove | north, behind the dune | Coconut Palms (T6) round a glade, Mangrove Ironwoods (T7) at the lagoon's edge |
| The Pier and the Tide Flats | south, into the sea | a long pier for deep water; the flats beside it fished from the waterline anywhere (the cenote's shore casting); tide pools to forage (shells, sea glass) |
| The Reef Cliff | north-east, the headland's foot | fossil reef rock (T6 mining, the caverns' prospecting) in the cliff's face |
| The Trader's Wreck | east, at the headland | a beached boat hull turned shop: one keeper who buys everything the beach yields and stocks its storage; beside it the Shipwright's Bench, where T7 tools and the gear's ranks 6 and 7 are made |
| The Sandbar | far east, off the headland | bare at low tide: the way to the Sea Cave |

**The tide** (the idea that makes this map its own): the sea rises and falls 0.35 m on the camp's
clock, two tides a day (12 minutes each). It is the game's own water level, not a look: the waterline
moves up and down the sand, the tide pools and the flats' best fishing ground are out at low tide,
and the sandbar to the Sea Cave is walked dry only then (waded as it floods, never trapping anyone:
a body standing where it no longer fits is walked out, as on every map). A tide clock on the pier
and a pill under the header say what it is doing.

**The Sea Cave** (`sea_cave`, a hidden map of its own, as the caverns are to the woods): T7's home.
Pearl-bearing rock and salt crystal to mine, giant clams pried open for pearls, a deep pool for the
T7 fish, driftwood ironwood washed in. Entered across the sandbar at low tide; leaving is always
possible.

**Light:** the camp's 24-minute day, with the beach's own palette: a long golden sunset, a pink
dawn, a moonlit sea with a glitter path by night.

**Render cost:** at most 110 draw calls with one player; the model under 3 MB packed; palms and
fauna (gulls, crabs, a turtle) instanced.

## New things to gather

| Craft | T6 | T7 |
|---|---|---|
| Wood | Coconut Palm (logs; coconut husk as its by-product, coconuts for the blender) | Mangrove Ironwood (dense logs; sea-worn heartwood) |
| Fish | about twelve reef and surf fish, day and night, from the pier and the waterline | about eight deep-water fish from the pier's end and the Sea Cave's pool, with the Pearl Whale as the mythic |
| Mining | fossil reef rock in the cliff (reef stone, sea glass, fossils) | in the Sea Cave: pearl rock, salt crystal, giant clams (pearls: the gem of T7 jewellery) |

Prices and odds are set by the simulator against the 250 and 300 targets, as phases 1 and 2 of the
economy plan were. The beach's keeper pays full price for everything from the beach.

## Order of work (each a PR)

1. **The place:** the layout, the ground, the sea with its tide and wading, the bar and its drinks,
   the ball, seats, the sky. No economy. The world list opens it.
2. **Fishing:** the saltwater set, the pier and shore casting, the keeper's fish counter, the T6 rod
   and livewell, the Ocean page.
3. **Wood and stone:** the palms, the reef rock, the T6 axe, pickaxe and storage, the tide pools.
4. **T6 in the simulator:** prices and odds until every craft earns 250; the gear's rank 6.
5. **The Sea Cave:** the hidden map, T7's resources, the T7 tools, pearls and jewellery, the gear's
   rank 7; the simulator at 300.
6. **Dressing and life:** zone by zone; gulls, crabs, the turtle; the codex's beach pages; the
   lobby's and the trip screen's art.

## Decisions needed

1. **Who may visit:** open to everyone from the world list as a place to hang out, with its
   gathering locked behind T6 tools (recommended), or locked until a T6 tool is owned.
2. **The tide:** a real tide that moves the waterline and opens the sandbar (recommended; it is
   the most work in part 1), or a fixed sea with the cave open on a timer.
3. **Size:** 40 m (recommended), or 34 m like the woods.
4. **The Sea Cave:** a hidden map of its own (recommended), or a zone inside the beach.
5. **Keepers:** one trader for all three crafts plus the bar (recommended), or one keeper a craft
   as in the woods.
6. **The beach ball:** kept as the free kick-about it was (recommended), or made a scored
   volleyball game later.
7. **Where to start:** part 1 alone first, to see the place before any economy (recommended), or
   parts 1 and 2 together.
