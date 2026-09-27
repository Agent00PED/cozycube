"""The Velvet Penthouse: builds client/public/models/casino_vip.glb.

Run it inside Blender like build_casino.py (through the Live Bridge, in a namespace of its own with
REPO_ROOT and REPORT_PATH set, or headless: blender -b -P scripts/blender/build_casino_vip.py). It
borrows the hall builder's whole kit (its palette, finishes, meshes and furniture: everything in
build_casino.py above its `build`), so the suite is painted and finished exactly like the hall.

Nothing is placed by hand: where everything stands comes from VIP_LAYOUT in
shared/worlds/casino_vip.ts (the JSON between its layout markers, read as is), in the suite's own
coordinates (x and z from -5 to 5); the finished mesh is moved out to the suite's place in the
casino's world (its "offset"), off to the side of the hall. Seat heights come from shared/seats.ts.

Every colour is a vertex colour over the hall's shared finishes, plus one of its own:

    CS_City     the windows' night skyline (unlit, the game lets it breathe and twinkle)

    Casino_VipStatic   everything that stands still, merged into ONE object:
                         the 10x10 slab; a violet carpet with a marble border, gold Art-Deco
                         inlays and a sunburst medallion round the fountain; the two tall window
                         walls looking out over the city at night (towers, lit windows, a violet
                         dusk at the horizon), mahogany wainscot, gold mullions and crown; the
                         elevator's brass doors and its floor dial; the champagne
                         fountain's marble basin and its tower of coupes; the high-limit poker table
                         (violet baize, black leather rail) with its three chairs and the Baron's at
                         its end, chips stacked high; the half-moon baccarat table (its Player,
                         Banker and Tie boxes before each stool, the shoe) and its stools, the
                         Duchess's among them; the Golden Vault slot machine; a velvet loveseat under
                         the windows; two potted palms; the brass rail along the open front (nothing
                         hangs from the ceiling: it would come between the camera and the tables;
                         the game lights the room)
    Prop_FountainTop   the tower's crowning coupe and the bottle pouring into it (the game turns
                       it slowly, champagne bubbles rising off it)

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y), as in the hall's builder.
"""

import json
import math
import os
import re
import traceback

import bpy
from mathutils import Vector


def _root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_casino_vip.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# the hall's kit: everything in build_casino.py above its build()
_hall = open(os.path.join(_root(), "scripts", "blender", "build_casino.py"), encoding="utf-8").read()
exec(compile(_hall[: _hall.index("def build(root):")], "build_casino.py", "exec"), globals())

COLLECTION = "CasinoVip"
REPO_ROOT = _root()

PALETTE.update(
    {
        "CS_VipCarpet": "#3A1446",
        "CS_VipCarpetDeep": "#2A0E36",
        "CS_VipWall": "#22112C",
        "CS_FeltViolet": "#3B1E5A",
        "CS_FeltBacc": "#4A1030",
        "CS_BaccBlue": "#2C5AA8",
        "CS_BaccRed": "#B03542",
        "CS_BaccGreen": "#2F8A5A",
        "CS_VaultGold": "#E0B44A",
        "CS_VaultDark": "#4A3312",
        "CS_Glass": "#E6EEF2",
        "CS_Champagne": "#F6DC8A",
        "CS_Plaque": "#F1E6C8",
        "CS_BorderDiamond": "#2A2527",
        # the city through the windows
        "CS_CitySky": "#0B0F2A",
        "CS_CitySkyLow": "#1C1840",
        "CS_CityDusk": "#4A2A5E",
        "CS_CityGlow": "#8A4A6E",
        "CS_CityTower": "#060814",
        "CS_CityTowerFar": "#121433",
        "CS_CityLit": "#FFD27A",
        "CS_CityLitCool": "#A8CCFF",
        "CS_CityLitPink": "#FF9ACB",
        "CS_CityBeacon": "#FF5A5A",
        "CS_CityMoon": "#FFF3D6",
    }
)
CITY = {k for k in PALETTE if k.startswith("CS_City")}
GLOW |= {"CS_Champagne"}
SHEEN |= {"CS_VaultGold", "CS_Glass", "CS_Plaque"}
DECAL1 |= {"CS_VipCarpetDeep"}
DECAL2 |= {"CS_BaccBlue", "CS_BaccRed", "CS_BaccGreen", "CS_BorderDiamond"}
CATEGORIES["CS_City"] = 0.8
_hall_category = category


def category(name):
    return "CS_City" if name in CITY else _hall_category(name)


def read_vip_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "casino_vip.ts"), encoding="utf-8").read()
    body = re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1)
    return json.loads(body)


