"""Sunset Beach: builds client/public/models/beach.glb.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_beach.py

Nothing is placed by hand: the ground's grid and every thing's place come from
scripts/blender/data/beach_terrain.json, which `npm run beach-terrain` writes from
shared/worlds/beach.ts (the layout is written in the coast's own frame there, so the game resolves it
and this file reads plain (x, z)). The primitives are the woods builder's (build_forest.py, run up to
its `main()` in this namespace), the paint and the finishes this file's own. Nodes:

    Beach_Ground    the island's top from the game's grid: dry sand, the dune's paler crest, a wet
                    band at the waterline, the seabed darkening with depth (BC_Sand: vertex colours)
    Beach_Sea       the sea: a fine sheet over the map and a wide one out past it on every side, its
                    vertex colours data for the game's shader (red: how far out from the waterline)
    Beach_Static    everything still, one draw call a finish: the bar (a horseshoe counter of bamboo,
                    six stools, the back shelf under a thatched lean-to, two posts of string lights),
                    the firepit and its driftwood logs, the loungers and parasols, the hammocks, the
                    pier and its piles, the trader's shack, the headland's rocks, driftwood, shrubs,
                    dune grass, shells
    Beach_Palms     the palms (BC_Palm, BC_PalmBark: the game sways the fronds and thins both
                    between you and the camera; each vertex's height over its foot is in its UVs)
    Prop_Boat       the captain's boat moored at the pier's head (its origin at its waterline: the
                    game rocks it on the swell)

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import math
import os
import random
import traceback

import bmesh
import bpy
from mathutils import Matrix, Vector


def _repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_beach.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# the woods builder's kit (its primitives, its plumbing), run here up to its own `main()`
_kit = open(os.path.join(_repo_root(), "scripts", "blender", "build_forest.py"), encoding="utf-8").read()
exec(compile(_kit[: _kit.rindex("\nmain()")], "build_forest.py", "exec"), globals())

COLLECTION = "Beach"
repo_root = _repo_root

PALETTE = {
    "BC_SandDry": "#EBD8A7", "BC_SandPale": "#F4E8C4", "BC_SandWet": "#C6AB7B", "BC_SandAsh": "#B9A98A", "BC_SandGreen": "#CFCB92",
    "BC_Seabed": "#B49C6E", "BC_SeabedDeep": "#3D6E78", "BC_Soil": "#A98E63", "BC_SoilDeep": "#7C6648",
    "BC_Wood": "#B88A5A", "BC_WoodDark": "#7A5536", "BC_WoodPale": "#D2AE7E", "BC_Drift": "#BDB2A0", "BC_DriftDark": "#9A8F7E",
    "BC_Bamboo": "#D8BA6E", "BC_BambooDark": "#B4934E", "BC_Thatch": "#CFAE62", "BC_ThatchDark": "#A98846", "BC_Rope": "#CDBB94",
    "BC_Stone": "#9C958B", "BC_StoneDark": "#6F6A63", "BC_Rock": "#8E8679", "BC_RockDark": "#615C54", "BC_RockMoss": "#7C8A62",
    "BC_Char": "#2B2623", "BC_Ash": "#5A544E",
    "BC_PalmBark": "#8E6E4C", "BC_PalmBarkDark": "#6F5439", "BC_Frond": "#4E9A4A", "BC_FrondLight": "#7DBB55", "BC_FrondDeep": "#2F7240", "BC_Coconut": "#5B3F2A",
    "BC_Leaf": "#3F8A55", "BC_LeafLight": "#68AE5E", "BC_DuneGrass": "#B9C67C", "BC_DuneGrassDark": "#93A860", "BC_Blossom": "#F08FA6",
    "BC_Canvas": "#F4EDE0", "BC_Red": "#D9534F", "BC_Teal": "#3AA6A0", "BC_Yellow": "#F2C14E", "BC_Coral": "#F08A6B", "BC_White": "#F7F3EA", "BC_Navy": "#2C4A6E", "BC_Pink": "#F2A7B5",
    "BC_Glass": "#BFE3E8", "BC_Bottle": "#5FA37A", "BC_BottleAmber": "#C7873A", "BC_Iron": "#4A4F55", "BC_Shell": "#F3D9C9", "BC_Star": "#F29A6B",
    "BC_Hull": "#F4EFE4", "BC_HullTrim": "#C94C3F", "BC_HullUnder": "#2F5D6B", "BC_Deck": "#C79A66",
    "BC_Bulb": "#FFD98A", "BC_Ember": "#FF7A2E", "BC_Lamp": "#FFE2A6",
}
ROUGHNESS = {"BC_Glass": 0.3, "BC_Bottle": 0.35, "BC_BottleAmber": 0.35, "BC_Iron": 0.6, "BC_Hull": 0.55, "BC_HullTrim": 0.55}
EMISSION = {"BC_Bulb": 2.6, "BC_Ember": 2.2, "BC_Lamp": 2.4}
DOUBLE_SIDED = {"BC_Frond", "BC_FrondLight", "BC_FrondDeep", "BC_DuneGrass", "BC_DuneGrassDark", "BC_Canvas", "BC_Red", "BC_Teal", "BC_Yellow", "BC_Pink", "BC_Thatch", "BC_ThatchDark", "BC_White", "BC_Coral"}
MATS = list(PALETTE)
PALM_FINISH = {"BC_Frond": "BC_Palm", "BC_FrondLight": "BC_Palm", "BC_FrondDeep": "BC_Palm", "BC_Coconut": "BC_PalmBark", "BC_PalmBark": "BC_PalmBark", "BC_PalmBarkDark": "BC_PalmBark"}

SCENE = None  # beach_terrain.json's `scene` (set by build)


def m(name):
    return MATS.index(name)


def read_terrain(root):
    with open(os.path.join(root, "scripts", "blender", "data", "beach_terrain.json"), encoding="utf-8") as f:
        return json.load(f)


def lift_at(x, z):
    """How far up a thing built at y = 0 goes to stand at (x, z): the ground there."""
    return 0.0 if TERRAIN is None else land_y(x, z)


def shore_at(x, z):
    """How far inland (x, z) is (negative: out to sea), from the grid."""
    return _grid_y("shore", x, z)


# --- frames: a thing built in its own axes (a: the way it faces, b: to its left, y up) -------------


class Frame:
    """A place and a heading: `a` runs along the game heading `yaw` (sin, cos), `b` across it."""

    def __init__(self, x, z, yaw, y=None):
        self.x, self.z = x, z
        self.fx, self.fz = math.sin(yaw), math.cos(yaw)
        self.rx, self.rz = math.cos(yaw), -math.sin(yaw)
        self.y = land_y(x, z) if y is None else y

    def xz(self, a, b):
        return self.x + self.fx * a + self.rx * b, self.z + self.fz * a + self.rz * b

    def p(self, a, y, b):
        x, z = self.xz(a, b)
        return W(x, self.y + y, z)


def obox(bm, fr, a0, a1, y0, y1, b0, b1, mat):
    """A box in a frame's axes."""
    vs = [bm.verts.new(fr.p(a, y, b)) for y in (y0, y1) for a, b in ((a0, b0), (a1, b0), (a1, b1), (a0, b1))]
    quads = ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))
    for q in quads:
        bm.faces.new([vs[i] for i in q]).material_index = mat


def oquad(bm, pts, mat, thick=0.0, under=None):
    """A sheet over four Blender points (going round), `thick` thick downwards (0: a single face)."""
    if thick <= 0:
        bm.faces.new([bm.verts.new(p) for p in pts]).material_index = mat
        return
    hexa(bm, [p - Vector((0, 0, thick)) for p in pts], Vector((0, 0, thick)), m=mat, m_under=mat if under is None else under)


def bar(bm, a, b, r, mat, sides=6, r_end=None):
    cylinder(bm, a, b, r, sides=sides, m=mat, r_end=r_end)


def nub(bm, x, y, z, r, h, mat, cuts=1, noise=0.0, rng=None):
    blob(bm, x, y, z, r, h, r, m=mat, cuts=cuts, noise=noise, rng=rng)


# --- the ground ----------------------------------------------------------------------------------


