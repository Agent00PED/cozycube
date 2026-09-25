# CozyCube — project configuration

A Discord Activity: an isometric diorama hangout (Colyseus server + React Three Fiber client)
with seven worlds in the registry — Cozy Lounge (15x15, built), Campfire, Sunset Beach Bar, Velvet
Casino, Boxing Gym, Japanese Onsen and the Retro Arcade (registered, not rebuilt: each is a bare
floor with no seats or props until its world is authored).

## Layout

| Path | What lives there |
| --- | --- |
| `shared/types.ts` | Synced state shapes, economy constants, items, gestures, statuses, game contracts, map sizes |
| `shared/worlds/index.ts` | The world table: `WorldId`, `WORLDS` (map id, name, icon, size, built), `ACTIVE_WORLD` |
| `shared/worlds/lounge.ts` | The Loft's whole floor plan, authored once: zones, seats, props, colliders, spawns, Mochi's route |
| `shared/seats.ts` | Cushion descriptors and the avatar's hip constants; every seat anchor height is derived from them |
| `shared/collision.ts` | Obstacle boxes, spawns, `isBlocked`, `worldLimit` (the lounge is clamped to +-7.0) |
| `shared/props.ts` | Per-map seats and props with approach points, and `mochiSpot` (her wall-clock day) |
| `shared/pathfinding.ts` | Grid A* over the same collision the server validates against |
| `server/src/rooms/HangoutRoom.ts` | All authoritative logic (economy, seats, props, Mochi, chat, ...) |
| `server/src/db/players.ts` | PostgreSQL store (DATABASE_URL) with in-memory fallback |
| `client/src/scene/` | `IsometricCanvas` (fitted ortho camera), `WorldScene` (root), `LoungeWorld` (the room), `Props` (lamps, Mochi, seat pads), `kit` (primitives, `StaticBatch`), lighting per hour |
| `client/src/entities/` | `Avatar` and `Mochi` (pure GLTF loaders via `useGLTF`), `rig.ts` (node/material contracts), `ModelBoundary`, `MochiPlayroomModal`, `Players` |
| `client/public/models/` | The ONLY location for 3D assets: `avatar.glb`, `cat.glb` (Mochi), `props.glb` (the lounge's pillows, toaster, kettle, pot, fruit bowl, bread basket, mugs). All assets are authored in Blender |
| `scripts/blender/` | Blender Python automation scripts (executed via Live Bridge http://127.0.0.1:8192 or headless CLI) |
| `client/src/systems/` | `useLocalPlayerMovement` (click / WASD / joystick locomotion) and `input.ts` |
| `client/src/components/hud/` | The Cozy Clay HUD: header, world drawer, social drawer, `ActionDock`, modals, wardrobe |
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