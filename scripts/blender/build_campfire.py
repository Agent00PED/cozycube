"""The Starlight Campfire diorama: builds client/public/models/campfire.glb.

Run it inside Blender, through the Live Bridge (it executes the POSTed body as Python):

    curl -X POST http://127.0.0.1:8192 --data-binary @scripts/blender/build_campfire.py

or headless:

    blender -b -P scripts/blender/build_campfire.py

As with the other builders, define REPO_ROOT (and optionally REPORT_PATH, where a JSON summary or
the traceback is written) in front of the body when it is POSTed without a `__file__`.

Nothing here is placed by hand: where everything stands comes from CAMPFIRE_LAYOUT in
shared/worlds/campfire.ts (the JSON between its layout markers, read as is), and the seats'
heights from the cushions in shared/seats.ts (log, hammock, tentMat), the same numbers the game's
walkable floor and seat anchors are derived from. A stylised chibi clay island, every material
opaque and matte (roughness 0.7-0.9; the water a little glossier), one object per named part:

    Campfire_Ground     the floating island: moss on top, midnight soil on its bevelled sides, the
                        pond dug into its east side (a dark bed, stone walls)
    Campfire_Underside  the rock tapering away beneath it, so it floats
    Campfire_Paths      the packed-dirt clearing round the fire and the paths off it
    Campfire_Grass      patches of darker and lighter moss
    Campfire_Water      the pond's glossy surface
    Prop_Bonfire        the stone ring, the teepee of logs, the ash and the glowing ember bed
    Fire_Flame_Outer    the fire's flames, two nested teardrops (their origin at the base: the
    Fire_Flame_Inner    game flickers them by scaling)
    Seat_Log_01..04     the fallen-log benches round the fire
    Prop_FishingSpot    the plank pier out over the pond, its posts and its lantern
    Pier_Lantern_Glow   the lantern's glass (the game lights it)
    Seat_Tent           the canvas tipi, flap open toward the fire, poles out of its crown, a mat
                        and a pillow inside
    Seat_Hammock        the striped hammock, its spreader bars and ropes (its pines are trees)
    Campfire_Trees      the pines along the back edges and the hammock's two
    Campfire_Rocks      river boulders
    Campfire_Fence      the rustic rail fence along the front edges
    Campfire_Deco       mushrooms, wildflowers, bushes and the woodpile

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts, so every number below
reads as in campfire.ts.
"""

import json
import math
import os
import random
import re
import traceback

import bmesh
import bpy
from mathutils import Vector

COLLECTION = "Campfire"

PALETTE = {
    "CF_Grass": "#5B7A4E",
    "CF_GrassDark": "#4A6642",
    "CF_GrassLight": "#6F8D58",
    "CF_Soil": "#3A2D25",
    "CF_SoilDeep": "#2A211C",
    "CF_Dirt": "#8B6B4C",
    "CF_PondBed": "#2E4A52",
    "CF_Water": "#4A89A6",
    "CF_Stone": "#8E8C88",
    "CF_StoneDark": "#6D6A66",
    "CF_Bark": "#5E4230",
    "CF_WoodCut": "#D2A774",
    "CF_Pine": "#2E5A46",
    "CF_PineLight": "#3B6E53",
    "CF_Canvas": "#EADFC8",
    "CF_CanvasStripe": "#C8704A",
    "CF_Pole": "#8A6440",
    "CF_Hammock": "#D98E6E",
    "CF_HammockStripe": "#F2DDB0",
    "CF_Rope": "#CDB48A",
    "CF_Plank": "#9C7148",
    "CF_PlankDark": "#7C5838",
    "CF_Fence": "#7A5A3C",
    "CF_Ash": "#4A4440",
    "CF_Ember": "#FF6A2A",
    "CF_FlameOuter": "#FF8C32",
    "CF_FlameInner": "#FFD36E",
    "CF_LanternGlass": "#FFD27A",
    "CF_Metal": "#3E3A36",
    "CF_Mat": "#7D8F6A",
    "CF_Pillow": "#E8D6B0",
    "CF_MushCap": "#C9523F",
    "CF_MushStem": "#EFE3CF",
    "CF_Petal": "#F2B8C6",
    "CF_PetalYellow": "#F4D35E",
}
ROUGHNESS = {"CF_Water": 0.25, "CF_Metal": 0.6}
# glowing things: (strength) of an emission in their own colour
EMISSION = {"CF_Ember": 2.2, "CF_FlameOuter": 3.0, "CF_FlameInner": 4.0, "CF_LanternGlass": 2.5}
# thin sheets seen from both sides
DOUBLE_SIDED = {"CF_Canvas", "CF_CanvasStripe", "CF_Hammock", "CF_HammockStripe"}


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    h = hex_color.lstrip("#")
    return tuple(_lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


def W(x, y, z):
    """The game's (x, y up, z) as a Blender point."""
    return Vector((x, -z, y))


# ---------------------------------------------------------------------------------------------
# reading the layout and the cushions out of the game's sources


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_campfire.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def read_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "campfire.ts"), encoding="utf-8").read()
    body = re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1)
    return json.loads(body)