def shade_pools():
    """Soft shade under the palms' crowns and round what stands (the game draws no shadows): each
    (x, z, radius, darkness), thrown a little to the east-north-east as the day's key throws it."""
    S = SCENE
    pools = []
    for p in S["palms"] + S["hammockPalms"]:
        s = p.get("s", 1.0)
        pools.append((p["x"] + 0.9 * s, p["z"] - 0.35 * s, 1.5 * s, 0.2))
        pools.append((p["x"], p["z"], 0.45, 0.22))
    for p in S["shrubs"]:
        pools.append((p["x"] + 0.15, p["z"] - 0.05, 0.6 * p["s"], 0.22))
    for p in S["rocks"]:
        pools.append((p["x"] + 0.2, p["z"] - 0.08, 0.75 * p["s"], 0.24))
    for p in S["parasols"]:
        pools.append((p["x"] + 0.7, p["z"] - 0.3, 1.3, 0.2))
    b = S["bar"]
    pools.append((b["x"], b["z"], 2.6, 0.16))
    pools.append((S["shack"]["x"] + 0.5, S["shack"]["z"] - 0.2, 2.3, 0.22))
    for l in S["loungers"]:
        pools.append((l["x"], l["z"], 0.8, 0.18))
    return pools


def ground_color(x, z, tones, pools):
    dry, pale, wet, ash, green, bed, deep = tones
    d = shore_at(x, z)
    y = ground_y(x, z)
    n1 = vnoise(x * 0.35 + 11.0, z * 0.35 - 4.0)
    n2 = vnoise(x * 1.7 - 3.0, z * 1.7 + 9.0)
    if d < 0:
        # the seabed: wet sand at the line, darker and bluer with depth
        c = mixc(wet, bed, smooth(0.0, 1.6, -d))
        return mixc(c, deep, smooth(1.2, 8.0, -d))
    c = mixc(dry, pale, smooth(0.75, 1.5, y) * 0.8)
    # sparse beach grass's ground behind the dunes
    c = mixc(c, green, 0.55 * smooth(11.0, 17.0, d) * smooth(0.35, 0.7, n1))
    # the wet band at the waterline, its edge wandering
    c = mixc(c, wet, smooth(1.5 + 0.5 * n1, 0.15, d))
    # the one worn place: ash-grey sand round the firepit
    f = SCENE["firepit"]
    r = math.hypot(x - f["x"], z - f["z"])
    c = mixc(c, ash, 0.75 * smooth(2.3 + 0.4 * n2, 0.7, r))
    # a slow mottle and a fine one
    k = 1.0 + 0.05 * (n1 - 0.5) + 0.035 * (n2 - 0.5)
    c = [v * k for v in c]
    shade = 0.0
    for px, pz, pr, dark in pools:
        q = math.hypot(x - px, z - pz)
        if q < pr:
            shade = max(shade, dark * smooth(pr, pr * 0.35, q))
    if shade:
        c = [c[0] * (1 - shade), c[1] * (1 - shade * 0.92), c[2] * (1 - shade * 0.8)]
    return c


