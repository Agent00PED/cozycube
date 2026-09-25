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
                        river dug down its east side (a dark bed, stone banks)
    Campfire_Underside  the rock tapering away beneath it, so it floats
    Campfire_Paths      the packed-dirt clearing round the fire and the paths off it
    Campfire_Grass      patches of darker and lighter moss
    Campfire_Water      the river's glossy surface
    Prop_Bonfire        the stone ring, the teepee of logs, the ash and the glowing ember bed
    Fire_Flame_Outer    the fire's flames, two nested teardrops (their origin at the base: the
    Fire_Flame_Inner    game flickers them by scaling)
    Seat_Logs           the four fallen-log benches round the fire, two seats each (empties
                        Seat_Log_0N_L / _R mark each sitter's place on its log's top)
    Prop_Dock           the wide plank boardwalk out over the river, its posts and two lanterns
                        (empties Prop_FishingSpot_01..03 mark where each angler stands)
    Pier_Lantern_Glow   the lanterns' glass (the game lights them)
    Seat_Tent           the canvas tipi, flap open toward the fire, poles out of its crown, a mat
                        and a pillow inside
    Seat_Hammock        the striped hammock, its spreader bars and ropes (its pines are trees)
    Campfire_Trees      the pines along the back edges and the hammock's two
    Campfire_Rocks      river boulders
    Campfire_Fence      the rustic rail fence along the front edges
    Campfire_Deco       mushrooms, wildflowers, bushes, lily pads with lotus flowers, reeds and the
                        woodpile
    Campfire_Glamping   everything else that stands still: the picnic table (gingham runner,
                        camping lantern, enamel mugs, a cooler), the brass telescope, the vintage
                        camper van with its striped awning and camp chair, the light pole, the
                        chopping stump and the canoe's cleat and rope
    Prop_WoodChop_Hatchet  the hatchet bitten into the stump (hidden while someone chops)
    Prop_Canoe          the red canoe tied off the dock (origin at the waterline: it bobs)
    StringLight_01..06  the strings of warm bulbs from the tipi, the pole, the pines and the awning,
    StringLight_Fence   and the swags along the front fence (each origin at an end: they sway)
    Fauna_Duck_01/02    a duckling and a mallard (they paddle ovals on the river)
    Fauna_Critter       a raccoon, with _Head and _Tail child nodes pivoting where they join
    Fauna_Owl           an owl on a pine branch by the tent, with _Head and, in it, _Lids
    Forage_0N_Yield     each foraging patch's pickings: spotted mushrooms or glowing berries

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts, so every number below
reads as in campfire.ts.

The ground decals (moss patches, paths, the clearing) each sit on their own layer a few
millimetres over the moss, and no two patches of a layer overlap: nothing on the island's top is
coplanar with anything else, so nothing z-fights (CampfireWorld.tsx adds a polygon offset on top).
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
    # the living camp
    "CF_Bulb": "#FFE49E",
    "CF_Wire": "#2B2622",
    "CF_Checker": "#D94A45",
    "CF_Cloth": "#F6EEE2",
    "CF_Cooler": "#4FA3C7",
    "CF_CoolerLid": "#EDEDE6",
    "CF_Enamel": "#EFEFEA",
    "CF_EnamelRim": "#2F4E7A",
    "CF_Brass": "#C99A3E",
    "CF_BrassDark": "#8C6A2C",
    "CF_VanMint": "#9ED9C5",
    "CF_VanCream": "#F4E9D0",
    "CF_Glass": "#3A5068",
    "CF_Tire": "#2A2826",
    "CF_Chrome": "#C8CCD0",
    "CF_AwningStripe": "#E8A25A",
    "CF_ChairFabric": "#5E8FBF",
    "CF_Steel": "#9EA5AC",
    "CF_Canoe": "#C8553D",
    "CF_CanoeInner": "#E8C9A0",
    "CF_DuckYellow": "#F6D34A",
    "CF_Beak": "#F29A38",
    "CF_Eye": "#1E1B1A",
    "CF_MallardHead": "#2F7A55",
    "CF_MallardBody": "#B9A58E",
    "CF_MallardChest": "#8A5A3C",
    "CF_RaccoonGrey": "#8C8A91",
    "CF_RaccoonDark": "#3C3A40",
    "CF_RaccoonLight": "#E6E1DA",
    "CF_OwlBrown": "#8A6446",
    "CF_OwlLight": "#D9C09A",
    "CF_OwlEye": "#F4C542",
    "CF_OwlLid": "#6E4F37",
    "CF_Lotus": "#FBF4F4",
    "CF_LotusCore": "#F7D86B",
    "CF_BerryGlow": "#8F7BFF",
    "CF_BushLeaf": "#4F7B4A",
    "CF_MushSpot": "#FFF6E8",
}
ROUGHNESS = {"CF_Water": 0.25, "CF_Metal": 0.6, "CF_Glass": 0.4, "CF_Chrome": 0.45, "CF_Brass": 0.55, "CF_Steel": 0.5}
# the ground decals' tops, a layer each over the moss (y = 0): patches, paths, then the clearing
LAYER_PATCH = 0.008
LAYER_PATH = 0.015
LAYER_CLEARING = 0.022
# glowing things: (strength) of an emission in their own colour
EMISSION = {"CF_Ember": 2.2, "CF_FlameOuter": 3.0, "CF_FlameInner": 4.0, "CF_LanternGlass": 2.5, "CF_Bulb": 3.0, "CF_BerryGlow": 2.0}
# thin sheets seen from both sides
DOUBLE_SIDED = {"CF_Canvas", "CF_CanvasStripe", "CF_Hammock", "CF_HammockStripe", "CF_Checker", "CF_VanCream", "CF_Cooler", "CF_AwningStripe", "CF_Canoe", "CF_CanoeInner"}


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


def catmull(p0, p1, p2, p3, u):
    return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u)


def river_span(L, z):
    """The river's (west, east) banks at z, or None: riverSpan in shared/worlds/campfire.ts."""
    P = L["river"]["points"]
    n = len(P)
    z_first, x_first, w_first = P[0]
    z_last, x_last, w_last = P[-1]
    if z < z_first:
        d = z_first - z
        if d >= w_first:
            return None
        w = math.sqrt(w_first * w_first - d * d)
        return (x_first - w, x_first + w)
    if z > z_last:
        d = z - z_last
        if d >= w_last:
            return None
        w = math.sqrt(w_last * w_last - d * d)
        return (x_last - w, x_last + w)
    i = 0
    while i < n - 2 and z > P[i + 1][0]:
        i += 1
    u = (z - P[i][0]) / (P[i + 1][0] - P[i][0])
    at = lambda k: P[max(0, min(n - 1, k))]
    x = catmull(at(i - 1)[1], at(i)[1], at(i + 1)[1], at(i + 2)[1], u)
    w = catmull(at(i - 1)[2], at(i)[2], at(i + 1)[2], at(i + 2)[2], u)
    return (x - w, x + w)


def in_river(L, x, z, pad=0.0):
    span = river_span(L, z)
    return span is not None and span[0] - pad <= x <= span[1] + pad


