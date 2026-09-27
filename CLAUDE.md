# CozyCube — project configuration

A Discord Activity: an isometric diorama hangout (Colyseus server + React Three Fiber client). Three
lounges per Discord guild, each a room of its own (`guild_<id>`, `guild_<id>~2`, `guild_<id>~3`: shared/types
`guildRoomKey`, `loungeRoomKey`, at most `LOUNGE_CAPACITY` 25 each, its scene and pushers' shelves saved
under its own key): after the splash the lobby (`LobbyModal`, from POST `/api/lounges`) lists "Velvet
Lounge 01" to "03" with their head counts, the ping and a gold "👥 X Friends Here" for the players in
your call already there (`getInstanceConnectedParticipants`), and Quick Join takes you to them or the
liveliest lounge with room; the pick is kept in memory (`systems/lounge.ts`), so a soft restart
rejoins it without the lobby, and Settings' "Switch lounge" leaves the room for the lobby, in memory;
the click that picks unlocks the audio. Everyone in a lounge shares one persistent instance, and each player walks its worlds on their own
(`PlayerState.map`: drawn, collided with and sent world news only on their own map; chat and the
casino's jackpots reach every world; a trip draws a 0.35 s burgundy velvet curtain,
`WorldTransitionScreen`, and cross-fades the soundscapes in 0.5 s; the server places every arrival
on the new world's spawn (`MAP_SPAWN_POINTS`) before the curtain lifts, refuses a move report tagged
with the world just left, and the client snaps the avatar and cuts the camera there). Movement is
click- or tap-to-move (tap a seat, prop or person to walk up and use it) and WASD; there is no
on-screen joystick. The page NEVER reloads itself (no `location.reload` / `location.replace` inside
Discord's frame: Discord greets an Activity's frame only once, so a reloaded frame hangs on "Timed
out waiting for Discord SDK handshake"). The Discord session is the page's, made once and kept in
memory (`hooks/useDiscordAuth.ts`: one SDK, one handshake, `isSdkReady`, `connectDiscord`; a remount
gets it at once, never waiting on `sdk.ready()` again). A server restart (`server_restarting`, on a
deploy or a plain restart) is a soft restart (`systems/lifecycle.ts` `softRestart`): the room is left
without consent (its listeners removed), the render loop stops and every audio context is suspended
(`onShutdown`), the game's React tree unmounts behind the velvet "Updating CozyCube to latest
patch... Reconnecting" curtain (`ReconnectCurtain`; the scene and its GPU buffers disposed), the
server is asked for `/build.json` until it answers, and if it serves this page's build the game is
mounted afresh (main.tsx `Root`, keyed by `generation`; the audio resumed, `onResume`) straight
back into the same lounge, the curtain up until the room answers. New client code (the server
serving another build: the `welcome` handshake or the restarted server's `/build.json`, or a missing
chunk, `vite:preloadError`) can only arrive with a fresh start of the Activity: the game lets go of
everything and shows "🎉 A new CozyCube update is live!" (`UpdateRequiredScreen`) with a Close
Activity button (`closeActivity`: the SDK's `close`, which needs no handshake). The loading screen's
"Try again" retries the Discord login in memory, on the same SDK. A fresh account starts with 50 coins and 0 chips (the Phase 3 wipe put every account back
there; the economy is calibrated in shared/economy.ts). Eight worlds in the registry, in the
fast-travel grid's order (only the built ones can be travelled to) — Cozy Lounge (12.8x12.8, built,
compact: the L-shaped corner sofa snug in front of the brick fireplace facing it across the coffee
table on the hearth rug, 1.8m walkways round the kitchen island, the chess table and Chloe's corner,
everyone arriving in the middle; the guild's hour and weather (`weather`: clear or rain, from the hour's menu, rolled by
Auto Cycle) drive its sky (`BackgroundSky`: a cerulean day with drifting clouds, an amber-to-violet
sunset, a twinkling starfield at night, a slate overcast with falling streaks in the rain), the light
through its three windows (shafts and floor pools: golden, amber, a silver moonbeam, dim in the
rain), drops running down the panes and a rain ASMR channel; a synthesized folk-jazz trio when the
radio is off; Chloe the cat maid's Velvet Boutique by the front window is the only way into the
wardrobe (her or her cheval mirror, nothing within 2 m in front of either; the server sells clothes
only there), a 360-degree studio turntable where anything is tried on before it is bought (the bill
bar shows only while something unowned is on), in Common, Rare and Prestige bands, every outfit cut
to one of five archetypes (formal, robe, streetwear, summer, workwear) with its own footwear, and
the Velvet Pioneer set is claimed free by the beta's players for two weeks; chess and checkers on a
16:9 landscape table with player clocks and captured trays),
the Starlight Campfire (22x22, built, always night: a bonfire whose shared fuel burns down and is fed with chopped firewood (the Cozy Aura above 70%), a communal Dutch-oven stew, Well-Fed, roasting and a picnic table to leave skewers on, a river you fish from the dock's edge or the canoe (a Stardew-style reel: eight river species (70% common, 20% uncommon, 8% rare, 2% legendary) with bell-curve lengths, King Size crowns and stars, a Field Guide ledger (each kind's count, longest and best sale; a new personal best is held high with a chime), bite times by species, line tension, sunken treasure, AFK mode; a full creel stows the rod and rests the angler by the water, no bait spent) into a persisted Fish Creel (six tiers, 5 to 50 fish), Barnaby the otter angler's stall (buys the creel at the hour's market price, chalked with ▲/▼ on his outdoor chalkboard: every good's price moves on the hour between 50% and 200% of its base and each sale knocks 2% off the next; sells rods and bait), Buster the beaver lumberjack's stall by the woodpile (buys split wood, Pine Resin and carved pieces; sells axes, seven tiers of wood carrier, 10 to 100 slots, and utility gear: work gloves that widen the chopping meter's gold, traction boots, a leather apron; buys the crafts carved at the carpenter's workbench beside his stall, between it and the tipi (a wide path between them), both set back by the north pines: its own 🪚 Workbench button and modal, a Safe Carve or a Masterwork Push per piece, a broken carving salvaging half its wood and a pile of Sawdust for the fire), an organic nine-seat front-mounted firepit close round the fire (logs long, medium and curved, a stump, a boulder), a tipi (its glow dims while someone naps in it) and a second A-frame tent, picnic-table, camp-chair, stump and canoe seats, a raccoon to feed and ducks that dive when tapped, the guitar, a stargazing telescope (meteor-shower combos, constellation tracing), the Northern Timber Trail (four chopping stations in two pairs: one either side of the tipi, and a workshop pair: one beside Buster on his open side against the pines, one at the woodpile by the camper; a 3-hit combo whose log splits when 2 of the 3 swings land in the green, a gold centre being a critical chop (+3 coins or a Pine Resin, now and then; resin is sap, not wood: it rides in its own jar beside the carrier, no slots and no limit, Buster buys it for 10 coins, and the workbench's Adhesive Slot spends one to bond a carving so it can't break or gild it for +25% Masterwork chance), each block yielding 3 logs then restocking after a rolled 20-25 s) feeding the wood carrier (the header's 🪵 pill opens it: every slot, raw timber and carved crafts), firefly jars, a wood-chopping block, foraging, string lights, ducks, a raccoon and an owl, and a synthesized ambience), Sunset Beach Bar,
Japanese Onsen, the Velvet Casino (20x20, built: a compact mid-century Art-Deco hall in six zones,
under 85 draw calls: floors of burgundy Art-Deco damask carpet framed by a twin brass inlay round the
central pit, a harlequin of high-gloss diamond marble with gilded veins in the foyer, dark oak
herringbone in the lounge, polished obsidian in Neon Alley with the neon shining back off it; walls
of fluted walnut wainscot under burgundy damask wallpaper, Art-Deco twin-beam sconces on the walls
and pilasters, Baroque gold-leaf portraits and 1920s posters under picture lights (the light and the
reflections painted into vertex colours: no textures, no extra lights); the marble foyer with Mr.
Vance's Golden Cage (coins into Velvet Chips and back, 1:1; the chip is drawn by `VelvetChipIcon`,
never an emoji), Madame Zara and the capsule machine in its nook, the way in to the floor wide open;
the main floor's roulette and craps (the central pit, drawn 1.2 m east toward the blackjack tables, the
twin brass inlay and the roulette's sunburst with them; no ropes: the floor is open all round), Scarlett the red panda's kidney-shaped Punto Banco table beside
it (turned so its felt and stools face the middle of the floor, Scarlett behind it toward the front
rail), and two multi-seat blackjack tables against the east rail, dealers behind them facing the floor
(Table 1 casual with Cedric the badger, Table 2 high stakes with Gideon the greyhound; rounds for
everyone seated, double, and a split pair played as two hands each with its own Hit and Stand);
the hall's baccarat on navy felt (#0F2042) drawn back toward the front rail with an LED bead road
beside it; two high-top cocktail tables with leather stools and palms in the carpet by the front rail;
the Big Six wheel flush against the Velvet Lounge dais's left wall (53 segments, 1x to the 40x Joker,
one spin for the room, its flapper clicking), and up on the dais's oak parquet in front of it the
8-ball table, turned to run north-south (`along`: "z"; its head and the cue ball to the north), about
1.3 m clear of the Big Six's players and 1.2 m of the piano bench, the dais's steps and the open floor
on its other sides; an emerald horseshoe booth with a glass cocktail table at the
far right rail, the stage's stairs clear, and areca palms in brass urns along the walkways; Neon
Alley's obsidian out to the front rail, its five slots (Lucky Reels spun only by dragging its lever
down, or Space) and two vintage pinball cabinets along the wall (Velvet Nights, played for chips in a
compact 720px arcade cabinet, the playfield left and the stake, score, tiers and plunger right: a
credit of 10 to 100 chips buys three balls, taken with the first; the score pays by tier, 3,000 1x,
5,000 1.5x, 10,000 2.5x, 20,000+ the 5x Jackpot (`PINBALL_TIERS`), the table's points calibrated so
a steady player about breaks even; the table and its physics are shared (`shared/pinball.ts`: a
fixed 1/360 s step, only + - * / and sqrt at run time) and the server replays the game from the
player's inputs to find the score it pays, never longer than the time since the credit; closing mid-
game ends it there; arrows or A/D, or on a touch screen the playfield's halves and a pull-down
plunger), the Mechanical Turf Club's
four-horse derby and two coin pushers side by side, the house's (2-25 a coin) and the gold-trimmed
High-Roller Pusher (25-250), each a real shelf of coins (`shared/pusherSim.ts`, run by the server:
a coin dropped where the dropper sweeps rattles down the pegs (drawn as a disc tilted 35 degrees,
spinning, kicked afresh at each peg; an outer lane sends it down a side chute), the plate shoves the
pile on a sine stroke and the coins it shoves slide on a little (damped by the felt), what goes over
the edge pays the last dropper, a coin going over at
the left rail finds the house's gutter; about 92% back on an aimed coin; at most 80 coins, settled
ones asleep; shared, kept with the lounge's scene, and the patrons who play them drop real chips on
them); the raised High-Roller Stage's No-Limit
Texas Hold'em (your own hand against Boris and one or two regulars: a buy-in, blinds, pre-flop to
the river, fold, check, call, a raise slider, all in, side pots, a rake on a won pot past the flop)
and Bruno at the gilded doors up to the Velvet Penthouse (`casino_vip`, a map of its own; the 🏆
High Rollers board shows on the casino's two floors only); the Velvet Lounge's bar (Pippin's drinks
and free Fish Pretzels), the 8-ball table's game (Solo Practice, or a 2-Player Match: turns, fouls,
ball in hand, solids and stripes), Chesterfield and, on the dais's
front-right apron by the stage, the baby grand (its lid open to the floor, a spotlight on its keys:
a public-domain or original recital for the hall, or play it yourself); the Velvet Penthouse, a
10x10 suite reached only with the Black Velvet VIP Pass (5,000 chips from Bruno or Mr. Vance, pawned
back to Vance for 2,500, kept in the account): high-limit Hold'em with Boris and Baron von Fox,
baccarat (Punto Banco) beside Duchess Penelope, the Golden Vault slot, the city's lights through
its windows; blackjack, Hold'em, baccarat and the piano are played sitting down (walking up seats
you at the nearest free seat; a full table says so), the standing tables from any side of their
rims, the Big Six from its ledge; every stake within its table's limits (`TABLE_LIMITS`: presets, a
minimum, an ALL IN capped at the table's max, a brass placard); the games' panels are 16:9
landscape sheets that fit whole, no scrolling (`Modal landscape`), every panel clear of notches and
Discord's overlays (`SAFE_AREA`), every button at least 48 px to tap on a touch screen and keyboard
hints hidden there (`systems/inputMode.ts`: `touch-ui` on the page, `kbd-hint` / `touch-hint`); the staff and regulars look at
you, wave, gesture and have a word (each one skinned mesh: a draw call apiece); twenty-four chibi
patrons of eight kinds (rabbit, raccoon, feline, a dapper fox, a tweedy panda, a gentleman owl, a
pinstriped greyhound, a flapper otter), each 0.85x to 1.25x tall, and Bella the cocktail bunny
wander the floor, and patrons take turns at the slots, the pinball and the pushers (`state.machines`: a
machine in use refuses anyone else, "Excuse me" asks the patron to finish); the casino's panels use
Cinzel, Outfit and Playfair Display with gold foil and brass; the header shows the connection as a
glowing orb (its ping in the tooltip); a synthesized late-night jazz combo plays, no noise bed),
Boxing Gym, Retro Arcade and the
Gaming Cafe (registered, not built:
each is a bare floor with no seats or props until its world is authored).

