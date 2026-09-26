"""The Velvet Casino: builds client/public/models/casino.glb.

Run it inside Blender, through the Live Bridge (it runs the "code" field of a POSTed JSON body,
queued: nothing comes back, and it execs with separate globals and locals, so run this file inside
a namespace of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes
to REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_casino.py

Nothing is placed by hand: where everything stands comes from CASINO_LAYOUT in
shared/worlds/casino.ts (the JSON between its layout markers, read as is), and every seat's
height from its cushion in shared/seats.ts (barStool, pokerChair, clubChair, ottoman, pianoBench,
chesterfield): the same numbers the walkable floor, the colliders and the seat anchors are derived
from. A mid-century Art-Deco hall in matte clay, every material opaque.

Every colour is a VERTEX colour, and the faces share six materials by finish, so the whole static
hall costs six draw calls however much is in it:

    CS_Clay     matte (roughness 0.85): the carpet, the walls, wood, velvet, felt, leaves, fur
    CS_Sheen    a touch smoother (0.5): gold, brass, chrome, black lacquer, marble, mirror, leather
    CS_Glow     the lamps' bulbs, the chandeliers' crystal, the slot screens, the torches' flames,
                Madame Zara's crystal ball (the game draws it unlit, at full brightness)
    CS_Neon     Neon Alley's pink and cyan tubes and floor strip (unlit, breathing)
    CS_Decal1   the zone floors lying on the carpet (the foyer's marble, the alley's terrazzo)
    CS_Decal2   what lies on those, and on the felt: the gold inlays, the runner, the tables' markings

(the game nudges the two decal layers toward the camera in the depth test: never a flicker).

    Casino_Static        everything that stands still, merged into ONE object:
                           the slab and its floors (burgundy velvet carpet with gold inlays: a
                           sunburst round the roulette table, arcs round the blackjack crescent; a
                           black and white marble checker in the foyer with a velvet runner from
                           the doors; dark terrazzo edged with a cyan neon strip in Neon Alley),
                           brass divider strips where one floor meets another; the High-Roller Pit
                           raised 0.35 (emerald carpet, brass-nosed double steps at its open corner,
                           brass cheeks where the ropes end) and the Velvet Lounge raised 0.25
                           (mahogany planks, a mahogany edge trim, two steps all along its open
                           sides); the two back walls (oxblood, mahogany wainscot, gold rail and
                           crown, fluted pilasters, fan sconces), the grand doors, the Big-Win
                           marquee's frame, four ancestral portraits and a fifth over the cage, two
                           sunburst mirrors, the VIP room's padded double doors; four fluted torch
                           columns; the Golden Cage; the palms, the ottoman, the fern planters;
                           Madame Zara's booth (the lady herself inside) and the capsule machine;
                           the roulette table, the craps table, three half-moon blackjack tables in
                           a crescent round a pit boss's podium, their stools; the slot row and its
                           neon header, the Turf Club's race table, the coin pusher; the poker
                           table, its chairs and the velvet ropes; the bar, the back bar (bottles,
                           mirror, an espresso machine), the stools, the billiards table and its
                           lamp, the Chesterfield and its coffee table (The Velvet Gazette on it),
                           the cocktail tables and club chairs, the baby grand; the dealers' tip
                           jars; the brass rail along the front edges; four crystal chandeliers
    Prop_RouletteWheel   the wheel (its origin at its centre on the felt): the game spins it
    Prop_Marquee         the Big-Win marquee's screen: a quad with UVs the game paints the news on
    Prop_ZaraOwl         Madame Zara's animatronic brass owl on her booth's roof,
      Prop_ZaraOwlHead   its head (pivoting at the neck: it swivels, and hoots at a reading)
    Prop_CrapsDie1/2     the two dice on the craps felt (origins at their centres: the game rolls them)
    Prop_DerbyHorse      one horse and rider at the Turf Club's start (the game races five of it)
    Prop_PusherPlate     the coin pusher's sliding plate
    Prop_CueBall         the billiards table's cue ball

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts (and lifts whatever is
built on a stage by its height), so every number below reads as in casino.ts.
"""

import json
import math
import os
import re
import traceback

import bmesh
import bpy
from mathutils import Vector

COLLECTION = "Casino"

PALETTE = {
    "CS_Slab": "#24140F",
    "CS_Carpet": "#5A1424",
    "CS_Inlay": "#C9A24A",
    "CS_MarbleLight": "#E6DED0",
    "CS_MarbleDark": "#2A2527",
    "CS_FloorMarbleLight": "#E6DED0",
    "CS_FloorMarbleDark": "#2A2527",
    "CS_Runner": "#7A1E2E",
    "CS_Terrazzo": "#1E1A2B",
    "CS_PitCarpet": "#143D30",
    "CS_Plank": "#5C3120",
    "CS_PlankDark": "#472516",
    "CS_Wall": "#3E1620",
    "CS_Wainscot": "#4A2317",
    "CS_Gold": "#D4A93C",
    "CS_Brass": "#C49A45",
    "CS_Mahogany": "#5A2A18",
    "CS_MahoganyDark": "#3A1A10",
    "CS_Felt": "#1F6B45",
    "CS_FeltDark": "#185A39",
    "CS_Velvet": "#7A1E2E",
    "CS_Red": "#A11A22",
    "CS_Black": "#161214",
    "CS_Ivory": "#F2E8D5",
    "CS_Leaf": "#2F6B3F",
    "CS_Trunk": "#6B5236",
    "CS_Rose": "#C2415B",
    "CS_Mirror": "#2B3140",
    "CS_BottleGreen": "#2F6B4F",
    "CS_BottleAmber": "#A0521E",
    "CS_BottleRuby": "#6E1A2A",
    "CS_SlotBody": "#8A1C2B",
    "CS_Chrome": "#C9C4BA",
    "CS_ChromeDark": "#8C877E",
    "CS_Bulb": "#FFD98A",
    "CS_Crystal": "#FFF1D0",
    "CS_SlotScreen": "#FFF3CC",
    "CS_NeonPink": "#FF4FA3",
    "CS_NeonCyan": "#4FE3FF",
    # the felt's markings
    "CS_FeltRed": "#A11A22",
    "CS_FeltBlack": "#161214",
    "CS_FeltLine": "#E8DFC8",
    "CS_FeltGold": "#C9A24A",
    "CS_FeltZero": "#26804F",
    "CS_Card": "#F4EFE4",
    # the expansion
    "CS_Flame": "#FFB347",
    "CS_FlameCore": "#FFE7A3",
    "CS_Leather": "#6B2418",
    "CS_LeatherDark": "#3A120C",
    "CS_Canvas1": "#1F3A2E",
    "CS_Canvas2": "#3E1622",
    "CS_Canvas3": "#1C2440",
    "CS_FoxFur": "#C8612A",
    "CS_FoxWhite": "#F3EBDD",
    "CS_BearFur": "#F2EFE8",
    "CS_OwlBrown": "#7A5A3A",
    "CS_OwlLight": "#D9C3A0",
    "CS_PoodleCream": "#F1E6D2",
    "CS_CatBlack": "#1C1A1F",
    "CS_CatWhite": "#F4F1EA",
    "CS_Eye": "#1B1818",
    "CS_EyeGreen": "#6BBF59",
    "CS_Amber": "#F2A33A",
    "CS_Suit": "#1E2230",
    "CS_Shirt": "#EDEFF2",
    "CS_Pearl": "#FBF8F0",
    "CS_Emerald": "#1F5A3F",
    "CS_ZaraPurple": "#4B2463",
    "CS_ZaraPlum": "#2E1640",
    "CS_ZaraTeal": "#1F6F74",
    "CS_ZaraCream": "#EFE3CF",
    "CS_ZaraMask": "#5A3B2A",
    "CS_ZaraEye": "#6FB7E8",
    "CS_CrystalBall": "#D9C8FF",
    "CS_StarGlow": "#FFE9A8",
    "CS_Bronze": "#A0673A",
    "CS_Copper": "#C07A45",
    "CS_OwlEye": "#FFC24A",
    "CS_CapRed": "#E0473E",
    "CS_CapBlue": "#3E7BE0",
    "CS_CapYellow": "#F2C94C",
    "CS_CapGreen": "#4CB86A",
    "CS_CapPink": "#F27FB2",
    "CS_CapPurple": "#9B6BE0",
    "CS_CapWhite": "#F4F1EA",
    "CS_BallYellow": "#F2C230",
    "CS_BallBlue": "#2F5FBF",
    "CS_BallRed": "#C8322B",
    "CS_BallPurple": "#6B3A99",
    "CS_BallOrange": "#E57A22",
    "CS_BallGreen": "#2E7D46",
    "CS_BallMaroon": "#7A2330",
    "CS_ShadeGreen": "#2F6B4F",
    "CS_JarGlass": "#CFE3E0",
    "CS_Paper": "#EFE8D8",
    "CS_Ink": "#3A3436",
    "CS_HorseCoat": "#E2D6C6",
    "CS_HorseDark": "#6A5A4E",
    "CS_Silk": "#F6F4EE",
    "CS_DieRed": "#C8202E",
    "CS_Pip": "#F7F3EA",
    "CS_Coin": "#E0B44A",
    "CS_Screen": "#120C10",
}

# which of the six shared materials each colour is painted with
GLOW = {"CS_Bulb", "CS_Crystal", "CS_SlotScreen", "CS_Flame", "CS_FlameCore", "CS_CrystalBall", "CS_StarGlow"}
NEON = {"CS_NeonPink", "CS_NeonCyan"}
DECAL1 = {"CS_FloorMarbleLight", "CS_FloorMarbleDark", "CS_Terrazzo"}
DECAL2 = {"CS_Runner", "CS_Inlay", "CS_FeltRed", "CS_FeltBlack", "CS_FeltLine", "CS_FeltGold", "CS_FeltZero", "CS_Card", "CS_Ink"}
SHEEN = {
    "CS_Gold", "CS_Brass", "CS_Chrome", "CS_ChromeDark", "CS_Black", "CS_Mirror", "CS_MarbleLight", "CS_MarbleDark", "CS_JarGlass", "CS_Bronze", "CS_Copper",
    "CS_Coin", "CS_Leather", "CS_LeatherDark", "CS_Pearl", "CS_DieRed", "CS_Pip", "CS_OwlEye",
    "CS_BallYellow", "CS_BallBlue", "CS_BallRed", "CS_BallPurple", "CS_BallOrange", "CS_BallGreen", "CS_BallMaroon",
    "CS_CapRed", "CS_CapBlue", "CS_CapYellow", "CS_CapGreen", "CS_CapPink", "CS_CapPurple", "CS_CapWhite",
    "CS_BottleGreen", "CS_BottleAmber", "CS_BottleRuby", "CS_Ivory",
}
CATEGORIES = {"CS_Clay": 0.85, "CS_Sheen": 0.5, "CS_Glow": 0.8, "CS_Neon": 0.8, "CS_Decal1": 0.8, "CS_Decal2": 0.65}


def category(name):
    if name in GLOW:
        return "CS_Glow"
    if name in NEON:
        return "CS_Neon"
    if name in DECAL1:
        return "CS_Decal1"
    if name in DECAL2:
        return "CS_Decal2"
    if name in SHEEN:
        return "CS_Sheen"
    return "CS_Clay"


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    h = hex_color.lstrip("#")
    return tuple(_lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


# Whatever stands on a stage is built at its own height over the stage and lifted by it here.
LIFT = [0.0]


class lifted:
    def __init__(self, h):
        self.h = h

    def __enter__(self):
        self.old = LIFT[0]
        LIFT[0] = self.h

    def __exit__(self, *exc):
        LIFT[0] = self.old


def W(x, y, z):
    """The game's (x, y up, z) as a Blender point (lifted onto the stage being built on)."""
    return Vector((x, -z, y + LIFT[0]))


# ---------------------------------------------------------------------------------------------
# reading the layout and the cushions out of the game's sources


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_casino.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def read_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "casino.ts"), encoding="utf-8").read()
    body = re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1)
    return json.loads(body)


def read_cushions(root):
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    out = {}
    for name in ("barStool", "pokerChair", "clubChair", "ottoman", "pianoBench", "chesterfield"):
        m = re.search(rf"\b{name}: \{{ y: (-?[0-9.]+), h: ([0-9.]+) \}}", src)
        y, h = float(m.group(1)), float(m.group(2))
        out[name] = {"y": y, "h": h, "top": y + h / 2}
    return out


def stage(L, sid):
    return next(s for s in L["stages"] if s["id"] == sid)


def floor_y(L, x, z):
    """The floor's height at (x, z): shared/worlds/casino.ts casinoFloorY, the same treads."""
    best = 0.0
    for s in L["stages"]:
        if s["x0"] <= x <= s["x1"] and s["z0"] <= z <= s["z1"]:
            best = max(best, s["h"])
            continue
        cx, cz = max(s["x0"], min(s["x1"], x)), max(s["z0"], min(s["z1"], z))
        d = max(abs(x - cx), abs(z - cz))
        if d > s["depth"]:
            continue
        edges = []
        if x > s["x1"]:
            edges.append(("x1", cz))
        if x < s["x0"]:
            edges.append(("x0", cz))
        if z > s["z1"]:
            edges.append(("z1", cx))
        if z < s["z0"]:
            edges.append(("z0", cx))
        if all(any(o["edge"] == e and min(o["from"], o["to"]) - 1e-6 <= a <= max(o["from"], o["to"]) + 1e-6 for o in s["open"]) for e, a in edges):
            k = min(s["count"] - 1, int((d / s["depth"]) * s["count"]))
            best = max(best, s["h"] * (s["count"] - k) / (s["count"] + 1))
    return best


# ---------------------------------------------------------------------------------------------
# a mesh: every part adds its faces to it, each face tagged with its palette colour


class Mesh:
    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def m(self, name):
        """The slot of colour `name` in this mesh (added on first use)."""
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)


def rounded_rect(x0, x1, z0, z1, r, per_corner=6):
    """An (x, z) outline of a rounded rectangle, going round once."""
    r = min(r, (x1 - x0) / 2, (z1 - z0) / 2)
    corners = [(x1 - r, z1 - r, 0.0), (x0 + r, z1 - r, math.pi / 2), (x0 + r, z0 + r, math.pi), (x1 - r, z0 + r, 1.5 * math.pi)]
    out = []
    for cx, cz, a0 in corners:
        for k in range(per_corner + 1):
            a = a0 + (math.pi / 2) * k / per_corner
            out.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return out


def circle(cx, cz, r, n=24):
    return [(cx + r * math.cos(2 * math.pi * k / n), cz + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def slab(M, outline, y0, y1, mat, top=None):
    """The (x, z) `outline` extruded from y0 to y1."""
    bm = M.bm
    lo = [bm.verts.new(W(x, y0, z)) for x, z in outline]
    hi = [bm.verts.new(W(x, y1, z)) for x, z in outline]
    bm.faces.new(list(reversed(lo))).material_index = M.m(mat)
    bm.faces.new(hi).material_index = M.m(top or mat)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = M.m(mat)


def box(M, x0, x1, y0, y1, z0, z1, mat, top=None):
    slab(M, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1, mat, top)


def obox(M, cx, cz, yaw, f0, f1, r0, r1, y0, y1, mat):
    """A box turned to heading `yaw` (0 faces +z): f along the heading, r across it."""
    f = (math.sin(yaw), math.cos(yaw))
    r = (f[1], -f[0])
    pts = [(cx + f[0] * a + r[0] * b, cz + f[1] * a + r[1] * b) for a, b in ((f0, r0), (f1, r0), (f1, r1), (f0, r1))]
    slab(M, pts, y0, y1, mat)


def vslab(M, outline_xy, z0, z1, mat):
    """An (x, y) outline extruded along z from z0 to z1 (a flat shape standing on a wall)."""
    bm = M.bm
    a = [bm.verts.new(W(x, y, z0)) for x, y in outline_xy]
    b = [bm.verts.new(W(x, y, z1)) for x, y in outline_xy]
    bm.faces.new(list(reversed(a))).material_index = M.m(mat)
    bm.faces.new(b).material_index = M.m(mat)
    n = len(outline_xy)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i])).material_index = M.m(mat)


def xslab(M, outline_zy, x0, x1, mat):
    """A (z, y) outline extruded along x from x0 to x1 (a flat shape standing on the x wall)."""
    bm = M.bm
    a = [bm.verts.new(W(x0, y, z)) for z, y in outline_zy]
    b = [bm.verts.new(W(x1, y, z)) for z, y in outline_zy]
    bm.faces.new(list(reversed(a))).material_index = M.m(mat)
    bm.faces.new(b).material_index = M.m(mat)
    n = len(outline_zy)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i])).material_index = M.m(mat)


def band(M, outer, inner, y0, y1, mat, closed=True):
    """The strip between two matching (x, z) outlines, from y0 to y1: a ring (or an arc, open)."""
    bm = M.bm
    n = len(outer)
    oa = [bm.verts.new(W(x, y0, z)) for x, z in outer]
    ob = [bm.verts.new(W(x, y1, z)) for x, z in outer]
    ia = [bm.verts.new(W(x, y0, z)) for x, z in inner]
    ib = [bm.verts.new(W(x, y1, z)) for x, z in inner]
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        for quad in ((ob[i], ob[j], ib[j], ib[i]), (oa[j], oa[i], ia[i], ia[j]), (oa[i], oa[j], ob[j], ob[i]), (ia[j], ia[i], ib[i], ib[j])):
            bm.faces.new(quad).material_index = M.m(mat)
    if not closed:
        for k in (0, n - 1):
            bm.faces.new((oa[k], ob[k], ib[k], ia[k])).material_index = M.m(mat)


def cylinder(M, a, b, r, mat, sides=12, r_end=None):
    """A round bar between the game points a and b, radius r (tapering to r_end), capped."""
    bm = M.bm
    pa, pb = W(*a), W(*b)
    axis = (pb - pa).normalized()
    n = axis.orthogonal().normalized()
    q = axis.cross(n)
    re_ = r if r_end is None else r_end
    ring_a = [bm.verts.new(pa + (n * math.cos(t) + q * math.sin(t)) * r) for t in (2 * math.pi * k / sides for k in range(sides))]
    ring_b = [bm.verts.new(pb + (n * math.cos(t) + q * math.sin(t)) * re_) for t in (2 * math.pi * k / sides for k in range(sides))]
    for k in range(sides):
        k1 = (k + 1) % sides
        f = bm.faces.new((ring_a[k], ring_a[k1], ring_b[k1], ring_b[k]))
        f.material_index = M.m(mat)
        f.smooth = True
    for ring in (ring_a, list(reversed(ring_b))):
        bm.faces.new(ring).material_index = M.m(mat)


def lathe(M, cx, cz, profile, mat, segs=16, y0=0.0):
    """A solid of revolution about the vertical through (cx, cz): (radius, height) points from the
    bottom centre (r = 0) to the top centre (r = 0)."""
    bm = M.bm
    bottom = bm.verts.new(W(cx, y0 + profile[0][1], cz))
    top = bm.verts.new(W(cx, y0 + profile[-1][1], cz))
    rings = [[bm.verts.new(W(cx + r * math.cos(2 * math.pi * k / segs), y0 + h, cz + r * math.sin(2 * math.pi * k / segs))) for k in range(segs)] for r, h in profile[1:-1]]
    faces = []
    for k in range(segs):
        k1 = (k + 1) % segs
        faces.append(bm.faces.new((bottom, rings[0][k1], rings[0][k])))
        faces.append(bm.faces.new((top, rings[-1][k], rings[-1][k1])))
        for r0, r1 in zip(rings, rings[1:]):
            faces.append(bm.faces.new((r0[k], r0[k1], r1[k1], r1[k])))
    for f in faces:
        f.material_index = M.m(mat)
        f.smooth = True