def river_banks(L, grow=0.0, step=0.1):
    """The river's outline as matching west and east bank points down its length, north to south,
    each `grow` out from the water's edge. The round ends are sampled more finely."""
    P = L["river"]["points"]
    z0, z1 = P[0][0] - P[0][2], P[-1][0] + P[-1][2]
    zs = []
    for k in range(13):  # the north cap, finely (a quarter circle's worth of angle steps)
        zs.append(P[0][0] - P[0][2] * math.cos(math.pi / 2 * k / 12))
    z = P[0][0] + step
    while z < P[-1][0]:
        zs.append(z)
        z += step
    for k in range(13):  # the south cap
        zs.append(P[-1][0] + P[-1][2] * math.sin(math.pi / 2 * k / 12))
    west, east = [], []
    for z in zs:
        # the very ends a hair in, so the two banks never meet in one point
        z = min(max(z, z0 + 0.01), z1 - 0.01)
        span = river_span(L, z)
        if span is None:
            continue
        west.append((span[0] - grow, z))
        east.append((span[1] + grow, z))
    return west, east


def ribbon(bm, west, east, y0, y1, m=0, top_only=False):
    """A strip of quads between matching bank points: a surface at y1 alone, or a closed solid
    from y0 to y1."""
    tops = [(bm.verts.new(W(wx, y1, wz)), bm.verts.new(W(ex, y1, ez))) for (wx, wz), (ex, ez) in zip(west, east)]
    for (a, b), (c, d) in zip(tops, tops[1:]):
        bm.faces.new((a, c, d, b)).material_index = m
    if top_only:
        return
    bots = [(bm.verts.new(W(wx, y0, wz)), bm.verts.new(W(ex, y0, ez))) for (wx, wz), (ex, ez) in zip(west, east)]
    for (a, b), (c, d) in zip(bots, bots[1:]):
        bm.faces.new((b, d, c, a)).material_index = m
    for side in (0, 1):
        for i in range(len(tops) - 1):
            bm.faces.new((tops[i][side], tops[i + 1][side], bots[i + 1][side], bots[i][side])).material_index = m
    for i in (0, -1):
        bm.faces.new((tops[i][0], tops[i][1], bots[i][1], bots[i][0])).material_index = m


def near_path(L, x, z, pad):
    for path in L["paths"]:
        pts = path["points"]
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            dx, dz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz or 1)))
            if math.hypot(x - (ax + dx * t), z - (az + dz * t)) < path["w"] / 2 + pad:
                return True
    return False


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


def make_object(name, bm, mats, coll, origin=None, smooth_all=False, recalc=True):
    """`bm` as a mesh object `name`, its materials `mats`, its origin at the game point `origin`.
    Its faces are turned to face outward first (the three.js runtime culls back faces), unless it
    is an open sheet already built facing the right way (`recalc` False)."""
    if recalc:
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
    p = L["river"]
    bm = bmesh.new()
    slab(bm, rounded_rect(-half, half, -half, half, 1.1, 10), -1.1, 0.0, 0)
    ground = make_object("Campfire_Ground", bm, ["CF_Grass", "CF_Soil", "CF_PondBed", "CF_StoneDark"], coll)
    bev = ground.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.32
    bev.segments = 4
    bev.limit_method = "ANGLE"
    bake_modifiers(ground)
    # dig the river: its outline, from above the top down to its bed
    bm = bmesh.new()
    west, east = river_banks(L)
    ribbon(bm, west, east, -p["depth"], 1.0)
    cutter = make_object("CF_RiverCutter", bm, ["CF_Soil"], coll)
    dig = ground.modifiers.new("River", "BOOLEAN")
    dig.operation = "DIFFERENCE"
    dig.object = cutter
    try:
        dig.solver = "EXACT"
    except Exception:
        pass
    bake_modifiers(ground)
    bpy.data.objects.remove(cutter, do_unlink=True)
    # paint it: moss on top, soil down the sides, a dark bed and stone banks in the river
    me = ground.data
    for poly in me.polygons:
        c = poly.center  # Blender space: game (c.x, c.z, -c.y)
        gx, gy, gz = c.x, c.z, -c.y
        up = poly.normal.z
        if in_river(L, gx, gz, 0.05) and gy < -0.02:
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
    west, east = river_banks(L, grow=-0.02)
    ribbon(bm, west, east, 0.0, p["water"], top_only=True)
    for f in bm.faces:
        f.smooth = True
    make_object("Campfire_Water", bm, ["CF_Water"], coll, recalc=False)  # built facing up


def build_paths(L, coll):
    rng = random.Random(3)
    bm = bmesh.new()
    c = L["clearing"]
    # the clearing on the top layer, the paths just under it (one colour: where they meet, the
    # clearing is simply the higher of the two)
    slab(bm, wobbly_circle(c["x"], c["z"], c["r"], 64, 0.035, rng), -0.02, LAYER_CLEARING, 0)
    for path in L["paths"]:
        pts = path["points"]
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            slab(bm, capsule(ax, az, bx, bz, path["w"] / 2), -0.02, LAYER_PATH, 0)
    make_object("Campfire_Paths", bm, ["CF_Dirt"], coll)
    # moss patches on open grass: never overlapping each other, a path, the river, the dock or the
    # tipi, so no two are ever coplanar
    bm = bmesh.new()
    half = L["half"]
    d, t = L["dock"], L["tent"]
    placed = []
    tries = 0
    while len(placed) < 40 and tries < 900:
        tries += 1
        x, z = rng.uniform(-half + 1, half - 1), rng.uniform(-half + 1, half - 1)
        r = rng.uniform(0.45, 1.1)
        if max(abs(x), abs(z)) + 1.25 * r > half - 0.45:  # clear of the bevelled rim
            continue
        if math.hypot(x - c["x"], z - c["z"]) < c["r"] + r + 0.2 or in_river(L, x, z, r + 0.35) or near_path(L, x, z, r + 0.15):
            continue
        if d["x0"] - r - 0.2 <= x <= d["x1"] + r and d["z0"] - r - 0.2 <= z <= d["z1"] + r + 0.2:
            continue
        if math.hypot(x - t["x"], z - t["z"]) < t["r"] + r + 0.2:
            continue
        if any(math.hypot(x - tr["x"], z - tr["z"]) < r + 0.2 for tr in L["trees"]):
            continue
        # the wobble reaches ~1.2 r: keep the wobbly edges apart too
        if any(math.hypot(x - px, z - pz) < 1.2 * (r + pr) + 0.1 for px, pz, pr in placed):
            continue
        slab(bm, wobbly_circle(x, z, r, 20, 0.12, rng), -0.02, LAYER_PATCH, len(placed) % 2)
        placed.append((x, z, r))
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
    bm = bmesh.new()
    for i, log in enumerate(L["logs"]):
        rx, rz = log["x"] - fx, log["z"] - fz
        d = math.hypot(rx, rz)
        tx, tz = -rz / d, rx / d  # along the log: tangent to the circle round the fire
        a = W(log["x"] - tx * half_len, cy, log["z"] - tz * half_len)
        b = W(log["x"] + tx * half_len, cy, log["z"] + tz * half_len)
        cylinder(bm, a, b, radius, 18, m=0, cap_m=1, wobble=0.06, rng=rng)
        # stubby broken branches on its outer side, clear of both seats (they sit at +-spread)
        for along, up in ((0.82, 0.05), (-0.05, 0.08)):
            stub = W(log["x"] + tx * half_len * along + rx / d * 0.12, cy + up, log["z"] + tz * half_len * along + rz / d * 0.12)
            cylinder(bm, stub, stub + W(rx / d * 0.18, 0.1, rz / d * 0.18) - W(0, 0, 0), 0.045, 8, m=0, cap_m=1, r_end=0.035)
        # a ring of moss round each end
        for sgn in (-1, 1):
            e = W(log["x"] + tx * sgn * (half_len - 0.12), cy, log["z"] + tz * sgn * (half_len - 0.12))
            cylinder(bm, e - W(tx * 0.05, 0, tz * 0.05) + W(0, 0, 0), e + W(tx * 0.05, 0, tz * 0.05) - W(0, 0, 0), radius + 0.012, 18, m=2)
        # where each of its two sitters goes, on its top: L and R as they see it, facing the fire
        top = cushions["log"]["top"]
        spread = L["logSeatSpread"]
        for side, sgn in (("L", 1), ("R", -1)):
            mark = bpy.data.objects.new(f"Seat_Log_0{i + 1}_{side}", None)
            mark.empty_display_type = "ARROWS"
            mark.empty_display_size = 0.2
            mark.location = W(log["x"] + tx * sgn * spread, top, log["z"] + tz * sgn * spread)
            coll.objects.link(mark)
    make_object("Seat_Logs", bm, ["CF_Bark", "CF_WoodCut", "CF_GrassLight"], coll)


