# CozyCube — project configuration

A Discord Activity: an isometric diorama hangout (Colyseus server + React Three Fiber client)
with eight worlds in the registry, in the fast-travel grid's order — Cozy Lounge (15x15, built),
the Starlight Campfire (22x22, built, always night: a bonfire whose shared fuel burns down and is fed with chopped firewood (the Cozy Aura above 70%), a communal Dutch-oven stew, Well-Fed, roasting and a picnic table to leave skewers on, a river you fish from the dock's edge or the canoe (a Stardew-style reel: ten river species with sizes and stars, bite times by species, line tension, sunken treasure, AFK mode; a full creel stows the rod and rests the angler by the water, no bait spent) into a persisted Fish Creel (six tiers, 5 to 50 fish), Barnaby the otter angler's stall (buys the creel, sells rods and bait), Buster the beaver lumberjack's stall by the woodpile (buys split wood, Pine Resin and carved pieces; sells axes, seven tiers of wood carrier, 10 to 100 slots, and utility gear: work gloves that widen the chopping meter's gold, traction boots, a leather apron; buys the crafts carved at the carpenter's workbench beside his stall, between it and the tipi, both set back by the north pines: its own 🪚 Workbench button and modal, a Safe Carve or a Masterwork Push per piece, a broken carving salvaging half its wood and a pile of Sawdust for the fire), an organic nine-seat front-mounted firepit close round the fire (logs long, medium and curved, a stump, a boulder), a tipi (its glow dims while someone naps in it) and a second A-frame tent, picnic-table, camp-chair, stump and canoe seats, a raccoon to feed and ducks that dive when tapped, the guitar, a stargazing telescope (meteor-shower combos, constellation tracing), the Northern Timber Trail (four chopping stations in two pairs: one either side of the tipi, and a workshop pair: one beside Buster on his open side against the pines, one at the woodpile by the camper; a 3-hit combo whose log splits when 2 of the 3 swings land in the green, a gold centre being a critical chop (+3 coins or a Pine Resin, now and then), each block yielding 3 logs then restocking after a rolled 20-25 s) feeding the wood carrier (the header's 🪵 pill opens it: every slot, raw timber and carved crafts), firefly jars, a wood-chopping block, foraging, string lights, ducks, a raccoon and an owl, and a synthesized ambience), Sunset Beach Bar,
Japanese Onsen, the Velvet Casino (20x20, built: a compact mid-century Art-Deco hall in six zones,
the marble foyer with Mr. Vance's Golden Cage (coins into Velvet Chips and back, 1:1; the chip is
drawn by `VelvetChipIcon`, never an emoji), Madame Zara and the capsule machine in its nook; the main
floor's roulette (an animated European wheel over the board while it spins), craps and two
multi-seat blackjack tables against the east rail, dealers behind them facing the floor (Table 1
casual with Cedric the badger, Table 2 high stakes with Gideon the greyhound; rounds for everyone
seated, split and double); Neon Alley's five slots, the Mechanical Turf Club's four-horse derby and
the coin pusher (its shelf shared and kept across restarts); the raised High-Roller Stage's
Three-Card Poker with Boris and Bruno at the penthouse's gilded doors; the Velvet Lounge's bar
(Pippin's drinks and free Fish Pretzels), 8-ball table (solo, or a two-player match: turns, fouls,
ball in hand, solids and stripes), Chesterfield and, in its far corner, the baby grand (a
public-domain or original recital for the hall, or play it yourself); the Velvet Penthouse, a 10x10
suite reached only with the Black Velvet VIP Pass (5,000 chips from Bruno or Mr. Vance, pawned back
to Vance for 2,500, kept in the account): high-limit poker with Boris and Baron von Fox, baccarat
(Punto Banco) beside Duchess Penelope, the Golden Vault slot, the city's lights through its windows;
blackjack, poker, baccarat and the piano are played sitting down (walking up seats you at the
nearest free seat; a full table says so), the standing tables from any side of their rims; every
stake within its table's limits (`TABLE_LIMITS`: presets, a minimum, an ALL IN capped at the
table's max, a brass placard); the staff and regulars look at you, wave, gesture and have a word;
twenty-one chibi patrons and Bella the cocktail bunny wander the floor, and patrons take turns at the
slots and the coin pusher (`state.machines`: a machine in use refuses anyone else, "Excuse me" asks
the patron to finish); the casino's panels use Cinzel, Outfit and Playfair Display with gold foil
and brass; a synthesized late-night jazz combo plays, no noise bed), Boxing Gym, Retro Arcade and the
Gaming Cafe (registered, not built:
each is a bare floor with no seats or props until its world is authored).