# ---------------------------------------------------------------------------------------------
# flat panels: a wafer on the back wall's face (+z) or the left wall's (+x), one colour


def quad_z(M, x0, x1, y0, y1, z, mat):
    vslab(M, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z, z + 0.002, mat)


def quad_x(M, z0, z1, y0, y1, x, mat):
    xslab(M, [(z0, y0), (z1, y0), (z1, y1), (z0, y1)], x, x + 0.002, mat)


def rng(seed):
    s = [seed & 0xFFFFFFFF or 1]

    def r():
        s[0] = (s[0] * 1664525 + 1013904223) & 0xFFFFFFFF
        return s[0] / 4294967296

    return r


# ---------------------------------------------------------------------------------------------
# the floor


def build_floor(M, V):
    h = V["half"]
    slab(M, [(-h, -h), (h, -h), (h, h), (-h, h)], -0.6, 0.0, "CS_Slab", top="CS_VipCarpet")
    # the marble border, a band of dark diamonds set in it
    b = 0.5
    for x0, x1, z0, z1 in ((-h, h, -h, -h + b), (-h, h, h - b, h), (-h, -h + b, -h + b, h - b), (h - b, h, -h + b, h - b)):
        box(M, x0, x1, 0.0, FLOOR_ZONE, z0, z1, "CS_FloorMarbleLight")
    for k in range(10):
        c = -h + 0.5 + k * (2 * h - 1.0) / 9
        for cx, cz in ((c, -h + b / 2), (c, h - b / 2), (-h + b / 2, c), (h - b / 2, c)):
            slab(M, [(cx, cz - 0.13), (cx + 0.13, cz), (cx, cz + 0.13), (cx - 0.13, cz)], 0.0, INLAY_ON_ZONE, "CS_BorderDiamond")
    # gold inlays: a frame inside the border, a second one in from it
    frame_strips(M, -h + b + 0.08, h - b - 0.08, -h + b + 0.08, h - b - 0.08, 0.05, 0.0, INLAY, "CS_Inlay")
    frame_strips(M, -h + b + 0.3, h - b - 0.3, -h + b + 0.3, h - b - 0.3, 0.025, 0.0, INLAY, "CS_Inlay")
    # the medallion round the fountain: a deep violet disc, a gold ring and a sunburst of rays
    f = V["fountain"]
    fx, fz = f["x"], f["z"]
    slab(M, circle(fx, fz, 1.45, 40), 0.0, FLOOR_ZONE, "CS_VipCarpetDeep")
    band(M, circle(fx, fz, 1.5, 40), circle(fx, fz, 1.44, 40), 0.0, INLAY_ON_ZONE, "CS_Inlay")
    band(M, circle(fx, fz, 1.05, 32), circle(fx, fz, 1.01, 32), 0.0, INLAY_ON_ZONE, "CS_Inlay")
    for k in range(16):
        a = 2 * math.pi * k / 16
        r0, r1 = 1.55, 1.95 if k % 2 == 0 else 1.75
        w = 0.07
        pts = [(fx + r0 * math.cos(a - w), fz + r0 * math.sin(a - w)), (fx + r1 * math.cos(a), fz + r1 * math.sin(a)), (fx + r0 * math.cos(a + w), fz + r0 * math.sin(a + w))]
        slab(M, pts, 0.0, INLAY, "CS_Inlay")
    # Art-Deco fans in the carpet's four corners
    for sx, sz in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        cx, cz = sx * (h - b - 0.4), sz * (h - b - 0.4)
        base = math.atan2(-sz, -sx)
        for k in range(5):
            a = base - 0.6 + 1.2 * k / 4
            pts = [(cx, cz), (cx + 0.55 * math.cos(a - 0.08), cz + 0.55 * math.sin(a - 0.08)), (cx + 0.55 * math.cos(a + 0.08), cz + 0.55 * math.sin(a + 0.08))]
            slab(M, pts, 0.0, INLAY, "CS_Inlay")


# ---------------------------------------------------------------------------------------------
# the two window walls, the city beyond them, the elevator