def build_dock(L, coll):
    """The boardwalk: planks across its width, stringers under them, posts down into the river bed,
    bollards along its river edge and a lantern post at each of its river corners."""
    d = L["dock"]
    x0, x1, z0, z1, deck = d["x0"], d["x1"], d["z0"], d["z1"], d["deck"]
    bed = -L["river"]["depth"]
    bm = bmesh.new()
    x = x0
    k = 0
    while x < x1 - 0.05:
        w = min(0.22, x1 - x)
        # each plank a touch short or long at its ends, for a hand-laid look
        j0, j1 = 0.04 * ((k * 7) % 3 - 1), 0.04 * ((k * 5) % 3 - 1)
        box(bm, x, x + w, deck - 0.06, deck, z0 + j0, z1 + j1, m=k % 2)
        x += 0.25
        k += 1
    # stringers under the planks, running out over the water
    for sz in (z0 + 0.12, (z0 + z1) / 2, z1 - 0.12):
        box(bm, x0 + 0.05, x1 - 0.02, -0.24, deck - 0.06, sz - 0.05, sz + 0.05, m=1)
    # posts: along the bank and along the river edge, down into the bed; bollards on the river edge
    bank = max(river_span(L, z)[0] for z in (z0, (z0 + z1) / 2, z1))
    lanterns = [(p["x"], p["z"]) for p in L["lanterns"]]
    for px, tall in ((bank + 0.1, deck), (x1 - 0.08, 0.24)):
        for pz in (z0 + 0.1, (z0 + z1) / 2 - 0.62, (z0 + z1) / 2 + 0.62, z1 - 0.1):
            if any(math.hypot(px - lx, pz - lz) < 0.3 for lx, lz in lanterns):
                continue
            cylinder(bm, W(px, bed, pz), W(px, tall, pz), 0.065, 10, m=1)
    # the lantern posts at the river corners, and the lanterns on them
    for lx, lz in lanterns:
        cylinder(bm, W(lx, bed, lz), W(lx, 0.95, lz), 0.055, 10, m=1)
        box(bm, lx - 0.1, lx + 0.1, 0.93, 0.96, lz - 0.1, lz + 0.1, m=2)
        box(bm, lx - 0.1, lx + 0.1, 1.2, 1.23, lz - 0.1, lz + 0.1, m=2)
        for sx in (-1, 1):
            for sz in (-1, 1):
                box(bm, lx + sx * 0.085 - 0.012, lx + sx * 0.085 + 0.012, 0.96, 1.2, lz + sz * 0.085 - 0.012, lz + sz * 0.085 + 0.012, m=2)
        lathe(bm, lx, lz, [(0, 1.23), (0.09, 1.23), (0.02, 1.32), (0, 1.33)], segs=4, m=2, yaw=math.pi / 4)
    # a bait bucket and a coil of rope by the bank end, out of the anglers' way
    lathe(bm, x0 + 0.35, z0 + 0.35, [(0, deck), (0.12, deck), (0.15, deck + 0.22), (0, deck + 0.2)], segs=12, m=2)
    for k in range(3):
        a0 = W(x0 + 0.35 + 0.13 * math.cos(2.1 * k), deck + 0.02 + 0.03 * k, z1 - 0.4 + 0.13 * math.sin(2.1 * k))
        cylinder(bm, a0, a0 + W(0.001, 0.028, 0.001) - W(0, 0, 0), 0.16 - 0.02 * k, 14, m=3, r_end=0.16 - 0.02 * k)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    make_object("Prop_Dock", bm, ["CF_Plank", "CF_PlankDark", "CF_Metal", "CF_Rope"], coll)
    bm = bmesh.new()
    for lx, lz in lanterns:
        box(bm, lx - 0.07, lx + 0.07, 0.97, 1.19, lz - 0.07, lz + 0.07, m=0)
    make_object("Pier_Lantern_Glow", bm, ["CF_LanternGlass"], coll)
    # where each angler stands
    for i, spot in enumerate(L["fishing"]):
        mark = bpy.data.objects.new(f"Prop_FishingSpot_0{i + 1}", None)
        mark.empty_display_type = "SINGLE_ARROW"
        mark.location = W(spot["stand"]["x"], deck, spot["stand"]["z"])
        coll.objects.link(mark)


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
    # the bare branch the owl perches on, out through its pine's lowest boughs
    o = L["owl"]
    cylinder(bm, W(o["tree"]["x"], o["y"] - 0.1, o["tree"]["z"]), W(o["x"] + 0.12, o["y"] - 0.03, o["z"] + 0.12), 0.04, 7, m=0, r_end=0.026)
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
        if in_river(L, x, z, 0.4) or near_path(L, x, z, 0.15) or any(math.hypot(x - lg["x"], z - lg["z"]) < 1.5 for lg in L["logs"]):
            continue
        cylinder(bm, W(x, 0.0, z), W(x, 0.16, z), 0.012, 5, m=2)
        blob(bm, x, 0.17, z, 0.045, 0.03, 0.045, m=3 if k % 3 else 4, cuts=2, n=2.0)
    # lily pads down the river (clear of the dock and the anglers' floats), reeds along its banks
    water = L["river"]["water"]
    d = L["dock"]
    floats = [(s["bobber"]["x"], s["bobber"]["z"]) for s in L["fishing"]]
    for z, t, r in ((-8.4, 0.5, 0.16), (-7.0, 0.35, 0.2), (-6.6, 0.65, 0.15), (-4.8, 0.3, 0.22), (-3.6, 0.7, 0.18), (-2.7, 0.45, 0.14), (3.0, 0.3, 0.2), (3.6, 0.62, 0.16), (5.2, 0.45, 0.22), (6.6, 0.3, 0.15)):
        x0, x1 = river_span(L, z)
        x = x0 + (x1 - x0) * t
        if any(math.hypot(x - fx, z - fz) < 0.7 for fx, fz in floats) or (d["z0"] - 0.4 <= z <= d["z1"] + 0.4 and x < d["x1"] + 0.4):
            continue
        a0 = rng.random() * 6.28
        notch = [(x + r * math.cos(a), z + r * math.sin(a)) for a in (a0 + 0.35 + (2 * math.pi - 0.7) * k / 14 for k in range(15))] + [(x, z)]
        slab(bm, notch, water + 0.004, water + 0.02, m=2)
        if r >= 0.18:  # a white lotus on the bigger pads
            for q in range(6):
                a = 2 * math.pi * q / 6 + a0
                blob(bm, x + 0.05 * math.cos(a), water + 0.05, z + 0.05 * math.sin(a), 0.05, 0.03, 0.05, m=1, cuts=1, n=2.0)
            blob(bm, x, water + 0.075, z, 0.03, 0.025, 0.03, m=4, cuts=2, n=2.0)
    clumps = [(z, side) for z, side in ((-9.0, 0), (-8.9, 1), (-7.6, 1), (-5.6, 0), (-4.9, 1), (-3.3, 1), (-2.6, 0), (3.2, 1), (4.2, 0), (5.6, 1), (6.2, 0), (7.4, 0), (7.3, 1))]
    for cz, side in clumps:
        span = river_span(L, cz)
        if span is None:
            continue
        cx = span[0] + 0.22 if side == 0 else span[1] - 0.22
        for k in range(7):
            x, z = cx + 0.25 * (rng.random() - 0.5), cz + 0.3 * (rng.random() - 0.5)
            h = 0.55 + 0.35 * rng.random()
            cylinder(bm, W(x, water, z), W(x + 0.05 * (rng.random() - 0.5), water + h, z), 0.018, 5, m=2, r_end=0.008)
            if k % 3 == 0:  # a cattail
                cylinder(bm, W(x, water + h * 0.72, z), W(x, water + h * 0.9, z), 0.035, 6, m=5)
    # round bushes at the front corners
    for x, z, s in ((-9.1, 9.3, 0.9), (9.2, 9.3, 0.8)):
        for k in range(3):
            blob(bm, x + 0.35 * (k - 1) * s, 0.3 * s, z + 0.2 * ((k % 2) - 0.5) * s, 0.42 * s, 0.36 * s, 0.4 * s, m=2, cuts=3, noise=0.08, rng=rng, flat_bottom=-0.05)
    # the woodpile: split logs stacked three, two, one, beside a chopping stump
    wx, wz = L["woodpile"]["x"], L["woodpile"]["z"]
    for row, count in enumerate((3, 2, 1)):
        for k in range(count):
            x = wx - 0.18 * (count - 1) + 0.36 * k
            y = 0.13 + row * 0.22
            cylinder(bm, W(x, y, wz - 0.42), W(x, y, wz + 0.42), 0.12, 10, m=5, cap_m=6, wobble=0.08, rng=rng)
    # the night-berry bushes (their berries are their own nodes, Forage_0N_Yield)
    for f in L["forage"]:
        if f["kind"] == "berries":
            for dx, dz, s in ((0, 0, 1.0), (0.2, 0.12, 0.7), (-0.18, 0.1, 0.65)):
                blob(bm, f["x"] + dx, 0.22 * s, f["z"] + dz, 0.3 * s, 0.26 * s, 0.28 * s, m=2, cuts=2, noise=0.1, rng=rng, flat_bottom=-0.03)
    make_object("Campfire_Deco", bm, ["CF_MushCap", "CF_MushStem", "CF_GrassDark", "CF_Petal", "CF_PetalYellow", "CF_Bark", "CF_WoodCut"], coll)


