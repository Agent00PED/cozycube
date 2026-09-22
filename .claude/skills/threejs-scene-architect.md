---
name: threejs-scene-architect
description: Engineering protocol for Three.js / React Three Fiber work in CozyCube. Use when auditing, modifying, or creating 3D diorama maps, meshes, seat anchors, avatar accessories, lighting and shadows, walkable surfaces, or collision boundaries — including layout changes in client/src/scene, client/src/components, shared/props.ts and shared/collision.ts.
---

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

## Project bindings (CozyCube)

- Seats and props: `shared/props.ts`; obstacle boxes and scenery rules: `shared/collision.ts`.
  Any geometry move must move its obstacle box and approach point together.
- Verify every layout change with `npm run check-layout` (each approach point must sit outside
  every collision box, with the 0.3 player radius included), then `tsc --noEmit` on client and
  server, then `npm run build`.
- Measure draw calls in the dev build via `window.__r3f` → `gl.info.render.calls`, and read the
  figure only after a frame has actually rendered.