def city_panel(M, wall, a0, a1, y0, y1, face, seed):
    """The night city through one tall window, from `a0` to `a1` along the wall (x on the back
    wall, z on the left one): a sky banded down to a violet dusk, far towers, near towers with lit
    windows, a beacon or two. Each layer a hair nearer the room than the last."""
    r = rng(seed)
    quad = (lambda u0, u1, v0, v1, d, mat: quad_z(M, u0, u1, v0, v1, face + d, mat)) if wall == "z" else (lambda u0, u1, v0, v1, d, mat: quad_x(M, u0, u1, v0, v1, face + d, mat))
    bands = (("CS_CitySky", 0.62, 1.0), ("CS_CitySkyLow", 0.4, 0.62), ("CS_CityDusk", 0.2, 0.4), ("CS_CityGlow", 0.0, 0.2))
    for mat, t0, t1 in bands:
        quad(a0, a1, y0 + (y1 - y0) * t0, y0 + (y1 - y0) * t1, 0.0, mat)
    span = a1 - a0
    # far towers
    u = a0
    while u < a1 - 0.05:
        w = 0.12 + r() * 0.2
        top = y0 + (y1 - y0) * (0.25 + r() * 0.3)
        quad(u, min(a1, u + w), y0, top, 0.004, "CS_CityTowerFar")
        u += w + r() * 0.04
    # near towers with lit windows
    u = a0
    while u < a1 - 0.08:
        w = 0.18 + r() * 0.28
        u1 = min(a1, u + w)
        top = y0 + (y1 - y0) * (0.35 + r() * 0.5)
        quad(u, u1, y0, top, 0.008, "CS_CityTower")
        if r() < 0.35:
            quad((u + u1) / 2 - 0.012, (u + u1) / 2 + 0.012, top, top + 0.025, 0.009, "CS_CityBeacon")
        cols = max(1, int((u1 - u) / 0.07))
        rows = max(1, int((top - y0 - 0.1) / 0.09))
        for j in range(rows):
            for i in range(cols):
                if r() < 0.42:
                    wx = u + 0.03 + i * (u1 - u - 0.04) / cols
                    wy = y0 + 0.06 + j * 0.09
                    lit = r()
                    mat = "CS_CityLit" if lit < 0.7 else "CS_CityLitCool" if lit < 0.9 else "CS_CityLitPink"
                    quad(wx, wx + 0.028, wy, wy + 0.04, 0.012, mat)
        u = u1 + r() * 0.05
    return span