def blob(M, cx, cy, cz, hx, hy, hz, mat, cuts=3, n=2.2, yaw=0.0, droop=0.0, pitch=0.0):
    """A rounded lump (a superellipsoid) centred at the game point (cx, cy, cz), its x half-size
    along heading `yaw`; `droop` bends its ends down (a palm frond), `pitch` tips it forward."""
    bm = M.bm
    for v in bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    new = [v for v in bm.verts if not v.tag]
    c, s = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    for v in new:
        d = v.co.normalized()
        k = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)
        q = d / k
        lx, ly, lz = q.x * hx, q.z * hy, -q.y * hz
        ly -= droop * (q.x * q.x)
        ly, lz = ly * cp - lz * sp, ly * sp + lz * cp
        v.co = W(cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c)
    for f in {f for v in new for f in v.link_faces}:
        f.material_index = M.m(mat)
        f.smooth = True
    for v in bm.verts:
        v.tag = False


# on a wall: `u` across it (to the viewer's right), `v` up, `d` out of it into the room


def wall_face(L):
    return -L["half"] + L["walls"]["t"]


def wbox(M, L, wall, at, u0, u1, v0, v1, d0, d1, mat):
    face = wall_face(L)
    if wall == "z":
        box(M, at + u0, at + u1, v0, v1, face + d0, face + d1, mat)
    else:
        box(M, face + d0, face + d1, v0, v1, at - u1, at - u0, mat)


def wblob(M, L, wall, at, u, v, d, hu, hv, hd, mat, cuts=2, n=2.2):
    face = wall_face(L)
    if wall == "z":
        blob(M, at + u, v, face + d, hu, hv, hd, mat, cuts=cuts, n=n)
    else:
        blob(M, face + d, v, at - u, hu, hv, hd, mat, cuts=cuts, n=n, yaw=math.pi / 2)


def wshape(M, L, wall, at, outline_uv, d0, d1, mat):
    """A flat (u, v) outline standing out of a wall from d0 to d1."""
    face = wall_face(L)
    if wall == "z":
        vslab(M, [(at + u, v) for u, v in outline_uv], face + d0, face + d1, mat)
    else:
        xslab(M, [(at - u, v) for u, v in outline_uv], face + d0, face + d1, mat)


def wbar(M, L, wall, at, a, b, d, r, mat, sides=8):
    """A round bar along a wall between (u, v) points a and b, `d` out of it."""
    face = wall_face(L)
    if wall == "z":
        cylinder(M, (at + a[0], a[1], face + d), (at + b[0], b[1], face + d), r, mat, sides=sides)
    else:
        cylinder(M, (face + d, a[1], at - a[0]), (face + d, b[1], at - b[0]), r, mat, sides=sides)


# ---------------------------------------------------------------------------------------------
# Blender plumbing: six shared materials, vertex colours


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
    """A shared finish: its colour comes from the faces' vertex colours."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    if name == "CS_Screen":
        bsdf.inputs["Base Color"].default_value = (*lin(PALETTE["CS_Screen"]), 1)
    else:
        attr = next((n for n in nodes if n.type == "VERTEX_COLOR"), None) or nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    rough = CATEGORIES.get(name, 0.8)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    m.roughness = rough
    m.use_backface_culling = True
    return m


def make_object(name, M, coll, origin=None, force=None, parent=None, recalc=True, coloured=True):
    """The mesh `M` as an object `name`, its origin at the game point `origin` (under `parent`, whose
    own origin is `parent["origin"]`). Each face is painted its colour and given its finish's
    material (`force`: one finish for the whole object, a single draw call). Its faces are turned to
    face outward first (the three.js runtime culls back faces)."""
    bm = M.bm
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    cats = []
    if coloured:
        col = bm.loops.layers.float_color.new("Col")
        rgba = [(*lin(PALETTE[c]), 1.0) for c in M.mats]
        for f in bm.faces:
            cat = force or category(M.mats[f.material_index])
            for loop in f.loops:
                loop[col] = rgba[f.material_index]
            if cat not in cats:
                cats.append(cat)
            f.material_index = cats.index(cat)
    else:
        cats = [force or "CS_Screen"]
        for f in bm.faces:
            f.material_index = 0
    me = bpy.data.meshes.new(name + "Mesh")
    if origin is not None:
        shift = W(*origin)
        for v in bm.verts:
            v.co -= shift
    bm.to_mesh(me)
    bm.free()
    for c in cats:
        me.materials.append(material(c))
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob["origin"] = list(origin) if origin is not None else [0.0, 0.0, 0.0]
    if parent is not None:
        ob.parent = parent
        po = parent["origin"]
        ob.location = W(origin[0] - po[0], origin[1] - po[1], origin[2] - po[2])
    elif origin is not None:
        ob.location = W(*origin)
    return ob


# ---------------------------------------------------------------------------------------------
# the floor: the slab, the carpet, the foyer's marble, the alley's terrazzo, the gold inlays, the
# brass dividers


FLOOR_ZONE = 0.006  # a zone's floor over the carpet
INLAY = 0.004  # a gold inlay over the carpet
INLAY_ON_ZONE = FLOOR_ZONE + 0.003  # ... and over a zone's floor


def zone(L, zid):
    return next(z for z in L["zones"] if z["id"] == zid)


def frame_strips(M, x0, x1, z0, z1, w, y0, y1, mat):
    """A rectangle's outline as four strips `w` wide, just inside it."""
    box(M, x0, x1, y0, y1, z0, z0 + w, mat)
    box(M, x0, x1, y0, y1, z1 - w, z1, mat)
    box(M, x0, x0 + w, y0, y1, z0 + w, z1 - w, mat)
    box(M, x1 - w, x1, y0, y1, z0 + w, z1 - w, mat)


def build_floor(M, L):
    h = L["half"]
    # the slab: dark sides, the burgundy velvet carpet on top (the whole main floor)
    slab(M, [(-h, -h), (h, -h), (h, h), (-h, h)], -0.6, 0.0, "CS_Slab", top="CS_Carpet")

    # 1 the foyer: a black and white marble checker, a velvet runner from the doors to the ottoman
    f = zone(L, "foyer")
    cols, rows = 12, 8
    tw, td = (f["x1"] - f["x0"]) / cols, (f["z1"] - f["z0"]) / rows
    for i in range(cols):
        for j in range(rows):
            box(M, f["x0"] + i * tw, f["x0"] + (i + 1) * tw, 0.0, FLOOR_ZONE, f["z0"] + j * td, f["z0"] + (j + 1) * td, "CS_FloorMarbleLight" if (i + j) % 2 == 0 else "CS_FloorMarbleDark")
    d = L["doors"]
    runner_end = L["ottoman"]["z"] - L["ottoman"]["r"] - 0.35
    box(M, d["x"] - 0.6, d["x"] + 0.6, FLOOR_ZONE, FLOOR_ZONE + 0.004, -h + 0.2, runner_end, "CS_Runner")
    for sx in (-1, 1):
        x = d["x"] + sx * 0.6
        box(M, min(x, x - sx * 0.07), max(x, x - sx * 0.07), FLOOR_ZONE + 0.004, FLOOR_ZONE + 0.009, -h + 0.2, runner_end, "CS_Inlay")
    frame_strips(M, f["x0"], f["x1"], f["z0"], f["z1"], 0.08, FLOOR_ZONE, INLAY_ON_ZONE, "CS_Inlay")

    # 3 Neon Alley: dark terrazzo, a cyan neon strip just inside its open edge
    a = zone(L, "alley")
    box(M, a["x0"], a["x1"], 0.0, FLOOR_ZONE, a["z0"], a["z1"], "CS_Terrazzo")
    box(M, a["x1"] - 0.11, a["x1"] - 0.05, FLOOR_ZONE, INLAY_ON_ZONE + 0.002, a["z0"] + 0.1, a["z1"] - 0.1, "CS_NeonCyan")

    # 2 the main floor: a gold octagon and a sunburst round the roulette table
    rx, rz = L["roulette"]["x"], L["roulette"]["z"]
    band(M, circle(rx, rz, 2.4, 8), circle(rx, rz, 2.33, 8), 0.0, INLAY, "CS_Inlay")
    for k in range(16):
        a0 = 2 * math.pi * (k + 0.35) / 16
        a1 = 2 * math.pi * (k + 0.65) / 16
        am = (a0 + a1) / 2
        slab(M, [(rx + 2.48 * math.cos(a0), rz + 2.48 * math.sin(a0)), (rx + 3.0 * math.cos(am), rz + 3.0 * math.sin(am)), (rx + 2.48 * math.cos(a1), rz + 2.48 * math.sin(a1))], 0.0, INLAY, "CS_Inlay")
    # ... and gold arcs round the blackjack crescent: the dealers' side, and a double line outside the
    # stools, lozenges on it where each table's axis crosses
    b = L["blackjack"]
    cx, cz = b["centre"]

    def arc_pts(rad, a0, a1, n):
        return [(cx - rad * math.cos(math.radians(a)), cz + rad * math.sin(math.radians(a))) for a in (a0 + (a1 - a0) * k / n for k in range(n + 1))]

    for rad, w in ((3.05, 0.06), (7.0, 0.08), (7.18, 0.03)):
        band(M, arc_pts(rad + w / 2, -76, 76, 48), arc_pts(rad - w / 2, -76, 76, 48), 0.0, INLAY, "CS_Inlay", closed=False)
    for deg in b["angles"]:
        a = math.radians(deg)
        mx, mz = cx - 7.09 * math.cos(a), cz + 7.09 * math.sin(a)
        slab(M, [(mx - 0.22, mz), (mx, mz - 0.22), (mx + 0.22, mz), (mx, mz + 0.22)], 0.0, INLAY + 0.001, "CS_Inlay")


def divider(M, a, b):
    """A brass divider strip where two floors meet, along a line from (x, z) a to b: a 20 mm bevel
    (60 mm at its foot, 30 mm on top)."""
    (ax, az), (bx, bz) = a, b
    if abs(ax - bx) < 1e-6:
        vslab(M, [(ax - 0.03, 0.0), (ax + 0.03, 0.0), (ax + 0.015, 0.02), (ax - 0.015, 0.02)], min(az, bz), max(az, bz), "CS_Brass")
    else:
        xslab(M, [(az - 0.03, 0.0), (az + 0.03, 0.0), (az + 0.015, 0.02), (az - 0.015, 0.02)], min(ax, bx), max(ax, bx), "CS_Brass")


def build_dividers(M, L):
    face = wall_face(L)
    f = zone(L, "foyer")
    divider(M, (f["x0"], face), (f["x0"], f["z1"]))
    divider(M, (f["x0"], f["z1"]), (L["half"], f["z1"]))
    a = zone(L, "alley")
    divider(M, (a["x1"], a["z0"]), (a["x1"], a["z1"]))
    divider(M, (face, a["z0"]), (a["x1"], a["z0"]))


# ---------------------------------------------------------------------------------------------
# the stages: the High-Roller Pit and the Velvet Lounge, raised, with their steps


def tread_boxes(s, k):
    """The (x0, x1, z0, z1) boxes of tread `k` (0: against the stage): the ring `depth / count`
    wide, `k` rings out, round the stage's open runs (a corner between two open runs is stepped
    too; it belongs to the x edge's run)."""
    t = s["depth"] / s["count"]
    a, b = k * t, (k + 1) * t

    def has(edge, v):
        return any(o["edge"] == edge and min(o["from"], o["to"]) - 1e-6 <= v <= max(o["from"], o["to"]) + 1e-6 for o in s["open"])

    out = []
    for o in s["open"]:
        lo, hi = min(o["from"], o["to"]), max(o["from"], o["to"])
        e = o["edge"]
        if e in ("x0", "x1"):
            zlo, zhi = lo, hi
            corner_lo = abs(lo - s["z0"]) < 1e-6 and has("z0", s[e])
            corner_hi = abs(hi - s["z1"]) < 1e-6 and has("z1", s[e])
            if corner_lo:
                zlo = s["z0"] - b
            if corner_hi:
                zhi = s["z1"] + b
            xa, xb = (s["x1"] + a, s["x1"] + b) if e == "x1" else (s["x0"] - b, s["x0"] - a)
            out.append({"box": (xa, xb, zlo, zhi), "edge": e, "corners": (corner_lo, corner_hi)})
        else:
            xlo, xhi = lo, hi
            if abs(lo - s["x0"]) < 1e-6 and has("x0", s[e]):
                xlo = s["x0"] - a
            if abs(hi - s["x1"]) < 1e-6 and has("x1", s[e]):
                xhi = s["x1"] + a
            za, zb = (s["z1"] + a, s["z1"] + b) if e == "z1" else (s["z0"] - b, s["z0"] - a)
            out.append({"box": (xlo, xhi, za, zb), "edge": e, "corners": (False, False)})
    return out


def build_stages(M, L):
    face = wall_face(L)
    for s in L["stages"]:
        h = s["h"]
        pit = s["id"] == "pit"
        top_mat = "CS_PitCarpet" if pit else "CS_Plank"
        trim = "CS_Brass" if pit else "CS_MahoganyDark"
        x0, z0 = max(s["x0"], face), max(s["z0"], face)
        x1, z1 = s["x1"], min(s["z1"], L["half"])
        # the block, and its top: emerald carpet, or mahogany planks in two tones
        box(M, x0, x1, 0.0, h - 0.03, z0, z1, "CS_Mahogany")
        if pit:
            box(M, x0, x1, h - 0.03, h, z0, z1, "CS_PitCarpet")
        else:
            n = max(1, int(round((z1 - z0) / 0.35)))
            step = (z1 - z0) / n
            for k in range(n):
                box(M, x0, x1, h - 0.03, h, z0 + k * step, z0 + (k + 1) * step, "CS_Plank" if k % 2 == 0 else "CS_PlankDark")
        # the edge trim along every side that faces the room: a nosing proud of the edge, a gold line under it
        room_edges = [e for e in ("x1", "z1", "z0") if not (e == "z0" and z0 <= face + 1e-6)]
        for e in room_edges:
            if e == "x1":
                box(M, x1 - 0.02, x1 + 0.03, h - 0.05, h + 0.008, z0, z1, trim)
                if not pit:
                    box(M, x1, x1 + 0.035, h - 0.075, h - 0.05, z0, z1, "CS_Gold")
            elif e == "z1":
                box(M, x0, x1 + 0.03, h - 0.05, h + 0.008, z1 - 0.02, z1 + (0.0 if z1 >= L["half"] - 1e-6 else 0.03), trim)
                if not pit and z1 < L["half"] - 1e-6:
                    box(M, x0, x1, h - 0.075, h - 0.05, z1, z1 + 0.035, "CS_Gold")
            else:
                box(M, x0, x1 + 0.03, h - 0.05, h + 0.008, z0 - 0.03, z0 + 0.02, trim)
                if not pit:
                    box(M, x0, x1, h - 0.075, h - 0.05, z0 - 0.035, z0, "CS_Gold")
        # the steps: `count` treads round the open runs, each riser the same, nosed like the edge
        for k in range(s["count"]):
            th = h * (s["count"] - k) / (s["count"] + 1)
            for t in tread_boxes(s, k):
                bx0, bx1, bz0, bz1 = t["box"]
                bx0, bz0 = max(bx0, face), max(bz0, face)
                bz1 = min(bz1, L["half"])
                box(M, bx0, bx1, 0.0, th - 0.02, bz0, bz1, "CS_Mahogany")
                box(M, bx0, bx1, th - 0.02, th, bz0, bz1, top_mat)
                # the nosing along the tread's outer edge (and round the corner it turns)
                e = t["edge"]
                if e == "x1":
                    box(M, bx1 - 0.03, bx1 + 0.012, th - 0.035, th + 0.006, bz0, bz1, trim)
                    if t["corners"][1]:
                        box(M, bx0, bx1 + 0.012, th - 0.035, th + 0.006, bz1 - 0.03, bz1 + 0.012, trim)
                    if t["corners"][0]:
                        box(M, bx0, bx1 + 0.012, th - 0.035, th + 0.006, bz0 - 0.012, bz0 + 0.03, trim)
                elif e == "x0":
                    box(M, bx0 - 0.012, bx0 + 0.03, th - 0.035, th + 0.006, bz0, bz1, trim)
                elif e == "z1":
                    box(M, bx0, bx1, th - 0.035, th + 0.006, bz1 - 0.03, bz1 + 0.012, trim)
                else:
                    box(M, bx0, bx1, th - 0.035, th + 0.006, bz0 - 0.012, bz0 + 0.03, trim)
        # the pit's steps end in brass-capped cheeks where the ropes meet them (their colliders)
        if pit:
            for o in s["open"]:
                lo = min(o["from"], o["to"])
                if o["edge"] == "x1" and lo > s["z0"]:
                    box(M, s["x1"], s["x1"] + s["depth"], 0.0, h + 0.08, lo - 0.08, lo + 0.08, "CS_Mahogany")
                    box(M, s["x1"] - 0.01, s["x1"] + s["depth"] + 0.01, h + 0.08, h + 0.12, lo - 0.09, lo + 0.09, "CS_Brass")
                    blob(M, s["x1"] + s["depth"], h + 0.17, lo, 0.05, 0.05, 0.05, "CS_Brass", cuts=2)
                if o["edge"] == "z1" and lo > s["x0"]:
                    box(M, lo - 0.08, lo + 0.08, 0.0, h + 0.08, s["z1"], s["z1"] + s["depth"], "CS_Mahogany")
                    box(M, lo - 0.09, lo + 0.09, h + 0.08, h + 0.12, s["z1"] - 0.01, s["z1"] + s["depth"] + 0.01, "CS_Brass")
                    blob(M, lo, h + 0.17, s["z1"] + s["depth"], 0.05, 0.05, 0.05, "CS_Brass", cuts=2)


# ---------------------------------------------------------------------------------------------
# the walls: oxblood over a mahogany wainscot, gold rail and crown, pilasters, fan sconces, doors