def build_ground(coll):
    """The island's top from the game's own grid (each cell cut along the diagonal the game reads it
    by, and cut once finer for the paint), its rim rounded off, its sides falling away in soil."""
    half = TERRAIN["half"]
    sub = 2
    N = TERRAIN["n"] * sub
    step = 2 * half / N
    tones = [lin(PALETTE[k]) for k in ("BC_SandDry", "BC_SandPale", "BC_SandWet", "BC_SandAsh", "BC_SandGreen", "BC_Seabed", "BC_SeabedDeep")]
    soil, deep = lin(PALETTE["BC_Soil"]), lin(PALETTE["BC_SoilDeep"])
    pools = shade_pools()
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    verts, rim_of = {}, {}

    def vert(i, k):
        x, z = snap_rim(-half + i * step, -half + k * step, half)
        key = (round(x, 4), round(z, 4))
        v = verts.get(key)
        if v is None:
            rim = rim_inside(x, z, half)
            v = verts[key] = bm.verts.new(W(x, ground_y(x, z) - 0.2 * smooth(0.4, 0.0, rim) ** 2, z))
            rim_of[v] = rim
        return v

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
    vcol = {}
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert
            if v not in vcol:
                x, z = v.co.x, -v.co.y
                vcol[v] = (*mixc(ground_color(x, z, tones, pools), soil, 0.6 * smooth(0.32, 0.0, rim_inside(x, z, half)) * (1.0 if v.co.z > 0 else 0.0)), 1.0)
            loop[col] = vcol[v]
    # the sides: from the rim straight down, in soil (the sea hides all of it but the land's back)
    for e in [e for e in bm.edges if len(e.link_faces) == 1]:
        a, b = e.verts
        quad = [bm.verts.new(a.co), bm.verts.new(b.co), bm.verts.new((b.co.x, b.co.y, -1.6)), bm.verts.new((a.co.x, a.co.y, -1.6))]
        f = bm.faces.new(quad)
        f.normal_update()
        mid = f.calc_center_median()
        if f.normal.x * mid.x + f.normal.y * mid.y < 0:
            f.normal_flip()
        for loop in f.loops:
            loop[col] = (*(soil if loop.vert.co.z > -0.6 else deep), 1.0)
    me = bpy.data.meshes.new("Beach_GroundMesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(vc_material("BC_Sand"))
    use_col(me)
    ob = bpy.data.objects.new("Beach_Ground", me)
    coll.objects.link(ob)
    ob["origin"] = [0.0, 0.0, 0.0]


SEA_OUT = 70.0  # how far the sea runs out past the map, on every side


def build_sea(coll):
    """The sea: one sheet at the waterline's height. Over the map it follows the grid (every other
    corner), each vertex carrying how far out from the waterline it is (red: 0 at 0.8 m up the sand to
    1 at 11 m out and beyond); round the map a wide skirt of deep water."""
    half, n, cell = TERRAIN["half"], TERRAIN["n"], TERRAIN["cell"]
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    data = {}

    def out_of(shore):
        return max(0.0, min(1.0, (0.8 - shore) / 12.0))

    def vert(x, z, r):
        v = bm.verts.new(W(x, 0.0, z))
        data[v] = (r, 0.0, 0.0, 1.0)
        return v

    stride = 2
    idx = list(range(0, n + 1, stride))
    if idx[-1] != n:
        idx.append(n)
    grid = {}
    shore = TERRAIN["shore"]
    for k in idx:
        for i in idx:
            grid[(i, k)] = shore[k * (n + 1) + i]
    made = {}

    def gv(i, k):
        v = made.get((i, k))
        if v is None:
            v = made[(i, k)] = vert(-half + i * cell, -half + k * cell, out_of(grid[(i, k)]))
        return v

    for a, b in zip(idx, idx[1:]):
        for c, d in zip(idx, idx[1:]):
            corners = ((a, c), (b, c), (b, d), (a, d))
            # (only where the sea shows: a cell wholly up the sand is left out)
            if min(grid[q] for q in corners) > 1.2:
                continue
            bm.faces.new([gv(*q) for q in corners])
    # the skirt: from the map's edge out to SEA_OUT, deep water
    edge = [(i, 0) for i in idx] + [(n, k) for k in idx[1:]] + [(i, n) for i in reversed(idx[:-1])] + [(0, k) for k in reversed(idx[1:-1])]
    # (three rings: the map's edge as it is, a few metres out already deep, then the far rim)
    rings = [[], [], []]
    for i, k in edge:
        x, z = -half + i * cell, -half + k * cell
        r = out_of(grid[(i, k)])
        e = max(abs(x), abs(z))
        rings[0].append(vert(x, z, r))
        rings[1].append(vert(x * (e + 5.0) / e, z * (e + 5.0) / e, min(1.0, max(r + 0.45, 0.7))))
        rings[2].append(vert(x * SEA_OUT / e, z * SEA_OUT / e, 1.0))
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(len(edge)):
            j1 = (j + 1) % len(edge)
            bm.faces.new((r0[j], r0[j1], r1[j1], r1[j]))
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
        f.smooth = True
        for loop in f.loops:
            loop[col] = data[loop.vert]
    me = bpy.data.meshes.new("Beach_SeaMesh")
    bm.to_mesh(me)
    bm.free()
    mat = vc_material("BC_Sea")
    mat.use_backface_culling = False
    me.materials.append(mat)
    use_col(me)
    ob = bpy.data.objects.new("Beach_Sea", me)
    coll.objects.link(ob)
    ob["origin"] = [0.0, 0.0, 0.0]


# --- the bar -------------------------------------------------------------------------------------


def string_of_lights(bm, a, b, rng, sag=0.28, every=0.42):
    """A string from a to b (Blender points) sagging between them, a bulb every `every` metres."""
    n = max(4, int((b - a).length / 0.3))
    pts = [a.lerp(b, t / n) - Vector((0, 0, sag * math.sin(math.pi * t / n))) for t in range(n + 1)]
    for p, q in zip(pts, pts[1:]):
        bar(bm, p, q, 0.012, m("BC_Iron"), sides=4)
    run, last = 0.0, pts[0]
    for p in pts[1:]:
        run += (p - last).length
        last = p
        if run >= every:
            run = 0.0
            blob(bm, p.x, p.z - 0.05, -p.y, 0.045, 0.06, 0.045, m=m("BC_Bulb"), cuts=1)


def build_bar(coll, cushions, rng):
    B = SCENE["bar"]
    fr = Frame(B["x"], B["z"], B["yaw"])
    bm = bmesh.new()
    R, arc, top = B["counter"], B["arc"], B["top"]

    def polar(r, deg, y):
        t = math.radians(deg)
        return fr.p(r * math.cos(t), y, r * math.sin(t))

    # the counter: a horseshoe of bamboo under a wide plank top
    segs = 24
    for k in range(segs):
        d0, d1 = -arc + 2 * arc * k / segs, -arc + 2 * arc * (k + 1) / segs
        lo = [polar(R - 0.24, d0, 0.0), polar(R + 0.2, d0, 0.0), polar(R + 0.2, d1, 0.0), polar(R - 0.24, d1, 0.0)]
        hexa(bm, lo, Vector((0, 0, top - 0.06)), m=m("BC_BambooDark"))
        tp = [polar(R - 0.36, d0, top - 0.06), polar(R + 0.34, d0, top - 0.06), polar(R + 0.34, d1, top - 0.06), polar(R - 0.36, d1, top - 0.06)]
        hexa(bm, tp, Vector((0, 0, 0.06)), m=m("BC_Wood"), m_under=m("BC_WoodDark"))
    poles = int(2 * arc / 180 * math.pi * (R + 0.24) / 0.17)
    for k in range(poles + 1):
        deg = -arc + 2 * arc * k / poles
        bar(bm, polar(R + 0.24, deg, 0.0), polar(R + 0.24, deg, top - 0.07), 0.05, m("BC_Bamboo") if k % 2 else m("BC_BambooDark"), sides=6)
    # the counter's ends, capped with a post each
    for deg in (-arc, arc):
        bar(bm, polar(R, deg, 0.0), polar(R, deg, top + 0.12), 0.09, m("BC_WoodDark"), sides=8)
    # what stands on it: a fruit bowl, a row of glasses, a shaker, a jar of straws
    blob(bm, *_xyz(polar(R, 28, top + 0.05)), 0.15, 0.06, 0.15, m=m("BC_WoodPale"), cuts=2)
    for dx, mat in ((-0.06, "BC_Yellow"), (0.05, "BC_Coral"), (0.0, "BC_Leaf")):
        p = polar(R + dx, 28 + dx * 30, top + 0.12)
        blob(bm, *_xyz(p), 0.055, 0.055, 0.055, m=m(mat), cuts=1)
    for k, deg in enumerate((-36, -30, -24, 58, 64)):
        p = polar(R - 0.05, deg, top)
        lathe(bm, p.x, -p.y, [(0.0, 0.0), (0.035, 0.0), (0.045, 0.12), (0.0, 0.12)], segs=8, m=m("BC_Glass"), y0=p.z)
    p = polar(R - 0.08, -62, top)
    lathe(bm, p.x, -p.y, [(0.0, 0.0), (0.045, 0.0), (0.05, 0.14), (0.035, 0.2), (0.0, 0.21)], segs=8, m=m("BC_Iron"), y0=p.z)
    # the stools
    seat_top = cushions["stool"]["top"]
    for s in B["stools"]:
        y = land_y(s["x"], s["z"])
        lathe(bm, s["x"], s["z"], [(0.0, seat_top - 0.07), (0.17, seat_top - 0.07), (0.19, seat_top - 0.035), (0.17, seat_top), (0.0, seat_top)], segs=12, m=m("BC_Wood"), y0=y)
        for t in range(3):
            ang = 2 * math.pi * t / 3 + s["yaw"]
            foot = W(s["x"] + 0.19 * math.cos(ang), y, s["z"] + 0.19 * math.sin(ang))
            bar(bm, foot, W(s["x"] + 0.08 * math.cos(ang), y + seat_top - 0.07, s["z"] + 0.08 * math.sin(ang)), 0.022, m("BC_BambooDark"), sides=5)
        lathe(bm, s["x"], s["z"], [(0.0, 0.17), (0.15, 0.17), (0.15, 0.19), (0.0, 0.19)], segs=10, m=m("BC_BambooDark"), y0=y)
    # the back shelf: bottles in two rows
    obox(bm, fr, -1.98, -1.52, 0.0, 0.92, -1.25, 1.25, m("BC_WoodDark"))
    obox(bm, fr, -2.0, -1.5, 0.92, 0.97, -1.3, 1.3, m("BC_Wood"))
    obox(bm, fr, -2.0, -1.84, 0.97, 1.75, -1.3, 1.3, m("BC_WoodDark"))
    obox(bm, fr, -1.96, -1.6, 1.36, 1.4, -1.3, 1.3, m("BC_Wood"))
    for row, y0 in ((0, 0.97), (1, 1.4)):
        for k in range(9):
            bq = -1.1 + k * 0.275 + rng.uniform(-0.03, 0.03)
            p = fr.p(-1.72, y0, bq)
            h = rng.uniform(0.2, 0.3)
            lathe(bm, p.x, -p.y, [(0.0, 0.0), (0.045, 0.0), (0.045, h * 0.6), (0.018, h * 0.8), (0.018, h), (0.0, h)], segs=7, m=m(rng.choice(["BC_Bottle", "BC_BottleAmber", "BC_Glass", "BC_Coral", "BC_Teal"])), y0=p.z)
    # the lean-to: two posts behind the shelf, a thatched roof tilted up toward the sea
    for side in (-1.5, 1.5):
        bar(bm, fr.p(-2.45, 0.0, side), fr.p(-2.45, 2.35, side), 0.075, m("BC_BambooDark"), sides=8)
        bar(bm, fr.p(-2.45, 1.7, side), fr.p(-1.0, 2.82, side), 0.04, m("BC_Bamboo"), sides=6)
    roof = [fr.p(-2.85, 2.28, -1.9), fr.p(-0.75, 2.98, -1.9), fr.p(-0.75, 2.98, 1.9), fr.p(-2.85, 2.28, 1.9)]
    oquad(bm, roof, m("BC_Thatch"), thick=0.14, under=m("BC_ThatchDark"))
    fringe = [fr.p(-2.95, 2.12, -2.0), fr.p(-0.62, 2.9, -2.0), fr.p(-0.62, 2.9, 2.0), fr.p(-2.95, 2.12, 2.0)]
    oquad(bm, fringe, m("BC_ThatchDark"), thick=0.05)
    for k in range(5):
        bq = -1.7 + k * 0.85
        bar(bm, fr.p(-2.85, 2.3, bq), fr.p(-0.75, 3.0, bq), 0.03, m("BC_BambooDark"), sides=5)
    # two tall posts at the counter's ends, strings of lights from them to the roof and across
    tops = []
    for post in B["posts"]:
        y = land_y(post["x"], post["z"])
        bar(bm, W(post["x"], y, post["z"]), W(post["x"], y + 2.75, post["z"]), 0.06, m("BC_BambooDark"), sides=8)
        tops.append(W(post["x"], y + 2.7, post["z"]))
    string_of_lights(bm, tops[0], tops[1], rng, sag=0.42)
    string_of_lights(bm, tops[0], fr.p(-0.75, 2.95, -1.85), rng, sag=0.2)
    string_of_lights(bm, tops[1], fr.p(-0.75, 2.95, 1.85), rng, sag=0.2)
    # a sign under the roof's front edge
    obox(bm, fr, -0.74, -0.7, 2.42, 2.8, -0.8, 0.8, m("BC_WoodPale"))
    for k, mat in enumerate(("BC_Coral", "BC_Teal", "BC_Yellow")):
        obox(bm, fr, -0.7, -0.685, 2.5, 2.72, -0.6 + k * 0.42, -0.24 + k * 0.42, m(mat))
    make_object("Beach_Bar", bm, MATS, coll)


def _xyz(p):
    """A Blender point as blob's game (x, y, z)."""
    return p.x, p.z, -p.y


# --- the firepit, the loungers, the hammocks ---------------------------------------------------------


def build_firepit(coll, cushions, rng):
    F = SCENE["firepit"]
    y = land_y(F["x"], F["z"])
    bm = bmesh.new()
    lathe(bm, F["x"], F["z"], [(0.0, 0.02), (F["r"] - 0.06, 0.03), (F["r"] - 0.02, 0.0), (0.0, 0.0)], segs=14, m=m("BC_Ash"), y0=y)
    for k in range(10):
        a = 2 * math.pi * k / 10 + rng.uniform(-0.1, 0.1)
        s = rng.uniform(0.85, 1.2)
        blob(bm, F["x"] + F["r"] * math.cos(a), y + 0.06 * s, F["z"] + F["r"] * math.sin(a), 0.13 * s, 0.1 * s, 0.11 * s, m=m("BC_Stone") if k % 3 else m("BC_StoneDark"), cuts=2, noise=0.12, rng=rng)
    for k in range(3):
        a = 2.1 * k + 0.4
        p0 = W(F["x"] + 0.26 * math.cos(a), y + 0.05, F["z"] + 0.26 * math.sin(a))
        p1 = W(F["x"] - 0.2 * math.cos(a + 0.5), y + 0.2, F["z"] - 0.2 * math.sin(a + 0.5))
        bar(bm, p0, p1, 0.05, m("BC_Char"), sides=6)
    blob(bm, F["x"], y + 0.07, F["z"], 0.16, 0.06, 0.16, m=m("BC_Ember"), cuts=2, noise=0.2, rng=rng)
    # four driftwood logs to sit on, each lying across the way to the fire
    log = cushions["log"]
    for s in F["logs"]:
        fr = Frame(s["x"], s["z"], s["yaw"])
        r = log["h"] / 2
        bar(bm, fr.p(0.0, log["y"], -0.52), fr.p(0.0, log["y"], 0.52), r, m("BC_Drift"), sides=10, r_end=r * 0.9)
        bar(bm, fr.p(0.02, log["y"] + 0.06, 0.2), fr.p(0.16, log["y"] + 0.3, 0.3), 0.035, m("BC_DriftDark"), sides=5, r_end=0.02)
    make_object("Beach_Firepit", bm, MATS, coll)


def build_loungers(coll, cushions, rng):
    bm = bmesh.new()
    top = cushions["lounger"]["top"]
    towels = ["BC_Coral", "BC_Teal", "BC_Yellow", "BC_Pink", "BC_Navy", "BC_Red", "BC_White"]
    for i, l in enumerate(SCENE["loungers"]):
        # (a: toward the feet; the head lies at -a)
        fr = Frame(l["x"], l["z"], l["yaw"])
        obox(bm, fr, -0.98, 0.98, top - 0.08, top - 0.04, -0.36, -0.31, m("BC_Wood"))
        obox(bm, fr, -0.98, 0.98, top - 0.08, top - 0.04, 0.31, 0.36, m("BC_Wood"))
        for k in range(11):
            a = -0.93 + k * 0.186
            obox(bm, fr, a - 0.075, a + 0.075, top - 0.04, top - 0.01, -0.34, 0.34, m("BC_WoodPale"))
        for a in (-0.8, 0.8):
            for b in (-0.3, 0.3):
                obox(bm, fr, a - 0.035, a + 0.035, 0.0, top - 0.08, b - 0.035, b + 0.035, m("BC_WoodDark"))
        # a towel laid along it and a rolled one under the head
        obox(bm, fr, -0.6, 0.86, top - 0.01, top, -0.3, 0.3, m(towels[i % len(towels)]))
        bar(bm, fr.p(-0.78, top + 0.03, -0.24), fr.p(-0.78, top + 0.03, 0.24), 0.07, m("BC_White"), sides=8)
    for p in SCENE["parasols"]:
        y = land_y(p["x"], p["z"])
        bar(bm, W(p["x"], y, p["z"]), W(p["x"] + 0.12, y + 2.25, p["z"] - 0.05), 0.03, m("BC_WoodPale"), sides=6)
        tip = W(p["x"] + 0.13, y + 2.42, p["z"] - 0.055)
        cols = rng.choice([("BC_Coral", "BC_White"), ("BC_Teal", "BC_White"), ("BC_Yellow", "BC_White")])
        segs = 12
        rim = [W(p["x"] + 0.12 + 1.3 * math.cos(2 * math.pi * k / segs), y + 2.0 + 0.04 * math.cos(4 * math.pi * k / segs), p["z"] - 0.05 + 1.3 * math.sin(2 * math.pi * k / segs)) for k in range(segs)]
        for k in range(segs):
            bm.faces.new([bm.verts.new(tip), bm.verts.new(rim[k]), bm.verts.new(rim[(k + 1) % segs])]).material_index = m(cols[k % 2])
    make_object("Beach_Loungers", bm, MATS, coll)


def build_hammocks(coll, cushions):
    bm = bmesh.new()
    sag = cushions["hammock"]["top"]
    for i, h in enumerate(SCENE["hammocks"]):
        a, b = h["a"], h["b"]
        ya, yb = land_y(a["x"], a["z"]), land_y(b["x"], b["z"])
        ym = land_y((a["x"] + b["x"]) / 2, (a["z"] + b["z"]) / 2)
        dx, dz = b["x"] - a["x"], b["z"] - a["z"]
        L = math.hypot(dx, dz)
        ux, uz = dx / L, dz / L
        px, pz = -uz, ux
        tie = 1.25
        ends = (0.5, L - 0.5)
        rows = []
        segs = 10
        for k in range(segs + 1):
            t = k / segs
            s = ends[0] + (ends[1] - ends[0]) * t
            # (hung from the two ties, its middle at the cushion's height over the ground there)
            base = (ya + tie) * (1 - t) + (yb + tie) * t
            low = ym + sag
            y = base + (low - (ya + yb) / 2 - tie) * math.sin(math.pi * t)
            w = 0.16 + 0.26 * math.sin(math.pi * t)
            row = []
            for c, lift in ((-1, 0.12), (-0.5, 0.03), (0, 0.0), (0.5, 0.03), (1, 0.12)):
                row.append(bm.verts.new(W(a["x"] + ux * s + px * w * c, y + lift * math.sin(math.pi * t), a["z"] + uz * s + pz * w * c)))
            rows.append(row)
        mat = m("BC_Coral") if i == 0 else m("BC_Teal")
        for r0, r1 in zip(rows, rows[1:]):
            for c in range(4):
                bm.faces.new((r0[c], r0[c + 1], r1[c + 1], r1[c])).material_index = mat if c in (1, 2) else m("BC_White")
        for end, (p, yy) in zip((rows[0], rows[-1]), ((a, ya), (b, yb))):
            for v in (end[0], end[-1], end[2]):
                bar(bm, v.co.copy(), W(p["x"], yy + tie + 0.1, p["z"]), 0.012, m("BC_Rope"), sides=4)
    make_object("Beach_Hammocks", bm, MATS, coll)


# --- the palms, the shrubs, the rocks ----------------------------------------------------------------


def palm(bm, x, z, s, rng, lean=None, lift_layer=None, ground=None, nuts=3):
    """A coconut palm at (x, z), `s` its size: a ringed trunk curving up its own way, a crown of
    arched fronds, a few coconuts. Built at the land's height; each vertex remembers that height
    (`lift`) so the game sways it by how far up the tree it is."""
    before = set(bm.verts)
    y0 = land_y(x, z) if ground is None else ground
    H = 4.3 * s * rng.uniform(0.9, 1.1)
    a = rng.random() * 6.283
    k = (rng.uniform(0.25, 0.75) if lean is None else lean) * s
    segs, sides = 11, 8
    rings = []
    for j in range(segs + 1):
        t = j / segs
        cx, cz = x + math.cos(a) * k * t * t, z + math.sin(a) * k * t * t
        r = (0.2 - 0.085 * t) * s * (1.06 if j % 2 else 0.97) + (0.06 * s if j == 0 else 0.0)
        rings.append([bm.verts.new(W(cx + r * math.cos(2 * math.pi * q / sides), y0 + H * t, cz + r * math.sin(2 * math.pi * q / sides))) for q in range(sides)])
    for j, (r0, r1) in enumerate(zip(rings, rings[1:])):
        for q in range(sides):
            f = bm.faces.new((r0[q], r0[(q + 1) % sides], r1[(q + 1) % sides], r1[q]))
            f.material_index = m("BC_PalmBark") if j % 2 else m("BC_PalmBarkDark")
            f.smooth = True
    tx, tz, ty = x + math.cos(a) * k, z + math.sin(a) * k, y0 + H
    # the crown: fronds arching out and drooping, each a ribbed blade
    fronds = 9
    for q in range(fronds):
        fa = 2 * math.pi * q / fronds + rng.uniform(-0.25, 0.25)
        R = 2.0 * s * rng.uniform(0.85, 1.12)
        up = rng.uniform(0.5, 1.0)
        mat = m(("BC_Frond", "BC_FrondLight", "BC_FrondDeep")[q % 3])
        n = 6
        spine, edges_l, edges_r = [], [], []
        for j in range(n + 1):
            t = j / n
            out = R * t
            yy = ty + s * (up * 1.1 * t - 1.9 * t * t)
            w = 0.34 * s * math.sin(math.pi * min(1.0, t * 0.92 + 0.08)) ** 0.8
            cx, cz = tx + math.cos(fa) * out, tz + math.sin(fa) * out
            sx, sz = -math.sin(fa) * w, math.cos(fa) * w
            spine.append(bm.verts.new(W(cx, yy, cz)))
            edges_l.append(bm.verts.new(W(cx + sx, yy - 0.12 * s * math.sin(math.pi * t), cz + sz)))
            edges_r.append(bm.verts.new(W(cx - sx, yy - 0.12 * s * math.sin(math.pi * t), cz - sz)))
        for j in range(n):
            bm.faces.new((spine[j], spine[j + 1], edges_l[j + 1], edges_l[j])).material_index = mat
            bm.faces.new((spine[j + 1], spine[j], edges_r[j], edges_r[j + 1])).material_index = mat
    for q in range(nuts):
        ca = a + 2.1 * q
        blob(bm, tx + 0.16 * s * math.cos(ca), ty - 0.16 * s, tz + 0.16 * s * math.sin(ca), 0.1 * s, 0.11 * s, 0.1 * s, m=m("BC_Coconut"), cuts=1)
    if lift_layer is not None:
        for v in bm.verts:
            if v not in before:
                v[lift_layer] = y0


def build_palms(coll, rng):
    bm = bmesh.new()
    layer = bm.verts.layers.float.new("lift")
    for p in SCENE["hammockPalms"]:
        palm(bm, p["x"], p["z"], 1.0, rng, lean=0.12, lift_layer=layer)
    make_object("Beach_PalmsRaw", bm, MATS, coll)
    # (the grove's palms are felled: the game draws them from palms.glb. They are still grown here,
    # into a mesh thrown away, so the random stream and all that is built after stays as it was)
    spare = bmesh.new()
    for p in SCENE["palms"]:
        palm(spare, p["x"], p["z"], p["s"], rng)
    spare.free()


# --- the Coconut Palm's four looks, for the game's fellable trees (palms.glb) ---------------------------
LOOKS = "PalmLooks"


def palm_stump(bm, rng):
    """What a felling leaves: a foot of ringed trunk, cut flat, pale wood on top."""
    sides, r0, r1, h = 10, 0.27, 0.2, 0.42
    low = [bm.verts.new(W(r0 * math.cos(2 * math.pi * q / sides), 0.0, r0 * math.sin(2 * math.pi * q / sides))) for q in range(sides)]
    mid = [bm.verts.new(W(r1 * 1.06 * math.cos(2 * math.pi * q / sides), h * 0.5, r1 * 1.06 * math.sin(2 * math.pi * q / sides))) for q in range(sides)]
    top = [bm.verts.new(W(r1 * math.cos(2 * math.pi * q / sides), h, r1 * math.sin(2 * math.pi * q / sides))) for q in range(sides)]
    for a, b, mat in ((low, mid, "BC_PalmBarkDark"), (mid, top, "BC_PalmBark")):
        for q in range(sides):
            bm.faces.new((a[q], a[(q + 1) % sides], b[(q + 1) % sides], b[q])).material_index = m(mat)
    bm.faces.new(top[::-1]).material_index = m("BC_Coconut")


def palm_shoot(bm, s, rng, fronds=4):
    """A shoot out of the sand: a few young fronds from one point (the sprout; bigger, the sapling's
    crown before it has a trunk to speak of)."""
    for q in range(fronds):
        fa = 2 * math.pi * q / fronds + rng.uniform(-0.3, 0.3)
        R = 0.75 * s * rng.uniform(0.85, 1.1)
        mat = m(("BC_Frond", "BC_FrondLight", "BC_FrondDeep")[q % 3])
        n = 4
        spine, left, right = [], [], []
        for j in range(n + 1):
            t = j / n
            out = R * t * 0.75
            yy = s * (1.25 * t - 0.75 * t * t)
            w = 0.16 * s * math.sin(math.pi * min(1.0, t * 0.92 + 0.08)) ** 0.8
            cx, cz = math.cos(fa) * out, math.sin(fa) * out
            sx, sz = -math.sin(fa) * w, math.cos(fa) * w
            spine.append(bm.verts.new(W(cx, yy, cz)))
            left.append(bm.verts.new(W(cx + sx, yy - 0.05 * s * math.sin(math.pi * t), cz + sz)))
            right.append(bm.verts.new(W(cx - sx, yy - 0.05 * s * math.sin(math.pi * t), cz - sz)))
        for j in range(n):
            bm.faces.new((spine[j], spine[j + 1], left[j + 1], left[j])).material_index = mat
            bm.faces.new((spine[j + 1], spine[j], right[j], right[j + 1])).material_index = mat


def look_finish(ob):
    """A look's colours into its vertices, on two finishes of its own: PT_PalmLeaf (the fronds: the
    game sways what is named Leaf) and PT_PalmBark."""
    bake_colors(ob)
    me = ob.data
    for i, mt in enumerate(list(me.materials)):
        leaf = mt.name == "BC_Palm"
        own = vc_material("PT_PalmLeaf" if leaf else "PT_PalmBark")
        own.use_backface_culling = not leaf
        me.materials[i] = own
    use_col(me)


def build_palm_looks(root):
    """palms.glb: `Tree_palm_<stage>` at the origin (the game's FellableTrees draws them instanced)."""
    old = bpy.data.collections.get(LOOKS)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    coll = bpy.data.collections.new(LOOKS)
    bpy.context.scene.collection.children.link(coll)
    rng = random.Random(97)
    made = []
    for stage in ("stump", "sprout", "sapling", "mature"):
        bm = bmesh.new()
        if stage == "stump":
            palm_stump(bm, rng)
        elif stage == "sprout":
            palm_shoot(bm, 0.6, rng)
        elif stage == "sapling":
            palm(bm, 0.0, 0.0, 0.5, rng, lean=0.2, ground=0.0, nuts=0)
        else:
            palm(bm, 0.0, 0.0, 1.0, rng, lean=0.42, ground=0.0)
        ob = make_object("Tree_palm_" + stage, bm, MATS, coll)
        look_finish(ob)
        made.append(ob)
    out = os.path.join(root, "client", "public", "models", "palms.glb")
    export(coll, out)
    info = {"glb": out, "bytes": os.path.getsize(out), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in made), "drawCalls": sum(len(o.data.materials) for o in made)}
    # (the looks are the game's alone: they leave the studio file as they came)
    for o in made:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(coll)
    return info


