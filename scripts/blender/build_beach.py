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
    "BC_Stone": "#9C958B", "BC_StoneDark": "#6F6A63", "BC_Pearl": "#E9E2F0", "BC_PearlDark": "#B5ABC4", "BC_NacrePink": "#F6D0E0", "BC_NacreTeal": "#BFEDE6", "BC_IronBark": "#2E3336", "BC_IronBarkLight": "#474E50", "BC_IronLeaf": "#2F5D55", "BC_IronLeafLight": "#4F8573", "BC_IronMoss": "#7C9C84", "BC_Reef": "#DCC8A8", "BC_ReefDark": "#B9A283", "BC_Rock": "#8E8679", "BC_RockDark": "#615C54", "BC_RockMoss": "#7C8A62",
    "BC_Char": "#2B2623", "BC_Ash": "#5A544E",
    "BC_PalmBark": "#8E6E4C", "BC_PalmBarkDark": "#6F5439", "BC_Frond": "#4E9A4A", "BC_FrondLight": "#7DBB55", "BC_FrondDeep": "#2F7240", "BC_Coconut": "#5B3F2A",
    "BC_GroveFloor": "#B7B27C", "BC_GroveLitter": "#9C8A5E", "BC_RockGround": "#B3A68C", "BC_Weed": "#5E6B3A", "BC_WeedDark": "#4A4A2E", "BC_Agave": "#8FB29A", "BC_AgaveTip": "#C9DDB8", "BC_Banana": "#58A04C", "BC_BananaLight": "#8CC864", "BC_Morning": "#B58BE0", "BC_Hibiscus": "#E8505A", "BC_Leaf": "#3F8A55", "BC_LeafLight": "#68AE5E", "BC_DuneGrass": "#B9C67C", "BC_DuneGrassDark": "#93A860", "BC_Blossom": "#F08FA6",
    "BC_Canvas": "#F4EDE0", "BC_Red": "#D9534F", "BC_Teal": "#3AA6A0", "BC_Yellow": "#F2C14E", "BC_Coral": "#F08A6B", "BC_White": "#F7F3EA", "BC_Navy": "#2C4A6E", "BC_Pink": "#F2A7B5",
    "BC_Glass": "#BFE3E8", "BC_Bottle": "#5FA37A", "BC_BottleAmber": "#C7873A", "BC_Iron": "#4A4F55", "BC_Shell": "#F3D9C9", "BC_Star": "#F29A6B",
    "BC_Hull": "#F4EFE4", "BC_HullTrim": "#C94C3F", "BC_HullUnder": "#2F5D6B", "BC_Deck": "#C79A66",
    "BC_Bulb": "#FFD98A", "BC_Ember": "#FF7A2E", "BC_Lamp": "#FFE2A6",
    # the remake's strand: the beach forest, the scrub, the creek, the rocky point
    "BC_PineNeedle": "#7FAA86", "BC_PineNeedleLight": "#A6C69A", "BC_PineNeedleDeep": "#5C8C72", "BC_PineBark": "#7C6C5A", "BC_PineBarkDark": "#584A3C", "BC_PineLitter": "#B08A5E", "BC_PineCone": "#6E5238",
    "BC_AlmondLeaf": "#3F8F4C", "BC_AlmondLight": "#72B65C", "BC_AlmondRed": "#C9583C", "BC_AlmondBark": "#8E7C68", "BC_AlmondBarkDark": "#6A5A4A",
    "BC_Pandan": "#5FA554", "BC_PandanLight": "#98C96C", "BC_PandanRoot": "#B99D74", "BC_PandanFruit": "#E28C3C",
    "BC_Scaevola": "#7FBA7A", "BC_ScaevolaLight": "#ABD69C", "BC_HibiscusYellow": "#F3D452",
    "BC_Mangrove": "#2F6C4C", "BC_MangroveLight": "#51905C", "BC_MangroveRoot": "#7C6854", "BC_Mud": "#9A8E6E", "BC_MudDark": "#6F6852",
    "BC_Barnacle": "#DAD3C3", "BC_PoolBed": "#7FA89A", "BC_Granite": "#A49C92", "BC_GraniteDark": "#77716A", "BC_GraniteWet": "#57534E",
}
ROUGHNESS = {"BC_Glass": 0.3, "BC_Bottle": 0.35, "BC_BottleAmber": 0.35, "BC_Iron": 0.6, "BC_Hull": 0.55, "BC_HullTrim": 0.55}
EMISSION = {"BC_Bulb": 2.6, "BC_Ember": 2.2, "BC_Lamp": 2.4}
DOUBLE_SIDED = {"BC_Pandan", "BC_PandanLight", "BC_AlmondLeaf", "BC_AlmondLight", "BC_AlmondRed", "BC_Banana", "BC_BananaLight", "BC_Agave", "BC_AgaveTip", "BC_Frond", "BC_FrondLight", "BC_FrondDeep", "BC_DuneGrass", "BC_DuneGrassDark", "BC_Canvas", "BC_Red", "BC_Teal", "BC_Yellow", "BC_Pink", "BC_Thatch", "BC_ThatchDark", "BC_White", "BC_Coral"}
MATS = list(PALETTE)
PALM_FINISH = {"BC_PineNeedle": "BC_Palm", "BC_PineNeedleLight": "BC_Palm", "BC_PineNeedleDeep": "BC_Palm", "BC_PineBark": "BC_PalmBark", "BC_PineBarkDark": "BC_PalmBark", "BC_PineCone": "BC_PalmBark", "BC_Frond": "BC_Palm", "BC_FrondLight": "BC_Palm", "BC_FrondDeep": "BC_Palm", "BC_Coconut": "BC_PalmBark", "BC_PalmBark": "BC_PalmBark", "BC_PalmBarkDark": "BC_PalmBark"}

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
        pools.append((p["x"] + 0.15, p["z"] - 0.05, (0.95 if p.get("kind") == "pandanus" else 0.6) * p["s"], 0.22))
    # the beach forest: a sea pine's thin, open shade; a sea almond's broad deep one; the mangroves'
    for p in S.get("seaPines", []):
        pools.append((p["x"] + 0.8 * p["s"], p["z"] - 0.3 * p["s"], 1.7 * p["s"], 0.14))
        pools.append((p["x"], p["z"], 0.5, 0.2))
    for p in S.get("almonds", []):
        pools.append((p["x"] + 0.6 * p["s"], p["z"] - 0.25 * p["s"], 2.9 * p["s"], 0.26))
    for p in S.get("mangroves", []):
        pools.append((p["x"] + 0.2, p["z"] - 0.08, 1.1 * p["s"], 0.24))
    for p in S["rocks"]:
        pools.append((p["x"] + 0.2, p["z"] - 0.08, 0.75 * p["s"], 0.24))
    # (the fossil reef rock's nodes: the game draws them, their shade is the ground's)
    for p in S.get("reef", []):
        pools.append((p["x"] + 0.2, p["z"] - 0.08, 0.85, 0.24))
    for p in S["parasols"]:
        pools.append((p["x"] + 0.7, p["z"] - 0.3, 1.3, 0.2))
    b = S["bar"]
    pools.append((b["x"], b["z"], 2.6, 0.16))
    pools.append((S["shack"]["x"] + 0.5, S["shack"]["z"] - 0.2, 2.3, 0.22))
    for l in S["loungers"]:
        pools.append((l["x"], l["z"], 0.8, 0.18))
    return pools


GROVE_FLOOR = GROVE_LITTER = ROCK_GROUND = WRACK = None
STRAND = None


def creek_inside(x, z):
    """How far inside the creek's water (x, z) is (negative: on its bank): shared/worlds/beach.ts."""
    c = SCENE["creek"]
    best = c["pool"]["r"] - math.hypot(x - c["pool"]["x"], z - c["pool"]["z"])
    pts = c["points"]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        dx, dz = b["x"] - a["x"], b["z"] - a["z"]
        t = max(0.0, min(1.0, ((x - a["x"]) * dx + (z - a["z"]) * dz) / (dx * dx + dz * dz or 1.0)))
        best = max(best, c["half"] * (1 - 0.1 * i) - math.hypot(x - a["x"] - dx * t, z - a["z"] - dz * t))
    return best


def pool_inside(x, z):
    """How far inside a tide pool (x, z) is (negative: outside all of them)."""
    return max([p["r"] - math.hypot(x - p["x"], z - p["z"]) for p in SCENE["tidePools"]] or [-9.0])