def build_walls(M, V):
    h = V["half"]
    t = V["walls"]["t"]
    top = V["walls"]["h"]
    face = -h + t
    box(M, -h, h, 0.0, top, -h, face, "CS_VipWall")
    box(M, -h, face, 0.0, top, face, h, "CS_VipWall")
    el = V["elevator"]
    ex0, ex1 = el["x"] - el["w"] / 2 - 0.25, el["x"] + el["w"] / 2 + 0.25
    wy0, wy1 = 0.62, top - 0.42
    # the back wall's windows: panes between gold mullions, round the elevator
    def panes(a0, a1, n):
        return [(a0 + (a1 - a0) * k / n, a0 + (a1 - a0) * (k + 1) / n) for k in range(n)]

    back_runs = [(face + 0.05, ex0 - 0.1, 5), (ex1 + 0.1, h - 0.05, 2)]
    left_runs = [(face + 0.05, V["vault"]["z"] - V["vault"]["w"] / 2 - 0.2, 5), (V["vault"]["z"] + V["vault"]["w"] / 2 + 0.2, h - 0.05, 2)]
    seed = 7
    for a0, a1, n in back_runs:
        city_panel(M, "z", a0, a1, wy0, wy1, face, seed)
        seed += 11
        for u0, u1 in panes(a0, a1, n):
            box(M, u0 - 0.03, u0 + 0.03, wy0, wy1, face, face + 0.06, "CS_Gold")
        box(M, a1 - 0.03, a1 + 0.03, wy0, wy1, face, face + 0.06, "CS_Gold")
        box(M, a0 - 0.05, a1 + 0.05, wy0 - 0.06, wy0, face, face + 0.12, "CS_Gold")
        box(M, a0 - 0.05, a1 + 0.05, wy1, wy1 + 0.06, face, face + 0.08, "CS_Gold")
        # a transom bar across each run, a little Deco fan over each pane
        box(M, a0, a1, wy1 - 0.45, wy1 - 0.42, face, face + 0.05, "CS_Gold")
    for a0, a1, n in left_runs:
        city_panel(M, "x", a0, a1, wy0, wy1, face, seed)
        seed += 11
        for u0, u1 in panes(a0, a1, n):
            box(M, face, face + 0.06, wy0, wy1, u0 - 0.03, u0 + 0.03, "CS_Gold")
        box(M, face, face + 0.06, wy0, wy1, a1 - 0.03, a1 + 0.03, "CS_Gold")
        box(M, face, face + 0.12, wy0 - 0.06, wy0, a0 - 0.05, a1 + 0.05, "CS_Gold")
        box(M, face, face + 0.08, wy1, wy1 + 0.06, a0 - 0.05, a1 + 0.05, "CS_Gold")
        box(M, face, face + 0.05, wy1 - 0.45, wy1 - 0.42, a0, a1, "CS_Gold")
    # the moon over the back wall's city
    blob(M, -1.2, wy1 - 0.3, face + 0.013, 0.13, 0.13, 0.004, "CS_CityMoon", cuts=2)
    # wainscot under the windows, crown and cornice over them, on both walls
    box(M, face, h, 0.0, wy0 - 0.06, face, face + 0.05, "CS_Mahogany")
    box(M, face, face + 0.05, 0.0, wy0 - 0.06, face + 0.05, h, "CS_Mahogany")
    box(M, face, h, top - 0.3, top - 0.2, face, face + 0.07, "CS_Gold")
    box(M, face, h, top - 0.2, top, face, face + 0.14, "CS_Mahogany")
    box(M, face, face + 0.07, top - 0.3, top - 0.2, face + 0.07, h, "CS_Gold")
    box(M, face, face + 0.14, top - 0.2, top, face + 0.14, h, "CS_Mahogany")
    # the elevator: brass doors in a gilded frame, its floor dial over them, a call button
    ew, eh, ex = el["w"], el["h"], el["x"]
    box(M, ex0 + 0.05, ex1 - 0.05, 0.0, top - 0.3, face, face + 0.02, "CS_VipWall")
    for a, b in ((ex - ew / 2, ex - 0.01), (ex + 0.01, ex + ew / 2)):
        box(M, a, b, 0.0, eh, face, face + 0.04, "CS_Brass")
        for k in range(3):
            yy = 0.4 + k * 0.7
            vslab(M, [((a + b) / 2, yy), ((a + b) / 2 + 0.18, yy + 0.3), ((a + b) / 2, yy + 0.6), ((a + b) / 2 - 0.18, yy + 0.3)], face + 0.04, face + 0.05, "CS_Gold")
    for sx in (-1, 1):
        px = ex + sx * (ew / 2 + 0.1)
        box(M, px - 0.1, px + 0.1, 0.0, eh + 0.1, face, face + 0.12, "CS_Gold")
    box(M, ex - ew / 2 - 0.2, ex + ew / 2 + 0.2, eh, eh + 0.18, face, face + 0.14, "CS_Gold")
    dy = eh + 0.5
    arc = [(ex + 0.32 * math.cos(math.pi * k / 12), dy - 0.12 + 0.32 * math.sin(math.pi * k / 12)) for k in range(13)]
    vslab(M, [(ex - 0.34, dy - 0.14)] + arc + [(ex + 0.34, dy - 0.14)], face + 0.02, face + 0.05, "CS_Brass")
    vslab(M, [(ex, dy - 0.12), (ex + 0.02, dy - 0.1), (ex - 0.14, dy + 0.12), (ex - 0.16, dy + 0.1)], face + 0.05, face + 0.06, "CS_Black")
    for k in range(7):
        a = math.pi * k / 6
        blob(M, ex + 0.26 * math.cos(a), dy - 0.12 + 0.26 * math.sin(a), face + 0.055, 0.015, 0.015, 0.006, "CS_Bulb", cuts=1)
    box(M, ex + ew / 2 + 0.26, ex + ew / 2 + 0.38, 1.0, 1.3, face, face + 0.03, "CS_Brass")
    blob(M, ex + ew / 2 + 0.32, 1.18, face + 0.04, 0.025, 0.025, 0.012, "CS_Bulb", cuts=1)


# ---------------------------------------------------------------------------------------------
# the champagne fountain


def coupe(M, x, z, y, s=1.0):
    """A champagne coupe, brimming: a round foot, a thin stem, a shallow bowl, champagne in it."""
    lathe(M, x, z, [(0, 0), (0.045 * s, 0), (0.04 * s, 0.008 * s), (0.008 * s, 0.015 * s), (0.008 * s, 0.075 * s), (0.02 * s, 0.085 * s), (0.065 * s, 0.1 * s), (0.068 * s, 0.112 * s), (0, 0.112 * s)], "CS_Glass", segs=10, y0=y)
    lathe(M, x, z, [(0, 0.1 * s), (0.062 * s, 0.1 * s), (0.062 * s, 0.114 * s), (0, 0.114 * s)], "CS_Champagne", segs=10, y0=y)