def build_nature(coll, rng):
    S = SCENE
    bm = bmesh.new()
    for p in S["shrubs"]:
        y = land_y(p["x"], p["z"])
        s = p["s"]
        for k in range(5):
            a = 2 * math.pi * k / 5 + rng.uniform(-0.3, 0.3)
            rr = rng.uniform(0.1, 0.3) * s
            blob(bm, p["x"] + rr * math.cos(a), y + rng.uniform(0.22, 0.42) * s, p["z"] + rr * math.sin(a), 0.3 * s, 0.26 * s, 0.3 * s, m=m("BC_Leaf") if k % 2 else m("BC_LeafLight"), cuts=2, noise=0.14, rng=rng, flat_bottom=y - 0.04)
        for k in range(4):
            a = rng.random() * 6.283
            blob(bm, p["x"] + 0.3 * s * math.cos(a), y + rng.uniform(0.3, 0.55) * s, p["z"] + 0.3 * s * math.sin(a), 0.045, 0.045, 0.045, m=m("BC_Blossom"), cuts=1)
    for p in S["rocks"]:
        y = land_y(p["x"], p["z"])
        s = p["s"]
        blob(bm, p["x"], y + 0.3 * s, p["z"], 0.55 * s, 0.5 * s, 0.5 * s, m=m("BC_Rock"), cuts=3, noise=0.2, rng=rng, flat_bottom=y - 0.3)
        blob(bm, p["x"] + 0.3 * s, y + 0.12 * s, p["z"] + 0.25 * s, 0.3 * s, 0.24 * s, 0.28 * s, m=m("BC_RockDark"), cuts=2, noise=0.2, rng=rng, flat_bottom=y - 0.3)
        if shore_at(p["x"], p["z"]) > 0.5:
            blob(bm, p["x"] - 0.1 * s, y + 0.62 * s, p["z"] - 0.08 * s, 0.3 * s, 0.14 * s, 0.28 * s, m=m("BC_RockMoss"), cuts=2, noise=0.1, rng=rng)
    for w in S["driftwood"]:
        fr = Frame(w["x"], w["z"], w["yaw"])
        bar(bm, fr.p(-w["len"] / 2, 0.11, 0.0), fr.p(w["len"] / 2, 0.09, 0.0), 0.11, m("BC_Drift"), sides=8, r_end=0.07)
        bar(bm, fr.p(0.1, 0.14, 0.0), fr.p(0.32, 0.36, 0.2), 0.035, m("BC_DriftDark"), sides=5, r_end=0.015)
    make_object("Beach_Nature", bm, MATS, coll)