def ground_color(x, z, tones, pools):
    global GROVE_FLOOR, GROVE_LITTER, ROCK_GROUND, WRACK, STRAND
    if STRAND is None:
        STRAND = {k: lin(PALETTE[k]) for k in ("BC_PineLitter", "BC_Mud", "BC_MudDark", "BC_PoolBed", "BC_Granite", "BC_GraniteWet", "BC_AlmondRed", "BC_SandGreen")}
    if GROVE_FLOOR is None:
        GROVE_FLOOR, GROVE_LITTER, ROCK_GROUND, WRACK = (lin(PALETTE[k]) for k in ("BC_GroveFloor", "BC_GroveLitter", "BC_RockGround", "BC_WeedDark"))
    dry, pale, wet, ash, green, bed, deep = tones
    d = shore_at(x, z)
    y = ground_y(x, z)
    n1 = vnoise(x * 0.35 + 11.0, z * 0.35 - 4.0)
    n2 = vnoise(x * 1.7 - 3.0, z * 1.7 + 9.0)
    ck = creek_inside(x, z)
    tp = pool_inside(x, z)
    if d < 0:
        # the seabed: wet sand at the line, darker and bluer with depth
        c = mixc(wet, bed, smooth(0.0, 1.6, -d))
        c = mixc(c, deep, smooth(1.2, 8.0, -d))
        # the creek's bed is mud, darker down its middle; a tide pool's is stone gone green
        if ck > -0.2:
            c = mixc(c, mixc(STRAND["BC_Mud"], STRAND["BC_MudDark"], smooth(0.0, 0.9, ck)), 0.9)
        if tp > -0.1:
            c = mixc(c, mixc(STRAND["BC_GraniteWet"], STRAND["BC_PoolBed"], smooth(0.0, 0.45, tp)), 0.9)
        return c
    c = mixc(dry, pale, smooth(0.75, 1.5, y) * 0.8)
    # sparse beach grass's ground behind the dunes
    c = mixc(c, green, 0.55 * smooth(11.0, 17.0, d) * smooth(0.35, 0.7, n1))
    # the groves' floor: under the palms the sand goes over to leaf litter and thin grass, in one
    # patch a grove (the nearer the trunks, the more), its edge ragged
    g = 0.0
    for p in SCENE["palms"] + SCENE["hammockPalms"]:
        q = math.hypot(x - p["x"], z - p["z"])
        if q < 3.4:
            g += smooth(3.4, 0.6, q)
    if g > 0:
        g = min(1.0, g * 0.62) * (0.55 + 0.45 * n2)
        c = mixc(c, mixc(GROVE_FLOOR, GROVE_LITTER, smooth(0.35, 0.75, n1)), 0.8 * g)
    # the beach forest's floor: a brown mat of fallen needles under the sea pines, thickest at the
    # trunks, its edge ragged; red and yellow leaves under the sea almonds
    g = 0.0
    for p in SCENE.get("seaPines", []):
        q = math.hypot(x - p["x"], z - p["z"])
        if q < 3.6 * p["s"]:
            g += smooth(3.6 * p["s"], 0.5, q)
    if g > 0:
        c = mixc(c, STRAND["BC_PineLitter"], 0.72 * min(1.0, g * 0.7) * (0.5 + 0.5 * n2))
    for p in SCENE.get("almonds", []):
        q = math.hypot(x - p["x"], z - p["z"])
        if q < 3.0 * p["s"]:
            c = mixc(c, mixc(GROVE_LITTER, STRAND["BC_AlmondRed"], 0.35 * smooth(0.55, 0.8, n2)), 0.6 * smooth(3.0 * p["s"], 0.8, q) * (0.5 + 0.5 * n1))
    # the creek's banks: wet mud at the water, greener just above it
    if ck > -2.2:
        c = mixc(c, STRAND["BC_SandGreen"], 0.45 * smooth(-2.2, -0.9, ck) * (0.5 + 0.5 * n2))
        c = mixc(c, STRAND["BC_Mud"], 0.85 * smooth(-1.0 - 0.4 * n1, -0.1, ck))
    # the rocky point's shelf: bare stone round the tide pools, wet at their rims
    if tp > -1.5:
        c = mixc(c, STRAND["BC_Granite"], 0.8 * smooth(-1.5 - 0.5 * n1, -0.5, tp))
        c = mixc(c, STRAND["BC_GraniteWet"], 0.7 * smooth(-0.3, 0.0, tp))
    # the outcrops: stony ground round the rocks and the reef
    r_near = min([math.hypot(x - p["x"], z - p["z"]) - 0.4 * p.get("s", 1.0) for p in SCENE["rocks"] + SCENE.get("reef", [])] or [9.0])
    if r_near < 2.1 and d > -0.5:
        c = mixc(c, ROCK_GROUND, 0.7 * smooth(2.1, 0.2, r_near) * (0.6 + 0.4 * n2))
    # the high tide's line: a thin drift of weed and shell grit, wandering, broken
    wl = 2.15 + 0.7 * (n1 - 0.5) + 0.25 * math.sin(x * 0.9 + z * 0.6)
    c = mixc(c, WRACK, 0.34 * smooth(0.22, 0.0, abs(d - wl)) * smooth(0.3, 0.6, vnoise(x * 0.9 + 40.0, z * 0.9)))
    # wind ripples over the dry sand, faint
    if d > 3.0:
        c = [v * (1.0 + 0.022 * math.sin((x * 0.83 - z * 0.56) * 5.2 + 2.2 * n1)) for v in c]
    # the wet band at the waterline, its edge wandering
    c = mixc(c, wet, smooth(1.5 + 0.5 * n1, 0.15, d))
    # the one worn place: ash-grey sand round the firepit
    f = SCENE["firepit"]
    r = math.hypot(x - f["x"], z - f["z"])
    c = mixc(c, ash, 0.75 * smooth(2.3 + 0.4 * n2, 0.7, r))
    # a slow mottle and a fine one
    k = 1.0 + 0.06 * (n1 - 0.5) + 0.04 * (n2 - 0.5) + 0.03 * (vnoise(x * 4.3 + 7.0, z * 4.3 - 2.0) - 0.5)
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
                # (the sea's sheet is opaque: the bed further out than a wave draws back is never seen)
                if all(shore_at(v.co.x, -v.co.y) < -1.6 for v in tri):
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
        if a.co.z < -0.05 and b.co.z < -0.05:
            continue
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

    def vert(x, z, r, still=0.0):
        v = bm.verts.new(W(x, 0.0, z))
        # (green: still water, the creek's and the tide pools': no surf there, and a brackish colour)
        data[v] = (r, still, 0.0, 1.0)
        return v

    stride = 2
    idx = list(range(0, n + 1, stride))
    if idx[-1] != n:
        idx.append(n)
    shore = TERRAIN["shore"]
    at = lambda i, k: shore[k * (n + 1) + i]
    made = {}

    def gv(i, k):
        v = made.get((i, k))
        if v is None:
            v = made[(i, k)] = vert(-half + i * cell, -half + k * cell, out_of(at(i, k)), float(TERRAIN["still"][k * (n + 1) + i]))
        return v

    def cell_shores(i0, k0, i1, k1):
        return [at(i, k) for i in (i0, i1) for k in (k0, k1)]

    for a, b in zip(idx, idx[1:]):
        for c, d in zip(idx, idx[1:]):
            # (near the land the sheet follows the grid cell for cell: the waterline, the creek and
            # the tide pools are narrow; out at sea every other corner is enough)
            if max(cell_shores(a, c, b, d)) > -2.5 and b - a == 2 and d - c == 2:
                for i in (a, a + 1):
                    for k in (c, c + 1):
                        if min(cell_shores(i, k, i + 1, k + 1)) <= 1.2:
                            bm.faces.new([gv(i, k), gv(i + 1, k), gv(i + 1, k + 1), gv(i, k + 1)])
                continue
            # (only where the sea shows: a cell wholly up the sand is left out)
            if min(cell_shores(a, c, b, d)) > 1.2:
                continue
            bm.faces.new([gv(a, c), gv(b, c), gv(b, d), gv(a, d)])
    grid = {(i, k): at(i, k) for i in idx for k in idx}
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


def ironwood(bm, s, rng, crown=True):
    """A Drowned Ironwood at the origin, `s` its size: a black trunk twisting up off stilt roots, a few
    crooked boughs, dark sea-green leaves in clumps, moss hanging from them."""
    H = 3.3 * s
    # the stilt roots: arches from the trunk out to the sand
    for q in range(6):
        a = 2 * math.pi * q / 6 + rng.uniform(-0.3, 0.3)
        r = rng.uniform(0.55, 0.85) * s
        knee = W(math.cos(a) * r * 0.55, 0.42 * s, math.sin(a) * r * 0.55)
        bar(bm, W(math.cos(a) * 0.1 * s, 0.75 * s, math.sin(a) * 0.1 * s), knee, 0.075 * s, m("BC_IronBark"), sides=6, r_end=0.06 * s)
        bar(bm, knee, W(math.cos(a) * r, -0.05, math.sin(a) * r), 0.06 * s, m("BC_IronBark"), sides=6, r_end=0.04 * s)
    # the trunk: three leaning lengths, thick and ridged
    pts = [(0.0, 0.5 * s, 0.0)]
    x = z = 0.0
    for j in range(3):
        a = rng.random() * 6.283
        x += math.cos(a) * 0.16 * s
        z += math.sin(a) * 0.16 * s
        pts.append((x, (0.5 + (H - 0.5) * (j + 1) / 3) * s if False else 0.5 * s + (H - 0.5 * s) * (j + 1) / 3, z))
    for j in range(3):
        r0, r1 = (0.27 - 0.06 * j) * s, (0.21 - 0.06 * j) * s
        bar(bm, W(*pts[j]), W(*pts[j + 1]), r0, m("BC_IronBark") if j % 2 == 0 else m("BC_IronBarkLight"), sides=8, r_end=r1)
    if not crown:
        return pts
    top = pts[-1]
    for q in range(5):
        a = 2 * math.pi * q / 5 + rng.uniform(-0.35, 0.35)
        r = rng.uniform(0.9, 1.5) * s
        elbow = (top[0] + math.cos(a) * r * 0.5, top[1] + rng.uniform(0.1, 0.45) * s, top[2] + math.sin(a) * r * 0.5)
        end = (top[0] + math.cos(a) * r, top[1] + rng.uniform(-0.1, 0.5) * s, top[2] + math.sin(a) * r)
        bar(bm, W(*top), W(*elbow), 0.09 * s, m("BC_IronBark"), sides=6, r_end=0.065 * s)
        bar(bm, W(*elbow), W(*end), 0.065 * s, m("BC_IronBarkLight"), sides=5, r_end=0.03 * s)
        for k in range(2):
            px = end[0] + rng.uniform(-0.25, 0.25) * s
            pz = end[2] + rng.uniform(-0.25, 0.25) * s
            blob(bm, px, end[1] + 0.12 * s + 0.16 * k * s, pz, rng.uniform(0.42, 0.6) * s, rng.uniform(0.22, 0.3) * s, rng.uniform(0.42, 0.6) * s, m=m("BC_IronLeaf") if (q + k) % 2 else m("BC_IronLeafLight"), cuts=2, noise=0.16, rng=rng)
        # (a strand of moss hanging off the bough)
        if q % 2 == 0:
            mid = ((elbow[0] + end[0]) / 2, (elbow[1] + end[1]) / 2, (elbow[2] + end[2]) / 2)
            bar(bm, W(*mid), W(mid[0], mid[1] - rng.uniform(0.5, 0.9) * s, mid[2]), 0.03 * s, m("BC_IronMoss"), sides=4, r_end=0.008)
    blob(bm, top[0], top[1] + 0.35 * s, top[2], 0.62 * s, 0.34 * s, 0.62 * s, m=m("BC_IronLeaf"), cuts=2, noise=0.16, rng=rng)
    return pts