def build_fountain(M, V, nodes):
    f = V["fountain"]
    fx, fz, r = f["x"], f["z"], f["r"]
    lathe(M, fx, fz, [(0, 0), (r, 0), (r, 0.06), (r - 0.04, 0.1), (r - 0.02, 0.4), (r, 0.44), (r - 0.08, 0.44), (r - 0.08, 0.36), (0, 0.36)], "CS_MarbleLight", segs=32)
    lathe(M, fx, fz, [(0, 0.36), (r - 0.08, 0.36), (r - 0.08, 0.37), (0, 0.37)], "CS_Champagne", segs=32)
    band(M, circle(fx, fz, r + 0.005, 32), circle(fx, fz, r - 0.02, 32), 0.44, 0.46, "CS_Gold")
    # the pedestal the tower stands on
    lathe(M, fx, fz, [(0, 0.37), (0.2, 0.37), (0.16, 0.42), (0.1, 0.46), (0.1, 0.52), (0.24, 0.54), (0, 0.54)], "CS_Gold", segs=16)
    # the tower of coupes: rings, narrowing, each on the glasses below
    tiers = ((0.44, 10, 0.54), (0.31, 7, 0.655), (0.18, 4, 0.77))
    for rad, n, y in tiers:
        for k in range(n):
            a = 2 * math.pi * k / n + rad
            coupe(M, fx + rad * math.cos(a), fz + rad * math.sin(a), y)
        lathe(M, fx, fz, [(0, y - 0.004), (rad - 0.05, y - 0.004), (rad - 0.05, y), (0, y)], "CS_Glass", segs=16)
    # the crown of the tower (a node: the game turns it) and the bottle pouring into it
    T = Mesh()
    ty = 0.885
    coupe(T, fx, fz, ty, 1.15)
    bx, by, bz = fx + 0.09, ty + 0.3, fz + 0.02
    cylinder(T, (bx, by, bz), (bx - 0.07, by - 0.13, bz - 0.01), 0.045, "CS_BottleGreen", sides=10)
    cylinder(T, (bx - 0.07, by - 0.13, bz - 0.01), (bx - 0.1, by - 0.19, bz - 0.015), 0.017, "CS_Gold", sides=8)
    cylinder(T, (bx - 0.1, by - 0.19, bz - 0.015), (fx, ty + 0.12, fz), 0.006, "CS_Champagne", sides=5)
    blob(T, bx + 0.035, by + 0.06, bz + 0.005, 0.05, 0.02, 0.03, "CS_Plaque", cuts=1, yaw=0.9)
    nodes.append({"name": "Prop_FountainTop", "mesh": T, "origin": (fx, ty, fz), "force": "CS_Sheen"})


# ---------------------------------------------------------------------------------------------
# the tables


def build_poker(M, V, cushions):
    p = V["poker"]
    x, z = p["x"], p["z"]
    top = p["top"]
    hl, hw = p["len"] / 2, p["w"] / 2
    outer = rounded_rect(x - hl, x + hl, z - hw, z + hw, hw, per_corner=10)
    inner = rounded_rect(x - hl + 0.14, x + hl - 0.14, z - hw + 0.14, z + hw - 0.14, hw - 0.14, per_corner=10)
    for sx in (-1, 1):
        lathe(M, x + sx * 0.6, z, [(0, 0), (0.32, 0), (0.32, 0.05), (0.11, 0.12), (0.09, top - 0.14), (0.26, top - 0.08), (0, top - 0.08)], "CS_Black", segs=16)
        lathe(M, x + sx * 0.6, z, [(0, 0.05), (0.325, 0.05), (0.325, 0.07), (0, 0.07)], "CS_Gold", segs=16)
    slab(M, outer, top - 0.08, top - 0.02, "CS_Black")
    band(M, outer, inner, top - 0.02, top + 0.045, "CS_Leather")
    band(M, rounded_rect(x - hl - 0.005, x + hl + 0.005, z - hw - 0.005, z + hw + 0.005, hw, per_corner=10), outer, top - 0.03, top - 0.01, "CS_Gold")
    slab(M, inner, top - 0.02, top, "CS_FeltViolet")
    band(M, inner, rounded_rect(x - hl + 0.16, x + hl - 0.16, z - hw + 0.16, z + hw - 0.16, hw - 0.16, per_corner=10), top, top + 0.003, "CS_FeltGold")
    # the dealer's rack on Boris's side (-z), a stack of plaques
    box(M, x - 0.34, x + 0.34, top, top + 0.045, z - hw + 0.18, z - hw + 0.32, "CS_Black")
    for k, mat in enumerate(("CS_Plaque", "CS_Black", "CS_Gold", "CS_Plaque", "CS_Red", "CS_Gold")):
        box(M, x - 0.3 + k * 0.1, x - 0.22 + k * 0.1, top + 0.045, top + 0.06, z - hw + 0.2, z - hw + 0.3, mat)
    seat = cushions["pokerChair"]["top"]
    for cx in p["chairs"]:
        chair(M, cx, p["chairZ"], math.pi, seat)
        pz = z + (p["chairZ"] - z) * 0.3
        for j in range(4):
            lathe(M, cx - 0.05, pz, [(0, 0), (0.045, 0), (0.045, 0.014), (0, 0.014)], ("CS_Black", "CS_Gold", "CS_Plaque", "CS_Black")[j], segs=10, y0=top + j * 0.015)
    # the Baron's chair at the table's end, his towers of chips, a snifter
    bx, bz = p["baron"]
    chair(M, bx, bz, -math.pi / 2, seat)
    for k, (dx, dz, n) in enumerate(((-0.85, -0.18, 7), (-0.85, 0.0, 9), (-0.85, 0.18, 6), (-0.98, -0.08, 5))):
        for j in range(n):
            lathe(M, bx + dx, bz + dz, [(0, 0), (0.045, 0), (0.045, 0.014), (0, 0.014)], ("CS_Gold", "CS_Black", "CS_Plaque")[(j + k) % 3], segs=10, y0=top + j * 0.015)
    lathe(M, bx - 1.05, bz + 0.28, [(0, 0), (0.04, 0), (0.012, 0.01), (0.01, 0.04), (0.06, 0.08), (0.05, 0.13), (0, 0.13)], "CS_Glass", segs=10, y0=top)
    lathe(M, bx - 1.05, bz + 0.28, [(0, 0.05), (0.05, 0.06), (0.05, 0.075), (0, 0.075)], "CS_BottleAmber", segs=10, y0=top)


