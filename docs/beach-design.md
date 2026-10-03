# Sunset Beach: design (revision 2)

Status: **revision 2, 2026-10-03.** The owner gave a free hand over the design ("the map, its size
and everything else are yours to decide") and named what must be there:

1. **a beach bar with a bartender minigame;**
2. **a pier** where a player fishes, or **buys a ticket to fish out at sea;**
3. **a secret cave;**
4. the sea trip and the cave are **maps of their own** under the beach.

Nothing is built yet. This document is the brief for whoever builds it. It replaces the plan approved
earlier the same day; section "What changed from revision 1" lists every difference and why.

## The owner's taste (from the camp maps: follow it here)

- **Plain and calm over decorated.** No set pieces unasked: no waterfalls, no springs, no bridges,
  no rock ledges round the island's rim, no steps or logs lying across where people walk.
- **No drawn trails and no worn patches** on the ground. One worn place round a fire is the
  exception the owner accepted at the campfire.
- **No rows** (of stones, posts, trees, loungers): clusters and natural spacing.
- **No empty areas, but nothing clumped.**
- **Every tree can be felled.** Only a tree that holds something up (a hammock) may stand for good.
- **Only fellable kinds look fellable.**
- **Show a picture before building anything large**, judged from the game's own camera.
- **Don't guess at a vague "fix it again"**: ask what is wrong.

## The three maps

| Map (MapId) | How you get there | What it is for |
|---|---|---|
| **Sunset Beach** (`sunset_beach`, exists, unbuilt) | The world list, open to everyone | The bar and its minigame, the sand, the ball, the pier's fishing, palms and reef rock |
| **The Open Sea** (`open_sea`, new, hidden) | A ticket from the captain at the pier's end | Deep-sea fishing from the captain's boat |
| **The Hidden Cove** (`hidden_cove`, new, hidden) | Only on the captain's boat, once the chart is whole | The end of the line: the best fish, pearls, the last tools |

Both new maps go in `HIDDEN_MAPS`. A trip between them is the game's usual trip (`travel`, a loading
screen dressed as the destination).

## 1. Sunset Beach (36 x 36 m)