def ironwood_looks(coll, rng):
    """`Tree_ironwood_<stage>`: a stump on its roots, a shoot, a young tree, the grown one. One finish,
    `PT_IronLeaf` (its colours in the mesh; the game sways what is named Leaf, more the higher up)."""
    made = []
    for stage in ("stump", "sprout", "sapling", "mature"):
        bm = bmesh.new()
        if stage == "stump":
            for q in range(6):
                a = 2 * math.pi * q / 6 + 0.3
                bar(bm, W(math.cos(a) * 0.1, 0.32, math.sin(a) * 0.1), W(math.cos(a) * 0.72, -0.05, math.sin(a) * 0.72), 0.07, m("BC_IronBark"), sides=6, r_end=0.04)
            bar(bm, W(0.0, 0.0, 0.0), W(0.0, 0.5, 0.0), 0.3, m("BC_IronBark"), sides=9, r_end=0.26)
            bar(bm, W(0.0, 0.5, 0.0), W(0.0, 0.52, 0.0), 0.26, m("BC_IronBarkLight"), sides=9, r_end=0.22)
        elif stage == "sprout":
            bar(bm, W(0.0, 0.0, 0.0), W(0.04, 0.4, 0.0), 0.035, m("BC_IronBark"), sides=5, r_end=0.02)
            blob(bm, 0.04, 0.46, 0.0, 0.16, 0.1, 0.16, m=m("BC_IronLeafLight"), cuts=1, noise=0.15, rng=rng)
        elif stage == "sapling":
            ironwood(bm, 0.45, rng)
        else:
            ironwood(bm, 1.0, rng)
        ob = make_object("Tree_ironwood_" + stage, bm, MATS, coll)
        bake_colors(ob, one="BC_Clay")
        own = vc_material("PT_IronLeaf")
        for i in range(len(ob.data.materials)):
            ob.data.materials[i] = own
        use_col(ob.data)
        made.append(ob)
    return made


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
    # (the Hidden Cove's Drowned Ironwood rides in the same file: the game's fellable looks off the camp maps)
    made += ironwood_looks(coll, rng)
    # (the beach forest's Sea Pine too)
    made += sea_pine_looks(coll, random.Random(131))
    out = os.path.join(root, "client", "public", "models", "palms.glb")
    export(coll, out)
    info = {"glb": out, "bytes": os.path.getsize(out), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in made), "drawCalls": sum(len(o.data.materials) for o in made)}
    # (the looks are the game's alone: they leave the studio file as they came)
    for o in made:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(coll)
    return info


# --- the fossil reef rock's two looks, for the game's prospecting (reef.glb) ----------------------------
def reef_rock(bm, rng):
    """A block of old reef, set hard: a rounded pale rock, shells and coral heads standing out of its
    seaward face (game +z: the game turns each node to the sea), a darker foot."""
    blob(bm, 0.0, 0.5, 0.0, 0.6, 0.56, 0.5, m=m("BC_Reef"), cuts=3, noise=0.16, rng=rng, flat_bottom=-0.05)
    blob(bm, -0.34, 0.2, -0.08, 0.36, 0.26, 0.34, m=m("BC_ReefDark"), cuts=2, noise=0.18, rng=rng, flat_bottom=-0.05)
    blob(bm, 0.36, 0.16, 0.1, 0.3, 0.2, 0.28, m=m("BC_ReefDark"), cuts=2, noise=0.18, rng=rng, flat_bottom=-0.05)
    # shells in the face: pale fans pressed into the rock
    for k in range(7):
        a = rng.uniform(-1.1, 1.1)
        h = rng.uniform(0.22, 0.86)
        r = 0.5 * math.cos(a * 0.55) * (1.0 - 0.45 * abs(h - 0.5))
        sz = rng.uniform(0.06, 0.11)
        blob(bm, math.sin(a) * r, h, math.cos(a) * r * 0.86, sz, sz, 0.035, m=m("BC_Shell" if k % 3 else "BC_White"), cuts=1)
    # coral heads on its shoulders
    for k in range(4):
        a = rng.uniform(-1.4, 1.4)
        blob(bm, math.sin(a) * 0.34, 0.92 + rng.uniform(-0.06, 0.05), math.cos(a) * 0.22, 0.1, 0.09, 0.1, m=m("BC_Coral" if k % 2 else "BC_Star"), cuts=1, noise=0.2, rng=rng)


def reef_rubble(bm, rng):
    """What a break leaves until the rock grows back: a low heap of pale stones."""
    for k in range(6):
        a = 2 * math.pi * k / 6 + rng.uniform(-0.4, 0.4)
        r = rng.uniform(0.08, 0.36)
        sz = rng.uniform(0.12, 0.22)
        blob(bm, math.cos(a) * r, sz * 0.5, math.sin(a) * r, sz, sz * 0.7, sz, m=m("BC_Reef" if k % 2 else "BC_ReefDark"), cuts=1, noise=0.25, rng=rng, flat_bottom=-0.03)
    blob(bm, 0.05, 0.1, 0.12, 0.07, 0.05, 0.03, m=m("BC_Shell"), cuts=1)