def build_baccarat(M, V, cushions):
    b = V["baccarat"]
    cx, cz = b["x"], b["z"]
    r, top = b["r"], b["top"]

    def arc(rad, n=28, a0=-90.0, a1=90.0):
        return [(cx + rad * math.sin(math.radians(a0 + (a1 - a0) * k / n)), cz + rad * math.cos(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]

    for sx in (-1, 1):
        lathe(M, cx + sx * 0.5, cz + 0.35, [(0, 0), (0.24, 0), (0.24, 0.04), (0.08, 0.1), (0.07, top - 0.16), (0.2, top - 0.1), (0, top - 0.1)], "CS_Black", segs=14)
        lathe(M, cx + sx * 0.5, cz + 0.35, [(0, 0.04), (0.245, 0.04), (0.245, 0.06), (0, 0.06)], "CS_Gold", segs=14)
    slab(M, arc(r), top - 0.1, top - 0.02, "CS_Black")
    slab(M, arc(r - 0.12), top - 0.02, top, "CS_FeltBacc")
    band(M, arc(r + 0.02), arc(r - 0.12), top - 0.02, top + 0.05, "CS_Leather", closed=False)
    band(M, arc(r + 0.03), arc(r + 0.015), top - 0.035, top - 0.015, "CS_Gold", closed=False)
    box(M, cx - r, cx + r, top - 0.02, top + 0.03, cz - 0.02, cz + 0.08, "CS_Black")
    # the markings: a gold arc, then before each player's place the Player, Banker and Tie boxes
    band(M, arc(0.5), arc(0.485), top, top + 0.003, "CS_FeltGold", closed=False)
    for deg in b["stoolAngles"] + [b["duchess"]]:
        a = math.radians(deg)
        for rad, mat in ((0.92, "CS_BaccBlue"), (0.76, "CS_BaccRed"), (0.62, "CS_BaccGreen")):
            px, pz = cx + rad * math.sin(a), cz + rad * math.cos(a)
            obox(M, px, pz, a, -0.055, 0.055, -0.1, 0.1, top, top + 0.003, mat)
    # the shoe and the discard tray on the dealer's flat side, a paddle laid by
    obox(M, cx + 0.45, cz + 0.18, 0.0, -0.07, 0.07, -0.1, 0.1, top, top + 0.09, "CS_Black")
    obox(M, cx + 0.45, cz + 0.18, 0.0, 0.07, 0.085, -0.07, 0.07, top + 0.01, top + 0.08, "CS_Card")
    obox(M, cx + 0.45, cz + 0.18, 0.0, -0.075, 0.075, -0.105, 0.105, top + 0.09, top + 0.1, "CS_Gold")
    obox(M, cx - 0.45, cz + 0.16, 0.0, -0.06, 0.06, -0.08, 0.08, top, top + 0.025, "CS_Gold")
    cylinder(M, (cx - 0.1, top + 0.01, cz + 0.2), (cx + 0.25, top + 0.01, cz + 0.2), 0.01, "CS_Mahogany", sides=6)
    obox(M, cx - 0.15, cz + 0.2, math.pi / 2, -0.05, 0.05, -0.04, 0.04, top, top + 0.012, "CS_Mahogany")
    # the stools (the Duchess's among them)
    seat = cushions["barStool"]["top"]
    for deg in b["stoolAngles"] + [b["duchess"]]:
        a = math.radians(deg)
        stool(M, cx + b["stoolR"] * math.sin(a), cz + b["stoolR"] * math.cos(a), seat)
    # the Duchess's glass of champagne at her place
    a = math.radians(b["duchess"])
    coupe(M, cx + 0.98 * math.sin(a) + 0.08, cz + 0.98 * math.cos(a) - 0.05, top, 1.0)


def build_vault(M, V):
    """The Golden Vault against the left window wall, facing the room: a gold cabinet with a bank
    vault's door on its front (spoked wheel, bolts), three reels in a gold frame, a marquee of
    chasing bulbs under a crown, a lever with a ruby knob."""
    v = V["vault"]
    F = Frame(v["x"], v["z"], math.pi / 2)
    hw, hd, H = v["w"] / 2, v["d"] / 2, v["h"]
    F.box(M, -hw - 0.02, hw + 0.02, 0.0, 0.08, -hd, hd + 0.02, "CS_Black")
    F.box(M, -hw, hw, 0.08, 0.95, -hd, hd, "CS_VaultGold")
    # the vault door: a round plate, its spoked wheel and bolts round the rim
    dz = hd + 0.001
    for k in range(20):
        a0, a1 = 2 * math.pi * k / 20, 2 * math.pi * (k + 1) / 20
        F.face_slab(M, [(0, 0.52), (0.33 * math.cos(a0), 0.52 + 0.33 * math.sin(a0)), (0.33 * math.cos(a1), 0.52 + 0.33 * math.sin(a1))], dz, dz + 0.03, "CS_Chrome")
    F.cyl(M, (0, 0.52, dz + 0.03), (0, 0.52, dz + 0.09), 0.05, "CS_Gold", sides=12)
    for k in range(6):
        a = 2 * math.pi * k / 6
        F.cyl(M, (0, 0.52, dz + 0.07), (0.22 * math.cos(a), 0.52 + 0.22 * math.sin(a), dz + 0.07), 0.013, "CS_Gold", sides=6)
        F.blob(M, 0.22 * math.cos(a), 0.52 + 0.22 * math.sin(a), dz + 0.07, 0.025, 0.025, 0.025, "CS_Gold", cuts=1)
    for k in range(12):
        a = 2 * math.pi * k / 12
        F.blob(M, 0.29 * math.cos(a), 0.52 + 0.29 * math.sin(a), dz + 0.035, 0.014, 0.014, 0.01, "CS_Gold", cuts=1)
    # the reels
    F.box(M, -hw, hw, 0.95, 1.0, -hd, hd + 0.04, "CS_Gold")
    F.box(M, -hw + 0.04, hw - 0.04, 1.0, H - 0.5, -hd, hd - 0.12, "CS_VaultDark")
    F.box(M, -0.42, 0.42, 1.12, 1.52, hd - 0.14, hd - 0.11, "CS_SlotScreen")
    for dx in (-0.14, 0.14):
        F.box(M, dx - 0.014, dx + 0.014, 1.12, 1.52, hd - 0.11, hd - 0.1, "CS_Black")
    for u0, u1, v0, v1 in ((-0.45, 0.45, 1.09, 1.12), (-0.45, 0.45, 1.52, 1.55), (-0.45, -0.42, 1.12, 1.52), (0.42, 0.45, 1.12, 1.52)):
        F.box(M, u0, u1, v0, v1, hd - 0.13, hd - 0.09, "CS_Gold")
    # the marquee: black, a double ring of bulbs, a crown on top
    F.box(M, -hw - 0.03, hw + 0.03, H - 0.5, H - 0.1, -hd, hd - 0.06, "CS_VaultGold")
    F.box(M, -hw + 0.06, hw - 0.06, H - 0.44, H - 0.16, hd - 0.06, hd - 0.05, "CS_Black")
    for k in range(9):
        u = -hw + 0.1 + (2 * hw - 0.2) * k / 8
        for yy in (H - 0.4, H - 0.2):
            F.blob(M, u, yy, hd - 0.045, 0.022, 0.022, 0.012, "CS_Bulb", cuts=1)
    F.box(M, -0.28, 0.28, H - 0.34, H - 0.26, hd - 0.05, hd - 0.04, "CS_Gold")
    F.box(M, -hw - 0.05, hw + 0.05, H - 0.1, H - 0.05, -hd - 0.02, hd - 0.04, "CS_Gold")
    for k in range(5):
        u = -0.16 + 0.08 * k
        tip = H + (0.2 if k % 2 == 0 else 0.14)
        F.face_slab(M, [(u - 0.04, H - 0.05), (u + 0.04, H - 0.05), (u, tip)], -0.03, 0.03, "CS_Gold")
        F.blob(M, u, tip + 0.02, 0.0, 0.02, 0.02, 0.02, "CS_Pearl", cuts=1)
    # the lever on its right side, the tray under the door
    F.cyl(M, (hw + 0.02, 1.05, hd - 0.35), (hw + 0.1, 1.6, hd - 0.3), 0.022, "CS_Chrome", sides=8)
    F.blob(M, hw + 0.1, 1.65, hd - 0.3, 0.06, 0.06, 0.06, "CS_Red", cuts=2)
    F.box(M, -0.3, 0.3, 0.12, 0.16, hd - 0.02, hd + 0.1, "CS_Gold")


# ---------------------------------------------------------------------------------------------
# the rest: the loveseat, the palms, the rail


def build_room(M, V, cushions):
    ls = V["loveseat"]
    loveseat(M, ls["x"], ls["z"], ls["len"], cushions["chesterfield"]["top"])
    for p in V["planters"]:
        palm(M, p["x"], p["z"], 0.95)
    # the brass rail along the open front, low (the camera looks over it)
    h = V["half"]
    e = h - 0.1
    for (ax, az), (bx, bz) in (((-h + 0.25, e), (e, e)), ((e, e), (e, -h + 0.25))):
        cylinder(M, (ax, 0.34, az), (bx, 0.34, bz), 0.03, "CS_Brass", sides=10)
        n = max(1, round(math.hypot(bx - ax, bz - az) / 1.3))
        for k in range(n + 1):
            px, pz = ax + (bx - ax) * k / n, az + (bz - az) * k / n
            cylinder(M, (px, 0.0, pz), (px, 0.34, pz), 0.022, "CS_Brass", sides=8)


# ---------------------------------------------------------------------------------------------


def shift_mesh(M, dx, dz):
    """Moves a finished mesh by (dx, dz) in the game's plane (out to the suite's place in the world)."""
    d = W(dx, 0.0, dz) - W(0.0, 0.0, 0.0)
    for v in M.bm.verts:
        v.co += d


def build(root):
    purge()
    V = read_vip_layout(root)
    cushions = read_cushions(root)
    ox, oz = V["offset"]
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    M = Mesh()
    nodes = []
    build_floor(M, V)
    build_walls(M, V)
    build_fountain(M, V, nodes)
    build_poker(M, V, cushions)
    build_baccarat(M, V, cushions)
    build_vault(M, V)
    build_room(M, V, cushions)
    shift_mesh(M, ox, oz)
    make_object("Casino_VipStatic", M, coll)
    for n in nodes:
        shift_mesh(n["mesh"], ox, oz)
        o = n["origin"]
        make_object(n["name"], n["mesh"], coll, origin=(o[0] + ox, o[1], o[2] + oz), force=n.get("force"))
    return coll, V, cushions


def export(coll, path):
    layer = bpy.context.view_layer
    layer.update()
    for o in layer.objects:
        if o is not None:
            o.select_set(o.name in coll.all_objects)
    kwargs = dict(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=True, export_animations=False, export_draco_mesh_compression_enable=False, export_extras=False, export_vertex_color="ACTIVE")
    while True:
        try:
            bpy.ops.export_scene.gltf(**kwargs)
            return
        except TypeError as err:
            bad = next((k for k in list(kwargs) if k in str(err) and k not in ("filepath", "export_format", "export_apply", "export_yup")), None)
            if not bad:
                raise
            kwargs.pop(bad)


def summary(coll):
    out = {}
    for o in coll.all_objects:
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": [m.name for m in o.data.materials]}
    return {"objects": out, "checks": {"drawCalls": sum(len(v["materials"]) for v in out.values()), "tris": sum(v["tris"] for v in out.values())}}


def main_vip():
    report = globals().get("REPORT_PATH")
    try:
        root = _root()
        studio(root, "begin")
        coll, V, cushions = build(root)
        out = os.path.join(root, "client", "public", "models", "casino_vip.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main_vip()