# ---------------------------------------------------------------------------------------------
# the living camp: the picnic nook, the telescope, the camper van, the chopping block, the canoe,
# the string lights, the wildlife and the foraging patches


def faces_since(bm, before):
    return [f for f in bm.faces if f not in before]


def rounded_box(bm, cx, cy, cz, hx, hy, hz, m_lo, m_hi, split_y, n=5.0, cuts=5):
    """A soft-cornered box (a superellipsoid), two-tone: m_lo below split_y, m_hi above."""
    before = set(bm.faces)
    blob(bm, cx, cy, cz, hx, hy, hz, m=m_lo, cuts=cuts, n=n)
    for f in faces_since(bm, before):
        f.material_index = m_hi if f.calc_center_median().z > split_y else m_lo
        f.smooth = True


def string_bulbs(a, b, sag):
    """stringBulbs in shared/worlds/campfire.ts: one bulb every ~0.38 along a sagging string."""
    n = max(3, round(math.dist(a, b) / 0.38))
    out = []
    for i in range(n):
        t = (i + 0.5) / n
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t))
    return out


def fence_posts(L):
    f = L["fence"]
    length = f["at"] - f["xFrom"]
    n = max(1, round(length / f["post"]))
    return [f["xFrom"] + length * k / n for k in range(n + 1)]


def hang_string(bm, a, b, sag, m_wire=0, m_bulb=1):
    """A drooping wire from a to b with its bulbs hanging under it."""
    pts = []
    for k in range(13):
        t = k / 12
        pts.append(W(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t))
    for p, q in zip(pts, pts[1:]):
        cylinder(bm, p, q, 0.008, 4, m=m_wire)
    for x, y, z in string_bulbs(a, b, sag):
        cylinder(bm, W(x, y + 0.005, z), W(x, y - 0.025, z), 0.013, 4, m=m_wire)  # the socket
        blob(bm, x, y - 0.055, z, 0.03, 0.04, 0.03, m=m_bulb, cuts=1, n=2.2)


def build_lights(L, coll):
    """Each string of lights its own node (its origin at its first end: the game sways it about
    the line between its ends), and the swags along the front fence as one node."""
    for i, s in enumerate(L["strings"]):
        bm = bmesh.new()
        hang_string(bm, s["a"], s["b"], s["sag"])
        make_object(f"StringLight_0{i + 1}", bm, ["CF_Wire", "CF_Bulb"], coll, origin=tuple(s["a"]))
    fl = L["fenceLights"]
    posts = fence_posts(L)
    at = L["fence"]["at"]
    bm = bmesh.new()
    for k in range(0, len(posts) - fl["every"], fl["every"]):
        hang_string(bm, (posts[k], fl["y"], at), (posts[k + fl["every"]], fl["y"], at), fl["sag"])
    make_object("StringLight_Fence", bm, ["CF_Wire", "CF_Bulb"], coll, origin=(posts[0], fl["y"], at))