def build_life_looks(root):
    """beach_life.glb: the little lives the game draws instanced (client/src/scene/BeachLife.tsx), each
    at the origin facing +z: `Fauna_Gull_Body` / `_WingL` / `_WingR` (a gull on the wing, each wing's
    origin its shoulder) and `Fauna_SandCrab`. Names no other world's model has."""
    name = "BeachLifeLooks"
    old = bpy.data.collections.get(name)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    made = []
    # the gull: 0.42 m long, white, a grey back, black wingtips, a yellow bill
    made.append(fauna_node("Fauna_Gull_Body", [
        (lambda bm: blob(bm, 0.0, 0.0, 0.0, 0.075, 0.065, 0.19, m=0, cuts=3), "#F4F4F0"),
        (lambda bm: blob(bm, 0.0, 0.028, -0.03, 0.06, 0.03, 0.13, m=0, cuts=2), "#B9C0C6"),
        (lambda bm: blob(bm, 0.0, 0.03, 0.19, 0.05, 0.048, 0.055, m=0, cuts=2), "#F7F7F3"),
        (lambda bm: blob(bm, 0.0, 0.02, 0.255, 0.012, 0.012, 0.035, m=0, cuts=1), "#E8B33C"),
        (lambda bm: blob(bm, 0.03, 0.045, 0.215, 0.008, 0.008, 0.006, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, -0.03, 0.045, 0.215, 0.008, 0.008, 0.006, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, 0.0, 0.0, -0.22, 0.05, 0.012, 0.07, m=0, cuts=1), "#F0F0EC"),
    ], coll))
    for sx, nm in ((1, "Fauna_Gull_WingL"), (-1, "Fauna_Gull_WingR")):
        made.append(fauna_node(nm, [
            (lambda bm, sx=sx: blob(bm, sx * 0.2, 0.03, 0.0, 0.17, 0.012, 0.085, m=0, cuts=2), "#C3CAD0"),
            (lambda bm, sx=sx: blob(bm, sx * 0.43, 0.03, -0.03, 0.13, 0.01, 0.06, m=0, cuts=2), "#AEB6BD"),
            (lambda bm, sx=sx: blob(bm, sx * 0.57, 0.03, -0.06, 0.05, 0.008, 0.035, m=0, cuts=1), "#26262A"),
        ], coll, pivot=(sx * 0.06, 0.03, 0.0)))
    # the crab: 0.16 m across, a flat coral shell, two claws held up, six legs, eyes on stalks
    parts = [
        (lambda bm: blob(bm, 0.0, 0.045, 0.0, 0.08, 0.035, 0.06, m=0, cuts=2), "#E0704A"),
        (lambda bm: blob(bm, 0.0, 0.062, -0.01, 0.055, 0.02, 0.04, m=0, cuts=1), "#EE8A60"),
        (lambda bm: blob(bm, 0.03, 0.09, 0.05, 0.01, 0.014, 0.01, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, -0.03, 0.09, 0.05, 0.01, 0.014, 0.01, m=0, cuts=1), "#1B1818"),
    ]
    for sx in (1, -1):
        parts.append((lambda bm, sx=sx: blob(bm, sx * 0.1, 0.07, 0.06, 0.035, 0.028, 0.03, m=0, cuts=1), "#F0906A"))
        for k in range(3):
            parts.append((lambda bm, sx=sx, k=k: cylinder(bm, W(sx * 0.07, 0.04, 0.02 - k * 0.035), W(sx * 0.13, 0.0, 0.03 - k * 0.045), 0.009, 4, m=0), "#C85E3E"))
    made.append(fauna_node("Fauna_SandCrab", parts, coll))
    # the sea turtle: 0.7 m, a domed olive shell, four flippers, a blunt head (swimming at the surface)
    turtle = [
        (lambda bm: blob(bm, 0.0, 0.0, 0.0, 0.26, 0.11, 0.34, m=0, cuts=3), "#5E7A4A"),
        (lambda bm: blob(bm, 0.0, 0.06, -0.02, 0.19, 0.07, 0.25, m=0, cuts=2), "#7A9658"),
        (lambda bm: blob(bm, 0.0, -0.03, 0.0, 0.22, 0.05, 0.3, m=0, cuts=2), "#D9CC9A"),
        (lambda bm: blob(bm, 0.0, 0.02, 0.4, 0.085, 0.07, 0.11, m=0, cuts=2), "#8BA56A"),
        (lambda bm: blob(bm, 0.05, 0.05, 0.47, 0.012, 0.012, 0.01, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, -0.05, 0.05, 0.47, 0.012, 0.012, 0.01, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, 0.0, -0.01, -0.38, 0.03, 0.02, 0.06, m=0, cuts=1), "#8BA56A"),
    ]
    for sx in (1, -1):
        turtle.append((lambda bm, sx=sx: blob(bm, sx * 0.36, -0.01, 0.18, 0.2, 0.022, 0.085, m=0, cuts=2), "#8BA56A"))
        turtle.append((lambda bm, sx=sx: blob(bm, sx * 0.24, -0.01, -0.3, 0.1, 0.02, 0.07, m=0, cuts=1), "#8BA56A"))
    made.append(fauna_node("Fauna_SeaTurtle", turtle, coll))
    # the sandpiper: 0.16 m, a pale belly, a brown back, a long dark bill, two thin legs
    made.append(fauna_node("Fauna_Sandpiper", [
        (lambda bm: blob(bm, 0.0, 0.1, 0.0, 0.04, 0.04, 0.07, m=0, cuts=2), "#F1ECE2"),
        (lambda bm: blob(bm, 0.0, 0.118, -0.012, 0.036, 0.026, 0.066, m=0, cuts=2), "#A08466"),
        (lambda bm: blob(bm, 0.0, 0.148, 0.06, 0.026, 0.026, 0.028, m=0, cuts=2), "#B39878"),
        (lambda bm: cylinder(bm, W(0.0, 0.146, 0.08), W(0.0, 0.138, 0.14), 0.005, 4, m=0), "#2B2623"),
        (lambda bm: blob(bm, 0.016, 0.155, 0.075, 0.005, 0.005, 0.004, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, -0.016, 0.155, 0.075, 0.005, 0.005, 0.004, m=0, cuts=1), "#1B1818"),
        (lambda bm: cylinder(bm, W(0.014, 0.07, 0.0), W(0.014, 0.0, 0.006), 0.004, 4, m=0), "#3A332C"),
        (lambda bm: cylinder(bm, W(-0.014, 0.07, 0.0), W(-0.014, 0.0, 0.006), 0.004, 4, m=0), "#3A332C"),
    ], coll))
    # a leaping fish: 0.3 m, silver with a blue back, a forked tail
    made.append(fauna_node("Fauna_LeapFish", [
        (lambda bm: blob(bm, 0.0, 0.0, 0.0, 0.035, 0.06, 0.14, m=0, cuts=2), "#DDE6EC"),
        (lambda bm: blob(bm, 0.0, 0.03, -0.01, 0.028, 0.035, 0.12, m=0, cuts=2), "#4E86B8"),
        (lambda bm: blob(bm, 0.0, 0.03, -0.17, 0.008, 0.05, 0.04, m=0, cuts=1), "#4E86B8"),
        (lambda bm: blob(bm, 0.0, -0.03, -0.17, 0.008, 0.05, 0.04, m=0, cuts=1), "#B9C8D2"),
    ], coll))
    # a dolphin: 1.9 m, slate above and pale below, a dorsal fin, flukes, a beak
    made.append(fauna_node("Fauna_Dolphin", [
        (lambda bm: blob(bm, 0.0, 0.0, 0.0, 0.2, 0.22, 0.8, m=0, cuts=3), "#6E8494"),
        (lambda bm: blob(bm, 0.0, -0.08, 0.05, 0.16, 0.14, 0.7, m=0, cuts=2), "#DCE4E8"),
        (lambda bm: blob(bm, 0.0, 0.0, 0.84, 0.07, 0.06, 0.16, m=0, cuts=2), "#6E8494"),
        (lambda bm: blob(bm, 0.0, 0.27, -0.05, 0.025, 0.14, 0.12, m=0, cuts=1), "#5A6E7C"),
        (lambda bm: blob(bm, 0.0, 0.0, -0.88, 0.26, 0.025, 0.1, m=0, cuts=1), "#5A6E7C"),
        (lambda bm: blob(bm, 0.2, -0.08, 0.3, 0.14, 0.02, 0.07, m=0, cuts=1), "#5A6E7C"),
        (lambda bm: blob(bm, -0.2, -0.08, 0.3, 0.14, 0.02, 0.07, m=0, cuts=1), "#5A6E7C"),
        (lambda bm: blob(bm, 0.1, 0.06, 0.62, 0.012, 0.012, 0.01, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, -0.1, 0.06, 0.62, 0.012, 0.012, 0.01, m=0, cuts=1), "#1B1818"),
    ], coll))
    # a whale's back as it rolls at the surface (9 m of it), and its flukes for the dive
    made.append(fauna_node("Fauna_WhaleBack", [
        (lambda bm: blob(bm, 0.0, -0.9, 0.0, 1.5, 1.4, 4.6, m=0, cuts=3), "#3F5566"),
        (lambda bm: blob(bm, 0.0, 0.42, -1.6, 0.12, 0.22, 0.5, m=0, cuts=1), "#34495A"),
        (lambda bm: blob(bm, 0.0, 0.1, 3.2, 0.5, 0.3, 1.0, m=0, cuts=2), "#4A6274"),
    ], coll))
    made.append(fauna_node("Fauna_WhaleFluke", [
        (lambda bm: blob(bm, 0.0, 0.0, 0.0, 0.26, 0.9, 0.26, m=0, cuts=2), "#3F5566"),
        (lambda bm: blob(bm, 0.75, 0.95, 0.0, 0.85, 0.2, 0.34, m=0, cuts=2), "#34495A"),
        (lambda bm: blob(bm, -0.75, 0.95, 0.0, 0.85, 0.2, 0.34, m=0, cuts=2), "#34495A"),
    ], coll))
    # a moon jelly for the cove's lagoon: a pale bell, a frill, four short arms
    jelly = [
        (lambda bm: blob(bm, 0.0, 0.0, 0.0, 0.16, 0.1, 0.16, m=0, cuts=2), "#DDF6FF"),
        (lambda bm: blob(bm, 0.0, -0.03, 0.0, 0.17, 0.035, 0.17, m=0, cuts=1), "#BFE9F8"),
        (lambda bm: blob(bm, 0.0, 0.02, 0.0, 0.07, 0.04, 0.07, m=0, cuts=1), "#F6C8E4"),
    ]
    for q in range(4):
        ja = 2 * math.pi * q / 4 + 0.4
        jelly.append((lambda bm, ja=ja: cylinder(bm, W(math.cos(ja) * 0.06, -0.04, math.sin(ja) * 0.06), W(math.cos(ja) * 0.09, -0.3, math.sin(ja) * 0.09), 0.018, 4, m=0), "#CFEFFA"))
    made.append(fauna_node("Fauna_Jelly", jelly, coll))
    # a butterfly for the flowers (the woods' own shape, under this map's own name)
    made.append(fauna_node("Fauna_BeachFly_Body", [
        (lambda bm: blob(bm, 0.0, 0.0, 0.0, 0.01, 0.01, 0.04, m=0, cuts=2), "#2E2622"),
    ], coll))
    for sx, nm in ((1, "Fauna_BeachFly_WingL"), (-1, "Fauna_BeachFly_WingR")):
        made.append(fauna_node(nm, [
            (lambda bm, sx=sx: blob(bm, sx * 0.04, 0.0, 0.012, 0.035, 0.004, 0.03, m=0, cuts=2), "#FFF6E2"),
            (lambda bm, sx=sx: blob(bm, sx * 0.03, 0.0, -0.022, 0.024, 0.004, 0.02, m=0, cuts=2), "#F4E4C8"),
        ], coll, pivot=(sx * 0.008, 0.0, 0.0)))
    # the egret: 0.62 m tall, white, a long S of a neck, a yellow dagger of a bill, black legs (standing)
    made.append(fauna_node("Fauna_Egret", [
        (lambda bm: blob(bm, 0.0, 0.34, -0.02, 0.07, 0.075, 0.13, m=0, cuts=3), "#FAFAF6"),
        (lambda bm: blob(bm, 0.0, 0.31, -0.15, 0.04, 0.03, 0.07, m=0, cuts=2), "#F0F0EA"),
        (lambda bm: cylinder(bm, W(0.0, 0.38, 0.07), W(0.0, 0.5, 0.03), 0.022, 5, m=0), "#FAFAF6"),
        (lambda bm: cylinder(bm, W(0.0, 0.5, 0.03), W(0.0, 0.58, 0.09), 0.02, 5, m=0), "#FAFAF6"),
        (lambda bm: blob(bm, 0.0, 0.6, 0.11, 0.028, 0.026, 0.04, m=0, cuts=2), "#FAFAF6"),
        (lambda bm: cylinder(bm, W(0.0, 0.6, 0.14), W(0.0, 0.585, 0.24), 0.01, 4, m=0, r_end=0.002), "#E8B33C"),
        (lambda bm: blob(bm, 0.022, 0.612, 0.125, 0.006, 0.006, 0.005, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, -0.022, 0.612, 0.125, 0.006, 0.006, 0.005, m=0, cuts=1), "#1B1818"),
        (lambda bm: cylinder(bm, W(0.025, 0.29, 0.0), W(0.03, 0.0, 0.01), 0.007, 4, m=0), "#2A2A2A"),
        (lambda bm: cylinder(bm, W(-0.025, 0.29, 0.0), W(-0.03, 0.0, -0.01), 0.007, 4, m=0), "#2A2A2A"),
    ], coll))
    # the hermit crab: 0.11 m, a spiral shell it carries, two small claws out in front
    made.append(fauna_node("Fauna_HermitCrab", [
        (lambda bm: blob(bm, 0.0, 0.045, -0.02, 0.045, 0.045, 0.05, m=0, cuts=2), "#E9D8B8"),
        (lambda bm: blob(bm, 0.0, 0.075, -0.04, 0.028, 0.028, 0.03, m=0, cuts=2), "#D2B48A"),
        (lambda bm: blob(bm, 0.0, 0.095, -0.05, 0.014, 0.014, 0.016, m=0, cuts=1), "#B9966A"),
        (lambda bm: blob(bm, 0.0, 0.025, 0.04, 0.03, 0.02, 0.03, m=0, cuts=1), "#D9603C"),
        (lambda bm: blob(bm, 0.03, 0.025, 0.07, 0.016, 0.012, 0.018, m=0, cuts=1), "#E87A52"),
        (lambda bm: blob(bm, -0.03, 0.025, 0.07, 0.016, 0.012, 0.018, m=0, cuts=1), "#E87A52"),
    ], coll))
    # the manta: 2.2 m across, a dark diamond with long wings, two horns, a whip of a tail (seen from above, under the water)
    manta = [
        (lambda bm: blob(bm, 0.0, 0.0, 0.0, 0.42, 0.07, 0.55, m=0, cuts=3), "#1F3440"),
        (lambda bm: cylinder(bm, W(0.0, 0.0, -0.5), W(0.0, 0.0, -1.5), 0.02, 4, m=0, r_end=0.004), "#182A34"),
    ]
    for sx in (1, -1):
        manta.append((lambda bm, sx=sx: blob(bm, sx * 0.55, 0.0, 0.0, 0.4, 0.04, 0.34, m=0, cuts=2), "#24404E"))
        manta.append((lambda bm, sx=sx: blob(bm, sx * 0.95, 0.0, -0.08, 0.22, 0.025, 0.16, m=0, cuts=2), "#2A4A5A"))
        manta.append((lambda bm, sx=sx: blob(bm, sx * 0.13, 0.0, 0.56, 0.035, 0.03, 0.1, m=0, cuts=1), "#2A4A5A"))
    made.append(fauna_node("Fauna_Manta", manta, coll))
    out = os.path.join(root, "client", "public", "models", "beach_life.glb")
    export(coll, out)
    info = {"glb": out, "bytes": os.path.getsize(out), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in made)}
    for o in made:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(coll)
    return info