def build_walls(M, L):
    h = L["half"]
    t = L["walls"]["t"]
    top = L["walls"]["h"]
    face_z = -h + t  # the back wall's inner face
    face_x = -h + t  # the left wall's inner face
    d = L["doors"]
    dx0, dx1 = d["x"] - d["w"] / 2, d["x"] + d["w"] / 2

    box(M, -h, h, 0.0, top, -h, face_z, "CS_Wall")
    box(M, -h, face_x, 0.0, top, face_z, h, "CS_Wall")
    # wainscot, rail, crown and cornice, along both (the back wall's broken by the door frame)
    for a, b in ((face_x, dx0 - 0.15), (dx1 + 0.15, h)):
        box(M, a, b, 0.0, 1.1, face_z, face_z + 0.05, "CS_Wainscot")
        box(M, a, b, 1.1, 1.16, face_z, face_z + 0.07, "CS_Gold")
    box(M, face_x, face_x + 0.05, 0.0, 1.1, face_z + 0.05, h, "CS_Wainscot")
    box(M, face_x, face_x + 0.07, 1.1, 1.16, face_z + 0.07, h, "CS_Gold")
    box(M, face_x, h, top - 0.25, top - 0.15, face_z, face_z + 0.06, "CS_Gold")
    box(M, face_x, h, top - 0.15, top, face_z, face_z + 0.12, "CS_Mahogany")
    box(M, face_x, face_x + 0.06, top - 0.25, top - 0.15, face_z + 0.06, h, "CS_Gold")
    box(M, face_x, face_x + 0.12, top - 0.15, top, face_z + 0.12, h, "CS_Mahogany")

    # fluted pilasters between the sconces, gold capitals and bases
    def pilaster_z(x):
        box(M, x - 0.15, x + 0.15, 1.16, top - 0.25, face_z, face_z + 0.07, "CS_Mahogany")
        for k in (-1, 0, 1):
            box(M, x + k * 0.08 - 0.012, x + k * 0.08 + 0.012, 1.3, top - 0.45, face_z + 0.07, face_z + 0.08, "CS_Gold")
        box(M, x - 0.19, x + 0.19, top - 0.45, top - 0.25, face_z, face_z + 0.1, "CS_Gold")

    def pilaster_x(z):
        box(M, face_x, face_x + 0.07, 1.16, top - 0.25, z - 0.15, z + 0.15, "CS_Mahogany")
        for k in (-1, 0, 1):
            box(M, face_x + 0.07, face_x + 0.08, 1.3, top - 0.45, z + k * 0.08 - 0.012, z + k * 0.08 + 0.012, "CS_Gold")
        box(M, face_x, face_x + 0.1, top - 0.45, top - 0.25, z - 0.19, z + 0.19, "CS_Gold")

    for x in (-9.5, -5.75, -1.75, 1.15, 7.3):
        pilaster_z(x)
    for z in (-9.5, -6.9, 11.3):
        pilaster_x(z)

    # fan sconces: a brass plate, a glowing shade, a gold cap
    y = L["sconces"]["y"]
    for x in L["sconces"]["onBackZ"]:
        box(M, x - 0.11, x + 0.11, y - 0.17, y + 0.17, face_z, face_z + 0.03, "CS_Brass")
        vslab(M, [(x - 0.1, y - 0.1), (x + 0.1, y - 0.1), (x + 0.16, y + 0.1), (x - 0.16, y + 0.1)], face_z + 0.03, face_z + 0.11, "CS_Bulb")
        box(M, x - 0.18, x + 0.18, y + 0.1, y + 0.14, face_z + 0.03, face_z + 0.13, "CS_Gold")
    for z in L["sconces"]["onBackX"]:
        box(M, face_x, face_x + 0.03, y - 0.17, y + 0.17, z - 0.11, z + 0.11, "CS_Brass")
        xslab(M, [(z - 0.1, y - 0.1), (z + 0.1, y - 0.1), (z + 0.16, y + 0.1), (z - 0.16, y + 0.1)], face_x + 0.03, face_x + 0.11, "CS_Bulb")
        box(M, face_x + 0.03, face_x + 0.13, y + 0.1, y + 0.14, z - 0.18, z + 0.18, "CS_Gold")

    # the grand double doors: a gold frame, mahogany leaves with gold fluting and brass pulls, and a
    # glowing fan transom above them
    dh = d["h"]
    box(M, dx0 - 0.15, dx0, 0.0, dh + 0.12, face_z, face_z + 0.1, "CS_Gold")
    box(M, dx1, dx1 + 0.15, 0.0, dh + 0.12, face_z, face_z + 0.1, "CS_Gold")
    box(M, dx0 - 0.15, dx1 + 0.15, dh, dh + 0.12, face_z, face_z + 0.1, "CS_Gold")
    mid = d["x"]
    for a, b in ((dx0, mid - 0.01), (mid + 0.01, dx1)):
        box(M, a, b, 0.0, dh, face_z, face_z + 0.06, "CS_Mahogany")
        w = b - a
        for k in (0.25, 0.5, 0.75):
            xk = a + w * k
            box(M, xk - 0.015, xk + 0.015, 0.3, dh - 0.3, face_z + 0.06, face_z + 0.07, "CS_Gold")
        box(M, a + 0.12, b - 0.12, 1.42, 1.48, face_z + 0.06, face_z + 0.07, "CS_Gold")
    for x in (mid - 0.1, mid + 0.1):
        cylinder(M, (x, 1.05, face_z + 0.07), (x, 1.05, face_z + 0.14), 0.035, "CS_Brass", sides=10)
        cylinder(M, (x, 0.85, face_z + 0.14), (x, 1.25, face_z + 0.14), 0.022, "CS_Brass", sides=8)
    cy = dh + 0.12
    r_in, r_out = 0.12, 0.72
    wedges = 7
    for k in range(wedges):
        a0 = math.pi * k / wedges + 0.02
        a1 = math.pi * (k + 1) / wedges - 0.02
        pts = [(mid + r_in * math.cos(a0), cy + r_in * math.sin(a0)), (mid + r_out * math.cos(a0), cy + r_out * math.sin(a0)), (mid + r_out * math.cos(a1), cy + r_out * math.sin(a1)), (mid + r_in * math.cos(a1), cy + r_in * math.sin(a1))]
        vslab(M, list(reversed(pts)), face_z, face_z + 0.05, "CS_Bulb")
    arc_o = [(mid + 0.82 * math.cos(math.pi * k / 16), cy + 0.82 * math.sin(math.pi * k / 16)) for k in range(17)]
    arc_i = [(mid + r_out * math.cos(math.pi * k / 16), cy + r_out * math.sin(math.pi * k / 16)) for k in range(17)]
    for k in range(16):
        vslab(M, [arc_i[k], arc_o[k], arc_o[k + 1], arc_i[k + 1]], face_z, face_z + 0.08, "CS_Gold")
    vslab(M, [(mid + r_in * math.cos(math.pi * k / 10), cy + r_in * math.sin(math.pi * k / 10)) for k in range(11)], face_z, face_z + 0.08, "CS_Gold")


def build_marquee(M, L, nodes):
    """The Big-Win marquee over the main floor: a black board in a gold frame under a stepped crest,
    a row of bulbs round it; its screen is a node of its own (the game paints the news on it)."""
    m = L["marquee"]
    face = wall_face(L)
    x0, x1 = m["x"] - m["w"] / 2, m["x"] + m["w"] / 2
    y0, y1 = m["y"] - m["h"] / 2, m["y"] + m["h"] / 2
    box(M, x0, x1, y0, y1, face, face + 0.06, "CS_Black")
    for a, b, c, d in ((x0, x1, y0, y0 + 0.06), (x0, x1, y1 - 0.06, y1), (x0, x0 + 0.06, y0 + 0.06, y1 - 0.06), (x1 - 0.06, x1, y0 + 0.06, y1 - 0.06)):
        box(M, a, b, c, d, face + 0.06, face + 0.1, "CS_Gold")
    # the crest: three gold tiers and a glowing fan over them
    mid = m["x"]
    for k, w in enumerate((1.1, 0.75, 0.4)):
        box(M, mid - w / 2, mid + w / 2, y1 + k * 0.07, y1 + (k + 1) * 0.07, face, face + 0.08 - k * 0.01, "CS_Gold" if k != 1 else "CS_Black")
    cyc = y1 + 0.21
    for k in range(5):
        a0 = math.pi * k / 5 + 0.04
        a1 = math.pi * (k + 1) / 5 - 0.04
        vslab(M, [(mid + 0.05 * math.cos(a0), cyc + 0.05 * math.sin(a0)), (mid + 0.2 * math.cos(a0), cyc + 0.2 * math.sin(a0)), (mid + 0.2 * math.cos(a1), cyc + 0.2 * math.sin(a1)), (mid + 0.05 * math.cos(a1), cyc + 0.05 * math.sin(a1))], face, face + 0.04, "CS_Bulb")
    # bulbs round the frame
    n = int((x1 - x0) / 0.15)
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n
        for yy in (y0 - 0.02, y1 + 0.02):
            if yy > y1 and abs(x - mid) < 0.58:
                continue
            blob(M, x, yy, face + 0.07, 0.022, 0.022, 0.022, "CS_Bulb", cuts=1)
    for k in range(1, 5):
        yy = y0 + (y1 - y0) * k / 5
        for x in (x0 - 0.02, x1 + 0.02):
            blob(M, x, yy, face + 0.07, 0.022, 0.022, 0.022, "CS_Bulb", cuts=1)
    # the screen: a quad just proud of the board, UV mapped across it
    S = Mesh()
    bm = S.bm
    uv = bm.loops.layers.uv.new("UVMap")
    sx0, sx1, sy0, sy1, sz = x0 + 0.08, x1 - 0.08, y0 + 0.08, y1 - 0.08, face + 0.065
    vs = [bm.verts.new(W(sx0, sy0, sz)), bm.verts.new(W(sx1, sy0, sz)), bm.verts.new(W(sx1, sy1, sz)), bm.verts.new(W(sx0, sy1, sz))]
    fc = bm.faces.new(vs)
    fc.material_index = S.m("CS_Screen")
    for loop, uvv in zip(fc.loops, ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))):
        loop[uv].uv = uvv
    nodes.append({"name": "Prop_Marquee", "mesh": S, "origin": (mid, (sy0 + sy1) / 2, sz), "coloured": False, "recalc": False})


def build_frame(M, L, wall, at, yc, w, h, canvas):
    """A gilded frame on a wall round a dark canvas; returns the canvas's depth (the sitter's ground)."""
    wbox(M, L, wall, at, -w / 2, w / 2, yc - h / 2, yc + h / 2, 0.0, 0.03, canvas)
    for u0, u1, v0, v1 in ((-w / 2, w / 2, yc - h / 2, yc - h / 2 + 0.08), (-w / 2, w / 2, yc + h / 2 - 0.08, yc + h / 2), (-w / 2, -w / 2 + 0.08, yc - h / 2 + 0.08, yc + h / 2 - 0.08), (w / 2 - 0.08, w / 2, yc - h / 2 + 0.08, yc + h / 2 - 0.08)):
        wbox(M, L, wall, at, u0, u1, v0, v1, 0.0, 0.07, "CS_Gold")
    for u0, u1, v0, v1 in ((-w / 2 + 0.08, w / 2 - 0.08, yc - h / 2 + 0.08, yc - h / 2 + 0.1), (-w / 2 + 0.08, w / 2 - 0.08, yc + h / 2 - 0.1, yc + h / 2 - 0.08), (-w / 2 + 0.08, -w / 2 + 0.1, yc - h / 2 + 0.1, yc + h / 2 - 0.1), (w / 2 - 0.1, w / 2 - 0.08, yc - h / 2 + 0.1, yc + h / 2 - 0.1)):
        wbox(M, L, wall, at, u0, u1, v0, v1, 0.0, 0.045, "CS_MahoganyDark")
    for su in (-1, 1):
        for sv in (-1, 1):
            wblob(M, L, wall, at, su * (w / 2 - 0.04), yc + sv * (h / 2 - 0.04), 0.075, 0.04, 0.04, 0.02, "CS_Gold", cuts=1)
    wblob(M, L, wall, at, 0.0, yc + h / 2 + 0.02, 0.06, 0.09, 0.05, 0.02, "CS_Gold", cuts=2)  # the crest
    wbox(M, L, wall, at, -0.13, 0.13, yc - h / 2 - 0.11, yc - h / 2 - 0.04, 0.0, 0.015, "CS_Brass")  # the name plate
    return 0.03


def build_portrait(M, L, p):
    """An ancestor of the house, in oils: a bust in low relief on a dark ground."""
    wall, at, yc, who = p["wall"], p["at"], p["y"], p["subject"]
    ground = {"fox": "CS_Canvas1", "bear": "CS_Canvas3", "owl": "CS_Canvas2", "poodle": "CS_Canvas1", "cat": "CS_Canvas2"}[who]
    d0 = build_frame(M, L, wall, at, yc, 0.9, 0.8, ground)

    def B(u, v, d, hu, hv, hd, mat, cuts=2):
        wblob(M, L, wall, at, u, yc + v, d0 + d, hu, hv, hd, mat, cuts=cuts)

    coat = {"fox": "CS_Suit", "bear": "CS_Black", "owl": "CS_Emerald", "poodle": "CS_ZaraPurple", "cat": "CS_Black"}[who]
    B(0.0, -0.24, 0.012, 0.26, 0.1, 0.02, coat)  # the shoulders
    if who in ("fox", "bear", "cat"):
        B(0.0, -0.2, 0.024, 0.06, 0.08, 0.012, "CS_Shirt")  # a shirt front
    if who == "fox":
        B(0.0, -0.13, 0.034, 0.035, 0.02, 0.01, "CS_Red", cuts=1)  # a cravat
        B(0.0, 0.02, 0.02, 0.12, 0.11, 0.025, "CS_FoxFur")
        B(0.0, -0.04, 0.036, 0.07, 0.045, 0.02, "CS_FoxWhite")
        for s in (-1, 1):
            B(s * 0.085, 0.14, 0.02, 0.04, 0.07, 0.015, "CS_FoxFur")
            B(s * 0.085, 0.13, 0.03, 0.02, 0.04, 0.008, "CS_FoxWhite", cuts=1)
            B(s * 0.045, 0.04, 0.042, 0.014, 0.014, 0.008, "CS_Eye", cuts=1)
        B(0.0, -0.02, 0.056, 0.018, 0.014, 0.01, "CS_Eye", cuts=1)
        B(0.045, 0.04, 0.05, 0.026, 0.026, 0.004, "CS_Gold", cuts=1)  # the monocle
    elif who == "bear":
        B(0.0, 0.02, 0.02, 0.13, 0.12, 0.028, "CS_BearFur")
        B(0.0, -0.04, 0.04, 0.06, 0.04, 0.02, "CS_Ivory")
        B(0.0, -0.025, 0.058, 0.02, 0.015, 0.01, "CS_Eye", cuts=1)
        for s in (-1, 1):
            B(s * 0.1, 0.12, 0.018, 0.04, 0.04, 0.015, "CS_BearFur")
            B(s * 0.045, 0.04, 0.042, 0.012, 0.012, 0.008, "CS_Eye", cuts=1)
        wbox(M, L, wall, at, -0.075, 0.075, yc + 0.13, yc + 0.3, d0, d0 + 0.03, "CS_Black")  # a top hat
        wbox(M, L, wall, at, -0.12, 0.12, yc + 0.12, yc + 0.145, d0, d0 + 0.035, "CS_Black")
        wbox(M, L, wall, at, -0.075, 0.075, yc + 0.15, yc + 0.175, d0, d0 + 0.034, "CS_Red")
        B(0.0, -0.13, 0.034, 0.045, 0.018, 0.008, "CS_Black", cuts=1)  # a bow tie
    elif who == "owl":
        B(0.0, -0.02, 0.02, 0.17, 0.2, 0.025, "CS_OwlBrown")
        B(0.0, 0.05, 0.036, 0.13, 0.1, 0.012, "CS_OwlLight")
        for s in (-1, 1):
            B(s * 0.055, 0.06, 0.048, 0.035, 0.035, 0.008, "CS_Amber", cuts=1)
            B(s * 0.055, 0.06, 0.055, 0.015, 0.015, 0.006, "CS_Eye", cuts=1)
            B(s * 0.1, 0.19, 0.02, 0.025, 0.05, 0.012, "CS_OwlBrown", cuts=1)  # the tufts
        B(0.0, 0.01, 0.052, 0.014, 0.025, 0.01, "CS_Gold", cuts=1)
        wbar(M, L, wall, at, (-0.1, yc + 0.06), (0.1, yc + 0.06), d0 + 0.058, 0.004, "CS_Gold", sides=5)  # spectacles' bridge
    elif who == "poodle":
        B(0.0, 0.02, 0.02, 0.11, 0.12, 0.025, "CS_PoodleCream")
        B(0.0, 0.16, 0.026, 0.1, 0.07, 0.02, "CS_PoodleCream")  # the topknot
        for s in (-1, 1):
            B(s * 0.12, -0.02, 0.02, 0.05, 0.1, 0.015, "CS_PoodleCream")  # the ears
            B(s * 0.04, 0.04, 0.042, 0.012, 0.012, 0.008, "CS_Eye", cuts=1)
        B(0.0, -0.04, 0.042, 0.05, 0.035, 0.015, "CS_Ivory")
        B(0.0, -0.03, 0.058, 0.014, 0.011, 0.008, "CS_Eye", cuts=1)
        for k in range(9):
            a = math.pi * (0.15 + 0.7 * k / 8)
            B(-0.13 * math.cos(a), -0.15 - 0.05 * math.sin(a), 0.034, 0.012, 0.012, 0.01, "CS_Pearl", cuts=1)  # pearls
    else:  # cat
        B(0.0, 0.01, 0.02, 0.12, 0.11, 0.025, "CS_CatBlack")
        B(0.0, -0.04, 0.036, 0.06, 0.04, 0.015, "CS_CatWhite")
        for s in (-1, 1):
            wshape(M, L, wall, at, [(s * 0.04, yc + 0.08), (s * 0.12, yc + 0.08), (s * 0.1, yc + 0.2)], d0 + 0.005, d0 + 0.03, "CS_CatBlack")  # the ears
            B(s * 0.045, 0.03, 0.042, 0.018, 0.014, 0.008, "CS_EyeGreen", cuts=1)
        B(0.0, -0.02, 0.05, 0.012, 0.009, 0.008, "CS_Rose", cuts=1)
        B(0.0, -0.13, 0.034, 0.05, 0.02, 0.008, "CS_Red", cuts=1)  # a bow tie


def build_mirror(M, L, p):
    """A gilded sunburst mirror: a round glass in a gold ring, sixteen rays, beads on the long ones."""
    wall, at, yc = p["wall"], p["at"], p["y"]
    for k in range(16):
        a = 2 * math.pi * k / 16 + math.pi / 16
        long = k % 2 == 0
        r1 = 0.6 if long else 0.47
        pts = [(0.33 * math.cos(a - 0.08), yc + 0.33 * math.sin(a - 0.08)), (r1 * math.cos(a), yc + r1 * math.sin(a)), (0.33 * math.cos(a + 0.08), yc + 0.33 * math.sin(a + 0.08))]
        wshape(M, L, wall, at, pts, 0.0, 0.025, "CS_Gold")
        if long:
            wblob(M, L, wall, at, (r1 + 0.03) * math.cos(a), yc + (r1 + 0.03) * math.sin(a), 0.02, 0.025, 0.025, 0.02, "CS_Gold", cuts=1)
    ring_o = [(0.36 * math.cos(2 * math.pi * k / 28), yc + 0.36 * math.sin(2 * math.pi * k / 28)) for k in range(28)]
    ring_i = [(0.29 * math.cos(2 * math.pi * k / 28), yc + 0.29 * math.sin(2 * math.pi * k / 28)) for k in range(28)]
    for k in range(28):
        j = (k + 1) % 28
        wshape(M, L, wall, at, [ring_i[k], ring_o[k], ring_o[j], ring_i[j]], 0.0, 0.05, "CS_Gold")
    wshape(M, L, wall, at, [(0.3 * math.cos(2 * math.pi * k / 28), yc + 0.3 * math.sin(2 * math.pi * k / 28)) for k in range(28)], 0.0, 0.035, "CS_Mirror")


