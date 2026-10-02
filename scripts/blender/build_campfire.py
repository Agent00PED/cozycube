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
    Campfire_Paths      the packed-dirt clearing round the fire and the trails off it (smooth,
                        bevelled, one continuous ribbon each: to the tipi, the picnic table and
                        the telescope, the dock)
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
    Campfire_Trees      the pines along the back edges (the Soft Pines you fell round the clearing
                        are not here: the game draws them from trees.glb, each its own size)
    Campfire_Rocks      river boulders
    Campfire_Fence      the rustic rail fence along the front edges
    Campfire_Deco       mushrooms, wildflowers, bushes, lily pads with lotus flowers, reeds and the
                        woodpile
    Campfire_Glamping   everything else that stands still: the picnic table (gingham runner,
                        camping lantern, enamel mugs, a cooler), the brass telescope, the vintage
                        camper van with its striped awning and camp chair, the light pole and the
                        canoe's cleat and rope
    Prop_Workbench      the carpenter's workbench back by the north pines between the tipi and
                        Buster's stall (a plank top,
                        a face vise, a shelf of boards, a tool rack with a saw, a mallet and chisels,
                        a half-carved totem, shavings, a little lantern), its front toward the fire
    Prop_Signpost       the 3-way signpost at the trails' fork (Campfire, Pier, Overlook)
    Prop_Canoe          the red canoe tied off the dock (origin at the waterline: it bobs)
    StringLight_01..06  the strings of warm bulbs from the tipi, the pole, the pines and the awning,
    StringLight_Fence   and the swags along the front fence (each origin at an end: they sway)
    Fauna_Duck_01/02    a duckling and a mallard (they paddle ovals on the river)
    Fauna_Critter       a raccoon, with _Head and _Tail child nodes pivoting where they join
    Fauna_Owl           an owl on a pine branch by the tent, with _Head and, in it, _Lids
    Forage_0N_Yield     each foraging patch's pickings: spotted mushrooms or glowing berries
    Prop_Tripod         the Dutch oven's tripod over the fire: three lashed poles
    Stew_Pot            the cast-iron Dutch oven on its chain, origin at the tripod's apex (it
                        sways from there); its child Stew_Contents is the stew's surface (the game
                        shows and tints it from the pot's ingredients)
    Picnic_Plates       four glazed off-white ceramic plates and two ceramic mugs on the picnic table
    Picnic_Skewer_0N    a skewer of toasted marshmallows on plate N, and Picnic_Bbq_0N a BBQ
                        skewer (the game shows what friends have left there)

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts, so every number below
reads as in campfire.ts.

The ground is the game's own heightfield (scripts/blender/data/campfire_terrain.json, written by
`npm run campfire-terrain` from shared/worlds/campfire.ts: gentle mounds, a terrace, the river's
channel), its moss, trails and banks painted into its vertex colours. Everything else is built as on
flat ground and then stood on it (make_object's `lift`). Last, every plain colour is baked into the
vertices and the still things are fused by finish (`fuse`): Campfire_Static and Campfire_Pines,
about one draw call a finish; the nodes the game animates stay their own (DYNAMIC). Run
`npm run pack-models` after it.
"""

import json
import math
import os
import random
import re
import traceback

import bmesh
import bpy
from mathutils import Matrix, Vector

COLLECTION = "Campfire"


def nature():
    """scripts/blender/nature_kit.py (the conifers, the shade under things, the clumps), loaded
    afresh on every run (the Live Bridge's Blender keeps modules between runs)."""
    import importlib
    import sys
    here = os.path.join(repo_root(), "scripts", "blender")
    if here not in sys.path:
        sys.path.insert(0, here)
    import nature_kit
    return importlib.reload(nature_kit)

PALETTE = {
    "CF_Grass": "#5B7A4E",
    "CF_GrassDark": "#4A6642",
    "CF_GrassLight": "#6F8D58",
    "CF_Soil": "#3A2D25",
    "CF_SoilDeep": "#2A211C",
    "CF_Dirt": "#8B6B4C",
    "CF_Trail": "#7A6245",
    "CF_PondBed": "#2E4A52",
    "CF_Water": "#4A89A6",
    "CF_Stone": "#8E8C88",
    "CF_StoneDark": "#6D6A66",
    "CF_Bark": "#5E4230",
    "CF_WoodCut": "#D2A774",
    "CF_Pine": "#3B7150",
    "CF_PineLight": "#528E5E",
    "CF_PineDeep": "#2E5C45",
    "CF_Snag": "#8C8478",
    "CF_Needles": "#6B5B3E",
    "CF_LeafLitter": "#9C8A48",
    "CF_GrassDry": "#8A9455",
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
    "CF_MushBrown": "#9A6A45",
    "CF_WildBerry": "#C8374A",
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
    "CF_LanternWarm": "#FFA844",
    "CF_Iron": "#2F2C2A",
    "CF_IronRim": "#4A4643",
    "CF_Stew": "#C8763C",
    "CF_Mallow": "#F1D9A8",
    "CF_MallowToast": "#D9974A",
    "CF_Meat": "#8A4B2F",
    "CF_Pepper": "#6BA84F",
    "CF_Ceramic": "#F4EFE6",
    "CF_ClayFoot": "#D9A67A",
    "CF_TentSage": "#8FA37A",
    # the dressing pass (baked into the clay's vertex colours: a colour here costs no draw call)
    "CF_GrassTuft": "#6E9454",
    "CF_PetalBlue": "#9CB7F2",
    "CF_PetalWhite": "#F6F1E6",
    "CF_Crate": "#A9794A",
    "CF_CrateDark": "#7E5632",
    "CF_Barrel": "#8A5B36",
    "CF_Leaf": "#D9A441",
    "CF_Lichen": "#8FA070",
    "CF_BirchBark": "#ECE8DC",
    "CF_BirchMark": "#3A3531",
    "CF_BirchLeaf": "#A8C66C",
    "CF_BirchLeafLight": "#C9DB86",
    "CF_Juniper": "#3F6B52",
    "CF_Clover": "#7FA85E",
    # the places (docs/maps-fill-plan.md part 2)
    "CF_BlanketBlue": "#5E7FB0",
    "CF_Basket": "#B58A55",
    "CF_Straw": "#D9B865",
    "CF_Willow": "#7FA35E",
    "CF_WillowLight": "#9DBB6E",
    "CF_Lupine": "#8C6BC8",
    "CF_Driftwood": "#B7A68E",
    "CF_Cattail": "#6B4A30",
    # the butterflies' templates (docs/maps-fill-plan.md part 5; pale where the game tints them)
    "CF_FlyBody": "#2E2622",
    "CF_FlyWing": "#FFF6E2",
    "CF_FlyWingLow": "#F4E4C8",
    # the gallery's painted ducks and owls' eyes (the braided rug they were made for is gone: the
    # firepit is river stones, raw logs and boulders now)
    "CF_RugRust": "#C8704A",
    "CF_RugMustard": "#E8C25A",
    "CF_RugSage": "#7D8F6A",
}
ROUGHNESS = {"CF_Ceramic": 0.45, "CF_Iron": 0.7, "CF_Stew": 0.45, "CF_Water": 0.25, "CF_Metal": 0.6, "CF_Glass": 0.4, "CF_Chrome": 0.45, "CF_Brass": 0.55, "CF_Steel": 0.5}
# the ground decals' tops, a layer each over the moss (y = 0): patches, paths, then the clearing
LAYER_PATCH = 0.008
LAYER_PATH = 0.015
LAYER_CLEARING = 0.022
# glowing things: (strength) of an emission in their own colour
EMISSION = {"CF_Ember": 2.2, "CF_FlameOuter": 3.0, "CF_FlameInner": 4.0, "CF_LanternGlass": 2.5, "CF_Bulb": 3.0, "CF_BerryGlow": 2.0, "CF_LanternWarm": 2.6}
# thin sheets seen from both sides
DOUBLE_SIDED = {"CF_GrassTuft", "CF_Leaf", "CF_GrassDark", "CF_TentSage", "CF_Canvas", "CF_CanvasStripe", "CF_Hammock", "CF_HammockStripe", "CF_Checker", "CF_VanCream", "CF_Cooler", "CF_AwningStripe", "CF_Canoe", "CF_CanoeInner", "CF_BlanketBlue"}


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


def river_z(L):
    P = L["river"]["points"]
    return P[0][0] - P[0][2], P[-1][0] + P[-1][2]


def path_polyline(path, step=0.1):
    """A trail's centre line and width: a Catmull-Rom spline through its points ([x, z] or
    [x, z, width]; a point without a width takes the trail's "w"), sampled every ~step."""
    P = [(p[0], p[1], p[2] if len(p) > 2 else path["w"]) for p in path["points"]]
    at = lambda k: P[max(0, min(len(P) - 1, k))]
    out = []
    for i in range(len(P) - 1):
        seg = math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1])
        n = max(2, int(seg / step))
        for k in range(n):
            u = k / n
            x, z, w = (catmull(at(i - 1)[d], at(i)[d], at(i + 1)[d], at(i + 2)[d], u) for d in (0, 1, 2))
            out.append((x, z, max(0.3, w)))
    out.append(P[-1])
    return out


def near_path(L, x, z, pad):
    for path in L["paths"]:
        pts = path_polyline(path, 0.3)
        for (ax, az, aw), (bx, bz, bw) in zip(pts, pts[1:]):
            dx, dz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz or 1)))
            if math.hypot(x - (ax + dx * t), z - (az + dz * t)) < max(aw, bw) / 2 + pad:
                return True
    return False


def read_cushions(root):
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    out = {}
    for name in ("log", "hammock", "tentMat", "picnicBench", "campChair", "stump", "dock", "canoe", "boulder", "picnicBlanket", "swing"):
        m = re.search(rf"\b{name}: \{{ y: (-?[0-9.]+), h: ([0-9.]+) \}}", src)
        y, h = float(m.group(1)), float(m.group(2))
        out[name] = {"y": y, "h": h, "top": y + h / 2}
    return out


# ---------------------------------------------------------------------------------------------
# the ground: its grid from the game (scripts/campfire-terrain.ts), and what stands on it

LAYOUT = None  # the layout, for the helpers below (set by build)
TERRAIN = None  # scripts/blender/data/campfire_terrain.json (set by build)
RIM_R = 1.1  # the island's rounded corners


def read_terrain(root):
    with open(os.path.join(root, "scripts", "blender", "data", "campfire_terrain.json"), encoding="utf-8") as f:
        return json.load(f)


def _grid_y(key, x, z):
    """campGroundY in shared/worlds/campfire.ts: the grid's own triangles (each cell cut from its
    (-x, -z) corner to its (+x, +z) one)."""
    T = TERRAIN
    n, cell, half, g = T["n"], T["cell"], T["half"], T[key]
    u = min(n - 1e-6, max(0.0, (x + half) / cell))
    v = min(n - 1e-6, max(0.0, (z + half) / cell))
    i, k = int(u), int(v)
    fu, fv = u - i, v - k
    at = lambda a, b: g[b * (n + 1) + a]
    h00, h11 = at(i, k), at(i + 1, k + 1)
    if fu >= fv:
        return h00 + (at(i + 1, k) - h00) * fu + (h11 - at(i + 1, k)) * fv
    return h00 + (h11 - at(i, k + 1)) * fu + (at(i, k + 1) - h00) * fv


def ground_y(x, z):
    """The drawn ground (the river's channel cut in)."""
    return _grid_y("ground", x, z)


def land_y(x, z):
    """The ground things stand on (no channel)."""
    return _grid_y("land", x, z)


def lift_at(x, z):
    """How far up a thing built at y = 0 goes to stand at (x, z): the land there, or nothing in the
    river (the reeds, the lily pads, the pilings and the boats keep the water's level)."""
    if TERRAIN is None:
        return 0.0
    return 0.0 if in_river(LAYOUT, x, z) else land_y(x, z)


def over_ground(p):
    """A layout point whose height is measured from the ground under it, as a point in the world."""
    return (p[0], p[1] + land_y(p[0], p[2]), p[2])


def lift_parts(bm):
    """Stands everything in `bm` on the ground: each loose part (a trunk, a cone, a rock, a plank)
    goes up, whole, by the land under its middle, so nothing is sheared by a slope. The lift is
    kept on the vertices ("lift": the pines' sway is measured from it)."""
    layer = bm.verts.layers.float.get("lift") or bm.verts.layers.float.new("lift")
    seen = set()
    for v0 in bm.verts:
        if v0 in seen:
            continue
        part = []
        stack = [v0]
        seen.add(v0)
        while stack:
            v = stack.pop()
            part.append(v)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o not in seen:
                    seen.add(o)
                    stack.append(o)
        xs = [v.co.x for v in part]
        ys = [v.co.y for v in part]
        dz = lift_at((min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2)
        if dz:
            for v in part:
                v.co.z += dz
                v[layer] = dz


def _hash(i, k):
    n = (i * 374761393 + k * 668265263) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, z):
    """Smooth value noise, 0..1."""
    i, k = math.floor(x), math.floor(z)
    fx, fz = x - i, z - k
    fx, fz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    a, b, c, d = _hash(i, k), _hash(i + 1, k), _hash(i, k + 1), _hash(i + 1, k + 1)
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz


def smooth(a, b, v):
    """0 at a, 1 at b (either way round), eased."""
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def mixc(a, b, t):
    return [a[k] + (b[k] - a[k]) * t for k in range(3)]


def rim_inside(x, z, half):
    """How far inside the island's rounded outline (x, z) is (negative outside)."""
    ax, az = abs(x), abs(z)
    c = half - RIM_R
    if ax > c and az > c:
        return RIM_R - math.hypot(ax - c, az - c)
    return min(half - ax, half - az)


def snap_rim(x, z, half):
    """(x, z), or the nearest point of the island's outline if it lies outside it."""
    c = half - RIM_R
    ax, az = abs(x), abs(z)
    if ax > c and az > c:
        d = math.hypot(ax - c, az - c)
        if d > RIM_R:
            ax, az = c + (ax - c) / d * RIM_R, c + (az - c) / d * RIM_R
            return math.copysign(ax, x), math.copysign(az, z)
        return x, z
    return max(-half, min(half, x)), max(-half, min(half, z))


def vc_material(name, rough=0.82, double=False):
    """A vertex-colour material: its base colour is the mesh's "Col" corner colours."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    attr = next((n for n in nodes if n.type == "VERTEX_COLOR"), None) or nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    m.roughness = rough
    m.use_backface_culling = not double
    return m


def use_col(me):
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass


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


def studio(root, call, *args):
    """The Blender studio (scripts/blender/studio.py, run fresh from disk): "begin" before the
    build (a headless run joins the master file), "finish" after the export (the collections to
    their place on the studio grid, the .blend saved). A studio failure never fails the export."""
    path = os.path.join(root, "scripts", "blender", "studio.py")
    ns = {"__name__": "studio"}
    try:
        exec(compile(open(path, encoding="utf-8").read(), path, "exec"), ns)
        return ns[call](root, *args)
    except Exception:
        return {"error": traceback.format_exc()}


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


def make_object(name, bm, mats, coll, origin=None, smooth_all=False, recalc=True, lift="parts", anchor=None):
    """`bm` as a mesh object `name`, its materials `mats`, its origin at the game point `origin`.
    Its faces are turned to face outward first (the three.js runtime culls back faces), unless it
    is an open sheet already built facing the right way (`recalc` False).

    Everything is built as on flat ground and then stood on the island's own (`lift`): an object
    with an origin goes up whole by the land under it (or under `anchor`, an (x, z): a child node
    takes its parent's); one without, part by part (lift_parts), or, "vertex", vertex by vertex (a
    fence follows the ground); None leaves it where it was built (the ground, the water, a string
    whose ends are already in the world)."""
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if smooth_all:
        for f in bm.faces:
            f.smooth = True
    me = bpy.data.meshes.new(name + "Mesh")
    place = None
    if origin is not None:
        shift = W(*origin)
        for v in bm.verts:
            v.co -= shift
        ax, az = anchor if anchor else (origin[0], origin[2])
        place = W(origin[0], origin[1] + (lift_at(ax, az) if lift else 0.0), origin[2])
    elif lift == "vertex":
        for v in bm.verts:
            v.co.z += lift_at(v.co.x, -v.co.y)
    elif lift:
        lift_parts(bm)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(material(m))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if place is not None:
        ob.location = place
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


SHADE = None  # what lies under things (set by build, read by the ground's paint)


def make_shade(L):
    """The pool of shade under every crown and the contact shadow at the foot of what stands (the
    game draws no shadows), and the litter the trees drop: brown needles under the pines, pale
    leaves under the birches."""
    S = nature().Shade()
    D = L["dressing"]
    for i, t in enumerate(L["trees"]):
        bare = t.get("bare", 0.0)
        S.cast(t["x"], t["z"], 1.25 * t["s"], 0.36 if bare else 0.46, 0.85, "needles")
    for t in L["fellTrees"]:
        S.cast(t["x"], t["z"], 1.3, 0.34, 0.8, "needles")
    for t in L["fellBirches"]:
        S.cast(t["x"], t["z"], 1.1, 0.24, 0.55, "leaves")
    for x, z, sz in D["birches"]:
        S.cast(x, z, 1.05 * sz, 0.3, 0.5, "leaves")
    P = L.get("places")
    if P:
        w = P["riverEnd"]["willow"]
        S.cast(w["x"], w["z"], 1.6 * w["s"], 0.34, 0.3, "leaves")
        for h in P["hammocks"]:
            S.cast((h["a"][0] + h["b"][0]) / 2, (h["a"][1] + h["b"][1]) / 2, 0.85, 0.26, throw=0.1)
        for px, pz, pr in places_solid(L):
            S.cast(px, pz, pr * 0.8, 0.2, throw=0.12)
    # what stands: a contact shadow hugging its foot
    for x, z, sz in D["shrubs"]:
        S.cast(x, z, 0.62 * sz, 0.34, throw=0.12)
    for r in L["rocks"]:
        S.cast(r["x"], r["z"], 0.62 * r["s"], 0.34, throw=0.12)
    for u in L.get("undergrowth", []):
        if u["kind"] in ("mossy", "berries"):
            S.cast(u["x"], u["z"], 0.5, 0.3, throw=0.12)
    for p in D["lanternPosts"] + D["barrels"] + D["stumps"]:
        S.cast(p["x"], p["z"], 0.42, 0.32, throw=0.15)
    for p in D["crates"]:
        S.cast(p["x"], p["z"], 0.7, 0.36, throw=0.15)
    for f in D["fallen"]:
        for u in (-0.35, 0.0, 0.35):
            S.cast(f["x"] + math.sin(f["yaw"]) * f["len"] * u, f["z"] + math.cos(f["yaw"]) * f["len"] * u, 0.42, 0.3, throw=0.15)
    for x, z, h in D.get("snags", []):
        S.cast(x, z, 0.5, 0.3, throw=0.2)
    S.cast(L["tent"]["x"], L["tent"]["z"], L["tent"]["r"] * 1.35, 0.4, throw=0.14)
    v = L["van"]
    for u in (-0.8, 0.0, 0.8):
        S.cast(v["x"] + u, v["z"], 1.15, 0.38, throw=0.16)
    for key, r, dark in (("buster", 1.25, 0.34), ("barnaby", 1.2, 0.34), ("workbench", 1.0, 0.34), ("woodpile", 0.9, 0.34), ("splitblock", 0.5, 0.3), ("picnic", 1.25, 0.32),
                         ("telescope", 0.5, 0.26), ("signpost", 0.35, 0.26), ("campChair", 0.5, 0.28), ("stringPole", 0.3, 0.26), ("guitarCase", 0.55, 0.26), ("busterBoard", 0.5, 0.3), ("barnabyBoard", 0.0, 0.0)):
        if key in L and r > 0 and "x" in L[key]:
            S.cast(L[key]["x"], L[key]["z"], r, dark, throw=0.14)
    g = L["gallery"]
    for u in (-1.2, 0.0, 1.2):
        S.cast(g["x"] + u, (g["z"] + g["back"]) / 2, 1.5, 0.32, throw=0.1)
    for p in firepit_pieces(L):
        for _, (sx, sz) in p["seats"]:
            S.cast(sx, sz, 0.55, 0.3, throw=0.12)
    return S


def dirt_field(L):
    """How bare the ground is at (x, z), 0..1: the clearing, the trails out of it (each along its
    spline, as wide as it says) and the worn spots where people stand (the stalls, the bench, the
    dock's landing), all with a ragged edge."""
    lines = []
    for path in L["paths"]:
        pts = path_polyline(path, 0.12)
        pad = max(p[2] for p in pts) / 2 + 1.3
        box_ = (min(p[0] for p in pts) - pad, max(p[0] for p in pts) + pad, min(p[1] for p in pts) - pad, max(p[1] for p in pts) + pad)
        lines.append((box_, pts))
    c = L["clearing"]
    fire = L["fire"]

    def front(key, reach, r, s):
        p = L[key]
        d = math.hypot(fire["x"] - p["x"], fire["z"] - p["z"]) or 1.0
        return (p["x"] + (fire["x"] - p["x"]) / d * reach, p["z"] + (fire["z"] - p["z"]) / d * reach, r, s)

    dock = L["dock"]
    wear = [
        # (none: a worn spot on its own, at a stall or the dock, read as a stain. Only the fire's
        # ground is worn. A spot is (x, z, radius, strength).)
    ]

    K = nature()

    def field(x, z):
        # (a trail is where feet pass every day: an even tread a little over half the trail's width,
        # following its line smoothly, the grass thinning into it over 0.6 m with no edge and no
        # raggedness: nature_kit `worn`. Only a slow, slight wander. The clearing is worn round the fire and its seats)
        wob = 0.1 * (vnoise(x * 0.45 + 31.0, z * 0.45 + 7.0) - 0.5)
        best = 9.0
        for (x0, x1, z0, z1), pts in lines:
            if x < x0 or x > x1 or z < z0 or z > z1:
                continue
            for (ax, az, aw), (bx, bz, bw) in zip(pts, pts[1:]):
                dx, dz = bx - ax, bz - az
                t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz or 1)))
                d = math.hypot(x - (ax + dx * t), z - (az + dz * t)) - 0.27 * (aw + (bw - aw) * t)
                if d < best:
                    best = d
        w = K.worn(best + wob)
        # (the fire's worn ground: an uneven round, a little longer one way)
        # (wide enough that the log seats lie on it, nearly round, and fading out over more than
        # a metre: trodden ground round a fire has no outline)
        w = max(w, (0.8 + 0.2 * smooth(0.3, 0.62, vnoise(x * 1.25 + 7.0, z * 1.25 - 3.0))) * K.worn(0.6 * K.blot(x, z, c["x"], c["z"], c["r"] * 1.42, vnoise, squash=0.93, lobes=0.4)))
        # (grass holding on in places: a worn patch is never evenly bare)
        thin = 0.72 + 0.28 * smooth(0.3, 0.62, vnoise(x * 1.25 + 7.0, z * 1.25 - 3.0))
        for wx, wz, r, s in wear:
            if math.hypot(x - wx, z - wz) < r * 2.4:
                w = max(w, s * thin * K.worn(K.blot(x, z, wx, wz, r * 1.25, vnoise)))
        return w

    return field


