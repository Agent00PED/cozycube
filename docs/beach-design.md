# Sunset Beach: design (approved)

Status: **approved by the owner on 2026-10-03.** Nothing in it is built yet. This document is the
brief for whoever builds it: what the beach, the open sea and the hidden cove are, how a player gets
from one to the next, and the order of work, each part its own PR. It replaces the proposal of
2026-10-02 (the moving tide, the sandbar and the Trader's Wreck are dropped).

## The owner's wishes, and the decisions taken

The owner asked for: **a beach bar; a pier; fishing from the pier; a captain at the pier who sells a
boat ticket to fish out at sea, a map of its own under the beach; and a cave that stays secret.**
Every open question was settled the recommended way:

| Question | Decision |
|---|---|
| How is the cave reached? | **By the captain's boat, once the player has found the way:** three torn pieces of a sea chart, reeled up in bottles at sea. Nobody mentions the cave before then: no sign, no menu item. |
| The ticket | **One ticket, one trip; stay as long as you like.** The captain takes you back whenever you ask. |
| Who may sail | **Anyone with a ticket** may ride along and look; **fishing at sea needs the T6 rod.** |
| AFK fishing at sea | **Not allowed** out there (and not in the cove): the best fish need a hand on the reel. AFK stays allowed on the pier. |
| Keepers | **One trader for everything the beach yields**, plus the bartender and the captain: three characters. |
| Who may visit the beach | **Everyone**, from the world list, as a place to hang out; its gathering needs T6 tools. |
| The tide | **No moving tide.** A calm sea with waves lapping at the shore (the most work in the old plan, and nothing needs it now). |
| Size | **40 x 40 m**, about a third of it sea. |
| The beach ball | **Kept** as the free kick-about it was (shared/volleyball.ts). |
| Where to start | **Part 1 alone**, the place with no economy, and a picture shown to the owner before the full model is built. |

## The owner's taste (from the camp maps: follow it here)

- **Plain and calm over decorated.** No set pieces unasked: no waterfalls, no springs, no bridges,
  no rock ledges round the island's rim, no steps or logs lying across where people walk.
- **No drawn trails and no worn patches** on the ground (they read as a park or a stain). One worn
  place round a fire is the exception the owner accepted at the campfire.
- **No rows** (of stones, posts, trees): clusters and natural spacing.
- **No empty areas, but nothing clumped.**
- **Every tree can be felled.** A tree a player walks up to and cannot cut reads as a fault; only a
  tree that holds something up (a hammock) may stand for good.
- **Only fellable kinds look fellable.**
- **Show a picture before building anything large**, judged from the game's own camera.
- **Don't guess at a vague "fix it again"**: ask what is wrong.

## The three maps

| Map (MapId) | How you get there | What it is for |
|---|---|---|
| **Sunset Beach** (`sunset_beach`, exists, unbuilt) | The world list, open to everyone | Hanging out (the bar, the sand, the ball), the pier's fishing, palms and reef rock (T6) |
| **The Open Sea** (`open_sea`, new, hidden from the list) | A ticket from the captain at the pier's end | Deep-sea fishing from the captain's boat (T6, the sea's own fish) |
| **The Hidden Cove** (`hidden_cove`, new, hidden from the list) | Only on the captain's boat, once the chart is whole | T7: the best fish and the cove's rock, pearls |

Both new maps go in `HIDDEN_MAPS` (shared/types.ts), like the woods and the caverns: never on the
fast-travel grid. A trip between them is the game's usual trip (`travel`, a loading screen dressed as
the destination: `WorldTransitionScreen` `THEMES`).

### 1. Sunset Beach

The camera looks north-west from the south-east: **the sea lies low in front (south and east), the
sand rises away from it, and the dune, the palms and the bar stand at the back (north and west).**
One height function (shared/terrain.ts, as the campfire's and the woods'): the seabed from about
-1.2 m at the south-east edges up through the waterline (0 m) and the beach to the dune (+1.0 m) and
a low headland in the north-east (+2.0 m). Nothing walked is steeper than 24 degrees.

| Place | Where | What is there |
|---|---|---|
| **The arrival** | west, on the sand below the dune | where a trip from the world list lands |
| **The Beach Bar** | north-west, on the dune | a thatched bar with the bartender and the blender (`DRINK_RECIPES`: Sunset Punch, Blue Lagoon, Berry Fizz, each with its aura; `DRINK_REWARD`), stools round it, string lights lit at dusk (tied to the bar's own posts, never a tree). The social heart. |
| **The sand** | the middle | loungers and parasols in loose groups, the beach ball (the room's `ball`, `tickBall`), towels; walk into the shallows and wade (the caverns' `WADE_PACE`, rings round the wader); deep water stops you |
| **The pier** | south, out into the sea | plank pier on piles; fishing spots along it and at its end (the beach's reef fish, T6); AFK allowed here |
| **The trader's fish shack** | at the pier's landward foot | the one keeper: buys everything the beach, the sea and the cove yield (fish, palm logs, reef stone, pearls), sells the T6 tools and storage, raises the gear's ranks 6 and 7 (a `ShopShell` counter like every other) |
| **The captain** | at the pier's end, his boat moored beside it | sells the ticket to sea (`[ ⛵ Sail to the Open Sea ]`); the same character skippers the boat on the Open Sea |
| **The Palm Grove** | north and east, behind the sand | Coconut Palms to fell (T6), spaced naturally, every one fellable |
| **The headland** | north-east | reef rock in its face to mine (T6, the caverns' prospecting) |

The sea: a calm, shallow-to-deep sheet with waves lapping at the sand and foam along the shore
(`riverWater.ts`'s ideas), the sun low and golden at dusk; the camp's 24-minute day with the beach's
own palette (a long golden sunset, a pink dawn, a moonlit sea with a glitter path by night).

### 2. The Open Sea (a map of its own under the beach)

- **The map is the captain's boat:** a sturdy fishing boat, about 10 m long, anchored in open water,
  the sea running to the horizon on every side, a few rock stacks far off.
- **One boat per lounge:** everyone who buys a ticket is aboard together (it is a map like any other:
  `PlayerState.map`).
- **Fishing from the rails:** six to eight spots along both sides and the stern. Hand-reeled only
  (no AFK), the T6 rod or better; the sea's own fish (bigger and rarer than the pier's, boss fights
  more common: `BOSS_TIERS`).
- **The captain at the wheel:** talk to him for `[ ⚓ Back to the pier ]` (any time, free), and, once
  the player's chart is whole, `[ 🗺️ To the hidden cove ]`.
- **The sea's living wonders** (the room's `worldEvent` pattern): a whale breaching, a pod of
  dolphins, a boiling school of fish (the sea's King-Size Surge).
- **The ticket:** one trip, as long as you like; its price set with the simulator so that sea fishing
  net of the ticket lands on the T6 target. A player without a T6 rod may still buy one and ride
  along (the dock says why the line won't cast).

### 3. The Hidden Cove (the secret)

- **How it is found (no one tells you):**
  1. Fishing **by hand on the Open Sea**, a catch now and then comes up as **a bottle with a torn
     piece of an old sea chart** in place of a fish (a toast and a small reveal; never on the pier).
  2. There are **three pieces**, each found once per player (the camp profile keeps them: e.g.
     `chart: number[]`); the chance is tuned so the chart takes a few hours of sea fishing.
  3. With **all three**, talking to the captain at sea he recognises the chart ("I know that cove...")
     and from then on every trip offers `[ 🗺️ To the hidden cove ]`, for good (e.g. `coveAccess`).
  4. Nothing before that hints at a cove: no sign, no dock label, no codex entry visible, no menu
     line. The pieces themselves may be shown in a drawer as "a torn sea chart (1/3)".
- **The place:** a sea cave behind the rock stacks, the boat drifting in under its arch; inside, a
  small beach of pale sand, a deep pool, the cave's rock glittering with salt and pearl.
- **What is there (T7):** the deepest fish from the boat and the pool (the Abyssal Pearl Whale the
  mythic: it already exists in shared/fishing.ts), pearl-bearing rock and salt crystal to mine,
  giant clams pried open for pearls (the T7 jewellery gem), driftwood ironwood.
- **Leaving:** the captain takes you back to the Open Sea or straight to the pier.
- **Later, optionally:** an old diver on the beach who mentions "bottles that wash up from the sea",
  as a hint, never as the way in.

## Economy (fixed by docs/economy-plan.md section 3; prices set by the simulator)

| | T6 Tidewater (the beach and the sea) | T7 Deep Tide (the cove) |
|---|---|---|
| Income target, coins a minute | 250 | 300 |
| Rod / axe | 34,000 | 100,000 |
| Pickaxe | 75,000 | 180,000 |
| Made of | coins and materials from all three crafts | rare drops (Titan Heartwood, Prismatic Scale, Core Fragment, Star Shard, pearls) and coins |
| Opens | the pier's and the sea's fish, Coconut Palms, reef rock | the cove's fish, rock, clams and ironwood |

- **The gathering:** Coconut Palms (T6 wood: logs, coconut husk as by-product, coconuts for the
  blender); about twelve reef and surf fish (pier) and about eight deep-water fish (sea and cove);
  reef rock (reef stone, sea glass, fossils); in the cove pearl rock, salt crystal, giant clams.
- **The keeper pays full price** for everything from the beach, the sea and the cove.
- **The gear's ranks 6 and 7** (25% and 30%) are raised at the trader's, from beach materials and
  pearls. Run `npm run economy-sim -- --gear` for every new tier; `npm test` holds the budgets.
- **The sea ticket** is a coin sink; the simulator's angler at sea pays it per trip.

## What already exists in the code

- The world entry (shared/worlds/index.ts `beach`: "Beach Bar", 28 m, `built: false`),
  `MAP_HALF.sunset_beach` 14 (make it 20), no seats, props or colliders (shared/collision.ts).
- `isGatheringMap` already counts `sunset_beach` (and compares against an `"ocean"` that is no MapId:
  replace it with `open_sea` and add `hidden_cove`).
- The beach ball (shared/volleyball.ts, the room's `ball`, `tickBall` while anyone is on the beach)
  and the blender (shared/types.ts `DRINK_RECIPES`, `DRINK_REWARD`; handled in HangoutRoom).
- Saltwater fish in shared/fishing.ts (`water: "saltwater"`: Sand Sardine, Sunset Clownfish, Prism
  Jellyfish, Abyssal Pearl Whale) and the Fish Collection's locked Ocean page.
- From the camp maps: shared/terrain.ts, the builders' heightfield ground, `lift` and `fuse`,
  scripts/blender/nature_kit.py (painted shade, conifer shapes, bushes, grass clumps, frogs, lily
  pads), `FellableTrees` with wild trees (`look`, `size`, `tone`), `CampXray` (the x-ray silhouette
  only while hidden), `campLife.tsx` (cloud shadows, rise rings, mist, moths), `riverWater.ts`.
- From the caverns: wading, shore fishing from a waterline (`shoreCast`), prospecting, the codex, a
  map's own loading screen.

## How to build (the project's own way)

- **Blender only through the Live Bridge on port 8192** (the window with `models/master_world.blend`;
  check with `curl http://127.0.0.1:8192/`). Never the MCP Blender tools on port 9876: they reach
  the owner's other project. A builder runs in its own namespace with `REPO_ROOT` and `REPORT_PATH`
  and writes a report (see scripts/blender/live_bridge.py and how build_forest.py is run).
- A new builder `scripts/blender/build_beach.py` on nature_kit (and later `build_sea.py`,
  `build_cove.py`, or one builder for the three); characters on the staff's clay kit
  (`build_cavern_folk.py`'s way); the studio's grid gets a free slot (Beach at x = 270).
- A new template name must be new across the whole master file (`Fauna_Beach*`), or Blender
  renames it and the game never finds it.
- `npm run pack-models` after the builder; the model under 3 MB packed; **at most 110 draw calls**
  with one player and the whole map in view (measure in the browser harness).
- Layout as plain JSON between markers in `shared/worlds/beach.ts` (read as-is by the builder), its
  terrain grid written by an `npm run beach-terrain` script, and `check-layout` taught the beach
  (walkability, reachable approaches, level ground under what is built).
- Before each commit: `cd client && npx tsc --noEmit -p .`, `cd server && npx tsc --noEmit -p .`,
  `npm run check-layout`, `npm test`, `npm run build`. Stage with `git add -A -- . ':!.claude'`,
  scan the staged diff for secrets. Commit, push and open a PR as each part is done; **merge only
  when the owner says so.** All communication in English.
- Look at every part in the game (the browser harness: memory note "Browser test harness"), by day
  and by night, before reporting it done; say plainly what was not checked.

## Order of work (each its own PR, shown to the owner before the next)

1. **The beach as a place.** The layout and ground, the sea and its shore, wading, the bar with the
   bartender and the drinks, the pier (fishing spots not yet live), loungers and parasols, the beach
   ball, the sky and light, a loading screen. No economy. The world list opens it (`built: true`).
   A rough picture of the layout to the owner first.
2. **Pier fishing and the trader.** The beach's reef fish (with the four that exist), the pier's
   spots, the trader's shack and counter, the T6 rod and livewell, the Ocean page.
3. **The Open Sea.** The new map, the boat, the captain on both maps, the ticket, hand-reeled sea
   fishing, the sea's fish, the trip both ways, the sea's wonders.
4. **Palms and reef rock.** Coconut Palms (fellable, T6), the headland's reef rock (prospecting),
   the T6 axe, pickaxe and storage; the simulator tuned to 250 for every craft; the gear's rank 6.
5. **The Hidden Cove.** The chart's three bottles at sea, the captain's new line, the cove map and
   its T7 resources, the T7 tools, pearls and jewellery, the gear's rank 7; the simulator at 300.
6. **Dressing and life.** Gulls, crabs, a turtle, dolphins; the beach's sounds (waves, gulls, the
   bar's music at dusk); the patch notes; the lobby's and the trip screen's art.
