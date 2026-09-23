# CozyCube — project configuration

A Discord Activity: an isometric diorama hangout (Colyseus server + React Three Fiber client)
with seven worlds — Cozy Lounge (26x26), Campfire (28x28), Sunset Beach Bar (28x28), Velvet
Casino (26x26), Boxing Gym (24x24), Japanese Onsen (26x26) and the Retro Arcade (24x24).

## Layout

| Path | What lives there |
| --- | --- |
| `shared/types.ts` | Synced state shapes, economy constants, items, gestures, statuses, blackjack/slots/chat contracts, map sizes |
| `shared/props.ts` | Per-map seats and interactive props, plus their approach points (anchors derived) |
| `shared/seats.ts` | Cushion descriptors; every seat anchor height is derived from them |
| `shared/collision.ts` | Obstacle boxes, spawn points, scenery rules, `isBlocked`, `walkY` (bridge, pit, VIP platform, bluff, ring, onsen pool) |
| `server/src/rooms/HangoutRoom.ts` | All authoritative logic (economy, casino, blackjack, slots, fishing, boxing, onsen, arcade, Mochi, daily checklist, vibe bonus, seats, chat) |
| `server/src/rooms/games.ts` | Pure game rules: fish tables, gacha odds, the daily roll, checkers |
| `server/src/db/players.ts` | PostgreSQL store (DATABASE_URL) with in-memory fallback, schema init, debounced writes |
| `client/src/audio/` | `SoundManager` (buses, settings, gesture unlock) and the synthesised effects |
| `client/src/systems/` | Client movement, and `input.ts` (WASD / joystick steering) |
| `client/src/scene/` | The seven world scenes, the shared mesh kit, `Occluder` (dither fade), camera and lighting |
| `client/src/components/` | Avatars (outfits, gloves, towel, aura), interactive props (`ToggleableProp`, `WorldProps`, `LivingProps`), the scene root |
| `client/src/components/hud/` | Cozy Clay HUD: header, world drawer, social drawer (with the daily checklist), action dock, boxing HUD, and the per-world modals (fishing reel, gacha, claw, Snake, wish, matcha, blender, jukebox, checkers, Mochi playroom, slots, blackjack), wardrobe |
| `scripts/validate-world.ts` | `npm run check-layout` — every approach point must be reachable |

## Verification before any commit

1. `cd client && npx tsc --noEmit -p .` — 0 errors
2. `cd server && npx tsc --noEmit -p .` — 0 errors
3. `npm run check-layout` — 100% pass
4. `npm run build`

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
- Clear Headroom: Maintain at least 1.2–1.5 units of vertical clearance between the seat surface and any overhead geometry (Tiki bar roofs, tent canvas).
- Platform Leveling: Modular cushions (daybeds, sectionals) must share a unified, flush top platform height to eliminate sunken trenches.
- Yaw Lock: Lock `avatar.rotation.y` to face outward into the room space, never toward backrests or walls.

### B. Group Hierarchy & Relative Transforms
- Multi-part props (trees + foliage, tents + guy ropes/pegs, desks + accessories, pets) MUST reside within a single parent `<group>`.
- All child mesh coordinates must be relative to the group origin `(0, 0, 0)`.
- Apply all scale, position, and rotation transformations to the parent `<group>`, never to individual child primitives, preventing detached leaves, floating coconuts, or stray limbs.

### C. Shadow Pipeline & Clean Materials (Zero Dithering)
- Stylized low-poly meshes, structures, and foliage must use completely opaque materials (`transparent: false`, `roughness: 0.7 - 0.9`) to eliminate screen-door dithering artifacts with directional shadow maps.
- Avoid using `alphaTest` with directional shadow maps without custom depth materials.
- For water planes: set `transparent: true`, `depthWrite: false`, and assign explicit `renderOrder={1}` so submerged elements render properly.
- Cap total draw calls between 110–130 per map. Enforce `castShadow={false}` on secondary point lights and ambient fills.

### D. Walkable Surfaces & NavMesh Elevation
- Elevated Bridges & Ramps: When an avatar traverses elevated structures (e.g., wooden footbridges, elevated decks), update the walkable Y level to match the top plank surface to prevent legs from clipping through the deck.
- Invisible Colliders: Always construct invisible collision boxes along natural barriers (riverbanks, cliffs, bar counters, bridge railings).