def pearl_rock(bm, rng):
    """A boss of pearl rock out of the cave's wall: pale lilac stone, sheets of nacre standing out of
    its face (game +z), a pearl or two caught in them."""
    blob(bm, 0.0, 0.5, 0.0, 0.6, 0.58, 0.5, m=m("BC_Pearl"), cuts=3, noise=0.15, rng=rng, flat_bottom=-0.05)
    blob(bm, -0.36, 0.2, -0.06, 0.34, 0.26, 0.32, m=m("BC_PearlDark"), cuts=2, noise=0.18, rng=rng, flat_bottom=-0.05)
    blob(bm, 0.34, 0.18, 0.08, 0.32, 0.22, 0.3, m=m("BC_PearlDark"), cuts=2, noise=0.18, rng=rng, flat_bottom=-0.05)
    for k in range(8):
        a = rng.uniform(-1.15, 1.15)
        h = rng.uniform(0.2, 0.9)
        r = 0.5 * math.cos(a * 0.55) * (1.0 - 0.45 * abs(h - 0.5))
        blob(bm, math.sin(a) * r, h, math.cos(a) * r * 0.86, rng.uniform(0.09, 0.15), rng.uniform(0.05, 0.09), 0.03, m=m("BC_NacrePink" if k % 2 else "BC_NacreTeal"), cuts=1)
    for k in range(3):
        a = rng.uniform(-0.9, 0.9)
        blob(bm, math.sin(a) * 0.4, rng.uniform(0.3, 0.8), math.cos(a) * 0.42, 0.045, 0.045, 0.045, m=m("BC_White"), cuts=2)


def pearl_rubble(bm, rng):
    for k in range(6):
        a = 2 * math.pi * k / 6 + rng.uniform(-0.4, 0.4)
        r = rng.uniform(0.08, 0.36)
        sz = rng.uniform(0.12, 0.22)
        blob(bm, math.cos(a) * r, sz * 0.5, math.sin(a) * r, sz, sz * 0.7, sz, m=m("BC_Pearl" if k % 2 else "BC_PearlDark"), cuts=1, noise=0.25, rng=rng, flat_bottom=-0.03)
    blob(bm, 0.05, 0.1, 0.12, 0.09, 0.04, 0.03, m=m("BC_NacrePink"), cuts=1)


def build_reef_looks(root):
    """reef.glb: `Ore_reef` and `Ore_reef_Rubble` at the origin (client/src/scene/ReefRock.tsx)."""
    name = "ReefLooks"
    old = bpy.data.collections.get(name)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    rng = random.Random(53)
    made = []
    for look, fn in (("Ore_reef", reef_rock), ("Ore_reef_Rubble", reef_rubble), ("Ore_pearl", pearl_rock), ("Ore_pearl_Rubble", pearl_rubble)):
        bm = bmesh.new()
        fn(bm, rng)
        ob = make_object(look, bm, MATS, coll)
        bake_colors(ob, one="BC_Clay")
        own = vc_material("PT_ReefRock")
        for i in range(len(ob.data.materials)):
            ob.data.materials[i] = own
        use_col(ob.data)
        made.append(ob)
    out = os.path.join(root, "client", "public", "models", "reef.glb")
    export(coll, out)
    info = {"glb": out, "bytes": os.path.getsize(out), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in made)}
    for o in made:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(coll)
    return info


def leaf_fan(bm, x, y0, z, rng, n, mats, length, width, rise, droop, turn=None):
    """A rosette of `n` long leaves from one point: each arches up `rise` and falls `droop` over its
    `length`, `width` across at its broadest (a banana's broad paddles, an agave's stiff blades)."""
    a0 = rng.random() * 6.283 if turn is None else turn
    for q in range(n):
        fa = a0 + 2 * math.pi * q / n + rng.uniform(-0.22, 0.22)
        R = length * rng.uniform(0.82, 1.12)
        up = rise * rng.uniform(0.8, 1.15)
        mat = m(mats[q % len(mats)])
        segs = 5
        spine, left, right = [], [], []
        for j in range(segs + 1):
            t = j / segs
            out = R * t
            yy = y0 + up * t - droop * t * t
            w = width * math.sin(math.pi * min(1.0, t * 0.9 + 0.1)) ** 0.7
            cx, cz = x + math.cos(fa) * out, z + math.sin(fa) * out
            sx, sz = -math.sin(fa) * w, math.cos(fa) * w
            spine.append(bm.verts.new(W(cx, yy, cz)))
            left.append(bm.verts.new(W(cx + sx, yy - 0.18 * w, cz + sz)))
            right.append(bm.verts.new(W(cx - sx, yy - 0.18 * w, cz - sz)))
        for j in range(segs):
            bm.faces.new((spine[j], spine[j + 1], left[j + 1], left[j])).material_index = mat
            bm.faces.new((spine[j + 1], spine[j], right[j], right[j + 1])).material_index = mat


def sea_pine(bm, x, z, s, rng, ground=0.0, lift_layer=None):
    """A casuarina (the beach forest's "sea pine"): a tall, slim, slightly leaning trunk in fissured
    grey-brown bark and an open, irregular crown of drooping, feathery branchlets (each a long soft
    tuft hanging from a short branch), thin enough to see the sky through."""
    before = set(bm.verts)
    H = 5.6 * s * rng.uniform(0.92, 1.08)
    a = rng.random() * 6.283
    k = rng.uniform(0.15, 0.5) * s
    segs, sides = 9, 7
    rings = []
    for j in range(segs + 1):
        t = j / segs
        cx, cz = x + math.cos(a) * k * t * t, z + math.sin(a) * k * t * t
        r = (0.19 - 0.15 * t) * s + (0.07 * s if j == 0 else 0.0)
        rings.append([bm.verts.new(W(cx + r * math.cos(2 * math.pi * q / sides), ground + H * t, cz + r * math.sin(2 * math.pi * q / sides))) for q in range(sides)])
    for j, (r0, r1) in enumerate(zip(rings, rings[1:])):
        for q in range(sides):
            f = bm.faces.new((r0[q], r0[(q + 1) % sides], r1[(q + 1) % sides], r1[q]))
            f.material_index = m("BC_PineBark") if (j + q) % 3 else m("BC_PineBarkDark")
    tones = ("BC_PineNeedle", "BC_PineNeedleLight", "BC_PineNeedleDeep")
    tufts = 14
    for q in range(tufts):
        t = 0.34 + 0.62 * (q + rng.uniform(-0.3, 0.3)) / tufts
        fa = q * 2.4 + rng.uniform(-0.4, 0.4)
        cx, cz = x + math.cos(a) * k * t * t, z + math.sin(a) * k * t * t
        reach = (1.25 - 0.85 * t) * s * rng.uniform(0.8, 1.15)
        by = ground + H * t
        ex, ez, ey = cx + math.cos(fa) * reach, cz + math.sin(fa) * reach, by + 0.25 * s * rng.uniform(0.2, 1.0)
        bar(bm, W(cx, by, cx * 0 + cz), W(ex, ey, ez), 0.035 * s, m("BC_PineBarkDark"), sides=4, r_end=0.012 * s)
        # the hanging tuft at the branch's end, and a smaller one half way along it
        w = (0.4 - 0.16 * t) * s
        blob(bm, ex, ey - 0.36 * s, ez, w, 0.78 * s * rng.uniform(0.85, 1.15), w, m=m(tones[q % 3]), cuts=2, noise=0.2, rng=rng)
        blob(bm, (cx + ex) / 2, (by + ey) / 2 - 0.22 * s, (cz + ez) / 2, w * 0.7, 0.52 * s, w * 0.7, m=m(tones[(q + 1) % 3]), cuts=2, noise=0.2, rng=rng)
    tx, tz = x + math.cos(a) * k, z + math.sin(a) * k
    blob(bm, tx, ground + H + 0.1 * s, tz, 0.26 * s, 0.6 * s, 0.26 * s, m=m("BC_PineNeedleLight"), cuts=2, noise=0.18, rng=rng)
    if lift_layer is not None:
        for v in bm.verts:
            if v not in before:
                v[lift_layer] = ground