def read_cushions(root):
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    out = {}
    for name in ("log", "hammock", "tentMat"):
        m = re.search(rf"\b{name}: \{{ y: ([0-9.]+), h: ([0-9.]+) \}}", src)
        y, h = float(m.group(1)), float(m.group(2))
        out[name] = {"y": y, "h": h, "top": y + h / 2}
    return out


# ---------------------------------------------------------------------------------------------
# mesh builders: each adds geometry to a bmesh, its faces in material slot `m`


def rounded_rect(x0, x1, z0, z1, r, per_corner=8):
    """An (x, z) outline of a rounded rectangle, going round once."""
    r = min(r, (x1 - x0) / 2, (z1 - z0) / 2)
    corners = [(x1 - r, z1 - r, 0.0), (x0 + r, z1 - r, math.pi / 2), (x0 + r, z0 + r, math.pi), (x1 - r, z0 + r, 1.5 * math.pi)]
    out = []
    for cx, cz, a0 in corners:
        for k in range(per_corner + 1):
            a = a0 + (math.pi / 2) * k / per_corner
            out.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return out


def wobbly_circle(cx, cz, r, n, amp, rng):
    phase = rng.random() * 6.28
    return [(cx + r * (1 + amp * math.sin(3 * a + phase) + amp * 0.5 * math.sin(5 * a + 2 * phase)) * math.cos(a), cz + r * (1 + amp * math.sin(3 * a + phase)) * math.sin(a)) for a in (2 * math.pi * k / n for k in range(n))]


def capsule(ax, az, bx, bz, half_w, n=10):
    """The (x, z) outline of a stadium from a to b, half_w wide each side."""
    dx, dz = bx - ax, bz - az
    d = math.hypot(dx, dz) or 1
    ux, uz = dx / d, dz / d
    nx, nz = -uz, ux
    out = []
    base = math.atan2(nz, nx)
    for k in range(n + 1):
        a = base + math.pi * k / n
        out.append((bx + half_w * math.cos(a) * 1, bz + half_w * math.sin(a)))
    for k in range(n + 1):
        a = base + math.pi + math.pi * k / n
        out.append((ax + half_w * math.cos(a), az + half_w * math.sin(a)))
    return out


def slab(bm, outline, y0, y1, m=0, top_m=None):
    """The (x, z) `outline` extruded from y0 to y1: a flat slab with an n-gon top and bottom."""
    lo = [bm.verts.new(W(x, y0, z)) for x, z in outline]
    hi = [bm.verts.new(W(x, y1, z)) for x, z in outline]
    faces = [bm.faces.new(list(reversed(lo))), bm.faces.new(hi)]
    faces[1].material_index = m if top_m is None else top_m
    faces[0].material_index = m
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
        f.material_index = m
    return faces


def box(bm, x0, x1, y0, y1, z0, z1, m=0):
    slab(bm, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1, m)


def cylinder(bm, a, b, r, sides=12, m=0, cap_m=None, r_end=None, wobble=0.0, rng=None):
    """A round bar from a to b (Blender points), radius r (tapering to r_end), capped flat."""
    axis = (b - a).normalized()
    n = axis.orthogonal().normalized()
    q = axis.cross(n)
    re_ = r if r_end is None else r_end
    wob = [1 + (wobble * (rng.random() - 0.5) if rng else 0) for _ in range(sides)]
    ring_a = [bm.verts.new(a + (n * math.cos(t) + q * math.sin(t)) * r * wob[k]) for k, t in enumerate(2 * math.pi * k / sides for k in range(sides))]
    ring_b = [bm.verts.new(b + (n * math.cos(t) + q * math.sin(t)) * re_ * wob[k]) for k, t in enumerate(2 * math.pi * k / sides for k in range(sides))]
    for k in range(sides):
        k1 = (k + 1) % sides
        f = bm.faces.new((ring_a[k], ring_a[k1], ring_b[k1], ring_b[k]))
        f.material_index = m
        f.smooth = True
    for ring in (ring_a, list(reversed(ring_b))):
        f = bm.faces.new(ring)
        f.material_index = m if cap_m is None else cap_m


def lathe(bm, cx, cz, profile, segs=16, m=0, y0=0.0, squash=1.0, yaw=0.0, jitter=0.0, rng=None):
    """A solid of revolution about the vertical through (cx, cz): (radius, height) points from the
    bottom centre (r = 0) to the top centre (r = 0)."""
    bottom = bm.verts.new(W(cx, y0 + profile[0][1], cz))
    top = bm.verts.new(W(cx, y0 + profile[-1][1], cz))
    rings = []
    for r, h in profile[1:-1]:
        ring = []
        for k in range(segs):
            a = yaw + 2 * math.pi * k / segs
            rr = r * (1 + (jitter * (rng.random() - 0.5) if rng else 0))
            ring.append(bm.verts.new(W(cx + rr * math.cos(a), y0 + h, cz + rr * math.sin(a) * squash)))
        rings.append(ring)
    faces = []
    for k in range(segs):
        k1 = (k + 1) % segs
        faces.append(bm.faces.new((bottom, rings[0][k1], rings[0][k])))
        faces.append(bm.faces.new((top, rings[-1][k], rings[-1][k1])))
        for r0, r1 in zip(rings, rings[1:]):
            faces.append(bm.faces.new((r0[k], r0[k1], r1[k1], r1[k])))
    for f in faces:
        f.material_index = m
        f.smooth = True