def clear_of_things(x, z, pad=0.0):
    """Open sand at (x, z): clear of what is built and of where people walk and sit."""
    S = SCENE
    near = lambda p, r: math.hypot(x - p["x"], z - p["z"]) < r + pad
    if near(S["bar"], 3.4) or near(S["firepit"], 2.6) or near(S["shack"], 2.6) or near(S["court"], S["court"]["r"] + 0.3) or near(S["arrival"], 1.6):
        return False
    if any(near(p, 0.5) for p in S["palms"] + S["hammockPalms"] + S["shrubs"]) or any(near(p, 0.7) for p in S["rocks"]) or any(near(p, 1.3) for p in S["loungers"]):
        return False
    a, b = S["pier"]["start"], S["pier"]["end"]
    t = max(0.0, min(1.0, ((x - a["x"]) * (b["x"] - a["x"]) + (z - a["z"]) * (b["z"] - a["z"])) / ((b["x"] - a["x"]) ** 2 + (b["z"] - a["z"]) ** 2)))
    return math.hypot(x - (a["x"] + (b["x"] - a["x"]) * t), z - (a["z"] + (b["z"] - a["z"]) * t)) > 2.0 + pad


def build_deco(coll, rng):
    """What is walked through: dune grass behind the beach (thicker up the dunes), shells and a
    starfish or two along the wet sand."""
    half = TERRAIN["half"]
    bm = bmesh.new()
    kit = nature()
    made = 0
    for _ in range(9000):
        if made >= 300:
            break
        x, z = rng.uniform(-half + 0.8, half - 0.8), rng.uniform(-half + 0.8, half - 0.8)
        d = shore_at(x, z)
        if d < 7.5 or not clear_of_things(x, z):
            continue
        if rng.random() > 0.25 + 0.75 * smooth(9.0, 16.0, d) * (0.4 + 0.6 * vnoise(x * 0.4, z * 0.4)):
            continue
        kit.grass_clump(bm, x, z, rng, m("BC_DuneGrass") if rng.random() < 0.6 else m("BC_DuneGrassDark"), h=rng.uniform(0.3, 0.55), blades=rng.randint(5, 8), spread=0.1)
        made += 1
    shells = 0
    for _ in range(4000):
        if shells >= 70:
            break
        x, z = rng.uniform(-half + 0.8, half - 0.8), rng.uniform(-half + 0.8, half - 0.8)
        d = shore_at(x, z)
        if d < 0.3 or d > 3.2 or not clear_of_things(x, z):
            continue
        if rng.random() < 0.12:
            for q in range(5):
                a = 2 * math.pi * q / 5
                blob(bm, x + 0.05 * math.cos(a), 0.012, z + 0.05 * math.sin(a), 0.045, 0.012, 0.02, m=m("BC_Star"), cuts=1)
        else:
            blob(bm, x, 0.015, z, rng.uniform(0.025, 0.05), 0.018, rng.uniform(0.02, 0.04), m=m(rng.choice(["BC_Shell", "BC_White", "BC_Coral", "BC_Stone"])), cuts=1)
        shells += 1
    make_object("Beach_Deco", bm, MATS, coll, lift="parts")