def sea_pine_stump(bm, rng):
    sides, r0, r1, h = 9, 0.26, 0.19, 0.36
    low = [bm.verts.new(W(r0 * math.cos(2 * math.pi * q / sides), 0.0, r0 * math.sin(2 * math.pi * q / sides))) for q in range(sides)]
    top = [bm.verts.new(W(r1 * math.cos(2 * math.pi * q / sides), h, r1 * math.sin(2 * math.pi * q / sides))) for q in range(sides)]
    for q in range(sides):
        bm.faces.new((low[q], low[(q + 1) % sides], top[(q + 1) % sides], top[q])).material_index = m("BC_PineBarkDark" if q % 2 else "BC_PineBark")
    bm.faces.new(top[::-1]).material_index = m("BC_PineCone")


def sea_pine_looks(coll, rng):
    """`Tree_sea_pine_<stage>` at the origin, beside the palm's in palms.glb."""
    made = []
    for stage in ("stump", "sprout", "sapling", "mature"):
        bm = bmesh.new()
        if stage == "stump":
            sea_pine_stump(bm, rng)
        elif stage == "sprout":
            bar(bm, W(0, 0, 0), W(0.02, 0.5, 0), 0.03, m("BC_PineBark"), sides=5, r_end=0.012)
            for q in range(3):
                blob(bm, 0.1 * math.cos(q * 2.1), 0.32 + 0.12 * q, 0.1 * math.sin(q * 2.1), 0.14, 0.2, 0.14, m=m(("BC_PineNeedleLight", "BC_PineNeedle")[q % 2]), cuts=1, noise=0.15, rng=rng)
        elif stage == "sapling":
            sea_pine(bm, 0.0, 0.0, 0.42, rng)
        else:
            sea_pine(bm, 0.0, 0.0, 1.0, rng)
        ob = make_object("Tree_sea_pine_" + stage, bm, MATS, coll)
        look_finish(ob)
        made.append(ob)
    return made


def sea_almond(bm, x, z, s, rng):
    """A sea almond (Terminalia catappa): a straight trunk and whorls of level branches in tiers, a
    pagoda of broad leaves, a few of them gone red before they fall."""
    y = land_y(x, z)
    H = 4.4 * s
    bar(bm, W(x, y - 0.1, z), W(x + 0.08 * s, y + H, z), 0.24 * s, m("BC_AlmondBark"), sides=8, r_end=0.07 * s)
    blob(bm, x, y + 0.1, z, 0.36 * s, 0.22 * s, 0.36 * s, m=m("BC_AlmondBarkDark"), cuts=2, noise=0.2, rng=rng, flat_bottom=y - 0.1)
    for tier, (h, reach, n) in enumerate(((0.46, 2.5, 6), (0.66, 2.0, 6), (0.84, 1.45, 5), (0.98, 0.8, 4))):
        a0 = rng.random() * 6.283
        for q in range(n):
            fa = a0 + 2 * math.pi * q / n + rng.uniform(-0.2, 0.2)
            R = reach * s * rng.uniform(0.85, 1.12)
            by = y + H * h
            ex, ez, ey = x + math.cos(fa) * R, z + math.sin(fa) * R, by + 0.12 * s
            bar(bm, W(x, by, z), W(ex, ey, ez), 0.06 * s, m("BC_AlmondBark"), sides=5, r_end=0.025 * s)
            # (flat rafts of leaves along the branch: the tree reads as layers from the camera)
            for j, t in enumerate((0.45, 0.75, 1.0)):
                lx, lz = x + math.cos(fa) * R * t, z + math.sin(fa) * R * t
                red = rng.random() < 0.05
                mat = "BC_AlmondRed" if red else ("BC_AlmondLeaf", "BC_AlmondLight")[(q + j + tier) % 2]
                w = (0.62 - 0.1 * tier) * s * (0.7 + 0.3 * t)
                blob(bm, lx, by + 0.14 * s + 0.1 * s * t, lz, w, 0.13 * s, w, m=m(mat), cuts=2, noise=0.16, rng=rng)
    blob(bm, x + 0.08 * s, y + H + 0.15 * s, z, 0.55 * s, 0.22 * s, 0.55 * s, m=m("BC_AlmondLight"), cuts=2, noise=0.16, rng=rng)


def pandanus(bm, x, z, s, rng):
    """A pandanus (screw pine): a short trunk propped on stilt roots, two or three arms, each ending
    in a rosette of long sword leaves; an orange fruit under one of them."""
    y = land_y(x, z)
    for q in range(7):
        a = 2 * math.pi * q / 7 + rng.uniform(-0.2, 0.2)
        bar(bm, W(x + 0.06 * math.cos(a), y + 0.62 * s, z + 0.06 * math.sin(a)), W(x + 0.42 * s * math.cos(a), y - 0.06, z + 0.42 * s * math.sin(a)), 0.035 * s, m("BC_PandanRoot"), sides=5, r_end=0.028 * s)
    bar(bm, W(x, y + 0.5 * s, z), W(x, y + 1.15 * s, z), 0.09 * s, m("BC_PandanRoot"), sides=6, r_end=0.075 * s)
    arms = rng.randint(2, 3)
    a0 = rng.random() * 6.283
    for q in range(arms):
        a = a0 + 2 * math.pi * q / arms + rng.uniform(-0.3, 0.3)
        ex, ez, ey = x + 0.42 * s * math.cos(a), z + 0.42 * s * math.sin(a), y + (1.55 + 0.25 * q) * s
        bar(bm, W(x, y + 1.1 * s, z), W(ex, ey, ez), 0.07 * s, m("BC_PandanRoot"), sides=5, r_end=0.055 * s)
        leaf_fan(bm, ex, ey, ez, rng, 10, ("BC_Pandan", "BC_PandanLight", "BC_Pandan"), 0.95 * s, 0.07 * s, 0.6 * s, 0.75 * s)
        leaf_fan(bm, ex, ey + 0.05 * s, ez, rng, 6, ("BC_PandanLight", "BC_Pandan"), 0.6 * s, 0.06 * s, 0.75 * s, 0.3 * s)
        if q == 0:
            blob(bm, ex + 0.12 * s * math.cos(a), ey - 0.22 * s, ez + 0.12 * s * math.sin(a), 0.12 * s, 0.15 * s, 0.12 * s, m=m("BC_PandanFruit"), cuts=2, noise=0.1, rng=rng)


def mangrove(bm, x, z, s, rng):
    """A young mangrove at the creek's edge: arching prop roots out of the mud and the water, a short
    crooked trunk, a low rounded crown of dark glossy leaves."""
    y = min(land_y(x, z), 0.05)
    top = max(land_y(x, z), 0.0) + 0.85 * s
    for q in range(8):
        a = 2 * math.pi * q / 8 + rng.uniform(-0.25, 0.25)
        R = rng.uniform(0.5, 0.85) * s
        kx, kz = x + 0.55 * R * math.cos(a), z + 0.55 * R * math.sin(a)
        ky = top - 0.18 * s
        bar(bm, W(x, top, z), W(kx, ky, kz), 0.035 * s, m("BC_MangroveRoot"), sides=5, r_end=0.03 * s)
        bar(bm, W(kx, ky, kz), W(x + R * math.cos(a), y - 0.35, z + R * math.sin(a)), 0.03 * s, m("BC_MangroveRoot"), sides=5, r_end=0.022 * s)
    bar(bm, W(x, top - 0.05, z), W(x + 0.12 * s, top + 0.75 * s, z + 0.08 * s), 0.07 * s, m("BC_MangroveRoot"), sides=6, r_end=0.04 * s)
    for q in range(6):
        a = 2 * math.pi * q / 6 + rng.uniform(-0.3, 0.3)
        rr = rng.uniform(0.2, 0.5) * s
        blob(bm, x + 0.12 * s + rr * math.cos(a), top + rng.uniform(0.75, 1.15) * s, z + 0.08 * s + rr * math.sin(a), 0.48 * s, 0.34 * s, 0.48 * s, m=m("BC_Mangrove") if q % 2 else m("BC_MangroveLight"), cuts=2, noise=0.16, rng=rng)