def build_vip_door(M, L):
    """The VIP room's doors in the pit's side wall (built on the pit): black lacquer and gold round
    two padded oxblood leaves in a gold lattice, ring pulls, and VIP in bulbs over them. Locked."""
    v = L["vipDoor"]
    zc, w, H = v["z"], v["w"], v["h"]
    face = wall_face(L)
    z0, z1 = zc - w / 2, zc + w / 2
    box(M, face, face + 0.1, 0.0, H + 0.16, z1, z1 + 0.16, "CS_Black")
    box(M, face, face + 0.1, 0.0, H + 0.16, z0 - 0.16, z0, "CS_Black")
    box(M, face, face + 0.1, H, H + 0.16, z0, z1, "CS_Black")
    for zz in (z0 - 0.005, z1 + 0.005):
        box(M, face + 0.1, face + 0.11, 0.0, H + 0.005, zz - 0.012, zz + 0.012, "CS_Gold")
    box(M, face + 0.1, face + 0.11, H - 0.012, H + 0.012, z0, z1, "CS_Gold")
    for a, b in ((z0, zc - 0.01), (zc + 0.01, z1)):
        box(M, face, face + 0.05, 0.0, H, a, b, "CS_Leather")
        # the lattice: gold diagonals over the padded leather, a button at each crossing
        n = 5
        lw = b - a
        for k in range(-n, n + 1):
            for sgn in (-1, 1):
                pts = []
                for yy in (0.15, H - 0.15):
                    zz = (a + b) / 2 + sgn * (yy - H / 2) * 0.35 + k * lw / 3
                    pts.append((yy, zz))
                (ya, za), (yb, zb) = pts
                # clip to the leaf
                if max(za, zb) < a + 0.05 or min(za, zb) > b - 0.05:
                    continue
                t0 = max(0.0, min(1.0, ((a + 0.05) - za) / (zb - za))) if zb != za else 0.0
                t1 = max(0.0, min(1.0, ((b - 0.05) - za) / (zb - za))) if zb != za else 1.0
                t0, t1 = min(t0, t1), max(t0, t1)
                if t1 - t0 < 0.02:
                    continue
                pa = (face + 0.055, ya + (yb - ya) * t0, za + (zb - za) * t0)
                pb = (face + 0.055, ya + (yb - ya) * t1, za + (zb - za) * t1)
                cylinder(M, pa, pb, 0.007, "CS_Gold", sides=5)
        box(M, face + 0.05, face + 0.06, 0.12, 0.15, a + 0.04, b - 0.04, "CS_Gold")
        box(M, face + 0.05, face + 0.06, H - 0.15, H - 0.12, a + 0.04, b - 0.04, "CS_Gold")
    # the ring pulls, each from a gold boss
    for zz in (zc - 0.12, zc + 0.12):
        blob(M, face + 0.075, 1.12, zz, 0.03, 0.035, 0.035, "CS_Gold", cuts=2)
        ring = [(face + 0.085, 1.02 + 0.07 * math.cos(2 * math.pi * k / 10), zz + 0.07 * math.sin(2 * math.pi * k / 10)) for k in range(10)]
        for k in range(10):
            cylinder(M, ring[k], ring[(k + 1) % 10], 0.01, "CS_Gold", sides=5)
    # the sign: VIP in bulbs on a black plate with a gold edge
    sy = H + 0.3
    box(M, face, face + 0.05, sy - 0.14, sy + 0.14, zc - 0.36, zc + 0.36, "CS_Black")
    box(M, face, face + 0.045, sy - 0.16, sy + 0.16, zc - 0.38, zc + 0.38, "CS_Gold")
    xg = face + 0.07

    def stroke(a, b):
        cylinder(M, (xg, a[0], a[1]), (xg, b[0], b[1]), 0.014, "CS_Bulb", sides=6)

    stroke((sy + 0.09, zc + 0.3), (sy - 0.09, zc + 0.22))  # V
    stroke((sy - 0.09, zc + 0.22), (sy + 0.09, zc + 0.14))
    stroke((sy + 0.09, zc), (sy - 0.09, zc))  # I
    stroke((sy + 0.09, zc - 0.14), (sy - 0.09, zc - 0.14))  # P
    bowl = [(sy + 0.09 - 0.045 + 0.045 * math.cos(math.pi / 2 - math.pi * k / 6), zc - 0.14 - 0.06 * math.sin(math.pi * k / 6)) for k in range(7)]
    for k in range(6):
        stroke(bowl[k], bowl[k + 1])


# ---------------------------------------------------------------------------------------------
# the torch columns at the zones' corners


def build_pillars(M, L):
    p = L["pillars"]
    for x, z in p["at"]:
        box(M, x - 0.28, x + 0.28, 0.0, 0.1, z - 0.28, z + 0.28, "CS_Black")
        box(M, x - 0.285, x + 0.285, 0.1, 0.13, z - 0.285, z + 0.285, "CS_Gold")
        lathe(M, x, z, [(0, 0.13), (0.23, 0.13), (0.21, 0.2), (0.2, 1.92), (0.24, 1.98), (0, 1.98)], "CS_Black", segs=16)
        for k in range(12):
            a = 2 * math.pi * k / 12
            cylinder(M, (x + 0.203 * math.cos(a), 0.24, z + 0.203 * math.sin(a)), (x + 0.203 * math.cos(a), 1.86, z + 0.203 * math.sin(a)), 0.011, "CS_Gold", sides=5)
        lathe(M, x, z, [(0, 1.98), (0.25, 1.98), (0.3, 2.06), (0.3, 2.1), (0, 2.1)], "CS_Gold", segs=16)
        lathe(M, x, z, [(0, 2.1), (0.1, 2.1), (0.19, 2.19), (0.21, 2.25), (0, 2.23)], "CS_Brass", segs=14)
        blob(M, x, 2.3, z, 0.13, 0.07, 0.13, "CS_Flame", cuts=2)
        blob(M, x, 2.4, z, 0.08, 0.12, 0.08, "CS_FlameCore", cuts=2)


# ---------------------------------------------------------------------------------------------
# 1 the foyer: the Golden Cage, the palms, the ottoman, Madame Zara, the capsule machine


def build_cage(M, L):
    c = L["cage"]
    x0, x1, z0, z1 = c["x0"], c["x1"], c["z0"], c["z1"]
    counter = c["counter"]
    win = c["window"]
    ch = c["h"]
    h = L["half"]
    face_z = -h + L["walls"]["t"]
    front = z1 - 0.3  # the counter's back face (the bars stand on it)

    box(M, x0, x1, 0.0, counter - 0.05, front, z1, "CS_Mahogany")
    box(M, x0, x1, 0.0, 0.08, z1 - 0.02, z1 + 0.01, "CS_Gold")
    xk = x0 + 0.3
    while xk < x1 - 0.2:
        box(M, xk - 0.02, xk + 0.02, 0.14, counter - 0.14, z1, z1 + 0.012, "CS_Gold")
        xk += 0.4
    box(M, x0 - 0.02, x1, counter - 0.05, counter, front - 0.15, z1 + 0.08, "CS_MarbleLight")
    box(M, x0, x0 + 0.2, 0.0, counter, face_z, front, "CS_Mahogany")
    box(M, x0 - 0.01, x0 + 0.21, counter, counter + 0.04, face_z, front, "CS_Gold")
    bar_z = front + 0.12
    top_y = ch - 0.25
    x = x0 + 0.1
    while x < x1 - 0.05:
        if abs(x - win) > 0.55:
            cylinder(M, (x, counter, bar_z), (x, top_y, bar_z), 0.018, "CS_Brass", sides=8)
        x += 0.13
    z = face_z + 0.12
    while z < front:
        cylinder(M, (x0 + 0.1, counter, z), (x0 + 0.1, top_y, z), 0.018, "CS_Brass", sides=8)
        z += 0.13
    box(M, x0, x1, top_y - 0.04, top_y + 0.02, bar_z - 0.03, bar_z + 0.03, "CS_Brass")
    box(M, x0 + 0.07, x0 + 0.13, top_y - 0.04, top_y + 0.02, face_z, front, "CS_Brass")
    box(M, x0, x1, top_y, ch, front, z1, "CS_Mahogany")
    box(M, x0, x0 + 0.2, top_y, ch, face_z, front, "CS_Mahogany")
    box(M, x0, x1, top_y + 0.07, top_y + 0.12, z1, z1 + 0.012, "CS_Gold")
    for k, w in enumerate((1.3, 0.9, 0.5)):
        box(M, win - w / 2, win + w / 2, ch + k * 0.12, ch + (k + 1) * 0.12, front + 0.05 + k * 0.03, z1 - k * 0.03, "CS_Gold" if k != 1 else "CS_Mahogany")
    for sx in (-1, 1):
        box(M, win + sx * 0.55 - 0.035, win + sx * 0.55 + 0.035, counter, counter + 0.8, bar_z - 0.04, bar_z + 0.04, "CS_Gold")
    arc_c = counter + 0.8
    for k in range(12):
        a0, a1 = math.pi * k / 12, math.pi * (k + 1) / 12
        pts = [(win + 0.51 * math.cos(a0), arc_c + 0.51 * math.sin(a0)), (win + 0.59 * math.cos(a0), arc_c + 0.59 * math.sin(a0)), (win + 0.59 * math.cos(a1), arc_c + 0.59 * math.sin(a1)), (win + 0.51 * math.cos(a1), arc_c + 0.51 * math.sin(a1))]
        vslab(M, pts, bar_z - 0.04, bar_z + 0.04, "CS_Gold")
    fl = c["floor"]
    box(M, x0 + 0.2, x1 - 0.2, 0.0, fl - 0.02, face_z, front, "CS_MahoganyDark")
    box(M, x0 + 0.2, x1 - 0.2, fl - 0.02, fl, face_z, front, "CS_Velvet")
    vx, vy = win + 1.45, fl + 1.0
    cylinder(M, (vx, vy, face_z), (vx, vy, face_z + 0.08), 0.62, "CS_Brass", sides=24)
    cylinder(M, (vx, vy, face_z + 0.08), (vx, vy, face_z + 0.1), 0.5, "CS_Black", sides=24)
    cylinder(M, (vx, vy, face_z + 0.1), (vx, vy, face_z + 0.2), 0.08, "CS_Gold", sides=12)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        cylinder(M, (vx, vy, face_z + 0.18), (vx + 0.34 * math.cos(a), vy + 0.34 * math.sin(a), face_z + 0.18), 0.025, "CS_Gold", sides=8)
    lx, lz = win - 0.85, z1 - 0.12
    lathe(M, lx, lz, [(0, 0), (0.09, 0), (0.09, 0.02), (0.02, 0.03), (0, 0.03)], "CS_Brass", segs=12, y0=counter)
    cylinder(M, (lx, counter + 0.03, lz), (lx, counter + 0.28, lz), 0.012, "CS_Brass", sides=6)
    obox(M, lx, lz, 0.0, -0.08, 0.08, -0.16, 0.16, counter + 0.28, counter + 0.34, "CS_Felt")
    obox(M, lx, lz, 0.0, -0.06, 0.06, -0.13, 0.13, counter + 0.26, counter + 0.28, "CS_Bulb")
    lathe(M, win + 0.8, z1 - 0.12, [(0, 0), (0.07, 0), (0.065, 0.03), (0.04, 0.07), (0.01, 0.09), (0, 0.1)], "CS_Gold", segs=12, y0=counter)
    for k, mat in enumerate(("CS_Red", "CS_Black", "CS_Ivory", "CS_Red")):
        lathe(M, win + 0.35, z1 - 0.1, [(0, 0), (0.05, 0), (0.05, 0.018), (0, 0.018)], mat, segs=12, y0=counter + k * 0.02)
    box(M, x1 - 0.2, x1, 0.0, counter, face_z, front, "CS_Mahogany")


def palm(M, x, z, s=1.0):
    """A potted palm: a black lacquered urn with a gold band, a leaning trunk, drooping fronds."""
    lathe(M, x, z, [(0, 0), (0.26 * s, 0), (0.33 * s, 0.18 * s), (0.36 * s, 0.46 * s), (0.3 * s, 0.5 * s), (0, 0.5 * s)], "CS_Black", segs=14)
    lathe(M, x, z, [(0, 0.4 * s), (0.365 * s, 0.4 * s), (0.365 * s, 0.44 * s), (0, 0.44 * s)], "CS_Gold", segs=14)
    top = (x + 0.06 * s, 1.75 * s, z + 0.04 * s)
    cylinder(M, (x, 0.45 * s, z), top, 0.07 * s, "CS_Trunk", sides=8, r_end=0.05 * s)
    for k in range(7):
        yaw = 2 * math.pi * k / 7 + 0.3
        fx, fz = math.sin(yaw), math.cos(yaw)
        blob(M, top[0] + fx * 0.42 * s, top[1] - 0.05 * s, top[2] + fz * 0.42 * s, 0.5 * s, 0.035 * s, 0.13 * s, "CS_Leaf", cuts=2, yaw=yaw - math.pi / 2, droop=0.22 * s)


def fern(M, x, z):
    """A planter out front: a lacquered urn with a gold band and a round fern, all within the
    urn's collider (a palm's fronds would reach over the walkway)."""
    lathe(M, x, z, [(0, 0), (0.24, 0), (0.3, 0.16), (0.33, 0.42), (0.28, 0.46), (0, 0.46)], "CS_Black", segs=14)
    lathe(M, x, z, [(0, 0.36), (0.335, 0.36), (0.335, 0.4), (0, 0.4)], "CS_Gold", segs=14)
    blob(M, x, 0.62, z, 0.3, 0.2, 0.3, "CS_Leaf", cuts=3)
    for k in range(6):
        yaw = 2 * math.pi * k / 6
        blob(M, x + 0.16 * math.sin(yaw), 0.66, z + 0.16 * math.cos(yaw), 0.18, 0.03, 0.07, "CS_Leaf", cuts=2, yaw=yaw - math.pi / 2, droop=0.08)


def build_foyer(M, L, cushions):
    for p in L["palms"]:
        palm(M, p["x"], p["z"], 1.1)
    for p in L["planters"]:
        fern(M, p["x"], p["z"])
    o = L["ottoman"]
    top = cushions["ottoman"]["top"]
    lathe(M, o["x"], o["z"], [(0, 0), (o["r"], 0), (o["r"], 0.06), (0, 0.06)], "CS_Gold", segs=28)
    lathe(M, o["x"], o["z"], [(0, 0.06), (o["r"] - 0.02, 0.06), (o["r"] - 0.01, top - 0.05), (o["r"] - 0.06, top), (0, top)], "CS_Velvet", segs=28)
    for k in range(12):
        a = 2 * math.pi * k / 12
        blob(M, o["x"] + 0.62 * math.cos(a), top + 0.005, o["z"] + 0.62 * math.sin(a), 0.03, 0.015, 0.03, "CS_Gold", cuts=1)
    lathe(M, o["x"], o["z"], [(0, top), (0.3, top), (0.26, top + 0.35), (0.3, top + 0.4), (0, top + 0.4)], "CS_Velvet", segs=16)
    lathe(M, o["x"], o["z"], [(0, top + 0.4), (0.22, top + 0.4), (0.14, top + 0.55), (0, top + 0.55)], "CS_Gold", segs=16)
    for k in range(6):
        a = 2 * math.pi * k / 6
        blob(M, o["x"] + 0.12 * math.cos(a), top + 0.66, o["z"] + 0.12 * math.sin(a), 0.1, 0.09, 0.1, "CS_Rose", cuts=2)
        blob(M, o["x"] + 0.2 * math.cos(a + 0.5), top + 0.58, o["z"] + 0.2 * math.sin(a + 0.5), 0.16, 0.025, 0.06, "CS_Leaf", cuts=1, yaw=-(a + 0.5), droop=0.05)
    blob(M, o["x"], top + 0.74, o["z"], 0.09, 0.09, 0.09, "CS_Rose", cuts=2)


class Frame:
    """A turned local frame on the floor: `lx` across, `lz` forward (toward heading `yaw`, 0 facing
    +z), y up, its origin at (cx, cz): for things that stand at an angle to the walls."""

    def __init__(self, cx, cz, yaw):
        self.cx, self.cz, self.yaw = cx, cz, yaw
        self.c, self.s = math.cos(yaw), math.sin(yaw)

    def p(self, lx, y, lz):
        return (self.cx + lx * self.c + lz * self.s, y, self.cz - lx * self.s + lz * self.c)

    def box(self, M, lx0, lx1, y0, y1, lz0, lz1, mat):
        obox(M, self.cx, self.cz, self.yaw, lz0, lz1, lx0, lx1, y0, y1, mat)

    def blob(self, M, lx, y, lz, hx, hy, hz, mat, **kw):
        x, _, z = self.p(lx, y, lz)
        blob(M, x, y, z, hx, hy, hz, mat, yaw=self.yaw + kw.pop("turn", 0.0), **kw)

    def lathe(self, M, lx, lz, profile, mat, **kw):
        x, _, z = self.p(lx, 0.0, lz)
        lathe(M, x, z, profile, mat, **kw)

    def cyl(self, M, a, b, r, mat, **kw):
        cylinder(M, self.p(*a), self.p(*b), r, mat, **kw)

    def face_slab(self, M, outline_xy, lz0, lz1, mat):
        """An (lx, y) outline standing across the frame, from lz0 to lz1 (a shape on its front)."""
        bm = M.bm
        a = [bm.verts.new(W(*self.p(x, y, lz0))) for x, y in outline_xy]
        b = [bm.verts.new(W(*self.p(x, y, lz1))) for x, y in outline_xy]
        bm.faces.new(list(reversed(a))).material_index = M.m(mat)
        bm.faces.new(b).material_index = M.m(mat)
        n = len(outline_xy)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i])).material_index = M.m(mat)