def wood_at(L, x, z):
    """How deep in the wood (x, z) is, 0..1: the layout's `dressing.wood` discs, their edges wandering."""
    w = 0.0
    wob = 0.9 * (vnoise(x * 0.8 + 2.0, z * 0.8 - 6.0) - 0.5)
    for wx, wz, wr in L["dressing"].get("wood", []):
        w = max(w, smooth(wr, wr * 0.45, math.hypot(x - wx, z - wz) + wob))
    return w


def ground_color(L, x, z, h, dirt, tones):
    """The ground's colour at (x, z): mottled moss (darker and lighter in slow drifts, paler up on
    the knoll), bare dirt where it is trodden, damp earth at the river's lip, stone down its bank
    and the dark bed under the water."""
    grass, dark, light, earth, soil, bed, stone = tones
    # (the meadows: a brighter clover green in a ragged round patch)
    clover = 0.0
    for mx, mz, mr in L["dressing"]["meadows"]:
        clover = max(clover, smooth(mr, mr * 0.45, math.hypot(x - mx, z - mz) + 0.5 * (vnoise(x * 1.3 + 5.0, z * 1.3) - 0.5)))
    if clover > 0:
        grass = mixc(grass, lin(PALETTE["CF_Clover"]), 0.6 * clover)
        dark = mixc(dark, lin(PALETTE["CF_Clover"]), 0.45 * clover)
    n1 = vnoise(x * 0.33 + 3.1, z * 0.33 - 1.7)
    n2 = vnoise(x * 0.9 - 5.0, z * 0.9 + 2.2)
    n3 = vnoise(x * 2.7 + 0.4, z * 2.7 + 9.1)
    col = mixc(grass, dark, 0.6 * smooth(0.42, 0.78, n1))
    col = mixc(col, light, 0.7 * smooth(0.5, 0.85, n2))
    col = mixc(col, light, 0.3 * smooth(0.6, 1.7, h))
    # (the wood's floor: darker, mossier, needles between the trees; the open lawns bleach in the sun)
    wood = wood_at(L, x, z)
    n4 = vnoise(x * 0.21 - 9.0, z * 0.21 + 4.0)
    col = mixc(col, lin(PALETTE["CF_GrassDry"]), 0.5 * smooth(0.55, 0.85, n4) * (1 - wood))
    if wood > 0:
        col = mixc(col, mixc(dark, lin(PALETTE["CF_Needles"]), 0.3 + 0.3 * n2), 0.62 * wood)
    col = [c * (0.955 + 0.09 * n3) for c in col]
    w = dirt(x, z)
    if w > 0:
        # (trampled grass, yellowed, where the wear begins; bare earth where it is complete)
        # (one gradient: grass, thinning and yellowing, into dry trodden earth; no threshold in it)
        col = mixc(col, lin(PALETTE["CF_GrassDry"]), 0.22 * math.sin(math.pi * w) ** 2)
        col = mixc(col, [c * (0.93 + 0.12 * n2) * (0.97 + 0.06 * n3) for c in lin(PALETTE["CF_Trail"])], 0.84 * w ** 1.2)
        # (ash and char in the soil close round the fire's stones)
        df = math.hypot(x - L["fire"]["x"], z - L["fire"]["z"])
        if df < 1.9:
            col = [c * (1 - 0.3 * smooth(1.9, 0.8, df)) for c in col]
    if SHADE is not None:
        dark, litter = SHADE.at(x, z)
        if "needles" in litter:
            col = mixc(col, [c * (0.85 + 0.3 * n3) for c in lin(PALETTE["CF_Needles"])], 0.8 * litter["needles"] * (0.7 + 0.3 * n2))
        if "leaves" in litter:
            col = mixc(col, lin(PALETTE["CF_LeafLitter"]), 0.4 * litter["leaves"] * (0.5 + 0.5 * n3))
        if dark > 0:
            # (a shade is darker and cooler than the lit ground beside it)
            col = [col[0] * (1 - dark), col[1] * (1 - dark * 0.9), col[2] * (1 - dark * 0.72)]
    span = river_span(L, z)
    if span is not None:
        inside = min(x - span[0], span[1] - x)
        if inside > -0.5:
            col = mixc(col, soil, 0.6 * smooth(-0.5, 0.02, inside))
        if inside > 0:
            col = mixc(col, stone, smooth(0.0, 0.16, inside))
            col = mixc(col, bed, smooth(0.2, L["terrain"]["bank"] + 0.15, inside))
    return col


