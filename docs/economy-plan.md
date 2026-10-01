# The economy and items, rebuilt: analysis and plan

Status: a proposal (2026-10-01). Nothing here is built. Every number marked "first pass" must be
confirmed by the income simulator (phase 0) before it ships.

## 1. The principle: a coin is a minute

Every price in the game is derived from one thing: how many coins a minute of active play earns at
a given step of progress. A tool costs "N minutes of the income you have just before it"; a fish, a
log or an ore is worth "the step's income times the seconds it takes to get one".

That gives three rules:

1. **Depth is progress.** Campfire < Whispering Woods < Glimmering Caverns, in what a minute earns,
   what the shops sell and what they can afford to buy.
2. **The three crafts pay about the same at the same step** (within 20%). Today they do not.
3. **Income grows slowly, prices grow fast.** Income rises about 1.4x a step; the next tool costs
   about 2.2x the last. Otherwise seven tiers inflate the coin until early content is worthless.

## 2. What a minute earns today (measured: phase 0, done 2026-10-01)

From the income simulator (`npm run economy-sim`, scripts/economy-sim.ts): a steady player, by hand,
alone, with the storage of the tool's tier and no accessories, bait or buffs, played for six
simulated hours a line over the game's own rules, tables and walk grid. `npm test` pins the table
(tests/economy-baseline.json).

Coins a minute at each craft's best spot, at an even market, and (in brackets) what one player who
sells everything in one room really gets once the market answers their own selling:

| Tool tier | River fishing | Cenote fishing | Woodcutting | Mining |
|---|---|---|---|---|
| T1 | 25 (25) | 56 (45) | 61 (43) | 167 (118) |
| T2 | 54 (54) | 95 (83) | 137 (98) | 299 (211) |
| T3 | 102 (102) | 184 (168) | 202 (146) | 545 (384) |
| T4 | 188 (188) | 293 (288) | 259 (190) | 526 (377) |
| T5 | 306 (306) | 421 (421) | 287 (221) | 539 (387) |

Minutes of play to afford the next tool, at the income of the tier before it:

| Step | Rods | Axes | Pickaxes |
|---|---|---|---|
| to T2 | 10 | 4 | 9 |
| to T3 | 16 | 6 | 15 |
| to T4 | 24 | 12 | 20 |
| to T5 | 32 | 23 | 48 |
| **whole ladder** | **1.4 h** | **0.8 h** | **1.5 h** |

What the measurement found:

1. **The crafts are far apart.** On starter tools a miner earns 6.7 times an angler, a woodcutter
   2.4 times.
2. **Mining pays three to four times what its own design notes say** (T1: 167 against "about 40").
   The notes assumed a Rusted Pickaxe mines copper and coal; in play it mines iron a tier up at 60%
   and comes out far ahead, and the Perfect run and the Clean Break add to every haul.
3. **The Lucky Glints pay a weak pickaxe most** (a fault of patch 0.7.29): a glint is rolled at every
   new weak spot, so a rock that takes many blows gives many glints. They add a third to a T1-T3
   pickaxe's income and nothing to a T5's, and a T3 pickaxe out-earns a T4 and a T5 (545 against 526
   and 539). To fix in phase 1: one glint a rock.
4. **Every tool is bought in minutes.** All of a craft's tools take an hour or so; the axes, 48
   minutes.
5. **A better axe earns nothing more at the campfire** (61 to 63): only pines grow there.
6. **The market bites wood and ore, not fish.** A lone woodcutter or miner loses about 28% to their
   own oversupply; an angler's catch is spread over thirty species and barely moves a price.
7. **The cenote pays 1.4 to 2.2 times the river** on the same rod, as designed.

What it means for the plan below: the first-pass prices of section 5 were worked from rougher
figures and are too gentle on ore. Phase 1 starts from this table.

## 3. Seven tiers

Decided (2026-10-01): T6 and T7 are real tiers that open new resources, on the next map, Sunset
Beach. All three crafts go there together.