def blob(bm, cx, cy, cz, hx, hy, hz, m=0, cuts=4, n=2.4, noise=0.0, rng=None, flat_bottom=None):
    """A rounded lump (a superellipsoid, roughened by `noise`), centred at the game point (cx, cy, cz)."""
    for v in bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    new = [v for v in bm.verts if not v.tag]
    seed = rng.random() * 10 if rng else 0.0
    for v in new:
        d = v.co.normalized()
        s = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)
        q = d / s
        k = 1 + noise * (math.sin(5.1 * d.x + seed) * math.sin(4.3 * d.y + 2 * seed) + 0.6 * math.sin(7.7 * d.z + seed))
        p = W(cx + q.x * hx * k, cy + q.z * hy * k, cz - q.y * hz * k)
        if flat_bottom is not None:
            p.z = max(p.z, flat_bottom)
        v.co = p
    for f in {f for v in new for f in v.link_faces}:
        f.material_index = m
        f.smooth = True
    for v in bm.verts:
        v.tag = False


def sheet(bm, rows, cols, point, m_of=lambda i, j: 0):
    """A grid of quads, point(u, v) -> Blender point for u, v in 0..1."""
    verts = [[bm.verts.new(point(i / rows, j / cols)) for j in range(cols + 1)] for i in range(rows + 1)]
    for i in range(rows):
        for j in range(cols):
            f = bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]))
            f.material_index = m_of(i, j)
            f.smooth = True


# ---------------------------------------------------------------------------------------------
# Blender plumbing


def purge():
    old = bpy.data.collections.get(COLLECTION)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    c = lin(PALETTE[name])
    rough = ROUGHNESS.get(name, 0.82)
    bsdf.inputs["Base Color"].default_value = (*c, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    if name in EMISSION:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (*c, 1)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = EMISSION[name]
    m.diffuse_color = (*c, 1)
    m.roughness = rough
    m.use_backface_culling = name not in DOUBLE_SIDED
    return m


def make_object(name, bm, mats, coll, origin=None, smooth_all=False):
    """`bm` as a mesh object `name`, its materials `mats`, its origin at the game point `origin`.
    Its faces are turned to face outward first: the three.js runtime culls back faces."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if smooth_all:
        for f in bm.faces:
            f.smooth = True
    me = bpy.data.meshes.new(name + "Mesh")
    if origin is not None:
        shift = W(*origin)
        for v in bm.verts:
            v.co -= shift
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(material(m))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if origin is not None:
        ob.location = W(*origin)
    return ob


def bake_modifiers(ob):
    """Apply the object's modifiers into its mesh, in order."""
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    for mod in list(ob.modifiers):
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
            bpy.ops.object.modifier_apply(modifier=mod.name)


# ---------------------------------------------------------------------------------------------
# the parts


def build_ground(L, coll):
    half = L["half"]
    p = L["pond"]
    bm = bmesh.new()
    slab(bm, rounded_rect(-half, half, -half, half, 1.1, 10), -1.1, 0.0, 0)
    ground = make_object("Campfire_Ground", bm, ["CF_Grass", "CF_Soil", "CF_PondBed", "CF_StoneDark"], coll)
    bev = ground.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.32
    bev.segments = 4
    bev.limit_method = "ANGLE"
    bake_modifiers(ground)
    # dig the pond: a rounded pit from the top down to its bed
    bm = bmesh.new()
    slab(bm, rounded_rect(p["x0"], p["x1"], p["z0"], p["z1"], p["round"], 8), -p["depth"], 1.0, 0)
    cutter = make_object("CF_PondCutter", bm, ["CF_Soil"], coll)
    dig = ground.modifiers.new("Pond", "BOOLEAN")
    dig.operation = "DIFFERENCE"
    dig.object = cutter
    try:
        dig.solver = "EXACT"
    except Exception:
        pass
    bake_modifiers(ground)
    bpy.data.objects.remove(cutter, do_unlink=True)
    # paint it: moss on top, soil down the sides, a dark bed and stone walls in the pond
    me = ground.data
    for poly in me.polygons:
        c = poly.center  # Blender space: game (c.x, c.z, -c.y)
        gx, gy, gz = c.x, c.z, -c.y
        in_pond = p["x0"] - 0.05 <= gx <= p["x1"] + 0.05 and p["z0"] - 0.05 <= gz <= p["z1"] + 0.05
        up = poly.normal.z
        if in_pond and gy < -0.02:
            poly.material_index = 2 if up > 0.6 else 3
        elif up > 0.55 and gy > -0.4:
            poly.material_index = 0
        else:
            poly.material_index = 1
        poly.use_smooth = False
    # the rock beneath, tapering away
    bm = bmesh.new()
    rng = random.Random(11)
    rings = []
    for scale, y in ((0.985, -1.05), (0.86, -1.6), (0.64, -2.2), (0.36, -2.75)):
        outline = rounded_rect(-half * scale, half * scale, -half * scale, half * scale, 1.1 * scale + 0.3, 10)
        rings.append([bm.verts.new(W(x * (1 + 0.04 * (rng.random() - 0.5)), y + 0.12 * (rng.random() - 0.5) * (y < -1.2), z * (1 + 0.04 * (rng.random() - 0.5)))) for x, z in outline])
    tip = bm.verts.new(W(0.4, -3.1, -0.3))
    n = len(rings[0])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            f.material_index = 0
    for i in range(n):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % n], tip))
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    make_object("Campfire_Underside", bm, ["CF_SoilDeep"], coll, smooth_all=True)
    # the water, a hand's breadth below the rim
    bm = bmesh.new()
    outline = rounded_rect(p["x0"] + 0.02, p["x1"] - 0.02, p["z0"] + 0.02, p["z1"] - 0.02, p["round"] - 0.02, 8)
    f = bm.faces.new([bm.verts.new(W(x, p["water"], z)) for x, z in outline])
    if f.normal.z < 0:
        f.normal_flip()
    make_object("Campfire_Water", bm, ["CF_Water"], coll)