def build_zara(M, L, nodes):
    """Madame Zara's fortune booth, turned to face the camera's way: a lacquered base with a coin
    plate and a card slot, an open cabinet under a gold arch (velvet curtains drawn back, a starry
    backdrop), the lady herself (a Siamese in a jewelled turban, paws round a glowing crystal ball)
    sitting well forward so the camera sees her through the arch, a crescent crest, and her
    animatronic brass owl on the roof."""
    zr = L["zara"]
    F = Frame(zr["x"], zr["z"], zr.get("yaw", 0.0))
    hw, hd = zr["w"] / 2, zr["d"] / 2
    H = zr["h"]
    roof = H - 0.2
    sill = 0.74  # the cabinet's floor
    # the base
    F.box(M, -hw, hw, 0.0, 0.08, -hd, hd, "CS_Black")
    F.box(M, -hw + 0.02, hw - 0.02, 0.08, sill - 0.06, -hd + 0.02, hd - 0.02, "CS_ZaraPurple")
    for u0, u1, v0, v1 in ((-hw + 0.06, hw - 0.06, 0.12, 0.15), (-hw + 0.06, hw - 0.06, sill - 0.13, sill - 0.1), (-hw + 0.06, -hw + 0.09, 0.15, sill - 0.13), (hw - 0.09, hw - 0.06, 0.15, sill - 0.13)):
        F.box(M, u0, u1, v0, v1, hd - 0.02, hd + 0.005, "CS_Gold")
    F.box(M, -hw, hw, sill - 0.06, sill, hd - 0.1, hd + 0.02, "CS_Gold")
    F.box(M, -hw, hw, sill - 0.06, sill - 0.005, -hd, hd - 0.1, "CS_ZaraPlum")
    F.box(M, -0.12, 0.12, 0.4, 0.56, hd - 0.02, hd + 0.012, "CS_Brass")
    F.box(M, -0.04, 0.04, 0.46, 0.5, hd + 0.012, hd + 0.018, "CS_Black")
    F.box(M, -0.17, 0.17, 0.2, 0.24, hd - 0.02, hd + 0.012, "CS_Black")
    F.blob(M, 0.0, 0.31, hd + 0.004, 0.045, 0.045, 0.01, "CS_Gold", cuts=2)  # an eye on the panel
    F.blob(M, 0.0, 0.31, hd + 0.012, 0.018, 0.018, 0.008, "CS_Eye", cuts=1)
    # the cabinet: sides, back, roof
    F.box(M, -hw, -hw + 0.06, sill, roof, -hd, hd, "CS_ZaraPurple")
    F.box(M, hw - 0.06, hw, sill, roof, -hd, hd, "CS_ZaraPurple")
    F.box(M, -hw, hw, sill, roof, -hd, -hd + 0.06, "CS_ZaraPlum")
    F.box(M, -hw - 0.03, hw + 0.03, roof, roof + 0.07, -hd - 0.03, hd + 0.03, "CS_Gold")
    F.box(M, -hw, hw, roof + 0.07, roof + 0.12, -hd, hd, "CS_ZaraPurple")
    # the arch: gold posts up to its spring, a round head under the roof, purple spandrels beside it
    ar = hw - 0.03
    ac = roof - ar - 0.02
    for sx in (-ar + 0.035, ar - 0.035):
        F.box(M, sx - 0.035, sx + 0.035, sill, ac, hd - 0.05, hd + 0.01, "CS_Gold")
    for k in range(12):
        a0, a1 = math.pi * k / 12, math.pi * (k + 1) / 12
        F.face_slab(M, [((ar - 0.07) * math.cos(a0), ac + (ar - 0.07) * math.sin(a0)), (ar * math.cos(a0), ac + ar * math.sin(a0)), (ar * math.cos(a1), ac + ar * math.sin(a1)), ((ar - 0.07) * math.cos(a1), ac + (ar - 0.07) * math.sin(a1))], hd - 0.05, hd + 0.01, "CS_Gold")
    for sg in (-1, 1):
        rim = [(sg * ar * math.cos(math.pi * k / 12), ac + ar * math.sin(math.pi * k / 12)) for k in range(7)]
        outline = [(sg * (hw - 0.001), ac), (sg * (hw - 0.001), roof), (0.0, roof)] + list(reversed(rim))
        if sg > 0:
            outline = list(reversed(outline))
        F.face_slab(M, outline, hd - 0.045, hd + 0.005, "CS_ZaraPurple")
    # the backdrop's stars
    for sxs, sys_ in ((-0.3, 1.35), (-0.18, 1.62), (0.25, 1.48), (0.33, 1.2), (-0.36, 1.05), (0.1, 1.75), (0.32, 1.72), (-0.3, 1.8)):
        F.blob(M, sxs, sys_, -hd + 0.065, 0.018, 0.018, 0.006, "CS_StarGlow", cuts=1)
    # the curtains, drawn back to each side
    for sg in (-1, 1):
        F.blob(M, sg * 0.41, sill + 0.55, hd - 0.12, 0.06, 0.52, 0.05, "CS_Velvet", cuts=2)
        F.blob(M, sg * 0.38, sill + 0.35, hd - 0.1, 0.045, 0.03, 0.045, "CS_Gold", cuts=1)
    # the table and the crystal ball
    tz = 0.24
    t0 = sill
    F.lathe(M, 0.0, tz, [(0, t0), (0.1, t0), (0.03, t0 + 0.04), (0.03, t0 + 0.1), (0.19, t0 + 0.12), (0.19, t0 + 0.15), (0, t0 + 0.15)], "CS_Gold", segs=16)
    F.lathe(M, 0.0, tz, [(0, t0 + 0.15), (0.07, t0 + 0.15), (0.05, t0 + 0.18), (0, t0 + 0.18)], "CS_Brass", segs=12)
    F.blob(M, 0.0, t0 + 0.27, tz, 0.1, 0.1, 0.1, "CS_CrystalBall", cuts=3)
    # Madame Zara, seated just behind it
    zc = 0.0
    y0 = sill - 0.2  # her figure's datum (as if she sat on a floor at 0.94 - 0.2)
    F.blob(M, 0.0, y0 + 0.46, zc, 0.22, 0.24, 0.16, "CS_ZaraTeal", cuts=3)  # her shawl
    F.blob(M, 0.0, y0 + 0.62, zc + 0.03, 0.2, 0.08, 0.14, "CS_ZaraPurple", cuts=2)
    for sg in (-1, 1):
        F.cyl(M, (sg * 0.16, y0 + 0.56, zc + 0.02), (sg * 0.08, t0 + 0.26, tz - 0.05), 0.045, "CS_ZaraTeal", sides=8)
        F.blob(M, sg * 0.075, t0 + 0.26, tz - 0.07, 0.04, 0.03, 0.045, "CS_ZaraCream", cuts=1)
    F.blob(M, 0.0, y0 + 0.84, zc + 0.02, 0.15, 0.14, 0.13, "CS_ZaraCream", cuts=3)  # her head
    F.blob(M, 0.0, y0 + 0.79, zc + 0.12, 0.07, 0.06, 0.05, "CS_ZaraMask", cuts=2)  # the Siamese mask
    F.blob(M, 0.0, y0 + 0.81, zc + 0.165, 0.018, 0.013, 0.01, "CS_Eye", cuts=1)
    for sg in (-1, 1):
        F.blob(M, sg * 0.055, y0 + 0.87, zc + 0.13, 0.025, 0.018, 0.012, "CS_ZaraEye", cuts=1)
        F.blob(M, sg * 0.11, y0 + 0.98, zc, 0.04, 0.06, 0.03, "CS_ZaraMask", cuts=1)  # the ears, under the turban's edge
        F.lathe(M, sg * 0.15, zc + 0.03, [(0, y0 + 0.7), (0.025, y0 + 0.71), (0.025, y0 + 0.74), (0, y0 + 0.75)], "CS_Gold", segs=8)  # earrings
    F.blob(M, 0.0, y0 + 1.02, zc, 0.16, 0.1, 0.14, "CS_ZaraPurple", cuts=3)  # the turban
    F.blob(M, 0.0, y0 + 1.08, zc + 0.02, 0.11, 0.07, 0.11, "CS_ZaraPlum", cuts=2)
    F.blob(M, 0.0, y0 + 1.0, zc + 0.14, 0.03, 0.03, 0.015, "CS_Gold", cuts=1)
    F.blob(M, 0.0, y0 + 1.0, zc + 0.152, 0.015, 0.015, 0.008, "CS_Red", cuts=1)
    F.blob(M, 0.03, y0 + 1.14, zc + 0.08, 0.02, 0.09, 0.02, "CS_ZaraTeal", cuts=1, pitch=-0.3)  # a plume
    # the crest: a gold crescent moon with a star
    front = hd + 0.02
    moon_o = [(-0.02 + 0.2 * math.cos(math.pi * (0.3 + 1.4 * k / 12)), roof + 0.32 + 0.2 * math.sin(math.pi * (0.3 + 1.4 * k / 12))) for k in range(13)]
    moon_i = [(0.05 + 0.15 * math.cos(math.pi * (0.3 + 1.4 * k / 12)), roof + 0.34 + 0.15 * math.sin(math.pi * (0.3 + 1.4 * k / 12))) for k in range(13)]
    for k in range(12):
        F.face_slab(M, [moon_i[k], moon_o[k], moon_o[k + 1], moon_i[k + 1]], front - 0.04, front, "CS_Gold")
    F.blob(M, 0.14, roof + 0.36, front - 0.02, 0.04, 0.04, 0.02, "CS_StarGlow", cuts=1)
    # the owl on its perch, at the roof's back corner
    olx, olz = -hw + 0.22, -hd + 0.2
    oy = roof + 0.12
    F.lathe(M, olx, olz, [(0, oy), (0.09, oy), (0.03, oy + 0.03), (0.02, oy + 0.1), (0.07, oy + 0.12), (0, oy + 0.12)], "CS_Gold", segs=10)
    feet = oy + 0.12
    O = Mesh()
    F.blob(O, olx, feet + 0.13, olz, 0.1, 0.13, 0.09, "CS_Bronze", cuts=3)
    F.blob(O, olx, feet + 0.1, olz + 0.05, 0.07, 0.08, 0.05, "CS_Copper", cuts=2)
    for sg in (-1, 1):
        F.blob(O, olx + sg * 0.095, feet + 0.13, olz - 0.01, 0.03, 0.1, 0.07, "CS_Copper", cuts=2)  # the wings
        for k in range(3):
            F.blob(O, olx + sg * 0.12, feet + 0.08 + k * 0.05, olz, 0.008, 0.008, 0.008, "CS_Gold", cuts=1)  # rivets
        F.blob(O, olx + sg * 0.035, feet + 0.012, olz + 0.04, 0.025, 0.012, 0.03, "CS_Gold", cuts=1)  # the talons
    F.blob(O, olx, feet + 0.03, olz - 0.08, 0.04, 0.02, 0.05, "CS_Bronze", cuts=1)  # the tail
    nodes.append({"name": "Prop_ZaraOwl", "mesh": O, "origin": F.p(olx, feet, olz), "force": "CS_Sheen", "key": "owl"})
    Hd = Mesh()
    hy = feet + 0.25
    F.blob(Hd, olx, hy + 0.07, olz, 0.1, 0.085, 0.09, "CS_Bronze", cuts=3)
    F.blob(Hd, olx, hy + 0.065, olz + 0.055, 0.085, 0.06, 0.03, "CS_Copper", cuts=2)
    for sg in (-1, 1):
        F.blob(Hd, olx + sg * 0.04, hy + 0.075, olz + 0.08, 0.03, 0.03, 0.015, "CS_OwlEye", cuts=2)
        F.blob(Hd, olx + sg * 0.04, hy + 0.075, olz + 0.093, 0.012, 0.012, 0.006, "CS_Eye", cuts=1)
        F.blob(Hd, olx + sg * 0.07, hy + 0.15, olz, 0.02, 0.045, 0.02, "CS_Bronze", cuts=1)
    F.blob(Hd, olx, hy + 0.045, olz + 0.095, 0.014, 0.02, 0.014, "CS_Gold", cuts=1)
    nodes.append({"name": "Prop_ZaraOwlHead", "mesh": Hd, "origin": F.p(olx, hy, olz), "force": "CS_Sheen", "parent": "owl"})


def build_gachapon(M, L):
    """The capsule machine: a red lacquered column with gold bands, a crank and a chute on its face,
    and a gold-caged globe full of coloured capsules."""
    g = L["gachapon"]
    x, z, r = g["x"], g["z"], g["r"]
    lathe(M, x, z, [(0, 0), (r, 0), (r, 0.05), (r - 0.04, 0.09), (r - 0.04, 0.78), (r, 0.82), (r, 0.86), (0, 0.86)], "CS_CapRed", segs=20)
    for y0 in (0.05, 0.78):
        lathe(M, x, z, [(0, y0), (r + 0.01, y0), (r + 0.01, y0 + 0.035), (0, y0 + 0.035)], "CS_Gold", segs=20)
    fz = z + r - 0.04
    box(M, x - 0.15, x + 0.15, 0.3, 0.7, fz - 0.01, fz + 0.035, "CS_Gold")
    cylinder(M, (x, 0.55, fz + 0.03), (x, 0.55, fz + 0.08), 0.06, "CS_Chrome", sides=14)
    cylinder(M, (x - 0.07, 0.55, fz + 0.08), (x + 0.07, 0.55, fz + 0.08), 0.016, "CS_Chrome", sides=8)
    blob(M, x + 0.07, 0.55, fz + 0.1, 0.02, 0.02, 0.02, "CS_Red", cuts=1)
    box(M, x - 0.09, x + 0.09, 0.14, 0.27, fz - 0.005, fz + 0.04, "CS_Black")
    box(M, x - 0.08, x + 0.08, 0.2, 0.26, fz + 0.04, fz + 0.05, "CS_Chrome")
    box(M, x - 0.04, x + 0.04, 0.4, 0.42, fz + 0.035, fz + 0.04, "CS_Black")
    # the globe
    gy, R = 1.15, 0.29
    colours = ("CS_CapRed", "CS_CapBlue", "CS_CapYellow", "CS_CapGreen", "CS_CapPink", "CS_CapPurple", "CS_CapWhite")
    n = 46
    for k in range(n):
        yk = 1 - 2 * (k + 0.5) / n
        rk = math.sqrt(max(0.0, 1 - yk * yk))
        a = k * 2.399963
        rr = R - 0.055
        blob(M, x + rr * rk * math.cos(a), gy + rr * yk, z + rr * rk * math.sin(a), 0.052, 0.052, 0.052, colours[k % len(colours)], cuts=1)
    ring = [(x + (R + 0.01) * math.cos(2 * math.pi * k / 24), gy, z + (R + 0.01) * math.sin(2 * math.pi * k / 24)) for k in range(24)]
    for k in range(24):
        cylinder(M, ring[k], ring[(k + 1) % 24], 0.014, "CS_Gold", sides=6)
    for m_ in range(4):
        a = math.pi * m_ / 4
        pts = [(x + (R + 0.01) * math.cos(t) * math.cos(a), gy + (R + 0.01) * math.sin(t), z + (R + 0.01) * math.cos(t) * math.sin(a)) for t in (-math.pi / 2 + math.pi * k / 12 for k in range(13))]
        for k in range(12):
            cylinder(M, pts[k], pts[k + 1], 0.009, "CS_Gold", sides=5)
    lathe(M, x, z, [(0, gy + R - 0.02), (0.12, gy + R - 0.02), (0.09, gy + R + 0.04), (0, gy + R + 0.06)], "CS_Gold", segs=16)
    blob(M, x, gy + R + 0.09, z, 0.035, 0.035, 0.035, "CS_Gold", cuts=2)


# ---------------------------------------------------------------------------------------------
# 2 the main floor: the roulette table (and its wheel), the craps table, the blackjack crescent

RED_NUMBERS = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
WHEEL_R = 0.44


def wheel_centre(L):
    r = L["roulette"]
    return (r["x"] + r["wheel"], r["top"] + 0.005, r["z"])


def tip_jar(M, x, z, y):
    """A dealer's tip jar: pale glass with a gold band and a little label, chips and coins heaped in it."""
    lathe(M, x, z, [(0, 0), (0.055, 0), (0.062, 0.02), (0.062, 0.1), (0.05, 0.12), (0.054, 0.13), (0, 0.13)], "CS_JarGlass", segs=14, y0=y)
    lathe(M, x, z, [(0, 0.05), (0.064, 0.05), (0.064, 0.07), (0, 0.07)], "CS_Gold", segs=14, y0=y)
    box(M, x - 0.03, x + 0.03, y + 0.072, y + 0.095, z + 0.058, z + 0.066, "CS_Ivory")
    for k, (dx, dz, mat) in enumerate(((0.0, 0.0, "CS_Coin"), (0.02, 0.012, "CS_Red"), (-0.018, 0.01, "CS_Coin"), (0.005, -0.02, "CS_Ivory"))):
        lathe(M, x + dx, z + dz, [(0, 0), (0.024, 0), (0.024, 0.008), (0, 0.008)], mat, segs=10, y0=y + 0.13 + k * 0.004)


def build_roulette(M, L):
    r = L["roulette"]
    x0, x1 = r["x"] - r["len"] / 2, r["x"] + r["len"] / 2
    z0, z1 = r["z"] - r["w"] / 2, r["z"] + r["w"] / 2
    top = r["top"]
    slab(M, rounded_rect(x0 + 0.18, x1 - 0.18, z0 + 0.18, z1 - 0.18, 0.16), 0.0, 0.06, "CS_Gold")
    slab(M, rounded_rect(x0 + 0.22, x1 - 0.22, z0 + 0.22, z1 - 0.22, 0.14), 0.06, top - 0.1, "CS_Mahogany")
    slab(M, rounded_rect(x0, x1, z0, z1, 0.3), top - 0.1, top - 0.005, "CS_Mahogany")
    slab(M, rounded_rect(x0 + 0.02, x1 - 0.02, z0 + 0.02, z1 - 0.02, 0.28), top - 0.12, top - 0.1, "CS_Gold")
    slab(M, rounded_rect(x0 + 0.09, x1 - 0.09, z0 + 0.09, z1 - 0.09, 0.22), top - 0.005, top, "CS_Felt")
    gx0, gx1, gz0, gz1 = x0 + 1.05, x1 - 0.22, z0 + 0.22, z1 - 0.22
    cw, rh = (gx1 - gx0) / 12, (gz1 - gz0) / 3
    for col in range(12):
        for row in range(3):
            n = col * 3 + (3 - row)
            box(M, gx0 + col * cw + 0.012, gx0 + (col + 1) * cw - 0.012, top, top + 0.003, gz0 + row * rh + 0.012, gz0 + (row + 1) * rh - 0.012, "CS_FeltRed" if n in RED_NUMBERS else "CS_FeltBlack")
    box(M, gx0 - 0.16, gx0 - 0.02, top, top + 0.003, gz0 + 0.012, gz1 - 0.012, "CS_FeltZero")
    frame_strips(M, gx0 - 0.19, gx1 + 0.02, gz0 - 0.02, gz1 + 0.02, 0.018, top, top + 0.004, "CS_FeltGold")
    for k, (dx, dz, mat, n) in enumerate(((0.3, 0.25, "CS_Red", 4), (0.62, 0.18, "CS_Black", 3), (0.95, -0.3, "CS_Ivory", 5), (1.3, 0.3, "CS_Red", 2))):
        for j in range(n):
            lathe(M, r["x"] + dx - 0.6, r["z"] + dz, [(0, 0), (0.045, 0), (0.045, 0.014), (0, 0.014)], mat if j % 2 == 0 else "CS_Ivory", segs=10, y0=top + j * 0.015)
    wx, _, wz = wheel_centre(L)
    lathe(M, wx, wz, [(0, top - 0.004), (WHEEL_R + 0.05, top - 0.004), (WHEEL_R + 0.05, top + 0.01), (0, top + 0.01)], "CS_Gold", segs=32)
    jx, jz = L["tipJars"]["vivienne"]
    tip_jar(M, jx, jz, top)


def build_wheel(L):
    """The roulette wheel on its own: its origin at its centre, the game spins it."""
    M = Mesh()
    wx, wy, wz = wheel_centre(L)
    y = wy + 0.01
    lathe(M, wx, wz, [(0, 0), (WHEEL_R, 0), (WHEEL_R, 0.07), (WHEEL_R - 0.05, 0.085), (WHEEL_R - 0.09, 0.06), (0, 0.06)], "CS_Mahogany", segs=36, y0=y)
    n = len(WHEEL_ORDER)
    for k, num in enumerate(WHEEL_ORDER):
        a0 = 2 * math.pi * k / n + 0.004
        a1 = 2 * math.pi * (k + 1) / n - 0.004
        mat = "CS_Felt" if num == 0 else "CS_Red" if num in RED_NUMBERS else "CS_Black"
        pts = [(wx + 0.22 * math.cos(a0), wz + 0.22 * math.sin(a0)), (wx + 0.34 * math.cos(a0), wz + 0.34 * math.sin(a0)), (wx + 0.34 * math.cos(a1), wz + 0.34 * math.sin(a1)), (wx + 0.22 * math.cos(a1), wz + 0.22 * math.sin(a1))]
        slab(M, pts, y + 0.06, y + 0.068, mat)
    lathe(M, wx, wz, [(0, 0.06), (0.22, 0.06), (0.14, 0.1), (0.06, 0.15), (0.025, 0.24), (0, 0.27)], "CS_Gold", segs=20, y0=y)
    for k in range(4):
        a = math.pi * k / 2
        cylinder(M, (wx, y + 0.2, wz), (wx + 0.13 * math.cos(a), y + 0.2, wz + 0.13 * math.sin(a)), 0.012, "CS_Gold", sides=6)
        blob(M, wx + 0.13 * math.cos(a), y + 0.2, wz + 0.13 * math.sin(a), 0.018, 0.018, 0.018, "CS_Gold", cuts=1)
    blob(M, wx + 0.3, y + 0.085, wz, 0.018, 0.018, 0.018, "CS_Ivory", cuts=2)
    return M, (wx, y, wz)


DIE = 0.09
PIPS = {1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)], 4: [(-1, -1), (-1, 1), (1, -1), (1, 1)], 5: [(-1, -1), (-1, 1), (1, -1), (1, 1), (0, 0)], 6: [(-1, -1), (-1, 0), (-1, 1), (1, -1), (1, 0), (1, 1)]}
# which face shows which number (the game turns a die to show its roll from this): +y 1, -y 6,
# +x 3, -x 4, +z 2, -z 5
DIE_FACES = {1: ((0, 1, 0), (1, 0, 0), (0, 0, 1)), 6: ((0, -1, 0), (1, 0, 0), (0, 0, 1)), 3: ((1, 0, 0), (0, 1, 0), (0, 0, 1)), 4: ((-1, 0, 0), (0, 1, 0), (0, 0, 1)), 2: ((0, 0, 1), (1, 0, 0), (0, 1, 0)), 5: ((0, 0, -1), (1, 0, 0), (0, 1, 0))}


def die_mesh(cx, cy, cz):
    D = Mesh()
    blob(D, cx, cy, cz, DIE / 2, DIE / 2, DIE / 2, "CS_DieRed", cuts=3, n=5.0)
    h = DIE / 2
    for num, (nrm, t1, t2) in DIE_FACES.items():
        for u, v in PIPS[num]:
            px = cx + nrm[0] * h + (t1[0] * u + t2[0] * v) * 0.022
            py = cy + nrm[1] * h + (t1[1] * u + t2[1] * v) * 0.022
            pz = cz + nrm[2] * h + (t1[2] * u + t2[2] * v) * 0.022
            blob(D, px, py, pz, 0.009 if nrm[0] == 0 else 0.004, 0.009 if nrm[1] == 0 else 0.004, 0.009 if nrm[2] == 0 else 0.004, "CS_Pip", cuts=1)
    return D