def build_strand(coll, rng):
    """The remake's own: the sea almonds (the bar's lights tied to one, a bench round the other), the
    mangroves, the tide pools' rims, the point's granite, the creek's stepping roots. The sea pines
    are felled: the game draws them from palms.glb (they are grown here into a mesh thrown away, so
    what is built after them stands where it did)."""
    S = SCENE
    bm = bmesh.new()
    for p in S["almonds"]:
        sea_almond(bm, p["x"], p["z"], p["s"], rng)
    # the bench round the creek's almond: a ring of planks on short posts, two places on it
    seats = S.get("almondBench", [])
    if seats and len(S["almonds"]) > 1:
        t = S["almonds"][1]
        y = land_y(t["x"], t["z"])
        n = 10
        for q in range(n):
            a0, a1 = 2 * math.pi * q / n, 2 * math.pi * (q + 1) / n
            pts = [W(t["x"] + r * math.cos(a), y + 0.44, t["z"] + r * math.sin(a)) for r, a in ((0.5, a0), (1.02, a0), (1.02, a1), (0.5, a1))]
            oquad(bm, pts[::-1], m("BC_WoodPale") if q % 2 else m("BC_Wood"), thick=0.06, under=m("BC_WoodDark"))
            bar(bm, W(t["x"] + 0.92 * math.cos(a0), y - 0.05, t["z"] + 0.92 * math.sin(a0)), W(t["x"] + 0.92 * math.cos(a0), y + 0.4, t["z"] + 0.92 * math.sin(a0)), 0.05, m("BC_WoodDark"), sides=5)
    # a string of lights from the bar's roof to its almond
    if S["almonds"]:
        t = S["almonds"][0]
        for rp in S["bar"]["roofPosts"]:
            string_of_lights(bm, W(rp["x"], land_y(rp["x"], rp["z"]) + 2.55, rp["z"]), W(t["x"], land_y(t["x"], t["z"]) + 3.1 * t["s"], t["z"]), rng)
    for p in S["mangroves"]:
        mangrove(bm, p["x"], p["z"], p["s"], rng)
    # the tide pools: a rim of dark wet stones, a barnacled one among them, a starfish or an urchin in the bed
    for i, p in enumerate(S["tidePools"]):
        n = 9
        for q in range(n):
            a = 2 * math.pi * q / n + rng.uniform(-0.2, 0.2)
            r = p["r"] + rng.uniform(0.05, 0.3)
            sz = rng.uniform(0.14, 0.3)
            rx, rz = p["x"] + r * math.cos(a), p["z"] + r * math.sin(a)
            if shore_at(rx, rz) < -0.6:
                continue
            blob(bm, rx, land_y(rx, rz) + sz * 0.3, rz, sz, sz * 0.6, sz * rng.uniform(0.7, 1.1), m=m(("BC_GraniteDark", "BC_GraniteWet", "BC_Barnacle")[q % 3] if q % 4 else "BC_Granite"), cuts=2, noise=0.22, rng=rng)
        bx, bz = p["x"] + 0.2 * p["r"], p["z"] - 0.15 * p["r"]
        by = ground_y(bx, bz)
        if i % 2 == 0:
            for q in range(5):
                a = 2 * math.pi * q / 5
                blob(bm, bx + 0.07 * math.cos(a), by + 0.02, bz + 0.07 * math.sin(a), 0.06, 0.016, 0.026, m=m("BC_Star"), cuts=1)
        else:
            blob(bm, bx, by + 0.04, bz, 0.07, 0.05, 0.07, m=m("BC_Char"), cuts=2, noise=0.3, rng=rng)
        blob(bm, p["x"] - 0.3 * p["r"], ground_y(p["x"] - 0.3 * p["r"], p["z"] + 0.2 * p["r"]) + 0.03, p["z"] + 0.2 * p["r"], 0.1, 0.05, 0.08, m=m("BC_Coral"), cuts=1, noise=0.2, rng=rng)
    make_object("Beach_Strand", bm, MATS, coll)
    # (the sea pines: grown and thrown away)
    spare = bmesh.new()
    for p in S["seaPines"]:
        sea_pine(spare, p["x"], p["z"], p["s"], rng)
    spare.free()


def build_nature(coll, rng):
    S = SCENE
    bm = bmesh.new()
    for i, p in enumerate(S["shrubs"]):
        y = land_y(p["x"], p["z"])
        s = p["s"]
        kind = p.get("kind", "hibiscus")
        if kind == "pandanus":
            pandanus(bm, p["x"], p["z"], s * 1.25, rng)
            continue
        # a low round bush: sea lettuce (pale, with small white flowers) or sea hibiscus (yellow ones)
        pale = kind == "scaevola"
        for k in range(6 if pale else 5):
            a = 2 * math.pi * k / 5 + rng.uniform(-0.3, 0.3)
            rr = rng.uniform(0.1, 0.34) * s
            blob(bm, p["x"] + rr * math.cos(a), y + rng.uniform(0.2, 0.4 if pale else 0.5) * s, p["z"] + rr * math.sin(a), 0.32 * s, 0.25 * s, 0.32 * s, m=m(("BC_Scaevola", "BC_ScaevolaLight")[k % 2] if pale else ("BC_Leaf", "BC_LeafLight")[k % 2]), cuts=2, noise=0.14, rng=rng, flat_bottom=y - 0.04)
        for k in range(5):
            a = rng.random() * 6.283
            blob(bm, p["x"] + 0.32 * s * math.cos(a), y + rng.uniform(0.3, 0.52) * s, p["z"] + 0.32 * s * math.sin(a), 0.05, 0.045, 0.05, m=m("BC_White" if pale else "BC_HibiscusYellow"), cuts=1)
    for p in S["rocks"]:
        y = land_y(p["x"], p["z"])
        s = p["s"]
        wet = shore_at(p["x"], p["z"]) < 1.2
        # granite boulders: a rounded mass with a smaller one against it, darker and barnacled where
        # the sea reaches them, lichen-pale on top where it does not
        blob(bm, p["x"], y + 0.34 * s, p["z"], 0.6 * s, 0.56 * s, 0.54 * s, m=m("BC_GraniteDark" if wet else "BC_Granite"), cuts=3, noise=0.18, rng=rng, flat_bottom=y - 0.3)
        blob(bm, p["x"] + 0.34 * s, y + 0.14 * s, p["z"] + 0.28 * s, 0.34 * s, 0.28 * s, 0.32 * s, m=m("BC_GraniteWet" if wet else "BC_GraniteDark"), cuts=2, noise=0.2, rng=rng, flat_bottom=y - 0.3)
        blob(bm, p["x"] - 0.36 * s, y + 0.1 * s, p["z"] - 0.2 * s, 0.26 * s, 0.2 * s, 0.24 * s, m=m("BC_GraniteDark"), cuts=2, noise=0.2, rng=rng, flat_bottom=y - 0.3)
        if wet:
            for q in range(5):
                a = rng.random() * 6.283
                blob(bm, p["x"] + 0.56 * s * math.cos(a), y + 0.1 * s, p["z"] + 0.5 * s * math.sin(a), 0.07 * s, 0.05 * s, 0.07 * s, m=m("BC_Barnacle"), cuts=1)
        else:
            blob(bm, p["x"] - 0.1 * s, y + 0.74 * s, p["z"] - 0.08 * s, 0.3 * s, 0.12 * s, 0.28 * s, m=m("BC_RockMoss"), cuts=2, noise=0.1, rng=rng)
    for w in S["driftwood"]:
        fr = Frame(w["x"], w["z"], w["yaw"])
        bar(bm, fr.p(-w["len"] / 2, 0.11, 0.0), fr.p(w["len"] / 2, 0.09, 0.0), 0.11, m("BC_Drift"), sides=8, r_end=0.07)
        bar(bm, fr.p(0.1, 0.14, 0.0), fr.p(0.32, 0.36, 0.2), 0.035, m("BC_DriftDark"), sides=5, r_end=0.015)
    # the tiki torches: a bamboo pole, a bound head, a bowl (the game lights the flame from dusk)
    for p in S.get("torches", []):
        y = land_y(p["x"], p["z"])
        bar(bm, W(p["x"], y - 0.05, p["z"]), W(p["x"] + 0.03, y + 1.45, p["z"]), 0.035, m("BC_Bamboo"), sides=6, r_end=0.03)
        for h in (0.5, 0.95):
            bar(bm, W(p["x"], y + h, p["z"]), W(p["x"], y + h + 0.03, p["z"]), 0.042, m("BC_BambooDark"), sides=6)
        bar(bm, W(p["x"] + 0.03, y + 1.4, p["z"]), W(p["x"] + 0.03, y + 1.62, p["z"]), 0.05, m("BC_Rope"), sides=7, r_end=0.085)
        bar(bm, W(p["x"] + 0.03, y + 1.6, p["z"]), W(p["x"] + 0.03, y + 1.64, p["z"]), 0.07, m("BC_Char"), sides=7)
    make_object("Beach_Nature", bm, MATS, coll)