def inside_rect(x, z, r, pad):
    return r["x0"] - pad <= x <= r["x1"] + pad and r["z0"] - pad <= z <= r["z1"] + pad


def build_paths(L, coll):
    rng = random.Random(3)
    bm = bmesh.new()
    c = L["clearing"]
    slab(bm, wobbly_circle(c["x"], c["z"], c["r"], 48, 0.035, rng), -0.02, 0.013, 0)
    for path in L["paths"]:
        pts = path["points"]
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            slab(bm, capsule(ax, az, bx, bz, path["w"] / 2), -0.02, 0.01, 0)
    make_object("Campfire_Paths", bm, ["CF_Dirt"], coll)
    # moss patches, wherever there is grass
    bm = bmesh.new()
    half = L["half"]
    placed = 0
    tries = 0
    while placed < 26 and tries < 400:
        tries += 1
        x, z = rng.uniform(-half + 1, half - 1), rng.uniform(-half + 1, half - 1)
        r = rng.uniform(0.45, 1.0)
        if math.hypot(x - c["x"], z - c["z"]) < c["r"] + r + 0.2 or inside_rect(x, z, L["pond"], r + 0.3):
            continue
        if any(math.hypot(x - t["x"], z - t["z"]) < r + 0.2 for t in L["trees"]):
            continue
        slab(bm, wobbly_circle(x, z, r, 20, 0.12, rng), -0.02, 0.006, placed % 2)
        placed += 1
    make_object("Campfire_Grass", bm, ["CF_GrassDark", "CF_GrassLight"], coll)


def build_bonfire(L, coll):
    fx, fz, ring = L["fire"]["x"], L["fire"]["z"], L["fire"]["ring"]
    rng = random.Random(5)
    bm = bmesh.new()
    # the stone ring
    for k in range(11):
        a = 2 * math.pi * k / 11 + 0.2
        blob(bm, fx + ring * math.cos(a), 0.08, fz + ring * math.sin(a), 0.17, 0.13, 0.14, m=k % 2, cuts=3, noise=0.12, rng=rng, flat_bottom=-0.02)
    # ash, and the ember bed glowing in it
    lathe(bm, fx, fz, [(0, 0.0), (0.52, 0.0), (0.5, 0.035), (0, 0.05)], segs=20, m=2)
    lathe(bm, fx, fz, [(0, 0.03), (0.34, 0.03), (0.3, 0.07), (0, 0.085)], segs=16, m=3)
    # the teepee of logs over it
    apex = W(fx, 0.62, fz)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.5
        base = W(fx + 0.42 * math.cos(a), 0.04, fz + 0.42 * math.sin(a))
        top = base.lerp(apex, 0.92)
        cylinder(bm, base, top, 0.065, 10, m=4, cap_m=5, r_end=0.05)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    make_object("Prop_Bonfire", bm, ["CF_Stone", "CF_StoneDark", "CF_Ash", "CF_Ember", "CF_Bark", "CF_WoodCut"], coll)
    # the flames: nested teardrops, each its own node with its origin at the base
    for name, mat, r, h in (("Fire_Flame_Outer", "CF_FlameOuter", 0.34, 1.05), ("Fire_Flame_Inner", "CF_FlameInner", 0.2, 0.72)):
        bm = bmesh.new()
        prof = [(0, 0.0), (r * 0.7, 0.03), (r, 0.16 * h), (r * 0.92, 0.36 * h), (r * 0.62, 0.6 * h), (r * 0.3, 0.82 * h), (0, h)]
        lathe(bm, fx, fz, prof, segs=14, m=0, y0=0.06)
        make_object(name, bm, [mat], coll, origin=(fx, 0.06, fz))