def build_craps(M, L, nodes):
    """The craps table: a mahogany tub on two pedestals, a black padded rail, the felt bed laid out
    (the pass line, don't pass, come, the field, the centre bets), the stick on the rail, chips in
    the rail's groove, and the two dice (nodes: the game rolls them)."""
    c = L["craps"]
    x, z = c["x"], c["z"]
    hl, hw = c["len"] / 2, c["w"] / 2
    top, felt = c["top"], c["felt"]
    x0, x1, z0, z1 = x - hl, x + hl, z - hw, z + hw
    for sx in (-1, 1):
        lathe(M, x + sx * 0.95, z, [(0, 0), (0.36, 0), (0.36, 0.05), (0.14, 0.12), (0.12, felt - 0.14), (0.3, felt - 0.07), (0, felt - 0.07)], "CS_Mahogany", segs=16)
        lathe(M, x + sx * 0.95, z, [(0, 0.05), (0.365, 0.05), (0.365, 0.07), (0, 0.07)], "CS_Gold", segs=16)
    outer = rounded_rect(x0, x1, z0, z1, 0.55, 10)
    inner = rounded_rect(x0 + 0.16, x1 - 0.16, z0 + 0.16, z1 - 0.16, 0.4, 10)
    slab(M, outer, felt - 0.07, felt - 0.006, "CS_Mahogany")
    slab(M, inner, felt - 0.006, felt, "CS_Felt")
    band(M, outer, inner, felt, top - 0.06, "CS_Mahogany")
    band(M, outer, inner, top - 0.06, top, "CS_Black")
    rim = rounded_rect(x0 - 0.012, x1 + 0.012, z0 - 0.012, z1 + 0.012, 0.56, 10)
    band(M, rim, outer, top - 0.085, top - 0.06, "CS_Gold")
    # the felt's layout (in markings over the bed)
    fx0, fx1, fz0, fz1 = x0 + 0.3, x1 - 0.3, z0 + 0.28, z1 - 0.28
    frame_strips(M, fx0, fx1, fz0, fz1, 0.02, felt, felt + 0.003, "CS_FeltLine")
    frame_strips(M, fx0 + 0.12, fx1 - 0.12, fz0 + 0.12, fz1 - 0.12, 0.015, felt, felt + 0.003, "CS_FeltLine")
    box(M, x - 0.45, x + 0.45, felt, felt + 0.003, fz0 + 0.2, fz0 + 0.48, "CS_FeltGold")  # the field
    box(M, x - 0.44, x + 0.44, felt + 0.003, felt + 0.004, fz0 + 0.21, fz0 + 0.47, "CS_FeltZero")
    for k in range(7):
        box(M, x - 0.4 + k * 0.13, x - 0.35 + k * 0.13, felt + 0.004, felt + 0.005, fz0 + 0.3, fz0 + 0.38, "CS_Card")
    for sx in (-1, 1):
        box(M, x + sx * 0.75 - 0.28, x + sx * 0.75 + 0.28, felt, felt + 0.003, fz1 - 0.42, fz1 - 0.2, "CS_FeltRed")  # come / don't come
        box(M, x + sx * 0.75 - 0.25, x + sx * 0.75 + 0.25, felt + 0.003, felt + 0.004, fz1 - 0.39, fz1 - 0.23, "CS_Felt")
    box(M, x - 0.18, x + 0.18, felt, felt + 0.003, fz1 - 0.44, fz1 - 0.2, "CS_FeltBlack")  # the centre bets
    for k in range(4):
        box(M, x - 0.15 + k * 0.08, x - 0.1 + k * 0.08, felt + 0.003, felt + 0.004, fz1 - 0.4, fz1 - 0.24, "CS_FeltRed")
    # the stick along the near rail, chips in the rail's groove
    cylinder(M, (x - 1.2, top + 0.012, z1 - 0.07), (x + 0.4, top + 0.012, z1 - 0.07), 0.01, "CS_MahoganyDark", sides=6)
    cylinder(M, (x + 0.4, top + 0.012, z1 - 0.07), (x + 0.5, top + 0.012, z1 - 0.12), 0.012, "CS_MahoganyDark", sides=6)
    for k, mat in enumerate(("CS_Red", "CS_Black", "CS_Ivory", "CS_Red", "CS_Coin", "CS_Black")):
        lathe(M, x - 0.9 + k * 0.12, z0 + 0.07, [(0, 0), (0.035, 0), (0.035, 0.03), (0, 0.03)], mat, segs=10, y0=top)
    # the dice
    for k, (dx, dz) in enumerate(((-0.12, 0.08), (0.06, -0.04))):
        px, py, pz = x + dx, felt + DIE / 2, z + dz
        nodes.append({"name": f"Prop_CrapsDie{k + 1}", "mesh": die_mesh(px, py, pz), "origin": (px, py, pz), "force": "CS_Sheen"})


def stool(M, x, z, seat_top):
    """A velvet bar stool: a brass foot, post and foot ring, a round tufted seat."""
    lathe(M, x, z, [(0, 0), (0.17, 0), (0.16, 0.03), (0, 0.035)], "CS_Brass", segs=14)
    cylinder(M, (x, 0.03, z), (x, seat_top - 0.07, z), 0.028, "CS_Brass", sides=8)
    ring = 8
    for k in range(ring):
        a0, a1 = 2 * math.pi * k / ring, 2 * math.pi * (k + 1) / ring
        cylinder(M, (x + 0.14 * math.cos(a0), 0.2, z + 0.14 * math.sin(a0)), (x + 0.14 * math.cos(a1), 0.2, z + 0.14 * math.sin(a1)), 0.012, "CS_Brass", sides=6)
    lathe(M, x, z, [(0, seat_top - 0.07), (0.19, seat_top - 0.07), (0.21, seat_top - 0.035), (0.19, seat_top), (0, seat_top)], "CS_Velvet", segs=16)
    lathe(M, x, z, [(0, seat_top - 0.08), (0.2, seat_top - 0.08), (0.2, seat_top - 0.065), (0, seat_top - 0.065)], "CS_Gold", segs=16)