36 m, not 40: a hang-out map should be crossed in a breath. **Every place is within a 10 s walk of
the bar** (`check-layout` holds it, as it holds the campfire's hearth).

The camera looks north-west from the south-east, so **the sea lies low in front (south and east), the
sand rises away from it, and the dune, the bar and the palms stand at the back.** Nothing tall stands
between a player and the camera.

```
            N
   +--------------------------------------+
   |  palms   palms      palms   HEADLAND |   +2.0 m  reef rock in its south face
   |    BAR (dune, +1.0)    palms  ~~rock~|
   |   stools  firepit                    |
   | ARRIVAL      loungers    hammocks    |   the sand, +0.3 .. +0.8
   |        BALL (flat sand)   loungers   |
   |  trader's shack                      |
   |  ====PIER=========>  captain, boat   |   waterline 0 m
   |   shallows (waded)        shallows   |   -0.4
   |        deep water (stops you)        |   -1.2
   +--------------------------------------+
            S   (camera: from the south-east)
```

One height function (shared/terrain.ts, as the camp maps'): the seabed from -1.2 m up through the
waterline (0 m) and the sand to the dune (+1.0 m) and the headland (+2.0 m). Nothing walked is
steeper than 24 degrees. **Deep water is shut by depth**, not by boxes: `isBlocked` refuses ground
under -0.45 m on this map (a new rule; the camp maps have only boxes), and the shallows are waded
(the caverns' `WADE_PACE`, `WadeRipples`).

| Place | What is there |
|---|---|
| **The arrival** | West, on the sand just below the bar: the first thing seen is the bar, lit. |
| **The Beach Bar** | On the dune: a round thatched bar, open on every side, eight stools, three places behind the counter for players on shift, the bartender. String lights on the bar's own posts. The social heart: see section 2. |
| **The firepit** | Beside the bar, on the sand: a ring of stones, four driftwood log seats (the one worn place). Lit at dusk; a marshmallow in hand on a log, as at the campfire. No fuel to watch. |
| **The sand** | Loungers and parasols in loose groups of two and three, two hammocks between three palms (the only palms never felled), towels. |
| **The ball** | A flat stretch of sand in the middle, no net: the free kick-about (`shared/volleyball.ts`; its old flat court and `SHORELINE_Z` re-authored to this stretch, the ball kept on it). |
| **The pier** | From the west shore out south-east into deep water, 14 m of planks on piles, walked at the deck's height. Fished from anywhere along its edge. |
| **The trader's shack** | At the pier's landward foot: the one keeper. |
| **The captain** | At the pier's end, his boat moored beside it. |
| **The Palm Grove** | Along the back and the east, 3 to 4 m apart, no rows: about eighteen Coconut Palms. |
| **The headland** | North-east: fossil reef rock in its south face (it faces the camera), six nodes. |

The sea: one calm sheet, shallow turquoise to deep blue, waves lapping and foam along the shore
(`riverWater.ts`'s data-in-vertex-colours way: metres from the shore). The camp's 24-minute day with
the beach's own palette, **the golden hour stretched** (dusk eased over three minutes, not one): a
pink dawn, a long amber sunset, a moonlit sea with a glitter path.

### The characters (three, the staff's clay kit, one draw call each)

| Who | Where | What they do |
|---|---|---|
| **Mango**, a toucan bartender | behind the bar | serves a drink for coins when no player is on shift; hands out the order tickets; teaches the minigame |
| **Dune**, an old sea turtle trader | the shack | buys everything the beach, the sea and the cove yield at full price; sells bait and the T6 storage; makes the Tidewater tools (section 5) |
| **Captain Brine**, a walrus | the pier's end; at the wheel on the Open Sea and in the cove | the ticket, the trips, the chart |

## 2. The bartender minigame: "A Shift at the Bar"

The blender that exists today is a recipe picked from a list for 6 coins. It is replaced.

**Taking a shift.** Step behind the bar (`[ 🍹 Take a shift ]`, three places). An **order ticket**
comes up: a player seated on a stool who asked for a drink first, else one of the bar's regulars
(ordered by Mango). The drink is made **at the bar itself**, the camera closing on it and a sheet at
the foot of the screen (`WorkSheet`, the forge's and the anvil's way), in three short stages, 15 to
20 seconds in all:

| Stage | What you do | Judged |
|---|---|---|
| **Build** | The ticket shows the recipe for 2 s, then hides. Tap its three or four ingredients in order from the shelf of eight (mango, lime, coconut, mint, berry, pineapple, ice, soda). | right things, right order |
| **Pour** | Hold to pour; the glass fills. Let go inside the band at the line (the band narrower for the finer drinks). | how near the line |
| **Shake** | Tap on four beats as a ring closes onto the shaker (the forge's hammer ring, `HAMMER_WINDOW_S`'s way). | beats landed |

Graded in stars (`GradeStars`): **Perfect** (3), **Good** (2), **Sloppy** (1). The server deals the
ticket and its seed and judges the log on its own clock, as it does the forge (`judgeForge`): never
faster than the clock allows.

**Eight drinks**, in three bands by how hard they are (the pour's band and the shake's tempo):
Sunset Punch, Blue Lagoon, Berry Fizz (the three that exist), Coconut Cooler, Mint Breeze, Pineapple
Spark, Tidewater Tonic, and the Midnight Pearl (listed only after the cove is found).

**What a drink does.**
- It is **served**: set on the counter in front of the stool that ordered it; the drinker picks it
  up, holds it, and wears its aura (the existing `aura`), for 10 minutes.
- A Good or Perfect drink also gives **Refreshed**: +10% walking pace for 10 minutes (it does not
  stack with the S'more's +15%; the stronger counts). One buff, and it earns nothing directly: the
  gear's budget is untouched.
- A Perfect drink is served with a garnish and a sparkle for everyone to see.

**What a shift pays.** Tips: 2 / 4 / 6 coins a drink by its stars from a regular, and whatever a
player paid Mango's price (8 coins) when a player ordered: the bartender gets 6 of it. **At most 30
tipped drinks an hour by account** (the slingshot's paid rounds' way), then drinks are made for the
fun of it. That is at most about 240 coins an hour, under a fifth of a starter's hour, so the bar is
never the best way to earn (`npm test` holds it). Coconuts from felled palms can be given to Mango for a free order.

**The Bar Book** (the bartender's ledger, in the camp profile): each drink's count and best grade, a
streak of Perfects, and three gold titles (one a band; all eight Perfect: "Master Mixologist").

**With nobody on shift**, Mango serves: 8 coins a drink, a Good one, at once. The bar always works.

## 3. The pier

- **Fished from anywhere along its edge** (`shoreCast`'s way: within reach of the edge and facing
  the water), by hand or AFK.
- **Any rod fishes it; the rod decides what the salt water gives up** (the owner's call,
  2026-10-03; it holds for all salt water, the rule checked by `rodLands`):

  | Rod | Lands |
  |---|---|
  | T1 to T3 | Common |
  | T4 | Common, Uncommon |
  | T5 | Common, Uncommon, Rare |
  | T6 Tidewater | and Epic, Legendary |
  | T7 Deep Tide | and Mythic |

  **The odds belong to the water and the rod together** (the owner's call, 2026-10-03): the same
  rod finds fewer fine fish in richer water, because that water's fish are worth more. That is
  built for the three fresh waters (shared/economy.ts `WATER_ODDS[water][rod tier]`: the campfire,
  the woods, the cenote, each tuned to its income by the simulator). **Salt water adds rows of its
  own**, starting here (percent; the simulator sets the final ones):

  | Hand-reeled | Common | Uncommon | Rare | Epic | Legendary | Mythic |
  |---|---|---|---|---|---|---|
  | Campfire, T5 (built, for comparison) | 38 | 38 | 24 | | | |
  | Woods, T5 (built) | 42 | 35 | 19 | | 3.5 | 0.5 |
  | Cenote, T5 (built; Epic inside its Rare) | 50 | 32.7 | 14 | | 2.8 | 0.5 |
  | Pier, T1 to T3 | 100 | | | | | |
  | Pier, T4 | 80 | 20 | | | | |
  | Pier, T5 | 65 | 27 | 8 | | | |
  | Pier, T6 | 50 | 30 | 12 | 5 | 3 | |
  | Pier, T7 | 42 | 30 | 14 | 8 | 5 | 1 |
  | Open Sea, T5 | 55 | 32 | 13 | | | |
  | Open Sea, T6 | 42 | 32 | 15 | 7 | 4 | |
  | Open Sea, T7 | 35 | 30 | 16 | 10 | 7.5 | 1.5 |
  | Hidden Cove, T5 | 50 | 34 | 16 | | | |
  | Hidden Cove, T6 | 36 | 32 | 17 | 9 | 6 | |
  | Hidden Cove, T7 | 28 | 30 | 18 | 12 | 9 | 3 |

  **The Tidewater and Deep Tide rods on the fresh waters** (rows 6 and 7 of `WATER_ODDS`, in the
  code since part 0; no such rod exists yet, so nothing reads them). Starting figures, each
  a clear step over T5 and still far under what the same rod earns in salt water:

  | Hand-reeled | Common | Uncommon | Rare | Legendary | Mythic | About, a minute |
  |---|---|---|---|---|---|---|
  | Campfire, T6 | 32 | 40 | 28 | | | 68 |
  | Campfire, T7 | 28 | 40 | 32 | | | 73 |
  | Woods, T6 | 36 | 35 | 23 | 5 | 1 | 125 |
  | Woods, T7 | 31 | 34 | 26 | 7.5 | 1.5 | 150 |
  | Cenote, T6 | 45 | 33 | 17 | 4 | 1 | 215 |
  | Cenote, T7 | 41 | 33 | 19.5 | 5.5 | 1 | 240 |

  (The incomes are worked by hand from the T5 lines; the simulator sets them when the rods are made. The rule
  they must keep: a T6 rod earns less in any fresh water than at sea, 250, and a T7 rod less than in
  the cove, 300.)

  Each water further out is a little kinder than the last on the same rod, so the trip is worth
  its ticket. Epic is the cenote's display grade on the rarest of the rare fish (`gradeOf`); in
  salt water those kinds are gated with the legendaries. AFK rows (the pier only) follow the same
  shape, a step poorer, never a mythic.
- The prices are set so that **a rod of T1 to T5 earns about what it earns at its own best water**
  (not less, so the pier is worth a visit; not more, so the river and the cenote keep their place),
  and the simulator's rule "a better tool never earns less at its best spot" still holds. So a new
  player fishes beside a veteran, and every rod up brings something new to the hook.
- With the Tidewater rod the pier earns **about three quarters of the Open Sea**; an AFK line a
  quarter of the hand-reeled figure, as everywhere.
- Twelve reef and surf fish (six by day, six by night; the four saltwater fish that exist are
  re-priced with them: their values are from before the rebalance).

## 4. The Open Sea (`open_sea`)

- **The map is the captain's boat:** a sturdy wooden fishing boat, 12 m long, anchored. **Its deck
  never moves** (seats, colliders and casts stay simple); the swell, the horizon and a few far rock
  stacks move round it. The cheapest map in the game to draw: one model, one sea.
- **One boat per lounge;** everyone with a ticket is aboard together.
- **Fished from anywhere along the rails** (not fixed spots: a lounge holds fifteen). Hand-reeled
  only, **the Expedition rod (T5) or better**; eight deep-water fish, bosses more common. The salt
  water's ladder holds here as on the pier: a T5 rod lands nothing above Rare, T6 the Epic and
  Legendary, T7 the Mythic. A T5 rod at sea, net of the ticket, earns about what it does at the
  cenote (its best water today): the trip is for the new fish and the chart, and T6 is the step up.
  The chart's bottles come up for any rod that may cast here, so a T5 angler can find the cove.
- **Riders are welcome:** benches along the cabin, a bow seat, the wonders to watch. Without the
  rod, the dock says why the line won't cast.
- **The wonders** (the room's `worldEvent` pattern, the sea's own): a whale breaching, a pod of
  dolphins alongside, and a boiling school of fish (the sea's King-Size Surge).
- **Captain Brine at the wheel:** `[ ⚓ Back to the pier ]` any time, free.

**The ticket: 150 coins** (a starting figure; the simulator sets it, with a 40-minute trip assumed).
- Spent as you step aboard. **You are "at sea" until you stand on the pier again** (the camp profile
  keeps it): a dropped connection, a soft restart or a change of lounge puts you back on the boat,
  not on the pier with a ticket gone.
- Leaving by the world list ends the trip.
- The social drawer and the world list's head counts show the Open Sea **and the cove** alike as
  "At sea".

## 5. The Hidden Cove (`hidden_cove`)

**How it is found (no one tells you).**
1. Fishing by hand on the Open Sea, a catch now and then comes up as **a bottle with a torn piece of
   a sea chart** (a toast and a small reveal). Never on the pier, never on an AFK line.
2. Three pieces, each once per player (`chart` in the camp profile). **The chance climbs with every
   catch that brings none** and a piece is certain by the sixtieth: about an hour a piece for a
   steady hand, never ten for an unlucky one.
3. With all three, the captain at sea recognises the chart, and every trip from then on offers
   `[ 🗺️ To the hidden cove ]`, for good (`coveAccess`).

**Keeping it secret** (each of these would have named it):
- the social drawer and head counts say "At sea";
- Dune lists pearls, salt and ironwood on his Trade tab **only for a player with `coveAccess`**;
- the Deep Tide tools are made **in the cove**, so their recipes are seen only there;
- the Fish Collection's Ocean page shows the cove's fish as "???" until one is landed;
- nothing is shouted to the room from the cove; the patch notes say only "something waits at sea".

**The place** (24 x 24 m): a sea cave behind the rock stacks, the boat lying in under its arch on
still, glowing water; a crescent of pale sand, a deep pool, a skylight. Lit as the caverns are
(their lights and height mist).

**What is there.**
- **Giant clams**, pried open at the dock with no tool tier at all (the geode chisel's game, a
  blade in place of the mallet): **pearls.** This is how the last tier begins.
- **The shipwright's bench**, left in the cave: the Deep Tide tools are made here.
- The deepest fish, from the boat and the pool (the Abyssal Pearl Whale, made the mythic it was
  meant to be: it is `legendary` in the code today); pearl rock and salt crystal; ironwood driftwood
  along the sand, growing back as the tide brings more.
- Hand-reeled only. The captain takes you back to the sea or straight to the pier.

## 6. Economy

**The ladder stays convergent** (docs/economy-plan.md section 4): every craft earns about **250** a
minute at Tidewater and **300** at Deep Tide. For a miner that is the ore ladder's usual step
(210 to 250). For an angler or a woodcutter it is a leap (95 to 250), so their tools are priced by
what they truly earn before it, not by 95:

| Starting prices | Rod | Axe | Pickaxe | Made |
|---|---|---|---|---|
| **T6 Tidewater** (360 minutes of the step before) | 58,000 | 45,000 | 75,000 | at Dune's shack: coins and makings from all three crafts as they exist today (ingots, Golden Leaf Amber, Fine Fish Bones) |
| **T7 Deep Tide** (600 / 720 minutes) | 150,000 | 150,000 | 180,000 | at the cove's bench: coins, pearls and the rare drops (Titan Heartwood, Prismatic Scale, Core Fragment, Star Shard) |

(Revision 1 had 34,000 and 100,000 for the rod and the axe: a T6 rod would have paid for itself in
under four hours where a T6 pickaxe takes thirty.) Storage at half its tool, as always. Both tiers
are **made, never sold** (`FORGED_TOOLS`, `makingsMissing` / `spendMakings`), as T5 is.

- **What each tier opens:** T5 casting on the Open Sea (up to Rare); T6 the salt water's epic and
  legendary fish, the palms, the reef rock; T7 the mythic fish, the cove's pearl rock and ironwood.
- **The gathering:** Coconut Palms (T6: logs, coconut husk the by-product, a coconut now and then
  for the bar); reef rock (reef stone, sea glass, a fossil for the codex); pearls, salt crystal,
  ironwood.
- **Dune pays full price** for everything from the three maps.
- **The gear stays at rank 5.** Ranks 6 and 7 are dropped: a rank-5 set already sits at the tested
  cap (25% against `GEAR_BUDGET`'s 26%), so a stronger rank would break the budget every tier is
  balanced on. The beach's rewards are its tiers, its titles and what follows:
  - **pearl jewellery** to make and sell at the cove's bench (the forge's wares' way, about a fifth
    over its makings);
  - **a Pearl-set ring band** at the forge, at the Glimmer band's own 13% (a look and a second
    source, not more power);
  - **the map's own outfit** at Dune's (the Beachcomber's Shirt & Shorts, a look with no stats, as
    Bramble's and Gus's).
- **The sea ticket** is a small coin sink; the simulator's angler at sea pays it every 40 minutes.
- Every palm, node and collider is placed **with the simulator open** (`ONLY=wood` / `ONLY=ore`
  `npm run economy-sim -- --gear`): on the camp maps a tree moved a metre moved a tier's income.

## 7. What already exists in the code, and what is in the way

- The world entry (shared/worlds/index.ts `beach`, 28 m, `built: false`), `MAP_HALF.sunset_beach` 14
  (make it 18), no seats, props or colliders.
- `isGatheringMap` counts `sunset_beach` and an `"ocean"` that is no MapId: replace it with
  `open_sea` and `hidden_cove`; teach `isFishingMap` the three.
- **An old fishing path** (HangoutRoom `MAP_WATER`, `FishingWater = "ocean" | "river"`, the "old
  boot") beside Fishing 2.0's `Water`: retire it before the pier fishes.
- The blender (shared/types.ts `DRINK_RECIPES`, `DRINK_REWARD` 6, `handleBlend`: a recipe picked, a
  cooldown, coins): replaced by section 2. `BlenderModal` goes.
- The ball (shared/volleyball.ts): **flat-ground physics with a fixed court and net**. Keep it on a
  flat stretch; drop the net.
- Saltwater fish in shared/fishing.ts (four, at old prices; the Pearl Whale `legendary`) and the
  Fish Collection's locked Ocean page.
- **The ladder is five tiers long everywhere:** `TARGETS`, `TOOL_MINUTES`, `STRENGTH`, the
  simulator's `[1, 2, 3, 4, 5]`, the odds and window tables indexed by rod tier.
- **Prospecting, wading and the close-up camera are the caverns' own** (`prospectCamera`,
  `cavernCam`, the walk mask): the reef rock needs them on an isometric map. Not yet measured.
- From the camp maps: shared/terrain.ts, the builders' heightfield ground, `lift` and `fuse`,
  nature_kit (painted shade), `FellableTrees`, `CampXray`, `campLife.tsx`, `riverWater.ts`.
- From the caverns: `shoreCast`, `WorkSheet`, the forge's judged log, the chisel's game, the codex,
  the lights and height mist.

## 8. How to build (the project's own way)

- **Blender only through the Live Bridge on port 8192** (the window with `models/master_world.blend`;
  check with `curl http://127.0.0.1:8192/`). Never the MCP Blender tools on port 9876: they reach
  the owner's other project. A builder runs in its own namespace with `REPO_ROOT` and `REPORT_PATH`.
- Builders `build_beach.py` (on nature_kit), `build_sea.py`, `build_cove.py` (on the caverns' kit),
  `build_beach_folk.py` (the staff's clay kit). The studio's grid: Beach at x = 270.
- A new template name must be new across the whole master file (`Fauna_Beach*`).
- `npm run pack-models` after a builder; each model under 3 MB packed; **at most 110 draw calls** on
  the beach with one player and the whole map in view, 60 on the sea.
- Layout as plain JSON between markers in `shared/worlds/beach.ts`, `sea.ts`, `cove.ts`; the terrain
  grid by `npm run beach-terrain`; `check-layout` taught each (walkability, approaches, level ground
  under what is built, the 10 s walks, a cast onto open water from the pier and the rails).
- Before each commit: both `tsc` runs, `npm run check-layout`, `npm test`, `npm run build`. Stage
  with `git add -A -- . ':!.claude'`, scan the staged diff. A PR as each part is done; **merge only
  when the owner says so.** All communication in English.
- Look at every part in the game (the browser harness), by day and by night, before reporting it
  done; say plainly what was not checked.

## 9. Order of work (each its own PR, shown to the owner before the next)

0. **The ground cleared (done).** No change a player sees: `open_sea` and `hidden_cove` registered
   (hidden, empty; `isBeachMap`); the old fishing path retired (the server's `MAP_WATER`, the old
   boot, `FISH_TABLES`, the first reel's handlers and its panel in App.tsx: nothing could reach it);
   the tier lists read from the tools that exist (the simulator's `ROD_TIERS`, `AXE_TIERS`,
   `PICKAXE_TIERS`; `tierOdds` by its table's length); `WATER_ODDS` rows 6 and 7, and the targets
   and tool minutes for T6 and T7, in place for the tools to come. `npm test` pins the odds' shape.
1. **The beach as a place, and the bar (done, patch 0.8.0).** Built as written, with these changes
   made while building: the coast runs across the map's diagonal (so the sea is in front of the
   camera) and the map is an island with the sea all round; the bar is a horseshoe open to the back
   with a lean-to over its shelf (a full roof hid whoever stood under it from the camera); the
   firepit is lit from dusk; tips are capped at 30 drinks an hour, about 240 coins, which bounds the
   hour, not the minute; the palms are part of the model until part 3 (they are not yet fellable
   nodes); the beach's own sounds wait for part 7. A picture of the layout to the owner first. Then the
   ground, the sea, wading and the depth rule, the bar with Mango and **A Shift at the Bar**, the
   firepit, the pier (walked, not yet fished), loungers, hammocks, the ball, the sky, the loading
   screen. The palms stand as fellable nodes that ask for a Tidewater axe. The world list opens it.
2. **Pier fishing and Dune.** The twelve fish, the pier's casting, the shack and its counter, the
   Tidewater rod and livewell, the Ocean page.
3. **Palms.** Felling, the Tidewater axe and carrier, coconuts to the bar; the simulator at 250.
4. **The Open Sea.** The map, the boat, Captain Brine on both, the ticket and its rules, the eight
   fish, the wonders.
5. **Reef rock.** Prospecting brought to the beach, the Tidewater pickaxe and satchel.
6. **The Hidden Cove.** The chart, the secrecy rules, the map, the clams, the bench, the Deep Tide
   tools, pearls, jewellery and the ring band; the simulator at 300.
7. **Dressing and life.** Gulls, crabs, a turtle; the sounds (waves, gulls, the bar's music at
   dusk); the outfit; the patch notes; the lobby's and the trip screens' art.

## What changed from revision 1, and why

| Revision 1 | Now | Why |
|---|---|---|
| 40 x 40 m | 36 x 36 m, every place within 10 s of the bar | a hang-out map, not a hike |
| The existing blender | A Shift at the Bar: build, pour, shake; drinks served to players; tips capped | the owner asked for a bartender minigame; the blender is a list |
| The pier needs T6 | Any rod fishes it: T1-T3 common, T4 uncommon, T5 rare, T6 epic and legendary, T7 mythic, the odds climbing with the rod | the beach was empty for everyone below T6 (the owner's ladder) |
| Fixed fishing spots on the pier and the boat | Cast from anywhere along the edge or the rail | fifteen players, six spots |
| Ticket rules unstated | "At sea" until you stand on the pier again | a dropped connection must not eat a ticket |
| The chart by plain chance | The chance climbs; a piece certain by the sixtieth catch | no ten-hour bad luck |
| The cove secret in name only | Five secrecy rules | the social drawer, the trader and the recipes would have named it |
| T7 needs pearls, pearls need T7 | Clams need no tool tier | the tier could not be started |
| T6 rod and axe 34,000, T7 100,000 | 58,000 / 45,000 and 150,000 | priced by the rule every other tool follows |
| T6 "sold" by the trader and also "made" | Made at Dune's (T6) and at the cove's bench (T7) | one answer, and T7 stays secret |
| Gear ranks 6 and 7 at 25% and 30% | Dropped; jewellery, a ring band, an outfit | they break the tested gear budget |
| Palms unfellable until part 4 | Fellable nodes from part 1, the axe in part 3 | a tree that cannot be cut reads as a fault |
| A rocking boat implied | The deck still, the sea moving | seats and casts stay simple |
| Six parts | Part 0 and seven parts | the five-tier ladder and the old fishing path are work of their own |
| A diver's hint, later | Dropped | nothing hints |
