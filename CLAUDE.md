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
  truss, the arcade's big screen. Measured at the default follow-camera zoom: Lounge ~105,
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
- **Known gaps** — the fishing reel, claw, Snake, wish, matcha, blender, jukebox, checkers,
  Mochi playroom and boxing HUD were verified by type-check and by reading the server handlers
  they talk to, not exercised on screen in this session; the new ambience beds and SFX were not
  listened to. Mochi's wander is client-side (deterministic in wall-clock time) while the
  server still measures "near Mochi" from her home spot.