def build_blackjack(M, L, cushions):
    """Three half-moon tables in a crescent round the pit boss's podium, each turned to face out of
    it (its dealer's flat side toward the podium), four stools round each curve, a gold arc on the
    floor behind them."""
    b = L["blackjack"]
    r = b["r"]
    top = b["top"]
    seat = cushions["barStool"]["top"]
    ccx, ccz = b["centre"]
    for deg in b["angles"]:
        a = math.radians(deg)
        out = (-math.cos(a), math.sin(a))
        tx, tz = ccx + out[0] * b["radius"], ccz + out[1] * b["radius"]
        yaw = math.atan2(out[0], out[1])
        c, s = math.cos(yaw), math.sin(yaw)

        def P(lx, lz):
            return (tx + lx * c + lz * s, tz - lx * s + lz * c)

        def arc(rad, n=24, a0=-90.0, a1=90.0):
            return [P(rad * math.sin(math.radians(a0 + (a1 - a0) * k / n)), rad * math.cos(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]

        for sx in (-1, 1):
            px, pz = P(sx * 0.45, 0.35)
            lathe(M, px, pz, [(0, 0), (0.24, 0), (0.24, 0.04), (0.08, 0.1), (0.07, top - 0.16), (0.2, top - 0.1), (0, top - 0.1)], "CS_Mahogany", segs=14)
        slab(M, arc(r), top - 0.1, top - 0.02, "CS_Mahogany")
        slab(M, arc(r - 0.12), top - 0.02, top, "CS_Felt")
        band(M, arc(r + 0.02), arc(r - 0.12), top - 0.02, top + 0.05, "CS_Velvet", closed=False)
        obox(M, tx, tz, yaw, -0.02, 0.08, -r, r, top - 0.02, top + 0.03, "CS_Mahogany")
        band(M, arc(0.64), arc(0.62), top, top + 0.003, "CS_FeltGold", closed=False)
        band(M, arc(0.44), arc(0.43), top, top + 0.003, "CS_FeltGold", closed=False)
        obox(M, tx, tz, yaw, 0.1, 0.24, -0.34, 0.34, top, top + 0.03, "CS_Black")
        for k, mat in enumerate(("CS_Red", "CS_Ivory", "CS_Gold", "CS_Black", "CS_Red", "CS_Ivory")):
            obox(M, tx, tz, yaw, 0.12, 0.22, -0.3 + k * 0.1, -0.22 + k * 0.1, top + 0.03, top + 0.045, mat)
        obox(M, tx, tz, yaw, 0.1, 0.26, 0.5, 0.72, top, top + 0.09, "CS_MahoganyDark")
        for d2 in (-35, 25):
            px, pz = P(0.8 * math.sin(math.radians(d2)), 0.8 * math.cos(math.radians(d2)))
            obox(M, px, pz, yaw + math.radians(d2), -0.07, 0.07, -0.05, 0.05, top, top + 0.004, "CS_Card")
        for d2 in b["stoolAngles"]:
            hh = yaw + math.radians(d2)
            stool(M, tx + b["stoolR"] * math.sin(hh), tz + b["stoolR"] * math.cos(hh), seat)
        # the gold floor trim behind the stools
        band(M, arc(2.24, 40, -78, 78), arc(2.18, 40, -78, 78), 0.0, INLAY, "CS_Inlay", closed=False)
    # the pit boss's podium
    lathe(M, ccx, ccz, [(0, 0), (0.3, 0), (0.3, 0.05), (0.13, 0.1), (0.1, 0.86), (0.2, 0.9), (0, 0.9)], "CS_Mahogany", segs=16)
    lathe(M, ccx, ccz, [(0, 0.05), (0.305, 0.05), (0.305, 0.075), (0, 0.075)], "CS_Gold", segs=16)
    box(M, ccx - 0.22, ccx + 0.22, 0.9, 0.95, ccz - 0.16, ccz + 0.16, "CS_Mahogany")
    box(M, ccx - 0.225, ccx + 0.225, 0.95, 0.965, ccz - 0.165, ccz + 0.165, "CS_Gold")
    box(M, ccx - 0.12, ccx + 0.04, 0.965, 0.99, ccz - 0.1, ccz + 0.08, "CS_Red")  # the ledger
    lathe(M, ccx + 0.12, ccz + 0.06, [(0, 0), (0.05, 0), (0.05, 0.012), (0.012, 0.02), (0, 0.02)], "CS_Brass", segs=10, y0=0.965)
    cylinder(M, (ccx + 0.12, 0.985, ccz + 0.06), (ccx + 0.12, 1.12, ccz + 0.06), 0.008, "CS_Brass", sides=6)
    obox(M, ccx + 0.12, ccz + 0.06, 0.0, -0.05, 0.05, -0.09, 0.09, 1.12, 1.16, "CS_Felt")
    obox(M, ccx + 0.12, ccz + 0.06, 0.0, -0.04, 0.04, -0.07, 0.07, 1.105, 1.12, "CS_Bulb")


# ---------------------------------------------------------------------------------------------
# 3 Neon Alley: the slot machines and the neon over them, the Turf Club, the coin pusher


def slot_machine(M, L, z, k, jasper=False):
    s = L["slots"]
    X0, X1 = s["x"] - s["d"] / 2, s["x"] + s["d"] / 2
    hw = s["w"] / 2
    H = s["h"]
    body = "CS_Gold" if jasper else "CS_SlotBody"
    neon = "CS_NeonCyan" if (k % 2 == 0) != jasper else "CS_NeonPink"
    box(M, X0, X1, 0.0, 0.8, z - hw + 0.02, z + hw - 0.02, body)
    box(M, X0, X1 + 0.02, 0.0, 0.06, z - hw + 0.01, z + hw - 0.01, "CS_Black")
    box(M, X0, X1 + 0.02, 0.8, 0.86, z - hw, z + hw, "CS_Chrome")
    box(M, X1 - 0.05, X1 + 0.1, 0.3, 0.36, z - 0.2, z + 0.2, "CS_Chrome")
    box(M, X0, X1 - 0.15, 0.86, H - 0.2, z - hw + 0.05, z + hw - 0.05, body)
    box(M, X1 - 0.17, X1 - 0.14, 1.02, 1.36, z - 0.3, z + 0.3, "CS_SlotScreen")
    for dz in (-0.1, 0.1):
        box(M, X1 - 0.14, X1 - 0.13, 1.02, 1.36, z + dz - 0.012, z + dz + 0.012, "CS_Black")
    frame = [(1.0, 1.02, -0.32, 0.32), (1.36, 1.38, -0.32, 0.32), (1.02, 1.36, -0.32, -0.3), (1.02, 1.36, 0.3, 0.32)]
    for y0, y1, a, b in frame:
        box(M, X1 - 0.15, X1 - 0.12, y0, y1, z + a, z + b, "CS_Chrome")
    box(M, X1 - 0.15, X1 + 0.06, 0.86, 0.93, z - 0.36, z + 0.36, "CS_Black")
    for j, mat in enumerate(("CS_Red", "CS_Gold", "CS_Red")):
        box(M, X1 - 0.08, X1 + 0.0, 0.93, 0.95, z - 0.2 + j * 0.2 - 0.04, z - 0.2 + j * 0.2 + 0.04, mat)
    box(M, X0, X1 - 0.1, H - 0.2, H - 0.03, z - hw, z + hw, body)
    for y in (H - 0.16, H - 0.09):
        box(M, X1 - 0.1, X1 - 0.08, y - 0.015, y + 0.015, z - hw + 0.06, z + hw - 0.06, neon)
    box(M, X0, X1 - 0.08, H - 0.03, H, z - hw - 0.01, z + hw + 0.01, "CS_Chrome")
    if jasper:
        cylinder(M, (X1 + 0.02, 0.95, z + hw + 0.03), (X1 + 0.12, 1.3, z + hw + 0.08), 0.018, "CS_Chrome", sides=8)
        blob(M, X1 + 0.12, 1.34, z + hw + 0.08, 0.05, 0.05, 0.05, "CS_Red", cuts=2)
    else:
        cylinder(M, (X1 - 0.3, 0.95, z + hw + 0.02), (X1 - 0.28, 1.4, z + hw + 0.07), 0.018, "CS_Chrome", sides=8)
        blob(M, X1 - 0.28, 1.44, z + hw + 0.07, 0.05, 0.05, 0.05, "CS_Red", cuts=2)


def build_alley(M, L):
    s = L["slots"]
    for k, z in enumerate(s["zs"]):
        slot_machine(M, L, z, k)
    slot_machine(M, L, s["jasper"], 0, jasper=True)
    face_x = wall_face(L)
    xa = face_x + 0.05
    z0, z1 = s["zs"][0] - s["w"] / 2, s["jasper"] + s["w"] / 2
    for y in (2.52, 2.98):
        cylinder(M, (xa, y, z0), (xa, y, z1), 0.022, "CS_NeonCyan", sides=8)
    n = int((z1 - z0) / 0.3)
    pts = [(z0 + (z1 - z0) * k / n, 2.62 if k % 2 == 0 else 2.88) for k in range(n + 1)]
    for (za, ya), (zb, yb) in zip(pts, pts[1:]):
        cylinder(M, (xa, ya, za), (xa, yb, zb), 0.022, "CS_NeonPink", sides=8)
    for z in (z0, z1):
        box(M, face_x, face_x + 0.08, 2.46, 3.04, z - 0.03, z + 0.03, "CS_Gold")


def horse_mesh(hx, hy, hz):
    """One of the Turf Club's horses and its rider, a tin figurine on a brass peg, facing +z (the
    silks and the coat are pale: the game tints each of the five)."""
    H = Mesh()
    lathe(H, hx, hz, [(0, 0), (0.028, 0), (0.028, 0.006), (0, 0.006)], "CS_Brass", segs=10, y0=hy)
    cylinder(H, (hx, hy + 0.006, hz), (hx, hy + 0.03, hz), 0.004, "CS_Brass", sides=5)
    blob(H, hx, hy + 0.058, hz, 0.024, 0.024, 0.05, "CS_HorseCoat", cuts=2)
    cylinder(H, (hx, hy + 0.066, hz + 0.038), (hx, hy + 0.09, hz + 0.058), 0.012, "CS_HorseCoat", sides=6)
    blob(H, hx, hy + 0.094, hz + 0.07, 0.012, 0.013, 0.024, "CS_HorseCoat", cuts=1)
    for sx in (-1, 1):
        for sz, lean in ((0.03, 0.02), (-0.03, -0.018)):
            cylinder(H, (hx + sx * 0.012, hy + 0.05, hz + sz), (hx + sx * 0.012, hy + 0.012, hz + sz + lean), 0.006, "CS_HorseDark", sides=5)
    blob(H, hx, hy + 0.07, hz - 0.052, 0.008, 0.02, 0.012, "CS_HorseDark", cuts=1)
    blob(H, hx, hy + 0.1, hz + 0.004, 0.014, 0.02, 0.014, "CS_Silk", cuts=1)
    blob(H, hx, hy + 0.125, hz + 0.01, 0.01, 0.01, 0.01, "CS_Silk", cuts=1)
    return H


def build_derby(M, L, nodes):
    """The Mechanical Turf Club: a mahogany race table along the alley, five lanes of green baize
    under a gold rail, a chequered finish at the far end, a little tote board at the start."""
    d = L["derby"]
    x, z = d["x"], d["z"]
    hl, hw = d["len"] / 2, d["w"] / 2
    top = d["top"]
    x0, x1, z0, z1 = x - hw, x + hw, z - hl, z + hl
    bed = top - 0.06
    box(M, x0 + 0.05, x1 - 0.05, 0.0, 0.08, z0 + 0.05, z1 - 0.05, "CS_Black")
    box(M, x0 + 0.04, x1 - 0.04, 0.08, top - 0.12, z0 + 0.04, z1 - 0.04, "CS_Mahogany")
    for zz in (z0 + 0.2, z1 - 0.2):
        box(M, x1 - 0.04, x1 - 0.03, 0.16, top - 0.2, zz - 0.012, zz + 0.012, "CS_Gold")
    box(M, x1 - 0.04, x1 - 0.03, top - 0.2, top - 0.18, z0 + 0.2, z1 - 0.2, "CS_Gold")
    box(M, x0, x1, top - 0.12, bed - 0.006, z0, z1, "CS_Mahogany")
    box(M, x0 + 0.08, x1 - 0.08, bed - 0.006, bed, z0 + 0.08, z1 - 0.08, "CS_Leaf")
    lanes = 5
    lw = (x1 - x0 - 0.16) / lanes
    for k in range(1, lanes):
        lx = x0 + 0.08 + k * lw
        box(M, lx - 0.006, lx + 0.006, bed, bed + 0.003, z0 + 0.1, z1 - 0.1, "CS_FeltLine")
    for k in range(10):
        for j in range(2):
            box(M, x0 + 0.08 + k * (x1 - x0 - 0.16) / 10, x0 + 0.08 + (k + 1) * (x1 - x0 - 0.16) / 10, bed, bed + 0.003, z1 - 0.2 + j * 0.03, z1 - 0.17 + j * 0.03, "CS_FeltLine" if (k + j) % 2 == 0 else "CS_FeltBlack")
    for a, b, c_, e in ((x0, x1, z0, z0 + 0.08), (x0, x1, z1 - 0.08, z1), (x0, x0 + 0.08, z0 + 0.08, z1 - 0.08), (x1 - 0.08, x1, z0 + 0.08, z1 - 0.08)):
        box(M, a, b, bed - 0.006, top, c_, e, "CS_Mahogany")
    for a, b, c_, e in ((x0 - 0.01, x1 + 0.01, z0 - 0.01, z0 + 0.03), (x0 - 0.01, x1 + 0.01, z1 - 0.03, z1 + 0.01), (x0 - 0.01, x0 + 0.03, z0 + 0.03, z1 - 0.03), (x1 - 0.03, x1 + 0.01, z0 + 0.03, z1 - 0.03)):
        box(M, a, b, top, top + 0.025, c_, e, "CS_Gold")
    # the tote board at the start
    box(M, x - 0.28, x + 0.28, top + 0.025, top + 0.05, z0 + 0.01, z0 + 0.07, "CS_Gold")
    box(M, x - 0.25, x + 0.25, top + 0.05, top + 0.28, z0 + 0.02, z0 + 0.06, "CS_Black")
    box(M, x - 0.22, x + 0.22, top + 0.08, top + 0.25, z0 + 0.06, z0 + 0.065, "CS_SlotScreen")
    for k in range(6):
        blob(M, x - 0.22 + k * 0.088, top + 0.3, z0 + 0.04, 0.014, 0.014, 0.014, "CS_Bulb", cuts=1)
    # the horse (the game races five of it, one per lane)
    hx, hy, hz = x0 + 0.08 + lw / 2, bed, z0 + 0.25
    nodes.append({"name": "Prop_DerbyHorse", "mesh": horse_mesh(hx, hy, hz), "origin": (hx, hy, hz), "force": "CS_Clay"})


def build_pusher(M, L, nodes):
    """The coin pusher, facing the room (+x): a red and gold cabinet, its playfield open behind gold
    posts (a mirrored back, two chrome shelves heaped with coins), a lit marquee on top, a coin tray
    at the front; the pushing plate is a node of its own (the game slides it)."""
    p = L["pusher"]
    x, z = p["x"], p["z"]
    hd, hw, H = p["d"] / 2, p["w"] / 2, p["h"]
    x0, x1, z0, z1 = x - hd, x + hd, z - hw, z + hw
    body = "CS_SlotBody"
    box(M, x0, x1, 0.0, 0.06, z0, z1, "CS_Black")
    box(M, x0, x1 - 0.02, 0.06, 0.62, z0, z1, body)
    for a, b, c_, e in ((0.12, 0.15, z0 + 0.08, z1 - 0.08), (0.52, 0.55, z0 + 0.08, z1 - 0.08), (0.15, 0.52, z0 + 0.08, z0 + 0.11), (0.15, 0.52, z1 - 0.11, z1 - 0.08)):
        box(M, x1 - 0.025, x1 - 0.01, a, b, c_, e, "CS_Gold")
    box(M, x1 - 0.02, x1 + 0.14, 0.3, 0.36, z - 0.25, z + 0.25, "CS_Chrome")
    box(M, x1 + 0.12, x1 + 0.15, 0.36, 0.42, z - 0.25, z + 0.25, "CS_Chrome")
    for k in range(5):
        lathe(M, x1 + 0.05 + (k % 2) * 0.03, z - 0.15 + k * 0.07, [(0, 0), (0.03, 0), (0.03, 0.008), (0, 0.008)], "CS_Coin", segs=10, y0=0.36)
    box(M, x0, x1, 0.62, 1.45, z0, z0 + 0.06, body)
    box(M, x0, x1, 0.62, 1.45, z1 - 0.06, z1, body)
    box(M, x0, x0 + 0.06, 0.62, 1.45, z0 + 0.06, z1 - 0.06, "CS_Mirror")
    box(M, x0 + 0.06, x1 - 0.02, 0.62, 0.7, z0 + 0.06, z1 - 0.06, "CS_Chrome")
    box(M, x0 + 0.06, x1 - 0.28, 0.9, 0.95, z0 + 0.06, z1 - 0.06, "CS_Chrome")
    rng = 0
    for shelf_y, xa, xb in ((0.7, x0 + 0.38, x1 - 0.06), (0.95, x0 + 0.1, x1 - 0.3)):
        for k in range(26):
            rng = (rng * 1103515245 + 12345) % 2147483648
            u = (rng % 1000) / 1000
            rng = (rng * 1103515245 + 12345) % 2147483648
            v = (rng % 1000) / 1000
            cxk = xa + (xb - xa) * u
            czk = z0 + 0.1 + (z1 - z0 - 0.2) * v
            lathe(M, cxk, czk, [(0, 0), (0.03, 0), (0.03, 0.008), (0, 0.008)], "CS_Coin", segs=10, y0=shelf_y + (k % 3) * 0.008)
    for zz in (z0 + 0.03, z1 - 0.03):
        box(M, x1 - 0.05, x1, 0.62, 1.45, zz - 0.03, zz + 0.03, "CS_Gold")
    box(M, x1 - 0.05, x1, 1.38, 1.45, z0, z1, "CS_Gold")
    # the marquee
    box(M, x0, x1, 1.45, H - 0.08, z0, z1, body)
    box(M, x1 - 0.01, x1 + 0.01, 1.5, H - 0.13, z0 + 0.06, z1 - 0.06, "CS_Black")
    for k in range(7):
        blob(M, x1 + 0.015, 1.53, z0 + 0.1 + k * (z1 - z0 - 0.2) / 6, 0.018, 0.018, 0.018, "CS_Bulb", cuts=1)
        blob(M, x1 + 0.015, H - 0.16, z0 + 0.1 + k * (z1 - z0 - 0.2) / 6, 0.018, 0.018, 0.018, "CS_Bulb", cuts=1)
    cylinder(M, (x1 + 0.02, (1.53 + H - 0.16) / 2, z0 + 0.12), (x1 + 0.02, (1.53 + H - 0.16) / 2, z1 - 0.12), 0.016, "CS_NeonPink", sides=8)
    box(M, x0 - 0.01, x1 + 0.01, H - 0.08, H, z0 - 0.01, z1 + 0.01, "CS_Gold")
    # the plate
    P = Mesh()
    box(P, x0 + 0.06, x0 + 0.36, 0.7, 0.8, z0 + 0.07, z1 - 0.07, "CS_Chrome")
    box(P, x0 + 0.34, x0 + 0.36, 0.7, 0.8, z0 + 0.07, z1 - 0.07, "CS_ChromeDark")
    nodes.append({"name": "Prop_PusherPlate", "mesh": P, "origin": (x0 + 0.21, 0.7, z), "force": "CS_Sheen"})


# ---------------------------------------------------------------------------------------------
# 4 the High-Roller Pit (built on the pit): the poker table, its chairs, the velvet ropes


def chair(M, x, z, yaw, seat_top):
    """A tufted velvet chair on mahogany legs, facing `yaw`, its back behind the sitter."""
    obox(M, x, z, yaw, -0.23, 0.23, -0.23, 0.23, seat_top - 0.12, seat_top - 0.06, "CS_Mahogany")
    obox(M, x, z, yaw, -0.22, 0.24, -0.22, 0.22, seat_top - 0.06, seat_top, "CS_Velvet")
    f = (math.sin(yaw), math.cos(yaw))
    r = (f[1], -f[0])
    for a, b in ((-0.19, -0.19), (-0.19, 0.19), (0.19, -0.19), (0.19, 0.19)):
        px, pz = x + f[0] * a + r[0] * b, z + f[1] * a + r[1] * b
        cylinder(M, (px, 0.0, pz), (px, seat_top - 0.12, pz), 0.025, "CS_Mahogany", sides=6)
    obox(M, x, z, yaw, -0.29, -0.21, -0.23, 0.23, seat_top - 0.06, seat_top + 0.52, "CS_Velvet")
    obox(M, x, z, yaw, -0.3, -0.2, -0.25, 0.25, seat_top + 0.52, seat_top + 0.57, "CS_Mahogany")
    for b in (-0.12, 0.0, 0.12):
        for up in (0.18, 0.36):
            px, pz = x + f[0] * -0.205 + r[0] * b, z + f[1] * -0.205 + r[1] * b
            blob(M, px, seat_top + up, pz, 0.012, 0.012, 0.012, "CS_Gold", cuts=1)


def build_pit(M, L, cushions):
    p = L["poker"]
    x, z = p["x"], p["z"]
    top = p["top"]
    outer = rounded_rect(x - p["len"] / 2, x + p["len"] / 2, z - p["w"] / 2, z + p["w"] / 2, p["w"] / 2, per_corner=10)
    inner = rounded_rect(x - p["len"] / 2 + 0.14, x + p["len"] / 2 - 0.14, z - p["w"] / 2 + 0.14, z + p["w"] / 2 - 0.14, p["w"] / 2 - 0.14, per_corner=10)
    for sx in (-1, 1):
        lathe(M, x + sx * 0.65, z, [(0, 0), (0.34, 0), (0.34, 0.05), (0.12, 0.12), (0.1, top - 0.14), (0.28, top - 0.08), (0, top - 0.08)], "CS_Mahogany", segs=16)
        lathe(M, x + sx * 0.65, z, [(0, 0.05), (0.345, 0.05), (0.345, 0.07), (0, 0.07)], "CS_Gold", segs=16)
    slab(M, outer, top - 0.08, top - 0.02, "CS_Mahogany")
    band(M, outer, inner, top - 0.02, top + 0.04, "CS_Velvet")
    slab(M, inner, top - 0.02, top, "CS_Felt")
    band(M, inner, rounded_rect(x - p["len"] / 2 + 0.16, x + p["len"] / 2 - 0.16, z - p["w"] / 2 + 0.16, z + p["w"] / 2 - 0.16, p["w"] / 2 - 0.16, per_corner=10), top, top + 0.003, "CS_FeltGold")
    seat = cushions["pokerChair"]["top"]
    for c in p["chairs"]:
        chair(M, c["x"], c["z"], c["yaw"], seat)
        px, pz = x + (c["x"] - x) * 0.45, z + (c["z"] - z) * 0.45
        for j in range(3):
            lathe(M, px, pz, [(0, 0), (0.045, 0), (0.045, 0.014), (0, 0.014)], ("CS_Red", "CS_Black", "CS_Ivory")[j], segs=10, y0=top + j * 0.015)
        obox(M, px + 0.12, pz, 0.3, -0.07, 0.07, -0.05, 0.05, top, top + 0.004, "CS_Card")
    box(M, x - 0.3, x + 0.3, top, top + 0.04, z - p["w"] / 2 + 0.18, z - p["w"] / 2 + 0.32, "CS_Black")
    for k, mat in enumerate(("CS_Red", "CS_Ivory", "CS_Gold", "CS_Black", "CS_Red")):
        box(M, x - 0.26 + k * 0.105, x - 0.18 + k * 0.105, top + 0.04, top + 0.055, z - p["w"] / 2 + 0.2, z - p["w"] / 2 + 0.3, mat)
    jx, jz = L["tipJars"]["boris"]
    tip_jar(M, jx, jz, top)
    for rope in L["ropes"]:
        (ax, az), (bx, bz) = rope["a"], rope["b"]
        n = max(1, round(math.hypot(bx - ax, bz - az) / 1.3))
        posts = [(ax + (bx - ax) * k / n, az + (bz - az) * k / n) for k in range(n + 1)]
        for px, pz in posts:
            lathe(M, px, pz, [(0, 0), (0.12, 0), (0.1, 0.04), (0, 0.045)], "CS_Brass", segs=12)
            cylinder(M, (px, 0.04, pz), (px, 0.9, pz), 0.03, "CS_Brass", sides=8)
            blob(M, px, 0.93, pz, 0.052, 0.052, 0.052, "CS_Brass", cuts=2)
        for (pa, qa), (pb, qb) in zip(posts, posts[1:]):
            seg = 8
            pts = [(pa + (pb - pa) * k / seg, 0.84 - 0.14 * 4 * (k / seg) * (1 - k / seg), qa + (qb - qa) * k / seg) for k in range(seg + 1)]
            for u, v in zip(pts, pts[1:]):
                cylinder(M, u, v, 0.028, "CS_Velvet", sides=8)
    build_vip_door(M, L)


# ---------------------------------------------------------------------------------------------
# 5 the Velvet Lounge & Jazz Bar (built on the lounge's dais)


def bottle(M, x, z, y0, kind):
    mats = ("CS_BottleGreen", "CS_BottleAmber", "CS_BottleRuby", "CS_Ivory")
    tall = 0.3 if kind % 3 else 0.24
    lathe(M, x, z, [(0, 0), (0.045, 0), (0.048, tall * 0.6), (0.02, tall * 0.8), (0.016, tall), (0, tall)], mats[kind % len(mats)], segs=8, y0=y0)


def club_chair(M, x, z, yaw, seat_top):
    """A velvet club chair facing `yaw`: a low body, a deep cushion, a round back, rolled arms."""
    obox(M, x, z, yaw, -0.3, 0.3, -0.34, 0.34, 0.0, 0.04, "CS_Gold")
    obox(M, x, z, yaw, -0.3, 0.3, -0.34, 0.34, 0.04, seat_top - 0.06, "CS_Velvet")
    obox(M, x, z, yaw, -0.18, 0.31, -0.26, 0.26, seat_top - 0.06, seat_top, "CS_Velvet")
    obox(M, x, z, yaw, -0.32, -0.16, -0.34, 0.34, seat_top - 0.06, seat_top + 0.44, "CS_Velvet")
    for side in (-1, 1):
        obox(M, x, z, yaw, -0.3, 0.31, side * 0.26 if side > 0 else -0.34, 0.34 if side > 0 else -0.26, seat_top - 0.06, seat_top + 0.17, "CS_Velvet")
        obox(M, x, z, yaw, -0.3, 0.31, side * 0.27 if side > 0 else -0.33, 0.33 if side > 0 else -0.27, seat_top + 0.17, seat_top + 0.185, "CS_Gold")


def build_bar(M, L, cushions):
    b = L["bar"]
    x0, x1, z0, z1 = b["x0"], b["x1"], b["z0"], b["z1"]
    top = b["top"]
    face_x = wall_face(L)
    box(M, face_x, face_x + 0.45, 0.0, 1.0, z0 + 0.05, z1 - 0.05, "CS_MahoganyDark")
    box(M, face_x, face_x + 0.5, 1.0, 1.04, z0 + 0.03, z1 - 0.03, "CS_MarbleLight")
    box(M, face_x, face_x + 0.02, 1.04, 2.6, z0 + 0.25, z1 - 0.25, "CS_Mirror")
    for zz in (z0 + 0.2, z1 - 0.2):
        box(M, face_x, face_x + 0.12, 1.04, 2.7, zz - 0.06, zz + 0.06, "CS_Gold")
    for y in (1.5, 2.0):
        box(M, face_x, face_x + 0.3, y, y + 0.03, z0 + 0.26, z1 - 0.26, "CS_Mahogany")
    box(M, face_x + 0.02, face_x + 0.04, 2.5, 2.54, z0 + 0.26, z1 - 0.26, "CS_Bulb")
    box(M, face_x, face_x + 0.14, 2.6, 2.7, z0 + 0.14, z1 - 0.14, "CS_Mahogany")
    zm = (z0 + z1) / 2
    for k, w in enumerate((1.6, 1.0, 0.5)):
        box(M, face_x, face_x + 0.12 - k * 0.02, 2.7 + k * 0.12, 2.82 + k * 0.12, zm - w / 2, zm + w / 2, "CS_Gold" if k != 1 else "CS_Mahogany")
    k = 0
    for y in (1.04, 1.53, 2.03):
        zz = z0 + 0.4
        while zz < z1 - 0.35:
            # the back counter's far end holds the espresso machine
            if (k * 7) % 5 != 0 and not (y == 1.04 and zz > z1 - 1.0):
                bottle(M, face_x + 0.16 + (0.1 if y == 1.04 else 0), zz, y, k)
            zz += 0.2
            k += 1
    # the espresso machine: chrome and brass, an eagle on its dome, two little cups
    ex, ez = face_x + 0.25, z1 - 0.65
    box(M, ex - 0.16, ex + 0.12, 1.04, 1.36, ez - 0.2, ez + 0.2, "CS_Chrome")
    box(M, ex - 0.17, ex + 0.13, 1.36, 1.39, ez - 0.21, ez + 0.21, "CS_Brass")
    lathe(M, ex - 0.02, ez, [(0, 1.39), (0.13, 1.39), (0.1, 1.46), (0.04, 1.5), (0, 1.51)], "CS_Brass", segs=14)
    blob(M, ex - 0.02, 1.55, ez, 0.03, 0.035, 0.05, "CS_Gold", cuts=1)
    for dz in (-0.09, 0.09):
        cylinder(M, (ex + 0.12, 1.26, ez + dz), (ex + 0.2, 1.26, ez + dz), 0.022, "CS_ChromeDark", sides=8)
        lathe(M, ex + 0.2, ez + dz, [(0, 0), (0.03, 0), (0.035, 0.045), (0, 0.045)], "CS_Ivory", segs=10, y0=1.04)
    box(M, ex + 0.12, ex + 0.26, 1.04, 1.06, ez - 0.16, ez + 0.16, "CS_ChromeDark")
    # Pippin's duckboard step behind the counter (its top is `floor`: his feet)
    fl = b["floor"]
    box(M, face_x + 0.45, x1 - 0.35, 0.0, fl - 0.02, z0 + 0.3, z1 - 0.3, "CS_MahoganyDark")
    zz = z0 + 0.35
    while zz < z1 - 0.35:
        box(M, face_x + 0.47, x1 - 0.37, fl - 0.02, fl, zz, min(zz + 0.12, z1 - 0.32), "CS_Mahogany")
        zz += 0.16
    box(M, x1 - 0.35, x1, 0.08, top - 0.04, z0, z1, "CS_Mahogany")
    box(M, x1 - 0.33, x1 - 0.02, 0.0, 0.08, z0 + 0.02, z1 - 0.02, "CS_Black")
    zz = z0 + 0.2
    while zz < z1 - 0.1:
        box(M, x1, x1 + 0.015, 0.14, top - 0.1, zz - 0.02, zz + 0.02, "CS_Gold")
        zz += 0.35
    box(M, x1 - 0.6, x1 + 0.08, top - 0.04, top, z0 - 0.05, z1 + 0.05, "CS_Mahogany")
    box(M, x1 + 0.08, x1 + 0.11, top - 0.045, top, z0 - 0.05, z1 + 0.05, "CS_Gold")
    for za, zb in ((z0, z0 + 0.3), (z1 - 0.3, z1)):
        box(M, face_x + 0.45, x1 - 0.35, 0.0, top - 0.04, za, zb, "CS_Mahogany")
        box(M, face_x + 0.45, x1 - 0.35, top - 0.04, top, za - 0.05 if za == z0 else za, zb + 0.05 if zb == z1 else zb, "CS_Mahogany")
    cylinder(M, (x1 + 0.1, 0.15, z0 + 0.1), (x1 + 0.1, 0.15, z1 - 0.1), 0.025, "CS_Brass", sides=10)
    zz = z0 + 0.4
    while zz < z1 - 0.2:
        cylinder(M, (x1, 0.15, zz), (x1 + 0.1, 0.15, zz), 0.015, "CS_Brass", sides=6)
        zz += 1.2
    lathe(M, x1 - 0.18, z0 + 1.2, [(0, 0), (0.045, 0), (0.05, 0.14), (0.03, 0.2), (0, 0.22)], "CS_Brass", segs=12, y0=top)
    for zz in (z0 + 2.3, z0 + 3.6, z0 + 4.9):
        lathe(M, x1 - 0.15, zz, [(0, 0), (0.035, 0), (0.01, 0.02), (0.01, 0.08), (0.05, 0.13), (0, 0.13)], "CS_Ivory", segs=10, y0=top)
    # Pippin's menu: a gold-framed card standing on the counter by him
    mz = 6.4
    box(M, x1 - 0.3, x1 - 0.22, top, top + 0.012, mz - 0.1, mz + 0.1, "CS_Gold")
    box(M, x1 - 0.27, x1 - 0.25, top + 0.012, top + 0.24, mz - 0.09, mz + 0.09, "CS_Gold")
    box(M, x1 - 0.25, x1 - 0.245, top + 0.03, top + 0.22, mz - 0.075, mz + 0.075, "CS_Paper")
    for k in range(3):
        box(M, x1 - 0.245, x1 - 0.242, top + 0.17 - k * 0.05, top + 0.18 - k * 0.05, mz - 0.05, mz + 0.05, "CS_Ink")
    seat = cushions["barStool"]["top"]
    for zz in b["stools"]:
        stool(M, b["stoolX"], zz, seat)


def build_cocktails(M, L, cushions):
    club = cushions["clubChair"]["top"]
    for t in L["cocktails"]:
        lathe(M, t["x"], t["z"], [(0, 0), (0.22, 0), (0.2, 0.03), (0.035, 0.06), (0.03, 0.5), (0.08, 0.52), (0, 0.52)], "CS_Brass", segs=14)
        lathe(M, t["x"], t["z"], [(0, 0.52), (0.3, 0.52), (0.3, 0.55), (0, 0.55)], "CS_MarbleLight", segs=20)
        lathe(M, t["x"], t["z"], [(0, 0.55), (0.04, 0.55), (0.02, 0.62), (0, 0.62)], "CS_Brass", segs=8)
        lathe(M, t["x"], t["z"], [(0, 0.62), (0.07, 0.62), (0.04, 0.7), (0, 0.7)], "CS_Bulb", segs=10)
        for side in (-1, 1):
            club_chair(M, t["x"] + side * 0.85, t["z"], math.pi / 2 if side < 0 else -math.pi / 2, club)


def build_piano(M, L, cushions):
    pn = L["piano"]
    px, pz = pn["x"], pn["z"]
    hl, hw = pn["len"] / 2, pn["w"] / 2
    shape = [(-1, -1), (1, -1), (1, -0.28), (0.8, 0.28), (0.47, 0.62), (0.0, 0.86), (-0.53, 1.0), (-1, 1.0)]
    outline = [(px + a * hl, pz + c * hw) for a, c in shape]
    slab(M, outline, 0.55, pn["top"] - 0.05, "CS_Black")
    slab(M, outline, pn["top"] - 0.05, pn["top"], "CS_Black")
    for a, c in ((-0.8, -0.7), (0.8, -0.7), (-0.4, 0.8)):
        lathe(M, px + a * hl, pz + c * hw, [(0, 0), (0.06, 0), (0.05, 0.05), (0.07, 0.5), (0, 0.55)], "CS_Black", segs=10)
    kz0, kz1 = pz - hw - 0.2, pz - hw
    box(M, px - hl + 0.08, px + hl - 0.08, 0.66, 0.72, kz0, kz1, "CS_Black")
    box(M, px - hl + 0.12, px + hl - 0.12, 0.72, 0.745, kz0 + 0.02, kz1, "CS_Ivory")
    nkeys = 22
    for j in range(nkeys):
        if j % 7 in (2, 6):
            continue
        kx = px - hl + 0.12 + (2 * hl - 0.24) * (j + 0.7) / nkeys
        box(M, kx - 0.012, kx + 0.012, 0.745, 0.765, kz0 + 0.1, kz1, "CS_Black")
    vslab(M, [(px - 0.35, pn["top"]), (px + 0.35, pn["top"]), (px + 0.35, pn["top"] + 0.28), (px - 0.35, pn["top"] + 0.28)], kz1 + 0.05, kz1 + 0.08, "CS_Black")
    box(M, px - 0.08, px + 0.08, 0.05, 0.55, kz1 + 0.1, kz1 + 0.14, "CS_Gold")
    bz = pn["bench"]
    btop = cushions["pianoBench"]["top"]
    box(M, px - 0.45, px + 0.45, btop - 0.06, btop, bz - 0.18, bz + 0.18, "CS_Velvet")
    box(M, px - 0.46, px + 0.46, btop - 0.1, btop - 0.06, bz - 0.19, bz + 0.19, "CS_Black")
    for a in (-0.4, 0.4):
        for c in (-0.14, 0.14):
            cylinder(M, (px + a, 0.0, bz + c), (px + a, btop - 0.1, bz + c), 0.025, "CS_Black", sides=6)


def build_billiards(M, L, nodes):
    """The billiards table under its brass lamp: turned mahogany legs, green baize, cushion rails
    with ivory sights, six pockets, the balls racked at the foot, a cue laid by, and the cue ball (a
    node: the game rolls it at a break)."""
    b = L["billiards"]
    x, z = b["x"], b["z"]
    hl, hw = b["len"] / 2, b["w"] / 2
    top = b["top"]
    x0, x1, z0, z1 = x - hl, x + hl, z - hw, z + hw
    for lx in (x0 + 0.22, x, x1 - 0.22):
        for lz in (z0 + 0.2, z1 - 0.2):
            lathe(M, lx, lz, [(0, 0), (0.09, 0), (0.08, 0.06), (0.05, 0.12), (0.075, 0.3), (0.06, 0.5), (0.08, top - 0.24), (0, top - 0.24)], "CS_Mahogany", segs=12)
            lathe(M, lx, lz, [(0, 0.1), (0.07, 0.1), (0.07, 0.125), (0, 0.125)], "CS_Gold", segs=12)
    felt = top - 0.04
    box(M, x0 + 0.08, x1 - 0.08, top - 0.25, top - 0.1, z0 + 0.08, z1 - 0.08, "CS_Mahogany")
    box(M, x0 + 0.08, x1 - 0.08, top - 0.26, top - 0.25, z0 + 0.08, z1 - 0.08, "CS_Gold")
    box(M, x0 + 0.14, x1 - 0.14, top - 0.1, felt, z0 + 0.14, z1 - 0.14, "CS_Felt")
    rails = ((x0, x1, z0, z0 + 0.14), (x0, x1, z1 - 0.14, z1), (x0, x0 + 0.14, z0 + 0.14, z1 - 0.14), (x1 - 0.14, x1, z0 + 0.14, z1 - 0.14))
    for a, bb, c, d in rails:
        box(M, a, bb, top - 0.1, top, c, d, "CS_Mahogany")
    for a, bb, c, d in ((x0 + 0.14, x1 - 0.14, z0 + 0.14, z0 + 0.18), (x0 + 0.14, x1 - 0.14, z1 - 0.18, z1 - 0.14), (x0 + 0.14, x0 + 0.18, z0 + 0.18, z1 - 0.18), (x1 - 0.18, x1 - 0.14, z0 + 0.18, z1 - 0.18)):
        box(M, a, bb, felt, top - 0.01, c, d, "CS_FeltDark")
    for k in range(1, 8):
        if k == 4:
            continue
        sx = x0 + 0.14 + (x1 - x0 - 0.28) * k / 8
        for zz in (z0 + 0.07, z1 - 0.07):
            blob(M, sx, top + 0.003, zz, 0.012, 0.004, 0.008, "CS_Ivory", cuts=1)
    for k in range(1, 4):
        sz = z0 + 0.14 + (z1 - z0 - 0.28) * k / 4
        for xx in (x0 + 0.07, x1 - 0.07):
            blob(M, xx, top + 0.003, sz, 0.008, 0.004, 0.012, "CS_Ivory", cuts=1)
    for px, pz in ((x0 + 0.15, z0 + 0.15), (x0 + 0.15, z1 - 0.15), (x1 - 0.15, z0 + 0.15), (x1 - 0.15, z1 - 0.15), (x, z0 + 0.12), (x, z1 - 0.12)):
        lathe(M, px, pz, [(0, felt - 0.02), (0.065, felt - 0.02), (0.07, top + 0.004), (0, top + 0.004)], "CS_Gold", segs=12)
        lathe(M, px, pz, [(0, felt - 0.019), (0.05, felt - 0.019), (0.05, top + 0.006), (0, top + 0.006)], "CS_Black", segs=12)
    # the rack of fifteen at the foot spot, the apex toward the head
    R = 0.028
    colours = ("CS_BallYellow", "CS_BallBlue", "CS_BallRed", "CS_BallPurple", "CS_BallOrange", "CS_BallGreen", "CS_BallMaroon", "CS_Black")
    fx = x1 - 0.62
    k = 0
    for row in range(5):
        for j in range(row + 1):
            bx = fx + row * R * 1.75
            bz = z + (j - row / 2) * R * 2.02
            blob(M, bx, felt + R, bz, R, R, R, "CS_Black" if (row, j) == (2, 1) else colours[k % 7], cuts=2)
            k += 1
    # a cue laid along the near rail
    cylinder(M, (x0 + 0.35, top + 0.012, z1 - 0.05), (x1 - 0.5, top + 0.009, z1 - 0.05), 0.013, "CS_MahoganyDark", sides=6, r_end=0.007)
    # the cue ball, at the head spot
    C = Mesh()
    hx = x0 + 0.62
    blob(C, hx, felt + R, z, R, R, R, "CS_Ivory", cuts=2)
    nodes.append({"name": "Prop_CueBall", "mesh": C, "origin": (hx, felt + R + LIFT[0], z), "force": "CS_Sheen"})
    # the lamp: a brass bar on two rods, three green glass shades with their bulbs
    ly = b["lamp"]
    cylinder(M, (x - 0.85, ly + 0.14, z), (x + 0.85, ly + 0.14, z), 0.022, "CS_Brass", sides=8)
    for sx in (-0.85, 0.85):
        blob(M, x + sx, ly + 0.14, z, 0.03, 0.03, 0.03, "CS_Brass", cuts=1)
        cylinder(M, (x + sx * 0.8, ly + 0.14, z), (x + sx * 0.8, 3.55 - LIFT[0], z), 0.008, "CS_Brass", sides=5)
        lathe(M, x + sx * 0.8, z, [(0, 3.55 - LIFT[0]), (0.06, 3.55 - LIFT[0]), (0.04, 3.59 - LIFT[0]), (0, 3.6 - LIFT[0])], "CS_Brass", segs=10)
    for sx in (-0.58, 0.0, 0.58):
        cylinder(M, (x + sx, ly + 0.14, z), (x + sx, ly + 0.08, z), 0.01, "CS_Brass", sides=6)
        lathe(M, x + sx, z, [(0, ly - 0.035), (0.16, ly - 0.05), (0.155, ly - 0.01), (0.06, ly + 0.07), (0, ly + 0.085)], "CS_ShadeGreen", segs=16)
        blob(M, x + sx, ly - 0.055, z, 0.05, 0.03, 0.05, "CS_Bulb", cuts=1)


def build_chesterfield(M, L, cushions):
    """The Chesterfield: oxblood leather deep-buttoned all over, rolled arms, bun feet; the coffee
    table in front of it with The Velvet Gazette (folded, the masthead up), a tumbler and a dish of
    mints."""
    s = L["sofa"]
    x, z = s["x"], s["z"]
    hl = s["len"] / 2
    seat_top = cushions["chesterfield"]["top"]
    front, back = x - 0.35, x + 0.45
    z0, z1 = z - hl, z + hl
    for fx in (front + 0.06, back - 0.06):
        for fz in (z0 + 0.06, z1 - 0.06):
            blob(M, fx, 0.035, fz, 0.035, 0.035, 0.035, "CS_Gold", cuts=1)
    box(M, front, back, 0.06, seat_top - 0.09, z0 + 0.02, z1 - 0.02, "CS_Leather")
    for zz in s["seats"]:
        blob(M, front + 0.2, seat_top - 0.045, zz, 0.21, 0.05, 0.29, "CS_Leather", cuts=3, n=3.2)
        for dz in (-0.12, 0.12):
            blob(M, front + 0.2, seat_top + 0.003, zz + dz, 0.012, 0.006, 0.012, "CS_LeatherDark", cuts=1)
    bx = x + 0.22
    box(M, bx, back, seat_top - 0.09, seat_top + 0.36, z0 + 0.02, z1 - 0.02, "CS_Leather")
    cylinder(M, (bx + 0.1, seat_top + 0.36, z0 + 0.02), (bx + 0.1, seat_top + 0.36, z1 - 0.02), 0.115, "CS_Leather", sides=12)
    for row in range(3):
        yy = seat_top + 0.08 + row * 0.1
        n = 10
        for k in range(n + 1):
            zz = z0 + 0.14 + (z1 - z0 - 0.28) * (k + (0.5 if row % 2 else 0)) / n
            if zz > z1 - 0.12:
                continue
            blob(M, bx - 0.002, yy, zz, 0.006, 0.014, 0.014, "CS_LeatherDark", cuts=1)
    for zz, sgn in ((z0, 1), (z1, -1)):
        za, zb = (zz - 0.02, zz + 0.14) if sgn > 0 else (zz - 0.14, zz + 0.02)
        box(M, front, back, seat_top - 0.09, seat_top + 0.16, za, zb, "CS_Leather")
        cylinder(M, (front - 0.02, seat_top + 0.16, (za + zb) / 2), (back, seat_top + 0.16, (za + zb) / 2), 0.1, "CS_Leather", sides=12)
        for k in range(8):
            blob(M, front - 0.012, seat_top - 0.05 + k * 0.03, (za + zb) / 2, 0.005, 0.005, 0.005, "CS_Brass", cuts=1)
    # the coffee table
    c = L["coffee"]
    cx, cz = c["x"], c["z"]
    top = c["top"]
    hw, hlc = c["w"] / 2, c["len"] / 2
    for lx in (cx - hw + 0.06, cx + hw - 0.06):
        for lz in (cz - hlc + 0.06, cz + hlc - 0.06):
            cylinder(M, (lx, 0.0, lz), (lx, top - 0.04, lz), 0.025, "CS_Mahogany", sides=8, r_end=0.02)
            blob(M, lx, 0.02, lz, 0.03, 0.02, 0.03, "CS_Gold", cuts=1)
    box(M, cx - hw + 0.03, cx + hw - 0.03, top - 0.1, top - 0.04, cz - hlc + 0.03, cz + hlc - 0.03, "CS_Mahogany")
    box(M, cx - hw, cx + hw, top - 0.04, top, cz - hlc, cz + hlc, "CS_MarbleLight")
    box(M, cx - hw - 0.008, cx + hw + 0.008, top - 0.05, top - 0.03, cz - hlc - 0.008, cz + hlc + 0.008, "CS_Gold")
    # The Velvet Gazette
    gx, gz, gy = cx + 0.03, cz - 0.12, top
    obox(M, gx, gz, 0.25, -0.13, 0.13, -0.18, 0.18, gy, gy + 0.018, "CS_Paper")
    obox(M, gx, gz, 0.25, 0.06, 0.12, -0.16, 0.16, gy + 0.018, gy + 0.02, "CS_FeltRed")
    for k in range(5):
        obox(M, gx, gz, 0.25, 0.02 - k * 0.03, 0.03 - k * 0.03, -0.15, 0.15 - (0.06 if k % 2 else 0.0), gy + 0.018, gy + 0.02, "CS_Ink")
    lathe(M, cx - 0.12, cz + 0.28, [(0, 0), (0.035, 0), (0.04, 0.08), (0, 0.08)], "CS_BottleAmber", segs=10, y0=top)
    lathe(M, cx + 0.1, cz + 0.3, [(0, 0), (0.07, 0), (0.08, 0.03), (0, 0.03)], "CS_Gold", segs=12, y0=top)
    for k in range(4):
        blob(M, cx + 0.1 + 0.03 * math.cos(k * 1.6), top + 0.035, cz + 0.3 + 0.03 * math.sin(k * 1.6), 0.018, 0.012, 0.018, "CS_CapWhite", cuts=1)


def build_lounge(M, L, cushions, nodes):
    build_bar(M, L, cushions)
    build_cocktails(M, L, cushions)
    build_piano(M, L, cushions)
    build_billiards(M, L, nodes)
    build_chesterfield(M, L, cushions)


# ---------------------------------------------------------------------------------------------
# the front rail (up on the lounge's dais and down its steps), the chandeliers


def build_rail(M, L):
    e = L["half"] - 0.1
    h = L["half"]
    lounge = stage(L, "lounge")
    ly = lounge["h"]
    x_top, x_foot = lounge["x1"], lounge["x1"] + lounge["depth"]
    runs = [
        [(e, L["cage"]["z1"] + 0.15, 0.0), (e, e, 0.0)],
        [(-h + 0.25, e, ly), (x_top, e, ly), (x_foot, e, 0.0), (e, e, 0.0)],
    ]
    for run in runs:
        for (ax, az, ay), (bx, bz, by) in zip(run, run[1:]):
            cylinder(M, (ax, ay + 0.34, az), (bx, by + 0.34, bz), 0.03, "CS_Brass", sides=10)
            n = max(1, round(math.hypot(bx - ax, bz - az) / 1.3))
            for k in range(n + 1):
                t = k / n
                px, pz, py = ax + (bx - ax) * t, az + (bz - az) * t, ay + (by - ay) * t
                cylinder(M, (px, floor_y(L, px, pz), pz), (px, py + 0.34, pz), 0.022, "CS_Brass", sides=8)


def build_chandeliers(M, L):
    for cx, cy, cz in L["chandeliers"]:
        lathe(M, cx, cz, [(0, 0), (0.14, 0), (0.12, 0.03), (0, 0.04)], "CS_Brass", segs=14, y0=cy + 1.0)
        cylinder(M, (cx, cy + 0.45, cz), (cx, cy + 1.0, cz), 0.015, "CS_Brass", sides=6)
        lathe(M, cx, cz, [(0, -0.18), (0.05, -0.12), (0.09, 0.05), (0.05, 0.22), (0.08, 0.35), (0.03, 0.45), (0, 0.46)], "CS_Brass", segs=12, y0=cy)
        for rad, y, n, drop in ((0.55, cy + 0.08, 16, 0.07), (0.34, cy - 0.12, 10, 0.05)):
            for k in range(n):
                a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
                cylinder(M, (cx + rad * math.cos(a0), y, cz + rad * math.sin(a0)), (cx + rad * math.cos(a1), y, cz + rad * math.sin(a1)), 0.016, "CS_Brass", sides=6)
                am = (a0 + a1) / 2
                blob(M, cx + rad * math.cos(am), y - drop, cz + rad * math.sin(am), 0.022, 0.04, 0.022, "CS_Crystal", cuts=1)
        for k in range(6):
            a = 2 * math.pi * k / 6
            cylinder(M, (cx, cy + 0.1, cz), (cx + 0.55 * math.cos(a), cy + 0.08, cz + 0.55 * math.sin(a)), 0.014, "CS_Brass", sides=6)
            cylinder(M, (cx + 0.55 * math.cos(a), cy + 0.08, cz + 0.55 * math.sin(a)), (cx + 0.55 * math.cos(a), cy + 0.2, cz + 0.55 * math.sin(a)), 0.02, "CS_Ivory", sides=6)
            blob(M, cx + 0.55 * math.cos(a), cy + 0.25, cz + 0.55 * math.sin(a), 0.03, 0.05, 0.03, "CS_Crystal", cuts=1)
        blob(M, cx, cy - 0.26, cz, 0.05, 0.09, 0.05, "CS_Crystal", cuts=2)


# ---------------------------------------------------------------------------------------------


def build(root):
    purge()
    L = read_layout(root)
    cushions = read_cushions(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    M = Mesh()
    nodes = []
    build_floor(M, L)
    build_dividers(M, L)
    build_stages(M, L)
    build_walls(M, L)
    build_marquee(M, L, nodes)
    for p in L["paintings"]:
        build_portrait(M, L, p)
    for p in L["mirrors"]:
        build_mirror(M, L, p)
    build_pillars(M, L)
    build_cage(M, L)
    build_foyer(M, L, cushions)
    build_zara(M, L, nodes)
    build_gachapon(M, L)
    build_roulette(M, L)
    build_craps(M, L, nodes)
    build_blackjack(M, L, cushions)
    build_alley(M, L)
    build_derby(M, L, nodes)
    build_pusher(M, L, nodes)
    with lifted(stage(L, "pit")["h"]):
        build_pit(M, L, cushions)
    with lifted(stage(L, "lounge")["h"]):
        build_lounge(M, L, cushions, nodes)
    build_rail(M, L)
    build_chandeliers(M, L)
    make_object("Casino_Static", M, coll)
    wheel, origin = build_wheel(L)
    make_object("Prop_RouletteWheel", wheel, coll, origin=origin, force="CS_Sheen")
    keyed = {}
    for n in nodes:
        parent = keyed.get(n.get("parent")) if n.get("parent") else None
        ob = make_object(n["name"], n["mesh"], coll, origin=n["origin"], force=n.get("force"), parent=parent, recalc=n.get("recalc", True), coloured=n.get("coloured", True))
        if n.get("key"):
            keyed[n["key"]] = ob
    return coll, L, cushions


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


def summary(coll, L, cushions):
    out = {}
    for o in coll.all_objects:
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": [m.name for m in o.data.materials]}
    return {
        "objects": out,
        "checks": {
            "drawCalls": sum(len(v["materials"]) for v in out.values()),
            "tris": sum(v["tris"] for v in out.values()),
            "seatTops": {k: v["top"] for k, v in cushions.items()},
        },
    }


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        coll, L, cushions = build(root)
        out = os.path.join(root, "client", "public", "models", "casino.glb")
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