def clear_of_things(x, z, pad=0.0):
    """Open sand at (x, z): clear of what is built and of where people walk and sit."""
    S = SCENE
    near = lambda p, r: math.hypot(x - p["x"], z - p["z"]) < r + pad
    if near(S["bar"], 3.4) or near(S["firepit"], 2.6) or near(S["shack"], 2.6) or near(S["court"], S["court"]["r"] + 0.3) or near(S["arrival"], 1.6):
        return False
    if creek_inside(x, z) > -0.5 - pad or pool_inside(x, z) > -0.3 - pad or any(near(p, 1.0) for p in S.get("almondBench", [])):
        return False
    if any(near(p, 0.5) for p in S["palms"] + S["hammockPalms"] + S["shrubs"] + S.get("seaPines", []) + S.get("almonds", []) + S.get("mangroves", [])) or any(near(p, 0.7) for p in S["rocks"]) or any(near(p, 0.9) for p in S.get("reef", [])) or any(near(p, 1.3) for p in S["loungers"]):
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
        if made >= 560:
            break
        x, z = rng.uniform(-half + 0.8, half - 0.8), rng.uniform(-half + 0.8, half - 0.8)
        d = shore_at(x, z)
        if d < 7.5 or not clear_of_things(x, z):
            continue
        if rng.random() > 0.25 + 0.75 * smooth(9.0, 16.0, d) * (0.4 + 0.6 * vnoise(x * 0.4, z * 0.4)):
            continue
        kit.grass_clump(bm, x, z, rng, m("BC_DuneGrass") if rng.random() < 0.6 else m("BC_DuneGrassDark"), h=rng.uniform(0.3, 0.55), blades=rng.randint(5, 8), spread=0.1)
        made += 1
    half_in = half - 1.0
    # the pioneer zone: spinifex in spiky tussocks on the open backshore, its seed heads rolling loose
    tuss = 0
    for _ in range(6000):
        if tuss >= 70:
            break
        x, z = rng.uniform(-half_in, half_in), rng.uniform(-half_in, half_in)
        d = shore_at(x, z)
        if d < 4.5 or d > 11.5 or not clear_of_things(x, z, 0.3) or vnoise(x * 0.5 + 3.0, z * 0.5) < 0.52:
            continue
        leaf_fan(bm, x, 0.02, z, rng, rng.randint(9, 13), ("BC_DuneGrass", "BC_DuneGrassDark", "BC_SandGreen"), rng.uniform(0.3, 0.45), 0.018, 0.34, 0.1)
        if tuss % 5 == 0:
            blob(bm, x + 0.4, 0.09, z + 0.2, 0.09, 0.09, 0.09, m=m("BC_DuneGrass"), cuts=1, noise=0.5, rng=rng)
        tuss += 1
    # under the sea pines: fallen cones, and seedlings coming up through the needles
    for p in SCENE.get("seaPines", []):
        for _ in range(rng.randint(3, 6)):
            a, r = rng.random() * 6.283, rng.uniform(0.5, 2.0)
            x, z = p["x"] + math.cos(a) * r, p["z"] + math.sin(a) * r
            if max(abs(x), abs(z)) < half_in and shore_at(x, z) > 1.0:
                blob(bm, x, 0.03, z, 0.035, 0.035, 0.05, m=m("BC_PineCone"), cuts=1)
    # under the sea almonds: big fallen leaves, red and yellow, and the almonds themselves
    for p in SCENE.get("almonds", []):
        for q in range(16):
            a, r = rng.random() * 6.283, rng.uniform(0.7, 2.8)
            x, z = p["x"] + math.cos(a) * r, p["z"] + math.sin(a) * r
            if max(abs(x), abs(z)) < half_in and shore_at(x, z) > 0.5:
                blob(bm, x, 0.012, z, 0.11, 0.008, 0.07, m=m(("BC_AlmondRed", "BC_Yellow", "BC_AlmondLeaf")[q % 3]), cuts=1)
    # the sand bubbler crabs' work on the wet sand: a burrow and rays of tiny sand balls round it
    balls = 0
    for _ in range(3000):
        if balls >= 26:
            break
        x, z = rng.uniform(-half_in, half_in), rng.uniform(-half_in, half_in)
        d = shore_at(x, z)
        if d < 0.5 or d > 1.9 or not clear_of_things(x, z, -0.3):
            continue
        blob(bm, x, 0.004, z, 0.03, 0.004, 0.03, m=m("BC_SandWet"), cuts=1)
        for ray in range(rng.randint(5, 8)):
            a = 2 * math.pi * ray / 7 + rng.uniform(-0.2, 0.2)
            for step in range(rng.randint(3, 6)):
                r = 0.09 + 0.055 * step
                blob(bm, x + r * math.cos(a), 0.012, z + r * math.sin(a), 0.014, 0.012, 0.014, m=m("BC_SandPale"), cuts=1)
        balls += 1
    # the creek: pencil roots standing out of the mud along its banks, a few reeds
    roots = 0
    for _ in range(5000):
        if roots >= 90:
            break
        p = rng.choice(SCENE["mangroves"])
        a, r = rng.random() * 6.283, rng.uniform(0.5, 1.7)
        x, z = p["x"] + math.cos(a) * r, p["z"] + math.sin(a) * r
        ck = creek_inside(x, z)
        if ck < -0.7 or ck > 0.6 or max(abs(x), abs(z)) > half_in:
            continue
        h = rng.uniform(0.08, 0.2)
        bar(bm, W(x, -0.12, z), W(x, h, z), 0.012, m("BC_MangroveRoot"), sides=4, r_end=0.006)
        roots += 1
    # coconuts at the palms' feet, and a fallen frond here and there under a grove
    for i, p in enumerate(SCENE["palms"]):
        for _ in range(rng.randint(1, 3)):
            a, r = rng.random() * 6.283, rng.uniform(0.45, 1.3)
            x, z = p["x"] + math.cos(a) * r, p["z"] + math.sin(a) * r
            if max(abs(x), abs(z)) < half_in and shore_at(x, z) > 1.0:
                blob(bm, x, 0.07, z, 0.085, 0.075, 0.1, m=m("BC_Coconut"), cuts=1)
        if i % 3 == 0:
            a, r = rng.random() * 6.283, rng.uniform(1.0, 1.9)
            x, z = p["x"] + math.cos(a) * r, p["z"] + math.sin(a) * r
            if max(abs(x), abs(z)) < half_in and clear_of_things(x, z):
                leaf_fan(bm, x, 0.03, z, rng, 1, ("BC_Banana",), 1.5, 0.3, 0.05, 0.02)
    # mats of beach morning-glory over the open sand, in flower
    mats = 0
    for _ in range(3000):
        if mats >= 26:
            break
        x, z = rng.uniform(-half_in, half_in), rng.uniform(-half_in, half_in)
        d = shore_at(x, z)
        if d < 4.2 or d > 13.0 or not clear_of_things(x, z, 0.4):
            continue
        kit.bush(bm, blob, x, z, rng.uniform(0.7, 1.1), rng, "spread", m("BC_Leaf"), m("BC_LeafLight"), dots=(lambda px, py, pz, r, h, mt: blob(bm, px, py, pz, r, h * 0.5, r, m=mt, cuts=1), m("BC_Morning"), rng.randint(3, 6), 0.04))
        mats += 1
    # little agaves and tufts among the outcrops' stones
    for p in SCENE["rocks"]:
        if shore_at(p["x"], p["z"]) < 2.5:
            continue
        a, r = rng.random() * 6.283, 0.75 * p["s"] + 0.25
        x, z = p["x"] + math.cos(a) * r, p["z"] + math.sin(a) * r
        if max(abs(x), abs(z)) < half_in and clear_of_things(x, z):
            leaf_fan(bm, x, 0.02, z, rng, 7, ("BC_Agave", "BC_AgaveTip"), 0.3, 0.045, 0.3, 0.06)
    # pebbles round the rocks and the reef
    stones = 0
    for _ in range(4000):
        if stones >= 90:
            break
        p = rng.choice(SCENE["rocks"] + SCENE.get("reef", []))
        a, r = rng.random() * 6.283, rng.uniform(0.6, 1.7)
        x, z = p["x"] + math.cos(a) * r, p["z"] + math.sin(a) * r
        if max(abs(x), abs(z)) > half_in or shore_at(x, z) < 0.2 or not clear_of_things(x, z, -0.25):
            continue
        sz = rng.uniform(0.04, 0.1)
        blob(bm, x, sz * 0.5, z, sz, sz * 0.6, sz * rng.uniform(0.7, 1.2), m=m(rng.choice(["BC_Rock", "BC_RockDark", "BC_Stone", "BC_Reef"])), cuts=1, noise=0.2, rng=rng)
        stones += 1
    # the wrack: weed left along the high tide's line
    weed = 0
    for _ in range(6000):
        if weed >= 110:
            break
        x, z = rng.uniform(-half_in, half_in), rng.uniform(-half_in, half_in)
        d = shore_at(x, z)
        wl = 2.15 + 0.7 * (vnoise(x * 0.35 + 11.0, z * 0.35 - 4.0) - 0.5) + 0.25 * math.sin(x * 0.9 + z * 0.6)
        if abs(d - wl) > 0.3 or not clear_of_things(x, z, -0.4):
            continue
        blob(bm, x, 0.012, z, rng.uniform(0.05, 0.13), 0.014, rng.uniform(0.03, 0.07), m=m("BC_Weed" if rng.random() < 0.6 else "BC_WeedDark"), cuts=1)
        weed += 1
    shells = 0
    for _ in range(4000):
        if shells >= 110:
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
    # (a little light and wear in the paint, since the game draws no shadows and no textures: faces
    # that look up a touch sun-bleached, undersides cool and dark, a contact shade where a thing
    # meets the sand, and a slow mottle over it all, so planks, thatch, canvas and stone are not flat)
    rot = world.to_3x3()
    wear = one is None and ob.name not in ("Beach_Ground", "Beach_Sea") and not ob.name.startswith("Tree_")
    # (read once, before any colour is written: a write makes Blender work the normals out afresh)
    vpos = [world @ v.co for v in me.vertices] if wear else []
    vup = [(rot @ v.normal).z for v in me.vertices] if wear else []
    for poly in me.polygons:
        name = names[min(poly.material_index, len(names) - 1)]
        s = one or slot_of(name)
        c = (1.0, 1.0, 1.0) if s in KEEP else lin(PALETTE[name])
        for li in poly.loop_indices:
            if wear and s not in KEEP:
                # (by the vertex, never by the face: faces of one colour go on sharing their corners)
                vi = me.loops[li].vertex_index
                p, up = vpos[vi], vup[vi]
                over = p.z - (land_y(p.x, -p.y) if TERRAIN is not None else 0.0)
                k = 1.0 + 0.09 * (vnoise(p.x * 2.6 + p.z * 1.7, -p.y * 2.6 + 3.0) - 0.5) + 0.05 * max(0.0, up) - 0.16 * max(0.0, -up)
                k *= 1.0 - 0.14 * smooth(0.3, 0.0, over) * (1.0 if up < 0.6 else 0.0)
                # (in steps: a few distinct values pack small, free-running floats do not)
                k = round(k * 24) / 24
                attr.data[li].color = (round(c[0] * k * 255) / 255, round(c[1] * k * 255) / 255, round(c[2] * (k + 0.03 * max(0.0, -up)) * 255) / 255, 1.0)
                continue
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
    build_strand(coll, rng)
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
        result["reef"] = build_reef_looks(root)
        result["reef"]["meshopt"] = _pack.meshopt_pack(root, result["reef"]["glb"])
        # (the life's templates stay unpacked: tiny, and drawn instanced from their own geometry)
        result["life"] = build_life_looks(root)
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1)[:4000])
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