def build_logs(L, cushions, coll):
    rng = random.Random(9)
    fx, fz = L["fire"]["x"], L["fire"]["z"]
    radius = cushions["log"]["h"] / 2
    cy = cushions["log"]["y"]
    half_len = L["logLength"] / 2
    for i, log in enumerate(L["logs"]):
        rx, rz = log["x"] - fx, log["z"] - fz
        d = math.hypot(rx, rz)
        tx, tz = -rz / d, rx / d  # along the log: tangent to the circle round the fire
        bm = bmesh.new()
        a = W(log["x"] - tx * half_len, cy, log["z"] - tz * half_len)
        b = W(log["x"] + tx * half_len, cy, log["z"] + tz * half_len)
        cylinder(bm, a, b, radius, 16, m=0, cap_m=1, wobble=0.06, rng=rng)
        # a stubby broken branch on its outer side
        stub = W(log["x"] + tx * half_len * 0.35 + rx / d * 0.12, cy + 0.05, log["z"] + tz * half_len * 0.35 + rz / d * 0.12)
        cylinder(bm, stub, stub + W(rx / d * 0.18, 0.1, rz / d * 0.18) - W(0, 0, 0), 0.045, 8, m=0, cap_m=1, r_end=0.035)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        make_object(f"Seat_Log_0{i + 1}", bm, ["CF_Bark", "CF_WoodCut"], coll)