| Tier | Name | Where from | What it opens |
|---|---|---|---|
| T1 | Starter | given | the campfire |
| T2 | Camp | campfire shops, coins | the campfire's better resources |
| T3-T4 | Woods | woods shops, coins | the woods' resources |
| T5 | Expedition | forged in the caverns: coins + ingots | the top resources of the woods and the caverns |
| T6 | Tidewater | forge or advanced bench: coins + materials from all three crafts | the beach: its trees, its fish, its fossil reef rock |
| T7 | Deep Tide | rare drops (Titan Heartwood, Prismatic Scale, Core Fragment, Star Shard, pearls) + a large coin cost | the beach's top resources and its sea cave |

**Mining at the beach** (no living coral is mined): fossil reef rock at the cliff foot for T6, and
a sea cave hidden at the beach's far end for T7 (pearl-bearing rock, salt crystal, giant clams pried
open for pearls), open at low tide on the camp's day-night clock. The sea cave is to the beach what
the Glimmering Caverns are to the woods: the hidden map at the end of the line. Pearls and sea
glass feed T7 rods, axes and jewellery, as ingots feed T5.

Until the beach is built, T6 and T7 are not sold: the ladder stops at T5.

## 4. The income ladder (the target)

Coins a minute, active, solo, even market. An AFK line earns a quarter of the active figure.

| Step | Where | Target |
|---|---|---|
| T1 | Campfire | 25 |
| T2 | Campfire | 35 |
| T3 | Woods | 50 |
| T4 | Woods | 70 |
| T5 | Woods' top resources (elderwood, legendaries) | 95 |
| Pickaxe T1 | Caverns, on arrival | 100 |
| Pickaxe T2 / T3 / T4 / T5 | Caverns | 120 / 145 / 175 / 210 |
| T6 (any craft) | its best spot | 250 |
| T7 (any craft) | its best spot | 300 |

T1 to T7 is 12x, where today T1 to T5 alone is 14x.

## 5. Base prices (final: phase 1, done 2026-10-01)

Method: prices and odds moved until the simulator's steady player, selling into their own
oversupply, earns each tier's target. Measured after the change (`npm run economy-sim`):

| As sold, a minute | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| River (target 25 / 35 / 50 / 70 / 95) | 25 | 38 | 52 | 77 | 103 |
| Wood (same target) | 22 | 36 | 55 | 79 | 109 |
| Ore (target 100 / 120 / 145 / 175 / 210) | 85 | 129 | 173 | 183 | 196 |
| Cenote (about 1.7x the river) | 42 | 60 | 91 | 127 | 178 |

Every tier is within 20% of its target and the river and the woods within 20% of each other; a
test holds it there (tests/economy-sim.test.ts).

**Wood:** Soft Pine 4 -> 2, Silver Birch 9 -> 3, Highland Cedar 20 -> 6, Autumn Maple 48 -> 18,
Whispering Elderwood 120 -> 100. The Colossals' logs 320 / 520 / 750 / 1,200 -> 110 / 160 / 300 /
500. Firewood 2 a bundle -> 1 for two bundles (a pine log split into three bundles used to sell for
more than the log). The felling itself is unchanged: cutting prices kept the game's feel.

**Fish:** common 4 and uncommon 18 kept; rare 70 -> 50, legendary 380-420 -> 210-230, mythic
1,500 -> 900. Rod odds (common / uncommon / rare / legendary / mythic, %): T1 85/15/0/0/0 (kept),
T2 72/25/3/0/0, T3 60/31/8.5/0.5/0, T4 48/35/15/1.8/0.2, T5 40/36/20/3.5/0.5. The rare fish are
rarer and still the event of an outing.

