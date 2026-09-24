# Blender 3D Assembly & Modeling Skill Contract

Whenever authoring or refactoring 3D models via Blender scripts:

## 1. Assembly-First Methodology
- **Decompose Before Coding**: Break down any character or asset into discrete, modular volumetric primitives (Core, Connectors, Functional Elements, Details).
- **Socket & Relative Anchors**: Never place secondary meshes using arbitrary global coordinates. Derive their transforms relative to parent surfaces or defined connection sockets.
- **Primitive Kitbashing**: Use canonical primitives (Cylinder, Capsule, Cube, UV Sphere) with minimum necessary rings/segments, relying on non-destructive Modifiers (`Subdivision`, `Bevel`, `Solidify`) for organic curves.

## 2. Clay & Stylized Geometry Rules
- **Volume Fusion**: For contiguous stylized forms (like hair mass or doughy limbs), combine clean primitive masses with `Boolean Union` followed by controlled `Voxel Remesh` (size ~0.02) and `Smooth Shading` to eliminate sharp seams.
- **Strict Joint Pivoting**: Always explicitly set object origins to their mechanical/anatomical pivot axes before parenting.

## 3. Execution Verification Loop
- Ensure every generated component exposes clean object naming matching runtime contracts.
- Maintain non-destructive modifiers where dynamic scaling or rigging is required.

# 3D Modeling Skill: Digital Clay & Modular Assembly

When authoring stylized characters/assets in Blender:
1. **Modular Kitbashing**: Assemble complex silhouettes from basic primitives (UV Spheres, Cylinders, Capsules).
2. **Organic Fusion (Digital Clay Pipeline)**:
   - To build hair or organic masses, overlap primitive volumes smoothly.
   - Join meshes (`bpy.ops.object.join()`) and execute `bpy.ops.object.voxel_remesh(voxel_size=0.018)` to fuse intersecting geometry into a continuous, seamless clay mesh.
   - Apply a `Smooth` modifier (factor 0.5, repeat 2-3) to soften seams into soft clay-like bevels.
   - Apply a `Decimate` modifier (ratio 0.25 - 0.35) to keep polycount lightweight for web runtime.
3. **No Isolated Strands**: Never construct hair using rows of isolated cylinders or capsules. All volume must read as a cohesive, sculpted clay mass.
4. **Strict Socketing**: Ears must be anchored directly onto the skull boundary and protrude past the hair volume.