## Layout

| Path | What lives there |
| --- | --- |
| `shared/types.ts` | Synced state shapes (the player's own `map`, every seat's and prop's `map`), `MapId` (with `casino_vip`, `isCasinoMap`), `guildRoomKey`, the lounges (`LOUNGE_COUNT`, `LOUNGE_CAPACITY`, `loungeRoomKey`, `loungeName`, `LoungeInfo`), `cleanDisplayName` (a name in any script: letters, marks and digits of every language, Thai included, NFC, at most 32), `MAP_SIGNATURE_TIME`, `isBlacklisted` (test and bot accounts: never saved, never on the board), economy constants, the wardrobe catalogue in tiers (`WardrobeItem`; each outfit's `archetype`, `OUTFIT_ARCHETYPE_LABEL`), gestures (`trophy`), statuses, game contracts, map sizes |
| `shared/economy.ts` | The calibrated economy in one table: the 50-coin start, fish, wood and carved prices, the creels', carriers', tackle's, axes' and gear's prices, the wardrobe's bands (Common 120-280, Rare 450-800, Prestige 1,500-3,200) |
| `shared/market.ts` | The camp's hourly market: a seeded trend per good per hour (50%-200%), -2% per sale, `priceRun` (the server settles every sale with it, the shops quote with it), the chalkboard's arrows |
| `shared/worlds/index.ts` | The world table: `WorldId`, `WORLDS` (map id, name, icon, size, built), `ACTIVE_WORLD` |
| `shared/worlds/lounge.ts` | The Loft's whole floor plan, authored once (12.8x12.8): zones, the hearth and the corner sofa facing it, seats, props (the Velvet Boutique: Chloe and her mirror, `BOUTIQUE`), colliders, spawns (the middle first), Mochi's route |
| `shared/worlds/campfire.ts` | The Campfire's floor plan: `CAMPFIRE_LAYOUT` (plain JSON between markers, read as-is by `build_campfire.py`), `riverSpan` (the river spline; the builder has the same function), seats (two per log; hammock, tipi and A-frame tent lie seats), props (the bonfire, the fishing spots, the telescope, four chopping stations, four foraging patches, Barnaby (and his chalkboard, `BARNABY_BOARD`), Buster, the workbench), the light strings and the wildlife's paths, colliders, spawns |
| `shared/worlds/casino.ts` | The Velvet Casino's floor plan (20x20): `CASINO_LAYOUT` (plain JSON between markers, for `build_casino.py`: the tables (the hall baccarat's `face`), the Big Six and its segments, the craps ropes, the cocktail tables, the bead road, the booth, the pinball cabinets, the two pushers, the palms, the sconces, the portraits and posters), its zones (`casinoZoneAt`), the stages (`casinoFloorY`), the staff's stations (`CASINO_NPCS`), the Big Six against the stage's left wall (`BIG_SIX`, `BIG_SIX_SPOTS`), the pushers (`COIN_PUSHERS`, `PusherId`) and pinball cabinets (`PINBALL_MACHINES`), the tables' reach (`blackjackTableNear` with each table's tier, dealer and stools, `nearGameTable`), the seated games (`SEATED_GAMES`, `seatedGameOf` / `seatedGameAt`) and the standing tables' rims (`tablePerimeter`), the one-player machines (`SINGLE_MACHINES`), the penthouse's doors (`VIP_DOORS`, `VIP_DOORS_FRONT`), the hall's floor (`CASINO_REGIONS`), the slot row, the cage window, the exit doors, seats, colliders, spawns, the crowd's and Bella's spots |
| `shared/worlds/casino_vip.ts` | The Velvet Penthouse (10x10), the map `casino_vip`: a world of its own reached only through Bruno's doors (its floor where it was authored, at `VIP_OFFSET`; its spawn the elevator, `VIP_ARRIVAL`): `VIP_LAYOUT` (plain JSON for `build_casino_vip.py`), `VIP_FRAME` (the camera's), `inPenthouse`, the arrival and elevator, the high-limit poker and baccarat tables, the Golden Vault (`VAULT_SLOT`), its staff and high rollers (`VIP_NPCS`), seats, props, colliders |
| `shared/items.ts` | The casino's items: `VIP_PASS` (the Black Velvet VIP Pass: price and pawn value); the Velvet Pioneer set (`PIONEER_SET`: the Pioneer Cap, the Blueprint Overalls, the gold `[ 🛠️ BETA TESTER ]` title; `pioneerEligible`: an account made before the wipe, within 14 days of it) and the special titles |
| `shared/pool.ts` | The 8-ball table: `PoolSim` (fixed 1/120 s steps, only + - * / and sqrt: every client replays a shot identically), the rack, ball in hand, and `ruleOnShot` (fouls, groups, the 8) for the room's two-player match |
| `shared/casino.ts` | The casino's rules: Velvet Chips (1:1 with coins, a saved balance exchanged only at Vance's cage; `netWorth` = coins + chips; `CHIP_EMOTE`; `CHIP_CAP` 9,999,999), the betting matrix (`TABLE_LIMITS`, `allInBet`, `tableStake`, `limitPlacard`), roulette, slots (the Golden Vault's limits), blackjack's table rounds (`BlackjackTableView`, split, double), Hold'em's packets and `PokerResult`, baccarat at both tables (`BaccaratTable`, `baccaratCoup`, the tableau), the Big Six (`BIG_SIX_SEGMENTS` from the layout, `BIG_SIX_INFO`, `bigSixSpinAngle`: the same turn on every client), craps, the derby (`derbyPaces`: the same race on every client), the coin pushers (`PUSHER_MACHINES`, the dropper's sweep, `PusherView` / `PusherEvent` / `PusherPurse`, Bonus Tokens), the one-player machines' occupants (`npcOccupant`, `PATRON_KINDS`, `OCCUPIED_LINE`), the piano's packets, the VIP pass's packets, the bar |
| `shared/holdem.ts` | No-Limit Texas Hold'em: `evaluate` (the best five of seven, High Card to Royal Flush), `equity` (a Monte-Carlo run over the unseen cards), the table (`newHoldemHand`, `holdemAct`, blinds, the button, side pots, the rake), the house's players (`botDecision`: equity against pot odds and a temperament; Boris, the regulars, Baron von Fox) and `holdemView` |
| `shared/pinball.ts` | Velvet Nights, deterministic: the table (walls, guides, slingshots, bumpers, drop targets, lanes, flippers as direction vectors turned by a fixed rotation), `PINBALL_POINTS`, `stepPinball` at `PINBALL_STEP_S`, the input codes and `validPinballInputs`, `replayPinball` (the server's, in slices) |
| `shared/pusherSim.ts` | The coin pushers' shelves: coins as discs with a value, the plate's sine stroke (`platePos`), the peg board (`pegPath`, `landsOnShelf`: the side chutes), `stepShelf` (a fixed 1/30 s step: each coin's damped slide, the plate's push, four relaxation passes, sleeping coins, the edge and the house's gutter), `PUSHER_MAX_COINS` 80, `seedShelf` (a new shelf laid to the lip), packed for the wire and the save |
| `shared/pianoPieces.ts` | The baby grand's recital book (Für Elise, Satie's first Gymnopédie, an original), notes and lengths |
| `shared/chop.ts` | The wood-chopping combo's strokes (a ping-pong needle), logs (pine, oak, golden), the wood they split into, Buster's axes and the wood carrier's seven tiers (`WOOD_CARRIER_TIERS`): rolled and judged by the server, drawn by the client from the same functions |
| `shared/fishing.ts` | The angler's world: species per water (freshwater at the campfire, saltwater registered for the beach), sizes, stars, bite times, rods, baits, the Fish Creel and `FishingProfile` (the camp profile kept in the player record: creel, rods, baits, records, split wood, axes, carrier tier, crafted pieces, gear, resin and sawdust; `carrierLoad`: logs and carved pieces only, resin and sawdust ride beside the carrier), Well-Fed |
| `shared/crafting.ts` | Buster's workbench: `WOOD_RECIPES` (the five artisan crafts by tier: recipes in wood, prices, Masterwork prices, Safe and Push odds), the Adhesive Slot (`ADHESIVES`: a resin's bond or gilding, `craftOdds`), the roll, the broken-carving salvage, Sawdust and Pine Resin |
| `shared/gear.ts` | Buster's utility gear (gloves, boots, apron) and each one's effect: the chopping meter's gold, the bonus log, the walking pace, the workbench's odds and salvage |
| `shared/bonfire.ts` | The campfire's shared hearth: the bonfire's fuel and Cozy Aura, `getBonfireVisualState` (its flames, light and smoke by fuel: out at 0% with no smoke, thick warning smoke while dying at 1-20%, a steady column at 21-60%, thin fast wisps at 61-100%), the Dutch oven's stew, the picnic table's plates (room state; `BONFIRE_STATE_UPDATE` / `STEW_STATE_UPDATE`) |
| `shared/seats.ts` | Cushion descriptors and the avatar's hip constants; every seat anchor height is derived from them |
| `shared/collision.ts` | Obstacle boxes, spawns (`MAP_SPAWN_POINTS`: the server's word on every arrival), `isBlocked`, `worldLimit` (the lounge is clamped to +-5.9), `walkY` (the casino's stages) |
| `shared/props.ts` | Per-map seats and props with approach points, `PROP_MAP` (every prop id's world: ids are unique across worlds), and `mochiSpot` (her wall-clock day) |
| `shared/pathfinding.ts` | Grid A* over the same collision the server validates against |
| `server/src/rooms/HangoutRoom.ts` | All authoritative logic (economy, seats, props, Mochi, chat, ...) for one lounge's room (`guildKey`, its lounge's key; `connectedUserIds` for the lobby): every built world's seats and props at once, each player's `map` and `travel` (only they go; what they were doing there ends, casino stakes come back), world news to that world (`toMap`, `nearby`), each world ticking while someone is in it, the market's sales, the Pioneer claim, Chloe's boutique; the guild's scene (the hour, the weather, the campfire's fire, stew and picnic plates) is saved beside its board game and restored when the room is created again (a restart or a redeploy never sends anyone back to the lounge or relights a fire) |
| `server/src/rooms/lounges.ts` | The lounges' registry (`registerRoom` / `unregisterRoom` from each room) and POST `/api/lounges`: each of a guild's three lounges' head count, capacity and the caller's friends in it |
| `server/src/rooms/casino.ts` | `CasinoFloor`, the casino's rules on the server (the `BoardTable` pattern): the roulette loop, each blackjack table's rounds for its seated players (a betting window, a turn clock, split (each hand played on its own) and double), the slots, Hold'em from a chair (your own hand against the house's players, the buy-in back with what you won when it ends, folded if you leave), both baccarat tables' coups (the Duchess wagers upstairs), the Big Six's one spin for the room, each player's craps, the Turf Club's one race for the room, the coin pushers' shelves (stepped while anything moves or someone watches, at most 12 steps a tick; the shelf sent ten times a second to the player at it; what goes over paid to the last dropper for 10 s after their coin, a burst of 20x the stake announced; saved with the scene; a patron at one drops 1 to 3 chips on it every few seconds), the pool match (a relayed shot, the shooter's report, the ruling), the machines' occupants (patrons coming and going, a player's hold, "Excuse me"), the piano's recitals and notes (from its bench), the VIP pass (bought from Bruno or at the cage, pawned at the cage) and the penthouse's doors (a trip between the casino's two maps), and Mr. Vance's cage (`buyChips` / `cashOut` at the window), every stake within its table's limits and every payout in chips; stakes still open are refunded when a player leaves the floor (`leaveFloor`) and follow a reconnecting player; a jackpot is shouted to every world (`shout`) |
| `server/src/db/players.ts` | PostgreSQL store (DATABASE_URL) with in-memory fallback; the players live in `players_v3` since the Phase 3 wipe (run once under an advisory lock and noted in `game_meta`: every account carried over with 50 coins, 0 chips, the starter wardrobe and an empty camp profile, its lifetime stats kept, test accounts left behind; the old `players` table is the untouched backup), `getWipeAt`, the blacklist on every save and read |
| `server/src/build.ts` | The client build the server serves (`client/dist/build.json`, stamped by `client/vite.config.ts`): told to every joining client |
| `client/src/scene/` | `IsometricCanvas` (fitted ortho camera), `WorldScene` (root), `LoungeWorld` (the room), `CampfireWorld` (loads `campfire.glb`; fire light and fuel (out: no flames, sparks or smoke, the ember bed cold charcoal), moonlight, the midnight sky gradient, smoke, embers, bulb glows, foam rings, fireflies, stars) and `campfireLife` (the wildlife, the canoe, swaying strings, the river's flow and the pines' wind sway), `CasinoWorld` (loads `casino.glb`; its floor layers offset, the roulette wheel following the room's phase, the neon breathing, the dice, the derby's horses, the penthouse's doors swinging out, the piano heard across the hall, a warm fill and point lights at the chandeliers, walls, cage, bar and lounge, a midnight-indigo starfield over an amber horizon behind it; drawing the penthouse instead while you are on `casino_vip`), `CasinoVipWorld` (loads `casino_vip.glb`: the city breathing, the champagne tower's bubbles, its own warm light; the camera frames it by `VIP_FRAME`), `Props` (lamps, Mochi, seat pads, effects), `kit` (primitives, `StaticBatch`), `BackgroundSky` (one full-screen shader quad behind every world but the campfire: gradient, clouds, stars, rain, eased between looks; the lounge's by hour and weather, the casino's starfield), lighting per hour and weather (`timeOfDay`: `WeatherContext`, `weatherLook`) |
| `client/src/entities/` | `Avatar` (the nameplate sized to the camera's zoom: the name a `Nametag` (`nametagCanvas.ts`: drawn on a mipmapped canvas at up to 2x the device's pixel ratio in KenPixel with Noto Sans Thai and Prompt behind it, padded for Thai marks, redrawn when the fonts arrive) clamped to 8-14px, a title a micro badge of 7-10px set 4px over it, a special title in glowing gold; either hidden in Settings, `nameplateSettings`; the trophy raise), `Mochi`, `ChloeMaid` (Chloe and her mirror, `chloe_maid.glb`), `BarnabyChalkboard` (the hour's prices painted on a canvas on the slate), the Campfire's shopkeepers `Barnaby` and `Buster` and the casino's staff (`CasinoStaff`, only the floor you are on mounted: Vance, Boris, Vivienne, Cedric, Gideon, Scarlett, Jasper, Pippin, Bruno in the hall; upstairs Boris, Baron von Fox and Duchess Penelope) through `CampNpc` (`node`: one root of a model holding more; the parts in the body's material fused into one skinned mesh whose bones are the parts themselves, so a character costs one draw call; breathing, a swaying tail, a look at whoever comes near, a wave; `y` stands one on a platform; `talk`: a speech bubble on a click, a room message or entering an area; `gestureOn` / `idle`: a clap, a shuffle, a knock, a shake), `AmbientPatrons` (the chibi crowd of eight kinds, each patron its own height and build, the patrons at the machines (a lever pulled, a coin dropped) and Bella: one instanced mesh per figure, only the instances in use drawn, limbs swung in the vertex shader) (pure GLTF loaders via `useGLTF`), `rig.ts` (node/material contracts), `ModelBoundary`, `MochiPlayroomModal`, `Players` |
| `client/public/models/` | The ONLY location for 3D assets: `avatar.glb` (with its held props: mug, watering can, skewer, rod, guitar, bobber, hatchet, firefly net and jar, and the Heart emote's heart; twenty hats, among them the boutique's frog and cat beanies, painter's beret, bucket hat, deerstalker, gold wire-frame glasses and the Pioneer Cap; nineteen tops and eighteen bottoms in five archetypes (build_avatar.py TOP_IDS / BOTTOM_IDS, mapped to outfits by rig.ts `OUTFIT_PARTS`), each bottom's legs carrying the outfit's footwear over the bare feet), `chloe_maid.glb` (Chloe the cat maid and her gilded cheval mirror, two roots), `cat.glb` (Mochi), `props.glb` (the lounge's small props), `campfire.glb` (the Campfire diorama, its animated wildlife and props as named nodes: the Dutch oven, the picnic plates' skewers, the chopping stations' hatchets and logs, `Prop_Workbench`), `barnaby.glb` (Barnaby the Angler and his stall; his A-frame `Chalkboard`, its slate UV-mapped for the prices), `buster.glb` (Buster the Lumberjack and his firewood stall), `vance.glb` (Mr. Vance, the casino's fox cashier: every colour a vertex colour, one clay material per node, five draw calls), `boris.glb`, `vivienne.glb`, `jasper.glb`, `pippin.glb`, `bruno.glb`, `cedric.glb`, `gideon.glb`, `scarlett.glb`, `baron.glb`, `penelope.glb` (the casino's staff and regulars, built the same way; the Baron and the Duchess built seated), `patrons.glb` (the chibi crowd's nine figures and Bella: one node each, limbs and tint in the UVs, pivots in the extras), `casino.glb` (the Velvet Casino: one static mesh with a slot per finish (clay, sheen, polish, gloss, glow, neon, decal), about one draw call per material, the sconces' beams and the neon's reflections painted into its vertex colours, and its moving nodes: `Prop_RouletteWheel`, `Prop_BigSixWheel`, the dice, the derby horse, the pusher plate, the cue ball, the penthouse's door leaves), `casino_vip.glb` (the Velvet Penthouse, built at its place in the world, and `Prop_FountainTop`). All assets are authored in Blender |
| `scripts/blender/` | Blender Python automation scripts (`build_staff.py`: the lounge's staff, `chloe_maid.glb`) (executed via Live Bridge http://127.0.0.1:8192 or headless CLI). Every builder ends in the studio (`studio.py`): after its export its collections move to their world's place on one grid (Lounge at (0, 0), Campfire (40, 0), Casino (80, 0), the avatar in every outfit along y = 30, 2 m apart, as linked copies) under `Studio_<World>` collections, and the file is saved (`bpy.ops.wm.save_as_mainfile`: the file open in the session, or `models/master_world.blend` under the repository, kept out of git); a headless run opens that master first, so the grid fills up across builders. The bridge takes a JSON body `{"code": "..."}`, queues it and returns nothing, and execs with separate globals and locals: run a builder inside its own namespace (`exec(compile(src, ...), ns)`) with `REPO_ROOT` and `REPORT_PATH` set in `ns`, and read the report file it writes |
| `client/src/audio/` | Synthesized sound, no audio files: `sound` (the 0.5 s world cross-fade), `loungeFolk` (the lounge's folk-jazz trio, resting while the radio plays), `radio` (the lounge radio), `sfx` (one-shot effects), `ambience` (each world's soundscape, cross-faded, the campfire's fire and river placed round the listener, its fire channel following the bonfire's fuel), `casinoJazz` (the Velvet Casino's jazz combo: a clean sine upright bass, soft band-limited brushes and a dark ride, FM Rhodes comping, a muted trumpet, on a look-ahead scheduler; no noise bed), `casinoCrowd` (the murmur under it, mixed a touch below the band), `piano` (the baby grand: recitals and single notes), `rain` (the lounge's rain ASMR: the fall, the sheen on the glass, the patter and the gutter's drips, while it rains there), `soundSettings` (the Settings panel's ambience mixer (fire, river, forest), the Lounge Folk-Jazz, Casino Jazz, Casino Crowd and Window Rain faders, and Effects), `master` (the Master Volume: every engine's context sends its output through `masterOut(ctx)`, one gain node per context; `master_volume` in localStorage, 80% to start; every context suspended as the game lets go in a soft restart, and resumed as it comes back) |
| `client/src/assetVersion.ts` | The build's asset version (vite.config.ts): every model URL carries it, so a deploy is never served a cached model |
| `client/src/systems/` | `useLocalPlayerMovement` (click or tap / WASD locomotion; a world change snaps to the spawn, `liveMotion`'s `jumps`), `input.ts` (the keys), `inputMode.ts` (touch or keyboard: `touch-ui` on the page), `lounge.ts` (the lounge picked, in memory, and the rejoin after a soft restart) and `lifecycle.ts` (the page's life across updates, never a reload: `softRestart`, `showOutdated`, the phase and `generation` main.tsx mounts the game by, `onShutdown` / `onResume`, `useUpdateWatch` on `welcome` and `server_restarting`, the chunk-error handler) |
| `client/src/data/` | `patchNotesData` (every patch in six eras, the four badges; `LATEST_PATCH` is the client's version) |
| `client/src/components/` | `WorldTransitionScreen` (the travel curtain: the destination and a cozy tip), `LoadingScreen`, `LobbyModal` (the lounge picker, in the cozy cream dress over `/images/lobby-campfire.jpg`: the Starlight Campfire at night from the game's own renderer, blurred 3px), `UpdateScreens` (the soft restart's `ReconnectCurtain` and the outdated build's `UpdateRequiredScreen`, on the travel curtain's velvet) |
| `client/src/components/hud/` | The Cozy Clay HUD: header (the connection as a glowing orb, its ping in the tooltip; the 🏆 High Rollers button on the casino's two floors only; at the campfire, the 🪵 wood pill and the 🪣 Fish Creel popover; `anglerStore` mirrors the camp profile to localStorage; the Velvet Chip pill, lit in the casino and dimmed elsewhere while you hold chips), `VelvetChipIcon`, `BetControls` (the tables' presets and ALL IN), `AFKFishingBar`, world drawer (each world's head count; only built worlds), social drawer (everyone in the guild, each with their world), `WardrobeModal` (opened only by Chloe or her mirror: the studio turntable, try-on, the live bill and [ Purchase & Equip ] only while something unowned is on, the Pioneer claim), `SettingsPanel` (the faders, Show Player Titles and Show Player Names (`entities/nameplateSettings`), the camera, the controls hint, and 📜 Patch Notes, which closes it and opens `PatchNotesModal`: a 16:9 sheet of cozy cream paper (`Modal` tone "cream": #FDFBF7, 20px corners, Fredoka), the eras as wood-carved tabs, the changelog beside it with pastel badges), `BoardGameModal` (chess and checkers on a 16:9 table: a 2.5D walnut board with drawn ivory and walnut pieces, glowing moves and captures, a player card each side with the clock and the captured tray), `FieldGuideModal` (the trophy ledger), `ActionDock`, `CampfireStatus`, modals (`CashierModal` (Mr. Vance's cage, and the VIP pass), `VipPassModal` (Bruno), the games' landscape sheets: `BlackjackModal` (the felt half-moon, split hands side by side), `BaccaratModal` (either table), `PokerModal` (Hold'em), `BigSixModal`, `CrapsModal`, `DerbyModal`, `CoinPusherModal` (either pusher: the cabinet in 2.5D on a canvas, the shelf eased between the server's snapshots, the pegs, the gutter), `PinballModal` (Velvet Nights: the compact cabinet, the stakes, the tiers, the payout's burst), `SlotsModal` (the lever), `PoolModal` (Solo or Match, the table 2:1), `RoulettePanel` (the felt, then the wheel) and `RouletteWheel`, `PianoModal`, `CookingModal`, `BarnabyModal`, `LumberjackModal`, `WoodCraftModal` (the workbench), `WoodCarrierModal`, fishing, stargazing, chopping, ...) |
| `scripts/validate-world.ts` | `npm run check-layout`: every approach point open and reachable on every map (the penthouse's from its elevator), Mochi's route clear, seat anchors derived, the boutique's and the chalkboard's colliders, the pinball cabinets within reach of their spots |

---

## 3D Asset Guidelines & Rig Contract

- **Strict Blender-to-GLB Architecture**: ALL organic entities, avatars, pets, and complex diorama props MUST be authored exclusively in Blender and exported as `.glb` into `client/public/models/`.
- **Zero Procedural Mesh Anti-Pattern**: NEVER attempt to sculpt organic anatomy, characters, or pets using nested React Three Fiber primitive JSX tags (`<sphereGeometry>`, `<cylinderGeometry>`, etc.) with arbitrary numeric offsets.
- **Component Duty**: `Avatar.tsx` and `Mochi.tsx` act strictly as lightweight model loaders utilizing `@react-three/drei`'s `useGLTF`.

---

## Verification before any commit

1. `cd client && npx tsc --noEmit -p .` — 0 errors
2. `cd server && npx tsc --noEmit -p .` — 0 errors
3. `npm run check-layout` — 100% pass
4. `npm run build`

A model file that is loading, missing, or broken shows a plain stand-in (`ModelBoundary`), never a crash.

Never commit secrets: `.env` holds the real Discord client secret, and `.claude/` stays untracked.
Scan the staged diff before committing.

---

## 1. Language directive (token efficiency protocol)

**All communication is in English, with no exceptions**: explanations, code analysis, planning
discussions, terminal output, code comments, and git commit messages.

- Do not output Thai, and do not translate between Thai and English.
- This holds even when the user writes in Thai — read the Thai request, answer in English.
- Reason: maximize context-window efficiency, remove translation overhead, cut token use.

---

## 2. Skill: threejs-scene-architect

Registered at `.claude/skills/threejs-scene-architect.md`. The specification below governs every
future change to Three.js / R3F scenes, layouts, collisions and avatar rigging in this project.

```markdown
# Skill: threejs-scene-architect

## Scope & Trigger
Automatically activates when auditing, modifying, or creating 3D diorama maps, meshes, seat anchors, avatar accessories, lighting/shadows, and collision boundaries in Three.js / R3F.

## Engineering Standards

### A. Dynamic Avatar Seat Anchors (No Hardcoded Y Values)
- Never use fixed arbitrary Y values for sitting or reclining.
- Always derive support surface height dynamically from the mesh bounding box:
  `surfaceY = mesh.geometry.boundingBox.max.y * mesh.scale.y + mesh.position.y`
  Target position: `surfaceY + avatarHipOffset` (typically +0.18 to +0.25 units).
- Clear Headroom: Maintain at least 1.2–1.5 units of vertical clearance between the seat surface and any overhead geometry.
- Platform Leveling: Modular cushions must share a unified, flush top platform height to eliminate sunken trenches.
- Yaw Lock: Lock `avatar.rotation.y` to face outward into the room space, never toward backrests or walls.

### B. Group Hierarchy & Relative Transforms
- Multi-part props (trees + foliage, tents, desks, pets) MUST reside within a single parent `<group>`.
- All child mesh coordinates must be relative to the group origin `(0, 0, 0)`.
- Apply all scale, position, and rotation transformations to the parent `<group>`, never to individual child primitives.

### C. Shadow Pipeline & Clean Materials (Zero Dithering)
- Stylized low-poly meshes, structures, and foliage must use completely opaque materials (`transparent: false`, `roughness: 0.7 - 0.9`).
- Cap total draw calls between 110–130 per map. Enforce `castShadow={false}` on secondary point lights and ambient fills.

### D. Walkable Surfaces & NavMesh Elevation
- Elevated Bridges & Ramps: When an avatar traverses elevated structures, update the walkable Y level to match the top plank surface.
- Invisible Colliders: Always construct invisible collision boxes along natural barriers.

### E. Spatial Zoning & Proximity Deduplication
- Material Zoning: Use contrasting floor materials to structure diorama planes.
- Action Dock Logic: Group nearby triggers by `action.type` and render only ONE button for the target with `min(distance)`.