def build_glamping(L, cushions, coll):
    """Everything that stands still, in one object: the picnic set and its cooler, the telescope,
    the camper van with its awning and chair, the light pole, the chopping stump, the dock cleat
    and the canoe's rope."""
    rng = random.Random(71)
    M = ["CF_Plank", "CF_PlankDark", "CF_Checker", "CF_VanCream", "CF_Metal", "CF_LanternGlass", "CF_Cooler", "CF_Brass", "CF_VanMint", "CF_Glass",
         "CF_Chrome", "CF_AwningStripe", "CF_Pole", "CF_Rope", "CF_Bark", "CF_WoodCut"]
    m = {name: i for i, name in enumerate(M)}
    # each material in an object is a draw call: the near-duplicates share one (the gingham's white,
    # the awning's cream stripes, the cooler's lid and the enamel mugs are the van's cream; the
    # mugs' rims and the camp chair are the cooler's blue; the tyres and the telescope's dark
    # fittings are the lantern's iron)
    for alias, to in (("CF_Cloth", "CF_VanCream"), ("CF_Canvas", "CF_VanCream"), ("CF_CoolerLid", "CF_VanCream"), ("CF_Enamel", "CF_VanCream"),
                      ("CF_EnamelRim", "CF_Cooler"), ("CF_ChairFabric", "CF_Cooler"), ("CF_Tire", "CF_Metal"), ("CF_BrassDark", "CF_Metal")):
        m[alias] = m[to]
    bm = bmesh.new()

    # --- the picnic table, a gingham runner, a camping lantern, two enamel mugs, a cooler ---
    px, pz = L["picnic"]["x"], L["picnic"]["z"]
    for k in range(4):  # the top: four planks along it
        z0 = pz - 0.4 + k * 0.2
        box(bm, px - 0.85, px + 0.85, 0.66, 0.72, z0 + 0.008, z0 + 0.192, m=m["CF_Plank"])
    for sz in (-1, 1):  # the benches
        box(bm, px - 0.85, px + 0.85, 0.4, 0.45, pz + sz * 0.68 - 0.13, pz + sz * 0.68 + 0.13, m=m["CF_Plank"])
    for sx in (-1, 1):  # the A-frame legs, bench to bench, and a brace
        lx = px + sx * 0.62
        for sz in (-1, 1):
            cylinder(bm, W(lx, 0.66, pz + sz * 0.22), W(lx, 0.0, pz + sz * 0.78), 0.035, 4, m=m["CF_PlankDark"])
        box(bm, lx - 0.03, lx + 0.03, 0.34, 0.4, pz - 0.8, pz + 0.8, m=m["CF_PlankDark"])
    box(bm, px - 0.62, px + 0.62, 0.26, 0.31, pz - 0.03, pz + 0.03, m=m["CF_PlankDark"])

    def cloth(u, v):
        x = px - 0.55 + 1.1 * u
        z = pz - 0.52 + 1.04 * v
        over = max(0.0, abs(z - pz) - 0.4)
        return W(x, 0.726 - over * 1.4, z if over == 0 else pz + math.copysign(0.4 + over * 0.25, z - pz))

    sheet(bm, 8, 8, cloth, m_of=lambda i, j: m["CF_Checker"] if (i + j) % 2 else m["CF_Cloth"])
    lx, lz = px - 0.48, pz + 0.05
    lathe(bm, lx, lz, [(0, 0.726), (0.075, 0.726), (0.075, 0.76), (0, 0.76)], segs=12, m=m["CF_Metal"])
    lathe(bm, lx, lz, [(0, 0.76), (0.055, 0.76), (0.06, 0.82), (0.055, 0.88), (0, 0.88)], segs=12, m=m["CF_LanternGlass"])
    lathe(bm, lx, lz, [(0, 0.88), (0.07, 0.88), (0.03, 0.93), (0, 0.94)], segs=12, m=m["CF_Metal"])
    for sx in (-1, 1):
        cylinder(bm, W(lx + sx * 0.05, 0.9, lz), W(lx + sx * 0.03, 1.0, lz), 0.006, 4, m=m["CF_Metal"])
    cylinder(bm, W(lx - 0.03, 1.0, lz), W(lx + 0.03, 1.0, lz), 0.006, 4, m=m["CF_Metal"])
    for mx, mz in ((px + 0.18, pz - 0.16), (px + 0.46, pz + 0.17)):
        lathe(bm, mx, mz, [(0, 0.726), (0.04, 0.726), (0.045, 0.8), (0, 0.79)], segs=12, m=m["CF_Enamel"])
        lathe(bm, mx, mz, [(0.04, 0.795), (0.047, 0.795), (0.047, 0.808), (0.04, 0.808)], segs=12, m=m["CF_EnamelRim"])
        cylinder(bm, W(mx + 0.045, 0.78, mz), W(mx + 0.07, 0.765, mz), 0.008, 5, m=m["CF_Enamel"])
    cx_, cz_ = px + 1.2, pz - 0.1
    box(bm, cx_ - 0.26, cx_ + 0.26, 0.0, 0.3, cz_ - 0.17, cz_ + 0.17, m=m["CF_Cooler"])
    box(bm, cx_ - 0.27, cx_ + 0.27, 0.3, 0.36, cz_ - 0.18, cz_ + 0.18, m=m["CF_CoolerLid"])
    box(bm, cx_ - 0.12, cx_ + 0.12, 0.36, 0.39, cz_ - 0.025, cz_ + 0.025, m=m["CF_CoolerLid"])

    # --- the brass telescope on its tripod, aimed up over the fence ---
    tx, tz = L["telescope"]["x"], L["telescope"]["z"]
    apex = (tx, 0.95, tz)
    for k in range(3):
        a = math.pi / 2 + 2 * math.pi * k / 3 + math.pi / 3
        cylinder(bm, W(*apex), W(tx + 0.32 * math.cos(a), 0.0, tz + 0.32 * math.sin(a)), 0.022, 6, m=m["CF_Pole"], r_end=0.016)
    blob(bm, tx, 0.96, tz, 0.05, 0.045, 0.05, m=m["CF_BrassDark"], cuts=2)
    up, fwd = math.sin(math.radians(35)), math.cos(math.radians(35))
    eye = W(tx, 0.96 - 0.3 * up + 0.05, tz - 0.3 * fwd)
    obj = W(tx, 0.96 + 0.58 * up + 0.05, tz + 0.58 * fwd)
    cylinder(bm, eye, obj, 0.06, 14, m=m["CF_Brass"], cap_m=m["CF_BrassDark"], r_end=0.08)
    axis = (obj - eye).normalized()
    for f_, r_ in ((0.02, 0.066), (0.55, 0.074), (0.97, 0.086)):
        c = eye.lerp(obj, f_)
        cylinder(bm, c - axis * 0.02, c + axis * 0.02, r_, 14, m=m["CF_BrassDark"])
    cylinder(bm, obj - axis * 0.01, obj + axis * 0.004, 0.07, 14, m=m["CF_Glass"])
    cylinder(bm, eye, eye - axis * 0.1, 0.025, 10, m=m["CF_BrassDark"], r_end=0.03)
    finder = eye.lerp(obj, 0.35) + Vector((0, 0, 0.09))
    cylinder(bm, finder, finder + axis * 0.22, 0.018, 8, m=m["CF_Brass"])

    # --- the camper van: mint below, cream above, round headlamps, chrome bumpers ---
    v = L["van"]
    vx, vz, hl, hw = v["x"], v["z"], v["len"] / 2, v["w"] / 2
    rounded_box(bm, vx, 0.98, vz, hl, 0.7, hw, m["CF_VanMint"], m["CF_VanCream"], 0.95, n=5.0, cuts=6)
    rounded_box(bm, vx - 0.05, 1.62, vz, hl - 0.2, 0.12, hw - 0.12, m["CF_VanCream"], m["CF_VanCream"], 9, n=3.0, cuts=4)  # the pop-top roof
    for x0, x1 in ((vx - 1.25, vx - 0.5), (vx - 0.35, vx + 0.35), (vx + 0.5, vx + 1.05)):  # side windows, both sides
        for sz in (-1, 1):
            box(bm, x0, x1, 1.12, 1.45, vz + sz * (hw - 0.02) - 0.02, vz + sz * (hw - 0.02) + 0.02, m=m["CF_Glass"])
    box(bm, vx + hl - 0.02, vx + hl + 0.02, 1.1, 1.45, vz - hw + 0.18, vz + hw - 0.18, m=m["CF_Glass"])  # the windscreen
    for sz in (-1, 1):
        cylinder(bm, W(vx + hl - 0.03, 0.72, vz + sz * 0.46), W(vx + hl + 0.035, 0.72, vz + sz * 0.46), 0.085, 14, m=m["CF_Chrome"], cap_m=m["CF_LanternGlass"])
    for sx in (-1, 1):  # bumpers
        box(bm, vx + sx * (hl + 0.02) - 0.05, vx + sx * (hl + 0.02) + 0.05, 0.32, 0.43, vz - hw + 0.05, vz + hw - 0.05, m=m["CF_Chrome"])
    for sx in (-1, 1):  # wheels
        for sz in (-1, 1):
            wx_, wz_ = vx + sx * (hl - 0.55), vz + sz * (hw - 0.12)
            cylinder(bm, W(wx_, 0.27, wz_ - 0.1), W(wx_, 0.27, wz_ + 0.1), 0.27, 16, m=m["CF_Tire"])
            cylinder(bm, W(wx_, 0.27, wz_ + sz * 0.1), W(wx_, 0.27, wz_ + sz * 0.12), 0.13, 14, m=m["CF_Chrome"])
    box(bm, vx - 0.05, vx + 0.02, 0.9, 0.93, vz + hw + 0.005, vz + hw + 0.03, m=m["CF_Chrome"])  # the door handle
    box(bm, vx - 0.55, vx + 0.1, 0.12, 0.2, vz + hw - 0.05, vz + hw + 0.22, m=m["CF_PlankDark"])  # the step

    # --- the striped awning out over the van's side, on two poles, with guy ropes ---
    zb, zf = vz + hw, vz + hw + v["awning"]
    ax0, ax1 = vx - 0.95, vx + 1.35

    def canvas(u, w_):
        x = ax0 + (ax1 - ax0) * u
        z = zb + (zf - zb) * w_
        return W(x, 1.55 + (1.52 - 1.55) * w_ - 0.06 * math.sin(math.pi * w_), z)

    sheet(bm, 10, 6, canvas, m_of=lambda i, j: m["CF_AwningStripe"] if i % 2 else m["CF_Canvas"])
    for k in range(10):  # the scalloped valance along its front
        x0, x1 = ax0 + (ax1 - ax0) * k / 10, ax0 + (ax1 - ax0) * (k + 1) / 10
        vs = [bm.verts.new(W(x0, 1.52, zf)), bm.verts.new(W(x1, 1.52, zf)), bm.verts.new(W(x1, 1.42, zf)), bm.verts.new(W((x0 + x1) / 2, 1.36, zf)), bm.verts.new(W(x0, 1.42, zf))]
        bm.faces.new(vs).material_index = m["CF_AwningStripe"] if k % 2 else m["CF_Canvas"]
    for pxz in (vx - 0.85, vx + 1.25):
        cylinder(bm, W(pxz, 0.0, zf), W(pxz, 1.56, zf), 0.025, 8, m=m["CF_Pole"])
        cylinder(bm, W(pxz, 1.5, zf), W(pxz + 0.25 * (1 if pxz > vx else -1), 0.0, zf + 0.55), 0.007, 4, m=m["CF_Rope"])
    # the folding camp chair under it
    chx, chz = L["campChair"]["x"], L["campChair"]["z"]
    box(bm, chx - 0.24, chx + 0.24, 0.3, 0.34, chz - 0.2, chz + 0.2, m=m["CF_ChairFabric"])
    sheet(bm, 1, 4, lambda u, w_: W(chx - 0.24 + 0.48 * w_, 0.34 + 0.44 * u, chz - 0.2 - 0.12 * u), m_of=lambda i, j: m["CF_ChairFabric"])
    for sx in (-1, 1):
        cx2 = chx + sx * 0.25
        cylinder(bm, W(cx2, 0.0, chz - 0.22), W(cx2, 0.34, chz + 0.2), 0.015, 5, m=m["CF_Metal"])
        cylinder(bm, W(cx2, 0.0, chz + 0.22), W(cx2, 0.34, chz - 0.2), 0.015, 5, m=m["CF_Metal"])
        cylinder(bm, W(cx2, 0.34, chz - 0.2), W(cx2, 0.78, chz - 0.32), 0.015, 5, m=m["CF_Metal"])
        box(bm, cx2 - 0.025, cx2 + 0.025, 0.5, 0.53, chz - 0.2, chz + 0.16, m=m["CF_Pole"])

    # --- the pole the lights are strung from, a lantern hook at its top ---
    sp = L["stringPole"]
    cylinder(bm, W(sp["x"], 0.0, sp["z"]), W(sp["x"], sp["h"] + 0.08, sp["z"]), 0.05, 8, m=m["CF_Pole"], r_end=0.04)
    cylinder(bm, W(sp["x"] - 0.16, sp["h"] - 0.05, sp["z"]), W(sp["x"] + 0.16, sp["h"] - 0.05, sp["z"]), 0.022, 6, m=m["CF_Pole"])
    for k in range(5):
        a = 2 * math.pi * k / 5
        blob(bm, sp["x"] + 0.14 * math.cos(a), 0.04, sp["z"] + 0.14 * math.sin(a), 0.07, 0.05, 0.06, m=m["CF_Metal"], cuts=2, noise=0.1, rng=rng, flat_bottom=-0.01)

    # --- the chopping stump, and two split halves beside it ---
    ch = L["chop"]
    cylinder(bm, W(ch["x"], 0.0, ch["z"]), W(ch["x"], 0.36, ch["z"]), 0.25, 14, m=m["CF_Bark"], cap_m=m["CF_WoodCut"], wobble=0.05, rng=rng)
    for sgn in (-1, 1):
        a0 = W(ch["x"] + sgn * 0.45, 0.07, ch["z"] + 0.3)
        cylinder(bm, a0, a0 + W(0.12 * sgn, 0, 0.3) - W(0, 0, 0), 0.08, 8, m=m["CF_WoodCut"], cap_m=m["CF_Bark"])

    # --- the canoe's cleat on the dock, and its rope ---
    cl = L["cleat"]
    deck = L["dock"]["deck"]
    box(bm, cl["x"] - 0.07, cl["x"] + 0.07, deck, deck + 0.035, cl["z"] - 0.025, cl["z"] + 0.025, m=m["CF_Metal"])
    cn = L["canoe"]
    water = L["river"]["water"]
    bow = W(cn["x"] - cn["len"] / 2 + 0.08, water + 0.27, cn["z"])
    mid = W((cl["x"] + cn["x"] - cn["len"] / 2) / 2, water + 0.02, (cl["z"] + cn["z"]) / 2)
    cylinder(bm, W(cl["x"], deck + 0.03, cl["z"]), mid, 0.011, 5, m=m["CF_Rope"])
    cylinder(bm, mid, bow, 0.011, 5, m=m["CF_Rope"])

    make_object("Campfire_Glamping", bm, M, coll)
    # the interactive ones, marked by name where they stand (their geometry is in the object above)
    for name, at in (("Prop_Telescope", (tx, 0.95, tz)), ("Prop_WoodChop", (ch["x"], 0.36, ch["z"])), ("Prop_PicnicTable", (px, 0.72, pz)), ("Prop_CamperVan", (vx, 0.0, vz))):
        mark = bpy.data.objects.new(name, None)
        mark.empty_display_type = "PLAIN_AXES"
        mark.location = W(*at)
        coll.objects.link(mark)