# --- the pier, the shack, the boat -------------------------------------------------------------------


def build_pier(coll, rng):
    P = SCENE["pier"]
    a0, a1 = P["start"], P["end"]
    yaw = math.atan2(a1["x"] - a0["x"], a1["z"] - a0["z"])
    fr = Frame(a0["x"], a0["z"], yaw, y=0.0)
    deck, half, hh, L, HL = P["deck"], P["half"], P["headHalf"], P["length"], P["headLen"]
    bm = bmesh.new()
    # the planks, across the way you walk
    a = 0.0
    k = 0
    while a < L - 0.01:
        w = min(0.24, L - a)
        hw = hh if a >= L - HL else half
        jig = rng.uniform(-0.03, 0.03)
        obox(bm, fr, a + 0.01, a + w - 0.01, deck - 0.05, deck, -hw + jig, hw + jig, m("BC_WoodPale") if k % 3 else m("BC_Wood"))
        a += w
        k += 1
    # the beams under them, and the piles down to the seabed
    for b in (-half + 0.2, half - 0.2):
        obox(bm, fr, 0.0, L, deck - 0.17, deck - 0.05, b - 0.06, b + 0.06, m("BC_WoodDark"))
    for b in (-hh + 0.2, hh - 0.2):
        obox(bm, fr, L - HL, L, deck - 0.17, deck - 0.05, b - 0.06, b + 0.06, m("BC_WoodDark"))
    piles = []
    a = 1.4
    while a < L - HL - 0.4:
        piles += [(a, -half + 0.08), (a, half - 0.08)]
        a += 2.3
    piles += [(L - HL + 0.25, -hh + 0.1), (L - HL + 0.25, hh - 0.1), (L - 0.2, -hh + 0.1), (L - 0.2, hh - 0.1), (L - 0.2, 0.0)]
    for a, b in piles:
        x, z = fr.xz(a, b)
        foot = ground_y(x, z) - 0.25
        top = deck + (0.5 if rng.random() < 0.6 else 0.08)
        bar(bm, W(x, foot, z), W(x, top, z), 0.085, m("BC_WoodDark"), sides=8)
        lathe(bm, x, z, [(0.0, top), (0.1, top), (0.1, top + 0.03), (0.0, top + 0.035)], segs=8, m=m("BC_Wood"), y0=0.0)
    # a rope along the head's posts, a lantern post, a ladder, a coil of rope and a crate
    head = [(L - HL + 0.25, -hh + 0.1), (L - 0.2, -hh + 0.1), (L - 0.2, 0.0), (L - 0.2, hh - 0.1)]
    for (p, q) in zip(head, head[1:]):
        pa, pb = fr.p(p[0], deck + 0.42, p[1]), fr.p(q[0], deck + 0.42, q[1])
        mid = pa.lerp(pb, 0.5) - Vector((0, 0, 0.1))
        bar(bm, pa, mid, 0.018, m("BC_Rope"), sides=5)
        bar(bm, mid, pb, 0.018, m("BC_Rope"), sides=5)
    lx, lz = fr.xz(L - HL + 0.25, -hh + 0.1)
    bar(bm, W(lx, deck, lz), W(lx, deck + 2.1, lz), 0.045, m("BC_WoodDark"), sides=6)
    bar(bm, W(lx, deck + 2.05, lz), fr.p(L - HL + 0.6, deck + 2.05, -hh + 0.1), 0.025, m("BC_Iron"), sides=5)
    lp = fr.p(L - HL + 0.6, deck + 1.82, -hh + 0.1)
    blob(bm, lp.x, lp.z, -lp.y, 0.09, 0.12, 0.09, m=m("BC_Lamp"), cuts=1)
    lathe(bm, lp.x, -lp.y, [(0.0, 0.0), (0.11, 0.0), (0.02, 0.07), (0.0, 0.07)], segs=8, m=m("BC_Iron"), y0=lp.z + 0.12)
    cp = fr.p(L - 1.0, deck, 1.6)
    lathe(bm, cp.x, -cp.y, [(0.0, 0.0), (0.2, 0.0), (0.2, 0.09), (0.09, 0.09), (0.09, 0.0), (0.0, 0.0)], segs=12, m=m("BC_Rope"), y0=cp.z)
    obox(bm, fr, L - 2.6, L - 2.1, deck, deck + 0.38, 1.5, 2.0, m("BC_Wood"))
    obox(bm, fr, L - 2.62, L - 2.08, deck + 0.38, deck + 0.41, 1.48, 2.02, m("BC_WoodDark"))
    make_object("Beach_Pier", bm, MATS, coll)


