# CozyCube — project configuration

A Discord Activity: a 20x20 isometric diorama hangout (Colyseus server + React Three Fiber client)
with four maps — Cozy Lounge, Campfire, Sunset Beach Bar, Velvet Casino.

## Layout

| Path | What lives there |
| --- | --- |
| `shared/types.ts` | Synced state shapes, economy constants, items, gestures, statuses |
| `shared/props.ts` | Per-map seats and interactive props, plus their approach points |
| `shared/collision.ts` | Obstacle boxes, spawn points, scenery rules, `isBlocked` |
| `server/src/rooms/HangoutRoom.ts` | All authoritative logic (economy, casino, fishing, seats) |
| `client/src/scene/` | The four world scenes, the shared mesh kit, camera and lighting |
| `client/src/components/` | Avatars, interactive props, the scene root |
| `client/src/components/hud/` | HUD: top bar, action dock, roulette panel, wardrobe |
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
  computes every `sitY` from it through `anchored()` (`surfaceY = 0.5 * h + y`, then
  `+ AVATAR_HIP_OFFSET - AVATAR_HIP_Y`). `Character3D` asserts its hip constants match. The Tiki
  roof lift (`ROOF_LIFT` in `BeachWorld.tsx`) is computed from the stool anchor + seated height +
  headroom.
- **B. Group hierarchy** — palms are built per tree about their own base (`palmParts`) and baked
  (`bakeGroups`); tents own their porch, flaps, ropes and pegs; Mochi's tail hugs the loaf.
- **C. Materials / draw calls** — palms are fully opaque (no occluder dithering). `StaticBatch`
  normalises custom geometry (index + uv) before merging, so hand-built triangle soups no longer
  break a whole material bucket. Last measured at the default zoom: Lounge 110, Campfire 115,
  Casino 118, Beach 138 (the beach carries two avatars, the sea and three sparkles). All
  `PointLight`s pass `castShadow={false}`.
- **D. Walkable elevation** — `walkY(mapId, x, z)` in `shared/collision.ts` lifts the walk plane
  onto the campfire bridge deck (`BRIDGE_DECK_Y`) with short ramps; both local and remote avatars
  use it. Riverbank and bridge-rail colliders remain in `inScenery`.
- **E. Zoning / dedupe** — floor-material zoning and action-dock deduplication by `action.type`
  are in place; the fireside offers "Sit" and "Roast" as two types on purpose.
- **Known gaps** — the 3D payout confetti (`PayoutConfetti`, fires on a >= 50 coin win) has not
  been seen in a browser; the wardrobe's `defaultLook` snaps the server's pastel shirt to the
  nearest palette colour (before that, a fresh player's wardrobe edits were rejected silently).