def build_hatchet(L, coll):
    """The hatchet bitten into the chopping stump: its own node, so the game can take it up."""
    ch = L["chop"]
    p0 = (ch["x"] - 0.02, 0.37, ch["z"] + 0.02)
    bm = bmesh.new()
    cylinder(bm, W(*p0), W(p0[0] + 0.1, p0[1] + 0.33, p0[2] + 0.2), 0.018, 8, m=1)
    blob(bm, p0[0] - 0.01, p0[1] + 0.01, p0[2] - 0.01, 0.1, 0.055, 0.016, m=0, cuts=2, n=3.0)
    make_object("Prop_WoodChop_Hatchet", bm, ["CF_Steel", "CF_Pole"], coll, origin=p0)


def build_canoe(L, coll):
    """A little red canoe, tied up off the dock: its own node, origin at the waterline (it bobs)."""
    cn = L["canoe"]
    water = L["river"]["water"]
    cx, cz, length = cn["x"], cn["z"], cn["len"]
    bm = bmesh.new()

    def hull(scale, lift):
        def point(u, v):
            s = math.sin(math.pi * u) ** 0.6
            w_ = 0.27 * scale * s
            d = 0.2 * scale * (0.55 + 0.45 * math.sin(math.pi * u))
            a = math.pi * v
            # the gunwale 0.19 over the water, so the hull's floor stays just above it (dry inside)
            return W(cx + (u - 0.5) * length * (0.98 if scale < 1 else 1), water + 0.19 + lift - d * math.sin(a) + 0.09 * (2 * u - 1) ** 4, cz + w_ * math.cos(a))
        return point

    sheet(bm, 20, 8, hull(1.0, 0.0), m_of=lambda i, j: 0)
    sheet(bm, 20, 8, hull(0.9, 0.012), m_of=lambda i, j: 1)
    for sx in (-0.45, 0.42):  # the seats
        box(bm, cx + sx - 0.07, cx + sx + 0.07, water + 0.13, water + 0.16, cz - 0.21, cz + 0.21, m=1)
    cylinder(bm, W(cx - 0.55, water + 0.18, cz - 0.05), W(cx + 0.5, water + 0.18, cz + 0.06), 0.015, 6, m=1)  # the paddle's shaft
    blob(bm, cx + 0.6, water + 0.18, cz + 0.07, 0.14, 0.012, 0.06, m=1, cuts=2)
    make_object("Prop_Canoe", bm, ["CF_Canoe", "CF_CanoeInner"], coll, origin=(cx, water, cz), recalc=False)