### E. Spatial Zoning & Proximity Deduplication
- Material Zoning: Use contrasting floor materials (e.g., kitchen tile vs. living room parquet) to structure large diorama planes (20x20) and eliminate empty brown voids.
- Action Dock Logic: Group nearby triggers by `action.type` and render only ONE button for the target with `min(distance)`.
```

### Where this project currently stands against the skill

Honest notes so the standard is applied to real code rather than assumed:

- **A. Seat anchors** — derived, never authored. `shared/seats.ts` describes each seat's cushion
  primitive once (`CUSHIONS`), the worlds draw the cushion from it, and `shared/props.ts`
  computes every `sitY` through `anchored(mapId, ...)` = cushion surface + hip offset + the walk
  surface height (`walkY`). Onsen ledges are relative to the pool floor, bleachers to the gym
  floor. `Character3D` asserts its hip constants match.
- **B. Group hierarchy** — palms, tents, the cabana, the hammock, the ring, the tea house, the
  well, every arcade machine and Mochi are each one group; Mochi's per-world outfit is a child.
- **C. Materials / draw calls** — all stylized meshes opaque; `StaticBatch` merges the static
  world, and `Occluder` (a self-batching group) dithers tall things to 25% when they stand
  between the camera and you: the tiki roof, the cabana, the palm crowns, the lifeguard tower,
  the lounge slat screen, the tea house and well roofs, the cherry trees, the ring's lighting
  truss, the arcade's big screen. Measured at the default zoom: Lounge ~137 (its fixed frame shows the whole 15x15 room, no shadow pass),
  Boxing 95, Onsen 82, Arcade 86 (143 beside the cabinets), Casino 156, Campfire 113; the beach
  with the whole 28x28 island in view reads ~190, mostly the living things (avatars, Mochi,
  critters, the NPC) and seat/prop hit pads, which never merge. The always-visible HUD chrome
  has no `backdrop-filter`.
- **D. Walkable elevation** — `walkY(mapId, x, z)` lifts avatars onto the campfire bridge and
  bluff, the casino VIP platform and the boxing ring (steps on the south side), and drops them
  into the lounge pit and the onsen pool. Each raised or sunken surface has its own click
  target in `ProceduralRoom`. Maps have their own size (`MAP_HALF`); indoor back walls stay
  at `ROOM_HALF` (-10), and the extra ring is a terrace, foyer, corridor or dunes.
- **E. Zoning / dedupe** — floor zoning (kitchen tile, emerald blackjack wing, pit rug, foyer
  checker marble, the gym's rubber mat, the arcade's dance floor) and the action dock's dedupe
  by `action.type` are in place; the dock now shows a single contextual button.
- **Persistence** — `server/src/db/players.ts`; wallet, unlocked items (hats and outfits), the
  stored look, stats, the daily checklist and Mochi's daily coin are hydrated on join, saved on
  a 2.5 s debounce, flushed on leave. Railway needs a PostgreSQL service attached so
  `DATABASE_URL` is set; without it the server logs a warning and keeps everything in memory.
- **Verified on screen (Titan Infinity)** — all seven worlds render with no console errors; the
  7-card fast-travel grid; the gachapon (crank, capsule, reveal, coins paid); the wardrobe's
  outfit closet (bought the flannel vest, the avatar and the preview change, coins deducted);
  the lounge terrace, casino foyer, wider beach and river stones.
- **Zero-state re-initialisation (sixth pass)** — `shared/worlds/`, `client/src/entities/` and
  `client/src/scene/` were emptied and initialised again. `shared/worlds/index.ts` is the
  world table (`WorldId` "lounge" | "gym" | "arcade" | "onsen" | "casino" | "beach" |
  "campfire", `WORLDS` with each world's `mapId`, name, icon, tagline, half-size and
  indoor flag, `ACTIVE_WORLD` = "lounge", `worldOfMap`); the header's `MAP_LABELS` is derived
  from it. `client/src/entities/` holds the three entities: `Avatar.tsx` (the claymorphic player
  avatar with its walk/sit animation, nametag and speech bubble; exported as `Avatar` and, for
  the rest of the app, `Character3D`), `Mochi.tsx` (the loaf cat, below) and
  `MochiPlayroomModal.tsx` (the 3D playroom, below). `client/src/scene/` was re-initialised
  with the scene manager (`ProceduralRoom` picks the world by map id, `IsometricCanvas` is the
  camera rig, `kit.tsx` the mesh kit and static batcher) plus the six other worlds' scene files,
  brought back unchanged from git so those maps keep rendering; the lounge is the reference
  build.
- **The lounge ("the Loft", fifth rebuild: artisan 15x15)** — the lounge file, the Mochi
  file and the layout module were physically deleted and written again. Its whole floor plan
  lives in ONE shared module, `shared/worlds/lounge.ts` (`LOFT_HALF` 7.5, `LOFT_WALL_HEIGHT`,
  `LOFT_FRAME`, `LOFT_SEAT_REACH`, `LOFT_PIT`, `LOFT_SEATS`, `LOFT_PROPS`, `LOFT_OBSTACLES`,
  `LOFT_SPAWNS`, `LOFT_MOCHI` plus the named zones), which `shared/props.ts`,
  `shared/collision.ts` and `shared/types.ts` re-export, and `client/src/scene/LoungeWorld.tsx`
  draws from the same constants. One visual language: every material is made in-file, matte
  (roughness 0.7..0.85, metalness at most 0.1), in warm oak and walnut, forest olive, vanilla
  cream, terracotta and muted brass; NOTHING in the room casts or receives a shadow map (the
  theme's `shadowless` flag turns the sun's shadow off and keeps the room's own warm ambient,
  `#fff5e6`), so it is lit by ambient light, the hearth's point light and the lamps' and
  pendants' soft lights. Proportions follow the 1.3-unit avatar: counters 0.68, seats 0.36,
  stools 0.48, tables 0.58. Zones: the hearth (brick breast, TV over the mantel, a fire with
  its point light nestled in the firebox, a built-in bookcase), the reading nook (lamp BEHIND
  the wingback), three recessed windows on the left wall and one over the kitchen sink (frames
  embedded 0.06 into the wall and 0.12 proud, panes 0.02 proud: glass and frame faces 0.1
  apart), the pit with a CLOSED corner sofa (one continuous base and back, a corner seat
  `pit_c`), the kitchen (counter run, fridge, island with three stools, bistro table for two an
  1.8 corridor away, pendants hung on cords from the ceiling plane), the lounge corner
  (loveseat, armchair with rolled arms joined to the seat, lamp behind), the games table under
  the last window, the record console, four plants. No arcade cabinet or jukebox in the lounge
  any more. Every seat is a "pad" seat drawn here from its cushion in `shared/seats.ts`. Rugs
  are two-tone discs, never floor-coloured.