## Layout

| Path | What lives there |
| --- | --- |
| `shared/types.ts` | Synced state shapes, economy constants, items, gestures, statuses, game contracts, map sizes |
| `shared/worlds/index.ts` | The world table: `WorldId`, `WORLDS` (map id, name, icon, size, built), `ACTIVE_WORLD` |
| `shared/worlds/lounge.ts` | The Loft's whole floor plan, authored once: zones, seats, props, colliders, spawns, Mochi's route |
| `shared/worlds/campfire.ts` | The Campfire's floor plan: `CAMPFIRE_LAYOUT` (plain JSON between markers, read as-is by `build_campfire.py`), `riverSpan` (the river spline; the builder has the same function), seats (two per log; hammock, tipi and A-frame tent lie seats), props (the bonfire, the fishing spots, the telescope, four chopping stations, four foraging patches, Barnaby, Buster, the workbench), the light strings and the wildlife's paths, colliders, spawns |
| `shared/worlds/casino.ts` | The Velvet Casino's floor plan (20x20): `CASINO_LAYOUT` (plain JSON between markers, for `build_casino.py`), its zones (`casinoZoneAt`), the stages (`casinoFloorY`), the staff's stations (`CASINO_NPCS`), the tables' reach (`blackjackTableNear` with each table's tier, dealer and stools, `nearGameTable`), the seated games (`SEATED_GAMES`, `seatedGameOf` / `seatedGameAt`) and the standing tables' rims (`tablePerimeter`), the one-player machines (`SINGLE_MACHINES`), the penthouse's doors (`VIP_DOORS`, `VIP_DOORS_FRONT`), the walkable regions (`CASINO_REGIONS`: the hall and the penthouse), the slot row, the cage window, the exit doors, seats, colliders, spawns, the crowd's and Bella's spots |
| `shared/worlds/casino_vip.ts` | The Velvet Penthouse (10x10, a walled region of the casino's map off to the side of the hall at `VIP_OFFSET`, reached only by Bruno's teleport): `VIP_LAYOUT` (plain JSON for `build_casino_vip.py`), `VIP_FRAME` (the camera's), `inPenthouse`, the arrival and elevator, the high-limit poker and baccarat tables, the Golden Vault (`VAULT_SLOT`), its staff and high rollers (`VIP_NPCS`), seats, props, colliders |
| `shared/items.ts` | The casino's items: `VIP_PASS` (the Black Velvet VIP Pass: price and pawn value) |
| `shared/pool.ts` | The 8-ball table: `PoolSim` (fixed 1/120 s steps, only + - * / and sqrt: every client replays a shot identically), the rack, ball in hand, and `ruleOnShot` (fouls, groups, the 8) for the room's two-player match |
| `shared/casino.ts` | The casino's rules: Velvet Chips (1:1 with coins, a saved balance exchanged only at Vance's cage; `netWorth` = coins + chips; `CHIP_EMOTE`; `CHIP_CAP` 9,999,999), the betting matrix (`TABLE_LIMITS`, `allInBet`, `tableStake`, `limitPlacard`), roulette, slots (the Golden Vault's limits), blackjack's table rounds (`BlackjackTableView`, split, double), Three-Card Poker (and the Baron's hand beside yours), baccarat (`baccaratCoup`, the tableau), craps, the derby (`derbyPaces`: the same race on every client), the coin pusher's shared shelf, the one-player machines' occupants (`npcOccupant`, `OCCUPIED_LINE`), the piano's packets, the VIP pass's packets, the bar |
| `shared/pianoPieces.ts` | The baby grand's recital book (Für Elise, Satie's first Gymnopédie, an original), notes and lengths |
| `shared/chop.ts` | The wood-chopping combo's strokes (a ping-pong needle), logs (pine, oak, golden), the wood they split into, Buster's axes and the wood carrier's seven tiers (`WOOD_CARRIER_TIERS`): rolled and judged by the server, drawn by the client from the same functions |
| `shared/fishing.ts` | The angler's world: species per water (freshwater at the campfire, saltwater registered for the beach), sizes, stars, bite times, rods, baits, the Fish Creel and `FishingProfile` (the camp profile kept in the player record: creel, rods, baits, records, split wood, axes, carrier tier, crafted pieces, gear, resin and sawdust; `carrierLoad`), Well-Fed |
| `shared/crafting.ts` | Buster's workbench: `WOOD_RECIPES` (the five artisan crafts by tier: recipes in wood, prices, Masterwork prices, Safe and Push odds), the roll, the broken-carving salvage, Sawdust and Pine Resin |
| `shared/gear.ts` | Buster's utility gear (gloves, boots, apron) and each one's effect: the chopping meter's gold, the bonus log, the walking pace, the workbench's odds and salvage |
| `shared/bonfire.ts` | The campfire's shared hearth: the bonfire's fuel and Cozy Aura, `getBonfireVisualState` (its flames, light and smoke by fuel: out at 0% with no smoke, thick warning smoke while dying at 1-20%, a steady column at 21-60%, thin fast wisps at 61-100%), the Dutch oven's stew, the picnic table's plates (room state; `BONFIRE_STATE_UPDATE` / `STEW_STATE_UPDATE`) |
| `shared/seats.ts` | Cushion descriptors and the avatar's hip constants; every seat anchor height is derived from them |
| `shared/collision.ts` | Obstacle boxes, spawns, `isBlocked`, `worldLimit` (the lounge is clamped to +-7.0) |
| `shared/props.ts` | Per-map seats and props with approach points, and `mochiSpot` (her wall-clock day) |
| `shared/pathfinding.ts` | Grid A* over the same collision the server validates against |
| `server/src/rooms/HangoutRoom.ts` | All authoritative logic (economy, seats, props, Mochi, chat, ...); each channel's scene (its world, the hour, the campfire's fire, stew and picnic plates) is saved beside its board game and restored when the room is created again (a restart or a redeploy never sends anyone back to the lounge or relights a fire) |
| `server/src/rooms/casino.ts` | `CasinoFloor`, the casino's rules on the server (the `BoardTable` pattern): the roulette loop, each blackjack table's rounds for its seated players (a betting window, a turn clock, split and double), the slots, Three-Card Poker from a chair (the Baron's hand at the penthouse's table), baccarat's coups (the Duchess wagers too), each player's craps, the Turf Club's one race for the room, the coin pusher's shared shelf (saved with the scene), the pool match (a relayed shot, the shooter's report, the ruling), the machines' occupants (patrons coming and going, a player's hold, "Excuse me"), the piano's recitals and notes (from its bench), the VIP pass (bought from Bruno or at the cage, pawned at the cage) and the penthouse's doors (a teleport both ways), and Mr. Vance's cage (`buyChips` / `cashOut` at the window), every stake within its table's limits and every payout in chips; stakes still open are refunded on a map change and follow a reconnecting player |
| `server/src/db/players.ts` | PostgreSQL store (DATABASE_URL) with in-memory fallback |
| `client/src/scene/` | `IsometricCanvas` (fitted ortho camera), `WorldScene` (root), `LoungeWorld` (the room), `CampfireWorld` (loads `campfire.glb`; fire light and fuel (out: no flames, sparks or smoke, the ember bed cold charcoal), moonlight, the midnight sky gradient, smoke, embers, bulb glows, foam rings, fireflies, stars) and `campfireLife` (the wildlife, the canoe, swaying strings, the river's flow and the pines' wind sway), `CasinoWorld` (loads `casino.glb`; its floor layers offset, the roulette wheel following the room's phase, the neon breathing, the dice, the derby's horses, the penthouse's doors swinging out, the piano heard across the hall, a warm fill and point lights at the chandeliers, walls, cage, bar and lounge, a plum backdrop; only one of the hall and the penthouse is drawn at a time), `CasinoVipWorld` (loads `casino_vip.glb`: the city breathing, the champagne tower's bubbles, its own warm light; the camera frames it by `VIP_FRAME`), `Props` (lamps, Mochi, seat pads, effects), `kit` (primitives, `StaticBatch`), lighting per hour |
| `client/src/entities/` | `Avatar`, `Mochi`, the Campfire's shopkeepers `Barnaby` and `Buster` and the casino's staff (`CasinoStaff`: Vance, Boris, Vivienne, Cedric, Gideon, Jasper, Pippin, Bruno, and upstairs Boris, Baron von Fox and Duchess Penelope) through `CampNpc` (breathing, a swaying tail, a look at whoever comes near, a wave; `y` stands one on a platform; `talk`: a speech bubble on a click, a room message or entering an area; `gestureOn` / `idle`: a clap, a shuffle, a knock, a shake), `AmbientPatrons` (the chibi crowd, the patrons at the machines (a lever pulled, a coin dropped) and Bella: one instanced mesh per figure, limbs swung in the vertex shader) (pure GLTF loaders via `useGLTF`), `rig.ts` (node/material contracts), `ModelBoundary`, `MochiPlayroomModal`, `Players` |
| `client/public/models/` | The ONLY location for 3D assets: `avatar.glb` (with its held props: mug, watering can, skewer, rod, guitar, bobber, hatchet, firefly net and jar, and the Heart emote's heart), `cat.glb` (Mochi), `props.glb` (the lounge's small props), `campfire.glb` (the Campfire diorama, its animated wildlife and props as named nodes: the Dutch oven, the picnic plates' skewers, the chopping stations' hatchets and logs, `Prop_Workbench`), `barnaby.glb` (Barnaby the Angler and his stall), `buster.glb` (Buster the Lumberjack and his firewood stall), `vance.glb` (Mr. Vance, the casino's fox cashier: every colour a vertex colour, one clay material per node, five draw calls), `boris.glb`, `vivienne.glb`, `jasper.glb`, `pippin.glb`, `bruno.glb`, `cedric.glb`, `gideon.glb`, `baron.glb`, `penelope.glb` (the casino's staff and regulars, built the same way; the Baron and the Duchess built seated), `patrons.glb` (the chibi crowd and Bella: one node each, limbs and tint in the UVs, pivots in the extras), `casino.glb` (the Velvet Casino: one static mesh with a slot per finish, so about one draw call per material, and its moving nodes: `Prop_RouletteWheel`, the dice, the derby horse, the pusher plate, the cue ball, the penthouse's door leaves), `casino_vip.glb` (the Velvet Penthouse, built at its place in the world, and `Prop_FountainTop`). All assets are authored in Blender |
| `scripts/blender/` | Blender Python automation scripts (executed via Live Bridge http://127.0.0.1:8192 or headless CLI). The bridge takes a JSON body `{"code": "..."}`, queues it and returns nothing, and execs with separate globals and locals: run a builder inside its own namespace (`exec(compile(src, ...), ns)`) with `REPO_ROOT` and `REPORT_PATH` set in `ns`, and read the report file it writes |
| `client/src/audio/` | Synthesized sound, no audio files: `radio` (the lounge radio), `sfx` (one-shot effects), `ambience` (each world's soundscape, cross-faded, the campfire's fire and river placed round the listener, its fire channel following the bonfire's fuel), `casinoJazz` (the Velvet Casino's jazz combo: a clean sine upright bass, soft band-limited brushes and a dark ride, FM Rhodes comping, a muted trumpet, on a look-ahead scheduler; no noise bed), `casinoCrowd` (the murmur under it, mixed a touch below the band), `piano` (the baby grand: recitals and single notes), `soundSettings` (the Settings panel's ambience mixer (fire, river, forest), the Casino Jazz fader and Effects) |
| `client/src/assetVersion.ts` | The build's asset version (vite.config.ts): every model URL carries it, so a deploy is never served a cached model |
| `client/src/systems/` | `useLocalPlayerMovement` (click / WASD / joystick locomotion) and `input.ts` |
| `client/src/components/hud/` | The Cozy Clay HUD: header (at the campfire, the 🪵 wood pill and the 🪣 Fish Creel popover; `anglerStore` mirrors the camp profile to localStorage; the Velvet Chip pill, lit in the casino and dimmed elsewhere while you hold chips), `VelvetChipIcon`, `BetControls` (the tables' presets and ALL IN), `AFKFishingBar`, world drawer, social drawer, `ActionDock`, `CampfireStatus`, modals (`CashierModal` (Mr. Vance's cage, and the VIP pass), `VipPassModal` (Bruno), `BlackjackModal` (the whole table), `BaccaratModal`, `PokerModal`, `CrapsModal`, `DerbyModal`, `CoinPusherModal`, `PoolModal`, `PianoModal`, `RoulettePanel` and `RouletteWheel`, `CookingModal`, `BarnabyModal`, `LumberjackModal`, `WoodCraftModal` (the workbench), `WoodCarrierModal`, fishing, stargazing, chopping, ...), wardrobe |
| `scripts/validate-world.ts` | `npm run check-layout`: every approach point open and reachable, Mochi's route clear, seat anchors derived |

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