def build_fauna(L, coll):
    """The ducks, the raccoon and the owl: each a node the game animates (the raccoon's head and
    tail, the owl's head and eyelids are child nodes, pivoting where they join). Built facing +z."""
    water = L["river"]["water"]
    for i, d in enumerate(L["ducks"]):
        span = river_span(L, d["z"])
        x, z = (span[0] + span[1]) / 2, d["z"]
        y = water
        bm = bmesh.new()
        if i == 0:  # a little yellow duckling
            mats = ["CF_DuckYellow", "CF_Beak", "CF_Eye"]
            blob(bm, x, y + 0.07, z, 0.13, 0.09, 0.17, m=0, cuts=3)
            blob(bm, x, y + 0.13, z - 0.16, 0.06, 0.05, 0.06, m=0, cuts=2)
            blob(bm, x, y + 0.22, z + 0.12, 0.085, 0.085, 0.085, m=0, cuts=3)
            for sx in (-1, 1):
                blob(bm, x + sx * 0.12, y + 0.09, z - 0.01, 0.03, 0.06, 0.1, m=0, cuts=2)
                blob(bm, x + sx * 0.045, y + 0.24, z + 0.185, 0.014, 0.016, 0.012, m=2, cuts=2)
            blob(bm, x, y + 0.205, z + 0.215, 0.05, 0.018, 0.045, m=1, cuts=2)
        else:  # a mallard drake
            mats = ["CF_MallardBody", "CF_MallardHead", "CF_Beak", "CF_Eye"]
            blob(bm, x, y + 0.07, z, 0.14, 0.09, 0.19, m=0, cuts=3)
            blob(bm, x, y + 0.14, z - 0.18, 0.06, 0.05, 0.06, m=3, cuts=2)
            blob(bm, x, y + 0.24, z + 0.14, 0.085, 0.085, 0.085, m=1, cuts=3)
            for sx in (-1, 1):
                blob(bm, x + sx * 0.045, y + 0.26, z + 0.205, 0.013, 0.015, 0.012, m=3, cuts=2)
            blob(bm, x, y + 0.225, z + 0.235, 0.048, 0.017, 0.045, m=2, cuts=2)
        make_object(f"Fauna_Duck_0{i + 1}", bm, mats, coll, origin=(x, y, z))

    # the raccoon: body (the root), its head and its ringed tail as child nodes
    c = L["critter"]
    x, z = c["x"], c["z"]
    grey, light, dark = 0, 1, 2
    mats = ["CF_RaccoonGrey", "CF_RaccoonLight", "CF_RaccoonDark"]
    bm = bmesh.new()
    blob(bm, x, 0.16, z, 0.14, 0.13, 0.18, m=grey, cuts=3)
    blob(bm, x, 0.14, z + 0.09, 0.1, 0.09, 0.08, m=light, cuts=2)
    for sx in (-1, 1):
        for sz in (-1, 1):
            blob(bm, x + sx * 0.08, 0.04, z + sz * 0.1, 0.04, 0.045, 0.045, m=dark, cuts=2, flat_bottom=0.0)
    body = make_object("Fauna_Critter", bm, mats, coll, origin=(x, 0.0, z))
    neck = (x, 0.26, z + 0.12)
    bm = bmesh.new()
    blob(bm, x, 0.33, z + 0.2, 0.13, 0.12, 0.12, m=grey, cuts=3)
    blob(bm, x, 0.35, z + 0.29, 0.12, 0.04, 0.035, m=dark, cuts=2)
    blob(bm, x, 0.3, z + 0.3, 0.06, 0.045, 0.05, m=light, cuts=2)
    blob(bm, x, 0.315, z + 0.355, 0.018, 0.015, 0.012, m=dark, cuts=2)
    for sx in (-1, 1):
        blob(bm, x + sx * 0.05, 0.355, z + 0.32, 0.018, 0.02, 0.01, m=dark, cuts=2)
        blob(bm, x + sx * 0.08, 0.44, z + 0.17, 0.042, 0.045, 0.025, m=grey, cuts=2)
        blob(bm, x + sx * 0.08, 0.44, z + 0.19, 0.022, 0.028, 0.012, m=dark, cuts=2)
    head = make_object("Fauna_Critter_Head", bm, mats, coll, origin=neck)
    base = (x, 0.17, z - 0.16)
    bm = bmesh.new()
    for k in range(5):
        t = k / 4
        blob(bm, x, 0.19 + 0.2 * t, z - 0.2 - 0.2 * t, 0.06 - 0.008 * k, 0.06 - 0.008 * k, 0.06, m=dark if k % 2 else grey, cuts=2)
    tail = make_object("Fauna_Critter_Tail", bm, mats, coll, origin=base)
    for child in (head, tail):
        child.parent = body
        child.location = child.location - body.location

    # the owl on its branch: body (the root, at its feet), head, and eyelids in the head
    o = L["owl"]
    x, y, z = o["x"], o["y"], o["z"]
    mats = ["CF_OwlBrown", "CF_OwlLight", "CF_OwlEye", "CF_Eye", "CF_Beak", "CF_OwlLid"]
    bm = bmesh.new()
    blob(bm, x, y + 0.13, z, 0.1, 0.13, 0.09, m=0, cuts=3)
    blob(bm, x, y + 0.12, z + 0.05, 0.07, 0.09, 0.05, m=1, cuts=2)
    for sx in (-1, 1):
        blob(bm, x + sx * 0.085, y + 0.12, z - 0.01, 0.03, 0.09, 0.06, m=0, cuts=2)
        blob(bm, x + sx * 0.03, y + 0.01, z + 0.04, 0.022, 0.012, 0.03, m=4, cuts=2)
    owl = make_object("Fauna_Owl", bm, mats, coll, origin=(x, y, z))
    bm = bmesh.new()
    blob(bm, x, y + 0.33, z, 0.12, 0.1, 0.1, m=0, cuts=3)
    blob(bm, x, y + 0.33, z + 0.07, 0.1, 0.075, 0.035, m=1, cuts=2)
    for sx in (-1, 1):
        blob(bm, x + sx * 0.045, y + 0.345, z + 0.1, 0.032, 0.032, 0.018, m=2, cuts=2)
        blob(bm, x + sx * 0.045, y + 0.345, z + 0.116, 0.016, 0.016, 0.008, m=3, cuts=2)
        blob(bm, x + sx * 0.075, y + 0.43, z, 0.025, 0.05, 0.025, m=0, cuts=2)
    blob(bm, x, y + 0.31, z + 0.11, 0.014, 0.022, 0.016, m=4, cuts=2)
    owl_head = make_object("Fauna_Owl_Head", bm, mats, coll, origin=(x, y + 0.24, z))
    bm = bmesh.new()
    for sx in (-1, 1):
        blob(bm, x + sx * 0.045, y + 0.345, z + 0.104, 0.036, 0.036, 0.022, m=5, cuts=2)
    lids = make_object("Fauna_Owl_Lids", bm, mats, coll, origin=(x, y + 0.378, z + 0.1))
    owl_head.parent = owl
    owl_head.location = owl_head.location - owl.location
    lids.parent = owl_head
    lids.location = Vector(W(x, y + 0.378, z + 0.1)) - Vector(W(x, y + 0.24, z))