def build_pier(L, coll):
    p = L["pier"]
    x0, x1, z, hw, deck = p["x0"], p["x1"], p["z"], p["half"], p["deck"]
    bm = bmesh.new()
    x = x0
    k = 0
    while x < x1 - 0.05:
        w = min(0.22, x1 - x)
        box(bm, x, x + w, deck - 0.06, deck, z - hw, z + hw, m=k % 2)
        x += 0.25
        k += 1
    # stringers under the planks, and the posts down into the pond
    for s in (-1, 1):
        box(bm, x0, x1, -0.22, deck - 0.06, z + s * (hw - 0.14), z + s * (hw - 0.04), m=1)
    for px in (L["pond"]["x0"] + 0.3, (L["pond"]["x0"] + x1) / 2 + 0.2, x1 - 0.08):
        for s in (-1, 1):
            tall = 0.2 if px == x1 - 0.08 else deck
            cylinder(bm, W(px, -L["pond"]["depth"], z + s * (hw - 0.06)), W(px, tall, z + s * (hw - 0.06)), 0.065, 10, m=1)
    # the lantern post at the pier's end, and the lantern on it
    lx, lz = L["lantern"]["x"], L["lantern"]["z"]
    cylinder(bm, W(lx, -L["pond"]["depth"], lz), W(lx, 0.95, lz), 0.055, 10, m=1)
    box(bm, lx - 0.1, lx + 0.1, 0.93, 0.96, lz - 0.1, lz + 0.1, m=2)
    box(bm, lx - 0.1, lx + 0.1, 1.2, 1.23, lz - 0.1, lz + 0.1, m=2)
    for sx in (-1, 1):
        for sz in (-1, 1):
            box(bm, lx + sx * 0.085 - 0.012, lx + sx * 0.085 + 0.012, 0.96, 1.2, lz + sz * 0.085 - 0.012, lz + sz * 0.085 + 0.012, m=2)
    lathe(bm, lx, lz, [(0, 1.23), (0.09, 1.23), (0.02, 1.32), (0, 1.33)], segs=4, m=2, yaw=math.pi / 4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    make_object("Prop_FishingSpot", bm, ["CF_Plank", "CF_PlankDark", "CF_Metal"], coll)
    bm = bmesh.new()
    box(bm, lx - 0.07, lx + 0.07, 0.97, 1.19, lz - 0.07, lz + 0.07, m=0)
    make_object("Pier_Lantern_Glow", bm, ["CF_LanternGlass"], coll)


def build_tent(L, cushions, coll):
    t = L["tent"]
    cx, cz, r, h = t["x"], t["z"], t["r"], t["h"]
    fx, fz = L["fire"]["x"], L["fire"]["z"]
    ox, oz = fx - cx, fz - cz
    d = math.hypot(ox, oz)
    ox, oz = ox / d, oz / d
    opens = math.atan2(oz, ox)
    gap = math.radians(t["opening"])
    bm = bmesh.new()
    # the canvas: a cone with a wedge left open toward the fire
    segs, rows = 30, 10
    a0, a1 = opens + gap / 2, opens + 2 * math.pi - gap / 2
    top_r, top_y = 0.1, h * 0.9

    def canvas(u, v):
        a = a0 + (a1 - a0) * u
        rr = r + (top_r - r) * v
        return W(cx + rr * math.cos(a), 0.02 + (top_y - 0.02) * v, cz + rr * math.sin(a))

    sheet(bm, segs, rows, lambda u, v: canvas(u, v), m_of=lambda i, j: 1 if j in (1, 6) else 0)
    # the flaps, folded back either side of the opening
    for side in (-1, 1):
        edge = opens + side * gap / 2
        bx, bz = cx + r * math.cos(edge), cz + r * math.sin(edge)
        ex, ez = cx + r * 0.45 * math.cos(edge), cz + r * 0.45 * math.sin(edge)
        # outward along the tent's side, away from the opening
        tx, tz = -math.sin(edge) * side, math.cos(edge) * side
        corners = [W(bx, 0.02, bz), W(ex, h * 0.55, ez), W(bx + tx * 0.55 + ox * 0.35, 0.05, bz + tz * 0.55 + oz * 0.35)]
        vs = [bm.verts.new(c) for c in corners]
        f = bm.faces.new(vs)
        f.material_index = 1
    # the poles, out through the crown
    apex = W(cx, top_y, cz)
    for k in range(6):
        a = opens + gap / 2 + 0.05 + (2 * math.pi - gap - 0.1) * k / 5
        base = W(cx + r * 0.97 * math.cos(a), 0.0, cz + r * 0.97 * math.sin(a))
        tip = base + (apex - base) * 1.16
        cylinder(bm, base, tip, 0.03, 6, m=2)
    # the mat inside, along the way you lie, and a pillow where your head goes
    lx, lz = -ox, -oz
    mat_len, mat_w = 1.3, 0.62
    mid_x, mid_z = cx - ox * 0.05, cz - oz * 0.05
    outline = []
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        outline.append((mid_x + lx * sx * mat_len / 2 + (-lz) * sz * mat_w / 2, mid_z + lz * sx * mat_len / 2 + lx * sz * mat_w / 2))
    slab(bm, outline, 0.0, cushions["tentMat"]["top"], m=3)
    blob(bm, cx - ox * 0.62, cushions["tentMat"]["top"] + 0.05, cz - oz * 0.62, 0.2, 0.06, 0.13, m=4, cuts=3, n=2.8)
    make_object("Seat_Tent", bm, ["CF_Canvas", "CF_CanvasStripe", "CF_Pole", "CF_Mat", "CF_Pillow"], coll)
    ob = bpy.data.objects["Seat_Tent"]
    thick = ob.modifiers.new("Canvas", "SOLIDIFY")
    thick.thickness = 0.025


def build_hammock(L, cushions, coll):
    hm = L["hammock"]
    ax, az, bx, bz, top = hm["a"]["x"], hm["a"]["z"], hm["b"]["x"], hm["b"]["z"], hm["top"]
    length = math.hypot(bx - ax, bz - az)
    ux, uz = (bx - ax) / length, (bz - az) / length  # along the hammock, a -> b
    vx, vz = -uz, ux  # across it
    bottom = cushions["hammock"]["top"]
    inset = 0.55
    end_y = bottom + 0.34
    half_w = 0.42
    bm = bmesh.new()

    def fabric(u, v):
        s = 2 * u - 1
        w = 2 * v - 1
        y = bottom + (end_y - bottom) * s * s + 0.16 * w * w * (1 - 0.6 * s * s)
        width = half_w * (1 - 0.55 * s * s)
        t = inset + (length - 2 * inset) * u
        return W(ax + ux * t + vx * width * w, y, az + uz * t + vz * width * w)

    sheet(bm, 20, 10, fabric, m_of=lambda i, j: 1 if j in (2, 3, 6, 7) else 0)
    for t, pine_x, pine_z, sgn in ((inset, ax, az, 1), (length - inset, bx, bz, -1)):
        ex, ez = ax + ux * t, az + uz * t
        # the spreader bar across the end, ropes from its ends to the pine, a wrap round the trunk
        cylinder(bm, W(ex - vx * half_w * 0.5, end_y + 0.01, ez - vz * half_w * 0.5), W(ex + vx * half_w * 0.5, end_y + 0.01, ez + vz * half_w * 0.5), 0.025, 8, m=2)
        tie = W(pine_x + ux * sgn * 0.17, top, pine_z + uz * sgn * 0.17)
        for s in (-1, 1):
            cylinder(bm, W(ex + vx * s * half_w * 0.5, end_y + 0.01, ez + vz * s * half_w * 0.5), tie, 0.014, 6, m=3)
        ring = [W(pine_x + 0.19 * math.cos(a), top, pine_z + 0.19 * math.sin(a)) for a in (2 * math.pi * k / 12 for k in range(13))]
        for pa, pb in zip(ring, ring[1:]):
            cylinder(bm, pa, pb, 0.022, 6, m=3)
    make_object("Seat_Hammock", bm, ["CF_Hammock", "CF_HammockStripe", "CF_Pole", "CF_Rope"], coll)
    ob = bpy.data.objects["Seat_Hammock"]
    thick = ob.modifiers.new("Fabric", "SOLIDIFY")
    thick.thickness = 0.02


def pine(bm, x, z, s, rng, light):
    lathe(bm, x, z, [(0, 0.0), (0.16 * s, 0.0), (0.14 * s, 0.75 * s), (0, 0.8 * s)], segs=9, m=0, jitter=0.1, rng=rng)
    yaw = rng.random() * 3
    tiers = ((1.05, 0.55, 1.15), (0.82, 1.25, 1.0), (0.58, 1.9, 0.95))
    for k, (rad, base, tall) in enumerate(tiers):
        R, y0, H = rad * s, base * s, tall * s
        prof = [(0, y0), (R * 0.95, y0 + 0.02 * s), (R, y0 + 0.1 * s), (R * 0.72, y0 + 0.28 * H), (R * 0.4, y0 + 0.6 * H), (0, y0 + H)]
        lathe(bm, x, z, prof, segs=11, m=2 if (k == 2) == light else 1, yaw=yaw + k, jitter=0.06, rng=rng)


def build_trees(L, coll):
    rng = random.Random(21)
    bm = bmesh.new()
    spots = [(t["x"], t["z"], t["s"]) for t in L["trees"]]
    spots += [(L["hammock"]["a"]["x"], L["hammock"]["a"]["z"], 1.0), (L["hammock"]["b"]["x"], L["hammock"]["b"]["z"], 1.05)]
    for i, (x, z, s) in enumerate(spots):
        pine(bm, x, z, s, rng, light=i % 2 == 1)
    make_object("Campfire_Trees", bm, ["CF_Bark", "CF_Pine", "CF_PineLight"], coll)


def build_rocks(L, coll):
    rng = random.Random(33)
    bm = bmesh.new()
    for i, r in enumerate(L["rocks"]):
        s = r["s"]
        blob(bm, r["x"], 0.12 * s, r["z"], 0.5 * s, 0.36 * s, 0.42 * s, m=i % 2, cuts=4, noise=0.1, rng=rng, flat_bottom=-0.3)
        if i % 3 == 0:  # a smaller one tucked beside it
            blob(bm, r["x"] + 0.45 * s, 0.05, r["z"] + 0.3 * s, 0.22 * s, 0.16 * s, 0.2 * s, m=(i + 1) % 2, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.2)
    make_object("Campfire_Rocks", bm, ["CF_Stone", "CF_StoneDark"], coll)


def build_fence(L, coll):
    f = L["fence"]
    at, post = f["at"], f["post"]
    bm = bmesh.new()

    def run(points):
        for (ax, az), (bx, bz) in zip(points, points[1:]):
            length = math.hypot(bx - ax, bz - az)
            n = max(1, round(length / post))
            for k in range(n + 1):
                px, pz = ax + (bx - ax) * k / n, az + (bz - az) * k / n
                box(bm, px - 0.06, px + 0.06, -0.02, 0.72, pz - 0.06, pz + 0.06)
                lathe(bm, px, pz, [(0, 0.72), (0.085, 0.72), (0, 0.8)], segs=4, yaw=math.pi / 4)
            for y in (0.3, 0.55):
                if ax == bx:
                    box(bm, ax - 0.03, ax + 0.03, y - 0.05, y + 0.05, min(az, bz), max(az, bz))
                else:
                    box(bm, min(ax, bx), max(ax, bx), y - 0.05, y + 0.05, az - 0.03, az + 0.03)

    run([(f["xFrom"], at), (at, at)])
    run([(at, at), (at, f["zFrom"])])
    make_object("Campfire_Fence", bm, ["CF_Fence"], coll)


def build_deco(L, coll):
    rng = random.Random(44)
    bm = bmesh.new()
    # little red mushrooms at the feet of some pines
    for t in L["trees"][::3]:
        for k in range(3):
            a = rng.random() * 6.28
            x, z = t["x"] + (0.55 + 0.2 * rng.random()) * math.cos(a), t["z"] + (0.55 + 0.2 * rng.random()) * math.sin(a)
            s = 0.8 + 0.5 * rng.random()
            lathe(bm, x, z, [(0, 0.0), (0.035 * s, 0.0), (0.03 * s, 0.1 * s), (0, 0.11 * s)], segs=8, m=1)
            lathe(bm, x, z, [(0, 0.08 * s), (0.09 * s, 0.09 * s), (0.07 * s, 0.14 * s), (0, 0.17 * s)], segs=10, m=0)
    # wildflowers round the edge of the clearing
    c = L["clearing"]
    for k in range(22):
        a = rng.random() * 6.28
        rr = c["r"] + 0.25 + rng.random() * 1.2
        x, z = c["x"] + rr * math.cos(a), c["z"] + rr * math.sin(a)
        if inside_rect(x, z, L["pond"], 0.3) or any(math.hypot(x - lg["x"], z - lg["z"]) < 1 for lg in L["logs"]):
            continue
        cylinder(bm, W(x, 0.0, z), W(x, 0.16, z), 0.012, 5, m=2)
        blob(bm, x, 0.17, z, 0.045, 0.03, 0.045, m=3 if k % 3 else 4, cuts=2, n=2.0)
    # lily pads on the pond, and reeds at its corners
    pond = L["pond"]
    for x, z, r in ((6.3, 1.4, 0.22), (6.8, 0.9, 0.16), (4.9, -2.7, 0.2), (6.6, -3.0, 0.18), (5.2, 1.7, 0.15)):
        a0 = rng.random() * 6.28
        notch = [(x + r * math.cos(a), z + r * math.sin(a)) for a in (a0 + 0.35 + (2 * math.pi - 0.7) * k / 14 for k in range(15))] + [(x, z)]
        slab(bm, notch, pond["water"] + 0.004, pond["water"] + 0.02, m=2)
    for cx, cz in ((pond["x0"] + 0.35, pond["z1"] - 0.4), (pond["x1"] - 0.3, pond["z0"] + 0.35), (pond["x1"] - 0.35, pond["z1"] - 0.35)):
        for k in range(7):
            x, z = cx + 0.25 * (rng.random() - 0.5), cz + 0.25 * (rng.random() - 0.5)
            h = 0.55 + 0.35 * rng.random()
            cylinder(bm, W(x, pond["water"], z), W(x + 0.05 * (rng.random() - 0.5), pond["water"] + h, z), 0.018, 5, m=2, r_end=0.008)
            if k % 3 == 0:  # a cattail
                cylinder(bm, W(x, pond["water"] + h * 0.72, z), W(x, pond["water"] + h * 0.9, z), 0.035, 6, m=5)
    # round bushes at the front corners
    for x, z, s in ((-6.6, 7.0, 0.9), (7.0, 6.9, 0.8)):
        for k in range(3):
            blob(bm, x + 0.35 * (k - 1) * s, 0.3 * s, z + 0.2 * ((k % 2) - 0.5) * s, 0.42 * s, 0.36 * s, 0.4 * s, m=2, cuts=3, noise=0.08, rng=rng, flat_bottom=-0.05)
    # the woodpile: split logs stacked three, two, one, beside a chopping stump
    wx, wz = L["woodpile"]["x"], L["woodpile"]["z"]
    for row, count in enumerate((3, 2, 1)):
        for k in range(count):
            x = wx - 0.18 * (count - 1) + 0.36 * k
            y = 0.13 + row * 0.22
            cylinder(bm, W(x, y, wz - 0.42), W(x, y, wz + 0.42), 0.12, 10, m=5, cap_m=6, wobble=0.08, rng=rng)
    cylinder(bm, W(wx + 0.75, 0.0, wz + 0.35), W(wx + 0.75, 0.32, wz + 0.35), 0.22, 12, m=5, cap_m=6, wobble=0.05, rng=rng)
    make_object("Campfire_Deco", bm, ["CF_MushCap", "CF_MushStem", "CF_GrassDark", "CF_Petal", "CF_PetalYellow", "CF_Bark", "CF_WoodCut"], coll)


def build(root):
    purge()
    L = read_layout(root)
    cushions = read_cushions(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    build_ground(L, coll)
    build_paths(L, coll)
    build_bonfire(L, coll)
    build_logs(L, cushions, coll)
    build_pier(L, coll)
    build_tent(L, cushions, coll)
    build_hammock(L, cushions, coll)
    build_trees(L, coll)
    build_rocks(L, coll)
    build_fence(L, coll)
    build_deco(L, coll)
    for ob in coll.all_objects:
        if ob.modifiers:
            bake_modifiers(ob)
    return coll, L, cushions


def export(coll, path):
    layer = bpy.context.view_layer
    layer.update()
    for o in layer.objects:
        if o is not None:
            o.select_set(o.name in coll.all_objects)
    kwargs = dict(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=True, export_animations=False, export_draco_mesh_compression_enable=False)
    while True:
        try:
            bpy.ops.export_scene.gltf(**kwargs)
            return
        except TypeError as err:
            bad = next((k for k in list(kwargs) if k in str(err) and k not in ("filepath", "export_format", "export_apply", "export_yup")), None)
            if not bad:
                raise
            kwargs.pop(bad)


def summary(coll, L, cushions):
    out = {}
    for o in coll.all_objects:
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        # reported in the game's axes: x, y (up), z
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": len(o.data.materials)}
    checks = {
        "logTops": [out[f"Seat_Log_0{i + 1}"]["y"][1] for i in range(4)],
        "logCushionTop": cushions["log"]["top"],
        "tentMatTop": cushions["tentMat"]["top"],
        "hammockCushionTop": cushions["hammock"]["top"],
        "water": L["pond"]["water"],
        "drawCallsApprox": sum(v["materials"] for v in out.values()),
        "tris": sum(v["tris"] for v in out.values()),
    }
    return {"objects": out, "checks": checks}


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        coll, L, cushions = build(root)
        out = os.path.join(root, "client", "public", "models", "campfire.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll, L, cushions)}
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