def build_ground(L, coll):
    """The island's top, modelled from the game's own grid (TERRAIN: each cell cut along the diagonal
    the game reads it by, and cut finer for the paint), coloured vertex by vertex; its rim rounded
    off, its sides falling to the rock beneath."""
    half = L["half"]
    sub = 2
    N = TERRAIN["n"] * sub
    step = 2 * half / N
    dirt = dirt_field(L)
    tones = [lin(PALETTE[k]) for k in ("CF_Grass", "CF_GrassDark", "CF_GrassLight", "CF_Dirt", "CF_Soil", "CF_PondBed", "CF_StoneDark")]
    soil, deep = lin(PALETTE["CF_Soil"]), lin(PALETTE["CF_SoilDeep"])
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    verts, rim_of = {}, {}

    def vert(i, k):
        x, z = snap_rim(-half + i * step, -half + k * step, half)
        key = (round(x, 4), round(z, 4))
        v = verts.get(key)
        if v is None:
            rim = rim_inside(x, z, half)
            y = ground_y(x, z) - 0.2 * smooth(0.4, 0.0, rim) ** 2
            v = verts[key] = bm.verts.new(W(x, y, z))
            rim_of[v] = rim
        return v

    top = []
    for k in range(N):
        for i in range(N):
            a, b, c, d = vert(i, k), vert(i + 1, k), vert(i + 1, k + 1), vert(i, k + 1)
            for tri in ((a, c, b), (a, d, c)):
                if len(set(tri)) < 3 or all(rim_of[v] < 1e-4 for v in tri):
                    continue
                try:
                    f = bm.faces.new(tri)
                except ValueError:
                    continue
                f.normal_update()
                if f.normal.z < 0:
                    f.normal_flip()
                f.smooth = True
                top.append(f)
    # (cut finer along the footpaths' edges, then painted: a vertex's colour from where it stands)
    nature().refine_near(bm, [f for f in top if all(rim_of[v] > 0.5 for v in f.verts)], dirt)
    vcol = {}
    for f in bm.faces:
        f.smooth = True
        for loop in f.loops:
            v = loop.vert
            if v not in vcol:
                x, z = v.co.x, -v.co.y
                rim = rim_inside(x, z, half)
                vcol[v] = (*mixc(ground_color(L, x, z, v.co.z, dirt, tones), soil, 0.65 * smooth(0.32, 0.0, rim)), 1.0)
            loop[col] = vcol[v]
    # the sides: from the rim straight down to the rock beneath, in soil (their own vertices: a hard
    # edge at the rim)
    for e in [e for e in bm.edges if len(e.link_faces) == 1]:
        a, b = e.verts
        quad = [bm.verts.new(a.co), bm.verts.new(b.co), bm.verts.new((b.co.x, b.co.y, -1.12)), bm.verts.new((a.co.x, a.co.y, -1.12))]
        f = bm.faces.new(quad)
        f.normal_update()
        mid = f.calc_center_median()
        if f.normal.x * mid.x + f.normal.y * mid.y < 0:
            f.normal_flip()
        f.smooth = False
        for loop in f.loops:
            loop[col] = (*(soil if loop.vert.co.z > -1.0 else deep), 1.0)
    me = bpy.data.meshes.new("Campfire_GroundMesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(vc_material("CF_Ground", rough=0.9))
    use_col(me)
    ob = bpy.data.objects.new("Campfire_Ground", me)
    coll.objects.link(ob)
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
    make_object("Campfire_Underside", bm, ["CF_SoilDeep"], coll, smooth_all=True, lift=None)


def build_water(L, coll):
    """The river's surface, one sheet: across it a row of vertices every quarter metre down its
    length, each carrying in its colour what the game's water shader reads (red: how far from the
    nearer bank, 0 at the bank to 1 a metre and a half out; green: 1 on falling water; blue: how far
    down a fall, 0 at its lip to 1 at its foot); the fall off the rock step into the plunge pool at
    its head, and the sheet over the island's edge where it leaves."""
    p = L["river"]
    water = p["water"]
    half = L["half"]
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    data = {}

    def vert(x, y, z, shore, fall=0.0, down=0.0):
        v = bm.verts.new(W(x, y, z))
        data[v] = (max(0.0, min(1.0, shore / 1.5)), fall, down, 1.0)
        return v

    def strip(rows):
        for r0, r1 in zip(rows, rows[1:]):
            for (a, b), (c, d) in zip(zip(r0, r0[1:]), zip(r1, r1[1:])):
                f = bm.faces.new((a, c, d, b))
                f.smooth = True

    z0, z1 = river_z(L)
    end = min(z1 - 0.01, half - 0.05)
    # (it comes in over the island's north edge and leaves over its south: no head, no falls)
    zs = [-half + 0.05]
    z = -half + 0.25
    while z < end:
        zs.append(z)
        z += 0.25
    zs.append(end)
    cols = 8
    rows = []
    for z in zs:
        z = min(max(z, z0 + 0.01), z1 - 0.01)
        span = river_span(L, z)
        if span is None:
            continue
        x0, x1 = span[0] + 0.02, span[1] - 0.02
        w = x1 - x0
        rows.append([vert(x0 + w * c / cols, water, z, min(c, cols - c) / cols * w) for c in range(cols + 1)])
    # (where the river meets the island's edge the diorama is cut: the water's end is a still face
    # down to its bed, never an open notch)
    cap = lambda row: [vert(v.co.x, water - 0.8, -v.co.y, data[v][0] * 1.5) for v in row]
    rows = [cap(rows[0])] + rows + [cap(rows[-1])]
    strip(rows)
    for f in bm.faces:
        f.normal_update()
        mid = f.calc_center_median()
        # (up, or on a falling sheet toward the open side: south at the edge and at the head)
        if f.normal.z < -1e-4 or (abs(f.normal.z) <= 1e-4 and f.normal.y > 0):
            f.normal_flip()
        for loop in f.loops:
            loop[col] = data[loop.vert]
    me = bpy.data.meshes.new("Campfire_WaterMesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(vc_material("CF_Water", rough=0.25, double=True))
    use_col(me)
    ob = bpy.data.objects.new("Campfire_Water", me)
    coll.objects.link(ob)


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


def firepit_pieces(L):
    """The firepit's seating as shared/worlds/campfire.ts derives it (FIREPIT): each piece's centre,
    its angle round the fire, the way along it, and its seats (name, x, z)."""
    fx, fz = L["fire"]["x"], L["fire"]["z"]
    out = []
    for p in L["firepit"]["pieces"]:
        r = p.get("r", L["firepit"]["r"])
        a = math.radians(p["angle"])
        cx, cz = fx + math.cos(a) * r, fz + math.sin(a) * r
        tx, tz = -math.sin(a), math.cos(a)
        n = len(p["seats"])
        if p["kind"] == "log":
            spacing = 0.95 if n == 3 else 1.0
            seats = [(cx + tx * (k - (n - 1) / 2) * spacing, cz + tz * (k - (n - 1) / 2) * spacing) for k in range(n)]
        elif p["kind"] == "curved":
            arc = math.radians(p.get("arc", 40))
            seats = [(fx + math.cos(a + (k - (n - 1) / 2) * arc / 2) * r, fz + math.sin(a + (k - (n - 1) / 2) * arc / 2) * r) for k in range(n)]
        else:
            seats = [(cx, cz)]
        names = [f"Seat_{p['kind'].capitalize()}_{s_}" if p["kind"] in ("stump", "boulder") else f"Seat_Log_{s_}" for s_ in p["seats"]]
        out.append({**p, "r": r, "a": a, "cx": cx, "cz": cz, "tx": tx, "tz": tz, "seats": list(zip(names, seats))})
    return out


def build_logs(L, cushions, coll):
    """The firepit's organic seating, one object: a long log behind the fire (3 seats), a medium
    log and a curved one to the sides (2 each), a stump and a smooth boulder (1 each); empties mark
    each piece (Seat_Log_Long, _Medium, _Curved, Seat_Stump_Solo, Seat_Boulder_Solo) and each seat."""
    rng = random.Random(9)
    fx, fz = L["fire"]["x"], L["fire"]["z"]
    radius = cushions["log"]["h"] / 2
    cy = cushions["log"]["y"]
    bm = bmesh.new()
    marks = []
    for p in firepit_pieces(L):
        cx, cz, tx, tz, a = p["cx"], p["cz"], p["tx"], p["tz"], p["a"]
        ox, oz = math.cos(a), math.sin(a)  # outward from the fire
        if p["kind"] == "log":
            half = p["len"] / 2
            cylinder(bm, W(cx - tx * half, cy, cz - tz * half), W(cx + tx * half, cy, cz + tz * half), radius, 18, m=0, cap_m=1, wobble=0.06, rng=rng)
            # a stubby broken branch on its outer side, between the seats
            for along, up in ((0.85, 0.05), (-0.25, 0.07)):
                stub = W(cx + tx * half * along + ox * 0.12, cy + up, cz + tz * half * along + oz * 0.12)
                cylinder(bm, stub, stub + W(ox * 0.18, 0.1, oz * 0.18) - W(0, 0, 0), 0.045, 8, m=0, cap_m=1, r_end=0.035)
            ends = [(cx - tx * (half - 0.12), cz - tz * (half - 0.12), tx, tz), (cx + tx * (half - 0.12), cz + tz * (half - 0.12), tx, tz)]
            marks.append((f"Seat_Log_{p['id']}", (cx, cushions["log"]["top"], cz)))
        elif p["kind"] == "curved":
            # a log grown bent: a chain of short round segments along the arc round the fire
            arc = math.radians(p.get("arc", 40))
            pts = [(fx + math.cos(a + (k / 10 - 0.5) * arc) * p["r"], fz + math.sin(a + (k / 10 - 0.5) * arc) * p["r"]) for k in range(11)]
            for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
                cylinder(bm, W(x0, cy, z0), W(x1, cy, z1), radius * (1 + 0.04 * rng.random()), 16, m=0, cap_m=0)
                blob(bm, x1, cy, z1, radius, radius, radius, m=0, cuts=2, n=2.0)
            # its sawn ends: a thin disc of cut wood on each
            for (ex, ez), (px, pz) in ((pts[0], pts[1]), (pts[-1], pts[-2])):
                cylinder(bm, W(ex, cy, ez), W(ex + (ex - px) * 0.08, cy, ez + (ez - pz) * 0.08), radius + 0.004, 16, m=1, cap_m=1)
            ends = []
            marks.append(("Seat_Log_Curved", (cx, cushions["log"]["top"], cz)))
        elif p["kind"] == "stump":
            top = cushions["stump"]["top"]
            cylinder(bm, W(cx, 0.0, cz), W(cx, top, cz), 0.24, 16, m=0, cap_m=1, wobble=0.05, rng=rng)
            for k in range(4):  # roots spreading into the ground
                ra = a + k * math.pi / 2 + 0.4
                cylinder(bm, W(cx + math.cos(ra) * 0.16, 0.12, cz + math.sin(ra) * 0.16), W(cx + math.cos(ra) * 0.38, -0.02, cz + math.sin(ra) * 0.38), 0.06, 8, m=0, r_end=0.025)
            ends = []
            marks.append(("Seat_Stump_Solo", (cx, top, cz)))
        else:
            # a smooth river boulder, its top worn flat to sit on (the boulder cushion's)
            top = cushions["boulder"]["top"]
            blob(bm, cx, top / 2 - 0.02, cz, 0.38, top / 2 + 0.02, 0.33, m=3, cuts=4, n=2.6, noise=0.05, rng=rng, flat_bottom=-0.05)
            ends = []
            marks.append(("Seat_Boulder_Solo", (cx, top, cz)))
        # a ring of moss round each end of a straight log
        for ex, ez, ux, uz in ends:
            cylinder(bm, W(ex - ux * 0.05, cy, ez - uz * 0.05), W(ex + ux * 0.05, cy, ez + uz * 0.05), radius + 0.012, 18, m=2)
        cushion = cushions["stump" if p["kind"] == "stump" else "boulder" if p["kind"] == "boulder" else "log"]
        for name, (sx, sz) in p["seats"]:
            marks.append((name, (sx, cushion["top"], sz)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    make_object("Seat_Firepit", bm, ["CF_Bark", "CF_WoodCut", "CF_GrassLight", "CF_StoneDark"], coll)
    for name, at in marks:
        mark = bpy.data.objects.new(name, None)
        mark.empty_display_type = "ARROWS" if name.count("_") >= 2 and name.split("_")[-1][-1].isdigit() else "PLAIN_AXES"
        mark.empty_display_size = 0.2
        mark.location = W(*at)
        coll.objects.link(mark)


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
    # posts: along the bank and along the river edge, from the bed up to just under the planks
    bank = max(river_span(L, z)[0] for z in (z0, (z0 + z1) / 2, z1))
    lanterns = [(p["x"], p["z"]) for p in L["lanterns"]]
    for px, tall in ((bank + 0.1, deck - 0.065), (x1 - 0.08, deck - 0.065)):
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
    # a bait bucket by the bank end, out of the anglers' way
    lathe(bm, x0 + 0.35, z0 + 0.35, [(0, deck), (0.12, deck), (0.15, deck + 0.22), (0, deck + 0.2)], segs=12, m=2)
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


def pine(bm, x, z, s, rng, light, yaw=None, bare=0.0, kind="pine"):
    """`bare`: that much more bare trunk under the boughs (the hammocks' pines: a hammock is slung
    under them, and whoever lies in it is seen)."""
    # (materials: 0 the bark, 1 and 2 the needles, 9 the deep needles of the low boughs; `kind`:
    # a pine, or the slimmer spruce)
    nature().conifer(bm, x, z, s, rng, 0, (1, 2, 2) if light else (9, 1, 2), kind=kind, bare=bare, yaw=yaw)


def birch(bm, x, z, s, rng, m0):
    """A birch that is not felled (the look of the ones that are: trees.glb): a slender white trunk
    with dark marks round it, two branches, a light crown of round clumps. Materials from `m0`: bark,
    mark, leaf, light leaf."""
    h = 2.7 * s
    lathe(bm, x, z, [(0, 0.0), (0.13 * s, 0.0), (0.1 * s, h * 0.6), (0.06 * s, h), (0, h + 0.02)], segs=10, m=m0, jitter=0.05, rng=rng)
    for k in range(int(7 * s) + 2):
        y = 0.2 * s + k * 0.3 * s
        if y > h * 0.8:
            break
        a = rng.random() * 6.28
        r = 0.12 * s * (1 - y / (h * 1.4))
        blob(bm, x + math.cos(a) * r * 0.85, y, z + math.sin(a) * r * 0.85, 0.06 * s, 0.018 * s, 0.05 * s, m=m0 + 1, cuts=1)
    for k in range(2):
        a = k * math.pi + 0.6 + rng.random()
        cylinder(bm, W(x, h * 0.55, z), W(x + math.cos(a) * 0.45 * s, h * 0.8, z + math.sin(a) * 0.45 * s), 0.035 * s, 6, m=m0, r_end=0.02 * s)
    # (a lopsided crown, each tree turned its own way: no two alike)
    ta = rng.random() * 6.283
    ca, sa = math.cos(ta), math.sin(ta)
    for k, (dx, y, dz, r) in enumerate(((0.12, h * 0.97, 0.05, 0.7), (0.55, h * 0.78, 0.25, 0.5), (-0.45, h * 0.86, -0.1, 0.58), (0.05, h * 0.7, -0.5, 0.42), (-0.3, h * 0.64, 0.45, 0.4), (0.1, h * 1.15, 0.0, 0.42), (0.78, h * 0.58, -0.2, 0.3))):
        blob(bm, x + (dx * ca - dz * sa) * s, y, z + (dx * sa + dz * ca) * s, r * s * rng.uniform(0.9, 1.1), r * 0.85 * s, r * s * rng.uniform(0.9, 1.1), m=m0 + 2 + (k % 2), cuts=3, noise=0.16, rng=rng)


def willow(bm, x, z, s, rng, m_bark, m_leaf):
    """A low, wide willow: a short leaning trunk, a flattened crown, and a curtain of hanging
    strands all round it (lower than a pine by half, so it hides no one)."""
    top = (x + 0.18 * s, 1.5 * s, z - 0.1 * s)
    cylinder(bm, W(x, 0.0, z), W(*top), 0.2 * s, 9, m=m_bark, r_end=0.12 * s, wobble=0.08, rng=rng)
    for k in range(3):
        a = 0.7 + k * 2.1 + rng.random() * 0.4
        cylinder(bm, W(*top), W(top[0] + math.cos(a) * 0.7 * s, 2.0 * s, top[2] + math.sin(a) * 0.7 * s), 0.07 * s, 6, m=m_bark, r_end=0.035 * s)
    for k, (dx, y, dz, r) in enumerate(((0.0, 2.25, 0.0, 0.95), (0.65, 2.05, 0.3, 0.7), (-0.6, 2.05, -0.25, 0.7), (0.2, 2.0, -0.65, 0.65), (-0.2, 2.0, 0.65, 0.65))):
        blob(bm, top[0] + dx * s, y * s, top[2] + dz * s, r * s, r * 0.55 * s, r * s, m=m_leaf + (k % 2), cuts=3, noise=0.12, rng=rng)
    n = 22
    for k in range(n):
        a = 6.283 * k / n + rng.uniform(-0.1, 0.1)
        r = rng.uniform(1.0, 1.3) * s
        sx, sz = top[0] + math.cos(a) * r, top[2] + math.sin(a) * r
        y1 = rng.uniform(1.95, 2.15) * s
        y0 = rng.uniform(0.55, 1.05) * s
        cylinder(bm, W(sx, y1, sz), W(sx + math.cos(a) * 0.08, y0, sz + math.sin(a) * 0.08), 0.1 * s, 5, m=m_leaf + (k % 2), r_end=0.02 * s)


def build_trees(L, coll):
    rng = random.Random(21)
    bm = bmesh.new()
    # (each at its own size, and turned its own way where the layout says: the west edge's stagger)
    for i, t in enumerate(L["trees"]):
        pine(bm, t["x"], t["z"], t["s"], rng, light=i % 3 == 1, yaw=t.get("yaw"), bare=t.get("bare", 0.0), kind=t.get("kind", "spruce" if i % 4 == 2 and not t.get("bare") else "pine"))
    # the understory: saplings in ones and twos at the feet of the grown pines and along the rims
    # (walked through: a sapling is a child's height), and the dead trees the layout stands
    K = nature()
    half = L["half"]
    for i, t in enumerate(L["trees"]):
        if t.get("bare") or i % 3 == 0:
            continue
        for q in range(1 + (i % 2)):
            a = rng.random() * 6.283
            d = (0.75 + 0.5 * rng.random()) * t["s"]
            x, z = t["x"] + math.cos(a) * d, t["z"] + math.sin(a) * d
            if rim_inside(x, z, half) < 0.5 or in_river(L, x, z, 0.4) or near_path(L, x, z, 0.5) or near_prop(L, x, z, 1.0):
                continue
            K.conifer(bm, x, z, rng.uniform(0.28, 0.5), rng, 0, (1, 2), kind="sapling")
    for wx, wz, wr in L["dressing"].get("wood", []):
        for _ in range(int(wr * 1.6)):
            a, d = rng.random() * 6.283, wr * math.sqrt(rng.random())
            x, z = wx + math.cos(a) * d, wz + math.sin(a) * d
            if rim_inside(x, z, half) < 0.6 or in_river(L, x, z, 0.4) or near_path(L, x, z, 0.6) or near_prop(L, x, z, 1.1) or math.hypot(x - L["fire"]["x"], z - L["fire"]["z"]) < 4.6:
                continue
            if any(math.hypot(x - t["x"], z - t["z"]) < 1.5 for t in L["fellTrees"] + L["fellBirches"]):
                continue  # (clear of where a feller stands)
            K.conifer(bm, x, z, rng.uniform(0.26, 0.48), rng, 0, (1, 2), kind="sapling")
    for x, z, h in L["dressing"].get("snags", []):
        K.snag(bm, x, z, h, rng, 10)
    # the birches that are not felled (the dressing's): with the pines, so they sway and thin as they do
    for x, z, sz in L["dressing"]["birches"]:
        birch(bm, x, z, sz, rng, 3)
    if L.get("places"):
        w = L["places"]["riverEnd"]["willow"]
        willow(bm, w["x"], w["z"], w["s"], random.Random(77), 0, 7)
    make_object("Campfire_Trees", bm, ["CF_Bark", "CF_Pine", "CF_PineLight", "CF_BirchBark", "CF_BirchMark", "CF_BirchLeaf", "CF_BirchLeafLight", "CF_Willow", "CF_WillowLight", "CF_PineDeep", "CF_Snag"], coll)
    # the bare branch the owl perches on, out through its pine's lowest boughs (its own object,
    # standing on the ground under the owl: the two never part on a slope)
    o = L["owl"]
    bm = bmesh.new()
    cylinder(bm, W(o["tree"]["x"], o["y"] - 0.1, o["tree"]["z"]), W(o["x"] + 0.12, o["y"] - 0.03, o["z"] + 0.12), 0.04, 7, m=0, r_end=0.026)
    make_object("Campfire_Perch", bm, ["CF_Bark"], coll, origin=(o["x"], o["y"], o["z"]))
    # the wooden mounting pegs a string of lights hangs from: driven into a pine's trunk, out through
    # its boughs, a knob at the tip for the wire's loop (the string's end is the tip: the peg stands
    # on the ground under it)
    for i, pg in enumerate(L.get("pegs", [])):
        tx, tz = pg["tip"]
        dx, dz = tx - pg["x"], tz - pg["z"]
        n = math.hypot(dx, dz) or 1.0
        ux, uz = dx / n, dz / n
        y = pg["y"]
        bm = bmesh.new()
        cylinder(bm, W(pg["x"] + ux * 0.04, y - 0.01, pg["z"] + uz * 0.04), W(tx, y + 0.012, tz), 0.03, 7, m=0, r_end=0.022)
        blob(bm, tx, y + 0.014, tz, 0.032, 0.03, 0.032, m=0, cuts=2)
        make_object(f"Campfire_Peg_0{i + 1}", bm, ["CF_Bark"], coll, origin=(tx, y, tz))


def build_rocks(L, coll):
    rng = random.Random(33)
    bm = bmesh.new()
    for i, r in enumerate(L["rocks"]):
        s = r["s"]
        blob(bm, r["x"], 0.12 * s, r["z"], 0.5 * s, 0.36 * s, 0.42 * s, m=i % 2, cuts=4, noise=0.1, rng=rng, flat_bottom=-0.3)
        if i % 3 == 0:  # a smaller one tucked beside it
            blob(bm, r["x"] + 0.45 * s, 0.05, r["z"] + 0.3 * s, 0.22 * s, 0.16 * s, 0.2 * s, m=(i + 1) % 2, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.2)
    # smooth river stones along the tipi-to-gallery walk: a few flat pebbles in a loose drift
    for u in L.get("undergrowth", []):
        if u["kind"] == "mossy":
            # a mossy river stone: one rounded boulder and a smaller one leaning on it (the moss on
            # their tops is in the deco, in its grass green)
            blob(bm, u["x"], 0.1, u["z"], 0.34, 0.24, 0.3, m=0, cuts=4, noise=0.08, rng=rng, flat_bottom=-0.3)
            blob(bm, u["x"] + 0.3, 0.05, u["z"] + 0.18, 0.17, 0.13, 0.15, m=1, cuts=3, noise=0.08, rng=rng, flat_bottom=-0.2)
            continue
        if u["kind"] != "stones":
            continue
        for q in range(5):
            a = rng.random() * 6.28
            rr = 0.12 + 0.3 * rng.random()
            px, pz = u["x"] + rr * math.cos(a), u["z"] + rr * math.sin(a)
            w = 0.07 + 0.07 * rng.random()
            blob(bm, px, 0.012, pz, w, 0.035, w * (0.7 + 0.3 * rng.random()), m=q % 2, cuts=3, noise=0.05, rng=rng, flat_bottom=-0.3)
    # the mossy stones along the river's banks, half in the water (their moss is in the deco)
    for k, (x, water, z, sz) in enumerate(river_mossy(L)):
        blob(bm, x, water + 0.04, z, 0.3 * sz, 0.21 * sz, 0.26 * sz, m=k % 2, cuts=4, noise=0.1, rng=rng, flat_bottom=-0.3)
        blob(bm, x + (0.26 if k % 2 else -0.26) * sz, water + 0.01, z + 0.2 * sz, 0.14 * sz, 0.1 * sz, 0.12 * sz, m=(k + 1) % 2, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.2)
    make_object("Campfire_Rocks", bm, ["CF_Stone", "CF_StoneDark"], coll)


def build_fence(L, coll):
    """The rustic fence along the front edge, from the west corner to the river's bank: every post
    and rail follows the ground under it."""
    at = L["fence"]["at"]
    xs = fence_posts(L)
    bm = bmesh.new()
    for px in xs:
        box(bm, px - 0.06, px + 0.06, -0.02, 0.72, at - 0.06, at + 0.06)
        lathe(bm, px, at, [(0, 0.72), (0.085, 0.72), (0, 0.8)], segs=4, yaw=math.pi / 4)
    for a, b in zip(xs, xs[1:]):
        for y in (0.3, 0.55):
            box(bm, a, b, y - 0.05, y + 0.05, at - 0.03, at + 0.03)
    make_object("Campfire_Fence", bm, ["CF_Fence"], coll, lift="vertex")


# the props the undergrowth keeps its distance from (a fern never pokes through a stall or a tent)
KEEP_CLEAR = ("tent", "woodpile", "workbench", "buster", "busterBoard", "barnaby", "splitblock", "van", "campChair", "critter", "owl", "guitarCase", "groundLantern", "stringPole", "signpost", "telescope", "picnic", "gallery", "archway", "fireflies")


def places_solid(L):
    """Where the places stand, as (x, z, radius): nothing grows through a blanket, a bed or a bench."""
    P = L.get("places")
    if not P:
        return []
    out = []
    for h in P["hammocks"]:
        out.append(((h["a"][0] + h["b"][0]) / 2, (h["a"][1] + h["b"][1]) / 2, 1.0))
    out += [(P[k]["x"], P[k]["z"], 0.45) for k in ("cairn",) if k in P]
    out += [(b["x"], b["z"], 1.25) for b in P["blankets"]]
    out.append((P["glade"]["x"], P["glade"]["z"], P["glade"]["r"] + 0.45))
    out.append((P["swing"]["x"], P["swing"]["z"], P["swing"]["span"] + 0.35))
    E = P["riverEnd"]
    out += [(E["rock"]["x"], E["rock"]["z"], 0.6), (E["log"]["x"], E["log"]["z"], 0.85), (E["willow"]["x"], E["willow"]["z"], 0.5)]
    return out


def near_prop(L, x, z, pad):
    if any(k in L and math.hypot(x - L[k]["x"], z - L[k]["z"]) < pad for k in KEEP_CLEAR):
        return True
    return any(math.hypot(x - px, z - pz) < pr + max(0.0, pad - 0.8) for px, pz, pr in places_solid(L))


def along_river(L, every, start=0.6):
    """Places down the river's length, north to south, `every` apart (short of the island's edge)."""
    z0, z1 = river_z(L)
    z1 = min(z1, L["half"] - 0.9)
    out = []
    z = max(z0 + start, -L["half"] + 0.9)
    while z < z1 - 0.5:
        out.append(z)
        z += every
    return out


def river_mossy(L):
    """The mossy stones along the river: each half in the water at a bank's lip (inside the river's
    own collider: never in anyone's way), clear of the dock, the anglers' spots and the crossings.
    (x, water, z, size) each."""
    out = []
    water = L["river"]["water"]
    d = L["dock"]
    spots = [(f["stand"]["x"], f["stand"]["z"]) for f in L["fishing"]] + [(f["bobber"]["x"], f["bobber"]["z"]) for f in L["fishing"]]
    rr = random.Random(606)
    zs = []
    for z in along_river(L, 0.7, 0.9):
        # (groups of stones where the noise is high, clear water between them)
        if vnoise(z * 0.42 + 3.0, 17.0) > 0.52:
            zs.append(z + rr.uniform(-0.25, 0.25))
    for k, z in enumerate(zs):
        span = river_span(L, z)
        if span is None:
            continue
        x = span[0] + rr.uniform(0.02, 0.3) if rr.random() < 0.5 else span[1] - rr.uniform(0.02, 0.3)
        if near_path(L, x, z, 0.5) or any(math.hypot(x - sx, z - sz) < 1.2 for sx, sz in spots) or (d["z0"] - 0.6 <= z <= d["z1"] + 0.6 and x < d["x1"] + 0.6):
            continue
        out.append((x, water, z, rr.choice((0.45, 0.6, 0.75, 0.75, 1.0, 1.25))))
    return out


def curved_fern(bm, x, z, s, rng, m):
    """A fern: seven fronds arching up out of the crown and drooping to their tips, each folded along
    its midrib and tapering at both ends (in the dark grass green, a double-sided material)."""
    n = 7
    a0 = rng.random() * 6.28
    for k in range(n):
        a = a0 + 2 * math.pi * k / n + rng.uniform(-0.2, 0.2)
        length = (0.34 + 0.12 * rng.random()) * s
        height = (0.2 + 0.07 * rng.random()) * s
        dx, dz = math.cos(a), math.sin(a)
        px, pz = -dz, dx
        segs = 6
        pts = []
        for i in range(segs + 1):
            u = i / segs
            y = height * (1.7 * u - 1.25 * u * u) + 0.01
            w = 0.062 * s * math.sin(math.pi * min(1.0, u * 1.04)) ** 0.6 + 0.004
            pts.append((x + dx * length * u, y, z + dz * length * u, w))
        # (the frond's midrib and edges on shared, smooth vertices; its material is double-sided)
        rows = [(bm.verts.new(W(fx, fy, fz)), bm.verts.new(W(fx + px * w, fy - w * 0.35, fz + pz * w)), bm.verts.new(W(fx - px * w, fy - w * 0.35, fz - pz * w))) for fx, fy, fz, w in pts]
        for i in range(segs):
            (m0, l0, r0), (m1, l1, r1) = rows[i], rows[i + 1]
            for quad in ((m0, l0, l1, m1), (m0, m1, r1, r0)):
                f = bm.faces.new(quad)
                f.material_index = m
                f.smooth = True


def build_deco(L, coll):
    rng = random.Random(44)
    bm = bmesh.new()
    # the undergrowth: a cluster of wild mushrooms (red caps, and brown) among every pine's roots
    # (the fellable Soft Pines' too: by their stumps once felled), clear of the paths, the river and
    # the clearing
    for n, t in enumerate(L["trees"] + [{"x": f["x"], "z": f["z"], "s": 1.0} for f in L["fellTrees"]]):
        a0 = rng.random() * 6.28
        for k in range(2 + (n % 3)):
            a = a0 + (k - 1) * 0.55 + rng.uniform(-0.15, 0.15)
            rr = (0.5 + 0.22 * rng.random()) * max(0.8, t["s"])
            x, z = t["x"] + rr * math.cos(a), t["z"] + rr * math.sin(a)
            if near_path(L, x, z, 0.1) or in_river(L, x, z, 0.3) or math.hypot(x - L["clearing"]["x"], z - L["clearing"]["z"]) < L["clearing"]["r"] + 0.2:
                continue
            s = 0.65 + 0.55 * rng.random()
            lathe(bm, x, z, [(0, 0.0), (0.035 * s, 0.0), (0.03 * s, 0.1 * s), (0, 0.11 * s)], segs=8, m=1)
            lathe(bm, x, z, [(0, 0.08 * s), (0.09 * s, 0.09 * s), (0.07 * s, 0.14 * s), (0, 0.17 * s)], segs=10, m=0 if (n + k) % 3 else 9)
    # the undergrowth the layout places: wild red-capped mushroom patches, low berry bushes, and
    # wildflower tufts along the fence by the telescope
    for u in L.get("undergrowth", []):
        ux, uz = u["x"], u["z"]
        if u["kind"] == "mossy":
            # the moss on a mossy stone's top (the stone is with the rocks)
            blob(bm, ux - 0.02, 0.29, uz - 0.02, 0.26, 0.07, 0.22, m=2, cuts=3, noise=0.12, rng=rng)
            blob(bm, ux + 0.3, 0.16, uz + 0.18, 0.12, 0.04, 0.1, m=2, cuts=2, noise=0.12, rng=rng)
        elif u["kind"] == "mushrooms":
            for k in range(4):
                a = rng.random() * 6.28
                rr = 0.08 + 0.2 * rng.random()
                x, z = ux + rr * math.cos(a), uz + rr * math.sin(a)
                s = 0.7 + 0.6 * rng.random()
                lathe(bm, x, z, [(0, 0.0), (0.035 * s, 0.0), (0.03 * s, 0.1 * s), (0, 0.11 * s)], segs=8, m=1)
                lathe(bm, x, z, [(0, 0.08 * s), (0.09 * s, 0.09 * s), (0.07 * s, 0.14 * s), (0, 0.17 * s)], segs=10, m=0)
        elif u["kind"] == "berries":
            for k in range(2):
                bx, bz = ux + 0.2 * (k - 0.5), uz + 0.08 * (k - 0.5)
                blob(bm, bx, 0.14, bz, 0.26, 0.2, 0.24, m=7, cuts=3, noise=0.08, rng=rng, flat_bottom=-0.05)
                for q in range(6):
                    a = rng.random() * 6.28
                    blob(bm, bx + math.cos(a) * 0.22, 0.14 + rng.uniform(-0.04, 0.1), bz + math.sin(a) * 0.2, 0.028, 0.028, 0.028, m=8, cuts=1)
        elif u["kind"] == "flowers":
            for k in range(5):
                a = rng.random() * 6.28
                rr = 0.05 + 0.16 * rng.random()
                x, z = ux + rr * math.cos(a), uz + rr * math.sin(a)
                h = 0.13 + 0.07 * rng.random()
                cylinder(bm, W(x, 0.0, z), W(x, h, z), 0.012, 5, m=2)
                blob(bm, x, h + 0.01, z, 0.045, 0.03, 0.045, m=3 if k % 2 else 4, cuts=2, n=2.0)
    # wildflowers round the edge of the clearing
    c = L["clearing"]
    for k in range(22):
        a = rng.random() * 6.28
        rr = c["r"] + 0.25 + rng.random() * 1.2
        x, z = c["x"] + rr * math.cos(a), c["z"] + rr * math.sin(a)
        if in_river(L, x, z, 0.4) or near_path(L, x, z, 0.15) or any(math.hypot(x - sx, z - sz) < 1.2 for p in firepit_pieces(L) for _, (sx, sz) in p["seats"]):
            continue
        cylinder(bm, W(x, 0.0, z), W(x, 0.16, z), 0.012, 5, m=2)
        blob(bm, x, 0.17, z, 0.045, 0.03, 0.045, m=3 if k % 3 else 4, cuts=2, n=2.0)
    # lily pads down the river (clear of the dock and the anglers' floats), reeds along its banks
    water = L["river"]["water"]
    d = L["dock"]
    floats = [(s["bobber"]["x"], s["bobber"]["z"]) for s in L["fishing"]]
    for k, z in enumerate(along_river(L, 1.3, 2.4)):
        t, r = (0.5, 0.35, 0.65, 0.3, 0.7, 0.45)[k % 6], (0.16, 0.2, 0.15, 0.22, 0.18, 0.14)[k % 6]
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
    clumps = [(z, (k * 7 + k // 3) % 2) for k, z in enumerate(along_river(L, 1.25, 1.2))]
    for cz, side in clumps:
        span = river_span(L, cz)
        if span is None:
            continue
        # (not across the dock, nor where an angler's float lands)
        if d["z0"] - 0.5 <= cz <= d["z1"] + 0.5 and side == 0:
            continue
        cx = span[0] + 0.22 if side == 0 else span[1] - 0.22
        for k in range(7):
            x, z = cx + 0.25 * (rng.random() - 0.5), cz + 0.3 * (rng.random() - 0.5)
            h = 0.55 + 0.35 * rng.random()
            cylinder(bm, W(x, water, z), W(x + 0.05 * (rng.random() - 0.5), water + h, z), 0.018, 5, m=2, r_end=0.008)
            if k % 3 == 0:  # a cattail
                cylinder(bm, W(x, water + h * 0.72, z), W(x, water + h * 0.9, z), 0.035, 6, m=5)
    # round bushes at the fence's corners, wild red berries tucked in their leaves
    fence = L["fence"]
    for x, z, s in ((fence["xFrom"] + 0.9, fence["at"] - 1.05, 0.9), (fence["xTo"] - 0.9, fence["at"] - 0.9, 0.8)):
        for k in range(3):
            bx, bz = x + 0.35 * (k - 1) * s, z + 0.2 * ((k % 2) - 0.5) * s
            blob(bm, bx, 0.3 * s, bz, 0.42 * s, 0.36 * s, 0.4 * s, m=7, cuts=3, noise=0.08, rng=rng, flat_bottom=-0.05)
            for q in range(5):
                a = rng.random() * 6.28
                blob(bm, bx + math.cos(a) * 0.36 * s, 0.3 * s + rng.uniform(-0.08, 0.16) * s, bz + math.sin(a) * 0.34 * s, 0.03, 0.03, 0.03, m=8, cuts=1)
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
    # the living pass: curved ferns at the pines' feet (on their outer side, away from the paths,
    # the river, the clearing and the props), and the moss on the river's stones
    fr = random.Random(77)
    c = L["clearing"]
    for n, t in enumerate(L["trees"] + [{"x": f["x"], "z": f["z"], "s": 1.0} for f in L["fellTrees"]]):
        for k in range(2):
            a = fr.random() * 6.28
            rr = (0.6 + 0.35 * fr.random()) * max(0.8, t["s"])
            x, z = t["x"] + rr * math.cos(a), t["z"] + rr * math.sin(a)
            # (only the side away from the island's middle: the approach you fell from stays open)
            if (x - t["x"]) * -t["x"] + (z - t["z"]) * -t["z"] > 0.25 * math.hypot(t["x"], t["z"]):
                continue
            if near_path(L, x, z, 0.2) or in_river(L, x, z, 0.4) or math.hypot(x - c["x"], z - c["z"]) < c["r"] + 0.5 or near_prop(L, x, z, 1.4):
                continue
            curved_fern(bm, x, z, 0.85 + 0.35 * fr.random(), fr, 2)
    for x, water, z, sz in river_mossy(L):
        blob(bm, x - 0.02, water + 0.04 + 0.19 * sz, z, 0.22 * sz, 0.055 * sz, 0.19 * sz, m=2, cuts=3, noise=0.12, rng=fr)
    make_object("Campfire_Deco", bm, ["CF_MushCap", "CF_MushStem", "CF_GrassDark", "CF_Petal", "CF_PetalYellow", "CF_Bark", "CF_WoodCut", "CF_BushLeaf", "CF_WildBerry", "CF_MushBrown"], coll)


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
    length = f["xTo"] - f["xFrom"]
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
    the line between its ends), and the swags along the front fence as one node. A string's ends
    are heights over the ground under them (LIGHT_STRINGS in campfire.ts)."""
    for i, s in enumerate(L["strings"]):
        a, b = over_ground(s["a"]), over_ground(s["b"])
        bm = bmesh.new()
        hang_string(bm, a, b, s["sag"])
        make_object(f"StringLight_0{i + 1}", bm, ["CF_Wire", "CF_Bulb"], coll, origin=a, lift=None)
    fl = L["fenceLights"]
    posts = fence_posts(L)
    at = L["fence"]["at"]
    bm = bmesh.new()
    for k in range(0, len(posts) - fl["every"], fl["every"]):
        hang_string(bm, over_ground((posts[k], fl["y"], at)), over_ground((posts[k + fl["every"]], fl["y"], at)), fl["sag"])
    make_object("StringLight_Fence", bm, ["CF_Wire", "CF_Bulb"], coll, origin=over_ground((posts[0], fl["y"], at)), lift=None)


def build_glamping(L, cushions, coll):
    """Everything that stands still, in one object: the picnic set and its cooler, the telescope,
    the camper van with its awning and chair, the light pole, the chopping stump, the dock cleat
    and the canoe's rope."""
    rng = random.Random(71)
    M = ["CF_Plank", "CF_PlankDark", "CF_Checker", "CF_VanCream", "CF_Metal", "CF_LanternGlass", "CF_Cooler", "CF_Brass", "CF_VanMint", "CF_Glass",
         "CF_Chrome", "CF_AwningStripe", "CF_Pole", "CF_Rope", "CF_Bark", "CF_WoodCut", "CF_LanternWarm"]
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
    bench = cushions["picnicBench"]
    for sz in (-1, 1):  # the benches (their tops are the picnicBench cushion's: the seats sit on them)
        box(bm, px - 0.85, px + 0.85, bench["top"] - bench["h"], bench["top"], pz + sz * 0.68 - 0.13, pz + sz * 0.68 + 0.13, m=m["CF_Plank"])
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
    cx_, cz_ = px + 1.2, pz - 0.1
    box(bm, cx_ - 0.26, cx_ + 0.26, 0.0, 0.3, cz_ - 0.17, cz_ + 0.17, m=m["CF_Cooler"])
    box(bm, cx_ - 0.27, cx_ + 0.27, 0.3, 0.36, cz_ - 0.18, cz_ + 0.18, m=m["CF_CoolerLid"])
    box(bm, cx_ - 0.12, cx_ + 0.12, 0.36, 0.39, cz_ - 0.025, cz_ + 0.025, m=m["CF_CoolerLid"])

    # --- the brass telescope on its tripod, on the knoll's top ---
    tx, tz = L["telescope"]["x"], L["telescope"]["z"]
    apex = (tx, 0.95, tz)
    for k in range(3):
        a = math.pi / 2 + 2 * math.pi * k / 3 + math.pi / 3
        cylinder(bm, W(*apex), W(tx + 0.32 * math.cos(a), 0.0, tz + 0.32 * math.sin(a)), 0.022, 6, m=m["CF_Pole"], r_end=0.016)
    blob(bm, tx, 0.96, tz, 0.05, 0.045, 0.05, m=m["CF_BrassDark"], cuts=2)
    up, fwd = math.sin(math.radians(35)), math.cos(math.radians(35))
    # (it looks up and out over the island's back, away from the fire: the eyepiece is on the side
    # you walk up to it from)
    away = math.hypot(tx - L["fire"]["x"], tz - L["fire"]["z"]) or 1.0
    ax_, az_ = (tx - L["fire"]["x"]) / away, (tz - L["fire"]["z"]) / away
    eye = W(tx - ax_ * 0.3 * fwd, 0.96 - 0.3 * up + 0.05, tz - az_ * 0.3 * fwd)
    obj = W(tx + ax_ * 0.58 * fwd, 0.96 + 0.58 * up + 0.05, tz + az_ * 0.58 * fwd)
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
    seat = cushions["campChair"]
    box(bm, chx - 0.24, chx + 0.24, seat["top"] - seat["h"], seat["top"], chz - 0.2, chz + 0.2, m=m["CF_ChairFabric"])
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

    # --- the grove: a guitar case lying open on the grass (plush lining, a few coins), and a warm
    # camping lantern on the ground beside it ---
    gc = L["guitarCase"]
    cyaw, syaw = math.cos(gc["yaw"]), math.sin(gc["yaw"])

    def case_point(u, y, v):  # the case's own axes: u along it, v across, y up
        return W(gc["x"] + (u - 0.47) * cyaw - v * syaw, y, gc["z"] + (u - 0.47) * syaw + v * cyaw)

    def half_width(u):
        bout = lambda c, r: math.sqrt(max(0.0, r * r - (u - c) ** 2))
        return max(bout(0.2, 0.2), bout(0.52, 0.155), 0.045 if 0.6 <= u <= 0.95 else 0.0)

    us = [0.001 + 0.949 * k / 28 for k in range(29)]
    outline = [(u, half_width(u) + 0.02) for u in us] + [(u, -half_width(u) - 0.02) for u in reversed(us)]
    lining = [(u, max(0.01, half_width(u) - 0.01)) for u in us[1:-1]] + [(u, -max(0.01, half_width(u) - 0.01)) for u in reversed(us[1:-1])]

    def prism(pts, y0, y1, mi, hinge=None):
        """An outline in the case's axes extruded from y0 to y1 (hinge: (v0, y0, angle) to swing it up)."""
        def place(u, y, v):
            if hinge:
                hv, hy, ang = hinge
                dv, dy = v - hv, y - hy
                v, y = hv + dv * math.cos(ang) - dy * math.sin(ang), hy + dv * math.sin(ang) + dy * math.cos(ang)
            return case_point(u, y, v)
        lo = [bm.verts.new(place(u, y0, v)) for u, v in pts]
        hi = [bm.verts.new(place(u, y1, v)) for u, v in pts]
        bm.faces.new(list(reversed(lo))).material_index = mi
        bm.faces.new(hi).material_index = mi
        for k in range(len(pts)):
            k1 = (k + 1) % len(pts)
            bm.faces.new((lo[k], lo[k1], hi[k1], hi[k])).material_index = mi

    prism(outline, 0.0, 0.1, m["CF_PlankDark"])
    prism(lining, 0.1, 0.108, m["CF_Checker"])
    # the lid, hinged along the case's back edge and swung up past upright
    back = -max(half_width(u) for u in us) - 0.02
    prism(outline, 0.1, 0.12, m["CF_PlankDark"], hinge=(back, 0.1, math.radians(105)))
    for k in range(4):
        u, v = 0.18 + 0.07 * k, 0.05 * math.sin(k * 2.1)
        cx_, cz_ = gc["x"] + (u - 0.47) * cyaw - v * syaw, gc["z"] + (u - 0.47) * syaw + v * cyaw
        lathe(bm, cx_, cz_, [(0, 0.108), (0.03, 0.108), (0.03, 0.118), (0, 0.118)], segs=10, m=m["CF_Brass"])
    gl = L["groundLantern"]
    lathe(bm, gl["x"], gl["z"], [(0, 0.0), (0.08, 0.0), (0.08, 0.04), (0, 0.04)], segs=12, m=m["CF_Metal"])
    lathe(bm, gl["x"], gl["z"], [(0, 0.04), (0.06, 0.04), (0.068, 0.12), (0.06, 0.2), (0, 0.2)], segs=12, m=m["CF_LanternWarm"])
    lathe(bm, gl["x"], gl["z"], [(0, 0.2), (0.075, 0.2), (0.035, 0.25), (0, 0.26)], segs=12, m=m["CF_Metal"])
    for sx in (-1, 1):
        cylinder(bm, W(gl["x"] + sx * 0.055, 0.22, gl["z"]), W(gl["x"] + sx * 0.03, 0.34, gl["z"]), 0.006, 4, m=m["CF_Metal"])
    cylinder(bm, W(gl["x"] - 0.03, 0.34, gl["z"]), W(gl["x"] + 0.03, 0.34, gl["z"]), 0.006, 4, m=m["CF_Metal"])

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
    # the seats, marked where each sitter goes (on the cushion's top)
    marks = [(f"Seat_Picnic_0{b * 2 + k + 1}", (px + sx * 0.42, bench["top"], pz + side * 0.68)) for b, side in enumerate((-1, 1)) for k, sx in enumerate((-1, 1))]
    marks += [("Seat_CamperChair", (chx, seat["top"], chz))]
    marks += [(f"Seat_Dock_0{i + 1}", (L["dock"]["x1"] - 0.12, cushions["dock"]["top"], f["stand"]["z"])) for i, f in enumerate(L["fishing"])]
    for name, at in marks:
        mark = bpy.data.objects.new(name, None)
        mark.empty_display_type = "ARROWS"
        mark.empty_display_size = 0.2
        mark.location = W(*at)
        coll.objects.link(mark)
    # the interactive ones, marked by name where they stand (their geometry is in the object above)
    for name, at in (("Prop_Telescope", (tx, 0.95, tz)), ("Prop_PicnicTable", (px, 0.72, pz)), ("Prop_CamperVan", (vx, 0.0, vz)), ("Prop_Fireflies", (L["fireflies"]["x"], 0.0, L["fireflies"]["z"]))):
        mark = bpy.data.objects.new(name, None)
        mark.empty_display_type = "PLAIN_AXES"
        mark.location = W(*at)
        coll.objects.link(mark)


def build_signpost(L, coll):
    """The 3-way signpost at the fork of the trails: a post, and an arrow board pointing to each
    place, lettered on the side the camera sees."""
    sp = L["signpost"]
    sx, sz = sp["x"], sp["z"]
    bm = bmesh.new()
    cylinder(bm, W(sx, 0.0, sz), W(sx, 1.22, sz), 0.045, 8, m=1)
    lathe(bm, sx, sz, [(0, 1.22), (0.06, 1.22), (0, 1.3)], segs=4, m=1, yaw=math.pi / 4)
    labels = []
    for i, arm in enumerate(sp["arms"]):
        dx, dz = arm["to"][0] - sx, arm["to"][1] - sz
        d = math.hypot(dx, dz) or 1
        ux, uz = dx / d, dz / d
        nx, nz = -uz, ux
        y, h, t, length = 1.08 - i * 0.18, 0.13, 0.03, 0.62
        shape = [(0.03, -h / 2), (length - 0.1, -h / 2), (length, 0.0), (length - 0.1, h / 2), (0.03, h / 2)]
        front = [bm.verts.new(W(sx + ux * u + nx * t / 2, y + v, sz + uz * u + nz * t / 2)) for u, v in shape]
        back = [bm.verts.new(W(sx + ux * u - nx * t / 2, y + v, sz + uz * u - nz * t / 2)) for u, v in shape]
        bm.faces.new(front).material_index = i % 2
        bm.faces.new(list(reversed(back))).material_index = i % 2
        for k in range(len(shape)):
            k1 = (k + 1) % len(shape)
            bm.faces.new((front[k], back[k], back[k1], front[k1])).material_index = i % 2
        # the lettering goes on the face toward the camera (+x +z)
        side = 1 if nx + nz >= 0 else -1
        labels.append((arm["label"], (sx + ux * (length / 2 - 0.02) + nx * side * (t / 2 + 0.004), y, sz + uz * (length / 2 - 0.02) + nz * side * (t / 2 + 0.004)), (nx * side, nz * side)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    sign = make_object("Prop_Signpost", bm, ["CF_Plank", "CF_PlankDark"], coll, origin=(sx, 0.0, sz))
    texts = []
    for text, at, (nx, nz) in labels:
        curve = bpy.data.curves.new(f"Sign_{text}", "FONT")
        curve.body = text
        curve.size = 0.075
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.extrude = 0.002
        curve.resolution_u = 2
        ob = bpy.data.objects.new(f"Sign_{text}", curve)
        coll.objects.link(ob)
        n = Vector((nx, -nz, 0)).normalized()  # the facing, in Blender's axes
        up = Vector((0, 0, 1))
        right = up.cross(n)
        rot = Matrix((right, up, n)).transposed()
        ob.matrix_world = Matrix.Translation(W(*at)) @ rot.to_4x4()
        texts.append(ob)
    bpy.context.view_layer.update()
    for ob in texts:
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
            bpy.ops.object.convert(target="MESH")
        ob.data.materials.clear()
        ob.data.materials.append(material("CF_Wire"))
    with bpy.context.temp_override(object=sign, active_object=sign, selected_objects=[sign, *texts], selected_editable_objects=[sign, *texts]):
        bpy.ops.object.join()


def build_workbench(L, coll):
    """The carpenter's workbench where split wood is carved into artisan pieces: a thick three-plank
    top on four legs with aprons, a face vise at its left end, a shelf of boards and a log below, a
    tool rack along the back (a hand saw, a mallet, two chisels), a half-carved totem, a board and
    curls of shavings on the top, sawdust at its feet and a small warm lantern so it reads at night.
    Built in its own axes (u along it, v toward the fire, y up) and turned to face the fire."""
    b = L["workbench"]
    bx, bz = b["x"], b["z"]
    d = math.hypot(L["fire"]["x"] - bx, L["fire"]["z"] - bz) or 1.0
    fx, fz = (L["fire"]["x"] - bx) / d, (L["fire"]["z"] - bz) / d  # front: toward the fire
    ax, az = fz, -fx  # along its length
    half, depth, top = b["len"] / 2, b["w"] / 2, b["top"]
    rng = random.Random(151)

    def P(u, y, v):
        return W(bx + ax * u + fx * v, y, bz + az * u + fz * v)

    def obox(u0, u1, y0, y1, v0, v1, m):
        """A box in the bench's own axes."""
        c = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        lo = [bm.verts.new(P(u, y0, v)) for u, v in c]
        hi = [bm.verts.new(P(u, y1, v)) for u, v in c]
        bm.faces.new(list(reversed(lo))).material_index = m
        bm.faces.new(hi).material_index = m
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = m

    M = ["CF_Plank", "CF_PlankDark", "CF_WoodCut", "CF_Steel", "CF_Bark", "CF_LanternWarm"]
    m = {name: i for i, name in enumerate(M)}
    bm = bmesh.new()
    # the top: three thick planks along it, each a hair off level (hand-planed)
    pw = (2 * depth - 0.02) / 3
    for k in range(3):
        v0 = -depth + k * (pw + 0.01)
        obox(-half, half, top - 0.08, top - rng.uniform(0.0, 0.006), v0, v0 + pw, m["CF_Plank"])
    # four legs, the aprons under the top, the low side rails and a shelf of two boards
    lu, lv = half - 0.12, depth - 0.09
    for su in (-1, 1):
        for sv in (-1, 1):
            obox(su * lu - 0.045, su * lu + 0.045, 0.0, top - 0.08, sv * lv - 0.045, sv * lv + 0.045, m["CF_PlankDark"])
        obox(su * lu - 0.03, su * lu + 0.03, 0.16, 0.22, -lv, lv, m["CF_PlankDark"])
    for sv in (-1, 1):
        obox(-lu, lu, top - 0.2, top - 0.08, sv * lv - 0.02, sv * lv + 0.02, m["CF_PlankDark"])
    for k in range(2):
        v0 = -lv + 0.04 + k * (lv - 0.03)
        obox(-lu, lu, 0.22, 0.25, v0, v0 + lv - 0.07, m["CF_Plank"])
    # on the shelf: two sawn boards and a log waiting its turn
    obox(-0.45, 0.1, 0.25, 0.28, -0.14, 0.02, m["CF_WoodCut"])
    obox(-0.4, 0.15, 0.28, 0.31, -0.12, 0.04, m["CF_WoodCut"])
    cylinder(bm, P(0.18, 0.33, 0.0), P(0.46, 0.33, 0.02), 0.08, 10, m=m["CF_Bark"], cap_m=m["CF_WoodCut"], wobble=0.08, rng=rng)
    # the face vise at the left end of the front: a jaw, its screw and a T-handle
    obox(-half + 0.02, -half + 0.28, top - 0.24, top - 0.01, depth, depth + 0.06, m["CF_PlankDark"])
    cylinder(bm, P(-half + 0.15, top - 0.12, depth + 0.06), P(-half + 0.15, top - 0.12, depth + 0.17), 0.018, 8, m=m["CF_Steel"])
    cylinder(bm, P(-half + 0.03, top - 0.12, depth + 0.17), P(-half + 0.27, top - 0.12, depth + 0.17), 0.014, 8, m=m["CF_PlankDark"])
    # the tool rack along the back: two posts and a rail, and the tools hanging from it
    rv = -depth + 0.03
    for su in (-1, 1):
        obox(su * (half - 0.14) - 0.028, su * (half - 0.14) + 0.028, top, top + 0.58, rv - 0.028, rv + 0.028, m["CF_PlankDark"])
    obox(-half + 0.08, half - 0.08, top + 0.47, top + 0.55, rv - 0.03, rv + 0.03, m["CF_Plank"])
    tv = rv + 0.045  # the tools hang on the rail's front face
    # a hand saw: its tapering blade and its handle
    blade = [(-0.42, top + 0.12), (-0.14, top + 0.2), (-0.14, top + 0.44), (-0.42, top + 0.44)]
    lo = [bm.verts.new(P(u, y, tv - 0.004)) for u, y in blade]
    hi = [bm.verts.new(P(u, y, tv + 0.004)) for u, y in blade]
    bm.faces.new(list(reversed(lo))).material_index = m["CF_Steel"]
    bm.faces.new(hi).material_index = m["CF_Steel"]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = m["CF_Steel"]
    obox(-0.13, -0.02, top + 0.3, top + 0.46, tv - 0.015, tv + 0.015, m["CF_PlankDark"])
    # a mallet, head down
    cylinder(bm, P(0.06, top + 0.2, tv + 0.02), P(0.06, top + 0.46, tv + 0.02), 0.014, 8, m=m["CF_PlankDark"])
    obox(-0.01, 0.13, top + 0.1, top + 0.2, tv - 0.02, tv + 0.07, m["CF_WoodCut"])
    # two chisels: steel below, handles above
    for u in (0.24, 0.32):
        cylinder(bm, P(u, top + 0.2, tv + 0.02), P(u, top + 0.32, tv + 0.02), 0.008, 6, m=m["CF_Steel"])
        cylinder(bm, P(u, top + 0.32, tv + 0.02), P(u, top + 0.45, tv + 0.02), 0.017, 8, m=m["CF_PlankDark"], r_end=0.014)
    # on the top: a half-carved chibi totem (a bulb of a head on a stubby body), a board and shavings
    tu, tvv = 0.36, 0.04
    tcx, tcz = bx + ax * tu + fx * tvv, bz + az * tu + fz * tvv
    lathe(bm, tcx, tcz, [(0, 0.0), (0.07, 0.0), (0.075, 0.05), (0.06, 0.1), (0.075, 0.13), (0.08, 0.18), (0.06, 0.225), (0, 0.24)], segs=12, m=m["CF_WoodCut"], y0=top)
    for s in (-1, 1):  # its ears, still rough
        blob(bm, tcx + ax * 0.045 * s, top + 0.235, tcz + az * 0.045 * s, 0.025, 0.03, 0.02, m=m["CF_WoodCut"], cuts=2, n=2.2)
    obox(-0.3, 0.12, top, top + 0.025, -0.02, 0.14, m["CF_WoodCut"])
    for _ in range(9):  # curls of shavings on the top
        u = rng.uniform(0.05, 0.6)
        v = rng.uniform(-0.12, depth - 0.04)
        blob(bm, bx + ax * u + fx * v, top + 0.012, bz + az * u + fz * v, 0.03, 0.012, 0.018, m=m["CF_WoodCut"], cuts=2, n=2.0, noise=0.3, rng=rng)
    # sawdust at its feet, spilling out in front
    blob(bm, bx + fx * 0.25, 0.0, bz + fz * 0.25, 0.55, 0.018, 0.3, m=m["CF_WoodCut"], cuts=3, n=2.0, noise=0.15, rng=rng, flat_bottom=0.0)
    # a small warm lantern at the right end, so the bench reads in the dark
    lx_, lz_ = bx + ax * (half - 0.16) + fx * (-0.12), bz + az * (half - 0.16) + fz * (-0.12)
    lathe(bm, lx_, lz_, [(0, 0.0), (0.05, 0.0), (0.05, 0.025), (0, 0.025)], segs=10, m=m["CF_Steel"], y0=top)
    lathe(bm, lx_, lz_, [(0, 0.025), (0.04, 0.025), (0.046, 0.08), (0.04, 0.13), (0, 0.13)], segs=10, m=m["CF_LanternWarm"], y0=top)
    lathe(bm, lx_, lz_, [(0, 0.13), (0.05, 0.13), (0.022, 0.165), (0, 0.17)], segs=10, m=m["CF_Steel"], y0=top)
    make_object("Prop_Workbench", bm, M, coll, origin=(bx, 0.0, bz))


def build_canoe(L, cushions, coll):
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
    seat = cushions["canoe"]
    for sx in (-0.45, 0.42):  # the seats (the stern one, -0.45, is Seat_Canoe: its top is the canoe cushion's)
        box(bm, cx + sx - 0.07, cx + sx + 0.07, seat["top"] - seat["h"], seat["top"], cz - 0.21, cz + 0.21, m=1)
    cylinder(bm, W(cx - 0.55, water + 0.18, cz - 0.05), W(cx + 0.5, water + 0.18, cz + 0.06), 0.015, 6, m=1)  # the paddle's shaft
    blob(bm, cx + 0.6, water + 0.18, cz + 0.07, 0.14, 0.012, 0.06, m=1, cuts=2)
    make_object("Prop_Canoe", bm, ["CF_Canoe", "CF_CanoeInner"], coll, origin=(cx, water, cz), recalc=False)
    for name, sx in (("Seat_Canoe", -0.45), ("Seat_Canoe_Bow", 0.42)):
        mark = bpy.data.objects.new(name, None)
        mark.empty_display_type = "ARROWS"
        mark.empty_display_size = 0.2
        mark.location = W(cx + sx, seat["top"], cz)
        coll.objects.link(mark)


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
    head = make_object("Fauna_Critter_Head", bm, mats, coll, origin=neck, anchor=(x, z))
    base = (x, 0.17, z - 0.16)
    bm = bmesh.new()
    for k in range(5):
        t = k / 4
        blob(bm, x, 0.19 + 0.2 * t, z - 0.2 - 0.2 * t, 0.06 - 0.008 * k, 0.06 - 0.008 * k, 0.06, m=dark if k % 2 else grey, cuts=2)
    tail = make_object("Fauna_Critter_Tail", bm, mats, coll, origin=base, anchor=(x, z))
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
    lids = make_object("Fauna_Owl_Lids", bm, mats, coll, origin=(x, y + 0.378, z + 0.1), anchor=(x, z))
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


def build_hearth(L, coll):
    """The communal Dutch oven: a tripod of three poles lashed over the fire, and the cast-iron pot
    hung from its apex on a short chain, low enough for the flames to lick its base."""
    fx, fz = L["fire"]["x"], L["fire"]["z"]
    tp = L["tripod"]
    apex = W(fx, tp["apex"], fz)
    bm = bmesh.new()
    for deg in (30, 150, 270):
        a = math.radians(deg)
        foot = W(fx + math.cos(a) * tp["legs"], 0.0, fz + math.sin(a) * tp["legs"])
        tip = apex + (apex - foot).normalized() * 0.16  # the poles cross past the lashing
        cylinder(bm, foot, tip, 0.04, 8, m=0, cap_m=1, r_end=0.03)
    # the rope lashing where they cross
    lathe(bm, fx, fz, [(0, -0.07), (0.07, -0.07), (0.075, 0.0), (0.07, 0.07), (0, 0.07)], segs=10, m=2, y0=tp["apex"])
    make_object("Prop_Tripod", bm, ["CF_Bark", "CF_WoodCut", "CF_Rope"], coll)

    # the pot, its bail and its chain: origin at the apex, so it can sway from there
    py, pr = tp["potY"], tp["potR"]
    h = 0.27
    bm = bmesh.new()
    lathe(bm, fx, fz, [(0, 0.0), (pr * 0.78, 0.0), (pr * 0.97, 0.05), (pr, 0.15), (pr * 0.98, h - 0.02), (pr * 1.05, h), (pr * 0.9, h + 0.012), (pr * 0.88, h - 0.04), (0, h - 0.04)], segs=18, m=0, y0=py)
    for sx in (-1, 1):  # the lugs the bail hooks into
        blob(bm, fx + sx * (pr + 0.02), py + h - 0.05, fz, 0.035, 0.025, 0.03, m=1, cuts=2)
    bail = [W(fx + math.cos(t) * (pr + 0.03), py + h - 0.05 + math.sin(t) * 0.26, fz) for t in (math.pi * k / 8 for k in range(9))]
    for p, q in zip(bail, bail[1:]):
        cylinder(bm, p, q, 0.009, 6, m=1)
    top = py + h - 0.05 + 0.26
    for k in range(6):  # the chain, link by link, up to the apex
        y0 = top + (tp["apex"] - top) * k / 6
        y1 = top + (tp["apex"] - top) * (k + 1) / 6
        cylinder(bm, W(fx, y0 + 0.01, fz), W(fx, y1 - 0.01, fz), 0.016 if k % 2 else 0.012, 6, m=1)
    pot = make_object("Stew_Pot", bm, ["CF_Iron", "CF_IronRim"], coll, origin=(fx, tp["apex"], fz))
    # the stew's surface inside the rim, a gentle dome (hidden while the pot is empty)
    bm = bmesh.new()
    lathe(bm, fx, fz, [(0, 0.0), (pr * 0.86, 0.0), (pr * 0.86, 0.012), (pr * 0.5, 0.03), (0, 0.035)], segs=16, m=0, y0=py + h - 0.07)
    contents = make_object("Stew_Contents", bm, ["CF_Stew"], coll, origin=(fx, py + h - 0.07, fz))
    contents.parent = pot
    contents.matrix_parent_inverse = pot.matrix_basis.inverted()


def build_picnic_plates(L, coll):
    """Four glazed ceramic plates on the picnic table (off-white, a shallow dish with a lip) and two
    ceramic mugs with an unglazed clay foot, and on each plate a skewer friends can leave there
    (one of marshmallows, one BBQ): the game shows the ones that are really on the table."""
    top = 0.726
    px, pz = L["picnic"]["x"], L["picnic"]["z"]
    spots = [(px + dx, pz + dz) for dx, dz in L["picnicPlates"]]
    bm = bmesh.new()
    for x, z in spots:
        lathe(bm, x, z, [(0, 0.0), (0.066, 0.0), (0.07, 0.006), (0.108, 0.014), (0.118, 0.024), (0.11, 0.027), (0.074, 0.013), (0, 0.013)], segs=20, m=0, y0=top)
    for mx, mz in ((px + 0.47, pz - 0.2), (px + 0.47, pz + 0.19)):
        lathe(bm, mx, mz, [(0, 0.0), (0.036, 0.0), (0.04, 0.012), (0, 0.012)], segs=14, m=1, y0=top)
        lathe(bm, mx, mz, [(0, 0.012), (0.04, 0.012), (0.046, 0.05), (0.047, 0.085), (0.04, 0.085), (0.04, 0.078), (0, 0.07)], segs=14, m=0, y0=top)
        a = W(mx - 0.045, top + 0.07, mz)
        cylinder(bm, a, W(mx - 0.075, top + 0.05, mz), 0.009, 6, m=0)
        cylinder(bm, W(mx - 0.075, top + 0.05, mz), W(mx - 0.045, top + 0.027, mz), 0.009, 6, m=0)
    make_object("Picnic_Plates", bm, ["CF_Ceramic", "CF_ClayFoot"], coll)
    for k, (x, z) in enumerate(spots):
        y = top + 0.04
        a = W(x - 0.13, y, z + 0.03)
        b = W(x + 0.13, y + 0.01, z - 0.03)
        # marshmallows, toasted golden
        bm = bmesh.new()
        cylinder(bm, a, b, 0.006, 5, m=0)
        for t in (-0.06, 0.0, 0.06):
            blob(bm, x + t, y + 0.004, z - t * 0.23, 0.028, 0.026, 0.028, m=1 if t else 2, cuts=2, n=2.6)
        make_object(f"Picnic_Skewer_0{k + 1}", bm, ["CF_Pole", "CF_MallowToast", "CF_Mallow"], coll, origin=(x, top, z))
        # a BBQ skewer: meat and peppers
        bm = bmesh.new()
        cylinder(bm, a, b, 0.006, 5, m=0)
        for j, t in enumerate((-0.075, -0.025, 0.025, 0.075)):
            blob(bm, x + t, y + 0.004, z - t * 0.23, 0.025, 0.022, 0.025, m=1 if j % 2 == 0 else 2, cuts=2, n=3.0)
        make_object(f"Picnic_Bbq_0{k + 1}", bm, ["CF_Pole", "CF_Meat", "CF_Pepper"], coll, origin=(x, top, z))


# ---------------------------------------------------------------------------------------------
# the living campfire: the branch archway into the Whispering Woods (a trailhead at the head of the
# north path, beside Buster, opening south onto the camp), the Whispering Pines Slingshot Gallery
# along the fence, and the splitting block. The firepit keeps only what nature gives it: river
# stones, raw log benches and boulders (no rug, cushions, kettle or guitar)


def polar_pt(L, angle, r):
    fx, fz = L["fire"]["x"], L["fire"]["z"]
    a = math.radians(angle)
    return fx + math.cos(a) * r, fz + math.sin(a) * r


def band(bm, cx, cz, r0, r1, y0, y1, segs=64, m=0):
    """A closed ring (a coil of the braided rug): r0..r1 round (cx, cz), domed from y0 to y1."""
    rm = (r0 + r1) / 2
    prof = [(r0, y0), (r0 + (r1 - r0) * 0.12, y1 * 0.85 + y0 * 0.15), (rm, y1), (r1 - (r1 - r0) * 0.12, y1 * 0.85 + y0 * 0.15), (r1, y0)]
    rings = []
    for r, y in prof:
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            ring.append(bm.verts.new(W(cx + r * math.cos(a), y, cz + r * math.sin(a))))
        rings.append(ring)
    for k in range(segs):
        k1 = (k + 1) % segs
        for ra, rb in zip(rings, rings[1:]):
            f = bm.faces.new((ra[k], ra[k1], rb[k1], rb[k]))
            f.material_index = m
            f.smooth = True
        f = bm.faces.new((rings[-1][k], rings[-1][k1], rings[0][k1], rings[0][k]))
        f.material_index = m


def xform_since(bm, before, matrix):
    """Every vertex of the faces made since `before`, moved by `matrix` (Blender space)."""
    verts = {v for f in faces_since(bm, before) for v in f.verts}
    for v in verts:
        v.co = matrix @ v.co


def build_living(L, coll):
    rng = random.Random(77)
    bm = bmesh.new()
    # materials: 0 rust, 1 mustard, 2 sage, 3 enamel blue, 4 iron, 5 bark, 6 cut wood, 7 plank,
    # 8 red, 9 cream, 10 pine, 11 lantern glow
    fx, fz = L["fire"]["x"], L["fire"]["z"]
    fp = L["firepit"]
    from mathutils import Matrix
    # --- the archway into the Whispering Woods: two rough posts, a bent-branch arch, a garland,
    # a lantern and a hanging board on its camp side (south, +z: toward the fire and the camera) ---
    ar = L["archway"]
    ax, az, hw, h = ar["x"], ar["z"], ar["w"] / 2, ar["h"]
    for sx in (-1, 1):
        cylinder(bm, W(ax + sx * hw, -0.05, az), W(ax + sx * hw * 0.96, h - 0.35, az), 0.12, 12, m=5, cap_m=6, r_end=0.1, wobble=0.08, rng=rng)
        blob(bm, ax + sx * hw, 0.06, az, 0.2, 0.1, 0.2, m=5, cuts=2, noise=0.15, rng=rng, flat_bottom=-0.02)
    pts = []
    for j in range(13):
        t = j / 12
        pts.append((ax + (t * 2 - 1) * hw * 0.96, h - 0.35 + math.sin(math.pi * t) * 0.42, az))
    for (x0, y0, z0), (x1, y1, z1) in zip(pts, pts[1:]):
        cylinder(bm, W(x0, y0, z0), W(x1, y1, z1), 0.085, 10, m=5)
        blob(bm, x1, y1 + 0.04, z1 + 0.02, 0.13, 0.09, 0.12, m=10, cuts=2, noise=0.25, rng=rng)
    lx, ly = ax, h + 0.07 - 0.35 + 0.42 - 0.3
    cylinder(bm, W(lx, ly + 0.28, az), W(lx, ly + 0.14, az), 0.008, 6, m=4)
    lathe(bm, lx, az, [(0, 0.0), (0.06, 0.0), (0.07, 0.1), (0.05, 0.14), (0, 0.15)], segs=10, m=11, y0=ly - 0.02)
    lathe(bm, lx, az, [(0, 0.12), (0.075, 0.12), (0.03, 0.18), (0, 0.19)], segs=10, m=4, y0=ly - 0.02)
    board_y = h - 0.75
    for sx in (-0.42, 0.42):
        cylinder(bm, W(ax + sx, board_y + 0.2, az + 0.02), W(ax + sx, h - 0.33, az + 0.02), 0.008, 6, m=6)
    box(bm, ax - 0.55, ax + 0.55, board_y - 0.14, board_y + 0.14, az + 0.01, az + 0.06, m=7)
    for j in range(3):  # three carved pines on the board, painted pine green
        tx = ax - 0.3 + j * 0.3
        blob(bm, tx, board_y + 0.01, az + 0.065, 0.06, 0.09, 0.008, m=10, cuts=2, n=1.4)
    # the trail's first steps into the trees beyond it: a few flat stones on the moss
    for j in range(2):
        blob(bm, ax + (j - 0.5) * 0.2 + rng.uniform(-0.04, 0.04), 0.02, az - 0.3 - j * 0.26, 0.15, 0.035, 0.11, m=5, cuts=2, noise=0.1, rng=rng, flat_bottom=-0.01)
    # --- the Whispering Pines Slingshot Gallery along the fence ---
    g = L["gallery"]
    gx0, gx1, gz0 = g["x"] - g["len"] / 2, g["x"] + g["len"] / 2, g["z"]
    # the counter the shooter leans on: a plank top over a striped front
    box(bm, gx0, gx1, 0.86, 0.94, gz0 - 0.2, gz0 + 0.2, m=7)
    n_boards = 10
    for j in range(n_boards):
        x0 = gx0 + (gx1 - gx0) * j / n_boards
        x1 = gx0 + (gx1 - gx0) * (j + 1) / n_boards
        box(bm, x0 + 0.004, x1 - 0.004, 0.0, 0.86, gz0 - 0.17, gz0 + 0.17, m=8 if j % 2 == 0 else 9)
    for sx in (gx0 + 0.06, gx1 - 0.06):
        box(bm, sx - 0.05, sx + 0.05, 0.0, 0.86, gz0 - 0.15, gz0 + 0.15, m=5)
    # a slingshot on the counter, and a tin of pebbles
    sx_, sz_ = g["x"] + 0.5, gz0
    cylinder(bm, W(sx_, 0.95, sz_), W(sx_ + 0.12, 0.95, sz_ + 0.02), 0.014, 6, m=5)
    for d in (-1, 1):
        cylinder(bm, W(sx_ + 0.12, 0.95, sz_ + 0.02), W(sx_ + 0.2, 0.95, sz_ + 0.02 + d * 0.05), 0.012, 6, m=5)
    lathe(bm, g["x"] - 0.6, gz0, [(0, 0.0), (0.06, 0.0), (0.06, 0.07), (0, 0.07)], segs=12, m=4, y0=0.94)
    # the three rails, rising away from the counter, each on its posts, with its targets
    kinds = ("can", "duck", "owl")
    heights = (0.5, 0.72, 0.94)
    counts = (3, 3, 2)
    for ri, (rz, ry) in enumerate(zip(g["rails"], heights)):
        for px in (gx0 + 0.1, g["x"], gx1 - 0.1):
            cylinder(bm, W(px, 0.0, rz), W(px, ry, rz), 0.035, 8, m=5)
        cylinder(bm, W(gx0, ry, rz), W(gx1, ry, rz), 0.022, 8, m=4)
        for j in range(counts[ri]):
            tx = gx0 + (gx1 - gx0) * (j + 0.5 + (0.15 if ri == 1 else 0)) / counts[ri]
            base = ry + 0.02
            if kinds[ri] == "can":
                lathe(bm, tx, rz, [(0, 0.0), (0.05, 0.0), (0.05, 0.13), (0, 0.13)], segs=12, m=9, y0=base)
                lathe(bm, tx, rz, [(0, 0.04), (0.053, 0.04), (0.053, 0.09), (0, 0.09)], segs=12, m=8, y0=base)
            elif kinds[ri] == "duck":
                blob(bm, tx, base + 0.07, rz, 0.1, 0.06, 0.04, m=1, cuts=3)
                blob(bm, tx + 0.07, base + 0.15, rz, 0.045, 0.045, 0.035, m=1, cuts=2)
                blob(bm, tx + 0.12, base + 0.14, rz, 0.03, 0.012, 0.015, m=0, cuts=2)
            else:
                blob(bm, tx, base + 0.1, rz, 0.07, 0.1, 0.05, m=5, cuts=3)
                for ex in (-0.028, 0.028):
                    blob(bm, tx + ex, base + 0.14, rz - 0.045, 0.022, 0.022, 0.008, m=1, cuts=2)
    # the backstop: hay bales along the back, a bullseye board at its middle
    bz = g["back"]
    for j in range(4):
        bx_ = gx0 + 0.45 + j * (g["len"] - 0.9) / 3
        rounded_box(bm, bx_, 0.3, bz, 0.42, 0.3, 0.26, 1, 1, 9.0, n=4.0, cuts=3)
        for dx in (-0.2, 0.2):
            box(bm, bx_ + dx - 0.015, bx_ + dx + 0.015, 0.0, 0.61, bz - 0.265, bz + 0.265, m=6)
    # the bullseye: one target sign, anchored: a plank board on two posts planted just behind the
    # bales (between them and the fence: nothing runs through the hay), standing clear above them,
    # its rings stacked toward the counter off the board's face, each 8 mm proud of the one behind
    # (no two faces share a plane: no flicker); from behind, the board hides them
    tz = bz + 0.3
    ty = 1.2
    for dx in (-0.36, 0.36):
        cylinder(bm, W(g["x"] + dx, 0.0, tz + 0.02), W(g["x"] + dx, ty + 0.4, tz + 0.02), 0.03, 8, m=5)
    box(bm, g["x"] - 0.42, g["x"] + 0.42, ty - 0.36, ty + 0.36, tz, tz + 0.04, m=7)
    for j, rr in enumerate((0.3, 0.22, 0.14, 0.06)):
        before = set(bm.faces)
        lathe(bm, 0.0, 0.0, [(0, 0.0), (rr, 0.0), (rr, 0.012), (0, 0.012)], segs=24, m=(8, 9)[j % 2])
        xform_since(bm, before, Matrix.Translation(W(g["x"], ty, tz - 0.002 - 0.008 * j)) @ Matrix.Rotation(math.radians(-90), 4, "X"))
        # (and painted on its back too, facing the camera over the fence, stepped out the same way)
        before = set(bm.faces)
        lathe(bm, 0.0, 0.0, [(0, 0.0), (rr, 0.0), (rr, 0.012), (0, 0.012)], segs=24, m=(8, 9)[j % 2])
        xform_since(bm, before, Matrix.Translation(W(g["x"], ty, tz + 0.042 + 0.008 * j)) @ Matrix.Rotation(math.radians(90), 4, "X"))
    # the gallery's sign on two posts at the counter's west end
    sgx = gx0 - 0.35
    for dz in (-0.28, 0.28):
        cylinder(bm, W(sgx, 0.0, gz0 + dz), W(sgx, 1.55, gz0 + dz), 0.035, 8, m=5)
    box(bm, sgx - 0.04, sgx + 0.02, 1.15, 1.5, gz0 - 0.36, gz0 + 0.36, m=7)
    blob(bm, sgx - 0.05, 1.33, gz0, 0.01, 0.1, 0.1, m=8, cuts=2)
    blob(bm, sgx - 0.055, 1.33, gz0, 0.01, 0.055, 0.055, m=9, cuts=2)
    blob(bm, sgx - 0.06, 1.33, gz0, 0.01, 0.025, 0.025, m=8, cuts=2)
    # --- the splitting block: a broad stump, a maul bitten into it, bundles of firewood beside ---
    sb = L["splitblock"]
    bx, bz2 = sb["x"], sb["z"]
    cylinder(bm, W(bx, 0.0, bz2), W(bx, 0.45, bz2), 0.32, 16, m=5, cap_m=6, wobble=0.05, rng=rng)
    cylinder(bm, W(bx + 0.05, 0.47, bz2), W(bx + 0.34, 0.86, bz2 + 0.06), 0.022, 8, m=7)
    box(bm, bx - 0.06, bx + 0.1, 0.42, 0.52, bz2 - 0.03, bz2 + 0.03, m=4)
    for j in range(2):
        cx_, cz_ = bx + 0.62, bz2 - 0.25 + j * 0.46
        for q in range(5):
            a = q * 2 * math.pi / 5
            ox, oy = math.cos(a) * 0.06, 0.1 + math.sin(a) * 0.06
            cylinder(bm, W(cx_ + ox, oy, cz_ - 0.2), W(cx_ + ox, oy, cz_ + 0.2), 0.045, 6, m=6 if q % 2 else 5, cap_m=6)
    for j in range(9):
        a = rng.random() * 6.28
        d = 0.4 + rng.random() * 0.35
        box(bm, bx + math.cos(a) * d - 0.04, bx + math.cos(a) * d + 0.04, LAYER_CLEARING, LAYER_CLEARING + 0.02, bz2 + math.sin(a) * d - 0.02, bz2 + math.sin(a) * d + 0.02, m=6)
    make_object("Camp_Living", bm, ["CF_RugRust", "CF_RugMustard", "CF_RugSage", "CF_EnamelRim", "CF_Metal", "CF_Bark", "CF_WoodCut", "CF_Plank", "CF_Checker", "CF_Cloth", "CF_Pine", "CF_LanternWarm"], coll)


def build(root):
    global LAYOUT, TERRAIN
    purge()
    L = read_layout(root)
    LAYOUT, TERRAIN = L, read_terrain(root)
    if TERRAIN["half"] != L["half"]:
        raise RuntimeError("campfire_terrain.json is stale: run `npm run campfire-terrain`")
    cushions = read_cushions(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    global SHADE
    SHADE = make_shade(L)
    build_ground(L, coll)
    build_water(L, coll)
    build_bonfire(L, coll)
    build_logs(L, cushions, coll)
    build_dock(L, coll)
    build_tent(L, cushions, coll)
    build_trees(L, coll)
    build_rocks(L, coll)
    build_fence(L, coll)
    build_deco(L, coll)
    build_glamping(L, cushions, coll)
    build_workbench(L, coll)
    build_signpost(L, coll)
    build_canoe(L, cushions, coll)
    build_lights(L, coll)
    build_fauna(L, coll)
    build_forage(L, coll)
    build_hearth(L, coll)
    build_picnic_plates(L, coll)
    build_living(L, coll)
    build_dressing(L, coll)
    build_places(L, cushions, coll)
    build_butterfly(coll)
    for ob in coll.all_objects:
        if ob.modifiers:
            bake_modifiers(ob)
    # the marks (seats, spots) stand on the ground too
    for ob in coll.all_objects:
        if ob.data is None and ob.parent is None:
            ob.location.z += lift_at(ob.location.x, -ob.location.y)
    return coll, L, cushions


def build_dressing(L, coll):
    """The dressing pass (docs/campfire-design.md step 4), zone by zone. What you walk round is in
    the layout (`dressing`, with its colliders in campfire.ts): lantern posts along the trails,
    Buster's crates, barrels, fallen logs, stumps. The rest is walked through or out of reach, and
    placed here by rule: grass tufts and wildflower drifts over the open moss, pebbles along the
    trails' edges, log steps up the knoll's trail and stone steps up to the terrace, golden leaves
    under the birches, stones round the plunge pool and at the river's mouth, stepping stones in the
    pond, and the far bank's bushes, boulders and ferns."""
    rng = random.Random(909)
    half = L["half"]
    D = L["dressing"]
    M = ["CF_GrassTuft", "CF_GrassDark", "CF_Petal", "CF_PetalYellow", "CF_PetalBlue", "CF_PetalWhite", "CF_Stone", "CF_StoneDark", "CF_Bark", "CF_WoodCut",
         "CF_Plank", "CF_PlankDark", "CF_Metal", "CF_LanternGlass", "CF_Crate", "CF_CrateDark", "CF_Barrel", "CF_Leaf", "CF_BushLeaf", "CF_WildBerry", "CF_Rope", "CF_Lichen", "CF_Juniper"]
    m = {name: i for i, name in enumerate(M)}
    bm = bmesh.new()
    dirt = dirt_field(L)
    c = L["clearing"]
    solid = [(p["x"], p["z"], 0.5) for p in D["lanternPosts"] + D["barrels"] + D["stumps"]] + [(p["x"], p["z"], 0.8) for p in D["crates"]] + [(f["x"], f["z"], f["len"] / 2 + 0.3) for f in D["fallen"]]
    solid += [(t["x"], t["z"], 0.45) for t in L["trees"] + L["fellTrees"] + L["fellBirches"]] + [(r_["x"], r_["z"], 0.5 * r_["s"] + 0.15) for r_ in L["rocks"]]
    solid += [(x, z, 0.5 * sz + 0.2) for x, z, sz in D["birches"] + D["shrubs"]]

    def open_moss(x, z, pad=0.0):
        """Open grass at (x, z): on the island, off the dirt, out of the river, clear of what stands."""
        if rim_inside(x, z, half) < 0.7 or in_river(L, x, z, 0.35 + pad) or dirt(x, z) > 0.45:
            return False
        if near_prop(L, x, z, 1.0 + pad) or any(math.hypot(x - sx, z - sz) < sr + pad for sx, sz, sr in solid):
            return False
        d = L["dock"]
        return not (d["x0"] - 0.4 <= x <= d["x1"] + 0.2 and d["z0"] - 0.3 <= z <= d["z1"] + 0.3)

    def tuft(x, z, s):
        """A tuft of grass: a few blades leaning out from one root (double-sided)."""
        a0 = rng.random() * 6.28
        for k in range(5):
            a = a0 + 6.28 * k / 5 + rng.uniform(-0.4, 0.4)
            lean = rng.uniform(0.04, 0.13) * s
            h = rng.uniform(0.15, 0.3) * s
            w = 0.028 * s
            px, pz = -math.sin(a), math.cos(a)
            bx, bz = x + math.cos(a) * 0.02, z + math.sin(a) * 0.02
            f = bm.faces.new((bm.verts.new(W(bx + px * w, 0.0, bz + pz * w)), bm.verts.new(W(bx - px * w, 0.0, bz - pz * w)), bm.verts.new(W(bx + math.cos(a) * lean, h, bz + math.sin(a) * lean))))
            f.material_index = m["CF_GrassDark"] if k == 0 else m["CF_GrassTuft"]

    def flower(x, z, tone):
        h = 0.12 + 0.09 * rng.random()
        cylinder(bm, W(x, 0.0, z), W(x, h, z), 0.011, 3, m=m["CF_GrassDark"])
        nub(x, h - 0.012, z, 0.045, 0.05, m[tone])

    def nub(x, y, z, r, h, mat):
        """A small rounded thing (a flower's head, a pebble) in a handful of triangles."""
        lathe(bm, x, z, [(0, y), (r, y + h * 0.15), (r * 0.72, y + h * 0.8), (0, y + h)], segs=6, m=mat, yaw=rng.random())

    # --- the open moss: grass in loose clumps (thicker where the noise says), everywhere it is open
    placed = 0
    tries = 0
    while placed < 340 and tries < 6000:
        tries += 1
        x, z = rng.uniform(-half + 1, half - 1), rng.uniform(-half + 1, half - 1)
        if vnoise(x * 0.55 + 20.0, z * 0.55 - 7.0) < 0.42 or not open_moss(x, z):
            continue
        for _ in range(rng.randint(1, 3)):
            tuft(x + rng.uniform(-0.3, 0.3), z + rng.uniform(-0.3, 0.3), rng.uniform(0.8, 1.25))
        placed += 1
    # --- wildflower drifts: the South Meadow in pink, yellow and white, the knoll in blue and white
    drifts = [(-3.0, 9.2, 1.5, ("CF_Petal", "CF_PetalYellow", "CF_PetalWhite")), (4.6, 11.0, 1.6, ("CF_PetalYellow", "CF_PetalWhite")), (-1.2, 12.2, 1.2, ("CF_Petal", "CF_PetalWhite")),
              (8.0, 12.2, 1.3, ("CF_Petal", "CF_PetalYellow")), (-12.2, 6.2, 1.3, ("CF_PetalWhite", "CF_PetalYellow")), (-8.6, -6.6, 1.4, ("CF_PetalBlue", "CF_PetalWhite")),
              (-11.9, -8.2, 1.2, ("CF_PetalBlue", "CF_PetalWhite")), (-6.4, -9.4, 1.2, ("CF_PetalBlue", "CF_Petal")), (6.2, -7.0, 1.3, ("CF_PetalYellow", "CF_PetalWhite")),
              (5.4, 2.9, 1.0, ("CF_Petal", "CF_PetalBlue")), (-6.6, 6.0, 1.2, ("CF_Petal", "CF_PetalBlue"))]
    drifts += [(x, z, r * 0.8, ("CF_PetalWhite", "CF_PetalYellow", "CF_Petal", "CF_PetalBlue")) for x, z, r in D["meadows"]]
    for cx, cz, r, tones in drifts:
        for _ in range(16):
            a, rr = rng.random() * 6.28, r * math.sqrt(rng.random())
            x, z = cx + rr * math.cos(a), cz + rr * math.sin(a)
            if open_moss(x, z):
                flower(x, z, rng.choice(tones))
    # --- the trails: pebbles in the grass along their edges
    for path in L["paths"]:
        pts = path_polyline(path, 0.55)
        for k, ((ax, az, aw), (bx, bz, _)) in enumerate(zip(pts, pts[1:])):
            d = math.hypot(bx - ax, bz - az) or 1.0
            nx, nz = -(bz - az) / d, (bx - ax) / d
            side = 1 if (k * 7) % 3 else -1
            if rng.random() < 0.55:
                off = aw / 2 + rng.uniform(0.12, 0.3)
                x, z = ax + nx * off * side, az + nz * off * side
                if math.hypot(x - c["x"], z - c["z"]) > c["r"] + 0.3 and not in_river(L, x, z, 0.3) and not near_prop(L, x, z, 0.8):
                    w = rng.uniform(0.05, 0.1)
                    nub(x, -0.01, z, w, 0.05, m["CF_Stone"] if k % 2 else m["CF_StoneDark"])
    # --- golden leaves under the birches
    for b in L["fellBirches"]:
        for _ in range(14):
            a, rr = rng.random() * 6.28, 0.25 + 1.1 * math.sqrt(rng.random())
            x, z = b["x"] + rr * math.cos(a), b["z"] + rr * math.sin(a)
            if rim_inside(x, z, half) < 0.6:
                continue
            t, s = rng.random() * 6.28, rng.uniform(0.035, 0.06)
            f = bm.faces.new([bm.verts.new(W(x + s * math.cos(t + q), 0.014, z + s * math.sin(t + q) * 0.62)) for q in (0.0, 2.1, 4.2)])
            f.material_index = m["CF_Leaf"]
    # --- the river: stones round the plunge pool's rim, at its mouth on the island's edge, and
    # stepping stones across the pond below the dock (in the water: none of these is lifted)
    water = L["river"]["water"]
    for z in (half - 0.45, half - 1.2):
        span = river_span(L, z)
        for side, s in ((0, 0.95), (1, 0.8)):
            x = span[0] + 0.12 if side == 0 else span[1] - 0.12
            blob(bm, x, water + 0.06, z, 0.26 * s, 0.2 * s, 0.22 * s, m=m["CF_StoneDark"] if side else m["CF_Stone"], cuts=3, noise=0.1, rng=rng, flat_bottom=-0.3)
    d = L["dock"]
    zs = d["z1"] + 2.4
    span = river_span(L, zs)
    for k in range(5):
        u = (k + 0.5) / 5
        x = span[0] + (span[1] - span[0]) * u
        blob(bm, x, water + 0.012, zs + 0.25 * math.sin(k * 1.7), 0.2 + 0.05 * (k % 2), 0.05, 0.17, m=m["CF_Stone"] if k % 2 else m["CF_StoneDark"], cuts=3, noise=0.07, rng=rng, flat_bottom=-0.25)
    # --- the far bank (no one walks it): bushes with berries, boulders, ferns and flowers down its length
    z = max(river_z(L)[0] + 2.0, -half + 1.2)
    k = 0
    while z < half - 1.0:
        span = river_span(L, z)
        room = (half - 0.7) - (span[1] + 0.45)
        if room > 0.25:
            x = span[1] + 0.45 + room * rng.random()
            kind = k % 4
            if kind == 0:
                s = rng.uniform(0.6, 0.9)
                for q in range(2):
                    bx, bz = x + 0.28 * (q - 0.5) * s, z + 0.16 * (q - 0.5)
                    blob(bm, bx, 0.24 * s, bz, 0.4 * s, 0.32 * s, 0.36 * s, m=m["CF_BushLeaf"], cuts=3, noise=0.08, rng=rng, flat_bottom=-0.05)
                    for _ in range(4):
                        a = rng.random() * 6.28
                        blob(bm, bx + math.cos(a) * 0.34 * s, 0.26 * s + rng.uniform(-0.06, 0.12) * s, bz + math.sin(a) * 0.3 * s, 0.028, 0.028, 0.028, m=m["CF_WildBerry"], cuts=1)
            elif kind == 1:
                s = rng.uniform(0.5, 0.85)
                blob(bm, x, 0.12 * s, z, 0.5 * s, 0.34 * s, 0.42 * s, m=m["CF_Stone"], cuts=4, noise=0.1, rng=rng, flat_bottom=-0.3)
                blob(bm, x - 0.02, 0.4 * s, z, 0.3 * s, 0.06, 0.26 * s, m=m["CF_Lichen"], cuts=2, noise=0.12, rng=rng)
            elif kind == 2:
                curved_fern(bm, x, z, rng.uniform(0.9, 1.3), rng, m["CF_GrassDark"])
                tuft(x + 0.3, z + 0.2, 1.2)
            else:
                for _ in range(6):
                    flower(x + rng.uniform(-0.3, 0.3), z + rng.uniform(-0.4, 0.4), rng.choice(("CF_PetalYellow", "CF_PetalWhite", "CF_Petal")))
        z += rng.uniform(1.0, 1.5)
        k += 1
    # --- the wood's floor: ferns in drifts between its trees (walked through)
    for wx, wz, wr in D.get("wood", []):
        for _ in range(int(wr * wr * 2.6)):
            a, d = rng.random() * 6.283, wr * math.sqrt(rng.random())
            x, z = wx + math.cos(a) * d, wz + math.sin(a) * d
            if vnoise(x * 0.9 + 4.0, z * 0.9) < 0.45 or not open_moss(x, z) or math.hypot(x - c["x"], z - c["z"]) < c["r"] * 0.85:
                continue
            curved_fern(bm, x, z, rng.uniform(0.8, 1.35), rng, m["CF_GrassDark"])
    # --- the waist-high shrubs: junipers and leafy bushes, three lumps each, a few with berries
    for k, (x, z, sz) in enumerate(D["shrubs"]):
        leaf = m["CF_Juniper"] if k % 2 else m["CF_BushLeaf"]
        for q, (dx, dz, f) in enumerate(((0.0, 0.0, 1.0), (0.3, 0.14, 0.72), (-0.26, 0.18, 0.66))):
            blob(bm, x + dx * sz, 0.34 * sz * f, z + dz * sz, 0.44 * sz * f, 0.4 * sz * f, 0.42 * sz * f, m=leaf, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.05)
        if k % 3 == 0:
            for _ in range(6):
                a = rng.random() * 6.28
                nub(x + math.cos(a) * 0.38 * sz, 0.3 * sz + rng.uniform(-0.05, 0.2) * sz, z + math.sin(a) * 0.36 * sz, 0.03, 0.05, m["CF_WildBerry"])
    # --- what you walk round: the lantern posts (an iron lantern on a bracket, its glass glowing)
    for p in D["lanternPosts"]:
        x, z = p["x"], p["z"]
        cylinder(bm, W(x, -0.05, z), W(x, 1.5, z), 0.05, 8, m=m["CF_PlankDark"])
        blob(bm, x, 0.03, z, 0.13, 0.06, 0.13, m=m["CF_StoneDark"], cuts=2, noise=0.08, rng=rng, flat_bottom=-0.1)
        cylinder(bm, W(x, 1.42, z), W(x + 0.24, 1.42, z + 0.24), 0.022, 6, m=m["CF_PlankDark"])
        lx, lz = x + 0.24, z + 0.24
        cylinder(bm, W(lx, 1.42, lz), W(lx, 1.33, lz), 0.006, 4, m=m["CF_Metal"])
        box(bm, lx - 0.075, lx + 0.075, 1.31, 1.33, lz - 0.075, lz + 0.075, m=m["CF_Metal"])
        box(bm, lx - 0.075, lx + 0.075, 1.1, 1.12, lz - 0.075, lz + 0.075, m=m["CF_Metal"])
        for sx in (-1, 1):
            for sz in (-1, 1):
                box(bm, lx + sx * 0.066 - 0.009, lx + sx * 0.066 + 0.009, 1.12, 1.31, lz + sz * 0.066 - 0.009, lz + sz * 0.066 + 0.009, m=m["CF_Metal"])
        box(bm, lx - 0.055, lx + 0.055, 1.125, 1.305, lz - 0.055, lz + 0.055, m=m["CF_LanternGlass"])
    # Buster's crates: two side by side and one on top, slatted; a coil of rope on it
    for p in D["crates"]:
        x, z, yaw = p["x"], p["z"], p["yaw"]
        cy, sy = math.cos(yaw), math.sin(yaw)
        for dx, y0, s in ((-0.2, 0.0, 0.36), (0.2, 0.0, 0.34), (0.02, 0.36, 0.3)):
            before = len(bm.verts)
            cx_, cz_ = x + dx * cy, z - dx * sy
            box(bm, cx_ - s / 2, cx_ + s / 2, y0, y0 + s, cz_ - s / 2, cz_ + s / 2, m=m["CF_Crate"])
            for band in (0.08, 0.5, 0.92):
                box(bm, cx_ - s / 2 - 0.012, cx_ + s / 2 + 0.012, y0 + s * band - 0.022, y0 + s * band + 0.022, cz_ - s / 2 - 0.012, cz_ + s / 2 + 0.012, m=m["CF_CrateDark"])
        lathe(bm, x + 0.02 * cy, z - 0.02 * sy, [(0.05, 0.66), (0.13, 0.66), (0.13, 0.7), (0.05, 0.7)], segs=12, m=m["CF_Rope"])
    # the barrels: staves and two iron hoops
    for p in D["barrels"]:
        lathe(bm, p["x"], p["z"], [(0, 0.0), (0.2, 0.0), (0.25, 0.2), (0.26, 0.34), (0.25, 0.48), (0.2, 0.68), (0, 0.68)], segs=14, m=m["CF_Barrel"])
        for y in (0.17, 0.51):
            lathe(bm, p["x"], p["z"], [(0.24, y - 0.02), (0.262, y - 0.02), (0.262, y + 0.02), (0.24, y + 0.02)], segs=14, m=m["CF_Metal"])
    # the fallen logs: mossy, a broken branch stub, mushrooms at one end
    for f in D["fallen"]:
        dx, dz = math.sin(f["yaw"]) * f["len"] / 2, math.cos(f["yaw"]) * f["len"] / 2
        cylinder(bm, W(f["x"] - dx, 0.17, f["z"] - dz), W(f["x"] + dx, 0.15, f["z"] + dz), 0.18, 10, m=m["CF_Bark"], cap_m=m["CF_WoodCut"], r_end=0.15, wobble=0.07, rng=rng)
        blob(bm, f["x"] - dx * 0.2, 0.33, f["z"] - dz * 0.2, 0.3, 0.05, 0.14, m=m["CF_Lichen"], cuts=2, noise=0.12, rng=rng)
        cylinder(bm, W(f["x"] + dx * 0.3, 0.25, f["z"] + dz * 0.3), W(f["x"] + dx * 0.3 + dz * 0.25, 0.45, f["z"] + dz * 0.3 - dx * 0.25), 0.04, 6, m=m["CF_Bark"], r_end=0.025)
    # the stumps: a wide cut top, roots flaring into the moss
    for p in D["stumps"]:
        lathe(bm, p["x"], p["z"], [(0, 0.0), (0.3, 0.0), (0.22, 0.08), (0.2, 0.3), (0, 0.3)], segs=10, m=m["CF_Bark"], jitter=0.08, rng=rng)
        lathe(bm, p["x"], p["z"], [(0, 0.3), (0.19, 0.3), (0, 0.312)], segs=10, m=m["CF_WoodCut"])
    for f in bm.faces:
        f.normal_update()
    make_object("Campfire_Dressing", bm, M, coll, recalc=True)



def build_butterfly(coll):
    """Fauna_CampFly_*: the templates the game draws its butterflies from (their own names: the studio's
    master file holds the woods' Fauna_Butterfly_* too, and Blender would rename a second set), instanced (the woods'
    own shape: build_forest.py): a slim dark body and two broad pale wings, each wing's node origin
    its hinge. At the world's origin, hidden by the game."""
    bm = bmesh.new()
    blob(bm, 0.0, 0.0, 0.0, 0.01, 0.01, 0.04, m=0, cuts=2)
    cylinder(bm, W(0.004, 0.005, 0.035), W(0.02, 0.02, 0.06), 0.002, 4, m=0)
    cylinder(bm, W(-0.004, 0.005, 0.035), W(-0.02, 0.02, 0.06), 0.002, 4, m=0)
    make_object("Fauna_CampFly_Body", bm, ["CF_FlyBody"], coll, origin=(0.0, 0.0, 0.0), lift=None)
    for sx, name in ((1, "Fauna_CampFly_WingL"), (-1, "Fauna_CampFly_WingR")):
        bm = bmesh.new()
        blob(bm, sx * 0.04, 0.0, 0.012, 0.035, 0.004, 0.03, m=0, cuts=2)
        blob(bm, sx * 0.03, 0.0, -0.022, 0.024, 0.004, 0.02, m=1, cuts=2)
        blob(bm, sx * 0.05, 0.001, 0.018, 0.008, 0.004, 0.008, m=2, cuts=1)
        make_object(name, bm, ["CF_FlyWing", "CF_FlyWingLow", "CF_FlyBody"], coll, origin=(sx * 0.008, 0.0, 0.0), lift=None)


def build_places(L, cushions, coll):
    """The places to stop on the open ground (docs/maps-fill-plan.md part 2; the layout's `places`,
    their seats and colliders in campfire.ts): the Hammock Grove (two hammocks between the meadow's
    pines, a paper lantern on a line), the Stargazers' Slope (two
    picnic blankets laid to the slope, a basket, a thermos), the Music Glade (a log and
    three stumps round a cold stone ring), the Swing Garden (the bench swing: its frame still, its
    bench the node `Prop_Swing`, hung from the beam the game turns it about) and the River's End (a flat rock, a driftwood log, cattails)."""
    P = L.get("places")
    if not P:
        return
    rng = random.Random(4242)
    M = ["CF_Bark", "CF_WoodCut", "CF_Plank", "CF_PlankDark", "CF_Stone", "CF_StoneDark", "CF_Rope", "CF_Soil", "CF_Ash", "CF_Barrel", "CF_Metal", "CF_Basket", "CF_Straw", "CF_Checker",
         "CF_VanCream", "CF_Cooler", "CF_Steel", "CF_BushLeaf", "CF_GrassDark", "CF_Petal", "CF_PetalYellow", "CF_PetalWhite", "CF_PetalBlue", "CF_Lupine", "CF_Driftwood", "CF_Cattail",
         "CF_MallardBody", "CF_Lichen", "CF_Hammock", "CF_HammockStripe", "CF_BlanketBlue", "CF_LanternWarm", "CF_Fence"]
    m = {name: i for i, name in enumerate(M)}

    def stem_flower(bm, x, z, h, tone, y0=0.0):
        cylinder(bm, W(x, y0, z), W(x, y0 + h, z), 0.011, 3, m=m["CF_GrassDark"])
        lathe(bm, x, z, [(0, y0 + h - 0.012), (0.045, y0 + h - 0.004), (0.032, y0 + h + 0.03), (0, y0 + h + 0.04)], segs=6, m=m[tone], yaw=rng.random())

    bm = bmesh.new()
    # --- the Hammock Grove: lupines along the bank beside it
    R = {"z": P["hammockLantern"]["z"] + 0.8}
    for k in range(9):
        z = R["z"] - 2.4 + k * 0.62 + rng.uniform(-0.15, 0.15)
        span = river_span(L, z)
        if not span:
            continue
        x = span[0] - rng.uniform(0.3, 0.55)
        for q in range(3):
            lx, lz = x + rng.uniform(-0.14, 0.14), z + rng.uniform(-0.14, 0.14)
            h = rng.uniform(0.32, 0.55)
            cylinder(bm, W(lx, 0.0, lz), W(lx, h * 0.5, lz), 0.012, 3, m=m["CF_GrassDark"])
            lathe(bm, lx, lz, [(0, h * 0.45), (0.045, h * 0.5), (0.032, h * 0.8), (0, h)], segs=6, m=m["CF_Lupine"] if (k + q) % 3 else m["CF_Petal"], yaw=rng.random())
    # --- the Stargazers' Slope: a basket and a thermos by the blankets, the cairn where the trail turns
    for i, b in enumerate(P["blankets"]):
        n = math.hypot(*b["up"])
        ux, uz = b["up"][0] / n, b["up"][1] / n
        sx, sz = -uz, ux
        side = -1 if i == 0 else 1
        px, pz = b["x"] + sx * side * 0.98 + ux * 0.2, b["z"] + sz * side * 0.98 + uz * 0.2
        if i == 0:
            lathe(bm, px, pz, [(0, 0.0), (0.15, 0.0), (0.19, 0.18), (0.185, 0.22), (0, 0.22)], segs=12, m=m["CF_Basket"])
            lathe(bm, px, pz, [(0, 0.22), (0.17, 0.22), (0.1, 0.27), (0, 0.27)], segs=10, m=m["CF_Checker"])
        else:
            cylinder(bm, W(px, 0.0, pz), W(px, 0.24, pz), 0.05, 10, m=m["CF_Cooler"])
            cylinder(bm, W(px, 0.24, pz), W(px, 0.3, pz), 0.04, 10, m=m["CF_VanCream"])
            lathe(bm, px + 0.2 * ux, pz + 0.2 * uz, [(0, 0.0), (0.045, 0.0), (0.05, 0.08), (0, 0.08)], segs=8, m=m["CF_VanCream"])
    if "cairn" in P:
        C = P["cairn"]
        y = 0.0
        for k, (r, h) in enumerate(((0.26, 0.15), (0.2, 0.13), (0.15, 0.11), (0.1, 0.1), (0.065, 0.08))):
            blob(bm, C["x"] + rng.uniform(-0.03, 0.03), y + h / 2, C["z"] + rng.uniform(-0.03, 0.03), r, h / 2 + 0.01, r * 0.9, m=m["CF_Stone"] if k % 2 else m["CF_StoneDark"], cuts=2, noise=0.1, rng=rng)
            y += h * 0.86
    # --- the Music Glade: the log (its top the log cushion's), three stumps (the stump cushion's), a cold stone ring
    G = P["glade"]
    log_top, stump_top = cushions["log"]["top"], cushions["stump"]["top"]
    a = math.radians(G["log"]["angle"])
    cx, cz = G["x"] + math.cos(a) * G["r"], G["z"] + math.sin(a) * G["r"]
    ax, az = -math.sin(a), math.cos(a)
    hl = G["log"]["len"] / 2
    cylinder(bm, W(cx - ax * hl, log_top / 2, cz - az * hl), W(cx + ax * hl, log_top / 2, cz + az * hl), log_top / 2, 12, m=m["CF_Bark"], cap_m=m["CF_WoodCut"], wobble=0.05, rng=rng)
    blob(bm, cx + ax * 0.45, log_top - 0.01, cz + az * 0.45, 0.22, 0.03, 0.12, m=m["CF_Lichen"], cuts=2, noise=0.12, rng=rng)
    for deg in G["stumps"]:
        b_ = math.radians(deg)
        x, z = G["x"] + math.cos(b_) * G["r"], G["z"] + math.sin(b_) * G["r"]
        lathe(bm, x, z, [(0, 0.0), (0.3, 0.0), (0.23, 0.08), (0.21, stump_top), (0, stump_top)], segs=10, m=m["CF_Bark"], jitter=0.08, rng=rng)
        lathe(bm, x, z, [(0, stump_top), (0.2, stump_top), (0, stump_top + 0.012)], segs=10, m=m["CF_WoodCut"])
    lathe(bm, G["x"], G["z"], [(0, 0.0), (0.27, 0.0), (0.2, 0.03), (0, 0.035)], segs=12, m=m["CF_Ash"])
    for k in range(9):
        b_ = 6.283 * k / 9 + rng.uniform(-0.1, 0.1)
        blob(bm, G["x"] + math.cos(b_) * 0.32, 0.04, G["z"] + math.sin(b_) * 0.32, rng.uniform(0.08, 0.11), 0.07, rng.uniform(0.07, 0.1), m=m["CF_Stone"] if k % 2 else m["CF_StoneDark"], cuts=2, noise=0.1, rng=rng, flat_bottom=-0.05)
    for k in range(2):
        cylinder(bm, W(G["x"] - 0.14, 0.05, G["z"] - 0.1 + k * 0.16), W(G["x"] + 0.15, 0.07, G["z"] + 0.04 - k * 0.12), 0.035, 6, m=m["CF_StoneDark"], cap_m=m["CF_Ash"])
    # --- the River's End: the flat rock (the boulder cushion's top), the driftwood log (the log's), cattails
    E = P["riverEnd"]
    b_top = cushions["boulder"]["top"]
    blob(bm, E["rock"]["x"], b_top / 2 - 0.02, E["rock"]["z"], 0.46, b_top / 2 + 0.02, 0.4, m=m["CF_Stone"], cuts=4, n=3.2, noise=0.05, rng=rng, flat_bottom=-0.08)
    blob(bm, E["rock"]["x"] - 0.34, 0.08, E["rock"]["z"] + 0.34, 0.16, 0.11, 0.14, m=m["CF_StoneDark"], cuts=2, noise=0.1, rng=rng, flat_bottom=-0.05)
    hl = E["log"]["len"] / 2
    cylinder(bm, W(E["log"]["x"], log_top / 2, E["log"]["z"] - hl), W(E["log"]["x"] + 0.05, log_top / 2, E["log"]["z"] + hl), log_top / 2, 11, m=m["CF_Driftwood"], cap_m=m["CF_WoodCut"], r_end=log_top / 2 - 0.02, wobble=0.1, rng=rng)
    cylinder(bm, W(E["log"]["x"], log_top * 0.8, E["log"]["z"] - hl * 0.5), W(E["log"]["x"] - 0.22, log_top + 0.2, E["log"]["z"] - hl * 0.75), 0.04, 6, m=m["CF_Driftwood"], r_end=0.02)
    water = L["river"]["water"]
    for k in range(11):
        z = E["log"]["z"] - 0.9 + k * 0.3 + rng.uniform(-0.08, 0.08)
        span = river_span(L, z)
        if not span or (abs(z - E["rock"]["z"]) < 0.3) or abs(z - E["log"]["z"]) < 0.25:
            continue
        x = span[0] + rng.uniform(0.02, 0.3)
        for q in range(2):
            rx, rz = x + rng.uniform(-0.08, 0.08), z + rng.uniform(-0.08, 0.08)
            h = rng.uniform(0.55, 0.85)
            cylinder(bm, W(rx, water - 0.2, rz), W(rx + 0.03, water + h, rz), 0.011, 3, m=m["CF_GrassDark"])
            cylinder(bm, W(rx + 0.025, water + h - 0.16, rz), W(rx + 0.03, water + h - 0.02, rz), 0.026, 5, m=m["CF_Cattail"])
    make_object("Campfire_Places", bm, M, coll)

    # --- the blankets: laid to the slope, vertex by vertex (gingham, and a striped blue one)
    top = cushions["picnicBlanket"]["top"]
    bm = bmesh.new()
    for i, b in enumerate(P["blankets"]):
        n = math.hypot(*b["up"])
        ux, uz = b["up"][0] / n, b["up"][1] / n
        sx, sz = -uz, ux
        bx, bz = b["x"], b["z"]
        if i == 0:
            m_of = lambda r_, c_: m["CF_Checker"] if (r_ + c_) % 2 else m["CF_VanCream"]
        else:
            m_of = lambda r_, c_: m["CF_VanCream"] if c_ % 3 == 1 else m["CF_BlanketBlue"]
        sheet(bm, 8, 8, lambda u, v: W(bx + ux * (u - 0.5) * 1.7 + sx * (v - 0.5) * 1.45, top - 0.012 + 0.006 * math.sin(u * 9 + v * 7), bz + uz * (u - 0.5) * 1.7 + sz * (v - 0.5) * 1.45), m_of)
    if P["blankets"]:
        make_object("Campfire_Blankets", bm, M, coll, lift="vertex")
    else:
        bm.free()

    # --- the hammocks: striped canvas sagging between two pines, on ropes; the lowest of the sag is
    # the hammock cushion's top. And the paper lantern on its own line between the third pair
    sag_y = cushions["hammock"]["top"]
    for i, h in enumerate(P["hammocks"]):
        a_, b_ = h["a"], h["b"]
        d = math.hypot(b_[0] - a_[0], b_[1] - a_[1])
        ux, uz = (b_[0] - a_[0]) / d, (b_[1] - a_[1]) / d
        sx, sz = -uz, ux
        mx, mz = (a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2
        half_len = d / 2 - 0.5
        bm = bmesh.new()

        def pt(u, v, ux=ux, uz=uz, sx=sx, sz=sz, mx=mx, mz=mz, half_len=half_len):
            t = 2 * u - 1
            w = 0.4 * (1 - 0.6 * t * t)
            s_ = (2 * v - 1)
            return W(mx + ux * t * half_len + sx * s_ * w, sag_y + 0.4 * t * t + 0.13 * s_ * s_ * (1 - 0.5 * t * t), mz + uz * t * half_len + sz * s_ * w)

        sheet(bm, 10, 6, pt, lambda r_, c_: m["CF_HammockStripe"] if c_ in (1, 4) else m["CF_Hammock"])
        for e in (-1, 1):
            tx, tz = (a_ if e < 0 else b_)
            tx, tz = tx - e * ux * 0.14, tz - e * uz * 0.14
            ex, ez = mx + e * ux * half_len, mz + e * uz * half_len
            for s_ in (-1, 0, 1):
                cylinder(bm, W(ex + sx * s_ * 0.15, sag_y + 0.4 + 0.065 * abs(s_), ez + sz * s_ * 0.15), W(tx, 1.3, tz), 0.009, 4, m=m["CF_Rope"])
            lathe(bm, tx + e * ux * 0.14, tz + e * uz * 0.14, [(0.14, 1.26), (0.175, 1.26), (0.175, 1.34), (0.14, 1.34)], segs=10, m=m["CF_Rope"])
        make_object(f"Campfire_Hammock_{i + 1}", bm, M, coll, origin=(mx, 0.0, mz))
    # (a paper lantern on a peg out of the middle pine's trunk, toward the camera)
    Hl = P["hammockLantern"]
    mx, mz = Hl["tip"]
    bm = bmesh.new()
    cylinder(bm, W(Hl["x"], Hl["y"] - 0.06, Hl["z"]), W(mx, Hl["y"], mz), 0.028, 6, m=m["CF_Bark"], r_end=0.02)
    ly = Hl["y"]
    cylinder(bm, W(mx, ly, mz), W(mx, ly - 0.08, mz), 0.006, 4, m=m["CF_Rope"])
    lathe(bm, mx, mz, [(0, ly - 0.08), (0.06, ly - 0.09), (0.13, ly - 0.2), (0.13, ly - 0.3), (0.06, ly - 0.41), (0, ly - 0.42)], segs=12, m=m["CF_LanternWarm"])
    for y_ in (ly - 0.085, ly - 0.415):
        lathe(bm, mx, mz, [(0, y_ - 0.012), (0.065, y_ - 0.012), (0.065, y_ + 0.012), (0, y_ + 0.012)], segs=10, m=m["CF_Metal"])
    make_object("Campfire_HammockLantern", bm, M, coll, origin=(mx, 0.0, mz))

    # --- the bench swing: an A-frame at each end of the beam, the beam; and the bench on its ropes,
    # a node of its own with its origin on the beam (the game turns it about the beam: swingMotion)
    Sw = P["swing"]
    x, z, beam, span = Sw["x"], Sw["z"], Sw["beam"], Sw["span"]
    bm = bmesh.new()
    for e in (-1, 1):
        zz = z + e * span
        for sx_ in (-1, 1):
            cylinder(bm, W(x + sx_ * 0.5, -0.05, zz), W(x + sx_ * 0.03, beam + 0.06, zz), 0.05, 7, m=m["CF_Plank"], r_end=0.042)
        cylinder(bm, W(x - 0.27, 0.95, zz), W(x + 0.27, 0.95, zz), 0.03, 6, m=m["CF_PlankDark"])
    cylinder(bm, W(x, beam, z - span - 0.16), W(x, beam, z + span + 0.16), 0.055, 8, m=m["CF_PlankDark"], cap_m=m["CF_WoodCut"])
    make_object("Campfire_SwingFrame", bm, M, coll, origin=(x, 0.0, z))
    seat_top = cushions["swing"]["top"]
    bm = bmesh.new()
    for k in range(4):  # the seat's slats, front to back
        x0 = x - 0.25 + k * 0.125
        box(bm, x0 + 0.006, x0 + 0.119, seat_top - 0.04, seat_top, z - 0.64, z + 0.64, m=m["CF_Plank"])
    for k in range(3):  # the back's slats, leaning back a little
        y0 = seat_top + 0.1 + k * 0.15
        xb = x - 0.26 - 0.03 * (k + 1)
        box(bm, xb - 0.02, xb + 0.02, y0, y0 + 0.12, z - 0.64, z + 0.64, m=m["CF_Plank"])
    for e in (-1, 1):
        zz = z + e * 0.6
        box(bm, x - 0.27, x + 0.25, seat_top - 0.07, seat_top - 0.04, zz - 0.03, zz + 0.03, m=m["CF_PlankDark"])  # the bearer under the slats
        cylinder(bm, W(x - 0.27, seat_top - 0.05, zz), W(x - 0.38, seat_top + 0.56, zz), 0.022, 5, m=m["CF_PlankDark"])  # the back's upright
        box(bm, x - 0.33, x + 0.2, seat_top + 0.2, seat_top + 0.235, zz - 0.035, zz + 0.035, m=m["CF_PlankDark"])  # the armrest
        cylinder(bm, W(x + 0.18, seat_top - 0.04, zz), W(x + 0.18, seat_top + 0.2, zz), 0.02, 5, m=m["CF_PlankDark"])
        cylinder(bm, W(x + 0.2, seat_top - 0.05, zz), W(x, beam, zz), 0.012, 5, m=m["CF_Rope"])
        cylinder(bm, W(x - 0.37, seat_top + 0.5, zz), W(x, beam, zz), 0.012, 5, m=m["CF_Rope"])
    make_object("Prop_Swing", bm, M, coll, origin=(x, beam, z))


# ---------------------------------------------------------------------------------------------
# one draw call a finish: every plain colour baked into the vertices, the still things fused

# the nodes the game animates or shows and hides by name: they stay their own objects
DYNAMIC = ("Fire_Flame", "Stew_", "Picnic_Skewer", "Picnic_Bbq", "Fauna_", "Prop_Canoe", "Prop_Swing", "Forage_", "StringLight_")
# the materials that stay themselves: what glows (the game flickers them by name), and the stew
# (the game tints it)
KEEP = set(EMISSION) | {"CF_Stew"}
SLOT_ROUGH = {"CF_Sheen": 0.5}


def slot_of(name, pines):
    """The finish a face painted `name` is drawn with."""
    if name in KEEP:
        return name
    if name in ("CF_Pine", "CF_PineLight", "CF_PineDeep") or (pines and name in ("CF_BirchLeaf", "CF_BirchLeafLight", "CF_Willow", "CF_WillowLight")):
        return "CF_Pine"
    if pines:
        return "CF_PineBark"
    if name in DOUBLE_SIDED:
        return "CF_ClayDouble"
    return "CF_Sheen" if ROUGHNESS.get(name, 0.82) < 0.65 else "CF_Clay"


def bake_colors(ob, pines=False):
    """Every face's own colour into the mesh's "Col" corner colours, and its material replaced by
    its finish's (slot_of): an object of twelve colours is one or two draw calls. The pines keep,
    in their UVs, each vertex's height over the ground it stands on (the game sways them by it)."""
    me = ob.data
    names = [m.name for m in me.materials]
    if not names or names == ["CF_Ground"] or names == ["CF_Water"]:
        return
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    lifts = me.attributes.get("lift")
    # (no UVs but the pines': a stray layer on one object would give the whole fused mesh one)
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name="UVMap") if pines else None
    world = ob.matrix_world
    slots, index, face_slot = [], {}, []
    for poly in me.polygons:
        name = names[min(poly.material_index, len(names) - 1)]
        s = slot_of(name, pines)
        c = (1.0, 1.0, 1.0) if s in KEEP else lin(PALETTE[name])
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
            if uv is not None:
                vi = me.loops[li].vertex_index
                uv.data[li].uv = (0.0, max(0.0, (world @ me.vertices[vi].co).z - (lifts.data[vi].value if lifts else 0.0)))
        if s not in index:
            index[s] = len(slots)
            slots.append(s)
        face_slot.append(index[s])
    me.materials.clear()
    for s in slots:
        me.materials.append(material(s) if s in KEEP else vc_material(s, rough=SLOT_ROUGH.get(s, 0.82), double=s == "CF_ClayDouble"))
    for poly, i in zip(me.polygons, face_slot):
        poly.material_index = i
    if lifts is not None:
        me.attributes.remove(lifts)
    use_col(me)


def fuse(coll):
    """Bakes every object's colours, then joins the still ones into Campfire_Static (and the pines
    into Campfire_Pines): about one draw call a finish for the whole island."""
    statics, pines = [], []
    for ob in list(coll.all_objects):
        if ob.type != "MESH" or ob.name in ("Campfire_Ground", "Campfire_Water"):
            continue
        tree = ob.name.startswith("Campfire_Trees")
        bake_colors(ob, pines=tree)
        if ob.name.startswith(DYNAMIC) or ob.parent is not None:
            continue
        (pines if tree else statics).append(ob)
    bpy.context.view_layer.update()
    for name, group in (("Campfire_Static", statics), ("Campfire_Pines", pines)):
        if not group:
            continue
        target = group[0]
        if len(group) > 1:
            with bpy.context.temp_override(object=target, active_object=target, selected_objects=group, selected_editable_objects=group):
                bpy.ops.object.join()
        target.name = name
        target.data.name = name + "Mesh"
        use_col(target.data)
    meshes = [o for o in coll.all_objects if o.type == "MESH"]
    return {"objects": len(meshes), "drawCalls": sum(len(o.data.materials) for o in meshes), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes), "static": [m.name for m in bpy.data.objects["Campfire_Static"].data.materials]}


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
        if not ws:
            continue
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        # reported in the game's axes: x, y (up), z
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": len(o.data.materials)}
    checks = {
        "firepitTop": out["Seat_Firepit"]["y"][1],
        "firepitSeatHeights": {k: v[1] for k, v in marks.items() if k.startswith(("Seat_Log_L", "Seat_Log_M", "Seat_Log_C", "Seat_Stump_0", "Seat_Boulder_0"))},
        "logCushionTop": cushions["log"]["top"],
        "tentMatTop": cushions["tentMat"]["top"],
        "water": L["river"]["water"],
    }
    return {"objects": out, "marks": marks, "checks": checks}


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll, L, cushions = build(root)
        report_ = summary(coll, L, cushions)
        fused = fuse(coll)
        out = os.path.join(root, "client", "public", "models", "campfire.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "fused": fused, "checks": report_["checks"], "marks": report_["marks"]}
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