def build_forage(L, coll):
    """The foraging patches: each one's pickings (mushrooms, or the glowing berries on a bush) is a
    node the game hides once picked; the berry bushes themselves stay (in Campfire_Deco)."""
    rng = random.Random(55)
    for i, f in enumerate(L["forage"]):
        x, z = f["x"], f["z"]
        bm = bmesh.new()
        if f["kind"] == "mushroom":
            mats = ["CF_MushCap", "CF_MushStem"]
            for k, (dx, dz, s) in enumerate(((0, 0, 1.25), (0.14, 0.08, 0.9), (-0.1, 0.11, 0.8), (0.05, -0.12, 0.7))):
                mx, mz = x + dx, z + dz
                lathe(bm, mx, mz, [(0, 0.0), (0.045 * s, 0.0), (0.038 * s, 0.13 * s), (0, 0.14 * s)], segs=10, m=1)
                lathe(bm, mx, mz, [(0, 0.1 * s), (0.11 * s, 0.11 * s), (0.09 * s, 0.17 * s), (0.04 * s, 0.205 * s), (0, 0.21 * s)], segs=12, m=0)
                for q in range(4):
                    a = rng.random() * 6.28
                    rr = 0.055 * s
                    blob(bm, mx + rr * math.cos(a), 0.175 * s, mz + rr * math.sin(a), 0.016 * s, 0.01 * s, 0.016 * s, m=1, cuts=1, n=2.0)
        else:
            mats = ["CF_BerryGlow"]
            for k in range(11):
                a = rng.random() * 6.28
                h = 0.12 + rng.random() * 0.34
                rr = 0.3 * math.sqrt(max(0.0, 1 - ((h - 0.22) / 0.34) ** 2)) + 0.02
                blob(bm, x + rr * math.cos(a), h, z + rr * math.sin(a), 0.035, 0.035, 0.035, m=0, cuts=1, n=2.0)
        make_object(f"Forage_0{i + 1}_Yield", bm, mats, coll, origin=(x, 0.0, z))


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
    build_dock(L, coll)
    build_tent(L, cushions, coll)
    build_hammock(L, cushions, coll)
    build_trees(L, coll)
    build_rocks(L, coll)
    build_fence(L, coll)
    build_deco(L, coll)
    build_glamping(L, cushions, coll)
    build_hatchet(L, coll)
    build_canoe(L, coll)
    build_lights(L, coll)
    build_fauna(L, coll)
    build_forage(L, coll)
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
    marks = {}
    for o in coll.all_objects:
        if o.data is None:  # an empty: a seat or a fishing spot mark
            marks[o.name] = [round(o.location.x, 3), round(o.location.z, 3), round(-o.location.y, 3)]
            continue
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        # reported in the game's axes: x, y (up), z
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": len(o.data.materials)}
    checks = {
        "logTops": out["Seat_Logs"]["y"][1],
        "seatMarkHeights": sorted({v[1] for k, v in marks.items() if k.startswith("Seat_Log_")}),
        "logCushionTop": cushions["log"]["top"],
        "tentMatTop": cushions["tentMat"]["top"],
        "hammockCushionTop": cushions["hammock"]["top"],
        "water": L["river"]["water"],
        "drawCallsApprox": sum(v["materials"] for v in out.values()),
        "tris": sum(v["tris"] for v in out.values()),
    }
    return {"objects": out, "marks": marks, "checks": checks}


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