def build_shack(coll, rng):
    """The trader's shack: an open-fronted stall facing the sea. Three plank walls and a thatched
    roof, a counter across the front with the trader standing behind it (the eave is kept high and
    there is no awning: either would hide him from the camera)."""
    S = SCENE["shack"]
    fr = Frame(S["x"], S["z"], S["yaw"])
    w, dp = S["w"] / 2, S["dp"] / 2
    wall = 2.3
    bm = bmesh.new()
    # a raised plank floor; the back wall and the two sides
    obox(bm, fr, -dp - 0.1, dp + 0.1, 0.0, 0.14, -w - 0.1, w + 0.1, m("BC_WoodDark"))
    obox(bm, fr, -dp, -dp + 0.08, 0.14, wall, -w, w, m("BC_Wood"))
    for b in (-w, w - 0.08):
        obox(bm, fr, -dp, dp, 0.14, wall, b, b + 0.08, m("BC_Wood"))
    for k in range(9):
        a = -dp + 0.14 + k * (2 * dp - 0.28) / 8
        for b in (-w - 0.012, w):
            obox(bm, fr, a - 0.012, a + 0.012, 0.14, wall, b, b + 0.012, m("BC_WoodDark"))
    # the front: two corner posts, the counter between them, a lintel with a striped valance
    for b in (-w + 0.06, w - 0.06):
        bar(bm, fr.p(dp - 0.06, 0.14, b), fr.p(dp - 0.06, wall, b), 0.07, m("BC_WoodDark"), sides=8)
    obox(bm, fr, dp - 0.14, dp, 0.14, 0.92, -w + 0.1, w - 0.1, m("BC_Wood"))
    obox(bm, fr, dp - 0.3, dp + 0.26, 0.92, 0.98, -w + 0.02, w - 0.02, m("BC_WoodPale"))
    obox(bm, fr, dp - 0.1, dp, wall - 0.16, wall, -w, w, m("BC_WoodDark"))
    for k in range(8):
        b0 = -w + 0.1 + k * (2 * w - 0.2) / 8
        obox(bm, fr, dp, dp + 0.012, wall - 0.4, wall - 0.14, b0, b0 + (2 * w - 0.2) / 8, m("BC_Teal") if k % 2 else m("BC_White"))
    # inside: shelves on the back wall, a few crates and jars on them
    for y in (1.0, 1.55):
        obox(bm, fr, -dp + 0.08, -dp + 0.42, y, y + 0.04, -w + 0.2, w - 0.2, m("BC_WoodPale"))
    for k, (y, mat) in enumerate(((1.04, "BC_Bottle"), (1.04, "BC_BottleAmber"), (1.59, "BC_Glass"), (1.59, "BC_Coral"), (1.04, "BC_Teal"), (1.59, "BC_Yellow"))):
        p = fr.p(-dp + 0.25, y, -w + 0.5 + k * 0.42)
        lathe(bm, p.x, -p.y, [(0.0, 0.0), (0.07, 0.0), (0.07, 0.16), (0.04, 0.2), (0.0, 0.2)], segs=8, m=m(mat), y0=p.z)
    # on the counter: a pair of scales, a fish on ice
    obox(bm, fr, dp - 0.22, dp + 0.14, 0.98, 1.02, w - 0.9, w - 0.35, m("BC_Glass"))
    p = fr.p(dp - 0.04, 1.06, w - 0.62)
    blob(bm, p.x, p.z, -p.y, 0.16, 0.035, 0.06, m=m("BC_Coral"), cuts=2)
    p = fr.p(dp - 0.02, 0.98, -w + 0.55)
    lathe(bm, p.x, -p.y, [(0.0, 0.0), (0.12, 0.0), (0.03, 0.03), (0.03, 0.2), (0.14, 0.22), (0.0, 0.22)], segs=10, m=m("BC_Iron"), y0=p.z)
    # the roof: two thatched slopes, the ridge along the coast, the eaves high over the counter
    eave, ridge, over = wall - 0.04, wall + 0.95, 0.38
    for side in (-1, 1):
        oquad(bm, [fr.p(0.0, ridge, -w - 0.35), fr.p(side * (dp + over), eave, -w - 0.35), fr.p(side * (dp + over), eave, w + 0.35), fr.p(0.0, ridge, w + 0.35)][::side], m("BC_Thatch"), thick=0.12, under=m("BC_ThatchDark"))
    for b in (-w, w):
        bm.faces.new([bm.verts.new(fr.p(-dp, wall, b)), bm.verts.new(fr.p(dp, wall, b)), bm.verts.new(fr.p(0.0, ridge - 0.08, b))]).material_index = m("BC_WoodDark")
    bar(bm, fr.p(0.0, ridge + 0.02, -w - 0.4), fr.p(0.0, ridge + 0.02, w + 0.4), 0.06, m("BC_BambooDark"), sides=6)
    # a sign on a post beside it, buoys on the corner post, a crate of ice and a barrel out front
    sp = fr.p(dp + 0.5, 0.0, -w - 0.55)
    bar(bm, sp, sp + Vector((0, 0, 1.7)), 0.04, m("BC_WoodDark"), sides=6)
    obox(bm, fr, dp + 0.46, dp + 0.54, 1.25, 1.7, -w - 1.0, -w - 0.1, m("BC_WoodPale"))
    obox(bm, fr, dp + 0.54, dp + 0.55, 1.33, 1.62, -w - 0.9, -w - 0.2, m("BC_Navy"))
    for k, mat in enumerate(("BC_Red", "BC_White", "BC_Yellow")):
        p = fr.p(dp + 0.06, 1.75 - 0.22 * k, w + 0.02)
        blob(bm, p.x, p.z, -p.y, 0.1, 0.1, 0.1, m=m(mat), cuts=2)
    obox(bm, fr, dp + 0.5, dp + 1.0, 0.0, 0.3, w + 0.15, w + 0.75, m("BC_WoodPale"))
    obox(bm, fr, dp + 0.55, dp + 0.95, 0.3, 0.33, w + 0.2, w + 0.7, m("BC_Glass"))
    p = fr.p(-dp + 0.3, 0.0, -w - 0.5)
    lathe(bm, p.x, -p.y, [(0.0, 0.0), (0.22, 0.0), (0.26, 0.3), (0.22, 0.6), (0.0, 0.6)], segs=12, m=m("BC_Wood"), y0=p.z)
    make_object("Beach_Shack", bm, MATS, coll)


def boat_hull(bm, fr, L, beam, mats):
    """A fishing boat's hull in a frame (a: toward the bow): lofted sections from stern to bow, a
    deck inside the gunwale. `mats`: (hull, trim, under, deck)."""
    hull, trim, under, deck = mats
    stations = 9
    rows = []
    for k in range(stations):
        t = k / (stations - 1)
        a = -L / 2 + L * t
        # (full amidships, a transom at the stern, a rising, narrowing bow)
        bw = beam / 2 * (0.72 + 0.28 * math.sin(math.pi * min(1.0, t * 1.5) / 2)) * (1.0 if t < 0.62 else math.cos((t - 0.62) / 0.38 * math.pi / 2) ** 0.7 + 0.02)
        sheer = 0.72 + 0.5 * max(0.0, t - 0.55) ** 2 * 4
        keel = -0.5 + 0.38 * max(0.0, t - 0.7) / 0.3
        section = [(0.0, keel), (bw * 0.55, keel + 0.12), (bw * 0.95, 0.05), (bw, 0.42), (bw * 1.02, sheer - 0.1), (bw * 1.02, sheer)]
        rows.append([fr.p(a, y, b) for b, y in [(-q, y) for q, y in reversed(section[1:])] + section])
    vr = [[bm.verts.new(p) for p in row] for row in rows]
    n = len(vr[0])
    for r0, r1 in zip(vr, vr[1:]):
        for c in range(n - 1):
            f = bm.faces.new((r0[c], r1[c], r1[c + 1], r0[c + 1]))
            edge = min(c, n - 2 - c)
            f.material_index = trim if edge == 0 else (hull if edge <= 2 else under)
            f.smooth = edge > 0
    bm.faces.new(vr[0]).material_index = hull
    # the deck, a little under the gunwale
    for r0, r1, k in zip(rows, rows[1:], range(stations)):
        t0, t1 = k / (stations - 1), (k + 1) / (stations - 1)
        y0 = 0.5 + 0.5 * max(0.0, t0 - 0.55) ** 2 * 4
        y1 = 0.5 + 0.5 * max(0.0, t1 - 0.55) ** 2 * 4
        a0, a1 = -L / 2 + L * t0, -L / 2 + L * t1
        w0 = (r0[-1] - r0[0]).length / 2 / 1.02 - 0.04
        w1 = (r1[-1] - r1[0]).length / 2 / 1.02 - 0.04
        bm.faces.new([bm.verts.new(fr.p(a0, y0, -w0)), bm.verts.new(fr.p(a0, y0, w0)), bm.verts.new(fr.p(a1, y1, w1)), bm.verts.new(fr.p(a1, y1, -w1))]).material_index = deck