- **Camera frame** — `cameraFocus.frame` (`setCameraFrame` in `scene/cameraFocus.ts`): a
  world can ask the rig to hold a centre and fit N world units across the viewport instead of
  following the player. `WorldScene` sets `LOFT_FRAME` (centre [0, 0], 15.8 units) in the
  lounge and clears it elsewhere; `IsometricCanvas` `fitZoom` derives the zoom from the
  isometric diagonal and the wall height, refitted on resize. Wheel/pinch still zoom, drag
  still pans. The dock offers a lounge seat from `LOFT_SEAT_REACH` (1.5 units, measured to the
  seat or its approach point) instead of the usual 2.8.
- **Mochi** — her model is `client/src/entities/Mochi.tsx`, one seamless compound mesh: the
  loaf rests flush on the floor with her tabby stripes and cream chest painted as VERTEX
  COLOURS into its own sphere geometry (no marking mesh above her back), a neck sphere fills
  the crease under the head, the paws grow out of a cream chest bulge buried in the underbelly,
  the tail grows from a root sunk in the rump, the ears are cones sunk into the skull and the
  closed happy eyes, nose, blush, smile and whiskers are merged with the face. All matte
  (roughness 0.85, metalness 0). She is driven through a `MochiDrive` ref (stretch, lick,
  walking, happy, head yaw/pitch, pounce, chew). The world cat (`components/LivingProps.tsx`
  `Cat`) fills the drive from her SHARED day: `mochiSpot(mapId, wallClockSeconds)` in
  `shared/props.ts` (loaf 20 s, stretch and yawn, waddle, lick a paw) over `MOCHI_WAYPOINTS`,
  which may repeat a spot: in the lounge she loops hearthrug -> sunlit window bay -> hearthrug
  -> kitchen mat, so no leg crosses the pit. Her per-world outfits sit in a group 0.105 lower
  than they were fitted for. The playroom (`hud/MochiPlayroom.tsx`) mounts the SAME model in
  its own `<Canvas>` with its own lights (ambient 1.0 `#fff5e6` plus two warm point lights):
  the feather follows the pointer, her head follows the feather, a flick pounces, the treat
  chews, the scritch purrs. The validator checks every approach is walkable and reachable AND
  samples each straight leg between her waypoints against the colliders.
- **Header** — the day/night pill is present at every width: icon-only below `lg`, with the
  hour's name and chevron from `lg`. At 360 px the three clusters end at x = 355 (no overflow).
- **Known gaps** — the fishing reel, claw, Snake, wish, matcha, blender, jukebox, checkers and
  boxing HUD were verified by type-check and by reading the server handlers they talk to, not
  exercised on screen; the scritch meter was not held on screen; the new ambience beds and SFX
  were not listened to. In the browser pane R3F frames only advance while the pane renders, so
  walks were driven by screenshot bursts and one test moved the server-side position with
  spaced `move` messages instead.
