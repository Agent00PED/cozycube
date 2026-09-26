# CozyCube — project configuration

A Discord Activity: an isometric diorama hangout (Colyseus server + React Three Fiber client)
with eight worlds in the registry, in the fast-travel grid's order — Cozy Lounge (15x15, built),
the Starlight Campfire (22x22, built, always night: a bonfire whose shared fuel burns down and is fed with chopped firewood (the Cozy Aura above 70%), a communal Dutch-oven stew, Well-Fed, roasting and a picnic table to leave skewers on, a river you fish from the dock's edge or the canoe (a Stardew-style reel: ten river species with sizes and stars, bite times by species, line tension, sunken treasure, AFK mode; a full creel stows the rod and rests the angler by the water, no bait spent) into a persisted Fish Creel (six tiers, 5 to 50 fish), Barnaby the otter angler's stall (buys the creel, sells rods and bait), Buster the beaver lumberjack's stall by the woodpile (buys split wood, Pine Resin and carved pieces; sells axes, seven tiers of wood carrier, 10 to 100 slots, and utility gear: work gloves that widen the chopping meter's gold, traction boots, a leather apron; buys the crafts carved at the carpenter's workbench beside his stall, between it and the tipi, both set back by the north pines: its own 🪚 Workbench button and modal, a Safe Carve or a Masterwork Push per piece, a broken carving salvaging half its wood and a pile of Sawdust for the fire), an organic nine-seat front-mounted firepit close round the fire (logs long, medium and curved, a stump, a boulder), a tipi (its glow dims while someone naps in it) and a second A-frame tent, picnic-table, camp-chair, stump and canoe seats, a raccoon to feed and ducks that dive when tapped, the guitar, a stargazing telescope (meteor-shower combos, constellation tracing), the Northern Timber Trail (four chopping stations in two pairs: one either side of the tipi, and a workshop pair: one beside Buster on his open side against the pines, one at the woodpile by the camper; a 3-hit combo whose log splits when 2 of the 3 swings land in the green, a gold centre being a critical chop (+3 coins or a Pine Resin, now and then), each block yielding 3 logs then restocking after a rolled 20-25 s) feeding the wood carrier (the header's 🪵 pill opens it: every slot, raw timber and carved crafts), firefly jars, a wood-chopping block, foraging, string lights, ducks, a raccoon and an owl, and a synthesized ambience), Sunset Beach Bar,
Japanese Onsen, Velvet Casino, Boxing Gym, Retro Arcade and the Gaming Cafe (registered, not built:
each is a bare floor with no seats or props until its world is authored).

## Layout

| Path | What lives there |
| --- | --- |
| `shared/types.ts` | Synced state shapes, economy constants, items, gestures, statuses, game contracts, map sizes |
| `shared/worlds/index.ts` | The world table: `WorldId`, `WORLDS` (map id, name, icon, size, built), `ACTIVE_WORLD` |
| `shared/worlds/lounge.ts` | The Loft's whole floor plan, authored once: zones, seats, props, colliders, spawns, Mochi's route |
| `shared/worlds/campfire.ts` | The Campfire's floor plan: `CAMPFIRE_LAYOUT` (plain JSON between markers, read as-is by `build_campfire.py`), `riverSpan` (the river spline; the builder has the same function), seats (two per log; hammock, tipi and A-frame tent lie seats), props (the bonfire, the fishing spots, the telescope, four chopping stations, four foraging patches, Barnaby, Buster, the workbench), the light strings and the wildlife's paths, colliders, spawns |
| `shared/worlds/casino.ts` | The Velvet Casino's floor plan: `CASINO_LAYOUT` (plain JSON between markers, for `build_casino.py`), its five zones (`casinoZoneAt`), the staff's stations (`CASINO_NPCS`: Mr. Vance in 1a; Boris, Vivienne, Jasper, Pippin in 1b), the roulette and blackjack tables' reach (`blackjackTableNear`), the slot row, the cage window, the exit doors, seats, colliders, spawns |
| `shared/casino.ts` | The casino's rules: Velvet Chips 🟡 (1:1 with coins, a saved balance exchanged only at Vance's cage; `netWorth` = coins + chips for the allowance and the leaderboard; `CashierRequest` / `CashierResult`), and roulette, slots and blackjack |
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
| `server/src/rooms/casino.ts` | `CasinoFloor`, the casino's rules on the server (the `BoardTable` pattern): the roulette loop, one blackjack hand per player, the slots and Mr. Vance's cage (`buyChips` / `cashOut` at the window), every stake and payout in chips; stakes are refunded on leave and on a map change, and follow a reconnecting player |
| `server/src/db/players.ts` | PostgreSQL store (DATABASE_URL) with in-memory fallback |
| `client/src/scene/` | `IsometricCanvas` (fitted ortho camera), `WorldScene` (root), `LoungeWorld` (the room), `CampfireWorld` (loads `campfire.glb`; fire light and fuel (out: no flames, sparks or smoke, the ember bed cold charcoal), moonlight, the midnight sky gradient, smoke, embers, bulb glows, foam rings, fireflies, stars) and `campfireLife` (the wildlife, the canoe, swaying strings, the river's flow and the pines' wind sway), `Props` (lamps, Mochi, seat pads, effects), `kit` (primitives, `StaticBatch`), lighting per hour |
| `client/src/entities/` | `Avatar`, `Mochi`, and the Campfire's shopkeepers `Barnaby` and `Buster` (`CampNpc`) (pure GLTF loaders via `useGLTF`), `rig.ts` (node/material contracts), `ModelBoundary`, `MochiPlayroomModal`, `Players` |
| `client/public/models/` | The ONLY location for 3D assets: `avatar.glb` (with its held props: mug, watering can, skewer, rod, guitar, bobber, hatchet, firefly net and jar, and the Heart emote's heart), `cat.glb` (Mochi), `props.glb` (the lounge's small props), `campfire.glb` (the Campfire diorama, its animated wildlife and props as named nodes: the Dutch oven, the picnic plates' skewers, the chopping stations' hatchets and logs, `Prop_Workbench`), `barnaby.glb` (Barnaby the Angler and his stall), `buster.glb` (Buster the Lumberjack and his firewood stall). All assets are authored in Blender |
| `scripts/blender/` | Blender Python automation scripts (executed via Live Bridge http://127.0.0.1:8192 or headless CLI) |
| `client/src/audio/` | Synthesized sound, no audio files: `radio` (the lounge radio), `sfx` (one-shot effects), `ambience` (each world's soundscape, cross-faded, the campfire's fire and river placed round the listener, its fire channel following the bonfire's fuel), `soundSettings` (the Settings panel's three-channel ambience mixer (fire, river, forest) and Effects) |
| `client/src/assetVersion.ts` | The build's asset version (vite.config.ts): every model URL carries it, so a deploy is never served a cached model |
| `client/src/systems/` | `useLocalPlayerMovement` (click / WASD / joystick locomotion) and `input.ts` |
| `client/src/components/hud/` | The Cozy Clay HUD: header (at the campfire, the 🪵 wood pill and the 🪣 Fish Creel popover; `anglerStore` mirrors the camp profile to localStorage), `AFKFishingBar`, world drawer, social drawer, `ActionDock`, `CampfireStatus`, modals (`CookingModal`, `BarnabyModal`, `LumberjackModal`, `WoodCraftModal` (the workbench), `WoodCarrierModal`, fishing, stargazing, chopping, ...), wardrobe |
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