**Ore:** coal 3, copper 7, iron 12, silver 30 and the core 250 kept; glimmer 75 -> 60. Silver and
glimmer are made scarce instead of cheap: they grow back in 300 s and 600 s (were 75 s and
120 s), and their mastery ranks take fewer breaks to match. Geodes 75 / 140 -> 40 / 74 and the gems
40 / 90 / 210 / 650 -> 21 / 48 / 112 / 350 (the geode's fair value, as before). The Lucky Glint is
rolled once a rock (30%), so it no longer pays a weak pickaxe's many blows the most.

**Cave fish:** 8 / 9 / 30 / 36 / 70 / 86 / 150 / 185 / 320 / 390 / 1,250.

**Furniture:** 1.5x its makings at the new prices: stool 28, keepsake box 80, rocking chair 230,
the clock 950 (kept).

**What players held:** profile v5 pays the difference between the old price and the new on every
log, fish, shard, geode, gem, Firewood bundle and piece of furniture held on the day, in coins on
the next join. Tool prices are not touched in this phase (phase 2): at today's prices the whole rod
ladder costs 2.6 h of play, the axes 2.0 h, the pickaxes 3.0 h.

Still open after phase 1, for phase 2: a T1 pickaxe and a T1 axe sit 14-15% under their step and a
T3 pickaxe 19% over; the campfire's pines give a better axe nothing (birch at the campfire).

## 6. Tools and storage: the ladder (T2-T5 built: phase 2, done 2026-10-01)

A tool costs the minutes below at the target income of the step before it (coins part only). The
pickaxes start in a richer place, so their first steps are a little longer.

| Tier | Rod / axe | Minutes | Pickaxe | Minutes | Also needs |
|---|---|---|---|---|---|
| T2 | 500 | 20 | 3,000 | 30 | |
| T3 | 1,600 | 45 | 7,200 | 60 | |
| T4 | 4,500 | 90 | 17,500 | 120 | |
| T5 | 12,500 | 180 | 31,500 | 180 | forged: ingots and its own craft's top material |
| T6 | 34,000 | 360 | 75,000 | | materials from all three crafts (the beach) |
| T7 | 100,000 | 720 | 180,000 | | rare drops only (the beach) |

Storage costs half the tool of its tier: livewells and carriers 250 / 800 / 2,250 / 6,250, the
satchels 500 / 1,500 / 3,600 / 8,750 / 15,750 (with the makings they already took).

**T5 is forged, never sold** (shared/expedition.ts, the forge's Expedition Tools tab):

| Forged | Coins | Makings |
|---|---|---|
| Mythril Moonlight Rod | 12,500 | 6 Iron Ingots, 4 Fine Fish Bones |
| Runic Elderwood Axe | 12,500 | 6 Iron Ingots, 6 Golden Leaf Amber |
| Deep Core Drill | 31,500 | 6 Silver Ingots, 4 Glimmer Shards |
| Starlight Deep Livewell | 6,250 | 3 Iron Ingots, 12 Fish Scales (after the tier-4 livewell) |
| Forester Heavy Frame | 6,250 | 3 Iron Ingots, 6 Amber Resin (after the tier-4 carrier) |

Iron for the rod and the axe on purpose: Old Flint's own pickaxe mines iron, so an angler or a
woodcutter needs a trip underground and the forge, not a second craft's tool ladder. T6 and T7 will
be added to the same table when the beach is built.

T2 to T5, coins only: 19,100 for a rod or an axe line (about 5.6 h at the target incomes), 59,200
for the pickaxes (about 6.5 h), and half as much again for storage: about 26 hours for all three
crafts, where it was about 8 before this phase.

Owned tools and stores were kept as they were (profile v6); the satchels got cheaper, so their
owners were paid the difference.

## 7. The shops, by map (tools and storage built: phase 2)

| | Campfire (Barnaby, Buster) | Woods (Bramble, Finley) | Caverns (Gus, Finnegan, the forge) |
|---|---|---|---|
| Tools | T2 | up to T4 | up to T4 at the keepers; T5-T7 forged |
| Storage | T2 | up to T4 | up to T4 at the keepers; T5-T7 forged |
| Accessories (phase 4) | T1-T2, coins | T3-T4, coins | T5-T7, crafted |
| Bait, consumables | basic | premium | cave-only |
| Buys at full price (phase 3) | common, uncommon; pine, birch | up to legendary; every wood | everything |
| Buys the rest at (phase 3) | 60% | 60% | - |

A keeper pays the same base price for the same good on every map (no hauling trick); what changes
is the ceiling of what each can afford. The campfire has four Silver Birches on its south-west
lawn, so its T2 axe has something to fell (27 coins a minute as sold there, against 22 on pines
alone; the woods' birch grove still pays more, 36).

## 8. The Expedition Licence (the caverns' entry)

- **Price:** 4,000 coins and a supply list for Old Flint (first pass: 20 Maple logs, 3 rare fish).
  That is about an hour of the woods' T4 income: an evening's goal, not a wall.
- It comes with the Rusted Pickaxe and opens the adit for good.
- Whoever already has access keeps it.
- No day pass: the caverns are the top of the game, and the supply list is the tutorial for
  "the crafts feed each other".

## 9. Accessories, rebuilt from nothing

All 21 current pieces go (12 from the shops, 5 from the bench, 4 from the forge): each owner is
paid back what it cost in coins and materials (the game already does this for retired gear).

**Slots (six):** hands, waist, two fingers, a charm, and a new **back** slot (a pack, a quiver, a
lantern: drawn on the avatar).

**Four families,** each a set:

| Family | Craft | Its stats |
|---|---|---|
| Angler | fishing | bite speed, the reel's green, tension, rare luck, fish weight |
| Forester | woodcutting | ring speed, gold width, bonus log, by-products, regrowth |
| Prospector | mining | swing speed, sweet spot, geode find, vein chase window, haul |
| Wayfarer | everything | walking pace, storage room, sell price, market foresight |

**One budget a tier,** so no piece is a trap and none is mandatory: a T1 piece gives about +5% on
one stat, a T7 piece about +35% or a unique perk. Wearing three pieces of one family gives a small
set bonus; five, a larger one.

**Where each tier comes from:**

| Tier | Source | Cost |
|---|---|---|
| T1-T2 | campfire shops | coins |
| T3-T4 | woods shops | coins |
| T3-T5 | the workbench | wood, by-products, fish materials |
| T5-T7 | the forge and the anvil | ingots, gems, plus the other crafts' rare drops |

About 45 pieces in all (4 families x 5 slot kinds, not every tier in every slot), priced at about
60% of the tool of their tier. Jewellery (rings, charms) is where gems finally go: a ring is an
ingot band plus a cut gem, and the gem decides the stat.

**Assumption to confirm:** "wearables" here means this gear. Chloe's boutique (hats, hair, outfits:
cosmetics only, drawn on the avatar) stays as it is, and gains two map sets: a forester's at
Bramble's and a miner's at Gus's.

### 9a. The catalogue (first pass)

**One piece, five ranks.** A piece is not replaced by a better one: it is raised, rank 1 to 5 (6 and
7 with the beach), each rank made on the map of its tier. So nothing bought goes dead, and the
catalogue stays small: 16 pieces and the rings.

Strength by rank: 5% / 8% / 12% / 16% / 20% (25% and 30% at ranks 6-7). At rank 3 a piece gains a
second trait.

| Family | Hands | Waist | Charm | Back (drawn on the avatar) |
|---|---|---|---|---|
| **Angler** | Wader Gloves: the line's tension climbs slower. R3: +0.2 s tension window | Tackle Holster: +2 to +8 livewell slots. R3: bait lasts 20% longer | Lucky Bell: rare fish likelier. R3: chimes 30 s before a King-Size Surge | Creel Pack: fish weigh more (worth more). R3: more three-star fish |
| **Forester** | Felling Gloves: the timing ring slower. R3: 10% chance of a bonus log | Toolbelt: +3 to +10 carrier slots. R3: +50% Firewood from a split | Dryad's Sprout: your trees grow back sooner. R3: 15% chance a tree is bigger as you start | Timber Frame: more by-products. R3: the gold sweet spot 15% wider |
| **Prospector** | Knuckle Guards: the pickaxe swings quicker. R3: the vein chase's window +0.4 s | Satchel Strap: +1 to +5 satchel slots. R3: +50% stone dust | Lodestone Pendant: the sweet spot wider. R3: Lucky Glints likelier | Lamp Pack: geodes likelier. R3: a wider glow round you in the dark zones |
| **Wayfarer** | Trader's Mitts: shops pay 1% to 5% more. R3: the next hour's prices shown in every drawer | Traveller's Sash: walking pace +3% to +12% | Hearth Charm: food and consumable buffs last longer | Explorer's Pack: +1 to +3 slots in every store |

Set bonuses (hands, waist, charm, back of one family):

| Family | Two pieces | All four |
|---|---|---|
| Angler | bites 10% sooner | a boss fish's fake runs telegraphed 0.15 s earlier |
| Forester | once a tree, a miss still deepens the notch | your share of a Colossal x1.25 |
| Prospector | the Perfect window a little wider | a Clean Break's bonus 25% to 35% |
| Wayfarer | +5% pace | every keeper pays full price (no buying ceiling) |

Most of these effects already exist in shared/gear.ts under the old pieces (tension, bite haste,
carrier and livewell room, by-products, regrowth, swing haste, sweet spot, geode find): the rebuild
re-homes them, it does not invent sixteen new mechanics.

**Rings: a band and a gem.** Forged at the forge, the gem cut at the anvil. Two finger slots.

| Band (strength) | | Gem (what it does, for whichever craft you are doing) | |
|---|---|---|---|
| Copper | 4% | Amethyst: Luck | rarer finds (rare fish, by-products, geodes) |
| Iron | 7% | Topaz: Tempo | quicker (bites sooner, the ring slower, the swing quicker) |
| Silver | 10% | Opal: Bounty | a chance of one more (a bonus log, ore, a heavier fish) |
| Glimmer-set silver | 13% | Star Shard: Fortune | Masterworks and King Sizes likelier; one worn at a time |

Three metals and four gems make twelve rings from seven ingredients; the same gem twice counts once
and a half.

### 9b. Raising a rank: earned, never bought (decided 2026-10-01)

Coins alone never raise a rank. Each rank asks for three things, and the coin part is a small fee.

1. **Attunement.** A piece gains attunement while it is worn and its craft is done by hand (an AFK
   line gives none). Every worn piece of the craft gains at once.
2. **A trial** (from rank 3): one deed done while wearing the piece. A trial that hangs on luck
   always has a second way that hangs on skill.
3. **Materials and a fee** to whoever does the work on that map.

**The pace: a rank a tool tier.** Attunement is sized so a piece is ready for its next rank about
when the player is ready for the next tool, never before, and never long after:

| Rank | Attunement (active play in its craft, cumulative) | Trial | Where | Materials (first pass) | Fee |
|---|---|---|---|---|---|
| 1 | none | none | campfire shop | none | 150 (the piece itself) |
| 2 | 20 min | none (the early game stays light) | campfire shop | 10 of its craft's common by-product | 100 |
| 3 | 65 min | one of its craft's rank-3 trials | woods keeper, a barter | the OTHER craft's makings (bark and resin for Finley, scales and bones for Bramble) | 300 |
| 4 | 2.5 h | a rank-4 trial | the woods' advanced workbench | 8 Maple logs, 3 Golden Leaf Amber, 3 Fine Fish Bones | 800 |
| 5 | 5.5 h | a rank-5 trial | the forge | 3 Silver Ingots, 1 Masterwork Iron Ingot, its craft's rare drop | 2,000 |
| 6-7 | set with the beach | beach trials | the beach | beach materials, pearls | later |

Attunement is counted in points, not seconds: a catch, a tree, a rock each give points by their
tier, so playing at your own level is what counts (the simulator sets the points so the hours above
hold). A full family worn together takes about the same 5.5 hours as its craft's tools to T5, where
the coin-only draft took 10 hours of saving.

**Trials (first pass; each rank offers two, either one passes):**

| Family | Rank 3 | Rank 4 | Rank 5 |
|---|---|---|---|
| Angler | 3 rare fish in one outing / a catch with the tension never in the red | a legendary landed / 5 three-star fish in one outing | a mythic landed / a boss fight won with no Snap Shield spent |
| Forester | a tree felled all on gold / 5 trees without a miss | a share in a Colossal / an Autumn Maple felled all on gold | the Whispering Elderwood felled without a knot struck / 3 Colossals shared |
| Prospector | a 5-link vein chase / 10 Perfects in a row | a Clean Break on a Glimmerstone / a Lucky Glint struck | a share in the Titan Monolith / a Motherlode broken |
| Wayfarer | sell on all three maps in one day | a week's three orders met | every keeper traded with in one day, and a Masterwork sold |

**A piece bought late catches up:** it gains attunement at double rate until it reaches the rank of
the highest piece of its family, so a fourth piece is not a fourth grind.

**Rings have no rank:** a ring is made, not raised (its band and gem are its strength).

The Prospector's pieces start in the caverns: ranks 1-2 from Gus, 3-4 at the forge (copper, then
iron ingots), 5 as above. The Wayfarer's are raised a rank at a time across the three maps.

Caution: the Trader's Mitts and the Creel Pack raise income directly, so their numbers stay small
and go through the simulator like every price.

### 9c. Built to grow (the future)

The rank system is data, not code, so the next maps add rows:

- **One requirements table.** Each rank of each piece lists its requirements by kind (`attune`,
  `trial`, `material`, `fee`, `place`). Ranks 6-7, a new family or a new map are new rows in
  shared/gear.ts.
- **One deeds ledger.** Every countable act (a fish landed by hand and its rarity, a tree and how
  it was felled, a rock and how it broke, a sale, a Colossal's share) is reported once, by one
  function, to one ledger in the camp profile. Attunement and trials read it. So do the things the
  game already counts apart today (the caverns' mastery, the weekly orders, the Prospector's Ledger,
  the Field Guide's records), which can move onto it one by one: later achievements, titles and
  seasonal trials cost a row each.
- **The server judges everything.** Attunement and trials are counted where the catch, the fell and
  the strike are already judged; the client only shows progress.
- **What players own is versioned.** The camp profile's schema version rises with each phase; the
  old gear is paid back by the same migration that already retired the last set.
- **Room in the numbers.** Strength by rank is 5 / 8 / 12 / 16 / 20%, with 25 / 30% kept for the
  beach's ranks 6-7; a set's bonus has a third step kept for a fifth and sixth slot if one is added.

### 9d. Defaults taken for the open questions (change any of them)

- **Wearables:** the stat gear is rebuilt; Chloe's cosmetic wardrobe stays.
- **Wood:** the simulator compares cutting log prices with slowing the felling; the default is the
  smaller change to what players feel (whichever keeps a tree's worth closer to today's), with held
  logs bought at the old price for a week.
- **Length:** tools to T5 about 5.5 hours a craft, its accessories alongside, T6-T7 with the beach;
  about 100 hours for everything once the beach is in.

## 10. Things to make and sell

| Bench | Goods | Sells for |
|---|---|---|
| Campfire workbench | simple furniture, planks, kindling | 60-200 |
| Woods' advanced bench | fine furniture, carved keepsakes | 400-1,500 |
| Forge and anvil | jewellery, tools' heads, lanterns | 1,500-6,000 |

Each priced at its makings' worth plus 15-25% (as ingots are today), so crafting always beats
selling raw, and never by enough to be the only thing worth doing.

## 11. Order of work

| Phase | Work | Done when |
|---|---|---|
| 0 | **Done.** The income simulator (`npm run economy-sim`) and its pinned table | section 2 is measured |
| 1 | **Done.** Base prices and rod odds (wood, fish, ore, cave fish), section 5 | every step within 20% of its target, the three crafts within 20% of each other |
| 2 | **Done** (T2-T5; T6-T7 wait for the beach). Tools and storage: prices, materials, the forge's recipes; shop stock by map; birch at the campfire | the ladder's hours match section 6 |
| 3 | Keepers' buying ceilings; the Expedition Licence | |
| 4 | Accessories: the old ones paid back, the six slots, the four families, sets | |
| 5 | Crafted goods; the two map outfits | |

Each phase ships on its own with its tests, a profile migration where it touches what players own
(owned tools keep their tier; nothing bought is taken away), and a patch note.

## 12. Risks

- **Wood prices fall by about two thirds at T2-T4.** Players holding logs lose value. Mitigation:
  buy back held logs at the old price for a week, or slow the felling instead of cutting the price.
- **Players who own T3-T5 tools bought cheaply** keep them: a head start, accepted.
- **Coins already saved** buy less of the top tiers than they would have: the materials requirement
  from T5 up is what stops an old fortune from skipping the ladder.
- **The first-pass numbers are estimates** from a rough model (a fixed cycle time per catch, a fixed
  walk between trees and nodes). Phase 0 exists to replace them.