def build_boat(coll, rng):
    B = SCENE["boat"]
    # (moored bow to the sea, as the pier points)
    fr = Frame(B["x"], B["z"], B["yaw"], y=-0.08)
    bm = bmesh.new()
    boat_hull(bm, fr, 8.4, 2.8, (m("BC_Hull"), m("BC_HullTrim"), m("BC_HullUnder"), m("BC_Deck")))
    # the wheelhouse aft of midships, its windows, its roof
    obox(bm, fr, -2.3, -0.5, 0.5, 2.0, -0.85, 0.85, m("BC_Hull"))
    obox(bm, fr, -0.5, -0.47, 1.25, 1.8, -0.7, 0.7, m("BC_Glass"))
    for b in (-0.86, 0.83):
        obox(bm, fr, -2.0, -0.8, 1.25, 1.8, b, b + 0.03, m("BC_Glass"))
    obox(bm, fr, -2.45, -0.3, 2.0, 2.08, -1.0, 1.0, m("BC_HullTrim"))
    bar(bm, fr.p(-1.4, 2.08, 0.0), fr.p(-1.4, 4.1, 0.0), 0.05, m("BC_WoodDark"), sides=6)
    bar(bm, fr.p(-1.4, 3.2, 0.0), fr.p(1.2, 2.5, 0.0), 0.035, m("BC_WoodDark"), sides=5)
    lp = fr.p(-1.4, 4.2, 0.0)
    blob(bm, lp.x, lp.z, -lp.y, 0.08, 0.1, 0.08, m=m("BC_Lamp"), cuts=1)
    # on deck: a crate, a coil of rope, two rod holders at the stern, fenders over the pier's side
    obox(bm, fr, 1.2, 1.8, 0.56, 0.9, -0.4, 0.2, m("BC_Wood"))
    cp = fr.p(2.4, 0.66, 0.3)
    lathe(bm, cp.x, -cp.y, [(0.0, 0.0), (0.22, 0.0), (0.22, 0.08), (0.1, 0.08), (0.1, 0.0), (0.0, 0.0)], segs=12, m=m("BC_Rope"), y0=cp.z)
    for b in (-0.9, 0.9):
        bar(bm, fr.p(-3.7, 0.6, b), fr.p(-4.0, 1.5, b * 1.1), 0.02, m("BC_WoodDark"), sides=5)
    for a in (-2.0, 0.6, 2.4):
        p = fr.p(a, 0.36, -1.46)
        blob(bm, p.x, p.z, -p.y, 0.11, 0.2, 0.11, m=m("BC_Red"), cuts=2)
    make_object("Prop_Boat", bm, MATS, coll, origin=(B["x"], 0.0, B["z"]))


# --- one draw call a finish --------------------------------------------------------------------------

KEEP = set(EMISSION)


def slot_of(name):
    if name in KEEP:
        return name
    if name in PALM_FINISH:
        return PALM_FINISH[name]
    if name in DOUBLE_SIDED:
        return "BC_ClayDouble"
    return "BC_Sheen" if ROUGHNESS.get(name, 0.84) < 0.65 else "BC_Clay"


def bake_colors(ob, one=None):
    """Every face's own colour into the mesh's "Col" corner colours, its material replaced by its
    finish's (slot_of; or all by `one`). A palm keeps, in its UVs, each vertex's height over the
    ground its tree stands on (the game sways the fronds by it)."""
    me = ob.data
    names = [mt.name for mt in me.materials]
    if not names or names in (["BC_Sand"], ["BC_Sea"]):
        return
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    lifts = me.attributes.get("lift")
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    palms = ob.name.startswith("Beach_Palms") and lifts is not None
    uv = me.uv_layers.new(name="UVMap") if palms else None
    lift_of = [d.value for d in lifts.data] if palms else None
    world = ob.matrix_world
    slots, index, face_slot = [], {}, []
    for poly in me.polygons:
        name = names[min(poly.material_index, len(names) - 1)]
        s = one or slot_of(name)
        c = (1.0, 1.0, 1.0) if s in KEEP else lin(PALETTE[name])
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
            if uv is not None:
                vi = me.loops[li].vertex_index
                uv.data[li].uv = (0.0, max(0.0, (world @ me.vertices[vi].co).z - lift_of[vi]))
        if s not in index:
            index[s] = len(slots)
            slots.append(s)
        face_slot.append(index[s])
    me.materials.clear()
    for s in slots:
        if s in KEEP:
            me.materials.append(material(s))
        else:
            mat = vc_material(s)
            mat.use_backface_culling = s not in ("BC_ClayDouble", "BC_Palm")
            if s == "BC_Sheen":
                next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Roughness"].default_value = 0.4
            me.materials.append(mat)
    for poly, i in zip(me.polygons, face_slot):
        poly.material_index = i
    if lifts is not None:
        me.attributes.remove(me.attributes.get("lift"))
    use_col(me)


def fuse(coll):
    statics = []
    for ob in list(coll.all_objects):
        if ob.type != "MESH" or ob.name in ("Beach_Ground", "Beach_Sea"):
            continue
        if ob.name.startswith("Prop_"):
            bake_colors(ob, one="BC_Clay")
            continue
        bake_colors(ob)
        if ob.name == "Beach_PalmsRaw":
            ob.name = "Beach_Palms"
            ob.data.name = "Beach_PalmsMesh"
            continue
        statics.append(ob)
    bpy.context.view_layer.update()
    target = statics[0]
    if len(statics) > 1:
        with bpy.context.temp_override(object=target, active_object=target, selected_objects=statics, selected_editable_objects=statics):
            bpy.ops.object.join()
    target.name = "Beach_Static"
    target.data.name = "Beach_StaticMesh"
    use_col(target.data)
    meshes = [o for o in coll.all_objects if o.type == "MESH"]
    return {"objects": len(meshes), "drawCalls": sum(len(o.data.materials) for o in meshes), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes), "static": [mt.name for mt in target.data.materials]}


def read_beach_cushions(root):
    import re
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    out = {}
    for name in ("stool", "log", "lounger", "hammock"):
        mm = re.search(rf"\b{name}: \{{ y: (-?[0-9.]+), h: ([0-9.]+) \}}", src)
        y, h = float(mm.group(1)), float(mm.group(2))
        out[name] = {"y": y, "h": h, "top": y + h / 2}
    return out


def build(root):
    purge()
    global TERRAIN, SCENE
    TERRAIN = read_terrain(root)
    SCENE = TERRAIN["scene"]
    cushions = read_beach_cushions(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    rng = random.Random(41)
    build_ground(coll)
    build_sea(coll)
    build_bar(coll, cushions, rng)
    build_firepit(coll, cushions, rng)
    build_loungers(coll, cushions, rng)
    build_hammocks(coll, cushions)
    build_palms(coll, rng)
    build_nature(coll, rng)
    build_deco(coll, rng)
    build_pier(coll, rng)
    build_shack(coll, rng)
    build_boat(coll, rng)
    return coll


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll = build(root)
        fused = fuse(coll)
        out = os.path.join(root, "client", "public", "models", "beach.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "fused": fused, "summary": summary(coll)}
        # (the last step of the export: EXT_meshopt_compression, scripts/blender/meshopt_pack.py)
        import importlib, sys
        here = os.path.join(root, "scripts", "blender")
        if here not in sys.path:
            sys.path.insert(0, here)
        import meshopt_pack as _pack
        result["meshopt"] = importlib.reload(_pack).meshopt_pack(root, out)
        result["palms"] = build_palm_looks(root)
        result["palms"]["meshopt"] = _pack.meshopt_pack(root, result["palms"]["glb"])
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1)[:4000])
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
